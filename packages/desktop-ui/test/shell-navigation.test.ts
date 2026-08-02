import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DocumentIdSchema,
  ProjectIdSchema,
  StrategicRecordIdSchema,
  TaskIdSchema,
} from "@constellation/contracts";

import {
  activateShellContext,
  activeShellContext,
  closeShellContext,
  createShellNavigation,
  destinationShortcutIndex,
  destinationContext,
  documentContext,
  libraryReadingContext,
  moveShellHistory,
  navigateShellContext,
  openShellContext,
  openShellContextReportingEviction,
  opportunityContext,
  organizationContext,
  projectContext,
  pruneInaccessibleShellContexts,
  restoreFavoriteSurfaces,
  restoreShellNavigation,
  serializeShellNavigation,
  settingsCategoryContext,
  taskContext,
} from "../src/client/shell-navigation.js";

const taskId = TaskIdSchema.parse("00000000-0000-4000-8000-000000000001");
const projectId = ProjectIdSchema.parse("00000000-0000-4000-8000-000000000002");
const documentId = DocumentIdSchema.parse(
  "00000000-0000-4000-8000-000000000003",
);
const organizationId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-000000000004",
);
const opportunityId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-000000000005",
);

describe("stable shell navigation", () => {
  it("maps every visible destination shortcut, including Meetings and Documents", () => {
    assert.equal(destinationShortcutIndex("Digit1"), 0);
    assert.equal(destinationShortcutIndex("Digit8"), 7);
    assert.equal(destinationShortcutIndex("Digit9"), 8);
    assert.equal(destinationShortcutIndex("Digit0"), undefined);
  });

  it("preserves record contexts across Back and Forward", () => {
    let state = createShellNavigation(destinationContext("today", "Tydzień"));
    state = openShellContext(state, taskContext(taskId, "Zadanie Alpha"));
    state = openShellContext(state, projectContext(projectId, "Projekt Alpha"));
    state = openShellContext(
      state,
      documentContext(documentId, "Dokument Alpha"),
    );

    state = moveShellHistory(state, -1);
    assert.equal(activeShellContext(state).projectId, projectId);
    state = moveShellHistory(state, -1);
    assert.equal(activeShellContext(state).taskId, taskId);
    state = moveShellHistory(state, -1);
    assert.equal(activeShellContext(state).surface, "today");
    state = moveShellHistory(state, 1);
    assert.equal(activeShellContext(state).taskId, taskId);
  });

  it("reuses a context, truncates forward history, and closes safely", () => {
    const cockpit = destinationContext("today", "Tydzień");
    const task = taskContext(taskId, "Zadanie Alpha");
    const project = projectContext(projectId, "Projekt Alpha");
    let state = createShellNavigation(cockpit);
    state = openShellContext(state, task);
    state = openShellContext(state, project);
    state = moveShellHistory(state, -1);
    state = activateShellContext(state, cockpit.key);

    assert.deepEqual(state.history, [cockpit, task, cockpit]);
    assert.equal(state.tabs.length, 3);
    state = closeShellContext(state, cockpit.key);
    assert.equal(activeShellContext(state).key, task.key);
    assert.equal(
      state.tabs.some((tab) => tab.key === cockpit.key),
      false,
    );
  });

  it("re-materializes contexts navigated within one card on Back and Forward", () => {
    const cockpit = destinationContext("today", "Tydzień");
    const task = taskContext(taskId, "Zadanie Alpha");
    const project = projectContext(projectId, "Projekt Alpha");
    let state = createShellNavigation(cockpit);
    state = navigateShellContext(state, task);
    state = navigateShellContext(state, project);
    assert.equal(state.tabs.length, 1);

    state = moveShellHistory(state, -1);
    assert.equal(state.tabs.length, 1);
    assert.equal(activeShellContext(state).key, task.key);
    assert.equal(activeShellContext(state).taskId, taskId);

    state = moveShellHistory(state, -1);
    assert.equal(activeShellContext(state).key, cockpit.key);

    state = moveShellHistory(state, 1);
    assert.equal(activeShellContext(state).key, task.key);
    assert.equal(state.tabs.length, 1);
  });

  it("does not replace another open card on Back after closing a card", () => {
    const cockpit = destinationContext("today", "Tydzień");
    const taskB = taskContext(taskId, "Zadanie B");
    const projectC = projectContext(projectId, "Projekt C");
    let state = createShellNavigation(cockpit);
    state = openShellContext(state, taskB);
    state = openShellContext(state, projectC);
    state = activateShellContext(state, taskB.key);

    // ⌘W zamyka aktywną kartę B; aktywna staje się karta C.
    state = closeShellContext(state, taskB.key);
    assert.deepEqual(
      state.tabs.map((tab) => tab.key),
      [cockpit.key, projectC.key],
    );
    assert.equal(activeShellContext(state).key, projectC.key);

    // Wstecz pomija wpisy zamkniętej karty B zamiast podmieniać kartę C.
    state = moveShellHistory(state, -1);
    assert.deepEqual(
      state.tabs.map((tab) => tab.key),
      [cockpit.key, projectC.key],
    );
    assert.notEqual(activeShellContext(state).key, taskB.key);

    state = moveShellHistory(state, -1);
    assert.equal(activeShellContext(state).key, cockpit.key);
    assert.deepEqual(
      state.tabs.map((tab) => tab.key),
      [cockpit.key, projectC.key],
    );
  });

  it("reports the silently evicted context when the tab limit overflows", () => {
    let state = createShellNavigation(destinationContext("today", "Tydzień"));
    for (let index = 0; index < 6; index += 1) {
      const id = TaskIdSchema.parse(
        `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
      );
      state = openShellContext(state, taskContext(id, `Zadanie ${index + 1}`));
    }
    assert.equal(state.tabs.length, 7);

    const overflowing = taskContext(
      TaskIdSchema.parse("00000000-0000-4000-8000-000000000099"),
      "Zadanie przepełniające",
    );
    const outcome = openShellContextReportingEviction(state, overflowing);
    assert.equal(outcome.state.tabs.length, 7);
    assert.ok(outcome.evictedContext);
    assert.equal(
      outcome.state.tabs.some((tab) => tab.key === outcome.evictedContext?.key),
      false,
    );

    const restored = openShellContext(outcome.state, outcome.evictedContext!);
    assert.equal(activeShellContext(restored).key, outcome.evictedContext!.key);
  });

  it("bounds open contexts without evicting the current context", () => {
    let state = createShellNavigation(destinationContext("today", "Tydzień"));
    for (let index = 0; index < 9; index += 1) {
      const id = TaskIdSchema.parse(
        `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
      );
      state = openShellContext(state, taskContext(id, `Zadanie ${index + 1}`));
    }
    assert.ok(state.tabs.length <= 7);
    assert.ok(state.tabs.some((tab) => tab.key === state.activeKey));
  });

  it("restores bounded tabs and rejects corrupt or unknown destinations", () => {
    let state = createShellNavigation(destinationContext("tasks", "Tasks"));
    state = openShellContext(state, taskContext(taskId, "Zadanie Alpha"));
    const restored = restoreShellNavigation(
      serializeShellNavigation(state),
      destinationContext("today", "Tydzień"),
    );
    assert.equal(activeShellContext(restored).taskId, taskId);
    assert.equal(
      activeShellContext(
        restoreShellNavigation(
          '{"version":1,"state":{"tabs":[{"key":"x","label":"X","surface":"unknown"}]}}',
          destinationContext("today", "Tydzień"),
        ),
      ).surface,
      "today",
    );
  });

  it("removes inaccessible record titles and IDs after reauthorization", () => {
    const cockpit = destinationContext("today", "Tydzień");
    let state = createShellNavigation(cockpit);
    state = openShellContext(state, taskContext(taskId, "Poufne zadanie"));
    state = openShellContext(
      state,
      projectContext(projectId, "Poufny projekt"),
    );
    state = openShellContext(
      state,
      organizationContext(organizationId, "Poufna organizacja"),
    );
    // Piąty rodzaj kontekstu, dołożony razem z ekranem rekordu szansy. Tytuł
    // zakładki to NAZWA CUDZEJ PRACY — po utracie dostępu ma zniknąć razem
    // z identyfikatorem, dokładnie tak jak trzy powyższe.
    state = openShellContext(
      state,
      opportunityContext(opportunityId, "Poufna szansa"),
    );

    const pruned = pruneInaccessibleShellContexts(
      state,
      {
        taskIds: new Set(),
        projectIds: new Set(),
        documentIds: new Set(),
        organizationIds: new Set(),
        opportunityIds: new Set(),
      },
      cockpit,
    );

    assert.deepEqual(pruned.tabs, [cockpit]);
    assert.deepEqual(pruned.history, [cockpit]);
    assert.equal(pruned.activeKey, cockpit.key);
    assert.doesNotMatch(
      serializeShellNavigation(pruned),
      /Poufne|Poufna|00000000/,
    );
  });
});

