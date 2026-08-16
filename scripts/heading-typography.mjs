// Does EVERY HEADING DECLARE ITS OWN SIZE AND WEIGHT — decided from the
// stylesheets, without a browser.
//
// WHY THIS FILE EXISTS. The renderer's one instrument for heading type is the
// fidelity probe's title band, and its subject is `TITLE_SELECTOR =
// "#surface-title"` (`scripts/verify-renderer-layout.mjs`). An id is unique by
// definition, so that probe judges EXACTLY ONE heading per screen state and says
// nothing about the other hundred-odd heading rules that ship. Measured on this
// branch: 104 heading subjects in `packages/desktop-ui/src/**/*.css`, of which
// the title band describes one. `.knowledge-welcome h2` and `.welcome h3`
// declare NEITHER a size NOR a weight — which is the exact defect that probe was
// built for — and both sit outside its subject. This file makes the population
// the subject.
//
// WHY A MISSING DECLARATION IS A DEFECT AND NOT AN INHERITANCE. Measured, not
// assumed: `packages/desktop-ui/src` contains NO global heading reset — no bare
// `h1`…`h6` rule, no `:where(h1)`, no `font: inherit` aimed at headings. So an
// `h1`…`h6` with no author `font-size` takes the user-agent value (`2em`,
// `1.5em`, `1.17em`, `1em`, `0.83em`, `0.67em` of the inherited size) and with no
// author `font-weight` takes UA `bold` (700). Both are off the v3 scale, and
// neither is what the surrounding rule "meant". The UA declaration matches the
// heading ELEMENT, so an ancestor's `font-weight` never reaches it — "the parent
// carries the weight" is not an available excuse for an element-subject rule.
// That measured fact, not taste, is why ancestor inheritance earns no credit
// here.
//
// WHY IT RUNS WITHOUT A BROWSER. „Every heading rule declares a size and a
// weight" is a statement about the SHEET. The pixels it resolves to are a
// statement about the geometry, and those belong to the layout gate, which needs
// a dev server and a Chromium and therefore has its own CI job. This rule is a
// function over strings, so it runs in `npm run check` on all three systems —
// the same split `scripts/descendant-overflow.mjs` already makes.
//
// FOUR VERDICTS, DELIBERATELY NOT ONE LIST OF EXCEPTIONS:
//
//   "declared"   — the subject declares both properties itself, or accumulates
//                  them across several rules with the SAME selector in the same
//                  sheet. `.meeting-markdown h4, .meeting-markdown h5` carries
//                  the weight and `.meeting-markdown h4` carries the size; that
//                  is one heading described by two rules, not a defect.
//   "refinement" — a MORE GENERAL selector in the same sheet already declares
//                  both for the same elements, so this rule adds a detail rather
//                  than describing a heading. `.wave2-header h1` sets only
//                  `text-wrap`, and every element it matches also carries
//                  `surface-header` (measured, see `coOccurringClasses`), where
//                  `.surface-header h1` sets `--text-sm` at weight 600. Demanding
//                  a size here would be a false alarm on correct code, and a
//                  false alarm kills a gate faster than its absence.
//   "hidden"     — the subject is visually hidden by its own declarations
//                  (`clip`, `clip-path`, `display: none`, `visibility: hidden`).
//                  `.sr-only` is the case: `MeetingsSurface.tsx` gives the
//                  screen title that class on purpose, and the layout probe
//                  already counts such titles as "parked" rather than judging
//                  them. Derived from the declarations, NOT from a list of class
//                  names, so a second hidden heading is covered the day it
//                  appears.
//   "known"      — DEBT, not contract. A named entry below, carrying the EXACT
//                  set of properties it is missing and the thread that owns it.
//                  The entry does not excuse the rule from measurement: a
//                  different missing set — worse OR partly fixed — fails, so the
//                  registry cannot rot into a blanket amnesty.
//   "violation"  — a heading nobody sized or weighted, and nobody claimed.
//
// The registry is itemized and every entry names an owner. A blanket waiver
// („sheets older than Phase 3 do not count") would pass this same gate and would
// mean nothing.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/** Properties a heading rule has to declare. `font:` shorthand supplies both. */
export const REQUIRED_HEADING_PROPERTIES = ["font-size", "font-weight"];

