import { useState } from "react";

import type { CaptureOriginal } from "@constellation/contracts";

import { CaptureDialog } from "../RealApp.js";

export const CaptureHarness = () => {
  const [submitted, setSubmitted] = useState<CaptureOriginal>();
  return (
    <main className="app-shell" data-testid="capture-harness">
      <div className="center-state" aria-live="polite">
        {submitted === undefined
          ? "Harness Universal Capture"
          : `Zapisano: ${submitted.kind}`}
      </div>
      <CaptureDialog
        busy={false}
        workspaceName="Personal"
        onClose={() => undefined}
        onSubmit={setSubmitted}
      />
    </main>
  );
};
