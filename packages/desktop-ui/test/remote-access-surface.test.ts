import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SpaceIdSchema } from "@constellation/contracts";

import {
  AccessSection,
  missingCapabilitiesClause,
} from "../src/settings/AccessSection.js";
import type { AgentAccessProjection } from "../src/client/workflow.js";

/**
 * The grant exactly as the component's own contract declares it. The version
 * this replaced described grants as `Record<string, unknown>` behind an
 * `as never` cast on the whole props object, which let the fixture pass a
 * transport (`local_stdio`) the component does not admit — invisibly, because
 * the cast switched checking off for every prop at once.
 */
type AgentGrant = AgentAccessProjection["grants"][number];

/**
 * This file asserts on the SHAPE of the agent ledger — the section that labels
 * it, the trigger that reveals creation, the row that carries a grant and the
 * action offered inside it — not on the sentences printed there. Copy is
 * rewritten every release; the guarantees below are not. Where a claim really
 * is about words (a transport a person has to be able to recognise, a count
 * that has to agree with its noun) the assertion stays a copy assertion and
 * says so.
 */

/**
 * The agent ledger as its own slice, so an assertion about "a trigger" or "an
 * eyebrow" cannot be satisfied by the people ledger above it. A slice taken by
 * literal is worthless the moment the literal moves, so the anchor is proven
 * present before anything is read out of it.
 */
const agentSection = (markup: string): string => {
  // CSS MODULE NAMES, and they are readable here on purpose: under
  // `node --test` `scripts/css-module-hook.mjs` maps a module class to its own
  // key, so the rendered markup carries `ledger agentSection` rather than the
  // hashed browser name. Slicing by class therefore still works, and a typo in
  // `styles.x` shows up as `undefined` rather than passing.
  const start = markup.indexOf('<section class="ledger agentSection"');
  assert.notEqual(
    start,
    -1,
    "the agent ledger section is missing — every assertion below would pass vacuously",
  );
  return markup.slice(start);
};

/** The single grant row, likewise proven present before it is asserted on. */
const grantRow = (markup: string): string => {
  const found =
    /<article[^>]*class="grantRow[^"]*"[^>]*>[\s\S]*?<\/article>/u.exec(
      agentSection(markup),
    );
  assert.ok(found, "the grant row is missing — nothing below would be tested");
  return found[0];
};

/** The eyebrow that names the transport, read out of the agent ledger only. */
const transportEyebrow = (markup: string): string => {
  const found = /<p class="eyebrow"[^>]*>([^<]*)<\/p>/u.exec(
    agentSection(markup),
  );
  const eyebrow = found?.[1];
  assert.ok(eyebrow, "the agent ledger prints no transport eyebrow");
  return eyebrow;
};

/** The capability level as the row prints it, without pinning any one label. */
const presetLabelOf = (markup: string): string => {
  const found =
    /<div class="grantIdentity"[^>]*><strong[^>]*>[^<]*<\/strong><span[^>]*>([^<]*)<\/span>/u.exec(
      grantRow(markup),
    );
  const label = found?.[1];
  assert.ok(label, "the grant row names no capability level");
  return label;
};

/**
 * The trigger that reveals creation, with its contents — so the button can be
 * asserted to carry a NAME and not merely a class. Its content is an
 * aria-hidden ornament plus text, and a button left with only the ornament is
 * nameless for anyone who is not looking at it.
 */
const createTrigger = (markup: string): string => {
  const found =
    /<button[^>]*class="[^"]*createTrigger[^"]*"[^>]*aria-haspopup="dialog"[^>]*>([\s\S]*?)<\/button>/u.exec(
      agentSection(markup),
    );
  const content = found?.[1];
  // Not a truthiness check: an empty button body is exactly the regression the
  // caller asserts against, and it has to reach that assertion, not this one.
  // `assert.fail` rather than `assert.ok(content !== undefined)`, because
  // `asserts value` narrows the EXPRESSION, not `content` — the ok() form reads
  // as a guard and does not compile as one.
  if (content === undefined) {
    assert.fail("the agent ledger offers no trigger that opens creation");
  }
  return content;
};

/**
 * The re-scope action is the only action in a grant row that opens a dialog;
 * rotation and revocation confirm in place. `aria-haspopup="dialog"` inside the
 * row is therefore the behavioural anchor for "this grant can be re-scoped",
 * and survives any renaming of the button.
 */
const offersRescope = (markup: string): boolean =>
  /aria-haspopup="dialog"/u.test(grantRow(markup));

/**
 * What the drift clause looks like whatever its count. Proven below to match
 * what the source helper actually prints, so the several `doesNotMatch` uses
 * cannot pass merely because the wording moved on without them.
 */
const DRIFT_CLAUSE = /missing \d+ permissions? from this level/u;

const spaceId = SpaceIdSchema.parse("80000000-0000-4000-8000-000000000001");

