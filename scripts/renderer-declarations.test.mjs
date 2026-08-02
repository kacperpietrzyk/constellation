// Wyprowadzenie zbioru podmiotów ze ŹRÓDEŁ renderera. Czytanie plików nie
// wymaga przeglądarki, więc ta część chodzi w `npm run check` — razem z regułą,
// która mówi, kiedy samo wyprowadzenie jest dziurawe.
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyDeclarationCoverage,
  classifyDeclarationSet,
  declaredAttributeValues,
} from "./renderer-declarations.mjs";

const rendererRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "desktop-ui",
  "src",
);

test("THE HAND LIST THIS REPLACES: three record screens exist, not two", () => {
  // `verify-renderer-layout.mjs` niosło `["project", "task"]` obok kodu, który
  // rysuje TRZY ekrany rekordu. Trzeci — `opportunity` — jest w repozytorium od
  // fali C i ta lista nie mogła go objąć.
  const { values, dynamic } = declaredAttributeValues({
    root: rendererRoot,
    attribute: "data-record-kind",
  });
  assert.deepEqual(dynamic, []);
  assert.deepEqual(values, ["opportunity", "project", "task"]);
});

test("the height-bound registry is the same mechanism, read a second time", () => {
  const { values, dynamic } = declaredAttributeValues({
    root: rendererRoot,
    attribute: "data-height-bound",
  });
  assert.deepEqual(dynamic, []);
  assert.deepEqual(values, ["library"]);
});

test("AN ATTRIBUTE WRITTEN AS AN EXPRESSION IS A HOLE, and it is reported as one", () => {
  // To jest ograniczenie tego przyrządu powiedziane wprost: widzi literał,
  // nie widzi `data-record-kind={kind}`. Przemilczane byłoby fałszywym
  // spokojem — zbiór, który nie zna jednego ze swoich członków, mierzyłby
  // pokrycie względem nieznanego mianownika.
  const decision = classifyDeclarationSet({
    attribute: "data-record-kind",
    values: ["task"],
    dynamic: ["record/SomeScreen.tsx"],
  });
  assert.equal(decision.verdict, "not-derivable");
  assert.match(decision.reason, /unknown denominator/u);
});

test("AN EMPTY DERIVED SET IS AN INSTRUMENT FAILURE, not an easy pass", () => {
  const decision = classifyDeclarationSet({
    attribute: "data-height-bound",
    values: [],
    dynamic: [],
  });
  assert.equal(decision.verdict, "no-declarations");
  assert.match(decision.reason, /cannot fail is not an assertion/u);
});

test("a derived set with members is what the loop is allowed to run over", () => {
  assert.equal(
    classifyDeclarationSet({
      attribute: "data-record-kind",
      values: ["opportunity", "project", "task"],
      dynamic: [],
    }).verdict,
    "derived",
  );
});

test("NOT MEASURED IS NOT THE SAME SENTENCE AS FINE, and the coverage says which", () => {
  // Ekran szansy nie otwiera się w tym harnessie, bo fikstura nie niesie ani
  // jednej szansy. Bramka ma o tym MÓWIĆ przy każdym przebiegu, także zielonym.
  const decision = classifyDeclarationCoverage({
    declared: ["opportunity", "project", "task"],
    measured: ["project", "task"],
  });
  assert.equal(decision.verdict, "partial");
  assert.deepEqual(decision.unreachable, ["opportunity"]);
});

test("measuring none of the declared subjects is a failure, not a partial", () => {
  const decision = classifyDeclarationCoverage({
    declared: ["project"],
    measured: [],
  });
  assert.equal(decision.verdict, "measured-nothing");
});

test("complete coverage names nothing unreachable", () => {
  const decision = classifyDeclarationCoverage({
    declared: ["project", "task"],
    measured: ["task", "project"],
  });
  assert.equal(decision.verdict, "complete");
  assert.deepEqual(decision.unreachable, []);
});
