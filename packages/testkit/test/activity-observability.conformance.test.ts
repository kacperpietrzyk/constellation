import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ExecutionContextSchema,
  SpaceGrantIdSchema,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";
import {
  isApplicationWave2Transaction,
  type ApplicationCommandResponse,
} from "@constellation/application";

import { createReferenceHarness } from "../src/index.js";

const ids = {
  workspace: "a2000000-0000-4000-8000-000000000001",
  space: "a2000000-0000-4000-8000-000000000002",
  owner: "a2000000-0000-4000-8000-000000000003",
  ownerCredential: "a2000000-0000-4000-8000-000000000004",
  ownerGrant: "a2000000-0000-4000-8000-000000000005",
  hermes: "a2000000-0000-4000-8000-000000000006",
  hermesCredential: "a2000000-0000-4000-8000-000000000007",
  hermesGrant: "a2000000-0000-4000-8000-000000000008",
  hermesSpaceGrant: "a2000000-0000-4000-8000-000000000009",
  hermesRun: "a2000000-0000-4000-8000-000000000010",
  claude: "a2000000-0000-4000-8000-000000000011",
  claudeCredential: "a2000000-0000-4000-8000-000000000012",
  claudeGrant: "a2000000-0000-4000-8000-000000000013",
  claudeSpaceGrant: "a2000000-0000-4000-8000-000000000014",
  claudeRun: "a2000000-0000-4000-8000-000000000015",
  project: "a2000000-0000-4000-8000-000000000016",
  task: "a2000000-0000-4000-8000-000000000017",
} as const;

let sequence = 100;
const uuid = (): string =>
  `a2000000-0000-4000-8000-${(sequence++).toString().padStart(12, "0")}`;

const owner = (): ExecutionContext =>
  ExecutionContextSchema.parse({
    principalId: ids.owner,
    principalKind: "human",
    credentialId: ids.ownerCredential,
    grantId: ids.ownerGrant,
    policyVersion: 1,
    workspaceId: ids.workspace,
    spaceScope: [ids.space],
    capabilityScope: [
      "workspace.createLocal",
      "project.updateDetails",
      "task.assign",
      "comment.add",
      "comment.edit",
      "activity.meaningful",
    ],
    origin: "desktop",
  });

const agent = (
  principalId: string,
  credentialId: string,
  grantId: string,
  agentRunId: string,
  hostRunId: string,
): ExecutionContext =>
  ExecutionContextSchema.parse({
    principalId,
    principalKind: "agent",
    credentialId,
    grantId,
    policyVersion: 1,
    workspaceId: ids.workspace,
    spaceScope: [ids.space],
    capabilityScope: ["project.create", "task.create"],
    origin: "mcp",
    hostRun: { runId: hostRunId, agentRunId, hostName: "Hermes Agent" },
  });

const unwrap = (response: ApplicationCommandResponse): CommandOutcome => {
  assert.equal(response.kind, "command_outcome");
  if (response.kind !== "command_outcome")
    throw new Error("Expected command outcome.");
  return response.outcome;
};

const metadata = (
  key: string,
  correlationId: string,
  expectedVersions: Readonly<Record<string, number>> = {},
) => ({
  contractVersion: 1 as const,
  commandId: uuid(),
  workspaceId: ids.workspace,
  idempotencyKey: key,
  expectedVersions,
  correlationId,
});

type EnrichedActivityItem = {
  readonly eventId: string;
  readonly targetCommandId: string;
  readonly activityType: string;
  readonly recordId: string;
  readonly recordKind?: string;
  readonly recordTitle?: string;
  readonly actor?: {
    readonly principalId: string;
    readonly displayName: string;
    readonly kind: "human" | "agent" | "system";
  };
  readonly commandName?: string;
  readonly changedFields?: readonly string[];
  readonly correlationId?: string;
  readonly agentRunId?: string;
  readonly hostRunId?: string;
  readonly occurredAt: string;
};

