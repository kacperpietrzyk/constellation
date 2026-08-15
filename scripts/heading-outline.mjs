// DOES THE SCREEN'S DOCUMENT OUTLINE NEST — the RANK of a heading, never its
// size.
//
// WHY THIS FILE EXISTS, WITH THE DEFECT THAT PRODUCED IT. Phase II lot L3 gave
// Today a greeting as `<h2>`. The prototype has one too — `h2.td-greeting`
// (`v3/screens/today.js:133`) — but the prototype's section heads under it are
// `h3` (`v3/screens/today.js:140,149`), and ours were `h2`. So the greeting and
// the three section heads sat at the SAME rung: for a screen reader the
// opening of the screen contained nothing, and „In the calendar" was its
// sibling rather than its child. The same landed on the Calendar
// (`h2.cal-title` over an `h2` tray, against `h2` over `h3` in
// `v3/screens/calendar.js:205,224`).
//
// NOTHING SAW IT, AND ONE INSTRUMENT SAID MATCH. Measured on `be68ac9`:
//   • `scripts/title-band-action.mjs` axis 4 („opening") reads the first
//     heading's `fontSize` against `--text-2xl` resolved in the same page —
//     size, not rank. Its report line for Today read
//     `opening OPENING_2XL h2._greeting 28px … prototype ONE_ROW/OPENING_2XL`,
//     i.e. MATCH over the defect.
//   • `scripts/heading-typography.mjs` scans the SHEETS for `font-size` and
//     `font-weight`; `grep -n "tagName|level|outline" ` over it returns
//     nothing.
//   • None of the 281 register pairs reads a tag name: the nine `expect` kinds
//     are `literal`, `count`, `token`, `rem`, `accent`, `not`, `tracks`,
//     `contains`, `text`.
// A rank has no pixels, so no probe built on paint can ever see it. That is
// the whole reason this axis exists as its own file.
//
// WHY IT NEEDS A BROWSER. „Which heading follows which, and at what rank" is a
// statement about the RENDERED DOCUMENT, not about a stylesheet: the heads sit
// in four components and are CONDITIONAL — which of them exists depends on the
// data the screen got, and the order they end up in is a property of the tree
// the renderer built, not of any file. A parser over the sources would have to
// evaluate the conditions to answer, which is the same as running the app.
//
// (This sentence used to end „…and one of them is `.sr-only`", offered as a
// third reason. It was the OPPOSITE of true and it is corrected here rather
// than annotated: `.sr-only` heads are precisely the ones this axis DROPS —
// see the blind spot declared below. Kept as a correction, not deleted, so the
// next reader does not re-derive the same wrong reason from the same file.)
// So the collection happens in the layout gate (which already walks every
// declared screen for the title band) and the JUDGEMENT lives here, as a pure
// function over collected records — testable in `npm run check` on all three
// systems, the same split `descendant-overflow.mjs` and `title-band-action.mjs`
// already make.
//
// TWO RULES, TWO STATUSES, DELIBERATELY NOT ONE.
//
//   NESTING — „if a screen OPENS its content with a heading, everything after
//   it stands UNDER that opening". Scoped to screens whose first content
//   heading is the opening in the sense axis 4 already defines (its computed
//   size equals `--text-2xl` resolved in the same page), because that is the
//   heading the prototype makes the parent. A screen with no such opening
//   (Projects, Tasks, Pipeline… — `NO_OPENING` in axis 4) has section heads as
//   siblings by design, and demanding descent there would be a false alarm on
//   correct code. A false alarm kills a gate faster than its absence — the
//   sentence `heading-typography.mjs` writes about its own „refinement"
//   verdict, and it holds here.
//
//   LEVELS — „no rung is skipped": walking the headings a reader meets, in
//   document order, no heading is more than one rank deeper than the deepest
//   rung open above it. The band's `h1` is the first rung, so a content
//   outline that starts at `h3` skips `h2`. This rule is TOTAL over every
//   screen the gate walks, and its status is set from measurement, not from
//   taste — see the constant.
//
// WHAT THIS AXIS DOES NOT SAY. It has no opinion on how many headings a screen
// has, on their order relative to the content beside them, or on their words.
// It never reads a size except through the opening flag axis 4 hands it, so
// it cannot drift into being a second, worse copy of that axis.
//
// AND IT DOES NOT SEE `.sr-only` HEADINGS AT ALL — declared here because it is
// the one blind spot that CONTRADICTS the axis's own justification, and an
// undeclared blind spot of that shape is worse than the gap itself.
//
//   MECHANISM, MEASURED NOT GUESSED. Collection filters every heading through
//   `rendered()` (`verify-renderer-layout.mjs`, the same predicate axes 3-6
//   use), which returns false for a box of `width × height <= 4`. `.sr-only`
//   (`packages/desktop-ui/src/styles.css:922-932`) is `width: 1px; height: 1px;
//   clip: rect(0,0,0,0)` — an area of 1 px². So a heading that exists ONLY for
//   a screen reader never reaches the outline, on an axis whose entire subject
//   is the table of contents a screen reader hears.
//
//   WHY IT IS NOT FIXED HERE, AND THIS IS A DECISION WITH A COST. `rendered()`
//   is SHARED with the title band axes, and there it earns its threshold: the
//   comment at its definition records why a 1 px² clipped `<h1>` must not become
//   the geometric reference of a whole band verdict (centre in the corner of
//   the frame, tolerance half a pixel). Teaching this axis to keep visually
//   hidden headings therefore means a SECOND visibility predicate — „present to
//   assistive tech" as distinct from „drawn" — which is an instrument, not a
//   repair, and it belongs to whoever needs it.
//
//   WHAT IT COSTS TODAY: nothing hidden, and that is measured, not assumed. Two
//   `.sr-only` headings exist in the product — `MeetingsSurface.tsx:636`
//   (`h1#surface-title`, loading state) and `Wave2Surfaces.tsx:1084`
//   (`h2#search-title`). Neither lies on any of the fifteen walked
//   destinations, so no screen's verdict changes either way. The Meetings one
//   is additionally handled loudly: its band is unresolved, so the screen goes
//   to `HEADING_OUTLINE_NOT_MEASURED` rather than being judged on a truncated
//   outline.
//
//   WHEN IT WILL COST SOMETHING: the first screen whose opening is `.sr-only`.
//   Then the content starts, for this axis, at the heading BELOW the opening —
//   the screen reads as `NO_OPENING`, the nesting rule quietly switches itself
//   off, and the report says nothing. That is the failure mode to look for, and
//   it is the reason this paragraph exists rather than a shrug.

