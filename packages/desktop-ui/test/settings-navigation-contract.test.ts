/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const findPackageRoot = (): string => {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "src", "SettingsSurface.tsx"))) {
    const parent = path.dirname(directory);
    if (parent === directory)
      throw new Error("Could not locate the desktop-ui package root.");
    directory = parent;
  }
  return directory;
};

const root = findPackageRoot();
const settings = readFileSync(
  path.join(root, "src", "SettingsSurface.tsx"),
  "utf8",
);
const styles = readFileSync(path.join(root, "src", "styles.css"), "utf8");
// POWŁOKA CZYTANA JAKO TEKST, bo jeden z nawigatorów Ustawień STOI W NIEJ:
// wejście w tryb podmienia lewą kolumnę na spis sekcji, a znacznik „tu
// jesteś" jest od lotu 6 właśnie tam. Asercja czytająca wyłącznie
// `SettingsSurface.tsx` opisywałaby połowę ekranu.
const shell = readFileSync(path.join(root, "src", "RealApp.tsx"), "utf8");

const countOccurrences = (haystack: string, needle: RegExp): number =>
  haystack.match(needle)?.length ?? 0;

import { settingsCategories } from "../src/settings-categories.js";

// The ids, in the order the navigator walks them. This list IS the contract —
// it is what the scroll anchors, the status record and the shell's left column
// all key on — so it stays spelled out. What does NOT stay spelled out is how
// many of them there are: the counts below are derived from this list, because
// a hardcoded `5` beside a growing registry is an assertion that goes red for
// the wrong reason and gets edited rather than read.
const settingsCategoryIds = [
  "workspace",
  "data",
  "notes",
  "appearance",
  "access",
  "application",
] as const;

