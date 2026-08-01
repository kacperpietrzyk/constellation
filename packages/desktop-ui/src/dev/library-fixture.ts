// MATERIAŁ LIBRARY DLA HARNESSU DEWELOPERSKIEGO — i granica, w której wolno go
// używać. Ta granica jest CZĘŚCIĄ zgody na jego istnienie, więc jest tutaj,
// a nie w dokumencie, który za rok będzie nie do znalezienia.
//
//   1. Ta fikstura istnieje PO TO, ŻEBY BRAMKA UKŁADU MIAŁA CO ZMIERZYĆ.
//      `?surface=collaboration` rysowało Library z ZEREM dokumentów, ZEREM
//      źródeł i pustą historią przechwyceń, więc przegląd układu przechodził
//      nad geometrią, na którą nikt nie patrzył.
//   2. Jest ZBUDOWANA Z PRAWDZIWYCH KSZTAŁTÓW — zmierzonych, nie wymyślonych.
//      Liczby są niżej, przy każdym polu, które z nich wynika.
//   3. NIGDY NIE JEST DOWODEM, ŻE EKRAN JEST POPRAWNY. Tym zostaje
//      `npm run dev:snapshot` + `npm run dev:desktop` na prawdziwym materiale.
//      Zielony przebieg na tej fiksturze mówi „nic nie wychodzi ze swojego
//      pudełka" i nic ponadto.
//
// Zasada projektu mówi: nie wymyślać fikstur. To jest NAZWANY, OGRANICZONY
// WYJĄTEK udzielony jednemu lotowi fali D, a nie precedens. Kto czyta to jako
// „wymyślanie fikstur jest w porządku", czyta wbrew punktowi 3.
//
// ── SPIS Z NATURY, 01.08.2026 ────────────────────────────────────────────────
// Zmierzone przez MCP na tym samym workspace, który kopiuje `dev:snapshot`
// (17 dokumentów, 81 źródeł, 5 przechwyceń):
//
//   długość treści notatki   1 771 – 10 029 znaków, mediana 4 487
//   rodzaje węzłów w CAŁYM zbiorze   paragraph 1 726, text 1 238 — I TYLKO TO
//   stan treści              17/17 `plain-v1`, 17/17 `authored`
//   odwołania do encji       0 w całym zbiorze
//   tytuły źródeł            36 – 199 znaków, średnio 89
//   rodzaje źródeł           file 72 · url 8 · excerpt 1 · screenshot 0
//   dostępność źródeł        reference_only 75 · available 6 · unavailable 0
//   przechwycenia            5, w DWÓCH z siedmiu stanów przetwarzania
//
// CO Z TEGO WYNIKA DLA KSZTAŁTU NIŻEJ, punkt po punkcie:
//
//   • Treść notatki ma ~4 500 znaków, czyli MEDIANĘ pomiaru, a nie 1 400–3 000
//     z planu fali. Tamten przedział pochodzi z `intendedOutcome` Projektu —
//     innego pola — i leży PONIŻEJ prawdziwej mediany notatki. Fikstura
//     zbudowana na nim odtworzyłaby dokładnie ten defekt, przed którym ma
//     chronić.
//   • Prawdziwe notatki trzymają markdown JAKO TEKST w akapitach: wiersze
//     tabeli z pionowymi kreskami i gołe adresy URL. To są długie, NIEŁAMLIWE
//     napisy — jedyny kształt w tym zbiorze, który naprawdę rozpycha wąski
//     panel. Dlatego są tutaj dosłownie, w akapitach, tak jak w zbiorze.
//   • Nagłówki, lista, blok kodu i odwołanie do encji NIE WYSTĘPUJĄ dziś
//     w żadnej notatce. Są tu, bo edytor je oferuje, a import z Obsidiana je
//     przyniesie — i bramka układu musi je zobaczyć, zanim przyjdą. To jest
//     świadome wyjście poza zmierzony zbiór i jedyne w tym pliku.
//   • Poziomy nagłówków trzymają się 1–3, bo tyle przyjmuje dziś walidator
//     (`structured-document.ts`). Rozszerzenie do 1–6 należy do innego lotu;
//     h4 wpisane tutaj wywaliłoby harness na starcie na drzewie bez tamtej
//     zmiany.
//   • `screenshot` i `unavailable` NIE ISTNIEJĄ w prawdziwym zbiorze, a ekran
//     Źródeł rozgałęzia się na obu. Są tu WŁAŚNIE DLATEGO, że prawdziwy
//     materiał ich nie pokrywa — i to jest reguła, nie wyjątek: zdolność,
//     której żadna fikstura nie wykonuje, jest NIE DO ODRÓŻNIENIA od
//     niezbudowanej. Ten projekt zapłacił już za to raz — czwarty stan
//     zdrowia wyszedł w wydaniu nieosiągalny dokładnie z tego powodu.
//   • Pięć z siedmiu stanów przetwarzania nie ma ani jednego prawdziwego
//     przykładu, a etykiety historii rozgałęziają się na wszystkich siedmiu.
//     Ta sama reguła: jest tu po jednym z KAŻDEGO z siedmiu.
//
// CZEGO TU NIE MA, i to jest ZNALEZISKO, a nie przeoczenie: FOLDERÓW oraz
// przypięcia notatki do Projektu WIDOCZNEGO NA LIŚCIE. `document.list` jest
// `.strict()` i nie ma `folderId`; `Folder` nie jest jeszcze rekordem. Notatkę
// przy Projekcie da się dziś pokazać wyłącznie przez
// `project.operationalOverview.relatedDocuments` — i tak jest zrobiona; to jest
// prawdziwy odczyt, nie wymysł.
//
// KTO TO ROZSZERZA: LOT EKRANU NOTATEK, nie ten lot i nie lot folderów.
// B8 jest właścicielem modelu, nie fikstury, a ekran Notatek jest pierwszym,
// który naprawdę potrzebuje ZMIERZYĆ GEOMETRIĘ drzewa folderów — i do tego
// czasu projekcja B8 już istnieje. `libraryDocuments` niżej jest tym jednym
// miejscem: dokłada się `folderId` do kształtu i drzewo do osobnej odpowiedzi.
import {
  AttentionSignalIdSchema,
  CaptureIdSchema,
  CapturePayloadIdSchema,
  DocumentIdSchema,
  KnowledgeSourceIdSchema,
  type CaptureId,
  type CapturePayloadId,
  type PrincipalId,
  type TaskId,
  type DocumentId,
  type KnowledgeSourceId,
  type SpaceId,
} from "@constellation/contracts";
import {
  STRUCTURED_DOCUMENT_SCHEMA_VERSION,
  migrateDocumentToRich,
  replaceStructuredDocumentInYjs,
  type StructuredDocument,
  type StructuredDocumentNode,
} from "@constellation/realtime-documents";
import * as Y from "yjs";

