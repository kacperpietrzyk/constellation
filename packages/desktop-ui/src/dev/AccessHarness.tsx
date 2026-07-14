import type {
  RendererCommandResponse,
  RendererQueryResponse,
} from "@constellation/desktop-preload/client";

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

const client = createScenarioClient({
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
  },
});

export const AccessHarness = () => <RealApp client={client} />;
