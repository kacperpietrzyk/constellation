/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  dayDistance,
  dayDistanceVoiceNames,
  type DayDistanceVoice,
} from "../src/i18n.js";
import { daysUntil } from "../src/today-plan.js";

import { collectSourceFiles } from "./copy-scan.js";

/* RELATIVE-DAY PHRASING — THE WORDS, AND THE SHAPE THAT KEEPS THEM ALONE.
 *
 * The debt this covers was five local restatements of "how far away is this
 * day", by the recon's count, and FIFTEEN by measurement. Eleven of them wrote
 * a day count into a sentence by hand and THIRTEEN arms said "1 days".
 *
 * NOTHING HERE READS A CLOCK, and that is the whole design. `dayDistance` takes
 * the INTEGER, never a date, so a year boundary, a month boundary, a DST
 * transition and a leap day are all vacuous for the phrasing tests below —
 * there is no date in them to roll over. This wave has already had `main` go
 * red overnight, on nobody's branch, from a duration asserted against a
 * hard-coded date; that failure mode is designed out rather than avoided.
 *
 * The clock question is asked separately, at the bottom, of `daysUntil` — which
 * takes the instant, the day the reader is standing on, and the zone as three
 * PARAMETERS. Choosing all three is not pinning a date: the assertions say the
 * same thing in any month of any year.
 */

// EVERY VOICE, WALKED FROM THE RECORD'S OWN KEYS. Naming the three here instead
// would be a hand-written list beside a closed set — this repo's most expensive
// defect family, and the one a total `Record` exists to close. A fourth voice
// is exercised by this file the moment it is written, without editing it.
test("every voice is walked, and there is more than one of them", () => {
  assert.ok(
    dayDistanceVoiceNames.length >= 3,
    `only ${dayDistanceVoiceNames.length} voices were found, which cannot be the whole set`,
  );
});

test("no voice says '1 days', in either direction", () => {
  for (const voice of dayDistanceVoiceNames) {
    for (const days of [-2, -1, 0, 1, 2]) {
      const phrase = dayDistance(days, voice);

      assert.ok(
        phrase.trim().length > 0,
        `${voice} at ${days} said nothing at all`,
      );
      assert.ok(
        !/\b1 days\b/u.test(phrase),
        `${voice} at ${days} said "1 days": ${phrase}`,
      );
      // The mirror defect: a plural count wearing the singular noun.
      assert.ok(
        !/\b(?!1\b)\d+ day\b/u.test(phrase),
        `${voice} at ${days} said "N day" for a plural count: ${phrase}`,
      );
    }
  }
});

test("one day out says '1 day' in every voice, spelled once", () => {
  for (const voice of dayDistanceVoiceNames) {
    for (const days of [-1, 1]) {
      const phrase = dayDistance(days, voice);
      assert.ok(
        phrase.includes("1 day"),
        `${voice} at ${days} did not carry a counted day: ${phrase}`,
      );
    }
  }
});

// THE ZERO ARM IS "TODAY" EVERYWHERE, BUT NOT THE SAME SENTENCE EVERYWHERE.
// "due today" and "today" are both right for their readings; what must not
// happen is a voice that reaches zero and prints "in 0 days".
test("standing on the day itself is said as today, in every voice", () => {
  for (const voice of dayDistanceVoiceNames) {
    const phrase = dayDistance(0, voice);
    assert.ok(
      phrase.includes("today"),
      `${voice} at 0 did not say today: ${phrase}`,
    );
    assert.ok(
      !phrase.includes("0"),
      `${voice} at 0 counted the zero out loud: ${phrase}`,
    );
  }
});

test("the two directions are told apart, in every voice", () => {
  for (const voice of dayDistanceVoiceNames) {
    assert.notEqual(
      dayDistance(-3, voice),
      dayDistance(3, voice),
      `${voice} says the same thing three days early and three days late`,
    );
  }
});

/* THE SHAPE GUARD — WHAT ACTUALLY FORCES THE SIXTEENTH SITE.
 *
 * A total `Record` forces exhaustiveness INSIDE the function. It cannot force a
 * new screen to CALL the function, and this file should not pretend otherwise:
 * a caller writing `${countLabel(n, "day")} until renewal` passes everything
 * below while being exactly the restatement this work collapsed. What the guard
 * does close is the GRAMMAR half, totally and with no exemption list — a raw
 * count interpolated straight in front of the bare word "day" is the shape that
 * produced all thirteen "1 days" arms, and after this change the renderer has
 * none of them.
 *
 * NO ALLOWLIST, DELIBERATELY. A guard whose totality is bought with a list of
 * exempt files IS the hand-written-list defect family, so `i18n.ts` is not
 * exempt either — it passes because `dayDistance` itself routes through
 * `countLabel` and never interpolates a bare count in front of "day".
 *
 * Comments are scanned too. That is conservative in the safe direction: the
 * cost is a false failure somebody fixes in a minute, and the alternative
 * biases an instrument toward calm, which is how the last eight lied.
 */

// A count interpolated straight in front of the bare word "day"/"days". The
// whitespace is load-bearing: `${days}-day lead` is a compound adjective, is
// correctly invariant in English, and must NOT be flagged.
const BARE_DAY_COUNT = /\$\{[^}]*\}\s+days?\b/gu;

const matchesIn = (source: string): string[] =>
  [...source.matchAll(BARE_DAY_COUNT)].map((match) => match[0]);

// POSITIVE CONTROL. An instrument that reports calm has to prove it can still
// see. Two of Wave D's lying instruments returned green over a fixture that
// drew nothing at all, and this wave has had a break-test come back green while
// its arm measured nothing — so the matcher is fed the defect it exists to
// catch, in this same file, before the sweep is believed.
test("the matcher catches the defect it was written for", () => {
  assert.deepEqual(matchesIn("`in ${days} days`"), ["${days} days"]);
  assert.deepEqual(matchesIn("`${-clock.startAction} days ago`"), [
    "${-clock.startAction} days",
  ]);
  assert.deepEqual(matchesIn("`stood for ${n} day`"), ["${n} day"]);
});

