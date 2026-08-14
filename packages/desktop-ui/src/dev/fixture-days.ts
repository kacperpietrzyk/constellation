// ── DZIEŃ FIKSTURY LICZY SIĘ W STREFIE CZYTELNIKA, NIE W DOBIE UTC ──────────
//
// Ten plik istnieje, bo ta arytmetyka była napisana DWA RAZY — raz
// w `crm-fixture.ts`, raz w `library-fixture.ts` — i oba egzemplarze miały tę
// samą wadę. To jest kształt, za który to repozytorium płaci od fal: ta sama
// rzecz przepisana obok siebie milknie osobno.
//
// CO BYŁO ZŁE. Obie kopie liczyły dzień przez `new Date(Date.now() + n*24h)
// .toISOString()`, czyli W UTC, a gałąź daty klasyfikuje się w STREFIE
// WORKSPACE'U (`dayFormOf` dostaje `snapshot.bootstrap.workspace.timezone`).
// Między rolką doby UTC a rolką doby warszawskiej — 22:00–24:00 UTC latem,
// 23:00–24:00 zimą, czyli 4–8 % wszystkich przebiegów — przesunięcie `-1`
// oddawało dzień odległy od czytelnika o DWA dni: napis czytał się „Aug 13",
// atrybut mówił `thisYear`, a para bramkowa L10-03 widziała ZERO elementów
// i kładła bramkę układu w CI.
//
// CO JEST TERAZ, jako jedna własność, a nie jako obietnica:
//
//   daysUntil(fixtureDayAt(n, now, tz), dateKeyInZone(now, tz), tz) === n
//   dla KAŻDEGO n i KAŻDEGO instantu `now`.
//
// Trzyma się to na dwóch krokach, z których żaden nie czyta doby maszyny:
// klucz dnia bierze się z `dateKeyInZone` — tego samego odczytu, którym
// `dayFormOf` wyznacza „dziś" — a przesunięcie liczy się na kluczu dnia w UTC,
// gdzie doba ma równo 24 h i czasu letniego nie ma. Południe UTC leży tego
// samego dnia w Warszawie przy obu przesunięciach (+1 i +2), więc stempel
// `T12:00:00.000Z` wraca do dnia kalendarzowego, z którego wyszedł.
//
// ZEGAR JEST WEJŚCIEM, NIE ODCZYTEM W ŚRODKU — ta sama zasada, którą `i18n.ts`
// stosuje do `formatDayFromDays`. Dzięki temu odporność na kalendarz da się
// ZMIERZYĆ zamiast zadeklarować: `test/fixture-days.test.ts` przebiega te
// funkcje przy przesuniętych zegarach, w tym w oknie 22:00–24:00 UTC, na
// przełomie roku i na 29 lutego.

import { dateKeyInZone } from "../i18n.js";

const DAY_MS = 86_400_000;

/**
 * STREFA, W KTÓREJ FIKSTURY HARNESSU LICZĄ DNI — i jednocześnie ta, którą
 * `CollaborationHarness` deklaruje jako strefę workspace'u. Jedna wartość,
 * bo fikstura licząca dzień w innej strefie niż deklaruje rysuje przez kilka
 * godzin na dobę ekran, którego nikt nie umie odtworzyć.
 */
export const harnessTimeZone = "Europe/Warsaw";

/** „YYYY-MM-DD" przesunięte o całe dni — arytmetyka na dobie UTC, więc dokładna. */
const dayKeyPlus = (dayKey: string, dayOffset: number): string =>
  new Date(Date.parse(`${dayKey}T00:00:00.000Z`) + dayOffset * DAY_MS)
    .toISOString()
    .slice(0, 10);

/**
 * Dzień o zadanym przesunięciu od DNIA CZYTELNIKA, w południe UTC. Południe,
 * a nie północ, bo instant 00:00Z jest w połowie świata dniem poprzednim.
 */
export const fixtureDayAt = (
  dayOffset: number,
  now: number,
  timeZone: string,
): string =>
  `${dayKeyPlus(dateKeyInZone(now, timeZone), dayOffset)}T12:00:00.000Z`;

/**
 * Dzień w BIEŻĄCYM roku kalendarzowym CZYTELNIKA, oddalony od dziś o więcej niż
 * jeden dzień — czyli gałąź „rok bieżący, rok pominięty".
 *
 * 15 stycznia tego roku, a gdy rok jest od niego młodszy — trzy dni wstecz.
 * NAZWANA DZIURA, TRZY DNI W ROKU: 1, 2 i 3 stycznia. Liczone W STREFIE
 * CZYTELNIKA, więc dziura otwiera się o północy warszawskiej 1 stycznia —
 * a nie, jak w wersji liczonej z UTC, dwie godziny wcześniej, jeszcze
 * 31 grudnia. Tych trzech dni nie spełnia żaden dzień naraz (rok ma wtedy mniej
 * niż trzy dni przeszłości), więc notatka wpada w gałąź „inny rok", a para
 * L10-04 wraca czerwona. To jest własność kalendarza, nie produktu; alternatywą
 * jest data w PRZYSZŁOŚCI, której `updatedAt` nie wolno nieść — byłaby też
 * najświeższą notatką i otwierałaby czytelnię na notatce bez treści.
 */
export const fixtureThisYearDay = (now: number, timeZone: string): string => {
  const todayKey = dateKeyInZone(now, timeZone);
  const january15 = `${todayKey.slice(0, 4)}-01-15`;
  const threeBack = dayKeyPlus(todayKey, -3);
  return `${january15 < threeBack ? january15 : threeBack}T12:00:00.000Z`;
};

/**
 * Ile dni wstecz zawsze leży w POPRZEDNIM roku kalendarzowym — i to jest 366,
 * a nie 365. Powód jest arytmetyczny: najdłuższy odstęp MIESZCZĄCY SIĘ w jednym
 * roku to 365 dni (1 stycznia → 31 grudnia roku przestępnego), więc 365 dni
 * wstecz zawodzi 31 grudnia roku przestępnego, a 366 nie zawodzi nigdy.
 * Wersja „ten sam dzień rok wcześniej" miała ponadto wadę strefy opisaną wyżej
 * i cichy przypadek 29 lutego.
 */
export const DAYS_BACK_INTO_LAST_YEAR = -366;
