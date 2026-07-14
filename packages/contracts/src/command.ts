import { z } from "zod";

import {
  CausationIdSchema,
  CaptureIdSchema,
  CheckpointIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  DeviceIdSchema,
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
} from "./ids.js";

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
  CaptureSubmitTextCommandSchema,
  CaptureRouteAsTaskCommandSchema,
  ProjectCreateCommandSchema,
  ProjectUpdateOutcomeCommandSchema,
  TaskSetStatusCommandSchema,
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
