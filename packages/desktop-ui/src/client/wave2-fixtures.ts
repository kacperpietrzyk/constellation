import type { DesktopSnapshot } from "./workflow.js";

export type SurfaceId =
  | "cockpit"
  | "tasks"
  | "projects"
  | "history"
  | "activity"
  | "attention"
  | "access"
  | "documents";

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
  readonly group: "Praca" | "Wiedza" | "Capture";
  readonly kind: "Projekt" | "Zadanie" | "Notatka" | "Capture";
  readonly title: string;
  readonly detail: string;
  readonly surface: SurfaceId;
}

export const projects: readonly ProjectFixture[] = [
  {
    id: "project-offer",
    title: "Oferta Northstar",
    outcome: "Oferta gotowa do decyzji handlowej",
    state: "Weryfikacja",
    nextAction: "Domknij model cenowy",
    deadline: "Piątek 11:00",
    risk: "Brak cennika dystrybutora blokuje finalny wariant.",
    taskTitles: [
      "Uzupełnij model cenowy",
      "Zsyntetyzuj wywiady kwalifikacyjne",
      "Wyślij poprawione warunki",
    ],
  },
  {
    id: "project-alpha",
    title: "Interactive alpha",
    outcome: "Lokalna wersja Capture → Task gotowa do codziennego użycia",
    state: "W realizacji",
    nextAction: "Podłączyć trwały adapter",
    deadline: "Ten tydzień",
    taskTitles: ["Sprawdź recovery", "Zweryfikuj build Windows"],
  },
] as const;

export const activity: readonly ActivityFixture[] = [
  {
    id: "activity-1",
    actor: "human",
    title: "Kacper powiązał zadanie z projektem",
    detail: "Oferta Northstar · 2 powiązania",
    time: "10:42",
    reversible: true,
    command: "record.relate",
    version: "v18 → v19",
  },
  {
    id: "activity-2",
    actor: "agent",
    title: "Research Partner dodał 3 źródła",
    detail: "run 7F31 · zakres tylko Space Praca",
    time: "10:31",
    reversible: true,
    command: "source.attach",
    version: "v7 → v10",
  },
  {
    id: "activity-3",
    actor: "import",
    title: "Import Jamie utworzył zobowiązanie",
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
    group: "Praca",
    kind: "Projekt",
    title: "Oferta Northstar",
    detail: "Następnie: domknij model cenowy",
    surface: "projects",
  },
  {
    id: "search-task",
    group: "Praca",
    kind: "Zadanie",
    title: "Wyślij warunki Northstar",
    detail: "Jutro · Oferta Northstar",
    surface: "tasks",
  },
  {
    id: "search-note",
    group: "Wiedza",
    kind: "Notatka",
    title: "Notatka z wywiadu Northstar",
    detail: "„…zakres odpowiedzialności oferty…”",
    surface: "projects",
  },
  {
    id: "search-capture",
    group: "Capture",
    kind: "Capture",
    title: "Sprawdź warunki odnowienia",
    detail: "Oryginał · iPhone · 09:18",
    surface: "history",
  },
] as const;

export const buildSearchFixtures = (
  snapshot: DesktopSnapshot,
): readonly SearchFixture[] => [
  ...snapshot.tasks.map((task) => ({
    id: task.id,
    group: "Praca" as const,
    kind: "Zadanie" as const,
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
        ? "Przetworzone jako zadanie"
        : "Oczekuje na decyzję",
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
    title: "Pracujesz offline",
    detail:
      "Lokalne dane są dostępne. Zmiany czekają bezpiecznie na połączenie.",
    action: "Pokaż kolejkę",
    tone: "info",
  },
  retry: {
    title: "Store jest chwilowo zajęty",
    detail: "Nic nie zapisano częściowo. Możesz bezpiecznie ponowić operację.",
    action: "Ponów teraz",
    tone: "warning",
  },
  partial: {
    title: "Widok jest częściowy",
    detail:
      "Zadania i projekty są gotowe; indeks Capture nadal się odbudowuje.",
    action: "Zobacz postęp",
    tone: "warning",
  },
  conflict: {
    title: "Dwie wersje wymagają decyzji",
    detail:
      "Nowsza wersja została zachowana. Twoja zmiana nie została nadpisana.",
    action: "Porównaj wersje",
    tone: "error",
  },
  permission: {
    title: "Zakres dostępu uległ zmianie",
    detail: "Niedostępne wyniki usunięto z widoku i lokalnego indeksu.",
    action: "Pokaż politykę",
    tone: "error",
  },
  recovery: {
    title: "Workspace otwarto z ostatniego checkpointu",
    detail: "Odzyskano 18 zmian. Jedna operacja oczekuje na ponowienie.",
    action: "Otwórz recovery",
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
