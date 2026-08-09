import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  WorkspaceSetCommercialDefaultsCommandSchema,
  WorkspaceSetWorkingDayCommandSchema,
  type CommandEnvelope,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import type { DesktopSnapshot } from "../src/client/workflow.js";

import { shellQueries } from "./shell-fixture.js";

/* THE FUNNEL, THE MONEY AND THE WORKING DAY — SENT, NOT JUST DRAWN.
 *
 * `setWorkspaceCommercialDefaults` was written down to the optimistic-
 * concurrency envelope and had ZERO CALLERS; `workspace.setWorkingDay` had a
 * kernel arm, a schema and conformance tests, and no renderer wrapper at all.
 * Both are the shape this repository calls "a capability nothing mounts", so
 * what is asserted here is the WRITE, not the markup: a control that renders
 * beautifully and sends nothing is the defect being closed.
 *
 * EVERY TEST MOUNTS THE WHOLE SCREEN. Mounting the two controls directly would
 * pass with them deleted from `SettingsSurface.tsx` — measured by lot ACC on
 * this very file's neighbour, on this very afternoon.
 *
 * WHAT THE ENVELOPE MUST CARRY IS CHECKED AGAINST THE BOUNDARY SCHEMA, never
 * against a shape restated here: the failure worth catching is a renderer that
 * sends something the kernel refuses, and a hand-written expectation would
 * agree with the renderer rather than with the command.
 */

let container: HTMLElement;
let root: Root;
let sent: CommandEnvelope[];
let reloads: number;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  sent = [];
  reloads = 0;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

/* The stub answers each command with the projection ITS OWN wrapper demands.
 * Branching matters: both wrappers report success only on their own projection
 * kind, so one shape answering everything would leave the success path — the
 * reload, the rename form closing — unreachable while "an envelope was sent"
 * passed anyway. */
const outcomeFor = (command: CommandEnvelope) => ({
  kind: "command_outcome" as const,
  outcome: {
    contractVersion: 1,
    commandId: command.commandId,
    correlationId: command.correlationId,
    kernelTime: "2026-08-02T12:00:00.000Z",
    outcome: "success",
    diagnosticCode: "accepted",
    affected: [],
    auditReceiptId: "90000000-0000-4000-8000-000000000009",
    projection:
      command.commandName === "workspace.setWorkingDay"
        ? { kind: "workspace.working_day_changed" }
        : { kind: "workspace.commercial_defaults_changed" },
  },
});

const mountSettings = async (
  edit?: (snapshot: DesktopSnapshot) => DesktopSnapshot,
): Promise<DesktopSnapshot> => {
  const { SettingsSurface } = await import("../src/SettingsSurface.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const scenario = createScenarioClient({ queries: shellQueries });
  const client = {
    ...scenario,
    executeCommand: async (command: CommandEnvelope) => {
      sent.push(command);
      return outcomeFor(command);
    },
  } as unknown as ConstellationRendererClient;
  const loaded = await loadDesktopSnapshot(scenario);
  const snapshot = edit === undefined ? loaded : edit(loaded);

  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(SettingsSurface, {
        client,
        snapshot,
        onReload: async () => {
          reloads += 1;
        },
        onWrote: async () => undefined,
        onFailure: () => undefined,
        onOpenRecovery: () => undefined,
        onNavigate: () => undefined,
        onUndo: () => undefined,
      }),
    );
  });
  return snapshot;
};

const typeInto = (node: HTMLInputElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  assert.ok(setter, "no native value setter to bypass React's tracker with");
  setter.call(node, value);
  node.dispatchEvent(new Event("input", { bubbles: true }));
};

const commercial = (): HTMLElement => {
  const found = container.querySelector<HTMLElement>(
    "[data-commercial-defaults]",
  );
  assert.ok(found, "the pipeline and money control is not mounted");
  return found;
};

const buttonNamed = (within: HTMLElement, name: string): HTMLButtonElement => {
  const found = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) =>
      (candidate.textContent ?? "").trim() === name ||
      candidate.getAttribute("aria-label") === name,
  );
  assert.ok(found, `no control named „${name}" in this section`);
  return found;
};

const lastCommand = (name: string): CommandEnvelope => {
  const found = [...sent].reverse().find((one) => one.commandName === name);
  assert.ok(
    found,
    `nothing sent ${name}; the screen drew a control that writes nowhere. Sent: ${sent
      .map((one) => one.commandName)
      .join(", ")}`,
  );
  return found;
};

