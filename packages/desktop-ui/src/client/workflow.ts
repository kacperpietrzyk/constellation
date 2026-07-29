import {
  CommandEnvelopeSchema,
  QueryEnvelopeSchema,
  capabilitiesForAgentGrantPreset,
  type AgentGrantPreset,
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
  type RelationCondition,
  type CommentId,
  type AttentionSignalId,
  type DocumentId,
  type DocumentRevisionId,
  type KnowledgeSourceId,
  type NamedDocumentVersionId,
  type WorkspaceId,
  type Capability,
  type GrantId,
  type StrategicRecordId,
  type CaptureOriginal,
  type CaptureId,
  type PrincipalId as AgentPrincipalId,
  type WorkLinkType,
} from "@constellation/contracts";
import type {
  ConstellationRendererClient,
  DesktopBuildInfo,
  RendererCommandResponse,
  RendererQueryResponse,
} from "@constellation/desktop-preload/client";
// Limit skrzynki mieszka przy module, który nadaje jej liczbie znaczenie:
// ekran musi wiedzieć, o jaką granicę projekcja się obcięła, żeby nie podać
// obciętej liczby jako całości.
import { ATTENTION_INBOX_LIMIT } from "../inbox-triage.js";

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
export type AgentAccessProjection = Projection<"agent.access">;
export type ProjectListProjection = Projection<"project.list">;
export type WorkOverviewProjection = Projection<"work.overview">;
export type ProjectOverviewProjection =
  Projection<"project.operationalOverview">;
export type OrganizationOverviewProjection =
  Projection<"organization.operationalOverview">;
export type SearchProjection = Projection<"search.global">;
export type CockpitProjection = Projection<"cockpit.week">;
export type ActivityProjection = Projection<"activity.meaningful">;
export type RecoveryProjection = Projection<"recovery.preview">;
export type AuditReceiptProjection = Projection<"audit.receipt">["receipt"];
export type CommentListProjection = Projection<"comment.list">;
export type MentionCandidatesProjection =
  Projection<"comment.mentionCandidates">;
export type AttentionInboxProjection = Projection<"attention.inbox">;
export type DocumentListProjection = Projection<"document.list">;
export type DocumentLinkCandidatesProjection =
  Projection<"document.linkCandidates">;
export type DocumentBacklinksProjection = Projection<"document.backlinks">;
export type KnowledgeListProjection = Projection<"knowledge.list">;
export type KnowledgeSourceRecord = KnowledgeListProjection["sources"][number];
export type KnowledgeDocumentContextProjection =
  Projection<"knowledge.documentContext">;
export type RelationshipWorkspaceProjection =
  Projection<"relationship.workspace">;
export type RadarReviewProjection = Projection<"radar.review">;
export type CommentTarget = CommentListProjection["target"];
export type ManagedAttachment =
  TaskListProjection["items"][number]["attachments"][number];

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
  readonly work: DataSlice<WorkOverviewProjection>;
  readonly cockpit: DataSlice<CockpitProjection>;
  readonly activity: DataSlice<ActivityProjection>;
  readonly access: DataSlice<AccessProjection>;
  readonly agentAccess: DataSlice<AgentAccessProjection>;
  readonly assignmentCandidates: DataSlice<TaskAssignmentCandidatesProjection>;
  readonly mentionCandidates: DataSlice<MentionCandidatesProjection>;
  readonly attention: DataSlice<AttentionInboxProjection>;
  readonly documents: DataSlice<DocumentListProjection>;
  readonly knowledge: DataSlice<KnowledgeListProjection>;
  readonly relationships: DataSlice<RelationshipWorkspaceProjection>;
  readonly radar: DataSlice<RadarReviewProjection>;
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

export type QuickCaptureResult =
  | {
      readonly kind: "success";
      readonly receipt: AuditReceiptProjection;
      readonly result:
        | { readonly kind: "task"; readonly taskId: TaskId }
        | {
            readonly kind: "knowledge_source";
            readonly sourceId: KnowledgeSourceId;
          }
        | {
            readonly kind: "review";
            readonly attentionSignalId: AttentionSignalId;
          }
        | { readonly kind: "voice_note"; readonly captureId: CaptureId };
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
    throw new Error("The app refused an invalid query. Refresh and try again.");
  if (response.result.outcome !== "success")
    throw new Error("This view's data is unavailable right now. Try again.");
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
      error instanceof Error
        ? error.message
        : "This view's data is unavailable right now.";
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

// Exported so that a surface which genuinely writes into the workspace's first
// Space says so at the call site. `createWorkLink` used to reach for this
// itself, which made "which Space does this write land in?" invisible to the
// caller — see the comment above that function.
export const firstSpace = (
  snapshot: Pick<DesktopSnapshot, "bootstrap">,
): SpaceId => {
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
    work,
    mentionCandidates,
    attention,
    access,
    localAgentAccess,
    assignmentCandidates,
    cockpit,
    activity,
    documents,
    knowledge,
    relationships,
    radar,
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
        queryEnvelope("work.overview", workspaceId, { spaceId }),
        "work.overview",
      ),
    ),
    optionalProjection(
      queryProjection(
        client,
        queryEnvelope("comment.mentionCandidates", workspaceId, { spaceId }),
        "comment.mentionCandidates",
      ),
    ),
    optionalProjection(
      queryProjection(
        client,
        queryEnvelope("attention.inbox", workspaceId, {
          limit: ATTENTION_INBOX_LIMIT,
        }),
        "attention.inbox",
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
        queryEnvelope("agent.access", workspaceId, {}),
        "agent.access",
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
    optionalProjection(
      queryProjection(
        client,
        queryEnvelope("document.list", workspaceId, { spaceId }),
        "document.list",
      ),
    ),
    optionalProjection(
      queryProjection(
        client,
        queryEnvelope("knowledge.list", workspaceId, { spaceId }),
        "knowledge.list",
      ),
    ),
    optionalProjection(
      queryProjection(
        client,
        queryEnvelope("relationship.workspace", workspaceId, { spaceId }),
        "relationship.workspace",
      ),
    ),
    optionalProjection(
      queryProjection(
        client,
        queryEnvelope("radar.review", workspaceId, { spaceId, limit: 12 }),
        "radar.review",
      ),
    ),
  ]);
  let agentAccess = localAgentAccess;
  if (dataHome?.descriptor.providerKind === "coordinated") {
    try {
      const remote = await client.listRemoteAgentGrants();
      agentAccess = {
        kind: "ready",
        data: {
          kind: "agent.access",
          policyVersion: remote.policyVersion,
          workspaceVersion: remote.workspaceVersion,
          canManage: true,
          grants: remote.grants.map((grant) => ({
            grantId: grant.grantId,
            agentPrincipalId: grant.agentPrincipalId,
            displayName: grant.displayName,
            preset:
              grant.preset as AgentAccessProjection["grants"][number]["preset"],
            capabilityScope: grant.capabilityScope,
            scopeStatus: grant.scopeStatus,
            missingFromPreset: grant.missingFromPreset,
            status: grant.status,
            ...(grant.expiresAt === undefined
              ? {}
              : { expiresAt: grant.expiresAt }),
            credentialVersion: grant.credentialVersion,
            version: grant.version,
            membershipId: grant.membershipId,
            membershipVersion: grant.membershipVersion,
            spaces: grant.spaces,
            ...(grant.lastUsedAt === undefined
              ? {}
              : { lastUsedAt: grant.lastUsedAt }),
          })),
        },
      };
    } catch {
      agentAccess = {
        kind: "unavailable",
        message:
          "The remote MCP gateway is not responding. Agent access returns once the Hub is back.",
      };
    }
  }
  return {
    build,
    bootstrap,
    captures: captures.items,
    tasks: tasks.items,
    projects,
    work,
    cockpit,
    activity,
    access,
    agentAccess,
    assignmentCandidates,
    mentionCandidates,
    attention,
    documents,
    knowledge,
    relationships,
    radar,
    ...(dataHome === undefined ? {} : { dataHome }),
  };
};

export const createDocument = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  title: string,
  role: "note" | "document" | "deliverable" = "document",
): Promise<MutationResult<DocumentId>> => {
  const documentId = crypto.randomUUID() as DocumentId;
  try {
    const response = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "document.create",
        commandId: crypto.randomUUID(),
        workspaceId: snapshot.bootstrap.workspace.id,
        idempotencyKey: `document-create:${documentId}`,
        expectedVersions: {},
        correlationId: crypto.randomUUID(),
        payload: {
          documentId,
          spaceId: firstSpace(snapshot),
          title: title.trim(),
          role,
        },
      }),
    );
    if (response.kind === "contract_rejected") {
      return { kind: "error", message: "Could not create the document." };
    }
    if (response.outcome.outcome !== "success") {
      return {
        kind: response.outcome.outcome === "conflict" ? "conflict" : "error",
        message: "The document was not created. Try again.",
      };
    }
    return { kind: "success", data: documentId };
  } catch {
    return { kind: "error", message: "Could not create the document." };
  }
};

export const createKnowledgeSource = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly title: string;
    readonly canonicalUrl?: string;
    readonly excerpt?: string;
  },
): Promise<MutationResult<KnowledgeSourceId>> => {
  const sourceId = crypto.randomUUID() as KnowledgeSourceId;
  try {
    const response = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "knowledge.sourceCreate",
        commandId: crypto.randomUUID(),
        workspaceId: snapshot.bootstrap.workspace.id,
        idempotencyKey: `knowledge-source:${sourceId}`,
        expectedVersions: {},
        correlationId: crypto.randomUUID(),
        payload: {
          sourceId,
          spaceId: firstSpace(snapshot),
          sourceKind: input.canonicalUrl === undefined ? "excerpt" : "url",
          title: input.title.trim(),
          ...(input.canonicalUrl === undefined
            ? {}
            : { canonicalUrl: input.canonicalUrl.trim() }),
          ...(input.excerpt === undefined || input.excerpt.trim() === ""
            ? {}
            : { excerpt: input.excerpt.trim() }),
          availability:
            input.excerpt === undefined || input.excerpt.trim() === ""
              ? "reference_only"
              : "available",
          observedAt: new Date().toISOString(),
        },
      }),
    );
    if (
      response.kind !== "command_outcome" ||
      response.outcome.outcome !== "success"
    )
      return { kind: "error", message: "The source was not saved." };
    return { kind: "success", data: sourceId };
  } catch {
    return { kind: "error", message: "The source was not saved." };
  }
};

