import { SettingsSurface } from "../SettingsSurface.js";
import { workHarnessSnapshot } from "./WorkHarness.js";

export const SettingsHarness = () => (
  <main className="app-shell" data-testid="settings-harness">
    <SettingsSurface
      client={undefined}
      snapshot={workHarnessSnapshot}
      onReload={async () => undefined}
      onFailure={() => undefined}
      onOpenRecovery={() => undefined}
      onNavigate={() => undefined}
    />
  </main>
);
