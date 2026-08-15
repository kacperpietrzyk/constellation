import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, assert, beforeEach, test } from "vitest";

import { workHarnessSnapshot } from "../src/dev/harness-snapshot.js";
import {
  libraryDocumentIds,
  libraryNoteState,
  librarySummaries,
} from "../src/dev/library-fixture.js";
import { KnowledgeEditor } from "../src/library/KnowledgeEditor.js";
import { roleCopy } from "../src/library/library-chrome.js";

// KSZTAŁT GŁOWY CZYTELNI — wpis 11-4, lot L3 Fazy II.
//
// WPIS MÓWI DWIE RZECZY I OBIE SĄ TU MIERZONE OSOBNO, bo mają dwie różne
// przyczyny i dwa różne lekarstwa:
//
//   (a) nad tytułem notatki stał nadtytuł `NOTE`;
//   (b) tytuł łamał się na dwa wiersze.
//
// PROTOTYP ODPOWIADA TU DWA RAZY I RÓŻNIE, więc oba adresy stoją wypisane:
// `v3/screens/knowledge.js:744-745` — czytelnia NOTATKI otwiera się samym
// `<h2 class="kn-reader-title">`; `v3/screens/knowledge.js:909-911` —
// czytelnia ŹRÓDŁA stawia nad tytułem `<p class="kn-reader-kind">`. Reguła
// brzmi więc „nadtytuł mówi RODZAJ ŹRÓDŁA", a nie „głowa czytelni nie ma
// nadtytułu" — i dlatego ten plik mierzy czytelnię NOTATKI, a nie wszystkie
// `.eyebrow` w pakiecie (jest ich 39).
//
// CZEGO NIE ZOBACZY ŻADNA BRAMKA TEGO REPOZYTORIUM, i to jest powiedziane
// wprost, a nie przemilczane: bramka układu chodzi przy 320 / 760 / 1440 px,
// a (b) zaczyna się POWYŻEJ 1440. Zmierzone ręcznie 2026-08-15 na fiksturze
// Library, ten sam tytuł notatki (58 znaków, `--text-xl`):
//
//   przed:  1440 px → tytuł dostaje 660 px, potrzebuje 567,5 px → 1 wiersz
//   przed:  1662 px → tytuł dostaje 353 px, potrzebuje 567,5 px → 2 WIERSZE
//   po:     1662 px → tytuł dostaje 882 px                      → 1 wiersz
//
// Szersze okno dawało tytułowi MNIEJ miejsca, bo rząd akcji mieścił się wtedy
// obok niego. Asercja na (b) nie może więc być asercją nad geometrią i pyta
// o jedyną rzecz, która tę geometrię wymusza przy KAŻDEJ szerokości: że rząd
// akcji ma bazę na całą linię. Pyta o to DWA RAZY I RÓŻNIE, bo pierwsza
// wersja tego pliku pytała tylko raz i źle:
//
//   • `/\.document-editor-actions\s*\{([^}]*)\}/` czytało PIERWSZE wystąpienie
//     w tekście arkusza, czyli KOLEJNOŚĆ ZNAKÓW W PLIKU, nie wartość
//     obowiązującą. Zmierzone: ta sama nadpisująca reguła wstawiona PRZED bazą
//     dawała czerwień, a wstawiona ZA nią (tam, gdzie w tym pliku mieszkają
//     kroki) — ZIELEŃ, na przywróconej wadzie. Arkusz ma drugą regułę
//     `.document-editor-actions` już dziś (`styles.css`, wewnątrz
//     `@container (max-width: 40rem)`), której tamten regex nie widział.
//
// Stąd dwa testy niżej, o rozłącznych ślepych plamach:
//
//   B. SPIS REGUŁ — każda reguła arkusza, której PODMIOTEM jest ten rząd,
//      musi deklarować bazę `100%`. Niezależne od kolejności w pliku i od
//      tego, w jakim `@media`/`@container`/`@supports` reguła stoi. Ślepe na
//      nadpisanie przez INNY selektor (np. `.knowledge-editor-header > *`).
//   C. WARTOŚĆ OBOWIĄZUJĄCA — kaskada policzona przez silnik na PRAWDZIWEJ
//      głowie czytelni i PRAWDZIWYM arkuszu, przy pięciu szerokościach, w tym
//      dwóch powyżej najszerszego przystanku bramki. Widzi nadpisanie z
//      dowolnego selektora, ale jest ŚLEPA na `@container` (happy-dom nie ma
//      układu, więc treści kwerend kontenerowych nie stosuje — zmierzone) i na
//      samo ZAWINIĘCIE tytułu (zerowy układ pudełkowy).
//
// Czego nadal NIE MIERZY ŻADEN przyrząd tego repozytorium, i to jest
// powiedziane wprost, a nie przemilczane: że tytuł faktycznie mieści się
// w jednym wierszu przy 1662 px. To jest pomiar geometrii, a bramka układu
// kończy się na 1440 px. Testy niżej mierzą PRZYCZYNĘ, nie skutek.

