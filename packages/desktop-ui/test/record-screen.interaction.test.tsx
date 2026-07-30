import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test, vi } from "vitest";

import {
  CommentIdSchema,
  DocumentIdSchema,
  PrincipalIdSchema,
  StrategicRecordIdSchema,
  type QueryProjection,
} from "@constellation/contracts";

import {
  populatedPlanDayKey,
  populatedProjectList,
  populatedShellQueries,
  principalId,
  projectId,
  projectionResponse,
  spaceId,
} from "./shell-fixture.js";

type Projection<Kind extends QueryProjection["kind"]> = Extract<
  QueryProjection,
  { kind: Kind }
>;

// Opening a project shows the RECORD, and the record is reachable from a click.
//
// Everything this file asserts used to be pinned by reading source files as
// text — `className="project-detail-flow"` in `Wave2Surfaces.tsx`, four
// `key: "…"` literals in `ProjectContextSections.tsx`, a `<ClientLinkRow` in a
// footer position. Those files are gone. The guarantees are not, and none of
// them was ever about markup:
//
//   - the destination opens as a COLLECTION and becomes a record only when
//     somebody opens one, and there is a way back;
//   - the record names itself ONCE, at level one, and the shell can still find
//     that heading — it is both the work plane's accessible name and where
//     focus lands after a destination change;
//   - every record a project reaches is reachable FROM the project, once each;
//   - a client can be attached and detached from the record itself, and the
//     two ways a picker can be empty stay two different sentences;
//   - a project with no written outcome offers a way to write it;
//   - switching a tab changes what is on screen, exactly one panel exists, and
//     only the panel on screen holds the keyboard's tab stop;
//   - an answer written under a thread is STORED as an answer to it, and a
//     thread can be settled and a comment corrected from this record.
//
// Those last two are here rather than beside the comments panel on purpose. The
// panel obeys the props it is handed — that is proven where it is mounted
// directly — and both defects this file was extended after were mounts: a
// two-parameter `onAddComment` assignable to a four-parameter prop, which landed
// every reply as a fresh thread, and four comment props left optional and filled
// by nobody, which drew no Edit, no Unlink and no Resolve. Neither is visible
// from the panel, and neither is visible to the compiler.
//
// The proof starts from the navigation, never from a component's own callback.
// A test that mounted the record screen and watched it call `onSelect` would
// prove nothing about the application: the shell is what decides between the
// collection and the record, and the shell is what supplies the two slices the
// screen cannot fetch.

const client = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000009c1",
);
const meeting = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000009c2",
);
const decision = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000009c3",
);
const deliverable = DocumentIdSchema.parse(
  "00000000-0000-4000-8000-0000000009c4",
);
const rootComment = CommentIdSchema.parse(
  "00000000-0000-4000-8000-0000000009c5",
);
const resolvedComment = CommentIdSchema.parse(
  "00000000-0000-4000-8000-0000000009c6",
);

const project = populatedProjectList.items[0]!;

/** One of each kind the record can reach, so "reachable once" is falsifiable in
 *  both directions: a missing exit and a doubled one both show up as a count. */
const overview: Projection<"project.operationalOverview"> = {
  kind: "project.operationalOverview",
  project: {
    id: projectId,
    spaceId,
    title: project.title,
    intendedOutcome: project.intendedOutcome,
    needsReview: false,
    lifecycle: "active",
    version: 7,
    updatedAt: "2026-07-20T14:30:00.000Z",
  },
  relatedTasks: [],
  relatedMeetings: [
    {
      id: meeting,
      title: "Kickoff z zespołem",
      startedAt: "2026-07-15T09:00:00.000Z",
      triage: "ready",
      version: 1,
      updatedAt: "2026-07-15T10:00:00.000Z",
    },
  ],
  relatedDocuments: [
    {
      id: deliverable,
      title: "Raport z warsztatu",
      role: "deliverable",
      version: 2,
      updatedAt: "2026-07-18T12:00:00.000Z",
    },
  ],
  relatedDecisions: [
    {
      id: decision,
      title: "Zakres audytu ustalony",
      state: "current",
      version: 1,
      updatedAt: "2026-07-16T12:00:00.000Z",
    },
  ],
  clientOrganizations: [
    {
      id: client,
      name: "Northstar",
      relationshipState: "active",
      version: 3,
      updatedAt: "2026-07-01T12:00:00.000Z",
    },
  ],
  evidenceSources: [],
};

