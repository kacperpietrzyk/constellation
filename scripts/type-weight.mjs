// Czy NARYSOWANA WAGA KROJU należy do skali, którą tokeny DEKLARUJĄ —
// decyzja wyjęta z przeglądarki.
//
// Po co osobny moduł, ten sam powód co przy `descendant-overflow.mjs`:
// `verify-renderer-layout.mjs` potrzebuje przeglądarki i serwera dev, więc nie
// chodzi w `npm run check`. Sama reguła („czy ta waga jest stopniem skali",
// „czy ten dług jest zapisany", „czy wpis rejestru jeszcze cokolwiek opisuje")
// jest zwykłą funkcją nad liczbami i napisami, więc mieszka tutaj i ma testy,
// które chodzą w `check` na wszystkich trzech systemach. Reguła jest
// przenośna, PIKSELE nie są — a skala wag nie jest nawet pikselem.
//
// ── DLACZEGO TO POWSTAŁO (przyrząd P5 Fazy I, 2026-08-13) ────────────────────
//
// Prototyp v3 używa DOKŁADNIE czterech wag i ani jednej innej: 400 (3
// deklaracje), 500 (64), 600 (85), 700 (3). Aplikacja miała w chwili
// postawienia tego przyrządu DZIEWIĘĆ wartości poza tym zbiorem — 550, 560,
// 570, 580, 590, 620, 630, 650, 750, razem 91 deklaracji — i NIC tego nie
// mierzyło. Trzy pary w `visual-language-pairs.mjs` czytają `fontWeight`
// (`D2-01b`, `D2-01d`, `L5-04`) i wszystkie trzy są asercjami o JEDNYM
// podmiocie z JEDNĄ wpisaną liczbą; żadna nie pyta o PRZYNALEŻNOŚĆ do zbioru,
// bo zbiór nie istniał jako dana po żadnej stronie. Sam przyrząd, który wagę
// mierzy (`judgeRecordTitleBand`), wypisywał ją z dopiskiem „reported, not
// judged" — czyli pomiar bez osądu, a reguła nieosądzona to reguła
// NIEZMIERZONA.
//
// ── CZYM TEN PRZYRZĄD NIE JEST ───────────────────────────────────────────────
//
// NIE JEST listą dziewięciu wartości do wyplenienia. Lista wartości to lista
// OBJAWÓW, a „ręczna lista obok zamkniętego słownika" jest w tym repozytorium
// nazwaną klasą defektu — trafiła w nie sześć razy. Dlatego zbiór dozwolony
// jest CZYTANY Z DEKLARACJI (`--weight-*` w `packages/desktop-ui/src/tokens.css`)
// i pytanie brzmi „czy ta waga jest stopniem tej skali", a nie „czy ta waga
// jest jedną z dziewięciu, które kiedyś spisałem".
//
// ── CZTERY WYNIKI, I SĄ TO CZTERY RÓŻNE RZECZY ───────────────────────────────
//
//   "no-scale"   — `tokens.css` nie deklaruje ANI JEDNEGO stopnia. To nie jest
//                  werdykt o produkcie, tylko AWARIA PRZYRZĄDU: nie ma zbioru,
//                  którego członkiem cokolwiek mogłoby być. Pada zawsze,
//                  niezależnie od tego, czy właściciel pozycji dowiózł.
//   "in-scale"   — waga jest jednym z zadeklarowanych stopni. Cisza, ale
//                  LICZONA — sam licznik naruszeń nie odróżnia „zero naruszeń"
//                  od „zero pomiarów".
//   "known-debt" — DŁUG, nie licencja. Wpis w rejestrze niżej z nazwanym
//                  właścicielem i wskazanym arkuszem. Wpis nie zwalnia z
//                  pomiaru: ZMIANA wartości na inną spoza skali dalej pada, bo
//                  wpis wiąże sygnaturę Z KONKRETNĄ liczbą.
//   "violation"  — waga spoza skali, której nikt nie zarejestrował. Nowy
//                  rozjazd ma padać w dniu, w którym ląduje.
//
// KTÓRA STRONA DAJE ZBIÓR: nazwy i wartości czyta `verify-renderer-layout.mjs`
// Z ARKUSZA (bo osądza w Node, po zamknięciu strony), a przeglądarka jest
// pytana o TE SAME nazwy osobno — rozjazd arkusz↔korzeń jest nazwaną awarią
// (`TYPE_WEIGHT_SCALE_NOT_LIVE`), a nie cichym wyborem jednej ze stron.
//
// ── DLACZEGO KLUCZEM JEST `sygnatura|waga`, A NIE `powierzchnia|sygnatura` ───
//
// To jest różnica wobec obu rejestrów w `descendant-overflow.mjs` i jest
// zamierzona. Przepełnienie jest GEOMETRIĄ: ten sam element przepełnia się na
// jednym ekranie i mieści na drugim, więc wpis MUSI nieść powierzchnię i sufit
// per przelot. Waga kroju jest własnością REGUŁY ARKUSZA: `.eyebrow` niesie
// 650 wszędzie, gdzie się narysuje, bo tak stoi w `styles.css`. Rejestr
// z wymiarem powierzchni byłby więc rejestrem TRASY PRZELOTU, a nie długu —
// jeden zapis chromu powłoki musiałby mieć tyle wpisów, ile przystanków ma
// bramka, i psułby się przy każdej zmianie fikstury.
//
// Powierzchnie, na których wagę ZOBACZONO, są w rejestrze RAPORTOWANE
// (`surfaces`), a nie asertowane — bo to fakt o zasięgu przelotu, nie o długu.

