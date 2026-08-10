import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import type { ScenarioFixtures } from "../src/client/scenario-client.js";
import type { RendererQueryResponse } from "@constellation/desktop-preload/client";

import {
  populatedRelationshipWorkspace,
  populatedShellQueries,
  projectionResponse,
  queryId,
  referencedOrganizationId,
} from "./shell-fixture.js";

// TRZY SPOSOBY, NA JAKIE EKRAN ZAMIENIA „NIE DAŁO SIĘ ZAPYTAĆ" NA „NIC NIE MA",
// zmierzone razem, bo wszystkie trzy widać wyłącznie wtedy, gdy odczyt PADNIE
// albo gdy dane wyglądają inaczej niż w fiksturze.
//
// PO CO OSOBNY PLIK. Każdy istniejący test tego repozytorium karmi ekrany CRM
// fiksturą, która stempluje `recordState: "active"` na KAŻDYM rekordzie
// (`shell-fixture.ts:274`, `dev/crm-fixture.ts:171`, i tak samo pięć plików
// testowych). Domena nie stempluje tego pola NIGDY przy tworzeniu — pisze je
// jedno przejście, `setStrategicRecordState`, osiągalne tylko przez usunięcie —
// więc fikstura opisuje kształt, którego prawdziwy workspace NIE MA. Asercja,
// której fikstura nie dosięga, jest nieodróżnialna od poprawnej: przez cztery
// wydania klient wyrzucał każdy rekord, jaki produkt kiedykolwiek zapisał, a
// wszystkie bramki stały zielone. To jest „pusta fikstura chroni fałszywą
// asercję" drugi raz, i dlatego materiał do tego pliku jest budowany PRZEZ
// ZDJĘCIE klucza, nie przez jego dopisanie.

const withoutRecordState = (
  records: Projection["records"],
): Projection["records"] =>
  records.map((record) => {
    const rest = { ...(record as Record<string, unknown>) };
    delete rest["recordState"];
    return rest as (typeof records)[number];
  });

type Projection = typeof populatedRelationshipWorkspace;

/** Odpowiedź, którą kernel oddaje, kiedy ODMAWIA — nie rzuca i nie gubi się po
 *  drodze, tylko nazywa powód. Jedyny kanał, jakim ten powód dociera do
 *  czytelnika, to zdanie na ekranie: `⌘⌥I` nie otwiera DevTools w tym buildzie. */
const refusedResponse = (
  diagnosticCode:
    | "authorization.denied"
    | "query.not_available"
    | "query.cursor_invalid"
    | "query.consistency_unavailable",
): RendererQueryResponse =>
  ({
    kind: "query_result",
    result: {
      contractVersion: 1,
      queryId,
      kernelTime: "2026-07-13T12:00:00.000Z",
      outcome: "rejected",
      diagnosticCode,
    },
  }) as RendererQueryResponse;

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

const openSurface = async (
  surface: string,
  hook: string,
  fixtures: ScenarioFixtures["queries"],
): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries: fixtures });
  const snapshot = await loadDesktopSnapshot(client);
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === surface);
  assert.ok(item, `no navigation target rendered for ${surface}`);
  await act(async () => {
    item.click();
  });
  await waitForCondition(
    () => container.querySelector(hook) !== null,
    `${surface} never mounted into the work plane`,
  );
};

// ZNALEZISKO 0 FAZY 4, W JEDNEJ ASERCJI. Zmierzone na realnych danych 09.08:
// „No organizations yet · 0 organizations" przy 46 organizacjach zapisanych w
// workspace. Zmierzone tutaj na funkcji: `createOrganization` z domeny oddaje
// rekord z `recordState: undefined`, a `indexRelationships` wyrzucał go razem
// z każdym innym.
test("a record the product actually writes — with no recordState at all — draws", async () => {
  await openSurface("organizations", "[data-organizations-surface]", {
    ...populatedShellQueries,
    "relationship.workspace": projectionResponse({
      ...populatedRelationshipWorkspace,
      records: withoutRecordState(populatedRelationshipWorkspace.records),
    }),
  });

  await waitForCondition(
    () => container.querySelectorAll("[data-org-row]").length > 0,
    "Organizations drew no client row from records carrying no recordState — which is EVERY record this product creates, because only removal ever writes that key",
  );

  const row = [
    ...container.querySelectorAll<HTMLElement>("[data-org-row]"),
  ].find((node) => node.dataset.orgRow === referencedOrganizationId);
  assert.ok(
    row,
    "the client whose row the rest of this suite asserts is missing when its recordState is absent rather than 'active'",
  );
  // Nie tylko wiersz: licznik jest tym, co człowiek przeczytał 09.08 jako
  // „0 organizations", i to on kłamał najgłośniej.
  const count = container.querySelector<HTMLElement>("[data-org-count]");
  assert.ok(count, "the screen prints no count at all");
  assert.equal(
    /\b0 organizations\b/u.test(count.textContent ?? ""),
    false,
    "the count still reads zero over records that are all live",
  );
});

