import assert from "node:assert/strict";
import test from "node:test";

import {
  dateKeyInZone,
  dayFormFromDays,
  dayFormOf,
  formatBandDay,
  formatDate,
  formatDayFromDays,
  instantForZonedDate,
} from "../src/i18n.js";

test("zoned deadline keeps the chosen Warsaw calendar day to its last millisecond", () => {
  const dueAt = instantForZonedDate("2026-07-24", "Europe/Warsaw", "end");

  assert.equal(dueAt, "2026-07-24T21:59:59.999Z");
  assert.equal(dateKeyInZone(dueAt!, "Europe/Warsaw"), "2026-07-24");
});

test("zoned date boundaries converge on both sides of a DST transition", () => {
  const startAt = instantForZonedDate("2026-03-29", "Europe/Warsaw", "start");
  const dueAt = instantForZonedDate("2026-03-29", "Europe/Warsaw", "end");

  assert.equal(startAt, "2026-03-28T23:00:00.000Z");
  assert.equal(dueAt, "2026-03-29T21:59:59.999Z");
  assert.equal(dateKeyInZone(startAt!, "Europe/Warsaw"), "2026-03-29");
  assert.equal(dateKeyInZone(dueAt!, "Europe/Warsaw"), "2026-03-29");
});

// ── JAK CZYTA SIĘ DATA (LOT L10) ────────────────────────────────────────────
//
// TE ASERCJE MÓWIĄ SŁOWA, a bramka układu mówi kształt — i podział jest
// wymuszony, nie estetyczny. Napis daty jest liczbą, która gnije: para
// oczekująca „Aug 14, 2026" byłaby czerwona nazajutrz, a `main` tej fali padł
// już raz od asercji przypiętej do kalendarza. Tutaj zegar jest WEJŚCIEM, więc
// żadne zdanie nie może zgnić — a że reguła jest rozszczepiona na czystą
// funkcję i cienką owijkę, wejściem jest liczba, nie data.

test("the day rule says the neighbouring days in words", () => {
  const day = { day: 27, month: "Jul", year: 2026 } as const;

  assert.equal(formatDayFromDays(-1, day, 2026), "Yesterday");
  assert.equal(formatDayFromDays(0, day, 2026), "Today");
  assert.equal(formatDayFromDays(1, day, 2026), "Tomorrow");
  assert.equal(dayFormFromDays(0, 2026, 2026), "relative");
  // Gałąź względna wygrywa NIEZALEŻNIE od roku: sylwester i Nowy Rok są od
  // siebie o jeden dzień i o jeden rok naraz.
  assert.equal(
    formatDayFromDays(1, { day: 1, month: "Jan", year: 2027 }, 2026),
    "Tomorrow",
  );
  assert.equal(dayFormFromDays(1, 2027, 2026), "relative");
});

test("the day rule drops the current year and never writes a comma", () => {
  const thisYear = { day: 30, month: "Sep", year: 2026 } as const;
  const otherYear = { day: 31, month: "Mar", year: 2027 } as const;

  assert.equal(formatDayFromDays(47, thisYear, 2026), "Sep 30");
  assert.equal(formatDayFromDays(229, otherYear, 2026), "Mar 31 2027");
  assert.equal(dayFormFromDays(47, 2026, 2026), "thisYear");
  assert.equal(dayFormFromDays(229, 2027, 2026), "otherYear");
  // PRZECINKA NIE MA W ŻADNEJ GAŁĘZI, i to jest osobna asercja, bo to osobne
  // zdanie prototypu: `dateStyle: "medium"` stawia go zawsze, a rok, który
  // znika w połowie przypadków, zostawiłby go wiszącego.
  for (const days of [-400, -2, 47, 229])
    assert.equal(
      formatDayFromDays(days, days > 100 ? otherYear : thisYear, 2026).includes(
        ",",
      ),
      false,
    );
});

test("formatDate reads the clock once and lands in the right branch", () => {
  // Wyprowadzone z zegara, nie wpisane — południe UTC, więc żadna strefa nie
  // przesuwa dnia, a asercja jest prawdziwa każdego dnia roku.
  const today = new Date();
  const noon = (dayOffset: number): string =>
    `${new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + dayOffset, 12)).toISOString().slice(0, 10)}T12:00:00.000Z`;

  assert.equal(formatDate(noon(0), "UTC"), "Today");
  assert.equal(formatDate(noon(-1), "UTC"), "Yesterday");
  assert.equal(formatDate(noon(1), "UTC"), "Tomorrow");
  assert.equal(dayFormOf(noon(-1), "UTC"), "relative");

  // Rok wstecz co do dnia: inny rok kalendarzowy każdego dnia roku, więc rok
  // JEST wypisany i stoi bez przecinka.
  const lastYear = `${new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate(), 12)).toISOString().slice(0, 10)}T12:00:00.000Z`;
  assert.equal(dayFormOf(lastYear, "UTC"), "otherYear");
  assert.match(formatDate(lastYear, "UTC"), /^[A-Z][a-z]{2} \d{1,2} \d{4}$/u);
  assert.equal(formatDate(lastYear, "UTC").includes(","), false);
});

test("the surface band says the weekday, the day and the month in full", () => {
  const band = formatBandDay("2026-07-27T12:00:00.000Z", "UTC");

  assert.equal(band.weekday, "Monday");
  assert.equal(band.remainder, "27 July 2026");
});