/**
 * KNOWN HEADING TYPOGRAPHY DEBT, READ OFF THE TREE ON 2026-08-07, NOT GUESSED.
 * Every entry is a subject this scan actually produced on branch
 * `agent/wizualny-jezyk-v3` (`node scripts/heading-typography.mjs` prints the
 * table it was built from).
 *
 * `owner` is the thread that closes the entry, and it is deliberately allowed to
 * say "no lot named this". Phase 3 has six lots and 67 items; only three items
 * across two lots name a heading. Inventing a lot number for the other
 * twenty-odd would produce a registry that reads like a plan and is a fiction —
 * the failure this whole phase is unwinding. `OWNERS` below is the closed list,
 * and an entry outside it fails.
 *
 * `missing` is EXACT. A rule that loses a property it had, and a rule that gains
 * one it lacked, both stop matching their entry and fail — the second on purpose:
 * the debt is paid by deleting the entry in the same commit, the way
 * `scripts/descendant-overflow.mjs` requires.
 */
export const KNOWN_HEADING_TYPOGRAPHY_DEBT = [
  // ── Library, lot 5 #3 and #4: RETIRED 2026-08-07, eleven entries deleted ──
  // Nine were named by the lot (two `#3` subjects declaring NEITHER property,
  // seven `#4` subjects declaring no weight) and two more were carried here
  // under „lot 5 — file scope". All eleven were paid, and the two file-scope
  // ones were paid the OPPOSITE way to the way this registry told the lot to
  // pay them — which is the part worth keeping:
  //
  //   `.library-section-heading h2` and `.knowledge-library h1` were recorded
  //   here as having NO CONSUMER, with the instruction „delete, do not paint".
  //   The measurement behind that instruction was a grep over the renderer's
  //   MARKUP, and it was correct about the markup. It missed a consumer of a
  //   different kind: `packages/desktop-ui/test/interaction-recovery-contract.test.ts`
  //   asserts `.knowledge-library { … background: var(--surface-sunken) }` by
  //   regular expression over the stylesheet SOURCE, so deleting the block
  //   turns that test red. Both selectors also share their rule with a live
  //   sibling (`.knowledge-editor-header h2`, `.section-heading-row h3`/`h4`),
  //   so one declaration retires the live entry and the dead one together
  //   whether or not anybody wants it to.
  //
  //   THE LESSON FOR THE NEXT ENTRY WRITTEN HERE: „no consumer" is a claim
  //   about a search, and the search that produced it has to be stated. A rule
  //   can be held in place by a test that reads the sheet as a string, by a
  //   gate's registry, or by a selector in a script — none of which a grep for
  //   `className` will ever return.
  {
    sheet: "styles.css",
    selector: ".document-canvas h1",
    missing: ["font-size", "font-weight"],
    owner: "lot 5 — file scope",
    note: "styles.css:8078, inside the `.document-canvas` block that opens at :8049. The note canvas sets its own font-size as a clamp and then leaves prose headings on the UA scale, so an <h1> in a note draws at 2em of that clamp. Three subjects, one rule.",
  },
  {
    sheet: "styles.css",
    selector: ".document-canvas h2",
    missing: ["font-size", "font-weight"],
    owner: "lot 5 — file scope",
    note: "styles.css:8078 — same rule, UA 1.5em.",
  },
  {
    sheet: "styles.css",
    selector: ".document-canvas h3",
    missing: ["font-size", "font-weight"],
    owner: "lot 5 — file scope",
    note: "styles.css:8078 — same rule, UA 1.17em.",
  },
  // ── Settings, lot 6 by file scope, NOT named by any of its eight items ────
  // Everything here is either a `settings/*.module.css` that lot 6 owns or a
  // dialog rule in `styles.css` that no lot names by item, and NONE of lot 6's
  // eight items is about a heading. The lot can take them for free while it is
  // in the file; it is not obliged to.
  //
  // THE LINE RANGE THAT USED TO STAND HERE IS GONE BECAUSE IT WAS FALSE IN BOTH
  // DIRECTIONS, and that is a measurement, not tidying. It read „everything
  // here is inside `styles.css:7513-8463`" — QUOTED VERBATIM FROM THE COMMIT
  // THAT CARRIED IT, and deliberately not re-pinned. The first pass through
  // this file moved the quotation's START with the live citations and left its
  // END where it was, which made it a quotation of a sentence nobody ever
  // wrote; and nothing here would have caught that, because the test beside
  // this file resolves the first `:N` of a `note`, never a number inside
  // a comment. A quotation of a claim that has been WITHDRAWN does not move
  // when the sheet moves — moving it is what turns evidence into decoration.
  // Measured 2026-08-15 against the
  // scan's own rule lines: the nine `styles.css` entries below it sit at :9576,
  // :9811, :9890, :10060, :9983, :10093 and :10134 — every one of them OUTSIDE
  // that range — while the range does contain `.hub-enrollment h4` (:7668),
  // whose own note says it is „outside the Settings region lot 6 owns". A range
  // that excludes what it introduces and includes what another entry excludes
  // is not a stale number; re-pinning it would have kept the falsehood and
  // bought a number that rots on the next insertion.
  //
  // I ROTNĘŁO — na następnej wstawce, dokładnie jak wyżej napisano. Wpis 11-2
  // Fazy III dołożył 28 wierszy na `styles.css:8329` (reguła `.knowledge-row
  // -excerpt`), więc KAŻDY żywy cytat tego rejestru powyżej tej linii przesunął
  // się o +28. Przesunięte zostały wyłącznie cytaty w polach `note:`, bo tylko
  // one są twierdzeniem o DZISIEJSZYM arkuszu; liczby w komentarzu WYŻEJ
  // (`:9576`, `:9811`, … — pomiar z 2026-08-15) i w narracji przy
  // `citedContinuations` zostały NIETKNIĘTE, bo są zapisem stanu z konkretnego
  // dnia, a nie wskaźnikiem do kodu. Każdy przesunięty cytat sprawdzony
  // TREŚCIĄ, nie arytmetyką: asercje „resolve to the rule that entry registers"
  // i „bare `:N` continuation" przechodzą, a one czytają arkusz.
  {
    sheet: "styles.css",
    selector: ".onboarding-step h2",
    missing: ["font-weight"],
    owner: "lot 6 — file scope",
    note: "styles.css:9695.",
  },
  {
    sheet: "styles.css",
    selector: ".settings-copy h2",
    missing: ["font-weight"],
    owner: "lot 6 — file scope",
    note: "styles.css:9965.",
  },
  {
    sheet: "styles.css",
    selector: ".concept-help-dialog h2",
    missing: ["font-weight"],
    owner: "lot 6 — file scope",
    note: "styles.css:10086.",
  },
  {
    sheet: "styles.css",
    selector: ".concept-help-dialog > header h2",
    missing: ["font-size", "font-weight"],
    owner: "lot 6 — file scope",
    note: "styles.css:10256. This rule is a REFINEMENT of `.concept-help-dialog h2` (:10086) and would not be judged at all if that rule were complete — but it declares no weight either, so nothing covers this one and both are registered. Giving :10086 a weight retires BOTH entries in one edit, and the scan will demand exactly that: this subject turns into a `refinement` the moment the general rule declares both.",
  },
  {
    sheet: "styles.css",
    selector: ".concept-help-layout article h3",
    missing: ["font-weight"],
    owner: "lot 6 — file scope",
    note: "styles.css:10179.",
  },
  {
    sheet: "styles.css",
    selector: ".notes-export-terms h3",
    missing: ["font-weight"],
    owner: "lot 6 — file scope",
    note: "styles.css:10289.",
  },
  {
    sheet: "styles.css",
    selector: ".notes-import-limitations h3",
    missing: ["font-weight"],
    owner: "lot 6 — file scope",
    note: "styles.css:10330.",
  },
  {
    sheet: "styles.css",
    selector: ".notes-import-preview h3",
    missing: ["font-weight"],
    owner: "lot 6 — file scope",
    note: "styles.css:10330 — same rule, second ancestor.",
  },
  {
    sheet: "settings/activity-section.module.css",
    selector: ".stateTitle",
    missing: ["font-size", "font-weight"],
    owner: "lot 6 — file scope",
    note: "activity-section.module.css:390. A CLASS subject (`ActivitySection.tsx:66` puts it on an <h3>) whose only rule sets `min-width: 0`. The layout gate already knows this element by name — `h3._stateTitle` was a registry entry in `descendant-overflow.mjs` — so it is measured for WIDTH and unmeasured for TYPE.",
  },
  // ── Outside Phase 3 entirely ──────────────────────────────────────────────
  // No lot has these files in scope. They are here so the scan can run today,
  // and each one names the surface a later wave would have to open.
  {
    sheet: "styles.css",
    selector: ".strategic-review h2",
    missing: ["font-size", "font-weight"],
    owner: "outside Phase 3",
    note: "styles.css:178 — the `To decide` ledger on the depth surface.",
  },
  {
    sheet: "styles.css",
    selector: ".strategic-create-panel h2",
    missing: ["font-weight"],
    owner: "outside Phase 3",
    note: "styles.css:276 — the relationship-register create panel.",
  },
  {
    sheet: "styles.css",
    selector: ".strategic-create-options h3",
    missing: ["font-weight"],
    owner: "outside Phase 3",
    note: "styles.css:338 and :343 — one subject described by two rules, size from the second.",
  },
  {
    sheet: "styles.css",
    selector: ".surface-load-state h1",
    missing: ["font-size", "font-weight"],
    owner: "outside Phase 3",
    note: "styles.css:4414. The loading and failure state of EVERY lazy surface, so it is seen on the way into most screens. `.center-state h1` (:4393) is the same shape done right (--text-xl / --weight-semibold, which resolves to 600 in tokens.css:72) and the two classes never co-occur.",
  },
  {
    sheet: "styles.css",
    selector: ".workspace-context h2",
    missing: ["font-size", "font-weight"],
    owner: "outside Phase 3",
    note: "styles.css:7533. Co-occurs with `inspector-empty`, which has no heading rule at all, so nothing covers it.",
  },
  {
    sheet: "styles.css",
    selector: ".hub-enrollment h4",
    missing: ["font-weight"],
    owner: "outside Phase 3",
    note: "styles.css:7759 — outside the Settings region lot 6 owns.",
  },
  {
    sheet: "organizations/organizations.module.css",
    selector: ".emptyState h2",
    missing: ["font-weight"],
    owner: "outside Phase 3",
    note: "organizations.module.css:642 — Wave C empty state.",
  },
  {
    sheet: "people/people.module.css",
    selector: ".emptyState h2",
    missing: ["font-weight"],
    owner: "outside Phase 3",
    note: "people.module.css:803 — Wave C empty state.",
  },
  {
    sheet: "pipeline/pipeline.module.css",
    selector: ".emptyState h2",
    missing: ["font-weight"],
    owner: "outside Phase 3",
    note: "pipeline.module.css:862 — Wave C empty state. Lot 2 owns this SHEET but none of its eleven items is about a heading, and an empty pipeline is not drawn on the seeded fixture.",
  },
  {
    sheet: "projects/project-context.module.css",
    selector: ".title",
    missing: ["font-weight"],
    owner: "outside Phase 3",
    note: "project-context.module.css:26 — `Areas and initiatives` in the project context panel. A CLASS subject (`ProjectContextPanel.tsx:268`).",
  },
];

