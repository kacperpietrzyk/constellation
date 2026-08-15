import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import { StrategicRecordIdSchema } from "@constellation/contracts";

import type { ScenarioFixtures } from "../src/client/scenario-client.js";
import { conceptHelpTopics } from "../src/components/ConceptHelpDialog.js";
import { helpTopics } from "../src/help/help-topics.js";
import { assertNoNode, assertSameNode } from "./dom-assert.js";
import {
  opportunityRecordId,
  populatedRelationshipWorkspace,
  populatedBootstrap,
  populatedProjectList,
  populatedShellQueries,
  principalId,
  projectionResponse,
  referencedOrganizationId,
  spaceId,
  workspaceId,
} from "./shell-fixture.js";

/* ASSERTION C24 — EVERY QUESTION MARK IS A REAL BUTTON, POINTING AT A TOPIC
 * THAT EXISTS, AND HELP NEVER RETREATS INTO `title=`.
 *
 * The claim has two halves and a single-half version of it is worthless:
 *
 *   • Looking only at what IS a trigger passes trivially when a trigger was
 *     deleted or turned into a `<span title="…">` — the set to inspect simply
 *     gets smaller. So each route's set of `data-help-topic` values is compared
 *     BOTH WAYS against the topics that route is supposed to carry.
 *   • Looking only at the topics passes over an explanation that came back as a
 *     hover tooltip somewhere else on the same screen. So every route is also
 *     swept for `title=` outright, including the two CRM routes that carry no
 *     help at all.
 *
 * WHY EVERY ROUTE WAITS FOR REAL CONTENT FIRST. A lazy surface can mount empty
 * and stay green in three gates at once; a screen with no rows has no anchors,
 * so "no `title=` and no stray trigger" would be true of a blank page. Each
 * route below waits for the thing its help hangs beside before it asserts.
 *
 * THIS FILE'S TOTALITY IS A FUNCTION OF WHICH SCREENS IT MOUNTS, and that
 * sentence is here because the omission was real and cost a registry entry.
 * "Nothing else draws that mark" is swept per SCOPE, so a mark on a screen no
 * test below mounts is not caught — it is simply not looked at. Until the L7
 * acceptance review the two screens nobody looked at were the landing surface
 * and the Inbox, which between them carry four of the six marks lot L7 added.
 *
 * EVERY HELP ANCHOR IN THE PRODUCT AND THE CHANNEL THAT SEES IT, counted in
 * the sources rather than assumed — 22 anchors, and a new one on a screen that
 * is not in this list is invisible to all three channels until somebody adds
 * the mount:
 *   • this file — Today, Inbox, Organizations, Pipeline, Renewals, People,
 *     the opportunity record, Meetings (+ its inspector), Sources, Notes,
 *     Projects (both lenses), the capture history;
 *   • `calendar.interaction.test.tsx` — the Calendar twin, by class, glyph and
 *     name, because the pixel pass cannot reach a week with a meeting in it;
 *   • `settings-navigation-contract.test.ts` — the three Settings anchors,
 *     over the SOURCE, because Settings is a mode and no routed stop enters it.
 */

/* DWIE TABLICE, JEDEN SŁOWNIK DEKLARACJI — i obie są ZAMKNIĘTE oraz OBIE
 * wyprowadzone, a nie przepisane. Pomoc na żądanie otwiera w tej aplikacji dwa
 * różne panele: dymek `TopicHelp` (tematy ≤180 znaków) i okno pojęciowe
 * `ConceptHelpDialog` (SZEŚĆ tematów z nawigatorem — policzone w źródle,
 * `conceptHelpTopics`; „pięć" stało tu do przeglądu odbiorczego L7 i było
 * liczbą przepisaną, a nie odczytaną). Lot L7 Fazy II zbiegł
 * WYZWALACZ obu do jednej formy i do jednej deklaracji (`data-help-topic`),
 * więc ten zbiór musi znać oba źródła — inaczej znacznik na Dzisiaj,
 * na Kalendarzu, na Spotkaniach albo w Ustawieniach czytałby się jako
 * „wyzwalacz wskazujący na temat, który nie istnieje".
 *
 * DLACZEGO NIE TRZECI ATRYBUT DLA OKNA POJĘCIOWEGO, co było pierwszym
 * pomysłem tego lotu: druga deklaracja obok zamkniętego słownika to nazwana
 * w tym repozytorium klasa długu, a asercja z dwiema gałęziami jest dokładnie
 * tym miejscem, w którym trzecia forma pomocy weszłaby niezauważona. */
const KNOWN_TOPIC_IDS = new Set<string>([
  ...helpTopics.map((topic) => topic.id),
  ...conceptHelpTopics.map((topic) => topic.id),
]);