const spaceId = workHarnessSnapshot.bootstrap.spaces[0]!.id;
const taskId = "00000000-0000-4000-8000-0000000000c1";
const PROJECT_ID = "00000000-0000-4000-8000-0000000000d1";

const summaryFor = (id: string) =>
  librarySummaries({
    task: { id: taskId, label: "Potwierdź wariant recovery" },
    project: { id: PROJECT_ID, label: "Orbit onboarding" },
  }).find((item) => item.id === id)!;

const documentItem = (role: "note" | "document" | "deliverable") => {
  const summary = summaryFor(libraryDocumentIds.runbook);
  return {
    id: summary.id,
    spaceId,
    title: summary.title,
    folderId: summary.folderId,
    role,
    version: summary.version,
    updatedAt: summary.updatedAt,
  };
};

const client = {
  openDocument: async () => ({
    mode: "local" as const,
    state: libraryNoteState(taskId as never),
    pendingUpdateCount: 0,
    searchIndexState: "current" as const,
  }),
  persistDocumentUpdate: async () => ({ acknowledged: true }),
  acknowledgeDocumentUpdates: async () => undefined,
  listDocumentRevisions: async () => [],
  runQuery: async () => ({ kind: "query_rejected" }),
} as never;

let host: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  if (mounted) {
    mounted = false;
    act(() => {
      root.unmount();
    });
  }
  host.remove();
});

const mount = async (role: "note" | "document" | "deliverable") => {
  root = createRoot(host);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(KnowledgeEditor, {
        client,
        document: documentItem(role) as never,
        snapshot: workHarnessSnapshot as never,
        inspectorHost: null,
        onEntityActivate: () => undefined,
        onReload: async () => undefined,
        onFailure: () => undefined,
        onRename: async () => false,
      }),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  const head = host.querySelector<HTMLElement>(".knowledge-editor-header");
  assert.ok(
    head,
    "the note reader drew no head at all, so nothing below measures its shape",
  );
  return head;
};

// POPULACJA, NIE PRZYPADEK. `roleCopy` ma trzy wartości, więc reguła jest
// sprawdzona na wszystkich trzech — nadtytuł zdjęty tylko z notatki, a
// zostawiony na deliverablu, przeszedłby test napisany na jednym rodzaju.
const ROLES = Object.keys(roleCopy) as (keyof typeof roleCopy)[];