export const updateKnowledgeSourceTitle = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  source: KnowledgeSourceRecord,
  title: string,
): Promise<MutationResult<void>> => {
  try {
    const response = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "knowledge.sourceUpdate",
        commandId: crypto.randomUUID(),
        workspaceId: snapshot.bootstrap.workspace.id,
        idempotencyKey: `knowledge-source-title:${source.id}:${source.version}`,
        expectedVersions: { [source.id]: source.version },
        correlationId: crypto.randomUUID(),
        payload: {
          sourceId: source.id,
          title: title.trim(),
          ...(source.canonicalUrl === undefined
            ? {}
            : { canonicalUrl: source.canonicalUrl }),
          availability: source.availability,
          observedAt: source.observedAt,
        },
      }),
    );
    if (response.kind !== "command_outcome")
      return { kind: "error", message: "The source title was not saved." };
    if (response.outcome.outcome === "conflict")
      return {
        kind: "conflict",
        message: "The source changed in the background. Refresh and try again.",
      };
    return response.outcome.outcome === "success"
      ? { kind: "success", data: undefined }
      : { kind: "error", message: "The source title was not saved." };
  } catch {
    return { kind: "error", message: "The source title was not saved." };
  }
};

export const setKnowledgeEvidence = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  documentId: DocumentId,
  sourceIds: readonly KnowledgeSourceId[],
  noteDocumentIds: readonly DocumentId[],
): Promise<MutationResult<void>> => {
  const document =
    snapshot.knowledge.kind === "ready"
      ? snapshot.knowledge.data.documents.find((item) => item.id === documentId)
      : undefined;
  const sources =
    snapshot.knowledge.kind === "ready"
      ? snapshot.knowledge.data.sources.filter((item) =>
          sourceIds.includes(item.id),
        )
      : [];
  const notes =
    snapshot.knowledge.kind === "ready"
      ? snapshot.knowledge.data.documents.filter((item) =>
          noteDocumentIds.includes(item.id),
        )
      : [];
  if (
    document === undefined ||
    sources.length !== sourceIds.length ||
    notes.length !== noteDocumentIds.length
  )
    return {
      kind: "unavailable",
      message: "The evidence is no longer available.",
    };
  const expectedVersions = {
    [document.id]: document.version,
    ...Object.fromEntries(sources.map((source) => [source.id, source.version])),
    ...Object.fromEntries(notes.map((note) => [note.id, note.version])),
  };
  try {
    const response = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "knowledge.documentSetEvidence",
        commandId: crypto.randomUUID(),
        workspaceId: snapshot.bootstrap.workspace.id,
        idempotencyKey: `knowledge-evidence:${crypto.randomUUID()}`,
        expectedVersions,
        correlationId: crypto.randomUUID(),
        payload: { documentId, sourceIds, noteDocumentIds },
      }),
    );
    if (response.kind !== "command_outcome")
      return { kind: "error", message: "The evidence set was not saved." };
    if (response.outcome.outcome === "conflict")
      return {
        kind: "conflict",
        message: "The evidence changed. Refresh and choose again.",
      };
    return response.outcome.outcome === "success"
      ? { kind: "success", data: undefined }
      : { kind: "error", message: "The evidence set was not saved." };
  } catch {
    return { kind: "error", message: "The evidence set was not saved." };
  }
};

export const createNamedKnowledgeVersion = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly documentId: DocumentId;
    readonly documentRevisionId: DocumentRevisionId;
    readonly name: string;
    readonly milestone: "finalized" | "delivered" | "approved" | "published";
    readonly contentSnapshot: string;
  },
): Promise<MutationResult<NamedDocumentVersionId>> => {
  const context = await queryProjection(
    client,
    queryEnvelope(
      "knowledge.documentContext",
      snapshot.bootstrap.workspace.id,
      {
        documentId: input.documentId,
      },
    ),
    "knowledge.documentContext",
  );
  const namedVersionId = crypto.randomUUID() as NamedDocumentVersionId;
  const expectedVersions = {
    [context.document.id]: context.document.version,
    ...Object.fromEntries(
      context.evidence.map((item) => [item.recordId, item.currentVersion]),
    ),
  };
  try {
    const response = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "knowledge.namedVersionCreate",
        commandId: crypto.randomUUID(),
        workspaceId: snapshot.bootstrap.workspace.id,
        idempotencyKey: `knowledge-version:${namedVersionId}`,
        expectedVersions,
        correlationId: crypto.randomUUID(),
        payload: { namedVersionId, ...input },
      }),
    );
    if (response.kind !== "command_outcome")
      return { kind: "error", message: "The named version was not saved." };
    if (response.outcome.outcome === "conflict")
      return {
        kind: "conflict",
        message: "The content or evidence changed. Create a fresh version.",
      };
    return response.outcome.outcome === "success"
      ? { kind: "success", data: namedVersionId }
      : { kind: "error", message: "The named version was not saved." };
  } catch {
    return { kind: "error", message: "The named version was not saved." };
  }
};

export const loadKnowledgeDocumentContext = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  documentId: DocumentId,
): Promise<KnowledgeDocumentContextProjection> =>
  queryProjection(
    client,
    queryEnvelope(
      "knowledge.documentContext",
      snapshot.bootstrap.workspace.id,
      {
        documentId,
      },
    ),
    "knowledge.documentContext",
  );

export const loadDocumentLinkCandidates = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  spaceId: SpaceId,
  text = "",
  targets?: readonly {
    readonly targetKind:
      "task" | "project" | "person" | "organization" | "meeting";
    readonly targetId: string;
  }[],
): Promise<DocumentLinkCandidatesProjection> =>
  queryProjection(
    client,
    queryEnvelope("document.linkCandidates", snapshot.bootstrap.workspace.id, {
      spaceId,
      text,
      ...(targets === undefined ? {} : { targets }),
      limit: targets === undefined ? 20 : 100,
    }),
    "document.linkCandidates",
  );

export const loadDocumentBacklinks = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  target: {
    readonly targetKind:
      "task" | "project" | "person" | "organization" | "meeting";
    readonly targetId: string;
  },
): Promise<DocumentBacklinksProjection> =>
  queryProjection(
    client,
    queryEnvelope(
      "document.backlinks",
      snapshot.bootstrap.workspace.id,
      target,
    ),
    "document.backlinks",
  );

/**
 * Preset scopes come from the one delegation partition in the contracts
 * package (ADR-046). The list this replaced had stopped being maintained
 * around R5, so "Full Access" carried neither `task.create` nor anything R12
 * and R13 delivered.
 */
const agentCapabilities = (preset: AgentGrantPreset): readonly Capability[] =>
  capabilitiesForAgentGrantPreset(preset);

/** The per-Space access level a preset carries, at creation and at re-scope alike. */
export const spaceAccessForPreset = (
  preset: AgentGrantPreset,
): "view" | "comment" | "edit" =>
  preset === "observe" ? "view" : preset === "propose" ? "comment" : "edit";

export const createAgentGrant = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly displayName: string;
    readonly preset: AgentGrantPreset;
    readonly spaceIds: readonly SpaceId[];
    readonly expiresAt?: string;
  },
): Promise<
  MutationResult<{
    readonly descriptorPath: string;
    readonly launchCommand: string;
    readonly launchArgs: readonly string[];
  }>
> => {
  if (snapshot.agentAccess.kind !== "ready")
    return { kind: "unavailable", message: "Agent access is unavailable." };
  const grantId = crypto.randomUUID() as GrantId;
  try {
    const credential = await client.prepareAgentCredential({ grantId });
    const response = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "agent.grantCreate",
        commandId: crypto.randomUUID(),
        workspaceId: snapshot.bootstrap.workspace.id,
        idempotencyKey: `agent-grant-create:${grantId}`,
        expectedVersions: {
          [snapshot.bootstrap.workspace.id]:
            snapshot.agentAccess.data.workspaceVersion,
        },
        correlationId: crypto.randomUUID(),
        payload: {
          grantId,
          membershipId: crypto.randomUUID(),
          agentPrincipalId: crypto.randomUUID() as AgentPrincipalId,
          displayName: input.displayName.trim(),
          preset: input.preset,
          capabilityScope: agentCapabilities(input.preset),
          spaces: input.spaceIds.map((spaceId) => ({
            spaceGrantId: crypto.randomUUID(),
            spaceId,
            access: spaceAccessForPreset(input.preset),
          })),
          credentialId: credential.credentialId,
          credentialDigest: credential.credentialDigest,
          ...(input.expiresAt === undefined
            ? {}
            : { expiresAt: input.expiresAt }),
        },
      }),
    );
    if (
      response.kind !== "command_outcome" ||
      response.outcome.outcome !== "success"
    )
      return commandFailure(response);
    return {
      kind: "success",
      data: {
        descriptorPath: credential.descriptorPath,
        launchCommand: credential.launchCommand,
        launchArgs: credential.launchArgs,
      },
    };
  } catch {
    return { kind: "error", message: "Could not create the agent access." };
  }
};

export const rotateAgentCredential = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  grant: AgentAccessProjection["grants"][number],
): Promise<
  MutationResult<{
    readonly descriptorPath: string;
    readonly launchCommand: string;
    readonly launchArgs: readonly string[];
  }>
