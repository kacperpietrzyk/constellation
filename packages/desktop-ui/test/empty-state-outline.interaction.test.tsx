import { strict as assert } from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, test } from "vitest";

import { desktopSurfaceRegistry } from "@constellation/desktop-preload/surface-registry";

import { shellQueries } from "./shell-fixture.js";

// CZY KONSPEKT NAGŁÓWKÓW TRZYMA SIĘ TAM, GDZIE EKRAN NIE MA DANYCH.
//
// PO CO DRUGIE MIEJSCE, SKORO OŚ KONSPEKTU JUŻ ISTNIEJE — i to jest cała treść
// tego pliku, bo bez tej odpowiedzi jest on tylko kopią czegoś, co już chodzi.
// Reguła stoi w `scripts/heading-outline.mjs` i jest UZBROJONA; ten plik jej NIE
// PRZEPISUJE, tylko ją importuje. Różnica jest w tym, KOGO reguła dostaje do
// osądzenia:
//
//   • bramka układu (`scripts/verify-renderer-layout.mjs`) zbiera konspekt
//     z prawdziwej przeglądarki, ale na ZASIANEJ fiksturze harnessu i przy
//     szerokości, którą akurat mierzy. Każdy ekran, który tam odwiedza, ma
//     dane;
//   • ten plik montuje TĘ SAMĄ POWŁOKĘ na fiksturze `shellQueries`, czyli na
//     obszarze roboczym BEZ danych, i chodzi po wszystkich celach nawigacji.
//
// I TO NIE JEST WYMYŚLONA RÓŻNICA, tylko ZMIERZONA — dokładnie ta luka wypuściła
// wadę na trzy systemy naraz. Lot D3 rozdzielił Bibliotekę na `notes`, `sources`
// i `captures`. Historia wrzutek na PUSTYM obszarze rysuje `InlineState`, a ten
// prymityw miał domyślny szczebel `h3`, więc pod `h1` pasma otwierała się dziura
// h1→h3. Bramka układu przeszła na zielono („0 skipping a rung", siedemnaście
// przystanków, `captures` wśród nich, `band h1 / content h2`), bo w jej
// fiksturze rejestr wrzutek MA wiersze i rysuje `h2 Kept originals`. Znalazł to
// dopiero paczkowany smoke — dwadzieścia minut na trzech systemach, po fakcie,
// z CI (`PACKAGED_ALPHA_NARROW_SURFACE_INVALID`, `headingJumps: [3]`).
//
// NAGŁÓWEK TAMTEGO PLIKU ZNAŁ TĘ LUKĘ I MIMO TO JEJ NIE ZAMKNĄŁ, więc warto
// nazwać, czemu deklaracja nie wystarczyła: był tam SPIS czterech ekranów
// („tasks, projects, pipeline, people"), których stanów pustki przelotka nie
// odwiedza — ręczna lista obok otwartego zbioru powierzchni. `captures` powstał
// po tym, jak lista została napisana, i nikt jej nie dopisał. Ten plik nie ma
// listy: chodzi po `desktopSurfaceRegistry`, więc każdy NASTĘPNY cel wchodzi
// w zakres w dniu, w którym powstaje.
//
// CZEGO TEN PLIK NIE UMIE, powiedziane wprost, żeby nie zastąpił tamtej bramki:
// happy-dom nie liczy układu, więc widzi nagłówek narysowany „na zero pikseli"
// i nagłówek schowany regułą CSS tak samo jak każdy inny. Ranga nagłówka
// żadnego piksela nie potrzebuje i dlatego ten pomiar jest tu legalny — ale
// każde pytanie o GEOMETRIĘ zostaje w bramce układu.
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

interface OutlineHeading {
  readonly level: number;
  readonly signature: string;
  readonly sample: string;
  readonly opening: boolean;
}

interface OutlineScreen {
  readonly id: string;
  readonly band: readonly OutlineHeading[];
  readonly content: readonly OutlineHeading[];
}

interface OutlineVerdict {
  readonly failures: readonly string[];
  readonly judged: readonly {
    readonly id: string;
    readonly state: string;
    readonly band: readonly OutlineHeading[];
    readonly content: readonly OutlineHeading[];
  }[];
}

