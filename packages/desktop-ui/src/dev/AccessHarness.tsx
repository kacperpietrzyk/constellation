import type {
  ConstellationRendererClient,
  RendererCommandResponse,
  RendererQueryResponse,
} from "@constellation/desktop-preload/client";
import {
  DataHomeStatusSchema,
  RemoteMcpGrantProjectionSchema,
} from "@constellation/contracts";

import { RealApp } from "../RealApp.js";
import { createScenarioClient } from "../client/scenario-client.js";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const spaceId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000101";
const result = (projection: Record<string, unknown>): RendererQueryResponse =>
  ({
    kind: "query_result",
    result: {
      contractVersion: 1,
      queryId: "00000000-0000-4000-8000-000000000201",
      kernelTime: "2026-07-14T12:00:00.000Z",
      outcome: "success",
      freshness: {
        mode: "local_authoritative",
        checkpoint: null,
        missingCapabilities: [],
      },
      projection,
    },
  }) as unknown as RendererQueryResponse;

const commandResult = (
  commandId: string,
  projection: Record<string, unknown>,
): RendererCommandResponse =>
  ({
    kind: "command_outcome",
    outcome: {
      contractVersion: 1,
      commandId,
      kernelTime: "2026-07-14T12:00:00.000Z",
      outcome: "success",
      replayed: false,
      recordVersions: {},
      changedFields: [],
      diagnosticCode: "workspace.access_preview_changed",
      projection,
    },
  }) as unknown as RendererCommandResponse;

const localClient = createScenarioClient({
  executeCommand: (command) => {
    if (command.commandName === "workspace.memberAdd")
      return commandResult(command.commandId, {
        kind: "workspace.member_added",
        membershipId: command.payload.membershipId,
        principalId: command.payload.principalId,
        role: command.payload.role,
        status: "active",
        membershipVersion: 1,
        policyVersion: 5,
        spaceGrantId: command.payload.spaceGrantId,
        spaceId: command.payload.spaceId,
        access: command.payload.access,
        spaceGrantVersion: 1,
      });
    if (command.commandName === "workspace.memberSetAccess")
      return commandResult(command.commandId, {
        kind: "workspace.member_access_changed",
        membershipId: command.payload.membershipId,
        principalId: "00000000-0000-4000-8000-000000000205",
        role: "member",
        status: "active",
        membershipVersion: 2,
        policyVersion: 5,
        spaceGrantId: command.payload.spaceGrantId,
        spaceId,
        access: command.payload.access,
        spaceGrantVersion: 3,
      });
    if (command.commandName === "workspace.memberRevoke")
      return commandResult(command.commandId, {
        kind: "workspace.member_revoked",
        membershipId: command.payload.membershipId,
        principalId: "00000000-0000-4000-8000-000000000205",
        role: "member",
        status: "revoked",
        membershipVersion: 3,
        policyVersion: 5,
        revokedSpaceGrantIds: ["00000000-0000-4000-8000-000000000206"],
      });
    if (command.commandName === "agent.grantCreate")
      return commandResult(command.commandId, {
        kind: "agent.grant_created",
        grantId: command.payload.grantId,
        agentPrincipalId: command.payload.agentPrincipalId,
        credentialId: command.payload.credentialId,
        version: 1,
        policyVersion: 5,
      });
    if (command.commandName === "agent.grantRotateCredential")
      return commandResult(command.commandId, {
        kind: "agent.credential_rotated",
        grantId: command.payload.grantId,
        credentialId: command.payload.credentialId,
        credentialVersion: 3,
        version: 3,
      });
    if (command.commandName === "agent.grantRevoke")
      return commandResult(command.commandId, {
        kind: "agent.grant_revoked",
        grantId: command.payload.grantId,
        version: 3,
        policyVersion: 5,
      });
    return {
      kind: "contract_rejected",
      diagnosticCode: "contract.invalid",
      issues: [{ path: "", code: "custom" }],
    };
  },
  queries: {
    "workspace.bootstrapContext": result({
      kind: "workspace.bootstrapContext",
      workspace: {
        id: workspaceId,
        name: "Praca",
        timezone: "Europe/Warsaw",
        defaultTaskStatusId: "00000000-0000-4000-8000-000000000202",
        version: 4,
      },
      spaces: [{ id: spaceId, name: "Praca", version: 1 }],
      taskStatuses: [
        {
          id: "00000000-0000-4000-8000-000000000202",
          label: "Otwarte",
          operationalSemantics: "actionable",
          position: 0,
          version: 1,
        },
      ],
    }),
    "task.list": result({ kind: "task.list", items: [], nextCursor: null }),
    "capture.history": result({
      kind: "capture.history",
      items: [],
      nextCursor: null,
    }),
    "workspace.access": result({
      kind: "workspace.access",
      policyVersion: 4,
      currentPrincipalId: ownerId,
      canManage: true,
      members: [
        {
          membershipId: "00000000-0000-4000-8000-000000000203",
          principalId: ownerId,
          displayName: "Kacper",
          role: "owner",
          status: "active",
          version: 1,
          spaces: [],
        },
        {
          membershipId: "00000000-0000-4000-8000-000000000204",
          principalId: "00000000-0000-4000-8000-000000000205",
          displayName: "Ada Nowak",
          role: "member",
          status: "active",
          version: 2,
          spaces: [
            {
              spaceGrantId: "00000000-0000-4000-8000-000000000206",
              spaceId,
              spaceName: "Praca",
              access: "edit",
              status: "active",
              version: 2,
            },
          ],
        },
        {
          membershipId: "00000000-0000-4000-8000-000000000207",
          principalId: "00000000-0000-4000-8000-000000000208",
          displayName: "Gość projektu",
          role: "guest",
          status: "revoked",
          version: 2,
          spaces: [
            {
              spaceGrantId: "00000000-0000-4000-8000-000000000209",
              spaceId,
              spaceName: "Praca",
              access: "view",
              status: "revoked",
              version: 2,
            },
          ],
        },
      ],
    }),
    "agent.access": result({
      kind: "agent.access",
      policyVersion: 4,
      workspaceVersion: 4,
      canManage: true,
      grants: [
        {
          grantId: "00000000-0000-4000-8000-000000000210",
          agentPrincipalId: "00000000-0000-4000-8000-000000000211",
          displayName: "Codex — praca projektowa",
          preset: "operate",
          capabilityScope: [
            "capture.submitText",
            "capture.history",
            "project.list",
            "project.updateOutcome",
            "task.list",
            "task.setStatus",
            "search.global",
            "activity.meaningful",
            "command.previewUndo",
            "command.undo",
            "agent.checkpoint.create",
            "agent.checkpoint.revert",
            "agent.handoff.submit",
          ],
          membershipId: "00000000-0000-4000-8000-000000000212",
          membershipVersion: 1,
          spaces: [
            {
              spaceId,
              spaceName: "Praca",
              spaceGrantId: "00000000-0000-4000-8000-000000000213",
              access: "edit",
              version: 1,
            },
          ],
          status: "active",
          expiresAt: "2026-08-13T12:00:00.000Z",
          credentialVersion: 2,
          version: 2,
          lastUsedAt: "2026-07-14T11:48:00.000Z",
        },
        {
          grantId: "00000000-0000-4000-8000-000000000214",
          agentPrincipalId: "00000000-0000-4000-8000-000000000215",
          displayName: "Claude — analiza dokumentów",
          preset: "observe",
          capabilityScope: ["document.list", "search.global"],
          membershipId: "00000000-0000-4000-8000-000000000216",
          membershipVersion: 2,
          spaces: [
            {
              spaceId,
              spaceName: "Praca",
              spaceGrantId: "00000000-0000-4000-8000-000000000217",
              access: "view",
              version: 2,
            },
          ],
          status: "revoked",
          credentialVersion: 1,
          version: 2,
        },
      ],
    }),
  },
});

