/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  desktopSurfaceIds,
  desktopSurfaceRegistry,
  type DesktopSurface,
} from "@constellation/desktop-preload/surface-registry";

import {
  activeShellContext,
  createShellNavigation,
  destinationContext,
  restoreShellNavigation,
  serializeShellNavigation,
} from "../src/client/shell-navigation.js";
import type { SurfaceId } from "../src/client/wave2-fixtures.js";
import { shellQueries } from "./shell-fixture.js";

// Ten plik nie czyta ani jednego pliku źródłowego i nie sprawdza ani jednego
// zdania interfejsu. Destynacje rozpoznaje po identyfikatorach z rejestru, a
// aktywną powierzchnię po atrybucie `data-surface` na planie roboczym. Dzięki
// temu przeżywa i rozbicie RealApp.tsx, i przepisanie treści na angielski.

/** Równość zbiorów typów — nie sam podtyp w jedną stronę. */
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// Fixture'y renderera deklarują własny alias `SurfaceId`. Gdyby przestał być
// tym samym zbiorem co rejestr, wyszukiwarka mogłaby kierować na destynację,
// której powłoka nie zna. Ta stała jest bramką typów: przy rozjeździe aliasu
// `Equals` daje `false` i `tsc -b` odmawia zbudowania testu.
const surfaceIdIsTheRegistryUnion: Equals<SurfaceId, DesktopSurface> = true;

/**
 * Wnętrze elementu otwartego znacznikiem `tag` od pozycji `from`, domknięte
 * zgodnie z zagnieżdżeniem tego samego znacznika.
 */
const innerOf = (
  markup: string,
  tag: string,
  from: number,
): string | undefined => {
  const scanner = new RegExp(`<${tag}\\b|</${tag}>`, "g");
  scanner.lastIndex = from;
  let depth = 1;
  for (
    let token = scanner.exec(markup);
    token !== null;
    token = scanner.exec(markup)
  ) {
    depth += token[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return markup.slice(from, token.index);
  }
  return undefined;
};

const firstInner = (markup: string, pattern: RegExp): string | undefined => {
  const match = pattern.exec(markup);
  const tag = match === null ? undefined : /^<([a-z]+)/.exec(match[0])?.[1];
  return match === null || tag === undefined
    ? undefined
    : innerOf(markup, tag, match.index + match[0].length);
};

// Panel powierzchni rozpoznajemy po roli ARIA, a nie po nazwie klasy: rola
// jest kontraktem dostępności, klasa jest szczegółem stylu.
const surfacePanelPattern = (): RegExp => /<[a-z]+[^>]*role="tabpanel"[^>]*>/;

// Wyprowadzone z rejestru, nie wypisane z palca: leniwa destynacja zatrzymuje
// się pod `renderToStaticMarkup` na fallbacku Suspense i to jest poprawne,
// ładowana od razu ma pokazać treść. Bez tego rozróżnienia jedna asercja
// „panel niepusty" znaczy dwie różne rzeczy dla dwóch połów rejestru.
const lazyDestinations = new Set<DesktopSurface>(
  desktopSurfaceRegistry
    .filter((surface) => surface.loading === "lazy")
    .map((surface) => surface.id),
);

/**
 * Plan roboczy dla danej destynacji: element z `data-surface="<id>"`, który
 * zawiera panel powierzchni. Sam atrybut nie wystarcza — niosą go też pozycje
 * nawigacji, a te renderują się dla KAŻDEJ destynacji z rejestru, także dla
 * takiej, której nikt nie podpiął.
 */
const workPlaneFor = (
  markup: string,
  destination: DesktopSurface,
): { readonly inner: string; readonly outer: string } | undefined => {
  const carriers = new RegExp(
    `<([a-z]+)[^>]*\\sdata-surface="${destination}"[^>]*>`,
    "g",
  );
  for (
    let match = carriers.exec(markup);
    match !== null;
    match = carriers.exec(markup)
  ) {
    const tag = match[1];
    if (tag === undefined) continue;
    const inner = innerOf(markup, tag, match.index + match[0].length);
    if (inner !== undefined && surfacePanelPattern().test(inner))
      return {
        inner,
        outer: markup.slice(match.index, match.index + match[0].length) + inner,
      };
  }
  return undefined;
};

interface ShellHarness {
  readonly render: (destination: DesktopSurface) => string;
}

const createHarness = async (): Promise<ShellHarness> => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      store.set(key, value);
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
  };
  const ignore = (): void => undefined;
  const shellWindow = {
    location: { search: "" },
    localStorage: storage,
    addEventListener: ignore,
    removeEventListener: ignore,
    requestAnimationFrame: () => 0,
    matchMedia: () => ({
      matches: false,
      addEventListener: ignore,
      removeEventListener: ignore,
    }),
  };
  const shellGlobals = globalThis as unknown as {
    window?: unknown;
    localStorage?: unknown;
  };
  shellGlobals.window = shellWindow;
  shellGlobals.localStorage = storage;

  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries: shellQueries });
  // Powłoka wchodzi w stan `ready` z podanego snapshotu — SSR nie uruchamia
  // efektów, więc bez tego zaczepu każda destynacja renderowałaby ten sam
  // ekran ładowania.
  const initialSnapshot = await loadDesktopSnapshot(client);

  return {
    render: (destination) => {
      store.clear();
      shellWindow.location.search = `?destination=${destination}`;
      return renderToStaticMarkup(
        createElement(RealApp, { client, initialSnapshot }),
      );
    },
  };
};

