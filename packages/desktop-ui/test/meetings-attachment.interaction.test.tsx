import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import type { CommandEnvelope, QueryEnvelope } from "@constellation/contracts";
import type {
  ConstellationRendererClient,
  RendererCommandResponse,
} from "@constellation/desktop-preload/client";

import { createScenarioClient } from "../src/client/scenario-client.js";
import { MeetingsSurface } from "../src/MeetingsSurface.js";
import { assertNoNode } from "./dom-assert.js";
import { projectionResponse } from "./shell-fixture.js";
import {
  agentNoteId,
  backlinksFixture,
  detachedNoteId,
  meetingLoopFixture,
  routedProjectId,
  selectedMeetingId,
  spaceId,
} from "./meetings-fixture.js";

/* DECISIONS #32 AND #33 ON THE SHIPPED MEETINGS SCREEN.
 *
 * #32 — THE AGENT ATTACHES BY ITSELF, THE HUMAN DETACHES. The prototype's B42
 * pinned this as markup ("`data-mt-detach` present, `data-mt-attach` absent").
 * That phrasing is copy-bound and would pass over a Detach button wired to an
 * acceptance command. What is asserted here instead is the COMMAND the row can
 * dispatch, the AUTHORSHIP it shows, and — the half a one-sided version misses
 * — that no control anywhere on the surface accepts, approves or attaches.
 *
 * #33 — NOTHING COUNTS WHAT THE IMPORTER THOUGHT IT HEARD. `workItems.length`
 * SURVIVES: it is the length of the list rendered beside it, and #33 killed a
 * DERIVED DIFFERENCE, not a count. So the guard is a SHAPE guard and not a
 * list of forbidden sentences — this repo has watched a phrase list fail three
 * times, because every new screen can write a new sentence. The property:
 * every number the surface renders is the length of a list the surface also
 * renders. A residue counter is a number that is nobody's list length, so it
 * cannot satisfy it however it is worded.
 */

let container: HTMLElement;
let root: Root;
let mounted = false;
let inspectorHost: HTMLElement;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  inspectorHost = document.createElement("div");
  inspectorHost.className = "inspector";
  document.body.append(container, inspectorHost);
});

afterEach(() => {
  if (mounted) act(() => root.unmount());
  mounted = false;
  container.remove();
  inspectorHost.remove();
});

const waitFor = async (
  predicate: () => boolean,
  message: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  assert.fail(message);
};

type Mounted = {
  readonly commands: CommandEnvelope[];
  readonly detachedNow: () => readonly string[];
};

const mountMeetings = async (): Promise<Mounted> => {
  // Derived from the clock the test runs on, never pinned: a fixture whose
  // instants are written down is a defect with a delay fuse.
  const now = Date.now();
  const commands: CommandEnvelope[] = [];
  let detached: readonly string[] = [detachedNoteId];
  const base = createScenarioClient({
    queries: {
      // The routing reads, so the third test below can see whether the selects
      // this screen has always drawn actually offer anything.
      "project.list": projectionResponse({
        kind: "project.list",
        items: [
          {
            id: routedProjectId,
            spaceId,
            title: "Northstar rollout",
            intendedOutcome: "The pilot enters release review.",
            needsReview: false,
            lifecycle: "active",
            relatedOpenTaskCount: 0,
            version: 1,
            updatedAt: new Date(now).toISOString(),
          },
        ],
      }),
    },
  });
  const client: ConstellationRendererClient = {
    ...base,
    getJamieStatus: async () => ({ configured: true, scope: "personal" }),
    getMeetingLoop: async () => meetingLoopFixture(now, detached),
    runQuery: async (query: QueryEnvelope) =>
      query.queryName === "document.backlinks"
        ? projectionResponse(backlinksFixture(now))
        : base.runQuery(query),
    executeCommand: async (command: CommandEnvelope) => {
      commands.push(command);
      if (command.commandName === "meeting.detachNote") {
        const payload = command.payload as {
          readonly documentId: string;
          readonly detached: boolean;
        };
        detached = payload.detached
          ? [...detached, payload.documentId]
          : detached.filter((id) => id !== payload.documentId);
      }
      return {
        kind: "command_outcome",
        outcome: {
          contractVersion: 1,
          commandId: command.commandId,
          correlationId: command.correlationId,
          kernelTime: new Date(now).toISOString(),
          outcome: "success",
          diagnosticCode: "strategic.record_changed",
          affected: [],
          auditReceiptId: "90000000-0000-4000-8000-00000000000a",
          projection: {
            kind: "strategic.record_changed",
            recordId: selectedMeetingId,
            recordType: "meeting",
            version: 5,
          },
        },
      } as unknown as RendererCommandResponse;
    },
  };
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(MeetingsSurface, {
        client,
        inspectorHost,
        onInspectorOpen: () => undefined,
        onMeetingSelected: () => undefined,
        onOpenSources: () => undefined,
      }),
    );
  });
  await waitFor(
    () => container.querySelector(".meeting-result-row") !== null,
    "the imported results never rendered",
  );
  await act(async () => {
    container.querySelector<HTMLElement>(".meeting-result-row")!.click();
  });
  await waitFor(
    () =>
      inspectorHost.querySelector(".meeting-result-notes ul") !== null ||
      inspectorHost.querySelector(".meeting-result-notes p") !== null,
    "the attached-notes section never rendered",
  );
  return { commands, detachedNow: () => detached };
};