> => {
  try {
    const credential = await client.prepareAgentCredential({
      grantId: grant.grantId,
    });
    const response = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "agent.grantRotateCredential",
        commandId: crypto.randomUUID(),
        workspaceId: snapshot.bootstrap.workspace.id,
        idempotencyKey: `agent-credential-rotate:${grant.grantId}:${credential.credentialId}`,
        expectedVersions: { [grant.grantId]: grant.version },
        correlationId: crypto.randomUUID(),
        payload: {
          grantId: grant.grantId,
          credentialId: credential.credentialId,
          credentialDigest: credential.credentialDigest,
        },
      }),
    );
    if (
      response.kind !== "command_outcome" ||
      response.outcome.outcome !== "success"
    )
      return commandFailure(response);
    return {
      kind: "success",
      data: {
        descriptorPath: credential.descriptorPath,
        launchCommand: credential.launchCommand,
        launchArgs: credential.launchArgs,
      },
    };
  } catch {
    return { kind: "error", message: "Could not rotate the credential." };
  }
};

export const revokeAgentGrant = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  grant: AgentAccessProjection["grants"][number],
): Promise<MutationResult<undefined>> => {
  if (snapshot.agentAccess.kind !== "ready")
    return { kind: "unavailable", message: "Agent access is unavailable." };
  const expectedVersions = {
    [snapshot.bootstrap.workspace.id]:
      snapshot.agentAccess.data.workspaceVersion,
    [grant.grantId]: grant.version,
    [grant.membershipId]: grant.membershipVersion,
    ...Object.fromEntries(
      grant.spaces.map((space) => [space.spaceGrantId, space.version]),
    ),
  };
  try {
    const response = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "agent.grantRevoke",
        commandId: crypto.randomUUID(),
        workspaceId: snapshot.bootstrap.workspace.id,
        idempotencyKey: `agent-grant-revoke:${grant.grantId}:${grant.version}`,
        expectedVersions,
        correlationId: crypto.randomUUID(),
        payload: { grantId: grant.grantId },
      }),
    );
    if (
      response.kind !== "command_outcome" ||
      response.outcome.outcome !== "success"
    )
      return commandFailure(response);
    return { kind: "success", data: undefined };
  } catch {
    return { kind: "error", message: "Could not revoke the agent access." };
  }
};

/**
 * Re-scopes an issued grant to a chosen preset and, when `spaceIds` is
 * given, a chosen Space set — both replaced whole. Omitting `spaceIds`
 * changes only the preset and its capabilities, leaving every Space grant
 * exactly as it stood; that is what the contract's own `spaces` field being
 * optional is for; stating it always, even to restate the Spaces a grant
 * already has, would bump every Space grant's version on every re-scope,
 * including one that never meant to touch Spaces at all. A grant authorizes
 * against the scope frozen when it was issued, so a release that widens a
 * preset never reaches an agent already connected, and — before this — the
 * only way to change what a grant carries was to revoke and re-create it,
 * minting a new credential and forcing the connected host to be
 * reconfigured. This is the human act that avoids that: the agent picks the
 * new scope up on its next call without reconnecting or taking a new
 * credential.
 */
export const updateAgentGrantScope = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  grant: AgentAccessProjection["grants"][number],
  target: {
    readonly preset: AgentGrantPreset;
    readonly spaceIds?: readonly string[];
  },
): Promise<MutationResult<undefined>> => {
  if (snapshot.agentAccess.kind !== "ready")
    return { kind: "unavailable", message: "Agent access is unavailable." };
  // A stated-but-empty list is a deliberate "zero Spaces", which fails
  // authorization outright once applied (the runtime has no resource left
  // to explain) — refuse it here rather than let the schema's `min(1)`
  // throw inside the `try` and flatten into a generic error. An *omitted*
  // list is a different thing entirely: "don't touch Spaces", handled below.
  if (target.spaceIds?.length === 0)
    return {
      kind: "unavailable",
      message: "Agent access must include at least one Space.",
    };
  const spaceIds = target.spaceIds;
  const access = spaceAccessForPreset(target.preset);
  const existingSpaceGrantIds = new Map<string, string>(
    grant.spaces.map((space) => [space.spaceId, space.spaceGrantId]),
  );
  try {
    const response = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "agent.grantSetScope",
        commandId: crypto.randomUUID(),
        workspaceId: snapshot.bootstrap.workspace.id,
        idempotencyKey: `agent-grant-set-scope:${grant.grantId}:${grant.version}`,
        expectedVersions: {
          [snapshot.bootstrap.workspace.id]:
            snapshot.agentAccess.data.workspaceVersion,
          [grant.grantId]: grant.version,
          // The kernel only widens its exact-key rule to every active Space
          // grant's version when the command actually restates Spaces
          // (mirrors `targetSpaces === undefined` kernel-side) — leaving
          // `spaceIds` undefined leaves those versions untouched, so nothing
          // about them needs to be agreed here either.
          ...(spaceIds === undefined
            ? {}
            : Object.fromEntries(
                grant.spaces.map((space) => [
                  space.spaceGrantId,
                  space.version,
                ]),
              )),
        },
        correlationId: crypto.randomUUID(),
        payload: {
          grantId: grant.grantId,
          preset: target.preset,
          capabilityScope: agentCapabilities(target.preset),
          ...(spaceIds === undefined
            ? {}
            : {
                spaces: spaceIds.map((spaceId) => ({
                  // Reuse the Space's existing grant record when the target
                  // keeps it; the kernel looks one up by (workspace, Space,
                  // principal) and ignores this id for a Space the grant
                  // does not hold yet, so minting a fresh one there is
                  // correct, not just a filler.
                  spaceGrantId:
                    existingSpaceGrantIds.get(spaceId) ?? crypto.randomUUID(),
                  spaceId,
                  access,
                })),
              }),
        },
      }),
    );
    if (
      response.kind !== "command_outcome" ||
      response.outcome.outcome !== "success"
    )
      return commandFailure(response);
    return { kind: "success", data: undefined };
  } catch {
    return {
      kind: "error",
      message: "Could not update the agent's access scope.",
    };
  }
};

export const createRemoteAgentGrant = async (
  client: ConstellationRendererClient,
  input: {
    readonly displayName: string;
    readonly preset: AgentGrantPreset;
    readonly spaceIds: readonly SpaceId[];
    readonly expiresAt?: string;
    readonly federationScope: {
      readonly crossWorkspaceRead: boolean;
      readonly derivedResultWrite: boolean;
      readonly sourceMaterialization: boolean;
    };
  },
): Promise<
  MutationResult<{
    readonly endpoint: string;
    readonly descriptorPath: string;
  }>
> => {
  try {
    const result = await client.createRemoteAgentGrant({
      displayName: input.displayName,
      preset: input.preset,
      capabilityScope: agentCapabilities(input.preset),
      spaces: input.spaceIds.map((spaceId) => ({
        spaceId,
        access:
          input.preset === "observe"
            ? "view"
            : input.preset === "propose"
              ? "comment"
              : "edit",
      })),
      federationScope: input.federationScope,
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    });
    return {
      kind: "success",
      data: {
        endpoint: result.endpoint,
        descriptorPath: result.descriptorPath,
      },
    };
  } catch (error) {
    return {
      kind: "error",
      message:
        error instanceof Error
          ? error.message
          : "Could not create the remote MCP access.",
    };
  }
};

export const rotateRemoteAgentCredential = async (
  client: ConstellationRendererClient,
  grant: AgentAccessProjection["grants"][number],
): Promise<
  MutationResult<{ readonly endpoint: string; readonly descriptorPath: string }>
> => {
  try {
    const result = await client.rotateRemoteAgentGrant({
      grantId: grant.grantId,
      expectedVersion: grant.version,
    });
    return {
      kind: "success",
      data: {
        endpoint: result.endpoint,
        descriptorPath: result.descriptorPath,
      },
    };
  } catch (error) {
    return {
      kind: "error",
      message:
        error instanceof Error
          ? error.message
          : "Could not rotate the remote credential.",
    };
  }
};

export const revokeRemoteAgentGrant = async (
  client: ConstellationRendererClient,
  grant: AgentAccessProjection["grants"][number],
): Promise<MutationResult<undefined>> => {
  try {
    await client.revokeRemoteAgentGrant({
      grantId: grant.grantId,
      expectedVersion: grant.version,
    });
    return { kind: "success", data: undefined };
  } catch (error) {
    return {
      kind: "error",
      message:
        error instanceof Error
          ? error.message
          : "Could not revoke the remote access.",
    };
  }
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

export const loadOrganizationOverview = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  organizationId: StrategicRecordId,
  spaceId: SpaceId,
) =>
  queryProjection(
    client,
    queryEnvelope(
      "organization.operationalOverview",
      snapshot.bootstrap.workspace.id,
      { organizationId, spaceId },
    ),
    "organization.operationalOverview",
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
      message: "The command was refused at the desktop boundary.",
    };
  const outcome = response.outcome;
  if (outcome.outcome === "conflict")
    return {
      kind: "conflict",
      message: `The change was not saved: ${outcome.diagnosticCode}. Refresh the data and try again.`,
    };
  if (outcome.outcome === "retryable")
    return {
      kind: "retry",
      message:
        outcome.diagnosticCode === "storage.capacity_exhausted"
          ? "There is no room for a safe write. Nothing was half-saved. Free up space and try again."
          : outcome.diagnosticCode === "storage.permission_denied"
            ? "The workspace cannot write right now. Nothing was half-saved. Restore access and try again."
            : "The local store is busy right now. Nothing was half-saved.",
      ...(outcome.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: outcome.retryAfterMs }),
    };
  if (outcome.outcome === "rejected")
    return {
      kind: "unavailable",
      // `authorization.denied` now means only "this access does not carry the
      // capability". A refusal because the record is out of reach — another
      // Space, an access level too low, or simply not there — arrives as a
      // precondition, so that copy has to cover reach as well as staleness.
      // `record.still_referenced` is neither: the record is in reach and its
      // state has not moved, so the kernel names the one cause and the one
      // thing that clears it.
      message:
        outcome.diagnosticCode === "authorization.denied"
          ? "This access does not allow that change."
          : outcome.diagnosticCode === "record.still_referenced"
            ? "Cannot delete this: another record still references it. Unlink what points at it and try again."
            : "Cannot make that change: the record is out of reach or its state moved.",
    };
  return {
    kind: "unavailable",
    message: `Cannot confirm the outcome right now: ${outcome.diagnosticCode}.`,
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
        error instanceof Error ? error.message : "Unexpected desktop error.",
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

// Intencja jest opcjonalna na tworzeniu, a pusty tekst zostaje odrzucony przez
// kontrakt — klucz musi więc zniknąć z payloadu, nigdy nie pojechać jako "".
export const createProject = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  title: string,
  intendedOutcome?: string,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "project.create",
      payload: {
        spaceId: firstSpace(snapshot),
        title,
        ...(intendedOutcome === undefined ? {} : { intendedOutcome }),
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "project.created"
        ? response.outcome.projection
        : undefined,
  );

export const renameWorkspace = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  name: string,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [snapshot.bootstrap.workspace.id]: snapshot.bootstrap.workspace.version,
      }),
      commandName: "workspace.rename",
      payload: { name },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "workspace.renamed"
        ? response.outcome.projection
        : undefined,
  );