let harness: Promise<ShellHarness> | undefined;
const shell = async (): Promise<ShellHarness> =>
  await (harness ??= createHarness());

test("every destination in the registry renders a surface in the shell work plane", async () => {
  const { render } = await shell();
  for (const id of desktopSurfaceIds) {
    const markup = render(id);
    const plane = workPlaneFor(markup, id);
    assert.notEqual(
      plane,
      undefined,
      `Destynacja „${id}" nie otworzyła planu roboczego oznaczonego data-surface.`,
    );
    const panel = firstInner(plane?.inner ?? "", surfacePanelPattern());
    // To jest właściwa bramka: dopisanie destynacji do rejestru bez podpięcia
    // powierzchni zostawia panel pusty, choć nawigacja i sam plan roboczy
    // renderują się normalnie.
    assert.ok(
      (panel ?? "").trim().length > 0,
      `Destynacja „${id}" ma pusty panel powierzchni — nic jej nie renderuje.`,
    );
    // ...ale sama niepustość to za mało i przez chwilę tak właśnie było.
    // `renderToStaticMarkup` jest synchroniczne i NIE ROZWIĄZUJE `React.lazy`,
    // więc dla siedmiu leniwych destynacji w panelu siedział fallback Suspense
    // (ok. 250 znaków chromu), a asercja przechodziła. Leniwa powierzchnia
    // wpięta do złego modułu albo rzucająca przy montowaniu też przechodziła.
    // Rozpoznajemy fallback po jego własnym znaczniku stanu.
    const stillLoading = /data-surface-state="loading"/.test(panel ?? "");
    const declaredLazy = lazyDestinations.has(id);
    assert.equal(
      stillLoading,
      declaredLazy,
      stillLoading
        ? `Destynacja „${id}" zatrzymała się na fallbacku Suspense, choć rejestr deklaruje ją jako „eager" — panel niesie chrom ładowania, nie powierzchnię.`
        : `Destynacja „${id}" wyrenderowała treść od razu, choć rejestr deklaruje ją jako „lazy" — albo zmienił się tryb ładowania, albo bramka przestała rozpoznawać fallback.`,
    );
  }
  // Zmiana trybu ładowania jest decyzją o starcie okna, a nie szczegółem: gdyby
  // ktoś przestawił wszystko na „eager", powyższa pętla dalej byłaby zgodna sama
  // ze sobą, a bramka rozmiaru renderera dostałaby całą aplikację na ścieżkę
  // gorącą. Liczba jest tu po to, żeby taka zmiana była widoczna.
  assert.equal(
    lazyDestinations.size,
    9,
    "Zmienił się podział na powierzchnie leniwe i ładowane od razu — potwierdź to świadomie i zaktualizuj też budżet ścieżki gorącej.",
  );
});