test("remote agent access leads with the ledger and reveals grant creation deliberately", () => {
  const render = (agentTransport: "local" | "remote_hub"): string =>
    renderToStaticMarkup(
      createElement(AccessSection, {
        access: {
          kind: "ready",
          data: {
            kind: "workspace.access",
            policyVersion: 4,
            currentPrincipalId: "80000000-0000-4000-8000-000000000002" as never,
            canManage: true,
            members: [],
          },
        },
        agentAccess: {
          kind: "ready",
          data: {
            kind: "agent.access",
            policyVersion: 4,
            workspaceVersion: 4,
            canManage: true,
            grants: [],
          },
        },
        spaces: [{ id: spaceId, name: "Praca" }],
        agentTransport,
        busy: false,
        onAdd: () => undefined,
        onSetAccess: () => undefined,
        onRevoke: () => undefined,
        onAgentAdd: () => undefined,
        onAgentRotate: () => undefined,
        onAgentRescope: async () => undefined,
        onAgentRevoke: () => undefined,
      }),
    );

  const remote = render("remote_hub");
  const section = agentSection(remote);

  // Agent access is a region of its own, named by its own heading: a screen
  // reader lands on it as a separate thing from the people ledger, and the
  // heading it is named by has to exist for that to be true.
  assert.match(section, /aria-labelledby="agent-access-title"/u);
  assert.match(section, /<h2 id="agent-access-title"[^>]*>/u);

  // The ledger leads: the list of grants is what the section renders, as a
  // live region so a grant appearing or being revoked is announced.
  assert.match(section, /<div class="grantList"[^>]*aria-live="polite"/u);
  // With no grants the list still says something rather than rendering blank.
  assert.match(section, /class="[^"]*emptyState/u);
  assert.doesNotMatch(section, /<article[^>]*class="grantRow/u);

  // Creation is REVEALED, not resident: an explicit trigger that announces it
  // opens a dialog, and that says what it is — the copy assertion this
  // replaced ("Dodaj agenta") was the only proof the button had a name at all,
  // and its content is an aria-hidden mark plus text, so a button that lost the
  // text would still match every structural anchor above.
  const trigger = createTrigger(remote);
  assert.ok(
    trigger.replace(/<[^>]*>/gu, "").trim().length > 0,
    "the trigger that opens creation renders no name, only an aria-hidden mark",
  );
  // …and until it is pressed neither the dialog nor the form inside it is
  // rendered at all. (Positive counterpart above: the trigger proves the
  // affordance exists, so these negatives cannot be vacuously true.)
  assert.doesNotMatch(remote, /<dialog/u);
  assert.doesNotMatch(remote, /class="[^"]*agentComposer/u);

  // Legitimately a claim about words: whether an agent reaches this workspace
  // over the network or only from this machine is a fact the person granting
  // access has to be able to read off the screen. There is no structural
  // carrier for it (see the recommendation in the report), so the transport
  // label is asserted as copy — and asserted to actually DIFFER between the
  // two transports, which a single hard-coded string would not catch.
  const remoteEyebrow = transportEyebrow(remote);
  const localEyebrow = transportEyebrow(render("local"));
  assert.notEqual(remoteEyebrow, localEyebrow);
  assert.match(remoteEyebrow, /Hub/u);
  assert.doesNotMatch(localEyebrow, /Hub/u);
});

const baseGrant: AgentGrant = {
  grantId: "80000000-0000-4000-8000-000000000010" as AgentGrant["grantId"],
  agentPrincipalId:
    "80000000-0000-4000-8000-000000000011" as AgentGrant["agentPrincipalId"],
  displayName: "Codex",
  preset: "operate",
  capabilityScope: ["task.create"],
  scopeStatus: "current",
  missingFromPreset: [],
  status: "active",
  credentialVersion: 1,
  version: 1,
  membershipId:
    "80000000-0000-4000-8000-000000000012" as AgentGrant["membershipId"],
  membershipVersion: 1,
  spaces: [],
};

const grant = (overrides: Partial<AgentGrant>): AgentGrant => ({
  ...baseGrant,
  ...overrides,
});

/**
 * Changing what an issued agent may do is the reason the grant is editable at
 * all: the alternative is revoking it, which mints a new credential and forces
 * the host on the other side to be reconfigured. The affordance therefore does
 * not wait for drift — but it also cannot be offered where it cannot reach.
 */
