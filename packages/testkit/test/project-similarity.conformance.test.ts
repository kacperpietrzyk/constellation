import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ApplicationCommandResponse } from "@constellation/application";
import {
  ExecutionContextSchema,
  PrincipalIdSchema,
  ProjectIdSchema,
  SpaceIdSchema,
  StrategicRecordIdSchema,
  WorkspaceIdSchema,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";
import {
  createOrganization,
  createProject as projectRecord,
} from "@constellation/domain";

import { createReferenceHarness } from "../src/index.js";

const ids = {
  workspace: "91000000-0000-4000-8000-000000000001",
  space: "91000000-0000-4000-8000-000000000002",
  principal: "91000000-0000-4000-8000-000000000003",
  credential: "91000000-0000-4000-8000-000000000004",
  grant: "91000000-0000-4000-8000-000000000005",
  exact: "91000000-0000-4000-8000-000000000101",
  outcomeOnly: "91000000-0000-4000-8000-000000000102",
  direct: "91000000-0000-4000-8000-000000000103",
  opportunityProject: "91000000-0000-4000-8000-000000000104",
  organization: "91000000-0000-4000-8000-000000000201",
  opportunity: "91000000-0000-4000-8000-000000000202",
  areaProject: "91000000-0000-4000-8000-000000000105",
  initiativeProject: "91000000-0000-4000-8000-000000000106",
  area: "91000000-0000-4000-8000-000000000203",
  initiative: "91000000-0000-4000-8000-000000000204",
  privateSpace: "91000000-0000-4000-8000-000000000301",
  hiddenProject: "91000000-0000-4000-8000-000000000302",
  hiddenOrganization: "91000000-0000-4000-8000-000000000303",
  activeLifecycle: "91000000-0000-4000-8000-000000000401",
  closedLifecycle: "91000000-0000-4000-8000-000000000402",
  removedLifecycle: "91000000-0000-4000-8000-000000000403",
} as const;

let sequence = 1_000;
const uuid = (): string =>
  `91000000-0000-4000-8000-${(sequence++).toString().padStart(12, "0")}`;

const context: ExecutionContext = ExecutionContextSchema.parse({
  principalId: ids.principal,
  principalKind: "human",
  credentialId: ids.credential,
  grantId: ids.grant,
  policyVersion: 1,
  workspaceId: ids.workspace,
  spaceScope: [ids.space],
  capabilityScope: [
    "workspace.createLocal",
    "project.create",
    "project.list",
    "project.close",
    "project.remove",
    "relationship.organizationCreate",
    "opportunity.create",
    "opportunity.linkOutcomes",
    "work.linkCreate",
    "area.create",
    "initiative.create",
  ],
  origin: "desktop",
});

const metadata = (
  key: string,
  expectedVersions: Readonly<Record<string, number>> = {},
) => ({
  contractVersion: 1 as const,
  commandId: uuid(),
  workspaceId: ids.workspace,
  idempotencyKey: key,
  expectedVersions,
  correlationId: uuid(),
});

const unwrap = (response: ApplicationCommandResponse): CommandOutcome => {
  assert.equal(response.kind, "command_outcome");
  if (response.kind !== "command_outcome") throw new Error("Expected outcome.");
  return response.outcome;
};

const setup = () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context);
  assert.equal(
    unwrap(
      harness.kernel.execute(context, {
        ...metadata("bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Similarity",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  return harness;
};

const createProject = (
  harness: ReturnType<typeof setup>,
  projectId: string,
  title: string,
  intendedOutcome?: string,
): void => {
  assert.equal(
    unwrap(
      harness.kernel.execute(context, {
        ...metadata(`project-${projectId}`),
        commandName: "project.create",
        payload: {
          projectId,
          spaceId: ids.space,
          title,
          ...(intendedOutcome === undefined ? {} : { intendedOutcome }),
        },
      }),
    ).outcome,
    "success",
  );
};

const similar = (
  harness: ReturnType<typeof setup>,
  title: string,
  extra: Record<string, unknown> = {},
) => {
  const response = harness.kernel.query(context, {
    contractVersion: 1,
    queryName: "project.similarCandidates",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space, title, ...extra },
  } as never);
  assert.equal(response.kind, "query_result");
  if (response.kind !== "query_result")
    throw new Error("Expected query result.");
  assert.equal(response.result.outcome, "success");
  if (response.result.outcome !== "success")
    throw new Error("Expected successful query.");
  const projection = response.result.projection as unknown as {
    readonly kind: string;
    readonly items: readonly {
      readonly projectId: string;
      readonly lifecycle?: string;
      readonly matchedOn: readonly string[];
    }[];
  };
  assert.equal(projection.kind, "project.similarCandidates");
  return projection.items;
};

describe("Project similar-candidate privacy semantics", () => {
  it("matches Project titles without searching outcomes", () => {
    const harness = setup();
    createProject(harness, ids.exact, "Zakłady — migration readiness");
    createProject(
      harness,
      ids.outcomeOnly,
      "Unrelated delivery",
      "Zaklady migration readiness is a forbidden outcome-only sentinel",
    );

    assert.deepEqual(
      similar(harness, "Zaklady migration readiness").map((item) => ({
        projectId: item.projectId,
        matchedOn: item.matchedOn,
      })),
      [{ projectId: ids.exact, matchedOn: ["title"] }],
    );
  });

  it("uses both explicit client graph reaches to rescue one strong title token", () => {
    const harness = setup();
    createProject(harness, ids.direct, "Migration delivery");
    createProject(harness, ids.opportunityProject, "Migration rollout");
    assert.equal(
      unwrap(
        harness.kernel.execute(context, {
          ...metadata("organization"),
          commandName: "relationship.organizationCreate",
          payload: {
            organizationId: ids.organization,
            spaceId: ids.space,
            name: "Northstar Client",
            relationshipState: "active",
          },
        }),
      ).outcome,
      "success",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context, {
          ...metadata("direct-client"),
          commandName: "work.linkCreate",
          payload: {
            linkId: uuid(),
            spaceId: ids.space,
            linkType: "project_serves_organization",
            sourceRecordId: ids.direct,
            targetRecordId: ids.organization,
          },
        }),
      ).outcome,
      "success",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context, {
          ...metadata("opportunity"),
          commandName: "opportunity.create",
          payload: {
            opportunityId: ids.opportunity,
            spaceId: ids.space,
            title: "Client migration",
            organizationId: ids.organization,
            personIds: [],
            need: "Migration",
            qualification: "Qualified",
            stage: "won",
            nextAction: "Deliver",
            evidenceSourceIds: [],
          },
        }),
      ).outcome,
      "success",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context, {
          ...metadata("opportunity-project", {
            [ids.opportunity]: 1,
            [ids.opportunityProject]: 1,
          }),
          commandName: "opportunity.linkOutcomes",
          payload: {
            opportunityId: ids.opportunity,
            offerIds: [],
            projectIds: [ids.opportunityProject],
            state: "open",
            nextAction: "Deliver",
          },
        }),
      ).outcome,
      "success",
    );

    const found = similar(harness, "Migration plan", {
      clientOrganizationIds: [ids.organization],
    });
    assert.deepEqual(
      found.map((item) => [item.projectId, item.matchedOn]),
      [
        [ids.direct, ["title", "client"]],
        [ids.opportunityProject, ["title", "client"]],
      ],
    );
  });

  it("uses only explicit Area and Initiative links as context", () => {
    const harness = setup();
    createProject(harness, ids.areaProject, "Security migration");
    createProject(harness, ids.initiativeProject, "Security rollout");
    for (const command of [
      {
        ...metadata("area"),
        commandName: "area.create" as const,
        payload: {
          areaId: ids.area,
          spaceId: ids.space,
          title: "Security stewardship",
          responsibility: "Keep security healthy.",
        },
      },
      {
        ...metadata("initiative"),
        commandName: "initiative.create" as const,
        payload: {
          initiativeId: ids.initiative,
          spaceId: ids.space,
          title: "Security modernization",
          intendedOutcome: "Migration complete.",
        },
      },
    ])
      assert.equal(
        unwrap(harness.kernel.execute(context, command)).outcome,
        "success",
      );
    for (const [key, linkType, sourceRecordId, targetRecordId] of [
      ["area-link", "project_serves_area", ids.areaProject, ids.area],
      [
        "initiative-link",
        "project_advances_initiative",
        ids.initiativeProject,
        ids.initiative,
      ],
    ] as const)
      assert.equal(
        unwrap(
          harness.kernel.execute(context, {
            ...metadata(key),
            commandName: "work.linkCreate",
            payload: {
              linkId: uuid(),
              spaceId: ids.space,
              linkType,
              sourceRecordId,
              targetRecordId,
            },
          }),
        ).outcome,
        "success",
      );

    const found = similar(harness, "Security plan", {
      contexts: [
        { kind: "area", recordId: ids.area },
        { kind: "initiative", recordId: ids.initiative },
      ],
    });
    assert.deepEqual(
      found.map((item) => [item.projectId, item.matchedOn]),
      [
        [ids.areaProject, ["title", "area"]],
        [ids.initiativeProject, ["title", "initiative"]],
      ],
    );
  });

  it("makes hidden candidates identical to absence and merges invalid with cross-Space context", () => {
    const absent = setup();
    assert.deepEqual(similar(absent, "Hidden exact delivery"), []);

    const hidden = setup();
    hidden.store.transact((transaction) => {
      const wave = transaction as unknown as {
        insertProject(project: ReturnType<typeof projectRecord>): void;
        insertStrategicRecord(
          record: ReturnType<typeof createOrganization>,
        ): void;
      };
      transaction.insertSpace({
        id: SpaceIdSchema.parse(ids.privateSpace),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        name: "Private",
        version: 1,
        createdAt: "2026-08-20T20:00:00.000Z",
      });
      wave.insertProject(
        projectRecord({
          id: ProjectIdSchema.parse(ids.hiddenProject),
          workspaceId: WorkspaceIdSchema.parse(ids.workspace),
          spaceId: SpaceIdSchema.parse(ids.privateSpace),
          title: "Hidden exact delivery",
          createdBy: PrincipalIdSchema.parse(ids.principal),
          occurredAt: "2026-08-20T20:00:00.000Z",
        }),
      );
      wave.insertStrategicRecord(
        createOrganization({
          id: StrategicRecordIdSchema.parse(ids.hiddenOrganization),
          workspaceId: WorkspaceIdSchema.parse(ids.workspace),
          spaceId: SpaceIdSchema.parse(ids.privateSpace),
          name: "Hidden client",
          relationshipState: "active",
          createdBy: PrincipalIdSchema.parse(ids.principal),
          occurredAt: "2026-08-20T20:00:00.000Z",
        }),
      );
    });
    assert.deepEqual(similar(hidden, "Hidden exact delivery"), []);

    const refusal = (clientOrganizationId: string) =>
      hidden.kernel.query(context, {
        contractVersion: 1,
        queryName: "project.similarCandidates",
        queryId: uuid(),
        workspaceId: ids.workspace,
        consistency: "local_authoritative",
        parameters: {
          spaceId: ids.space,
          title: "Migration plan",
          clientOrganizationIds: [clientOrganizationId],
        },
      } as never);
    const crossSpace = refusal(ids.hiddenOrganization);
    const invalid = refusal("91000000-0000-4000-8000-000000000399");
    assert.equal(crossSpace.kind, "query_result");
    assert.equal(invalid.kind, "query_result");
    if (crossSpace.kind !== "query_result" || invalid.kind !== "query_result")
      throw new Error("Expected query results.");
    const refusalShape = (result: typeof crossSpace.result) =>
      result.outcome === "rejected"
        ? [result.outcome, result.diagnosticCode]
        : [result.outcome, undefined];
    assert.deepEqual(
      refusalShape(crossSpace.result),
      refusalShape(invalid.result),
    );
  });

  it("labels closed candidates after active ones and excludes removed Projects", () => {
    const harness = setup();
    for (const projectId of [
      ids.activeLifecycle,
      ids.closedLifecycle,
      ids.removedLifecycle,
    ])
      createProject(harness, projectId, "Exact lifecycle delivery");
    assert.equal(
      unwrap(
        harness.kernel.execute(context, {
          ...metadata("close", { [ids.closedLifecycle]: 1 }),
          commandName: "project.close",
          payload: { projectId: ids.closedLifecycle },
        }),
      ).outcome,
      "success",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context, {
          ...metadata("remove", { [ids.removedLifecycle]: 1 }),
          commandName: "project.remove",
          payload: { projectId: ids.removedLifecycle },
        }),
      ).outcome,
      "success",
    );
    assert.deepEqual(
      similar(harness, "Exact lifecycle delivery").map((item) => [
        item.projectId,
        item.lifecycle,
      ]),
      [
        [ids.activeLifecycle, "active"],
        [ids.closedLifecycle, "closed"],
      ],
    );
  });
});
