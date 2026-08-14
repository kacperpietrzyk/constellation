import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  KNOWN_HEADING_TYPOGRAPHY_DEBT,
  OWNERS,
  REQUIRED_HEADING_PROPERTIES,
  classifyHeadingSubject,
  collectHeadingSubjects,
  compoundsOf,
  coOccurringClasses,
  declaredProperties,
  isVisuallyHidden,
  deriveHeadingClasses,
  firstCitedLine,
  parseCssRules,
  readRendererSources,
  scanReadSources,
  selectorCovers,
  splitSelectorList,
  stripCssComments,
  unusedDebtEntries,
} from "./heading-typography.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererSource = path.join(root, "packages", "desktop-ui", "src");

// Every number in this file was read off the tree on 2026-08-07 with
// `node scripts/heading-typography.mjs`. Floors sit below the measured value so
// that ordinary growth does not turn the gate red, and far above zero so that a
// collapse of the measurement cannot read as a pass.
const FEWEST_PLAUSIBLE_STYLESHEETS = 30; // 39 measured
const FEWEST_PLAUSIBLE_COMPONENTS = 60; // 90 measured
const FEWEST_PLAUSIBLE_SUBJECTS = 80; // 104 measured
const FEWEST_PLAUSIBLE_DECLARED = 50; // 68 measured
const FEWEST_PLAUSIBLE_HEADING_CLASS_SHEETS = 6; // 10 measured
// Podłoga rejestru długu: 22 wpisy zmierzone 2026-08-14. Nie jest przypięta do
// 22, bo wpisy WOLNO spłacać — jest przypięta do „nie zapadł się do zera",
// czyli do jedynego zdarzenia, które czyni tę asercję bezprzedmiotową.
const FEWEST_PLAUSIBLE_DEBT_ENTRIES = 12; // 22 measured

/** A subject the way `collectHeadingSubjects` builds one, for the rule tests. */
const subjectOf = (sheet, selector, declared, hidden = false) => ({
  sheet,
  selector,
  compounds: compoundsOf(selector),
  declared: new Set(declared),
  hidden,
  lines: [1],
});

const classify = (subject, subjects, registry = [], coOccurring = new Map()) =>
  classifyHeadingSubject(subject, { subjects, coOccurring, registry });