/* CO WIDZI OKO — i to jest CELOWO coś innego niż `accessibleName` wyżej.
 *
 * Tamta funkcja WYCINA poddrzewa `aria-hidden`, bo pyta o nazwę, którą usłyszy
 * czytnik ekranu, a treść schowana przed czytnikiem tej nazwy nie tworzy. Ta
 * funkcja ich NIE wycina, bo pyta o kształt narysowany na ekranie —
 * `aria-hidden` nie chowa niczego przed okiem.
 *
 * RÓŻNICA JEST DOWIEDZIONA, NIE ESTETYCZNA. Martwy pytajnik Projektów, który
 * przez cztery wydania stał pod zieloną asercją „ten ekran nie niesie pomocy",
 * był napisany dokładnie tak:
 *   `<button aria-label="How health is worked out"><span aria-hidden="true">?</span></button>`
 * Zamiatanie oparte na `accessibleName` zobaczyłoby tam PUSTY napis i przeszłoby
 * obok — czyli powtórzyłoby dokładnie tę ślepotę, którą ma zamykać. */
const visibleText = (element: Element): string =>
  (element.textContent ?? "").trim();

/* ZAKRESEM JEST EKRAN, A NIE JEGO PRZEWIJANE PUDEŁKO — dwa ekrany CRM-owej
 * listy noszą tu inny adres niż pozostałe i to nie jest niekonsekwencja.
 *
 * Lot D10 wyprowadził pasmo tytułu i pasek widoku POZA `.surface-scroll`, żeby
 * były rodzeństwem przewijanego pudełka, jak w prototypie. Atrybuty
 * `data-organizations-surface` i `data-people-surface` zostały NA PUDEŁKU, więc
 * przestały być przodkami obu pasm — a znacznik pomocy Organizacji wisi właśnie
 * w pasku widoku (`StrategicDepthSurface.tsx`, „HELP ON DEMAND (#35)"). Ten test
 * zobaczył to jako zniknięcie tematu; test Ludzi, który spodziewa się PUSTEGO
 * zbioru, przeszedł CICHO nad zakresem mniejszym o dwa pasma — czyli dokładnie
 * ta połowa asercji, przed którą przestrzega nagłówek wyżej.
 *
 * Kotwicą jest więc deklaracja obejmująca oba pasma i treść pod nimi. `main`
 * jest konieczne, bo ten sam atrybut niesie pozycja nawigacji; ta sama kotwica
 * i z tego samego powodu stoi już w mapie par (`scripts/visual-language-pairs
 * .mjs`, para `D6-04a`). Zamiatanie `title=` i „co jest przyciskiem" obejmuje
 * odtąd również pasma — to jest zakres SZERSZY niż przed lotem D10, nie
 * przywrócony.
 */
const organizationsScreen = 'main[data-surface="organizations"]';
const peopleScreen = 'main[data-surface="people"]';
// Lot R3 wyniósł pasma tych samych trzech ekranów: Ludzie (wyżej), Zadania
// i Lejek. Na Lejku w pasku widoku stoi plakietka „not configured" i wiszący
// przy niej temat pomocy, więc bez tej kotwicy trzytematowa deklaracja niżej
// zamieniłaby się CICHO w dwutematową.
const pipelineScreen = 'main[data-surface="pipeline"]';

/* The name a screen reader would give the control.
 *
 * `textContent` ALONE IS NOT THAT NAME, and the difference is the whole point
 * here: `<button><span aria-hidden="true">?</span></button>` has a text content
 * of "?" and an accessible name of NOTHING. A check that fell back to
 * `textContent` would call that button named, which is the shape of assertion
 * this wave keeps catching — green while the guarantee is broken. So hidden
 * subtrees are removed before the text is read, on a clone, so the assertion
 * cannot alter the screen it is measuring.
 */
const accessibleName = (element: Element): string => {
  const labelled = element.getAttribute("aria-label");
  if (labelled !== null) return labelled.trim();
  const clone = element.cloneNode(true) as Element;
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }
  return (clone.textContent ?? "").trim();
};

let container: HTMLDivElement;
let root: Root;
let mounted = false;

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

const waitFor = async (
  ready: () => boolean,
  message: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (ready()) return;
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }
  assert.fail(message);
};

/* THE FIXTURE'S ONLY CONTRACT IS ALREADY INSIDE ITS LEAD WINDOW, and
 * `Add to contract` is offered to contracts that are NOT yet — `canAmend` is
 * `startAction > 0` (`renewals-view.ts:130`). So the anchor the amendment topic
 * hangs on does not exist on the shared fixture at all, and the first run of
 * this file said so rather than passing with a topic nobody could reach. One
 * watching contract is composed here, expiring far enough out that time cannot
 * move it into the other section and turn this file red on a date nobody chose.
 */
const watchingRenewalId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000000f1",
);

const watchingQueries: ScenarioFixtures["queries"] = {
  ...populatedShellQueries,
  "relationship.workspace": projectionResponse({
    ...populatedRelationshipWorkspace,
    records: [
      ...populatedRelationshipWorkspace.records,
      {
        workspaceId,
        spaceId,
        createdBy: principalId,
        recordState: "active" as const,
        version: 1,
        createdAt: "2026-06-01T08:00:00.000Z",
        updatedAt: "2026-07-20T14:30:00.000Z",
        id: watchingRenewalId,
        kind: "renewal" as const,
        title: "Umowa utrzymaniowa — druga lokalizacja",
        organizationId: referencedOrganizationId,
        scope: "Wsparcie 24/7, dwa środowiska",
        ownerPrincipalId: principalId,
        evidenceSourceIds: [],
        cycleKey: `${referencedOrganizationId}:2099-01-31`,
        state: "watching" as const,
        expiresAt: "2099-01-31T00:00:00.000Z",
        leadTimeDays: 60,
      },
    ],
  }),
};

