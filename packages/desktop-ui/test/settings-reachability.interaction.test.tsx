import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import type { DesktopSnapshot } from "../src/client/workflow.js";

import { shellQueries } from "./shell-fixture.js";

// PR 5 zamienia Ustawienia w TRYB: wejście podmienia całą lewą kolumnę na spis
// sekcji. To jest przebudowa układu, a przy przebudowie układu najłatwiej
// zgubić gwarancję, która NIE jest o układzie:
//
//   żadna kategoria ustawień nie staje się nieosiągalna.
//
// Dziś niesie ją natywny `<select>`, który poniżej 58rem zastępuje zwinięty
// nawigator. Jutro może ją nieść co innego — i o to chodzi. Ten plik pilnuje
// ZACHOWANIA (kategoria da się wybrać i staje się bieżąca), nie tego, że
// istnieje element o danej klasie. `settings-navigation-contract` czyta ten sam
// ekran jako TEKST i pęknie przy pierwszym przestawieniu JSX-a; ten nie.

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

// Zwraca snapshot, na którym ekran się narysował, bo część asercji niżej pyta
// nie „czy coś się narysowało", tylko „czy narysowało się TO, co niesie
// projekcja". Wypisana lista etapów lejka mierzyłaby fikstury, nie ekran.
const mountSettings = async (): Promise<DesktopSnapshot> => {
  const { SettingsSurface } = await import("../src/SettingsSurface.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries: shellQueries });
  const snapshot = await loadDesktopSnapshot(client);

  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(SettingsSurface, {
        client,
        snapshot,
        onReload: async () => undefined,
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

const categoryPicker = (): HTMLSelectElement | null =>
  container.querySelector<HTMLSelectElement>("#settings-category-select");

const navigatorButtons = (): readonly HTMLButtonElement[] => [
  ...container.querySelectorAll<HTMLButtonElement>(
    ".settings-navigator button",
  ),
];

// Etykieta kategorii siedzi we WŁASNYM `<span>`, obok `<small>` z plakietką
// stanu. Czytanie całego `textContent` skleiłoby jedno z drugim i porównywało
// „Setup and app" z „Setup and appVersion scenario".
const labelOf = (element: Element | null): string | undefined =>
  element?.querySelector("span")?.textContent?.trim();

const currentCategory = (): string | undefined =>
  labelOf(
    container.querySelector<HTMLElement>(
      '.settings-navigator [aria-current="location"]',
    ),
  );

test("every settings category is reachable without a pointer", async () => {
  // Gwarancja jest o OSIĄGALNOŚCI, nie o szerokości okna: happy-dom nie liczy
  // układu, więc „poniżej 58rem" jest tu niemierzalne — ale to, czy każda
  // kategoria DA SIĘ wybrać kontrolką natywną, jest mierzalne w pełni.
  await mountSettings();

  const picker = categoryPicker();
  assert.ok(picker, "settings must offer a native category control");

  const offered = [...picker.options].map((option) => option.value);
  const listed = navigatorButtons().length;
  assert.ok(listed > 1, `expected several categories, found ${listed}`);
  assert.equal(
    offered.length,
    listed,
    `the native control must offer every category the navigator lists, got ${offered.join(", ")}`,
  );

  // Wybranie każdej z nich musi naprawdę przestawić bieżącą kategorię —
  // kontrolka, która niczego nie zmienia, jest atrapą osiągalności.
  for (const value of offered) {
    await act(async () => {
      picker.value = value;
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const marked = container.querySelector<HTMLElement>(
      '.settings-navigator [aria-current="location"]',
    );
    assert.ok(marked, `choosing ${value} left no category marked as current`);
  }
});

test("exactly one category is marked as the current location", async () => {
  // `aria-current="location"` jest tym, co czytnik ekranu ogłasza jako „tu
  // jesteś". Dwie takie pozycje znaczą, że nie mówi nic użytecznego.
  await mountSettings();

  const marked = container.querySelectorAll(
    '.settings-navigator [aria-current="location"]',
  );
  assert.equal(
    marked.length,
    1,
    `exactly one category may claim the current location, found ${marked.length}`,
  );

  const buttons = navigatorButtons();
  const last = buttons[buttons.length - 1];
  assert.ok(last, "the navigator must render category buttons");
  const label = labelOf(last);

  await act(async () => {
    last.click();
  });

  assert.equal(
    container.querySelectorAll('.settings-navigator [aria-current="location"]')
      .length,
    1,
    "the current location must move, not multiply",
  );
  assert.equal(
    currentCategory(),
    label,
    "the current location must follow the category the user chose",
  );
});

test("the navigator and the native control stay in agreement", async () => {
  // Dwa wejścia do tej samej rzeczy rozjeżdżają się po cichu: klik w nawigator
  // przestawia stan, a `<select>` dalej pokazuje starą wartość, więc człowiek
  // czyta dwie różne odpowiedzi na to samo pytanie.
  await mountSettings();

  const picker = categoryPicker();
  assert.ok(picker);
  const buttons = navigatorButtons();
  const target = buttons[buttons.length - 1];
  assert.ok(target);

  await act(async () => {
    target.click();
  });

  const marked = container.querySelector<HTMLElement>(
    '.settings-navigator [aria-current="location"]',
  );
  assert.ok(marked);
  const chosen = [...picker.options].find(
    (option) => option.value === picker.value,
  );
  assert.ok(chosen, "the native control must hold a value");
  assert.equal(
    chosen.textContent?.trim(),
    labelOf(marked),
    "the native control must show the category the navigator marks as current",
  );
});

test("contextual help is a button that opens a dialog, never a title attribute", async () => {
  // Wyjaśnienie żyjące wyłącznie w `title=` jest niedostępne z klawiatury
  // i z dotyku — to jest nazwana decyzja (#35), nie preferencja.
  await mountSettings();

  const helpTriggers = [
    ...container.querySelectorAll<HTMLElement>('[aria-haspopup="dialog"]'),
  ];
  assert.ok(
    helpTriggers.length >= 4,
    `settings must keep its contextual help routes, found ${helpTriggers.length}`,
  );
  for (const trigger of helpTriggers) {
    assert.equal(
      trigger.tagName,
      "BUTTON",
      `a help route must be a real button, got ${trigger.tagName}`,
    );
    assert.ok(
      (trigger.textContent ?? "").trim().length > 0,
      "a help route must carry a name, not only an icon",
    );
  }
});

test("the Access category holds the access content, not a way out of Settings", async () => {
  // CO PADA, KIEDY KTOŚ SKASUJE `<AccessSection />` Z `SettingsSurface.tsx`?
  // Przed tą asercją: NIC w `npm run check`. Kontrakt odzyskiwania czyta plik
  // sekcji, który dalej istnieje; oba testy zachowania montują komponent
  // BEZPOŚREDNIO; kontrakt nawigacji liczy rzeczy, które należą do samego
  // ekranu Ustawień. Jedynym strażnikiem była bramka układu — poza
  // `npm run check`, tylko na macOS i, jak się okazało w tym locie, zdolna
  // wrócić zielona nad aplikacją z sąsiedniego worktree. To jest dokładnie
  // kształt „zdolność, której nic nie montuje", więc montowanie ma tu własną
  // asercję.
  //
  // ZACZEPEM jest nagłówek rejestru agentów, a nie lista osób: `shellQueries`
  // nie odpowiada na `workspace.access`, więc ta fikstura widzi projekcję jako
  // NIEDOSTĘPNĄ i wierszy osób nie ma. Nagłówek rejestru agentów rysuje się
  // niezależnie od obu projekcji, więc mierzy montowanie, a nie dane. Treść
  // wierszy na realnych danych jest pozycją na liście weryfikacji.
  await mountSettings();

  const category = container.querySelector<HTMLElement>(
    '[data-settings-category="access"]',
  );
  assert.ok(category, "the Access and connections category did not render");
  assert.ok(
    category.querySelector("h2#agent-access-title"),
    "the Access category renders no access content — the section that used to be a destination is not mounted inside it",
  );
});

test("every declared Settings pane is mounted inside the category that declares it", async () => {
  // DERYWOWANE Z TEGO SAMEGO SŁOWNIKA, Z KTÓREGO PALETA BIERZE CEL. Tafla
  // zadeklarowana w `settings-categories.ts` i niezamontowana daje cel palety
  // prowadzący donikąd — a to jest dokładnie kształt „zdolność, której nic nie
  // montuje": komponent istnieje, nikt go nie importuje, bramka zielona.
  //
  // Pętla idzie po deklaracji, nie po wypisanej liście tafli, więc druga tafla
  // dostaje tę asercję bez dopisywania czegokolwiek tutaj.
  const { settingsPanes, settingsPaneElementId } =
    await import("../src/settings-categories.js");
  await mountSettings();

  assert.ok(
    settingsPanes.length > 0,
    "pusty słownik tafli spełniłby tę pętlę nie mierząc niczego",
  );
  for (const pane of settingsPanes) {
    const category = container.querySelector<HTMLElement>(
      `[data-settings-category="${pane.category}"]`,
    );
    assert.ok(category, `kategoria „${pane.category}" się nie narysowała`);
    const mounted = category.querySelector<HTMLElement>(
      `#${settingsPaneElementId(pane.id)}`,
    );
    assert.ok(
      mounted,
      `tafla „${pane.label}" jest zadeklarowana, a nie zamontowana w kategorii „${pane.category}" — paleta prowadzi donikąd`,
    );
    assert.equal(mounted.dataset.settingsPane, pane.id);
  }
});

test("a requested category is the one the screen opens on", async () => {
  // GŁĘBOKI LINK, ZMIERZONY PO ZACHOWANIU. `scrollIntoView` nie istnieje
  // w happy-dom, więc dowodem nie jest przewinięcie, tylko to, że ekran
  // OZNACZA żądaną kategorię jako bieżącą — czyli ta sama gwarancja, której
  // pilnuje reszta tego pliku, tylko od strony powłoki.
  const { SettingsSurface } = await import("../src/SettingsSurface.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries: shellQueries });
  const snapshot = await loadDesktopSnapshot(client);

  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(SettingsSurface, {
        client,
        snapshot,
        onReload: async () => undefined,
        onWrote: async () => undefined,
        onFailure: () => undefined,
        onOpenRecovery: () => undefined,
        onNavigate: () => undefined,
        onUndo: () => undefined,
        requestedCategory: "data",
      }),
    );
  });

  assert.equal(
    currentCategory(),
    "Data and privacy",
    "a deep link into a category must open on it, not on the screen's own default",
  );
});

test("every category badge states a setting and never counts records", async () => {
  // §7 OF THE DEBT CENSUS, TURNED FROM A COMMENT INTO AN ASSERTION.
  //
  // The guarantee was already true and it was carried by prose:
  // `categoryStatus` is a TOTAL `Record<SettingsCategoryId, string>` — the id
  // union is derived from the category array, so a seventh category will not
  // compile without a statement — and a comment beside it says what the
  // statement may not be: "A SETTINGS STATEMENT, NEVER A RECORD COUNT. …
  // 'Notes 16' would name how many notes exist, which is a fact about the
  // workspace and not about this section — and it is the mistake this row has
  // already been written with once."
  //
  // A comment does not fail. This does, and it walks the SAME vocabulary the
  // screen walks, so a section added later is held to the rule without anybody
  // remembering to come back here.
  //
  // WHY THE PATTERN HAS THREE ARMS AND NOT R3's ONE. The spec said "does not
  // match /^\d+$|^\d+\s/" — a bare count and a leading count. The mistake the
  // comment actually names is `Notes 16`, which is a TRAILING count and passes
  // both. The third arm catches it. What must NOT be caught is a number that
  // is part of a statement: `Version 0.1.9` is a settings statement whose
  // value happens to be numeric, and it stays green here — that is the other
  // direction of this assertion and it is measured on every run, because the
  // shipped `application` badge is exactly that shape.
  const { settingsCategories, settingsCategoryElementId } =
    await import("../src/settings-categories.js");
  await mountSettings();

  const looksLikeACount = /^\d+$|^\d+\s|\s\d+$/u;
  assert.ok(
    settingsCategories.length > 0,
    "an empty vocabulary would satisfy this loop while measuring nothing",
  );
  let measured = 0;
  for (const category of settingsCategories) {
    const button = navigatorButtons().find(
      (candidate) =>
        candidate.getAttribute("aria-controls") ===
        settingsCategoryElementId(category.id),
    );
    assert.ok(button, `the navigator does not list „${category.id}"`);
    const badge = button.querySelector("small")?.textContent?.trim() ?? "";
    assert.ok(
      badge.length > 0,
      `„${category.id}" carries no status statement beside its label`,
    );
    assert.ok(
      /[A-Za-z]/u.test(badge),
      `„${category.id}" states „${badge}", which says nothing a person reads`,
    );
    assert.ok(
      !looksLikeACount.test(badge),
      `„${category.id}" states „${badge}" — that is a record count, and a badge says what the section DOES`,
    );
    measured += 1;
  }
  assert.equal(
    measured,
    settingsCategories.length,
    "every declared category must have been measured, not most of them",
  );
});

test("the workspace category holds the funnel and the working day", async () => {
  // A CAPABILITY NOTHING MOUNTS IS INDISTINGUISHABLE FROM ONE THAT WAS NEVER
  // BUILT — lot ACC measured that nothing in `npm run check` went red if
  // `<AccessSection />` were deleted from this very screen. Both controls this
  // lot adds are components in files of their own, so they can vanish the same
  // way; `scripts/break-workspace-settings.mjs` deletes each one to prove this
  // test sees it.
  //
  // THE ANCHOR IS DATA-INDEPENDENT ON PURPOSE. `[data-commercial-defaults]` is
  // on the control's root and is drawn whatever the projection says, so a red
  // here means "not mounted" and never "the fixture had no stages". What the
  // rows are made of is a separate assertion, below.
  const snapshot = await mountSettings();
  const workspace = container.querySelector<HTMLElement>(
    '[data-settings-category="workspace"]',
  );
  assert.ok(workspace, "the Workspace category did not render");

  const commercial = workspace.querySelector<HTMLElement>(
    "[data-commercial-defaults]",
  );
  assert.ok(
    commercial,
    "the pipeline and money control is not mounted — the wrapper it calls had zero callers before this lot, and this is how it goes back to having none",
  );
  const workingDay = workspace.querySelector<HTMLElement>("[data-working-day]");
  assert.ok(
    workingDay,
    "the working-day control is not mounted — the day would be readable on three screens and settable on none again",
  );

  // DERIVED FROM THE PROJECTION, never from a list written here: the funnel is
  // whatever this workspace configured, and a screen that drew the DEFAULT one
  // while the workspace held another would pass a hardcoded expectation.
  const stages = snapshot.bootstrap.workspace.commercialDefaults.stages;
  assert.ok(stages.length > 0, "the fixture carries no funnel to draw");
  for (const stage of stages) {
    const row = commercial.querySelector<HTMLElement>(
      `[data-stage="${stage.id}"]`,
    );
    assert.ok(row, `stage „${stage.label}" is configured and not drawn`);
    assert.ok(
      (row.textContent ?? "").includes(stage.label),
      `stage „${stage.id}" is drawn without the label it carries`,
    );
  }
  assert.equal(
    commercial.querySelectorAll("[data-stage]").length,
    stages.length,
    "the funnel drawn must be the funnel configured, entry for entry",
  );

  // The working day is drawn from the projection too — the same rule, one
  // field further: `09:00` here is `startMinute: 540` there.
  const day = snapshot.bootstrap.workspace.workingDay;
  const hours = [
    ...workingDay.querySelectorAll<HTMLInputElement>('input[type="time"]'),
  ].map((input) => input.value);
  const clock = (minutes: number): string =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
      minutes % 60,
    ).padStart(2, "0")}`;
  assert.deepEqual(
    hours,
    [clock(day.startMinute), clock(day.endMinute)],
    "the hours shown must be the hours the workspace works",
  );
});
