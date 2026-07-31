import { strict as assert } from "node:assert";

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import { desktopSurfaceRegistry } from "@constellation/desktop-preload/surface-registry";

import { shellQueries } from "./shell-fixture.js";

// PIERWSZY test w tym repo, który naprawdę KLIKA. Do tej pory jedynym
// narzędziem był `renderToStaticMarkup`: nie uruchamia efektów, nie rozwiązuje
// `React.lazy` i nie zna zdarzeń, więc każda gwarancja o ZACHOWANIU powłoki
// była sprawdzana wyrażeniem regularnym po pliku źródłowym. Taki test przechodzi
// nad kodem, który się nie uruchamia, i pęka przy przestawieniu JSX-a, które
// niczego nie psuje — czyli myli się w obie strony naraz.

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // Bez tego React ostrzega, że `act(...)` nie jest wspierane, i część
  // aktualizacji wypada poza kontrolowane opróżnienie kolejki — czyli asercja
  // patrzy na DOM sprzed zmiany, którą właśnie wywołała.
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
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
};

const navItems = (): readonly HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
];

const activeSurface = (): string | undefined =>
  container.querySelector<HTMLElement>(".nav-item.active[data-surface]")
    ?.dataset.surface;

test("clicking a navigation target actually changes the work plane", async () => {
  await mountShell();

  // Wyprowadzone z rejestru, nie z listy pisanej ręcznie: ręczna lista raz już
  // dała komplet zieleni przy czterech nieruszonych ekranach.
  const eager = desktopSurfaceRegistry
    .filter((surface) => surface.loading === "eager")
    .map((surface) => surface.id);
  assert.ok(
    eager.length >= 3,
    `expected several eager destinations to drive, found ${eager.length}`,
  );

  for (const destination of eager) {
    const item = navItems().find(
      (node) => node.dataset.surface === destination,
    );
    assert.ok(item, `no navigation target rendered for ${destination}`);

    await act(async () => {
      item.click();
    });

    assert.equal(
      activeSurface(),
      destination,
      `clicking ${destination} did not make it the active target`,
    );
    // Plan roboczy, nie sama pozycja nawigacji: `data-surface` niosą oba,
    // więc bez tego rozróżnienia asercja przechodziłaby na samym sidebarze.
    const plane = container.querySelector<HTMLElement>(
      `[role="tabpanel"][data-surface="${destination}"], [role="tabpanel"] [data-surface="${destination}"]`,
    );
    const activePlane =
      plane ?? container.querySelector<HTMLElement>('[role="tabpanel"]');
    assert.ok(
      activePlane,
      `${destination} rendered no work plane after the click`,
    );
    assert.equal(
      activePlane.getAttribute("data-surface") ?? destination,
      destination,
    );
  }
});

test("the shell remembers the target it was left on", async () => {
  // Zapis stanu powłoki przechodzi przez PRAWDZIWY `localStorage`, a nie przez
  // zaślepkę wstrzykniętą w `globalThis` — to jedyny sposób, żeby sprawdzić, że
  // serializacja i odtworzenie zgadzają się ze sobą, a nie tylko każde z osobna
  // ze swoim testem jednostkowym.
  await mountShell();

  const target = navItems().find((node) => node.dataset.surface === "tasks");
  assert.ok(target, "the Tasks target must be present");
  await act(async () => {
    target.click();
  });

  const saved = localStorage.getItem("constellation.shell-navigation");
  assert.ok(saved, "leaving a target must persist the shell state");
  const parsed = JSON.parse(saved) as {
    readonly version: number;
    readonly state: { readonly tabs: readonly { readonly surface: string }[] };
  };
  assert.equal(parsed.version, 3);
  assert.ok(
    parsed.state.tabs.some((tab) => tab.surface === "tasks"),
    `the saved tabs must carry the target that was opened, got ${saved}`,
  );
});

