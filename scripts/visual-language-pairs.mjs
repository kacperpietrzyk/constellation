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

// ── PARY LOTÓW 2-6: DRUGA MAPA, ŚWIADOMIE NIE CHODZONA PRZEZ DZISIEJSZY
//    PRZELOT ─────────────────────────────────────────────────────────────────
//
// USTALENIE, KTÓRE ZDECYDOWAŁO O KSZTAŁCIE TEGO BLOKU, PRZECZYTANE W KODZIE:
// `visualLanguagePairs` (`scripts/verify-renderer-layout.mjs:3313-3629`) robi
// `page.goto(HARNESS)`, czeka 1500 ms i mierzy. NIC nie klika. `HARNESS` to
// `?surface=collaboration` (`:81`), czyli powłoka na powierzchni lądowania,
// przy 1440×900, w dwóch motywach. Pipeline, Renewals, ekrany rekordu, Library
// i Ustawienia leżą ZA nawigacją, której ten przelot nie wykonuje.
//
// Gdyby te pary trafiły do `VISUAL_LANGUAGE_PAIRS`, przelot zwróciłby dla
// każdej z nich `VISUAL_LANGUAGE_NOT_MEASURED` — bo „selektor nie trafił w nic"
// jest tam AWARIĄ PRZYRZĄDU w OBU statusach (`:3454-3462`, `:3571-3577`), a
// awaria idzie do `failures`, czyli do czerwieni bramki. Pięćdziesiąt siedem
// czerwonych wierszy o zepsutym przyrządzie dostałby każdy lot, który pobiegnie
// PRZED przyrządem P7 — czyli wszystkie loty 2-6. Wpisanie ich osobno jest
// jedynym ruchem, który jednocześnie zapisuje robotę i nie kładzie bramki.
//
// TA LISTA NIE JEST DZIŚ PRZEZ NIC EGZEKWOWANA. `verify-renderer-layout.mjs:60-62`
// importuje trzy nazwy imiennie i nie ma w repo drugiego importera tego pliku
// (sprawdzone grepem po `scripts`, `packages`, `test`) — czwarty eksport jest
// bezwładny. To jest cena i jest nazwana: dopóki P7 nie doda tras, wpis stąd
// może zgnić i nic tego nie powie.
//
// ── CO P7 MUSI DOŁOŻYĆ, ŻEBY TA MAPA ZACZĘŁA MIERZYĆ ─────────────────────────
// 1. TRASĘ NA PARZE, NIE JEDEN STAN DOM-U NA PRZEBIEG. Pary tej mapy NIE dają
//    się zmierzyć w jednym stanie strony: `L4-01a` chce otwartego rekordu
//    projektu, `L4-01b` zadania, `L4-01c` szansy, a otwarty jest zawsze jeden.
//    Przelot ma iść PO TRASACH i przy każdej mierzyć tylko te pary, które ją
//    deklarują. Przelot „wszystkie pary w każdym stanie" da czterdzieści kilka
//    fałszywych `NOT_MEASURED` i będzie nie do odczytania.
// 2. AFORDANCJE, KTÓRYMI SIĘ CHODZI, SĄ JUŻ ZMIERZONE I UŻYWANE PRZEZ SĄSIEDNIE
//    PRZELOTY TEGO SAMEGO PLIKU:
//      • cel nawigacji  — `.nav-item[data-surface="<id>"]`.click()  (`:2704-2714`)
//      • soczewka       — `[data-layout="<label>"]`.click()         (`:898-908`)
//      • rekord         — dblclick na `[data-project-row]`, `[data-task-row]`
//                         albo `[data-pipeline-card]`               (`:976-993`)
//      • zakładka rekordu — `[role="tab"][data-record-tab="<label>"]`.click()
//                                                                   (`:997-1008`)
//      • Ustawienia     — `[data-settings-entry]`.click(), a wyjście
//                         `[data-settings-back]`; wejście PODMIENIA lewą
//                         kolumnę, więc Ustawienia idą OSTATNIE albo z powrotem
//                         (`:740-763`, `:2716-2734`)
// 3. KOSZT, POLICZONY Z TYCH SAMYCH LINII: sąsiednie przeloty czekają 500-900 ms
//    po każdym kliknięciu, a ten przelot chodzi DWA RAZY (motyw ciemny i jasny).
//    Trasy tej mapy to 4 cele nawigacji, 1 soczewka, 3 otwarcia rekordu,
//    1 zakładka i 1 wejście w tryb Ustawień — rzędu 10 przystanków × 2 motywy.
//    To jest decyzja o czasie bramki, nie skutek uboczny; P7 ma ją podjąć
//    świadomie, ewentualnie mierząc trasy w JEDNYM motywie i zostawiając dwa
//    motywy powłoce lądowania.
//
// ── DWA RODZAJE PARY, I POMYLENIE ICH JEST TU NAJDROŻSZYM BŁĘDEM ─────────────
// Pole `kind` mówi, którym z dwóch jest wpis:
//   "restyle"    — podmiot ISTNIEJE po dojściu na miejsce, a właściwość ma dziś
//                  złą wartość. Taka para po dodaniu tras od razu daje DIFFERS.
//   "prescribed" — podmiotu jeszcze NIE MA (afordancja, nie przemalowanie).
//                  Taka para MUSI używać `count` albo `accentCount`, bo tylko
//                  te dwa rodzaje są dobrze określone na zerze; każdy inny
//                  wróciłby `NOT_MEASURED` na wieki i czytałby się jak literówka
//                  w selektorze. Precedens stoi w tej samej mapie: `L1-02`
//                  i `L1-13`.
//
// ── PODMIOT Z CSS MODUŁU ─────────────────────────────────────────────────────
// Normalizacja `_title_1kitm_195` → `_title` w `signature()` (`:3365-3375`)
// obsługuje WYPISYWANIE, nie `querySelectorAll` — selektor `._money` nie trafi
// w nic. Gdzie aplikacja nie niesie deklaracji, ten blok bierze podmiot formą
// `[class*="_nazwa_"]`, ZAWSZE z podkreślnikiem po nazwie: `[class*="_row_"]`
// łapie `_row_hash_150` i `_row_due_hash_183` (obie klasy siedzą na tym samym
// węźle, więc zbiór się nie rozjeżdża), ale `[class*="_mark_"]` NIE łapie
// `_leadMark_hash_357` — porównanie wartości atrybutu `class` jest wrażliwe na
// wielkość liter. Bez tego podkreślnika `[class*="_bar"]` zmiótłby `_barTrack`
// i `_barFill` i para zwróciłaby „kilka różnych wartości" zamiast pomiaru.
//
// SAM PODKREŚLNIK NIE WYSTARCZA, I TO JEST POMIAR, NIE OSTROŻNOŚĆ. Nazwa klasy
// modułu jest unikalna w SWOIM arkuszu, nie w dokumencie, a przelot pyta cały
// dokument. Zliczenie nazw w `packages/desktop-ui/dist/assets/*.css` dało:
// `_row_` — 20 różnych klas, `_count_` — 16, `_rowSelected_` — 8, `_mark_` — 6,
// `_section_` — 5, `_bar_` — 5, `_why_` — 6, `_action_` — 4, `_crumbbar_` — 4,
// `_avatar_` — 6. Dlatego każdy podmiot modułowy o nazwie ogólnej ma tu
// PRZEDROSTEK Z DEKLARACJI (`[data-pipeline-surface]`, `[data-pipeline-card]`,
// `[data-pipeline-column]`, `[data-renewals-surface]`, `[data-renewal-row]`,
// `[data-record-kind="…"]`, `[role="option"]`), a nazwy naprawdę unikalne
// (`_basisOffer_`, `_outlookReal_`, `_treeNodeSelected_`, `_entryAgent_`,
// `_badge_available_`) stoją bez niego. Nierozstrzygnięty selektor nie daje
// błędu — daje „kilka różnych wartości", czyli NOT_MEASURED, czyli fałszywą
// awarię przyrządu zapisaną na konto P7.
//
// ── OSTRZEŻENIE O FIKSTURZE ──────────────────────────────────────────────────
// Pole `blind` znaczy: podmiotu pary NIE RYSUJE dzisiejszy przelot — ani
// dzisiejsza fikstura, ani żadna trasa, którą ten przelot umie przejść. To NIE
// jest awaria P7 i nie ma być tak zaraportowane. Źródło: brief Fazy 3, sekcja 4,
// „Osobno".
//
// ZDANIE WYŻEJ JEST SZERSZE NIŻ BYŁO, I ZMIANA JEST ŚWIADOMA. Do rundy C4 stało
// tu „nie da się zmierzyć nawet PO DODANIU TRAS" — definicja, której dwa nowe
// wpisy (L5-03a, L5-03b) by nie spełniły, bo jeden z nich niesie w warunku
// wyjścia dokładnie ten krok trasy, który by go odślepił. Zostawienie tamtej
// wersji dałoby plik, w którym definicja pola kłóci się z zawartością pola —
// czyli ten sam defekt, który ta runda zamyka gdzie indziej. Rozróżnienie nie
// znika, ono się przenosi DO WPISU: każdy `blind` mówi, czy brakuje DANYCH
// (L2-02a, L2-02b, L4-10 — jedna linijka fikstury), czy STANU EKRANU, którego
// jedna fikstura nie trzyma naraz z sąsiednimi parami tego samego przystanku
// (L5-03a — brakuje jeszcze kroku trasy; L5-03b — nie brakuje kroku, bo ekran
// nie ma afordancji, którą krok mógłby kliknąć).
//
// I TU KOŃCZY SIĘ WYMÓWKA. Para `blind` to pozycja BEZ DOWODU, a pozycje bez
// dowodu kosztowały ten projekt trzy fale — więc każde takie pole musi nieść
// WARUNEK WYJŚCIA, a nie nastrój. Brief pisał „do czasu drugiego zestawu
// danych"; przeczytany kod mówi coś tańszego przy trzech pierwszych ślepych
// parach: dwie odślepia jedna linijka w `crm-fixture.ts`, trzecią jedno
// podzadanie albo jedna krawędź zależności w `CollaborationHarness.tsx`. Ten
// warunek jest wpisany w każde `blind` niżej i jest WEJŚCIEM DLA LOTÓW 2, 4 i 5,
// nie notatką. Kto dopisuje nowe `blind`, pisze w nim, CO trzeba zmienić, żeby
// je skasować — pole bez tego zdania jest wyłącznikiem bramki, a nie faktem
// o danych.
//
// ── ODBIÓR LOTÓW 2, 3 I 4, 2026-08-07 — 42 PARY IDĄ NA „enforced" ────────────
// TO JEST ZAPISANY POWÓD DLA WSZYSTKICH CZTERDZIESTU DWÓCH FLIPÓW i stoi tu
// RAZ, a nie czterdzieści dwa razy przy wpisach. Ten sam powód przepisany do
// każdego wpisu byłby dokładnie tą klasą defektu, którą to repo nosi pod nazwą
// „ten sam kształt przepisany w kilku schematach": czytelnik nie umiałby
// odróżnić wpisu, który przemyślano, od wpisu, który skopiowano.
//
// DOWÓD, JEDEN PRZELOT, OBA MOTYWY: `node scripts/verify-renderer-layout.mjs`
// na drzewie `e95732a` + robota trzech lotów, 11 przystanków × 2 motywy,
// 39 244 ms. Przelot zgłosił 84 razy `ROUTED_PENDING_ALREADY_MATCHES` (42 pary
// × 2 motywy) i ANI RAZU `DIFFERS`, `NOT_MEASURED` ani `ROUTE_FAILED`:
//   lot 2 — 28 MATCH / 0 DIFFERS / 0 NOT_MEASURED / 0 BLIND / 0 ROUTE_FAILED
//   lot 3 — 22 MATCH / 0 / 0 / 0 / 0
//   lot 4 — 34 MATCH / 0 / 0 / 0 / 0
// Każda z 42 pozycji została OSOBNO sprawdzona przeciw cytowanej linii `v3/*`
// i przeciw regule w aplikacji — flip idzie za dostawą, nie za zieloną liczbą.
// Ani jedno oczekiwanie nie zostało zaostrzone, bo ani jedno nie okazało się
// napisane tak, że nie umie paść: sześć par rodzaju `not` (L2-02b, L2-04,
// L2-11, L3-09b, L4-01c, L4-02b) czyta dziś wartość, którą v3 podaje w tej
// samej linii, a nie wartość dowolnie różną od dzisiejszej.
//
// TRZY PARY, KTÓRYCH FLIP WYMAGAŁ OSĄDU, A NIE ODCZYTU — powód przy każdej
// z nich niżej, bo tam jest jedyne miejsce, w którym się go szuka: L2-06
// i L4-08a (mierzą DEKLARACJĘ, nie zachowanie) oraz L3-07 (liczba na
// nieobecność).
export const VISUAL_LANGUAGE_ROUTED_PAIRS = [
  // ══ LOT 2 — PIPELINE ══════════════════════════════════════════════════════
  // Trasa całego lotu: klik `.nav-item[data-surface="pipeline"]`.
  {
    id: "L2-02a",
    lot: 2,
    position: 2,
    kind: "restyle",
    title: "the stage meter is painted with the indigo ramp",
    contract: ".ui-craft/tokens.md:183-211 (Form first — ink and wash)",
    prototype: {
      file: "v3/screens/pipeline.css",
      lines: "80-84",
      value:
        "`.pp-meter i { background: linear-gradient(90deg, var(--a-600), var(--a-400)) }`",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: "[data-pipeline-meter] > span",
      why: "the wrapper carries the declaration data-pipeline-meter (PipelineSurface.tsx:413); the fill is its only child",
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:286-291",
    },
    read: { property: "backgroundImage" },
    // Dziś `background: var(--text-link)`, a `--text-link` jest w tej aplikacji
    // aliasem tekstu drugorzędnego (tokens.css:270) — czyli neutralną szarością
    // BEZ obrazu tła. `backgroundImage` liczy się więc dziś do „none".
    expect: { kind: "not", value: "none" },
    // ŚLEPOTA POTWIERDZONA, ALE JEJ CENA — NIE. Brief mówił „do czasu drugiego
    // zestawu danych"; przeczytany kod mówi coś tańszego. `meterMax` patrzy
    // WYŁĄCZNIE na kolumny NIETERMINALNE (`pipeline-view.ts:419-432`), więc nie
    // chodzi o „dwie waluty na tablicy", tylko o dwie waluty w OTWARTYM lejku.
    // Wśród otwartych kart fikstury jest PLN (`crm-fixture.ts:246`, `:307`)
    // i EUR (`:267`), więc `sumByCurrency(...).length === 2` i `meterMax` wraca
    // 0, a `PipelineSurface.tsx:412` nie montuje `[data-pipeline-meter]` ani
    // razu. Demonstracja przewalutowania, o którą fikstura zabiega świadomie
    // (`crm-fixture.ts:17`), siedzi na KOSZCIE oferty (`:386` — `edrOffer.cost`
    // w EUR plus `rate`), czyli na INNYM POLU niż wartość karty; zdjęcie EUR
    // z `edrDeal.estimate` jej nie rusza.
    //
    // ŚLEPOTA ZDJĘTA 2026-08-07, BO WARUNEK WYJŚCIA ZOSTAŁ SPEŁNIONY, a nie
    // dlatego, że przestała przeszkadzać. Lot 2 wziął pierwszy z dwóch
    // wariantów wypisanych wyżej — `edrDeal.estimate` z EUR na PLN — i zapłacił
    // nazwaną cenę (nagłówek tablicy nie drukuje już sumy dwuwalutowej).
    // `[data-pipeline-meter]` montuje się od tego commita, a obie pary tej
    // pozycji wróciły z pomiarem, nie z BLIND. Pole `blind` zdjęte razem
    // z warunkiem: wpis, który dalej tłumaczy, jak siebie odślepić, mierząc
    // przy tym na zielono, jest tym samym nieaktualnym dokumentem, przeciwko
    // któremu stoi cała ta faza.
    status: "enforced",
  },
  {
    id: "L2-02b",
    lot: 2,
    position: 2,
    kind: "restyle",
    title: "the stage meter animates its width",
    contract: ".ui-craft/tokens.md:71-80 (Shape, motion, depth)",
    prototype: {
      file: "v3/screens/pipeline.css",
      lines: "83",
      value: "`transition: width var(--duration-slow) var(--ease-out)`",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: "[data-pipeline-meter] > span",
      why: "same subject as L2-02a",
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:286-291",
    },
    read: { property: "transitionDuration" },
    expect: { kind: "not", value: "0s" },
    // Ślepota zdjęta 2026-08-07 tą samą jedną linijką, co przy L2-02a
    // (`edrDeal.estimate` na PLN) — powód i cena stoją tam.
    status: "enforced",
  },
  {
    id: "L2-03",
    lot: 2,
    position: 3,
    kind: "restyle",
    title: "the offer badge is told apart by the accent",
    // OCZEKIWANIE Z ROZSTRZYGNIĘCIA R1, NIE Z TABELI BRIEFU — dokładnie tak jak
    // przy L1-12. Brief składano przy „kontrakt trzyma" i tam ta pozycja stoi
    // jako NIE; `.ui-craft/decisions.md`, wpis R1 z 2026-08-07, odwraca ją na
    // TAK („co zaksięgowane, nie założone").
    contract: ".ui-craft/decisions.md — R1 z 2026-08-07, wiersz „Pipeline #3",
    prototype: {
      file: "v3/screens/pipeline.css",
      lines: "138",
      value:
        "`.pp-basis--offer { color: var(--accent); border-color: var(--accent-edge); background: var(--accent-quieter) }`",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: '[data-pipeline-surface] [class*="_basisOffer_"]',
      why: "CSS Module class; the app paints it var(--text-link), which in THIS app aliases the secondary text ramp (tokens.css:270) — grey, not blue",
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:407-411",
    },
    read: { property: "color" },
    expect: { kind: "accent" },
    status: "enforced",
  },
  {
    id: "L2-04",
    lot: 2,
    position: 4,
    kind: "restyle",
    title: "the card carries a resting shadow",
    contract:
      ".ui-craft/tokens.md:71-80 (Shape, motion, depth — elevation roles)",
    prototype: {
      file: "v3/screens/pipeline.css",
      lines: "98-102",
      value: "`.pp-card { box-shadow: var(--shadow-sm) }`",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: "[data-pipeline-card]",
      why: "declaration on the card itself (PipelineSurface.tsx:297); the sheet declares no box-shadow at all",
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:327-340",
    },
    read: { property: "boxShadow" },
    expect: { kind: "not", value: "none" },
    status: "enforced",
  },
  {
    id: "L2-05a",
    lot: 2,
    position: 5,
    kind: "restyle",
    title: "the stale day badge is filled, not only tinted",
    contract: ".ui-craft/tokens.md:127-140 (Component layer — status-*)",
    prototype: {
      file: "v3/app.css",
      lines: "426",
      value:
        "`.tag.error { color: var(--status-error); background: var(--status-error-bg) }`, wybrane przez v3/screens/pipeline.js:326",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: '[data-pipeline-card] [class*="_ageStale_"]',
      why: "CSS Module class; the app tints the TEXT amber and leaves the box transparent",
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:547-559",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "token", token: "--status-error-bg" },
    note:
      "MIERZALNA DZIŚ mimo briefu: „Osobno” mówi, że NIE ISTNIEJE stan SPOKOJNY (wszystko ma 420 d). " +
      "Stan nieświeży rysuje się na każdej karcie, więc ta para ma co czytać; nie ma go tylko wariant `ghost`.",
    status: "enforced",
  },
  {
    id: "L2-05b",
    lot: 2,
    position: 5,
    kind: "prescribed",
    title: "the stale day badge carries a clock",
    contract: ".ui-craft/tokens.md:127-140 (Component layer)",
    prototype: {
      file: "v3/screens/pipeline.js",
      lines: "326",
      value: '`${stale ? icon("clock") : ""}` przed liczbą dni',
    },
    route: { surface: "pipeline" },
    subject: {
      selector: '[data-pipeline-card] [class*="_ageStale_"] svg',
      why: "counted, not read: the difference is the PRESENCE of a glyph the app does not draw",
      app: "packages/desktop-ui/src/pipeline/PipelineSurface.tsx:358-361",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 1 },
    status: "enforced",
  },
  {
    id: "L2-06",
    lot: 2,
    position: 6,
    kind: "restyle",
    title: "the column heading sticks while the column scrolls",
    contract: ".ui-craft/tokens.md:71-80 (Shape, motion, depth — Z roles)",
    prototype: {
      file: "v3/screens/pipeline.css",
      lines: "58-65",
      value:
        "`.pp-head { position: sticky; top: 0; z-index: var(--z-raised) }`",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: '[data-pipeline-column] [class*="_columnHead_"]',
      why: "CSS Module class; the sheet declares no position, so it computes static",
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:247-254",
    },
    read: { property: "position" },
    // TA PARA MIERZY DEKLARACJĘ, NIE ZACHOWANIE. `sticky` milknie bez błędu pod
    // przodkiem z `overflow` innym niż `visible` (P7), a w tej aplikacji pion
    // przewija `.work-surface`, nie `.scroller`. Zielona para tutaj NIE JEST
    // dowodem, że nagłówek został na ekranie — to jest dokładnie robota P7.
    //
    // FLIP NA „enforced" ZNACZY DOKŁADNIE TYLE, ILE TA PARA MIERZY, 2026-08-07.
    // Żywy skan P7 zmierzył ten podmiot na przystanku `pipeline` i wrócił
    // NOT_EXERCISED: pojemnikiem przewijania jest `div._scroller`, przelot
    // poprosił go o 49 px i dostał 0 („needed 9, range 174.4"). Deklaracja jest
    // dowieziona i jest DZIŚ BEZWŁADNA — dokładnie tak, jak lot 2 zapisał to
    // w `pipeline.module.css` przy samej regule. Wpis P7-02, który tę
    // bezwładność diagnozował, zniknął z rejestru w tym samym przebiegu (podmiot
    // JUŻ się klei, więc rejestr „czeka na" go wyrzucał), a to znaczy, że
    // ZACHOWANIA tego nagłówka nie asertuje dziś nic — jest tylko raportowane
    // jako żywy podmiot NOT_EXERCISED.
    expect: { kind: "literal", value: "sticky" },
    status: "enforced",
  },
  {
    id: "L2-07a",
    lot: 2,
    position: 7,
    kind: "restyle",
    title: "the owner avatar takes the elevated plane",
    contract: ".ui-craft/tokens.md:83-98 (Dark theme — four surface planes)",
    prototype: {
      file: "v3/app.css",
      lines: "431-436",
      value: "`.avatar { background: var(--surface-elevated) }`",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: '[data-pipeline-card] [class*="_avatar_"]',
      why: "scoped to the card so it cannot collide with an avatar from another module; the app paints var(--surface-hover)",
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:561-572",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "token", token: "--surface-elevated" },
    note:
      "Brief §4 liczy tę pozycję do niewidzialnych dla CZŁOWIEKA (awatar rysuje się raz na tablicy). " +
      "Dla pary jeden narysowany węzeł WYSTARCZA — ślepota dotyczy odbioru okiem, nie pomiaru.",
    status: "enforced",
  },
  {
    id: "L2-07b",
    lot: 2,
    position: 7,
    kind: "restyle",
    title: "the owner avatar takes an edge",
    contract: ".ui-craft/tokens.md:83-98 (Dark theme)",
    prototype: {
      file: "v3/app.css",
      lines: "431-436",
      value: "`.avatar { border: 1px solid var(--border-default) }`",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: '[data-pipeline-card] [class*="_avatar_"]',
      why: "same subject as L2-07a; the sheet declares no border, so the computed width is 0px",
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:561-572",
    },
    read: { property: "borderTopWidth" },
    expect: { kind: "literal", value: "1px" },
    status: "enforced",
  },
  {
    id: "L2-08",
    lot: 2,
    position: 8,
    kind: "restyle",
    title: "the create toggle is painted as the primary action",
    contract:
      '.ui-craft/tokens.md:212-252 (What the accent is allowed to mean — "what is primary")',
    prototype: {
      file: "v3/app.css",
      lines: "321-332",
      value:
        "`.btn.primary { background: linear-gradient(180deg, var(--a-400), var(--a-500) 55%, var(--a-600)) }`, wybrany przez v3/screens/pipeline.js:409-410",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: '[data-pipeline-surface] [class*="_crumbbar_"] button',
      why: "R2 — one ruling for five surfaces; the row holds exactly one button, which today is `secondary-button`",
      app: "packages/desktop-ui/src/pipeline/PipelineSurface.tsx:739-749",
    },
    read: { property: "paint" },
    expect: { kind: "accent" },
    status: "enforced",
  },
  {
    id: "L2-09a",
    lot: 2,
    position: 9,
    kind: "prescribed",
    title: "the next step carries a glyph",
    contract: ".ui-craft/tokens.md:127-140 (Component layer)",
    prototype: {
      file: "v3/screens/pipeline.css",
      lines: "196-202",
      value: "`.pp-next svg { width: 0.75rem; height: 0.75rem }`",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: '[data-pipeline-card] [class*="_next_"] svg',
      why: "counted; the app renders the sentence with no room for a glyph",
      app: "packages/desktop-ui/src/pipeline/PipelineSurface.tsx:356",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 1 },
    status: "enforced",
  },
  {
    id: "L2-09b",
    lot: 2,
    position: 9,
    kind: "prescribed",
    title: "the waiting note carries a glyph",
    contract: ".ui-craft/tokens.md:127-140 (Component layer)",
    prototype: {
      file: "v3/screens/pipeline.css",
      lines: "186-194",
      value: "`.pp-wait svg { width: 0.75rem; height: 0.75rem; flex: none }`",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: "[data-offer-waiting] svg",
      why: "declaration: the paragraph carries data-offer-waiting (PipelineSurface.tsx:170)",
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:515-537",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 1 },
    status: "enforced",
  },
  {
    id: "L2-10",
    lot: 2,
    position: 10,
    kind: "restyle",
    title: "the Stages control stops being permanently outlined",
    contract: ".ui-craft/tokens.md:127-140 (Component layer — quiet controls)",
    prototype: {
      file: "v3/screens/pipeline.css",
      lines: "8-16",
      value:
        "`.pp-stages { border: 1px solid transparent }`, a obwódka zapala się dopiero na :hover",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: '[data-pipeline-surface] [class*="_stagesLink_"]',
      why: "CSS Module class; the app declares 1px solid var(--border-subtle) at rest",
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:80-94",
    },
    read: { property: "borderTopColor" },
    // Przezroczystość, nie zerowa szerokość: v3 ZOSTAWIA tor obwódki, żeby
    // kontrolka nie skakała o piksel przy najechaniu.
    expect: { kind: "literal", value: "rgba(0, 0, 0, 0)" },
    status: "enforced",
  },
  {
    id: "L2-11",
    lot: 2,
    position: 11,
    kind: "restyle",
    title: "the card declares a transition",
    contract: ".ui-craft/tokens.md:71-80 (Shape, motion, depth)",
    prototype: {
      file: "v3/screens/pipeline.css",
      lines: "103-107",
      value:
        "`.pp-card { transition: border-color …, box-shadow …, transform …, background … }`",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: "[data-pipeline-card]",
      why: "same declaration as L2-04; the whole sheet holds not one transition, so the duration computes 0s",
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:327-336",
    },
    read: { property: "transitionDuration" },
    expect: { kind: "not", value: "0s" },
    status: "enforced",
  },

  // ══ LOT 3 — RENEWALS ══════════════════════════════════════════════════════
  // Trasa całego lotu: klik `.nav-item[data-surface="renewals"]`.
  {
    id: "L3-01a",
    lot: 3,
    position: 1,
    kind: "restyle",
    title: "the amount at renewal is filled with the accent",
    contract: ".ui-craft/decisions.md — R1 z 2026-08-07, wiersz „Renewals #1",
    prototype: {
      file: "v3/screens/renewals.css",
      lines: "121-122",
      value:
        "`.rn-out.real { border: 1px solid var(--accent-edge); background: var(--accent-quieter) }`",
    },
    route: { surface: "renewals" },
    subject: {
      selector: '[data-renewals-surface] [class*="_outlookReal_"]',
      why: "CSS Module class; the DOM also carries data-renewal-outlook, but its VALUE varies with the basis, so the class is the stabler subject",
      app: "packages/desktop-ui/src/renewals/renewals.module.css:414-427",
    },
    read: { property: "paint" },
    expect: { kind: "accent" },
    status: "enforced",
  },
  {
    id: "L3-01b",
    lot: 3,
    position: 1,
    kind: "restyle",
    title: "the basis link takes the accent",
    contract: ".ui-craft/decisions.md — R1 z 2026-08-07, wiersz „Renewals #1",
    prototype: {
      file: "v3/screens/renewals.css",
      lines: "129",
      value: "`.rn-basis.link { color: var(--accent) }`",
    },
    route: { surface: "renewals" },
    subject: {
      selector: '[data-renewals-surface] [class*="_basisLink_"]',
      why: "CSS Module class on the button that leads to the deal (RenewalsSurface.tsx:158-168)",
      app: "packages/desktop-ui/src/renewals/renewals.module.css:434-441",
    },
    read: { property: "color" },
    expect: { kind: "accent" },
    status: "enforced",
  },
  {
    id: "L3-02",
    lot: 3,
    position: 2,
    kind: "restyle",
    title: "a section boundary reads louder than a row boundary",
    contract: ".ui-craft/tokens.md:55-63 (Spacing and density)",
    prototype: {
      file: "v3/screens/renewals.css",
      lines: "11",
      value: "`.rn-sec { margin-bottom: var(--space-8) }`",
    },
    route: { surface: "renewals" },
    subject: {
      selector: '[data-renewals-surface] [class*="_section_"]',
      why: "trailing underscore keeps _sectionHead_ out, and data-renewals-surface keeps the OTHER four _section_ classes in the build out; the brief's hard condition says the gap goes on .section and NOT on the .renewals gap, which also spaces the crumb bar and both forms",
      app: "packages/desktop-ui/src/renewals/renewals.module.css:94-96",
    },
    read: { property: "marginBottom" },
    expect: { kind: "token", token: "--space-8" },
    status: "enforced",
  },
  {
    id: "L3-03",
    lot: 3,
    position: 3,
    kind: "prescribed",
    title: "the row mark is drawn, not typed",
    contract: ".ui-craft/tokens.md:64-70 (Type)",
    prototype: {
      file: "v3/screens/renewals.css",
      lines: "52-55",
      value: "`.rn-mark svg { width: 0.875rem; height: 0.875rem }`",
    },
    route: { surface: "renewals" },
    subject: {
      selector: '[data-renewals-surface] [class*="_mark_"] svg',
      why: "counted; the app types ▲ ◷ ■ as text (RenewalsSurface.tsx:75-79). The trailing underscore keeps _leadMark_ out — class matching is case sensitive",
      app: "packages/desktop-ui/src/renewals/renewals.module.css:195-202",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 1 },
    status: "enforced",
  },
  {
    id: "L3-04",
    lot: 3,
    position: 4,
    kind: "prescribed",
    title: "the row buttons carry glyphs",
    contract: ".ui-craft/tokens.md:127-140 (Component layer)",
    prototype: {
      file: "v3/screens/renewals.js",
      lines: "84-85, 97, 175",
      value: "każdy przycisk wiersza otwiera się glifem",
    },
    route: { surface: "renewals" },
    subject: {
      selector: '[data-renewals-surface] [class*="_action_"] svg',
      why: "counted; the row's own buttons (RenewalsSurface.tsx:308-315, :395-402) render text only",
      app: "packages/desktop-ui/src/renewals/renewals.module.css:577-596",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 1 },
    risk: "descendant-overflow.mjs:167-176 trzyma sufit 19 px / 54 px na `div._money` — brief nazywa poz. 4 jedyną pozycją tego lotu, którą złapie bramka. Ta para nie zwalnia z tamtego pomiaru.",
    status: "enforced",
  },
  {
    id: "L3-05",
    lot: 3,
    position: 5,
    kind: "prescribed",
    title: "a mid-term change carries its own mark",
    contract: ".ui-craft/tokens.md:127-140 (Component layer — status-*)",
    prototype: {
      file: "v3/screens/renewals.css",
      lines: "170",
      value: "`.rn-amend > svg { color: var(--status-success) }`",
    },
    route: { surface: "renewals" },
    subject: {
      selector: '[data-renewals-surface] [class*="_amendment_"] > svg',
      why: "counted; the app draws the amendment line with a left rule and no mark at all",
      app: "packages/desktop-ui/src/renewals/renewals.module.css:508-518",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 1 },
    status: "enforced",
  },
  {
    id: "L3-06",
    lot: 3,
    position: 6,
    kind: "restyle",
    title: "the create toggle is painted as the primary action",
    contract:
      '.ui-craft/tokens.md:212-252 (What the accent is allowed to mean — "what is primary")',
    prototype: {
      file: "v3/app.css",
      lines: "321-332",
      value: "`.btn.primary`, wybrany przez v3/screens/renewals.js:217",
    },
    route: { surface: "renewals" },
    subject: {
      selector: '[data-renewals-surface] [class*="_crumbbar_"] button',
      why: "R2, the same ruling as L2-08; on this screen the crumb bar holds exactly one button",
      app: "packages/desktop-ui/src/renewals/RenewalsSurface.tsx:777-785",
    },
    read: { property: "paint" },
    expect: { kind: "accent" },
    status: "enforced",
  },
  {
    id: "L3-07",
    lot: 3,
    position: 7,
    kind: "prescribed",
    title: "the count leaves the button row",
    contract: ".ui-craft/tokens.md:127-140 (Component layer — shell bands)",
    prototype: {
      file: "v3/app.css",
      lines: "295-301",
      value:
        "`.viewbar { min-height: var(--header-band-height); border-bottom: 1px solid var(--border-subtle) }` niesie `.count`",
    },
    route: { surface: "renewals" },
    subject: {
      // LICZBA NA NIEOBECNOŚĆ, nie selektor na nowy węzeł: mapa nie wie, jak lot
      // nazwie własne pasmo, i nie ma prawa mu tego narzucać. Wie natomiast, co
      // ma z tego rzędu ZNIKNĄĆ.
      selector:
        '[data-renewals-surface] [class*="_crumbbar_"] [class*="_count_"]',
      why: "counted at zero: the position is that the counter must leave the button row, and any selector for the NEW band would prescribe markup the lot chooses",
      app: "packages/desktop-ui/src/renewals/RenewalsSurface.tsx:786-788",
    },
    read: { property: null },
    // LICZBA ZERO SAMA NIE ODRÓŻNIA „licznik wyszedł" OD „cały rząd zniknął",
    // i przy odbiorze 2026-08-07 to rozróżnienie zrobiła para sąsiednia, a nie
    // ta: L3-06 czyta `[class*="_crumbbar_"] button` NA TYM SAMYM przystanku
    // i wróciła MATCH z osądzonym malowaniem, czyli rząd stoi i ma w sobie
    // przycisk. Dopiero te dwa odczyty razem znaczą „licznik go opuścił".
    // Kto kiedyś usunie L3-06, zabiera tej parze jej jedyny kontrapunkt.
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    id: "L3-08",
    lot: 3,
    position: 8,
    kind: "prescribed",
    title: "Show/Hide draws its own chevron",
    contract: ".ui-craft/tokens.md:127-140 (Component layer)",
    prototype: {
      file: "v3/screens/renewals.css",
      lines: "31-32",
      value:
        '`.rn-more svg { transition: transform … }` + `.rn-more[aria-expanded="true"] svg { transform: rotate(180deg) }`',
    },
    route: { surface: "renewals" },
    subject: {
      selector: '[data-renewals-surface] [class*="_more_"] svg',
      why: "counted; aria-expanded is stamped and paints nothing (RenewalsSurface.tsx:1059-1066)",
      app: "packages/desktop-ui/src/renewals/renewals.module.css:122-134",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 1 },
    status: "enforced",
  },
  {
    id: "L3-09a",
    lot: 3,
    position: 9,
    kind: "restyle",
    title: "the row takes the prototype's vertical padding",
    contract: ".ui-craft/tokens.md:55-63 (Spacing and density)",
    prototype: {
      file: "v3/screens/renewals.css",
      lines: "40",
      value: "`.rn-row { padding: var(--space-4) }`",
    },
    route: { surface: "renewals" },
    subject: {
      selector: "[data-renewal-row]",
      why: 'declaration, not class name: RenewalsSurface.tsx:232 stamps data-renewal-row on every row. A [class*="_row_"] subject was MEASURED as unsafe — twenty distinct _row_ classes exist across the built chunks — and the declaration costs nothing. The app pads var(--space-3) block-wise',
      app: "packages/desktop-ui/src/renewals/renewals.module.css:150-162",
    },
    read: { property: "paddingTop" },
    expect: { kind: "token", token: "--space-4" },
    status: "enforced",
  },
  {
    id: "L3-09b",
    lot: 3,
    position: 9,
    kind: "restyle",
    title: "the section heading declares tracking",
    contract: ".ui-craft/tokens.md:64-70 (Type)",
    prototype: {
      file: "v3/screens/renewals.css",
      lines: "17",
      value: "`.rn-sec-head h2 { letter-spacing: -0.005em }`",
    },
    route: { surface: "renewals" },
    subject: {
      selector: '[data-renewals-surface] [class*="_sectionHead_"] h2',
      // WARTOŚĆ NIE JEST WPISANA: -0,005em na 13 px to 0,065 px, a to jest pod
      // progiem, na którym pomiar w px cokolwiek znaczy. Para pyta o to, czy
      // tracking W OGÓLE jest zadeklarowany.
      why: "the app declares no letter-spacing at all, so it computes „normal”; the prototype's value is too small to assert in pixels",
      app: "packages/desktop-ui/src/renewals/renewals.module.css:106-113",
    },
    read: { property: "letterSpacing" },
    expect: { kind: "not", value: "normal" },
    status: "enforced",
  },

  // ══ LOT 4 — EKRANY REKORDU ════════════════════════════════════════════════
  // TRZY RÓŻNE TRASY I ONE SIĘ WYKLUCZAJĄ. Otwarty jest zawsze jeden rekord,
  // więc przelot MUSI mierzyć każdą parę na JEJ trasie. To jest ten wymóg
  // z punktu 1 nagłówka i najłatwiejsza rzecz do przeoczenia w P7.
  {
    id: "L4-01a",
    lot: 4,
    position: 1,
    kind: "restyle",
    title: "the project record title is --text-xl",
    contract: ".ui-craft/tokens.md:64-70 (Type)",
    prototype: {
      file: "v3/app.css",
      lines: "651-652",
      value: "`.rec-title { font-size: var(--text-xl) }` (v3/tokens.css:29)",
    },
    route: { surface: "projects", openRecord: "[data-project-row]" },
    subject: {
      selector: '[data-record-kind="project"] #surface-title',
      why: "declaration on BOTH sides: the record kind is stamped on the screen and the heading carries id=surface-title (ProjectRecordOverview.tsx:132); the app gives it --text-2xl",
      app: "packages/desktop-ui/src/record/project-record.module.css:24-32",
    },
    read: { property: "fontSize" },
    expect: { kind: "token", token: "--text-xl" },
    status: "enforced",
  },
  {
    id: "L4-01b",
    lot: 4,
    position: 1,
    kind: "restyle",
    title: "the task record title is --text-xl",
    contract: ".ui-craft/tokens.md:64-70 (Type)",
    prototype: {
      file: "v3/app.css",
      lines: "651-652",
      value: "`.rec-title { font-size: var(--text-xl) }`",
    },
    route: { surface: "tasks", openRecord: "[data-task-row]" },
    subject: {
      selector: '[data-record-kind="task"] #surface-title',
      why: "same shape as L4-01a (TaskRecordScreen.tsx:488); the app gives it --text-2xl",
      app: "packages/desktop-ui/src/record/task-record.module.css:23-38",
    },
    read: { property: "fontSize" },
    expect: { kind: "token", token: "--text-xl" },
    status: "enforced",
  },
  {
    id: "L4-01c",
    lot: 4,
    position: 1,
    kind: "restyle",
    title: "the opportunity record title declares tracking",
    // TA PARA NIE PYTA O ROZMIAR, I TO JEST POMIAR, NIE OSTROŻNOŚĆ. Ekran
    // szansy JUŻ dziś stoi na --text-xl (opportunity-record.module.css:29-38),
    // więc para o rozmiarze PASOWAŁABY od razu i przyrząd zgłosiłby ją jako
    // „oczekująca, a pasuje". Waga 620 kontra 600 jest jawnie POZA zakresem
    // lotu („nie rusza wag pisma 580/590/620"). Zostaje tracking: v3 deklaruje
    // -0.022em, aplikacja nie deklaruje nic.
    contract: ".ui-craft/tokens.md:64-70 (Type)",
    prototype: {
      file: "v3/app.css",
      lines: "651",
      value: "`.rec-title { letter-spacing: -0.022em }`",
    },
    route: { surface: "pipeline", openRecord: "[data-pipeline-card]" },
    subject: {
      selector: '[data-record-kind="opportunity"] #surface-title',
      why: "OpportunityRecordScreen.tsx:490; the sheet declares no letter-spacing, so it computes „normal”",
      app: "packages/desktop-ui/src/opportunity/opportunity-record.module.css:29-38",
    },
    read: { property: "letterSpacing" },
    expect: { kind: "not", value: "normal" },
    status: "enforced",
  },
  {
    id: "L4-02a",
    lot: 4,
    position: 2,
    kind: "restyle",
    title: "the plan and the deadline are two cells, not one sentence",
    contract: ".ui-craft/tokens.md:55-63 (Spacing and density)",
    prototype: {
      file: "v3/screens/record.css",
      lines: "214-251",
      value: "`.rc-plan` — dwie komórki obok siebie z widoczną granicą",
    },
    route: { surface: "tasks", openRecord: "[data-task-row]" },
    subject: {
      selector: '[data-record-kind="task"] [class*="_plan_"]',
      why: "the app renders one <p> with a middle dot (TaskRecordScreen.tsx:539-552), so display computes block",
      app: "packages/desktop-ui/src/record/task-record.module.css:138-148",
    },
    read: { property: "display" },
    expect: { kind: "literal", value: "grid" },
    status: "enforced",
  },
  {
    id: "L4-02b",
    lot: 4,
    position: 2,
    kind: "restyle",
    title: "the operational signal gets a band",
    contract: ".ui-craft/tokens.md:127-140 (Component layer — status-*)",
    prototype: {
      file: "v3/screens/record.css",
      lines: "203-211",
      value:
        "`.rc-signal { padding: 0.4375rem 0.75rem; border-radius: var(--radius-sm) }` + `.rc-signal-waiting { background: var(--status-warning-bg) }`",
    },
    route: { surface: "tasks", openRecord: "[data-task-row]" },
    subject: {
      selector: '[data-record-kind="task"] [class*="_why_"]',
      why: "the app draws the signal as a bare span with no box at all",
      app: "packages/desktop-ui/src/record/task-record.module.css:87-91",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "not", value: "rgba(0, 0, 0, 0)" },
    risk: 'renderuje się WYŁĄCZNIE, gdy `operationalState !== "actionable"` (TaskRecordScreen.tsx:507); jeśli fikstura otwiera zadanie zwyczajne, para wróci NOT_MEASURED i to jest fakt o fiksturze, nie o selektorze',
    status: "enforced",
  },
  {
    id: "L4-03a",
    lot: 4,
    position: 3,
    kind: "restyle",
    title: "the agent's comment is marked with the accent, not with blue",
    // ROZSTRZYGNIĘCIE R1 ODWRACA TĘ POZYCJĘ. Brief składano przy „kontrakt
    // trzyma" i tam stoi NIE, z powołaniem na `.ui-craft/brief.md:13`
    // („collaboration identity keeps its own hue"). `decisions.md`, wpis R1
    // z 2026-08-07, mówi wprost: „zdanie, które ją wyjmowało, jest właśnie tym,
    // co rozstrzygnięcie uchyla". Zakodowanie tu starego oczekiwania zrobiłoby
    // z przyrządu obrońcę dryfu.
    contract: ".ui-craft/decisions.md — R1 z 2026-08-07, wiersz „rekord #3",
    prototype: {
      file: "v3/screens/record.css",
      lines: "375",
      value:
        "`.rc-comment-agent { border-left: 2px solid var(--accent-edge); background: var(--accent-quieter) }`",
    },
    route: {
      surface: "projects",
      openRecord: "[data-project-row]",
      recordTab: "comments",
    },
    subject: {
      selector: '[class*="_entryAgent_"]',
      why: "CSS Module class; the app paints var(--status-info), which is the blue ramp (tokens.css:322) — a hue judgeAccent will not accept",
      app: "packages/desktop-ui/src/record/record-comments.module.css:83-87",
    },
    read: { property: "borderLeftColor" },
    expect: { kind: "accent" },
    status: "enforced",
  },
  {
    id: "L4-03b",
    lot: 4,
    position: 3,
    kind: "restyle",
    title: "the agent's mark is accent, not blue",
    contract: ".ui-craft/decisions.md — R1 z 2026-08-07, wiersz „rekord #3",
    prototype: {
      file: "v3/screens/record.css",
      lines: "389",
      value:
        "`.rc-comment-agent .rc-mark { color: var(--accent); border-color: var(--accent-edge) }`",
    },
    route: {
      surface: "projects",
      openRecord: "[data-project-row]",
      recordTab: "comments",
    },
    subject: {
      selector: '[class*="_markAgent_"]',
      why: "CSS Module class; same blue ramp as L4-03a",
      app: "packages/desktop-ui/src/record/record-comments.module.css:116-119",
    },
    read: { property: "color" },
    expect: { kind: "accent" },
    status: "enforced",
  },
  {
    id: "L4-04",
    lot: 4,
    position: 4,
    kind: "restyle",
    title: "every comment is a card, not only the agent's",
    contract: ".ui-craft/tokens.md:71-80 (Shape, motion, depth)",
    prototype: {
      file: "v3/screens/record.css",
      lines: "368-371",
      value:
        "`.rc-comment { border: 1px solid var(--border-subtle); background: var(--surface-content) }`",
    },
    route: {
      surface: "projects",
      openRecord: "[data-project-row]",
      recordTab: "comments",
    },
    subject: {
      selector: '[class*="_entry_"]',
      why: "trailing underscore keeps _entryAgent_ and _entryResolved_ out of the SELECTOR's own name; the base class declares only a transparent inline-start border, so borderTopWidth computes 0px",
      app: "packages/desktop-ui/src/record/record-comments.module.css:68-75",
    },
    read: { property: "borderTopWidth" },
    expect: { kind: "literal", value: "1px" },
    status: "enforced",
  },
  {
    id: "L4-05",
    lot: 4,
    position: 5,
    kind: "restyle",
    title: "the decision number steps up a size",
    contract: ".ui-craft/tokens.md:64-70 (Type)",
    prototype: {
      file: "v3/screens/record.css",
      lines: "55-62",
      value:
        "`.rc-fit-line { font-size: var(--text-base) }` + `.rc-fit-line b { font-size: var(--text-lg) }`",
    },
    route: { surface: "projects", openRecord: "[data-project-row]" },
    subject: {
      selector: '[class*="_fitStrong_"]',
      why: "CSS Module class; the app gives it weight and colour but NO size, so it inherits the line's --text-md",
      app: "packages/desktop-ui/src/record/project-record.module.css:201-220",
    },
    read: { property: "fontSize" },
    expect: { kind: "token", token: "--text-lg" },
    status: "enforced",
  },
  {
    id: "L4-06",
    lot: 4,
    position: 6,
    kind: "restyle",
    title: "the task's micro-heading is --text-2xs like every other one",
    contract: ".ui-craft/tokens.md:64-70 (Type)",
    prototype: {
      file: "v3/screens/record.css",
      lines: "89-92",
      value: "`.rc-doc-h { font-size: var(--text-2xs) }`",
    },
    route: { surface: "tasks", openRecord: "[data-task-row]" },
    subject: {
      selector: '[data-record-kind="task"] [class*="_docHeading_"]',
      why: "the task screen gives its micro-headings --text-xs where the family uses --text-2xs; the TOKEN --tracking-wide is deliberately not the subject (it has consumers outside this family)",
      app: "packages/desktop-ui/src/record/task-record.module.css:214-226",
    },
    read: { property: "fontSize" },
    expect: { kind: "token", token: "--text-2xs" },
    status: "enforced",
  },
  {
    id: "L4-07",
    lot: 4,
    position: 7,
    kind: "restyle",
    title: "the exit rail hangs on a negative indent",
    contract: ".ui-craft/tokens.md:55-63 (Spacing and density)",
    prototype: {
      file: "v3/screens/record.css",
      lines: "107-112",
      value:
        "`.rc-rel { padding: 0.3125rem 0.375rem; margin-left: -0.375rem }`",
    },
    route: { surface: "projects", openRecord: "[data-project-row]" },
    subject: {
      selector: '[data-record-kind="project"] [class*="_railRow_"]',
      why: "scoped by record kind because the opportunity sheet declares a _railRow_ of its own; the project sheet declares no margin, so it computes 0px",
      app: "packages/desktop-ui/src/record/project-record.module.css:416-467",
    },
    read: { property: "marginLeft" },
    expect: { kind: "rem", value: -0.375 },
    status: "enforced",
  },
  {
    id: "L4-08a",
    lot: 4,
    position: 8,
    kind: "restyle",
    title: "the record tab bar sticks",
    contract: ".ui-craft/tokens.md:71-80 (Shape, motion, depth — Z roles)",
    prototype: {
      file: "v3/app.css",
      lines: "655-658",
      value:
        "`.tabstrip { position: sticky; top: 0; z-index: var(--z-sticky) }`",
    },
    route: { surface: "projects", openRecord: "[data-project-row]" },
    subject: {
      selector: '[data-record-kind] [role="tablist"]',
      why: "declaration on both sides; the sheet declares no position, so it computes static",
      app: "packages/desktop-ui/src/record/record-tabs.module.css:11-18",
    },
    read: { property: "position" },
    // TA PARA MIERZY DEKLARACJĘ. Brief nazywa poz. 8 najgroźniejszą pozycją całej
    // fali właśnie dlatego, że `sticky` milknie BEZ BŁĘDU pod przodkiem
    // z `overflow` — i tego ta para nie zobaczy. Dowód zachowania to P7.
    //
    // ZMIERZONE PRZY ODBIORZE, 2026-08-07, I ROZSTRZYGA TO SPRAWĘ NA KORZYŚĆ
    // LOTU 4 — ale tylko na dwóch z trzech ekranów rekordu. Żywy skan P7:
    //   projects › record — pojemnik `div.work-surface.wave2-work`, HELD,
    //     przewinięte 195 z 194,6 px, `elementFromPoint` trafia `div._strip`;
    //   tasks › record — pojemnikiem jest `div.surface-scroll._tasks`, przelot
    //     poprosił o 408,1 px i dostał 0 → NOT_EXERCISED.
    // To NIE jest różnica długości treści, tylko RÓŻNICA POJEMNIKA, i jest
    // dokładnie tym, co lot 4 opisał z lektury `tasks/tasks.module.css`
    // (`overflow-x: hidden`). Ta para trafia w oba ekrany i na obu widzi tę samą
    // deklarację, więc jej zieleń nie mówi nic o ekranie zadania. Po usunięciu
    // wpisu P7-01 (podmiot JUŻ się klei) nie zostaje w drzewie NIC, co tę
    // bezwładność asertuje — jest wejściem fazy poprawek, nie długiem tej pary.
    expect: { kind: "literal", value: "sticky" },
    status: "enforced",
  },
  {
    id: "L4-08b",
    lot: 4,
    position: 8,
    kind: "restyle",
    title: "the open record tab is underlined with the accent",
    contract:
      '.ui-craft/tokens.md:212-252 (What the accent is allowed to mean — "where the reader is")',
    prototype: {
      file: "v3/app.css",
      lines: "666",
      value:
        '`.tabstrip button[aria-selected="true"] { border-bottom-color: var(--accent) }`',
    },
    route: { surface: "projects", openRecord: "[data-project-row]" },
    subject: {
      selector: '[role="tab"][data-record-tab][aria-selected="true"]',
      why: "declaration, not class name (RecordTabStrip.tsx:126-136); the app underlines with --text-primary",
      app: "packages/desktop-ui/src/record/record-tabs.module.css:48-52",
    },
    read: { property: "borderBottomColor" },
    expect: { kind: "accent" },
    status: "enforced",
  },
  {
    id: "L4-09",
    lot: 4,
    position: 9,
    kind: "restyle",
    title: "the offers are subordinate rows, not equal cards",
    contract: ".ui-craft/tokens.md:71-80 (Shape, motion, depth)",
    prototype: {
      file: "v3/screens/record.css",
      lines: "343",
      value:
        "`.rc-offers { margin: 0 0 0 var(--space-5); border-left: 1px solid var(--border-subtle) }`",
    },
    // TWO CORRECTIONS TO THIS ROUTE, AND ONLY THE SECOND IS ABOUT DATA.
    //
    // 1. `.offers` is drawn behind a TAB (`OpportunityRecordScreen.tsx:808` —
    //    `selected === "offers"`), and this route named no tab, so the pass
    //    landed on Overview and the subject was never on the page. That was
    //    read as a fixture gap for as long as the pair existed; it was a route
    //    gap. A route that stops one click short is indistinguishable from data
    //    that does not exist.
    // 2. The door is scoped to the NEGOTIATION column because
    //    `[data-pipeline-card]` alone takes the first card in the board's own
    //    order, and that order is the stage order (`commercial-defaults.ts:140`)
    //    — first column `qualification`, whose only deal carries
    //    `offerIds: []` DELIBERATELY (crm-fixture.ts:288-293: nothing is
    //    qualified, so nothing is priced). The container draws either way, so
    //    the unscoped door would have gone green over an EMPTY list — measuring
    //    the rule while the thing the rule is about was absent. `mdrDeal` sits
    //    in `negotiation` with two offers (crm-fixture.ts:247, :254).
    route: {
      surface: "pipeline",
      openRecord: '[data-pipeline-column="negotiation"] [data-pipeline-card]',
      recordTab: "offers",
    },
    subject: {
      selector: '[class*="_offers_"]',
      why: "the container, not the offer: the app makes each offer a bordered card and the container carries no rule at all, so borderLeftWidth computes 0px",
      app: "packages/desktop-ui/src/opportunity/opportunity-record.module.css:312-336",
    },
    read: { property: "borderLeftWidth" },
    expect: { kind: "literal", value: "1px" },
    status: "enforced",
  },
  {
    id: "L4-10",
    lot: 4,
    position: 10,
    kind: "restyle",
    title: "a list on a record has a container",
    contract: ".ui-craft/tokens.md:71-80 (Shape, motion, depth)",
    prototype: {
      file: "v3/screens/record.css",
      lines: "142",
      value:
        "`.rc-list { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden }`",
    },
    route: { surface: "tasks", openRecord: "[data-task-row]" },
    subject: {
      selector: '[data-record-kind="task"] [class*="_list_"]',
      why: "the app draws a bare flex column with no border",
      app: "packages/desktop-ui/src/record/task-record.module.css:271-291",
    },
    read: { property: "borderTopWidth" },
    expect: { kind: "literal", value: "1px" },
    // ŚLEPOTA POTWIERDZONA I WYCENIONA. `.list` nie jest pojemnikiem, który
    // rysuje się pusty: `TaskRecordScreen.tsx:647` montuje go dopiero przy
    // niepustym `children`, a `:682` dopiero gdy istnieje jakakolwiek zależność
    // — w obu pustych przypadkach na ekran idzie `<p class="note">`. JEDYNE
    // zadanie harnessu przeglądarkowego (`CollaborationHarness.tsx`, odczyt
    // `work.overview`) nie ma ani rodzica, ani jednej krawędzi zależności, więc
    // pojemnik nie powstaje ANI RAZU. To jest ta sama pustka, którą zmierzył
    // i opisał `task-record.module.css:302-310`.
    //
    // POPRAWKA ADRESU, I NIE JEST KOSMETYCZNA. Do tej rundy oba te zdania
    // powoływały się na `harness-snapshot.ts:112-163` („cztery zadania"). Ten
    // plik NIE ZASILA bramki układu: `main.tsx:73-75` montuje pod
    // `?surface=collaboration` `CollaborationHarness`, a ten buduje swoje
    // odczyty sam (`harness-snapshot.ts` czytają INNE harnessy `?surface=`).
    // Warunek wyjścia wskazujący na plik, którego edycja nic tu nie zmieni,
    // jest gorszy niż brak warunku — lot 4 zasiałby podzadanie i zobaczył
    // dokładnie tę samą ślepą parę.
    //
    // SPRAWDZONE, ŻE TA PARA NIE POWTÓRZY AWARII L4-11 W DNIU, W KTÓRYM
    // PRZESTANIE BYĆ ŚLEPA. `_list_` to nazwa OGÓLNA (dziewięć arkuszy modułów
    // deklaruje `.list`), więc bez przedrostka byłaby dokładnie tym samym luźnym
    // selektorem. Policzone w `packages/desktop-ui/dist/assets/*.css`: wewnątrz
    // `[data-record-kind="task"]` żyje TYLKO `_list_` z `task-record.module.css`
    // — pozostałe siedzą w Kalendarzu, Ludziach, Klientach projektu,
    // Odnowieniach, Ustawieniach, Organizacjach i dwóch listach z indeksu, a ani
    // jeden z arkuszy paneli rekordu (`record-panels`, `record-comments`,
    // `record-tabs`, `task-operations`) nie deklaruje `.list`. Ta jedna klasa
    // wisi za to na DWÓCH montażach (`:647` podzadania, `:682` zależności), więc
    // po zasianiu para może zobaczyć dwa elementy — i to jest bezpieczne, bo obie
    // instancje niosą tę samą regułę, czyli tę samą wartość.
    // ŚLEPOTA ZDJĘTA 2026-08-07, PO SPEŁNIENIU WARUNKU WYJŚCIA. Lot 4 dosiał
    // dokładnie to, o co ten wpis prosił, i najtańszym z dwóch wariantów: JEDNĄ
    // krawędź `task_depends_on_task` w `CollaborationHarness.tsx` (celowo do
    // zadania spoza tej projekcji, więc rysuje się zdegradowany wiersz
    // `data-record-row` i NIE przybywa wiersza w kolekcji Zadań). Pojemnik
    // powstaje, para wróciła z pomiarem (1px, oba motywy), a razem z nią
    // domknął się zmierzony brak „zero [data-record-row]" z `task-record.module.css`.
    status: "enforced",
  },
  {
    id: "L4-11",
    lot: 4,
    position: 11,
    kind: "restyle",
    title: "the composition bar is 5px, not 8px",
    contract: ".ui-craft/tokens.md:55-63 (Spacing and density)",
    prototype: {
      file: "v3/screens/projects.css",
      lines: "25-28",
      value: "`.pj-bar { height: 5px; border-radius: 3px }`",
    },
    route: { surface: "projects", openRecord: "[data-project-row]" },
    subject: {
      selector: '[data-record-kind="project"] [class*="_bar_"][role="img"]',
      // WARTOŚĆ W PIKSELACH, NIE W REM, BO V3 DEKLARUJE PIKSELE. Rodzaj `rem`
      // przeliczyłby oczekiwanie przez żywy rozmiar pisma korzenia i przy
      // skalowaniu tekstu mówiłby o czymś, czego v3 nie mówi.
      //
      // `[role="img"]` NIE JEST OSTROŻNOŚCIĄ — JEST POPRAWKĄ ZMIERZONEJ AWARII.
      // Sam `[class*="_bar_"]` trafiał w CZTERY narysowane elementy o DWÓCH
      // wysokościach (8 px i 10 px), więc para wracała NOT_MEASURED i nie umiała
      // powiedzieć, co osadziła. Przyczyna: legenda dokłada klasę SEGMENTU do
      // swojej próbki koloru — `ProjectRecordOverview.tsx:468` pisze na jednym
      // węźle „styles.swatch" ORAZ „styles.bar_<segment>", a `.swatch` ma
      // 0,625 rem = 10 px (`project-record.module.css:287-292`).
      //
      // TO NIE JEST WADA APLIKACJI I NIE WOLNO JEJ TU „NAPRAWIAĆ": prototyp robi
      // dokładnie to samo — `v3/screens/projects.css:29` daje `.pj-seg` sto
      // procent wysokości paska, a `:238` przestawia TĘ SAMĄ klasę w legendzie
      // na 0,625 rem. Wysokość i zaokrąglenie z pozycji #11 siedzą WYŁĄCZNIE na
      // pojemniku, a pojemnik jest jedynym `role="img"` w tym poddrzewie
      // (`ProjectRecordOverview.tsx:82-86`, gdzie `aria-label` niesie całe
      // zdanie o składzie pracy, więc ta deklaracja jest nośna, nie ozdobna).
      //
      // FAKT O DZISIEJSZEJ FIKSTURZE, ZMIERZONY PRZY OKAZJI: cztery trafienia
      // to pojemnik + TRZY próbki legendy, czyli pasek nie rysuje ANI JEDNEGO
      // segmentu — żadne zadanie harnessu nie wisi przy projekcie
      // (`CollaborationHarness.tsx`, odczyt `project.operationalOverview`,
      // `relatedTasks: []`; adres `harness-snapshot.ts:112-163`, który stał tu
      // wcześniej, wskazywał plik, którego ta bramka nie montuje). Ta para
      // tego nie potrzebuje (pojemnik
      // rysuje się bezwarunkowo), ale NIC w mapie nie mierzy dziś geometrii
      // segmentu.
      why: 'the composition bar CONTAINER only: it is the sole role=img in the project record (ProjectRecordOverview.tsx:82-86) and the only node the 5px/3px rule lands on; the legend swatch wears the same _bar_<segment> class at 0.625rem (ProjectRecordOverview.tsx:468), which is what made the bare [class*="_bar_"] read two heights and measure nothing',
      app: "packages/desktop-ui/src/record/project-record.module.css:230-237 (container), :287-292 (the legend swatch this selector must NOT sweep in)",
    },
    read: { property: "height" },
    expect: { kind: "literal", value: "5px" },
    status: "enforced",
  },
  {
    id: "L4-12",
    lot: 4,
    position: 12,
    kind: "restyle",
    title: "the record family has ONE reading measure",
    contract: ".ui-craft/tokens.md:55-63 (Spacing and density)",
    prototype: {
      file: "v3/screens/record.css",
      lines: "93",
      value: "`.rc-prose { max-width: var(--surface-read) }`",
    },
    route: { surface: "tasks", openRecord: "[data-task-row]" },
    subject: {
      selector: '[data-record-kind="task"] [class*="_prose_"]',
      why: "the task sheet pins 68ch in three places while the rest of the family uses the token",
      app: "packages/desktop-ui/src/record/task-record.module.css:241",
    },
    read: { property: "maxWidth" },
    expect: { kind: "token", token: "--surface-read" },
    status: "enforced",
  },

  // ══ LOT 5 — LIBRARY ═══════════════════════════════════════════════════════
  // Trasa bazowa: klik `.nav-item[data-surface="library"]` (ląduje na odczycie
  // „notes"). Pary źródeł dokładają klik `[data-layout="sources"]`
  // (`library/library-readings.ts:15-19` — słownik odczytów jest zamknięty
  // i przełącznik czyta z niego kolejność).
  {
    id: "L5-01",
    lot: 5,
    position: 1,
    kind: "restyle",
    title: "the selected note row stops painting a literal shadow",
    contract:
      ".ui-craft/tokens.md:71-80 (Shape, motion, depth — elevation roles)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "145-150",
      value:
        '`.kn-row[aria-selected="true"] { background: var(--accent-quieter) }` — zaznaczenie niesie TŁO i KRAWĘDŹ, żadnego cienia',
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: ".knowledge-document-list li button.active",
      why: "global class in styles.css (NOT a CSS Module), named by Faza 2 as an open debt: the literal `inset 2px 0` shadow outranks and erases the focus ring",
      app: "packages/desktop-ui/src/styles.css:6563-6566, :597-601",
    },
    read: { property: "boxShadow" },
    expect: { kind: "literal", value: "none" },
    status: "pending: LOT 5",
  },
  {
    id: "L5-02",
    lot: 5,
    position: 2,
    kind: "restyle",
    title: "the note row is a grid with its own date lane",
    contract: ".ui-craft/tokens.md:55-63 (Spacing and density)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "138-143, 175-178",
      value:
        "`.kn-row { display: grid }` + `.kn-row-when { margin-left: auto; flex: none }`",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: ".knowledge-document-list li button",
      why: "global class; the app lays the row out as a flex row with space-between, which is why the date is the thing that ellipses",
      app: "packages/desktop-ui/src/styles.css:6547-6559",
    },
    read: { property: "display" },
    expect: { kind: "literal", value: "grid" },
    status: "pending: LOT 5",
  },
  {
    id: "L5-03a",
    lot: 5,
    position: 3,
    kind: "restyle",
    title: "the knowledge welcome heading declares a size",
    // TO JEST DOKŁADNIE TA WADA, DLA KTÓREJ ZBUDOWANO SONDĘ TYTUŁU — i obie
    // siedzą poza jej podmiotem, bo `TITLE_SELECTOR` to `#surface-title`.
    contract: ".ui-craft/tokens.md:64-70 (Type)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "242-245",
      value:
        "`.kn-reader-title { font-size: var(--text-xl); font-weight: 600 }`",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: ".knowledge-welcome h2",
      why: "global class; the rule declares margin and colour and NO size, so the heading falls back to the user-agent 1.5em",
      app: "packages/desktop-ui/src/styles.css:6948-6951",
    },
    read: { property: "fontSize" },
    expect: { kind: "token", token: "--text-xl" },
    // MIERZONE, NIE PRZECZUTE: „jeżeli harness ląduje na otwartej notatce"
    // z poprzedniej wersji tego pola opisywało możliwość. To nie jest
    // możliwość — to jedyne zachowanie tego ekranu. `NotesReading.tsx:189-195`
    // NIE MA stanu „nic nie otwarte": kiedy `selectedId` niczego nie trafia,
    // otwiera się NAJŚWIEŻSZA notatka z widoku, a `.knowledge-welcome` jest
    // gałęzią `else` (`:571`), do której da się dojść tylko przez PUSTY
    // `inView`. Fikstura z notatkami nigdy tam nie trafi, a fikstura bez
    // notatek zabiera podmiot L5-01, L5-02, L5-04, L5-05, L5-07 i L5-08 na tym
    // samym przystanku. To nie jest brak danych, tylko dwa stany tego samego
    // ekranu, których jedna fikstura nie trzyma naraz.
    blind:
      "fixture: „.knowledge-welcome" +
      "” to gałąź pustego widoku, a `NotesReading.tsx:189-195` zawsze otwiera najświeższą notatkę " +
      "z zaznaczonego węzła — pustego `inView` NIE DA SIĘ osiągnąć na fiksturze, która ma notatki, " +
      "a te są podmiotem sześciu innych par na TYM SAMYM przystanku. " +
      "WYJŚCIE JEST DWUCZĘŚCIOWE I ZMIERZONE, należy do LOTU 5: (1) folder-liść NAJWYŻSZEGO poziomu " +
      "bez notatek w `library-fixture.ts:280` — `notesInSelection` bierze CAŁE poddrzewo " +
      "(`folder-tree.ts:202-217`), więc folder z dziećmi nie wystarczy; (2) krok trasy klikający " +
      '`[data-tree-key="<id>"]` (`FolderTree.tsx:189`) w `walkRouteInPage`, DOPISANY DO `routeKey` — ' +
      "bez tego przystanek zleje się z „library | notes | - | -” i para dalej nie zmierzy nic",
    status: "pending: LOT 5",
  },
  {
    id: "L5-03b",
    lot: 5,
    position: 3,
    kind: "restyle",
    title: "the sources welcome heading declares a size",
    contract: ".ui-craft/tokens.md:64-70 (Type)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "242-245",
      value: "`.kn-reader-title { font-size: var(--text-xl) }`",
    },
    route: { surface: "library", layout: "sources" },
    subject: {
      selector: '[class*="_welcome_"] h3',
      why: "CSS Module class; same defect as L5-03a on the other reading",
      app: "packages/desktop-ui/src/library/sources.module.css:390-393",
    },
    read: { property: "fontSize" },
    expect: { kind: "token", token: "--text-xl" },
    // TEN SAM KSZTAŁT, CO L5-03a, I O JEDEN STOPIEŃ GORSZY — bo tu nie pomoże
    // nawet nowy krok trasy. Odczyt Źródeł nie ma ANI filtra, ANI odznaczenia:
    // `selected` to `find(selectedSourceId) ?? firstSourceInRenderOrder(sources)`
    // (`SourcesReading.tsx:325-327`), a `setSelectedSourceId` nigdy nie dostaje
    // `undefined` (`:329-331`, `:443`). Powitanie rysuje się WYŁĄCZNIE przy
    // zerowej liczbie źródeł w całej przestrzeni, a trzy inne pary na tym
    // przystanku (L5-06, L5-09, L5-10) czytają wiersze źródeł.
    blind:
      'fixture: „[class*="_welcome_"]' +
      "” w Źródłach rysuje się TYLKO przy `sources.length === 0` (SourcesReading.tsx:325-327, 455), " +
      "a odczyt nie ma ani filtra, ani sposobu odznaczenia — więc żaden krok trasy tam nie dojdzie. " +
      "Pusta lista źródeł zabiera z kolei podmiot L5-06, L5-09 i L5-10 na TYM SAMYM przystanku. " +
      "WYJŚCIE JEST WYBOREM, nie linijką, i należy do LOTU 5: albo ekran dostaje afordancję " +
      "zamykającą czytelnię (wtedy wystarczy krok trasy, jak w L5-03a), albo przelot dostaje DRUGĄ " +
      "fiksturę pustej przestrzeni pod osobnym adresem harnessu — dziś `verify-renderer-layout.mjs` " +
      "robi jedno `goto` na motyw i chodzi po przystankach w jednej aplikacji",
    status: "pending: LOT 5",
  },
  {
    id: "L5-04",
    lot: 5,
    position: 4,
    kind: "restyle",
    title: "the panel heading declares a weight",
    contract: ".ui-craft/tokens.md:64-70 (Type)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "92-97",
      value: "`.kn-side-head { font-weight: 600 }`",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: '[class*="_panelHead_"] h2',
      why: "the sheet declares size and colour but no weight, and this package has no heading reset (styles.css:1 is only box-sizing), so the heading computes the user-agent 700",
      app: "packages/desktop-ui/src/library/notes.module.css:79-86",
    },
    read: { property: "fontWeight" },
    expect: { kind: "literal", value: "600" },
    status: "pending: LOT 5",
  },
  {
    id: "L5-05",
    lot: 5,
    position: 5,
    kind: "restyle",
    title: "the selected folder takes the accent",
    contract: ".ui-craft/decisions.md — R1 z 2026-08-07, wiersz „Library #5",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "46-48",
      value:
        "`.kn-tnode--on { background: var(--accent-quieter); border-left-color: var(--accent) }`",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: '[class*="_treeNodeSelected_"]',
      why: "CSS Module class; the app paints var(--surface-selected), which Faza 1 fixed as the NEUTRAL selection — the ruling moves this one node out of that rule and nothing else",
      app: "packages/desktop-ui/src/library/notes.module.css:130-134",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "token", token: "--accent-quieter" },
    status: "pending: LOT 5",
  },
  {
    id: "L5-06",
    lot: 5,
    position: 6,
    kind: "prescribed",
    title: '"What rests on this" says what kind of record each line is',
    contract: ".ui-craft/tokens.md:127-140 (Component layer)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "409-414",
      value: "`.kn-ref-ico` — kwadrat 1.5rem z glifem rodzaju rekordu",
    },
    route: { surface: "library", layout: "sources" },
    subject: {
      selector: '[class*="_restsList_"] svg',
      why: "counted; the app renders bare titles. The count does NOT prescribe the arrow — the brief calls an exit with nowhere to go a lying affordance",
      app: "packages/desktop-ui/src/library/sources.module.css:325-345",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 1 },
    status: "pending: LOT 5",
  },
  {
    id: "L5-07",
    lot: 5,
    position: 7,
    kind: "restyle",
    title: "the arrangement switcher gets a sunken track",
    contract: ".ui-craft/tokens.md:83-98 (Dark theme — four surface planes)",
    prototype: {
      file: "v3/app.css",
      lines: "336-339",
      value: "`.segmented { background: var(--surface-sunken); padding: 2px }`",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: '[class*="_arrangement_"]',
      why: "CSS Module class; the app draws a pill outline with a transparent inside",
      app: "packages/desktop-ui/src/library/notes.module.css:170-178",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "token", token: "--surface-sunken" },
    note:
      "JEŻDŻĄCY KCIUK NIE MA TU PARY, świadomie: brief zostawia lotowi decyzję „albo kciuk znika przy " +
      "zawinięciu, albo tor przestaje się zawijać”, a `.arrangement` ma `flex-wrap: wrap` postawiony " +
      "celowo pod 300% tekstu. Para na kciuka narzucałaby rozstrzygnięcie tej decyzji.",
    status: "pending: LOT 5",
  },
  {
    id: "L5-08",
    lot: 5,
    position: 8,
    kind: "prescribed",
    title: "the folder tree draws folders",
    contract: ".ui-craft/tokens.md:127-140 (Component layer)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "52-53",
      value: "`.kn-tglyph svg { width: 0.8125rem; height: 0.8125rem }`",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: '[class*="_treeNode_"] svg',
      why: "counted; the app types ▾/▸ as text (FolderTree.tsx:228-232). The trailing underscore keeps _treeNodeSelected_ and _treeNodeLoose_ out of the selector's own name, and the base class is on every node anyway",
      app: "packages/desktop-ui/src/library/notes.module.css:104-118",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 1 },
    risk: 'czwarty tor w panelu `minmax(0, 13rem)` przy wcięciu `calc(… + depth * 0.6875rem)` to realne ryzyko przelewu przy 300% tekstu — ta pozycja MA własny przyrząd (descendant-overflow.mjs + przelot „Library at 300% text") i ta para go nie zastępuje',
    status: "pending: LOT 5",
  },
  {
    id: "L5-09",
    lot: 5,
    position: 9,
    kind: "restyle",
    title: "the selected source row stops painting a literal shadow",
    contract:
      ".ui-craft/tokens.md:71-80 (Shape, motion, depth — elevation roles)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "145-150",
      value: "to samo, co L5-01 — zaznaczenie bez cienia",
    },
    route: { surface: "library", layout: "sources" },
    subject: {
      selector: '[role="option"][class*="_rowSelected_"]',
      why: "CSS Module twin of L5-01, narrowed by role=option (SourcesReading.tsx:99) because EIGHT distinct _rowSelected_ classes exist across the built chunks; it is a Tab stop (hooks/useListNavigation.ts:54), so the erased focus ring is reachable",
      app: "packages/desktop-ui/src/library/sources.module.css:132-135",
    },
    read: { property: "boxShadow" },
    expect: { kind: "literal", value: "none" },
    status: "pending: LOT 5",
  },
  {
    id: "L5-10",
    lot: 5,
    position: 10,
    kind: "restyle",
    title: "the Available badge declares its own text colour",
    // TA POZYCJA JEST PRZYKŁADEM Z SEKCJI P5 BRIEFU: konsument używa POŁOWY pary
    // status-*, a komentarz nad nim twierdzi, że używa całej. Bramka kontrastu
    // mierzy pary TOKENÓW, więc jest na to ślepa.
    contract: ".ui-craft/tokens.md:127-140 (Component layer — status-*)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "444",
      value: "`.kn-avail--ok { color: var(--status-success); … }`",
    },
    route: { surface: "library", layout: "sources" },
    subject: {
      selector: '[class*="_badge_available_"]',
      why: "CSS Module class; the rule declares border-color and background and NO colour, so the text inherits whatever the row gives it",
      app: "packages/desktop-ui/src/library/sources.module.css:194-197",
    },
    read: { property: "color" },
    expect: { kind: "token", token: "--status-success" },
    status: "pending: LOT 5",
  },

  // ══ LOT 6 — SETTINGS ══════════════════════════════════════════════════════
  // Trasa całego lotu: klik `[data-settings-entry]`. Wejście PODMIENIA lewą
  // kolumnę, więc ten cel idzie OSTATNI albo trzeba z niego wyjść przez
  // `[data-settings-back]` — inaczej pozycja nawigacji następnego celu przestaje
  // istnieć i przelot zmierzy Ustawienia pod cudzą etykietą.
  {
    id: "L6-02",
    lot: 6,
    position: 2,
    kind: "prescribed",
    title: "there is ONE settings navigator, and it is the mode column",
    contract: ".ui-craft/tokens.md:127-140 (Component layer — shell-*)",
    prototype: {
      file: "v3/screens/settings.css",
      lines: "36-80",
      value:
        "`.st-nav` — jedna kolumna sekcji, bez drugiego nawigatora w treści",
    },
    route: { settingsMode: true },
    subject: {
      selector: ".settings-navigator",
      why: "counted at zero: the brief's hard condition is that aria-current moves ONTO .settings-mode-column and the in-content navigator goes away, in the same commit as five test files",
      app: "packages/desktop-ui/src/SettingsSurface.tsx:981-1000, styles.css:7658-7712",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    risk: "TO JEST ZAŁOŻENIE O KSZTAŁCIE, NIE POMIAR: brief mówi „trzy nawigatory zamiast jednego” i wskazuje przeprowadzkę `aria-current`, ale nie deklaruje, KTÓRY z trzech zostaje. Jeśli lot zostawi nawigator w treści i skasuje inny, ta para skłamie w obie strony.",
    status: "pending: LOT 6",
  },
  {
    id: "L6-03",
    lot: 6,
    position: 3,
    kind: "restyle",
    title: "the mode column stops wrapping its labels",
    // POZYCJA WYPROWADZONA Z KASKADY, NIE Z RENDERA (brief zabraniał lotowi
    // rekonesansu przeglądarki). `.settings-mode-column` nie ma w `styles.css`
    // ANI JEDNEJ reguły — sprawdzone grepem — więc etykieta dziedziczy siatkę
    // `.nav-item` z torem ikony, a `nowrap` celuje w `nth-child(2)`, którego ta
    // kolumna nie renderuje.
    contract: ".ui-craft/tokens.md:55-63 (Spacing and density)",
    prototype: {
      file: "v3/screens/settings.css",
      lines: "61-80",
      value: "`.st-nav-item` — własna siatka, etykieta w swoim torze",
    },
    route: { settingsMode: true },
    subject: {
      selector: ".settings-mode-section",
      why: "global class in RealApp.tsx:3275; styles.css has NO rule naming .settings-mode-column or .settings-mode-section at all",
      app: "packages/desktop-ui/src/RealApp.tsx:3186-3203, styles.css:1122-1126",
    },
    read: { property: "whiteSpace" },
    expect: { kind: "literal", value: "nowrap" },
    status: "pending: LOT 6",
  },
  {
    id: "L6-04",
    lot: 6,
    position: 4,
    kind: "restyle",
    title: "the two named settings actions are filled with the accent",
    contract:
      '.ui-craft/tokens.md:212-252 (What the accent is allowed to mean — "what is primary")',
    prototype: {
      file: "v3/app.css",
      lines: "321-332",
      value:
        "`.btn.primary` (gradient a-400/a-500/a-600), wybrany w v3/screens/settings.js:812 " +
        "dla „Choose a vault folder…” i :779 dla „Import N notes”",
    },
    route: { settingsMode: true },
    subject: {
      // ZAOSTRZONE PO ZMIERZONEJ AWARII ROUTED_PENDING_ALREADY_MATCHES.
      // Poprzednia wersja pytała `.settings-control button` o „przynajmniej
      // jeden akcent na ekranie" i PRZECHODZIŁA JUŻ DZIŚ — nie dlatego, że lot 6
      // cokolwiek oddał, tylko dlatego, że akcent na tym ekranie jest od dawna:
      // `styles.css:8203-8209` maluje `.settings-control.support-report-action >
      // button` farbą `--action-primary-bg`. Czyli oczekiwanie było napisane
      // tak, że NIGDY NIC BY NIE ZMIERZYŁO.
      //
      // ZDANIE BRIEFU (wiersz 427) „na całym ekranie nie ma ani jednego piksela
      // akcentu" JEST DZIŚ NIEPRAWDZIWE, i lot 6 planuje przeciwko niemu.
      // Prawdziwa pozycja #4 stoi wyżej w tym samym briefie (wiersze 100-104):
      // akcent ma trafić na DWA KONKRETNE przyciski. Więc para pyta o nie i tylko
      // o nie — oba niosą własną deklarację danych, więc podmiot nie zależy od
      // nazwy klasy modułu ani od kolejności sekcji.
      //
      // ODWZOROWANIE V3↔APLIKACJA NIE JEST 1:1 I NIE UDAJE, ŻE JEST. Zgadza się
      // JEDEN przycisk: „Choose a vault folder…" (v3/screens/settings.js:812 ↔
      // `data-notes-import-scan`). Drugi akcent v3 to „Import N notes" (:779),
      // któremu odpowiada `data-notes-import-run` (SettingsSurface.tsx:2311) —
      // a ten montuje się DOPIERO po skanie, więc w tym harnessie byłby ślepy.
      // Akcent na „Export to Markdown…" bierze się więc Z BRIEFU (wiersze
      // 100-104), nie z prototypu, i jest tu zapisany jako taki. Kto uzna to za
      // za dużo, zmienia brief — nie tę parę po cichu.
      selector:
        ".settings-control button[data-notes-export], " +
        ".settings-control button[data-notes-import-scan]",
      why: "the two buttons Settings #4 names (SettingsSurface.tsx:2159-2166 export to Markdown, :2229-2238 choose a vault folder); both are painted today by the generic .settings-control button rule (styles.css:8138-8150 → --action-secondary-bg), so 0 of 2 carry the accent and the pending entry can fail",
      app: "packages/desktop-ui/src/styles.css:8138-8150 (today's secondary paint), :8203-8209 (the accent that already exists on this screen and made the loose version pass), SettingsSurface.tsx:2159-2166, :2229-2238",
    },
    read: { property: "paint" },
    expect: { kind: "accentCount", atLeast: 2 },
    risk: "TA PARA WCIĄŻ NIE ODRÓŻNIA POPRAWKI POPRAWNEJ OD ZAKAZANEJ, i to jest zapisane, nie przeoczone: pomalowanie akcentem CAŁEJ reguły `.settings-control button` — którą brief nazywa wprost („zaspokoi oko i nie da sondzie NIC”) — pomaluje też te dwa przyciski i zaliczy tę parę. Zawężenie kupuje co innego: para mierzy TERAZ COKOLWIEK (przedtem przechodziła na akcencie raportu wsparcia, którego pozycja #4 w ogóle nie dotyczy). Dowód dostawy niesie `actionSelectors` sondy wierności, nie ta para.",
    status: "pending: LOT 6",
  },
  {
    id: "L6-05",
    lot: 6,
    position: 5,
    kind: "restyle",
    title: "the explanation takes a reading measure instead of a column",
    contract: ".ui-craft/tokens.md:55-63 (Spacing and density)",
    prototype: {
      file: "v3/screens/settings.css",
      lines: "199-204",
      value:
        "`.st-field-n { margin-top: 0.4375rem; max-width: var(--surface-read) }` — linijka PRZY kontrolce",
    },
    route: { settingsMode: true },
    subject: {
      selector: ".settings-copy > p",
      why: "global class; today the prose sits in a 1fr track beside a 21rem control track (styles.css:7730-7736) and declares no measure of its own",
      app: "packages/desktop-ui/src/styles.css:7748-7753",
    },
    read: { property: "maxWidth" },
    expect: { kind: "token", token: "--surface-read" },
    risk: "jeżeli lot przeniesie wyjaśnienie pod kontrolkę POD NOWĄ KLASĄ, `.settings-copy > p` przestanie istnieć i para wróci NOT_MEASURED zamiast MATCH — to jest ta sama pułapka, dla której L1-14 nie dostała pary",
    status: "pending: LOT 6",
  },
];

