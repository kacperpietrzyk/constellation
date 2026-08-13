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
  if (snapshot.relationships.kind !== "unavailable")
    assert.fail(
      "the fixture handed the surface a readable slice, so this test measures nothing",
    );
  // THE CODE, HELD BY AN ASSERTION — which is the whole justification the
  // `DataSlice` docblock gives for setting `diagnosticCode` on every failure.
  // Written and never read, it is indistinguishable from a field nobody needs.
  // The scenario client answers an unstubbed query with `query.not_available`
  // (`scenario-client.ts:247`), and that is the code the slice must carry.
  assert.equal(
    snapshot.relationships.diagnosticCode,
    "query.not_available",
    "the unavailable slice dropped the kernel's own code, leaving only prose for anything downstream to match on",
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
          // BOTH of the screen's reads, because the Library has TWO panels that
          // print an unavailable slice and the fixed sentence naming a cause
          // survived in the OTHER one for a whole lot: an assertion reading a
          // single element's `textContent` cannot see its neighbour.
          knowledge: {
            kind: "unavailable",
            message:
              "knowledge.list was refused: query.not_available. This view's data is unavailable right now. Try again.",
            diagnosticCode: "query.not_available",
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
  // THE WHOLE SCREEN, not this one element. Scoped to `[data-notes-unavailable]`
  // this assertion was green while the Folders panel eight lines up printed
  // "Folders are not available in this scope." in the same container, in the
  // same render — a green claim about the absence of something present beside
  // it, which is this repository's most repeated failure mode.
  assert.equal(
    /in this scope/u.test(container.textContent ?? ""),
    false,
    "the Library still names SCOPE as the cause somewhere on the screen — a claim `optionalProjection` cannot support, since it catches every failure alike",
  );

  const folders = container.querySelector<HTMLElement>(
    "[data-folders-unavailable]",
  );
  assert.ok(
    folders,
    "the Folders panel drew no reason at all for an unreadable knowledge read",
  );
  assert.match(
    folders.textContent ?? "",
    /knowledge\.list/u,
    "the Folders panel does not say which read failed",
  );
  assert.match(
    folders.textContent ?? "",
    /query\.not_available/u,
    "the Folders panel does not carry the refusal it was handed",
  );
  // A WAY BACK IN EACH PANEL, asserted panel by panel. Counting buttons over
  // the whole container would be a claim about a total, and a total is exactly
  // what a third panel appearing elsewhere on the screen would satisfy without
  // either of these two carrying one.
  for (const [stated, what] of [
    [folders, "Folders"],
    [message, "Notes"],
  ] as const) {
    const panel = stated.closest(".inline-error");
    assert.ok(panel, `${what} prints its reason outside any panel`);
    const retry = [...panel.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => /try again/iu.test(button.textContent ?? ""),
    );
    assert.ok(retry, `${what} states a reason and offers no way back from it`);
  }
});

// SIÓDMY: DRUGA POŁOWA TEGO SAMEGO EKRANU. `document.list` pada, `knowledge.list`
// przechodzi — panel listy mówi prawdę, a liczniki nad nim i obok niego dalej
// drukują zero z odczytu, którego nie było. Ten stan nie był mierzony NIGDZIE.
test("with the note list unread, the Library withdraws its counts instead of printing zero", async () => {
  const { NotesReading } = await import("../src/library/NotesReading.js");
  const { workHarnessSnapshot } =
    await import("../src/dev/harness-snapshot.js");
  const { libraryFolders } = await import("../src/dev/library-fixture.js");

  const folders = libraryFolders();
  const populated = folders.find((folder) => folder.noteCount > 0);
  assert.ok(
    populated,
    "the folder fixture carries no folder with notes in it, so the contradiction this test measures cannot appear",
  );

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
          knowledge: {
            kind: "ready",
            data: {
              kind: "knowledge.list",
              spaceId: workHarnessSnapshot.bootstrap.spaces[0]!.id,
              sources: [],
              folders,
              documents: [],
            },
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

  const all = container.querySelector<HTMLElement>(
    '[data-tree-key="all-notes"]',
  );
  assert.ok(all, "the tree drew no All notes row");
  assert.equal(
    /\b0 notes\b/u.test(all.getAttribute("aria-label") ?? ""),
    false,
    "All notes counts zero from a note list that was never read, over folder rows declaring their own notes",
  );
  const count = container.querySelector<HTMLElement>("[data-notes-count]");
  assert.ok(count, "the note list prints no count at all");
  assert.equal(
    count.textContent,
    "—",
    "the list header prints a number derived from a refused read",
  );
  // The folder rows keep THEIR number: it comes from the read that succeeded,
  // and withdrawing it would be the same defect pointed the other way.
  const folderRow = container.querySelector<HTMLElement>(
    `[data-tree-key="${populated.id}"]`,
  );
  assert.ok(folderRow, "the tree drew no row for a folder that has notes");
  assert.match(
    folderRow.getAttribute("aria-label") ?? "",
    new RegExp(`\\b${populated.noteCount} notes?\\b`, "u"),
    "a folder row dropped the count `knowledge.list` actually returned",
  );
});

// PIĄTY I SZÓSTY: POZOSTAŁE DWIE TRZECIE KLASY „STAŁE ZDANIE". Zadania i
// Źródła oddawały `.message` do kosza dokładnie tak samo jak notatki; bez tych
// dwóch asercji nowe haki byłyby zdolnością, której nic nie mierzy — kompilacja
// pliku nie jest dowodem, że panel się rysuje.
test("Tasks prints the reason the work plane could not be read, and a way back", async () => {
  const { TasksSurface } = await import("../src/tasks/TasksSurface.js");
  const { workHarnessSnapshot } =
    await import("../src/dev/harness-snapshot.js");

  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(TasksSurface, {
        snapshot: {
          ...workHarnessSnapshot,
          work: {
            kind: "unavailable",
            message:
              "work.overview was refused: authorization.denied. This view's data is unavailable right now. Try again.",
            diagnosticCode: "authorization.denied",
          },
        },
        selectedTaskId: undefined,
        onOpenTask: () => undefined,
        onSelectTask: () => undefined,
        onCreateTask: async () => true,
        onSetStatus: () => undefined,
        onSetCompleted: () => undefined,
        onPlanOnDay: () => undefined,
        onOpenCalendar: () => undefined,
        onReload: async () => undefined,
      }),
    );
  });

  const message = container.querySelector<HTMLElement>(
    "[data-tasks-unavailable]",
  );
  assert.ok(message, "Tasks drew no reason at all for an unread work plane");
  assert.match(
    message.textContent ?? "",
    /work\.overview/u,
    "Tasks does not say which read failed",
  );
  const retry = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => /try again/iu.test(button.textContent ?? ""));
  assert.ok(retry, "Tasks offers no way back from an unread work plane");
});

