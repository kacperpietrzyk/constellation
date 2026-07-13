import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  GenerationPublicationError,
  canonicalGenerationBytes,
  digestGenerationValue,
  writeCanonicalGenerationFile,
} from "./generation-publication.mjs";

export const IMMUTABLE_RECORD_PUBLICATION_SCENARIO =
  "generation-immutable-record-publication";
export const IMMUTABLE_RECORD_KINDS = Object.freeze([
  "intent",
  "candidate-verified",
  "operation",
]);
export const IMMUTABLE_RECORD_FAILPOINTS = Object.freeze([
  "none",
  "after-intent-temp-synced",
  "after-intent-target-published",
  "after-candidate-verified-temp-synced",
  "after-candidate-verified-target-published",
  "after-operation-temp-synced",
  "after-operation-target-published",
]);

const RECORD_FILENAMES = Object.freeze({
  intent: "intent.json",
  "candidate-verified": "candidate-verified.json",
  operation: "operation.json",
});
const OUTCOME_FORMAT = "constellation.immutable-record-outcome/v1";
const STATE_FORMAT = "constellation.immutable-record-fault-state/v1";
const BOUNDARY_FORMAT = "constellation.immutable-record-fault-boundary/v1";
const MAX_RECORD_BYTES = 64 * 1024;

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

function assertCanonicalJsonValue(value, seen = new Set()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    invariant(
      Number.isSafeInteger(value) && !Object.is(value, -0),
      "GENERATION_RECORD_VALUE_INVALID",
    );
    return;
  }
  invariant(
    (Array.isArray(value) || isRecord(value)) && !seen.has(value),
    "GENERATION_RECORD_VALUE_INVALID",
  );
  seen.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    invariant(
      Array.isArray(value)
        ? prototype === Array.prototype
        : prototype === Object.prototype || prototype === null,
      "GENERATION_RECORD_VALUE_INVALID",
    );
    const ownKeys = Reflect.ownKeys(value);
    const expectedDataKeys = Array.isArray(value)
      ? Array.from({ length: value.length }, (_, index) => String(index))
      : Object.keys(value);
    const expectedOwnKeys = Array.isArray(value)
      ? [...expectedDataKeys, "length"]
      : expectedDataKeys;
    invariant(
      ownKeys.length === expectedOwnKeys.length &&
        expectedOwnKeys.every((key, index) => ownKeys[index] === key),
      "GENERATION_RECORD_VALUE_INVALID",
    );
    for (const key of expectedDataKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      invariant(
        descriptor &&
          Object.hasOwn(descriptor, "value") &&
          descriptor.enumerable === true,
        "GENERATION_RECORD_VALUE_INVALID",
      );
      assertCanonicalJsonValue(descriptor.value, seen);
    }
  } finally {
    seen.delete(value);
  }
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function hasLinkCount(snapshot, expected) {
  return snapshot?.metadata.nlink === BigInt(expected);
}

