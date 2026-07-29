import type { ActivityProjection } from "./client/workflow.js";

export type ActivityItem = ActivityProjection["items"][number];

export type ActivityCategory =
  "all" | "capture" | "work" | "collaboration" | "knowledge" | "recovery";

export type ActivityItemCategory = Exclude<ActivityCategory, "all">;

export const activityCategoryDefinitions: readonly {
  readonly id: ActivityCategory;
  readonly label: string;
}[] = [
  { id: "all", label: "All changes" },
  { id: "work", label: "Work" },
  { id: "capture", label: "Capture" },
  { id: "collaboration", label: "Collaboration" },
  { id: "knowledge", label: "Knowledge" },
  { id: "recovery", label: "Recovery" },
];

export const activityLabels: Record<ActivityItem["activityType"], string> = {
  capture_routed: "Turned a Capture into a task",
  capture_transcript_ready: "Saved a voice note transcript",
  project_created: "Created a project",
  project_outcome_changed: "Changed a project's intended outcome",
  task_created: "Created a task",
  task_details_updated: "Changed a task's details",
  task_parent_changed: "Changed the subtask structure",
  task_status_definition_created: "Created a task status definition",
  field_definition_created: "Created a field",
  field_definition_changed: "Changed a field definition",
  record_field_value_set: "Changed a field value",
  template_definition_created: "Created a project template",
  template_definition_changed: "Changed a project template",
  project_template_applied: "Applied a template to a project",
  automation_rule_created: "Created an automation rule",
  automation_rule_changed: "Changed an automation rule",
  automation_swept: "Automation checked the waiting deadlines",
  task_status_definition_changed: "Changed a task status definition",
  workspace_default_status_changed: "Changed the default task status",
  task_completed: "Completed a task",
  task_reopened: "Reopened a task",
  task_assigned: "Assigned a task",
  task_unassigned: "Unassigned a task",
  comment_added: "Added a comment",
  comment_resolved: "Resolved a comment thread",
  comment_reopened: "Reopened a comment thread",
  relation_added: "Linked a task to a project",
  relation_removed: "Removed a link",
  knowledge_source_created: "Saved a knowledge source",
  knowledge_source_updated: "Updated a knowledge source",
  knowledge_evidence_updated: "Changed a document's evidence",
  knowledge_named_version_created: "Froze a named version",
  knowledge_named_version_voided: "Voided a named version",
  strategic_record_changed: "Changed a strategic record",
  command_undone: "Undid a command",
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
  template_definition_created: "work",
  template_definition_changed: "work",
  project_template_applied: "work",
  automation_rule_created: "work",
  automation_rule_changed: "work",
  automation_swept: "work",
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
    ?.label ?? "Change";

export const activityCategoryMark: Record<ActivityItemCategory, string> = {
  capture: "C",
  work: "W",
  collaboration: "@",
  knowledge: "K",
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
    return new Intl.DateTimeFormat("en-US", options).format(value);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
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
        ? "Today"
        : key === yesterdayKey
          ? "Yesterday"
          : fullDateLabel(group.date, timeZone),
    items: group.items,
  }));
};