const attachedTitles = (): string[] =>
  [...inspectorHost.querySelectorAll(".meeting-attached-note strong")].map(
    (node) => node.textContent ?? "",
  );

test("#32 — an agent's note is already attached, and the only operation offered is taking it off", async () => {
  const { commands } = await mountMeetings();

  // The read is the whole first half of #32, and it is what the shipped screen
  // never did: `document.backlinks` is asked, per meeting.
  assert.ok(
    attachedTitles().includes("What the room agreed about the rollout"),
    "the agent's note is not listed on the meeting it points at",
  );
  // Authorship is visible, and it is an agent's. #32 removed the gate and kept
  // exactly this in its place — a row with no author gives a reader nothing to
  // judge, and judging is now their whole part.
  const agentRow = [
    ...inspectorHost.querySelectorAll(".meeting-attached-note"),
  ].find((node) =>
    node.textContent?.includes("What the room agreed about the rollout"),
  );
  assert.ok(agentRow, "the agent's note has no row");
  assert.match(agentRow.textContent ?? "", /Hermes attached this/u);

  // THE SUPPRESSION IS IN EFFECT ON THE READ. The detached note comes back
  // from `document.backlinks` — the note keeps its own reference — and does
  // not appear on the meeting.
  assert.equal(
    backlinksFixture(Date.now()).items.length,
    6,
    "the fixture no longer offers six backlinks, so the subtraction proves nothing",
  );
  assert.equal(attachedTitles().length, 5);
  assert.ok(
    !attachedTitles().includes("A note the reader took off this meeting"),
    "a note the reader detached is still listed on the meeting",
  );

  // NO ACCEPTANCE GATE ANYWHERE ON THE SURFACE. Asserting only that Detach
  // exists would pass over an Accept button beside it, which is the exact
  // shape #32 forbids.
  for (const scope of [container, inspectorHost]) {
    for (const control of scope.querySelectorAll("button")) {
      assert.doesNotMatch(
        control.textContent ?? "",
        /\b(accept|approve|attach)\b/iu,
        `a control offering to accept an attachment reached the screen: ${control.textContent}`,
      );
    }
  }
  assertNoNode(
    inspectorHost.querySelector("[data-meeting-attach]"),
    "an attach control reached the inspector",
  );

  // The command the row dispatches, and its payload — not the markup that
  // happens to carry it today.
  const detach = inspectorHost.querySelector<HTMLButtonElement>(
    `[data-meeting-detach="${agentNoteId}"]`,
  );
  assert.ok(detach, "the agent's note offers no Detach");
  await act(async () => {
    detach.click();
  });
  await waitFor(
    () => commands.some((c) => c.commandName === "meeting.detachNote"),
    "Detach dispatched no command",
  );
  const sent = commands.find((c) => c.commandName === "meeting.detachNote")!;
  assert.deepEqual(sent.payload, {
    meetingId: selectedMeetingId,
    documentId: agentNoteId,
    detached: true,
  });
  // The meeting's version is the whole precondition. The note is not written
  // by this command, so its version is not part of it.
  assert.deepEqual(sent.expectedVersions, { [selectedMeetingId]: 4 });

  await waitFor(
    () => !attachedTitles().includes("What the room agreed about the rollout"),
    "the detached note is still listed",
  );

  // The reversal is where the reader's hands already are, and it holds the
  // focus: work you have to find yourself again in after every move is what
  // this screen exists to spare.
  const reattach = inspectorHost.querySelector<HTMLButtonElement>(
    `[data-meeting-reattach="${agentNoteId}"]`,
  );
  assert.ok(reattach, "a detach with no reversal reached the screen");
  // Compared by ATTRIBUTE, never by node. `assert.equal` on two DOM nodes
  // kills the vitest worker outright when it fails — the run reports a crashed
  // worker instead of a failed assertion, which is an instrument that hides
  // its own result. This repo has met that trap twice.
  assert.equal(
    document.activeElement?.getAttribute("data-meeting-reattach") ?? null,
    agentNoteId,
    "the focus fell out of the list after a detach",
  );
  await act(async () => {
    reattach.click();
  });
  await waitFor(
    () => attachedTitles().includes("What the room agreed about the rollout"),
    "the note never came back",
  );
  const back = commands.filter((c) => c.commandName === "meeting.detachNote");
  assert.equal(back.length, 2);
  assert.deepEqual(back[1]!.payload, {
    meetingId: selectedMeetingId,
    documentId: agentNoteId,
    detached: false,
  });
});

