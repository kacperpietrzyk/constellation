import {
  useEffect,
  lazy,
  Suspense,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type {
  PrincipalId,
  ProjectId,
  RelationId,
  StrategicRecordId,
  TaskId,
  TaskStatusId,
} from "@constellation/contracts";
import { getHumanRecordKindDescriptor } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  searchGlobal,
  type DesktopSnapshot,
  type MutationFailure,
  type ProjectOverviewProjection,
  type SearchProjection,
  type UndoPreview,
} from "./client/workflow.js";
import type { SurfaceId } from "./client/wave2-fixtures.js";
import { Icon } from "./components/Icon.js";
import { ProjectCollection } from "./projects/ProjectCollection.js";
import type {
  ReclassificationDestination,
  ReclassificationLoad,
  ReclassificationPreview,
} from "./record/ProjectReclassificationDialog.js";
import type {
  ProjectCreateClassifierProps,
  SimilarCandidatesState,
} from "./projects/ProjectCreateClassifier.js";
import type { WorkContextKind } from "./record-narrative.js";
import type { SettingsCategoryId } from "./settings-categories.js";
import { LazySurfaceBoundary } from "./SurfaceLifecycleStates.js";
import type { DocumentEntityTargetKind } from "./document-entity-reference.js";
import { modifierLabel } from "./components/ShortcutsOverlay.js";
import { useListNavigation } from "./hooks/useListNavigation.js";
import { InlineState, Mark } from "./components/InlineState.js";
import { countLabel, formatDate, recordKindLabels } from "./i18n.js";

// Areas and initiatives, which used to live on the work surface. Lazy for the
// measured reason every panel on this screen is: Projects is an EAGER
// destination, so a static import would put the forms, the rows and their
// stylesheet into the first paint of everybody who never opens them. What stays
// on the hot path is this handle and one button.
const ProjectContextPanel = lazy(async () => ({
  default: (await import("./projects/ProjectContextPanel.js"))
    .ProjectContextPanel,
}));

const ProjectCreateClassifier = lazy(async () => ({
  default: (await import("./projects/ProjectCreateClassifier.js"))
    .ProjectCreateClassifier,
}));

const ProjectRichBody = lazy(() => import("./ProjectRichBody.js"));

const ProjectReclassificationDialog = lazy(async () => ({
  default: (await import("./record/ProjectReclassificationDialog.js"))
    .ProjectReclassificationDialog,
}));

// Wybór szablonu do zastosowania. Leniwy Z POWODU BUDŻETU, i to jest pomiar:
// ten moduł jest na ścieżce gorącej, a `InlinePopover` — mimo ośmiu konsumentów
// — nie jest na niej dzisiaj wcale (`grep -c InlinePopover dist/index.html` = 0,
// zmierzone przed tym lotem i po nim). Statyczny import wciągnąłby go tam wraz
// z portalem, obsługą ognisk i pozycjonowaniem, przy 1 304 B zapasu na całej
// ścieżce. Stała jest na poziomie MODUŁU, nie w ciele komponentu, więc nie
// dokłada ani jednego haka — a w tym pliku hak dopisany po warunkowym powrocie
// niżej wygasiłby cały ekran przy zielonych bramkach.
const ApplyTemplatePopover = lazy(async () => ({
  default: (await import("./projects/ApplyTemplatePopover.js"))
    .ApplyTemplatePopover,
}));

/* TEN WARIANT NIE DELEGUJE DO `SurfaceTitleBand`, I TO JEST POMIAR, NIE
   PRZEOCZENIE. Lot C2 raz go przepiął i cofnął po CZERWIENI bramki typografii
   nagłówków (`scripts/heading-typography.mjs`): ta bramka czyta LITERALNE
   `className="a b"` i z nich wylicza, które klasy jadą ZAWSZE razem — właśnie
   po to, żeby `.surface-header h1` (rozmiar i waga) pokrywało
   `.wave2-header h1`, które własnych deklaracji nie ma. Komponent, który skleja
   nazwę klasy w czasie działania (`surface-header ${modyfikator}`), nie zostawia
   w źródle ani jednego takiego literału, więc para `wave2-header` ↔
   `surface-header` z tej mapy WYPADA i bramka zażądała rozmiaru i wagi dwa razy,
   osobno dla `.wave2-header h1` i `h2`. Nota przy `coOccurringClasses` opisuje
   dokładnie ten mechanizm — „jeśli jedno wywołanie napisze `wave2-header` bez
   `surface-header`, para wypada".

   Alternatywy odrzucone: przekazywanie CAŁEJ listy klas z wołającego robi
   z `className` pułapkę (wołający, który zapomni `surface-header`, kompiluje się
   i gubi całe pasmo), a dopisanie `font-size`/`font-weight` do
   `.wave2-header h1, h2` byłoby KOPIĄ WARTOŚCI z `.surface-header h1` — w tym
   repozytorium nazwaną klasą defektu. Wariant z nadpisem i opisem zostaje więc
   napisany wprost, a wspólny slot akcji obsługuje sześć pozostałych ekranów. */
/* LEWA STRONA TEGO PASMA TO JEDEN WIERSZ, i to jest cała zmiana lotu L2 w tym
   pliku. Do niego wariant rysował TRZY wiersze — nadtytuł, tytuł i zdanie
   opisowe w jednym `<div>`-ie — przez co pasmo Projektów miało 44,9 px tam,
   gdzie każde inne ma 40 (zmierzone: stos 40–83,9 px, `title band projects
   stack STACKED rows=3`). Prototyp nie ma tu ani nadtytułu, ani zdania:
   `crumbbar("Projects", btn("New project"))` (`v3/app.js:1078`), a `.crumbs
   .cur` (`v3/app.css:292`) niesie `white-space: nowrap` — jedno nazwanie
   i akcja. Zdanie „Intended outcomes and the work behind them." tłumaczyło
   ekran w miejscu, w którym prototyp go NAZYWA (wpisy 5-1 i 5-3 rejestru
   przejścia).

   KLASA DALEJ JEST LITERAŁEM `"surface-header wave2-header"` i wariant DALEJ
   nie deleguje do `SurfaceTitleBand` — powód stoi wyżej i jest zmierzony
   (bramka typografii nagłówków czyta literalne `className`), a ten lot go nie
   unieważnia: zmienia się SKŁAD pasma, nie sposób, w jaki jego klasy trafiają
   do źródła. */
