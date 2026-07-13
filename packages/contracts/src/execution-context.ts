import { z } from "zod";

import {
  CredentialIdSchema,
  GrantIdSchema,
  PrincipalIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
} from "./ids.js";

export const PrincipalKindSchema = z.enum([
  "human",
  "integration",
  "system",
  "agent",
]);
export type PrincipalKind = z.infer<typeof PrincipalKindSchema>;

export const RequestOriginSchema = z.enum([
  "desktop",
  "mobile",
  "import",
  "rule",
  "mcp",
  "maintenance",
]);
export type RequestOrigin = z.infer<typeof RequestOriginSchema>;

export const CapabilitySchema = z.enum([
  "workspace.createLocal",
  "workspace.rename",
  "workspace.bootstrapContext",
  "capture.submitText",
  "capture.routeAsTask",
  "capture.history",
  "project.create",
  "project.updateOutcome",
  "project.list",
  "task.setStatus",
  "task.complete",
  "task.reopen",
  "record.relate",
  "record.unrelate",
  "search.global",
  "cockpit.week",
  "activity.meaningful",
  "command.previewUndo",
  "command.undo",
  "task.list",
  "audit.receipt",
]);
export type Capability = z.infer<typeof CapabilitySchema>;

export const ExecutionContextSchema = z
  .object({
    principalId: PrincipalIdSchema,
    principalKind: PrincipalKindSchema,
    delegatingUserId: PrincipalIdSchema.optional(),
    credentialId: CredentialIdSchema,
    grantId: GrantIdSchema,
    policyVersion: z.int().positive(),
    workspaceId: WorkspaceIdSchema,
    spaceScope: z.array(SpaceIdSchema).min(1),
    capabilityScope: z.array(CapabilitySchema).min(1),
    origin: RequestOriginSchema,
    hostRun: z
      .object({
        runId: z.string().trim().min(1).max(200),
        parentRunId: z.string().trim().min(1).max(200).optional(),
        intent: z.string().trim().min(1).max(500).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;
