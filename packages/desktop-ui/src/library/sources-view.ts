import {
  KNOWLEDGE_SOURCE_KINDS,
  type KnowledgeSourceKind,
} from "@constellation/contracts";

import type { KnowledgeSourceRecord } from "../client/workflow.js";
import { countLabel, formatDate, plural } from "../i18n.js";

/* THE READING BEHIND THE SOURCES SCREEN — every fact it shows, worked out once
 * and away from the DOM, so the assertions can meet the reading rather than a
 * rendered string.
 *
 * WHAT COLLECTED MATERIAL ACTUALLY LOOKS LIKE, measured on the real workspace
 * 2026-08-01 and the reason for nearly every choice here: 81 sources, of which
 * file 72 · url 8 · excerpt 1 · SCREENSHOT 0, and availability reference_only
 * 75 · available 6 · UNAVAILABLE 0. Titles run 36-199 characters. So two of the
 * three availability states and one of the four kinds never occur in real
 * material at all — which is exactly why this screen must keep drawing them.
 */

/**
 * WHERE EACH KIND'S GROUP STANDS, and it is deliberately NOT the order the
 * vocabulary is declared in.
 *
 * `KNOWLEDGE_SOURCE_KINDS` is a list of values; this is a display decision,
 * taken so the group a reader reaches for first stands first — and on real
 * material `file` is 72 of 81. The two orders differ on purpose. A later lot
 * meeting the difference must not "fix" one of them into the other.
 *
 * IT IS A TOTAL `Record`, NOT A HAND-WRITTEN LIST, and that is the whole point.
 * The list-beside-a-closed-vocabulary is the defect family this wave has met at
 * eight live sites, and the worst of them defaulted a missing member to an
 * empty array with every test green. A `Record` keyed by the union cannot omit
 * a member: a fifth kind added to the contract stops this file compiling until
 * somebody says where its group goes.
 */
const sourceKindRenderPosition: Readonly<Record<KnowledgeSourceKind, number>> =
  {
    file: 0,
    url: 1,
    excerpt: 2,
    screenshot: 3,
  };

/**
 * THE ORDER THE GROUPS ARE DRAWN IN — derived FROM the vocabulary, never
 * restated beside it. So a fifth kind arrives with a group head of its own
 * whether or not anybody remembered this screen, and `sources-view.test.ts`
 * checks the two agree as SETS, both directions. Never as a count: a count
 * pinned to four is an assertion that goes green on a vocabulary that grew.
 */
export const sourceKindRenderOrder: readonly KnowledgeSourceKind[] = [
  ...KNOWLEDGE_SOURCE_KINDS,
].sort(
  (left, right) =>
    sourceKindRenderPosition[left] - sourceKindRenderPosition[right],
);

/**
 * What a kind is called in a sentence, as opposed to on a group head. Used by
 * the empty line: "Nothing collected as a screenshot yet."
 */
export const sourceKindNoun: Readonly<Record<KnowledgeSourceKind, string>> = {
  url: "link",
  file: "file",
  screenshot: "screenshot",
  excerpt: "excerpt",
};

/**
 * WHY AN EMPTY GROUP KEEPS ITS HEAD. The kind is part of the vocabulary, not of
 * the list. That nothing has been collected as a screenshot says something
 * about the week, not about the model — and a group that disappears when it
 * empties teaches a reader that the kind does not exist. This is the deliberate
 * opposite of a date bucket, which is a fact about the data and vanishes with
 * it.
 */
export const emptyKindLine = (kind: KnowledgeSourceKind): string =>
  `Nothing collected as a ${sourceKindNoun[kind]} yet.`;

export interface SourceKindGroup {
  readonly kind: KnowledgeSourceKind;
  readonly sources: readonly KnowledgeSourceRecord[];
}

/**
 * Every kind gets a group, in render order, whether or not anything is in it.
 * Sources inside a group keep the order the projection returned them in.
 */
export const groupSourcesByKind = (
  sources: readonly KnowledgeSourceRecord[],
): readonly SourceKindGroup[] =>
  sourceKindRenderOrder.map((kind) => ({
    kind,
    sources: sources.filter((source) => source.sourceKind === kind),
  }));

/**
 * TWO DATES, TWO FUNCTIONS, EACH NAMED FOR THE FACT IT PRINTS — and each takes
 * the SOURCE rather than a date, so neither can be handed the other's field.
 *
 * `observedAt` is when the content was seen to say what it says; `createdAt` is
 * when the record was added here. They are different questions and on real
 * material they diverge — an excerpt from a 2019 contract was observed in 2019
 * and added last month. One shared formatter fed by a caller's choice of field
 * is how the two collapse into one date printed twice.
 */
export const observationDay = (source: KnowledgeSourceRecord): string =>
  formatDate(source.observedAt);

export const addedDay = (source: KnowledgeSourceRecord): string =>
  formatDate(source.createdAt);

/** What rests on this source, said in words rather than as a bare number. */
export const restsOnSentence = (count: number): string =>
  count === 0
    ? "nothing rests on it yet"
    : `${countLabel(count, "record")} ${plural(count, "rests", "rest")} on it`;

/**
 * THE ROW'S ACCESSIBLE NAME. Every fact the row carries visually is in it, in
 * the order it is read, because the row is one `option` — a screen reader gets
 * the name and nothing else. Availability is in here as WORDS for the same
 * reason it is words on the screen: it is the one fact on this row that can
 * change what somebody does next.
 */
export const sourceRowName = (
  source: KnowledgeSourceRecord,
  availabilityLabel: string,
  kindLabel: string,
): string =>
  [
    source.title,
    kindLabel,
    availabilityLabel,
    restsOnSentence(source.referencedByCount),
    `observed ${observationDay(source)}`,
  ].join(" · ");

/**
 * The sentence that only an unreachable source gets, and the reason the three
 * states exist at all: a source that no longer answers has to say so BEFORE
 * somebody rests a decision on it, not after.
 */
export const UNAVAILABLE_CONSEQUENCE =
  "Whatever rests on it needs a second source before anyone leans on it again.";

/**
 * Which source the reader opens on when nothing has been picked.
 *
 * THE FIRST ROW IN RENDER ORDER, NOT THE FIRST IN THE PROJECTION'S ARRAY. The
 * prototype opened `SOURCES[0]`, which is array order, and the two coincide
 * only by accident — on the measured material they do not, because `file` is
 * drawn first and the array is not sorted by kind. A reader showing something
 * that is not the row highlighted beside it is the defect this avoids.
 */
export const firstSourceInRenderOrder = (
  sources: readonly KnowledgeSourceRecord[],
): KnowledgeSourceRecord | undefined =>
  groupSourcesByKind(sources).flatMap((group) => group.sources)[0];
