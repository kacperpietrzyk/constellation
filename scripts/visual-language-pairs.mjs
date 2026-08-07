// ── P1: MAPA PAR „SELEKTOR PROTOTYPU → SELEKTOR APLIKACJI → WŁAŚCIWOŚĆ" ──────
//
// TO JEST PLIK DANYCH. Nie ma tu ani jednej asercji i ani jednego wywołania
// przeglądarki — całą mechanikę niesie przelot `visualLanguagePairs`
// w `scripts/verify-renderer-layout.mjs`. Rozdział jest celowy: w repo nie było
// dotąd ŻADNEJ listy wiążącej selektor prototypu z selektorem aplikacji, i to
// jej brak wyprodukował jedenaście odwołań do `v3/screens/*.js` i ani jednego do
// `v3/app.css`. Lista rozsiana po asercjach byłaby tym samym brakiem napisanym
// inaczej: nie dałoby się jej przeczytać ani policzyć.
//
// ── DLACZEGO PARA „PENDING" MUSI NIE PASOWAĆ ─────────────────────────────────
// Wpis o pozycji, której lot jeszcze nie oddał, jest asercją NA DZISIEJSZYM
// DRZEWIE: „ta właściwość NIE ma jeszcze wartości z prototypu". Gdyby taki wpis
// wolno było przepuścić, mapa pełna źle napisanych oczekiwań — literówka
// w selektorze, własność, której nikt nie deklaruje, wartość, której nie da się
// odczytać — czytałaby się dokładnie tak samo jak mapa, która coś mierzy. Para
// „pending", która nagle PASUJE, znaczy jedno z dwojga i oba są głośne: albo lot
// ją oddał i wpis ma zmienić status na `enforced`, albo oczekiwanie jest
// napisane tak, że nigdy niczego nie zmierzy.
//
// ── TRZY STANY, NIE DWA ──────────────────────────────────────────────────────
// `MATCH` / `DIFFERS` / `NOT_MEASURED`. Trzeci istnieje, bo „selektor nie trafił
// w nic" i „trafił i wartość jest inna" wyglądają identycznie w świecie
// dwustanowym — i w tym świecie każda para z martwym selektorem byłaby wieczną,
// cichą zielenią pod statusem „pending". `NOT_MEASURED` jest AWARIĄ PRZYRZĄDU
// z nazwą pozycji, w OBU statusach, i nigdy nie zalicza się jako „pending
// przeszło".
//
// ── PODMIOT Z DEKLARACJI, NIE Z NAZWY KLASY ──────────────────────────────────
// Gdzie aplikacja niesie stabilną deklarację, selektor bierze ją
// (`[aria-current="page"]`, `[aria-selected="true"]`, `[data-surface]`,
// `[data-shell-tab]`). Gdzie musi wziąć nazwę klasy — bierze ją WYŁĄCZNIE
// z `packages/desktop-ui/src/styles.css`, który NIE jest CSS Modułem: te nazwy
// są pisane ręcznie i stabilne. Nazwa z CSS Modułu (`_title_1kitm_195`) niesie
// skrót treści arkusza i zmienia się przy każdej jego edycji — przelot
// normalizuje ją tym samym wyrażeniem, co sonda ogniska
// (`verify-renderer-layout.mjs`, pętla Tabów), ale w mapie Lotu 1 nie ma ani
// jednego takiego podmiotu i to jest fakt o powłoce, nie ulga.
//
// ── SŁOWNIK `expect.kind` ────────────────────────────────────────────────────
//   token     — rozwiązana właściwość równa się rozwiązanej wartości tokenu
//               (token rozwiązywany sondą w tej samej stronie, więc obie strony
//               porównania przechodzą przez tę samą normalizację przeglądarki)
//   literal   — rozwiązana właściwość równa się dosłownemu napisowi
//   contains  — rozwiązana właściwość zawiera podnapis
//   not       — rozwiązana właściwość RÓŻNI SIĘ od dosłownego napisu
//   rem       — rozwiązana długość równa się N × żywy rozmiar pisma korzenia
//               (nigdy wpisany piksel: przeloty chodzą też przy 200% i 300%)
//   accent    — malowanie (`background-color` + `background-image`) rozwiązuje
//               się do akcentu; osąd robi `judgeAccent`, ten sam, którym sonda
//               osądza akcję główną i aktywną nawigację, więc jest niezależny
//               od motywu z konstrukcji (odcień/chroma/alfa, nie literał)
//   accentCount — ILE elementów pod selektorem maluje się akcentem; para nie
//               wskazuje wtedy KTÓRY element ma go nieść, więc nie narzuca
//               kształtu znaczników
//   count     — liczba dopasowań selektora
//   text      — widoczna treść elementu
//
// ── CO ZNACZY `status` ───────────────────────────────────────────────────────
//   "enforced"      — para musi PASOWAĆ; niepasująca jest werdyktem o produkcie
//   "pending: LOT N" — para musi NIE PASOWAĆ; pasująca jest głośna (wyżej)

