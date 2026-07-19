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