/**
 * Nazwy stopni czytane Z ARKUSZA, w kolejności deklaracji.
 *
 * KOMENTARZE WYCIĘTE, I TO JEST WARUNEK, ŻEBY ZŁAMANIE B1 COKOLWIEK DOWODZIŁO.
 * `tokens.css` wypisuje nazwy tych czterech stopni PROZĄ, w komentarzu nad
 * deklaracjami. Parser czytający surowy tekst znalazłby je tam po skasowaniu
 * samych deklaracji i oddał pełną skalę nad arkuszem, który jej nie ma — czyli
 * dokładnie ten fałszywy spokój, któremu ten przyrząd ma zapobiegać. Cięcie
 * jest przepisane z `css-token-lint.test.ts` i z `declaredStickyRules()`:
 * komentarz zastępowany jest tyloma znakami nowej linii, ile miał, żeby `^`
 * dalej widziało deklarację stojącą pod nim.
 *
 * Wartość z arkusza jest tu zwracana WYŁĄCZNIE po to, żeby dało się ją
 * porównać z tym, co oddaje żywy korzeń. Werdykt o wadze bierze wartości
 * z przeglądarki — odczyt samej deklaracji jest kontrolą ŹRÓDŁA, a nie
 * kontrolą tego, co się narysowało.
 */
export const declaredWeightScale = (tokensCssText) => {
  const code = tokensCssText.replace(/\/\*[\s\S]*?\*\//gu, (comment) =>
    "\n".repeat((comment.match(/\n/gu) ?? []).length),
  );
  const found = [];
  const seen = new Set();
  for (const match of code.matchAll(
    /^\s*(--weight-[a-zA-Z0-9-]+)\s*:\s*([^;]+);/gmu,
  )) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    found.push({ name, value: match[2].trim() });
  }
  return found;
};

