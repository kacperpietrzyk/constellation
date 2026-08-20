import assert from "node:assert/strict";
import { it } from "node:test";

import {
  InMemoryReferenceStore,
  isApplicationWave2Transaction,
} from "@constellation/application";
import {
  AgentRunIdSchema,
  capabilitiesForAgentGrantPreset,
  CaptureIdSchema,
  CapturePayloadIdSchema,
  ExecutionContextSchema,
  PrincipalIdSchema,
  ProjectCheckInIdSchema,
  ProjectIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
  type CaptureId,
  type ExecutionContext,
  type WorkspaceId,
} from "@constellation/contracts";
import { createReferenceHarness } from "@constellation/testkit";

import {
  fromHubSnapshot,
  fromInternalHubSnapshot,
  HubService,
  internalHubSnapshotFromRepository,
  InMemoryHubRepository,
  scopeHubSnapshot,
  scopeInternalHubSnapshot,
  snapshotDigest,
  toHubSnapshot,
  toInternalHubSnapshot,
} from "../src/index.js";

const id = (suffix: string) =>
  `74000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

it("attests active exact agent attribution before dropping local control state and redacts it after revocation", async () => {
  const workspaceId = WorkspaceIdSchema.parse(id("101"));
  const spaceId = SpaceIdSchema.parse(id("102"));
  const ownerId = PrincipalIdSchema.parse(id("103"));
  const agentId = PrincipalIdSchema.parse(id("104"));
  const projectId = ProjectIdSchema.parse(id("105"));
  const checkInId = ProjectCheckInIdSchema.parse(id("106"));
  const agentGrantId = id("107");
  const agentMembershipId = id("108");
  const agentSpaceGrantId = id("109");
  const agentCredentialId = id("110");
  const agentRunId = AgentRunIdSchema.parse(id("111"));
  const owner = ExecutionContextSchema.parse({
    principalId: ownerId,
    principalKind: "human",
    credentialId: id("112"),
    grantId: id("113"),
    policyVersion: 1,
    workspaceId,
    spaceScope: [spaceId],
    capabilityScope: [
      "workspace.createLocal",
      "workspace.manageAccess",
      "agent.manageAccess",
      "project.create",
      "project.checkInList",
    ],
    origin: "desktop",
  });
  const harness = createReferenceHarness();
  harness.authorization.register(owner);
  const executeAs = (
    context: typeof owner,
    command: Parameters<typeof harness.kernel.execute>[1],
  ) => harness.kernel.execute(context, command);
  executeAs(owner, {
    contractVersion: 1,
    commandName: "workspace.createLocal",
    commandId: id("114"),
    workspaceId,
    idempotencyKey: "hub-attestation-bootstrap",
    expectedVersions: {},
    correlationId: id("115"),
    payload: {
      workspaceId,
      rootSpaceId: spaceId,
      ownerPrincipalId: ownerId,
      name: "Hub attestation",
      timezone: "Europe/Warsaw",
    },
  });
  executeAs(owner, {
    contractVersion: 1,
    commandName: "project.create",
    commandId: id("116"),
    workspaceId,
    idempotencyKey: "hub-attestation-project",
    expectedVersions: {},
    correlationId: id("117"),
    payload: { projectId, spaceId, title: "Hub active attribution" },
  });
  const capabilities = [...capabilitiesForAgentGrantPreset("operate")];
  executeAs(owner, {
    contractVersion: 1,
    commandName: "agent.grantCreate",
    commandId: id("118"),
    workspaceId,
    idempotencyKey: "hub-attestation-grant",
    expectedVersions: { [workspaceId]: 1 },
    correlationId: id("119"),
    payload: {
      grantId: agentGrantId,
      membershipId: agentMembershipId,
      agentPrincipalId: agentId,
      displayName: "Hermes",
      preset: "operate",
      capabilityScope: capabilities,
      spaces: [{ spaceGrantId: agentSpaceGrantId, spaceId, access: "edit" }],
      credentialId: agentCredentialId,
      credentialDigest: "b".repeat(64),
    },
  });
  const workspace = harness.store.snapshot().workspaces[0]!;
  const agent = ExecutionContextSchema.parse({
    principalId: agentId,
    principalKind: "agent",
    credentialId: agentCredentialId,
    grantId: agentGrantId,
    policyVersion: workspace.policyVersion,
    workspaceId,
    spaceScope: [spaceId],
    capabilityScope: capabilities,
    origin: "mcp",
    hostRun: {
      runId: "active-hub-run",
      agentRunId,
      hostName: "Hermes Agent",
    },
  });
  harness.authorization.register(agent);
  executeAs(agent, {
    contractVersion: 1,
    commandName: "project.checkInAdd",
    commandId: id("120"),
    workspaceId,
    idempotencyKey: "hub-attestation-check-in",
    expectedVersions: { [projectId]: 1 },
    correlationId: id("121"),
    payload: {
      checkInId,
      projectId,
      summary: "Active agent attribution crosses the Hub safely.",
      evidenceSourceIds: [],
      references: [],
    },
  });
  const voiceCaptureId = CaptureIdSchema.parse(id("122"));
  harness.store.transact((transaction) => {
    transaction.insertCapture({
      id: voiceCaptureId,
      workspaceId,
      spaceId,
      originalText: "",
      original: {
        kind: "voice_note",
        payload: {
          payloadId: CapturePayloadIdSchema.parse(id("123")),
          displayName: "maintenance.webm",
          mediaType: "audio/webm",
          byteLength: 4_096,
          contentSha256: "c".repeat(64),
          custodyState: "available",
        },
        durationMs: 12_000,
        retentionPolicy: "delete_after_transcript",
      },
      originalFingerprint: "voice-maintenance",
      deviceId: "maintenance-device",
      source: "global_quick_capture",
      capturedAt: "2026-08-20T14:00:00.000Z",
      submittedBy: ownerId,
      version: 4,
      processingState: "transcript_ready",
      transcript: {
        text: "Deletion can now be finalized.",
        audioContentSha256: "c".repeat(64),
        writtenAt: "2026-08-20T14:01:00.000Z",
        writtenBy: ownerId,
        writtenByKind: "human",
      },
      audioState: "deletion_pending",
      audioStateChangedAt: "2026-08-20T14:02:00.000Z",
    });
  });

  const activeHub = toInternalHubSnapshot(harness.store.snapshot()).snapshot;
  assert.equal("agentGrants" in activeHub, false);
  assert.equal(
    activeHub.memberships.some(
      (membership) => membership.principalId === agentId,
    ),
    false,
  );
  const activeScoped = scopeInternalHubSnapshot(
    internalHubSnapshotFromRepository(activeHub),
    workspaceId,
    owner,
  );
  assert.ok(activeScoped);
  const active = activeScoped.projectCheckIns[0] as Record<string, unknown>;
  assert.equal("hubAttributionAttestation" in active, false);
  assert.deepEqual(active, {
    ...active,
    authorPrincipalId: agentId,
    authorPrincipalKind: "agent",
    authorGrantId: agentGrantId,
    agentRunId,
    hostRunId: "active-hub-run",
  });

  const cycledHub = toInternalHubSnapshot(
    fromInternalHubSnapshot(
      internalHubSnapshotFromRepository(activeHub),
      workspaceId,
    ),
  ).snapshot;
  assert.equal("agentGrants" in cycledHub, false);
  const cycledScoped = scopeInternalHubSnapshot(
    internalHubSnapshotFromRepository(cycledHub),
    workspaceId,
    owner,
  );
  assert.ok(cycledScoped);
  const cycled = cycledScoped.projectCheckIns[0] as Record<string, unknown>;
  assert.equal("hubAttributionAttestation" in cycled, false);
  assert.equal(cycled.authorPrincipalId, agentId);
  assert.equal(cycled.authorPrincipalKind, "agent");
  assert.equal(cycled.authorGrantId, agentGrantId);
  assert.equal(cycled.agentRunId, agentRunId);
  assert.equal(cycled.hostRunId, "active-hub-run");

  const serviceStore = new InMemoryReferenceStore(
    undefined,
    fromInternalHubSnapshot(
      internalHubSnapshotFromRepository(activeHub),
      workspaceId,
    ),
  );
  const serviceCycledHub = toInternalHubSnapshot(
    serviceStore.snapshot(),
  ).snapshot;
  const serviceScoped = scopeInternalHubSnapshot(
    internalHubSnapshotFromRepository(serviceCycledHub),
    workspaceId,
    owner,
  );
  assert.ok(serviceScoped);
  const serviceItem = serviceScoped.projectCheckIns[0] as Record<
    string,
    unknown
  >;
  assert.equal(serviceItem.authorPrincipalId, agentId);
  assert.equal(serviceItem.authorPrincipalKind, "agent");
  assert.equal(serviceItem.authorGrantId, agentGrantId);
  assert.equal(serviceItem.agentRunId, agentRunId);
  assert.equal(serviceItem.hostRunId, "active-hub-run");

  const internalRepository = new InMemoryHubRepository();
  await internalRepository.createWorkspace({
    workspaceId,
    checkpoint: 0n,
    snapshot: activeHub,
    snapshotDigest: snapshotDigest(activeHub),
    receipts: new Map(),
  });
  await internalRepository.withWorkspaceLock(workspaceId, (state) => {
    const restoredStore = new InMemoryReferenceStore(
      undefined,
      fromInternalHubSnapshot(
        internalHubSnapshotFromRepository(state.snapshot),
        workspaceId,
      ),
    );
    state.snapshot = toInternalHubSnapshot(restoredStore.snapshot()).snapshot;
    state.snapshotDigest = snapshotDigest(state.snapshot);
  });
  const repositoryScoped = await internalRepository.withWorkspaceLock(
    workspaceId,
    (state) =>
      scopeInternalHubSnapshot(
        internalHubSnapshotFromRepository(state.snapshot),
        workspaceId,
        owner,
      ),
  );
  assert.equal(
    (repositoryScoped?.projectCheckIns[0] as Record<string, unknown>)
      .agentRunId,
    agentRunId,
  );
  const maintenanceService = new HubService(internalRepository, {
    capturePayloadVerifier: {
      isAvailable: async () => true,
      deleteCapturePayload: async () => true,
    },
  });
  await (
    maintenanceService as unknown as {
      finalizeVoiceAudio(
        workspaceId: WorkspaceId,
        captureId: CaptureId,
        authorization: ExecutionContext,
      ): Promise<void>;
    }
  ).finalizeVoiceAudio(workspaceId, voiceCaptureId, owner);
  const finalized = await internalRepository.withWorkspaceLock(
    workspaceId,
    (state) => ({
      checkpoint: state.checkpoint,
      scoped: scopeInternalHubSnapshot(
        internalHubSnapshotFromRepository(state.snapshot),
        workspaceId,
        owner,
      ),
      capture: fromInternalHubSnapshot(
        internalHubSnapshotFromRepository(state.snapshot),
        workspaceId,
      ).captures.find((candidate) => candidate.id === voiceCaptureId),
    }),
  );
  assert.equal(finalized.checkpoint, 1n);
  assert.equal(finalized.capture?.processingState, "transcript_ready");
  if (finalized.capture?.processingState !== "transcript_ready")
    assert.fail("Expected finalized transcript-ready capture.");
  assert.equal(finalized.capture.audioState, "deleted");
  const finalizedCheckIn = finalized.scoped?.projectCheckIns[0] as Record<
    string,
    unknown
  >;
  assert.equal(finalizedCheckIn.authorPrincipalId, agentId);
  assert.equal(finalizedCheckIn.authorPrincipalKind, "agent");
  assert.equal(finalizedCheckIn.authorGrantId, agentGrantId);
  assert.equal(finalizedCheckIn.agentRunId, agentRunId);
  assert.equal(finalizedCheckIn.hostRunId, "active-hub-run");

  const forgedSnapshot = {
    ...activeHub,
    projectCheckIns: activeHub.projectCheckIns.map((checkIn, index) =>
      index === 0
        ? {
            ...checkIn,
            authorPrincipalId: id("901"),
            authorPrincipalKind: "agent",
            authorGrantId: id("902"),
            agentRunId: id("903"),
            hostRunId: "forged-run",
            hubAttributionAttestation:
              "constellation.project-check-in-attribution/v1",
          }
        : checkIn,
    ),
  };
  const forgedRepository = new InMemoryHubRepository();
  const forgedService = new HubService(forgedRepository);
  const publicRoundTrip = scopeHubSnapshot(
    toHubSnapshot(fromHubSnapshot(forgedSnapshot, workspaceId)),
    workspaceId,
    owner,
  );
  assert.ok(publicRoundTrip);
  const publicForged = publicRoundTrip.projectCheckIns[0] as Record<
    string,
    unknown
  >;
  assert.equal("authorPrincipalId" in publicForged, false);
  await forgedService.createWorkspace({
    workspaceId,
    snapshot: forgedSnapshot,
  });
  const forgedProjection = await forgedRepository.withWorkspaceLock(
    workspaceId,
    (state) => scopeHubSnapshot(state.snapshot, workspaceId, owner),
  );
  assert.ok(forgedProjection);
  const forged = forgedProjection.projectCheckIns[0] as Record<string, unknown>;
  for (const key of [
    "authorPrincipalId",
    "authorPrincipalKind",
    "authorGrantId",
    "agentRunId",
    "hostRunId",
    "hubAttributionAttestation",
  ])
    assert.equal(key in forged, false, key);

  const grant = harness.store
    .snapshot()
    .agentGrants?.find((candidate) => candidate.id === agentGrantId);
  assert.ok(grant);
  harness.store.transact((transaction) => {
    transaction.updateAgentGrant(
      {
        ...grant,
        status: "revoked",
        revokedAt: "2026-08-20T13:00:00.000Z",
        version: grant.version + 1,
      },
      grant.version,
    );
  });
  const revokedScoped = scopeInternalHubSnapshot(
    toInternalHubSnapshot(harness.store.snapshot()),
    workspaceId,
    owner,
  );
  assert.ok(revokedScoped);
  const revoked = revokedScoped.projectCheckIns[0] as Record<string, unknown>;
  for (const key of [
    "authorPrincipalId",
    "authorPrincipalKind",
    "authorGrantId",
    "agentRunId",
    "hostRunId",
  ])
    assert.equal(key in revoked, false, key);
  const revokedReceipt = revokedScoped.auditReceipts.find(
    (receipt) => receipt.commandName === "project.checkInAdd",
  ) as Record<string, unknown> | undefined;
  assert.ok(revokedReceipt);
  assert.equal("agentRunId" in revokedReceipt, false);
  assert.equal("hostRunId" in revokedReceipt, false);
});

it("redacts Project check-in actor and run metadata from scoped Hub snapshots", () => {
  const workspaceId = WorkspaceIdSchema.parse(id("1"));
  const spaceId = SpaceIdSchema.parse(id("2"));
  const ownerId = id("3");
  const projectId = ProjectIdSchema.parse(id("4"));
  const checkInId = ProjectCheckInIdSchema.parse(id("5"));
  const context = ExecutionContextSchema.parse({
    principalId: ownerId,
    principalKind: "human",
    credentialId: id("6"),
    grantId: id("7"),
    policyVersion: 1,
    workspaceId,
    spaceScope: [spaceId],
    capabilityScope: [
      "workspace.createLocal",
      "project.create",
      "project.checkInAdd",
      "project.checkInList",
    ],
    origin: "desktop",
  });
  const harness = createReferenceHarness();
  harness.authorization.register(context);
  const execute = (command: Parameters<typeof harness.kernel.execute>[1]) =>
    harness.kernel.execute(context, command);
  execute({
    contractVersion: 1,
    commandName: "workspace.createLocal",
    commandId: id("10"),
    workspaceId,
    idempotencyKey: "hub-privacy-bootstrap",
    expectedVersions: {},
    correlationId: id("11"),
    payload: {
      workspaceId,
      rootSpaceId: spaceId,
      ownerPrincipalId: ownerId,
      name: "Hub privacy",
      timezone: "Europe/Warsaw",
    },
  });
  execute({
    contractVersion: 1,
    commandName: "project.create",
    commandId: id("12"),
    workspaceId,
    idempotencyKey: "hub-privacy-project",
    expectedVersions: {},
    correlationId: id("13"),
    payload: { projectId, spaceId, title: "Hub-private actor" },
  });
  execute({
    contractVersion: 1,
    commandName: "project.checkInAdd",
    commandId: id("14"),
    workspaceId,
    idempotencyKey: "hub-privacy-check-in",
    expectedVersions: { [projectId]: 1 },
    correlationId: id("15"),
    payload: {
      checkInId,
      projectId,
      summary: "A revoked agent wrote this.",
      evidenceSourceIds: [],
      references: [],
    },
  });
  harness.store.transact((transaction) => {
    assert.equal(isApplicationWave2Transaction(transaction), true);
    if (!isApplicationWave2Transaction(transaction)) return;
    const stored = transaction.getProjectCheckIn(checkInId)!;
    transaction.updateProjectCheckIn(
      {
        ...stored,
        authorPrincipalId: PrincipalIdSchema.parse(id("20")),
        agentRunId: AgentRunIdSchema.parse(id("21")),
        hostRunId: "revoked-hub-run",
      },
      stored.version,
    );
  });

  const scoped = scopeHubSnapshot(
    toHubSnapshot(harness.store.snapshot()),
    workspaceId,
    context,
  );
  assert.ok(scoped);
  const item = scoped.projectCheckIns[0] as Record<string, unknown>;
  assert.equal("authorPrincipalId" in item, false);
  assert.equal("authorPrincipalKind" in item, false);
  assert.equal("authorGrantId" in item, false);
  assert.equal("agentRunId" in item, false);
  assert.equal("hostRunId" in item, false);
});
