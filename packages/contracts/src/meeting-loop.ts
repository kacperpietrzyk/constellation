import { z } from "zod";

import {
  PrincipalIdSchema,
  ProjectIdSchema,
  SpaceIdSchema,
  TaskIdSchema,
  WorkspaceIdSchema,
} from "./ids.js";

export const CalendarCapabilitySchema = z
  .object({
    platform: z.enum(["macos", "windows", "other"]),
    provider: z.enum(["eventkit", "unconfigured"]),
    availability: z.enum([
      "available",
      "permission_required",
      "permission_denied",
      "provider_unavailable",
      "offline",
      "error",
    ]),
    canRead: z.boolean(),
    canWriteOwnedBlocks: z.boolean(),
    detailCode: z.string().trim().min(1).max(120),
  })
  .strict();
export type CalendarCapability = z.infer<typeof CalendarCapabilitySchema>;

export const CalendarAttendeeSchema = z
  .object({
    externalId: z.string().trim().min(1).max(500).optional(),
    name: z.string().trim().min(1).max(300),
    email: z.email().optional(),
    organizer: z.boolean(),
    response: z
      .enum(["accepted", "declined", "tentative", "needs_action", "unknown"])
      .default("unknown"),
  })
  .strict();

export const CalendarEventProjectionSchema = z
  .object({
    provider: z.enum(["eventkit", "fixture"]),
    calendarExternalId: z.string().trim().min(1).max(500),
    eventExternalId: z.string().trim().min(1).max(1000),
    revision: z.string().trim().min(1).max(500),
    title: z.string().trim().min(1).max(500),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    isAllDay: z.boolean(),
    location: z.string().trim().max(1000).optional(),
    attendees: z.array(CalendarAttendeeSchema).max(500),
  })
  .strict()
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    error: "Calendar event end must be after its start.",
    path: ["endsAt"],
  });
export type CalendarEventProjection = z.infer<
  typeof CalendarEventProjectionSchema
>;

export const MeetingEvidenceSchema = z
  .object({
    kind: z.enum([
      "project",
      "task",
      "waiting",
      "decision",
      "note",
      "prior_meeting",
    ]),
    recordId: z.uuid(),
    spaceId: SpaceIdSchema,
    label: z.string().trim().min(1).max(500),
    fact: z.string().trim().min(1).max(2000),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type MeetingEvidence = z.infer<typeof MeetingEvidenceSchema>;

export const FactualMeetingBriefSchema = z
  .object({
    eventExternalId: z.string(),
    orientation: z.array(MeetingEvidenceSchema).max(20),
    openLoops: z.array(MeetingEvidenceSchema).max(20),
    relevantSources: z.array(MeetingEvidenceSchema).max(20),
    generatedAt: z.iso.datetime({ offset: true }),
    deterministic: z.literal(true),
  })
  .strict();
export type FactualMeetingBrief = z.infer<typeof FactualMeetingBriefSchema>;

export const JamieActionItemSchema = z
  .object({
    externalTaskId: z.string().trim().min(1).max(500).optional(),
    content: z.string().trim().min(1).max(4000),
    completed: z.boolean(),
    assigneeName: z.string().trim().min(1).max(300).optional(),
    assigneeEmail: z.email().optional(),
    dueAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export const NormalizedJamieMeetingSchema = z
  .object({
    schemaVersion: z.literal(1),
    connectionId: z.string().trim().min(1).max(500),
    externalMeetingId: z.string().trim().min(1).max(500),
    sourceCreatedAt: z.iso.datetime({ offset: true }).optional(),
    receivedAt: z.iso.datetime({ offset: true }),
    title: z.string().trim().min(1).max(500).nullable(),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }).optional(),
    calendarEventId: z.string().trim().min(1).max(1000).optional(),
    summaryMarkdown: z.string().max(1_000_000).optional(),
    transcriptMarkdown: z.string().max(5_000_000).optional(),
    participants: z
      .array(
        z
          .object({
            externalId: z.string().trim().min(1).max(500),
            name: z.string().trim().min(1).max(300),
            email: z.email().optional(),
          })
          .strict(),
      )
      .max(500),
    actionItems: z.array(JamieActionItemSchema).max(1000),
    actionItemsComplete: z.boolean().default(true),
    decisions: z
      .array(
        z
          .object({
            externalId: z.string().trim().min(1).max(500),
            text: z.string().trim().min(1).max(4000),
          })
          .strict(),
      )
      .max(500)
      .default([]),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type NormalizedJamieMeeting = z.infer<
  typeof NormalizedJamieMeetingSchema
>;

export const JamieApiMeetingSchema = z
  .object({
    id: z.string().trim().min(1).max(500),
    title: z.string().trim().min(1).max(500),
    generatedTitle: z.string().trim().min(1).max(500).nullable().optional(),
    startTime: z.iso.datetime({ offset: true }),
    endTime: z.iso.datetime({ offset: true }).nullable(),
    locked: z.boolean().optional(),
    summary: z
      .object({
        markdown: z.string().max(1_000_000),
        html: z.string().max(1_000_000),
        short: z.string().max(10_000),
      })
      .strict()
      .nullable()
      .optional(),
    transcript: z.string().max(5_000_000).nullable().optional(),
    transcriptInfo: z
      .object({
        truncated: z.boolean(),
        totalBytes: z.int().nonnegative().optional(),
        returnedBytes: z.int().nonnegative().optional(),
        nextCursor: z.string().nullable().optional(),
        hint: z.string().max(2_000).optional(),
      })
      .strict()
      .optional(),
    participants: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(500),
            name: z.string().trim().min(1).max(300),
            email: z.email().nullable(),
          })
          .strict(),
      )
      .max(500),
    tasks: z
      .array(
        z
          .object({
            content: z.string().trim().min(1).max(4000),
            completed: z.boolean(),
            assignee: z
              .object({
                name: z.string().trim().min(1).max(300),
                email: z.email().nullable(),
              })
              .strict()
              .nullable(),
          })
          .strict(),
      )
      .max(1000),
    event: z
      .object({
        id: z.string().trim().min(1).max(1000).nullable(),
        externalId: z.string().trim().min(1).max(1000).nullable(),
        title: z.string().trim().min(1).max(500),
        scheduledTime: z.iso.datetime({ offset: true }),
        endTime: z.iso.datetime({ offset: true }).nullable(),
        attendees: z.array(z.unknown()).max(1000),
      })
      .strict()
      .nullable()
      .optional(),
    tags: z.array(z.unknown()).max(500).default([]),
    user: z.object({ id: z.string(), email: z.email() }).strict().optional(),
  })
  .strict();
export type JamieApiMeeting = z.infer<typeof JamieApiMeetingSchema>;

export const JamieApiTaskSchema = z
  .object({
    id: z.string().trim().min(1).max(500),
    text: z.string().trim().min(1).max(4000),
    completed: z.boolean(),
    assignee: z
      .object({
        id: z.string().nullable().optional(),
        name: z.string().trim().min(1).max(300),
        email: z.email().nullable(),
      })
      .strict()
      .nullable(),
    meetingId: z.string().trim().min(1).max(500),
    meetingTitle: z.string().nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    userId: z.string().trim().min(1).max(500),
  })
  .strict();
export type JamieApiTask = z.infer<typeof JamieApiTaskSchema>;

export const MeetingWorkItemSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(["task", "waiting", "decision", "note", "follow_up"]),
    sourceExternalId: z.string().trim().min(1).max(500),
    title: z.string().trim().min(1).max(4000),
    state: z.enum([
      "open",
      "completed",
      "dismissed",
      "withdrawn",
      "conflicted",
    ]),
    sourceControlled: z.boolean(),
    locallyModified: z.boolean(),
    sourceValueInConflict: z.string().max(4000).optional(),
    taskId: TaskIdSchema.optional(),
    projectId: ProjectIdSchema.optional(),
    version: z.int().positive(),
  })
  .strict();
