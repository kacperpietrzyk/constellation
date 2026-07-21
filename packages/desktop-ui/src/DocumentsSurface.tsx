import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { HocuspocusProvider } from "@hocuspocus/provider";
import Collaboration from "@tiptap/extension-collaboration";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { DocumentId, KnowledgeSourceId } from "@constellation/contracts";
import type {
  ConstellationRendererClient,
  RendererDocumentRevision,
} from "@constellation/desktop-preload/client";
import * as Y from "yjs";
import {
  LEGACY_DOCUMENT_TEXT_ROOT,
  MAX_DOCUMENT_TEXT_LENGTH,
  RICH_DOCUMENT_FRAGMENT_ROOT,
  documentContentFormat,
  documentEntityReferences,
  documentPlainText,
  migrateDocumentToRich,
} from "@constellation/realtime-documents";

import {
  createDocument,
  createKnowledgeSource,
  createNamedKnowledgeVersion,
  loadKnowledgeDocumentContext,
  loadDocumentLinkCandidates,
  setKnowledgeEvidence,
  updateKnowledgeSourceTitle,
  type DesktopSnapshot,
  type KnowledgeDocumentContextProjection,
  type KnowledgeSourceRecord,
  type MutationFailure,
  type DocumentLinkCandidatesProjection,
} from "./client/workflow.js";
import { InlinePopover } from "./components/InlinePopover.js";
import {
  DOCUMENT_ENTITY_ACTIVATE_EVENT,
  EntityReference,
  publishDocumentEntityLabels,
  type DocumentEntityCandidate,
  type DocumentEntityTargetKind,
} from "./document-entity-reference.js";
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

const entityKindCopy: Record<DocumentEntityTargetKind, string> = {
  task: "Zadanie",
  project: "Projekt",
  person: "Osoba",
  organization: "Organizacja",
  meeting: "Spotkanie",
};

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

const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