test("every local grant can be re-scoped, and a Hub grant still cannot", () => {
  const surface = (
    row: AgentGrant,
    agentTransport: "local" | "remote_hub" = "local",
  ): string =>
    renderToStaticMarkup(
      createElement(AccessSection, {
        access: {
          kind: "ready",
          data: {
            kind: "workspace.access",
            policyVersion: 4,
            currentPrincipalId: "80000000-0000-4000-8000-000000000002" as never,
            canManage: true,
            members: [],
          },
        },
        agentAccess: {
          kind: "ready",
          data: {
            kind: "agent.access",
            policyVersion: 4,
            workspaceVersion: 4,
            canManage: true,
            grants: [row],
          },
        },
        spaces: [],
        agentTransport,
        busy: false,
        onAdd: () => undefined,
        onSetAccess: () => undefined,
        onRevoke: () => undefined,
        onAgentAdd: () => undefined,
        onAgentRotate: () => undefined,
        onAgentRescope: async () => undefined,
        onAgentRevoke: () => undefined,
      }),
    );

  // Every "no drift is named" assertion below is a negative, and a negative
  // over a moved phrase is green and worthless. So the pattern is first proven
  // to match what the source's own clause builder prints, for both counts.
  assert.match(`${missingCapabilitiesClause(1)} from this level`, DRIFT_CLAUSE);
  assert.match(`${missingCapabilitiesClause(2)} from this level`, DRIFT_CLAUSE);

  // A grant issued before a release does not gain what that release added to
  // its preset. The row still names that state — it explains a refusal before
  // anyone opens the dialog — and names it with the count the source computes,
  // not a count this test spells out.
  const behind = surface(
    grant({
      scopeStatus: "behind_preset",
      missingFromPreset: ["task.remove", "project.remove"],
    }),
  );
  assert.match(grantRow(behind), DRIFT_CLAUSE);
  // Spelled out rather than taken from `missingCapabilitiesClause`: an expected
  // string built by the code under test agrees with that code by construction,
  // so it can pin the COUNT but never the words around it.
  assert.match(grantRow(behind), /missing 2 permissions from this level/u);
  assert.ok(
    offersRescope(behind),
    "a drifted local grant offers no way to close the drift",
  );

  // A grant that is current has nothing to catch up to and everything still
  // to change — the person who wants a narrower agent starts here.
  const current = surface(grant({}));
  assert.doesNotMatch(grantRow(current), DRIFT_CLAUSE);
  assert.ok(
    offersRescope(current),
    "a current local grant cannot be narrowed without revoking it",
  );

  // A hand-picked scope is never nagged about drift, and the dialog is its
  // only exit — so the action has to be there.
  const custom = surface(
    grant({ preset: "custom", scopeStatus: "current", missingFromPreset: [] }),
  );
  assert.doesNotMatch(grantRow(custom), DRIFT_CLAUSE);
  assert.ok(
    offersRescope(custom),
    "a hand-picked scope has no exit but the dialog, and the dialog is not offered",
  );
  // …and it is labelled as what it is, not silently rendered as one of the
  // levels it is not. Asserted as distinctness from every preset label rather
  // than as one particular word, so renaming the levels cannot break it while
  // collapsing two of them into one label still does.
  const customLabel = presetLabelOf(custom);
  for (const preset of [
    "observe",
    "propose",
    "operate",
    "full_access",
  ] as const) {
    assert.notEqual(
      customLabel,
      presetLabelOf(surface(grant({ preset }))),
      `a hand-picked scope reads as the "${preset}" level it is not`,
    );
  }

  // A Hub grant is changed through the Hub's own management API, which carries
  // no scope method yet, so the state is named and the action withheld — an
  // action that cannot reach the grant is worse than none.
  const hub = surface(
    grant({ scopeStatus: "behind_preset", missingFromPreset: ["task.remove"] }),
    "remote_hub",
  );
  assert.match(grantRow(hub), DRIFT_CLAUSE);
  assert.equal(
    offersRescope(hub),
    false,
    "a Hub grant offers an action that cannot reach it",
  );
  // Withheld, not absent: the grant is still administrable, so the other
  // actions have to survive the withdrawal of this one.
  assert.match(grantRow(hub), /class="[^"]*memberActions/u);
  // Legitimately a claim about words: a count and the noun it governs have to
  // agree. (The Polish genitive rule this replaced — "1 uprawnienia", not the
  // nominative "1 uprawnienie" — is gone; English needs only that one missing
  // permission is not printed as the plural.) The expected clause is WRITTEN
  // OUT here. Deriving it from `missingCapabilitiesClause(1)` made this
  // unfalsifiable on the one question it exists to answer: a helper regressed
  // to an unconditional plural produces "missing 1 permissions" on both sides
  // of the comparison, and the assertion stays green through the very bug it
  // is named after.
  assert.match(grantRow(hub), /missing 1 permission from this level/u);
  assert.doesNotMatch(grantRow(hub), /missing 1 permissions/u);

  // A revoked grant authorizes nothing, so it has nothing to catch up to. The
  // clause sat outside the guard that withholds the actions, so the row named
  // drift on a grant nobody can — or needs to — repair. Both halves of that
  // guard are asserted: no actions, and no drift.
  const revoked = surface(
    grant({
      status: "revoked",
      scopeStatus: "behind_preset",
      missingFromPreset: ["task.remove"],
    }),
  );
  assert.doesNotMatch(grantRow(revoked), DRIFT_CLAUSE);
  assert.doesNotMatch(grantRow(revoked), /class="[^"]*memberActions/u);
  // The state is carried by the row's DATA and by its badge. The status used
  // to be a class name too, and the two disagreed — the row dimmed for
  // `expired` and `revoked` alike while the dot had a rule for `revoked`
  // only, so an expired grant wore the green success dot. `data-grant-status`
  // names the status; the class only says the row is closed.
  assert.match(grantRow(revoked), /<article[^>]*data-grant-status="revoked"/u);
  assert.match(grantRow(revoked), /<article[^>]*class="grantRow rowRevoked"/u);
  assert.match(grantRow(revoked), /<span class="state stateClosed"[^>]*>/u);
});