export type MeetingWorkItem = z.infer<typeof MeetingWorkItemSchema>;

export const ImportedMeetingSchema = z
  .object({
    id: z.uuid(),
    workspaceId: WorkspaceIdSchema,
    spaceId: SpaceIdSchema,
    connectionId: z.string(),
    externalMeetingId: z.string(),
    title: z.string().nullable(),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }).optional(),
    calendarEventId: z.string().optional(),
    summaryMarkdown: z.string().optional(),
    transcriptMarkdown: z.string().optional(),
    participants: z.array(
      z
        .object({
          externalId: z.string(),
          name: z.string(),
          email: z.email().optional(),
        })
        .strict(),
    ),
    workItems: z.array(MeetingWorkItemSchema),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    triage: z.enum(["ready", "partial", "conflicted", "needs_review"]),
    missingComponents: z.array(z.enum(["action_items"])),
    version: z.int().positive(),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type ImportedMeeting = z.infer<typeof ImportedMeetingSchema>;

export const MeetingImportOutcomeSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.enum(["applied", "corrected", "partial", "conflicted"]),
      meeting: ImportedMeetingSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal("no_change"),
      meeting: ImportedMeetingSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal("rejected"),
      code: z.enum(["contract_invalid", "unauthorized", "workspace_mismatch"]),
    })
    .strict(),
]);
export type MeetingImportOutcome = z.infer<typeof MeetingImportOutcomeSchema>;

export const CalendarBlockDraftSchema = z
  .object({
    calendarExternalId: z.string().trim().min(1).max(500),
    ownedBlockExternalId: z.string().trim().min(1).max(500),
    title: z.string().trim().min(1).max(500),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    expectedRevision: z.string().trim().min(1).max(500).nullable(),
    sourceRecordIds: z
      .array(z.string().trim().min(1).max(1000))
      .min(1)
      .max(100),
  })
  .strict()
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    error: "Calendar block end must be after its start.",
    path: ["endsAt"],
  });
export type CalendarBlockDraft = z.infer<typeof CalendarBlockDraftSchema>;

export const CalendarWritePreviewSchema = z
  .object({
    previewId: z.uuid(),
    consentToken: z.string().trim().min(32).max(500),
    workspaceId: WorkspaceIdSchema,
    principalId: PrincipalIdSchema,
    blocks: z.array(CalendarBlockDraftSchema).min(1).max(100),
    exactDigest: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.iso.datetime({ offset: true }),
    state: z.enum(["pending", "consumed", "stale", "expired"]),
  })
  .strict();
export type CalendarWritePreview = z.infer<typeof CalendarWritePreviewSchema>;

export const MeetingLoopSurfaceSchema = z
  .object({
    capability: CalendarCapabilitySchema,
    upcoming: z.array(
      z
        .object({
          event: CalendarEventProjectionSchema,
          brief: FactualMeetingBriefSchema,
        })
        .strict(),
    ),
    completed: z.array(ImportedMeetingSchema),
    freshness: z.enum(["current", "partial", "offline"]),
    generatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type MeetingLoopSurface = z.infer<typeof MeetingLoopSurfaceSchema>;