const documentId = (suffix: string): DocumentId =>
  DocumentIdSchema.parse(`00000000-0000-4000-8000-0000000009${suffix}`);
const sourceId = (suffix: string): KnowledgeSourceId =>
  KnowledgeSourceIdSchema.parse(`00000000-0000-4000-8000-0000000008${suffix}`);
const captureId = (suffix: string): CaptureId =>
  CaptureIdSchema.parse(`00000000-0000-4000-8000-0000000007${suffix}`);
const payloadId = (suffix: string): CapturePayloadId =>
  CapturePayloadIdSchema.parse(`00000000-0000-4000-8000-0000000006${suffix}`);

export const libraryDocumentIds = {
  runbook: documentId("01"),
  network: documentId("02"),
  handover: documentId("03"),
  identity: documentId("04"),
  retention: documentId("05"),
  migration: documentId("06"),
  inventory: documentId("07"),
  acceptance: documentId("08"),
  rollback: documentId("09"),
} as const;

/**
 * Tytuły w długościach ze spisu (36–199 znaków, średnio 89), z jednym przy
 * samej górze. Krótkie tytuły w każdym wierszu to była właśnie ta fikstura,
 * która nie pokazała, jak wygląda lista, kiedy tekst nie mieści się w kolumnie.
 */
const documentShapes = [
  {
    id: libraryDocumentIds.runbook,
    title: "Orbit — runbook uruchomienia środowiska po stronie klienta",
    role: "note" as const,
    version: 4,
    updatedAt: "2026-07-30T09:12:00.000Z",
  },
  {
    id: libraryDocumentIds.network,
    title: "Orbit — architektura sieci, adresacja i reguły wyjścia",
    role: "note" as const,
    version: 2,
    updatedAt: "2026-07-29T16:41:00.000Z",
  },
  {
    id: libraryDocumentIds.handover,
    title: "Orbit — dokumentacja powdrożeniowa dla zespołu utrzymania",
    role: "deliverable" as const,
    version: 7,
    updatedAt: "2026-07-31T11:05:00.000Z",
  },
  {
    id: libraryDocumentIds.identity,
    // 199 znaków: górna granica zmierzona na prawdziwych tytułach. Wiersz
    // listy musi to przeżyć, a do tej pory nikt tego nie oglądał.
    title:
      "Orbit — model tożsamości, ról i uprawnień w środowisku klienta, wraz z mapowaniem grup katalogowych na role aplikacyjne oraz decyzją o źródle prawdy dla atrybutów działu i lokalizacji pracownika",
    role: "document" as const,
    version: 3,
    updatedAt: "2026-07-28T13:22:00.000Z",
  },
  {
    id: libraryDocumentIds.retention,
    title: "Orbit — polityka retencji nagrań i dowodów",
    role: "note" as const,
    version: 1,
    updatedAt: "2026-07-27T08:03:00.000Z",
  },
  {
    id: libraryDocumentIds.migration,
    title: "Orbit — plan migracji danych z poprzedniego systemu",
    role: "document" as const,
    version: 5,
    updatedAt: "2026-07-31T07:48:00.000Z",
  },
  {
    id: libraryDocumentIds.inventory,
    title: "Orbit — inwentarz maszyn i wersji",
    role: "note" as const,
    version: 2,
    updatedAt: "2026-07-26T15:30:00.000Z",
  },
  {
    id: libraryDocumentIds.acceptance,
    title: "Orbit — kryteria odbioru i protokół testów akceptacyjnych",
    role: "deliverable" as const,
    version: 2,
    updatedAt: "2026-07-30T17:19:00.000Z",
  },
  {
    id: libraryDocumentIds.rollback,
    title: "Orbit — procedura wycofania wdrożenia",
    role: "note" as const,
    version: 1,
    updatedAt: "2026-07-25T12:00:00.000Z",
  },
] as const;

