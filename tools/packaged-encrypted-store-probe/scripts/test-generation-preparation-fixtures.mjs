import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  GENERATION_PREPARATION_FAILPOINTS,
  assertGenerationPreparationFaultBoundaryRecord,
  createGenerationCandidateVerifiedRecord,
  createGenerationPreparationFaultBoundaryRecord,
  createGenerationPreparationIntent,
  getGenerationPreparationPaths,
  handoffPreparedGeneration,
  verifyGenerationPreparationState,
  writeGenerationCandidateVerifiedRecord,
  writeGenerationPreparationIntent,
} from "../app/recovery/generation-preparation.mjs";
import {
  GENERATION_PUBLICATION_IDS,
  GenerationPublicationError,
  createGenerationPublicationFixture,
  writeCanonicalGenerationFile,
} from "../app/recovery/generation-publication.mjs";

const root = fs.mkdtempSync(
  path.join(os.tmpdir(), "constellation-generation-preparation-"),
);
const SOURCE_BYTES = Buffer.from("encrypted-source-generation\n", "utf8");
const CANDIDATE_BYTES = Buffer.from(
  "encrypted-sealed-candidate-generation\n",
  "utf8",
);

function digest(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function digestFile(filename) {
  return digest(fs.readFileSync(filename));
}

function expectCode(callback, code) {
  assert.throws(
    callback,
    (error) =>
      error instanceof GenerationPublicationError && error.code === code,
  );
}

function snapshotTree(workspaceRoot) {
  const entries = [];
  function visit(target) {
    const relative = path.relative(workspaceRoot, target) || ".";
    const metadata = fs.lstatSync(target);
    if (metadata.isSymbolicLink()) {
      entries.push([relative, "symlink", fs.readlinkSync(target)]);
      return;
    }
    if (metadata.isDirectory()) {
      entries.push([relative, "directory"]);
      for (const name of fs.readdirSync(target).sort()) {
        visit(path.join(target, name));
      }
      return;
    }
    entries.push([relative, "file", metadata.size, digestFile(target)]);
  }
  visit(workspaceRoot);
  return JSON.stringify(entries);
}

function createPreparedWorkspace(slug) {
  const workspaceId = `workspace-handoff-${slug}`;
  const workspaceRoot = path.join(root, slug);
  const paths = getGenerationPreparationPaths(
    workspaceRoot,
    GENERATION_PUBLICATION_IDS.operationId,
  );
  fs.mkdirSync(paths.sourceGenerationDirectoryPath, { recursive: true });
  fs.mkdirSync(paths.stagingCandidateDirectoryPath, { recursive: true });
  fs.writeFileSync(paths.wrapperPath, "wrapped-key-only\n", {
    flag: "wx",
    mode: 0o600,
  });
  fs.writeFileSync(paths.sourceDatabasePath, SOURCE_BYTES, {
    flag: "wx",
    mode: 0o600,
  });
  fs.writeFileSync(paths.stagingDatabasePath, CANDIDATE_BYTES, {
    flag: "wx",
    mode: 0o600,
  });
  const wrapperDigest = digestFile(paths.wrapperPath);
  const publication = createGenerationPublicationFixture(
    workspaceId,
    wrapperDigest,
  );
  const intent = createGenerationPreparationIntent(workspaceId, wrapperDigest);
  const verifiedRecord = createGenerationCandidateVerifiedRecord({
    intent,
    candidateDatabaseDigest: digestFile(paths.stagingDatabasePath),
    candidateDatabaseSize: fs.statSync(paths.stagingDatabasePath).size,
  });
  writeCanonicalGenerationFile(paths.manifestPath, publication.sourceManifest);
  writeGenerationPreparationIntent(paths.intentPath, intent);
  writeGenerationCandidateVerifiedRecord(
    paths.verifiedRecordPath,
    verifiedRecord,
  );
  writeCanonicalGenerationFile(
    paths.operationRecordPath,
    publication.operationRecord,
  );
  const verifyGeneration = ({ role, databasePath }) => {
    if (role === "source") {
      assert.equal(digestFile(databasePath), digest(SOURCE_BYTES));
      return publication.sourceIdentity;
    }
    assert.equal(role, "candidate");
    assert.equal(digestFile(databasePath), digest(CANDIDATE_BYTES));
    return publication.candidateIdentity;
  };
  return {
    workspaceRoot,
    paths,
    publication,
    intent,
    verifiedRecord,
    options: {
      workspaceRoot,
      operationId: GENERATION_PUBLICATION_IDS.operationId,
      inputFingerprint: publication.inputFingerprint,
      verifyGeneration,
      reachFailpoint: undefined,
    },
  };
}

function stopAt(workspace, expectedFailpoint) {
  const stop = new Error(`stop:${expectedFailpoint}`);
  assert.throws(
    () =>
      handoffPreparedGeneration({
        ...workspace.options,
        reachFailpoint: ({ failpoint, state }) => {
          if (failpoint !== expectedFailpoint) return;
          const boundary = createGenerationPreparationFaultBoundaryRecord({
            processId: 42,
            failpoint,
            state,
          });
          assert.equal(boundary.failpoint, expectedFailpoint);
          throw stop;
        },
      }),
    (error) => error === stop,
  );
}

try {
  assert.deepEqual(GENERATION_PREPARATION_FAILPOINTS, [
    "none",
    "after-candidate-read-only-verified",
    "after-candidate-moved-into-generations",
  ]);

  const beforeMove = createPreparedWorkspace("before-move");
  const sourceManifestDigest = digestFile(beforeMove.paths.manifestPath);
  stopAt(beforeMove, "after-candidate-read-only-verified");
  const staged = verifyGenerationPreparationState(beforeMove.options);
  assert.equal(staged.phase, "staged");
  assert.equal(staged.candidateStagingPresent, true);
  assert.equal(staged.candidateGenerationPresent, false);
  const stagedBoundary = createGenerationPreparationFaultBoundaryRecord({
    processId: 42,
    failpoint: "after-candidate-read-only-verified",
    state: staged,
  });
  expectCode(
    () =>
      assertGenerationPreparationFaultBoundaryRecord({
        ...stagedBoundary,
        failpoint: "after-candidate-moved-into-generations",
      }),
    "GENERATION_PREPARATION_BOUNDARY_INVALID",
  );
  assert.equal(digestFile(beforeMove.paths.manifestPath), sourceManifestDigest);
  const applied = handoffPreparedGeneration(beforeMove.options);
  assert.equal(applied.kind, "applied");
  const handedOff = verifyGenerationPreparationState(beforeMove.options);
  assert.equal(handedOff.phase, "handed_off");
  assert.equal(handedOff.candidateStagingPresent, false);
  assert.equal(handedOff.candidateGenerationPresent, true);
  assert.equal(digestFile(beforeMove.paths.manifestPath), sourceManifestDigest);
  const beforeReplay = snapshotTree(beforeMove.workspaceRoot);
  assert.equal(handoffPreparedGeneration(beforeMove.options).kind, "replayed");
  assert.equal(snapshotTree(beforeMove.workspaceRoot), beforeReplay);

  const beforeConflict = snapshotTree(beforeMove.workspaceRoot);
  expectCode(
    () =>
      handoffPreparedGeneration({
        ...beforeMove.options,
        inputFingerprint: beforeMove.publication.conflictInputFingerprint,
      }),
    "GENERATION_PREPARATION_CONFLICT",
  );
  assert.equal(snapshotTree(beforeMove.workspaceRoot), beforeConflict);

  const afterMove = createPreparedWorkspace("after-move");
  stopAt(afterMove, "after-candidate-moved-into-generations");
  const recoveredFinal = verifyGenerationPreparationState(afterMove.options);
  assert.equal(recoveredFinal.phase, "handed_off");
  const afterMoveSnapshot = snapshotTree(afterMove.workspaceRoot);
  assert.equal(handoffPreparedGeneration(afterMove.options).kind, "replayed");
  assert.equal(snapshotTree(afterMove.workspaceRoot), afterMoveSnapshot);

  const missingRecord = createPreparedWorkspace("missing-record");
  fs.rmSync(missingRecord.paths.verifiedRecordPath);
  expectCode(
    () => verifyGenerationPreparationState(missingRecord.options),
    "GENERATION_CANDIDATE_VERIFIED_RECORD_INVALID",
  );

  const corruptCandidate = createPreparedWorkspace("corrupt-candidate");
  fs.appendFileSync(corruptCandidate.paths.stagingDatabasePath, "corrupt");
  expectCode(
    () => verifyGenerationPreparationState(corruptCandidate.options),
    "GENERATION_CANDIDATE_VERIFIED_RECORD_INVALID",
  );

  const symlinkCandidate = createPreparedWorkspace("symlink-candidate");
  fs.rmSync(symlinkCandidate.paths.stagingDatabasePath);
  fs.symlinkSync(
    symlinkCandidate.paths.sourceDatabasePath,
    symlinkCandidate.paths.stagingDatabasePath,
  );
  expectCode(
    () => verifyGenerationPreparationState(symlinkCandidate.options),
    "GENERATION_PREPARATION_CANDIDATE_INVALID",
  );

  const symlinkSidecar = createPreparedWorkspace("symlink-sidecar");
  fs.symlinkSync(
    symlinkSidecar.paths.sourceDatabasePath,
    `${symlinkSidecar.paths.stagingDatabasePath}-wal`,
  );
  expectCode(
    () => verifyGenerationPreparationState(symlinkSidecar.options),
    "GENERATION_PREPARATION_SIDECAR_INVALID",
  );

  const simultaneousLocations = createPreparedWorkspace(
    "simultaneous-locations",
  );
  fs.mkdirSync(simultaneousLocations.paths.candidateGenerationDirectoryPath);
  fs.writeFileSync(
    simultaneousLocations.paths.candidateDatabasePath,
    CANDIDATE_BYTES,
  );
  expectCode(
    () => verifyGenerationPreparationState(simultaneousLocations.options),
    "GENERATION_PREPARATION_CANDIDATE_LOCATION_INVALID",
  );

  const unexpectedCandidateEntry = createPreparedWorkspace(
    "unexpected-candidate-entry",
  );
  fs.writeFileSync(
    path.join(
      unexpectedCandidateEntry.paths.stagingCandidateDirectoryPath,
      "plaintext-export.tmp",
    ),
    "unexpected",
  );
  expectCode(
    () => verifyGenerationPreparationState(unexpectedCandidateEntry.options),
    "GENERATION_PREPARATION_CANDIDATE_INVALID",
  );

  const alternateOperation = createPreparedWorkspace("alternate-operation");
  const alternateOperationId = "10000000-0000-4000-8000-000000000299";
  const alternatePaths = getGenerationPreparationPaths(
    alternateOperation.workspaceRoot,
    alternateOperationId,
  );
  fs.renameSync(
    alternateOperation.paths.operationDirectoryPath,
    alternatePaths.operationDirectoryPath,
  );
  const alternateBefore = snapshotTree(alternateOperation.workspaceRoot);
  expectCode(
    () =>
      verifyGenerationPreparationState({
        ...alternateOperation.options,
        operationId: alternateOperationId,
      }),
    "GENERATION_PREPARATION_INTENT_INVALID",
  );
  assert.equal(snapshotTree(alternateOperation.workspaceRoot), alternateBefore);

  const oversizedWrapper = createPreparedWorkspace("oversized-wrapper");
  fs.rmSync(oversizedWrapper.paths.wrapperPath);
  fs.writeFileSync(
    oversizedWrapper.paths.wrapperPath,
    Buffer.alloc(64 * 1024 + 1, 0x20),
  );
  expectCode(
    () => verifyGenerationPreparationState(oversizedWrapper.options),
    "GENERATION_WRAPPER_INVALID",
  );

  const leafSwap = createPreparedWorkspace("leaf-swap");
  const outsideCandidate = path.join(root, "outside-candidate.db");
  fs.writeFileSync(outsideCandidate, CANDIDATE_BYTES);
  let leafSwapped = false;
  expectCode(
    () =>
      verifyGenerationPreparationState({
        ...leafSwap.options,
        verifyGeneration: (context) => {
          const identity = leafSwap.options.verifyGeneration(context);
          if (context.role === "source" && !leafSwapped) {
            fs.rmSync(leafSwap.paths.stagingDatabasePath);
            fs.symlinkSync(
              outsideCandidate,
              leafSwap.paths.stagingDatabasePath,
            );
            leafSwapped = true;
          }
          return identity;
        },
      }),
    "GENERATION_PREPARATION_CANDIDATE_INVALID",
  );

  const parentSwap = createPreparedWorkspace("parent-swap");
  const originalGenerations = path.join(
    parentSwap.workspaceRoot,
    "generations-original",
  );
  const outsideGenerations = path.join(root, "outside-generations");
  fs.mkdirSync(outsideGenerations);
  expectCode(
    () =>
      handoffPreparedGeneration({
        ...parentSwap.options,
        reachFailpoint: ({ failpoint }) => {
          if (failpoint !== "after-candidate-read-only-verified") return;
          fs.renameSync(parentSwap.paths.generationsRoot, originalGenerations);
          fs.symlinkSync(
            outsideGenerations,
            parentSwap.paths.generationsRoot,
            process.platform === "win32" ? "junction" : "dir",
          );
        },
      }),
    "GENERATION_PREPARATION_LAYOUT_INVALID",
  );
  assert.equal(fs.existsSync(parentSwap.paths.stagingDatabasePath), true);
  assert.equal(
    fs.existsSync(
      path.join(
        outsideGenerations,
        GENERATION_PUBLICATION_IDS.candidateGenerationId,
      ),
    ),
    false,
  );

  const identityMismatch = createPreparedWorkspace("identity-mismatch");
  expectCode(
    () =>
      verifyGenerationPreparationState({
        ...identityMismatch.options,
        verifyGeneration: () => identityMismatch.publication.sourceIdentity,
      }),
    "GENERATION_PREPARATION_IDENTITY_MISMATCH",
  );

  const oversizedIntent = createPreparedWorkspace("oversized-intent");
  fs.writeFileSync(
    oversizedIntent.paths.intentPath,
    Buffer.alloc(64 * 1024 + 1, 0x20),
  );
  expectCode(
    () => verifyGenerationPreparationState(oversizedIntent.options),
    "GENERATION_PREPARATION_INTENT_INVALID",
  );

  process.stdout.write(
    `${JSON.stringify({
      status: "pass",
      candidateHandoffSentinels: 2,
      sourceManifestRemainedActive: true,
      sealedCandidateReused: true,
      replayWithoutChurnVerified: true,
      conflictWithoutMutationVerified: true,
      malformedMissingCorruptSymlinkRejected: true,
      processCrashScopeOnly: true,
    })}\n`,
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  SOURCE_BYTES.fill(0);
  CANDIDATE_BYTES.fill(0);
}