export const setWorkspaceVoiceAudioRetention = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  retentionPolicy: "delete_after_transcript" | "retain",
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [snapshot.bootstrap.workspace.id]: snapshot.bootstrap.workspace.version,
      }),
      commandName: "workspace.setVoiceAudioRetention",
      payload: { retentionPolicy },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind ===
        "workspace.voice_audio_retention_changed"
        ? response.outcome.projection
        : undefined,
  );

export const createArea = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  title: string,
  responsibility?: string,
) => {
  const areaId = crypto.randomUUID() as StrategicRecordId;
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "area.create",
      payload: {
        areaId,
        spaceId: firstSpace(snapshot),
        title,
        ...(responsibility === undefined ? {} : { responsibility }),
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? { areaId }
        : undefined,
  );
};

export const updateAreaResponsibility = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  area: { readonly id: StrategicRecordId; readonly version: number },
  responsibility: string,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [area.id]: area.version,
      }),
      commandName: "area.updateResponsibility",
      payload: { areaId: area.id, responsibility },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? response.outcome.projection
        : undefined,
  );

export const createInitiative = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  title: string,
  intendedOutcome?: string,
) => {
  const initiativeId = crypto.randomUUID() as StrategicRecordId;
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "initiative.create",
      payload: {
        initiativeId,
        spaceId: firstSpace(snapshot),
        title,
        ...(intendedOutcome === undefined ? {} : { intendedOutcome }),
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? { initiativeId }
        : undefined,
  );
};

export const updateInitiativeOutcome = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  initiative: { readonly id: StrategicRecordId; readonly version: number },
  intendedOutcome: string,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [initiative.id]: initiative.version,
      }),
      commandName: "initiative.updateOutcome",
      payload: { initiativeId: initiative.id, intendedOutcome },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? response.outcome.projection
        : undefined,
  );

export interface SavedWorkViewFilters {
  readonly operationalStates?: readonly (
    "actionable" | "waiting" | "blocked"
  )[];
  // ADR-045. Relation conditions are authorable from the desktop now. The
  // absence of these keys was the whole basis for calling "Filtr po relacji"
  // met while the kernel still accepted-and-dropped the R12.4 relation filters.
  readonly relationConditions?: readonly RelationCondition[];
  readonly unassigned?: boolean;
  readonly statusIds?: readonly TaskStatusId[];
  readonly assigneePrincipalIds?: readonly PrincipalId[];
  readonly priorities?: readonly ("urgent" | "high" | "normal" | "low")[];
  readonly dueWindow?: "overdue" | "today" | "this_week";
  readonly scheduled?: boolean;
  readonly fields?: readonly {
    readonly fieldId: string;
    readonly predicate:
      | { readonly kind: "choice_is"; readonly option: string }
      | { readonly kind: "set" }
      | { readonly kind: "empty" };
  }[];
}

export type SavedWorkViewGroupBy =
  "status" | "priority" | { readonly fieldId: string };

export type SavedWorkViewLayout = "list" | "board" | "timeline" | "calendar";

export const createSavedWorkView = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  name: string,
  filters: SavedWorkViewFilters,
  sort: "updated_desc" | "due_asc" | "title_asc" = "updated_desc",
  groupBy?: SavedWorkViewGroupBy,
  layout?: SavedWorkViewLayout,
) => {
  const savedViewId = crypto.randomUUID() as StrategicRecordId;
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "savedView.create",
      payload: {
        savedViewId,
        spaceId: firstSpace(snapshot),
        name,
        filters,
        sort,
        ...(groupBy === undefined ? {} : { groupBy }),
        ...(layout === undefined ? {} : { layout }),
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? { savedViewId }
        : undefined,
  );
};

export const renameSavedWorkView = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  savedViewId: string,
  savedViewVersion: number,
  name: string,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [savedViewId]: savedViewVersion,
      }),
      commandName: "savedView.rename",
      payload: { savedViewId, name },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? response.outcome.projection
        : undefined,
  );

export const setSavedWorkViewLayout = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  savedViewId: string,
  savedViewVersion: number,
  layout: SavedWorkViewLayout,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [savedViewId]: savedViewVersion,
      }),
      commandName: "savedView.update",
      payload: { savedViewId, layout },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? response.outcome.projection
        : undefined,
  );

export const deleteSavedWorkView = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  savedViewId: string,
  savedViewVersion: number,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [savedViewId]: savedViewVersion,
      }),
      commandName: "savedView.delete",
      payload: { savedViewId },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? response.outcome.projection
        : undefined,
  );

/**
 * Creating a work link. Two kernel facts are encoded here rather than at every
 * call site, because getting either wrong answers with an unnamed
 * `command.precondition_failed` that tells the human nothing.
 *
 * `spaceId` is required, not defaulted. The kernel demands that the payload's
 * Space equal BOTH endpoints' Space (`work.linkCreate` in the application
 * kernel), and `project.operationalOverview` takes only a projectId — a Project
 * opened from global search or from an entity link can sit outside the first
 * Space. The old hardcoded `firstSpace(snapshot)` therefore turned a legitimate
 * link into a silent rejection, and a silent default is exactly the failure
 * mode being removed, so a caller must now name the Space it is writing into.
 *
 * `expectedVersions` is `{}` and stays `{}`. This is the one command on this
 * page whose kernel branch asserts `exactExpected(command, {})`: sending the
 * Project's or the Organization's version is a rejection, not a stricter check.
 * `work.linkRemove` is the opposite — see `removeWorkLink` below.
 */
export const createWorkLink = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  spaceId: SpaceId,
  linkType: WorkLinkType,
  sourceRecordId: string,
  targetRecordId: string,
) => {
  const linkId = crypto.randomUUID() as StrategicRecordId;
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "work.linkCreate",
      payload: {
        linkId,
        spaceId,
        linkType,
        sourceRecordId,
        targetRecordId,
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? { linkId }
        : undefined,
  );
};

/**
 * Detaching a work link. The mirror image of `createWorkLink`: the kernel
 * demands the link's OWN current version and nothing else, so the version has
 * to be resolved before the command is built rather than guessed at the call
 * site. Removal is a state change on the link record, not a delete — undo puts
 * it back.
 */
export const removeWorkLink = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  link: { readonly id: StrategicRecordId; readonly version: number },
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [link.id]: link.version,
      }),
      commandName: "work.linkRemove",
      payload: { linkId: link.id },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? response.outcome.projection
        : undefined,
  );

/**
 * The direct `project_serves_organization` links one end of the edge holds,
 * keyed by the record at the other end. `from` names the end being asked, so
 * the two surfaces that author this edge — the Project's Klient card and the
 * Organization's Aktywna praca card — read it through one filter instead of
 * two that can disagree about what "still linked" means.
 *
 * `state === "active"` is live filtering, not belt-and-braces: `work.linkRemove`
 * flips the link's own `state` field and leaves `recordState` alone, so a
 * detached link keeps appearing in `relationship.workspace` forever. Reading it
 * as still linked would offer a second detach for a link that is already gone.
 */
const directDeliveryLinks = (
  snapshot: Pick<DesktopSnapshot, "relationships">,
  from: "project" | "organization",
  recordId: string,
): ReadonlyMap<
  string,
  { readonly linkId: StrategicRecordId; readonly version: number }
> => {
  const links = new Map<
    string,
    { readonly linkId: StrategicRecordId; readonly version: number }
  >();
  if (snapshot.relationships.kind !== "ready") return links;
  for (const record of snapshot.relationships.data.records) {
    if (
      record.kind !== "work_link" ||
      record.state !== "active" ||
      record.linkType !== "project_serves_organization"
    )
      continue;
    const [near, far] =
      from === "project"
        ? [record.sourceRecordId, record.targetRecordId]
        : [record.targetRecordId, record.sourceRecordId];
    if (near === recordId)
      links.set(far, { linkId: record.id, version: record.version });
  }
  return links;
};

/** The clients this Project is directly linked to, keyed by Organization. */
export const directClientLinks = (
  snapshot: Pick<DesktopSnapshot, "relationships">,
  projectId: ProjectId,
) => directDeliveryLinks(snapshot, "project", projectId);

/** The deliveries directly linked at this client, keyed by Project. */
export const directDeliveryProjects = (
  snapshot: Pick<DesktopSnapshot, "relationships">,
  organizationId: StrategicRecordId,
) => directDeliveryLinks(snapshot, "organization", organizationId);

/**
 * The Organizations this Project can still be linked to. Both filters exist to
 * keep the picker from ever offering an option the kernel would refuse without
 * naming a cause: `work.linkCreate` requires both endpoints in the payload's
 * Space, and its duplicate guard rejects a second active link between the same
 * pair with the same opaque `command.precondition_failed`.
 */
