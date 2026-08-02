import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  KNOWLEDGE_SOURCE_AVAILABILITY,
  KNOWLEDGE_SOURCE_KINDS,
  KnowledgeSourceIdSchema,
} from "@constellation/contracts";

import type { KnowledgeSourceRecord } from "../src/client/workflow.js";
import {
  availabilityCopy,
  sourceKindCopy,
} from "../src/library/library-chrome.js";
import {
  addedDay,
  emptyKindLine,
  firstSourceInRenderOrder,
  groupSourcesByKind,
  observationDay,
  restsOnSentence,
  sourceKindRenderOrder,
  sourceRowName,
} from "../src/library/sources-view.js";

/* THE SOURCES READING, MEASURED WHERE IT IS DECIDED.
 *
 * The screen's three load-bearing properties are decided in `sources-view.ts`
 * and rendered in `SourcesReading.tsx`. This file holds the half that needs no
 * DOM; `sources-screen.interaction.test.tsx` holds the half that does. Neither
 * is enough alone: a correct reading rendered by nothing, and a rendered screen
 * built on a wrong reading, both look green from one side.
 */

const source = (
  suffix: string,
  overrides: Partial<KnowledgeSourceRecord> = {},
): KnowledgeSourceRecord => ({
  id: KnowledgeSourceIdSchema.parse(
    `00000000-0000-4000-8000-0000000004${suffix}`,
  ),
  sourceKind: "file",
  title: `Source ${suffix}`,
  availability: "reference_only",
  observedAt: "2026-07-20T14:00:00.000Z",
  createdAt: "2026-07-21T09:00:00.000Z",
  version: 1,
  updatedAt: "2026-07-21T09:00:00.000Z",
  referencedBy: [],
  referencedByCount: 0,
  ...overrides,
});

describe("the four source kinds are a closed vocabulary with a group each", () => {
  /* THE ASSERTION THAT FAILS WHEN A FIFTH KIND ARRIVES WITHOUT A HEAD.
   *
   * Both directions, as SETS. A one-way check ("every rendered head is a real
   * kind") passes over a kind that lost its head, and the other one-way check
   * passes over a head for a kind that no longer exists. A count against 4
   * passes over a swap and — worse — is an assertion pinned to a value that
   * advances: it goes green on the day the vocabulary grows, which is the one
   * day it exists to fail.
   */
  it("draws a group for every kind in the contract vocabulary and for no other", () => {
    assert.deepEqual(
      [...sourceKindRenderOrder].sort(),
      [...KNOWLEDGE_SOURCE_KINDS].sort(),
      "the render order and the contract vocabulary are not the same set of kinds",
    );
  });

  /* THE RENDER ORDER IS NOT THE VOCABULARY ORDER, and that is a decision.
   * Asserted separately from membership so the two cannot be conflated, and
   * asserted at all so a later lot cannot quietly "tidy" one into the other
   * without a red test asking why. `file` stands first because on the measured
   * workspace it is 72 of 81 sources.
   */
  it("keeps the display order distinct from the declaration order", () => {
    assert.deepEqual(
      [...sourceKindRenderOrder],
      ["file", "url", "excerpt", "screenshot"],
    );
    assert.notDeepEqual(
      [...sourceKindRenderOrder],
      [...KNOWLEDGE_SOURCE_KINDS],
      "the two orders have become the same, so the display decision no longer exists",
    );
  });

  /* AN EMPTY KIND KEEPS ITS GROUP. On the real workspace `screenshot` is 0 of
   * 81 and `unavailable` is 0 of 81 — so on real material this is the ONLY
   * thing that says the kind exists at all. A capability no fixture exercises
   * is indistinguishable from one that was never built, and this repo has
   * already shipped a health state that was built and unreachable for exactly
   * that reason.
   */
  it("gives a kind nothing was collected as a group of its own, and a line", () => {
    const groups = groupSourcesByKind([
      source("01", { sourceKind: "file" }),
      source("02", { sourceKind: "url" }),
    ]);
    assert.deepEqual(
      groups.map((group) => group.kind),
      [...sourceKindRenderOrder],
      "a kind with nothing in it lost its group",
    );
    const screenshot = groups.find((group) => group.kind === "screenshot");
    assert.ok(screenshot);
    assert.equal(screenshot.sources.length, 0);
    assert.equal(
      emptyKindLine("screenshot"),
      "Nothing collected as a screenshot yet.",
    );
    // Every kind can say its own empty line — a `Record` lookup that returned
    // `undefined` for one member would render "Nothing collected as a  yet."
    for (const kind of KNOWLEDGE_SOURCE_KINDS) {
      assert.match(emptyKindLine(kind), /^Nothing collected as a \S.* yet\.$/u);
    }
  });

  it("puts every source in exactly one group and loses none", () => {
    const sources = [
      source("01", { sourceKind: "screenshot" }),
      source("02", { sourceKind: "excerpt" }),
      source("03", { sourceKind: "file" }),
      source("04", { sourceKind: "url" }),
      source("05", { sourceKind: "file" }),
    ];
    const grouped = groupSourcesByKind(sources).flatMap(
      (group) => group.sources,
    );
    assert.equal(grouped.length, sources.length);
    assert.deepEqual(
      [...new Set(grouped.map((item) => item.id))].sort(),
      [...new Set(sources.map((item) => item.id))].sort(),
    );
    // And the reader opens on the first row a reader SEES, not on the first
    // entry of the projection's array. The two coincide only by accident.
    assert.equal(firstSourceInRenderOrder(sources)?.id, sources[2]?.id);
  });
});

