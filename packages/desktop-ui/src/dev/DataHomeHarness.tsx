import { WorkspaceIdSchema } from "@constellation/contracts";

import { WorkspaceRecovery } from "../WorkspaceRecovery.js";
import { createScenarioClient } from "../client/scenario-client.js";

const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000001",
);

const baseClient = createScenarioClient({ queries: {} });
let checkpointVerified = false;
const client = {
  ...baseClient,
  getDataHomeStatus: async () => ({
    ...(await baseClient.getDataHomeStatus()),
    checkpointState: checkpointVerified
      ? ("verified_this_session" as const)
      : ("none_recorded" as const),
  }),
  exportWorkspaceBackup: async () => {
    checkpointVerified = true;
    return {
      outcome: "success" as const,
      recoveryCode: "cst1_7mKp2vQ9-test-only-5tQ",
      fileLabel: "personal-workspace-2026-07-14.constellation-backup",
      metadata: {
        archiveId: "00000000-0000-4000-8000-000000000081",
        workspaceId,
        workspaceName: "Personal workspace",
        createdAt: "2026-07-14T10:42:00.000Z",
        appVersion: "0.0.0-r2",
        databaseByteLength: 4_194_304,
      },
    };
  },
  prepareWorkspaceRestore: async () => ({
    outcome: "preview" as const,
    restoreId: "00000000-0000-4000-8000-000000000082",
    metadata: {
      archiveId: "00000000-0000-4000-8000-000000000081",
      workspaceId,
      workspaceName: "Personal workspace",
      createdAt: "2026-07-14T10:42:00.000Z",
      appVersion: "0.0.0-r2",
      databaseByteLength: 4_194_304,
    },
    counts: {
      captures: 14,
      tasks: 28,
      projects: 4,
      relations: 11,
      auditReceipts: 61,
    },
  }),
  confirmWorkspaceRestore: async () => ({
    outcome: "success" as const,
    workspaceId,
  }),
};

export const DataHomeHarness = () => (
  <WorkspaceRecovery
    client={client}
    workspaceName="Personal workspace"
    recoveredPrevious={
      new URLSearchParams(window.location.search).get("recovered") === "true"
    }
    onClose={() => undefined}
    onRestored={async () => undefined}
  />
);