test("adding a stage sends the WHOLE funnel, not the one stage that changed", async () => {
  // `stages` REPLACES the list when present — the contract says so twice and
  // the wrapper's own comment says why. A caller that sent only the new stage
  // would delete every other column, and the command would be accepted: this
  // is the failure that has no error message.
  const snapshot = await mountSettings();
  const before = snapshot.bootstrap.workspace.commercialDefaults.stages;

  const field = commercial().querySelector<HTMLInputElement>(
    'input[placeholder="New stage"]',
  );
  assert.ok(field, "there is no way to add a stage");
  await act(async () => {
    typeInto(field, "Legal review");
  });
  await act(async () => {
    buttonNamed(commercial(), "Add stage").click();
  });

  const command = WorkspaceSetCommercialDefaultsCommandSchema.parse(
    lastCommand("workspace.setCommercialDefaults"),
  );
  const stages = command.payload.stages;
  assert.ok(stages, "the funnel was not carried at all");
  assert.equal(
    stages.length,
    before.length + 1,
    "adding a column must send the list it wants to end up with",
  );
  for (const stage of before)
    assert.ok(
      stages.some((one) => one.id === stage.id && one.label === stage.label),
      `„${stage.label}" was dropped by an operation that only meant to add one`,
    );
  const added = stages.find((one) => one.label === "Legal review");
  assert.ok(added, "the stage that was asked for is not in the list sent");
  assert.ok(
    !before.some((one) => one.id === added.id),
    "a new stage must carry an id of its own",
  );
  assert.equal(reloads, 1, "a write that succeeds must be read back");
});

test("renaming a stage keeps its id, because deals are standing on it", async () => {
  // `opportunity.stage` stores the ID. A rename that regenerated it would
  // orphan every deal on that column — and renaming is the operation a person
  // performs most, which is exactly why the schema carries an id at all.
  const snapshot = await mountSettings();
  const target = [
    ...snapshot.bootstrap.workspace.commercialDefaults.stages,
  ].sort((left, right) => left.order - right.order)[0];
  assert.ok(target, "the fixture carries no funnel to rename");

  // DROGA DO ZMIANY NAZWY MA TERAZ DWA KROKI, I TO JEST POZYCJA #6, NIE
  // REGRESJA: kontrolki zeszły z wierszy do JEDNEGO paska akcji nad listą
  // (`v3/screens/settings.css:162-175`), więc najpierw wybiera się etap,
  // a potem działa na wybranym. Sześć etapów niosło razem 24 przyciski;
  // niesie cztery, i wszystkie mówią, na czym działają.
  const row = commercial().querySelector<HTMLElement>(
    `[data-stage="${target.id}"] button`,
  );
  assert.ok(row, "the first configured stage is not drawn as a selectable row");
  await act(async () => {
    row.click();
  });
  assert.equal(
    row.getAttribute("aria-pressed"),
    "true",
    "clicking a stage row must select it — the action bar acts on the selection",
  );
  await act(async () => {
    buttonNamed(commercial(), "Rename").click();
  });
  const input = commercial().querySelector<HTMLInputElement>(
    `input[aria-label="New label for ${target.label}"]`,
  );
  assert.ok(input, "the rename control did not open on the selected stage");
  await act(async () => {
    typeInto(input, "First contact");
  });
  await act(async () => {
    buttonNamed(commercial(), "Save").click();
  });

  const command = WorkspaceSetCommercialDefaultsCommandSchema.parse(
    lastCommand("workspace.setCommercialDefaults"),
  );
  const renamed = command.payload.stages?.find((one) => one.id === target.id);
  assert.ok(renamed, "the renamed stage lost the id its deals are stored with");
  assert.equal(renamed.label, "First contact");
  assert.equal(
    command.payload.stages?.length,
    snapshot.bootstrap.workspace.commercialDefaults.stages.length,
    "a rename must not change how many columns there are",
  );
});

test("changing the markup restates neither the uplift nor the funnel", async () => {
  // PARTIAL BY FIELD, and the reason is in the contract: "restating a list you
  // did not mean to touch is exactly how a stage goes missing".
  const snapshot = await mountSettings();
  const numbers = [
    ...commercial().querySelectorAll<HTMLInputElement>('input[type="number"]'),
  ];
  assert.equal(numbers.length, 2, "markup and uplift are two numbers");
  const [markupField] = numbers;
  assert.ok(markupField);
  await act(async () => {
    typeInto(
      markupField,
      String(snapshot.bootstrap.workspace.commercialDefaults.markupPct + 5),
    );
  });
  await act(async () => {
    buttonNamed(commercial(), "Save").click();
  });

  const command = WorkspaceSetCommercialDefaultsCommandSchema.parse(
    lastCommand("workspace.setCommercialDefaults"),
  );
  assert.equal(
    command.payload.markupPct,
    snapshot.bootstrap.workspace.commercialDefaults.markupPct + 5,
  );
  assert.equal(
    command.payload.upliftPct,
    undefined,
    "a number nobody touched must be absent, not resent",
  );
  assert.equal(
    command.payload.stages,
    undefined,
    "changing a percentage must never restate the funnel",
  );
});