// DRUGI CEL LOTU: kiedy odczyt naprawdę PADNIE, komunikat ma nieść PRZYCZYNĘ.
// Trzy stałe zdania, które stały tu wcześniej, wyrzucały i nazwę zapytania, i
// kod odmowy — czytelnik dowiadywał się, że ekran jest pusty, co widział sam.
test("a refused read prints which query was refused and why, not a fixed sentence", async () => {
  await openSurface("organizations", "[data-organizations-surface]", {
    ...populatedShellQueries,
    "relationship.workspace": refusedResponse("authorization.denied"),
  });

  const message = container.querySelector<HTMLElement>(
    "[data-organizations-unavailable]",
  );
  assert.ok(
    message,
    "a refused read drew something other than the unavailable panel",
  );
  const stated = message.textContent ?? "";
  assert.match(
    stated,
    /relationship\.workspace/u,
    "the message does not say WHICH read failed, so a reader with no DevTools cannot tell this failure from any other",
  );
  assert.match(
    stated,
    /authorization\.denied/u,
    "the message does not carry the kernel's own refusal code, which is the whole difference between 'unavailable' and a repair",
  );
  assert.equal(
    container.querySelectorAll("[data-org-row]").length,
    0,
    "rows were drawn from a read the kernel refused",
  );
});

// TRZECI: JEDYNA ŚCIEŻKA, KTÓRA PRZESKAKIWAŁA STRAŻNIKA. Deal otwarty jako
// rekord wracał przed sprawdzeniem dostępności, więc nieczytelna projekcja
// meldowała się czytelnikowi jako „ten deal nie ma jeszcze ekranu rekordu" —
// zdanie o brakującej FUNKCJI tam, gdzie prawdą była awaria odczytu.
test("a deal opened as a record reports an unreadable slice, not a missing screen", async () => {
  const { PipelineSurface } =
    await import("../src/pipeline/PipelineSurface.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");

  const withoutRelationships = { ...populatedShellQueries };
  delete (withoutRelationships as Record<string, unknown>)[
    "relationship.workspace"
  ];
  const client = createScenarioClient({ queries: withoutRelationships });
  const snapshot = await loadDesktopSnapshot(client);
  assert.equal(
    snapshot.relationships.kind,
    "unavailable",
    "the fixture handed the surface a readable slice, so this test measures nothing",
  );

  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(PipelineSurface, {
        client,
        snapshot,
        selectedRecordId: undefined,
        // Kontekst przywrócony ze stanu urządzenia: RealApp szuka szansy tylko
        // przy `relationships.kind === "ready"`, więc przy nieczytelnej
        // projekcji `renderRecordScreen` jest ZAWSZE `undefined`.
        activeOpportunityId: referencedOrganizationId,
        renderRecordScreen: undefined,
        onSelectRecord: () => undefined,
        onOpenOpportunity: () => undefined,
        onOpenOrganization: () => undefined,
        onNavigate: () => undefined,
        onReload: () => undefined,
        onFailure: () => undefined,
      }),
    );
  });

  assert.equal(
    container.querySelector("[data-pipeline-record-missing]"),
    null,
    "an unreadable slice was reported as a deal with no record screen, which is a claim about the product where the truth is a failed read",
  );
  const message = container.querySelector<HTMLElement>(
    "[data-pipeline-unavailable]",
  );
  assert.ok(
    message,
    "the record slot drew neither the deal nor the reason the slice could not be read",
  );
  assert.match(
    message.textContent ?? "",
    /relationship\.workspace/u,
    "the record slot's message does not name the read that failed",
  );
  const retry = [
    ...(container
      .querySelector("[data-pipeline-surface]")
      ?.querySelectorAll<HTMLButtonElement>("button") ?? []),
  ].find((button) => /try again/iu.test(button.textContent ?? ""));
  assert.ok(retry, "the record slot offers no way back");
});

// CZWARTY: ZDANIE, KTÓRE NAZYWA PRZYCZYNĘ, JAKIEJ KOD NIE ZNA. Biblioteka
// mówiła „Content is not available in this scope" nad KAŻDĄ awarią odczytu
// notatek — a `optionalProjection` łapie odmowę autoryzacji, odrzucenie
// kontraktu i milczący most jednakowo. Czytelnik odesłany do sprawdzania
// przynależności do Space'u szuka wtedy usterki, której tam nie ma.
test("the Library prints the reason it was given, not a cause it invented", async () => {
  const { NotesReading } = await import("../src/library/NotesReading.js");
  const { workHarnessSnapshot } =
    await import("../src/dev/harness-snapshot.js");

  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(NotesReading, {
        client: undefined,
        snapshot: {
          ...workHarnessSnapshot,
          documents: {
            kind: "unavailable",
            message:
              "document.list was refused: authorization.denied. This view's data is unavailable right now. Try again.",
            diagnosticCode: "authorization.denied",
          },
        },
        inspectorHost: null,
        onInspectorOpen: () => undefined,
        onEntityActivate: () => undefined,
        onReload: async () => undefined,
        onFailure: () => undefined,
      }),
    );
  });

  const message = container.querySelector<HTMLElement>(
    "[data-notes-unavailable]",
  );
  assert.ok(message, "the Library drew no reason at all for an unread slice");
  const stated = message.textContent ?? "";
  assert.match(
    stated,
    /document\.list/u,
    "the Library does not say which read failed",
  );
  assert.match(
    stated,
    /authorization\.denied/u,
    "the Library does not carry the refusal it was handed",
  );
  assert.equal(
    /in this scope/u.test(stated),
    false,
    "the Library still names SCOPE as the cause — a claim `optionalProjection` cannot support, since it catches every failure alike",
  );
});
