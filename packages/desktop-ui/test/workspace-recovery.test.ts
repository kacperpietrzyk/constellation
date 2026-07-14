import assert from "node:assert/strict";
import { test } from "node:test";

import { DataHomeStatusSchema } from "@constellation/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkspaceRecovery } from "../src/WorkspaceRecovery.js";
import { createScenarioClient } from "../src/client/scenario-client.js";

test("Data Home explains first Hub enrollment and coordinated recovery states", async () => {
  const client = createScenarioClient({ queries: {} });
  const local = await client.getDataHomeStatus();
  const render = (initialStatus: typeof local) =>
    renderToStaticMarkup(
      createElement(WorkspaceRecovery, {
        client,
        initialStatus,
        workspaceName: "Praca",
        recoveredPrevious: false,
        onClose: () => undefined,
        onRestored: async () => undefined,
      }),
    );

  const localMarkup = render(local);
  assert.match(localMarkup, /Połącz ten workspace z własnym Hubem/u);
  assert.match(localMarkup, /Eksportuj plik autoryzacji/u);
  assert.match(localMarkup, /najpierw.*przywróć przenośny backup/u);
  assert.match(localMarkup, /Jednorazowy kod z Huba/u);

  const coordinated = DataHomeStatusSchema.parse({
    ...local,
    descriptor: {
      ...local.descriptor,
      providerId: "constellation.self-hosted-hub/v1",
      providerInstanceId: "constellation.hub:example",
      providerKind: "coordinated",
      storageRole: "projection_with_outbox",
      displayName: "Self-hosted Hub · hub.example.com",
      location: "provider_managed",
      capabilities: Object.fromEntries(
        Object.keys(local.descriptor.capabilities).map((key) => [
          key,
          { support: "supported" },
        ]),
      ),
    },
    syncState: "unknown_reconcile",
    detailCode: "sync_unknown_reconcile",
    recoveryActions: ["reconcile_provider", "restore_checkpoint"],
  });
  const coordinatedMarkup = render(coordinated);
  assert.match(coordinatedMarkup, /Sprawdzam wynik/u);
  assert.match(coordinatedMarkup, /Najpierw potwierdzę receipt/u);
  assert.match(coordinatedMarkup, /Synchronizuj teraz/u);
  assert.doesNotMatch(
    coordinatedMarkup,
    /Połącz ten workspace z własnym Hubem/u,
  );
});
