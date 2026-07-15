import { z } from "zod";

import {
  CausationIdSchema,
  CaptureIdSchema,
  CheckpointIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  DeviceIdSchema,
  DocumentIdSchema,
  PrincipalIdSchema,
  MembershipIdSchema,
  ProjectIdSchema,
  RelationIdSchema,
  SpaceIdSchema,
  SpaceGrantIdSchema,
  TaskIdSchema,
  TaskAssignmentIdSchema,
  CommentIdSchema,
  AttentionSignalIdSchema,
  TaskStatusIdSchema,
  WorkspaceIdSchema,
  AgentRunIdSchema,
  AgentHandoffIdSchema,
  CredentialIdSchema,
  GrantIdSchema,
  KnowledgeSourceIdSchema,
  NamedDocumentVersionIdSchema,
  DocumentRevisionIdSchema,
  StrategicRecordIdSchema,
} from "./ids.js";
import { CapabilitySchema } from "./execution-context.js";
import { ImportedMeetingSchema } from "./meeting-loop.js";

export const ContractVersionSchema = z.literal(1);
export type ContractVersion = z.infer<typeof ContractVersionSchema>;

const isTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

export const TimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(isTimeZone, { error: "Invalid IANA time zone." });
export type TimeZone = z.infer<typeof TimeZoneSchema>;

const ExpectedVersionsSchema = z.record(z.uuid(), z.int().positive());

const CommandMetadataSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    commandId: CommandIdSchema,
    workspaceId: WorkspaceIdSchema,
    idempotencyKey: z.string().trim().min(1).max(200),
    expectedVersions: ExpectedVersionsSchema,
    correlationId: CorrelationIdSchema,
    causationId: CausationIdSchema.optional(),
    checkpointId: CheckpointIdSchema.optional(),
    occurredAtClient: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export const WorkspaceCreateLocalCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("workspace.createLocal"),
  payload: z
    .object({
      workspaceId: WorkspaceIdSchema,
      rootSpaceId: SpaceIdSchema,
      ownerPrincipalId: PrincipalIdSchema,
      name: z.string().trim().min(1).max(200),
      timezone: TimeZoneSchema,
    })
    .strict(),
}).strict();
export type WorkspaceCreateLocalCommand = z.infer<
  typeof WorkspaceCreateLocalCommandSchema
>;

export const WorkspaceRenameCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("workspace.rename"),
  payload: z
    .object({
      name: z.string().trim().min(1).max(200),
    })
    .strict(),
}).strict();
export type WorkspaceRenameCommand = z.infer<
  typeof WorkspaceRenameCommandSchema
>;

const MembershipRoleSchema = z.enum(["admin", "member", "guest"]);
const SpaceAccessLevelSchema = z.enum(["view", "comment", "edit"]);

export const WorkspaceMemberAddCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("workspace.memberAdd"),
  payload: z
    .object({
      membershipId: MembershipIdSchema,
      spaceGrantId: SpaceGrantIdSchema,
      principalId: PrincipalIdSchema,
      displayName: z.string().trim().min(1).max(120),
      role: MembershipRoleSchema,
      spaceId: SpaceIdSchema,
      access: SpaceAccessLevelSchema,
    })
    .strict(),
}).strict();

export const WorkspaceMemberSetAccessCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("workspace.memberSetAccess"),
    payload: z
      .object({
        membershipId: MembershipIdSchema,
        spaceGrantId: SpaceGrantIdSchema,
        access: SpaceAccessLevelSchema,
      })
      .strict(),
  }).strict();

export const WorkspaceMemberRevokeCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("workspace.memberRevoke"),
  payload: z.object({ membershipId: MembershipIdSchema }).strict(),
}).strict();

const AgentAccessPresetSchema = z.enum([
  "observe",
  "propose",
  "operate",
  "full_access",
  "custom",
]);

