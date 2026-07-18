import { WorkSurface } from "../WorkSurface.js";
import type { DesktopSnapshot } from "../client/workflow.js";

const ids = {
  workspace: "00000000-0000-4000-8000-000000000401",
  space: "00000000-0000-4000-8000-000000000402",
  status: "00000000-0000-4000-8000-000000000403",
  principal: "00000000-0000-4000-8000-000000000404",
  area: "00000000-0000-4000-8000-000000000405",
  initiative: "00000000-0000-4000-8000-000000000406",
  project: "00000000-0000-4000-8000-000000000407",
  task1: "00000000-0000-4000-8000-000000000408",
  task2: "00000000-0000-4000-8000-000000000409",
  task3: "00000000-0000-4000-8000-000000000410",
  link1: "00000000-0000-4000-8000-000000000411",
  link2: "00000000-0000-4000-8000-000000000412",
  view: "00000000-0000-4000-8000-000000000413",
} as const;

const now = "2026-07-15T10:00:00.000Z";

export const workHarnessSnapshot = {
  build: {
    channel: "developer-preview",
    startupRecovery: "none",
    workspaceAvailability: "ready",
    initialWorkspaceId: ids.workspace,
    persistence: "in-memory",
    version: "preview",
  },
  bootstrap: {
    kind: "workspace.bootstrapContext",
    workspace: {
      id: ids.workspace,
      name: "Constellation",
      timezone: "Europe/Warsaw",
      defaultTaskStatusId: ids.status,
      version: 1,
    },
    spaces: [{ id: ids.space, name: "Personal", version: 1 }],
    taskStatuses: [
      {
        id: ids.status,
        label: "Open",
        operationalSemantics: "actionable",
        position: 0,
        version: 1,
      },
    ],
  },
  captures: [],
  tasks: [],
  projects: { kind: "ready", data: { kind: "project.list", items: [] } },
  work: {
    kind: "ready",
    data: {
      kind: "work.overview",
      tasks: [
        {
          id: ids.task2,
          title: "Zatwierdzić model treści",
          operationalState: "waiting",
          waitingOn: {
            kind: "person",
            label: "Kacper · decyzja o nazewnictwie",
          },
          completionState: "open",
          version: 2,
          updatedAt: now,
        },
        {
          id: ids.task3,
          title: "Sprawdzić migrację SQLCipher",
          operationalState: "blocked",
          completionState: "open",
          version: 1,
          updatedAt: now,
        },
        {
          id: ids.task1,
          title: "Dowieźć ekran Praca",
          operationalState: "actionable",
          completionState: "open",
          version: 1,
          updatedAt: now,
        },
      ],
      projects: [
        {
          id: ids.project,
          title: "Domknięcie aplikacji",
          intendedOutcome:
            "Główne powierzchnie są operacyjne i spójne z roadmapą",
          lifecycle: "active",
          version: 1,
        },
      ],
      areas: [
        {
          id: ids.area,
          title: "Produkt Constellation",
          responsibility:
            "Utrzymywać użyteczny, bezpieczny i możliwy do migracji system pracy",
          state: "active",
          version: 1,
        },
      ],
      initiatives: [
        {
          id: ids.initiative,
          title: "Interaktywna alfa",
          intendedOutcome: "Przepracować pełny tydzień na rzeczywistych danych",
          state: "active",
          version: 1,
        },
      ],
      links: [
        {
          id: ids.link1,
          linkType: "project_advances_initiative",
          sourceRecordId: ids.project,
          targetRecordId: ids.initiative,
          state: "active",
          version: 1,
        },
        {
          id: ids.link2,
          linkType: "task_depends_on_task",
          sourceRecordId: ids.task3,
          targetRecordId: ids.task2,
          state: "active",
          version: 1,
        },
      ],
      savedViews: [
        {
          id: ids.view,
          name: "Czekam na",
          filters: { operationalStates: ["waiting"] },
          sort: "updated_desc",
          state: "active",
          version: 1,
        },
      ],
      freshness: {
        mode: "local_authoritative",
        checkpoint: null,
        missingCapabilities: [],
      },
    },
  },
  cockpit: { kind: "unavailable", message: "Scenario" },
  activity: { kind: "unavailable", message: "Scenario" },
  access: { kind: "unavailable", message: "Scenario" },
  agentAccess: { kind: "unavailable", message: "Scenario" },
  assignmentCandidates: { kind: "unavailable", message: "Scenario" },
  mentionCandidates: { kind: "unavailable", message: "Scenario" },
  attention: { kind: "unavailable", message: "Scenario" },
  documents: { kind: "unavailable", message: "Scenario" },
  knowledge: { kind: "unavailable", message: "Scenario" },
  relationships: { kind: "unavailable", message: "Scenario" },
  radar: { kind: "unavailable", message: "Scenario" },
} as unknown as DesktopSnapshot;

export const WorkHarness = () => (
  <main className="app-shell" data-testid="work-harness">
    <WorkSurface
      client={undefined}
      snapshot={workHarnessSnapshot}
      selectedTaskId={undefined}
      selectedProjectId={undefined}
      selectedContextId={undefined}
      onSelectTask={() => undefined}
      onOpenTask={() => undefined}
      onSelectProject={() => undefined}
      onSelectContext={() => undefined}
      onReload={async () => undefined}
      onFailure={() => undefined}
    />
  </main>
);
