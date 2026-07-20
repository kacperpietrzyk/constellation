import type { ActivityProjection } from "./client/workflow.js";

export type ActivityItem = ActivityProjection["items"][number];

export type ActivityCategory =
  "all" | "capture" | "work" | "collaboration" | "knowledge" | "recovery";

export type ActivityItemCategory = Exclude<ActivityCategory, "all">;

export const activityCategoryDefinitions: readonly {
  readonly id: ActivityCategory;
  readonly label: string;
}[] = [
  { id: "all", label: "Wszystkie zmiany" },
  { id: "work", label: "Praca" },
  { id: "capture", label: "Capture" },
  { id: "collaboration", label: "Współpraca" },
  { id: "knowledge", label: "Wiedza" },
  { id: "recovery", label: "Odzyskiwanie" },
];

export const activityLabels: Record<ActivityItem["activityType"], string> = {
  capture_routed: "Capture przekształcono w zadanie",
  capture_transcript_ready: "Zapisano transkrypcję notatki głosowej",
  project_created: "Utworzono projekt",
  project_outcome_changed: "Zmieniono zamierzony wynik projektu",
  task_created: "Utworzono zadanie",
  task_details_updated: "Zmieniono treść zadania",
  task_parent_changed: "Zmieniono strukturę podzadań",
  task_status_definition_created: "Utworzono status zadań",
  field_definition_created: "Utworzono pole",
  field_definition_changed: "Zmieniono definicję pola",
  record_field_value_set: "Zmieniono wartość pola",
  task_status_definition_changed: "Zmieniono definicję statusu zadań",
  workspace_default_status_changed: "Zmieniono domyślny status zadań",
  task_completed: "Ukończono zadanie",
  task_reopened: "Ponownie otwarto zadanie",
  task_assigned: "Przypisano odpowiedzialność za zadanie",
  task_unassigned: "Usunięto odpowiedzialność za zadanie",
  comment_added: "Dodano komentarz",
  comment_resolved: "Rozwiązano wątek komentarzy",
  comment_reopened: "Ponownie otwarto wątek komentarzy",
  relation_added: "Powiązano zadanie z projektem",
  relation_removed: "Usunięto powiązanie",
  knowledge_source_created: "Zachowano źródło wiedzy",
  knowledge_source_updated: "Zaktualizowano źródło wiedzy",
  knowledge_evidence_updated: "Zmieniono dowody dokumentu",
  knowledge_named_version_created: "Zamrożono nazwaną wersję",
  knowledge_named_version_voided: "Unieważniono nazwaną wersję",
  strategic_record_changed: "Zmieniono rekord strategiczny",
  command_undone: "Cofnięto polecenie",
};

const categoryByType: Record<
  ActivityItem["activityType"],
  ActivityItemCategory
> = {
  capture_routed: "capture",
  capture_transcript_ready: "capture",
  project_created: "work",
  project_outcome_changed: "work",
  task_created: "work",
  task_details_updated: "work",
  task_parent_changed: "work",
  task_status_definition_created: "work",
  field_definition_created: "work",
  field_definition_changed: "work",
  record_field_value_set: "work",
  task_status_definition_changed: "work",
  workspace_default_status_changed: "work",
  task_completed: "work",
  task_reopened: "work",
  task_assigned: "work",
  task_unassigned: "work",
  comment_added: "collaboration",
  comment_resolved: "collaboration",
  comment_reopened: "collaboration",
  relation_added: "collaboration",
  relation_removed: "collaboration",
  knowledge_source_created: "knowledge",
  knowledge_source_updated: "knowledge",
  knowledge_evidence_updated: "knowledge",
  knowledge_named_version_created: "knowledge",
  knowledge_named_version_voided: "knowledge",
  strategic_record_changed: "work",
  command_undone: "recovery",
};

export const activityCategoryFor = (item: ActivityItem): ActivityItemCategory =>
  categoryByType[item.activityType];

export const activityCategoryLabel = (category: ActivityCategory): string =>
  activityCategoryDefinitions.find((definition) => definition.id === category)
    ?.label ?? "Zmiana";

export const activityCategoryMark: Record<ActivityItemCategory, string> = {
  capture: "C",
  work: "P",
  collaboration: "W",
  knowledge: "Ź",
  recovery: "↶",
};

const normalizeQuery = (value: string): string =>
  value.trim().toLocaleLowerCase("pl-PL");

export const filterActivityItems = (
  items: readonly ActivityItem[],
  category: ActivityCategory,
  query: string,
): readonly ActivityItem[] => {
  const normalizedQuery = normalizeQuery(query);
  return items.filter((item) => {
    if (category !== "all" && activityCategoryFor(item) !== category) {
      return false;
    }
    if (normalizedQuery.length === 0) return true;
    return `${activityLabels[item.activityType]} ${item.recordId}`
      .toLocaleLowerCase("pl-PL")
      .includes(normalizedQuery);
  });
};

const dateParts = (
  value: string | number | Date,
  timeZone?: string,
): { readonly key: string; readonly date: Date } => {
  const date = new Date(value);
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  const parts = formatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return { key: `${part("year")}-${part("month")}-${part("day")}`, date };
};

const fullDateLabel = (value: Date, timeZone?: string): string => {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  };
  try {
    return new Intl.DateTimeFormat("pl-PL", options).format(value);
  } catch {
    return new Intl.DateTimeFormat("pl-PL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(value);
  }
};

export interface ActivityDateGroup {
  readonly key: string;
  readonly label: string;
  readonly items: readonly ActivityItem[];
}

export const groupActivityItems = (
  items: readonly ActivityItem[],
  timeZone?: string,
  now: Date = new Date(),
): readonly ActivityDateGroup[] => {
  const todayKey = dateParts(now, timeZone).key;
  const yesterdayKey = dateParts(
    new Date(now.getTime() - 86_400_000),
    timeZone,
  ).key;
  const groups = new Map<string, { date: Date; items: ActivityItem[] }>();

  for (const item of items) {
    const { key, date } = dateParts(item.occurredAt, timeZone);
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { date, items: [item] });
  }

  return [...groups.entries()].map(([key, group]) => ({
    key,
    label:
      key === todayKey
        ? "Dzisiaj"
        : key === yesterdayKey
          ? "Wczoraj"
          : fullDateLabel(group.date, timeZone),
    items: group.items,
  }));
};
