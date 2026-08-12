// Bramka układu potrzebuje przeglądarki i serwera dev, więc NIE CHODZI w CI.
// Sama reguła „wolno czy nie wolno" jest zwykłą funkcją i chodzi tutaj — bo
// inaczej jedyną rzeczą pilnującą jej byłby przebieg, którego CI nie odpala.
import assert from "node:assert/strict";
import test from "node:test";

import {
  COLLAPSED_TEXT_ENFORCED_SURFACES,
  KNOWN_COLLAPSED_TEXT,
  KNOWN_DESCENDANT_OVERFLOWS,
  KNOWN_OVERFLOW_TOLERANCE_PX,
  classifyCollapsedText,
  classifyDescendantOverflow,
  collapsedTextEnforced,
  matchesSurface,
  unusedCollapsedEntries,
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
    {
      surface: "tasks",
      signature: "span._chip",
      ceilings: { "text scaled to 200%": 56 },
      thread: "x",
    },
  ];
  const decision = classifyDescendantOverflow(
    measurement({ surface: "tasks", signature: "span._chip", overflowPx: 56 }),
    registry,
  );
  assert.equal(decision.verdict, "known");
  assert.equal(decision.thread, "x");
});

test("a ceiling belongs to ONE pass — a pass with no ceiling is a new overflow", () => {
  // Jeden sufit wzięty z najgorszego przelotu dawał darmowy wzrost na
  // pozostałych: `span._chipDashed` ma 56 px przy 200% i 32 px przy pełnym
  // oknie, więc wspólna liczba 56 przepuszczałaby 24 px pogorszenia dokładnie
  // przy szerokości, przy której ekranu się używa.
  const registry = [
    {
      surface: "tasks",
      signature: "span._chip",
      ceilings: { "text scaled to 200%": 56, "a full-size window": 32 },
      thread: "x",
    },
  ];
  const atFullSize = (overflowPx) =>
    classifyDescendantOverflow(
      measurement({
        surface: "tasks",
        signature: "span._chip",
        overflowPx,
        pass: "a full-size window",
      }),
      registry,
    ).verdict;
  assert.equal(atFullSize(32), "known");
  assert.equal(atFullSize(56), "violation");
  // I przelot, którego wpis w ogóle nie wymienia, nie jest zwolniony.
  assert.equal(
    classifyDescendantOverflow(
      measurement({
        surface: "tasks",
        signature: "span._chip",
        overflowPx: 5,
        pass: "a 320 px window",
      }),
      registry,
    ).verdict,
    "violation",
  );
});

test("a registry entry is a CEILING, not an exemption", () => {
  // To jest różnica między rejestrem długu a zwolnieniem: wpis, który
  // przepuszcza dowolną wartość, pozwala następnej fali pogorszyć ten sam
  // element po cichu.
  const registry = [
    {
      surface: "tasks",
      signature: "span._chip",
      ceilings: { "text scaled to 200%": 56 },
      thread: "x",
    },
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
  // I WŁAŚCICIEL JEDZIE Z REGRESJĄ, nie tylko liczba. Komunikat bramki jest
  // budowany z tych dwóch pól („worse than the N px recorded for it (owner:
  // …)"), a bez wątku regresja czyta się jak świeże przepełnienie bez adresu —
  // czyli jak coś, co znajdzie właściciela dopiero przez `git blame`. Bez tej
  // asercji „pada NAZYWAJĄC swój wątek" było twierdzeniem o prozie, a nie
  // o kodzie: break-test odróżnia wyłącznie czerwień od zieleni i nigdy nie
  // czyta tekstu.
  assert.equal(regressed.thread, "x");
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
    {
      surface: "tasks",
      signature: "span._gone",
      ceilings: { "text scaled to 200%": 10 },
      thread: "x",
    },
    {
      surface: "tasks",
      signature: "span._chip",
      ceilings: { "text scaled to 200%": 56 },
      thread: "x",
    },
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
    const ceilings = Object.entries(entry.ceilings);
    assert.ok(ceilings.length > 0, `no ceiling: ${entry.signature}`);
    for (const [pass, px] of ceilings) {
      assert.ok(pass.length > 0);
      assert.ok(Number.isInteger(px) && px > 0);
    }
    assert.ok(entry.thread.length > 20, `thread too vague: ${entry.thread}`);
  }
});