export const linkableClientOrganizations = (
  snapshot: Pick<DesktopSnapshot, "relationships">,
  project: { readonly id: ProjectId; readonly spaceId: SpaceId },
):
  | readonly { readonly id: StrategicRecordId; readonly name: string }[]
  | undefined => {
  // `undefined`, not `[]`, when the slice never loaded. An empty array here
  // would tell a human "this Space has no organizations" on the evidence that
  // a read failed — which is the shape of the outage that made this branch
  // necessary: two surfaces degraded to "unavailable" and nothing said why.
  // The caller has to say which of the two it is.
  if (snapshot.relationships.kind !== "ready") return undefined;
  const linked = directClientLinks(snapshot, project.id);
  return snapshot.relationships.data.records
    .filter(
      (
        record,
      ): record is Extract<
        RelationshipWorkspaceProjection["records"][number],
        { kind: "organization" }
      > =>
        record.kind === "organization" &&
        record.spaceId === project.spaceId &&
        !linked.has(record.id),
    )
    .map((record) => ({ id: record.id, name: record.name }))
    .sort((left, right) =>
      left.name.localeCompare(right.name, "pl", { sensitivity: "base" }),
    );
};

export const linkProjectClient = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  project: { readonly id: ProjectId; readonly spaceId: SpaceId },
  organizationId: StrategicRecordId,
) =>
  createWorkLink(
    client,
    snapshot,
    project.spaceId,
    "project_serves_organization",
    project.id,
    organizationId,
  );

/**
 * Detaching a client. The link's identity is resolved here, at call time, out
 * of `snapshot.relationships` — deliberately NOT from session state the way
 * `onUnrelate` reads `sessionRelation`, because a client link is typically
 * years old and was usually made by an agent, so a session-scoped handle would
 * work for nothing a human actually wants to detach. The precedent is the offer
 * path above, which reads an Opportunity's version out of the same slice and
 * answers `unavailable` when that slice is not loaded.
 */
export const unlinkProjectClient = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  projectId: ProjectId,
  organizationId: StrategicRecordId,
) => {
  const link = directClientLinks(snapshot, projectId).get(organizationId);
  if (link === undefined)
    return Promise.resolve<MutationResult<never>>({
      kind: "unavailable",
      message: "The client link needs a data reload before it can be unlinked.",
    });
  return removeWorkLink(client, snapshot, {
    id: link.linkId,
    version: link.version,
  });
};

/**
 * The Projects this client can still be given as a delivery — the same edge as
 * `linkableClientOrganizations`, authored from the other end.
 *
 * Two slices have to be loaded, not one: the Projects come from `project.list`
 * and the links already made come from `relationship.workspace`. Either being
 * absent means the answer is unknown rather than empty, for the reason spelled
 * out on the Project-side helper above.
 *
 * Only `active` Projects are offered. A closed one would land a link that shows
 * nowhere on this page, since `activeProjects` filters on lifecycle — and a
 * delivery that closes after being linked stays detachable from the Project's
 * own Klient card, which does not filter, so nothing becomes unreachable.
 */
export const linkableDeliveryProjects = (
  snapshot: Pick<DesktopSnapshot, "relationships" | "projects">,
  organization: { readonly id: StrategicRecordId; readonly spaceId: SpaceId },
):
  readonly { readonly id: ProjectId; readonly title: string }[] | undefined => {
  if (
    snapshot.relationships.kind !== "ready" ||
    snapshot.projects.kind !== "ready"
  )
    return undefined;
  const linked = directDeliveryProjects(snapshot, organization.id);
  return snapshot.projects.data.items
    .filter(
      (project) =>
        project.lifecycle === "active" &&
        project.spaceId === organization.spaceId &&
        !linked.has(project.id),
    )
    .map((project) => ({ id: project.id, title: project.title }))
    .sort((left, right) =>
      left.title.localeCompare(right.title, "pl", { sensitivity: "base" }),
    );
};

/**
 * The same command as `linkProjectClient`, with the endpoints in the same
 * order — `project_serves_organization` reads source-to-target and the kernel
 * enforces the kinds at each end, so authoring from the client does not flip it.
 *
 * The Space is resolved here from the client record rather than taken from the
 * caller, for the reason `createWorkLink` refuses a default: it must equal both
 * endpoints', and the candidate list this pairs with already filters Projects
 * to that Space. Answering `unavailable` when the record is not loaded is the
 * same contract `unlinkOrganizationDelivery` keeps below.
 */
export const linkOrganizationDelivery = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  organizationId: StrategicRecordId,
  projectId: ProjectId,
) => {
  const organization =
    snapshot.relationships.kind === "ready"
      ? snapshot.relationships.data.records.find(
          (record) =>
            record.kind === "organization" && record.id === organizationId,
        )
      : undefined;
  if (organization === undefined || organization.kind !== "organization")
    return Promise.resolve<MutationResult<never>>({
      kind: "unavailable",
      message: "The client data needs a reload before a project can be linked.",
    });
  return createWorkLink(
    client,
    snapshot,
    organization.spaceId,
    "project_serves_organization",
    projectId,
    organization.id,
  );
};

export const unlinkOrganizationDelivery = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  organizationId: StrategicRecordId,
  projectId: ProjectId,
) => {
  const link = directDeliveryProjects(snapshot, organizationId).get(projectId);
  if (link === undefined)
    return Promise.resolve<MutationResult<never>>({
      kind: "unavailable",
      message:
        "The project link needs a data reload before it can be unlinked.",
    });
  return removeWorkLink(client, snapshot, {
    id: link.linkId,
    version: link.version,
  });
};

export const setTaskOperationalState = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  task: WorkOverviewProjection["tasks"][number],
  operationalState: "actionable" | "waiting" | "blocked",
  waitingLabel?: string,
  waitingDetails?: {
    readonly direction?: "waiting_on_them" | "we_owe";
    readonly expectedAt?: string;
  },
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [task.id]: task.version,
      }),
      commandName: "task.setOperationalState",
      payload: {
        taskId: task.id,
        operationalState,
        ...(operationalState === "waiting" && waitingLabel?.trim()
          ? {
              waitingOn: {
                kind: "external",
                label: waitingLabel.trim(),
                ...(waitingDetails?.direction === undefined
                  ? {}
                  : { direction: waitingDetails.direction }),
                ...(waitingDetails?.expectedAt === undefined
                  ? {}
                  : { expectedAt: waitingDetails.expectedAt }),
              },
            }
          : {}),
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "task.operational_state_changed"
        ? response.outcome.projection
        : undefined,
  );

export const createOrganization = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: { readonly name: string; readonly nextAction?: string },
) => {
  const organizationId = crypto.randomUUID() as StrategicRecordId;
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "relationship.organizationCreate",
      payload: {
        organizationId,
        spaceId: firstSpace(snapshot),
        name: input.name,
        relationshipState: "prospect",
        ...(input.nextAction === undefined || input.nextAction.trim() === ""
          ? {}
          : { nextAction: input.nextAction }),
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? response.outcome.projection
        : undefined,
  );
};

// The kinds a human can remove from the inspector, and the payload field each
// removal names. Kinds absent here have their own lifecycle command (a saved
// view is deleted, a work link is detached) or no removal at all.
const STRATEGIC_REMOVE_COMMANDS: Readonly<
  Record<string, { readonly name: string; readonly idField: string }>
> = {
  organization: {
    name: "relationship.organizationRemove",
    idField: "organizationId",
  },
  person: { name: "relationship.personRemove", idField: "personId" },
  opportunity: { name: "opportunity.remove", idField: "opportunityId" },
  offer: { name: "opportunity.offerRemove", idField: "offerId" },
  relationship_fact: {
    name: "relationship.factRemove",
    idField: "factId",
  },
  decision: { name: "decision.remove", idField: "decisionId" },
  area: { name: "area.remove", idField: "areaId" },
  initiative: { name: "initiative.remove", idField: "initiativeId" },
};

/**
 * Removing a strategic record. A soft delete, refused by the kernel while
 * another record still points at it — the surface reports that refusal as what
 * it is rather than as a generic failure, and undo puts the record back.
 */
export const removeStrategicRecord = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  record: {
    readonly id: StrategicRecordId;
    readonly kind: string;
    readonly version: number;
  },
) => {
  const command = STRATEGIC_REMOVE_COMMANDS[record.kind];
  if (command === undefined)
    return Promise.resolve<MutationResult<never>>({
      kind: "error",
      message: "This kind of record cannot be removed.",
    });
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [record.id]: record.version,
      }),
      commandName: command.name,
      payload: { [command.idField]: record.id },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_removed"
        ? response.outcome.projection
        : undefined,
  );
};

export const createOpportunity = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly organizationId: StrategicRecordId;
    readonly title: string;
    readonly need: string;
    readonly nextAction: string;
  },
) => {
  const opportunityId = crypto.randomUUID() as StrategicRecordId;
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "opportunity.create",
      payload: {
        opportunityId,
        spaceId: firstSpace(snapshot),
        organizationId: input.organizationId,
        personIds: [],
        title: input.title,
        need: input.need,
        qualification: "Requires review",
        stage: "discovery",
        nextAction: input.nextAction,
        evidenceSourceIds: [],
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? response.outcome.projection
        : undefined,
  );
};

const currentPrincipal = (
  snapshot: DesktopSnapshot,
): PrincipalId | undefined =>
  snapshot.access.kind === "ready"
    ? snapshot.access.data.currentPrincipalId
    : undefined;

export const createPerson = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly name: string;
    readonly organizationId?: StrategicRecordId;
    readonly role?: string;
    readonly email?: string;
  },
) => {
  const personId = crypto.randomUUID() as StrategicRecordId;
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "relationship.personCreate",
      payload: {
        personId,
        spaceId: firstSpace(snapshot),
        name: input.name,
        ...(input.organizationId === undefined
          ? {}
          : { organizationId: input.organizationId }),
        ...(input.role?.trim() ? { role: input.role.trim() } : {}),
        ...(input.email?.trim() ? { email: input.email.trim() } : {}),
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? { personId }
        : undefined,
  );
};

