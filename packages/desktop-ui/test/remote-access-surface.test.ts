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
      onAgentRescope: () => undefined,
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
 * A grant issued before a release does not gain what that release added to its
 * preset, and nothing in the product said so — the human who can close it is
 * the one person who could not see it.
 */
test("a grant whose scope predates an upgrade offers the human a way to close it", () => {
  const surface = (grant: Record<string, unknown>): string =>
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
        agentTransport: "local_stdio",
        busy: false,
        onAdd: () => undefined,
        onSetAccess: () => undefined,
        onRevoke: () => undefined,
        onAgentAdd: () => undefined,
        onAgentRotate: () => undefined,
        onAgentRescope: () => undefined,
        onAgentRevoke: () => undefined,
      } as never),
    );

  const behind = surface(
    grantRow({
      scopeStatus: "behind_preset",
      missingFromPreset: ["task.remove", "project.remove"],
    }),
  );
  assert.match(behind, /zakres sprzed aktualizacji/u);
  assert.match(behind, /brakuje 2 uprawnień/u);
  assert.match(behind, /Zaktualizuj zakres/u);

  // A current grant must not carry the affordance: an action that is always
  // there stops meaning anything when it matters.
  const current = surface(grantRow({}));
  assert.doesNotMatch(current, /zakres sprzed aktualizacji/u);
  assert.doesNotMatch(current, /Zaktualizuj zakres/u);

  // A hand-picked scope has no preset to be behind, so it is never nagged.
  const custom = surface(
    grantRow({
      preset: "custom",
      scopeStatus: "current",
      missingFromPreset: [],
    }),
  );
  assert.doesNotMatch(custom, /Zaktualizuj zakres/u);
});
