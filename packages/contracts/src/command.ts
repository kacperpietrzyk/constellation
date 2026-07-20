import { z } from "zod";

import {
  CausationIdSchema,
  CaptureIdSchema,
  CapturePayloadIdSchema,
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
  FieldDefinitionIdSchema,
  AutomationRuleIdSchema,
  ProjectTemplateIdSchema,
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

export const WorkspaceSetVoiceAudioRetentionCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("workspace.setVoiceAudioRetention"),
    payload: z
      .object({
        retentionPolicy: z.enum(["delete_after_transcript", "retain"]),
      })
      .strict(),
  }).strict();
export type WorkspaceSetVoiceAudioRetentionCommand = z.infer<
  typeof WorkspaceSetVoiceAudioRetentionCommandSchema
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
  z
    .object({
      kind: z.literal("managed_file"),
      payload: z
        .object({
          payloadId: CapturePayloadIdSchema,
          displayName: z.string().trim().min(1).max(500),
          mediaType: z.string().trim().min(1).max(255),
          byteLength: z.int().positive().max(26_214_400),
          contentSha256: z.string().regex(/^[0-9a-f]{64}$/u),
          custodyState: z.literal("available"),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("screenshot"),
      payload: z
        .object({
          payloadId: CapturePayloadIdSchema,
          displayName: z.string().trim().min(1).max(500),
          mediaType: z.enum([
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
          ]),
          byteLength: z.int().positive().max(26_214_400),
          contentSha256: z.string().regex(/^[0-9a-f]{64}$/u),
          custodyState: z.literal("available"),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("voice_note"),
      payload: z
        .object({
          payloadId: CapturePayloadIdSchema,
          displayName: z.string().trim().min(1).max(500),
          mediaType: z.enum(["audio/webm", "audio/ogg", "audio/mp4"]),
          byteLength: z.int().positive().max(26_214_400),
          contentSha256: z.string().regex(/^[0-9a-f]{64}$/u),
          custodyState: z.literal("available"),
        })
        .strict(),
      durationMs: z.int().positive().max(120_000),
      retentionPolicy: z.enum(["delete_after_transcript", "retain"]),
    })
    .strict(),
]);
export type CaptureOriginal = z.infer<typeof CaptureOriginalSchema>;

export const isCustodiedCaptureOriginal = (
  original: CaptureOriginal,
): original is Extract<
  CaptureOriginal,
  { kind: "managed_file" | "screenshot" | "voice_note" }
> =>
  original.kind === "managed_file" ||
  original.kind === "screenshot" ||
  original.kind === "voice_note";

export const CaptureReviewReasonSchema = z.enum([
  "ambiguous",
  "duplicate",
  "unsupported",
  "parsing_failure",
  "permission_failure",
  "stale_conflict",
  "missing_target",
  "missing_payload",
  "partial_payload_transfer",
  "unknown_reconcile",
]);
export type CaptureReviewReason = z.infer<typeof CaptureReviewReasonSchema>;

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

export const CaptureReportExceptionCommandSchema = CommandMetadataSchema.extend(
  {
    commandName: z.literal("capture.reportException"),
    payload: z
      .object({
        captureId: CaptureIdSchema,
        reason: CaptureReviewReasonSchema.exclude(["duplicate"]),
      })
      .strict(),
  },
).strict();
export type CaptureReportExceptionCommand = z.infer<
  typeof CaptureReportExceptionCommandSchema
>;

export const CaptureResolveExceptionCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("capture.resolveException"),
    payload: z.discriminatedUnion("action", [
      z
        .object({ captureId: CaptureIdSchema, action: z.literal("retry") })
        .strict(),
      z
        .object({
          captureId: CaptureIdSchema,
          action: z.literal("keep_unclassified"),
        })
        .strict(),
      z
        .object({
          captureId: CaptureIdSchema,
          action: z.literal("replace_payload"),
          original: CaptureOriginalSchema,
        })
        .strict(),
    ]),
  }).strict();
export type CaptureResolveExceptionCommand = z.infer<
  typeof CaptureResolveExceptionCommandSchema
>;

export const CaptureWriteTranscriptCommandSchema = CommandMetadataSchema.extend(
  {
    commandName: z.literal("capture.writeTranscript"),
    payload: z
      .object({
        captureId: CaptureIdSchema,
        audioContentSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        transcript: z.string().trim().min(1).max(262_144),
      })
      .strict(),
  },
).strict();
export type CaptureWriteTranscriptCommand = z.infer<
  typeof CaptureWriteTranscriptCommandSchema
