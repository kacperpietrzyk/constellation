/* Shared stroke-icon set of the desktop shell. Every surface uses the same
   close glyph and metrics; sizing comes from the global `svg` rule and the
   consuming control (e.g. `.icon-button`).

   THIS FILE IS ON THE HOT PATH. `RealApp.tsx:54` imports it statically, so its
   chunk sits behind a `modulepreload` and every glyph here is paid for at
   window open, whether or not anything renders it. The map below is a plain
   object literal inside the component — nothing tree-shakes an unused entry.
   Measured 2026-08-07, clean rebuild, chunk `Icon-*.js`: 1 610 B raw / 775 B
   gzip before the consolidated set below, 2 674 B raw / 1 103 B gzip after —
   ten glyphs cost +1 064 B raw and +328 B gzip on this chunk. The hot path
   moved 629 930 → 630 994 B raw, i.e. +1 064 B, exactly this chunk; and
   171 145 → 171 478 B gzip, i.e. +333 B, which is FIVE MORE than this chunk
   gained. The five bytes are not a second consumer: the chunk's content hash
   changed, so the specifier written into the importing chunk changed too, and
   a different byte string compresses differently. Sums of per-file gzip are
   not additive with source edits — do not go hunting for those five bytes.
   One owner adds glyphs, once, and publishes that number; screen lots only
   consume names. Reserve left on the tightest budget, hot-path gzip: 2 522 B.

   SECOND OWNER, PHASE D LOT D2 (2026-08-11): `organization` and `calendar`, for
   registry entries #24 and #31. TWO glyphs, not three — the third retarget
   (Today) took `clock`, which the 2026-08-07 set already carries, so reading
   this file before drawing saved a drawing.

   THE NUMBER THIS OWNER CAN HONESTLY PUBLISH IS NOT THE GLYPH SHARE. That lot
   changed nine files at once (navigation counts, Today's head, the tab, the
   help mark, font smoothing), so its whole hot-path delta is +625 B gzip
   (171 952 → 172 577 of 174 000; reserve after: 1 423 B) and the two glyphs
   were NOT measured in isolation. Extrapolating the 2026-08-07 rate — ~33 B
   gzip per glyph — puts them near 66 B, which is an estimate and is labelled
   as one. A lot that needs the real number must measure a build with only the
   glyph edit in it, the way the entry above did.

   GEOMETRY OF THE GLYPHS ADDED 2026-08-07. The shapes come from the v3
   prototype, which draws its icons inline on a 16x16 viewBox with stroke
   width 1.3 (`v3/app.js:14-59`, `v3/screens/knowledge.js:356-368`). This file
   keeps its own convention — 24x24, stroke 1.6 — so every path was scaled
   x1.5 mechanically: rx/ry/x/y of every arc scaled, the rotation and both arc
   flags left alone, then checked that the command sequence is identical and
   the bounding box is exactly x1.5. The one thing that does NOT carry over is
   the stroke ratio: the prototype runs 1.3/16 = 0.081 of the box, this set
   runs 1.6/24 = 0.067. Prototype strokes are proportionally heavier. That is a
   recorded divergence, not an oversight — the app's fifteen older glyphs are
   drawn for 1.6 and one set cannot carry two weights. */

export type IconName =
  | "capture"
  | "tasks"
  | "search"
  | "close"
  | "project"
  | "cockpit"
  | "attention"
  | "access"
  | "documents"
  | "meetings"
  | "relationships"
  | "organization"
  | "calendar"
  | "people"
  | "pipeline"
  | "renewals"
  | "settings"
  | "clock"
  | "check"
  | "warn"
  | "arrow"
  | "chevron-right"
  | "chevron-down"
  | "flag"
  | "list"
  | "panel"
  | "fields"
  | "folder"
  | "folder-loose";