// REGUŁA JEST IMPORTOWANA, NIE PRZEPISANA, i sposób importu jest wymuszony:
// `rootDir` tej paczki to jej własny katalog, więc statyczny import pliku spoza
// niego nie przechodzi `tsc -b`. Specyfikator liczony w czasie wykonania omija
// kompilator, a nie omija runtime'u — czyli plik naprawdę jest tym jednym,
// uzbrojonym plikiem reguły. Przepisanie jej tutaj byłoby drugą kopią kształtu
// obok zamkniętego słownika, czyli klasą defektu, którą to repozytorium ma już
// nazwaną.
const loadRule = async (): Promise<
  (screens: readonly OutlineScreen[]) => OutlineVerdict
> => {
  const specifier = path.join(root, "scripts", "heading-outline.mjs");
  // SPECYFIKATOR LICZONY, NIE WPISANY, i to jest wymuszone: `rootDir` tej paczki
  // to jej własny katalog, więc statyczny import pliku spoza niego nie
  // przechodzi `tsc -b`. Vite wpuszcza `scripts` imiennie — patrz `server.fs`
  // w `vitest.config.ts`.
  const module = (await import(/* @vite-ignore */ specifier)) as {
    judgeHeadingOutline: (screens: readonly OutlineScreen[]) => OutlineVerdict;
  };
  return module.judgeHeadingOutline;
};

let container: HTMLDivElement;
let reactRoot: Root | undefined;

beforeAll(async () => {
  // Ten sam powód, co w `shell-navigation.interaction.test.tsx`: granica
  // `lazy()` Ustawień ma duży graf i jej ostatni ping Suspense potrafi wypaść
  // po zamknięciu środowiska.
  await import("../src/SettingsSurface.js");
});

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  // Strażnik, bo `reactRoot` powstaje dopiero w `mountShell`: przypadek, który
  // padnie PRZED montażem, wychodziłby stąd drugim błędem („cannot read
  // 'unmount' of undefined") i przykrywał ten pierwszy, prawdziwy.
  const mounted = reactRoot;
  reactRoot = undefined;
  if (mounted !== undefined)
    act(() => {
      mounted.unmount();
    });
  container.remove();
});

const mountShell = async (): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries: shellQueries });
  const initialSnapshot = await loadDesktopSnapshot(client);

  const mounted = createRoot(container);
  reactRoot = mounted;
  await act(async () => {
    mounted.render(createElement(RealApp, { client, initialSnapshot }));
  });
};

/** Nagłówek w kształcie, którego oczekuje reguła. */
const headingOf = (node: Element): OutlineHeading => ({
  level: Number(node.tagName.slice(1)),
  signature:
    node.tagName.toLowerCase() +
    (node.id === "" ? "" : `#${node.id}`) +
    (node.className === ""
      ? ""
      : `.${String(node.className).trim().split(/\s+/u).join(".")}`),
  sample: (node.textContent ?? "").trim().slice(0, 32),
  // OTWARCIA NIE MA I TO JEST ŚWIADOME. Flagę „to jest otwarcie ekranu" liczy
  // oś czwarta z ROZMIARU nagłówka (`--text-2xl` rozwiązane w tej samej
  // stronie), a happy-dom rozmiaru nie zna. Bez tej flagi reguła osądza sam
  // szczebel — czyli dokładnie to, co ten plik ma tu sprawdzać — i nie udaje,
  // że zna drugą połowę.
  opening: false,
});

/** Konspekt jednego ekranu: pasmo osobno od treści, tak jak w bramce układu. */
const outlineOfWorkPlane = (): {
  readonly band: OutlineHeading[];
  readonly content: OutlineHeading[];
} => {
  const work = container.querySelector('[role="tabpanel"]');
  const headings = [
    ...(work?.querySelectorAll("h1, h2, h3, h4, h5, h6") ?? []),
  ];
  // PASMEM JEST `<header>` TYTUŁU, rozpoznawany tak samo jak tam: przez
  // `#surface-title`, a nie przez nazwę klasy.
  const band = work?.querySelector("#surface-title")?.closest("header") ?? null;
  return {
    band: headings
      .filter((node) => band !== null && band.contains(node))
      .map(headingOf),
    content: headings
      .filter((node) => band === null || !band.contains(node))
      .map(headingOf),
  };
};