describe("shell navigation across a version upgrade", () => {
  it("carries the tabs of a session saved by the previous version over", () => {
    // Osiem identyfikatorów celów zmieniło nazwę w 0.2.0, a KAŻDA zapisana
    // zakładka niesie identyfikator powierzchni. Bez migracji pierwsze
    // uruchomienie po aktualizacji odrzuca całą zapisaną sesję — bez awarii,
    // więc bez śladu, ale człowiek traci wszystko, co miał otwarte.
    const legacy = JSON.stringify({
      version: 2,
      state: {
        tabs: [
          { key: "destination:cockpit", label: "Tydzień", surface: "cockpit" },
          {
            key: "destination:attention",
            label: "Do uwagi",
            surface: "attention",
          },
          {
            key: "destination:documents",
            label: "Dokumenty",
            surface: "documents",
          },
          {
            key: "destination:relationships",
            label: "Relacje",
            surface: "relationships",
          },
          // „Zapisane widoki" zniknęły później niż tamte cztery — razem
          // z ekranem, który był jedynym miejscem, gdzie widok dało się
          // założyć. Otwiera się dziś NA Zadaniach, więc zakładka ma dokąd
          // trafić. Ta pozycja jest tu, bo cała zapisana sesja jest
          // odrzucana ZBIOROWO: `isRestorableShellContext` nie zna
          // powierzchni, `tabs.length` się nie zgadza i powłoka startuje od
          // zera — bez awarii, więc bez śladu.
          {
            key: "destination:work",
            label: "Zapisane widoki",
            surface: "work",
          },
          // `history` STAŁ W WYDANYM 0.1.9 pod tą samą nazwą, więc zapis
          // z tamtej wersji niesie go dosłownie tak. Historia wrzutek jest od
          // fali Knowledge odczytem Biblioteki — treść się przeniosła, cel
          // zniknął.
          {
            key: "destination:history",
            label: "Capture history",
            surface: "history",
          },
        ],
        activeKey: "destination:attention",
        history: [
          { key: "destination:cockpit", label: "Tydzień", surface: "cockpit" },
        ],
        historyIndex: 0,
      },
    });
    const restored = restoreShellNavigation(
      legacy,
      destinationContext("today", "Today"),
    );
    // PIĘĆ ZAKŁADEK Z SZEŚCIU ZAPISANYCH, i ta jedna różnica jest defektem
    // naprawionym w fali E, a nie regresją tego testu. `documents` i `history`
    // schodzą się OBA na `library`, więc ten zapis odtwarzał DWIE zakładki
    // o identycznym kluczu `destination:library` — dwa identyczne `key` Reacta
    // w pasku, `activeKey` pasujący do obu i zamykanie, które nie umie ich
    // rozróżnić. Ten test asertował ten dubel jako zachowanie.
    //
    // ZNALEZIONE PRZY LOCIE `activity`, ALE STARSZE OD NIEGO: dubel jest żywy
    // od wycofania `history` w fali Knowledge, czyli od 0.2.0 — a nie, jak
    // zakładał rekonesans, dopiero od drugiego celu schodzącego na `settings`.
    assert.deepEqual(
      restored.tabs.map((tab) => tab.surface),
      ["today", "inbox", "library", "organizations", "tasks"],
    );
    // Etykieta i klucz idą razem z celem. Zapis niesie WŁASNĄ kopię napisu,
    // więc bez tego pierwsze uruchomienie po przebudowie pokazuje angielską
    // nawigację i polskie zakładki w tym samym oknie; a zakładka zostawiona
    // pod starym kluczem dubluje się, gdy ten sam cel zostanie otwarty jeszcze
    // raz.
    assert.deepEqual(
      restored.tabs.map((tab) => tab.label),
      ["Today", "Inbox", "Library", "Organizations", "Tasks"],
    );
    assert.deepEqual(
      restored.tabs.map((tab) => tab.key),
      [
        "destination:today",
        "destination:inbox",
        "destination:library",
        "destination:organizations",
        "destination:tasks",
      ],
    );
    assert.equal(
      new Set(restored.tabs.map((tab) => tab.key)).size,
      restored.tabs.length,
    );
    // Zapisany `activeKey` wskazywał starą nazwę; gdyby nie przeszedł tej samej
    // migracji, nie trafiałby w żadną odtworzoną zakładkę i CAŁA sesja
    // zostałaby odrzucona — cicho, bo bez awarii.
    assert.equal(restored.activeKey, "destination:inbox");
    assert.deepEqual(
      restored.history.map((entry) => entry.label),
      ["Today"],
    );
  });

  // Ten sam test na wersji, którą zapisuje KAŻDY dzisiejszy build 0.2.0.
  // Wersja 3 nie jest podbijana przy wycofaniu celu i to jest decyzja:
  // `restoreShellNavigation` przepuszcza `2` i `3`, a mapa wycofanych celów
  // jest konsultowana niezależnie od wersji. Podbicie do `4` odrzuciłoby każdą
  // sesję zapisaną przez dev-build 0.2.0 — bez awarii, więc bez śladu.
  //
  // Test MUSI wychodzić od stanu zapisanego przez POPRZEDNI kształt. Świeży
  // test napisany od dzisiejszego kształtu przechodzi bez mapy wycofań i nie
  // mierzy niczego.
  it("carries a `history` tab saved by a 0.2.0 dev build over as well", () => {
    const saved = JSON.stringify({
      version: 3,
      state: {
        tabs: [
          { key: "destination:today", label: "Today", surface: "today" },
          {
            key: "destination:history",
            label: "Capture history",
            surface: "history",
          },
        ],
        activeKey: "destination:history",
        history: [
          {
            key: "destination:history",
            label: "Capture history",
            surface: "history",
          },
        ],
        historyIndex: 0,
      },
    });
    const restored = restoreShellNavigation(
      saved,
      destinationContext("today", "Today"),
    );
    // Dwie zakładki, nie jedna: brak mapy odrzuca CAŁĄ sesję zbiorowo
    // (`tabs.length !== state.tabs.length`) i powłoka startuje od zera.
    assert.deepEqual(
      restored.tabs.map((tab) => tab.surface),
      ["today", "library"],
    );
    assert.deepEqual(
      restored.tabs.map((tab) => tab.key),
      ["destination:today", "destination:library"],
    );
    assert.equal(restored.activeKey, "destination:library");
    assert.deepEqual(
      restored.history.map((entry) => entry.surface),
      ["library"],
    );
  });

  // TA SAMA GWARANCJA DLA `access`, i to nie jest kopia dla symetrii. Mapa
  // `retiredDesktopSurfaces` jest kluczowana zwykłym `string`iem, więc brak
  // wpisu przechodzi `tsc` BEZ SŁOWA — a przy odtwarzaniu ginie nie jedna
  // zakładka, tylko CAŁA zapisana sesja: `isRestorableShellContext` odrzuca
  // nieznaną powierzchnię, `tabs.length !== state.tabs.length` i powłoka
  // startuje od zera. Bez awarii, więc bez śladu, przy pierwszym uruchomieniu
  // po aktualizacji.
  //
  // DWIE zakładki, nie jedna, i `today` PIERWSZA: gdyby test niósł samą
  // zakładkę `access`, odrzucenie sesji też skończyłoby się na `today`
  // i asercja przeszłaby na fallbacku, nie na migracji.
  it("carries an `access` tab saved by a 0.2.0 dev build over into Settings", () => {
    const saved = JSON.stringify({
      version: 3,
      state: {
        tabs: [
          { key: "destination:today", label: "Today", surface: "today" },
          { key: "destination:access", label: "Access", surface: "access" },
        ],
        activeKey: "destination:access",
        history: [
          { key: "destination:access", label: "Access", surface: "access" },
        ],
        historyIndex: 0,
      },
    });
    const restored = restoreShellNavigation(
      saved,
      destinationContext("today", "Today"),
    );
    assert.deepEqual(
      restored.tabs.map((tab) => tab.surface),
      ["today", "settings"],
    );
    // Klucz idzie razem z celem, inaczej zapisany `activeKey` nie trafia
    // w żadną odtworzoną zakładkę i sesja pada mimo poprawnej mapy.
    assert.deepEqual(
      restored.tabs.map((tab) => tab.key),
      ["destination:today", "destination:settings"],
    );
    // Etykieta pochodzi z rejestru, nie z zapisu: zakładka nazwana „Access"
    // otwierałaby Ustawienia pod cudzą nazwą.
    assert.deepEqual(
      restored.tabs.map((tab) => tab.label),
      ["Today", "Settings"],
    );
    assert.equal(restored.activeKey, "destination:settings");
    assert.deepEqual(
      restored.history.map((entry) => entry.surface),
      ["settings"],
    );
  });

  // OBA WYCOFANE CELE W JEDNEJ SESJI — i to jest przypadek, który staje się
  // osiągalny dopiero teraz, kiedy DRUGI identyfikator schodzi na `settings`.
  //
  // Bez scalania kluczy ten zapis odtwarza DWIE zakładki niosące identyczny
  // `destination:settings`: dwa identyczne `key` Reacta w pasku, `activeKey`
  // pasujący do obu i zamknięcie, które nie umie ich rozróżnić. Nic nie rzuca.
  //
  // TRZECIA ZAKŁADKA JEST NOŚNA. Bez `tasks` obie awarie wyglądają tak samo:
  // „została jedna zakładka" można dostać i scaleniem, i odrzuceniem CAŁEJ
  // sesji do fallbacku `today`. Z trzema zakładkami odrzucenie daje jedną
  // zakładkę, a scalenie trzy — i te dwa wyniki już się różnią.
  it("merges two retired tabs that resolve onto the same successor", () => {
    const saved = JSON.stringify({
      version: 3,
      state: {
        tabs: [
          { key: "destination:today", label: "Today", surface: "today" },
          {
            key: "destination:activity",
            label: "Activity",
            surface: "activity",
          },
          { key: "destination:tasks", label: "Tasks", surface: "tasks" },
          { key: "destination:access", label: "Access", surface: "access" },
        ],
        activeKey: "destination:access",
        history: [
          { key: "destination:today", label: "Today", surface: "today" },
        ],
        historyIndex: 0,
      },
    });
    const restored = restoreShellNavigation(
      saved,
      destinationContext("today", "Today"),
    );
    assert.deepEqual(
      restored.tabs.map((tab) => tab.surface),
      ["today", "settings", "tasks"],
    );
    assert.deepEqual(
      restored.tabs.map((tab) => tab.key),
      ["destination:today", "destination:settings", "destination:tasks"],
    );
    assert.equal(
      new Set(restored.tabs.map((tab) => tab.key)).size,
      restored.tabs.length,
      "dwie zakładki o tym samym kluczu to jedna pozycja, która czasem znika",
    );
    // ZOSTAJE PIERWSZA, i po scaleniu obie są nierozróżnialne: etykieta
    // zakładki-celu czyta się z rejestru, więc obie mówią „Settings" i żadna
    // nie niesie kategorii. Gdyby migracja przypisywała im RÓŻNE kategorie,
    // „pierwsza" przestałaby być wyborem bez treści.
    assert.deepEqual(
      restored.tabs.map((tab) => tab.label),
      ["Today", "Settings", "Tasks"],
    );
    assert.equal(
      restored.tabs.every((tab) => tab.settingsCategory === undefined),
      true,
    );
    // `activeKey` zapisany na drugim z dubli trafia w scaloną zakładkę.
    assert.equal(restored.activeKey, "destination:settings");
  });

  // Głęboki link przeżywa zapis, tak samo jak odczyt Biblioteki niżej: paleta
  // otwiera taflę „Activity" jako Ustawienia NA kategorii `data`, a zakładka ma
  // się odtworzyć jako to, czym była.
  it("keeps a settings category on a saved tab, and refuses one outside the vocabulary", () => {
    const deep = settingsCategoryContext("data");
    assert.equal(deep.key, "destination:settings");
    const restored = restoreShellNavigation(
      serializeShellNavigation(createShellNavigation(deep)),
      destinationContext("today", "Today"),
    );
    assert.equal(activeShellContext(restored).settingsCategory, "data");

    const stranger = restoreShellNavigation(
      JSON.stringify({
        version: 3,
        state: {
          tabs: [
            {
              key: "destination:settings",
              label: "Settings",
              surface: "settings",
              settingsCategory: "billing",
            },
          ],
          activeKey: "destination:settings",
          history: [
            { key: "destination:today", label: "Today", surface: "today" },
          ],
          historyIndex: 0,
        },
      }),
      destinationContext("today", "Today"),
    );
    // Kategoria spoza słownika odrzuca CAŁY zapis — ekran przewijałby do
    // identyfikatora, którego nie ma, i otwierał się na kategorii wybranej po
    // cichu przez własny stan.
    assert.equal(activeShellContext(stranger).surface, "today");
    assert.equal(stranger.tabs.length, 1);
  });

  // Odczyt jest częścią kontekstu, więc przeżywa zapis: wrzutka głosowa
  // otwiera Bibliotekę NA Historii wrzutek, a zakładka ma się odtworzyć jako
  // to, czym była, nie jako Notatki.
  it("reopens a Library tab on the reading it was opened at", () => {
    const fallback = destinationContext("today", "Today");
    let state = createShellNavigation(fallback);
    state = openShellContext(
      state,
      libraryReadingContext("captures", "Capture history"),
    );
    const restored = restoreShellNavigation(
      serializeShellNavigation(state),
      fallback,
    );
    assert.deepEqual(
      restored.tabs.map((tab) => tab.libraryReading),
      [undefined, "captures"],
    );
  });

  it("refuses a saved reading that is not one of the three", () => {
    // Napis spoza słownika odrzuca CAŁY zapis, tak samo jak nieznany cel:
    // przełącznik nie wyrenderowałby wtedy żadnego z trzech odczytów.
    const saved = JSON.stringify({
      version: 3,
      state: {
        tabs: [
          {
            key: "destination:library",
            label: "Library",
            surface: "library",
            libraryReading: "atlantis",
          },
        ],
        activeKey: "destination:library",
        history: [
          { key: "destination:today", label: "Today", surface: "today" },
        ],
        historyIndex: 0,
      },
    });
    const restored = restoreShellNavigation(
      saved,
      destinationContext("today", "Today"),
    );
    assert.deepEqual(
      restored.tabs.map((tab) => tab.surface),
      ["today"],
    );
  });

  it("refuses a saved destination it cannot place, instead of guessing", () => {
    // Odmowa jest tu lepsza niż zgadywanie: zakładka otwarta na losowym ekranie
    // czyta się jak utrata pracy, a nie jak migracja.
    const unknown = JSON.stringify({
      version: 2,
      state: {
        tabs: [
          { key: "destination:atlantis", label: "?", surface: "atlantis" },
        ],
        activeKey: "destination:atlantis",
        history: [
          { key: "destination:atlantis", label: "?", surface: "atlantis" },
        ],
        historyIndex: 0,
      },
    });
    const restored = restoreShellNavigation(
      unknown,
      destinationContext("today", "Today"),
    );
    assert.deepEqual(
      restored.tabs.map((tab) => tab.surface),
      ["today"],
    );
  });
});

