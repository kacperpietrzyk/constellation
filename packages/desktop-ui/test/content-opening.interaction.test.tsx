import { strict as assert } from "node:assert";

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test, vi } from "vitest";

import type { CommandEnvelope } from "@constellation/contracts";
import type { ScenarioFixtures } from "../src/client/scenario-client.js";
import type { DesktopSnapshot } from "../src/client/workflow.js";

import { DAY_PARTS, dayGreeting, dayPartOf } from "../src/i18n.js";
import {
  populatedPlanDayKey,
  populatedShellQueries,
  principalId,
  projectionResponse,
} from "./shell-fixture.js";

// CZYM DWA EKRANY OTWIERAJĄ TREŚĆ — wpisy 1-1 i 2-3, lot L3 Fazy II.
//
// PO CO OSOBNY PLIK, skoro oś czwarta przyrządu pasma
// (`scripts/title-band-action.mjs`) mierzy dokładnie te dwa ekrany i od tego
// lotu RZUCA. Bo tamta oś mierzy STOPIEŃ — „czy pierwszy nagłówek poza pasmem
// wypada na `--text-2xl`" — i to jest wszystko, co umie zapytać. Trzy rzeczy,
// których nie zapyta, a które są treścią tych wpisów, stoją tutaj:
//
//   * KTÓRE SŁOWA. „Good morning, Kacper" i „This week" to nie ozdoba: pierwszy
//     wpis mówi wprost, że powitanie potrzebuje IMIENIA i PORY DNIA. Nagłówek
//     złożony poprawnie i mówiący „Today" spełniłby oś w całości;
//   * GAŁĄŹ BEZ IMIENIA. Fikstura bramki układu ZAWSZE oddaje `workspace.access`
//     (`dev/CollaborationHarness.tsx` — `currentPrincipalId` + `displayName`),
//     więc stanu „nie dało się zapytać" bramka nie umie narysować. Fikstura
//     interakcyjna oddaje go za darmo: `populatedShellQueries` NIE MA tego
//     zapytania. Reguła jest tu odwrotna niż w stopce paska bocznego, gdzie
//     brak odczytu rysuje NIC — nagłówek znikający razem z imieniem skasowałby
//     otwarcie ekranu, czyli tę samą rzecz, którą ten lot dowozi. Degraduje się
//     TEKST, nie element;
//   * KTÓRY TYDZIEŃ. Nasz Kalendarz umie pokazać tydzień inny niż bieżący,
//     a prototyp nie ma nawigacji tygodnia i pisze „This week" na stałe. Napis
//     musi więc jechać z `weekOffset`, bo inaczej jest zdaniem nieprawdziwym
//     nad siatką następnego tygodnia.
//
// ŻADNA ASERCJA NIŻEJ NIE ZNA GODZINY ANI DATY. Pora dnia jest wyprowadzona
// z zegara przez `dayPartOf` i sprawdzana przez PRZYNALEŻNOŚĆ do zamkniętego
// zbioru `DAY_PARTS` oraz przez zgodność napisu z `dayGreeting(part, name)`.
// Asercja na napisie „Good morning" byłaby asercją, która gnije w południe —
// to jest ta sama klasa co data wpisana w fiksturę, która położyła `main` tej
// fali dwa razy.

const READER_NAME = "Kacper";
// STREFA FIKSTURY POWŁOKI (`shell-fixture.ts` — `timezone: "Europe/Warsaw"`).
// Stoi tu po to, żeby porę dnia dało się policzyć NIEZALEŻNIE od ekranu:
// odczytanie `data-greeting-part` z elementu i porównanie napisu z tą samą
// wartością sprawdza wyłącznie WEWNĘTRZNĄ spójność — komponent, który wpisałby
// na sztywno atrybut i tekst, przeszedłby to bez mrugnięcia.
const FIXTURE_ZONE = "Europe/Warsaw";

const accessQueries: ScenarioFixtures["queries"] = {
  ...populatedShellQueries,
  "workspace.access": projectionResponse({
    kind: "workspace.access",
    policyVersion: 1,
    currentPrincipalId: principalId,
    canManage: true,
    members: [
      {
        membershipId: "00000000-0000-4000-8000-0000000000b1",
        principalId,
        displayName: READER_NAME,
        role: "owner",
        status: "active",
        version: 1,
        spaces: [],
      },
    ],
  }),
};