/**
 * Pary Lotu 1 (powłoka i boczny pasek). Loty 2-6 dopisują swoje po własnym
 * rekonesansie — ta mapa NIE zgaduje za nie.
 */
export const VISUAL_LANGUAGE_PAIRS = [
  // ── POZYCJA 1 — boczny pasek jest szybą zamiast czwartego planu ───────────
  {
    id: "L1-01a",
    lot: 1,
    position: 1,
    title: "the sidebar drops the glass blur",
    contract: ".ui-craft/tokens.md:83-98 (Dark theme — four surface planes)",
    prototype: {
      file: "v3/app.css",
      lines: "155-160",
      value: "`.sidebar` declares no backdrop-filter at all",
    },
    subject: {
      selector: ".sidebar",
      why: "global class in styles.css (not a CSS Module) and the aside also carries aria-label='Workspace and navigation'",
      app: "packages/desktop-ui/src/styles.css:869-872",
    },
    read: { property: "backdropFilter" },
    expect: { kind: "literal", value: "none" },
    status: "enforced",
  },
  {
    id: "L1-01b",
    lot: 1,
    position: 1,
    title: "the sidebar takes the sidebar plane",
    contract: ".ui-craft/tokens.md:83-98 (Dark theme — four surface planes)",
    prototype: {
      file: "v3/app.css",
      lines: "155-160",
      value: "background: var(--surface-sidebar)",
    },
    subject: {
      selector: ".sidebar",
      why: "same subject as L1-01a; the app paints it from --shell-sidebar-bg, which maps to --surface-glass (tokens.css:513)",
      app: "packages/desktop-ui/src/tokens.css:184, :513",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "token", token: "--surface-sidebar" },
    status: "enforced",
  },

  // ── POZYCJA 2 — lewa kolumna nie ma drugiego poziomu ──────────────────────
  {
    id: "L1-02",
    lot: 1,
    position: 2,
    title: "the left column grows a second level",
    contract:
      ".ui-craft/tokens.md:127-140 (Component layer — shell-*, nav-active-*)",
    prototype: {
      file: "v3/app.css",
      lines: "240-260",
      value:
        "`.nav-views .nav-item` — saved views and projects nested under a destination",
    },
    subject: {
      // TA PARA PRZEPISUJE DEKLARACJĘ, i to jest jawne. Drugi poziom dziś nie
      // istnieje, więc nie ma czego zmierzyć „z tego, co jest" — mapa mówi
      // WPROST, po czym go pozna. Atrybut jest wybrany tak, żeby NIE był
      // `data-surface`: sonda wierności buduje spacer z
      // `.nav-item[data-surface]` i KLIKA każdy, więc zagnieżdżone wiersze
      // niosące `data-surface` po cichu wydłużyłyby jej przelot i zmieniły to,
      // co skanuje, bez jednej czerwonej asercji.
      selector: '.sidebar [data-nav-level="child"]',
      why: "prescribed declaration — the nested rows must NOT carry data-surface (the fidelity probe clicks every .nav-item[data-surface])",
      app: "packages/desktop-ui/src/RealApp.tsx:3282, styles.css:1065-1078",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 1 },
    status: "enforced",
  },

  // ── POZYCJA 3 — aktywna zakładka bez podkreślenia i bez górnej krawędzi ───
  {
    id: "L1-03a",
    lot: 1,
    position: 3,
    title: "the active tab is underlined with the accent",
    contract:
      '.ui-craft/tokens.md:212-252 (What the accent is allowed to mean — "where the reader is")',
    prototype: {
      file: "v3/app.css",
      lines: "119-122",
      value:
        '`.tab[aria-selected="true"]::after` — a 2px bar painted background: var(--accent)',
    },
    subject: {
      selector: '.shell-tab:has([role="tab"][aria-selected="true"])',
      why: "declaration, not class name: the tab button owns aria-selected, the painted wrapper is reached through :has() so the .active class name is not load-bearing",
      app: "packages/desktop-ui/src/styles.css:1361-1365, RealApp.tsx:3396-3407",
    },
    read: { pseudo: "::after", property: "backgroundColor" },
    expect: { kind: "accent" },
    status: "enforced",
  },
  {
    id: "L1-03b",
    lot: 1,
    position: 3,
    title: "the active tab takes the material's top edge",
    contract:
      ".ui-craft/tokens.md:71-80 (Shape, motion, depth — elevation roles)",
    prototype: {
      file: "v3/app.css",
      lines: "117-118",
      value:
        '`.tab[aria-selected="true"] { box-shadow: inset 0 1px 0 var(--edge-top) }`',
    },
    subject: {
      selector: '.shell-tab:has([role="tab"][aria-selected="true"])',
      why: "same subject as L1-03a",
      app: "packages/desktop-ui/src/styles.css:1361-1365, tokens.css:278, :767",
    },
    read: { property: "boxShadow" },
    expect: { kind: "contains", value: "inset" },
    status: "enforced",
  },

  // ── POZYCJA 4 — znaki tożsamości szare, awatar z wpisaną literą „I" ───────
  {
    id: "L1-04a",
    lot: 1,
    position: 4,
    title: "the workspace mark is an accent tile",
    contract: ".ui-craft/tokens.md:183-211 (Form first — ink and wash)",
    prototype: {
      file: "v3/app.css",
      lines: "169-175",
      value:
        "`.ws-mark` — 1.5rem tile, background: linear-gradient(150deg, var(--a-400), var(--a-600) 62%, var(--a-700))",
    },
    subject: {
      selector: ".workspace-avatar",
      why: "global class in styles.css; the app paints it var(--surface-sunken)",
      app: "packages/desktop-ui/src/styles.css:932-943, RealApp.tsx:3089",
    },
    read: { property: "paint" },
    expect: { kind: "accent" },
    status: "enforced",
  },
  {
    id: "L1-04b",
    lot: 1,
    position: 4,
    title: 'the workspace mark stops saying "I" on every workspace',
    contract: ".ui-craft/tokens.md:64-70 (Type)",
    prototype: {
      file: "v3/app.css",
      lines: "169-175",
      value:
        "`.ws-mark` carries the workspace's own initial (v3/app.js renders it from the workspace name), not a literal",
    },
    subject: {
      selector: ".workspace-avatar",
      why: "same subject as L1-04a — RealApp.tsx:3089 hardcodes the glyph",
      app: "packages/desktop-ui/src/RealApp.tsx:3089",
    },
    read: { property: "text" },
    expect: { kind: "text", notValue: "I" },
    status: "enforced",
  },
  {
    id: "L1-04c",
    lot: 1,
    position: 4,
    title: "the brand row carries an accent-painted mark",
    contract: ".ui-craft/tokens.md:183-211 (Form first — ink and wash)",
    prototype: {
      file: "v3/app.css",
      lines: "98-103",
      value:
        "`.tb-mark` — 1.25rem tile, background: linear-gradient(150deg, var(--a-400), var(--a-600) 62%, var(--a-700))",
    },
    subject: {
      // LICZBA, NIE SELEKTOR NA KONKRETNY WĘZEŁ. v3 maluje akcent na OPAKOWANIU
      // znaku, którego ta aplikacja nie ma; selektor wskazujący jeden węzeł
      // narzucałby lotowi kształt znaczników zamiast mierzyć farbę.
      selector: ".brand-row, .brand-row *",
      why: "counts accent-painted elements inside the brand row — measures the paint without prescribing which node carries it",
      app: "packages/desktop-ui/src/styles.css:909-913, components/BrandMark.tsx",
    },
    read: { property: "paint" },
    expect: { kind: "accentCount", atLeast: 1 },
    status: "enforced",
  },

  // ── POZYCJA 5 — ikona aktywnej pozycji nawigacji nie bierze akcentu ───────
  {
    id: "L1-05",
    lot: 1,
    position: 5,
    title: "the active destination's icon takes the accent",
    contract:
      '.ui-craft/tokens.md:212-252 (What the accent is allowed to mean — "where the reader is")',
    prototype: {
      file: "v3/app.css",
      lines: "221",
      value:
        '`.nav-item[aria-current="page"] .ico { color: var(--accent); opacity: 1 }`',
    },
    subject: {
      selector: '.nav-item[aria-current="page"] svg',
      why: "declaration: RealApp.tsx:1860 stamps aria-current='page' on the active row; styles.css has NO rule for the icon's colour, so it inherits --nav-active-text",
      app: "packages/desktop-ui/src/styles.css:1112-1117",
    },
    read: { property: "color" },
    expect: { kind: "accent" },
    status: "enforced",
  },

  // ── POZYCJA 6 — skrót świeci w każdym wierszu ─────────────────────────────
  {
    id: "L1-06",
    lot: 1,
    position: 6,
    title: "the shortcut stays quiet on rows that are not current",
    contract:
      ".ui-craft/tokens.md:64-70 (Type — mono only for time, shortcuts, versions, IDs)",
    prototype: {
      file: "v3/app.css",
      lines: "229-234",
      value:
        '`.nav-item .kbd { opacity: 0 }`, raised to 1 only on :hover and on [aria-current="page"]',
    },
    subject: {
      selector: '.nav-item:not([aria-current="page"]) kbd',
      why: "declaration-scoped to the rows that are NOT current; styles.css:4572-4576 gives kbd no opacity at all, so every row shows it",
      app: "packages/desktop-ui/src/styles.css:4572-4576, RealApp.tsx:1884-1891",
    },
    read: { property: "opacity" },
    expect: { kind: "literal", value: "0" },
    status: "enforced",
  },

  // ── POZYCJA 7 — gęstość kolumny ───────────────────────────────────────────
  {
    id: "L1-07a",
    lot: 1,
    position: 7,
    title: "the navigation row is 1.75rem, not 2.125rem",
    contract: ".ui-craft/tokens.md:55-63 (Spacing and density — dense rows)",
    prototype: {
      file: "v3/app.css",
      lines: "198-204",
      value: "`.nav-item { min-height: 1.75rem }`",
    },
    subject: {
      selector: ".nav-item[data-surface]",
      why: "declaration: only destination rows carry data-surface, so the pair is not confused by .nav-favorite / .nav-recent variants",
      app: "packages/desktop-ui/src/styles.css:1065-1078, tokens.css:663",
    },
    read: { property: "height" },
    expect: { kind: "rem", value: 1.75 },
    status: "enforced",
  },
  {
    id: "L1-07b",
    lot: 1,
    position: 7,
    title: "the group heading sits space-3 from what precedes it",
    contract:
      ".ui-craft/tokens.md:55-63 (Spacing and density — 4/8/12px increments)",
    prototype: {
      file: "v3/app.css",
      lines: "210-216",
      value: "`.nav-section { margin-top: var(--space-3) }` — 0.75rem",
    },
    subject: {
      selector: ".nav-group-toggle",
      why: "the app hangs the gap on the toggle itself (there is no section wrapper), styles.css:1013-1035 uses var(--space-4)",
      app: "packages/desktop-ui/src/styles.css:1013-1035",
    },
    read: { property: "marginTop" },
    expect: { kind: "rem", value: 0.75 },
    status: "enforced",
  },

  // ── POZYCJA 8 — okno nie ma ziarna ────────────────────────────────────────
  {
    id: "L1-08a",
    lot: 1,
    position: 8,
    title: "the window carries grain",
    contract: ".ui-craft/tokens.md:83-98 (Dark theme — material, not texture)",
    prototype: {
      file: "v3/app.css",
      lines: "79-82",
      value:
        "`#app::after { background-image: var(--grain); mix-blend-mode: overlay }`",
    },
    subject: {
      selector: ".desktop-shell",
      why: "global class in styles.css:820-830; the token --grain already exists (tokens.css:509) with no consumer",
      app: "packages/desktop-ui/src/styles.css:820-830, tokens.css:509-510",
    },
    read: { pseudo: "::after", property: "backgroundImage" },
    expect: { kind: "not", value: "none" },
    status: "enforced",
  },
  {
    id: "L1-08b",
    lot: 1,
    position: 8,
    title: "the grain layer does not take the click",
    contract: ".ui-craft/tokens.md:71-80 (Shape, motion, depth — Z roles)",
    prototype: {
      file: "v3/app.css",
      lines: "80",
      value: "`#app::after { pointer-events: none }`",
    },
    subject: {
      selector: ".desktop-shell",
      why: "same subject as L1-08a — this is the half of position 8 that turns a decoration into an outage",
      app: "packages/desktop-ui/src/styles.css:820-830",
    },
    read: { pseudo: "::after", property: "pointerEvents" },
    expect: { kind: "literal", value: "none" },
    status: "enforced",
  },

  // ── POZYCJA 9 — wyszukiwarka na kryciu 0,78 plus keycap ───────────────────
  {
    id: "L1-09a",
    lot: 1,
    position: 9,
    title: "the search control is not dimmed as a whole",
    contract: ".ui-craft/tokens.md:127-140 (Component layer — input-*)",
    prototype: {
      file: "v3/app.css",
      lines: "183-194",
      value:
        "`.omnibox` declares no opacity; quiet comes from --text-quaternary",
    },
    subject: {
      selector: ".search-control",
      why: "global class in styles.css:978-1002, which sets opacity: 0.78 on the whole control",
      app: "packages/desktop-ui/src/styles.css:978-1002",
    },
    read: { property: "opacity" },
    expect: { kind: "literal", value: "1" },
    status: "enforced",
  },
  {
    id: "L1-09b",
    lot: 1,
    position: 9,
    title: "the search control drops the keycap",
    contract: ".ui-craft/tokens.md:127-140 (Component layer — input-*)",
    prototype: {
      file: "v3/app.css",
      lines: "183-194",
      value: "`.omnibox` holds an svg glyph and a label — no keycap element",
    },
    subject: {
      selector: ".search-control kbd",
      why: "counted, not read: the prototype's difference here is the ABSENCE of an element",
      app: "packages/desktop-ui/src/styles.css:997-1002",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },

  // ── POZYCJA 10 — dok przechwytywania ──────────────────────────────────────
  {
    id: "L1-10a",
    lot: 1,
    position: 10,
    title: "the capture dock is a pill",
    contract: ".ui-craft/tokens.md:71-80 (Shape — full radius for pills)",
    prototype: {
      file: "v3/app.css",
      lines: "808",
      value: "`.capture { border-radius: var(--radius-full) }`",
    },
    subject: {
      selector: ".capture-dock",
      why: "global class in styles.css:1862-1884; it takes --radius-xl (1rem)",
      app: "packages/desktop-ui/src/styles.css:1862-1884, tokens.css:299",
    },
    read: { property: "borderRadius" },
    expect: { kind: "token", token: "--radius-full" },
    status: "enforced",
  },
  {
    id: "L1-10b",
    lot: 1,
    position: 10,
    title: "the capture dock takes the prototype's vertical padding",
    contract: ".ui-craft/tokens.md:55-63 (Spacing and density)",
    prototype: {
      file: "v3/app.css",
      lines: "807",
      value: "`.capture { padding: 0.4375rem 0.75rem }`",
    },
    subject: {
      selector: ".capture-dock",
      why: "same subject as L1-10a; the app pads 0.55rem top and bottom",
      app: "packages/desktop-ui/src/styles.css:1862-1884",
    },
    read: { property: "paddingTop" },
    expect: { kind: "rem", value: 0.4375 },
    status: "enforced",
  },
  {
    id: "L1-10c",
    lot: 1,
    position: 10,
    title: "the capture dock stops being 50px tall by declaration",
    // LICZBY 50 I 34 SĄ PROZĄ BRIEFU, NIE DEKLARACJĄ v3 — `.capture` nie
    // deklaruje wysokości w ogóle, więc jej 34 px jest SKUTKIEM paddingu
    // i interlinii i nie da się go zacytować jako wartości. Ta para mierzy to,
    // co v3 NAPRAWDĘ mówi: żadnego `min-height`.
    contract: ".ui-craft/tokens.md:55-63 (Spacing and density)",
    prototype: {
      file: "v3/app.css",
      lines: "804-816",
      value: "`.capture` declares no min-height and no height",
    },
    subject: {
      selector: ".capture-dock",
      why: "same subject as L1-10a; the app pins min-height: 3.15rem, which is what makes it 50px",
      app: "packages/desktop-ui/src/styles.css:1862-1884",
    },
    read: { property: "minHeight" },
    expect: { kind: "literal", value: "auto" },
    status: "enforced",
  },

  // ── POZYCJA 11 — pasek tytułu w kolumnie roboczej, nie nad oknem ──────────
  {
    id: "L1-11",
    lot: 1,
    position: 11,
    title: "the title band spans the window, not the work column",
    contract: ".ui-craft/tokens.md:127-140 (Component layer — shell-*)",
    prototype: {
      file: "v3/app.css",
      lines: "84-90",
      value:
        "`.titlebar` is a direct child of `#app`, above `.body` — it spans the full window width",
    },
    subject: {
      selector: ".shell-tabbar",
      why: "geometry, not paint: the band lives inside <main>, so its left edge sits at the sidebar's width",
      app: "packages/desktop-ui/src/styles.css:1224-1236, RealApp.tsx:3359",
    },
    read: { property: "rect.left" },
    expect: { kind: "literal", value: "0px" },
    status: "pending: LOT 1",
  },

  // ── POZYCJA 13 — nie ma czym zwinąć lewej kolumny ─────────────────────────
  {
    id: "L1-13",
    lot: 1,
    position: 13,
    title: "the left column can be collapsed on purpose",
    contract: ".ui-craft/tokens.md:127-140 (Component layer — shell-*)",
    prototype: {
      file: "v3/app.css",
      lines: "152",
      value:
        "`.body.rail { --sidebar-width: var(--sidebar-rail) }`, toggled by v3/app.js:662",
    },
    subject: {
      // DRUGA PARA PRZEPISUJĄCA DEKLARACJĘ, z tego samego powodu co L1-02:
      // afordancji dziś nie ma, a `count` mierzy zero bez udawania, że czegoś
      // nie odczytał.
      selector: "[data-sidebar-collapse]",
      why: "prescribed declaration — rail mode is today a pure consequence of window width (RealApp.tsx:410, :465-478), with no control",
      app: "packages/desktop-ui/src/RealApp.tsx:410, :465-478, styles.css:3185-3290",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "pending: LOT 1",
  },

  // ── POZYCJA 15 — kolumna węższa, pasmo tytułu wyższe ──────────────────────
  {
    id: "L1-15a",
    lot: 1,
    position: 15,
    title: "the sidebar is 15rem wide",
    // UWAGA DLA LOTU: `verify-renderer-layout.mjs` niesie WŁASNY rachunek na
    // 320 px („sam sidebar ma 220, zostaje sto pikseli"). Przy 15rem zostaje
    // osiemdziesiąt i tamta bramka to złapie. Ta para mierzy szerokość, nie
    // rozstrzyga tamtego rachunku.
    contract: ".ui-craft/tokens.md:55-63 (Spacing and density)",
    prototype: {
      file: "v3/tokens.css",
      lines: "103",
      value: "--sidebar-width: 15rem",
    },
    subject: {
      selector: ".sidebar",
      why: "measured on the element, not on the token, so a media query that overrides the width is visible to this pair",
      app: "packages/desktop-ui/src/tokens.css:656",
    },
    read: { property: "width" },
    expect: { kind: "rem", value: 15 },
    status: "pending: LOT 1",
  },
  {
    id: "L1-15b",
    lot: 1,
    position: 15,
    title: "the titlebar band is 2.5rem",
    contract: ".ui-craft/tokens.md:55-63 (Spacing and density)",
    prototype: {
      file: "v3/tokens.css",
      lines: "106",
      value: "--titlebar-height: 2.5rem",
    },
    subject: {
      // TOKEN, NIE ELEMENT: pasmo tytułu jest dziś złożone z dwóch tokenów
      // w jednej wysokości (`styles.css:1226`), więc pomiar elementu mieszałby
      // dwie różne pozycje. Sonda rozwiązuje token na ukrytym elemencie w tej
      // samej stronie.
      token: "--titlebar-height",
      why: "the app composes the band from --titlebar-height + --header-band-height, so the element height cannot isolate this one",
      app: "packages/desktop-ui/src/tokens.css:659",
    },
    read: { property: "height" },
    expect: { kind: "rem", value: 2.5 },
    status: "enforced",
  },
  {
    id: "L1-15c",
    lot: 1,
    position: 15,
    title: "the header band is 2.5rem",
    contract: ".ui-craft/tokens.md:55-63 (Spacing and density)",
    prototype: {
      file: "v3/tokens.css",
      lines: "107",
      value: "--header-band-height: 2.5rem",
    },
    subject: {
      token: "--header-band-height",
      why: "same reason as L1-15b",
      app: "packages/desktop-ui/src/tokens.css:662",
    },
    read: { property: "height" },
    expect: { kind: "rem", value: 2.5 },
    status: "enforced",
  },

  // ── POZYCJA 12 — plakietka Inbox ──────────────────────────────────────────
  // TA PARA POWSTAŁA Z POMIARU, KTÓRY OBALIŁ MOJE WŁASNE ZAŁOŻENIE. Pierwsza
  // wersja mapy wpisała pozycję 12 na listę NIEOBJĘTYCH z uzasadnieniem
  // „fikstura harnessu nie rysuje oczekującego Inboxa". Sonda `probe` wypisała
  // przy pierwszym przebiegu JEDNO dopasowanie `.nav-count--attention` w obu
  // motywach — czyli plakietka rysuje się dziś i da się ją zmierzyć. Wpis
  // wrócił do mapy jako para.
  //
  // OCZEKIWANIE JEST Z ROZSTRZYGNIĘCIA R1, NIE Z TABELI BRIEFU. Brief składano
  // przy stanowisku „kontrakt trzyma" i tam ta pozycja stoi jako „plakietka
  // Inbox neutralna — świadoma sprzeczność z v3". Rozstrzygnięcie właściciela
  // z 2026-08-07 („prototyp ważniejszy") odwraca to wprost: `.ui-craft/
  // decisions.md`, wpis R1, „powłoka #12 plakietka Inbox — NIE → TAK".
  // Zakodowanie tu oczekiwania sprzed rozstrzygnięcia zrobiłoby z tego
  // przyrządu obrońcę dryfu, który ta faza ma usunąć.
  {
    id: "L1-12",
    lot: 1,
    position: 12,
    title: "the Inbox badge takes the accent",
    contract:
      '.ui-craft/tokens.md:212-252 (What the accent is allowed to mean — "what is on the books")',
    prototype: {
      file: "v3/app.css",
      lines: "235-239",
      value:
        "`.nav-item .badge { background: var(--accent); color: var(--on-accent) }`",
    },
    subject: {
      selector: ".nav-count--attention",
      why: "global class in styles.css:1149-1158; it paints from --surface-selected, whose comment says the pill may differ by shape and background but never by a new hue",
      app: "packages/desktop-ui/src/styles.css:1149-1158, RealApp.tsx:1887-1890",
    },
    read: { property: "paint" },
    expect: { kind: "accent" },
    status: "enforced",
  },
];

/**
 * POZYCJE, KTÓRYCH TA MAPA NIE OBEJMUJE — i to jest deliverable równy mapie.
 * Lista jest STRUKTURALNA, nie prozą, żeby dała się policzyć i żeby wpis nie
 * mógł z niej cicho zniknąć. Każdy wpis mówi, GDZIE zła robota dalej przejdzie
 * na zielono.
 */
export const VISUAL_LANGUAGE_NOT_COVERED = [
  {
    lot: 1,
    position: 14,
    // `probe` NIE JEST ASERCJĄ — to selektor, którego liczbę dopasowań przelot
    // WYPISUJE przy każdym przebiegu. Nieobjęta pozycja ma zostawić w raporcie
    // liczbę, żeby jej nieobjęcie dało się podważyć pomiarem, a nie tylko
    // przeczytać jako deklarację.
    probe: ".shell-detach",
    title:
      "the right end of the tab strip: an icon group instead of a wide text button",
    prototype:
      "v3/app.css:135-143 (`.icon-btn` — 1.75rem square), v3/app.js:554-557",
    app: "packages/desktop-ui/src/styles.css:1278-1304 (`.shell-detach`), RealApp.tsx:3437-3465",
    why:
      "Nie ma tu WŁASNOŚCI do porównania — różnica jest w LICZBIE i RODZAJU afordancji, " +
      `a każdy licznik, który umiałbym napisać („ile kontrolek w prawej grupie", „ile z nich ` +
      `jest kwadratowych"), narzuca lotowi kształt znaczników zamiast mierzyć farbę. ` +
      "Selektor na samą szerokość `.shell-detach` mierzyłby przycisk, który po poprawce ma " +
      "przestać istnieć — czyli byłby parą, która po oddaniu lotu wraca NOT_MEASURED.",
    greenWrong:
      "Lot może zostawić szeroki przycisk tekstowy, zmienić mu tylko etykietę, i cała ta mapa " +
      "będzie zielona.",
  },
  {
    lot: 1,
    position: 10,
    title: "the capture dock's hover state takes the accent edge",
    prototype:
      "v3/app.css:815-816 (`.capture:hover { border-color: var(--accent-edge) }`)",
    app: "packages/desktop-ui/src/styles.css:1881-1884",
    probe: ".capture-dock",
    why:
      "Stanu `:hover` nie da się wymusić z `page.evaluate`, a `page.hover()` przechodzi przez " +
      "TRAFIENIE KURSOREM — czyli przez dokładnie tę warstwę, którą pozycja 8 dokłada nad " +
      "powłoką. Para hoverowa mierzyłaby wtedy dwie rzeczy naraz i przy czerwieni nie dałoby " +
      "się powiedzieć, która padła. To jest zakres przyrządu P6, nie tego.",
    greenWrong:
      "Hover doku może zostać neutralny albo dostać dowolny inny kolor.",
  },
];

/**
 * LICZBY WPISANE W PLIK, żeby wpis nie mógł zniknąć po cichu. Przelot sprawdza
 * każdą z nich osobno — usunięcie pary jest wtedy błędem, a nie mniejszym
 * rachunkiem.
 *
 * `positions` domyka drugą stronę: Lot 1 ma w briefie PIĘTNAŚCIE pozycji,
 * i suma pozycji objętych mapą oraz nieobjętych musi się do tej piętnastki
 * dodać. Bez tego pozycja mogłaby wypaść z OBU list naraz.
 */
/*
 * ODDANIE LOTU 1, 2026-08-07: 23 pary przeszły z „pending: LOT 1" na
 * „enforced", DWIE zostają oczekujące (L1-11 pasmo tytułu nad całym oknem,
 * L1-13 afordancja zwinięcia lewej kolumny — obie zostawione świadomie,
 * z powodem w raporcie lotu). Zmieniło się WYŁĄCZNIE pole `status` i te trzy
 * liczby; ani jedno `expect` nie zostało tknięte. Tak każe sam przyrząd:
 * przy pierwszej parze, która zaczęła pasować, wypisał „the lot delivered this
 * and the entry must flip to «enforced» … Do not soften the expectation to keep
 * it pending". Odwrotność — zostawić 25 par jako oczekujące — byłaby bramką
 * czerwoną na KAŻDEJ oddanej pozycji.
 */
export const VISUAL_LANGUAGE_EXPECTED = {
  pairs: 25,
  enforced: 22,
  pending: 3,
  notCovered: 2,
  lots: {
    1: {
      // Pozycje briefu Lotu 1 (`docs/plans/2026-08-06-adopcja-jezyka-wizualnego/
      // faza-3-build-brief.md:180-196`).
      positionsInBrief: 15,
      // Pozycje, dla których mapa ma CO NAJMNIEJ jedną parę:
      // 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15.
      positionsWithPairs: 14,
      // Pozycja, dla której mapa nie ma ANI JEDNEJ pary. Pozycja 10 ma wpis
      // w `NOT_COVERED` na CZĘŚĆ swojej treści (hover), więc nie liczy się
      // tutaj — ma trzy pary.
      positionsWithoutPairs: [14],
    },
  },
};
