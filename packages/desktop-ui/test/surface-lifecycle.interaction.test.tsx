import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test, vi } from "vitest";

import { desktopSurfaceRegistry } from "@constellation/desktop-preload/surface-registry";

// Tylko typ: import jest wymazywany, więc nie omija zaślepki modułu niżej.
import type * as MeetingsModule from "../src/MeetingsSurface.js";

import { assertNamed, assertNoNode, assertSameNode } from "./dom-assert.js";
import { shellQueries } from "./shell-fixture.js";

// Gwarancja: w ŻADNYM momencie życia powierzchni główny punkt orientacyjny nie
// zostaje bez nazwy. Kiedy leniwy ekran jeszcze się wczytuje i kiedy nie uda mu
// się dojechać, `main` nadal wskazuje na skupialny, NAZWANY `h1` — a ekran,
// którego nie da się otworzyć, ZAWSZE proponuje ponowienie zamiast ślepego zaułka.
//
// Pilnowała tego sekcja `interaction-recovery-contract`, która wycinała tekst
// `src/RealApp.tsx` między `data-surface-state="failed"` a najbliższym
// `</section>` i drugi raz od `data-surface-state="loading"`. `sliceBetween`
// RZUCA przy braku zaczepu, więc samo przeniesienie `LazySurfaceBoundary`
// i `SurfaceLoadingState` do osobnego pliku — zmiana bez żadnego skutku dla
// zachowania — wywracało zestaw na czerwono. W drugą stronę myliła się tak samo:
// regex `[^<\s]` przechodził na nagłówku wypranym do jednego znaku. Dlatego
// nazwy pilnuje tu `assertNamed` (co najmniej dwie litery), a nie „tekst
// niepusty" — ten warunek przechodził na komplecie nagłówków wypranych do `.`.
//
// Tutaj oba stany są WYPRODUKOWANE: leniwy import jest trzymany otwarty, więc
// `SurfaceLoadingState` naprawdę się montuje, a potem ten sam import jest
// odrzucany, więc granica błędu naprawdę łapie. Zaślepki nie da się obejść
// przypadkiem — gdyby któryś cel okazał się jednak ładowany zachłannie, jego
// fabryka nigdy by nie ruszyła. KAŻDY test sprawdza to na WŁASNYM obchodzie:
// `lazyImports.rejecters` jest mapą na poziomie modułu i wypełnia ją już
// pierwszy test, więc licznik z niej byłby dla drugiego testu pomiarem cudzej
// pracy — drugi test zbiera więc własny zbiór celów, na których naprawdę
// zobaczył stan ładowania, i tylko te odrzuca.

// Sterowanie leniwymi importami. Fabryki `vi.mock` są wciągane na górę pliku
// i nie widzą zmiennych modułu, dlatego kontroler powstaje w `vi.hoisted`.
// Każda fabryka zwraca obietnicę, która NIE ROZWIĄZUJE SIĘ SAMA: dopóki test
// jej nie odrzuci, powierzchnia stoi w stanie ładowania i nie ma wyścigu
// z prawdziwym odczytem z dysku.
const lazyImports = vi.hoisted(() => {
  const rejecters = new Map<string, (reason: unknown) => void>();
  return {
    rejecters,
    hold: (surface: string) =>
      new Promise<never>((_resolve, reject) => {
        rejecters.set(surface, reject);
      }),
  };
});

vi.mock("../src/CalendarSurface.js", () => lazyImports.hold("calendar"));
vi.mock("../src/WorkSurface.js", () => lazyImports.hold("work"));
vi.mock("../src/DocumentsSurface.js", () => lazyImports.hold("library"));
vi.mock("../src/MeetingsSurface.js", () => lazyImports.hold("meetings"));
vi.mock("../src/ActivitySurface.js", () => lazyImports.hold("activity"));
vi.mock("../src/SettingsSurface.js", () => lazyImports.hold("settings"));
vi.mock("../src/AccessSurface.js", () => lazyImports.hold("access"));
vi.mock("../src/StrategicDepthSurface.js", () =>
  lazyImports.hold("organizations"),
);
vi.mock("../src/people/PeopleSurface.js", () => lazyImports.hold("people"));
vi.mock("../src/pipeline/PipelineSurface.js", () =>
  lazyImports.hold("pipeline"),
);

// Wyprowadzone z rejestru, nie z listy pisanej ręcznie: ręczna lista raz już
// dała komplet zieleni przy czterech nieruszonych ekranach.
const lazyDestinations = desktopSurfaceRegistry
  .filter((surface) => surface.loading === "lazy")
  .map((surface) => surface.id);

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
});

const unmount = (): void => {
  if (!mounted) return;
  mounted = false;
  act(() => {
    root.unmount();
  });
};