>;

export const CaptureRequestAudioDeletionCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("capture.requestAudioDeletion"),
    payload: z.object({ captureId: CaptureIdSchema }).strict(),
  }).strict();
export type CaptureRequestAudioDeletionCommand = z.infer<
  typeof CaptureRequestAudioDeletionCommandSchema
>;

export const CaptureConfirmAudioDeletionCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("capture.confirmAudioDeletion"),
    payload: z
      .object({
        captureId: CaptureIdSchema,
        audioContentSha256: z.string().regex(/^[0-9a-f]{64}$/u),
      })
      .strict(),
  }).strict();
export type CaptureConfirmAudioDeletionCommand = z.infer<
  typeof CaptureConfirmAudioDeletionCommandSchema
>;

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
    statusIds: z.array(TaskStatusIdSchema).max(50).optional(),
    assigneePrincipalIds: z.array(PrincipalIdSchema).max(50).optional(),
    priorities: z
      .array(z.enum(["urgent", "high", "normal", "low"]))
      .max(4)
      .optional(),
    dueWindow: z.enum(["overdue", "today", "this_week"]).optional(),
    scheduled: z.boolean().optional(),
    fields: z
      .array(
        z
          .object({
            fieldId: FieldDefinitionIdSchema,
            predicate: z.discriminatedUnion("kind", [
              z
                .object({
                  kind: z.literal("choice_is"),
                  option: z.string().min(1).max(120),
                })
                .strict(),
              z.object({ kind: z.literal("set") }).strict(),
              z.object({ kind: z.literal("empty") }).strict(),
            ]),
          })
          .strict(),
      )
      .max(8)
      .optional(),
  })
  .strict();

const SavedViewGroupBySchema = z.union([
  z.literal("status"),
  z.literal("priority"),
  z.object({ fieldId: FieldDefinitionIdSchema }).strict(),
]);

export const SavedViewCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("savedView.create"),
  payload: z
    .object({
      savedViewId: StrategicRecordIdSchema,
      spaceId: SpaceIdSchema,
      name: z.string().trim().min(1).max(200),
      filters: SavedViewFiltersSchema,
      sort: z.enum(["updated_desc", "due_asc", "title_asc"]),
      groupBy: SavedViewGroupBySchema.optional(),
    })
    .strict(),
}).strict();

export const SavedViewRenameCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("savedView.rename"),
  payload: z
    .object({
      savedViewId: StrategicRecordIdSchema,
      name: z.string().trim().min(1).max(200),
    })
    .strict(),
}).strict();

export const SavedViewUpdateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("savedView.update"),
  payload: z
    .object({
      savedViewId: StrategicRecordIdSchema,
      filters: SavedViewFiltersSchema.optional(),
      sort: z.enum(["updated_desc", "due_asc", "title_asc"]).optional(),
      groupBy: SavedViewGroupBySchema.nullable().optional(),
    })
    .strict()
    .refine(
      (payload) =>
        payload.filters !== undefined ||
        payload.sort !== undefined ||
        payload.groupBy !== undefined,
      { message: "savedView.update requires at least one change." },
    ),
}).strict();

export const SavedViewDeleteCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("savedView.delete"),
  payload: z.object({ savedViewId: StrategicRecordIdSchema }).strict(),
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

// R12.5 / ADR-040 — meeting-to-work-graph projection. These are explicit
// operator commands: import itself never creates Tasks, People, or routing.

export const MeetingRouteCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("meeting.route"),
  payload: z
    .object({
      meetingId: StrategicRecordIdSchema,
      // Each field is tri-state: absent leaves it untouched, null clears it,
      // a value sets it. Space may only move while nothing is promoted.
      projectId: ProjectIdSchema.nullable().optional(),
      organizationId: StrategicRecordIdSchema.nullable().optional(),
      spaceId: SpaceIdSchema.optional(),
    })
    .strict()
    .refine(
      (value) =>
        value.projectId !== undefined ||
        value.organizationId !== undefined ||
        value.spaceId !== undefined,
      { error: "Routing must change at least one destination." },
    ),
}).strict();

export const MeetingPromoteWorkItemCommandSchema = CommandMetadataSchema.extend(
  {
    commandName: z.literal("meeting.promoteWorkItem"),
    payload: z
      .object({
        meetingId: StrategicRecordIdSchema,
        workItemId: z.uuid(),
        taskId: TaskIdSchema,
      })
      .strict(),
  },
).strict();

export const MeetingLinkParticipantsCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("meeting.linkParticipants"),
    payload: z
      .object({
        meetingId: StrategicRecordIdSchema,
        // Ids the handler may consume when it needs to create a Person, in
        // order. Supplying none restricts the command to linking existing
        // People, which keeps a read-only-ish invocation possible.
        personIdPool: z.array(StrategicRecordIdSchema).max(500).default([]),
        // Explicit operator resolutions for participants that cannot be
        // matched automatically (name-only). Never inferred.
        resolutions: z
          .array(
            z
              .object({
                participantExternalId: z.string().trim().min(1).max(500),
                personId: StrategicRecordIdSchema,
              })
              .strict(),
          )
          .max(500)
          .default([]),
      })
      .strict(),
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

const TaskTitleSchema = z.string().trim().min(1).max(500);
const TaskDescriptionSchema = z.string().trim().min(1).max(16_000);
const TaskNextActionSchema = z.string().trim().min(1).max(500);
const TaskInstantSchema = z.iso.datetime({ offset: true });
export const TaskPrioritySchema = z.enum(["urgent", "high", "normal", "low"]);

export const TaskCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("task.create"),
  payload: z
    .object({
      taskId: TaskIdSchema,
      spaceId: SpaceIdSchema,
      title: TaskTitleSchema,
      description: TaskDescriptionSchema.optional(),
      nextAction: TaskNextActionSchema.optional(),
      startAt: TaskInstantSchema.optional(),
      dueAt: TaskInstantSchema.optional(),
      priority: TaskPrioritySchema.optional(),
      parentTaskId: TaskIdSchema.optional(),
    })
    .strict()
    .refine(
      (payload) =>
        payload.startAt === undefined ||
        payload.dueAt === undefined ||
        Date.parse(payload.startAt) <= Date.parse(payload.dueAt),
      { message: "task.create requires startAt to not exceed dueAt." },
    ),
}).strict();

export const TaskUpdateDetailsCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("task.updateDetails"),
  payload: z
    .object({
      taskId: TaskIdSchema,
      title: TaskTitleSchema.optional(),
      description: TaskDescriptionSchema.nullable().optional(),
      nextAction: TaskNextActionSchema.nullable().optional(),
      startAt: TaskInstantSchema.nullable().optional(),
      dueAt: TaskInstantSchema.nullable().optional(),
      priority: TaskPrioritySchema.nullable().optional(),
    })
    .strict()
    .refine(
      (payload) =>
        payload.title !== undefined ||
        payload.description !== undefined ||
        payload.nextAction !== undefined ||
        payload.startAt !== undefined ||
        payload.dueAt !== undefined ||
        payload.priority !== undefined,
      { message: "task.updateDetails requires at least one field change." },
    ),
}).strict();

const TaskStatusLabelSchema = z.string().trim().min(1).max(120);
export const TaskStatusSemanticsSchema = z.enum([
  "actionable",
  "waiting",
  "blocked",
  "paused",
]);

const FieldTypeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text") }).strict(),
  z.object({ kind: z.literal("number") }).strict(),
  z.object({ kind: z.literal("date") }).strict(),
  z
    .object({
      kind: z.literal("choice"),
      options: z
        .array(z.string().trim().min(1).max(80))
        .min(1)
        .max(24)
        .refine((options) => new Set(options).size === options.length, {
          message: "Choice options must be unique.",
        }),
    })
    .strict(),
]);

export const FieldValueSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("text"),
      value: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  z.object({ kind: z.literal("number"), value: z.number().finite() }).strict(),
  z
    .object({
      kind: z.literal("date"),
      value: z.iso.datetime({ offset: true }),
    })
    .strict(),
  z
    .object({ kind: z.literal("choice"), value: z.string().min(1).max(80) })
    .strict(),
]);

const TemplateTaskTitlesSchema = z
  .array(z.string().trim().min(1).max(500))
  .max(24);

export const TemplateCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("template.create"),
  payload: z
    .object({
      templateId: ProjectTemplateIdSchema,
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().min(1).max(2_000).optional(),
      taskTitles: TemplateTaskTitlesSchema.default([]),
      fieldIds: z.array(FieldDefinitionIdSchema).max(32).default([]),
    })
    .strict(),
}).strict();