const mountShell = async (
  queries: ScenarioFixtures["queries"] = populatedShellQueries,
): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries });
  const snapshot = await loadDesktopSnapshot(client);
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });
};

const goTo = async (surface: string): Promise<void> => {
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === surface);
  assert.ok(item, `no navigation target rendered for ${surface}`);
  await act(async () => {
    item.click();
  });
};

const surfaceNode = (selector: string): HTMLElement => {
  const node = container.querySelector<HTMLElement>(selector);
  assert.ok(node, `${selector} is not on screen`);
  return node;
};

/** Every help anchor drawn on the screen, as topic ids, sorted. */
const topicsOn = (scope: HTMLElement): string[] =>
  [...scope.querySelectorAll<HTMLElement>("[data-help-topic]")]
    .map((node) => node.dataset.helpTopic ?? "")
    .sort();

const assertHelpContract = (scope: HTMLElement, expected: string[]): void => {
  // 1. The topics on this screen, both directions. A count would pass over a
  //    swap, and a subset check would pass over a deleted trigger.
  assert.deepEqual(
    topicsOn(scope),
    [...expected].sort(),
    "the help topics anchored on this screen are not the ones it is supposed to carry",
  );

  // 2. Every anchor is a REAL button that announces it opens a dialog, with a
  //    name, pointing at a topic that exists.
  for (const anchor of scope.querySelectorAll<HTMLElement>(
    "[data-help-topic]",
  )) {
    const id = anchor.dataset.helpTopic ?? "";
    assert.ok(
      KNOWN_TOPIC_IDS.has(id),
      `a help trigger points at "${id}", which is not a topic that exists`,
    );
    const trigger = anchor.querySelector('[aria-haspopup="dialog"]');
    assert.ok(
      trigger,
      `the help anchor for ${id} opens nothing — it is decoration`,
    );
    assert.equal(
      trigger.tagName,
      "BUTTON",
      `the help trigger for ${id} is a <${trigger.tagName.toLowerCase()}>, not a button — only a button is reachable by keyboard and announced as a control`,
    );
    /* THE NAME IS DECLARED, NOT DERIVED — and "declared" is the whole of the
     * claim, because after lot L7 the derived name is always available and
     * always useless.
     *
     * WHAT THIS REPLACED, AND THE MEASUREMENT THAT CONDEMNED IT. The check
     * here was `accessibleName(trigger).length > 0`, and `accessibleName`
     * falls back to `textContent` when there is no `aria-label`. Every badge
     * this product draws puts a plain-text `?` inside the button, so the
     * fallback returns "?", length 1, and the assertion was true BY THE SHAPE
     * OF THE MARK — it could no longer fail over anything the lot delivered.
     * Executed, not reasoned: dropping `aria-label` from the Meetings badge
     * left the file at `Tests 11 passed (11)`.
     *
     * `InlinePopover.tsx` states the rule this restores in its own words —
     * `triggerAriaLabel` is the ONLY way a badge can be both the `?` sign and
     * a named control — so the assertion asks for the attribute, and asks the
     * name to say WHICH thing it stands by rather than repeat the glyph. Six
     * hand-written anchors (Today, Calendar, Meetings and three Settings
     * headings) carry that attribute by hand and nothing checked it before. */
    const declaredName = (trigger.getAttribute("aria-label") ?? "").trim();
    assert.ok(
      declaredName.length > 0,
      `the help trigger for ${id} has no aria-label, so its only accessible name is the glyph it draws — "${accessibleName(trigger)}" is what a screen reader would announce, and a mark that announces itself as "?" says nothing about what it explains`,
    );
    assert.ok(
      declaredName !== visibleText(trigger),
      `the help trigger for ${id} is named "${declaredName}", which is the mark itself rather than the thing it stands beside`,
    );
    // AND ITS VISIBLE TEXT IS THE ONE CHARACTER, which is the FORM half of
    // the claim and the half nothing checked before lot L7 of phase II. Up to
    // that lot this trigger drew the WHOLE QUESTION under a dotted underline
    // ("What do these three states mean?") in ten places on seven screens,
    // and every assertion in this file was green over it: they all ask what
    // the control IS and what it OPENS, never what it LOOKS LIKE.
    assert.equal(
      visibleText(trigger),
      "?",
      `the help trigger for ${id} draws "${visibleText(trigger)}" instead of the one-character mark — on-demand help has ONE shape in the reference (v3/app.css:896-903, eleven calls through one function) and a second shape here is the drift this contract exists to catch`,
    );
  }

  // 2b. AND NOTHING ELSE DRAWS THAT MARK. The converse of the check above, and
  //     it is the one that closes a MEASURED blindness rather than a supposed
  //     one: `ProjectListLayout.tsx` drew a round `?` with no `onClick`, no
  //     `data-help-topic` and no `aria-haspopup`, and this file asserted
  //     "Projects carries no help at all" over it — green, because every loop
  //     here walks `[data-help-topic]` and a control that does not declare
  //     itself is not "wrong" to them, it is ABSENT.
  //
  //     THE ORACLE IS THE GLYPH, NOT THE WORDING, and that is deliberate: the
  //     reference's own name for this control is "What this means: <term>",
  //     which does not start with a question, and a check keyed on phrasing
  //     is exactly the copy-scanner shape this repository has already been
  //     burned by. One character is checkable and cannot be satisfied by
  //     rewording.
  for (const button of scope.querySelectorAll<HTMLElement>("button")) {
    if (visibleText(button) !== "?") continue;
    assert.ok(
      button.closest("[data-help-topic]") !== null,
      `a button drawing the help mark stands outside any [data-help-topic] anchor, so every assertion in this file is blind to it: ${button.outerHTML.slice(0, 160)}`,
    );
  }

  // 3. Nothing else on the screen claims to open a dialog without being a
  //    button either — help is not the only control this rule binds.
  for (const trigger of scope.querySelectorAll('[aria-haspopup="dialog"]')) {
    assert.equal(
      trigger.tagName,
      "BUTTON",
      `something that is not a button announces itself as opening a dialog: ${trigger.outerHTML.slice(0, 120)}`,
    );
    assert.ok(
      accessibleName(trigger).length > 0,
      `a dialog trigger with no accessible name reached the screen: ${trigger.outerHTML.slice(0, 120)}`,
    );
  }

  // 4. AND HELP NEVER RETREATS INTO `title=`. A tooltip does not exist for a
  //    keyboard, for touch, or for anybody not hovering.
  const titled = [...scope.querySelectorAll("[title]")].map((node) =>
    node.outerHTML.slice(0, 160),
  );
  assert.deepEqual(
    titled,
    [],
    `an explanation survived as a \`title\` attribute:\n${titled.join("\n")}`,
  );
};

