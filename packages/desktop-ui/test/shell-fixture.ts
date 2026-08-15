/// <reference types="node" />

import {
  AttentionSignalIdSchema,
  CaptureIdSchema,
  DEFAULT_COMMERCIAL_DEFAULTS,
  DEFAULT_WORKING_DAY,
  DocumentIdSchema,
  FieldDefinitionIdSchema,
  PrincipalIdSchema,
  ProjectIdSchema,
  QueryIdSchema,
  SpaceIdSchema,
  StrategicRecordIdSchema,
  TaskAssignmentIdSchema,
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
    commercialDefaults: DEFAULT_COMMERCIAL_DEFAULTS,
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
/** Oferta na szansie z tego fixture'u — bez niej arkusz oferty na Lejku nie
 *  ma się z czego wziąć i cały ekran jest dla zestawu niewidoczny. */
export const offerRecordId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-000000000025",
);
/** Odnowienie — dokładnie z tego samego powodu, tylko dla całych Odnowień. */
export const renewalRecordId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-000000000026",
);
/** `deliverableDocumentId` jest w ramieniu oferty OBOWIĄZKOWY, a ten fixture
 *  nie ma projekcji wiedzy — więc ten identyfikator celowo NIE rozwiązuje się
 *  do dokumentu. Arkusz oferty ma to znieść, a nie założyć, że dokument jest. */
