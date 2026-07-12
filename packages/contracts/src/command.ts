import { z } from "zod";

import {
  CausationIdSchema,
  CheckpointIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  DeviceIdSchema,
  PrincipalIdSchema,
  SpaceIdSchema,
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

export const CommandEnvelopeSchema = z.discriminatedUnion("commandName", [
  WorkspaceCreateLocalCommandSchema,
  WorkspaceRenameCommandSchema,
  CaptureSubmitTextCommandSchema,
]);
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
export type CommandName = CommandEnvelope["commandName"];
