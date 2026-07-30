import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  AuditReceiptIdSchema,
  CaptureIdSchema,
  CapturePayloadIdSchema,
  CommentIdSchema,
  KnowledgeSourceIdSchema,
  type QueryProjection,
} from "@constellation/contracts";

import type {
  RendererCommandResponse,
  RendererQueryResponse,
} from "@constellation/desktop-preload/client";

import { assertNoNode } from "./dom-assert.js";
import {
  longTaskId,
  longTaskTitle,
  populatedShellQueries,
  principalId,
  projectionResponse,
  spaceId,
} from "./shell-fixture.js";

type Projection<Kind extends QueryProjection["kind"]> = Extract<
  QueryProjection,
  { kind: Kind }
>;

// The inspector rail draws the SAME comments panel as the project and the
// organization records, and this file is the proof that the shell hands it
// what that panel needs.
//
// `record-comments.interaction.test.tsx` mounts the panel directly and proves
// it honours the props it is given. That is a different claim: a panel can obey
// every prop perfectly while nothing on screen supplies them, and four
// capabilities can leave the product with a green gate. So every assertion here
// starts from a CLICK IN THE NAVIGATION — Tasks, then a row — and never from
// the panel's own callback.
//
// It also replaces four source-TEXT regexes that read the retired panel's
// attachment markup out of `CollaborationSurfaces.tsx`. They asserted a string,
// so re-implementing the behaviour elsewhere could not satisfy them, and
// deleting the string could not fail them for the right reason.
//
// Nothing here selects on a CSS-module class: the panel's names are hashed in a
// production build, so a class-based selector measures nothing once packaged.

const rootId = CommentIdSchema.parse("00000000-0000-4000-8000-00000000da01");
const filedId = CommentIdSchema.parse("00000000-0000-4000-8000-00000000da02");
const captureId = CaptureIdSchema.parse("00000000-0000-4000-8000-00000000da03");
const payloadId = CapturePayloadIdSchema.parse(
  "00000000-0000-4000-8000-00000000da04",
);
const sourceId = KnowledgeSourceIdSchema.parse(
  "00000000-0000-4000-8000-00000000da05",
);
const receiptId = AuditReceiptIdSchema.parse(
  "00000000-0000-4000-8000-00000000da06",
);

const settledBody = "Czy zakres obejmuje też oddział w Gdańsku?";
const filedBody = "Notatka ze spotkania wisi przy tym zadaniu.";

/** Two open roots, both mine, one of them carrying a saved file.
 *
 *  Two rather than one because the valve counts RESOLVED roots: over a single
 *  thread, "the settled one is hidden" and "the panel drew nothing" are the
 *  same screen, and the assertion below could not tell them apart. */
const comments = (
  settled: "open" | "resolved",
): Projection<"comment.list"> => ({
  kind: "comment.list",
  target: { kind: "task", taskId: longTaskId },
  threads: [
    {
      id: rootId,
      rootCommentId: rootId,
      body: settledBody,
      author: { principalId, displayName: "Kacper" },
      mentionPrincipalIds: [],
      attachments: [],
      threadState: settled,
      version: settled === "open" ? 1 : 2,
      createdAt: "2026-07-19T08:00:00.000Z",
      updatedAt: "2026-07-19T08:00:00.000Z",
      edited: false,
    },
    {
      id: filedId,
      rootCommentId: filedId,
      body: filedBody,
      author: { principalId, displayName: "Kacper" },
      mentionPrincipalIds: [],
      attachments: [
        {
          sourceId,
          captureId,
          original: {
            kind: "managed_file",
            payload: {
              payloadId,
              displayName: "notatka.pdf",
              mediaType: "application/pdf",
              byteLength: 4096,
              contentSha256: "a".repeat(64),
              custodyState: "available",
            },
          },
          availability: "available",
        },
      ],
      threadState: "open",
      version: 1,
      createdAt: "2026-07-18T08:00:00.000Z",
      updatedAt: "2026-07-18T08:00:00.000Z",
      edited: false,
    },
  ],
});

