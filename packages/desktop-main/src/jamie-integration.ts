import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { z } from "zod";
import {
  JamieApiMeetingSchema,
  JamieApiTaskSchema,
  type JamieApiMeeting,
  type JamieApiTask,
} from "@constellation/contracts";

import type { AsyncSafeStorage } from "./workspace-key-custody.js";

const FORMAT = "constellation.jamie-connection/v1";
const JAMIE_ORIGIN = "https://beta-api.meetjamie.ai";

export type JamieKeyScope = "personal" | "workspace";

export interface JamieConnection {
  readonly connectionId: string;
  readonly scope: JamieKeyScope;
  readonly apiKey: string;
}

const safeFile = (filename: string): void => {
  const stat = lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
    throw new Error("Jamie connection custody file is unsafe.");
};

const syncDirectory = (directory: string): void => {
  if (process.platform === "win32") return;
  const descriptor = openSync(directory, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
};

export class JamieConnectionCustody {
  private readonly filename: string;

  public constructor(
    stateRoot: string,
    private readonly safeStorage: AsyncSafeStorage,
  ) {
    this.filename = path.join(stateRoot, "jamie", "connection.json");
  }

  public exists(): boolean {
    const backup = `${this.filename}.previous`;
    if (!existsSync(this.filename) && existsSync(backup)) {
      safeFile(backup);
      renameSync(backup, this.filename);
    }
    return existsSync(this.filename);
  }

  public async replace(input: {
    readonly apiKey: string;
    readonly scope: JamieKeyScope;
  }): Promise<void> {
    if (!(await this.safeStorage.isAsyncEncryptionAvailable()))
      throw new Error("Operating-system credential protection is unavailable.");
    const apiKey = input.apiKey.trim();
    if (!/^jk_[A-Za-z0-9_-]{16,496}$/.test(apiKey))
      throw new Error("Jamie API key has an invalid shape.");
    const encrypted = await this.safeStorage.encryptStringAsync(apiKey);
    const directory = path.dirname(this.filename);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.filename}.tmp`;
    rmSync(temporary, { force: true });
    const descriptor = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(
        descriptor,
        `${JSON.stringify({
          format: FORMAT,
          connectionId: `jamie:${input.scope}`,
          scope: input.scope,
          apiKeyCiphertext: Buffer.from(encrypted).toString("base64"),
        })}\n`,
        "utf8",
      );
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    const backup = `${this.filename}.previous`;
    rmSync(backup, { force: true });
    if (existsSync(this.filename)) renameSync(this.filename, backup);
    try {
      renameSync(temporary, this.filename);
    } catch (error) {
      if (existsSync(backup)) renameSync(backup, this.filename);
      throw error;
    }
    rmSync(backup, { force: true });
    syncDirectory(directory);
  }

  public async load(): Promise<JamieConnection | undefined> {
    if (!this.exists()) return undefined;
    safeFile(this.filename);
    const raw = JSON.parse(readFileSync(this.filename, "utf8")) as unknown;
    const parsed = z
      .object({
        format: z.literal(FORMAT),
        connectionId: z.string().trim().min(1).max(500),
        scope: z.enum(["personal", "workspace"]),
        apiKeyCiphertext: z.string().min(1),
      })
      .strict()
      .parse(raw);
    const decrypted = await this.safeStorage.decryptStringAsync(
      Buffer.from(parsed.apiKeyCiphertext, "base64"),
    );
    if (decrypted.shouldReEncrypt)
      throw new Error("Jamie credential requires protected re-encryption.");
    return {
      connectionId: parsed.connectionId,
      scope: parsed.scope,
      apiKey: decrypted.result,
    };
  }

  public revoke(): void {
    rmSync(this.filename, { force: true });
    rmSync(`${this.filename}.previous`, { force: true });
  }
}

const TrpcResponseSchema = z
  .object({
    result: z
      .object({ data: z.object({ json: z.unknown() }).strict() })
      .strict(),
  })
  .strict();

const MeetingListSchema = z
  .object({
    meetings: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(500),
            title: z.string(),
            generatedTitle: z.string().nullable(),
            startTime: z.iso.datetime({ offset: true }),
            endTime: z.iso.datetime({ offset: true }).nullable(),
            calendarEventId: z.string().nullable(),
            userId: z.string(),
          })
          .strict(),
      )
      .max(100),
    nextCursor: z.string().nullable(),
  })
  .strict();

const TaskListSchema = z
  .object({
    tasks: z.array(JamieApiTaskSchema).max(100),
    nextCursor: z.string().nullable(),
  })
  .strict();

export type JamieFetch = typeof fetch;

export class JamieApiClient {
  public constructor(private readonly request: JamieFetch = fetch) {}

  public async listRecent(input: {
    readonly connection: JamieConnection;
    readonly startDate: string;
    readonly limit?: number;
  }): Promise<readonly string[]> {
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const result = MeetingListSchema.parse(
        await this.get(input.connection, "meetings.list", {
          limit: input.limit ?? 25,
          startDate: input.startDate,
          ...(cursor === null ? {} : { cursor }),
        }),
      );
      ids.push(...result.meetings.map((meeting) => meeting.id));
      cursor = result.nextCursor;
      if (cursor === null) return ids;
    }
    throw new Error("Jamie meeting pagination exceeded the safe bound.");
  }

  public async getMeeting(input: {
    readonly connection: JamieConnection;
    readonly meetingId: string;
  }): Promise<JamieApiMeeting> {
    return JamieApiMeetingSchema.parse(
      await this.get(input.connection, "meetings.get", {
        meetingId: input.meetingId,
      }),
    );
  }

  public async listMeetingTasks(input: {
    readonly connection: JamieConnection;
    readonly meetingId: string;
  }): Promise<readonly JamieApiTask[]> {
    const tasks: JamieApiTask[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const result = TaskListSchema.parse(
        await this.get(input.connection, "tasks.list", {
          meetingId: input.meetingId,
          limit: 100,
          ...(cursor === null ? {} : { cursor }),
        }),
      );
      tasks.push(...result.tasks);
      cursor = result.nextCursor;
      if (cursor === null) return tasks;
    }
    throw new Error("Jamie task pagination exceeded the safe bound.");
  }

  private async get(
    connection: JamieConnection,
    route: "meetings.get" | "meetings.list" | "tasks.list",
    json: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    const routeScope = connection.scope === "workspace" ? "workspace" : "me";
    const url = new URL(`/v1/${routeScope}/${route}`, JAMIE_ORIGIN);
    url.searchParams.set("input", JSON.stringify({ json }));
    const response = await this.request(url, {
      method: "GET",
      headers: { "x-api-key": connection.apiKey, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new Error(`Jamie request failed (${response.status}).`);
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 10 * 1024 * 1024)
      throw new Error("Jamie response exceeds the safe size bound.");
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 10 * 1024 * 1024)
      throw new Error("Jamie response exceeds the safe size bound.");
    const body = TrpcResponseSchema.parse(JSON.parse(text) as unknown);
    return body.result.data.json;
  }
}