export const AgentGrantCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("agent.grantCreate"),
  payload: z
    .object({
      grantId: GrantIdSchema,
      membershipId: MembershipIdSchema,
      agentPrincipalId: PrincipalIdSchema,
      displayName: z.string().trim().min(1).max(120),
      preset: AgentAccessPresetSchema,
      capabilityScope: z.array(CapabilitySchema).min(1).max(100),
      spaces: z
        .array(
          z
            .object({
              spaceGrantId: SpaceGrantIdSchema,
              spaceId: SpaceIdSchema,
              access: SpaceAccessLevelSchema,
            })
            .strict(),
        )
        .min(1)
        .max(50),
      credentialId: CredentialIdSchema,
      credentialDigest: z.string().regex(/^[a-f0-9]{64}$/),
      expiresAt: z.iso.datetime({ offset: true }).optional(),
    })
    .strict(),
}).strict();

export const AgentGrantRotateCredentialCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("agent.grantRotateCredential"),
    payload: z
      .object({
        grantId: GrantIdSchema,
        credentialId: CredentialIdSchema,
        credentialDigest: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  }).strict();

export const AgentGrantRevokeCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("agent.grantRevoke"),
  payload: z.object({ grantId: GrantIdSchema }).strict(),
}).strict();

export const AgentCheckpointCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("agent.checkpointCreate"),
  payload: z
    .object({
      checkpointId: CheckpointIdSchema,
      runId: AgentRunIdSchema,
      label: z.string().trim().min(1).max(200),
    })
    .strict(),
}).strict();

export const AgentHandoffSubmitCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("agent.handoffSubmit"),
  payload: z
    .object({
      handoffId: AgentHandoffIdSchema,
      runId: AgentRunIdSchema,
      evidence: z.array(z.string().trim().min(1).max(500)).max(100),
      changes: z.array(z.string().trim().min(1).max(500)).max(100),
      decisions: z.array(z.string().trim().min(1).max(500)).max(100),
      remainingWork: z.array(z.string().trim().min(1).max(500)).max(100),
      nextAction: z.string().trim().min(1).max(500),
    })
    .strict(),
}).strict();

export const CaptureSubmitTextCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("capture.submitText"),
  payload: z
    .object({
      spaceId: SpaceIdSchema,
      originalText: z.string().min(1).max(262_144),
      deviceId: DeviceIdSchema,
      source: z.enum(["global_quick_capture", "in_app_quick_capture"]),
    })
    .strict(),
}).strict();
export type CaptureSubmitTextCommand = z.infer<
  typeof CaptureSubmitTextCommandSchema
>;

export const CaptureOriginalSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("text"), text: z.string().min(1).max(262_144) })
    .strict(),
  z
    .object({
      kind: z.literal("url"),
      url: z.url().max(4_096),
      title: z.string().trim().min(1).max(500).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("file"),
      displayName: z.string().trim().min(1).max(500),
      reference: z.string().trim().min(1).max(4_096),
      mediaType: z.string().trim().min(1).max(255).optional(),
      sizeBytes: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    })
    .strict(),
]);
export type CaptureOriginal = z.infer<typeof CaptureOriginalSchema>;

export const CaptureSubmitCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("capture.submit"),
  payload: z
    .object({
      spaceId: SpaceIdSchema,
      original: CaptureOriginalSchema,
      deviceId: DeviceIdSchema,
      source: z.enum(["global_quick_capture", "in_app_quick_capture"]),
    })
    .strict(),
}).strict();
export type CaptureSubmitCommand = z.infer<typeof CaptureSubmitCommandSchema>;

export const CaptureProcessCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("capture.process"),
  payload: z
    .object({
      captureId: CaptureIdSchema,
      destination: z.enum(["auto", "task", "knowledge_source"]),
      title: z.string().trim().min(1).max(500).optional(),
    })
    .strict(),
}).strict();
export type CaptureProcessCommand = z.infer<typeof CaptureProcessCommandSchema>;

export const CaptureRouteAsTaskCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("capture.routeAsTask"),
  payload: z
    .object({
      captureId: CaptureIdSchema,
      title: z.string().trim().min(1).max(500),
    })
    .strict(),
}).strict();
export type CaptureRouteAsTaskCommand = z.infer<
  typeof CaptureRouteAsTaskCommandSchema
>;

export const ProjectCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("project.create"),
  payload: z
    .object({
      spaceId: SpaceIdSchema,
      title: z.string().trim().min(1).max(500),
      intendedOutcome: z.string().trim().min(1).max(4_000),
    })
    .strict(),
}).strict();

export const DocumentCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("document.create"),
  payload: z
    .object({
      documentId: DocumentIdSchema,
      spaceId: SpaceIdSchema,
      title: z.string().trim().min(1).max(500),
      role: z.enum(["note", "document", "deliverable"]).optional(),
    })
    .strict(),
}).strict();

export const KnowledgeSourceCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("knowledge.sourceCreate"),
  payload: z
    .object({
      sourceId: KnowledgeSourceIdSchema,
      spaceId: SpaceIdSchema,
      sourceKind: z.enum(["url", "file", "screenshot", "excerpt"]),
      title: z.string().trim().min(1).max(500),
      canonicalUrl: z.url().max(4_096).optional(),
      excerpt: z.string().trim().min(1).max(32_768).optional(),
      availability: z.enum(["reference_only", "available", "unavailable"]),
      observedAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
}).strict();

export const KnowledgeSourceUpdateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("knowledge.sourceUpdate"),
  payload: z
    .object({
      sourceId: KnowledgeSourceIdSchema,
      title: z.string().trim().min(1).max(500),
      canonicalUrl: z.url().max(4_096).optional(),
      excerpt: z.string().trim().min(1).max(32_768).optional(),
      availability: z.enum(["reference_only", "available", "unavailable"]),
      observedAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
}).strict();

export const KnowledgeDocumentSetEvidenceCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("knowledge.documentSetEvidence"),
    payload: z
      .object({
        documentId: DocumentIdSchema,
        sourceIds: z.array(KnowledgeSourceIdSchema).max(100),
        noteDocumentIds: z.array(DocumentIdSchema).max(100),
      })
      .strict(),
  }).strict();

export const KnowledgeNamedVersionCreateCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("knowledge.namedVersionCreate"),
    payload: z
      .object({
        namedVersionId: NamedDocumentVersionIdSchema,
        documentId: DocumentIdSchema,
        documentRevisionId: DocumentRevisionIdSchema,
        name: z.string().trim().min(1).max(120),
        milestone: z.enum(["finalized", "delivered", "approved", "published"]),
        contentSnapshot: z.string().max(262_144),
      })
      .strict(),
  }).strict();

export const KnowledgeNamedVersionVoidCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("knowledge.namedVersionVoid"),
    payload: z
      .object({ namedVersionId: NamedDocumentVersionIdSchema })
      .strict(),
  }).strict();

export const RelationshipOrganizationCreateCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("relationship.organizationCreate"),
    payload: z
      .object({
        organizationId: StrategicRecordIdSchema,
        spaceId: SpaceIdSchema,
        name: z.string().trim().min(1).max(300),
        relationshipState: z.enum(["prospect", "active", "inactive"]),
        nextAction: z.string().trim().min(1).max(1_000).optional(),
      })
      .strict(),
  }).strict();

export const RelationshipPersonCreateCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("relationship.personCreate"),
    payload: z
      .object({
        personId: StrategicRecordIdSchema,
        spaceId: SpaceIdSchema,
        name: z.string().trim().min(1).max(300),
        organizationId: StrategicRecordIdSchema.optional(),
        role: z.string().trim().min(1).max(300).optional(),
        email: z.email().max(320).optional(),
      })
      .strict(),
  }).strict();