describe("enterprise settings navigation contract", () => {
  it("groups the settings surface into five stable, status-bearing categories", () => {
    // The category *ids* are the stable contract: they name the sections, the
    // scroll anchors and the status record. The *labels* are interface copy —
    // the Polish-to-English flip changed every one of them without changing a
    // single guarantee, so we assert the shape of the labels — present, and
    // one per category — never which words they use.
    // Lista sekcji przeniosła się do `settings-categories.ts`, bo w trybie
    // Ustawień rysuje ją TAKŻE lewa kolumna powłoki, a ekran jest leniwy
    // i nie wolno go wciągnąć na ścieżkę gorącą. Czytamy ją więc ze ŹRÓDŁA
    // PRAWDY, nie wycinając literału z pliku ekranu — poprzednia wersja pękła
    // przy samym przeniesieniu, nie mówiąc nic o żadnej gwarancji.
    const declared = settingsCategories.map((category) => ({
      id: category.id as string,
      label: category.label as string,
    }));
    assert.ok(declared.length > 0, "settingsCategories is empty");

    // The five ids, in the order the navigator walks them.
    assert.deepEqual(
      declared.map((category) => category.id),
      [...settingsCategoryIds],
    );
    for (const id of settingsCategoryIds)
      assert.match(settings, new RegExp(`data-settings-category="${id}"`));
    // Every category carries a label a human can read, and no two categories
    // read the same. Which words they use is copy and deliberately unpinned —
    // five entries all labelled "Workspace" is not copy, it is a navigator
    // nobody can steer, so distinctness is asserted structurally.
    for (const category of declared)
      assert.ok(
        category.label.trim().length > 0,
        `category ${category.id} carries no label`,
      );
    assert.equal(
      new Set(declared.map((category) => category.label)).size,
      settingsCategoryIds.length,
    );
    // One section per id and no more: an extra entry, or a section anchored
    // outside the list, would break the navigator/status/scroll-spy
    // correspondence.
    assert.equal(declared.length, settingsCategoryIds.length);
    assert.equal(
      countOccurrences(settings, /data-settings-category="/g),
      settingsCategoryIds.length,
    );

    // Status-bearing: every category id maps to a status string, and the
    // screen renders the status of the category being looked at.
    //
    // PRZENIESIONE, NIE SKASOWANE — i to jest cała różnica, którą ta asercja
    // ma nieść. Status stał dotąd jako `<small>` przy KAŻDEJ pozycji drugiego
    // nawigatora; drugiego nawigatora nie ma (jest jeden, w powłoce), a status
    // stoi tam, gdzie trzyma go prototyp: w paśmie nagłówka, jako podtytuł
    // bieżącej sekcji (`v3/screens/settings.js:1005-1007` czyta `cur.sub()`).
    // Asercja pilnuje tego samego, co pilnowała: że każda kategoria ma zdanie
    // o sobie i że to zdanie jest RYSOWANE.
    assert.match(
      settings,
      /categoryStatus: Record<SettingsCategoryId, string>/,
    );
    assert.match(
      settings,
      /<p className="settings-band-sub">\{categoryStatus\[activeCategory\]\}<\/p>/,
    );

    // Bieżąca sekcja jest ZADEKLAROWANA na powierzchni, a nie odczytywana
    // z nazwy klasy nawigatora — nawigator jest w powłoce, więc montaż samego
    // ekranu nie ma go w drzewie w ogóle. Deklaracja jest jedynym nośnikiem tej
    // odpowiedzi, który widzą naraz: ten test, test osiągalności i smoke
    // spakowanej apki.
    assert.match(settings, /data-settings-active-category=\{activeCategory\}/);
    // I jest RAPORTOWANA na zewnątrz, bo rysuje ją powłoka.
    assert.match(settings, /onCategoryChange\?\.\(activeCategory\)/);
  });

  it("keeps every category available through a native narrow-width control", () => {
    assert.match(settings, /<select\s+id="settings-category-select"/s);
    assert.match(settings, /settingsCategories\.map\(\(category\) =>/);
    // Zwinięta kolumna: spis sekcji nie ma glifów, więc w szynie stoi na
    // baczność i nie da się w niego kliknąć — od tego momentu osiągalność
    // niesie kontrolka natywna. WARUNEK MUSI BYĆ TEN SAM co warunek zwinięcia,
    // bo inaczej istnieje stan, w którym żadna kategoria nie jest klikalna.
    //
    // ASERCJA PYTA O SELEKTOR, NIE O LICZBĘ, I TO JEST POPRAWKA, NIE
    // PRZEPISANIE. Do pozycji 13 oba warunki brzmiały `@media (max-width:
    // 50rem)` i ta asercja pilnowała, żeby to była TA SAMA liczba w dwóch
    // miejscach. Zwinięcie ma od tej pozycji drugi powód — prośbę człowieka na
    // dowolnej szerokości — i liczba natychmiast przestała opisywać jeden
    // z nich. Dwie reguły na jednej klasie `.desktop-shell.rail` nie mogą się
    // rozjechać tak, jak rozjechały się dwie kopie progu.
    assert.match(
      styles,
      /\.desktop-shell\.rail \.settings-category-picker\s*\{[^}]*display: grid/s,
    );
    assert.match(
      styles,
      /\.desktop-shell\.rail \.settings-mode-section\s*\{[^}]*display: none/s,
    );
    // I zwinięcie dalej ma swój próg szerokości — tylko już nie w arkuszu:
    // `railMode` w powłoce to „okno poniżej 50rem LUB prośba człowieka".
    assert.match(shell, /window\.matchMedia\("\(max-width: 50rem\)"\)/);
    assert.match(shell, /const railMode = narrowRail \|\| sidebarCollapsed;/);
    // I nie ma już drugiego nawigatora w treści ekranu, którego ta kontrolka
    // była zamiennikiem (`v3/screens/settings.css:36-80` — jeden spis sekcji,
    // w lewej kolumnie).
    assert.equal(countOccurrences(settings, /settings-navigator/g), 0);
    assert.equal(countOccurrences(styles, /\.settings-navigator/g), 0);
  });

  it("marks the current section in the one navigator, which lives in the shell", () => {
    // TA ASERCJA PRZEPROWADZIŁA SIĘ RAZEM ZE ZNACZNIKIEM. Stała nad
    // `SettingsSurface.tsx` i pytała o `aria-current` przy pozycji nawigatora
    // w treści ekranu. Kolumna trybu jest teraz jedynym nawigatorem Ustawień,
    // więc pyta o nią — i czyta powłokę, bo tam ten nawigator stoi.
    assert.match(
      shell,
      /aria-current=\{\s*settingsCategory === category\.id \? "location" : undefined,?\s*\}/,
    );
    // Wash + waga + szyna: trzy nośniki naraz, bo sam kolor nie jest nośnikiem
    // znaczenia (`v3/screens/settings.css:74-80`).
    assert.match(
      styles,
      /\.settings-mode-column \.nav-item\[aria-current="location"\]\s*\{[^}]*box-shadow: inset 2px 0 0 var\(--accent\)/s,
    );
    // Etykieta ma swój własny tor, a nie tor ikony: `.nav-item` jest siatką
    // trzytorową, a pozycja sekcji renderuje JEDNO dziecko, więc bez tej
    // reguły etykieta ląduje w torze 1,1 rem i zawija się na trzy linie.
    // Zmierzone przed poprawką przy 1440 px: 17,59 px szerokości, 51 px
    // wysokości na trzech z sześciu pozycji.
    assert.match(
      styles,
      /\.settings-mode-column \.nav-item\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/s,
    );
  });

  it("offers one global and three contextual routes into the concept help", () => {
    // One global entry point in the header, three contextual ones next to the
    // sections they explain. The two class names are what distinguishes them,
    // so they carry the "one global / three contextual" shape structurally.
    assert.equal(
      countOccurrences(settings, /className="settings-help-entry"/g),
      1,
    );
    assert.equal(
      countOccurrences(settings, /className="settings-context-help"/g),
      3,
    );
    // All four announce themselves as opening a dialog...
    assert.equal(countOccurrences(settings, /aria-haspopup="dialog"/g), 4);
    // ...and all four are wired to a concept-help topic rather than being
    // decorative. Topic ids are typed values (ConceptHelpTopicId), not copy.
    assert.equal(countOccurrences(settings, /setConceptHelpTopic\("/g), 4);
    const topics = new Set(
      [...settings.matchAll(/setConceptHelpTopic\("([a-z-]+)"\)/g)].map(
        (match) => match[1],
      ),
    );
    assert.deepEqual([...topics].sort(), [
      "agent-access",
      "data-home",
      "recovery",
    ]);
    // The chosen topic is what the dialog opens on.
    assert.match(settings, /initialTopic=\{conceptHelpTopic\}/);
  });
});