export const libraryDocuments = (spaceId: SpaceId) =>
  documentShapes.map((shape) => ({ ...shape, spaceId }));

/**
 * WSZYSTKIE CZTERY rodzaje źródła, bo ekran Źródeł rozgałęzia się na każdym,
 * plus jeden tytuł na zmierzonym maksimum (199 znaków) i jedno `unavailable`,
 * którego prawdziwy zbiór nie ma ani jednego, a odczyt ma dla niego osobny
 * stan.
 */
export const librarySources = () => [
  {
    id: sourceId("01"),
    sourceKind: "url" as const,
    title: "Dokumentacja dostawcy: limity API i okna serwisowe",
    canonicalUrl:
      "https://developer.example.com/reference/rate-limits-and-maintenance-windows?section=quotas&revision=2026-07",
    availability: "available" as const,
    observedAt: "2026-07-30T09:00:00.000Z",
    version: 2,
    updatedAt: "2026-07-30T09:00:00.000Z",
    referencedBy: [],
    referencedByCount: 0,
  },
  {
    id: sourceId("02"),
    sourceKind: "file" as const,
    // 199 znaków — górna granica ze spisu.
    title:
      "Protokół z warsztatu przedwdrożeniowego z zespołem klienta, wersja po korekcie uwag zgłoszonych na spotkaniu domykającym, zawierająca uzgodnioną listę wyłączeń zakresu i sposób ich potwierdzenia",
    availability: "available" as const,
    observedAt: "2026-07-24T11:30:00.000Z",
    version: 3,
    updatedAt: "2026-07-29T10:14:00.000Z",
    referencedBy: [],
    referencedByCount: 2,
  },
  {
    id: sourceId("03"),
    sourceKind: "screenshot" as const,
    title: "Zrzut konsoli dostawcy z komunikatem o odrzuceniu tokenu",
    availability: "unavailable" as const,
    observedAt: "2026-07-22T18:05:00.000Z",
    version: 1,
    updatedAt: "2026-07-22T18:05:00.000Z",
    referencedBy: [],
    referencedByCount: 0,
  },
  {
    id: sourceId("04"),
    sourceKind: "excerpt" as const,
    title: "Fragment umowy: okno serwisowe i kary za przekroczenie",
    availability: "reference_only" as const,
    observedAt: "2026-07-20T14:00:00.000Z",
    version: 1,
    updatedAt: "2026-07-20T14:00:00.000Z",
    referencedBy: [],
    referencedByCount: 1,
  },
  {
    id: sourceId("05"),
    sourceKind: "file" as const,
    title: "Eksport konfiguracji sieciowej z urządzenia brzegowego",
    availability: "reference_only" as const,
    observedAt: "2026-07-19T09:45:00.000Z",
    version: 1,
    updatedAt: "2026-07-19T09:45:00.000Z",
    referencedBy: [],
    referencedByCount: 0,
  },
  {
    id: sourceId("06"),
    sourceKind: "url" as const,
    title: "Wpis w bazie wiedzy dostawcy o zmianie domyślnego szyfrowania",
    canonicalUrl:
      "https://support.example.com/hc/pl/articles/4098123456789-zmiana-domyslnego-szyfrowania-woluminow",
    availability: "reference_only" as const,
    observedAt: "2026-07-18T07:10:00.000Z",
    version: 1,
    updatedAt: "2026-07-18T07:10:00.000Z",
    referencedBy: [],
    referencedByCount: 0,
  },
];