function sameStableFile(left, right) {
  return (
    sameFileIdentity(left, right) &&
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

function lstatDirectory(target) {
  let metadata;
  try {
    metadata = fs.lstatSync(target, { bigint: true });
  } catch {
    throw new GenerationPublicationError("GENERATION_RECORD_PARENT_INVALID");
  }
  invariant(
    metadata.isDirectory() && !metadata.isSymbolicLink(),
    "GENERATION_RECORD_PARENT_INVALID",
  );
  return metadata;
}

function readOptionalFile(target, code) {
  let before;
  try {
    before = fs.lstatSync(target, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw new GenerationPublicationError(code);
  }
  invariant(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.size >= 0n &&
      before.size <= BigInt(MAX_RECORD_BYTES),
    code,
  );
  let descriptor;
  let contents;
  try {
    descriptor = fs.openSync(target, "r");
    const opened = fs.fstatSync(descriptor, { bigint: true });
    invariant(opened.isFile() && sameStableFile(before, opened), code);
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
    let pathAfter;
    try {
      pathAfter = fs.lstatSync(target, { bigint: true });
    } catch {
      throw new GenerationPublicationError(code);
    }
    invariant(
      pathAfter.isFile() &&
        !pathAfter.isSymbolicLink() &&
        sameStableFile(opened, after) &&
        sameStableFile(after, pathAfter),
      code,
    );
    return { contents, metadata: pathAfter };
  } catch (error) {
    contents?.fill(0);
    if (error instanceof GenerationPublicationError) throw error;
    throw new GenerationPublicationError(code);
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        throw new GenerationPublicationError(code);
      }
    }
  }
}

function inspectRecordPaths(paths, expectedBytes) {
  const parent = lstatDirectory(paths.parentPath);
  let entries;
  try {
    entries = fs.readdirSync(paths.parentPath);
  } catch {
    throw new GenerationPublicationError("GENERATION_RECORD_PARENT_INVALID");
  }
  invariant(
    entries.every((entry) => {
      const normalizedEntry = entry.toLowerCase();
      const normalizedTarget = paths.targetBasename.toLowerCase();
      if (normalizedEntry === normalizedTarget) {
        return entry === paths.targetBasename;
      }
      if (normalizedEntry.startsWith(`${normalizedTarget}.`)) {
        return entry === paths.temporaryBasename;
      }
      return true;
    }),
    "GENERATION_RECORD_TEMPORARY_INVALID",
  );
  const target = readOptionalFile(
    paths.targetPath,
    "GENERATION_RECORD_TARGET_INVALID",
  );
  const temporary = readOptionalFile(
    paths.temporaryPath,
    "GENERATION_RECORD_TEMPORARY_INVALID",
  );
  const parentAfter = lstatDirectory(paths.parentPath);
  invariant(
    sameDirectoryIdentity(parent, parentAfter),
    "GENERATION_RECORD_PARENT_CHANGED",
  );
  const targetExact = Boolean(target?.contents.equals(expectedBytes));
  const temporaryExact = Boolean(temporary?.contents.equals(expectedBytes));
  const temporaryPrefix = Boolean(
    temporary &&
    temporary.contents.length < expectedBytes.length &&
    expectedBytes
      .subarray(0, temporary.contents.length)
      .equals(temporary.contents),
  );
  const sameIdentity = Boolean(
    target &&
    temporary &&
    sameFileIdentity(target.metadata, temporary.metadata),
  );
  return {
    parent: parentAfter,
    target,
    temporary,
    targetExact,
    temporaryExact,
    temporaryPrefix,
    sameIdentity,
  };
}

function clearInspection(inspection) {
  if (!inspection) return;
  inspection.target?.contents.fill(0);
  inspection.temporary?.contents.fill(0);
}

function assertParentUnchanged(paths, expected) {
  invariant(
    sameDirectoryIdentity(lstatDirectory(paths.parentPath), expected),
    "GENERATION_RECORD_PARENT_CHANGED",
  );
}

function removeTemporary(paths) {
  try {
    fs.unlinkSync(paths.temporaryPath);
  } catch {
    throw new GenerationPublicationError(
      "GENERATION_RECORD_TEMPORARY_CLEANUP_FAILED",
    );
  }
}

function createTemporary(paths, value) {
  try {
    writeCanonicalGenerationFile(paths.temporaryPath, value);
  } catch {
    throw new GenerationPublicationError(
      "GENERATION_RECORD_TEMPORARY_CREATE_FAILED",
    );
  }
}

function syncExistingTemporary(paths, expectedMetadata) {
  let descriptor;
  try {
    descriptor = fs.openSync(paths.temporaryPath, "r+");
    const opened = fs.fstatSync(descriptor, { bigint: true });
    invariant(
      opened.isFile() && sameStableFile(opened, expectedMetadata),
      "GENERATION_RECORD_TEMPORARY_CHANGED",
    );
    fs.fsyncSync(descriptor);
    const synced = fs.fstatSync(descriptor, { bigint: true });
    const pathAfter = fs.lstatSync(paths.temporaryPath, { bigint: true });
    invariant(
      pathAfter.isFile() &&
        !pathAfter.isSymbolicLink() &&
        sameStableFile(opened, synced) &&
        sameStableFile(synced, pathAfter),
      "GENERATION_RECORD_TEMPORARY_CHANGED",
    );
  } catch (error) {
    if (error instanceof GenerationPublicationError) throw error;
    throw new GenerationPublicationError(
      "GENERATION_RECORD_TEMPORARY_SYNC_FAILED",
    );
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        throw new GenerationPublicationError(
          "GENERATION_RECORD_TEMPORARY_SYNC_FAILED",
        );
      }
    }
  }
}