test("every lazy destination has a loader, and the ones that can be resolved here point at a real component", async () => {
  const { lazySurfaceLoaders } = await import("../src/RealApp.js");

  // Pierwsza połowa: KOMPLETNOŚĆ. Klauzula `satisfies` w RealApp pilnuje tego na
  // etapie kompilacji, ale pilnuje tego wyłącznie tam — gdyby zniknęła przy
  // rozbiciu powłoki, nic by nie padło.
  assert.deepEqual(
    Object.keys(lazySurfaceLoaders).sort(),
    [...lazyDestinations].sort(),
    "Mapa leniwych loaderów rozjechała się z rejestrem: destynacja leniwa bez loadera nigdy się nie otworzy.",
  );

  // Druga połowa: WPIĘCIE. Tego `renderToStaticMarkup` nie sprawdzi nigdy —
  // jest synchroniczne, więc leniwa powierzchnia wpięta do nieistniejącego
  // modułu wygląda dokładnie jak poprawnie ładująca się. Rozwiązujemy loader
  // ręcznie.
  //
  // ZASIĘG POWIEDZIANY WPROST: trzy moduły (`activity`, `access`,
  // `relationships`) importują CSS na najwyższym poziomie, czego `node --test`
  // nie rozwiąże — nie ma w tym repo haka ładującego arkusze. Dla nich zostaje
  // sama kompletność klucza. „Zielone" nie ma znaczyć więcej, niż zmierzono.
  const resolvableHere = ["library", "meetings", "settings"] as const;
  for (const id of resolvableHere) {
    assert.ok(
      lazyDestinations.has(id),
      `„${id}" przestało być leniwe — zdejmij je z listy rozwiązywanych tutaj.`,
    );
    const loaded = (await lazySurfaceLoaders[id]()) as Record<string, unknown>;
    const exported = Object.values(loaded).filter(
      (value) => typeof value === "function",
    );
    assert.ok(
      exported.length > 0,
      `Loader destynacji „${id}" nie oddaje żadnego komponentu — wskazuje na zły moduł albo moduł stracił eksport.`,
    );
  }
});

test("the shell navigation offers every destination in the registry", async () => {
  const { render } = await shell();
  const markup = render("today");
  // Plan roboczy aktywnej destynacji też niesie `data-surface`, więc zanim
  // policzymy oferty nawigacji, wycinamy go — inaczej destynacja otwarta w
  // planie zaliczałaby się sama, nawet gdyby zniknęła z listy celów.
  const plane = workPlaneFor(markup, "today");
  const chrome = plane === undefined ? markup : markup.replace(plane.outer, "");
  for (const id of desktopSurfaceIds) {
    assert.match(
      chrome,
      new RegExp(`data-surface="${id}"`),
      `Nawigacja powłoki nie oferuje destynacji „${id}".`,
    );
  }
});

test("every destination survives a shell navigation round trip, and an unknown one does not", () => {
  assert.equal(surfaceIdIsTheRegistryUnion, true);
  const fallback = destinationContext("today", "fallback");
  for (const id of desktopSurfaceIds) {
    const restored = restoreShellNavigation(
      serializeShellNavigation(
        createShellNavigation(destinationContext(id, `label-${id}`)),
      ),
      fallback,
    );
    // Destynacja z rejestru wraca sobą, a nie fallbackiem: gdyby zbiór
    // odtwarzalnych powierzchni przestał pochodzić z rejestru, świeżo dopisana
    // destynacja cicho traciłaby przywracaną kartę.
    assert.equal(activeShellContext(restored).surface, id);
  }

  // Odwrotna połowa tej samej gwarancji: zbiór ma odrzucać, a nie przepuszczać
  // wszystko. Bez niej test przechodziłby także dla zbioru bez warunku.
  const stranger = restoreShellNavigation(
    JSON.stringify({
      version: 2,
      state: {
        tabs: [
          { key: "destination:not-a-surface", label: "x", surface: "not-a" },
        ],
        activeKey: "destination:not-a-surface",
        history: [
          { key: "destination:not-a-surface", label: "x", surface: "not-a" },
        ],
        historyIndex: 0,
      },
    }),
    fallback,
  );
  assert.equal(activeShellContext(stranger).surface, "today");
});