export const createOffer = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly opportunityId: StrategicRecordId;
    readonly deliverableDocumentId: DocumentId;
    readonly title: string;
    readonly nextAction: string;
  },
) => {
  const ownerPrincipalId = currentPrincipal(snapshot);
  if (ownerPrincipalId === undefined)
    return Promise.resolve<MutationResult<never>>({
      kind: "unavailable",
      message: "Cannot determine the offer owner.",
    });
  const offerId = crypto.randomUUID() as StrategicRecordId;
  const created = await execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "opportunity.offerCreate",
      payload: {
        offerId,
        opportunityId: input.opportunityId,
        deliverableDocumentId: input.deliverableDocumentId,
        title: input.title,
        ownerPrincipalId,
        state: "draft",
        nextAction: input.nextAction,
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? { offerId }
        : undefined,
  );
  if (created.kind !== "success") return created;
  const opportunity =
    snapshot.relationships.kind === "ready"
      ? snapshot.relationships.data.records.find(
          (
            record,
          ): record is Extract<
            RelationshipWorkspaceProjection["records"][number],
            { kind: "opportunity" }
          > =>
            record.kind === "opportunity" && record.id === input.opportunityId,
        )
      : undefined;
  if (opportunity === undefined)
    return {
      kind: "unavailable",
      message:
        "The offer was created, but the Opportunity needs a reload before linking.",
    } as const;
  const linked = await execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [opportunity.id]: opportunity.version,
      }),
      commandName: "opportunity.linkOutcomes",
      payload: {
        opportunityId: opportunity.id,
        offerIds: [...opportunity.offerIds, offerId],
        projectIds: opportunity.projectIds,
        state: "pursued",
        nextAction: input.nextAction,
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? { offerId }
        : undefined,
  );
  return linked;
};

export const createRenewal = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly organizationId: StrategicRecordId;
    readonly title: string;
    readonly scope: string;
    readonly expiresAt: string;
    readonly evidenceSourceIds: readonly KnowledgeSourceId[];
  },
) => {
  const ownerPrincipalId = currentPrincipal(snapshot);
  if (ownerPrincipalId === undefined)
    return Promise.resolve<MutationResult<never>>({
      kind: "unavailable",
      message: "Cannot determine the renewal owner.",
    });
  const renewalId = crypto.randomUUID() as StrategicRecordId;
  const followUpTaskId = crypto.randomUUID() as TaskId;
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "relationship.renewalCreate",
      payload: {
        renewalId,
        followUpTaskId,
        spaceId: firstSpace(snapshot),
        organizationId: input.organizationId,
        title: input.title,
        scope: input.scope,
        expiresAt: input.expiresAt,
        leadTimeDays: 30,
        ownerPrincipalId,
        evidenceSourceIds: input.evidenceSourceIds,
        cycleKey: `${input.organizationId}:${input.expiresAt.slice(0, 10)}`,
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? { renewalId, followUpTaskId }
        : undefined,
  );
};

export const createRelationshipFact = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly organizationId: StrategicRecordId;
    readonly factType: string;
    readonly value: string;
    readonly evidenceSourceId: KnowledgeSourceId;
  },
) => {
  const factId = crypto.randomUUID() as StrategicRecordId;
  const verifiedAt = new Date().toISOString();
  const staleAfter = new Date(Date.now() + 90 * 86_400_000).toISOString();
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "relationship.factCreate",
      payload: {
        factId,
        spaceId: firstSpace(snapshot),
        organizationId: input.organizationId,
        factType: input.factType,
        value: input.value,
        evidenceSourceIds: [input.evidenceSourceId],
        verifiedAt,
        staleAfter,
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? { factId }
        : undefined,
  );
};

export const createDecision = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  title: string,
  rationale: string,
  evidenceSourceIds: readonly KnowledgeSourceId[] = [],
) => {
  const decisionId = crypto.randomUUID() as StrategicRecordId;
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "decision.create",
      payload: {
        decisionId,
        spaceId: firstSpace(snapshot),
        title,
        rationale,
        evidenceSourceIds,
        linkedRecordIds: [],
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? { decisionId }
        : undefined,
  );
};

export const supersedeDecision = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  prior: Extract<
    RelationshipWorkspaceProjection["records"][number],
    { kind: "decision" }
  >,
  input: {
    readonly title: string;
    readonly rationale: string;
    readonly reason: string;
  },
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [prior.id]: prior.version,
      }),
      commandName: "decision.supersede",
      payload: {
        priorDecisionId: prior.id,
        replacementDecisionId: crypto.randomUUID(),
        impactReviewId: crypto.randomUUID(),
        title: input.title,
        rationale: input.rationale,
        reason: input.reason,
        evidenceSourceIds: prior.evidenceSourceIds,
        consequences: [],
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? response.outcome.projection
        : undefined,
  );

export const createRecurrence = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly title: string;
    readonly taskTitle: string;
    readonly cadence: "daily" | "weekly" | "monthly" | "yearly";
  },
) => {
  const recurrenceId = crypto.randomUUID() as StrategicRecordId;
  const intervalDays = { daily: 1, weekly: 7, monthly: 30, yearly: 365 }[
    input.cadence
  ];
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "recurrence.create",
      payload: {
        recurrenceId,
        spaceId: firstSpace(snapshot),
        title: input.title,
        taskTitle: input.taskTitle,
        cadence: input.cadence,
        nextDueAt: new Date(
          Date.now() + intervalDays * 86_400_000,
        ).toISOString(),
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? { recurrenceId }
        : undefined,
  );
};

export const createRadarCandidate = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly sourceId: KnowledgeSourceId;
    readonly title: string;
    readonly relevance: string;
  },
) => {
  const candidateId = crypto.randomUUID() as StrategicRecordId;
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "radar.candidateUpsert",
      payload: {
        candidateId,
        spaceId: firstSpace(snapshot),
        sourceId: input.sourceId,
        materialKey: `${input.sourceId}:${input.title.trim().toLocaleLowerCase("pl-PL")}`,
        title: input.title,
        relevance: input.relevance,
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? { candidateId }
        : undefined,
  );
};

export const addWorkspaceMember = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly displayName: string;
    readonly role: "admin" | "member" | "guest";
    readonly access: "view" | "comment" | "edit";
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
  access: "view" | "comment" | "edit",
) => {
  const grant = member.spaces[0];
  if (grant === undefined)
    return Promise.resolve<MutationResult<never>>({
      kind: "unavailable",
      message: "This member has no active Space scope.",
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

export const createTask = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly title: string;
    readonly description?: string;
    readonly nextAction?: string;
    readonly parentTaskId?: TaskId;
  },
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "task.create",
      payload: {
        taskId: crypto.randomUUID(),
        spaceId: firstSpace(snapshot),
        title: input.title,
        ...(input.description === undefined || input.description === ""
          ? {}
          : { description: input.description }),
        ...(input.nextAction === undefined || input.nextAction === ""
          ? {}
          : { nextAction: input.nextAction }),
        ...(input.parentTaskId === undefined
          ? {}
          : { parentTaskId: input.parentTaskId }),
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "task.created"
        ? response.outcome.projection
        : undefined,
  );

export interface TaskDetailsDraft {
  readonly title?: string;
  readonly description?: string | null;
  readonly nextAction?: string | null;
  readonly startAt?: string | null;
  readonly dueAt?: string | null;
  readonly priority?: "urgent" | "high" | "normal" | "low" | null;
  readonly attachmentSourceIds?: readonly KnowledgeSourceId[];
}

export const updateTaskDetails = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  taskId: TaskId,
  taskVersion: number,
  draft: TaskDetailsDraft,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [taskId]: taskVersion,
        ...(draft.attachmentSourceIds === undefined ||
        snapshot.knowledge.kind !== "ready"
          ? {}
          : Object.fromEntries(
              snapshot.knowledge.data.sources
                .filter((source) =>
                  draft.attachmentSourceIds!.includes(source.id),
                )
                .map((source) => [source.id, source.version]),
            )),
      }),
      commandName: "task.updateDetails",
      payload: {
        taskId,
        ...(draft.title === undefined ? {} : { title: draft.title }),
        ...(draft.description === undefined
          ? {}
          : { description: draft.description }),
        ...(draft.nextAction === undefined
          ? {}
          : { nextAction: draft.nextAction }),
        ...(draft.startAt === undefined ? {} : { startAt: draft.startAt }),
        ...(draft.dueAt === undefined ? {} : { dueAt: draft.dueAt }),
        ...(draft.priority === undefined ? {} : { priority: draft.priority }),
        ...(draft.attachmentSourceIds === undefined
          ? {}
          : { attachmentSourceIds: draft.attachmentSourceIds }),
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "task.details_updated"
        ? response.outcome.projection
        : undefined,
  );

// R12.6 / ADR-042 — records the calendar block a Task owns, or releases the
// claim with null. Recording only: the provider write already happened through
// the exact single-use consent preview, and `revision` is the value that write
// returned. Callers must pass the task version they read *before* confirming,
// and must not treat a failure here as a failed reservation — the provider
// event exists either way.
export interface TaskCalendarBlockDraft {
  readonly ownedBlockExternalId: string;
  readonly calendarExternalId: string;
  readonly revision: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export const setTaskCalendarBlock = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  taskId: TaskId,
  taskVersion: number,
  block: TaskCalendarBlockDraft | null,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [taskId]: taskVersion,
      }),
      commandName: "task.setCalendarBlock",
      payload: { taskId, block },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "task.details_updated"
        ? response.outcome.projection
        : undefined,
  );

// R12.7 / ADR-043 — a soft delete. It is reversible with the undo affordance
// that follows every mutation, so the surface confirms once and does not
// pretend the Task is gone forever. Removal is refused by the kernel when the
// Task still has an active subtask; the caller surfaces that as a precondition
// failure rather than a generic error.
export const removeTask = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  taskId: TaskId,
  taskVersion: number,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [taskId]: taskVersion,
      }),
      commandName: "task.remove",
      payload: { taskId },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "task.removed"
        ? response.outcome.projection
        : undefined,
  );

