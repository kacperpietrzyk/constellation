import { useEffect, useMemo, useState } from "react";

import { HocuspocusProvider } from "@hocuspocus/provider";
import type { DocumentId } from "@constellation/contracts";
import type {
  ConstellationRendererClient,
  RendererDocumentRevision,
} from "@constellation/desktop-preload/client";
import * as Y from "yjs";
import { MAX_DOCUMENT_TEXT_LENGTH } from "@constellation/realtime-documents";

import {
  createDocument,
  type DesktopSnapshot,
  type MutationFailure,
} from "./client/workflow.js";

type DocumentItem = Extract<
  DesktopSnapshot["documents"],
  { kind: "ready" }
>["data"]["items"][number];

const formatRevisionTime = (value: string): string =>
  new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const Editor = ({
  client,
  document,
}: {
  readonly client: ConstellationRendererClient;
  readonly document: DocumentItem;
}) => {
  const yDocument = useMemo(() => new Y.Doc({ gc: true }), [document.id]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<
    "opening" | "local" | "connecting" | "current" | "offline" | "denied"
  >("opening");
  const [access, setAccess] = useState<"view" | "comment" | "edit">("edit");
  const [pending, setPending] = useState(0);
  const [revisions, setRevisions] = useState<
    readonly RendererDocumentRevision[]
  >([]);
  const [revisionName, setRevisionName] = useState("");
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [sessionGeneration, setSessionGeneration] = useState(0);

  useEffect(() => {
    let disposed = false;
    let provider: HocuspocusProvider | undefined;
    let renewal: number | undefined;
    const content = yDocument.getText("content");
    const scheduleReconnect = (delay: number) => {
      if (disposed) return;
      if (renewal !== undefined) window.clearTimeout(renewal);
      renewal = window.setTimeout(
        () => setSessionGeneration((value) => value + 1),
        delay,
      );
    };
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      setText(content.toString());
      if (origin === "constellation.bootstrap") return;
      void client
        .persistDocumentUpdate({
          documentId: document.id,
          spaceId: document.spaceId,
          state: Y.encodeStateAsUpdate(yDocument),
          update: update.slice(),
        })
        .then(() => setPending((value) => value + 1))
        .catch(() => setStatus("offline"));
    };
    yDocument.on("update", onUpdate);
    void client
      .openDocument({ documentId: document.id, spaceId: document.spaceId })
      .then((opened) => {
        if (disposed) return;
        if (opened.state !== undefined) {
          Y.applyUpdate(yDocument, opened.state, "constellation.bootstrap");
        }
        setText(content.toString());
        setPending(opened.pendingUpdateCount);
        if (opened.mode === "local") {
          setStatus("local");
          return;
        }
        if (opened.session === undefined) {
          setStatus("offline");
          scheduleReconnect(2_000);
          return;
        }
        setAccess(opened.session.access);
        setStatus("connecting");
        provider = new HocuspocusProvider({
          url: opened.session.url,
          name: opened.session.room,
          token: opened.session.token,
          document: yDocument,
          onStatus: ({ status: next }) =>
            setStatus(next === "connected" ? "current" : "offline"),
          onSynced: () => {
            setStatus("current");
            void client
              .acknowledgeDocumentUpdates({
                documentId: document.id,
                spaceId: document.spaceId,
              })
              .then(() => setPending(0));
          },
          onAuthenticationFailed: () => {
            setStatus("denied");
            scheduleReconnect(1_000);
          },
          onClose: () => {
            setStatus("offline");
            scheduleReconnect(1_000);
          },
        });
        provider.attach();
        const renewIn = Math.max(
          5_000,
          Date.parse(opened.session.expiresAt) - Date.now() - 15_000,
        );
        renewal = window.setTimeout(
          () => setSessionGeneration((value) => value + 1),
          renewIn,
        );
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("DOCUMENT_NOT_AVAILABLE")) {
          setStatus("denied");
          return;
        }
        setStatus("offline");
        scheduleReconnect(2_000);
      });
    return () => {
      disposed = true;
      if (renewal !== undefined) window.clearTimeout(renewal);
      provider?.destroy();
      yDocument.off("update", onUpdate);
    };
  }, [client, document.id, document.spaceId, sessionGeneration, yDocument]);

  useEffect(
    () => () => {
      yDocument.destroy();
    },
    [yDocument],
  );

  const loadRevisions = () => {
    void client
      .listDocumentRevisions({ documentId: document.id })
      .then(setRevisions)
      .catch(() => setRevisions([]));
  };
  useEffect(loadRevisions, [client, document.id]);

  const statusCopy = {
    opening: "Otwieranie…",
    local: "Tylko na tym urządzeniu",
    connecting: "Łączenie…",
    current: "Współpraca aktywna",
    offline: pending > 0 ? `Offline · ${pending} zmian oczekuje` : "Offline",
    denied: "Dostęp został odebrany",
  }[status];

  return (
    <section className="document-editor" aria-labelledby="document-title">
      <header className="document-toolbar">
        <div>
          <p className="surface-eyebrow">Dokument natywny</p>
          <h2 id="document-title">{document.title}</h2>
        </div>
        <div className={`document-presence ${status}`} role="status">
          <span aria-hidden="true" />
          {statusCopy}
        </div>
      </header>
      {status === "denied" ? (
        <div className="document-blocked" role="alert">
          <strong>Ten dokument nie jest już dostępny.</strong>
          <p>
            Lokalna sesja została zamknięta. Poproś właściciela Space o dostęp.
          </p>
        </div>
      ) : (
        <textarea
          className="document-canvas"
          aria-label={`Treść dokumentu ${document.title}`}
          value={text}
          readOnly={access !== "edit"}
          maxLength={MAX_DOCUMENT_TEXT_LENGTH}
          placeholder="Zacznij pisać. Zmiany są zapisywane lokalnie od pierwszego znaku."
          onChange={(event) => {
            const next = event.target.value;
            yDocument.transact(() => {
              const content = yDocument.getText("content");
              content.delete(0, content.length);
              content.insert(0, next);
            }, "constellation.local-editor");
          }}
        />
      )}
      <aside
        className="document-revisions"
        aria-label="Nazwane wersje dokumentu"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!revisionName.trim() || revisionBusy) return;
            setRevisionBusy(true);
            void client
              .createDocumentRevision({
                documentId: document.id,
                name: revisionName.trim(),
              })
              .then(() => {
                setRevisionName("");
                loadRevisions();
              })
              .finally(() => setRevisionBusy(false));
          }}
        >
          <label htmlFor="revision-name">Nazwana wersja</label>
          <div>
            <input
              id="revision-name"
              value={revisionName}
              maxLength={120}
              onChange={(event) => setRevisionName(event.target.value)}
              placeholder="np. Przed przeglądem"
            />
            <button disabled={revisionBusy || !revisionName.trim()}>
              {revisionBusy ? "Zapisuję…" : "Zapisz"}
            </button>
          </div>
        </form>
        <ol>
          {revisions.map((revision) => (
            <li key={revision.id}>
              <span>
                <strong>{revision.name}</strong>
                <small>{formatRevisionTime(revision.createdAt)}</small>
              </span>
              <button
                className="text-button"
                onClick={() => {
                  if (!window.confirm(`Przywrócić „${revision.name}”?`)) return;
                  setRevisionBusy(true);
                  void client
                    .restoreDocumentRevision({
                      documentId: document.id,
                      revisionId: revision.id,
                    })
                    .then(() => {
                      loadRevisions();
                      setSessionGeneration((value) => value + 1);
                    })
                    .finally(() => setRevisionBusy(false));
                }}
              >
                Przywróć
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </section>
  );
};

export const DocumentsSurface = ({
  client,
  snapshot,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const items =
    snapshot.documents.kind === "ready" ? snapshot.documents.data.items : [];
  const [selectedId, setSelectedId] = useState<DocumentId | undefined>(
    items[0]?.id,
  );
  const [creating, setCreating] = useState(false);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  return (
    <div className="documents-layout">
      <aside className="documents-list" aria-label="Dokumenty">
        <header>
          <div>
            <p className="surface-eyebrow">Wiedza</p>
            <h1>Dokumenty</h1>
          </div>
          <button
            className="icon-action"
            aria-label="Utwórz dokument"
            disabled={!client || creating}
            onClick={() => {
              const title = window.prompt("Tytuł nowego dokumentu");
              if (!client || !title?.trim()) return;
              setCreating(true);
              void createDocument(client, snapshot, title).then(
                async (result) => {
                  setCreating(false);
                  if (result.kind !== "success") return onFailure(result);
                  setSelectedId(result.data);
                  await onReload();
                },
              );
            }}
          >
            +
          </button>
        </header>
        {snapshot.documents.kind === "unavailable" ? (
          <p className="documents-empty">
            Dokumenty nie są dostępne w tym zakresie.
          </p>
        ) : items.length === 0 ? (
          <div className="documents-empty">
            <strong>Jeszcze bez dokumentów</strong>
            <p>Utwórz pierwszy dokument bez wybierania miejsca zapisu.</p>
          </div>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  className={selected?.id === item.id ? "active" : ""}
                  onClick={() => setSelectedId(item.id)}
                >
                  <strong>{item.title}</strong>
                  <small>
                    {new Date(item.updatedAt).toLocaleDateString("pl-PL")}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      {client && selected ? (
        <Editor key={selected.id} client={client} document={selected} />
      ) : (
        <section className="document-welcome">
          <span aria-hidden="true">Aa</span>
          <h2>Dokument pozostaje blisko pracy</h2>
          <p>
            Wybierz dokument albo utwórz nowy. Treść działa także bez sieci.
          </p>
        </section>
      )}
    </div>
  );
};
