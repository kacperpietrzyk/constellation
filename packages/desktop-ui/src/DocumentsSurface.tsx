import { useEffect, useId, useMemo, useState } from "react";

import { HocuspocusProvider } from "@hocuspocus/provider";
import type { DocumentId, KnowledgeSourceId } from "@constellation/contracts";
import type {
  ConstellationRendererClient,
  RendererDocumentRevision,
} from "@constellation/desktop-preload/client";
import * as Y from "yjs";
import { MAX_DOCUMENT_TEXT_LENGTH } from "@constellation/realtime-documents";

import {
  createDocument,
  createKnowledgeSource,
  createNamedKnowledgeVersion,
  loadKnowledgeDocumentContext,
  setKnowledgeEvidence,
  type DesktopSnapshot,
  type KnowledgeDocumentContextProjection,
  type MutationFailure,
} from "./client/workflow.js";

type DocumentItem = Extract<
  DesktopSnapshot["documents"],
  { kind: "ready" }
>["data"]["items"][number];

const formatTime = (value: string): string =>
  new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const roleCopy = {
  note: "Notatka",
  document: "Dokument",
  deliverable: "Rezultat",
} as const;

const milestoneCopy = {
  finalized: "Sfinalizowana",
  delivered: "Dostarczona",
  approved: "Zatwierdzona",
  published: "Opublikowana",
} as const;

const EvidenceMotif = () => (
  <svg
    className="knowledge-motif"
    viewBox="0 0 240 92"
    role="img"
    aria-label="Źródło prowadzi do notatki i zamrożonej wersji"
  >
    <path d="M44 46h48M148 46h48" />
    <circle cx="28" cy="46" r="14" />
    <rect x="94" y="30" width="52" height="32" rx="8" />
    <path d="M196 30h24v32h-24zM204 38h8M204 46h8M204 54h8" />
  </svg>
);

