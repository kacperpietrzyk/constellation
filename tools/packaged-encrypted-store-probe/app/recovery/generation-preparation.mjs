import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson } from "./capture-command.mjs";
import {
  GENERATION_PUBLICATION_IDS,
  GenerationPublicationError,
  assertRecoverableGenerationSourceSidecars,
  canonicalGenerationBytes,
  createGenerationPublicationFixture,
  digestGenerationValue,
  getGenerationPublicationPaths,
  writeCanonicalGenerationFile,
} from "./generation-publication.mjs";

export const GENERATION_PREPARATION_SCENARIO = "generation-candidate-handoff";
export const GENERATION_PREPARATION_FAILPOINTS = Object.freeze([
  "none",
  "after-candidate-read-only-verified",
  "after-candidate-moved-into-generations",
]);
export const GENERATION_CANDIDATE_BUILD_SCENARIO =
  "generation-candidate-build-recovery";
export const GENERATION_CANDIDATE_BUILD_FAILPOINTS = Object.freeze([
  "none",
  "during-sqlcipher-export",
  "during-synthetic-migration",
  "after-synthetic-migration-commit",
  "after-candidate-checkpointed",
  "after-verified-candidate-renamed",
]);

const INTENT_FORMAT = "constellation.generation-preparation-intent/v1";
const VERIFIED_FORMAT = "constellation.generation-candidate-verified/v1";
const OUTCOME_FORMAT = "constellation.generation-handoff-outcome/v1";
const BOUNDARY_FORMAT = "constellation.generation-handoff-fault-boundary/v1";
const CANDIDATE_BUILD_BOUNDARY_FORMAT =
  "constellation.generation-candidate-build-fault-boundary/v1";
const EXPORT_RECIPE_VERSION = "sqlcipher-export-transactional/v2";
const MIGRATION_RECIPE_VERSION = "synthetic-schema-v2/v1";
const VERIFICATION_CONTRACT_VERSION = "generation-candidate-verification/v1";
const MAX_JSON_BYTES = 64 * 1024;
const MAX_WRAPPER_BYTES = 64 * 1024;
const MAX_CANDIDATE_BYTES = 256 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;

