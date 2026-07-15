import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

import {
  MeetingLoopService,
  type CalendarReadResult,
  type CalendarReader,
  type CalendarWriter,
  type MeetingLoopAuthorization,
} from "@constellation/application";
import {
  CalendarCapabilitySchema,
  CalendarEventProjectionSchema,
  type CalendarBlockDraft,
  type ExecutionContext,
} from "@constellation/contracts";
import type { SqliteApplicationStore } from "@constellation/local-store";

export type CalendarHelperRunner = (
  command: "read" | "request-access" | "write",
  payload: unknown,
) => Promise<unknown>;

export const createCalendarHelperRunner =
  (helperPath: string): CalendarHelperRunner =>
  (command, payload) =>
    new Promise((resolve, reject) => {
      execFile(
        helperPath,
        [
          command,
          Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
        ],
        {
          cwd: path.dirname(helperPath),
          encoding: "utf8",
          env: { LANG: "C", LC_ALL: "C" },
          maxBuffer: 4 * 1024 * 1024,
          shell: false,
          timeout: command === "request-access" ? 35_000 : 15_000,
          windowsHide: true,
        },
        (error, stdout) => {
          if (error !== null) {
            reject(error);
            return;
          }
          try {
            resolve(JSON.parse(stdout) as unknown);
          } catch (parseError) {
            reject(parseError);
          }
        },
      );
    });

const unavailable = (platform: NodeJS.Platform): CalendarReadResult => ({
  capability: CalendarCapabilitySchema.parse({
    platform: platform === "win32" ? "windows" : "other",
    provider: "unconfigured",
    availability: "provider_unavailable",
    canRead: false,
    canWriteOwnedBlocks: false,
    detailCode:
      platform === "win32"
        ? "windows_provider_not_configured"
        : "calendar_provider_not_available",
  }),
  events: [],
  freshness: "partial",
});

export class NativeCalendarAdapter implements CalendarReader, CalendarWriter {
  public constructor(
    private readonly platform: NodeJS.Platform,
    private readonly run: CalendarHelperRunner | undefined,
  ) {}

  public async readUpcoming(input: {
    readonly from: string;
    readonly to: string;
  }): Promise<CalendarReadResult> {
    if (this.platform !== "darwin" || this.run === undefined)
      return unavailable(this.platform);
    try {
      const response = (await this.run("read", input)) as Record<
        string,
        unknown
      >;
      const capability = CalendarCapabilitySchema.parse(response.capability);
      const events = Array.isArray(response.events)
        ? response.events.map((event) =>
            CalendarEventProjectionSchema.parse(event),
          )
        : [];
      return {
        capability,
        events,
        freshness:
          capability.availability === "available" ? "current" : "partial",
      };
    } catch {
      return {
        capability: CalendarCapabilitySchema.parse({
          platform: "macos",
          provider: "eventkit",
          availability: "error",
          canRead: false,
          canWriteOwnedBlocks: false,
          detailCode: "eventkit_helper_failed",
        }),
        events: [],
        freshness: "partial",
      };
    }
  }

  public async writeOwnedBlocks(input: {
    readonly blocks: readonly CalendarBlockDraft[];
  }): Promise<
    | { readonly outcome: "applied"; readonly revisions: readonly string[] }
    | {
        readonly outcome: "rejected";
        readonly code:
          | "permission_denied"
          | "provider_unavailable"
          | "offline"
          | "stale_revision"
          | "provider_error";
      }
  > {
    if (this.platform !== "darwin" || this.run === undefined)
      return { outcome: "rejected", code: "provider_unavailable" };
    try {
      const response = (await this.run("write", input)) as Record<
        string,
        unknown
      >;
      if (response.outcome === "applied" && Array.isArray(response.revisions)) {
        return {
          outcome: "applied",
          revisions: response.revisions.filter(
            (value): value is string => typeof value === "string",
          ),
        };
      }
      const code = response.code;
      if (
        code === "permission_denied" ||
        code === "provider_unavailable" ||
        code === "offline" ||
        code === "stale_revision"
      ) {
        return { outcome: "rejected", code };
      }
      return { outcome: "rejected", code: "provider_error" };
    } catch {
      return { outcome: "rejected", code: "provider_error" };
    }
  }
}

