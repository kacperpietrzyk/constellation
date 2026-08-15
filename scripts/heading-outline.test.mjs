// TESTY OSI KONSPEKTU — nad SAMĄ REGUŁĄ, bez przeglądarki.
//
// Fikstury są ODCZYTANE z przelotu bramki na tej gałęzi (wiersze
// `heading outline …`), a nie wymyślone: kształt „powitanie 2xl + trzy
// nagłówki sekcji" to Dzisiaj, „brak otwarcia + jeden nagłówek grupy" to
// Projekty. Przypadek, w którym oś ma MILCZEĆ, ma tu tyle samo testów co ten,
// w którym ma paść — bramka, która krzyczy na poprawny kod, ginie szybciej niż
// bramka, której nie ma.
import assert from "node:assert/strict";
import test from "node:test";

import {
  HEADING_OUTLINE_LEVELS_ARMED,
  HEADING_OUTLINE_NESTING_ARMED,
  judgeHeadingOutline,
  judgeScreenOutline,
} from "./heading-outline.mjs";

const heading = (level, sample, opening = false) => ({
  level,
  signature: `h${level}._${sample.toLowerCase().replaceAll(" ", "")}`,
  sample,
  opening,
});

const today = (sectionLevel) => ({
  id: "today",
  band: [heading(1, "Today")],
  content: [
    heading(2, "Good afternoon, Kacper", true),
    heading(sectionLevel, "In the calendar"),
    heading(sectionLevel, "Planned for today"),
    heading(sectionLevel, "Deadline approaching"),
  ],
});

test("an opening over deeper section heads is the shape the reference has", () => {
  const judged = judgeScreenOutline(today(3));
  assert.equal(judged.state, "JUDGED");
  assert.deepEqual(judged.flat, []);
  assert.deepEqual(judged.skips, []);
});

test("section heads at the opening's own rung are the defect lot L3 shipped", () => {
  const judged = judgeScreenOutline(today(2));
  assert.equal(judged.flat.length, 3);
  assert.equal(judged.skips.length, 0, "the rung is not skipped, it is shared");
  assert.equal(judged.flat[0].heading.sample, "In the calendar");
});

test("the verdict names both sides and the screen", () => {
  const { failures, reported } = judgeHeadingOutline([today(2)]);
  const lines = [...failures, ...reported];
  assert.equal(lines.length, 1);
  assert.match(lines[0], /HEADING_OUTLINE_FLAT — today/u);
  assert.match(lines[0], /Good afternoon, Kacper/u, "no measured side");
  assert.match(lines[0], /td-greeting/u, "no reference side");
  assert.equal(
    failures.length,
    HEADING_OUTLINE_NESTING_ARMED ? 1 : 0,
    "the armed flag decides whether this fails the run or prints a row",
  );
});

test("a screen with no opening keeps its section heads as siblings", () => {
  // Projekty: pasmo bez otwarcia w treści (`NO_OPENING` na osi 4), nagłówki
  // grup na jednym szczeblu. Oś NIE MA tu zdania — i to jest cały powód, dla
  // którego reguła zagnieżdżenia jest warunkowa.
  const judged = judgeScreenOutline({
    id: "projects",
    band: [heading(1, "Projects")],
    content: [heading(2, "Active"), heading(2, "Paused")],
  });
  assert.equal(judged.state, "NO_OPENING");
  assert.deepEqual(judged.flat, []);
  assert.deepEqual(judged.skips, []);
});

test("a rung nobody opened fails, and going back up does not", () => {
  const skipped = judgeScreenOutline({
    id: "library",
    band: [heading(1, "Library")],
    content: [heading(3, "Folders")],
  });
  assert.equal(skipped.skips.length, 1);
  assert.equal(skipped.skips[0].expected, 2);
  const returning = judgeScreenOutline({
    id: "library",
    band: [heading(1, "Library")],
    content: [heading(2, "Notes"), heading(3, "Folder"), heading(2, "Sources")],
  });
  assert.deepEqual(returning.skips, [], "closing a section is not a skip");
  const { failures } = judgeHeadingOutline([skipped]);
  assert.equal(failures.length, HEADING_OUTLINE_LEVELS_ARMED ? 1 : 0);
});

test("a screen the fixture drew no heading on is SAID, never counted as passing", () => {
  const { judged, counts, failures } = judgeHeadingOutline([
    { id: "calendar", band: [heading(1, "Calendar")], content: [] },
  ]);
  assert.equal(judged[0].state, "NO_HEADINGS");
  assert.equal(counts.withoutHeadings, 1);
  assert.equal(counts.judged, 0, "an unmeasured screen is not a judged screen");
  assert.deepEqual(failures, []);
});

test("the band's heading is the first rung, so content starting at h2 is not a skip", () => {
  const judged = judgeScreenOutline({
    id: "inbox",
    band: [heading(1, "Inbox")],
    content: [heading(2, "Needs a decision")],
  });
  assert.deepEqual(judged.skips, []);
});