const DocumentToolbar = ({
  editor,
  disabled,
  entityOpen,
  entityQuery,
  entityCandidates,
  onEntityOpenChange,
  onEntityQueryChange,
  onEntitySelect,
}: {
  readonly editor: Editor | null;
  readonly disabled: boolean;
  readonly entityOpen: boolean;
  readonly entityQuery: string;
  readonly entityCandidates: readonly DocumentEntityCandidate[];
  readonly onEntityOpenChange: (open: boolean) => void;
  readonly onEntityQueryChange: (value: string) => void;
  readonly onEntitySelect: (candidate: DocumentEntityCandidate) => void;
}) => {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [activeEntityIndex, setActiveEntityIndex] = useState(0);
  const entityListId = useId();
  useEffect(() => setActiveEntityIndex(0), [entityCandidates, entityQuery]);
  const command = (run: () => boolean) => {
    if (!disabled) run();
  };
  return (
    <div
      className="document-toolbar"
      role="toolbar"
      aria-label="Formatowanie dokumentu"
    >
      <button
        type="button"
        aria-pressed={editor?.isActive("bold") ?? false}
        aria-label="Pogrubienie"
        disabled={disabled}
        onClick={() =>
          command(() => editor?.chain().focus().toggleBold().run() ?? false)
        }
      >
        <strong aria-hidden="true">B</strong>
      </button>
      <button
        type="button"
        aria-pressed={editor?.isActive("italic") ?? false}
        aria-label="Kursywa"
        disabled={disabled}
        onClick={() =>
          command(() => editor?.chain().focus().toggleItalic().run() ?? false)
        }
      >
        <em aria-hidden="true">I</em>
      </button>
      <button
        type="button"
        aria-pressed={editor?.isActive("heading", { level: 2 }) ?? false}
        aria-label="Nagłówek drugiego poziomu"
        disabled={disabled}
        onClick={() =>
          command(
            () =>
              editor?.chain().focus().toggleHeading({ level: 2 }).run() ??
              false,
          )
        }
      >
        <span aria-hidden="true">H2</span>
      </button>
      <button
        type="button"
        aria-pressed={editor?.isActive("bulletList") ?? false}
        aria-label="Lista punktowana"
        disabled={disabled}
        onClick={() =>
          command(
            () => editor?.chain().focus().toggleBulletList().run() ?? false,
          )
        }
      >
        <span aria-hidden="true">• Lista</span>
      </button>
      <button
        type="button"
        aria-pressed={editor?.isActive("orderedList") ?? false}
        aria-label="Lista numerowana"
        disabled={disabled}
        onClick={() =>
          command(
            () => editor?.chain().focus().toggleOrderedList().run() ?? false,
          )
        }
      >
        <span aria-hidden="true">1. Lista</span>
      </button>
      <button
        type="button"
        aria-pressed={editor?.isActive("codeBlock") ?? false}
        aria-label="Blok kodu"
        disabled={disabled}
        onClick={() =>
          command(
            () => editor?.chain().focus().toggleCodeBlock().run() ?? false,
          )
        }
      >
        <span aria-hidden="true">Kod</span>
      </button>
      <InlinePopover
        label="Link"
        panelLabel="Dodaj link do zaznaczonego tekstu"
        triggerClassName="document-link-trigger"
        disabled={disabled}
        open={linkOpen}
        onOpenChange={(open) => {
          setLinkOpen(open);
          if (open) setLinkUrl(editor?.getAttributes("link").href ?? "");
        }}
      >
        <form
          className="document-link-form"
          onSubmit={(event) => {
            event.preventDefault();
            const href = linkUrl.trim();
            if (href === "") {
              editor?.chain().focus().extendMarkRange("link").unsetLink().run();
            } else {
              editor
                ?.chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href })
                .run();
            }
            setLinkOpen(false);
          }}
        >
          <label htmlFor="document-link-url">Adres linku</label>
          <input
            id="document-link-url"
            type="url"
            inputMode="url"
            value={linkUrl}
            placeholder="https://…"
            onChange={(event) => setLinkUrl(event.target.value)}
          />
          <div className="popover-actions">
            <button type="submit" className="primary-button">
              {linkUrl.trim() === "" ? "Usuń link" : "Zastosuj"}
            </button>
          </div>
        </form>
      </InlinePopover>
      <InlinePopover
        label="Powiąż rekord"
        panelLabel="Powiąż dokument z rekordem"
        triggerClassName="document-entity-trigger"
        disabled={disabled}
        open={entityOpen}
        onOpenChange={onEntityOpenChange}
      >
        <div className="document-entity-picker">
          <label htmlFor="document-entity-query">Znajdź rekord</label>
          <input
            id="document-entity-query"
            type="search"
            role="combobox"
            autoFocus
            autoComplete="off"
            aria-expanded={entityOpen}
            aria-controls={entityListId}
            aria-activedescendant={
              entityCandidates[activeEntityIndex] === undefined
                ? undefined
                : `${entityListId}-${activeEntityIndex}`
            }
            value={entityQuery}
            placeholder="Zadanie, projekt, osoba…"
            onChange={(event) => onEntityQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onEntityOpenChange(false);
                editor?.commands.focus();
                return;
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const direction = event.key === "ArrowDown" ? 1 : -1;
                setActiveEntityIndex((current) =>
                  entityCandidates.length === 0
                    ? 0
                    : (current + direction + entityCandidates.length) %
                      entityCandidates.length,
                );
                return;
              }
              if (event.key !== "Enter" && event.key !== "Tab") return;
              const candidate = entityCandidates[activeEntityIndex];
              if (candidate === undefined) return;
              event.preventDefault();
              onEntitySelect(candidate);
            }}
          />
          <div
            id={entityListId}
            className="document-entity-options"
            role="listbox"
            aria-label="Dostępne rekordy"
          >
            {entityCandidates.length === 0 ? (
              <p role="status">Brak pasujących dostępnych rekordów.</p>
            ) : (
              entityCandidates.map((candidate, index) => (
                <div
                  id={`${entityListId}-${index}`}
                  key={`${candidate.targetKind}:${candidate.targetId}`}
                  role="option"
                  aria-selected={index === activeEntityIndex}
                  className={index === activeEntityIndex ? "active" : ""}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveEntityIndex(index)}
                  onClick={() => onEntitySelect(candidate)}
                >
                  <span>{candidate.label}</span>
                  <small>{entityKindCopy[candidate.targetKind]}</small>
                </div>
              ))
            )}
          </div>
        </div>
      </InlinePopover>
    </div>
  );
};

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
  onEntityActivate,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient;
  readonly document: DocumentItem;
  readonly snapshot: DesktopSnapshot;
  readonly inspectorHost: HTMLElement | null;
  readonly onEntityActivate: (target: {
    readonly targetKind: DocumentEntityTargetKind;
    readonly targetId: string;
  }) => void;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const yDocument = useMemo(() => new Y.Doc({ gc: true }), [document.id]);
  const revisionNameId = useId();
  const evidenceHeadingId = useId();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<
    | "opening"
    | "local"
    | "connecting"
    | "current"
    | "offline"
    | "denied"
    | "upgrade_required"
    | "migration_failed"
  >("opening");
  const [access, setAccess] = useState<"view" | "comment" | "edit">("view");
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
  const [saveAcknowledged, setSaveAcknowledged] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [entityOpen, setEntityOpen] = useState(false);
  const [entityQuery, setEntityQuery] = useState("");
  const [entityCandidates, setEntityCandidates] = useState<
    DocumentLinkCandidatesProjection["items"]
  >([]);
  const [linkedTargets, setLinkedTargets] = useState<
    readonly { targetKind: DocumentEntityTargetKind; targetId: string }[]
  >([]);
  const [resolvedLinkedTargets, setResolvedLinkedTargets] = useState<
    DocumentLinkCandidatesProjection["items"]
  >([]);
  const contextLoading = context === undefined && !contextError;
  const migrationPrincipalId =
    snapshot.access.kind === "ready"
      ? snapshot.access.data.currentPrincipalId
      : snapshot.bootstrap.workspace.id;
  const reportLimit = () => {
    setLimitReached(true);
    window.setTimeout(() => setLimitReached(false), 2_500);
  };
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          undoRedo: false,
          link: { openOnClick: false },
        }),
        Placeholder.configure({
          placeholder: "Zacznij pisać. Źródła pozostają osobno.",
        }),
        Collaboration.configure({
          document: yDocument,
          field: RICH_DOCUMENT_FRAGMENT_ROOT,
        }),
        EntityReference,
      ],
      immediatelyRender: false,
      editable: false,
      editorProps: {
        attributes: {
          class: "document-canvas",
          role: "textbox",
          "aria-label": `Treść: ${document.title}`,
          "aria-multiline": "true",
          spellcheck: "true",
        },
        handleKeyDown: (_view, event) => {
          if (
            !(event.metaKey || event.ctrlKey) ||
            event.key.toLowerCase() !== "s"
          )
            return false;
          event.preventDefault();
          setSaveAcknowledged(true);
          window.setTimeout(() => setSaveAcknowledged(false), 1_500);
          return true;
        },
        handleTextInput: (view, from, to, insertedText) => {
          if (
            insertedText === "[" &&
            from === to &&
            from > 0 &&
            view.state.doc.textBetween(from - 1, from, "\n") === "["
          ) {
            view.dispatch(view.state.tr.delete(from - 1, from));
            setEntityQuery("");
            setEntityOpen(true);
            return true;
          }
          const currentLength = view.state.doc.textBetween(
            0,
            view.state.doc.content.size,
            "\n",
          ).length;
          const replacedLength = view.state.doc.textBetween(
            from,
            to,
            "\n",
          ).length;
          if (
            currentLength - replacedLength + insertedText.length <=
            MAX_DOCUMENT_TEXT_LENGTH
          )
            return false;
          reportLimit();
          return true;
        },
        handlePaste: (view, event) => {
          const pastedText = event.clipboardData?.getData("text/plain") ?? "";
          const { from, to } = view.state.selection;
          const currentLength = view.state.doc.textBetween(
            0,
            view.state.doc.content.size,
            "\n",
          ).length;
          const replacedLength = view.state.doc.textBetween(
            from,
            to,
            "\n",
          ).length;
          if (
            currentLength - replacedLength + pastedText.length <=
            MAX_DOCUMENT_TEXT_LENGTH
          )
            return false;
          reportLimit();
          return true;
        },
      },
    },
    [document.id, yDocument],
  );

  useEffect(() => {
    editor?.setEditable(access === "edit" && status !== "migration_failed");
  }, [access, editor, status]);

  useEffect(() => {
    const onActivate = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        { targetKind?: unknown; targetId?: unknown } | undefined;
      if (
        detail &&
        typeof detail.targetId === "string" &&
        typeof detail.targetKind === "string" &&
        detail.targetKind in entityKindCopy
      )
        onEntityActivate({
          targetKind: detail.targetKind as DocumentEntityTargetKind,
          targetId: detail.targetId,
        });
    };
    window.addEventListener(DOCUMENT_ENTITY_ACTIVATE_EVENT, onActivate);
    return () =>
      window.removeEventListener(DOCUMENT_ENTITY_ACTIVATE_EVENT, onActivate);
  }, [onEntityActivate]);

  useEffect(() => {
    if (!entityOpen) return;
    const timer = window.setTimeout(() => {
      void loadDocumentLinkCandidates(
        client,
        snapshot,
        document.spaceId,
        entityQuery,
      )
        .then((projection) => setEntityCandidates(projection.items))
        .catch(() => setEntityCandidates([]));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [client, document.spaceId, entityOpen, entityQuery, snapshot]);

  useEffect(() => {
    if (linkedTargets.length === 0) {
      setResolvedLinkedTargets([]);
      return;
    }
    void loadDocumentLinkCandidates(
      client,
      snapshot,
      document.spaceId,
      "",
      linkedTargets,
    )
      .then((projection) => setResolvedLinkedTargets(projection.items))
      .catch(() => setResolvedLinkedTargets([]));
  }, [client, document.spaceId, linkedTargets, snapshot]);

  useEffect(() => {
    publishDocumentEntityLabels([
      ...resolvedLinkedTargets,
      ...entityCandidates,
    ]);
  }, [entityCandidates, resolvedLinkedTargets]);

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
      try {
        setText(documentPlainText(yDocument));
        const nextLinks = documentEntityReferences(yDocument);
        setLinkedTargets((current) =>
          current.length === nextLinks.length &&
          current.every(
            (item, index) =>
              item.targetKind === nextLinks[index]?.targetKind &&
              item.targetId === nextLinks[index]?.targetId,
          )
            ? current
            : nextLinks,
        );
      } catch {
        setStatus("upgrade_required");
      }
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
      .openDocument({
        documentId: document.id,
        spaceId: document.spaceId,
        supportedDocumentFormats: ["plain-v1", "rich-v1"],
      })
      .then(async (opened) => {
        if (disposed) return;
        if (opened.state !== undefined)
          Y.applyUpdate(yDocument, opened.state, "constellation.bootstrap");
        try {
          const format = documentContentFormat(yDocument);
          if (format === "plain-v1") {
            const legacyText = yDocument
              .getText(LEGACY_DOCUMENT_TEXT_ROOT)
              .toString();
            const digest = await sha256Hex(legacyText);
            if (disposed) return;
            migrateDocumentToRich(yDocument, digest, {
              kind: "human",
              principalId: migrationPrincipalId,
            });
          }
          setText(documentPlainText(yDocument));
          const nextLinks = documentEntityReferences(yDocument);
          setLinkedTargets((current) =>
            current.length === nextLinks.length &&
            current.every(
              (item, index) =>
                item.targetKind === nextLinks[index]?.targetKind &&
                item.targetId === nextLinks[index]?.targetId,
            )
              ? current
              : nextLinks,
          );
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          setStatus(
            message.includes("DOCUMENT_FORMAT_UNSUPPORTED")
              ? "upgrade_required"
              : "migration_failed",
          );
          return;
        }
        setPending(opened.pendingUpdateCount);
        if (opened.mode === "local") {
          setAccess("edit");
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
        if (message.includes("DOCUMENT_SCHEMA_UPGRADE_REQUIRED")) {
          setStatus("upgrade_required");
          return;
        }
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
  }, [
    client,
    document.id,
    document.spaceId,
    migrationPrincipalId,
    sessionGeneration,
    yDocument,
  ]);

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
    upgrade_required: "Wymagana nowsza wersja aplikacji",
    migration_failed: "Nie udało się przygotować edytora",
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
        <div className="document-editor-actions">
          <div className={`document-presence ${status}`} role="status">
            <span aria-hidden="true" />
            {limitReached
              ? "Osiągnięto limit 200 000 znaków"
              : saveAcknowledged
                ? "Zmiany zapisują się automatycznie"
                : statusCopy}
          </div>
          <DocumentToolbar
            editor={editor}
            disabled={
              access !== "edit" ||
              status === "opening" ||
              status === "denied" ||
              status === "upgrade_required" ||
              status === "migration_failed"
            }
            entityOpen={entityOpen}
            entityQuery={entityQuery}
            entityCandidates={entityCandidates}
            onEntityOpenChange={(open) => {
              setEntityOpen(open);
              if (!open) {
                setEntityQuery("");
                setEntityCandidates([]);
              }
            }}
            onEntityQueryChange={setEntityQuery}
            onEntitySelect={(candidate) => {
              editor
                ?.chain()
                .focus()
                .insertContent({
                  type: "entityReference",
                  attrs: {
                    targetKind: candidate.targetKind,
                    targetId: candidate.targetId,
                  },
                })
                .insertContent(" ")
                .run();
              setEntityOpen(false);
              setEntityQuery("");
              setEntityCandidates([]);
            }}
          />
        </div>
      </header>

      <div className="knowledge-writing-plane">
        {status === "denied" ? (
          <div className="document-blocked" role="alert">
            <strong>Ta treść nie jest już dostępna.</strong>
            <p>Lokalna sesja została zamknięta i jej cache usunięty.</p>
          </div>
        ) : status === "upgrade_required" ? (
          <div className="document-blocked" role="alert">
            <strong>Ten dokument używa nowszego formatu.</strong>
            <p>
              Zaktualizuj Constellation, aby edytować treść bez ryzyka utraty
              struktury.
            </p>
          </div>
        ) : status === "migration_failed" ? (
          <div className="document-blocked" role="alert">
            <strong>Nie udało się bezpiecznie przygotować dokumentu.</strong>
            <p>
              Oryginalna treść pozostała zachowana. Możesz ponowić otwarcie.
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setStatus("opening");
                setSessionGeneration((value) => value + 1);
              }}
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : (
          <EditorContent editor={editor} className="document-editor-shell" />
        )}
      </div>

      {inspectorHost && createPortal(documentContextDetail, inspectorHost)}
    </section>
  );
};

export const DocumentsSurface = ({
  client,
  snapshot,
  activeDocumentId,
  inspectorHost,
  onInspectorOpen,
  onEntityActivate,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly activeDocumentId?: DocumentId | undefined;
  readonly inspectorHost: HTMLElement | null;
  readonly onInspectorOpen: (kind: "document" | "source") => void;
  readonly onEntityActivate: (target: {
    readonly targetKind: DocumentEntityTargetKind;
    readonly targetId: string;
  }) => void;
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
  useEffect(() => {
    if (
      activeDocumentId !== undefined &&
      items.some((item) => item.id === activeDocumentId)
    ) {
      setSelectedId(activeDocumentId);
      setSelectedSourceId(undefined);
    }
  }, [activeDocumentId, items]);
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
          onEntityActivate={onEntityActivate}
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