/** The closed list of owners a debt entry may name. */
export const OWNERS = [
  "lot 5 #3",
  "lot 5 #4",
  "lot 5 — file scope",
  "lot 6 — file scope",
  "outside Phase 3",
];

// ── Reading the sheets ───────────────────────────────────────────────────────

/**
 * Comments out, LINE NUMBERS INTACT. Every non-newline character of a comment
 * becomes a space, so an offset into the stripped text still names the line it
 * came from. Stripping matters for a second reason in this repo: the token lint
 * next door reads sheets WITH their comments and has twice been broken by prose
 * that looked like code. A scanner that reads a commented-out rule as a rule
 * would report debt nobody can pay.
 */
export const stripCssComments = (css) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));

/**
 * Line numbers counted ONCE, forward, across the whole sheet. Counting from the
 * start for every rule is quadratic, and `styles.css` is two thousand rules over
 * two hundred thousand characters — the naive version cost this scan a hundred
 * and ninety milliseconds per pass, which the break-test below pays thirty-three
 * times over.
 */
const lineCounter = (css) => {
  let cursor = 0;
  let line = 1;
  return (index) => {
    while (cursor < index) {
      if (css.charCodeAt(cursor) === 10) line += 1;
      cursor += 1;
    }
    return line;
  };
};

