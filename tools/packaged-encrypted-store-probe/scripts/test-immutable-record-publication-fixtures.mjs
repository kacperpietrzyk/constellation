import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  IMMUTABLE_RECORD_FAILPOINTS,
  assertImmutableRecordFaultBoundaryRecord,
  assertImmutableRecordFaultState,
  createImmutableRecordFaultBoundaryRecord,
  getImmutableRecordPublicationPaths,
  publishImmutableGenerationRecord,
} from "../app/recovery/immutable-record-publication.mjs";
import {
  GenerationPublicationError,
  canonicalGenerationBytes,
} from "../app/recovery/generation-publication.mjs";

const root = fs.mkdtempSync(
  path.join(os.tmpdir(), "constellation-immutable-record-"),
);
const value = Object.freeze({
  format: "constellation.test-immutable-record/v1",
  operationId: "10000000-0000-4000-8000-000000000201",
  state: "candidate_verified",
});
const expectedBytes = canonicalGenerationBytes(value);
const expectedDigest = crypto
  .createHash("sha256")
  .update(expectedBytes)
  .digest("hex");

function createCase(slug, recordKind = "intent") {
  const directory = path.join(root, slug);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const basename = {
    intent: "intent.json",
    "candidate-verified": "candidate-verified.json",
    operation: "operation.json",
  }[recordKind];
  const targetPath = path.join(directory, basename);
  const paths = getImmutableRecordPublicationPaths(
    recordKind,
    targetPath,
    expectedDigest,
  );
  return {
    directory,
    paths,
    options: {
      recordKind,
      targetPath,
      value,
      reachFailpoint: undefined,
    },
  };
}

function expectCode(callback, code) {
  assert.throws(
    callback,
    (error) =>
      error instanceof GenerationPublicationError && error.code === code,
  );
}

function snapshot(directory) {
  return fs
    .readdirSync(directory)
    .sort()
    .map((name) => {
      const target = path.join(directory, name);
      const metadata = fs.lstatSync(target, { bigint: true });
      if (metadata.isSymbolicLink()) {
        return [name, "symlink", fs.readlinkSync(target)];
      }
      return [
        name,
        metadata.isFile() ? "file" : "other",
        metadata.dev.toString(),
        metadata.ino.toString(),
        metadata.nlink.toString(),
        metadata.size.toString(),
        metadata.isFile() ? fs.readFileSync(target).toString("hex") : "",
      ];
    });
}

function stopAt(testCase, expectedFailpoint) {
  const stop = new Error(`stop:${expectedFailpoint}`);
  assert.throws(
    () =>
      publishImmutableGenerationRecord({
        ...testCase.options,
        reachFailpoint: (state) => {
          assertImmutableRecordFaultState(state);
          if (state.failpoint === expectedFailpoint) throw stop;
        },
      }),
    (error) => error === stop,
  );
}

