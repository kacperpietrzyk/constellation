/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  NarrativeGap,
  NarrativeText,
} from "../src/components/RecordNarrative.js";
import {
  readRecordNarrative,
  recordNarrativeGaps,
  type RecordNarrativeKind,
} from "../src/record-narrative.js";

const findPackageRoot = (): string => {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "src", "styles.css"))) {
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("Could not locate the desktop-ui package root.");
    }
    directory = parent;
  }
  return directory;
};

const root = findPackageRoot();
const read = (relative: string): string =>
  readFileSync(path.join(root, relative), "utf8");

const narrativeComponent = read("src/components/RecordNarrative.tsx");
const workSurface = read("src/WorkSurface.tsx");
const surfaces = read("src/Wave2Surfaces.tsx");
const projectRecordOverview = read("src/record/ProjectRecordOverview.tsx");
const realApp = read("src/RealApp.tsx");
const strategicSurface = read("src/StrategicDepthSurface.tsx");
const styles = read("src/styles.css");

// The narrative textareas are self-closing JSX elements, so the attribute list
// ends at the first "/>" after the name.
const selfClosingElement = (source: string, marker: string): string => {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Expected ${marker} in the source.`);
  const end = source.indexOf("/>", start);
  assert.notEqual(end, -1, `Expected ${marker} to be self-closing.`);
  return source.slice(start, end);
};

const kinds: readonly RecordNarrativeKind[] = ["area", "initiative", "project"];

describe("unwritten record narrative", () => {
  it("keeps written prose and names the gap when it was never written", () => {
    assert.deepEqual(
      readRecordNarrative("project", {
        text: "Tydzień zamknięty bez zaległości.",
        needsReview: false,
      }),
      { written: true, text: "Tydzień zamknięty bez zaległości." },
    );
    for (const kind of kinds) {
      const gap = readRecordNarrative(kind, { text: "", needsReview: true });
      assert.equal(gap.written, false);
      if (gap.written) throw new Error("Expected a gap.");
      assert.deepEqual(gap, { written: false, ...recordNarrativeGaps[kind] });
    }
  });

  it("treats a blank narrative as unwritten even when the projection says otherwise", () => {
    const gap = readRecordNarrative("area", {
      text: "   ",
      needsReview: false,
    });
    assert.equal(gap.written, false);
  });

  it("gives every kind its own marker, explanation and write action", () => {
    for (const kind of kinds) {
      const gap = recordNarrativeGaps[kind];
      assert.ok(gap.marker.length > 0);
      assert.ok(gap.detail.length >= 40);
      assert.ok(gap.action.length > 0);
      assert.ok(gap.field.length > 0);
    }
    assert.equal(
      new Set(kinds.map((kind) => recordNarrativeGaps[kind].detail)).size,
      3,
    );
  });

  it("renders the gap as a keyboard-operable, accessibly named affordance", () => {
    assert.equal(
      renderToStaticMarkup(
        createElement(NarrativeText, {
          kind: "project",
          text: "Tydzień zamknięty.",
          needsReview: false,
        }),
      ),
      "Tydzień zamknięty.",
    );
    assert.equal(
      renderToStaticMarkup(
        createElement(NarrativeText, {
          kind: "area",
          text: "",
          needsReview: true,
        }),
      ),
      '<span class="narrative-gap">Responsibility to write</span>',
    );
    const block = renderToStaticMarkup(
      createElement(NarrativeGap, { kind: "initiative", onWrite: () => {} }),
    );
    assert.match(block, /role="status"/);
    // Natywny przycisk: obsługa klawiaturą i nazwa dostępna z samej treści.
    assert.match(
      block,
      new RegExp(
        `<button type="button"[^>]*>${recordNarrativeGaps.initiative.action}</button>`,
      ),
    );
    assert.ok(block.includes(recordNarrativeGaps.initiative.detail));
    assert.match(narrativeComponent, /\{gap\.action\}/);
    assert.match(styles, /\.narrative-gap\b/);
    assert.match(styles, /\.narrative-gap-block\b/);
  });

  it("stops the Work forms from requiring a narrative before a record exists", () => {
    assert.doesNotMatch(
      selfClosingElement(workSurface, 'name="responsibility"'),
      /required/,
    );
    assert.doesNotMatch(
      selfClosingElement(workSurface, 'name="outcome"'),
      /required/,
    );
    assert.doesNotMatch(
      selfClosingElement(surfaces, 'id="project-outcome"'),
      /required/,
    );
    assert.match(workSurface, /if \(!title\) \{/);
    assert.doesNotMatch(workSurface, /!title \|\| !responsibility/);
    assert.doesNotMatch(workSurface, /!title \|\| !outcome/);
    assert.doesNotMatch(surfaces, /title\.trim\(\) && newOutcome\.trim\(\)/);
  });

  it("never renders a narrative as a bare text node without a needs-review branch", () => {
    // A JSX text node reading the narrative straight out of a projection is the
    // regression this guards: it turns an unwritten outcome into a blank line.
    const bareTextNode = (expression: string) =>
      new RegExp(`>\\s*\\{${expression.replaceAll(".", "\\.")}\\}\\s*<`);
    assert.doesNotMatch(workSurface, bareTextNode("area.responsibility"));
    assert.doesNotMatch(
      workSurface,
      bareTextNode("initiative.intendedOutcome"),
    );
    assert.doesNotMatch(workSurface, bareTextNode("project.intendedOutcome"));
    assert.doesNotMatch(surfaces, bareTextNode("project.intendedOutcome"));
    assert.doesNotMatch(
      strategicSurface,
      bareTextNode("project.intendedOutcome"),
    );
    // The positive half applies only where a narrative is actually DRAWN. A
    // screen that stops showing one — the Projects collection now shows health
    // and its reason where it used to show the outcome — must not be required
    // to keep rendering it; the guarantee is "wherever it is drawn, it goes
    // through NarrativeText", not "every file must draw it forever".
    const drawn = (
      [
        [workSurface, "area.responsibility"],
        [workSurface, "initiative.intendedOutcome"],
        [workSurface, "project.intendedOutcome"],
        [surfaces, "project.intendedOutcome"],
        [strategicSurface, "project.intendedOutcome"],
      ] as const
    ).filter(([source, expression]) => source.includes(`{${expression}}`));
    // Without this the list could empty out silently and the check would pass
    // over nothing at all.
    assert.ok(
      drawn.length >= 3,
      `only ${drawn.length} narratives are drawn anywhere — the guard has nothing left to guard`,
    );
    for (const [source, expression] of drawn) {
      assert.match(
        source,
        new RegExp(
          `text=\\{${expression.replaceAll(".", "\\.")}\\}\\s+needsReview=`,
        ),
        expression,
      );
    }
  });

  it("branches every remaining narrative block on needsReview", () => {
    // The Project full view that used to stand here is gone; the record screen
    // draws the outcome now, and it draws it as PARAGRAPHS with a reading
    // width rather than through `NarrativeText`, because a multi-paragraph
    // outcome is not a span. The guarantee is unchanged and asserted in this
    // file's own terms just below, on the file that now owns it.
    assert.match(
      projectRecordOverview,
      /const written =\s*!overview\.project\.needsReview && overview\.project\.intendedOutcome !== ""/,
    );
    assert.match(
      projectRecordOverview,
      /written \?[\s\S]{0,600}paragraphsOf\(overview\.project\.intendedOutcome\)/,
    );
    assert.match(
      realApp,
      /selectedProject\.needsReview \?[\s\S]{0,400}NarrativeGap[\s\S]{0,400}<blockquote>\{selectedProject\.intendedOutcome\}<\/blockquote>/,
    );
    assert.match(
      realApp,
      /!selectedWorkContextRecord\.needsReview \?[\s\S]{0,120}<blockquote>\{selectedWorkContextRecord\.detail\}<\/blockquote>/,
    );
  });

  it("routes every needs-review affordance to a place the narrative can be written", () => {
    // The record screen's unwritten branch offers a control, and the surface
    // that fills its slots wires that control to the outcome editor. Split
    // across two files because the screen is deliberately ignorant of what
    // writing means — and asserted from a CLICK, end to end, in
    // `record-screen.interaction.test.tsx`.
    assert.match(
      projectRecordOverview,
      /onWriteOutcome !== undefined && \([\s\S]{0,300}?Write the intended outcome/,
    );
    assert.match(surfaces, /onWriteOutcome: \(\) => setEditing\(true\)/);
    // The inspector cannot edit, so it opens the Project's own surface.
    assert.match(realApp, /NarrativeGap[\s\S]{0,200}projectContext\(/);
    // Areas and Initiatives had no edit surface at all until the two update
    // commands landed; the inspector is where the blank is filled.
    assert.match(realApp, /updateAreaResponsibility/);
    assert.match(realApp, /updateInitiativeOutcome/);
  });
});
