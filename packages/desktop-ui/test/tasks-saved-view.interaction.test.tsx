import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import type {
  DesktopSnapshot,
  SavedWorkView,
  SavedWorkViewFilterChange,
} from "../src/client/workflow.js";
import {
  assigneeBoardViewId,
  fieldGroupedViewId,
  savedViewShellQueries,
} from "./shell-fixture.js";

// A saved view is a stored answer to "how do I want to look at this work".
// Tasks read one third of that answer — the filters — and dropped the rest:
// `groupBy` and `layout` were read NOWHERE under `src/tasks/`, so a view its
// owner stored as a board grouped by assignee opened as an ungrouped list and
// said nothing about the difference. The stored view was lying about itself.
//
// Nothing in the suite could see it. Every fixture in the repo ships
// `savedViews: []`, and `TasksSurface` had no mounted coverage of any kind, so
// the whole feature could have been deleted with a green gate.
//
// Driven from the shell, not from the component. The defect was never inside
// `groupTasks` — it was that nobody handed it what the view said. A component
// test given the grouping directly would have passed throughout the outage.

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  if (mounted) {
    mounted = false;
    act(() => {
      root.unmount();
    });
  }
  container.remove();
});

const waitForCondition = async (
  ready: () => boolean,
  message: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (ready()) return;
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }
  assert.fail(message);
};

const loadFixtureSnapshot = async (): Promise<DesktopSnapshot> => {
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const snapshot = await loadDesktopSnapshot(
    createScenarioClient({ queries: savedViewShellQueries }),
  );
  assert.equal(
    snapshot.work.kind,
    "ready",
    "the work fixture never reached the snapshot, so this measures nothing",
  );
  return snapshot;
};

/**
 * Tasks on its own, over a snapshot this file bends.
 *
 * Two of the guarantees below are about shapes the shared fixture deliberately
 * does not carry — a stored view whose field the workspace has since dropped,
 * and the shell's own save callback. Bending a loaded snapshot here is not
 * making the fixture look richer: it is the one place a NEGATIVE shape can be
 * written without every unrelated screen inheriting it.
 */
const renderTasks = async (
  snapshot: DesktopSnapshot,
  over: {
    readonly onSaveViewFilters?: (
      view: SavedWorkView,
      change: SavedWorkViewFilterChange,
    ) => Promise<boolean>;
  } = {},
): Promise<void> => {
  const { TasksSurface } = await import("../src/tasks/TasksSurface.js");
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(TasksSurface, {
        snapshot,
        selectedTaskId: undefined,
        onOpenTask: () => undefined,
        onSelectTask: () => undefined,
        onCreateTask: async () => true,
        onSetStatus: () => undefined,
        onSetCompleted: () => undefined,
        onPlanOnDay: () => undefined,
        onOpenCalendar: () => undefined,
        ...over,
      }),
    );
  });
};

const openTasks = async (): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries: savedViewShellQueries });
  const snapshot = await loadDesktopSnapshot(client);
  assert.equal(
    snapshot.work.kind,
    "ready",
    "the work fixture never reached the snapshot, so this measures nothing",
  );
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === "tasks");
  assert.ok(item, "no navigation target rendered for Tasks");
  await act(async () => {
    item.click();
  });
  await waitForCondition(
    () => container.querySelectorAll("[data-task-row]").length > 0,
    "Tasks never drew a single row into the work plane",
  );
};

/**
 * Wybór w pasie widoku — dwa kliknięcia, bo tam nie ma już `<select>`.
 *
 * DO LOTU L6 stały tu trzy natywne kontrolki, a ta funkcja podstawiała im
 * wartość natywnym setterem i wysyłała `change`. Wpisy 4-1 i 4-2 zamieniły je
 * na przyciski otwierające rysowane menu (`components/ChoicePopover.tsx`),
 * więc zmiana wyboru jest tym, czym jest dla człowieka: naciśnij pigułkę,
 * naciśnij wiersz.
 *
 * SYGNATURA ZOSTAJE, i to jest cała różnica dla dwudziestu wywołań niżej.
 * Wyzwalacz nosi TO SAMO `id`, które nosił `<select>` (`tasks-view`,
 * `tasks-group`, `tasks-sort`), a wiersz menu niesie w `data-choice` tę samą
 * wartość, którą niosło `<option value>`.
 *
 * PANEL SZUKA SIĘ W `document.body`, NIE W `container`: `InlinePopover`
 * portaluje go poza drzewo ekranu (`InlinePopover.tsx:198-210`). Asercja
 * pisana na `container` byłaby zielona tylko dlatego, że nigdy nie zobaczyła
 * panelu.
 *
 * PIGUŁKI SĄ ŁADOWANE LENIWIE (budżet ścieżki gorącej), więc pierwsze wywołanie
 * czeka na wyzwalacz zamiast zakładać, że już jest.
 */