// ── ZAPADNIĘTA TREŚĆ ────────────────────────────────────────────────────────
// Druga reguła tego pliku pilnuje ŚLEPEJ PLAMKI pierwszej: przelotka
// przepełnień odrzuca każde pudełko węższe niż 1 px, więc komórka tekstowa
// znika z raportu dokładnie wtedy, gdy znika z ekranu. Powód powstania stoi
// przy `KNOWN_COLLAPSED_TEXT`.

const collapse = (overrides) => ({
  surface: "people",
  signature: "span._role",
  clientWidth: 0,
  textLength: 24,
  pass: "text scaled to 200%",
  ...overrides,
});

test("pudełko bez tekstu nie jest zapadnięciem, tylko pustym pudełkiem", () => {
  assert.equal(
    classifyCollapsedText(collapse({ textLength: 0 }), []).verdict,
    "empty",
  );
});

test("komórka, która ma czym rysować, nie jest findingiem", () => {
  assert.equal(
    classifyCollapsedText(collapse({ clientWidth: 8 }), []).verdict,
    "visible",
  );
});

test("zapadnięcie bez wpisu w rejestrze PADA", () => {
  assert.equal(classifyCollapsedText(collapse(), []).verdict, "violation");
});

test("wpis zwalnia TYLKO wymienione przeloty — na pozostałych zapadnięcie pada", () => {
  const registry = [
    {
      surface: "people",
      signature: "span._role",
      passes: ["text scaled to 200%"],
      thread: "skalowanie interfejsu — kolejność zwijania",
    },
  ];
  assert.equal(
    classifyCollapsedText(collapse(), registry).verdict,
    "known",
    "przelot wymieniony w rejestrze",
  );
  const elsewhere = classifyCollapsedText(
    collapse({ pass: "a full-size window" }),
    registry,
  );
  assert.equal(elsewhere.verdict, "violation");
  assert.ok(
    elsewhere.thread.length > 0,
    "wiadomość ma powiedzieć, KTO jest właścicielem wpisu, który tego przelotu nie obejmuje",
  );
});

test("wpis, którego nie dopasował żaden przelot, jest zgłaszany", () => {
  const registry = [
    { surface: "people", signature: "span._role", passes: ["x"], thread: "y" },
    { surface: "tasks", signature: "span._plan", passes: ["x"], thread: "y" },
  ];
  assert.deepEqual(
    unusedCollapsedEntries(new Set(["people|span._role"]), registry).map(
      (entry) => entry.signature,
    ),
    ["span._plan"],
  );
});

test("każdy wysłany wpis o zapadnięciu niesie właściciela i co najmniej jeden przelot", () => {
  assert.ok(KNOWN_COLLAPSED_TEXT.length > 0);
  for (const entry of KNOWN_COLLAPSED_TEXT) {
    assert.equal(typeof entry.surface, "string");
    assert.equal(typeof entry.signature, "string");
    assert.ok(
      Array.isArray(entry.passes) && entry.passes.length > 0,
      `no pass listed: ${entry.signature}`,
    );
    for (const pass of entry.passes) assert.ok(pass.length > 0);
    assert.ok(entry.thread.length > 20, `thread too vague: ${entry.thread}`);
  }
});

test("zakres egzekwowania jest ZAMKNIĘTY i obejmuje soczewki swojej powierzchni", () => {
  // Zakres wypisany, a nie „jakaś lista": rozszerzenie go jest decyzją, która ma
  // się zgłosić TUTAJ, a nie wjechać jako szósty element tablicy. Uzasadnienie
  // wąskości i wyjście z niej stoją przy `COLLAPSED_TEXT_ENFORCED_SURFACES`.
  assert.deepEqual(COLLAPSED_TEXT_ENFORCED_SURFACES, ["people"]);
  assert.equal(collapsedTextEnforced("people"), true);
  assert.equal(collapsedTextEnforced("people:person:overview"), true);
  assert.equal(collapsedTextEnforced("organizations"), false);
  // I nie łapie sąsiada o wspólnym prefiksie nazwy.
  assert.equal(collapsedTextEnforced("people-archive"), false);
});
