import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Why this runner exists, measured on 2026-08-07.
//
// `check` and `test` used to be `&&` chains:
//
//   "check": "npm run format:check && npm run lint && npm run typecheck && npm test"
//   "test":  "npm run clean && npm run build && npm run test:renderer-bundle
//             && npm run test:scripts && node scripts/run-tests.mjs
//             && npm run test:interaction"
//
// A chain reports the FIRST red and then stops, so everything behind it is
// neither green nor red — it is UNMEASURED, and the transcript does not say so.
// The incident that produced this file: `test:scripts` went red, and therefore
// `scripts/run-tests.mjs` (975 kernel tests) and `test:interaction` (334
// renderer tests) did not run even once. The log ended with one failure and
// read, to the person holding it, as one problem in an otherwise verified tree.
// Two whole suites had simply not happened.
//
// So the rule this runner enforces, and the only reason it is worth its own
// file: NOT RUN IS NOT PASS. It is a third status, it is named in the summary
// together with the reason it did not run, and it is visible in the exit code:
//
//   0  every step of the suite ran and passed
//   1  at least one step FAILED (other steps may also not have run)
//   2  nothing failed, but at least one step did NOT RUN
//
// Exit 2 is the whole point. A run that skipped a step is not a green run, even
// when every step it did execute passed.
//
// WHAT THIS RUNNER DOES NOT DO. It does not change what any step measures. Each
// step is an existing npm script, spawned exactly as a human would type it.
// Nothing is disabled, no threshold moves, and the steps run SERIALLY in the
// same order the old chains used — `clean` before `build`, `build` before
// anything that reads its output. Serial is not caution here; it preserves the
// ordering the chains had. (No step in any suite starts a browser or binds a
// port: `test:renderer-layout` is deliberately NOT part of `check`, it is a
// separate CI job on a pinned macOS image — see the `layout` job in ci.yml.)
//
// DEPENDENCIES, and why there are so few. A step is blocked only when running
// it could not produce a real measurement:
//
//   * `build` needs `typecheck`, because both are the same `tsc -b` over the
//     same project graph. If that compile failed, running it again is not a
//     second opinion.
//   * `test:renderer-bundle`, `test:core` and `test:interaction` need `build`,
//     because they read compiled output: bundle bytes under `packages/*/dist`,
//     compiled `*.test.js`, and `@constellation/contracts`, which resolves
//     through `exports` to `dist/src/index.js`.
//
// Everything else is independent ON PURPOSE. `clean` has no dependents: it
// deletes output and produces nothing, so a failure to delete must not swallow
// the suite. `audit:licenses`, `test:scripts`, `format:check`, both lint steps
// and `typecheck` read sources and `node_modules`, so a broken build is no
// reason to leave them unmeasured — that is precisely the coverage the old
// chain lost.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Guard against a step re-entering the runner. Every step below must name a
// LEAF npm script; if one ever named `check`, `test` or `test:quick`, the
// process would fork into itself and the summary would be meaningless. Failing
// loudly beats a fork bomb.
const REENTRY_KEY = "CONSTELLATION_CHECK_RUNNER";

/**
 * Canonical order. A suite is a subset and a subset keeps this relative order,
 * so every suite runs its steps in the order its old `&&` chain did.
 */
export const STEPS = [
  { id: "format:check", needs: [], suites: ["check"] },
  { id: "lint:code", needs: [], suites: ["check"] },
  { id: "lint:md", needs: [], suites: ["check"] },
  { id: "typecheck", needs: [], suites: ["check"] },
  { id: "clean", needs: [], suites: ["check", "test"] },
  { id: "build", needs: ["typecheck"], suites: ["check", "test", "quick"] },
  {
    id: "test:renderer-bundle",
    needs: ["build"],
    suites: ["check", "test", "quick"],
  },
  { id: "audit:licenses", needs: [], suites: ["check", "test"] },
  { id: "test:scripts", needs: [], suites: ["check", "test"] },
  { id: "test:core", needs: ["build"], suites: ["check", "test", "quick"] },
  {
    id: "test:interaction",
    needs: ["build"],
    suites: ["check", "test", "quick"],
  },
];

export const SUITES = ["check", "test", "quick"];

export const PASSED = "PASS";
export const FAILED = "FAIL";
export const NOT_RUN = "NOT RUN";

const usage = () =>
  [
    "Usage: node scripts/run-check.mjs [--suite=check|test|quick] [--skip=id,id] [--list]",
    "",
    "Runs every step of the selected suite, then reports pass / fail / not run.",
    "Exit codes: 0 all passed, 1 something failed, 2 nothing failed but something did not run.",
  ].join("\n");

