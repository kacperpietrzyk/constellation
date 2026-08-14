import assert from "node:assert/strict";
import test, { after, mock } from "node:test";

import {
  DAYS_BACK_INTO_LAST_YEAR,
  fixtureDayAt,
  fixtureThisYearDay,
  harnessTimeZone,
} from "../src/dev/fixture-days.js";
import {
  dateKeyInZone,
  dayFormOf,
  daysUntil,
  formatDate,
} from "../src/i18n.js";

/* ODPORNOŚĆ FIKSTURY NA ZEGAR, ZMIERZONA — NIE ZADEKLAROWANA.
 *
 * Poprzednia wersja tej arytmetyki NIOSŁA W KOMENTARZU zdanie „każda gałąź
 * stała KAŻDEGO DNIA ROKU" i była nieprawdziwa przez 4–8 % doby: dzień liczyła
 * z UTC (`toISOString`), a gałąź klasyfikuje się w strefie czytelnika. Zdanie
 * w komentarzu nie odróżnia się niczym od zdania prawdziwego, więc rolę
 * dowodu bierze ten plik.
 *
 * ZEGAR JEST PRZESUWANY NAPRAWDĘ, a nie udawany podmianą daty w źródle:
 * `mock.timers` podmienia `Date`, więc `dayFormOf` i `formatDate` — TE SAME
 * funkcje, z których czytają ekrany — widzą przesunięty instant.
 * Fikstura dostaje ten sam instant parametrem. Zestaw instantów niżej celuje
 * dokładnie w te miejsca, w których stara wersja padała.
 */

const ZONE = harnessTimeZone;

/** Instanty, przy których stara arytmetyka rozjeżdżała się z czytelnikiem. */
const INSTANTS: readonly { readonly at: string; readonly why: string }[] = [
  { at: "2026-08-14T09:00:00.000Z", why: "południe roboczej doby, kontrola" },
  {
    at: "2026-08-13T21:59:00.000Z",
    why: "minutę PRZED letnią rolką doby warszawskiej",
  },
  {
    at: "2026-08-13T22:00:00.000Z",
    why: "letnia rolka doby: Warszawa ma już 14.08, UTC wciąż 13.08",
  },
  {
    at: "2026-08-13T23:30:00.000Z",
    why: "środek okna 22:00–24:00 UTC, w którym padała stara wersja",
  },
  {
    at: "2026-12-31T22:30:00.000Z",
    why: "zima, PRZED rolką: Warszawa wciąż 31.12",
  },
  {
    at: "2026-12-31T23:00:00.000Z",
    why: "zimowa rolka NA PRZEŁOMIE ROKU: Warszawa ma 01.01.2027",
  },
  { at: "2027-01-01T12:00:00.000Z", why: "pierwszy dzień nazwanej dziury" },
  { at: "2027-01-03T12:00:00.000Z", why: "ostatni dzień nazwanej dziury" },
  {
    at: "2027-01-03T23:30:00.000Z",
    why: "zimowa rolka doby: czytelnik ma 04.01, więc dziura się zamyka",
  },
  {
    at: "2028-02-29T23:30:00.000Z",
    why: "29 lutego roku przestępnego, po rolce doby",
  },
  {
    at: "2028-12-31T12:00:00.000Z",
    why: "czytelnik stoi na 31 grudnia ROKU PRZESTĘPNEGO — jedyny dzień, w którym 365 dni wstecz zostaje w TYM SAMYM roku",
  },
  {
    at: "2028-12-31T23:30:00.000Z",
    why: "ta sama doba po zimowej rolce: czytelnik ma już 01.01.2029",
  },
];

mock.timers.enable({ apis: ["Date"] });
after(() => {
  mock.timers.reset();
});

