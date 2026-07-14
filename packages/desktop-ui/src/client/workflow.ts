import {
  CommandEnvelopeSchema,
  QueryEnvelopeSchema,
  type AuditReceiptId,
  type CommandId,
  type DataHomeStatus,
  type ProjectId,
  type PrincipalId,
  type QueryName,
  type QueryProjection,
  type RelationId,
  type SpaceId,
  type TaskId,
  type TaskStatusId,
  type WorkspaceId,
} from "@constellation/contracts";
import type {
  ConstellationRendererClient,
  DesktopBuildInfo,
  RendererCommandResponse,
  RendererQueryResponse,
} from "@constellation/desktop-preload/client";

type Projection<Kind extends QueryProjection["kind"]> = Extract<
  QueryProjection,
  { kind: Kind }
>;
type BootstrapProjection = Projection<"workspace.bootstrapContext">;
type TaskListProjection = Projection<"task.list">;
export type TaskAssignmentCandidatesProjection =
  Projection<"task.assignmentCandidates">;
type CaptureHistoryProjection = Projection<"capture.history">;
export type AccessProjection = Projection<"workspace.access">;
export type ProjectListProjection = Projection<"project.list">;
export type ProjectOverviewProjection =
  Projection<"project.operationalOverview">;
export type SearchProjection = Projection<"search.global">;
export type CockpitProjection = Projection<"cockpit.week">;
export type ActivityProjection = Projection<"activity.meaningful">;
export type RecoveryProjection = Projection<"recovery.preview">;
export type AuditReceiptProjection = Projection<"audit.receipt">["receipt"];

export type DataSlice<T> =
  | { readonly kind: "ready"; readonly data: T }
  | {
      readonly kind: "unavailable";
      readonly message: string;
      readonly diagnosticCode?: string;
    };

export interface DesktopSnapshot {
  readonly build: DesktopBuildInfo;
  readonly bootstrap: BootstrapProjection;
  readonly captures: CaptureHistoryProjection["items"];
  readonly tasks: TaskListProjection["items"];
  readonly projects: DataSlice<ProjectListProjection>;
  readonly cockpit: DataSlice<CockpitProjection>;
  readonly activity: DataSlice<ActivityProjection>;
  readonly access: DataSlice<AccessProjection>;
  readonly assignmentCandidates: DataSlice<TaskAssignmentCandidatesProjection>;
  readonly dataHome?: DataHomeStatus;
}

export type SubmitTaskResult =
  | {
      readonly kind: "success";
      readonly receipt: AuditReceiptProjection;
      readonly selectedTaskId: TaskId;
      readonly snapshot: DesktopSnapshot;
    }
  | MutationFailure;