const fingerprint = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const deterministicUuid = (seed: string): string => {
  const chars = fingerprint(seed).slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = "8";
  const compact = chars.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20, 32)}`;
};

export interface DesktopMeetingLoopRuntime {
  authorization(): MeetingLoopAuthorization;
  requestCalendarAccess(): Promise<CalendarReadResult["capability"]>;
  readonly service: MeetingLoopService;
}

export const createDesktopMeetingLoopRuntime = (input: {
  readonly context: ExecutionContext;
  readonly store: SqliteApplicationStore;
  readonly platform?: NodeJS.Platform;
  readonly helperPath?: string;
  readonly runHelper?: CalendarHelperRunner;
}): DesktopMeetingLoopRuntime => {
  const platform = input.platform ?? process.platform;
  const run =
    input.runHelper ??
    (input.helperPath === undefined
      ? undefined
      : createCalendarHelperRunner(input.helperPath));
  const calendar = new NativeCalendarAdapter(platform, run);
  return {
    requestCalendarAccess: async () => {
      if (platform !== "darwin" || run === undefined)
        return unavailable(platform).capability;
      try {
        const response = (await run("request-access", {})) as Record<
          string,
          unknown
        >;
        return CalendarCapabilitySchema.parse(response.capability);
      } catch {
        return CalendarCapabilitySchema.parse({
          platform: "macos",
          provider: "eventkit",
          availability: "error",
          canRead: false,
          canWriteOwnedBlocks: false,
          detailCode: "eventkit_permission_request_failed",
        });
      }
    },
    authorization: () =>
      input.store.read((view) => {
        const workspace = view.getWorkspace(input.context.workspaceId);
        const membership = view.getMembership(
          input.context.workspaceId,
          input.context.principalId,
        );
        const active =
          membership !== undefined && membership.status !== "revoked";
        const spaceIds = active
          ? input.context.spaceScope.filter(
              (spaceId) =>
                (membership.role === "owner" &&
                  spaceId === workspace?.rootSpaceId) ||
                view.getSpaceGrantForPrincipal(
                  input.context.workspaceId,
                  spaceId,
                  input.context.principalId,
                )?.status === "active",
            )
          : [];
        return {
          workspaceId: input.context.workspaceId,
          principalId: input.context.principalId,
          readableSpaceIds: spaceIds,
          editableSpaceIds: spaceIds,
          canImportJamie: active && input.context.principalKind === "human",
          canWriteCalendar: active && input.context.principalKind === "human",
        };
      }),
    service: new MeetingLoopService({
      calendarReader: calendar,
      calendarWriter: calendar,
      clock: { now: () => new Date().toISOString() },
      evidence: {
        listAuthorizedEvidence: ({ workspaceId, spaceIds, event }) => {
          const linked = input.store
            .load(workspaceId)
            .meetings.filter(
              (meeting) =>
                meeting.calendarEventId === event.eventExternalId &&
                spaceIds.includes(meeting.spaceId),
            );
          return linked.flatMap((meeting) => [
            {
              kind: "prior_meeting" as const,
              recordId: meeting.id,
              spaceId: meeting.spaceId,
              label: meeting.title ?? "Prior meeting",
              fact:
                meeting.summaryMarkdown
                  ?.replace(/^#+\s*/gm, "")
                  .slice(0, 2_000) ?? "A prior Jamie result is linked.",
              updatedAt: meeting.updatedAt,
            },
            ...meeting.workItems
              .filter(
                (item) => item.state === "open" || item.state === "conflicted",
              )
              .map((item) => ({
                kind:
                  item.kind === "follow_up" ? ("waiting" as const) : item.kind,
                recordId: item.id,
                spaceId: meeting.spaceId,
                label: item.title,
                fact:
                  item.state === "conflicted"
                    ? "The local value conflicts with a Jamie correction."
                    : item.title,
                updatedAt: meeting.updatedAt,
              })),
          ]);
        },
      },
      hasher: { fingerprint },
      ids: {
        uuid: deterministicUuid,
        opaqueToken: () => randomBytes(32).toString("base64url"),
      },
      repository: input.store,
    }),
  };
};
