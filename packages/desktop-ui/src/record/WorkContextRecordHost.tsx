import { useEffect, useMemo, useState } from "react";

import type {
  ProjectId,
  RelationId,
  StrategicRecordId,
  TaskId,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  createTask,
  createWorkLink,
  loadAreaOverview,
  loadInitiativeOverview,
  loadWorkContextCandidates,
  relateTaskToContext,
  removeWorkLink,
  setAreaLifecycle,
  setInitiativeLifecycle,
  unrelateTask,
  updateAreaResponsibility,
  updateInitiativeOutcome,
  type AreaOverviewProjection,
  type DesktopSnapshot,
  type InitiativeOverviewProjection,
  type MutationFailure,
  type MutationResult,
} from "../client/workflow.js";
import { AreaRecordScreen } from "./AreaRecordScreen.js";
import { InitiativeRecordScreen } from "./InitiativeRecordScreen.js";

export interface WorkContextRecordHostProps {
  readonly client: ConstellationRendererClient;
  readonly snapshot: DesktopSnapshot;
  readonly areaId?: StrategicRecordId;
  readonly initiativeId?: StrategicRecordId;
  readonly onBack: () => void;
  readonly onOpenTask: (taskId: TaskId) => void;
  readonly onOpenProject: (projectId: ProjectId) => void;
  readonly onWrote: (message: string) => Promise<void>;
  readonly onWroteWithoutUndo: (message: string) => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}

type Overview = AreaOverviewProjection | InitiativeOverviewProjection;