/**
 * DŁUG WAGI ZMIERZONY, NIE ZGADNIĘTY. Każdy wpis pochodzi z przebiegu
 * `LAYOUT_PORT=5405 npm run test:renderer-layout` na tym drzewie 2026-08-13
 * i niesie właściciela oraz arkusz, w którym waga jest zadeklarowana.
 *
 * REJESTR JEST PRZEPISANY Z WYDRUKU BRAMKI, A NIE Z GREPU PO ARKUSZACH, i to
 * jest jedyny sposób, w jaki wolno go zapełnić. 91 deklaracji w arkuszach to
 * NIE 91 narysowanych elementów: część reguł opisuje stany puste, dialogi
 * i popovery, których fikstura nie rysuje. Wpis o czymś, czego przelot nigdy
 * nie widzi, jest martwy z definicji i pada jako `TYPE_WEIGHT_UNUSED_ENTRY` —
 * czyli grep dałby rejestr, który sam siebie wywraca.
 *
 * `surfaces` jest RAPORTEM z tamtego przebiegu, nie asercją: mówi, gdzie ta
 * reguła się narysowała, i nie bierze udziału w dopasowaniu.
 *
 * `sheet` TEŻ NIE BIERZE UDZIAŁU W DOPASOWANIU i jest NAJLEPSZYM DOWODEM,
 * a nie pewnikiem — mówimy to wprost, bo inaczej następny czytający weźmie te
 * numery za pomiar. Przelotka widzi WYLICZONĄ wagę, a `font-weight` jest
 * własnością DZIEDZICZONĄ: `span` o wadze 550 wewnątrz `.ghost-button` nie ma
 * własnej reguły i nigdy jej nie miał. Numer przy takim wpisie wskazuje więc
 * regułę, z której waga PRZYSZŁA, a nie regułę na tym elemencie; wpisy, przy
 * których to rozróżnienie jest żywe, mają to dopisane. Rozstrzyga to lot,
 * który dług spłaca, a nie ten przyrząd.
 *
 * SYGNATURA BYWA WIELOZNACZNA I TO TEŻ JEST WYPISANE. `signature()` skleja
 * znacznik z klasami po zdjęciu hasha modułu, więc `h2._railHeading` z trzech
 * arkuszy rekordu jest tu JEDNYM wpisem. To jest znany problem tego pomiaru
 * (ten sam, przez który raport przyklejenia mówi „AMBIGUOUS"), a nie skutek
 * uboczny klucza: rejestr o kluczu `arkusz:linia` nie dałby się dopasować do
 * niczego, co widzi przeglądarka.
 *
 * CZEGO TU NIE MA, MIMO ŻE STOI W ARKUSZACH: wagi 570 i 750. Deklaracje
 * istnieją, ale ŻADEN z pięciu przelotów ich nie narysował — sekcje Ustawień
 * otwiera się kliknięciem, którego ta bramka nie robi, a część reguł opisuje
 * stany puste, dialogi i popovery, których fikstura nie rysuje. Dopisanie ich
 * z grepu dałoby wpisy martwe w dniu narodzin (`TYPE_WEIGHT_UNUSED_ENTRY`).
 * To jest NIE ZMIERZONE, nie „przeszło".
 */