const SurfaceHeader = ({
  title,
  action,
}: {
  readonly title: string;
  readonly action?: React.ReactNode;
}) => (
  <header className="surface-header wave2-header">
    <h1 id="surface-title" tabIndex={-1}>
      {title}
    </h1>
    {action}
  </header>
);

export const TasksSurface = ({
  snapshot,
  selectedTaskId,
  busyTaskId,
  onOpenTask,
  onSelectTask,
  onCapture,
  onCreateTask,
  onSetStatus,
  onSetCompleted,
  onSetAssignment,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly selectedTaskId: TaskId | undefined;
  readonly busyTaskId: TaskId | undefined;
  readonly onOpenTask: (id: TaskId) => void;
  readonly onSelectTask: (id: TaskId) => void;
  readonly onCapture: () => void;
  readonly onCreateTask: (title: string) => Promise<boolean>;
  readonly onSetStatus: (id: TaskId, statusId: TaskStatusId) => void;
  readonly onSetCompleted: (id: TaskId, completed: boolean) => void;
  readonly onSetAssignment: (
    id: TaskId,
    principalId: PrincipalId | undefined,
  ) => void;
}) => {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase("pl-PL");
  const assignmentCandidates =
    snapshot.assignmentCandidates.kind === "ready"
      ? snapshot.assignmentCandidates.data.candidates
      : [];
  const filteredTasks = snapshot.tasks.filter((task) => {
    const matchesStatus =
      statusFilter === "all" || task.status.id === statusFilter;
    const matchesAssignee =
      assigneeFilter === "all" ||
      (assigneeFilter === "unassigned"
        ? task.assignment === undefined
        : task.assignment?.assigneePrincipalId === assigneeFilter);
    const searchable = [
      task.title,
      task.status.label,
      task.assignment?.displayName,
      task.sourceCaptureId ? "Quick Capture" : "Root Space",
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("pl-PL");
    return (
      matchesStatus &&
      matchesAssignee &&
      (normalizedQuery.length === 0 || searchable.includes(normalizedQuery))
    );
  });
  const filtersActive =
    normalizedQuery.length > 0 ||
    statusFilter !== "all" ||
    assigneeFilter !== "all";
  const resetFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setAssigneeFilter("all");
  };
  const taskNav = useListNavigation({
    itemCount: filteredTasks.length,
    onOpen: (index) => {
      const task = filteredTasks[index];
      if (task) onOpenTask(task.id);
    },
    onSelect: (index) => {
      const task = filteredTasks[index];
      if (task) onSelectTask(task.id);
    },
  });
  return (
    <div className="surface-scroll">
      <SurfaceHeader
        title="Tasks"
        action={
          <button className="secondary-button" onClick={onCapture}>
            <Icon name="capture" />
            <span>New task</span>
          </button>
        }
      />
      <section className="task-panel" aria-label="Task list">
        <header>
          <div>
            <h2>All tasks</h2>
            <span aria-live="polite">
              {filteredTasks.length}
              {filtersActive ? ` of ${snapshot.tasks.length}` : " in view"}
            </span>
          </div>
        </header>
        <form
          className="task-create-row"
          aria-label="New task"
          onSubmit={(event) => {
            event.preventDefault();
            const title = newTaskTitle.trim();
            if (title.length === 0 || creatingTask) return;
            setCreatingTask(true);
            void onCreateTask(title).then((created) => {
              setCreatingTask(false);
              if (created) setNewTaskTitle("");
            });
          }}
        >
          <label className="task-create-title">
            <span className="sr-only">New task title</span>
            <input
              type="text"
              value={newTaskTitle}
              maxLength={500}
              disabled={creatingTask}
              placeholder="Add a task — type a title and press Enter"
              onChange={(event) => setNewTaskTitle(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="secondary-button"
            disabled={creatingTask || newTaskTitle.trim().length === 0}
          >
            {creatingTask ? "Adding…" : "Add"}
          </button>
        </form>
        {snapshot.tasks.length === 0 ? (
          <InlineState
            title="No tasks yet"
            detail="Capture the first thought. The original stays linked to what it became."
            action={
              <button className="secondary-button" onClick={onCapture}>
                Open Quick Capture
              </button>
            }
          />
        ) : (
          <>
            <div className="task-control-strip" aria-label="Task filters">
              <label className="task-search-control">
                <Icon name="search" />
                <span className="sr-only">Search tasks</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by task, state or person"
                />
              </label>
              <label className="task-filter-control">
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  {snapshot.bootstrap.taskStatuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="task-filter-control">
                <span>Assignee</span>
                <select
                  value={assigneeFilter}
                  onChange={(event) => setAssigneeFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="unassigned">Unassigned</option>
                  {assignmentCandidates.map((candidate) => (
                    <option
                      key={candidate.principalId}
                      value={candidate.principalId}
                    >
                      {candidate.displayName}
                      {candidate.participantKind === "guest" ? " · guest" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {filtersActive && (
                <button
                  type="button"
                  className="task-reset-button"
                  onClick={resetFilters}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="task-column-head" aria-hidden="true">
              <span />
              <span>Task</span>
              <span>Status</span>
              <span>Assignee</span>
            </div>
            {filteredTasks.length === 0 ? (
              <InlineState
                title="No tasks in this view"
                detail="Change the filters, or clear them to see every task."
                action={
                  <button className="secondary-button" onClick={resetFilters}>
                    Clear filters
                  </button>
                }
              />
            ) : (
              <div className="task-list">
                {filteredTasks.map((task, index) => (
                  <div
                    key={task.id}
                    className={`task-row ${task.id === selectedTaskId ? "selected" : ""}`}
                  >
                    <button
                      className="task-check"
                      aria-label={
                        task.completionState === "completed"
                          ? `Reopen: ${task.title}`
                          : `Complete: ${task.title}`
                      }
                      aria-pressed={task.completionState === "completed"}
                      disabled={busyTaskId === task.id}
                      onClick={() =>
                        onSetCompleted(
                          task.id,
                          task.completionState !== "completed",
                        )
                      }
                    />
                    <button
                      className="task-copy"
                      type="button"
                      {...taskNav(index)}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey) onOpenTask(task.id);
                        else onSelectTask(task.id);
                      }}
                      onDoubleClick={() => onOpenTask(task.id)}
                    >
                      {/* `data-row-title`: zaczep na WIDOCZNY tytuł wiersza.
                          Ten sam tytuł stoi jeszcze w dwóch etykietach
                          `sr-only` niżej (Status of…, Assignee for…), więc
                          pomiar po `textContent` całego planu przechodzi nawet
                          wtedy, gdy widoczny napis został obcięty — sprawdzone
                          przez zepsucie. Test musi czytać ten węzeł. */}
                      <strong data-row-title="" title={task.title}>
                        {task.title}
                      </strong>
                      <span>
                        {[
                          task.sourceCaptureId
                            ? "From Quick Capture · original kept"
                            : "Root Space",
                          ...(task.dueAt === undefined
                            ? []
                            : [
                                `Due ${formatDate(
                                  task.dueAt,
                                  snapshot.bootstrap.workspace.timezone,
                                )}${
                                  task.completionState === "open" &&
                                  Date.parse(task.dueAt) < Date.now()
                                    ? " · overdue"
                                    : ""
                                }`,
                              ]),
                          ...(task.priority === undefined ||
                          task.priority === "normal"
                            ? []
                            : [
                                task.priority === "urgent"
                                  ? "Urgent"
                                  : task.priority === "high"
                                    ? "High priority"
                                    : "Low priority",
                              ]),
                        ].join(" · ")}
                      </span>
                    </button>
                    <label className="sr-only" htmlFor={`status-${task.id}`}>
                      Status of {task.title}
                    </label>
                    <span className="task-row-field">
                      <span aria-hidden="true">Status</span>
                      <select
                        id={`status-${task.id}`}
                        className="task-status"
                        value={task.status.id}
                        disabled={busyTaskId === task.id}
                        onChange={(event) =>
                          onSetStatus(
                            task.id,
                            event.target.value as TaskStatusId,
                          )
                        }
                      >
                        {snapshot.bootstrap.taskStatuses.map((status) => (
                          <option key={status.id} value={status.id}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </span>
                    <label className="sr-only" htmlFor={`assignee-${task.id}`}>
                      Assignee for {task.title}
                    </label>
                    <span className="task-row-field">
                      <span aria-hidden="true">Assignee</span>
                      <select
                        id={`assignee-${task.id}`}
                        className="task-assignee"
                        aria-label={`Assignee for ${task.title}`}
                        value={
                          task.assignment?.availability !== "active" &&
                          task.assignment
                            ? "unavailable-member"
                            : (task.assignment?.assigneePrincipalId ?? "")
                        }
                        disabled={
                          busyTaskId === task.id ||
                          snapshot.assignmentCandidates.kind !== "ready"
                        }
                        onChange={(event) =>
                          onSetAssignment(
                            task.id,
                            event.target.value === ""
                              ? undefined
                              : (event.target.value as PrincipalId),
                          )
                        }
                      >
                        <option value="">Unassigned</option>
                        {task.assignment?.availability !== "active" &&
                          task.assignment !== undefined && (
                            <option value="unavailable-member" disabled>
                              {task.assignment.availability === "former_member"
                                ? "Former member"
                                : "No access to the Space"}
                            </option>
                          )}
                        {assignmentCandidates.map((candidate) => (
                          <option
                            key={candidate.principalId}
                            value={candidate.principalId}
                          >
                            {candidate.displayName}
                            {candidate.participantKind === "guest"
                              ? " · guest"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};

/**
 * What the project record screen is filled with from this surface.
 *
 * Every entry is an operation that had the view the record screen replaces as
 * its ONLY home in the renderer. They are passed as nodes rather than moved,
 * because their state — which outcome is being edited, which template is
 * selected, which relation this session created — belongs to the surface and
 * following it upwards would have been a second refactor riding on this one.
 */
export interface ProjectRecordSlots {
  readonly actions: React.ReactNode;
  readonly body: React.ReactNode;
  /** Replaces the record's reading of the outcome while it is being written. */
  readonly outcomeEditor: React.ReactNode;
  readonly taskLinking: React.ReactNode;
  readonly onWriteOutcome: () => void;
}

export const ProjectsSurface = ({
  client,
  snapshot,
  selectedProjectId,
  activeProjectId,
  overview,
  relation,
  busy,
  onOpenProject,
  onSelectProject,
  onBackToProjects,
  onCreate,
  onCreateTaskInProject,
  onOpenOpportunityAuthoring,
  onOpenCapture,
  onLoadSimilarCandidates,
  onApplyTemplate,
  onUpdateOutcome,
  onSetLifecycle,
  onSetAttentionState,
  onRelate,
  onUnrelate,
  onEntityActivate,
  renderRecordScreen,
  contextRecord,
  selectedContextId,
  onSelectContext,
  onOpenContext,
  onReload,
  onFailure,
  reclassificationTargets,
  onPreviewReclassification,
  onApplyReclassification,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly selectedProjectId: ProjectId | undefined;
  readonly activeProjectId: ProjectId | undefined;
  readonly overview: ProjectOverviewProjection | undefined;
  readonly relation:
    | {
        readonly id: RelationId;
        readonly version: number;
        readonly taskId: TaskId;
      }
    | undefined;
  readonly busy: boolean;
  readonly onOpenProject: (id: ProjectId) => void;
  readonly onSelectProject: (id: ProjectId) => void;
  readonly onBackToProjects: () => void;
  readonly onCreate: (
    title: string,
    outcome: string | undefined,
    templateId?: string,
  ) => Promise<boolean>;
  readonly onCreateTaskInProject: ProjectCreateClassifierProps["onCreateTaskInProject"];
  readonly onOpenOpportunityAuthoring: () => void;
  readonly onOpenCapture: () => void;
  readonly onLoadSimilarCandidates: (
    input: Parameters<
      ProjectCreateClassifierProps["onLoadSimilarCandidates"]
    >[0],
  ) => Promise<SimilarCandidatesState>;
  readonly onApplyTemplate: (templateId: string) => void;
  readonly onUpdateOutcome: (outcome: string) => void;
  readonly onSetLifecycle: (lifecycle: "active" | "closed") => void;
  readonly onSetAttentionState: (
    attentionState: "current" | "waiting" | "parked",
  ) => void;
  readonly onRelate: (taskId: TaskId) => void;
  readonly onUnrelate: () => void;
  readonly onEntityActivate: (target: {
    readonly targetKind: DocumentEntityTargetKind;
    readonly targetId: string;
  }) => void;
  /** Renders the opened project. The caller builds the screen, because the two
   *  slices it needs — a record's comments and the activity stream — are a
   *  targeted fetch and a snapshot slice this surface never receives; the slots
   *  it is handed carry the operations whose state stayed here. Absent leaves
   *  the old detail flow in place rather than showing an empty record. */
  readonly renderRecordScreen?:
    ((slots: ProjectRecordSlots) => React.ReactNode) | undefined;
  readonly contextRecord?: React.ReactNode;
  /** Areas and initiatives, which live here now that the work surface is going.
   *  The selection is the SHELL's — picking one opens it in the inspector, the
   *  same drawer a project opens into — so this screen holds neither the state
   *  nor the write; it holds the panel that authors them. */
  readonly selectedContextId: string | undefined;
  readonly onSelectContext: (kind: WorkContextKind, id: string) => void;
  readonly onOpenContext: (
    kind: WorkContextKind,
    id: string,
    title: string,
  ) => void;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
  readonly reclassificationTargets: readonly {
    readonly id: StrategicRecordId;
    readonly kind: "area" | "initiative" | "opportunity";
    readonly title: string;
  }[];
  readonly onPreviewReclassification: (
    destination: ReclassificationDestination,
  ) => Promise<ReclassificationLoad>;
  readonly onApplyReclassification: (
    preview: ReclassificationPreview,
    destination: unknown,
  ) => Promise<
    | { readonly kind: "success"; readonly commandId: string }
    | { readonly kind: "failure"; readonly message: string }
  >;
}) => {
  const [creating, setCreating] = useState(false);
  const [reclassificationOpen, setReclassificationOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextCreateRequest, setContextCreateRequest] = useState<{
    readonly kind: "area" | "initiative";
    readonly nonce: number;
  }>();
  const [editing, setEditing] = useState(false);
  const createTriggerRef = useRef<HTMLButtonElement>(null);
  const [editedOutcome, setEditedOutcome] = useState(
    overview?.project.intendedOutcome ?? "",
  );
  useEffect(
    () => setEditedOutcome(overview?.project.intendedOutcome ?? ""),
    [overview],
  );
  const projects = snapshot.projects;
  const projectItems = projects.kind === "ready" ? projects.data.items : [];
  const projectTemplates = snapshot.bootstrap.projectTemplates ?? [];
  const activeTemplates = projectTemplates.filter(
    (template) => template.state !== "retired",
  );
  const fullView =
    activeProjectId !== undefined && overview?.project.id === activeProjectId;
  const unrelated = snapshot.tasks.filter(
    (task) => !overview?.relatedTasks.some((related) => related.id === task.id),
  );

  if (contextRecord !== undefined)
    return (
      <div className="surface-scroll project-surface">{contextRecord}</div>
    );

  // The record screen brings its own `<h1>`, its own way back and its own
  // verbs, so the surface header does not run for this view — two level-one
  // headings on one screen is not a styling difference, it is two records
  // according to the outline. The `.project-surface` wrapper stays either way:
  // the packaged smoke finds the create-a-project journey through it.
  //
  // The screen is RENDERED BY THE CALLER and filled from here. The two slices
  // it needs — a record's comments and the activity stream — are a targeted
  // fetch and a snapshot slice this surface never receives, while the four
  // operations that had this view as their only home (writing the outcome,
  // closing the project, applying a template, linking a task) keep their state
  // where it already was. Threading either one the other way would have moved
  // twelve props or lost four operations.
  if (fullView && renderRecordScreen !== undefined) {
    const lifecycleAction = (
      <button
        className="secondary-button compact"
        disabled={busy}
        key="lifecycle"
        onClick={() =>
          onSetLifecycle(
            overview.project.lifecycle === "active" ? "closed" : "active",
          )
        }
        type="button"
      >
        {overview.project.lifecycle === "active" ? "Close project" : "Reopen"}
      </button>
    );
    const templateApplied =
      overview.project.appliedTemplateId === undefined
        ? undefined
        : (projectTemplates.find(
            (template) => template.id === overview.project.appliedTemplateId,
          )?.name ?? "retired template");
    const appliable = activeTemplates.filter(
      (template) => template.id !== overview.project.appliedTemplateId,
    );
    return (
      <div className="surface-scroll project-surface">
        {renderRecordScreen({
          onWriteOutcome: () => setEditing(true),
          actions: (
            <>
              <label className="record-action-field">
                Portfolio
                <select
                  aria-label="Portfolio attention"
                  disabled={busy || overview.project.lifecycle === "closed"}
                  onChange={(event) =>
                    onSetAttentionState(
                      event.target.value as "current" | "waiting" | "parked",
                    )
                  }
                  value={overview.project.attentionState}
                >
                  <option value="current">Current</option>
                  <option value="waiting">Waiting</option>
                  <option value="parked">Parked</option>
                </select>
              </label>
              {!editing && !overview.project.needsReview && (
                <button
                  className="ghost-button"
                  onClick={() => setEditing(true)}
                  type="button"
                >
                  Edit outcome
                </button>
              )}
              {lifecycleAction}
              <button
                className="ghost-button"
                disabled={busy || overview.project.lifecycle !== "active"}
                onClick={() => setReclassificationOpen(true)}
                type="button"
              >
                Reclassify project
              </button>
              {templateApplied !== undefined && (
                <small>Template: {templateApplied}</small>
              )}
              {/* KROK POTWIERDZENIA ODCHODZI RAZEM Z KONTROLKĄ FORMULARZA
                  (lot D11, wpisy #51 i #55). Wybór szablonu wysyła JEDNĄ
                  komendę, a toast niesie działające Cofnij przez 8 s
                  (`RealApp.tsx:1332`, `refreshAfter` `:1546+`) — więc pomyłka
                  kosztuje jedno kliknięcie wstecz. Nazwa dostępna szła dotąd
                  z `sr-only` etykiety `<label for>`; dymek nie ma czego takiego,
                  więc niesie ją TREŚĆ wyzwalacza plus `panelLabel`. */}
              {appliable.length > 0 && (
                <Suspense fallback={null}>
                  <ApplyTemplatePopover
                    busy={busy}
                    onApplyTemplate={onApplyTemplate}
                    templates={appliable}
                  />
                </Suspense>
              )}
            </>
          ),
          outcomeEditor: editing ? (
            <form
              className="record-outcome-editor"
              onSubmit={(event) => {
                event.preventDefault();
                onUpdateOutcome(editedOutcome);
                setEditing(false);
              }}
            >
              <label className="sr-only" htmlFor="edited-project-outcome">
                Intended outcome
              </label>
              <textarea
                aria-describedby="project-outcome-check-in-guidance"
                id="edited-project-outcome"
                onChange={(event) => setEditedOutcome(event.target.value)}
                value={editedOutcome}
              />
              <p
                className="capacity-note"
                id="project-outcome-check-in-guidance"
              >
                Keep the durable result here. Put dated progress and the next
                checkpoint in a check-in.
              </p>
              <div className="capture-footer">
                <button
                  className="ghost-button"
                  onClick={() => setEditing(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={busy || editedOutcome.trim() === ""}
                  type="submit"
                >
                  Save outcome
                </button>
              </div>
            </form>
          ) : undefined,
          body:
            client === undefined ? undefined : (
              <Suspense
                fallback={
                  <section
                    aria-busy="true"
                    className="project-rich-body reading-panel"
                  >
                    <p className="capacity-note">
                      Opening the project document…
                    </p>
                  </section>
                }
              >
                <ProjectRichBody
                  client={client}
                  onEntityActivate={onEntityActivate}
                  project={overview.project}
                  snapshot={snapshot}
                />
              </Suspense>
            ),
          // Linking a task to the project had this view as its only home in the
          // whole renderer — `relateTask`/`unrelateTask` are called from
          // nowhere else — so it travels with the screen rather than being
          // dropped as a finishing touch.
          taskLinking:
            relation !== undefined || unrelated[0] !== undefined ? (
              <div className="record-task-linking">
                {relation ? (
                  <button
                    className="secondary-button compact"
                    disabled={busy}
                    onClick={onUnrelate}
                    type="button"
                  >
                    Remove last link
                  </button>
                ) : (
                  <button
                    className="secondary-button compact"
                    disabled={busy}
                    onClick={() => onRelate(unrelated[0]!.id)}
                    type="button"
                  >
                    Link “{unrelated[0]!.title}”
                  </button>
                )}
              </div>
            ) : undefined,
        })}
        {reclassificationOpen && (
          <Suspense fallback={null}>
            <ProjectReclassificationDialog
              projectId={overview.project.id}
              projectTitle={overview.project.title}
              targets={reclassificationTargets}
              onClose={() => setReclassificationOpen(false)}
              onPreview={onPreviewReclassification}
              onApply={onApplyReclassification}
            />
          </Suspense>
        )}
      </div>
    );
  }

  return (
    <div className="surface-scroll project-surface">
      <SurfaceHeader
        title={fullView ? overview.project.title : "Projects"}
        action={
          <div className="project-header-actions">
            {fullView && (
              <button
                type="button"
                className="ghost-button"
                onClick={onBackToProjects}
              >
                <span>Back to projects</span>
              </button>
            )}
            {!fullView && (
              <button
                aria-controls={
                  contextOpen ? "project-context-panel" : undefined
                }
                aria-expanded={contextOpen}
                className="ghost-button"
                onClick={() => setContextOpen((value) => !value)}
                type="button"
              >
                <span>
                  {contextOpen ? "Hide context" : "Areas and initiatives"}
                </span>
              </button>
            )}
            {/* WPIS 5-2 OGONA FAZY III — USTERKA, NIE ROZJAZD STYLU.
                Spis powszechny bramki po WSZYSTKICH piętnastu zadeklarowanych
                ekranach: siedem akcji tworzących w paśmie kolekcji, sześć
                `primary-button` (`New opportunity`, `New organization`,
                `New person`, `New renewal`, `New task`, `New note`), a ta
                jedna — `secondary-button`. Prototyp maluje ją akcentem tak
                samo jak pozostałe: `btn("New project", { cls: "primary",
                icon: "plus" })` (`v3/screens/projects.js:343`). Czyli jeden
                ekran kolekcji mówił innym głosem niż pięć pozostałych, a
                pasmo Projektów niosło DWA przyciski (`ghost` + `secondary`)
                i ani jednego akcentu tam, gdzie każdy sąsiad ma jeden
                akcentowy.

                `Cancel` ZOSTAJE DRUGORZĘDNY, i to jest ta sama reguła, nie
                wyjątek od niej: akcent należy do akcji, która TWORZY, a nie do
                przełącznika, który zamyka formularz — kontrakt daje pojemnikowi
                dokładnie jedną akcję z wypełnieniem akcentu. Trzeciego
                przycisku w tym paśmie NIE MA: `Cancel` i `New project` to
                jeden i ten sam węzeł w dwóch stanach, więc na ekranie nigdy
                nie stoją obok siebie. */}
            <button
              ref={createTriggerRef}
              type="button"
              /* DEKLARACJA, NIE KLASA I NIE KOLEJNOŚĆ. Spakowany smoke sięgał tu
                 po `.secondary-button` i przez to KODOWAŁ wadę wpisu 5-2; po jej
                 naprawie krok przestał trafiać. Przepięcie na `aria-expanded`
                 też było za słabe: w tym samym paśmie stoi DRUGI przycisk z tym
                 atrybutem (przełącznik kontekstu wyżej), więc `querySelector`
                 brał tamten i otwierał panel zamiast formularza. To jest ta sama
                 konwencja, którą niosą `data-surface` i `data-task-row`. */
              data-project-create
              className={creating ? "secondary-button" : "primary-button"}
              aria-expanded={creating}
              aria-controls={creating ? "project-create-classifier" : undefined}
              onClick={() => setCreating((value) => !value)}
            >
              <Icon name={creating ? "close" : "capture"} />
              <span>{creating ? "Cancel" : "Add work"}</span>
            </button>
          </div>
        }
      />
      {contextOpen && !fullView && (
        <div id="project-context-panel">
          <LazySurfaceBoundary label="Areas and initiatives">
            {/* Empty fallback on purpose: a spinner where a small panel is about
                to be is more movement than the wait it reports. */}
            <Suspense fallback={null}>
              <ProjectContextPanel
                client={client}
                onFailure={onFailure}
                onReload={onReload}
                onSelectContext={onSelectContext}
                onOpenContext={onOpenContext}
                selectedContextId={selectedContextId}
                snapshot={snapshot}
                {...(contextCreateRequest === undefined
                  ? {}
                  : { requestedCreate: contextCreateRequest })}
              />
            </Suspense>
          </LazySurfaceBoundary>
        </div>
      )}
      {creating && (
        <LazySurfaceBoundary label="Create work">
          <Suspense fallback={null}>
            <ProjectCreateClassifier
              busy={busy}
              contexts={
                snapshot.work.kind === "ready"
                  ? [
                      ...snapshot.work.data.areas.map((area) => ({
                        id: area.id,
                        kind: "area" as const,
                        title: area.title,
                      })),
                      ...snapshot.work.data.initiatives.map((initiative) => ({
                        id: initiative.id,
                        kind: "initiative" as const,
                        title: initiative.title,
                      })),
                    ]
                  : []
              }
              onCancel={() => {
                setCreating(false);
                requestAnimationFrame(() => createTriggerRef.current?.focus());
              }}
              onCreateProject={({ title, intendedOutcome, templateId }) =>
                onCreate(title, intendedOutcome, templateId)
              }
              onCreateTaskInProject={onCreateTaskInProject}
              onLoadSimilarCandidates={onLoadSimilarCandidates}
              onOpenCapture={onOpenCapture}
              onOpenExistingAuthoring={(kind) => {
                if (kind === "opportunity") {
                  onOpenOpportunityAuthoring();
                  return;
                }
                setContextOpen(true);
                setContextCreateRequest({ kind, nonce: Date.now() });
              }}
              onOpenProject={onOpenProject}
              organizations={
                snapshot.relationships.kind === "ready"
                  ? snapshot.relationships.data.records
                      .filter((record) => record.kind === "organization")
                      .map((record) => ({ id: record.id, name: record.name }))
                  : []
              }
              projects={projectItems.map((project) => ({
                id: project.id,
                spaceId: project.spaceId,
                title: project.title,
                lifecycle: project.lifecycle,
                version: project.version,
              }))}
              {...(snapshot.bootstrap.spaces[0]?.id === undefined
                ? {}
                : { spaceId: snapshot.bootstrap.spaces[0].id })}
              templates={activeTemplates.map((template) => ({
                id: template.id,
                name: template.name,
              }))}
            />
          </Suspense>
        </LazySurfaceBoundary>
      )}
      {projects.kind === "unavailable" ? (
        <InlineState
          tone="warning"
          headingLevel="h2"
          title="The project list is unavailable"
          detail={projects.message}
        />
      ) : projectItems.length === 0 ? (
        <InlineState
          headingLevel="h2"
          title="No projects yet"
          detail="Create a project and name the outcome that tells you it is done."
        />
      ) : fullView ? (
        /* The record could not be assembled — the opened project is not in
           `project.list`, so its health has nothing to be read from. Said
           plainly rather than degraded into a thinner record: a screen
           missing half its reading looks like a screen, and this is a read
           that did not land. */
        <InlineState
          tone="warning"
          headingLevel="h2"
          title="This project could not be opened"
          detail="Its record is not in the project list for this Space. Reload, or go back to the collection."
        />
      ) : (
        /* Kolekcja projektów: trzy soczewki nad jednym zbiorem, grupowane po
           WYLICZANYM zdrowiu. Powłoka — nagłówek i formularz zakładania —
           zostaje tutaj, bo to ona niesie zaczepy, po których paczkowany
           smoke znajduje ścieżkę zakładania projektu. */
        <ProjectCollection
          snapshot={snapshot}
          selectedProjectId={selectedProjectId}
          onOpenProject={onOpenProject}
          onSelectProject={onSelectProject}
        />
      )}
    </div>
  );
};

const searchResultsCountLabel = (count: number) => countLabel(count, "result");

export const SearchOverlay = ({
  client,
  snapshot,
  destinations,
  onClose,
  onOpenDestination,
  onNavigate,
}: {
  readonly client: ConstellationRendererClient;
  readonly snapshot: DesktopSnapshot;
  readonly destinations: readonly {
    readonly id: SurfaceId;
    readonly label: string;
    readonly shortcut?: string;
    /** Ustawiane, gdy cel otwiera TAFLĘ w kategorii Ustawień, a nie sam ekran.
     *  Paleta bierze cele z rejestru powierzchni, więc wycofanie celu zabiera
     *  mu wpis — a zakopanie dziennika nie ma prawa zmniejszyć jego
     *  osiągalności do „zapamiętaj, w której kategorii on leży". */
    readonly settingsCategory?: SettingsCategoryId;
  }[];
  readonly onClose: () => void;
  readonly onOpenDestination: (
    surface: SurfaceId,
    label: string,
    settingsCategory?: SettingsCategoryId,
  ) => void;
  readonly onNavigate: (
    surface: SurfaceId,
    recordId: string,
    recordKind: SearchProjection["items"][number]["recordKind"],
    title: string,
  ) => void;
}) => {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    | { readonly kind: "idle" | "loading" }
    | { readonly kind: "ready"; readonly data: SearchProjection }
    | { readonly kind: "error" }
  >({ kind: "idle" });
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const returnTargetRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const activeElement = document.activeElement;
    returnTargetRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null;
    dialog?.showModal();
    // Ognisko przenosimy TUTAJ, a nie atrybutem `autoFocus` na polu. React
    // stosuje `autoFocus` w commicie, czyli ZANIM ruszy ten efekt — więc linia
    // wyżej odczytywała jako „kto otworzył" już własne pole nakładki, a przy
    // zamknięciu oddawała ognisko elementowi, który sama właśnie usuwała.
    // Ognisko lądowało na `<body>`. `UndoDialog` w tym samym pliku robi to
    // od początku imperatywnie (`cancelRef.current?.focus()`) i dlatego działa.
    searchInputRef.current?.focus();
    return () => {
      dialog?.close();
      const returnTarget = returnTargetRef.current;
      if (returnTarget?.isConnected && !returnTarget.hasAttribute("disabled")) {
        returnTarget.focus({ preventScroll: true });
      }
    };
  }, []);
  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "loading" });
    let active = true;
    const timer = window.setTimeout(() => {
      void searchGlobal(client, snapshot, text)
        .then((data) => active && setState({ kind: "ready", data }))
        .catch(() => active && setState({ kind: "error" }));
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [client, query, searchAttempt, snapshot]);
  const results = state.kind === "ready" ? state.data.items : [];
  const commandResults = destinations.filter((item) =>
    item.label
      .toLocaleLowerCase("pl-PL")
      .includes(query.trim().toLocaleLowerCase("pl-PL")),
  );
  const optionCount = commandResults.length + results.length;
  const listboxVisible =
    state.kind === "idle" ||
    (state.kind === "ready" && optionCount > 0) ||
    (state.kind !== "ready" && commandResults.length > 0);
  useEffect(() => {
    document
      .getElementById(`search-option-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, optionCount]);
  const choose = (item: SearchProjection["items"][number] | undefined) => {
    if (!item) return;
    onNavigate(
      getHumanRecordKindDescriptor(item.recordKind).inspectorSurface,
      item.recordId,
      item.recordKind,
      item.title,
    );
    onClose();
  };
  const chooseIndex = (index: number) => {
    const command = commandResults[index];
    if (command !== undefined) {
      onOpenDestination(command.id, command.label, command.settingsCategory);
      onClose();
      return;
    }
    choose(results[index - commandResults.length]);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((value) =>
        Math.min(value + 1, commandResults.length + results.length - 1),
      );
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((value) => Math.max(value - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      chooseIndex(activeIndex);
    }
    if (event.key === "Escape") onClose();
  };
  return (
    <dialog
      ref={dialogRef}
      className="search-backdrop"
      aria-labelledby="search-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <section className="search-dialog">
        <h2 id="search-title" className="sr-only">
          Command palette and global search
        </h2>
        <div className="search-query">
          <Mark kind="search" />
          <label className="sr-only" htmlFor="global-search">
            Open a view, or search projects, tasks and captures
          </label>
          <input
            ref={searchInputRef}
            id="global-search"
            role="combobox"
            aria-expanded={listboxVisible}
            aria-controls={listboxVisible ? "search-listbox" : undefined}
            aria-activedescendant={
              listboxVisible && optionCount > 0
                ? `search-option-${activeIndex}`
                : undefined
            }
            aria-autocomplete="list"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="View, project, task, source…"
          />
          <kbd>Esc</kbd>
        </div>
        <p className="search-scope">
          Local index · {snapshot.bootstrap.workspace.name} · this workspace
          only
        </p>
        <p className="sr-only" role="status">
          {state.kind === "ready" || state.kind === "idle"
            ? searchResultsCountLabel(optionCount)
            : ""}
        </p>
        {listboxVisible ? (
          <div
            id="search-listbox"
            className={`search-results${state.kind === "idle" ? " search-command-list" : ""}`}
            role="listbox"
            aria-label={
              state.kind === "idle" ? "Navigation commands" : "Search results"
            }
          >
            {state.kind === "idle" && <p role="presentation">Open a view</p>}
            {commandResults.map((item, index) => (
              <button
                /* Klucz niesie TAKŻE kategorię: dwa cele mogą mieć ten sam
                   identyfikator powierzchni („Settings" i tafla „Activity"
                   w niej), a dwa identyczne klucze Reacta w liście to jedna
                   pozycja, która czasem znika. */
                key={`command:${item.id}:${item.settingsCategory ?? ""}`}
                id={`search-option-${index}`}
                type="button"
                tabIndex={-1}
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? "active" : ""}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseIndex(index)}
              >
                <Mark kind="command" />
                <span>
                  <strong>{item.label}</strong>
                  <small>Navigation command</small>
                </span>
                <em>
                  {item.shortcut !== undefined
                    ? `${modifierLabel}${item.shortcut}`
                    : "↵"}
                </em>
              </button>
            ))}
            {results.map((item, index) => (
              <button
                key={`${item.recordKind}-${item.recordId}`}
                id={`search-option-${index + commandResults.length}`}
                type="button"
                tabIndex={-1}
                role="option"
                aria-selected={index + commandResults.length === activeIndex}
                className={
                  index + commandResults.length === activeIndex ? "active" : ""
                }
                onMouseEnter={() =>
                  setActiveIndex(index + commandResults.length)
                }
                onClick={() => choose(item)}
              >
                <Mark kind={item.recordKind} />
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {recordKindLabels[item.recordKind] ?? item.recordKind} ·{" "}
                    {item.matchedFields.includes("body") ? "Body · " : ""}
                    {item.snippet}
                  </small>
                </span>
              </button>
            ))}
          </div>
        ) : state.kind === "loading" ? (
          <div className="search-empty" aria-busy="true">
            <strong>Searching…</strong>
            <span>Checking projects, tasks and captures.</span>
          </div>
        ) : state.kind === "error" ? (
          <div className="search-empty" role="alert">
            <strong>Search is unavailable</strong>
            <span>
              The local index could not answer. Your data is unchanged.
            </span>
            <div className="search-empty-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  searchInputRef.current?.focus();
                  setSearchAttempt((attempt) => attempt + 1);
                }}
              >
                Try again
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  searchInputRef.current?.focus();
                  setQuery("");
                  setActiveIndex(0);
                }}
              >
                Clear the query
              </button>
            </div>
          </div>
        ) : (
          <div className="search-empty">
            <strong>No results for “{query}”</strong>
            <span>Check the spelling, or try a broader term.</span>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                searchInputRef.current?.focus();
                setQuery("");
                setActiveIndex(0);
              }}
            >
              Clear the query
            </button>
          </div>
        )}
        <footer>
          <span>↑↓ select</span>
          <span>↵ open</span>
          <span>Esc close</span>
          <span>{modifierLabel}/ shortcuts</span>
        </footer>
      </section>
    </dialog>
  );
};

const compensationCopy: Record<string, string> = {
  "project.restore_outcome": "Restore the previous project outcome",
  "project.restore_details": "Restore the previous project name and deadline",
  "task.restore_state": "Restore the previous task state",
  "task.restore_operational_state": "Restore the previous operational state",
  "work_link.restore_state": "Restore the previous work link",
  "relationship.restore_person": "Restore the previous person details",
  "relationship.restore_organization":
    "Restore the previous organization details",
  "workspace.restore_commercial_defaults":
    "Restore the previous pipeline stages and commercial defaults",
  "opportunity.restore_details": "Restore the previous opportunity details",
  "opportunity.restore_offer_details": "Restore the previous offer details",
  "relationship.restore_renewal_term":
    "Restore the previous contract term and follow-up",
  "relation.remove": "Remove the added relation",
  "relation.restore": "Restore the removed relation",
  "capture.undo_route": "Undo the capture routing",
  "capture.undo_knowledge_route": "Undo routing the capture to knowledge",
  "knowledge.restore_source": "Restore the previous source",
  "knowledge.restore_evidence": "Restore the previous evidence set",
  "knowledge.void_named_version": "Void the named version",
};

const unavailableReasonCopy: Record<string, string> = {
  unsupported: "This command cannot be undone",
  already_undone: "This command was already undone",
  later_change: "A later change blocks a safe undo",
  still_referenced: "Another record still references this",
};

export const UndoDialog = ({
  preview,
  busy,
  onClose,
  onConfirm,
}: {
  readonly preview: UndoPreview;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnTargetRef = useRef<HTMLElement | null>(null);
  const available =
    preview.recovery.available && preview.command.projection.available;
  useEffect(() => {
    const dialog = dialogRef.current;
    const activeElement = document.activeElement;
    returnTargetRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog?.close();
      const returnTarget = returnTargetRef.current;
      if (returnTarget?.isConnected && !returnTarget.hasAttribute("disabled")) {
        returnTarget.focus({ preventScroll: true });
      }
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="undo-backdrop"
      aria-labelledby="undo-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <section className="undo-dialog">
        <header>
          <div>
            <p className="eyebrow">Undo preview</p>
            <h2 id="undo-title">
              {available ? "Undo this change?" : "This change cannot be undone"}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close the undo preview"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <dl>
          <div>
            <dt>Command</dt>
            <dd className="mono">{preview.targetCommandId.slice(0, 18)}…</dd>
          </div>
          <div>
            <dt>Impact</dt>
            <dd>
              {countLabel(preview.recovery.affectedRecordIds.length, "record")}
            </dd>
          </div>
          <div>
            <dt>Compensation</dt>
            <dd>
              {preview.recovery.compensationKind !== undefined
                ? (compensationCopy[preview.recovery.compensationKind] ??
                  "Restore the previous state")
                : preview.recovery.unavailableReason !== undefined
                  ? (unavailableReasonCopy[
                      preview.recovery.unavailableReason
                    ] ?? "Unavailable")
                  : "Unavailable"}
            </dd>
          </div>
        </dl>
        <div className="undo-safety">
          <Mark kind={available ? "recovery" : "warning"} />
          <span>
            <strong>
              {available
                ? "Versions match"
                : "The state changed since the command"}
            </strong>
            <small>
              {available
                ? "The undo is written as its own auditable command."
                : "Nothing was changed."}
            </small>
          </span>
        </div>
        <footer>
          <button
            ref={cancelRef}
            className="ghost-button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={!available || busy}
            onClick={onConfirm}
          >
            {busy ? "Undoing…" : "Undo the change"}
          </button>
        </footer>
      </section>
    </dialog>
  );
};

export const failureMessage = (failure: MutationFailure): string =>
  failure.message;
