import { spawnSync } from "node:child_process";

const MAX_PROCESS_ID = 0x7fffffff;
const MAX_USER_ID = 0xffffffff;
const MAX_SNAPSHOT_BYTES = 512 * 1024;
const MAX_SNAPSHOT_ROWS = 8_192;
const MAX_CAPTURED_GROUP_MEMBERS = 64;
const WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
const MONTHS = new Set([
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]);

function invariant(condition, code) {
  if (!condition) throw new Error(code);
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function parseBoundedInteger(
  value,
  { allowZero = false, maximum = MAX_PROCESS_ID } = {},
) {
  const pattern = allowZero ? /^(?:0|[1-9][0-9]{0,9})$/ : /^[1-9][0-9]{0,9}$/;
  invariant(pattern.test(value), "POSIX_PROCESS_SNAPSHOT_INVALID");
  const parsed = Number(value);
  invariant(
    Number.isSafeInteger(parsed) &&
      parsed >= (allowZero ? 0 : 1) &&
      parsed <= maximum,
    "POSIX_PROCESS_SNAPSHOT_INVALID",
  );
  return parsed;
}

function parseStartedAt(tokens) {
  invariant(tokens.length === 5, "POSIX_PROCESS_SNAPSHOT_INVALID");
  const [weekday, month, dayText, time, yearText] = tokens;
  invariant(
    WEEKDAYS.has(weekday) &&
      MONTHS.has(month) &&
      /^(?:[1-9]|[12][0-9]|3[01])$/.test(dayText) &&
      /^(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(time) &&
      /^(?:19|20|21)[0-9]{2}$/.test(yearText),
    "POSIX_PROCESS_SNAPSHOT_INVALID",
  );
  return `${weekday} ${month} ${dayText} ${time} ${yearText}`;
}

function isProcessIdentity(value) {
  return (
    hasExactKeys(value, ["pgid", "pid", "ppid", "startedAt", "uid"]) &&
    Number.isSafeInteger(value.pid) &&
    value.pid > 0 &&
    value.pid <= MAX_PROCESS_ID &&
    Number.isSafeInteger(value.ppid) &&
    value.ppid >= 0 &&
    value.ppid <= MAX_PROCESS_ID &&
    Number.isSafeInteger(value.pgid) &&
    value.pgid > 0 &&
    value.pgid <= MAX_PROCESS_ID &&
    Number.isSafeInteger(value.uid) &&
    value.uid >= 0 &&
    value.uid <= MAX_USER_ID &&
    typeof value.startedAt === "string" &&
    /^[\x20-\x7e]{20,32}$/.test(value.startedAt)
  );
}

function assertIdentityArray(values, { maximum = MAX_SNAPSHOT_ROWS } = {}) {
  invariant(
    Array.isArray(values) &&
      values.length <= maximum &&
      values.every(isProcessIdentity) &&
      new Set(values.map((value) => value.pid)).size === values.length,
    "POSIX_PROCESS_IDENTITIES_INVALID",
  );
}

export function parsePosixProcessSnapshot(contents) {
  invariant(
    typeof contents === "string" &&
      Buffer.byteLength(contents, "utf8") <= MAX_SNAPSHOT_BYTES,
    "POSIX_PROCESS_SNAPSHOT_INVALID",
  );
  const lines = contents.split(/\r?\n/).filter((line) => line.trim() !== "");
  invariant(
    lines.length > 0 && lines.length <= MAX_SNAPSHOT_ROWS,
    "POSIX_PROCESS_SNAPSHOT_INVALID",
  );
  const identities = lines.map((line) => {
    invariant(
      Buffer.byteLength(line, "utf8") <= 128,
      "POSIX_PROCESS_SNAPSHOT_INVALID",
    );
    const tokens = line.trim().split(/\s+/);
    invariant(tokens.length === 9, "POSIX_PROCESS_SNAPSHOT_INVALID");
    return Object.freeze({
      pid: parseBoundedInteger(tokens[0]),
      ppid: parseBoundedInteger(tokens[1], { allowZero: true }),
      pgid: parseBoundedInteger(tokens[2]),
      uid: parseBoundedInteger(tokens[3], {
        allowZero: true,
        maximum: MAX_USER_ID,
      }),
      startedAt: parseStartedAt(tokens.slice(4)),
    });
  });
  assertIdentityArray(identities);
  return Object.freeze(identities.sort((left, right) => left.pid - right.pid));
}

export function readPosixProcessSnapshot({ spawnSyncImpl = spawnSync } = {}) {
  invariant(
    typeof spawnSyncImpl === "function",
    "POSIX_PROCESS_SNAPSHOT_READER_INVALID",
  );
  const result = spawnSyncImpl(
    "/bin/ps",
    ["-axo", "pid=,ppid=,pgid=,uid=,lstart="],
    {
      encoding: "utf8",
      env: { ...process.env, LANG: "C", LC_ALL: "C" },
      timeout: 5_000,
      maxBuffer: MAX_SNAPSHOT_BYTES,
      windowsHide: true,
    },
  );
  invariant(
    result &&
      result.status === 0 &&
      result.signal === null &&
      typeof result.stdout === "string",
    "POSIX_PROCESS_SNAPSHOT_FAILED",
  );
  return parsePosixProcessSnapshot(result.stdout);
}

export function selectPosixProcessGroup(
  snapshot,
  rootPid,
  { expectedUid = process.geteuid?.() } = {},
) {
  assertIdentityArray(snapshot);
  invariant(
    Number.isSafeInteger(rootPid) && rootPid > 0 && rootPid <= MAX_PROCESS_ID,
    "POSIX_PROCESS_GROUP_ROOT_INVALID",
  );
  invariant(
    Number.isSafeInteger(expectedUid) &&
      expectedUid >= 0 &&
      expectedUid <= MAX_USER_ID,
    "POSIX_PROCESS_GROUP_UID_INVALID",
  );
  const groupMembers = snapshot.filter((identity) => identity.pgid === rootPid);
  const root = groupMembers.filter(
    (identity) =>
      identity.pid === rootPid &&
      identity.pgid === rootPid &&
      identity.uid === expectedUid,
  );
  invariant(
    groupMembers.length > 0 &&
      groupMembers.length <= MAX_CAPTURED_GROUP_MEMBERS &&
      root.length === 1,
    "POSIX_PROCESS_GROUP_SNAPSHOT_INVALID",
  );
  const descendants = new Set([rootPid]);
  let discovered = true;
  while (discovered) {
    discovered = false;
    for (const identity of snapshot) {
      if (!descendants.has(identity.pid) && descendants.has(identity.ppid)) {
        descendants.add(identity.pid);
        discovered = true;
      }
    }
  }
  invariant(
    snapshot
      .filter((identity) => descendants.has(identity.pid))
      .every((identity) => identity.pgid === rootPid),
    "POSIX_PROCESS_TREE_ESCAPED_GROUP",
  );
  return Object.freeze(
    groupMembers.map((identity) => Object.freeze({ ...identity })),
  );
}

export function originalPosixProcessGroupAbsent(
  originalGroup,
  currentSnapshot,
) {
  assertIdentityArray(originalGroup, { maximum: MAX_CAPTURED_GROUP_MEMBERS });
  assertIdentityArray(currentSnapshot);
  const roots = originalGroup.filter(
    (identity) => identity.pid === identity.pgid,
  );
  invariant(
    originalGroup.length > 0 &&
      roots.length === 1 &&
      originalGroup.every((identity) => identity.pgid === roots[0].pid),
    "POSIX_PROCESS_GROUP_IDENTITIES_INVALID",
  );
  const root = roots[0];
  const originalIdentityStillPresent = originalGroup.some((original) =>
    currentSnapshot.some(
      (current) =>
        current.pid === original.pid &&
        current.startedAt === original.startedAt,
    ),
  );
  if (originalIdentityStillPresent) return false;

  const currentNumericGroup = currentSnapshot.filter(
    (identity) => identity.pgid === root.pid,
  );
  if (currentNumericGroup.length === 0) return true;

  const reusedLeader = currentNumericGroup.find(
    (identity) =>
      identity.pid === root.pid && identity.startedAt !== root.startedAt,
  );
  return reusedLeader !== undefined;
}

export function classifyProcessProbeError(error) {
  if (error?.code === "ESRCH") return "absent";
  if (error?.code === "EPERM") return "present";
  throw error;
}
