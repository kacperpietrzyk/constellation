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
// The organization came second, and the task was held back on purpose: its
// comments lived in the inspector rail, where the older panel already offered
// replies, editing, resolving and attachments that `RecordCommentsPanel` did
// not, so moving the thinner panel there would have been a capability
// regression dressed as consistency.
//
// That was reversed rather than worked around. The gap was CLOSED — the record
// panel grew all four — and one panel now serves all three record kinds, which
// is what the tab was for. The PANEL is what all three share and the tab is
// not: a task's comments are read in the inspector rail. The note is kept
// rather than deleted because the reasoning is the same either way: consistency
// is worth having once it costs nobody a capability, and not one line before.
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

/** Who is reading, and on what grant. Not decoration: permission is a STATED
 *  fact on the panel now rather than a default, so a record whose access slice
 *  never landed offers a read-only composer — which is the correct answer, and
 *  would leave the two tests below measuring a screen nobody can write on. */
const access: Projection<"workspace.access"> = {
  kind: "workspace.access",
  policyVersion: 1,
  currentPrincipalId: principalId,
  canManage: true,
  members: [
    {
      membershipId: "00000000-0000-4000-8000-0000000009e1",
      principalId,
      displayName: "Kacper",
      role: "owner",
      status: "active",
      version: 1,
      spaces: [
        {
          spaceGrantId: "00000000-0000-4000-8000-0000000009e2",
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

const queries = {
  ...populatedShellQueries,
  "workspace.access": projectionResponse(access),
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

/** The organization record's own tab panel, found THROUGH the tab that names it
 *  rather than by a class — CSS-module names are hashed in a packaged build, so
 *  a class selector measures nothing once the app ships.
 *
 *  Scoped for the reason the record screen's own file was already fixed for: the
 *  shell draws a SECOND comments panel in the inspector rail — from the same
 *  component, with the same control names — whenever a task or a project is
 *  selected. Selecting an organization does not, so this scope cannot be
 *  falsified from this file today; it is a guard against the day a rail beside
 *  an organization does, at which point an unscoped query over `container`
 *  would go green on somebody else's Resolve while this record's was missing. */
const record = (): HTMLElement => {
  const tab = container.querySelector<HTMLElement>(
    '[role="tab"][data-record-tab="comments"]',
  );
  assert.ok(tab, "the organization record offers no Comments tab");
  const panelId = tab.getAttribute("aria-controls");
  assert.ok(panelId, "the Comments tab controls no panel");
  const panel = container.querySelector<HTMLElement>(`#${panelId}`);
  assert.ok(panel, "the Comments tab points at an id that is not on the page");
  return panel;
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

  const field = record().querySelector<HTMLTextAreaElement>(
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

test("a thread settled here reaches the kernel, and a refusal is stated", async () => {
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

  // Settling was one of four capabilities the record panel grew, and every one
  // of them could have shipped with a green gate: no mount passed `onResolve`,
  // so the control existed and reached nothing. This is the organization half
  // of proving it is wired to the kernel rather than to a prop.
  const settle = [
    ...record().querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.textContent === "Resolve");
  assert.ok(settle, "the organization's threads offer no way to settle them");
  await act(async () => {
    settle.click();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  const resolved = issued.find((command) => command.name === "comment.resolve");
  assert.ok(resolved, "settling a thread issued no command at all");
  assert.equal(resolved.payload["commentId"], rootComment);

  // This harness refuses every command. The panel reads that answer, so the
  // reader is told — a thread that did not settle, drawn exactly like one that
  // did, is how a refused write goes missing without anybody noticing.
  assert.ok(
    record().textContent?.includes("That change was refused."),
    "a refused settle is drawn exactly like one the kernel accepted",
  );
});
