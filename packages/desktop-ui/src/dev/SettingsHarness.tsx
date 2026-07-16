import { SettingsSurface } from "../SettingsSurface.js";
import { createScenarioClient } from "../client/scenario-client.js";
import { workHarnessSnapshot } from "./WorkHarness.js";

const counts = { areas: 1, initiatives: 1, projects: 1, tasks: 1, links: 3 };
const client = {
  ...createScenarioClient({ queries: {} }),
  previewStarterWorkspace: async () =>
    ({ outcome: "success", counts }) as const,
  importStarterWorkspace: async () => ({ outcome: "success", counts }) as const,
};

export const SettingsHarness = () => (
  <main className="app-shell" data-testid="settings-harness">
    <SettingsSurface
      client={client}
      snapshot={workHarnessSnapshot}
      onReload={async () => undefined}
      onFailure={() => undefined}
      onOpenRecovery={() => undefined}
      onNavigate={() => undefined}
    />
  </main>
);
