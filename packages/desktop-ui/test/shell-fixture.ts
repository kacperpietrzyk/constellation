/// <reference types="node" />

import {
  DEFAULT_WORKING_DAY,
  PrincipalIdSchema,
  ProjectIdSchema,
  QueryIdSchema,
  SpaceIdSchema,
  StrategicRecordIdSchema,
  TaskIdSchema,
  TaskStatusIdSchema,
  WorkspaceIdSchema,
  type QueryProjection,
} from "@constellation/contracts";
import type { RendererQueryResponse } from "@constellation/desktop-preload/client";

// Jeden kształt zaślepionego workspace'u dla OBU zestawów, które montują
// powłokę: `surface-registry-render` (node:test, renderToStaticMarkup) i
// `shell-navigation.interaction` (Vitest, happy-dom). Dwie kopie tego samego
// fixture'u rozjechałyby się przy pierwszej zmianie kontraktu, a wtedy jeden
// z zestawów świeciłby na zielono na kształcie, którego już nie ma —
// to ta sama rodzina co `restated-shape-drift`.

export const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000001",
);
export const spaceId = SpaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000002",
);
export const statusId = TaskStatusIdSchema.parse(
  "00000000-0000-4000-8000-000000000003",
);
export const queryId = QueryIdSchema.parse(
  "00000000-0000-4000-8000-000000000004",
);

export const projectionResponse = (projection: object): RendererQueryResponse =>
  ({
    kind: "query_result",
    result: {
      contractVersion: 1,
      queryId,
      kernelTime: "2026-07-13T12:00:00.000Z",
      outcome: "success",
      projection,
      freshness: {
        mode: "local_authoritative",
        checkpoint: null,
        missingCapabilities: [],
      },
    },
  }) as RendererQueryResponse;

// Tylko trzy projekcje są wymagane do otwarcia snapshotu; reszta degraduje się
// do stanu „dane niedostępne" i każda powierzchnia musi mimo to coś
// wyrenderować. Ten wariant jest celowo najuboższy z możliwych — jeśli
// destynacja umie narysować się tylko przy pełnych danych, to jest defekt
// powierzchni, nie testu.
// Otypowany kontraktem, mimo że jest to wariant ubogi: nieotypowany literał
// przeszedł przez rzutowanie w `projectionResponse` bez `workingDay`, a ekran
// dnia dostał `undefined` tam, gdzie projekcja NIGDY nie daje `undefined` —
// czyli fixture opisywał świat, który nie istnieje. Typ łapie to przy buildzie.
const emptyBootstrap: Projection<"workspace.bootstrapContext"> = {
  kind: "workspace.bootstrapContext",
  workspace: {
    id: workspaceId,
    name: "Workspace",
    timezone: "Europe/Warsaw",
    defaultTaskStatusId: statusId,
    voiceAudioRetentionPolicy: "delete_after_transcript",
    workingDay: DEFAULT_WORKING_DAY,
    version: 1,
  },
  spaces: [{ id: spaceId, name: "Space", version: 1 }],
  taskStatuses: [
    {
      id: statusId,
      label: "status",
      operationalSemantics: "actionable",
      position: 0,
      version: 1,
    },
  ],
};