export const OpportunityCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("opportunity.create"),
  payload: z
    .object({
      opportunityId: StrategicRecordIdSchema,
      spaceId: SpaceIdSchema,
      title: z.string().trim().min(1).max(500),
      organizationId: StrategicRecordIdSchema,
      personIds: z.array(StrategicRecordIdSchema).max(100),
      need: z.string().trim().min(1).max(4_000),
      qualification: z.string().trim().min(1).max(2_000),
      stage: z.string().trim().min(1).max(120),
      nextAction: z.string().trim().min(1).max(1_000),
      evidenceSourceIds: z.array(KnowledgeSourceIdSchema).max(100),
    })
    .strict(),
}).strict();

export const OpportunityOfferCreateCommandSchema = CommandMetadataSchema.extend(
  {
    commandName: z.literal("opportunity.offerCreate"),
    payload: z
      .object({
        offerId: StrategicRecordIdSchema,
        opportunityId: StrategicRecordIdSchema,
        deliverableDocumentId: DocumentIdSchema,
        title: z.string().trim().min(1).max(500),
        ownerPrincipalId: PrincipalIdSchema,
        state: z.enum(["draft", "ready", "submitted", "accepted", "declined"]),
        nextAction: z.string().trim().min(1).max(1_000),
      })
      .strict(),
  },
).strict();

export const OpportunityLinkOutcomesCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("opportunity.linkOutcomes"),
    payload: z
      .object({
        opportunityId: StrategicRecordIdSchema,
        offerIds: z.array(StrategicRecordIdSchema).max(100),
        projectIds: z.array(ProjectIdSchema).max(100),
        state: z.enum(["open", "pursued", "deferred", "rejected", "lost"]),
        nextAction: z.string().trim().min(1).max(1_000),
      })
      .strict(),
  }).strict();

export const RelationshipRenewalCreateCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("relationship.renewalCreate"),
    payload: z
      .object({
        renewalId: StrategicRecordIdSchema,
        followUpTaskId: TaskIdSchema,
        spaceId: SpaceIdSchema,
        organizationId: StrategicRecordIdSchema,
        title: z.string().trim().min(1).max(500),
        scope: z.string().trim().min(1).max(2_000),
        expiresAt: z.iso.datetime({ offset: true }),
        leadTimeDays: z.int().min(0).max(3_650),
        ownerPrincipalId: PrincipalIdSchema,
        evidenceSourceIds: z.array(KnowledgeSourceIdSchema).max(100),
        cycleKey: z.string().trim().min(1).max(300),
      })
      .strict(),
  }).strict();

export const RelationshipRenewalResolveCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("relationship.renewalResolve"),
    payload: z
      .object({
        renewalId: StrategicRecordIdSchema,
        state: z.enum(["renewed", "not_renewing", "irrelevant"]),
      })
      .strict(),
  }).strict();

export const RelationshipFactCreateCommandSchema = CommandMetadataSchema.extend(
  {
    commandName: z.literal("relationship.factCreate"),
    payload: z
      .object({
        factId: StrategicRecordIdSchema,
        spaceId: SpaceIdSchema,
        organizationId: StrategicRecordIdSchema,
        factType: z.string().trim().min(1).max(200),
        value: z.string().trim().min(1).max(8_000),
        evidenceSourceIds: z.array(KnowledgeSourceIdSchema).min(1).max(100),
        verifiedAt: z.iso.datetime({ offset: true }),
        staleAfter: z.iso.datetime({ offset: true }),
      })
      .strict(),
  },
).strict();

export const DecisionCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("decision.create"),
  payload: z
    .object({
      decisionId: StrategicRecordIdSchema,
      spaceId: SpaceIdSchema,
      title: z.string().trim().min(1).max(500),
      rationale: z.string().trim().min(1).max(8_000),
      evidenceSourceIds: z.array(KnowledgeSourceIdSchema).max(100),
      linkedRecordIds: z.array(z.uuid()).max(200),
    })
    .strict(),
}).strict();

