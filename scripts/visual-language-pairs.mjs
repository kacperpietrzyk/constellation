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
      why: "same subject as L1-01a; the app paints it from --shell-sidebar-bg, which maps to --surface-glass (tokens.css:515)",
      app: "packages/desktop-ui/src/tokens.css:184, :515",
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
      app: "packages/desktop-ui/src/RealApp.tsx:3472, styles.css:1065-1078",
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
      app: "packages/desktop-ui/src/styles.css:1361-1365, RealApp.tsx:3589-3600",
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
      app: "packages/desktop-ui/src/styles.css:1361-1365, tokens.css:280, :769",
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
      app: "packages/desktop-ui/src/styles.css:932-943, RealApp.tsx:3279",
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
      why: "same subject as L1-04a — RealApp.tsx:3279 hardcodes the glyph",
      app: "packages/desktop-ui/src/RealApp.tsx:3279",
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
      why: "declaration: RealApp.tsx:1935 stamps aria-current='page' on the active row; styles.css has NO rule for the icon's colour, so it inherits --nav-active-text",
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
      why: "declaration-scoped to the rows that are NOT current; styles.css:4631-4635 gives kbd no opacity at all, so every row shows it",
      app: "packages/desktop-ui/src/styles.css:4631-4635, RealApp.tsx:1959-1966",
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
      app: "packages/desktop-ui/src/styles.css:1065-1078, tokens.css:665",
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
      why: "global class in styles.css:820-830; the token --grain already exists (tokens.css:511) with no consumer",
      app: "packages/desktop-ui/src/styles.css:820-830, tokens.css:511-512",
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
      why: "global class in styles.css:1877-1899; it takes --radius-xl (1rem)",
      app: "packages/desktop-ui/src/styles.css:1877-1899, tokens.css:301",
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
      app: "packages/desktop-ui/src/styles.css:1877-1899",
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
      app: "packages/desktop-ui/src/styles.css:1877-1899",
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
      app: "packages/desktop-ui/src/styles.css:1586-1623, RealApp.tsx:3339",
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
      why: "prescribed declaration — rail mode is today a pure consequence of window width (RealApp.tsx:485, :540-553), with no control",
      app: "packages/desktop-ui/src/RealApp.tsx:485, :540-553, styles.css:3244-3349",
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
      app: "packages/desktop-ui/src/styles.css:1604-1610, RealApp.tsx:3812-3872",
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
      app: "packages/desktop-ui/src/styles.css:1604-1610",
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
    // włącza i kolumna zabiera panelowi pracy 20 px przy 1440, 40 px przy
    // 1024@200 % i 60 px przy 1092@300 %. Przemierzone 2026-08-07: bramka układu
    // czerwienieje z 21 problemami na dziewięciu stanach ekranu, w tym 16
    // świeżych w Bibliotece i jednym NOWYM na `tasks:calendar`. Pełny rozpis
    // stoi przy samym tokenie (`packages/desktop-ui/src/tokens.css`), żeby nie
    // było go w dwóch miejscach.
    //
    // ZOSTAJE „PENDING" TAKŻE PO LOCIE L1 FAZY II, 2026-08-14, I JEST TO
    // DECYZJA PODJĘTA NA POMIARZE, NIE PRZEPISANA Z 07.08. Lot L1 zdjął sufit
    // kolumny czytelnej z pięciu ekranów, czyli zmienił arytmetykę, na której
    // tamten rejestr stał — więc został przemierzony na drzewie PO L1: przy
    // 15 rem bramka dalej wraca CZERWONA (exit 1), z dwunastoma problemami
    // zamiast dwudziestu jeden. Skala zmalała, rodzaj nie: trzy urosłe wpisy
    // cudzego długu, ta sama NOWA wada na `tasks:calendar` (4 px) i osiem
    // świeżych przepełnień Biblioteki przy 300 % pisma, żadne z właścicielem.
    // Konsekwencja dla tego wpisu jest mechaniczna: skoro token się nie rusza,
    // ta para zostaje `pending` i mapa powłoki liczy `enforced: 50, pending: 5`.
    // Gdyby ruszył, para MUSI iść na `enforced` tym samym commitem — inaczej
    // przelot pada jako `VISUAL_LANGUAGE_PENDING_ALREADY_MATCHES`, co zresztą
    // ten lot zobaczył na własne oczy w przelocie próbnym.
    //
    // CO ZOSTAJE OTWARTE RAZEM Z NIĄ, powiedziane wprost, żeby nie wyglądało na
    // ciszę: wpisy `P-5` („Organizat…" ucięte w pasku) i `13-3`
    // („Access and connecti…" w trybie Ustawień) są WIDOCZNĄ CENĄ tej decyzji,
    // a nie osobnymi defektami — zmierzone przy 1440 px w obu trybach.
    // Nie mierzy ich ŻADEN przyrząd i to jest strukturalne: zamiatanie
    // przepełnień bierze podmiot jako potomka `#main-content[role="tabpanel"]`,
    // a pasek boczny tam nie leży; rejestr par czyta wyliczone własności,
    // a „czy etykieta jest elipsowana" to `scrollWidth > clientWidth`, czyli
    // geometria. Zapas po ewentualnej naprawie: 13 px na „Organizations",
    // 6 px na „Access and connections".
    contract: ".ui-craft/tokens.md (Spacing and density)",
    prototype: {
      file: "v3/tokens.css",
      lines: "103",
      value: "--sidebar-width: 15rem",
    },
    subject: {
      selector: ".sidebar",
      why: "measured on the element, not on the token, so a media query that overrides the width is visible to this pair",
      app: "packages/desktop-ui/src/tokens.css (`--sidebar-width`)",
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
      app: "packages/desktop-ui/src/tokens.css:661",
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
      app: "packages/desktop-ui/src/tokens.css:664",
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
      app: "packages/desktop-ui/src/styles.css:1149-1158, RealApp.tsx:1962-1965",
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
      why: "two of the three section heads on the landing surface draw one (TodaySurface.tsx:383, :455) and both take the same rule",
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
  // ══ FAZA I, PRZYRZĄD P1 — SUFIT KOLUMNY CZYTELNEJ ═════════════════════════
  // Jedyna pozycja tego przyrządu, która stoi w mapie POWŁOKI, i stoi tu
  // dlatego, że `HARNESS` ląduje na Dzisiaj: `main[data-surface]` ma na
  // lądowaniu wartość „today" bez ani jednego kliknięcia. Pozostałe dwanaście
  // ekranów wymaga nawigacji i siedzi w mapie trasowanej — para na nieobecny
  // podmiot wraca NOT_MEASURED, czyli awarią przyrządu w OBU statusach.
  //
  // TEZA CAŁEGO PRZYRZĄDU, JEDNYM ZDANIEM: czy sufit kolumny czytelnej, pod
  // którym stoi treść ekranu, jest wartością zadeklarowaną DLA TEGO EKRANU
  // i równą prototypowej — czy jedną liczbą powłoki, odziedziczoną przez
  // wszystkie trzynaście. Kiedy ten przyrząd powstawał (Faza I, 2026-08-13),
  // `.work-surface { --surface-measure: 72rem }` rządziło dwunastoma ekranami
  // i nie mierzyła tego ANI JEDNA z 206 par: pięć par czytających `max-width`
  // mierzy akapit (L4-12, L6-05), dymek (C5-01c), pasmo (D1-01b) albo cytuje
  // regułę w prozie (D7-01a).
  //
  // DOWIEZIONE PRZEZ LOT L1 FAZY II, 2026-08-14, i od tej chwili ten przyrząd
  // pilnuje dostawy zamiast opisywać dług. Jedenaście korzeni ekranów deklaruje
  // dziś własną wartość (`--surface-measure` w ich arkuszach), Spotkania niosą
  // literał na własnym korzeniu — 74rem zamiast 94rem — a linijka na
  // `.work-surface` została i ma nazwaną, węższą robotę: jest wartością dla
  // tego, co NIE jest ekranem (chrom powłoki `.notice`, `.condition-banner`)
  // i dla dwóch nośników, których nie mierzy jeszcze żadna para (kontekst
  // organizacji, historia wrzutek). Powód, dla którego jej NIE skasowano, stoi
  // przy samej regule: klamra ma zapasowe `58rem`, więc zdjęcie tej linijki
  // włączyłoby DRUGĄ liczbę powłoki, węższą od pierwszej, na nośnikach bez
  // pary. Wszystkie trzynaście pozycji jest `enforced`.
  {
    id: "P1-01",
    lot: "P1",
    position: 1,
    kind: "restyle",
    title: "Today declares its own reading measure",
    contract:
      '.ui-craft/patterns.md — „Pattern: Surface title band", akapit „Content stays in the reading column"',
    prototype: {
      file: "v3/screens/today.css",
      lines: "5",
      value:
        "`.td { max-width: 68rem; padding: var(--space-6) }` — sufit stoi w PLIKU EKRANU, nie w tokenach powłoki; `.td` jest jedynym dzieckiem `.scroller` (`v3/screens/today.js:131`)",
    },
    subject: {
      selector:
        '#main-content [class*="_today_"] > *:not(.surface-header):not(.view-band)',
      why: "the clamp carrier the contract names by selector: `.surface-scroll > *:where(:not(.surface-header, .view-band))` (styles.css:6196-6200). Measured 2026-08-13 at 1440×900 in both themes: FOUR rendered children (p._capacity, section._section ×3), ONE distinct maxWidth — 1152px — so this selector says exactly one thing",
      app: "packages/desktop-ui/src/TodaySurface.tsx:225 (nośnik), styles.css (klamra `.surface-scroll > *`), today.module.css (`.today { --surface-measure: 68rem }` — wartość TEGO ekranu, od lotu L1)",
    },
    read: { property: "maxWidth" },
    expect: { kind: "rem", value: 68 },
    // `rem`, A NIE PIKSEL, i to nie jest ostrożność: `judgeVisualPair` dzieli
    // przez `getComputedStyle(document.documentElement).fontSize`
    // (`verify-renderer-layout.mjs:4493-4495`), więc ta para pyta o REGUŁĘ
    // („ekran deklaruje 68 rem"), a nie o szerokość okna. Wszystkie liczby
    // dokumentu przejścia są z 1662 px, a ta mapa chodzi przy 1440 px.
    //
    // `pending: LOT L1` → `enforced` W LOCIE L1 (Faza II, 2026-08-14). Przelot
    // przed zmianą: 1152 px (72 rem) wobec oczekiwanych 68 rem; po zmianie
    // 1088 px. Status MUSI się przewrócić w tym samym commicie co arkusz —
    // para oczekująca, która zaczyna pasować, kładzie bramkę jako
    // `VISUAL_LANGUAGE_PENDING_ALREADY_MATCHES`, a osłabianie oczekiwania po
    // to, żeby utrzymać ją w „pending", jest w tym pliku zakazane wprost.
    status: "enforced",
  },
  // ══ FAZA I, PRZYRZĄD P2 — CHROM KARTY NA POJEMNIKU LISTY ══════════════════
  // TEZA, JEDNYM ZDANIEM: lista wierszy stoi w POJEMNIKU, który ma ramkę,
  // promień i przycięcie, a wiersz w środku NIE MA własnego rogu karty.
  // Mierzone na wyliczonym stylu elementu O ROLI LISTY — nigdy na obecności
  // reguły w arkuszu i nigdy na nazwie klasy modułu.
  //
  // DLACZEGO TEN PRZYRZĄD W OGÓLE ISTNIEJE. Wpis 3-1 dokumentu przejścia:
  // sonda przeszła na Skrzynce wszystkie `div/ul/ol/section/table` szersze niż
  // 200 px i wyższe niż 40 px i zebrała te z ramką ≥ 0,5 px albo promieniem
  // ≥ 1 px — ZBIÓR PUSTY, przy 206 zielonych parach. Nie ma tu sprzeczności:
  // trzynaście par tego rejestru czyta `borderRadius`/`borderTopWidth`
  // i wszystkie siedzą na Bibliotece, Ustawieniach, rekordzie projektu,
  // komentarzach i doku przechwytywania. Ani jedna nie stoi na Dzisiaj,
  // Kalendarzu ani Skrzynce.
  //
  // PODMIOT WSKAZANY PRZEZ ROLĘ, I TO NIE JEST OZDOBA. Rodzic wiersza NIE
  // NADAJE SIĘ na podmiot, bo jest asymetryczny między dwoma ekranami tej
  // rodziny: na Dzisiaj `data-planned-row` siedzi na `<div>` WEWNĄTRZ gołego
  // `<li>` (`TodaySurface.tsx:413-420`), więc `*:has(>[data-planned-row])`
  // trafiłby w `<li>`, a chrom ma dostać LISTA; na Skrzynce `data-inbox-row`
  // siedzi wprost na `<li>` (`InboxSurface.tsx:136-146`). Nazwa klasy modułu
  // odpada osobno — `_rows_` zeruje selektor po cichu przy pierwszym
  // przebudowaniu arkusza. Zostaje „element o roli listy, który zawiera
  // ZADEKLAROWANE wiersze", i to samo zdanie działa na obu ekranach.
  //
  // PRZYPIĘCIE DO ROLI ARIA JEST ŚWIADOME i nie wolno go hartować do
  // `:is(ul,ol,[role=list],[role=listbox])`: przebudowa, która zdejmie rolę,
  // ma dać `NOT_MEASURED`, czyli CZERWIEŃ w obu statusach. To jest właściwy
  // kierunek awarii i dokładnie to, co czyni możliwym złamanie tego przyrządu
  // (`scripts/break-visual-language.mjs`, „the Today plan list's role").
  //
  // `:has()` BEZ SPACJI W ŚRODKU NAWIASU. Diagnostyka `NOT_MEASURED` dzieli
  // selektor po `\s+` (`verify-renderer-layout.mjs:4414-4425`); spacja wewnątrz
  // `:has()` rozbija go na dwa nieparsowalne kawałki i spis „każda część
  // osobno" przestaje cokolwiek mówić, choć czerwień dalej pada.
  //
  // ── WZORZEC, KTÓRY TE SZEŚĆ PAR ZAKŁADAŁO PO STRONIE LOTU L4 — ROZSTRZYGNIĘTY
  //    2026-08-14 ────────────────────────────────────────────────────────────
  // ZAPISANE TUTAJ, ŻEBY NIKT NIE ODKRYWAŁ TEGO Z CZERWONEJ BRAMKI — ten sam
  // ruch, co przy przyrządzie P1. Prototyp niesie chrom na OSOBNYM pudełku
  // (`div.td-list`, `div.ib-list` opakowują wiersze), a te pary czytają element
  // NIOSĄCY ROLĘ LISTY, czyli `<ul>`. Jeżeli L4 doda ramkę, promień
  // i przycięcie WPROST na `ul.rows` / `ul[role]`, sześć par pozycji 1 i 3
  // zzielenieje bez przepisywania czegokolwiek. Jeżeli L4 pójdzie za prototypem
  // STRUKTURALNIE i wprowadzi opakowujący `<div>`, który weźmie chrom, te
  // sześć par ZOSTANIE CZERWONYCH nad poprawną dostawą i trzeba je będzie
  // PRZEPIĄĆ na to pudełko — decyzja należy do L4, ale koszt jest znany
  // z góry i stoi zapisany tu, a nie w raporcie z czerwonego przelotu.
  //
  // CO WYBRAŁ LOT L4, I DLACZEGO TO NIE BYŁO PYTANIE: chrom stoi WPROST na
  // `<ul>`, bez opakowania. Prototyp sam żadnego nie ma — element niosący klasę
  // karty JEST elementem niosącym `role="listbox"` / `role="list"`
  // (`v3/screens/today.js`, `inbox.js`, `calendar.js`), a zasadą tej fali jest
  // „prototyp wygrywa". Ani jedna para nie została przepięta; przepisana została
  // jedna (`P2-01c`) i z powodu, który z tym wyborem nie ma nic wspólnego.
  // Pary wiersza (P2-02, P2-04) są na tę zmianę odporne: ich podmiotem jest
  // atrybut wiersza, którego żadna z dwóch dróg nie rusza.
  //
  // ── P2 · POZYCJA 1 — LISTA DZISIAJ STOI W POJEMNIKU Z RAMKĄ ───────────────
  // Wpis 1-2 dokumentu przejścia.
  //
  // ── USTALENIE O SAMYM ŹRÓDLE PRAWDY: `--surface-panel` NIE ISTNIEJE ───────
  // I JEST TO WADA PROTOTYPU, NIE JEGO PROJEKT — zapisane TU, bo to jest
  // jedyne miejsce w repozytorium, które trzyma zdania o tym, co prototyp
  // MÓWI, a `docs/plans/…/v3` jest gitignorowane i w drzewie CI go nie ma.
  //
  // `v3/screens/today.css` odwołuje się do `var(--surface-panel)` TRZY razy
  // (`:21` `.td-meetings`, `:59` `.td-list`, `:115` `.td-empty`) i NIE definiuje
  // tej nazwy ani razu — `grep -rn -- "--surface-panel:" v3/` daje zero trafień
  // w CAŁYM prototypie, `v3/tokens.css` włącznie. Niezdefiniowany `var(--…)`
  // bez fallbacku jest wartością nieprawidłową przy podstawieniu, więc te trzy
  // pojemniki renderują się PRZEZROCZYSTE.
  //
  // ZMIERZONE, NIE WYCZYTANE (Chromium 1440×900 nad statycznym serwerem na
  // `v3/`, `getComputedStyle(...).backgroundColor`, oba motywy):
  //   dark   `.td-list` i `.td-meetings` → `rgba(0, 0, 0, 0)` na płótnie
  //          `oklch(0.104 0.01 285)`; `.ib-list`, `.mt-list` i `.cal-tray`
  //          → `oklch(0.152 0.012 285)`, czyli `--surface-content`
  //   light  `.td-list` i `.td-meetings` → `rgba(0, 0, 0, 0)` na płótnie
  //          `oklch(0.982 0.003 285)`; te same trzy → `oklch(1 0 0)`
  // Karta Dzisiaj NIE czyta się na ekranie tak jak karta Skrzynki: tamta
  // podnosi się nad kanwę w obu motywach, ta leży na niej płasko.
  //
  // ZMIERZONA JEST TEŻ APLIKACJA PO ZMIANIE, i to nie jest formalność: tło
  // równe WŁASNEMU podkładowi byłoby wadą lustrzaną do tej, którą ta zmiana
  // zamyka (`tokens.css:657` daje `--panel-reading-bg: var(--surface-content)`,
  // więc pojemnik postawiony na czytelni miałby tło nieodróżnialne od kanwy
  // i czytałby się samą ramką). Zmierzone nad `?surface=collaboration`,
  // 1440×900, oba motywy: `.rows` → `oklch(0.152 0.012 285)` na płótnie
  // `main.work-column` `oklch(0.104 0.01 285)` (dark) i `oklch(1 0 0)` na
  // `oklch(0.982 0.003 285)` (light) — czyli DOKŁADNIE ten sam skok, jaki
  // prototyp daje swojej karcie Skrzynki. Karta się podnosi.
  //
  // ROZSTRZYGA SAM PROTOTYP, PRZECIW SOBIE. Czwarte i OSTATNIE użycie tej nazwy
  // w całym `v3/` — `v3/screens/settings.css:111` — brzmi `background:
  // var(--surface-panel, var(--surface-content))`, Z FALLBACKIEM, na regule
  // `.st-list` o IDENTYCZNEJ trójce chromu (`--border-subtle`, `--radius-md`,
  // `overflow: hidden`). Zmierzone: `.st-list` wychodzi `oklch(0.152 0.012 285)`
  // / `oklch(1 0 0)`, czyli fallback naprawdę niesie `--surface-content`.
  //
  // TA REGUŁA NALEŻY DO INNEGO WZORCA („Pattern: Settings section card and list
  // plate", cytowanego w polu `contract` pary P2-01a) i dlatego jest tu
  // CYTOWANA JAKO DOWÓD O WARTOŚCI TOKENU, a nie doliczana do spisu tego
  // wzorca — jej płótno to sam panel ustawień, więc pomiar „czy karta się
  // podnosi" nie ma tam sensu. Dowód jest od tego niezależny: autor zapisał
  // czarno na białym, czym `--surface-panel` MIAŁ być. „Przezroczysta karta"
  // nie jest wyborem, który da się zapisać przez odwołanie do nazwy, której
  // się nigdzie nie definiuje — to jest przeoczony fallback.
  //
  // DLATEGO APLIKACJA BIERZE `--surface-content` I JEST TO ROZJAZD ŚWIADOMY,
  // dokładnie tego samego rodzaju co odmowa skopiowania `overflow: hidden`
  // niżej: prototyp wygrywa co do ZAMIARU, jego wada nie jest projektem.
  // Cytaty `prototype.value` przy parach tej pozycji zostają dosłowne — one
  // mówią, co w arkuszu STOI — ale każdy z nich niesie odtąd zdanie o tym, co
  // ten zapis NAPRAWDĘ rysuje, żeby następny czytający nie wziął go za dowód
  // na tło, którego prototyp nie ma.
  //
  // KONTRAKT ZOSTAŁ POPRAWIONY, NIE OBUDOWANY. `.ui-craft/patterns.md` —
  // „Pattern: Section head over a list card" — twierdził do 2026-08-14, że
  // „the FILL and the SHADOW are the screen's own and are NOT part of the
  // pattern", i JEDYNYM dowodem na zmienność wypełnienia było `.td-list` takes
  // `--surface-panel`. To zdanie było czytane z TEKSTU ŹRÓDŁOWEGO wzorca, nigdy
  // z jego RENDERU. Po pomiarze wypełnienie jest NIEZMIENNIKIEM (`.ib-list`,
  // `.mt-list`, `.cal-tray` → `--surface-content`; `.td-list` → nic), więc
  // niezmienników wzorca jest CZTERY, a nie trzy. „Screen's own" zostaje
  // wyłącznie przy CIENIU i to też jest odtąd zmierzone, nie wyczytane:
  // `boxShadow` daje dwuwarstwowy `--shadow-sm` na `.ib-list` i `.mt-list`,
  // a `none` na `.td-list`, `.td-meetings` i `.cal-tray`. Ten plik jest
  // w drzewie roboczym CI, a `.ui-craft/` nie — dlatego pomiar stoi tutaj
  // W CAŁOŚCI, a tam w formie skróconej.
  //
  // NIEZMIERZONE I POWIEDZIANE WPROST: ani jedna para obu map nie czyta
  // `backgroundColor` na tej rodzinie pojemników, więc ten rozjazd nie ma
  // dziś strażnika — lot, który zdejmie tło albo wróci do niezdefiniowanej
  // nazwy, dostanie czerwień WYŁĄCZNIE z `css token lint` w drugim przypadku
  // i ŻADNEJ w pierwszym.
  {
    id: "P2-01a",
    lot: "P2",
    position: 1,
    kind: "restyle",
    title: "the Today list stands in a container with a hairline border",
    contract:
      '.ui-craft/patterns.md — „Pattern: Settings section card and list plate", ograniczenie „A row of a list is not a card"',
    prototype: {
      file: "v3/screens/today.css",
      lines: "57-60",
      value:
        "`.td-list { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; background: var(--surface-panel) }` — " +
        "cytat jest dosłowny, ale `--surface-panel` NIE JEST W PROTOTYPIE ZDEFINIOWANY (zero deklaracji w całym `v3/`), " +
        "więc ta karta renderuje się PRZEZROCZYSTA w obu motywach (zmierzone); aplikacja bierze `--surface-content` za " +
        "`v3/screens/settings.css:111`, gdzie ta sama rodzina pisze `var(--surface-panel, var(--surface-content))` — komentarz wyżej",
    },
    subject: {
      selector: '#main-content [role="listbox"]:has([data-planned-row])',
      why: "role plus the declared row attribute, so neither the module hash nor the tag is load-bearing; the approaching list on the same screen is also a listbox but carries data-approaching-row, so it cannot join this subject set",
      app: 'packages/desktop-ui/src/TodaySurface.tsx (the <ul role="listbox" aria-label="Planned for today">), today.module.css (.rows, .meetings — one shared card rule since lot L4; before it the rule declared gap, margin, padding and list-style, and no border at all)',
    },
    read: { property: "borderTopWidth" },
    expect: { kind: "literal", value: "1px" },
    status: "enforced",
  },
  {
    id: "P2-01b",
    lot: "P2",
    position: 1,
    kind: "restyle",
    title: "and the Today container carries the card radius",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card", ograniczenie „The chrome belongs to the LIST, not to the section"',
    prototype: {
      file: "v3/screens/today.css",
      lines: "57-60",
      value: "`.td-list { border-radius: var(--radius-md) }`",
    },
    subject: {
      selector: '#main-content [role="listbox"]:has([data-planned-row])',
      why: "the same subject as P2-01a; the radius is read APART from the border because a 1px square frame satisfies one and not the other, and entry 1-2 names both",
      app: "packages/desktop-ui/src/today.module.css (.rows, .meetings)",
    },
    // TOKEN, NIE LICZBA, i to jest ochrona przed asercją gnijącą od tokenu:
    // `inbox.module.css:172-176` zapisuje wprost, że liczby promienia z tamtej
    // okolicy są HISTORYCZNE (mierzone, gdy `--radius-md` miał 0.5625rem;
    // R3 z 2026-08-07 dał mu 0.75rem). Wpisany literał „12px" zrobiłby z tej
    // pary czerwień przy następnej zmianie tokenu, bez żadnej zmiany produktu.
    read: { property: "borderRadius" },
    expect: { kind: "token", token: "--radius-md" },
    status: "enforced",
  },
  // ── TA PARA JEST PRZEPISANA PRZEZ LOT L4, RAZEM Z POMIAREM, KTÓRY TEGO
  //    ZAŻĄDAŁ ────────────────────────────────────────────────────────────────
  // Czytała `overflow` i żądała „hidden" za prototypem. PIERWSZA WERSJA TEGO
  // AKAPITU UZASADNIAŁA ROZJAZD ZDANIEM, KTÓRE JEST NIEPRAWDZIWE: „prototyp na
  // to nie natrafił, bo maluje ognisko konturem 1 px poza pudełkiem
  // (`v3/app.css:36-38`)". Cytat urywał się jedną linię przed dowodem
  // przeciwnym. Pełna reguła to `v3/app.css:36-43`:
  //
  //   :36  :where(button, a, …, [tabindex]:not([tabindex="-1"])):focus-visible {
  //   :37    outline: 2px solid var(--accent);
  //   :38    outline-offset: 1px;
  //   :39    box-shadow: 0 0 0 5px var(--accent-quieter);
  //   :40    border-radius: var(--radius-xs);
  //   :41    z-index: var(--z-raised);
  //   :42    position: relative;
  //
  // czyli 3 px twardej linii ORAZ 5 px poświaty poza pudełkiem. Wiersze
  // prototypu SĄ ogniskowalne (`v3/screens/today.js:53`, `inbox.js:82`,
  // `calendar.js:101` — `role="option"` z wędrującym `tabindex`), a `.td-list`
  // nie ma wyściółki. ZMIERZONE W SAMYM PROTOTYPIE, prawdziwym Tabem
  // w Chromium 1440×900 (`scratchpad/probe-proto-L4.mjs`, 37 tabulacji do
  // pierwszego wiersza, `:focus-visible` = true): `.td-list` wylicza
  // `overflow: hidden/hidden` przy wyściółce `0px 0px 0px 0px`, luz wiersza do
  // krawędzi przycięcia wynosi 0 px na górze, po lewej i po prawej, a element
  // wstawiony 8 px poza wiersz nie jest widoczny 4 px za krawędzią pojemnika
  // MIMO `position: relative` i `z-index: 2` z tej samej reguły. Prototyp
  // napotkał więc ten sam problem i wyciął sobie CAŁY wskaźnik ogniska.
  //
  // ROZJAZD ZOSTAJE, ALE Z PRAWDZIWYM POWODEM. Nie brzmi on „nasz pierścień ma
  // 14 px, a ich 5 px" — brzmi „wycięcie wymaganego wskaźnika ogniska jest
  // naruszeniem WCAG 2.4.7 przy KAŻDYM rozmiarze pierścienia". Reguła 1 tej
  // fali („prototyp wygrywa") rozstrzyga spór PROTOTYP KONTRA KONTRAKT; tutaj
  // prototypowi przeciwstawia się kryterium dostępności, więc rozjazd jest
  // ZAPISANY jako rozjazd, a nie przemilczany. Po stronie tej aplikacji
  // pierścień jest LISTĄ CIENI ZEWNĘTRZNYCH (`packages/desktop-ui/src/
  // tokens.css` — `--focus-ring`, malowany regułą `:where(…):focus-visible`)
  // i wystaje 14 px, a wiersz planu przylega do pudełka wyściółki pojemnika
  // z luzem 0 px na WSZYSTKICH czterech krawędziach (prawdziwy Tab w Chromium,
  // oba motywy).
  //
  // ROZSTRZYGA TO PRECEDENS TEJ APLIKACJI, NIE GUST: lot R1 postawił dokładnie
  // tę granicę (`packages/desktop-ui/src/styles.css` —
  // `.meeting-upcoming-list` przycina, bo w jej wierszu nic ogniskowalnego nie
  // stoi przy krawędzi; `.meeting-result-list` NIE przycina, bo jej wiersz jest
  // przyciskiem na całą szerokość karty, a róg domykają tam wiersze skrajne
  // przez `border-start-start-radius` / `border-end-end-radius`).
  //
  // DLACZEGO OCZEKIWANIE ZMIENIA SIĘ RAZEM Z ODCZYTEM, A NIE SAMO. Para
  // cytująca `overflow: hidden` i pilnująca „visible" byłaby parą cytującą
  // jedną rzecz i pilnującą innej — nazwana klasa defektu tego rejestru
  // (`patterns.md`, „An add bar is an action bar", przypadek 1,8 rem kontra
  // cytowane 1,75 rem). Nowy odczyt pyta o rzecz, którą prototyp i lekarstwo R1
  // mówią ZGODNIE: róg karty ma być widoczny na wierszu, który się z nim styka.
  // Samo pytanie „czy pojemnik dalej nie przycina" zeszło do wpisu
  // `NOT_COVERED` — z mechanizmem pierścienia i warunkiem wyjścia.
  //
  // NOŚNIKIEM ROGU JEST `<li>`, NIE WIERSZ, I TO NIE JEST WYBÓR STYLU.
  // Lekarstwo R1 kładzie promień na WIERSZU; tutaj wiersz jest podmiotem pary
  // P2-02 („wiersz oddaje róg karty liście", `borderRadius` = „0px"), a fikstura
  // rysuje DOKŁADNIE JEDEN wiersz, więc `:first-child` i `:last-child` to ten
  // sam element i promień postawiony na nim uczyniłby P2-02 czerwoną wobec kodu
  // ZGODNEGO z prototypem. `<li>` na Dzisiaj jest puste (`TodaySurface.tsx` —
  // `data-planned-row` siedzi na `<div>` w środku), więc bierze róg i tło stanu,
  // a wiersz zostaje kwadratowy. Na Skrzynce ta droga NIE ISTNIEJE
  // (`data-inbox-row` jest wprost na `<li>`) i dlatego tam rozstrzyga pomiar
  // luzu, a nie ta sztuczka.
  //
  // PARA MIERZY JEDNĄ Z CZTERECH DEKLARACJI, O KTÓRYCH MÓWI JEJ TYTUŁ — i drugą
  // mierzy `P2-01e` niżej. Lekarstwo to dwie reguły po dwie deklaracje
  // (`today.module.css` — `.rows > li:first-child` i `> li:last-child`).
  // Ta para czyta `borderStartStartRadius` z pierwszej, `P2-01e` czyta
  // `borderEndEndRadius` z drugiej, więc skasowanie KTÓREJKOLWIEK reguły
  // w całości zapala dokładnie jedną z nich; przed dopisaniem `P2-01e`
  // skasowanie reguły `:last-child` zostawiało tę parę zieloną Z KONSTRUKCJI
  // (inny selektor, inna własność), a wypełnienie stanu ostatniego wiersza
  // wychodziło kwadratowym rogiem za zaokrągloną krawędź karty. Dwie
  // deklaracje od strony końca wiersza dalej nie są czytane i stoi to we wpisie
  // `NOT_COVERED` „nothing stops a later lot from clipping the focus ring
  // away".
  //
  // ══ PRZEPISANIE KONTRAKTU `.ui-craft/patterns.md` — KROK MERGE'A, NIE RZECZ
  //    ZROBIONA ════════════════════════════════════════════════════════════
  // `/.ui-craft/` jest gitignorowane (`.gitignore:5`), więc NIE ISTNIEJE
  // w drzewie roboczym tego lotu i ŻADEN nośnik nie sprawi, że przepisanie
  // pojedzie w diffie. Lot chodził w worktree z zakazem pisania do drzewa
  // głównego (równolegle chodził tam inny tor). Tekst jedzie więc tutaj, w
  // pliku ŚLEDZONYM, dosłownie — i tu jest jedyne miejsce, w którym przetrwa.
  // Mechaniczny aplikator z twardymi asercjami:
  // `…/scratchpad/l4-ui-craft-patch.py` (dry run domyślnie, `--apply` zapisuje).
  // Dopóki to nie zostanie zastosowane, pole `contract` niżej mówi „do
  // przepisania", a NIE „przepisane".
  //
  // (1) BYŁO — „A row of a list is not a card":
  //     „…the row keeps one hairline, removed on the last row. `overflow:
  //     hidden` on the plate is load-bearing — without it the hover fill and
  //     the selection rail leave square corners outside a rounded edge."
  //     MA BYĆ:
  //     „…the row keeps one hairline, removed on the last row. The plate must
  //     CUT the corner its rows would otherwise square off — but `overflow:
  //     hidden` is one of two ways to do that, not an invariant. Clip the plate
  //     WHEN AND ONLY WHEN no focusable box touches the plate's padding box;
  //     otherwise leave it unclipped and round `> li:first-child` /
  //     `> li:last-child` instead. Both halves are shipped and both were
  //     measured with a real Tab in Chromium, in both themes: the Inbox row's
  //     button sits 8 px and 12 px inside its list, so the hard rings survive
  //     the clip and only the 0.12-alpha halo is cut; Today's plan rows and the
  //     Calendar tray rows sit at 0 px on all four edges. This is a KNOWN
  //     divergence from the reference, not a gap in reading it: the reference
  //     clips all four of its plates and thereby clips its OWN indicator away —
  //     measured in the prototype, `.td-list` computes `overflow: hidden` with
  //     `padding: 0` while `v3/app.css:36-43` paints focus 3 px (outline plus
  //     offset) and 5 px (halo) outside the row, and a witness 8 px outside the
  //     row is invisible past the plate edge despite that rule's own
  //     `position: relative; z-index`. Clipping a required focus indicator
  //     fails WCAG 2.4.7 at any ring size, so this app declines to reproduce
  //     it. The precedent is this app's own lot R1: `.meeting-upcoming-list`
  //     clips and says why, `.meeting-result-list` does not."
  //
  // (2) NOWE OGRANICZENIE, dopisywane pod tamtym: „The plate adds no gap of its
  //     own. The separator is ONE hairline and it is the row's `border-bottom`.
  //     A `gap` on the plate beside it delivers a two-pixel rule while every
  //     pair about the border, the radius and the row's corner stays green —
  //     the single silent failure instrument P2 named twice before lot L4 could
  //     make it. Read as `rowGap` on the container by `P2-01d` and `P2-03d`.
  //     The reference declares no gap at all, so the computed value is
  //     `normal`, not `0px`."
  //
  // (3) BYŁO — „Three declarations are invariant across the reference and are
  //     what makes a list a card: a hairline `--border-subtle` border,
  //     `--radius-md`, and `overflow: hidden`."
  //     MA BYĆ: „TWO declarations are invariant … a hairline `--border-subtle`
  //     border and `--radius-md`. The reference adds `overflow: hidden` to all
  //     four of them, and this app follows it only where the measurement above
  //     allows." (Zdanie o niezmienniku było sprzeczne z własnym `Usage` tego
  //     wzorca od Fazy D: `Usage` wymienia `.meeting-result-list`, który tej
  //     deklaracji świadomie nie ma.)
  //
  // (4) `Usage` rośnie o cztery karty: `today.module.css` (`.rows`,
  //     `.meetings`), `inbox.module.css` (`.rows`), `calendar.module.css`
  //     (`.tray`).
  {
    id: "P2-01c",
    lot: "P2",
    position: 1,
    kind: "restyle",
    title: "and the Today card's corner is cut on the row that meets its head",
    contract:
      ".ui-craft/patterns.md — „Pattern: Settings section card and list plate\", zdanie o przycięciu talerza; przepisanie z niezmiennika na warunek jest KROKIEM MERGE'A tego lotu i tekst stoi w komentarzu nad tą parą, bo `/.ui-craft/` jest gitignorowane",
    prototype: {
      file: "v3/screens/today.css",
      lines: "57-60",
      value:
        "`.td-list { border-radius: var(--radius-md); overflow: hidden }` — prototyp domyka róg PRZYCIĘCIEM i przycina przy tym własny wskaźnik ogniska (zmierzone w prototypie), a ta aplikacja domyka róg wierszem skrajnym, bo wycięcie wskaźnika jest naruszeniem WCAG 2.4.7; precedens `packages/desktop-ui/src/styles.css` (`.meeting-result-list > li:first-child`)",
    },
    subject: {
      // BEZ SPACJI PRZY `>`: diagnostyka `NOT_MEASURED` dzieli selektor po
      // `\s+` i próbuje każdą część osobno, a samotny `>` nie jest selektorem.
      selector:
        '#main-content [role="listbox"]:has([data-planned-row])>li:first-child',
      why: "the first row's own box, addressed through the container of P2-01a so the two pairs cannot drift apart; `:first-child` resolves to exactly one drawn element whatever the row count, so this subject cannot go ambiguous by growing — unlike a bare `>li`, whose first and last members would hold DIFFERENT radii the moment the fixture draws two rows",
      app: "packages/desktop-ui/src/today.module.css (.rows > li:first-child — border-start-start-radius)",
    },
    read: { property: "borderStartStartRadius" },
    expect: { kind: "token", token: "--radius-md" },
    status: "enforced",
  },
  // ── PARA, KTÓREJ NIE BYŁO, I KTÓRA ZAMYKA JEDYNE CICHE `greenWrong` TEGO
  //    PRZYRZĄDU ──────────────────────────────────────────────────────────────
  // Oba wpisy `NOT_COVERED` przyrządu P2 nazywały tę samą drogę porażki:
  // „lot L4 może dołożyć wierszowi `border-bottom` i ZOSTAWIĆ `gap: 1px` na
  // pojemniku, czyli dowieźć separator 2 px zamiast 1 px, przy wszystkich
  // ośmiu parach P2 zielonych". Sprawdzone przed napisaniem tej pary:
  // ANI JEDNA para obu map nie czytała `rowGap` ani `columnGap` jako
  // oczekiwania — jedyne odczyty `columnGap` w repozytorium są w spisie pasma
  // tytułu, czyli w diagnostyce, nie w asercji.
  //
  // `„normal"`, A NIE `„0px"`, I TO JEST ZMIERZONE, NIE ZAŁOŻONE. Sonda
  // w Chromium: kontener flex BEZ deklaracji `gap` wylicza `rowGap: "normal"`,
  // a ten sam kontener z `gap: 0` wylicza `"0px"`. Prototyp nie deklaruje na
  // `.td-list` odstępu ŻADNEGO, więc „normal" jest zapisem jego stanu — ten sam
  // kształt, co `literal: "none"` przy `L1-01a` i przy suficie P1-04. Lot,
  // który kiedykolwiek napisze tu `gap: 0`, dowiezie rzecz POPRAWNĄ i musi
  // przestawić ten literał w tym samym commicie; to jest edycja jednego słowa
  // i stoi tu napisana, żeby nikt nie odkrywał jej z czerwonego przelotu.
  {
    id: "P2-01d",
    lot: "P2",
    position: 1,
    kind: "restyle",
    title: "and the Today list adds no second gap between its rows",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card", ograniczenie „The chrome belongs to the LIST, not to the section"',
    prototype: {
      file: "v3/screens/today.css",
      lines: "57-66",
      value:
        "`.td-list` declares no gap at all; the whole separator is the row's own `border-bottom: 1px solid var(--border-subtle)` on `.td-row`",
    },
    subject: {
      selector: '#main-content [role="listbox"]:has([data-planned-row])',
      why: "the same subject as P2-01a, and read on the CONTAINER because that is where the second hairline would come from: the row's border is one pixel and the list's gap would be another, so the eye gets a two-pixel rule while every pair about the border, the radius and the row's corner stays green",
      app: "packages/desktop-ui/src/today.module.css (.rows, .meetings — the gap declaration is gone)",
    },
    read: { property: "rowGap" },
    expect: { kind: "literal", value: "normal" },
    status: "enforced",
  },
  // ── DRUGA POŁOWA LEKARSTWA NA RÓG, DOPISANA PRZY NAPRAWIE LOTU L4 ─────────
  // Lekarstwo, którego pilnuje `P2-01c`, to CZTERY deklaracje w DWÓCH regułach.
  // `P2-01c` czytała jedną z nich i była zielona Z KONSTRUKCJI wobec
  // skasowania całej reguły `.rows > li:last-child` — inny selektor, inna
  // własność — a to jest złamanie, które robi dokładnie tę wadę, dla której
  // lekarstwo istnieje: wypełnienie hover i zaznaczenia ostatniego wiersza
  // wychodzi kwadratowym rogiem za zaokrągloną dolną krawędź karty.
  //
  // JEDNA PARA NA REGUŁĘ, NIE JEDNA NA DEKLARACJĘ. Cztery pary byłyby czterema
  // odczytami tej samej myśli; dwie wystarczą, żeby skasowanie KTÓREJKOLWIEK
  // z dwóch reguł zapaliło przelot. Reszta (`border-start-end-radius`,
  // `border-end-start-radius` — narożniki od strony końca wiersza) zostaje
  // nieczytana i jest to POWIEDZIANE, nie przemilczane: wpis `NOT_COVERED`
  // „nothing stops a later lot from clipping the focus ring away".
  //
  // FIKSTURA RYSUJE JEDEN WIERSZ, więc `:first-child` i `:last-child` trafiają
  // dziś w TEN SAM element — para dalej mierzy co innego (dolny-końcowy
  // narożnik zamiast górnego-początkowego) i dalej pada osobno, bo pada
  // deklaracja, nie element. Selektor pozostaje jednoznaczny także przy
  // wielu wierszach: `:last-child` rozwiązuje się do jednego narysowanego
  // elementu przy każdej liczbie wierszy (pułapka nr 5 przyrządu — dwa
  // narysowane dopasowania o różnej wartości to awaria, nie werdykt).
  {
    id: "P2-01e",
    lot: "P2",
    position: 1,
    kind: "restyle",
    title: "and the same corner is cut on the row that meets the card's foot",
    contract:
      '.ui-craft/patterns.md — „Pattern: Settings section card and list plate", ograniczenie „A row of a list is not a card" (przepisanie jak przy P2-01c)',
    prototype: {
      file: "v3/screens/today.css",
      lines: "57-60",
      value:
        "`.td-list { border-radius: var(--radius-md); overflow: hidden }` — prototyp domyka DOLNY róg tym samym przycięciem, co górny; ta aplikacja domyka go ostatnim wierszem, precedens `packages/desktop-ui/src/styles.css` (`.meeting-result-list > li:last-child`)",
    },
    subject: {
      // BEZ SPACJI PRZY `>` — ta sama uwaga, co przy P2-01c: diagnostyka
      // `NOT_MEASURED` dzieli selektor po `\s+`, a samotny `>` nie jest
      // selektorem.
      selector:
        '#main-content [role="listbox"]:has([data-planned-row])>li:last-child',
      why: "the last row's own box, addressed through the same container as P2-01a and P2-01c so the three cannot drift apart; this pair exists because deleting the whole `> li:last-child` rule left P2-01c green while the card's foot went square",
      app: "packages/desktop-ui/src/today.module.css (.rows > li:last-child — border-end-end-radius)",
    },
    read: { property: "borderEndEndRadius" },
    expect: { kind: "token", token: "--radius-md" },
    status: "enforced",
  },
  // ── P2 · POZYCJA 2 — WIERSZ NIE JEST KARTĄ ────────────────────────────────
  // DRUGA POŁOWA TEZY, I BEZ NIEJ PRZYRZĄD JEST DZIURAWY: pozycja 1 spełnia się
  // także wtedy, gdy chrom stanie na POJEMNIKU, a na wierszu ZOSTANIE — czyli
  // przy podwójnym zaokrągleniu, którego prototyp nie ma na żadnym ekranie.
  {
    id: "P2-02",
    lot: "P2",
    position: 2,
    kind: "restyle",
    title: "the Today row gives its card corner back to the list",
    contract:
      '.ui-craft/patterns.md — „Pattern: Settings section card and list plate", ograniczenie „A row of a list is not a card"',
    prototype: {
      file: "v3/screens/today.css",
      lines: "61-66",
      value:
        "`.td-row` declares a grid, padding and `border-bottom: 1px solid var(--border-subtle)` — and NO border-radius at all; `.td-row:last-child { border-bottom: 0 }`",
    },
    subject: {
      selector: "#main-content [data-planned-row]",
      why: "the declared row attribute, the same one the layout gate's todayPlannedRows floor is anchored to (verify-renderer-layout.mjs:1134-1137); the app puts --radius-md on the ROW",
      app: "packages/desktop-ui/src/today.module.css (.row, .meeting — the card radius is gone and a border-bottom took its place)",
    },
    // „TEN ELEMENT NIE MA TEJ WŁASNOŚCI" ZAPISUJE SIĘ LITERAŁEM — ustalony
    // kształt tego rejestru, precedens `L1-01a` (`literal: "none"`) i P1-04
    // (`max-width` bez deklaracji). Dla promienia bez deklaracji wyliczona
    // wartość to dokładnie „0px", a nie „none".
    read: { property: "borderRadius" },
    expect: { kind: "literal", value: "0px" },
    status: "enforced",
  },

  // ── LOT L10 FAZY II — FORMATOWANIE DAT ────────────────────────────────────
  // POZYCJA 1 (wpis 1-7) — pasmo Dzisiaj mówi DZIEŃ TYGODNIA.
  //
  // TA PARA JEST PIERWSZYM PRZYRZĄDEM W TEJ MAPIE, KTÓRY PYTA O TREŚĆ DATY.
  // Rekonesans lotu przeszedł wszystkie 237 par obu map: ani jedna nie czyta
  // TREŚCI żadnego napisu daty. Dwie stoją na podmiotach tego lotu (D2-02a —
  // stopień pisma daty w paśmie, D3-11b — istnienie znacznika czasu w głowie
  // czytelni) i obie były zielone nad datą w formacie, którego prototyp nie
  // zna. Bramka nie kłamała: nikt jej o to nie zapytał.
  //
  // DLACZEGO `count` NA ELEMENCIE, A NIE PORÓWNANIE NAPISU. Napis w tym paśmie
  // to „Monday, 27 July 2026" — dzień tygodnia i data, czyli DWIE rzeczy, które
  // gniją, i to co dobę. Pytanie o KSZTAŁT („czy dzień tygodnia stoi we własnym
  // elemencie") jest pytaniem o REGUŁĘ i nie ma dnia, w którym zgnije.
  // Same słowa asertuje `packages/desktop-ui/test/i18n.test.ts` nad czystą
  // funkcją, dla której zegar jest WEJŚCIEM.
  //
  // CZEGO TA PARA NIE MÓWI, ODKĄD PRZEGLĄD ADWERSARIALNY TO ZMIERZYŁ: nie mówi,
  // że w tym elemencie stoi dzień tygodnia. Mówi, że element ISTNIEJE i JEST
  // WIDOCZNY — `count` filtruje odtąd przez `rendered()`, więc pusty albo
  // schowany CSS-em nośnik wraca 0 i para pada. Pusty nośnik był wcześniej
  // liczony jako 1. Odczyt SŁÓW reguły dnia stoi jedną powierzchnię dalej,
  // w L10-06 na głowie czytelni, i tam da się go zapisać bez kalendarza.
  {
    id: "L10-01",
    lot: 10,
    position: 1,
    kind: "restructure",
    title: "the Today band says which day of the week it is",
    contract: '.ui-craft/patterns.md — „Pattern: How a date reads"',
    prototype: {
      file: "v3/screens/today.js",
      lines: "129-130",
      value:
        '`crumbbar(\'<span class="cur">Today</span>\', \'<span class="when">Monday, 27 July 2026</span>\')` — dzień tygodnia i pełna nazwa miesiąca, nie „Aug 13, 2026"',
    },
    subject: {
      selector: ".surface-header [data-band-date] [data-band-weekday]",
      why: "the weekday in an element of its own — the only shape a gate can ask about the BAND without writing down a weekday name, which rots every morning; before this lot the band held one text node from `formatDate`. It is an existence-and-visibility reading, not a reading of the words: `count` filters by `rendered()`, so a lane collapsed to nothing fails, but a lane holding the wrong weekday passes. The words of the day rule are read literally one screen over, by L10-06",
      app: "packages/desktop-ui/src/TodaySurface.tsx (data-band-date)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  // ── LOT L11 (POWŁOKA) ────────────────────────────────────────────────────
  //
  // OSIEM PAR NA PIĘĆ POZYCJI, WSZYSTKIE W TEJ MAPIE I ANI JEDNA W TRASOWANEJ
  // — i to jest różnica wobec P1, L10 i C1, które musiały się rozciąć między
  // dwie mapy. Powód jest mechaniczny: przelot powłoki robi jedno `goto`
  // i ZERO kliknięć, a każdy podmiot tego lotu stoi na powierzchni lądowania,
  // bo powłoka jest tym, co widać na wszystkich trzynastu ekranach. Rachunek
  // krotności lotu („każdy wpis razy trzynaście”) jest więc jednocześnie
  // powodem, dla którego pary są tanie.
  //
  // CZEGO PRZED TYM LOTEM NIE MIERZYŁA ANI JEDNA Z 237 PAR: treści drugiej
  // linii kafla przestrzeni, obecności szewronu, czegokolwiek w stopce paska
  // bocznego, napisu na wyszukiwarce, istnienia znacznika zakładki i tego,
  // KTÓRY cel rysuje drugi poziom. Dwadzieścia siedem par enforced stało na
  // podmiotach powłoki i wszystkie pytały o FARBĘ albo o GEOMETRIĘ.
  //
  // NUMER `position` JEST NUMEREM WPISU W BRIEFIE, NIE LICZNIKIEM PAR — i to
  // jest poprawka po przeglądzie adwersarialnym. Brief lotu wymienia OSIEM
  // wpisów w tej kolejności (`plan-lotow-apka-vs-prototyp.md`): P-1, P-2, P-3,
  // P-4, P-6, P-7, P-10, P-11. Pary numerowały się wcześniej po kolei od 1 do
  // 6, przez co dwa wpisy bez pary (P-1 i P-6) wypadały z mianownika:
  // `positionsInBrief` deklarował 7 zamiast 8, a `VISUAL_LANGUAGE_POSITION_GAP`
  // był zaspokojony przez ZWĘŻENIE mianownika, nie przez zgłoszenie braków.
  // Konwencja wszystkich pozostałych lotów jest odwrotna i jednolita:
  // mianownik zostaje przy liczbie z briefu, a braki idą na
  // `positionsWithoutPairs`. Odtąd: 1 = P-1, 2 = P-2, 3 = P-3, 4 = P-4,
  // 5 = P-6, 6 = P-7, 7 = P-10, 8 = P-11.
  {
    id: "L11-01a",
    lot: 11,
    position: 2,
    kind: "restructure",
    title: "the workspace tile carries a glyph in its third track",
    contract: ".ui-craft/patterns.md — „Pattern: Application shell”",
    prototype: {
      file: "v3/app.js",
      lines: "645-652",
      value:
        '`<button class="ws-switch">… ${icon("chevDown")}</button>` — trzecim dzieckiem kafla jest szewron',
    },
    subject: {
      selector: ".workspace-switcher > svg",
      why: "the tile's third grid track, read as EXISTENCE and not as paint: before this lot it held `•••` (a span, not an svg), so the sheet rule that has carried the rotation for the chevron had NO child at all. One rendered match by construction — the avatar and the two-line meta are spans. WHAT THIS PAIR DOES NOT SAY, since the adversarial review of L11 measured it: it does not say WHICH glyph stands there. Nothing in the computed style distinguishes one drawing from another, and the icon set is deliberately re-cut between waves (`components/Icon.tsx`), so a pair pinning the path data would be an assertion that rots on a redraw. The title of this pair was „says it switches” and that was a claim it could not carry",
      app: "packages/desktop-ui/src/RealApp.tsx (workspace-switcher) i styles.css (.workspace-switcher > svg)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  {
    id: "L11-01b",
    lot: 11,
    position: 2,
    kind: "restyle",
    title: "and it is the size the prototype gives that glyph",
    contract: ".ui-craft/patterns.md — „Pattern: Application shell”",
    prototype: {
      file: "v3/app.css",
      lines: "181",
      value:
        "`.ws-switch > svg:last-child { width: 0.75rem; height: 0.75rem; color: var(--text-quaternary); }`",
    },
    subject: {
      selector: ".workspace-switcher > svg",
      why: "the same subject as L11-01a, read as a MEASUREMENT. This pair exists because the adversarial review found the lot citing 0.75rem on the prototype side while the sheet said `width: 0.85rem` and no pair could see the difference — a divergence a pair DOCUMENTS but cannot measure is a divergence nobody will notice being reintroduced. The prototype wins (the wave's standing ruling), so the sheet came down to 0.75rem in both axes and this pair holds it there. Width alone is read: the global `svg` rule gives 1rem in both axes, so a sheet that drops the override fails here at 16px against 12",
      app: "packages/desktop-ui/src/styles.css (.workspace-switcher > svg)",
    },
    read: { property: "width" },
    expect: { kind: "rem", value: 0.75 },
    status: "enforced",
  },
  {
    id: "L11-02",
    lot: 11,
    position: 2,
    kind: "restructure",
    title: "the workspace tile says where the data is",
    contract: '.ui-craft/patterns.md — „Pattern: Application shell"',
    prototype: {
      file: "v3/app.js",
      lines: "649",
      value:
        '`<span class="ws-sub">${icon("lock", "lock")}Local · encrypted</span>` — MIEJSCE, separator, STAN',
    },
    subject: {
      selector: ".workspace-switcher small",
      why: "the tile's second line — one rendered element. The pair reads the SHAPE of the sentence, never the word „encrypted”: the harness build persists in memory, so the true line there is „Local · session memory”, and demanding „encrypted” would be demanding a lie about this fixture. What this pair caught when it was first run is bigger than the wording it was written for — the line read „Data Home needs attention”, a FAULT REPORT, because `dataHome` is fetched only in the `local-alpha` channel and an unread slice fell into the same branch as a broken one. „Local · ” therefore discriminates against both old branches: the fault report has no place in it, and the healthy one spelled „Local only · ” instead. ONE STATE, NOT FOUR, AND THE TITLE NO LONGER PRETENDS OTHERWISE: it said „in every state” until the adversarial review measured that the gate only ever walks the developer preview, where `dataHome` is undefined. The other three branches — including the FAULTY one this fix was written for — are measured without a browser, over the pure function, in `packages/desktop-ui/test/shell-storage-line.interaction.test.ts`",
      app: "packages/desktop-ui/src/RealApp.tsx (workspaceStorageLine)",
    },
    read: { property: "text" },
    expect: { kind: "contains", value: "Local · " },
    status: "enforced",
  },
  // ── POZYCJA 3 (P-3) — STOPKA. DWIE PARY, BO JEDNA MIERZYŁA HACZYK ────────
  //
  // Stała tu JEDNA para: `count === 1` na `[data-sidebar-identity]`. Przegląd
  // adwersarialny złamał SAME SŁOWA — `{viewerName}` → `{"You"}`, struktura
  // nietknięta — i bramka wróciła ZIELONA w obu motywach. Para mierzyła
  // ATRYBUT, czyli haczyk testowy, a nie nazwanie czytelnika; ograniczenie,
  // które ten sam lot dopisał do kontraktu („An unavailable identity draws
  // nothing … no »You«, and never the workspace's initial in the person's
  // place"), nie miało ANI JEDNEGO przyrządu, a dokładnie zakazany napis
  // przechodził.
  //
  // TRZY PRZYRZĄDY ZAMIAST JEDNEGO, KAŻDY O CZYM INNYM:
  //   * `L11-03a` — element ISTNIEJE i jest narysowany (to, co lot dowiózł);
  //   * `L11-03b` — jego treścią NIE JEST zakazany zastępnik (asercja
  //     negatywna, ten sam kształt co `L11-04b` przy znaku przestrzeni);
  //   * `test/sidebar-identity.interaction.test.tsx` — treść RÓWNA SIĘ imieniu
  //     z `workspace.access`, inicjał jest jego pierwszą literą, a odczyt
  //     ODMÓWIONY nie rysuje ani napisu, ani kafla z literą. Tego ostatniego
  //     nie da się zapisać parą: bramka chodzi po jednej fiksturze, więc
  //     równość z imieniem byłaby wpisaniem fikstury do przyrządu, a gałęzi
  //     odmowy harness nie umie pokazać.
  {
    id: "L11-03a",
    lot: 11,
    position: 3,
    kind: "restructure",
    title: "the foot of the left column carries the reader's name",
    contract: ".ui-craft/patterns.md — „Pattern: Application shell”",
    prototype: {
      file: "v3/app.js",
      lines: "660-664",
      value:
        '`<div class="sidebar-foot">${avatar(ME)}<span class="who">Kacper</span>…` — imię czytelnika zajmuje wolną szerokość stopki (`v3/app.css:266`)',
    },
    subject: {
      selector: "[data-sidebar-identity]",
      why: "the reader's name, which did not exist in this shell before the lot — the foot carried the build channel and the storage kind instead. Existence only, and the marker is honest about being a marker: what it says is read by L11-03b next to it",
      app: "packages/desktop-ui/src/RealApp.tsx (sidebar-foot)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  {
    id: "L11-03b",
    lot: 11,
    position: 3,
    kind: "restructure",
    title: "and it never fills that place with „You”",
    contract: ".ui-craft/patterns.md — „Pattern: Application shell”",
    prototype: {
      file: "v3/app.js",
      lines: "660-664",
      value:
        '`<span class="who">Kacper</span>` — w stopce stoi IMIĘ, a prototyp nie zna zastępnika: nie ma tam ani „You”, ani litery przestrzeni',
    },
    subject: {
      selector: "[data-sidebar-identity]",
      why: "the WORDS in the identity slot, as a negative assertion — the shape L1-04b already uses against „I” on the workspace mark. „You” is the exact placeholder the contract forbids by name, and it is what the shell would print if somebody reached for a value when `snapshot.access` has nothing to give. The reader's real name is NOT written here: the gate walks one fixture, so an equality would be the fixture copied into the instrument. Equality against `workspace.access`, and the refused read that must draw nothing at all, are measured in `test/sidebar-identity.interaction.test.tsx`",
      app: "packages/desktop-ui/src/RealApp.tsx (sidebar-foot)",
    },
    read: { property: "text" },
    expect: { kind: "text", notValue: "You" },
    status: "enforced",
  },
  {
    id: "L11-04",
    lot: 11,
    position: 4,
    kind: "restyle",
    title: "the search control promises what ⌘K opens",
    contract: ".ui-craft/patterns.md — „Pattern: Application shell”",
    prototype: {
      file: "v3/app.js",
      lines: "653-655",
      value:
        '`<span class="lbl">Search and run…</span><span class="kbd">⌘K</span>` — „and run”, bo za tym klawiszem stoi paleta komend',
    },
    subject: {
      selector: ".search-control span:not(.search-shortcut)",
      why: "the visible label alone. `:not(.search-shortcut)` is load-bearing: the bare `.search-control span` matches the shortcut badge too, and two rendered matches with different text are `distinct.length > 1`, which is an instrument failure and not a verdict. The three other spellings of this promise (`aria-label` and two rail tips) come from the same constant and are asserted by the interaction suite, not by paint",
      app: "packages/desktop-ui/src/RealApp.tsx (SEARCH_CONTROL_LABEL)",
    },
    read: { property: "text" },
    expect: { kind: "contains", value: "and run" },
    status: "enforced",
  },
  {
    id: "L11-05",
    lot: 11,
    position: 6,
    kind: "restructure",
    title: "the tab carries nothing before its title",
    contract: ".ui-craft/patterns.md — „Pattern: Application shell”",
    prototype: {
      file: "v3/app.css",
      lines: "107-133",
      value:
        "`.tab` układa dwoje dzieci — tytuł (`.t`) i zamknięcie (`.x`) — i nie ma reguły na trzecie",
    },
    subject: {
      selector: ".shell-tab-kind",
      why: "the ring that stood before every tab title: 6.08 × 6.08 px, `1px solid currentColor`, radius 50%. Its name said „kind” and its value depended on nothing — the same ring on a destination, on a record and on a library reading. An absence pair, same shape as `L1-09b`",
      app: "packages/desktop-ui/src/RealApp.tsx (shell tab)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    id: "L11-06",
    lot: 11,
    position: 7,
    kind: "restructure",
    title: "Tasks draws a second level, the same way Projects does",
    contract: ".ui-craft/patterns.md — „Pattern: Navigation row”",
    prototype: {
      file: "v3/app.js",
      lines: "637-641",
      value:
        '`if (d.id === "tasks") return dest(d) + `<div class="nav-views">…`` obok tej samej gałęzi dla `projects` — jeden element, dwa cele',
    },
    subject: {
      selector: '.sidebar [data-nav-children="tasks"]',
      why: 'the attribute names the PARENT, and that is why it had to be added: `L1-02` already asserts `[data-nav-level="child"]` at least once and has been green off a single project since it was written, so it cannot tell „the tree has a second level” from „the tree has a second level UNDER TASKS”. The rows inside carry no `data-surface` (the fidelity probe clicks every one of those) and are not Tab stops, exactly like the project rows. WHAT THIS PAIR CANNOT SAY is whether a row OPENS what it names — the contract demands that in the same breath („they must actually OPEN what they name, or they are an affordance with no target"), and a count over the container is silent about it. That half is driven from the shell, by clicking the row and reading what the screen then shows, in `packages/desktop-ui/test/tasks-saved-view.interaction.test.tsx`',
      app: "packages/desktop-ui/src/RealApp.tsx (savedViewNavChildren)",
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
    app: "packages/desktop-ui/src/styles.css:1896-1899",
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
  {
    // ── PRZYRZĄD P2, POZYCJA 6, POŁOWA „DZISIAJ" ──────────────────────────────
    // BLIŹNIAK ZE SKRZYNKI STOI W `VISUAL_LANGUAGE_ROUTED_NOT_COVERED`, bo
    // tamten ekran jest za nawigacją. Jedna pozycja briefu, dwa wpisy, dwie
    // mapy — i to jest ten sam podział, co przy parach tego przyrządu.
    lot: "P2",
    position: 6,
    title: "the row's hairline separator, on Today",
    prototype:
      "v3/screens/today.css:61-65 (`.td-row { border-bottom: 1px solid var(--border-subtle) }`) + `:66` (`.td-row:last-child { border-bottom: 0 }`)",
    app: "packages/desktop-ui/src/today.module.css — od lotu L4 wiersz NIESIE `border-bottom: 1px solid var(--border-subtle)`, a `.rows > li:last-child > .row` je zeruje; niezmierzone zostaje, czy oba te zdania są prawdziwe",
    probe: "[data-planned-row]",
    why:
      "NIE „nie zdążyliśmy”, tylko „fikstura czyni asercję FAŁSZYWĄ”. Harness rysuje DOKŁADNIE " +
      "JEDEN wiersz planu (`dev/CollaborationHarness.tsx` — jedno zadanie `task.list` z `startAt` " +
      "wyprowadzonym z zegara), a jedyny wiersz JEST wierszem ostatnim — więc prototyp każe mu mieć " +
      "`border-bottom: 0`. Para asertująca `1px` byłaby czerwona wobec kodu ZGODNEGO z prototypem, " +
      "a para asertująca `0px` byłaby zielona nad listą bez ani jednego separatora. To zdanie jest " +
      "wyrażalne dopiero przy DWÓCH wierszach w JEDNEJ liście. Liczba z sondy niżej mówi, ile ich " +
      "dziś jest — wpis przestaje być prawdą w chwili, w której ta liczba przekroczy jeden.",
    exit:
      "drugie zadanie zaplanowane NA DZIŚ w `dev/CollaborationHarness.tsx` — a nie zadanie " +
      "nieplanowane, bo tamto zasila sekcję `approaching`, czyli DRUGĄ listę po jednym wierszu, " +
      "i niczego nie odblokowuje. OSTRZEŻENIE DLA LOTU, KTÓRY TO ZROBI: od L4 róg karty niesie " +
      "`<li>`, a `:first-child` i `:last-child` trzymają wtedy RÓŻNE promienie. Para napisana na " +
      "gołe `>li` (bez `:first-child`) wróci `NOT_MEASURED` przez `distinct.length > 1`, czyli " +
      "czerwienią, która czyta się jak defekt produktu. P2-01c celuje w `:first-child` właśnie " +
      "po to i rośnięcia fikstury się nie boi.",
    greenWrong:
      "Wiersz może dostać `border-bottom` na liście, która ZOSTAŁA z własnym odstępem — czyli " +
      "separator 2 px zamiast 1 px. Od lotu L4 ta droga NIE JEST już cicha: `P2-01d` czyta " +
      "`rowGap` pojemnika i pada, gdy odstęp wróci. Bez pomiaru zostaje samo istnienie kreski " +
      "i jej zniknięcie pod ostatnim wierszem — lista bez ANI JEDNEGO separatora dalej przejdzie " +
      "tu na zielono.",
  },
  {
    // ── PRZYRZĄD P2, POZYCJA 1 — DWA POZOSTAŁE POJEMNIKI DZISIAJ ─────────────
    // Rekonesans lotu L4 zmierzył, że żywych pojemników tej rodziny jest SZEŚĆ,
    // nie trzy: trzy z nich nie rysują się przy dzisiejszej fiksturze, więc
    // dokument przejścia ich nie zobaczył i plan ich nie policzył. Dwa z tych
    // trzech są na Dzisiaj i stoją tutaj; trzeci (druga skrzynka) w mapie
    // trasowanej.
    lot: "P2",
    position: 1,
    scope:
      "dwa z trzech pojemników Dzisiaj — pas „Approaching deadlines” i lista „In the calendar”",
    title: "two of the three Today list cards are never drawn, so never judged",
    prototype:
      "v3/screens/today.css:57-60 (`.td-list`, użyta przez `today.js` DWA razy — plan i „approaching”) + `:18-21` (`.td-meetings` — ta sama trójka deklaracji)",
    app: 'packages/desktop-ui/src/TodaySurface.tsx (`<ul className={styles.rows} role="listbox">` dla „Approaching deadlines”, `<ul className={styles.meetings}>` dla „In the calendar”) + today.module.css',
    probe: "[data-approaching-row]",
    why:
      "DWIE RÓŻNE PRZYCZYNY, obie o fiksturze, i obie były prawdą JESZCZE PRZED tym lotem — " +
      "wpis powstaje dopiero teraz, bo dopiero teraz jest co przeoczyć. (1) Pas „Approaching” " +
      "bierze `approachingUnplanned(...)`, które ODRZUCA każde zadanie z `startAt`, a jedyne " +
      "zadanie harnessu je ma; para wróciłaby `NOT_MEASURED`, czyli awarią przyrządu nad " +
      "poprawnym kodem. (2) Lista „In the calendar” nie ma źródła w migawce — spotkania schodzą " +
      "przez `client.getMeetingLoop`, a fikstura nie podaje ANI JEDNEGO. " +
      "DLACZEGO TO NIE JEST „i tak są pokryte regułą sąsiada”: pas „Approaching” dzieli z listą " +
      "planu klasę `.rows`, więc dziś jego zieleń byłaby przypadkowo prawdziwa, ale lista spotkań " +
      "od tego lotu ma WŁASNĄ deklarację `overflow` (przycina, gdy `.rows` nie przycinają) — " +
      "wspólnej reguły już nie ma i argument z sąsiada przestał obowiązywać.",
    exit:
      "(1) zadanie BEZ `startAt`, z `dueAt` w horyzoncie, w `dev/CollaborationHarness.tsx` — " +
      "TA SAMA jedna pozycja fikstury odblokowuje wpis o tacy Kalendarza w mapie trasowanej; " +
      "(2) co najmniej jedno spotkanie podane przez pętlę kalendarza scenariusza, czyli robota " +
      "klienta scenariuszowego, nie ekranu.",
    greenWrong:
      "Dwie z trzech kart Dzisiaj mogą zostać nieoddane albo oddane inaczej niż trzecia — " +
      "w szczególności lista spotkań może przestać przycinać albo zacząć przycinać lista planu, " +
      "co jest regresją WCAG 2.4.7 na pierścieniu ogniska — przy komplecie par P2 zielonych.",
  },
  {
    // ── PRZYRZĄD P2, POZYCJA 1 — ŚWIADOMY ROZJAZD Z PROTOTYPEM, BEZ STRAŻNIKA ─
    lot: "P2",
    position: 1,
    scope: "decyzja o NIEPRZYCINANIU dwóch pojemników tej rodziny",
    title: "nothing stops a later lot from clipping the focus ring away",
    prototype:
      "v3/screens/today.css:57-60 i v3/screens/calendar.css:200-203 — obie reguły deklarują `overflow: hidden`, a ta aplikacja świadomie ich w tym nie naśladuje",
    app: "packages/desktop-ui/src/today.module.css (`.rows` bez `overflow`) + calendar.module.css (`.tray` bez `overflow`)",
    probe: '[role="listbox"]:has([data-planned-row])',
    why:
      "Rozjazd jest ZMIERZONY, nie przeoczony: pierścień ogniska tej aplikacji jest listą cieni " +
      "ZEWNĘTRZNYCH (`packages/desktop-ui/src/tokens.css` — `--focus-ring`: 1 px akcentu, 3 px " +
      "rozrzutu, 14 px rozmycia, malowane regułą `:where(…):focus-visible`), a wiersz obu tych " +
      "list przylega do pudełka wyściółki pojemnika z luzem 0 px na czterech krawędziach " +
      "(prawdziwy Tab w Chromium, oba motywy). PROTOTYP NATRAFIŁ NA TO SAMO I PRZYCIĄŁ — " +
      "pierwsza wersja tego wpisu twierdziła, że „na to nie natrafił, bo maluje ognisko konturem " +
      "1 px poza pudełkiem (`v3/app.css:36-38`)”, i był to cytat urwany jedną linię przed " +
      "dowodem przeciwnym. Pełna reguła `v3/app.css:36-43` daje kontur 2 px przy offsecie 1 px " +
      "ORAZ `box-shadow: 0 0 0 5px var(--accent-quieter)`, wiersze prototypu są ogniskowalne " +
      "(`v3/screens/today.js:53`, `inbox.js:82`, `calendar.js:101`), a `.td-list` nie ma " +
      "wyściółki. Zmierzone w samym prototypie (`scratchpad/probe-proto-L4.mjs`, prawdziwy Tab, " +
      "Chromium 1440×900): `overflow: hidden/hidden`, wyściółka `0px 0px 0px 0px`, luz 0 px na " +
      "trzech krawędziach, świadek 8 px poza wierszem niewidoczny za krawędzią pojemnika mimo " +
      "`position: relative` i `z-index` z tej samej reguły. Podstawą rozjazdu jest więc WCAG " +
      "2.4.7 (wycięcie wymaganego wskaźnika jest naruszeniem przy każdym rozmiarze pierścienia), " +
      "a nie niewiedza prototypu. Czego BRAKUJE: (1) pary mówiącej „ten pojemnik dalej nie " +
      "przycina” — para na `overflow` z oczekiwaniem „visible” cytowałaby regułę prototypu " +
      "mówiącą „hidden”, czyli byłaby parą cytującą jedną rzecz i pilnującą innej, co ten " +
      "rejestr ma nazwane jako klasę defektu; (2) odczytu dwóch z czterech deklaracji lekarstwa " +
      "na róg — `P2-01c` czyta `border-start-start-radius` na `> li:first-child`, `P2-01e` czyta " +
      "`border-end-end-radius` na `> li:last-child`, a `border-start-end-radius` " +
      "i `border-end-start-radius` nie czyta nikt.",
    exit:
      "para czytająca PROSTOKĄT NAMALOWANEGO pierścienia, a nie wyliczony `overflow` — " +
      "`getBoundingClientRect` nie ma formy dla cienia, więc to jest warstwa w runnerze " +
      "(zrzut piksela albo zastępczy element mierzalny), czyli lot, a nie poprawka. Ta sama " +
      "warstwa spłaca wpis `LC1-01` o przyciętej szynie nawigacji.",
    greenWrong:
      "Ktokolwiek dopisze `overflow: hidden` do `.rows` albo `.tray` — na przykład wyrównując je " +
      "„do prototypu” albo do Skrzynki — wytnie pierścień ogniska pierwszego i ostatniego wiersza " +
      "razem z twardą krawędzią 1 px, czyli zrobi regresję WCAG 2.4.7, a przelot zostanie zielony: " +
      "P2-01c czyta promień rogu, nie przycięcie.",
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
  //
  // 50 → 51 PRZY PRZYRZĄDZIE P1 FAZY I, 2026-08-13, I NIE JEST TO POZYCJA
  // EKRANOWA: to PRZYRZĄD, który mierzy rzecz rządzącą dwunastoma ekranami
  // naraz — sufit kolumny czytelnej. `enforced` się NIE rusza, bo jedyna para
  // tego przyrządu w tej mapie (P1-01, Dzisiaj) jest oczekująca na lot L1
  // Fazy II; `pending` idzie 1 → 2 i P1-01 dołącza do L1-15a. Pozostałe
  // dwanaście pozycji briefu P1 stoi w mapie trasowanej — nie „bez pary",
  // tylko „nie w tej mapie", i tak są zapisane w `lots.P1` obu map.
  //
  // 51 → 55 I `notCovered` 3 → 4 PRZY PRZYRZĄDZIE P2 FAZY I, 2026-08-13, i tak
  // samo jak przy P1 NIE JEST TO POZYCJA EKRANOWA: to PRZYRZĄD nad rodziną
  // trzech ekranów (Dzisiaj, Skrzynka, Kalendarz), której chrom karty stoi
  // w tej aplikacji na WIERSZU zamiast na POJEMNIKU. `enforced` się nie rusza —
  // wszystkie cztery pary są oczekujące na lot L4 Fazy II; `pending` idzie
  // 2 → 6. Pozycje 3 i 4 briefu (Skrzynka) stoją w mapie trasowanej, pozycja 5
  // (taca Kalendarza) i 6 (separator wiersza) nie mają pary w ŻADNEJ z map
  // i są wypisane jako `NOT_COVERED` z osobnymi warunkami wyjścia — połowa
  // pozycji 6 tutaj, druga połowa i pozycja 5 w mapie trasowanej.
  //
  // `enforced` 49 → 50 I `pending` 6 → 5 PRZY LOCIE L1 FAZY II, 2026-08-14,
  // I NIE JEST TO ANI NOWA PARA, ANI ROZPAD ISTNIEJĄCEJ: `pairs` się nie rusza.
  // To jest DOSTAWA — P1-01 (sufit Dzisiaj) przestała być długiem i została
  // przerzucona na `enforced` w tym samym commicie, w którym `today.module.css`
  // dostało swoje 68rem. Kolejność jest wymuszona mechanicznie, nie stylistycznie:
  // para `pending`, która pasuje, kładzie przelot jako
  // `VISUAL_LANGUAGE_PENDING_ALREADY_MATCHES`.
  //
  // `L1-15a` ZOSTAJE `pending` I TO JEST DECYZJA LOTU L1, NIE PRZEOCZENIE.
  // Powód, przemierzony w tym locie, stoi przy samym wpisie i przy tokenie
  // w `packages/desktop-ui/src/tokens.css`; gdyby `--sidebar-width` się ruszył,
  // ta para musiałaby pójść na `enforced` tym samym commitem, czyli `pending`
  // 5 → 4 i `enforced` 50 → 51.
  //
  // 55 → 56 I `enforced` 50 → 51 PRZY LOCIE L10 FAZY II, 2026-08-14, i jest to
  // NOWA POZYCJA — pierwsza w tej mapie, która pyta o TREŚĆ napisu daty.
  // Rekonesans lotu przeszedł obie mapy: żadna z 237 par nie czytała treści
  // żadnej daty, a dwie stojące na podmiotach tego lotu były zielone nad
  // formatem, którego prototyp nie zna. `enforced`, a nie `pending`, bo lot
  // oddaje pozycję w tym samym drzewie: para była CZERWONA na kodzie sprzed
  // zmiany (0 elementów wobec 1) i zielona po niej. Pozostałe dwie pozycje
  // briefu (Odnowienia, Biblioteka) są w mapie trasowanej.
  // 56 → 57, `enforced` 51 → 56, `pending` 5 → 1 I `notCovered` 4 → 6 PRZY
  // LOCIE L4 FAZY II, 2026-08-14. Cztery ruchy, jedna dostawa, i żaden z nich
  // nie jest poluzowaniem:
  //
  //   • CZTERY PARY P2 IDĄ NA `enforced`. Chrom karty zszedł z wiersza na
  //     pojemnik na Dzisiaj, na Skrzynce i na tacy Kalendarza. Kolejność jest
  //     wymuszona mechanicznie: para `pending`, która pasuje, kładzie przelot
  //     jako `VISUAL_LANGUAGE_PENDING_ALREADY_MATCHES`.
  //   • `P2-01c` JEST PRZEPISANA, NIE ODPUSZCZONA, i pełny powód stoi przy
  //     niej: czytała `overflow` za prototypem, a lot zmierzył, że przycięcie
  //     na tej liście wycina pierścień ogniska razem z jego twardą krawędzią
  //     1 px. Czyta odtąd promień rogu na wierszu skrajnym — lekarstwo lotu R1
  //     tej samej aplikacji. Oczekiwanie i cytat pokazują znowu na to samo.
  //   • `P2-01d` JEST NOWA i zamyka jedyne ciche `greenWrong` całego przyrządu:
  //     separator 2 px złożony z krawędzi wiersza i odstępu pojemnika. Ani
  //     jedna z 243 par obu map nie czytała dotąd `gap`.
  //   • `notCovered` ROŚNIE O DWA i oba przyrosty są odmowami Z POMIAREM:
  //     dwa pojemniki Dzisiaj, których fikstura nie rysuje (a od tego lotu nie
  //     chroni ich już wspólna reguła CSS), oraz świadomy rozjazd
  //     z prototypem — dwie listy tej aplikacji NIE przycinają i nic nie
  //     pilnuje, żeby tak zostało.
  //
  // `pending` SCHODZI DO JEDNEGO: zostaje `L1-15a`, świadomie zostawiona przez
  // lot L1 z powodem zapisanym przy wpisie.
  //
  // 57 → 58 I `enforced` 56 → 57 PRZY NAPRAWIE PO PRZEGLĄDZIE LOTU L4,
  // 2026-08-14, I NIE JEST TO NOWA POZYCJA — to DRUGA POŁOWA POZYCJI 1, która
  // pojechała bez pomiaru. Lekarstwo na róg to cztery deklaracje w dwóch
  // regułach, a `P2-01c` czytała jedną: skasowanie całej reguły
  // `.rows > li:last-child` zostawiało przelot ZIELONY (inny selektor, inna
  // własność) nad kwadratowym rogiem u stopy karty. `P2-01e` czyta drugą
  // regułę. `positionsWithPairs` się nie rusza — ta sama klasa ruchu, co
  // 46 → 47 przy naprawie lotu D2.
  //
  // 56 → 62 I `enforced` 51 → 57 PRZY LOCIE L11 FAZY II, 2026-08-14. Sześć
  // nowych par, wszystkie `enforced`, bo lot oddaje wszystkie sześć pozycji
  // w tym samym drzewie; `pending` i `notCovered` się nie ruszają. Każda była
  // CZERWONA na kodzie sprzed zmiany i to jest jedyna rzecz, która czyni je
  // pomiarem: szewron nie istniał (0 wobec 1), druga linia mówiła „Local only ·
  // data on this device" (bez „Local · "), tożsamości nie było w DOM-ie
  // w ogóle (0 wobec 1), wyszukiwarka mówiła „Search" (bez „and run"),
  // znacznik zakładki stał (1 wobec 0), a drugi poziom pod Zadaniami nie
  // istniał (0 wobec 1).
  //
  // 62 → 64 I `enforced` 57 → 59 PO PRZEGLĄDZIE ADWERSARIALNYM L11. To nie są
  // nowe pozycje, tylko DWA ROZCIĘCIA par, które mierzyły mniej, niż mówił ich
  // tytuł, i obie dziury zostały ZMIERZONE, a nie wydedukowane:
  //   * `L11-01` („says it switches") pytało wyłącznie „czy w trzecim torze
  //     stoi jedno dziecko", a cytowało z prototypu 0,75 rem, których produkt
  //     nie miał (arkusz stał na 0,85). Rozcięte na `L11-01a` (istnienie)
  //     i `L11-01b` (rozmiar), arkusz zszedł do prototypowej wartości;
  //   * `L11-03` mierzyło ATRYBUT `data-sidebar-identity`. Złamanie samych
  //     słów (`{viewerName}` → `{"You"}`) zostawiało bramkę ZIELONĄ w obu
  //     motywach. Rozcięte na `L11-03a` (istnienie) i `L11-03b` (treść nie
  //     jest zakazanym zastępnikiem).
  // Obie nowe pary są `enforced`, bo obie stoją na kodzie, który ten lot już
  // oddał, i obie są czerwone na złamaniu, które je nazywa.
  //
  // DWIE NOTY WYŻEJ OPISUJĄ DWA ROZŁĄCZNE TORY TEJ SAMEJ FAZY, KTÓRE SPOTKAŁY
  // SIĘ DOPIERO PRZY SCALENIU, i żadna z nich nie jest prawdziwa od początku
  // do końca: tor L4/L9 liczył 56 → 57 → 58 nie wiedząc o locie L11, a tor
  // L11/L2 liczył 56 → 62 → 64 nie wiedząc o locie L4. FAKTYCZNY ŁAŃCUCH PO
  // SCALENIU, 2026-08-14, TO 56 → 66, `enforced` 51 → 65, `pending` 5 → 1,
  // `notCovered` 4 → 6, i te cztery liczby są POLICZONE Z TEJ MAPY po
  // scaleniu, a nie zsumowane z dwóch stron konfliktu — suma dwóch przyrostów
  // policzonych na tej samej bazie kłamie za każdym razem, gdy oba tory ruszą
  // ten sam wpis, a tu ruszyły: cztery pary `P2` przeszły z `pending` na
  // `enforced` po stronie L4, więc `pending` MALEJE mimo ośmiu par dołożonych
  // przez L11. Rozbicie przyrostu: +2 pary od L4/L9 (`P2-01d`, `P2-01e`),
  // +8 par od L11 (`L11-01a`…`L11-06`), zero par od L2 — ten lot oddaje oś
  // składu pasma w `title-band-action.mjs`, nie w tej mapie.
  pairs: 66,
  enforced: 65,
  pending: 1,
  notCovered: 6,
  lots: {
    11: {
      // OSIEM POZYCJI BRIEFU, PIĘĆ Z PARĄ, OSIEM PAR — patrz nota nad parami
      // L11-01a…L11-06. Mianownik jest liczbą wpisów, które brief wymienił
      // (P-1, P-2, P-3, P-4, P-6, P-7, P-10, P-11), a nie liczbą par: pozycja
      // 2 (P-2) niesie ich trzy, pozycja 3 (P-3) dwie.
      //
      // BYŁO TU `positionsInBrief: 7` PRZY BRIEFIE NA OSIEM i to była wada
      // księgowa, nie zaokrąglenie: dwa wpisy bez pary (P-1 i P-6) wypadały
      // z mianownika, więc `VISUAL_LANGUAGE_POSITION_GAP` domykał się przez
      // ZWĘŻENIE tego, co się liczy. Pozycja, o której nie mówi ŻADNA z dwóch
      // list, jest robotą, której nikt nie mierzy i nikt się nie przyznaje, że
      // ją pominął — a proza raportu lotu leży w scratchpadzie i nie przeżyje
      // tego drzewa. Trzy pozycje bez pary stoją odtąd na liście, każda
      // z powodem:
      //
      //   * P-1 (pozycja 1) — „nazwa przestrzeni to `h2` 21 px/700" jest
      //     BŁĘDEM POMIARU.
      //     W pasku bocznym nie ma ani jednego elementu nagłówkowego; `h2`
      //     21/700 należy do PUSTEGO STANU prawego inspektora
      //     (`.workspace-context h2`), którego nie rysuje żaden z 19
      //     zmierzonych stanów — `getComputedStyle` oddaje wartości także
      //     z wnętrza `display: none` i w to wpadł pomiar dokumentu przejścia.
      //     Para na tym podmiocie wróciłaby `NOT_MEASURED`, czyli czerwień
      //     jako awaria przyrządu nad poprawnym kodem. Realna robota, która
      //     z tego wpisu zostaje — waga 620 na `.workspace-switcher strong` —
      //     jest już ZMIERZONA i ZAREJESTROWANA gdzie indziej: przyrząd P5
      //     (`scripts/type-weight.mjs`) niesie ją jako dług z właścicielem
      //     „L5 (Faza II)". Wpisu nie mierzy tu ŻADNA para i dlatego stoi na
      //     liście niepokrytych, zamiast wypaść z rachunku.
      //   * P-6 (pozycja 5) — „brak ikony asystenta" CZYTA PROTOTYP ŹLE:
      //     ✦ w pasku górnym prototypu to `data-act="theme"`
      //     (`v3/app.js:555`), przełącznik motywu, a asystenta ten sam
      //     dokument przejścia klasyfikuje jako C-1 („prototyp przed
      //     domeną"). ALE ZERO PARA NIE ZNACZY ZERO ROBOTY, i tak to trzeba
      //     zapisać: pod tym numerem zostają trzy rzeczy, których ten lot NIE
      //     dowiózł i których nie mierzy żaden z sześciu przyrządów —
      //     przełącznik motywu, przełącznik prawego inspektora oraz KOLIZJA
      //     GLIFU `panel` („otwórz osobne okno" u nas, „przełącz inspektor"
      //     w prototypie: jeden rysunek, dwie czynności).
      //   * P-11 (mapa skrótów, pozycja 8) JEST dowieziona, a pary NIE MA
      //     i nie powinno jej być: mapa skrótów nie jest wyliczoną własnością
      //     CSS, więc przeglądarka nie ma czego z niej odczytać. Przyrządem
      //     jest `assert.deepEqual` nad CAŁYM zbiorem `[id, shortcut]`
      //     w `packages/desktop-preload/test/client.test.ts`, chodzące
      //     w `npm run check` na trzech systemach. Pozycja stoi na liście
      //     `positionsWithoutPairs` właśnie po to, żeby nie wypadła z OBU list
      //     — robota, o której żadna z nich nie mówi, jest robotą, której nikt
      //     nie mierzy i nikt się nie przyznaje, że ją pominął.
      positionsInBrief: 8,
      positionsWithPairs: 5,
      positionsWithoutPairs: [1, 5, 8],
    },
    10: {
      // Trzy pozycje briefu, po jednej na wpis rejestru: 1-7 (pasmo Dzisiaj),
      // 9-2 (wiersz Odnowień), 11-6 (głowa czytelni). Tutaj z parą stoi
      // WYŁĄCZNIE pozycja 1 — Dzisiaj jest powierzchnią lądowania, a przelot
      // powłoki nie klika. Pozycje 2 i 3 mają pary w mapie trasowanej i są tam
      // policzone; „bez pary w TEJ mapie" nie znaczy „bez dowodu".
      positionsInBrief: 3,
      positionsWithPairs: 1,
      positionsWithoutPairs: [2, 3],
    },
    P2: {
      // Sześć pozycji briefu P2, rozciętych między dwie mapy tak samo jak przy
      // locie C1 i przyrządzie P1: pozycje 1-2 tutaj (Dzisiaj = powierzchnia
      // LĄDOWANIA, mierzalna bez kliknięcia), pozycje 3-4 w mapie trasowanej
      // (Skrzynka = za nawigacją), pozycje 5 i 6 bez pary w obu mapach.
      positionsInBrief: 6,
      positionsWithPairs: 2,
      positionsWithoutPairs: [3, 4, 5, 6],
    },
    P1: {
      // Brief P1 ma trzynaście pozycji, po jednej na ekran, i ta sama
      // trzynastka jest zadeklarowana w mapie trasowanej. Tutaj z parą stoi
      // WYŁĄCZNIE pozycja 1 (Dzisiaj), bo przelot powłoki nie klika i w DOM-ie
      // nie ma żadnego innego ekranu. Dwanaście pozostałych jest w
      // `VISUAL_LANGUAGE_ROUTED_EXPECTED.lots.P1`.
      positionsInBrief: 13,
      positionsWithPairs: 1,
      positionsWithoutPairs: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    },
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
// `visualLanguagePairs` (`scripts/verify-renderer-layout.mjs:3321-3637`) robi
// `page.goto(HARNESS)`, czeka 1500 ms i mierzy. NIC nie klika. `HARNESS` to
// `?surface=collaboration` (`:81`), czyli powłoka na powierzchni lądowania,
// przy 1440×900, w dwóch motywach. Pipeline, Renewals, ekrany rekordu, Library
// i Ustawienia leżą ZA nawigacją, której ten przelot nie wykonuje.
//
// Gdyby te pary trafiły do `VISUAL_LANGUAGE_PAIRS`, przelot zwróciłby dla
// każdej z nich `VISUAL_LANGUAGE_NOT_MEASURED` — bo „selektor nie trafił w nic"
// jest tam AWARIĄ PRZYRZĄDU w OBU statusach (`:3462-3470`, `:3579-3585`), a
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
//      • cel nawigacji  — `.nav-item[data-surface="<id>"]`.click()  (`:2712-2722`)
//      • soczewka       — `[data-layout="<label>"]`.click()         (`:906-916`)
//      • rekord         — dblclick na `[data-project-row]`, `[data-task-row]`
//                         albo `[data-pipeline-card]`               (`:984-1001`)
//      • zakładka rekordu — `[role="tab"][data-record-tab="<label>"]`.click()
//                                                                   (`:1005-1016`)
//      • Ustawienia     — `[data-settings-entry]`.click(), a wyjście
//                         `[data-settings-back]`; wejście PODMIENIA lewą
//                         kolumnę, więc Ustawienia idą OSTATNIE albo z powrotem
//                         (`:748-771`, `:2724-2742`)
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
// Normalizacja `_title_1kitm_195` → `_title` w `signature()` (`:3373-3383`)
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
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:294-299",
    },
    read: { property: "backgroundImage" },
    // Dziś `background: var(--text-link)`, a `--text-link` jest w tej aplikacji
    // aliasem tekstu drugorzędnego (tokens.css:272) — czyli neutralną szarością
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
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:294-299",
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
      why: "CSS Module class; the app paints it var(--text-link), which in THIS app aliases the secondary text ramp (tokens.css:272) — grey, not blue",
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:415-419",
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
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:335-348",
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
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:555-567",
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
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:255-262",
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
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:569-580",
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
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:569-580",
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
      // PRZEPIĘTE W LOCIE R3 z tego samego powodu, co para `D6-04a` na
      // Organizacjach: pasmo wyszło z przewijanego pudełka, więc
      // `[data-pipeline-surface]` — atrybut TEGO pudełka — przestał być jego
      // przodkiem. Kotwicą jest `main[data-surface]`, deklaracja obejmująca oba
      // pasma i treść pod nimi; `main` konieczne, bo ten sam atrybut niesie
      // pozycja nawigacji.
      selector: 'main[data-surface="pipeline"] .surface-header button',
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
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:523-545",
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
      // Ta sama zmiana kotwicy co wyżej: kontrolka „Stages" stoi w PASKU
      // WIDOKU, a ten jest od lotu R3 rodzeństwem przewijanego pudełka.
      selector: 'main[data-surface="pipeline"] [class*="_stagesLink_"]',
      why: "CSS Module class; the app declares 1px solid var(--border-subtle) at rest",
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:88-102",
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
      app: "packages/desktop-ui/src/pipeline/pipeline.module.css:335-344",
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
      app: "packages/desktop-ui/src/renewals/renewals.module.css:420-433",
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
      why: "CSS Module class on the button that leads to the deal (RenewalsSurface.tsx:159-169)",
      app: "packages/desktop-ui/src/renewals/renewals.module.css:440-447",
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
      app: "packages/desktop-ui/src/renewals/renewals.module.css:100-102",
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
      why: "counted; the app types ▲ ◷ ■ as text (RenewalsSurface.tsx:76-80). The trailing underscore keeps _leadMark_ out — class matching is case sensitive",
      app: "packages/desktop-ui/src/renewals/renewals.module.css:201-208",
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
      why: "counted; the row's own buttons (RenewalsSurface.tsx:319-326, :406-413) render text only",
      app: "packages/desktop-ui/src/renewals/renewals.module.css:583-602",
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
      app: "packages/desktop-ui/src/renewals/renewals.module.css:514-524",
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
      app: "packages/desktop-ui/src/renewals/RenewalsSurface.tsx:817-846",
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
      app: "packages/desktop-ui/src/renewals/RenewalsSurface.tsx:797-799",
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
      why: "counted; aria-expanded is stamped and paints nothing (RenewalsSurface.tsx:1070-1077)",
      app: "packages/desktop-ui/src/renewals/renewals.module.css:128-140",
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
      why: 'declaration, not class name: RenewalsSurface.tsx:233 stamps data-renewal-row on every row. A [class*="_row_"] subject was MEASURED as unsafe — twenty distinct _row_ classes exist across the built chunks — and the declaration costs nothing. The app pads var(--space-3) block-wise',
      app: "packages/desktop-ui/src/renewals/renewals.module.css:156-168",
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
      app: "packages/desktop-ui/src/renewals/renewals.module.css:112-119",
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
      why: "same shape as L4-01a (TaskRecordScreen.tsx:512); the app gives it --text-2xl",
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
    // „oczekująca, a pasuje". Waga 620 kontra 600 była jawnie POZA zakresem
    // lotu 4 („nie rusza wag pisma 580/590/620") — i to zdanie ZOSTAJE, bo
    // opisuje, dlaczego ta para trzyma się trackingu. Od 2026-08-13 waga tego
    // samego podmiotu MA jednak własny pomiar i własnego właściciela:
    // `P5-01b` czyta `fontWeight` na tym samym selektorze i pyta o
    // przynależność do skali z `tokens.css`, a nie o liczbę 600. Ta para nie
    // przejmuje tego zdania i nie musi — dwie własności, dwie pozycje, dwa
    // przełączniki. Zostaje tracking: v3 deklaruje -0.022em, aplikacja nie
    // deklaruje nic.
    contract: ".ui-craft/tokens.md (Type)",
    prototype: {
      file: "v3/app.css",
      lines: "651",
      value: "`.rec-title { letter-spacing: -0.022em }`",
    },
    route: { surface: "pipeline", openRecord: "[data-pipeline-card]" },
    subject: {
      selector: '[data-record-kind="opportunity"] #surface-title',
      why: "OpportunityRecordScreen.tsx:498; the sheet declares no letter-spacing, so it computes „normal”",
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
      why: "the app renders one <p> with a middle dot (TaskRecordScreen.tsx:601-614), so display computes block",
      app: "packages/desktop-ui/src/record/task-record.module.css:173-183",
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
      app: "packages/desktop-ui/src/record/task-record.module.css:122-126",
    },
    read: { property: "backgroundColor" },
    expect: { kind: "not", value: "rgba(0, 0, 0, 0)" },
    risk: 'renderuje się WYŁĄCZNIE, gdy `operationalState !== "actionable"` (TaskRecordScreen.tsx:531); jeśli fikstura otwiera zadanie zwyczajne, para wróci NOT_MEASURED i to jest fakt o fiksturze, nie o selektorze',
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
      why: "CSS Module class; the app paints var(--status-info), which is the blue ramp (tokens.css:324) — a hue judgeAccent will not accept",
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
      app: "packages/desktop-ui/src/record/task-record.module.css:279-291",
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
    // 1. `.offers` is drawn behind a TAB (`OpportunityRecordScreen.tsx:816` —
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
      app: "packages/desktop-ui/src/record/task-record.module.css:357-390",
    },
    read: { property: "borderTopWidth" },
    expect: { kind: "literal", value: "1px" },
    // ŚLEPOTA POTWIERDZONA I WYCENIONA. `.list` nie jest pojemnikiem, który
    // rysuje się pusty: `TaskRecordScreen.tsx:733` montuje go dopiero przy
    // niepustym `children`, a `:768` dopiero gdy istnieje jakakolwiek zależność
    // — w obu pustych przypadkach na ekran idzie `<p class="note">`. JEDYNE
    // zadanie harnessu przeglądarkowego (`CollaborationHarness.tsx`, odczyt
    // `work.overview`) nie ma ani rodzica, ani jednej krawędzi zależności, więc
    // pojemnik nie powstaje ANI RAZU. To jest ta sama pustka, którą zmierzył
    // i opisał `task-record.module.css:401-409`.
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
      app: "packages/desktop-ui/src/record/task-record.module.css:306",
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
      app: "packages/desktop-ui/src/styles.css:6659-6662, :597-601",
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
      app: "packages/desktop-ui/src/styles.css:6809-6821",
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
      app: "packages/desktop-ui/src/styles.css:6731-6738, NotesReading.tsx",
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
      app: "packages/desktop-ui/src/styles.css:7044-7047",
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
      app: "packages/desktop-ui/src/SettingsSurface.tsx:981-1008, styles.css:7754-7808",
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
      app: "packages/desktop-ui/src/RealApp.tsx:3496-3498, styles.css:1415-1420",
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
      why: "global class in RealApp.tsx:3465; styles.css has NO rule naming .settings-mode-column or .settings-mode-section at all",
      app: "packages/desktop-ui/src/RealApp.tsx:3376-3393, styles.css:1122-1126",
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
      // `styles.css:8309-8315` maluje `.settings-control.support-report-action >
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
      why: "the two buttons Settings #4 names (SettingsSurface.tsx:2221-2230 export to Markdown, :2305-2314 choose a vault folder); both now carry .primary-button, which styles.css:8629 excludes by name from the generic secondary paint — before lot 6 that rule painted them --action-secondary-bg and 0 of 2 carried the accent",
      app: "packages/desktop-ui/src/styles.css:8629-8641 (the secondary paint and its two named exceptions), :8699-8705 (the accent that already existed on this screen and made the loose version pass), :724-727 (.primary-button), SettingsSurface.tsx:2221-2230, :2305-2314",
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
      why: "global class; today the prose sits in a 1fr track beside a 21rem control track (styles.css:7826-7832) and declares no measure of its own",
      app: "packages/desktop-ui/src/styles.css:7844-7849",
    },
    read: { property: "maxWidth" },
    expect: { kind: "token", token: "--surface-read" },
    risk: "jeżeli lot przeniesie wyjaśnienie pod kontrolkę POD NOWĄ KLASĄ, `.settings-copy > p` przestanie istnieć i para wróci NOT_MEASURED zamiast MATCH — to jest ta sama pułapka, dla której L1-14 nie dostała pary",
    // PRZEŁĄCZONE PRZY ODBIORZE, 2026-08-07: `maxWidth: 736px` = 46 rem =
    // rozwiązane `var(--surface-read)`, w obu motywach. Ryzyko wyżej NIE
    // ZASZŁO — lot zostawił klasę i zapisał, że zostawił ją świadomie, więc
    // para mierzy element, a nie swoją własną nieobecność. Różnica wobec v3
    // (notka stoi NAD kontrolką, nie POD) jest zapisana przy regule
    // w `styles.css:8186-8191` i ta para jej nie dotyczy: mierzy MIARĘ, a nie
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
  //     RÓŻNE wartości (`verify-renderer-layout.mjs:4042-4053`, `distinct
  //     .length > 1`). Zmierzone w Ustawieniach na 1440 px: sześć narysowanych
  //     kontrolek, `flex-grow` = „0" we WSZYSTKICH sześciu i `max-width`
  //     = „256px" we wszystkich sześciu, czyli jedna wartość i pomiar.
  //   * „podmioty nie są DOSIĘGALNE tym spacerem" — Ustawienia są pełnoprawnym
  //     przystankiem przez `route: { settingsMode: true }`
  //     (`verify-renderer-layout.mjs:6148-6173`, wyjęte spod `ROUTED_ARRIVAL`
  //     w `:5949`), i sześć par L6-* mierzy tam od Fazy 3. `.railSelect` też
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
      // `record/record-screen.module.css:70`.
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
      // `SettingsSurface.tsx:1906-1919`), 124,8 px przy tafli 1098 px.
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
      // JEDNĄ wartość i pomiar (`verify-renderer-layout.mjs:4042-4053`).
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
      // PRZEPIĘTE W LOCIE R3, jak `D6-04a` na Organizacjach: przełącznik układu
      // stoi w PASKU WIDOKU, a ten wyszedł z przewijanego pudełka, więc
      // `[data-people-surface]` przestał być jego przodkiem.
      selector: 'main[data-surface="people"] [class*="_switch_"] svg',
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
      // PRZEPIĘTE W LOCIE R3, jak `D6-04a` na Organizacjach: przełącznik układu
      // stoi w PASKU WIDOKU, a ten wyszedł z przewijanego pudełka, więc
      // `[data-people-surface]` przestał być jego przodkiem.
      selector: 'main[data-surface="people"] [class*="_switch_"] svg',
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

  // ══ FAZA I, PRZYRZĄD P1 — DWANAŚCIE EKRANÓW ZA NAWIGACJĄ ══════════════════
  // Pozycje 2-13 briefu P1. Pozycja 1 (Dzisiaj) stoi w mapie powłoki.
  // Wszystkie dwanaście czytają JEDNĄ własność — `maxWidth` — na nośniku treści
  // ekranu; różnią się wyłącznie liczbą, której żąda prototyp, i to jest cała
  // treść tego przyrządu: dziś tę liczbę deklaruje POWŁOKA raz, dla wszystkich.
  //
  // DLACZEGO PODMIOTEM JEST NOŚNIK TREŚCI, A NIE KORZEŃ EKRANU. Prototyp
  // klamruje JEDNO pudełko na ekran (`.scroller > .td`, `> .ib`, `> .rn`,
  // `> .mt`, `> .cal-screen`, `> .record`, `.st`), a ta aplikacja klamruje
  // KAŻDE dziecko nośnika przewijania z osobna — i kontrakt nazywa ten zbiór
  // wprost: `.surface-scroll > *:where(:not(.surface-header, .view-band))`
  // (`styles.css:6196-6200`). Odczyt na KORZENIU został zmierzony 2026-08-13
  // i odrzucony, bo daje CZTERY fałszywe werdykty z trzynastu: Projekty,
  // Pipeline, Organizacje i Ludzie wyliczają na korzeniu „none" i byłyby
  // zielone przy treści zaklamrowanej do 72 rem, a Ustawienia — jedyny ekran
  // DZIŚ POPRAWNY — wyliczają na korzeniu „none" i byłyby czerwone.
  //
  // WZORZEC, KTÓRY TE PARY ZAKŁADAŁY PO STRONIE L1: korzeń DEKLARUJE zmienną,
  // dzieci KONSUMUJĄ — tak, jak robiły to przed tym lotem jako jedyne
  // Ustawienia (`.settings-surface { --surface-measure: 74rem }`). Para
  // przypięta do konsumenta robi się zielona, kiedy L1 powtórzy ten wzorzec,
  // BEZ przepisywania pary. Druga droga (literał `max-width` na korzeniu, jak
  // w prototypie) zostawiłaby jedenaście par czerwonych mimo poprawnego
  // wyglądu — decyzja była zapisana TUTAJ, żeby nikt nie odkrywał jej
  // z czerwonej bramki.
  //
  // LOT L1 POSZEDŁ TĄ DROGĄ I ANI JEDNA PARA NIE ZOSTAŁA PRZEPISANA POD
  // DOSTAWĘ, 2026-08-14. Jedenaście korzeni deklaruje zmienną
  // (`today/calendar/inbox/tasks/pipeline/organizations/people/renewals`
  // w swoich modułach, `.project-surface` i `.settings-surface` w arkuszu
  // globalnym, `.screen` w module rekordu), Spotkania zostają przy literale na
  // własnym korzeniu, bo tego wymaga ICH podmiot (nota przy P1-10). Wszystkie
  // dwanaście par tej mapy są dziś `enforced`; selektory, `read` i `expect` są
  // co do znaku te same, co w Fazie I. Sprawdzone POMIAREM, a nie z lektury:
  // `--surface-measure: none` na korzeniu daje dziecku wyliczone `max-width:
  // "none"`, czyli dokładnie to, czego żąda `expect: { kind: "literal", value:
  // "none" }` — zmienna nie jest zarejestrowana przez `@property` z typem
  // `<length>` (`grep -rn "@property" packages/desktop-ui/src` → zero trafień),
  // więc `none` nie wypada przy wyliczaniu.
  {
    id: "P1-02",
    lot: "P1",
    position: 2,
    kind: "restyle",
    title: "Calendar declares its own reading measure",
    contract:
      '.ui-craft/patterns.md — „Pattern: Surface title band", akapit „Content stays in the reading column"',
    prototype: {
      file: "v3/screens/calendar.css",
      lines: "17",
      value:
        "`.cal-screen { max-width: 84rem; padding: var(--space-6) }` — NAJSZERSZY ekran prototypu i jedyny szerszy od dzisiejszej powłoki",
    },
    route: { surface: "calendar" },
    subject: {
      selector:
        '#main-content [class*="_calendar_"] > *:not(.surface-header):not(.view-band)',
      why: "the clamp carrier on the refusal branch too: measured 2026-08-13, both themes — THREE rendered children (div._calendarState, div._week, section._section), ONE distinct maxWidth (1152px). The scenario client refuses the calendar (client/scenario-client.ts:81-94) and this subject is drawn anyway, which is why this screen is COVERED and not filed as not-covered",
      app: "packages/desktop-ui/src/CalendarSurface.tsx:639",
    },
    read: { property: "maxWidth" },
    expect: { kind: "rem", value: 84 },
    status: "enforced",
  },
  {
    id: "P1-03",
    lot: "P1",
    position: 3,
    kind: "restyle",
    title: "Inbox declares its own reading measure",
    contract:
      '.ui-craft/patterns.md — „Pattern: Surface title band", akapit „Content stays in the reading column"',
    prototype: {
      file: "v3/screens/inbox.css",
      lines: "8",
      value:
        "`.ib { max-width: 68rem; padding: var(--space-6) var(--space-6) 5.5rem }`",
    },
    route: { surface: "inbox" },
    subject: {
      selector:
        '#main-content [class*="_inbox_"] > *:not(.surface-header):not(.view-band)',
      why: "measured 2026-08-13, both themes — THREE rendered children (section._section ×2, p._note), ONE distinct maxWidth (1152px)",
      app: "packages/desktop-ui/src/InboxSurface.tsx:282",
    },
    read: { property: "maxWidth" },
    expect: { kind: "rem", value: 68 },
    status: "enforced",
  },
  {
    id: "P1-04",
    lot: "P1",
    position: 4,
    kind: "restyle",
    title: "Tasks stands under no reading measure at all",
    contract:
      '.ui-craft/patterns.md — „Pattern: Surface title band", akapit „Content stays in the reading column"',
    prototype: {
      file: "v3/screens/tasks.css",
      lines: "1-210",
      value:
        "ANI JEDNEJ reguły korzenia z `max-width`: `screens/tasks.js:533` wstawia treść WPROST do `.scroller`, a jedyne `max-width` w tym pliku stoją na podpisie widoku (`:64`, 52rem), na głowie kalendarza (`:142`, 56rem) i na karcie (`:186`, 100%)",
    },
    route: { surface: "tasks" },
    subject: {
      selector:
        "#main-content [data-tasks-surface] > *:not(.surface-header):not(.view-band)",
      why: "measured 2026-08-13, both themes — ONE rendered child (div._list), maxWidth 1152px. `data-tasks-surface` is written at FOUR sites in TasksSurface.tsx (:371 refusal, :417 record-unavailable, :425 open record, :689 the list) and they are MUTUALLY EXCLUSIVE branches of one ternary chain, which is why the probe read one carrier on this stop and one on the record stop — never two at once",
      app: "packages/desktop-ui/src/tasks/TasksSurface.tsx:751 (gałąź listy — ta, którą mierzy ten przystanek); :433, :479 i :487 to trzy pozostałe gałęzie tego samego ternary",
    },
    read: { property: "maxWidth" },
    // `literal: "none"`, A NIE LICZBA I NIE ZERO. „Brak sufitu" jest w tym
    // przyrządzie wartością WYRAŻALNĄ, bo wyliczony `max-width` na elemencie
    // bez deklaracji to dokładnie napis „none" — ten sam kształt, co L1-01a
    // („element NIE MA tej własności") i D1-01b (pasmo bez sufitu).
    expect: { kind: "literal", value: "none" },
    status: "enforced",
  },
  {
    id: "P1-05",
    lot: "P1",
    position: 5,
    kind: "restyle",
    title: "Projects stands under no reading measure at all",
    contract:
      '.ui-craft/patterns.md — „Pattern: Surface title band", akapit „Content stays in the reading column"',
    prototype: {
      file: "v3/screens/projects.css",
      lines: "1-270",
      value:
        "brak reguły korzenia z `max-width` (`screens/projects.js:353` wstawia treść wprost do `.scroller`); jedyny sufit w tym pliku to `--surface-read` na opisie projektu (`:259`), czyli sufit AKAPITU",
    },
    route: { surface: "projects" },
    subject: {
      selector:
        ".surface-scroll.project-surface > *:not(.surface-header):not(.view-band)",
      why: "measured 2026-08-13, both themes — ONE rendered child (section._collection), maxWidth 1152px. Two hand-written global classes and not a module hash, so the selector needs no `[class*=]`",
      app: "packages/desktop-ui/src/Wave2Surfaces.tsx:646 i :773",
    },
    read: { property: "maxWidth" },
    expect: { kind: "literal", value: "none" },
    status: "enforced",
  },
  {
    id: "P1-06",
    lot: "P1",
    position: 6,
    kind: "restyle",
    title: "Pipeline stands under no reading measure at all",
    contract:
      '.ui-craft/patterns.md — „Pattern: Surface title band", akapit „Content stays in the reading column"',
    prototype: {
      file: "v3/screens/pipeline.css",
      lines: "1-200",
      value:
        "ani jednego `max-width` w całym pliku; korzeniem jest `.pp-board` (`screens/pipeline.js:421`) i nie deklaruje sufitu — tablica lejka ma iść na całą kanwę",
    },
    route: { surface: "pipeline" },
    subject: {
      selector:
        "#main-content [data-pipeline-surface] > *:not(.surface-header):not(.view-band)",
      why: "measured 2026-08-13, both themes — ONE rendered child (div._scroller[data-scrolls-horizontally]), maxWidth 1152px. This is the pair that says the reading clamp is what makes the horizontal board scroll at 1440 px in the first place",
      app: "packages/desktop-ui/src/pipeline/PipelineSurface.tsx:804 (gałąź dostawy), :840, :864 i :964 to pozostałe gałęzie",
    },
    read: { property: "maxWidth" },
    expect: { kind: "literal", value: "none" },
    status: "enforced",
  },
  {
    id: "P1-07",
    lot: "P1",
    position: 7,
    kind: "restyle",
    title: "Organizations stands under no reading measure at all",
    contract:
      '.ui-craft/patterns.md — „Pattern: Surface title band", akapit „Content stays in the reading column"',
    prototype: {
      file: "v3/screens/crm.css",
      lines: "1-120",
      value:
        "brak reguły korzenia z `max-width` (`screens/crm.js:388` wstawia treść wprost do `.scroller`); jedyne `max-width` w tym pliku to zapytanie kontenerowe `@container (max-width: 62rem)` (`:73`), czyli PRÓG, nie sufit",
    },
    route: { surface: "organizations" },
    subject: {
      selector:
        "#main-content [data-organizations-surface] > *:not(.surface-header):not(.view-band)",
      why: "measured 2026-08-13, both themes — THREE rendered children (div._list, section.strategic-create-panel, div.strategic-layout), ONE distinct maxWidth (1152px)",
      app: "packages/desktop-ui/src/StrategicDepthSurface.tsx:749 i :876",
    },
    read: { property: "maxWidth" },
    expect: { kind: "literal", value: "none" },
    status: "enforced",
  },
  {
    id: "P1-08",
    lot: "P1",
    position: 8,
    kind: "restyle",
    title: "People stands under no reading measure at all",
    contract:
      '.ui-craft/patterns.md — „Pattern: Surface title band", akapit „Content stays in the reading column"',
    prototype: {
      file: "v3/screens/crm.css",
      lines: "1-120",
      value:
        "ten sam plik i ta sama nieobecność, co przy Organizacjach — prototyp rysuje oba ekrany CRM jedną rodziną klas (`screens/crm.js:550`)",
    },
    route: { surface: "people" },
    subject: {
      selector:
        "#main-content [data-people-surface] > *:not(.surface-header):not(.view-band)",
      why: "measured 2026-08-13, both themes — ONE rendered child (div._list), maxWidth 1152px",
      app: "packages/desktop-ui/src/people/PeopleSurface.tsx:579 i :636",
    },
    read: { property: "maxWidth" },
    expect: { kind: "literal", value: "none" },
    status: "enforced",
  },
  {
    id: "P1-09",
    lot: "P1",
    position: 9,
    kind: "restyle",
    title: "Renewals declares its own reading measure",
    contract:
      '.ui-craft/patterns.md — „Pattern: Surface title band", akapit „Content stays in the reading column"',
    prototype: {
      file: "v3/screens/renewals.css",
      lines: "9",
      value: "`.rn { max-width: 68rem; padding: var(--space-6) }`",
    },
    route: { surface: "renewals" },
    subject: {
      selector:
        "#main-content [data-renewals-surface] > *:not(.surface-header):not(.view-band)",
      why: "measured 2026-08-13, both themes — THREE rendered children (section._section ×3: due, watching, closed), ONE distinct maxWidth (1152px)",
      app: "packages/desktop-ui/src/renewals/RenewalsSurface.tsx:760 i :885",
    },
    read: { property: "maxWidth" },
    expect: { kind: "rem", value: 68 },
    status: "enforced",
  },
  {
    id: "P1-10",
    lot: "P1",
    position: 10,
    kind: "restyle",
    title: "Meetings declares the measure the prototype asks for, not 94rem",
    contract:
      '.ui-craft/patterns.md — „Pattern: Surface title band", akapit „Content stays in the reading column"',
    prototype: {
      file: "v3/screens/meetings.css",
      lines: "11",
      value: "`.mt { max-width: 74rem; padding: var(--space-6) }`",
    },
    route: { surface: "meetings" },
    subject: {
      // KORZEŃ, A NIE DZIECKO, I TO JEST JEDYNY TAKI PODMIOT W P1 —
      // ZMIERZONY, NIE WYBRANY DLA WYGODY. Spotkania są jedynym ekranem tej
      // aplikacji, który klamruje NA SOBIE (`styles.css:4902`, dziś
      // `max-width: 74rem`, przed lotem L1 `94rem` — literał, który ten lot
      // zmienił W MIEJSCU), a jego dziecko `.meeting-body` wylicza „none".
      // Para na dziecko porównywałaby „none" z `rem 74`, a to zwraca
      // NOT_MEASURED (`verify-renderer-layout.mjs:4046-4055`) — czyli awarię
      // przyrządu w miejscu, w którym należy się werdykt.
      selector: "#main-content .meeting-surface",
      why: "the one screen that clamps on its own root: measured 2026-08-13, both themes — ONE rendered element, maxWidth 1504px = 94rem. The same class is worn by `.meeting-skeleton` (MeetingsSurface.tsx:502) and by the error panel (:520); the arrival marker already in ROUTED_ARRIVAL keeps this stop on the delivered screen",
      app: "packages/desktop-ui/src/MeetingsSurface.tsx:1842, deklaracja w styles.css:4887-4902 (`max-width: 74rem` od lotu L1, wcześniej 94rem)",
    },
    read: { property: "maxWidth" },
    expect: { kind: "rem", value: 74 },
    // POLECENIE DLA L1, NIE OSTRZEŻENIE, I WYKONANE 2026-08-14: tę parę zamyka
    // się ZMIANĄ LICZBY W MIEJSCU — `94rem` → `74rem` — a NIE przeniesieniem
    // Spotkań na wzorzec Ustawień. Powód jest mechaniczny, nie estetyczny:
    // skasowanie literału zostawiłoby na tym podmiocie „none", a `rem` na
    // „none" wraca NOT_MEASURED (`verify-renderer-layout.mjs:4046-4055`), czyli
    // AWARIĘ PRZYRZĄDU w środku Fazy II, na bramce bez flagi zwężającej
    // przelot. Edycja jednoliniowa jest też dokładnie tym, co robi prototyp:
    // `.mt { max-width: 74rem }` to literał na korzeniu, nie zmienna.
    // Gdyby jakiś późniejszy lot MIMO TO przeniósł Spotkania na zmienną,
    // podmiot ma zostać przepięty na `#main-content .meeting-surface >
    // .meeting-body` W TYM SAMYM commicie.
    status: "enforced",
  },
  {
    id: "P1-11",
    lot: "P1",
    position: 11,
    kind: "restyle",
    title: "Library stands under no reading measure — and already does",
    contract:
      '.ui-craft/patterns.md — „Pattern: Surface title band", akapit „Content stays in the reading column"',
    prototype: {
      file: "v3/screens/knowledge.css",
      lines: "1-400",
      value:
        "brak reguły korzenia z `max-width`: korzeniem jest `.kn-main.scroller` (`screens/knowledge.js:835`, `:974`), a jedyny sufit w tym pliku to `.kn-reader { max-width: var(--surface-read) }` (`:234`) — sufit AKAPITU (`v3/tokens.css:102`, 46rem), NIE ekranu",
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: '#main-content [data-height-bound="library"]',
      why: 'Library reaches the band arrangement by its own road — `.shell` is a grid whose third row is the scroll box (library.module.css:16-23, LibraryShell.tsx:102) — so it has no `.surface-scroll` and never consumes `--surface-measure` at all. `data-height-bound` is written in the source as A DECLARATION, not a test hook (LibraryShell.tsx:214-223). Measured 2026-08-13, both themes — ONE rendered element, maxWidth "none"',
      app: "packages/desktop-ui/src/library/LibraryShell.tsx:223, library.module.css:16-23",
    },
    read: { property: "maxWidth" },
    expect: { kind: "literal", value: "none" },
    // ENFORCED, BO PASUJE DZIŚ — i to jest jedna z dwóch par tego przyrządu,
    // które są zielone od pierwszego przelotu. Para oczekująca, która PASUJE,
    // kładzie bramkę jako ROUTED_PENDING_ALREADY_MATCHES
    // (`verify-renderer-layout.mjs:7472-7481`), a osłabianie oczekiwania po to,
    // żeby ją utrzymać w „pending", jest w tym pliku zakazane wprost.
    status: "enforced",
  },
  {
    id: "P1-12",
    lot: "P1",
    position: 12,
    kind: "restyle",
    title: "the record body takes the widest measure the reference declares",
    contract:
      '.ui-craft/patterns.md — „Pattern: Surface title band", akapit „Content stays in the reading column"',
    prototype: {
      file: "v3/app.css",
      lines: "650",
      value:
        "`.record { padding: var(--space-5) var(--space-6) 5rem; max-width: var(--surface-measure) }` → `v3/tokens.css:101` `--surface-measure: 92rem`. To jedyne użycie tego tokenu w CAŁYM prototypie — czyli w v3 `--surface-measure` NIE jest sufitem wszystkiego, tylko wartością, którą wybiera JEDEN ekran",
    },
    route: { surface: "tasks", openRecord: "[data-task-row]" },
    subject: {
      selector: '#main-content [data-record-kind="task"]',
      why: "the record screen is the sole child of the tasks scroll box once a row is opened, so it wears the same `.surface-scroll > *` clamp as every list body. Measured 2026-08-13, both themes — ONE rendered element, maxWidth 1152px, i.e. the record reads NARROWER than the reference by 20 rem",
      app: "packages/desktop-ui/src/record/TaskRecordScreen.tsx:481, klamra styles.css:6196-6200",
    },
    read: { property: "maxWidth" },
    expect: { kind: "rem", value: 92 },
    status: "enforced",
  },
  {
    id: "P1-13",
    lot: "P1",
    position: 13,
    kind: "restyle",
    title: "Settings declares its own reading measure — and already does",
    contract:
      '.ui-craft/patterns.md — „Pattern: Surface title band", akapit „Content stays in the reading column"',
    prototype: {
      file: "v3/screens/settings.css",
      lines: "96",
      value:
        "`.st { max-width: 74rem; padding: var(--space-6) var(--space-6) 5rem }`",
    },
    route: { settingsMode: true },
    subject: {
      selector:
        "#main-content .settings-surface > *:not(.surface-header):not(.view-band)",
      why: "the one screen in this application that ALREADY declares its own measure — `.settings-surface { --surface-measure: 74rem }` (styles.css:9503-9505) — and therefore the pattern the other twelve are supposed to follow. Measured 2026-08-13, both themes: TWO matched, ONE rendered (div.settings-layout; the category picker computes zero width above 1440 px and falls out through `rendered()`, and its maxWidth is the same 1184px anyway, so `distinct` stays 1 either way)",
      app: "packages/desktop-ui/src/SettingsSurface.tsx:963, styles.css:9503-9505",
    },
    read: { property: "maxWidth" },
    expect: { kind: "rem", value: 74 },
    // ENFORCED, I TO JEST NAJWAŻNIEJSZA PARA CAŁEGO PRZYRZĄDU. Zielona pośród
    // jedenastu czerwonych dowodzi, że ten przyrząd mierzy WARTOŚĆ, a nie
    // własną obecność — dwanaście czerwieni bez ani jednej zieleni jest
    // nieodróżnialne od selektora, który nigdy nie trafia. Jest też jedynym
    // podmiotem, na którym da się napisać złamanie WARTOŚCIOWE.
    status: "enforced",
  },

  // ══ FAZA I, PRZYRZĄD P2 — SKRZYNKA, POZYCJE 3 I 4 ═════════════════════════
  // Teza przyrządu i uzasadnienie podmiotu przez ROLĘ stoją RAZ, przy parach
  // P2-01a…P2-02 w mapie powłoki, i nie są tu przepisywane: ten sam kształt
  // powielony w dwóch miejscach jest w tym repozytorium nazwaną klasą defektu.
  // Tutaj tylko to, co jest INNE po tej stronie.
  //
  // WPIS 3-1 DOKUMENTU PRZEJŚCIA JEST NAJOSTRZEJSZYM DOWODEM CAŁEGO P2 i pada
  // właśnie na tym ekranie: sonda przeszła wszystkie pojemniki szersze niż
  // 200 px i wyższe niż 40 px, szukając ramki ≥ 0,5 px albo promienia ≥ 1 px —
  // zbiór pusty. Prototyp ma tu dwie karty `div.ib-list`, 1 px i promień
  // `--radius-md`.
  //
  // PRZYSTANEK ISTNIEJE OD PRZYRZĄDU P1 I NIE JEST DOPISYWANY PRZEZ TEN LOT.
  // Marker przybycia Skrzynki (`ROUTED_ARRIVAL.inbox`) to
  // `#main-content [data-inbox-row]`, dopisany przez P1 tego samego dnia.
  // MARKER JEST ROZŁĄCZNY Z PODMIOTEM TYCH PAR i to jest tu nośne: złamanie
  // P2 zdejmuje ROLĘ z `<ul>`, a nie atrybut z `<li>`, więc trasa dalej ląduje
  // i czerwień wraca jako `ROUTED_NOT_MEASURED` („the selector, not the
  // navigation"), a nie jako `ROUTED_ROUTE_FAILED` — czyli da się ją przypisać
  // co do pary. Gdyby przybycie było przypięte do ROLI, to samo złamanie
  // czytałoby się jak awaria powłoki.
  {
    id: "P2-03a",
    lot: "P2",
    position: 3,
    kind: "restyle",
    title: "the Inbox list stands in a container with a hairline border",
    contract:
      '.ui-craft/patterns.md — „Pattern: Settings section card and list plate", ograniczenie „A row of a list is not a card"',
    prototype: {
      file: "v3/screens/inbox.css",
      lines: "27-30",
      value:
        "`.ib-list { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; background: var(--surface-content); box-shadow: var(--shadow-sm) }`",
    },
    route: { surface: "inbox" },
    subject: {
      selector: '#main-content [role="list"]:has([data-inbox-row])',
      why: "role plus the declared row attribute, the same definition as P2-01a; the capture mailbox is empty in this fixture and renders a <p> instead of a <ul> (InboxSurface.tsx:366-370), and both mailboxes would carry the identical `.rows` rule anyway, so this subject cannot go ambiguous by growing",
      app: 'packages/desktop-ui/src/InboxSurface.tsx (the <ul role="list"> of the work mailbox), inbox.module.css (.rows — the card rule since lot L4; before it the rule declared gap, margin, padding and list-style, and no border at all)',
    },
    read: { property: "borderTopWidth" },
    expect: { kind: "literal", value: "1px" },
    status: "enforced",
  },
  {
    id: "P2-03b",
    lot: "P2",
    position: 3,
    kind: "restyle",
    title: "and the Inbox container carries the card radius",
    contract:
      '.ui-craft/patterns.md — „Pattern: Section head over a list card", ograniczenie „The chrome belongs to the LIST, not to the section"',
    prototype: {
      file: "v3/screens/inbox.css",
      lines: "27-30",
      value: "`.ib-list { border-radius: var(--radius-md) }`",
    },
    route: { surface: "inbox" },
    subject: {
      selector: '#main-content [role="list"]:has([data-inbox-row])',
      why: "the same subject as P2-03a; read apart from the border for the reason given there, and against the TOKEN rather than a number for the reason given at P2-01b",
      app: "packages/desktop-ui/src/inbox.module.css (.rows)",
    },
    read: { property: "borderRadius" },
    expect: { kind: "token", token: "--radius-md" },
    status: "enforced",
  },
  {
    id: "P2-03c",
    lot: "P2",
    position: 3,
    kind: "restyle",
    title: "and the Inbox container clips its rows to that radius",
    contract:
      '.ui-craft/patterns.md — „Pattern: Settings section card and list plate", zdanie „overflow: hidden on the plate is load-bearing"',
    prototype: {
      file: "v3/screens/inbox.css",
      lines: "27-30",
      value: "`.ib-list { overflow: hidden }`",
    },
    route: { surface: "inbox" },
    subject: {
      selector: '#main-content [role="list"]:has([data-inbox-row])',
      why: "the Inbox row is the one place in this family where the contract's sentence is literal: the selected row draws a rail with ::before at its own left edge (v3/screens/inbox.css:45-47), which is exactly the square corner outside a rounded edge the constraint names",
      app: "packages/desktop-ui/src/inbox.module.css (.rows)",
    },
    read: { property: "overflow" },
    expect: { kind: "literal", value: "hidden" },
    status: "enforced",
  },
  {
    id: "P2-04",
    lot: "P2",
    position: 4,
    kind: "restyle",
    title: "the Inbox row gives its card corner back to the list",
    contract:
      '.ui-craft/patterns.md — „Pattern: Settings section card and list plate", ograniczenie „A row of a list is not a card"',
    prototype: {
      file: "v3/screens/inbox.css",
      lines: "34-42",
      value:
        "`.ib-row` declares a grid, padding and `border-bottom: 1px solid var(--border-subtle)` — and NO border-radius; `.ib-row:last-child { border-bottom: 0 }`",
    },
    route: { surface: "inbox" },
    subject: {
      selector: "#main-content [data-inbox-row]",
      why: "the declared row attribute, written on the <li> itself (InboxSurface.tsx:136-146); the radius the app puts here is the SAME --radius-md the container is missing, which is the whole sentence of this instrument in one screen",
      app: "packages/desktop-ui/src/inbox.module.css (.row — the card radius is gone and a border-bottom took its place)",
    },
    read: { property: "borderRadius" },
    expect: { kind: "literal", value: "0px" },
    status: "enforced",
  },
  // BLIŹNIAK `P2-01d` NA DRUGIM EKRANIE RODZINY, i stoi tu z tego samego
  // powodu, dla którego stoi tam: oba wpisy `NOT_COVERED` przyrządu P2
  // nazywały separator 2 px (krawędź wiersza plus odstęp pojemnika) jako
  // JEDYNĄ cichą drogę porażki lotu L4, a przed tym lotem ani jedna para obu
  // map nie czytała `gap`. Pełne uzasadnienie odczytu i wartości „normal”
  // (zmierzonej, nie założonej) stoi RAZ, przy `P2-01d` w mapie powłoki;
  // powielanie go tutaj byłoby tym samym kształtem przepisanym w dwóch
  // miejscach, co ten rejestr ma nazwane jako klasę defektu.
  {
    id: "P2-03d",
    lot: "P2",
    position: 3,
    kind: "restyle",
    title: "and the Inbox list adds no second gap between its rows",
    contract:
      '.ui-craft/patterns.md — „Pattern: Settings section card and list plate", ograniczenie „A row of a list is not a card"',
    prototype: {
      file: "v3/screens/inbox.css",
      lines: "27-42",
      value:
        "`.ib-list` declares no gap at all; the whole separator is `border-bottom: 1px solid var(--border-subtle)` on `.ib-row`",
    },
    route: { surface: "inbox" },
    subject: {
      selector: '#main-content [role="list"]:has([data-inbox-row])',
      why: "the same subject as P2-03a, read on the CONTAINER because that is where a second hairline would come from; the reading is the same one P2-01d makes on Today, so the two screens of this family cannot drift apart on the one thing no pair used to see",
      app: "packages/desktop-ui/src/inbox.module.css (.rows — the gap declaration is gone)",
    },
    read: { property: "rowGap" },
    expect: { kind: "literal", value: "normal" },
    status: "enforced",
  },

  // ══ PRZYRZĄD P4 FAZY I — KONTROLKA, KTÓRĄ RYSUJE SYSTEM, NA POWIERZCHNI ═══
  //    TREŚCI
  //
  // CZEGO TEN PRZYRZĄD **NIE** MIERZY, I DLACZEGO TO JEST PIERWSZE ZDANIE.
  // Mandat P4 w planie lotów brzmi „rozwiązane `appearance` na kontrolce
  // stojącej na powierzchni treści". `appearance` NIE NADAJE SIĘ na asercję
  // i to jest zmierzone, nie wywnioskowane (sonda z 2026-08-13, oba motywy):
  // Chromium wylicza dla KAŻDEGO `<button>`, `<select>`, `<input>` dowolnego
  // typu, `<textarea>`, `<progress>` i `<meter>` dokładnie `auto`, a dla
  // `<div>` i `<a>` dokładnie `none` — nigdy `menulist`, `textfield` czy
  // `searchfield`. Z tego wynikają trzy rzeczy i każda osobno zabija asercję
  // „`appearance` ma być `none`":
  //   1. zdanie dokumentu przejścia 4-1 („`appearance: auto` na wszystkich
  //      pięciu") jest PRAWDZIWE, ale nie niesie informacji — jest prawdziwe
  //      także o zdrowych przyciskach tej aplikacji i o przyciskach prototypu;
  //   2. asercja „`appearance: none`" jest CZERWONA NA PROTOTYPIE:
  //      `grep -rn appearance docs/plans/2026-07-27-ui-ux-rebuild/v3/` nie
  //      daje ANI JEDNEJ deklaracji CSS, a jedyny `<select>` prototypu
  //      (`v3/screens/settings.js:331`, `.st-select`) jej nie deklaruje.
  //      Prototyp wygrywa z kontraktem, więc ta asercja odpada;
  //   3. asercja „`appearance: none`" jest SPEŁNIALNA BEZ NAPRAWY PRODUKTU —
  //      lista opcji `<select>` nie jest elementem DOM-u i rysuje ją system
  //      niezależnie od `appearance`. Jedna linijka CSS zazieleniłaby
  //      przyrząd, a macOS dalej rysowałby listę. To jest nazwana w tym
  //      repozytorium klasa „regex zielony, zachowanie zepsute".
  // Ten sam wniosek stoi już zapisany po drugiej stronie, w kontrakcie:
  // `.ui-craft/patterns.md`, „Pattern: Control size", ograniczenie „The native
  // arrow stays" — `appearance` nie występuje NIGDZIE w drzewie v3.
  //
  // CO TEN PRZYRZĄD MIERZY ZAMIAST TEGO. Rzecz, której nie da się udawać
  // jedną deklaracją: NIEOBECNOŚĆ natywnej kontrolki na powierzchni treści.
  // Prototyp robi wybór PRZYCISKIEM OTWIERAJĄCYM MENU (`popover()`,
  // `v3/app.js:1921-1961`), a przycisk otwierający menu to INNY ELEMENT, nie
  // inny CSS. Zdanie przyrządu: *na powierzchni treści ekranu, którego
  // prototypowy odpowiednik nie ma ani jednej kontrolki formularza, apka też
  // nie ma ani jednej — liczone nad CAŁYM `#main-content`, nie nad wypisanymi
  // kontrolkami.*
  //
  // DLACZEGO NIE DOSZYTO OSI DO SPISU B1, KTÓRY CHODZI PO TYCH SAMYCH
  // PODMIOTACH. `controlPaintCensus` zbiera każdą narysowaną `button, input,
  // textarea, select` w `#main-content` na trzynastu celach — czyli spacer
  // i zbiór podmiotów są DOKŁADNIE te, których P4 potrzebuje. Ale ten spis
  // czyta z nich TŁO i wyłącza z siebie natywny widżet własnym zapisem
  // (`scripts/control-paint.mjs:117-118`: „Natywna strzałka `<select>` NIE
  // należy do tego przyrządu — to osobna pozycja (Faza C, lot C5) i osobna
  // właściwość"). Zapowiedziana „osobna pozycja" nigdy nie powstała: lot C5
  // dowiózł WYŁĄCZNIE geometrię (C5-01c `maxInlineSize`, C5-02a `alignSelf`,
  // C5-02b `flexGrow`, C5-03 `flexGrow`). P4 jest jej domknięciem, i robi to
  // PARAMI, a nie doszyciem, z trzech powodów: nie ma czego doszyć jako
  // własności (patrz wyżej); pytanie P4 to LICZBA ELEMENTÓW, a nie farba,
  // więc licznik w spisie farby zrobiłby z jednego przyrządu dwa mieszkające
  // w jednej funkcji; a para JEST w stanie wyrazić nieobecność i kosztuje
  // zero sekund przelotu na przystankach, które już stoją.
  //
  // STARSZE RODZEŃSTWO TYCH PAR TO `D11-01`, i jest tu cytowane świadomie.
  // Ta sama mechanika (`count`, `equals: 0`, nad `select`), to samo zdanie
  // („mierzy, czego stać NIE MA, a nie co stoi") i to samo ryzyko („asercja
  // o nieobecności jest spełniona także przez ekran, który się nie
  // narysował"). Różnica jest w ZASIĘGU: D11-01 pyta o jeden pas jednego
  // rekordu, P4 pyta o CAŁĄ powierzchnię treści sześciu ekranów. Dwa
  // przyrządy zbieżne i świadome siebie nawzajem to dowód; dwa nieświadome to
  // dryf, i to repozytorium ma na niego osobny wpis pamięci.
  //
  // DLACZEGO WSZYSTKIE OSIEM CZYTA `count`, A NIE WŁASNOŚĆ. Gałąź `count`
  // w runnerze odkłada `{ state: "measured", matches: found.length }` i robi
  // `continue` (`verify-renderer-layout.mjs:4390-4397`) ZANIM dojdzie do
  // strażnika „selektor nie trafił w nic" (`:4400-4428`) i do strażnika
  // `distinct.length > 1` (`:4459-4468`). Zero dopasowań jest więc dla tych
  // par POMIAREM, nie awarią przyrządu, a pułapka wielu różnych wartości ich
  // nie dotyczy. Wzorcowy zapis stoi przy `L1-09b`: „counted, not read".
  //
  // I JEDNA WŁASNOŚĆ, KTÓRĄ TRZEBA WYPISAĆ, BO ODBIERA FAZIE II DROGĘ NA
  // SKRÓTY: `count` liczy `found`, czyli TAKŻE elementy nienarysowane.
  // Kontrolka schowana `display: none` albo `hidden` NIE zamyka żadnej z tych
  // par. Ukrycie nie jest przerobieniem.
  //
  // USTAWIENIA I EKRAN REKORDU SĄ WYŁĄCZONE, I ROZSTRZYGA TO REJESTR, NIE
  // GUST. `count: 0` na tych powierzchniach zaprzeczyłoby wprost trzem parom
  // `enforced`, które musiałyby wtedy wrócić `NOT_MEASURED` (zero dopasowań =
  // brak podmiotu): C5-02a i C5-02b żądają `.settings-control select`, a
  // C5-03 żąda `[class*="_railSelect_"]` na rekordzie projektu. Po stronie
  // prototypu ta sama granica: jego JEDYNY `<select>` stoi w wierszu Ustawień
  // (`v3/screens/settings.js:329-334`). Dwa niezależne źródła, jedna linia
  // podziału.

  {
    id: "P4-01a",
    lot: "P4",
    position: 1,
    kind: "restructure",
    title: "the Tasks toolbar stops choosing with a native control",
    contract: '.ui-craft/patterns.md — „Pattern: Control size"',
    prototype: {
      file: "v3/screens/tasks.js",
      lines: "507-531",
      value:
        '`.viewbar` prototypu trzyma WYŁĄCZNIE rysowane afordancje: `.segmented` z przyciskami układu, `chip tk-allviews` z „All views" + licznikiem + `chevDown`, `chip dashed` „Filter", `btn("Group: …", { cls: "quiet", icon: "group" })` i dwa `btn("", { cls: "quiet tk-iconbtn" })` na sortowanie i pola — ZERO `<select>`, ZERO `<input>`, ZERO `<textarea>` w całym pliku ekranu (534 linie, zmierzone)',
    },
    route: { surface: "tasks" },
    subject: {
      selector: "#main-content select",
      why: "counted, not read: this pair asks whether the CONTENT SURFACE holds a control the engine draws, and the selector is TOTAL over that surface — it catches a select nobody named as well as the three that stand there today. Deliberately not a list of named ids: those are closable by renaming, and they say nothing about the fourth select someone adds next week. `count` counts UNRENDERED matches too, so hiding one does not close this pair",
      app: "packages/desktop-ui/src/tasks/TasksSurface.tsx:637 (#tasks-view), :715 (#tasks-group), :732 (#tasks-sort)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "pending: LOT L6",
  },
  {
    id: "P4-01b",
    lot: "P4",
    position: 1,
    kind: "restructure",
    title: "the Tasks toolbar stops searching with a native field",
    contract: '.ui-craft/patterns.md — „Pattern: Control size"',
    prototype: {
      file: "v3/screens/tasks.js",
      lines: "507-531",
      value:
        'ten sam pas: prototyp nie stawia na ekranie Zadań ANI JEDNEGO `<input>` — filtrowanie robi `chip dashed` „Filter", a wyszukiwanie mieszka w omniboksie powłoki (`v3/app.css:183-194`)',
    },
    route: { surface: "tasks" },
    subject: {
      selector: "#main-content input",
      why: 'input OF ANY TYPE, deliberately: an assertion written as `input[type="search"]` would be closable by changing one attribute, which fixes nothing a reader can see. Two pairs and not one on this position, because the `<select>` and the `<input>` break apart and are repaired by separate work — a single pair over `select, input` would go green over half a delivery, and its report line would not say which half',
      app: "packages/desktop-ui/src/tasks/TasksSurface.tsx:627-633 (input#tasks-search, type=search)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "pending: LOT L6",
  },
  {
    id: "P4-02a",
    lot: "P4",
    position: 2,
    kind: "restructure",
    title: "the Meetings list stops holding an integration picker",
    contract: '.ui-craft/patterns.md — „Pattern: Control size"',
    prototype: {
      file: "v3/screens/meetings.js",
      lines: "1-452",
      value:
        "cały ekran spotkań prototypu: ZERO `<select>`, ZERO `<input>`, ZERO `<textarea>` (452 linie, zmierzone) — konfiguracja integracji nie stoi na liście treści",
    },
    route: { surface: "meetings" },
    subject: {
      selector: "#main-content select",
      why: 'total over the Meetings content surface; today it catches the „Key scope" picker of the Jamie card, and it will catch any other choice control that lands on this list. The destination for that form is decided and written down (Kacper, 2026-08-13: the Jamie form moves into Settings → Access and connections), so this pair is not asking for the feature to disappear — it is asking for it to stand where the reference puts it',
      app: "packages/desktop-ui/src/MeetingsSurface.tsx:775-786",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "pending: LOT L6",
  },
  {
    id: "P4-02b",
    lot: "P4",
    position: 2,
    kind: "restructure",
    title: "the Meetings list stops holding a credential field",
    contract: '.ui-craft/patterns.md — „Pattern: Control size"',
    prototype: {
      file: "v3/screens/meetings.js",
      lines: "1-452",
      value:
        "jak wyżej — na liście spotkań prototypu nie stoi ani jedno pole formularza",
    },
    route: { surface: "meetings" },
    subject: {
      selector: "#main-content input",
      why: 'the API key field is `type="password"`, not a text input — measured, and it is the second reason this instrument counts inputs of ANY type. The transition document calls it „a native text field" (10-1), which is wrong about the type and right about the symptom',
      app: "packages/desktop-ui/src/MeetingsSurface.tsx:787-794",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "pending: LOT L6",
  },

  // ── POZYCJA 3 — KONTROLA DODATNIA, I NIE JEST TO POZYCJA BRIEFU ───────────
  //
  // Plan lotów nazywa dla P4 DWA miejsca objawowe: Zadania (4-1, 4-2)
  // i Spotkania (10-1). Trzecia pozycja jest własnością PRZYRZĄDU, nie planu,
  // i stoi tu świadomie: przyrząd, który umie tylko czerwienieć, nie jest
  // przyrządem, tylko sondą. Te same słowa stoją już w tym repozytorium
  // (`scripts/control-paint.mjs:113-117`), zapisane przy spisie, który był
  // dokładnie w tej sytuacji. Cztery pary `enforced`, zielone w dniu
  // napisania, tym samym selektorem i tą samą mechaniką co cztery czerwone —
  // jeżeli mechanika przestanie mierzyć, one przestaną być zielone.
  //
  // BRAMA PRZED ICH NAPISANIEM, SPRAWDZONA A NIE ZAŁOŻONA. Para `enforced`
  // przeciwko zmyślonemu cytatowi prototypu jest tą samą wadą, co „przepisz
  // wartość prototypu ręcznie zamiast go zmierzyć". Zmierzone 2026-08-13:
  //   grep -c "<input\|<select\|<textarea" v3/screens/{pipeline,crm,renewals}.js
  //     pipeline.js → 0 (424 linie), crm.js → 0 (551), renewals.js → 0 (280)
  // Gdyby któryś plik miał kontrolkę, para NIE POWSTAJE — nie „idzie na
  // pending", nie dostaje innego zakresu linii.
  //
  // TYLKO `select`, I TO TEŻ JEST POMIAR, NIE OSZCZĘDNOŚĆ. `input` świadomie
  // NIE jest tu asertowany: pole tekstowe jest na tych ekranach afordancją
  // dozwoloną (prototyp jej nie zakazuje — zakazuje wyłącznie wyboru
  // natywnego), a „nigdy żadnego `input`" zamroziłoby w parze `enforced`
  // ARTEFAKT DZISIEJSZEJ FIKSTURY. Kontrolka WYBORU jest natomiast prawdziwym
  // niezmiennikiem: prototyp robi wybór przyciskiem na każdym ze swoich
  // czternastu ekranów poza wierszem Ustawień.
  //
  // I RYZYKO TYCH CZTERECH PAR, WYPISANE TAK JAK PRZY `D11-01`: zero jest
  // prawdą także o ekranie, który narysował panel odmowy zamiast treści.
  // Chroni przed tym MARKER PRZYBYCIA — trasa, która nie dowiozła treści,
  // pada jako `ROUTED_ROUTE_FAILED`, głośno i z nazwą ekranu, nigdy jako cicha
  // zieleń. Każdy z tych czterech przystanków niesie zresztą kilkanaście
  // innych par czytających narysowaną treść; nienarysowany ekran przewraca je
  // wszystkie naraz, zanim zdąży uspokoić tę.
  {
    id: "P4-03a",
    lot: "P4",
    position: 3,
    kind: "prescribed",
    title: "the Pipeline board keeps choosing without a native control",
    contract: '.ui-craft/patterns.md — „Pattern: Control size"',
    prototype: {
      file: "v3/screens/pipeline.js",
      lines: "1-424",
      value:
        "ZERO `<select>`, ZERO `<input>`, ZERO `<textarea>` w całym pliku ekranu lejka (424 linie, zmierzone)",
    },
    route: { surface: "pipeline" },
    subject: {
      selector: "#main-content select",
      why: 'the positive control of this instrument: this surface is already at zero, and this pair is what keeps it there. `ROUTED_ARRIVAL.pipeline = "[data-pipeline-surface]"` proves the content drew before the count was taken, so „zero" here cannot be a fact about an empty screen',
      app: "packages/desktop-ui/src/pipeline/PipelineSurface.tsx",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    id: "P4-03b",
    lot: "P4",
    position: 3,
    kind: "prescribed",
    title: "the Organizations list keeps choosing without a native control",
    contract: '.ui-craft/patterns.md — „Pattern: Control size"',
    prototype: {
      file: "v3/screens/crm.js",
      lines: "1-551",
      value:
        "ZERO `<select>`, ZERO `<input>`, ZERO `<textarea>` w pliku niosącym OBA ekrany CRM prototypu — Organizacje i Ludzi (551 linii, zmierzone)",
    },
    route: { surface: "organizations" },
    subject: {
      selector: "#main-content select",
      why: 'the same positive control as P4-03a, on a screen whose arrival marker is a CONTENT marker (`ROUTED_ARRIVAL.organizations = "#main-content [data-org-row]"`) — and that matters more here than on the Pipeline, because this surface draws its root in the REFUSAL branch as well; the row marker is what separates „nothing to choose with" from „nothing at all"',
      app: "packages/desktop-ui/src/organizations (the CRM organizations list body)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    id: "P4-03c",
    lot: "P4",
    position: 3,
    kind: "prescribed",
    title: "the People list keeps choosing without a native control",
    contract: '.ui-craft/patterns.md — „Pattern: Control size"',
    prototype: {
      file: "v3/screens/crm.js",
      lines: "1-551",
      value:
        "jak wyżej — ten sam plik niesie oba ekrany CRM i nie ma w nim ani jednej kontrolki formularza",
    },
    route: { surface: "people" },
    subject: {
      selector: "#main-content select",
      why: 'the twin of P4-03b, and a separate pair for the reason lot D6 wrote down about this exact pair of screens: the two CRM lists live in two module sheets and are built by two components, so one pair would be green over half of anything. `ROUTED_ARRIVAL.people = "#main-content [data-person-row]"`',
      app: "packages/desktop-ui/src/people (the CRM people list body)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    id: "P4-03d",
    lot: "P4",
    position: 3,
    kind: "prescribed",
    title: "the Renewals list keeps choosing without a native control",
    contract: '.ui-craft/patterns.md — „Pattern: Control size"',
    prototype: {
      file: "v3/screens/renewals.js",
      lines: "1-280",
      value:
        "ZERO `<select>`, ZERO `<input>`, ZERO `<textarea>` w całym pliku ekranu odnowień (280 linii, zmierzone)",
    },
    route: { surface: "renewals" },
    subject: {
      selector: "#main-content select",
      why: 'the fourth positive control, and the one closest to going wrong: this screen carries a view bar with a saved-view counter (L3-07 measures that the counter LEFT the title band), which is exactly the kind of strip a choice control gets added to. `ROUTED_ARRIVAL.renewals = "[data-renewals-surface]"`',
      app: "packages/desktop-ui/src/renewals (the renewals surface body)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },

  // ══ PRZYRZĄD P5 (FAZA I) — WAGA KROJU ZE ZBIORU ZADEKLAROWANEGO ═══════════
  //
  // DWIE PARY, JEDNA POZYCJA, I SĄ WYŁĄCZNIKIEM DOSTAWY, NIE CAŁYM PRZYRZĄDEM.
  // Pytanie P5 jest TOTALNE nad ekranem („czy KAŻDA narysowana waga należy do
  // skali, którą deklaruje `tokens.css`"), a para czyta JEDEN selektor i JEDNĄ
  // własność. 91 deklaracji obcych wag w 34 arkuszach to nie 91 par, a dziewięć
  // par (po jednej na obcą wartość) mierzyłoby WPISY Z LISTY zamiast reguły —
  // czyli dokładnie „ręczną listę obok zamkniętego słownika". Sama reguła
  // mieszka więc w przelotce `sweepTypeWeight` w `verify-renderer-layout.mjs`,
  // a te dwie pary są jej WYŁĄCZNIKIEM: `TYPE_WEIGHT_OWNER` (na dole tego
  // pliku) pyta je o status, dokładnie tak jak `RECORD_TITLE_BAND_OWNER` pyta
  // `L4-01a`/`L4-01b` o rozmiar. Jedna pozycja, jeden przełącznik, żadnego
  // drugiego miejsca do zapamiętania.
  //
  // NAMESPACE `P5`, A NIE `L5`, I JEST TO POMIAR, NIE GUST. `L1`-`L6` należą
  // w tej mapie do lotów 1-6 Fazy 3 (`L5` ma dziś 14 par), a plan tej fali
  // nazywa swoje loty również `L1`-`L11`. Para dopisana jako `L5-05` dałaby
  // `ROUTED_DUPLICATE_ID` — czerwoną bramkę, która czyta się jak defekt
  // produktu. Dotyczy to CAŁEJ Fazy I/II tego planu, nie tylko P5.
  //
  // ZERO NOWYCH PRZYSTANKÓW: obie trasy (`tasks` → rekord zadania, `pipeline`
  // → rekord szansy) są klonami tras `L4-01b` i `L4-01c`, które ta mapa
  // przechodzi od Fazy 3. Ani sekundy przelotu więcej, ani jednej edycji
  // w `ROUTED_ARRIVAL`.
  {
    id: "P5-01a",
    lot: "P5",
    position: 1,
    kind: "restyle",
    title: "the task record title takes a weight from the declared scale",
    contract: ".ui-craft/tokens.md (Type)",
    prototype: {
      file: "v3/app.css",
      lines: "651-652",
      value:
        "`.rec-title { font-size: var(--text-xl); font-weight: 600 }` — prototyp używa w całym `v3/` DOKŁADNIE czterech wag (400×3, 500×64, 600×85, 700×3) i ani jednej innej",
    },
    route: { surface: "tasks", openRecord: "[data-task-row]" },
    subject: {
      selector: '[data-record-kind="task"] #surface-title',
      why: "ten sam podmiot i ta sama deklaracja, co L4-01b (rozmiar); `#surface-title` jest jedyny na stan ekranu i JEST TO ASERTOWANE (VISUAL_PROBE_TITLE_NOT_UNIQUE), więc selektor nie może trafić w dwie różne wartości",
      app: "packages/desktop-ui/src/record/task-record.module.css:48 (`font-weight: 580`)",
    },
    read: { property: "fontWeight" },
    // TOKEN, NIE LITERAŁ „600". `resolveAs` rozwiązuje `var(--weight-semibold)`
    // PRZEZ TĘ SAMĄ WŁASNOŚĆ na próbce w żywym dokumencie, więc para pyta „czy
    // waga JEST zadeklarowanym stopniem", a nie „czy równa się napisowi 600" —
    // i psuje się razem ze skalą, zamiast ją cicho przeżyć. To jest ta sama
    // różnica, którą L4-01a/b robią na rozmiarze przez `--text-xl`.
    expect: { kind: "token", token: "--weight-semibold" },
    // WŁAŚCICIELEM JEST LOT L5 FAZY II — waga 580 na tytule rekordu Zadania
    // i Projektu. Napis statusu musi pasować do `^pending: LOT [A-Z]*\d+$`
    // (`ROUTED_UNKNOWN_STATUS`), więc powód stoi tutaj, a nie w nim.
    status: "pending: LOT L5",
  },
  {
    id: "P5-01b",
    lot: "P5",
    position: 1,
    kind: "restyle",
    title:
      "and so does the opportunity record title, which carries a different off-scale weight",
    contract: ".ui-craft/tokens.md (Type)",
    prototype: {
      file: "v3/app.css",
      lines: "651-652",
      value: "`.rec-title { font-weight: 600 }`",
    },
    route: { surface: "pipeline", openRecord: "[data-pipeline-card]" },
    subject: {
      selector: '[data-record-kind="opportunity"] #surface-title',
      why: "DRUGA WARTOŚĆ, nie druga kopia: Zadanie i Projekt rysują 580, Szansa 620 — jedna para nad jedną wartością nie umie powiedzieć, że to konwencja aplikacji, a nie literówka jednego arkusza. To także jedyny z trzech ekranów rekordu, którego ROZMIAR już pasuje, więc bez tej pary waga tego ekranu nie miałaby żadnego zdania nad sobą",
      app: "packages/desktop-ui/src/opportunity/opportunity-record.module.css:49 (`font-weight: 620`)",
    },
    read: { property: "fontWeight" },
    expect: { kind: "token", token: "--weight-semibold" },
    // Jak wyżej: właścicielem jest lot L5 Fazy II, waga 620 na tytule rekordu
    // Szansy. Powód nie mieści się w napisie, który czyta `auditRoutedMap`.
    status: "pending: LOT L5",
  },

  // ── LOT L10 FAZY II — FORMATOWANIE DAT, DWA PRZYSTANKI ────────────────────
  //
  // POZYCJA 2 (wpis 9-2) — wiersz Odnowień. POZYCJA 3 (wpis 11-6) — Biblioteka.
  // Pozycja 1 (pasmo Dzisiaj) stoi w mapie powłoki, bo Dzisiaj jest
  // powierzchnią lądowania.
  //
  // CZTERY Z PIĘCIU PAR CZYTAJĄ `data-day-form`, CZYLI KAŻĄ PRODUKTOWI
  // POWIEDZIEĆ, KTÓRĄ GAŁĄŹ NARYSOWAŁ. Reguła daty ma trzy gałęzie („Yesterday"
  // / „Sep 30" / „Mar 31 2027"), a `formatDate` zwraca napis, po którym nie da
  // się poznać, która z nich zapadła. Atrybut liczy `dayFormOf`, napis
  // `formatDate` — obie funkcje wychodzą z tego samego `dayFormFromDays`.
  //
  // CO Z TEGO WYNIKA, POWIEDZIANE ŚCIŚLE, BO STAŁO TU ZDANIE FAŁSZYWE. Stało:
  // „atrybut nie może powiedzieć czegoś innego niż tekst obok". Nie jest to
  // prawda i przegląd adwersarialny to zmierzył: napis i atrybut to DWA osobne
  // wywołania (`formatDate` → `formatDayFromDays`, `dayFormOf` →
  // `dayFormFromDays`). Zmiana WYBORU GAŁĘZI widać w obu; zmiana SŁÓW —
  // podmiana „Yesterday" na datę wewnątrz gałęzi względnej — nie widać
  // W ŻADNYM. Cztery pary atrybutowe były więc ślepe dokładnie na tę połowę
  // reguły, którą ten lot wprowadza, a trzy zadeklarowane złamania stały PO
  // STRONIE ATRYBUTU.
  //
  // DLATEGO JEST PIĄTA PARA, L10-06, I CZYTA SŁOWA. Odrzucenie „przeczytaj
  // napis i porównaj" było słuszne wobec „Sep 30" i „Mar 31 2027" — to są daty,
  // czyli liczby, które gniją. Nie jest słuszne wobec „Yesterday": to słowo
  // NIEZALEŻNE od kalendarza, o ile fikstura liczy dzień w strefie czytelnika
  // (`dev/fixture-days.ts`, zmierzone pod przesuniętym zegarem
  // w `test/fixture-days.test.ts`). Gałęzie roczne zostają przy atrybucie,
  // bo ich słów nie da się zapisać bez daty.
  {
    id: "L10-02",
    lot: 10,
    position: 2,
    kind: "prescribed",
    title: "the renewal row's date is drawn by the day rule",
    contract: '.ui-craft/patterns.md — „Pattern: How a date reads"',
    prototype: {
      file: "v3/screens/renewals.js",
      lines: "51",
      value:
        '`${clock.closed ? "ended" : "ends"} ${fmtDay(r.expires)}` — a `fmtDay` (`v3/app.js:69-77`) pomija rok bieżący i nie stawia przecinka: „ends Sep 30", nie „ends Sep 20, 2026"',
    },
    route: { surface: "renewals" },
    subject: {
      selector:
        '[data-renewal-row="00000000-0000-4000-8000-00000000050e"] [data-day-form]',
      why: "pinned to ONE fixture contract, because `[data-renewal-dates]` alone matches four rows with four different readings and the pass cannot say which one it judged (distinct > 1 is an instrument failure, not a verdict)",
      app: "packages/desktop-ui/src/renewals/RenewalsSurface.tsx (data-renewal-dates > b)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    // CZEGO TA PARA NIE MÓWI, i to jest pomiar, nie skromność: nie mówi, KTÓRA
    // gałąź. Nie da się jej tego kazać na tym ekranie — sekcja wiersza umowy
    // stoi na `startAction = daysLeft − leadDays`, więc data przypięta do roku
    // kalendarzowego przestawiłaby wiersz między sekcjami w połowie roku,
    // pod parami, które o tym nie wiedzą. Gałęzie roczne stoją zmierzone dwie
    // pozycje niżej, na Bibliotece, gdzie `updatedAt` nie niesie żadnej
    // semantyki sekcji.
    status: "enforced",
  },
  {
    id: "L10-03",
    lot: 10,
    position: 3,
    kind: "prescribed",
    title: "the note's head says when it was touched in words",
    contract: '.ui-craft/patterns.md — „Pattern: How a date reads"',
    prototype: {
      file: "v3/screens/knowledge.js",
      lines: "747",
      value:
        '`updated ${esc(fmtDay(n.updated))}` — dzień sąsiedni jest SŁOWEM: „updated Yesterday", nie „updated Jul 31, 2026"',
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector: '.document-editor-meta [data-day-form="relative"]',
      why: "the reader opens the freshest note in view and the fixture's freshest note is stamped one day back from the clock, so this stop draws the relative branch every day of the year",
      app: "packages/desktop-ui/src/library/KnowledgeEditor.tsx (document-editor-meta time)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  {
    id: "L10-06",
    lot: 10,
    position: 3,
    kind: "prescribed",
    title: "and it says it in the WORD, not just in an attribute",
    contract: '.ui-craft/patterns.md — „Pattern: How a date reads"',
    prototype: {
      file: "v3/app.js",
      lines: "69-77",
      value:
        '`if (diff === -1) return "Yesterday"` — gałąź względna prototypu oddaje SŁOWO, a nie datę; to jest ta połowa reguły, której atrybut nie widzi',
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      // TEN SAM PODMIOT CO L10-03, INNY ODCZYT — i to jest cała teza tej pary.
      // L10-03 pyta „czy element deklaruje gałąź względną", ta pyta „czy stoi
      // w nim słowo, które ta gałąź obiecuje". Złamanie po stronie SŁÓW
      // (`formatDayFromDays`) zostawia `data-day-form="relative"` nietknięte
      // i czerwieni WYŁĄCZNIE tę parę — co jest jednocześnie dowodem, że ona
      // czyta co innego niż tamta.
      selector: '.document-editor-meta [data-day-form="relative"]',
      why: 'the reading head of the freshest note, read as TEXT: the fixture stamps it one reader-day back at every instant (`dev/fixture-days.ts`), so „Yesterday" is an expected value with no date and no weekday in it — the one branch of this rule whose words can be written down without writing down a calendar',
      app: "packages/desktop-ui/src/library/KnowledgeEditor.tsx (document-editor-meta time)",
    },
    read: { property: "text" },
    expect: { kind: "literal", value: "Yesterday" },
    status: "enforced",
  },
  {
    id: "L10-04",
    lot: 10,
    position: 3,
    kind: "prescribed",
    title: "a date in the current year does not print the year",
    contract: '.ui-craft/patterns.md — „Pattern: How a date reads"',
    prototype: {
      file: "v3/app.js",
      lines: "69-77",
      value:
        '`${MONTHS[d.getMonth()]} ${d.getDate()}${d.getFullYear() !== 2026 ? " " + d.getFullYear() : ""}` — rok bieżący pominięty, przecinka nie ma w żadnej gałęzi',
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector:
        '[data-note-id="00000000-0000-4000-8000-000000000905"] [data-day-form="thisYear"]',
      why: "the fixture stamps this note on 15 January of the READER's current year (three days back when the year is younger than that), so the branch stands every day except the named hole — 1, 2 and 3 January in the reader's zone, where no day is both in this year and more than a day away. The count of days is deliberately NOT written here: it is 362 or 363 depending on the leap year, and a number in a note is the thing this lot exists to stop. The hole and its edges are asserted, not promised, in `test/fixture-days.test.ts`; the arithmetic is in `dev/fixture-days.ts`",
      app: "packages/desktop-ui/src/library/NotesReading.tsx (knowledge-row-when)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  {
    id: "L10-05",
    lot: 10,
    position: 3,
    kind: "prescribed",
    title: "and a date in another year prints it with no comma",
    contract: '.ui-craft/patterns.md — „Pattern: How a date reads"',
    prototype: {
      file: "v3/app.js",
      lines: "69-77",
      value:
        '„Mar 31 2027" — rok wypisany, i przecinka nadal nie ma; `dateStyle: "medium"` stawia oba zawsze',
    },
    route: { surface: "library", layout: "notes" },
    subject: {
      selector:
        '[data-note-id="00000000-0000-4000-8000-000000000909"] [data-day-form="otherYear"]',
      why: "the fixture stamps this note 366 reader-days back, so it is a different calendar year every day of the year — the one branch with no hole at all. 366 and not 365: the longest span that FITS inside one calendar year is 365 days (1 January to 31 December of a leap year), so 365 would fail on 31 December 2028. That day is one of the twelve instants `test/fixture-days.test.ts` walks, and the break that winds 366 back to 365 goes red on exactly it",
      app: "packages/desktop-ui/src/library/NotesReading.tsx (knowledge-row-when)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 1 },
    status: "enforced",
  },
  // ══ FAZA II, LOT L9 — EKRAN REKORDU ══════════════════════════════════════
  // Wpisy 12-1, 12-4, 12-5 dokumentu przejścia. Trzy pozycje z parą; 12-6,
  // 12-7 i 12-8 stoją bez pary i z powodem — patrz `lots.L9` niżej i raport
  // lotu.
  //
  // KLUCZ LOTU JEST NAPISEM `"L9"`, a nie liczbą 9, i to nie jest ozdoba:
  // numeryczne `lot: 9` należy do poprzedniej fali, a `auditRoutedMap` grupuje
  // pozycje po `String(pair.lot)`. Precedens: `"P1"`…`"P5"` z Fazy I.
  //
  // WSZYSTKIE SZEŚĆ SĄ W MAPIE TRASOWANEJ, BO REKORD LEŻY ZA NAWIGACJĄ.
  // Przelot powłoki robi jedno wejście i zero kliknięć, więc para nad
  // `[data-record-kind]` wróciłaby stamtąd jako `NOT_MEASURED`, czyli awaria
  // przyrządu udająca werdykt.
  //
  // ── L9 · POZYCJA 1 (wpis 12-4) — RZĄD METADANYCH JEST RZĘDEM PIGUŁEK ──────
  {
    id: "L9-01a",
    lot: "L9",
    position: 1,
    kind: "restyle",
    title: "the task record's status stands in a pill, not as bare text",
    // KONTRAKT WSKAZUJE ISTNIEJĄCĄ SEKCJĘ, i to jest poprawka po przeglądzie
    // adwersarialnym: stało tu „Pattern: Metadata chip row", nagłówek, którego
    // w `.ui-craft/patterns.md` NIE MA (plik niesie czternaście sekcji
    // `## Pattern:` i tej wśród nich nie ma). Powołanie się na jedno z dwóch
    // źródeł jest odrzuceniem — a cytat na sekcję nieistniejącą jest gorszy niż
    // brak cytatu, bo czyta się jak spełniona reguła. Sekcją, która NAPRAWDĘ
    // rządzi krawędzią i promieniem plakietki, jest ta sama, którą cytuje
    // `D4-02` nad tym samym zdaniem na rekordzie PROJEKTU.
    contract:
      ".ui-craft/tokens.md (Shape, motion, depth — stan rekordu nosi tę samą krawędź, co reszta rzędu plakietek)",
    prototype: {
      file: "v3/screens/record.js",
      lines: "565",
      value:
        '`<button class="chip" data-act="status-menu"><span class="sdot …"></span>${st.label}</button>` — status JEST `.chip`, czyli `border: 1px solid var(--border-default)` z `v3/app.css:356-362`, tym samym obiektem co plakietka projektu i organizacji obok',
    },
    route: { surface: "tasks", openRecord: "[data-task-row]" },
    subject: {
      selector:
        '[data-record-kind="task"] [class*="_head_"] [class*="_state_"]',
      why: 'JEDEN narysowany element: `styles.state` i `styles.state_<stan>` siedzą na tym samym `<span>` (TaskRecordScreen.tsx:521-533), więc `[class*="_state_"]` nie ma jak trafić w dwa pudełka o różnej wartości (pułapka nr 5). Zawężone do `_head_`, bo panel operacji stoi obok w tym samym `<header>` — jego arkusz nie deklaruje `.state`, ale zawężenie jest tańsze niż sprawdzanie tego przy każdej przyszłej zmianie',
      app: "packages/desktop-ui/src/record/task-record.module.css (.state)",
    },
    read: { property: "borderTopWidth" },
    // KRAWĘDŹ, A NIE TŁO: `--surface-raised` bywa w motywie jasnym nie do
    // odróżnienia od kanwy, a pytanie tej pary brzmi „czy to jest pudełko",
    // nie „jakiego jest koloru". Wartość jest literałem, bo `1px` to nie
    // token — prototyp pisze ją wprost w regule `.chip`.
    expect: { kind: "literal", value: "1px" },
    status: "enforced",
  },
  {
    id: "L9-01b",
    lot: "L9",
    position: 1,
    kind: "restructure",
    title: "and nothing elastic stands between the pills any more",
    // Ta sama poprawka co przy `L9-01a`: sekcja „Pattern: Metadata chip row"
    // nie istnieje. Rytm rzędu — jeden odstęp ze skali zamiast rozpychacza —
    // należy do „Spacing and density", którą cytuje nad rekordem `L4-12`.
    contract:
      ".ui-craft/tokens.md (Spacing and density — rząd plakietek biegnie od lewej z jednym odstępem; rozpychacz należy do pasma, nie do rzędu)",
    prototype: {
      file: "v3/app.css",
      lines: "653",
      value:
        "`.rec-meta { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap }` — ZERO rozpychaczy; cztery pigułki `v3/screens/record.js:564-570` stoją obok siebie. Rekord PROJEKTU ma rozpychacz i go zachowuje (`v3/screens/record.css:31`), więc to jest zdanie o rekordzie zadania, nie o rodzinie",
    },
    route: { surface: "tasks", openRecord: "[data-task-row]" },
    subject: {
      selector: '[data-record-kind="task"] [class*="_head_"] [class*="_gap_"]',
      why: "przed tym lotem `<span className={styles.gap} />` z `flex: 1 1 auto` stał między stanem a plakietką projektu i odrywał ją do prawej krawędzi kolumny czytelnej (przejście, 1662 px: x ≈ 1473). `count equals 0` jest tu jedynym kształtem, który nie kłamie: para czytająca `flexGrow` po skasowaniu elementu wróciłaby NOT_MEASURED, czyli jako awaria przyrządu, a nie jako dostawa",
      app: "packages/desktop-ui/src/record/TaskRecordScreen.tsx (metadata row), task-record.module.css",
    },
    read: { property: null },
    // `count` robi `continue` PRZED strażnikiem „zero dopasowań"
    // (`verify-renderer-layout.mjs:4642-4659`), więc zero jest tu WERDYKTEM.
    // Oczekiwanie nieobecności liczy WSZYSTKIE dopasowania, także schowane
    // (`:4221-4225`) — rozpychacz przeniesiony pod `display: none` nie
    // przeszedłby jako skasowany.
    expect: { kind: "count", equals: 0 },
    status: "enforced",
  },
  {
    id: "L9-01c",
    lot: "L9",
    position: 1,
    kind: "restyle",
    title: "and the row's chips are soft rectangles, like the project record's",
    contract: ".ui-craft/tokens.md (Shape, motion, depth)",
    prototype: {
      file: "v3/app.css",
      lines: "356-362",
      value:
        "`.chip { border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--surface-raised) }`",
    },
    route: { surface: "tasks", openRecord: "[data-task-row]" },
    subject: {
      selector: '[data-record-kind="task"] [class*="_chipDashed_"]',
      why: "ten sam kształt, co para `D4-02` asertuje na rekordzie PROJEKTU, przepisany w drugim arkuszu i tam rozjechany na `--radius-full` — `restated-shape-drift`, nazwana w tym repozytorium klasa defektu. Podmiotem jest plakietka pustego stanu, bo to jedyna, którą ta fikstura rysuje (`work.overview` niesie `projectIds: []`), i jest dokładnie jedna",
      app: "packages/desktop-ui/src/record/task-record.module.css (.chip, .chipDashed)",
    },
    read: { property: "borderRadius" },
    expect: { kind: "token", token: "--radius-sm" },
    status: "enforced",
  },
  {
    // DOPISANA PRZY NAPRAWIE PO PRZEGLĄDZIE ADWERSARIALNYM L9. Raport lotu
    // wypisał glif na plakietce projektu jako NIE ZMIERZONY „bo fikstura nie ma
    // na czym go postawić" — i to było NIEPRAWDĄ, obaloną przez własny pomiar
    // tego samego lotu: `L9-01c` mierzy `[class*="_chipDashed_"]` i odczytała na
    // nim `6px`, czyli plakietka pustego stanu SIĘ RYSUJE. Glif siedzi dokładnie
    // w niej. Powód „fikstura nie ma na czym stanąć" jest prawdziwy wyłącznie
    // dla plakietki WYKONAWCY (`work.overview` nie niesie `assignment`) i dla
    // glifu na plakietce PRAWDZIWEGO projektu (`projectIds: []`).
    //
    // ETYKIETA „NIE ZMIERZONE" JEST NOŚNA (reguła 9 przeczytana w drugą stronę):
    // postawiona nad rzeczą mierzalną, zwalnia ją z dowodu na zawsze. Glif mógł
    // zniknąć z tej gałęzi, a bramka zostałaby zielona.
    id: "L9-01d",
    lot: "L9",
    position: 1,
    kind: "restyle",
    title: "and the empty project pill wears the row's glyph too",
    contract:
      ".ui-craft/tokens.md (Component layer — „a glyph's size is a statement about WHERE it stands\"; glif stoi w treści rekordu, więc jest jej częścią, nie ozdobą chromu)",
    prototype: {
      file: "v3/screens/record.js",
      lines: "567-568",
      value:
        '`<button class="chip" …>${icon("project")}${esc(p.title)}</button>` i `${icon("org")}${esc(o.name)}` — KAŻDA plakietka rzędu `.rec-meta` otwiera się glifem, a `v3/app.css:364` daje mu własny stopień (`.chip svg { width: 0.75rem; height: 0.75rem; opacity: 0.7 }`)',
    },
    route: { surface: "tasks", openRecord: "[data-task-row]" },
    subject: {
      selector: '[data-record-kind="task"] [class*="_chipDashed_"] svg',
      why: 'gałąź pustego stanu jest JEDYNĄ, którą ta fikstura rysuje, i jest to ta sama gałąź, na której `L9-01c` odczytała promień — czyli podmiot jest dowiedziony żywy przez sąsiednią parę, a nie założony. `atLeast: 1`, a nie `equals 1`: zdaniem jest „plakietka nosi glif", a nie spis ludności rzędu — drugi glif dołożony kiedyś obok nie jest złamaniem tej reguły. `atLeast` czyta liczbę NARYSOWANYCH (`verify-renderer-layout.mjs:4224-4226`), więc `<svg>` schowany albo o zerowej powierzchni nie zaliczy się jako obecny',
      app: "packages/desktop-ui/src/record/TaskRecordScreen.tsx (gałąź `taskProjects.length === 0`)",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 1 },
    status: "enforced",
  },
  // ── L9 · POZYCJA 2 (wpis 12-5) — PANEL PLAN/DEADLINE PRZESTAJE BYĆ MARTWY ──
  // DWIE Z PIĘCIU CZĘŚCI KOMÓRKI PROTOTYPU, i tylko na jedną z nich da się
  // postawić parę. Druga — wiersz autorstwa przeniesiony DO komórki — jest
  // oddana w kodzie i NIEMIERZALNA w tej fiksturze: rekord czyta zadanie
  // z `work.overview`, a harness nie kładzie tam `plannedBy` (jest wyłącznie
  // na kopii z `task.list`, `dev/CollaborationHarness.tsx:433-437`). Zasianie
  // go NIE JEST darmowe — `TaskBoardLayout.tsx:152` rysuje wtedy etykietę
  // planisty na KAŻDEJ karcie tablicy, czyli przestawia inny ekran, którego
  // ten lot nie mierzy. Wypisane w `NOT_COVERED` z warunkiem wyjścia.
  {
    id: "L9-02a",
    lot: "L9",
    position: 2,
    kind: "restyle",
    title: "each half of the plan panel names its kind with a glyph",
    // Trzecia poprawka tej samej zmyślonej nazwy. Glif wewnątrz TREŚCI rekordu
    // (a nie chromu) jest przedmiotem akapitu „A glyph's size is a statement
    // about WHERE it stands" w warstwie komponentów kontraktu — tego samego,
    // z którego wyszły pary `D9-01a`/`D9-01b`.
    contract:
      ".ui-craft/tokens.md (Component layer — „a glyph's size is a statement about WHERE it stands\"; mikroetykieta nosi ten sam rysunek, co rzecz, którą nazywa)",
    prototype: {
      file: "v3/screens/record.css",
      lines: "224-229",
      value:
        '`.rc-plan-k { display: inline-flex; align-items: center; gap: 0.3125rem; text-transform: uppercase }` + `.rc-plan-k svg { width: 0.75rem; height: 0.75rem }`, wypełnione w `v3/screens/record.js:477` (`icon("today")Plan`) i `:489` (`icon("flag")Deadline`)',
    },
    route: { surface: "tasks", openRecord: "[data-task-row]" },
    subject: {
      selector: '[data-record-kind="task"] [class*="_planKey_"] svg',
      why: "obie komórki rysują się BEZWARUNKOWO (TaskRecordScreen.tsx — brak gałęzi wokół `.plan`), więc `atLeast: 2` pyta o obie połowy naraz i nie da się go zaspokoić jedną. Liczba, a nie rozmiar: rozmiar glifu jest już pilnowany globalną regułą `svg` powłoki, a tego, że glif W OGÓLE STOI, nie pilnowało nic",
      app: "packages/desktop-ui/src/record/task-record.module.css (.planKey svg)",
    },
    read: { property: null },
    expect: { kind: "count", atLeast: 2 },
    status: "enforced",
  },
  // ── L9 · POZYCJA 3 (wpis 12-1) — TA SAMA TREŚĆ NIE STOI NA EKRANIE DWA RAZY ─
  // OBIE PARY SĄ `pending` I OBIE SĄ DZIŚ CZERWONE, i to jest CAŁY produkt tej
  // pozycji w tym locie. Wpis 12-1 czyta się jak usterka i nią jest, ale jego
  // lekarstwo — zamknięcie panelu podglądu przy otwartym rekordzie — odbiera
  // rekordowi zadania pięć zdolności, których on nie ma u siebie: edytor
  // tytułu/kontekstu/następnego kroku (`RealApp.tsx:4337-4367`), załączniki,
  // przypisanie, rezerwację w kalendarzu i usunięcie. Nagłówek
  // `record/TaskRecordScreen.tsx:59-64` deklaruje to wprost, a sam ekran
  // odsyła tam zdaniem w treści („The inspector beside this record is where it
  // is written"). To jest DECYZJA FUNKCJONALNA, nie farba.
  //
  // ŻE TO JEST DO ZROBIENIA, WIDAĆ Z TEGO SAMEGO WYRAŻENIA. Trzecie ramię
  // rekordowe `inspectorDetailOpen` jest już ubezpieczone: `projectFullView`
  // (`RealApp.tsx:1437-1439`) wyłącza podgląd nad rekordem projektu — i tamten
  // ekran przyjął operacje inspektora slotami (`ProjectRecordScreenProps
  // .actions`, `.outcomeEditor`, „passed in rather than rebuilt so the
  // operations move with the screen instead of disappearing with it"). Czyli
  // precedens jest CZYSTY i pokazuje cenę: najpierw przenieś operacje, potem
  // zamknij panel.
  {
    id: "L9-03a",
    lot: "L9",
    position: 3,
    kind: "restructure",
    title: "the preview panel closes when the task record takes the screen",
    // „Pattern: Record screen" NIE ISTNIEJE w kontrakcie. Sekcją, która mówi,
    // co stoi OBOK kolumny czytelnej rekordu, jest „Pattern: Record body and
    // its rail": kolumna czytelna niosąca wszystko, co o rekordzie napisano,
    // i przy niej WĄSKA SZYNA WYJŚĆ z włoskową krawędzią — dwie kolumny w jednej
    // siatce, i nic trzeciego.
    contract:
      '.ui-craft/patterns.md — „Pattern: Record body and its rail" (obok kolumny czytelnej stoi wąska szyna WYJŚĆ, nie druga kopia treści)',
    prototype: {
      file: "v3/screens/record.js",
      lines: "222-226",
      value:
        '`rcShell` — `<div class="scroller"><div class="record"><div class="rc-shell"><div class="rc-main">…` — JEDNA kolumna, zero paneli obok; prototyp nie ma na rekordzie panelu podglądu w ogóle',
    },
    route: { surface: "tasks", openRecord: "[data-task-row]" },
    subject: {
      selector: "aside.inspector.open",
      why: 'klasa `open` jest dokładana WYŁĄCZNIE przy `inspectorDetailOpen` (RealApp.tsx:4233), więc podmiot jest dosłownie zdaniem „panel podglądu jest otwarty". Mierzony NA PRZYSTANKU z otwartym rekordem zadania — poza nim to samo zdanie jest o czymś innym i nie jest wadą. Efekt `RealApp.tsx:772-774` zapala `selectedTaskId` bezwarunkowo z kontekstu, więc otwarcie rekordu ZAWSZE zapala podgląd tego samego zadania',
      app: "packages/desktop-ui/src/RealApp.tsx:1440-1448 (inspectorDetailOpen — ramię `selectedTask` bez strażnika)",
    },
    read: { property: null },
    expect: { kind: "count", equals: 0 },
    // STATUS JEST DOSŁOWNIE „pending: LOT L9" I NIC WIĘCEJ. Pierwsza wersja
    // dopisywała za nim „— decyzja funkcjonalna Kacpra" i przelot rzucił
    // `ROUTED_UNKNOWN_STATUS` na obu motywach: ten napis JEST danymi, po
    // których pass rozstrzyga koszt pomiaru, a nie miejscem na notatkę.
    // Powód stoi w komentarzu wyżej, gdzie jest czytany przez ludzi.
    status: "pending: LOT L9",
  },
];

/**
 * POZYCJE LOTÓW 2-6 BEZ PARY. Ta lista jest deliverable równym mapie: mówi
 * lotom, GDZIE nie ma dowodu, i mówi to ZANIM lot odda robotę.
 */
export const VISUAL_LANGUAGE_ROUTED_NOT_COVERED = [
  {
    // DRUGIE ŻYWE WYSTĄPIENIE WPISU 12-1, ZMIERZONE I ZDJĘTE W TYM SAMYM
    // PRZELOCIE — i to jest wpis o PRZELOCIE, nie o produkcie.
    //
    // Recon tego lotu przeczytał w kodzie, że rekord SZANSY zostawia panel
    // podglądu otwarty tak samo jak rekord zadania: `onClick` karty woła
    // `onSelectRecord` → `setSelectedStrategicId` (`pipeline/PipelineSurface
    // .tsx:326`, `RealApp.tsx:2633`), a efekt czyszczący tę wartość
    // (`RealApp.tsx:775-783`) jest warunkowany `taskId || projectId ||
    // organizationId`, których kontekst szansy nie niesie
    // (`client/shell-navigation.ts:588-596`). Para `L9-03b` została napisana
    // dokładnie na to.
    //
    // WRÓCIŁA `MATCH` NA OBU MOTYWACH — `aside.inspector.open` liczy tam ZERO.
    // Przyczyna nie jest w produkcie: krok trasy otwierający rekord wysyła
    // WYŁĄCZNIE `new MouseEvent("dblclick")` (`verify-renderer-layout.mjs:7423`),
    // bez ani jednego `click`, więc `onClick` karty nigdy nie biegnie i nic nie
    // zaznacza. Rekord ZADANIA zapala podgląd inną drogą — efektem z
    // `activeContext.taskId` (`RealApp.tsx:772-774`) — i dlatego TAM ta sama
    // para jest czerwona.
    //
    // Para została ZDJĘTA, a nie zostawiona zieloną: `enforced` nad zerem,
    // którego przyczyną jest brak kliknięcia, to jest dokładnie „pusta
    // fikstura chroni fałszywą asercję" — zdanie prawdziwe o przelocie
    // i nieprawdziwe o produkcie.
    //
    // WARUNEK WYJŚCIA: krok trasy, który przed otwarciem rekordu ZAZNACZA
    // wiersz/kartę tym samym gestem co człowiek (`click`, potem `dblclick`).
    // To jest przebudowa przelotu, nie pozycja ekranowa — i ta sama przebudowa
    // odblokowuje wpis `D4` o polu edycji komentarza, wypisany niżej.
    lot: "L9",
    position: 3,
    scope: "rekord szansy — drugie wystąpienie duplikatu treści",
    title: "the deal record's preview state is unreachable by this walk",
    prototype:
      "v3/screens/record.js:222-226 (`rcShell` — jedna kolumna, zero paneli obok, na każdym rodzaju rekordu)",
    app: "packages/desktop-ui/src/RealApp.tsx:1440-1448 (ramię `selectedStrategicRecord` bez strażnika)",
    why:
      "Krok `openRecord` wysyła sam `dblclick`, więc `onClick` karty lejka nigdy nie biegnie i nic nie zaznacza; " +
      "panel podglądu jest przy tym przystanku zamknięty Z POWODU PRZELOTU, nie z powodu strażnika w kodzie. " +
      "Para nad tym stanem byłaby zielona nad żywym rozjazdem — zmierzone 2026-08-14, oba motywy.",
  },
  {
    // DRUGA POŁOWA POZYCJI 2 LOTU L9, ODDANA W KODZIE I NIEMIERZALNA W TEJ
    // FIKSTURZE. Prototyp trzyma wiersz autorstwa WEWNĄTRZ komórki planu
    // (`.rc-plan-by` w `.rc-plan-cell`), aplikacja trzymała go pod całym
    // panelem; lot go przeniósł. Żadna para tego nie potwierdzi, bo element
    // nigdy się w harnessie nie rysuje.
    //
    // I TO NIE JEST „ZA TRUDNE DO ZMIERZENIA", TYLKO „NIE MA CZEGO MIERZYĆ" —
    // dokładnie ta klasa, którą ten plik zbiera od fal. Rekord czyta zadanie
    // z `work.overview`, a harness kładzie `plannedBy` WYŁĄCZNIE na kopii
    // z `task.list` (`dev/CollaborationHarness.tsx:433-437`), żeby zapalić
    // plakietkę autorstwa na Dzisiaj.
    //
    // WARUNEK WYJŚCIA I JEGO CENA, POLICZONA PRZED ZOSTAWIENIEM TEGO WPISU:
    // dopisać `plannedBy` do zadania w `work.overview`. Kosztuje to drugi
    // ekran — `tasks/TaskBoardLayout.tsx:152` rysuje wtedy etykietę planisty
    // na KAŻDEJ karcie tablicy, czyli przestawia przystanek `tasks:board`,
    // którego ten lot nie mierzy i którego nie miał ruszać. Lot, który weźmie
    // tę fiksturę, bierze razem z nią tamten przystanek.
    lot: "L9",
    position: 2,
    scope: "wiersz autorstwa planu — przeniesiony do komórki, nierysowany",
    title: "the plan cell's authorship line is drawn by no fixture state",
    prototype:
      "v3/screens/record.css:235-240 + v3/screens/record.js:481-482 (`.rc-plan-by` WEWNĄTRZ `.rc-plan-cell`)",
    app: "packages/desktop-ui/src/record/TaskRecordScreen.tsx (plan cell, `planned`), task-record.module.css (.authorship)",
    why:
      "`plannedSentence` zwraca `undefined`, dopóki zadanie nie niesie `plannedBy`, a zadanie z `work.overview` " +
      "w tym harnessie go nie niesie. Element nie wchodzi do DOM-u, więc para nad nim wróciłaby NOT_MEASURED — " +
      "awaria przyrządu, nie werdykt. Dowodem jest tu źródło, nie piksel.",
  },
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
    app: "packages/desktop-ui/src/help/TopicHelp.tsx:21-51 + help/topic-help.module.css:21-29 (StrategicDepthSurface.tsx:897, MeetingsSurface.tsx:1457, pipeline/PipelineSurface.tsx:980, :1001, :1002, library/NotesReading.tsx:362, library/SourcesReading.tsx:162, :371, renewals/RenewalsSurface.tsx:454, :1087)",
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
      "`desktop-ui/test/calendar.interaction.test.tsx`. " +
      "DOPISEK PRZYRZĄDU P1 FAZY I, 2026-08-13: PRZYSTANEK NA KALENDARZU WRÓCIŁ " +
      "(`ROUTED_ARRIVAL.calendar`), więc od tego przelotu nieosiągalny jest już wyłącznie PODMIOT, " +
      "a nie ekran. Ten wpis ZOSTAJE i jego warunek wyjścia się nie zmienia — para P1-02 mierzy na " +
      "tym samym przystanku sufit kolumny czytelnej, bo JEJ podmiot rysuje się w gałęzi ODMOWY, " +
      "a znacznik pomocy nie. Kto będzie ten wpis kiedyś zamykał, nie potrzebuje już markera: " +
      "potrzebuje tygodnia ze spotkaniem.",
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
    // adresie (`verify-renderer-layout.mjs:124`), więc fikstura jest jedna.
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
    app: "packages/desktop-ui/src/pipeline/pipeline.module.css:346-348",
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
    app: "packages/desktop-ui/src/styles.css:6443-6455 (`.library-count`)",
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
    app: "packages/desktop-ui/src/styles.css:6570-6585, NotesReading.tsx:474-498",
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
    app: "packages/desktop-ui/src/SettingsSurface.tsx:945-961, styles.css:7540, :7549-7551",
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
    app: "packages/desktop-ui/src/settings/CommercialDefaultsSection.tsx:325-356, WorkingDaySection.tsx:128-146",
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
    app: "packages/desktop-ui/src/styles.css:2737-2744 (`.status-list li`), settings/commercial-defaults-section.module.css:76-87 (wiersz etapu)",
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
  {
    // ── PRZYRZĄD P2, POZYCJA 6, POŁOWA „SKRZYNKA" ─────────────────────────────
    // BLIŹNIAK Z DZISIAJ STOI W `VISUAL_LANGUAGE_NOT_COVERED` (mapa powłoki).
    // Przyczyna jest IDENTYCZNA i dlatego wpis jest krótki: powód pełną frazą
    // stoi tam, tutaj stoją liczby tej fikstury.
    lot: "P2",
    position: 6,
    scope: "druga połowa pozycji 6 — separator wiersza na Skrzynce",
    title: "the row's hairline separator, on Inbox",
    prototype:
      "v3/screens/inbox.css:34-41 (`.ib-row { border-bottom: 1px solid var(--border-subtle) }`) + `:42` (`.ib-row:last-child { border-bottom: 0 }`)",
    app: "packages/desktop-ui/src/inbox.module.css — od lotu L4 wiersz niesie `border-bottom`, a `.row:last-child` je zeruje; niezmierzone zostaje, czy oba te zdania są prawdziwe",
    why:
      "Fikstura czyni asercję FAŁSZYWĄ, nie „niewygodną”. `attention.inbox` harnessu niesie DOKŁADNIE " +
      'JEDNĄ pozycję (`dev/CollaborationHarness.tsx:859-876`, `unreadCount: 1`, `destination.kind: "task"`, ' +
      "czyli skrzynka `work`), więc jedyny wiersz JEST wierszem ostatnim, a prototyp każe ostatniemu " +
      "mieć `border-bottom: 0`. Para asertująca `1px` byłaby czerwona wobec kodu zgodnego z prototypem; " +
      "para asertująca `0px` byłaby zielona nad listą bez ani jednego separatora.",
    exit:
      "druga pozycja w `attention.inbox` fikstury, w TEJ SAMEJ skrzynce — czyli z `destination.kind` " +
      "innym niż `capture`. Pozycja przechwytu utworzy DRUGĄ listę po jednym wierszu i niczego nie odblokuje.",
    greenWrong:
      "Lista bez ANI JEDNEGO separatora dalej przejdzie tu na zielono. Druga połowa tej " +
      "porażki — separator 2 px złożony z odstępu pojemnika i krawędzi wiersza — od lotu L4 " +
      "cicha NIE JEST: czyta ją `P2-03d` (`rowGap` pojemnika), tak samo jak `P2-01d` na Dzisiaj.",
  },
  {
    // ── PRZYRZĄD P2, POZYCJA 3 — DRUGA SKRZYNKA TEGO EKRANU ──────────────────
    // Trzeci z sześciu żywych pojemników tej rodziny, których rekonesans lotu
    // L4 naliczył dwa razy więcej niż dokument przejścia. Dwa pozostałe
    // niemierzone są na Dzisiaj i stoją w `VISUAL_LANGUAGE_NOT_COVERED`.
    lot: "P2",
    position: 3,
    scope:
      "druga skrzynka tego ekranu — pojemnik „Didn't make it into the system”",
    title: "the capture mailbox's list card is never drawn, so never judged",
    prototype:
      "v3/screens/inbox.css:27-30 (`.ib-list`, użyta przez `inbox.js` DWA razy — wpis 3-1 dokumentu przejścia mówi wprost „dwie karty `div.ib-list`”)",
    app: 'packages/desktop-ui/src/InboxSurface.tsx (drugie `<ul className={styles.rows} role="list">`, sekcja `data-inbox-section="capture"`) + inbox.module.css',
    why:
      "Fikstura, nie brak przystanku, i to jest zmierzone sondą na tym przystanku: `attention.inbox` " +
      "harnessu niesie DOKŁADNIE JEDNĄ pozycję, a jej `destination.kind` to „task”, czyli skrzynka " +
      "`work`. Skrzynka przechwytu jest pusta i rysuje `<p>` zamiast `<ul>` — para wróciłaby " +
      "`ROUTED_NOT_MEASURED`, czyli awarią przyrządu nad poprawnym kodem. Dziś obie skrzynki niosą " +
      "IDENTYCZNĄ regułę `.rows`, więc zieleń pary z pierwszej jest o drugiej przypadkowo " +
      "prawdziwa — i przestanie nią być w chwili, w której ktokolwiek rozdzieli te dwie reguły. " +
      "Po to jest ten wpis.",
    exit:
      "druga pozycja w `attention.inbox` fikstury z `destination.kind` RÓWNYM „capture” — czyli " +
      "dokładnie ta, której wpis o separatorze wyżej NIE chce, bo tam potrzebne są dwa wiersze " +
      "w JEDNEJ liście. Jedna pozycja fikstury zamyka jedno z tych dwojga, nigdy oba naraz.",
    greenWrong:
      "Druga karta Skrzynki może zostać nieoddana albo oddana inaczej niż pierwsza — bez ramki, " +
      "bez przycięcia albo z własnym odstępem — przy komplecie par P2 zielonych.",
  },
  {
    // ── PRZYRZĄD P2, POZYCJA 5 — TRZECI EKRAN RODZINY, TACA KALENDARZA ────────
    lot: "P2",
    position: 5,
    scope: "trzeci ekran rodziny — taca Kalendarza",
    title: "the Calendar tray has no container measurement",
    prototype:
      "v3/screens/calendar.css:200-203 (`.cal-tray` — ta sama trójka deklaracji co `.td-list` i `.ib-list`) + `:204-209` (`.cal-tray-item` z `border-bottom` i BEZ promienia)",
    app: 'packages/desktop-ui/src/CalendarSurface.tsx (`<ul className={styles.tray} role="listbox">`), calendar.module.css — lot L4 dowiózł tu chrom karty W CIEMNO: ramkę, promień, tło `--surface-content`, róg na wierszach skrajnych i krawędź działową na `.trayRow`, ANI RAZU nie zobaczone przez żaden przelot',
    why:
      "ZMIERZONE, NIE ZAŁOŻONE, i przyczyną jest FIKSTURA, nie brak przystanku. Taca rysuje się " +
      "wyłącznie przy `tray.length > 0` (`CalendarSurface.tsx:827`), a `tray` to `approachingUnplanned(...)` " +
      "(`:598`), które ODRZUCA każde zadanie z `startAt` (`today-plan.ts`, `if (task.startAt !== undefined) return false`). " +
      "Jedyne zadanie tej fikstury MA `startAt` — właśnie po to, żeby sekcja planu na Dzisiaj nie była " +
      "pusta (spłata wpisu przy `D2-09b`). Para napisana dziś wróciłaby `ROUTED_NOT_MEASURED`, czyli " +
      "awarią przyrządu, a nie werdyktem o produkcie.",
    exit:
      "JEDNA rzecz, nie dwie: zadanie BEZ `startAt`, z `dueAt` wewnątrz horyzontu, w " +
      "`dev/CollaborationHarness.tsx`. Warunek był dwuczęściowy, dopóki Kalendarz nie miał markera " +
      "przybycia — marker DOPISAŁ przyrząd P1 tego samego dnia (`ROUTED_ARRIVAL.calendar` = " +
      '`#main-content [class*="_week_"]`), więc druga część jest już spłacona i nie wolno jej tu ' +
      "powtarzać: warunek wyjścia żądający roboty, która stoi zrobiona, jest wpisem, który nigdy " +
      "nie zostanie zamknięty.",
    greenWrong:
      "Chrom karty na Kalendarzu jest tu od lotu L4 NAPISANY, ale ani razu ZMIERZONY — może być " +
      "napisany źle (na wierszu zamiast na pojemniku, z odstępem, bez rogu na wierszu skrajnym) " +
      "albo cicho odjechać od dwóch pozostałych ekranów tej rodziny, i żaden przelot tego nie " +
      "zobaczy. To jest ten sam rodzaj ciszy, co przed L4, tylko po drugiej stronie dostawy.",
  },
  {
    // ── PRZYRZĄD P4 — KONTROLKI, KTÓRE RYSUJĄ SIĘ DOPIERO PO OTWARCIU ────────
    //
    // JEDEN WPIS NA CAŁĄ RESZTĘ PRODUKTU, i to jest świadome: rozbicie go na
    // pozycję za pozycją udawałoby, że każda z nich ma osobny warunek wyjścia.
    // Mają WSPÓLNY, i on jest przebudową przelotu, nie robotą ekranową.
    lot: "P4",
    position: 3,
    scope: "kontrolki, które rysują się dopiero PO otwarciu czegoś",
    title:
      "native controls behind a panel, a dialog, a menu or a lens state have no measurement",
    prototype:
      "v3/app.js:1921-1961 (`popover`) + v3/app.css:886-892 (`.pop`) — prototyp robi KAŻDY wybór przyciskiem otwierającym menu, więc zdanie, którego brakuje pomiaru, jest po tamtej stronie jedno i to samo na wszystkich czternastu ekranach",
    app: "packages/desktop-ui/src — `<select>` stoi w źródle renderera kilkadziesiąt razy, w ~25 plikach; ten przyrząd widzi z nich SZEŚĆ narysowanych (3 na Zadaniach, 1 na Spotkaniach, 2 poza jego zasięgiem w Ustawieniach i na rekordzie, gdzie mierzą je C5-02a/b i C5-03)",
    why:
      "Ta mapa zna kroki `surface`, `layout`, `treeKey`, `openRecord`, `recordTab`, `settingsMode` " +
      "i `openPopover` — nie ma kroku „otwórz panel deala”, „otwórz dialog” ani „rozwiń wiersz”. " +
      "Poza zasięgiem zostają: panel deala na Lejku, dialogi i menu, `SavedViewFilterForm` (rysuje " +
      "się dopiero przy otwartym zapisanym widoku, a fikstura harnessu ma ZERO zapisanych widoków) " +
      "oraz stan soczewki `library/sources`. Cisza tego przyrządu o nich NIE jest zdaniem o nich — " +
      "i to jest cały powód, dla którego ten wpis istnieje zamiast pary napisanej „na wyrost”, " +
      "która wróciłaby `ROUTED_NOT_MEASURED`, czyli awarią przyrządu.",
    exit:
      "DWUCZĘŚCIOWY, i obie części to robota przelotu albo fikstury, nie ekranu. PIERWSZA: krok " +
      "trasy, który otwiera coś INNEGO niż dymek tej aplikacji. Istniejący `openPopover` się do " +
      "tego nie nadaje i to jest sprawdzone w kodzie, nie założone — po kliknięciu wyzwalacza " +
      'wymaga on narysowanego `[role="dialog"].inline-popover` (`verify-renderer-layout.mjs:7198-7240`) ' +
      "i inaczej pada jako awaria trasy, więc panel deala, dialog, rozwinięty wiersz ani menu " +
      "natywnego `<select>` nie przejdą przez ten krok. DRUGA: fikstura z co najmniej jednym " +
      "zapisanym widokiem. Do tego czasu czwarty `<select>` Zadań — `ready` w `SavedViewFilterForm` " +
      "— nie jest liczony przez P4-01a i nikt nie ma prawa czytać jego zieleni jako zdania o tym polu.",
    greenWrong:
      "Faza II może zamknąć P4-01a/b i P4-02a/b, przenosząc te same kontrolki o jedno kliknięcie " +
      "dalej — do panelu, do dialogu albo do rozwijanego wiersza — i cały ten przyrząd zrobi się " +
      "zielony nad produktem, który dalej wybiera natywnym widżetem. Tego NIE zobaczy żaden dzisiejszy " +
      "przelot; zobaczy to Kacper przy odbiorze obok prototypu.",
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
  //
  // 156 → 168 PRZY PRZYRZĄDZIE P1 FAZY I, 2026-08-13, I NIE JEST TO ANI LOT
  // EKRANOWY, ANI ROZPAD ISTNIEJĄCYCH POZYCJI: to PRZYRZĄD nad rzeczą, która
  // rządzi dwunastoma ekranami naraz — sufitem kolumny czytelnej. Dwanaście
  // par, po jednej na ekran za nawigacją; trzynasta (Dzisiaj) stoi w mapie
  // powłoki, bo tam da się ją zmierzyć bez kliknięcia. Osiem par siada na
  // PRZYSTANKACH, KTÓRE JUŻ ISTNIAŁY (pipeline, renewals, meetings,
  // organizations, people, library|notes, settings, tasks+openRecord) i nie
  // kosztują ani sekundy przelotu więcej; nowe są CZTERY — `{surface:"tasks"}`
  // i `{surface:"projects"}` (na trasie z `openRecord` ekranu listy nie ma już
  // w DOM-ie) oraz `{surface:"calendar"}` i `{surface:"inbox"}`, których ta
  // mapa nie odwiedzała nigdy. Markery przybycia dla dwóch ostatnich dopisane
  // w tym samym przebiegu (`ROUTED_ARRIVAL.inbox`, `.calendar`).
  //
  // `notCovered` SIĘ NIE RUSZA, i to jest pomiar, nie przeoczenie: Kalendarz
  // jest POKRYTY parą, a nie odmówiony. Powód stoi przy P1-02 i przy
  // `ROUTED_ARRIVAL.calendar` — podmiot tej pary rysuje się w gałęzi ODMOWY.
  //
  // 168 → 172 PRZY PRZYRZĄDZIE P2 FAZY I, 2026-08-13, I NIE JEST TO LOT
  // EKRANOWY: to drugi przyrząd tej fazy, nad rzeczą, której nie pyta ŻADNA
  // z dotychczasowych par — czy lista wierszy stoi w pojemniku z chromem karty.
  // Cztery pary na dwóch pozycjach, wszystkie na Skrzynce, wszystkie na
  // PRZYSTANKU, KTÓRY JUŻ ISTNIEJE (`{surface:"inbox"}` dojechał tu razem
  // z P1-03) — czyli ani sekundy przelotu więcej i ani jednej edycji
  // w `ROUTED_ARRIVAL`. Pozycje 1-2 briefu (Dzisiaj) stoją w mapie powłoki.
  //
  // 172 → 180 PRZY PRZYRZĄDZIE P4 FAZY I, 2026-08-13, I TEŻ NIE JEST TO LOT
  // EKRANOWY: to trzeci przyrząd tej fazy, nad rzeczą, o którą nie pyta ŻADNA
  // z dotychczasowych par — czy na powierzchni treści stoi kontrolka, którą
  // rysuje system. `grep -c appearance scripts/visual-language-pairs.mjs` → 0,
  // to samo w `verify-renderer-layout.mjs`; cztery pary dotykające `<select>`
  // (C5-01c, C5-02a/b, C5-03) mierzą wyłącznie GEOMETRIĘ, a spis B1 czyta ich
  // TŁO i wyłącza natywny widżet własnym zapisem. Osiem par na trzech
  // pozycjach, WSZYSTKIE na przystankach, które już istniały (`tasks` dojechał
  // tu z P1-04, `meetings` z D1-06, `pipeline`, `organizations`, `people`
  // i `renewals` stoją od Fazy 3 i D6) — czyli ani sekundy przelotu więcej
  // i ani jednej edycji w `ROUTED_ARRIVAL`. To jest różnica wobec P1, który tę
  // tabelę rusza; dwa przyrządy tej fazy nie wchodzą w nią obaj.
  //
  // CZTERY Z TYCH OŚMIU SĄ `enforced` I ZIELONE W DNIU NAPISANIA, i to jest
  // KONTROLA DODATNIA, nie ozdoba — powód stoi przy wpisach `P4-03*`.
  //
  // 180 → 182 PRZY PRZYRZĄDZIE P5 FAZY I, 2026-08-13, I TEŻ NIE JEST TO LOT
  // EKRANOWY: to czwarty przyrząd tej fazy, nad rzeczą, o którą nie pyta ŻADNA
  // z dotychczasowych par — czy narysowana waga kroju należy do skali, którą
  // tokeny DEKLARUJĄ. `grep -c fontWeight scripts/visual-language-pairs.mjs`
  // dawał przed tym wpisem 3 (`D2-01b`, `D2-01d`, `L5-04`) i wszystkie trzy są
  // asercjami o JEDNYM podmiocie z JEDNĄ wpisaną liczbą; zbiór dozwolony nie
  // istniał jako dana po żadnej stronie, a `tokens.css` nie deklarował ani
  // jednej wagi. Dwie pary na JEDNEJ pozycji, obie na przystankach, które już
  // istniały (trasy `L4-01b` i `L4-01c`) — ani sekundy przelotu więcej i ani
  // jednej edycji w `ROUTED_ARRIVAL`.
  //
  // OBIE SĄ `pending` I TO JEST ZAMIERZONE: para `pending`, która NIE pasuje,
  // jest ciszą, a te dwie nie pasują (580 i 620 wobec rozwiązanego 600). Ich
  // rolą jest być JEDYNYM wyłącznikiem werdyktu o wadze — patrz
  // `TYPE_WEIGHT_OWNER` na dole tego pliku.
  //
  // 182 → 186 PRZY LOCIE L10 FAZY II, 2026-08-14, I SĄ TO DWIE NOWE POZYCJE:
  // wiersz Odnowień i Biblioteka. Cztery pary na dwie pozycje, i rozdrobnienie
  // ma jedną przyczynę, policzalną: reguła daty ma TRZY gałęzie, a fikstura
  // dosięga wszystkich trzech wyłącznie na Bibliotece — `updatedAt` notatki nie
  // niesie semantyki sekcji, więc da się w nim przypiąć rok, a `expiresAt`
  // umowy przestawia wiersz między sekcjami. Para bez rozbicia byłaby zielona
  // nad wersją, w której dwie z trzech gałęzi nigdy się nie narysowały.
  //
  // 186 → 187 PO PRZEGLĄDZIE ADWERSARIALNYM L10, 2026-08-14, i JEST TO
  // ZAOSTRZENIE, nie nowa pozycja: L10-06 stoi na TYM SAMYM podmiocie co
  // L10-03 (głowa czytelni) i na tej samej pozycji 3, tylko czyta SŁOWA
  // zamiast atrybutu. Powód jest zmierzony, nie estetyczny: cztery pary
  // atrybutowe przechodzą przy podmianie „Yesterday" na datę, bo napis
  // i atrybut wychodzą z DWÓCH osobnych wywołań. `positionsWithPairs` się nie
  // rusza — rośnie tylko `pairs` tutaj i `lots.10.pairs` niżej.
  //
  // 187 → 188 PRZY LOCIE L4 FAZY II, 2026-08-14, i NIE JEST TO nowa pozycja:
  // `P2-03d` czyta `rowGap` pojemnika Skrzynki, czyli tę jedną własność, której
  // przed tym lotem nie czytała ANI JEDNA para obu map, a którą oba wpisy
  // `NOT_COVERED` przyrządu P2 nazywały jako jedyną cichą drogę porażki lotu
  // (separator 2 px złożony z krawędzi wiersza i odstępu listy). Bliźniak stoi
  // w mapie powłoki jako `P2-01d`. `positionsWithPairs` się nie rusza — rośnie
  // `pairs` tutaj i `lots.P2.pairs` niżej, i muszą rosnąć razem.
  //
  // 188 → 193 PRZY LOCIE L9 FAZY II, 2026-08-14, I SĄ TO TRZY NOWE POZYCJE —
  // ekran rekordu ZADANIA, którego rzędu metadanych i panelu planu nie mierzyła
  // dotąd ANI JEDNA para obu map. Sprawdzone przed dopisaniem: jedyna para nad
  // tym panelem, `L4-02a`, czyta `display: grid`, czyli że komórki są DWIE —
  // nie to, co w nich stoi.
  //
  // PIĘĆ PAR NA PIĘĆ, I TAK SIĘ ROZKŁADAJĄ: cztery (`L9-01a/b/c`, `L9-02a`) są
  // `enforced` i zielenieją razem z farbą tego lotu, jedna (`L9-03a`, wpis 12-1)
  // jest `pending`, bo jej lekarstwo jest decyzją funkcjonalną Kacpra, a nie
  // farbą — powód stoi przy parze. Pierwsza wersja tego akapitu liczyła tu
  // sześć par przy przyroście o pięć (cztery `enforced` + „dwie `L9-03a/b`
  // pending"), bo została napisana przed zdjęciem bliźniaka i nie przeliczona
  // po nim. Bliźniak `L9-03b` nad rekordem SZANSY wrócił `MATCH` na obu
  // motywach — krok trasy otwiera rekord samym `dblclick` i nigdy nie zaznacza
  // karty — więc został zdjęty do `notCovered` z warunkiem wyjścia.
  //
  // 193 → 194 PRZY NAPRAWIE PO PRZEGLĄDZIE ADWERSARIALNYM LOTU L9, i NIE JEST
  // TO nowa pozycja: `L9-01d` stoi na pozycji 1, na tym samym podmiocie co
  // `L9-01c` (plakietka pustego stanu), i mierzy to, co raport lotu ogłosił
  // NIEMIERZALNYM — glif w tej plakietce. `positionsWithPairs` się nie rusza.
  pairs: 194,
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
  //
  // 14 → 16 PRZY PRZYRZĄDZIE P2 FAZY I, 2026-08-13, I OBA PRZYROSTY SĄ
  // ODMOWAMI Z ZAPISANYM WARUNKIEM WYJŚCIA, nie długiem bez adresu: separator
  // wiersza na Skrzynce (jedna pozycja fikstury, więc jedyny wiersz jest
  // ostatnim) i taca Kalendarza (jedyne zadanie fikstury ma `startAt`, więc
  // taca się nie rysuje wcale). Trzeci wpis tej samej pozycji — separator na
  // Dzisiaj — stoi w mapie powłoki.
  //
  // 16 → 17 PRZY PRZYRZĄDZIE P4 FAZY I, 2026-08-13, i jest to JEDEN wpis na
  // całą resztę produktu, nie ogon bez adresu: kontrolki, które rysują się
  // dopiero PO otwarciu panelu, dialogu, menu albo soczewki. Warunek wyjścia
  // jest dla nich WSPÓLNY i jest przebudową przelotu (krok trasy naciskający
  // kontrolkę WIERSZA) plus fikstura z zapisanym widokiem — rozbicie tego na
  // wpis per ekran udawałoby, że każdy z nich ma osobne wyjście.
  //
  // 17 → 18 PRZY LOCIE L4 FAZY II, 2026-08-14, i jest to odmowa Z POMIAREM:
  // druga skrzynka tego samego ekranu (`capture`) niesie ten sam pojemnik co
  // pierwsza, a fikstura go NIE RYSUJE. Dziś obie dzielą regułę `.rows`, więc
  // zieleń pierwszej jest o drugiej przypadkowo prawdziwa — wpis istnieje po
  // to, żeby ta przypadkowość była zapisana, a nie odkryta.
  //
  // 18 → 19 PRZY LOCIE L9 FAZY II, 2026-08-14, i jest to druga połowa pozycji
  // 2 tego lotu: wiersz autorstwa planu jest PRZENIESIONY do komórki i nie
  // rysuje się w tym harnessie w ogóle. Warunek wyjścia jest zapisany razem
  // z jego CENĄ (drugi ekran przestawiony przez tę samą fiksturę), bo warunek
  // bez ceny czyta się jak zaległość, a to jest wybór.
  //
  // 19 → 20 W TYM SAMYM LOCIE: drugie żywe wystąpienie wpisu 12-1 (rekord
  // szansy), zdjęte jako para PO POMIARZE, nie przed nim. Powód i warunek
  // wyjścia stoją przy wpisie.
  notCovered: 20,
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
    L9: {
      // SZEŚĆ POZYCJI BRIEFU = SZEŚĆ WPISÓW SEKCJI 12 DOKUMENTU PRZEJŚCIA,
      // i mapowanie numeru pozycji na wpis jest tu WYPISANE, bo numery pozycji
      // nie idą po sufiksach `12-N` i czytelnik inaczej założy, że idą:
      //   1 → 12-4 (rząd metadanych nie jest rzędem pigułek)      — 3 pary
      //   2 → 12-5 (panel PLAN/DEADLINE jest martwy)              — 1 para
      //   3 → 12-1 (ta sama treść stoi na ekranie dwa razy)       — 2 pary
      //   4 → 12-6 (inny zestaw zakładek)                         — BEZ PARY
      //   5 → 12-7 (trzy kolumny metadanych naraz)                — BEZ PARY
      //   6 → 12-8 (`Subscribe` nie ma odpowiednika)              — BEZ PARY
      //
      // DLACZEGO TRZY ZOSTAJĄ BEZ PARY, KAŻDA Z INNEGO POWODU — i żaden z nich
      // nie brzmi „nie zdążyliśmy":
      //   • 12-6: `RECORD_TABS` (`record/record-tabs.ts:26-33`) jest słownikiem
      //     ZAMKNIĘTYM, `restoreTab` waliduje po nim, a pasek bierze z niego
      //     etykiety. `Related` i `Notes` to dwa NOWE PANELE na trzech
      //     ekranach, nie przemalowanie paska — rozmiarem lot, nie pozycja.
      //     Para nad nienapisanym panelem byłaby wieczną czerwienią bez
      //     właściciela.
      //   • 12-7: przejście mówi wprost, że prawa kolumna „sama w sobie nie
      //     jest zła" i psuje się DOPIERO razem z panelem podglądu. Czyli jej
      //     dowodem jest pomiar pozycji 3, a nie własna para. Jeśli 12-1
      //     zostaje otwarte, ta pozycja zostaje otwarta razem z nim — i to
      //     jest zależność, nie zaległość.
      //   • 12-8: ZOSTAJE ODMÓWIONE, ALE NA JEDNYM POWODZIE Z DWÓCH — drugi
      //     był NIEPRAWDĄ i został tu skasowany przy naprawie po przeglądzie.
      //     Stało: „`title-band-action.mjs:1028-1032` asertuje rekord jako
      //     `NO_ACTION/NO_ACTION`, więc dołożenie przycisku daje czerwień na
      //     cudzej osi". Adres wskazywał wiersz DZISIAJ, nie rekordu (wiersz
      //     rekordu to `:1504-1510`), a samo zdanie o czerwieni nie broni się
      //     po zmierzeniu OBU predykatów: strona prototypu liczy wyłącznie
      //     `.btn` z `PROTOTYPE_FILLED_MODIFIERS` (`:276` — `primary`,
      //     `bordered`), a strona aplikacji ma `.ghost-button` ŚWIADOMIE POZA
      //     zbiorem akcji (`:88-99`, „to jest pomiar, nie gust"). Wierny
      //     `Subscribe` — przezroczysty, tak jak `cls: "quiet"` prototypu
      //     (`v3/screens/record.js:560`) — zostawiłby ten wiersz na
      //     `NO_ACTION/NO_ACTION` po obu stronach. Czerwień dałoby dopiero
      //     WYPEŁNIENIE, którego prototyp też nie ma.
      //     POWÓD, KTÓRY ZOSTAJE, JEST SAMODZIELNY: `Subscribe` mieszka
      //     w PAŚMIE OKRUSZKA, a to jest rejon, który lot L2 przebudował na
      //     gałęzi nieobecnej w tym drzewie — dokładanie tam kontrolki znaczy
      //     konflikt z cudzą niezmergowaną dostawą.
      //   1 → 12-4: cztery pary (`L9-01a/b/c/d`)
      //   2 → 12-5: jedna para (`L9-02a`)
      //   3 → 12-1: jedna para (`L9-03a`); bliźniak nad rekordem szansy zdjęty
      //
      // POZYCJA 3 MIAŁA MIEĆ DWIE PARY I MA JEDNĄ: druga wróciła zielona nad
      // żywym rozjazdem, bo przelot nie zaznacza karty lejka, i została zdjęta
      // do `notCovered`. Pozycja dalej JEST pokryta — rekord zadania mierzy ją
      // czerwono.
      //
      // 5 → 6 PRZY NAPRAWIE PO PRZEGLĄDZIE: `L9-01d`, czwarta para pozycji 1.
      positionsInBrief: 6,
      pairs: 6,
      positionsWithPairs: 3, // 1, 2, 3
      positionsWithoutPairs: [4, 5, 6],
    },
    10: {
      // Trzy pozycje briefu, dwie z parą TUTAJ (2 — Odnowienia, 3 — Biblioteka),
      // pozycja 1 (pasmo Dzisiaj) w mapie powłoki. Trzy pary na pozycji 3, bo
      // to jedyny przystanek, na którym stoją wszystkie trzy gałęzie reguły
      // naraz — i to jest ta sama arytmetyka co przy P1: pozycja bez pary
      // w TEJ mapie nie jest pozycją bez dowodu.
      //
      // 4 → 5 PO PRZEGLĄDZIE ADWERSARIALNYM: L10-06 czyta SŁOWO na podmiocie
      // L10-03. Cztery pary tego lotu czytały wyłącznie `data-day-form`, więc
      // były ślepe na zmianę samych słów wewnątrz gałęzi — patrz nota nad
      // parami. Pozycja dalej ta sama, rośnie tylko `pairs`.
      positionsInBrief: 3,
      pairs: 5,
      positionsWithPairs: 2, // 2, 3
      positionsWithoutPairs: [1],
    },
    P5: {
      // JEDNA POZYCJA BRIEFU (przyrząd P5), DWIE PARY — dwie RÓŻNE wartości
      // poza skalą na dwóch rodzajach rekordu (580 i 620), a nie dwie kopie
      // jednego zdania. `auditRoutedMap` liczy `pairs` i `positionsWithPairs`
      // osobno, więc oba muszą tu stać, i oba muszą rosnąć razem z sumą wyżej.
      //
      // POZYCJI JEST JEDNA, MIMO ŻE PRZYRZĄD MIERZY CAŁĄ APLIKACJĘ, i to jest
      // uczciwa arytmetyka, nie zaniżenie: pary są WYŁĄCZNIKIEM dostawy, a nie
      // pokryciem. Zbiór wag mierzy przelotka `sweepTypeWeight` nad każdym
      // narysowanym elementem niosącym własny tekst — łącznie z chromem paska
      // bocznego, którego ta mapa nie dosięga wcale.
      positionsInBrief: 1,
      pairs: 2,
      positionsWithPairs: 1, // 1
      positionsWithoutPairs: [],
    },
    P4: {
      // TRZY POZYCJE, OSIEM PAR, WSZYSTKIE TUTAJ — i to jest pierwszy przyrząd
      // tej fazy, który nie zostawia ani jednej pozycji w mapie powłoki:
      // powierzchnia lądowania (Dzisiaj) rysuje ZERO kontrolek, więc para nad
      // nią mierzyłaby zero nad ekranem, na którym reguła nigdy nie była
      // zagrożona. Rachunek pozycji jest rachunkiem ZDAŃ prototypu:
      //   1. pas widoku Zadań wybiera rysowaną afordancją (4-1, 4-2) — DWIE
      //      pary, bo `<select>` i `<input>` psują się osobno i naprawia je
      //      osobna robota;
      //   2. lista Spotkań nie trzyma formularza integracji (10-1) — te same
      //      dwie, z tego samego powodu;
      //   3. cztery ekrany, na których reguła już obowiązuje, mają na niej
      //      zostać — cztery pary `enforced`, zielone w dniu napisania.
      //
      // POZYCJA 3 NIE JEST POZYCJĄ PLANU I MÓWIMY TO WPROST, żeby następny
      // czytający nie szukał jej w briefie. Plan lotów nazywa dla P4 dwa
      // miejsca objawowe — Zadania i Spotkania. Trzecia jest własnością
      // PRZYRZĄDU: to jego kontrola dodatnia, bez której nie da się odróżnić
      // „reguła jest łamana na dwóch ekranach" od „przyrząd czerwieni się
      // wszędzie, gdzie spojrzy". Dlatego `positionsInBrief` to 3, a nie 2 —
      // liczba ma się zgadzać z tym, co ta mapa naprawdę pokrywa, a nie
      // z cudzym dokumentem.
      //
      // USTAWIENIA I EKRAN REKORDU SĄ WYŁĄCZONE i rozstrzyga to REJESTR, nie
      // gust: `count: 0` tam zaprzeczyłoby C5-02a, C5-02b i C5-03 (wszystkie
      // `enforced`), a prototyp trzyma swój JEDYNY `<select>` właśnie
      // w wierszu Ustawień (`v3/screens/settings.js:329-334`). Dwa źródła,
      // jedna linia podziału.
      positionsInBrief: 3,
      pairs: 8,
      positionsWithPairs: 3, // 1, 2, 3
      positionsWithoutPairs: [],
    },
    P2: {
      // Sześć pozycji briefu P2, cztery pary TUTAJ na dwóch pozycjach
      // (Skrzynka: pojemnik i wiersz). Pozycje 1-2 (Dzisiaj) są w mapie
      // powłoki, pozycje 5-6 nie mają pary w ŻADNEJ z map i stoją wypisane
      // w `notCovered` obu — ta sama arytmetyka, co przy P1 i C1: pozycja bez
      // pary w TEJ mapie nie jest pozycją bez dowodu.
      // 4 → 5 PRZY LOCIE L4: `P2-03d` (`rowGap`) siada na POZYCJI 3, czyli tam,
      // gdzie już stoją trzy pary pojemnika, więc `positionsWithPairs` zostaje 2.
      positionsInBrief: 6,
      pairs: 5,
      positionsWithPairs: 2, // 3, 4
      positionsWithoutPairs: [1, 2, 5, 6],
    },
    P1: {
      // Trzynaście pozycji briefu, dwanaście z parą TUTAJ, pozycja 1 (Dzisiaj)
      // w mapie powłoki. Ta sama arytmetyka co przy C1, tylko w drugą stronę:
      // pozycja bez pary w TEJ mapie nie jest pozycją bez dowodu.
      positionsInBrief: 13,
      pairs: 12,
      positionsWithPairs: 12, // 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
      positionsWithoutPairs: [1], // Dzisiaj — mapa powłoki
    },
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

/**
 * KTO JEST WŁAŚCICIELEM WERDYKTU O WADZE KROJU — ten sam wzorzec, DRUGI
 * PRZEŁĄCZNIK, i to rozróżnienie jest całym powodem istnienia tego wpisu.
 *
 * Pasmo tytułu rekordu mierzy dwie rzeczy naraz: ROZMIAR i WAGĘ. Rozmiar jest
 * DOWIEZIONY — lot 4 zamknął go i `RECORD_TITLE_BAND_OWNER` stoi dziś na dwóch
 * wpisach „enforced", więc tamten band RZUCA. Waga nie jest dowieziona
 * i rzucać jeszcze nie może: `break-test.mjs:333-345` odmawia startu pętli
 * złamań od czerwonej bazy, więc jeden werdykt o wadze wpuszczony w cudzy
 * przełącznik zabiłby WSZYSTKIE złamania w `break-visual-language.mjs`.
 * Jeden band, dwa niezależne przełączniki — napisane, a nie domyślne.
 *
 * TO NIE JEST TRZECI WPIS POWTARZAJĄCY TĘ SAMĄ OCZEKIWANĄ WARTOŚĆ.
 * `RECORD_TITLE_BAND_OWNER` mówi o `fontSize` i `--text-xl`; ten mówi
 * o `fontWeight` i `--weight-semibold`. Wskazują na RÓŻNE pary, bo to różne
 * pozycje o różnych właścicielach — a `read`/`token` stoją tu z tego samego
 * powodu, co tam: rezolwer SPRAWDZA pary, na które wskazuje, więc uzbrojenie
 * werdyktu o wadze parą czytającą rozmiar jest niemożliwe zamiast tylko
 * niewskazane.
 *
 * CZEGO TEN WPIS NIE UZBRAJA: `TYPE_WEIGHT_NO_DECLARED_SCALE`,
 * `TYPE_WEIGHT_SWEEP_MEASURED_NOTHING`, `TYPE_WEIGHT_UNREGISTERED`
 * i `TYPE_WEIGHT_UNUSED_ENTRY` padają NIEZALEŻNIE od tego statusu, bo mówią
 * o przyrządzie, a nie o rozjeździe — przyrząd, który nie ma zbioru, nie ma
 * pomiaru albo ma nowy nieopisany rozjazd, jest zepsuty w każdym stanie
 * dostawy.
 */
export const TYPE_WEIGHT_OWNER = {
  lot: "P5",
  position: 1,
  label: "P5 #1",
  pairs: ["P5-01a", "P5-01b"],
  read: "fontWeight",
  token: "--weight-semibold",
};
