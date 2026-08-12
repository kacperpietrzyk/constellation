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
// ── NUMERY LINII W `contract` GNIJĄ, I TO JEST WŁASNOŚĆ, NIE WYPADEK ─────────
// `.ui-craft/` jest GITIGNOROWANY (`.gitignore:5`) i przepisywany w tym samym
// przebiegu, w którym prototyp wygrywa z kontraktem — więc każdy zakres linii
// w polu `contract` opisuje treść, której historia nie pilnuje. Zmierzone przy
// naprawie po przeglądzie lotu D2, 2026-08-11: DZIEWIĘĆDZIESIĄT PIĘĆ cytatów
// w tym pliku wskazywało na inne sekcje, niż nazywał ich własny nawias — dwa
// najczęstsze zakresy (22 × „Spacing and density", 26 × „Component layer")
// pokazywały wtedy na rampę kolorów i na motyw ciemny. Lot D2 nie wymyślił tej
// wady, tylko powielił zastaną konwencję — i dlatego zamknięcie jej dziewięciu
// własnych par byłoby zostawieniem w jednym pliku dwóch sprzecznych adresów tej
// samej sekcji.
//
// OBOWIĄZEK NASTĘPNEGO LOTU, KTÓRY PRZEPISZE `.ui-craft/`: przeliczyć te zakresy
// JEDNYM przebiegiem po całym pliku, nie po własnych parach. NAZWA SEKCJI
// W NAWIASIE JEST CZĘŚCIĄ CYTATU WAŻNIEJSZĄ NIŻ LICZBY — to po niej odnajduje
// się sekcję, kiedy liczby już nie trafiają. Numery stanu na 2026-08-11:
// Spacing and density 85, Type 94, Shape/motion/depth 110, Dark theme 140,
// Component layer 202, Form first 321, What the accent is allowed to mean 353.
//
// PRZELICZONE TRZECI RAZ PRZEZ LOT D6, 2026-08-11, i znowu z tej samej
// przyczyny: „prototyp wygrywa z kontraktem" kazało dopisać dwie reguły,
// których `tokens.md` nie miał — rysowany znacznik stanu (do `### Status and
// accessibility`, 18 linii) i szósta praca akcentu (do `### What the accent is
// allowed to mean`, 17 linii). Pierwsza wstawka przesunęła W DÓŁ wszystko od
// `## Component layer`: 184 → 202, 303 → 321, 335 → 353. Sekcje NAD nią stoją
// nietknięte, i to jest cała różnica między przeliczeniem a zgadywaniem.
//
// ZAKRESY LINII W POLACH `contract` PONIŻEJ TYCH WSTAWEK PRZESUNĘŁY SIĘ O TYLE
// SAMO i NIE zostały przepisane jeden po drugim — to jest ta sama rot, którą
// akapit wyżej nazywa, i przepisywanie dziewięćdziesięciu cytatów pod plik,
// którego historia nie pilnuje, kupiłoby jeden dzień celności. Pary lotu D6
// cytują SAMĄ NAZWĘ SEKCJI, bez liczb, i to jest konwencja, którą ten nagłówek
// poleca.
//
// TEN SAM PRZEBIEG PRZELICZYŁ JE DRUGI RAZ, i to jest dowód, jak tanio ta rot
// wraca: para D2-02d potrzebowała reguły o cyfrach tabularnych, `tokens.md` jej
// NIE MIAŁ, więc zgodnie z zasadą „prototyp wygrywa z kontraktem" reguła weszła
// do `### Type` — dziewięć linii, po których WSZYSTKIE zakresy od `### Shape`
// w dół przesunęły się o dziewięć i musiały zostać przeliczone ponownie. Liczby
// wyżej są już po tej poprawce.
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
    contract: ".ui-craft/tokens.md (Dark theme — four surface planes)",
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
    contract: ".ui-craft/tokens.md (Dark theme — four surface planes)",
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
    contract: ".ui-craft/tokens.md (Component layer — shell-*, nav-active-*)",
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
      '.ui-craft/tokens.md (What the accent is allowed to mean — "where the reader is")',
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
    contract: ".ui-craft/tokens.md (Shape, motion, depth — elevation roles)",
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
    contract: ".ui-craft/tokens.md (Form first — ink and wash)",
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
    contract: ".ui-craft/tokens.md (Type)",
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
    contract: ".ui-craft/tokens.md (Form first — ink and wash)",
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
      '.ui-craft/tokens.md (What the accent is allowed to mean — "where the reader is")',
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
      ".ui-craft/tokens.md (Type — mono only for time, shortcuts, versions, IDs)",
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
    contract: ".ui-craft/tokens.md (Spacing and density — dense rows)",
    prototype: {
      file: "v3/app.css",
      lines: "210-216",
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
    contract: ".ui-craft/tokens.md (Spacing and density — 4/8/12px increments)",
    prototype: {
      file: "v3/app.css",
      lines: "197",
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
    contract: ".ui-craft/tokens.md (Dark theme — material, not texture)",
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
    contract: ".ui-craft/tokens.md (Shape, motion, depth — Z roles)",
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
    contract: ".ui-craft/tokens.md (Component layer — input-*)",
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
    contract: ".ui-craft/tokens.md (Component layer — input-*)",
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
    contract: ".ui-craft/tokens.md (Shape — full radius for pills)",
    prototype: {
      file: "v3/app.css",
      lines: "804-810",
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
    contract: ".ui-craft/tokens.md (Spacing and density)",
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
    contract: ".ui-craft/tokens.md (Spacing and density)",
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
    contract: ".ui-craft/tokens.md (Component layer — shell-*)",
    prototype: {
      file: "v3/app.css",
      lines: "84-90",
      value:
        "`.titlebar` is a direct child of `#app`, above `.body` — it spans the full window width",
    },
    subject: {
      selector: ".shell-tabbar",
      why: "geometry, not paint: the band used to live inside <main>, so its left edge sat at the sidebar's width",
      app: "packages/desktop-ui/src/styles.css:1571-1608, RealApp.tsx:3149",
    },
    read: { property: "rect.left" },
    expect: { kind: "literal", value: "0px" },
    // ODDANE 2026-08-07. Przełączone PO przelocie, który wypisał
    // `VISUAL_LANGUAGE_PENDING_ALREADY_MATCHES` w OBU motywach: „.shell-tabbar
    // computes rect.left = 0px". Pasmo jest teraz wierszem siatki powłoki
    // (`grid-column: 1 / -1`), a nie pierwszym dzieckiem kolumny roboczej.
    status: "enforced",
  },

  // ── POZYCJA 13 — nie ma czym zwinąć lewej kolumny ─────────────────────────
  {
    id: "L1-13",
    lot: 1,
    position: 13,
    title: "the left column can be collapsed on purpose",
    contract: ".ui-craft/tokens.md (Component layer — shell-*)",
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
    // ODDANE 2026-08-07, przełączone PO przelocie, który wypisał
    // `VISUAL_LANGUAGE_PENDING_ALREADY_MATCHES` w obu motywach. Kontrolka stoi
    // w stopce kolumny, obok Ustawień — tam, gdzie trzyma ją prototyp — i niesie
    // `aria-expanded` oraz nazwę zmieniającą się ze stanem. Tryb rail ma teraz
    // JEDNEGO właściciela (`railMode` = szerokość okna LUB prośba człowieka),
    // a reguły arkusza są przy nim rozszczepione, nie zduplikowane.
    status: "enforced",
  },

  // ── POZYCJA 14 — prawy koniec paska zakładek ──────────────────────────────
  // TA POZYCJA STAŁA NA LIŚCIE NIEOBJĘTYCH I SCHODZI Z NIEJ, a powód zejścia
  // jest wart tyle, co para. Wpis mówił: „nie ma tu WŁASNOŚCI do porównania,
  // a selektor na samą szerokość `.shell-detach` mierzyłby przycisk, który po
  // poprawce ma przestać istnieć". Pierwsze zdanie było prawdziwe o LICZBIE
  // afordancji i dalej jest — mapa nadal nie mówi, ILU glifów ma być w grupie,
  // bo to narzucałoby kształt znaczników. Drugie okazało się fałszywe przy
  // budowie: przycisk NIE przestał istnieć, przestał być szeroki. Klasa została
  // (`run-packaged-alpha-smoke.mjs:895` też ją czyta), więc podmiot jest ten
  // sam i da się o niego zapytać o jedyną własność, która TU rozstrzyga.
  //
  // KWADRAT JEST TĄ WŁASNOŚCIĄ. Wada nazywała się „szeroki przycisk tekstowy":
  // 2xs pismo w ramce, ~130 px szerokości, druga treść pod 30 rem. Prototyp ma
  // w tym miejscu `.icon-btn` — 1,75 rem na 1,75 rem. Szerokość równa
  // wysokości równej wartości prototypu wyklucza KAŻDY przycisk z napisem
  // w środku, i robi to bez jednego słowa o tym, ile ich ma być obok.
  {
    id: "L1-14a",
    lot: 1,
    position: 14,
    title: "the right end of the tab strip is a glyph, not a word",
    contract: ".ui-craft/tokens.md (Component layer — shell-*)",
    prototype: {
      file: "v3/app.css",
      lines: "135-143",
      value: "`.icon-btn { width: 1.75rem; height: 1.75rem }`",
    },
    subject: {
      selector: ".shell-detach",
      why: "global class in styles.css, kept through the change and also read by the packaged smoke",
      app: "packages/desktop-ui/src/styles.css:1589-1595, RealApp.tsx:3593-3651",
    },
    read: { property: "width" },
    expect: { kind: "rem", value: 1.75 },
    status: "enforced",
  },
  {
    id: "L1-14b",
    lot: 1,
    position: 14,
    title: "and it is square, so no label can be hiding inside it",
    contract: ".ui-craft/tokens.md (Component layer — shell-*)",
    prototype: {
      file: "v3/app.css",
      lines: "135-143",
      value: "`.icon-btn` is as tall as it is wide",
    },
    subject: {
      // DRUGA POŁOWA JEDNEGO ZDANIA, NIE OZDOBNIK. Sama szerokość 1,75 rem
      // przechodzi też na przycisku, który jest wąski i WYSOKI; dopiero para
      // wymiarów mówi „kwadrat".
      selector: ".shell-detach",
      why: "same subject as L1-14a",
      app: "packages/desktop-ui/src/styles.css:1589-1595",
    },
    read: { property: "height" },
    expect: { kind: "rem", value: 1.75 },
    status: "enforced",
  },

  // ── POZYCJA 15 — kolumna węższa, pasmo tytułu wyższe ──────────────────────
  {
    id: "L1-15a",
    lot: 1,
    position: 15,
    title: "the sidebar is 15rem wide",
    // ZOSTAJE „PENDING", Z POWODEM PRZEMIERZONYM 2026-08-07 (lot 1 mierzył go
    // przed lotami 2-6). Ostrzeżenie, które tu stało — „`verify-renderer-layout`
    // niesie własny rachunek na 320 px, przy 15rem zostaje osiemdziesiąt" — było
    // FAŁSZYWE: przy 320 px szyna jest włączona i `--sidebar-width` nie
    // obowiązuje; tamten rachunek jest już sprostowany pomiarem u siebie.
    // Prawdziwa blokada jest gdzie indziej i dalej stoi: zapytania medialne
    // liczą `rem` od korzenia 16 px, więc przy 200 % i 300 % pisma szyna się nie
    // włącza i kolumna zabiera 20 px panelowi pracy. Przemierzone: bramka układu
    // czerwienieje z 21 problemami na dziewięciu stanach ekranu, w tym 16
    // świeżych w Bibliotece i jednym NOWYM na `tasks:calendar`. Pełny rozpis
    // stoi przy samym tokenie (`packages/desktop-ui/src/tokens.css`), żeby nie
    // było go w dwóch miejscach.
    contract: ".ui-craft/tokens.md (Spacing and density)",
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
    contract: ".ui-craft/tokens.md (Spacing and density)",
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
    contract: ".ui-craft/tokens.md (Spacing and density)",
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
      '.ui-craft/tokens.md (What the accent is allowed to mean — "what is on the books")',
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

  // ══ FAZA C, LOT C1 — SZYNA ZAMIAST RAMKI ══════════════════════════════════
  // NOWA PRZESTRZEŃ NAZW, I TO JEST ŚWIADOME. Ta pozycja NIE STOI w briefie
  // Fazy 3 — piętnaście wierszy Lotu 1 mówi o ikonie aktywnej pozycji
  // (`v3/app.css:221`), a o nośniku samego stanu nie mówi ani jeden. Rozjazd
  // wypisała dopiero Faza 4, sześcioma wpisami rejestru
  // (`faza-4-porownanie-ekranow.md`, wpisy today #1, renewals #11, orgs #17,
  // people #22 oraz oba wpisy powłokowe z ekranów projektu). Wpisanie tych par
  // jako „lot 1, pozycja 5" kosztowałoby dokładnie tyle, ile kosztuje każde
  // kłamstwo o proweniencji w tym pliku: następny czytelnik szukałby ich
  // uzasadnienia w tabeli, w której go nie ma.
  //
  // POZYCJI JEST DWIE, BO MIERZALNOŚĆ ROZCINA JĄ NA DWIE. Pozycja 1 (wiersz
  // bieżący) rysuje się na powłoce lądowania i mierzy ją TEN przelot; pozycja 2
  // (cel NADRZĘDNY otwartego rekordu projektu) wymaga otwarcia rekordu, więc
  // mierzy ją mapa trasowana niżej. Obie deklaracje mówią o tym samym w obie
  // strony: `positionsWithoutPairs` każdej z map wskazuje na pozycję drugiej.
  {
    id: "C1-01a",
    lot: "C1",
    position: 1,
    title: "the current destination is marked with a rail, not a frame",
    contract:
      '.ui-craft/tokens.md, sekcja „Form first — ink and wash" („Ink is confined to … a 2–2.5 px rail (v3/app.css:485-487, :222-226)") oraz :328-333, „Wash rarely travels alone" („where the reference washes an object it also inks one edge of it")',
    prototype: {
      file: "v3/app.css",
      lines: "222-226",
      value:
        '`.nav-item[aria-current="page"]::before { width: 2.5px; height: 1rem; background: var(--accent); box-shadow: 0 0 8px var(--accent-glow) }`',
    },
    subject: {
      // DEKLARACJA, NIE KLASA: `aria-current="page"` stoi na wierszu bieżącym
      // od `RealApp.tsx` i jest tym samym podmiotem, który czyta L1-05.
      selector: '.nav-item[aria-current="page"]',
      why: "the rail is a generated layer, so the pair reads ::before — a rule that never generated it comes back as PSEUDO_ABSENT, which this pass files as DIFFERS rather than as a broken instrument",
      app: "packages/desktop-ui/src/styles.css (.nav-item.active::before)",
    },
    read: { pseudo: "::before", property: "backgroundColor" },
    expect: { kind: "accent" },
    status: "enforced",
  },
  {
    // FORMA TUSZU, NIE TYLKO JEGO KOLOR. Pierwsza wersja tego lotu miała na
    // szynę JEDNĄ asercję — kolor `::before` — a oddawała geometrię przepisaną
    // z prototypu co do liczby. Zamiana 2,5 px na 12 px zrobiłaby z szyny pasek
    // wypełniający wiersz, czyli dokładnie to, czego zabrania kontrakt („Ink
    // may not fill a row"), i wróciłaby ZIELONA. Kontrakt podaje formę liczbą,
    // więc para też podaje ją liczbą.
    id: "C1-01c",
    lot: "C1",
    position: 1,
    title: "and the ink stays a rail: 2.5 px, not a bar filling the row",
    contract:
      '.ui-craft/tokens.md, sekcja „Form first — ink and wash" („Ink is confined to a mark, a rail … a 2–2.5 px rail (v3/app.css:485-487, :222-226)"; „Ink may not fill a row, a card, a column, a panel, or a plane")',
    prototype: {
      file: "v3/app.css",
      lines: "222-226",
      value:
        "`width: 2.5px` — ta sama liczba, którą kontrakt podaje jako sufit",
    },
    subject: {
      selector: '.nav-item[aria-current="page"]',
      why: "same generated layer as C1-01a; the colour pair says the ink is the accent, this one says the ink is a rail — a rule that keeps the accent and widens the layer passes the first and fails this one",
      app: "packages/desktop-ui/src/styles.css (.nav-item.active::before)",
    },
    read: { pseudo: "::before", property: "width" },
    expect: { kind: "literal", value: "2.5px" },
    status: "enforced",
  },
  {
    id: "C1-01b",
    lot: "C1",
    position: 1,
    title: "and it stops framing the row with a full accent border",
    contract:
      '.ui-craft/tokens.md, sekcja „Form first — ink and wash" (Ink may not fill a row … a one-pixel accent edge around a PANEL is the named exception, and a navigation row is not one)',
    prototype: {
      file: "v3/app.css",
      lines: "218-220",
      value:
        '`.nav-item[aria-current="page"] { background: var(--accent-quieter); color: var(--text-primary); font-weight: 500 }` — ani jednej deklaracji obramowania',
    },
    subject: {
      selector: '.nav-item[aria-current="page"]',
      why: "same subject as C1-01a; the base rule keeps `border: 1px solid transparent` so the state never moves the layout, which is why the delivered value is the transparent literal and not `0px`",
      app: "packages/desktop-ui/src/styles.css (.nav-item.active), tokens.css (--nav-active-border)",
    },
    read: { property: "borderTopColor" },
    // NIE `kind: "not"` NA WARTOŚCI AKCENTU, i to jest różnica między asercją
    // o dostawie a asercją o nieobecności starej wady: „cokolwiek innego niż
    // fiolet" jest prawdą także o wierszu, któremu ktoś dał obwódkę szarą.
    // Literał przezroczystości mówi, co ma tam być.
    expect: { kind: "literal", value: "rgba(0, 0, 0, 0)" },
    status: "enforced",
  },

  // ══ LOT D2 FAZY D — DZISIAJ I OGON POWŁOKI ═══════════════════════════════
  //
  // WSZYSTKIE PARY TEGO LOTU SĄ W MAPIE POWŁOKI, A NIE W TRASOWANEJ, i to jest
  // fakt o przelocie, nie wygoda: `HARNESS` (`?surface=collaboration`) ląduje
  // na DZISIAJ, więc pasmo tego ekranu, jego nagłówki sekcji i jego znacznik
  // pomocy stoją w drzewie bez ani jednego kliknięcia — tak samo jak pasek
  // zakładek, nagłówki modułów i wiersze nawigacji. Dopisanie ich do mapy
  // trasowanej kosztowałoby przystanek, który już jest.

  // ── POZYCJA 1 (wpis #2) — nagłówek sekcji przestaje krzyczeć głośniej niż
  //    tytuł ekranu nad nim ────────────────────────────────────────────────
  {
    id: "D2-01a",
    lot: "D2",
    position: 1,
    title: "the section heading takes the prototype's size",
    contract: ".ui-craft/tokens.md (Type — scale)",
    prototype: {
      file: "v3/screens/today.css",
      lines: "42-45",
      value:
        "`.td-sec-head h3 { font-size: var(--text-sm); font-weight: 600 }` — ta sama para liczb, którą `styles.css` daje TYTUŁOWI ekranu (`.surface-header h1`), więc nagłówek sekcji jest tytułowi RÓWNY, nie podporządkowany",
    },
    subject: {
      // NAZWA Z MODUŁU CSS, znormalizowana tym samym wyrażeniem, co reszta
      // przelotu. Trzy nagłówki sekcji Dzisiaj rysują się naraz i wszystkie
      // biorą tę samą regułę — przelot wymaga JEDNEJ wartości na wszystkich
      // dopasowaniach, więc rozjazd między sekcjami byłby tu czerwony.
      selector: '[class*="_sectionHead_"] h2',
      why: "the landing surface is Today; its three section heads share one rule and one value",
      app: "packages/desktop-ui/src/today.module.css (.sectionHead h2)",
    },
    read: { property: "fontSize" },
    expect: { kind: "token", token: "--text-sm" },
    status: "enforced",
  },
  {
    id: "D2-01b",
    lot: "D2",
    position: 1,
    title: "and its weight, instead of being bigger and lighter",
    contract: ".ui-craft/tokens.md (Type — scale)",
    prototype: {
      file: "v3/screens/today.css",
      lines: "42-45",
      value: "`font-weight: 600`",
    },
    subject: {
      selector: '[class*="_sectionHead_"] h2',
      why: "same subject as D2-01a",
      app: "packages/desktop-ui/src/today.module.css (.sectionHead h2)",
    },
    // WAGA OSOBNO OD STOPNIA, BO PSUJE SIĘ OSOBNO: wpis rejestru mówi „większe
    // I LŻEJSZE", czyli o dwóch liczbach naraz (16 px wagą 560). Para czytająca
    // sam stopień byłaby zielona nad nagłówkiem 13 px wagą 560, czyli nad
    // połową tej samej wady.
    read: { property: "fontWeight" },
    expect: { kind: "literal", value: "600" },
    status: "enforced",
  },
  {
    // DOPISANE PRZY NAPRAWIE PO PRZEGLĄDZIE TEGO LOTU. Dwie pary wyżej pilnują
    // NAGŁÓWKA, a wpis #2 jest o RELACJI: dowód rejestru cytuje
    // `v3/screens/today.css:42-49`, czyli nagłówek RAZEM z licznikiem, a lot
    // zawęził cytat do `42-45`. Skutek był mierzalny i niemierzony — nagłówek
    // zszedł z 1 rem na 0,8125, licznik został na 0,8125, więc dopisek zrównał
    // się z rzeczą, do której jest dopiskiem. Para na sam nagłówek jest nad tą
    // wadą ZIELONA, bo nagłówek ma dokładnie tę wartość, której się od niego
    // chce.
    id: "D2-01c",
    lot: "D2",
    position: 1,
    title: "and the count beside it stays one step quieter than the heading",
    contract: ".ui-craft/tokens.md (Type — scale)",
    prototype: {
      file: "v3/screens/today.css",
      lines: "46-49",
      value:
        "`.td-sec-head .n { font-size: var(--text-xs); color: var(--text-quaternary); font-weight: 500 }` — stopień NIŻEJ niż `h3` w tym samym wierszu (`:42-45`); to samo rozstrzygnięcie niesie drugie pasmo prototypu, `v3/app.css:692`",
    },
    subject: {
      // ZAGNIEŻDŻENIE, NIE SAMA KLASA: `.count` jest nazwą modułu i mogłaby
      // kiedyś stanąć poza wierszem nagłówka. Para pyta o licznik STOJĄCY
      // W NAGŁÓWKU, bo to jest relacja, którą wpis rejestru opisuje.
      selector: '[class*="_sectionHead_"] [class*="_count_"]',
      why: "two of the three section heads on the landing surface draw one (TodaySurface.tsx:367, :439) and both take the same rule",
      app: "packages/desktop-ui/src/today.module.css (.count)",
    },
    read: { property: "fontSize" },
    expect: { kind: "token", token: "--text-xs" },
    status: "enforced",
  },
  {
    // WAGA OSOBNO OD STOPNIA, Z TEGO SAMEGO POWODU, CO PRZY D2-01a/D2-01b
    // trzydzieści linii wyżej — i dopisane dlatego, że pierwsza wersja tej
    // naprawy ruszyła OBIE liczby (`400` → `500`), a napisała parę tylko na
    // jedną. Reguła własnego pliku, zastosowana do własnej dostawy.
    id: "D2-01d",
    lot: "D2",
    position: 1,
    title: "and it is a footnote's weight, not body text dropped in",
    contract: ".ui-craft/tokens.md (Type — headings and body weights)",
    prototype: {
      file: "v3/screens/today.css",
      lines: "46-49",
      value: "`font-weight: 500`",
    },
    subject: {
      selector: '[class*="_sectionHead_"] [class*="_count_"]',
      why: "same subject as D2-01c",
      app: "packages/desktop-ui/src/today.module.css (.count)",
    },
    read: { property: "fontWeight" },
    expect: { kind: "literal", value: "500" },
    status: "enforced",
  },

  // ── POZYCJA 2 (wpis #3) — data i pojemność zamieniają się miejscami ──────
  {
    id: "D2-02a",
    lot: "D2",
    position: 2,
    title: "the date stands at the band's end, quiet and sentence-cased",
    contract: ".ui-craft/tokens.md (Type — scale)",
    prototype: {
      file: "v3/screens/today.js",
      lines: "129-130",
      value:
        "`crumbbar('<span class=\"cur\">Today</span>', '<span class=\"when\">Monday, 27 July 2026</span>')`, a `.when` (`v3/app.css:441`) to `--text-xs` w kolorze trzeciorzędnym",
    },
    subject: {
      selector: ".surface-header [data-band-date]",
      why: "declared attribute, not a module hash: the band's right end is the position this entry is about",
      app: "packages/desktop-ui/src/TodaySurface.tsx, today.module.css (.bandDate)",
    },
    read: { property: "fontSize" },
    expect: { kind: "token", token: "--text-xs" },
    status: "enforced",
  },
  {
    id: "D2-02b",
    lot: "D2",
    position: 2,
    title: "the uppercase date badge above the title is gone",
    contract: ".ui-craft/brief.md (Meaning earns color — form first)",
    prototype: {
      file: "v3/screens/today.js",
      lines: "129-136",
      value:
        "prototyp NIE MA na tym ekranie wersalikowej plakietki daty w ogóle — ani w paśmie, ani nad tytułem",
    },
    subject: {
      selector: ".surface-header .eyebrow",
      why: "hand-written class in styles.css, shared with .nav-label/.section-label; this pair asks only whether the BAND still carries one",
      app: "packages/desktop-ui/src/styles.css (.eyebrow), TodaySurface.tsx",
    },
    read: { property: null },
    // `equals: 0`, A NIE `atLeast`: „nie ma ani jednej" jest całą treścią tego
    // pół-wpisu. Reguła `.eyebrow` ZOSTAJE w arkuszu — mają ją inne pasma —
    // więc para czytająca arkusz zamiast drzewa nic by tu nie zmierzyła.
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    id: "D2-02c",
    lot: "D2",
    position: 2,
    title: "and the capacity line has left the band's right end",
    contract:
      '.ui-craft/patterns.md — „Pattern: Surface title band" (licznik idzie do paska widoku, nigdy na prawy koniec pasma)',
    prototype: {
      file: "v3/screens/today.css",
      lines: "12-17",
      value:
        "`.td-capacity { font-size: var(--text-sm); color: var(--text-tertiary) }` — pojemność leży POD tytułem, w `.td-head`, a nie w `crumbbar`",
    },
    subject: {
      selector: ".surface-header [data-capacity]",
      why: "the same declared attribute the surface already carried, read INSIDE the band: this half of the entry is about where the line stands, not what it says",
      app: "packages/desktop-ui/src/TodaySurface.tsx",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    // DOPISANE PRZY NAPRAWIE PO PRZEGLĄDZIE TEGO LOTU. Lot przepisał `.capacity`
    // z cytatem na `v3/screens/today.css:12-15` i wziął z tamtej reguły DWIE
    // deklaracje z trzech — stopień i kolor — a zostawił cyfry tabularne, mimo
    // że trzydzieści linii wyżej wziął tę samą deklarację dla `.bandDate`.
    //
    // ORAZ: DO TEJ PARY ŻADNA W TYM PLIKU NIE CZYTAŁA `fontVariantNumeric`,
    // więc zdanie „przelot tę własność widzi" było domysłem o przyrządzie,
    // a nie jego pomiarem. Teraz jest pomiarem.
    id: "D2-02d",
    lot: "D2",
    position: 2,
    title: "and its numbers stop shifting as the day is recounted",
    // KONTRAKT DOPISANY W TYM SAMYM PRZEBIEGU, bo pierwsza wersja tej pary
    // cytowała `### Type` pod nawiasem „mono only for time…", czyli regułę
    // o PIŚMIE MASZYNOWYM — a to jest dokładnie ta wada, którą ten commit
    // zamyka gdzie indziej: nawias nazywający treść, której nie ma pod adresem.
    // Prototyp regułę MIAŁ, kontrakt jej nie miał, więc zgodnie z zasadą
    // „prototyp wygrywa z kontraktem" reguła weszła do `tokens.md`, a nie
    // cytat został naciągnięty.
    contract:
      ".ui-craft/tokens.md (Type — a row of recounted numbers takes tabular figures)",
    prototype: {
      file: "v3/screens/today.css",
      lines: "12-15",
      value:
        "`.td-capacity { font-size: var(--text-sm); color: var(--text-tertiary); margin-bottom: var(--space-5); font-variant-numeric: tabular-nums }` — trzy deklaracje, nie dwie",
    },
    subject: {
      // BEZ ZAKRESU `.surface-header`, ODWROTNIE NIŻ D2-02c: tamta para pyta,
      // czy wiersza NIE MA w paśmie, ta — jak jest złożony tam, gdzie stoi.
      selector: "[data-capacity]",
      why: "the same declared attribute, read where the line actually stands: this is the only row on the surface made entirely of numbers that change through the day",
      app: "packages/desktop-ui/src/today.module.css (.capacity)",
    },
    read: { property: "fontVariantNumeric" },
    expect: { kind: "literal", value: "tabular-nums" },
    status: "enforced",
  },

  // ── POZYCJA 3 (wpis #4) — pomoc na żądanie jest przypisem ────────────────
  {
    id: "D2-03a",
    lot: "D2",
    position: 3,
    title: "help on demand is a round mark smaller than the label it stands by",
    contract: ".ui-craft/surfaces/contextual-concept-help.md (Visual contract)",
    prototype: {
      file: "v3/app.css",
      lines: "896-904",
      value:
        "`.helpb { width: 1.125rem; height: 1.125rem; border-radius: var(--radius-full); font-size: var(--text-2xs) }`",
    },
    subject: {
      selector: ".help-mark",
      why: "hand-written class in styles.css; the landing surface draws exactly one of these",
      app: "packages/desktop-ui/src/styles.css (.help-mark), TodaySurface.tsx",
    },
    read: { property: "width" },
    expect: { kind: "rem", value: 1.125 },
    status: "enforced",
  },
  {
    id: "D2-03b",
    lot: "D2",
    position: 3,
    title: "and it is round, not a rounded rectangle with a word in it",
    contract: ".ui-craft/surfaces/contextual-concept-help.md (Visual contract)",
    prototype: {
      file: "v3/app.css",
      lines: "896-904",
      value: "`border-radius: var(--radius-full)`",
    },
    subject: {
      selector: ".help-mark",
      why: "same subject as D2-03a",
      app: "packages/desktop-ui/src/styles.css (.help-mark)",
    },
    // PROMIEŃ OSOBNO OD SZEROKOŚCI, BO WPIS MÓWI O KSZTAŁCIE, NIE O ROZMIARZE:
    // kwadrat 1,125 rem spełniłby samą szerokość, a rejestr skarży się na
    // „słowny przycisk" wobec „okrągłego znacznika".
    read: { property: "borderRadius" },
    expect: { kind: "token", token: "--radius-full" },
    status: "enforced",
  },

  // ── POZYCJA 4 (wpis #5) — zakładka obejmuje własną etykietę ──────────────
  {
    id: "D2-04a",
    lot: "D2",
    position: 4,
    title: "the shell tab stops growing into the free space of the strip",
    contract: ".ui-craft/tokens.md (Component layer — shell-*)",
    prototype: {
      file: "v3/app.css",
      lines: "107-115",
      value:
        "`.tab` deklaruje `max-width: 13rem` i `min-width: 0`, i NIE deklaruje `flex` ani szerokości — szerokość zakładki jest funkcją jej treści",
    },
    subject: {
      selector: ".shell-tab",
      why: "hand-written class in styles.css; both screenshots the register compared drew exactly one tab, so this is not a function of how many are open",
      app: "packages/desktop-ui/src/styles.css (.shell-tab)",
    },
    read: { property: "flexGrow" },
    expect: { kind: "literal", value: "0" },
    status: "enforced",
  },
  {
    id: "D2-04b",
    lot: "D2",
    position: 4,
    title: "and its floor stops being wider than a short label",
    contract: ".ui-craft/tokens.md (Component layer — shell-*)",
    prototype: {
      file: "v3/app.css",
      lines: "107-115",
      value: "`min-width: 0`",
    },
    subject: {
      selector: ".shell-tab",
      why: "same subject as D2-04a",
      app: "packages/desktop-ui/src/styles.css (.shell-tab)",
    },
    // DRUGA DEKLARACJA, BO WYSTARCZY JEDNA Z DWÓCH, ŻEBY WADA WRÓCIŁA:
    // `flex-grow: 0` przy podłodze 7 rem dalej daje płytę szerszą od napisu
    // „Today", i to był dokładnie zmierzony stan sprzed tego lotu.
    read: { property: "minWidth" },
    expect: { kind: "literal", value: "0px" },
    status: "enforced",
  },

  // ── POZYCJA 5 (wpis #12) — pismo rysuje się tą samą kreską, co w prototypie
  {
    id: "D2-05",
    lot: "D2",
    position: 5,
    title: "the window smooths its type the way the reference does",
    contract: ".ui-craft/tokens.md (Type)",
    prototype: {
      file: "v3/app.css",
      lines: "7-13",
      value: "`body { -webkit-font-smoothing: antialiased }`",
    },
    subject: {
      selector: "body",
      why: "the element the prototype declares it on; the app had NO declaration of this property anywhere in packages/desktop-ui/src",
      app: "packages/desktop-ui/src/styles.css (body)",
    },
    // WŁASNOŚĆ, KTÓREJ NIE DA SIĘ ZOBACZYĆ W ARKUSZU, A DA SIĘ W SILNIKU.
    // Rejestr postawił ten wpis na pomiarze TUSZU (o 24% więcej pikseli >120
    // przy identycznej szerokości napisu), a `getComputedStyle` zwraca tę
    // deklarację wprost — więc dowodem jest przyrząd, nie grep.
    read: { property: "webkitFontSmoothing" },
    expect: { kind: "literal", value: "antialiased" },
    status: "enforced",
  },

  // ── POZYCJA 6 (wpisy #13 i #54) — daszek zwijania stoi przed etykietą ────
  {
    id: "D2-06",
    lot: "D2",
    position: 6,
    title: "the module chevron stands before the label, not at the far edge",
    contract: ".ui-craft/tokens.md (Component layer — shell-*)",
    prototype: {
      file: "v3/app.js",
      lines: "599",
      value:
        '`<button class="nav-head" …>${icon("chevDown", "chev")}<span>${title}</span></button>` — znak zwijania jest PIERWSZYM dzieckiem wiersza',
    },
    subject: {
      // POŁOŻENIE JAKO STRUKTURA, NIE JAKO PIKSEL. `gridTemplateColumns`
      // rozwiązuje się do pikseli, a te zależą od długości nazwy modułu i od
      // skali pisma — asercja na nich gniłaby przy pierwszej nowej grupie.
      // „Daszek jest pierwszym dzieckiem" jest zdaniem, które psuje się
      // dokładnie wtedy, kiedy wraca wada.
      selector: ".nav-group-toggle > .nav-group-chevron:first-child",
      why: "hand-written classes in styles.css; the position is asserted as structure so the pair does not rot on label length or text scale",
      app: "packages/desktop-ui/src/RealApp.tsx, styles.css (.nav-group-toggle)",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 1 },
    status: "enforced",
  },

  // ── POZYCJA 7 (wpisy #24 i #31) — dwa cele nawigacji, dwa różne znaki ────
  {
    id: "D2-07a",
    lot: "D2",
    position: 7,
    title: "Today carries a clock",
    contract: ".ui-craft/brief.md (Meaning earns color — form first)",
    prototype: {
      file: "v3/app.js",
      lines: "16",
      value: '`today: "M8 2v3 … M2.5 8a5.5 5.5 0 1 0 11 0 …"` — zegar',
    },
    subject: {
      // PREFIKS ŚCIEŻKI, BO GLIF JEST RYSUNKIEM, A NIE WŁASNOŚCIĄ STYLU.
      // Przelot nie czyta atrybutów, ale selektor atrybutowy je widzi. Prefiks
      // to pierwsza komenda prototypowego zegara przeskalowana ×1,5 — czyli
      // ta sama liczba, którą niesie `Icon.tsx`. Świadoma cena: przerysowanie
      // glifu wymaga poprawienia tej pary, i tak ma być, bo para pilnuje
      // KTÓRY rysunek stoi przy tym celu.
      selector: '[data-surface="today"] svg path[d^="M12 6.75V12"]',
      why: "the glyph itself, reached by its own path data: two destinations carrying the same drawing is what this entry is about",
      app: "packages/desktop-preload/src/surface-registry.ts, components/Icon.tsx (clock)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  {
    id: "D2-07b",
    lot: "D2",
    position: 7,
    title: "and Calendar a calendar page, so the two rows differ",
    contract: ".ui-craft/brief.md (Meaning earns color — form first)",
    prototype: {
      file: "v3/app.js",
      lines: "37",
      value:
        '`calendar: "M2.5 4.5a1 1 0 0 1 1-1h9 … M2.5 7h11M5.5 2.5v2M10.5 2.5v2"` — kartka z podziałką miesiąca',
    },
    subject: {
      selector: '[data-surface="calendar"] svg path[d^="M3.75 6.75"]',
      why: "same reasoning as D2-07a; both destinations stood in the navigation carrying `cockpit`, the four-cell grid",
      app: "packages/desktop-preload/src/surface-registry.ts, components/Icon.tsx (calendar)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  {
    id: "D2-07c",
    lot: "D2",
    position: 7,
    title: "and Organizations a building, not a second pair of silhouettes",
    contract: ".ui-craft/brief.md (Meaning earns color — form first)",
    prototype: {
      file: "v3/app.js",
      lines: "20",
      value:
        '`org: "M3 13.5V4.2a1 1 0 0 1 1-1h4.5 … M5.2 6h1.6M5.2 8.6h1.6M5.2 11.2h1.6"` — budynek z oknami',
    },
    subject: {
      selector: '[data-surface="organizations"] svg path[d^="M4.5 20.25"]',
      why: "the register measured this at 3x zoom: `relationships` and `people` differ by a connector stroke invisible at 16px, and both stood in the CRM group",
      app: "packages/desktop-preload/src/surface-registry.ts, components/Icon.tsx (organization)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },

  // ── POZYCJA 8 (wpisy #50 i #66) — prawa krawędź wiersza niesie liczbę ────
  {
    id: "D2-08",
    lot: "D2",
    position: 8,
    title: "navigation rows carry counts beyond Tasks and Inbox",
    contract: ".ui-craft/tokens.md (Component layer — shell-*)",
    prototype: {
      file: "v3/app.js",
      lines: "580-591",
      value:
        '`d.id === "projects" ? <span class="n">…</span> : d.id === "pipeline" ? … : d.id === "library" ? …` — liczba przy prawie każdym module',
    },
    subject: {
      // `atLeast: 6`, A NIE DOKŁADNA LICZBA CELÓW — i ta liczba jest wybrana
      // ZŁAMANIEM, nie okiem. Rachunek z fikstury: Zadania miały licznik przed
      // tym lotem, a Projekty, Lejek, Organizacje, Ludzie, Odnowienia
      // i Biblioteka dostają go w nim — czyli siedem (zmierzone: „7 element(s)
      // match"). Dokładna siódemka byłaby asercją o LICZBIE CELÓW W REJESTRZE,
      // nie o dostawie: ósmy cel z licznikiem położyłby parę na zielonej
      // robocie. Podłoga 3 z pierwszej wersji tej pary była z kolei ZA NISKA —
      // złamanie „zdejmij liczniki CRM" zostawia trzy (Zadania, Projekty,
      // Biblioteka) i wracało ZIELONE. Sześć pada na utracie któregokolwiek
      // z dwóch odczytów, na których ten lot stoi.
      selector: ".sidebar [data-nav-count]",
      why: "declared attribute on the count element; Inbox keeps its own badge class, so this selector counts the plain tabular numbers only",
      app: "packages/desktop-ui/src/RealApp.tsx (navCounts), crm/record-census.ts",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 6 },
    status: "enforced",
  },

  // ── POZYCJA 9 (wpis #6) — wiersz nagłówka sekcji ma prawy koniec ─────────
  {
    id: "D2-09",
    lot: "D2",
    position: 9,
    title: "the section heading row has a right end, with something in it",
    contract: ".ui-craft/tokens.md (Component layer)",
    prototype: {
      file: "v3/screens/today.js",
      // Otwarte i sprawdzone pod tym numerem: 150 niesie `<button class="more"
      // …>Open Calendar →</button>`. Wpisane tu wcześniej „152" nie niosło nic
      // — cytat wskazywał dwie linie za element, który cytuje.
      lines: "150",
      value:
        '`<button class="more" data-go=\'{"kind":"calendar"}\'>Open Calendar →</button>`, dosunięty regułą `.td-sec-head .more { margin-left: auto }` (`v3/screens/today.css:50`)',
    },
    subject: {
      // OBECNOŚĆ, NIE `marginLeft`. `margin-left: auto` rozwiązuje się
      // w `getComputedStyle` do WARTOŚCI UŻYTEJ w pikselach, więc para
      // czytająca tę własność mierzyłaby szerokość wolnego miejsca w wierszu,
      // a nie deklarację. Wpis rejestru mówi o SLOCIE Z TREŚCIĄ — pusty slot
      // nie jest dostawą — więc mierzona jest treść.
      selector: '[class*="_sectionHead_"] [data-open-calendar]',
      why: "declared attribute inside the module-hashed head; this is the half of the entry the harness fixture can draw",
      app: "packages/desktop-ui/src/TodaySurface.tsx, today.module.css (.sectionMore)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },

  // ── POZYCJA 9b (wpis #6) — DRUGI prawy koniec: kto ułożył plan ────────────
  // TA PARA BYŁA WPISEM `VISUAL_LANGUAGE_NOT_COVERED`, i to jest różnica
  // między „nie da się zmierzyć" a „nie ma czego mierzyć". Plakietka była
  // oddana w kodzie od lotu D2; niemierzalna była dlatego, że fikstura harnessu
  // nie rysowała ani jednego `[data-planned-row]`. Warunek wyjścia zapisany
  // przy tamtym wpisie — „zaplanowane na dziś zadanie z autorem-agentem
  // w `dev/CollaborationHarness.tsx`" — jest spełniony, więc wpis znika,
  // a jego miejsce zajmuje asercja. Zostawienie obu dałoby bliźniaka, który
  // twierdzi, że tego nie widać, obok pomiaru, który to widzi.
  {
    id: "D2-09b",
    lot: "D2",
    position: 9,
    title: "the planned section's right end names who laid the day out",
    contract: ".ui-craft/tokens.md (Component layer)",
    prototype: {
      file: "v3/screens/today.js",
      // Otwarte i sprawdzone: 141 to warunek (`planned.some(… kind ===
      // "agent")`), 142 to sam element. Poprzedni cytat („148-150") wskazywał
      // nagłówek SĄSIEDNIEJ sekcji — tej z „Open Calendar →" — czyli parę obok.
      lines: "141-142",
      value:
        '`<span class="td-agent">${icon("spark")}laid out by Hermes</span>`, dosunięty `margin-left: auto` (`v3/screens/today.css:51-54`)',
    },
    subject: {
      // OBECNOŚĆ, z tego samego powodu co przy D2-09: `margin-left: auto`
      // rozwiązuje się do pikseli wolnego miejsca, a wpis rejestru mówi
      // o SLOCIE Z TREŚCIĄ. Selektor jest przywiązany do atrybutu, nie do
      // zahaszowanej nazwy klasy modułu — nazwa klasy zeruje ten licznik po
      // cichu przy pierwszym przebudowaniu.
      selector: '[class*="_sectionHead_"] [data-planned-by-agent]',
      why: "the badge draws only when a planned row for TODAY carries plannedBy.principalKind === 'agent'; the count is what proves the state exists, not just the code path",
      app: "packages/desktop-ui/src/TodaySurface.tsx (:378-382), today.module.css (.sectionAgent)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
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
    lot: "D2",
    position: 8,
    title: "the Meetings row carries a count",
    prototype: {
      file: "v3/app.js",
      lines: "590",
      value:
        '`d.id === "meetings" ? <span class="n">${MEETINGS.length}</span>`',
    },
    // NIE „NIE ZDĄŻYLIŚMY", TYLKO „NIE MA SKĄD". Spotkania nie są w migawce:
    // stan kalendarza jest świadomie lokalny dla urządzenia i schodzi przez
    // `client.getMeetingLoop`, z własną odmową uprawnienia
    // (`client/calendar-reservation.ts`). Licznik przy tym celu wymagałby
    // odczytu kalendarza przy KAŻDYM otwarciu okna, także u kogoś, kto dostępu
    // nie dał — i pokazywałby wtedy albo zero, albo pustkę, czyli odpowiedź na
    // pytanie, którego nie dało się zadać.
    why: "meetings live outside the snapshot, behind a per-device calendar permission; a count there would need a calendar read at window open for everyone",
  },
  // ── SPŁACONY I SKASOWANY: „plakietka autorstwa planu", 2026-08-12 ─────────
  // Stał tu wpis `D2`/pozycja 9 z powodem „fikstura harnessu nie rysuje ani
  // jednego `[data-planned-row]`, więc plakietka nie ma stanu, w którym mogłaby
  // się pojawić", i z warunkiem wyjścia „zaplanowane na dziś zadanie z autorem-
  // agentem w `dev/CollaborationHarness.tsx`". Lot D9 ten warunek SPEŁNIŁ —
  // pojedyncza pozycja `task.list` niesie od tej zmiany `startAt` wyprowadzony
  // z zegara i `plannedBy` wskazujący na grant agenta — więc wpis ustępuje
  // miejsca parze `D2-09b` wyżej. Bliźniak zostawiony obok pary twierdziłby,
  // że tego nie widać, dokładnie tam, gdzie asercja to widzi.
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
  {
    lot: "C1",
    position: 1,
    title:
      "the rail is VISIBLE — that it stands at the column's edge and is not clipped to zero pixels",
    prototype:
      'v3/app.css:222-226 (`.nav-item[aria-current="page"]::before { left: -0.5rem }` — szyna wychodzi POZA pudełko wiersza, a rysuje się, bo `.nav` prototypu nie ma wcięcia)',
    app: "packages/desktop-ui/src/styles.css (.sidebar nav — `margin-left: calc(-1 * var(--nav-gutter))` z dopełnieniem tej samej wartości)",
    // PODMIOTEM SONDY JEST GOSPODARZ, NIE PSEUDOELEMENT: `querySelectorAll` nie
    // umie dopasować `::before`, więc selektor z pseudoelementem wróciłby „0
    // elementów na powłoce lądowania" i czytałby się jako „tego tu nie ma".
    // Sonda liczy wiersze, których ta luka dotyczy.
    probe: '.nav-item[aria-current="page"]',
    why:
      "TRZY PARY TEJ POZYCJI (C1-01a farba, C1-01c szerokość, C1-02 farba rodzica) CZYTAJĄ " +
      '`getComputedStyle(element, "::before")`, a styl WYLICZONY nie wie o przycięciu. ' +
      "`.sidebar nav` niesie `overflow-y: auto`, więc przeglądarka wylicza `overflow-x` też na " +
      "`auto` i element przycina po obu osiach na swoim pudełku dopełnienia; szyna stoi POZA " +
      "lewą krawędzią wiersza, więc bez ujemnego marginesu listy leży poza obszarem przycięcia. " +
      "Skasowanie tego marginesu zostawia `::before` wygenerowany, `left` wyliczone na -13px " +
      "i `backgroundColor` na akcencie — WSZYSTKIE TRZY PARY WRACAJĄ ZIELONE nad kolumną bez " +
      "ani jednego piksela tuszu. Zmierzone, nie przypuszczone. Domknięcie wymaga odczytu " +
      "prostokąta granicznego, a `getBoundingClientRect` NIE MA formy dla pseudoelementu — " +
      "czyli nowej warstwy w runnerze (zastępczy element mierzalny albo zrzut piksela), " +
      "a to jest lot, nie poprawka. Z tego samego powodu NIE MA złamania na ten margines: " +
      "wróciłoby ZIELONE i byłoby złamaniem udającym uzbrojenie.",
    greenWrong:
      "Szyna może być przycięta do zera pikseli na każdym ekranie naraz — wiersz bieżący " +
      "zostaje wtedy z samym podbarwieniem 0,08 alfy, czyli w stanie połowicznym, który lot C1 " +
      "istnieje, żeby zamknąć. Zielone C1-01a NIE JEST dowodem, że szynę widać.",
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
/*
 * 27 → 29 PRZY LOCIE C1 FAZY C, 2026-08-10. Przyrost to DWIE nowe pary
 * w nowej przestrzeni nazw („C1"), nie zaostrzenie istniejących: nośnik stanu
 * bieżącego w nawigacji nie miał w tym pliku ANI JEDNEJ pary — L1-05 mierzy
 * glif, nie wiersz — więc przemalowanie ramki na szynę przechodziło tu do tej
 * pory bez śladu. Ani jedno `expect` z Lotu 1 nie zostało tknięte, a `pending`
 * zostaje przy 1 (L1-15a).
 *
 * 29 → 30 I 1 → 2 PRZY NAPRAWIE LOTU C1, tego samego dnia, po przeglądzie.
 * Para C1-01c pinuje SZEROKOŚĆ szyny, bo trzy pary czytające farbę nie mówiły
 * nic o formie tuszu, a kontrakt podaje formę liczbą. Wpis w `NOT_COVERED`
 * nazywa to, czego ŻADNA z tych par nie widzi: szynę przyciętą do zera pikseli.
 * Obie zmiany są dopisaniem asercji i deklaracji, nie poluzowaniem żadnej.
 */
export const VISUAL_LANGUAGE_EXPECTED = {
  // 30 → 46 PRZY LOCIE D2 FAZY D, 2026-08-11. Szesnaście par na dziewięciu
  // pozycjach, i wszystkie w TEJ mapie, a nie w trasowanej: `HARNESS` ląduje
  // na Dzisiaj, więc pasmo tego ekranu, jego trzy nagłówki sekcji i jego
  // znacznik pomocy stoją w drzewie bez ani jednego kliknięcia — tak samo jak
  // pasek zakładek, nagłówki modułów i wiersze nawigacji.
  //
  // 2 → 4 W `notCovered`, i oba przyrosty są ODMOWAMI Z POWODEM, nie długiem
  // bez adresu: licznik przy Spotkaniach nie ma źródła w migawce, a plakietka
  // autorstwa planu nie ma STANU w fiksturze. Pierwszy wpis mówi, czego
  // brakuje w produkcie, drugi — czego brakuje w przyrządzie, i drugi niesie
  // swój warunek wyjścia.
  // 46 → 47 PRZY NAPRAWIE PO PRZEGLĄDZIE LOTU D2, 2026-08-11, I NIE JEST TO ANI
  // nowa pozycja, ani rozpad istniejącej: to POŁOWA POZYCJI 1, która pojechała
  // bez pomiaru. Lot zdjął nagłówkowi sekcji stopień i tym samym ZRÓWNAŁ go
  // z jego własnym licznikiem, który został na `--text-sm` — a rejestr cytuje
  // w dowodzie wpisu #2 zakres `v3/screens/today.css:42-49`, czyli nagłówek
  // RAZEM z licznikiem. Regresję wywołał sam lot, w tej samej rodzinie
  // selektorów, i nie mierzyła jej ani jedna para. `positionsWithPairs` się nie
  // rusza — pozycja była objęta, tylko połową.
  //
  // 47 → 48 W TEJ SAMEJ NAPRAWIE I Z TEGO SAMEGO POWODU, na pozycji 2: lot
  // przepisał `.capacity` z cytatem na regułę prototypu i wziął z niej dwie
  // deklaracje z trzech. `positionsWithPairs` znowu bez zmian.
  //
  // 48 → 49 W TEJ SAMEJ NAPRAWIE: `.count` zszedł z wagi 400 na 500 razem ze
  // stopniem, a para była napisana tylko na stopień. Ten plik trzyma trzydzieści
  // linii wyżej regułę „waga osobno od stopnia, bo psuje się osobno" i naprawa
  // złamała ją na własnej dostawie.
  //
  // 49 → 50 PRZY LOCIE D9 FAZY D, 2026-08-12, I `notCovered` 4 → 3 W TYM SAMYM
  // RUCHU — bo to jest jedna rzecz, nie dwie: wpis „plakietka autorstwa planu"
  // przestał być odmową i stał się asercją (`D2-09b`). Warunek wyjścia, który
  // tamten wpis niósł od lotu D2, brzmiał „zaplanowane na dziś zadanie
  // z autorem-agentem w `dev/CollaborationHarness.tsx`" i został spełniony
  // ROŚNIĘCIEM FIKSTURY, a nie obniżeniem progu — plakietka rysowała się
  // poprawnie od D2, brakowało stanu, w którym mogłaby to zrobić.
  // `positionsWithPairs` się nie rusza: pozycja 9 miała parę na swoją drugą
  // połowę (`Open Calendar →`) już wtedy.
  pairs: 50,
  enforced: 49,
  pending: 1,
  notCovered: 3,
  lots: {
    D2: {
      // Dziewięć pozycji, wszystkie z parą. Rachunek pozycji jest rachunkiem
      // ZDAŃ rejestru, nie wpisów: #13 i #54 to jedno zdanie o daszku (pozycja
      // 6), #24 i #31 to jedno zdanie o rozróżnialności glifów (pozycja 7),
      // a #50 i #66 to jedno zdanie o licznikach (pozycja 8).
      positionsInBrief: 9,
      positionsWithPairs: 9,
      positionsWithoutPairs: [],
    },
    C1: {
      // Rejestr Fazy 4 (`faza-4-porownanie-ekranow.md`) jest briefem tej fazy.
      // Sześć jego wpisów ma tę JEDNĄ przyczynę, a lot rozcina ją na dwie
      // pozycje po tym, CO DA SIĘ ZMIERZYĆ I GDZIE: wiersz bieżący (pozycja 1,
      // powłoka lądowania, tutaj) i cel nadrzędny otwartego rekordu (pozycja 2,
      // za nawigacją — mapa trasowana).
      positionsInBrief: 2,
      positionsWithPairs: 1,
      positionsWithoutPairs: [2],
    },
    1: {
      // Pozycje briefu Lotu 1 (`docs/plans/2026-08-06-adopcja-jezyka-wizualnego/
      // faza-3-build-brief.md:180-196`).
      positionsInBrief: 15,
      // Pozycje, dla których mapa ma CO NAJMNIEJ jedną parę: wszystkie
      // piętnaście. Pozycja 14 dołączyła jako ostatnia, razem z lotem, który ją
      // oddał — do tego czasu była jedyną pozycją briefu bez pary.
      positionsWithPairs: 15,
      // Pozycja 10 ma wpis w `NOT_COVERED` na CZĘŚĆ swojej treści (hover), więc
      // nie liczy się tutaj — ma trzy pary.
      positionsWithoutPairs: [],
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
// `_section_` — 5, `_bar_` — 5, `_why_` — 6, `_action_` — 4,
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
    contract: ".ui-craft/tokens.md (Form first — ink and wash)",
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
    contract: ".ui-craft/tokens.md (Shape, motion, depth)",
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
    contract: ".ui-craft/tokens.md (Shape, motion, depth — elevation roles)",
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
    contract: ".ui-craft/tokens.md (Component layer — status-*)",
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
    contract: ".ui-craft/tokens.md (Component layer)",
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
    contract: ".ui-craft/tokens.md (Shape, motion, depth — Z roles)",
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
    contract: ".ui-craft/tokens.md (Dark theme — four surface planes)",
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
    contract: ".ui-craft/tokens.md (Dark theme)",
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
      '.ui-craft/tokens.md (What the accent is allowed to mean — "what is primary")',
    prototype: {
      file: "v3/app.css",
      lines: "321-332",
      value:
        "`.btn.primary { background: linear-gradient(180deg, var(--a-400), var(--a-500) 55%, var(--a-600)) }`, wybrany przez v3/screens/pipeline.js:409-410",
    },
    route: { surface: "pipeline" },
    subject: {
      // PODMIOT PRZEPIĘTY W LOCIE C2, i to jest przepięcie WYMUSZONE, nie
      // kosmetyczne: ten lot przeniósł akcję Lejka z `.crumbbar` do pasma
      // tytułu, a rząd, który po niej został, był pusty i został skasowany.
      // Selektor zostawiony na `_crumbbar_` wróciłby jako ROUTED_NOT_MEASURED,
      // co czyta się jak zepsuty przyrząd, a nie jak dowieziona poprawka.
      // Podmiotem jest ten SAM przycisk w tym samym stanie — zmieniło się
      // wyłącznie pasmo, w którym stoi.
      selector: "[data-pipeline-surface] .surface-header button",
      why: "R2 — one ruling for five surfaces; the title band holds exactly one button, which at rest is `primary-button`",
      app: "packages/desktop-ui/src/pipeline/PipelineSurface.tsx:840-872",
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
    contract: ".ui-craft/tokens.md (Component layer)",
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
    contract: ".ui-craft/tokens.md (Component layer)",
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
    contract: ".ui-craft/tokens.md (Component layer — quiet controls)",
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
    contract: ".ui-craft/tokens.md (Shape, motion, depth)",
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
    contract: ".ui-craft/tokens.md (Spacing and density)",
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
    contract: ".ui-craft/tokens.md (Type)",
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
    contract: ".ui-craft/tokens.md (Component layer)",
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
    contract: ".ui-craft/tokens.md (Component layer — status-*)",
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
      '.ui-craft/tokens.md (What the accent is allowed to mean — "what is primary")',
    prototype: {
      file: "v3/app.css",
      lines: "321-332",
      value: "`.btn.primary`, wybrany przez v3/screens/renewals.js:217",
    },
    route: { surface: "renewals" },
    subject: {
      // PRZEPIĘTE W LOCIE C2 razem z L2-08 i z tego samego powodu: `.crumbbar`
      // tego ekranu przestał istnieć, kiedy akcja weszła do pasma tytułu.
      //
      // PRZEPIĘTE PONOWNIE W LOCIE D10, i tym razem zmienił się PRZODEK, nie
      // podmiot. `data-renewals-surface` siedzi na PRZEWIJANYM PUDEŁKU, a pasmo
      // tytułu przestało być jego dzieckiem — jest jego rodzeństwem. Selektor
      // wracał przez to `NOT_MEASURED` nad ekranem, który rysuje ten przycisk
      // dokładnie tak jak wcześniej. Zakotwiczone w `main[data-surface]`
      // (`RealApp.tsx`) — deklaracji, która obejmuje OBA pasma i pudełko pod
      // nimi, i którą nagłówek tego pliku wymienia wprost jako stabilną.
      // `main` jest w selektorze konieczne: `.nav-item` w lewej kolumnie niesie
      // ten sam atrybut.
      selector: 'main[data-surface="renewals"] .surface-header button',
      why: "R2, the same ruling as L2-08; on this screen the title band holds exactly one button",
      app: "packages/desktop-ui/src/renewals/RenewalsSurface.tsx:806-835",
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
    contract: ".ui-craft/tokens.md (Component layer — shell bands)",
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
      // PRZEPIĘTE W LOCIE C2 NA PASMO TYTUŁU, i to nie jest to samo, co
      // zostawienie go na `_crumbbar_`. Rząd, o którym ta para mówiła „licznik
      // ma z niego wyjść", ZNIKNĄŁ — akcja przeniosła się do pasma tytułu.
      // Selektor pod nieistniejącym rodzicem liczyłby zero ZAWSZE i przestałby
      // cokolwiek pilnować, a nota niżej opisuje dokładnie ten mechanizm.
      // Pytanie zostaje to samo, o rząd, w którym akcja stoi DZIŚ.
      // PRZEPIĘTE W LOCIE D10 RAZEM Z L3-06, I TO JEST WAŻNIEJSZE TUTAJ NIŻ
      // TAM. Ta para oczekuje ZERA, więc przetrwałaby przepięcie pasm w ciszy —
      // liczba zero nad przodkiem, który przestał zawierać pasmo, jest zerem
      // z NIE TEGO powodu, czyli zielenią nad pustym dowodem. Kotwica ta sama
      // co u sąsiadki, żeby oba odczyty dalej mówiły o tym samym rzędzie.
      selector:
        'main[data-surface="renewals"] .surface-header [class*="_count_"]',
      why: "counted at zero: the position is that the counter must leave the row the screen's action stands in, and any selector for the NEW band would prescribe markup the lot chooses",
      app: "packages/desktop-ui/src/renewals/RenewalsSurface.tsx:786-788",
    },
    read: { property: null },
    // LICZBA ZERO SAMA NIE ODRÓŻNIA „licznik wyszedł" OD „cały rząd zniknął",
    // i przy odbiorze 2026-08-07 to rozróżnienie zrobiła para sąsiednia, a nie
    // ta: L3-06 czyta `.surface-header button` NA TYM SAMYM przystanku
    // i wraca MATCH z osądzonym malowaniem, czyli rząd stoi i ma w sobie
    // przycisk. Dopiero te dwa odczyty razem znaczą „licznik go opuścił".
    // Kto kiedyś usunie L3-06, zabiera tej parze jej jedyny kontrapunkt.
    //
    // I DOKŁADNIE TO WYDARZYŁO SIĘ W LOCIE C2, tylko o rząd wyżej: rzędem,
    // z którego licznik miał wyjść, był wtedy `.crumbbar`, a lot C2 skasował
    // go w całości. Obie pary przeszły więc na pasmo tytułu RAZEM — gdyby
    // przeszła sama L3-07, jej zero opisywałoby nieistniejącego rodzica.
    //
    // CZEGO TA PARA ZACZĘŁA KOSZTOWAĆ MNIEJ PO LOCIE C2 — dopisane 2026-08-11
    // po przeglądzie, żeby następny lot wiedział, co zabiera, ruszając wspólny
    // komponent. Jej podmiotem nie jest już rząd pisany z palca na tym ekranie,
    // do którego ktokolwiek mógł dopisać węzeł, tylko `SurfaceTitleBand` —
    // komponent renderujący DOKŁADNIE `<header className="surface-header">`
    // z tytułem i slotem akcji. Zero jest przy takim rodzicu bliskie
    // automatycznemu i NIE jest już świadectwem o niczyjej dyscyplinie.
    // Falsyfikowalna zostaje mimo to, i dlatego zostaje przy zerze: slot akcji
    // przyjmuje dowolny `ReactNode` WEWNĄTRZ `.surface-header`, więc regresja
    // wkładająca licznik do slotu akcji dalej wraca czerwienią. Kto da
    // `SurfaceTitleBand` trzecie dziecko albo pozwoli mu owinąć treść ekranu,
    // ma tę parę przepiąć na miejsce, w którym licznik ma STAĆ
    // (`[data-renewals-surface] [class*="_viewbar_"] [class*="_count_"]`,
    // `equals: 1`) — asercja na obecność nie ogląda się na cudzy kształt.
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    id: "L3-08",
    lot: 3,
    position: 8,
    kind: "prescribed",
    title: "Show/Hide draws its own chevron",
    contract: ".ui-craft/tokens.md (Component layer)",
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
    contract: ".ui-craft/tokens.md (Spacing and density)",
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
    contract: ".ui-craft/tokens.md (Type)",
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
    contract: ".ui-craft/tokens.md (Type)",
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
    contract: ".ui-craft/tokens.md (Type)",
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
    contract: ".ui-craft/tokens.md (Type)",
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
    contract: ".ui-craft/tokens.md (Spacing and density)",
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
    contract: ".ui-craft/tokens.md (Component layer — status-*)",
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
    // trzyma" i tam stoi NIE, z powołaniem na `.ui-craft/brief.md`
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
    contract: ".ui-craft/tokens.md (Shape, motion, depth)",
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
    contract: ".ui-craft/tokens.md (Type)",
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
    contract: ".ui-craft/tokens.md (Type)",
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
    contract: ".ui-craft/tokens.md (Spacing and density)",
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
    contract: ".ui-craft/tokens.md (Shape, motion, depth — Z roles)",
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
      '.ui-craft/tokens.md (What the accent is allowed to mean — "where the reader is")',
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
    contract: ".ui-craft/tokens.md (Shape, motion, depth)",
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
    contract: ".ui-craft/tokens.md (Shape, motion, depth)",
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
    contract: ".ui-craft/tokens.md (Spacing and density)",
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
    contract: ".ui-craft/tokens.md (Spacing and density)",
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
  //
  // ── ODBIÓR 2026-08-07: DZIESIĘĆ PAR PRZECHODZI NA „enforced" ──────────────
  // Przelot zwrócił DOKŁADNIE dwadzieścia `ROUTED_PENDING_ALREADY_MATCHES`
  // (dziesięć par × dwa motywy) i nic więcej: 0 DIFFERS, 0 NOT_MEASURED,
  // 0 ROUTE_FAILED, pięć przelotów geometrii bez przepełnienia, loty 2-4 bez
  // ruchu (28 / 22 / 34 MATCH). Przed przełączeniem sprawdzono to, czego
  // krzyk sam z siebie NIE dowodzi — czy pary nie pasują przypadkiem:
  //
  //   • MAPA NIE ZOSTAŁA PRZESUNIĘTA POD KOD. `git diff 8860d06` na tym pliku
  //     nie rusza ŻADNEGO `subject.selector`, `read.property` ani `expect` —
  //     zmienia się wyłącznie trasa L5-03a, komentarze i licznik `blind`.
  //     To samo sprawdzono na `heading-typography.mjs` (skasowane WPISY DŁUGU,
  //     nietknięty skaner) i na `verify-renderer-layout.mjs` (dołożony krok
  //     `treeKey`, wpisany do `routeKey`, więc przystanek się nie zlewa).
  //   • L5-03a NIE PASUJE PRZEZ ZBIEG OKOLICZNOŚCI. `--text-xl` to 22 px, a
  //     wada polegała na dziedziczonym `1.5em` — te dwie liczby potrafią się
  //     zejść. Sprawdzone w ŹRÓDLE, nie w wartości wyliczonej:
  //     `styles.css` deklaruje na `.knowledge-welcome h2` jawne
  //     `font-size: var(--text-xl)` i `font-weight: 600`.
  //   • POŁOWA WCAG POZYCJI 1 I 9 ZMIERZONA OSOBNO. Para czyta `boxShadow`
  //     W SPOCZYNKU, więc dowodzi tylko, że kanał cienia jest wolny — nie że
  //     pierścień się maluje. Zmierzone niezależnym przelotem PRAWDZIWYMI
  //     klawiszami (`.focus()` ze skryptu nie uzbraja `:focus-visible`), oba
  //     motywy, oba wiersze: spoczynek `none`, po ArrowDown `:focus-visible`
  //     prawdziwe i pełny pierścień (1 px akcentu + 3 px poświaty + 14 px
  //     rozmycia). Dług #3 Fazy 2 zamknięty NA POMIARZE.
  //
  // TRZY PARY ZOSTAŁY PRZY TYM ZAOSTRZONE, i wszystkie trzy razy jest to werdykt
  // o przyrządzie, nie o locie — za każdym razem ta sama pomyłka: asercja
  // mierzyła NIEOBECNOŚĆ starej wady, a nie OBECNOŚĆ dostawy.
  //
  //   • L5-02 nosiła tytuł o PASIE DATY i asertowała `display: grid`, czyli
  //     obecność siatki nad wierszem, w którym data mogła dalej być sklejona
  //     z kontekstem. Rozpad na L5-02a i L5-02b.
  //   • L5-01 i L5-09 czytały wyłącznie `boxShadow: none` — zdanie prawdziwe
  //     także o wierszu, z którego skasowano CAŁĄ regułę zaznaczenia. Dołożone
  //     L5-01b i L5-09b czytają wypełnienie `--accent-quieter`; stare pary
  //     zmieniły identyfikator na `a` i nic poza nim.
  //
  // Księgowość podniesiona w tych samych przebiegach (patrz
  // `VISUAL_LANGUAGE_ROUTED_EXPECTED`): 57 → 58 → 60.
  //
  // CZEGO TE PARY DALEJ NIE PILNUJĄ, spisane, żeby cisza nie uchodziła za
  // werdykt:
  //   • SAMEGO MALOWANIA PIERŚCIENIA (patrz wyżej). L5-01a i L5-09a czytają
  //     spoczynek, więc dowodzą, że kanał `box-shadow` jest wolny — nie że coś
  //     się na nim rysuje. Mierzy to dziś wyłącznie przelot doraźny.
  //   • ZAZNACZENIA POD KURSOREM. Wszystkie cztery pary pozycji 1 i 9 czytają
  //     wiersz W SPOCZYNKU, a przelot nigdy nie najeżdża myszą. Odbiór zmierzył
  //     w Chromium, że `.row:hover` w `sources.module.css` bił jednoklasowe
  //     `.rowSelected` i przemalowywał zaznaczony wiersz na neutralnie —
  //     poprawione tam na dwuklasowy selektor, ale ŻADNA bramka tego nie widzi.
  //   • PRZESUNIĘCIA DATY DO PRAWEJ. L5-02b liczy ELEMENT, nie jego pas: kto
  //     zostawi `<time>` i skasuje `margin-left: auto`, przejdzie na zielono.
  //     Element jest liczony świadomie — wyliczony `margin-left: auto` na
  //     elemencie flex wraca jako piksele, więc asercja literalna byłaby
  //     zielona przypadkiem albo czerwona przy każdej zmianie szerokości.
  //   • POZYCJI 11 I 12, które nie mają pary z założenia. Pozycja 11 ma CZTERY
  //     miejsca wywołania (`LibraryShell.tsx`, `FolderTree.tsx`,
  //     `NotesReading.tsx`, `SourcesReading.tsx`) i ŻADNEGO nie czyta dziś
  //     przyrząd — ani ta mapa, ani skan arkuszowy. Poprzednia wersja tej noty
  //     mówiła „PIĘĆ miejsc, dwa zmierzone w pikselach"; obie liczby były
  //     nieprawdziwe i żadna nie miała artefaktu, do którego można wrócić.
  {
    id: "L5-01a",
    lot: 5,
    position: 1,
    kind: "restyle",
    title: "the selected note row stops painting a literal shadow",
    contract: ".ui-craft/tokens.md (Shape, motion, depth — elevation roles)",
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
    // TA PARA CZYTA SPOCZYNEK, więc dowodzi POŁOWY pozycji: kanał `box-shadow`
    // jest wolny. Druga połowa — że pierścień faktycznie się na nim maluje —
    // została zmierzona przy odbiorze osobnym przelotem prawdziwych klawiszy
    // i NIE MA dziś stałej bramki. Zapisane u góry sekcji jako reszta.
    status: "enforced",
  },
  {
    // DOŁOŻONA PRZY ODBIORZE LOTU 5, 2026-08-07, I JEST TO TA SAMA KLASA
    // ZAOSTRZENIA, CO L5-02b. `L5-01a` czyta „cienia NIE MA" — a to zdanie
    // przechodzi na zielono również nad wierszem, z którego skasowano CAŁĄ
    // regułę zaznaczenia. Bramka certyfikowała nieobecność starej wady i nie
    // dotykała tego, co pozycja faktycznie dowiozła: wypełnienia akcentem.
    // „Nieobecność defektu" i „obecność dostawy" to dwa różne pomiary i drugi
    // z nich nie istniał.
    //
    // ZŁAMANA I PRZYWRÓCONA, ZANIM ZOSTAŁA ZAPISANA JAKO „enforced": obie nowe
    // pary przestawiono na `var(--surface-selected)` (czyli na stan sprzed
    // lotu) i przelot wrócił DIFFERS w obu motywach, kodem 1 —
    // `oklch(1 0 0 / 0.075)` w ciemnym i `oklch(0.12 0.006 255 / 0.07)`
    // w jasnym przeciwko oczekiwanemu akcentowi. Zielone dlatego, że mierzą,
    // a nie dlatego, że nie umieją zaczerwienić się.
    id: "L5-01b",
    lot: 5,
    position: 1,
    kind: "restyle",
    title:
      "the selected note row is washed with the accent instead of a neutral fill",
    contract:
      '.ui-craft/tokens.md — „Accent rule", zadanie 1 („Where the reader is")',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "145",
      value:
        '`.kn-row[aria-selected="true"] { background: var(--accent-quieter) }`',
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: ".knowledge-document-list li button.active",
      why: "the same subject as L5-01a read on the other channel: the paint the position delivers, not the literal it removed. `--surface-selected` here would be the pre-lot state and would fail",
      app: "packages/desktop-ui/src/styles.css (`.knowledge-document-list li button.active`)",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "token", token: "--accent-quieter" },
    // CZEGO I TA PARA NIE WIDZI: stanu POD KURSOREM. Przelot nie najeżdża myszą,
    // więc reguła `:hover` bijąca zaznaczenie byłaby dla obu par niewidzialna —
    // dokładnie to zdarzyło się na bliźniaczej liście Źródeł i zostało złapane
    // pomiarem ręcznym, nie tutaj. Na tej liście `li button.active` i
    // `li button:hover` ważą tyle samo, a `.active` stoi w arkuszu NIŻEJ, więc
    // wygrywa — tak samo jak w prototypie (`:144` przed `:145`).
    status: "enforced",
  },
  {
    id: "L5-02a",
    lot: 5,
    position: 2,
    kind: "restyle",
    title: "the note row is laid out as a grid",
    contract: ".ui-craft/tokens.md (Spacing and density)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "138-143",
      value: "`.kn-row { display: grid }`",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: ".knowledge-document-list li button",
      why: "global class; the app lays the row out as a flex row with space-between, which is why the date is the thing that ellipses",
      app: "packages/desktop-ui/src/styles.css:6713-6725",
    },
    read: { property: "display" },
    expect: { kind: "literal", value: "grid" },
    status: "enforced",
  },
  {
    // ZAOSTRZENIE PRZY ODBIORZE LOTU 5, 2026-08-07, I JEST TO WERDYKT
    // O PRZYRZĄDZIE, NIE O LOCIE. Jedna para nosiła tytuł „a grid with its own
    // DATE LANE" i asertowała wyłącznie `display: grid`. Te dwa zdania nie są
    // tym samym zdaniem: pas daty jest CAŁYM defektem tej pozycji — data była
    // tym, co wielokropek zjadał w kolumnie, którą czytelnik skanuje w dół —
    // a `display: grid` przechodzi na zielono nad wierszem, w którym kontekst
    // i data dalej są jednym sklejonym napisem. Bramka mierząca OBECNOŚĆ
    // siatki nigdy nie zmierzy pasa daty, więc pas dostaje własną parę.
    //
    // LICZONA JEST OBECNOŚĆ ELEMENTU, nie jego `margin-left`. Wyliczony
    // `margin-left: auto` na elemencie flex wraca jako liczba pikseli, a nie
    // jako „auto", więc asercja literalna byłaby zielona przypadkiem albo
    // czerwona przy każdej zmianie szerokości. Rozdzielenie daty na WŁASNY
    // element z własną klasą jest tym, co regresja musiałaby cofnąć.
    id: "L5-02b",
    lot: 5,
    position: 2,
    kind: "prescribed",
    title: "the date has its own lane instead of sharing the context string",
    contract: ".ui-craft/tokens.md (Spacing and density)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "175-178",
      value:
        "`.kn-row-when { margin-left: auto; flex: none; font-variant-numeric: tabular-nums }` — osobny element, osobny pas",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: ".knowledge-document-list li button time.knowledge-row-when",
      why: "counted; `<time>` because the date is now the only content of its element, which is also the first point at which the machine-readable value has anywhere to live (NotesReading.tsx). Merging the date back into the context string — the defect this position names — removes this element and nothing else in the map would notice",
      app: "packages/desktop-ui/src/styles.css:6635-6642, NotesReading.tsx",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 1 },
    status: "enforced",
  },
  {
    id: "L5-03a",
    lot: 5,
    position: 3,
    kind: "restyle",
    title: "the knowledge welcome heading declares a size",
    // TO JEST DOKŁADNIE TA WADA, DLA KTÓREJ ZBUDOWANO SONDĘ TYTUŁU — i obie
    // siedzą poza jej podmiotem, bo `TITLE_SELECTOR` to `#surface-title`.
    contract: ".ui-craft/tokens.md (Type)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "242-245",
      value:
        "`.kn-reader-title { font-size: var(--text-xl); font-weight: 600 }`",
    },
    // TRASA MA TERAZ TRZECI KROK i to on zdejmuje z tej pary status BLIND.
    // `treeKey` wskazuje na folder-liść NAJWYŻSZEGO poziomu bez notatek
    // (`dev/library-fixture.ts`, `libraryFolderIds.archive`), bo tylko pusty
    // widok wpuszcza ekran w gałąź `else` czytelni. Przystanek jest ODDZIELNY
    // od „library | notes | - | - | -", więc sześć pozostałych par Notatek
    // dalej mierzy swój własny stan — dwa stany jednego ekranu, każdy pod
    // swoim adresem, zamiast jednej fikstury, która nie utrzyma obu naraz.
    route: {
      surface: "library",
      layout: "notes",
      treeKey: "00000000-0000-4000-8000-000000000507",
    },
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
    // notatek zabiera podmiot L5-01a/b, L5-02a/b, L5-04, L5-05, L5-07 i L5-08
    // na tym samym przystanku. To nie jest brak danych, tylko dwa stany tego samego
    // ekranu, których jedna fikstura nie trzyma naraz.
    // WYMÓWKA FIKSTUROWA ZDJĘTA 2026-08-07 PRZEZ LOT 5 — obie jej części
    // dowiezione dokładnie tak, jak je opisywała: (1) `libraryFolderIds.archive`
    // w `dev/library-fixture.ts` jest folderem-liściem najwyższego poziomu bez
    // notatek (`notesInSelection` bierze całe poddrzewo, więc folder z dziećmi
    // nie wystarczyłby); (2) `walkRouteInPage` ma krok `treeKey`, a `routeKey`
    // go NIESIE, więc ten przystanek nie zlewa się z przystankiem pozostałych
    // par Notatek. Para mierzy dziś prawdziwy element — nie jest już pozycją
    // bez dowodu.
    //
    // SPRAWDZONE W ŹRÓDLE PRZED PRZEŁĄCZENIEM, bo akurat ta para mogła pasować
    // przypadkiem: `--text-xl` to 22 px, a wada polegała na dziedziczonym
    // `1.5em`, które przy odpowiednim rodzicu daje te same 22 px. `styles.css`
    // deklaruje dziś na `.knowledge-welcome h2` jawne `font-size: var(--text-xl)`
    // — pomiar nie jest zbiegiem okoliczności. Wagę tej samej reguły trzyma
    // osobno `scripts/heading-typography.mjs`, który nie ma już dla niej wpisu
    // długu.
    status: "enforced",
  },
  {
    id: "L5-03b",
    lot: 5,
    position: 3,
    kind: "restyle",
    title: "the sources welcome heading declares a size",
    contract: ".ui-craft/tokens.md (Type)",
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
    // przystanku (L5-06, L5-09a/b, L5-10) czytają wiersze źródeł.
    blind:
      'fixture: „[class*="_welcome_"]' +
      "” w Źródłach rysuje się TYLKO przy `sources.length === 0` (SourcesReading.tsx:325-327, 455), " +
      "a odczyt nie ma ani filtra, ani sposobu odznaczenia — więc żaden krok trasy tam nie dojdzie. " +
      "Pusta lista źródeł zabiera z kolei podmiot L5-06, L5-09a/b i L5-10 na TYM SAMYM przystanku. " +
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
    contract: ".ui-craft/tokens.md (Type)",
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
    // JEDEN Z SIEDMIU NAGŁÓWKÓW tej pozycji — reszta nie ma tu pary i nie musi
    // jej mieć: `scripts/heading-typography.mjs` skanuje WSZYSTKIE arkusze
    // i po tym locie nie trzyma ani jednego wpisu długu z właścicielem
    // „lot 5 #4" (79 zadeklarowanych, 22 znane, 0 niedopasowanych).
    status: "enforced",
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
    // R1 ROZSTRZYGNIĘTY NA KORZYŚĆ PROTOTYPU I KONTRAKT JUŻ TO NIESIE:
    // `.ui-craft/tokens.md`, „Accent rule", zadanie 1 („Where the reader is")
    // wymienia zwykłe zaznaczenie wiersza i cytuje `v3/screens/knowledge.css:145`
    // oraz `:46-49` imiennie. Zdanie briefu Fazy 3, że zaznaczenie wiersza
    // zostaje neutralne, pochodzi z POPRZEDNIEJ wersji kontraktu i jest przez
    // ten zapis uchylone. Wyliczone w obu motywach osobno (dark 0.64/0.2/295
    // przy alfie 0,08, light 0.55/0.21/295 przy 0,07).
    status: "enforced",
  },
  {
    id: "L5-06",
    lot: 5,
    position: 6,
    kind: "prescribed",
    title: '"What rests on this" says what kind of record each line is',
    contract: ".ui-craft/tokens.md (Component layer)",
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
    // TYTUŁ TEJ PARY MÓWI WIĘCEJ, NIŻ JEJ ASERCJA, i to jest zapisane, a nie
    // naprawione. Para liczy `svg` — czyli KWADRAT z glifem, dokładnie to, co
    // cytuje jej `prototype.value` (`.kn-ref-ico`). Rodzaju rekordu ten glif
    // NIE NIESIE: lot świadomie dał jeden neutralny glif dla wszystkich
    // rodzajów, bo mapa glif-na-rodzaj byłaby ręczną listą obok zamkniętego
    // słownika, a brakujący wpis rysowałby pustkę zamiast błędu. Rodzaj niesie
    // SŁOWO, i to słowo ma własny przyrząd, tylko w innym miejscu:
    // `packages/desktop-ui/test/sources-screen.interaction.test.tsx` asertuje
    // `[data-source-dependent-kind]` przeciwko `dependentKindLabel`. Pozycja
    // jest więc zmierzona w całości — dwoma przyrządami, nie jednym.
    status: "enforced",
  },
  {
    id: "L5-07",
    lot: 5,
    position: 7,
    kind: "restyle",
    title: "the arrangement switcher gets a sunken track",
    contract: ".ui-craft/tokens.md (Dark theme — four surface planes)",
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
    // DECYZJA ZAPADŁA I ZOSTAŁA ZMIERZONA PRZY ODBIORZE. Lot nie wziął żadnego
    // z dwóch wyjść reconu, tylko trzecie — WCIŚNIĘTY PRZYCISK JEST KCIUKIEM
    // (niesie `--surface-elevated`, `--shadow-sm` i `--edge-top`). W geometrii
    // bramki (1092 px, 300% tekstu) tor faktycznie zawija się na DWA wiersze,
    // zostając w panelu z 36 px zapasu — czyli kciuk pozycjonowany absolutnie
    // stanąłby pod złym przyciskiem dokładnie tak, jak przewidywał recon.
    // KOSZT NAZWANY: `--ease-spring` nie dostaje z tego lotu konsumenta
    // (sprawdzone: zero trafień `var(--ease-spring)` poza `tokens.css`).
    status: "enforced",
  },
  {
    id: "L5-08",
    lot: 5,
    position: 8,
    kind: "prescribed",
    title: "the folder tree draws folders",
    contract: ".ui-craft/tokens.md (Component layer)",
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
    // RYZYKO POWYŻEJ ZMIERZONE PRZY ODBIORZE, NIE ODHACZONE. Węzeł ma dziś
    // cztery tory (`14px 14px 216px 7px`), a przelot „Library at 300% text"
    // wrócił bez przepełnienia; osobny pomiar w tej samej geometrii daje
    // 24 px zapasu między najszerszym węzłem a ścianą panelu. Sam glif jest
    // liczony w obu motywach (8 `svg` na 6 węzłach: folder na każdym, chevron
    // na rozwijalnych).
    status: "enforced",
  },
  {
    id: "L5-09a",
    lot: 5,
    position: 9,
    kind: "restyle",
    title: "the selected source row stops painting a literal shadow",
    contract: ".ui-craft/tokens.md (Shape, motion, depth — elevation roles)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "145-150",
      value: "to samo, co L5-01a — zaznaczenie bez cienia",
    },
    route: { surface: "library", layout: "sources" },
    subject: {
      selector: '[role="option"][class*="_rowSelected_"]',
      why: "CSS Module twin of L5-01a, narrowed by role=option (SourcesReading.tsx:99) because EIGHT distinct _rowSelected_ classes exist across the built chunks; it is a Tab stop (hooks/useListNavigation.ts:54), so the erased focus ring is reachable",
      app: "packages/desktop-ui/src/library/sources.module.css:132-135",
    },
    read: { property: "boxShadow" },
    expect: { kind: "literal", value: "none" },
    // TA SAMA POŁÓWKA, CO W L5-01a: para czyta spoczynek. Że pierścień NAPRAWDĘ
    // się maluje, zmierzono przy odbiorze osobno i prawdziwymi klawiszami —
    // wiersz osiągnięty ArrowDownem ma `:focus-visible` i pełny pierścień
    // w obu motywach, a jego `tabindex` jest w tej chwili „0", co potwierdza
    // wprost tezę lotu: komponent przestawia roving stop ZANIM przeniesie
    // ognisko, więc reguła powłoki go dosięga i lokalna reguła byłaby martwa.
    status: "enforced",
  },
  {
    // DOŁOŻONA PRZY ODBIORZE LOTU 5, 2026-08-07 — bliźniaczka L5-01b, i to na
    // TEJ liście jej brak kosztował naprawdę. `L5-09a` czyta „cienia nie ma",
    // co jest prawdą również o wierszu bez żadnego zaznaczenia; wypełnienia
    // akcentem nie czytało nic. Odbiór zmierzył w Chromium, że jednoklasowe
    // `.rowSelected` przegrywało z `.row:hover` i zaznaczony wiersz wracał pod
    // kursorem do neutralnego tła — wada, którą arkusz naprawił dwuklasowym
    // selektorem, a której TA para dalej nie widzi, bo przelot nie najeżdża
    // myszą. Mierzy więc spoczynek, i to jest o jeden kanał więcej niż wcześniej,
    // a nie komplet.
    id: "L5-09b",
    lot: 5,
    position: 9,
    kind: "restyle",
    title:
      "the selected source row is washed with the accent instead of a neutral fill",
    contract:
      '.ui-craft/tokens.md — „Accent rule", zadanie 1 („Where the reader is")',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "145",
      value:
        '`.kn-row[aria-selected="true"] { background: var(--accent-quieter) }`',
    },
    route: { surface: "library", layout: "sources" },
    subject: {
      selector: '[role="option"][class*="_rowSelected_"]',
      why: "the same subject as L5-09a on the other channel; `--surface-selected` here would be the pre-lot state and would fail",
      app: "packages/desktop-ui/src/library/sources.module.css (`.row.rowSelected`)",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "token", token: "--accent-quieter" },
    status: "enforced",
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
    contract: ".ui-craft/tokens.md (Component layer — status-*)",
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
    // I PARA WESZŁA POD DRUGI PRZYRZĄD, o co ta pozycja chodziła: konsument
    // deklaruje dziś obie połowy `--status-success` / `--status-success-bg`,
    // więc `scripts/consumer-contrast.test.mjs` i `status-contrast.test.mjs`
    // sądzą realny konsument, a nie samą parę tokenów. Oba przeszły.
    status: "enforced",
  },

  // ══ LOT 6 — SETTINGS ══════════════════════════════════════════════════════
  // Trasa całego lotu: klik `[data-settings-entry]`. Wejście PODMIENIA lewą
  // kolumnę, więc ten cel idzie OSTATNI albo trzeba z niego wyjść przez
  // `[data-settings-back]` — inaczej pozycja nawigacji następnego celu przestaje
  // istnieć i przelot zmierzy Ustawienia pod cudzą etykietą.
  //
  // DWIE PARY TEGO LOTU ROZPADŁY SIĘ PRZY ODBIORZE, 2026-08-07, I OBIE Z TEGO
  // SAMEGO POWODU, CO L5-01b I L5-09b W TYM SAMYM PLIKU: mierzyły NIEOBECNOŚĆ
  // STAREJ WADY, a nie OBECNOŚĆ DOSTAWY, i to są dwa różne zdania. „Nawigatora
  // w treści nie ma" jest prawdą także o aplikacji, w której nikt nigdzie nie
  // mówi, gdzie czytelnik jest; „etykieta nie zawija" jest prawdą także
  // o etykiecie wciśniętej w tor ikony 1,1 rem, bo `nowrap` daje wtedy
  // WYLANIE, nie zawinięcie. Obie połowy zostają, każda ze swoim odczytem.
  {
    id: "L6-02a",
    lot: 6,
    position: 2,
    kind: "prescribed",
    title: "the second settings navigator is gone",
    contract: ".ui-craft/tokens.md (Component layer — shell-*)",
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
    risk: "TO JEST ZAŁOŻENIE O KSZTAŁCIE, NIE POMIAR: brief mówi „trzy nawigatory zamiast jednego” i wskazuje przeprowadzkę `aria-current`, ale nie deklaruje, KTÓRY z trzech zostaje. Ryzyko domyka dopiero L6-02b: kasując tamten nawigator i NIE oznaczając bieżącej sekcji w kolumnie trybu, przechodzi się tę parę i oblewa tamtą.",
    status: "enforced",
  },
  {
    // DRUGA POŁOWA POZYCJI 2, DOŁOŻONA PRZY ODBIORZE. Nie da się jej wyczytać
    // z ekranu Ustawień — znacznik „tu jesteś" stoi od tego lotu w POWŁOCE
    // (`RealApp.tsx`), więc para jest jedynym miejscem w mapie, które pyta, czy
    // przeprowadzka faktycznie dojechała. Sonda wierności to RAPORTUJE
    // (`navActiveSelectors` wypisuje dziś `.settings-mode-column
    // .nav-item[aria-current="location"]` jako 1 on screen), ale nie jest to
    // strażnik: lista selektorów malujących z `--nav-active-bg` zostaje
    // niepusta dzięki samej powłoce, więc skasowanie TEJ reguły nie zapala
    // `VISUAL_PROBE_NO_NAV_ACTIVE_RULE`. Raport i bramka to nie to samo.
    id: "L6-02b",
    lot: 6,
    position: 2,
    kind: "restyle",
    title: "and the one that stays says where the reader is",
    contract:
      '.ui-craft/tokens.md (What the accent is allowed to mean — "what is active")',
    prototype: {
      file: "v3/screens/settings.css",
      lines: "74-80",
      value:
        "`.st-nav-item[aria-current]` — zaznaczona sekcja niesie WYPEŁNIENIE, wagę i szynę, nie sam kolor pisma",
    },
    route: { settingsMode: true },
    subject: {
      selector: '.settings-mode-column .nav-item[aria-current="location"]',
      why: "the shell's own carrier: zero matches here means either nothing is marked as current (the fact never crossed from the surface to the shell) or it is marked somewhere the reader's column is not",
      app: "packages/desktop-ui/src/RealApp.tsx:3306-3308, styles.css:1415-1420",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "token", token: "--nav-active-bg" },
    status: "enforced",
  },
  {
    id: "L6-03a",
    lot: 6,
    position: 3,
    kind: "restyle",
    title: "the mode column stops wrapping its labels",
    // POZYCJA WYPROWADZONA Z KASKADY, NIE Z RENDERA (brief zabraniał lotowi
    // rekonesansu przeglądarki). `.settings-mode-column` nie ma w `styles.css`
    // ANI JEDNEJ reguły — sprawdzone grepem — więc etykieta dziedziczy siatkę
    // `.nav-item` z torem ikony, a `nowrap` celuje w `nth-child(2)`, którego ta
    // kolumna nie renderuje.
    contract: ".ui-craft/tokens.md (Spacing and density)",
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
    // ZMIERZONY BREAK-TEST TEJ PARY, wykonany przez lot: pierwsza wersja
    // poprawki deklarowała `white-space` wyłącznie na `> span`, i para wróciła
    // DIFFERS z `observed: normal`. Czyli ten odczyt UMIE oblać — nie jest
    // oczekiwaniem, które nigdy nie zawodzi. Nie umie natomiast odróżnić
    // etykiety w SWOIM torze od etykiety wylewającej się z toru ikony, i po to
    // stoi obok L6-03b.
    status: "enforced",
  },
  {
    // DRUGA POŁOWA POZYCJI 3, I TO ONA JEST SAMĄ POZYCJĄ. Brief nazywa wadę
    // wprost: „etykiety lądują w torze ikony 1,1 rem", bo `.nav-item` jest
    // siatką trzytorową, a wpis sekcji renderuje JEDNO dziecko. Zmierzone przez
    // lot przed poprawką przy 1440 px: `grid-template-columns` wpisu wynosiło
    // `17.5938px 143.406px 0px`, a etykieta miała 17,59 px szerokości.
    //
    // LICZY SIĘ LICZBA TORÓW, NIE ICH SZEROKOŚĆ, i to jest cała treść nowego
    // rodzaju oczekiwania `tracks`: szerokość jednego toru jest funkcją okna
    // (177 px przy 1440), więc `literal` albo `rem` przypinałyby liczbę, która
    // zmienia się przy każdej zmianie szerokości kolumny. Liczba torów nie.
    //
    // DEKLARACJA JEST JUŻ PILNOWANA REGEXEM PO ŹRÓDLE ARKUSZA
    // (`settings-navigation-contract.test.ts`), i to jest DRUGI kanał, nie ten
    // sam: tamten czyta NAPIS w `styles.css`, ten czyta ROZWIĄZANĄ wartość na
    // narysowanym elemencie. Pamięć tego projektu ma osobny wpis o czterech
    // regexach, które były zielone nad zachowaniem, które nie działało.
    id: "L6-03b",
    lot: 6,
    position: 3,
    kind: "restyle",
    title: "and the label gets a track of its own beside the glyph's",
    contract: '.ui-craft/patterns.md — „Pattern: Settings mode column"',
    prototype: {
      file: "v3/screens/settings.css",
      lines: "61-71",
      value:
        "`.st-navitem` — tor glifu (`.ico`, 0,9375 rem) i etykieta obok niego (`.lbl { flex: 1; min-width: 0 }`), czyli DWA tory, nie jeden i nie trzy",
    },
    route: { settingsMode: true },
    subject: {
      selector: ".settings-mode-column .settings-mode-section",
      why: "the entry itself, not its label: the grid is declared on the entry, so the entry is where the defect resolves",
      app: "packages/desktop-ui/src/styles.css (.settings-mode-column .nav-item)",
    },
    read: { property: "gridTemplateColumns" },
    // 1 → 2 PRZY LOCIE D5 FAZY D, I JEST TO POPRAWKA ASERCJI, NIE ROZLUŹNIENIE.
    // Ta para powstała przy locie 6 Fazy 3 nad wpisem, który renderował JEDNO
    // dziecko: etykieta lądowała wtedy w torze IKONY (zmierzone: tor 17,59 px,
    // trzy pozycje po 51 px wysokości), a jedyny tor był lekarstwem, bo ikony
    // nie było. Cytat pod parą mówił nawet „bo wpis nie ma toru ikony" — i to
    // zdanie było prawdą O APLIKACJI, a nie o prototypie: `.st-navitem` rysuje
    // `icon(s.icon, "ico")` PRZED etykietą (`v3/screens/settings.js:983`).
    // Wpis #69 rejestru („spis sekcji bez ikon") żąda dokładnie tego glifu,
    // więc zostawienie `equals: 1` znaczyłoby, że bramka zabrania oddać wpis.
    // Prototyp wygrywa z asercją napisaną wobec jego braku; to, czego ta para
    // pilnuje, nie zmienia się — etykieta ma SWÓJ tor, nie tor glifu.
    expect: { kind: "tracks", equals: 2 },
    status: "enforced",
  },
  {
    id: "L6-04",
    lot: 6,
    position: 4,
    kind: "restyle",
    title: "the two named settings actions are filled with the accent",
    contract:
      '.ui-craft/tokens.md (What the accent is allowed to mean — "what is primary")',
    prototype: {
      file: "v3/app.css",
      lines: "321-332",
      value:
        "`.btn.primary` (gradient a-400/a-500/a-600), wybrany w v3/screens/settings.js:812 " +
        "dla „Choose a vault folder…” i :830 dla „Export to Markdown…”, czyli dla OBU " +
        "przycisków, które ta para mierzy (:779 to „Import N notes”, drugi stan tej samej " +
        "tafli importu — nie trzeci akcent)",
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
      // ODWZOROWANIE V3↔APLIKACJA JEST 1:1 NA OBU PRZYCISKACH — POPRAWIONE
      // PRZY ODBIORZE, BO POPRZEDNIA WERSJA TEGO AKAPITU BYŁA NIEPRAWDZIWA
      // I UCZYŁA ZŁEJ REGUŁY. Mówiła: „zgadza się JEDEN przycisk … akcent na
      // «Export to Markdown…» bierze się Z BRIEFU, nie z prototypu". Policzone
      // w źródle: `.btn.primary` stoi na ekranie Ustawień prototypu TRZY razy —
      // `v3/screens/settings.js:812` „Choose a vault folder…" (↔
      // `data-notes-import-scan`), `:830` „Export to Markdown…" (↔
      // `data-notes-export`) i `:779` „Import N notes", które jest DRUGIM
      // STANEM tej samej tafli importu co :812, a nie trzecim akcentem.
      // Odpowiada mu `data-notes-import-run`, montowany dopiero po skanie,
      // więc w tym harnessie byłby ślepy — i to jest jedyne, czego ta para nie
      // mierzy. Fałszywe uzasadnienie kosztowałoby następnego czytelnika
      // dokładnie tyle: uznałby akcent na eksporcie za wymysł lotu, wpisał
      // sobie „prototyp maluje tu jeden przycisk" i przy najbliższej zmiany
      // zdjął jeden z dwóch.
      //
      // TO JEST TEŻ ŹRÓDŁO PRZEPISANIA KONTRAKTU: `.ui-craft/tokens.md`
      // „Usage constraints" 3 mówił do 2026-08-07 „one primary action per
      // view", czyli ZABRANIAŁ tego, co prototyp maluje. Punkt jest przepisany
      // na „jedna na POJEMNIK, który ją ma" i dalej czegoś zabrania: dwóch
      // akcentów w jednej tafli, akcentu na akcji niszczącej i akcentu na
      // czymkolwiek, co nie jest jedyną akcją główną swojego pojemnika.
      selector:
        ".settings-control button[data-notes-export], " +
        ".settings-control button[data-notes-import-scan]",
      why: "the two buttons Settings #4 names (SettingsSurface.tsx:2213-2222 export to Markdown, :2297-2306 choose a vault folder); both now carry .primary-button, which styles.css:8523 excludes by name from the generic secondary paint — before lot 6 that rule painted them --action-secondary-bg and 0 of 2 carried the accent",
      app: "packages/desktop-ui/src/styles.css:8523-8535 (the secondary paint and its two named exceptions), :8593-8599 (the accent that already existed on this screen and made the loose version pass), :724-727 (.primary-button), SettingsSurface.tsx:2213-2222, :2297-2306",
    },
    read: { property: "paint" },
    expect: { kind: "accentCount", atLeast: 2 },
    risk: "TA PARA WCIĄŻ NIE ODRÓŻNIA POPRAWKI POPRAWNEJ OD ZAKAZANEJ, i to jest zapisane, nie przeoczone: pomalowanie akcentem CAŁEJ reguły `.settings-control button` — którą brief nazywa wprost („zaspokoi oko i nie da sondzie NIC”) — pomaluje też te dwa przyciski i zaliczy tę parę. Zawężenie kupuje co innego: para mierzy TERAZ COKOLWIEK (przedtem przechodziła na akcencie raportu wsparcia, którego pozycja #4 w ogóle nie dotyczy). Dowód dostawy niesie `actionSelectors` sondy wierności, nie ta para.",
    // PRZEŁĄCZONE PRZY ODBIORZE, 2026-08-07, I RYZYKO WYŻEJ JEST DOMKNIĘTE
    // POMIAREM, nie obietnicą. Odczyt: 2 of 2 w obu motywach. Sonda wierności
    // wypisała w tym samym przebiegu `button.primary-button [.primary-button]
    // on renewals, meetings, settings — 4 on screen / 0 parked — ACCENT`, czyli
    // przycisk NIESIE KLASĘ akcji głównej i jest widziany przez podmiot, który
    // brief nazwał jedynym dowodem („pomalowanie całej reguły `.settings-control
    // button` … nie da sondzie NIC”). Ta droga jest więc zamknięta obserwacją:
    // gdyby lot zrobił to zakazanym sposobem, ta linia sondy by nie powstała.
    status: "enforced",
  },
  {
    id: "L6-05",
    lot: 6,
    position: 5,
    kind: "restyle",
    title: "the explanation takes a reading measure instead of a column",
    contract: ".ui-craft/tokens.md (Spacing and density)",
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
    // PRZEŁĄCZONE PRZY ODBIORZE, 2026-08-07: `maxWidth: 736px` = 46 rem =
    // rozwiązane `var(--surface-read)`, w obu motywach. Ryzyko wyżej NIE
    // ZASZŁO — lot zostawił klasę i zapisał, że zostawił ją świadomie, więc
    // para mierzy element, a nie swoją własną nieobecność. Różnica wobec v3
    // (notka stoi NAD kontrolką, nie POD) jest zapisana przy regule
    // w `styles.css:8080-8085` i ta para jej nie dotyczy: mierzy MIARĘ, a nie
    // kolejność.
    status: "enforced",
  },

  // ══ FAZA C, LOT C1 — CEL NADRZĘDNY OTWARTEGO REKORDU ══════════════════════
  // Druga połowa pozycji, której pierwsza połowa stoi w mapie powłoki
  // (C1-01a/b). Tutaj, bo podmiot rysuje się WYŁĄCZNIE po otwarciu rekordu
  // projektu — na powłoce lądowania nie ma go w DOM-ie w ogóle, a para na
  // nieobecny podmiot wraca NOT_MEASURED, czyli awarią przyrządu w obu
  // statusach.
  {
    id: "C1-02",
    lot: "C1",
    position: 2,
    kind: "restyle",
    title: "the destination above an open project record is marked too",
    contract:
      '.ui-craft/tokens.md, sekcja „What the accent is allowed to mean" („1. Where the reader is. The current destination, tab, saved view, folder or day")',
    prototype: {
      file: "v3/app.js",
      lines: "573",
      value:
        '`route().kind === d.id || (d.id === "projects" && route().kind === "project")` — trasa rekordu zapala `aria-current="page"` RÓWNIEŻ na celu nadrzędnym, więc pod otwartym projektem prototyp świeci dwa wiersze: rodzica i dziecko',
    },
    route: { surface: "projects", openRecord: "[data-project-row]" },
    subject: {
      // NOŚNIKIEM JEST DEKLARACJA, NIE KLASA, i jest to deklaracja WŁASNA tej
      // aplikacji: `aria-current` zostaje na jednym wierszu (rozstrzygnięcie
      // `RealApp.tsx`), więc farbę rodzica niesie `data-nav-open`. Para czyta
      // szynę, nie samo podbarwienie — podbarwienie bez szyny jest dokładnie
      // tym stanem połowicznym, który ten lot zamyka.
      selector: ".nav-item[data-nav-open]",
      why: "declaration stamped by RealApp.tsx when the open project record has its own child row; before this lot the parent row carried no mark at all and the register logged it twice (project-record, project-comments)",
      app: "packages/desktop-ui/src/styles.css (.nav-item[data-nav-open]::before)",
    },
    read: { pseudo: "::before", property: "backgroundColor" },
    expect: { kind: "accent" },
    status: "enforced",
  },

  // ══ FAZA C, LOT C5 — KONTROLKA WYBORU W PASIE AKCJI ═══════════════════════
  // Tutaj, a nie w mapie powłoki, z tego samego powodu co C1-02: podmiot
  // rysuje się WYŁĄCZNIE po otwarciu rekordu projektu.
  //
  // ┌ PRZEPIĘCIE W LOCIE D11 (Faza D), 2026-08-12 — CZYTAJ TO PRZED RESZTĄ ──┐
  // │ PODMIOT C5-01a/b/c ZMIENIŁ SIĘ, BO ZMIENIŁA SIĘ KONTROLKA. Pas akcji  │
  // │ otwartego projektu nie niesie już `<select>` „Apply template…" ani     │
  // │ przycisku „Apply": wybór szablonu robi dymek                           │
  // │ (`projects/ApplyTemplatePopover.tsx`), którego wyzwalacz jest          │
  // │ PRZYCISKIEM o klasach `secondary-button compact`. To jest wpis #51     │
  // │ rejestru (i jego duplikat #55): w prototypie NIE MA ani jednego        │
  // │ `<select>`, `<input>` czy `<textarea>` w paśmie tytułu na żadnym       │
  // │ z czternastu ekranów, a wybór jednej rzeczy z listy robi u niego       │
  // │ przycisk otwierający menu — `popover()` (`v3/app.js:1921-1961`)        │
  // │ zawieszony na `.btn` (`v3/app.js:1571`), panel `.pop`                  │
  // │ (`v3/app.css:886-892`).                                                │
  // │                                                                        │
  // │ DLACZEGO PRZEPIĘCIE, A NIE WYCOFANIE TYCH PAR. Zdanie, którego lot C5  │
  // │ bronił — „kontrolka w paśmie stoi tak jak przycisk obok niej" — nie    │
  // │ zniknęło razem z `<select>`; ono się PRZENIOSŁO na wyzwalacz i jest    │
  // │ tam ŁAMLIWE, bo `.inline-popover-trigger` deklaruje własne             │
  // │ `font-size: var(--text-2xs)` i `border-radius: var(--radius-full)`     │
  // │ (`styles.css`, blok „Shared inline popover"). Wygrywa                  │
  // │ `.primary-button, .secondary-button` WYŁĄCZNIE kolejnością w tym samym │
  // │ arkuszu, przy równej swoistości (0,1,0). Kaskada rozstrzygana          │
  // │ kolejnością jest dokładnie tym, co zmienia jedna przeniesiona reguła — │
  // │ i złamanie w harnessie robi jej dokładnie to.                          │
  // │                                                                        │
  // │ ZMIERZONE, NIE WYWNIOSKOWANE: obie wartości odczytane na wyzwalaczu    │
  // │ w otwartym rekordzie projektu przez `verify-renderer-layout.mjs`       │
  // │ (`LAYOUT_PORT=5447`) — wiersze C5-01a i C5-01b w raporcie lotu D11.    │
  // └────────────────────────────────────────────────────────────────────────┘
  //
  // JEDNO ZDANIE PROTOTYPU, SZEŚĆ PAR. `.st-select`
  // (`v3/screens/settings.css:190-194`) i `.btn` (`v3/app.css:306-314`) mają co
  // do wartości TĘ SAMĄ geometrię — wysokość 1,75 rem, wyściółka 0,5 rem,
  // `--radius-sm`, `--text-sm` — i ani jedno, ani drugie nie deklaruje
  // szerokości. Prototyp ma dokładnie JEDEN `<select>` w całym drzewie, więc to
  // jest cała jego wypowiedź o kontrolkach wyboru i brzmi ona: kontrolka stoi
  // tak jak przycisk obok niej. Ta aplikacja ma inne metryki przycisku niż
  // prototyp (`--radius-md`, 2 rem), więc PRZENOSI SIĘ RELACJA, a nie liczby —
  // dokładnie tak, jak przy `.compact` w locie C2.
  //
  // DLACZEGO DWIE, A NIE JEDNA. Rozmiar pisma i promień to dwie różne reguły
  // w dwóch różnych miejscach kaskady: stopień pisma schodził z `body` przez
  // `font: inherit` grupowego resetu (`styles.css:526-532`), a promień
  // deklarowała goła reguła `select` (`:599-606`). Jedna para pilnowałaby
  // jednej z nich i milczała o drugiej — a lot oddaje obie.
  //
  // CO Z SZEROKOŚCI JEST WYRAŻALNE, A CO NIE — i to jest SPROSTOWANIE, bo do
  // 2026-08-11 stała tu nieprawda o przyrządzie, a nieprawda zakomitowana
  // w przyrządzie czyta się dla następnego lotu jak ustalona niemożliwość.
  //
  // NIEWYRAŻALNA jest wyłącznie UŻYTA szerokość: `<select>` bierze szerokość
  // najszerszej OPCJI, więc `width` zależy od fikstury, a nie od arkusza,
  // i asercja na niej gniłaby przy pierwszej zmianie danych (zmierzone:
  // pięć kontrolek Ustawień liczy 66,8 / 88,8 / 94,8 / 111,8 / 256 px,
  // każda od swojej najdłuższej opcji).
  //
  // WYRAŻALNE — i od tej naprawy ZMIERZONE — jest wszystko, co lot naprawdę
  // zadeklarował: `max-inline-size` liczy się do `256px` niezależnie od opcji
  // (C5-01c), `flex-grow` do „0" (C5-02b, C5-03), `align-self` do „start"
  // (C5-02a).
  //
  // DWA POWODY, KTÓRE TU DAWNIEJ STAŁY, BYŁY SPRZECZNE Z KODEM RUNNERA:
  //   * „ponad pół tuzina dopasowań, czyli NOT_MEASURED" — runner wraca
  //     `not-measured` przy wielu dopasowaniach WYŁĄCZNIE wtedy, gdy liczą one
  //     RÓŻNE wartości (`verify-renderer-layout.mjs:4034-4045`, `distinct
  //     .length > 1`). Zmierzone w Ustawieniach na 1440 px: sześć narysowanych
  //     kontrolek, `flex-grow` = „0" we WSZYSTKICH sześciu i `max-width`
  //     = „256px" we wszystkich sześciu, czyli jedna wartość i pomiar.
  //   * „podmioty nie są DOSIĘGALNE tym spacerem" — Ustawienia są pełnoprawnym
  //     przystankiem przez `route: { settingsMode: true }`
  //     (`verify-renderer-layout.mjs:5928-5951`, wyjęte spod `ROUTED_ARRIVAL`
  //     w `:5746`), i sześć par L6-* mierzy tam od Fazy 3. `.railSelect` też
  //     się rysuje: zmierzone na otwartym rekordzie projektu w tym harnessie —
  //     jedna narysowana kontrolka, `flex-grow` „0", `max-width` „256px”,
  //     szerokość 251 px. Warunek „niepusta lista kandydatów" jest w tej
  //     fiksturze spełniony, więc `blind` byłoby tu wyciszeniem bez powodu.
  {
    id: "C5-01a",
    lot: "C5",
    position: 1,
    kind: "restyle",
    title:
      "the template chooser in the record's action strip takes the type size of the buttons beside it",
    contract:
      '.ui-craft/patterns.md — „Pattern: Control size", dopisany w locie C5 (kontrakt milczał o geometrii kontrolki wyboru; prototyp nie)',
    prototype: {
      file: "v3/app.css",
      lines: "306-314",
      value:
        '`.btn { font-size: var(--text-sm) }` — a wyborem jednej rzeczy z listy jest w prototypie WŁAŚNIE `.btn` otwierający menu (`v3/app.js:1571` zawiesza `popover()` na `<button class="btn bordered">`), więc stopień pisma tej kontrolki to stopień pisma przycisku',
    },
    route: {
      surface: "projects",
      openRecord: "[data-project-row]",
      openPopover: '[class*="_crumbs_"] .inline-popover-trigger',
    },
    subject: {
      // `_crumbs_` JEST TU JEDYNĄ NAZWĄ BEZ KOLIZJI, i to jest sprawdzone,
      // a nie założone: `.actions` deklarują TRZY moduły (`inbox.module.css`,
      // `tasks/saved-view-filters.module.css`, `record/record-comments.module.css`)
      // obok tego, więc `[class*="_actions_"]` mogłoby złapać cudzy pas na tym
      // samym ekranie. `.crumbs` deklaruje w całym drzewie wyłącznie
      // `record/record-screen.module.css:31`.
      //
      // `.inline-popover-trigger` DOPRECYZOWUJE, a nie zawęża do wygody: w tym
      // paśmie stoją jeszcze „New task", „Close project" i „Edit outcome",
      // które metrykę przycisku mają Z DEFINICJI. Podmiotem jest ten JEDEN
      // przycisk, który metryki przycisku mógłby nie mieć.
      selector:
        '[data-record-kind="project"] [class*="_crumbs_"] .inline-popover-trigger',
      why: "the only control in this strip whose own class declares a DIFFERENT type size (`--text-2xs`) than the buttons standing next to it — it reads as a button only because `.primary-button, .secondary-button` sits later in the same sheet at equal specificity",
      app: "packages/desktop-ui/src/projects/ApplyTemplatePopover.tsx (triggerClassName), styles.css (.inline-popover-trigger ↔ .primary-button, .secondary-button)",
    },
    read: { property: "fontSize" },
    expect: { kind: "token", token: "--text-sm" },
    status: "enforced",
  },
  {
    id: "C5-01b",
    lot: "C5",
    position: 1,
    kind: "restyle",
    title: "and the same corner as the buttons beside it",
    contract: '.ui-craft/patterns.md — „Pattern: Control size"',
    prototype: {
      file: "v3/app.css",
      lines: "306-314",
      value:
        "`.btn { border-radius: var(--radius-sm) }` — ten sam `.btn`, na którym prototyp zawiesza swoje menu; przenosi się RELACJA (kontrolka stoi jak przycisk obok niej), bo przycisk tej aplikacji bierze `--radius-md`, nie `--radius-sm`",
    },
    route: {
      surface: "projects",
      openRecord: "[data-project-row]",
      openPopover: '[class*="_crumbs_"] .inline-popover-trigger',
    },
    subject: {
      selector:
        '[data-record-kind="project"] [class*="_crumbs_"] .inline-popover-trigger',
      why: "same subject as C5-01a — and the corner is the second, independent place the chip metric could win back, because `.inline-popover-trigger` declares `--radius-full` for it",
      app: "packages/desktop-ui/src/styles.css (.inline-popover-trigger ↔ .primary-button, .secondary-button)",
    },
    read: { property: "borderTopLeftRadius" },
    expect: { kind: "token", token: "--radius-md" },
    status: "enforced",
  },
  {
    id: "C5-01c",
    lot: "C5",
    position: 1,
    kind: "restyle",
    title:
      "and the panel that now carries the template names stops at a ceiling instead of running as wide as the longest one",
    contract:
      '.ui-craft/patterns.md — „Pattern: Control size", „Bounded, not unbounded"',
    prototype: {
      file: "v3/app.css",
      lines: "886-892",
      value:
        "`.pop` — panel menu prototypu — jest PUDEŁKIEM OGRANICZONYM i mówi to wprost: `min-width: 13rem`, `max-height: 22rem`, `overflow-y: auto`. Sufit w osi poziomej jest tłumaczeniem tego samego zdania na dane, których prototyp nie ma: jego menu niosą krótkie etykiety stanu i pola, a ten niesie NAZWY SZABLONÓW, czyli treść rekordu",
    },
    route: {
      surface: "projects",
      openRecord: "[data-project-row]",
      openPopover: '[class*="_crumbs_"] .inline-popover-trigger',
    },
    subject: {
      // NIE POD `[data-record-kind="project"]`, i to jest różnica strukturalna,
      // nie stylistyczna: panel jest PORTALOWANY do `<body>`
      // (`components/InlinePopover.tsx`), więc potomkiem ekranu rekordu NIE
      // JEST. Trasa tego przystanku otwiera go krokiem `openPopover`, a naraz
      // otwarty jest zawsze co najwyżej jeden (stan `open` trzyma rodzic).
      selector: ".inline-popover",
      why: "the panel is where the template names live now, so it is where record content can run wide; the trigger's own label is static copy and has nothing left to bound",
      app: "packages/desktop-ui/src/styles.css (.inline-popover)",
    },
    // `max-width` JEST TU JEDYNĄ WŁASNOŚCIĄ SZEROKOŚCI, KTÓRA NIE ZALEŻY OD
    // FIKSTURY, i dlatego czyta się ją, a nie `width`. Zadeklarowana długość
    // liczy się do 24 rem przy każdej liście szablonów; użyta szerokość zależy
    // od tego, ile znaków ma najdłuższa nazwa.
    read: { property: "maxWidth" },
    expect: { kind: "rem", value: 24 },
    status: "enforced",
  },
  {
    id: "C5-02a",
    lot: "C5",
    position: 1,
    kind: "restyle",
    title:
      "the settings select stops being stretched to the panel's width by its column",
    contract:
      '.ui-craft/patterns.md — „Pattern: Control size", „Width is `flex`, height is `align-self`"',
    prototype: {
      file: "v3/screens/settings.css",
      lines: "190-194",
      value:
        "to samo jedno zdanie, co przy C5-01a, w miejscu, w którym prototyp je WYPOWIADA: wpis ustawień (`.st-presetpick`, `v3/screens/settings.js:329-334`) stawia etykietę, kontrolkę i notkę obok siebie, a kontrolka jest w nim tak szeroka, jak jej treść",
    },
    route: { settingsMode: true },
    subject: {
      // DZIECKO WPROST, i to jest cała różnica między tą parą a C5-02b:
      // `.settings-control` jest kolumną o `align-items: stretch`, więc
      // rozpina dziecko na całą taflę i tylko `align-self: start` to cofa.
      // Zmierzone: jeden narysowany podmiot (`#voice-audio-retention`,
      // `SettingsSurface.tsx:1898-1911`), 124,8 px przy tafli 1098 px.
      selector: ".settings-control > select",
      why: "the only <select> that is a DIRECT child of the column, so it is the only one the column's `align-items: stretch` could reach",
      app: "packages/desktop-ui/src/styles.css (.settings-control > select)",
    },
    read: { property: "alignSelf" },
    expect: { kind: "literal", value: "start" },
    status: "enforced",
  },
  {
    id: "C5-02b",
    lot: "C5",
    position: 1,
    kind: "restyle",
    title: "and stops eating the free space of the row it stands in",
    contract: '.ui-craft/patterns.md — „Pattern: Control size"',
    prototype: {
      file: "v3/app.css",
      lines: "306-314",
      value:
        "`.btn` nie deklaruje szerokości ani `flex`, a `.st-select` (`v3/screens/settings.css:190-194`) też nie — rośnięcie do wolnego miejsca jest właściwością POLA TEKSTOWEGO, nie kontrolki wyboru o skończonym zbiorze opcji",
    },
    route: { settingsMode: true },
    subject: {
      // POTOMEK, NIE DZIECKO WPROST: te kontrolki stoją w rzędach, których
      // rodzicem jest `form.status-create` albo `label`, a nie
      // `.settings-control > div`. Zmierzone na 1440 px: sześć narysowanych
      // dopasowań, `flex-grow` = „0" we wszystkich sześciu, więc runner ma
      // JEDNĄ wartość i pomiar (`verify-renderer-layout.mjs:4034-4045`).
      selector: ".settings-control select",
      why: "every rendered select of the settings surface at once — the rule this pair judges is written for all of them and they compute one value",
      app: "packages/desktop-ui/src/styles.css (.settings-control select)",
    },
    read: { property: "flexGrow" },
    expect: { kind: "literal", value: "0" },
    status: "enforced",
  },
  {
    id: "C5-03",
    lot: "C5",
    position: 1,
    kind: "restyle",
    title:
      "the client-linking select on the project record takes its own width too",
    contract: '.ui-craft/patterns.md — „Pattern: Control size"',
    prototype: {
      file: "v3/app.css",
      lines: "306-314",
      value:
        "ta sama relacja, co w paśmie akcji: kontrolka stoi jak przycisk obok niej („Link client”), a `.btn` nie deklaruje ani szerokości, ani `flex`",
    },
    route: { surface: "projects", openRecord: "[data-project-row]" },
    subject: {
      // TEN SAM PRZYSTANEK, CO C5-01a/b, więc para nie dokłada spaceru.
      // Zmierzone: jedna narysowana kontrolka, 251 px, `max-width` 256 px —
      // czyli fikstura RYSUJE listę kandydatów i `blind` byłoby wyciszeniem
      // stanu, który ten harness ma.
      selector: '[data-record-kind="project"] [class*="_railSelect_"]',
      why: "CSS Module class declared exactly once in the tree (project-record.module.css:611), and the only <select> in the record's rail",
      app: "packages/desktop-ui/src/record/project-record.module.css (.railSelect), ProjectRecordOverview.tsx:302-310",
    },
    read: { property: "flexGrow" },
    expect: { kind: "literal", value: "0" },
    status: "enforced",
  },

  // ── LOT D11 FAZY D — W PAŚMIE AKCJI NIE STOI ŻADNA KONTROLKA FORMULARZA ───
  //
  // WPIS #51 REJESTRU I JEGO DUPLIKAT #55. Zmierzone na prototypie: czternaście
  // ekranów, TRZYNAŚCIE pasm tytułu, ZERO `<select>`, ZERO `<input>`, ZERO
  // `<textarea>` w którymkolwiek z nich. Wybór jednej rzeczy z listy robi tam
  // przycisk otwierający menu (`popover()`, `v3/app.js:1921-1961`).
  //
  // DLACZEGO OSOBNA PARA, SKORO C5-01a/b MIERZĄ WYZWALACZ. Bo one mierzą to,
  // CO STOI, a ten wpis mówi, czego stać NIE MA. Obie te rzeczy da się złamać
  // niezależnie: kontrolka dostawiona OBOK dymka zostawia C5-01a/b zielone co
  // do joty, a jest dokładnie tą regresją, którą lot zamyka. Odwrotnie też —
  // gdyby ktoś skasował wyzwalacz, ta para dalej liczyłaby zero, a C5-01a/b
  // wróciłyby NOT_MEASURED. Dopiero we dwoje opisują pasmo.
  //
  // TA PARA LICZY ZERO, I TO JEST ŚWIADOME RYZYKO Z DOMKNIĘCIEM. Asercja
  // o nieobecności jest spełniona także przez ekran, który się nie narysował —
  // dlatego jedzie na PRZYSTANKU, na którym stoi jeszcze piętnaście innych par
  // czytających ten sam otwarty rekord: nienarysowany ekran rekordu przewraca
  // je wszystkie naraz, zanim zdąży uspokoić tę.
  {
    id: "D11-01",
    lot: "D11",
    position: 1,
    kind: "restructure",
    title:
      "no form control stands in the record's action strip — picking a template is a disclosure, not a field",
    contract: '.ui-craft/patterns.md — „Pattern: Surface title band"',
    prototype: {
      file: "v3/screens/record.js",
      lines: "429-432",
      value:
        '`crumbbar(trail, btn("New task", { cls: "primary", icon: "plus", act: "new-task" }))` — pas rekordu prototypu niesie ŚLAD i PRZYCISKI, i nic poza tym; w żadnym z czternastu ekranów nie stoi w paśmie ani jeden `<select>`, `<input>` czy `<textarea>`',
    },
    route: { surface: "projects", openRecord: "[data-project-row]" },
    subject: {
      selector: '[data-record-kind="project"] [class*="_crumbs_"] select',
      why: "the exact selector this strip's select rule used to style — if a form control comes back into the crumb bar, it comes back here",
      app: "packages/desktop-ui/src/Wave2Surfaces.tsx (the project record's action slot), record/record-screen.module.css (.actions)",
    },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },

  // ── LOT D1 FAZY D — PASMO NA CAŁĄ SZEROKOŚĆ, ZAMKNIĘTE WŁOSKOWĄ KRESKĄ ─────
  //
  // JEDNA POZYCJA, PIĘĆ PAR, i podział jest podziałem DEKLARACJI, nie ozdobą:
  // „pasmo" jest w tym rejestrze jednym zdaniem złożonym z trzech osobnych
  // rzeczy — własnej dolnej krawędzi, wysokości pasma i szerokości płótna —
  // a każda z nich psuje się osobno. Para czytająca samą kreskę byłaby zielona
  // nad pasmem wciętym w kolumnę czytania, czyli nad dokładnie tą wadą, którą
  // ten lot zamyka.
  //
  // MIERZONE NA LEJKU, bo to jedyny ekran, na którym rejestr zmierzył WSZYSTKIE
  // TRZY krawędzie (wpis #11: tusz tytułu 41 CSS, pigułka „Stages" 56, karta
  // kolumny 57,5) — więc jeden przystanek niesie i pasmo, i pasek widoku, i tor
  // tablicy pod nimi.
  {
    id: "D1-01a",
    lot: "D1",
    position: 1,
    kind: "restyle",
    title: "the title band closes with a hairline of its own",
    contract: '.ui-craft/patterns.md — „Pattern: Surface title band"',
    prototype: {
      file: "v3/app.css",
      lines: "282-286",
      value:
        "`.crumbbar { … border-bottom: 1px solid var(--border-subtle) }` — pasmo ma własną dolną krawędź, a nie jest blokiem tekstu nad treścią",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: ".surface-header",
      why: "class written by hand in styles.css, one band per screen; the census resolves the same element from `#surface-title`.closest('header')",
      app: "packages/desktop-ui/src/styles.css (.surface-header)",
    },
    read: { property: "borderBottomColor" },
    expect: { kind: "token", token: "--border-subtle" },
    status: "enforced",
  },
  {
    id: "D1-01b",
    lot: "D1",
    position: 1,
    kind: "restyle",
    title: "and stops being clamped to the reading column",
    contract: '.ui-craft/patterns.md — „Pattern: Surface title band"',
    prototype: {
      file: "v3/app.css",
      lines: "282-293",
      value:
        "`.crumbbar` nie deklaruje ŻADNEGO `max-width`; jedyne `--surface-measure` w prototypie stoi na `.record` (`v3/app.css:650`), czyli na TREŚCI, nie na paśmie",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: ".surface-header",
      why: "same subject as D1-01a",
      app: "packages/desktop-ui/src/styles.css (.surface-header)",
    },
    read: { property: "maxWidth" },
    // `none`, A NIE LICZBA: sufit czytelności zdjęty, a nie podniesiony. Para
    // czytająca „więcej niż 72rem" byłaby zielona także nad pasmem, któremu
    // ktoś dołożył szerszy sufit, czyli nad tą samą wadą o innej liczbie.
    expect: { kind: "literal", value: "none" },
    status: "enforced",
  },
  {
    id: "D1-02a",
    lot: "D1",
    position: 1,
    kind: "restyle",
    title: "the view bar under it is a band, not a loose row",
    contract: '.ui-craft/patterns.md — „Pattern: Surface title band"',
    prototype: {
      file: "v3/app.css",
      lines: "295-299",
      value:
        "`.viewbar { min-height: var(--header-band-height); … border-bottom: 1px solid var(--border-subtle) }` — drugie pasmo o tej samej wysokości i z tą samą krawędzią co `crumbbar`",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: '[class*="_viewbar_"]',
      why: "the pipeline stop draws exactly one view bar; the module hash is normalised by the same expression the paint census uses",
      app: "packages/desktop-ui/src/styles.css (.view-band) + pipeline/pipeline.module.css (.viewbar)",
    },
    read: { property: "borderBottomColor" },
    expect: { kind: "token", token: "--border-subtle" },
    status: "enforced",
  },
  {
    id: "D1-02b",
    lot: "D1",
    position: 1,
    kind: "restyle",
    title: "and stands as tall as the band token says",
    contract: '.ui-craft/tokens.md — „Spacing and density"',
    prototype: {
      file: "v3/tokens.css",
      lines: "107",
      value: "--header-band-height: 2.5rem",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: '[class*="_viewbar_"]',
      why: "same subject as D1-02a",
      app: "packages/desktop-ui/src/styles.css (.view-band)",
    },
    // `rem`, NIE PIKSEL: przeloty chodzą też przy 200% i 300% pisma, a pasmo ma
    // wtedy rosnąć razem z nim — dlatego arkusz mówi `min-height`, a nie
    // `height`, i dlatego ta para liczy od żywego korzenia.
    read: { property: "minHeight" },
    expect: { kind: "rem", value: 2.5 },
    status: "enforced",
  },
  {
    id: "D1-03",
    lot: "D1",
    position: 1,
    kind: "restyle",
    title: "and the board under both starts on the same left edge",
    contract: '.ui-craft/patterns.md — „Pattern: Surface title band"',
    prototype: {
      file: "v3/screens/pipeline.css",
      lines: "24-27",
      value:
        "`.pp-board { … padding: var(--space-3) }` — ta sama liczba, co wyściółka `crumbbar` i `viewbar` (`v3/app.css:284`, `:297`), więc tytuł i karta kolumny padają w prototypie na JEDNĄ krawędź (zmierzone: 13 CSS oba)",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: "[data-scrolls-horizontally]",
      why: "declared attribute, not a class: the horizontal scroller of the board is the element that carried the fourth, local indent on this axis",
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css (.scroller)",
    },
    read: { property: "paddingLeft" },
    // ZERO, BO RYNNĘ NIESIE JUŻ NOŚNIK. Tablica siedzi w `.surface-scroll`,
    // którego wyściółka JEST rynną kanwy; własna wyściółka scrollera dokładała
    // do niej 16 px i robiła z jednej krawędzi trzy.
    expect: { kind: "literal", value: "0px" },
    status: "enforced",
  },
  {
    id: "D1-04",
    lot: "D1",
    position: 2,
    kind: "restyle",
    title: "the band's primary action is as tall as the reference's button",
    contract: '.ui-craft/patterns.md — „Pattern: Control size"',
    prototype: {
      file: "v3/app.css",
      lines: "306-314",
      value:
        "`.btn { … height: 1.75rem }` — jedna wysokość dla WSZYSTKICH wariantów (`primary`, `bordered`, `quiet` zmieniają wyłącznie farbę)",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: ".surface-header .primary-button",
      why: "the one accent-filled action of this screen, reached through the band class written by hand in styles.css",
      app: "packages/desktop-ui/src/styles.css (.primary-button, .secondary-button)",
    },
    // WYSOKOŚĆ NARYSOWANA, nie zadeklarowana `min-height`: arkusz mówi
    // `min-height`, więc treść wyższa od pasma podniosłaby przycisk, a para
    // czytająca deklarację byłaby wtedy zielona nad kontrolką, która urosła.
    read: { property: "height" },
    expect: { kind: "rem", value: 1.75 },
    status: "enforced",
  },
  {
    id: "D1-05",
    lot: "D1",
    position: 3,
    kind: "restyle",
    title: "the Meetings band action carries the glyph its collapse depends on",
    contract: '.ui-craft/patterns.md — „Pattern: Surface title band"',
    prototype: {
      file: "v3/screens/meetings.js",
      lines: "431-433",
      value:
        '`btn("Import from Jamie", { cls: "bordered", icon: "arrow" })` — trzeci argument tego wywołania JEST ikoną, a `btn` (`v3/app.js:683-687`) rysuje ją PRZED etykietą',
    },
    route: { surface: "meetings" },
    subject: {
      // GLIF, NIE PRZYCISK. Ta para istnieje, bo poniżej 50 rem okna arkusz
      // gasi etykietę akcji pasma (`font-size: 0`) i zostawia sam glif —
      // reguła jest pisana pod akcję Z IKONĄ. Akcja bez `svg` była w tym trybie
      // PUSTYM prostokątem, a bramka wracała zielona, bo mierzy PRZEPEŁNIENIE,
      // nie pustkę. Para czytająca sam przycisk byłaby zielona nad tą wadą.
      //
      // MIERZONE PRZY 1440 px, GDZIE ZWIJANIE NIE DZIAŁA — i to jest wybór, nie
      // przeoczenie: para pyta o OBECNOŚĆ glifu, a jego brak jest tu awarią
      // przyrządu (selektor bez dopasowania → NOT_MEASURED, czyli czerwień),
      // nie rozjazdem liczby. Szerokość 1 rem pochodzi z reguły bazowej
      // (`styles.css` — `svg { width: 1rem }`), więc drugie zdanie tej pary
      // brzmi „glif jest glifem tej aplikacji, a nie obrazkiem o własnym
      // rozmiarze".
      selector: ".surface-header .secondary-button svg",
      why: "the Meetings stop draws exactly one band action and that action carries exactly one glyph",
      app: "packages/desktop-ui/src/MeetingsSurface.tsx (bandAction)",
    },
    read: { property: "width" },
    expect: { kind: "rem", value: 1 },
    status: "enforced",
  },
  // ── LOT D3 (FAZA D) — BIBLIOTEKA: NOTATKI I ŹRÓDŁA ──────────────────────────
  //
  // Jedenaście wpisów rejestru, TRZY pozycje wyrażalne selektorem nad
  // przystankami, do których ta mapa umie dojechać: głowa kolumny listy (#34,
  // #42), wiersz listy i jego siatka (#35, #41, #45) oraz czytelnia (#36, #37,
  // #38, #43, #44, #46). Kontrakt dostał w tym samym przebiegu dwa nowe wzorce
  // („Reading list column", „Reading surface"), bo NIE MIAŁ o tym obiekcie ani
  // jednego zdania — a zasada mówi, że prototyp wygrywa z kontraktem i że
  // rozjazd przepisuje się w tym samym locie.
  {
    id: "D3-01a",
    lot: "D3",
    position: 1,
    kind: "restyle",
    title: "the notes column head drops to the reference's micro-label step",
    contract: '.ui-craft/patterns.md — „Pattern: Reading list column"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "92-97",
      value:
        "`.kn-side-head { padding: 0.5rem var(--space-4); font-size: var(--text-2xs); font-weight: 600; letter-spacing: 0.04em }` — głowa kolumny jest mikroetykietą, nie tytułem ekranu",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: '[class*="_panelHead_"] h2',
      why: "the same subject L5-04 reads for weight; this pair reads the step, which is what made the head two lines tall",
      app: "packages/desktop-ui/src/library/notes.module.css (.panelHead h2)",
    },
    read: { property: "fontSize" },
    expect: { kind: "token", token: "--text-2xs" },
    // WERSALIKÓW TA PARA NIE ASERTUJE, I TO JEST ZAPISANE, NIE PRZEOCZONE.
    // Prototyp daje `text-transform: uppercase`; ten element niesie ŚCIEŻKĘ
    // FOLDERU czytelnika, a nie napis stały, więc rozjazd jest świadomy
    // i wypisany przy regule oraz w ograniczeniach wzorca. Bliźniacza głowa
    // Źródeł, gdzie napis JEST stały, wersaliki dostała i asertuje je D3-04b.
    status: "enforced",
  },
  {
    id: "D3-01b",
    lot: "D3",
    position: 1,
    kind: "prescribed",
    title: "and the help trigger stands in that same row instead of its own",
    contract: '.ui-craft/patterns.md — „Pattern: Reading list column"',
    prototype: {
      file: "v3/screens/knowledge.js",
      lines: "807-815",
      value:
        '`<div class="kn-side-head">…${helpBtn("folders")}</div>` — wyzwalacz pomocy jest DZIECKIEM głowy kolumny, a nie osobnym piętrem pod przełącznikiem',
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: '[class*="_panelHead_"] [data-help-topic="note-arrangement"]',
      why: "`data-help-topic` is TopicHelp's own declaration and is what the route assertion already counts; the class around it is a module name",
      app: "packages/desktop-ui/src/library/NotesReading.tsx (panelTitle)",
    },
    read: { property: null },
    // LICZBA, NIE POŁOŻENIE, I JEST TO CELOWE ZAWĘŻENIE. Selektor jest
    // POTOMKIEM głowy kolumny, więc „1" znaczy „ten wyzwalacz stoi w tej
    // głowie". Para czytająca `getBoundingClientRect().top` byłaby zielona nad
    // wyzwalaczem, który wrócił do paska narzędzi w chwili, gdy ten pasek
    // przypadkiem stanął w tej samej linii.
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  {
    id: "D3-01c",
    lot: "D3",
    position: 1,
    kind: "prescribed",
    title: "and the tier above the head is gone entirely",
    contract: '.ui-craft/patterns.md — „Pattern: Reading list column"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "92-102",
      value:
        "cała głowa to JEDEN rząd — `.kn-side-head` z `.kn-n` odepchniętym `margin-left: auto`; prototyp nie ma nad nim żadnej drugiej etykiety",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: '[class*="_panelEyebrow_"]',
      why: "the micro-label tier this lot deleted; a module class that no longer exists in the sheet resolves to no element",
      app: "packages/desktop-ui/src/library/notes.module.css (usunięte)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    id: "D3-02",
    lot: "D3",
    position: 1,
    kind: "restyle",
    title: "the group head stops carrying the browser's own heading margin",
    contract: '.ui-craft/patterns.md — „Pattern: Reading list column"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "196-203",
      value:
        "`.kn-group-head` deklaruje wyłącznie `padding`, siada wprost na wierszach i wprost pod przełącznikiem — między grupami nie ma ani odstępu, ani marginesu",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: '[class*="_groupHead_"]',
      why: "an <h3> in a package with no heading reset; it took the user-agent 1em block margin on both sides",
      app: "packages/desktop-ui/src/library/notes.module.css (.groupHead)",
    },
    read: { property: "marginTop" },
    expect: { kind: "literal", value: "0px" },
    status: "enforced",
  },
  {
    id: "D3-03a",
    lot: "D3",
    position: 2,
    kind: "prescribed",
    title: "a note row's reference is an outlined pill, not a bare string",
    contract: '.ui-craft/patterns.md — „Pattern: Reading list column"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "182-189",
      value:
        "`.kn-row-in { border: 1px solid var(--border-subtle); border-radius: var(--radius-full); padding: 0.0625rem 0.4375rem 0.0625rem 0.3125rem }`",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: ".knowledge-row-ref",
      why: "hand-written class in styles.css; three of the harness's notes carry references, so the subject is drawn on this stop",
      app: "packages/desktop-ui/src/styles.css (.knowledge-row-ref)",
    },
    read: { property: null },
    // PODŁOGA TRZY, NIE JEDEN, I TA LICZBA JEST WYNIKIEM SPISU FIKSTURY:
    // `documentReferences` w `dev/library-fixture.ts` ma DOKŁADNIE trzy wpisy
    // (runbook 1, network 2, handover 1), a `librarySummaries` daje pozostałym
    // notatkom pustą tablicę — więc trzy jest tu i podłogą, i całą populacją;
    // przelot potwierdza to obserwacją („3 element(s) match"). Lot dołożył do
    // tej fikstury dwa ŹRÓDŁA i ani jednej referencji notatki, więc ta liczba
    // się nie ruszyła. Podłoga „1" byłaby zielona nad zmianą, która przestała
    // rysować pigułkę wszędzie poza jednym wierszem — a pierwszy wiersz tej
    // listy referencji NIE MA, więc para patrząca tylko na niego mierzyłaby
    // gałąź `roleCopy`.
    expect: { kind: "count", atLeast: 3 },
    status: "enforced",
  },
  {
    id: "D3-03b",
    lot: "D3",
    position: 2,
    kind: "restyle",
    title: "and its glyph is the accent",
    contract: ".ui-craft/tokens.md (What the accent is allowed to mean)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "188",
      value: "`.kn-row-in .kn-glyph { color: var(--accent); opacity: 0.85 }`",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: ".knowledge-row-ref svg",
      why: "the glyph inside the pill; the app drew no glyph at all before this lot",
      app: "packages/desktop-ui/src/styles.css (.knowledge-row-ref svg)",
    },
    read: { property: "color" },
    expect: { kind: "accent" },
    status: "enforced",
  },
  {
    id: "D3-04a",
    lot: "D3",
    position: 1,
    kind: "restyle",
    title: "the sources column head is one micro-label row too",
    contract: '.ui-craft/patterns.md — „Pattern: Reading list column"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "92-97",
      value:
        "ta sama reguła, co przy D3-01a — obie kolumny list Biblioteki są w prototypie tym samym obiektem (`v3/screens/knowledge.js:812` i `:971`)",
    },
    route: { surface: "library", layout: "sources" },
    subject: {
      selector: '[class*="_listTitle_"] h2',
      why: "CSS Module class; the app drew a --text-md sentence title that pushed the help trigger onto a second line",
      app: "packages/desktop-ui/src/library/sources.module.css (.listTitle h2)",
    },
    read: { property: "fontSize" },
    expect: { kind: "token", token: "--text-2xs" },
    status: "enforced",
  },
  {
    id: "D3-04b",
    lot: "D3",
    position: 1,
    kind: "restyle",
    title: "and it takes the reference's case, because its words are fixed",
    contract: '.ui-craft/patterns.md — „Pattern: Reading list column"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "95",
      value: "`.kn-side-head { text-transform: uppercase }`",
    },
    route: { surface: "library", layout: "sources" },
    subject: {
      selector: '[class*="_listTitle_"] h2',
      why: "same subject as D3-04a; this is the half of the reference rule the twin head on Notes deliberately does not take",
      app: "packages/desktop-ui/src/library/sources.module.css (.listTitle h2)",
    },
    read: { property: "textTransform" },
    expect: { kind: "literal", value: "uppercase" },
    status: "enforced",
  },
  {
    id: "D3-04c",
    lot: "D3",
    position: 1,
    kind: "restyle",
    title: "and a group head starts on the same left edge as the rows under it",
    contract: '.ui-craft/patterns.md — „Pattern: Reading list column"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "198",
      value:
        "`.kn-group-head { padding: 0.4375rem var(--space-4) 0.25rem }` przeciw `.kn-row { padding: 0.5625rem var(--space-4) }` (`:139`) — jedna para reguł, JEDNA wyściółka pozioma dla obu",
    },
    route: { surface: "library", layout: "sources" },
    subject: {
      selector: '[class*="_groupHead_"]',
      // Selektor jest ogólny, ale przystanek NIE jest: na tej trasie rysuje się
      // wyłącznie moduł Źródeł, a bliźniak z Notatek ma własny przystanek i
      // własną parę (D3-02). Ta sama para na trasie `notes` byłaby dwuznaczna.
      why: "CSS Module class on the sources column; the head kept var(--space-3) after the row went to var(--space-4), so the two left edges drifted 6 px apart",
      app: "packages/desktop-ui/src/library/sources.module.css (.groupHead)",
    },
    read: { property: "paddingLeft" },
    expect: { kind: "token", token: "--space-4" },
    status: "enforced",
  },
  {
    id: "D3-05a",
    lot: "D3",
    position: 2,
    kind: "restyle",
    title: "a source row is square-cornered, flush to the column",
    contract: '.ui-craft/patterns.md — „Pattern: Reading list column"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "138-143",
      value:
        "`.kn-row { padding: 0.5625rem var(--space-4); border-bottom: 1px solid var(--border-subtle); border-left: 2px solid transparent }` — ŻADNEGO promienia",
    },
    route: { surface: "library", layout: "sources" },
    subject: {
      selector: '[role="option"][class*="_row_"]',
      why: "declaration-based (`role=option`) plus the module class; the app drew a --radius-md card inset from both column edges",
      app: "packages/desktop-ui/src/library/sources.module.css (.row)",
    },
    read: { property: "borderRadius" },
    expect: { kind: "literal", value: "0px" },
    status: "enforced",
  },
  {
    id: "D3-05b",
    lot: "D3",
    position: 2,
    kind: "restyle",
    title: "and rows are told apart by a hairline instead of by a gap",
    contract: '.ui-craft/patterns.md — „Pattern: Reading list column"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "140",
      value: "`.kn-row { border-bottom: 1px solid var(--border-subtle) }`",
    },
    route: { surface: "library", layout: "sources" },
    subject: {
      // SELEKTOR ZAWĘŻONY PRZY PIERWSZYM PRZELOCIE, I ZAWĘZIŁ GO PRZYRZĄD,
      // NIE GUST. Napisany jako `[role="option"][class*="_row_"]` — czyli tak
      // samo jak D3-05a — wrócił NOT_MEASURED: sześć wierszy dawało DWIE
      // wartości `borderBottomColor`, bo ostatni wiersz KAŻDEJ grupy kreski nie
      // niesie i jego `border-bottom-color` spada do `color` elementu. Para
      // czytająca „którąś z dwóch" nie umiałaby powiedzieć, którą osądziła.
      // Podmiotem jest więc wiersz, POD którym stoi następny wiersz — czyli
      // dokładnie ten, dla którego zdanie „wiersze rozdziela kreska" jest
      // zdaniem.
      selector: '[class*="_rowItem_"]:not(:last-child) [role="option"]',
      why: "same subject as D3-05a on the other channel: the separator the gap replaced. A radius pair alone would be green over rows that lost their corners and kept their gaps",
      app: "packages/desktop-ui/src/library/sources.module.css (.row)",
    },
    read: { property: "borderBottomColor" },
    expect: { kind: "token", token: "--border-subtle" },
    status: "enforced",
  },
  {
    id: "D3-06",
    lot: "D3",
    position: 2,
    kind: "prescribed",
    title: "the date in a source row has its own lane at the row's end",
    contract: ".ui-craft/tokens.md (Type)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "175-178",
      value:
        "`.kn-row-when { margin-left: auto; flex: none; font-variant-numeric: tabular-nums }` — zmierzone na prototypie: prawe krawędzie czterech kolejnych dat na jednej linii (559 px)",
    },
    route: { surface: "library", layout: "sources" },
    subject: {
      selector: '[role="option"] time[class*="_rowWhen_"]',
      why: "the element did not exist before this lot — the date was a bare text node sharing a lane with the dependants count, so no probe could reach it",
      app: "packages/desktop-ui/src/library/SourcesReading.tsx (SourceRow)",
    },
    read: { property: null },
    // OSIEM, BO TYLE JEST ŹRÓDEŁ W FIKSTURZE, I TA LICZBA JEST PODANA ZE SWOIM
    // SPISEM. Napisana najpierw jako sześć — tyle, ile fikstura miała przed tym
    // lotem — i podniesiona przy odbiorze, bo ten sam lot dołożył dwa źródła
    // (`dev/library-fixture.ts`, wpisy `sourceId("07")` i `("08")`), żeby lista
    // dalej przewijała się w swoim panelu. Podłoga niższa od populacji jest
    // dokładnie tą wadą, którą to repozytorium zbiera falami: byłaby ZIELONA
    // nad zmianą, po której dwa wiersze przestały rysować datę, a komentarz
    // powoływałby się na liczbę, której nikt nie przeliczył.
    //
    // SPIS: `librarySources()` zwraca dziś osiem wpisów (`sourceId("01")` …
    // `("08")`), a odczyt rysuje wiersz dla każdego z nich w grupie jego
    // rodzaju — przelot potwierdza to samą obserwacją („8 element(s) match").
    // Podłoga, a nie równość: pusta grupa rysuje zdanie zamiast wiersza, więc
    // liczba wierszy jest funkcją populacji, nie słownika rodzajów.
    expect: { kind: "count", atLeast: 8 },
    status: "enforced",
  },
  {
    id: "D3-07",
    lot: "D3",
    position: 3,
    kind: "restyle",
    title: "a section heading in the reader is a sentence, not a micro-label",
    contract: ".ui-craft/tokens.md (Type)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "389-392",
      value:
        "`.kn-sec-head { font-size: var(--text-sm); font-weight: 600; letter-spacing: -0.005em }` — zmierzone na prototypie: 13 px, 600, `text-transform: none`",
    },
    route: { surface: "library", layout: "sources" },
    subject: {
      selector: '[class*="_sectionHead_"]',
      why: "the class this lot split off `.sectionLabel`; the field label of the rename form KEEPS the micro-label treatment and is deliberately not this subject",
      app: "packages/desktop-ui/src/library/sources.module.css (.sectionHead)",
    },
    read: { property: "textTransform" },
    expect: { kind: "literal", value: "none" },
    status: "enforced",
  },
  {
    id: "D3-08",
    lot: "D3",
    position: 3,
    kind: "restyle",
    title: '"What rests on this" gets its bordered plate back',
    contract: '.ui-craft/patterns.md — „Pattern: Reading surface"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "397-407",
      value:
        "`.kn-refs { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden }` + `.kn-ref-row { border-bottom: 1px solid var(--border-subtle) }`",
    },
    route: { surface: "library", layout: "sources" },
    subject: {
      selector: '[class*="_restsList_"]',
      why: "the same subject L5-06 counts glyphs inside; this pair reads the plate the register says the block lost",
      app: "packages/desktop-ui/src/library/sources.module.css (.restsList)",
    },
    read: { property: "borderTopColor" },
    expect: { kind: "token", token: "--border-subtle" },
    status: "enforced",
  },
  {
    id: "D3-09",
    lot: "D3",
    position: 3,
    kind: "prescribed",
    title: "the two dates collapse into one line of small print",
    contract: '.ui-craft/patterns.md — „Pattern: Reading surface"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "246-249",
      value:
        "`.kn-reader-meta` — plakietka, „observed …" +
        " i „added …" +
        " w JEDNYM rzędzie `--text-xs`, rozdzielone `.kn-dot` (`v3/screens/knowledge.js:912-916`)",
    },
    route: { surface: "library", layout: "sources" },
    subject: {
      selector: '[class*="_dates_"]',
      why: "the `dl` block this lot replaced; a class no rule declares any more resolves to no element",
      app: "packages/desktop-ui/src/library/sources.module.css (usunięte)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    id: "D3-10a",
    lot: "D3",
    position: 3,
    kind: "restyle",
    title: "the note body stops being a raised card on a second plane",
    contract: '.ui-craft/patterns.md — „Pattern: Reading surface"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "282",
      value:
        "`.kn-body { padding-top: var(--space-5) }` i nic więcej — zmierzone na prototypie: `border-top-width: 0px`, tło `rgba(0,0,0,0)`, `box-shadow: none`",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: ".knowledge-writing-plane .document-canvas",
      why: "hand-written classes in styles.css; the selector is scoped because the SAME canvas class carries the project record's document card, which belongs to another lot",
      app: "packages/desktop-ui/src/styles.css (.knowledge-writing-plane .document-canvas)",
    },
    read: { property: "boxShadow" },
    // CIEŃ, PROMIEŃ I TŁO PSUJĄ SIĘ OSOBNO — ta para czyta cień, D3-10b promień.
    // Sama nieobecność cienia byłaby zdaniem prawdziwym także o karcie, której
    // ktoś zdjął wyłącznie uniesienie i zostawił obwódkę z promieniem.
    expect: { kind: "literal", value: "none" },
    status: "enforced",
  },
  {
    id: "D3-10b",
    lot: "D3",
    position: 3,
    kind: "restyle",
    title: "and it loses the corner that made it a card",
    contract: '.ui-craft/patterns.md — „Pattern: Reading surface"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "282",
      value: "`.kn-body` nie deklaruje ani `border-radius`, ani obwódki",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: ".knowledge-writing-plane .document-canvas",
      why: "same subject as D3-10a on the other channel",
      app: "packages/desktop-ui/src/styles.css (.knowledge-writing-plane .document-canvas)",
    },
    read: { property: "borderRadius" },
    expect: { kind: "literal", value: "0px" },
    status: "enforced",
  },
  {
    id: "D3-10c",
    lot: "D3",
    position: 3,
    kind: "restyle",
    title: "and no heading inside it reaches the step of the title above it",
    contract: ".ui-craft/tokens.md (Type)",
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "283-287",
      value:
        "`.kn-h2 { font-size: var(--text-lg) }` pod `.kn-reader-title { font-size: var(--text-xl) }` (`:242-245`) — największy śródtytuł jest MNIEJSZY od tytułu",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: ".knowledge-writing-plane .document-canvas h1",
      why: "the body's own top heading, which computed 37.76 px against a 22 px title before this lot — the inversion the register names",
      app: "packages/desktop-ui/src/styles.css (.knowledge-writing-plane .document-canvas h1)",
    },
    read: { property: "fontSize" },
    expect: { kind: "token", token: "--text-lg" },
    status: "enforced",
  },
  {
    id: "D3-11a",
    lot: "D3",
    position: 3,
    kind: "restyle",
    title: "the reader's actions stand in one row of pills",
    contract: '.ui-craft/patterns.md — „Pattern: Reading surface"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "253",
      value:
        "`.kn-actions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3) }` — zmierzone na prototypie: 28 px wysokości",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: ".document-editor-actions",
      why: "hand-written class in styles.css; it declared `display: grid; justify-items: end`, i.e. one action per row, and measured 187 px tall",
      app: "packages/desktop-ui/src/styles.css (.document-editor-actions)",
    },
    read: { property: "display" },
    expect: { kind: "literal", value: "flex" },
    status: "enforced",
  },
  {
    id: "D3-11b",
    lot: "D3",
    position: 3,
    kind: "prescribed",
    title: "and the head under the title says when and where",
    contract: '.ui-craft/patterns.md — „Pattern: Reading surface"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "246-249",
      value:
        "`.kn-reader-meta` — jeden przygaszony wiersz pod tytułem czytanej notatki (`v3/screens/knowledge.js:747-753`)",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: ".document-editor-meta time",
      why: "the timestamp inside the metadata line; counting the line alone would be green over a line that draws only the folder",
      app: "packages/desktop-ui/src/library/KnowledgeEditor.tsx (document-editor-meta)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    // KOGO ta linia NIE MÓWI: `document.list`
    // (`packages/contracts/src/query.ts:1718-1733`) nie niesie autora, więc
    // prototypowy awatar z inicjałami nie ma z czego powstać. Zgłoszone jako
    // pozycja nieoddana lotu, nie zamknięte cicho.
    status: "enforced",
  },

  // ── LOT D4: EKRAN REKORDU PROJEKTU I KOMENTARZE ───────────────────────────
  {
    id: "D4-01a",
    lot: "D4",
    position: 1,
    kind: "restructure",
    title: "the project document sits INSIDE the reading column",
    contract: '.ui-craft/patterns.md — „Pattern: Record body and its rail"',
    prototype: {
      file: "v3/screens/record.js",
      lines: "454-460",
      value:
        '`${doc}` idzie do `<div class="rc-doc">` WEWNĄTRZ `<div class="rc-body">` — dokument jest dzieckiem kolumny tekstu, nie rodzeństwem siatki',
    },
    route: { surface: "projects", openRecord: "[data-project-row]" },
    subject: {
      // PARA JEST O ZAWIERANIU, WIĘC MIERZY ZAWIERANIE. Selektor potomka
      // czyta dokładnie zdanie wpisu: „karta stoi w kolumnie tekstu".
      // Odczyt geometrii (prawa krawędź karty) byłby o JEDEN krok dalej od
      // przyczyny i zieleniałby przy każdej szerokości, przy której karta
      // akurat się mieści.
      selector: '[class*="_doc_"] .project-rich-body',
      why: "containment is the defect: the card was a SIBLING of the grid, so it ran the full 1092 px and passed under the rail",
      app: "packages/desktop-ui/src/record/ProjectRecordOverview.tsx (prop `body`), ProjectRecordScreen.tsx",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  {
    id: "D4-01b",
    lot: "D4",
    position: 1,
    kind: "restyle",
    title: "and the rail's hairline runs the whole height of the body",
    contract: '.ui-craft/patterns.md — „Pattern: Record body and its rail"',
    prototype: {
      file: "v3/screens/record.css",
      lines: "101",
      value:
        "`.rc-rail { border-left: 1px solid var(--border-subtle) }` — krawędź KOLUMNY; w prototypie pas jest kolumną wyższą, więc biegnie do dna ciała rekordu",
    },
    route: { surface: "projects", openRecord: "[data-project-row]" },
    subject: {
      // DRUGI KANAŁ TEJ SAMEJ POZYCJI. Sama para D4-01a byłaby zielona nad
      // ekranem, na którym karta wróciła do kolumny, a włoskowa krawędź
      // dalej urywa się w połowie dokumentu — czyli nad połową poprawki.
      selector: '[class*="_rail_"]',
      why: "with align-items: start the rail's box stops at its content; measured after the move, the edge ended 525.5 px above the column's floor",
      app: "packages/desktop-ui/src/record/project-record.module.css (.rail)",
    },
    read: { property: "alignSelf" },
    expect: { kind: "literal", value: "stretch" },
    status: "enforced",
  },
  {
    id: "D4-02",
    lot: "D4",
    position: 2,
    kind: "restyle",
    title: "a metadata chip is a soft rectangle, not a capsule",
    contract: ".ui-craft/tokens.md (Shape, motion, depth)",
    prototype: {
      file: "v3/app.css",
      lines: "356-362",
      value:
        "`.chip { border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--surface-raised) }`",
    },
    route: { surface: "projects", openRecord: "[data-project-row]" },
    subject: {
      selector: '[class*="_chipDashed_"]',
      why: "the empty-state chip is the one the fixture draws (no client, no deadline); it shares the radius with `.chip` because the prototype makes `dashed` a MODIFIER over the same rule",
      app: "packages/desktop-ui/src/record/project-record.module.css (.chip, .chipDashed)",
    },
    read: { property: "borderRadius" },
    expect: { kind: "token", token: "--radius-sm" },
    status: "enforced",
  },
  {
    id: "D4-03",
    lot: "D4",
    position: 3,
    kind: "restyle",
    title: "a legend swatch is a miniature of the bar's segment",
    contract: ".ui-craft/tokens.md (Shape, motion, depth)",
    prototype: {
      file: "v3/screens/projects.css",
      lines: "238",
      value:
        "`.pj-legend .pj-seg { width: 0.625rem; height: 0.625rem; border-radius: 2px }`",
    },
    route: { surface: "projects", openRecord: "[data-project-row]" },
    subject: {
      selector: '[class*="_swatch_"]',
      why: "`--radius-sm` is 0.375rem on a 0.625rem swatch — a radius of 60% of the side, which reads as a dot and stops referring to the bar above it",
      app: "packages/desktop-ui/src/record/project-record.module.css (.swatch)",
    },
    read: { property: "borderRadius" },
    expect: { kind: "literal", value: "2px" },
    status: "enforced",
  },
  {
    id: "D4-04",
    lot: "D4",
    position: 4,
    kind: "restyle",
    title: "the agent's role is a pill with a dashed accent edge",
    contract: '.ui-craft/patterns.md — „Pattern: Comment author and composer"',
    prototype: {
      file: "v3/screens/record.css",
      lines: "169-175",
      value:
        "`.rc-kind { border: 1px solid var(--border-subtle); border-radius: var(--radius-full); padding: 0.0625rem 0.4375rem }` + `.rc-kind-agent { color: var(--accent); border-color: var(--accent-edge); border-style: dashed }`",
    },
    route: {
      surface: "projects",
      openRecord: "[data-project-row]",
      recordTab: "comments",
    },
    subject: {
      selector: '[class*="_kind_"]',
      why: "the role line was colour and size only; the STYLE of the border is what the accent is doubled by, so a colour-only pair would stay green over a solid edge",
      app: "packages/desktop-ui/src/record/record-comments.module.css (.kind)",
    },
    read: { property: "borderStyle" },
    expect: { kind: "literal", value: "dashed" },
    status: "enforced",
  },
  {
    id: "D4-05",
    lot: "D4",
    position: 5,
    kind: "restyle",
    title: "the human author's mark has an edge, like the agent's",
    contract: '.ui-craft/patterns.md — „Pattern: Comment author and composer"',
    prototype: {
      file: "v3/screens/record.css",
      lines: "382-387",
      value:
        "`.rc-mark { border: 1px solid var(--border-default); background: var(--surface-raised) }` — obwódka jest w BAZIE, wariant agenta ją tylko podmienia",
    },
    route: {
      surface: "projects",
      openRecord: "[data-project-row]",
      recordTab: "comments",
    },
    subject: {
      // PODMIOTEM JEST ZNACZNIK CZŁOWIEKA, nie „któryś znacznik": wariant
      // agenta niósł obwódkę od lotu 4 fazy 3, więc para nad wspólną klasą
      // mogłaby osądzić kółko agenta i wrócić zielona nad płaskim „AN".
      // SELEKTOR ZAWĘŻONY PRZEZ PRZYRZĄD, NIE PRZEZ GUST. Napisany jako
      // `[class*="_mark_"]:not([class*="_markAgent_"])` wrócił NOT_MEASURED:
      // trafiał w TRZY narysowane elementy o DWÓCH wartościach (0px | 1px), bo
      // `_mark_` nosi też znacznik zdrowia w nagłówku rekordu projektu
      // (`project-record.module.css`), który stoi nad zakładkami i nie ma
      // z komentarzami nic wspólnego. Podmiotem jest znacznik autora W KARCIE
      // KOMENTARZA, i to karcie NIE-agenta — wariant agenta niósł obwódkę od
      // lotu 4 Fazy 3, więc para nad wspólną klasą mogła osądzić jego kółko
      // i wrócić zielona nad płaskim „AN".
      selector:
        '[class*="_entry_"]:not([class*="_entryAgent_"]) [class*="_mark_"]',
      why: "the fixture draws one human root (Ada Nowak) and one agent reply, so this selector has a subject and it is the one the register complains about",
      app: "packages/desktop-ui/src/record/record-comments.module.css (.mark)",
    },
    read: { property: "borderTopWidth" },
    expect: { kind: "literal", value: "1px" },
    status: "enforced",
  },
  {
    id: "D4-06a",
    lot: "D4",
    position: 6,
    kind: "restructure",
    title: "the send control stands INSIDE the composer's frame",
    contract: '.ui-craft/patterns.md — „Pattern: Comment author and composer"',
    prototype: {
      file: "v3/screens/record.js",
      lines: "206-212",
      value:
        "`.rc-composer-foot` z przyciskiem siedzi WEWNĄTRZ `.rc-composer-field`, a `margin-left: auto` dosuwa go do prawego dolnego rogu ramki",
    },
    route: {
      surface: "projects",
      openRecord: "[data-project-row]",
      recordTab: "comments",
    },
    subject: {
      // LICZYMY PRZYCISKI POZA RAMKĄ, NIE W NIEJ, i zdecydował o tym przelot.
      // Wersja licząca trafienia WEWNĄTRZ ramki asertowała `equals: 1`
      // i wróciła DIFFERS na dwóch — bo zamknięty inspektor trzyma DRUGI,
      // kompletny panel komentarzy tego samego rekordu (`ASIDE.inspector`,
      // `offsetParent === null`), a `count` czyta `querySelectorAll` BEZ filtra
      // narysowania (w odróżnieniu od odczytu właściwości, który filtruje).
      // Wpisanie tam dwójki zaszyłoby w mapie liczbę MONTOWAŃ panelu, którą
      // zmieni pierwszy lot dotykający inspektora. Zdanie „żadna wysyłka nie
      // stoi poza ramką" jest tym samym zdaniem wpisu i jest niewrażliwe na to,
      // ile razy panel jest zamontowany.
      selector: '[class*="_submit_"]:not([class*="_composerField_"] *)',
      why: "containment is the entry: while the textarea drew its own border there was no interior for the button, and it sat two rows below the box it belongs to",
      app: "packages/desktop-ui/src/record/RecordCommentsPanel.tsx, record-comments.module.css (.composerField)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  // ── LOT D5 FAZY D — USTAWIENIA STAJĄ SIĘ TRYBEM ─────────────────────────
  // Wszystkie pary tego lotu jadą jednym krokiem `settingsMode: true`, czyli
  // klikiem w koło zębate. Ekran Ustawień jest w chunku LENIWYM, ale kolumna
  // trybu należy do `RealApp.tsx`, więc pozycja #67 mierzy powłokę, a #68/#70
  // treść — z tego samego przystanku.
  {
    id: "D5-01a",
    lot: "D5",
    position: 1,
    kind: "prescribed",
    title: "entering settings takes the workspace card out of the column",
    contract: '.ui-craft/patterns.md — „Pattern: Settings mode column"',
    prototype: {
      file: "v3/screens/settings.css",
      lines: "6-27",
      value:
        "`.body:has(#canvas .st-mode) { --sidebar-width: 0px }` — wejście w tryb ZERUJE kolumnę powłoki pracy; karty przestrzeni nie ma tam w ogóle",
    },
    route: { settingsMode: true },
    subject: {
      selector: ".sidebar .workspace-switcher",
      why: "counted at zero: the register names this control by name as the first of three things that stayed above the section list",
      app: "packages/desktop-ui/src/RealApp.tsx (gałąź `!settingsMode`)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    id: "D5-01b",
    lot: "D5",
    position: 1,
    kind: "prescribed",
    title: "and the search control with it",
    contract: '.ui-craft/patterns.md — „Pattern: Settings mode column"',
    prototype: {
      file: "v3/screens/settings.js",
      lines: "987-1002",
      value:
        "`.st-nav` ma DOKŁADNIE dwoje dzieci — `.st-nav-head` i `.st-nav-list`; wyszukiwarki nie ma w tym drzewie",
    },
    route: { settingsMode: true },
    subject: {
      selector: ".sidebar .search-control",
      why: "DRUGA para, nie druga własność tej samej: karta przestrzeni i wyszukiwarka to dwa osobne warunki w JSX-ie, więc jedna para byłaby zielona nad połową poprawki",
      app: "packages/desktop-ui/src/RealApp.tsx (gałąź `!settingsMode`)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    id: "D5-01c",
    lot: "D5",
    position: 1,
    kind: "restyle",
    title: "and the way out becomes a band with its own hairline",
    contract: '.ui-craft/patterns.md — „Pattern: Settings mode column"',
    prototype: {
      file: "v3/screens/settings.css",
      lines: "40-43",
      value:
        "`.st-nav-head { min-height: var(--header-band-height); border-bottom: 1px solid var(--border-subtle) }`",
    },
    route: { settingsMode: true },
    subject: {
      selector: ".settings-mode-head",
      why: "the band itself — the two counts above say what is GONE, and a column emptied without a band would pass both of them",
      app: "packages/desktop-ui/src/styles.css (.settings-mode-head)",
    },
    read: { property: "borderBottomColor" },
    expect: { kind: "token", token: "--border-subtle" },
    status: "enforced",
  },
  {
    // CZWARTA PARA POZYCJI 1, DOPISANA PRZY NAPRAWIE PO PRZEGLĄDZIE LOTU D5.
    // Trzy pary wyżej mówią, CZEGO NIE MA, i że kreska pasma jest we właściwym
    // tokenie — a żadna z nich nie ma zdania o tym, dokąd to pasmo SIĘGA.
    // Wada, którą przegląd znalazł odczytem, była dokładnie tam: margines
    // ujemny pasma jest symetryczny, a nawigacja odtwarzała rynnę tylko po
    // LEWEJ, więc prawe 12 px pasma leżało poza jej pudełkiem przycięcia i było
    // ścinane. Pomiar lotu przy 760 px („wystawanie w prawo 0 px") był
    // PRAWDZIWY i ślepy: `getBoundingClientRect` oddaje pudełko UKŁADU.
    id: "D5-01d",
    lot: "D5",
    position: 1,
    kind: "restyle",
    title:
      "and that band runs the full width of the column instead of being cut by it",
    contract: '.ui-craft/patterns.md — „Pattern: Settings mode column"',
    prototype: {
      file: "v3/screens/settings.css",
      lines: "36-43",
      value:
        "`.st-nav` nie ma wyściółki poziomej w ogóle, a `.st-nav-head` niesie własną — więc pasmo prototypu z natury dobiega do OBU krawędzi kolumny, a przewijalna jest dopiero `.st-nav-list` pod nim",
    },
    route: { settingsMode: true },
    subject: {
      selector: ".settings-mode-head",
      why: "ta sama kontrolka co D5-01c, ale czytana na osi, na której się psuje: kolor kreski jest identyczny w paśmie pełnej szerokości, w paśmie obciętym o rynnę i w podkreśleniu kończącym się przed krawędzią",
      app: "packages/desktop-ui/src/styles.css (.sidebar-settings-mode nav)",
    },
    read: { property: "rect.clipGapRight", clip: ".sidebar nav" },
    expect: { kind: "literal", value: "0px" },
    status: "enforced",
  },
  {
    id: "D5-02a",
    lot: "D5",
    position: 2,
    kind: "prescribed",
    title: "the section list is cut into named groups",
    contract: '.ui-craft/patterns.md — „Pattern: Settings mode column"',
    prototype: {
      file: "v3/screens/settings.css",
      lines: "57-60",
      value:
        "`.st-nav-glabel` — wersaliki `--text-2xs` z rozstrzeleniem 0,06em w kolorze czwartorzędnym, po jednej na grupę (`v3/screens/settings.js:996-1000`)",
    },
    route: { settingsMode: true },
    subject: {
      selector: ".settings-mode-group-label",
      why: "exactly three, and the number is a fact about the shape rather than about the fixture: the groups are derived from a six-entry dictionary compiled into the bundle, not from workspace data",
      app: "packages/desktop-ui/src/settings-categories.ts (settingsCategoryGroups)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 3 },
    status: "enforced",
  },
  {
    id: "D5-02b",
    lot: "D5",
    position: 2,
    kind: "prescribed",
    title: "and every section carries a glyph",
    contract: '.ui-craft/patterns.md — „Pattern: Settings mode column"',
    prototype: {
      file: "v3/screens/settings.js",
      lines: "983",
      value:
        '`${icon(s.icon, "ico")}<span class="lbl">…` — glif jest PIERWSZYM dzieckiem pozycji, przed etykietą',
    },
    route: { settingsMode: true },
    subject: {
      selector: ".settings-mode-section svg",
      why: "one per section and six sections; `equals`, not `atLeast`, because a floor would pass a list where a single category kept its glyph",
      app: "packages/desktop-ui/src/settings-categories.ts (pole `icon`), RealApp.tsx (`<Icon name={category.icon} />`)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 6 },
    status: "enforced",
  },
  {
    id: "D5-03a",
    lot: "D5",
    position: 3,
    kind: "restyle",
    title: "a settings list is one plate instead of a stack of cards",
    contract:
      '.ui-craft/patterns.md — „Pattern: Settings section card and list plate"',
    prototype: {
      file: "v3/screens/settings.css",
      lines: "109-112",
      value:
        "`.st-list { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden }` — obwódka należy do LISTY",
    },
    route: { settingsMode: true },
    subject: {
      selector: ".status-list",
      why: "the list element the register names first; the plate is what it lacked",
      app: "packages/desktop-ui/src/styles.css (.status-list)",
    },
    read: { property: "borderTopColor" },
    expect: { kind: "token", token: "--border-subtle" },
    status: "enforced",
  },
  {
    id: "D5-03b",
    lot: "D5",
    position: 3,
    kind: "restyle",
    title: "and its row stops being a card of its own",
    contract:
      '.ui-craft/patterns.md — „Pattern: Settings section card and list plate"',
    prototype: {
      file: "v3/screens/settings.css",
      lines: "113-118",
      value:
        "`.st-row` niesie WYŁĄCZNIE `border-bottom`, zdejmowany na `:last-child` — bez promienia i bez własnego tła",
    },
    route: { settingsMode: true },
    subject: {
      selector: ".status-list li",
      why: "the row, read on its RADIUS rather than on its separator, and that is a decision forced by the fixture: this harness gives every status list exactly ONE row, so every row is `:last-child` and the hairline the rule adds is never drawn here. A pair on the separator would be measuring a lane that does not exist — the twin on the stage list below reads the hairline where there are two rows to separate.",
      app: "packages/desktop-ui/src/styles.css (.status-list li)",
    },
    read: { property: "borderRadius" },
    expect: { kind: "literal", value: "0px" },
    status: "enforced",
  },
  {
    id: "D5-03c",
    lot: "D5",
    position: 3,
    kind: "restyle",
    title: "and the stage rows are told apart by a hairline, not by gaps",
    contract:
      '.ui-craft/patterns.md — „Pattern: Settings section card and list plate"',
    prototype: {
      file: "v3/screens/settings.css",
      lines: "113-120",
      value:
        "`.st-row { border-bottom: 1px solid var(--border-subtle) }` nad `.st-list` bez `gap` — wiersze rozdziela linia, nie przerwa",
    },
    route: { settingsMode: true },
    subject: {
      selector:
        '[class*="_stageList_"] li:not(:last-child) [class*="_stageRow_"]',
      why:
        "the register named BOTH files under one entry; this is the list that actually has more " +
        "than one row in the harness, so the separator is measurable here and only here. THE " +
        'SELECTOR EXCLUDES THE LAST ROW ON PURPOSE, and the first draft did not: `[class*="_stageRow_"]` ' +
        "matched six rendered rows computing TWO values, because the closing row's hairline is " +
        "removed by design — the pair came back NOT_MEASURED, i.e. as an instrument failure, and " +
        "widening the expectation to accept both values would have made it green over a list with " +
        "no separators at all.",
      app: "packages/desktop-ui/src/settings/commercial-defaults-section.module.css (.stageRow)",
    },
    read: { property: "borderBottomColor" },
    expect: { kind: "token", token: "--border-subtle" },
    status: "enforced",
  },
  {
    id: "D5-04a",
    lot: "D5",
    position: 4,
    kind: "restyle",
    title: "each settings section becomes its own card",
    contract:
      '.ui-craft/patterns.md — „Pattern: Settings section card and list plate"',
    prototype: {
      file: "v3/screens/settings.css",
      lines: "235-241",
      value:
        "`.st-grant { border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-content); overflow: hidden }` — obrys należy do SEKCJI",
    },
    route: { settingsMode: true },
    subject: {
      selector: ".settings-category > section",
      why: "the section that used to be a band inside somebody else's outline",
      app: "packages/desktop-ui/src/styles.css (.settings-category > section)",
    },
    read: { property: "borderTopColor" },
    expect: { kind: "token", token: "--panel-reading-border" },
    status: "enforced",
  },
  {
    id: "D5-04b",
    lot: "D5",
    position: 4,
    kind: "restyle",
    title: "and its heading gets a band closed by a hairline",
    contract:
      '.ui-craft/patterns.md — „Pattern: Settings section card and list plate"',
    prototype: {
      file: "v3/screens/settings.css",
      lines: "239",
      value:
        "`.st-grant-head { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-subtle) }`",
    },
    route: { settingsMode: true },
    subject: {
      selector: ".settings-category > section > .settings-copy",
      why: "DRUGA para, bo obrys sekcji i pasmo jej nagłówka psują się osobno: karta bez pasma przechodzi D5-04a i dalej daje nagłówkowi wyściółkę ciała, czyli dokładnie ten kształt, który rejestr zgłosił",
      app: "packages/desktop-ui/src/styles.css (.settings-category > section > .settings-copy)",
    },
    read: { property: "borderBottomColor" },
    expect: { kind: "token", token: "--border-subtle" },
    status: "enforced",
  },
  {
    // TRZECIA PARA POZYCJI 4, DOPISANA PRZY NAPRAWIE PO PRZEGLĄDZIE LOTU D5.
    // Obie pary wyżej mają PODMIOT `.settings-category > section`, czyli
    // dokładnie ten zbiór, który wpis #70 obdarował kartą — i są ślepe na
    // dziecko kategorii, które `section` NIE JEST. Takie dziecko było: korzeń
    // `AccessSection` zwracał `<div>`, więc jako jedyne w sześciu kategoriach
    // nie dostawało ani obrysu, ani przeniesienia wyściółki, i zostawało przy
    // własnej kresce górnej wiszącej w przerwie siatki. Bliźniaczy
    // `ActivitySection` zwraca `<section>` i wpadł poprawnie — różnił je
    // WYŁĄCZNIE tag, czyli jedyna rzecz, której tamte pary nie czytają.
    //
    // LICZBA, NIE WŁASNOŚĆ, i to jest cała treść tej pary: para przypięta do
    // drugiego dziecka jednej kategorii byłaby zielona przy siódmym komponencie
    // dopisanym tą samą drogą. Zero dzieci spoza zbioru podmiotów znaczy, że
    // zbiór podmiotów obu par wyżej JEST kompletem kart tego ekranu.
    id: "D5-04c",
    lot: "D5",
    position: 4,
    kind: "prescribed",
    title: "and no block of a category sits outside that set of cards",
    contract:
      '.ui-craft/patterns.md — „Pattern: Settings section card and list plate"',
    prototype: {
      file: "v3/screens/settings.css",
      lines: "235-241",
      value:
        "`.st-grant` — w prototypie KAŻDY blok kategorii niesie obwódkę, promień i przycięcie; bloku bez karty nie ma tam ani jednego",
    },
    route: { settingsMode: true },
    subject: {
      selector: ".settings-category > *:not(section)",
      why: "policzone nad WSZYSTKIMI sześcioma kategoriami naraz — jedno dziecko spoza zbioru podmiotów D5-04a/b to jedna karta, której nikt nie narysował, a obie tamte pary zostają nad tym zielone",
      app: "packages/desktop-ui/src/settings/AccessSection.tsx (korzeń komponentu)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    id: "D5-05",
    lot: "D5",
    position: 5,
    kind: "restyle",
    title: "the add bar's select stops being a panel row",
    contract:
      '.ui-craft/patterns.md — „Pattern: Settings section card and list plate"',
    prototype: {
      file: "v3/screens/settings.css",
      lines: "181-194",
      value:
        "`.st-input` i `.st-select` — obie kontrolki paska akcji mają `height: 1.75rem`, tę samą wyściółkę i ten sam stopień",
    },
    route: { settingsMode: true },
    subject: {
      selector: ".settings-control .status-create select",
      why: "WYSOKOŚĆ NARYSOWANA, nie zadeklarowana podłoga — ta sama ostrożność co przy D1-04: para czytająca `min-height` byłaby zielona nad kontrolką, którą wyściółka podniosła z powrotem. Zmierzone przed poprawką: 44 px przy polu obok o 34,2 px.",
      app: "packages/desktop-ui/src/styles.css (.settings-control .status-create …)",
    },
    // 1,8 → 1,75 PRZY NAPRAWIE PO PRZEGLĄDZIE: para CYTOWAŁA `height: 1.75rem`
    // z prototypu i pilnowała 1,8 rem, a nigdzie — ani przy regule, ani tutaj,
    // ani we wzorcu — nie stało zdania, że to świadome odstępstwo. Wartość
    // „mniej więcej jak w prototypie" nie jest wartością z prototypu; reguła
    // zeszła na 1,75 rem razem z tą liczbą.
    read: { property: "height" },
    expect: { kind: "rem", value: 1.75 },
    status: "enforced",
  },
  {
    // TRZECIA POŁOWA WPISU #58 — ZNACZNIK AUTORA W KOMPOZYTORZE. Litera idzie
    // za WPISEM rejestru, nie za pozycją (tak samo jak przy `D4-06a`): #58 ma
    // trzy zdania i to jest pierwsze z nich, czyli nagłówek wiersza —
    // „kompozytor: brak awatara". Do naprawy po przeglądzie lotu D4 nie
    // mierzyło go NIC: `D4-06a` liczy wysyłki poza ramką, `D4-06b` czyta
    // `resize` pola, a `D4-05` ma podmiot zawężony do znacznika W KARCIE
    // komentarza (`[class*="_entry_"] …`), więc znacznik stojący w `<form>`
    // kompozytora jest poza jego zasięgiem z definicji.
    id: "D4-06c",
    lot: "D4",
    position: 6,
    kind: "restyle",
    title: "and the composer is stamped by the same author mark as the thread",
    contract: '.ui-craft/patterns.md — „Pattern: Comment author and composer"',
    prototype: {
      file: "v3/screens/record.css",
      lines: "410-411",
      value:
        "`.rc-composer { display: grid; grid-template-columns: 1.125rem minmax(0, 1fr) }` + `.rc-mark-me { margin-top: 0.4375rem }` — pierwszą kolumną kompozytora JEST znacznik autora (`v3/screens/record.js:205`), a jego margines opuszcza go do pierwszego wiersza tekstu",
    },
    route: {
      surface: "projects",
      openRecord: "[data-project-row]",
      recordTab: "comments",
    },
    subject: {
      // ODCZYT WŁAŚCIWOŚCI, NIE `count`, I DECYDUJE O TYM TEN SAM FAKT, co
      // przy `D4-06a`: zamknięty inspektor trzyma DRUGI, kompletny panel
      // komentarzy tego samego rekordu, a `count` czyta `querySelectorAll`
      // BEZ filtra narysowania. `equals: 1` wróciłoby DIFFERS na dwóch,
      // `equals: 2` zaszyłoby w mapie liczbę montowań panelu, a zliczanie
      // DOPEŁNIENIA („żaden znacznik kompozytora nie stoi poza kompozytorem")
      // byłoby ZIELONE nad skasowanym znacznikiem — czyli nad tą właśnie wadą.
      // Odczyt właściwości filtruje do narysowanych i wymaga JEDNEJ wartości,
      // więc skasowanie znacznika wraca jako `NOT_MEASURED` z tym id, a nie
      // jako cisza.
      selector: '[class*="_composerMark_"]',
      why: "the composer had no author mark at all: the thread stamped every comment with initials and the box the reader writes in was stamped with nothing",
      app: "packages/desktop-ui/src/record/RecordCommentsPanel.tsx (styles.composerMark), record-comments.module.css (.composerMark)",
    },
    read: { property: "marginTop" },
    expect: { kind: "rem", value: 0.4375 },
    status: "enforced",
  },
  {
    id: "D4-06b",
    lot: "D4",
    // POZYCJA 7, NIE 6, BO TA PARA CZYTA `resize` — czyli zdanie wpisu #61,
    // a nie zdanie wpisu #58 o kształcie kompozytora. Para przypisana do
    // pozycji, której NIE mierzy, jest bramką zapalającą się z powodu,
    // którego nikt nie umie odczytać z powrotem (ta sama zasada, co przy
    // `RECORD_TITLE_BAND_OWNER` na dole tego pliku). Przezroczystość pola —
    // druga połowa tej samej reguły — jest dowodzona spisem farby B1, gdzie
    // stan `TRANSPARENT` jest jawnie dopuszczony.
    position: 7,
    kind: "restyle",
    title: "and the composer's field offers no native resize handle",
    contract: '.ui-craft/patterns.md — „Pattern: Comment author and composer"',
    prototype: {
      file: "v3/screens/record.css",
      lines: "417-419",
      value:
        "`.rc-composer textarea { border: 0; background: none; resize: none }` — ramkę niesie oprawa, nie pole",
    },
    route: {
      surface: "projects",
      openRecord: "[data-project-row]",
      recordTab: "comments",
    },
    subject: {
      selector: '[class*="_composerText_"]',
      why: "the wrapper can only be the visible frame if the control inside it stops drawing a second one; B1 reads this as TRANSPARENT, the state `.ghost-button` declares",
      app: "packages/desktop-ui/src/record/record-comments.module.css (.composerText)",
    },
    read: { property: "resize" },
    expect: { kind: "literal", value: "none" },
    status: "enforced",
  },

  // ── LOT D6 — OGON CRM (Organizacje i Ludzie) ──────────────────────────────
  //
  // PIERWSZE PARY TEJ MAPY NAD DWOMA EKRANAMI CRM-owej listy; markery przybycia
  // (`ROUTED_ARRIVAL.organizations`, `.people`) dopisane razem z nimi.
  //
  // CO FIKSTURA DOSIĘGA, ZMIERZONE PRZED NAPISANIEM PAR, A NIE PO. Sonda przy
  // 1440 px na obu przystankach zwróciła DWA z czterech stanów sygnału — `risk`
  // i `watch` — oraz dwa z trzech stanów relacji (`active`, `prospect`). Pary
  // niżej czytają WYŁĄCZNIE to, co ta fikstura rysuje: para nad zielonym
  // kwadratem („On track") albo nad kreskowaną obwódką („Dormant") wróciłaby
  // NOT_MEASURED, czyli jako awaria przyrządu nad poprawnym kodem. To jest
  // w tym repo nazwana klasa defektu („pusta fikstura chroni fałszywą
  // asercję") i dlatego stoi tu pomiar, a nie założenie.
  {
    id: "D6-01a",
    lot: "D6",
    position: 1,
    kind: "prescribed",
    title: "the relationship mark is a drawn box, not a typed character",
    contract: '.ui-craft/tokens.md — „Status and accessibility"',
    prototype: {
      file: "v3/app.css",
      lines: "389-392",
      value:
        "`.health { width: 0.8125rem; height: 0.8125rem; border-radius: 2px; border: 1.5px solid var(--text-disabled) }` — kwadrat wielkości wersalika, wstawiany przez `healthDot` (v3/app.js:116)",
    },
    route: { surface: "organizations" },
    subject: {
      selector: '[data-organizations-surface] [class*="_signalMark_"]',
      why: "szerokość, bo to ona rozstrzyga spór wpisu: znak pisma bierze wymiar z KROJU czytelnika (▲ przy --text-2xs mierzyło ~7 px i było MNIEJSZE od tekstu obok), a pudełko bierze go z tego arkusza",
      app: "packages/desktop-ui/src/organizations/organizations.module.css (.signalMark)",
    },
    read: { property: "width" },
    expect: { kind: "rem", value: 0.8125 },
    status: "enforced",
  },
  {
    id: "D6-01b",
    lot: "D6",
    position: 1,
    kind: "prescribed",
    title: "and „Watch” is told apart by a SHAPE, not by a second colour",
    contract: '.ui-craft/tokens.md — „Status and accessibility"',
    prototype: {
      file: "v3/app.css",
      lines: "394",
      value:
        "`.health.watch { background: linear-gradient(135deg, var(--status-warning) 50%, transparent 50%) }` — ukośne półwypełnienie",
    },
    route: { surface: "organizations" },
    subject: {
      selector: '[data-relationship-signal="watch"] [class*="_signalMark_"]',
      why: "SEDNEM wpisu jest „cztery kształty, nie cztery kolory” — para czytająca kolor stałaby zielona nad czterema jednakowymi kwadratami w czterech odcieniach, czyli nad wersją nieczytelną bez koloru. `watch` jest jednym z dwóch stanów, które fikstura rysuje",
      app: "packages/desktop-ui/src/organizations/organizations.module.css (.signalMark_watch)",
    },
    read: { property: "backgroundImage" },
    expect: { kind: "contains", value: "linear-gradient" },
    status: "enforced",
  },
  {
    id: "D6-01c",
    lot: "D6",
    position: 1,
    kind: "prescribed",
    title: "and „At risk” is a FILLED box, not an outlined one",
    contract: '.ui-craft/tokens.md — „Status and accessibility"',
    prototype: {
      file: "v3/app.css",
      lines: "395",
      value:
        "`.health.risk { border-color: var(--status-error); background: var(--status-error) }` — wypełnione, w odróżnieniu od `.health.none` (:409), które jest samą kreskowaną obwódką",
    },
    route: { surface: "organizations" },
    subject: {
      selector: '[data-relationship-signal="risk"] [class*="_signalMark_"]',
      why:
        "drugi ze stanów dosięgniętych przez fiksturę, czytany INNĄ własnością niż `watch`: wypełnienie kontra sama obwódka jest różnicą KSZTAŁTU, nie odcienia, i to ona dzieli cztery stany na wypełnione (`ok`, `risk`) i niewypełnione (`watch` w połowie, `none` wcale). " +
        "TA PARA NIE MIERZY WYKRZYKNIKA — cięcie siedzi w `::after`, którego `read` tej mapy nie widzi, i stoi wypisane w VISUAL_LANGUAGE_ROUTED_NOT_COVERED. " +
        "GRUBOŚCI OBWÓDKI TEŻ NIE, i to jest pomiar, nie rezygnacja: arkusz deklaruje `1.5px` za prototypem, a `getComputedStyle` w tym przelocie oddaje `1px` — Chromium przycina krawędź do piksela urządzenia przy DPR 1. Para na literale „1.5px” byłaby czerwona nad poprawnym arkuszem, a para na „1px” asertowałaby artefakt zaokrąglenia, który zniknie na ekranie o innej gęstości.",
      app: "packages/desktop-ui/src/organizations/organizations.module.css (.signalMark_risk)",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "token", token: "--status-error" },
    status: "enforced",
  },
  {
    id: "D6-02a",
    lot: "D6",
    position: 1,
    kind: "prescribed",
    title: "the same mark is drawn on People, not typed there either",
    contract: '.ui-craft/tokens.md — „Status and accessibility"',
    prototype: {
      file: "v3/app.css",
      lines: "389-392",
      value:
        "ten sam `.health` — prototyp ma JEDNĄ definicję kształtu dla wszystkich miejsc (`v3/screens/crm.css:7-8` mówi to wprost)",
    },
    route: { surface: "people" },
    subject: {
      selector: '[data-people-surface] [class*="_signalMark_"]',
      why: "DRUGA para, nie druga własność pierwszej: rejestr zgłosił ten kształt dwa razy (#20, #30), bo mieszka w DWÓCH arkuszach modułowych — jedna para byłaby zielona nad połową poprawki",
      app: "packages/desktop-ui/src/people/people.module.css (.signalMark)",
    },
    read: { property: "width" },
    expect: { kind: "rem", value: 0.8125 },
    status: "enforced",
  },
  {
    id: "D6-02b",
    lot: "D6",
    position: 1,
    kind: "prescribed",
    title: "and „Watch” keeps its shape on People too",
    contract: '.ui-craft/tokens.md — „Status and accessibility"',
    prototype: {
      file: "v3/app.css",
      lines: "394",
      value: "`.health.watch` — ukośne półwypełnienie, ta sama jedna definicja",
    },
    route: { surface: "people" },
    subject: {
      selector: '[data-relationship-signal="watch"] [class*="_signalMark_"]',
      why: "bliźniak D6-01b na drugim arkuszu; podmiot jest tu jednoznaczny, bo przystanek rysuje wyłącznie ekran Ludzi",
      app: "packages/desktop-ui/src/people/people.module.css (.signalMark_watch)",
    },
    read: { property: "backgroundImage" },
    expect: { kind: "contains", value: "linear-gradient" },
    status: "enforced",
  },
  {
    id: "D6-03a",
    lot: "D6",
    position: 2,
    kind: "restyle",
    title: "„Prospect” belongs to the accent, not to information",
    contract: '.ui-craft/tokens.md — „What the accent is allowed to mean"',
    prototype: {
      file: "v3/screens/crm.css",
      lines: "33",
      value:
        "`.crm-state-prospect { color: var(--accent); border-color: var(--accent-edge); background: var(--accent-quieter) }`",
    },
    route: { surface: "organizations" },
    subject: {
      selector: '[data-organizations-surface] [class*="_state_prospect_"]',
      why: "tu odcień JEST pozycją (rejestr: „niebieska, nie indygo-fioletowa”), więc para czyta go wprost — tym samym osądem, którym sonda osądza akcję główną, czyli niezależnie od motywu",
      app: "packages/desktop-ui/src/organizations/organizations.module.css (.state_prospect)",
    },
    read: { property: "color" },
    expect: { kind: "accent" },
    status: "enforced",
  },
  {
    id: "D6-03b",
    lot: "D6",
    position: 2,
    kind: "restyle",
    title: "and it sits on its own tint, not on the row",
    contract: '.ui-craft/tokens.md — „What the accent is allowed to mean"',
    prototype: {
      file: "v3/screens/crm.css",
      lines: "33",
      value: "`background: var(--accent-quieter)` na tej samej plakietce",
    },
    route: { surface: "organizations" },
    subject: {
      selector: '[data-organizations-surface] [class*="_state_prospect_"]',
      why: "sam tusz przemalowany bez laserunku przechodzi D6-03a, a prototyp niesie OBIE deklaracje; laserunek jest też tym, co bramka kontrastu mierzy — 4,62:1 najciaśniej, w motywie jasnym na płótnie",
      app: "packages/desktop-ui/src/organizations/organizations.module.css (.state_prospect)",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "token", token: "--accent-quieter" },
    status: "enforced",
  },
  {
    id: "D6-03c",
    lot: "D6",
    position: 2,
    kind: "restyle",
    title: "and the same pill says the same thing on People",
    contract: '.ui-craft/tokens.md — „What the accent is allowed to mean"',
    prototype: {
      file: "v3/screens/crm.css",
      lines: "33",
      value: "jedna reguła prototypu na oba ekrany",
    },
    route: { surface: "people" },
    subject: {
      selector: '[data-people-surface] [class*="_state_prospect_"]',
      why: "rejestr nazwał ten rozjazd REGUŁĄ właśnie dlatego, że ta sama plakietka była niebieska na dwóch ekranach; dwa arkusze, więc dwie pary",
      app: "packages/desktop-ui/src/people/people.module.css (.state_prospect)",
    },
    read: { property: "color" },
    expect: { kind: "accent" },
    status: "enforced",
  },
  {
    id: "D6-04a",
    lot: "D6",
    position: 3,
    kind: "prescribed",
    title: "both layout segments open with a glyph",
    contract: '.ui-craft/tokens.md — „Component layer"',
    prototype: {
      file: "v3/screens/crm.js",
      lines: "214",
      value:
        '`[["list", "List", "list"], ["table", "Table", "table"]]` — trzeci człon to nazwa znaku, składana przed etykietą w :376 (`${icon(ico)}${label}`; do 2026-08-12 stało tu :203, linia PUSTA)',
    },
    route: { surface: "organizations" },
    subject: {
      // PRZEPIĘTE W LOCIE D10: pasek widoku wyszedł z przewijanego pudełka,
      // więc `[data-organizations-surface]` — atrybut TEGO pudełka — przestał
      // być jego przodkiem. Kotwicą jest `main[data-surface]`, deklaracja
      // obejmująca oba pasma i treść pod nimi; `main` konieczne, bo ten sam
      // atrybut niesie pozycja nawigacji.
      selector: 'main[data-surface="organizations"] [class*="_switch_"] svg',
      why: "liczone, a nie czytane własnością: pozycja jest o OBECNOŚCI znaku. Podłoga 2, bo prototyp rysuje go przy OBU segmentach, a podłoga 1 byłaby zielona nad wersją, w której glif dostał tylko wybrany",
      app: "packages/desktop-ui/src/StrategicDepthSurface.tsx (LAYOUTS) + organizations.module.css (.switch svg)",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 2 },
    status: "enforced",
  },
  {
    id: "D6-04b",
    lot: "D6",
    position: 3,
    kind: "prescribed",
    title: "and so do the two on People",
    contract: '.ui-craft/tokens.md — „Component layer"',
    prototype: {
      file: "v3/screens/crm.js",
      lines: "216",
      value:
        '`[["orgs", "By organization", "org"], ["table", "Table", "table"]]` — budynek przy grupowaniu, siatka przy tabeli',
    },
    route: { surface: "people" },
    subject: {
      selector: '[data-people-surface] [class*="_switch_"] svg',
      why: "drugi arkusz i drugi literał LAYOUTS — jedna para nad Organizacjami nie mówi nic o tym ekranie",
      app: "packages/desktop-ui/src/people/PeopleSurface.tsx (LAYOUTS) + people.module.css (.switch svg)",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 2 },
    status: "enforced",
  },
  // DWIE PARY NIŻEJ SĄ DOPISANE 2026-08-12, PO PRZEGLĄDZIE LOTU D6, I ISTNIEJĄ
  // Z POWODU, KTÓRY WARTO ZAPAMIĘTAĆ. D6-04a/b liczą ELEMENTY (`property: null`,
  // `count`), więc mówią wyłącznie o OBECNOŚCI znaku. Nad tą podłogą przeszła
  // wersja, w której glif segmentu miał 0,6875 rem i `opacity: 0.75` — komplet
  // przepisany z `v3/screens/crm.css:162`, czyli z reguły PLAKIETKI
  // UCZESTNICTWA, której lot D6 świadomie nie oddał. Prototypowa reguła tego
  // znaku to `v3/app.css:348` i mówi 0,8125 rem bez wygaszenia. Bramka była
  // zielona nad niewłaściwą liczbą, bo żadna para nie czytała WYMIARU — to jest
  // nazwana w tym repo klasa („bramka mierząca OBECNOŚĆ nigdy nie mierzy
  // JAKOŚCI"), a nie przeoczenie jednego lotu.
  {
    id: "D6-04c",
    lot: "D6",
    position: 3,
    kind: "prescribed",
    title:
      "and the segment glyph is view-bar chrome size, not row-content size",
    contract: '.ui-craft/tokens.md — „Component layer"',
    prototype: {
      file: "v3/app.css",
      lines: "348",
      value:
        "`.segmented button svg { width: 0.8125rem; height: 0.8125rem; }` — CAŁA reguła, bez `opacity`. Prototyp trzyma trzy stopnie wielkości znaku: 1 rem globalnie (`v3/app.css:20`), 0,8125 rem w chromie paska widoku (`:348`), 0,6875 rem w treści wiersza (`v3/screens/crm.css:162`)",
    },
    route: { surface: "organizations" },
    subject: {
      // Przepięte w locie D10, ten sam powód co przy D6-04a.
      selector: 'main[data-surface="organizations"] [class*="_switch_"] svg',
      why: "ten sam podmiot co D6-04a, ale czytany WŁASNOŚCIĄ, a nie liczony: podłoga 2 nad liczbą elementów jest zielona przy KAŻDYM wymiarze, więc para licząca nie umie odróżnić chromu paska od treści wiersza. Wymiar rozstrzyga, z której reguły prototypu ten znak pochodzi",
      app: "packages/desktop-ui/src/organizations/organizations.module.css (.switch svg)",
    },
    read: { property: "width" },
    expect: { kind: "rem", value: 0.8125 },
    status: "enforced",
  },
  {
    id: "D6-04d",
    lot: "D6",
    position: 3,
    kind: "prescribed",
    title: "and the People twin is the same size, from the same rule",
    contract: '.ui-craft/tokens.md — „Component layer"',
    prototype: {
      file: "v3/app.css",
      lines: "348",
      value:
        'ta sama jedna reguła — prototyp rysuje oba paski widoku tym samym `<div class="segmented">` (`v3/screens/crm.js:373` i `:542`), więc rozmiar znaku ma JEDNO źródło',
    },
    route: { surface: "people" },
    subject: {
      selector: '[data-people-surface] [class*="_switch_"] svg',
      why: "DRUGA para, nie druga własność pierwszej — dokładnie z powodu, dla którego istnieje D6-02a: reguła mieszka w drugim arkuszu modułowym, a jedna para stałaby zielona nad połową poprawki. Obie połowy naprawdę rozjechały się razem i razem zostały poprawione",
      app: "packages/desktop-ui/src/people/people.module.css (.switch svg)",
    },
    read: { property: "width" },
    expect: { kind: "rem", value: 0.8125 },
    status: "enforced",
  },
  {
    id: "D6-05a",
    lot: "D6",
    position: 4,
    kind: "prescribed",
    title: "the organization in a group heading opens with a building",
    contract: '.ui-craft/tokens.md — „Component layer"',
    prototype: {
      file: "v3/screens/crm.js",
      lines: "471",
      value:
        '`<button class="crm-ghead-name">${icon("org")}${esc(o.name)}</button>` — glif PRZED nazwą. Do 2026-08-12 stało tu :481, czyli `<span class="crm-ghead-sig">` — plakietka sygnału, nie przycisk nazwy',
    },
    route: { surface: "people" },
    subject: {
      selector: '[data-people-surface] [class*="_groupName_"] svg',
      why: "podłoga 2, bo tyle nagłówków grup rysuje ta fikstura (zmierzone: Northwind i Helio) — podłoga 1 przeszłaby nad wersją, w której glif dostał tylko pierwszy nagłówek. Grupa „No organization recorded” celowo nie dostaje znaku i prototyp też jej go nie daje",
      app: "packages/desktop-ui/src/people/PeopleSurface.tsx (GroupHead) + people.module.css (.groupName svg)",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 2 },
    status: "enforced",
  },
  // ── LOT D9 — GLIF PLAKIETKI UCZESTNICTWA (druga połowa wpisu #29) ─────────
  //
  // DWIE PARY, OBECNOŚĆ I WYMIAR, i podział jest DOKŁADNIE ten, który wymusiły
  // D6-04c/d trzydzieści linii wyżej: para licząca elementy jest zielona przy
  // KAŻDYM rozmiarze znaku, a ten znak ma w prototypie własny, TRZECI stopień —
  // 0,6875 rem treści wiersza, nie 0,8125 rem chromu paska. Bez pary czytającej
  // wymiar ten glif mógłby wejść w rozmiarze paska widoku i bramka nie miałaby
  // jak tego powiedzieć.
  //
  // PODMIOT STOI NA `data-part`, nie na zahaszowanej klasie modułu: `_part_`
  // i `_parts_` różnią się jedną literą przed skrótem, a selektor
  // `[class*="_part_"]` łapie OBA. Atrybut nazywa też, KTÓRA to plakietka,
  // więc para nad spotkaniami nie może być zaspokojona plakietką dealów.
  {
    id: "D9-01a",
    lot: "D9",
    position: 1,
    kind: "prescribed",
    title: "the participation badge opens with a glyph",
    contract: '.ui-craft/tokens.md — „Component layer"',
    prototype: {
      file: "v3/screens/crm.js",
      // 420 to plakietka dealów, 421 — spotkań. 422 rysuje plakietkę NOTATEK,
      // której ta aplikacja nie ma, więc zakres kończy się na 421: cytat ma
      // wskazywać to, co się cytuje, a nie sąsiada.
      lines: "420-421",
      value:
        '`<span class="crm-part">${icon("pipeline")}${pjPlural(r.deals.length, "deal", "deals")}</span>` i bliźniak z `icon("meeting")` — glif PRZED pełnym słowem',
    },
    route: { surface: "people" },
    subject: {
      // JEDNA PARA NA KAŻDĄ PLAKIETKĘ, I JEST TO POPRAWKA PO WŁASNYM
      // BREAK-TEŚCIE, nie ostrożność z góry. Ta para stała najpierw na
      // `[data-part] svg` z podłogą 2 i uzasadnieniem „dwa, bo fikstura rysuje
      // plakietkę dealów i plakietkę spotkań". Arytmetyka tego uzasadnienia
      // była błędna: fikstura rysuje PIĘĆ znaków (trzy plakietki dealów, dwie
      // spotkań), więc zdjęcie glifu z CAŁEJ połowy dealowej zostawiało 2 i para
      // wracała ZIELONA. Złamanie zgłosiło to jako `FAILED (the assertion stayed
      // green on broken code)` — czyli przyrząd sam powiedział, że jego podłoga
      // jest spełnialna przez nie ten podmiot. Rozdzielone atrybutem, który
      // wiersz i tak deklaruje.
      selector: '[data-people-surface] [data-part="deals"] svg',
      why: "the glyph on the DEALS badge, counted on the declared attribute rather than on a module hash; a floor over both badges together is satisfiable by either one alone",
      app: "packages/desktop-ui/src/people/PeopleSurface.tsx (.part) + people.module.css (.part svg)",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 1 },
    status: "enforced",
  },
  {
    id: "D9-01b",
    lot: "D9",
    position: 1,
    kind: "prescribed",
    title: "and it is row-content size, not view-bar chrome size",
    contract: '.ui-craft/tokens.md — „Component layer"',
    prototype: {
      file: "v3/screens/crm.css",
      lines: "162",
      value:
        "`.crm-part svg { width: 0.6875rem; height: 0.6875rem; opacity: 0.75; }` — trzeci stopień wielkości znaku w prototypie, osobny od 0,8125 rem paska widoku (`v3/app.css:348`) i od 1 rem globalnego (`v3/app.css:20`)",
    },
    route: { surface: "people" },
    subject: {
      // TU podmiot ZOSTAJE nierozdzielony, i jest to różnica, nie niekonsekwencja:
      // rozmiar pochodzi z JEDNEJ reguły (`.part svg`), więc rozdzielenie dałoby
      // dwie pary nad tą samą deklaracją. Rozdzielona jest OBECNOŚĆ, bo ona
      // pochodzi z dwóch osobnych montaży w JSX i każdy da się skasować osobno.
      selector: "[data-people-surface] [data-part] svg",
      why: "the same glyphs as D9-01a/c but read by property rather than counted — a count floor is green at every size, and this glyph's size is what says which of the prototype's three rules it came from",
      app: "packages/desktop-ui/src/people/people.module.css (.part svg)",
    },
    read: { property: "width" },
    expect: { kind: "rem", value: 0.6875 },
    status: "enforced",
  },
  {
    id: "D9-01c",
    lot: "D9",
    position: 1,
    kind: "prescribed",
    title: "and the meetings half opens with its own",
    contract: '.ui-craft/tokens.md — „Component layer"',
    prototype: {
      file: "v3/screens/crm.js",
      lines: "421",
      value:
        '`<span class="crm-part">${icon("meeting")}${pjPlural(r.meetings.length, "meeting", "meetings")}</span>` — drugi montaż, własny glif',
    },
    route: { surface: "people" },
    subject: {
      // DRUGA PARA, NIE DRUGA WŁASNOŚĆ PIERWSZEJ — dokładnie ten sam powód, dla
      // którego istnieje D6-04b obok D6-04a. Ta plakietka nie narysowała się
      // w tym harnessie ANI RAZU do lotu D9: fikstura CRM nie miała żadnego
      // rekordu `meeting`, więc jej gałąź była nieodróżnialna od poprawnej.
      selector: '[data-people-surface] [data-part="meetings"] svg',
      why: "the glyph on the MEETINGS badge — a separate mount in the JSX, deletable on its own, and a branch this fixture could not draw at all before lot D9 seeded meeting records",
      app: "packages/desktop-ui/src/people/PeopleSurface.tsx (.part) + people.module.css (.part svg)",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 1 },
    status: "enforced",
  },

  // ── LOT D10 — PASMA JAKO RODZEŃSTWO PRZEWIJANEGO PUDEŁKA (wpis #22) ───────
  //
  // OSTATNIE 12 px WPISU #22. Lot D1 zamknął ten wpis na własnym roszczeniu
  // (chrom nad listą Organizacji 139 → 92 px), zostawiając JAWNIE nieoddane
  // ostatnie 12 px: prototyp ma 80 px chromu, my mieliśmy 92. Różnicą był
  // `gap` kolumny nośnika, który dzieli PASMO od TREŚCI dokładnie dlatego, że
  // pasmo i treść są u nas rodzeństwem w jednym pudełku. W prototypie nie są.
  //
  // CO MIERZĄ TE CZTERY PARY, powiedziane wprost, bo mierzą UKŁAD, a nie
  // piksel: sam pomiar „120 zamiast 132" jest geometrią, a geometria bez
  // zadeklarowanej przyczyny zieleniałaby też nad ekranem, któremu ktoś zdjął
  // odstęp jedną deklaracją i zostawił pasma jadące z treścią. Pary czytają
  // więc TRZY deklaracje, z których ta liczba wynika — kto przewija
  // (D10-01a/b) i czyimi dziećmi są pasma (D10-01c/d) — po jednej na oba
  // przepięte ekrany, żeby żaden nie dał się cofnąć przy zielonym przelocie.
  //
  // CZEGO TA MAPA NIE ZOBACZY: że pasmo NAPRAWDĘ stoi przy przewijaniu.
  // Spacer nie ma kroku „przewiń", więc zachowanie jest zmierzone sondą lotu,
  // nie tą mapą — przed: `scrollTop 60` zabierał pasmo tytułu z y=40 na y=-20;
  // po: zostaje na y=40. Zapisane w raporcie lotu, bo tu byłoby nieodróżnialne
  // od zieleni.
  {
    id: "D10-01a",
    lot: "D10",
    position: 1,
    kind: "restructure",
    title: "the screen's carrier stops being the box that scrolls",
    contract: '.ui-craft/patterns.md — „Pattern: Surface title band"',
    prototype: {
      file: "v3/app.css",
      // Otwarte i sprawdzone przy tych liniach: 278-281 to `.canvas` (kolumna
      // `flex`), 282-285 `.crumbbar`, 295-299 `.viewbar`, 303 `.scroller`
      // z `overflow: auto`. Kanwa NIE deklaruje `overflow` w ogóle — przewija
      // wyłącznie trzecie dziecko. Trzy noty w arkuszu aplikacji cytowały
      // dotąd `281-293`, zakres bez `.canvas` i bez `.scroller`, czyli bez obu
      // reguł, na których to zdanie stoi.
      lines: "278-303",
      value:
        "`.canvas { display: flex; flex-direction: column }` bez własnego `overflow`, a `.scroller { flex: 1; min-height: 0; overflow: auto }` — przewija się TRZECIE dziecko, nie pojemnik",
    },
    route: { surface: "organizations" },
    subject: {
      // NOŚNIK JEST JEDEN NA CAŁĄ POWŁOKĘ i nosi ręcznie pisaną nazwę
      // z `styles.css`, nie skrót modułu — więc selektor nie zgnije przy
      // przebudowie arkusza. `overflow-y` jest tu WŁAŚCIWĄ własnością do
      // odczytu, bo to ona rozstrzyga, które pudełko jest portem przewijania,
      // a nie to, które akurat ma dość treści, żeby się przewinąć.
      selector: ".work-surface",
      why: "the carrier declared `overflow: auto` and therefore scrolled the bands with the content; the whole entry is that it stops doing so",
      app: "packages/desktop-ui/src/styles.css (.work-surface:has(> .surface-header)), RealApp.tsx (#main-content)",
    },
    read: { property: "overflowY" },
    expect: { kind: "literal", value: "hidden" },
    status: "enforced",
  },
  {
    id: "D10-01b",
    lot: "D10",
    position: 1,
    kind: "restructure",
    title: "and the box below the bands takes the scrolling instead",
    contract: '.ui-craft/patterns.md — „Pattern: Surface title band"',
    prototype: {
      file: "v3/app.css",
      lines: "303",
      value:
        "`.scroller { flex: 1; min-height: 0; overflow: auto; scroll-padding-block: 3rem 5rem }` — jedyne dziecko kanwy z własnym przewijaniem",
    },
    route: { surface: "organizations" },
    subject: {
      // DZIECKO BEZPOŚREDNIE, nie potomek: para o tym, KTÓRE pudełko przewija,
      // przepuszczałaby przy selektorze potomka dowolny zagnieżdżony scroller
      // (Lejek ma własny, `_scroller_` w module) i mówiłaby wtedy co innego,
      // niż mówi jej tytuł.
      selector: ".work-surface > .surface-scroll",
      why: "before this lot it computed `overflow-y: visible` on every surface — the scrolling lived one box higher, which is exactly why the bands travelled",
      app: "packages/desktop-ui/src/styles.css (.work-surface:has(> .surface-header) > .surface-scroll)",
    },
    read: { property: "overflowY" },
    expect: { kind: "literal", value: "auto" },
    status: "enforced",
  },
  {
    id: "D10-01c",
    lot: "D10",
    position: 1,
    kind: "restructure",
    title: "the title band is a sibling of that box, not a child of it",
    contract: '.ui-craft/patterns.md — „Pattern: Surface title band"',
    prototype: {
      file: "v3/app.css",
      lines: "282-285",
      value:
        "`.crumbbar { flex: none; min-height: var(--header-band-height) … }` — deklarowane jako DZIECKO `.canvas`, rodzeństwo `.scroller`, i `flex: none` jest tym, co znaczy „nie jedzie z treścią”",
    },
    route: { surface: "organizations" },
    subject: {
      // POŁOŻENIE, NIE WYGLĄD. Dwie pary wyżej czytają `overflow`, więc same
      // w sobie byłyby spełnione także wtedy, gdyby pasmo zostało w środku
      // przewijanego pudełka — a wtedy jechałoby z treścią przy zielonym
      // przelocie. Ta para mówi zdanie wpisu dosłownie.
      selector: ".work-surface > .surface-header",
      why: "the arrangement IS the entry: a band inside the scrolling box travels with the content no matter what that box declares",
      app: "packages/desktop-ui/src/StrategicDepthSurface.tsx (fragment zamiast pojemnika)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  {
    id: "D10-01d",
    lot: "D10",
    position: 1,
    kind: "restructure",
    title: "and so is the view bar, on the second migrated screen",
    contract: '.ui-craft/patterns.md — „Pattern: Surface title band"',
    prototype: {
      file: "v3/app.css",
      lines: "295-299",
      value:
        "`.viewbar { flex: none; min-height: var(--header-band-height) … }` — drugie pasmo, deklarowane obok pierwszego jako dziecko `.canvas`",
    },
    route: { surface: "renewals" },
    subject: {
      // DRUGI EKRAN I DRUGIE PASMO NARAZ, świadomie. Lot przepiął DWA ekrany,
      // a para stojąca wyłącznie nad Organizacjami zostawiłaby Odnowienia do
      // cofnięcia przy zielonym przelocie — dokładnie ta klasa dziury, którą
      // ten plik ma nazwaną przy D7-03f.
      selector: ".work-surface > .view-band",
      why: "the second band is a separate mount in a separate file; the first band's pair says nothing about it",
      app: "packages/desktop-ui/src/renewals/RenewalsSurface.tsx (fragment zamiast pojemnika)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },

  // ── LOT D7 — REKOMPOZYCJA CIAŁA SPOTKAŃ (wpisy #63, #64, #65) ─────────────
  //
  // TRZY WPISY, JEDNA ROBOTA, TRZY POZYCJE. Rejestr mówi wprost, że każdy z
  // nich osobno zostawia ekran GORSZYM niż był, bo wszystkie trzy opisują
  // jedno pudełko: farbę karty stojącą na SEKCJI zamiast na LIŚCIE w środku.
  //
  // CO FIKSTURA DOSIĘGA, ZMIERZONE, A NIE ZAŁOŻONE. Harness powłoki oddawał na
  // tym ekranie odmowę dostawcy z pustymi tablicami, więc bramka nie rysowała
  // ANI JEDNEGO wiersza. Ten lot dokłada mu pętlę spotkań w stanie
  // `permission_required` z dwoma wynikami Jamie i pustymi nadchodzącymi —
  // spójnym stanem domeny, który rysuje kartę wyników, pusty stan
  // nadchodzących i kontrolkę uprawnienia naraz. Wiersz nadchodzących
  // WPUSZCZONY w jaśniejszą kartę pozostaje niedosiężny tą fiksturą i stoi
  // wypisany w `VISUAL_LANGUAGE_ROUTED_NOT_COVERED` z warunkiem wyjścia.
  {
    id: "D7-01a",
    lot: "D7",
    position: 1,
    kind: "prescribed",
    title: "the meetings body is one column, not a work lane beside a rail",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.css",
      lines: "11",
      value:
        "`.mt { max-width: 74rem; padding: var(--space-6) }` — jedna kolumna; zmierzone w przeglądarce przy 1440 px: OBIE sekcje x=264, w=1136, szyny nie ma",
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-body",
      why: "LICZBA ŚCIEŻEK, nie ich szerokość: `grid-template-columns` liczy się do pikseli zależnych od okna, więc literał pinowałby liczbę, która zmienia się z szerokością. Dwie ścieżki to szyna; jedna to wpis #63 oddany",
      app: "packages/desktop-ui/src/styles.css (.meeting-body)",
    },
    read: { property: "gridTemplateColumns" },
    expect: { kind: "tracks", equals: 1 },
    status: "enforced",
  },
  {
    id: "D7-01b",
    lot: "D7",
    position: 1,
    kind: "prescribed",
    title: "and Coming up is the FIRST section, not the demoted one",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.js",
      lines: "430-451",
      value:
        'dwie `<section class="mt-sec">` w pionie — „Coming up” PIERWSZA, „What is left of the ones that happened” druga',
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-body > .meeting-upcoming:first-child",
      why: "DRUGA para nad tą samą pozycją, i nie jest to druga własność pierwszej: jedna kolumna z odwróconą kolejnością przechodzi D7-01a zieloną, a rejestr mówi o KOLEJNOŚCI („pierwsza sekcja”), nie tylko o szerokości. `:first-child` jest tu całą treścią selektora",
      app: "packages/desktop-ui/src/MeetingsSurface.tsx (upcomingSection w .meeting-body)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  {
    id: "D7-01c",
    lot: "D7",
    position: 1,
    kind: "prescribed",
    title: "and the context rail is gone from the page, not merely restyled",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.js",
      lines: "430-451",
      value: "prototyp nie ma na tym ekranie ŻADNEGO trzeciego pojemnika",
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-context-rail",
      why:
        'PARA NA ZERZE JEST TU POMIAREM, NIE CISZĄ, i to jest sprawdzone w przyrządzie, a nie założone: `judgeVisualPair` rozstrzyga `kind: "count"` ZANIM dojdzie do gałęzi „selektor nie trafił w nic”, więc zero dopasowań wraca jako `measured` z liczbą 0, a nie jako NOT_MEASURED. ' +
        "Szyna zniknęła RAZEM ze swoją treścią — kontrolka uprawnienia przeniosła się do sekcji nadchodzących, a nie została skasowana; tego para pikselowa nie dosięga i pilnuje tego asercja źródłowa w `interaction-recovery-contract.test.ts`",
      app: "packages/desktop-ui/src/MeetingsSurface.tsx + styles.css (klasa usunięta z obu)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    id: "D7-01d",
    lot: "D7",
    position: 1,
    kind: "prescribed",
    title: "and the row itself is composed for the width it was moved into",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.css",
      lines: "54-55",
      value:
        "`.mt-up { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr) auto }` — kiedy, treść i akcja OBOK siebie",
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-event",
      why: "CZWARTA para nad pozycją #63 i JEDYNA, która patrzy do ŚRODKA przeniesionego pudełka. Trzy pierwsze mierzą, GDZIE sekcja stoi; wiersz przeniesiony na 1136 px, ale wciąż noszący jedną kolumnę zaprojektowaną na szynę 18-22 rem, przechodzi wszystkie trzy zielone i jest dokładnie tym półstanem, o którym rejestr pisze, że zostawia ekran GORSZYM niż był. Liczba ścieżek, nie ich szerokość — piksele ścieżek zależą od okna",
      app: "packages/desktop-ui/src/styles.css (.meeting-event)",
    },
    read: { property: "gridTemplateColumns" },
    expect: { kind: "tracks", equals: 3 },
    status: "enforced",
  },
  {
    id: "D7-01e",
    lot: "D7",
    position: 1,
    kind: "prescribed",
    title: "and the provenance chain inside it stops absorbing the free width",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.css",
      lines: "54-55, 77",
      value:
        "łańcuch prowenancji siedzi u prototypu w ŚRODKOWEJ ścieżce wiersza (`.mt-up-main { min-width: 0; display: block }`), a nie na nadwyżce całego wiersza",
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-event .evidence-thread i",
      why: "`flexGrow`, NIE szerokość, i to jest wybór z powodu: szerokość kreski jest funkcją okna, więc literał pinowałby liczbę zależną od widoku, a to, co ten lot zepsuł, jest DEKLARACJĄ — reguła bazowa `.evidence-thread i` daje `flex: 1 1 1.5rem`, czyli udział w całej nadwyżce. W szynie nie było czego wchłaniać; po przeniesieniu wiersza na 1136 px dwie kreski urosły do ~700 px każda, czyli łańcuch pochodzenia czytał się jak dwie długie linie z plakietkami na końcach. Selektor jest ZAWĘŻONY do wiersza spotkania, bo regułę bazową dzieli onboarding, gdzie rozciąganie jest zamierzone — para bez tego zawężenia żądałaby zmiany tam",
      app: "packages/desktop-ui/src/styles.css (.meeting-event .evidence-thread i)",
    },
    read: { property: "flexGrow" },
    expect: { kind: "literal", value: "0" },
    status: "enforced",
  },
  {
    id: "D7-02a",
    lot: "D7",
    position: 2,
    kind: "prescribed",
    title: "the card is the LIST, painted on the content plane",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.css",
      lines: "40-43",
      value:
        "`.mt-list { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-content); box-shadow: var(--shadow-sm) }`; zmierzone w przeglądarce: oklch(0.152 0.012 285), czyli JAŚNIEJ od kanwy oklch(0.062 0.008 285)",
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-result-list",
      why: "`--panel-reading-bg` rozwiązuje się do `var(--surface-content)` (tokens.css), więc ta para NIE odróżnia tych dwóch nazw — i nie musi, bo to jeden plan. Odróżnia natomiast plan treści od `--surface-sunken`, na którym ta lista stała",
      app: "packages/desktop-ui/src/styles.css (.meeting-result-list)",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "token", token: "--panel-reading-bg" },
    status: "enforced",
  },
  {
    id: "D7-02b",
    lot: "D7",
    position: 2,
    kind: "prescribed",
    title: "and the section holding it stopped being a raised plane",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.css",
      lines: "13-14",
      value:
        "`.mt-sec { margin-bottom: var(--space-8) }` — sekcja niesie SAM margines",
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-completed",
      why: "LITERAŁ „none”, bo „przestała być planem podniesionym” jest NIEOBECNOŚCIĄ cienia, a `--elevation-raised` nie ma tokenu wyłączonego. Bez tej pary D7-02a przechodzi nad wersją, w której farbę mają OBA pudełka — a dwie karty jedna w drugiej to ta sama wada z drugiej strony",
      app: "packages/desktop-ui/src/styles.css (.meeting-upcoming, .meeting-completed)",
    },
    read: { property: "boxShadow" },
    expect: { kind: "literal", value: "none" },
    status: "enforced",
  },
  // PARY NAD `.meeting-empty` TU NIE MA, I JEST TO ZAMIANA RAMIENIA, NIE
  // ROZLUŹNIENIE. Stała tu D7-02c, czytająca przezroczystość stanu pustego
  // nadchodzących; fikstura bramki rysuje odtąd DRUGIE ramię tego samego
  // wyrażenia (`MeetingsSurface.tsx:880`) — kartę z wierszem — bo tamto ramię
  // niosło jeden podmiot, a to niesie cztery (D7-01d, D7-02e, D7-02f oraz
  // szerokość akcji wiersza). Suma `notCovered` idzie przy tym W DÓŁ, 15 → 14:
  // dwa wpisy o wierszach nadchodzących zostały zamknięte, jeden o stanie
  // pustym dopisany. Mechanizm i osiągalny warunek wyjścia stoją przy wpisie
  // w `VISUAL_LANGUAGE_ROUTED_NOT_COVERED`.
  {
    id: "D7-02d",
    lot: "D7",
    position: 2,
    kind: "prescribed",
    title: "and the integration plate is a card, not a well sunk into the page",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.css",
      lines: "6-9",
      value:
        "„Nadchodzące są WPUSZCZONE: nie da się w nich nic zmienić. Odbyte stoją na `--surface-content`, bo to na nich się pracuje” — wpuszczenie jest wydane na ZNACZENIE",
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-integration",
      why: "TRZECI podmiot tej samej pozycji, bo `--surface-sunken` siedział w arkuszu w TRZECH miejscach, a rekompozycja wystawiła wszystkie trzy wprost na kanwę. Ta tafla jest formularzem, w który wpisuje się klucz — czyli dokładnym przeciwieństwem tego, na co prototyp wydaje wpuszczenie",
      app: "packages/desktop-ui/src/styles.css (.meeting-integration)",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "token", token: "--panel-reading-bg" },
    status: "enforced",
  },
  {
    id: "D7-02e",
    lot: "D7",
    position: 2,
    kind: "prescribed",
    title: "and the upcoming list is a card on the same plane, not a well",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.css",
      lines: "40-43",
      value:
        "`.mt-list { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-content); box-shadow: var(--shadow-sm) }` — TEN SAM pojemnik obsługuje obie sekcje prototypu",
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-upcoming-list",
      why: 'BLIŹNIAK D7-02a, i stoi osobno, bo to INNA deklaracja w INNEJ regule — jeden wpis nad dwiema regułami jest w tym repozytorium nazwaną klasą defektu. Ta para była do lotu D7 wypisana jako niedosiężna; fikstura powłoki rysuje odtąd wiersze nadchodzących (`availability: "offline"`, `canRead: true`), więc pojemnik istnieje i odmowa pomiaru straciła podstawę',
      app: "packages/desktop-ui/src/styles.css (.meeting-upcoming-list)",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "token", token: "--panel-reading-bg" },
    status: "enforced",
  },
  {
    id: "D7-02f",
    lot: "D7",
    position: 2,
    kind: "prescribed",
    title: "and the upcoming row is sunken INSIDE that lighter card",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.css",
      lines: "6-9",
      value:
        "„Nadchodzące są WPUSZCZONE (`--surface-sunken`): nie da się w nich nic zmienić, więc leżą pod planem treści” — a `.mt-up` (`meetings.css:54-59`) leży w `.mt-list` stojącej na `--surface-content`",
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-event",
      why: 'TO JEST SEDNO WPISU #64, a nie jego przypis: drabina ma trzy szczeble (kanwa najciemniej, karta jaśniej, wiersz wpuszczony W KARCIE) i dopiero ta para odróżnia ją od wersji, w której wpuszczenie zeszło razem z odwróceniem. Do lotu D7 stała jako niedosiężna z powodem, który był NIEPRAWDĄ — rysowanie wierszy nie wymaga `available`, a fikstura nigdy nie rysowała gałęzi „Grant access”, bo deklarowała `platform: "other"`. Czytana razem z D7-02e, która pilnuje, że karta wokół jest JAŚNIEJSZA',
      app: "packages/desktop-ui/src/styles.css (.meeting-event)",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "token", token: "--surface-sunken" },
    status: "enforced",
  },
  {
    id: "D7-03a",
    lot: "D7",
    position: 3,
    kind: "prescribed",
    title: "the section head is a sibling of the card, standing on the canvas",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.css",
      lines: "15-18",
      value:
        "`.mt-sec-head { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3) }` — zmierzone w przeglądarce: `headInsideList: false`, x=264, ta sama lewa krawędź co lista, tło przezroczyste",
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-completed > .meeting-sec-head",
      why: "`>` jest tu całą treścią selektora: nagłówek musi być DZIECKIEM sekcji, a nie czymkolwiek w jej wnętrzu. Liczba, nie własność, bo wpis mówi o POŁOŻENIU w drzewie",
      app: "packages/desktop-ui/src/MeetingsSurface.tsx (.meeting-sec-head)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  {
    id: "D7-03b",
    lot: "D7",
    position: 3,
    kind: "prescribed",
    title: "and no head is left inside the card it escaped",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.js",
      lines: "444-449",
      value:
        '`<div class="mt-sec-head">` (:445) stoi PRZED `${importedHtml}` (:449), poza pojemnikiem listy',
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-result-list .meeting-sec-head",
      why: "TA PARA JEST NIEPUSTA WYŁĄCZNIE DZIĘKI D7-02a: zero dopasowań znaczyłoby to samo, gdyby karty w ogóle nie było, a D7-02a pada głośno dokładnie wtedy. Same w sobie zero na nieistniejącym podmiocie jest zielenią bez treści — para bez tej drugiej nie miałaby wartości i to jest powód, dla którego stoją razem",
      app: "packages/desktop-ui/src/styles.css (.meeting-result-list) + MeetingsSurface.tsx",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    id: "D7-03c",
    lot: "D7",
    position: 3,
    kind: "prescribed",
    title: "and the head has a right-side affordance, not an empty right end",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.js",
      lines: "447",
      value:
        '`<button class="more" data-mt-go=\'{"kind":"sources"}\'>Open Sources →</button>`, dosunięty regułą `.mt-sec-head .more { margin-left: auto }` (meetings.css:27-29)',
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-completed .meeting-sec-head [data-open-sources]",
      why: "LICZBA, NIE `marginLeft`, i to jest wzorzec D2-09 z podanego tam powodu: `margin-left: auto` rozwiązuje się do UŻYTEJ szerokości piksela, więc para czytająca margines mierzyłaby wolne miejsce, a nie deklarację. Wpis mówi o BRAKU slotu, a brak jest liczbą",
      app: "packages/desktop-ui/src/MeetingsSurface.tsx (.meeting-sec-more[data-open-sources]) + RealApp.tsx (onOpenSources)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  {
    id: "D7-03d",
    lot: "D7",
    position: 3,
    kind: "prescribed",
    title: "and the head is not the card's divider rule",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.css",
      lines: "15-18",
      value:
        "`.mt-sec-head` nie deklaruje żadnej krawędzi; zmierzone w przeglądarce: 0 px dolnej kreski",
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-completed > .meeting-sec-head",
      why: "TEN SAM PODMIOT CO D7-03a, ale czytany WŁASNOŚCIĄ, a nie liczony — i to nie jest powtórka: nagłówek wyprowadzony z karty, który wciąż nosi jej kreskę działową, przechodzi D7-03a zieloną i dalej wygląda jak wieko pudełka. Kreska była tym, co trzymało go w środku",
      app: "packages/desktop-ui/src/styles.css (.meeting-sec-head)",
    },
    read: { property: "borderBottomWidth" },
    expect: { kind: "literal", value: "0px" },
    status: "enforced",
  },
  {
    id: "D7-03e",
    lot: "D7",
    position: 3,
    kind: "prescribed",
    title: "and it is set at the reference's step, not at the card's",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.css",
      lines: "19-22",
      value:
        "`.mt-sec-head h2 { font-size: var(--text-md); font-weight: 600; letter-spacing: -0.012em }`",
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-sec-head h2",
      why: "bez klasy sekcji, bo TEN stopień należy do OBU nagłówków tego ekranu — para przypięta do jednej sekcji byłaby zielona nad połową poprawki, co jest w tym repo nazwaną klasą defektu (jeden kształt przepisany w kilku miejscach)",
      app: "packages/desktop-ui/src/styles.css (.meeting-sec-head h2)",
    },
    read: { property: "fontSize" },
    expect: { kind: "token", token: "--text-md" },
    status: "enforced",
  },
  {
    id: "D7-03f",
    lot: "D7",
    position: 3,
    kind: "prescribed",
    title: "and the upcoming section has that head too, not only its twin",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.js",
      lines: "436, 445",
      value:
        'OBIE sekcje prototypu otwiera `<div class="mt-sec-head">` — nadchodzące (:436) pod „Coming up”, odbyte (:445) pod „What is left of the ones that happened”',
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-upcoming > .meeting-sec-head",
      why: "BLIŹNIAK D7-03a, DOPISANY PRZY ODBIORZE, bo każda para pozycji 3 była przypięta do sekcji ODBYTYCH, a jedyna czytająca obie (D7-03e) czyta stopień pisma. Nagłówek nadchodzących dało się z tego ekranu USUNĄĆ i cały przelot zostawał zielony — bramka mierząca obecność dla jednego bliźniaka i nic dla drugiego jest w tym repozytorium nazwaną klasą defektu. Podmiot rysuje się niezależnie od `upcoming.length`, więc para stała otworem także przy poprzedniej fiksturze",
      app: "packages/desktop-ui/src/MeetingsSurface.tsx (upcomingSection > .meeting-sec-head)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  {
    id: "D7-03g",
    lot: "D7",
    position: 3,
    kind: "prescribed",
    title: "and its right end carries the lock badge, not nothing",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card"',
    prototype: {
      file: "v3/screens/meetings.css",
      lines: "32-37",
      value:
        '`.mt-sec-lock { margin-left: auto; … border-radius: var(--radius-full) }`, wstawiona w `meetings.js:438-439` jako `${icon("lock")}Outlook`',
    },
    route: { surface: "meetings" },
    subject: {
      selector: ".meeting-upcoming .meeting-sec-lock",
      why: "PRAWY KONIEC DRUGIEJ POŁOWY #65, mierzony tak samo jak pierwsza (D7-03c liczy `[data-open-sources]` u odbytych). Ta plakietka NIE JEST ozdobą: głębia wpuszczonego wiersza (D7-02f) jest nieczytelna dla każdego, kto jej nie widzi, a prototyp pisze wprost, że wpuszczenie „działa razem z kłódką i etykietą, nigdy samo” (`meetings.css:6-9`). Liczba, nie `marginLeft`, z powodu podanego przy D7-03c",
      app: "packages/desktop-ui/src/MeetingsSurface.tsx (.meeting-sec-lock) + styles.css",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  // PARY NAD PLAKIETKĄ UCZESTNICTWA TU NIE MA, BO TA POŁOWA #29 NIE ZOSTAŁA
  // ODDANA. Para została napisana (`[data-people-surface] [class*="_part_"]
  // svg`, podłoga 3 — tyle plakietek rysuje ta fikstura) i ZDJĘTA razem
  // z glifem, kiedy bramka układu wróciła czerwona na `span._parts`: 55 px
  // przepełnienia przy tekście 200% wobec sufitu 25 px i 36 px w oknie 320 px
  // wobec 24. Zostawienie samej pary byłoby wiecznym czerwonym wierszem nad
  // świadomą odmową; powód i arytmetyka stoją w `people/PeopleSurface.tsx`
  // przy pasie uczestnictwa, a pozycja jest w raporcie lotu w `notDelivered`.
];

/**
 * POZYCJE LOTÓW 2-6 BEZ PARY. Ta lista jest deliverable równym mapie: mówi
 * lotom, GDZIE nie ma dowodu, i mówi to ZANIM lot odda robotę.
 */
export const VISUAL_LANGUAGE_ROUTED_NOT_COVERED = [
  {
    // POŁOWA WPISU #61, WYPISANA ZAMIAST ZAMKNIĘTA DEKLARACJĄ. `resize: none`
    // stoi dziś na OBU polach komentarza — na `.composerText` (pisanie nowego,
    // mierzone parą D4-06b) i na `.field` (poprawianie istniejącego). Drugiego
    // nie mierzy NIC i nie da się tego naprawić selektorem: pole edycji
    // powstaje dopiero po kliknięciu „Edit" na cudzym komentarzu, a `route`
    // tej mapy zna kroki `surface`, `layout`, `treeKey`, `openRecord`
    // i `recordTab` — żadnego „naciśnij kontrolkę w wierszu i mierz to, co się
    // rozwinie".
    //
    // PARA NAD TYM POLEM ZOSTAŁA NAPISANA I ZDJĘTA W TYM SAMYM PRZELOCIE, i to
    // jest powód, dla którego ten wpis brzmi tak stanowczo: wróciła
    // NOT_MEASURED („[class*=\"_field_\"] matched NO element"), czyli jako
    // awaria przyrządu, nie jako czerwień do naprawienia kodem. Wyjściem jest
    // krok trasy naciskający kontrolkę wiersza — przebudowa przelotu, nie
    // pozycja ekranowa.
    lot: "D4",
    position: 7,
    scope: "drugie pole komentarza — edycja istniejącego, nie kompozytor",
    title: "the edit-in-place textarea's resize handle has no measurement",
    prototype:
      "v3/screens/record.css:419 (`.rc-composer textarea { resize: none }`)",
    app: "packages/desktop-ui/src/record/record-comments.module.css (.field), RecordCommentsPanel.tsx:633 (styles.editField)",
    why:
      "Pole edycji nie istnieje w DOM-ie, dopóki czytelnik nie otworzy edytora na konkretnym komentarzu, " +
      "a ta mapa nie ma kroku, który by to zrobił. Zmiana JEST oddana i widać ją w odczycie kodu — jedna " +
      "deklaracja w regule `.field`, ta sama co w `.composerText` — ale dowodem jest tu źródło, nie piksel.",
  },
  {
    // NIEODDANE PRZEZ NAPRAWĘ PO PRZEGLĄDZIE LOTU D2, WYPISANE ZAMIAST
    // ZAMKNIĘTE. Prototyp ma DOKŁADNIE JEDNĄ formę kontekstowego wyzwalacza
    // pomocy i stawia ją dwanaście razy przez jedną funkcję (`v3/app.js:2001`
    // → `class="helpb"`, `v3/app.css:896-904`). Ta aplikacja ma dziś DWIE:
    // okrągły znacznik `.help-mark` na Dzisiaj i na Kalendarzu (dwa miejsca,
    // objęte parami D2-03a/b/c) oraz dzielony komponent `help/TopicHelp.tsx`
    // — słowny wyzwalacz z kropkowanym podkreśleniem, bez ramki i bez okręgu
    // (`help/topic-help.module.css:21-29`) — zamontowany w dziesięciu
    // miejscach na siedmiu ekranach.
    lot: "D2",
    position: 3,
    scope: "trzecia forma tego samego wyzwalacza — dziesięć montaży TopicHelp",
    title: "on-demand help has one shape in the reference and two in the app",
    prototype:
      "v3/app.css:896-904 (`.helpb`), wywołania m.in. v3/screens/calendar.js:205, screens/inbox.js:292, screens/meetings.js:439",
    app: "packages/desktop-ui/src/help/TopicHelp.tsx:21-51 + help/topic-help.module.css:21-29 (StrategicDepthSurface.tsx:897, MeetingsSurface.tsx:1457, pipeline/PipelineSurface.tsx:980, :1001, :1002, library/NotesReading.tsx:362, library/SourcesReading.tsx:162, :371, renewals/RenewalsSurface.tsx:443, :1076)",
    why:
      "Przepięcie `TopicHelp` na okrągły znacznik nie jest zmianą klasy: jego etykietą JEST całe pytanie " +
      "(„What do these three states mean?”), które przy tej formie musiałoby zejść do `aria-label`, " +
      "a reguła `white-space: normal` w tym module powstała z POMIARU — 181 px nadmiaru w czytelni Źródeł " +
      "przy 300% tekstu. Zmiana dotyka siedmiu ekranów i dwóch bramek szerokości naraz, więc jest LOTEM, " +
      "nie naprawą po przeglądzie. Kontrakt " +
      "(`.ui-craft/surfaces/contextual-concept-help.md`) mówi o tym wprost, zamiast deklarować formę, " +
      "której app nie ma w dziesięciu na dwanaście miejsc.",
    greenWrong:
      "Jedenasty montaż `TopicHelp` może dołożyć trzecią formę pomocy i żaden przelot tego nie zobaczy.",
  },
  {
    // ZMIERZONE, NIE ZAŁOŻONE: naprawa po przeglądzie lotu D2 NAPISAŁA tę parę
    // (`[data-meeting-help]`, `width` = 1,125 rem) razem z markerem przybycia
    // Kalendarza, przeleciała bramkę i dostała `NOT_MEASURED` w OBU motywach.
    // Dopiero ten przelot powiedział, dlaczego.
    lot: "D2",
    position: 3,
    scope: "połowa pozycji — piksel bliźniaka na Kalendarzu",
    title: "the Calendar twin of the help mark has no pixel measurement",
    prototype:
      "v3/app.css:896-904 (`.helpb`), v3/screens/calendar.js:205, :207",
    app: "packages/desktop-ui/src/CalendarSurface.tsx (`.help-mark`, `[data-meeting-help]`)",
    why:
      "Harness powłoki nie ma w kalendarzu ANI JEDNEGO spotkania, a przycisk rysuje " +
      "się wyłącznie nad tygodniem, w którym stoi jakieś spotkanie — i tak ma być, bo tydzień bez " +
      "spotkań nie tłumaczy zachowania rzeczy, której nie ma na ekranie. " +
      "PRZYCZYNA PRZEPISANA PRZY LOCIE D7, 2026-08-12, BO POPRZEDNIA PRZESTAŁA BYĆ PRAWDĄ: ten wpis " +
      "powoływał się na domyślną odmowę `client/scenario-client.ts` (`provider_unavailable`, " +
      "`canRead: false`), a harness powłoki podaje odtąd WŁASNĄ pętlę spotkań. Blokuje dalej to samo " +
      "— `upcoming: []` w tej fiksturze — ale z innego powodu i pod innym adresem, a wpis cytujący " +
      "to, czego nie robi, jest długiem, który ta gałąź spłacała już dwa razy. Wyjściem jest DRUGI zestaw " +
      "danych (klient scenariuszowy z czytelnym kalendarzem), nie linijka. Sam KSZTAŁT tej afordancji " +
      "jest zmierzony parami D2-03a i D2-03b na Dzisiaj — obie kontrolki biorą tę samą regułę " +
      "`.help-mark` — a to, że kontrolka Kalendarza NIĄ JEST, asertuje " +
      "`desktop-ui/test/calendar.interaction.test.tsx`.",
    greenWrong:
      "Kontrolka pomocy na Kalendarzu może wrócić do dowolnego ROZMIARU bez zmiany klasy i żaden przelot pikseli tego nie zobaczy.",
  },
  {
    // WPIS #64, POŁOWA, KTÓREJ NIE DA SIĘ MIEĆ RAZEM Z DRUGĄ — I MECHANIZM
    // JEST TU WYPISANY, BO POPRZEDNIE DWA WPISY W TYM MIEJSCU MIAŁY POWÓD
    // NIEPRAWDZIWY. Stały tu dwa wpisy mówiące, że wiersze nadchodzących
    // wymagają `availability: "available"`, a to wygasza gałąź „Grant access".
    // Obie połowy tego zdania były fałszywe: napis „Grant access" wymaga
    // `platform === "macos"` RAZEM z `permission_required`
    // (`MeetingsSurface.tsx:603-608`), a tamta fikstura deklarowała
    // `platform: "other"`, więc rysowała „Check again" i tej gałęzi nie miała
    // ani przez chwilę; wiersze zaś rysują się przy KAŻDYM `canRead`, nie tylko
    // przy `available`. Fikstura stoi odtąd na `offline` z jednym wierszem, oba
    // tamte wpisy są zamknięte parami D7-02e i D7-02f, a NIEDOSIĘŻNY ZOSTAJE
    // PODMIOT PO DRUGIEJ STRONIE TEGO SAMEGO WYRAŻENIA.
    //
    // MECHANIZM, NIE NASTRÓJ: `.meeting-empty` i `.meeting-upcoming-list` to
    // dwa ramiona jednego wyrażenia warunkowego (`MeetingsSurface.tsx:880`),
    // więc żadna pojedyncza fikstura nie narysuje obu; bramka chodzi po JEDNYM
    // adresie (`verify-renderer-layout.mjs:116`), więc fikstura jest jedna.
    // Wybrane jest ramię z wierszami, bo daje CZTERY podmioty (D7-01d, D7-02e,
    // D7-02f oraz szerokość akcji wiersza) przeciwko JEDNEMU. Zamiana ramion
    // po stronie odbytych kosztowałaby DWA (D7-02a, D7-03b), więc `completed`
    // zostaje niepuste.
    lot: "D7",
    position: 2,
    scope: "połowa pozycji — przezroczystość stanu pustego nadchodzących",
    title: "the empty upcoming state is not a well cut into the canvas",
    prototype:
      "v3/screens/meetings.css:45-49 (`.mt-none` — sama kreskowana obwódka, wypełnienia ŻADNEGO)",
    app: "packages/desktop-ui/src/styles.css (.meeting-empty)",
    why:
      "`.meeting-empty` rysuje się WYŁĄCZNIE przy `upcoming.length === 0`, a `.meeting-upcoming-list` " +
      "wyłącznie przy niezerowym — to są dwa ramiona jednego wyrażenia w `MeetingsSurface.tsx:880`, " +
      "więc jedna fikstura rysuje dokładnie jedno z nich, a bramka ma jedną fiksturę, bo chodzi po " +
      "jednym adresie. Ramię z wierszami wybrano, bo niesie cztery mierzalne podmioty przeciwko " +
      "jednemu; przy poprzedniej fiksturze ta para (D7-02c) była zmierzona i to ona ustąpiła. " +
      "WARUNEK WYJŚCIA JEST OSIĄGALNY I NIE JEST NIM „większa fikstura”: drugi adres harnessu " +
      "z własną pętlą spotkań i pustym `upcoming`, do którego przelot dokłada przystanek. Sama " +
      "deklaracja stoi w arkuszu obok trzech pozostałych podmiotów tej pozycji (D7-02a, D7-02b, " +
      "D7-02d), które są mierzone dalej.",
    greenWrong:
      "Stan pusty nadchodzących może wrócić do wypełnienia `--surface-sunken` na kanwie i żaden przelot pikseli tego nie zobaczy.",
  },
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
    // PRZEPISANE PRZY ODBIORZE, 2026-08-07: tytuł „still has no consumer" był
    // prawdą do lotu 6 i przestał nią być razem z nim. Wpis ZOSTAJE na liście
    // nieobjętych — pary dalej nie ma — ale lista nieobjętych jest deliverable
    // i wpis, który kłamie o stanie aplikacji, jest gorszy niż jego brak:
    // czytający wziąłby ją za dowód, że token dalej stoi pusty.
    title: "--row-height has two consumers in Settings, and neither is paired",
    prototype: "v3/screens/settings.css:113-118, :343-347, :435-439",
    app: "packages/desktop-ui/src/styles.css:2678-2685 (`.status-list li`), settings/commercial-defaults-section.module.css:76-87 (wiersz etapu)",
    why:
      "Brief nazywa TOKEN, ale nie nazywa KONSUMENTA. Dwaj oczywiści kandydaci niosą próg dostępności " +
      "2,75 rem, którego lot ma NIE zjeżdżać (`.settings-help-entry`, picker) — a `--row-height` to " +
      "2,125 rem, czyli para na którymkolwiek z nich asertowałaby złamanie tamtego progu. Lot wskazał " +
      "zamiast nich DWA WIERSZE LISTY, czyli dokładnie ten rodzaj elementu, którym token wiąże " +
      "prototyp — ale para czytająca `minHeight` na wierszu byłaby zielona również nad wierszem " +
      "z wpisanym `2.125rem`, bo `getComputedStyle` oddaje piksele, nie nazwę tokenu. SAMEGO " +
      "ODWOŁANIA nie pilnuje dziś NIC — sprawdzone grepem po `scripts/`: ani jeden przyrząd w tym " +
      "repo nie wymienia `--row-height`.",
    greenWrong:
      "Konsument może odwoływać się do liczby zamiast do tokenu, albo zniknąć razem z regułą.",
  },
  {
    // CZWARTY KSZTAŁT ZNACZNIKA SYGNAŁU, WYPISANY ZAMIAST ZAMKNIĘTY
    // DEKLARACJĄ. Wpisy #20/#30 żądają CZTERECH rozróżnialnych kształtów,
    // a lot D6 dowiózł wszystkie cztery w arkuszu. Zmierzone parami są dwa
    // („Watch” — ukośne półwypełnienie, „At risk” — obwódka wypełnionego
    // pudełka), i to nie z wyboru: wykrzyknik jest WYCIĘTY z wypełnienia
    // pseudoelementem (`::after` + `clip-path`), a słownik `read` tej mapy zna
    // wyłącznie `getComputedStyle(element)` — bez drugiego argumentu, więc bez
    // pseudoelementów. Para napisana na samym elemencie wróciłaby z `clipPath:
    // none` i była zielona nad kodem, w którym wykrzyknika nie ma.
    //
    // DRUGI, NIEZALEŻNY POWÓD, DLA KTÓREGO POŁOWA TEJ POZYCJI NIE MA DOWODU:
    // fikstura harnessu rysuje DWA z czterech stanów (`risk`, `watch`).
    // Zielony kwadrat („On track”) i kreskowana obwódka („Dormant") nie mają
    // gdzie się narysować, więc pary nad nimi byłyby NOT_MEASURED — awarią
    // przyrządu nad poprawnym kodem, nie czerwienią do naprawienia.
    lot: "D6",
    position: 1,
    scope:
      "dwa z czterech kształtów — wycięty wykrzyknik („At risk”) i dwa stany, których fikstura nie rysuje",
    title: "the exclamation cut out of the risk mark has no measurement",
    prototype:
      "v3/app.css:396-399 (`.health.risk::after { background: var(--surface-canvas); clip-path: polygon(…) }`), :393 (`.health.ok`), :409 (`.health.none { border-style: dashed }`)",
    app: "packages/desktop-ui/src/organizations/organizations.module.css (.signalMark_risk::after, .signalMark_good, .signalMark_none) + bliźniak w people/people.module.css",
    why:
      "Dwie przyczyny, obie o PRZYRZĄDZIE, nie o kodzie. (1) `read` tej mapy czyta styl ELEMENTU; " +
      "`clip-path` wykrzyknika siedzi na `::after`, którego ta ścieżka nie widzi. (2) Fikstura harnessu " +
      "dosięga stanów `risk` i `watch` — zmierzone sondą na obu przystankach przed napisaniem par — " +
      "więc `good` i `none` nie mają gdzie się narysować. Wyjściem dla (1) jest drugi argument " +
      "`getComputedStyle` w przelocie, czyli przebudowa przyrządu; dla (2) druga organizacja w fiksturze.",
    greenWrong:
      "Wykrzyknik może zniknąć z „At risk”, a zielony kwadrat i kreskowana obwódka mogą nigdy nie powstać — cztery kształty zredukowałyby się wtedy do dwóch i żaden przelot by tego nie zobaczył.",
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
  // 57 → 58 PRZY ODBIORZE LOTU 5, 2026-08-07. Przyrost jest ZAOSTRZENIEM,
  // nie nową pozycją: para na pozycji 2 Lotu 5 nosiła tytuł mówiący o pasie
  // daty i asertowała wyłącznie `display: grid`, więc rozpadła się na L5-02a
  // (siatka) i L5-02b (data ma własny element). Pozycja w briefie dalej jedna,
  // więc `lots.5.positionsWithPairs` się NIE zmienia — rośnie tylko `pairs`
  // tutaj i `lots.5.pairs` niżej, i muszą rosnąć razem, bo `auditRoutedMap`
  // liczy jedno i drugie osobno.
  //
  // 58 → 60 W TYM SAMYM ODBIORZE, TĄ SAMĄ DROGĄ I Z TEGO SAMEGO POWODU. Pozycje
  // 1 i 9 miały po JEDNEJ parze, i obie czytały `boxShadow: none` — zdanie
  // prawdziwe także o wierszu, z którego skasowano całą regułę zaznaczenia.
  // Bramka pilnowała nieobecności STAREJ WADY i nie dotykała dostawy. L5-01b
  // i L5-09b czytają wypełnienie `--accent-quieter` na tych samych podmiotach.
  // Znowu tylko `pairs` i `lots.5.pairs`; `positionsWithPairs` bez zmian.
  //
  // 60 → 62 PRZY ODBIORZE LOTU 6, 2026-08-07, TĄ SAMĄ DROGĄ I Z TEGO SAMEGO
  // POWODU, CO OBA POPRZEDNIE PRZYROSTY. L6-02 i L6-03 czytały NIEOBECNOŚĆ
  // starej wady („nie ma drugiego nawigatora", „etykieta nie zawija") — zdania
  // prawdziwe także o ekranie, na którym nikt nie mówi, gdzie czytelnik jest,
  // i o etykiecie wylewającej się z toru ikony. L6-02b czyta wypełnienie
  // `--nav-active-bg` na oznaczonej pozycji kolumny trybu, L6-03b liczy TORY
  // siatki wpisu. Pozycje briefu się nie zmieniły, więc rośnie tylko `pairs`
  // tutaj i `lots.6.pairs` niżej — `positionsWithPairs` zostaje 4.
  //
  // 62 → 63 PRZY LOCIE C1 FAZY C, 2026-08-10, i JEST TO NOWA POZYCJA, nie
  // rozpad istniejącej — pierwsza w tej mapie spoza briefu Fazy 3. Cel
  // nadrzędny otwartego rekordu projektu nie był mierzony przez nic: rejestr
  // Fazy 4 zgłosił go dwa razy (ekran rekordu, komentarze na projekcie),
  // a mapa powłoki go nie dosięga, bo podmiot rysuje się dopiero za nawigacją.
  //
  // 63 → 65 PRZY LOCIE C5 FAZY C, 2026-08-11, i znowu jest to NOWA POZYCJA,
  // nie rozpad istniejącej. Kontrolki wyboru nie mierzyło w tej fali NIC:
  // spis B1 czyta ich TŁO i deklaruje wprost, że natywna strzałka do niego
  // nie należy (`scripts/control-paint.mjs:117-118`), a spis B2 szuka
  // w paśmie PRZYCISKU o klasie akcji, więc goły `<select>` stojący w tym
  // samym paśmie jest dla niego niewidoczny. Dwie pary, bo jedno zdanie
  // prototypu („kontrolka stoi jak przycisk obok niej") schodzi tu z dwóch
  // różnych miejsc kaskady — powód stoi przy wpisach.
  //
  // 65 → 69 PRZY NAPRAWIE PO PRZEGLĄDZIE LOTU C5, 2026-08-11, i to NIE JEST ani
  // nowa pozycja, ani rozpad istniejącej: to POŁOWA LOTU, która pojechała bez
  // dowodu. Lot ruszył szerokość kontrolki wyboru w TRZECH miejscach
  // (`.actions select`, `.settings-control select`, `.railSelect`) i nie napisał
  // na to ani jednej pary, uzasadniając to dwiema rzeczami, które są sprzeczne
  // z kodem runnera — sprostowanie stoi przy wpisach C5. Zmierzone przed
  // napisaniem par, nie po: `max-width` = „256px" na kontrolce pasma i na
  // sześciu kontrolkach Ustawień, `flex-grow` = „0" na wszystkich sześciu
  // i na `.railSelect`, `align-self` = „start" na jedynym dziecku wprost.
  // Pozycja briefu dalej JEDNA, więc `positionsWithPairs` się nie rusza —
  // rośnie tylko `pairs` tutaj i `lots.C5.pairs` niżej.
  //
  // 69 → 74 PRZY LOCIE D1 FAZY D, 2026-08-11, i jest to NOWA POZYCJA. Pasma nad
  // płótnem nie mierzyła w tej mapie ani jedna para: spis B2 czyta POŁOŻENIE
  // AKCJI w paśmie i nie ma zdania o tym, czy pasmo w ogóle jest pasmem —
  // jego własna dolna krawędź, wysokość i szerokość były poza każdym pomiarem
  // tej fali. Pięć par, bo jedno zdanie rejestru („pasma zamknięte włoskową
  // kreską na całą szerokość") składa się z trzech deklaracji na dwóch
  // elementach plus krawędzi tablicy pod nimi, a każda psuje się osobno.
  //
  // 74 → 75 W TYM SAMYM LOCIE, I JEST TO DRUGA POZYCJA, nie rozpad pierwszej.
  // Lot D1 domyka też drugą połowę wpisu #10 rejestru — WYSOKOŚĆ akcji głównej
  // (33 CSS wobec prototypowych 28) — a tego nie mierzyła ani ta mapa, ani spis
  // B2, który czyta POŁOŻENIE akcji i nie ma zdania o jej rozmiarze.
  //
  // 75 → 76 PRZY NAPRAWIE PO PRZEGLĄDZIE LOTU D1, 2026-08-11, I JEST TO TRZECIA
  // POZYCJA. Wpis #62 rejestru — akcja pasma Spotkań — był w tym locie mierzony
  // WYŁĄCZNIE spisem B2, a spis czyta POŁOŻENIE akcji i nie ma zdania o tym,
  // z czego ta akcja jest zrobiona. Lot przeniósł z prototypu etykietę
  // i modyfikator, a pominął `icon`, przez co poniżej 50 rem okna — gdzie
  // arkusz gasi etykietę i zostawia glif — pasmo Spotkań rysowało PUSTE
  // pudełko. Zielone były wtedy wszystkie przyrządy naraz. Ta para jest
  // pierwszym przystankiem tej mapy na Spotkaniach; marker przybycia dopisany
  // razem z nią (`ROUTED_ARRIVAL.meetings`).
  //
  // 76 ZOSTAJE 76 PRZY NAPRAWIE PO PRZEGLĄDZIE LOTU D2, 2026-08-11, I TA LICZBA
  // JEST WYNIKIEM POMIARU, NIE REZYGNACJI. Naprawa dopisała siedemdziesiątą
  // siódmą parę — bliźniak znacznika pomocy na Kalendarzu — razem z markerem
  // przybycia dla tego ekranu, i OBA PRZELOTY (dark, light) wróciły
  // `NOT_MEASURED`: klient scenariuszowy odmawia kalendarza
  // (`client/scenario-client.ts:81-94`), a przycisk rysuje się tylko nad
  // tygodniem ze spotkaniem. Para i przystanek zostały ZDJĘTE zamiast wyciszone
  // polem `blind` — przystanek bez ani jednego werdyktu to czas przelotu
  // udający pokrycie. Bliźniak jest asertowany tam, gdzie fikstura go dosięga
  // (`desktop-ui/test/calendar.interaction.test.tsx`), a brak pomiaru
  // PIKSELOWEGO stoi wypisany niżej, w `notCovered`.
  //
  // 76 → 95 PRZY LOCIE D3 FAZY D, 2026-08-11, I SĄ TO TRZY NOWE POZYCJE. Kolumny
  // list Biblioteki i czytelnia notatki nie były w tej mapie mierzone przez nic
  // poza farbą wiersza (L5-01a/b) i deklaracją siatki (L5-02a): ani GŁOWA
  // kolumny, ani jej wysokość, ani kształt wiersza, ani cokolwiek w czytelni
  // powyżej treści. Dziewiętnaście par, bo rejestr niesie tu jedenaście wpisów
  // składających się na trzy zdania („głowa kolumny jest jednym paskiem",
  // „wiersz jest wierszem, nie kartą", „czytelnia jest jednym planem"),
  // a każde z nich psuje się na kilku niezależnych deklaracjach — cień bez
  // promienia, promień bez kreski, kreska bez pasa daty.
  //
  // 95 → 96 PRZY NAPRAWIE PO PRZEGLĄDZIE LOTU D3, 2026-08-11, I NIE JEST TO ANI
  // nowa pozycja, ani rozpad istniejącej: to POŁOWA WPISU #41, która pojechała
  // bez dowodu. Lot dociągnął wiersz Źródeł do krawędzi kolumny
  // (`var(--space-3)` → `var(--space-4)`) i zostawił głowę grupy nad nim na
  // starej liczbie, przez co lewe krawędzie tekstu rozjechały się z 2 px na
  // 6 px. Prototyp daje obu TĘ SAMĄ wyściółkę poziomą jedną parą reguł
  // (`v3/screens/knowledge.css:198` i `:139`), a w tej mapie nie czytała jej
  // ŻADNA para: D3-05a czyta promień wiersza, D3-05b kolor jego kreski,
  // a D3-02 mierzy bliźniaka z Notatek na INNYM przystanku. Pozycja briefu
  // dalej ta sama, więc `positionsWithPairs` się nie rusza — rośnie tylko
  // `pairs` tutaj i `lots.D3.pairs` niżej.
  //
  // 96 → 104 PRZY LOCIE D4 FAZY D, 2026-08-11, I SĄ TO SIEDEM NOWYCH POZYCJI —
  // ekran rekordu projektu i zakładka Komentarzy. Żadna z nich nie była dotąd
  // mierzona przez tę mapę: dwie pary rekordu (D4-01a/b) czytają ZAWIERANIE
  // i rozciągnięcie pasa, bo wpis #47 jest o tym, czyim dzieckiem jest karta
  // dokumentu, a nie o jej kolorze; cztery pary Komentarzy jadą tu przez krok
  // `recordTab`, który mapa umiała robić od Fazy 3 i którego żaden lot Fazy D
  // dotąd nie użył.
  //
  // 104 → 105 PO NAPRAWIE PO PRZEGLĄDZIE LOTU D4, i NIE JEST TO nowa pozycja:
  // `lots.D4.pairs` urosło wtedy 8 → 9 (trzecia połowa wpisu #58, para
  // `D4-06c`), a TA suma nie urosła razem z nim. Drzewo zastane przez lot D5
  // było przez to CZERWONE — `auditRoutedMap` liczy jedno i drugie osobno
  // i rzucał `ROUTED_COUNT_DRIFT` („holds 105 routed pairs, declared 104")
  // zanim zdążył ocenić choćby jedną parę. Liczba pozycji się nie zmienia,
  // bo pozycja 6 lotu D4 była już liczona jako pokryta.
  //
  // 105 → 116 PRZY LOCIE D5 FAZY D, 2026-08-11, I SĄ TO PIĘĆ NOWYCH POZYCJI —
  // tryb Ustawień. Cztery z nich nie były mierzone przez tę mapę nigdy: sama
  // powłoka w trybie (#67, trzy pary — dwie liczące, CZEGO NIE MA, i jedna
  // czytająca pasmo, bez którego pusta kolumna przeszłaby obie), spis sekcji
  // (#69), plaster listy (#68) i karta sekcji (#70). Piąta (#71) miała już parę
  // na SZEROKOŚCI od lotu C5 i dostaje drugą na wysokości.
  //
  // 116 → 118 PRZY NAPRAWIE PO PRZEGLĄDZIE LOTU D5, 2026-08-11, i NIE JEST TO
  // ani nowa pozycja, ani rozpad istniejącej: dwie osie tych samych pozycji,
  // na których lot pojechał bez dowodu. Pozycja 1 miała trzy pary i żadna nie
  // czytała, DOKĄD pasmo sięga — a sięgało o rynnę za daleko i było ścinane
  // przez przewijalnego przodka (D5-01d, odczyt świadomy przycięcia, bo pudełko
  // układu jest na to ślepe). Pozycja 4 miała dwie pary i obie brały za podmiot
  // `.settings-category > section`, więc dziecko kategorii, które `section` nie
  // jest, leżało poza pomiarem — a takie było (D5-04c, licząca je nad
  // wszystkimi sześcioma kategoriami). `positionsWithPairs` się nie rusza.
  //
  // 118 → 129 PRZY LOCIE D6 FAZY D, 2026-08-11, I SĄ TO CZTERY NOWE POZYCJE —
  // ogon CRM. Organizacji i Ludzi nie mierzyła w tej mapie ANI JEDNA para:
  // oba ekrany dojechały tu razem z markerami przybycia dopisanymi przez ten
  // lot. Jedenaście par na cztery pozycje, i rozdrobnienie ma dwie przyczyny,
  // obie policzalne. Po pierwsze, każdy z tych kształtów mieszka w DWÓCH
  // arkuszach modułowych (`organizations.module.css` i `people.module.css`),
  // bo rejestr zgłosił je jako pary bliźniaków (#20/#30, #19 dwa razy,
  // #21/#29) — jedna para byłaby zielona nad połową poprawki. Po drugie,
  // pozycja 1 („znacznik jest rysowany”) rozpada się na WYMIAR pudełka
  // i na KSZTAŁT stanu: para nad samym wymiarem stałaby zielona nad czterema
  // jednakowymi kwadratami w czterech odcieniach, czyli nad wersją, której
  // nie da się przeczytać bez koloru — a to jest dokładnie ta wada, którą
  // wpis nazywa.
  //
  // 129 → 131 PO PRZEGLĄDZIE LOTU D6, 2026-08-12, i nie jest to nowa pozycja:
  // `lots.D6.pairs` rośnie 11 → 13 o dwie pary czytające WYMIAR glifu segmentu
  // (D6-04c/D6-04d) — powód stoi tam. Ta suma rośnie razem z nim, bo
  // `auditRoutedMap` liczy jedno i drugie OSOBNO: przelot po samym dopisaniu
  // par rzucił OBA drifty naraz (`holds 131 routed pairs, declared 129`
  // i `lot D6: 13 carried, 11 declared`) i nie ocenił ani jednej pary.
  //
  // 131 → 143 PRZY LOCIE D7 FAZY D, 2026-08-12, I SĄ TO TRZY NOWE POZYCJE nad
  // ekranem, który ta mapa mierzyła dotąd JEDNĄ parą (D1-05, glif akcji
  // pasma). Rejestr niesie tu trzy wpisy — #63, #64, #65 — i mówi wprost, że
  // każdy z nich osobno zostawia ekran GORSZYM niż był, bo wszystkie trzy są
  // stronami jednego pudełka: farby karty stojącej na SEKCJI zamiast na
  // LIŚCIE w środku. Dwanaście par, bo każde z tych trzech zdań psuje się na
  // kilku niezależnych deklaracjach — jedna kolumna z odwróconą kolejnością,
  // karta przemalowana przy sekcji dalej podniesionej, nagłówek wyprowadzony
  // z pudełka, ale wciąż noszący jego kreskę.
  //
  // 143 → 148 PRZY ODBIORZE LOTU D7, 2026-08-12, I NIE JEST TO NOWA POZYCJA.
  // Netto pięć, brutto sześć dopisanych i jedna zdjęta. Dopisane: D7-01d
  // (liczba ścieżek WIERSZA — trzy pary pozycji 1 mierzyły, gdzie sekcja stoi,
  // i wszystkie trzy przechodziły zielone nad wierszem wciąż noszącym geometrię
  // szyny), D7-01e (`flexGrow` kreski łańcucha — to jest ta deklaracja, przez
  // którą przeniesienie wiersza zostawiło ekran GORSZYM niż był, i sama liczba
  // ścieżek jej nie widzi), D7-02e i D7-02f (karta nadchodzących i jej wpuszczony wiersz —
  // wypisane wcześniej jako niedosiężne z powodem, który był nieprawdą),
  // D7-03f i D7-03g (nagłówek nadchodzących i jego kłódka — pozycja 3 miała
  // PIĘĆ par i wszystkie pięć czytały sekcję ODBYTYCH albo obie naraz, więc
  // bliźniak dawał się z ekranu usunąć przy zielonym przelocie). Zdjęta:
  // D7-02c, bo jej podmiot i podmiot D7-02e to dwa ramiona jednego wyrażenia
  // i fikstura rysuje jedno z nich — powód przy wpisie i w `notCovered`.
  //
  // 148 → 150 PRZY LOCIE D9 FAZY D, 2026-08-12, i JEST TO NOWA POZYCJA, nie
  // rozpad istniejącej: druga połowa wpisu #29 — glif wiodący plakietki
  // uczestnictwa — była do dziś oddana ZERO RAZY, a jej dwie poprzednie odmowy
  // (loty D6 i D2) opierały się na sufitach przepełnienia, nie na parze. Dwie
  // pary z tego samego powodu, dla którego istnieją D6-04c/d: para licząca jest
  // zielona przy każdym rozmiarze znaku, a ten znak ma w prototypie osobny,
  // trzeci stopień wielkości.
  //
  // 150 → 151 W TYM SAMYM LOCIE, PO WŁASNYM BREAK-TEŚCIE: para obecności
  // rozpadła się na dwie (deale i spotkania osobno), bo jedna podłoga nad
  // obiema plakietkami była spełnialna przez którąkolwiek z nich samą.
  // `positionsWithPairs` się nie rusza — pozycja dalej JEDNA.
  //
  // 151 → 155 PRZY LOCIE D10 FAZY D, 2026-08-12, i NIE jest to nowa pozycja:
  // to ostatnie 12 px wpisu #22, którego lot D1 nie oddał i powiedział o tym
  // wprost. Cztery pary, bo zdanie wpisu składa się z dwóch niezależnych
  // deklaracji na dwóch ekranach: kto przewija (`overflow` na nośniku i na
  // pudełku pod pasmami) i czyimi dziećmi są pasma (liczność bezpośrednich
  // dzieci nośnika). Para nad samą geometrią byłaby zielona nad ekranem,
  // któremu ktoś tylko zdjął odstęp, zostawiając pasma jadące z treścią.
  //
  // 155 → 156 PRZY LOCIE D11 FAZY D, 2026-08-12, i JEST TO NOWA POZYCJA:
  // wpis #51 rejestru (z duplikatem #55) — kontrolka formularza stojąca
  // w paśmie akcji rekordu. JEDNA para, bo trzy pozostałe pary tej pozycji
  // (C5-01a/b/c) już istniały i zostały PRZEPIĘTE na nowy podmiot zamiast
  // dopisane: zdanie, którego broniły, przeniosło się z `<select>` na
  // wyzwalacz dymka i na jego panel. Nowa jest wyłącznie ta, która mówi, czego
  // w paśmie stać NIE MA — i której przed tym lotem nie było czym napisać, bo
  // kontrolka wtedy tam stała.
  pairs: 156,
  // 9 → 11: `TopicHelp` (trzecia forma tego samego wyzwalacza) i piksel
  // bliźniaka na Kalendarzu. Powody przy wpisach.
  //
  // 11 → 12 PRZY LOCIE D4: druga połowa wpisu #61 (uchwyt zmiany rozmiaru
  // w polu EDYCJI komentarza). Oddana w kodzie, niemierzalna przez tę mapę —
  // pole powstaje dopiero po kliknięciu „Edit", a `route` nie ma takiego kroku.
  //
  // 12 → 13 PRZY LOCIE D6: dwa z czterech kształtów znacznika sygnału.
  // Wykrzyknik „At risk" mieszka w `::after`, którego `read` tej mapy nie
  // widzi, a stanów `good` i `none` fikstura nie rysuje. Oddane w arkuszu,
  // niemierzalne tym przelotem — powody przy wpisie.
  //
  // 13 → 15 PRZY LOCIE D7: dwie własności karty nadchodzących, których fikstura
  // bramki NIE RYSUJE, bo rysowanie ich wymaga stanu `available`, a ten
  // wygasza gałąź „Grant access". Powody i warunki wyjścia stoją przy wpisach.
  //
  // 15 → 14 PRZY ODBIORZE LOTU D7, 2026-08-12, I OBA TAMTE POWODY BYŁY
  // NIEPRAWDĄ. Wiersze nadchodzących nie wymagają `available` (wystarczy
  // `canRead`), a gałąź „Grant access" wymaga `platform === "macos"`, którego
  // tamta fikstura nie deklarowała — rysowała „Check again", więc koszt,
  // którym uzasadniono odmowę pomiaru, nigdy nie był płacony. Oba wpisy są
  // zamknięte parami (D7-02e, D7-02f). W ich miejsce wchodzi JEDEN wpis —
  // przezroczystość stanu PUSTEGO — i on ma mechanizm, którego tamte nie
  // miały: to jest drugie ramię tego samego wyrażenia, więc jedna fikstura
  // rysuje dokładnie jedno z dwojga.
  notCovered: 14,
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
  //
  // 2 → 1 PRZY ODBIORZE LOTU 5, 2026-08-07, TĄ SAMĄ DROGĄ. L5-03a miała warunek
  // wyjścia dwuczęściowy i adresowany wprost do tego lotu; lot dowiózł obie
  // części (pusty folder-liść w fiksturze, krok `treeKey` w `walkRouteInPage`
  // niesiony przez `routeKey`) i para wróciła z POMIAREM. Pole `blind` zdjęte
  // razem z warunkiem.
  //
  // ZOSTAJE L5-03b, I ZOSTAJE ŚWIADOMIE. Jej warunek wyjścia NIE JEST tą samą
  // robotą: powitanie Źródeł rysuje się wyłącznie przy zerowej liczbie źródeł
  // w całej przestrzeni, a odczyt nie ma ani filtra, ani odznaczenia — więc nie
  // istnieje krok trasy, który by tam doszedł. Wyjściem jest albo nowa
  // afordancja zamykająca czytelnię, albo DRUGA fikstura pod osobnym adresem
  // harnessu; jedno i drugie to decyzja produktowa albo przebudowa przelotu, a
  // nie pozycja ekranowa. Ta sama pozycja jest jednak ZMIERZONA po stronie
  // arkusza przez `scripts/heading-typography.mjs`, więc „bez dowodu" dotyczy
  // dziś wyłącznie pikseli, nie deklaracji.
  blind: 1,
  lots: {
    C1: {
      // Ta sama arytmetyka co w mapie powłoki, widziana z drugiej strony: lot
      // ma DWIE pozycje, ta mapa dowozi drugą, a pierwsza stoi jako jawnie
      // nieobjęta TĄ mapą — jest w mapie powłoki, bo tam da się ją zmierzyć.
      positionsInBrief: 2,
      pairs: 1,
      positionsWithPairs: 1, // 2
      positionsWithoutPairs: [1],
    },
    C5: {
      // Lot C5 ma w swoim zadaniu JEDNĄ pozycję — kontrolkę wyboru z systemową
      // strzałką w paśmie nagłówka — i ta jedna pozycja jest tu objęta parą
      // (sześcioma). Trafień lot naliczył trzy, ale trafienie to MIEJSCE, nie
      // pozycja: wszystkie trzy niosą to samo zdanie prototypu, a rachunek
      // pozycji jest rachunkiem ZDAŃ.
      //
      // 2 → 6 PRZY NAPRAWIE PO PRZEGLĄDZIE, 2026-08-11: dwie pary opisywały
      // WYŁĄCZNIE stopień pisma i promień w jednym z trzech miejsc, a połowa
      // lotu — szerokość we wszystkich trzech — nie miała dowodu. Powód
      // i pomiary stoją przy wpisach C5-01c, C5-02a/b i C5-03.
      positionsInBrief: 1,
      pairs: 6,
      positionsWithPairs: 1, // 1
      positionsWithoutPairs: [],
    },
    D3: {
      // Lot D3 niesie JEDENAŚCIE wpisów rejestru, a rejestr sam grupuje je
      // w trzy rodziny, i to one są tu pozycjami: głowa kolumny listy (#34,
      // #42), wiersz listy i jego siatka (#35, #41, #45), czytelnia (#36, #37,
      // #38, #43, #44, #46). Wszystkie trzy są wyrażalne selektorem nad
      // przystankami, do których ta mapa dojeżdża, więc `positionsWithoutPairs`
      // jest puste — co NIE znaczy, że lot oddał wszystko: awatar inicjałowy
      // z wpisu #36 nie ma pola w projekcji i stoi w `notDelivered` raportu,
      // a nie tutaj, bo ta lista mierzy POKRYCIE pozycji, nie ich dostawę.
      //
      // 19 → 20 PRZY NAPRAWIE PO PRZEGLĄDZIE: D3-04c, wyściółka pozioma głowy
      // grupy Źródeł. Powód i pomiar stoją przy `pairs` na górze tej mapy;
      // pozycja jest ta sama (wiersz listy i jego siatka), więc rośnie tylko ta
      // liczba.
      positionsInBrief: 3,
      pairs: 20,
      positionsWithPairs: 3, // 1, 2, 3
      positionsWithoutPairs: [],
    },
    D5: {
      // Lot D5 niesie PIĘĆ wpisów rejestru (#67-#71) i każdy z nich jest osobną
      // pozycją — żaden nie jest duplikatem innego. Wszystkie pięć mają parę.
      //
      // JEDENAŚCIE PAR NA PIĘĆ POZYCJI, i rozdrobnienie ma wszędzie ten sam
      // powód: para czytająca NIEOBECNOŚĆ starej wady jest zdaniem prawdziwym
      // także o ekranie, na którym nikt nie dowiózł nowego kształtu. Pozycja 1
      // liczy zniknięcie karty przestrzeni i wyszukiwarki OSOBNO (dwa warunki
      // w JSX-ie, jedna para byłaby zielona nad połową poprawki), a trzecia
      // czyta pasmo, którego pusta kolumna by nie miała. Pozycja 3 czyta plaster
      // listy, promień wiersza i kreskę rozdzielającą — tę ostatnią na LIŚCIE
      // ETAPÓW, bo fikstura harnessu daje każdej `.status-list` dokładnie jeden
      // wiersz, czyli pas, na którym kreska nigdy się nie rysuje. Pozycja 4
      // czyta obrys sekcji i pasmo jej nagłówka, bo karta bez pasma przechodzi
      // pierwszą z nich.
      //
      // 11 → 13 PRZY NAPRAWIE PO PRZEGLĄDZIE: po jednej parze na pozycje 1 i 4,
      // obie na osiach, których lot nie zmierzył — zasięg pasma (D5-01d)
      // i komplet kart kategorii (D5-04c). Powody stoją przy wpisach.
      positionsInBrief: 5,
      pairs: 13,
      positionsWithPairs: 5, // 1, 2, 3, 4, 5
      positionsWithoutPairs: [],
    },
    D6: {
      // Lot D6 niesie SZEŚĆ wpisów rejestru (#19, #20, #21, #26, #29, #30),
      // a POZYCJI — czyli zdań prototypu — jest cztery, i rachunek jest tu
      // rachunkiem zdań, nie miejsc:
      //   1. znacznik sygnału jest rysowany, nie pisany (#20 + #30 — jedna
      //      wada zgłoszona dwa razy, bo mieszka w dwóch arkuszach);
      //   2. „Prospect” należy do akcentu, nie do informacji (#19 — jedna
      //      plakietka na dwóch ekranach, i to właśnie z tego rejestr wywnioskował,
      //      że rozjazd jest REGUŁĄ);
      //   3. segmenty układu otwierają się glifem (druga połowa #21 na
      //      Organizacjach i połowa #29 o segmentach na Ludziach);
      //   4. glif wiodący przy nazwie organizacji i w plakietkach uczestnictwa
      //      (druga połowa #26 i druga połowa #29).
      // Pozycje 3 i 4 są POŁÓWKAMI wpisów, których farbę zamknęła Faza C
      // (`5d4f2c2`, reset przycisku) — ten lot dowozi wyłącznie brakującą
      // połowę i nie udaje, że rusza tamtą.
      //
      // WSZYSTKIE CZTERY MAJĄ PARĘ, ale DWIE Z NICH MAJĄ JĄ NAD POŁOWĄ, i te
      // dwie połowy są różnymi rzeczami:
      //   - pozycja 1 dostała parę nad DWOMA z czterech kształtów, i to jest
      //     ograniczenie PRZYRZĄDU nad oddanym kodem (pseudoelement + zasięg
      //     fikstury) — wypisane w `VISUAL_LANGUAGE_ROUTED_NOT_COVERED`;
      //   - pozycja 4 dostała parę nad nagłówkiem grupy, a NIE nad plakietką
      //     uczestnictwa, bo tej połowy LOT NIE ODDAŁ: glif wiodący pchał
      //     `span._parts` 55 px poza tor przy tekście 200% wobec sufitu 25 px
      //     z `descendant-overflow.mjs`. To jest brak DOSTAWY, nie brak
      //     pomiaru, więc stoi w `notDelivered` raportu, a nie na liście
      //     nieobjętych.
      //
      // 11 → 13 PO PRZEGLĄDZIE LOTU D6, 2026-08-12, I NIE JEST TO NOWA POZYCJA:
      // to druga WŁASNOŚĆ pozycji 3, na której lot pojechał bez dowodu. D6-04a/b
      // liczą ELEMENTY (`property: null`, `count`, podłoga 2), więc mówią
      // wyłącznie o OBECNOŚCI znaku — a oddany znak miał 0,6875 rem
      // i `opacity: 0.75`, czyli komplet przepisany z `v3/screens/crm.css:162`
      // (plakietka uczestnictwa, której lot świadomie NIE oddał) zamiast
      // z `v3/app.css:348` (0,8125 rem, bez wygaszenia), rządzącej tym znakiem.
      // Bramka stała zielona nad niewłaściwą liczbą. D6-04c i D6-04d czytają
      // WYMIAR — dwie, nie jedna, bo reguła mieszka w dwóch arkuszach
      // modułowych, tak samo jak w pozycji 1. `positionsWithPairs` się nie
      // rusza.
      positionsInBrief: 4,
      pairs: 13,
      positionsWithPairs: 4, // 1, 2, 3, 4
      positionsWithoutPairs: [],
    },
    D7: {
      // Lot D7 niesie TRZY wpisy rejestru (#63, #64, #65) i każdy z nich jest
      // osobną pozycją — a rejestr sam pisze, że oddanie któregokolwiek Z NICH
      // OSOBNO zostawia ekran gorszym niż był, więc lot jest jeden i pozycje są
      // trzy. Wszystkie trzy mają parę:
      //   1. nadchodzące stoją PIERWSZE, na pełną szerokość, a szyny nie ma
      //      (#63 — pięć par: liczba ścieżek ciała, kolejność, nieobecność
      //      szyny, liczba ścieżek samego WIERSZA i `flexGrow` kreski łańcucha
      //      prowenancji w jego środku);
      //   2. drabina jasności przestaje być odwrócona (#64 — pięć par, bo
      //      `--surface-sunken` siedział na kanwie w TRZECH miejscach, farba
      //      karty musiała ZEJŚĆ z sekcji i WEJŚĆ na obie listy, a wpuszczenie
      //      wiersza W KARCIE jest osobnym szczeblem drabiny);
      //   3. nagłówek stoi na kanwie i ma prawy koniec (#65 — siedem par:
      //      położenie w drzewie, nieobecność w karcie, obecność wyjścia, brak
      //      kreski działowej, stopień pisma, oraz nagłówek i kłódka DRUGIEJ
      //      sekcji, których nie mierzyło nic).
      //
      // 12 → 17 PRZY ODBIORZE, 2026-08-12: sześć par dopisanych, jedna zdjęta.
      // Arytmetyka i powód każdej stoją przy sumie `pairs` tej mapy.
      //
      // JEDNA WŁASNOŚĆ POZYCJI 2 NIE MA PARY I STOI WYPISANA: przezroczystość
      // stanu PUSTEGO nadchodzących. Nie jest to dług ani odmowa z nastroju —
      // stan pusty i karta z wierszami to dwa ramiona jednego wyrażenia, więc
      // jedna fikstura rysuje jedno z nich, a bramka ma jedną fiksturę.
      // Wybrane jest ramię, które niesie cztery podmioty zamiast jednego;
      // mechanizm i osiągalny warunek wyjścia stoją przy wpisie
      // w `VISUAL_LANGUAGE_ROUTED_NOT_COVERED`.
      positionsInBrief: 3,
      pairs: 17,
      positionsWithPairs: 3, // 1, 2, 3
      positionsWithoutPairs: [],
    },
    D9: {
      // JEDNA POZYCJA, i jest nią DRUGA POŁOWA wpisu #29. Pierwsza połowa —
      // glify w segmentach paska widoku — została oddana i zmierzona przez lot
      // D6 (D6-04b, D6-04d), więc nie liczy się tutaj: rachunek pozycji jest
      // rachunkiem ZDAŃ rejestru, a to zdanie mówi o plakietce uczestnictwa.
      positionsInBrief: 1,
      pairs: 3,
      positionsWithPairs: 1, // 1
      positionsWithoutPairs: [],
    },
    D10: {
      // JEDNA POZYCJA — wpis #22, i to jego OSTATNIE 12 px. Wpis został
      // zamknięty przez lot D1 na własnym roszczeniu (chrom 139 → 92 px), a te
      // 12 px zostały tam wypisane jako świadomie nieoddane: prototyp ma 80 px,
      // my mieliśmy 92. Rachunek pozycji jest rachunkiem ZDAŃ rejestru, więc
      // wpis liczy się raz, mimo dwóch lotów.
      positionsInBrief: 1,
      pairs: 4,
      positionsWithPairs: 1, // 1
      positionsWithoutPairs: [],
    },
    D11: {
      // JEDNA POZYCJA — wpis #51 rejestru wraz z jawnym duplikatem #55: żadna
      // kontrolka formularza nie stoi w paśmie akcji rekordu. Ta sama pozycja
      // stoi w rachunku lotu D4 jako NIEPOKRYTA i tam ZOSTAJE, bo tamten
      // rachunek jest rachunkiem tego, co oddał LOT D4 — a D4 tej pozycji nie
      // oddał i powiedział o tym wprost. Ten sam podwójny zapis niesie już para
      // D1/D10 nad wpisem #22.
      //
      // JEDNA PARA, choć pozycję opisują CZTERY: trzy pozostałe (C5-01a/b/c)
      // istniały przed tym lotem nad `<select>`, który odszedł, i zostały
      // PRZEPIĘTE na wyzwalacz dymka i jego panel — więc dalej liczą się
      // w locie C5, gdzie je napisano. Nowa jest wyłącznie ta, która mówi,
      // czego w paśmie stać NIE MA.
      positionsInBrief: 1,
      pairs: 1,
      positionsWithPairs: 1, // 1
      positionsWithoutPairs: [],
    },
    D4: {
      // Lot D4 niesie DZIEWIĘĆ wpisów rejestru, z których #55 jest jawnym
      // duplikatem #51 (ten sam `<select>`, ten sam wspólny pas nagłówka obu
      // zakładek), więc POZYCJI jest osiem, nie dziewięć. Siedem z nich ma
      // parę: dokument w kolumnie tekstu wraz z krawędzią pasa (#47), plakietki
      // metadanych (#52), próbka legendy (#53), plakietka roli agenta (#56),
      // znacznik autora-człowieka (#59), kompozytor (#58) i uchwyt zmiany
      // rozmiaru w edycji komentarza (#61).
      //
      // ÓSMA POZYCJA — #51/#55 — NIE MA PARY W TYM LOCIE, BO LOT D4 JEJ NIE
      // ODDAŁ, i ta linijka zostaje jako fakt o locie D4. Wpis został oddany
      // 2026-08-12 przez LOT D11 i tam ma swoją parę (D11-01) oraz trzy
      // przepięte (C5-01a/b/c); ten sam podwójny zapis niesie już wpis #22
      // między lotami D1 i D10.
      //
      // POWÓD, KTÓRY TU DAWNIEJ STAŁ, BYŁ PRAWDĄ O INNYM KSZTAŁCIE. Stało tu:
      // „statyczny import `InlinePopover` do gorącego `Wave2Surfaces.tsx`
      // kosztuje +1 158 B gzip ścieżki gorącej". Liczba była poprawna i dotyczy
      // ARMU STATYCZNEGO; lot D11 poszedł arm LENIWYM — `lazy()` na poziomie
      // modułu, komponent biorący wyłącznie propsy — i ścieżka gorąca nie
      // drgnęła (pomiary w raporcie lotu D11). Kosztem nie był popover, tylko
      // sposób jego wpięcia.
      //
      // SIÓDMA POZYCJA (#61) MA PARĘ TYLKO W POŁOWIE, i ta połowa jest wypisana
      // w `VISUAL_LANGUAGE_ROUTED_NOT_COVERED`: uchwyt zmiany rozmiaru zniknął
      // z OBU pól, ale mierzalne jest tylko pole kompozytora (D4-06b). Pole
      // EDYCJI istniejącego komentarza rysuje się dopiero po kliknięciu „Edit",
      // a ta mapa nie ma kroku, który by je otworzył — para nad nim wróciła
      // NOT_MEASURED („matched NO element"), czyli jako AWARIA PRZYRZĄDU, i
      // została zdjęta zamiast zostawiona jako wieczna czerwień.
      //
      // SZÓSTA POZYCJA (#58) MA TRZY POŁOWY I DO NAPRAWY PO PRZEGLĄDZIE MIAŁA
      // PARĘ NAD JEDNĄ. Pozycja liczyła się jako pokryta, bo `D4-06a` mierzy
      // wysyłkę wewnątrz ramki — a nagłówek wiersza rejestru brzmi „kompozytor:
      // BRAK AWATARA" i tego nie mierzyło nic. Trzecia para (`D4-06c`) czyta
      // znacznik autora w kompozytorze; liczba par rośnie 8 → 9, liczba
      // POKRYTYCH POZYCJI się nie zmienia, bo pozycja 6 była już liczona.
      positionsInBrief: 8,
      pairs: 9,
      positionsWithPairs: 7, // 1, 2, 3, 4, 5, 6, 7
      positionsWithoutPairs: [8],
    },
    D1: {
      // Lot D1 niesie DZIEWIĘĆ wpisów rejestru, ale tylko JEDNO zdanie
      // wyrażalne selektorem nad ekranem, do którego ta mapa umie dojechać:
      // pasmo na całą szerokość z własną kreską (#9, #11, #16, #22 — cztery
      // wpisy, jedna robota, jedna pozycja). Reszta lotu to albo pomiar
      // spisu B2 (#62 — Spotkania, mierzone TAMTĄD, nie parą), albo pozycje
      // oddane jako niezrobione i wypisane w raporcie lotu. Drugą pozycją jest
      // wysokość akcji głównej (#10), wyrażalna selektorem i dlatego z parą.
      //
      // TRZECIA POZYCJA PRZY NAPRAWIE PO PRZEGLĄDZIE: #62 (akcja pasma Spotkań)
      // stał tu jako „mierzony TAMTĄD, nie parą" i to zdanie było prawdziwe
      // wyłącznie o POŁOŻENIU akcji. Brakujący glif — bez którego zwijanie
      // akcji w wąskim oknie daje puste pudełko — nie był mierzony ani przez
      // spis B2, ani przez tę mapę, ani przez bramkę układu. Pozycja przestaje
      // być wyłączna dla spisu i dostaje własną parę (D1-05).
      positionsInBrief: 3,
      pairs: 7,
      positionsWithPairs: 3, // 1, 2, 3
      positionsWithoutPairs: [],
    },
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
      // 11 → 12 → 14: rozpad L5-02 na L5-02a/L5-02b oraz dołożenie L5-01b
      // i L5-09b przy odbiorze — patrz noty przy `pairs` wyżej. Pozycje objęte
      // parą się nie zmieniły.
      pairs: 14,
      positionsWithPairs: 10, // 1-10
      positionsWithoutPairs: [11, 12],
    },
    6: {
      // faza-3-build-brief.md:369-378
      positionsInBrief: 8,
      // 4 → 6: rozpad L6-02 na L6-02a/L6-02b i L6-03 na L6-03a/L6-03b przy
      // odbiorze — patrz nota przy `pairs` wyżej. Pozycje objęte parą bez zmian.
      pairs: 6,
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