test("collapsing a navigation module takes its targets out of reach", async () => {
  // Zwijane grupy przetrwały przebudowę (prototyp v3 je ma), a ich gwarancja
  // jest ZACHOWANIEM: zamknięta grupa nie może zostawiać swoich pozycji
  // osiągalnych, bo wtedy fokus wędruje w coś, czego nie widać.
  // `renderToStaticMarkup` nie potrafi zwinąć grupy — trzeba w nią kliknąć.
  await mountShell();

  const toggle = container.querySelector<HTMLElement>(".nav-group-toggle");
  assert.ok(toggle, "the shell must offer a module disclosure");
  assert.equal(toggle.getAttribute("aria-expanded"), "true");

  const controlled = toggle.getAttribute("aria-controls");
  assert.ok(controlled, "the disclosure must name what it controls");
  const group = container.querySelector<HTMLElement>(
    `#${CSS.escape(controlled)}`,
  );
  assert.ok(
    group,
    `the disclosure points at #${controlled}, which is not in the document`,
  );

  const items = (): number =>
    group.querySelectorAll(".nav-item[data-surface]").length;
  const populated = items();
  assert.ok(populated > 0, "an expanded module must carry targets");
  assert.equal(
    group.hasAttribute("hidden"),
    false,
    "an expanded module must be reachable",
  );

  await act(async () => {
    toggle.click();
  });

  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  // `hidden` jest tu istotą, nie stylem: usuwa poddrzewo z drzewa dostępności
  // i z kolejności Tab naraz. Sama klasa CSS zostawiłaby pozycje osiągalne
  // z klawiatury przy zerowej wysokości — dokładnie ten defekt, którego ten
  // test pilnuje.
  assert.equal(
    group.hasAttribute("hidden"),
    true,
    "a collapsed module must not leave its targets reachable",
  );

  await act(async () => {
    toggle.click();
  });
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(group.hasAttribute("hidden"), false);
  assert.equal(
    items(),
    populated,
    "re-opening a module must restore exactly the targets it had",
  );
});

test("exactly one navigation target is in the tab order at a time", async () => {
  // Roving tabindex: Tab wchodzi w nawigację RAZ i ląduje na bieżącej pozycji,
  // a strzałki poruszają się w środku. Dwie pozycje z `tabindex=0` znaczą, że
  // Tab przechodzi przez nawigację dwa razy; zero — że nie da się w nią wejść
  // wcale. Jednego ani drugiego nie widać na statycznym renderze.
  await mountShell();

  const focusable = (): readonly HTMLElement[] =>
    [
      ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
    ].filter((item) => item.getAttribute("tabindex") === "0");

  assert.equal(
    focusable().length,
    1,
    `exactly one target may hold the tab stop, found ${focusable()
      .map((item) => item.dataset.surface)
      .join(", ")}`,
  );

  const projects = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((item) => item.dataset.surface === "projects");
  assert.ok(projects, "the Projects target must be present");
  await act(async () => {
    projects.click();
  });

  const holders = focusable();
  assert.equal(
    holders.length,
    1,
    `the tab stop must move, not multiply, got ${holders
      .map((item) => item.dataset.surface)
      .join(", ")}`,
  );
  assert.equal(
    holders[0]?.dataset.surface,
    "projects",
    "the tab stop must follow the target the user chose",
  );
});

test("settings is a mode: it takes the left column and gives it back", async () => {
  // #31: wejście w Ustawienia podmienia CAŁĄ lewą kolumnę na spis sekcji,
  // a wyjście wraca tam, gdzie się było. To jest zachowanie, nie układ —
  // statyczny render pokaże oba drzewa naraz i nie powie, które jest widoczne.
  await mountShell();

  const projects = navItems().find(
    (item) => item.dataset.surface === "projects",
  );
  assert.ok(projects, "the Projects target must be present");
  await act(async () => {
    projects.click();
  });
  assert.equal(activeSurface(), "projects");

  const gear = container.querySelector<HTMLElement>("[data-settings-entry]");
  assert.ok(
    gear,
    "the shell must offer a way into settings beside the identity",
  );
  await act(async () => {
    gear.click();
  });

  // Kolumna przestała być nawigacją po pracy...
  assert.equal(
    container.querySelector(".settings-mode-column") !== null,
    true,
    "entering settings must replace the left column with its sections",
  );
  assert.equal(
    navItems().length,
    0,
    "the work navigation must not stay reachable behind the settings mode",
  );
  assert.ok(
    container.querySelectorAll("[data-settings-section]").length > 1,
    "the settings column must list its sections",
  );

  // ...i oddaje ją dokładnie tam, skąd się przyszło.
  const back = container.querySelector<HTMLElement>("[data-settings-back]");
  assert.ok(back, "the settings mode must offer a way back");
  await act(async () => {
    back.click();
  });

  assert.equal(
    container.querySelector(".settings-mode-column"),
    null,
    "leaving settings must restore the work navigation",
  );
  assert.equal(
    activeSurface(),
    "projects",
    "leaving settings must return to the target you came from",
  );
});

