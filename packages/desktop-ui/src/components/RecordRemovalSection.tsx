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

// Obietnica cofnięcia stoi na OBU ekranach, na których usunięcie jest w ogóle
// możliwe — także na ostatnim przed kliknięciem, bo dopiero tam właściciel
// naprawdę decyduje, a ekran bez tego zdania czyta się jak próg bez odwrotu.
// Gałąź zablokowana jej nie niesie i nieść nie powinna: dopóki usunięcie jest
// odmawiane, nie ma czego cofać.
const undoPromise =
  "Deleting hides the record and its history. You can undo it.";

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
      // Znaczniki `data-*` są tu po to, żeby test interakcji trzymał się stanu
      // usuwania, a nie klasy CSS ani napisu na przycisku — jedno i drugie
      // wolno zmienić bez zmiany gwarancji.
      <section
        className="inspector-section task-removal-block"
        data-record-removal=""
        data-removal-state="blocked"
      >
        <p className="section-label">Delete record</p>
        <p className="muted-text">
          Other work points at it ({dependentLabels.join(", ")}). Unlink or
          delete that first — a record something live depends on cannot be
          deleted.
        </p>
      </section>
    );
  }

  return (
    <section
      className="inspector-section task-removal-block"
      data-record-removal=""
      data-removal-state={confirming ? "confirming" : "armable"}
    >
      <p className="section-label">Delete record</p>
      {confirming ? (
        <>
          <p className="muted-text">{undoPromise}</p>
          <div className="task-removal-actions">
            <button
              type="button"
              className="secondary-button status-danger"
              data-removal-action="confirm"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void removeStrategicRecord(client, snapshot, record).then(
                  async (result) => {
                    setBusy(false);
                    setConfirming(false);
                    if (result.kind === "success")
                      await onRemoved(
                        "Record deleted. Undo if that was a mistake.",
                      );
                    else onFailure(result);
                  },
                );
              }}
            >
              {busy ? "Deleting…" : "Confirm delete"}
            </button>
            <button
              type="button"
              className="secondary-button"
              data-removal-action="disarm"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted-text">{undoPromise}</p>
          <button
            type="button"
            className="secondary-button"
            data-removal-action="arm"
            onClick={() => setConfirming(true)}
          >
            Delete record
          </button>
        </>
      )}
    </section>
  );
};