const mentionCandidates: Projection<"comment.mentionCandidates"> = {
  kind: "comment.mentionCandidates",
  spaceId,
  candidates: [
    { principalId, displayName: "Kacper", participantKind: "member" },
  ],
};

/** Identity and a grant. Without both, `currentPrincipalId` is absent, no
 *  comment is anybody's own, and every control the panel gates on authorship
 *  would be missing for an honest reason rather than a broken one. */
const access: Projection<"workspace.access"> = {
  kind: "workspace.access",
  policyVersion: 1,
  currentPrincipalId: principalId,
  canManage: true,
  members: [
    {
      membershipId: "00000000-0000-4000-8000-00000000db01",
      principalId,
      displayName: "Kacper",
      role: "owner",
      status: "active",
      version: 1,
      spaces: [
        {
          spaceGrantId: "00000000-0000-4000-8000-00000000db02",
          spaceId,
          spaceName: "Space",
          access: "edit",
          status: "active",
          version: 1,
        },
      ],
    },
  ],
};

/** A query the boundary throws out. Withholding the fixture entirely would
 *  reach the same branch, but this one says out loud that the refusal is the
 *  subject of a test rather than a fixture somebody forgot. */
const refused: RendererQueryResponse = {
  kind: "contract_rejected",
  diagnosticCode: "contract.invalid",
  issues: [{ path: "target", code: "custom" }],
};

const queries = {
  ...populatedShellQueries,
  "workspace.access": projectionResponse(access),
  "comment.list": projectionResponse(comments("open")),
  "comment.mentionCandidates": projectionResponse(mentionCandidates),
};

/** The fixtures THIS mount reads, kept reachable so a test can change the
 *  answer between two reads — the only way to prove the shell re-reads the
 *  projection after a write instead of redrawing what it already had. */
let live: typeof queries = queries;

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  live = { ...queries };
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  if (mounted) {
    mounted = false;
    act(() => {
      root.unmount();
    });
  }
  container.remove();
});

const waitForCondition = async (
  ready: () => boolean,
  message: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (ready()) return;
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }
  assert.fail(message);
};

/** The rail, scoped by its accessible name rather than by a class — a second
 *  comments panel elsewhere in the shell would otherwise answer these. */
const rail = (): HTMLElement => {
  const found = container.querySelector<HTMLElement>(
    '[aria-label="Context preview"]',
  );
  assert.ok(found, "the shell drew no inspector to read");
  return found;
};

const buttonSaying = (scope: ParentNode, text: string): HTMLElement | null =>
  [...scope.querySelectorAll<HTMLElement>("button")].find(
    (node) => (node.textContent ?? "").trim() === text,
  ) ?? null;

const bodyOnScreen = (body: string): HTMLElement | null =>
  [...rail().querySelectorAll<HTMLElement>("p")].find(
    (node) => node.textContent === body,
  ) ?? null;

/** Opens the task the way a person does: the destination, then one row. */
const openTask = async (): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  // Settling a thread is the one write scripted as accepted. Everything else is
  // refused, so a screen that started sending something nobody asked for fails
  // here rather than passing quietly.
  const client = createScenarioClient({
    queries: live,
    executeCommand: (command): RendererCommandResponse =>
      command.commandName === "comment.resolve"
        ? {
            kind: "command_outcome",
            outcome: {
              contractVersion: 1,
              commandId: command.commandId,
              correlationId: command.correlationId,
              kernelTime: "2026-07-19T10:00:00.000Z",
              outcome: "success",
              diagnosticCode: "comment.resolved",
              affected: [],
              auditReceiptId: receiptId,
              projection: {
                kind: "comment.resolved",
                commentId: rootId,
                rootCommentId: rootId,
                version: 2,
              },
            },
          }
        : {
            kind: "contract_rejected",
            diagnosticCode: "contract.invalid",
            issues: [{ path: "", code: "custom" }],
          },
  });
  const snapshot = await loadDesktopSnapshot(client);
  assert.ok(
    snapshot.tasks.length > 0,
    "the task fixture never reached the snapshot, so this measures nothing",
  );
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });
  const destination = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === "tasks");
  assert.ok(destination, "no navigation target rendered for Tasks");
  await act(async () => {
    destination.click();
  });
  await waitForCondition(
    () => container.querySelector(`[data-task-row="${longTaskId}"]`) !== null,
    "Tasks never drew the row this file opens",
  );
  const row = container.querySelector<HTMLElement>(
    `[data-task-row="${longTaskId}"]`,
  );
  assert.ok(row, "the row disappeared between waiting for it and clicking it");
  assert.ok(
    (row.getAttribute("aria-label") ?? "").includes(longTaskTitle),
    "the row this file opens is not the task it names",
  );
  await act(async () => {
    row.click();
  });
};