const ImpactConsequenceSchema = z
  .object({
    recordId: z.uuid(),
    recordKind: z.enum([
      "task",
      "offer",
      "document",
      "deliverable",
      "commitment",
    ]),
  })
  .strict();

export const DecisionSupersedeCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("decision.supersede"),
  payload: z
    .object({
      priorDecisionId: StrategicRecordIdSchema,
      replacementDecisionId: StrategicRecordIdSchema,
      impactReviewId: StrategicRecordIdSchema,
      title: z.string().trim().min(1).max(500),
      rationale: z.string().trim().min(1).max(8_000),
      reason: z.string().trim().min(1).max(4_000),
      evidenceSourceIds: z.array(KnowledgeSourceIdSchema).max(100),
      consequences: z.array(ImpactConsequenceSchema).max(200),
    })
    .strict(),
}).strict();

export const DecisionResolveImpactCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("decision.resolveImpact"),
  payload: z
    .object({
      impactReviewId: StrategicRecordIdSchema,
      recordId: z.uuid(),
      resolution: z.string().trim().min(1).max(4_000),
    })
    .strict(),
}).strict();

export const AreaCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("area.create"),
  payload: z
    .object({
      areaId: StrategicRecordIdSchema,
      spaceId: SpaceIdSchema,
      title: z.string().trim().min(1).max(500),
      responsibility: z.string().trim().min(1).max(4_000),
    })
    .strict(),
}).strict();

export const InitiativeCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("initiative.create"),
  payload: z
    .object({
      initiativeId: StrategicRecordIdSchema,
      spaceId: SpaceIdSchema,
      title: z.string().trim().min(1).max(500),
      intendedOutcome: z.string().trim().min(1).max(4_000),
    })
    .strict(),
}).strict();

export const WorkLinkCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("work.linkCreate"),
  payload: z
    .object({
      linkId: StrategicRecordIdSchema,
      spaceId: SpaceIdSchema,
      linkType: z.enum([
        "project_advances_initiative",
        "project_serves_area",
        "task_depends_on_task",
      ]),
      sourceRecordId: z.uuid(),
      targetRecordId: z.uuid(),
    })
    .strict(),
}).strict();

export const WorkLinkRemoveCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("work.linkRemove"),
  payload: z.object({ linkId: StrategicRecordIdSchema }).strict(),
}).strict();

const SavedViewFiltersSchema = z
  .object({
    operationalStates: z
      .array(z.enum(["actionable", "waiting", "blocked"]))
      .max(3)
      .optional(),
    projectIds: z.array(ProjectIdSchema).max(100).optional(),
    areaIds: z.array(StrategicRecordIdSchema).max(100).optional(),
    initiativeIds: z.array(StrategicRecordIdSchema).max(100).optional(),
    unassigned: z.boolean().optional(),
  })
  .strict();

export const SavedViewCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("savedView.create"),
  payload: z
    .object({
      savedViewId: StrategicRecordIdSchema,
      spaceId: SpaceIdSchema,
      name: z.string().trim().min(1).max(200),
      filters: SavedViewFiltersSchema,
      sort: z.enum(["updated_desc", "due_asc", "title_asc"]),
    })
    .strict(),
}).strict();

export const RecurrenceCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("recurrence.create"),
  payload: z
    .object({
      recurrenceId: StrategicRecordIdSchema,
      spaceId: SpaceIdSchema,
      title: z.string().trim().min(1).max(500),
      taskTitle: z.string().trim().min(1).max(500),
      contextRecordId: z.uuid().optional(),
      cadence: z.enum(["daily", "weekly", "monthly", "yearly"]),
      nextDueAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
}).strict();

export const RecurrenceGenerateOccurrenceCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("recurrence.generateOccurrence"),
    payload: z
      .object({
        recurrenceId: StrategicRecordIdSchema,
        occurrenceTaskId: TaskIdSchema,
        nextDueAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
  }).strict();