/** Skróty, które Library czyta obok listy dokumentów. */
export const librarySummaries = () =>
  documentShapes.map((item, index) => ({
    id: item.id,
    title: item.title,
    role: item.role,
    evidenceCount: index % 3,
    namedVersionCount: item.role === "deliverable" ? 2 : 0,
    staleEvidence: index === 2,
    version: item.version,
    updatedAt: item.updatedAt,
  }));

/**
 * PO JEDNYM Z KAŻDEGO stanu przetwarzania, bo etykiety historii rozgałęziają
 * się na wszystkich siedmiu, a prawdziwy zbiór ma tylko dwa. Wpis
 * `transcript_ready` z `audioState: "retained"` jest tu z osobnego powodu:
 * to JEDYNY stan, w którym pokazuje się przycisk kasowania zatrzymanego
 * dźwięku — jedyna kontrolka w całym interfejsie dla granicy retencji głosu.
 * Bez tego wpisu nie ma czego zmierzyć ani czego pilnować.
 */
export const libraryCaptures = (
  spaceId: SpaceId,
  { taskId, principalId }: { taskId: TaskId; principalId: PrincipalId },
) => [
  {
    id: captureId("01"),
    spaceId,
    originalText:
      "Sprawdzić, czy okno serwisowe dostawcy nie koliduje z terminem odbioru — dostawca podał dwa różne przedziały w umowie i w bazie wiedzy.",
    original: { kind: "text" as const, text: "Sprawdzić okno serwisowe" },
    source: "global_quick_capture" as const,
    capturedAt: "2026-07-31T08:15:00.000Z",
    version: 2,
    processingState: "routed_as_task" as const,
    derivedTaskId: taskId,
    routedAt: "2026-07-31T08:15:02.000Z",
    routedBy: principalId,
  },
  {
    id: captureId("02"),
    spaceId,
    originalText:
      "https://support.example.com/hc/pl/articles/4098123456789-zmiana-domyslnego-szyfrowania-woluminow",
    original: {
      kind: "url" as const,
      url: "https://support.example.com/hc/pl/articles/4098123456789-zmiana-domyslnego-szyfrowania-woluminow",
    },
    source: "in_app_quick_capture" as const,
    capturedAt: "2026-07-30T19:02:00.000Z",
    version: 2,
    processingState: "routed_as_knowledge_source" as const,
    derivedKnowledgeSourceId: sourceId("06"),
    routedAt: "2026-07-30T19:02:01.000Z",
    routedBy: principalId,
  },
  {
    id: captureId("03"),
    spaceId,
    originalText: "Notatka głosowa z rozmowy o zakresie utrzymania",
    original: {
      kind: "voice_note" as const,
      payload: {
        payloadId: payloadId("01"),
        displayName: "rozmowa-o-utrzymaniu.m4a",
        mediaType: "audio/mp4" as const,
        byteLength: 486_912,
        contentSha256: "b".repeat(64),
        custodyState: "available" as const,
      },
      durationMs: 58_000,
      retentionPolicy: "delete_after_transcript" as const,
    },
    source: "global_quick_capture" as const,
    capturedAt: "2026-07-30T12:40:00.000Z",
    version: 1,
    processingState: "awaiting_transcript" as const,
    awaitingTranscriptSince: "2026-07-30T12:40:05.000Z",
  },
  {
    id: captureId("04"),
    spaceId,
    originalText: "Notatka głosowa z warsztatu przedwdrożeniowego",
    original: {
      kind: "voice_note" as const,
      payload: {
        payloadId: payloadId("02"),
        displayName: "warsztat-przedwdrozeniowy.m4a",
        mediaType: "audio/mp4" as const,
        byteLength: 1_204_224,
        contentSha256: "c".repeat(64),
        custodyState: "available" as const,
      },
      durationMs: 119_000,
      retentionPolicy: "retain" as const,
    },
    source: "global_quick_capture" as const,
    capturedAt: "2026-07-29T09:20:00.000Z",
    version: 3,
    processingState: "transcript_ready" as const,
    transcript: {
      text: "Zespół klienta prosi, żeby okno serwisowe wypadało po godzinie osiemnastej, bo wcześniej trwa rozliczenie zmiany. Utrzymanie przejmuje środowisko dopiero po protokole odbioru.",
      audioContentSha256: "c".repeat(64),
      writtenAt: "2026-07-29T09:34:00.000Z",
      writtenBy: principalId,
      writtenByKind: "agent" as const,
      hostRunId: "run-2026-07-29-0934",
    },
    // Ten jeden wpis zostaje `retained` świadomie: tylko wtedy rysuje się
    // „Delete the kept audio", a to jest granica retencji głosu.
    audioState: "retained" as const,
    audioStateChangedAt: "2026-07-29T09:34:10.000Z",
  },
  {
    id: captureId("05"),
    spaceId,
    originalText: "Zrzut konsoli z komunikatem o odrzuceniu tokenu",
    original: {
      kind: "screenshot" as const,
      payload: {
        payloadId: payloadId("03"),
        displayName: "konsola-odrzucony-token.png",
        mediaType: "image/png" as const,
        byteLength: 331_776,
        contentSha256: "d".repeat(64),
        custodyState: "available" as const,
      },
    },
    source: "in_app_quick_capture" as const,
    capturedAt: "2026-07-28T16:55:00.000Z",
    version: 1,
    processingState: "pending_processing" as const,
  },
  {
    id: captureId("06"),
    spaceId,
    originalText:
      "Ten sam link do bazy wiedzy dostawcy, zapisany drugi raz tego samego dnia",
    original: {
      kind: "url" as const,
      url: "https://support.example.com/hc/pl/articles/4098123456789-zmiana-domyslnego-szyfrowania-woluminow",
    },
    source: "in_app_quick_capture" as const,
    capturedAt: "2026-07-28T11:12:00.000Z",
    version: 2,
    processingState: "needs_review" as const,
    reviewReason: "duplicate" as const,
    duplicateOfCaptureId: captureId("02"),
    attentionSignalId: AttentionSignalIdSchema.parse(
      "00000000-0000-4000-8000-000000000014",
    ),
    reviewedAt: "2026-07-28T11:12:03.000Z",
  },
  {
    id: captureId("07"),
    spaceId,
    originalText:
      "Trzy liczby przepisane z tablicy, bez podpisu — nie wiadomo, czy to przepustowość, czy koszt.",
    original: {
      kind: "text" as const,
      text: "1200 / 480 / 96",
    },
    source: "global_quick_capture" as const,
    capturedAt: "2026-07-27T17:44:00.000Z",
    version: 3,
    processingState: "unclassified" as const,
    unclassifiedAt: "2026-07-27T17:50:00.000Z",
    unclassifiedBy: principalId,
    previousReviewReason: "ambiguous" as const,
  },
];

