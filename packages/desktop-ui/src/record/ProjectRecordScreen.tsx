import { useState, type ReactNode } from "react";

import type {
  DocumentId,
  KnowledgeSourceId,
  PrincipalId,
  ProjectId,
  StrategicRecordId,
  TaskId,
} from "@constellation/contracts";

import type {
  ActivityProjection,
  CommentListProjection,
  DataSlice,
  ProjectOverviewProjection,
} from "../client/workflow.js";
import { useListNavigation } from "../hooks/useListNavigation.js";
import {
  readProject,
  type ProjectProse,
  type ProjectRecord,
  type WorkTask,
} from "../projects/project-view.js";
import type { TaskStatus } from "../tasks/task-view.js";
import {
  ProjectRecordHeader,
  ProjectRecordOverview,
  type ProjectClientLinking,
} from "./ProjectRecordOverview.js";
import { RecordActivityPanel } from "./RecordActivityPanel.js";
import {
  RecordCommentsPanel,
  type MentionCandidate,
} from "./RecordCommentsPanel.js";
import {
  RecordDocumentsPanel,
  type RecordDocument,
} from "./RecordDocumentsPanel.js";
import {
  orderRecordTasks,
  recordOpenTaskCount,
  recordTaskCount,
  RecordTasksPanel,
} from "./RecordTasksPanel.js";
import {
  openThreadCount,
  restoreTab,
  type CommentActor,
  type CommentThread,
  type RecordTab,
} from "./record-tabs.js";
import { RecordTabStrip } from "./RecordTabStrip.js";
import { recordActivityItems } from "./RecordActivityPanel.js";
import styles from "./record-screen.module.css";

// The project record, assembled: the header, the tab bar and exactly one panel.
//
// This file is the CALL SITE the panels' own headers warn about, and it earns
// its existence by being the only place three rules can be kept together:
//
//  1. One `<h1>`, and it is the header's. The surface no longer draws its own
//     for this view, so the record names itself once.
//  2. `RecordTabStrip` renders the tabpanel itself; only the ACTIVE panel's
//     content is passed as `children`. A second `role="tabpanel"` or a repeated
//     panel id trips the dangling-ARIA guard locally and, in the packaged
//     smoke, burns a three-second deadline per destination and fails the whole
//     call with a message about a timeout rather than about ARIA.
//  3. Rows are built only inside the branch that is on screen. Building
//     `RecordTasksPanel` unconditionally would spend roving-tabindex indices on
//     rows nobody can see and leave the visible panel with no tab stop at all.
//
// The screen is loaded lazily by the surface. That is not a preference: the
// hot path has about five kilobytes of JavaScript and ten of CSS left against
// budgets the rebuild plan forbids raising per screen, and this file plus its
// four panels and four stylesheets are several times that. A record nobody has
// opened costs nothing.

/**
 * Which tab each record was left on.
 *
 * Device state, not graph data — the same class as pinned destinations — so it
 * travels by `localStorage`, the channel the shell already uses for exactly
 * this, and NOT by a module-level map. A map outside the component survives
 * unmount, so the second record opened in one process would inherit the first
 * one's tab; it is also invisible to anything that clears device state, which
 * made it order-dependent the first time two tests ran in one file.
 *
 * Bounded on purpose: a record opened once should not cost a line of storage
 * forever. Oldest entries fall off the end, and falling off means "opens on
 * Overview", which is the same thing a fresh install does.
 *
 * Reading goes through `restoreTab` because the tab set differs per record kind
 * and a key stored before a tab existed would otherwise leave the strip with
 * nothing selected and `aria-labelledby` pointing at an id that is not there.
 */
const TAB_STORE_KEY = "constellation.record-tab.v1";
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

const PROJECT_TABS: readonly RecordTab[] = [
  "overview",
  "tasks",
  "documents",
  "comments",
  "activity",
];