export const TemplateRenameCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("template.rename"),
  payload: z
    .object({
      templateId: ProjectTemplateIdSchema,
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
}).strict();

export const TemplateUpdateContentsCommandSchema = CommandMetadataSchema.extend(
  {
    commandName: z.literal("template.updateContents"),
    payload: z
      .object({
        templateId: ProjectTemplateIdSchema,
        description: z.string().trim().min(1).max(2_000).nullable().optional(),
        taskTitles: TemplateTaskTitlesSchema.optional(),
        fieldIds: z.array(FieldDefinitionIdSchema).max(32).optional(),
      })
      .strict()
      .refine(
        (payload) =>
          payload.description !== undefined ||
          payload.taskTitles !== undefined ||
          payload.fieldIds !== undefined,
        { message: "template.updateContents requires at least one change." },
      ),
  },
).strict();

export const TemplateArchiveCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("template.archive"),
  payload: z.object({ templateId: ProjectTemplateIdSchema }).strict(),
}).strict();

export const TemplateRestoreCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("template.restore"),
  payload: z.object({ templateId: ProjectTemplateIdSchema }).strict(),
}).strict();

const AutomationRecipeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("complete_sets_status"),
      statusId: TaskStatusIdSchema,
    })
    .strict(),
  z.object({ kind: z.literal("waiting_review_signals") }).strict(),
]);

export const AutomationCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("automation.create"),
  payload: z
    .object({
      ruleId: AutomationRuleIdSchema,
      name: z.string().trim().min(1).max(120),
      recipe: AutomationRecipeSchema,
    })
    .strict(),
}).strict();

export const AutomationRenameCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("automation.rename"),
  payload: z
    .object({
      ruleId: AutomationRuleIdSchema,
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
}).strict();

export const AutomationSetStateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("automation.setState"),
  payload: z
    .object({
      ruleId: AutomationRuleIdSchema,
      state: z.enum(["active", "disabled"]),
    })
    .strict(),
}).strict();

export const AutomationSweepCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("automation.sweep"),
  payload: z.object({}).strict(),
}).strict();

// R12.7 / ADR-041 — scheduled recurrence generation. Mirrors automation.sweep:
// empty payload, no optimistic lock, bounded work, one journal entry.
// R12.6 / ADR-042 — records or clears the calendar block a Task owns. This is
// a recording command: it never touches a provider and never bypasses the
// exact single-use consent preview that governs every calendar write.
export const TaskSetCalendarBlockCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("task.setCalendarBlock"),
  payload: z
    .object({
      taskId: TaskIdSchema,
      block: z
        .object({
          ownedBlockExternalId: z.string().trim().min(1).max(500),
          calendarExternalId: z.string().trim().min(1).max(500),
          revision: z.string().trim().min(1).max(500),
          startsAt: z.iso.datetime({ offset: true }),
          endsAt: z.iso.datetime({ offset: true }),
        })
        .strict()
        .refine(
          (value) => Date.parse(value.endsAt) > Date.parse(value.startsAt),
          {
            error: "A reserved block must end after it starts.",
            path: ["endsAt"],
          },
        )
        // null releases Constellation's claim on the block.
        .nullable(),
    })
    .strict(),
}).strict();

export const RecurrenceSweepCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("recurrence.sweep"),
  payload: z.object({}).strict(),
}).strict();

export const ProjectApplyTemplateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("project.applyTemplate"),
  payload: z
    .object({
      projectId: ProjectIdSchema,
      templateId: ProjectTemplateIdSchema,
    })
    .strict(),
}).strict();

export const FieldDefCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("fieldDef.create"),
  payload: z
    .object({
      fieldId: FieldDefinitionIdSchema,
      targetKind: z.enum(["task", "project"]),
      label: z.string().trim().min(1).max(120),
      type: FieldTypeSchema,
    })
    .strict(),
}).strict();

export const FieldDefRenameCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("fieldDef.rename"),
  payload: z
    .object({
      fieldId: FieldDefinitionIdSchema,
      label: z.string().trim().min(1).max(120),
    })
    .strict(),
}).strict();

export const FieldDefArchiveCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("fieldDef.archive"),
  payload: z.object({ fieldId: FieldDefinitionIdSchema }).strict(),
}).strict();

export const FieldDefRestoreCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("fieldDef.restore"),
  payload: z.object({ fieldId: FieldDefinitionIdSchema }).strict(),
}).strict();

