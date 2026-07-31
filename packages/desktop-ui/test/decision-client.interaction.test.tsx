import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  StrategicRecordIdSchema,
  type CommandEnvelope,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import { assertNoNode } from "./dom-assert.js";
import {
  populatedBootstrap,
  populatedRelationshipWorkspace,
  populatedTaskList,
  principalId,
  referencedOrganizationId,
  workspaceId,
} from "./shell-fixture.js";
import type { DesktopSnapshot } from "../src/client/workflow.js";

// The control that closes #196's regression: a decision that already exists has
// to be attributable to a client by a PERSON, not only by an agent over MCP.
// Kacper is the one holding the unattributed decisions.
//
// Mounted at `StrategicRecordInspector`, not at the section itself. A section
// that honours every prop perfectly while nothing imports it is a capability
// with a green gate and no product — so what this measures is that the
// inspector, given a decision, puts the control on screen.
//
// It stops at the inspector on purpose: the shell path to selecting a strategic
// record runs through `StrategicDepthSurface`, which PR #195 is rewriting whole.
// Two lots writing one file is worse than one uncovered hop, and the hop that
// is left — RealApp passing `onUpdated` — is a required prop, so it cannot be
// silently dropped.

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
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

const decisionId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000000d1",
);

const unavailable = { kind: "unavailable", reason: "not_loaded" } as const;

const decisionRecord = (organizationId?: string) => ({
  kind: "decision" as const,
  id: decisionId,
  spaceId: populatedRelationshipWorkspace.records[0]!.spaceId,
  title: "Managed route for Orbit",
  rationale: "Their team cannot carry night cover themselves.",
  ...(organizationId === undefined ? {} : { organizationId }),
  evidenceSourceIds: [],
  linkedRecordIds: [],
  state: "current" as const,
  createdBy: principalId,
  version: 3,
  createdAt: "2026-07-01T09:00:00.000Z",
  updatedAt: "2026-07-01T09:00:00.000Z",
});

const snapshotOf = (): DesktopSnapshot =>
  ({
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
    access: unavailable,
    agentAccess: unavailable,
    assignmentCandidates: unavailable,
    mentionCandidates: unavailable,
    attention: unavailable,
    documents: unavailable,
    knowledge: unavailable,
    relationships: { kind: "ready", data: populatedRelationshipWorkspace },
    radar: unavailable,
  }) as unknown as DesktopSnapshot;

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
            recordId: decisionId,
            recordType: "decision",
            version: 4,
          },
        },
      };
    },
  }) as unknown as ConstellationRendererClient;

const mountInspector = async (
  record: ReturnType<typeof decisionRecord>,
  sent: CommandEnvelope[],
  updates: string[],
): Promise<void> => {
  const { StrategicRecordInspector } =
    await import("../src/StrategicRecordInspector.js");
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(StrategicRecordInspector, {
        record: record as never,
        records: [...populatedRelationshipWorkspace.records, record] as never,
        projects: [],
        client: recordingClient(sent),
        snapshot: snapshotOf(),
        onSelectRecord: () => {},
        onOpenProject: () => {},
        onRemoved: async () => {},
        onUpdated: async (message: string) => {
          updates.push(message);
        },
        onRemoveFailure: () => {},
      }),
    );
  });
};

const clientSelect = (): HTMLSelectElement => {
  const node = container.querySelector<HTMLSelectElement>(
    "[data-decision-client-select]",
  );
  assert.ok(
    node,
    "the inspector rendered no client control for a decision, so every assertion below would pass on nothing",
  );
  return node;
};

const saveButton = (): HTMLButtonElement => {
  const node = container.querySelector<HTMLButtonElement>(
    "[data-decision-client-save]",
  );
  assert.ok(node, "the client control rendered without a way to save it");
  return node;
};

const choose = async (value: string): Promise<void> => {
  const select = clientSelect();
  await act(async () => {
    // happy-dom does not fire `change` from a property write, and React reads
    // the event — setting `.value` alone would leave the component's state on
    // the previous choice while the DOM showed the new one.
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

test("an unattributed decision offers every client in the Space, starting from none", async () => {
  const sent: CommandEnvelope[] = [];
  await mountInspector(decisionRecord(), sent, []);
  const select = clientSelect();
  assert.equal(
    select.value,
    "",
    "a decision about no client starts on the empty option, not on whichever client sorts first",
  );
  assert.equal(
    [...select.options][0]?.value,
    "",
    "and 'No client' is the FIRST option — a select with no chosen value submits its first",
  );
  assert.ok(
    [...select.options].some(
      (option) => option.value === referencedOrganizationId,
    ),
    "the clients in the Space are offered",
  );
  assert.ok(
    saveButton().disabled,
    "and saving is refused until something actually changes",
  );
});

test("choosing a client sends decision.update carrying that client alone", async () => {
  const sent: CommandEnvelope[] = [];
  const updates: string[] = [];
  await mountInspector(decisionRecord(), sent, updates);
  await choose(referencedOrganizationId);
  assert.equal(saveButton().disabled, false);
  await act(async () => {
    saveButton().click();
  });
  assert.equal(sent.length, 1);
  const envelope = sent[0]!;
  assert.equal(envelope.commandName, "decision.update");
  assert.deepEqual(Object.keys(envelope.payload).sort(), [
    "decisionId",
    "organizationId",
  ]);
  assert.equal(
    (envelope.payload as Record<string, unknown>)["organizationId"],
    referencedOrganizationId,
  );
  assert.deepEqual(envelope.expectedVersions, { [decisionId]: 3 });
  assert.equal(
    updates.length,
    1,
    "and the surface is told to refresh, or the reader sees a stale record",
  );
});

test("clearing the client sends an explicit null, which is the detachment", async () => {
  const sent: CommandEnvelope[] = [];
  const updates: string[] = [];
  await mountInspector(decisionRecord(referencedOrganizationId), sent, updates);
  assert.equal(
    clientSelect().value,
    referencedOrganizationId,
    "an attributed decision starts on the client it names",
  );
  await choose("");
  await act(async () => {
    saveButton().click();
  });
  assert.equal(sent.length, 1);
  const payload = sent[0]!.payload as Record<string, unknown>;
  // `null`, never an omitted key: omitting it means "leave the client alone",
  // which the wrapper answers as "nothing changed" — the exact silence #194
  // found one layer out from #189.
  assert.equal(payload["organizationId"], null);
  assert.deepEqual(Object.keys(payload).sort(), [
    "decisionId",
    "organizationId",
  ]);
  assert.equal(updates.length, 1);
});

test("no client control is drawn for a record that is not a decision", async () => {
  const sent: CommandEnvelope[] = [];
  const organization = populatedRelationshipWorkspace.records.find(
    (record) => record.id === referencedOrganizationId,
  );
  assert.ok(organization, "the fixture no longer carries the organisation");
  await mountInspector(organization as never, sent, []);
  assertNoNode(
    container.querySelector("[data-decision-client]"),
    "an organisation was given the control that belongs to a decision",
  );
});