export type FieldType =
  | { readonly kind: "text" }
  | { readonly kind: "number" }
  | { readonly kind: "date" }
  | { readonly kind: "choice"; readonly options: readonly string[] };

export type FieldValue =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "date"; readonly value: string }
  | { readonly kind: "choice"; readonly value: string };

export const createFieldDefinition = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly targetKind: "task" | "project";
    readonly label: string;
    readonly type: FieldType;
  },
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "fieldDef.create",
      payload: {
        fieldId: crypto.randomUUID(),
        targetKind: input.targetKind,
        label: input.label,
        type: input.type,
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "fieldDef.created"
        ? response.outcome.projection
        : undefined,
  );

export const changeFieldDefinition = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  fieldId: string,
  fieldVersion: number,
  change:
    | { readonly kind: "rename"; readonly label: string }
    | { readonly kind: "archive" }
    | { readonly kind: "restore" },
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [fieldId]: fieldVersion,
      }),
      ...(change.kind === "rename"
        ? {
            commandName: "fieldDef.rename",
            payload: { fieldId, label: change.label },
          }
        : change.kind === "archive"
          ? { commandName: "fieldDef.archive", payload: { fieldId } }
          : { commandName: "fieldDef.restore", payload: { fieldId } }),
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "fieldDef.changed"
        ? response.outcome.projection
        : undefined,
  );

export const setRecordFieldValue = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly targetKind: "task" | "project";
    readonly recordId: string;
    readonly recordVersion: number;
    readonly fieldId: string;
    readonly value: FieldValue | null;
  },
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [input.recordId]: input.recordVersion,
      }),
      commandName: "record.setFieldValue",
      payload: {
        targetKind: input.targetKind,
        recordId: input.recordId,
        fieldId: input.fieldId,
        value: input.value,
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "record.field_value_set"
        ? response.outcome.projection
        : undefined,
  );

export const createProjectTemplateDefinition = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly name: string;
    readonly taskTitles: readonly string[];
  },
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "template.create",
      payload: {
        templateId: crypto.randomUUID(),
        name: input.name,
        taskTitles: input.taskTitles,
        fieldIds: [],
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "template.created"
        ? response.outcome.projection
        : undefined,
  );

export const changeProjectTemplateDefinition = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  templateId: string,
  templateVersion: number,
  change:
    | { readonly kind: "rename"; readonly name: string }
    | { readonly kind: "archive" }
    | { readonly kind: "restore" },
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [templateId]: templateVersion,
      }),
      ...(change.kind === "rename"
        ? {
            commandName: "template.rename",
            payload: { templateId, name: change.name },
          }
        : change.kind === "archive"
          ? { commandName: "template.archive", payload: { templateId } }
          : { commandName: "template.restore", payload: { templateId } }),
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "template.changed"
        ? response.outcome.projection
        : undefined,
  );

export const applyTemplateToProject = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly projectId: string;
    readonly projectVersion: number;
    readonly templateId: string;
  },
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [input.projectId]: input.projectVersion,
      }),
      commandName: "project.applyTemplate",
      payload: { projectId: input.projectId, templateId: input.templateId },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "project.template_applied"
        ? response.outcome.projection
        : undefined,
  );

export type AutomationRecipeInput =
  | { readonly kind: "complete_sets_status"; readonly statusId: string }
  | { readonly kind: "waiting_review_signals" };

export const createAutomationRuleDefinition = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: { readonly name: string; readonly recipe: AutomationRecipeInput },
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "automation.create",
      payload: {
        ruleId: crypto.randomUUID(),
        name: input.name,
        recipe: input.recipe,
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "automation.created"
        ? response.outcome.projection
        : undefined,
  );

export const changeAutomationRuleDefinition = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  ruleId: string,
  ruleVersion: number,
  change:
    | { readonly kind: "rename"; readonly name: string }
    | { readonly kind: "setState"; readonly state: "active" | "disabled" },
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [ruleId]: ruleVersion,
      }),
      ...(change.kind === "rename"
        ? {
            commandName: "automation.rename",
            payload: { ruleId, name: change.name },
          }
        : {
            commandName: "automation.setState",
            payload: { ruleId, state: change.state },
          }),
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "automation.changed"
        ? response.outcome.projection
        : undefined,
  );

export type TaskStatusSemantics =
  "actionable" | "waiting" | "blocked" | "paused";

export const createTaskStatusDefinition = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly label: string;
    readonly operationalSemantics: TaskStatusSemantics;
  },
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {}),
      commandName: "taskStatus.create",
      payload: {
        statusId: crypto.randomUUID(),
        label: input.label,
        operationalSemantics: input.operationalSemantics,
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "taskStatus.created"
        ? response.outcome.projection
        : undefined,
  );

export type TaskStatusDefinitionChange =
  | { readonly kind: "rename"; readonly label: string }
  | {
      readonly kind: "semantics";
      readonly operationalSemantics: TaskStatusSemantics;
    }
  | { readonly kind: "reorder"; readonly position: number }
  | { readonly kind: "archive" }
  | { readonly kind: "restore" };

export const changeTaskStatusDefinition = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  statusId: TaskStatusId,
  statusVersion: number,
  change: TaskStatusDefinitionChange,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [statusId]: statusVersion,
      }),
      ...(change.kind === "rename"
        ? {
            commandName: "taskStatus.rename",
            payload: { statusId, label: change.label },
          }
        : change.kind === "semantics"
          ? {
              commandName: "taskStatus.setSemantics",
              payload: {
                statusId,
                operationalSemantics: change.operationalSemantics,
              },
            }
          : change.kind === "reorder"
            ? {
                commandName: "taskStatus.reorder",
                payload: { statusId, position: change.position },
              }
            : change.kind === "archive"
              ? { commandName: "taskStatus.archive", payload: { statusId } }
              : { commandName: "taskStatus.restore", payload: { statusId } }),
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "taskStatus.changed"
        ? response.outcome.projection
        : undefined,
  );

export const setDefaultTaskStatus = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  statusId: TaskStatusId,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [snapshot.bootstrap.workspace.id]: snapshot.bootstrap.workspace.version,
      }),
      commandName: "workspace.setDefaultTaskStatus",
      payload: { statusId },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "workspace.default_status_changed"
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
      message: "This task has no assignee.",
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

export const loadComments = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  target: CommentTarget,
) =>
  queryProjection(
    client,
    queryEnvelope("comment.list", snapshot.bootstrap.workspace.id, { target }),
    "comment.list",
  );

export const addComment = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  target: CommentTarget,
  targetVersion: number,
  body: string,
  mentionPrincipalIds: readonly PrincipalId[],
  parent?: CommentListProjection["threads"][number],
  attachmentSourceIds: readonly KnowledgeSourceId[] = [],
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [target.kind === "task" ? target.taskId : target.projectId]:
          targetVersion,
        ...(parent === undefined ? {} : { [parent.id]: parent.version }),
        ...(snapshot.knowledge.kind !== "ready"
          ? {}
          : Object.fromEntries(
              snapshot.knowledge.data.sources
                .filter((source) => attachmentSourceIds.includes(source.id))
                .map((source) => [source.id, source.version]),
            )),
      }),
      commandName: "comment.add",
      payload: {
        commentId: crypto.randomUUID(),
        target,
        ...(parent === undefined ? {} : { parentCommentId: parent.id }),
        body,
        mentionPrincipalIds,
        attachmentSourceIds,
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "comment.added"
        ? response.outcome.projection
        : undefined,
  );

export const editComment = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  commentId: CommentId,
  version: number,
  body: string,
  mentionPrincipalIds: readonly PrincipalId[],
  attachmentSourceIds?: readonly KnowledgeSourceId[],
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [commentId]: version,
        ...(attachmentSourceIds === undefined ||
        snapshot.knowledge.kind !== "ready"
          ? {}
          : Object.fromEntries(
              snapshot.knowledge.data.sources
                .filter((source) => attachmentSourceIds.includes(source.id))
                .map((source) => [source.id, source.version]),
            )),
      }),
      commandName: "comment.edit",
      payload: {
        commentId,
        body,
        mentionPrincipalIds,
        ...(attachmentSourceIds === undefined ? {} : { attachmentSourceIds }),
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "comment.edited"
        ? response.outcome.projection
        : undefined,
  );

export const setCommentResolved = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  comment: CommentListProjection["threads"][number],
  resolved: boolean,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [comment.id]: comment.version,
      }),
      commandName: resolved ? "comment.resolve" : "comment.reopen",
      payload: { commentId: comment.id },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      (response.outcome.projection.kind === "comment.resolved" ||
        response.outcome.projection.kind === "comment.reopened")
        ? response.outcome.projection
        : undefined,
  );

export const updateAttention = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  signal: AttentionInboxProjection["items"][number],
  action: "read" | "dismiss",
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [signal.id]: signal.version,
      }),
      commandName:
        action === "read" ? "attention.markRead" : "attention.dismiss",
      payload: { attentionSignalId: signal.id as AttentionSignalId },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      (response.outcome.projection.kind === "attention.read" ||
        response.outcome.projection.kind === "attention.dismissed")
        ? response.outcome.projection
        : undefined,
  );

export const routeCaptureException = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  captureId: string,
  destination: "task" | "knowledge_source",
) => {
  const capture = snapshot.captures.find((item) => item.id === captureId);
  if (capture === undefined) {
    return Promise.resolve<MutationResult<never>>({
      kind: "error",
      message: "The stored Capture was not found.",
    });
  }
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [capture.id]: capture.version,
      }),
      commandName: "capture.process",
      payload: { captureId: capture.id, destination },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      (response.outcome.projection.kind === "capture.routed_as_task" ||
        response.outcome.projection.kind ===
          "capture.routed_as_knowledge_source")
        ? response.outcome.projection
        : undefined,
  );
};