/**
 * Flat rules out of a stylesheet. Deliberately not a CSS parser: this repo's
 * sheets have no nesting (measured — no `&` selector in
 * `packages/desktop-ui/src`), so a rule is „a selector list, a brace, no further
 * braces". Rules inside `@media` / `@container` / `@supports` come out as
 * ordinary rules, which is what we want — see `collectHeadingSubjects`.
 */
export const parseCssRules = (css) => {
  const stripped = stripCssComments(css);
  const lineAt = lineCounter(stripped);
  const rules = [];
  for (const match of stripped.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
    const selectorList = match[1];
    const leading = selectorList.length - selectorList.trimStart().length;
    rules.push({
      selectorList: selectorList.trim(),
      declarations: match[2],
      line: lineAt((match.index ?? 0) + leading),
    });
  }
  return rules;
};

/** Which of the required properties a declaration block supplies. */
export const declaredProperties = (declarations) => {
  const supplied = new Set();
  // `font:` is the shorthand for both. Nothing in the tree uses it on a heading
  // today (measured: zero of 104 subjects); it is honoured here so that using it
  // tomorrow is not reported as a defect.
  if (/(^|[;\s])font\s*:/.test(declarations)) {
    supplied.add("font-size");
    supplied.add("font-weight");
  }
  for (const property of REQUIRED_HEADING_PROPERTIES)
    if (new RegExp(`(^|[;\\s])${property}\\s*:`).test(declarations))
      supplied.add(property);
  return supplied;
};

