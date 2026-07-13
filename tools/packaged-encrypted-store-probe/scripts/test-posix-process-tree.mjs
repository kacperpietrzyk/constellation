import assert from "node:assert/strict";

import {
  classifyProcessProbeError,
  originalPosixProcessGroupAbsent,
  parsePosixProcessSnapshot,
  readPosixProcessSnapshot,
  selectPosixProcessGroup,
} from "./posix-process-tree.mjs";

const rootLine = "100 1 100 501 Sun Jul 13 07:00:00 2026";
const childLine = "101 100 100 501 Sun Jul 13 07:00:01 2026";
const unrelatedLine = "200 1 200 502 Sun Jul 13 07:00:02 2026";
const snapshot = parsePosixProcessSnapshot(
  `${rootLine}\n${childLine}\n${unrelatedLine}\n`,
);
const originalGroup = selectPosixProcessGroup(snapshot, 100, {
  expectedUid: 501,
});
const unsignedUidGroup = selectPosixProcessGroup(
  parsePosixProcessSnapshot("300 1 300 4294967294 Sun Jul 13 07:00:00 2026\n"),
  300,
  { expectedUid: 4294967294 },
);
assert.equal(unsignedUidGroup[0].uid, 4294967294);

assert.deepEqual(
  originalGroup.map((identity) => identity.pid),
  [100, 101],
);
assert.equal(originalPosixProcessGroupAbsent(originalGroup, []), true);

const escapedOriginal = parsePosixProcessSnapshot(
  "101 100 999 501 Sun Jul 13 07:00:01 2026\n",
);
assert.equal(
  originalPosixProcessGroupAbsent(originalGroup, escapedOriginal),
  false,
);

const reusedChildPid = parsePosixProcessSnapshot(
  "101 999 999 501 Sun Jul 13 07:01:01 2026\n",
);
assert.equal(
  originalPosixProcessGroupAbsent(originalGroup, reusedChildPid),
  true,
);

const leaderlessNewMember = parsePosixProcessSnapshot(
  "102 1 100 501 Sun Jul 13 07:01:02 2026\n",
);
assert.equal(
  originalPosixProcessGroupAbsent(originalGroup, leaderlessNewMember),
  false,
);

const reusedNumericGroup = parsePosixProcessSnapshot(
  "100 1 100 502 Sun Jul 13 07:02:00 2026\n103 100 100 502 Sun Jul 13 07:02:01 2026\n",
);
assert.equal(
  originalPosixProcessGroupAbsent(originalGroup, reusedNumericGroup),
  true,
);

assert.throws(
  () =>
    parsePosixProcessSnapshot(
      `${rootLine}\n100 1 100 501 Sun Jul 13 07:00:03 2026\n`,
    ),
  /POSIX_PROCESS_IDENTITIES_INVALID/,
);
assert.throws(
  () => parsePosixProcessSnapshot("100 100 501 invalid\n"),
  /POSIX_PROCESS_SNAPSHOT_INVALID/,
);
assert.throws(
  () => selectPosixProcessGroup(snapshot, 101, { expectedUid: 501 }),
  /POSIX_PROCESS_GROUP_SNAPSHOT_INVALID/,
);
assert.throws(
  () => selectPosixProcessGroup(snapshot, 100, { expectedUid: 0 }),
  /POSIX_PROCESS_GROUP_SNAPSHOT_INVALID/,
);
assert.throws(
  () =>
    selectPosixProcessGroup(
      parsePosixProcessSnapshot(
        `${rootLine}\n101 100 999 501 Sun Jul 13 07:00:01 2026\n`,
      ),
      100,
      { expectedUid: 501 },
    ),
  /POSIX_PROCESS_TREE_ESCAPED_GROUP/,
);

const injectedSnapshot = readPosixProcessSnapshot({
  spawnSyncImpl: (executable, args, options) => {
    assert.equal(executable, "/bin/ps");
    assert.deepEqual(args, ["-axo", "pid=,ppid=,pgid=,uid=,lstart="]);
    assert.equal(options.env.LC_ALL, "C");
    return {
      status: 0,
      signal: null,
      stdout: `${rootLine}\n`,
    };
  },
});
assert.equal(injectedSnapshot[0].pid, 100);
assert.throws(
  () =>
    readPosixProcessSnapshot({
      spawnSyncImpl: () => ({ status: 1, signal: null, stdout: "" }),
    }),
  /POSIX_PROCESS_SNAPSHOT_FAILED/,
);
assert.throws(
  () =>
    readPosixProcessSnapshot({
      spawnSyncImpl: () => ({
        status: 0,
        signal: null,
        stdout: "malformed\n",
      }),
    }),
  /POSIX_PROCESS_SNAPSHOT_INVALID/,
);

assert.equal(classifyProcessProbeError({ code: "ESRCH" }), "absent");
assert.equal(classifyProcessProbeError({ code: "EPERM" }), "present");
assert.throws(
  () => classifyProcessProbeError(new Error("unexpected")),
  /unexpected/,
);

process.stdout.write(
  `${JSON.stringify({
    status: "pass",
    originalIdentityTracking: true,
    escapedMemberRejected: true,
    pidReuseHandled: true,
    groupReuseHandled: true,
    unsignedUidSupported: true,
    malformedSnapshotsRejected: true,
    epermFailsClosed: true,
  })}\n`,
);
