import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  JamieApiClient,
  JamieConnectionCustody,
  type JamieFetch,
} from "../src/jamie-integration.js";

const apiKey = `jk_${"a".repeat(32)}`;

test("Jamie custody protects, restores, replaces, and revokes the API key", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "constellation-jamie-"));
  const storage = {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value: string) =>
      Buffer.from(`protected:${value}`, "utf8"),
    decryptStringAsync: async (value: Buffer) => ({
      result: value.toString("utf8").replace(/^protected:/, ""),
      shouldReEncrypt: false,
    }),
  };
  try {
    const custody = new JamieConnectionCustody(root, storage);
    await custody.replace({ apiKey, scope: "personal" });
    assert.deepEqual(await custody.load(), {
      apiKey,
      connectionId: "jamie:personal",
      scope: "personal",
    });
    await custody.replace({
      apiKey: `jk_${"b".repeat(32)}`,
      scope: "workspace",
    });
    assert.equal((await custody.load())?.scope, "workspace");
    custody.revoke();
    assert.equal(await custody.load(), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Jamie API adapter uses documented scoped routes and stable task identities", async () => {
  const calls: URL[] = [];
  const request = (async (input: string | URL | Request) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    calls.push(url);
    const route = url.pathname.split("/").at(-1);
    const json =
      route === "meetings.list"
        ? {
            meetings: [
              {
                id: "meeting-1",
                title: "Review",
                startTime: "2026-07-14T10:00:00.000Z",
                endTime: "2026-07-14T10:30:00.000Z",
                calendarEventId: null,
                userId: "user-1",
                isShared: true,
              },
            ],
            nextCursor: null,
          }
        : route === "tasks.list"
          ? {
              tasks: [
                {
                  id: "task-1",
                  text: "Send summary",
                  completed: false,
                  assignee: null,
                  meetingId: "meeting-1",
                  meetingTitle: "Review",
                  createdAt: "2026-07-14T10:30:00.000Z",
                  userId: "user-1",
                },
              ],
              nextCursor: null,
            }
          : {
              id: "meeting-1",
              title: "Review",
              generatedTitle: null,
              startTime: "2026-07-14T10:00:00.000Z",
              endTime: "2026-07-14T10:30:00.000Z",
              locked: false,
              summary: null,
              transcript: null,
              transcriptInfo: {
                truncated: false,
                totalBytes: 0,
                returnedBytes: 0,
                nextCursor: null,
                hint: "Transcript is complete.",
              },
              participants: [],
              tasks: [],
              event: null,
              tags: [],
              user: { id: "user-1", email: "owner@example.com" },
            };
    return new Response(JSON.stringify({ result: { data: { json } } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as JamieFetch;
  const client = new JamieApiClient(request);
  const connection = {
    apiKey,
    connectionId: "jamie:workspace",
    scope: "workspace" as const,
  };
  assert.deepEqual(
    await client.listRecent({
      connection,
      startDate: "2026-04-15T00:00:00.000Z",
    }),
    ["meeting-1"],
  );
  assert.equal(
    (await client.getMeeting({ connection, meetingId: "meeting-1" })).id,
    "meeting-1",
  );
  assert.equal(
    (await client.listMeetingTasks({ connection, meetingId: "meeting-1" }))[0]
      ?.id,
    "task-1",
  );
  assert.deepEqual(
    calls.map((url) => url.pathname),
    [
      "/v1/workspace/meetings.list",
      "/v1/workspace/meetings.get",
      "/v1/workspace/tasks.list",
    ],
  );
});