/**
 * Is the nesting rule armed? `enforced` means a divergence FAILS the layout
 * gate rather than printing a row.
 *
 * ENFORCED FROM THE DAY IT LANDS, and that is a claim with a measurement
 * behind it: the pass that introduced this file measured the rule RED on
 * exactly two screens (today, calendar), fixed both in the same commit
 * (`h2` → `h3` on three Today section heads and the Calendar tray), and
 * measured it green on all fifteen walked destinations afterwards. An axis
 * that has never been red proves nothing; this one has both numbers in the
 * lot's report.
 */
export const HEADING_OUTLINE_NESTING_STATUS = "enforced";

/**
 * Is the skipped-rung rule armed?
 *
 * `enforced`, on the same evidence as the nesting rule: measured over all
 * fifteen walked destinations on this branch, zero screens skip a rung. There
 * is therefore no debt to register and no reason to leave the rule reporting.
 * If a screen ever needs an exception, it belongs here as a NAMED entry with
 * an owner — never as a status downgrade, which would silence every screen at
 * once.
 */
export const HEADING_OUTLINE_LEVELS_STATUS = "enforced";

export const HEADING_OUTLINE_NESTING_ARMED =
  HEADING_OUTLINE_NESTING_STATUS === "enforced";
export const HEADING_OUTLINE_LEVELS_ARMED =
  HEADING_OUTLINE_LEVELS_STATUS === "enforced";