/**
 * POZYCJE LOTÓW 2-6 BEZ PARY. Ta lista jest deliverable równym mapie: mówi
 * lotom, GDZIE nie ma dowodu, i mówi to ZANIM lot odda robotę.
 */
export const VISUAL_LANGUAGE_ROUTED_NOT_COVERED = [
  {
    lot: 2,
    position: 1,
    scope: "cała pozycja",
    title: "dragging a card changes nothing on the screen",
    prototype:
      "v3/screens/pipeline.css:55-56, :110 (`.pp-col:has(.drop-target)`, `.pp-card.dragging`)",
    app: "packages/desktop-ui/src/pipeline/PipelineSurface.tsx:433-445, :1003-1005",
    why:
      "Obie połowy tej pozycji istnieją WYŁĄCZNIE w trakcie gestu: cel upuszczenia zapala się na " +
      "`dragover`, a przygaszenie karty na `dragstart`. Przelot par czyta STATYCZNY stan strony i nie " +
      "wysyła zdarzeń wskaźnika; para napisana na `[data-drop-target]` liczyłaby zero zawsze i po " +
      "poprawce też. Syntetyczny gest przeciągania to osobny przyrząd, nie ten.",
    greenWrong:
      "Lot może zbudować cel upuszczenia w dowolnym kolorze albo nie zbudować go wcale.",
  },
  {
    lot: 2,
    position: 4,
    scope: "połowa pozycji — uniesienie pod kursorem",
    title: "the card lifts under the cursor",
    prototype:
      "v3/screens/pipeline.css:108 (`.pp-card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px) }`)",
    app: "packages/desktop-ui/src/pipeline/pipeline.module.css:338-340",
    why:
      "Ten sam powód, co przy hoverze doku przechwytywania w Locie 1: stanu `:hover` nie da się wymusić " +
      "z `page.evaluate`, a `page.hover()` przechodzi przez trafienie kursorem. Cień spoczynkowy MA parę " +
      "(L2-04); uniesienie nie ma.",
    greenWrong: "Hover karty może zostać bez zmiany.",
  },
  {
    lot: 4,
    position: 9,
    scope: "połowa pozycji — kolory stanów oferty",
    title: "offer states are told apart by colour",
    prototype:
      "v3/screens/record.css:354-356 (`.rc-offer-accepted`, `.rc-offer-submitted`, `.rc-offer-declined`)",
    app: "packages/desktop-ui/src/opportunity/opportunity-record.module.css:355-359",
    why:
      "Każdy stan ma INNY kolor docelowy, a wszystkie trzy renderują się na jednym ekranie pod tym samym " +
      "selektorem `_offerState_`. Dziś dają jedną wartość (wszystkie `--text-tertiary`), więc para " +
      "byłaby mierzalna — ale PO poprawce dałyby trzy różne wartości i przelot zwróciłby " +
      "„kilka różnych wartości”, czyli NOT_MEASURED. Para, która po oddaniu lotu staje się awarią " +
      "przyrządu, jest gorsza niż jej brak. Właściwym przyrządem jest tu R5 (pary w " +
      "`status-contrast.test.mjs`), bo to są `--status-*`, nie akcent.",
    greenWrong: "Trzy stany oferty mogą zostać nierozróżnialne kolorem.",
  },
  {
    lot: 5,
    position: 11,
    scope: "cała pozycja",
    title: "counters are outlined pills instead of a flat tabular number",
    prototype: "v3/screens/knowledge.css:65-68, :98-102 (`.kn-tn`, `.kn-n`)",
    app: "packages/desktop-ui/src/styles.css:6361-6373 (`.library-count`)",
    why:
      "Reguła jest GLOBALNA i dzielona z `.section-heading-row > span` oraz " +
      "`.library-section-heading > span`, a brief zabrania jej ruszać: lekarstwem ma być zawężenie NOWĄ " +
      "klasą modułową. Każdy selektor, który umiem napisać dziś, mierzy albo tę globalną regułę (której " +
      "lot NIE MA prawa zmienić — para zostałaby DIFFERS na zawsze), albo klasę, której jeszcze nie ma " +
      "(para wróciłaby NOT_MEASURED). Nazwy tej klasy mapa nie ma prawa wymyślić.",
    greenWrong:
      "Liczniki w Bibliotece mogą zostać obwiedzionymi pigułkami albo dostać dowolny inny kształt.",
  },
  {
    lot: 5,
    position: 12,
    scope: "cała pozycja",
    title: "the note row has no slot for a two-line excerpt",
    prototype: "v3/screens/knowledge.css:158-161 (`.kn-row-excerpt`)",
    app: "packages/desktop-ui/src/styles.css:6474-6489, NotesReading.tsx:474-498",
    why:
      "Brief wyjmuje tę pozycję z zakresu lotu WPROST: „nie buduje slotu urywka pod puste dane (poz. 12 " +
      "czeka na dane)”. Projekcja nie niesie urywka (załącznik A). Para asertowałaby robotę, której lot " +
      "ma świadomie nie zrobić — i to jest dokładnie ta klasa błędu, którą pamięć projektu nazywa " +
      "„pusta fikstura chroni fałszywą asercję”.",
    greenWrong: "Nic — pozycja jest świadomie odłożona, nie pominięta.",
  },
  {
    lot: 6,
    position: 1,
    scope: "cała pozycja",
    title: "the settings header is a four-fold column, not a band",
    prototype: "v3/screens/settings.css:84-94, :196-198, :325-330",
    app: "packages/desktop-ui/src/SettingsSurface.tsx:945-961, styles.css:7444, :7453-7455",
    why:
      "Pozycja jest PRZEBUDOWĄ nagłówka w pasmo z policzonym podtytułem. Nie ma jednej rozwiązanej " +
      "właściwości, która odróżnia „pasmo” od „kolumny”: każda, którą umiem napisać (wysokość, liczba " +
      "torów siatki), byłaby wpisaną liczbą narzucającą lotowi znaczniki. Policzony podtytuł jest poza " +
      "tym DANĄ, nie farbą. Pozycja jest natomiast przypięta cudzą asercją " +
      '(`settings-navigation-contract.test.ts:136` liczy wystąpienia `className="settings-help-entry"`), ' +
      "więc złamanie jest do zaplanowania, nie do zmierzenia tutaj.",
    greenWrong: "Nagłówek może zostać kolumną i dostać wyłącznie inne odstępy.",
  },
  {
    lot: 6,
    position: 6,
    scope: "cała pozycja",
    title: "24 buttons instead of one action bar on selection",
    prototype: "v3/screens/settings.css:113-138, :162-175",
    app: "packages/desktop-ui/src/settings/CommercialDefaultsSection.tsx:206-296",
    why:
      "Docelowy kształt to „jeden pas akcji na zaznaczeniu”. Słownik `expect` zna `count` z `atLeast` " +
      "i `equals` — nie zna „mniej niż”, więc „dwadzieścia cztery przyciski mają zniknąć” nie da się " +
      "zapisać bez wpisania liczby, która zależy od liczby etapów w fiksturze. Każda taka liczba jest " +
      "artefaktem danych testowych, nie faktem o projekcie.",
    greenWrong:
      "Wiersz etapu może zostać z kompletem przycisków i dostać tylko inne odstępy.",
  },
  {
    lot: 6,
    position: 7,
    scope: "cała pozycja",
    title: "a number that does not say what it does",
    prototype: "v3/screens/settings.css:206-218 (`.st-effect`)",
    app: "packages/desktop-ui/src/settings/CommercialDefaultsSection.tsx:325-356, WorkingDaySection.tsx:120-138",
    why:
      "Ta pozycja dowozi POLICZONY SKUTEK pod polem — czyli treść, nie farbę. Selektor na `.st-effect` " +
      "aplikacja dostanie dopiero od lotu, a liczba w środku musi być poprawna (brief: „25% narzutu = " +
      "20% marży” jest dokładne, 33% narzutu to 24,8…% marży). Para na obecność pudełka przeszłaby " +
      "na zielono nad pudełkiem z KŁAMIĄCĄ liczbą — czyli mierzyłaby OBECNOŚĆ cechy zamiast jej JAKOŚCI.",
    greenWrong: "Skutek liczby może zostać niepoliczony albo policzony źle.",
  },
  {
    lot: 6,
    position: 8,
    scope: "cała pozycja",
    title: "--row-height still has no consumer in Settings",
    prototype: "v3/screens/settings.css:113-118, :343-347, :435-439",
    app: "packages/desktop-ui/src/styles.css:7521-7546, tokens.css:715",
    why:
      "Brief nazywa TOKEN, ale nie nazywa KONSUMENTA. Dwaj oczywiści kandydaci niosą próg dostępności " +
      "2,75 rem, którego lot ma NIE zjeżdżać (`.settings-help-entry`, picker) — a `--row-height` to " +
      "2,125 rem, czyli para na którymkolwiek z nich asertowałaby złamanie tamtego progu. Wskazanie " +
      "trzeciego elementu byłoby wymyśleniem konsumenta za lot.",
    greenWrong:
      "Token może zostać bez konsumenta, dokładnie tak jak jest dziś.",
  },
];