/** One open root with a reply, and one resolved root. Without the resolved one
 *  the badge counting OPEN roots would read the same as one counting every
 *  root, and the assertion below could not tell them apart. */
const comments: Projection<"comment.list"> = {
  kind: "comment.list",
  target: { kind: "project", projectId },
  threads: [
    {
      id: rootComment,
      rootCommentId: rootComment,
      body: "Czy zakres obejmuje też oddział w Gdańsku?",
      author: { principalId, displayName: "Kacper" },
      mentionPrincipalIds: [],
      attachments: [],
      threadState: "open",
      version: 1,
      createdAt: "2026-07-19T08:00:00.000Z",
      updatedAt: "2026-07-19T08:00:00.000Z",
      edited: false,
    },
    {
      id: resolvedComment,
      rootCommentId: resolvedComment,
      body: "Termin przesunięty, potwierdzone.",
      author: { displayName: "Marta" },
      mentionPrincipalIds: [],
      attachments: [],
      threadState: "resolved",
      version: 1,
      createdAt: "2026-07-18T08:00:00.000Z",
      updatedAt: "2026-07-18T09:00:00.000Z",
      edited: false,
    },
  ],
};

/** Two people, one of them the reader. The reader is filtered out at the call
 *  site — you cannot wake yourself — so a picker that offered both would be a
 *  visible sign that the filter is gone. */
const mentionCandidates: Projection<"comment.mentionCandidates"> = {
  kind: "comment.mentionCandidates",
  spaceId,
  candidates: [
    { principalId, displayName: "Kacper", participantKind: "member" },
    {
      principalId: PrincipalIdSchema.parse(
        "00000000-0000-4000-8000-0000000009c7",
      ),
      displayName: "Marta",
      participantKind: "member",
    },
  ],
};

/** Identity, without which the reader cannot be told apart from anyone else —
 *  and then the mention picker offering "you" would be indistinguishable from
 *  a picker whose filter is gone. The `comment` grant is also what makes the
 *  composer usable at all. */