/**
 * Declarations that take the element out of the visual layout entirely.
 *
 * `clip` and `clip-path` count only TOGETHER WITH taking the element out of
 * flow, which is the screen-reader-only shape and not the same thing as a
 * decorative clip. A bare `clip-path` on a heading is a heading with a fancy
 * edge, and excusing it from declaring a size would be this instrument's own
 * version of measuring presence instead of quality.
 */
export const isVisuallyHidden = (declarations) => {
  if (/(^|[;\s])display\s*:\s*none/.test(declarations)) return true;
  if (/(^|[;\s])visibility\s*:\s*hidden/.test(declarations)) return true;
  const clipped =
    /(^|[;\s])clip\s*:/.test(declarations) ||
    /(^|[;\s])clip-path\s*:/.test(declarations);
  return (
    clipped && /(^|[;\s])position\s*:\s*(absolute|fixed)/.test(declarations)
  );
};

/** Split a selector list on commas that are not inside parentheses. */
export const splitSelectorList = (selectorList) => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of selectorList) {
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts.map((part) => part.trim().replace(/\s+/g, " ")).filter(Boolean);
};

/**
 * A selector as a chain of compounds. Combinators are dropped on purpose: `>`,
 * `+` and `~` all imply the descendant relation this file reasons about, and
 * keeping them would only make the coverage test below narrower than the
 * cascade actually is.
 */
export const compoundsOf = (selector) =>
  selector
    .split(/\s*[>+~]\s*|\s+/)
    .filter(Boolean)
    .map((compound) => ({
      tag: compound.match(/^[a-zA-Z][\w-]*/)?.[0],
      classes: new Set(
        [...compound.matchAll(/\.([\w-]+)/g)].map((match) => match[1]),
      ),
    }));

// ── Deriving what counts as a heading ────────────────────────────────────────

/**
 * WHAT A HEADING IS, DERIVED RATHER THAN LISTED. Two subjects, and the second is
 * the reason this function reads TSX at all:
 *
 *   1. a selector whose SUBJECT compound is `h1`…`h6`;
 *   2. a selector whose subject compound is a CLASS THE APPLICATION PUTS ON A
 *      HEADING ELEMENT.
 *
 * The second cannot be read off a stylesheet — a stylesheet does not know what
 * element wears a class — so it is read off the JSX that writes it, which is the
 * same move `css-token-lint.test.ts` makes for the properties components set at
 * runtime. It has to be per-sheet, not global: `styles.groupHead` is an `<h3>` in
 * `library/NotesReading.tsx` and a `<div>` in five other layouts that import a
 * class of the same name from their own module. Judging `.groupHead` in
 * `task-list.module.css` would be judging a `<div>`.
 *
 * Also collected here: which classes ALWAYS travel together on one element, read
 * from literal `className="a b"` attributes. That is what lets
 * `.surface-header h1` cover `.wave2-header h1` (three call sites, all of them
 * `className="surface-header wave2-header"`). Template-literal class names are
 * NOT read, so the map is a subset of the truth — which is the safe direction:
 * a missed pair produces a demand for a declaration, never a silent pass.
 */
export const deriveHeadingClasses = (sources) => {
  const perSheet = new Map();
  const global = new Set();
  const literals = [];
  for (const { name, source } of sources) {
    const imports = new Map();
    for (const match of source.matchAll(
      /import\s+(\w+)\s+from\s+["'](\.[^"']*\.css)["']/g,
    ))
      imports.set(
        match[1],
        path
          .normalize(path.join(path.dirname(name), match[2]))
          .split(path.sep)
          .join("/"),
      );
    for (const match of source.matchAll(/className="([^"]+)"/g))
      literals.push(match[1].split(/\s+/).filter(Boolean));
    for (const heading of source.matchAll(/<h[1-6]\b([^>]*)>/g)) {
      const attributes = heading[1] ?? "";
      for (const match of attributes.matchAll(/className=\{(\w+)\.(\w+)\}/g)) {
        const sheet = imports.get(match[1]);
        if (sheet === undefined) continue;
        if (!perSheet.has(sheet)) perSheet.set(sheet, new Set());
        perSheet.get(sheet).add(match[2]);
      }
      for (const match of attributes.matchAll(/className="([^"]+)"/g))
        for (const name of match[1].split(/\s+/).filter(Boolean))
          global.add(name);
    }
  }
  return { perSheet, global, coOccurring: coOccurringClasses(literals) };
};