function createOutcome(recordKind, recordDigest, recordSize) {
  const outcome = deepFreeze({
    format: OUTCOME_FORMAT,
    recordKind,
    recordDigest,
    recordSize,
  });
  return { outcome, outcomeDigest: digestGenerationValue(outcome) };
}

function failpointFor(recordKind, phase) {
  return `after-${recordKind}-${phase}`;
}

function createFaultState({
  recordKind,
  phase,
  recordDigest,
  recordSize,
  recoveredPrefix,
  recoveredSyncedTemporary,
  recoveredPublishedLink,
}) {
  return deepFreeze(
    assertImmutableRecordFaultState({
      format: STATE_FORMAT,
      failpoint: failpointFor(recordKind, phase),
      recordKind,
      recordDigest,
      recordSize,
      targetPresent: phase === "target-published",
      temporaryPresent: true,
      sameFileIdentity: phase === "target-published",
      recoveredPrefix,
      recoveredSyncedTemporary,
      recoveredPublishedLink,
    }),
  );
}

export function getImmutableRecordPublicationPaths(
  recordKind,
  targetPath,
  recordDigest,
) {
  invariant(
    IMMUTABLE_RECORD_KINDS.includes(recordKind) &&
      typeof targetPath === "string" &&
      path.isAbsolute(targetPath) &&
      !targetPath.includes("\0") &&
      path.basename(targetPath) === RECORD_FILENAMES[recordKind] &&
      typeof recordDigest === "string" &&
      /^[a-f0-9]{64}$/.test(recordDigest),
    "GENERATION_RECORD_PATH_INVALID",
  );
  const resolvedTarget = path.resolve(targetPath);
  const parentPath = path.dirname(resolvedTarget);
  const targetBasename = path.basename(resolvedTarget);
  const temporaryBasename = `${targetBasename}.${recordDigest}.publishing`;
  return Object.freeze({
    parentPath,
    targetPath: resolvedTarget,
    targetBasename,
    temporaryPath: path.join(parentPath, temporaryBasename),
    temporaryBasename,
  });
}

function validateOptions(options) {
  invariant(
    hasExactKeys(options, [
      "reachFailpoint",
      "recordKind",
      "targetPath",
      "value",
    ]) &&
      IMMUTABLE_RECORD_KINDS.includes(options.recordKind) &&
      isRecord(options.value) &&
      (options.reachFailpoint === undefined ||
        typeof options.reachFailpoint === "function"),
    "GENERATION_RECORD_OPTIONS_INVALID",
  );
}

