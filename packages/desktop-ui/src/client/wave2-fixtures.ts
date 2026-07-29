import type { DesktopSnapshot } from "./workflow.js";
import type { DesktopSurface } from "@constellation/desktop-preload/client";

export type SurfaceId = DesktopSurface;

export type PreviewCondition =
  | "ready"
  | "offline"
  | "retry"
  | "partial"
  | "conflict"
  | "permission"
  | "recovery";

export interface ProjectFixture {
  readonly id: string;
  readonly title: string;
  readonly outcome: string;
  readonly state: string;
  readonly nextAction: string;
  readonly deadline: string;
  readonly risk?: string;
  readonly taskTitles: readonly string[];
}

export interface ActivityFixture {
  readonly id: string;
  readonly actor: "human" | "agent" | "import";
  readonly title: string;
  readonly detail: string;
  readonly time: string;
  readonly reversible: boolean;
  readonly command: string;
  readonly version: string;
}

export interface SearchFixture {
  readonly id: string;
  readonly group: "Work" | "Knowledge" | "Capture";
  readonly kind: "Project" | "Task" | "Note" | "Capture";
  readonly title: string;
  readonly detail: string;
  readonly surface: SurfaceId;
}

export const projects: readonly ProjectFixture[] = [
  {
    id: "project-offer",
    title: "Northstar offer",
    outcome: "Offer ready for a commercial decision",
    state: "Review",
    nextAction: "Close the pricing model",
    deadline: "Friday 11:00",
    risk: "A missing distributor price list blocks the final variant.",
    taskTitles: [
      "Fill in the pricing model",
      "Synthesize the qualification interviews",
      "Send the revised terms",
    ],
  },
  {
    id: "project-alpha",
    title: "Interactive alpha",
    outcome: "Local Capture → Task flow ready for daily use",
    state: "In progress",
    nextAction: "Connect the durable adapter",
    deadline: "This week",
    taskTitles: ["Check recovery", "Verify the Windows build"],
  },
] as const;

export const activity: readonly ActivityFixture[] = [
  {
    id: "activity-1",
    actor: "human",
    title: "Kacper linked a task to a project",
    detail: "Northstar offer · 2 links",
    time: "10:42",
    reversible: true,
    command: "record.relate",
    version: "v18 → v19",
  },
  {
    id: "activity-2",
    actor: "agent",
    title: "Research Partner added 3 sources",
    detail: "run 7F31 · scoped to the Praca Space",
    time: "10:31",
    reversible: true,
    command: "source.attach",
    version: "v7 → v10",
  },
  {
    id: "activity-3",
    actor: "import",
    title: "Jamie import created a commitment",
    detail: "meeting_884 · exact match",
    time: "09:58",
    reversible: false,
    command: "meeting.import",
    version: "v1",
  },
] as const;

const baseSearch: readonly SearchFixture[] = [
  {
    id: "search-project",
    group: "Work",
    kind: "Project",
    title: "Northstar offer",
    detail: "Next: close the pricing model",
    surface: "projects",
  },
  {
    id: "search-task",
    group: "Work",
    kind: "Task",
    title: "Send the Northstar terms",
    detail: "Tomorrow · Northstar offer",
    surface: "tasks",
  },
  {
    id: "search-note",
    group: "Knowledge",
    kind: "Note",
    title: "Northstar interview note",
    detail: "“…the offer's scope of responsibility…”",
    surface: "projects",
  },
  {
    id: "search-capture",
    group: "Capture",
    kind: "Capture",
    title: "Check the renewal terms",
    detail: "Original · iPhone · 09:18",
    surface: "history",
  },
] as const;

export const buildSearchFixtures = (
  snapshot: DesktopSnapshot,
): readonly SearchFixture[] => [
  ...snapshot.tasks.map((task) => ({
    id: task.id,
    group: "Work" as const,
    kind: "Task" as const,
    title: task.title,
    detail: `${task.status.label} · ${snapshot.bootstrap.workspace.name}`,
    surface: "tasks" as const,
  })),
  ...snapshot.captures.map((capture) => ({
    id: capture.id,
    group: "Capture" as const,
    kind: "Capture" as const,
    title: capture.originalText,
    detail:
      capture.processingState === "routed_as_task"
        ? "Processed as a task"
        : "Awaiting a decision",
    surface: "history" as const,
  })),
  ...baseSearch,
];

export const conditionCopy: Record<
  Exclude<PreviewCondition, "ready">,
  {
    readonly title: string;
    readonly detail: string;
    readonly action: string;
    readonly tone: "warning" | "error" | "info";
  }
> = {
  offline: {
    title: "You are offline",
    detail: "Local data is available. Changes wait safely for a connection.",
    action: "Show queue",
    tone: "info",
  },
  retry: {
    title: "The store is busy right now",
    detail: "Nothing was half-saved. You can safely retry.",
    action: "Retry now",
    tone: "warning",
  },
  partial: {
    title: "This view is partial",
    detail:
      "Tasks and projects are ready; the Capture index is still rebuilding.",
    action: "See progress",
    tone: "warning",
  },
  conflict: {
    title: "Two versions need a decision",
    detail: "The newer version was kept. Your change was not overwritten.",
    action: "Compare versions",
    tone: "error",
  },
  permission: {
    title: "The access scope changed",
    detail:
      "Results out of reach were removed from the view and the local index.",
    action: "Show policy",
    tone: "error",
  },
  recovery: {
    title: "Workspace opened from the last checkpoint",
    detail: "18 changes recovered. One operation is waiting to be retried.",
    action: "Open recovery",
    tone: "info",
  },
};

export const contractRequests = [
  "project.list + project.operationalOverview",
  "project.create + project.updateOutcome",
  "record.relate + record.unrelate",
  "task.setStatus + task.complete + task.reopen",
  "search.global",
  "cockpit.week",
  "activity.meaningful",
  "command.previewUndo + command.undo",
  "recovery.preview",
] as const;