const KnowledgeEditor = ({
  client,
  document,
  snapshot,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient;
  readonly document: DocumentItem;
  readonly snapshot: DesktopSnapshot;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const yDocument = useMemo(() => new Y.Doc({ gc: true }), [document.id]);
  const revisionNameId = useId();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<
    "opening" | "local" | "connecting" | "current" | "offline" | "denied"
  >("opening");
  const [access, setAccess] = useState<"view" | "comment" | "edit">("edit");
  const [pending, setPending] = useState(0);
  const [revisions, setRevisions] = useState<
    readonly RendererDocumentRevision[]
  >([]);
  const [context, setContext] = useState<KnowledgeDocumentContextProjection>();
  const [contextError, setContextError] = useState(false);
  const [selectedSources, setSelectedSources] = useState<
    readonly KnowledgeSourceId[]
  >([]);
  const [selectedNotes, setSelectedNotes] = useState<readonly DocumentId[]>([]);
  const [revisionName, setRevisionName] = useState("");
  const [milestone, setMilestone] =
    useState<keyof typeof milestoneCopy>("finalized");
  const [busy, setBusy] = useState(false);
  const [sessionGeneration, setSessionGeneration] = useState(0);

  const reloadContext = () => {
    setContextError(false);
    void loadKnowledgeDocumentContext(client, snapshot, document.id)
      .then((value) => {
        setContext(value);
        setSelectedSources(
          value.evidence
            .filter((item) => item.kind === "source")
            .map((item) => item.recordId as KnowledgeSourceId),
        );
        setSelectedNotes(
          value.evidence
            .filter((item) => item.kind === "note")
            .map((item) => item.recordId as DocumentId),
        );
      })
      .catch(() => setContextError(true));
  };

  useEffect(reloadContext, [client, document.id, document.version]);

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
        if (opened.state !== undefined)
          Y.applyUpdate(yDocument, opened.state, "constellation.bootstrap");
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
        renewal = window.setTimeout(
          () => setSessionGeneration((value) => value + 1),
          Math.max(
            5_000,
            Date.parse(opened.session.expiresAt) - Date.now() - 15_000,
          ),
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
    local: "Lokalnie i bezpiecznie",
    connecting: "Łączenie…",
    current: "Współpraca aktywna",
    offline: pending > 0 ? `Offline · ${pending} zmian oczekuje` : "Offline",
    denied: "Dostęp został odebrany",
  }[status];

  const allSources =
    snapshot.knowledge.kind === "ready" ? snapshot.knowledge.data.sources : [];
  const noteCandidates =
    snapshot.knowledge.kind === "ready"
      ? snapshot.knowledge.data.documents.filter(
          (item) => item.role === "note" && item.id !== document.id,
        )
      : [];

  return (
    <section className="knowledge-editor" aria-labelledby="document-title">
      <header className="knowledge-editor-header">
        <div>
          <p className="surface-eyebrow">{roleCopy[document.role]}</p>
          <h2 id="document-title">{document.title}</h2>
        </div>
        <div className={`document-presence ${status}`} role="status">
          <span aria-hidden="true" />
          {statusCopy}
        </div>
      </header>

      <div className="knowledge-composition">
        <div className="knowledge-writing-plane">
          {status === "denied" ? (
            <div className="document-blocked" role="alert">
              <strong>Ta treść nie jest już dostępna.</strong>
              <p>Lokalna sesja została zamknięta i jej cache usunięty.</p>
            </div>
          ) : (
            <textarea
              className="document-canvas"
              aria-label={`Treść: ${document.title}`}
              value={text}
              readOnly={access !== "edit"}
              maxLength={MAX_DOCUMENT_TEXT_LENGTH}
              placeholder="Zapis zaczyna się od pierwszego znaku. Źródła pozostają osobno."
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

          <section className="named-versions" aria-labelledby={revisionNameId}>
            <div className="section-heading-row">
              <div>
                <p className="surface-eyebrow">Zamrożony stan</p>
                <h3 id={revisionNameId}>Nazwane wersje</h3>
              </div>
              <span>{context?.namedVersions.length ?? 0}</span>
            </div>
            <form
              className="named-version-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!revisionName.trim() || busy) return;
                setBusy(true);
                void client
                  .createDocumentRevision({
                    documentId: document.id,
                    name: revisionName.trim(),
                  })
                  .then((documentRevisionId) =>
                    createNamedKnowledgeVersion(client, snapshot, {
                      documentId: document.id,
                      documentRevisionId,
                      name: revisionName.trim(),
                      milestone,
                      contentSnapshot: text,
                    }),
                  )
                  .then(async (result) => {
                    if (result.kind !== "success") {
                      onFailure({
                        ...result,
                        message: `${result.message} Rewizja treści pozostaje bezpiecznie zapisana; ponów powiązanie wersji.`,
                      });
                      return;
                    }
                    setRevisionName("");
                    loadRevisions();
                    await onReload();
                    reloadContext();
                  })
                  .catch(() =>
                    onFailure({
                      kind: "retry",
                      message:
                        "Nie udało się zamrozić wersji. Treść pozostała zapisana.",
                    }),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              <label htmlFor={`${revisionNameId}-name`}>Nazwa wersji</label>
              <div className="named-version-controls">
                <input
                  id={`${revisionNameId}-name`}
                  name="versionName"
                  value={revisionName}
                  maxLength={120}
                  onChange={(event) => setRevisionName(event.target.value)}
                  placeholder="np. Raport dla klienta · 15 lipca"
                />
                <button disabled={busy}>
                  {busy ? "Zamrażam…" : "Zamroź wersję"}
                </button>
              </div>
              <fieldset className="milestone-options">
                <legend>Znaczenie wersji</legend>
                {(
                  Object.keys(milestoneCopy) as (keyof typeof milestoneCopy)[]
                ).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="milestone"
                      value={value}
                      checked={milestone === value}
                      onChange={() => setMilestone(value)}
                    />
                    <span>{milestoneCopy[value]}</span>
                  </label>
                ))}
              </fieldset>
            </form>
            {context?.namedVersions.length ? (
              <ol className="named-version-list">
                {context.namedVersions.map((version) => (
                  <li key={version.id} className={version.state}>
                    <div>
                      <strong>{version.name}</strong>
                      <span>
                        {milestoneCopy[version.milestone]} ·{" "}
                        {formatTime(version.createdAt)}
                      </span>
                    </div>
                    <p>
                      {version.evidence.length} dowodów ·{" "}
                      {version.evidence.some((item) => item.changed)
                        ? "źródła zmieniły się później"
                        : "dowody nadal zgodne"}
                    </p>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        void client
                          .restoreDocumentRevision({
                            documentId: document.id,
                            revisionId: version.documentRevisionId,
                          })
                          .then(() => {
                            loadRevisions();
                            setSessionGeneration((value) => value + 1);
                          })
                          .finally(() => setBusy(false));
                      }}
                    >
                      Przywróć jako nową zmianę
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="inline-empty">
                Wersja powstaje dopiero przy świadomym finalizowaniu lub
                dostarczeniu.
              </p>
            )}
          </section>
        </div>

        <aside className="evidence-inspector" aria-label="Dowody dokumentu">
          <div className="section-heading-row">
            <div>
              <p className="surface-eyebrow">Stan dowodów</p>
              <h3>Źródła i notatki</h3>
            </div>
            <span>{selectedSources.length + selectedNotes.length}</span>
          </div>
          {contextError ? (
            <div className="inline-error" role="alert">
              <strong>Nie udało się odczytać dowodów.</strong>
              <button className="text-button" onClick={reloadContext}>
                Spróbuj ponownie
              </button>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (busy) return;
                setBusy(true);
                void setKnowledgeEvidence(
                  client,
                  snapshot,
                  document.id,
                  selectedSources,
                  selectedNotes,
                ).then(async (result) => {
                  setBusy(false);
                  if (result.kind !== "success") return onFailure(result);
                  await onReload();
                  reloadContext();
                });
              }}
            >
              <fieldset>
                <legend>Źródła</legend>
                {allSources.length === 0 ? (
                  <p className="inline-empty">
                    Najpierw zachowaj jedno źródło.
                  </p>
                ) : (
                  allSources.map((source) => (
                    <label className="evidence-option" key={source.id}>
                      <input
                        type="checkbox"
                        checked={selectedSources.includes(source.id)}
                        onChange={(event) =>
                          setSelectedSources((current) =>
                            event.target.checked
                              ? [...current, source.id]
                              : current.filter((id) => id !== source.id),
                          )
                        }
                      />
                      <span>
                        <strong>{source.title}</strong>
                        <small>Źródło · v{source.version}</small>
                      </span>
                    </label>
                  ))
                )}
              </fieldset>
              <fieldset>
                <legend>Notatki</legend>
                {noteCandidates.length === 0 ? (
                  <p className="inline-empty">
                    Brak innych notatek w tym Space.
                  </p>
                ) : (
                  noteCandidates.map((note) => (
                    <label className="evidence-option" key={note.id}>
                      <input
                        type="checkbox"
                        checked={selectedNotes.includes(note.id)}
                        onChange={(event) =>
                          setSelectedNotes((current) =>
                            event.target.checked
                              ? [...current, note.id]
                              : current.filter((id) => id !== note.id),
                          )
                        }
                      />
                      <span>
                        <strong>{note.title}</strong>
                        <small>Notatka · v{note.version}</small>
                      </span>
                    </label>
                  ))
                )}
              </fieldset>
              <button className="secondary-button" disabled={busy}>
                {busy ? "Zapisuję…" : "Zapisz zestaw dowodów"}
              </button>
            </form>
          )}
          {revisions.length > 0 && (
            <details className="technical-revisions">
              <summary>Rewizje robocze ({revisions.length})</summary>
              <ol>
                {revisions.map((revision) => (
                  <li key={revision.id}>
                    <span>{revision.name}</span>
                    <small>{formatTime(revision.createdAt)}</small>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </aside>
      </div>
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
  const knowledge =
    snapshot.knowledge.kind === "ready" ? snapshot.knowledge.data : undefined;
  const [selectedId, setSelectedId] = useState<DocumentId | undefined>(
    items[0]?.id,
  );
  const [newTitle, setNewTitle] = useState("");
  const [newRole, setNewRole] = useState<"note" | "document" | "deliverable">(
    "note",
  );
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  return (
    <div className="knowledge-layout">
      <aside className="knowledge-library" aria-label="Biblioteka wiedzy">
        <header>
          <div>
            <p className="surface-eyebrow">Wiedza</p>
            <h1>Źródła i rezultaty</h1>
          </div>
          <span className="library-count">
            {(knowledge?.sources.length ?? 0) + items.length}
          </span>
        </header>

        <form
          className="quick-source-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!client || !sourceTitle.trim() || creating) return;
            setCreating(true);
            void createKnowledgeSource(client, snapshot, {
              title: sourceTitle,
              ...(sourceUrl.trim() === "" ? {} : { canonicalUrl: sourceUrl }),
            }).then(async (result) => {
              setCreating(false);
              if (result.kind !== "success") return onFailure(result);
              setSourceTitle("");
              setSourceUrl("");
              await onReload();
            });
          }}
        >
          <label htmlFor="knowledge-source-title">Zachowaj źródło</label>
          <input
            id="knowledge-source-title"
            name="sourceTitle"
            value={sourceTitle}
            onChange={(event) => setSourceTitle(event.target.value)}
            placeholder="Co warto zachować?"
            maxLength={500}
          />
          <input
            name="sourceUrl"
            type="url"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://… (opcjonalnie)"
          />
          <button disabled={creating}>Zachowaj źródło</button>
        </form>

        <section className="library-section" aria-labelledby="sources-title">
          <div className="library-section-heading">
            <h2 id="sources-title">Źródła</h2>
            <span>{knowledge?.sources.length ?? 0}</span>
          </div>
          {snapshot.knowledge.kind === "unavailable" ? (
            <div className="inline-error" role="status">
              Metadane źródeł są chwilowo niedostępne.
            </div>
          ) : knowledge?.sources.length ? (
            <ul className="source-list">
              {knowledge.sources.map((source) => (
                <li key={source.id}>
                  <span
                    className={`source-kind ${source.availability}`}
                    aria-hidden="true"
                  />
                  <div>
                    <strong>{source.title}</strong>
                    <small>
                      {source.sourceKind === "url" ? "Link" : "Źródło"} · v
                      {source.version}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="library-empty">
              <EvidenceMotif />
              <p>Źródło pozostaje osobno, nawet gdy później zasila notatkę.</p>
            </div>
          )}
        </section>

        <section className="library-section" aria-labelledby="documents-title">
          <div className="library-section-heading">
            <h2 id="documents-title">Treści</h2>
            <span>{items.length}</span>
          </div>
          <form
            className="new-knowledge-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!client || !newTitle.trim() || creating) return;
              setCreating(true);
              void createDocument(client, snapshot, newTitle, newRole).then(
                async (result) => {
                  setCreating(false);
                  if (result.kind !== "success") return onFailure(result);
                  setSelectedId(result.data);
                  setNewTitle("");
                  await onReload();
                },
              );
            }}
          >
            <label htmlFor="knowledge-title">Nowa treść</label>
            <input
              id="knowledge-title"
              name="knowledgeTitle"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Tytuł notatki lub rezultatu"
              maxLength={500}
            />
            <div
              className="role-options"
              role="group"
              aria-label="Rodzaj treści"
            >
              {(Object.keys(roleCopy) as (keyof typeof roleCopy)[]).map(
                (role) => (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={newRole === role}
                    onClick={() => setNewRole(role)}
                  >
                    {roleCopy[role]}
                  </button>
                ),
              )}
            </div>
            <button disabled={creating}>
              Utwórz {roleCopy[newRole].toLowerCase()}
            </button>
          </form>
          {snapshot.documents.kind === "unavailable" ? (
            <p className="inline-error">
              Treści nie są dostępne w tym zakresie.
            </p>
          ) : items.length === 0 ? (
            <div className="library-empty">
              <p>Notatka może ewoluować. Rezultat zachowuje nazwane wersje.</p>
            </div>
          ) : (
            <ul className="knowledge-document-list">
              {items.map((item) => {
                const summary = knowledge?.documents.find(
                  (candidate) => candidate.id === item.id,
                );
                return (
                  <li key={item.id}>
                    <button
                      className={selected?.id === item.id ? "active" : ""}
                      aria-current={
                        selected?.id === item.id ? "page" : undefined
                      }
                      onClick={() => setSelectedId(item.id)}
                    >
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {roleCopy[item.role]} · {summary?.evidenceCount ?? 0}{" "}
                          dowodów
                        </small>
                      </span>
                      {summary?.staleEvidence && (
                        <em title="Dowody zmieniły się od ostatniej wersji">
                          !
                        </em>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>

      {client && selected ? (
        <KnowledgeEditor
          key={selected.id}
          client={client}
          document={selected}
          snapshot={snapshot}
          onReload={onReload}
          onFailure={onFailure}
        />
      ) : (
        <section className="knowledge-welcome">
          <EvidenceMotif />
          <h2>Od źródła do wersji, bez utraty pochodzenia</h2>
          <p>
            Zachowaj źródło, rozwiń je w notatce i zamroź rezultat dopiero
            wtedy, gdy ma konkretne znaczenie.
          </p>
        </section>
      )}
    </div>
  );
};