const meaningful = (
  harness: ReturnType<typeof createReferenceHarness>,
  context: ExecutionContext,
): readonly EnrichedActivityItem[] => {
  const response = harness.kernel.query(context, {
    contractVersion: 1,
    queryName: "activity.meaningful",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space, limit: 200 },
  });
  if (
    response.kind !== "query_result" ||
    response.result.outcome !== "success" ||
    response.result.projection.kind !== "activity.meaningful"
  ) {
    assert.fail("Expected meaningful activity.");
  }
  return response.result.projection.items as readonly EnrichedActivityItem[];
};

describe("agent activity observability", () => {
  it("projects authorized current record labels and distinct agent audit metadata without payload diffs", () => {
    const harness = createReferenceHarness();
    const ownerContext = owner();
    const hermesContext = agent(
      ids.hermes,
      ids.hermesCredential,
      ids.hermesGrant,
      ids.hermesRun,
      "hermes-host-run",
    );
    const claudeContext = agent(
      ids.claude,
      ids.claudeCredential,
      ids.claudeGrant,
      ids.claudeRun,
      "claude-host-run",
    );
    for (const context of [ownerContext, hermesContext, claudeContext]) {
      harness.authorization.register(context);
    }
    assert.equal(
      unwrap(
        harness.kernel.execute(ownerContext, {
          ...metadata("bootstrap", uuid()),
          commandName: "workspace.createLocal",
          payload: {
            workspaceId: ids.workspace,
            rootSpaceId: ids.space,
            ownerPrincipalId: ids.owner,
            name: "Activity observability",
            timezone: "Europe/Warsaw",
          },
        }),
      ).outcome,
      "success",
    );

    const now = "2026-08-20T10:00:00.000Z";
    harness.store.transact((transaction) => {
      const ownerMembership = transaction.getMembership(
        ids.workspace as never,
        ids.owner as never,
      );
      assert.ok(ownerMembership);
      assert.equal(
        transaction.updateMembership(
          {
            ...ownerMembership,
            displayName: "Kacper",
            version: ownerMembership.version + 1,
            updatedAt: now,
          },
          ownerMembership.version,
        ),
        true,
      );
      for (const [
        principalId,
        displayName,
        grantId,
        credentialId,
        spaceGrantId,
      ] of [
        [
          ids.hermes,
          "Hermes",
          ids.hermesGrant,
          ids.hermesCredential,
          ids.hermesSpaceGrant,
        ],
        [
          ids.claude,
          "Claude",
          ids.claudeGrant,
          ids.claudeCredential,
          ids.claudeSpaceGrant,
        ],
      ] as const) {
        transaction.insertMembership({
          id: uuid(),
          workspaceId: ids.workspace,
          principalId,
          role: "guest",
          displayName,
          status: "active",
          version: 1,
          createdAt: now,
          updatedAt: now,
        } as never);
        transaction.insertSpaceGrant({
          id: SpaceGrantIdSchema.parse(spaceGrantId),
          workspaceId: ids.workspace,
          spaceId: ids.space,
          principalId,
          access: "edit",
          status: "active",
          version: 1,
          createdAt: now,
          updatedAt: now,
        } as never);
        transaction.insertAgentGrant({
          id: grantId,
          workspaceId: ids.workspace,
          agentPrincipalId: principalId,
          delegatingUserId: ids.owner,
          displayName,
          preset: "custom",
          capabilityScope: ["project.create", "task.create"],
          spaceScope: [ids.space],
          credentialId,
          credentialDigest: `digest-${displayName}`,
          credentialVersion: 1,
          status: "active",
          version: 1,
          createdAt: now,
          updatedAt: now,
        } as never);
      }
    });

    const correlationId = uuid();
    assert.equal(
      unwrap(
        harness.kernel.execute(hermesContext, {
          ...metadata("hermes-project", correlationId),
          commandName: "project.create",
          payload: {
            projectId: ids.project,
            spaceId: ids.space,
            title: "Old project title",
            intendedOutcome: "Show attributable activity",
          },
        }),
      ).outcome,
      "success",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(claudeContext, {
          ...metadata("claude-task", correlationId),
          commandName: "task.create",
          payload: {
            taskId: ids.task,
            spaceId: ids.space,
            title: "Review actor boundary",
          },
        }),
      ).outcome,
      "success",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(ownerContext, {
          ...metadata("rename-project", uuid(), { [ids.project]: 1 }),
          commandName: "project.updateDetails",
          payload: { projectId: ids.project, title: "Current project title" },
        }),
      ).outcome,
      "success",
    );

    assert.equal(
      unwrap(
        harness.kernel.execute(ownerContext, {
          ...metadata("assign-task", uuid(), { [ids.task]: 1 }),
          commandName: "task.assign",
          payload: {
            assignmentId: uuid(),
            taskId: ids.task,
            assigneePrincipalId: ids.claude,
          },
        }),
      ).outcome,
      "success",
    );
    const commentId = uuid();
    assert.equal(
      unwrap(
        harness.kernel.execute(ownerContext, {
          ...metadata("comment-task", uuid(), { [ids.task]: 1 }),
          commandName: "comment.add",
          payload: {
            commentId,
            target: { kind: "task", taskId: ids.task },
            body: "Review the activity boundary.",
            mentionPrincipalIds: [],
          },
        }),
      ).outcome,
      "success",
    );

    assert.equal(
      unwrap(
        harness.kernel.execute(ownerContext, {
          ...metadata("edit-comment-task", uuid(), { [commentId]: 1 }),
          commandName: "comment.edit",
          payload: {
            commentId,
            body: "Review the complete activity boundary.",
            mentionPrincipalIds: [],
          },
        }),
      ).outcome,
      "success",
    );

    const items = meaningful(harness, ownerContext);
    const hermesProject = items.find(
      (item) =>
        item.commandName === "project.create" && item.recordId === ids.project,
    );
    const claudeTask = items.find(
      (item) =>
        item.commandName === "task.create" && item.recordId === ids.task,
    );
    assert.deepEqual(hermesProject, {
      eventId: hermesProject?.eventId,
      targetCommandId: hermesProject?.targetCommandId,
      activityType: "project_created",
      recordId: ids.project,
      recordKind: "project",
      recordTitle: "Current project title",
      actor: { principalId: ids.hermes, displayName: "Hermes", kind: "agent" },
      commandName: "project.create",
      changedFields: [
        "title",
        "intendedOutcome",
        "lifecycle",
        "evidenceSourceIds",
      ],
      correlationId,
      agentRunId: ids.hermesRun,
      hostRunId: "hermes-host-run",
      occurredAt: hermesProject?.occurredAt,
    });
    const ownerRename = items.find(
      (item) => item.commandName === "project.updateDetails",
    );
    assert.deepEqual(ownerRename?.actor, {
      principalId: ids.owner,
      displayName: "Kacper",
      kind: "human",
    });
    const assigned = items.find(
      (item) => item.activityType === "task_assigned",
    );
    assert.equal(assigned?.recordId, ids.task);
    assert.equal(assigned?.commandName, "task.assign");
    const commented = items.find(
      (item) => item.activityType === "comment_added",
    );
    assert.equal(commented?.recordId, ids.task);
    assert.equal(commented?.commandName, "comment.add");
    const editedComment = items.find(
      (item) => (item.activityType as string) === "comment_edited",
    );
    assert.equal(editedComment?.recordId, ids.task);
    assert.equal(editedComment?.commandName, "comment.edit");
    assert.equal(claudeTask?.actor?.displayName, "Claude");
    assert.equal(claudeTask?.actor?.kind, "agent");
    assert.equal(claudeTask?.recordTitle, "Review actor boundary");
    assert.equal(claudeTask?.correlationId, correlationId);
    assert.equal(claudeTask?.hostRunId, "claude-host-run");
    assert.equal("before" in (hermesProject ?? {}), false);
    assert.equal("after" in (hermesProject ?? {}), false);

    const { mismatchedEventId, boundedEventId } = harness.store.transact(
      (transaction) => {
        assert.equal(isApplicationWave2Transaction(transaction), true);
        if (!isApplicationWave2Transaction(transaction))
          throw new Error("Expected Wave 2 transaction.");
        const project = transaction.getProject(ids.project as never);
        const grant = transaction.getAgentGrant(ids.hermesGrant as never);
        const claudeGrant = transaction.getAgentGrant(ids.claudeGrant as never);
        assert.ok(project);
        assert.ok(grant);
        assert.ok(claudeGrant);
        assert.equal(
          transaction.updateProject(
            {
              ...project,
              recordState: "removed",
              version: project.version + 1,
            },
            project.version,
          ),
          true,
        );
        assert.equal(
          transaction.updateAgentGrant(
            {
              ...grant,
              status: "revoked",
              revokedAt: "2026-08-20T11:00:00.000Z",
              updatedAt: "2026-08-20T11:00:00.000Z",
              version: grant.version + 1,
            },
            grant.version,
          ),
          true,
        );
        assert.equal(
          transaction.updateAgentGrant(
            {
              ...claudeGrant,
              status: "revoked",
              revokedAt: "2026-08-20T11:00:00.000Z",
              updatedAt: "2026-08-20T11:00:00.000Z",
              version: claudeGrant.version + 1,
            },
            claudeGrant.version,
          ),
          true,
        );
        transaction.insertEvent({
          id: uuid(),
          type: "task.details_updated",
          workspaceId: ids.workspace,
          spaceId: ids.space,
          commandId: uuid(),
          aggregateId: ids.task,
          aggregateVersion: 2,
          occurredAt: "2026-08-20T11:01:00.000Z",
        } as never);
        const mismatchedEventId = uuid();
        transaction.insertEvent({
          id: mismatchedEventId,
          type: "task.details_updated",
          workspaceId: ids.workspace,
          spaceId: ids.space,
          commandId: claudeTask?.targetCommandId,
          aggregateId: uuid(),
          aggregateVersion: 1,
          occurredAt: "2026-08-20T11:02:00.000Z",
        } as never);
        const boundedEventId = uuid();
        const boundedCommandId = uuid();
        transaction.insertEvent({
          id: boundedEventId,
          type: "task.details_updated",
          workspaceId: ids.workspace,
          spaceId: ids.space,
          commandId: boundedCommandId,
          aggregateId: ids.task,
          aggregateVersion: 2,
          occurredAt: "2026-08-20T11:03:00.000Z",
        } as never);
        transaction.insertAuditReceipt({
          id: uuid(),
          workspaceId: ids.workspace,
          spaceId: ids.space,
          principalId: ids.owner,
          grantId: ids.ownerGrant,
          origin: "desktop",
          commandId: boundedCommandId,
          commandName: "task.updateDetails",
          correlationId: uuid(),
          affectedRecordIds: [ids.task],
          recordVersions: { [ids.task]: 2 },
          changedFields: ["title", "credentialDigest", "unknownField"],
          occurredAt: "2026-08-20T11:03:00.000Z",
          outcome: "success",
        } as never);
        return { mismatchedEventId, boundedEventId };
      },
    );

    const redacted = meaningful(harness, ownerContext);
    const removedProject = redacted.find(
      (item) =>
        item.activityType === "project_created" &&
        item.recordId === ids.project,
    );
    assert.equal(removedProject, undefined);
    assert.equal(JSON.stringify(redacted).includes(ids.project), false);
    const receiptless = redacted.find(
      (item) =>
        item.activityType === "task_details_updated" &&
        item.recordId === ids.task &&
        item.commandName === undefined,
    );
    assert.ok(receiptless);
    assert.equal(receiptless.actor, undefined);
    assert.equal(receiptless.correlationId, undefined);
    const mismatched = redacted.find(
      (item) => item.eventId === mismatchedEventId,
    );
    assert.equal(mismatched, undefined);
    const revokedActorTask = redacted.find(
      (item) =>
        item.activityType === "task_created" && item.recordId === ids.task,
    );
    assert.ok(revokedActorTask);
    assert.equal(revokedActorTask.actor, undefined);
    assert.equal(revokedActorTask.commandName, undefined);
    assert.equal(revokedActorTask.changedFields, undefined);
    assert.equal(revokedActorTask.correlationId, undefined);
    assert.equal(revokedActorTask.agentRunId, undefined);
    assert.equal(revokedActorTask.hostRunId, undefined);
    const bounded = redacted.find((item) => item.eventId === boundedEventId);
    assert.ok(bounded);
    assert.deepEqual(bounded.changedFields, ["title"]);
    assert.equal(JSON.stringify(bounded).includes("credentialDigest"), false);
    assert.equal(JSON.stringify(bounded).includes("unknownField"), false);
  });
});