const choose = async (selectId: string, value: string): Promise<void> => {
  await waitForCondition(
    () => container.querySelector(`#${selectId}`) !== null,
    `the Tasks view bar never drew #${selectId}`,
  );
  const trigger = container.querySelector<HTMLButtonElement>(`#${selectId}`);
  assert.ok(trigger, `the Tasks view bar carries no #${selectId}`);
  await act(async () => {
    trigger.click();
  });
  const row = document.body.querySelector<HTMLButtonElement>(
    `[role="dialog"] [data-choice="${CSS.escape(value)}"]`,
  );
  assert.ok(
    row,
    `the menu behind #${selectId} offers no row for ${value === "" ? "(all work)" : value}`,
  );
  await act(async () => {
    row.click();
  });
};

/* ZAKRESEM PASKA WIDOKU JEST EKRAN, A NIE JEGO PRZEWIJANE PUDEŁKO.
 *
 * `data-tasks-surface` siedzi na `.surface-scroll`, a od lotu R3 pasmo tytułu
 * i pasek widoku są RODZEŃSTWEM tego pudełka, nie jego dziećmi (układ prototypu,
 * `v3/app.css:278-303`). Przełącznik układu, licznik zadań i „Edit filters"
 * mieszkają w pasku widoku, więc każdy selektor `[data-tasks-surface] …`
 * przestał ich sięgać — siedem asercji w tym pliku zgasło w tej samej chwili.
 *
 * ROZSTRZYGA SIĘ TO W LOCIE, BO TEN PLIK MONTUJE NA DWA SPOSOBY: `openTasks`
 * stawia całą powłokę (jest `main[data-surface="tasks"]`), a `renderTasks`
 * montuje sam ekran (nie ma). Stała nazwa selektora działałaby dla jednego
 * z nich i wywracała drugi.
 *
 * Podmioty, które NAPRAWDĘ są treścią — wiersze zadań, kolumny tablicy, głowy
 * grup, `data-density` — zostają przy `[data-tasks-surface]`, bo mieszkają
 * w pudełku i to jest o nich prawdziwe zdanie.
 */
const tasksScreen = (): HTMLElement =>
  container.querySelector<HTMLElement>('main[data-surface="tasks"]') ??
  container;

const boardColumns = (): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>(
    "[data-tasks-surface] [data-board-column]",
  ),
];

/** The column's own name, read off the listbox it wraps rather than off a
 *  class: CSS-module names are hashed in the packaged app, so a class-based
 *  selector here would measure a different build from the one that ships. */
const columnLabel = (column: HTMLElement): string =>
  column.querySelector('[role="listbox"]')?.getAttribute("aria-label") ?? "";

/** Group names in the order they are drawn, in whichever lens is open. Both the
 *  list and the board hang an "Add to …" button off every group heading, which
 *  is the one name-bearing element both share. */
const groupLabels = (): string[] =>
  [
    ...container.querySelectorAll<HTMLElement>(
      "[data-tasks-surface] button[aria-label^='Add to ']",
    ),
  ].map((button) =>
    (button.getAttribute("aria-label") ?? "").slice("Add to ".length),
  );

const layoutButton = (layout: string): HTMLButtonElement => {
  const button = tasksScreen().querySelector<HTMLButtonElement>(
    `[data-layout="${layout}"]`,
  );
  assert.ok(button, `the layout switcher offers no ${layout}`);
  return button;
};

/** What the screen says it is showing. Read off the screen rather than counted
 *  from the fixture: a test that recomputed the number would agree with a lens
 *  that dropped a task and a counter that dropped it too. */
const statedTaskCount = (): number => {
  const status = tasksScreen().querySelector<HTMLElement>('p[role="status"]');
  const match = /(\d+) tasks?\b/u.exec(status?.textContent ?? "");
  assert.ok(match, "the Tasks screen states no count of its own");
  return Number(match[1]);
};

test("a view stored as a board grouped by assignee opens as that board", async () => {
  await openTasks();
  assert.equal(
    boardColumns().length,
    0,
    "Tasks already opens as a board, so seeding one from a view proves nothing",
  );

  await choose("tasks-view", assigneeBoardViewId);
  await waitForCondition(
    () => boardColumns().length > 0,
    "a view stored as a board opened as something else",
  );

  assert.deepEqual(
    boardColumns().map(columnLabel),
    ["Kacper", "Marta", "Unassigned"],
    "the columns are not the people the stored view groups by",
  );

  // The cards and the counter are two readings of one question, compared to
  // EACH OTHER: two literals would both stay green if the seeding quietly
  // filtered the set down on the way into the columns.
  const carded = boardColumns().reduce(
    (total, column) =>
      total + column.querySelectorAll("[data-row-title]").length,
    0,
  );
  assert.equal(
    carded,
    statedTaskCount(),
    "the board holds a different number of tasks from the one the screen states",
  );

  assert.equal(
    layoutButton("board").getAttribute("aria-pressed"),
    "true",
    "the switcher and the screen disagree about which lens is open",
  );
});

