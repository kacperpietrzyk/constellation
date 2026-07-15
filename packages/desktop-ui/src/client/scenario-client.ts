import {
  type CommandEnvelope,
  DataHomeStatusSchema,
  DeviceIdSchema,
  DocumentRevisionIdSchema,
  LOCAL_ONLY_PROVIDER_ID,
  WorkspaceIdSchema,
  type QueryEnvelope,
} from "@constellation/contracts";
import type {
  ConstellationRendererClient,
  RendererCommandResponse,
  RendererQueryResponse,
} from "@constellation/desktop-preload/client";

export interface ScenarioFixtures {
  readonly queries: Partial<
    Record<QueryEnvelope["queryName"], RendererQueryResponse>
  >;
  readonly executeCommand?: (
    command: CommandEnvelope,
  ) => RendererCommandResponse | Promise<RendererCommandResponse>;
}

/** Deterministic UI fixture adapter. It returns scripted contract outcomes only. */
export const createScenarioClient = (
  fixtures: ScenarioFixtures,
): ConstellationRendererClient => ({
  getJamieStatus: async () => ({ configured: false }),
  configureJamie: async () => undefined,
  syncJamie: async () => ({
    applied: 0,
    corrected: 0,
    noChange: 0,
    partial: 0,
    conflicted: 0,
    failed: 0,
  }),
  disconnectJamie: async () => undefined,
  requestCalendarAccess: async () => ({
    platform: "other",
    provider: "unconfigured",
    availability: "provider_unavailable",
    canRead: false,
    canWriteOwnedBlocks: false,
    detailCode: "scenario_unconfigured",
  }),
  editMeetingWorkItem: async () => false,
  addMeetingWorkItem: async () => false,
  getMeetingLoop: async () => ({
    capability: {
      platform: "other",
      provider: "unconfigured",
      availability: "provider_unavailable",
      canRead: false,
      canWriteOwnedBlocks: false,
      detailCode: "scenario_unconfigured",
    },
    upcoming: [],
    completed: [],
    freshness: "partial",
    generatedAt: "2026-07-15T10:00:00.000Z",
  }),
  previewCalendarBlocks: async () => undefined,
  confirmCalendarBlocks: async () => ({
    outcome: "rejected",
    code: "provider_unavailable",
  }),
  listRemoteAgentGrants: async () => {
    throw new Error("Remote MCP is unavailable in scenario fixtures.");
  },
  createRemoteAgentGrant: async () => {
    throw new Error("Remote MCP is unavailable in scenario fixtures.");
  },
  rotateRemoteAgentGrant: async () => {
    throw new Error("Remote MCP is unavailable in scenario fixtures.");
  },
  revokeRemoteAgentGrant: async () => {
    throw new Error("Remote MCP is unavailable in scenario fixtures.");
  },
  acknowledgeDocumentUpdates: async () => undefined,
  prepareAgentCredential: async () => ({
    credentialId: "00000000-0000-4000-8000-000000000093" as never,
    credentialDigest: "0".repeat(64),
    descriptorPath: "/tmp/constellation-agent.json",
    launchCommand:
      "/Applications/Constellation Local Alpha.app/Contents/MacOS/Constellation Local Alpha",
    launchArgs: [
      "/Applications/Constellation Local Alpha.app/Contents/Resources/constellation-mcp.mjs",
    ],
    launchEnvironment: {
      ELECTRON_RUN_AS_NODE: "1",
      CONSTELLATION_MCP_CREDENTIAL_FILE: "/tmp/constellation-agent.json",
    },
  }),
  onAttentionActivated: () => () => undefined,
  cancelWorkspaceRestore: async () => undefined,
  confirmWorkspaceRestore: async () => ({
    outcome: "failure",
    code: "io_failed",
  }),
  executeCommand: async (command) =>
    fixtures.executeCommand?.(command) ?? {
      kind: "contract_rejected",
      diagnosticCode: "contract.invalid",
      issues: [
        {
          path: "",
          code: "custom",
        },
      ],
    },
  createDocumentRevision: async () =>
    DocumentRevisionIdSchema.parse("00000000-0000-4000-8000-000000000091"),
  enrollHub: async () => ({ outcome: "rejected", code: "hub_unreachable" }),
  exportHubAuthorization: async () => ({ outcome: "cancelled" }),
  exportWorkspaceBackup: async () => ({ outcome: "cancelled" }),
  getBuildInfo: async () => ({
    channel: "developer-preview",
    startupRecovery: "none",
    workspaceAvailability: "ready",
    initialWorkspaceId: WorkspaceIdSchema.parse(
      "00000000-0000-4000-8000-000000000001",
    ),
    persistence: "in-memory",
    version: "scenario",
  }),
  getDataHomeStatus: async () =>
    DataHomeStatusSchema.parse({
      descriptor: {
        contractVersion: 1,
        providerId: LOCAL_ONLY_PROVIDER_ID,
        providerInstanceId: `${LOCAL_ONLY_PROVIDER_ID}:00000000-0000-4000-8000-000000000001`,
        workspaceId: WorkspaceIdSchema.parse(
          "00000000-0000-4000-8000-000000000001",
        ),
        deviceId: DeviceIdSchema.parse("00000000-0000-4000-8000-000000000099"),
        providerKind: "local_only",
        storageRole: "canonical",
        displayName: "Local only",
        location: "this_device",
        capabilities: {
          ordered_changes: {
            support: "unsupported",
            reason: "No remote provider is configured.",
          },
          checkpoints: { support: "supported" },
          tombstones: {
            support: "unsupported",
            reason: "No remote provider is configured.",
          },
          attachments: {
            support: "unsupported",
            reason: "Attachments are not implemented.",
          },
          quota: {
            support: "unsupported",
            reason: "Local filesystem quota is unknown.",
          },
          portable_export: { support: "supported" },
          portable_import: { support: "supported" },
          provider_migration: { support: "supported" },
          device_revocation: {
            support: "unsupported",
            reason: "No remote authority exists.",
          },
        },
        encryption: {
          atRest: "sqlcipher",
          keyCustody: "operating_system",
          portableRecovery: "separate_recovery_code",
        },
      },
      availability: "available",
      syncState: "not_configured",
      checkpointState: "none_recorded",
      quota: { state: "unknown" },
      lastVerifiedAt: "2026-07-14T10:00:00.000Z",
      recoveryActions: ["export_checkpoint", "restore_checkpoint"],
      detailCode: "ready",
    }),
  listDocumentRevisions: async () => [],
  openDocument: async () => ({ mode: "local", pendingUpdateCount: 0 }),
  persistDocumentUpdate: async () => undefined,
  prepareWorkspaceRestore: async () => ({ outcome: "cancelled" }),
  runQuery: async (query) => {
    const response = fixtures.queries[query.queryName];
    if (response !== undefined) return response;
    return {
      kind: "query_result",
      result: {
        contractVersion: 1,
        queryId: query.queryId,
        kernelTime: "2026-07-13T12:00:00.000Z",
        outcome: "rejected",
        diagnosticCode: "query.not_available",
      },
    };
  },
  restoreDocumentRevision: async () => undefined,
  syncDataHome: async () => createScenarioClient(fixtures).getDataHomeStatus(),
});