test("the home currency and the offered list are two settings, and the screen says when they disagree", async () => {
  // THE NAMED GAP, at the only control that can cause it. Nothing enforces
  // that `homeCurrency` is a member of `currencies` — not the schema, not the
  // kernel — and the deal record already withholds its amount controls when
  // the two disagree. So this control does NOT refuse a write the kernel
  // allows; it says what the state means.
  const misconfigured = await mountSettings((snapshot) => ({
    ...snapshot,
    bootstrap: {
      ...snapshot.bootstrap,
      workspace: {
        ...snapshot.bootstrap.workspace,
        commercialDefaults: {
          ...snapshot.bootstrap.workspace.commercialDefaults,
          currencies:
            snapshot.bootstrap.workspace.commercialDefaults.currencies.filter(
              (currency) =>
                currency !==
                snapshot.bootstrap.workspace.commercialDefaults.homeCurrency,
            ),
        },
      },
    },
  }));
  assert.ok(
    !misconfigured.bootstrap.workspace.commercialDefaults.currencies.includes(
      misconfigured.bootstrap.workspace.commercialDefaults.homeCurrency,
    ),
    "this test must set up the state it is about",
  );
  assert.ok(
    commercial().querySelector("[data-home-currency-not-offered]"),
    "the workspace sums into a currency it does not record, and the screen says nothing",
  );
});

test("the working day is sent whole, by the person whose day it is", async () => {
  // Readable on three screens and settable on none until this lot. The day
  // goes as one value because `WorkingDaySchema` refuses an end before its
  // start and a repeated weekday, and neither refusal can be made one field at
  // a time.
  const snapshot = await mountSettings();
  const day = container.querySelector<HTMLElement>("[data-working-day]");
  assert.ok(day, "the working-day control is not mounted");
  const [, endField] = [
    ...day.querySelectorAll<HTMLInputElement>('input[type="time"]'),
  ];
  assert.ok(endField, "the end of the day cannot be changed");
  await act(async () => {
    typeInto(endField, "18:30");
  });
  await act(async () => {
    buttonNamed(day, "Save working day").click();
  });

  const command = WorkspaceSetWorkingDayCommandSchema.parse(
    lastCommand("workspace.setWorkingDay"),
  );
  assert.equal(command.payload.workingDay.endMinute, 18 * 60 + 30);
  assert.equal(
    command.payload.workingDay.startMinute,
    snapshot.bootstrap.workspace.workingDay.startMinute,
    "the hour nobody moved must survive the write",
  );
  assert.deepEqual(
    [...command.payload.workingDay.weekdays].sort(),
    [...snapshot.bootstrap.workspace.workingDay.weekdays].sort(),
    "the days nobody touched must survive the write",
  );
  assert.equal(reloads, 1, "a write that succeeds must be read back");
});

test("a working day that ends before it starts is never sent", async () => {
  // Not a second opinion on the schema — a refusal to spend a round trip on a
  // command whose only possible answer is no. The kernel still decides.
  await mountSettings();
  const day = container.querySelector<HTMLElement>("[data-working-day]");
  assert.ok(day);
  const [startField] = [
    ...day.querySelectorAll<HTMLInputElement>('input[type="time"]'),
  ];
  assert.ok(startField);
  await act(async () => {
    typeInto(startField, "23:00");
  });
  const save = buttonNamed(day, "Save working day");
  assert.equal(save.disabled, true, "an impossible day was offered for saving");
  await act(async () => {
    save.click();
  });
  assert.equal(
    sent.filter((one) => one.commandName === "workspace.setWorkingDay").length,
    0,
    "the screen sent a day the schema refuses",
  );
});

/* ── POZYCJA #6 LOTU 6: SKUTEK LICZBY MUSI BYĆ POLICZONY, A NIE OBECNY ───────
 *
 * Mapa par nazwała tę pułapkę ZANIM pozycja powstała: „para na obecność
 * pudełka przeszłaby na zielono nad pudełkiem z KŁAMIĄCĄ liczbą — czyli
 * mierzyłaby OBECNOŚĆ cechy zamiast jej JAKOŚCI"
 * (`scripts/visual-language-pairs.mjs`, wpis L6-07). Reguła zaokrąglania jest
 * zapisana w komentarzu przy kodzie, a KOMENTARZ NIE PADA — więc pada to.
 *
 * Obie asercje niżej sprawdzają OBIE połowy tej reguły: liczbę, która się nie
 * dzieli („24.8"), i liczbę, która się dzieli, gdzie końcowe zero MA zniknąć
 * („20", nie „20.0"). Jedna bez drugiej przepuszcza pół wzoru.
 */
