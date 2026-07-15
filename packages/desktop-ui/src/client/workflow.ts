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
  type CommentId,
  type AttentionSignalId,
  type DocumentId,
  type DocumentRevisionId,
  type KnowledgeSourceId,
  type NamedDocumentVersionId,
  type WorkspaceId,
  type Capability,
  type GrantId,
  type PrincipalId as AgentPrincipalId,
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
export type AgentAccessProjection = Projection<"agent.access">;
export type ProjectListProjection = Projection<"project.list">;
export type ProjectOverviewProjection =
  Projection<"project.operationalOverview">;
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
export type KnowledgeListProjection = Projection<"knowledge.list">;
export type KnowledgeDocumentContextProjection =
  Projection<"knowledge.documentContext">;
export type CommentTarget = CommentListProjection["target"];

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
  readonly agentAccess: DataSlice<AgentAccessProjection>;
  readonly assignmentCandidates: DataSlice<TaskAssignmentCandidatesProjection>;
  readonly mentionCandidates: DataSlice<MentionCandidatesProjection>;
  readonly attention: DataSlice<AttentionInboxProjection>;
  readonly documents: DataSlice<DocumentListProjection>;
  readonly knowledge: DataSlice<KnowledgeListProjection>;
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
    mentionCandidates,
    attention,
    access,
    localAgentAccess,
    assignmentCandidates,
    cockpit,
    activity,
    documents,
    knowledge,
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
        queryEnvelope("comment.mentionCandidates", workspaceId, { spaceId }),
        "comment.mentionCandidates",
      ),
    ),
    optionalProjection(
      queryProjection(
        client,
        queryEnvelope("attention.inbox", workspaceId, { limit: 100 }),
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
          "Zdalna brama MCP nie odpowiada. Workspace pozostaje dostępny lokalnie; spróbuj ponownie po przywróceniu Hubu.",
      };
    }
  }
  return {
    build,
    bootstrap,
    captures: captures.items,
    tasks: tasks.items,
    projects,
    cockpit,
    activity,
    access,
    agentAccess,
    assignmentCandidates,
    mentionCandidates,
    attention,
    documents,
    knowledge,
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
      return { kind: "error", message: "Nie udało się utworzyć dokumentu." };
    }
    if (response.outcome.outcome !== "success") {
      return {
        kind: response.outcome.outcome === "conflict" ? "conflict" : "error",
        message: "Dokument nie został utworzony. Spróbuj ponownie.",
      };
    }
    return { kind: "success", data: documentId };
  } catch {
    return { kind: "error", message: "Nie udało się utworzyć dokumentu." };
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
      return { kind: "error", message: "Źródło nie zostało zapisane." };
    return { kind: "success", data: sourceId };
  } catch {
    return { kind: "error", message: "Źródło nie zostało zapisane." };
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
    return { kind: "unavailable", message: "Dowody nie są już dostępne." };
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
      return { kind: "error", message: "Nie zapisano zestawu dowodów." };
    if (response.outcome.outcome === "conflict")
      return {
        kind: "conflict",
        message: "Dowody zmieniły się. Odśwież i wybierz ponownie.",
      };
    return response.outcome.outcome === "success"
      ? { kind: "success", data: undefined }
      : { kind: "error", message: "Nie zapisano zestawu dowodów." };
  } catch {
    return { kind: "error", message: "Nie zapisano zestawu dowodów." };
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
      return { kind: "error", message: "Nazwana wersja nie została zapisana." };
    if (response.outcome.outcome === "conflict")
      return {
        kind: "conflict",
        message: "Treść lub dowody zmieniły się. Utwórz świeżą wersję.",
      };
    return response.outcome.outcome === "success"
      ? { kind: "success", data: namedVersionId }
      : { kind: "error", message: "Nazwana wersja nie została zapisana." };
  } catch {
    return { kind: "error", message: "Nazwana wersja nie została zapisana." };
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

const AGENT_QUERY_CAPABILITIES: readonly Capability[] = [
  "workspace.bootstrapContext",
  "workspace.access",
  "agent.access",
  "capture.history",
  "project.list",
  "project.operationalOverview",
  "document.list",
  "knowledge.list",
  "knowledge.documentContext",
  "task.list",
  "task.assignmentCandidates",
  "comment.list",
  "comment.mentionCandidates",
  "attention.inbox",
  "search.global",
  "cockpit.week",
  "activity.meaningful",
  "audit.receipt",
  "recovery.preview",
  "agent.checkpoint.previewRevert",
];

const agentCapabilities = (
  preset: "observe" | "propose" | "operate" | "full_access",
): readonly Capability[] => {
  if (preset === "observe") return AGENT_QUERY_CAPABILITIES;
  if (preset === "propose")
    return [...AGENT_QUERY_CAPABILITIES, "comment.add", "comment.edit"];
  const operate: readonly Capability[] = [
    ...AGENT_QUERY_CAPABILITIES,
    "capture.submitText",
    "capture.routeAsTask",
    "project.create",
    "project.updateOutcome",
    "document.create",
    "knowledge.sourceCreate",
    "knowledge.sourceUpdate",
    "knowledge.documentSetEvidence",
    "knowledge.namedVersionCreate",
    "knowledge.namedVersionVoid",
    "task.setStatus",
    "task.complete",
    "task.reopen",
    "task.assign",
    "task.unassign",
    "comment.add",
    "comment.edit",
    "comment.resolve",
    "comment.reopen",
    "attention.markRead",
    "attention.dismiss",
    "record.relate",
    "record.unrelate",
    "command.previewUndo",
    "command.undo",
    "agent.checkpoint.create",
    "agent.checkpoint.revert",
    "agent.handoff.submit",
  ];
  return operate;
};

export const createAgentGrant = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  input: {
    readonly displayName: string;
    readonly preset: "observe" | "propose" | "operate" | "full_access";
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
    return { kind: "unavailable", message: "Dostęp agentów jest niedostępny." };
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
            access:
              input.preset === "observe"
                ? "view"
                : input.preset === "propose"
                  ? "comment"
                  : "edit",
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
    return { kind: "error", message: "Nie udało się utworzyć dostępu agenta." };
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
    return { kind: "error", message: "Nie udało się obrócić poświadczenia." };
  }
};