export const shellQueries = {
  "workspace.bootstrapContext": projectionResponse(emptyBootstrap),
  "task.list": projectionResponse({
    kind: "task.list",
    items: [],
    nextCursor: null,
  }),
  "capture.history": projectionResponse({
    kind: "capture.history",
    items: [],
    nextCursor: null,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// DRUGI wariant: workspace, w którym COŚ JEST.
//
// `shellQueries` wyżej dowodzi, że każda destynacja rysuje się przy zerze
// danych, i to zostaje bez zmian. Nie da się nim jednak dowieść niczego o
// ekranie, który ma rekordy: pusty ekran przechodzi każdą asercję o układzie,
// bo nie ma czego układać. Stąd ten zestaw — ten sam kontrakt, dane w środku.
//
// Kształty są WYPROWADZONE z `QueryProjectionSchema`
// (`packages/contracts/src/query.ts`), a nie zgadnięte, i każdy jest tu
// otypowany przez `Projection<…>`. To jedyny strażnik, jaki tu działa:
// `queryProjection` w `src/client/workflow.ts:151-166` sprawdza WYŁĄCZNIE
// `projection.kind` i rzutuje resztę, więc pole o złym kształcie przeszłoby
// do renderera bez słowa. Typ łapie to przy `npm run build`.
type Projection<Kind extends QueryProjection["kind"]> = Extract<
  QueryProjection,
  { kind: Kind }
>;

export const principalId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-000000000010",
);
export const inProgressStatusId = TaskStatusIdSchema.parse(
  "00000000-0000-4000-8000-000000000011",
);
export const waitingStatusId = TaskStatusIdSchema.parse(
  "00000000-0000-4000-8000-000000000012",
);
/** Principal agenta — plan położony przez asystenta, nie przez człowieka. */
export const agentPrincipalId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-000000000013",
);

/** Organizacja, na którą WSKAZUJĄ inne rekordy — kandydat na „nie da się usunąć". */
export const referencedOrganizationId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-000000000020",
);
/** Organizacja, na którą nie wskazuje NIC — kandydat na „usuwalna od razu". */
export const unreferencedOrganizationId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-000000000021",
);
export const personRecordId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-000000000022",
);
export const opportunityRecordId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-000000000023",
);
export const initiativeRecordId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-000000000024",
);

export const projectId = ProjectIdSchema.parse(
  "00000000-0000-4000-8000-000000000030",
);
export const draftProjectId = ProjectIdSchema.parse(
  "00000000-0000-4000-8000-000000000031",
);

export const longTaskId = TaskIdSchema.parse(
  "00000000-0000-4000-8000-000000000040",
);
export const waitingTaskId = TaskIdSchema.parse(
  "00000000-0000-4000-8000-000000000041",
);
export const doneTaskId = TaskIdSchema.parse(
  "00000000-0000-4000-8000-000000000042",
);
export const agentPlannedTaskId = TaskIdSchema.parse(
  "00000000-0000-4000-8000-000000000043",
);
export const unplannedDeadlineTaskId = TaskIdSchema.parse(
  "00000000-0000-4000-8000-000000000044",
);
/** Dzień, na który wskazuje `startAt` w tym fixture — punkt odniesienia testów. */
export const populatedPlanDayKey = "2026-08-03";

// Realny `intendedOutcome` w tym workspace ma 1400-3000 znaków i kilka akapitów.
// Fixture z jednozdaniowym polem już raz ukrył całą klasę defektów układu
// (obcinanie, wysokość wiersza, zawijanie), więc tu stoi pełna długość.
export const longIntendedOutcome = `Do końca trzeciego kwartału Northstar ma mieć jeden, uzgodniony obraz tego, co się u nich dzieje z bezpieczeństwem informacji — taki, pod którym podpisze się zarówno zespół techniczny, jak i sponsor po stronie biznesu. Dzisiaj każdy z tych dwóch światów opowiada inną historię: technicy mówią o zaległościach w łatkach i o dwóch systemach, które nikt nie wie kto utrzymuje, a sponsor mówi o audycie, który przechodzi bez zastrzeżeń. Obie wersje są prawdziwe i obie są niepełne, a decyzje zapadają na przemian raz na jednej, raz na drugiej.

Efektem końcowym nie jest raport. Efektem jest lista dwunastu do piętnastu pozycji, z których każda ma nazwanego właściciela po stronie klienta, wskazany dowód (log, zrzut konfiguracji, zapis ze spotkania) i datę, po której pozycja przestaje być aktualna i wymaga ponownego potwierdzenia. Pozycja bez właściciela nie wchodzi na listę — wolimy mieć ich dziesięć z gospodarzem niż trzydzieści bez. Ten sam warunek dotyczy dowodu: „wiemy z rozmowy" nie jest dowodem i takie pozycje trafiają na osobną listę rzeczy do sprawdzenia, a nie na listę ustaleń.

Drugim efektem, mniej widocznym, jest sposób pracy, który zostaje u klienta po naszym wyjściu. Comiesięczny przegląd tej listy ma się odbywać bez nas: agenda jest krótka, prowadzi ją osoba z zespołu klienta, a my w pierwszych trzech przeglądach tylko siedzimy z boku i notujemy, co się sypie. Jeżeli po trzecim przeglądzie lista dalej wymaga naszego udziału, żeby ktokolwiek ją otworzył, to znaczy że wdrożyliśmy dokument, a nie nawyk — i to jest jedyny wynik, który uznajemy za porażkę tego programu.

Czego ten program świadomie NIE obejmuje: wyboru narzędzi, przetargu na dostawcę SOC ani przepisywania polityk. Każda z tych rzeczy jest osobną robotą, każda ma innego decydenta i wciągnięcie ich tutaj zamieniłoby trzy miesiące w rok. Jeśli w trakcie okaże się, że któraś jest blokerem, wchodzi jako osobne zaangażowanie z własnym zakresem, a nie jako rozszerzenie tego.`;

