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
import {
  AgentAccessPresetSchema,
  CapabilitySchema,
} from "./execution-context.js";
import {
  ImportedMeetingSchema,
  MeetingWorkItemKindSchema,
  MeetingWorkItemStateSchema,
  MeetingWorkItemTitleSchema,
} from "./meeting-loop.js";
import { RecordNarrativeSchema } from "./narrative.js";

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

export const AgentGrantCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("agent.grantCreate"),
  payload: z
    .object({
      grantId: GrantIdSchema,
      membershipId: MembershipIdSchema,
      agentPrincipalId: PrincipalIdSchema,
      displayName: z.string().trim().min(1).max(120),
      preset: AgentAccessPresetSchema,
      // Bounded by the vocabulary itself: a `full_access` preset carries every
      // delegable capability, so a fixed cap would refuse the product's own
      // preset the moment the enum outgrew it (ADR-046 §4).
      capabilityScope: z
        .array(CapabilitySchema)
        .min(1)
        .max(CapabilitySchema.options.length),
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

/**
 * A grant's capabilityScope is a snapshot taken when it was issued, and the
 * kernel authorizes against that snapshot — so an upgrade that adds a
 * capability to a preset never reaches a grant already in the field. This is
 * the lever that closes it: a human re-states the scope, deliberately, with an
 * audit receipt. The scope stays a snapshot on purpose; resolving the preset
 * live would widen every issued grant on every release without anyone
 * deciding to.
 *
 * The new scope replaces the old one whole rather than adding to it, so the
 * command can narrow as well as widen, and so its outcome does not depend on
 * what the grant happened to hold when it was sent.
 */
export const AgentGrantSetScopeCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("agent.grantSetScope"),
  payload: z
    .object({
      grantId: GrantIdSchema,
      preset: AgentAccessPresetSchema,
      capabilityScope: z
        .array(CapabilitySchema)
        .min(1)
        .max(CapabilitySchema.options.length),
    })
    .strict(),
}).strict();
export type AgentGrantSetScopeCommand = z.infer<
  typeof AgentGrantSetScopeCommandSchema
>;

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
      projectId: ProjectIdSchema.optional(),
      spaceId: SpaceIdSchema,
      title: z.string().trim().min(1).max(500),
      intendedOutcome: RecordNarrativeSchema.optional(),
    })
    .strict(),
}).strict();

export const ProjectRemoveCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("project.remove"),
  payload: z.object({ projectId: ProjectIdSchema }).strict(),
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

export const DocumentRemoveCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("document.remove"),
  payload: z.object({ documentId: DocumentIdSchema }).strict(),
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

export const KnowledgeSourceRemoveCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("knowledge.sourceRemove"),
  payload: z.object({ sourceId: KnowledgeSourceIdSchema }).strict(),
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

/**
 * An agent that wrote the wrong record needs a way back that does not depend on
 * a checkpoint it may already have left behind (AGENTS.md: agent mutations must
 * be reversible). Removal refuses while anything still points at the record, so
 * it cannot orphan the graph, and it is itself compensable.
 */
export const RelationshipOrganizationRemoveCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("relationship.organizationRemove"),
    payload: z.object({ organizationId: StrategicRecordIdSchema }).strict(),
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

export const RelationshipPersonRemoveCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("relationship.personRemove"),
    payload: z.object({ personId: StrategicRecordIdSchema }).strict(),
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

export const OpportunityRemoveCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("opportunity.remove"),
  payload: z.object({ opportunityId: StrategicRecordIdSchema }).strict(),
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

export const OpportunityOfferRemoveCommandSchema = CommandMetadataSchema.extend(
  {
    commandName: z.literal("opportunity.offerRemove"),
    payload: z.object({ offerId: StrategicRecordIdSchema }).strict(),
  },
).strict();

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

export const RelationshipFactRemoveCommandSchema = CommandMetadataSchema.extend(
  {
    commandName: z.literal("relationship.factRemove"),
    payload: z.object({ factId: StrategicRecordIdSchema }).strict(),
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

export const DecisionRemoveCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("decision.remove"),
  payload: z.object({ decisionId: StrategicRecordIdSchema }).strict(),
}).strict();

export const AreaCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("area.create"),
  payload: z
    .object({
      areaId: StrategicRecordIdSchema,
      spaceId: SpaceIdSchema,
      title: z.string().trim().min(1).max(500),
      responsibility: RecordNarrativeSchema.optional(),
    })
    .strict(),
}).strict();

export const AreaUpdateResponsibilityCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("area.updateResponsibility"),
    payload: z
      .object({
        areaId: StrategicRecordIdSchema,
        responsibility: RecordNarrativeSchema,
      })
      .strict(),
  }).strict();

export const AreaRemoveCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("area.remove"),
  payload: z.object({ areaId: StrategicRecordIdSchema }).strict(),
}).strict();

export const InitiativeCreateCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("initiative.create"),
  payload: z
    .object({
      initiativeId: StrategicRecordIdSchema,
      spaceId: SpaceIdSchema,
      title: z.string().trim().min(1).max(500),
      intendedOutcome: RecordNarrativeSchema.optional(),
    })
    .strict(),
}).strict();

export const InitiativeUpdateOutcomeCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("initiative.updateOutcome"),
    payload: z
      .object({
        initiativeId: StrategicRecordIdSchema,
        intendedOutcome: RecordNarrativeSchema,
      })
      .strict(),
  }).strict();

export const InitiativeRemoveCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("initiative.remove"),
  payload: z.object({ initiativeId: StrategicRecordIdSchema }).strict(),
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

// R13.5 / ADR-044 — typed relation-path conditions: a closed vocabulary rather
// than a query language. Each names a bounded path from the Task and a
// predicate on the record at its end; the kernel evaluates them, and an unknown
// path or field is a parse-time rejection, never a silently-dropped filter.
//
// This lives beside the saved-view vocabulary, and is imported by `task.list`
// rather than restated there, because a saved view and a task query must mean
// exactly the same thing by a relation condition — ADR-045. It sits in the
// command module only because `query.ts` imports from here and not the reverse.
//
// The id lists hold 100, matching the deprecated `projectIds`/`areaIds`/
// `initiativeIds` keys they are translated from. They were 50, and the
// translation builds a condition directly rather than through this schema, so a
// legacy filter naming 51+ ids stored a view the strict projection could no
// longer parse — the same read-path outage that motivated the shared schema.
// The two bounds must not drift apart again.
export const RelationConditionSchema = z.discriminatedUnion("path", [
  z
    .object({
      path: z.literal("project"),
      predicate: z.discriminatedUnion("field", [
        z
          .object({
            field: z.literal("id"),
            in: z.array(ProjectIdSchema).min(1).max(100),
          })
          .strict(),
        z
          .object({
            field: z.literal("lifecycle"),
            equals: z.enum(["active", "closed"]),
          })
          .strict(),
      ]),
    })
    .strict(),
  // Two-hop: Task→Project→Area via the project_serves_area work link.
  z
    .object({
      path: z.literal("project.area"),
      predicate: z.discriminatedUnion("field", [
        z
          .object({
            field: z.literal("id"),
            in: z.array(StrategicRecordIdSchema).min(1).max(100),
          })
          .strict(),
        z
          .object({
            field: z.literal("state"),
            equals: z.enum(["active", "archived"]),
          })
          .strict(),
      ]),
    })
    .strict(),
  // Two-hop: Task→Project→Initiative via project_advances_initiative.
  z
    .object({
      path: z.literal("project.initiative"),
      predicate: z.discriminatedUnion("field", [
        z
          .object({
            field: z.literal("id"),
            in: z.array(StrategicRecordIdSchema).min(1).max(100),
          })
          .strict(),
        z
          .object({
            field: z.literal("state"),
            equals: z.enum(["active", "closed"]),
          })
          .strict(),
      ]),
    })
    .strict(),
  // Two-hop: Task→Project→Organization via the opportunity bridge
  // (opportunity.projectIds + opportunity.organizationId). The bridge is
  // many-to-many, so a match is existential (ADR-044 §3).
  z
    .object({
      path: z.literal("project.organization"),
      predicate: z.discriminatedUnion("field", [
        z
          .object({
            field: z.literal("id"),
            in: z.array(StrategicRecordIdSchema).min(1).max(100),
          })
          .strict(),
        z
          .object({
            field: z.literal("relationshipState"),
            equals: z.enum(["prospect", "active", "inactive"]),
          })
          .strict(),
      ]),
    })
    .strict(),
]);

export const RelationConditionsSchema = z
  .array(RelationConditionSchema)
  .min(1)
  .max(10);

export type RelationCondition = z.infer<typeof RelationConditionSchema>;