export const KNOWN_OFF_SCALE_WEIGHTS = [
  // ── 550 ───────────────────────────────────────────────────────────────────
  {
    signature: "button.ghost-button",
    weight: 550,
    sheet:
      "packages/desktop-ui/src/styles.css:1060 (.quiet-button, .ghost-button)",
    surfaces: "projects:project (+ jego pięć zakładek)",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "button.ghost-button.compact",
    weight: 550,
    sheet:
      "packages/desktop-ui/src/styles.css:1060 (.quiet-button, .ghost-button)",
    surfaces: "calendar, inbox",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "button.quiet-button",
    weight: 550,
    sheet:
      "packages/desktop-ui/src/styles.css:1060 (.quiet-button, .ghost-button)",
    surfaces: "meetings",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    // WAGA ODZIEDZICZONA, nie własna: `<span>` w środku przycisku bez własnej
    // reguły. Wpis zostaje, bo przelotka widzi WYLICZONĄ wagę i to jest
    // dokładnie to, co ogląda czytelnik.
    signature: "span",
    weight: 550,
    sheet:
      "packages/desktop-ui/src/styles.css:1060 (dziedziczone z .ghost-button)",
    surfaces: "projects, projects:client, projects:list, projects:timeline",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  // ── 560 ───────────────────────────────────────────────────────────────────
  {
    signature: "h2",
    weight: 560,
    sheet:
      "packages/desktop-ui/src/calendar.module.css:389 i inbox.module.css:52 (.sectionHead h2)",
    surfaces: "calendar, inbox",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "h3._columnLabel",
    weight: 560,
    sheet: "packages/desktop-ui/src/tasks/task-board.module.css:86",
    surfaces: "tasks:board",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "h3._railTitle",
    weight: 560,
    sheet: "packages/desktop-ui/src/tasks/task-calendar.module.css:281",
    surfaces: "tasks:calendar",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "span._dayName",
    weight: 560,
    sheet: "packages/desktop-ui/src/calendar.module.css:171",
    surfaces: "calendar",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  // ── 580 — TEN JEDEN MA PARĘ ───────────────────────────────────────────────
  {
    // JEDYNY WPIS TEGO REJESTRU, KTÓRY MA NAD SOBĄ RÓWNIEŻ PARĘ (`P5-01a`)
    // I OSOBNY WERDYKT PASMA TYTUŁU REKORDU. Nie jest to powtórzenie: para
    // czyta JEDEN selektor na JEDNEJ trasie, pasmo grupuje tytuły rekordu na
    // wszystkich geometriach, a ten wpis mówi tylko „ta reguła jest znanym
    // długiem". Wszystkie trzy padają albo milkną na jednym przełączniku.
    signature: "h1._title",
    weight: 580,
    sheet:
      "packages/desktop-ui/src/record/task-record.module.css:48 i record/project-record.module.css:41",
    surfaces: "tasks:task, projects:project (+ ich zakładki)",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread:
      "adopcja języka wizualnego v3 — skala wag (przyrząd P5, para P5-01a)",
  },
  // ── 590 — NAJLICZNIEJSZA OBCA WAGA APLIKACJI ──────────────────────────────
  {
    signature: "b._fitCount",
    weight: 590,
    sheet:
      "packages/desktop-ui/src/record/project-record.module.css:297 (.fitCount, .fitStrong)",
    surfaces: "projects:project, projects:project:overview",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "b._open",
    weight: 590,
    sheet: "packages/desktop-ui/src/projects/project-list.module.css:281",
    surfaces: "projects, projects:list",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "button._switch",
    weight: 590,
    sheet:
      'packages/desktop-ui/src/tasks/tasks.module.css:95 i projects/project-collection.module.css:49 (.switch[aria-pressed="true"])',
    surfaces: "projects i tasks wraz z soczewkami",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "button._tab",
    weight: 590,
    sheet:
      'packages/desktop-ui/src/record/record-tabs.module.css:113 (.tab[aria-selected="true"])',
    surfaces: "wszystkie trzy ekrany rekordu wraz z zakładkami",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "h2",
    weight: 590,
    sheet: "packages/desktop-ui/src/styles.css:3367 (.inspector-body > h2)",
    surfaces: "tasks:task (+ zakładki)",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "h2._docHeading",
    weight: 590,
    sheet:
      "packages/desktop-ui/src/record/task-record.module.css:466, record/project-record.module.css:421, opportunity/opportunity-record.module.css:147 — TRZY arkusze, jedna sygnatura",
    surfaces:
      "tasks:task, projects:project, pipeline:opportunity (+ przeglądy)",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "h2._fitHeading",
    weight: 590,
    sheet: "packages/desktop-ui/src/record/project-record.module.css:260",
    surfaces: "projects:project, projects:project:overview",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "h2._railHeading",
    weight: 590,
    sheet:
      "packages/desktop-ui/src/opportunity/opportunity-record.module.css:279",
    surfaces: "pipeline:opportunity, pipeline:opportunity:overview",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    // TA SAMA KLASA, INNY ZNACZNIK, WIĘC INNY WPIS — i to jest cecha klucza,
    // nie jego wada: `h2._railHeading` (Szansa) i `h3._railHeading`
    // (Zadanie, Projekt) to dwa różne elementy w dwóch arkuszach.
    signature: "h3._railHeading",
    weight: 590,
    sheet:
      "packages/desktop-ui/src/record/task-record.module.css:687 i record/project-record.module.css:541",
    surfaces: "tasks:task, projects:project (+ przeglądy)",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "p._emptyTitle",
    weight: 590,
    sheet: "packages/desktop-ui/src/record/record-panels.module.css:450",
    surfaces: "projects:project:tasks",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "span._author",
    weight: 590,
    sheet: "packages/desktop-ui/src/record/record-comments.module.css:180",
    surfaces: "zakładki Komentarzy trzech ekranów rekordu",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    // ODZIEDZICZONE po zaznaczonej zakładce: `.count` nie deklaruje wagi,
    // a `.tab[aria-selected="true"] .count` nie nadpisuje jej z powrotem.
    signature: "span._count",
    weight: 590,
    sheet:
      "packages/desktop-ui/src/record/record-tabs.module.css:113 (dziedziczone z zaznaczonej zakładki)",
    surfaces: "zakładki z licznikiem na trzech ekranach rekordu",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "span._groupLabel",
    weight: 590,
    sheet:
      "packages/desktop-ui/src/tasks/task-list.module.css:33, projects/project-list.module.css:44, projects/project-clients.module.css:36",
    surfaces: "projects, projects:client, projects:list, tasks, tasks:list",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "strong",
    weight: 590,
    sheet:
      "packages/desktop-ui/src/calendar.module.css:76, inbox.module.css:29, tasks/task-calendar.module.css:38, styles.css:6862",
    surfaces: "calendar, inbox, library:captures, tasks:calendar",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  // ── 620 ───────────────────────────────────────────────────────────────────
  {
    signature: "button.strategic-create-toggle",
    weight: 620,
    sheet: "packages/desktop-ui/src/styles.css:305",
    surfaces: "organizations",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    // DRUGI WPIS Z PARĄ (`P5-01b`) — powód przy `h1._title|580` wyżej.
    signature: "h1._title",
    weight: 620,
    sheet:
      "packages/desktop-ui/src/opportunity/opportunity-record.module.css:49",
    surfaces: "pipeline:opportunity (+ zakładki)",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread:
      "adopcja języka wizualnego v3 — skala wag (przyrząd P5, para P5-01b)",
  },
  {
    signature: "h2",
    weight: 620,
    sheet:
      "packages/desktop-ui/src/styles.css:3088 (.empty-state h2, .empty-state h3) i styles.css:6227 (.section-heading h2)",
    surfaces:
      "organizations, projects:project, projects:project:overview, settings",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    // Arkusz sekcji Aktywności NIE deklaruje wagi dla `.stateTitle`
    // (`activity-section.module.css:390`) — waga przychodzi ze wspólnej reguły
    // stanu pustego w powłoce.
    signature: "h3._stateTitle",
    weight: 620,
    sheet:
      "packages/desktop-ui/src/styles.css:3088 (.empty-state h2, .empty-state h3)",
    surfaces: "settings",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "span",
    weight: 620,
    sheet: "packages/desktop-ui/src/styles.css:3252 (.inspector-header span)",
    surfaces: "tasks:task (+ zakładki)",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    // CHROM POWŁOKI — widoczny na KAŻDYM przystanku, i to jest dowód, że
    // przelotka nie zatrzymuje się na `#main-content`.
    signature: "strong",
    weight: 620,
    sheet:
      "packages/desktop-ui/src/styles.css:1435 (.workspace-switcher strong)",
    surfaces: "wszystkie 36 stanów ekranu poza settings",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  // ── 630 ───────────────────────────────────────────────────────────────────
  {
    signature: "h3",
    weight: 630,
    sheet:
      "packages/desktop-ui/src/styles.css:6807 (.history-ledger > header h3)",
    surfaces: "library:captures",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  // ── 650 — CHROM POWŁOKI I KAŻDY PRZYCISK APLIKACJI ────────────────────────
  {
    signature: "button.inline-popover-trigger.primary-button",
    weight: 650,
    sheet:
      "packages/desktop-ui/src/styles.css:901 (.primary-button, .secondary-button)",
    surfaces: "library, library:notes, library:sources",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "button.inline-popover-trigger.secondary-button.compact",
    weight: 650,
    sheet:
      "packages/desktop-ui/src/styles.css:901 (.primary-button, .secondary-button)",
    surfaces: "projects:project (+ zakładki)",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature:
      "button.inline-popover-trigger.secondary-button.document-rename-trigger",
    weight: 650,
    sheet:
      "packages/desktop-ui/src/styles.css:901 (.primary-button, .secondary-button)",
    surfaces: "library, library:notes",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "button.primary-button",
    weight: 650,
    sheet:
      "packages/desktop-ui/src/styles.css:901 (.primary-button, .secondary-button)",
    surfaces:
      "meetings, organizations, people, pipeline, renewals, settings, tasks (+ soczewki)",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "button.primary-button.compact",
    weight: 650,
    sheet:
      "packages/desktop-ui/src/styles.css:901 (.primary-button, .secondary-button)",
    surfaces: "projects:project (+ zakładki)",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "button.secondary-button",
    weight: 650,
    sheet:
      "packages/desktop-ui/src/styles.css:901 (.primary-button, .secondary-button)",
    surfaces: "library:sources, meetings, settings, tasks:task (+ zakładki)",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "button.secondary-button._createTrigger",
    weight: 650,
    sheet:
      "packages/desktop-ui/src/styles.css:901 (.primary-button, .secondary-button)",
    surfaces: "settings",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "button.secondary-button.compact",
    weight: 650,
    sheet:
      "packages/desktop-ui/src/styles.css:901 (.primary-button, .secondary-button)",
    surfaces:
      "calendar, inbox, organizations, projects:project, tasks:task (+ zakładki)",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "button.secondary-button.document-markdown-toggle",
    weight: 650,
    sheet:
      "packages/desktop-ui/src/styles.css:901 (.primary-button, .secondary-button)",
    surfaces: "library, library:notes",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "button.secondary-button.meeting-block-action",
    weight: 650,
    sheet:
      "packages/desktop-ui/src/styles.css:901 (.primary-button, .secondary-button)",
    surfaces: "meetings",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    // NAJCIĘŻSZY WPIS CAŁEGO REJESTRU dla tej fali: `.eyebrow, .nav-label,
    // .section-label` to JEDNA reguła w chromie powłoki, licząca się do wpisu
    // P-1 rejestru rozjazdów. Trzy sygnatury, jeden arkusz, jedna naprawa.
    signature: "p.eyebrow",
    weight: 650,
    sheet:
      "packages/desktop-ui/src/styles.css:831-840 (.eyebrow, .nav-label, .section-label)",
    surfaces:
      "calendar, inbox, library (+ soczewki), meetings, projects (+ soczewki), settings",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "p.nav-label",
    weight: 650,
    sheet:
      "packages/desktop-ui/src/styles.css:831-840 (.eyebrow, .nav-label, .section-label)",
    surfaces: "dwadzieścia trzy stany ekranu — to jest chrom paska bocznego",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "p.section-label",
    weight: 650,
    sheet:
      "packages/desktop-ui/src/styles.css:831-840 (.eyebrow, .nav-label, .section-label)",
    surfaces: "tasks:task (+ zakładki)",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "span",
    weight: 650,
    sheet:
      "packages/desktop-ui/src/styles.css:2864 (.task-filter-control > span, .task-row-field > span, .task-column-head) oraz dziedziczone z przycisków (:901)",
    surfaces: "wszystkie 37 stanów ekranu",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "span._avatar",
    weight: 650,
    sheet: "packages/desktop-ui/src/settings/access-section.module.css:212",
    surfaces: "settings",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
  {
    signature: "strong",
    weight: 650,
    sheet: "packages/desktop-ui/src/styles.css:1291 (.brand-row strong)",
    surfaces: "wszystkie 37 stanów ekranu — chrom powłoki",
    owner: "L5 (Faza II) — pozycja P5 #1",
    thread: "adopcja języka wizualnego v3 — skala wag (przyrząd P5)",
  },
];

/** Klucz rejestru: reguła arkusza, nie miejsce, w którym ją zobaczono. */
export const weightKey = ({ signature, weight }) => `${signature}|${weight}`;

/**
 * Jedna decyzja o jednej narysowanej wadze. Świadomie NIE przyjmuje elementu
 * DOM — bierze to, co z niego odczytano, żeby dała się przetestować bez
 * przeglądarki.
 *
 * `allowed` to zbiór wartości Z ARKUSZA, podany jako napisy, bo
 * `getComputedStyle` oddaje napisy. **Nie są to wartości rozwiązane w żywym
 * korzeniu i mówimy to wprost**: `judgeRecordTitleBand` osądza w Node, gdzie
 * żywego korzenia już nie ma, więc zbiór musi być gotowy przed przelotem.
 * Druga strona doktryny stoi obok, jako osobna nazwana awaria: przelot pyta
 * korzeń o TE SAME nazwy i rozjazd arkusz↔korzeń pada jako
 * `TYPE_WEIGHT_SCALE_NOT_LIVE`, a nazwa rozwiązana do pustego napisu jako
 * `TYPE_WEIGHT_NO_DECLARED_SCALE`. Sam odczyt arkusza jest kontrolą ŹRÓDŁA
 * i sam by nie wystarczył.
 *
 * Pusty zbiór NIE ZNACZY „nic nie wolno" — znaczy, że przyrząd nie ma o co
 * pytać, i to jest osobny werdykt.
 */
export const classifyTypeWeight = (
  { signature, weight, allowed },
  registry = KNOWN_OFF_SCALE_WEIGHTS,
) => {
  if (allowed === undefined || allowed.size === 0)
    return { verdict: "no-scale" };
  if (allowed.has(String(weight))) return { verdict: "in-scale" };
  const entry = registry.find(
    (candidate) =>
      candidate.signature === signature &&
      String(candidate.weight) === String(weight),
  );
  if (entry === undefined) return { verdict: "violation" };
  return { verdict: "known-debt", thread: entry.thread, owner: entry.owner };
};

/**
 * Rejestr, który przestał opisywać cokolwiek, jest gorszy niż jego brak —
 * wygląda jak księga długu, a jest listą zdań o nieistniejących regułach.
 * Ta sama kontrola co `unusedRegistryEntries`, nad trzecim rejestrem.
 *
 * ROZLICZANE GLOBALNIE, PO WSZYSTKICH PRZELOTACH, nie per przelot: dwa z pięciu
 * przelotów geometrii chodzą wyłącznie po Bibliotece, więc rozliczenie per
 * przelot zapaliłoby fałszywy `UNUSED_ENTRY` na każdej wąskiej geometrii.
 */
export const unusedWeightEntries = (
  seenKeys,
  registry = KNOWN_OFF_SCALE_WEIGHTS,
) => registry.filter((entry) => !seenKeys.has(weightKey(entry)));
