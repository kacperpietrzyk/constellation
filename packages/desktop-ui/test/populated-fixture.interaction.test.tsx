import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import { ProjectIdSchema } from "@constellation/contracts";

import {
  longIntendedOutcome,
  longTaskTitle,
  populatedProjectList,
  populatedShellQueries,
  populatedTaskList,
  projectionResponse,
} from "./shell-fixture.js";

// Fixture, którego nikt nie czyta, jest nie do odróżnienia od braku fixture'u.
// Ten plik jest dowodem konsumpcji `populatedShellQueries`: powłoka montuje się
// na nim, a rekordy z niego są WIDOCZNE na planie roboczym. Bez tego wariant
// bogaty mógłby mieć dowolny kształt — nikt by się nie dowiedział.
//
// „Widoczne" znaczy tu: w węźle, który ogląda człowiek. Pomiar po
// `plane.textContent` przechodził na obcięciu widocznego tytułu do dwudziestu
// znaków, bo ten sam tytuł niosą jeszcze dwie etykiety `sr-only` w tym samym
// wierszu — dlatego każda asercja o treści idzie przez `data-row-title` /
// `data-row-outcome`, a nie przez tekst całego planu.

let container: HTMLDivElement;
let root: Root;
// Odmontowanie tego samego korzenia dwa razy wywala workera Vitesta bez
// komunikatu. Bez tego znacznika pierwsza czerwień w tym pliku pociągałaby za
// sobą awarię pozostałych przypadków i przyczyna byłaby nie do odczytania.
let mounted = false;
const fittingOutcomeMarker = "FIT_WITHIN_FOUR_LINES";
const originalScrollHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollHeight",
);
const originalClientHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "clientHeight",
);

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      if (!this.classList.contains("inspector-outcome-text")) return 0;
      return (this.textContent ?? "").includes(fittingOutcomeMarker) ? 64 : 120;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.classList.contains("inspector-outcome-text") ? 64 : 0;
    },
  });
});

afterEach(() => {
  if (mounted) {
    mounted = false;
    act(() => {
      root.unmount();
    });
  }
  container.remove();
  if (originalScrollHeight === undefined) {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
  } else {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollHeight",
      originalScrollHeight,
    );
  }
  if (originalClientHeight === undefined) {
    Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  } else {
    Object.defineProperty(
      HTMLElement.prototype,
      "clientHeight",
      originalClientHeight,
    );
  }
});

/** Do komunikatów: tyle napisu, żeby go poznać, i ani znaku więcej. */
const clip = (text: string): string =>
  text.length <= 60 ? text : `${text.slice(0, 60)}…`;

/** Ile znaków od POCZĄTKU obu napisów jest wspólnych. */
const sharedPrefix = (left: string, right: string): number => {
  let index = 0;
  while (
    index < left.length &&
    index < right.length &&
    left[index] === right[index]
  ) {
    index += 1;
  }
  return index;
};

const mountShell = async (
  queries = populatedShellQueries,
  expectedProjectCount = populatedProjectList.items.length,
): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries });
  const initialSnapshot = await loadDesktopSnapshot(client);

  // Pomiar pusty to awaria pomiaru: gdyby wczytanie migawki zdegradowało
  // którąkolwiek z dwóch projekcji, na których stoi ten plik, ekran
  // wyrenderowałby stan pusty, a wszystkie asercje niżej padłyby z komunikatem
  // o brakującym wierszu — czyli w miejscu, które nie wskazuje przyczyny.
  assert.equal(
    initialSnapshot.tasks.length,
    populatedTaskList.items.length,
    `the snapshot took ${initialSnapshot.tasks.length} tasks from a fixture that carries ${populatedTaskList.items.length}`,
  );
  assert.equal(
    initialSnapshot.projects.kind,
    "ready",
    `the project fixture did not reach the snapshot: ${JSON.stringify(initialSnapshot.projects)}`,
  );
  if (initialSnapshot.projects.kind !== "ready") return;
  assert.equal(
    initialSnapshot.projects.data.items.length,
    expectedProjectCount,
    `the snapshot took ${initialSnapshot.projects.data.items.length} projects from a fixture that carries ${expectedProjectCount}`,
  );

  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot }));
  });
};

