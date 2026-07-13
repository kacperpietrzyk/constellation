import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256Canonical } from "./capture-command.mjs";

export const GENERATION_PUBLICATION_SCENARIO = "generation-publication-pivot";
export const GENERATION_PUBLICATION_FAILPOINTS = Object.freeze([
  "none",
  "after-temporary-manifest-synced",
  "after-manifest-replaced",
]);
export const GENERATION_PUBLICATION_IDS = Object.freeze({
  sourceGenerationId: "generation-1",
  candidateGenerationId: "generation-2",
  sourcePublicationOperationId: "00000000-0000-4000-8000-000000000200",
  operationId: "00000000-0000-4000-8000-000000000201",
});

const IDENTITY_FORMAT = "constellation.generation-identity/v1";
const MANIFEST_FORMAT = "constellation.workspace-manifest/v1";
const OPERATION_FORMAT = "constellation.generation-operation/v1";
const OUTCOME_FORMAT = "constellation.generation-publication-outcome/v1";
const BOUNDARY_FORMAT =
  "constellation.generation-publication-fault-boundary/v1";
const MAX_JSON_BYTES = 64 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const OPERATION_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const WORKSPACE_ID = /^workspace-[a-z0-9-]{1,48}$/;
const GENERATION_ID = /^generation-[1-9][0-9]{0,8}$/;

export class GenerationPublicationError extends Error {
  constructor(code) {
    super(code);
    this.name = "GenerationPublicationError";
    this.code = code;
  }
}

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

function assertWorkspaceId(value) {
  invariant(
    typeof value === "string" && WORKSPACE_ID.test(value),
    "GENERATION_WORKSPACE_ID_INVALID",
  );
}

function assertGenerationId(value) {
  invariant(
    typeof value === "string" && GENERATION_ID.test(value),
    "GENERATION_ID_INVALID",
  );
}

function assertOperationId(value) {
  invariant(
    typeof value === "string" && OPERATION_ID.test(value),
    "GENERATION_OPERATION_ID_INVALID",
  );
}

function assertDigest(value, code = "GENERATION_DIGEST_INVALID") {
  invariant(typeof value === "string" && SHA256.test(value), code);
}