// TEN SAM ODCZYT, TYLKO IMIĘ JEST ZASTĘPNIKIEM. `dayGreeting` odrzuca „You"
// (i pusty napis, i same spacje), więc dostęp „ready" nie znaczy jeszcze
// „powitanie ma czym nazwać czytelnika" — i to jest jedyna para wejść, na
// której atrybut liczony ze stanu odczytu i atrybut liczony ze słów dają różne
// odpowiedzi.
const placeholderNameQueries: ScenarioFixtures["queries"] = {
  ...populatedShellQueries,
  "workspace.access": projectionResponse({
    kind: "workspace.access",
    policyVersion: 1,
    currentPrincipalId: principalId,
    canManage: true,
    members: [
      {
        membershipId: "00000000-0000-4000-8000-0000000000b1",
        principalId,
        displayName: "You",
        role: "owner",
        status: "active",
        version: 1,
        spaces: [],
      },
    ],
  }),
};

let container: HTMLDivElement;
let root: Root;
let mounted = false;
const commands: CommandEnvelope[] = [];

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  commands.length = 0;
  // Ten sam szew, co w `today.interaction`: ekran dnia pyta zegar, a fikstura
  // ma stałe daty. Godzina jest tu ustawiona PO TO, żeby test nie zależał od
  // tego, kiedy się go uruchomi — ale ani jedna asercja niżej jej nie zna.
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${populatedPlanDayKey}T09:30:00.000Z`));
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  if (mounted) {
    mounted = false;
    act(() => {
      root.unmount();
    });
  }
  container.remove();
  vi.useRealTimers();
});

const mountShell = async (
  queries: ScenarioFixtures["queries"],
  accessReady: boolean,
): Promise<HTMLElement> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({
    queries,
    executeCommand: (command) => {
      commands.push(command);
      return {
        kind: "contract_rejected",
        diagnosticCode: "contract.invalid",
        issues: [{ path: "", code: "custom" }],
      } as never;
    },
  });
  const snapshot = await loadDesktopSnapshot(client);
  // FIKSTURA, KTÓREJ NIE WIDAĆ, CHOWA. Bez tego oba przypadki tego pliku
  // mogłyby czytać ten sam, pusty stan — jeden z nich nadal na zielono.
  assert.equal(
    snapshot.access.kind === "ready",
    accessReady,
    accessReady
      ? "the workspace.access fixture never reached the snapshot, so the named case measures the nameless branch twice"
      : "workspace.access resolved even though the fixture does not carry it, so the nameless case measures nothing",
  );
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });
  return container;
};

/**
 * Pierwszy nagłówek W TREŚCI — ta sama reguła, którą stosuje oś czwarta
 * przyrządu pasma (`verify-renderer-layout.mjs`: pierwszy `h1,h2,h3` poza
 * pasmem, w kolumnie pracy). Powtórzona tutaj, bo „element istnieje gdzieś na
 * ekranie" i „element OTWIERA treść" to dwa różne zdania, a wpis mówi to
 * drugie. Bez tego nagłówek dołożony pod listami przeszedłby oba testy.
 */
const openingHeading = (
  scope: HTMLElement,
  bandSelector: string,
): HTMLElement => {
  const band = scope.querySelector(bandSelector);
  assert.ok(band, `no title band matched ${bandSelector}`);
  const heading = [...scope.querySelectorAll<HTMLElement>("h1, h2, h3")].find(
    (node) => !band.contains(node) && (node.textContent ?? "").trim() !== "",
  );
  assert.ok(heading, "the screen opens its content with no heading at all");
  return heading;
};

test("Today opens its content with a greeting that names the reader and the part of the day", async () => {
  const scope = await mountShell(accessQueries, true);

  const opening = openingHeading(scope, "header.surface-header");
  assert.equal(
    opening.dataset.todayGreeting,
    "true",
    `the first heading in Today's content is not the greeting: „${(opening.textContent ?? "").trim()}"`,
  );

  // PORA POLICZONA OBOK EKRANU, nie odczytana z niego: ten sam zegar (test
  // trzyma go nieruchomo) i ta sama strefa, którą deklaruje fikstura powłoki.
  const part = dayPartOf(Date.now(), FIXTURE_ZONE);
  assert.ok(
    (DAY_PARTS as readonly string[]).includes(part),
    `the part of the day resolved outside the closed set: „${String(part)}"`,
  );
  assert.equal(
    opening.dataset.greetingPart,
    part,
    "the greeting names a different part of the day than the workspace clock does",
  );
  // RÓWNOŚĆ Z REGUŁĄ, NIE Z NAPISEM. Asercja przeżyje każdą godzinę doby
  // i pada, gdy ktoś rozłączy napis od pory albo od imienia.
  assert.equal(
    (opening.textContent ?? "").trim(),
    dayGreeting(part, READER_NAME),
    "the greeting says something other than its own part of the day and the reader's name",
  );
  assert.equal(
    opening.dataset.greetingNamed,
    "true",
    "the greeting reports itself as nameless while the access read carries a name",
  );
  assert.equal(
    (opening.textContent ?? "").includes(READER_NAME),
    true,
    "the greeting drops the reader's name, which is half of what entry 1-1 asks for",
  );
});

