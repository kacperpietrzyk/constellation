import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  KNOWLEDGE_SOURCE_AVAILABILITY,
  KNOWLEDGE_SOURCE_KINDS,
  type CommandEnvelope,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import { createScenarioClient } from "../src/client/scenario-client.js";
import type { DesktopSnapshot } from "../src/client/workflow.js";
import { librarySources } from "../src/dev/library-fixture.js";
import { workHarnessSnapshot } from "../src/dev/harness-snapshot.js";
import {
  availabilityCopy,
  sourceKindCopy,
} from "../src/library/library-chrome.js";
import { SourcesReading } from "../src/library/SourcesReading.js";
import {
  UNAVAILABLE_CONSEQUENCE,
  dependentKindLabel,
  emptyKindLine,
  sourceKindRenderOrder,
} from "../src/library/sources-view.js";
import { assertNoNode } from "./dom-assert.js";

/* THE SOURCES SCREEN AS IT IS DRAWN — the half of the contract that needs a
 * DOM. `sources-view.test.ts` holds the reading behind it.
 *
 * WHAT THIS FILE MEASURES AND WHAT IT DOES NOT. It runs on the merged Library
 * harness fixture, whose own header says it is never evidence that a screen is
 * correct. It is evidence that the screen DRAWS what the reading decided:
 * a head per kind including the empty ones, availability in words, two dates
 * under two labels, and one stored edge read from the source's end. Whether the
 * result is usable on 81 real sources is not a question a fixture can answer.
 *
 * THE EMPTY GROUP NEEDS ITS OWN DATA AND THAT IS DELIBERATE. The harness
 * fixture carries a `screenshot` precisely because the real workspace has zero
 * of them, so on the fixture that group is never empty. Removing the screenshot
 * from the fixture to make the empty case reachable here would re-create the
 * defect its header names — a capability no fixture exercises is
 * indistinguishable from one that was never built. So the empty-group case gets
 * a source set of its own, and both cases are measured.
 */

let container: HTMLElement;
let bandHost: HTMLElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  bandHost = document.createElement("div");
  document.body.append(bandHost);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  bandHost.remove();
});

type Source = ReturnType<typeof librarySources>[number];

const snapshotWith = (sources: readonly Source[]): DesktopSnapshot => ({
  ...workHarnessSnapshot,
  knowledge: {
    kind: "ready",
    data: {
      kind: "knowledge.list",
      spaceId: workHarnessSnapshot.bootstrap.spaces[0]!.id,
      folders: [],
      sources: [...sources],
      documents: [],
    },
  },
});

const render = (
  sources: readonly Source[],
  client?: ConstellationRendererClient,
) => {
  act(() => {
    root.render(
      createElement(SourcesReading, {
        // Pasmo tytułu Biblioteki jest celem PORTALU, więc odczyt pozbawiony
        // celu nie rysuje swojej akcji tworzenia w ogóle. Fikstura daje tu
        // prawdziwy węzeł, żeby ta ścieżka została w teście osiągalna — cel
        // `null` przechodziłby tak samo i po cichu zabierał ją z pomiaru.
        actionHost: bandHost,
        client,
        snapshot: snapshotWith(sources),
        onReload: async () => undefined,
        onFailure: () => undefined,
      }),
    );
  });
};

/**
 * A client that records the envelope and nothing else. The renderer builds its
 * own envelopes, so a defect in one is invisible to every kernel conformance
 * test — it surfaces only as a refused command in somebody's hands.
 */
const recordingClient = (
  sent: CommandEnvelope[],
): ConstellationRendererClient => {
  const base = createScenarioClient({ queries: {} });
  return {
    ...base,
    executeCommand: async (command) => {
      sent.push(command);
      return {
        kind: "command_outcome",
        outcome: {
          contractVersion: 1,
          commandId: command.commandId,
          correlationId: command.correlationId,
          kernelTime: "2026-08-01T00:00:00.000Z",
          affected: [],
          auditReceiptId: command.commandId,
          outcome: "success",
        },
      } as unknown as Awaited<
        ReturnType<ConstellationRendererClient["executeCommand"]>
      >;
    },
  };
};

const groupHeads = (): string[] =>
  [...container.querySelectorAll<HTMLElement>("[data-source-group]")].map(
    (node) => node.dataset.sourceGroup ?? "",
  );

const text = (selector: string): string =>
  (container.querySelector(selector)?.textContent ?? "")
    .replace(/\s+/gu, " ")
    .trim();