export const revokeAgentGrant = async (
  client: ConstellationRendererClient,
  snapshot: DesktopSnapshot,
  grant: AgentAccessProjection["grants"][number],
): Promise<MutationResult<undefined>> => {
  if (snapshot.agentAccess.kind !== "ready")
    return { kind: "unavailable", message: "Dostęp agentów jest niedostępny." };
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
    return { kind: "error", message: "Nie udało się cofnąć dostępu agenta." };
  }
};

export const createRemoteAgentGrant = async (
  client: ConstellationRendererClient,
  input: {
    readonly displayName: string;
    readonly preset: "observe" | "propose" | "operate" | "full_access";
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
          : "Nie udało się utworzyć zdalnego dostępu MCP.",
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
          : "Nie udało się obrócić zdalnego poświadczenia.",
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
          : "Nie udało się cofnąć zdalnego dostępu.",
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
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, {
        [target.kind === "task" ? target.taskId : target.projectId]:
          targetVersion,
        ...(parent === undefined ? {} : { [parent.id]: parent.version }),
      }),
      commandName: "comment.add",
      payload: {
        commentId: crypto.randomUUID(),
        target,
        ...(parent === undefined ? {} : { parentCommentId: parent.id }),
        body,
        mentionPrincipalIds,
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
) =>
  execute(
    client,
    {
      ...commandBase(snapshot.bootstrap.workspace.id, { [commentId]: version }),
      commandName: "comment.edit",
      payload: { commentId, body, mentionPrincipalIds },
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