const access: Projection<"workspace.access"> = {
  kind: "workspace.access",
  policyVersion: 1,
  currentPrincipalId: principalId,
  canManage: true,
  members: [
    {
      membershipId: "00000000-0000-4000-8000-0000000009d1",
      principalId,
      displayName: "Kacper",
      role: "owner",
      status: "active",
      version: 1,
      spaces: [
        {
          spaceGrantId: "00000000-0000-4000-8000-0000000009d2",
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
  "project.operationalOverview": projectionResponse(overview),
  "comment.list": projectionResponse(comments),
  "comment.mentionCandidates": projectionResponse(mentionCandidates),
};

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${populatedPlanDayKey}T09:30:00.000Z`));
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
  vi.useRealTimers();
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

/** Every command the screen issues, in order. The only way to prove what a
 *  composer actually SENDS — a chip that toggles and a sentence that updates
 *  are both satisfied by a panel that drops what it collected on the way to
 *  the kernel, which is the exact defect this file was written after. */
let issued: { name: string; payload: Record<string, unknown> }[] = [];

const mountShell = async (
  overrides: Record<string, unknown> = {},
): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  issued = [];
  const scenario = createScenarioClient({
    queries: { ...queries, ...overrides },
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
  const snapshot = await loadDesktopSnapshot(scenario);
  assert.equal(
    snapshot.projects.kind,
    "ready",
    "the project fixture never reached the snapshot, so this measures nothing",
  );
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(RealApp, { client: scenario, initialSnapshot: snapshot }),
    );
  });
};

const openProjects = async (): Promise<void> => {
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === "projects");
  assert.ok(item, "no navigation target rendered for Projects");
  await act(async () => {
    item.click();
  });
  await waitForCondition(
    () => container.querySelectorAll("[data-project-row]").length > 0,
    "Projects never drew a single row into the work plane",
  );
};

/** Opens the record the way a person does: the collection, then one row. */
const openRecord = async (
  overrides: Record<string, unknown> = {},
): Promise<void> => {
  await mountShell(overrides);
  await openProjects();
  const row = container.querySelector<HTMLElement>(
    `[data-project-row="${projectId}"]`,
  );
  assert.ok(row, "the collection never drew the project this test opens");
  await act(async () => {
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await waitForCondition(
    () => container.querySelector('[data-record-kind="project"]') !== null,
    "opening a project never produced a record screen",
  );
};

const tabs = (): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>('[role="tab"][data-record-tab]'),
];

const tabNamed = (name: string): HTMLElement => {
  const found = tabs().find((tab) => tab.dataset.recordTab === name);
  assert.ok(found, `the record has no ${name} tab`);
  return found;
};

const openTab = async (name: string): Promise<void> => {
  await act(async () => {
    tabNamed(name).click();
  });
};

/** Opens the record and its Comments tab, and answers with the RECORD node.
 *  Every query below is scoped to it: a second comments panel renders in this
 *  shell now — same component, same control names, in the inspector rail — and
 *  an unscoped query would measure whichever one came first in the document. */
const openComments = async (): Promise<HTMLElement> => {
  await openRecord();
  await openTab("comments");
  const record = container.querySelector<HTMLElement>(
    '[data-record-kind="project"]',
  );
  assert.ok(record, "the record screen left the page when its tab changed");
  return record;
};

const buttonIn = (scope: ParentNode, text: string): HTMLElement | undefined =>
  [...scope.querySelectorAll<HTMLElement>("button")].find(
    (button) => (button.textContent ?? "").trim() === text,
  );

/** Types the way a person does. React listens to the input event, and its own
 *  value tracker swallows a plain assignment — a test that skipped the native
 *  setter would leave the panel holding the text it started with, and every
 *  assertion about what was SENT would then be about the stored body. */
const typeInto = async (
  field: HTMLTextAreaElement,
  text: string,
): Promise<void> => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

test("a project opens as a record with one heading the shell can still find", async () => {
  await openRecord();

  // Exactly one `<h1>`, and it is the record's. Two would be two records
  // according to the outline, and the shell would name the work plane after
  // whichever came first in the document.
  const headings = [...container.querySelectorAll("h1")];
  assert.equal(
    headings.length,
    1,
    `the record screen renders ${headings.length} level-one headings`,
  );
  assert.equal(headings[0]?.textContent, project.title);

  // The shell uses this id twice: `aria-labelledby` on the work plane, and the
  // focus target after a destination change. A heading without it leaves the
  // plane unnamed and sends focus to the panel — silently, keyboard only.
  assert.equal(headings[0]?.id, "surface-title");
  assert.equal(headings[0]?.tabIndex, -1);
  const main = container.querySelector<HTMLElement>("main[data-surface]");
  assert.equal(main?.getAttribute("aria-labelledby"), "surface-title");
});

test("the record is left by a control, and leaving it returns the collection", async () => {
  await openRecord();
  const back = [...container.querySelectorAll<HTMLElement>("button")].find(
    (button) => button.textContent?.includes("Projects"),
  );
  assert.ok(back, "the record offers no way back to the collection");
  await act(async () => {
    back.click();
  });
  await waitForCondition(
    () =>
      container.querySelector('[data-record-kind="project"]') === null &&
      container.querySelectorAll("[data-project-row]").length > 0,
    "leaving the record never brought the collection back",
  );
});

test("every record the project reaches is reachable from it, once each", async () => {
  await openRecord();

  // The rail carries the exits that are not collections: the client, the
  // meetings and the decisions. Each is ONE exit, not two — the defect this
  // guards is a section that survived a move and also stayed where it was.
  //
  // Counted by `data-rail-exit` rather than by text, because the same section
  // holds authoring controls that name the same record ("Unlink Northstar")
  // and counting text would report a duplicate that is not one.
  const named = (text: string): HTMLElement[] =>
    [...container.querySelectorAll<HTMLElement>("button")].filter((button) =>
      button.textContent?.includes(text),
    );
  const exits = (): string[] =>
    [...container.querySelectorAll<HTMLElement>("[data-rail-exit]")].map(
      (node) => node.dataset.railExit ?? "",
    );
  const timesInRail = (label: string): number =>
    exits().filter((entry) => entry === label).length;
  // The header names the client; the rail must not name it again. Zero rail
  // exits for the ONLY client is the correct answer, and it is what stops the
  // same exit appearing twice a finger apart.
  assert.equal(timesInRail("Northstar"), 0, "the client exit is drawn twice");
  assert.equal(
    named("Northstar").filter((button) => button.closest("header") !== null)
      .length,
    1,
    "the header does not name the client, so nothing does",
  );
  assert.equal(
    timesInRail("Kickoff z zespołem"),
    1,
    "the meeting exit is not unique",
  );
  assert.equal(
    timesInRail("Zakres audytu ustalony"),
    1,
    "the decision exit is not unique",
  );

  // Documents are a collection, so they are a TAB rather than a rail row — and
  // the tab must actually contain them. Both halves matter: a document listed
  // on the rail as well would be the same duplication from the other side.
  assert.equal(timesInRail("Raport z warsztatu"), 0);
  assert.equal(named("Raport z warsztatu").length, 0);
  await openTab("documents");
  assert.equal(
    named("Raport z warsztatu").length,
    1,
    "the Documents tab does not list the project's document",
  );
});

test("a client can be attached and detached from the record itself", async () => {
  await openRecord();
  const picker = container.querySelector<HTMLSelectElement>(
    "#project-client-link",
  );
  const empties = [...container.querySelectorAll<HTMLElement>("small")].map(
    (node) => node.textContent ?? "",
  );
  // Either a picker is offered, or one of the two DIFFERENT sentences explains
  // why not. What must never happen is silence, and what must never happen is
  // one sentence covering both — a read that did not land is worth retrying, a
  // Space with no organizations is not.
  assert.ok(
    picker !== null ||
      empties.some((text) => text.includes("Could not load organizations")) ||
      empties.some((text) => text.includes("No organization to link")),
    "the record neither offers a client picker nor says why it cannot",
  );

  // Detaching is two-step and in place: a quiet trigger arms the confirm.
  const unlink = [...container.querySelectorAll<HTMLElement>("button")].find(
    (button) => button.textContent?.startsWith("Unlink"),
  );
  if (unlink !== undefined) {
    await act(async () => {
      unlink.click();
    });
    const confirm = [...container.querySelectorAll<HTMLElement>("button")].find(
      (button) => button.textContent === "Confirm unlink",
    );
    assert.ok(
      confirm,
      "the detach acts on the first press instead of arming a confirm",
    );
    // The copy names the DIRECT link, because a client also reached by an
    // opportunity or a meeting stays listed afterwards — without that sentence
    // a working detach reads as broken.
    assert.ok(
      [...container.querySelectorAll("small")].some((node) =>
        node.textContent?.includes("Only the direct link goes"),
      ),
    );
  }
});

test("a project with no written outcome offers a way to write it", async () => {
  const unwritten = {
    ...overview,
    project: { ...overview.project, intendedOutcome: "", needsReview: true },
  };
  await openRecord({
    "project.operationalOverview": projectionResponse(unwritten),
  });

  const write = [...container.querySelectorAll<HTMLElement>("button")].find(
    (button) => button.textContent === "Write the intended outcome",
  );
  assert.ok(write, "an unwritten outcome renders as a blank instead of a gap");
  await act(async () => {
    write.click();
  });
  // The control opens the editor for real. Asserting only that the button
  // exists would pass over a gap wired to nothing, which is the exact shape of
  // the defect this replaces.
  assert.ok(
    container.querySelector("#edited-project-outcome"),
    "the gap's control does not open the outcome editor",
  );
  // And the rest of the record stays: the reader is editing one field, not
  // leaving the record.
  assert.ok(
    container.querySelector('[role="tablist"][aria-label="Record sections"]'),
  );
});

test("the tab bar shows one panel at a time, and the count is open threads", async () => {
  await openRecord();

  // Scoped to the RECORD. The shell's own work plane is a tabpanel too — the
  // record's tab bar nests inside it — so an unscoped count would be two
  // before this screen existed and would never have been able to fail.
  const record = container.querySelector('[data-record-kind="project"]');
  assert.ok(record);
  assert.equal(
    record.querySelectorAll('[role="tabpanel"]').length,
    1,
    "the record renders more than one tabpanel, which breaks its own ARIA",
  );

  // Every tab points at a panel that is actually on the page. A dangling
  // `aria-controls` costs three seconds per destination in the packaged smoke
  // and fails the whole call with a message about a timeout.
  for (const tab of tabs()) {
    const target = tab.getAttribute("aria-controls");
    assert.ok(target, `the ${tab.dataset.recordTab} tab controls nothing`);
    assert.ok(
      container.querySelector(`#${target}`),
      `the ${tab.dataset.recordTab} tab points at an id that is not on the page`,
    );
  }

  // The badge counts UNRESOLVED roots, which is not the number of comments and
  // not the number of roots. The fixture carries one of each so the three
  // possible answers are three different numbers.
  assert.equal(tabNamed("comments").textContent, "Comments1");

  await openTab("comments");
  assert.ok(
    record.querySelector('textarea[aria-label="Write a comment"]'),
    "the Comments tab does not offer a way to comment",
  );
  // A comment does not wake anyone; a mention does. The composer has to be
  // able to CREATE one, and it has to say which of the two this comment is
  // before it is sent — a panel whose every sentence is about mentions while
  // its composer can only send a plain comment is a dummy with a paragraph of
  // documentation attached.
  const reach = () =>
    [...record.querySelectorAll<HTMLElement>("p")].find((node) =>
      /notified\./u.test(node.textContent ?? ""),
    )?.textContent;
  assert.equal(reach(), "Nobody is notified.");
  // Scoped to the RECORD's panel. The shell can have an inspector open beside
  // it with a comment composer of its own, and an unscoped query would count
  // that one's chips too — measuring the wrong screen while looking right.
  const chips = [
    ...record.querySelectorAll<HTMLElement>(
      "[data-principal-id][aria-pressed]",
    ),
  ];
  const chip = chips[0];
  assert.ok(chip, "the composer offers no way to name anybody");
  // The reader is not on the list. Waking yourself is not a thing to offer.
  assert.equal(chips.length, 1, "the mention picker offers the reader");
  await act(async () => {
    chip.click();
  });
  assert.equal(chip.getAttribute("aria-pressed"), "true");
  assert.equal(reach(), "1 person will be notified.");

  // And the name reaches the COMMAND. Without this the panel could collect a
  // mention, say it would notify somebody, and send an empty list — every
  // assertion above would still pass and nobody would ever be woken.
  const field = record.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Write a comment"]',
  );
  assert.ok(field);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(field, "Czy to jeszcze aktualne?");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    record
      .querySelector<HTMLFormElement>("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  const added = issued.find((command) => command.name === "comment.add");
  assert.ok(added, "writing a comment issued no command at all");
  assert.deepEqual(
    added.payload["mentionPrincipalIds"],
    [chip.dataset.principalId],
    "the comment reached the kernel without the person it names",
  );
  // The resolved thread is hidden behind its valve rather than absent: settled
  // work stays reachable and is never the first thing read.
  //
  // Scoped to the RECORD, like every neighbour above. One comments panel is on
  // screen today, so unscoped happened to measure the right one; the shell is
  // about to mount a second in the inspector rail, and an unscoped query would
  // then go green on somebody else's valve while this record's was missing.
  assert.ok(
    [...record.querySelectorAll<HTMLElement>("button")].some((button) =>
      button.textContent?.includes("1 resolved"),
    ),
    "the record's own Comments panel does not offer the resolved valve",
  );
});