export interface ProjectRecordScreenProps {
  readonly projectId: ProjectId;
  /** The project as `project.list` carries it — the only slice that projects
   *  `updatedAt`, without which health cannot be read. */
  readonly project: ProjectRecord;
  readonly overview: ProjectOverviewProjection;
  /** Whole-Space and uncapped, from `work.overview`. `readProject` filters. */
  readonly tasks: readonly WorkTask[];
  readonly statuses: readonly TaskStatus[];
  readonly prose: ProjectProse;
  readonly documents: readonly RecordDocument[];
  readonly comments: DataSlice<CommentListProjection>;
  readonly activity: DataSlice<ActivityProjection>;
  readonly busy: boolean;
  readonly commentBusy: boolean;
  readonly canComment: boolean;
  /** Settling anybody else's thread. The author of a thread may always settle
   *  their own, which is why this and `currentPrincipalId` travel together. */
  readonly canResolve: boolean;
  readonly currentPrincipalId: PrincipalId | undefined;
  readonly actorOf: (comment: CommentThread) => CommentActor;
  readonly mentionNameOf: (principalId: string) => string;
  readonly mentionCandidates: readonly MentionCandidate[];
  /** All FOUR arguments are forwarded to the panel, and a caller that supplies
   *  a two-parameter function is assignable here while silently dropping the
   *  last two — the answer then lands as a fresh comment under a strip that
   *  promised it was a reply, and the staged files never reach the write. */
  readonly onAddComment: (
    body: string,
    mentions: readonly PrincipalId[],
    parent?: CommentThread,
    attachmentSourceIds?: readonly KnowledgeSourceId[],
  ) => Promise<boolean>;
  /** Editing and settling a comment. REQUIRED, and the reason is a defect this
   *  screen already shipped once: these were optional, the single caller filled
   *  neither, and the record quietly offered no Edit, no Unlink and no Resolve
   *  while the organization record offered all three. An optional prop nobody
   *  fills is indistinguishable from a capability nobody built, so the compiler
   *  holds the next caller to it. */
  readonly onEditComment: (
    comment: CommentThread,
    body: string,
    attachmentSourceIds?: readonly KnowledgeSourceId[],
  ) => Promise<boolean>;
  readonly onResolveComment: (
    comment: CommentThread,
    resolved: boolean,
  ) => Promise<boolean>;
  readonly onBack: () => void;
  readonly onSelectTask: (taskId: TaskId) => void;
  readonly onOpenTask: (taskId: TaskId) => void;
  readonly onNewTask: () => void;
  readonly onOpenDocument: (documentId: DocumentId, title: string) => void;
  readonly onOpenRelationship: (id: StrategicRecordId) => void;
  readonly onOpenMeeting: (id: StrategicRecordId) => void;
  readonly clientLinking?: ProjectClientLinking | undefined;
  /** The record's own document, already lazy at the caller. Overview is where
   *  it belongs: it is the record's BODY, and a reader who has to open a tab to
   *  find out what a project is for has been told the outcome is optional. */
  readonly body?: ReactNode;
  /** Editing the outcome, closing the project, applying a template and linking
   *  a task all had exactly one home — the view this screen replaces. They are
   *  passed in rather than rebuilt so the operations move with the screen
   *  instead of disappearing with it. */
  readonly actions?: ReactNode;
  readonly taskLinking?: ReactNode;
  readonly onWriteOutcome?: (() => void) | undefined;
  /** Replaces Overview's reading of the outcome while somebody is writing it. */
  readonly outcomeEditor?: ReactNode;
}