export const parseArguments = (argv, steps = STEPS) => {
  let suite = "check";
  const skip = new Set();
  let list = false;
  let help = false;

  for (const argument of argv) {
    if (argument === "--list") {
      list = true;
    } else if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument.startsWith("--suite=")) {
      suite = argument.slice("--suite=".length);
    } else if (argument.startsWith("--skip=")) {
      for (const id of argument.slice("--skip=".length).split(",")) {
        if (id.trim() !== "") skip.add(id.trim());
      }
    } else {
      throw new Error(`Unknown argument: ${argument}\n\n${usage()}`);
    }
  }

  if (!SUITES.includes(suite)) {
    throw new Error(
      `Unknown suite "${suite}". Known suites: ${SUITES.join(", ")}.`,
    );
  }

  const known = new Set(steps.map((step) => step.id));
  for (const id of skip) {
    if (!known.has(id)) {
      throw new Error(
        `Cannot skip unknown step "${id}". Known steps: ${[...known].join(", ")}.`,
      );
    }
  }

  return { suite, skip, list, help };
};

export const formatDuration = (milliseconds) => {
  const seconds = milliseconds / 1000;
  if (seconds < 100) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${String(Math.round(seconds - minutes * 60)).padStart(2, "0")}s`;
};

/**
 * Every step of the suite starts as NOT RUN with an explicit reason, and only a
 * process that exited 0 turns one into PASS. The map is built up front and
 * handed to `runSuite` so that a runner which dies halfway — a crash, a Ctrl-C —
 * still has a complete row set to print: the steps it never reached say NOT RUN
 * instead of disappearing from the report.
 */
export const createResults = ({ steps = STEPS, suite, skip = new Set() }) =>
  new Map(
    steps
      .filter((step) => step.suites.includes(suite))
      .map((step) => [
        step.id,
        {
          status: NOT_RUN,
          reason: skip.has(step.id)
            ? "skipped by --skip"
            : "the runner exited before reaching this step",
          milliseconds: 0,
        },
      ]),
  );

/**
 * Runs the suite serially, mutating `results`. `execute` is injected so the
 * decision logic — what blocks what, what counts as passed — is testable
 * without spawning npm.
 */
export const runSuite = ({
  steps = STEPS,
  suite,
  skip = new Set(),
  results,
  execute,
  report = () => {},
}) => {
  const inSuite = steps.filter((step) => step.suites.includes(suite));
  const suiteIds = new Set(inSuite.map((step) => step.id));
  const selected = inSuite.filter((step) => !skip.has(step.id));

  let index = 0;
  for (const step of selected) {
    index += 1;
    const position = `[${index}/${selected.length}]`;

    // A prerequisite that did not pass blocks its dependents, and a prerequisite
    // removed by --skip blocks them too: an unmeasured prerequisite is not a
    // satisfied one.
    const unmet = step.needs.find(
      (id) => suiteIds.has(id) && results.get(id).status !== PASSED,
    );
    if (unmet !== undefined) {
      const because = skip.has(unmet)
        ? `${unmet} was skipped by --skip`
        : `${unmet} did not pass`;
      results.set(step.id, {
        status: NOT_RUN,
        reason: `blocked: ${because}`,
        milliseconds: 0,
      });
      report(`\n${position} ${step.id} — NOT RUN, blocked because ${because}`);
      continue;
    }

    report(`\n${position} ${step.id} — npm run ${step.id}`);
    const startedAt = Date.now();
    const outcome = execute(step.id);
    const milliseconds = Date.now() - startedAt;

    // A step killed by a signal exited without a verdict, and a step whose
    // process never started has no verdict either. Neither is a pass.
    const passed = outcome.status === 0 && outcome.error === undefined;
    const reason =
      outcome.error !== undefined
        ? `could not start: ${outcome.error}`
        : outcome.status === 0
          ? undefined
          : outcome.status === null
            ? `killed by ${outcome.signal}`
            : `exit code ${outcome.status}`;

    results.set(step.id, {
      status: passed ? PASSED : FAILED,
      reason,
      milliseconds,
    });
    report(
      `${position} ${step.id} — ${passed ? PASSED : FAILED} in ${formatDuration(milliseconds)}` +
        `${reason === undefined ? "" : ` (${reason})`}`,
    );
  }

  return results;
};

export const exitCodeFor = (results) => {
  const statuses = [...results.values()].map((result) => result.status);
  if (statuses.includes(FAILED)) return 1;
  if (statuses.includes(NOT_RUN)) return 2;
  return 0;
};

export const formatSummary = (suite, results) => {
  const rows = [...results.entries()];
  const widthStatus = Math.max(...rows.map(([, row]) => row.status.length));
  const widthId = Math.max(...rows.map(([id]) => id.length));

  const passed = rows.filter(([, row]) => row.status === PASSED);
  const failed = rows.filter(([, row]) => row.status === FAILED);
  const notRun = rows.filter(([, row]) => row.status === NOT_RUN);

  const lines = ["", `SUMMARY — suite "${suite}"`, ""];
  for (const [id, row] of rows) {
    lines.push(
      `  ${row.status.padEnd(widthStatus)}  ${id.padEnd(widthId)}  ` +
        `${formatDuration(row.milliseconds).padStart(6)}` +
        `${row.reason === undefined ? "" : `  ${row.reason}`}`,
    );
  }
  lines.push("");
  lines.push(
    `  passed ${passed.length} / failed ${failed.length} / not run ${notRun.length}` +
      ` of ${rows.length} steps in this suite`,
  );
  if (failed.length > 0) {
    lines.push(`  FAILED: ${failed.map(([id]) => id).join(", ")}`);
  }
  if (notRun.length > 0) {
    // Spelled out, because the defect this runner exists for is a reader
    // taking "not red" for "verified".
    lines.push(
      `  NOT RUN — this is not the same as passed: ${notRun.map(([id]) => id).join(", ")}`,
    );
  }
  if (failed.length === 0 && notRun.length === 0) {
    lines.push("  Every step of this suite ran and passed.");
  }
  lines.push("");
  return lines.join("\n");
};

/**
 * Spawn the npm that invoked us, through Node, rather than the bare string
 * "npm". On Windows the executable is `npm.cmd`, and since Node 18 `spawn` no
 * longer resolves that for "npm" — `check` runs on windows-latest in CI, so a
 * bare "npm" would be ENOENT on a third of the matrix. `npm_execpath` points at
 * npm's own JS entry point whenever we were started by `npm run`. Same class of
 * trap as the `pathToFileURL` note in `scripts/run-tests.mjs`.
 */
const spawnNpmScript = (suite) => (id) => {
  const execPath = process.env.npm_execpath;
  const viaNode = execPath !== undefined && execPath.endsWith(".js");
  // The remaining two branches are for a direct `node scripts/run-check.mjs`,
  // where npm never exported its own path. On Windows the executable is
  // `npm.cmd`, and Node refuses to spawn a `.cmd` without a shell — so that one
  // case pays the `shell: true` deprecation warning (DEP0190, measured on
  // 2026-08-07 when this branch was taken on macOS too). Everywhere else it
  // spawns `npm` directly and stays quiet.
  const windowsFallback = !viaNode && process.platform === "win32";
  const child = spawnSync(
    viaNode ? process.execPath : windowsFallback ? "npm.cmd" : "npm",
    viaNode ? [execPath, "run", id] : ["run", id],
    {
      cwd: root,
      stdio: "inherit",
      shell: windowsFallback,
      env: { ...process.env, [REENTRY_KEY]: suite },
    },
  );
  return {
    status: child.status,
    signal: child.signal,
    error: child.error === undefined ? undefined : child.error.message,
  };
};

const main = () => {
  const { suite, skip, list, help } = parseArguments(process.argv.slice(2));

  if (help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  if (process.env[REENTRY_KEY] !== undefined) {
    throw new Error(
      `${REENTRY_KEY}=${process.env[REENTRY_KEY]} is already set: a step re-entered ` +
        "the runner. Steps must name leaf npm scripts, never check / test / test:quick.",
    );
  }

  if (list) {
    const inSuite = STEPS.filter((step) => step.suites.includes(suite));
    const suiteIds = new Set(inSuite.map((step) => step.id));
    for (const step of inSuite.filter((step) => !skip.has(step.id))) {
      const needs = step.needs.filter((id) => suiteIds.has(id));
      process.stdout.write(
        `${step.id}${needs.length > 0 ? ` (needs ${needs.join(", ")})` : ""}\n`,
      );
    }
    return 0;
  }

  const results = createResults({ suite, skip });

  let summaryPrinted = false;
  const printSummary = () => {
    if (summaryPrinted) return;
    summaryPrinted = true;
    process.stdout.write(formatSummary(suite, results));
  };

  // Prints on normal completion AND on an uncaught throw: a runner that dies
  // without a summary is the same defect it was written to remove.
  //
  // WHAT THIS DOES NOT COVER, measured 2026-08-07 rather than assumed. A signal
  // does not produce a summary, and there is no point installing a handler for
  // one. `runSuite` is a synchronous loop of `spawnSync` calls, so the event
  // loop never turns between steps and a queued JS signal handler cannot run
  // until the whole loop is over. The first version of this file had
  // `process.on("SIGINT", …)` here; the measurement was a SIGINT to the process
  // group, which killed the running child (recorded, correctly, as
  // `FAIL … killed by SIGINT`) while the runner itself carried on through
  // lint, typecheck, `clean` and a full rebuild. Installing the listener had
  // ALSO replaced Node's default terminate-on-SIGINT, so Ctrl-C no longer
  // stopped the run at all — it orphaned it. Without the listener, a signal
  // kills the runner immediately, which is what the person pressing Ctrl-C
  // asked for, and the missing summary is honest: that run measured nothing
  // past the step it was on.
  process.on("exit", printSummary);

  runSuite({
    suite,
    skip,
    results,
    execute: spawnNpmScript(suite),
    report: (line) => process.stdout.write(`${line}\n`),
  });

  printSummary();
  return exitCodeFor(results);
};

// Importing this file for its exports (the unit tests do) must not run a suite.
// Compared as URLs, not as paths: `argv[1]` is a system path, and on Windows
// `D:\…` compared against a `file://` specifier never matches.
if (
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  process.exitCode = main();
}