export const offerDeliverableDocumentId = DocumentIdSchema.parse(
  "00000000-0000-4000-8000-000000000027",
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
export const ambiguousCaptureId = CaptureIdSchema.parse(
  "00000000-0000-4000-8000-000000000045",
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
    commercialDefaults: DEFAULT_COMMERCIAL_DEFAULTS,
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
        offerIds: [offerRecordId],
        projectIds: [projectId],
        state: "open",
      },
      // Oferta i odnowienie: do 0.1.x tego zestawu nie było ani jednego z nich,
      // więc arkusz oferty na Lejku i CAŁY ekran Odnowień były dla zestawu
      // niewidoczne — a zdolność, której fixture nie pokazuje, jest nie do
      // odróżnienia od niezbudowanej.
      //
      // PIENIĄDZ TU JESZCZE NIE STOI. Ramiona `offer` i `renewal` są `.strict()`
      // i do B4 nie mają ani kosztu, ani kursu, ani ceny, ani wartości — pole
      // dopisane tutaj wcześniej nie przeszłoby ani typechecku, ani parsowania.
      // Kwoty dokłada tu B4 (lot A), nie ten PR.
      {
        ...strategicRecordBase,
        id: offerRecordId,
        kind: "offer",
        title: "Wariant z dyżurem nocnym",
        opportunityId: opportunityRecordId,
        deliverableDocumentId: offerDeliverableDocumentId,
        ownerPrincipalId: principalId,
        state: "submitted",
        nextAction: "Potwierdź termin ważności wyceny u dystrybucji.",
      },
      {
        ...strategicRecordBase,
        id: renewalRecordId,
        kind: "renewal",
        organizationId: referencedOrganizationId,
        title: "Wsparcie i utrzymanie platformy",
        scope: "Wsparcie 24/7, dwa środowiska, do 40 zgłoszeń miesięcznie",
        // Data STAŁA, a zegar liczy się od dnia uruchomienia zestawu. Przy
        // 90 dniach wyprzedzenia i wygaśnięciu 30 września okno wyprzedzenia
        // otworzyło się 2 lipca 2026 — czyli od tamtej pory ten rekord stoi
        // w sekcji „Time to start" i już z niej nie wyjdzie, bo czas idzie
        // tylko w jedną stronę. To JEDYNA stabilna strona tego przejścia:
        // rekord „przed wyprzedzeniem" wpadłby do drugiej sekcji w dniu, w
        // którym nikt już nie patrzy, i test padłby bez zmiany kodu.
        expiresAt: "2026-09-30T21:59:59.000Z",
        leadTimeDays: 90,
        ownerPrincipalId: principalId,
        evidenceSourceIds: [],
        // Zadanie, które w tym zestawie ISTNIEJE — inaczej „follow-up" jest
        // identyfikatorem donikąd i wiersz nie ma czego pokazać.
        followUpTaskId: waitingTaskId,
        cycleKey: "northstar-support-2026",
        state: "watching",
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
      // Somebody holds this work. Without an assignment on ANY fixture task,
      // nothing local ever rendered the owner — so the attribute a packaged
      // smoke finds the assignee by was proved only by a twenty-minute run.
      assignment: {
        id: TaskAssignmentIdSchema.parse(
          "00000000-0000-4000-8000-0000000000f1",
        ),
        assigneePrincipalId: principalId,
        displayName: "Kacper",
        availability: "active",
        version: 1,
      },
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

// `attention.inbox` — query.ts:1371-1425. Dwie skrzynki naraz, bo cały sens
// tego ekranu jest w podziale: sygnał o PRACY (decyzja) obok awarii wrzutki
// (hydraulika). Jeden sygnał jest już przeczytany, a mimo to dalej czeka —
// bez niego nie da się odróżnić „ile czeka" od „ile nieprzeczytanych", a to
// jest dokładnie DECYZJA #22.
export const populatedAttentionInbox: Projection<"attention.inbox"> = {
  kind: "attention.inbox",
  unreadCount: 2,
  items: [
    {
      id: AttentionSignalIdSchema.parse("00000000-0000-4000-8000-000000000060"),
      reason: "comment_mention",
      destination: { kind: "task", taskId: longTaskId },
      title: "Marta wspomniała Cię w komentarzu",
      detail: "A comment mentions you and waits for an answer.",
      urgency: "in_app",
      state: "unread",
      version: 1,
      occurredAt: "2026-08-03T06:10:00.000Z",
    },
    {
      id: AttentionSignalIdSchema.parse("00000000-0000-4000-8000-000000000061"),
      reason: "waiting_review_elapsed",
      destination: { kind: "task", taskId: waitingTaskId },
      title: "Poczekaj na potwierdzenie sali od Northstar",
      detail: "The date you were waiting for has passed.",
      urgency: "urgent",
      state: "read",
      version: 2,
      occurredAt: "2026-08-02T11:00:00.000Z",
    },
    {
      id: AttentionSignalIdSchema.parse("00000000-0000-4000-8000-000000000062"),
      reason: "capture_ambiguous",
      destination: { kind: "capture", captureId: ambiguousCaptureId },
      title: "https://example.org/eps-licensing-tiers",
      detail: "The capture could be a task or a source, so it was not routed.",
      urgency: "in_app",
      state: "unread",
      version: 1,
      occurredAt: "2026-08-03T05:40:00.000Z",
    },
  ],
};

/**
 * The same shell contract as `shellQueries`, with records in it. Use this when
 * the guarantee under test only exists on a screen that has data: layout of a
 * long value, a list that groups, a control that a reference blocks.
 */

// The Tasks plane reads `work.overview`, not `task.list`: the overview is
// whole-Space and uncapped while the query pages, so a screen filtering the
// first page would answer from a truncated set. This fixture is DERIVED from
// the task-list one above rather than written beside it — two hand-kept copies
// of the same tasks disagree at the first edit, and then a test proves
// something about a workspace that does not exist.
export const populatedWorkOverview: Projection<"work.overview"> = {
  kind: "work.overview",
  tasks: populatedTaskList.items.map((item) => ({
    id: item.id,
    title: item.title,
    statusId: item.status.id,
    // The overview carries the task's own triage state, which `task.list` does
    // not project; the status definition's four-valued semantics is a different
    // thing and must not be borrowed for it.
    operationalState: "actionable" as const,
    completionState: item.completionState,
    ...(item.startAt === undefined ? {} : { startAt: item.startAt }),
    ...(item.plannedBy === undefined ? {} : { plannedBy: item.plannedBy }),
    ...(item.dueAt === undefined ? {} : { dueAt: item.dueAt }),
    ...(item.priority === undefined ? {} : { priority: item.priority }),
    ...(item.parentTaskId === undefined
      ? {}
      : { parentTaskId: item.parentTaskId }),
    ...(item.calendarBlock === undefined
      ? {}
      : { calendarBlock: item.calendarBlock }),
    ...(item.assignment === undefined ? {} : { assignment: item.assignment }),
    ...(item.fields === undefined ? {} : { fields: item.fields }),
    projectIds: [projectId],
    version: item.version,
    updatedAt: item.updatedAt,
  })),
  projects: populatedProjectList.items.map((item) => ({
    id: item.id,
    title: item.title,
    intendedOutcome: item.intendedOutcome,
    needsReview: item.needsReview,
    lifecycle: item.lifecycle,
    ...(item.dueAt === undefined ? {} : { dueAt: item.dueAt }),
    version: item.version,
  })),
  areas: [],
  initiatives: [],
  links: [],
  savedViews: [],
  freshness: {
    mode: "local_authoritative",
    checkpoint: null,
    missingCapabilities: [],
  },
};

export const populatedShellQueries = {
  ...shellQueries,
  "workspace.bootstrapContext": projectionResponse(populatedBootstrap),
  "task.list": projectionResponse(populatedTaskList),
  "project.list": projectionResponse(populatedProjectList),
  "work.overview": projectionResponse(populatedWorkOverview),
  "relationship.workspace": projectionResponse(populatedRelationshipWorkspace),
  "attention.inbox": projectionResponse(populatedAttentionInbox),
};

// ─────────────────────────────────────────────────────────────────────────────
// TRZECI wariant: workspace, w którym KTOŚ ZAPISAŁ WIDOK.
//
// Every fixture above ships `savedViews: []`, so nothing in the suite ever saw
// a screen open a stored view — a whole half of the saved-view contract
// (`groupBy` and `layout`) was invisible to every assertion in the repo.
//
// It is a SEPARATE export rather than a change to the two above, on purpose.
// Both are read by mounted tests that would start rendering a different screen:
// a saved view appears in every picker, and `fieldDefinitions` turns on the
// custom-field sections at `RealApp.tsx:3998` and `WorkSurface.tsx:1344`. A
// fixture that quietly changes what an unrelated test renders is the same
// family of defect as a test that measures nothing.

export const workKindFieldId = FieldDefinitionIdSchema.parse(
  "00000000-0000-4000-8000-0000000000d1",
);
export const assigneeBoardViewId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000000d2",
);
export const fieldGroupedViewId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000000d3",
);
export const secondMemberPrincipalId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-0000000000d4",
);