try {
  assert.deepEqual(IMMUTABLE_RECORD_FAILPOINTS, [
    "none",
    "after-intent-temp-synced",
    "after-intent-target-published",
    "after-candidate-verified-temp-synced",
    "after-candidate-verified-target-published",
    "after-operation-temp-synced",
    "after-operation-target-published",
  ]);

  const tempBoundary = createCase("temp-boundary");
  stopAt(tempBoundary, "after-intent-temp-synced");
  assert.equal(fs.existsSync(tempBoundary.paths.targetPath), false);
  assert.deepEqual(
    fs.readFileSync(tempBoundary.paths.temporaryPath),
    expectedBytes,
  );
  const resumedTemp = publishImmutableGenerationRecord(tempBoundary.options);
  assert.equal(resumedTemp.kind, "recovered");
  assert.equal(resumedTemp.recoveredPrefix, false);
  assert.equal(resumedTemp.recoveredSyncedTemporary, true);
  assert.equal(resumedTemp.recoveredPublishedLink, false);
  assert.equal(fs.existsSync(tempBoundary.paths.temporaryPath), false);
  assert.deepEqual(
    fs.readFileSync(tempBoundary.paths.targetPath),
    expectedBytes,
  );

  const linkBoundary = createCase("link-boundary");
  stopAt(linkBoundary, "after-intent-target-published");
  const linkedTarget = fs.lstatSync(linkBoundary.paths.targetPath, {
    bigint: true,
  });
  const linkedTemporary = fs.lstatSync(linkBoundary.paths.temporaryPath, {
    bigint: true,
  });
  assert.equal(linkedTarget.dev, linkedTemporary.dev);
  assert.equal(linkedTarget.ino, linkedTemporary.ino);
  const resumedLink = publishImmutableGenerationRecord(linkBoundary.options);
  assert.equal(resumedLink.kind, "recovered");
  assert.equal(resumedLink.recoveredSyncedTemporary, false);
  assert.equal(resumedLink.recoveredPublishedLink, true);
  assert.equal(fs.existsSync(linkBoundary.paths.temporaryPath), false);

  const beforeReplay = snapshot(linkBoundary.directory);
  const replay = publishImmutableGenerationRecord(linkBoundary.options);
  assert.equal(replay.kind, "replayed");
  assert.deepEqual(snapshot(linkBoundary.directory), beforeReplay);

  for (const [slug, prefixLength] of [
    ["empty-prefix", 0],
    ["strict-prefix", Math.floor(expectedBytes.length / 2)],
  ]) {
    const prefix = createCase(slug);
    fs.writeFileSync(
      prefix.paths.temporaryPath,
      expectedBytes.subarray(0, prefixLength),
      { flag: "wx", mode: 0o600 },
    );
    const recovered = publishImmutableGenerationRecord(prefix.options);
    assert.equal(recovered.kind, "recovered");
    assert.equal(recovered.recoveredPrefix, true);
    assert.deepEqual(fs.readFileSync(prefix.paths.targetPath), expectedBytes);
  }

  const conflictingValue = Object.freeze({
    ...value,
    state: "candidate_rejected",
  });
  const conflictingBytes = canonicalGenerationBytes(conflictingValue);
  const conflictingDigest = crypto
    .createHash("sha256")
    .update(conflictingBytes)
    .digest("hex");
  try {
    assert.notEqual(conflictingDigest, expectedDigest);
    for (const [slug, prefixLength] of [
      ["empty-conflicting-prefix", 0],
      ["shared-conflicting-prefix", 16],
    ]) {
      assert.deepEqual(
        expectedBytes.subarray(0, prefixLength),
        conflictingBytes.subarray(0, prefixLength),
      );
      const conflict = createCase(slug);
      fs.writeFileSync(
        conflict.paths.temporaryPath,
        expectedBytes.subarray(0, prefixLength),
      );
      const before = snapshot(conflict.directory);
      expectCode(
        () =>
          publishImmutableGenerationRecord({
            ...conflict.options,
            value: conflictingValue,
          }),
        "GENERATION_RECORD_TEMPORARY_INVALID",
      );
      assert.deepEqual(snapshot(conflict.directory), before);
    }
  } finally {
    conflictingBytes.fill(0);
  }

  const nonPrefix = createCase("non-prefix");
  fs.writeFileSync(nonPrefix.paths.temporaryPath, Buffer.from("not-a-prefix"));
  const nonPrefixBefore = snapshot(nonPrefix.directory);
  expectCode(
    () => publishImmutableGenerationRecord(nonPrefix.options),
    "GENERATION_RECORD_TEMPORARY_INVALID",
  );
  assert.deepEqual(snapshot(nonPrefix.directory), nonPrefixBefore);

  const oversized = createCase("oversized");
  fs.writeFileSync(oversized.paths.temporaryPath, Buffer.alloc(64 * 1024 + 1));
  const oversizedBefore = snapshot(oversized.directory);
  expectCode(
    () => publishImmutableGenerationRecord(oversized.options),
    "GENERATION_RECORD_TEMPORARY_INVALID",
  );
  assert.deepEqual(snapshot(oversized.directory), oversizedBefore);

  const symlinkTemporary = createCase("symlink-temporary");
  const outside = path.join(root, "outside-record.json");
  fs.writeFileSync(outside, expectedBytes);
  fs.symlinkSync(outside, symlinkTemporary.paths.temporaryPath);
  expectCode(
    () => publishImmutableGenerationRecord(symlinkTemporary.options),
    "GENERATION_RECORD_TEMPORARY_INVALID",
  );

  const wrongTarget = createCase("wrong-target");
  fs.writeFileSync(wrongTarget.paths.targetPath, Buffer.from("wrong"));
  const wrongTargetBefore = snapshot(wrongTarget.directory);
  expectCode(
    () => publishImmutableGenerationRecord(wrongTarget.options),
    "GENERATION_RECORD_TARGET_INVALID",
  );
  assert.deepEqual(snapshot(wrongTarget.directory), wrongTargetBefore);

  const distinctLinks = createCase("distinct-links");
  fs.writeFileSync(distinctLinks.paths.targetPath, expectedBytes);
  fs.writeFileSync(distinctLinks.paths.temporaryPath, expectedBytes);
  const distinctBefore = snapshot(distinctLinks.directory);
  expectCode(
    () => publishImmutableGenerationRecord(distinctLinks.options),
    "GENERATION_RECORD_LINK_STATE_INVALID",
  );
  assert.deepEqual(snapshot(distinctLinks.directory), distinctBefore);

  const externalTargetLink = createCase("external-target-link");
  publishImmutableGenerationRecord(externalTargetLink.options);
  fs.linkSync(
    externalTargetLink.paths.targetPath,
    path.join(externalTargetLink.directory, "external-alias.json"),
  );
  const externalTargetBefore = snapshot(externalTargetLink.directory);
  expectCode(
    () => publishImmutableGenerationRecord(externalTargetLink.options),
    "GENERATION_RECORD_LINK_STATE_INVALID",
  );
  assert.deepEqual(
    snapshot(externalTargetLink.directory),
    externalTargetBefore,
  );

  const externalTemporaryLink = createCase("external-temporary-link");
  fs.writeFileSync(externalTemporaryLink.paths.temporaryPath, expectedBytes);
  fs.linkSync(
    externalTemporaryLink.paths.temporaryPath,
    path.join(externalTemporaryLink.directory, "external-alias.json"),
  );
  const externalTemporaryBefore = snapshot(externalTemporaryLink.directory);
  expectCode(
    () => publishImmutableGenerationRecord(externalTemporaryLink.options),
    "GENERATION_RECORD_LINK_STATE_INVALID",
  );
  assert.deepEqual(
    snapshot(externalTemporaryLink.directory),
    externalTemporaryBefore,
  );

  const unexpectedSuffix = createCase("unexpected-suffix");
  fs.writeFileSync(
    `${unexpectedSuffix.paths.targetPath}.unexpected`,
    expectedBytes,
  );
  expectCode(
    () => publishImmutableGenerationRecord(unexpectedSuffix.options),
    "GENERATION_RECORD_TEMPORARY_INVALID",
  );

  for (const [slug, entryName] of [
    ["mixed-case-target", "INTENT.JSON"],
    ["mixed-case-suffix", "INTENT.JSON.UNEXPECTED"],
    [
      "mixed-case-temporary",
      `INTENT.JSON.${expectedDigest.toUpperCase()}.PUBLISHING`,
    ],
  ]) {
    const mixedCase = createCase(slug);
    fs.writeFileSync(path.join(mixedCase.directory, entryName), expectedBytes);
    const before = snapshot(mixedCase.directory);
    expectCode(
      () => publishImmutableGenerationRecord(mixedCase.options),
      "GENERATION_RECORD_TEMPORARY_INVALID",
    );
    assert.deepEqual(snapshot(mixedCase.directory), before);
  }

  const tempCallbackSwap = createCase("temp-callback-swap");
  expectCode(
    () =>
      publishImmutableGenerationRecord({
        ...tempCallbackSwap.options,
        reachFailpoint: (state) => {
          if (state.failpoint !== "after-intent-temp-synced") return;
          fs.rmSync(tempCallbackSwap.paths.temporaryPath);
          fs.writeFileSync(tempCallbackSwap.paths.temporaryPath, expectedBytes);
        },
      }),
    "GENERATION_RECORD_TEMPORARY_CHANGED",
  );

  const targetCallbackSwap = createCase("target-callback-swap");
  expectCode(
    () =>
      publishImmutableGenerationRecord({
        ...targetCallbackSwap.options,
        reachFailpoint: (state) => {
          if (state.failpoint !== "after-intent-target-published") return;
          fs.rmSync(targetCallbackSwap.paths.targetPath);
          fs.writeFileSync(targetCallbackSwap.paths.targetPath, expectedBytes);
        },
      }),
    "GENERATION_RECORD_LINK_STATE_CHANGED",
  );

  const callbackOptionsMutation = createCase("callback-options-mutation");
  const mutableOptions = { ...callbackOptionsMutation.options };
  const observedMutationFailpoints = [];
  mutableOptions.reachFailpoint = (state) => {
    observedMutationFailpoints.push(state.failpoint);
    if (state.failpoint === "after-intent-temp-synced") {
      mutableOptions.recordKind = "operation";
      mutableOptions.targetPath = path.join(
        callbackOptionsMutation.directory,
        "operation.json",
      );
      mutableOptions.reachFailpoint = undefined;
    }
  };
  const mutationResult = publishImmutableGenerationRecord(mutableOptions);
  assert.equal(mutationResult.recordKind, "intent");
  assert.equal(mutationResult.outcome.recordKind, "intent");
  assert.deepEqual(observedMutationFailpoints, [
    "after-intent-temp-synced",
    "after-intent-target-published",
  ]);
  assert.equal(fs.existsSync(callbackOptionsMutation.paths.targetPath), true);
  assert.equal(
    fs.existsSync(
      path.join(callbackOptionsMutation.directory, "operation.json"),
    ),
    false,
  );

  for (const recordKind of ["candidate-verified", "operation"]) {
    for (const phase of ["temp-synced", "target-published"]) {
      const record = createCase(`${recordKind}-${phase}`, recordKind);
      stopAt(record, `after-${recordKind}-${phase}`);
      const result = publishImmutableGenerationRecord(record.options);
      assert.equal(result.recordKind, recordKind);
      assert.equal(result.kind, "recovered");
      assert.equal(result.recoveredSyncedTemporary, phase === "temp-synced");
      assert.equal(result.recoveredPublishedLink, phase === "target-published");
    }
  }

  const boundaryState = {
    format: "constellation.immutable-record-fault-state/v1",
    failpoint: "after-intent-temp-synced",
    recordKind: "intent",
    recordDigest: "a".repeat(64),
    recordSize: 1,
    targetPresent: false,
    temporaryPresent: true,
    sameFileIdentity: false,
    recoveredPrefix: false,
    recoveredSyncedTemporary: false,
    recoveredPublishedLink: false,
  };
  const boundary = createImmutableRecordFaultBoundaryRecord({
    processId: 123,
    workspaceId: "workspace-record-boundary",
    operationId: "00000000-0000-4000-8000-000000000201",
    state: boundaryState,
  });
  assert.equal(assertImmutableRecordFaultBoundaryRecord(boundary), boundary);
  expectCode(
    () =>
      assertImmutableRecordFaultState({
        ...boundaryState,
        recoveredPrefix: true,
        recoveredSyncedTemporary: true,
      }),
    "GENERATION_RECORD_FAULT_STATE_INVALID",
  );
  expectCode(
    () =>
      assertImmutableRecordFaultState({
        ...boundaryState,
        recoveredPublishedLink: true,
      }),
    "GENERATION_RECORD_FAULT_STATE_INVALID",
  );

  for (const invalidValue of [
    { invalid: Number.NaN },
    { invalid: -0 },
    { invalid: undefined },
    { invalid: 1n },
  ]) {
    const invalid = createCase(`invalid-value-${typeof invalidValue.invalid}`);
    expectCode(
      () =>
        publishImmutableGenerationRecord({
          ...invalid.options,
          value: invalidValue,
        }),
      "GENERATION_RECORD_VALUE_INVALID",
    );
  }
  const cyclicValue = {};
  cyclicValue.self = cyclicValue;
  const cyclic = createCase("invalid-value-cycle");
  expectCode(
    () =>
      publishImmutableGenerationRecord({
        ...cyclic.options,
        value: cyclicValue,
      }),
    "GENERATION_RECORD_VALUE_INVALID",
  );
  let getterInvoked = false;
  const getterValue = {};
  Object.defineProperty(getterValue, "invalid", {
    enumerable: true,
    get() {
      getterInvoked = true;
      return "value";
    },
  });
  const getter = createCase("invalid-value-getter");
  expectCode(
    () =>
      publishImmutableGenerationRecord({
        ...getter.options,
        value: getterValue,
      }),
    "GENERATION_RECORD_VALUE_INVALID",
  );
  assert.equal(getterInvoked, false);

  for (const [slug, items] of [
    ["empty-array", []],
    ["dense-array", ["one", 2, true, null]],
  ]) {
    const arrayValue = createCase(slug);
    const result = publishImmutableGenerationRecord({
      ...arrayValue.options,
      value: { items },
    });
    assert.equal(result.kind, "applied");
  }
  const sparseArray = [];
  sparseArray[1] = "second";
  const sparse = createCase("invalid-value-sparse-array");
  expectCode(
    () =>
      publishImmutableGenerationRecord({
        ...sparse.options,
        value: { items: sparseArray },
      }),
    "GENERATION_RECORD_VALUE_INVALID",
  );
  let arrayGetterInvoked = false;
  const accessorArray = [];
  Object.defineProperty(accessorArray, "0", {
    enumerable: true,
    get() {
      arrayGetterInvoked = true;
      return "first";
    },
  });
  accessorArray.length = 1;
  const arrayGetter = createCase("invalid-value-array-getter");
  expectCode(
    () =>
      publishImmutableGenerationRecord({
        ...arrayGetter.options,
        value: { items: accessorArray },
      }),
    "GENERATION_RECORD_VALUE_INVALID",
  );
  assert.equal(arrayGetterInvoked, false);

  const createFailure = createCase("create-failure");
  const originalOpenSync = fs.openSync;
  try {
    fs.openSync = (target, ...args) => {
      if (target === createFailure.paths.temporaryPath) {
        const error = new Error("synthetic create failure");
        error.code = "EACCES";
        throw error;
      }
      return originalOpenSync(target, ...args);
    };
    expectCode(
      () => publishImmutableGenerationRecord(createFailure.options),
      "GENERATION_RECORD_TEMPORARY_CREATE_FAILED",
    );
  } finally {
    fs.openSync = originalOpenSync;
  }

  const syncFailure = createCase("sync-failure");
  const originalFsyncSync = fs.fsyncSync;
  try {
    fs.fsyncSync = (descriptor) => {
      const metadata = fs.fstatSync(descriptor);
      if (metadata.isFile()) throw new Error("synthetic sync failure");
      return originalFsyncSync(descriptor);
    };
    expectCode(
      () => publishImmutableGenerationRecord(syncFailure.options),
      "GENERATION_RECORD_TEMPORARY_CREATE_FAILED",
    );
  } finally {
    fs.fsyncSync = originalFsyncSync;
  }

  const resumeSyncFailure = createCase("resume-sync-failure");
  fs.writeFileSync(resumeSyncFailure.paths.temporaryPath, expectedBytes);
  try {
    fs.fsyncSync = () => {
      throw new Error("synthetic resume sync failure");
    };
    expectCode(
      () => publishImmutableGenerationRecord(resumeSyncFailure.options),
      "GENERATION_RECORD_TEMPORARY_SYNC_FAILED",
    );
  } finally {
    fs.fsyncSync = originalFsyncSync;
  }

  const cleanupFailure = createCase("cleanup-failure");
  const originalUnlinkSync = fs.unlinkSync;
  try {
    fs.unlinkSync = (target) => {
      if (target === cleanupFailure.paths.temporaryPath) {
        throw new Error("synthetic cleanup failure");
      }
      return originalUnlinkSync(target);
    };
    expectCode(
      () => publishImmutableGenerationRecord(cleanupFailure.options),
      "GENERATION_RECORD_TEMPORARY_CLEANUP_FAILED",
    );
  } finally {
    fs.unlinkSync = originalUnlinkSync;
  }

  const closeFailure = createCase("close-failure");
  publishImmutableGenerationRecord(closeFailure.options);
  const originalCloseSync = fs.closeSync;
  try {
    fs.closeSync = (descriptor) => {
      originalCloseSync(descriptor);
      const error = new Error("synthetic close failure");
      error.code = "EIO";
      throw error;
    };
    expectCode(
      () => publishImmutableGenerationRecord(closeFailure.options),
      "GENERATION_RECORD_TARGET_INVALID",
    );
  } finally {
    fs.closeSync = originalCloseSync;
  }

  process.stdout.write(
    `${JSON.stringify({
      status: "pass",
      immutableRecordKinds: 3,
      stableCrashBoundaries: 6,
      emptyAndStrictPrefixRecovered: true,
      syncedTemporaryResumed: true,
      publishedHardLinkRecovered: true,
      exactReplayWithoutChurn: true,
      exactTemporaryResyncedBeforePublication: true,
      temporaryNameBindsExpectedDigest: true,
      symlinkOversizeCorruptionRejected: true,
      callbackMutationRejected: true,
      externalHardLinksRejected: true,
      stableFailureTaxonomy: true,
      strictCanonicalJsonValues: true,
      createOnlyHardLinkPublication: true,
      serializedWriterScopeOnly: true,
    })}\n`,
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  expectedBytes.fill(0);
}
