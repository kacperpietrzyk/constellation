import type {
  RendererCommandResponse,
  RendererQueryResponse,
} from "@constellation/desktop-preload/client";

import { RealApp } from "../RealApp.js";
import { createScenarioClient } from "../client/scenario-client.js";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const spaceId = "00000000-0000-4000-8000-000000000002";
const statusId = "00000000-0000-4000-8000-000000000003";
const ownerId = "00000000-0000-4000-8000-000000000004";
const memberId = "00000000-0000-4000-8000-000000000005";
const taskId = "00000000-0000-4000-8000-000000000006";
const rootCommentId = "00000000-0000-4000-8000-000000000007";

const result = (projection: Record<string, unknown>): RendererQueryResponse =>
  ({
    kind: "query_result",
    result: {
      contractVersion: 1,
      queryId: "00000000-0000-4000-8000-000000000099",
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

const client = createScenarioClient({
  executeCommand: (command): RendererCommandResponse => {
    if (
      command.commandName !== "attention.markRead" &&
      command.commandName !== "attention.dismiss"
    ) {
      return {
        kind: "contract_rejected",
        diagnosticCode: "contract.invalid",
        issues: [{ path: "", code: "custom" }],
      };
    }
    const diagnosticCode =
      command.commandName === "attention.markRead"
        ? "attention.read"
        : "attention.dismissed";
    return {
      kind: "command_outcome",
      outcome: {
        contractVersion: 1,
        commandId: command.commandId,
        correlationId: command.correlationId,
        kernelTime: "2026-07-14T12:00:00.000Z",
        outcome: "success",
        diagnosticCode,
        affected: [],
        auditReceiptId: "00000000-0000-4000-8000-000000000015",
        projection: {
          kind: diagnosticCode,
          attentionSignalId: command.payload.attentionSignalId,
          version: 2,
        },
      },
    } as unknown as RendererCommandResponse;
  },
  queries: {
    "workspace.bootstrapContext": result({
      kind: "workspace.bootstrapContext",
      workspace: {
        id: workspaceId,
        name: "Praca",
        timezone: "Europe/Warsaw",
        defaultTaskStatusId: statusId,
        version: 4,
      },
      spaces: [{ id: spaceId, name: "Praca", version: 1 }],
      taskStatuses: [
        {
          id: statusId,
          label: "W toku",
          operationalSemantics: "actionable",
          position: 0,
          version: 1,
        },
      ],
    }),
    "task.list": result({
      kind: "task.list",
      items: [
        {
          id: taskId,
          spaceId,
          title: "Potwierdź wariant recovery",
          status: {
            id: statusId,
            label: "W toku",
            operationalSemantics: "actionable",
          },
          completionState: "open",
          assignment: {
            id: "00000000-0000-4000-8000-000000000008",
            assignee: {
              principalId: memberId,
              displayName: "Ada Nowak",
              participantKind: "member",
            },
            availability: "active",
            version: 1,
          },
          createdAt: "2026-07-14T09:30:00.000Z",
          updatedAt: "2026-07-14T10:51:00.000Z",
          version: 2,
        },
      ],
      nextCursor: null,
    }),
    "capture.history": result({
      kind: "capture.history",
      items: [],
      nextCursor: null,
    }),
    "task.assignmentCandidates": result({
      kind: "task.assignmentCandidates",
      spaceId,
      candidates: [
        {
          principalId: memberId,
          displayName: "Ada Nowak",
          participantKind: "member",
        },
      ],
    }),
    "workspace.access": result({
      kind: "workspace.access",
      policyVersion: 4,
      currentPrincipalId: ownerId,
      canManage: true,
      members: [
        {
          membershipId: "00000000-0000-4000-8000-000000000010",
          principalId: ownerId,
          displayName: "Kacper",
          role: "owner",
          status: "active",
          version: 1,
          spaces: [],
        },
        {
          membershipId: "00000000-0000-4000-8000-000000000011",
          principalId: memberId,
          displayName: "Ada Nowak",
          role: "member",
          status: "active",
          version: 1,
          spaces: [
            {
              spaceGrantId: "00000000-0000-4000-8000-000000000012",
              spaceId,
              spaceName: "Praca",
              access: "comment",
              status: "active",
              version: 1,
            },
          ],
        },
      ],
    }),
    "comment.mentionCandidates": result({
      kind: "comment.mentionCandidates",
      spaceId,
      candidates: [
        { principalId: ownerId, displayName: "Kacper" },
        { principalId: memberId, displayName: "Ada Nowak" },
      ],
    }),
    "comment.list": result({
      kind: "comment.list",
      target: { kind: "task", taskId },
      threads: [
        {
          id: rootCommentId,
          rootCommentId,
          body: "@Kacper potwierdź wariant recovery przed zamknięciem zadania.",
          author: { principalId: memberId, displayName: "Ada Nowak" },
          mentionPrincipalIds: [ownerId],
          threadState: "open",
          version: 2,
          createdAt: "2026-07-14T10:42:00.000Z",
          updatedAt: "2026-07-14T10:45:00.000Z",
          edited: true,
        },
        {
          id: "00000000-0000-4000-8000-000000000013",
          parentCommentId: rootCommentId,
          rootCommentId,
          body: "Pakietowy dowód macOS i Windows jest dołączony.",
          author: { principalId: ownerId, displayName: "Kacper" },
          mentionPrincipalIds: [],
          threadState: "open",
          version: 1,
          createdAt: "2026-07-14T10:51:00.000Z",
          updatedAt: "2026-07-14T10:51:00.000Z",
          edited: false,
        },
      ],
    }),
    "attention.inbox": result({
      kind: "attention.inbox",
      unreadCount: 1,
      items: [
        {
          id: "00000000-0000-4000-8000-000000000014",
          reason: "comment_mention",
          destination: { kind: "task", taskId },
          title: "Potwierdź wariant recovery",
          detail: "You were mentioned in a comment.",
          urgency: "in_app",
          state: "unread",
          version: 1,
          occurredAt: "2026-07-14T10:42:00.000Z",
        },
      ],
    }),
  },
});

export const CollaborationHarness = () => <RealApp client={client} />;