describe("availability is carried by text, in every place it is said", () => {
  /* THE ACCESSIBILITY FLOOR, NOT A PREFERENCE. Three states, and each one has a
   * word. The `.source-kind` dot this screen replaced carried the state in
   * COLOUR ALONE, which is invisible to a screen reader, to a greyscale
   * display, and to the most common form of colour blindness.
   */
  it("gives each of the three states a distinct label", () => {
    const labels = KNOWLEDGE_SOURCE_AVAILABILITY.map(
      (state) => availabilityCopy[state],
    );
    assert.equal(new Set(labels).size, KNOWLEDGE_SOURCE_AVAILABILITY.length);
    for (const label of labels) assert.ok(label.trim().length > 0);
  });

  it("repeats the state in the row's accessible name, as a word", () => {
    const unreachable = source("06", {
      sourceKind: "url",
      title: "Vendor advisory",
      availability: "unavailable",
      referencedByCount: 3,
    });
    const name = sourceRowName(
      unreachable,
      availabilityCopy[unreachable.availability],
      sourceKindCopy[unreachable.sourceKind],
    );
    assert.ok(name.includes("Vendor advisory"));
    assert.ok(name.includes(availabilityCopy.unavailable));
    assert.ok(name.includes(sourceKindCopy.url));
    assert.ok(name.includes("3 records rest on it"));
    assert.ok(name.includes(`observed ${observationDay(unreachable)}`));
  });

  it("says what rests on a source in words, and agrees with itself at one", () => {
    assert.equal(restsOnSentence(0), "nothing rests on it yet");
    assert.equal(restsOnSentence(1), "1 record rests on it");
    assert.equal(restsOnSentence(4), "4 records rest on it");
  });
});

describe("the observation date and the added date are two facts", () => {
  /* THEY ARE NOT THE SAME QUESTION and the screen shows both. `observedAt` is
   * when the content was seen to say what it says — freely years older than the
   * record. `createdAt` is when it was added here. One formatter fed a caller's
   * choice of field is exactly how the two collapse into one date printed
   * twice, so each function takes the SOURCE and reaches for its own field.
   */
  it("prints different days for a source whose facts differ", () => {
    const old = source("07", {
      observedAt: "2019-11-04T14:00:00.000Z",
      createdAt: "2026-07-20T14:00:00.000Z",
    });
    assert.notEqual(observationDay(old), addedDay(old));
    assert.ok(observationDay(old).includes("2019"));
    assert.ok(addedDay(old).includes("2026"));
  });

  it("reads each field from its own source, so neither can take the other's", () => {
    const observedOnly = source("08", {
      observedAt: "2020-01-02T00:00:00.000Z",
      createdAt: "2026-03-04T00:00:00.000Z",
    });
    const swapped = source("09", {
      observedAt: "2026-03-04T00:00:00.000Z",
      createdAt: "2020-01-02T00:00:00.000Z",
    });
    assert.equal(observationDay(observedOnly), addedDay(swapped));
    assert.equal(addedDay(observedOnly), observationDay(swapped));
  });
});