describe("heading typography — the rule", () => {
  it("keeps line numbers when it strips comments", () => {
    const css = "/* one\n   two */\n.a h2 {\n  color: red;\n}\n";
    const stripped = stripCssComments(css);
    assert.equal(stripped.split("\n").length, css.split("\n").length);
    assert.equal(stripped.includes("one"), false);
    assert.equal(parseCssRules(css)[0]?.line, 3);
  });

  it("does not read a rule that was commented out", () => {
    // The token lint next door reads sheets WITH their comments and has twice
    // been broken by prose shaped like code. Debt nobody can pay is the same
    // failure pointed the other way.
    const rules = parseCssRules("/* .ghost h2 { color: red; } */\n.a h2 {}\n");
    assert.equal(rules.length, 1);
    assert.equal(rules[0]?.selectorList, ".a h2");
  });

  it("reads rules out of a width query as ordinary rules", () => {
    const rules = parseCssRules(
      "@media (max-width: 50rem) {\n  .a h2 {\n    font-size: 1rem;\n  }\n}\n",
    );
    assert.equal(rules.length, 1);
    assert.equal(rules[0]?.selectorList, ".a h2");
  });

  it("accepts the `font` shorthand for both properties", () => {
    assert.deepEqual(
      [...declaredProperties("font: 600 1rem/1.2 sans-serif;")].sort(),
      ["font-size", "font-weight"],
    );
  });

  it("does not mistake a custom property or a transition for a declaration", () => {
    assert.deepEqual([...declaredProperties("--card-font-size: 1rem;")], []);
    assert.deepEqual([...declaredProperties("transition: font-size 1s;")], []);
  });

  it("splits a selector list without cutting inside parentheses", () => {
    assert.deepEqual(splitSelectorList(".a h2, .b:not(.c, .d) h3"), [
      ".a h2",
      ".b:not(.c, .d) h3",
    ]);
  });

  it("accumulates one subject across several rules with the same selector", () => {
    // `.meeting-markdown h4` is exactly this shape in the tree: the weight comes
    // from a grouped rule and the size from a rule of its own.
    const subjects = collectHeadingSubjects({
      stylesheets: [
        {
          name: "s.css",
          css: ".a h4,\n.a h5 {\n  font-weight: 600;\n}\n.a h4 {\n  font-size: 1rem;\n}\n",
        },
      ],
      headingClasses: { perSheet: new Map(), global: new Set() },
    });
    const h4 = subjects.find((subject) => subject.selector === ".a h4");
    const h5 = subjects.find((subject) => subject.selector === ".a h5");
    assert.equal(classify(h4, subjects).verdict, "declared");
    assert.equal(classify(h5, subjects).verdict, "violation");
    assert.deepEqual(classify(h5, subjects).missing, ["font-size"]);
  });

  it("neither judges nor credits a state selector", () => {
    const subjects = collectHeadingSubjects({
      stylesheets: [
        {
          name: "s.css",
          css: ".a h2:hover {\n  font-size: 1rem;\n  font-weight: 600;\n}\n.a h2::after {\n  font-size: 2rem;\n}\n.a h2 {\n  margin: 0;\n}\n",
        },
      ],
      headingClasses: { perSheet: new Map(), global: new Set() },
    });
    assert.deepEqual(
      subjects.map((subject) => subject.selector),
      [".a h2"],
    );
    assert.equal(classify(subjects[0], subjects).verdict, "violation");
  });

  it("treats a heading hidden by its own declarations as hidden, by declaration and not by name", () => {
    const subject = subjectOf("s.css", ".whatever h2", [], true);
    assert.equal(classify(subject, [subject]).verdict, "hidden");
  });

  it("excuses the screen-reader-only shape and not a decorative clip", () => {
    assert.equal(
      isVisuallyHidden("position: absolute; clip: rect(0, 0, 0, 0);"),
      true,
    );
    assert.equal(
      isVisuallyHidden("clip-path: polygon(0 0, 100% 0, 0 100%);"),
      false,
    );
    assert.equal(isVisuallyHidden("display: none;"), true);
  });

  it("lets a more general rule in the same sheet cover a refinement", () => {
    const general = subjectOf("s.css", ".dialog h2", [
      "font-size",
      "font-weight",
    ]);
    const refinement = subjectOf("s.css", ".dialog > header h2", []);
    const verdict = classify(refinement, [general, refinement]);
    assert.equal(verdict.verdict, "refinement");
    assert.equal(verdict.coveredBy, ".dialog h2");
  });

  it("does not let a half-finished general rule cover anything", () => {
    // This is the live `.concept-help-dialog` shape: the general rule declares a
    // size and no weight, so the refinement is NOT excused and both are debt.
    const general = subjectOf("s.css", ".dialog h2", ["font-size"]);
    const refinement = subjectOf("s.css", ".dialog > header h2", []);
    assert.equal(
      classify(refinement, [general, refinement]).verdict,
      "violation",
    );
  });

  it("does not let an unrelated rule cover a heading", () => {
    const other = subjectOf("s.css", ".sidebar h2", [
      "font-size",
      "font-weight",
    ]);
    const subject = subjectOf("s.css", ".dialog h2", []);
    assert.equal(classify(subject, [other, subject]).verdict, "violation");
    // Nor across sheets: a CSS module cannot style another module's element.
    const foreign = subjectOf("other.css", ".dialog h2", [
      "font-size",
      "font-weight",
    ]);
    assert.equal(classify(subject, [foreign, subject]).verdict, "violation");
  });

  it("does not let a DIFFERENT heading level cover a heading", () => {
    const general = subjectOf("s.css", ".dialog h3", [
      "font-size",
      "font-weight",
    ]);
    const subject = subjectOf("s.css", ".dialog h2", []);
    assert.equal(classify(subject, [general, subject]).verdict, "violation");
  });

  it("counts two classes as one element only when they ALWAYS travel together", () => {
    const together = coOccurringClasses([
      ["surface-header", "wave2-header"],
      ["surface-header", "wave2-header"],
    ]);
    assert.equal(
      selectorCovers(
        compoundsOf(".surface-header h1"),
        compoundsOf(".wave2-header h1"),
        together,
      ),
      true,
    );
    const apart = coOccurringClasses([
      ["surface-header", "wave2-header"],
      ["wave2-header"],
    ]);
    assert.equal(
      selectorCovers(
        compoundsOf(".surface-header h1"),
        compoundsOf(".wave2-header h1"),
        apart,
      ),
      false,
    );
  });

  it("reads a heading class out of the JSX that writes it, per sheet", () => {
    const derived = deriveHeadingClasses([
      {
        name: "library/NotesReading.tsx",
        source:
          'import styles from "./notes.module.css";\nconst a = <h3 className={styles.groupHead}>x</h3>;\n',
      },
      {
        name: "tasks/TaskListLayout.tsx",
        source:
          'import styles from "./task-list.module.css";\nconst a = <div className={styles.groupHead}>x</div>;\n',
      },
    ]);
    assert.deepEqual(
      [...(derived.perSheet.get("library/notes.module.css") ?? [])],
      ["groupHead"],
    );
    assert.equal(derived.perSheet.has("tasks/task-list.module.css"), false);
  });

  it("judges a class subject only in the sheet whose JSX puts it on a heading", () => {
    const headingClasses = {
      perSheet: new Map([["a.module.css", new Set(["groupHead"])]]),
      global: new Set(),
    };
    const stylesheets = [
      { name: "a.module.css", css: ".groupHead {\n  min-width: 0;\n}\n" },
      { name: "b.module.css", css: ".groupHead {\n  min-width: 0;\n}\n" },
    ];
    const subjects = collectHeadingSubjects({ stylesheets, headingClasses });
    assert.deepEqual(
      subjects.map((subject) => subject.sheet),
      ["a.module.css"],
    );
  });

  it("fails a registered rule whose missing set has changed, in either direction", () => {
    const registry = [
      {
        sheet: "s.css",
        selector: ".a h2",
        missing: ["font-size", "font-weight"],
        owner: "outside Phase 3",
        note: "n",
      },
    ];
    const registered = subjectOf("s.css", ".a h2", []);
    assert.equal(classify(registered, [registered], registry).verdict, "known");
    const halfPaid = subjectOf("s.css", ".a h2", ["font-size"]);
    const verdict = classify(halfPaid, [halfPaid], registry);
    assert.equal(verdict.verdict, "violation");
    assert.deepEqual(verdict.registeredAs, ["font-size", "font-weight"]);
  });

  it("calls an entry nothing matched an error", () => {
    const registry = [
      {
        sheet: "s.css",
        selector: ".gone h2",
        missing: ["font-weight"],
        owner: "outside Phase 3",
        note: "n",
      },
    ];
    assert.equal(unusedDebtEntries(new Set(), registry).length, 1);
    assert.equal(
      unusedDebtEntries(new Set(["s.css|.gone h2"]), registry).length,
      0,
    );
  });
});

