import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SpaceIdSchema } from "@constellation/contracts";

import { AccessSurface } from "../src/AccessSurface.js";

test("remote agent access keeps capability, data, and federation grants visibly independent", () => {
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
  assert.match(markup, /Poziom możliwości/u);
  assert.match(markup, /Zakres danych/u);
  assert.match(markup, /Granice między workspace/u);
  assert.match(markup, /Odczyt z innych przyznanych workspace/u);
  assert.match(markup, /Zapis wyniku pochodnego/u);
  assert.match(markup, /Materializacja treści źródłowej/u);
  assert.match(markup, /Osobny grant. Domyślnie wyłączony./u);
  assert.match(markup, /Utwórz zdalny dostęp MCP/u);
});
