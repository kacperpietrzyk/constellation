import { useState } from "react";

import type { StrategicRecordId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  removeStrategicRecord,
  type DesktopSnapshot,
  type MutationFailure,
} from "../client/workflow.js";

// The human side of the same removal an agent reaches over MCP. A soft delete:
// the copy never says "permanently", because undo restores it, and the confirm
// is two steps rather than a modal, matching the Task removal control.
//
// The kernel refuses to remove a record another record still points at. The
// inspector already knows what points at this one, so it says so up front
// instead of letting the owner click through to a precondition error. The
// kernel guard stays the real enforcement; this is the honest UI ahead of it.
export const RecordRemovalSection = ({
  client,
  snapshot,
  record,
  dependentLabels,
  onRemoved,
  onFailure,
}: {
  readonly client: ConstellationRendererClient;
  readonly snapshot: DesktopSnapshot;
  readonly record: {
    readonly id: StrategicRecordId;
    readonly kind: string;
    readonly version: number;
  };
  readonly dependentLabels: readonly string[];
  readonly onRemoved: (message: string) => Promise<void>;
  readonly onFailure: (result: MutationFailure) => void;
}) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (dependentLabels.length > 0) {
    return (
      <section className="inspector-section task-removal-block">
        <p className="section-label">Usuń rekord</p>
        <p className="muted-text">
          Wskazuje na niego inna praca ({dependentLabels.join(", ")}). Odłącz ją
          albo usuń najpierw — nie da się usunąć rekordu, od którego zależy coś
          żywego.
        </p>
      </section>
    );
  }

  return (
    <section className="inspector-section task-removal-block">
      <p className="section-label">Usuń rekord</p>
      {confirming ? (
        <div className="task-removal-actions">
          <button
            type="button"
            className="status-danger"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void removeStrategicRecord(client, snapshot, record).then(
                async (result) => {
                  setBusy(false);
                  setConfirming(false);
                  if (result.kind === "success")
                    await onRemoved(
                      "Rekord usunięto. Cofnij, jeśli to pomyłka.",
                    );
                  else onFailure(result);
                },
              );
            }}
          >
            {busy ? "Usuwam…" : "Potwierdź usunięcie"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Anuluj
          </button>
        </div>
      ) : (
        <>
          <p className="muted-text">
            Usunięcie ukrywa rekord i jego historię. Można je cofnąć.
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setConfirming(true)}
          >
            Usuń rekord
          </button>
        </>
      )}
    </section>
  );
};
