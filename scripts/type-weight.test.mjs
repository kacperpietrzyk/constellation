import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  KNOWN_OFF_SCALE_WEIGHTS,
  classifyTypeWeight,
  declaredWeightScale,
  unusedWeightEntries,
  weightKey,
} from "./type-weight.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS = path.join(root, "packages", "desktop-ui", "src", "tokens.css");

describe("declared weight scale", () => {
  it("reads the four steps the shipped tokens.css declares", () => {
    const scale = declaredWeightScale(readFileSync(TOKENS, "utf8"));
    assert.deepEqual(
      scale.map((step) => step.name),
      [
        "--weight-regular",
        "--weight-medium",
        "--weight-semibold",
        "--weight-bold",
      ],
      "The membership assertion of the layout gate reads its allowed set from these four names.",
    );
    assert.deepEqual(
      scale.map((step) => step.value),
      ["400", "500", "600", "700"],
      "The prototype uses exactly 400/500/600/700 across v3/ and nothing else.",
    );
  });

  // TEN TEST JEST CAŁYM ARGUMENTEM ZA ZŁAMANIEM B1 I ZA CIĘCIEM KOMENTARZY.
  // `tokens.css` wypisuje nazwy czterech stopni PROZĄ, w komentarzu nad
  // deklaracjami. Parser czytający surowy tekst oddałby po skasowaniu samych
  // deklaracji pełną skalę nad arkuszem, który jej nie ma — i bramka
  // porównywałaby wagi ze zbiorem, którego nie istnieje, na zielono.
  it("returns nothing when the declarations go but the prose about them stays", () => {
    const withoutDeclarations = readFileSync(TOKENS, "utf8").replace(
      `  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;`,
      "",
    );
    assert.ok(
      withoutDeclarations.includes("--weight-semibold"),
      "The break edit has to leave the prose behind, otherwise this test proves nothing about comments.",
    );
    assert.deepEqual(
      declaredWeightScale(withoutDeclarations),
      [],
      "A comment naming a token must not define it; that is how the deleted scale would read as present.",
    );
  });

  it("keeps the declaration under a multi-line comment visible to the anchor", () => {
    // Komentarz zastępowany jest tyloma znakami nowej linii, ile miał —
    // inaczej `/* … */` rozpięty na kilku wierszach skleiłby deklarację
    // z linią wyżej i `^` przestałoby ją widzieć. To jest dokładnie kształt
    // wstawki w `tokens.css`: dwudziestowierszowy komentarz nad czterema
    // deklaracjami.
    assert.deepEqual(
      declaredWeightScale(
        `:root {\n  /* jeden\n dwa\n trzy */\n  --weight-regular: 400;\n}`,
      ),
      [{ name: "--weight-regular", value: "400" }],
    );
  });
});

describe("classifying a drawn weight", () => {
  const allowed = new Set(["400", "500", "600", "700"]);

  it("says nothing about a weight that is a declared step", () => {
    assert.deepEqual(
      classifyTypeWeight({ signature: "h2._title", weight: 600, allowed }, []),
      { verdict: "in-scale" },
    );
  });

  it("is an instrument failure, not a verdict, when there is no scale", () => {
    assert.deepEqual(
      classifyTypeWeight(
        { signature: "h2._title", weight: 600, allowed: new Set() },
        [],
      ),
      { verdict: "no-scale" },
      "An empty set must not read as „nothing is allowed” — it reads as „there is nothing to be a member of”.",
    );
  });

  it("fails an off-scale weight nobody registered", () => {
    assert.equal(
      classifyTypeWeight({ signature: "p.eyebrow", weight: 650, allowed }, [])
        .verdict,
      "violation",
    );
  });

  it("accepts an off-scale weight that is registered debt", () => {
    const registry = [
      {
        signature: "p.eyebrow",
        weight: 650,
        thread: "skala wag",
        owner: "L5",
      },
    ];
    assert.equal(
      classifyTypeWeight(
        { signature: "p.eyebrow", weight: 650, allowed },
        registry,
      ).verdict,
      "known-debt",
    );
  });

  // WPIS NIE ZWALNIA Z POMIARU. Rejestr wiąże sygnaturę Z KONKRETNĄ liczbą,
  // więc przesunięcie tej samej reguły na inną wartość spoza skali pada jak
  // każdy nowy rozjazd — bez tego dałoby się dopisać dziesiątą obcą wagę
  // pod istniejącym wpisem i przejść cicho.
  it("does not let a registered signature move to another off-scale value", () => {
    const registry = [
      { signature: "p.eyebrow", weight: 650, thread: "skala wag", owner: "L5" },
    ];
    assert.equal(
      classifyTypeWeight(
        { signature: "p.eyebrow", weight: 655, allowed },
        registry,
      ).verdict,
      "violation",
    );
  });

  it("compares the drawn weight as a string, the way getComputedStyle returns it", () => {
    assert.equal(
      classifyTypeWeight({ signature: "h2._title", weight: "600", allowed }, [])
        .verdict,
      "in-scale",
    );
  });
});

describe("the registry polices itself", () => {
  it("reports an entry no pass ever met", () => {
    const registry = [
      { signature: "p.eyebrow", weight: 650, thread: "skala wag", owner: "L5" },
      { signature: "div._chip", weight: 590, thread: "skala wag", owner: "L5" },
    ];
    assert.deepEqual(
      unusedWeightEntries(new Set(["p.eyebrow|650"]), registry).map(
        (entry) => entry.signature,
      ),
      ["div._chip"],
    );
  });

  it("keys on the sheet rule, not on the screen it was seen from", () => {
    // Waga jest własnością REGUŁY ARKUSZA, nie geometrii ekranu: `.eyebrow`
    // niesie 650 wszędzie, gdzie się narysuje. Rejestr z wymiarem powierzchni
    // byłby rejestrem TRASY PRZELOTU i psułby się przy każdej zmianie fikstury.
    assert.equal(
      weightKey({ signature: "p.eyebrow", weight: 650 }),
      "p.eyebrow|650",
    );
  });

  it("carries an owner and a sheet on every entry it holds", () => {
    for (const entry of KNOWN_OFF_SCALE_WEIGHTS) {
      assert.ok(
        typeof entry.signature === "string" && entry.signature.length > 0,
        `entry ${JSON.stringify(entry)} has no signature`,
      );
      assert.ok(
        Number.isFinite(Number(entry.weight)),
        `entry ${entry.signature} has no numeric weight`,
      );
      assert.ok(
        typeof entry.sheet === "string" && entry.sheet.includes(":"),
        `entry ${entry.signature} names no sheet and line`,
      );
      assert.ok(
        typeof entry.owner === "string" && entry.owner.length > 0,
        `entry ${entry.signature} names no owner, so nobody has taken this debt`,
      );
      assert.ok(
        typeof entry.thread === "string" && entry.thread.length > 0,
        `entry ${entry.signature} names no thread`,
      );
    }
  });

  it("holds no two entries for the same rule and value", () => {
    const keys = KNOWN_OFF_SCALE_WEIGHTS.map(weightKey);
    assert.equal(
      new Set(keys).size,
      keys.length,
      "A duplicated key makes one of the two entries permanently unused.",
    );
  });
});