// `workspace.bootstrapContext` — query.ts:1008-1106. Bogatszy niż w
// `shellQueries`: trzy statusy zamiast jednego, bo lista zadań ze wszystkimi
// pozycjami w tym samym stanie nie pokazuje ani grupowania, ani semantyki.
// `defaultTaskStatusId` celowo zostaje przy `statusId` z wariantu ubogiego.
export const populatedBootstrap: Projection<"workspace.bootstrapContext"> = {
  kind: "workspace.bootstrapContext",
  workspace: {
    id: workspaceId,
    name: "Praca",
    timezone: "Europe/Warsaw",
    defaultTaskStatusId: statusId,
    voiceAudioRetentionPolicy: "delete_after_transcript",
    // Wymagane w projekcji od B10 — odczyt niesie wartość SKUTECZNĄ, nigdy
    // `undefined`, żeby żaden ekran nie przepisywał u siebie ośmiu godzin.
    // Ten fixture jest typowany kontraktem, więc to jego typ złapał brak pola
    // przy przebazowaniu; wariant ubogi przechodzi przez rzutowanie i nie
    // złapałby niczego.
    workingDay: DEFAULT_WORKING_DAY,
    version: 4,
  },
  spaces: [{ id: spaceId, name: "Praca", version: 1 }],
  taskStatuses: [
    {
      id: statusId,
      label: "Do zrobienia",
      operationalSemantics: "actionable",
      state: "active",
      position: 0,
      version: 1,
    },
    {
      id: inProgressStatusId,
      label: "W toku",
      operationalSemantics: "actionable",
      state: "active",
      position: 1,
      version: 1,
    },
    {
      id: waitingStatusId,
      label: "Czeka na klienta",
      operationalSemantics: "waiting",
      state: "active",
      position: 2,
      version: 1,
    },
  ],
};

// `relationship.workspace` — query.ts:832-838 (`records` + `freshness` W ŚRODKU
// projekcji, inaczej niż `task.list` i `project.list`). Ramiona rekordów:
// `StrategicRecordProjectionSchema`, query.ts:462-605, na wspólnej bazie
// `StrategicRecordBaseSchema`, query.ts:418-431 — wszystkie `.strict()`.
//
// SEDNO tego zestawu: `referencedOrganizationId` jest celem wychodzących
// odwołań dwóch innych rekordów (`person.organizationId` i
// `opportunity.organizationId`), a `unreferencedOrganizationId` nie występuje
// NIGDZIE poza własnym rekordem. Bez tej różnicy fixture dowodzi tylko jednej
// gałęzi usuwania: sam zablokowany nigdy nie pokaże, że kontrolka usuwania w
// ogóle istnieje, a sam wolny nigdy nie pokaże odmowy.
const strategicRecordBase = {
  workspaceId,
  spaceId,
  createdBy: principalId,
  recordState: "active",
  version: 1,
  createdAt: "2026-06-01T08:00:00.000Z",
  updatedAt: "2026-07-20T14:30:00.000Z",
} as const;