/**
 * KSIĘGOWOŚĆ MAPY TRASOWANEJ, EGZEKWOWANA. Kontrola, o którą ten blok prosił,
 * już istnieje: `auditRoutedMap` w `verify-renderer-layout.mjs` czyta `pairs`,
 * `notCovered`, `blind` i `lots`, i rzuca `ROUTED_COUNT_DRIFT`,
 * `ROUTED_LOT_DRIFT`, `ROUTED_POSITION_DRIFT`, `ROUTED_POSITION_CONTRADICTION`
 * i `ROUTED_POSITION_GAP`. Zdanie „dziś NIC jej nie sprawdza" stało tu jeszcze
 * przy odbiorze lotów 2-4 i było nieprawdą o jeden lot nasady — przepisane
 * 2026-08-07, w tym samym przebiegu, w którym `blind` zeszło z 5 na 2.
 *
 * Sens liczb się nie zmienia: suma pozycji z parą i pozycji jawnie nieobjętych
 * MUSI się zgadzać z liczbą pozycji w briefie, inaczej pozycja wypada z OBU
 * list naraz. `status` NIE JEST tu liczony i to jest świadome — mapa trasowana
 * nie deklaruje podziału enforced/pending, bo lot oddaje CAŁE swoje pozycje
 * naraz, a nie po kawałku (mapa Lotu 1 ma ten podział z odwrotnego powodu:
 * dwie jej pozycje zostały świadomie nieoddane).
 */
