import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  censusNativeControls,
  compareToLedger,
  countNativeControls,
  NATIVE_CONTROL_LEDGER,
  NATIVE_CONTROL_TAGS,
} from "./native-control-census.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages/desktop-ui/src",
);

// SPRAWDZANY JEST NAJPIERW PRZYRZĄD, POTEM MIERZONA RZECZ. W tym repozytorium
// jest zapisany cały rodzaj wady „przyrząd kłamie, a bramka jest zielona" —
// więc przypadki graniczne skanera są tu sprawdzone WPROST, na małych napisach,
// a nie wywnioskowane z tego, że suma po drzewie wygląda sensownie.
//
// PIERWSZA WERSJA TEGO PLIKU DEKLAROWAŁA 11 PRZYPADKÓW GRANICZNYCH I OMIJAŁA
// TEN JEDEN, KTÓRY W TYM REPOZYTORIUM NAPRAWDĘ WYSTĘPUJE. Skaner był wtedy
// tekstowy i apostrof w treści JSX otwierał mu napis; jedna taka strefa
// połykała żywy `<select>` w `StrategicDepthSurface.tsx`. Test, który sprawdza
// jedenaście rzeczy i pomija dwunastą, tę żywą, daje fałszywy spokój dokładnie
// tam, gdzie miał go odbierać. Dlatego niżej stoi osobna grupa przypadków
// przepisanych Z TEGO DRZEWA, a nie wymyślonych.

test("the scanner counts elements and not their mentions", () => {
  const cases = [
    ["<select />", 1, "a bare element"],
    ["// <select> in a line comment\n", 0, "a line comment"],
    ["/* <select> in a block comment */", 0, "a block comment"],
    ['const s = "<select>";', 0, "a double-quoted string"],
    ["const s = '<select>';", 0, "a single-quoted string"],
    ["const s = `<select>`;", 0, "a template literal"],
    ['const s = "\\"<select>";', 0, "an escaped quote inside a string"],
    ['<input type="text" />', 1, "an element with a string attribute"],
    ["<inputs />", 0, "a component whose name merely starts with a tag name"],
    ["<Select />", 0, "a component whose name only differs by its case"],
    ["<Form.Input />", 0, "a qualified component name ending in a tag name"],
    ["<textarea\n  rows={3}\n/>", 1, "an element broken over lines"],
    [
      'const label = "pick one";\n<div>\n<select id="a" />\n{/* <select> */}\n<select id="b" />\n</div>',
      2,
      "two elements around one comment",
    ],
    ["<select></select>", 1, "an element counted once, not once per tag"],
  ];
  for (const [source, expected, what] of cases)
    assert.equal(
      countNativeControls(source).total,
      expected,
      `${what}: read „${source.replaceAll("\n", "⏎")}"`,
    );
});

// PRZYPADKI PRZEPISANE Z ŻYWEGO DRZEWA, NIE WYMYŚLONE. Każdy z pięciu niżej
// stał 2026-08-15 w `packages/desktop-ui/src` i każdy ROZBIJAŁ tekstową wersję
// tego skanera. Kontrola jest DODATNIA: w każdym z nich stoi prawdziwa
// kontrolka i test pyta, czy została POLICZONA — bo awarią, przed którą ten
// spis ma bronić, jest cisza, a nie hałas.
test("a control survives the shapes that used to swallow it", () => {
  const cases = [
    [
      '<small>No active projects to link in this client\'s Space.</small>\n<select id="organization-delivery-link" />',
      1,
      "an apostrophe in JSX text (StrategicDepthSurface.tsx:1233 — the zone that hid a live <select>)",
    ],
    [
      '<p>Saves this workspace\'s Areas and Projects.</p>\n<input id="after" />',
      1,
      "an apostrophe in JSX text with nothing closing it before EOF (SettingsSurface.tsx:1761)",
    ],
    [
      'const mention = /^@[\\w\']+/;\n<input id="after-regex" />',
      1,
      "a quote inside a regular-expression literal (RecordCommentsPanel.tsx:67)",
    ],
    [
      '<code>`</code>\n<textarea id="after-backtick" />',
      1,
      "a lone backtick in JSX text (MeetingMarkdown.tsx:292)",
    ],
    [
      "<span>it's</span><select id=\"between\" /><span>done's</span>",
      1,
      "a control standing between two apostrophes on one line",
    ],
  ];
  for (const [source, expected, what] of cases)
    assert.equal(
      countNativeControls(source).total,
      expected,
      `${what}: the scanner is blind to a control written this way`,
    );
});