test("no ARIA relationship in the shell points at an element that is not there", async () => {
  // `aria-controls`, `aria-labelledby` i `aria-describedby` rozdzielają wartość
  // po BIAŁYCH ZNAKACH. Nazwa modułu ze spacją („Work Management") wpisana
  // wprost do identyfikatora rozpadła się więc na dwa tokeny, z których żaden
  // nie istniał — przycisk rozwijania grupy wskazywał w nicość.
  //
  // Kosztowało to piętnaście minut na TRZECH systemach naraz: paczkowany smoke
  // czeka, aż powłoka przestanie mieć wiszące odwołania, więc każda z dwunastu
  // powierzchni odczekiwała pełne trzy sekundy i całe wywołanie CDP padało na
  // timeout — komunikatem, który nie miał nic wspólnego z przyczyną. Ten test
  // jest po to, żeby następnym razem padło tutaj.
  const { render } = await shell();
  // Sprawdzane na KAŻDEJ destynacji, nie na jednej: sidebar rysuje się wszędzie,
  // więc ten konkretny defekt złapałaby i jedna, ale wiszące odwołanie dodane
  // na Ustawieniach albo Zadaniach byłoby poza zasięgiem. Kontrakt wyprowadzamy
  // z rejestru, nie z listy pisanej ręcznie — ręczna lista raz już dała komplet
  // zieleni przy nieruszonych ekranach.
  const dangling: string[] = [];
  let smallestIdCount = Number.POSITIVE_INFINITY;

  for (const destination of desktopSurfaceIds) {
    const markup = render(destination);
    const declaredIds = new Set(
      [...markup.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1] ?? ""),
    );
    smallestIdCount = Math.min(smallestIdCount, declaredIds.size);
    for (const attribute of [
      "aria-controls",
      "aria-labelledby",
      "aria-describedby",
    ]) {
      for (const match of markup.matchAll(
        new RegExp(`\\s${attribute}="([^"]*)"`, "gu"),
      )) {
        for (const id of (match[1] ?? "").split(/\s+/u).filter(Boolean)) {
          if (!declaredIds.has(id)) {
            dangling.push(`${destination}: ${attribute} -> ${id}`);
          }
        }
      }
    }
  }

  assert.ok(
    smallestIdCount > 5,
    `every destination must render a shell that declares ids; the thinnest declared ${smallestIdCount} — a scan that finds nothing passes vacuously`,
  );
  assert.deepEqual(dangling, []);
});

test("the work plane keeps the anchors the packaged smoke finds it by", async () => {
  // Dwa przeloty paczkowanego smoke'a (skalowanie tekstu 200%, nazwy kontrolek)
  // szukają aktywnego ekranu, żeby go zmierzyć. Szukały go po KLASIE
  // `.work-surface` — a tę samą klasę nosi wewnętrzny kontener ekranu Zadań,
  // więc selektor był o jedno przestawienie od mierzenia nie tego elementu.
  // Gorzej: kiedy nie trafia, przelot nie pada. Melduje `surfacePresent: false`
  // i świeci na zielono.
  //
  // Teraz smoke szuka po `id="main-content"` i `role="tabpanel"`. Oba przeżywają
  // rozbicie pliku, bo żadne nie jest szczegółem stylu: na `#main-content`
  // wskazuje skip-link, a rola jest kontraktem dostępności. Ten test pilnuje,
  // żeby PR 6 nie zabrał żadnego z nich po cichu.
  const { render } = await shell();

  for (const destination of desktopSurfaceIds) {
    const markup = render(destination);
    const plane =
      /<[a-z]+[^>]*\sid="main-content"[^>]*>/.exec(markup)?.[0] ?? "";
    assert.ok(
      plane.length > 0,
      `${destination}: the work plane must keep id="main-content" — the packaged smoke and the skip link both find it by that`,
    );
    assert.match(
      plane,
      /role="tabpanel"/,
      `${destination}: the work plane must keep role="tabpanel"`,
    );
  }
});