test("nothing stands above the title of the thing being read, on any of the three roles", async () => {
  assert.equal(
    ROLES.length,
    3,
    "roleCopy stopped having three roles, so this test now covers a different population than it claims",
  );

  for (const role of ROLES) {
    const head = await mount(role);
    const title = head.querySelector<HTMLElement>("#document-title");
    assert.ok(title, `the reader lost its title on role „${role}"`);

    const identity = title.parentElement;
    assert.ok(
      identity,
      "the title has no wrapper, so the question „what stands above it” cannot be asked",
    );
    const above = [...identity.children]
      .filter(
        (node) =>
          (node.compareDocumentPosition(title) &
            Node.DOCUMENT_POSITION_FOLLOWING) !==
            0 && (node.textContent ?? "").trim() !== "",
      )
      .map(
        (node) =>
          `${node.tagName.toLowerCase()}.${node.className} „${(node.textContent ?? "").trim()}"`,
      );
    assert.deepEqual(
      above,
      [],
      `something carrying text stands above the title on role „${role}": ${above.join(", ")}`,
    );

    // ROLA NIE ZNIKNĘŁA, TYLKO ZESZŁA POD TYTUŁ. Bez tej drugiej połowy wpis
    // 11-4 jest do zamknięcia skasowaniem faktu — a wiersz listy obok pokazuje
    // rolę TYLKO wtedy, gdy notatka nie ma ani folderu, ani referencji, więc
    // na deliverablu w folderze zniknęłaby z ekranu w ogóle.
    const meta = head.querySelector<HTMLElement>(".document-editor-meta");
    assert.ok(meta, `the reader lost its metadata line on role „${role}"`);
    const stated = meta.querySelector<HTMLElement>("[data-document-role]");
    assert.ok(
      stated,
      `the metadata line does not say what kind of thing is being read on role „${role}"`,
    );
    assert.equal((stated.textContent ?? "").trim(), roleCopy[role]);
    // I MÓWI TO PRZED DATĄ, a nie gdziekolwiek: rodzaj czytanej rzeczy jest
    // pierwszym członem tego wiersza, tak jak w prototypie pierwszym członem
    // `.kn-reader-meta` jest autor.
    // PORÓWNANIE WYLICZONEJ WARTOŚCI, NIE WĘZŁÓW. `assert.equal` na dwóch
    // węzłach DOM zabił już w tym repozytorium workera testów przy próbie
    // wypisania różnicy; tożsamość sprawdza się `===`, a asercji podaje
    // wynik logiczny.
    assert.equal(
      meta.firstElementChild === stated,
      true,
      `the kind is not the first member of the metadata line on role „${role}"`,
    );

    mounted = false;
    act(() => {
      root.unmount();
    });
  }
});

// KORZEŃ SZUKANY, NIE ZAŁOŻONY. `import.meta.url` w środowisku happy-dom nie
// jest adresem `file:`, a wpisana ścieżka względna wiąże ten plik z katalogiem,
// z którego akurat go uruchomiono.
const packageRoot = (() => {
  let candidate = process.cwd();
  while (!existsSync(path.join(candidate, "src", "styles.css"))) {
    const parent = path.dirname(candidate);
    assert.notEqual(
      parent,
      candidate,
      "could not locate the desktop-ui package root",
    );
    candidate = parent;
  }
  return candidate;
})();
const sheetPath = path.join(packageRoot, "src", "styles.css");
const ROW_CLASS = "document-editor-actions";

/** Baza wyciągnięta z jednej deklaracji; `null` = deklaracja nie o bazie. */
const basisOfDeclaration = (property: string, value: string): string | null => {
  if (property === "flex-basis") return value;
  if (property !== "flex") return null;
  const parts = value.split(/\s+/u).filter(Boolean);
  // SKRÓT `flex` ROZPISANY WPROST, a nie zgadywany „trzeci token". Nierozpoznany
  // kształt zwraca napis, który NIE JEST `100%`, więc kończy się czerwienią —
  // przyrząd, który nie umie czegoś przeczytać, ma o tym krzyczeć, a nie
  // przepuszczać.
  const isNumber = (token: string) => /^\d+(\.\d+)?$/u.test(token);
  if (parts.length === 1)
    return isNumber(parts[0]!) ? "0%" : (parts[0] ?? "UNPARSED");
  if (parts.length === 2)
    return isNumber(parts[1]!) ? "0%" : (parts[1] ?? "UNPARSED");
  if (parts.length === 3) return parts[2] ?? "UNPARSED";
  return `UNPARSED(${value})`;
};

