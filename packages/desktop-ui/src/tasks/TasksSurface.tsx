import { Suspense, lazy, useMemo, useState, type ReactNode } from "react";

import type {
  FieldDefinitionId,
  TaskId,
  TaskStatusId,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import type {
  DesktopSnapshot,
  MutationFailure,
  SavedWorkViewFilterChange,
} from "../client/workflow.js";
import { Icon } from "../components/Icon.js";
import { useListNavigation } from "../hooks/useListNavigation.js";
import { useSurfaceDensity } from "../hooks/useSurfaceDensity.js";
import { countLabel, dateKeyInZone } from "../i18n.js";
import {
  LazySurfaceBoundary,
  SurfaceLoadingState,
} from "../SurfaceLifecycleStates.js";
import { SurfaceTitleBand } from "../SurfaceTitleBand.js";
import { TaskListLayout } from "./TaskListLayout.js";
import type { TaskColumnKey } from "./task-columns.js";
import { matchesSavedView, matchesSearch } from "./task-filters.js";
import {
  TASK_GROUPING_LABELS,
  TASK_LAYOUTS,
  TASK_LAYOUT_LABELS,
  TASK_SORT_LABELS,
  buildRows,
  groupTasks,
  groupingFromSavedView,
  sortFromSavedView,
  groupingMakesColumns,
  layoutFromSavedView,
  resolveBoardInterlock,
  sortRows,
  type TaskFieldDefinition,
  type TaskGroup,
  type TaskGroupBy,
  type TaskGrouping,
  type TaskLayout,
  type TaskProse,
  type TaskSort,
  type WorkSavedView,
} from "./task-view.js";
import styles from "./tasks.module.css";

// The list is the default lens and ships with the screen; the other four load
// when somebody switches to them. Tasks is an eager destination (⌘4), so
// everything statically imported here lands in the first paint — and four
// lenses nobody has opened yet, with four stylesheets, is not what the first
// paint is for. The size gate measures exactly this and refused the static
// version.
const TaskBoardLayout = lazy(async () => ({
  default: (await import("./TaskBoardLayout.js")).TaskBoardLayout,
}));
const TaskTableLayout = lazy(async () => ({
  default: (await import("./TaskTableLayout.js")).TaskTableLayout,
}));
const TaskTimelineLayout = lazy(async () => ({
  default: (await import("./TaskTimelineLayout.js")).TaskTimelineLayout,
}));
const TaskCalendarLayout = lazy(async () => ({
  default: (await import("./TaskCalendarLayout.js")).TaskCalendarLayout,
}));

// Lazy for the same reason and one more: the editor is reachable only with a
// saved view open, and its own stylesheet is 3.6 kB. Statically imported it
// would join the first paint of a screen most visits never edit a view on, and
// the hot-path budget this rebuild refuses to raise has no room for it.
const SavedViewFilterForm = lazy(async () => ({
  default: (await import("./SavedViewFilterForm.js")).SavedViewFilterForm,
}));

// Making, renaming and deleting a saved view — moved off the retired work
// surface. Lazy for the same measured reason as the form above it: Tasks is an
// eager destination, and the hot path has a few hundred bytes of gzip left.
const SavedViewManager = lazy(async () => ({
  default: (await import("./SavedViewManager.js")).SavedViewManager,
}));

// One collection of work, five lenses over it. The layout switcher changes how
// the same set is drawn and never what is in it — which is why filtering,
// grouping and sorting all live here and every layout is handed finished rows.
//
// Calendar is last in the switcher on purpose. It answers a narrower question
// than the Calendar destination — "when does THIS view's work fall" — and
// carries no meetings, because planning a week without them is not a thing
// this screen claims to do.

const GROUPINGS: readonly TaskGrouping[] = [
  "status",
  "project",
  "priority",
  "assignee",
  "none",
];
const SORTS: readonly TaskSort[] = ["manual", "due", "title"];

/** Layouts that group; the rest read a flat list. */
const GROUPED: ReadonlySet<TaskLayout> = new Set<TaskLayout>(["list", "board"]);

/**
 * How a field grouping is spelled as one `<option value>`.
 *
 * Decoded by TESTING for the prefix, never by an else-branch: an axis added to
 * the list above without touching the decoder would otherwise be read as a
 * field id with its first six characters cut off, and the kernel would refuse
 * the resulting view naming nothing.
 */
const FIELD_PREFIX = "field:";

const NO_FIELDS: readonly TaskFieldDefinition[] = [];

const groupingOptionValue = (grouping: TaskGroupBy): string =>
  typeof grouping === "object"
    ? `${FIELD_PREFIX}${grouping.fieldId}`
    : grouping;

const groupingFromOption = (value: string): TaskGroupBy => {
  if (!value.startsWith(FIELD_PREFIX)) return value as TaskGrouping;
  return { fieldId: value.slice(FIELD_PREFIX.length) as FieldDefinitionId };
};

export const TasksSurface = ({
  snapshot,
  selectedTaskId,
  activeTaskId,
  renderRecordScreen,
  onOpenTask,
  onSelectTask,
  onCreateTask,
  onSetStatus,
  onSetCompleted,
  onPlanOnDay,
  onOpenCalendar,
  onSaveViewFilters,
  client,
  onReload,
  onFailure,
}: {
  readonly snapshot: DesktopSnapshot;
  /** The row the INSPECTOR is showing. Selecting is not opening. */
  readonly selectedTaskId: TaskId | undefined;
  /** The task OPENED as a record — the shell's context id, which is a different
   *  fact from the selected one. Reading `selectedTaskId` here instead would
   *  promote a record on every single row click and there would be no way left
   *  to merely look at a task.
   *
   *  Optional because only the shell holds a shell context: a harness mounting
   *  this surface to exercise the collection has nothing to pass, and requiring
   *  it would make every such mount declare it opens no record. */
  readonly activeTaskId?: TaskId | undefined;
  /** Renders the opened task. The caller builds the screen, because the two
   *  slices it needs — the record's comments and the activity stream — are a
   *  targeted fetch and a snapshot slice this surface never receives. Absent
   *  while a task is open means the record could NOT be assembled, and the
   *  branch below says so rather than falling back to the collection under the
   *  wrong title. */
  readonly renderRecordScreen?: (() => ReactNode) | undefined;
  readonly onOpenTask: (id: TaskId) => void;
  readonly onSelectTask: (id: TaskId) => void;
  readonly onCreateTask: (title: string) => Promise<boolean>;
  readonly onSetStatus: (id: TaskId, statusId: TaskStatusId) => void;
  readonly onSetCompleted: (id: TaskId, completed: boolean) => void;
  /** Planning writes `startAt` and never touches `dueAt`: dragging onto a day
   *  means "I will start this on Wednesday", not "I promise it for
   *  Wednesday". The two are different facts and the gesture means the first. */
  readonly onPlanOnDay: (id: TaskId, dayKey: string) => void;
  readonly onOpenCalendar: () => void;
  /** Writes the edited conditions back and resolves true once the refreshed
   *  view is in hand. Optional because the write needs a client this screen
   *  does not hold, so the shell owns it — and the editor is drawn only when it
   *  is passed, since a Save that reaches nobody is worse than no Save. */
  readonly onSaveViewFilters?: (
    view: WorkSavedView,
    change: SavedWorkViewFilterChange,
  ) => Promise<boolean>;
  /** The three the view manager writes with. Optional together with the manager
   *  itself: a harness mounting this surface to exercise the collection has no
   *  client, and a Save that reaches nobody is worse than no Save. */
  readonly client?: ConstellationRendererClient | undefined;
  readonly onReload?: (() => Promise<void>) | undefined;
  readonly onFailure?: ((failure: MutationFailure) => void) | undefined;
}) => {
  const [layout, setLayout] = useState<TaskLayout>("list");
  const [grouping, setGrouping] = useState<TaskGroupBy>("status");
  const [sort, setSort] = useState<TaskSort>("manual");
  const [activeViewId, setActiveViewId] = useState<string>();
  const [search, setSearch] = useState("");
  // How tight the rows are, per device. It was the work surface's, keyed on the
  // literal "work"; the stored preference is read forward, not reset.
  const [density, setDensity] = useSurfaceDensity("tasks");

  const timeZone = snapshot.bootstrap.workspace.timezone;
  const work = snapshot.work;
  const projection = work.kind === "ready" ? work.data : undefined;
  const statuses = snapshot.bootstrap.taskStatuses;
  // One identity for the absent case, or the grouping memo recomputes on every
  // render of a workspace that has declared no fields at all.
  const fieldDefinitions = snapshot.bootstrap.fieldDefinitions ?? NO_FIELDS;

  const prose: TaskProse = useMemo(
    () => ({
      timeZone,
      todayKey: dateKeyInZone(new Date(), timeZone),
      snapshot,
    }),
    [snapshot, timeZone],
  );

  const activeView = projection?.savedViews.find(
    (view) => view.id === activeViewId,
  );

  // Which columns the TABLE draws, per saved view and per device — the columns
  // a workspace declares as fields included. Keyed on the view, exactly as it
  // was: a reader who narrows a view to "waiting on somebody" wants the person
  // column there and nowhere else.
  const taskFields = fieldDefinitions.filter(
    (definition) => definition.targetKind === "task",
  );
  // ONE piece of state, and deliberately nothing else. What a column is, how it
  // is stored and what this workspace can offer all live in `task-columns.ts`,
  // which is imported by the TABLE and by the CHOOSER — both lazy — and by
  // nothing on this screen. Tasks is an eager destination with a few hundred
  // bytes of hot path left, and the storage code is bigger than that.
  //
  // `undefined` means "not chosen this session", which is the reader's stored
  // choice, which is every column. Reset when the view changes, because the
  // choice belongs to the view.
  const [chosenColumns, setChosenColumns] =
    useState<readonly TaskColumnKey[]>();

  // A view SEEDS the lens; it does not hold it. Opening one draws the board it
  // was stored as, and the switcher is free the moment it is open — which is
  // also why this is done on the change and not derived every render: a lens
  // recomputed from the view would put the reader back where they started
  // every time they moved.
  //
  // Returning to "All work" leaves the lens where the reader left it. There is
  // no view saying anything, so there is nothing to seed from, and yanking
  // them back to a list would be this screen making a choice it was not asked
  // to make.
  const openView = (view: WorkSavedView | undefined): void => {
    setActiveViewId(view?.id);
    // The columns belong to the VIEW, so the session's choice does not follow
    // the reader across one. What the next view opens with is what they stored
    // for it.
    setChosenColumns(undefined);
    if (view === undefined) return;
    const seeded = groupingFromSavedView(view.groupBy);
    setGrouping(seeded);
    setSort(sortFromSavedView(view.sort));
    setLayout(layoutFromSavedView(view.layout, seeded, fieldDefinitions));
  };

  // The lens actually drawn, which is the chosen one except for the pair the
  // kernel refuses to store. Held as a DERIVED value rather than written back
  // into `layout`, so restoring a grouping restores the board the reader had
  // chosen instead of leaving them on the list they were pushed onto.
  const activeLayout = resolveBoardInterlock(
    layout,
    grouping,
    fieldDefinitions,
  );
  // Not `grouping === "none"`. A grouping that names a field this workspace no
  // longer offers makes exactly one column too, so the Board button has to be
  // refused on whether there are columns rather than on the word.
  const boardBlocked = !groupingMakesColumns(grouping, fieldDefinitions);

  const rows = useMemo(() => {
    if (projection === undefined) return [];
    const normalized = search.trim().toLocaleLowerCase("pl-PL");
    const built = buildRows(
      projection.tasks,
      statuses,
      projection.projects,
      prose,
    );
    const context = {
      timeZone,
      todayKey: prose.todayKey,
      now: new Date(),
      // ADR-045: relation filtering is NOT evaluated here. The kernel resolved
      // the view's conditions and sent the ids that satisfy them; this is a
      // membership test against that answer, never a walk of the relations.
      relationTaskIds:
        activeView?.relationTaskIds === undefined
          ? undefined
          : new Set<string>(activeView.relationTaskIds),
    };
    return sortRows(
      built.filter(
        (row) =>
          matchesSavedView(row, activeView, context) &&
          matchesSearch(row, normalized),
      ),
      sort,
    );
  }, [activeView, projection, prose, search, sort, statuses, timeZone]);

  const groups = useMemo(
    () =>
      groupTasks(
        rows,
        grouping,
        statuses,
        projection?.projects ?? [],
        // A status column must be drawn while empty or there is nothing to drop
        // onto, and moving the last card out would delete the column under the
        // cursor. A list is the opposite: an empty heading is noise.
        activeLayout === "board",
        fieldDefinitions,
      ),
    [
      activeLayout,
      fieldDefinitions,
      grouping,
      projection?.projects,
      rows,
      statuses,
    ],
  );

  // Flat index order, shared by every layout, so one roving tab stop survives a
  // layout switch instead of each lens inventing its own.
  const orderedRows = GROUPED.has(activeLayout)
    ? groups.flatMap((group) => group.rows)
    : rows;
  const itemProps = useListNavigation({
    itemCount: orderedRows.length,
    onOpen: (index) => {
      const row = orderedRows[index];
      if (row) onOpenTask(row.task.id);
    },
    onSelect: (index) => {
      const row = orderedRows[index];
      if (row) onSelectTask(row.task.id);
    },
  });

  const firstRowIndexOfGroup = (groupKey: string): number => {
    let index = 0;
    for (const group of groups) {
      if (group.key === groupKey) return index;
      index += group.rows.length;
    }
    return index;
  };

  const addToGroup = (group: TaskGroup): void => {
    void onCreateTask(`New task in ${group.label}`);
  };

  if (work.kind !== "ready")
    return (
      // Pasmo jest RODZEŃSTWEM przewijanego pudełka także w stanie awaryjnym —
      // patrz nota przy głównym zwrocie niżej. Gdyby ta gałąź trzymała stary
      // układ, chrom skakałby o 12 px dokładnie w chwili, w której ekran ma
      // powiedzieć, że czegoś nie dało się przeczytać.
      //
      // Pasmo rysuje `SurfaceTitleBand`, a nie gołe `<header>`: to jest ta sama
      // deklaracja, którą czyta `.work-surface:has(> .surface-header)`, i ten
      // sam komponent, co na wszystkich pozostałych ekranach fali.
      <>
        <SurfaceTitleBand title="Tasks" />
        <div className={`surface-scroll ${styles.tasks}`} data-tasks-surface>
          {/* The slice's OWN reason, not a sentence about the work plane in
              general (PR #232). `optionalProjection` names the query and the
              cause (`client/workflow.ts` — refusal code, contract issue, or the
              bridge failing), and that naming is the only diagnosis this build
              offers: `⌘⌥I` does not open DevTools here. A fixed sentence in its
              place throws away the whole of it. */}
          <p className={styles.unavailable} data-tasks-unavailable>
            {work.message}
          </p>
          {onReload !== undefined && (
            <button
              className="secondary-button"
              onClick={() => void onReload()}
              type="button"
            >
              Try again
            </button>
          )}
        </div>
      </>
    );

  // A task OPENED as a record takes the whole surface. The record brings its own
  // `<h1>` — and its own `id="surface-title"`, which the shell uses both as the
  // work plane's accessible name and as where focus lands after a destination
  // change — so the surface header does not run for this view. Two level-one
  // headings on one screen is not a styling difference, it is two records
  // according to the outline.
  //
  // The `.surface-scroll` wrapper and the `data-tasks-surface` hook stay either
  // way: they are how the shell scrolls this plane and how the packaged smoke
  // finds it.
  if (activeTaskId !== undefined)
    // TYLKO RAMIĘ Z PASMEM WYNOSI PASMO. Drugie ramię oddaje ekran rekordu,
    // który rysuje WŁASNY chrom — objęcie go tym fragmentem postawiłoby pasmo
    // ekranu Zadań nad pasmem rekordu, czyli dwa pasma jedno pod drugim.
    return renderRecordScreen === undefined ? (
      // The record could not be assembled — the opened task is not in the
      // work projection, so there is nothing to read it from. Said plainly
      // rather than degraded into a thinner record: a screen missing half
      // its reading still looks like a screen. The heading carries the id
      // the record would have carried, because the failure case is exactly
      // when a work plane with no name and no focus target is worst.
      <>
        <SurfaceTitleBand title="This task could not be opened" />
        <div className={`surface-scroll ${styles.tasks}`} data-tasks-surface>
          <p className={styles.unavailable}>
            It is not in the work projection for this Space. Reload, or go back
            to the task list.
          </p>
        </div>
      </>
    ) : (
      <div className={`surface-scroll ${styles.tasks}`} data-tasks-surface>
        {renderRecordScreen()}
      </div>
    );

  const planned = rows.filter((row) => row.planState !== "unplanned").length;

  // The axes the switcher names, then every choice field a task can carry. A
  // stored view may name a field this workspace has since retired or made
  // another type: the grouping still applies and puts every row under "No
  // value", so the switcher has to be able to SHOW what is in force rather
  // than standing blank on a value none of its options carry.
  const groupingValue = groupingOptionValue(grouping);
  const groupingOptions = [
    ...GROUPINGS.map((axis) => ({
      value: axis as string,
      label: TASK_GROUPING_LABELS[axis],
    })),
    ...fieldDefinitions
      .filter(
        (definition) =>
          definition.targetKind === "task" &&
          definition.state !== "retired" &&
          definition.type.kind === "choice",
      )
      .map((definition) => ({
        value: `${FIELD_PREFIX}${definition.id}`,
        label: definition.label,
      })),
  ];
  if (!groupingOptions.some((option) => option.value === groupingValue))
    groupingOptions.push({ value: groupingValue, label: "Stored field" });

  // The board is handed the WORD, not the axis, because the label table is
  // keyed by the five words and an object cannot key a `Record`:
  // `TASK_GROUPING_LABELS[{ fieldId }]` is `undefined` and drew an empty bold
  // where the axis should be named. Resolved here because this is where the
  // definitions are. A retired field still names itself — it still draws real
  // columns, the same stance `fieldOptions` takes — and only a field this
  // workspace no longer carries at all falls back to "These", the sentence that
  // is true of any non-status board. The drop rules do not read this: they read
  // the columns (`TaskBoardLayout.tsx:217-218`).
  const boardGroupingLabel =
    typeof grouping === "object"
      ? (fieldDefinitions.find(
          (definition) => definition.id === grouping.fieldId,
        )?.label ?? "These")
      : grouping === "none"
        ? "These"
        : TASK_GROUPING_LABELS[grouping];

  return (
    // PASMA SĄ RODZEŃSTWEM PRZEWIJANEGO PUDEŁKA, NIE JEGO DZIEĆMI — układ
    // prototypu (`v3/app.css:278-303`: `.crumbbar`, `.viewbar` i `.scroller` to
    // troje dzieci `.canvas`, a przewija się wyłącznie trzecie). Mechanizm stoi
    // w `styles.css` przy `.work-surface:has(> .surface-header)`; ekran zgłasza
    // się do niego TYM, że wynosi pasma na zewnątrz, a nie nazwą na liście.
    //
    // Fragment zamiast pojemnika jest tu WARUNKIEM, a nie stylem: pasma muszą
    // być bezpośrednimi dziećmi `.work-surface`, więc żaden dodatkowy element
    // nie może stanąć między nimi a nośnikiem.
    //
    // `data-density` ZOSTAJE NA PUDEŁKU, i to jest pomiar, nie odruch: czytają
    // go wyłącznie wiersze listy i komórki tabeli
    // (`task-list.module.css:237`, `task-table.module.css:388-389`), a te
    // wszystkie mieszkają w przewijanym pudełku. Na paśmie nie miałby czego
    // opisać.
    <>
      <SurfaceTitleBand
        action={
          /* THE SCREEN'S ACTION, WHICH THIS BAND DID NOT HAVE AT ALL (Phase C,
             lot C2). The prototype puts one here — `v3/screens/tasks.js:507-513`
             is `btn("New task", { cls: "primary", icon: "plus", act:
             "new-task" })` as the second argument of `crumbbar(crumbs, actions)`
             (`v3/app.js:677-683`), pushed to the band's end by
             `.crumbbar .spacer { flex: 1 }` (`v3/app.css:293`) and filled with
             the accent gradient (`v3/app.css:321-332`). The contract licenses
             exactly this: `.ui-craft/tokens.md`, "Accent rule" job 2 and "Usage
             constraints" 3 — the screen's action bar is a container that may own
             one accent-filled action.

             THIS SCREEN WAS THE ONE SUBJECT THE DIVERGENCE REGISTRY DID NOT
             HAVE. The title-band census found it on its own: the prototype's
             Tasks band carries "+ New task" and ours carried nothing, because
             creating a task went only through `addToGroup` below — an
             affordance that lives per group and names the group it lands in.
             That path stays; it answers a different question ("a task in THIS
             bucket") from the one the band answers ("a task on this screen").

             THE TITLE IS THE ONE THE GROUPED PATH ALREADY WRITES, minus the
             group: `addToGroup` sends "New task in <group label>" and there is
             no group here to name. */
          <button
            className="primary-button"
            onClick={() => void onCreateTask("New task")}
            type="button"
          >
            <Icon name="capture" />
            New task
          </button>
        }
        title="Tasks"
      />
      <div className={`view-band ${styles.viewbar}`}>
        <div
          className={styles.switcher}
          role="tablist"
          aria-label="Task layout"
        >
          {TASK_LAYOUTS.map((candidate) => (
            <button
              aria-describedby={
                candidate === "board" && boardBlocked
                  ? "tasks-board-requirement"
                  : undefined
              }
              aria-pressed={activeLayout === candidate}
              className={styles.switch}
              data-layout={candidate}
              disabled={candidate === "board" && boardBlocked}
              key={candidate}
              onClick={() => setLayout(candidate)}
              type="button"
            >
              {TASK_LAYOUT_LABELS[candidate]}
            </button>
          ))}
        </div>
        {boardBlocked && (
          <small className={styles.requirement} id="tasks-board-requirement">
            {typeof grouping === "object"
              ? "This view groups by a field the workspace no longer offers."
              : "Board needs a grouped view."}
          </small>
        )}

        <div className={styles.search}>
          <label className={styles.searchLabel} htmlFor="tasks-search">
            Search
          </label>
          <input
            id="tasks-search"
            onChange={(event) => setSearch(event.target.value)}
            type="search"
            value={search}
          />
        </div>

        <div className={styles.control}>
          <label htmlFor="tasks-view">View</label>
          <select
            id="tasks-view"
            onChange={(event) =>
              openView(
                projection?.savedViews.find(
                  (view) => view.id === event.target.value,
                ),
              )
            }
            value={activeViewId ?? ""}
          >
            <option value="">All work</option>
            {projection?.savedViews
              .filter((view) => view.state === "active")
              .map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
          </select>
        </div>

        {/* Editing lives beside the picker and only with a view open: there is
            nothing to edit on "All work", and a stored view is the only thing
            here that HAS conditions. Creating a view is not offered — that is
            on Work (`WorkSurface.tsx:675-768`) and is not duplicated. The
            fallback is empty on purpose; a spinner where a small button will be
            is more movement than the wait it reports. */}
        {/* Making and keeping a view, beside the picker that opens one. Drawn
            only with the three writes wired: a Save that reaches nobody is
            worse than no Save. Keyed on the view so the armed delete cannot
            survive a switch — the reset used to live on a different control,
            and one more click would have deleted the wrong view. */}
        {onReload !== undefined && onFailure !== undefined && (
          <LazySurfaceBoundary label="Saved views">
            <Suspense fallback={null}>
              <SavedViewManager
                client={client}
                chosenColumns={chosenColumns}
                density={density}
                fields={taskFields}
                grouping={grouping}
                key={activeView?.id ?? "all"}
                layout={activeLayout}
                onChooseColumns={setChosenColumns}
                onDensity={setDensity}
                onFailure={onFailure}
                onOpened={(savedViewId) =>
                  openView(
                    projection?.savedViews.find(
                      (candidate) => candidate.id === savedViewId,
                    ),
                  )
                }
                onReload={onReload}
                snapshot={snapshot}
                sort={sort}
                view={activeView}
                viewKey={activeView?.id ?? "all"}
              />
            </Suspense>
          </LazySurfaceBoundary>
        )}

        {activeView !== undefined && onSaveViewFilters !== undefined && (
          <LazySurfaceBoundary label="View filters">
            <Suspense fallback={null}>
              <SavedViewFilterForm
                onSave={(change) => onSaveViewFilters(activeView, change)}
                statuses={statuses}
                view={activeView}
              />
            </Suspense>
          </LazySurfaceBoundary>
        )}

        <div className={styles.control}>
          <label htmlFor="tasks-group">Group</label>
          <select
            id="tasks-group"
            onChange={(event) =>
              setGrouping(groupingFromOption(event.target.value))
            }
            value={groupingValue}
          >
            {groupingOptions.map((candidate) => (
              <option key={candidate.value} value={candidate.value}>
                {candidate.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.control}>
          <label htmlFor="tasks-sort">Sort</label>
          <select
            id="tasks-sort"
            onChange={(event) => setSort(event.target.value as TaskSort)}
            value={sort}
          >
            {SORTS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {TASK_SORT_LABELS[candidate]}
              </option>
            ))}
          </select>
        </div>

        <p aria-live="polite" className={styles.count} role="status">
          {countLabel(rows.length, "task")}
          <span className={styles.separator}>·</span>
          {planned} planned
        </p>
      </div>

      <div
        className={`surface-scroll ${styles.tasks}`}
        data-density={density}
        data-tasks-surface
      >
        {activeLayout === "list" ? (
          <TaskListLayout
            firstRowIndexOfGroup={firstRowIndexOfGroup}
            groups={groups}
            itemProps={itemProps}
            onAddToGroup={addToGroup}
            onOpen={onOpenTask}
            onSelect={onSelectTask}
            onToggleCompleted={onSetCompleted}
            prose={prose}
            selectedTaskId={selectedTaskId}
          />
        ) : (
          <LazySurfaceBoundary label={TASK_LAYOUT_LABELS[activeLayout]}>
            <Suspense
              fallback={
                <SurfaceLoadingState label={TASK_LAYOUT_LABELS[activeLayout]} />
              }
            >
              {activeLayout === "board" ? (
                <TaskBoardLayout
                  firstRowIndexOfGroup={firstRowIndexOfGroup}
                  groupingLabel={boardGroupingLabel}
                  groups={groups}
                  itemProps={itemProps}
                  onAddToGroup={addToGroup}
                  onMoveToStatus={onSetStatus}
                  onOpen={onOpenTask}
                  onSelect={onSelectTask}
                  prose={prose}
                  selectedTaskId={selectedTaskId}
                  // A field grouping is an object and never equals "project", so
                  // the test the board used to make on the union reads correctly
                  // on the wider type without narrowing it first.
                  showProjects={grouping !== "project"}
                />
              ) : activeLayout === "table" ? (
                <TaskTableLayout
                  chosenColumns={chosenColumns}
                  fields={taskFields}
                  itemProps={itemProps}
                  onOpen={onOpenTask}
                  onSelect={onSelectTask}
                  prose={prose}
                  rows={rows}
                  selectedTaskId={selectedTaskId}
                  viewKey={activeView?.id ?? "all"}
                />
              ) : activeLayout === "timeline" ? (
                <TaskTimelineLayout
                  itemProps={itemProps}
                  onOpen={onOpenTask}
                  onPlanOnDay={onPlanOnDay}
                  onSelect={onSelectTask}
                  prose={prose}
                  rows={rows}
                  selectedTaskId={selectedTaskId}
                />
              ) : activeLayout === "calendar" ? (
                <TaskCalendarLayout
                  itemProps={itemProps}
                  onOpen={onOpenTask}
                  onOpenCalendarDestination={onOpenCalendar}
                  onPlanOnDay={onPlanOnDay}
                  onSelect={onSelectTask}
                  prose={prose}
                  rows={rows}
                  selectedTaskId={selectedTaskId}
                />
              ) : null}
            </Suspense>
          </LazySurfaceBoundary>
        )}
      </div>
    </>
  );
};