export const Icon = ({ name }: { readonly name: IconName }) => {
  const paths = {
    capture: <path d="M12 5v14M5 12h14" />,
    tasks: <path d="m5 7 2 2 4-4M12 7h7M5 15l2 2 4-4M12 15h7" />,
    search: (
      <path d="m20 20-4.3-4.3M10.8 17a6.2 6.2 0 1 1 0-12.4 6.2 6.2 0 0 1 0 12.4Z" />
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    project: <path d="M4 5h6l2 2h8v12H4z" />,
    cockpit: <path d="M4 5h7v6H4zM13 5h7v10h-7zM4 13h7v6H4zM13 17h7v2h-7z" />,
    attention: (
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM9.5 20h5" />
    ),
    access: (
      <path d="M16 19c0-3-2.2-5-5-5s-5 2-5 5M11 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 8h4M19 6v4" />
    ),
    documents: <path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h7M9 16h7" />,
    meetings: <path d="M5 5h14v14H5zM8 3v5M16 3v5M5 10h14M8 14h3M13 14h3" />,
    relationships: (
      <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16.5 10a2.5 2.5 0 1 0 0-5M3 20c0-4 2-6 5-6s5 2 5 6M14 14c3 0 5 2 5 6M11 8h3" />
    ),
    /* WPIS #24 REJESTRU — BUDYNEK, NIE DRUGIE DWIE SYLWETKI.
       `v3/app.js:20` (`org`), przeskalowany ×1,5 jak cały ten zestaw. Do tego
       lotu cel „Organizations" nosił glif `relationships` — dwie sylwetki
       z kreską łącznika, której przy 16 px nie widać — a tuż pod nim, w TEJ
       SAMEJ grupie CRM, stoi „People" z dwiema sylwetkami. Rejestr zmierzył to
       na powiększeniu 3×, a plik sam zapowiadał tę kolizję komentarzem.

       `relationships` ZOSTAJE W ZESTAWIE i nie jest przerysowywany: renderuje
       go ekran rekordu projektu (`record/ProjectRecordOverview.tsx`) dla pasa
       POWIĄZAŃ, gdzie graf jest właśnie tym, co znak ma znaczyć. Kolizja była
       w PRZYPISANIU, nie w rysunku. */
    organization: (
      <path d="M4.5 20.25V6.3a1.5 1.5 0 0 1 1.5-1.5h6.75a1.5 1.5 0 0 1 1.5 1.5v13.95M14.25 9.75H18a1.5 1.5 0 0 1 1.5 1.5v9M3 20.25h18M7.8 9h2.4M7.8 12.9h2.4M7.8 16.8h2.4" />
    ),
    /* WPIS #31 REJESTRU, POŁOWA DRUGA — KARTKA KALENDARZA.
       `v3/app.js:37` (`calendar`), ×1,5. „Today" i „Calendar" niosły DOKŁADNIE
       ten sam glif (`cockpit`, czterokomórkowa siatka) na dwóch sąsiednich
       wierszach nawigacji. Prototyp stawia tam zegar i kartkę kalendarza;
       zegar ten zestaw MA od 2026-08-07 (`clock` niżej), więc nowy jest tylko
       ten jeden znak, a nie dwa.

       RÓŻNICA WOBEC `meetings` JEST ZAMIERZONA, ALE NIE JEST RÓŻNICĄ
       PROTOTYPU, i to prostuje naprawa po przeglądzie tego lotu. Tutaj oba
       znaki są z jednej rodziny: `meetings` to kartka z podziałką dni
       (`M8 14h3M13 14h3`), a ta jest pusta. Prototyp rozdziela je INACZEJ —
       jego `meeting` (`v3/app.js:23`) to nie kartka, tylko kamera (zaokrąglony
       prostokąt z trójkątem obiektywu), więc para „pusta kartka wobec kartki
       z podziałką" jest rozstrzygnięciem TEJ aplikacji, nie cytatem. Adoptowany
       z prototypu jest sam `calendar`; `meetings` zostaje starszym glifem tego
       zestawu, bo przerysowanie go na kamerę byłoby zmianą, o którą nie prosi
       żaden wpis rejestru. Dwa cele w dwóch różnych grupach nawigacji. */
    calendar: (
      <path d="M3.75 6.75a1.5 1.5 0 0 1 1.5-1.5h13.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-12ZM3.75 10.5h16.5M8.25 3.75v3M15.75 3.75v3" />
    ),
    // Dwie sylwetki obok siebie: „relationships" niesie graf powiązań, a to są
    // ludzie w nim. Ten sam cel w nawigacji nie może nosić tego samego znaku co
    // Organizations, bo obie pozycje stoją w tej samej grupie.
    people: (
      <path d="M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20c0-3.3 2.7-5 6-5s6 1.7 6 5M16 7.5a2.5 2.5 0 1 1 0 5M17 15c2.5.6 4 2.4 4 5" />
    ),
    // Trzy kolumny malejącej wysokości: tablica, po której sprawa schodzi
    // w dół lejka. Nie może nosić znaku „relationships" ani „people" — wszystkie
    // trzy stoją w tej samej grupie nawigacji.
    pipeline: <path d="M4 5h4v14H4zM10 5h4v10h-4zM16 5h4v6h-4z" />,
    // Cykl, nie kalendarz i nie dokument: kontrakt wraca co okres, a klucz
    // cyklu znaczy dokładnie to. Strzałka zamyka pętlę, wskazówki mówią, że
    // pętla ma termin — obie pozycje CRM obok mają własne znaki, więc ten musi
    // się różnić od `relationships` i od `people`.
    renewals: (
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1M20.5 4v4.5H16M12 8v4.4l2.8 1.7" />
    ),
    settings: (
      <path d="M4 7h7M17 7h3M4 17h2M12 17h8M16 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM11 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
    ),

    /* ── Consolidated set for the v3 adoption wave, added 2026-08-07 ────────
       Claimed by three screen lots: Pipeline (`clock`, `arrow`, `warn`),
       Renewals (`clock`, `check`, `warn`, `arrow`, `chevron-right`, `flag`,
       `list`), Library (`folder`, `folder-loose`, `chevron-right`,
       `chevron-down`). Sources in the prototype are named per glyph.

       THERE IS NO `plus` HERE, AND THAT IS DELIBERATE. `capture` above is
       already the prototype's `plus` (`v3/app.js:27`) to within a quarter of a
       unit: scaled x1.5 the prototype reads `M12 5.25v13.5M5.25 12h13.5`,
       `capture` reads `M12 5v14M5 12h14` — the same cross, a hair longer. A
       lot rendering `<Icon name="capture" />` on "Start" or "Add to contract"
       is doing the right thing; a second entry would be the same drawing paid
       for twice on the hot path. */

    /* `v3/app.js:47` — a term running out is the one thing every CRM row says
       with a glyph. */
    clock: (
      <path d="M12 6.75V12l3.3 1.95M21 12A9 9 0 1 1 3 12a9 9 0 0 1 18 0Z" />
    ),
    /* `v3/app.js:33` */
    check: <path d="m5.25 12.75 4.5 4.5 9-10.5" />,
    /* `v3/app.js:48` — the prototype puts the dot as `h.01`, i.e. a round cap
       with almost no travel; scaled it is `h.015`, still a dot. */
    warn: (
      <path d="M12 9v4.5M12 16.5h.015M10.65 4.35a1.5 1.5 0 0 1 2.7 0l7.5 13.5A1.5 1.5 0 0 1 19.5 20.1H4.5a1.5 1.5 0 0 1-1.35-2.25l7.5-13.5Z" />
    ),
    /* `v3/app.js:54` — "this leads somewhere", on a link out of a row. */
    arrow: <path d="M5.25 12h13.5M13.5 6.75 18.75 12 13.5 17.25" />,
    /* `v3/app.js:28` and `:29`. The prototype ALSO carries a second, slightly
       smaller pair under `caretRight`/`caretDown` in
       `v3/screens/knowledge.js:361-362`. That is a local re-cut, not a decided
       difference: the comment above that map says it declares "three" glyphs
       for reasons that only cover `folder`, `folderLoose` and `into`, while
       the map holds five. The shell pair wins here and the Library lot takes
       it rather than re-cutting its own. Difference recorded, not harmonised
       away in the prototype. */
    "chevron-right": <path d="m8.25 5.25 7.5 6.75-7.5 6.75" />,
    "chevron-down": <path d="m5.25 9 6.75 6.75L18.75 9" />,
    /* `v3/app.js:44` — "nobody has started this". */
    flag: (
      <path d="M5.25 15s.9-.9 3.45-.9 4.35 1.8 6.9 1.8 3.15-.9 3.15-.9V5.25s-.9.9-3.15.9S11.25 4.35 8.7 4.35 5.25 5.25 5.25 5.25v15" />
    ),
    /* `v3/app.js:34` */
    list: <path d="M4.5 6.75h15M4.5 12h15M4.5 17.25h15" />,
    /* `v3/app.js:53` (`panel`) and `:42` (`fields`), both scaled x1.5 — the two
       glyphs the prototype puts at the right end of its title bar
       (`v3/app.js:554-557`). The prototype's third member of that group is a
       theme toggle; this application keeps appearance in Settings and has no
       such control, so the group is two, not three. A glyph invented for a
       control that does not exist would be the more expensive kind of
       fidelity. */
    panel: (
      <path d="M3.75 6a1.5 1.5 0 0 1 1.5-1.5h13.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V6Zm10.5 0v13.5" />
    ),
    fields: <path d="M3.75 5.25h16.5v13.5H3.75zM9 5.25v13.5" />,
    /* `v3/screens/knowledge.js:358`. The prototype draws its folder with the
       SAME outline it gives `project` (`v3/app.js:18`); this file does not,
       because `project` above is an older, squarer app glyph and quietly
       redrawing it is a change no lot asked for.
       COST OF THAT, NAMED: the set now carries TWO drawings of a folder —
       `project` (square, no corner radius, older app hand) and `folder`
       (rounded, v3 hand). The sidebar renders the first, the Library tree will
       render the second, and a reader sees both in one session. This is the
       inverse of the hazard `v3/screens/knowledge.js:353-355` warns about: not
       one glyph carrying two meanings, but one meaning carrying two glyphs.
       Closing it means redrawing `project` for the whole shell, which is a
       ruling nobody has made. Recorded here so the Library lot does not
       "fix" it locally. */
    folder: (
      <path d="M3 6.3a1.5 1.5 0 0 1 1.5-1.5h4.35l1.8 2.4H19.5a1.5 1.5 0 0 1 1.5 1.5v9.6a1.5 1.5 0 0 1-1.5 1.5H4.5a1.5 1.5 0 0 1-1.5-1.5V6.3Z" />
    ),
    /* `v3/screens/knowledge.js:362` — "Unfiled" is a folder that does not
       exist. A dashed outline, explicitly NOT a warning triangle: a note
       without a folder is a permitted state of the model, and the warning
       glyph would say the opposite. The dash is scaled x1.5 with the shape.
       The outline is spelled out twice on purpose: hoisting it into a shared
       `const` puts a 125-character string literal at module scope, and
       `test/prose-scan.ts:207-229` reads module-scope literals as copy —
       measured, the guard failed on it. Attribute values are exempt there.
       Measured both ways: the shared `const` is 2 552 B raw / 1 106 B gzip,
       spelling it out twice is 2 674 B / 1 103 B — +122 B raw and −3 B gzip,
       because a repeated string is exactly what the compressor is for. The
       cheap-looking version was the more expensive one over the wire. */
    "folder-loose": (
      <path
        strokeDasharray="3.6 3"
        d="M3 6.3a1.5 1.5 0 0 1 1.5-1.5h4.35l1.8 2.4H19.5a1.5 1.5 0 0 1 1.5 1.5v9.6a1.5 1.5 0 0 1-1.5 1.5H4.5a1.5 1.5 0 0 1-1.5-1.5V6.3Z"
      />
    ),
  } as const;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
};