export function publishImmutableGenerationRecord(options) {
  validateOptions(options);
  const { recordKind, targetPath, value, reachFailpoint } = options;
  assertCanonicalJsonValue(value);
  let expectedBytes;
  try {
    expectedBytes = canonicalGenerationBytes(value);
  } catch {
    throw new GenerationPublicationError("GENERATION_RECORD_VALUE_INVALID");
  }
  invariant(
    expectedBytes.length > 0 && expectedBytes.length <= MAX_RECORD_BYTES,
    "GENERATION_RECORD_VALUE_INVALID",
  );
  const recordDigest = crypto
    .createHash("sha256")
    .update(expectedBytes)
    .digest("hex");
  const paths = getImmutableRecordPublicationPaths(
    recordKind,
    targetPath,
    recordDigest,
  );
  const { outcome, outcomeDigest } = createOutcome(
    recordKind,
    recordDigest,
    expectedBytes.length,
  );
  let recoveredPrefix = false;
  let recoveredSyncedTemporary = false;
  let recoveredPublishedLink = false;
  let initial;
  try {
    initial = inspectRecordPaths(paths, expectedBytes);
    if (initial.target) {
      invariant(initial.targetExact, "GENERATION_RECORD_TARGET_INVALID");
      if (!initial.temporary) {
        invariant(
          hasLinkCount(initial.target, 1),
          "GENERATION_RECORD_LINK_STATE_INVALID",
        );
        return deepFreeze({
          kind: "replayed",
          recordKind,
          recordDigest,
          recordSize: expectedBytes.length,
          outcome,
          outcomeDigest,
          recoveredPrefix,
          recoveredSyncedTemporary,
          recoveredPublishedLink,
        });
      }
      invariant(
        initial.temporaryExact &&
          initial.sameIdentity &&
          hasLinkCount(initial.target, 2) &&
          hasLinkCount(initial.temporary, 2),
        "GENERATION_RECORD_LINK_STATE_INVALID",
      );
      const parent = initial.parent;
      clearInspection(initial);
      initial = undefined;
      const confirmation = inspectRecordPaths(paths, expectedBytes);
      try {
        invariant(
          confirmation.targetExact &&
            confirmation.temporaryExact &&
            confirmation.sameIdentity &&
            hasLinkCount(confirmation.target, 2) &&
            hasLinkCount(confirmation.temporary, 2),
          "GENERATION_RECORD_LINK_STATE_INVALID",
        );
        assertParentUnchanged(paths, parent);
      } finally {
        clearInspection(confirmation);
      }
      removeTemporary(paths);
      recoveredPublishedLink = true;
    } else if (initial.temporary) {
      invariant(
        hasLinkCount(initial.temporary, 1),
        "GENERATION_RECORD_LINK_STATE_INVALID",
      );
      if (initial.temporaryPrefix) {
        const parent = initial.parent;
        const temporaryIdentity = initial.temporary.metadata;
        clearInspection(initial);
        initial = undefined;
        const confirmation = inspectRecordPaths(paths, expectedBytes);
        try {
          invariant(
            !confirmation.target &&
              confirmation.temporaryPrefix &&
              hasLinkCount(confirmation.temporary, 1) &&
              sameStableFile(
                confirmation.temporary.metadata,
                temporaryIdentity,
              ),
            "GENERATION_RECORD_TEMPORARY_CHANGED",
          );
          assertParentUnchanged(paths, parent);
        } finally {
          clearInspection(confirmation);
        }
        removeTemporary(paths);
        recoveredPrefix = true;
      } else {
        invariant(
          initial.temporaryExact,
          "GENERATION_RECORD_TEMPORARY_INVALID",
        );
        recoveredSyncedTemporary = true;
      }
    }
    clearInspection(initial);
    initial = undefined;

    let prepared = inspectRecordPaths(paths, expectedBytes);
    if (prepared.target) {
      try {
        invariant(
          recoveredPublishedLink &&
            prepared.targetExact &&
            hasLinkCount(prepared.target, 1) &&
            !prepared.temporary,
          "GENERATION_RECORD_FINAL_INVALID",
        );
      } finally {
        clearInspection(prepared);
      }
      prepared = undefined;
      return deepFreeze({
        kind: "recovered",
        recordKind,
        recordDigest,
        recordSize: expectedBytes.length,
        outcome,
        outcomeDigest,
        recoveredPrefix,
        recoveredSyncedTemporary,
        recoveredPublishedLink,
      });
    }
    if (!prepared.temporary) {
      invariant(!prepared.target, "GENERATION_RECORD_STATE_INVALID");
      const parent = prepared.parent;
      clearInspection(prepared);
      prepared = undefined;
      assertParentUnchanged(paths, parent);
      createTemporary(paths, value);
      prepared = inspectRecordPaths(paths, expectedBytes);
    }
    invariant(
      !prepared.target &&
        prepared.temporaryExact &&
        hasLinkCount(prepared.temporary, 1),
      "GENERATION_RECORD_TEMPORARY_INVALID",
    );
    const temporaryBeforeSync = prepared.temporary.metadata;
    clearInspection(prepared);
    prepared = undefined;
    syncExistingTemporary(paths, temporaryBeforeSync);
    prepared = inspectRecordPaths(paths, expectedBytes);
    invariant(
      !prepared.target &&
        prepared.temporaryExact &&
        hasLinkCount(prepared.temporary, 1) &&
        sameStableFile(prepared.temporary.metadata, temporaryBeforeSync),
      "GENERATION_RECORD_TEMPORARY_CHANGED",
    );
    const tempState = createFaultState({
      recordKind,
      phase: "temp-synced",
      recordDigest,
      recordSize: expectedBytes.length,
      recoveredPrefix,
      recoveredSyncedTemporary,
      recoveredPublishedLink,
    });
    const parentBeforeTempCallback = prepared.parent;
    const temporaryBeforeTempCallback = prepared.temporary.metadata;
    clearInspection(prepared);
    prepared = undefined;
    reachFailpoint?.(tempState);
    prepared = inspectRecordPaths(paths, expectedBytes);
    invariant(
      !prepared.target &&
        prepared.temporaryExact &&
        hasLinkCount(prepared.temporary, 1) &&
        sameStableFile(
          prepared.temporary.metadata,
          temporaryBeforeTempCallback,
        ),
      "GENERATION_RECORD_TEMPORARY_CHANGED",
    );
    assertParentUnchanged(paths, parentBeforeTempCallback);
    const parentBeforeLink = prepared.parent;
    clearInspection(prepared);
    prepared = undefined;
    try {
      fs.linkSync(paths.temporaryPath, paths.targetPath);
    } catch {
      throw new GenerationPublicationError("GENERATION_RECORD_LINK_FAILED");
    }
    prepared = inspectRecordPaths(paths, expectedBytes);
    invariant(
      prepared.targetExact &&
        prepared.temporaryExact &&
        prepared.sameIdentity &&
        hasLinkCount(prepared.target, 2) &&
        hasLinkCount(prepared.temporary, 2),
      "GENERATION_RECORD_LINK_STATE_INVALID",
    );
    assertParentUnchanged(paths, parentBeforeLink);
    const publishedState = createFaultState({
      recordKind,
      phase: "target-published",
      recordDigest,
      recordSize: expectedBytes.length,
      recoveredPrefix,
      recoveredSyncedTemporary,
      recoveredPublishedLink,
    });
    const parentBeforePublishedCallback = prepared.parent;
    const targetBeforePublishedCallback = prepared.target.metadata;
    const temporaryBeforePublishedCallback = prepared.temporary.metadata;
    clearInspection(prepared);
    prepared = undefined;
    reachFailpoint?.(publishedState);
    prepared = inspectRecordPaths(paths, expectedBytes);
    invariant(
      prepared.targetExact &&
        prepared.temporaryExact &&
        prepared.sameIdentity &&
        hasLinkCount(prepared.target, 2) &&
        hasLinkCount(prepared.temporary, 2) &&
        sameStableFile(
          prepared.target.metadata,
          targetBeforePublishedCallback,
        ) &&
        sameStableFile(
          prepared.temporary.metadata,
          temporaryBeforePublishedCallback,
        ),
      "GENERATION_RECORD_LINK_STATE_CHANGED",
    );
    assertParentUnchanged(paths, parentBeforePublishedCallback);
    clearInspection(prepared);
    prepared = undefined;
    removeTemporary(paths);

    const completed = inspectRecordPaths(paths, expectedBytes);
    try {
      invariant(
        completed.targetExact &&
          hasLinkCount(completed.target, 1) &&
          !completed.temporary,
        "GENERATION_RECORD_FINAL_INVALID",
      );
    } finally {
      clearInspection(completed);
    }
    return deepFreeze({
      kind:
        recoveredPrefix || recoveredSyncedTemporary || recoveredPublishedLink
          ? "recovered"
          : "applied",
      recordKind,
      recordDigest,
      recordSize: expectedBytes.length,
      outcome,
      outcomeDigest,
      recoveredPrefix,
      recoveredSyncedTemporary,
      recoveredPublishedLink,
    });
  } finally {
    clearInspection(initial ?? {});
    expectedBytes.fill(0);
  }
}

