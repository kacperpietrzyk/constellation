import {
  CommandEnvelopeSchema,
  QueryEnvelopeSchema,
  type AuditReceiptId,
  type QueryProjection,
  type SpaceId,
  type TaskId,
  type WorkspaceId,
} from "@constellation/contracts";
import type {
  ConstellationRendererClient,
  DesktopBuildInfo,
  RendererQueryResponse,
} from "@constellation/desktop-preload/client";

type BootstrapProjection = Extract<
  QueryProjection,
  { kind: "workspace.bootstrapContext" }
>;
type TaskListProjection = Extract<QueryProjection, { kind: "task.list" }>;
type CaptureHistoryProjection = Extract<
  QueryProjection,
  { kind: "capture.history" }
>;
export type AuditReceiptProjection = Extract<
  QueryProjection,
  { kind: "audit.receipt" }
>["receipt"];

export interface DesktopSnapshot {
  readonly build: DesktopBuildInfo;
  readonly bootstrap: BootstrapProjection;
  readonly captures: CaptureHistoryProjection["items"];
  readonly tasks: TaskListProjection["items"];
}

export type SubmitTaskResult =
  | {
      readonly kind: "success";
      readonly receipt: AuditReceiptProjection;
      readonly selectedTaskId: TaskId;
      readonly snapshot: DesktopSnapshot;
    }
  | { readonly kind: "conflict"; readonly message: string }
  | { readonly kind: "unavailable"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

const queryProjection = async <Kind extends QueryProjection["kind"]>(
  client: ConstellationRendererClient,
  query: Parameters<ConstellationRendererClient["runQuery"]>[0],
  kind: Kind,
): Promise<Extract<QueryProjection, { kind: Kind }>> => {
  const response: RendererQueryResponse = await client.runQuery(query);
  if (response.kind === "contract_rejected") {
    throw new Error("The desktop boundary rejected an invalid query.");
  }
  if (response.result.outcome !== "success") {
    throw new Error(`Query unavailable: ${response.result.diagnosticCode}`);
  }
  if (response.result.projection.kind !== kind) {
    throw new Error(
      `Unexpected projection: ${response.result.projection.kind}`,
    );
  }
  return response.result.projection as Extract<QueryProjection, { kind: Kind }>;
};

const queryEnvelope = (
  queryName: "workspace.bootstrapContext" | "task.list" | "capture.history",
  workspaceId: WorkspaceId,
  parameters: Record<string, unknown>,
) =>
  QueryEnvelopeSchema.parse({
    contractVersion: 1,
    queryName,
    queryId: crypto.randomUUID(),
    workspaceId,
    consistency: "local_authoritative",
    parameters,
  });

export const loadDesktopSnapshot = async (
  client: ConstellationRendererClient,
  knownBuild?: DesktopBuildInfo,
): Promise<DesktopSnapshot> => {
  const build = knownBuild ?? (await client.getBuildInfo());
  const workspaceId = build.initialWorkspaceId;
  const bootstrap = await queryProjection(
    client,
    queryEnvelope("workspace.bootstrapContext", workspaceId, {}),
    "workspace.bootstrapContext",
  );
  const spaceId = bootstrap.spaces[0]?.id;
  if (spaceId === undefined)
    throw new Error("Workspace has no accessible Space.");

  const [tasks, captures] = await Promise.all([
    queryProjection(
      client,
      queryEnvelope("task.list", bootstrap.workspace.id, {
        spaceId,
        limit: 100,
      }),
      "task.list",
    ),
    queryProjection(
      client,
      queryEnvelope("capture.history", bootstrap.workspace.id, {
        spaceId,
        limit: 100,
      }),
      "capture.history",
    ),
  ]);
  return { build, bootstrap, captures: captures.items, tasks: tasks.items };
};

const loadReceipt = async (
  client: ConstellationRendererClient,
  workspaceId: WorkspaceId,
  receiptId: AuditReceiptId,
): Promise<AuditReceiptProjection> => {
  const projection = await queryProjection(
    client,
    QueryEnvelopeSchema.parse({
      contractVersion: 1,
      queryName: "audit.receipt",
      queryId: crypto.randomUUID(),
      workspaceId,
      consistency: "local_authoritative",
      parameters: { receiptId },
    }),
    "audit.receipt",
  );
  return projection.receipt;
};

export const submitCaptureAsTask = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  originalText: string,
): Promise<SubmitTaskResult> => {
  const title = originalText.trim();
  const workspaceId = snapshot.bootstrap.workspace.id;
  const spaceId = snapshot.bootstrap.spaces[0]?.id as SpaceId | undefined;
  if (spaceId === undefined) {
    return { kind: "unavailable", message: "No writable Space is available." };
  }

  try {
    const correlationId = crypto.randomUUID();
    const submitted = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "capture.submitText",
        commandId: crypto.randomUUID(),
        workspaceId,
        idempotencyKey: `desktop-capture-${crypto.randomUUID()}`,
        expectedVersions: {},
        correlationId,
        payload: {
          spaceId,
          originalText,
          deviceId: "interactive-alpha-device",
          source: "in_app_quick_capture",
        },
      }),
    );
    if (submitted.kind === "contract_rejected") {
      return {
        kind: "error",
        message: "Capture was rejected at the desktop boundary.",
      };
    }
    if (submitted.outcome.outcome !== "success") {
      return submitted.outcome.outcome === "conflict"
        ? {
            kind: "conflict",
            message: "Capture conflicted with newer workspace state.",
          }
        : {
            kind: "unavailable",
            message: "Capture could not be stored. Try again.",
          };
    }
    if (submitted.outcome.projection.kind !== "capture.stored") {
      return {
        kind: "error",
        message: "Capture returned an unexpected result.",
      };
    }

    const capture = submitted.outcome.projection;
    const routed = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "capture.routeAsTask",
        commandId: crypto.randomUUID(),
        workspaceId,
        idempotencyKey: `desktop-route-${capture.captureId}`,
        expectedVersions: { [capture.captureId]: capture.version },
        correlationId,
        payload: { captureId: capture.captureId, title },
      }),
    );
    if (routed.kind === "contract_rejected") {
      return {
        kind: "error",
        message: "Task routing was rejected at the desktop boundary.",
      };
    }
    if (routed.outcome.outcome !== "success") {
      return routed.outcome.outcome === "conflict"
        ? {
            kind: "conflict",
            message: "The Capture was already routed or changed.",
          }
        : {
            kind: "unavailable",
            message: "The Capture is safe, but routing is unavailable.",
          };
    }
    if (routed.outcome.projection.kind !== "capture.routed_as_task") {
      return {
        kind: "error",
        message: "Task routing returned an unexpected result.",
      };
    }

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
        error instanceof Error ? error.message : "Unexpected desktop error.",
    };
  }
};
