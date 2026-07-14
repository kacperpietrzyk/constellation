import {
  type CommandEnvelope,
  DataHomeStatusSchema,
  DeviceIdSchema,
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
  syncDataHome: async () => createScenarioClient(fixtures).getDataHomeStatus(),
});