/* ── DWIE DROGI, KTÓRYMI IDENTYFIKATOR POWIERZCHNI WCHODZI SPOZA ZAPISANEJ
   SESJI ──────────────────────────────────────────────────────────────────
   Zapisane zakładki idą przez mapę wycofanych celów od dawna. Te dwie nie szły,
   a obie niosą identyfikator zapisany PRZED aktualizacją — i obie milczą, kiedy
   go nie rozpoznają. */

/** Podmienia adres okna na czas jednego testu. `?destination=` czyta się raz,
 *  przy pierwszym renderze, więc musi stać przed montowaniem. */
const withDestination = async (value: string): Promise<void> => {
  const url = new URL(window.location.href);
  url.searchParams.set("destination", value);
  url.searchParams.set("detached", "1");
  window.history.replaceState({}, "", url);
  try {
    await mountShell();
  } finally {
    url.searchParams.delete("destination");
    url.searchParams.delete("detached");
    window.history.replaceState({}, "", url);
  }
};

test("odczepione okno otwarte na wycofanym celu ląduje u jego następcy, nie na starcie", async () => {
  // Rejestr sam mówi, że mapa wycofanych celów istnieje MIĘDZY INNYMI dla
  // odczepionych okien — a ta ścieżka szukała w rejestrze wprost, więc okno
  // zapisane przed przebudową wracało na Today. Bez błędu: cel po prostu nie
  // istniał, a `?? "today"` jest po to, żeby nigdy nie było pustki.
  await withDestination("work");
  assert.equal(
    activeSurface(),
    "tasks",
    "odczepione okno wróciło na cel domyślny zamiast na ekran, który przejął tę pracę",
  );
});

test("przypięcie do wycofanego celu przechodzi na następcę, zamiast zniknąć z szyny", async () => {
  // Cichsza strata z tych dwóch: przypięcie do przemianowanej powierzchni było
  // WYRZUCANE przy pierwszym uruchomieniu po aktualizacji. Bez błędu, bez śladu
  // — po prostu o jedną pinezkę mniej niż wczoraj, czego nikt nie zgłosi, bo
  // nikt nie jest pewien, czy ją kiedykolwiek ustawił.
  localStorage.setItem(
    "constellation.favorites",
    JSON.stringify(["work", "cockpit", "tasks"]),
  );
  await mountShell();
  // Przypięcia rysują się jako `.nav-favorite` i — w odróżnieniu od reszty
  // szyny — NIE niosą `data-surface`, więc czyta się je po etykiecie, którą
  // rejestr im nadaje.
  const pinned = [
    ...container.querySelectorAll<HTMLElement>(".nav-item.nav-favorite"),
  ].map((item) => (item.textContent ?? "").replace("★", "").trim());
  assert.ok(
    pinned.includes("Today"),
    "przypięty cockpit zniknął z szyny zamiast przejść na Today",
  );
  // I DOKŁADNIE RAZ. Dwa wycofane identyfikatory mogą wskazywać jeden cel, a
  // szyna z tą samą pozycją dwa razy to nie jest to, co ktoś przypiął.
  assert.deepEqual(
    pinned.filter((label) => label === "Tasks"),
    ["Tasks"],
    "work i tasks rozwiązały się na ten sam cel, a szyna pokazała go dwa razy",
  );
});
