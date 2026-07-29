import {
  useEffect,
  lazy,
  Suspense,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type {
  CaptureId,
  CommandId,
  DocumentId,
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
import { NarrativeGap, NarrativeText } from "./components/RecordNarrative.js";
import { recordNarrativeGaps } from "./record-narrative.js";
import ProjectContextSections from "./ProjectContextSections.js";
import type { DocumentEntityTargetKind } from "./document-entity-reference.js";
import { modifierLabel } from "./components/ShortcutsOverlay.js";
import { useListNavigation } from "./hooks/useListNavigation.js";
import {
  countLabel,
  formatDate,
  formatDateTime,
  recordKindLabels,
} from "./i18n.js";

const Mark = ({ kind }: { readonly kind: string }) => (
  <span className={`record-mark mark-${kind}`} aria-hidden="true" />
);

const ProjectRichBody = lazy(() => import("./ProjectRichBody.js"));

const SurfaceHeader = ({
  kicker,
  title,
  description,
  action,
}: {
  readonly kicker: string;
  readonly title: string;
  readonly description: string;
  readonly action?: React.ReactNode;
}) => (
  <header className="surface-header wave2-header">
    <div>
      <p className="eyebrow">{kicker}</p>
      <h1 id="surface-title" tabIndex={-1}>
        {title}
      </h1>
      <p>{description}</p>
    </div>
    {action}
  </header>
);

// Tone separates a benign empty ("no open work this week") from a genuine
// warning. Amber is reserved for warnings only (tokens.md), so the default is
// neutral: a forgotten tone degrades to calm, never a false alarm.
type InlineStateTone = "neutral" | "info" | "warning";

const InlineState = ({
  title,
  detail,
  action,
  tone = "neutral",
  headingLevel = "h3",
}: {
  readonly title: string;
  readonly detail: string;
  readonly action?: React.ReactNode;
  readonly tone?: InlineStateTone;
  readonly headingLevel?: "h2" | "h3";
}) => {
  const Heading = headingLevel;
  return (
    <div
      className={`empty-state empty-state--${tone}`}
      role={tone === "warning" ? "alert" : "status"}
    >
      <span className="empty-glyph">
        <Mark
          kind={
            tone === "warning" ? "warning" : tone === "info" ? "info" : "empty"
          }
        />
      </span>
      <div>
        <Heading>{title}</Heading>
        <p>{detail}</p>
      </div>
      {action}
    </div>
  );
};

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
        kicker="Root Space · local view"
        title="Tasks"
        description="Captured actions, their state and the kept sources."
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

export const ProjectsSurface = ({
  client,
  snapshot,
  selectedProjectId,
  activeProjectId,
  overview,
  relation,
  clientCandidates,
  linkedClientIds,
  busy,
  onOpenProject,
  onSelectProject,
  onBackToProjects,
  onCreate,
  onApplyTemplate,
  onUpdateOutcome,
  onSetLifecycle,
  onRelate,
  onUnrelate,
  onLinkClient,
  onUnlinkClient,
  onOpenDocument,
  onOpenMeeting,
  onOpenRelationship,
  onEntityActivate,
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
  // Resolved by the caller, not here: which Organizations may be offered and
  // which are already directly linked are both kernel preconditions, and this
  // surface stays free of kernel semantics like every other verb on it.
  readonly clientCandidates:
    | readonly { readonly id: StrategicRecordId; readonly name: string }[]
    | undefined;
  readonly linkedClientIds: ReadonlySet<string>;
  readonly busy: boolean;
  readonly onOpenProject: (id: ProjectId) => void;
  readonly onSelectProject: (id: ProjectId) => void;
  readonly onBackToProjects: () => void;
  readonly onCreate: (
    title: string,
    outcome: string | undefined,
    templateId?: string,
  ) => Promise<boolean>;
  readonly onApplyTemplate: (templateId: string) => void;
  readonly onUpdateOutcome: (outcome: string) => void;
  readonly onSetLifecycle: (lifecycle: "active" | "closed") => void;
  readonly onRelate: (taskId: TaskId) => void;
  readonly onUnrelate: () => void;
  readonly onLinkClient: (organizationId: StrategicRecordId) => void;
  readonly onUnlinkClient: (organizationId: StrategicRecordId) => void;
  readonly onOpenDocument: (id: DocumentId, title: string) => void;
  readonly onOpenMeeting: (id: StrategicRecordId) => void;
  readonly onOpenRelationship: (id: StrategicRecordId) => void;
  readonly onEntityActivate: (target: {
    readonly targetKind: DocumentEntityTargetKind;
    readonly targetId: string;
  }) => void;
}) => {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [newOutcome, setNewOutcome] = useState("");
  const [createTemplateId, setCreateTemplateId] = useState("");
  const [applyTemplateId, setApplyTemplateId] = useState("");
  const createTriggerRef = useRef<HTMLButtonElement>(null);
  const createTitleRef = useRef<HTMLInputElement>(null);
  const [editedOutcome, setEditedOutcome] = useState(
    overview?.project.intendedOutcome ?? "",
  );
  useEffect(
    () => setEditedOutcome(overview?.project.intendedOutcome ?? ""),
    [overview],
  );
  useEffect(() => {
    if (creating) createTitleRef.current?.focus();
  }, [creating]);
  const projects = snapshot.projects;
  const projectItems = projects.kind === "ready" ? projects.data.items : [];
  const projectTemplates = snapshot.bootstrap.projectTemplates ?? [];
  const activeTemplates = projectTemplates.filter(
    (template) => template.state !== "retired",
  );
  const fullView =
    activeProjectId !== undefined && overview?.project.id === activeProjectId;
  const projectNav = useListNavigation({
    itemCount: projectItems.length,
    onOpen: (index) => {
      const project = projectItems[index];
      if (project) onOpenProject(project.id);
    },
    onSelect: (index) => {
      const project = projectItems[index];
      if (project) onSelectProject(project.id);
    },
  });
  const unrelated = snapshot.tasks.filter(
    (task) => !overview?.relatedTasks.some((related) => related.id === task.id),
  );
  return (
    <div className="surface-scroll project-surface">
      <SurfaceHeader
        kicker="Projects · active"
        title={fullView ? overview.project.title : "Projects"}
        description={
          fullView
            ? "The intended outcome, lifecycle and work in this project."
            : "Intended outcomes and the work behind them."
        }
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
            <button
              ref={createTriggerRef}
              type="button"
              className="secondary-button"
              aria-expanded={creating}
              aria-controls={creating ? "project-create-form" : undefined}
              onClick={() => setCreating((value) => !value)}
            >
              <Icon name={creating ? "close" : "capture"} />
              <span>{creating ? "Cancel" : "New project"}</span>
            </button>
          </div>
        }
      />
      {creating && (
        <form
          id="project-create-form"
          className="project-overview"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (title.trim()) {
              void onCreate(
                title,
                newOutcome.trim() === "" ? undefined : newOutcome,
                createTemplateId === "" ? undefined : createTemplateId,
              ).then((created) => {
                if (!created) return;
                setCreating(false);
                setTitle("");
                setNewOutcome("");
                setCreateTemplateId("");
                requestAnimationFrame(() => createTriggerRef.current?.focus());
              });
            }
          }}
        >
          <div className="overview-intent">
            <label htmlFor="project-title">Project name</label>
            <input
              ref={createTitleRef}
              id="project-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              required
            />
            <label htmlFor="project-outcome">Intended outcome (optional)</label>
            <textarea
              id="project-outcome"
              value={newOutcome}
              onChange={(event) => setNewOutcome(event.target.value)}
              maxLength={2_000}
              placeholder="How will you know the work is done? You can fill this in later."
            />
            {activeTemplates.length > 0 && (
              <>
                <label htmlFor="project-create-template">
                  Starting template (optional)
                </label>
                <select
                  id="project-create-template"
                  value={createTemplateId}
                  onChange={(event) => setCreateTemplateId(event.target.value)}
                >
                  <option value="">No template</option>
                  {activeTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
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
        <div className="project-detail-flow">
          <section
            className="project-overview"
            aria-labelledby="project-outcome-title"
          >
            <div className="overview-intent">
              <p className="eyebrow">Intended outcome</p>
              {editing ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    onUpdateOutcome(editedOutcome);
                  }}
                >
                  <label className="sr-only" htmlFor="edited-project-outcome">
                    Intended outcome
                  </label>
                  <textarea
                    id="edited-project-outcome"
                    value={editedOutcome}
                    onChange={(event) => setEditedOutcome(event.target.value)}
                  />
                  <div className="capture-footer">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setEditing(false)}
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
              ) : (
                <>
                  {overview.project.needsReview ? (
                    <>
                      {/* Nagłówek zostaje dostępną nazwą sekcji, ale nie udaje
                          treści, której nikt nie napisał. */}
                      <h2 id="project-outcome-title" className="sr-only">
                        {recordNarrativeGaps.project.field}
                      </h2>
                      <NarrativeGap
                        kind="project"
                        onWrite={() => setEditing(true)}
                      />
                    </>
                  ) : (
                    <h2 id="project-outcome-title">
                      {overview.project.intendedOutcome}
                    </h2>
                  )}
                  <div className="capture-footer">
                    {!overview.project.needsReview && (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setEditing(true)}
                      >
                        Edit outcome
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary-button compact"
                      disabled={busy}
                      onClick={() =>
                        onSetLifecycle(
                          overview.project.lifecycle === "active"
                            ? "closed"
                            : "active",
                        )
                      }
                    >
                      {overview.project.lifecycle === "active"
                        ? "Close project"
                        : "Reopen"}
                    </button>
                  </div>
                </>
              )}
              {(overview.project.appliedTemplateId !== undefined ||
                activeTemplates.some(
                  (template) =>
                    template.id !== overview.project.appliedTemplateId,
                )) && (
                <div className="project-template-row">
                  {overview.project.appliedTemplateId !== undefined && (
                    <small>
                      Template:{" "}
                      {projectTemplates.find(
                        (template) =>
                          template.id === overview.project.appliedTemplateId,
                      )?.name ?? "retired template"}
                    </small>
                  )}
                  {activeTemplates.some(
                    (template) =>
                      template.id !== overview.project.appliedTemplateId,
                  ) && (
                    <>
                      <label
                        className="sr-only"
                        htmlFor="project-apply-template"
                      >
                        Template to apply
                      </label>
                      <select
                        id="project-apply-template"
                        value={applyTemplateId}
                        disabled={busy}
                        onChange={(event) =>
                          setApplyTemplateId(event.target.value)
                        }
                      >
                        <option value="">Apply template…</option>
                        {activeTemplates
                          .filter(
                            (template) =>
                              template.id !==
                              overview.project.appliedTemplateId,
                          )
                          .map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className="secondary-button compact"
                        disabled={busy || applyTemplateId === ""}
                        onClick={() => {
                          onApplyTemplate(applyTemplateId);
                          setApplyTemplateId("");
                        }}
                      >
                        Apply
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
          {client !== undefined && (
            <Suspense
              fallback={
                <section
                  className="project-rich-body reading-panel"
                  aria-busy="true"
                >
                  <p className="capacity-note">Opening the project document…</p>
                </section>
              }
            >
              <ProjectRichBody
                client={client}
                snapshot={snapshot}
                project={overview.project}
                onEntityActivate={onEntityActivate}
              />
            </Suspense>
          )}
          <ProjectContextSections
            overview={overview}
            clientCandidates={clientCandidates}
            linkedClientIds={linkedClientIds}
            busy={busy}
            onLinkClient={onLinkClient}
            onUnlinkClient={onUnlinkClient}
            onOpenDocument={onOpenDocument}
            onOpenMeeting={onOpenMeeting}
            onOpenRelationship={onOpenRelationship}
          />
          <section
            className="project-work reading-panel"
            aria-labelledby="project-work-title"
          >
            <header className="section-heading">
              <div>
                <p className="eyebrow">Related work</p>
                <h2 id="project-work-title">Project tasks</h2>
              </div>
              {relation ? (
                <button
                  type="button"
                  className="secondary-button compact"
                  disabled={busy}
                  onClick={onUnrelate}
                >
                  Remove last link
                </button>
              ) : unrelated[0] ? (
                <button
                  type="button"
                  className="secondary-button compact"
                  disabled={busy}
                  onClick={() => onRelate(unrelated[0]!.id)}
                >
                  Link “{unrelated[0].title}”
                </button>
              ) : null}
            </header>
            {overview.relatedTasks.length === 0 ? (
              <p className="capacity-note">
                No tasks are linked to this project yet.
              </p>
            ) : (
              <div className="compact-record-list">
                {overview.relatedTasks.map((task) => (
                  <div key={task.id} className="compact-record">
                    <Mark kind="task" />
                    <span>
                      <strong>{task.title}</strong>
                      <small>Linked to this project</small>
                    </span>
                    <em>
                      {task.completionState === "completed"
                        ? "Completed"
                        : "Open"}
                    </em>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <section className="project-portfolio" aria-label="Project list">
          <header>
            <div>
              <h2>Project portfolio</h2>
              <span>{projectItems.length} in view</span>
            </div>
            <span>Outcome and open work</span>
          </header>
          <div className="project-list">
            {projectItems.map((project, index) => (
              <button
                type="button"
                className={`outcome-row ${project.id === selectedProjectId ? "selected" : ""}`}
                key={project.id}
                {...projectNav(index)}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey) onOpenProject(project.id);
                  else onSelectProject(project.id);
                }}
                onDoubleClick={() => onOpenProject(project.id)}
              >
                <Mark kind="project" />
                <span>
                  {/* Te same dwa zaczepy, co w wierszu zadania: pomiar musi
                      trafiać w WIDOCZNY tytuł i w WYRENDEROWANĄ intencję, a nie
                      w tekst całego planu. Intencja ma tu 1400-3000 znaków i
                      kilka akapitów — obcięcie jej w renderze jest właśnie tym
                      defektem, którego bogaty fixture pilnuje. */}
                  <strong data-row-title="">{project.title}</strong>
                  <small data-row-outcome="">
                    <NarrativeText
                      kind="project"
                      text={project.intendedOutcome}
                      needsReview={project.needsReview}
                    />
                  </small>
                </span>
                <em>{project.relatedOpenTaskCount} open</em>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export type HistoryCapture = DesktopSnapshot["captures"][number];

const captureKindLabel = (capture: HistoryCapture): string =>
  capture.original.kind === "text"
    ? "Text"
    : capture.original.kind === "url"
      ? "Link"
      : capture.original.kind === "screenshot"
        ? "Screenshot"
        : capture.original.kind === "managed_file"
          ? "Managed file"
          : capture.original.kind === "voice_note"
            ? "Voice note"
            : "File reference";

const captureResultLabel = (capture: HistoryCapture): string =>
  capture.processingState === "routed_as_task"
    ? "Task created"
    : capture.processingState === "routed_as_knowledge_source"
      ? "Knowledge source created"
      : capture.processingState === "needs_review"
        ? "Needs a decision"
        : capture.processingState === "awaiting_transcript"
          ? "Waiting for the transcript"
          : capture.processingState === "transcript_ready"
            ? capture.audioState === "retained"
              ? "Transcript ready · audio kept"
              : capture.audioState === "deleted"
                ? "Transcript ready · audio deleted"
                : "Transcript ready · deleting audio"
            : capture.processingState === "unclassified"
              ? "Kept without a classification"
              : "Waiting to be processed";

const captureCustodyLabel = (capture: HistoryCapture): string =>
  capture.original.kind === "managed_file" ||
  capture.original.kind === "screenshot" ||
  capture.original.kind === "voice_note"
    ? `Encrypted copy · ${Math.ceil(capture.original.payload.byteLength / 1024).toLocaleString("en-US")} KB · SHA-256 integrity`
    : "Local state confirmed";

export const CaptureHistoryDetail = ({
  capture,
  timezone,
  undoCommandId,
  busy,
  onUndo,
  onDeleteVoiceAudio,
}: {
  readonly capture: HistoryCapture;
  readonly timezone: string;
  readonly undoCommandId?: CommandId;
  readonly busy: boolean;
  readonly onUndo: (targetCommandId: CommandId) => void;
  readonly onDeleteVoiceAudio: (captureId: CaptureId, version: number) => void;
}) => (
  <div className="inspector-body capture-history-detail">
    <span className="record-status">
      <i />
      {captureResultLabel(capture)}
    </span>
    <h2>{capture.originalText}</h2>
    <p className="record-summary">
      {captureKindLabel(capture)} · saved{" "}
      {formatDateTime(capture.capturedAt, timezone)}
    </p>
    <section className="inspector-section provenance-block">
      <p className="section-label">Processing steps</p>
      <ol className="processing-timeline">
        <li className="done">
          <i />
          <div>
            <strong>Original saved</strong>
            <span>{captureCustodyLabel(capture)}</span>
          </div>
        </li>
        <li className="current">
          <i />
          <div>
            <strong>{captureResultLabel(capture)}</strong>
            <span>
              {capture.processingState === "transcript_ready"
                ? capture.transcript.text
                : capture.originalText}
            </span>
            {capture.processingState === "transcript_ready" && (
              <small>
                Written by {capture.transcript.writtenByKind} ·{" "}
                {formatDateTime(capture.transcript.writtenAt, timezone)}
                {capture.transcript.hostRunId
                  ? " · run " + capture.transcript.hostRunId
                  : ""}
              </small>
            )}
          </div>
        </li>
      </ol>
    </section>
    <section className="inspector-section capture-history-actions">
      <p className="section-label">Available actions</p>
      <button
        className="secondary-button"
        disabled={undoCommandId === undefined}
        title={
          undoCommandId === undefined
            ? "No reversible command for this Capture"
            : undefined
        }
        onClick={() => undoCommandId && onUndo(undoCommandId)}
      >
        Preview undo
      </button>
      {capture.processingState === "transcript_ready" &&
        capture.audioState === "retained" && (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => onDeleteVoiceAudio(capture.id, capture.version)}
          >
            {busy ? "Deleting…" : "Delete the kept audio"}
          </button>
        )}
    </section>
  </div>
);

export const HistorySurface = ({
  snapshot,
  selectedCaptureId,
  onSelectCapture,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly selectedCaptureId: CaptureId | undefined;
  readonly onSelectCapture: (captureId: CaptureId) => void;
}) => {
  const captureNav = useListNavigation({
    itemCount: snapshot.captures.length,
    onOpen: (index) => {
      const capture = snapshot.captures[index];
      if (capture) onSelectCapture(capture.id);
    },
    onSelect: (index) => {
      const capture = snapshot.captures[index];
      if (capture) onSelectCapture(capture.id);
    },
  });
  return (
    <div className="surface-scroll history-surface">
      <SurfaceHeader
        kicker="Kept originals"
        title="Capture history"
        description="What was processed stays checkable, and reversible when versions match."
      />
      {snapshot.captures.length === 0 ? (
        <InlineState
          headingLevel="h2"
          title="Capture history is empty"
          detail="The first Quick Capture will appear here with what it became."
        />
      ) : (
        <section className="history-ledger" aria-label="Kept captures">
          <header>
            <div>
              <h2>Kept originals</h2>
              <span>{countLabel(snapshot.captures.length, "capture")}</span>
            </div>
            <span>Select a row to see its steps</span>
          </header>
          <div className="history-list">
            {snapshot.captures.map((capture, index) => (
              <button
                type="button"
                className={`history-row${selectedCaptureId === capture.id ? " selected" : ""}`}
                key={capture.id}
                aria-pressed={selectedCaptureId === capture.id}
                {...captureNav(index)}
                onClick={() => onSelectCapture(capture.id)}
              >
                <Mark kind="capture" />
                <span className="history-row-copy">
                  <span>{captureKindLabel(capture)}</span>
                  <strong>{capture.originalText}</strong>
                  <small>{captureResultLabel(capture)}</small>
                </span>
                <time dateTime={capture.capturedAt}>
                  {formatDateTime(
                    capture.capturedAt,
                    snapshot.bootstrap.workspace.timezone,
                  )}
                </time>
              </button>
            ))}
          </div>
        </section>
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
  }[];
  readonly onClose: () => void;
  readonly onOpenDestination: (surface: SurfaceId, label: string) => void;
  readonly onNavigate: (surface: SurfaceId, recordId: string) => void;
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
    );
    onClose();
  };
  const chooseIndex = (index: number) => {
    const command = commandResults[index];
    if (command !== undefined) {
      onOpenDestination(command.id, command.label);
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
                key={`command:${item.id}`}
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
  "task.restore_state": "Restore the previous task state",
  "task.restore_operational_state": "Restore the previous operational state",
  "work_link.restore_state": "Restore the previous work link",
  "relationship.restore_person": "Restore the previous person details",
  "relationship.restore_organization":
    "Restore the previous organization details",
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