/* TODAY AND INBOX — THE TWO SCREENS THIS FILE HAD NO CHANNEL FOR, and four of
 * the six badges lot L7 added stand on them.
 *
 * MEASURED HOLE, NOT A TIDYING-UP. `assertHelpContract` was called from
 * thirteen places and none of them was the landing surface or the Inbox, so
 * the sweep that is supposed to be TOTAL over the product ("nothing else draws
 * that mark") simply did not walk two screens. On the Inbox the consequence
 * was exact: both of its pairs COUNT anchors (`L7-03a`, `L7-03b`), and a badge
 * redrawn as the whole question under a dotted underline would have been MATCH
 * over both of them — the layout gate cannot see it either, because
 * `.help-mark` declares `width: 1.125rem` outright, which the lot's own break
 * declaration says in this repository's break file.
 *
 * WHY THE EXPECTED SET ON TODAY DOES NOT NAME `capacity`, and why that is a
 * fact about the fixture rather than a softened assertion. The `capacity`
 * badge draws in the THIRD branch of the capacity line, which needs
 * `capacity.isWorkingDay` AND `meetingsState.kind === "ready"`
 * (`TodaySurface.tsx`, the `[data-capacity]` paragraph). This fixture answers
 * no calendar query at all, so that branch is unreachable here on every day of
 * the week — which is the good half: the set below cannot rot into a weekday,
 * the failure mode that took this lot's first pass down. The badge itself is
 * NOT unmeasured: `L7-01a`/`L7-01b` stand on the deadline heading's anchor on
 * the same screen and under the same rule, and the free-time twin is written
 * into `VISUAL_LANGUAGE_NOT_COVERED` with its exit condition. What this test
 * adds is the sweep — a second `?` reaching Today, or the badge going back to
 * a sentence, is red here even though no pair moves. */
test("Today carries the deadline and calendar topics, and no second mark hides beside them", async () => {
  await mountShell();
  await waitFor(
    () => container.querySelector("[data-capacity]") !== null,
    "Today drew no capacity line, so the landing surface was never on screen",
  );
  assertHelpContract(surfaceNode('main[data-surface="today"]'), [
    "calendar-meetings",
    "unplanned",
  ]);
});

test("the Inbox carries both of its topics as marks, and nothing hides in a title", async () => {
  await mountShell();
  await goTo("inbox");
  await waitFor(
    () => container.querySelector("[data-inbox-row]") !== null,
    "the Inbox drew no row, so its anchors were never on screen",
  );
  assertHelpContract(surfaceNode('main[data-surface="inbox"]'), [
    "inbox-plumbing",
    "inbox-work",
  ]);
});

test("the client list carries the reading's topic, and nothing hides in a title", async () => {
  await mountShell();
  await goTo("organizations");
  await waitFor(
    () => container.querySelector("[data-org-row]") !== null,
    "Organizations drew no client row, so its anchors were never on screen",
  );
  assertHelpContract(surfaceNode(organizationsScreen), [
    "relationship-reading",
  ]);
});

