import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { describe, it } from "node:test";

import type { ApplicationCommandResponse } from "@constellation/application";
import {
  ExecutionContextSchema,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";

import { createReferenceHarness } from "../src/index.js";

/**
 * `document.linkCandidates` is what the `[[` and `@` triggers read on every
 * keystroke, and it is the query the whole migration-off-Obsidian criterion
 * rests on. Recon could not measure it: the real workspace database is
 * SQLCipher-encrypted and unreadable from a shell, so N — how many Tasks,
 * Projects, People, Organizations, Meetings and Documents a Space holds — was
 * unknown, and an analytic shape is a shape rather than a measurement.
 *
 * This is the instrument recon named. It runs the shipped handler over a
 * kernel with a known N, so it isolates the query from the 120 ms debounce, the
 * IPC hop and React's re-render. Those three are what Kacper will feel; this is
 * the only one a later regression can be attributed to.
 *
 * The BEFORE number is measured too, by running the algorithm this replaced
 * over the same labels: build every candidate, sort the whole Space with
 * `localeCompare(other, "pl", {sensitivity:"base"})` — which constructs a fresh
 * `Intl.Collator` inside every comparison — and only then filter and cut to the
 * limit. Without it "we hoisted the collator" is a claim; with it the cost of
 * the line that was removed is a number.
 *
 * Thresholds here are deliberately loose. This runs on ubuntu, macos and
 * windows runners of unknown load, and a tight wall-clock assertion is a flake
 * generator; the assertion catches an order-of-magnitude regression, and the
 * real numbers go in the diagnostic and the pull request.
 */

const SIZES = [100, 1_000, 5_000] as const;
const SAMPLES = 30;
// Loose on purpose: one call over 5 000 candidates has no business taking a
// quarter of a second on any runner, and anything tighter measures the runner.
const CALL_CEILING_MS = 250;

const ids = {
  workspace: "80000000-0000-4000-8000-000000000001",
  space: "80000000-0000-4000-8000-000000000002",
  principal: "80000000-0000-4000-8000-000000000003",
  credential: "80000000-0000-4000-8000-000000000004",
  grant: "80000000-0000-4000-8000-000000000005",
} as const;

let sequence = 16_384;
const requestId = (): string => {
  const suffix = sequence.toString(16).padStart(12, "0");
  sequence += 1;
  return `80000000-0000-4000-8000-${suffix}`;
};

const context: ExecutionContext = ExecutionContextSchema.parse({
  principalId: ids.principal,
  principalKind: "human",
  credentialId: ids.credential,
  grantId: ids.grant,
  policyVersion: 1,
  workspaceId: ids.workspace,
  spaceScope: [ids.space],
  capabilityScope: [
    "workspace.createLocal",
    "task.create",
    "document.create",
    "document.list",
    "document.linkCandidates",
  ],
  origin: "desktop",
});

const metadata = (key: string) => ({
  contractVersion: 1 as const,
  commandId: requestId(),
  workspaceId: ids.workspace,
  idempotencyKey: key,
  expectedVersions: {},
  correlationId: requestId(),
});

const unwrap = (response: ApplicationCommandResponse): CommandOutcome => {
  assert.equal(response.kind, "command_outcome");
  if (response.kind !== "command_outcome") throw new Error("Expected outcome");
  return response.outcome;
};

const percentile = (values: readonly number[], fraction: number): number =>
  [...values].sort((left, right) => left - right)[
    Math.max(0, Math.ceil(values.length * fraction) - 1)
  ] ?? 0;

// Real titles, not `item-1`: the collator's cost depends on what it compares,
// and a Polish workspace is the case the fold exists for. `Zakłady` is the
// exact pair the MCP catalogue records as unreachable from `Zaklady`.
const NOUNS = [
  "Northstar",
  "Zakłady Chemiczne",
  "Śniadanie z zarządem",
  "Örebro logistics",
  "Nordic renewal",
  "Anna Nordheim",
  "Przegląd architektury",
  "Quarterly review",
] as const;

const labelFor = (index: number): string =>
  `${NOUNS[index % NOUNS.length]} ${Math.floor(index / NOUNS.length)}`;

const seed = (
  size: number,
): { readonly harness: ReturnType<typeof createReferenceHarness> } => {
  const harness = createReferenceHarness();
  harness.authorization.register(context);
  assert.equal(
    unwrap(
      harness.kernel.execute(context, {
        ...metadata(`link-candidates-bootstrap-${size}`),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Link candidate performance workspace",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  // Half Documents, half Tasks. A Document-only seed would never exercise the
  // record arms and a Task-only one would never exercise the arm this wave
  // added, and the sort has to order both against each other.
  for (let index = 0; index < size; index += 1) {
    const suffix = (index + 4_096).toString(16).padStart(12, "0");
    const recordId = `80000000-0000-4000-8000-${suffix}`;
    const outcome = unwrap(
      harness.kernel.execute(
        context,
        index % 2 === 0
          ? {
              ...metadata(`link-candidates-task-${size}-${index}`),
              commandName: "task.create",
              payload: {
                taskId: recordId,
                spaceId: ids.space,
                title: labelFor(index),
              },
            }
          : {
              ...metadata(`link-candidates-document-${size}-${index}`),
              commandName: "document.create",
              payload: {
                documentId: recordId,
                spaceId: ids.space,
                title: labelFor(index),
                role: "note",
              },
            },
      ),
    );
    assert.equal(outcome.outcome, "success");
  }
  return { harness };
};

const measure = (
  harness: ReturnType<typeof createReferenceHarness>,
  parameters: object,
): { readonly p50: number; readonly p95: number; readonly count: number } => {
  const durations: number[] = [];
  let count = 0;
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const started = performance.now();
    const response = harness.kernel.query(context, {
      contractVersion: 1,
      queryName: "document.linkCandidates",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters,
    } as never);
    durations.push(performance.now() - started);
    assert.equal(response.kind, "query_result");
    if (response.kind !== "query_result") throw new Error("Expected query");
    assert.equal(response.result.outcome, "success");
    if (
      response.result.outcome === "success" &&
      response.result.projection.kind === "document.linkCandidates"
    )
      count = response.result.projection.items.length;
  }
  return {
    p50: Math.round(percentile(durations, 0.5) * 1000) / 1000,
    p95: Math.round(percentile(durations, 0.95) * 1000) / 1000,
    count,
  };
};

/**
 * The removed algorithm, run over the same labels so the two numbers are
 * comparable. This is a reimplementation, not the old code path — the old code
 * path is gone — and it is reported as such.
 */
const legacyCost = (labels: readonly string[], text: string): number => {
  const normalized = text.toLocaleLowerCase();
  const started = performance.now();
  const sorted = [...labels].sort((left, right) =>
    left.localeCompare(right, "pl", { sensitivity: "base" }),
  );
  const filtered = sorted
    .filter((label) => label.toLocaleLowerCase().includes(normalized))
    .slice(0, 20);
  assert.ok(filtered.length >= 0);
  return performance.now() - started;
};

describe("document.linkCandidates latency", () => {
  for (const size of SIZES) {
    it(`answers a keystroke over ${size} candidates`, (t) => {
      const seedStarted = performance.now();
      const { harness } = seed(size);
      const seedMs = Math.round(performance.now() - seedStarted);

      // Three shapes of the same query, because they take different paths:
      // the empty query is what `[[` shows the moment it opens, the prefix is
      // the third keystroke, and the fold is the Polish case that used to
      // return nothing at all.
      const empty = measure(harness, { spaceId: ids.space, text: "" });
      const prefix = measure(harness, { spaceId: ids.space, text: "nor" });
      const folded = measure(harness, { spaceId: ids.space, text: "zaklady" });
      const scoped = measure(harness, {
        spaceId: ids.space,
        text: "nor",
        targetKinds: ["task", "project", "person", "organization", "meeting"],
      });

      const labels = Array.from({ length: size }, (_, index) =>
        labelFor(index),
      );
      const legacy: number[] = [];
      for (let sample = 0; sample < SAMPLES; sample += 1)
        legacy.push(legacyCost(labels, "nor"));

      const metrics = {
        n: size,
        seedMs,
        emptyP50: empty.p50,
        emptyP95: empty.p95,
        prefixP50: prefix.p50,
        prefixP95: prefix.p95,
        foldedP50: folded.p50,
        foldedP95: folded.p95,
        scopedP50: scoped.p50,
        scopedP95: scoped.p95,
        legacySortOnlyP50: Math.round(percentile(legacy, 0.5) * 1000) / 1000,
        legacySortOnlyP95: Math.round(percentile(legacy, 0.95) * 1000) / 1000,
        foldedMatches: folded.count,
      };
      t.diagnostic(`linkCandidates: ${JSON.stringify(metrics)}`);

      // A diacritic-folded query has to find the thing it names. An empty
      // measurement here is an instrument failure, not a fast result.
      assert.ok(
        metrics.foldedMatches > 0,
        `A folded query found nothing at N=${size}: ${JSON.stringify(metrics)}`,
      );
      for (const duration of [
        metrics.emptyP95,
        metrics.prefixP95,
        metrics.foldedP95,
        metrics.scopedP95,
      ])
        assert.ok(
          duration <= CALL_CEILING_MS,
          `Slower than the order-of-magnitude ceiling: ${JSON.stringify(metrics)}`,
        );
    });
  }
});