test("the Board lens is refused with the reason said out loud while grouping is off", async () => {
  await openTasks();
  assert.equal(
    layoutButton("board").disabled,
    false,
    "Board was already refused before grouping was turned off",
  );

  await choose("tasks-group", "none");

  const board = layoutButton("board");
  assert.equal(
    board.disabled,
    true,
    "Board can still be chosen with nothing to make columns out of",
  );
  // The kernel refuses this pair on the resulting record, so a board drawn here
  // would be a screen showing an arrangement that cannot be saved.
  const describedBy = board.getAttribute("aria-describedby");
  assert.ok(describedBy, "the refused Board button points at no reason");
  const reason = document.getElementById(describedBy);
  assert.ok(
    reason,
    "the Board button names a reason that is not on the page — a control greyed out for nothing",
  );
  assert.equal(reason.textContent?.trim(), "Board needs a grouped view.");
});

test("turning grouping off takes the board down rather than drawing one column called All work", async () => {
  await openTasks();
  await choose("tasks-view", assigneeBoardViewId);
  await waitForCondition(
    () => boardColumns().length > 0,
    "a view stored as a board opened as something else",
  );

  await choose("tasks-group", "none");
  // Waited on the BOARD coming down, and not on rows appearing. The rows are
  // the second half of the guarantee, and waiting on them first reports an
  // interlock that never fired as a screen that lost its work.
  await waitForCondition(
    () => boardColumns().length === 0,
    'the board stayed up over a single "All work" column, which is the shape the kernel refuses to store',
  );
  assert.ok(
    container.querySelectorAll("[data-task-row]").length > 0,
    "the interlock took the board down and left nothing in its place",
  );
});

test("the layout switcher wins after a view has seeded it", async () => {
  // A view SEEDS the lens; it does not hold it. A regression that derived the
  // lens from the view on every render instead of seeding it once would leave
  // every other test in this file green and this reader stuck on a board they
  // asked to leave.
  await openTasks();
  await choose("tasks-view", assigneeBoardViewId);
  await waitForCondition(
    () => boardColumns().length > 0,
    "a view stored as a board opened as something else",
  );

  await act(async () => {
    layoutButton("list").click();
  });

  assert.equal(
    boardColumns().length,
    0,
    "the open view put the board back over a reader who had asked for the list",
  );
  assert.ok(
    container.querySelectorAll("[data-tasks-surface] [data-task-row]").length >
      0,
    "switching back to the list drew no rows, so the lens moved and the work did not",
  );
  assert.equal(
    layoutButton("list").getAttribute("aria-pressed"),
    "true",
    "the switcher and the screen disagree about which lens is open",
  );
});

test("a view grouped by a workspace field draws that field's options, in the order the field declares them", async () => {
  await openTasks();
  await choose("tasks-view", fieldGroupedViewId);
  // Waited on the COUNT, not on "No value" being present: the trailing group
  // appears the instant the field grouping applies, so a half-drawn screen
  // would satisfy a membership test and then fail the comparison below with a
  // diff about the wrong thing.
  const expected = ["Warsztat", "Analiza", "Przegląd", "No value"];
  await waitForCondition(
    () => groupLabels().length === expected.length,
    "a view grouped by a field never settled on the field's own groups",
  );

  // Declared order, and neither alphabetical nor the order the values happen to
  // appear in the rows — the fixture's options differ under all three, so this
  // fails if the groups are built from the data instead of from the definition.
  assert.deepEqual(
    groupLabels(),
    expected,
    "the field's own groups are not what the screen drew",
  );

  // Work carrying no value for the field is SAID, not dropped. A silent
  // collapse would leave the screen quietly showing fewer tasks than it counts.
  assert.equal(
    container.querySelectorAll("[data-tasks-surface] [data-task-row]").length,
    statedTaskCount(),
    "grouping by a field lost a task that has no value for it",
  );
});