test("Sources prints the reason its metadata could not be read", async () => {
  const { SourcesReading } = await import("../src/library/SourcesReading.js");
  const { workHarnessSnapshot } =
    await import("../src/dev/harness-snapshot.js");

  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(SourcesReading, {
        client: undefined,
        snapshot: {
          ...workHarnessSnapshot,
          knowledge: {
            kind: "unavailable",
            message:
              "knowledge.list was refused: query.not_available. This view's data is unavailable right now. Try again.",
            diagnosticCode: "query.not_available",
          },
        },
        onReload: async () => undefined,
        onFailure: () => undefined,
      }),
    );
  });

  const message = container.querySelector<HTMLElement>(
    "[data-sources-unavailable]",
  );
  assert.ok(message, "Sources drew no reason at all for unread metadata");
  assert.match(
    message.textContent ?? "",
    /knowledge\.list/u,
    "Sources does not say which read failed",
  );
  // THE COUNTER ABOVE THE MESSAGE, which the first version of this test never
  // looked at: the panel said "we could not ask" while the pill over it printed
  // `0` from the same unread projection. The Organizations assertion above has
  // held its counter from the start; this one did not, on the same screenful.
  const count = container.querySelector<HTMLElement>("[data-sources-count]");
  assert.ok(count, "Sources prints no count at all");
  assert.equal(
    count.textContent,
    "—",
    "the source counter answers with a number taken from a read that was refused",
  );
});

// ÓSMY: DRUGA PROJEKCJA EKRANU LUDZI. Ludzie przychodzą z
// `relationship.workspace`, a to, na co się czeka — z płaszczyzny pracy. Kiedy
// padała ta druga, wiersz cicho wpadał w gałąź „brak oczekiwania" i rysował
// nazwę organizacji: zielony sygnał „nie czekasz na nikogo" wyprodukowany przez
// awarię odczytu.
test("People says the work plane could not be read instead of implying nobody is waited on", async () => {
  await openSurface("people", "[data-people-surface]", {
    ...populatedShellQueries,
    "work.overview": refusedResponse("authorization.denied"),
  });

  const rows = container.querySelectorAll<HTMLElement>("[data-person-row]");
  assert.ok(
    rows.length > 0,
    "no person row drew at all, so this test measures nothing about what a row claims",
  );

  const message = container.querySelector<HTMLElement>(
    "[data-people-work-unavailable]",
  );
  assert.ok(
    message,
    "People drew every row and said nothing about the plane it could not read",
  );
  assert.match(
    message.textContent ?? "",
    /work\.overview/u,
    "the message does not say which read failed",
  );

  const unknown = container.querySelectorAll("[data-person-waiting-unknown]");
  assert.equal(
    unknown.length,
    rows.length,
    "a person row still fills the waiting slot as though the work plane had been read and held nothing",
  );
  const named = [...rows].find((row) =>
    /could not be read/u.test(row.getAttribute("aria-label") ?? ""),
  );
  assert.ok(
    named,
    "the accessible name omits waiting entirely, which reads as a person nobody is waiting on",
  );
});
