import {
  DEFAULT_COMMERCIAL_DEFAULTS,
  DEFAULT_WORKING_DAY,
} from "@constellation/contracts";
import {
  AttentionSignalIdSchema,
  CommentIdSchema,
  FieldDefinitionIdSchema,
  GrantIdSchema,
  PrincipalIdSchema,
  ProjectIdSchema,
  ProjectTemplateIdSchema,
  type MeetingLoopSurface,
  StrategicRecordIdSchema,
  TaskAssignmentIdSchema,
  SpaceIdSchema,
  TaskIdSchema,
  TaskStatusIdSchema,
  WorkspaceIdSchema,
  type QueryProjection,
} from "@constellation/contracts";
import type {
  RendererCommandResponse,
  RendererQueryResponse,
} from "@constellation/desktop-preload/client";

import { dateKeyInZone } from "../i18n.js";
import { RealApp } from "../RealApp.js";
import { createScenarioClient } from "../client/scenario-client.js";
import { crmRecords } from "./crm-fixture.js";
import { harnessTimeZone } from "./fixture-days.js";
import {
  libraryCaptures,
  libraryDocumentIds,
  libraryDocuments,
  libraryFolders,
  libraryNoteState,
  librarySources,
  librarySummaries,
} from "./library-fixture.js";

// Parsed rather than declared as strings, so the branded ids the projections
// ask for are branded HERE once instead of cast at forty use sites.
const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000001",
);
const spaceId = SpaceIdSchema.parse("00000000-0000-4000-8000-000000000002");
const statusId = TaskStatusIdSchema.parse(
  "00000000-0000-4000-8000-000000000003",
);
const ownerId = PrincipalIdSchema.parse("00000000-0000-4000-8000-000000000004");
const memberId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-000000000005",
);
// The agent is a PRINCIPAL like any other, and that is not a detail of naming:
// a comment is attributed to an agent by matching this id against the grants in
// `agent.access` (`record-actors.ts:93-111`), so the id has to be shared by the
// grant and by the comment or the panel quietly draws a person.
const agentPrincipalId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-0000000000f2",
);
const taskId = TaskIdSchema.parse("00000000-0000-4000-8000-000000000006");

// STREFA WORKSPACE'U JAKO STAŁA, A NIE JAKO POWTÓRZONY NAPIS. Dzień „dzisiaj"
// liczy się niżej DOKŁADNIE w tej strefie, którą `workspace.bootstrapContext`
// oddaje jako strefę workspace'u — bo `plannedForDay` porównuje `startAt`
// z kluczem dnia W TEJ strefie (`today-plan.ts:163-164`). Fikstura licząca
// dzień w innej strefie niż deklaruje, rysuje pusty plan przez kilka godzin na
// dobę i nikt nie umie powiedzieć dlaczego.
//
// STĄD IMPORT, A NIE DRUGI NAPIS: daty w fiksturach Library i CRM liczą się TĄ
// SAMĄ stałą (`fixture-days.ts`), a dwa napisy „Europe/Warsaw" obok siebie to
// dokładnie ten kształt, który w tym repozytorium rozjeżdża się bez żadnego
// przyrządu nad sobą. Deklaracja `timezone:` niżej i arytmetyka dnia w obu
// fiksturach są teraz JEDNĄ wartością.

// WYPROWADZONE Z ZEGARA, NIGDY WPISANE. Wpisana data w fiksturze położyła
// `main` tego repozytorium dwa razy — asercja przestaje mierzyć to, co mierzyła,
// nie dlatego, że ktoś zmienił kod, tylko dlatego, że minął dzień. Południe UTC
// leży tego samego dnia w Warszawie przy obu przesunięciach (+1 i +2), więc ten
// instant jest „dziś" bez rozróżniania czasu letniego.
const todayKey = dateKeyInZone(Date.now(), harnessTimeZone);
const plannedStartAt = `${todayKey}T12:00:00.000Z`;
const plannedByAt = `${todayKey}T06:00:00.000Z`;
// Jedno źródło tytułu zadania i identyfikatora projektu, bo od tego PR-a
// fikstura Library niesie ODWOŁANIA do obu i musi nazywać je tak samo, jak
// nazywają się w swoich własnych projekcjach — grupa `Record` z tytułem, który
// rozjechał się z rekordem, wygląda na przetestowaną i mierzy dwie różne rzeczy.
const taskTitle = "Potwierdź wariant recovery";
const libraryProjectId = ProjectIdSchema.parse(
  "00000000-0000-4000-8000-0000000000d1",
);
const rootCommentId = CommentIdSchema.parse(
  "00000000-0000-4000-8000-000000000007",
);

