import {
  Fragment,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import type {
  PrincipalId,
  ProjectId,
  TaskId,
  TaskStatusId,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  createArea,
  createInitiative,
  createSavedWorkView,
  deleteSavedWorkView,
  renameSavedWorkView,
  setSavedWorkViewLayout,
  createWorkLink,
  setTaskOperationalState,
  type DesktopSnapshot,
  type MutationFailure,
} from "./client/workflow.js";
import {
  InlinePopover,
  reportFirstEmptyRequiredField,
} from "./components/InlinePopover.js";
import { useListNavigation } from "./hooks/useListNavigation.js";
import {
  countLabel,
  dateKeyInZone,
  formatDate,
  instantForZonedDate,
} from "./i18n.js";

import "./work-board.css";

export type WorkContextKind = "area" | "initiative";

const stateLabel = {
  actionable: "Do działania",
  waiting: "Czekam na",
  blocked: "Zablokowane",
} as const;

const WorkEmpty = ({
  title,
  detail,
  action,
}: {
  readonly title: string;
  readonly detail: string;
  readonly action?: ReactNode;
}) => (
  <div className="work-empty" role="status">
    <span className="empty-glyph" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <path d="M5 12h14" />
      </svg>
    </span>
    <div>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
    {action}
  </div>
);

export const WorkSurface = ({
  client,
  snapshot,
  selectedTaskId,
  selectedProjectId,
  selectedContextId,
  onSelectTask,
  onOpenTask,
  onSelectProject,
  onSelectContext,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly selectedTaskId: TaskId | undefined;
  readonly selectedProjectId: ProjectId | undefined;
  readonly selectedContextId: string | undefined;
  readonly onSelectTask: (id: TaskId) => void;
  readonly onOpenTask: (id: TaskId) => void;
  readonly onSelectProject: (id: ProjectId) => void;
  readonly onSelectContext: (kind: WorkContextKind, id: string) => void;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const work = snapshot.work;
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [openPopover, setOpenPopover] = useState<string>();
  const [waitingDraft, setWaitingDraft] = useState<Record<string, string>>({});
  const [waitingDirectionDraft, setWaitingDirectionDraft] = useState<
    Record<string, "waiting_on_them" | "we_owe">
  >({});
  const [waitingExpectedDraft, setWaitingExpectedDraft] = useState<
    Record<string, string>
  >({});
  const projection = work.kind === "ready" ? work.data : undefined;
  const [activeViewId, setActiveViewId] = useState<string>();
  const [viewFieldId, setViewFieldId] = useState("");
  const [confirmingViewDelete, setConfirmingViewDelete] = useState(false);
  const timeZone = snapshot.bootstrap.workspace.timezone;
  // The applied saved view is a deterministic client-side projection of the
  // already permission-safe work overview: same filters, same order, every
  // time. Week membership follows the workspace calendar.
  const activeView = projection?.savedViews.find(
    (view) => view.id === activeViewId,
  );
  const todayKey = dateKeyInZone(new Date(), timeZone);
  const weekdayIndex = (() => {
    try {
      const name = new Intl.DateTimeFormat("en", {
        timeZone,
        weekday: "short",
      }).format(new Date());
      return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name);
    } catch {
      return (new Date().getDay() + 6) % 7;
    }
  })();
  const dayKeyAt = (offset: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return dateKeyInZone(date, timeZone);
  };
  const weekStartKey = dayKeyAt(-Math.max(0, weekdayIndex));
  const weekEndKey = dayKeyAt(6 - Math.max(0, weekdayIndex));
  // ADR-045. Relation filtering is NOT evaluated here. The kernel resolves the
  // view's relation conditions and sends the Task ids that satisfy them; this
  // is a membership test against that answer, never a walk of the relation
  // graph. Re-deriving relations client-side would reopen the ADR-036 deferral
  // the kernel evaluator closed, and would let the desktop and an MCP operator
  // disagree about what the same saved view means.
  //
  // Absent means the view carries no relation condition; an empty array means
  // it carries one that nothing matched — those must not collapse together.
  const relationAllowList =
    activeView?.relationTaskIds === undefined
      ? undefined
      : new Set(activeView.relationTaskIds);
  const matchesActiveView = (
    task: NonNullable<typeof projection>["tasks"][number],
  ): boolean => {
    if (!activeView) return true;
    if (relationAllowList !== undefined && !relationAllowList.has(task.id))
      return false;
    const filters = activeView.filters;
    if (
      filters.operationalStates !== undefined &&
      !filters.operationalStates.includes(task.operationalState)
    )
      return false;
    if (filters.unassigned === true && task.assigneePrincipalId !== undefined)
      return false;
    if (
      filters.statusIds !== undefined &&
      !filters.statusIds.includes(task.statusId)
    )
      return false;
    if (
      filters.assigneePrincipalIds !== undefined &&
      (task.assigneePrincipalId === undefined ||
        !filters.assigneePrincipalIds.includes(task.assigneePrincipalId))
    )
      return false;
    if (
      filters.priorities !== undefined &&
      !filters.priorities.includes(task.priority ?? "normal")
    )
      return false;
    if (filters.scheduled !== undefined) {
      if (filters.scheduled !== (task.dueAt !== undefined)) return false;
    }
    if (filters.dueWindow !== undefined) {
      if (task.dueAt === undefined) return false;
      const dueKey = dateKeyInZone(task.dueAt, timeZone);
      if (filters.dueWindow === "overdue") {
        if (Date.parse(task.dueAt) >= Date.now()) return false;
      } else if (filters.dueWindow === "today") {
        if (dueKey !== todayKey) return false;
      } else if (dueKey < weekStartKey || dueKey > weekEndKey) return false;
    }
    for (const filter of filters.fields ?? []) {
      const value = task.fields?.[filter.fieldId];
      if (filter.predicate.kind === "set" && value === undefined) return false;
      if (filter.predicate.kind === "empty" && value !== undefined)
        return false;
      if (
        filter.predicate.kind === "choice_is" &&
        (value?.kind !== "choice" || value.value !== filter.predicate.option)
      )
        return false;
    }
    return true;
  };
  const priorityRank = { urgent: 3, high: 2, normal: 1, low: 0 } as const;
  const priorityLabels = {
    urgent: "Pilne",
    high: "Wysoki priorytet",
    normal: "Normalny priorytet",
    low: "Niski priorytet",
  } as const;
  const groupBy = activeView?.groupBy;
  const orderedTaskStatuses = snapshot.bootstrap.taskStatuses.toSorted(
    (left, right) => left.position - right.position,
  );
  // Group order is declared, never inferred: status position, priority rank,
  // or the definition's option order, with an explicit trailing "Bez
  // wartości" group. Grouping composes before the view's sort.
  const groupFor = (
    task: NonNullable<typeof projection>["tasks"][number],
  ): {
    readonly key: string;
    readonly rank: number;
    readonly label: string;
  } => {
    if (groupBy === "status") {
      const index = orderedTaskStatuses.findIndex(
        (status) => status.id === task.statusId,
      );
      return {
        key: index === -1 ? "status:historical" : `status:${task.statusId}`,
        rank: index === -1 ? Number.MAX_SAFE_INTEGER : index,
        label: orderedTaskStatuses[index]?.label ?? "Status historyczny",
      };
    }
    if (groupBy === "priority") {
      const priority = task.priority ?? "normal";
      return {
        key: `priority:${priority}`,
        rank: 3 - priorityRank[priority],
        label: priorityLabels[priority],
      };
    }
    if (groupBy !== undefined) {
      const definition = (snapshot.bootstrap.fieldDefinitions ?? []).find(
        (candidate) => candidate.id === groupBy.fieldId,
      );
      const value = task.fields?.[groupBy.fieldId];
      const options =
        definition?.type.kind === "choice" ? definition.type.options : [];
      const index =
        value?.kind === "choice" ? options.indexOf(value.value) : -1;
      return index === -1
        ? {
            key: "field:empty",
            rank: Number.MAX_SAFE_INTEGER,
            label: "Bez wartości",
          }
        : {
            key: `field:${options[index]!}`,
            rank: index,
            label: options[index]!,
          };
    }
    return { key: "all", rank: 0, label: "" };
  };
  const visibleTasks = (projection?.tasks ?? [])
    .filter(matchesActiveView)
    .toSorted((left, right) => {
      if (groupBy !== undefined) {
        const byGroup = groupFor(left).rank - groupFor(right).rank;
        if (byGroup !== 0) return byGroup;
      }
      if (activeView?.sort === "title_asc")
        return (
          left.title.localeCompare(right.title, "pl-PL") ||
          left.id.localeCompare(right.id)
        );
      if (activeView?.sort === "due_asc") {
        if (left.dueAt !== undefined || right.dueAt !== undefined) {
          if (left.dueAt === undefined) return 1;
          if (right.dueAt === undefined) return -1;
          const byDue = Date.parse(left.dueAt) - Date.parse(right.dueAt);
          if (byDue !== 0) return byDue;
        }
        const byPriority =
          priorityRank[right.priority ?? "normal"] -
          priorityRank[left.priority ?? "normal"];
        if (byPriority !== 0) return byPriority;
        return left.id.localeCompare(right.id);
      }
      return 0;
    });
  const declaredGroups = (() => {
    if (groupBy === "status") {
      return orderedTaskStatuses
        .map((status, index) => ({
          key: `status:${status.id}`,
          label: status.label,
          rank: index,
          state: status.state,
          statusId: status.id,
        }))
        .filter(
          (status) =>
            status.state !== "archived" ||
            visibleTasks.some((task) => task.statusId === status.statusId),
        );
    }
    if (groupBy === "priority") {
      return (["urgent", "high", "normal", "low"] as const).map(
        (priority, index) => ({
          key: `priority:${priority}`,
          label: priorityLabels[priority],
          rank: index,
        }),
      );
    }
    if (groupBy !== undefined) {
      const definition = (snapshot.bootstrap.fieldDefinitions ?? []).find(
        (candidate) => candidate.id === groupBy.fieldId,
      );
      return definition?.type.kind === "choice"
        ? definition.type.options.map((option, index) => ({
            key: `field:${option}`,
            label: option,
            rank: index,
          }))
        : [];
    }
    return [];
  })();
  const actualGroups = new Map<
    string,
    {
      readonly key: string;
      readonly label: string;
      readonly rank: number;
      readonly tasks: typeof visibleTasks;
    }
  >();
  for (const task of visibleTasks) {
    const group = groupFor(task);
    const current = actualGroups.get(group.key);
    if (current === undefined) {
      actualGroups.set(group.key, { ...group, tasks: [task] });
    } else {
      actualGroups.set(group.key, {
        ...current,
        tasks: [...current.tasks, task],
      });
    }
  }
  const taskGroups = [
    ...declaredGroups.map((group) => ({
      ...group,
      tasks: actualGroups.get(group.key)?.tasks ?? [],
    })),
    ...[...actualGroups.values()].filter(
      (group) => !declaredGroups.some((declared) => declared.key === group.key),
    ),
  ].toSorted((left, right) => left.rank - right.rank);
  const visibleTaskIndex = new Map(
    visibleTasks.map((task, index) => [task.id, index]),
  );
  const activeLayout =
    activeView?.layout === "board" && groupBy !== undefined ? "board" : "list";
  const taskNav = useListNavigation({
    itemCount: visibleTasks.length,
    onOpen: (index) => {
      const task = visibleTasks[index];
      if (task) onOpenTask(task.id);
    },
    onSelect: (index) => {
      const task = visibleTasks[index];
      if (task) onSelectTask(task.id);
    },
  });
  const activeLinks =
    projection?.links.filter((link) => link.state === "active") ?? [];
  const projectContext = useMemo(
    () =>
      new Map(
        activeLinks
          .filter((link) => link.linkType !== "task_depends_on_task")
          .map((link) => [
            link.sourceRecordId,
            link.linkType === "project_advances_initiative"
              ? projection?.initiatives.find(
                  (initiative) => initiative.id === link.targetRecordId,
                )?.title
              : projection?.areas.find(
                  (area) => area.id === link.targetRecordId,
                )?.title,
          ]),
      ),
    [activeLinks, projection],
  );

  // Busy state is a set of operation ids, so concurrent mutations stay
  // independent: a running operation disables only its own control and cannot
  // re-enable another one that is still in flight. Operation ids double as
  // popover ids, and success closes the popover only when it still belongs to
  // the finished operation — a popover opened in the meantime keeps its draft.
  // A rejected transport promise still lands in onFailure and never leaves the
  // surface stuck in a busy state.
  const run = async (
    id: string,
    operation: () => Promise<{ readonly kind: string }>,
  ): Promise<boolean> => {
    if (busyIds.has(id)) return false;
    setBusyIds((current) => new Set(current).add(id));
    try {
      const result = await operation();
      if (result.kind === "success") {
        await onReload();
        setOpenPopover((current) => (current === id ? undefined : current));
        return true;
      }
      onFailure(result as MutationFailure);
      return false;
    } catch {
      onFailure({
        kind: "unavailable",
        message:
          "Polecenie nie dotarło do warstwy danych. Nic nie zmieniono — spróbuj ponownie.",
      });
      return false;
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  if (projection === undefined) {
    return (
      <div className="surface-scroll work-surface">
        <header className="surface-header wave2-header">
          <div>
            <p className="eyebrow">Model pracy</p>
            <h1 id="surface-title" tabIndex={-1}>
              Praca
            </h1>
            <p>Odpowiedzialność, wyniki i następne działania w jednym wątku.</p>
          </div>
        </header>
        <WorkEmpty
          title="Widok pracy jest niedostępny"
          detail={
            work.kind === "unavailable" ? work.message : "Spróbuj ponownie."
          }
          action={
            <button
              type="button"
              className="secondary-button"
              onClick={() => void onReload()}
            >
              Spróbuj ponownie
            </button>
          }
        />
      </div>
    );
  }

  // Popover forms reset by unmounting, so run() closes the matching popover
  // (and resets the form) only after the mutation reports success; a failure
  // keeps the draft on screen.
  const submitArea = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const responsibility = String(data.get("responsibility") ?? "").trim();
    if (!client) return;
    if (!title || !responsibility) {
      reportFirstEmptyRequiredField(form);
      return;
    }
    await run("area", () =>
      createArea(client, snapshot, title, responsibility),
    );
  };
  const submitInitiative = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const outcome = String(data.get("outcome") ?? "").trim();
    if (!client) return;
    if (!title || !outcome) {
      reportFirstEmptyRequiredField(form);
      return;
    }
    await run("initiative", () =>
      createInitiative(client, snapshot, title, outcome),
    );
  };
  const submitView = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const state = String(data.get("state") ?? "");
    const statusId = String(data.get("statusId") ?? "");
    const priority = String(data.get("priority") ?? "");
    const dueWindow = String(data.get("dueWindow") ?? "");
    const assignee = String(data.get("assignee") ?? "");
    const fieldPredicate = String(data.get("fieldPredicate") ?? "");
    const relationProjectId = String(data.get("relationProjectId") ?? "");
    const group = String(data.get("groupBy") ?? "");
    const sort = String(data.get("sort") ?? "updated_desc") as
      "updated_desc" | "due_asc" | "title_asc";
    if (!client) return;
    if (!name) {
      reportFirstEmptyRequiredField(form);
      return;
    }
    await run("view", () =>
      createSavedWorkView(
        client,
        snapshot,
        name,
        {
          ...(state === ""
            ? {}
            : {
                operationalStates: [
                  state as "actionable" | "waiting" | "blocked",
                ],
              }),
          ...(statusId === "" ? {} : { statusIds: [statusId as TaskStatusId] }),
          ...(priority === ""
            ? {}
            : {
                priorities: [priority as "urgent" | "high" | "normal" | "low"],
              }),
          ...(dueWindow === ""
            ? {}
            : {
                dueWindow: dueWindow as "overdue" | "today" | "this_week",
              }),
          ...(assignee === ""
            ? {}
            : assignee === "unassigned"
              ? { unassigned: true }
              : { assigneePrincipalIds: [assignee as PrincipalId] }),
          // ADR-045. The condition goes to the kernel, which evaluates it; the
          // surface only names the project it wants.
          ...(relationProjectId === ""
            ? {}
            : {
                relationConditions: [
                  {
                    path: "project" as const,
                    predicate: {
                      field: "id" as const,
                      in: [relationProjectId as ProjectId],
                    },
                  },
                ],
              }),
          ...(viewFieldId === "" || fieldPredicate === ""
            ? {}
            : {
                fields: [
                  {
                    fieldId: viewFieldId,
                    predicate:
                      fieldPredicate === "set"
                        ? { kind: "set" as const }
                        : fieldPredicate === "empty"
                          ? { kind: "empty" as const }
                          : {
                              kind: "choice_is" as const,
                              option: fieldPredicate.slice("opt:".length),
                            },
                  },
                ],
              }),
        },
        sort,
        group === ""
          ? undefined
          : group === "status" || group === "priority"
            ? group
            : { fieldId: group.slice("field:".length) },
      ),
    ).then((created) => {
      if (created) setViewFieldId("");
    });
  };
  const submitProjectLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const projectId = String(data.get("projectId") ?? "");
    const target = String(data.get("target") ?? "");
    const [kind, targetId] = target.split(":");
    if (!client || !projectId || !targetId) return;
    await run("link-project", () =>
      createWorkLink(
        client,
        snapshot,
        kind === "initiative"
          ? "project_advances_initiative"
          : "project_serves_area",
        projectId,
        targetId,
      ),
    );
  };
  const submitDependency = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const taskId = String(data.get("taskId") ?? "");
    const dependencyId = String(data.get("dependencyId") ?? "");
    if (!client || !taskId || !dependencyId) return;
    if (taskId === dependencyId) {
      const field = form.elements.namedItem("dependencyId");
      if (field instanceof HTMLSelectElement) {
        field.setCustomValidity("Zadanie nie może zależeć od samego siebie.");
        field.reportValidity();
        field.addEventListener("change", () => field.setCustomValidity(""), {
          once: true,
        });
      }
      return;
    }
    await run("link-dependency", () =>
      createWorkLink(
        client,
        snapshot,
        "task_depends_on_task",
        taskId,
        dependencyId,
      ),
    );
  };
  const applyTaskState = (
    task: (typeof projection.tasks)[number],
    state: "actionable" | "waiting" | "blocked",
    waitingLabel?: string,
    waitingDetails?: {
      readonly direction?: "waiting_on_them" | "we_owe";
      readonly expectedAt?: string;
    },
  ) => {
    if (!client) return;
    void run(`state:${task.id}`, () =>
      setTaskOperationalState(
        client,
        snapshot,
        task,
        state,
        waitingLabel,
        waitingDetails,
      ),
    );
  };

  const changeLayout = (layout: "list" | "board") => {
    if (!client || activeView === undefined || layout === activeLayout) return;
    void run(`view-layout:${activeView.id}`, () =>
      setSavedWorkViewLayout(
        client,
        snapshot,
        activeView.id,
        activeView.version,
        layout,
      ),
    );
  };

  const renderTask = (
    task: (typeof visibleTasks)[number],
    index: number,
    variant: "list" | "board",
  ) => {
    const dependency = activeLinks.find(
      (link) =>
        link.linkType === "task_depends_on_task" &&
        link.sourceRecordId === task.id,
    );
    const dependencyTitle = projection.tasks.find(
      (item) => item.id === dependency?.targetRecordId,
    )?.title;
    return (
      <article
        key={task.id}
        className={`work-task-row work-task-row--${variant} state-${task.operationalState}${
          task.id === selectedTaskId ? " selected" : ""
        }`}
      >
        <span className="task-state-mark" aria-hidden="true" />
        <button
          type="button"
          className="work-task-copy work-row-copy"
          role="option"
          aria-selected={task.id === selectedTaskId}
          {...taskNav(index)}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey) onOpenTask(task.id);
            else onSelectTask(task.id);
          }}
          onDoubleClick={() => onOpenTask(task.id)}
        >
          <strong>{task.title}</strong>
          <span>
            {[
              task.waitingOn
                ? `${
                    task.waitingOn.direction === "we_owe"
                      ? "Zobowiązanie: "
                      : "Czekamy na: "
                  }${task.waitingOn.label}${
                    task.waitingOn.expectedAt === undefined
                      ? ""
                      : ` · przegląd ${formatDate(
                          task.waitingOn.expectedAt,
                          snapshot.bootstrap.workspace.timezone,
                        )}`
                  }`
                : dependencyTitle
                  ? `Zależy od: ${dependencyTitle}`
                  : "Gotowe do podjęcia",
              ...(task.dueAt === undefined
                ? []
                : [
                    `Termin: ${formatDate(
                      task.dueAt,
                      snapshot.bootstrap.workspace.timezone,
                    )}${Date.parse(task.dueAt) < Date.now() ? " · po terminie" : ""}`,
                  ]),
              ...(task.priority === undefined ||
              task.priority === "normal" ||
              task.priority === "low"
                ? []
                : [task.priority === "urgent" ? "Pilne" : "Wysoki priorytet"]),
            ].join(" · ")}
          </span>
        </button>
        <InlinePopover
          label={stateLabel[task.operationalState]}
          panelLabel={`Zmień stan zadania: ${task.title}`}
          triggerClassName="task-state-trigger"
          open={openPopover === `state:${task.id}`}
          onOpenChange={(next) =>
            setOpenPopover(next ? `state:${task.id}` : undefined)
          }
        >
          <div className="task-state-actions">
            <button
              type="button"
              disabled={busyIds.has(`state:${task.id}`) || !client}
              onClick={() => applyTaskState(task, "actionable")}
            >
              Do działania
            </button>
            <input
              value={waitingDraft[task.id] ?? task.waitingOn?.label ?? ""}
              onChange={(event) =>
                setWaitingDraft((current) => ({
                  ...current,
                  [task.id]: event.target.value,
                }))
              }
              placeholder="Na kogo lub co czekasz?"
              aria-label={`Powód oczekiwania: ${task.title}`}
            />
            <select
              value={
                waitingDirectionDraft[task.id] ??
                task.waitingOn?.direction ??
                "waiting_on_them"
              }
              aria-label={`Kierunek oczekiwania: ${task.title}`}
              onChange={(event) =>
                setWaitingDirectionDraft((current) => ({
                  ...current,
                  [task.id]: event.target.value as "waiting_on_them" | "we_owe",
                }))
              }
            >
              <option value="waiting_on_them">Czekamy na nich</option>
              <option value="we_owe">Nasze zobowiązanie</option>
            </select>
            <input
              type="date"
              value={
                waitingExpectedDraft[task.id] ??
                (task.waitingOn?.expectedAt === undefined
                  ? ""
                  : dateKeyInZone(
                      task.waitingOn.expectedAt,
                      snapshot.bootstrap.workspace.timezone,
                    ))
              }
              aria-label={`Data przeglądu oczekiwania: ${task.title}`}
              onChange={(event) =>
                setWaitingExpectedDraft((current) => ({
                  ...current,
                  [task.id]: event.target.value,
                }))
              }
            />
            <button
              type="button"
              disabled={
                busyIds.has(`state:${task.id}`) ||
                !client ||
                !(waitingDraft[task.id] ?? task.waitingOn?.label)?.trim()
              }
              onClick={() => {
                const expectedDate =
                  waitingExpectedDraft[task.id] ??
                  (task.waitingOn?.expectedAt === undefined
                    ? ""
                    : dateKeyInZone(
                        task.waitingOn.expectedAt,
                        snapshot.bootstrap.workspace.timezone,
                      ));
                const expectedAt =
                  expectedDate === ""
                    ? undefined
                    : instantForZonedDate(
                        expectedDate,
                        snapshot.bootstrap.workspace.timezone,
                        "end",
                      );
                applyTaskState(
                  task,
                  "waiting",
                  waitingDraft[task.id] ?? task.waitingOn?.label,
                  {
                    direction:
                      waitingDirectionDraft[task.id] ??
                      task.waitingOn?.direction ??
                      "waiting_on_them",
                    ...(expectedAt === undefined ? {} : { expectedAt }),
                  },
                );
              }}
            >
              Ustaw oczekiwanie
            </button>
            <button
              type="button"
              disabled={busyIds.has(`state:${task.id}`) || !client}
              onClick={() => applyTaskState(task, "blocked")}
            >
              Zablokowane
            </button>
          </div>
        </InlinePopover>
      </article>
    );
  };

  return (
    <div className="surface-scroll work-surface">
      <header className="surface-header wave2-header work-header">
        <div>
          <p className="eyebrow">Obszar → inicjatywa → projekt → działanie</p>
          <h1 id="surface-title" tabIndex={-1}>
            Praca
          </h1>
          <p>
            Trwała odpowiedzialność jest oddzielona od wyniku do osiągnięcia.
            Zadania pokazują, co można zrobić teraz, a co czeka albo jest
            blokowane.
          </p>
        </div>
        <span className="work-freshness">
          {projection.freshness.mode === "local_authoritative"
            ? "Lokalne źródło prawdy"
            : "Projekcja zsynchronizowana"}
        </span>
      </header>

      <nav className="saved-view-strip" aria-label="Zapisane widoki pracy">
        <span>Widoki</span>
        <button
          type="button"
          className={`view-chip${activeViewId === undefined ? " active" : ""}`}
          aria-pressed={activeViewId === undefined}
          onClick={() => setActiveViewId(undefined)}
        >
          Wszystkie
        </button>
        {projection.savedViews.length === 0 ? (
          <em>Jeszcze bez zapisanych filtrów</em>
        ) : (
          projection.savedViews.map((view) => (
            <button
              type="button"
              key={view.id}
              className={`view-chip${activeViewId === view.id ? " active" : ""}`}
              aria-pressed={activeViewId === view.id}
              onClick={() => {
                setConfirmingViewDelete(false);
                setActiveViewId((current) =>
                  current === view.id ? undefined : view.id,
                );
              }}
            >
              {view.name}
            </button>
          ))
        )}
        {activeView !== undefined && (
          <span className="view-chip-actions">
            <InlinePopover
              label="Zmień nazwę"
              panelLabel="Zmień nazwę widoku"
              open={openPopover === "view-rename"}
              onOpenChange={(next) =>
                setOpenPopover(next ? "view-rename" : undefined)
              }
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = String(
                    new FormData(event.currentTarget).get("name") ?? "",
                  ).trim();
                  if (!client || name === "" || name === activeView.name)
                    return;
                  void run("view-rename", () =>
                    renameSavedWorkView(
                      client,
                      snapshot,
                      activeView.id,
                      activeView.version,
                      name,
                    ),
                  );
                }}
              >
                <input
                  name="name"
                  aria-label="Nowa nazwa widoku"
                  defaultValue={activeView.name}
                  maxLength={200}
                  required
                />
                <button disabled={busyIds.has("view-rename") || !client}>
                  {busyIds.has("view-rename") ? "Zapisuję…" : "Zapisz nazwę"}
                </button>
              </form>
            </InlinePopover>
            <button
              type="button"
              className="view-chip-remove"
              disabled={busyIds.has("view-delete") || !client}
              onClick={() => {
                if (!confirmingViewDelete) {
                  setConfirmingViewDelete(true);
                  return;
                }
                setConfirmingViewDelete(false);
                if (!client) return;
                void run("view-delete", () =>
                  deleteSavedWorkView(
                    client,
                    snapshot,
                    activeView.id,
                    activeView.version,
                  ),
                ).then((deleted) => {
                  if (deleted) setActiveViewId(undefined);
                });
              }}
            >
              {confirmingViewDelete ? "Potwierdź usunięcie" : "Usuń widok"}
            </button>
          </span>
        )}
        <InlinePopover
          label="Zapisz widok"
          panelLabel="Zapisz widok pracy"
          open={openPopover === "view"}
          onOpenChange={(next) => setOpenPopover(next ? "view" : undefined)}
        >
          <form onSubmit={(event) => void submitView(event)}>
            <input
              name="name"
              aria-label="Nazwa widoku"
              placeholder="Moje oczekujące"
              required
            />
            <select name="state" aria-label="Stan zadań" defaultValue="">
              <option value="">Każdy stan</option>
              <option value="actionable">Do działania</option>
              <option value="waiting">Czekam na</option>
              <option value="blocked">Zablokowane</option>
            </select>
            <select name="statusId" aria-label="Status" defaultValue="">
              <option value="">Każdy status</option>
              {snapshot.bootstrap.taskStatuses
                .filter((status) => status.state !== "archived")
                .map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
            </select>
            <select name="priority" aria-label="Priorytet" defaultValue="">
              <option value="">Każdy priorytet</option>
              <option value="urgent">Pilny</option>
              <option value="high">Wysoki</option>
              <option value="normal">Normalny</option>
              <option value="low">Niski</option>
            </select>
            <select name="dueWindow" aria-label="Termin" defaultValue="">
              <option value="">Dowolny termin</option>
              <option value="overdue">Po terminie</option>
              <option value="today">Termin dziś</option>
              <option value="this_week">Termin w tym tygodniu</option>
            </select>
            <select
              name="assignee"
              aria-label="Odpowiedzialność"
              defaultValue=""
            >
              <option value="">Każda osoba</option>
              <option value="unassigned">Nieprzypisane</option>
              {(snapshot.assignmentCandidates.kind === "ready"
                ? snapshot.assignmentCandidates.data.candidates
                : []
              ).map((candidate) => (
                <option
                  key={candidate.principalId}
                  value={candidate.principalId}
                >
                  {candidate.displayName}
                </option>
              ))}
            </select>
            {/* ADR-045. Filtering by a related Project — the kernel resolves
                the relation, so the view means the same thing here and to an
                MCP operator. Offered only when there is a Project to name. */}
            {(projection?.projects ?? []).length > 0 && (
              <select
                name="relationProjectId"
                aria-label="Projekt"
                defaultValue=""
              >
                <option value="">Każdy projekt</option>
                {(projection?.projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            )}
            {(snapshot.bootstrap.fieldDefinitions ?? []).some(
              (definition) =>
                definition.targetKind === "task" &&
                definition.state !== "retired",
            ) && (
              <>
                <select
                  aria-label="Pole"
                  value={viewFieldId}
                  onChange={(event) => setViewFieldId(event.target.value)}
                >
                  <option value="">Bez warunku pola</option>
                  {(snapshot.bootstrap.fieldDefinitions ?? [])
                    .filter(
                      (definition) =>
                        definition.targetKind === "task" &&
                        definition.state !== "retired",
                    )
                    .map((definition) => (
                      <option key={definition.id} value={definition.id}>
                        {definition.label}
                      </option>
                    ))}
                </select>
                {viewFieldId !== "" && (
                  <select
                    name="fieldPredicate"
                    aria-label="Warunek pola"
                    defaultValue="set"
                  >
                    <option value="set">Ma wartość</option>
                    <option value="empty">Puste</option>
                    {(snapshot.bootstrap.fieldDefinitions ?? [])
                      .filter(
                        (definition) =>
                          definition.id === viewFieldId &&
                          definition.type.kind === "choice",
                      )
                      .flatMap((definition) =>
                        definition.type.kind === "choice"
                          ? definition.type.options
                          : [],
                      )
                      .map((option) => (
                        <option key={option} value={`opt:${option}`}>
                          = {option}
                        </option>
                      ))}
                  </select>
                )}
              </>
            )}
            <select name="groupBy" aria-label="Grupowanie" defaultValue="">
              <option value="">Bez grupowania</option>
              <option value="status">Według statusu</option>
              <option value="priority">Według priorytetu</option>
              {(snapshot.bootstrap.fieldDefinitions ?? [])
                .filter(
                  (definition) =>
                    definition.targetKind === "task" &&
                    definition.state !== "retired" &&
                    definition.type.kind === "choice",
                )
                .map((definition) => (
                  <option key={definition.id} value={`field:${definition.id}`}>
                    Według pola „{definition.label}”
                  </option>
                ))}
            </select>
            <select
              name="sort"
              aria-label="Kolejność"
              defaultValue="updated_desc"
            >
              <option value="updated_desc">Ostatnio zmieniane</option>
              <option value="due_asc">Najbliższy termin</option>
              <option value="title_asc">Alfabetycznie</option>
            </select>
            <button disabled={busyIds.has("view") || !client}>
              {busyIds.has("view") ? "Zapisuję…" : "Zapisz"}
            </button>
          </form>
        </InlinePopover>
      </nav>

      <div className="work-thread">
        <section
          className="work-context-column"
          aria-labelledby="work-context-title"
        >
          <div className="work-section-heading">
            <div>
              <h2 id="work-context-title">Kontekst odpowiedzialności</h2>
            </div>
            <span>
              {countLabel(
                projection.areas.length + projection.initiatives.length,
                "wpis",
                "wpisy",
                "wpisów",
              )}
            </span>
          </div>
          {projection.areas.map((area) => (
            <button
              type="button"
              className={`work-context-row area-row${
                area.id === selectedContextId ? " selected" : ""
              }`}
              aria-pressed={area.id === selectedContextId}
              key={area.id}
              onClick={() => onSelectContext("area", area.id)}
            >
              <span className="work-node" aria-hidden="true">
                A
              </span>
              <span className="work-row-copy">
                <small>Obszar odpowiedzialności</small>
                <strong>{area.title}</strong>
                <span>{area.responsibility}</span>
              </span>
            </button>
          ))}
          {projection.initiatives.map((initiative) => (
            <button
              type="button"
              className={`work-context-row initiative-row${
                initiative.id === selectedContextId ? " selected" : ""
              }`}
              aria-pressed={initiative.id === selectedContextId}
              key={initiative.id}
              onClick={() => onSelectContext("initiative", initiative.id)}
            >
              <span className="work-node" aria-hidden="true">
                I
              </span>
              <span className="work-row-copy">
                <small>Inicjatywa · wynik do zamknięcia</small>
                <strong>{initiative.title}</strong>
                <span>{initiative.intendedOutcome}</span>
              </span>
            </button>
          ))}
          {projection.areas.length + projection.initiatives.length === 0 && (
            <WorkEmpty
              title="Brak kontekstu pracy"
              detail="Dodaj trwały Obszar albo Inicjatywę z konkretnym wynikiem."
            />
          )}
          <div className="work-create-pair">
            <InlinePopover
              label="Dodaj Obszar"
              panelLabel="Dodaj obszar odpowiedzialności"
              open={openPopover === "area"}
              onOpenChange={(next) => setOpenPopover(next ? "area" : undefined)}
            >
              <form onSubmit={(event) => void submitArea(event)}>
                <input
                  name="title"
                  aria-label="Nazwa obszaru"
                  placeholder="np. Relacje z klientami"
                  required
                />
                <textarea
                  name="responsibility"
                  aria-label="Stała odpowiedzialność obszaru"
                  placeholder="Za co stale odpowiadasz?"
                  required
                />
                <button disabled={busyIds.has("area") || !client}>
                  {busyIds.has("area") ? "Zapisuję…" : "Dodaj"}
                </button>
              </form>
            </InlinePopover>
            <InlinePopover
              label="Dodaj Inicjatywę"
              panelLabel="Dodaj inicjatywę"
              open={openPopover === "initiative"}
              onOpenChange={(next) =>
                setOpenPopover(next ? "initiative" : undefined)
              }
            >
              <form onSubmit={(event) => void submitInitiative(event)}>
                <input
                  name="title"
                  aria-label="Nazwa inicjatywy"
                  placeholder="np. Interaktywna alfa"
                  required
                />
                <textarea
                  name="outcome"
                  aria-label="Oczekiwany wynik inicjatywy"
                  placeholder="Jaki wynik pozwoli ją zamknąć?"
                  required
                />
                <button disabled={busyIds.has("initiative") || !client}>
                  {busyIds.has("initiative") ? "Zapisuję…" : "Dodaj"}
                </button>
              </form>
            </InlinePopover>
          </div>
        </section>

        <section
          className="work-delivery-column"
          aria-labelledby="work-delivery-title"
        >
          <div className="work-section-heading">
            <div>
              <h2 id="work-delivery-title">Projekty i następne działania</h2>
            </div>
            <div className="work-heading-meta">
              <span>
                {countLabel(
                  projection.projects.length,
                  "projekt",
                  "projekty",
                  "projektów",
                )}{" "}
                ·{" "}
                {countLabel(visibleTasks.length, "zadanie", "zadania", "zadań")}
                {activeView !== undefined
                  ? ` · widok „${activeView.name}”`
                  : ""}
              </span>
              {activeView !== undefined && (
                <fieldset className="work-layout-switch">
                  <legend>Układ widoku</legend>
                  <button
                    type="button"
                    aria-pressed={activeLayout === "list"}
                    disabled={
                      busyIds.has(`view-layout:${activeView.id}`) || !client
                    }
                    onClick={() => changeLayout("list")}
                  >
                    Lista
                  </button>
                  <button
                    type="button"
                    aria-pressed={activeLayout === "board"}
                    aria-describedby={
                      groupBy === undefined
                        ? "work-board-requirement"
                        : undefined
                    }
                    disabled={
                      groupBy === undefined ||
                      busyIds.has(`view-layout:${activeView.id}`) ||
                      !client
                    }
                    onClick={() => changeLayout("board")}
                  >
                    Tablica
                  </button>
                  {groupBy === undefined && (
                    <small id="work-board-requirement">
                      Tablica wymaga widoku grupowanego.
                    </small>
                  )}
                </fieldset>
              )}
            </div>
          </div>
          {projection.projects.map((project) => (
            <button
              type="button"
              className={`work-project-row${
                project.id === selectedProjectId ? " selected" : ""
              }`}
              aria-pressed={project.id === selectedProjectId}
              key={project.id}
              onClick={() => onSelectProject(project.id)}
            >
              <span className="work-branch" aria-hidden="true" />
              <span className="work-row-copy">
                <small>
                  {projectContext.get(project.id) ??
                    "Projekt bez przypisanego kontekstu"}
                </small>
                <strong>{project.title}</strong>
                <span>{project.intendedOutcome}</span>
              </span>
            </button>
          ))}
          {projection.projects.length === 0 && (
            <WorkEmpty
              title="Brak projektów"
              detail="Projekt powinien prowadzić do jednego sprawdzalnego wyniku."
            />
          )}
          {/* Roving tabindex pairs with listbox/option semantics, matching the
              cockpit lists: AT learns this is one composite widget where Tab
              stops once and arrows move between rows. */}
          {activeLayout === "list" && (
            <div
              className="work-task-list"
              role="listbox"
              aria-label="Następne działania — lista"
            >
              {visibleTasks.map((task, index) => {
                const group =
                  groupBy === undefined ? undefined : groupFor(task);
                const previous = visibleTasks[index - 1];
                const groupStarts =
                  group !== undefined &&
                  (previous === undefined ||
                    groupFor(previous).key !== group.key);
                return (
                  <Fragment key={task.id}>
                    {groupStarts && group !== undefined && (
                      <div className="work-group-heading" role="presentation">
                        <span>{group.label}</span>
                        <small>
                          {countLabel(
                            visibleTasks.filter(
                              (candidate) =>
                                groupFor(candidate).key === group.key,
                            ).length,
                            "zadanie",
                            "zadania",
                            "zadań",
                          )}
                        </small>
                      </div>
                    )}
                    {renderTask(task, index, "list")}
                  </Fragment>
                );
              })}
            </div>
          )}
          {activeLayout === "board" && (
            <div
              className="work-task-board"
              role="listbox"
              aria-label="Następne działania — tablica"
            >
              {taskGroups.map((group) => (
                <section
                  className="work-board-column"
                  role="group"
                  aria-label={group.label}
                  key={group.key}
                >
                  <header>
                    <h3>{group.label}</h3>
                    <span>{group.tasks.length}</span>
                  </header>
                  <div className="work-board-cards">
                    {group.tasks.length === 0 ? (
                      <p>Brak zadań</p>
                    ) : (
                      group.tasks.map((task) =>
                        renderTask(
                          task,
                          visibleTaskIndex.get(task.id)!,
                          "board",
                        ),
                      )
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
          {visibleTasks.length === 0 && (
            <WorkEmpty
              title={
                activeView !== undefined && projection.tasks.length > 0
                  ? "Ten widok nie pasuje do żadnego zadania"
                  : "Brak następnych działań"
              }
              detail={
                activeView !== undefined && projection.tasks.length > 0
                  ? "Filtry widoku są jawne — zmień widok albo wróć do „Wszystkie”."
                  : "Quick Capture utworzy zadanie bez wymagania klasyfikacji na wejściu."
              }
            />
          )}
          <div className="work-link-tools">
            <InlinePopover
              label="Przypisz projekt do kontekstu"
              panelLabel="Przypisz projekt do kontekstu"
              open={openPopover === "link-project"}
              onOpenChange={(next) =>
                setOpenPopover(next ? "link-project" : undefined)
              }
            >
              <form onSubmit={(event) => void submitProjectLink(event)}>
                <select name="projectId" required aria-label="Projekt">
                  <option value="">Wybierz projekt</option>
                  {projection.projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <select
                  name="target"
                  required
                  aria-label="Obszar lub inicjatywa"
                >
                  <option value="">Wybierz kontekst</option>
                  {projection.initiatives.map((item) => (
                    <option key={item.id} value={`initiative:${item.id}`}>
                      Inicjatywa · {item.title}
                    </option>
                  ))}
                  {projection.areas.map((item) => (
                    <option key={item.id} value={`area:${item.id}`}>
                      Obszar · {item.title}
                    </option>
                  ))}
                </select>
                <button disabled={busyIds.has("link-project") || !client}>
                  {busyIds.has("link-project") ? "Zapisuję…" : "Połącz"}
                </button>
              </form>
            </InlinePopover>
            <InlinePopover
              label="Dodaj zależność zadań"
              panelLabel="Dodaj zależność zadań"
              open={openPopover === "link-dependency"}
              onOpenChange={(next) =>
                setOpenPopover(next ? "link-dependency" : undefined)
              }
            >
              <form onSubmit={(event) => void submitDependency(event)}>
                <select name="taskId" required aria-label="Zadanie zależne">
                  <option value="">Zadanie zależne</option>
                  {projection.tasks.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <select
                  name="dependencyId"
                  required
                  aria-label="Zadanie wymagane"
                >
                  <option value="">Wymaga zadania</option>
                  {projection.tasks.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <button disabled={busyIds.has("link-dependency") || !client}>
                  {busyIds.has("link-dependency")
                    ? "Zapisuję…"
                    : "Dodaj zależność"}
                </button>
              </form>
            </InlinePopover>
          </div>
        </section>
      </div>
    </div>
  );
};