export const VISUAL_LANGUAGE_ROUTED_EXPECTED = {
  pairs: 57,
  notCovered: 9,
  // Pary, których NIE DA SIĘ zmierzyć nawet po dodaniu tras, dopóki harness nie
  // dostanie drugiego zestawu danych (brief §4, „Osobno").
  //
  // 3 → 5, i przyrost jest ZAMIANĄ, nie rozluźnieniem. L5-03a i L5-03b wracały
  // dotąd jako NOT_MEASURED — czyli jako AWARIA PRZYRZĄDU, której przyczyną
  // była w obu razach ta sama rzecz: powitanie rysuje się WYŁĄCZNIE w stanie
  // pustym, a ten sam przystanek trzyma sześć (notatki) i trzy (źródła) pary
  // czytające stan NIEPUSTY. Czerwień, której nie da się usunąć naprawą kodu,
  // przestaje być sygnałem; zapisany warunek wyjścia zostaje. Sześć pozostałych
  // par z tej samej rundy zamknięto ODWROTNIE — fikstura zaczęła rysować ich
  // podmioty — i to jest różnica między „nie ma danych" a „nie ma stanu".
  //
  // 5 → 2 PRZY ODBIORZE LOTÓW 2-4, 2026-08-07, I TO JEST SPŁATA, NIE
  // ROZLUŹNIENIE. Trzy z pięciu ślepych par miały wpisany WARUNEK WYJŚCIA
  // i wszystkie trzy zostały spełnione przez loty, do których ten warunek był
  // adresowany: L2-02a i L2-02b (`edrDeal.estimate` z EUR na PLN, lot 2)
  // oraz L4-10 (jedna krawędź `task_depends_on_task` w harnessie, lot 4).
  // Wszystkie trzy wróciły z tego samego przelotu z POMIAREM, a nie z BLIND,
  // więc pole `blind` zdjęto z każdej z nich razem z jej warunkiem. Zostają
  // L5-03a i L5-03b — jedyne dwie, którym brakuje STANU EKRANU, a nie danych,
  // i ich warunki wyjścia stoją nietknięte przy wpisach.
  blind: 2,
  lots: {
    2: {
      // faza-3-build-brief.md:230-241
      positionsInBrief: 11,
      pairs: 14,
      positionsWithPairs: 10, // 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
      positionsWithoutPairs: [1],
    },
    3: {
      // faza-3-build-brief.md:262-272
      positionsInBrief: 9,
      pairs: 11,
      positionsWithPairs: 9, // 1-9
      positionsWithoutPairs: [],
    },
    4: {
      // faza-3-build-brief.md:296-309
      positionsInBrief: 12,
      pairs: 17,
      positionsWithPairs: 12, // 1-12
      positionsWithoutPairs: [],
    },
    5: {
      // faza-3-build-brief.md:333-346
      positionsInBrief: 12,
      pairs: 11,
      positionsWithPairs: 10, // 1-10
      positionsWithoutPairs: [11, 12],
    },
    6: {
      // faza-3-build-brief.md:369-378
      positionsInBrief: 8,
      pairs: 4,
      positionsWithPairs: 4, // 2, 3, 4, 5
      positionsWithoutPairs: [1, 6, 7, 8],
    },
  },
};

