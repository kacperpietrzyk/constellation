import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DocumentIdSchema,
  ProjectIdSchema,
  StrategicRecordIdSchema,
  TaskIdSchema,
} from "@constellation/contracts";
import { desktopSurfaceLabel } from "@constellation/desktop-preload/surface-registry";

import { libraryReadingLabel } from "../src/library/library-readings.js";
import {
  activateShellContext,
  activeShellContext,
  closeShellContext,
  createShellNavigation,
  destinationShortcutIndex,
  destinationContext,
  documentContext,
  libraryReadings,
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
  tasksSavedViewContext,
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
          // z tamtej wersji niesie go dosłownie tak. Od lotu D3 rozwiązuje się
          // na `captures` — cel wrócił pod nową nazwą, a nie pod starą.
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
    // SZEŚĆ ZAKŁADEK Z SZEŚCIU, i to jest zmiana wobec fali E, w której było
    // ich pięć. Powód nie jest w tym pliku: `documents` i `history` schodziły
    // się OBA na `library`, więc jedna z nich była DUBLEM i scalenie ich w
    // jedną było poprawką. Lot D3 rozwinął Bibliotekę na trzy cele, więc te
    // dwa wycofane identyfikatory mają znowu dwa RÓŻNE następstwa — `notes`
    // i `captures` — i scalać nie ma czego. Scalenie dubli dalej działa, tyle
    // że na tym zapisie nie ma na czym: dowodzi go test `access`/`activity`
    // niżej.
    assert.deepEqual(
      restored.tabs.map((tab) => tab.surface),
      ["today", "inbox", "notes", "organizations", "tasks", "captures"],
    );
    // Etykieta i klucz idą razem z celem. Zapis niesie WŁASNĄ kopię napisu,
    // więc bez tego pierwsze uruchomienie po przebudowie pokazuje angielską
    // nawigację i polskie zakładki w tym samym oknie; a zakładka zostawiona
    // pod starym kluczem dubluje się, gdy ten sam cel zostanie otwarty jeszcze
    // raz.
    assert.deepEqual(
      restored.tabs.map((tab) => tab.label),
      ["Today", "Inbox", "Notes", "Organizations", "Tasks", "Capture history"],
    );
    assert.deepEqual(
      restored.tabs.map((tab) => tab.key),
      [
        "destination:today",
        "destination:inbox",
        "destination:notes",
        "destination:organizations",
        "destination:tasks",
        "destination:captures",
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
      ["today", "captures"],
    );
    assert.deepEqual(
      restored.tabs.map((tab) => tab.key),
      ["destination:today", "destination:captures"],
    );
    assert.equal(restored.activeKey, "destination:captures");
    assert.deepEqual(
      restored.history.map((entry) => entry.surface),
      ["captures"],
    );
  });

  // ROZDZIAŁ JEDNEGO CELU NA TRZY — sesja zapisana przez build 0.2.0 SPRZED
  // lotu D3, czyli w kształcie „jeden cel `library` plus pole `libraryReading`".
  //
  // TEN TEST MIERZY DWIE RZECZY NARAZ I OBIE ZAWIODŁY BY OSOBNO. Zakładka
  // Historii wrzutek musi wylądować na `captures`, a nie na `notes`, bo mapa
  // `retiredDesktopSurfaces` widzi wyłącznie identyfikator powierzchni i na
  // sam napis `library` umie odpowiedzieć tylko jedno. A `activeKey` musi
  // pójść ZA nią: napis `destination:library` rozwiązuje się przez tę samą
  // mapę na `destination:notes`, więc drugie, niezależne przeliczenie klucza
  // dałoby `activeKey`, który nie wskazuje ŻADNEJ z odtworzonych zakładek —
  // a to odrzuca CAŁĄ sesję, cicho, jak każda awaria z tej rodziny.
  it("splits one saved Library tab onto the reading it was left on", () => {
    const saved = JSON.stringify({
      version: 3,
      state: {
        tabs: [
          { key: "destination:today", label: "Today", surface: "today" },
          {
            key: "destination:library",
            label: "Library",
            surface: "library",
            libraryReading: "captures",
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
      ["today", "captures"],
      "a saved Capture history tab landed on Notes, which is where the retired-id map alone would have sent it",
    );
    assert.equal(
      restored.activeKey,
      "destination:captures",
      "the active key was recomputed from the saved string instead of following the tab, which drops the whole session",
    );
    assert.equal(
      restored.tabs[1]?.label,
      "Capture history",
      "the tab kept a label from before the split instead of taking the registry's",
    );
  });

  // TA SAMA SESJA BEZ POLA `libraryReading` — zapis zrobiony na Notatkach,
  // gdzie pole nigdy nie było ustawiane, bo Notatki były odczytem DOMYŚLNYM.
  // Bez tej pary poprzedni test przechodziłby też na implementacji, która
  // czyta wyłącznie pole i odrzuca zakładkę, gdy go nie ma.
  it("sends a saved Library tab with no reading to Notes", () => {
    const saved = JSON.stringify({
      version: 3,
      state: {
        tabs: [
          {
            key: "destination:library",
            label: "Library",
            surface: "library",
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
      ["notes"],
    );
    assert.equal(restored.activeKey, "destination:notes");
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

  // TEN TEST ZMIENIŁ PODMIOT, A NIE TYLKO LITERY. Nazywał się „reopens
  // a Library tab on the reading it was opened at" i asertował, że pole
  // `libraryReading` przeżywa zapis — bo wrzutka głosowa musiała poprosić
  // o odczyt Historii wrzutek WEWNĄTRZ jednego celu. Od lotu D3 prosi o cel,
  // więc pytanie „czy odczyt przeżył" nie ma już podmiotu; pytaniem jest, czy
  // przeżyła POWIERZCHNIA, i to jest ta sama gwarancja o klasę wyżej.
  //
  // Migrację starych zapisów NIOSĄCYCH to pole mierzą dwa testy wyżej.
  it("reopens a Capture history tab as Capture history, not as Notes", () => {
    const fallback = destinationContext("today", "Today");
    let state = createShellNavigation(fallback);
    state = openShellContext(
      state,
      destinationContext("captures", "Capture history"),
    );
    const restored = restoreShellNavigation(
      serializeShellNavigation(state),
      fallback,
    );
    assert.deepEqual(
      restored.tabs.map((tab) => tab.surface),
      ["today", "captures"],
    );
    assert.equal(restored.activeKey, "destination:captures");
  });

  // ZAPISANY WIDOK ZADAŃ — trzecie pole tej samej rodziny co kategoria
  // Ustawień i odczyt Biblioteki, i JEDYNE z trzech, które nie miało ani
  // jednego testu. Zmierzył to przegląd adwersarialny lotu L11: doszło pole na
  // SERIALIZOWANYM kontekście, gałąź w `isRestorableShellContext`, konstruktor
  // kontekstu, para propsów na ekranie i efekt — a w diffie lotu nie było ani
  // jednej nowej asercji. Kontrakt tego samego lotu żąda od wiersza, żeby
  // OTWIERAŁ to, co nazywa; ta połowa (przeżycie zapisu) jest tutaj, druga
  // (kliknięcie naprawdę otwiera widok) w `tasks-saved-view.interaction.test.tsx`.
  it("reopens Tasks on the saved view the row named, and keeps it on the destination tab", () => {
    const fallback = destinationContext("today", "Today");
    const deep = tasksSavedViewContext("view-segment-mssp");
    // TEN SAM KLUCZ CO ZWYKŁY CEL, i to jest treść, nie szczegół: Zadania są
    // JEDNYM celem o wielu widokach, więc otwarcie innego widoku podmienia tę
    // samą zakładkę zamiast robić drugą pod tym samym ekranem.
    assert.equal(deep.key, "destination:tasks");
    assert.equal(deep.label, "Tasks");

    let state = createShellNavigation(fallback);
    state = openShellContext(state, deep);
    const restored = restoreShellNavigation(
      serializeShellNavigation(state),
      fallback,
    );
    assert.deepEqual(
      restored.tabs.map((tab) => tab.savedViewId),
      [undefined, "view-segment-mssp"],
    );
    assert.equal(activeShellContext(restored).savedViewId, "view-segment-mssp");

    // DRUGI WIDOK PODMIENIA TEN SAM WPIS, nie dokłada zakładki — inaczej lewa
    // kolumna z trzema widokami produkowałaby trzy zakładki „Tasks", z których
    // żadna nie mówi, czym się różni od pozostałych.
    const switched = openShellContext(
      state,
      tasksSavedViewContext("view-renewals"),
    );
    assert.equal(switched.tabs.length, 2);
    assert.equal(activeShellContext(switched).savedViewId, "view-renewals");
  });

  it("refuses a saved view identifier that is not a string", () => {
    // KSZTAŁT, NIE SŁOWNIK: widoki nie mają zamkniętej listy, więc walidacja
    // sprawdza to jedno, co da się sprawdzić bez odczytu. Widok SKASOWANY
    // między sesjami jest legalny i otwiera „All work" — odrzucenie zapisu
    // byłoby wtedy utratą zakładki za coś, co nie jest błędem.
    const restored = restoreShellNavigation(
      JSON.stringify({
        version: 3,
        state: {
          tabs: [
            {
              key: "destination:tasks",
              label: "Tasks",
              surface: "tasks",
              savedViewId: 7,
            },
          ],
          activeKey: "destination:tasks",
          history: [
            { key: "destination:today", label: "Today", surface: "today" },
          ],
          historyIndex: 0,
        },
      }),
      destinationContext("today", "Today"),
    );
    assert.equal(activeShellContext(restored).surface, "today");
    assert.equal(restored.tabs.length, 1);
  });

  it("refuses a saved reading that is not one of the three", () => {
    // Napis spoza słownika odrzuca CAŁY zapis, tak samo jak nieznany cel.
    // POWÓD SIĘ ZMIENIŁ, A ZACHOWANIE NIE, i to jest warte jednego zdania:
    // do lotu D3 nierozpoznany odczyt trafiał do przełącznika, który nie
    // wyrenderowałby wtedy żadnego z trzech. Dziś jest to zapis, o którym
    // migracja nie umie powiedzieć, NA KTÓRY z trzech celów ma pójść —
    // a zgadywanie „Notatki" jest tu tym samym, czym zgadywanie celu.
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
    // jego chrome to tryb; `history` PRZEŻYWA jako `captures`, bo wycofanie
    // rozwiązuje się przed regułą chrome; `tasks` przechodzi nietknięte.
    assert.deepEqual(
      restoreFavoriteSurfaces(JSON.stringify(["settings", "history", "tasks"])),
      ["captures", "tasks"],
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
    // PARA SIĘ ZMIENIŁA, REGUŁA NIE. Stały tu `documents` i `history`, bo
    // schodziły się OBA na `library`; lot D3 rozdzielił Bibliotekę na trzy
    // cele, więc rozchodzą się teraz na `notes` i `captures` i nie mierzyłyby
    // już scalenia w ogóle. `access` i `activity` dalej schodzą się na
    // `settings` — ale Ustawień przypiąć się nie da (chrome to tryb), więc
    // parą, która mierzy SAMO SCALENIE, jest `library` razem z `documents`:
    // wycofany identyfikator i identyfikator wycofany PÓŹNIEJ, oba na
    // `notes`. Szyna z tą samą pozycją dwa razy to nie jest to, co ktoś
    // przypiął.
    assert.deepEqual(
      restoreFavoriteSurfaces(JSON.stringify(["documents", "library", "work"])),
      ["notes", "tasks"],
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

// DWA SŁOWNIKI TYCH SAMYCH TRZECH NAPISÓW — i to jest jedyne miejsce, które
// trzyma je razem. `libraryReadingLabel` niesie `h1` trzech ekranów wiedzy,
// rejestr powierzchni niesie etykietę pozycji nawigacji, granicy leniwego
// chunka i stanu ładowania. Duplikat NIE JEST do usunięcia i to jest pomiar,
// nie gust: `library-readings.ts` mieszka w leniwym katalogu Biblioteki,
// a import WARTOŚCI z rejestru w drugą stronę wciąga ten katalog na ścieżkę
// gorącą (powód i bajty stoją w nocie nad `libraryReadings` w
// `client/shell-navigation.ts`, a skutek — w `RealApp.tsx` przy
// `knowledgeSurfacePanel`). Skoro duplikatu nie da się skasować, musi go
// pilnować asercja: bez niej „Loading Sources…" nad ekranem, który po
// załadowaniu nazywa się inaczej, przechodzi cicho przez CAŁY `npm run check`
// (zmierzone przy przeglądzie lotu D3 podmianą wszystkich trzech napisów —
// 374/374 interakcji i 358 testów skryptów dalej zielone).
describe("the knowledge h1 and the navigation label are one sentence", () => {
  it("says the same word for every reading, and cannot miss a new one", () => {
    // TOTALNA NAD UNIĄ, nie nad trzema wpisanymi kluczami: czwarty odczyt
    // dopisany bez etykiety w rejestrze zatrzyma się tutaj, a nie u czytelnika.
    // Liczba stoi tu WYŁĄCZNIE przeciwko pętli po pustym zbiorze — pętla nad
    // zerem elementów jest nieodróżnialna od pętli, która wszystko sprawdziła.
    assert.equal(
      libraryReadings.length,
      3,
      "a knowledge reading was added or removed; the loop below must be seen to run",
    );
    for (const reading of libraryReadings)
      assert.equal(
        libraryReadingLabel[reading],
        desktopSurfaceLabel(reading),
        `the h1 of „${reading}" and its navigation label are two different words`,
      );
  });
});
