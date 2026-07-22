import { useEffect, useState } from "react";

import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  stageManagedAttachment,
  updateTaskDetails,
  type DesktopSnapshot,
  type MutationFailure,
} from "./client/workflow.js";

type Task = DesktopSnapshot["tasks"][number];
type Attachment = Task["attachments"][number];

export const TaskAttachmentsSection = ({
  client,
  snapshot,
  task,
  canEdit,
  busy,
  onBusyChange,
  onSnapshot,
  onChanged,
  onFailure,
  onRestore,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly task: Task;
  readonly canEdit: boolean;
  readonly busy: boolean;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onSnapshot: (snapshot: DesktopSnapshot) => void;
  readonly onChanged: (message: string) => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
  readonly onRestore: (
    attachment: Attachment,
  ) => Promise<"available" | "unavailable">;
}) => {
  const [custody, setCustody] = useState<
    Readonly<Record<string, "checking" | "available" | "unavailable">>
  >({});
  useEffect(() => {
    let active = true;
    setCustody(
      Object.fromEntries(
        task.attachments.map((attachment) => [attachment.sourceId, "checking"]),
      ),
    );
    void Promise.all(
      task.attachments.map(async (attachment) => {
        const inspected = await client
          ?.inspectManagedPayload?.({
            captureId: attachment.captureId,
            original: attachment.original,
          })
          .catch(() => ({ state: "unavailable" as const }));
        if (!active) return;
        setCustody((current) => ({
          ...current,
          [attachment.sourceId]: inspected?.state ?? "unavailable",
        }));
      }),
    );
    return () => {
      active = false;
    };
  }, [client, task.attachments]);
  const attach = () => {
    if (!client) return;
    onBusyChange(true);
    void stageManagedAttachment(client, snapshot)
      .then(async (staged) => {
        if (staged.kind !== "success") {
          if (staged.message !== "Nie wybrano pliku.") onFailure(staged);
          return;
        }
        onSnapshot(staged.data.snapshot);
        const current = staged.data.snapshot.tasks.find(
          (item) => item.id === task.id,
        );
        if (current === undefined) {
          onFailure({
            kind: "unavailable",
            message:
              "Plik zapisano w bibliotece, ale zadanie nie jest już dostępne.",
          });
          return;
        }
        const result = await updateTaskDetails(
          client,
          staged.data.snapshot,
          current.id,
          current.version,
          {
            attachmentSourceIds: [
              ...new Set([
                ...current.attachments.map((attachment) => attachment.sourceId),
                staged.data.sourceId,
              ]),
            ],
          },
        );
        if (result.kind === "success")
          await onChanged("Plik dołączono do zadania.");
        else onFailure(result);
      })
      .finally(() => onBusyChange(false));
  };

  const unlink = (attachment: Attachment) => {
    if (!client) return;
    onBusyChange(true);
    void updateTaskDetails(client, snapshot, task.id, task.version, {
      attachmentSourceIds: task.attachments
        .filter((item) => item.sourceId !== attachment.sourceId)
        .map((item) => item.sourceId),
    })
      .then(async (result) => {
        if (result.kind === "success")
          await onChanged("Plik odłączono od zadania.");
        else onFailure(result);
      })
      .finally(() => onBusyChange(false));
  };

  return (
    <section className="inspector-section task-attachments">
      <div className="section-heading-row">
        <div>
          <p className="section-label">Załączniki</p>
          <p>Oryginały pozostają w zarządzanym magazynie Capture.</p>
        </div>
        <button
          type="button"
          className="secondary-button compact"
          disabled={busy || !canEdit || !client}
          onClick={attach}
        >
          {busy ? "Zabezpieczam…" : "Dołącz plik"}
        </button>
      </div>
      {task.attachments.length === 0 ? (
        <p>Brak załączników.</p>
      ) : (
        <ul className="managed-attachment-list">
          {task.attachments.map((attachment) => (
            <li key={attachment.sourceId}>
              <span>
                <strong>{attachment.original.payload.displayName}</strong>
                <small>
                  {Math.ceil(attachment.original.payload.byteLength / 1024)} KB
                </small>
              </span>
              <span
                className={`attachment-state ${custody[attachment.sourceId]}`}
              >
                {custody[attachment.sourceId] === "available"
                  ? "W zarządzanym magazynie"
                  : custody[attachment.sourceId] === "checking"
                    ? "Sprawdzam przechowanie…"
                    : "Niedostępny na tym urządzeniu"}
              </span>
              {custody[attachment.sourceId] === "unavailable" && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setCustody((current) => ({
                      ...current,
                      [attachment.sourceId]: "checking",
                    }));
                    void onRestore(attachment).then((state) =>
                      setCustody((current) => ({
                        ...current,
                        [attachment.sourceId]: state,
                      })),
                    );
                  }}
                >
                  Pobierz ponownie
                </button>
              )}
              <button
                type="button"
                className="text-button"
                disabled={busy || !canEdit || !client}
                onClick={() => unlink(attachment)}
              >
                Odłącz
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