// Typed by the CONTRACT, not by `Record<string, unknown>`.
//
// It was the loose type, and a fixture is where that costs most: this harness
// described a task with no `attachments`, which the projection requires, and
// the rail's attachments section read `.length` off it and took the whole shell
// down the moment anybody clicked a task row. Nothing failed at compile time
// and no test noticed, because the only thing that renders this harness is a
// browser. A fixture that cannot be wrong about the shape is the only version
// of this worth keeping.
const result = (projection: QueryProjection): RendererQueryResponse =>
  ({
    kind: "query_result",
    result: {
      contractVersion: 1,
      queryId: "00000000-0000-4000-8000-000000000099",
      kernelTime: "2026-07-14T12:00:00.000Z",
      outcome: "success",
      freshness: {
        mode: "local_authoritative",
        checkpoint: null,
        missingCapabilities: [],
      },
      projection,
    },
  }) as unknown as RendererQueryResponse;

/* SPOTKANIA W HARNESSIE POWŁOKI — FIKSTURA, KTÓREJ TU NIE BYŁO.
 *
 * `?surface=collaboration` jest JEDYNYM adresem, po którym chodzi bramka
 * układu, a `getMeetingLoop` oddawał tu odmowę dostawcy z pustymi tablicami.
 * Ekran Spotkań rysował więc dwa puste stany i nic więcej — a para nad kartą
 * wyników wracałaby `NOT_MEASURED`, czyli jako awaria przyrządu nad poprawnym
 * kodem. To jest w tym repozytorium nazwana klasa defektu („pusta fikstura
 * chroni fałszywą asercję"), więc fikstura rośnie, a podłoga nie schodzi.
 *
 * DLACZEGO `offline` Z WIERSZAMI, A NIE `permission_required` Z PUSTYM
 * `upcoming`. Ta fikstura stała przez jeden przebieg na drugim wariancie,
 * a jego zapisany powód — „`available` wygasiłoby gałąź «Grant access»" —
 * BYŁ NIEPRAWDĄ, i to sprawdzalną w dwóch linijkach. Napis na tym przycisku
 * bierze się z `platform === "macos" && availability === "permission_required"`
 * (`MeetingsSurface.tsx:603-608`); ta fikstura deklarowała `platform: "other"`,
 * więc rysowała „Check again", a „Grant access" NIE POJAWIŁO SIĘ tu ani razu.
 * Koszt, którym uzasadniono odmowę pomiaru, nigdy nie był płacony.
 *
 * `permission_required` Z WIERSZAMI TO STAN, KTÓREGO NIE PRODUKUJE NIC.
 * Natywny czytnik macOS wydaje tę wartość WYŁĄCZNIE z `canRead: false`
 * (`desktop-main/native/macos-calendar/main.swift:128-136`), a bez odczytu nie
 * ma skąd wziąć wydarzeń. Dopisanie wierszy obok tej wartości byłoby fiksturą
 * udającą stan aplikacji, który nie istnieje — czyli zielenią nad zmyśleniem.
 *
 * `offline` JEST DOKŁADNIE TYM STANEM, KTÓREGO TU BRAKOWAŁO, i ma na to własne
 * zdanie w produkcie: „Calendar is offline. Showing the last safe data instead
 * of pretending it is current." Odczyt działa (`canRead: true`), zapis nie,
 * wydarzenia są ostatnie bezpieczne — a kontrolka uprawnienia STOI DALEJ, bo
 * `MeetingsSurface` rysuje ją przy każdym `availability !== "available"`. To
 * jest spełniony, wypisany wcześniej warunek wyjścia: „stan aplikacji, w którym
 * wiersze się rysują, a kontrolka uprawnienia wciąż stoi".
 *
 * CO TA ZAMIANA KOSZTUJE, POWIEDZIANE WPROST. Nadchodzące rysują ALBO stan
 * pusty, ALBO kartę z wierszami — to dwa ramiona jednego wyrażenia
 * (`MeetingsSurface.tsx:880`), a bramka chodzi po JEDNYM adresie
 * (`verify-renderer-layout.mjs:116`), więc jedna fikstura rysuje jedno ramię.
 * Wybrane jest ramię z wierszami, bo daje CZTERY podmioty (farba karty, farba
 * wpuszczonego wiersza, jego trzy ścieżki, szerokość akcji) przeciwko JEDNEMU
 * (przezroczystość stanu pustego). Ten jeden stoi wypisany w
 * `VISUAL_LANGUAGE_ROUTED_NOT_COVERED` z prawdziwym mechanizmem i prawdziwym
 * warunkiem wyjścia. `completed` zostaje NIEPUSTE — wymiana ramion po tamtej
 * stronie kosztowałaby dwie pary zamiast jednej.
 *
 * CZAS WYPROWADZONY Z ZEGARA, NIGDY WPISANY. Wpisana data położyła `main`
 * tego repozytorium dwa razy, bez zmiany w kodzie. Dotyczy to tak samo
 * wydarzenia w PRZYSZŁOŚCI: `hoursAhead` liczy od tego samego `now`.
 */