/* ── DRUGI POZIOM LEWEJ KOLUMNY OTWIERA TO, CO NAZYWA ────────────────────────
 *
 * Lot L11 dostawił pod Zadaniami wiersze zapisanych widoków i dopisał do
 * kontraktu zdanie, którego nic nie mierzyło: „they must actually OPEN what
 * they name, or they are an affordance with no target". Bramka układu liczy
 * POJEMNIK (`L11-06` — `[data-nav-children="tasks"]`), więc wiersz prowadzący
 * na „All work" przechodziłby ją na zielono z nazwą cudzego widoku na sobie.
 * Zmierzył to przegląd adwersarialny; cała zdolność — pole `savedViewId` na
 * kontekście, jego gałąź w walidacji zapisu, `requestedViewId`/`onViewOpened`
 * na ekranie — nie miała ani jednego testu.
 *
 * DWA WIERSZE, NIE JEDEN, I DRUGI Z NICH JAKO PIERWSZY. Test otwierający
 * „jedyny widok" byłby zielony także wtedy, gdyby wiersz otwierał widok
 * PIERWSZY z listy albo dowolny; te dwa widoki rysują się inaczej (tablica po
 * osobach kontra lista po polu), więc pomyłka o jeden jest tu widoczna
 * w TREŚCI ekranu, a nie tylko w identyfikatorze.
 */
const navChildRows = (): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>(
    '.sidebar [data-nav-children="tasks"] button',
  ),
];

const navChildNamed = (name: string): HTMLElement => {
  const row = navChildRows().find((node) => node.textContent === name);
  assert.ok(
    row,
    `the second level under Tasks draws no row named „${name}" (it draws: ${navChildRows()
      .map((node) => node.textContent)
      .join(", ")})`,
  );
  return row;
};

test("a saved-view row in the navigation opens the view it names, and stops claiming the page when the reader leaves it", async () => {
  await openTasks();
  assert.deepEqual(
    navChildRows().map((row) => row.textContent),
    ["Kto co trzyma", "Praca po rodzaju"],
    "the second level under Tasks does not name the workspace's saved views",
  );
  assert.equal(
    boardColumns().length,
    0,
    "Tasks already opens as a board, so opening one from the navigation proves nothing",
  );

  // DRUGI WIERSZ. Lista po polu, nie tablica po osobach.
  await act(async () => {
    navChildNamed("Praca po rodzaju").click();
  });
  const byField = ["Warsztat", "Analiza", "Przegląd", "No value"];
  await waitForCondition(
    () => groupLabels().length === byField.length,
    "the row named „Praca po rodzaju” never opened the view it names",
  );
  assert.deepEqual(
    groupLabels(),
    byField,
    "the navigation row opened something other than the view written on it",
  );
  assert.equal(
    boardColumns().length,
    0,
    "the row named a list view and the screen drew a board",
  );
  assert.equal(
    navChildNamed("Praca po rodzaju").getAttribute("aria-current"),
    "page",
    "the open view's row does not say it is the current page",
  );

  // PIERWSZY WIERSZ, z tego samego miejsca: inny widok, inny rysunek.
  await act(async () => {
    navChildNamed("Kto co trzyma").click();
  });
  await waitForCondition(
    () => boardColumns().length > 0,
    "the row named „Kto co trzyma” did not open the board that view stores",
  );
  assert.deepEqual(
    boardColumns().map(columnLabel),
    ["Kacper", "Marta", "Unassigned"],
    "the board the navigation opened is not the one that view groups by",
  );
  assert.equal(
    navChildNamed("Praca po rodzaju").getAttribute("aria-current"),
    null,
    "two rows claim to be the current page at once",
  );

  // DROGA POWROTNA. Czytelnik przełącza się kontrolką ekranu na „All work",
  // a wiersz w nawigacji ma o tym USŁYSZEĆ. Bez `onViewOpened` kontekst
  // zakładki dalej niósłby identyfikator widoku, a wiersz nosiłby
  // `aria-current="page"` nad ekranem, który tego widoku nie pokazuje —
  // kłamiąca bieżąca strona jest gorsza niż brak wiersza.
  await choose("tasks-view", "");
  // CZEKANIE JEST NA BIEŻĄCEJ STRONIE, NIE NA TABLICY, i to nie jest wygodny
  // wybór podmiotu — zmierzone: „All work" ZOSTAWIA soczewkę tam, gdzie
  // czytelnik ją zostawił (`TasksSurface.tsx`, `openView`: nie ma widoku, więc
  // nie ma z czego zasiać, a ściąganie go z powrotem na listę byłoby wyborem,
  // o który nikt nie prosił). Tablica stoi więc dalej i asercja na niej
  // mierzyłaby cudzą decyzję zamiast drogi powrotnej.
  await waitForCondition(
    () =>
      navChildRows().every((row) => row.getAttribute("aria-current") === null),
    "a navigation row still claims the page after the reader left its view with the screen's own control",
  );
  assert.deepEqual(
    navChildRows().map((row) => row.textContent),
    ["Kto co trzyma", "Praca po rodzaju"],
    "the second level lost a row on the way back to All work",
  );
});

