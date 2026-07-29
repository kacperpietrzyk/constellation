/// <reference types="node" />

import {
  QueryIdSchema,
  SpaceIdSchema,
  TaskStatusIdSchema,
  WorkspaceIdSchema,
} from "@constellation/contracts";
import type { RendererQueryResponse } from "@constellation/desktop-preload/client";

// Jeden kształt zaślepionego workspace'u dla OBU zestawów, które montują
// powłokę: `surface-registry-render` (node:test, renderToStaticMarkup) i
// `shell-navigation.interaction` (Vitest, happy-dom). Dwie kopie tego samego
// fixture'u rozjechałyby się przy pierwszej zmianie kontraktu, a wtedy jeden
// z zestawów świeciłby na zielono na kształcie, którego już nie ma —
// to ta sama rodzina co `restated-shape-drift`.

export const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000001",
);
export const spaceId = SpaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000002",
);
export const statusId = TaskStatusIdSchema.parse(
  "00000000-0000-4000-8000-000000000003",
);
export const queryId = QueryIdSchema.parse(
  "00000000-0000-4000-8000-000000000004",
);

export const projectionResponse = (projection: object): RendererQueryResponse =>
  ({
    kind: "query_result",
    result: {
      contractVersion: 1,
      queryId,
      kernelTime: "2026-07-13T12:00:00.000Z",
      outcome: "success",
      projection,
      freshness: {
        mode: "local_authoritative",
        checkpoint: null,
        missingCapabilities: [],
      },
    },
  }) as RendererQueryResponse;

// Tylko trzy projekcje są wymagane do otwarcia snapshotu; reszta degraduje się
// do stanu „dane niedostępne" i każda powierzchnia musi mimo to coś
// wyrenderować. Ten wariant jest celowo najuboższy z możliwych — jeśli
// destynacja umie narysować się tylko przy pełnych danych, to jest defekt
// powierzchni, nie testu.
export const shellQueries = {
  "workspace.bootstrapContext": projectionResponse({
    kind: "workspace.bootstrapContext",
    workspace: {
      id: workspaceId,
      name: "Workspace",
      timezone: "Europe/Warsaw",
      defaultTaskStatusId: statusId,
      version: 1,
    },
    spaces: [{ id: spaceId, name: "Space", version: 1 }],
    taskStatuses: [
      {
        id: statusId,
        label: "status",
        operationalSemantics: "actionable",
        position: 0,
        version: 1,
      },
    ],
  }),
  "task.list": projectionResponse({
    kind: "task.list",
    items: [],
    nextCursor: null,
  }),
  "capture.history": projectionResponse({
    kind: "capture.history",
    items: [],
    nextCursor: null,
  }),
};
