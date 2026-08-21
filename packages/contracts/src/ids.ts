import { z } from "zod";

const opaqueId = <Brand extends string>() => z.uuid().brand<Brand>();

export const WorkspaceIdSchema = opaqueId<"WorkspaceId">();
export type WorkspaceId = z.infer<typeof WorkspaceIdSchema>;

export const SpaceIdSchema = opaqueId<"SpaceId">();
export type SpaceId = z.infer<typeof SpaceIdSchema>;

export const PrincipalIdSchema = opaqueId<"PrincipalId">();
export type PrincipalId = z.infer<typeof PrincipalIdSchema>;

export const CredentialIdSchema = opaqueId<"CredentialId">();
export type CredentialId = z.infer<typeof CredentialIdSchema>;

export const GrantIdSchema = opaqueId<"GrantId">();
export type GrantId = z.infer<typeof GrantIdSchema>;

export const AgentRunIdSchema = opaqueId<"AgentRunId">();
export type AgentRunId = z.infer<typeof AgentRunIdSchema>;

export const AgentHandoffIdSchema = opaqueId<"AgentHandoffId">();
export type AgentHandoffId = z.infer<typeof AgentHandoffIdSchema>;

export const CommandIdSchema = opaqueId<"CommandId">();
export type CommandId = z.infer<typeof CommandIdSchema>;

export const CorrelationIdSchema = opaqueId<"CorrelationId">();
export type CorrelationId = z.infer<typeof CorrelationIdSchema>;

export const CausationIdSchema = opaqueId<"CausationId">();
export type CausationId = z.infer<typeof CausationIdSchema>;

export const CheckpointIdSchema = opaqueId<"CheckpointId">();
export type CheckpointId = z.infer<typeof CheckpointIdSchema>;

export const CaptureIdSchema = opaqueId<"CaptureId">();
export type CaptureId = z.infer<typeof CaptureIdSchema>;

export const CapturePayloadIdSchema = opaqueId<"CapturePayloadId">();
export type CapturePayloadId = z.infer<typeof CapturePayloadIdSchema>;

export const TaskIdSchema = opaqueId<"TaskId">();
export type TaskId = z.infer<typeof TaskIdSchema>;

export const ProjectIdSchema = opaqueId<"ProjectId">();
export type ProjectId = z.infer<typeof ProjectIdSchema>;

export const ProjectCheckInIdSchema = opaqueId<"ProjectCheckInId">();
export type ProjectCheckInId = z.infer<typeof ProjectCheckInIdSchema>;

export const DocumentIdSchema = opaqueId<"DocumentId">();
export type DocumentId = z.infer<typeof DocumentIdSchema>;

/**
 * A folder in the note tree. Its own id type rather than a `DocumentId`,
 * because a folder is not a document: it holds notes, it is never opened, and
 * nothing may address one where the other is expected (decision #30).
 */
export const FolderIdSchema = opaqueId<"FolderId">();
export type FolderId = z.infer<typeof FolderIdSchema>;

export const DocumentRevisionIdSchema = opaqueId<"DocumentRevisionId">();
export type DocumentRevisionId = z.infer<typeof DocumentRevisionIdSchema>;

export const KnowledgeSourceIdSchema = opaqueId<"KnowledgeSourceId">();
export type KnowledgeSourceId = z.infer<typeof KnowledgeSourceIdSchema>;

export const NamedDocumentVersionIdSchema =
  opaqueId<"NamedDocumentVersionId">();
export type NamedDocumentVersionId = z.infer<
  typeof NamedDocumentVersionIdSchema
>;

export const StrategicRecordIdSchema = opaqueId<"StrategicRecordId">();
export type StrategicRecordId = z.infer<typeof StrategicRecordIdSchema>;

export const RelationIdSchema = opaqueId<"RelationId">();
export type RelationId = z.infer<typeof RelationIdSchema>;

export const TaskStatusIdSchema = opaqueId<"TaskStatusId">();
export type TaskStatusId = z.infer<typeof TaskStatusIdSchema>;
export const FieldDefinitionIdSchema = opaqueId<"FieldDefinitionId">();
export type FieldDefinitionId = z.infer<typeof FieldDefinitionIdSchema>;
export const ProjectTemplateIdSchema = opaqueId<"ProjectTemplateId">();
export type ProjectTemplateId = z.infer<typeof ProjectTemplateIdSchema>;
export const AutomationRuleIdSchema = opaqueId<"AutomationRuleId">();
export type AutomationRuleId = z.infer<typeof AutomationRuleIdSchema>;

export const MembershipIdSchema = opaqueId<"MembershipId">();
export type MembershipId = z.infer<typeof MembershipIdSchema>;

export const SpaceGrantIdSchema = opaqueId<"SpaceGrantId">();
export type SpaceGrantId = z.infer<typeof SpaceGrantIdSchema>;

export const TaskAssignmentIdSchema = opaqueId<"TaskAssignmentId">();
export type TaskAssignmentId = z.infer<typeof TaskAssignmentIdSchema>;

export const CommentIdSchema = opaqueId<"CommentId">();
export type CommentId = z.infer<typeof CommentIdSchema>;

export const AttentionSignalIdSchema = opaqueId<"AttentionSignalId">();
export type AttentionSignalId = z.infer<typeof AttentionSignalIdSchema>;

export const EventIdSchema = opaqueId<"EventId">();
export type EventId = z.infer<typeof EventIdSchema>;

export const AuditReceiptIdSchema = opaqueId<"AuditReceiptId">();
export type AuditReceiptId = z.infer<typeof AuditReceiptIdSchema>;

export const OutboxEntryIdSchema = opaqueId<"OutboxEntryId">();
export type OutboxEntryId = z.infer<typeof OutboxEntryIdSchema>;

export const QueryIdSchema = opaqueId<"QueryId">();
export type QueryId = z.infer<typeof QueryIdSchema>;

export const DeviceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .brand<"DeviceId">();
export type DeviceId = z.infer<typeof DeviceIdSchema>;

// The identity of a row in a system outside this graph — a Jamie participant, a
// folder slug, a spreadsheet key. Compared exactly and case-sensitively, never
// dereferenced here, so it carries no format beyond being a bounded non-empty
// string: the contract cannot enumerate the systems it will be asked to import
// from, and refusing a shape it merely did not anticipate is the least
// repairable refusal an agent can be handed.
//
// Unbranded on purpose (unlike DeviceId above): every value comes from a source
// adapter that has no reason to know about this type, and branding would buy a
// cast at each of them and nothing else. The bound matches the participant and
// decision externalIds in `meeting-loop.ts` because it is the same concept —
// and it lives here, once, so the four relationship commands do not become the
// next restatement of a shape that then drifts.
export const ExternalIdSchema = z.string().trim().min(1).max(500);
export type ExternalId = z.infer<typeof ExternalIdSchema>;

export const RecordIdSchema = z.uuid().brand<"RecordId">();
export type RecordId = z.infer<typeof RecordIdSchema>;