export const ProjectCloseCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("project.close"),
  payload: z.object({ projectId: ProjectIdSchema }).strict(),
}).strict();
export const ProjectReopenCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("project.reopen"),
  payload: z.object({ projectId: ProjectIdSchema }).strict(),
}).strict();

export const RadarCandidateUpsertCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("radar.candidateUpsert"),
  payload: z
    .object({
      candidateId: StrategicRecordIdSchema,
      spaceId: SpaceIdSchema,
      sourceId: KnowledgeSourceIdSchema,
      materialKey: z.string().trim().min(1).max(500),
      title: z.string().trim().min(1).max(500),
      relevance: z.string().trim().min(1).max(2_000),
    })
    .strict(),
}).strict();

export const RadarResolveCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("radar.resolve"),
  payload: z
    .object({
      candidateId: StrategicRecordIdSchema,
      state: z.enum(["saved", "dismissed"]),
      resolutionRecordId: z.uuid().optional(),
    })
    .strict(),
}).strict();
export const MeetingUpsertImportedCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("meeting.upsertImported"),
  payload: z.object({ meeting: ImportedMeetingSchema }).strict(),
}).strict();

export const ProjectUpdateOutcomeCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("project.updateOutcome"),
  payload: z
    .object({
      projectId: ProjectIdSchema,
      intendedOutcome: z.string().trim().min(1).max(4_000),
    })
    .strict(),
}).strict();

export const TaskSetStatusCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("task.setStatus"),
  payload: z
    .object({ taskId: TaskIdSchema, statusId: TaskStatusIdSchema })
    .strict(),
}).strict();

export const TaskSetOperationalStateCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("task.setOperationalState"),
    payload: z
      .object({
        taskId: TaskIdSchema,
        operationalState: z.enum(["actionable", "waiting", "blocked"]),
        waitingOn: z
          .object({
            kind: z.enum(["person", "task", "external"]),
            label: z.string().trim().min(1).max(500),
            recordId: z.uuid().optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  }).strict();

export const TaskCompleteCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("task.complete"),
  payload: z.object({ taskId: TaskIdSchema }).strict(),
}).strict();

export const TaskReopenCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("task.reopen"),
  payload: z.object({ taskId: TaskIdSchema }).strict(),
}).strict();

export const TaskAssignCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("task.assign"),
  payload: z
    .object({
      assignmentId: TaskAssignmentIdSchema,
      taskId: TaskIdSchema,
      assigneePrincipalId: PrincipalIdSchema,
    })
    .strict(),
}).strict();

export const TaskUnassignCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("task.unassign"),
  payload: z
    .object({ assignmentId: TaskAssignmentIdSchema, taskId: TaskIdSchema })
    .strict(),
}).strict();

const CommentTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("task"), taskId: TaskIdSchema }).strict(),
  z.object({ kind: z.literal("project"), projectId: ProjectIdSchema }).strict(),
]);

export const CommentAddCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("comment.add"),
  payload: z
    .object({
      commentId: CommentIdSchema,
      target: CommentTargetSchema,
      parentCommentId: CommentIdSchema.optional(),
      body: z.string().trim().min(1).max(16_000),
      mentionPrincipalIds: z.array(PrincipalIdSchema).max(50).default([]),
    })
    .strict(),
}).strict();

export const CommentEditCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("comment.edit"),
  payload: z
    .object({
      commentId: CommentIdSchema,
      body: z.string().trim().min(1).max(16_000),
      mentionPrincipalIds: z.array(PrincipalIdSchema).max(50).default([]),
    })
    .strict(),
}).strict();

export const CommentResolveCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("comment.resolve"),
  payload: z.object({ commentId: CommentIdSchema }).strict(),
}).strict();

export const CommentReopenCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("comment.reopen"),
  payload: z.object({ commentId: CommentIdSchema }).strict(),
}).strict();

export const AttentionMarkReadCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("attention.markRead"),
  payload: z.object({ attentionSignalId: AttentionSignalIdSchema }).strict(),
}).strict();

