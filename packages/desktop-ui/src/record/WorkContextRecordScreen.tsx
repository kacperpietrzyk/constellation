import { useState, type FormEvent } from "react";

import type {
  ProjectId,
  RelationId,
  StrategicRecordId,
  TaskId,
} from "@constellation/contracts";

import type {
  ActivityProjection,
  AreaOverviewProjection,
  DataSlice,
  InitiativeOverviewProjection,
} from "../client/workflow.js";
import { NarrativeText } from "../components/RecordNarrative.js";
import {
  RecordActivityPanel,
  recordActivityEntries,
} from "./RecordActivityPanel.js";
import type { RecordTab } from "./record-tabs.js";
import { RecordTabStrip } from "./RecordTabStrip.js";
import screen from "./record-screen.module.css";
import styles from "./work-context-record.module.css";

type ContextOverview = AreaOverviewProjection | InitiativeOverviewProjection;
type ContextKind = "area" | "initiative";

export interface WorkContextRecordScreenProps {
  readonly kind: ContextKind;
  readonly overview: ContextOverview;
  readonly activity: DataSlice<ActivityProjection>;
  readonly timeZone: string;
  readonly busy: boolean;
  readonly taskCandidates: readonly {
    readonly id: TaskId;
    readonly title: string;
  }[];
  readonly projectCandidates: readonly {
    readonly id: ProjectId;
    readonly title: string;
  }[];
  readonly onBack: () => void;
  readonly onOpenTask: (taskId: TaskId) => void;
  readonly onOpenProject: (projectId: ProjectId) => void;
  readonly onCreateTask: (title: string) => Promise<boolean>;
  readonly onLinkTask: (taskId: TaskId) => Promise<boolean>;
  readonly onUnlinkTask: (
    relationId: RelationId,
    relationVersion: number,
  ) => Promise<boolean>;
  readonly onLinkProject: (projectId: ProjectId) => Promise<boolean>;
  readonly onUnlinkProject: (
    linkId: StrategicRecordId,
    linkVersion: number,
  ) => Promise<boolean>;
  readonly onUpdateNarrative: (value: string) => Promise<boolean>;
  readonly onSetLifecycle: () => Promise<boolean>;
}

const tabs: readonly RecordTab[] = [
  "overview",
  "tasks",
  "projects",
  "activity",
];