export function assertImmutableRecordFaultState(value) {
  invariant(
    hasExactKeys(value, [
      "failpoint",
      "format",
      "recordDigest",
      "recordKind",
      "recordSize",
      "recoveredPrefix",
      "recoveredSyncedTemporary",
      "recoveredPublishedLink",
      "sameFileIdentity",
      "targetPresent",
      "temporaryPresent",
    ]) &&
      value.format === STATE_FORMAT &&
      IMMUTABLE_RECORD_FAILPOINTS.includes(value.failpoint) &&
      value.failpoint !== "none" &&
      IMMUTABLE_RECORD_KINDS.includes(value.recordKind) &&
      value.failpoint.startsWith(`after-${value.recordKind}-`) &&
      /^[a-f0-9]{64}$/.test(value.recordDigest) &&
      Number.isSafeInteger(value.recordSize) &&
      value.recordSize > 0 &&
      value.recordSize <= MAX_RECORD_BYTES &&
      typeof value.targetPresent === "boolean" &&
      value.temporaryPresent === true &&
      typeof value.sameFileIdentity === "boolean" &&
      typeof value.recoveredPrefix === "boolean" &&
      typeof value.recoveredSyncedTemporary === "boolean" &&
      typeof value.recoveredPublishedLink === "boolean" &&
      value.recoveredPublishedLink === false &&
      Number(value.recoveredPrefix) +
        Number(value.recoveredSyncedTemporary) +
        Number(value.recoveredPublishedLink) <=
        1 &&
      ((value.failpoint.endsWith("-temp-synced") &&
        value.targetPresent === false &&
        value.sameFileIdentity === false) ||
        (value.failpoint.endsWith("-target-published") &&
          value.targetPresent === true &&
          value.sameFileIdentity === true)),
    "GENERATION_RECORD_FAULT_STATE_INVALID",
  );
  return value;
}