test("the board carries all three money topics from §1.3", async () => {
  await mountShell();
  await goTo("pipeline");
  await waitFor(
    () => container.querySelector("[data-pipeline-card]") !== null,
    "the board drew no deal card, so its anchors were never on screen",
  );
  const board = surfaceNode(pipelineScreen);
  // The unconfigured-stage topic hangs on the warning tag and appears with it.
  // Asserting the set below without this would let a fixture with no stray
  // stage quietly turn a three-topic claim into a two-topic one.
  assert.ok(
    board.querySelector("[data-pipeline-stray-count]"),
    "this fixture puts no deal on an unconfigured stage, so the tag its topic hangs on is absent",
  );
  assertHelpContract(board, [
    "price-basis",
    "stage-sums",
    "unconfigured-stage",
  ]);
});

test("Renewals carries the lead time and the amendment", async () => {
  await mountShell(watchingQueries);
  await goTo("renewals");
  await waitFor(
    () => container.querySelector("[data-renewal-row]") !== null,
    "Renewals drew no contract row, so its anchors were never on screen",
  );
  const screen = surfaceNode("[data-renewals-surface]");
  // The amendment topic stands at `Add to contract`, which only a contract that
  // can be amended draws.
  const amend = [...screen.querySelectorAll("button")].filter(
    (node) => (node.textContent ?? "").trim() === "Add to contract",
  );
  assert.equal(
    amend.length,
    1,
    `expected exactly one amendable contract in the fixture, found ${amend.length} — the expected topic set below is counted per row`,
  );
  assertHelpContract(screen, ["lead-time", "amendment"]);
});

test("People carries no help of its own, and still no title anywhere", async () => {
  await mountShell();
  await goTo("people");
  await waitFor(
    () => container.querySelector("[data-person-row]") !== null,
    "People drew no row, so the sweep below would have measured an empty screen",
  );
  assertHelpContract(surfaceNode(peopleScreen), []);
});

test("the deal's own record carries no help, and no tooltip either", async () => {
  await mountShell();
  await goTo("pipeline");
  await waitFor(
    () => container.querySelector("[data-pipeline-card]") !== null,
    "the board never mounted",
  );
  const card = container.querySelector<HTMLElement>(
    `[data-pipeline-card="${opportunityRecordId}"]`,
  );
  assert.ok(card, "the seeded deal has no card on the board");
  await act(async () => {
    card.click();
    card.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await waitFor(
    () => container.querySelector('[data-record-kind="opportunity"]') !== null,
    "the deal never opened on its own record",
  );
  assertHelpContract(surfaceNode('[data-record-kind="opportunity"]'), []);
});

/* MEETINGS joins this file rather than growing its own copy of the contract.
 *
 * It is the first NON-CRM route here, and it is the reason the array, the
 * component and this file lost their `crm` prefix: a second contract helper
 * beside this one is the restated-shape defect, and a Meetings topic measured
 * under a name that says CRM is an assertion whose name lies.
 *
 * It mounts the surface directly instead of navigating the shell, because the
 * shell's scenario client answers `getMeetingLoop` with an empty loop — and a
 * screen with no rows has no anchors, so "no title and no stray trigger" would
 * be true of a blank page.
 */
test("Meetings carries the attachment topic, and nothing hides in a title", async () => {
  const now = Date.now();
  const { MeetingsSurface } = await import("../src/MeetingsSurface.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { meetingLoopFixture, backlinksFixture } =
    await import("./meetings-fixture.js");
  const base = createScenarioClient({ queries: {} });
  const inspectorHost = document.createElement("div");
  inspectorHost.className = "inspector";
  document.body.append(inspectorHost);
  try {
    root = createRoot(container);
    mounted = true;
    await act(async () => {
      root.render(
        createElement(MeetingsSurface, {
          client: {
            ...base,
            getJamieStatus: async () => ({
              configured: true,
              scope: "personal" as const,
            }),
            getMeetingLoop: async () => meetingLoopFixture(now),
            runQuery: async (query) =>
              query.queryName === "document.backlinks"
                ? projectionResponse(backlinksFixture(now))
                : base.runQuery(query),
          },
          inspectorHost,
          onInspectorOpen: () => undefined,
          onMeetingSelected: () => undefined,
          onOpenConnections: () => undefined,
          onOpenSources: () => undefined,
        }),
      );
    });
    await waitFor(
      () => container.querySelector(".meeting-result-row") !== null,
      "Meetings drew no result row, so the sweep would have measured an empty screen",
    );
    // The help hangs in the inspector, so the inspector has to be open before
    // either half of the contract means anything.
    await act(async () => {
      container.querySelector<HTMLElement>(".meeting-result-row")!.click();
    });
    await waitFor(
      () => inspectorHost.querySelector(".meeting-result-notes") !== null,
      "the attached-notes section never opened",
    );
    // WPIS 10-4, DOWIEZIONY PRZEZ LOT L7: sekcja nadchodzących niesie odtąd
    // plakietkę przy kłódce, na tym samym temacie pojęciowym, który niosą
    // znaczniki na Dzisiaj i na Kalendarzu. Zbiór jest porównywany w OBIE
    // strony, więc zniknięcie tej plakietki jest tu czerwienią, a nie ciszą.
    assertHelpContract(container, ["calendar-meetings"]);
    assertHelpContract(inspectorHost, ["attached-notes"]);
  } finally {
    inspectorHost.remove();
  }
});

/* SOURCES joins this file for the same reason Meetings did: one contract, one
 * place. Two topics hang on this screen — what a source IS, at the list header
 * where decision #21 cut the lecture that used to say it, and what the three
 * availability states MEAN, at the badge where that explanation used to live in
 * a `title=`. The `title=` sweep below is therefore not a formality here: it is
 * the assertion that the tooltip did not come back.
 *
 * Mounted directly rather than navigated to, on the Library harness fixture:
 * the shell's scenario client answers `knowledge.list` with no sources, and a
 * screen with no rows has no anchors — so "no title and no stray trigger" would
 * be true of a blank page.
 */
test("Sources carries the two Knowledge topics, and nothing hides in a title", async () => {
  const { SourcesReading } = await import("../src/library/SourcesReading.js");
  const { librarySources } = await import("../src/dev/library-fixture.js");
  const { workHarnessSnapshot } =
    await import("../src/dev/harness-snapshot.js");
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(SourcesReading, {
        // Ten test pyta o pomoc kontekstową, nie o akcję tworzenia, i celowo
        // nie daje jej celu: portal bez celu nie rysuje NICZEGO, więc „żaden
        // wyzwalacz nie chowa się w tytule" zostaje zdaniem o tym, co ten test
        // naprawdę renderuje.
        actionHost: null,
        client: undefined,
        snapshot: {
          ...workHarnessSnapshot,
          knowledge: {
            kind: "ready",
            data: {
              kind: "knowledge.list",
              spaceId: workHarnessSnapshot.bootstrap.spaces[0]!.id,
              folders: [],
              sources: librarySources(),
              documents: [],
            },
          },
        },
        onReload: async () => undefined,
        onFailure: () => undefined,
      }),
    );
  });
  await waitFor(
    () => container.querySelector("[data-source-row]") !== null,
    "Sources drew no row, so the sweep below would have measured an empty screen",
  );
  // The availability topic hangs in the READER, so the reader has to be open
  // before either half of the contract means anything. It opens on the first
  // row in render order by itself; this asserts that rather than assuming it.
  assert.ok(
    container.querySelector("[data-source-reader]"),
    "no source opened in the reading panel, so its help anchor was never drawn",
  );
  assertHelpContract(container, ["sources", "source-availability"]);
});