describe("opening a task as a record is asked for, never assumed", () => {
  // Eleven places in the shell build a task context. Most of them mean "take me
  // to this task": a capture that has just become one, a signal activated from
  // the operating system, a reference followed out of a document. One means
  // "show me this task INSTEAD of the list".
  //
  // For one CI cycle the difference did not exist, and all eleven promoted: the
  // packaged smoke turned a capture into a task and then looked for its row on
  // a screen that had replaced the list with the record. Three packaged runs
  // failed on three systems for a change that was never about capture.
  it("a task navigated to is not a task opened", () => {
    const plain = taskContext(taskId, "Zamów licencje");
    assert.equal(
      plain.record,
      undefined,
      "navigating to a task promoted it to a record nobody asked for",
    );
    assert.equal(
      taskContext(taskId, "Zamów licencje", { record: true }).record,
      true,
      "asking for the record did not produce one",
    );
    // Same key either way, and that is deliberate: it is one task, so it is one
    // tab. Opening the record for a task already in a tab must reuse it rather
    // than sit beside it under the same name.
    assert.equal(
      plain.key,
      taskContext(taskId, "Zamów licencje", { record: true }).key,
    );
  });

  it("a record survives being saved and reopened, and a plain context stays plain", () => {
    // The flag lives on the CONTEXT rather than in the shell's own state
    // precisely so a tab reopens as what it was. If it did not round-trip, the
    // record would silently become the collection on the next launch.
    const fallback = destinationContext("today", "Today");
    let state = createShellNavigation(fallback);
    state = openShellContext(
      state,
      taskContext(taskId, "Zamów licencje", {
        record: true,
      }),
    );
    const second = TaskIdSchema.parse("00000000-0000-4000-8000-0000000000f1");
    state = openShellContext(state, taskContext(second, "Potwierdź budżet"));
    const restored = restoreShellNavigation(
      serializeShellNavigation(state),
      fallback,
    );
    assert.deepEqual(
      restored.tabs.map((tab) => `${tab.key}:${tab.record === true}`),
      [
        "destination:today:false",
        `task:${taskId}:true`,
        `task:${second}:false`,
      ],
      "a reopened session disagreed with the one that was saved about which task was open as a record",
    );
  });
});