// The one saved-view filter vocabulary. Every projection that can carry a
// saved view reuses this schema rather than restating it: R13.3 added `fields`
// and `groupBy` to the command and to the Work overview but not to the
// strategic-record projection, and because query results are parsed strictly,
// an ordinary grouped view made `relationship.workspace` throw. Restating the
// shape is what let the two drift, so there is now one shape to extend.
//
// Because this schema gates both writes and reads, it is ADDITIVE-ONLY: adding
// a key or widening a bound is safe, but *lowering* a bound would retroactively
// make already-stored views fail to project and reproduce that same outage. To
// tighten a limit, narrow it at the command boundary while leaving the
// projection on the older, wider bound.
export const SavedViewFiltersSchema = z
  .object({
    operationalStates: z
      .array(z.enum(["actionable", "waiting", "blocked"]))
      .max(3)
      .optional(),
    // R13.5 / ADR-045 — relation filters on a saved view. Evaluated kernel-side
    // by the same evaluator `task.list` uses, so a view means the same thing to
    // the desktop and to an MCP operator.
    relationConditions: RelationConditionsSchema.optional(),
    // DEPRECATED, still accepted, never written. These three were accepted and
    // persisted since R12.4 while no consumer read them — a relation filter
    // that silently did nothing, which is exactly what the "Filtr po relacji"
    // acceptance test forbids. They are now normalized into the equivalent
    // `relationConditions` on write, and translated on read for records written
    // before that. They are NOT removed from this schema: stored payloads are
    // never validated on load (`parsePayload` is JSON.parse plus a cast), so
    // dropping the keys would make an already-stored view fail to project —
    // reintroducing the outage PR #95 fixed.
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

export const SavedViewGroupBySchema = z.union([
  z.literal("status"),
  z.literal("priority"),
  z.object({ fieldId: FieldDefinitionIdSchema }).strict(),
]);

export const SavedViewLayoutSchema = z.enum([
  "list",
  "board",
  "timeline",
  "calendar",
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
      layout: SavedViewLayoutSchema.optional(),
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
      layout: SavedViewLayoutSchema.optional(),
    })
    .strict()
    .refine(
      (payload) =>
        payload.filters !== undefined ||
        payload.sort !== undefined ||
        payload.groupBy !== undefined ||
        payload.layout !== undefined,
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

// R14.3 / ADR-047 — the three work-item corrections the desktop has always
// made through IPC. They operate on the meeting strategic record, because a
// remote operator reaches the Hub, where the device meeting-loop table does
// not exist.

export const MeetingEditWorkItemCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("meeting.editWorkItem"),
  payload: z
    .object({
      meetingId: StrategicRecordIdSchema,
      workItemId: z.uuid(),
      // The work item's own version, separate from the meeting's: two
      // operators correcting different items must not conflict.
      expectedWorkItemVersion: z.int().positive(),
      title: MeetingWorkItemTitleSchema,
      state: MeetingWorkItemStateSchema,
    })
    .strict(),
}).strict();

export const MeetingCorrectWorkItemResponsibilityCommandSchema =
  CommandMetadataSchema.extend({
    commandName: z.literal("meeting.correctWorkItemResponsibility"),
    payload: z
      .object({
        meetingId: StrategicRecordIdSchema,
        workItemId: z.uuid(),
        expectedWorkItemVersion: z.int().positive(),
        // null clears the override and returns the item to its source
        // responsibility; a value overrides it.
        name: z.string().trim().min(1).max(300).nullable(),
      })
      .strict(),
  }).strict();

export const MeetingAddWorkItemCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("meeting.addWorkItem"),
  payload: z
    .object({
      meetingId: StrategicRecordIdSchema,
      workItemId: z.uuid(),
      kind: MeetingWorkItemKindSchema,
      title: MeetingWorkItemTitleSchema,
    })
    .strict(),
}).strict();

export const ProjectUpdateOutcomeCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("project.updateOutcome"),
  payload: z
    .object({
      projectId: ProjectIdSchema,
      intendedOutcome: RecordNarrativeSchema,
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
      attachmentSourceIds: z.array(KnowledgeSourceIdSchema).max(20).optional(),
    })
    .strict()
    .refine(
      (payload) =>
        payload.title !== undefined ||
        payload.description !== undefined ||
        payload.nextAction !== undefined ||
        payload.startAt !== undefined ||
        payload.dueAt !== undefined ||
        payload.priority !== undefined ||
        payload.attachmentSourceIds !== undefined,
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

export const FieldDefinitionTypeSchema = z.union([
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
  z
    .object({
      kind: z.literal("formula"),
      operator: z.literal("sum"),
      fieldIds: z.array(FieldDefinitionIdSchema).min(1).max(16),
    })
    .strict(),
  z.discriminatedUnion("operation", [
    z
      .object({
        kind: z.literal("rollup"),
        relationPath: z.literal("task.subtasks"),
        operation: z.literal("count"),
      })
      .strict(),
    z
      .object({
        kind: z.literal("rollup"),
        relationPath: z.literal("task.subtasks"),
        operation: z.literal("sum"),
        fieldId: FieldDefinitionIdSchema,
      })
      .strict(),
  ]),
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
      type: FieldDefinitionTypeSchema,
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

// R12.7 / ADR-043 — user-facing Task removal. A soft delete: it sets
// recordState to "removed" and is reversible by undo. It never hard-deletes
// and it refuses a Task that still has active subtasks.
export const TaskRemoveCommandSchema = CommandMetadataSchema.extend({
  commandName: z.literal("task.remove"),
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
      attachmentSourceIds: z.array(KnowledgeSourceIdSchema).max(20).optional(),
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
      attachmentSourceIds: z.array(KnowledgeSourceIdSchema).max(20).optional(),
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
  AgentGrantSetScopeCommandSchema,
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
  ProjectRemoveCommandSchema,
  DocumentCreateCommandSchema,
  DocumentRemoveCommandSchema,
  KnowledgeSourceCreateCommandSchema,
  KnowledgeSourceRemoveCommandSchema,
  KnowledgeSourceUpdateCommandSchema,
  KnowledgeDocumentSetEvidenceCommandSchema,
  KnowledgeNamedVersionCreateCommandSchema,
  KnowledgeNamedVersionVoidCommandSchema,
  RelationshipOrganizationCreateCommandSchema,
  RelationshipOrganizationRemoveCommandSchema,
  RelationshipPersonCreateCommandSchema,
  RelationshipPersonRemoveCommandSchema,
  OpportunityCreateCommandSchema,
  OpportunityRemoveCommandSchema,
  OpportunityOfferCreateCommandSchema,
  OpportunityOfferRemoveCommandSchema,
  OpportunityLinkOutcomesCommandSchema,
  RelationshipRenewalCreateCommandSchema,
  RelationshipRenewalResolveCommandSchema,
  RelationshipFactCreateCommandSchema,
  RelationshipFactRemoveCommandSchema,
  DecisionCreateCommandSchema,
  DecisionRemoveCommandSchema,
  DecisionSupersedeCommandSchema,
  DecisionResolveImpactCommandSchema,
  AreaCreateCommandSchema,
  AreaRemoveCommandSchema,
  AreaUpdateResponsibilityCommandSchema,
  InitiativeCreateCommandSchema,
  InitiativeRemoveCommandSchema,
  InitiativeUpdateOutcomeCommandSchema,
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
  MeetingEditWorkItemCommandSchema,
  MeetingCorrectWorkItemResponsibilityCommandSchema,
  MeetingAddWorkItemCommandSchema,
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
  TaskRemoveCommandSchema,
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

/**
 * ADR-048 — a bounded batch. Its own envelope rather than a command whose
 * payload holds commands: nesting the union inside itself would make it
 * recursive, and the ADR-039 operation catalog generates JSON Schema from that
 * union.
 */
export const MAX_BATCH_COMMANDS = 100;

export const BatchEnvelopeBaseSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    batchId: z.uuid(),
    workspaceId: WorkspaceIdSchema,
    correlationId: CorrelationIdSchema,
    // `preview` runs every item through the executor inside one transaction
    // and rolls it back; `apply` executes each item in its own transaction,
    // in order, stopping at the first non-success.
    mode: z.enum(["preview", "apply"]),
    // Stamped onto every item, so scoped revert compensates the batch —
    // including a partially applied one — through the existing machinery.
    checkpointId: CheckpointIdSchema.optional(),
    commands: z.array(CommandEnvelopeSchema).min(1).max(MAX_BATCH_COMMANDS),
  })
  .strict();

export const BatchEnvelopeSchema = BatchEnvelopeBaseSchema.refine(
  (value) =>
    value.commands.every(
      (command) => command.workspaceId === value.workspaceId,
    ),
  { error: "Every batched command must target the batch's workspace." },
).refine(
  (value) =>
    new Set(value.commands.map((command) => command.commandId)).size ===
    value.commands.length,
  { error: "Batched commands must have distinct command ids." },
);
export type BatchEnvelope = z.infer<typeof BatchEnvelopeSchema>;
