import { z } from "zod";

// Powierzchnia, na której rekord tego rodzaju otwiera się do obejrzenia.
// Wartości są identyfikatorami celów nawigacji z przebudowy 0.2.0 — ta unia
// musi z nimi zostać zgodna, ale świadomie jej NIE importujemy z paczki
// desktopowej: kontrakty nie mają zależeć od powłoki, a agent czyta ten katalog
// bez uruchomionej aplikacji.
export type HumanRecordInspectorSurface =
  | "tasks"
  | "projects"
  | "history"
  | "library"
  | "meetings"
  | "organizations"
  | "people";

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
    inspectorSurface: "history",
  },
  {
    id: "source",
    label: "Source",
    searchable: true,
    searchSource: "source",
    inspectorSurface: "library",
  },
  {
    id: "note",
    label: "Note",
    searchable: true,
    searchSource: "document",
    inspectorSurface: "library",
  },
  {
    id: "document",
    label: "Document",
    searchable: true,
    searchSource: "document",
    inspectorSurface: "library",
  },
  {
    id: "deliverable",
    label: "Deliverable",
    searchable: true,
    searchSource: "document",
    inspectorSurface: "library",
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
    inspectorSurface: "organizations",
  },
  {
    id: "offer",
    label: "Offer",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "organizations",
  },
  {
    id: "renewal",
    label: "Renewal",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "organizations",
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
    searchable: false,
    searchSource: null,
    // Obszary i inicjatywy mieszkają na ekranie Projektów: projekt jest
    // jedyną rzeczą, którą się pod nie podpina.
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
