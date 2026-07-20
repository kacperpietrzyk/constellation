import { useState } from "react";

import type { TaskId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  removeTask,
  type DesktopSnapshot,
  type MutationFailure,
} from "../client/workflow.js";

// R12.7 / ADR-043 — removing a Task from its inspector. A soft delete: the
// copy never says "permanently", because undo restores it, and the two-step
// confirm matches the task-status archive control rather than a modal.
//
// The kernel refuses to remove a Task that still has an active subtask. Rather
// than let the owner click through to that rejection and read a generic
// precondition error, the surface knows the child count already (the inspector
// renders subtasks) and explains the block up front. The kernel guard remains
// the real enforcement; this is the honest UI ahead of it.
export const TaskRemovalSection = ({
  client,
  snapshot,
  taskId,
  taskVersion,
  activeChildCount,
  onRemoved,
  onFailure,
}: {
  readonly client: ConstellationRendererClient;
  readonly snapshot: DesktopSnapshot;
  readonly taskId: TaskId;
  readonly taskVersion: number;
  readonly activeChildCount: number;
  readonly onRemoved: (message: string) => Promise<void>;
  readonly onFailure: (result: MutationFailure) => void;
}) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (activeChildCount > 0) {
    return (
      <section className="inspector-section task-removal-block">
        <p className="section-label">Usuń zadanie</p>
        <p className="muted-text">
          To zadanie ma podzadania. Usuń albo przenieś je najpierw — nie da się
          usunąć zadania, od którego zależy inna praca.
        </p>
      </section>
    );
  }

  return (
    <section className="inspector-section task-removal-block">
      <p className="section-label">Usuń zadanie</p>
      {confirming ? (
        <div className="task-removal-actions">
          <button
            type="button"
            className="status-danger"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void removeTask(client, snapshot, taskId, taskVersion).then(
                async (result) => {
                  setBusy(false);
                  setConfirming(false);
                  if (result.kind === "success")
                    await onRemoved(
                      "Zadanie usunięto. Cofnij, jeśli to pomyłka.",
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
            Usunięcie ukrywa zadanie i jego historię. Można je cofnąć.
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setConfirming(true)}
          >
            Usuń zadanie
          </button>
        </>
      )}
    </section>
  );
};