afterEach(() => {
  unmount();
  container.remove();
});

/** Montuje powłokę na prawdziwym DOM-ie i czeka, aż wejdzie w stan `ready`. */
const mountShell = async (): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries: shellQueries });
  const initialSnapshot = await loadDesktopSnapshot(client);

  root = createRoot(container);
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot }));
  });
  mounted = true;
};

/** Przepuszcza kolejkę mikro- i makrozadań pod kontrolą `act`. */
const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  });
};

/**
 * Czeka na WARUNEK, nie na czas. Stała pauza mierzyła tu czas trwania zamiast
 * zdarzenia i przy większym zestawie testów zaczęła kłamać raz na trzy przebiegi
 * — zawsze na `access`, jedynym celu, którego loader robi DWA importy po kolei
 * (`await import("../access-surface.css")`, dopiero potem moduł powierzchni,
 * `shell/lazy-surfaces.tsx:41-44`). Pod obciążeniem drugi z nich nie mieścił się
 * w oknie, więc pomiar meldował cel jako ładowany zachłannie.
 */
const settleUntil = async (
  ready: () => boolean,
  message: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (ready()) return;
    await settle();
  }
  assert.fail(message);
};

/**
 * Klika cel nawigacji. Kliknięcie nie odpala `focus` ani `mouseenter`, więc nie
 * uruchamia `preloadSurface` — leniwy import startuje dopiero z renderu.
 */
const openDestination = (destination: string): void => {
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === destination);
  assert.ok(
    item,
    `no navigation target rendered for ${destination}, so its lifecycle was never measured`,
  );
  // Synchronicznie: `act` z callbackiem asynchronicznym oddałby sterowanie
  // pętli zdarzeń i przeczekał moment, w którym widać stan ładowania.
  act(() => {
    item.click();
  });
};

/**
 * Sedno gwarancji: `main` odsyła do JEDNEGO `h1#surface-title`, który leży
 * w mierzonym stanie, jest skupialny i coś mówi.
 */
const assertLandmarkStaysNamed = (
  destination: string,
  surfaceState: "loading" | "failed",
): HTMLElement => {
  const main = container.querySelector<HTMLElement>("main[data-surface]");
  assert.ok(main, `${destination}: the shell rendered no main landmark`);
  assert.equal(
    main.getAttribute("data-surface"),
    destination,
    `${destination}: the work plane is showing a different destination, so the ${surfaceState} state was measured on the wrong screen`,
  );
  assert.equal(
    main.getAttribute("aria-labelledby"),
    "surface-title",
    `${destination}: the main landmark stopped pointing at a name while ${surfaceState}`,
  );

  const panel = container.querySelector<HTMLElement>(
    `[data-surface-state="${surfaceState}"]`,
  );
  assert.ok(
    panel,
    `${destination}: no surface rendered in the ${surfaceState} state, so nothing about that state was measured`,
  );

  const heading = panel.querySelector<HTMLElement>("h1#surface-title");
  assert.ok(
    heading,
    `${destination}: the ${surfaceState} state carries no h1#surface-title, so the main landmark names nothing`,
  );
  // KOLEJNOŚĆ jest tu istotna. Rozstrzygnięcie `aria-labelledby` idzie po
  // PIERWSZYM `#surface-title` w dokumencie, więc najpierw pytamy, czy trafia
  // ono w nagłówek MIERZONEGO stanu — to łapie podszywkę wyrenderowaną wyżej
  // (np. w nagłówku powłoki). Dopiero potem pytamy o pojedynczość, która łapie
  // duplikat POWSTAŁY PÓŹNIEJ, niewidoczny dla pytania pierwszego. Odwrotna
  // kolejność czyniła z pierwszej asercji ozdobę: liczność 1 wymuszała już jej
  // spełnienie i nie dało się jej złamać osobno.
  assertSameNode(
    document.getElementById("surface-title"),
    heading,
    `${destination}: aria-labelledby resolves to a heading outside the ${surfaceState} state`,
  );
  assert.equal(
    document.querySelectorAll("#surface-title").length,
    1,
    `${destination}: #surface-title is not unique while ${surfaceState}, so aria-labelledby resolves to whichever came first`,
  );
  assert.equal(
    heading.getAttribute("tabindex"),
    "-1",
    `${destination}: the ${surfaceState} heading is not focusable, so the shell cannot move focus onto it`,
  );
  assertNamed(
    heading,
    `${destination}: the ${surfaceState} heading carries no name, so the main landmark has a name that says nothing`,
  );
  return panel;
};

