import { useState } from "react";

import {
  CapturePayloadIdSchema,
  type CaptureOriginal,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import { CaptureDialog } from "../RealApp.js";

export const CaptureHarness = () => {
  const [submitted, setSubmitted] = useState<CaptureOriginal>();
  const client = {
    selectCapturePayload: async () => ({
      outcome: "success" as const,
      original: {
        kind: "managed_file" as const,
        payload: {
          payloadId: CapturePayloadIdSchema.parse(
            "00000000-0000-4000-8000-000000000901",
          ),
          displayName: "Oferta_Northstar_v3.pdf",
          mediaType: "application/pdf",
          byteLength: 2_457_600,
          contentSha256: "a".repeat(64),
          custodyState: "available" as const,
        },
      },
    }),
    discardCapturePayload: async () => undefined,
  } as unknown as ConstellationRendererClient;
  return (
    <main className="app-shell" data-testid="capture-harness">
      <div className="center-state" aria-live="polite">
        {submitted === undefined
          ? "Harness Universal Capture"
          : `Zapisano: ${submitted.kind}`}
      </div>
      <CaptureDialog
        busy={false}
        client={client}
        workspaceName="Personal"
        onClose={() => undefined}
        onSubmit={setSubmitted}
      />
    </main>
  );
};