// ── TREŚĆ NOTATKI ────────────────────────────────────────────────────────────
// Jedyne miejsce w tej fiksturze, gdzie geometrię robi TEKST, a nie wiersz
// listy. Długość ~3 800 znaków — w zmierzonym przedziale 1 771–10 029, akapity
// niosącymi dosłowne wiersze tabeli markdown i gołe adresy — czyli dokładnie
// to, co trzymają dziś prawdziwe notatki i jedyny kształt w nich, który
// rozpycha wąski panel. Nagłówki, lista i blok kodu są ponad zmierzony zbiór:
// edytor je oferuje, import je przyniesie, a bramka ma je zobaczyć wcześniej.

const paragraph = (text: string): StructuredDocumentNode => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const heading = (level: 1 | 2 | 3, text: string): StructuredDocumentNode => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});
const bullets = (items: readonly string[]): StructuredDocumentNode => ({
  type: "bulletList",
  content: items.map((text) => ({
    type: "listItem",
    content: [paragraph(text)],
  })),
});
const codeBlock = (language: string, text: string): StructuredDocumentNode => ({
  type: "codeBlock",
  attrs: { language },
  content: [{ type: "text", text }],
});

export const libraryNoteBody = (taskId: TaskId): StructuredDocument => ({
  schemaVersion: STRUCTURED_DOCUMENT_SCHEMA_VERSION,
  type: "doc",
  content: [
    heading(1, "Runbook uruchomienia środowiska po stronie klienta"),
    paragraph(
      "Notatka opisuje kolejność, w jakiej środowisko wstaje od zera, i co trzeba potwierdzić po każdym kroku, zanim ruszy następny. Kolejność nie jest kosmetyczna: każdy krok zakłada, że poprzedni został odczytany z powrotem, a nie że polecenie zwróciło zero. Środowisko wstawało już dwa razy w stanie, w którym wszystkie polecenia zakończyły się powodzeniem, a katalog nie odpowiadał — dlatego odczyt zwrotny jest w każdym kroku, a nie na końcu.",
    ),
    heading(2, "Zanim cokolwiek ruszy"),
    paragraph(
      "Okno serwisowe dostawcy jest podane w dwóch miejscach i w dwóch różnych przedziałach. Wiążący jest ten z umowy; wpis w bazie wiedzy jest starszy i nikt go nie wycofał. Przed startem trzeba to potwierdzić u opiekuna technicznego, bo cała reszta kolejności zakłada, że okno jest po osiemnastej.",
    ),
    bullets([
      "Potwierdzone okno serwisowe i osoba, która je potwierdziła.",
      "Dostęp do konsoli dostawcy dla konta operatorskiego, sprawdzony tego samego dnia — token bywa odrzucany po rotacji, a komunikat wygląda wtedy jak błąd sieci.",
      "Kopia konfiguracji urządzenia brzegowego, wyeksportowana przed zmianą, nie po niej.",
      "Uzgodniony kanał, na którym zespół klienta potwierdzi odbiór — bez tego protokół odbioru wraca po tygodniu z pytaniem, kto to widział.",
    ]),
    heading(2, "Adresacja i reguły wyjścia"),
    paragraph(
      "Poniższa tabela jest przepisana z uzgodnień warsztatowych i jest jedynym miejscem, w którym adresacja stoi obok reguł wyjścia. Wiersze są długie i nie łamią się w wąskiej kolumnie — tak samo zachowuje się w prawdziwych notatkach.",
    ),
    paragraph("| Segment | Zakres | Wyjście | Uwaga |"),
    paragraph("|---|---|---|---|"),
    paragraph(
      "| Zarządzanie | 10.42.0.0/24 | tylko do repozytorium pakietów i do konsoli dostawcy | jedyny segment z dostępem do konsoli, celowo |",
    ),
    paragraph(
      "| Aplikacyjny | 10.42.10.0/23 | wyjście przez bramę aplikacyjną, bez wyjątków dla pojedynczych hostów | wyjątek na host był przyczyną poprzedniego incydentu |",
    ),
    paragraph(
      "| Integracyjny | 10.42.20.0/24 | wyłącznie do wskazanych adresów dostawcy, lista w konfiguracji bramy | lista jest wersjonowana razem z konfiguracją, nie osobno |",
    ),
    paragraph(
      "| Zapasowy | 10.42.250.0/24 | brak wyjścia | używany wyłącznie przy procedurze wycofania |",
    ),
    heading(2, "Kolejność uruchomienia"),
    paragraph(
      "Krok pierwszy stawia warstwę katalogową i nic poza nią. Odczyt zwrotny musi pokazać komplet grup, a nie samą odpowiedź serwera — grupy potrafią powstać puste i wszystko dalej wygląda poprawnie aż do pierwszego logowania użytkownika.",
    ),
    codeBlock(
      "bash",
      "./bootstrap.sh --stage directory --read-back\n./bootstrap.sh --stage application --wait-for directory\n./bootstrap.sh --stage integration --wait-for application --verify-egress",
    ),
    paragraph(
      "Krok drugi stawia warstwę aplikacyjną. Dopiero po nim ma sens sprawdzanie integracji: przed nim brama odpowiada, ale odpowiada domyślną konfiguracją, co daje zielony wynik na czymś, czego jeszcze nie ma.",
    ),
    heading(3, "Co potwierdzić po każdym kroku"),
    bullets([
      "Katalog: liczba kont i liczba członkostw, nie sama odpowiedź serwera.",
      "Aplikacja: logowanie jednym kontem z każdej roli, nie kontem operatorskim.",
      "Integracja: jedno wywołanie w obie strony i zapis w dzienniku po stronie dostawcy.",
    ]),
    heading(2, "Kiedy coś nie wstaje"),
    paragraph(
      "Najczęstszy przypadek to odrzucony token po rotacji. Komunikat w konsoli dostawcy jest ogólny i wygląda jak problem sieciowy; rozstrzyga dopiero wpis w dzienniku po stronie dostawcy. Opis jest w bazie wiedzy pod adresem https://support.example.com/hc/pl/articles/4098123456789-zmiana-domyslnego-szyfrowania-woluminow i ten adres jest tu celowo w całości, bo skrócony link po roku nie prowadzi już do niczego.",
    ),
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Zadanie prowadzące tę pozycję: " },
        {
          type: "entityReference",
          attrs: { targetKind: "task", targetId: taskId },
        },
        {
          type: "text",
          text: " — dopóki jest otwarte, ta notatka nie jest wersją do odbioru.",
        },
      ],
    },
    paragraph(
      "Procedura wycofania jest w osobnej notatce i celowo nie jest tu streszczona: streszczenie procedury wycofania to najkrótsza droga do wykonania jej z pamięci, w nocy, po nieudanym wdrożeniu.",
    ),
  ],
});