test("a surface that is still arriving leaves the main landmark named", async () => {
  assert.ok(
    lazyDestinations.length >= 5,
    `the registry reports ${lazyDestinations.length} lazy destinations, which is too few for this measurement to mean anything`,
  );

  await mountShell();

  for (const destination of lazyDestinations) {
    openDestination(destination);
    assertLandmarkStaysNamed(destination, "loading");
    // Import wisi, więc stan ładowania musi przetrwać przepuszczenie kolejki.
    // Tu też rejestrują się odrzucacze, których używa przypadek awarii — i to
    // ICH POJAWIENIE SIĘ jest warunkiem, nie upływ ustalonej pauzy.
    await settleUntil(
      () => lazyImports.rejecters.has(destination),
      `${destination}: no dynamic import started, so this destination is loaded eagerly or its lazy path has drifted`,
    );
    assertLandmarkStaysNamed(destination, "loading");
  }

  // Gdyby któryś cel okazał się ładowany zachłannie albo gdyby ścieżka zaślepki
  // się rozjechała, jego fabryka nigdy by nie ruszyła — a bez tego licznika
  // przypadek awarii nie miałby czego odrzucić i przeszedłby na pustym pomiarze.
  assert.equal(
    lazyImports.rejecters.size,
    lazyDestinations.length,
    `only ${lazyImports.rejecters.size} of ${lazyDestinations.length} lazy destinations actually started a dynamic import: ${JSON.stringify([...lazyImports.rejecters.keys()])}`,
  );
});

test("a surface that cannot be opened stays named and offers a way back", async () => {
  await mountShell();

  // Pierwszy obchód uruchamia leniwe importy — bez niego nie ma czego odrzucić.
  // Jest zarazem POMIAREM: `held` zbiera tylko te cele, na których ten test sam
  // zobaczył stan ładowania. Licznik z `lazyImports.rejecters` byłby ozdobą —
  // ta mapa jest na poziomie modułu i wypełnia ją już test pierwszy, więc
  // zgadzałaby się nawet po skasowaniu całej tej pętli.
  const held: string[] = [];
  for (const destination of lazyDestinations) {
    openDestination(destination);
    await settle();
    assertLandmarkStaysNamed(destination, "loading");
    held.push(destination);
  }
  assert.deepEqual(
    [...held].sort(),
    [...lazyDestinations].sort(),
    `this run only held ${held.length} of ${lazyDestinations.length} lazy destinations in the loading state, so the failure could not be produced for the rest: ${JSON.stringify(held)}`,
  );

  // Odrzucamy PO CELACH, które ten test wstrzymał — iterowanie po wartościach
  // mapy modułu odrzucałoby także cudze wpisy i wracało do tego samego sprzężenia.
  // `assert.ok(reject)` niżej jest zwężeniem typu, nie pomiarem: cel bez
  // zaślepki ładowałby się naprawdę i nie stanąłby w stanie ładowania, więc
  // padłaby wcześniej pętla wyżej. Zostaje, bo `get` zwraca `undefined`.
  for (const destination of held) {
    const reject = lazyImports.rejecters.get(destination);
    assert.ok(
      reject,
      `${destination}: it rendered a loading state but registered no dynamic import, so its failure cannot be produced`,
    );
    reject(new Error("scenario: the surface chunk could not be fetched"));
  }
  await settle();

  // Powłoka wraca na start: pierwszy obchód kończy się w Ustawieniach, a te są
  // TRYBEM i podmieniają lewą kolumnę, więc nawigacji nie ma się w co kliknąć.
  // Zapisany stan powłoki przeżywa odmontowanie, więc bez wyczyszczenia go
  // druga powłoka wstałaby z powrotem w Ustawieniach.
  unmount();
  localStorage.clear();
  await mountShell();

  for (const destination of lazyDestinations) {
    openDestination(destination);
    await settle();
    const panel = assertLandmarkStaysNamed(destination, "failed");

    // Ponowienia się NIE klika: jego uchwyt woła `window.location.reload()`.
    const retry = panel.querySelector<HTMLElement>(
      '[data-surface-action="retry"]',
    );
    assert.ok(
      retry,
      `${destination}: the failed surface offers no retry, so it is a dead end`,
    );
    assert.equal(
      retry.tagName,
      "BUTTON",
      `${destination}: the retry affordance is a <${retry.tagName.toLowerCase()}>, so keyboard and assistive technology cannot operate it`,
    );
  }
});

