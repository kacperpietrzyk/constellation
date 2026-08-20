import { z } from "zod";

// Powierzchnia, na której rekord tego rodzaju otwiera się do obejrzenia.
// Wartości są identyfikatorami celów nawigacji z przebudowy 0.2.0 — ta unia
// musi z nimi zostać zgodna, ale świadomie jej NIE importujemy z paczki
// desktopowej: kontrakty nie mają zależeć od powłoki, a agent czyta ten katalog
// bez uruchomionej aplikacji.
//
// TA UNIA JEST RĘCZNĄ LISTĄ OBOK ZAMKNIĘTEGO SŁOWNIKA, ale nie jest bez
// pilnowania — i to jest sprostowanie do rekonesansu fali D, zmierzone przez
// zepsucie, nie wywnioskowane. Rekonesans zapowiadał, że wycofanie celu
// zostawiające tu martwą wartość „kompiluje się czysto i zabija wyszukiwanie
// dopiero w runtime". NIE KOMPILUJE SIĘ: `SearchOverlay.choose`
// (`Wave2Surfaces.tsx:1085`) podaje `inspectorSurface` do `onNavigate`, którego
// parametr ma typ `SurfaceId`, czyli dokładnie `DesktopSurface`. Odtworzony
// stan sprzed naprawy (`capture` → `"history"` przy wycofanym celu) daje twardy
// błąd `tsc`. Dla rodzajów WYSZUKIWALNYCH kompilator zatem pomaga.
//
// Czego kompilator NIE widzi i po co jest asercja
// `packages/desktop-ui/test/record-kind-registry-contract.test.ts`
// („każdy `inspectorSurface` jest członkiem `desktopSurfaceIds`"): rodzaje
// NIEWYSZUKIWALNE — `fact`, `initiative`, `work_link`, `commitment` — nigdy nie
// docierają do tamtego wywołania, więc ich cel może wskazywać w nicość
// bezkarnie, aż do dnia, w którym któryś stanie się wyszukiwalny i defekt
// wybuchnie w runtime jako rzecz zupełnie z innej zmiany. Asercja mieszka po
// stronie powłoki, bo to ona wolno importować kontrakty, a nie odwrotnie, i
// łapie rozejście także od drugiej strony: po skasowaniu celu z rejestru
// nawigacji.
export type HumanRecordInspectorSurface =
  | "tasks"
  | "projects"
  // TRZY NAZWY ZAMIAST JEDNEJ OD LOTU D3 — Biblioteka rozwinęła się na trzy
  // pozycje nawigacji, więc pięć rodzajów rekordu, które dotąd celowały w jeden
  // napis „library", musi teraz powiedzieć, KTÓRY z trzech ekranów je pokazuje.
  // Ta zmiana jest przez kompilator WYMUSZONA dla rodzajów wyszukiwalnych,
  // z powodu opisanego w akapicie wyżej, i to jest ten sam mechanizm, który
  // złapał `history` przy poprzednim wycofaniu.
  | "notes"
  | "sources"
  | "captures"
  | "meetings"
  | "organizations"
  | "people"
  | "pipeline"
  | "renewals";

export type HumanRecordSearchSource =
  "task" | "project" | "capture" | "source" | "document" | "strategic";

interface SearchableHumanRecordKindDescriptor {
  readonly id: string;
  readonly label: string;
  readonly searchable: true;
  readonly searchSource: HumanRecordSearchSource;
  readonly inspectorSurface: HumanRecordInspectorSurface;
}

interface LocalHumanRecordKindDescriptor {
  readonly id: string;
  readonly label: string;
  readonly searchable: false;
  readonly searchSource: null;
  readonly inspectorSurface: HumanRecordInspectorSurface;
}

export type HumanRecordKindDescriptor =
  SearchableHumanRecordKindDescriptor | LocalHumanRecordKindDescriptor;