/** The stored view kept its field grouping while the workspace stopped
 *  declaring the field, and asks to be drawn as a board. Reachable: the kernel
 *  checks the field resolves to a choice field at WRITE time only
 *  (`wave2.ts:3567-3578`) and nothing re-validates a stored payload on load. */
const orphanedFieldBoard = (snapshot: DesktopSnapshot): DesktopSnapshot => {
  const work = snapshot.work;
  if (work.kind !== "ready")
    throw new Error("the work plane never arrived, so this measures nothing");
  return {
    ...snapshot,
    bootstrap: { ...snapshot.bootstrap, fieldDefinitions: [] },
    work: {
      ...work,
      data: {
        ...work.data,
        savedViews: work.data.savedViews.map((view) =>
          view.id === fieldGroupedViewId
            ? { ...view, layout: "board" as const }
            : view,
        ),
      },
    },
  };
};

test("a board grouped by a field the workspace has dropped is refused, and says so", async () => {
  await renderTasks(orphanedFieldBoard(await loadFixtureSnapshot()));
  // No wait: the interlock lands this on the list, which ships with the screen
  // rather than arriving as a chunk, so `act` has already flushed the render.
  // Waiting on "some groups" here would pass on the groups that were up BEFORE
  // the view was opened and measure the wrong screen.
  await choose("tasks-view", fieldGroupedViewId);

  // One group, and it is the trailing "No value" one — which is exactly the
  // single column the board would have drawn while calling itself a board.
  assert.deepEqual(groupLabels(), ["No value"]);
  assert.equal(
    boardColumns().length,
    0,
    "a grouping with nothing to make columns from still opened as a board",
  );

  const board = layoutButton("board");
  assert.equal(
    board.disabled,
    true,
    "Board can still be chosen on a grouping that yields exactly one column",
  );
  const describedBy = board.getAttribute("aria-describedby");
  assert.ok(describedBy, "the refused Board button points at no reason");
  const reason = document.getElementById(describedBy);
  assert.ok(reason, "the Board button names a reason that is not on the page");
  assert.equal(
    reason.textContent?.trim(),
    "This view groups by a field the workspace no longer offers.",
    "the reader is told the grouping is off, which is not what happened",
  );

  // The work is still reachable. A refused lens must not also cost the rows.
  assert.equal(
    container.querySelectorAll("[data-tasks-surface] [data-task-row]").length,
    statedTaskCount(),
    "refusing the board took the work down with it",
  );
});

const editFilters = (): HTMLButtonElement | undefined => {
  const buttons = tasksScreen().querySelectorAll<HTMLButtonElement>(
    "button[aria-expanded]",
  );
  return [...buttons].find(
    (button) => button.textContent?.trim() === "Edit filters",
  );
};

const filtersForm = (): HTMLFormElement | null =>
  container.querySelector<HTMLFormElement>(
    'form[aria-label="Saved view filters"]',
  );

test("editing a view's conditions from the view bar reaches the shell", async () => {
  const changes: { view: string; change: SavedWorkViewFilterChange }[] = [];
  await renderTasks(await loadFixtureSnapshot(), {
    onSaveViewFilters: async (view, change) => {
      changes.push({ view: view.id, change });
      return true;
    },
  });

  assert.equal(
    editFilters(),
    undefined,
    'the editor stands open on "All work", which has no conditions to edit',
  );

  await choose("tasks-view", assigneeBoardViewId);
  // The form is a lazy chunk, so it arrives a tick after the view does.
  await waitForCondition(
    () => editFilters() !== undefined,
    "opening a saved view offered no way to change its conditions",
  );
  await act(async () => {
    editFilters()?.click();
  });
  const form = filtersForm();
  assert.ok(form, "the disclosure opened onto no form");

  const urgent = form.querySelector<HTMLInputElement>(
    '[data-condition="priorities"] input[value="urgent"]',
  );
  assert.ok(urgent, "the editor offers no priority conditions");
  await act(async () => {
    urgent.click();
  });
  const save = form.querySelector<HTMLButtonElement>("button[type=submit]");
  assert.ok(save, "the editor has no way to save");
  assert.equal(
    save.disabled,
    false,
    "Save stayed dead after a condition moved, so the click below writes nothing",
  );
  await act(async () => {
    save.click();
  });

  // The view the edit was made ON travels with it. A screen that sent the
  // change against whichever view it resolved later would rewrite the wrong
  // one, and the reader would see it a week later on a view they never opened.
  assert.deepEqual(changes, [
    { view: assigneeBoardViewId, change: { priorities: ["urgent"] } },
  ]);
});