/** Montuje sam ekran spotkań z podmienionym wynikiem `getMeetingLoop`. */
const mountMeetings = async (
  meetingLoop: () => Promise<never>,
): Promise<void> => {
  // `importActual`, bo ten plik zaślepia `MeetingsSurface` na potrzeby powłoki.
  const { MeetingsSurface } = await vi.importActual<typeof MeetingsModule>(
    "../src/MeetingsSurface.js",
  );
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const client = {
    ...createScenarioClient({ queries: shellQueries }),
    getMeetingLoop: meetingLoop,
  };

  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(MeetingsSurface, {
        client,
        inspectorHost: null,
        onInspectorOpen: () => undefined,
        onMeetingSelected: () => undefined,
      }),
    );
  });
  mounted = true;
};

/**
 * Ten sam trzon gwarancji dla ekranu spotkań, który ma własny skeleton i własny
 * panel błędu — stara sekcja obejmowała je regexami po `MeetingsSurface.tsx`.
 */
const assertMeetingsHeading = (situation: string): HTMLElement => {
  const heading = container.querySelector<HTMLElement>("h1#surface-title");
  assert.ok(
    heading,
    `meetings ${situation}: no h1#surface-title rendered, so there is nothing for the main landmark to name`,
  );
  assert.equal(
    document.querySelectorAll("#surface-title").length,
    1,
    `meetings ${situation}: #surface-title is not unique, so aria-labelledby resolves to whichever came first`,
  );
  assert.equal(
    heading.getAttribute("tabindex"),
    "-1",
    `meetings ${situation}: the heading is not focusable, so the shell cannot move focus onto it`,
  );
  assertNamed(
    heading,
    `meetings ${situation}: the heading carries no name, so the main landmark has a name that says nothing`,
  );
  return heading;
};

/**
 * Nazwa dostępna kontrolki, w kolejności, w której rozstrzyga ją przeglądarka:
 * `aria-labelledby` → `aria-label` → treść. Sam `textContent` jest złym
 * przyrządem — przycisk nazwany wyłącznie `aria-label` NAZWĘ MA, a pomiar po
 * treści wywróciłby go komunikatem twierdzącym coś przeciwnego.
 */
const accessibleNameOf = (element: Element): string => {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy !== null && labelledBy.trim() !== "") {
    return labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
  }
  const label = element.getAttribute("aria-label");
  if (label !== null && label.trim() !== "") return label.trim();
  return (element.textContent ?? "").trim();
};

test("the meetings skeleton is named while its own data is still arriving", async () => {
  // Obietnica bez rozwiązania: skeleton stoi tak długo, jak długo trwa pomiar.
  await mountMeetings(() => new Promise<never>(() => undefined));

  const busy = container.querySelector<HTMLElement>('[aria-busy="true"]');
  assert.ok(
    busy,
    "meetings while loading: nothing reported itself busy, so the skeleton never rendered and this case measured nothing",
  );
  const heading = assertMeetingsHeading("while loading");
  assertSameNode(
    heading.closest('[aria-busy="true"]'),
    busy,
    "meetings while loading: the heading is not inside the busy region",
  );
});

test("the meetings failure is named and offers a way back", async () => {
  await mountMeetings(() =>
    Promise.reject(new Error("scenario: the meeting loop is unavailable")),
  );
  await settle();

  // Rozłączność obu przypadków: bez tego panel błędu mógłby być tym samym
  // skeletonem, a para asercji dowodziłaby jednej rzeczy dwa razy.
  // `assertNoNode`, nie `assert.equal(…, null)`: przy ZŁAMANEJ gwarancji ta
  // druga wsadza znaleziony węzeł do `AssertionError` i zabija workera —
  // przebieg ginie bez nazwy testu, meldując „1 passed" z czterech.
  assertNoNode(
    container.querySelector('[aria-busy="true"]'),
    "meetings after failure: the surface is still reporting itself busy, so the failure state never rendered",
  );
  const heading = assertMeetingsHeading("after failure");

  const panel = heading.closest("section");
  assert.ok(
    panel,
    "meetings after failure: the heading is not inside a surface section",
  );
  // Ten sam zaczep, co na granicy powłoki: `data-surface-action="retry"`.
  // Etykieta jest treścią i może się zmienić, nazwa klasy przenosi się przy
  // pierwszym ruchu w stylach, a sama rola przycisku nie mówi, KTÓRY to przycisk.
  const retry = panel.querySelector('[data-surface-action="retry"]');
  assert.ok(
    retry,
    "meetings after failure: the failure panel offers no retry, so it is a dead end",
  );
  assert.equal(
    retry.tagName,
    "BUTTON",
    `meetings after failure: the retry affordance is a <${retry.tagName.toLowerCase()}>, so keyboard and assistive technology cannot operate it`,
  );
  const retryName = accessibleNameOf(retry);
  assert.ok(
    /\p{L}{2,}/u.test(retryName),
    `meetings after failure: the retry button has no accessible name — it resolves to ${JSON.stringify(retryName)}`,
  );
});
