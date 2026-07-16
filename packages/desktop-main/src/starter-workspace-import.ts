import { createHash, randomUUID } from "node:crypto";

import {
  CaptureIdSchema,
  CommandEnvelopeSchema,
  StrategicRecordIdSchema,
  type DeviceId,
  type CommandOutcome,
  type ProjectId,
  type SpaceId,
  type TaskId,
  type WorkspaceId,
} from "@constellation/contracts";

import type { DesktopKernelService } from "./runtime-kernel-service.js";

interface StarterArea {
  readonly key: string;
  readonly title: string;
  readonly responsibility: string;
}

interface StarterInitiative {
  readonly key: string;
  readonly title: string;
  readonly intendedOutcome: string;
}

interface StarterProject {
  readonly key: string;
  readonly title: string;
  readonly intendedOutcome: string;
  readonly areaKey?: string;
  readonly initiativeKey?: string;
}

interface StarterTask {
  readonly key: string;
  readonly title: string;
  readonly projectKey?: string;
  readonly operationalState?: "actionable" | "waiting" | "blocked";
  readonly waitingOn?: string;
}

export interface StarterWorkspaceManifest {
  readonly version: 1;
  readonly importId: string;
  readonly areas: readonly StarterArea[];
  readonly initiatives: readonly StarterInitiative[];
  readonly projects: readonly StarterProject[];
  readonly tasks: readonly StarterTask[];
}

export interface StarterWorkspaceImportResult {
  readonly areas: number;
  readonly initiatives: number;
  readonly projects: number;
  readonly tasks: number;
  readonly links: number;
}

export const previewStarterWorkspace = (
  manifest: StarterWorkspaceManifest,
): StarterWorkspaceImportResult => ({
  areas: manifest.areas.length,
  initiatives: manifest.initiatives.length,
  projects: manifest.projects.length,
  tasks: manifest.tasks.length,
  links:
    manifest.projects.filter((project) => project.areaKey !== undefined)
      .length +
    manifest.projects.filter((project) => project.initiativeKey !== undefined)
      .length +
    manifest.tasks.filter((task) => task.projectKey !== undefined).length,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
};

const text = (value: unknown, maximum: number): string | undefined =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= maximum
    ? value.trim()
    : undefined;

const key = (value: unknown): string | undefined => {
  const parsed = text(value, 80);
  return parsed !== undefined && /^[a-z0-9][a-z0-9._-]*$/.test(parsed)
    ? parsed
    : undefined;
};

const parseArray = <T>(
  value: unknown,
  parser: (item: unknown) => T | undefined,
): readonly T[] | undefined => {
  if (!Array.isArray(value) || value.length > 100) return undefined;
  const parsed = value.map(parser);
  return parsed.every((item): item is T => item !== undefined)
    ? parsed
    : undefined;
};

export const parseStarterWorkspaceManifest = (
  value: unknown,
): StarterWorkspaceManifest | undefined => {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "version",
      "importId",
      "areas",
      "initiatives",
      "projects",
      "tasks",
    ]) ||
    value.version !== 1 ||
    typeof value.importId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(value.importId)
  )
    return undefined;
  const areas = parseArray(value.areas, (item): StarterArea | undefined => {
    if (!isRecord(item) || !exactKeys(item, ["key", "title", "responsibility"]))
      return undefined;
    const parsedKey = key(item.key);
    const title = text(item.title, 500);
    const responsibility = text(item.responsibility, 4_000);
    return parsedKey && title && responsibility
      ? { key: parsedKey, title, responsibility }
      : undefined;
  });
  const initiatives = parseArray(
    value.initiatives,
    (item): StarterInitiative | undefined => {
      if (
        !isRecord(item) ||
        !exactKeys(item, ["key", "title", "intendedOutcome"])
      )
        return undefined;
      const parsedKey = key(item.key);
      const title = text(item.title, 500);
      const intendedOutcome = text(item.intendedOutcome, 4_000);
      return parsedKey && title && intendedOutcome
        ? { key: parsedKey, title, intendedOutcome }
        : undefined;
    },
  );
  const projects = parseArray(
    value.projects,
    (item): StarterProject | undefined => {
      if (
        !isRecord(item) ||
        !exactKeys(
          item,
          ["key", "title", "intendedOutcome"],
          ["areaKey", "initiativeKey"],
        )
      )
        return undefined;
      const parsedKey = key(item.key);
      const title = text(item.title, 500);
      const intendedOutcome = text(item.intendedOutcome, 4_000);
      const areaKey =
        item.areaKey === undefined ? undefined : key(item.areaKey);
      const initiativeKey =
        item.initiativeKey === undefined ? undefined : key(item.initiativeKey);
      if (
        !parsedKey ||
        !title ||
        !intendedOutcome ||
        (item.areaKey !== undefined && !areaKey) ||
        (item.initiativeKey !== undefined && !initiativeKey)
      )
        return undefined;
      return {
        key: parsedKey,
        title,
        intendedOutcome,
        ...(areaKey ? { areaKey } : {}),
        ...(initiativeKey ? { initiativeKey } : {}),
      };
    },
  );
  const tasks = parseArray(value.tasks, (item): StarterTask | undefined => {
    if (
      !isRecord(item) ||
      !exactKeys(
        item,
        ["key", "title"],
        ["projectKey", "operationalState", "waitingOn"],
      )
    )
      return undefined;
    const parsedKey = key(item.key);
    const title = text(item.title, 500);
    const projectKey =
      item.projectKey === undefined ? undefined : key(item.projectKey);
    const operationalState = item.operationalState;
    const waitingOn =
      item.waitingOn === undefined ? undefined : text(item.waitingOn, 500);
    if (
      !parsedKey ||
      !title ||
      (item.projectKey !== undefined && !projectKey) ||
      (operationalState !== undefined &&
        operationalState !== "actionable" &&
        operationalState !== "waiting" &&
        operationalState !== "blocked") ||
      (item.waitingOn !== undefined && !waitingOn) ||
      ((operationalState === "waiting" || operationalState === "blocked") &&
        !waitingOn)
    )
      return undefined;
    return {
      key: parsedKey,
      title,
      ...(projectKey ? { projectKey } : {}),
      ...(operationalState ? { operationalState } : {}),
      ...(waitingOn ? { waitingOn } : {}),
    };
  });
  if (!areas || !initiatives || !projects || !tasks) return undefined;
  const allKeys = [
    ...areas.map((item) => `area:${item.key}`),
    ...initiatives.map((item) => `initiative:${item.key}`),
    ...projects.map((item) => `project:${item.key}`),
    ...tasks.map((item) => `task:${item.key}`),
  ];
  if (new Set(allKeys).size !== allKeys.length) return undefined;
  if (
    projects.some(
      (project) =>
        (project.areaKey &&
          !areas.some((area) => area.key === project.areaKey)) ||
        (project.initiativeKey &&
          !initiatives.some(
            (initiative) => initiative.key === project.initiativeKey,
          )),
    ) ||
    tasks.some(
      (task) =>
        task.projectKey &&
        !projects.some((project) => project.key === task.projectKey),
    )
  )
    return undefined;
  return {
    version: 1,
    importId: value.importId,
    areas,
    initiatives,
    projects,
    tasks,
  };
};

