import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";

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
  updateKnowledgeSourceTitle,
  type DesktopSnapshot,
  type KnowledgeDocumentContextProjection,
  type KnowledgeSourceRecord,
  type MutationFailure,
} from "./client/workflow.js";
import { InlinePopover } from "./components/InlinePopover.js";
import { computeDocumentTextEdit } from "./document-text-diff.js";
import { countLabel, formatDateTime } from "./i18n.js";

type DocumentItem = Extract<
  DesktopSnapshot["documents"],
  { kind: "ready" }
>["data"]["items"][number];

const roleCopy = {
  note: "Notatka",
  document: "Dokument",
  deliverable: "Rezultat",
} as const;

const roleAccusativeCopy = {
  note: "notatkę",
  document: "dokument",
  deliverable: "rezultat",
} as const;

const milestoneCopy = {
  finalized: "Sfinalizowana",
  delivered: "Dostarczona",
  approved: "Zatwierdzona",
  published: "Opublikowana",
} as const;

const sourceKindCopy = {
  url: "Link",
  file: "Plik",
  screenshot: "Zrzut ekranu",
  excerpt: "Fragment",
} as const;

const availabilityCopy = {
  reference_only: "Tylko referencja",
  available: "Dostępne",
  unavailable: "Niedostępne",
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

const SourceDetail = ({
  client,
  snapshot,
  source,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly source: KnowledgeSourceRecord;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const renameId = useId();
  const [title, setTitle] = useState(source.title);
  const [busy, setBusy] = useState(false);
  const nextTitle = title.trim();

  return (
    <article
      className="document-inspector-detail"
      id="document-inspector-detail"
      aria-labelledby={`${renameId}-title`}
    >
      <header className="document-inspector-header">
        <p className="eyebrow">Źródło</p>
        <h3 id={`${renameId}-title`}>{source.title}</h3>
      </header>
      <section className="inspector-section">
        <p className="section-label">Metadane</p>
        <dl className="record-fields">
          <div>
            <dt>Rodzaj</dt>
            <dd>{sourceKindCopy[source.sourceKind]}</dd>
          </div>
          <div>
            <dt>Dostępność</dt>
            <dd>{availabilityCopy[source.availability]}</dd>
          </div>
          <div>
            <dt>Wersja</dt>
            <dd className="mono">v{source.version}</dd>
          </div>
          <div>
            <dt>Zaobserwowano</dt>
            <dd>{formatDateTime(source.observedAt)}</dd>
          </div>
        </dl>
      </section>
      {source.canonicalUrl !== undefined && (
        <section className="inspector-section">
          <p className="section-label">Adres źródła</p>
          <a
            className="source-canonical-link"
            href={source.canonicalUrl}
            target="_blank"
            rel="noreferrer"
          >
            {source.canonicalUrl}
          </a>
        </section>
      )}
      <form
        className="source-rename-form inspector-section"
        onSubmit={(event) => {
          event.preventDefault();
          if (!client || busy || nextTitle === "" || nextTitle === source.title)
            return;
          setBusy(true);
          void updateKnowledgeSourceTitle(
            client,
            snapshot,
            source,
            nextTitle,
          ).then(async (result) => {
            setBusy(false);
            if (result.kind !== "success") return onFailure(result);
            await onReload();
          });
        }}
      >
        <label htmlFor={`${renameId}-input`}>Zmień tytuł</label>
        <input
          id={`${renameId}-input`}
          name="sourceTitle"
          value={title}
          maxLength={500}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button
          className="secondary-button"
          disabled={
            !client || busy || nextTitle === "" || nextTitle === source.title
          }
        >
          {busy ? "Zapisuję…" : "Zapisz tytuł"}
        </button>
      </form>
    </article>
  );
};

const KnowledgeEditor = ({
  client,
  document,
  snapshot,
  inspectorHost,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient;
  readonly document: DocumentItem;
  readonly snapshot: DesktopSnapshot;
  readonly inspectorHost: HTMLElement | null;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const yDocument = useMemo(() => new Y.Doc({ gc: true }), [document.id]);
  const revisionNameId = useId();
  const evidenceHeadingId = useId();
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
  const contextLoading = context === undefined && !contextError;

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
    let persistTimer: number | undefined;
    const pendingUpdates: Uint8Array[] = [];
    const content = yDocument.getText("content");
    const scheduleReconnect = (delay: number) => {
      if (disposed) return;
      if (renewal !== undefined) window.clearTimeout(renewal);
      renewal = window.setTimeout(
        () => setSessionGeneration((value) => value + 1),
        delay,
      );
    };
    // Persistence stays off the keystroke path: incremental updates are
    // buffered and merged, and the full document state is encoded once per
    // idle flush instead of on every input event.
    const flushPersist = () => {
      if (persistTimer !== undefined) {
        window.clearTimeout(persistTimer);
        persistTimer = undefined;
      }
      if (pendingUpdates.length === 0) return;
      const update =
        pendingUpdates.length === 1
          ? pendingUpdates[0]!
          : Y.mergeUpdates(pendingUpdates);
      pendingUpdates.length = 0;
      void client
        .persistDocumentUpdate({
          documentId: document.id,
          spaceId: document.spaceId,
          state: Y.encodeStateAsUpdate(yDocument),
          update,
        })
        .then(() => {
          if (!disposed) setPending((value) => value + 1);
        })
        .catch(() => {
          if (!disposed) setStatus("offline");
        });
    };
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      setText(content.toString());
      if (origin === "constellation.bootstrap") return;
      pendingUpdates.push(update.slice());
      persistTimer ??= window.setTimeout(() => {
        persistTimer = undefined;
        flushPersist();
      }, 400);
    };
    yDocument.on("update", onUpdate);
    // React cleanup never runs when the window itself closes (Cmd+Q, closed
    // WebContents); flush the buffer then too, so local mode does not lose
    // the last ~400 ms of typing.
    window.addEventListener("beforeunload", flushPersist);
    window.addEventListener("pagehide", flushPersist);
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
      window.removeEventListener("beforeunload", flushPersist);
      window.removeEventListener("pagehide", flushPersist);
      if (renewal !== undefined) window.clearTimeout(renewal);
      flushPersist();
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

  const documentContextDetail = (
    <article
      className="document-inspector-detail"
      id="document-inspector-detail"
      aria-labelledby="document-context-title"
    >
      <header className="document-inspector-header">
        <p className="eyebrow">{roleCopy[document.role]}</p>
        <h3 id="document-context-title">{document.title}</h3>
      </header>

      <section className="named-versions" aria-labelledby={revisionNameId}>
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Zamrożony stan</p>
            <h4 id={revisionNameId}>Nazwane wersje</h4>
          </div>
          <span>{context ? context.namedVersions.length : "–"}</span>
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
            <button className="primary-button" disabled={busy}>
              {busy ? "Zamrażam…" : "Zamroź wersję"}
            </button>
          </div>
          <fieldset className="milestone-options">
            <legend>Znaczenie wersji</legend>
            {(Object.keys(milestoneCopy) as (keyof typeof milestoneCopy)[]).map(
              (value) => (
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
              ),
            )}
          </fieldset>
        </form>
        {context === undefined ? (
          contextError ? null : (
            <p className="inline-empty" aria-busy="true">
              Wczytywanie nazwanych wersji…
            </p>
          )
        ) : context.namedVersions.length ? (
          <ol className="named-version-list">
            {context.namedVersions.map((version) => (
              <li key={version.id} className={version.state}>
                <div>
                  <strong>{version.name}</strong>
                  <span>
                    {milestoneCopy[version.milestone]} ·{" "}
                    {formatDateTime(version.createdAt)}
                  </span>
                </div>
                <p>
                  {countLabel(
                    version.evidence.length,
                    "dowód",
                    "dowody",
                    "dowodów",
                  )}{" "}
                  ·{" "}
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

      <section
        className="evidence-inspector"
        aria-labelledby={evidenceHeadingId}
      >
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Stan dowodów</p>
            <h4 id={evidenceHeadingId}>Źródła i notatki</h4>
          </div>
          <span>
            {context ? selectedSources.length + selectedNotes.length : "–"}
          </span>
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
            aria-busy={contextLoading}
            onSubmit={(event) => {
              event.preventDefault();
              if (busy || context === undefined) return;
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
            <fieldset disabled={contextLoading}>
              <legend>Źródła</legend>
              {allSources.length === 0 ? (
                <p className="inline-empty">Najpierw zachowaj jedno źródło.</p>
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
            <fieldset disabled={contextLoading}>
              <legend>Notatki</legend>
              {noteCandidates.length === 0 ? (
                <p className="inline-empty">Brak innych notatek w tym Space.</p>
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
            <button
              className="secondary-button"
              disabled={busy || contextLoading}
            >
              {busy ? "Zapisuję…" : "Zapisz zestaw dowodów"}
            </button>
          </form>
        )}
      </section>

      {revisions.length > 0 && (
        <details className="technical-revisions">
          <summary>Rewizje robocze ({revisions.length})</summary>
          <ol>
            {revisions.map((revision) => (
              <li key={revision.id}>
                <span>{revision.name}</span>
                <small>{formatDateTime(revision.createdAt)}</small>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );

  return (
    <section className="knowledge-editor" aria-labelledby="document-title">
      <header className="knowledge-editor-header">
        <div>
          <p className="eyebrow">{roleCopy[document.role]}</p>
          <h2 id="document-title">{document.title}</h2>
        </div>
        <div className={`document-presence ${status}`} role="status">
          <span aria-hidden="true" />
          {statusCopy}
        </div>
      </header>

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
              // Apply only the changed middle of the text: a shared prefix and
              // suffix stay untouched so the CRDT records the actual edit
              // instead of delete-all + insert on every keystroke.
              const next = event.target.value;
              yDocument.transact(() => {
                const content = yDocument.getText("content");
                const edit = computeDocumentTextEdit(content.toString(), next);
                if (edit === undefined) return;
                if (edit.removed > 0) content.delete(edit.index, edit.removed);
                if (edit.inserted !== "")
                  content.insert(edit.index, edit.inserted);
              }, "constellation.local-editor");
            }}
          />
        )}
      </div>

      {inspectorHost && createPortal(documentContextDetail, inspectorHost)}
    </section>
  );
};

export const DocumentsSurface = ({
  client,
  snapshot,
  inspectorHost,
  onInspectorOpen,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly inspectorHost: HTMLElement | null;
  readonly onInspectorOpen: (kind: "document" | "source") => void;
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
  const [selectedSourceId, setSelectedSourceId] = useState<KnowledgeSourceId>();
  const [newTitle, setNewTitle] = useState("");
  const [newRole, setNewRole] = useState<"note" | "document" | "deliverable">(
    "note",
  );
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [openCreate, setOpenCreate] = useState<"source" | "content">();
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const selectedSource = knowledge?.sources.find(
    (source) => source.id === selectedSourceId,
  );
  const inspectorControls = inspectorHost
    ? { "aria-controls": "document-inspector-detail" }
    : {};

  return (
    <div className="knowledge-layout">
      <aside className="knowledge-library" aria-label="Biblioteka wiedzy">
        <header>
          <div>
            <p className="eyebrow">Źródła i rezultaty</p>
            <h1 id="surface-title" tabIndex={-1}>
              Dokumenty
            </h1>
          </div>
          <span className="library-count">
            {(knowledge?.sources.length ?? 0) + items.length}
          </span>
        </header>

        <div className="knowledge-create-bar" aria-label="Utwórz w bibliotece">
          <InlinePopover
            label="Dodaj źródło"
            panelLabel="Dodaj źródło do biblioteki"
            open={openCreate === "source"}
            onOpenChange={(open) => setOpenCreate(open ? "source" : undefined)}
            disabled={!client || creating}
          >
            <form
              className="quick-source-form knowledge-create-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!client || !sourceTitle.trim() || creating) return;
                setCreating(true);
                void createKnowledgeSource(client, snapshot, {
                  title: sourceTitle,
                  ...(sourceUrl.trim() === ""
                    ? {}
                    : { canonicalUrl: sourceUrl }),
                }).then(async (result) => {
                  setCreating(false);
                  if (result.kind !== "success") return onFailure(result);
                  setSourceTitle("");
                  setSourceUrl("");
                  setOpenCreate(undefined);
                  await onReload();
                });
              }}
            >
              <label htmlFor="knowledge-source-title">Zachowaj źródło</label>
              <input
                id="knowledge-source-title"
                name="sourceTitle"
                required
                value={sourceTitle}
                onChange={(event) => setSourceTitle(event.target.value)}
                placeholder="Co warto zachować?"
                maxLength={500}
              />
              <input
                name="sourceUrl"
                type="url"
                aria-label="Adres URL źródła"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://… (opcjonalnie)"
              />
              <button className="primary-button" disabled={creating}>
                Zachowaj źródło
              </button>
            </form>
          </InlinePopover>
          <InlinePopover
            label="Nowa treść"
            panelLabel="Utwórz treść w bibliotece"
            open={openCreate === "content"}
            onOpenChange={(open) => setOpenCreate(open ? "content" : undefined)}
            disabled={!client || creating}
          >
            <form
              className="new-knowledge-form knowledge-create-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!client || !newTitle.trim() || creating) return;
                setCreating(true);
                void createDocument(client, snapshot, newTitle, newRole).then(
                  async (result) => {
                    setCreating(false);
                    if (result.kind !== "success") return onFailure(result);
                    setSelectedId(result.data);
                    setSelectedSourceId(undefined);
                    setNewTitle("");
                    setOpenCreate(undefined);
                    await onReload();
                  },
                );
              }}
            >
              <label htmlFor="knowledge-title">Nowa treść</label>
              <input
                id="knowledge-title"
                name="knowledgeTitle"
                required
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
              <button className="primary-button" disabled={creating}>
                Utwórz {roleAccusativeCopy[newRole]}
              </button>
            </form>
          </InlinePopover>
        </div>

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
                  <button
                    type="button"
                    className={
                      selectedSourceId === source.id ? "active" : undefined
                    }
                    aria-pressed={selectedSourceId === source.id}
                    {...inspectorControls}
                    onClick={() => {
                      setSelectedSourceId(source.id);
                      onInspectorOpen("source");
                    }}
                  >
                    <span
                      className={`source-kind ${source.availability}`}
                      aria-hidden="true"
                    />
                    <span>
                      <strong>{source.title}</strong>
                      <small>
                        {sourceKindCopy[source.sourceKind]} · v{source.version}
                      </small>
                    </span>
                  </button>
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
                const active =
                  selected?.id === item.id && selectedSource === undefined;
                return (
                  <li key={item.id}>
                    <button
                      className={active ? "active" : ""}
                      aria-current={active ? "page" : undefined}
                      {...inspectorControls}
                      onClick={() => {
                        setSelectedId(item.id);
                        setSelectedSourceId(undefined);
                        onInspectorOpen("document");
                      }}
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
          inspectorHost={selectedSource ? null : inspectorHost}
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

      {selectedSource &&
        inspectorHost &&
        createPortal(
          <SourceDetail
            key={`${selectedSource.id}:${selectedSource.version}`}
            client={client}
            snapshot={snapshot}
            source={selectedSource}
            onReload={onReload}
            onFailure={onFailure}
          />,
          inspectorHost,
        )}
    </div>
  );
};
