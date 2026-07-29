import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test, vi } from "vitest";

import type { CommandEnvelope } from "@constellation/contracts";

import {
  populatedAttentionInbox,
  populatedPlanDayKey,
  populatedShellQueries,
} from "./shell-fixture.js";

// Dwie gwarancje, których NIE DA SIĘ sprawdzić w samym ekranie, bo obie żyją
// na SZWIE między ekranem a powłoką. Adwersaryjny przegląd fali A złapał je
// jako dokładnie ten defekt: ekran wołał callback, test sprawdzał callback,
// i nikt nie sprawdzał, co powłoka z tym callbackiem robi.
//
//  1. Upuszczenie pracy na dzień w Kalendarzu ZAPISUJE plan i nie dotyka
//     terminu. Ekran sam nie pisze — pisze powłoka, więc asercja o ładunku
//     komendy musi startować od kliknięcia w nawigacji.
//  2. DECYZJA #22: plakietka przy Inboxie zgadza się z tym, co NAPRAWDĘ leży
//     na ekranie. Ekran porównujący się sam ze sobą przechodzi także wtedy,
//     gdy powłoka pokazuje zupełnie inną liczbę.

let container: HTMLDivElement;
let root: Root;
let mounted = false;
const commands: CommandEnvelope[] = [];

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  commands.length = 0;
  // Podmieniamy WYŁĄCZNIE zegar kalendarzowy. Pełne fałszywe timery zatrzymują
  // też `setTimeout`, a na nim stoi i leniwy import Kalendarza, i wewnętrzny
  // scheduler Reacta — test wisiał wtedy pięć sekund i padał na limicie
  // czasu, komunikatem bez związku z przyczyną.
  vi.useFakeTimers({ toFake: ["Date"] });
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

/** Czeka na warunek, przepuszczając kolejkę pod `act`. */
const waitForCondition = async (
  ready: () => boolean,
  message: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (ready()) return;
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }
  assert.fail(message);
};

const mountShell = async (): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({
    queries: populatedShellQueries,
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
  assert.equal(
    snapshot.attention.kind,
    "ready",
    "the inbox fixture did not reach the snapshot, so the badge measures nothing",
  );

  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });
};

const openDestination = async (surface: string): Promise<HTMLElement> => {
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === surface);
  assert.ok(item, `no navigation target rendered for ${surface}`);
  await act(async () => {
    item.click();
  });
  // Kalendarz jest leniwy, więc plan roboczy stoi najpierw na zaślepce
  // ładowania. Stała pauza jest tu zakładem o szybkość maszyny: na wolniejszym
  // runnerze pięć milisekund nie wystarczało i test meldował „tydzień nie ma
  // kolumny na dziś", czyli mierzył moment, a nie ekran. Czekamy na WARUNEK.
  await waitForCondition(
    () =>
      (
        container.querySelector<HTMLElement>(
          "main[data-surface] [role=tabpanel]",
        )?.textContent ?? ""
      ).trim().length > 0,
    `${surface} never rendered anything into the work plane`,
  );
  const main = container.querySelector<HTMLElement>("main[data-surface]");
  assert.ok(main, "the shell rendered no main landmark");
  assert.equal(
    main.getAttribute("data-surface"),
    surface,
    `the shell went to “${main.getAttribute("data-surface")}” instead of “${surface}”`,
  );
  const plane = main.querySelector<HTMLElement>('[role="tabpanel"]');
  assert.ok(plane, `${surface} rendered no work plane`);
  return plane;
};

test("dropping work on a day in Calendar writes the plan and never the deadline", async () => {
  await mountShell();
  const plane = await openDestination("calendar");

  await waitForCondition(
    () => plane.querySelector(`[data-day="${populatedPlanDayKey}"]`) !== null,
    "the week never exposed a column for today",
  );
  const day = plane.querySelector<HTMLElement>(
    `[data-day="${populatedPlanDayKey}"]`,
  );
  assert.ok(
    day,
    "the week exposes no column for today, so nothing can be planned on it",
  );

  const source = plane.querySelector<HTMLElement>("[data-move-task]");
  assert.ok(
    source,
    "no keyboard path to plan work on a day — a drag-only affordance is unreachable",
  );
  await act(async () => {
    source.click();
  });
  const dayButton = container.querySelector<HTMLElement>(
    `[data-move-to="${populatedPlanDayKey}"]`,
  );
  assert.ok(
    dayButton,
    `the day picker offers no button for ${populatedPlanDayKey}: ${[
      ...container.querySelectorAll("[data-move-to]"),
    ]
      .map((node) => node.getAttribute("data-move-to"))
      .join(", ")}`,
  );
  await act(async () => {
    dayButton.click();
  });

  const planning = commands.filter(
    (command) => command.commandName === "task.updateDetails",
  );
  assert.equal(
    planning.length,
    1,
    `expected exactly one plan write from the shell, got ${planning.length}`,
  );
  const payload = planning[0]?.payload as Record<string, unknown>;
  const { dateKeyInZone } = await import("../src/i18n.js");
  assert.equal(
    dateKeyInZone(String(payload.startAt), "Europe/Warsaw"),
    populatedPlanDayKey,
    `the shell planned a different day: ${JSON.stringify(payload)}`,
  );
  // Sedno: termin nie jest wspomniany. `null` skasowałby go, więc obecność
  // klucza z jakąkolwiek wartością jest tu defektem, nie szczegółem.
  assert.equal(
    "dueAt" in payload,
    false,
    `planning must not touch the deadline, payload was ${JSON.stringify(payload)}`,
  );
});

test("the Inbox badge counts what is really on the Inbox screen (#22)", async () => {
  await mountShell();

  const badge = container.querySelector<HTMLElement>(
    '.nav-item[data-surface="inbox"] .nav-count',
  );
  assert.ok(
    badge,
    `the Inbox destination shows no count at all: ${[
      ...container.querySelectorAll(".nav-item"),
    ]
      .map((node) => node.getAttribute("data-surface"))
      .join(", ")}`,
  );
  const shown = Number((badge.textContent ?? "").trim());
  assert.ok(
    Number.isInteger(shown) && shown > 0,
    `the badge reads “${badge.textContent}”`,
  );

  // Ta sama liczba musi być echem w nazwie dostępnej — smoke spakowanej apki
  // sprawdza dokładnie to, a rozjazd między okiem a czytnikiem ekranu jest
  // defektem, którego nie widać na zrzucie.
  const navItem = container.querySelector<HTMLElement>(
    '.nav-item[data-surface="inbox"]',
  );
  assert.ok(
    (navItem?.getAttribute("aria-label") ?? "").includes(String(shown)),
    `the accessible name “${navItem?.getAttribute("aria-label")}” does not carry the count ${shown}`,
  );

  const plane = await openDestination("inbox");
  const rows = plane.querySelectorAll("[data-inbox-row]");
  assert.equal(
    rows.length,
    shown,
    `the badge says ${shown} and the screen shows ${rows.length} — the number by the destination must mean “this many things are waiting for me”`,
  );

  // …i musi obejmować WIĘCEJ niż same nieprzeczytane: jeden sygnał w fixture
  // jest przeczytany, a dalej czeka. Bez tego zdania asercja wyżej przeszłaby
  // także dla starej plakietki liczącej `unreadCount`.
  assert.ok(
    shown > populatedAttentionInbox.unreadCount,
    `the badge (${shown}) does not exceed the unread count (${populatedAttentionInbox.unreadCount}), so it is still counting one kind of thing`,
  );
});