test("a topic opens as a named dialog with one paragraph, and Escape hands the focus back", async () => {
  await mountShell();
  await goTo("renewals");
  await waitFor(
    () => container.querySelector("[data-renewal-row]") !== null,
    "Renewals drew no contract row",
  );
  const anchor = container.querySelector<HTMLElement>(
    '[data-help-topic="lead-time"]',
  );
  assert.ok(anchor, "the lead time has no help anchor");
  const trigger = anchor.querySelector<HTMLElement>("button");
  assert.ok(trigger);
  const topic = helpTopics.find((entry) => entry.id === "lead-time");
  assert.ok(topic);
  /* NAZWA IDZIE ZA WZOREM PROTOTYPU, ODKĄD ETYKIETĄ JEST JEDEN ZNAK.
     `v3/app.js:2004` — `aria-label="What this means: ${esc(h.title)}"`. Do lotu
     L7 nazwą było samo pytanie, bo pytanie BYŁO widoczną etykietą; teraz „?"
     nie mówi czytnikowi ekranu, o co pyta, więc nazwa musi powiedzieć, PRZY
     CZYM ten znak stoi. Panel dalej nazywa się pytaniem — sprawdzone niżej —
     więc obie rzeczy są nazwane i nazwane różnie, i to jest zamierzone. */
  assert.equal(
    accessibleName(trigger),
    `What this means: ${topic.term}`,
    "the trigger does not name the thing it stands beside",
  );

  await act(async () => {
    trigger.click();
  });
  // Portaled to <body>: looking for it inside `container` would find nothing
  // and the assertion would fail for the wrong reason.
  const panel = document.body.querySelector<HTMLElement>('[role="dialog"]');
  assert.ok(panel, "the trigger opened no dialog");
  assert.equal(panel.getAttribute("aria-label"), topic.question);

  // ONE PARAGRAPH, and the paragraph is the answer. #35's cap is 180 characters
  // in one paragraph; a panel free to render two of them walks through the cap
  // while every length assertion stays green.
  const paragraphs = [...panel.querySelectorAll("p")];
  assert.equal(
    paragraphs.length,
    1,
    `the help panel renders ${paragraphs.length} paragraphs — the topic is capped at one`,
  );
  assert.equal((paragraphs[0]?.textContent ?? "").trim(), topic.answer);

  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  assertNoNode(
    document.body.querySelector('[role="dialog"]'),
    "Escape did not close the help panel",
  );
  assertSameNode(
    document.activeElement,
    trigger,
    "closing the help panel dropped the focus instead of returning it",
  );
});