test("the shell hands Tasks the write its filter editor needs", async () => {
  // The whole capability is dark without this one line. `SavedViewFilterForm`
  // had ZERO importers when it landed, so Vite tree-shook it out of the build
  // entirely and every test above it passed over a component nobody ships.
  await openTasks();
  await choose("tasks-view", assigneeBoardViewId);
  await waitForCondition(
    () => editFilters() !== undefined,
    "Tasks draws no way to edit the conditions of the view it has open: it mounts the editor only when `onSaveViewFilters` is passed, and RealApp does not pass it at its `<TasksSurface>` yet",
  );

  await act(async () => {
    editFilters()?.click();
  });
  assert.ok(
    filtersForm(),
    "the editor opened onto no form once the shell wired it",
  );
});

/* ── KEEPING A VIEW ───────────────────────────────────────────────────────
   Making one, renaming it, deleting it and writing the lens back — moved off
   the retired work surface. Asserted through the shell and through the PAYLOAD:
   the manager is lazy behind a trigger, and a screen that redraws itself and a
   screen that SENDS what was chosen look identical. */

/** Every command the shell issued while a test was running. */
let issued: {
  name: string;
  payload: Record<string, unknown>;
  expectedVersions: Record<string, number>;
}[] = [];

/** Tasks, reached from the navigation, with the commands captured. */
const openTasksCapturing = async (): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  issued = [];
  const client = createScenarioClient({
    queries: savedViewShellQueries,
    executeCommand: (command) => {
      issued.push({
        name: command.commandName,
        payload: command.payload as Record<string, unknown>,
        expectedVersions: (command.expectedVersions ?? {}) as Record<
          string,
          number
        >,
      });
      return {
        kind: "contract_rejected",
        diagnosticCode: "contract.invalid",
        issues: [{ path: "", code: "custom" }],
      };
    },
  });
  const snapshot = await loadDesktopSnapshot(client);
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === "tasks");
  assert.ok(item, "no navigation target rendered for Tasks");
  await act(async () => {
    item.click();
  });
  await waitForCondition(
    () => container.querySelectorAll("[data-task-row]").length > 0,
    "Tasks never drew a single row into the work plane",
  );
  // The manager is its own chunk, so it lands a tick after the screen.
  await waitForCondition(
    () => managerTrigger("Save this view") !== undefined,
    "Tasks draws no way to keep a view: the manager mounts only when the shell passes the three writes, and a Save that reaches nobody is worse than no Save",
  );
};

const managerTrigger = (text: string): HTMLElement | undefined =>
  [...container.querySelectorAll<HTMLElement>("button")].find(
    (button) => (button.textContent ?? "").trim() === text,
  );

const clickNamed = async (text: string): Promise<void> => {
  const button = managerTrigger(text);
  assert.ok(button, `no control named “${text}” is in the view bar`);
  await act(async () => {
    button.click();
  });
};

const popover = (): HTMLElement => {
  const dialog = document.body.querySelector<HTMLElement>(
    '[role="dialog"].inline-popover',
  );
  assert.ok(dialog, "the disclosure opened nothing");
  return dialog;
};