const readerText = (): string =>
  (container.querySelector("[data-source-reader]")?.textContent ?? "")
    .replace(/\s+/gu, " ")
    .trim();

test("every kind in the vocabulary gets a group head, in the display order", () => {
  render(librarySources());

  // Instrument first. A screen that drew nothing satisfies half the claims
  // below by being empty, and this fixture is the only thing standing between
  // this file and a green pass over geometry nobody rendered.
  assert.ok(
    container.querySelectorAll("[data-source-row]").length >= 4,
    "the list drew fewer than four rows — the measurement failed, it did not pass",
  );

  assert.deepEqual(
    groupHeads(),
    [...sourceKindRenderOrder],
    "the heads on screen are not the kinds, in the order, the reading decided",
  );
  // …and the same set as the CONTRACT, both directions, so a fifth kind added
  // to the vocabulary cannot reach the product without a group of its own.
  assert.deepEqual(
    [...groupHeads()].sort(),
    [...KNOWLEDGE_SOURCE_KINDS].sort(),
  );

  // Each head says its kind and its count in words a reader can see.
  for (const head of container.querySelectorAll<HTMLElement>(
    "[data-source-group]",
  )) {
    const kind = head.dataset.sourceGroup ?? "";
    assert.ok(
      (head.textContent ?? "").includes(
        sourceKindCopy[kind as keyof typeof sourceKindCopy],
      ),
      `the ${kind} head does not say what kind it is`,
    );
  }
});

test("a kind nothing was collected as keeps its head and says so", () => {
  // No screenshot and no excerpt in this set — two of the four groups are empty.
  const withoutTwo = librarySources().filter(
    (source) =>
      source.sourceKind !== "screenshot" && source.sourceKind !== "excerpt",
  );
  render(withoutTwo);

  assert.deepEqual(
    groupHeads(),
    [...sourceKindRenderOrder],
    "an empty kind lost its group head",
  );
  const rendered = (container.textContent ?? "").replace(/\s+/gu, " ");
  assert.ok(
    rendered.includes(emptyKindLine("screenshot")),
    "the empty screenshot group says nothing about being empty",
  );
  assert.ok(rendered.includes(emptyKindLine("excerpt")));
  // And the non-empty groups did NOT get the line.
  assert.ok(!rendered.includes(emptyKindLine("file")));
  assert.equal(
    container.querySelectorAll("[data-source-row]").length,
    withoutTwo.length,
  );
});

test("availability reaches the reader as text, never as colour alone", () => {
  const sources = librarySources();
  render(sources);

  // Every row's accessible name carries the state as a word. Read from
  // `aria-label`, which is the name a screen reader gets — `textContent` would
  // pass on a badge whose label lived in an `aria-hidden` subtree.
  const rows = [
    ...container.querySelectorAll<HTMLElement>("[data-source-row]"),
  ];
  assert.equal(rows.length, sources.length);
  for (const row of rows) {
    const id = row.dataset.sourceRow;
    const source = sources.find((item) => item.id === id);
    assert.ok(
      source,
      `a row was drawn for ${String(id)}, which is not a source`,
    );
    const name = row.getAttribute("aria-label") ?? "";
    assert.ok(
      name.includes(availabilityCopy[source.availability]),
      `the ${source.availability} row does not say its state in its name`,
    );
  }

  // THE STATE REAL MATERIAL NEVER REACHES. `unavailable` is 0 of 81 on the
  // measured workspace, so if the screen only worked for the two states that
  // occur, nothing real would ever show it.
  const unreachable = sources.find(
    (source) => source.availability === "unavailable",
  );
  assert.ok(unreachable, "the fixture no longer carries an unavailable source");
  const row = container.querySelector<HTMLElement>(
    `[data-source-row="${unreachable.id}"]`,
  );
  assert.ok(row);
  act(() => row.click());

  const reader = readerText();
  assert.ok(reader.includes(availabilityCopy.unavailable));
  assert.ok(
    reader.includes(UNAVAILABLE_CONSEQUENCE),
    "an unreachable source does not say what resting on it costs",
  );

  // …and the consequence belongs to that state alone. Without this half, a
  // sentence rendered unconditionally passes the half above.
  const reachable = sources.find(
    (source) => source.availability === "available",
  );
  assert.ok(reachable);
  const other = container.querySelector<HTMLElement>(
    `[data-source-row="${reachable.id}"]`,
  );
  assert.ok(other);
  act(() => other.click());
  assert.ok(!readerText().includes(UNAVAILABLE_CONSEQUENCE));
});