/* THE NOTES READING CARRIES THE ARRANGEMENT TOPIC — decision #30's `?`.
 *
 * It mounts the reading directly rather than navigating the shell, for the same
 * reason Meetings does: the shell's scenario client answers `knowledge.list`
 * with nothing, the screen then WITHDRAWS its switcher — deliberately, because
 * two of the three axes come from that read — and "no stray anchor" would be
 * true of a screen that draws no anchor at all.
 *
 * The `title=` half of the contract is the one this screen had to be built
 * around: a folder name truncates in a narrow column, and the obvious fix is a
 * tooltip carrying the full path. #35's whole objection is that a tooltip does
 * not exist for a keyboard, for touch, or for anybody not hovering — so the
 * path rides the accessible name instead, and this assertion is what keeps it
 * there.
 */
test("the Notes reading carries the arrangement topic, and no path hides in a title", async () => {
  const { NotesReading } = await import("../src/library/NotesReading.js");
  const { workHarnessSnapshot } =
    await import("../src/dev/harness-snapshot.js");
  const { libraryFolders, librarySummaries, libraryDocuments } =
    await import("../src/dev/library-fixture.js");
  const spaceId = workHarnessSnapshot.bootstrap.spaces[0]!.id;
  const snapshot = {
    ...workHarnessSnapshot,
    documents: {
      kind: "ready",
      data: { kind: "document.list", items: libraryDocuments(spaceId) },
    },
    knowledge: {
      kind: "ready",
      data: {
        kind: "knowledge.list",
        spaceId,
        sources: [],
        folders: libraryFolders(),
        documents: librarySummaries({
          task: { id: "00000000-0000-4000-8000-000000004401", label: "A task" },
          project: {
            id: "00000000-0000-4000-8000-000000004402",
            label: "A project",
          },
        }),
      },
    },
  };
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(NotesReading, {
        // `as never` NIŻEJ KASUJE KOMPILATOR JAKO STRAŻNIKA TEGO OBIEKTU, więc
        // brakujący `actionHost` nie wyszedł tu z `tsc`, tylko z `createPortal`
        // wołanego z cudzym `undefined`. Ta ścieżka pyta o pomoc kontekstową,
        // nie o akcję tworzenia — `null` znaczy „ten odczyt nie ma dziś gdzie
        // wstrzyknąć akcji", i wtedy nie rysuje jej wcale.
        actionHost: null,
        client: undefined,
        snapshot,
        inspectorHost: null,
        onInspectorOpen: () => undefined,
        onEntityActivate: () => undefined,
        onReload: async () => undefined,
        onFailure: () => undefined,
      } as never),
    );
  });
  await waitFor(
    () => container.querySelector('[role="treeitem"]') !== null,
    "the Notes reading drew no folder tree, so the sweep would have measured an empty screen",
  );
  // WPIS 11-8: głowa kolumny folderów niesie odtąd plakietkę, jak
  // `v3/screens/knowledge.js:807`.
  assertHelpContract(surfaceNode("[data-notes-screen]"), [
    "folders",
    "note-arrangement",
  ]);
});

/* THE PROJECTS "BY CLIENT" LENS — the deadline DATE, in the row's name.
 *
 * Route added in Wave E, and the `title=` half of the contract is the whole
 * reason it is here: this lens drew "6 days left" and carried the date it
 * falls on in a `title`. The row is a `role="option"` with an `aria-label`, so
 * an option's label replaces everything inside it and no hidden span could
 * have carried the date either — a keyboard, touch and a screen reader simply
 * did not have it.
 *
 * IT IS NOT A `?` TOPIC AND THAT IS THE RULING, not an omission: #35's control
 * answers a CONCEPT, one string for every row. A deadline is this row's own
 * DATA, and a shared topic is the one place per-row data must never go.
 *
 * The fixture carries a project with a deadline because the shared one does
 * NOT — every project in `populatedProjectList` is undated, so `deadlineDate`
 * answers `undefined` and this whole assertion would have measured a lane that
 * draws nothing. Dated far out on purpose: a date near today turns this file
 * red on a day nobody chose.
 */
const datedProjectQueries: ScenarioFixtures["queries"] = {
  ...populatedShellQueries,
  "project.list": projectionResponse({
    ...populatedProjectList,
    items: populatedProjectList.items.map((item, index) =>
      index === 0 ? { ...item, dueAt: "2099-03-14T12:00:00.000Z" } : item,
    ),
  }),
};

