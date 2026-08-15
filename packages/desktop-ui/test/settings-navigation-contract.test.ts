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
//
// KOLEJNOŚĆ ODWRÓCONA PRZY WPISIE 13-2 (lot D2 Fazy III, 2026-08-15), i ten
// test ZŁAPAŁ tamtą zmianę zanim zrobiła to jakakolwiek bramka wizualna —
// dlatego lista zostaje wypisana z ręki, mimo że jest drugą kopią słownika.
// Prototyp otwiera spis od człowieka (`v3/screens/settings.js:925-957`:
// „You" → „What the app runs on" → „This workspace"), a ta aplikacja
// otwierała go od maszyny. Ta lista pilnuje dziś DWÓCH rzeczy naraz: że
// kategorii jest sześć i że idą w tej kolejności; osobnym świadkiem tej
// drugiej, po stronie narysowanego spisu, są pary `FIII2-02a`/`FIII2-02b`
// w `scripts/visual-language-pairs.mjs`.
const settingsCategoryIds = [
  "appearance",
  "access",
  "application",
  "workspace",
  "data",
  "notes",
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
      // ODSTĘPY SĄ TU DOWOLNE, I TO JEST POPRAWKA PRZYRZĄDU, NIE ROZLUŹNIENIE
      // ASERCJI. Wzorzec żądał POJEDYNCZYCH SPACJI wokół `?` i `:`, więc
      // przestał pasować w chwili, w której lot D5 zagnieździł pozycję o jeden
      // poziom głębiej (spis dzieli się na grupy) i prettier złamał to samo
      // wyrażenie na trzy wiersze. Zmieniło się WCIĘCIE, nie zachowanie —
      // rozstrzyga to para bramki układu L6-02b, która czyta wypełnienie
      // oznaczonej pozycji na NARYSOWANYM elemencie. Asercja nad źródłem,
      // która pada od przeformatowania, mierzy formatowanie.
      /aria-current=\{\s*settingsCategory\s*===\s*category\.id\s*\?\s*"location"\s*:\s*undefined,?\s*\}/,
    );
    // Wash + waga + szyna: trzy nośniki naraz, bo sam kolor nie jest nośnikiem
    // znaczenia (`v3/screens/settings.css:74-80`).
    assert.match(
      styles,
      /\.settings-mode-column \.nav-item\[aria-current="location"\]\s*\{[^}]*box-shadow: inset 2px 0 0 var\(--accent\)/s,
    );
    // Etykieta ma swój własny tor, a nie tor ikony: `.nav-item` jest siatką
    // trzytorową (glif, etykieta, ogon), a pozycja sekcji nie ma ogona.
    //
    // JEDEN TOR → DWA TORY PRZY LOCIE D5. Poprzednie brzmienie żądało
    // `minmax(0, 1fr)` i JEDNEGO toru, bo pozycja renderowała wtedy jedno
    // dziecko: etykieta lądowała w torze ikony i zawijała się na trzy linie
    // (zmierzone przy 1440 px: 17,59 px szerokości, 51 px wysokości na trzech
    // z sześciu pozycji). Wpis #69 rejestru żąda glifu przy każdej sekcji
    // (`v3/screens/settings.css:61-71` — `.st-navitem` ma tor `.ico` PRZED
    // etykietą), więc jeden tor przestał być lekarstwem i stał się zakazem
    // oddania wpisu. To, czego ta asercja pilnuje, się nie zmienia: etykieta
    // ma WŁASNY tor, a nie tor glifu.
    assert.match(
      styles,
      /\.settings-mode-column \.nav-item\s*\{[^}]*grid-template-columns: 1\.1rem minmax\(0, 1fr\)/s,
    );
  });

  it("offers one global and three contextual routes into the concept help", () => {
    // One global entry point in the header, three contextual ones next to the
    // sections they explain. The two shapes are what distinguishes them, and
    // after lot L7 of phase II the difference is no longer two hand-written
    // class names but the FORM the reference prescribes: the three contextual
    // ones are round `?` marks standing inside the heading they explain, the
    // global one stays a button with words.
    assert.equal(
      countOccurrences(settings, /className="settings-help-entry"/g),
      1,
    );
    // THE CONTEXTUAL THREE TOOK THE ONE SHARED RULE, and this counts the rule,
    // not a name of their own. Before the lot they carried
    // `className="settings-context-help"` — a fourth form of on-demand help
    // in a product whose reference has exactly one (`v3/app.css:896-903`,
    // eleven calls through one function). The class is gone from the sheet
    // as well, so this count cannot pass over a leftover.
    assert.equal(
      countOccurrences(settings, /className="settings-context-help"/g),
      0,
    );
    assert.equal(countOccurrences(settings, /className="help-mark"/g), 3);
    // ...and each of the three DECLARES ITSELF AS HELP, which is what makes it
    // reachable for the route contract in `topic-help.interaction.test.tsx`.
    // A trigger that does not carry `data-help-topic` is not "different" to
    // that file, it is invisible — measured, on the Projects screen, where a
    // live dead question mark sat under a green "this screen carries no help".
    assert.equal(
      countOccurrences(settings, /className="help-anchor" data-help-topic="/g),
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

  // ── ŚWIADEK WŁASNOŚCI NOŚNEJ WPISU 13-1 ──────────────────────────────────
  //
  // Decyzja D2 („najpierw powiedz, potem pozwól zmienić") ma DWIE połowy,
  // a bramka układu umie zmierzyć tylko jedną. `verify-renderer-layout.mjs`
  // czyta FARBĘ i KOLEJNOŚĆ: że wiersz stanu jest narysowany, że stoi w swoim
  // paśmie i przed pierwszą kontrolką, że niesie co najmniej trzy słowa
  // i plakietkę. Osiemnaście wpisanych z ręki zdań po trzy słowa przechodzi
  // tam komplet asercji — a wiersz stanu, którego treść nie zależy od danych,
  // skłamie przy pierwszej ich zmianie i będzie WYGLĄDAŁ prawdziwie.
  //
  // Ta asercja jest tą drugą połową i pyta dokładnie o tyle, ile umie
  // sprawdzić: ŻADNE `says` NIE JEST NAPISEM. Nie umie odpowiedzieć, czy
  // zdanie liczy z TEJ SAMEJ wartości, którą zmienia kontrolka pod nim —
  // to jest własność, której nie widać w tekście źródła — i dlatego nie
  // twierdzi tego ani w nazwie, ani w komunikacie.
  //
  // LICZBA WYWOŁAŃ NIE JEST WPISANA. Sprawdzane jest, że każde znalezione
  // `<SectionState` oddało swoje `says` do rozbioru (inaczej asercja
  // milczałaby nad kształtem, którego parser nie zna) i że wywołań jest
  // niezero — harness, który nie zamontuje ekranu, ma tu upaść, a nie
  // przejść nad pustym zbiorem.
  it("computes every settings state sentence instead of writing it out", () => {
    // Wyrażenie w klamrach czytane licznikiem klamer, bo `says` bywa
    // wielolinijkowym trójargumentem z zagnieżdżonymi szablonami.
    const readBraced = (source: string, open: number): string | null => {
      let depth = 0;
      for (let index = open; index < source.length; index += 1) {
        if (source[index] === "{") depth += 1;
        else if (source[index] === "}") {
          depth -= 1;
          if (depth === 0) return source.slice(open + 1, index);
        }
      }
      return null;
    };

    // TREŚĆ NAPISU ZDEJMOWANA SKANEREM, nie regexem: `says` bywa
    // trójargumentem z szablonami, a szablon niesie NARAZ tekst (który
    // trzeba wyrzucić) i wstawki `${…}` (które są właśnie tym, czego
    // szukamy). Zostaje sam kod.
    const codeOnly = (expression: string): string => {
      let out = "";
      let index = 0;
      const stack: string[] = [];
      while (index < expression.length) {
        const char = expression[index];
        const mode = stack[stack.length - 1];
        if (mode === '"' || mode === "'" || mode === "`") {
          if (char === "\\") index += 2;
          else if (char === mode) {
            stack.pop();
            index += 1;
          } else if (
            mode === "`" &&
            char === "$" &&
            expression[index + 1] === "{"
          ) {
            stack.push("{");
            index += 2;
          } else index += 1;
          continue;
        }
        if (char === '"' || char === "'" || char === "`") {
          stack.push(char);
          index += 1;
          continue;
        }
        if (char === "}" && mode === "{") {
          stack.pop();
          index += 1;
          continue;
        }
        out += char;
        index += 1;
      }
      return out;
    };

    const starts = [...settings.matchAll(/<SectionState[\s>]/g)].map(
      (match) => match.index ?? 0,
    );
    assert.ok(
      starts.length > 0,
      "No <SectionState> call sites at all — this assertion measured nothing.",
    );

    // Forma bez klamer (`says="…"`) jest napisem z definicji i nie ma
    // po co jej rozbierać.
    assert.equal(countOccurrences(settings, /\bsays="/g), 0);

    const sentences: string[] = [];
    for (const [order, start] of starts.entries()) {
      const end = starts[order + 1] ?? settings.length;
      const saysAt = settings.indexOf("says={", start);
      assert.ok(
        saysAt !== -1 && saysAt < end,
        "A <SectionState> call site carries no `says={…}` of its own.",
      );
      const expression = readBraced(settings, saysAt + "says=".length);
      assert.notEqual(
        expression,
        null,
        "Unbalanced braces in a `says={…}` expression.",
      );
      sentences.push(expression as string);
    }
    // Każde wywołanie oddało dokładnie jedno wyrażenie — asercja nie
    // przemilcza kształtu, którego skaner nie umiał przeczytać.
    assert.equal(sentences.length, starts.length);

    for (const expression of sentences)
      assert.match(
        codeOnly(expression),
        /[A-Za-z_$]/,
        `A settings state sentence is a written-out constant: ${expression
          .replace(/\s+/g, " ")
          .slice(0, 120)}`,
      );
  });
});