/**
 * WHO OWNS THE RECORD-TITLE BAND. This is a POINTER, not a fourth pair.
 *
 * `verify-renderer-layout.mjs` measures the record title twice, on purpose and
 * with two different instruments: the routed pass asks the pairs below whether
 * ONE subject computes `fontSize = var(--text-xl)`, and `judgeRecordTitleBand`
 * asks the geometry passes whether EVERY record title in the app sits in the
 * 1.375rem band, at 100% and at 200% text. The second one is the wider net —
 * it sees record screens no pair names, and it sees them at a geometry the
 * routed pass never walks.
 *
 * Both were saying the same thing about the same undelivered position, and
 * only one of them was throwing. That asymmetry is what this entry removes:
 * the band's verdict is now a FUNCTION of the status of the pairs below, so
 * the position has exactly one delivery switch. Flipping L4-01a/L4-01b to
 * "enforced" arms both instruments at once; nothing else has to be remembered.
 *
 * A THIRD ENTRY RESTATING THE SAME EXPECTATION WOULD HAVE BEEN THE OBVIOUS
 * MOVE AND IT IS THE WRONG ONE. This repo has a named defect class for one
 * shape rewritten into several schemas, and it would also have desynced
 * `VISUAL_LANGUAGE_ROUTED_EXPECTED` (57 pairs, lot 4 → 17) from the map that
 * `auditRoutedMap` counts. The band is not a pair; it is a second reading of
 * the pair's position, and it now says so out loud.
 *
 * `read`/`token` are here so the resolver can CHECK the pairs it points at,
 * not just find them. L4-01c is the same lot and the same position but reads
 * `letterSpacing` — arming a SIZE band off a TRACKING pair would be a gate
 * that fires for a reason nobody can trace back to what it measures.
 */
export const RECORD_TITLE_BAND_OWNER = {
  lot: 4,
  position: 1,
  label: "lot 4 #1",
  pairs: ["L4-01a", "L4-01b"],
  read: "fontSize",
  token: "--text-xl",
};