test("an answer written on the project record is stored as an answer", async () => {
  const record = await openComments();

  // Started from the thread on screen, never from the panel's callback. The
  // screen forwards FOUR arguments to `onSubmit`, and a two-parameter function
  // is assignable to that prop while silently dropping the last two — which is
  // what shipped: every reply here landed as a fresh root and the staged files
  // went with it. Nothing on screen changes when that happens, so the payload is
  // the only place the defect is visible.
  const thread = record.querySelector<HTMLElement>(
    `[data-thread-root="${rootComment}"]`,
  );
  assert.ok(thread, "the open thread this test answers was never drawn");
  const reply = buttonIn(thread, "Reply");
  assert.ok(reply, "the project record offers no way to answer a thread");
  await act(async () => {
    reply.click();
  });

  const field = record.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Write a comment"]',
  );
  assert.ok(field, "the composer disappeared when a thread was answered");
  // The composer PROMISES it is answering that thread. Without this the payload
  // assertion below would be about a broken promise nobody made.
  assert.equal(
    field.closest("form")?.getAttribute("aria-label"),
    "Reply in the thread by Kacper",
  );
  await typeInto(field, "Tak, oddział w Gdańsku też.");
  await act(async () => {
    field
      .closest("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  const added = issued.find((command) => command.name === "comment.add");
  assert.ok(added, "answering a thread issued no command at all");
  assert.equal(
    added.payload["parentCommentId"],
    rootComment,
    "the answer reached the kernel as a new thread instead of an answer",
  );
  assert.equal(added.payload["body"], "Tak, oddział w Gdańsku też.");
});

test("a thread is settled from the project record, and a refusal is stated", async () => {
  const record = await openComments();
  const thread = record.querySelector<HTMLElement>(
    `[data-thread-root="${rootComment}"]`,
  );
  assert.ok(thread, "the record drew no thread to settle");

  // DRAWN first, because that is the half that shipped broken: four comment
  // props were optional here and filled by nobody, so this record offered no
  // Edit, no Unlink and no Resolve while the organization record offered all
  // three. A capability that silently is not there looks exactly like one
  // nobody built.
  const settle = buttonIn(thread, "Resolve");
  assert.ok(settle, "the project record offers no way to settle a thread");
  await act(async () => {
    settle.click();
  });

  const resolved = issued.find((command) => command.name === "comment.resolve");
  assert.ok(resolved, "settling a thread here issued no command at all");
  assert.equal(resolved.payload["commentId"], rootComment);
  // This harness refuses every command, and the panel READS the answer. A
  // thread that did not settle, drawn exactly like one that did, is how a
  // refused write goes missing without anybody noticing. Waited for as a
  // CONDITION: the refusal travels back through the shell's own promise chain,
  // and a fixed number of microtasks measures that chain's length instead.
  await waitForCondition(
    () => record.textContent?.includes("That change was refused.") === true,
    "a refused settle is drawn exactly like one the kernel accepted",
  );

  // `canResolve` is the one comment prop nothing above can see: this reader
  // wrote the thread they just settled, and an author may always settle their
  // own. Marta's cannot be settled without the grant — and it lives behind the
  // valve, which is where a thread somebody else closed goes.
  const valve = buttonIn(record, "Show 1 resolved");
  assert.ok(valve, "the record's own panel offers no resolved valve");
  await act(async () => {
    valve.click();
  });
  const other = record.querySelector<HTMLElement>(
    `[data-thread-root="${resolvedComment}"]`,
  );
  assert.ok(other, "the valve opened onto nothing");
  assert.ok(
    buttonIn(other, "Reopen"),
    "a thread somebody else closed offers no way back in, so the grant never reached the panel",
  );
});

test("a comment corrected on the project record sends the corrected text", async () => {
  const record = await openComments();
  const thread = record.querySelector<HTMLElement>(
    `[data-thread-root="${rootComment}"]`,
  );
  assert.ok(thread, "the record drew no thread to correct");

  const edit = buttonIn(thread, "Edit");
  assert.ok(edit, "the project record offers no way to correct a comment");
  await act(async () => {
    edit.click();
  });
  const editor = record.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Edit comment"]',
  );
  assert.ok(editor, "the Edit control opens no editor");

  await typeInto(editor, "Czy zakres obejmuje Gdańsk i Gdynię?");
  const save = buttonIn(thread, "Save");
  assert.ok(save, "the open editor offers no way to save");
  await act(async () => {
    save.click();
  });

  const edited = issued.find((command) => command.name === "comment.edit");
  assert.ok(edited, "saving a correction issued no command at all");
  assert.equal(edited.payload["commentId"], rootComment);
  // The TYPED text, not the stored body. The editor falls back to the comment's
  // own body, so an edit whose input never reached the panel still issues a
  // command — carrying exactly what was there before, which would pass an
  // assertion that only checked a command had been sent.
  assert.equal(edited.payload["body"], "Czy zakres obejmuje Gdańsk i Gdynię?");
});

test("a finished task on the record says so", async () => {
  // The panel lists closed work on purpose — hiding it would make the
  // composition bar above unverifiable — and the group heading is the STATUS,
  // so a workspace whose statuses do not end in a "Done" one puts finished and
  // live work under one heading. Seen on a real record: fifty rows, twelve of
  // them finished, nothing telling them apart.
  await openRecord();
  await openTab("tasks");
  const rows = [...container.querySelectorAll<HTMLElement>("[data-task-row]")];
  const done = rows.filter((row) =>
    /(^|, )done(,|$)/u.test(row.getAttribute("aria-label") ?? ""),
  );
  const closed = rows.length - done.length;
  assert.ok(
    rows.length > 0,
    "the fixture carries no tasks, so this measures nothing",
  );
  // Both kinds present, or the assertion cannot fail in either direction.
  assert.ok(done.length > 0 && closed > 0, "the fixture has only one kind");
  for (const row of done)
    assert.ok(
      row.querySelector("[data-row-title] span") !== null,
      "a finished row carries no mark, only a colour",
    );
});

test("only the panel on screen holds a tab stop", async () => {
  await openRecord();

  // Overview draws no selectable rows at all, so nothing on screen may claim a
  // roving index. The defect this guards is the opposite: a panel built while
  // another is showing spends indices on rows nobody can see, and the visible
  // panel is left with no `tabindex="0"` at all.
  await openTab("overview");
  assert.equal(
    container.querySelectorAll('[data-task-row][tabindex="0"]').length,
    0,
    "a hidden Tasks panel is holding the record's tab stop",
  );
  assert.equal(
    container.querySelectorAll("[data-task-row]").length,
    0,
    "the Tasks panel is built while the Overview is the panel on screen",
  );

  await openTab("tasks");
  const stops = container.querySelectorAll('[data-task-row][tabindex="0"]');
  // AT MOST one, not exactly one: this project's tasks come from
  // `work.overview`, and a fixture with none is a legitimate record.
  assert.ok(
    stops.length <= 1,
    `${stops.length} rows are Tab stops; the record must have at most one`,
  );
  if (container.querySelectorAll("[data-task-row]").length > 0)
    assert.equal(stops.length, 1, "the visible Tasks panel has no tab stop");
});