describe("heading typography — the renderer", () => {
  assert.ok(
    existsSync(path.join(rendererSource, "styles.css")),
    `No renderer stylesheet was found under ${rendererSource}.`,
  );
  const sources = readRendererSources(rendererSource);
  const scan = scanReadSources(sources);

  it("reads every stylesheet and every component that ships, not a hand-written subset", () => {
    // An empty or shrunken collection is an instrument failure, not a result:
    // pointed at the wrong directory this scan passes without checking anything.
    assert.ok(
      scan.stylesheets.length >= FEWEST_PLAUSIBLE_STYLESHEETS,
      `Only ${scan.stylesheets.length} stylesheet(s) were discovered under ${rendererSource}.`,
    );
    assert.ok(
      scan.stylesheets.some((sheet) => sheet.name === "styles.css"),
      "styles.css was not among the discovered stylesheets; most heading rules would be invisible.",
    );
    assert.ok(
      scan.components.length >= FEWEST_PLAUSIBLE_COMPONENTS,
      `Only ${scan.components.length} component(s) were discovered; the class half of the subject would be empty.`,
    );
  });

  it("keeps the class half of the subject alive", () => {
    // Without this the `className=` syntax could change, the class subjects
    // would silently empty, and the scan would go green over `.groupHead`,
    // `.stateTitle` and `.title` — three of the registered defects.
    assert.ok(
      scan.headingClasses.perSheet.size >=
        FEWEST_PLAUSIBLE_HEADING_CLASS_SHEETS,
      `Only ${scan.headingClasses.perSheet.size} sheet(s) had a class the JSX puts on a heading.`,
    );
    assert.ok(
      scan.headingClasses.coOccurring.size > 0,
      "No co-occurring class names were read from JSX; every refinement would turn into a false alarm.",
    );
    assert.ok(
      scan.subjects.some(
        (subject) =>
          subject.selector === ".groupHead" &&
          subject.sheet.endsWith("notes.module.css"),
      ),
      "`.groupHead` in library/notes.module.css stopped being a heading subject; NotesReading.tsx puts it on an <h3>.",
    );
  });

  it("finds a heading population large enough to be the whole tree", () => {
    assert.ok(
      scan.subjects.length >= FEWEST_PLAUSIBLE_SUBJECTS,
      `Only ${scan.subjects.length} heading subject(s) were found, which is too few to be the whole renderer.`,
    );
    assert.ok(
      scan.results.filter((result) => result.verdict === "declared").length >=
        FEWEST_PLAUSIBLE_DECLARED,
      "Too few subjects came back `declared`; the property reader stopped seeing declarations.",
    );
  });

  it("has every heading rule declare a size and a weight", () => {
    const lines = scan.violations.map(
      (result) =>
        `${result.subject.sheet}:${result.subject.lines.join(",")} ` +
        `„${result.subject.selector}" is missing ${result.missing.join(" and ")}` +
        (result.registeredAs === undefined
          ? ""
          : ` (registered as missing ${result.registeredAs.join(" and ")}, owner ${result.owner})`),
    );
    assert.deepEqual(
      lines,
      [],
      "A heading with no author size takes the user-agent `2em`/`1.5em`/`1.17em` and with no " +
        "author weight takes `bold` — neither is on the v3 scale. Declare both on the rule, or " +
        "register the debt in KNOWN_HEADING_TYPOGRAPHY_DEBT with the item that closes it:\n" +
        lines.join("\n"),
    );
  });

  it("keeps the debt registry describing rules that exist", () => {
    assert.deepEqual(
      scan.unused.map((entry) => `${entry.sheet}|${entry.selector}`),
      [],
      "Either the debt was paid and the entry has to go in the same commit, or the scan stopped " +
        "seeing that sheet — and then its green says nothing.",
    );
  });

  it("gives every debt entry a named owner and an exact missing set", () => {
    for (const entry of KNOWN_HEADING_TYPOGRAPHY_DEBT) {
      const where = `${entry.sheet} „${entry.selector}"`;
      assert.ok(
        OWNERS.includes(entry.owner),
        `${where} names an owner outside the closed list: ${entry.owner}`,
      );
      assert.ok(
        typeof entry.note === "string" && entry.note.length > 0,
        `${where} carries no note saying where the rule is and what it draws.`,
      );
      assert.ok(
        entry.missing.length > 0 &&
          entry.missing.every((property) =>
            REQUIRED_HEADING_PROPERTIES.includes(property),
          ),
        `${where} registers a property this scan does not require: ${entry.missing.join(", ")}`,
      );
      assert.deepEqual(
        entry.missing,
        REQUIRED_HEADING_PROPERTIES.filter((property) =>
          entry.missing.includes(property),
        ),
        `${where} lists its missing properties out of order, so a matching subject would look like a mismatch.`,
      );
    }
  });

  it("makes the line number in every debt note resolve to the rule that entry registers", () => {
    // DLACZEGO TA ASERCJA ISTNIEJE. Do 2026-08-14 rejestr sprawdzał, że wpis
    // niesie właściciela, arkusz, notę i zbiór braków — i ANI JEDNA asercja nie
    // pytała, czy numer linii w nocie w cokolwiek trafia. Przy pisaniu tego
    // testu zmierzone: CZTERNAŚCIE z dwudziestu dwóch wpisów wskazywało obok
    // własnej reguły (`.concept-help-dialog > header h2` cytowało `:8051`, gdy
    // reguła stała w `:9864`), a rejestr był zielony. Numer bez asercji nad nim
    // nie jest odsyłaczem, tylko prozą, która wygląda jak odsyłacz.
    //
    // ZASIĘG JEST WYPOWIEDZIANY, A NIE UDAWANY. Sprawdzany jest PIERWSZY cytat
    // we WŁASNYM arkuszu wpisu — bo tylko dla niego `collectHeadingSubjects`
    // zna prawdziwe linie reguły. Dalsze gołe `:N` w tej samej nocie zostają
    // niesprawdzone i test mówi, ile ich jest, zamiast milczeć.
    const linesBySubject = new Map(
      scan.subjects.map((subject) => [
        `${subject.sheet}|${subject.selector}`,
        subject.lines,
      ]),
    );
    let checked = 0;
    let uncheckedContinuations = 0;
    for (const entry of KNOWN_HEADING_TYPOGRAPHY_DEBT) {
      const where = `${entry.sheet} „${entry.selector}"`;
      const lines = linesBySubject.get(`${entry.sheet}|${entry.selector}`);
      assert.ok(
        lines !== undefined && lines.length > 0,
        `${where} has no rule in the scanned tree at all, so its note cannot be checked — pay or delete the entry.`,
      );
      const cited = firstCitedLine(entry.note, entry.sheet);
      assert.ok(
        cited !== null,
        `${where} carries a note with no \`${entry.sheet.split("/").pop()}:N\` in it, so nothing says where the rule is.`,
      );
      assert.ok(
        lines.includes(cited),
        `${where} cites ${entry.sheet}:${cited}, but that selector's rule is at ${lines.join(", ")}. ` +
          "A line number nothing checks is how this registry carried fourteen wrong ones at once.",
      );
      checked += 1;
      uncheckedContinuations += (entry.note.match(/(?<![\w./-]):\d+/g) ?? [])
        .length;
    }
    // Zielone na ZERZE wykonanych sprawdzeń zdarzyło się w tym repozytorium.
    assert.equal(
      checked,
      KNOWN_HEADING_TYPOGRAPHY_DEBT.length,
      "The check skipped entries instead of judging them.",
    );
    assert.ok(
      checked >= FEWEST_PLAUSIBLE_DEBT_ENTRIES,
      `Only ${checked} debt entries were judged (${uncheckedContinuations} bare \`:N\` continuations sit outside this assertion's reach). ` +
        "A registry this short cannot be right while the rest of this file is green.",
    );
  });

  it("goes red on the tree the moment a debt entry is taken away", () => {
    // THE PROOF THAT THIS SCAN MEASURES THE TREE AND NOT ITS OWN REGISTRY. Run
    // against a registry with one entry removed, the same sheets have to produce
    // exactly that violation — otherwise the whole green above is a statement
    // about a list of strings.
    for (const removed of KNOWN_HEADING_TYPOGRAPHY_DEBT) {
      const withoutIt = KNOWN_HEADING_TYPOGRAPHY_DEBT.filter(
        (entry) => entry !== removed,
      );
      const reduced = scanReadSources(sources, withoutIt);
      assert.deepEqual(
        reduced.violations.map(
          (result) => `${result.subject.sheet}|${result.subject.selector}`,
        ),
        [`${removed.sheet}|${removed.selector}`],
        `Removing the entry for ${removed.sheet} „${removed.selector}" did not turn the scan red on it.`,
      );
    }
  });
});