const typeInto = async (field: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const lastCommand = (name: string) => {
  const found = [...issued].reverse().find((command) => command.name === name);
  assert.ok(found, `nothing issued a ${name} command`);
  return found;
};

test("saving a view keeps the shape on screen, and nothing the reader did not choose", async () => {
  await openTasksCapturing();

  // Group and order the work first — "this view" has to mean something the
  // reader can see before they name it.
  await choose("tasks-group", "priority");
  await choose("tasks-sort", "due");

  await clickNamed("Save this view");
  const dialog = popover();
  const name = dialog.querySelector<HTMLInputElement>("#saved-view-name");
  assert.ok(name, "the form asks for no name");
  await typeInto(name, "Pilne, po terminie");
  await act(async () => {
    dialog.querySelector<HTMLButtonElement>("button[type=submit]")?.click();
  });

  const command = lastCommand("savedView.create");
  assert.equal(command.payload.name, "Pilne, po terminie");
  assert.equal(command.payload.groupBy, "priority");
  // The screen and the kernel name the same three orders differently, and the
  // translation lives in one place. A half-copied mapping is how a view saved
  // as "by deadline" comes back sorted by title.
  assert.equal(command.payload.sort, "due_asc");
  // NO conditions. The gesture was "keep what I am looking at", and the reader
  // was looking at all the work — inventing a filter here would store a view
  // that hides work they never asked to hide.
  assert.deepEqual(command.payload.filters, {});
  // The one command whose kernel branch asserts an EMPTY expected-version map.
  assert.deepEqual(command.expectedVersions, {});
});

test("an ungrouped view is stored with no grouping at all, never with the word", async () => {
  await openTasksCapturing();
  await choose("tasks-group", "none");
  await clickNamed("Save this view");
  const dialog = popover();
  await typeInto(
    dialog.querySelector<HTMLInputElement>("#saved-view-name")!,
    "Wszystko luzem",
  );
  await act(async () => {
    dialog.querySelector<HTMLButtonElement>("button[type=submit]")?.click();
  });

  // The contract spells ungrouped as the key being ABSENT. `"none"` is this
  // screen's word for it and the kernel has never heard of it, so sending it
  // is a rejection nobody can read.
  const command = lastCommand("savedView.create");
  assert.equal(
    "groupBy" in command.payload,
    false,
    "ungrouped was stored as a value instead of as no value",
  );
});

test("renaming and deleting act on the open view, at the version it is on", async () => {
  await openTasksCapturing();
  await choose("tasks-view", assigneeBoardViewId);
  await waitForCondition(
    () => managerTrigger("Rename") !== undefined,
    "an open view offers no way to rename it",
  );

  await clickNamed("Rename");
  const renameField =
    popover().querySelector<HTMLInputElement>("#saved-view-rename");
  assert.ok(renameField, "the rename form asks for no name");
  // Seeded with what the view is called, so renaming is an edit and not a
  // retype.
  assert.notEqual(renameField.value, "");
  await typeInto(renameField, "Moje, po osobie");
  await act(async () => {
    renameField
      .closest("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  const renamed = lastCommand("savedView.rename");
  assert.equal(renamed.payload.savedViewId, assigneeBoardViewId);
  assert.equal(renamed.payload.name, "Moje, po osobie");
  assert.equal(renamed.expectedVersions[assigneeBoardViewId], 2);
});

test("deleting arms first, and stops being armed when the view underneath changes", async () => {
  await openTasksCapturing();
  await choose("tasks-view", assigneeBoardViewId);
  await waitForCondition(
    () => managerTrigger("Delete view") !== undefined,
    "an open view offers no way to delete it",
  );

  // First click ARMS. The button says so, so the second click is never a
  // surprise.
  await clickNamed("Delete view");
  assert.ok(
    managerTrigger("Confirm delete"),
    "the delete button gave no sign it was armed",
  );
  assert.equal(
    issued.some((command) => command.name === "savedView.delete"),
    false,
    "the first click deleted the view outright",
  );

  // Switching views DISARMS it. On the surface this moved from, that reset
  // lived on a different control entirely — the view chip's own click handler —
  // so a rehome that took the button and left the reset would leave "Confirm
  // delete" armed across a switch, and one more click would delete the WRONG
  // view, successfully, with no error anywhere.
  await choose("tasks-view", "");
  await choose("tasks-view", assigneeBoardViewId);
  await waitForCondition(
    () => managerTrigger("Delete view") !== undefined,
    "the manager never came back after the view changed",
  );
  assert.equal(
    managerTrigger("Confirm delete"),
    undefined,
    "the armed delete survived a view switch and now points at another view",
  );

  await clickNamed("Delete view");
  await clickNamed("Confirm delete");
  const deleted = lastCommand("savedView.delete");
  assert.equal(deleted.payload.savedViewId, assigneeBoardViewId);
  assert.equal(deleted.expectedVersions[assigneeBoardViewId], 2);
});

test("the shape a reader lands on can be written back into the view they opened", async () => {
  await openTasksCapturing();
  await choose("tasks-view", assigneeBoardViewId);
  await waitForCondition(
    () => managerTrigger("Keep this shape") !== undefined,
    "an open view offers no way to store the shape on screen",
  );

  // Regroup and reorder inside the open view, then keep it. Until this, a view
  // could be opened as itself but never re-saved: the only `savedView.update`
  // the renderer sent carried `layout` alone, so a reader who regrouped a view
  // and came back found the old grouping — and nothing said so.
  await choose("tasks-group", "status");
  await choose("tasks-sort", "title");
  await clickNamed("Keep this shape");

  const command = lastCommand("savedView.update");
  assert.equal(command.payload.savedViewId, assigneeBoardViewId);
  assert.equal(command.payload.groupBy, "status");
  assert.equal(command.payload.sort, "title_asc");
  assert.equal(command.expectedVersions[assigneeBoardViewId], 2);
});

/* ── THE TABLE'S COLUMNS, AND HOW TIGHT THE ROWS ARE ──────────────────────
   The two device-local preferences that came off the work surface with the rest.
   They are not saved-view state and never reach the kernel, so they are asserted
   from the SCREEN rather than from a payload. */

const columnsTrigger = (): HTMLElement | undefined =>
  [...container.querySelectorAll<HTMLElement>("button")].find((button) =>
    (button.textContent ?? "").trim().startsWith("Columns ·"),
  );

const headings = (): string[] =>
  [...container.querySelectorAll("thead th")].map((cell) =>
    (cell.textContent ?? "").trim(),
  );

const openTable = async (): Promise<void> => {
  await openTasksCapturing();
  const table = [
    ...container.querySelectorAll<HTMLElement>("[data-layout]"),
  ].find((node) => node.dataset.layout === "table");
  assert.ok(table, "Tasks offers no table lens");
  await act(async () => {
    table.click();
  });
  await waitForCondition(
    () => container.querySelector("thead th") !== null,
    "the table lens never drew a heading",
  );
};

test("the table draws only the columns this view is set to, and never loses the title", async () => {
  await openTable();
  // Every built-in column, and the workspace's own field beside them — a field
  // column is the one thing the table could not offer before this, and the one
  // reason the choice could not simply be dropped when the older screen went.
  assert.deepEqual(headings(), [
    "Status",
    "Title",
    "Project",
    "Plan",
    "Deadline",
    "State",
    "Priority",
    "Owner",
    "Rodzaj pracy",
  ]);

  const trigger = columnsTrigger();
  assert.ok(trigger, "the table offers no way to choose its columns");
  await act(async () => {
    trigger.click();
  });
  const dialog = popover();

  // The title and the status shape are NOT on offer. The title is what a row
  // is, and the shape is the one mark rows are told apart by; a table that can
  // hide either draws rows nobody can read.
  const offered = [...dialog.querySelectorAll("label")].map((label) =>
    (label.textContent ?? "").trim(),
  );
  assert.equal(offered.includes("Title"), false);
  assert.equal(offered.includes("Status"), false);
  assert.ok(offered.includes("Owner"));

  const owner = [...dialog.querySelectorAll("label")].find(
    (label) => (label.textContent ?? "").trim() === "Owner",
  );
  await act(async () => {
    owner?.querySelector("input")?.click();
  });

  // Gone from the head AND from every row: a heading removed while the cells
  // stay puts every value in the wrong column, which no count can see.
  assert.equal(headings().includes("Owner"), false);
  const widths = new Set(
    [...container.querySelectorAll("tbody tr")].map(
      (row) => row.querySelectorAll("td").length,
    ),
  );
  assert.deepEqual(
    [...widths],
    [headings().length],
    "a row has a different number of cells than the head has columns",
  );

  // KEPT, not just applied. A choice that survives only as long as the window
  // is open is a choice the reader makes again every morning, and nothing on
  // screen tells them it was not stored.
  const kept: unknown = JSON.parse(
    localStorage.getItem("constellation.task-columns.all") ?? "null",
  );
  assert.ok(
    Array.isArray(kept) && !kept.includes("owner"),
    "the column turned off was not written down, so it is back at the next launch",
  );
});

test("a column choice belongs to the view it was made on", async () => {
  await openTable();
  await act(async () => {
    columnsTrigger()?.click();
  });
  const owner = [...popover().querySelectorAll("label")].find(
    (label) => (label.textContent ?? "").trim() === "Owner",
  );
  await act(async () => {
    owner?.querySelector("input")?.click();
  });
  assert.equal(headings().includes("Owner"), false);

  // Opening a stored view opens ITS columns, not the ones the reader was just
  // looking at. The choice is per view — a reader who narrows a view to
  // "waiting on somebody" wants the person column there and nowhere else.
  // The stored view opens as the BOARD it was saved as, so the table has to be
  // asked for again — which is itself the older guarantee, working.
  await choose("tasks-view", assigneeBoardViewId);
  await act(async () => {
    [...container.querySelectorAll<HTMLElement>("[data-layout]")]
      .find((node) => node.dataset.layout === "table")
      ?.click();
  });
  await waitForCondition(
    () => container.querySelector("thead th") !== null,
    "switching views left the table without a head",
  );
  assert.ok(
    headings().includes("Owner"),
    "the column turned off on one view followed the reader onto another",
  );
});

test("compact changes the spacing and nothing a reader can see", async () => {
  await openTasksCapturing();
  const surface = container.querySelector<HTMLElement>("[data-tasks-surface]");
  assert.ok(surface, "the Tasks surface has no element to carry the density");
  // Named, because a switch that stores a preference nothing reads is the
  // defect this repo has already shipped once: the attribute is what any
  // stylesheet answers.
  assert.equal(surface.dataset.density, "comfortable");

  await act(async () => {
    [...container.querySelectorAll<HTMLElement>("button")]
      .find((button) => (button.textContent ?? "").trim() === "Compact")
      ?.click();
  });
  assert.equal(surface.dataset.density, "compact");
  assert.equal(
    localStorage.getItem("constellation.surface-density.tasks"),
    "compact",
    "the choice was not kept, so it is gone the next time the window opens",
  );
});