test("no two destinations render the same screen", async () => {
  // Bramka wyżej pyta „czy COŚ się wyrenderowało". Przechodzi więc także wtedy,
  // gdy dwie destynacje pokazują TEN SAM ekran — a to jest dokładnie defekt,
  // który produkuje rozbicie płaskiego łańcucha `{surface === "x" && …}` na
  // mapę dyspozytora: jedna literówka w kluczu i dwa cele wskazują na jedno
  // wejście. Nawigacja działa, panel nie jest pusty, wszystko świeci na zielono,
  // a jeden ekran po prostu przestaje być osiągalny.
  //
  // Ta asercja jest tu ZANIM PR 6 ruszy ten łańcuch, bo po fakcie nie da się
  // odróżnić „zawsze tak było" od „właśnie to zepsułem".
  const { render } = await shell();

  const byPanel = new Map<string, DesktopSurface[]>();
  for (const id of desktopSurfaceIds) {
    const plane = workPlaneFor(render(id), id);
    const panel = firstInner(plane?.inner ?? "", surfacePanelPattern()) ?? "";
    // Sam kształt panelu, bez atrybutu, który niesie identyfikator celu —
    // inaczej każde dwa panele różniłyby się nim i porównanie nic nie mówi.
    const shape = panel.replace(/\sdata-surface="[^"]*"/g, "").trim();
    assert.ok(shape.length > 0, `${id}: empty surface panel`);
    byPanel.set(shape, [...(byPanel.get(shape) ?? []), id]);
  }

  const collisions = [...byPanel.values()].filter((ids) => ids.length > 1);
  assert.deepEqual(
    collisions,
    [],
    `these destinations render an identical screen: ${collisions
      .map((ids) => ids.join(" = "))
      .join("; ")}`,
  );
});