const meetingLoopFixture = (): MeetingLoopSurface => {
  const now = Date.now();
  const daysAgo = (days: number, hour: number) => {
    const at = new Date(now - days * 86_400_000);
    at.setHours(hour, 0, 0, 0);
    return at.toISOString();
  };
  const hoursAhead = (hours: number) =>
    new Date(now + hours * 3_600_000).toISOString();
  const meeting = (
    index: number,
    title: string,
    days: number,
    summaryMarkdown: string,
  ) => ({
    id: `00000000-0000-4000-8000-00000000031${index}`,
    workspaceId,
    spaceId,
    connectionId: "jamie-workspace",
    externalMeetingId: `meeting-collaboration-${index}`,
    title,
    startedAt: daysAgo(days, 9),
    endedAt: daysAgo(days, 10),
    summaryMarkdown,
    participants: [],
    workItems: [],
    contentHash: String(index).repeat(64),
    triage: "ready" as const,
    missingComponents: [],
    version: 1,
    updatedAt: daysAgo(days, 11),
  });
  return {
    capability: {
      platform: "macos",
      provider: "eventkit",
      availability: "offline",
      canRead: true,
      canWriteOwnedBlocks: false,
      detailCode: "scenario_offline",
    },
    // JEDEN WIERSZ, NIE DWA. Drugi nie kupuje ANI JEDNEJ pary więcej — każdy
    // podmiot tej sekcji jest czytany selektorem klasy albo liczony na jeden —
    // a kosztowałby bajty w paczce, którą i tak trzeba trzymać uczciwie.
    // `canWriteOwnedBlocks: false` jest tu wybrane, a nie odziedziczone: rysuje
    // CZWARTE dziecko siatki wiersza (`.meeting-block-unavailable`), czyli
    // jedyny stan, w którym widać, czy zostało ono w niej posadzone.
    upcoming: [
      {
        event: {
          provider: "fixture" as const,
          calendarExternalId: "Praca",
          eventExternalId: "event-collaboration-prep",
          revision: "rev-1",
          title: "Przegląd wdrożenia z zespołem klienta",
          startsAt: hoursAhead(20),
          endsAt: hoursAhead(21),
          isAllDay: false,
          location: "Google Meet",
          attendees: [
            {
              name: "Kacper",
              email: "kacper@example.com",
              organizer: true,
              response: "accepted" as const,
            },
            {
              name: "Alex",
              email: "alex@example.com",
              organizer: false,
              response: "accepted" as const,
            },
          ],
        },
        brief: {
          eventExternalId: "event-collaboration-prep",
          deterministic: true as const,
          generatedAt: new Date(now).toISOString(),
          orientation: [
            {
              kind: "project" as const,
              recordId: "00000000-0000-4000-8000-000000000320",
              spaceId,
              label: "Wdrożenie Northstar",
              fact: "Pilot wchodzi w przegląd wydania",
              updatedAt: daysAgo(1, 9),
            },
          ],
          openLoops: [
            {
              kind: "waiting" as const,
              recordId: "00000000-0000-4000-8000-000000000321",
              spaceId,
              label: "Potwierdzenie właściciela wdrożenia",
              fact: "Czeka na bezpieczeństwo",
              updatedAt: daysAgo(2, 9),
            },
          ],
          relevantSources: [],
        },
      },
    ],
    completed: [
      meeting(
        1,
        "Decyzja o pilocie",
        2,
        "## Wynik\n\n- **Pilot pozostaje za flagą** do czasu potwierdzenia recovery.",
      ),
      meeting(
        2,
        "Tygodniowy przegląd wdrożenia i otwartych decyzji",
        4,
        "## Najważniejsze ustalenia\n\n1. Zespół zamyka etap przygotowania.\n2. Następny przegląd obejmie **ryzyko i termin**.",
      ),
    ],
    // ZGODNE Z DEKLAROWANĄ ZDOLNOŚCIĄ, nie wpisane obok niej. `"partial"` przy
    // kalendarzu, który sam o sobie mówi „offline", byłoby tą samą
    // niespójnością, którą ta fikstura właśnie przestała nieść.
    freshness: "offline",
    generatedAt: new Date(now).toISOString(),
  };
};