export const populatedRelationshipWorkspace: Projection<"relationship.workspace"> =
  {
    kind: "relationship.workspace",
    records: [
      {
        ...strategicRecordBase,
        id: referencedOrganizationId,
        kind: "organization",
        name: "Northstar Industries",
        relationshipState: "active",
        nextAction: "Potwierdź sponsora i termin warsztatu.",
      },
      {
        ...strategicRecordBase,
        id: unreferencedOrganizationId,
        kind: "organization",
        name: "Wiatrak Logistyka",
        relationshipState: "prospect",
      },
      {
        ...strategicRecordBase,
        id: personRecordId,
        kind: "person",
        name: "Marta Nowak",
        organizationId: referencedOrganizationId,
        role: "Sponsorka programu",
        email: "marta.nowak@example.test",
      },
      {
        ...strategicRecordBase,
        id: opportunityRecordId,
        kind: "opportunity",
        title: "Program porządkowania bezpieczeństwa informacji",
        organizationId: referencedOrganizationId,
        personIds: [personRecordId],
        ownerPersonId: personRecordId,
        need: "Zarząd i zespół techniczny mają dwie różne wersje stanu bezpieczeństwa.",
        qualification:
          "Budżet potwierdzony na kwartał, decyzja po stronie sponsorki.",
        stage: "qualified",
        nextAction: "Wyślij zakres warsztatu do akceptacji.",
        evidenceSourceIds: [],
        offerIds: [],
        projectIds: [projectId],
        state: "open",
      },
      {
        ...strategicRecordBase,
        id: initiativeRecordId,
        kind: "initiative",
        title: "Jedna lista ustaleń zamiast dwóch opowieści",
        intendedOutcome: longIntendedOutcome,
        needsReview: false,
        state: "active",
      },
    ],
    freshness: {
      mode: "local_authoritative",
      checkpoint: null,
      missingCapabilities: [],
    },
  };

// `task.list` — query.ts:1114-1206 (`items` + `nextCursor`, BEZ `freshness`).
// `status` jest obiektem, nie identyfikatorem (query.ts:1167-1179), a
// `attachments` i `completionState` są obowiązkowe.
//
// Pierwszy tytuł ma ponad 100 znaków, bo tyle mają prawdziwe: zadanie nazwane
// trzema słowami nie pokaże ani obcięcia, ani zawinięcia, ani kolizji z metryką
// obok.
export const longTaskTitle =
  "Przygotuj i uzgodnij ze sponsorką zakres warsztatu bezpieczeństwa: lista uczestników, agenda godzinowa i materiały wstępne";