function digestBytes(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

export function canonicalGenerationBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`, "utf8");
}

export function digestGenerationValue(value) {
  return sha256Canonical(value);
}

function assertGenerationIdentity(value) {
  invariant(
    hasExactKeys(value, [
      "creationOperationId",
      "format",
      "generationId",
      "keyVersion",
      "schemaVersion",
      "sourceGenerationId",
      "workspaceId",
    ]),
    "GENERATION_IDENTITY_INVALID",
  );
  invariant(value.format === IDENTITY_FORMAT, "GENERATION_IDENTITY_INVALID");
  assertWorkspaceId(value.workspaceId);
  assertGenerationId(value.generationId);
  invariant(
    Number.isSafeInteger(value.schemaVersion) && value.schemaVersion > 0,
    "GENERATION_IDENTITY_INVALID",
  );
  invariant(value.keyVersion === 1, "GENERATION_IDENTITY_INVALID");
  assertOperationId(value.creationOperationId);
  invariant(
    value.sourceGenerationId === null ||
      (typeof value.sourceGenerationId === "string" &&
        GENERATION_ID.test(value.sourceGenerationId) &&
        value.sourceGenerationId !== value.generationId),
    "GENERATION_IDENTITY_INVALID",
  );
  return value;
}

export function createGenerationIdentity({
  workspaceId,
  generationId,
  schemaVersion,
  creationOperationId,
  sourceGenerationId,
}) {
  return deepFreeze(
    assertGenerationIdentity({
      format: IDENTITY_FORMAT,
      workspaceId,
      generationId,
      schemaVersion,
      keyVersion: 1,
      creationOperationId,
      sourceGenerationId,
    }),
  );
}

function assertPublicationOutcome(value) {
  invariant(
    hasExactKeys(value, [
      "activeGenerationId",
      "activeGenerationIdentityDigest",
      "format",
      "operationId",
      "workspaceId",
    ]),
    "GENERATION_OUTCOME_INVALID",
  );
  invariant(value.format === OUTCOME_FORMAT, "GENERATION_OUTCOME_INVALID");
  assertWorkspaceId(value.workspaceId);
  assertOperationId(value.operationId);
  assertGenerationId(value.activeGenerationId);
  assertDigest(
    value.activeGenerationIdentityDigest,
    "GENERATION_OUTCOME_INVALID",
  );
  return value;
}

export function createGenerationPublicationOutcome({
  workspaceId,
  operationId,
  activeGenerationId,
  activeGenerationIdentityDigest,
}) {
  return deepFreeze(
    assertPublicationOutcome({
      format: OUTCOME_FORMAT,
      workspaceId,
      operationId,
      activeGenerationId,
      activeGenerationIdentityDigest,
    }),
  );
}

function assertWorkspaceManifest(value) {
  invariant(
    hasExactKeys(value, [
      "activeGenerationId",
      "activeGenerationIdentityDigest",
      "format",
      "keyVersion",
      "publicationInputFingerprint",
      "publicationOperationId",
      "publicationOutcomeDigest",
      "publicationState",
      "workspaceId",
    ]),
    "GENERATION_MANIFEST_INVALID",
  );
  invariant(value.format === MANIFEST_FORMAT, "GENERATION_MANIFEST_INVALID");
  assertWorkspaceId(value.workspaceId);
  assertGenerationId(value.activeGenerationId);
  assertDigest(
    value.activeGenerationIdentityDigest,
    "GENERATION_MANIFEST_INVALID",
  );
  invariant(value.keyVersion === 1, "GENERATION_MANIFEST_INVALID");
  invariant(value.publicationState === "active", "GENERATION_MANIFEST_INVALID");
  assertOperationId(value.publicationOperationId);
  assertDigest(
    value.publicationInputFingerprint,
    "GENERATION_MANIFEST_INVALID",
  );
  assertDigest(value.publicationOutcomeDigest, "GENERATION_MANIFEST_INVALID");
  return value;
}

export function createWorkspaceManifest({
  workspaceId,
  activeGenerationId,
  activeGenerationIdentityDigest,
  publicationOperationId,
  publicationInputFingerprint,
  publicationOutcomeDigest,
}) {
  return deepFreeze(
    assertWorkspaceManifest({
      format: MANIFEST_FORMAT,
      workspaceId,
      activeGenerationId,
      activeGenerationIdentityDigest,
      keyVersion: 1,
      publicationState: "active",
      publicationOperationId,
      publicationInputFingerprint,
      publicationOutcomeDigest,
    }),
  );
}

function assertOperationRecord(value) {
  invariant(
    hasExactKeys(value, [
      "candidateGenerationId",
      "candidateGenerationIdentityDigest",
      "format",
      "inputFingerprint",
      "operationId",
      "publicationOutcome",
      "publicationOutcomeDigest",
      "sourceGenerationId",
      "sourceGenerationIdentityDigest",
      "sourceManifestDigest",
      "state",
      "targetManifestDigest",
      "workspaceId",
      "wrapperDigest",
    ]),
    "GENERATION_OPERATION_INVALID",
  );
  invariant(value.format === OPERATION_FORMAT, "GENERATION_OPERATION_INVALID");
  assertWorkspaceId(value.workspaceId);
  assertOperationId(value.operationId);
  invariant(
    value.state === "candidate_verified",
    "GENERATION_OPERATION_INVALID",
  );
  assertDigest(value.inputFingerprint, "GENERATION_OPERATION_INVALID");
  assertDigest(value.wrapperDigest, "GENERATION_OPERATION_INVALID");
  assertGenerationId(value.sourceGenerationId);
  assertDigest(
    value.sourceGenerationIdentityDigest,
    "GENERATION_OPERATION_INVALID",
  );
  assertGenerationId(value.candidateGenerationId);
  invariant(
    value.candidateGenerationId !== value.sourceGenerationId,
    "GENERATION_OPERATION_INVALID",
  );
  assertDigest(
    value.candidateGenerationIdentityDigest,
    "GENERATION_OPERATION_INVALID",
  );
  assertDigest(value.sourceManifestDigest, "GENERATION_OPERATION_INVALID");
  assertDigest(value.targetManifestDigest, "GENERATION_OPERATION_INVALID");
  assertPublicationOutcome(value.publicationOutcome);
  assertDigest(value.publicationOutcomeDigest, "GENERATION_OPERATION_INVALID");
  invariant(
    value.publicationOutcome.workspaceId === value.workspaceId &&
      value.publicationOutcome.operationId === value.operationId &&
      value.publicationOutcome.activeGenerationId ===
        value.candidateGenerationId &&
      value.publicationOutcome.activeGenerationIdentityDigest ===
        value.candidateGenerationIdentityDigest &&
      digestGenerationValue(value.publicationOutcome) ===
        value.publicationOutcomeDigest,
    "GENERATION_OPERATION_INVALID",
  );
  return value;
}

export function createGenerationOperationRecord({
  workspaceId,
  operationId,
  inputFingerprint,
  wrapperDigest,
  sourceGenerationId,
  sourceGenerationIdentityDigest,
  candidateGenerationId,
  candidateGenerationIdentityDigest,
  sourceManifestDigest,
  targetManifestDigest,
  publicationOutcome,
}) {
  return deepFreeze(
    assertOperationRecord({
      format: OPERATION_FORMAT,
      workspaceId,
      operationId,
      state: "candidate_verified",
      inputFingerprint,
      wrapperDigest,
      sourceGenerationId,
      sourceGenerationIdentityDigest,
      candidateGenerationId,
      candidateGenerationIdentityDigest,
      sourceManifestDigest,
      targetManifestDigest,
      publicationOutcome,
      publicationOutcomeDigest: digestGenerationValue(publicationOutcome),
    }),
  );
}

export function createGenerationPublicationFixture(workspaceId, wrapperDigest) {
  assertWorkspaceId(workspaceId);
  assertDigest(wrapperDigest, "GENERATION_WRAPPER_DIGEST_INVALID");
  const sourceIdentity = createGenerationIdentity({
    workspaceId,
    generationId: GENERATION_PUBLICATION_IDS.sourceGenerationId,
    schemaVersion: 1,
    creationOperationId:
      GENERATION_PUBLICATION_IDS.sourcePublicationOperationId,
    sourceGenerationId: null,
  });
  const candidateIdentity = createGenerationIdentity({
    workspaceId,
    generationId: GENERATION_PUBLICATION_IDS.candidateGenerationId,
    schemaVersion: 2,
    creationOperationId: GENERATION_PUBLICATION_IDS.operationId,
    sourceGenerationId: GENERATION_PUBLICATION_IDS.sourceGenerationId,
  });
  const sourceGenerationIdentityDigest = digestGenerationValue(sourceIdentity);
  const candidateGenerationIdentityDigest =
    digestGenerationValue(candidateIdentity);
  const sourceInputFingerprint = digestGenerationValue({
    format: "constellation.generation-bootstrap-input/v1",
    workspaceId,
    generationId: sourceIdentity.generationId,
    generationIdentityDigest: sourceGenerationIdentityDigest,
    wrapperDigest,
  });
  const sourceOutcome = createGenerationPublicationOutcome({
    workspaceId,
    operationId: GENERATION_PUBLICATION_IDS.sourcePublicationOperationId,
    activeGenerationId: sourceIdentity.generationId,
    activeGenerationIdentityDigest: sourceGenerationIdentityDigest,
  });
  const sourceManifest = createWorkspaceManifest({
    workspaceId,
    activeGenerationId: sourceIdentity.generationId,
    activeGenerationIdentityDigest: sourceGenerationIdentityDigest,
    publicationOperationId:
      GENERATION_PUBLICATION_IDS.sourcePublicationOperationId,
    publicationInputFingerprint: sourceInputFingerprint,
    publicationOutcomeDigest: digestGenerationValue(sourceOutcome),
  });
  const inputFingerprint = digestGenerationValue({
    format: "constellation.generation-publication-input/v1",
    workspaceId,
    operationId: GENERATION_PUBLICATION_IDS.operationId,
    wrapperDigest,
    sourceGenerationId: sourceIdentity.generationId,
    sourceGenerationIdentityDigest,
    candidateGenerationId: candidateIdentity.generationId,
    candidateGenerationIdentityDigest,
    migrationId: "synthetic-schema-v2",
  });
  const conflictInputFingerprint = digestGenerationValue({
    format: "constellation.generation-publication-input/v1",
    workspaceId,
    operationId: GENERATION_PUBLICATION_IDS.operationId,
    wrapperDigest,
    sourceGenerationId: sourceIdentity.generationId,
    sourceGenerationIdentityDigest,
    candidateGenerationId: candidateIdentity.generationId,
    candidateGenerationIdentityDigest,
    migrationId: "synthetic-schema-v2-conflict",
  });
  const publicationOutcome = createGenerationPublicationOutcome({
    workspaceId,
    operationId: GENERATION_PUBLICATION_IDS.operationId,
    activeGenerationId: candidateIdentity.generationId,
    activeGenerationIdentityDigest: candidateGenerationIdentityDigest,
  });
  const targetManifest = createWorkspaceManifest({
    workspaceId,
    activeGenerationId: candidateIdentity.generationId,
    activeGenerationIdentityDigest: candidateGenerationIdentityDigest,
    publicationOperationId: GENERATION_PUBLICATION_IDS.operationId,
    publicationInputFingerprint: inputFingerprint,
    publicationOutcomeDigest: digestGenerationValue(publicationOutcome),
  });
  const operationRecord = createGenerationOperationRecord({
    workspaceId,
    operationId: GENERATION_PUBLICATION_IDS.operationId,
    inputFingerprint,
    wrapperDigest,
    sourceGenerationId: sourceIdentity.generationId,
    sourceGenerationIdentityDigest,
    candidateGenerationId: candidateIdentity.generationId,
    candidateGenerationIdentityDigest,
    sourceManifestDigest: digestGenerationValue(sourceManifest),
    targetManifestDigest: digestGenerationValue(targetManifest),
    publicationOutcome,
  });
  return deepFreeze({
    sourceIdentity,
    candidateIdentity,
    sourceGenerationIdentityDigest,
    candidateGenerationIdentityDigest,
    sourceManifest,
    targetManifest,
    operationRecord,
    inputFingerprint,
    conflictInputFingerprint,
    publicationOutcome,
    publicationOutcomeDigest: digestGenerationValue(publicationOutcome),
  });
}

export function getGenerationPublicationPaths(workspaceRoot, operationId) {
  invariant(
    typeof workspaceRoot === "string" &&
      path.isAbsolute(workspaceRoot) &&
      !workspaceRoot.includes("\0"),
    "GENERATION_WORKSPACE_ROOT_INVALID",
  );
  assertOperationId(operationId);
  const root = path.resolve(workspaceRoot);
  const generationsRoot = path.join(root, "generations");
  const recoveryRoot = path.join(root, "recovery");
  const operationDirectoryPath = path.join(
    recoveryRoot,
    `operation-${operationId}`,
  );
  return Object.freeze({
    workspaceRoot: root,
    manifestPath: path.join(root, "workspace.json"),
    wrapperPath: path.join(root, "key.wrap.json"),
    generationsRoot,
    sourceGenerationDirectoryPath: path.join(
      generationsRoot,
      GENERATION_PUBLICATION_IDS.sourceGenerationId,
    ),
    sourceDatabasePath: path.join(
      generationsRoot,
      GENERATION_PUBLICATION_IDS.sourceGenerationId,
      "workspace.db",
    ),
    candidateGenerationDirectoryPath: path.join(
      generationsRoot,
      GENERATION_PUBLICATION_IDS.candidateGenerationId,
    ),
    candidateDatabasePath: path.join(
      generationsRoot,
      GENERATION_PUBLICATION_IDS.candidateGenerationId,
      "workspace.db",
    ),
    recoveryRoot,
    operationDirectoryPath,
    operationRecordPath: path.join(operationDirectoryPath, "operation.json"),
    temporaryManifestPath: path.join(root, `.workspace-${operationId}.tmp`),
  });
}

function lstatRequired(target, kind, code) {
  let metadata;
  try {
    metadata = fs.lstatSync(target);
  } catch {
    throw new GenerationPublicationError(code);
  }
  invariant(!metadata.isSymbolicLink(), code);
  invariant(kind === "file" ? metadata.isFile() : metadata.isDirectory(), code);
  return metadata;
}

function lstatOptionalFile(target, code) {
  try {
    const metadata = fs.lstatSync(target);
    invariant(!metadata.isSymbolicLink() && metadata.isFile(), code);
    return metadata;
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    if (error instanceof GenerationPublicationError) throw error;
    throw new GenerationPublicationError(code);
  }
}

export function assertRecoverableGenerationSourceSidecars(
  databasePath,
  code = "GENERATION_DATABASE_SIDECAR_INVALID",
) {
  invariant(
    lstatOptionalFile(`${databasePath}-journal`, code) === undefined,
    code,
  );
  for (const suffix of ["-wal", "-shm"]) {
    const metadata = lstatOptionalFile(`${databasePath}${suffix}`, code);
    if (!metadata) continue;
    invariant(
      metadata.nlink === 1 &&
        (suffix === "-wal" ? metadata.size === 0 : metadata.size <= 128 * 1024),
      code,
    );
  }
}

function readCanonicalFile(target, validator, code) {
  const metadata = lstatRequired(target, "file", code);
  invariant(metadata.size > 0 && metadata.size <= MAX_JSON_BYTES, code);
  const contents = fs.readFileSync(target);
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
      fileDigest: digestBytes(contents),
      contents: Buffer.from(contents),
    };
  } finally {
    contents.fill(0);
  }
}

export function writeCanonicalGenerationFile(target, value) {
  const contents = canonicalGenerationBytes(value);
  let descriptor;
  try {
    descriptor = fs.openSync(target, "wx", 0o600);
    fs.writeFileSync(descriptor, contents);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    contents.fill(0);
  }
}

function verifyRequiredLayout(paths) {
  lstatRequired(paths.workspaceRoot, "directory", "GENERATION_LAYOUT_INVALID");
  lstatRequired(
    paths.generationsRoot,
    "directory",
    "GENERATION_LAYOUT_INVALID",
  );
  lstatRequired(
    paths.sourceGenerationDirectoryPath,
    "directory",
    "GENERATION_LAYOUT_INVALID",
  );
  lstatRequired(
    paths.candidateGenerationDirectoryPath,
    "directory",
    "GENERATION_LAYOUT_INVALID",
  );
  lstatRequired(paths.recoveryRoot, "directory", "GENERATION_LAYOUT_INVALID");
  lstatRequired(
    paths.operationDirectoryPath,
    "directory",
    "GENERATION_LAYOUT_INVALID",
  );
  lstatRequired(paths.wrapperPath, "file", "GENERATION_WRAPPER_INVALID");
  lstatRequired(
    paths.sourceDatabasePath,
    "file",
    "GENERATION_DATABASE_INVALID",
  );
  lstatRequired(
    paths.candidateDatabasePath,
    "file",
    "GENERATION_DATABASE_INVALID",
  );
  assertRecoverableGenerationSourceSidecars(paths.sourceDatabasePath);
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    invariant(
      lstatOptionalFile(
        `${paths.candidateDatabasePath}${suffix}`,
        "GENERATION_DATABASE_SIDECAR_INVALID",
      ) === undefined,
      "GENERATION_DATABASE_SIDECAR_INVALID",
    );
  }
}

function assertVerifiedIdentity(actual, expected, expectedDigest) {
  assertGenerationIdentity(actual);
  invariant(
    canonicalJson(actual) === canonicalJson(expected) &&
      digestGenerationValue(actual) === expectedDigest,
    "GENERATION_DATABASE_IDENTITY_MISMATCH",
  );
}

function verifyGenerationCallback(verifyGeneration, context) {
  invariant(
    typeof verifyGeneration === "function",
    "GENERATION_VERIFIER_INVALID",
  );
  const actual = verifyGeneration(Object.freeze(context));
  assertVerifiedIdentity(
    actual,
    context.expectedIdentity,
    context.expectedIdentityDigest,
  );
}

function loadPublicationContext({
  workspaceRoot,
  operationId,
  inputFingerprint,
  verifyGeneration,
}) {
  assertOperationId(operationId);
  assertDigest(inputFingerprint, "GENERATION_INPUT_FINGERPRINT_INVALID");
  const paths = getGenerationPublicationPaths(workspaceRoot, operationId);
  verifyRequiredLayout(paths);
  const operation = readCanonicalFile(
    paths.operationRecordPath,
    assertOperationRecord,
    "GENERATION_OPERATION_INVALID",
  );
  invariant(
    operation.value.operationId === operationId,
    "GENERATION_OPERATION_INVALID",
  );
  if (operation.value.inputFingerprint !== inputFingerprint) {
    operation.contents.fill(0);
    throw new GenerationPublicationError("GENERATION_PUBLICATION_CONFLICT");
  }
  const wrapperContents = fs.readFileSync(paths.wrapperPath);
  const wrapperDigest = digestBytes(wrapperContents);
  wrapperContents.fill(0);
  invariant(
    wrapperDigest === operation.value.wrapperDigest,
    "GENERATION_WRAPPER_CHANGED",
  );
  const fixture = createGenerationPublicationFixture(
    operation.value.workspaceId,
    wrapperDigest,
  );
  invariant(
    operation.value.operationId === GENERATION_PUBLICATION_IDS.operationId &&
      canonicalJson(operation.value) === canonicalJson(fixture.operationRecord),
    "GENERATION_OPERATION_INVALID",
  );
  verifyGenerationCallback(verifyGeneration, {
    role: "source",
    databasePath: paths.sourceDatabasePath,
    expectedIdentity: fixture.sourceIdentity,
    expectedIdentityDigest: fixture.sourceGenerationIdentityDigest,
  });
  verifyGenerationCallback(verifyGeneration, {
    role: "candidate",
    databasePath: paths.candidateDatabasePath,
    expectedIdentity: fixture.candidateIdentity,
    expectedIdentityDigest: fixture.candidateGenerationIdentityDigest,
  });
  return { paths, fixture, operation, wrapperDigest };
}

export function verifyGenerationPublicationState(options) {
  const context = loadPublicationContext(options);
  const manifest = readCanonicalFile(
    context.paths.manifestPath,
    assertWorkspaceManifest,
    "GENERATION_MANIFEST_INVALID",
  );
  const sourceDigest = digestGenerationValue(context.fixture.sourceManifest);
  const targetDigest = digestGenerationValue(context.fixture.targetManifest);
  invariant(
    manifest.digest === sourceDigest || manifest.digest === targetDigest,
    "GENERATION_MANIFEST_UNRECOGNIZED",
  );
  const temporaryMetadata = lstatOptionalFile(
    context.paths.temporaryManifestPath,
    "GENERATION_TEMPORARY_MANIFEST_INVALID",
  );
  let temporaryManifestDigest = null;
  if (temporaryMetadata) {
    const temporary = readCanonicalFile(
      context.paths.temporaryManifestPath,
      assertWorkspaceManifest,
      "GENERATION_TEMPORARY_MANIFEST_INVALID",
    );
    try {
      invariant(
        temporary.digest === targetDigest &&
          canonicalJson(temporary.value) ===
            canonicalJson(context.fixture.targetManifest),
        "GENERATION_TEMPORARY_MANIFEST_INVALID",
      );
      temporaryManifestDigest = temporary.digest;
    } finally {
      temporary.contents.fill(0);
    }
  }
  const activeTarget = manifest.digest === targetDigest;
  invariant(
    canonicalJson(manifest.value) ===
      canonicalJson(
        activeTarget
          ? context.fixture.targetManifest
          : context.fixture.sourceManifest,
      ),
    "GENERATION_MANIFEST_INVALID",
  );
  const result = deepFreeze({
    workspaceId: manifest.value.workspaceId,
    operationId: context.operation.value.operationId,
    inputFingerprint: context.operation.value.inputFingerprint,
    activeGenerationId: manifest.value.activeGenerationId,
    activeGenerationIdentityDigest:
      manifest.value.activeGenerationIdentityDigest,
    manifestDigest: manifest.digest,
    sourceManifestDigest: sourceDigest,
    targetManifestDigest: targetDigest,
    operationRecordDigest: context.operation.digest,
    wrapperDigest: context.wrapperDigest,
    temporaryManifestPresent: temporaryMetadata !== undefined,
    temporaryManifestDigest,
    sourceGenerationPresent: true,
    candidateGenerationPresent: true,
    publicationOutcome: context.fixture.publicationOutcome,
    publicationOutcomeDigest: context.fixture.publicationOutcomeDigest,
  });
  manifest.contents.fill(0);
  context.operation.contents.fill(0);
  return result;
}

function validatePublishOptions(options) {
  invariant(isRecord(options), "GENERATION_PUBLICATION_OPTIONS_INVALID");
  invariant(
    hasExactKeys(options, [
      "inputFingerprint",
      "operationId",
      "reachFailpoint",
      "verifyGeneration",
      "workspaceRoot",
    ]),
    "GENERATION_PUBLICATION_OPTIONS_INVALID",
  );
  invariant(
    options.reachFailpoint === undefined ||
      typeof options.reachFailpoint === "function",
    "GENERATION_FAILPOINT_HANDLER_INVALID",
  );
}

export function publishGenerationManifest(options) {
  validatePublishOptions(options);
  const context = loadPublicationContext(options);
  const manifest = readCanonicalFile(
    context.paths.manifestPath,
    assertWorkspaceManifest,
    "GENERATION_MANIFEST_INVALID",
  );
  const sourceDigest = digestGenerationValue(context.fixture.sourceManifest);
  const targetDigest = digestGenerationValue(context.fixture.targetManifest);
  try {
    if (manifest.digest === targetDigest) {
      invariant(
        canonicalJson(manifest.value) ===
          canonicalJson(context.fixture.targetManifest),
        "GENERATION_MANIFEST_INVALID",
      );
      invariant(
        lstatOptionalFile(
          context.paths.temporaryManifestPath,
          "GENERATION_TEMPORARY_MANIFEST_INVALID",
        ) === undefined,
        "GENERATION_TEMPORARY_MANIFEST_UNEXPECTED",
      );
      return deepFreeze({
        kind: "replayed",
        outcome: context.fixture.publicationOutcome,
        outcomeDigest: context.fixture.publicationOutcomeDigest,
        manifestDigest: targetDigest,
      });
    }
    invariant(
      manifest.digest === sourceDigest &&
        canonicalJson(manifest.value) ===
          canonicalJson(context.fixture.sourceManifest) &&
        manifest.digest === context.operation.value.sourceManifestDigest,
      "GENERATION_SOURCE_MANIFEST_MISMATCH",
    );

    const targetContents = canonicalGenerationBytes(
      context.fixture.targetManifest,
    );
    let descriptor;
    try {
      const existing = lstatOptionalFile(
        context.paths.temporaryManifestPath,
        "GENERATION_TEMPORARY_MANIFEST_INVALID",
      );
      if (existing) {
        const existingManifest = readCanonicalFile(
          context.paths.temporaryManifestPath,
          assertWorkspaceManifest,
          "GENERATION_TEMPORARY_MANIFEST_INVALID",
        );
        try {
          invariant(
            existingManifest.contents.equals(targetContents) &&
              existingManifest.digest === targetDigest,
            "GENERATION_TEMPORARY_MANIFEST_INVALID",
          );
        } finally {
          existingManifest.contents.fill(0);
        }
        descriptor = fs.openSync(context.paths.temporaryManifestPath, "r+");
      } else {
        descriptor = fs.openSync(
          context.paths.temporaryManifestPath,
          "wx",
          0o600,
        );
        fs.writeFileSync(descriptor, targetContents);
      }
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      targetContents.fill(0);
    }

    options.reachFailpoint?.(
      deepFreeze({
        failpoint: "after-temporary-manifest-synced",
        state: verifyGenerationPublicationState(options),
      }),
    );
    fs.renameSync(
      context.paths.temporaryManifestPath,
      context.paths.manifestPath,
    );
    options.reachFailpoint?.(
      deepFreeze({
        failpoint: "after-manifest-replaced",
        state: verifyGenerationPublicationState(options),
      }),
    );

    const published = verifyGenerationPublicationState(options);
    invariant(
      published.manifestDigest === targetDigest &&
        published.activeGenerationId ===
          context.fixture.candidateIdentity.generationId,
      "GENERATION_PUBLICATION_VERIFY_FAILED",
    );
    return deepFreeze({
      kind: "applied",
      outcome: context.fixture.publicationOutcome,
      outcomeDigest: context.fixture.publicationOutcomeDigest,
      manifestDigest: targetDigest,
    });
  } finally {
    manifest.contents.fill(0);
    context.operation.contents.fill(0);
  }
}

export function createGenerationFaultBoundaryRecord({
  processId,
  failpoint,
  state,
}) {
  invariant(
    Number.isSafeInteger(processId) && processId > 0,
    "GENERATION_BOUNDARY_INVALID",
  );
  invariant(
    GENERATION_PUBLICATION_FAILPOINTS.includes(failpoint) &&
      failpoint !== "none",
    "GENERATION_BOUNDARY_INVALID",
  );
  invariant(isRecord(state), "GENERATION_BOUNDARY_INVALID");
  return deepFreeze({
    type: BOUNDARY_FORMAT,
    processId,
    failpoint,
    workspaceId: state.workspaceId,
    operationId: state.operationId,
    activeGenerationId: state.activeGenerationId,
    activeGenerationIdentityDigest: state.activeGenerationIdentityDigest,
    manifestDigest: state.manifestDigest,
    operationRecordDigest: state.operationRecordDigest,
    targetManifestDigest: state.targetManifestDigest,
    wrapperDigest: state.wrapperDigest,
    temporaryManifestPresent: state.temporaryManifestPresent,
    sourceGenerationPresent: state.sourceGenerationPresent,
    candidateGenerationPresent: state.candidateGenerationPresent,
    publicationOutcomeDigest: state.publicationOutcomeDigest,
  });
}

export function assertGenerationFaultBoundaryRecord(value) {
  invariant(
    hasExactKeys(value, [
      "activeGenerationId",
      "activeGenerationIdentityDigest",
      "candidateGenerationPresent",
      "failpoint",
      "manifestDigest",
      "operationId",
      "operationRecordDigest",
      "processId",
      "publicationOutcomeDigest",
      "sourceGenerationPresent",
      "targetManifestDigest",
      "temporaryManifestPresent",
      "type",
      "workspaceId",
      "wrapperDigest",
    ]),
    "GENERATION_BOUNDARY_INVALID",
  );
  invariant(value.type === BOUNDARY_FORMAT, "GENERATION_BOUNDARY_INVALID");
  invariant(
    Number.isSafeInteger(value.processId) && value.processId > 0,
    "GENERATION_BOUNDARY_INVALID",
  );
  invariant(
    GENERATION_PUBLICATION_FAILPOINTS.includes(value.failpoint) &&
      value.failpoint !== "none",
    "GENERATION_BOUNDARY_INVALID",
  );
  assertWorkspaceId(value.workspaceId);
  assertOperationId(value.operationId);
  assertGenerationId(value.activeGenerationId);
  for (const key of [
    "activeGenerationIdentityDigest",
    "manifestDigest",
    "operationRecordDigest",
    "targetManifestDigest",
    "wrapperDigest",
    "publicationOutcomeDigest",
  ]) {
    assertDigest(value[key], "GENERATION_BOUNDARY_INVALID");
  }
  invariant(
    typeof value.temporaryManifestPresent === "boolean" &&
      value.sourceGenerationPresent === true &&
      value.candidateGenerationPresent === true,
    "GENERATION_BOUNDARY_INVALID",
  );
  return value;
}