const client = createScenarioClient({
  documentState: (documentId) =>
    documentId === libraryDocumentIds.runbook
      ? libraryNoteState(taskId)
      : undefined,
  meetingLoop: meetingLoopFixture(),
  executeCommand: (command): RendererCommandResponse => {
    if (
      command.commandName !== "attention.markRead" &&
      command.commandName !== "attention.dismiss"
    ) {
      return {
        kind: "contract_rejected",
        diagnosticCode: "contract.invalid",
        issues: [{ path: "", code: "custom" }],
      };
    }
    const diagnosticCode =
      command.commandName === "attention.markRead"
        ? "attention.read"
        : "attention.dismissed";
    return {
      kind: "command_outcome",
      outcome: {
        contractVersion: 1,
        commandId: command.commandId,
        correlationId: command.correlationId,
        kernelTime: "2026-07-14T12:00:00.000Z",
        outcome: "success",
        diagnosticCode,
        affected: [],
        auditReceiptId: "00000000-0000-4000-8000-000000000015",
        projection: {
          kind: diagnosticCode,
          attentionSignalId: command.payload.attentionSignalId,
          version: 2,
        },
      },
    } as unknown as RendererCommandResponse;
  },
  queries: {
    "workspace.bootstrapContext": result({
      kind: "workspace.bootstrapContext",
      workspace: {
        id: workspaceId,
        name: "Praca",
        timezone: harnessTimeZone,
        defaultTaskStatusId: statusId,
        voiceAudioRetentionPolicy: "delete_after_transcript",
        // Projekcja NIGDY nie oddaje tego pola puste — harness, który je
        // pomija, opisuje świat, którego nie ma, i wywala powłokę na starcie.
        workingDay: DEFAULT_WORKING_DAY,
        commercialDefaults: DEFAULT_COMMERCIAL_DEFAULTS,
        version: 4,
      },
      spaces: [{ id: spaceId, name: "Praca", version: 1 }],
      taskStatuses: [
        {
          id: statusId,
          label: "W toku",
          operationalSemantics: "actionable",
          position: 0,
          version: 1,
        },
      ],
      fieldDefinitions: [
        {
          id: FieldDefinitionIdSchema.parse(
            "00000000-0000-4000-8000-0000000000e1",
          ),
          targetKind: "task",
          label: "Segment",
          type: { kind: "choice", options: ["MSSP", "Enterprise"] },
          position: 0,
          version: 1,
        },
      ],
      // DWA SZABLONY, NIE JEDEN, I TO JEST WYMÓG POMIARU (lot D11). Panel
      // dymka „Apply template" to LISTA przycisków; przy jednym szablonie
      // bramka mierzyłaby listę, która nie ma jeszcze geometrii listy —
      // odstępu między pozycjami, chodzenia strzałkami, sufitu szerokości nad
      // dwiema różnej długości nazwami. Drugi wpis kosztuje zero wysłanych
      // bajtów (`import.meta.env.DEV`) i jest jedyną drogą do stanu, w którym
      // to, co lot oddał, w ogóle się rysuje.
      projectTemplates: [
        {
          id: ProjectTemplateIdSchema.parse(
            "00000000-0000-4000-8000-0000000000c1",
          ),
          name: "Wdrożenie klienta",
          taskTitles: ["Kickoff", "Plan wdrożenia", "Retro"],
          fieldIds: [],
          position: 0,
          version: 1,
        },
        {
          id: ProjectTemplateIdSchema.parse(
            "00000000-0000-4000-8000-0000000000c2",
          ),
          name: "Odnowienie umowy wsparcia",
          taskTitles: ["Zebranie warunków", "Wycena", "Podpis"],
          fieldIds: [],
          position: 1,
          version: 1,
        },
      ],
    }),
    "task.list": result({
      kind: "task.list",
      items: [
        {
          id: taskId,
          spaceId,
          title: taskTitle,
          status: {
            id: statusId,
            label: "W toku",
            operationalSemantics: "actionable",
          },
          completionState: "open",
          // ── DWA POLA, KTÓRE DAJĄ PLAKIETCE AUTORSTWA STAN DO NARYSOWANIA ──
          // Wpis #6 był oddany w kodzie od lotu D2 i NIEMIERZALNY, bo ta
          // fikstura nie rysowała ANI JEDNEGO `[data-planned-row]` — ekran stał
          // na „Nothing is planned for today", więc warunek plakietki
          // (`TodaySurface.tsx:193-199`: którykolwiek dzisiejszy wiersz planu
          // z `plannedBy.principalKind === "agent"`) nie miał jak być spełniony.
          // To nie było „za trudne do zmierzenia", tylko „nie ma czego mierzyć",
          // a rozwiązaniem jest fikstura, nie niższy próg.
          //
          // `calendarBlock` ŚWIADOMIE NIE JEST DOKŁADANY. Wiersz rysuje wtedy
          // „No time" klasą `.loose`, a `dayCapacity.reservedMinutes` zostaje
          // zerem (`today-plan.ts:133-137` czyta wyłącznie `calendarBlock`) —
          // czyli plakietka dostaje stan bez przestawiania drugiej liczby na
          // tym samym ekranie.
          startAt: plannedStartAt,
          // Ten sam `agentPrincipalId`, którym stoi grant „Orbit Runner"
          // w `agent.access` niżej: `principalName` rozwiązuje imię właśnie po
          // grancie (`TodaySurface.tsx:62-68`), więc inny identyfikator dałby
          // ogólne „An agent" i plakietka mierzyłaby gałąź zapasową zamiast
          // właściwej.
          plannedBy: {
            principalId: agentPrincipalId,
            principalKind: "agent" as const,
            at: plannedByAt,
          },
          // THE WRITTEN CONTEXT, and the only projection that carries it. The
          // record screen reads `description` off THIS capped list
          // (`TaskRecordScreen.tsx:387` — `snapshot.tasks.find(...)`), never off
          // `work.overview`, and it draws `.prose` only when the string is
          // non-empty (`:653-667`). While this field was absent the screen drew
          // the "No context saved yet" note instead, so the reading measure of
          // the whole record family — the one thing lot 4 #12 is about — was
          // never on the page for anything to measure.
          //
          // Several paragraphs, split by a blank line, because `paragraphsOf`
          // splits on exactly that: a one-sentence description exercises
          // neither the `gap` between paragraphs nor the `pre-wrap` rule that
          // keeps an author's own single newlines.
          description:
            "The packaged build recovers a half-written capture on the next start, and we have never watched it do that from a cold machine — only from a session that still had the renderer warm.\n\nWhat needs confirming is the order: the recovery banner has to appear BEFORE the workspace finishes opening, otherwise the reader answers a question about a capture they cannot yet see. Ada saw the opposite order once on Windows and we have no recording of it.\n\nIf the order is wrong the fix is not in the banner, it is in when the startup notice is allowed to resolve.",
          nextAction:
            "Reproduce from a cold start on Windows and record the order the two notices appear in.",
          assignment: {
            id: TaskAssignmentIdSchema.parse(
              "00000000-0000-4000-8000-000000000008",
            ),
            // Flat, because that is what the projection carries. The nested
            // `assignee` object this used to hold was the shape of an older
            // contract, and an untyped fixture kept it alive long after the
            // projection stopped answering that way.
            assigneePrincipalId: memberId,
            displayName: "Ada Nowak",
            availability: "active",
            version: 1,
          },
          // Required, and its absence is what the loose type cost: the rail's
          // attachments section reads `.length` off this, so clicking any task
          // row in this harness took the whole shell down with a TypeError.
          attachments: [],
          createdAt: "2026-07-14T09:30:00.000Z",
          updatedAt: "2026-07-14T10:51:00.000Z",
          version: 2,
        },
      ],
      nextCursor: null,
    }),
    // `startAt` NIE JEST TU POWTÓRZONY, i jest to wybór, nie przeoczenie. Ta
    // sama praca jest w tej fiksturze ZAPLANOWANA w `task.list` (co daje ekranowi
    // Dziś wiersz planu i plakietkę autorstwa) i NIEZAPLANOWANA w `work.overview`,
    // bo `planStateOf` czyta wyłącznie `startAt` (`tasks/task-view.ts:246-251`):
    // dopisanie go tutaj przestawiłoby znacznik na ekranie Zadań z „unplanned"
    // na „planned", wpis rejestru `tasks|span._plan._plan_unplanned`
    // (`descendant-overflow.mjs:96-103`) przestałby się dopasowywać, a
    // `unusedRegistryEntries` robi z niedopasowanego wpisu BŁĄD, nie ciszę.
    // Czyli: zaspokojenie jednej pary skasowałoby pomiar drugiej. Dwie projekcje
    // mówią tu o tym samym zadaniu dwie różne rzeczy — świadomie.
    //
    // CO TA ŚWIADOMOŚĆ KOSZTUJE, dopisane po przeglądzie fali, bo sam powód nie
    // jest jeszcze zapisem długu. Ta fikstura modeluje dziś workspace, którego
    // produkt nie umie wytworzyć: jedno zadanie zaplanowane w jednej projekcji
    // i niezaplanowane w drugiej. Póki tak stoi, REGRESJA, w której planowanie
    // dociera do jednej projekcji, a do drugiej nie, jest tutaj NIEOBSERWOWALNA
    // — obie bramki widzą dokładnie ten stan i uznają go za poprawny.
    // WYJŚCIE, i jest tanie: zasiać DRUGIE zadanie, żeby jedno było zaplanowane
    // w OBU projekcjach, a drugie niezaplanowane w OBU. To zaspokaja plakietkę
    // autorstwa, próg `todayPlannedRows` i wpis rejestru
    // `tasks|span._plan._plan_unplanned` naraz, bez rekordu sprzecznego ze sobą.
    // Nie robione w tym przeglądzie, bo drugie zadanie przestawia liczniki
    // wierszy na dwóch ekranach, a ten przegląd naprawia przyrządy, nie fikstury.
    "work.overview": result({
      kind: "work.overview",
      tasks: [
        {
          id: taskId,
          title: taskTitle,
          statusId,
          // NOT "actionable", and the difference is a whole element. The record
          // says the operational state out loud only when it is NOT the default
          // (`TaskRecordScreen.tsx:508`) — an "actionable" task draws no
          // `.why` span at all. A harness whose only task was actionable
          // therefore held a screen on which lot 4 #2's subject did not exist,
          // and the pair reading it was unfalsifiable rather than pending.
          operationalState: "waiting",
          waitingOn: {
            kind: "person",
            label: "Ada Nowak · Windows reproduction",
          },
          completionState: "open",
          fields: {
            "00000000-0000-4000-8000-0000000000e1": {
              kind: "choice",
              value: "MSSP",
            },
          },
          // WYMAGANE od B2, nie opcjonalne: bez tego cały odczyt
          // `work.overview` nie przechodzi strict-parse i płaszczyzna pracy
          // czyta się jako niedostępna — a harness wygląda wtedy dokładnie
          // tak, jakby ekran był zepsuty.
          projectIds: [],
          version: 3,
          updatedAt: "2026-07-14T11:30:00.000Z",
        },
      ],
      projects: [],
      areas: [],
      initiatives: [],
      // ONE DEPENDENCY EDGE, AND IT IS THE WHOLE SEED LOT 4 NEEDED. The task
      // record's `.list` — the subject of lot 4 #10 — is mounted only inside a
      // non-empty branch (`TaskRecordScreen.tsx`: subtasks, then dependencies);
      // with no parent, no children and no links, the screen drew a `<p>` in
      // both places and the container the position is about did not exist on
      // any page any gate could open. `task-record.module.css` recorded that
      // gap in prose ("zero `[data-record-row]`") and it stayed a gap.
      //
      // The target is deliberately a task that is NOT in this projection, and
      // that is the cheaper of the two seeds rather than a shortcut: it draws
      // the real degraded row ("A task outside this Space's work",
      // `TaskRecordScreen.tsx`), which carries `data-record-row` exactly like
      // the ordinary one, WITHOUT adding a second task to `work.overview` —
      // which would also add a row to the Tasks collection and change a screen
      // this lot never looked at.
      links: [
        {
          id: StrategicRecordIdSchema.parse(
            "00000000-0000-4000-8000-0000000000f6",
          ),
          linkType: "task_depends_on_task" as const,
          sourceRecordId: taskId,
          targetRecordId: "00000000-0000-4000-8000-0000000000f7",
          state: "active" as const,
          version: 1,
        },
      ],
      savedViews: [
        {
          id: StrategicRecordIdSchema.parse(
            "00000000-0000-4000-8000-0000000000e2",
          ),
          name: "Segment MSSP",
          filters: {
            fields: [
              {
                fieldId: FieldDefinitionIdSchema.parse(
                  "00000000-0000-4000-8000-0000000000e1",
                ),
                predicate: { kind: "choice_is", option: "MSSP" },
              },
            ],
          },
          sort: "updated_desc",
          groupBy: "status",
          state: "active",
          version: 1,
        },
      ],
      freshness: {
        mode: "local_authoritative",
        checkpoint: null,
        missingCapabilities: [],
      },
    }),
    "project.list": result({
      kind: "project.list",
      items: [
        {
          id: libraryProjectId,
          spaceId,
          title: "Orbit onboarding",
          intendedOutcome: "Klient pracuje samodzielnie w Constellation",
          needsReview: false,
          lifecycle: "active",
          relatedOpenTaskCount: 0,
          version: 2,
          updatedAt: "2026-07-14T11:00:00.000Z",
        },
      ],
    }),
    "project.operationalOverview": result({
      kind: "project.operationalOverview",
      project: {
        id: libraryProjectId,
        spaceId,
        title: "Orbit onboarding",
        intendedOutcome: "Klient pracuje samodzielnie w Constellation",
        needsReview: false,
        lifecycle: "active",
        version: 2,
        updatedAt: "2026-07-14T11:00:00.000Z",
      },
      relatedTasks: [],
      relatedMeetings: [],
      // Notatka PRZYPIĘTA DO PROJEKTU, obok luźnych na liście Library. Dziś to
      // jedyne miejsce, w którym ten fakt w ogóle da się pokazać: żadna
      // projekcja czytana przez Library nie niesie przypisania do Projektu.
      relatedDocuments: [
        {
          id: libraryDocumentIds.handover,
          title: "Orbit — dokumentacja powdrożeniowa dla zespołu utrzymania",
          role: "deliverable" as const,
          version: 7,
          updatedAt: "2026-07-31T11:05:00.000Z",
        },
      ],
      // ONE EXIT, and it is not decoration. `ProjectRecordOverview.tsx:570`
      // leaves the whole Decisions section out when the collection is empty,
      // and the Client section is not a way in either — it lists
      // `clients.slice(1)`, so a single client draws ZERO rows by design. With
      // all four collections empty this rail drew nothing but the version line,
      // and `.railRow` — the subject of lot 4 #7 — did not exist on the page at
      // all. `superseded` rather than `current` because that is the only state
      // the row says out loud (`:580`), so the `meta` span draws too instead of
      // being a branch nothing on this fixture reaches.
      relatedDecisions: [
        {
          id: StrategicRecordIdSchema.parse(
            "00000000-0000-4000-8000-0000000000f1",
          ),
          title: "Migrujemy notatki klienta z Obsidiana, nie z Confluence",
          state: "superseded" as const,
          version: 3,
          updatedAt: "2026-07-28T09:20:00.000Z",
        },
      ],
      clientOrganizations: [],
      evidenceSources: [],
    }),
    "document.linkCandidates": result({
      kind: "document.linkCandidates",
      items: [
        {
          targetKind: "task",
          targetId: taskId,
          label: taskTitle,
        },
      ],
    }),
    // Historia przechwyceń oddawała `items: []`, więc Library mierzyła się
    // pusta. Szczegóły i granica użycia tej fikstury: `library-fixture.ts`.
    "capture.history": result({
      kind: "capture.history",
      items: libraryCaptures(spaceId, {
        taskId,
        principalId: ownerId,
      }),
      nextCursor: null,
    }),
    "document.list": result({
      kind: "document.list",
      items: libraryDocuments(spaceId),
    }),
    "knowledge.list": result({
      kind: "knowledge.list",
      spaceId,
      folders: libraryFolders(),
      sources: librarySources(),
      documents: librarySummaries({
        task: { id: taskId, label: taskTitle },
        project: { id: libraryProjectId, label: "Orbit onboarding" },
      }),
    }),
    "task.assignmentCandidates": result({
      kind: "task.assignmentCandidates",
      spaceId,
      candidates: [
        {
          principalId: memberId,
          displayName: "Ada Nowak",
          participantKind: "member",
        },
      ],
    }),
    "workspace.access": result({
      kind: "workspace.access",
      policyVersion: 4,
      currentPrincipalId: ownerId,
      canManage: true,
      members: [
        {
          membershipId: "00000000-0000-4000-8000-000000000010",
          principalId: ownerId,
          displayName: "Kacper",
          role: "owner",
          status: "active",
          version: 1,
          spaces: [],
        },
        {
          membershipId: "00000000-0000-4000-8000-000000000011",
          principalId: memberId,
          displayName: "Ada Nowak",
          role: "member",
          status: "active",
          version: 1,
          spaces: [
            {
              spaceGrantId: "00000000-0000-4000-8000-000000000012",
              spaceId,
              spaceName: "Praca",
              access: "comment",
              status: "active",
              version: 1,
            },
          ],
        },
      ],
    }),
    // WITHOUT THIS QUERY THERE ARE NO AGENTS IN THIS WORKSPACE, and the shell
    // says so silently: `buildActorResolver` reads its map out of
    // `agentAccess.grants`, and an unavailable slice makes that map empty, so
    // every comment resolves to a person. The whole agent treatment on a record
    // — the spark, the accent mark, the "agent · preset" line — hangs off this
    // one read.
    "agent.access": result({
      kind: "agent.access",
      policyVersion: 4,
      workspaceVersion: 4,
      canManage: true,
      grants: [
        {
          grantId: GrantIdSchema.parse("00000000-0000-4000-8000-0000000000f3"),
          agentPrincipalId,
          displayName: "Orbit Runner",
          // A REAL preset value, because the panel prints it beside the name
          // (`RecordCommentsPanel.tsx:177` — "agent · propose"). An invented
          // string would fail the strict parse and take the slice, not just
          // the word, off the screen.
          preset: "propose",
          capabilityScope: [
            "task.comment",
            "task.update",
            "document.structuredRead",
          ],
          scopeStatus: "current",
          missingFromPreset: [],
          status: "active",
          credentialVersion: 1,
          version: 2,
          membershipId: "00000000-0000-4000-8000-0000000000f4",
          membershipVersion: 1,
          spaces: [
            {
              spaceId,
              spaceName: "Praca",
              spaceGrantId: "00000000-0000-4000-8000-0000000000f5",
              access: "comment",
              version: 1,
            },
          ],
          lastUsedAt: "2026-07-14T10:51:00.000Z",
        },
      ],
    }),
    "comment.mentionCandidates": result({
      kind: "comment.mentionCandidates",
      spaceId,
      candidates: [
        {
          principalId: ownerId,
          displayName: "Kacper",
          participantKind: "member",
        },
        {
          principalId: memberId,
          displayName: "Ada Nowak",
          participantKind: "member",
        },
      ],
    }),
    "comment.list": result({
      kind: "comment.list",
      target: { kind: "task", taskId },
      threads: [
        {
          id: rootCommentId,
          rootCommentId,
          body: "@Kacper potwierdź wariant recovery przed zamknięciem zadania.",
          attachments: [],
          author: { principalId: memberId, displayName: "Ada Nowak" },
          mentionPrincipalIds: [ownerId],
          threadState: "open",
          version: 2,
          createdAt: "2026-07-14T10:42:00.000Z",
          updatedAt: "2026-07-14T10:45:00.000Z",
          edited: true,
        },
        // WRITTEN BY THE AGENT, and that is the whole point of this entry.
        // `buildActorResolver` (`record-actors.ts:93-111`) calls a comment an
        // agent's ONLY when its author principal is the `agentPrincipalId` of a
        // grant in `agent.access` — the author's display name is never
        // consulted. Until this harness answered that query, every comment in
        // it resolved to a person, `.entryAgent` and `.markAgent` were declared
        // in the sheet and drawn by nobody, and the two pairs reading them
        // measured nothing while looking exactly like pairs that were waiting
        // for a lot.
        //
        // The reply was flipped rather than a third thread added: one human
        // root plus one agent reply is the shape the panel is built around, and
        // the alternative changes the height of a panel that three geometry
        // registries are pinned to.
        {
          id: CommentIdSchema.parse("00000000-0000-4000-8000-000000000013"),
          parentCommentId: rootCommentId,
          rootCommentId,
          body: "Pakietowy dowód macOS i Windows jest dołączony — obie ścieżki odzyskania przeszły, log jest w załączniku do zadania.",
          attachments: [],
          author: {
            principalId: agentPrincipalId,
            displayName: "Orbit Runner",
          },
          mentionPrincipalIds: [],
          threadState: "open",
          version: 1,
          createdAt: "2026-07-14T10:51:00.000Z",
          updatedAt: "2026-07-14T10:51:00.000Z",
          edited: false,
        },
      ],
    }),
    // CZTERY EKRANY CRM CZYTAJĄ TĘ JEDNĄ PROJEKCJĘ, i do fali E nie było jej
    // tutaj wcale. `optionalProjection` połykał odmowę, Lejek, Odnowienia,
    // Relacje i Ludzie rysowały „this view's data is unavailable right now",
    // a bramka układu przechodziła na zielono nad czterema ekranami, których
    // nigdy nie zobaczyła. Materiał i powód jego kształtu: `crm-fixture.ts`.
    "relationship.workspace": result({
      kind: "relationship.workspace",
      records: crmRecords(workspaceId, spaceId),
      freshness: {
        mode: "local_authoritative",
        checkpoint: null,
        missingCapabilities: [],
      },
    }),
    "attention.inbox": result({
      kind: "attention.inbox",
      unreadCount: 1,
      items: [
        {
          id: AttentionSignalIdSchema.parse(
            "00000000-0000-4000-8000-000000000014",
          ),
          reason: "comment_mention",
          destination: { kind: "task", taskId },
          title: taskTitle,
          detail: "You were mentioned in a comment.",
          urgency: "in_app",
          state: "unread",
          version: 1,
          occurredAt: "2026-07-14T10:42:00.000Z",
        },
      ],
    }),
  },
});

export const CollaborationHarness = () => <RealApp client={client} />;