const deterministicUuid = (seed: string): string => {
  const chars = createHash("sha256")
    .update(seed)
    .digest("hex")
    .slice(0, 32)
    .split("");
  chars[12] = "4";
  chars[16] = ((Number.parseInt(chars[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${chars.slice(0, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}-${chars.slice(16, 20).join("")}-${chars.slice(20).join("")}`;
};

const execute = (
  service: DesktopKernelService,
  input: Record<string, unknown>,
): Extract<CommandOutcome, { outcome: "success" }> => {
  const result = service.execute(CommandEnvelopeSchema.parse(input));
  if (result.kind !== "command_outcome" || result.outcome.outcome !== "success")
    throw new Error("STARTER_WORKSPACE_COMMAND_FAILED");
  return result.outcome;
};

export const importStarterWorkspace = (input: {
  readonly service: DesktopKernelService;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly deviceId: DeviceId;
  readonly manifest: StarterWorkspaceManifest;
}): StarterWorkspaceImportResult => {
  const base = (
    keyName: string,
    expectedVersions: Record<string, number> = {},
  ) => ({
    contractVersion: 1,
    commandId: randomUUID(),
    workspaceId: input.workspaceId,
    idempotencyKey: `starter:${input.manifest.importId}:${keyName}`,
    expectedVersions,
    correlationId: input.manifest.importId,
  });
  const areaIds = new Map<string, string>();
  const initiativeIds = new Map<string, string>();
  const projectIds = new Map<string, ProjectId>();
  let links = 0;
  for (const area of input.manifest.areas) {
    const areaId = StrategicRecordIdSchema.parse(
      deterministicUuid(`${input.manifest.importId}:area:${area.key}`),
    );
    execute(input.service, {
      ...base(`area:${area.key}`),
      commandName: "area.create",
      payload: {
        areaId,
        spaceId: input.spaceId,
        title: area.title,
        responsibility: area.responsibility,
      },
    });
    areaIds.set(area.key, areaId);
  }
  for (const initiative of input.manifest.initiatives) {
    const initiativeId = StrategicRecordIdSchema.parse(
      deterministicUuid(
        `${input.manifest.importId}:initiative:${initiative.key}`,
      ),
    );
    execute(input.service, {
      ...base(`initiative:${initiative.key}`),
      commandName: "initiative.create",
      payload: {
        initiativeId,
        spaceId: input.spaceId,
        title: initiative.title,
        intendedOutcome: initiative.intendedOutcome,
      },
    });
    initiativeIds.set(initiative.key, initiativeId);
  }
  for (const project of input.manifest.projects) {
    const result = execute(input.service, {
      ...base(`project:${project.key}`),
      commandName: "project.create",
      payload: {
        spaceId: input.spaceId,
        title: project.title,
        intendedOutcome: project.intendedOutcome,
      },
    });
    if (result.projection.kind !== "project.created")
      throw new Error("STARTER_WORKSPACE_PROJECT_INVALID");
    const projectId = result.projection.projectId;
    projectIds.set(project.key, projectId);
    const targets = [
      project.areaKey
        ? {
            type: "project_serves_area",
            key: `area:${project.areaKey}`,
            id: areaIds.get(project.areaKey),
          }
        : undefined,
      project.initiativeKey
        ? {
            type: "project_advances_initiative",
            key: `initiative:${project.initiativeKey}`,
            id: initiativeIds.get(project.initiativeKey),
          }
        : undefined,
    ].filter(
      (
        item,
      ): item is {
        type: "project_serves_area" | "project_advances_initiative";
        key: string;
        id: string;
      } => item?.id !== undefined,
    );
    for (const target of targets) {
      execute(input.service, {
        ...base(`link:${project.key}:${target.key}`),
        commandName: "work.linkCreate",
        payload: {
          linkId: StrategicRecordIdSchema.parse(
            deterministicUuid(
              `${input.manifest.importId}:link:${project.key}:${target.key}`,
            ),
          ),
          spaceId: input.spaceId,
          linkType: target.type,
          sourceRecordId: projectId,
          targetRecordId: target.id,
        },
      });
      links += 1;
    }
  }
  for (const task of input.manifest.tasks) {
    const stored = execute(input.service, {
      ...base(`task:${task.key}:capture`),
      commandName: "capture.submit",
      payload: {
        spaceId: input.spaceId,
        original: { kind: "text", text: task.title },
        deviceId: input.deviceId,
        source: "in_app_quick_capture",
      },
    });
    if (stored.projection.kind !== "capture.stored")
      throw new Error("STARTER_WORKSPACE_CAPTURE_INVALID");
    const captureId = CaptureIdSchema.parse(stored.projection.captureId);
    const routed = execute(input.service, {
      ...base(`task:${task.key}:process`, {
        [captureId]: stored.projection.version,
      }),
      commandName: "capture.process",
      payload: { captureId, destination: "task", title: task.title },
    });
    if (routed.projection.kind !== "capture.routed_as_task")
      throw new Error("STARTER_WORKSPACE_TASK_INVALID");
    const taskId: TaskId = routed.projection.taskId;
    let taskVersion = routed.projection.taskVersion;
    if (task.operationalState && task.operationalState !== "actionable") {
      const state = execute(input.service, {
        ...base(`task:${task.key}:state`, { [taskId]: taskVersion }),
        commandName: "task.setOperationalState",
        payload: {
          taskId,
          operationalState: task.operationalState,
          waitingOn: {
            kind: "external",
            label: task.waitingOn,
          },
        },
      });
      if (state.projection.kind !== "task.operational_state_changed")
        throw new Error("STARTER_WORKSPACE_TASK_STATE_INVALID");
      taskVersion = state.projection.version;
    }
    if (task.projectKey) {
      const projectId = projectIds.get(task.projectKey);
      if (!projectId) throw new Error("STARTER_WORKSPACE_PROJECT_MISSING");
      execute(input.service, {
        ...base(`task:${task.key}:project`, {
          [taskId]: taskVersion,
          [projectId]: 1,
        }),
        commandName: "record.relate",
        payload: {
          relationType: "task_contributes_to_project",
          taskId,
          projectId,
        },
      });
      links += 1;
    }
  }
  return {
    areas: input.manifest.areas.length,
    initiatives: input.manifest.initiatives.length,
    projects: input.manifest.projects.length,
    tasks: input.manifest.tasks.length,
    links,
  };
};