export const WorkContextRecordHost = ({
  client,
  snapshot,
  areaId,
  initiativeId,
  onBack,
  onOpenTask,
  onOpenProject,
  onWrote,
  onWroteWithoutUndo,
  onFailure,
}: WorkContextRecordHostProps) => {
  const [overview, setOverview] = useState<Overview>();
  const [loadError, setLoadError] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [spaceTasks, setSpaceTasks] = useState<
    Awaited<ReturnType<typeof loadWorkContextCandidates>>["tasks"]
  >([]);
  const [spaceProjects, setSpaceProjects] = useState<
    Awaited<ReturnType<typeof loadWorkContextCandidates>>["projects"]
  >([]);

  useEffect(() => {
    if (areaId === undefined && initiativeId === undefined) {
      setOverview(undefined);
      return;
    }
    let active = true;
    setLoadError(undefined);
    const request =
      areaId === undefined
        ? loadInitiativeOverview(client, snapshot, initiativeId!)
        : loadAreaOverview(client, snapshot, areaId);
    void request
      .then(async (result) => {
        const record =
          result.kind === "area.operationalOverview"
            ? result.area
            : result.initiative;
        const candidates = await loadWorkContextCandidates(
          client,
          snapshot,
          record.spaceId,
        );
        if (active) {
          setSpaceTasks(candidates.tasks);
          setSpaceProjects(candidates.projects);
          setOverview(result);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setOverview(undefined);
        setLoadError(
          error instanceof Error
            ? error.message
            : "The work context overview is unavailable.",
        );
      });
    return () => {
      active = false;
    };
  }, [areaId, client, initiativeId, loadAttempt, snapshot]);

  const record =
    overview?.kind === "area.operationalOverview"
      ? overview.area
      : overview?.kind === "initiative.operationalOverview"
        ? overview.initiative
        : undefined;
  const directTaskIds = useMemo(
    () => new Set(overview?.directTasks.map((task) => task.id) ?? []),
    [overview],
  );
  const linkedProjectIds = useMemo(
    () => new Set(overview?.projects.map((project) => project.id) ?? []),
    [overview],
  );

  if (loadError !== undefined)
    return (
      <section role="status">
        <p>{loadError}</p>
        <button
          onClick={() => setLoadAttempt((value) => value + 1)}
          type="button"
        >
          Try again
        </button>
      </section>
    );
  if (overview === undefined || record === undefined)
    return <p className="capacity-note">Opening the record…</p>;

  const isArea = overview.kind === "area.operationalOverview";
  const target = {
    kind: isArea ? ("area" as const) : ("initiative" as const),
    id: record.id,
    version: record.version,
  };
  const taskCandidates = spaceTasks.filter(
    (task) => !directTaskIds.has(task.id),
  );
  const projectCandidates = spaceProjects.filter(
    (project) => !linkedProjectIds.has(project.id),
  );
  const finish = async (
    result: MutationResult<unknown>,
    message: string,
    allowUndo = true,
  ): Promise<boolean> => {
    setBusy(false);
    if (result.kind !== "success") {
      onFailure(result);
      return false;
    }
    await (allowUndo ? onWrote(message) : onWroteWithoutUndo(message));
    return true;
  };
  const shared = {
    activity: snapshot.activity,
    busy,
    timeZone: snapshot.bootstrap.workspace.timezone,
    taskCandidates,
    projectCandidates,
    onBack,
    onOpenTask,
    onOpenProject,
    onCreateTask: async (title: string): Promise<boolean> => {
      setBusy(true);
      const created = await createTask(client, snapshot, {
        title,
        spaceId: record.spaceId,
      });
      if (created.kind !== "success") return finish(created, "");
      return finish(
        await relateTaskToContext(
          client,
          snapshot,
          { id: created.data.taskId, version: created.data.version },
          target,
        ),
        "Task created and linked directly.",
      );
    },
    onLinkTask: async (taskId: TaskId): Promise<boolean> => {
      const task = taskCandidates.find((item) => item.id === taskId);
      if (task === undefined) return false;
      setBusy(true);
      return finish(
        await relateTaskToContext(client, snapshot, task, target),
        "Task linked directly.",
      );
    },
    onUnlinkTask: async (
      relationId: RelationId,
      relationVersion: number,
    ): Promise<boolean> => {
      setBusy(true);
      return finish(
        await unrelateTask(client, snapshot, relationId, relationVersion),
        "Task unlinked.",
      );
    },
    onLinkProject: async (projectId: ProjectId): Promise<boolean> => {
      setBusy(true);
      return finish(
        await createWorkLink(
          client,
          snapshot,
          record.spaceId,
          isArea ? "project_serves_area" : "project_advances_initiative",
          projectId,
          record.id,
        ),
        "Project linked.",
      );
    },
    onUnlinkProject: async (
      linkId: StrategicRecordId,
      linkVersion: number,
    ): Promise<boolean> => {
      setBusy(true);
      return finish(
        await removeWorkLink(client, snapshot, {
          id: linkId,
          version: linkVersion,
        }),
        "Project unlinked.",
      );
    },
    onUpdateNarrative: async (value: string): Promise<boolean> => {
      setBusy(true);
      return finish(
        isArea
          ? await updateAreaResponsibility(client, snapshot, record, value)
          : await updateInitiativeOutcome(client, snapshot, record, value),
        isArea ? "Responsibility saved." : "Intended outcome saved.",
      );
    },
    onSetLifecycle: async (): Promise<boolean> => {
      setBusy(true);
      return finish(
        isArea
          ? await setAreaLifecycle(
              client,
              snapshot,
              record,
              record.state === "active" ? "archived" : "active",
            )
          : await setInitiativeLifecycle(
              client,
              snapshot,
              record,
              record.state === "active" ? "closed" : "active",
            ),
        isArea
          ? record.state === "active"
            ? "Area archived."
            : "Area restored."
          : record.state === "active"
            ? "Initiative closed."
            : "Initiative reopened.",
        false,
      );
    },
  };

  return isArea ? (
    <AreaRecordScreen {...shared} overview={overview} />
  ) : (
    <InitiativeRecordScreen {...shared} overview={overview} />
  );
};

export default WorkContextRecordHost;
