import assert from "node:assert/strict";
import test from "node:test";

import {
  FAILED,
  NOT_RUN,
  PASSED,
  STEPS,
  createResults,
  exitCodeFor,
  formatSummary,
  parseArguments,
  runSuite,
} from "./run-check.mjs";

// The runner exists to stop a verification chain from hiding what it did not
// measure. An unmeasured runner would be the same defect one level up, so its
// decision logic is exercised here against an injected `execute` — no npm, no
// build, milliseconds instead of minutes.

const fixtureSteps = [
  { id: "alpha", needs: [], suites: ["demo"] },
  { id: "beta", needs: [], suites: ["demo"] },
  { id: "gamma", needs: ["beta"], suites: ["demo"] },
  { id: "delta", needs: ["gamma"], suites: ["demo"] },
];

const run = ({ suite = "demo", skip = new Set(), outcomes = {} } = {}) => {
  const attempted = [];
  const results = createResults({ steps: fixtureSteps, suite, skip });
  runSuite({
    steps: fixtureSteps,
    suite,
    skip,
    results,
    execute: (id) => {
      attempted.push(id);
      return outcomes[id] ?? { status: 0 };
    },
  });
  return { attempted, results, exitCode: exitCodeFor(results) };
};

test("a failing step does not stop the steps that do not depend on it", () => {
  // This is the incident: `test:scripts` went red and 975 + 334 tests never ran.
  const { attempted, results, exitCode } = run({
    outcomes: { alpha: { status: 1 } },
  });

  assert.deepEqual(attempted, ["alpha", "beta", "gamma", "delta"]);
  assert.equal(results.get("alpha").status, FAILED);
  assert.equal(results.get("beta").status, PASSED);
  assert.equal(results.get("delta").status, PASSED);
  assert.equal(exitCode, 1);
});

test("a failing step blocks its dependents, transitively, as NOT RUN", () => {
  const { attempted, results } = run({ outcomes: { beta: { status: 2 } } });

  assert.deepEqual(attempted, ["alpha", "beta"]);
  assert.equal(results.get("gamma").status, NOT_RUN);
  assert.equal(results.get("gamma").reason, "blocked: beta did not pass");
  assert.equal(results.get("delta").status, NOT_RUN);
  assert.equal(results.get("delta").reason, "blocked: gamma did not pass");
});

test("a blocked step is never reported as passed", () => {
  const { results } = run({ outcomes: { beta: { status: 1 } } });
  const statuses = [...results.values()].map((row) => row.status);

  assert.equal(
    statuses.filter((status) => status === PASSED).length,
    1,
    "only alpha ran and passed",
  );
});

test("a skipped step is NOT RUN, blocks its dependents, and cannot exit 0", () => {
  const { attempted, results, exitCode } = run({ skip: new Set(["beta"]) });

  assert.deepEqual(attempted, ["alpha"]);
  assert.equal(results.get("beta").status, NOT_RUN);
  assert.equal(results.get("beta").reason, "skipped by --skip");
  assert.equal(
    results.get("gamma").reason,
    "blocked: beta was skipped by --skip",
  );
  // The whole point: nothing failed, and the run is still not green.
  assert.equal(exitCode, 2);
});

test("a step killed by a signal is a failure, not a pass", () => {
  const { results, exitCode } = run({
    outcomes: { alpha: { status: null, signal: "SIGKILL" } },
  });

  assert.equal(results.get("alpha").status, FAILED);
  assert.equal(results.get("alpha").reason, "killed by SIGKILL");
  assert.equal(exitCode, 1);
});

test("a step whose process never starts is a failure, not a pass", () => {
  const { results, exitCode } = run({
    outcomes: { alpha: { status: null, error: "spawn npm ENOENT" } },
  });

  assert.equal(results.get("alpha").status, FAILED);
  assert.match(results.get("alpha").reason, /ENOENT/);
  assert.equal(exitCode, 1);
});

test("a runner that dies before a step still reports that step as NOT RUN", () => {
  // `createResults` fills the map before anything runs, so the summary printed
  // from the exit hook of a crashed runner still carries every step.
  const results = createResults({ steps: fixtureSteps, suite: "demo" });

  assert.equal(results.size, 4);
  for (const row of results.values()) {
    assert.equal(row.status, NOT_RUN);
    assert.equal(row.reason, "the runner exited before reaching this step");
  }
  assert.equal(exitCodeFor(results), 2);
});

test("every step passing is the only way to exit 0", () => {
  const { exitCode, results } = run();

  assert.equal(exitCode, 0);
  assert.equal(
    [...results.values()].every((row) => row.status === PASSED),
    true,
  );
});

test("the summary names both what failed and what did not run", () => {
  const { results } = run({
    outcomes: { alpha: { status: 1 }, beta: { status: 1 } },
  });
  const summary = formatSummary("demo", results);

  assert.match(summary, /FAILED: alpha, beta/);
  assert.match(
    summary,
    /NOT RUN — this is not the same as passed: gamma, delta/,
  );
  assert.match(summary, /passed 0 \/ failed 2 \/ not run 2 of 4 steps/);
});

test("a green summary says so and says nothing about skipping", () => {
  const { results } = run();
  const summary = formatSummary("demo", results);

  assert.match(summary, /Every step of this suite ran and passed\./);
  assert.equal(summary.includes(NOT_RUN), false);
});

test("--skip rejects a step name that does not exist", () => {
  // A typo in --skip must not silently skip nothing and report a green run.
  assert.throws(
    () => parseArguments(["--skip=tset:core"], fixtureSteps),
    /Cannot skip unknown step "tset:core"/,
  );
});

test("an unknown suite is refused rather than run as empty", () => {
  assert.throws(() => parseArguments(["--suite=nope"]), /Unknown suite "nope"/);
});

test("the real suites keep the order and membership of the chains they replace", () => {
  const idsOf = (suite) =>
    STEPS.filter((step) => step.suites.includes(suite)).map((step) => step.id);

  // `check` was: format:check && lint (code, md) && typecheck && test,
  // where `test` was: clean && build && test:renderer-bundle && test:scripts
  // (which began with audit:licenses) && run-tests.mjs && test:interaction.
  assert.deepEqual(idsOf("check"), [
    "format:check",
    "lint:code",
    "lint:md",
    "typecheck",
    "clean",
    "build",
    "test:renderer-bundle",
    "audit:licenses",
    "test:scripts",
    "test:core",
    "test:interaction",
  ]);
  assert.deepEqual(idsOf("test"), [
    "clean",
    "build",
    "test:renderer-bundle",
    "audit:licenses",
    "test:scripts",
    "test:core",
    "test:interaction",
  ]);
  assert.deepEqual(idsOf("quick"), [
    "build",
    "test:renderer-bundle",
    "test:core",
    "test:interaction",
  ]);
});

test("no step in any suite re-enters the runner", () => {
  // A step naming `check`, `test` or `test:quick` would fork the runner into
  // itself; the runtime guard catches it, this catches it before the run.
  const forbidden = new Set(["check", "test", "test:quick"]);
  for (const step of STEPS) {
    assert.equal(
      forbidden.has(step.id),
      false,
      `${step.id} re-enters the runner`,
    );
  }
});