/* #33's GUARD, AS A SHAPE.
 *
 * Every integer the surface renders must be the length of a list the surface
 * also renders. Two halves that a single-sided version would miss:
 *
 *   • `aria-label` is swept as well as visible text. `workItems.length` is
 *     rendered into the row's label AND into its visible meta, so a residue
 *     number planted in a label alone would walk past a text-only scan — the
 *     exact half-measure this repo keeps catching.
 *   • Timestamps are removed rather than pattern-matched away. Every instant
 *     on this screen renders inside a `<time>`, and the same string is
 *     inlined into the label, so the label has the `<time>` text subtracted
 *     from it. A regular expression for "this looks like a date" would grow a
 *     hole the first time a format changed.
 *
 * And the instrument checks ITSELF first: if two lists were the same length,
 * or if no list were rendered at all, the guard would pass over a residue
 * counter that happened to collide. It refuses to run in that state.
 */

/* Every repeated group of rows the surface draws, as its size.
 *
 * A "list" here is not only a `<ul>`: the Coming-up lane repeats `<article>`
 * siblings and its "1 event" counts exactly those. Restricting the witness set
 * to `<li>` would have made a real count look computed, which is the false
 * ALARM direction — but the reason it is written this way is the other
 * direction: a witness set that is too generous lets a residue number find a
 * coincidental match, so the self-check below names the residue values this
 * fixture must NOT be able to witness.
 */
const groupSizes = (): number[] => {
  const sizes: number[] = [];
  for (const scope of [container, inspectorHost]) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT);
    for (let node: Node | null = scope; node; node = walker.nextNode()) {
      const groups = new Map<string, number>();
      for (const child of (node as Element).children) {
        if (child.tagName !== "LI" && child.tagName !== "ARTICLE") continue;
        const key = `${child.tagName}.${child.className}`;
        groups.set(key, (groups.get(key) ?? 0) + 1);
      }
      sizes.push(...groups.values());
    }
  }
  return sizes;
};