// Labels are what a person reads: ⌘K results, the strategic ledger and the
// inspector all take the kind name from here, so a raw contract identifier
// never reaches a screen. `initiative`, `work_link` and `saved_view` used to
// carry their own identifier as a label — invisible only because nothing
// searchable rendered them.
// Product-level discovery metadata only. Domain unions and mutation receipt
// kinds remain explicit because they carry different invariants (ADR-065).
export const humanRecordKindRegistry = [
  {
    id: "task",
    label: "Task",
    searchable: true,
    searchSource: "task",
    inspectorSurface: "tasks",
  },
  {
    id: "project",
    label: "Project",
    searchable: true,
    searchSource: "project",
    inspectorSurface: "projects",
  },
  {
    id: "capture",
    label: "Capture",
    searchable: true,
    searchSource: "capture",
    // Wrzutka otwiera się na Historii wrzutek — od lotu D3 znowu na WŁASNEJ
    // powierzchni. Poprzednia wersja tej noty ostrzegała, że samo przepięcie
    // linii nie wystarcza, bo gałąź routingu wyszukiwania w `RealApp.tsx` musi
    // dosłać żądany odczyt razem z celem, inaczej wrzutka ląduje na Notatkach.
    // TO OSTRZEŻENIE PRZESTAŁO OBOWIĄZYWAĆ i dlatego jest tu zapisane jako
    // zamknięte: cel niesie dziś rodzaj sam, więc nie ma czego dosyłać.
    inspectorSurface: "captures",
  },
  {
    id: "source",
    label: "Source",
    searchable: true,
    searchSource: "source",
    inspectorSurface: "sources",
  },
  {
    id: "note",
    label: "Note",
    searchable: true,
    searchSource: "document",
    inspectorSurface: "notes",
  },
  {
    id: "document",
    label: "Document",
    searchable: true,
    searchSource: "document",
    inspectorSurface: "notes",
  },
  {
    id: "deliverable",
    label: "Deliverable",
    searchable: true,
    searchSource: "document",
    inspectorSurface: "notes",
  },
  {
    id: "organization",
    label: "Organization",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "organizations",
  },
  {
    // Osoba otwiera się na swoim własnym ekranie. Przepięcie tego pola bez
    // gałęzi routingu w `RealApp.tsx` kompiluje się, przechodzi każdy test
    // i po cichu zamienia „otwórz tę osobę" na „otwórz ekran Ludzie" — obie
    // połowy zmieniają się razem albo żadna.
    id: "person",
    label: "Person",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "people",
  },
  {
    id: "opportunity",
    label: "Opportunity",
    searchable: true,
    searchSource: "strategic",
    // Deal ma teraz własny ekran — repoint jedzie PARĄ z gałęzią routingu
    // wyszukiwania w `RealApp.tsx`. Sam repoint kompiluje się, przechodzi
    // wszystkie testy i po cichu zamienia „otwórz tę szansę" na „otwórz Lejek".
    inspectorSurface: "pipeline",
  },
  {
    id: "offer",
    label: "Offer",
    searchable: true,
    searchSource: "strategic",
    // Oferta idzie tam, gdzie jest widoczna: arkusz oferty stoi na karcie
    // szansy, a nie w kolekcji. Ten sam warunek co wyżej — obie połówki albo
    // żadna.
    inspectorSurface: "pipeline",
  },
  {
    id: "renewal",
    label: "Renewal",
    searchable: true,
    searchSource: "strategic",
    // Repointed with the Renewals screen, and ONLY with it: the renderer's
    // search routing ends in a generic `else` that opens the destination and
    // loses the record, so this line and `RealApp.tsx`'s `renewals` branch
    // change together or neither does.
    inspectorSurface: "renewals",
  },
  {
    id: "relationship_fact",
    label: "Relationship fact",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "organizations",
  },
  {
    id: "fact",
    label: "Fact",
    searchable: false,
    searchSource: null,
    inspectorSurface: "organizations",
  },
  {
    id: "decision",
    label: "Decision",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "organizations",
  },
  {
    id: "impact_review",
    label: "Impact review",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "organizations",
  },
  {
    id: "area",
    label: "Area",
    searchable: true,
    searchSource: "strategic",
    // Zmiana zachowania, świadoma: Obszar to kontekst PRACY, nie klient.
    // Wskazywał na Relacje, bo tam kiedyś leżały wszystkie rekordy
    // strategiczne; od przeniesienia Obszarów i Inicjatyw na ekran Projektów
    // wyszukiwanie prowadziło jedyny rodzaj tej pary w inne miejsce niż
    // drugi. To jedyny z czterech, który da się wyszukać, więc jedyny, który
    // ktoś mógł zobaczyć trafiającego nie tam.
    inspectorSurface: "projects",
  },
  {
    id: "initiative",
    label: "Initiative",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "projects",
  },
  {
    id: "work_link",
    label: "Work link",
    searchable: false,
    searchSource: null,
    inspectorSurface: "projects",
  },
  {
    id: "saved_view",
    label: "Saved view",
    searchable: false,
    searchSource: null,
    // Zapisany widok otwiera się NA Zadaniach — to soczewka nad tą kolekcją,
    // a nie osobny ekran.
    inspectorSurface: "tasks",
  },
  {
    id: "recurrence",
    label: "Recurrence",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "organizations",
  },
  {
    id: "radar_candidate",
    label: "Knowledge radar",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "organizations",
  },
  {
    id: "meeting",
    label: "Meeting",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "meetings",
  },
  {
    id: "commitment",
    label: "Commitment",
    searchable: false,
    searchSource: null,
    inspectorSurface: "meetings",
  },
] as const satisfies readonly HumanRecordKindDescriptor[];

type RegistryEntry = (typeof humanRecordKindRegistry)[number];
export type HumanRecordKind = RegistryEntry["id"];
export type GlobalSearchRecordKind = Extract<
  RegistryEntry,
  { readonly searchable: true }
>["id"];

export const globalSearchRecordKindIds: readonly GlobalSearchRecordKind[] =
  humanRecordKindRegistry.flatMap((descriptor) =>
    descriptor.searchable ? [descriptor.id] : [],
  );

const [firstGlobalSearchRecordKind, ...remainingGlobalSearchRecordKinds] =
  globalSearchRecordKindIds;
if (firstGlobalSearchRecordKind === undefined) {
  throw new Error("The global-search record registry must not be empty.");
}

export const GlobalSearchRecordKindSchema = z.enum([
  firstGlobalSearchRecordKind,
  ...remainingGlobalSearchRecordKinds,
]);

const descriptorsById = new Map<HumanRecordKind, HumanRecordKindDescriptor>(
  humanRecordKindRegistry.map((descriptor) => [descriptor.id, descriptor]),
);

export const getHumanRecordKindDescriptor = (
  kind: HumanRecordKind,
): HumanRecordKindDescriptor => {
  const descriptor = descriptorsById.get(kind);
  if (descriptor === undefined) {
    throw new Error(`Unknown human record kind: ${kind}`);
  }
  return descriptor;
};

const searchableKinds = new Set<string>(globalSearchRecordKindIds);
export const isGlobalSearchRecordKind = (
  value: unknown,
): value is GlobalSearchRecordKind =>
  typeof value === "string" && searchableKinds.has(value);