export function createImmutableRecordFaultBoundaryRecord({
  processId,
  workspaceId,
  operationId,
  state,
}) {
  invariant(
    Number.isSafeInteger(processId) &&
      processId > 0 &&
      typeof workspaceId === "string" &&
      /^workspace-[a-z0-9-]{1,48}$/.test(workspaceId) &&
      typeof operationId === "string" &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        operationId,
      ),
    "GENERATION_RECORD_BOUNDARY_INVALID",
  );
  assertImmutableRecordFaultState(state);
  return deepFreeze(
    assertImmutableRecordFaultBoundaryRecord({
      format: BOUNDARY_FORMAT,
      processId,
      workspaceId,
      operationId,
      state,
    }),
  );
}

export function assertImmutableRecordFaultBoundaryRecord(value) {
  invariant(
    hasExactKeys(value, [
      "format",
      "operationId",
      "processId",
      "state",
      "workspaceId",
    ]) &&
      value.format === BOUNDARY_FORMAT &&
      Number.isSafeInteger(value.processId) &&
      value.processId > 0 &&
      typeof value.workspaceId === "string" &&
      /^workspace-[a-z0-9-]{1,48}$/.test(value.workspaceId) &&
      typeof value.operationId === "string" &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        value.operationId,
      ),
    "GENERATION_RECORD_BOUNDARY_INVALID",
  );
  assertImmutableRecordFaultState(value.state);
  return value;
}
