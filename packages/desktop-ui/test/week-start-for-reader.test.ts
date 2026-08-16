import assert from "node:assert/strict";
import test from "node:test";

import { weekStartForReader } from "../src/client/workflow.js";

// `cockpit.week` dostaje `weekStart` i dolicza sześć dni w UTC (wave2.ts), więc
// ma dostać poniedziałek CZYTELNIKA zapisany jako klucz dnia. Poprzednia wersja
// cofała się metodami LOKALNYMI, a serializowała przez `toISOString()` — dwie
// podstawy naraz — i przez to podawała zły tydzień przez część każdej doby.
//
// Asercje stoją na ABSOLUTNYCH instantach, nie na napisach z lokalną ścianą
// czasu: ten sam moment ma należeć do dwóch RÓŻNYCH tygodni w dwóch strefach,
// czego wersja mieszająca podstawy nie umie oddać w żadnej z nich.
//
// Strefa wchodzi parametrem, nie przez `process.env.TZ`: `dateKeyInZone`
// cacheuje formatter po nazwie strefy, więc przełączanie zmiennej środowiskowej
// w trakcie procesu zmierzyłoby pierwszą strefę, jaka się trafiła, i przeszłoby
// niezależnie od tego, czy kod jest poprawny.

const MONDAY = "2026-08-17";
const PREVIOUS_MONDAY = "2026-08-10";

test("ten sam instant należy do dwóch różnych tygodni w dwóch strefach", () => {
  // 2026-08-16T22:30Z to poniedziałek 00:30 w Warszawie i niedziela 18:30 w
  // Nowym Jorku. To jest ta jedna para, której stara implementacja nie mogła
  // oddać: liczyła jeden klucz dla obu.
  const instant = new Date("2026-08-16T22:30:00.000Z");
  assert.equal(weekStartForReader(instant, "Europe/Warsaw"), MONDAY);
  assert.equal(
    weekStartForReader(instant, "America/New_York"),
    PREVIOUS_MONDAY,
  );
});

test("poniedziałek czytelnika trzyma się przez całą jego dobę", () => {
  // Cztery momenty poniedziałku w Warszawie: tuż po północy, południe, wieczór
  // i ostatnia minuta. Pierwszy z nich to jeszcze niedziela w UTC — dokładnie
  // ten, na którym stara wersja podawała niedzielę przed poniedziałkiem.
  for (const instant of [
    "2026-08-16T22:00:00.000Z", // 00:00 lokalnie
    "2026-08-17T10:00:00.000Z", // 12:00 lokalnie
    "2026-08-17T19:00:00.000Z", // 21:00 lokalnie
    "2026-08-17T21:59:00.000Z", // 23:59 lokalnie
  ]) {
    assert.equal(
      weekStartForReader(new Date(instant), "Europe/Warsaw"),
      MONDAY,
      `${instant} stoi w poniedziałek 2026-08-17 czasu warszawskiego`,
    );
  }
  // I to samo w strefie po drugiej stronie UTC, gdzie stara wersja myliła się
  // od 20:00 lokalnego KAŻDEGO dnia, nie tylko na granicy tygodnia.
  for (const instant of [
    "2026-08-17T04:30:00.000Z", // poniedziałek 00:30 lokalnie
    "2026-08-18T01:00:00.000Z", // poniedziałek 21:00 lokalnie
    "2026-08-18T03:59:00.000Z", // poniedziałek 23:59 lokalnie
    "2026-08-20T03:30:00.000Z", // środa 23:30 lokalnie
  ]) {
    assert.equal(
      weekStartForReader(new Date(instant), "America/New_York"),
      MONDAY,
      `${instant} stoi w tygodniu od 2026-08-17 czasu nowojorskiego`,
    );
  }
});

test("niedziela należy do tygodnia, który się zaczął, a nie do następnego", () => {
  // ISO: tydzień biegnie od poniedziałku, więc niedziela zamyka poprzedni.
  // Godzina późna po to, żeby wersja licząca w UTC przeskoczyła o tydzień.
  assert.equal(
    weekStartForReader(new Date("2026-08-16T21:30:00.000Z"), "Europe/Warsaw"),
    PREVIOUS_MONDAY,
  );
  assert.equal(
    weekStartForReader(
      new Date("2026-08-17T03:30:00.000Z"),
      "America/New_York",
    ),
    PREVIOUS_MONDAY,
  );
});

test("odpowiedź jest zawsze kluczem dnia, nigdy instantem", () => {
  // Ochrona przed „poprawką", która oddałaby `toISOString()` w całości:
  // konsument skleja `${weekStart}T00:00:00.000Z`, więc każdy inny kształt
  // rozjeżdża zapytanie po cichu, zamiast je odrzucić.
  for (const zone of [
    "Europe/Warsaw",
    "America/New_York",
    "Asia/Tokyo",
    "UTC",
  ]) {
    assert.match(
      weekStartForReader(new Date("2026-08-16T22:30:00.000Z"), zone),
      /^\d{4}-\d{2}-\d{2}$/u,
      `${zone} oddaje klucz dnia`,
    );
  }
});
