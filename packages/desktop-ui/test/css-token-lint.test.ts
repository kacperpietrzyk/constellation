/// <reference types="node" />

import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const styleRoot = path.join(root, "src");

// 2026-07-28: lista plików była wpisana z palca i wymieniała `tokens.css`
// oraz `styles.css`, czyli DWA z DZIESIĘCIU arkuszy realnie wysyłanych
// z aplikacją. Siedem powierzchniowych (access, activity, organization-context,
// work-board/calendar/density/field-visibility) nie było sprawdzanych w ogóle,
// a niezdefiniowany `var(--…)` po cichu rozwiązuje się do transparent/inherit
// i odstyluje prawdziwe UI. Teraz lista bierze się z dysku, więc nie da się
// dołożyć arkusza i zapomnieć go dopisać — łącznie z `*.module.css`, które
// wchodzą razem z nowo pisanymi komponentami.
const stylesheets = readdirSync(styleRoot, {
  recursive: true,
  withFileTypes: true,
})
  .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
  .map((entry) => {
    const absolute = path.join(entry.parentPath ?? styleRoot, entry.name);
    return {
      name: path.relative(root, absolute),
      css: readFileSync(absolute, "utf8"),
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name));

const tokenSource =
  stylesheets.find((sheet) => sheet.name.endsWith("tokens.css"))?.css ?? "";

const definitions = new Set<string>();
const references = new Set<string>();
for (const { css } of stylesheets) {
  for (const match of css.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)) {
    definitions.add(match[1] ?? "");
  }
  for (const match of css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
    references.add(match[1] ?? "");
  }
}