/**
 * Wszystkie reguły arkusza, których PODMIOTEM jest rząd akcji.
 *
 * Podmiot = ostatni compound selektora. `.document-editor-actions > button`
 * i `.document-toolbar` (dziecko tego rzędu) NIE są podmiotem i nie mają
 * obowiązku deklarować bazy — sprawdzone asercją niżej.
 *
 * `[^{}]*\{[^{}]*\}` trafia w NAJGŁĘBSZE bloki deklaracji, więc reguła stojąca
 * wewnątrz `@media`/`@container`/`@supports` jest widziana tak samo jak
 * top-level. Arkusz nie używa zagnieżdżania CSS (zero `&` — sprawdzone), więc
 * ten skan nie ma jak pomylić właściciela deklaracji.
 */
const subjectRules = (css: string) => {
  const found: { selector: string; basis: string | null }[] = [];
  const rule = /([^{}]*)\{([^{}]*)\}/gu;
  for (const match of css.matchAll(rule)) {
    const selector = (match[1] ?? "").trim();
    if (selector === "" || selector.startsWith("@")) continue;
    const isSubject = selector.split(",").some((part) => {
      const compounds = part
        .trim()
        .split(/[\s>+~]+/u)
        .filter(Boolean);
      return new RegExp(`(^|[^\\w-])\\.${ROW_CLASS}(?![\\w-])`, "u").test(
        compounds.at(-1) ?? "",
      );
    });
    if (!isSubject) continue;
    let basis: string | null = null;
    for (const declaration of (match[2] ?? "").split(";")) {
      const colon = declaration.indexOf(":");
      if (colon === -1) continue;
      const seen = basisOfDeclaration(
        declaration.slice(0, colon).trim().toLowerCase(),
        declaration.slice(colon + 1).trim(),
      );
      if (seen !== null) basis = seen;
    }
    found.push({ selector: selector.replace(/\s+/gu, " "), basis });
  }
  return found;
};