// ── `NO_OPENING` I `NO_HEADINGS` SĄ STANAMI DOZWOLONYMI, I OTO CZYM TO
//    ZMIERZONO ────────────────────────────────────────────────────────────────
//
// Oba wypisują się w raporcie przy każdym przelocie, więc czytelnik odbioru
// widzi je obok czerwieni i ma prawo zapytać, czy to nie są dwie ciche wady.
// Rozstrzygnięcie należy tutaj, a nie do raportu jednego lotu: raport się
// czyta raz, a ten plik czyta się przy każdej zmianie reguły.
//
// POMIAR (`LAYOUT_PORT=5601`, ta gałąź, przed poprawką farbową tego lotu):
// piętnaście przystanków, dwa `JUDGED` (dzisiaj, kalendarz), DZIEWIĘĆ
// `NO_OPENING` (inbox, tasks/record:task, projects/record:project,
// pipeline/record:opportunity, organizations, renewals, meetings, library,
// settings) i CZTERY `NO_HEADINGS` (tasks, projects, pipeline, people).
//
// `NO_OPENING` — ZGODNE Z PROTOTYPEM, NIE TOLEROWANE. Oś 4
// (`title-band-action.mjs`) ma dla każdego z tych dziewięciu ekranów wiersz
// „prototype ONE_ROW/NOT_2XL", czyli prototyp też ich nie otwiera nagłówkiem
// wielkości `--text-2xl`; dwa ekrany, które otwiera — Dzisiaj i Kalendarz — to
// dokładnie te dwa, które tu wychodzą jako `JUDGED`. Nagłówki sekcji są na tych
// dziewięciu RODZEŃSTWEM z projektu i żądanie zejścia byłoby fałszywym alarmem
// nad poprawnym kodem. Reguła zagnieżdżenia jest więc ZAKRESOWA, nie wyłączona:
// żaden z tych ekranów nie jest zwolniony z reguły SZCZEBLI, która nad nimi
// przechodzi (zero pominięć na wszystkich piętnastu).
//
// `NO_HEADINGS` — ZDANIE O STANIE ODWIEDZONYM, NIE O KODZIE EKRANU, I RÓŻNICA
// JEST TU CAŁĄ TREŚCIĄ. `outlineOf` odrzuca węzły nienarysowane i puste
// tekstowo, więc „zero" mogłoby znaczyć „zbiórka ich nie zobaczyła". Zmierzone
// osobno, żeby nie zgadywać: przelotka wchodzi na każdy przystanek w układzie
// DOMYŚLNYM i na ZASIANEJ fiksturze, a te cztery ekrany w tym właśnie stanie
// rysują wiersze i grupy bez ani jednego elementu nagłówkowego — Zadania
// startują w układzie `list` (`tasks/TasksSurface.tsx`, `useState` „list"),
// a `TaskListLayout`, tablice Projektów, Lejka i Ludzi nie mają nagłówka
// w ogóle. Ekran, który w odwiedzonym stanie niczego nie zadeklarował jako
// nagłówek, nie ma konspektu do osądzenia — i dlatego stan jest WYPISYWANY,
// a nie liczony jako zaliczony.
//
// W ŹRÓDLE NAGŁÓWKI SĄ, I TO TRZEBA POWIEDZIEĆ WPROST, bo zdanie „ten ekran nie
// ma nagłówków" byłoby NIEPRAWDĄ, a asercja, której fikstura nie dosięga, jest
// nieodróżnialna od poprawnej. `grep -rn "<h[1-6][ >]"` po warstwach tych
// czterech ekranów zwraca stany, w które ten przelot nie wchodzi:
//   • `pipeline/PipelineSurface.tsx:806,844` i `people/PeopleSurface.tsx:578,723`
//     — `h2` stanów odmowy i pustki (zasiana fikstura ma dane, więc nie padają);
//   • `projects/ProjectContextPanel.tsx:268` — `h2` panelu kontekstu, którego
//     przystanek Projektów nie otwiera;
//   • `tasks/TaskBoardLayout.tsx:309` i `tasks/TaskCalendarLayout.tsx:481` —
//     `h3` układów, których przystanek Zadań nie przełącza.
// Rozstrzygnięcie każdego z nich po TEJ osi, policzone z reguły: `h2` pod `h1`
// pasma to ani pominięcie szczebla, ani płaskie zagnieżdżenie (żaden z tych
// ekranów nie ma otwarcia `--text-2xl`), więc pierwsze trzy nie chowają
// czerwieni. DWA OSTATNIE CHOWAJĄ: treść zaczynająca się od `h3` pod `h1` pasma
// jest pominięciem szczebla i ta oś nazwałaby ją `HEADING_OUTLINE_SKIPPED_RUNG`,
// gdyby przelotka tam weszła.
//
// TO JEST ZNANY ZAKRES, A NIE CICHA ZGODA, i nie jest naprawiany tutaj:
// przełączanie układów i wchodzenie w stany pustki na przystanku to robota
// PRZELOTKI (`verify-renderer-layout.mjs`), nie reguły nad zebraną tablicą.
// Reguła jest gotowa na te ekrany w dniu, w którym przelotka je odwiedzi.
//
// ── SPIS WYŻEJ ZGNIŁ, ZANIM KTOKOLWIEK GO PRZECZYTAŁ, I DRUGA ZBIÓRKA STĄD
//    WYNIKŁA ────────────────────────────────────────────────────────────────
//
// Cztery nazwy w akapicie `NO_HEADINGS` („tasks, projects, pipeline, people")
// to RĘCZNA LISTA OBOK OTWARTEGO ZBIORU POWIERZCHNI, czyli klasa defektu, którą
// to repozytorium ma nazwaną. Lot D3 dołożył `captures` po tym, jak lista
// została napisana, i nikt jej nie dopisał — a Historia wrzutek na pustym
// obszarze roboczym rysuje `InlineState`, którego domyślnym szczeblem jest
// `h3`. Konspekt `h1 → h3`, czyli dokładnie ten defekt, którego ta oś pilnuje.
//
// TA OŚ PRZESZŁA WTEDY NA ZIELONO I MIAŁA RACJĘ: przelotka odwiedza `captures`
// (wiersz `captures NO_OPENING band h1 content h2` w raporcie), tyle że na
// ZASIANEJ fiksturze, gdzie rejestr wrzutek ma wiersze i rysuje
// `h2 Kept originals`. Zmierzone jeszcze raz osobno: przy 320 px na tej samej
// fiksturze konspekt jest identyczny, więc winna była DANE, a nie szerokość.
// Wadę znalazł paczkowany smoke — trzy systemy, dwadzieścia minut, po fakcie
// (`PACKAGED_ALPHA_NARROW_SURFACE_INVALID`, `headingJumps: [3]`).
//
// DRUGIE MIEJSCE ZBIÓRKI, TA SAMA REGUŁA:
// `packages/desktop-ui/test/empty-state-outline.interaction.test.tsx` montuje
// powłokę na fiksturze BEZ danych, chodzi po całym `desktopSurfaceRegistry`
// i podaje zebrane konspekty TEJ funkcji. Reguła nie jest tam przepisana, tylko
// zaimportowana z tego pliku — inaczej byłyby to dwa słowniki tego samego
// kształtu. Podział pracy: przelotka odpowiada za stany Z DANYMI i za wszystko,
// co wymaga pikseli; tamten plik za stany PUSTE, których żadna fikstura bramki
// nie rysuje. Złamania na obu ekranach: `scripts/break-empty-state-outline.mjs`.