// Kolejność opcji jest ZADEKLAROWANA i celowo nie alfabetyczna ani nie taka,
// w jakiej wartości pojawiają się w zadaniach — inaczej grupowanie ustawione
// „jak leci" wyszłoby identycznie i asercja o kolejności nie mierzyłaby nic.
export const populatedFieldDefinitions: NonNullable<
  Projection<"workspace.bootstrapContext">["fieldDefinitions"]
> = [
  {
    id: workKindFieldId,
    targetKind: "task",
    label: "Rodzaj pracy",
    type: { kind: "choice", options: ["Warsztat", "Analiza", "Przegląd"] },
    state: "active",
    position: 0,
    version: 1,
  },
];

export const populatedBootstrapWithFields: Projection<"workspace.bootstrapContext"> =
  { ...populatedBootstrap, fieldDefinitions: populatedFieldDefinitions };

// `relationTaskIds` jest ŚWIADOMIE nieobecne w obu widokach. Pusta tablica
// znaczy „widok filtruje po relacji i nic nie pasuje" (ADR-045), więc odsiałaby
// wszystkie wiersze i każda asercja niżej mierzyłaby pusty ekran.
export const populatedSavedViews: Projection<"work.overview">["savedViews"] = [
  {
    id: assigneeBoardViewId,
    name: "Kto co trzyma",
    filters: {},
    // Sortowanie NIE jest przenoszone na ekran Zadań (`manual` nie ma
    // odpowiednika w kontrakcie, `updated_desc` nie ma go w Zadaniach). Stoi
    // tu, bo projekcja go wymaga, i ma prawo być ignorowane.
    sort: "updated_desc",
    groupBy: "assignee",
    layout: "board",
    state: "active",
    version: 2,
  },
  {
    id: fieldGroupedViewId,
    name: "Praca po rodzaju",
    filters: {},
    sort: "updated_desc",
    groupBy: { fieldId: workKindFieldId },
    layout: "list",
    state: "active",
    version: 1,
  },
];

const workKindOfTask: Readonly<Record<string, string>> = {
  [longTaskId]: "Przegląd",
  [waitingTaskId]: "Analiza",
  [agentPlannedTaskId]: "Warsztat",
  [unplannedDeadlineTaskId]: "Analiza",
};

// Drugi właściciel, bo tablica po osobach z jednym nazwiskiem i workiem
// „Nieprzypisane" nie odróżnia kolumn na osobach od dwóch kolumn w ogóle.
const heldByMarta: Readonly<Record<string, string>> = {
  [waitingTaskId]: "00000000-0000-4000-8000-0000000000d5",
  [doneTaskId]: "00000000-0000-4000-8000-0000000000d6",
};

export const populatedWorkOverviewWithSavedViews: Projection<"work.overview"> =
  {
    ...populatedWorkOverview,
    tasks: populatedWorkOverview.tasks.map((task) => {
      const held = heldByMarta[task.id];
      const kind = workKindOfTask[task.id];
      return {
        ...task,
        ...(held === undefined
          ? {}
          : {
              assignment: {
                id: TaskAssignmentIdSchema.parse(held),
                assigneePrincipalId: secondMemberPrincipalId,
                displayName: "Marta",
                availability: "active" as const,
                version: 1,
              },
            }),
        ...(kind === undefined
          ? {}
          : {
              fields: {
                [workKindFieldId]: { kind: "choice" as const, value: kind },
              },
            }),
      };
    }),
    savedViews: populatedSavedViews,
  };

export const savedViewShellQueries = {
  ...populatedShellQueries,
  "workspace.bootstrapContext": projectionResponse(
    populatedBootstrapWithFields,
  ),
  "work.overview": projectionResponse(populatedWorkOverviewWithSavedViews),
};
