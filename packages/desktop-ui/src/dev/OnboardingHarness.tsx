import { OnboardingFlow } from "../OnboardingFlow.js";
import { createScenarioClient } from "../client/scenario-client.js";
import { workHarnessSnapshot } from "./WorkHarness.js";

export const OnboardingHarness = () => (
  <main className="app-shell" data-testid="onboarding-harness">
    <OnboardingFlow
      client={createScenarioClient({ queries: {} })}
      snapshot={workHarnessSnapshot}
      onComplete={async () => undefined}
      onFailure={() => undefined}
    />
  </main>
);
