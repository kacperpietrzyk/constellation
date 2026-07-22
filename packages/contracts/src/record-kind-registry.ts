import { z } from "zod";

export type HumanRecordInspectorSurface =
  | "work"
  | "tasks"
  | "projects"
  | "history"
  | "documents"
  | "meetings"
  | "relationships";

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

// Product-level discovery metadata only. Domain unions and mutation receipt
// kinds remain explicit because they carry different invariants (ADR-065).
export const humanRecordKindRegistry = [
  {
    id: "task",
    label: "Zadanie",
    searchable: true,
    searchSource: "task",
    inspectorSurface: "tasks",
  },
  {
    id: "project",
    label: "Projekt",
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
    label: "Źródło",
    searchable: true,
    searchSource: "source",
    inspectorSurface: "documents",
  },
  {
    id: "note",
    label: "Notatka",
    searchable: true,
    searchSource: "document",
    inspectorSurface: "documents",
  },
  {
    id: "document",
    label: "Dokument",
    searchable: true,
    searchSource: "document",
    inspectorSurface: "documents",
  },
  {
    id: "deliverable",
    label: "Rezultat",
    searchable: true,
    searchSource: "document",
    inspectorSurface: "documents",
  },
  {
    id: "organization",
    label: "Organizacja",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "relationships",
  },
  {
    id: "person",
    label: "Osoba",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "relationships",
  },
  {
    id: "opportunity",
    label: "Szansa",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "relationships",
  },
  {
    id: "offer",
    label: "Oferta",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "relationships",
  },
  {
    id: "renewal",
    label: "Odnowienie",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "relationships",
  },
  {
    id: "relationship_fact",
    label: "Fakt relacji",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "relationships",
  },
  {
    id: "fact",
    label: "Fakt",
    searchable: false,
    searchSource: null,
    inspectorSurface: "relationships",
  },
  {
    id: "decision",
    label: "Decyzja",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "relationships",
  },
  {
    id: "impact_review",
    label: "Przegląd skutków",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "relationships",
  },
  {
    id: "area",
    label: "Obszar",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "relationships",
  },
  {
    id: "initiative",
    label: "initiative",
    searchable: false,
    searchSource: null,
    inspectorSurface: "work",
  },
  {
    id: "work_link",
    label: "work_link",
    searchable: false,
    searchSource: null,
    inspectorSurface: "work",
  },
  {
    id: "saved_view",
    label: "saved_view",
    searchable: false,
    searchSource: null,
    inspectorSurface: "work",
  },
  {
    id: "recurrence",
    label: "Cykl",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "relationships",
  },
  {
    id: "radar_candidate",
    label: "Radar wiedzy",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "relationships",
  },
  {
    id: "meeting",
    label: "Spotkanie",
    searchable: true,
    searchSource: "strategic",
    inspectorSurface: "meetings",
  },
  {
    id: "commitment",
    label: "Zobowiązanie",
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