function invariant(condition, code) {
  if (!condition) throw new GenerationPublicationError(code);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function deepFreeze(value) {
  if (!isRecord(value) && !Array.isArray(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assertDigest(value, code) {
  invariant(typeof value === "string" && SHA256.test(value), code);
}

function sameFileIdentity(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function sameDirectoryIdentity(left, right) {
  return (
    left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
  );
}

function lstatBigInt(target, kind, code) {
  let metadata;
  try {
    metadata = fs.lstatSync(target, { bigint: true });
  } catch {
    throw new GenerationPublicationError(code);
  }
  invariant(
    !metadata.isSymbolicLink() &&
      (kind === "file" ? metadata.isFile() : metadata.isDirectory()),
    code,
  );
  return metadata;
}

function readBoundedRegularFile(target, maximumBytes, code) {
  const before = lstatBigInt(target, "file", code);
  invariant(before.size > 0n && before.size <= BigInt(maximumBytes), code);
  let descriptor;
  let contents;
  try {
    descriptor = fs.openSync(target, "r");
    const opened = fs.fstatSync(descriptor, { bigint: true });
    invariant(
      opened.isFile() &&
        sameFileIdentity(before, opened) &&
        opened.size <= BigInt(maximumBytes),
      code,
    );
    contents = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < contents.length) {
      const read = fs.readSync(
        descriptor,
        contents,
        offset,
        contents.length - offset,
        offset,
      );
      invariant(read > 0, code);
      offset += read;
    }
    const extra = Buffer.alloc(1);
    try {
      invariant(
        fs.readSync(descriptor, extra, 0, 1, contents.length) === 0,
        code,
      );
    } finally {
      extra.fill(0);
    }
    const after = fs.fstatSync(descriptor, { bigint: true });
    const pathAfter = lstatBigInt(target, "file", code);
    invariant(
      sameFileIdentity(opened, after) && sameFileIdentity(after, pathAfter),
      code,
    );
    return { contents, metadata: pathAfter };
  } catch (error) {
    contents?.fill(0);
    if (error instanceof GenerationPublicationError) throw error;
    throw new GenerationPublicationError(code);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function digestBoundedRegularFile(target, maximumBytes, code) {
  const snapshot = readBoundedRegularFile(target, maximumBytes, code);
  try {
    return {
      digest: crypto
        .createHash("sha256")
        .update(snapshot.contents)
        .digest("hex"),
      metadata: snapshot.metadata,
    };
  } finally {
    snapshot.contents.fill(0);
  }
}

function assertIntent(value) {
  invariant(
    hasExactKeys(value, [
      "candidateGenerationId",
      "candidateGenerationIdentityDigest",
      "exportRecipeVersion",
      "format",
      "inputFingerprint",
      "migrationRecipeVersion",
      "operationId",
      "sourceGenerationId",
      "sourceGenerationIdentityDigest",
      "sourceManifestDigest",
      "state",
      "targetKeyVersion",
      "targetSchemaVersion",
      "workspaceId",
      "wrapperDigest",
    ]) &&
      value.format === INTENT_FORMAT &&
      value.state === "intent_recorded" &&
      value.operationId === GENERATION_PUBLICATION_IDS.operationId &&
      value.sourceGenerationId ===
        GENERATION_PUBLICATION_IDS.sourceGenerationId &&
      value.candidateGenerationId ===
        GENERATION_PUBLICATION_IDS.candidateGenerationId &&
      value.targetSchemaVersion === 2 &&
      value.targetKeyVersion === 1 &&
      value.exportRecipeVersion === EXPORT_RECIPE_VERSION &&
      value.migrationRecipeVersion === MIGRATION_RECIPE_VERSION &&
      typeof value.workspaceId === "string" &&
      /^workspace-[a-z0-9-]{1,48}$/.test(value.workspaceId),
    "GENERATION_PREPARATION_INTENT_INVALID",
  );
  for (const key of [
    "inputFingerprint",
    "wrapperDigest",
    "sourceManifestDigest",
    "sourceGenerationIdentityDigest",
    "candidateGenerationIdentityDigest",
  ]) {
    assertDigest(value[key], "GENERATION_PREPARATION_INTENT_INVALID");
  }
  return value;
}

function assertHandoffOutcome(value) {
  invariant(
    hasExactKeys(value, [
      "candidateDatabaseDigest",
      "candidateDatabaseSize",
      "candidateGenerationId",
      "candidateGenerationIdentityDigest",
      "format",
      "operationId",
      "workspaceId",
    ]) &&
      value.format === OUTCOME_FORMAT &&
      value.operationId === GENERATION_PUBLICATION_IDS.operationId &&
      value.candidateGenerationId ===
        GENERATION_PUBLICATION_IDS.candidateGenerationId &&
      typeof value.workspaceId === "string" &&
      Number.isSafeInteger(value.candidateDatabaseSize) &&
      value.candidateDatabaseSize > 0 &&
      value.candidateDatabaseSize <= MAX_CANDIDATE_BYTES,
    "GENERATION_HANDOFF_OUTCOME_INVALID",
  );
  assertDigest(
    value.candidateDatabaseDigest,
    "GENERATION_HANDOFF_OUTCOME_INVALID",
  );
  assertDigest(
    value.candidateGenerationIdentityDigest,
    "GENERATION_HANDOFF_OUTCOME_INVALID",
  );
  return value;
}

function assertVerifiedRecord(value) {
  invariant(
    hasExactKeys(value, [
      "candidateDatabaseDigest",
      "candidateDatabaseSize",
      "candidateGenerationId",
      "candidateGenerationIdentityDigest",
      "format",
      "handoffOutcome",
      "handoffOutcomeDigest",
      "inputFingerprint",
      "intentDigest",
      "operationId",
      "state",
      "verificationContractVersion",
      "workspaceId",
    ]) &&
      value.format === VERIFIED_FORMAT &&
      value.state === "candidate_verified" &&
      value.operationId === GENERATION_PUBLICATION_IDS.operationId &&
      value.candidateGenerationId ===
        GENERATION_PUBLICATION_IDS.candidateGenerationId &&
      value.verificationContractVersion === VERIFICATION_CONTRACT_VERSION &&
      typeof value.workspaceId === "string" &&
      Number.isSafeInteger(value.candidateDatabaseSize) &&
      value.candidateDatabaseSize > 0 &&
      value.candidateDatabaseSize <= MAX_CANDIDATE_BYTES,
    "GENERATION_CANDIDATE_VERIFIED_RECORD_INVALID",
  );
  for (const key of [
    "candidateDatabaseDigest",
    "candidateGenerationIdentityDigest",
    "handoffOutcomeDigest",
    "inputFingerprint",
    "intentDigest",
  ]) {
    assertDigest(value[key], "GENERATION_CANDIDATE_VERIFIED_RECORD_INVALID");
  }
  assertHandoffOutcome(value.handoffOutcome);
  invariant(
    value.handoffOutcome.workspaceId === value.workspaceId &&
      value.handoffOutcome.operationId === value.operationId &&
      value.handoffOutcome.candidateGenerationId ===
        value.candidateGenerationId &&
      value.handoffOutcome.candidateGenerationIdentityDigest ===
        value.candidateGenerationIdentityDigest &&
      value.handoffOutcome.candidateDatabaseDigest ===
        value.candidateDatabaseDigest &&
      value.handoffOutcome.candidateDatabaseSize ===
        value.candidateDatabaseSize &&
      digestGenerationValue(value.handoffOutcome) ===
        value.handoffOutcomeDigest,
    "GENERATION_CANDIDATE_VERIFIED_RECORD_INVALID",
  );
  return value;
}

export function createGenerationPreparationIntent(workspaceId, wrapperDigest) {
  const publication = createGenerationPublicationFixture(
    workspaceId,
    wrapperDigest,
  );
  return deepFreeze(
    assertIntent({
      format: INTENT_FORMAT,
      workspaceId,
      operationId: GENERATION_PUBLICATION_IDS.operationId,
      state: "intent_recorded",
      inputFingerprint: publication.inputFingerprint,
      wrapperDigest,
      sourceManifestDigest: digestGenerationValue(publication.sourceManifest),
      sourceGenerationId: publication.sourceIdentity.generationId,
      sourceGenerationIdentityDigest:
        publication.sourceGenerationIdentityDigest,
      candidateGenerationId: publication.candidateIdentity.generationId,
      candidateGenerationIdentityDigest:
        publication.candidateGenerationIdentityDigest,
      targetSchemaVersion: publication.candidateIdentity.schemaVersion,
      targetKeyVersion: publication.candidateIdentity.keyVersion,
      exportRecipeVersion: EXPORT_RECIPE_VERSION,
      migrationRecipeVersion: MIGRATION_RECIPE_VERSION,
    }),
  );
}

export function createGenerationCandidateVerifiedRecord({
  intent,
  candidateDatabaseDigest,
  candidateDatabaseSize,
}) {
  assertIntent(intent);
  assertDigest(candidateDatabaseDigest, "GENERATION_CANDIDATE_DIGEST_INVALID");
  invariant(
    Number.isSafeInteger(candidateDatabaseSize) &&
      candidateDatabaseSize > 0 &&
      candidateDatabaseSize <= MAX_CANDIDATE_BYTES,
    "GENERATION_CANDIDATE_SIZE_INVALID",
  );
  const handoffOutcome = deepFreeze(
    assertHandoffOutcome({
      format: OUTCOME_FORMAT,
      workspaceId: intent.workspaceId,
      operationId: intent.operationId,
      candidateGenerationId: intent.candidateGenerationId,
      candidateGenerationIdentityDigest:
        intent.candidateGenerationIdentityDigest,
      candidateDatabaseDigest,
      candidateDatabaseSize,
    }),
  );
  return deepFreeze(
    assertVerifiedRecord({
      format: VERIFIED_FORMAT,
      workspaceId: intent.workspaceId,
      operationId: intent.operationId,
      state: "candidate_verified",
      inputFingerprint: intent.inputFingerprint,
      intentDigest: digestGenerationValue(intent),
      candidateGenerationId: intent.candidateGenerationId,
      candidateGenerationIdentityDigest:
        intent.candidateGenerationIdentityDigest,
      candidateDatabaseDigest,
      candidateDatabaseSize,
      verificationContractVersion: VERIFICATION_CONTRACT_VERSION,
      handoffOutcome,
      handoffOutcomeDigest: digestGenerationValue(handoffOutcome),
    }),
  );
}

export function getGenerationPreparationPaths(workspaceRoot, operationId) {
  const publication = getGenerationPublicationPaths(workspaceRoot, operationId);
  return Object.freeze({
    ...publication,
    intentPath: path.join(publication.operationDirectoryPath, "intent.json"),
    stagingCandidateDirectoryPath: path.join(
      publication.operationDirectoryPath,
      "candidate",
    ),
    stagingDatabasePath: path.join(
      publication.operationDirectoryPath,
      "candidate",
      "workspace.db",
    ),
    buildingCandidateDirectoryPath: path.join(
      publication.operationDirectoryPath,
      "candidate-building",
    ),
    buildingDatabasePath: path.join(
      publication.operationDirectoryPath,
      "candidate-building",
      "workspace.db",
    ),
    discardingCandidateDirectoryPath: path.join(
      publication.operationDirectoryPath,
      "candidate-discarding",
    ),
    discardingDatabasePath: path.join(
      publication.operationDirectoryPath,
      "candidate-discarding",
      "workspace.db",
    ),
    verifiedRecordPath: path.join(
      publication.operationDirectoryPath,
      "candidate-verified.json",
    ),
  });
}

function lstatRequired(target, kind, code) {
  let metadata;
  try {
    metadata = fs.lstatSync(target);
  } catch {
    throw new GenerationPublicationError(code);
  }
  invariant(
    !metadata.isSymbolicLink() &&
      (kind === "file" ? metadata.isFile() : metadata.isDirectory()),
    code,
  );
  return metadata;
}

function lstatOptional(target, kind, code) {
  try {
    const metadata = fs.lstatSync(target);
    invariant(
      !metadata.isSymbolicLink() &&
        (kind === "file" ? metadata.isFile() : metadata.isDirectory()),
      code,
    );
    return metadata;
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    if (error instanceof GenerationPublicationError) throw error;
    throw new GenerationPublicationError(code);
  }
}

function assertExactDirectory(target, expectedEntries, code) {
  const before = lstatBigInt(target, "directory", code);
  let entries;
  try {
    entries = fs.readdirSync(target).sort();
  } catch {
    throw new GenerationPublicationError(code);
  }
  const after = lstatBigInt(target, "directory", code);
  invariant(
    sameDirectoryIdentity(before, after) &&
      entries.length === expectedEntries.length &&
      entries.every((entry, index) => entry === expectedEntries[index]),
    code,
  );
  return after;
}

function assertSourceGenerationDirectory(paths) {
  const code = "GENERATION_PREPARATION_SOURCE_SIDECAR_INVALID";
  const directoryBefore = lstatBigInt(
    paths.sourceGenerationDirectoryPath,
    "directory",
    code,
  );
  let entries;
  try {
    entries = fs.readdirSync(paths.sourceGenerationDirectoryPath).sort();
  } catch {
    throw new GenerationPublicationError(code);
  }
  invariant(
    entries.includes("workspace.db") &&
      entries.every((entry) =>
        ["workspace.db", "workspace.db-shm", "workspace.db-wal"].includes(
          entry,
        ),
      ),
    code,
  );
  assertRecoverableGenerationSourceSidecars(paths.sourceDatabasePath, code);
  const directoryAfter = lstatBigInt(
    paths.sourceGenerationDirectoryPath,
    "directory",
    code,
  );
  invariant(sameDirectoryIdentity(directoryBefore, directoryAfter), code);
  return directoryAfter;
}

const UNSEALED_CANDIDATE_ENTRIES = Object.freeze([
  "workspace.db",
  "workspace.db-journal",
  "workspace.db-shm",
  "workspace.db-wal",
]);

function captureUnsealedCandidateDirectory(target) {
  const code = "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID";
  const directoryBefore = lstatBigInt(target, "directory", code);
  let entries;
  try {
    entries = fs.readdirSync(target).sort();
  } catch {
    throw new GenerationPublicationError(code);
  }
  invariant(
    entries.every((entry) => UNSEALED_CANDIDATE_ENTRIES.includes(entry)),
    code,
  );
  const files = new Map();
  for (const entry of entries) {
    const metadata = lstatBigInt(path.join(target, entry), "file", code);
    invariant(
      metadata.nlink === 1n &&
        metadata.size >= 0n &&
        metadata.size <= BigInt(MAX_CANDIDATE_BYTES),
      code,
    );
    files.set(entry, metadata);
  }
  const directoryAfter = lstatBigInt(target, "directory", code);
  invariant(sameDirectoryIdentity(directoryBefore, directoryAfter), code);
  return { directory: directoryAfter, files };
}

function assertSameUnsealedCandidateDirectory(left, right) {
  invariant(
    sameDirectoryIdentity(left.directory, right.directory) &&
      left.files.size === right.files.size &&
      [...left.files].every(([entry, metadata]) => {
        const current = right.files.get(entry);
        return current && sameFileIdentity(metadata, current);
      }),
    "GENERATION_CANDIDATE_BUILD_CHANGED",
  );
}

function removeUnsealedCandidateDirectory(target) {
  const snapshot = captureUnsealedCandidateDirectory(target);
  try {
    for (const entry of [...snapshot.files.keys()].sort().reverse()) {
      fs.unlinkSync(path.join(target, entry));
    }
    fs.rmdirSync(target);
  } catch (error) {
    if (error instanceof GenerationPublicationError) throw error;
    throw new GenerationPublicationError("GENERATION_CANDIDATE_DISCARD_FAILED");
  }
}

export function recoverUnsealedGenerationCandidateBuild(options) {
  invariant(
    isRecord(options) &&
      hasExactKeys(options, ["operationId", "workspaceRoot"]),
    "GENERATION_CANDIDATE_BUILD_OPTIONS_INVALID",
  );
  const paths = getGenerationPreparationPaths(
    options.workspaceRoot,
    options.operationId,
  );
  invariant(
    !lstatOptional(
      paths.stagingCandidateDirectoryPath,
      "directory",
      "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
    ) &&
      !lstatOptional(
        paths.candidateGenerationDirectoryPath,
        "directory",
        "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
      ) &&
      !lstatOptional(
        paths.verifiedRecordPath,
        "file",
        "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
      ) &&
      !lstatOptional(
        paths.operationRecordPath,
        "file",
        "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
      ),
    "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
  );
  const building = lstatOptional(
    paths.buildingCandidateDirectoryPath,
    "directory",
    "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
  );
  const discarding = lstatOptional(
    paths.discardingCandidateDirectoryPath,
    "directory",
    "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
  );
  invariant(
    !(building && discarding),
    "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
  );
  if (!building && !discarding) {
    assertExactDirectory(
      paths.operationDirectoryPath,
      ["intent.json"],
      "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
    );
    return Object.freeze({ kind: "none", quarantinedFileCount: 0 });
  }

  const activePath = building
    ? paths.buildingCandidateDirectoryPath
    : paths.discardingCandidateDirectoryPath;
  const activeName = building ? "candidate-building" : "candidate-discarding";
  assertExactDirectory(
    paths.operationDirectoryPath,
    [activeName, "intent.json"].sort(),
    "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
  );
  const initial = captureUnsealedCandidateDirectory(activePath);
  const quarantinedFileCount = initial.files.size;
  if (building) {
    try {
      fs.renameSync(
        paths.buildingCandidateDirectoryPath,
        paths.discardingCandidateDirectoryPath,
      );
    } catch {
      throw new GenerationPublicationError(
        "GENERATION_CANDIDATE_QUARANTINE_FAILED",
      );
    }
    invariant(
      !lstatOptional(
        paths.buildingCandidateDirectoryPath,
        "directory",
        "GENERATION_CANDIDATE_QUARANTINE_FAILED",
      ),
      "GENERATION_CANDIDATE_QUARANTINE_FAILED",
    );
    const quarantined = captureUnsealedCandidateDirectory(
      paths.discardingCandidateDirectoryPath,
    );
    assertSameUnsealedCandidateDirectory(initial, quarantined);
  }
  removeUnsealedCandidateDirectory(paths.discardingCandidateDirectoryPath);
  assertExactDirectory(
    paths.operationDirectoryPath,
    ["intent.json"],
    "GENERATION_CANDIDATE_DISCARD_FAILED",
  );
  return Object.freeze({ kind: "discarded", quarantinedFileCount });
}

function assertClosedPreparationLayout(paths, phase) {
  const candidateDirectoryPath =
    phase === "staged"
      ? paths.stagingCandidateDirectoryPath
      : paths.candidateGenerationDirectoryPath;
  const operationEntries = [
    "candidate-verified.json",
    "intent.json",
    "operation.json",
  ];
  if (phase === "staged") operationEntries.unshift("candidate");
  const generationEntries = [GENERATION_PUBLICATION_IDS.sourceGenerationId];
  if (phase === "handed_off") {
    generationEntries.push(GENERATION_PUBLICATION_IDS.candidateGenerationId);
  }
  generationEntries.sort();
  const snapshots = new Map([
    [
      paths.workspaceRoot,
      assertExactDirectory(
        paths.workspaceRoot,
        ["generations", "key.wrap.json", "recovery", "workspace.json"],
        "GENERATION_PREPARATION_LAYOUT_INVALID",
      ),
    ],
    [
      paths.generationsRoot,
      assertExactDirectory(
        paths.generationsRoot,
        generationEntries,
        "GENERATION_PREPARATION_LAYOUT_INVALID",
      ),
    ],
    [
      paths.sourceGenerationDirectoryPath,
      assertSourceGenerationDirectory(paths),
    ],
    [
      paths.recoveryRoot,
      assertExactDirectory(
        paths.recoveryRoot,
        [`operation-${GENERATION_PUBLICATION_IDS.operationId}`],
        "GENERATION_PREPARATION_LAYOUT_INVALID",
      ),
    ],
    [
      paths.operationDirectoryPath,
      assertExactDirectory(
        paths.operationDirectoryPath,
        operationEntries.sort(),
        "GENERATION_PREPARATION_LAYOUT_INVALID",
      ),
    ],
    [
      candidateDirectoryPath,
      assertExactDirectory(
        candidateDirectoryPath,
        ["workspace.db"],
        "GENERATION_PREPARATION_CANDIDATE_INVALID",
      ),
    ],
  ]);
  return snapshots;
}

function assertSameClosedPreparationLayout(before, after) {
  invariant(
    before.size === after.size &&
      [...before].every(([target, metadata]) => {
        const current = after.get(target);
        return current && sameDirectoryIdentity(metadata, current);
      }),
    "GENERATION_PREPARATION_LAYOUT_CHANGED",
  );
}

function readCanonicalFile(target, validator, code) {
  const snapshot = readBoundedRegularFile(target, MAX_JSON_BYTES, code);
  const { contents } = snapshot;
  try {
    let value;
    try {
      value = JSON.parse(contents.toString("utf8"));
    } catch {
      throw new GenerationPublicationError(code);
    }
    validator(value);
    invariant(contents.equals(canonicalGenerationBytes(value)), code);
    return {
      value: deepFreeze(value),
      digest: digestGenerationValue(value),
      metadata: snapshot.metadata,
      contents: Buffer.from(contents),
    };
  } finally {
    contents.fill(0);
  }
}

function assertCanonicalFileUnchanged(target, initial, validator, code) {
  const current = readCanonicalFile(target, validator, code);
  try {
    invariant(
      current.digest === initial.digest &&
        canonicalJson(current.value) === canonicalJson(initial.value) &&
        sameFileIdentity(current.metadata, initial.metadata),
      code,
    );
  } finally {
    current.contents.fill(0);
  }
}

function assertNoSidecars(databasePath) {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    invariant(
      lstatOptional(
        `${databasePath}${suffix}`,
        "file",
        "GENERATION_PREPARATION_SIDECAR_INVALID",
      ) === undefined,
      "GENERATION_PREPARATION_SIDECAR_INVALID",
    );
  }
}

function verifyIdentity(verifyGeneration, context) {
  invariant(
    typeof verifyGeneration === "function",
    "GENERATION_PREPARATION_VERIFIER_INVALID",
  );
  const actual = verifyGeneration(Object.freeze(context));
  invariant(
    canonicalJson(actual) === canonicalJson(context.expectedIdentity) &&
      digestGenerationValue(actual) === context.expectedIdentityDigest,
    "GENERATION_PREPARATION_IDENTITY_MISMATCH",
  );
}

function assertRecordAdvanceEntries(
  paths,
  nextRecordKind,
  candidatePresent,
  buildingPresent,
  discardingPresent,
) {
  const currentBasename = {
    intent: "intent.json",
    "candidate-verified": "candidate-verified.json",
    operation: "operation.json",
  }[nextRecordKind];
  const stableEntries = [];
  if (nextRecordKind !== "intent") stableEntries.push("intent.json");
  if (candidatePresent) stableEntries.push("candidate");
  if (buildingPresent) stableEntries.push("candidate-building");
  if (discardingPresent) stableEntries.push("candidate-discarding");
  if (nextRecordKind === "operation") {
    stableEntries.push("candidate-verified.json");
  }
  let currentEntries;
  try {
    currentEntries = fs
      .readdirSync(paths.operationDirectoryPath)
      .filter((entry) => !stableEntries.includes(entry));
  } catch {
    throw new GenerationPublicationError(
      "GENERATION_PREPARATION_LAYOUT_INVALID",
    );
  }
  const escapedCurrentBasename = currentBasename.replaceAll(".", "\\.");
  const temporaryEntries = currentEntries.filter((entry) =>
    new RegExp(`^${escapedCurrentBasename}\\.[a-f0-9]{64}\\.publishing$`).test(
      entry,
    ),
  );
  const allowedCurrentEntries = [
    [],
    [currentBasename],
    ...(temporaryEntries.length === 1
      ? [[temporaryEntries[0]], [currentBasename, temporaryEntries[0]].sort()]
      : []),
  ];
  invariant(
    allowedCurrentEntries.some(
      (allowed) =>
        currentEntries.length === allowed.length &&
        [...currentEntries]
          .sort()
          .every((entry, index) => entry === allowed[index]),
    ),
    "GENERATION_PREPARATION_LAYOUT_INVALID",
  );
  invariant(
    nextRecordKind !== "intent" || !candidatePresent,
    "GENERATION_PREPARATION_CANDIDATE_INVALID",
  );
  invariant(
    !(buildingPresent && discardingPresent) &&
      !(candidatePresent && (buildingPresent || discardingPresent)) &&
      (!(buildingPresent || discardingPresent) ||
        nextRecordKind === "candidate-verified"),
    "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
  );
  invariant(
    nextRecordKind !== "candidate-verified" ||
      candidatePresent ||
      currentEntries.length === 0,
    "GENERATION_PREPARATION_CANDIDATE_INVALID",
  );
  const expectedEntries = [...stableEntries, ...currentEntries].sort();
  const metadata = assertExactDirectory(
    paths.operationDirectoryPath,
    expectedEntries,
    "GENERATION_PREPARATION_LAYOUT_INVALID",
  );
  return { expectedEntries, metadata };
}

function captureRecordAdvanceLayout(
  paths,
  nextRecordKind,
  candidatePresent,
  buildingPresent,
  discardingPresent,
) {
  const operation = assertRecordAdvanceEntries(
    paths,
    nextRecordKind,
    candidatePresent,
    buildingPresent,
    discardingPresent,
  );
  const layout = new Map([
    [
      paths.workspaceRoot,
      assertExactDirectory(
        paths.workspaceRoot,
        ["generations", "key.wrap.json", "recovery", "workspace.json"],
        "GENERATION_PREPARATION_LAYOUT_INVALID",
      ),
    ],
    [
      paths.generationsRoot,
      assertExactDirectory(
        paths.generationsRoot,
        [GENERATION_PUBLICATION_IDS.sourceGenerationId],
        "GENERATION_PREPARATION_LAYOUT_INVALID",
      ),
    ],
    [
      paths.sourceGenerationDirectoryPath,
      assertSourceGenerationDirectory(paths),
    ],
    [
      paths.recoveryRoot,
      assertExactDirectory(
        paths.recoveryRoot,
        [`operation-${GENERATION_PUBLICATION_IDS.operationId}`],
        "GENERATION_PREPARATION_LAYOUT_INVALID",
      ),
    ],
    [paths.operationDirectoryPath, operation.metadata],
  ]);
  if (candidatePresent) {
    layout.set(
      paths.stagingCandidateDirectoryPath,
      assertExactDirectory(
        paths.stagingCandidateDirectoryPath,
        ["workspace.db"],
        "GENERATION_PREPARATION_CANDIDATE_INVALID",
      ),
    );
  }
  const unsealedPath = buildingPresent
    ? paths.buildingCandidateDirectoryPath
    : discardingPresent
      ? paths.discardingCandidateDirectoryPath
      : undefined;
  return {
    directories: layout,
    unsealed: unsealedPath
      ? captureUnsealedCandidateDirectory(unsealedPath)
      : undefined,
  };
}

export function verifyGenerationPreparationRecordPrerequisites(options) {
  invariant(
    isRecord(options) &&
      hasExactKeys(options, [
        "inputFingerprint",
        "nextRecordKind",
        "operationId",
        "verifyGeneration",
        "workspaceRoot",
      ]) &&
      ["intent", "candidate-verified", "operation"].includes(
        options.nextRecordKind,
      ),
    "GENERATION_PREPARATION_OPTIONS_INVALID",
  );
  assertDigest(
    options.inputFingerprint,
    "GENERATION_PREPARATION_INPUT_FINGERPRINT_INVALID",
  );
  const paths = getGenerationPreparationPaths(
    options.workspaceRoot,
    options.operationId,
  );
  for (const directory of [
    paths.workspaceRoot,
    paths.generationsRoot,
    paths.sourceGenerationDirectoryPath,
    paths.recoveryRoot,
    paths.operationDirectoryPath,
  ]) {
    lstatRequired(
      directory,
      "directory",
      "GENERATION_PREPARATION_LAYOUT_INVALID",
    );
  }
  assertExactDirectory(
    paths.workspaceRoot,
    ["generations", "key.wrap.json", "recovery", "workspace.json"],
    "GENERATION_PREPARATION_LAYOUT_INVALID",
  );
  assertExactDirectory(
    paths.generationsRoot,
    [GENERATION_PUBLICATION_IDS.sourceGenerationId],
    "GENERATION_PREPARATION_LAYOUT_INVALID",
  );
  assertSourceGenerationDirectory(paths);
  assertExactDirectory(
    paths.recoveryRoot,
    [`operation-${GENERATION_PUBLICATION_IDS.operationId}`],
    "GENERATION_PREPARATION_LAYOUT_INVALID",
  );

  const wrapper = digestBoundedRegularFile(
    paths.wrapperPath,
    MAX_WRAPPER_BYTES,
    "GENERATION_WRAPPER_INVALID",
  );
  const sourceDatabase = digestBoundedRegularFile(
    paths.sourceDatabasePath,
    MAX_CANDIDATE_BYTES,
    "GENERATION_DATABASE_INVALID",
  );
  assertSourceGenerationDirectory(paths);
  const fixture = createGenerationPublicationFixture(
    (() => {
      const sourceManifest = readCanonicalFile(
        paths.manifestPath,
        () => {},
        "GENERATION_SOURCE_MANIFEST_MISMATCH",
      );
      try {
        invariant(
          typeof sourceManifest.value.workspaceId === "string",
          "GENERATION_SOURCE_MANIFEST_MISMATCH",
        );
        return sourceManifest.value.workspaceId;
      } finally {
        sourceManifest.contents.fill(0);
      }
    })(),
    wrapper.digest,
  );
  invariant(
    fixture.inputFingerprint === options.inputFingerprint,
    "GENERATION_PREPARATION_CONFLICT",
  );
  const manifest = readCanonicalFile(
    paths.manifestPath,
    () => {},
    "GENERATION_SOURCE_MANIFEST_MISMATCH",
  );
  let intent;
  let verified;
  let candidate;
  try {
    invariant(
      canonicalJson(manifest.value) === canonicalJson(fixture.sourceManifest),
      "GENERATION_SOURCE_MANIFEST_MISMATCH",
    );
    if (options.nextRecordKind !== "intent") {
      intent = readCanonicalFile(
        paths.intentPath,
        assertIntent,
        "GENERATION_PREPARATION_INTENT_INVALID",
      );
      const expectedIntent = createGenerationPreparationIntent(
        fixture.sourceManifest.workspaceId,
        wrapper.digest,
      );
      invariant(
        canonicalJson(intent.value) === canonicalJson(expectedIntent),
        "GENERATION_PREPARATION_INTENT_INVALID",
      );
    }

    const candidateDirectory = lstatOptional(
      paths.stagingCandidateDirectoryPath,
      "directory",
      "GENERATION_PREPARATION_CANDIDATE_INVALID",
    );
    const buildingDirectory = lstatOptional(
      paths.buildingCandidateDirectoryPath,
      "directory",
      "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
    );
    const discardingDirectory = lstatOptional(
      paths.discardingCandidateDirectoryPath,
      "directory",
      "GENERATION_CANDIDATE_BUILD_LAYOUT_INVALID",
    );
    invariant(
      !lstatOptional(
        paths.candidateGenerationDirectoryPath,
        "directory",
        "GENERATION_PREPARATION_CANDIDATE_INVALID",
      ),
      "GENERATION_PREPARATION_CANDIDATE_LOCATION_INVALID",
    );
    const layout = captureRecordAdvanceLayout(
      paths,
      options.nextRecordKind,
      Boolean(candidateDirectory),
      Boolean(buildingDirectory),
      Boolean(discardingDirectory),
    );
    if (candidateDirectory) {
      candidate = digestBoundedRegularFile(
        paths.stagingDatabasePath,
        MAX_CANDIDATE_BYTES,
        "GENERATION_PREPARATION_CANDIDATE_INVALID",
      );
      assertNoSidecars(paths.stagingDatabasePath);
    }
    invariant(
      options.nextRecordKind !== "operation" || candidate,
      "GENERATION_PREPARATION_CANDIDATE_INVALID",
    );
    if (options.nextRecordKind === "operation") {
      verified = readCanonicalFile(
        paths.verifiedRecordPath,
        assertVerifiedRecord,
        "GENERATION_CANDIDATE_VERIFIED_RECORD_INVALID",
      );
      const expectedVerified = createGenerationCandidateVerifiedRecord({
        intent: intent.value,
        candidateDatabaseDigest: candidate.digest,
        candidateDatabaseSize: Number(candidate.metadata.size),
      });
      invariant(
        canonicalJson(verified.value) === canonicalJson(expectedVerified),
        "GENERATION_CANDIDATE_VERIFIED_RECORD_INVALID",
      );
    }

    verifyIdentity(options.verifyGeneration, {
      role: "source",
      databasePath: paths.sourceDatabasePath,
      expectedIdentity: fixture.sourceIdentity,
      expectedIdentityDigest: fixture.sourceGenerationIdentityDigest,
    });
    if (candidate) {
      verifyIdentity(options.verifyGeneration, {
        role: "candidate",
        databasePath: paths.stagingDatabasePath,
        expectedIdentity: fixture.candidateIdentity,
        expectedIdentityDigest: fixture.candidateGenerationIdentityDigest,
      });
    }

    const layoutAfterVerification = captureRecordAdvanceLayout(
      paths,
      options.nextRecordKind,
      Boolean(candidateDirectory),
      Boolean(buildingDirectory),
      Boolean(discardingDirectory),
    );
    assertSameClosedPreparationLayout(
      layout.directories,
      layoutAfterVerification.directories,
    );
    invariant(
      Boolean(layout.unsealed) === Boolean(layoutAfterVerification.unsealed),
      "GENERATION_CANDIDATE_BUILD_CHANGED",
    );
    if (layout.unsealed && layoutAfterVerification.unsealed) {
      assertSameUnsealedCandidateDirectory(
        layout.unsealed,
        layoutAfterVerification.unsealed,
      );
    }
    assertCanonicalFileUnchanged(
      paths.manifestPath,
      manifest,
      () => {},
      "GENERATION_SOURCE_MANIFEST_MISMATCH",
    );
    if (intent) {
      assertCanonicalFileUnchanged(
        paths.intentPath,
        intent,
        assertIntent,
        "GENERATION_PREPARATION_INTENT_INVALID",
      );
    }
    if (verified) {
      assertCanonicalFileUnchanged(
        paths.verifiedRecordPath,
        verified,
        assertVerifiedRecord,
        "GENERATION_CANDIDATE_VERIFIED_RECORD_INVALID",
      );
    }

    const wrapperAfter = digestBoundedRegularFile(
      paths.wrapperPath,
      MAX_WRAPPER_BYTES,
      "GENERATION_WRAPPER_INVALID",
    );
    const sourceAfter = digestBoundedRegularFile(
      paths.sourceDatabasePath,
      MAX_CANDIDATE_BYTES,
      "GENERATION_DATABASE_INVALID",
    );
    invariant(
      wrapperAfter.digest === wrapper.digest &&
        sameFileIdentity(wrapperAfter.metadata, wrapper.metadata) &&
        sourceAfter.digest === sourceDatabase.digest &&
        sameFileIdentity(sourceAfter.metadata, sourceDatabase.metadata),
      "GENERATION_PREPARATION_FILES_CHANGED",
    );
    if (candidate) {
      const candidateAfter = digestBoundedRegularFile(
        paths.stagingDatabasePath,
        MAX_CANDIDATE_BYTES,
        "GENERATION_PREPARATION_CANDIDATE_INVALID",
      );
      invariant(
        candidateAfter.digest === candidate.digest &&
          sameFileIdentity(candidateAfter.metadata, candidate.metadata),
        "GENERATION_PREPARATION_FILES_CHANGED",
      );
    }
    return deepFreeze({
      paths,
      fixture,
      wrapperDigest: wrapper.digest,
      sourceManifestDigest: manifest.digest,
      intent: intent?.value ?? null,
      intentDigest: intent?.digest ?? null,
      candidatePresent: Boolean(candidate),
      candidateBuildPresent: Boolean(buildingDirectory),
      candidateDiscardingPresent: Boolean(discardingDirectory),
      candidateDatabaseDigest: candidate?.digest ?? null,
      candidateDatabaseSize: candidate ? Number(candidate.metadata.size) : null,
      verifiedRecord: verified?.value ?? null,
      verifiedRecordDigest: verified?.digest ?? null,
    });
  } finally {
    manifest.contents.fill(0);
    intent?.contents.fill(0);
    verified?.contents.fill(0);
  }
}

function loadPreparationContext({
  workspaceRoot,
  operationId,
  inputFingerprint,
  verifyGeneration,
}) {
  assertDigest(
    inputFingerprint,
    "GENERATION_PREPARATION_INPUT_FINGERPRINT_INVALID",
  );
  const paths = getGenerationPreparationPaths(workspaceRoot, operationId);
  for (const directory of [
    paths.workspaceRoot,
    paths.generationsRoot,
    paths.sourceGenerationDirectoryPath,
    paths.recoveryRoot,
    paths.operationDirectoryPath,
  ]) {
    lstatRequired(
      directory,
      "directory",
      "GENERATION_PREPARATION_LAYOUT_INVALID",
    );
  }
  const wrapperSnapshot = digestBoundedRegularFile(
    paths.wrapperPath,
    MAX_WRAPPER_BYTES,
    "GENERATION_WRAPPER_INVALID",
  );
  const sourceDatabaseSnapshot = digestBoundedRegularFile(
    paths.sourceDatabasePath,
    MAX_CANDIDATE_BYTES,
    "GENERATION_DATABASE_INVALID",
  );
  assertSourceGenerationDirectory(paths);

  const intent = readCanonicalFile(
    paths.intentPath,
    assertIntent,
    "GENERATION_PREPARATION_INTENT_INVALID",
  );
  if (intent.value.inputFingerprint !== inputFingerprint) {
    intent.contents.fill(0);
    throw new GenerationPublicationError("GENERATION_PREPARATION_CONFLICT");
  }
  invariant(
    intent.value.operationId === operationId,
    "GENERATION_PREPARATION_INTENT_INVALID",
  );
  const wrapperDigest = wrapperSnapshot.digest;
  const fixture = createGenerationPublicationFixture(
    intent.value.workspaceId,
    wrapperDigest,
  );
  const expectedIntent = createGenerationPreparationIntent(
    intent.value.workspaceId,
    wrapperDigest,
  );
  invariant(
    canonicalJson(intent.value) === canonicalJson(expectedIntent),
    "GENERATION_PREPARATION_INTENT_INVALID",
  );

  const manifest = readCanonicalFile(
    paths.manifestPath,
    () => {},
    "GENERATION_SOURCE_MANIFEST_MISMATCH",
  );
  invariant(
    canonicalJson(manifest.value) === canonicalJson(fixture.sourceManifest) &&
      manifest.digest === intent.value.sourceManifestDigest,
    "GENERATION_SOURCE_MANIFEST_MISMATCH",
  );
  const operation = readCanonicalFile(
    paths.operationRecordPath,
    () => {},
    "GENERATION_OPERATION_INVALID",
  );
  invariant(
    canonicalJson(operation.value) === canonicalJson(fixture.operationRecord),
    "GENERATION_OPERATION_INVALID",
  );

  const stagingDirectory = lstatOptional(
    paths.stagingCandidateDirectoryPath,
    "directory",
    "GENERATION_PREPARATION_CANDIDATE_INVALID",
  );
  const finalDirectory = lstatOptional(
    paths.candidateGenerationDirectoryPath,
    "directory",
    "GENERATION_PREPARATION_CANDIDATE_INVALID",
  );
  invariant(
    Boolean(stagingDirectory) !== Boolean(finalDirectory),
    "GENERATION_PREPARATION_CANDIDATE_LOCATION_INVALID",
  );
  const candidateDatabasePath = stagingDirectory
    ? paths.stagingDatabasePath
    : paths.candidateDatabasePath;
  const candidateSnapshot = digestBoundedRegularFile(
    candidateDatabasePath,
    MAX_CANDIDATE_BYTES,
    "GENERATION_PREPARATION_CANDIDATE_INVALID",
  );
  assertNoSidecars(candidateDatabasePath);
  const candidateDatabaseDigest = candidateSnapshot.digest;
  const candidateDatabaseSize = Number(candidateSnapshot.metadata.size);

  const verified = readCanonicalFile(
    paths.verifiedRecordPath,
    assertVerifiedRecord,
    "GENERATION_CANDIDATE_VERIFIED_RECORD_INVALID",
  );
  const expectedVerified = createGenerationCandidateVerifiedRecord({
    intent: expectedIntent,
    candidateDatabaseDigest,
    candidateDatabaseSize,
  });
  invariant(
    canonicalJson(verified.value) === canonicalJson(expectedVerified),
    "GENERATION_CANDIDATE_VERIFIED_RECORD_INVALID",
  );
  const phase = stagingDirectory ? "staged" : "handed_off";
  const layout = assertClosedPreparationLayout(paths, phase);

  verifyIdentity(verifyGeneration, {
    role: "source",
    databasePath: paths.sourceDatabasePath,
    expectedIdentity: fixture.sourceIdentity,
    expectedIdentityDigest: fixture.sourceGenerationIdentityDigest,
  });
  verifyIdentity(verifyGeneration, {
    role: "candidate",
    databasePath: candidateDatabasePath,
    expectedIdentity: fixture.candidateIdentity,
    expectedIdentityDigest: fixture.candidateGenerationIdentityDigest,
  });

  const layoutAfterVerification = assertClosedPreparationLayout(paths, phase);
  assertSameClosedPreparationLayout(layout, layoutAfterVerification);
  assertCanonicalFileUnchanged(
    paths.intentPath,
    intent,
    assertIntent,
    "GENERATION_PREPARATION_INTENT_INVALID",
  );
  assertCanonicalFileUnchanged(
    paths.verifiedRecordPath,
    verified,
    assertVerifiedRecord,
    "GENERATION_CANDIDATE_VERIFIED_RECORD_INVALID",
  );
  assertCanonicalFileUnchanged(
    paths.manifestPath,
    manifest,
    () => {},
    "GENERATION_SOURCE_MANIFEST_MISMATCH",
  );
  assertCanonicalFileUnchanged(
    paths.operationRecordPath,
    operation,
    () => {},
    "GENERATION_OPERATION_INVALID",
  );
  const wrapperAfter = digestBoundedRegularFile(
    paths.wrapperPath,
    MAX_WRAPPER_BYTES,
    "GENERATION_WRAPPER_INVALID",
  );
  const sourceDatabaseAfter = digestBoundedRegularFile(
    paths.sourceDatabasePath,
    MAX_CANDIDATE_BYTES,
    "GENERATION_DATABASE_INVALID",
  );
  const candidateAfter = digestBoundedRegularFile(
    candidateDatabasePath,
    MAX_CANDIDATE_BYTES,
    "GENERATION_PREPARATION_CANDIDATE_INVALID",
  );
  invariant(
    wrapperAfter.digest === wrapperSnapshot.digest &&
      sameFileIdentity(wrapperAfter.metadata, wrapperSnapshot.metadata) &&
      sourceDatabaseAfter.digest === sourceDatabaseSnapshot.digest &&
      sameFileIdentity(
        sourceDatabaseAfter.metadata,
        sourceDatabaseSnapshot.metadata,
      ) &&
      candidateAfter.digest === candidateSnapshot.digest &&
      sameFileIdentity(candidateAfter.metadata, candidateSnapshot.metadata),
    "GENERATION_PREPARATION_FILES_CHANGED",
  );

  return {
    paths,
    fixture,
    intent,
    verified,
    manifest,
    operation,
    candidateDatabasePath,
    candidateDatabaseDigest,
    candidateDatabaseSize,
    phase,
  };
}

export function verifyGenerationPreparationState(options) {
  const context = loadPreparationContext(options);
  const result = deepFreeze({
    workspaceId: context.intent.value.workspaceId,
    operationId: context.intent.value.operationId,
    inputFingerprint: context.intent.value.inputFingerprint,
    phase: context.phase,
    activeGenerationId: context.fixture.sourceIdentity.generationId,
    sourceManifestDigest: context.manifest.digest,
    intentDigest: context.intent.digest,
    verifiedRecordDigest: context.verified.digest,
    operationRecordDigest: context.operation.digest,
    wrapperDigest: context.intent.value.wrapperDigest,
    sourceGenerationIdentityDigest:
      context.fixture.sourceGenerationIdentityDigest,
    candidateGenerationIdentityDigest:
      context.fixture.candidateGenerationIdentityDigest,
    candidateDatabaseDigest: context.candidateDatabaseDigest,
    candidateDatabaseSize: context.candidateDatabaseSize,
    candidateLocation:
      context.phase === "staged" ? "operation_staging" : "generations",
    sourceGenerationPresent: true,
    candidateStagingPresent: context.phase === "staged",
    candidateGenerationPresent: context.phase === "handed_off",
    handoffOutcome: context.verified.value.handoffOutcome,
    handoffOutcomeDigest: context.verified.value.handoffOutcomeDigest,
  });
  context.intent.contents.fill(0);
  context.verified.contents.fill(0);
  context.manifest.contents.fill(0);
  context.operation.contents.fill(0);
  return result;
}

function validateHandoffOptions(options) {
  invariant(
    isRecord(options) &&
      hasExactKeys(options, [
        "inputFingerprint",
        "operationId",
        "reachFailpoint",
        "verifyGeneration",
        "workspaceRoot",
      ]) &&
      (options.reachFailpoint === undefined ||
        typeof options.reachFailpoint === "function"),
    "GENERATION_PREPARATION_OPTIONS_INVALID",
  );
}

export function handoffPreparedGeneration(options) {
  validateHandoffOptions(options);
  const initial = verifyGenerationPreparationState(options);
  if (initial.phase === "handed_off") {
    return deepFreeze({
      kind: "replayed",
      outcome: initial.handoffOutcome,
      outcomeDigest: initial.handoffOutcomeDigest,
      candidateDatabaseDigest: initial.candidateDatabaseDigest,
    });
  }

  options.reachFailpoint?.(
    deepFreeze({
      failpoint: "after-candidate-read-only-verified",
      state: initial,
    }),
  );
  const reverified = verifyGenerationPreparationState(options);
  invariant(
    reverified.phase === "staged" &&
      canonicalJson(reverified) === canonicalJson(initial),
    "GENERATION_PREPARATION_STATE_CHANGED",
  );
  const paths = getGenerationPreparationPaths(
    options.workspaceRoot,
    options.operationId,
  );
  invariant(
    !lstatOptional(
      paths.candidateGenerationDirectoryPath,
      "directory",
      "GENERATION_PREPARATION_TARGET_EXISTS",
    ),
    "GENERATION_PREPARATION_TARGET_EXISTS",
  );
  assertClosedPreparationLayout(paths, "staged");
  fs.renameSync(
    paths.stagingCandidateDirectoryPath,
    paths.candidateGenerationDirectoryPath,
  );
  const handedOff = verifyGenerationPreparationState(options);
  invariant(
    handedOff.phase === "handed_off" &&
      handedOff.candidateDatabaseDigest === initial.candidateDatabaseDigest,
    "GENERATION_PREPARATION_HANDOFF_INVALID",
  );
  options.reachFailpoint?.(
    deepFreeze({
      failpoint: "after-candidate-moved-into-generations",
      state: handedOff,
    }),
  );
  const confirmed = verifyGenerationPreparationState(options);
  invariant(
    confirmed.phase === "handed_off" &&
      canonicalJson(confirmed) === canonicalJson(handedOff),
    "GENERATION_PREPARATION_STATE_CHANGED",
  );
  return deepFreeze({
    kind: "applied",
    outcome: handedOff.handoffOutcome,
    outcomeDigest: handedOff.handoffOutcomeDigest,
    candidateDatabaseDigest: handedOff.candidateDatabaseDigest,
  });
}

export function writeGenerationPreparationIntent(target, intent) {
  assertIntent(intent);
  writeCanonicalGenerationFile(target, intent);
}

export function writeGenerationCandidateVerifiedRecord(target, record) {
  assertVerifiedRecord(record);
  writeCanonicalGenerationFile(target, record);
}

export function createGenerationPreparationFaultBoundaryRecord({
  processId,
  failpoint,
  state,
}) {
  invariant(
    Number.isSafeInteger(processId) &&
      processId > 0 &&
      GENERATION_PREPARATION_FAILPOINTS.includes(failpoint) &&
      failpoint !== "none" &&
      isRecord(state),
    "GENERATION_PREPARATION_BOUNDARY_INVALID",
  );
  return deepFreeze(
    assertGenerationPreparationFaultBoundaryRecord({
      type: BOUNDARY_FORMAT,
      processId,
      failpoint,
      workspaceId: state.workspaceId,
      operationId: state.operationId,
      phase: state.phase,
      activeGenerationId: state.activeGenerationId,
      candidateLocation: state.candidateLocation,
      sourceManifestDigest: state.sourceManifestDigest,
      intentDigest: state.intentDigest,
      verifiedRecordDigest: state.verifiedRecordDigest,
      operationRecordDigest: state.operationRecordDigest,
      wrapperDigest: state.wrapperDigest,
      candidateDatabaseDigest: state.candidateDatabaseDigest,
      candidateDatabaseSize: state.candidateDatabaseSize,
      handoffOutcomeDigest: state.handoffOutcomeDigest,
      sourceGenerationPresent: state.sourceGenerationPresent,
      candidateStagingPresent: state.candidateStagingPresent,
      candidateGenerationPresent: state.candidateGenerationPresent,
    }),
  );
}

export function assertGenerationPreparationFaultBoundaryRecord(value) {
  invariant(
    hasExactKeys(value, [
      "activeGenerationId",
      "candidateDatabaseDigest",
      "candidateDatabaseSize",
      "candidateGenerationPresent",
      "candidateLocation",
      "candidateStagingPresent",
      "failpoint",
      "handoffOutcomeDigest",
      "intentDigest",
      "operationId",
      "operationRecordDigest",
      "phase",
      "processId",
      "sourceGenerationPresent",
      "sourceManifestDigest",
      "type",
      "verifiedRecordDigest",
      "workspaceId",
      "wrapperDigest",
    ]) &&
      value.type === BOUNDARY_FORMAT &&
      Number.isSafeInteger(value.processId) &&
      value.processId > 0 &&
      GENERATION_PREPARATION_FAILPOINTS.includes(value.failpoint) &&
      value.failpoint !== "none" &&
      typeof value.workspaceId === "string" &&
      /^workspace-[a-z0-9-]{1,48}$/.test(value.workspaceId) &&
      value.operationId === GENERATION_PUBLICATION_IDS.operationId &&
      value.activeGenerationId ===
        GENERATION_PUBLICATION_IDS.sourceGenerationId &&
      value.sourceGenerationPresent === true &&
      typeof value.candidateStagingPresent === "boolean" &&
      typeof value.candidateGenerationPresent === "boolean" &&
      value.candidateStagingPresent !== value.candidateGenerationPresent &&
      Number.isSafeInteger(value.candidateDatabaseSize) &&
      value.candidateDatabaseSize > 0 &&
      value.candidateDatabaseSize <= MAX_CANDIDATE_BYTES &&
      ((value.failpoint === "after-candidate-read-only-verified" &&
        value.phase === "staged" &&
        value.candidateLocation === "operation_staging" &&
        value.candidateStagingPresent === true &&
        value.candidateGenerationPresent === false) ||
        (value.failpoint === "after-candidate-moved-into-generations" &&
          value.phase === "handed_off" &&
          value.candidateLocation === "generations" &&
          value.candidateStagingPresent === false &&
          value.candidateGenerationPresent === true)),
    "GENERATION_PREPARATION_BOUNDARY_INVALID",
  );
  for (const key of [
    "candidateDatabaseDigest",
    "handoffOutcomeDigest",
    "intentDigest",
    "operationRecordDigest",
    "sourceManifestDigest",
    "verifiedRecordDigest",
    "wrapperDigest",
  ]) {
    assertDigest(value[key], "GENERATION_PREPARATION_BOUNDARY_INVALID");
  }
  return value;
}

export function createGenerationCandidateBuildFaultBoundaryRecord({
  processId,
  failpoint,
  state,
}) {
  invariant(
    Number.isSafeInteger(processId) &&
      processId > 0 &&
      GENERATION_CANDIDATE_BUILD_FAILPOINTS.includes(failpoint) &&
      failpoint !== "none" &&
      isRecord(state),
    "GENERATION_CANDIDATE_BUILD_BOUNDARY_INVALID",
  );
  return deepFreeze(
    assertGenerationCandidateBuildFaultBoundaryRecord({
      type: CANDIDATE_BUILD_BOUNDARY_FORMAT,
      processId,
      failpoint,
      workspaceId: state.workspaceId,
      operationId: state.operationId,
      activeGenerationId: state.activeGenerationId,
      candidateGenerationId: state.candidateGenerationId,
      candidateGenerationIdentityDigest:
        state.candidateGenerationIdentityDigest,
      sourceManifestDigest: state.sourceManifestDigest,
      intentDigest: state.intentDigest,
      wrapperDigest: state.wrapperDigest,
      candidateBuildingPresent: state.candidateBuildingPresent,
      candidateStagingPresent: state.candidateStagingPresent,
      candidateGenerationPresent: state.candidateGenerationPresent,
      migrationTransactionOpen: state.migrationTransactionOpen,
      resultPublished: false,
    }),
  );
}

export function assertGenerationCandidateBuildFaultBoundaryRecord(value) {
  invariant(
    hasExactKeys(value, [
      "activeGenerationId",
      "candidateBuildingPresent",
      "candidateGenerationId",
      "candidateGenerationIdentityDigest",
      "candidateGenerationPresent",
      "candidateStagingPresent",
      "failpoint",
      "intentDigest",
      "migrationTransactionOpen",
      "operationId",
      "processId",
      "resultPublished",
      "sourceManifestDigest",
      "type",
      "workspaceId",
      "wrapperDigest",
    ]) &&
      value.type === CANDIDATE_BUILD_BOUNDARY_FORMAT &&
      Number.isSafeInteger(value.processId) &&
      value.processId > 0 &&
      GENERATION_CANDIDATE_BUILD_FAILPOINTS.includes(value.failpoint) &&
      value.failpoint !== "none" &&
      typeof value.workspaceId === "string" &&
      /^workspace-[a-z0-9-]{1,48}$/.test(value.workspaceId) &&
      value.operationId === GENERATION_PUBLICATION_IDS.operationId &&
      value.activeGenerationId ===
        GENERATION_PUBLICATION_IDS.sourceGenerationId &&
      value.candidateGenerationId ===
        GENERATION_PUBLICATION_IDS.candidateGenerationId &&
      typeof value.candidateBuildingPresent === "boolean" &&
      typeof value.candidateStagingPresent === "boolean" &&
      typeof value.candidateGenerationPresent === "boolean" &&
      typeof value.migrationTransactionOpen === "boolean" &&
      value.resultPublished === false &&
      (value.failpoint === "after-verified-candidate-renamed"
        ? !value.candidateBuildingPresent && value.candidateStagingPresent
        : value.candidateBuildingPresent && !value.candidateStagingPresent) &&
      !value.candidateGenerationPresent &&
      (value.failpoint === "during-sqlcipher-export" ||
      value.failpoint === "during-synthetic-migration"
        ? value.migrationTransactionOpen
        : !value.migrationTransactionOpen),
    "GENERATION_CANDIDATE_BUILD_BOUNDARY_INVALID",
  );
  for (const key of [
    "candidateGenerationIdentityDigest",
    "intentDigest",
    "sourceManifestDigest",
    "wrapperDigest",
  ]) {
    assertDigest(value[key], "GENERATION_CANDIDATE_BUILD_BOUNDARY_INVALID");
  }
  return value;
}
