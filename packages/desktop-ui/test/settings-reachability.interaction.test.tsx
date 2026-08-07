import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import type { DesktopSnapshot } from "../src/client/workflow.js";

import { settingsCategories } from "../src/settings-categories.js";
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

// KTÓRA SEKCJA JEST BIEŻĄCA — CZYTANE Z DEKLARACJI, NIE Z NAZWY KLASY.
//
// Do lotu 6 ta odpowiedź stała jako `aria-current="location"` na pozycji
// nawigatora RYSOWANEGO PRZEZ TEN EKRAN. Nawigator Ustawień jest teraz jeden
// i stoi w POWŁOCE (`RealApp.tsx`, `.settings-mode-column`) — a ten plik montuje
// samą powierzchnię, więc żadnego nawigatora w jego drzewie nie ma i nigdy nie
// będzie. Selektor po klasie nie miał tu czego szukać: nie „zepsuł się", tylko
// przestał opisywać ten montaż.
//
// Gwarancja jest bez zmian i jest o ZACHOWANIU: każda kategoria daje się
// wybrać bez wskaźnika i wybór NAPRAWDĘ przestawia bieżącą sekcję. Nośnikiem
// odpowiedzi jest deklaracja na korzeniu powierzchni, którą czyta tak samo ten
// test, jak i smoke spakowanej apki — czyli jedno źródło dla dwóch czytających,
// zamiast dwóch selektorów po dwóch nazwach klas.
const currentCategory = (): string | null =>
  container
    .querySelector<HTMLElement>("[data-settings-active-category]")
    ?.getAttribute("data-settings-active-category") ?? null;

test("every settings category is reachable without a pointer", async () => {
  // Gwarancja jest o OSIĄGALNOŚCI, nie o szerokości okna: happy-dom nie liczy
  // układu, więc „poniżej 50rem" jest tu niemierzalne — ale to, czy każda
  // kategoria DA SIĘ wybrać kontrolką natywną, jest mierzalne w pełni.
  await mountSettings();

  const picker = categoryPicker();
  assert.ok(picker, "settings must offer a native category control");

  const offered = [...picker.options].map((option) => option.value);
  // ODNIESIENIEM JEST REJESTR, NIE DRUGI ELEMENT DOM. Poprzednia wersja
  // porównywała listę opcji z liczbą przycisków nawigatora — czyli dwa
  // rysunki tej samej listy ze sobą nawzajem. Rejestr `settingsCategories`
  // jest źródłem prawdy dla obu stron trybu, więc to on rozstrzyga.
  assert.deepEqual(
    offered,
    settingsCategories.map((category) => category.id),
    `the native control must offer every configured category, got ${offered.join(", ")}`,
  );

  // Wybranie każdej z nich musi naprawdę przestawić bieżącą kategorię —
  // kontrolka, która niczego nie zmienia, jest atrapą osiągalności.
  for (const value of offered) {
    await act(async () => {
      picker.value = value;
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal(
      currentCategory(),
      value,
      `choosing ${value} did not make it the current section`,
    );
  }
});

test("exactly one section is current, and the screen says which", async () => {
  // „Bieżąca sekcja" jest JEDNA i jest ZADEKLAROWANA. Dwie deklaracje znaczą,
  // że powłoka dostaje dwie odpowiedzi na jedno pytanie i maluje którąś.
  await mountSettings();

  const declared = container.querySelectorAll(
    "[data-settings-active-category]",
  );
  assert.equal(
    declared.length,
    1,
    `exactly one element may declare the current section, found ${declared.length}`,
  );
  const first = settingsCategories[0];
  assert.ok(first);
  assert.equal(
    currentCategory(),
    first.id,
    "settings must open on its first section",
  );
});

test("the native control and the declared section stay in agreement", async () => {
  // Dwa wejścia do tej samej rzeczy rozjeżdżają się po cichu: coś przestawia
  // stan, a `<select>` dalej pokazuje starą wartość, więc człowiek czyta dwie
  // różne odpowiedzi na to samo pytanie.
  await mountSettings();

  const picker = categoryPicker();
  assert.ok(picker);
  const last = settingsCategories[settingsCategories.length - 1];
  assert.ok(last);

  await act(async () => {
    picker.value = last.id;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  });

  assert.equal(currentCategory(), last.id);
  assert.equal(
    picker.value,
    last.id,
    "the native control must show the section the screen declares as current",
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
    "data",
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
  await mountSettings();

  const looksLikeACount = /^\d+$|^\d+\s|\s\d+$/u;
  assert.ok(
    settingsCategories.length > 0,
    "an empty vocabulary would satisfy this loop while measuring nothing",
  );
  // GDZIE TEN NAPIS DZIŚ STOI. Statusy przeprowadziły się z drugiego
  // nawigatora — którego nie ma — do podtytułu pasma nagłówka, gdzie prototyp
  // trzyma `st-panel-sub` (`v3/screens/settings.js:1005-1007`). Rysowany jest
  // status BIEŻĄCEJ sekcji, więc żeby przejść cały słownik, trzeba przez cały
  // słownik przejść: kontrolką natywną, po jednej kategorii naraz. To jest
  // MOCNIEJSZY przelot niż poprzedni, bo mierzy napis, który naprawdę się
  // rysuje, a nie sześć napisów, z których widać było sześć naraz.
  const picker = container.querySelector<HTMLSelectElement>(
    "#settings-category-select",
  );
  assert.ok(picker, "settings offers no way to choose a category");
  let measured = 0;
  for (const category of settingsCategories) {
    await act(async () => {
      picker.value = category.id;
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal(
      container
        .querySelector("[data-settings-active-category]")
        ?.getAttribute("data-settings-active-category"),
      category.id,
      `„${category.id}" cannot be made the current section`,
    );
    const badge =
      container.querySelector(".settings-band-sub")?.textContent?.trim() ?? "";
    assert.ok(
      badge.length > 0,
      `„${category.id}" carries no status statement in the header band`,
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