export const ProjectRecordScreen = ({
  projectId,
  project,
  overview,
  tasks,
  statuses,
  prose,
  documents,
  comments,
  activity,
  busy,
  commentBusy,
  canComment,
  canResolve,
  currentPrincipalId,
  actorOf,
  mentionNameOf,
  mentionCandidates,
  onAddComment,
  onEditComment,
  onResolveComment,
  onBack,
  onSelectTask,
  onOpenTask,
  onNewTask,
  onOpenDocument,
  onOpenRelationship,
  onOpenMeeting,
  clientLinking,
  body,
  actions,
  taskLinking,
  onWriteOutcome,
  outcomeEditor,
}: ProjectRecordScreenProps) => {
  const [selected, setSelected] = useState<RecordTab>(() =>
    restoreTab(readStoredTabs()[projectId]),
  );
  const select = (tab: RecordTab): void => {
    rememberTab(projectId, tab);
    setSelected(tab);
  };

  const reading = readProject(project, tasks, prose);
  const projectTasks = reading.all;
  // Undefined and empty are DIFFERENT facts. A failed load collapsed into an
  // empty list put "Comments 0" on the tab beside a panel saying the comments
  // could not be read — a number is a claim, and there was nothing to claim it
  // from. No number is the honest reading of a slice that never arrived.
  const threads = comments.kind === "ready" ? comments.data.threads : undefined;
  const activityEntries =
    activity.kind === "ready"
      ? recordActivityItems(
          activity.data.items.filter((item) => item.recordId === projectId),
        ).map((item) => ({ item }))
      : [];

  // Sized by the panel that is on screen, and by nothing else. `itemCount` is
  // zero on every other tab because no other panel draws a selectable row —
  // an index reserved for a row that was never built puts the single tab stop
  // on a null ref and leaves the visible panel unreachable from the keyboard.
  const rows =
    selected === "tasks" ? recordTaskCount(projectTasks, statuses) : 0;
  const itemProps = useListNavigation({
    itemCount: rows,
    onOpen: (index) => {
      const task = orderRecordTasks(projectTasks, statuses)[index];
      if (task !== undefined) onOpenTask(task.id);
    },
    onSelect: (index) => {
      const task = orderRecordTasks(projectTasks, statuses)[index];
      if (task !== undefined) onSelectTask(task.id);
    },
  });

  const counts: Partial<Record<RecordTab, number>> = {
    tasks: recordOpenTaskCount(projectTasks),
    documents: documents.length,
    ...(threads === undefined ? {} : { comments: openThreadCount(threads) }),
  };

  const client = overview.clientOrganizations[0];

  return (
    <div className={styles.screen} data-record-kind="project">
      <div className={styles.crumbs}>
        <button className={styles.back} onClick={onBack} type="button">
          <span aria-hidden="true">‹</span> Projects
        </button>
        {actions !== undefined && (
          <div className={styles.actions}>{actions}</div>
        )}
      </div>

      <ProjectRecordHeader
        client={client}
        onOpenClient={
          client === undefined
            ? undefined
            : (organization) =>
                onOpenRelationship(organization.id as StrategicRecordId)
        }
        prose={prose}
        reading={reading}
      />

      <RecordTabStrip
        counts={counts}
        onSelect={select}
        recordId={projectId}
        selected={selected}
        tabs={PROJECT_TABS}
      >
        {selected === "overview" && (
          <>
            <ProjectRecordOverview
              clientLinking={clientLinking}
              onOpenClient={(organization) =>
                onOpenRelationship(organization.id as StrategicRecordId)
              }
              onOpenDecision={(id) =>
                onOpenRelationship(id as StrategicRecordId)
              }
              onOpenMeeting={(id) => onOpenMeeting(id as StrategicRecordId)}
              onWriteOutcome={onWriteOutcome}
              outcomeEditor={outcomeEditor}
              overview={overview}
              reading={reading}
            />
            {body}
          </>
        )}

        {selected === "tasks" && (
          <>
            <RecordTasksPanel
              itemProps={itemProps}
              onNewTask={onNewTask}
              onOpen={onOpenTask}
              onSelect={onSelectTask}
              prose={{ timeZone: prose.timeZone, todayKey: prose.todayKey }}
              statuses={statuses}
              tasks={projectTasks}
            />
            {taskLinking}
          </>
        )}

        {selected === "documents" && (
          <RecordDocumentsPanel
            documents={documents}
            onOpen={(documentId) => {
              const entry = documents.find((item) => item.id === documentId);
              onOpenDocument(documentId, entry?.title ?? "Document");
            }}
            timeZone={prose.timeZone}
          />
        )}

        {selected === "comments" &&
          (comments.kind === "unavailable" ? (
            <p className={styles.unavailable}>{comments.message}</p>
          ) : (
            <RecordCommentsPanel
              actorOf={actorOf}
              // Permission is NOT folded into `busy` any more. A control dead
              // because a write is in flight and one dead because the grant is
              // read-only are different facts about the same button, and the
              // panel is what says which — it cannot, from a single boolean.
              busy={commentBusy || busy}
              canComment={canComment}
              canResolve={canResolve}
              currentPrincipalId={currentPrincipalId}
              mentionCandidates={mentionCandidates}
              mentionNameOf={(principalId) => mentionNameOf(principalId)}
              onEdit={onEditComment}
              onResolve={onResolveComment}
              onSubmit={onAddComment}
              recordKey={projectId}
              threads={threads ?? []}
              timeZone={prose.timeZone}
            />
          ))}

        {selected === "activity" &&
          (activity.kind === "unavailable" ? (
            <p className={styles.unavailable}>{activity.message}</p>
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

export default ProjectRecordScreen;