test("no destination's EMPTY state skips a heading rung", async () => {
  const judgeHeadingOutline = await loadRule();
  await mountShell();

  // WYPROWADZONE Z REJESTRU, NIE Z LISTY: ręczna lista obok otwartego zbioru
  // powierzchni jest tu dokładnie tą wadą, która wpuściła `captures`.
  const destinations = desktopSurfaceRegistry
    .filter((surface) => surface.chrome === "navigation")
    .map((surface) => surface.id);
  assert.ok(
    destinations.length >= 10,
    `expected the navigation registry to carry every destination, found ${destinations.length}`,
  );

  const screens: OutlineScreen[] = [];
  for (const destination of destinations) {
    const item = container.querySelector<HTMLElement>(
      `.nav-item[data-surface="${destination}"]`,
    );
    assert.ok(item, `no navigation target rendered for ${destination}`);
    await act(async () => {
      item.click();
    });
    // ŁADOWANIE ROZPOZNAWANE PO `aria-busy`, NIE PO OBECNOŚCI TYTUŁU, i ta
    // różnica jest cała treścią tego czekania. Stan ładowania leniwej granicy
    // (`SurfaceLifecycleStates.tsx:49-54`) SAM rysuje `h1#surface-title`
    // („Opening this part of the app…"), więc warunek „jest tytuł" spełniał się
    // NATYCHMIAST — zmierzone: dziewięć z trzynastu celów wracało wtedy z tym
    // jednym nagłówkiem zastępczym i cały ten plik przechodził na zielono, nie
    // obejrzawszy ani jednego leniwego ekranu.
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const plane = container.querySelector('[role="tabpanel"]');
      if (
        plane !== null &&
        plane.getAttribute("aria-busy") !== "true" &&
        plane.querySelector('[aria-busy="true"]') === null
      )
        break;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }
    const { band, content } = outlineOfWorkPlane();
    // PASMO MUSI BYĆ, I TO NIE JEST ASERCJA NA ZAPAS. Bez niego reguła sadza
    // pierwszy szczebel na PIERWSZYM NAGŁÓWKU TREŚCI, więc ekran otwierający
    // się od `h3` nie ma nad sobą niczego, od czego mógłby przeskoczyć —
    // i wraca zielony. Zmierzone w tym pliku: dopóki czekanie kończyło się na
    // stanie ładowania, `captures` oddawał puste pasmo i wada, którą ten plik
    // powstał złapać, przechodziła przez niego bez śladu.
    assert.ok(
      band.length > 0,
      `${destination} drew no title band on an empty workspace, so this walk has no first rung for it — and a walk with no first rung cannot see a skipped one`,
    );
    screens.push({ id: destination, band, content });
  }

  // ── PODŁOGA NA LICZBIE NAGŁÓWKÓW, ZMIERZONA, NIE WYMYŚLONA ────────────────
  // Bez niej ten plik należy do klasy „zieleń na zerze": reguła nad zerową
  // liczbą nagłówków treści nie ma czego osądzić i wraca bez ani jednej
  // czerwieni. To nie jest hipoteza — TAK WŁAŚNIE ten plik zachował się przy
  // pierwszym uruchomieniu, kiedy czekanie kończyło się na stanie ładowania:
  // dziewięć z trzynastu celów oddawało sam nagłówek zastępczy, a przypadek
  // przechodził. Asercja o paśmie łapie DOKŁADNIE tamten kształt; ta łapie
  // każdy inny, w którym ekran narysuje pasmo i zgubi treść.
  //
  // LICZBA JEST ZMIERZONA NA TEJ GAŁĘZI (13 celów, fikstura `shellQueries`):
  // today 4, calendar 2, inbox 1, tasks 0, projects 1, pipeline 1,
  // organizations 1, people 1, renewals 1, meetings 4, notes 3, sources 2,
  // captures 1 — razem 22. Podłoga stoi NIŻEJ niż pomiar, bo stan pusty ekranu
  // wolno przeprojektować bez pytania tego pliku o zgodę; ma odciąć zapaść,
  // a nie przypiąć dzisiejszy kształt.
  const contentHeadings = screens.reduce(
    (total, screen) => total + screen.content.length,
    0,
  );
  assert.ok(
    contentHeadings >= 18,
    `this walk collected only ${contentHeadings} content heading(s) across ${screens.length} destination(s); 22 were measured when the walk was written and the floor is 18. A walk that collected nothing judges nothing and returns green.`,
  );

  const verdict = judgeHeadingOutline(screens);
  assert.deepEqual(
    verdict.failures,
    [],
    `an EMPTY destination skips a heading rung:\n${verdict.failures.join("\n")}\n\nladders:\n${verdict.judged
      .map(
        (screen) =>
          `  ${screen.id}\tband ${screen.band.map((head) => `h${head.level}`).join(" ")}\tcontent ${
            screen.content.map((head) => `h${head.level}`).join(" ") || "—"
          }`,
      )
      .join("\n")}`,
  );
});
