import { useState } from "react";

import { QueryProjectionSchema } from "@constellation/contracts";

import { AttentionSurface } from "../CollaborationSurfaces.js";
import type { AttentionInboxProjection } from "../client/workflow.js";

const attention = QueryProjectionSchema.parse({
  kind: "attention.inbox",
  unreadCount: 2,
  items: [
    {
      id: "00000000-0000-4000-8000-000000000911",
      reason: "capture_missing_payload",
      destination: {
        kind: "capture",
        captureId: "00000000-0000-4000-8000-000000000912",
      },
      title: "Oferta_Northstar_v3.pdf",
      detail:
        "Zaszyfrowany rekord pozostał zachowany, ale jego bajty wymagają bezpiecznej wymiany.",
      urgency: "in_app",
      state: "unread",
      version: 1,
      occurredAt: "2026-07-16T18:30:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000913",
      reason: "capture_stale_conflict",
      destination: {
        kind: "capture",
        captureId: "00000000-0000-4000-8000-000000000914",
      },
      title: "Uzupełnij brief odnowienia",
      detail:
        "Cel zmienił się podczas przetwarzania. Oryginał nadal czeka na bieżącej wersji.",
      urgency: "in_app",
      state: "unread",
      version: 1,
      occurredAt: "2026-07-16T18:28:00.000Z",
    },
  ],
});

export const CaptureRecoveryHarness = () => {
  const [status, setStatus] = useState("Wybierz jedną konkretną akcję.");
  return (
    <main className="app-shell" data-testid="capture-recovery-harness">
      <div className="surface-scroll">
        <AttentionSurface
          attention={{
            kind: "ready",
            data: attention as AttentionInboxProjection,
          }}
          busy={false}
          onOpen={() => setStatus("Otworzono zachowany Capture.")}
          onRead={() => setStatus("Oznaczono jako przeczytane.")}
          onDismiss={() => setStatus("Sygnał usunięto bez zmiany oryginału.")}
          onRouteCapture={(_, destination) =>
            setStatus(
              destination === "task"
                ? "Wybrano zadanie."
                : "Wybrano źródło wiedzy.",
            )
          }
          onRetryCapture={() => setStatus("Ponowienie jest gotowe.")}
          onKeepCapture={() =>
            setStatus("Oryginał zachowano bez klasyfikacji.")
          }
          onReplaceCapturePayload={() =>
            setStatus("Wybrano bezpieczną wymianę oryginału.")
          }
        />
        <p className="center-state" role="status">
          {status}
        </p>
      </div>
    </main>
  );
};
