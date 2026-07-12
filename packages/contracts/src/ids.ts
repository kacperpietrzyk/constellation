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

export const MembershipIdSchema = opaqueId<"MembershipId">();
export type MembershipId = z.infer<typeof MembershipIdSchema>;

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

export const RecordIdSchema = z.uuid().brand<"RecordId">();
export type RecordId = z.infer<typeof RecordIdSchema>;