const numbersRendered = (): {
  readonly value: number;
  readonly where: string;
}[] => {
  const found: { value: number; where: string }[] = [];
  const collect = (text: string, where: string) => {
    // Count-shaped: an integer standing next to a word. `countLabel` is the
    // only producer of a record count on this surface and this is its shape.
    //
    // A DURATION IS NOT A COUNT OF RECORDS, and "Sync the last 90 days" is one.
    // The exclusion is by UNIT — a closed vocabulary of time words — and not by
    // sentence: #33 forbids a number derived from what the importer believed a
    // transcript held, which is always a count of records and never a span of
    // time, so nothing this skips is a thing the decision is about.
    for (const match of text.matchAll(/(?<![\p{L}\d])(\d+)\s*(\p{L}+)/gu)) {
      if (
        /^(sec|secs|second|min|mins|minute|hr|hrs|hour|day|week|month|year)s?$/iu.test(
          match[2] ?? "",
        )
      )
        continue;
      found.push({ value: Number(match[1]), where });
    }
  };
  for (const scope of [container, inspectorHost]) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      // Inside a <time> is an instant, not a count.
      if ((node.parentElement?.closest("time") ?? null) !== null) continue;
      collect(
        node.textContent ?? "",
        node.parentElement?.outerHTML?.slice(0, 120) ?? "text",
      );
    }
    for (const labelled of scope.querySelectorAll("[aria-label]")) {
      let label = labelled.getAttribute("aria-label") ?? "";
      for (const time of labelled.querySelectorAll("time")) {
        label = label.split(time.textContent ?? " ").join(" ");
      }
      collect(label, `aria-label on ${labelled.tagName.toLowerCase()}`);
    }
  }
  return found;
};

test("#33 — every number on the Meetings surface is the length of a list beside it", async () => {
  await mountMeetings();

  const witnesses = [...new Set(groupSizes())];
  // THE INSTRUMENT, FIRST. An empty measurement is an instrument failure, and
  // a witness set that happens to contain a residue value would let the guard
  // pass over the exact defect #33 forbids. Both are named rather than hoped
  // for: 9 action items, 5 attached notes, 3 results, 2 participants, 1 event,
  // and NEITHER 7 (imported − promoted) NOR 4 (imported − attached).
  assert.deepEqual(
    [...witnesses].sort((left, right) => left - right),
    [1, 2, 3, 5, 9],
    `the fixture's cardinalities changed (${witnesses.join(", ")}) — re-derive the residue values this guard is supposed to catch`,
  );

  const allowed = new Set([...witnesses, 0]);
  const unwitnessed = numbersRendered().filter(
    (entry) => !allowed.has(entry.value),
  );
  assert.deepEqual(
    unwitnessed,
    [],
    `a number on the Meetings surface is nobody's list length — it was computed, not counted:\n${unwitnessed
      .map((entry) => `  ${entry.value} (${entry.where})`)
      .join("\n")}`,
  );
});

/* A LIVE DEFECT ON `main`, FOUND BY WRITING A SECOND READ BESIDE THE FIRST.
 *
 * `loadRoutingOptions` built a QUERY envelope carrying `correlationId` — a
 * field a query envelope does not have — and omitting the required
 * `consistency`. `QueryEnvelopeSchema.parse` therefore threw inside an async
 * function, the rejection landed in the `catch` that exists so an unreadable
 * destination list does not take the screen down, and the Project and Client
 * selects have been permanently empty: `meeting.route` was unreachable from
 * the interface with nothing red anywhere.
 *
 * The assertion is on the OPTIONS the select offers, not on the envelope. An
 * envelope assertion would have to restate the schema; what a reader loses
 * when this breaks is the ability to route the meeting, so that is what is
 * measured.
 */
test("the routing selects offer the destinations the query returns", async () => {
  await mountMeetings();
  const select = inspectorHost.querySelector<HTMLSelectElement>(
    "#meeting-routing-project",
  );
  assert.ok(select, "the inspector offers no project select");
  assert.deepEqual(
    [...select.options].map((option) => option.textContent),
    ["No project", "Northstar rollout"],
    "the project select is empty — the routing read failed and the screen said nothing",
  );
});