test("the markup says what it does, and the margin is the share of the price", async () => {
  await mountSettings();
  const markupField = [
    ...commercial().querySelectorAll<HTMLInputElement>('input[type="number"]'),
  ][0];
  assert.ok(markupField, "the markup is not a field on this screen");

  const effect = (): string => {
    const box = commercial().querySelector<HTMLElement>("[data-markup-effect]");
    assert.ok(box, "the markup states no computed effect");
    return (box.textContent ?? "").replace(/\s+/gu, " ");
  };

  // 33% narzutu to 33/133 = 24,812…% marży. Ucięcie do „24" albo „25" jest
  // kłamstwem w jedną stronę; osiemnaście cyfr jest nieczytelne.
  await act(async () => {
    typeInto(markupField, "33");
  });
  assert.match(effect(), /\b133\b/u, "a cost of 100 must be offered at 133");
  assert.match(
    effect(),
    /24\.8%/u,
    `33% markup is a 24.8% margin: ${effect()}`,
  );

  // 25% narzutu to dokładnie 20% marży — i „20.0%" byłoby precyzją, której
  // ta liczba nie ma.
  await act(async () => {
    typeInto(markupField, "25");
  });
  assert.match(effect(), /\b20%/u, `25% markup is a 20% margin: ${effect()}`);
  assert.doesNotMatch(
    effect(),
    /20\.0%/u,
    "a whole percentage must not claim a decimal it does not have",
  );
});

test("the working day says how much day that is, in hours and in a week", async () => {
  await mountSettings();
  const day = container.querySelector<HTMLElement>("[data-working-day]");
  assert.ok(day, "the working-day control is not mounted");
  const [startField, endField] = [
    ...day.querySelectorAll<HTMLInputElement>('input[type="time"]'),
  ];
  assert.ok(startField && endField);

  const effect = (): string => {
    const box = day.querySelector<HTMLElement>("[data-working-day-effect]");
    assert.ok(box, "the working day states no computed effect");
    return (box.textContent ?? "").replace(/\s+/gu, " ");
  };

  // Dzień, który NIE dzieli się na pełne godziny: reszta zostaje w minutach
  // po obu stronach — dniowej i tygodniowej — i nic się nie zaokrągla.
  await act(async () => {
    typeInto(startField, "09:00");
  });
  await act(async () => {
    typeInto(endField, "17:30");
  });
  // ASERCJE CELUJĄ W „<ile> a day" / „<ile> a week", NIE w samą liczbę.
  // `textContent` skleja sąsiednie węzły bez spacji („does8h"), więc granica
  // słowa przed cyfrą NIE ISTNIEJE i `\b8h\b` przechodziła tylko wtedy, gdy
  // po liczbie stała reszta minutowa — czyli w połowie przypadków, których
  // ten test pilnuje. Zmierzone, nie przewidziane.
  const uneven = effect();
  assert.match(
    uneven,
    /8h 30m a day/u,
    `an 09:00–17:30 day is 8h 30m: ${uneven}`,
  );
  const workedDays = [
    ...day.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ].filter((box) => box.checked).length;
  assert.ok(workedDays > 0, "the fixture works no days at all");
  const weekMinutes = 510 * workedDays;
  assert.match(
    uneven,
    new RegExp(
      `${Math.floor(weekMinutes / 60)}h ${weekMinutes % 60}m a week`,
      "u",
    ),
    `${workedDays} days of 8h 30m is ${weekMinutes} minutes: ${uneven}`,
  );

  // Dzień, który dzieli się bez reszty: „8h", nie „8h 0m". To jest druga
  // połowa tej samej reguły i bez niej gałąź `rest === 0` nie jest przebiegana.
  await act(async () => {
    typeInto(endField, "17:00");
  });
  const even = effect();
  assert.match(even, /8h a day/u, `an 09:00–17:00 day is 8h: ${even}`);
  assert.doesNotMatch(even, /8h 0m/u, "a whole hour must not carry 0m");
  assert.match(
    even,
    new RegExp(`${(480 * workedDays) / 60}h a week`, "u"),
    `${workedDays} whole-hour days must total whole hours: ${even}`,
  );
});