test("an access read that succeeds with a placeholder for a name is reported as nameless, not as named", async () => {
  // TRZECI PRZYPADEK, BO SĄ TRZY, A NIE DWA. Odczyt dostępu udaje się i NIESIE
  // członka — a mimo to powitanie nie ma czym nazwać czytelnika, bo „You" jest
  // zastępnikiem, nie imieniem. Atrybut liczony jako „czy odczyt się udał"
  // mówił tu `"true"` nad napisem BEZ imienia; ten przypadek jest jedynym
  // miejscem, w którym oba rachunki się rozchodzą, więc bez niego poprawka
  // w `TodaySurface` nie ma świadka na ekranie.
  const scope = await mountShell(placeholderNameQueries, true);

  const opening = openingHeading(scope, "header.surface-header");
  const part = dayPartOf(Date.now(), FIXTURE_ZONE);
  assert.equal(
    (opening.textContent ?? "").trim(),
    dayGreeting(part),
    "the placeholder reached the greeting as if it were a name",
  );
  assert.equal(
    opening.dataset.greetingNamed,
    "false",
    "the greeting reports itself as named while its own words carry no name — the attribute is answering about the access read instead of about the words",
  );
});

test("a refused access read leaves the greeting standing and takes only the name out of it", async () => {
  const scope = await mountShell(populatedShellQueries, false);

  const opening = openingHeading(scope, "header.surface-header");
  assert.equal(
    opening.dataset.todayGreeting,
    "true",
    "the screen stopped opening with a greeting the moment the access read was refused — the heading has to survive the read",
  );
  const part = dayPartOf(Date.now(), FIXTURE_ZONE);
  assert.equal(
    opening.dataset.greetingPart,
    part,
    "the nameless greeting names a different part of the day than the workspace clock does",
  );
  assert.equal(
    (opening.textContent ?? "").trim(),
    dayGreeting(part),
    "the greeting fell back to something other than the bare salutation",
  );
  assert.equal(
    opening.dataset.greetingNamed,
    "false",
    "the greeting reports itself as named over a read that was refused",
  );
  // ŻADNEGO ZASTĘPNIKA W MIEJSCU IMIENIA — ta sama reguła, którą lot L11
  // zapisał przy stopce paska bocznego: „You" wygląda na odpowiedź.
  assert.equal(
    (opening.textContent ?? "").includes("You"),
    false,
    `the greeting put a placeholder where the reader's name belongs: „${(opening.textContent ?? "").trim()}"`,
  );
});

test("dayGreeting refuses to greet a placeholder, and names every part of the day", () => {
  for (const part of DAY_PARTS) {
    const bare = dayGreeting(part);
    assert.equal(
      bare.startsWith("Good "),
      true,
      `the salutation for „${part}" is not a greeting: „${bare}"`,
    );
    assert.equal(
      dayGreeting(part, "You"),
      bare,
      "the placeholder „You” reached the greeting as if it were a name",
    );
    assert.equal(dayGreeting(part, "   "), bare, "blank space became a name");
    assert.equal(dayGreeting(part, "Ada"), `${bare}, Ada`);
  }
  // TRZY RÓŻNE POWITANIA, NIE TRZY RAZY TO SAMO. Bez tej asercji mapa, która
  // zwraca „Good morning" na każdą porę, przechodzi wszystko wyżej.
  assert.equal(new Set(DAY_PARTS.map((part) => dayGreeting(part))).size, 3);
});

