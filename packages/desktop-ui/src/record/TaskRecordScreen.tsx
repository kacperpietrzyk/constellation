import { useState } from "react";

import type {
  KnowledgeSourceId,
  PrincipalId,
  ProjectId,
  TaskId,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import type {
  AuditReceiptProjection,
  CommentListProjection,
  DataSlice,
  DesktopSnapshot,
  MutationFailure,
  WorkOverviewProjection,
} from "../client/workflow.js";
import { Icon } from "../components/Icon.js";
import { dateKeyInZone, formatDateTime } from "../i18n.js";
import {
  dueSentence,
  planSentence,
  plannerName,
  PRIORITY_LABELS,
  type TaskProse,
  type WorkProject,
  type WorkTask,
} from "../tasks/task-view.js";
import {
  RecordActivityPanel,
  recordActivityItems,
} from "./RecordActivityPanel.js";
import {
  RecordCommentsPanel,
  type MentionCandidate,
} from "./RecordCommentsPanel.js";
import {
  openThreadCount,
  restoreTab,
  type AttachmentCustody,
  type CommentActor,
  type CommentAttachment,
  type CommentThread,
  type PendingAttachment,
  type RecordTab,
} from "./record-tabs.js";
import { RecordTabStrip } from "./RecordTabStrip.js";
import { TaskDependencyPanel, TaskStatePanel } from "./TaskOperationsPanel.js";
import screen from "./record-screen.module.css";
import styles from "./task-record.module.css";

// The task record: the work READ at full width, with its conversation under it.
//
// It mirrors `ProjectRecordScreen` and keeps the same three rules that file
// states — one `<h1>`, the strip owns the single `role="tabpanel"`, and rows are
// built only inside the branch on screen — and it is lazy for the same measured
// reason: the hot path has about a kilobyte of gzip left, and this file plus its
// stylesheet plus the comments panel are several times that.
//
// It edits almost nothing, and the exception is named rather than left to be
// discovered. The inspector rail stays open beside this screen and owns
// attachments, assignment, reservation, removal and the inline context editor;
// rebuilding one of those here would give the task two places to answer one
// question, which is this repo's named repeat defect.
//
// The two it DOES author — operational state and dependencies — the rail does
// not have and cannot host: the rail's task is a `task.list` item, and both
// commands need the version of the `work.overview` task, which is the `task`
// prop below. They were the last two operations left on the retired work
// surface, and this is where they landed.

/**
 * Which tab each TASK record was left on.
 *
 * A SEPARATE `localStorage` key from the project screen's, and separate for a
 * mechanical reason rather than a tidiness one: that key holds a 20-entry LRU
 * window written by a module-private helper. Two independent writers over one
 * key keep two independent windows, so each one's write evicts entries the other
 * still believes are stored — records would lose their tab at random.
 *
 * Lifting those helpers into `record-tabs.ts` and sharing one window was the
 * other way out, and it was rejected: that module is on the HOT PATH (RealApp
 * reaches it through `record-actors.ts`), and the storage code would be paid for
 * on first paint by every reader who never opens a record.
 *
 * Reading goes through `restoreTab` for stale keys, and then through
 * `TASK_TABS` again — see `active` below.
 */
const TAB_STORE_KEY = "constellation.task-record-tab.v1";
const TAB_STORE_LIMIT = 20;

const readStoredTabs = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(TAB_STORE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    // Anything that is not a plain object reads as "nothing stored". A
    // half-written value must not stop a record from opening.
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
};

const rememberTab = (recordId: string, tab: RecordTab): void => {
  try {
    const stored = readStoredTabs();
    // Deleted before it is set, so re-selecting a tab moves the record back to
    // the newest end instead of leaving it wherever it first landed.
    delete stored[recordId];
    const entries = [...Object.entries(stored), [recordId, tab] as const].slice(
      -TAB_STORE_LIMIT,
    );
    localStorage.setItem(
      TAB_STORE_KEY,
      JSON.stringify(Object.fromEntries(entries)),
    );
  } catch {
    // Storage refused — a full or blocked quota. Losing which tab a record was
    // left on is not worth failing the render over.
  }
};

/**
 * The sections a task offers, declared HERE and not added to `RECORD_TABS`.
 *
 * A subset, and two absences are decisions: a task has no Documents panel of its
 * own, and its subtasks are read on Overview beside the work they split rather
 * than in a Tasks tab — a list of two rows behind a tab is a list nobody sees.
 */
const TASK_TABS: readonly RecordTab[] = ["overview", "comments", "activity"];

type WorkLink = WorkOverviewProjection["links"][number];

/**
 * Where the task came from, as three answers and not two.
 *
 * "Nothing captured this" and "we could not read whether anything did" are
 * different facts, and the second is the ordinary case for a task past the
 * `task.list` page — the record itself comes from the uncapped `work.overview`,
 * which carries no capture id at all.
 */
type TaskCaptureOrigin =
  | { readonly kind: "capture"; readonly text: string | undefined }
  | { readonly kind: "none" }
  | { readonly kind: "unknown" };

/** One exit or one reading, drawn the same way. A row with somewhere to go is a
 *  button; a row with nowhere to go is a flat row and NOT a disabled control —
 *  a greyed thing that never says why is a dummy, which this project names as a
 *  defect of its own. */
const RecordRow = ({
  done,
  label,
  meta,
  onOpen,
}: {
  readonly done?: boolean | undefined;
  readonly label: string;
  readonly meta?: string | undefined;
  readonly onOpen?: (() => void) | undefined;
}) => {
  const content = (
    <>
      {/* Shape, not colour: a closed row carries a different glyph and the meta
          beside it says the word as well. */}
      {done !== undefined && (
        <span aria-hidden="true" className={styles.rowMark}>
          {done ? "✓" : "○"}
        </span>
      )}
      <span className={styles.rowMain}>
        <span className={styles.rowLabel}>{label}</span>
        {meta !== undefined && <span className={styles.rowMeta}>{meta}</span>}
      </span>
      {onOpen !== undefined && (
        <span aria-hidden="true" className={styles.rowArrow}>
          →
        </span>
      )}
    </>
  );
  return onOpen === undefined ? (
    <div className={styles.row} data-record-row={label}>
      {content}
    </div>
  ) : (
    <button
      className={styles.row}
      data-record-row={label}
      onClick={onOpen}
      type="button"
    >
      {content}
    </button>
  );
};

/** Paragraphs, split on blank lines. Single newlines inside a paragraph are kept
 *  by the stylesheet rather than turned into more paragraphs — the text is
 *  somebody's writing, and re-flowing it is editing it. */
const paragraphsOf = (text: string): readonly string[] =>
  text
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");

/** When the plan was made, said as a date and time rather than as a stamp. */
const plannedSentence = (
  task: WorkTask,
  prose: TaskProse,
): string | undefined =>
  task.plannedBy === undefined
    ? undefined
    : `Planned by ${plannerName(prose.snapshot, task.plannedBy.principalId)} on ${formatDateTime(
        task.plannedBy.at,
        prose.timeZone,
      )}`;

/** One stored field value, derived from the projection rather than spelled out
 *  again — a hand-written copy of this union is the drift this repo has already
 *  paid for three times. */
type TaskFieldValue = NonNullable<WorkTask["fields"]>[string];

/** A field value as words. `formula` and `rollup` are calculated and say so, the
 *  same way the inspector's reading of them does. */
const fieldValueText = (
  value: TaskFieldValue | undefined,
  timeZone: string,
): string =>
  value === undefined
    ? "—"
    : value.kind === "date"
      ? formatDateTime(value.value, timeZone)
      : String(value.value);

export interface TaskRecordScreenProps {
  /** Every READING this screen makes comes off the snapshot, and it is passed
   *  whole rather than as nine narrower props for a measured reason: the mount
   *  lives in `RealApp`, which is the entry chunk, and the hot-path gate had
   *  about a kilobyte of gzip left. Nine derivations spelled at the mount are
   *  paid for on first paint by every reader who never opens a task; the same
   *  nine here are paid for by whoever opens one. It is not new coupling either
   *  — `TaskProse` already carries the whole snapshot, because `plannerName`
   *  needs the member list to name who planned the work. */
  readonly snapshot: DesktopSnapshot;
  /** The task as `work.overview` carries it — whole-Space and UNCAPPED, which is
   *  why the record is read from it and not from `task.list`. Passed rather than
   *  looked up because FINDING it is the mount's gate: a screen that could not
   *  find its own record would have to invent a state for that, and the surface
   *  already has one. */
  readonly task: WorkTask;
  /** The three the two authoring panels need, and nothing wider. They already
   *  exist at the mount — the shell hands the same three to every surface that
   *  writes — so naming them here adds no handler body to the entry chunk. */
  readonly client: ConstellationRendererClient | undefined;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
  /** This task's audit receipt, when one has been fetched. */
  readonly receipt: AuditReceiptProjection | undefined;
  readonly comments: DataSlice<CommentListProjection>;
  readonly busy: boolean;
  readonly commentBusy: boolean;
  readonly canComment: boolean;
  /** Settling anybody else's thread. The author of a thread may always settle
   *  their own, which is why this and `currentPrincipalId` travel together. */
  readonly canResolve: boolean;
  readonly currentPrincipalId: PrincipalId | undefined;
  /** Nazwa czytelnika, wyłącznie dla znacznika autora w kompozytorze
   *  komentarzy (rejestr, wpis #58). Może być pusta i wtedy znacznik rysuje
   *  glif osoby zamiast zmyślonych inicjałów. */
  readonly currentDisplayName: string | undefined;
  readonly actorOf: (comment: CommentThread) => CommentActor;
  readonly mentionNameOf: (principalId: string) => string;
  readonly mentionCandidates: readonly MentionCandidate[];
  /** All FOUR arguments are forwarded to the panel, and a caller that supplies a
   *  two-parameter function is assignable here while silently dropping the last
   *  two — the answer then lands as a fresh comment under a strip that promised
   *  it was a reply, and the staged files never reach the write. */
  readonly onAddComment: (
    body: string,
    mentions: readonly PrincipalId[],
    parent?: CommentThread,
    attachmentSourceIds?: readonly KnowledgeSourceId[],
  ) => Promise<boolean>;
  readonly onEditComment: (
    comment: CommentThread,
    body: string,
    attachmentSourceIds?: readonly KnowledgeSourceId[],
  ) => Promise<boolean>;
  readonly onResolveComment: (
    comment: CommentThread,
    resolved: boolean,
  ) => Promise<boolean>;
  /** Staging and inspecting a comment's files. REQUIRED, even though the panel
   *  itself takes them as optional: this screen is the ONLY place a task's
   *  conversation is drawn, so a mount that left them out would take attachments
   *  away from the task record — which is the capability the rail's own comments
   *  block had before it gave way to this screen. */
  readonly onAttachToComment: () => Promise<PendingAttachment | undefined>;
  readonly onInspectAttachment: (
    attachment: CommentAttachment,
  ) => Promise<AttachmentCustody>;
  readonly onRestoreAttachment: (
    attachment: CommentAttachment,
  ) => Promise<AttachmentCustody>;
  readonly onBack: () => void;
  /** Opening a subtask, a parent or a dependency opens THAT task as a record.
   *  The TITLE travels with the id because the shell names the tab it opens, and
   *  this screen has already resolved the row it was clicked on — a second
   *  lookup at the mount would be over the capped list and would label half of
   *  them "Task". */
  readonly onOpenTask: (taskId: TaskId, title: string) => void;
  readonly onOpenProject: (projectId: ProjectId, title: string) => void;
}

export const TaskRecordScreen = ({
  snapshot,
  task,
  client,
  onReload,
  onFailure,
  receipt,
  comments,
  busy,
  commentBusy,
  canComment,
  canResolve,
  currentPrincipalId,
  currentDisplayName,
  actorOf,
  mentionNameOf,
  mentionCandidates,
  onAddComment,
  onEditComment,
  onResolveComment,
  onAttachToComment,
  onInspectAttachment,
  onRestoreAttachment,
  onBack,
  onOpenTask,
  onOpenProject,
}: TaskRecordScreenProps) => {
  const taskId = task.id;
  const [selected, setSelected] = useState<RecordTab>(() =>
    restoreTab(readStoredTabs()[taskId]),
  );
  const select = (tab: RecordTab): void => {
    rememberTab(taskId, tab);
    setSelected(tab);
  };

  // THE tab, coerced once and used twice — for the strip and for the panel
  // branch below. `restoreTab` cannot do this on its own: it validates against
  // every tab that EXISTS, not against the three a task offers, so a key stored
  // by the project record ("documents", and such keys are in circulation) came
  // back through it unchanged. The strip then highlighted Overview — it makes
  // the same coercion internally, at `RecordTabStrip.tsx:88` — over a tabpanel
  // that matched no branch and drew nothing.
  const active = TASK_TABS.includes(selected) ? selected : "overview";

  // Every reading, taken here rather than at the mount — see `snapshot` above.
  const timeZone = snapshot.bootstrap.workspace.timezone;
  const prose: TaskProse = {
    timeZone,
    todayKey: dateKeyInZone(new Date(), timeZone),
    snapshot,
  };
  // The work plane is what the record stands on, and the mount found this task
  // in it — so an unreadable slice here is one that went away between that find
  // and this render. Rare, and stated anyway: the sections below are the only
  // place a reader learns this task has no subtasks and waits for nothing, and
  // an empty list read off a slice that never came back would claim both.
  const workKnown = snapshot.work.kind === "ready";
  const work = snapshot.work.kind === "ready" ? snapshot.work.data : undefined;
  const tasks: readonly WorkTask[] = work?.tasks ?? [];
  const projects: readonly WorkProject[] = work?.projects ?? [];
  const links: readonly WorkLink[] = work?.links ?? [];
  const statuses = snapshot.bootstrap.taskStatuses;
  const fieldDefinitions = snapshot.bootstrap.fieldDefinitions ?? [];
  const activity = snapshot.activity;
  // The same task as `task.list` carries it, which is the ONLY slice with the
  // written context and the capture origin on it. Absent is a real state and not
  // a gap to paper over: `task.list` pages at fifty while the record came from
  // the uncapped overview, so a missing entry means the context is UNREAD —
  // never that there is none.
  const detail = snapshot.tasks.find((item) => item.id === taskId);
  const captureOrigin: TaskCaptureOrigin =
    detail === undefined
      ? { kind: "unknown" }
      : detail.sourceCaptureId === undefined
        ? { kind: "none" }
        : {
            kind: "capture",
            text: snapshot.captures.find(
              (capture) => capture.id === detail.sourceCaptureId,
            )?.originalText,
          };

  const status = statuses.find((candidate) => candidate.id === task.statusId);
  const parent = tasks.find((candidate) => candidate.id === task.parentTaskId);
  const children = tasks.filter(
    (candidate) => candidate.parentTaskId === task.id,
  );
  const taskProjects = projects.filter((project) =>
    task.projectIds.includes(project.id as ProjectId),
  );

  // `state === "active"` is the whole filter and it is not defensive:
  // `work.linkRemove` flips the LINK's state and leaves `recordState` alone, so
  // a removed dependency comes back from this query forever. Drawing it would
  // tell a reader the work is still blocked by something somebody unblocked.
  const dependencies = links.filter(
    (link) =>
      link.linkType === "task_depends_on_task" && link.state === "active",
  );
  const blockedBy = dependencies.filter(
    (link) => link.sourceRecordId === taskId,
  );
  const blocks = dependencies.filter((link) => link.targetRecordId === taskId);

  // Undefined and empty are DIFFERENT facts. A failed load collapsed into an
  // empty list put "Comments 0" on the tab beside a panel saying the comments
  // could not be read — a number is a claim, and there was nothing to claim it
  // from. No number is the honest reading of a slice that never arrived.
  const threads = comments.kind === "ready" ? comments.data.threads : undefined;
  const activityEntries =
    activity.kind === "ready"
      ? recordActivityItems(
          activity.data.items.filter((item) => item.recordId === taskId),
        ).map((item) => ({ item }))
      : [];

  const counts: Partial<Record<RecordTab, number>> =
    threads === undefined ? {} : { comments: openThreadCount(threads) };

  const fields = fieldDefinitions.filter(
    (definition) =>
      definition.targetKind === "task" &&
      (definition.state !== "retired" ||
        task.fields?.[definition.id] !== undefined),
  );

  const planned = plannedSentence(task, prose);
  const due = dueSentence(task, prose);
  const priority = task.priority ?? "normal";

  /** What the two authoring panels need to write, assembled once. Both take the
   *  same four, so a change to the contract lands in one place rather than in
   *  two mounts that can disagree. */
  const wiring = { client, snapshot, onReload, onFailure };

  /** The other end of a dependency, drawn once for each direction. A link whose
   *  other end is not in this Space's work says so rather than drawing a blank
   *  row: the id is real, the title is what is missing. */
  const dependencyRow = (link: WorkLink, otherId: string, meta: string) => {
    const other = tasks.find((candidate) => candidate.id === otherId);
    return other === undefined ? (
      <RecordRow
        key={link.id}
        label="A task outside this Space’s work"
        meta={meta}
      />
    ) : (
      <RecordRow
        done={other.completionState === "completed"}
        key={link.id}
        label={other.title}
        meta={other.completionState === "completed" ? `${meta} · done` : meta}
        onOpen={() => onOpenTask(other.id, other.title)}
      />
    );
  };

  return (
    <div className={screen.screen} data-record-kind="task">
      {/* OKRUSZEK STOI W PAŚMIE, A NIE W TREŚCI (wpis 12-2). Prototyp otwiera
          rekord zadania paskiem `crumbbar("Tasks › <projekt> › T1", …)`
          (`v3/screens/record.js:556-562`) — trasa do kolekcji, separator
          i nazwa TEGO rekordu, wszystko w jednym rzędzie chromu nad treścią.
          Ta apka miała tu `‹ Tasks`: JEDNO nazwanie, i to nazwanie MIEJSCA,
          z którego się przyszło, a nie trasy, na której się stoi — a pasmo
          rekordu stało puste.

          NAZWA REKORDU POWTARZA SIĘ W OKRUSZKU I W TYTULE, i to jest wybór
          prototypu, nie przeoczenie: `crumbbar(„Projects › <p.title>")` stoi
          tam nad `<h1 class="rec-title">${p.title}</h1>`
          (`v3/screens/record.js:429-432`). Okruszek mówi, GDZIE jesteś; tytuł
          mówi, CO czytasz.

          `<header>`, A NIE `<div>`: to jest rząd chromu tego ekranu, ten sam
          rodzaj pudełka co pasmo powierzchni. Tytuł rekordu ma własny
          `<header>` NIŻEJ i jest jego dzieckiem, więc `#surface-title.closest("header")`
          dalej rozwiązuje się do tamtego — ten węzeł jest RODZEŃSTWEM, nie
          przodkiem, i osi składu nie rusza. */}
      <header className={screen.crumbs}>
        <button className={screen.back} onClick={onBack} type="button">
          Tasks
        </button>
        <span aria-hidden="true" className={screen.crumbSeparator}>
          ›
        </span>
        <span className={screen.crumbCurrent}>{task.title}</span>
      </header>

      {/* The `<h1>` carries `id="surface-title"` and `tabIndex={-1}` because the
          shell uses BOTH: `aria-labelledby="surface-title"` names the whole work
          plane, and the effect that runs after a destination change moves focus
          onto that id. A heading without them leaves the plane unnamed and sends
          focus to the panel instead — silently, and only for the keyboard. */}
      <header className={styles.header}>
        <h1 className={styles.title} id="surface-title" tabIndex={-1}>
          {task.title}
        </h1>
        <div className={styles.head}>
          <span
            className={`${styles.state} ${
              task.completionState === "completed"
                ? styles.state_done
                : styles[`state_${task.operationalState}`]
            }`}
          >
            <span aria-hidden="true" className={styles.mark}>
              {task.completionState === "completed" ? "✓" : "●"}
            </span>
            {status?.label ?? "No status"}
            {task.completionState === "completed" && " · completed"}
          </span>
          {/* Priority is a reading and stays in this line. The operational
              state used to stand here beside it wearing the same class; it now
              has a band of its own, under this row. */}
          {priority !== "normal" && (
            <span className={styles.priorityNote}>
              {PRIORITY_LABELS[priority] ?? priority} priority
            </span>
          )}
          {/* NO SPACER HERE ANY MORE. Lot L9, position 1. The reference's task
              metadata row is `.rec-meta` (`v3/app.css:653`), which has none —
              its four pills run left to right with one gap between them. The
              elastic span that used to stand here pushed the project badge to
              the far end of the reading column, where it read as a second,
              unrelated thing rather than as the fourth pill of one row. The
              project record keeps ITS spacer, because the reference gives that
              head one (`v3/screens/record.css:31`). */}
          {taskProjects.length === 0 ? (
            // THE MEASURED HALF OF „every pill of this row wears a glyph". This
            // is the branch the layout fixture draws — `work.overview` carries
            // `projectIds: []` — so the glyph inside it is reachable by the gate
            // and is asserted by `L9-01d`. The filled branch below carries the
            // same slot and is NOT reachable in this tree; the rule is one, the
            // proof covers the half that renders.
            <span className={styles.chipDashed}>
              <Icon name="project" />
              No project
            </span>
          ) : (
            // EVERY project, not the first: Task→Project is many-to-many and the
            // projection carries a list, so naming one would be a claim the data
            // does not make.
            taskProjects.map((project) => (
              <button
                className={styles.chip}
                key={project.id}
                onClick={() =>
                  onOpenProject(project.id as ProjectId, project.title)
                }
                type="button"
              >
                {/* ONE SLOT, ONE GLYPH, filled and empty alike — the rule the
                    project record's client slot already states in full. The
                    reference puts a glyph on every pill of this row
                    (`v3/screens/record.js:567-569`). */}
                <Icon name="project" />
                <span className={styles.chipLabel}>{project.title}</span>
              </button>
            ))
          )}
          {/* THE FOURTH PILL OF THE REFERENCE'S ROW: who it is on.
              `v3/screens/record.js:569` — `<span class="rc-assignee">${avatar}
              ${name}</span>`, quiet rather than bordered, because it is the one
              member of the row that names a PERSON and not a record.

              NOT MEASURED BY ANY GATE IN THIS TREE, and that is a fact about
              the fixture rather than about this element: the record reads its
              task from `work.overview`, and the harness's task there carries no
              `assignment` at all (`dev/CollaborationHarness.tsx:506-535`; the
              field exists only on the `task.list` copy at `:456-467`). It draws
              on real data and on nothing the layout gate opens. */}
          {task.assignment !== undefined && (
            <span className={styles.assignee}>
              <Icon name="people" />
              {task.assignment.displayName}
            </span>
          )}
        </div>
        {/* WHY THE TASK IS STANDING STILL, ON ITS OWN BAND. Lot 4 #2, and the
            element moved out of the metadata line above rather than being
            restyled in place: waiting and blocked are the only reason a task
            is not moving, and beside the status and the project they read as
            a fourth chip. `v3/screens/record.css:202-211` gives this its own
            band for exactly that reason.

            Only the state that changes how the task must be read is said out
            loud. "actionable" on every record is the default said twice. */}
        {task.operationalState !== "actionable" && (
          <span
            className={`${styles.why} ${
              styles[`why_${task.operationalState}`] ?? ""
            }`}
          >
            {task.waitingOn === undefined
              ? task.operationalState
              : `${task.operationalState} on ${task.waitingOn.label}`}
          </span>
        )}
        {/* THE PLAN AND THE DEADLINE ARE TWO CELLS. Lot 4 #2. They were one
            sentence joined by a middle dot, and they are two different facts:
            `startAt` is this Space's own intent, `dueAt` is somebody else's
            promise (`v3/screens/record.css:214-251`, and the reference's own
            comment says it in those words).

            THE CELL VALUES STAY `planSentence` AND `dueSentence`. The
            reference splits each cell further into a date, a sub-line and an
            authorship line; composing those here would mean deriving a
            seventh date voice beside the closed vocabulary in
            `tasks/task-view.ts`, which is this repository's named repeat
            defect. What the position is about is the two cells and the
            boundary between them. The reduction is deliberate.

            LOT L9, POSITION 2 (entry 12-5) TAKES TWO MORE OF THE FIVE PARTS
            the reference's cell has, and REFUSES the other two out loud.
            Taken: the glyph on each label (`v3/screens/record.js:477,489`),
            and the authorship line moved INSIDE the Plan cell, where the
            reference keeps it (`:481-482`). Refused, with the reason each:
              • the SUB-LINE under the value ("Nobody has put this in a day,
                and it has a deadline", "17 days late") is a seventh date
                voice beside the closed vocabulary in `tasks/task-view.ts`,
                and this file already carries the paragraph saying why that is
                forbidden. The sentence the app DOES say carries the same fact
                in one string;
              • the ACTION PILL (`Plan it ⌄` / `Change ⌄`) is a second place
                to answer a question the inspector rail already answers, which
                is the rule stated at the head of this file. Whether it moves
                here is a functional decision and belongs to whoever owns the
                rail's five operations — see the report for lot L9. */}
        <div className={styles.plan}>
          <div className={styles.planCell}>
            <span className={styles.planKey}>
              <Icon name="calendar" />
              Plan
            </span>
            <span
              className={`${styles.planValue} ${
                task.startAt === undefined ? styles.planUnset : ""
              }`}
            >
              {planSentence(task, prose)}
            </span>
            {/* WHO planned it and WHEN, in the cell it is about. `plannedBy`
                carries a principal, a kind and an instant — there is no "why"
                on it, and none is invented here. */}
            {planned !== undefined && (
              <span className={styles.authorship}>{planned}</span>
            )}
          </div>
          <div className={`${styles.planCell} ${styles.planCellDue}`}>
            <span className={styles.planKey}>
              <Icon name="flag" />
              Deadline
            </span>
            {/* The word "overdue" is in the sentence itself, so the colour only
                reinforces something already said. */}
            <span
              className={`${styles.planValue} ${
                task.dueAt === undefined
                  ? styles.planUnset
                  : due.startsWith("overdue")
                    ? styles.dueLate
                    : ""
              }`}
            >
              {due}
            </span>
          </div>
        </div>
        {/* Beside the state it changes. An empty fallback on purpose: a spinner
            where a small chip is about to be is more movement than the wait it
            reports. */}
        <div className={styles.operations}>
          <TaskStatePanel task={task} wiring={wiring} />
        </div>
      </header>

      <RecordTabStrip
        counts={counts}
        onSelect={select}
        recordId={taskId}
        selected={active}
        tabs={TASK_TABS}
      >
        {active === "overview" && (
          <div className={styles.overview}>
            <div className={styles.body}>
              <div className={styles.doc}>
                <section className={styles.docSection}>
                  <h2 className={styles.docHeading}>Context</h2>
                  {detail === undefined ? (
                    // The record opened from the uncapped work projection; the
                    // written context lives on the capped one. Saying "no
                    // context" here would be a claim with nothing behind it.
                    <p className={styles.note}>
                      Outside the page the task list returned, so its written
                      context is unread here.
                    </p>
                  ) : detail.description === undefined ||
                    detail.description.trim() === "" ? (
                    <p className={styles.note}>
                      No context saved yet. The inspector beside this record is
                      where it is written.
                    </p>
                  ) : (
                    <div className={styles.prose}>
                      {paragraphsOf(detail.description).map(
                        (paragraph, index) => (
                          <p key={index}>{paragraph}</p>
                        ),
                      )}
                    </div>
                  )}
                  {detail?.nextAction !== undefined &&
                    detail.nextAction !== "" && (
                      <p className={styles.nextStep}>
                        <b>Next step:</b> {detail.nextAction}
                      </p>
                    )}
                </section>

                <section className={styles.docSection}>
                  <h2 className={styles.docHeading}>Subtasks</h2>
                  {/* `parentTaskId` is the only hierarchy the model has, so the
                      section reads both ways off it: one link upward, every
                      child downward. */}
                  {parent !== undefined && (
                    <RecordRow
                      done={parent.completionState === "completed"}
                      label={parent.title}
                      meta="part of"
                      onOpen={() => onOpenTask(parent.id, parent.title)}
                    />
                  )}
                  {task.parentTaskId !== undefined && parent === undefined && (
                    <p className={styles.note}>
                      Part of a task outside this Space’s work.
                    </p>
                  )}
                  {!workKnown ? (
                    <p className={styles.note}>
                      The work plane could not be read, so whether this task is
                      split is unknown here.
                    </p>
                  ) : children.length === 0 ? (
                    // Says what is true and stops. The advice that used to
                    // follow — when a task is worth splitting — is a lecture
                    // wearing an empty state, which is the thing the prose
                    // guard exists to keep out of every screen.
                    <p className={styles.note}>Not split into subtasks.</p>
                  ) : (
                    <>
                      <p className={styles.note}>
                        {
                          children.filter(
                            (child) => child.completionState === "completed",
                          ).length
                        }{" "}
                        of {children.length} completed
                      </p>
                      <div className={styles.list}>
                        {children.map((child) => (
                          <RecordRow
                            done={child.completionState === "completed"}
                            key={child.id}
                            label={child.title}
                            meta={
                              child.completionState === "completed"
                                ? "completed"
                                : undefined
                            }
                            onOpen={() => onOpenTask(child.id, child.title)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </section>

                <section className={styles.docSection}>
                  <h2 className={styles.docHeading}>Dependencies</h2>
                  {!workKnown ? (
                    // The links ride the same projection the rows do. "Nothing
                    // waits for this" read off a slice that never came back is
                    // the one sentence on this screen that could send somebody
                    // to start work that is still blocked.
                    <p className={styles.note}>
                      The work plane could not be read, so what this task waits
                      for is unknown here.
                    </p>
                  ) : blockedBy.length === 0 && blocks.length === 0 ? (
                    <p className={styles.note}>
                      Nothing this task waits for, and nothing waiting on it.
                    </p>
                  ) : (
                    <div className={styles.list}>
                      {/* The direction is in WORDS on every row. Two lists one
                          under the other, told apart by position alone, are one
                          list to anybody hearing them. */}
                      {blockedBy.map((link) =>
                        dependencyRow(
                          link,
                          link.targetRecordId,
                          "this task depends on it",
                        ),
                      )}
                      {blocks.map((link) =>
                        dependencyRow(
                          link,
                          link.sourceRecordId,
                          "it depends on this task",
                        ),
                      )}
                    </div>
                  )}
                  {/* Only where the work plane was actually read. Offering to
                      attach a dependency over a slice that did not arrive would
                      pick from an empty list and detach from nothing. */}
                  {workKnown && (
                    <div className={styles.operations}>
                      <TaskDependencyPanel
                        blockedBy={blockedBy}
                        blocks={blocks}
                        task={task}
                        tasks={tasks}
                        wiring={wiring}
                      />
                    </div>
                  )}
                </section>

                {fields.length > 0 && (
                  <section className={styles.docSection}>
                    <h2 className={styles.docHeading}>Fields</h2>
                    <dl className={styles.fields}>
                      {fields.map((definition) => (
                        <div className={styles.fieldRow} key={definition.id}>
                          <dt className={styles.fieldLabel}>
                            {definition.label}
                            {definition.state === "retired" && " (retired)"}
                          </dt>
                          <dd className={styles.fieldValue}>
                            {fieldValueText(
                              task.fields?.[definition.id],
                              prose.timeZone,
                            )}
                            {(definition.type.kind === "formula" ||
                              definition.type.kind === "rollup") &&
                              " · calculated"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
              </div>

              {/* Readings, not controls. Every one of these has an editor in the
                  inspector rail, which stays open beside this record — so a
                  second control here would be a second answer to one question,
                  and the two would drift the first time either moved. */}
              <aside aria-label="How this task stands" className={styles.rail}>
                <section className={styles.railSection}>
                  <h3 className={styles.railHeading}>Assignee</h3>
                  {task.assignment === undefined ? (
                    <p className={styles.railNone}>Nobody is assigned</p>
                  ) : (
                    <p className={styles.railLine}>
                      {task.assignment.displayName}
                      {task.assignment.availability !== "active" &&
                        ` · ${task.assignment.availability.replaceAll("_", " ")}`}
                    </p>
                  )}
                </section>

                <section className={styles.railSection}>
                  <h3 className={styles.railHeading}>Plan</h3>
                  <p className={styles.railLine}>{planSentence(task, prose)}</p>
                  {planned !== undefined && (
                    <p className={styles.railNote}>{planned}</p>
                  )}
                </section>

                <section className={styles.railSection}>
                  <h3 className={styles.railHeading}>Capture origin</h3>
                  {captureOrigin.kind === "unknown" ? (
                    <p className={styles.railNone}>
                      Where this came from could not be read here.
                    </p>
                  ) : captureOrigin.kind === "none" ? (
                    <p className={styles.railNone}>No linked Capture source.</p>
                  ) : captureOrigin.text === undefined ? (
                    <p className={styles.railLine}>
                      Quick Capture · the original is not loaded here.
                    </p>
                  ) : (
                    <>
                      <blockquote className={styles.quote}>
                        {captureOrigin.text}
                      </blockquote>
                      <p className={styles.railNote}>
                        Quick Capture · original kept
                      </p>
                    </>
                  )}
                </section>

                <section className={styles.railSection}>
                  <h3 className={styles.railHeading}>Audit trail</h3>
                  {receipt === undefined ? (
                    <p className={styles.railNone}>
                      The full receipt stays in the local data core.
                    </p>
                  ) : (
                    <>
                      <p className={styles.railLine}>{receipt.commandName}</p>
                      <p className={styles.mono}>{receipt.id.slice(0, 18)}…</p>
                    </>
                  )}
                </section>

                <p className={styles.prov}>v{task.version}</p>
              </aside>
            </div>
          </div>
        )}

        {active === "comments" && (
          <>
            {/* A read that failed says so, and says it ABOVE the panel rather
                than in place of it. Losing the composer with the list was the
                expensive half: the write is checked against the TASK's version,
                which this slice does not carry, so it still lands with no
                threads on screen — and a reader whose only grant is `comment`
                was left with a sentence and nothing to type into. */}
            {comments.kind === "unavailable" && (
              <p className={screen.unavailable} role="status">
                {comments.message}
              </p>
            )}
            <RecordCommentsPanel
              actorOf={actorOf}
              // Permission is NOT folded into `busy`. A control dead because a
              // write is in flight and one dead because the grant is read-only
              // are different facts about the same button, and the panel is what
              // says which — it cannot, from a single boolean.
              busy={commentBusy || busy}
              canComment={canComment}
              canResolve={canResolve}
              currentPrincipalId={currentPrincipalId}
              currentDisplayName={currentDisplayName}
              mentionCandidates={mentionCandidates}
              mentionNameOf={(principalId) => mentionNameOf(principalId)}
              onAttach={onAttachToComment}
              onEdit={onEditComment}
              onInspectAttachment={onInspectAttachment}
              onResolve={onResolveComment}
              onRestoreAttachment={onRestoreAttachment}
              onSubmit={onAddComment}
              recordKey={taskId}
              threads={threads ?? []}
              // The same distinction the tab count makes: `undefined` is a list
              // that never arrived, `[]` is a record nobody has written on.
              // Collapsed into one array for the panel, so the panel is told
              // which it was.
              threadsKnown={threads !== undefined}
              timeZone={prose.timeZone}
            />
          </>
        )}

        {active === "activity" &&
          (activity.kind === "unavailable" ? (
            <p className={screen.unavailable}>{activity.message}</p>
          ) : (
            <RecordActivityPanel
              entries={activityEntries}
              timeZone={prose.timeZone}
            />
          ))}
      </RecordTabStrip>
    </div>
  );
};

export default TaskRecordScreen;
