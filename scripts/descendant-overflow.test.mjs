// Bramka układu potrzebuje przeglądarki i serwera dev, więc NIE CHODZI w CI.
// Sama reguła „wolno czy nie wolno" jest zwykłą funkcją i chodzi tutaj — bo
// inaczej jedyną rzeczą pilnującą jej byłby przebieg, którego CI nie odpala.
import assert from "node:assert/strict";
import test from "node:test";

import {
  KNOWN_DESCENDANT_OVERFLOWS,
  KNOWN_OVERFLOW_TOLERANCE_PX,
  classifyDescendantOverflow,
  matchesSurface,
  unusedRegistryEntries,
} from "./descendant-overflow.mjs";

const measurement = (overrides) => ({
  surface: "library",
  signature: "div.notes-panel",
  overflowPx: 0,
  overflowX: "visible",
  declaresHorizontalScroll: false,
  pass: "text scaled to 200%",
  ...overrides,
});

test("an element that fits is not a finding", () => {
  assert.equal(
    classifyDescendantOverflow(measurement({ overflowPx: 0 }), []).verdict,
    "fits",
  );
});

test("content bleeding out of a visible box is a violation", () => {
  assert.equal(
    classifyDescendantOverflow(measurement({ overflowPx: 300 }), []).verdict,
    "violation",
  );
});

test("a clipping box contains its content and is not a layout defect", () => {
  // Kluczowe rozróżnienie całej reguły: `hidden`/`clip` NIE PUSZCZA treści na
  // zewnątrz. Długi tytuł ucięty wielokropkiem jest zamierzony, a gdyby to
  // padało, najtańszą naprawą byłoby skrócenie fikstury.
  for (const overflowX of ["hidden", "clip"]) {
    assert.equal(
      classifyDescendantOverflow(
        measurement({ overflowPx: 1994, overflowX }),
        [],
      ).verdict,
      "contained",
    );
  }
});

test("a scroller that declares itself is a contract, one that does not is a defect", () => {
  assert.equal(
    classifyDescendantOverflow(
      measurement({
        overflowPx: 1482,
        overflowX: "auto",
        declaresHorizontalScroll: true,
      }),
      [],
    ).verdict,
    "declared",
  );
  assert.equal(
    classifyDescendantOverflow(
      measurement({ overflowPx: 1482, overflowX: "auto" }),
      [],
    ).verdict,
    "violation",
  );
});

test("a registry entry accepts the overflow it was measured at", () => {
  const registry = [
    { surface: "tasks", signature: "span._chip", overflowPx: 56, thread: "x" },
  ];
  const decision = classifyDescendantOverflow(
    measurement({ surface: "tasks", signature: "span._chip", overflowPx: 56 }),
    registry,
  );
  assert.equal(decision.verdict, "known");
  assert.equal(decision.thread, "x");
});

test("a registry entry is a CEILING, not an exemption", () => {
  // To jest różnica między rejestrem długu a zwolnieniem: wpis, który
  // przepuszcza dowolną wartość, pozwala następnej fali pogorszyć ten sam
  // element po cichu.
  const registry = [
    { surface: "tasks", signature: "span._chip", overflowPx: 56, thread: "x" },
  ];
  const stillFine = classifyDescendantOverflow(
    measurement({
      surface: "tasks",
      signature: "span._chip",
      overflowPx: 56 + KNOWN_OVERFLOW_TOLERANCE_PX,
    }),
    registry,
  );
  assert.equal(stillFine.verdict, "known");
  const regressed = classifyDescendantOverflow(
    measurement({
      surface: "tasks",
      signature: "span._chip",
      overflowPx: 56 + KNOWN_OVERFLOW_TOLERANCE_PX + 1,
    }),
    registry,
  );
  assert.equal(regressed.verdict, "violation");
  assert.equal(regressed.regressedFrom, 56);
});

test("a registry entry covers the destination's lenses and records, not a bare label", () => {
  assert.equal(matchesSurface("tasks", "tasks"), true);
  assert.equal(matchesSurface("tasks:board", "tasks"), true);
  assert.equal(matchesSurface("tasks:task:overview", "tasks"), true);
  // I NIE łapie sąsiada o tym samym prefiksie w nazwie — inaczej jeden wpis
  // po cichu zwalniałby drugą powierzchnię.
  assert.equal(matchesSurface("tasks-archive", "tasks"), false);
  assert.equal(matchesSurface("library", "tasks"), false);
});

test("an entry no pass ever met is reported, because a dead register is worse than none", () => {
  const registry = [
    { surface: "tasks", signature: "span._gone", overflowPx: 10, thread: "x" },
    { surface: "tasks", signature: "span._chip", overflowPx: 56, thread: "x" },
  ];
  const unused = unusedRegistryEntries(new Set(["tasks|span._chip"]), registry);
  assert.deepEqual(
    unused.map((entry) => entry.signature),
    ["span._gone"],
  );
});

test("every shipped registry entry names an owning thread and a measured ceiling", () => {
  // Wpis bez właściciela jest zwolnieniem udającym dług: nikt nie wie, kto ma
  // go spłacić, więc nikt go nie spłaci.
  assert.ok(KNOWN_DESCENDANT_OVERFLOWS.length > 0);
  for (const entry of KNOWN_DESCENDANT_OVERFLOWS) {
    assert.equal(typeof entry.surface, "string");
    assert.equal(typeof entry.signature, "string");
    assert.ok(Number.isInteger(entry.overflowPx) && entry.overflowPx > 0);
    assert.ok(entry.thread.length > 20, `thread too vague: ${entry.thread}`);
  }
});
