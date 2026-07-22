import { useMemo, useState } from "react";

import type { RendererCommandResponse } from "@constellation/desktop-preload/client";

import { WorkSurface } from "../WorkSurface.js";
import { createScenarioClient } from "../client/scenario-client.js";
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
  status2: "00000000-0000-4000-8000-000000000414",
  segmentField: "00000000-0000-4000-8000-000000000415",
  view2: "00000000-0000-4000-8000-000000000416",
  status3: "00000000-0000-4000-8000-000000000417",
  view3: "00000000-0000-4000-8000-000000000418",
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
      {
        id: ids.status2,
        label: "W przeglądzie",
        operationalSemantics: "waiting",
        position: 1,
        version: 1,
      },
      {
        id: ids.status3,
        label: "Gotowe",
        operationalSemantics: "actionable",
        position: 2,
        version: 1,
      },
    ],
    fieldDefinitions: [
      {
        id: ids.segmentField,
        targetKind: "task",
        label: "Segment",
        type: { kind: "choice", options: ["MSSP", "Enterprise"] },
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
          statusId: ids.status2,
          operationalState: "waiting",
          waitingOn: {
            kind: "person",
            label: "Kacper · decyzja o nazewnictwie",
          },
          startAt: "2026-07-16T06:00:00.000Z",
          dueAt: "2026-07-22T21:59:59.999Z",
          completionState: "open",
          fields: {
            [ids.segmentField]: { kind: "choice", value: "MSSP" },
          },
          version: 2,
          updatedAt: now,
        },
        {
          id: ids.task3,
          title: "Sprawdzić migrację SQLCipher",
          statusId: ids.status,
          operationalState: "blocked",
          completionState: "open",
          version: 1,
          updatedAt: now,
        },
        {
          id: ids.task1,
          title: "Dowieźć ekran Praca",
          statusId: ids.status,
          operationalState: "actionable",
          completionState: "open",
          dueAt: "2026-07-25T21:59:59.999Z",
          fields: {
            [ids.segmentField]: { kind: "choice", value: "MSSP" },
          },
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
        {
          id: ids.view2,
          name: "Segment MSSP",
          filters: {
            fields: [
              {
                fieldId: ids.segmentField,
                predicate: { kind: "choice_is", option: "MSSP" },
              },
            ],
          },
          sort: "updated_desc",
          groupBy: "status",
          layout: "board",
          state: "active",
          version: 1,
        },
        {
          id: ids.view3,
          name: "Plan wdrożenia",
          filters: {},
          sort: "updated_desc",
          layout: "timeline",
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

const commandResult = (
  commandId: string,
  savedViewId: string,
  version: number,
): RendererCommandResponse =>
  ({
    kind: "command_outcome",
    outcome: {
      contractVersion: 1,
      commandId,
      kernelTime: now,
      outcome: "success",
      replayed: false,
      recordVersions: { [savedViewId]: version },
      changedFields: ["layout"],
      diagnosticCode: "savedView.updated",
      projection: {
        kind: "strategic.record_changed",
        recordKind: "saved_view",
        id: savedViewId,
        version,
      },
    },
  }) as unknown as RendererCommandResponse;

if (workHarnessSnapshot.work.kind !== "ready") {
  throw new Error("Work harness requires a ready projection.");
}
const baseWork = workHarnessSnapshot.work.data;

export const WorkHarness = () => {
  const [layout, setLayout] = useState<"list" | "board" | "timeline">("board");
  const snapshot = useMemo(
    () =>
      ({
        ...workHarnessSnapshot,
        work: {
          ...workHarnessSnapshot.work,
          data: {
            ...baseWork,
            savedViews: baseWork.savedViews.map((view) =>
              view.id === ids.view2
                ? {
                    ...view,
                    layout,
                    version: layout === "board" ? 1 : layout === "list" ? 2 : 3,
                  }
                : view,
            ),
          },
        },
      }) as unknown as DesktopSnapshot,
    [layout],
  );
  const client = useMemo(
    () =>
      createScenarioClient({
        queries: {},
        executeCommand: (command) => {
          if (
            command.commandName === "savedView.update" &&
            command.payload.savedViewId === ids.view2 &&
            command.payload.layout !== undefined
          ) {
            setLayout(command.payload.layout);
            return commandResult(
              command.commandId,
              command.payload.savedViewId,
              command.payload.layout === "board"
                ? 1
                : command.payload.layout === "list"
                  ? 2
                  : 3,
            );
          }
          return {
            kind: "contract_rejected",
            diagnosticCode: "contract.invalid",
            issues: [],
          } as RendererCommandResponse;
        },
      }),
    [],
  );
  return (
    <main className="app-shell" data-testid="work-harness">
      <WorkSurface
        client={client}
        snapshot={snapshot}
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
};