test("the projects by-client lens puts the deadline date in the row, not in a tooltip", async () => {
  await mountShell(datedProjectQueries);
  await goTo("projects");
  await waitFor(
    () => container.querySelector("[data-project-row]") !== null,
    "Projects drew no row, so the sweep below would have measured an empty screen",
  );
  /* WPIS 5-4, ZMIERZONY PRZED PRZEŁĄCZENIEM SOCZEWKI — i to jest kotwica
     dowodu, nie dodatkowa asercja. Plakietka `project-health` stoi w GŁOWIE
     GRUPY domyślnego układu (`ProjectListLayout.tsx`), a soczewka „by client"
     rysuje inny komponent bez grup, więc zbiór poniżej jest tam pusty
     PRAWIDŁOWO. Asercja tylko po przełączeniu byłaby zielona także wtedy,
     gdyby plakietki nie było nigdzie.

     PRZED LOTEM L7 OBIE POŁOWY BYŁY PUSTE I OBIE BYŁY ZIELONE, podczas gdy
     domyślny układ rysował okrągły „?" bez `onClick`, bez tematu i bez
     deklaracji, że cokolwiek otwiera. Zbiór był pusty nie dlatego, że
     pytajnika nie było, tylko dlatego, że pytajnik nie przedstawił się jako
     pomoc — a każda pętla w tym pliku chodzi po `[data-help-topic]`. */
  assertHelpContract(surfaceNode(".project-surface"), ["project-health"]);

  const lens = container.querySelector<HTMLElement>('[data-layout="client"]');
  assert.ok(lens, "the by-client lens has no way in");
  await act(async () => {
    lens.click();
  });
  await waitFor(
    () => container.querySelector('[aria-label="Projects by client"]') !== null,
    "the by-client lens never drew",
  );

  // The zone comes from the WORKSPACE, not from this machine
  // (`ProjectCollection.tsx:52`). Reading it off the fixture rather than off
  // `Intl.DateTimeFormat()` is what keeps this green on a runner in another
  // timezone — the two agree on my laptop and would not have agreed in CI.
  const { formatDate } = await import("../src/i18n.js");
  const expected = formatDate(
    "2099-03-14T12:00:00.000Z",
    populatedBootstrap.workspace.timezone,
  );
  const named = [
    ...container.querySelectorAll<HTMLElement>("[data-project-row]"),
  ].map((row) => row.getAttribute("aria-label") ?? "");
  assert.equal(
    named.filter((name) => name.includes(expected)).length,
    1,
    `the dated project's row does not say ${expected} anywhere a screen reader would hear it:\n${named.join("\n")}`,
  );

  // A W SOCZEWCE „BY CLIENT" PLAKIETKI NIE MA, I TO JEST STAN ZAMIERZONY:
  // ten układ nie ma głów grup zdrowia, więc nie ma etykiety, przy której
  // znak miałby stać. Pusty zbiór znaczy tu coś innego niż przed lotem —
  // znaczy „zmierzone i nieobecne", a nie „niewidzialne dla przyrządu".
  assertHelpContract(surfaceNode(".project-surface"), []);
});

/* THE CAPTURE HISTORY READING — why a dead control is dead, in words.
 *
 * `Preview undo` is disabled when nothing about the capture can be taken back,
 * and the reason used to be a `title` ON THE DISABLED BUTTON — unreachable
 * twice: a tooltip needs a hover, and a disabled button takes no focus at all.
 * Wave D fixed the identical shape in #206 and this copies it.
 *
 * The sweep alone would pass if the attribute had simply been deleted, so the
 * replacement is asserted BY ITS WORDS before the sweep runs.
 *
 * Mounted directly, on the harness snapshot: the shell's scenario client
 * answers with no captures at all, and a reading with no rows has no button.
 */
test("the capture history says why undo is unavailable, and says it on the screen", async () => {
  const { CaptureHistoryReading } =
    await import("../src/library/CaptureHistoryReading.js");
  const { workHarnessSnapshot } =
    await import("../src/dev/harness-snapshot.js");
  const { CaptureIdSchema } = await import("@constellation/contracts");
  const capture = {
    id: CaptureIdSchema.parse("00000000-0000-4000-8000-0000000009c1"),
    spaceId: workHarnessSnapshot.bootstrap.spaces[0]!.id,
    originalText: "Zadzwonić do Northstar w sprawie aneksu",
    original: { kind: "text" as const, text: "Zadzwonić do Northstar" },
    source: "global_quick_capture" as const,
    capturedAt: "2026-07-16T09:18:02.000+02:00",
    processingState: "unclassified" as const,
    version: 1,
  };
  const inspectorHost = document.createElement("div");
  document.body.append(inspectorHost);
  try {
    root = createRoot(container);
    mounted = true;
    await act(async () => {
      root.render(
        createElement(CaptureHistoryReading, {
          snapshot: { ...workHarnessSnapshot, captures: [capture] },
          inspectorHost,
          onInspectorOpen: () => undefined,
          wiring: {
            selectedCaptureId: capture.id,
            busy: false,
            onSelectCapture: () => undefined,
            onUndo: () => undefined,
            onDeleteVoiceAudio: () => undefined,
          },
        } as never),
      );
    });
    const undo = [...inspectorHost.querySelectorAll("button")].find(
      (button) => (button.textContent ?? "").trim() === "Preview undo",
    );
    assert.ok(
      undo,
      "the reading drew no undo control, so nothing was measured",
    );
    assert.equal(
      undo.disabled,
      true,
      "this fixture was built with no reversible command — a control that is enabled means the fixture stopped exercising the case",
    );
    assert.ok(
      (inspectorHost.textContent ?? "").includes(
        "No reversible command was recorded for this Capture.",
      ),
      "the reason the control is dead is not on the screen — deleting the tooltip without replacing it is not the fix",
    );
    assertHelpContract(inspectorHost, []);
    assertHelpContract(container, []);
  } finally {
    inspectorHost.remove();
  }
});
