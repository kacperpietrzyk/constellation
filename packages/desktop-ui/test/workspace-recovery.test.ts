import assert from "node:assert/strict";
import { test } from "node:test";

import { DataHomeStatusSchema } from "@constellation/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkspaceRecovery } from "../src/WorkspaceRecovery.js";
import { createScenarioClient } from "../src/client/scenario-client.js";

/**
 * Co dokładnie oferuje to okno, czytane z zaczepów `data-recovery-action`, a
 * nie ze zdań na przyciskach. Posortowana tablica, nie zbiór: powtórzony
 * zaczep na dwóch kontrolkach też jest defektem, bo znaczy, że tę samą akcję
 * da się uruchomić z dwóch miejsc bez wiedzy testu.
 */
const offeredActions = (markup: string): readonly string[] =>
  [...markup.matchAll(/data-recovery-action="([^"]+)"/gu)]
    .map((match) => match[1] ?? "")
    .sort();

const hasHook = (markup: string, attribute: string, value: string): boolean =>
  markup.includes(`${attribute}="${value}"`);

test("Data Home offers the recovery a state actually has, and only that", async () => {
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

  const localMarkup = render(local);
  const coordinatedMarkup = render(coordinated);

  // Sedno: każdy stan oferuje swoje wyjście i ŻADNEGO cudzego. Równość
  // zbiorów niesie obie połowy naraz — brak własnej akcji i pokazanie akcji
  // drugiego stanu wywracają tę samą asercję.
  assert.deepEqual(offeredActions(localMarkup), [
    "backup-export",
    "hub-authorization-export",
    "hub-enroll",
    "restore-prepare",
  ]);
  assert.deepEqual(offeredActions(coordinatedMarkup), [
    "backup-export",
    "restore-prepare",
    "sync-now",
  ]);

  // Dołączenie do Huba to nie sam przycisk: bez pola na jednorazowy kod i bez
  // akapitu o kolejności na drugim urządzeniu formularz jest nie do przejścia.
  assert.ok(hasHook(localMarkup, "data-recovery-field", "enrollment-secret"));
  assert.ok(hasHook(localMarkup, "data-recovery-note", "second-device-order"));
  assert.notEqual(
    (
      /data-recovery-note="second-device-order"[^>]*>([^<]*)</u.exec(
        localMarkup,
      )?.[1] ?? ""
    ).trim(),
    "",
  );
  assert.ok(
    !hasHook(coordinatedMarkup, "data-recovery-field", "enrollment-secret"),
  );
  assert.ok(
    !hasHook(coordinatedMarkup, "data-recovery-note", "second-device-order"),
  );

  // Stan synchronizacji czytany z dyskryminanty statusu, nie ze zdania: to
  // ona decyduje, czy „Synchronizuj teraz” w ogóle ma sens.
  assert.notEqual(local.syncState, coordinated.syncState);
  assert.ok(hasHook(localMarkup, "data-sync-state", local.syncState));
  assert.ok(
    hasHook(coordinatedMarkup, "data-sync-state", coordinated.syncState),
  );

  // Każdy stan opisuje się własnymi słowami — dowolnymi, ale nie tymi samymi
  // i nie pustymi.
  const syncCopy = (markup: string): string => {
    const block = /<div class="data-home-sync-state[^"]*"[^>]*>(.*?)<\/div>/su
      .exec(markup)?.[1]
      ?.replace(/<[^>]*>/gu, " ");
    assert.ok(block !== undefined);
    return block.replace(/\s+/gu, " ").trim();
  };
  assert.notEqual(syncCopy(localMarkup), "");
  assert.notEqual(syncCopy(coordinatedMarkup), "");
  assert.notEqual(syncCopy(localMarkup), syncCopy(coordinatedMarkup));
});