export type MutationFailure =
  | { readonly kind: "conflict"; readonly message: string }
  | {
      readonly kind: "retry";
      readonly message: string;
      readonly retryAfterMs?: number;
    }
  | { readonly kind: "unavailable"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

export type MutationResult<T> =
  { readonly kind: "success"; readonly data: T } | MutationFailure;

const queryProjection = async <Kind extends QueryProjection["kind"]>(
  client: ConstellationRendererClient,
  query: Parameters<ConstellationRendererClient["runQuery"]>[0],
  kind: Kind,
): Promise<Projection<Kind>> => {
  const response: RendererQueryResponse = await client.runQuery(query);
  if (response.kind === "contract_rejected")
    throw new Error("The desktop boundary rejected an invalid query.");
  if (response.result.outcome !== "success")
    throw new Error(`Query unavailable: ${response.result.diagnosticCode}`);
  if (response.result.projection.kind !== kind)
    throw new Error(
      `Unexpected projection: ${response.result.projection.kind}`,
    );
  return response.result.projection as Projection<Kind>;
};

const optionalProjection = async <Kind extends QueryProjection["kind"]>(
  promise: Promise<Projection<Kind>>,
): Promise<DataSlice<Projection<Kind>>> => {
  try {
    return { kind: "ready", data: await promise };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Query unavailable.";
    return { kind: "unavailable", message };
  }
};

const queryEnvelope = (
  queryName: QueryName,
  workspaceId: WorkspaceId,
  parameters: Record<string, unknown>,
) =>
  QueryEnvelopeSchema.parse({
    contractVersion: 1,
    queryName,
    queryId: crypto.randomUUID(),
    workspaceId,
    // The same surface accepts an authoritative local store or a permission-
    // safe coordinated projection and renders the returned freshness facts.
    consistency: "local_projection",
    parameters,
  });

const firstSpace = (snapshot: Pick<DesktopSnapshot, "bootstrap">): SpaceId => {
  const spaceId = snapshot.bootstrap.spaces[0]?.id;
  if (spaceId === undefined)
    throw new Error("Workspace has no accessible Space.");
  return spaceId;
};

const currentWeekStart = (): string => {
  const now = new Date();
  const day = now.getDay() || 7;
  now.setDate(now.getDate() - day + 1);
  return now.toISOString().slice(0, 10);
};

export const loadDesktopSnapshot = async (
  client: ConstellationRendererClient,
  knownBuild?: DesktopBuildInfo,
): Promise<DesktopSnapshot> => {
  const build = knownBuild ?? (await client.getBuildInfo());
  const workspaceId = build.initialWorkspaceId;
  if (build.workspaceAvailability !== "ready" || workspaceId === undefined) {
    throw new Error("Workspace recovery is required before opening data.");
  }
  const bootstrap = await queryProjection(
    client,
    queryEnvelope("workspace.bootstrapContext", workspaceId, {}),
    "workspace.bootstrapContext",
  );
  let dataHome: DataHomeStatus | undefined;
  if (build.channel === "local-alpha") {
    try {
      dataHome = await client.getDataHomeStatus();
    } catch {
      // The workspace remains usable; its switcher and Data Home surface show
      // that provider status requires attention and retry independently.
    }
  }
  if (
    dataHome !== undefined &&
    dataHome.descriptor.workspaceId !== workspaceId
  ) {
    throw new Error("Data Home identity does not match the open workspace.");
  }
  const spaceId = firstSpace({ bootstrap });
  const [
    tasks,
    captures,
    projects,
    access,
    assignmentCandidates,
    cockpit,
    activity,
  ] = await Promise.all([
    queryProjection(
      client,
      queryEnvelope("task.list", workspaceId, { spaceId, limit: 100 }),
      "task.list",
    ),
    queryProjection(
      client,
      queryEnvelope("capture.history", workspaceId, { spaceId, limit: 100 }),
      "capture.history",
    ),
    optionalProjection(
      queryProjection(
        client,
        queryEnvelope("project.list", workspaceId, { spaceId }),
        "project.list",
      ),
    ),
    optionalProjection(
      queryProjection(
        client,
        queryEnvelope("workspace.access", workspaceId, {}),
        "workspace.access",
      ),
    ),
    optionalProjection(
      queryProjection(
        client,
        queryEnvelope("task.assignmentCandidates", workspaceId, {
          spaceId,
        }),
        "task.assignmentCandidates",
      ),
    ),
    optionalProjection(
      queryProjection(
        client,
        queryEnvelope("cockpit.week", workspaceId, {
          spaceId,
          weekStart: currentWeekStart(),
          limit: 20,
        }),
        "cockpit.week",
      ),
    ),
    optionalProjection(
      queryProjection(
        client,
        queryEnvelope("activity.meaningful", workspaceId, {
          spaceId,
          limit: 100,
        }),
        "activity.meaningful",
      ),
    ),
  ]);
  return {
    build,
    bootstrap,
    captures: captures.items,
    tasks: tasks.items,
    projects,
    cockpit,
    activity,
    access,
    assignmentCandidates,
    ...(dataHome === undefined ? {} : { dataHome }),
  };
};

export const loadProjectOverview = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  projectId: ProjectId,
) =>
  queryProjection(
    client,
    queryEnvelope(
      "project.operationalOverview",
      snapshot.bootstrap.workspace.id,
      {
        projectId,
      },
    ),
    "project.operationalOverview",
  );