test("dayPartOf reads the hour in the workspace's zone, not the machine's", () => {
  // Południe UTC to 14:00 w Warszawie latem i 03:00 w Los Angeles — jeden
  // instant, trzy różne odpowiedzi. To jest cały powód, dla którego pora dnia
  // jest funkcją strefy, a nie `new Date().getHours()`.
  const instant = "2026-08-15T12:00:00.000Z";
  assert.equal(dayPartOf(instant, "Europe/Warsaw"), "afternoon");
  assert.equal(dayPartOf(instant, "America/Los_Angeles"), "morning");
  assert.equal(
    dayPartOf("2026-08-15T20:00:00.000Z", "Europe/Warsaw"),
    "evening",
  );
  // PÓŁNOC JEST WIECZOREM, A NIE PORANKIEM, i to jest jedyna godzina, przy
  // której `hourCycle` inny niż `h23` odpowiada 24 zamiast 0 — pomyłka
  // niewidoczna w każdym teście, który nie chodzi o północy.
  assert.equal(
    dayPartOf("2026-08-15T22:00:00.000Z", "Europe/Warsaw"),
    "evening",
  );
  // I KAŻDA GODZINA DOBY MA ODPOWIEDŹ ZE ZBIORU — bez tego przedział, którego
  // nikt nie pokrył, wraca cicho wartością domyślną.
  for (let hour = 0; hour < 24; hour += 1) {
    const at = `2026-08-15T${String(hour).padStart(2, "0")}:30:00.000Z`;
    assert.ok(
      (DAY_PARTS as readonly string[]).includes(dayPartOf(at, "UTC")),
      `hour ${hour} in UTC resolved outside the closed set`,
    );
  }
});

test("the Calendar opens its content by naming the week it is showing, not by repeating the band", async () => {
  const { CalendarSurface } = await import("../src/CalendarSurface.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries: populatedShellQueries });
  const snapshot: DesktopSnapshot = await loadDesktopSnapshot(client);

  const Harness = ({ initial }: { readonly initial: DesktopSnapshot }) => {
    const [current] = useState(initial);
    return createElement(CalendarSurface, {
      client,
      snapshot: current,
      selectedTaskId: undefined,
      planBusyTaskId: undefined,
      onSelectTask: () => {},
      onOpenTask: () => {},
      onPlanTaskOnDay: () => {},
    });
  };
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(Harness, { initial: snapshot }));
  });

  const opening = openingHeading(container, "header.surface-header");
  assert.equal(
    opening.dataset.weekTitle,
    "true",
    `the first heading in the Calendar's content is not the week title: „${(opening.textContent ?? "").trim()}"`,
  );
  assert.equal(opening.dataset.weekPosition, "current");
  assert.equal((opening.textContent ?? "").trim(), "This week");

  const step = (direction: "previous" | "next"): HTMLElement => {
    const button = container.querySelector<HTMLElement>(
      `[data-week-step="${direction}"]`,
    );
    assert.ok(button, `the band carries no ${direction} step`);
    return button;
  };
  const click = async (node: HTMLElement): Promise<void> => {
    await act(async () => {
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  // CZTERY GAŁĘZIE NAZWY, WSZYSTKIE PRZEJŚCIOWE — a nie jedna sprawdzona
  // i trzy napisane. Nazwa musi jechać z tego samego `weekOffset`, który
  // wybiera dane, bo inaczej nagłówek nazywa jeden tydzień, a siatka pokazuje
  // drugi.
  await click(step("next"));
  assert.equal((opening.textContent ?? "").trim(), "Next week");
  assert.equal(opening.dataset.weekPosition, "ahead");

  await click(step("next"));
  assert.equal((opening.textContent ?? "").trim(), "2 weeks ahead");
  assert.equal(opening.dataset.weekPosition, "ahead");

  await click(step("previous"));
  await click(step("previous"));
  await click(step("previous"));
  assert.equal((opening.textContent ?? "").trim(), "Last week");
  assert.equal(opening.dataset.weekPosition, "back");

  await click(step("previous"));
  assert.equal((opening.textContent ?? "").trim(), "2 weeks back");
  assert.equal(opening.dataset.weekPosition, "back");

  // I NIE POWTARZA ZAKRESU Z PASMA. Zakres stoi w paśmie przy prawej
  // krawędzi; gdyby tytuł mówił to samo, ekran otwierałby się cudzym zdaniem.
  const range = container.querySelector<HTMLElement>("[data-week-range]");
  assert.ok(range, "the band lost the week range");
  assert.notEqual(
    (opening.textContent ?? "").trim(),
    (range.textContent ?? "").trim(),
    "the content opening repeats the range the band already carries",
  );
});
