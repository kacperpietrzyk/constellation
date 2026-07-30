import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  CommentIdSchema,
  type QueryProjection,
} from "@constellation/contracts";

import {
  populatedShellQueries,
  principalId,
  projectionResponse,
  referencedOrganizationId,
  spaceId,
} from "./shell-fixture.js";

type Projection<Kind extends QueryProjection["kind"]> = Extract<
  QueryProjection,
  { kind: Kind }
>;

// Decision #28's SECOND record kind. The `Comments` tab is one tab across three
// kinds, and until this landed it existed on exactly one of them.
//
// The organization is the honest next one, and the task deliberately is not:
// the organization record had no comments at all, so a tab is pure gain, while
// a task's comments live in the inspector rail where the older panel already
// offers replies, editing, resolving and attachments that `RecordCommentsPanel`
// does not. Putting the thinner panel there would be a capability regression
// dressed as consistency. That is written down rather than left to whichever
// file somebody edits next.
//
// Two things this file exists to catch, both of which a component test would
// pass over:
//
//   - the tab has to be REACHABLE — the surface has a second call site (the
//     development harness) with no loader, so `comments` is optional and the
//     surface renders exactly as before without it. An optional prop nobody
//     fills is indistinguishable from a feature nobody built;
//   - writing a comment has to reach the kernel with the ORGANIZATION target.
//     `CommentTargetSchema` grew that arm in a separate change, and the id
//     alone does not say which kind it names — the kernel refuses a target that
//     resolves to a Person or an Opportunity.

const rootComment = CommentIdSchema.parse(
  "00000000-0000-4000-8000-00000000ca01",
);

const overview: Projection<"organization.operationalOverview"> = {
  kind: "organization.operationalOverview",
  organization: {
    id: referencedOrganizationId,
    spaceId,
    name: "Northstar Industries",
    relationshipState: "active",
    version: 4,
    updatedAt: "2026-07-20T10:00:00.000Z",
  },
  people: [],
  opportunities: [],
  offers: [],
  renewals: [],
  facts: [],
  activeProjects: [],
  openTasks: [],
  meetings: [],
  documents: [],
  recentActivity: [],
};

const comments: Projection<"comment.list"> = {
  kind: "comment.list",
  target: { kind: "organization", organizationId: referencedOrganizationId },
  threads: [
    {
      id: rootComment,
      rootCommentId: rootComment,
      body: "Sponsor potwierdzony, termin warsztatu do ustalenia.",
      author: { principalId, displayName: "Kacper" },
      mentionPrincipalIds: [],
      attachments: [],
      threadState: "open",
      version: 1,
      createdAt: "2026-07-19T08:00:00.000Z",
      updatedAt: "2026-07-19T08:00:00.000Z",
      edited: false,
    },
  ],
};

const queries = {
  ...populatedShellQueries,
  "organization.operationalOverview": projectionResponse(overview),
  "comment.list": projectionResponse(comments),
};

let container: HTMLDivElement;
let root: Root;
let mounted = false;
let issued: { name: string; payload: Record<string, unknown> }[] = [];

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
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
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (ready()) return;
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }
  assert.fail(message);
};

/** Opens the organization record the way a person does: the destination, then
 *  the row. Nothing here mounts `OrganizationContextSurface` directly — the
 *  loader is what reads the comments, and a test that skipped it would prove
 *  nothing about the application. */
const openOrganization = async (): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  issued = [];
  const client = createScenarioClient({
    queries,
    executeCommand: (command) => {
      issued.push({
        name: command.commandName,
        payload: command.payload as Record<string, unknown>,
      });
      return {
        kind: "contract_rejected",
        diagnosticCode: "contract.invalid",
        issues: [{ path: "", code: "custom" }],
      };
    },
  });
  const snapshot = await loadDesktopSnapshot(client);
  assert.equal(
    snapshot.relationships.kind,
    "ready",
    "the relationship fixture never reached the snapshot, so this measures nothing",
  );
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });

  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === "organizations");
  assert.ok(item, "no navigation target rendered for Organizations");
  await act(async () => {
    item.click();
  });

  await waitForCondition(
    () =>
      [...container.querySelectorAll<HTMLElement>("button")].some((button) =>
        button.textContent?.includes("Northstar Industries"),
      ),
    "Organizations never drew the fixture's organization",
  );
  const row = [...container.querySelectorAll<HTMLElement>("button")].find(
    (button) => button.textContent?.includes("Northstar Industries"),
  );
  assert.ok(row);
  await act(async () => {
    row.click();
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
};

test("an organization record offers a Comments tab, and it is reachable", async () => {
  await openOrganization();
  await waitForCondition(
    () =>
      container.querySelector('[role="tab"][data-record-tab="comments"]') !==
      null,
    "the organization record offers no Comments tab",
  );

  const tab = container.querySelector<HTMLElement>(
    '[role="tab"][data-record-tab="comments"]',
  );
  assert.ok(tab);
  // The count is unresolved ROOT threads, which is what the tab compensates for
  // — a strip was seen in passing, a tab will not show itself.
  assert.equal(tab.textContent, "Comments1");

  // Overview is what the record opens on, and it still carries the body the
  // surface drew before the strip existed.
  assert.ok(
    container.querySelector('[role="tab"][data-record-tab="overview"]'),
  );
  assert.ok(
    container.textContent?.includes("Active projects"),
    "the record lost its own body when it gained a tab bar",
  );

  await act(async () => {
    tab.click();
  });
  assert.ok(
    container.textContent?.includes(
      "Sponsor potwierdzony, termin warsztatu do ustalenia.",
    ),
    "the Comments tab does not show the record's comments",
  );
});

test("a comment written on an organization reaches the kernel as an organization", async () => {
  await openOrganization();
  await waitForCondition(
    () =>
      container.querySelector('[role="tab"][data-record-tab="comments"]') !==
      null,
    "the organization record offers no Comments tab",
  );
  await act(async () => {
    container
      .querySelector<HTMLElement>('[role="tab"][data-record-tab="comments"]')
      ?.click();
  });

  const field = container.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Write a comment"]',
  );
  assert.ok(field, "the Comments tab offers no way to comment");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(field, "Termin ustalony na wrzesień.");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    field
      .closest("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  const added = issued.find((command) => command.name === "comment.add");
  assert.ok(added, "writing a comment on an organization issued no command");
  // The TARGET is the whole point. A strategic-record id does not say which
  // kind it names, so a comment addressed with the wrong discriminator is
  // refused by the kernel rather than landing on a Person.
  assert.deepEqual(added.payload["target"], {
    kind: "organization",
    organizationId: referencedOrganizationId,
  });
});