export const populatedTaskList: Projection<"task.list"> = {
  kind: "task.list",
  items: [
    {
      id: longTaskId,
      spaceId,
      title: longTaskTitle,
      description:
        "Zakres ma się zmieścić na jednej stronie. Wszystko, co nie mieści się na jednej stronie, jest osobnym zaangażowaniem.",
      nextAction: "Zbierz listę uczestników od Marty.",
      dueAt: "2026-08-05T15:00:00.000Z",
      priority: "high",
      plannedBy: {
        principalId,
        principalKind: "human",
        at: "2026-07-20T09:15:00.000Z",
      },
      startAt: "2026-08-03T07:00:00.000Z",
      status: {
        id: inProgressStatusId,
        label: "W toku",
        operationalSemantics: "actionable",
        state: "active",
      },
      completionState: "open",
      attachments: [],
      createdAt: "2026-07-18T10:00:00.000Z",
      updatedAt: "2026-07-20T09:15:00.000Z",
      version: 3,
    },
    {
      id: waitingTaskId,
      spaceId,
      title: "Poczekaj na potwierdzenie sali od Northstar",
      priority: "normal",
      status: {
        id: waitingStatusId,
        label: "Czeka na klienta",
        operationalSemantics: "waiting",
        state: "active",
      },
      completionState: "open",
      attachments: [],
      createdAt: "2026-07-19T11:00:00.000Z",
      updatedAt: "2026-07-19T11:00:00.000Z",
      version: 1,
    },
    {
      id: doneTaskId,
      spaceId,
      title: "Spisz ustalenia z rozmowy wstępnej",
      status: {
        id: statusId,
        label: "Do zrobienia",
        operationalSemantics: "actionable",
        state: "active",
      },
      completionState: "completed",
      completedAt: "2026-07-17T16:40:00.000Z",
      attachments: [],
      createdAt: "2026-07-15T08:00:00.000Z",
      updatedAt: "2026-07-17T16:40:00.000Z",
      version: 5,
    },
    // Plan położony przez AGENTA i z zarezerwowanym czasem. Bez tego wariantu
    // nie da się odróżnić „ekran umie pokazać autora planu" od „ekran pokazuje
    // zawsze Ciebie": obie wersje wyglądałyby tak samo na fixture, w którym
    // wszystko zaplanował człowiek.
    {
      id: agentPlannedTaskId,
      spaceId,
      title: "Napisz scenariusze detekcyjne do warsztatu",
      dueAt: "2026-08-14T15:00:00.000Z",
      priority: "normal",
      plannedBy: {
        principalId: agentPrincipalId,
        principalKind: "agent",
        at: "2026-08-03T05:02:00.000Z",
      },
      startAt: "2026-08-03T07:00:00.000Z",
      calendarBlock: {
        ownedBlockExternalId: "task-block:agent-planned",
        calendarExternalId: "calendar-work",
        revision: "1",
        // 13:00–14:30 czasu warszawskiego.
        startsAt: "2026-08-03T11:00:00.000Z",
        endsAt: "2026-08-03T12:30:00.000Z",
      },
      status: {
        id: statusId,
        label: "Do zrobienia",
        operationalSemantics: "actionable",
        state: "active",
      },
      completionState: "open",
      attachments: [],
      createdAt: "2026-07-30T10:00:00.000Z",
      updatedAt: "2026-08-03T05:02:00.000Z",
      version: 2,
    },
    // Termin w zasięgu wzroku, którego NIKT nie zaplanował — jedyny przypadek,
    // w którym `dueAt` ma prawo głosu na ekranie dnia.
    {
      id: unplannedDeadlineTaskId,
      spaceId,
      title: "Zamów licencje na 12 000 EPS",
      dueAt: "2026-08-06T15:00:00.000Z",
      priority: "high",
      status: {
        id: statusId,
        label: "Do zrobienia",
        operationalSemantics: "actionable",
        state: "active",
      },
      completionState: "open",
      attachments: [],
      createdAt: "2026-07-28T09:00:00.000Z",
      updatedAt: "2026-07-28T09:00:00.000Z",
      version: 1,
    },
  ],
  nextCursor: null,
};

// `project.list` — query.ts:1425-1448 (`items` i NIC więcej: ani `nextCursor`,
// ani `freshness`). Drugi projekt niesie `needsReview: true` przy pustym
// `intendedOutcome` — tak wygląda „intencja nigdy nie zapisana" po stronie
// czytającego (patrz komentarz przy `NeedsReviewSchema`,
// `packages/contracts/src/narrative.ts:18-28`), a pusty napis w miejscu
// akapitu to osobny przypadek układu niż akapit długi.
export const populatedProjectList: Projection<"project.list"> = {
  kind: "project.list",
  items: [
    {
      id: projectId,
      spaceId,
      title: "Warsztat bezpieczeństwa Northstar",
      intendedOutcome: longIntendedOutcome,
      needsReview: false,
      lifecycle: "active",
      relatedOpenTaskCount: 2,
      version: 7,
      updatedAt: "2026-07-20T14:30:00.000Z",
    },
    {
      id: draftProjectId,
      spaceId,
      title: "Przeniesienie archiwum umów",
      intendedOutcome: "",
      needsReview: true,
      lifecycle: "active",
      relatedOpenTaskCount: 0,
      version: 1,
      updatedAt: "2026-07-10T09:00:00.000Z",
    },
  ],
};

/**
 * The same shell contract as `shellQueries`, with records in it. Use this when
 * the guarantee under test only exists on a screen that has data: layout of a
 * long value, a list that groups, a control that a reference blocks.
 */
export const populatedShellQueries = {
  ...shellQueries,
  "workspace.bootstrapContext": projectionResponse(populatedBootstrap),
  "task.list": projectionResponse(populatedTaskList),
  "project.list": projectionResponse(populatedProjectList),
  "relationship.workspace": projectionResponse(populatedRelationshipWorkspace),
};