export const searchGlobal = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  text: string,
): Promise<SearchProjection> => {
  const trimmed = text.trim();
  if (trimmed.length === 0)
    return { kind: "search.global", normalizedQuery: "", items: [] };
  return queryProjection(
    client,
    queryEnvelope("search.global", snapshot.bootstrap.workspace.id, {
      spaceIds: snapshot.bootstrap.spaces.map((space) => space.id),
      text: trimmed,
      limit: 50,
    }),
    "search.global",
  );
};

const commandFailure = (response: RendererCommandResponse): MutationFailure => {
  if (response.kind === "contract_rejected")
    return {
      kind: "error",
      message: "Polecenie odrzucono na granicy desktopu.",
    };
  const outcome = response.outcome;
  if (outcome.outcome === "conflict")
    return {
      kind: "conflict",
      message: `Zmiana nie została zapisana: ${outcome.diagnosticCode}. Odśwież dane i spróbuj ponownie.`,
    };
  if (outcome.outcome === "retryable")
    return {
      kind: "retry",
      message:
        "Lokalny store jest chwilowo zajęty. Nic nie zapisano częściowo.",
      ...(outcome.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: outcome.retryAfterMs }),
    };
  if (outcome.outcome === "rejected")
    return {
      kind: "unavailable",
      message:
        outcome.diagnosticCode === "authorization.denied"
          ? "Brak uprawnienia do tej zmiany."
          : "Warunki polecenia nie są już aktualne.",
    };
  return {
    kind: "unavailable",
    message: `Nie można teraz potwierdzić wyniku: ${outcome.diagnosticCode}.`,
  };
};

const execute = async <T>(
  client: ConstellationRendererClient,
  input: unknown,
  read: (
    response: Extract<RendererCommandResponse, { kind: "command_outcome" }>,
  ) => T | undefined,
): Promise<MutationResult<T>> => {
  try {
    const response = await client.executeCommand(
      CommandEnvelopeSchema.parse(input),
    );
    const data =
      response.kind === "command_outcome" ? read(response) : undefined;
    return data === undefined
      ? commandFailure(response)
      : { kind: "success", data };
  } catch (error) {
    return {
      kind: "error",
      message:
        error instanceof Error ? error.message : "Nieoczekiwany błąd desktopu.",
    };
  }
};

const commandBase = (
  workspaceId: WorkspaceId,
  expectedVersions: Readonly<Record<string, number>>,
) => ({
  contractVersion: 1,
  commandId: crypto.randomUUID(),
  workspaceId,
  idempotencyKey: `desktop-${crypto.randomUUID()}`,
  expectedVersions,
  correlationId: crypto.randomUUID(),
});

export const createProject = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  title: string,
  intendedOutcome: string,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "project.create",
      payload: { spaceId: firstSpace(snapshot), title, intendedOutcome },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "project.created"
        ? response.outcome.projection
        : undefined,
  );

export const addWorkspaceMember = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly displayName: string;
    readonly role: "admin" | "member" | "guest";
    readonly access: "view" | "edit";
  },
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [snapshot.bootstrap.workspace.id]: snapshot.bootstrap.workspace.version,
      }),
      commandName: "workspace.memberAdd",
      payload: {
        membershipId: crypto.randomUUID(),
        spaceGrantId: crypto.randomUUID(),
        principalId: crypto.randomUUID(),
        displayName: input.displayName,
        role: input.role,
        spaceId: firstSpace(snapshot),
        access: input.access,
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "workspace.member_added"
        ? response.outcome.projection
        : undefined,
  );