export const AttentionDismissCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("attention.dismiss"),
  payload: z.object({ attentionSignalId: AttentionSignalIdSchema }).strict(),
}).strict();

export const RecordRelateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("record.relate"),
  payload: z
    .object({
      relationType: z.literal("task_contributes_to_project"),
      taskId: TaskIdSchema,
      projectId: ProjectIdSchema,
    })
    .strict(),
}).strict();

export const RecordUnrelateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("record.unrelate"),
  payload: z.object({ relationId: RelationIdSchema }).strict(),
}).strict();

export const CommandPreviewUndoSchema = CommandMetadataSchema.extend({
  commandName: z.literal("command.previewUndo"),
  payload: z.object({ targetCommandId: CommandIdSchema }).strict(),
}).strict();

export const CommandUndoSchema = CommandMetadataSchema.extend({
  commandName: z.literal("command.undo"),
  payload: z.object({ targetCommandId: CommandIdSchema }).strict(),
}).strict();

export const CommandEnvelopeSchema = z.discriminatedUnion("commandName", [
  WorkspaceCreateLocalCommandSchema,
  WorkspaceRenameCommandSchema,
  WorkspaceMemberAddCommandSchema,
  WorkspaceMemberSetAccessCommandSchema,
  WorkspaceMemberRevokeCommandSchema,
  AgentGrantCreateCommandSchema,
  AgentGrantRotateCredentialCommandSchema,
  AgentGrantRevokeCommandSchema,
  AgentCheckpointCreateCommandSchema,
  AgentHandoffSubmitCommandSchema,
  CaptureSubmitCommandSchema,
  CaptureProcessCommandSchema,
  CaptureSubmitTextCommandSchema,
  CaptureRouteAsTaskCommandSchema,
  ProjectCreateCommandSchema,
  DocumentCreateCommandSchema,
  KnowledgeSourceCreateCommandSchema,
  KnowledgeSourceUpdateCommandSchema,
  KnowledgeDocumentSetEvidenceCommandSchema,
  KnowledgeNamedVersionCreateCommandSchema,
  KnowledgeNamedVersionVoidCommandSchema,
  RelationshipOrganizationCreateCommandSchema,
  RelationshipPersonCreateCommandSchema,
  OpportunityCreateCommandSchema,
  OpportunityOfferCreateCommandSchema,
  OpportunityLinkOutcomesCommandSchema,
  RelationshipRenewalCreateCommandSchema,
  RelationshipRenewalResolveCommandSchema,
  RelationshipFactCreateCommandSchema,
  DecisionCreateCommandSchema,
  DecisionSupersedeCommandSchema,
  DecisionResolveImpactCommandSchema,
  AreaCreateCommandSchema,
  InitiativeCreateCommandSchema,
  WorkLinkCreateCommandSchema,
  WorkLinkRemoveCommandSchema,
  SavedViewCreateCommandSchema,
  RecurrenceCreateCommandSchema,
  RecurrenceGenerateOccurrenceCommandSchema,
  ProjectCloseCommandSchema,
  ProjectReopenCommandSchema,
  RadarCandidateUpsertCommandSchema,
  RadarResolveCommandSchema,
  MeetingUpsertImportedCommandSchema,
  ProjectUpdateOutcomeCommandSchema,
  TaskSetStatusCommandSchema,
  TaskSetOperationalStateCommandSchema,
  TaskCompleteCommandSchema,
  TaskReopenCommandSchema,
  TaskAssignCommandSchema,
  TaskUnassignCommandSchema,
  CommentAddCommandSchema,
  CommentEditCommandSchema,
  CommentResolveCommandSchema,
  CommentReopenCommandSchema,
  AttentionMarkReadCommandSchema,
  AttentionDismissCommandSchema,
  RecordRelateCommandSchema,
  RecordUnrelateCommandSchema,
  CommandPreviewUndoSchema,
  CommandUndoSchema,
]);
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
export type CommandName = CommandEnvelope["commandName"];
