import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

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

const mountSettings = async (): Promise<void> => {
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
      }),
    );
  });
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
