import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import type { CommandEnvelope } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import { StrategicCreatePanel } from "../src/StrategicCreatePanel.js";
import type { DesktopSnapshot } from "../src/client/workflow.js";
import {
  populatedBootstrap,
  populatedRelationshipWorkspace,
  populatedTaskList,
  principalId,
  referencedOrganizationId,
  workspaceId,
} from "./shell-fixture.js";

// The decision form is the ONLY path in the product that writes a decision, so
// it is the only place the new client edge can be authored from. Its wrapper is
// covered by `crm-mutations.test.ts` — that proves the envelope is right GIVEN
// an organisation id. This file proves the form actually hands it one.
//
// The distinction is the whole point: a `<select>` that never made it into the
// form, or one whose `name` no longer matches the key the submit handler reads,
// leaves every other gate in this repo green and the client's Decisions section
// empty forever. That is the failure this lot exists to prevent, reproduced one
// layer up.
//
// Mounted DIRECTLY, and that limit is worth stating: this proves the panel
// authors the edge when it is given records to choose from, not that any mount
// gives it those records.

const unavailable = {
  kind: "unavailable" as const,
  message: "This panel does not read this slice.",
};

const snapshot: DesktopSnapshot = {
  build: {
    channel: "local-alpha",
    startupRecovery: "none",
    workspaceAvailability: "ready",
    initialWorkspaceId: workspaceId,
    persistence: "encrypted-local",
    version: "test",
  },
  bootstrap: populatedBootstrap,
  captures: [],
  tasks: populatedTaskList.items,
  projects: unavailable,
  work: unavailable,
  cockpit: unavailable,
  activity: unavailable,
  access: {
    kind: "ready",
    data: {
      kind: "workspace.access",
      policyVersion: 1,
      currentPrincipalId: principalId,
      canManage: true,
      members: [],
    },
  },
  agentAccess: unavailable,
  assignmentCandidates: unavailable,
  mentionCandidates: unavailable,
  attention: unavailable,
  documents: unavailable,
  knowledge: unavailable,
  relationships: { kind: "ready", data: populatedRelationshipWorkspace },
  radar: unavailable,
};

const recordingClient = (
  sent: CommandEnvelope[],
): ConstellationRendererClient =>
  ({
    executeCommand: async (command: CommandEnvelope) => {
      sent.push(command);
      return {
        kind: "command_outcome",
        outcome: {
          contractVersion: 1,
          commandId: command.commandId,
          correlationId: command.correlationId,
          kernelTime: "2026-07-31T12:00:00.000Z",
          outcome: "success",
          diagnosticCode: "accepted",
          affected: [],
          auditReceiptId: "90000000-0000-4000-8000-000000000009",
          projection: {
            kind: "strategic.record_changed",
            recordId: "",
            recordType: "",
            version: 2,
          },
        },
      };
    },
  }) as unknown as ConstellationRendererClient;

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mounted = true;
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

const settle = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const click = async (node: Element): Promise<void> => {
  await act(async () => {
    (node as HTMLElement).click();
  });
  await settle();
};

/** Deliberately not `assert.ok(node)`: a failing `ok` puts a happy-dom node
 *  graph into `actual` and serialising it takes the worker down without ever
 *  printing which test failed. */
// Scoped to the document, not to `container`: `InlinePopover` portals its panel
// to <body>, so a container-scoped query finds nothing and every assertion over
// the form would report "the form did not open" for the wrong reason.
const one = <T extends Element>(selector: string, message: string): T => {
  const found = document.body.querySelector<T>(selector);
  if (found === null) throw new Error(`${message} — no ${selector} on screen`);
  return found;
};

const openDecisionForm = async (
  sent: CommandEnvelope[],
): Promise<HTMLFormElement> => {
  await act(async () => {
    root.render(
      createElement(StrategicCreatePanel, {
        client: recordingClient(sent),
        snapshot,
        records: populatedRelationshipWorkspace.records,
        busy: false,
        // The panel hands back a thunk. Running it here is what puts the
        // envelope on the wire, which is the thing under test.
        onRun: async (_id: string, operation: () => Promise<unknown>) => {
          await operation();
          return true;
        },
      }),
    );
  });
  const launcher = container.querySelector<HTMLButtonElement>("button");
  if (launcher === null) throw new Error("The panel has no launcher.");
  await click(launcher);
  const decision = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.textContent?.trim() === "Decision");
  if (decision === undefined)
    throw new Error("The launcher no longer offers Decision.");
  await click(decision);
  const field = one<HTMLSelectElement>(
    'select[name="organizationId"]',
    "The decision form did not open, or offers no client",
  );
  const form = field.closest("form");
  if (form === null) throw new Error("The client select is outside any form.");
  return form;
};

const submitForm = async (form: HTMLFormElement): Promise<void> => {
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await settle();
};

test("the decision form files the decision under the client the author picked", async () => {
  const sent: CommandEnvelope[] = [];
  const form = await openDecisionForm(sent);

  one<HTMLInputElement>('input[name="title"]', "no title field").value =
    "Managed route for Orbit";
  one<HTMLTextAreaElement>(
    'textarea[name="rationale"]',
    "no rationale field",
  ).value = "Their team cannot carry night cover themselves.";
  const client = one<HTMLSelectElement>(
    'select[name="organizationId"]',
    "the decision form offers no client",
  );
  // The empty option is first BY DESIGN and this asserts it: a `<select>` with
  // nothing chosen submits its first option, so a list starting with a real
  // organisation would file every unattributed decision under whichever client
  // happens to sort first — silently, and with this whole file still green.
  assert.equal(client.options[0]?.value, "");
  client.value = referencedOrganizationId;

  await submitForm(form);

  assert.equal(sent.length, 1, "one decision, one command");
  const payload = sent[0]?.payload as Record<string, unknown>;
  assert.equal(sent[0]?.commandName, "decision.create");
  assert.equal(
    payload["organizationId"],
    referencedOrganizationId,
    "the client the author chose reaches the command",
  );
});

test("a decision nobody attributed to a client sends no client at all", async () => {
  const sent: CommandEnvelope[] = [];
  const form = await openDecisionForm(sent);

  one<HTMLInputElement>('input[name="title"]', "no title field").value =
    "Stop quoting weekend cover by default";
  one<HTMLTextAreaElement>(
    'textarea[name="rationale"]',
    "no rationale field",
  ).value = "Nobody bought it twice running.";

  await submitForm(form);

  assert.equal(sent.length, 1);
  assert.equal(
    "organizationId" in (sent[0]?.payload as Record<string, unknown>),
    false,
    "an absent client is absent, not an empty string the kernel would refuse",
  );
});
