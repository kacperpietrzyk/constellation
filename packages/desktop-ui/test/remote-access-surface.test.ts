import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SpaceIdSchema } from "@constellation/contracts";

import { AccessSurface } from "../src/AccessSurface.js";

test("remote agent access leads with the ledger and reveals grant creation deliberately", () => {
  const spaceId = SpaceIdSchema.parse("80000000-0000-4000-8000-000000000001");
  const markup = renderToStaticMarkup(
    createElement(AccessSurface, {
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
      agentTransport: "remote_hub",
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
  assert.match(markup, /MCP · zdalnie przez Hub/u);
  assert.match(markup, /Agenci zewnętrzni/u);
  assert.match(markup, /Dodaj agenta/u);
  assert.match(markup, /Żaden host nie ma dostępu/u);
  assert.doesNotMatch(markup, /Poziom możliwości/u);
  assert.doesNotMatch(markup, /Utwórz zdalny dostęp MCP/u);
});

const grantRow = (
  overrides: Record<string, unknown>,
): Record<string, unknown> => ({
  grantId: "80000000-0000-4000-8000-000000000010",
  agentPrincipalId: "80000000-0000-4000-8000-000000000011",
  displayName: "Codex",
  preset: "operate",
  capabilityScope: ["task.create"],
  scopeStatus: "current",
  missingFromPreset: [],
  status: "active",
  credentialVersion: 1,
  version: 1,
  membershipId: "80000000-0000-4000-8000-000000000012",
  membershipVersion: 1,
  spaces: [],
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
    grant: Record<string, unknown>,
    agentTransport: "local_stdio" | "remote_hub" = "local_stdio",
  ): string =>
    renderToStaticMarkup(
      createElement(AccessSurface, {
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
            grants: [grant],
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
      } as never),
    );

  // A grant issued before a release does not gain what that release added to
  // its preset. The row still names that state — it explains a refusal before
  // anyone opens the dialog.
  const behind = surface(
    grantRow({
      scopeStatus: "behind_preset",
      missingFromPreset: ["task.remove", "project.remove"],
    }),
  );
  assert.match(behind, /zakres sprzed aktualizacji/u);
  assert.match(behind, /brakuje 2 uprawnień/u);
  assert.match(behind, /Zmień uprawnienia/u);

  // A grant that is current has nothing to catch up to and everything still
  // to change — the person who wants a narrower agent starts here.
  const current = surface(grantRow({}));
  assert.doesNotMatch(current, /zakres sprzed aktualizacji/u);
  assert.match(current, /Zmień uprawnienia/u);

  // A hand-picked scope is never nagged about drift, and the dialog is its
  // only exit — so the action has to be there.
  const custom = surface(
    grantRow({
      preset: "custom",
      scopeStatus: "current",
      missingFromPreset: [],
    }),
  );
  assert.doesNotMatch(custom, /zakres sprzed aktualizacji/u);
  assert.match(custom, /Zmień uprawnienia/u);
  // …and it is labelled as what it is, not silently rendered as the lowest
  // level it is not.
  assert.match(custom, /Ręcznie dobrany/u);

  // A Hub grant is changed through the Hub's own management API, which carries
  // no scope method yet, so the state is named and the action withheld — an
  // action that cannot reach the grant is worse than none.
  const hub = surface(
    grantRow({
      scopeStatus: "behind_preset",
      missingFromPreset: ["task.remove"],
    }),
    "remote_hub",
  );
  assert.match(hub, /zakres sprzed aktualizacji/u);
  assert.doesNotMatch(hub, /Zmień uprawnienia/u);
});