const openTaskComments = async (): Promise<void> => {
  await openTask();
  await waitForCondition(
    () =>
      rail().querySelector('textarea[aria-label="Write a comment"]') !== null,
    "the task inspector never drew a comment composer",
  );
};

test("a thread settled from the inspector leaves the open list", async () => {
  await openTaskComments();
  assert.ok(
    bodyOnScreen(settledBody),
    "the thread this test settles is not on screen to begin with",
  );
  assertNoNode(
    buttonSaying(rail(), "Show 1 resolved"),
    "something was settled already, so the valve would prove nothing",
  );

  const thread = rail().querySelector<HTMLElement>(
    `[data-thread-root="${rootId}"]`,
  );
  assert.ok(thread, "the thread this test settles was never drawn as a root");
  const settle = buttonSaying(thread, "Resolve");
  assert.ok(settle, "the inspector offers no way to settle a thread");

  // The second half of the write: the panel redraws from the projection, so a
  // shell that issued the command and never re-read it would leave the thread
  // exactly where it was.
  live["comment.list"] = projectionResponse(comments("resolved"));
  await act(async () => {
    settle.click();
  });
  await waitForCondition(
    () => buttonSaying(rail(), "Show 1 resolved") !== null,
    "settling a thread never moved it behind the resolved valve",
  );

  assertNoNode(
    bodyOnScreen(settledBody),
    "the settled thread is still in the open list",
  );
  assert.ok(
    bodyOnScreen(filedBody),
    "the valve hid the thread that was never settled",
  );
});

test("a file on a comment says whether this device still holds it", async () => {
  await openTaskComments();
  const listed = rail().querySelector<HTMLElement>(
    '[aria-label="Comment attachments"]',
  );
  assert.ok(listed, "a comment with a saved file lists none in the inspector");
  assert.ok(
    (listed.textContent ?? "").includes("notatka.pdf"),
    "the saved file is listed without its name",
  );

  // The shell answers custody out of managed storage, and this environment
  // holds nothing — so the honest answer is no. The chip renders exactly one of
  // three strings, so this wait IS the "resting on Checking storage… forever"
  // regression: a second assertion that the other two are absent could never
  // fail on its own, which is decoration rather than a check.
  const custody = (): string => {
    const files = rail().querySelector('[aria-label="Comment attachments"]');
    return files?.textContent ?? "";
  };
  await waitForCondition(
    () => custody().includes("Not on this device"),
    "the custody chip never settled on an answer",
  );

  // Staging is offered from the rail and not only from the record screens: the
  // button exists only where the mount hands the panel a way to stage.
  assert.ok(
    buttonSaying(rail(), "Attach file"),
    "the inspector offers no way to attach a file to a comment",
  );
});

test("the inspector says WHY comments are missing, not merely that they are", async () => {
  // The query layer refuses the read and names the reason. The retired panel
  // threw that sentence away and printed one of its own, so a failed read and a
  // record nobody had opened yet read identically.
  live["comment.list"] = refused;
  await openTask();
  const stated = (): string => rail().textContent ?? "";
  await waitForCondition(
    () => stated().includes("The app refused an invalid query."),
    "the inspector never stated why the comments are missing",
  );
  assertNoNode(
    rail().querySelector('textarea[aria-label="Write a comment"]'),
    "a composer is offered over comments that could not be read",
  );
});