// NEGATIVE CONTROL. A matcher that flags everything is as useless as one that
// flags nothing, and it would have flagged a line that is correct English.
test("the matcher leaves correct phrasings alone", () => {
  assert.deepEqual(matchesIn('`in ${countLabel(days, "day")}`'), []);
  assert.deepEqual(matchesIn("`${renewal.leadTimeDays}-day lead opens`"), []);
  assert.deepEqual(matchesIn("`${card.ageDays} d`"), []);
});

// THE PACKAGE ROOT IS FOUND, NOT COMPUTED FROM THIS FILE'S DEPTH — and the
// break-test is what taught this file so. These tests RUN FROM `build/ts/test`,
// so a plain `../src` resolves to `build/ts/src`: a directory that exists, holds
// ~139 `.d.ts` files, satisfies the count floor, and contains no string literal
// of any kind. The sweep passed, the floor passed, and the whole guard was
// reading declaration files. It was caught by the one break that puts the
// defect back in a REAL renderer file — which stayed green — and by nothing
// else. Anchoring on a file the compiler never emits (`styles.css`) is the same
// remedy `prose-guard.test.ts` already chose, for the same reason.
const packageRoot = ((): string => {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "src", "styles.css"))) {
    const parent = path.dirname(directory);
    if (parent === directory)
      throw new Error("desktop-ui package root not found from the test file");
    directory = parent;
  }
  return directory;
})();
const sourceRoot = path.join(packageRoot, "src");

test("no renderer source writes a day count into a sentence by hand", () => {
  const files = collectSourceFiles(sourceRoot);

  // AN EMPTY SWEEP IS AN INSTRUMENT FAILURE, NOT A RESULT. Without this the
  // guard reports total calm over a directory it failed to walk — which is
  // precisely how the recon's own sweep failed empty twice and reported calm.
  assert.ok(
    files.length >= 100,
    `only ${files.length} renderer source files were swept, which cannot be all of them`,
  );

  const offenders: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    source.split("\n").forEach((line, index) => {
      for (const hit of matchesIn(line)) {
        offenders.push(
          `${path.relative(sourceRoot, file)}:${index + 1}  ${hit}`,
        );
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `a day count is spelled out beside the bare word "day" — route it through countLabel or dayDistance:\n${offenders.join("\n")}`,
  );
});

/* THE CLOCK, ASKED SEPARATELY AND STILL WITHOUT PINNING ANYTHING.
 *
 * `daysUntil` is where the zone lives. Every one of these chooses the instant,
 * the day key and the zone; none of them reads the machine clock or the machine
 * zone, so none can rot on a boundary — they simply ARE the boundaries.
 */

test("a day count is the reader's calendar day, not the machine's", () => {
  // 22:30 UTC on Jul 21 is already half past midnight on Jul 22 in Warsaw. The
  // same instant is therefore one day out for a Warsaw reader and zero days out
  // for a UTC one — which is what routing every count through the workspace
  // zone buys, and what the pipeline board's floored-milliseconds count could
  // not say.
  const instant = "2026-07-21T22:30:00.000Z";

  assert.equal(daysUntil(instant, "2026-07-21", "Europe/Warsaw"), 1);
  assert.equal(daysUntil(instant, "2026-07-21", "UTC"), 0);
});

test("a short DST day still counts as one whole day", () => {
  // Europe/Warsaw springs forward on 2026-03-29, so that local day is 23 hours
  // long. A count that divided elapsed milliseconds would floor it to 0.
  assert.equal(
    daysUntil("2026-03-29T12:00:00.000Z", "2026-03-28", "Europe/Warsaw"),
    1,
  );
  // And autumn's 25-hour day must not count as two.
  assert.equal(
    daysUntil("2026-10-25T12:00:00.000Z", "2026-10-24", "Europe/Warsaw"),
    1,
  );
});

test("year, month and leap-day boundaries are each one day wide", () => {
  const oneDay: readonly (readonly [string, string])[] = [
    // Year.
    ["2027-01-01T09:00:00.000Z", "2026-12-31"],
    // Month, across a 31-day month's edge.
    ["2026-08-01T09:00:00.000Z", "2026-07-31"],
    // Into a leap day, and out the far side of one.
    ["2028-02-29T09:00:00.000Z", "2028-02-28"],
    ["2028-03-01T09:00:00.000Z", "2028-02-29"],
  ];

  for (const [instant, from] of oneDay) {
    assert.equal(
      daysUntil(instant, from, "Europe/Warsaw"),
      1,
      `${from} to ${instant} was not one day`,
    );
  }

  // A non-leap year has no 29 February, so the same span is 366 days shorter on
  // the other side of the century's ordinary rule.
  assert.equal(daysUntil("2028-03-01T09:00:00.000Z", "2028-02-28", "UTC"), 2);
  assert.equal(daysUntil("2027-03-01T09:00:00.000Z", "2027-02-28", "UTC"), 1);
});

// The phrasing and the clock, joined once, at the only place they meet.
test("a deadline that crosses midnight for the reader reads as tomorrow", () => {
  const instant = "2026-07-21T22:30:00.000Z";
  const voice: DayDistanceVoice = "lead";

  assert.equal(
    dayDistance(daysUntil(instant, "2026-07-21", "Europe/Warsaw"), voice),
    "in 1 day",
  );
  assert.equal(
    dayDistance(daysUntil(instant, "2026-07-21", "UTC"), voice),
    "due today",
  );
});