test("the observation date and the added date are drawn as two different facts", () => {
  const sources = librarySources();
  // The fixture's excerpt was observed in 2019 and added in 2026 — the case the
  // two fields exist for. A fixture where they matched would pass with one
  // field printed twice.
  const older = sources.find(
    (source) => source.observedAt.slice(0, 4) !== source.createdAt.slice(0, 4),
  );
  assert.ok(
    older,
    "no fixture source has an observation year different from its added year, so this test cannot tell the two apart",
  );
  render(sources);
  const row = container.querySelector<HTMLElement>(
    `[data-source-row="${older.id}"]`,
  );
  assert.ok(row);
  act(() => row.click());

  const observed = text("[data-source-observed]");
  const added = text("[data-source-added]");
  assert.ok(observed.length > 0 && added.length > 0);
  assert.notEqual(
    observed,
    added,
    "the two dates print the same thing, so one format call is reading one field twice",
  );
  // ROK W OBIE STRONY, bo reguła dnia (lot L10) ma o nim dwa zdania naraz:
  // rok bieżący jest POMINIĘTY, każdy inny WYPISANY. Asercja „napis zawiera
  // swój rok" była prawdziwa tylko dla starego formatu i zgniłaby przy każdej
  // fiksturze, która trafi w rok bieżący; ta pyta o regułę i jest mocniejsza,
  // bo łapie też odwrotny błąd — rok bieżący wydrukowany mimo wszystko.
  const currentYear = String(new Date().getFullYear());
  const saysItsYear = (printed: string, instant: string): boolean =>
    instant.slice(0, 4) === currentYear
      ? !printed.includes(currentYear)
      : printed.includes(instant.slice(0, 4));
  assert.ok(
    saysItsYear(observed, older.observedAt),
    `the observation date does not follow the year rule: ${observed}`,
  );
  assert.ok(
    saysItsYear(added, older.createdAt),
    `the added date does not follow the year rule: ${added}`,
  );
});

test("what rests on a source is read from the source's end, and named", () => {
  const sources = librarySources();
  const rested = sources.find((source) => source.referencedByCount > 0);
  assert.ok(rested, "no fixture source has anything resting on it");
  // The sample and the count must agree — a nonzero count with an empty sample
  // is unreachable from the kernel, and the fixture used to carry exactly that.
  assert.equal(rested.referencedBy.length, rested.referencedByCount);

  render(sources);
  const row = container.querySelector<HTMLElement>(
    `[data-source-row="${rested.id}"]`,
  );
  assert.ok(row);
  act(() => row.click());

  const dependents = [
    ...container.querySelectorAll("[data-source-dependent-title]"),
  ].map((node) => (node.textContent ?? "").trim());
  assert.deepEqual(
    dependents,
    rested.referencedBy.map((reference) => reference.title),
    "the records resting on this source are not the ones the projection named",
  );

  // AND NAMED BY KIND, which is the half of this test's own title that nothing
  // checked until lot 5 built the kind onto the row. The expectation comes from
  // `dependentKindLabel`, the same reading the row renders, so this asserts the
  // ROW AGREES WITH THE READING rather than restating the label table — a test
  // carrying its own copy of the labels would be exactly the hand-written list
  // beside a closed dictionary that the screen refuses to keep.
  const kinds = [
    ...container.querySelectorAll("[data-source-dependent-kind]"),
  ].map((node) => (node.textContent ?? "").trim());
  assert.deepEqual(
    kinds,
    rested.referencedBy.map((reference) => dependentKindLabel(reference)),
    "a line under 'what rests on this' does not say what kind of record it is",
  );
  // And the reading itself is a WORD, never a contract identifier: the two
  // vocabularies genuinely differ, so the fallback is reachable and a raw
  // member leaking onto the screen has to fail here rather than be read.
  assert.ok(
    kinds.every((kind) => kind.length > 0),
    "a kind label rendered empty, so the row states a record with no kind",
  );
  assert.ok(
    kinds.every((kind) => /^[A-Z]/u.test(kind)),
    "a kind label is not a display label — a raw contract member reached the screen",
  );

  // A source nothing rests on says so, rather than drawing an empty list.
  const untouched = sources.find((source) => source.referencedByCount === 0);
  assert.ok(untouched);
  const other = container.querySelector<HTMLElement>(
    `[data-source-row="${untouched.id}"]`,
  );
  assert.ok(other);
  act(() => other.click());
  assertNoNode(
    container.querySelector("[data-source-dependent]"),
    "a source with nothing resting on it still drew a dependent",
  );
  assert.ok(readerText().includes("Nothing rests on this source yet"));
});