export const setWorkspaceMemberAccess = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  member: AccessProjection["members"][number],
  access: "view" | "edit",
) => {
  const grant = member.spaces[0];
  if (grant === undefined)
    return Promise.resolve<MutationResult<never>>({
      kind: "unavailable",
      message: "Członek nie ma aktywnego zakresu Space.",
    });
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [snapshot.bootstrap.workspace.id]: snapshot.bootstrap.workspace.version,
        [member.membershipId]: member.version,
        [grant.spaceGrantId]: grant.version,
      }),
      commandName: "workspace.memberSetAccess",
      payload: {
        membershipId: member.membershipId,
        spaceGrantId: grant.spaceGrantId,
        access,
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "workspace.member_access_changed"
        ? response.outcome.projection
        : undefined,
  );
};

export const revokeWorkspaceMember = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  member: AccessProjection["members"][number],
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [snapshot.bootstrap.workspace.id]: snapshot.bootstrap.workspace.version,
        [member.membershipId]: member.version,
      }),
      commandName: "workspace.memberRevoke",
      payload: { membershipId: member.membershipId },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "workspace.member_revoked"
        ? response.outcome.projection
        : undefined,
  );

export const updateProjectOutcome = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  project: ProjectOverviewProjection["project"],
  intendedOutcome: string,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [project.id]: project.version,
      }),
      commandName: "project.updateOutcome",
      payload: { projectId: project.id, intendedOutcome },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "project.outcome_updated"
        ? response.outcome.projection
        : undefined,
  );

export const setTaskStatus = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  taskId: TaskId,
  taskVersion: number,
  statusId: TaskStatusId,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [taskId]: taskVersion,
      }),
      commandName: "task.setStatus",
      payload: { taskId, statusId },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "task.status_changed"
        ? response.outcome.projection
        : undefined,
  );

export const setTaskCompletion = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  taskId: TaskId,
  taskVersion: number,
  completed: boolean,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [taskId]: taskVersion,
      }),
      commandName: completed ? "task.complete" : "task.reopen",
      payload: { taskId },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      (response.outcome.projection.kind === "task.completed" ||
        response.outcome.projection.kind === "task.reopened")
        ? response.outcome.projection
        : undefined,
  );

export const setTaskAssignment = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  task: TaskListProjection["items"][number],
  assigneePrincipalId: PrincipalId | undefined,
) => {
  if (assigneePrincipalId === undefined && task.assignment === undefined) {
    return Promise.resolve<MutationResult<never>>({
      kind: "unavailable",
      message: "Zadanie nie ma przypisanej osoby.",
    });
  }
  const expectedVersions = {
    [task.id]: task.version,
    ...(task.assignment === undefined
      ? {}
      : { [task.assignment.id]: task.assignment.version }),
  };
  return execute(
    client,
    assigneePrincipalId === undefined
      ? {
          ...commandBase(snapshot.bootstrap.workspace.id, expectedVersions),
          commandName: "task.unassign",
          payload: {
            taskId: task.id,
            assignmentId: task.assignment!.id,
          },
        }
      : {
          ...commandBase(snapshot.bootstrap.workspace.id, expectedVersions),
          commandName: "task.assign",
          payload: {
            taskId: task.id,
            assignmentId: crypto.randomUUID(),
            assigneePrincipalId,
          },
        },
    (response) =>
      response.outcome.outcome === "success" &&
      (response.outcome.projection.kind === "task.assigned" ||
        response.outcome.projection.kind === "task.unassigned")
        ? response.outcome.projection
        : undefined,
  );
};

export const relateTask = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  taskId: TaskId,
  taskVersion: number,
  projectId: ProjectId,
  projectVersion: number,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [taskId]: taskVersion,
        [projectId]: projectVersion,
      }),
      commandName: "record.relate",
      payload: {
        relationType: "task_contributes_to_project",
        taskId,
        projectId,
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "relation.created"
        ? response.outcome.projection
        : undefined,
  );

export const unrelateTask = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  relationId: RelationId,
  relationVersion: number,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [relationId]: relationVersion,
      }),
      commandName: "record.unrelate",
      payload: { relationId },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "relation.removed"
        ? response.outcome.projection
        : undefined,
  );