test("the harness fixture's day offsets are the READER's days at every instant", () => {
  const rows: string[] = [];
  for (const instant of INSTANTS) {
    const now = Date.parse(instant.at);
    mock.timers.setTime(now);
    const todayKey = dateKeyInZone(now, ZONE);

    // WŁASNOŚĆ, KTÓRA ZASTĘPUJE OBIETNICĘ: przesunięcie o n dni JEST n dniami
    // czytelnika. Zakres obejmuje każde przesunięcie, którego używa fikstura
    // Library (−1 … −20) plus kotwicę roku wstecz.
    for (const offset of [
      0,
      -1,
      -2,
      -3,
      -5,
      -8,
      -12,
      -20,
      DAYS_BACK_INTO_LAST_YEAR,
    ]) {
      assert.equal(
        daysUntil(fixtureDayAt(offset, now, ZONE), todayKey, ZONE),
        offset,
        `przesunięcie ${offset} nie jest ${offset} dniami czytelnika przy ${instant.at} (${instant.why})`,
      );
    }

    // GAŁĄŹ WZGLĘDNA — I TO JEST SŁOWO, NIE ATRYBUT. Ta asercja jest oczekiwaną
    // wartością pary bramkowej L10-06: „Yesterday" nie zależy od kalendarza,
    // ale zależy od tego, czy fikstura liczy dzień w strefie czytelnika.
    const yesterday = fixtureDayAt(-1, now, ZONE);
    assert.equal(
      formatDate(yesterday, ZONE),
      "Yesterday",
      `najświeższa notatka nie czyta się „Yesterday" przy ${instant.at} (${instant.why})`,
    );
    assert.equal(dayFormOf(yesterday, ZONE), "relative");

    // GAŁĄŹ „INNY ROK" — bez dziury, w każdym z instantów.
    const lastYear = fixtureDayAt(DAYS_BACK_INTO_LAST_YEAR, now, ZONE);
    assert.equal(
      dayFormOf(lastYear, ZONE),
      "otherYear",
      `kotwica roku wstecz nie jest innym rokiem przy ${instant.at} (${instant.why})`,
    );

    // GAŁĄŹ „ROK BIEŻĄCY" — z NAZWANĄ dziurą 1–3 stycznia, liczoną w strefie
    // czytelnika. Test nie omija dziury: asertuje, co się w niej dzieje.
    const inHole = ["01-01", "01-02", "01-03"].includes(todayKey.slice(5));
    const thisYear = fixtureThisYearDay(now, ZONE);
    assert.equal(
      dayFormOf(thisYear, ZONE),
      inHole ? "otherYear" : "thisYear",
      `kotwica roku bieżącego mówi co innego niż nazwana dziura przy ${instant.at} (${instant.why})`,
    );
    // I JAK DALEKO ONA LEŻY, bo sama gałąź tego nie wystarcza. W dziurze obie
    // wersje kotwicy — ta licząca rok z czytelnika i ta licząca go z UTC —
    // oddają `otherYear`, tylko z DAT ODLEGŁYCH o trzysta pięćdziesiąt dni.
    // Bez tej asercji podmiana źródła roku na UTC jest przez ten plik
    // NIEWIDOCZNA, czyli byłaby kolejnym niezmierzonym zdaniem. Kotwica jest
    // z definicji `min(15 stycznia, dziś − 3 dni)`, więc nigdy nie jest bliżej
    // niż trzy dni, a w dziurze jest DOKŁADNIE trzy dni wstecz.
    const anchorDays = daysUntil(thisYear, todayKey, ZONE);
    assert.ok(
      anchorDays <= -3,
      `kotwica roku bieżącego stoi ${anchorDays} dni od dziś, czyli w zasięgu gałęzi względnej, przy ${instant.at}`,
    );
    if (inHole)
      assert.equal(
        anchorDays,
        -3,
        `w dziurze kotwica ma być trzy dni wstecz, a jest ${anchorDays} przy ${instant.at} (${instant.why})`,
      );

    rows.push(
      [
        instant.at,
        `czytelnik ${todayKey}`,
        `-1 → ${formatDate(yesterday, ZONE)}`,
        `rok bieżący → ${dayFormOf(thisYear, ZONE)} (${anchorDays} d)${inHole ? " — nazwana dziura" : ""}`,
        `${DAYS_BACK_INTO_LAST_YEAR} → ${dayFormOf(lastYear, ZONE)}`,
      ].join("\t"),
    );
  }

  // Podłoga na liczbie przebiegniętych instantów: zestaw zwinięty do zera
  // przeszedłby jako zieleń, a tego rodzaju zieleń ten plik ma wykluczać.
  assert.ok(
    INSTANTS.length >= 12,
    `zestaw instantów skurczył się do ${INSTANTS.length}`,
  );
  console.log(`\n${rows.join("\n")}\n`);
});