test("the reader opens on the first row a reader sees, not the first in the array", () => {
  const sources = librarySources();
  render(sources);
  // Render order puts `file` first; the projection's array starts with a `url`.
  assert.equal(sources[0]?.sourceKind, "url");
  const firstFile = sources.find((source) => source.sourceKind === "file");
  assert.ok(firstFile);
  const reader = container.querySelector<HTMLElement>("[data-source-reader]");
  assert.ok(reader, "nothing opened in the reading panel");
  assert.equal(reader.dataset.sourceReader, firstFile.id);
});

test("no explanation on this screen retreats into a title attribute", () => {
  render(librarySources());
  const titled = [...container.querySelectorAll("[title]")].map((node) =>
    node.outerHTML.slice(0, 160),
  );
  assert.deepEqual(
    titled,
    [],
    `an explanation survived as a \`title\` attribute:\n${titled.join("\n")}`,
  );
});

test("the list is one listbox with one tab stop, across all four groups", () => {
  render(librarySources());
  const listboxes = container.querySelectorAll('[role="listbox"]');
  assert.equal(
    listboxes.length,
    1,
    "the groups became separate listboxes, so arrowing between kinds stops working",
  );
  const stops = [
    ...container.querySelectorAll<HTMLElement>('[role="option"]'),
  ].filter((node) => node.tabIndex === 0);
  assert.equal(
    stops.length,
    1,
    `${stops.length} rows are a tab stop — a list is one stop, whatever it is grouped by`,
  );
});

/* THE THREE STATES ARE REACHABLE, NOT ONLY RENDERABLE.
 *
 * Until this lot, availability could be READ everywhere and SET nowhere: it is
 * derived once at creation from what the capture was, and no control existed
 * afterwards. A state a source can never be moved INTO is a state the product
 * cannot express — and `unavailable`, the one that matters, is 0 of 81 on the
 * real workspace, so nothing would ever have entered it.
 *
 * The envelope is asserted whole. `expectedVersions` is an exact key-set match
 * in the kernel, and `knowledge.sourceUpdate` REPLACES the record, so a payload
 * that forgets `observedAt` silently resets a domain fact.
 */
test("marking a source unreachable sends the whole record, not just the new state", () => {
  const sent: CommandEnvelope[] = [];
  const sources = librarySources();
  const reachable = sources.find(
    (source) => source.availability === "available",
  );
  assert.ok(reachable);
  render(sources, recordingClient(sent));

  const row = container.querySelector<HTMLElement>(
    `[data-source-row="${reachable.id}"]`,
  );
  assert.ok(row);
  act(() => row.click());

  // Every member of the vocabulary is offered, and the one the source is in is
  // the one that reads as chosen.
  const choices = [
    ...container.querySelectorAll<HTMLInputElement>(
      "[data-source-availability]",
    ),
  ];
  assert.deepEqual(
    choices.map((input) => input.dataset.sourceAvailability),
    [...KNOWLEDGE_SOURCE_AVAILABILITY],
    "the availability control does not offer the vocabulary the contract declares",
  );
  assert.deepEqual(
    choices.filter((input) => input.checked).map((input) => input.value),
    [reachable.availability],
    "the control does not show which state the source is in",
  );

  const unavailable = choices.find(
    (input) => input.dataset.sourceAvailability === "unavailable",
  );
  assert.ok(unavailable);
  assert.equal(unavailable.disabled, false);
  act(() => unavailable.click());

  assert.equal(sent.length, 1, "marking a source unreachable sent no command");
  const command = sent[0]!;
  assert.equal(command.commandName, "knowledge.sourceUpdate");
  const payload = command.payload as Record<string, unknown>;
  assert.equal(payload["availability"], "unavailable");
  assert.equal(payload["sourceId"], reachable.id);
  assert.equal(
    payload["observedAt"],
    reachable.observedAt,
    "the observation date did not travel with the update, so it would be reset",
  );
  assert.equal(payload["title"], reachable.title);
  assert.deepEqual(Object.keys(command.expectedVersions).sort(), [
    reachable.id,
  ]);
  assert.equal(command.expectedVersions[reachable.id], reachable.version);
});