export interface UndoPreview {
  readonly targetCommandId: CommandId;
  readonly command: Extract<
    RendererCommandResponse,
    { kind: "command_outcome" }
  >["outcome"] & { readonly outcome: "preview" };
  readonly recovery: RecoveryProjection;
}

export const previewUndo = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  targetCommandId: CommandId,
): Promise<MutationResult<UndoPreview>> => {
  try {
    const [recovery, response] = await Promise.all([
      queryProjection(
        client,
        queryEnvelope("recovery.preview", snapshot.bootstrap.workspace.id, {
          targetCommandId,
        }),
        "recovery.preview",
      ),
      client.executeCommand(
        CommandEnvelopeSchema.parse({
          ...commandBase(snapshot.bootstrap.workspace.id, {}),
          commandName: "command.previewUndo",
          payload: { targetCommandId },
        }),
      ),
    ]);
    if (
      response.kind !== "command_outcome" ||
      response.outcome.outcome !== "preview"
    )
      return commandFailure(response);
    if (
      response.outcome.projection.available !== recovery.available ||
      response.outcome.projection.targetCommandId !== recovery.targetCommandId
    )
      return {
        kind: "error",
        message: "Podglądy cofnięcia nie są spójne. Nie wykonano zmiany.",
      };
    return {
      kind: "success",
      data: { targetCommandId, command: response.outcome, recovery },
    };
  } catch (error) {
    return {
      kind: "error",
      message:
        error instanceof Error ? error.message : "Podgląd jest niedostępny.",
    };
  }
};

export const undoCommand = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  preview: UndoPreview,
) =>
  execute(
    client,
    {
      ...commandBase(
        snapshot.bootstrap.workspace.id,
        preview.recovery.requiredVersions,
      ),
      commandName: "command.undo",
      payload: { targetCommandId: preview.targetCommandId },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "command.undone"
        ? response.outcome.projection
        : undefined,
  );

const loadReceipt = async (
  client: ConstellationRendererClient,
  workspaceId: WorkspaceId,
  receiptId: AuditReceiptId,
): Promise<AuditReceiptProjection> =>
  queryProjection(
    client,
    queryEnvelope("audit.receipt", workspaceId, { receiptId }),
    "audit.receipt",
  ).then((projection) => projection.receipt);

export const submitCaptureAsTask = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  originalText: string,
): Promise<SubmitTaskResult> => {
  const title = originalText.trim();
  const workspaceId = snapshot.bootstrap.workspace.id;
  const spaceId = firstSpace(snapshot);
  try {
    const correlationId = crypto.randomUUID();
    const submitted = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        ...commandBase(workspaceId, {}),
        correlationId,
        commandName: "capture.submitText",
        payload: {
          spaceId,
          originalText,
          deviceId: crypto.randomUUID(),
          source: "in_app_quick_capture",
        },
      }),
    );
    if (
      submitted.kind !== "command_outcome" ||
      submitted.outcome.outcome !== "success" ||
      submitted.outcome.projection.kind !== "capture.stored"
    )
      return commandFailure(submitted);
    const capture = submitted.outcome.projection;
    const routed = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        ...commandBase(workspaceId, { [capture.captureId]: capture.version }),
        correlationId,
        idempotencyKey: `desktop-route-${capture.captureId}`,
        commandName: "capture.routeAsTask",
        payload: { captureId: capture.captureId, title },
      }),
    );
    if (
      routed.kind !== "command_outcome" ||
      routed.outcome.outcome !== "success" ||
      routed.outcome.projection.kind !== "capture.routed_as_task"
    )
      return commandFailure(routed);
    const [nextSnapshot, receipt] = await Promise.all([
      loadDesktopSnapshot(client, snapshot.build),
      loadReceipt(client, workspaceId, routed.outcome.auditReceiptId),
    ]);
    return {
      kind: "success",
      receipt,
      selectedTaskId: routed.outcome.projection.taskId,
      snapshot: nextSnapshot,
    };
  } catch (error) {
    return {
      kind: "error",
      message:
        error instanceof Error ? error.message : "Nieoczekiwany błąd desktopu.",
    };
  }
};