// Druga strona kontraktu, którą stara lista plików przegapiała razem
// z arkuszami powierzchni: część własności ustawia RENDERER w locie, a nie CSS.
// `work-field-visibility.css` czyta `var(--work-list-field-count)`, którego nie
// definiuje żaden arkusz — dostarcza go `WorkSurface.tsx` przez `style={{…}}`,
// bo liczba kolumn zależy od tego, ile pól użytkownik zostawił widocznych.
// Bez tego kroku rozszerzenie lintu kazałoby „naprawić" poprawny kod, dopisując
// martwą wartość do `tokens.css` — czyli zamienić prawdziwy sygnał na fałszywy.
const runtimeDefinitions = new Set<string>();
for (const entry of readdirSync(styleRoot, {
  recursive: true,
  withFileTypes: true,
})) {
  if (!entry.isFile()) continue;
  if (!entry.name.endsWith(".tsx") && !entry.name.endsWith(".ts")) continue;
  const source = readFileSync(
    path.join(entry.parentPath ?? styleRoot, entry.name),
    "utf8",
  );
  for (const match of source.matchAll(/["'](--[a-zA-Z0-9-]+)["']\s*:/g)) {
    runtimeDefinitions.add(match[1] ?? "");
  }
  for (const match of source.matchAll(
    /setProperty\(\s*["'](--[a-zA-Z0-9-]+)["']/g,
  )) {
    runtimeDefinitions.add(match[1] ?? "");
  }
}

describe("css token lint", () => {
  it("every var(--…) reference resolves to a defined custom property", () => {
    const undefinedTokens = [...references]
      .filter(
        (token) => !definitions.has(token) && !runtimeDefinitions.has(token),
      )
      .sort();
    assert.deepEqual(
      undefinedTokens,
      [],
      `Undefined design tokens referenced in CSS: ${undefinedTokens.join(", ")}. ` +
        "An undefined var(--…) silently resolves to transparent/inherit and " +
        "unstyles real UI. Define the token in tokens.css, set it from the " +
        "component that owns the value, or fix the name.",
    );
  });

  it("does not lose the runtime half of the contract", () => {
    // Ten zbiór jest po to, żeby lint nie kazał naprawiać poprawnego kodu.
    // Gdyby wzorzec przestał cokolwiek łapać (zmiana składni, przeniesienie
    // plików), asercja wyżej zaczęłaby zgłaszać własności ustawiane z JS-a jako
    // niezdefiniowane — a najkrótszą „naprawą" byłoby dopisanie ich do
    // `tokens.css`, czyli zepsucie działającego zachowania.
    assert.ok(
      runtimeDefinitions.size > 0,
      "No custom properties were found being set from components; the " +
        "runtime half of the token contract stopped being parsed.",
    );
  });

  it("reads every stylesheet that ships, not a hand-written subset", () => {
    // Pusty albo skurczony wynik zbierania plików to awaria pomiaru, nie wynik:
    // przy złym katalogu lint przeszedłby na zielono, nie sprawdzając niczego.
    assert.ok(
      stylesheets.length > 0,
      `No stylesheets were discovered under ${styleRoot}; the lint would pass vacuously.`,
    );
    assert.ok(
      stylesheets.some((sheet) => sheet.name.endsWith("tokens.css")),
      `tokens.css was not among the discovered stylesheets (${stylesheets
        .map((sheet) => sheet.name)
        .join(
          ", ",
        )}); definitions would be missing and every reference would look undefined.`,
    );
    assert.ok(
      definitions.size > 100,
      "Token definitions were not parsed; the lint would pass vacuously.",
    );
  });

  it("uses the dynamic viewport for height-bound desktop surfaces", () => {
    const legacyViewportReferences = stylesheets.flatMap(({ name, css }) =>
      [...css.matchAll(/100vh/g)].map((match) => ({
        source: name,
        offset: match.index,
      })),
    );
    assert.deepEqual(
      legacyViewportReferences,
      [],
      "Height-bound overlays and editors must use 100dvh so changing browser " +
        "chrome cannot hide their footer or final action.",
    );
  });

  it("keeps light-theme semantic status text on the AA contrast mapping", () => {
    // Zakotwiczone w SUMIE bloków motywu jasnego, nie w pierwszym z nich:
    // wcześniej reorganizacja `tokens.css` albo rozbicie motywu na dwa bloki
    // wywalało tę asercję przy IDENTYCZNYCH wartościach.
    const lightThemeBlocks = [
      ...tokenSource.matchAll(/\[data-theme="light"\][^{]*\{([\s\S]*?)\n\}/g),
    ].map((match) => match[1] ?? "");
    assert.ok(
      lightThemeBlocks.length > 0,
      "The light-theme token mapping must remain present.",
    );
    const lightTheme = lightThemeBlocks.join("\n");

    const contrastSafeStatuses = [
      ["success", "0.1", "150"],
      ["warning", "0.1", "78"],
      ["error", "0.14", "25"],
      ["info", "0.075", "245"],
    ] as const;

    for (const [status, chroma, hue] of contrastSafeStatuses) {
      assert.match(
        lightTheme,
        new RegExp(
          `--status-${status}:\\s*oklch\\(52%\\s+${chroma}\\s+${hue}\\)`,
        ),
        `Light ${status} text must retain the measured 52% OKLCH mapping.`,
      );
    }
  });

  it("lets a compact density change spacing without hiding content or shrinking type", () => {
    // Wzięte z `interaction-recovery-contract.test.ts:765`, gdzie ta reguła była
    // przywiązana do jednej powierzchni i do jej nazwy klasy. To jest lint CSS-a,
    // nie asercja o ekranie Pracy: dotyczy KAŻDEJ reguły trybu zwartego, także
    // tych, które dopiero powstaną. Tamta kopia jeszcze stoi i zniknie razem
    // z sekcją, która ją trzyma — do tego czasu obie pilnują tego samego.
    for (const { name, css } of stylesheets) {
      for (const rule of css.matchAll(
        /([^{}]*\[data-density="compact"\][^{]*)\{([^}]*)\}/g,
      )) {
        assert.doesNotMatch(
          rule[2] ?? "",
          /(^|[\s;])(display|visibility|font-size)\s*:/,
          `${name}: compact density may change spacing but must not hide content or shrink type ` +
            `(offending rule: ${(rule[1] ?? "").trim()})`,
        );
      }
    }
  });
});