test("every rule in the sheet whose subject is the reading head's action row gives it a full-line basis", () => {
  const raw = readFileSync(sheetPath, "utf8");
  // KOMENTARZE ZDJĘTE PRZED SKANOWANIEM NAWIASÓW — komentarze tego arkusza
  // cytują kod i niosą klamry. Zdjęcie, które zjada arkusz, jest nieodróżnialne
  // od arkusza bez naruszeń, więc wynik zdjęcia jest sprawdzany.
  const sheet = raw.replace(/\/\*[\s\S]*?\*\//gu, "");
  assert.equal(
    sheet.includes(`.${ROW_CLASS}`),
    true,
    "stripping comments from styles.css left no `.document-editor-actions` at all, so this scan would have nothing to judge and would pass on anything",
  );

  const rules = subjectRules(sheet);
  const shown = rules
    .map((entry) => `${entry.selector} → ${entry.basis ?? "no basis"}`)
    .join("; ");
  assert.equal(
    rules.length >= 1,
    true,
    "no rule in styles.css has `.document-editor-actions` as its subject, so the reading head's action row is unstyled and this test measures nothing",
  );

  // DZIECKO RZĘDU NIE JEST RZĘDEM. Bez tej asercji „ostatni compound" mógłby
  // po cichu zacząć łapać `.document-editor-actions > button` i test żądałby
  // bazy `100%` od przycisków.
  assert.equal(
    subjectRules(".document-editor-actions > button { flex: 1 1 4rem; }")
      .length +
      subjectRules(
        ".document-editor-actions .document-toolbar { flex: 0 1 8rem; }",
      ).length,
    0,
    "the subject test started counting children of the action row as the row itself",
  );

  const declaring = rules.filter((entry) => entry.basis !== null);
  assert.equal(
    declaring.length >= 1,
    true,
    `no rule declares a flex basis for the action row, so nothing keeps it off the title's row — rules seen: ${shown}`,
  );
  // BAZA JEST TU CAŁYM PYTANIEM. `1 1 28rem` znaczy „zejdź na własną linię,
  // GDY nie mieścisz się obok" — czyli zostaw tytuł obok siebie na każdym
  // oknie szerszym niż suma obu baz, i to jest zmierzona przyczyna łamania
  // tytułu przy 1662 px. `1 1 100%` znaczy „zawsze własna linia".
  const offending = declaring.filter((entry) => entry.basis !== "100%");
  assert.deepEqual(
    offending.map((entry) => `${entry.selector} → ${String(entry.basis)}`),
    [],
    `a rule gives the reading head's action row a basis other than a full line, so it can stand beside the title again — entry 11-4's second half. Every subject rule found: ${shown}`,
  );
});

/** Jeden pomiar wartości obowiązującej: świeży arkusz, świeży montaż, świeże okno. */
const basisInForce = async (width: number, extraCss?: string) => {
  (
    window as unknown as {
      happyDOM: { setViewport: (viewport: { width: number }) => void };
    }
  ).happyDOM.setViewport({ width });
  // ŚWIEŻE WĘZŁY PRZY KAŻDEJ SZEROKOŚCI. Ponowny odczyt tego samego elementu po
  // zmianie okna zwracał w happy-dom wartość Z POPRZEDNIEJ szerokości —
  // zmierzone. Test, który tego nie wie, mierzy pięć razy jedną szerokość.
  const style = document.createElement("style");
  style.textContent = readFileSync(sheetPath, "utf8") + (extraCss ?? "");
  document.head.append(style);
  const head = await mount("note");
  const row = head.querySelector<HTMLElement>(`.${ROW_CLASS}`);
  assert.ok(
    row,
    `the reading head drew no action row at ${width} px, so nothing here measures its basis`,
  );
  const computed = getComputedStyle(row);
  const seen = { basis: computed.flexBasis, display: computed.display };
  mounted = false;
  act(() => {
    root.unmount();
  });
  style.remove();
  return seen;
};

test("the basis the cascade actually delivers is a full line at every width, including the two the layout gate never visits", async () => {
  // SAMOSPRAWDZENIE RÓŻNICOWE, PRZED POMIAREM. Przyrząd musi najpierw pokazać,
  // że UMIE zobaczyć dokładnie tę wadę, o którą pyta: nadpisanie dopisane ZA
  // arkuszem, w kwerendzie szerokości. Jeden odczyt tego nie dowodzi — „widzę
  // kwerendy" i „zwracam wartość z poprzedniej szerokości" dają ten sam wynik.
  // Dlatego dwa odczyty i RÓŻNICA między nimi.
  const probe = `@media (min-width: 90rem){.${ROW_CLASS}{flex-basis:1px}}`;
  assert.equal(
    (await basisInForce(1662, probe)).basis,
    "1px",
    "the instrument cannot see a width-conditional override appended after the sheet, so its green says nothing about the cascade",
  );
  assert.equal(
    (await basisInForce(760, probe)).basis,
    "100%",
    "the instrument returns the same value at every width, so it is not evaluating width conditions at all and its five stops are one stop",
  );

  for (const width of [320, 760, 1440, 1662, 1920]) {
    const seen = await basisInForce(width);
    // NIEPUSTOŚĆ OSOBNO. `display: flex` stoi w TEJ SAMEJ regule co baza, więc
    // odczyt bez niego znaczy „reguła nie doszła do elementu", a nie „baza jest
    // dobra" — a pusty napis przeszedłby porównanie z pustym napisem.
    assert.equal(
      seen.display,
      "flex",
      `the base rule for the action row did not reach the element at ${width} px, so its basis was never judged`,
    );
    assert.equal(
      seen.basis,
      "100%",
      `at ${width} px the basis in force on the reading head's action row is „${seen.basis}", not a full line, so it can stand beside the title — entry 11-4's second half`,
    );
  }
});