/** How a heading is printed in a report line and in a failure. */
export const describeHeading = (heading) =>
  `h${heading.level} ${heading.signature} „${heading.sample}"`;

/**
 * Judge ONE screen's outline.
 *
 * `screen` is `{ id, band, content }` where `band` and `content` are arrays of
 * `{ level, signature, sample, opening }` in document order — `band` holds the
 * headings inside the title band (the screen title), `content` the ones a
 * reader meets below it. `opening` is the flag axis 4 computes (size equals
 * `--text-2xl` resolved in the same page); this function never looks at a
 * pixel itself.
 *
 * Returns `{ id, state, opening, skips, flat }`:
 *   • `state` — `NO_HEADINGS` (nothing to judge, and it is SAID rather than
 *     passed silently), `NO_OPENING` (levels rule only), or `JUDGED`.
 *   • `skips` — every heading that opens a rung more than one below the
 *     deepest rung open above it.
 *   • `flat` — every heading after the opening that stands at or above the
 *     opening's rank, i.e. is not under it.
 */
export const judgeScreenOutline = (screen) => {
  const band = screen.band ?? [];
  const content = screen.content ?? [];
  const opening =
    content.length > 0 && content[0].opening === true ? content[0] : null;

  const skips = [];
  // THE BAND'S HEADING IS THE FIRST RUNG, and it has to be, or every screen
  // whose title sits in the band would read as „starts at h2, skips h1". The
  // deepest rung is seeded from the band when the band has one, and from the
  // first content heading when it does not — a screen with no title heading is
  // a different defect, owned by `TITLE_BAND_NOT_MEASURED`, and this axis must
  // not report it a second time under its own name.
  let previous =
    band.length > 0
      ? Math.min(...band.map((heading) => heading.level))
      : content.length > 0
        ? content[0].level
        : 0;
  for (const heading of content) {
    // GŁĘBIEJ NAJWYŻEJ O JEDEN, PŁYCIEJ O ILE CHCE. Zamknięcie sekcji i powrót
    // na wyższy szczebel (`h3` → `h2`) jest poprawnym konspektem; otwarcie
    // szczebla, którego nikt nie zaczął (`h2` → `h4`), nie jest.
    if (heading.level > previous + 1)
      skips.push({ heading, expected: previous + 1 });
    previous = heading.level;
  }

  const flat =
    opening === null
      ? []
      : content
          .slice(1)
          .filter((heading) => heading.level <= opening.level)
          .map((heading) => ({ heading, opening }));

  return {
    id: screen.id,
    state:
      content.length === 0
        ? "NO_HEADINGS"
        : opening === null
          ? "NO_OPENING"
          : "JUDGED",
    opening,
    band,
    content,
    skips,
    flat,
  };
};