// A ŻE TO NIE JEST TEZA O PRZESZŁOŚCI, TYLKO ŻYWA WŁASNOŚĆ DZISIEJSZEGO
// DRZEWA: wstawienie prawdziwej kontrolki w plik, w którym stała strefa
// połknięcia, MUSI podnieść licznik tego pliku o jeden.
test("a control added to a real file is seen by the census", () => {
  const file = path.join(root, "StrategicDepthSurface.tsx");
  const source = readFileSync(file, "utf8");
  const before = countNativeControls(source, file).total;
  const after = countNativeControls(
    `${source}\nconst Sneaked = () => <select id="sneaked" />;\n`,
    file,
  ).total;
  assert.equal(
    after,
    before + 1,
    "a <select> appended to the file with the widest swallow zone did not raise its count",
  );
});

test("a .ts file cannot carry JSX, and the scanner says so with a zero", () => {
  assert.equal(
    countNativeControls("const a = b < select > c;", "probe.ts").total,
    0,
    "a comparison in a .ts file was read as a JSX element",
  );
});

// PUSTY PRZELOT JEST AWARIĄ, NIE ZIELENIĄ. Ta asercja stoi PRZED porównaniem
// z ewidencją, bo spis nad zerem plików zgadza się z każdą ewidencją, w której
// nikt nic nie zmienił — i wróciłby zielony nad skasowanym katalogiem. Ten sam
// kształt, co „bramka zielona na ZERZE wykonanych złamań".
test("the census actually walked the renderer", () => {
  const census = censusNativeControls({ root });
  assert.ok(
    census.files >= 20,
    `the census found native controls in only ${census.files} file(s) — it measured almost nothing`,
  );
  assert.ok(
    census.total >= 100,
    `the census counted ${census.total} native control(s) — the renderer has hundreds, so this walked the wrong tree`,
  );
  for (const tag of NATIVE_CONTROL_TAGS)
    assert.ok(
      census.perTag[tag] > 0,
      `zero <${tag}> in the whole renderer — the pattern for this tag stopped matching`,
    );
});

// DŁUG WPISANY CO DO PLIKU. Powód, dla którego to jest równość, a nie sufit,
// oraz to, co robić z czerwienią, stoją przy samej ewidencji.
test("no file gained or lost a native control without saying so", () => {
  const census = censusNativeControls({ root });
  const drift = compareToLedger(census);
  assert.deepEqual(
    drift,
    [],
    `the native-control ledger and the renderer disagree:\n${drift.join("\n")}`,
  );
  assert.equal(
    census.total,
    Object.values(NATIVE_CONTROL_LEDGER).reduce((sum, n) => sum + n, 0),
    "the per-file rows agree one by one and the totals do not — the comparison above is not reading what the census counted",
  );
});

// KONTROLA DODATNIA PRZYRZĄDU. Ewidencja, która zgadza się z pomiarem, jest
// nieodróżnialna od porównania, które nic nie porównuje — dopóki nie pokaże
// się, że umie ZAUWAŻYĆ rozjazd. Trzy rodzaje, trzy różne zdania.
test("the comparison reddens on a change in either direction", () => {
  const census = censusNativeControls({ root });
  const [firstFile, firstCount] = Object.entries(census.perFile)[0];

  const added = compareToLedger(census, {
    ...NATIVE_CONTROL_LEDGER,
    [firstFile]: firstCount - 1,
  });
  assert.ok(
    added.some((line) => line.startsWith("NATIVE_CONTROL_ADDED")),
    "a file that gained a control did not redden",
  );

  const removed = compareToLedger(census, {
    ...NATIVE_CONTROL_LEDGER,
    [firstFile]: firstCount + 1,
  });
  assert.ok(
    removed.some((line) => line.startsWith("NATIVE_CONTROL_REMOVED")),
    "a file that lost a control did not redden, so the ledger can quietly grow back",
  );

  const unpinned = { ...NATIVE_CONTROL_LEDGER };
  delete unpinned[firstFile];
  assert.ok(
    compareToLedger(census, unpinned).some((line) =>
      line.startsWith("NATIVE_CONTROL_NEW_FILE"),
    ),
    "a file absent from the ledger did not redden, so new debt arrives silently",
  );

  assert.ok(
    compareToLedger(census, { ...NATIVE_CONTROL_LEDGER, "gone.tsx": 1 }).some(
      (line) => line.startsWith("NATIVE_CONTROL_GONE"),
    ),
    "a ledger row with no file behind it did not redden",
  );
});