export const WorkContextRecordScreen = ({
  kind,
  overview,
  activity,
  timeZone,
  busy,
  taskCandidates,
  projectCandidates,
  onBack,
  onOpenTask,
  onOpenProject,
  onCreateTask,
  onLinkTask,
  onUnlinkTask,
  onLinkProject,
  onUnlinkProject,
  onUpdateNarrative,
  onSetLifecycle,
}: WorkContextRecordScreenProps) => {
  const [selected, setSelected] = useState<RecordTab>("overview");
  const [editing, setEditing] = useState(false);
  const record =
    overview.kind === "area.operationalOverview"
      ? overview.area
      : overview.initiative;
  const narrative =
    overview.kind === "area.operationalOverview"
      ? overview.area.responsibility
      : overview.initiative.intendedOutcome;
  const needsReview = record.needsReview;
  const lifecycle = record.state;
  const isActive = lifecycle === "active";
  const activityEntries =
    activity.kind === "ready"
      ? recordActivityEntries(activity.data.items, record.id)
      : [];

  const submitNewTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") ?? "").trim();
    if (title !== "" && (await onCreateTask(title))) form.reset();
  };
  const submitLinkTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const taskId = String(
      new FormData(event.currentTarget).get("taskId") ?? "",
    );
    if (taskId !== "") await onLinkTask(taskId as TaskId);
  };
  const submitLinkProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const projectId = String(
      new FormData(event.currentTarget).get("projectId") ?? "",
    );
    if (projectId !== "") await onLinkProject(projectId as ProjectId);
  };

  return (
    <div className={screen.screen}>
      <header className={screen.crumbs}>
        <button className={screen.back} onClick={onBack} type="button">
          Projects
        </button>
        <span aria-hidden="true" className={screen.crumbSeparator}>
          ›
        </span>
        <span className={screen.crumbCurrent}>{record.title}</span>
        <div className={screen.actions}>
          <button
            className="primary-button compact"
            onClick={() => setSelected("tasks")}
            type="button"
          >
            New task
          </button>
          <button
            className="ghost-button"
            onClick={() => setEditing((value) => !value)}
            type="button"
          >
            {editing
              ? "Cancel edit"
              : kind === "area"
                ? "Edit responsibility"
                : "Edit outcome"}
          </button>
          <button
            className="secondary-button compact"
            disabled={busy}
            onClick={() => void onSetLifecycle()}
            type="button"
          >
            {kind === "area"
              ? isActive
                ? "Archive area"
                : "Restore area"
              : isActive
                ? "Close initiative"
                : "Reopen initiative"}
          </button>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.kind}>
            {kind === "area"
              ? "Area of responsibility"
              : "Strategic initiative"}
          </span>
          <h1>{record.title}</h1>
        </div>
        <span className={styles.state}>{isActive ? "Active" : lifecycle}</span>
      </section>

      <RecordTabStrip
        counts={{
          tasks: overview.directTaskCount,
          projects: overview.projectCount,
        }}
        onSelect={setSelected}
        recordId={record.id}
        selected={selected}
        tabs={tabs}
      >
        {selected === "overview" && (
          <section className={styles.overview}>
            <h2>{kind === "area" ? "Responsibility" : "Intended outcome"}</h2>
            {editing ? (
              <form
                className={styles.editor}
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = String(
                    new FormData(event.currentTarget).get("narrative") ?? "",
                  ).trim();
                  if (value !== "")
                    void onUpdateNarrative(value).then(
                      (saved) => saved && setEditing(false),
                    );
                }}
              >
                <textarea
                  aria-label={
                    kind === "area" ? "Responsibility" : "Intended outcome"
                  }
                  defaultValue={narrative}
                  name="narrative"
                  required
                />
                <button
                  className="primary-button"
                  disabled={busy}
                  type="submit"
                >
                  Save
                </button>
              </form>
            ) : (
              <NarrativeText
                kind={kind}
                needsReview={needsReview}
                text={narrative}
              />
            )}
            <p className={styles.hint}>
              {kind === "area"
                ? "This responsibility continues when its current work closes."
                : "Completion is explicit; closing contributing projects does not close this initiative."}
            </p>
          </section>
        )}

        {selected === "tasks" && (
          <section className={styles.panel} aria-label="Direct tasks">
            <div className={styles.tools}>
              <form onSubmit={(event) => void submitNewTask(event)}>
                <input
                  aria-label="New direct task"
                  name="title"
                  placeholder="New direct task"
                  required
                />
                <button disabled={busy} type="submit">
                  Create and link
                </button>
              </form>
              {taskCandidates.length > 0 && (
                <form onSubmit={(event) => void submitLinkTask(event)}>
                  <select aria-label="Existing task" name="taskId" required>
                    <option value="">Choose task</option>
                    {taskCandidates.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                  <button disabled={busy} type="submit">
                    Link task
                  </button>
                </form>
              )}
            </div>
            {overview.directTasks.length === 0 ? (
              <p className={styles.empty}>No directly related tasks yet.</p>
            ) : (
              <ul className={styles.rows}>
                {overview.directTasks.map((task) => (
                  <li key={task.id}>
                    <button onClick={() => onOpenTask(task.id)} type="button">
                      <strong>{task.title}</strong>
                      <small>
                        {task.completionState === "completed"
                          ? "Completed"
                          : "Open"}
                      </small>
                    </button>
                    <button
                      aria-label={`Unlink task: ${task.title}`}
                      disabled={busy}
                      onClick={() =>
                        void onUnlinkTask(task.relationId, task.relationVersion)
                      }
                      type="button"
                    >
                      Unlink
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {overview.directTaskCount > overview.directTasks.length && (
              <p className={styles.hint}>
                Showing the first {overview.directTasks.length} direct tasks.
              </p>
            )}
          </section>
        )}

        {selected === "projects" && (
          <section className={styles.panel} aria-label="Contributing projects">
            {projectCandidates.length > 0 && (
              <form
                className={styles.linkForm}
                onSubmit={(event) => void submitLinkProject(event)}
              >
                <select aria-label="Project to link" name="projectId" required>
                  <option value="">Choose project</option>
                  {projectCandidates.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
                <button disabled={busy} type="submit">
                  Link project
                </button>
              </form>
            )}
            {overview.projects.length === 0 ? (
              <p className={styles.empty}>No projects linked yet.</p>
            ) : (
              <ul className={styles.rows}>
                {overview.projects.map((project) => (
                  <li key={project.id}>
                    <button
                      onClick={() => onOpenProject(project.id)}
                      type="button"
                    >
                      <strong>{project.title}</strong>
                      <small>
                        {project.lifecycle === "active" ? "Active" : "Closed"}
                      </small>
                    </button>
                    <button
                      aria-label={`Unlink project: ${project.title}`}
                      disabled={busy}
                      onClick={() =>
                        void onUnlinkProject(
                          project.linkId,
                          project.linkVersion,
                        )
                      }
                      type="button"
                    >
                      Unlink
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {overview.projectCount > overview.projects.length && (
              <p className={styles.hint}>
                Showing the first {overview.projects.length} projects.
              </p>
            )}
          </section>
        )}

        {selected === "activity" &&
          (activity.kind === "unavailable" ? (
            <p className={styles.empty} role="status">
              {activity.message}
            </p>
          ) : (
            <RecordActivityPanel
              entries={activityEntries}
              timeZone={timeZone}
            />
          ))}
      </RecordTabStrip>
    </div>
  );
};