/**
 * Judge every walked screen. Returns `{ judged, failures, reported, counts }`.
 *
 * FAILURES CARRY BOTH SIDES. A verdict that says „this is wrong" without
 * saying what was measured and what the reference does is unactionable, and
 * this repository has a named defect class for it.
 */
export const judgeHeadingOutline = (screens) => {
  const judged = screens.map((screen) => judgeScreenOutline(screen));
  const failures = [];
  const reported = [];
  let flatScreens = 0;
  let skipScreens = 0;
  let judgedScreens = 0;
  let withoutOpening = 0;
  let withoutHeadings = 0;

  for (const screen of judged) {
    if (screen.state === "NO_HEADINGS") withoutHeadings += 1;
    else if (screen.state === "NO_OPENING") withoutOpening += 1;
    else judgedScreens += 1;

    if (screen.flat.length > 0) {
      flatScreens += 1;
      const line =
        `HEADING_OUTLINE_FLAT — ${screen.id}: the screen opens with ` +
        `${describeHeading(screen.opening)} and then puts ` +
        `${screen.flat
          .map(({ heading }) => describeHeading(heading))
          .join(", ")} at the SAME rung or above it, so the opening contains ` +
        "nothing and a screen reader lists them as siblings. The reference " +
        "nests them: `h2.td-greeting` over `h3` section heads " +
        "(`v3/screens/today.js:133,140,149`), `h2.cal-title` over the `h3` " +
        "tray (`v3/screens/calendar.js:205,224`). This is a RANK, so no " +
        "instrument reading size can see it — that is why this one reads none.";
      if (HEADING_OUTLINE_NESTING_ARMED) failures.push(line);
      else reported.push(line);
    }

    if (screen.skips.length > 0) {
      skipScreens += 1;
      const line =
        `HEADING_OUTLINE_SKIPPED_RUNG — ${screen.id}: ` +
        `${screen.skips
          .map(
            ({ heading, expected }) =>
              `${describeHeading(heading)} opens a rung below h${expected}`,
          )
          .join(
            ", ",
          )}. A skipped rung makes the outline unreadable to anything that ` +
        "walks it — the levels between are announced as missing sections.";
      if (HEADING_OUTLINE_LEVELS_ARMED) failures.push(line);
      else reported.push(line);
    }
  }

  return {
    judged,
    failures,
    reported,
    counts: {
      screens: judged.length,
      judged: judgedScreens,
      withoutOpening,
      withoutHeadings,
      flatScreens,
      skipScreens,
      headings: judged.reduce(
        (total, screen) => total + screen.content.length,
        0,
      ),
    },
  };
};