export const RecordSetFieldValueCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("record.setFieldValue"),
  payload: z
    .object({
      targetKind: z.enum(["task", "project"]),
      recordId: z.uuid(),
      fieldId: FieldDefinitionIdSchema,
      value: FieldValueSchema.nullable(),
    })
    .strict(),
}).strict();

export const TaskStatusCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("taskStatus.create"),
  payload: z
    .object({
      statusId: TaskStatusIdSchema,
      label: TaskStatusLabelSchema,
      operationalSemantics: TaskStatusSemanticsSchema,
      position: z.int().nonnegative().optional(),
    })
    .strict(),
}).strict();

export const TaskStatusRenameCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("taskStatus.rename"),
  payload: z
    .object({ statusId: TaskStatusIdSchema, label: TaskStatusLabelSchema })
    .strict(),
}).strict();

export const TaskStatusSetSemanticsCommandSchema = CommandMetadataSchema.extend(
  {
    commandName: z.literal("taskStatus.setSemantics"),
    payload: z
      .object({
        statusId: TaskStatusIdSchema,
        operationalSemantics: TaskStatusSemanticsSchema,
      })
      .strict(),
  },
).strict();

export const TaskStatusReorderCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("taskStatus.reorder"),
  payload: z
    .object({
      statusId: TaskStatusIdSchema,
      position: z.int().nonnegative(),
    })
    .strict(),
}).strict();

export const TaskStatusArchiveCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("taskStatus.archive"),
  payload: z.object({ statusId: TaskStatusIdSchema }).strict(),
}).strict();

export const TaskStatusRestoreCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("taskStatus.restore"),
  payload: z.object({ statusId: TaskStatusIdSchema }).strict(),
}).strict();

export const WorkspaceSetDefaultTaskStatusCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("workspace.setDefaultTaskStatus"),
    payload: z.object({ statusId: TaskStatusIdSchema }).strict(),
  }).strict();

export const TaskSetParentCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("task.setParent"),
  payload: z
    .object({
      taskId: TaskIdSchema,
      parentTaskId: TaskIdSchema.nullable(),
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
            direction: z.enum(["waiting_on_them", "we_owe"]).optional(),
            expectedAt: z.iso.datetime({ offset: true }).optional(),
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
  WorkspaceSetVoiceAudioRetentionCommandSchema,
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
  CaptureReportExceptionCommandSchema,
  CaptureResolveExceptionCommandSchema,
  CaptureWriteTranscriptCommandSchema,
  CaptureRequestAudioDeletionCommandSchema,
  CaptureConfirmAudioDeletionCommandSchema,
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
  SavedViewRenameCommandSchema,
  SavedViewUpdateCommandSchema,
  SavedViewDeleteCommandSchema,
  RecurrenceCreateCommandSchema,
  RecurrenceGenerateOccurrenceCommandSchema,
  ProjectCloseCommandSchema,
  ProjectReopenCommandSchema,
  RadarCandidateUpsertCommandSchema,
  RadarResolveCommandSchema,
  MeetingUpsertImportedCommandSchema,
  MeetingRouteCommandSchema,
  MeetingPromoteWorkItemCommandSchema,
  MeetingLinkParticipantsCommandSchema,
  ProjectUpdateOutcomeCommandSchema,
  TaskCreateCommandSchema,
  TaskUpdateDetailsCommandSchema,
  TaskSetParentCommandSchema,
  TemplateCreateCommandSchema,
  AutomationCreateCommandSchema,
  AutomationRenameCommandSchema,
  AutomationSetStateCommandSchema,
  AutomationSweepCommandSchema,
  RecurrenceSweepCommandSchema,
  TaskSetCalendarBlockCommandSchema,
  TemplateRenameCommandSchema,
  TemplateUpdateContentsCommandSchema,
  TemplateArchiveCommandSchema,
  TemplateRestoreCommandSchema,
  ProjectApplyTemplateCommandSchema,
  FieldDefCreateCommandSchema,
  FieldDefRenameCommandSchema,
  FieldDefArchiveCommandSchema,
  FieldDefRestoreCommandSchema,
  RecordSetFieldValueCommandSchema,
  TaskStatusCreateCommandSchema,
  TaskStatusRenameCommandSchema,
  TaskStatusSetSemanticsCommandSchema,
  TaskStatusReorderCommandSchema,
  TaskStatusArchiveCommandSchema,
  TaskStatusRestoreCommandSchema,
  WorkspaceSetDefaultTaskStatusCommandSchema,
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
