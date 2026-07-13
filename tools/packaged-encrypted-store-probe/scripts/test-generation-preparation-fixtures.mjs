import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  GENERATION_CANDIDATE_BUILD_FAILPOINTS,
  GENERATION_CANDIDATE_BUILD_SCENARIO,
  GENERATION_PREPARATION_FAILPOINTS,
  assertGenerationCandidateBuildFaultBoundaryRecord,
  assertGenerationPreparationFaultBoundaryRecord,
  createGenerationCandidateBuildFaultBoundaryRecord,
  createGenerationCandidateVerifiedRecord,
  createGenerationPreparationFaultBoundaryRecord,
  createGenerationPreparationIntent,
  getGenerationPreparationPaths,
  handoffPreparedGeneration,
  recoverUnsealedGenerationCandidateBuild,
  verifyGenerationPreparationRecordPrerequisites,
  verifyGenerationPreparationState,
  writeGenerationCandidateVerifiedRecord,
  writeGenerationPreparationIntent,
} from "../app/recovery/generation-preparation.mjs";
import {
  GENERATION_PUBLICATION_IDS,
  GenerationPublicationError,
  canonicalGenerationBytes,
  createGenerationPublicationFixture,
  digestGenerationValue,
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

function createUnsealedWorkspace(slug) {
  const workspace = createPreparedWorkspace(slug);
  fs.rmSync(workspace.paths.operationRecordPath);
  fs.rmSync(workspace.paths.verifiedRecordPath);
  fs.rmSync(workspace.paths.stagingCandidateDirectoryPath, {
    recursive: true,
  });
  return workspace;
}

try {
  assert.deepEqual(GENERATION_PREPARATION_FAILPOINTS, [
    "none",
    "after-candidate-read-only-verified",
    "after-candidate-moved-into-generations",
  ]);
  assert.equal(
    GENERATION_CANDIDATE_BUILD_SCENARIO,
    "generation-candidate-build-recovery",
  );
  assert.deepEqual(GENERATION_CANDIDATE_BUILD_FAILPOINTS, [
    "none",
    "during-sqlcipher-export",
    "during-synthetic-migration",
    "after-synthetic-migration-commit",
    "after-candidate-checkpointed",
    "after-verified-candidate-renamed",
  ]);

  const advancing = createPreparedWorkspace("record-advance");
  fs.rmSync(advancing.paths.operationRecordPath);
  fs.rmSync(advancing.paths.verifiedRecordPath);
  fs.rmSync(advancing.paths.intentPath);
  fs.rmSync(advancing.paths.stagingCandidateDirectoryPath, {
    recursive: true,
  });
  const advanceOptions = {
    workspaceRoot: advancing.options.workspaceRoot,
    operationId: advancing.options.operationId,
    inputFingerprint: advancing.options.inputFingerprint,
    verifyGeneration: advancing.options.verifyGeneration,
  };
  const sourceReady = verifyGenerationPreparationRecordPrerequisites({
    ...advanceOptions,
    nextRecordKind: "intent",
  });
  assert.equal(sourceReady.candidatePresent, false);
  assert.equal(sourceReady.intentDigest, null);
  writeGenerationPreparationIntent(
    advancing.paths.intentPath,
    advancing.intent,
  );
  const intentReady = verifyGenerationPreparationRecordPrerequisites({
    ...advanceOptions,
    nextRecordKind: "candidate-verified",
  });
  assert.equal(intentReady.candidatePresent, false);
  assert.equal(
    intentReady.intentDigest,
    digestGenerationValue(advancing.intent),
  );
  fs.mkdirSync(advancing.paths.stagingCandidateDirectoryPath);
  fs.writeFileSync(advancing.paths.stagingDatabasePath, CANDIDATE_BYTES);
  const candidateSealed = verifyGenerationPreparationRecordPrerequisites({
    ...advanceOptions,
    nextRecordKind: "candidate-verified",
  });
  assert.equal(candidateSealed.candidatePresent, true);
  assert.equal(
    candidateSealed.candidateDatabaseDigest,
    digest(CANDIDATE_BYTES),
  );
  writeGenerationCandidateVerifiedRecord(
    advancing.paths.verifiedRecordPath,
    advancing.verifiedRecord,
  );
  const candidateVerified = verifyGenerationPreparationRecordPrerequisites({
    ...advanceOptions,
    nextRecordKind: "operation",
  });
  assert.equal(
    candidateVerified.verifiedRecordDigest,
    digestGenerationValue(advancing.verifiedRecord),
  );
  writeCanonicalGenerationFile(
    advancing.paths.operationRecordPath,
    advancing.publication.operationRecord,
  );
  assert.equal(
    verifyGenerationPreparationState(advancing.options).phase,
    "staged",
  );

  const abandonedBuild = createUnsealedWorkspace("abandoned-build");
  fs.mkdirSync(abandonedBuild.paths.buildingCandidateDirectoryPath);
  for (const [suffix, contents] of [
    ["", Buffer.alloc(0)],
    ["-journal", Buffer.from("encrypted-journal")],
    ["-shm", Buffer.from("bounded-shm")],
    ["-wal", Buffer.from("encrypted-wal")],
  ]) {
    fs.writeFileSync(
      `${abandonedBuild.paths.buildingDatabasePath}${suffix}`,
      contents,
    );
    contents.fill(0);
  }
  const abandonedState = verifyGenerationPreparationRecordPrerequisites({
    workspaceRoot: abandonedBuild.options.workspaceRoot,
    operationId: abandonedBuild.options.operationId,
    inputFingerprint: abandonedBuild.options.inputFingerprint,
    verifyGeneration: abandonedBuild.options.verifyGeneration,
    nextRecordKind: "candidate-verified",
  });
  assert.equal(abandonedState.candidateBuildPresent, true);
  assert.equal(abandonedState.candidateDiscardingPresent, false);
  assert.deepEqual(
    recoverUnsealedGenerationCandidateBuild({
      workspaceRoot: abandonedBuild.options.workspaceRoot,
      operationId: abandonedBuild.options.operationId,
    }),
    { kind: "discarded", quarantinedFileCount: 4 },
  );
  assert.deepEqual(
    fs.readdirSync(abandonedBuild.paths.operationDirectoryPath),
    ["intent.json"],
  );

  const interruptedDiscard = createUnsealedWorkspace("interrupted-discard");
  fs.mkdirSync(interruptedDiscard.paths.discardingCandidateDirectoryPath);
  fs.writeFileSync(interruptedDiscard.paths.discardingDatabasePath, "partial");
  assert.deepEqual(
    recoverUnsealedGenerationCandidateBuild({
      workspaceRoot: interruptedDiscard.options.workspaceRoot,
      operationId: interruptedDiscard.options.operationId,
    }),
    { kind: "discarded", quarantinedFileCount: 1 },
  );
  assert.equal(
    fs.existsSync(interruptedDiscard.paths.discardingCandidateDirectoryPath),
    false,
  );

  const ambiguousDiscard = createUnsealedWorkspace("ambiguous-discard");
  fs.mkdirSync(ambiguousDiscard.paths.buildingCandidateDirectoryPath);
  fs.mkdirSync(ambiguousDiscard.paths.discardingCandidateDirectoryPath);
  const ambiguousSnapshot = snapshotTree(ambiguousDiscard.workspaceRoot);
  expectCode(
    () =>
      recoverUnsealedGenerationCandidateBuild({
        workspaceRoot: ambiguousDiscard.options.workspaceRoot,
        operationId: ambiguousDiscard.options.operationId,
      }),
    "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
  );
  assert.equal(snapshotTree(ambiguousDiscard.workspaceRoot), ambiguousSnapshot);

  const foreignBuildEntry = createUnsealedWorkspace("foreign-build-entry");
  fs.mkdirSync(foreignBuildEntry.paths.buildingCandidateDirectoryPath);
  fs.writeFileSync(
    path.join(
      foreignBuildEntry.paths.buildingCandidateDirectoryPath,
      "foreign.tmp",
    ),
    "foreign",
  );
  const foreignSnapshot = snapshotTree(foreignBuildEntry.workspaceRoot);
  expectCode(
    () =>
      recoverUnsealedGenerationCandidateBuild({
        workspaceRoot: foreignBuildEntry.options.workspaceRoot,
        operationId: foreignBuildEntry.options.operationId,
      }),
    "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
  );
  assert.equal(snapshotTree(foreignBuildEntry.workspaceRoot), foreignSnapshot);

  const symlinkBuildEntry = createUnsealedWorkspace("symlink-build-entry");
  fs.mkdirSync(symlinkBuildEntry.paths.buildingCandidateDirectoryPath);
  fs.symlinkSync(
    symlinkBuildEntry.paths.sourceDatabasePath,
    symlinkBuildEntry.paths.buildingDatabasePath,
  );
  const symlinkBuildSnapshot = snapshotTree(symlinkBuildEntry.workspaceRoot);
  expectCode(
    () =>
      recoverUnsealedGenerationCandidateBuild({
        workspaceRoot: symlinkBuildEntry.options.workspaceRoot,
        operationId: symlinkBuildEntry.options.operationId,
      }),
    "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
  );
  assert.equal(
    snapshotTree(symlinkBuildEntry.workspaceRoot),
    symlinkBuildSnapshot,
  );

  const hardlinkBuildEntry = createUnsealedWorkspace("hardlink-build-entry");
  fs.mkdirSync(hardlinkBuildEntry.paths.buildingCandidateDirectoryPath);
  fs.linkSync(
    hardlinkBuildEntry.paths.sourceDatabasePath,
    hardlinkBuildEntry.paths.buildingDatabasePath,
  );
  const hardlinkBuildSnapshot = snapshotTree(hardlinkBuildEntry.workspaceRoot);
  expectCode(
    () =>
      recoverUnsealedGenerationCandidateBuild({
        workspaceRoot: hardlinkBuildEntry.options.workspaceRoot,
        operationId: hardlinkBuildEntry.options.operationId,
      }),
    "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
  );
  assert.equal(
    snapshotTree(hardlinkBuildEntry.workspaceRoot),
    hardlinkBuildSnapshot,
  );

  const buildBoundaryState = {
    workspaceId: abandonedBuild.intent.workspaceId,
    operationId: GENERATION_PUBLICATION_IDS.operationId,
    activeGenerationId: GENERATION_PUBLICATION_IDS.sourceGenerationId,
    candidateGenerationId: GENERATION_PUBLICATION_IDS.candidateGenerationId,
    candidateGenerationIdentityDigest:
      abandonedBuild.publication.candidateGenerationIdentityDigest,
    sourceManifestDigest: digestGenerationValue(
      abandonedBuild.publication.sourceManifest,
    ),
    intentDigest: digestGenerationValue(abandonedBuild.intent),
    wrapperDigest: abandonedBuild.intent.wrapperDigest,
    candidateBuildingPresent: true,
    candidateStagingPresent: false,
    candidateGenerationPresent: false,
    migrationTransactionOpen: true,
  };
  const buildBoundary = createGenerationCandidateBuildFaultBoundaryRecord({
    processId: 42,
    failpoint: "during-sqlcipher-export",
    state: buildBoundaryState,
  });
  assert.equal(
    assertGenerationCandidateBuildFaultBoundaryRecord(buildBoundary),
    buildBoundary,
  );
  expectCode(
    () =>
      assertGenerationCandidateBuildFaultBoundaryRecord({
        ...buildBoundary,
        candidateStagingPresent: true,
      }),
    "GENERATION_CANDIDATE_BUILD_BOUNDARY_INVALID",
  );

  const sourceReadSidecars = createUnsealedWorkspace("source-read-sidecars");
  fs.writeFileSync(`${sourceReadSidecars.paths.sourceDatabasePath}-wal`, "");
  fs.writeFileSync(
    `${sourceReadSidecars.paths.sourceDatabasePath}-shm`,
    Buffer.alloc(32 * 1024),
  );
  assert.equal(
    verifyGenerationPreparationRecordPrerequisites({
      workspaceRoot: sourceReadSidecars.options.workspaceRoot,
      operationId: sourceReadSidecars.options.operationId,
      inputFingerprint: sourceReadSidecars.options.inputFingerprint,
      verifyGeneration: sourceReadSidecars.options.verifyGeneration,
      nextRecordKind: "candidate-verified",
    }).candidatePresent,
    false,
  );

  const sourceWalFrames = createUnsealedWorkspace("source-wal-frames");
  fs.writeFileSync(
    `${sourceWalFrames.paths.sourceDatabasePath}-wal`,
    "nonzero-wal",
  );
  expectCode(
    () =>
      verifyGenerationPreparationRecordPrerequisites({
        workspaceRoot: sourceWalFrames.options.workspaceRoot,
        operationId: sourceWalFrames.options.operationId,
        inputFingerprint: sourceWalFrames.options.inputFingerprint,
        verifyGeneration: sourceWalFrames.options.verifyGeneration,
        nextRecordKind: "candidate-verified",
      }),
    "GENERATION_PREPARATION_SOURCE_SIDECAR_INVALID",
  );

  const sourceHardlinkSidecar = createUnsealedWorkspace(
    "source-hardlink-sidecar",
  );
  const outsideSourceWal = path.join(root, "outside-source-wal");
  fs.writeFileSync(outsideSourceWal, "");
  fs.linkSync(
    outsideSourceWal,
    `${sourceHardlinkSidecar.paths.sourceDatabasePath}-wal`,
  );
  expectCode(
    () =>
      verifyGenerationPreparationRecordPrerequisites({
        workspaceRoot: sourceHardlinkSidecar.options.workspaceRoot,
        operationId: sourceHardlinkSidecar.options.operationId,
        inputFingerprint: sourceHardlinkSidecar.options.inputFingerprint,
        verifyGeneration: sourceHardlinkSidecar.options.verifyGeneration,
        nextRecordKind: "candidate-verified",
      }),
    "GENERATION_PREPARATION_SOURCE_SIDECAR_INVALID",
  );

  const candidateBeforeIntent = createPreparedWorkspace(
    "candidate-before-intent",
  );
  fs.rmSync(candidateBeforeIntent.paths.operationRecordPath);
  fs.rmSync(candidateBeforeIntent.paths.verifiedRecordPath);
  fs.rmSync(candidateBeforeIntent.paths.intentPath);
  const candidateBeforeIntentSnapshot = snapshotTree(
    candidateBeforeIntent.workspaceRoot,
  );
  expectCode(
    () =>
      verifyGenerationPreparationRecordPrerequisites({
        workspaceRoot: candidateBeforeIntent.options.workspaceRoot,
        operationId: candidateBeforeIntent.options.operationId,
        inputFingerprint: candidateBeforeIntent.options.inputFingerprint,
        verifyGeneration: candidateBeforeIntent.options.verifyGeneration,
        nextRecordKind: "intent",
      }),
    "GENERATION_PREPARATION_CANDIDATE_INVALID",
  );
  assert.equal(
    snapshotTree(candidateBeforeIntent.workspaceRoot),
    candidateBeforeIntentSnapshot,
  );

  const partialCallbackMutation = createPreparedWorkspace(
    "partial-callback-mutation",
  );
  fs.rmSync(partialCallbackMutation.paths.operationRecordPath);
  fs.rmSync(partialCallbackMutation.paths.verifiedRecordPath);
  fs.rmSync(partialCallbackMutation.paths.intentPath);
  fs.rmSync(partialCallbackMutation.paths.stagingCandidateDirectoryPath, {
    recursive: true,
  });
  let callbackMutationSnapshot;
  expectCode(
    () =>
      verifyGenerationPreparationRecordPrerequisites({
        workspaceRoot: partialCallbackMutation.options.workspaceRoot,
        operationId: partialCallbackMutation.options.operationId,
        inputFingerprint: partialCallbackMutation.options.inputFingerprint,
        nextRecordKind: "intent",
        verifyGeneration: (context) => {
          const identity =
            partialCallbackMutation.options.verifyGeneration(context);
          fs.writeFileSync(
            partialCallbackMutation.paths.manifestPath,
            canonicalGenerationBytes(
              partialCallbackMutation.publication.targetManifest,
            ),
          );
          callbackMutationSnapshot = snapshotTree(
            partialCallbackMutation.workspaceRoot,
          );
          return identity;
        },
      }),
    "GENERATION_SOURCE_MANIFEST_MISMATCH",
  );
  assert.equal(
    snapshotTree(partialCallbackMutation.workspaceRoot),
    callbackMutationSnapshot,
  );

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

  const postMoveSwap = createPreparedWorkspace("post-move-swap");
  const outsidePostMoveCandidate = path.join(
    root,
    "outside-post-move-candidate.db",
  );
  fs.writeFileSync(outsidePostMoveCandidate, CANDIDATE_BYTES);
  expectCode(
    () =>
      handoffPreparedGeneration({
        ...postMoveSwap.options,
        reachFailpoint: ({ failpoint }) => {
          if (failpoint !== "after-candidate-moved-into-generations") return;
          fs.rmSync(postMoveSwap.paths.candidateDatabasePath);
          fs.symlinkSync(
            outsidePostMoveCandidate,
            postMoveSwap.paths.candidateDatabasePath,
          );
        },
      }),
    "GENERATION_PREPARATION_CANDIDATE_INVALID",
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
      recordAdvanceOrderingVerified: true,
      unsealedCandidateQuarantineVerified: true,
      interruptedDiscardRecoveryVerified: true,
      ambiguousCandidateBuildLayoutsRejected: true,
      candidateBuildBoundaryValidationVerified: true,
      boundedSourceReadSidecarsAccepted: true,
      nonzeroSourceWalRejected: true,
      partialVerifierCallbackMutationRejected: true,
      malformedMissingCorruptSymlinkRejected: true,
      processCrashScopeOnly: true,
    })}\n`,
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  SOURCE_BYTES.fill(0);
  CANDIDATE_BYTES.fill(0);
}