/**
 * For each class, the classes present on EVERY literal `className` that carries
 * it. „Every" is what makes this usable as a cascade fact: if one call site
 * writes `wave2-header` without `surface-header`, the pair drops out and
 * `.wave2-header h1` goes back to owing its own declarations.
 */
export const coOccurringClasses = (literals) => {
  const always = new Map();
  for (const tokens of literals)
    for (const token of tokens) {
      const companions = new Set(tokens.filter((other) => other !== token));
      const known = always.get(token);
      if (known === undefined) always.set(token, companions);
      else
        for (const companion of [...known])
          if (!companions.has(companion)) known.delete(companion);
    }
  return always;
};

const isHeadingSubject = (compound, sheet, headingClasses) => {
  if (compound.tag !== undefined && /^h[1-6]$/.test(compound.tag)) return true;
  const perSheet = headingClasses.perSheet.get(sheet);
  for (const name of compound.classes) {
    if (perSheet?.has(name) === true) return true;
    // Global class names only count in a GLOBAL sheet: a class written as a
    // string literal in JSX cannot be a CSS-module class, whose real DOM name is
    // hashed (`_title_1kitm_195`). „Global" is „not a module", not „is
    // styles.css" — the renderer also ships `tokens.css` and
    // `organization-context.css`, and the second already carries heading rules.
    if (!sheet.endsWith(".module.css") && headingClasses.global.has(name))
      return true;
  }
  return false;
};

// ── The rule ─────────────────────────────────────────────────────────────────

const expandedClasses = (compound, coOccurring) => {
  const expanded = new Set(compound.classes);
  for (const name of compound.classes)
    for (const companion of coOccurring.get(name) ?? [])
      expanded.add(companion);
  return expanded;
};

/** Does compound `general` match every element compound `specific` matches? */
const compoundCovers = (general, specific, coOccurring) => {
  if (general.tag !== undefined && general.tag !== specific.tag) return false;
  const available = expandedClasses(specific, coOccurring);
  for (const name of general.classes) if (!available.has(name)) return false;
  return true;
};

/**
 * Does selector `general` match every element `specific` matches? True when
 * `general`'s compounds are a subsequence of `specific`'s AND the two subjects
 * correspond. Sound because the descendant relation is transitive: extra
 * compounds in `specific`, and tighter combinators in it, only narrow it.
 */