test("the project shortcuts do not take over the whole navigation", async () => {
  const carrier = populatedProjectList.items[0];
  assert.ok(carrier, "the populated fixture carries no project to multiply");
  const manyProjects = {
    ...populatedProjectList,
    items: Array.from({ length: 8 }, (_, index) => ({
      ...carrier,
      id: ProjectIdSchema.parse(
        `00000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
      ),
      title: `Project shortcut ${index + 1}`,
    })),
  };

  await mountShell(
    {
      ...populatedShellQueries,
      "project.list": projectionResponse(manyProjects),
    },
    manyProjects.items.length,
  );

  const shortcuts = container.querySelectorAll(
    '[data-nav-children="projects"] [data-project-shortcut]',
  );
  assert.equal(
    shortcuts.length,
    5,
    `the sidebar drew ${shortcuts.length} project shortcuts for an eight-project workspace`,
  );
  const viewAll = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (button) => (button.textContent ?? "").trim() === "View all 8 projects",
  );
  assert.ok(
    viewAll,
    "the bounded shortcut list offers no route to every project",
  );

  await act(async () => {
    viewAll.click();
  });
  const main = container.querySelector<HTMLElement>(
    'main[data-surface="projects"]',
  );
  assert.ok(main, "View all projects did not open the Projects plane");
  assert.equal(
    main.querySelectorAll("[data-project-row]").length,
    manyProjects.items.length,
    "the full Projects plane does not carry every project hidden from the shortcuts",
  );

  const lastProject = manyProjects.items.at(-1);
  assert.ok(
    lastProject,
    "the large fixture has no project outside the first five",
  );
  const lastProjectRow = [
    ...main.querySelectorAll<HTMLElement>("[data-project-row]"),
  ].find((row) => (row.textContent ?? "").includes(lastProject.title));
  assert.ok(lastProjectRow, "the Projects plane cannot open its last project");
  await act(async () => {
    lastProjectRow.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });

  const retainedShortcuts = [
    ...container.querySelectorAll<HTMLButtonElement>(
      '[data-nav-children="projects"] [data-project-shortcut]',
    ),
  ];
  assert.equal(
    retainedShortcuts.length,
    5,
    "opening a later project unbounded the shortcut list",
  );
  const retainedActive = retainedShortcuts.find(
    (shortcut) => (shortcut.textContent ?? "").trim() === lastProject.title,
  );
  assert.ok(
    retainedActive,
    "opening a project outside the first five removes its location from the sidebar",
  );
  assert.equal(
    retainedActive.getAttribute("aria-current"),
    "page",
    "the retained shortcut does not identify the open project",
  );

  const precedingShortcut = retainedShortcuts.at(-2);
  assert.ok(
    precedingShortcut,
    "the retained shortcut has no preceding arrow stop",
  );
  precedingShortcut.focus();
  await act(async () => {
    precedingShortcut.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  assert.equal(
    document.activeElement,
    retainedActive,
    "arrow navigation skips the retained active project",
  );
});

const openDestination = async (surface: string): Promise<HTMLElement> => {
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === surface);
  assert.ok(item, `no navigation target rendered for ${surface}`);
  await act(async () => {
    item.click();
  });

  // Korelacja, że nawigacja W OGÓLE się zdarzyła, i to tam, gdzie proszono.
  // Bez tego zdania każdy pomiar niżej czytał DOWOLNY plan roboczy, jaki akurat
  // stał na ekranie. Sprawdzone przez zepsucie: przypięcie nawigacji do
  // `today` zostawiało przypadek Projektów zielony, bo plan Dzisiaj też
  // wypisuje projekty razem z ich intencjami. Ta sama gwarancja i ten sam
  // zaczep, co w `surface-lifecycle.interaction.test.tsx:159-165`.
  const main = container.querySelector<HTMLElement>("main[data-surface]");
  // Zawężenie typu W PRAKTYCE, ale nie ozdoba: `data-surface` nosi WYŁĄCZNIE
  // plan roboczy — trzy punkty orientacyjne `center-state` (RealApp.tsx
  // 2720/2734/2770) go nie mają, więc powłoka, która wylądowała w ładowaniu
  // albo w odzyskiwaniu, pada tutaj. Że tu nie wyląduje, pilnują strażnicy
  // migawki w `mountShell`; zdanie zostaje, żeby taka powłoka NAZWAŁA SIĘ,
  // zamiast wywalić się na `null` kilka linii niżej.
  assert.ok(main, `${surface}: the shell rendered no main landmark`);
  // PRZED pytaniem o plan i o jego treść: nawigacja, która poszła nie tam,
  // objawiłaby się inaczej jako „pusty plan roboczy", czyli czerwień nazwałaby
  // niewłaściwą przyczynę.
  assert.equal(
    main.getAttribute("data-surface"),
    surface,
    `the shell went to “${main.getAttribute("data-surface")}” instead of “${surface}”, so everything below was measured on the wrong screen`,
  );

  const plane = main.querySelector<HTMLElement>('[role="tabpanel"]');
  assert.ok(plane, `${surface} rendered no work plane after the click`);
  // Plan roboczy bez ani jednego znaku znaczy, że każda asercja o treści niżej
  // mierzyłaby pustkę. Osobne zdanie, żeby czerwień nazywała przyczynę.
  assert.ok(
    (plane.textContent ?? "").trim().length > 0,
    `${surface} rendered an empty work plane`,
  );
  return plane;
};

test("outcome disclosure follows rendered overflow rather than character count", async () => {
  const carrier = populatedProjectList.items[0];
  assert.ok(carrier, "the populated fixture carries no project");
  const multilineOutcome = [
    "One compact line.",
    "A second compact line.",
    "A third compact line.",
    "A fourth compact line.",
    "A fifth compact line that must not disappear.",
  ].join("\n");
  assert.ok(
    multilineOutcome.length < 240,
    "the regression fixture no longer disproves a character-count threshold",
  );
  const project = { ...carrier, intendedOutcome: multilineOutcome };

  await mountShell(
    {
      ...populatedShellQueries,
      "project.list": projectionResponse({
        ...populatedProjectList,
        items: [project],
      }),
    },
    1,
  );
  const plane = await openDestination("projects");
  const projectRow = plane.querySelector<HTMLElement>("[data-project-row]");
  assert.ok(projectRow, "the compact multiline project has no selectable row");
  await act(async () => {
    projectRow.click();
  });

  const outcome = container.querySelector<HTMLElement>(
    ".inspector-outcome-preview",
  );
  assert.ok(outcome, "the selected project has no outcome preview");
  assert.equal(outcome.textContent?.trim(), multilineOutcome);
  assert.equal(
    outcome.dataset.collapsed,
    "true",
    "five rendered lines were treated as short because the string has fewer than 240 characters",
  );
  const toggle = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (button) =>
      (button.textContent ?? "").trim() === "Show full intended outcome",
  );
  assert.ok(
    toggle,
    "the visually overflowing outcome has no expansion control",
  );
});

test("character count alone does not add an outcome disclosure", async () => {
  const carrier = populatedProjectList.items[0];
  assert.ok(carrier, "the populated fixture carries no project");
  const fittingOutcome = `${fittingOutcomeMarker} ${"wide text ".repeat(30)}`;
  assert.ok(
    fittingOutcome.length > 240,
    "the regression fixture no longer disproves a character-count threshold",
  );
  const project = { ...carrier, intendedOutcome: fittingOutcome };

  await mountShell(
    {
      ...populatedShellQueries,
      "project.list": projectionResponse({
        ...populatedProjectList,
        items: [project],
      }),
    },
    1,
  );
  const plane = await openDestination("projects");
  const projectRow = plane.querySelector<HTMLElement>("[data-project-row]");
  assert.ok(projectRow, "the fitting project has no selectable row");
  await act(async () => {
    projectRow.click();
  });

  const outcome = container.querySelector<HTMLElement>(
    ".inspector-outcome-preview",
  );
  assert.ok(outcome, "the selected project has no outcome preview");
  assert.equal(
    outcome.dataset.collapsed,
    "false",
    "a fitting outcome was collapsed only because its string is long",
  );
  const toggle = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) =>
    /intended outcome/u.test((button.textContent ?? "").trim().toLowerCase()),
  );
  assert.equal(
    toggle,
    undefined,
    "a fitting outcome has an unnecessary toggle",
  );
});

/**
 * Tytuły wierszy tak, jak je widzi CZYTAJĄCY: treść węzłów `data-row-title`.
 * Świadomie nie `plane.textContent` — patrz komentarz na górze pliku.
 */
const visibleRowTitles = (plane: HTMLElement): readonly string[] => {
  const titles = [
    ...plane.querySelectorAll<HTMLElement>("[data-row-title]"),
  ].map((node) => (node.textContent ?? "").trim());
  assert.ok(
    titles.length > 0,
    "the plane rendered no row title at all, so nothing below measures a row",
  );
  return titles;
};

test("the populated fixture puts its tasks on the Tasks plane", async () => {
  // Pętla po pustej liście przechodzi bez ani jednej asercji, więc bez tego
  // zdania opróżnienie fixture'u czytałoby się jako sukces. Sprawdzone przez
  // zepsucie: z `items: []` cały ten przypadek świecił na zielono.
  assert.ok(
    populatedTaskList.items.length >= 3,
    `the populated task fixture degenerated to ${populatedTaskList.items.length} items`,
  );

  await mountShell();
  const plane = await openDestination("tasks");
  const titles = visibleRowTitles(plane);

  // Dopasowanie DOKŁADNE, nie `includes`: obcięty tytuł ma tu paść, i to na
  // tym tytule, którego dotyczy.
  for (const item of populatedTaskList.items) {
    assert.ok(
      titles.includes(item.title),
      `the Tasks plane shows no row reading “${clip(item.title)}” — its rows read ${JSON.stringify(titles.map(clip))}`,
    );
  }

  // To zdanie nie mierzy EKRANU, tylko FIXTURE, i tak jest zamierzone: pomiar
  // obcinania wykonuje pętla wyżej, a ta asercja pilnuje, żeby miała czym go
  // wykonać. Tytuł skrócony do trzech słów nie odsłoni ani obcięcia, ani
  // zawinięcia, ani kolizji z metryką obok, a pętla dalej byłaby zielona.
  assert.ok(
    longTaskTitle.length > 100,
    `the long-title case degenerated to ${longTaskTitle.length} characters`,
  );
});

test("the populated fixture puts its projects on the Projects plane", async () => {
  assert.ok(
    populatedProjectList.items.length >= 2,
    `the populated project fixture degenerated to ${populatedProjectList.items.length} items`,
  );

  await mountShell();
  const plane = await openDestination("projects");
  const titles = visibleRowTitles(plane);

  for (const item of populatedProjectList.items) {
    assert.ok(
      titles.includes(item.title),
      `the Projects plane shows no row reading “${clip(item.title)}” — its rows read ${JSON.stringify(titles.map(clip))}`,
    );
  }

  // Realne `intendedOutcome` w tym workspace ma 1400-3000 znaków i kilka
  // akapitów. Fixture skrócony do jednego zdania przestaje odsłaniać obcinanie
  // i rytm akapitów, a ta klasa defektów już raz tędy przeszła — dlatego
  // długość i wieloakapitowość są tu pilnowane wprost. To jedyne dwa zdania
  // o KSZTAŁCIE fixture'u w tym przypadku; wszystko niżej mierzy już ekran.
  // Symetria jest celowa: bez drugiego zdania fixture ścięty do jednego akapitu
  // zaczerwieniłby się dopiero na pomiarze ekranu, komunikatem wskazującym
  // render — czyli czerwień nazwałaby niewłaściwą przyczynę.
  assert.ok(
    longIntendedOutcome.length >= 1400,
    `the long outcome degenerated to ${longIntendedOutcome.length} characters`,
  );
  assert.ok(
    longIntendedOutcome.includes("\n\n"),
    "the long outcome fixture is one paragraph, so no render can put a multi-paragraph rhythm on the screen",
  );

  const carrier = populatedProjectList.items.find(
    (item) => item.intendedOutcome === longIntendedOutcome,
  );
  assert.ok(
    carrier,
    "no project in the fixture carries the long intended outcome, so the layout it exists to expose is unreachable",
  );
  const carrierTitle = [
    ...plane.querySelectorAll<HTMLElement>("[data-row-title]"),
  ].find((node) => (node.textContent ?? "").trim() === carrier.title);
  // Zawężenie typu, nie pomiar: pętla wyżej sprawdziła już KAŻDY tytuł
  // z fixture'u, a `carrier` jest jednym z nich — ten wiersz nie ma prawa
  // tu nie istnieć. Zdanie zostaje po to, żeby przyszła zmiana kolejności
  // nie zamieniła braku wiersza w `undefined is not an object`.
  assert.ok(
    carrierTitle,
    `the Projects plane rendered no row for “${clip(carrier.title)}”, the only project that carries the long outcome`,
  );
  // Gdzie ta gwarancja teraz mieszka, i dlaczego się przeniosła. Wiersz
  // kolekcji NIE pokazuje już intencji: przyjęty prototyp wycina eseje
  // z wierszy, bo pierwsze 190 px każdego ekranu było instrukcją obsługi,
  // a wiersz ma mówić, co jest z projektem — nie streszczać go. Pomiar
  // obcinania przenosi się więc tam, gdzie intencja NAPRAWDĘ jest rysowana:
  // do inspektora, jedno kliknięcie od wiersza. Sama gwarancja się nie
  // zmienia — CAŁA intencja dociera do DOM-u, z rytmem akapitów — i to jest
  // ta klasa defektów, która przeszła tędy już raz.
  //
  // Pełny widok rekordu stoi na `project.operationalOverview`, którego ten
  // fixture nie niesie, więc mierzenie go stąd mierzyłoby nieosiągalny ekran.
  // Kiedy powstanie ekran rekordu (decyzja #29: szerokość do czytania, bez
  // ucinania), gwarancja przenosi się tam razem z tą projekcją.
  const carrierRow = carrierTitle.closest<HTMLElement>("[data-project-row]");
  assert.ok(
    carrierRow,
    `the row for “${clip(carrier.title)}” carries no project identity to open`,
  );
  await act(async () => {
    carrierRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (container.querySelector(".provenance-block blockquote")) break;
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }
  const outcome = container.querySelector<HTMLElement>(
    ".inspector-outcome-preview",
  );
  assert.ok(
    outcome,
    `the record for “${clip(carrier.title)}” renders no bounded intended outcome`,
  );
  assert.equal(
    outcome.dataset.collapsed,
    "true",
    "the long outcome opens expanded and pushes work context below the preview rail",
  );
  const toggle = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (button) =>
      (button.textContent ?? "").trim() === "Show full intended outcome",
  );
  assert.ok(toggle, "the bounded outcome has no control that can reveal it");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(
    toggle.getAttribute("aria-controls"),
    outcome.id,
    "the outcome control does not name the text it expands",
  );

  const rendered = (outcome.textContent ?? "").trim();

  // KOLEJNOŚĆ: najpierw akapity, potem całość. Render, który skleja akapity w
  // jeden ciąg, gubi rytm przy TEJ SAMEJ liczbie znaków — pytanie o całość
  // powiedziałoby wtedy „napis się nie zgadza", a to zdanie mówi, co dokładnie
  // zniknęło. Liczone na WYRENDEROWANYM tekście: ta sama asercja postawiona na
  // stałej z fixture'u nie mówi nic o ekranie.
  const paragraphs = rendered
    .split("\n\n")
    .filter((paragraph) => paragraph.trim() !== "");
  assert.ok(
    paragraphs.length >= 3,
    `the rendered outcome arrived as ${paragraphs.length} paragraph(s) of ${rendered.length} characters, so no multi-paragraph rhythm reaches the screen`,
  );

  // Sedno: CAŁA intencja dociera do DOM-u. Sprawdzone przez zepsucie —
  // obcięcie renderu do 200 znaków zostawiało poprzednią wersję tej asercji
  // zieloną, bo pytała tylko o pierwsze 120.
  assert.ok(
    rendered.includes(longIntendedOutcome),
    `the record carries ${rendered.length} characters of the ${longIntendedOutcome.length}-character outcome (${sharedPrefix(rendered, longIntendedOutcome)} of them from its start), so the truncation this fixture exists to expose cannot show up`,
  );

  await act(async () => {
    toggle.click();
  });
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(toggle.textContent?.trim(), "Show less intended outcome");
  assert.equal(outcome.dataset.collapsed, "false");

  await act(async () => {
    toggle.click();
  });
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(outcome.dataset.collapsed, "true");
});

test("a task row names its owner where the packaged smoke reads it", async () => {
  // The packaged hub smoke proves that an assignment made on another device
  // shows up here and names THAT member, reading the principal off
  // `data-assignee`. Nothing local rendered an owner at all until this fixture
  // carried one, so that attribute was verified only by a twenty-minute run —
  // which is how four smoke selectors cost three CI cycles.
  await mountShell();
  const plane = await openDestination("tasks");
  const owners = [...plane.querySelectorAll<HTMLElement>("[data-assignee]")];
  assert.ok(
    owners.length > 0,
    "no row exposed data-assignee, so the packaged smoke's assignee check has nothing to read",
  );
  const expected = populatedTaskList.items.find(
    (item) => item.assignment?.assigneePrincipalId !== undefined,
  );
  assert.ok(expected, "the populated fixture carries no assignment to render");
  assert.ok(
    owners.some(
      (node) =>
        node.dataset.assignee === expected.assignment?.assigneePrincipalId,
    ),
    `the rendered owner is not the assigned principal: ${owners
      .map((node) => node.dataset.assignee)
      .join(", ")}`,
  );
});