/* PRZYPIĘCIA ODTWARZANE Z ZAPISU SPRZED PRZEBUDOWY.
 *
 * Ta sama rodzina co `retiredDesktopSurfaces` przy zakładkach: ZAPISANY STAN
 * URZĄDZENIA WSKAZUJĄCY NA COŚ, CO PRZESTAŁO BYĆ CELEM. Różnica jest w tym,
 * co się dzieje, gdy nikt tego nie odsieje — zakładka wskazująca w nicość
 * odrzuca całą sesję głośno, a przypięcie do trybu Ustawień rysuje się dalej
 * i NIE DA SIĘ GO ODPIĄĆ: gwiazdka stoi przy pozycji nawigacji, a Ustawienia
 * przestały nią być.
 *
 * Każde `deepEqual` niżej mówi, KTÓRE cele przeżyły, a nie ILE ich zostało.
 * Liczba przechodzi przy filtrze, który odsiał wszystko, i przy filtrze, który
 * nie odsiał niczego, jeśli tylko wynik ma właściwą długość.
 */
describe("favourites restored from a device that saved them earlier", () => {
  it("drops a Settings favourite nobody could un-star, and keeps the retired one that has a successor", () => {
    // Zapis człowieka, który przypiął Ustawienia ZANIM przestały być pozycją
    // nawigacji, i który ma jeszcze przypięcia z 0.1.9. Trzy cele, trzy różne
    // rozstrzygnięcia — dlatego stoją w jednej fikstury: `settings` znika, bo
    // jego chrome to tryb; `history` PRZEŻYWA jako `library`, bo wycofanie
    // rozwiązuje się przed regułą chrome; `tasks` przechodzi nietknięte.
    assert.deepEqual(
      restoreFavoriteSurfaces(JSON.stringify(["settings", "history", "tasks"])),
      ["library", "tasks"],
      "a favourite pinned to a surface that is no longer a navigation target survived the restore, and nothing on screen can un-star it",
    );
  });

  it("drops both retired ids that resolve onto the Settings mode, and says so by name", () => {
    // `access` i `activity` wsiąkły w Ustawienia w tej fali. Przypięcie do
    // każdego z nich rozwiązuje się na cel, którego przypiąć się nie da —
    // więc znika, a nie zostaje jako druga i trzecia zablokowana pinezka.
    assert.deepEqual(
      restoreFavoriteSurfaces(JSON.stringify(["access", "activity", "today"])),
      ["today"],
      "a retired id resolving onto the Settings mode came back as a favourite",
    );
  });

  it("keeps two retired ids that land on one successor as ONE favourite", () => {
    // `documents` i `history` schodzą się na `library`. Szyna z tą samą
    // pozycją dwa razy to nie jest to, co ktoś przypiął.
    assert.deepEqual(
      restoreFavoriteSurfaces(JSON.stringify(["documents", "history", "work"])),
      ["library", "tasks"],
      "two retired ids resolving onto one target were pinned twice",
    );
  });

  it("ignores a saved entry that names no surface at all", () => {
    assert.deepEqual(
      restoreFavoriteSurfaces(JSON.stringify(["atlantis", 7, null, "inbox"])),
      ["inbox"],
    );
  });

  it("falls back to the two starting pins only when the saved value is not a list", () => {
    // Rozróżnienie, które łatwo zgubić: PUSTY zapis to nie jest uszkodzony
    // zapis. Człowiek, który odpiął wszystko, ma mieć pustą szynę, a nie dwie
    // pinezki, których nie ustawiał.
    assert.deepEqual(restoreFavoriteSurfaces(null), []);
    assert.deepEqual(restoreFavoriteSurfaces("[]"), []);
    assert.deepEqual(restoreFavoriteSurfaces('{"today":true}'), [
      "today",
      "tasks",
    ]);
    assert.deepEqual(restoreFavoriteSurfaces("{not json"), ["today", "tasks"]);
  });
});