const remoteGrant = RemoteMcpGrantProjectionSchema.parse({
  grantId: "00000000-0000-4000-8000-000000000210",
  agentPrincipalId: "00000000-0000-4000-8000-000000000211",
  displayName: "Codex — operator przez Hub",
  preset: "operate",
  capabilityScope: ["task.list", "capture.submitText", "audit.receipt"],
  spaceScope: [spaceId],
  federationScope: {
    crossWorkspaceRead: true,
    derivedResultWrite: false,
    sourceMaterialization: false,
  },
  credentialId: "00000000-0000-4000-8000-000000000218",
  credentialVersion: 2,
  status: "active",
  expiresAt: "2026-08-13T12:00:00.000Z",
  version: 2,
  membershipId: "00000000-0000-4000-8000-000000000212",
  membershipVersion: 1,
  spaces: [
    {
      spaceId,
      spaceName: "Praca",
      spaceGrantId: "00000000-0000-4000-8000-000000000213",
      access: "edit",
      version: 1,
    },
  ],
  lastUsedAt: "2026-07-14T11:48:00.000Z",
});

const remoteClient: ConstellationRendererClient = {
  ...localClient,
  getBuildInfo: async () => ({
    ...(await localClient.getBuildInfo()),
    channel: "local-alpha",
    persistence: "encrypted-local",
  }),
  getDataHomeStatus: async () => {
    const local = await localClient.getDataHomeStatus();
    const candidate = DataHomeStatusSchema.safeParse({
      ...local,
      descriptor: {
        ...local.descriptor,
        providerId: "constellation.self-hosted-hub/v1",
        providerInstanceId: "constellation.self-hosted-hub/v1:demo",
        providerKind: "coordinated",
        storageRole: "projection_with_outbox",
        displayName: "Własny Hub",
        location: "provider_managed",
        capabilities: Object.fromEntries(
          Object.keys(local.descriptor.capabilities).map((key) => [
            key,
            { support: "supported" },
          ]),
        ),
        encryption: {
          atRest: "provider_managed",
          keyCustody: "provider_managed",
          portableRecovery: "provider_managed",
        },
      },
      syncState: "current",
    });
    if (!candidate.success) throw candidate.error;
    return candidate.data;
  },
  listRemoteAgentGrants: async () => ({
    policyVersion: 4,
    workspaceVersion: 4,
    grants: [remoteGrant],
  }),
  createRemoteAgentGrant: async () => ({
    grant: remoteGrant,
    endpoint: `https://hub.example.test/v1/mcp/${workspaceId}`,
    descriptorPath:
      "/Users/demo/Library/Application Support/Constellation/remote-mcp.json",
  }),
  rotateRemoteAgentGrant: async () => ({
    grant: { ...remoteGrant, credentialVersion: 3, version: 3 },
    endpoint: `https://hub.example.test/v1/mcp/${workspaceId}`,
    descriptorPath:
      "/Users/demo/Library/Application Support/Constellation/remote-mcp.json",
  }),
  revokeRemoteAgentGrant: async () => ({
    grant: { ...remoteGrant, status: "revoked", version: 3 },
  }),
};

export const AccessHarness = () => (
  <RealApp
    client={
      new URLSearchParams(window.location.search).get("transport") === "remote"
        ? remoteClient
        : localClient
    }
  />
);
