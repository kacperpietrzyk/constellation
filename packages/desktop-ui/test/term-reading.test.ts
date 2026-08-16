import assert from "node:assert/strict";
import test from "node:test";

import {
  monthsFromDays,
  termReading,
  type ContractClock,
} from "../src/renewals/renewals-view.js";

// Wiersz odnowienia drukuje ułamek („6 mo of 2 yrs") i RYSUJE go paskiem tuż
// pod spodem, a nazwa dostępna skleja jedno z drugim w jedno zdanie
// (`RenewalsSurface.tsx:419-427`). Więc to jest JEDEN pomiar podany dwa razy, a
// nie dwie opinie o tej samej rzeczy — i ten plik pilnuje, że tak zostanie.
//
// Rozjazd był realny, nie hipotetyczny: `percent` szedł z `clock.progress`,
// czyli z DAT, a etykieta z `termMonths`, czyli z danych kontraktu. Zgadzały
// się tylko wtedy, gdy zapisany termin akurat pokrywał się z rozpiętością dat,
// a nic tego nie wymusza — `termStartsAt`, `expiresAt` i `termMonths` to trzy
// niezależne pola.

const clockOf = (elapsedDays: number, daysLeft: number): ContractClock => {
  const totalDays = elapsedDays + daysLeft;
  return {
    daysLeft,
    startAction: daysLeft - 90,
    closed: false,
    elapsedDays,
    totalDays,
    // Dokładnie to, co liczy `contractClock`.
    progress: Math.min(1, Math.max(0, elapsedDays / totalDays)),
    dueToStart: false,
    canAmend: true,
  };
};

const percentOfLabel = (label: string): number => {
  // Ułamek odczytany z SAMEJ etykiety, żeby asercja nie powtarzała wzoru z
  // kodu — inaczej mierzyłaby własną kopię implementacji.
  const [done, total] = label.split(" of ");
  const months = (span: string): number =>
    (/(\d+) yrs?/u.exec(span) === null
      ? 0
      : Number(/(\d+) yrs?/u.exec(span)?.[1]) * 12) +
    (/(\d+) mo/u.exec(span) === null ? 0 : Number(/(\d+) mo/u.exec(span)?.[1]));
  return Math.round((months(done ?? "") / months(total ?? "")) * 100);
};

test("pasek pokazuje ten sam ułamek co etykieta, gdy termin nie zgadza się z datami", () => {
  // Kontrakt na 24 miesiące, którego daty mówią, że minęło pół roku z roku.
  // Etykieta liczy do 24 miesięcy, stary `percent` liczył do roku.
  const reading = termReading({ termMonths: 24 }, clockOf(183, 182));
  assert.ok(reading !== undefined);
  assert.equal(reading.label, "6 mo of 2 yrs");
  assert.equal(
    reading.percent,
    percentOfLabel(reading.label),
    "pasek i etykieta mówią o tym samym",
  );
  assert.equal(reading.percent, 25);
});

test("etykieta mówiąca, że termin dobiegł końca, nie stoi obok paska na połowie", () => {
  // Termin zapisany na 6 miesięcy, daty rozciągnięte na dwa lata. Etykieta
  // przycina licznik do mianownika i czyta się „termin się skończył"; stary
  // `percent` dawał do tego 50%, czyli zdanie samo sobie przeczyło.
  const reading = termReading({ termMonths: 6 }, clockOf(365, 365));
  assert.ok(reading !== undefined);
  assert.equal(reading.label, "6 mo of 6 mo");
  assert.equal(reading.percent, 100);
  assert.equal(reading.percent, percentOfLabel(reading.label));
});

test("przycięcie licznika przenosi się na procent — przekroczony termin to 100, nie 117", () => {
  const reading = termReading({ termMonths: 12 }, clockOf(426, -61));
  assert.ok(reading !== undefined);
  assert.equal(monthsFromDays(426), 14); // licznik przed przycięciem
  assert.equal(reading.label, "1 yr of 1 yr");
  assert.equal(reading.percent, 100);
});

test("bez zapisanego terminu mianownik spada na daty, a para nadal się zgadza", () => {
  const clock = clockOf(183, 182);
  const reading = termReading({}, clock);
  assert.ok(reading !== undefined);
  assert.equal(reading.percent, percentOfLabel(reading.label));
  // Tu — i tylko tu — obie podstawy są tą samą podstawą, więc wynik pokrywa
  // się z `clock.progress`. To jest ten przypadek, w którym stara wersja
  // wyglądała na poprawną.
  assert.equal(reading.percent, Math.round((clock.progress ?? 0) * 100));
});

test("procent nigdy nie jest NaN ani nieskończonością", () => {
  for (const [termMonths, elapsed, left] of [
    [0, 100, 100],
    [24, 0, 730],
    [1, 3650, -3000],
  ] as const) {
    const reading = termReading({ termMonths }, clockOf(elapsed, left));
    assert.ok(reading !== undefined);
    assert.ok(
      Number.isFinite(reading.percent),
      `termMonths=${termMonths} daje liczbę, nie ${reading.percent}`,
    );
    assert.ok(reading.percent >= 0 && reading.percent <= 100);
  }
});