/**
 * Treść podana tak, jak podaje ją prawdziwy most preload: JAKO STAN Yjs.
 * Nie da się jej wstrzyknąć „obok" edytora — edytor czyta wyłącznie to, co
 * `openDocument` odda w `state`, więc fikstura, która by to obeszła, mierzyłaby
 * inną drogę niż aplikacja.
 *
 * KOLEJNOŚĆ TU JEST WSZYSTKIM i kosztowała jeden pusty pomiar. Format dokumentu
 * siedzi w mapie metadanych, nie we fragmencie; dokument bez tego stempla czyta
 * się jako `plain-v1`, więc edytor przy otwarciu URUCHAMIA MIGRACJĘ, a migracja
 * ZASTĘPUJE fragment tekstem starego korzenia — pustym. Fikstura wyglądała
 * wtedy na kompletną (dziewięć wierszy listy, sześć źródeł), a treść notatki
 * miała ZERO znaków: strażnik liczby wierszy był zielony nad geometrią, której
 * nie było. Stempel stawia PRODUKCYJNA droga migracji, a nie ręcznie wpisany
 * klucz mapy — druga kopia tego kształtu jest dokładnie tym, jak słowniki
 * zaczynają znaczyć co innego dla piszącego niż dla czytającego.
 */
export const libraryNoteState = (taskId: TaskId): Uint8Array => {
  const document = new Y.Doc({ gc: true });
  migrateDocumentToRich(document, "0".repeat(64), { kind: "remote" });
  replaceStructuredDocumentInYjs(
    document,
    libraryNoteBody(taskId),
    "constellation.fixture",
  );
  return Y.encodeStateAsUpdate(document);
};