export const resolveCaptureException = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  signal: AttentionInboxProjection["items"][number],
  action: "retry" | "keep_unclassified" | "replace_payload",
  original?: CaptureOriginal,
) => {
  if (signal.destination.kind !== "capture")
    return Promise.resolve<MutationResult<never>>({
      kind: "error",
      message: "This signal does not lead to a Capture.",
    });
  const captureId = signal.destination.captureId;
  const capture = snapshot.captures.find((item) => item.id === captureId);
  if (capture === undefined)
    return Promise.resolve<MutationResult<never>>({
      kind: "error",
      message: "The stored Capture was not found.",
    });
  if (action === "replace_payload" && original === undefined)
    return Promise.resolve<MutationResult<never>>({
      kind: "error",
      message: "Choose a replacement file before running this operation.",
    });
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [capture.id]: capture.version,
        [signal.id]: signal.version,
      }),
      commandName: "capture.resolveException",
      payload:
        action === "replace_payload"
          ? { captureId: capture.id, action, original: original! }
          : { captureId: capture.id, action },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "capture.exception_resolved"
        ? response.outcome.projection
        : undefined,
  );
};

export const resolveRadarCandidate = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  candidate: Extract<
    RelationshipWorkspaceProjection["records"][number],
    { kind: "radar_candidate" }
  >,
  state: "saved" | "dismissed",
  resolutionRecordId?: string,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [candidate.id]: candidate.version,
      }),
      commandName: "radar.resolve",
      payload: {
        candidateId: candidate.id as StrategicRecordId,
        state,
        ...(resolutionRecordId === undefined ? {} : { resolutionRecordId }),
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? response.outcome.projection
        : undefined,
  );

export const resolveRenewal = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  renewal: Extract<
    RelationshipWorkspaceProjection["records"][number],
    { kind: "renewal" }
  >,
  state: "renewed" | "not_renewing" | "irrelevant",
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [renewal.id]: renewal.version,
      }),
      commandName: "relationship.renewalResolve",
      payload: { renewalId: renewal.id, state },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? response.outcome.projection
        : undefined,
  );

export const generateRecurrenceOccurrence = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  recurrence: Extract<
    RelationshipWorkspaceProjection["records"][number],
    { kind: "recurrence" }
  >,
) => {
  const intervalDays = {
    daily: 1,
    weekly: 7,
    monthly: 30,
    yearly: 365,
  }[recurrence.cadence];
  return execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [recurrence.id]: recurrence.version,
      }),
      commandName: "recurrence.generateOccurrence",
      payload: {
        recurrenceId: recurrence.id,
        occurrenceTaskId: crypto.randomUUID(),
        nextDueAt: new Date(
          Date.parse(recurrence.nextDueAt) + intervalDays * 86_400_000,
        ).toISOString(),
      },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? response.outcome.projection
        : undefined,
  );
};

export const resolveDecisionImpact = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  review: Extract<
    RelationshipWorkspaceProjection["records"][number],
    { kind: "impact_review" }
  >,
  recordId: string,
  resolution: string,
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [review.id]: review.version,
      }),
      commandName: "decision.resolveImpact",
      payload: { impactReviewId: review.id, recordId, resolution },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "strategic.record_changed"
        ? response.outcome.projection
        : undefined,
  );

export const setProjectLifecycle = (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  project: Pick<
    ProjectListProjection["items"][number],
    "id" | "version" | "lifecycle"
  >,
  lifecycle: "active" | "closed",
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [project.id]: project.version,
      }),
      commandName: lifecycle === "closed" ? "project.close" : "project.reopen",
      payload: { projectId: project.id },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "project.lifecycle_changed"
        ? response.outcome.projection
        : undefined,
  );

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
        message: "The undo previews disagree. Nothing was changed.",
      };
    return {
      kind: "success",
      data: { targetCommandId, command: response.outcome, recovery },
    };
  } catch (error) {
    return {
      kind: "error",
      message:
        error instanceof Error ? error.message : "The preview is unavailable.",
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

export const submitQuickCapture = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  original: CaptureOriginal,
  destination: "auto" | "task" | "knowledge_source" = "auto",
): Promise<QuickCaptureResult> => {
  const workspaceId = snapshot.bootstrap.workspace.id;
  const spaceId = firstSpace(snapshot);
  try {
    const correlationId = crypto.randomUUID();
    const submitted = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        ...commandBase(workspaceId, {}),
        correlationId,
        commandName: "capture.submit",
        payload: {
          spaceId,
          original,
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
        commandName: "capture.process",
        payload: { captureId: capture.captureId, destination },
      }),
    );
    if (
      routed.kind !== "command_outcome" ||
      routed.outcome.outcome !== "success"
    )
      return commandFailure(routed);
    const [nextSnapshot, receipt] = await Promise.all([
      loadDesktopSnapshot(client, snapshot.build),
      loadReceipt(client, workspaceId, routed.outcome.auditReceiptId),
    ]);
    return {
      kind: "success",
      receipt,
      result:
        routed.outcome.projection.kind === "capture.routed_as_task"
          ? { kind: "task", taskId: routed.outcome.projection.taskId }
          : routed.outcome.projection.kind ===
              "capture.routed_as_knowledge_source"
            ? {
                kind: "knowledge_source",
                sourceId: routed.outcome.projection.sourceId,
              }
            : routed.outcome.projection.kind === "capture.needs_review"
              ? {
                  kind: "review",
                  attentionSignalId:
                    routed.outcome.projection.attentionSignalId,
                }
              : routed.outcome.projection.kind === "capture.awaiting_transcript"
                ? {
                    kind: "voice_note",
                    captureId: routed.outcome.projection.captureId,
                  }
                : (() => {
                    throw new Error("Unexpected Capture processing result.");
                  })(),
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

export interface StagedManagedAttachment {
  readonly sourceId: KnowledgeSourceId;
  readonly original: Extract<
    CaptureOriginal,
    { kind: "managed_file" | "screenshot" }
  >;
  readonly snapshot: DesktopSnapshot;
}

export const stageManagedAttachment = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
): Promise<MutationResult<StagedManagedAttachment>> => {
  if (client.selectCapturePayload === undefined)
    return {
      kind: "unavailable",
      message: "Choosing a managed file is not available in this environment.",
    };
  const selected = await client.selectCapturePayload();
  if (selected.outcome === "failure") {
    if (selected.code === "cancelled")
      return { kind: "unavailable", message: "No file was chosen." };
    return {
      kind: selected.code === "payload_unavailable" ? "retry" : "error",
      message:
        selected.code === "payload_too_large"
          ? "The file is over the 25 MB limit."
          : selected.code === "payload_empty"
            ? "An empty file cannot be attached."
            : "Could not prepare the file safely.",
    };
  }
  if (
    selected.original.kind !== "managed_file" &&
    selected.original.kind !== "screenshot"
  ) {
    await client.discardCapturePayload?.(selected.original);
    return {
      kind: "error",
      message: "The chosen original is not a supported attachment.",
    };
  }
  const routed = await submitQuickCapture(
    client,
    snapshot,
    selected.original,
    "knowledge_source",
  );
  if (routed.kind !== "success") return routed;
  if (routed.result.kind !== "knowledge_source")
    return {
      kind: "error",
      message: "The file was stored, but no attachment source was created.",
    };
  return {
    kind: "success",
    data: {
      sourceId: routed.result.sourceId,
      original: selected.original,
      snapshot: routed.snapshot,
    },
  };
};

export const attachManagedFileToDocument = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  documentId: DocumentId,
): Promise<MutationResult<DesktopSnapshot>> => {
  const initialContext = await loadKnowledgeDocumentContext(
    client,
    snapshot,
    documentId,
  ).catch(() => undefined);
  if (initialContext === undefined)
    return {
      kind: "unavailable",
      message: "The document is no longer available.",
    };
  const staged = await stageManagedAttachment(client, snapshot);
  if (staged.kind !== "success") return staged;
  const currentContext = await loadKnowledgeDocumentContext(
    client,
    staged.data.snapshot,
    documentId,
  ).catch(() => undefined);
  if (currentContext === undefined)
    return {
      kind: "unavailable",
      message:
        "The file is safely stored in the library, but the document is no longer available.",
    };
  const linked = await setKnowledgeEvidence(
    client,
    staged.data.snapshot,
    documentId,
    [
      ...new Set([
        ...currentContext.evidence
          .filter((item) => item.kind === "source")
          .map((item) => item.recordId as KnowledgeSourceId),
        staged.data.sourceId,
      ]),
    ],
    currentContext.evidence
      .filter((item) => item.kind === "note")
      .map((item) => item.recordId as DocumentId),
  );
  if (linked.kind !== "success")
    return {
      ...linked,
      message: `${linked.message} The file is safely stored in the source library.`,
    };
  return {
    kind: "success",
    data: await loadDesktopSnapshot(client, snapshot.build),
  };
};

export const requestVoiceAudioDeletion = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  captureId: CaptureId,
  expectedVersion: number,
): Promise<MutationResult<CaptureId>> =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [captureId]: expectedVersion,
      }),
      commandName: "capture.requestAudioDeletion",
      payload: { captureId },
    },
    (response) =>
      response.outcome.outcome === "success" &&
      response.outcome.projection.kind === "capture.audio_deletion_requested"
        ? captureId
        : undefined,
  );

export const submitCaptureAsTask = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  originalText: string,
): Promise<SubmitTaskResult> => {
  const result = await submitQuickCapture(
    client,
    snapshot,
    { kind: "text", text: originalText },
    "task",
  );
  if (result.kind !== "success") return result;
  if (result.result.kind !== "task") {
    return { kind: "error", message: "The Capture did not create a task." };
  }
  return {
    kind: "success",
    receipt: result.receipt,
    selectedTaskId: result.result.taskId,
    snapshot: result.snapshot,
  };
};