test("every row anchor the packaged smokes rely on is one the renderer still writes", async () => {
  // Two twenty-minute CI cycles were spent discovering, twice, that a packaged
  // smoke was looking for `.task-row` — a class the rebuilt Tasks screen does
  // not render. The scripts do not lie about what they look for, so this reads
  // them and asks the renderer whether it still writes it.
  //
  // Only ROW anchors, deliberately: they are the ones a screen rewrite moves,
  // and a guard that tried to cover every selector in a 2 000-line smoke would
  // be a second copy of the smoke.
  const { readFileSync, readdirSync } = await import("node:fs");
  const path = await import("node:path");
  // Resolved from the repo root, not relative to this file: the compiled test
  // sits several directories deeper than the source, so a relative path is
  // right in one of the two places it runs from and wrong in the other.
  const root = path.resolve(process.cwd());
  const scripts = [
    path.join(root, "scripts", "run-packaged-alpha-smoke.mjs"),
    path.join(root, "scripts", "run-packaged-hub-smoke.mjs"),
  ];
  const anchors = new Set<string>();
  for (const relative of scripts) {
    const source = readFileSync(relative, "utf8");
    // Every `[data-…row…]` the script queries by, not a hand-written list of
    // the ones we happen to remember: a compound selector carries two, and the
    // next screen may add a third.
    for (const match of source.matchAll(/\[(data-[a-z-]*row[a-z-]*)\]/gu))
      anchors.add(match[1]!);
    // A row anchor written as a CLASS is the defect itself: a class belongs to
    // styling and moves when styling moves.
    assert.equal(
      /querySelectorAll\("\.task-row/u.test(source),
      false,
      `${relative} still finds rows by a CSS class — anchor on a data attribute the screen owns instead`,
    );
  }
  assert.ok(
    anchors.size >= 2,
    `read no row anchors out of the smoke scripts (${[...anchors].join(", ")}) — an empty read is a broken guard, not a pass`,
  );

  // Read against the layout SOURCE rather than a render, deliberately. What is
  // being guarded here IS a literal string shared between two files that never
  // meet — the smoke names an attribute, the layout writes it — so comparing
  // the two texts is the honest instrument, not a proxy for one. A render would
  // also need a populated workspace, and an empty one draws no rows at all.
  const sources: string[] = [];
  // Scoped to the Tasks screen, not the whole renderer. A repo-wide scan passes
  // while the Tasks rows lose their anchor, because another screen happens to
  // write the same attribute — proved by breaking it: renaming the anchor on the
  // Tasks row left a repo-wide check green.
  // Scoped to the DEFAULT lens, which is the only one a packaged smoke ever
  // sees: it opens Tasks and reads rows without touching the layout switcher.
  // Wider scopes were tried and both went green while the default lens lost its
  // anchor — the repo because another screen writes the same attribute, the
  // tasks directory because another LENS does.
  sources.push(
    readFileSync(
      path.join(
        root,
        "packages",
        "desktop-ui",
        "src",
        "tasks",
        "TaskListLayout.tsx",
      ),
      "utf8",
    ),
  );
  const written = sources.join("\n");
  // Beyond the row anchors: EVERY class and data attribute the smokes query by
  // must be something the renderer writes. Three CI cycles were spent finding
  // these one at a time — `.task-row`, then the same class in the second script,
  // then `.task-assignee` and `.task-copy`. One sweep costs nothing.
  const rendererSources: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))
        rendererSources.push(readFileSync(full, "utf8"));
    }
  };
  walk(path.join(root, "packages", "desktop-ui", "src"));
  const renderer = rendererSources.join("\n");
  const queried = new Set<string>();
  for (const relative of scripts) {
    const source = readFileSync(relative, "utf8");
    for (const match of source.matchAll(
      /querySelector(?:All)?\((?:`|")([^`"]{1,160})/gu,
    )) {
      const selector = match[1] ?? "";
      for (const token of [
        ...selector.matchAll(/\[([a-z][a-z0-9-]*)[\]=]/gu),
        ...selector.matchAll(/\.([a-z][a-z0-9-]{2,})/gu),
      ])
        queried.add(token[1]!);
    }
  }
  assert.ok(
    queried.size >= 10,
    `read only ${queried.size} selectors out of the smoke scripts — an empty read is a broken guard, not a pass`,
  );
  // One exemption, named with its reason rather than silently filtered:
  // `.list-row` is a legacy alternative inside a DIAGNOSTIC union that counts
  // rows for an error message. It asserts nothing, so it cannot silently stop
  // matching — and the union beside it now names the anchors the screens
  // actually write, which is why that counter stopped reporting zero.
  const diagnosticOnly = new Set(["list-row"]);
  const orphaned = [...queried].filter(
    (token) => !diagnosticOnly.has(token) && !renderer.includes(token),
  );
  assert.deepEqual(
    orphaned,
    [],
    `the packaged smokes query by names no renderer source writes: ${orphaned.join(", ")}`,
  );

  for (const anchor of ["data-task-row", "data-row-title"]) {
    assert.ok(
      anchors.has(anchor),
      `no packaged smoke looks for ${anchor} any more — if the smoke stopped using it, drop it here too rather than guarding a dead string`,
    );
    assert.ok(
      written.includes(anchor),
      `a packaged smoke finds task rows by ${anchor}, which the Tasks screen no longer writes`,
    );
  }
});