export const selectorCovers = (general, specific, coOccurring) => {
  if (general.length === 0 || general.length > specific.length) return false;
  if (
    !compoundCovers(
      general[general.length - 1],
      specific[specific.length - 1],
      coOccurring,
    )
  )
    return false;
  let cursor = specific.length - 2;
  for (let index = general.length - 2; index >= 0; index -= 1) {
    let matched = false;
    while (cursor >= 0) {
      const candidate = specific[cursor];
      cursor -= 1;
      if (compoundCovers(general[index], candidate, coOccurring)) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
};

/**
 * Every heading subject in a set of sheets, with what it declares.
 *
 * ACCUMULATION IS PER EXACT SELECTOR, PER SHEET, and it deliberately folds
 * `@media` and `@container` overrides into the base. That means „declared only
 * inside a width query" reads here as „declared", which is a KNOWN blind spot,
 * accepted for one reason: the alternative reports correct code. A heading whose
 * size exists only under a query is a geometry question and the layout gate owns
 * geometry.
 *
 * Selectors carrying a pseudo-class or a pseudo-element are dropped entirely —
 * neither judged nor allowed to satisfy anything. `h2:hover { font-weight: 700 }`
 * describes a state, not a heading, and crediting it would let a hover rule stand
 * in for the resting one.
 */
export const collectHeadingSubjects = ({ stylesheets, headingClasses }) => {
  const subjects = new Map();
  for (const { name, css } of stylesheets)
    for (const rule of parseCssRules(css))
      for (const selector of splitSelectorList(rule.selectorList)) {
        if (selector.includes(":")) continue;
        const compounds = compoundsOf(selector);
        if (compounds.length === 0) continue;
        if (
          !isHeadingSubject(
            compounds[compounds.length - 1],
            name,
            headingClasses,
          )
        )
          continue;
        const key = `${name}|${selector}`;
        let subject = subjects.get(key);
        if (subject === undefined) {
          subject = {
            sheet: name,
            selector,
            compounds,
            declared: new Set(),
            hidden: false,
            lines: [],
          };
          subjects.set(key, subject);
        }
        for (const property of declaredProperties(rule.declarations))
          subject.declared.add(property);
        subject.hidden ||= isVisuallyHidden(rule.declarations);
        subject.lines.push(rule.line);
      }
  return [...subjects.values()].sort((left, right) =>
    `${left.sheet}|${left.selector}`.localeCompare(
      `${right.sheet}|${right.selector}`,
    ),
  );
};

/**
 * One decision about one heading subject. Takes what was read off the sheets, not
 * a DOM node, so the rule is testable without a browser.
 */
export const classifyHeadingSubject = (
  subject,
  { subjects, coOccurring, registry = KNOWN_HEADING_TYPOGRAPHY_DEBT },
) => {
  const missing = REQUIRED_HEADING_PROPERTIES.filter(
    (property) => !subject.declared.has(property),
  );
  if (missing.length === 0) return { verdict: "declared", missing };
  if (subject.hidden) return { verdict: "hidden", missing };
  const cover = subjects.find(
    (candidate) =>
      candidate !== subject &&
      candidate.sheet === subject.sheet &&
      candidate.selector !== subject.selector &&
      REQUIRED_HEADING_PROPERTIES.every((property) =>
        candidate.declared.has(property),
      ) &&
      selectorCovers(candidate.compounds, subject.compounds, coOccurring),
  );
  if (cover !== undefined)
    return { verdict: "refinement", missing, coveredBy: cover.selector };
  const entry = registry.find(
    (candidate) =>
      candidate.sheet === subject.sheet &&
      candidate.selector === subject.selector,
  );
  if (entry === undefined) return { verdict: "violation", missing };
  if (entry.missing.join(",") !== missing.join(","))
    // A different missing set is a DIFFERENT statement, not a variation of the
    // registered one — including „fewer properties missing than registered",
    // which is a debt half paid and an entry that has to be rewritten or removed.
    return {
      verdict: "violation",
      missing,
      registeredAs: entry.missing,
      owner: entry.owner,
    };
  return { verdict: "known", missing, owner: entry.owner };
};

/**
 * A registry that stopped describing anything is worse than no registry: it looks
 * like a ledger and is a list of sentences about rules that are gone. An entry
 * nothing matched is therefore an error — either the debt was paid and the entry
 * has to go, or the scan stopped seeing that sheet, and then its green means
 * nothing.
 */
export const unusedDebtEntries = (
  matched,
  registry = KNOWN_HEADING_TYPOGRAPHY_DEBT,
) =>
  registry.filter((entry) => !matched.has(`${entry.sheet}|${entry.selector}`));

// ── Reading the tree ─────────────────────────────────────────────────────────

const filesUnder = (root, extension) =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => path.join(entry.parentPath ?? root, entry.name))
    .sort();

const relative = (root, file) =>
  path.relative(root, file).split(path.sep).join("/");

/**
 * PIERWSZY NUMER LINII, KTÓRY WPIS REJESTRU CYTUJE WE WŁASNYM ARKUSZU.
 *
 * Po co to jest: do naprawy L1 (2026-08-14) test tego rejestru sprawdzał, że
 * wpis „niesie właściciela i arkusz", i NIC nie sprawdzało, czy numer w polu
 * `note` w cokolwiek trafia. Zmierzone w chwili, gdy powstała ta funkcja:
 * CZTERNAŚCIE z dwudziestu dwóch wpisów wskazywało obok własnej reguły, część
 * o tysiąc osiemset linii — i wszystkie były zielone. To nie był skutek lotu
 * L1; to był dług starszy od tej fali, który przechodził, bo nikt go nie
 * mierzył. Cytat z numerem linii bez asercji nad tym numerem jest komentarzem,
 * nie odsyłaczem.
 *
 * Rozpoznaje `<basename arkusza>:N` — tylko własny arkusz wpisu. Gołe `:N`
 * w tej samej nocie (idiom „wyżej w tym pliku") oddaje `citedContinuations`
 * niżej, i one też są dziś asertowane.
 */
export const firstCitedLine = (note, sheet) => {
  if (typeof note !== "string" || typeof sheet !== "string") return null;
  const base = sheet.split("/").pop();
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = new RegExp(`${escaped}:(\\d+)`).exec(note);
  return found === null ? null : Number(found[1]);
};

/**
 * GOŁE `:N` W NOCIE — cytaty bez przedrostka ścieżki, idiom „wyżej w tym
 * pliku".
 *
 * PO CO OSOBNA FUNKCJA, SKORO TEST JE DOTĄD TYLKO LICZYŁ. Bo liczenie ich było
 * dokładnie tą samą wadą, którą `firstCitedLine` zamknęło o jeden cytat
 * wcześniej, i wróciła po jednym locie. Zmierzone 2026-08-15 przy naprawie po
 * przeglądzie adwersarialnym lotu L8: rejestr miał CZTERY takie cytaty, DWA
 * z nich mijały swoją regułę — `.concept-help-dialog h2` cytowane jako `:9849`
 * przy regule w `:9903` (dług starszy niż ta fala) i `.center-state h1` jako
 * `:4222` przy regule w `:4245` (zgniłe wstawką lotu L8, a `:4222` celuje dziś
 * w `.capture-footer > span`, czyli w zdanie o czymś innym) — a test drukował
 * „4 unchecked continuation(s)" i był ZIELONY. Raport lotu przepisał wtedy
 * „22 wpisy, 0 błędnych" jako zdanie o rejestrze, którym ono nie było: było
 * zdaniem o zasięgu asercji.
 *
 * `(?<![\w./-])` odsiewa `styles.css:9941` i `ActivitySection.tsx:66` — tam
 * przed dwukropkiem stoi znak nazwy pliku — i zostawia samo `(:9903)`.
 */
export const citedContinuations = (note) =>
  typeof note !== "string"
    ? []
    : [...note.matchAll(/(?<![\w./-]):(\d+)/gu)].map((found) =>
        Number(found[1]),
      );

/**
 * KTÓRE SELEKTORY ZACZYNAJĄ SIĘ W KTÓREJ LINII ARKUSZA — cały arkusz, nie same
 * nagłówki.
 *
 * Kontynuacja wskazuje regułę, która NIE MUSI być podmiotem nagłówkowym:
 * rejestr cytuje tak blok `.document-canvas`, czyli pojemnik, a nie nagłówek.
 * `collectHeadingSubjects` takich reguł nie zna, więc asercja oparta wyłącznie
 * na nim odrzucałaby cytat prawdziwy.
 */
export const ruleSelectorsByLine = (css) => {
  const byLine = new Map();
  for (const rule of parseCssRules(css)) {
    const selectors = splitSelectorList(rule.selectorList);
    byLine.set(rule.line, [...(byLine.get(rule.line) ?? []), ...selectors]);
  }
  return byLine;
};

/** Everything the scan needs, read off a renderer source directory. */
export const readRendererSources = (root) => ({
  stylesheets: filesUnder(root, ".css").map((file) => ({
    name: relative(root, file),
    css: readFileSync(file, "utf8"),
  })),
  components: filesUnder(root, ".tsx").map((file) => ({
    name: relative(root, file),
    source: readFileSync(file, "utf8"),
  })),
});

/**
 * The whole scan over already-read sources. Split out from
 * `scanHeadingTypography` so the break-test can re-run the rule against a
 * shortened registry without reading two hundred files again for each entry.
 */
export const scanReadSources = (
  { stylesheets, components },
  registry = KNOWN_HEADING_TYPOGRAPHY_DEBT,
) => {
  const headingClasses = deriveHeadingClasses(components);
  const subjects = collectHeadingSubjects({ stylesheets, headingClasses });
  const results = subjects.map((subject) => ({
    subject,
    ...classifyHeadingSubject(subject, {
      subjects,
      coOccurring: headingClasses.coOccurring,
      registry,
    }),
  }));
  const matched = new Set(
    results
      .filter((result) => result.verdict === "known")
      .map((result) => `${result.subject.sheet}|${result.subject.selector}`),
  );
  return {
    stylesheets,
    components,
    headingClasses,
    subjects,
    results,
    violations: results.filter((result) => result.verdict === "violation"),
    unused: unusedDebtEntries(matched, registry),
  };
};

/** The whole scan over one renderer source directory. */
export const scanHeadingTypography = (
  root,
  registry = KNOWN_HEADING_TYPOGRAPHY_DEBT,
) => scanReadSources(readRendererSources(root), registry);

const describe = (result) =>
  [
    `${result.subject.sheet}:${result.subject.lines.join(",")}`,
    result.subject.selector,
    result.verdict,
    result.missing.length === 0 ? "-" : `missing ${result.missing.join("+")}`,
    result.coveredBy ?? result.owner ?? "-",
  ].join("\t");

if (process.argv[1]?.endsWith("heading-typography.mjs") === true) {
  const root = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "packages",
    "desktop-ui",
    "src",
  );
  const scan = scanHeadingTypography(root);
  for (const result of scan.results) console.log(describe(result));
  const counted = new Map();
  for (const result of scan.results)
    counted.set(result.verdict, (counted.get(result.verdict) ?? 0) + 1);
  console.log(
    `\n${scan.stylesheets.length} stylesheet(s), ${scan.components.length} component(s), ` +
      `${scan.subjects.length} heading subject(s): ` +
      [...counted]
        .sort()
        .map(([verdict, count]) => `${count} ${verdict}`)
        .join(", "),
  );
  console.log(`${scan.unused.length} unmatched registry entry/entries`);
}
