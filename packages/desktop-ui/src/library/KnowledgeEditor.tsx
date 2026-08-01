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
  STRUCTURED_DOCUMENT_HEADING_LEVELS,
  documentContentFormat,
  documentEntityReferences,
  documentPlainText,
  migrateDocumentToRich,
} from "@constellation/realtime-documents";

import {
  createNamedKnowledgeVersion,
  attachManagedFileToDocument,
  loadKnowledgeDocumentContext,
  loadDocumentLinkCandidates,
  setKnowledgeEvidence,
  type DesktopSnapshot,
  type KnowledgeDocumentContextProjection,
  type MutationFailure,
  type DocumentLinkCandidatesProjection,
} from "../client/workflow.js";
import { InlinePopover } from "../components/InlinePopover.js";
import {
  DOCUMENT_ENTITY_ACTIVATE_EVENT,
  EntityReference,
  publishDocumentEntityLabels,
  type DocumentEntityCandidate,
  type DocumentEntityTargetKind,
} from "../document-entity-reference.js";
import { countLabel, formatDateTime } from "../i18n.js";
import { roleCopy, type DocumentItem } from "./library-chrome.js";

const entityKindCopy: Record<DocumentEntityTargetKind, string> = {
  task: "Task",
  project: "Project",
  person: "Person",
  organization: "Organization",
  meeting: "Meeting",
};

const milestoneCopy = {
  finalized: "Finalized",
  delivered: "Delivered",
  approved: "Approved",
  published: "Published",
} as const;

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
      aria-label="Document formatting"
    >
      <button
        type="button"
        aria-pressed={editor?.isActive("bold") ?? false}
        aria-label="Bold"
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
        aria-label="Italic"
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
        aria-label="Heading 2"
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
        aria-label="Bulleted list"
        disabled={disabled}
        onClick={() =>
          command(
            () => editor?.chain().focus().toggleBulletList().run() ?? false,
          )
        }
      >
        <span aria-hidden="true">• List</span>
      </button>
      <button
        type="button"
        aria-pressed={editor?.isActive("orderedList") ?? false}
        aria-label="Numbered list"
        disabled={disabled}
        onClick={() =>
          command(
            () => editor?.chain().focus().toggleOrderedList().run() ?? false,
          )
        }
      >
        <span aria-hidden="true">1. List</span>
      </button>
      <button
        type="button"
        aria-pressed={editor?.isActive("codeBlock") ?? false}
        aria-label="Code block"
        disabled={disabled}
        onClick={() =>
          command(
            () => editor?.chain().focus().toggleCodeBlock().run() ?? false,
          )
        }
      >
        <span aria-hidden="true">Code</span>
      </button>
      <InlinePopover
        label="Link"
        panelLabel="Add a link to the selected text"
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
          <label htmlFor="document-link-url">Link address</label>
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
              {linkUrl.trim() === "" ? "Remove link" : "Apply"}
            </button>
          </div>
        </form>
      </InlinePopover>
      <InlinePopover
        label="Link record"
        panelLabel="Link this document to a record"
        triggerClassName="document-entity-trigger"
        disabled={disabled}
        open={entityOpen}
        onOpenChange={onEntityOpenChange}
      >
        <div className="document-entity-picker">
          <label htmlFor="document-entity-query">Find record</label>
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
            placeholder="Task, project, person…"
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
            aria-label="Available records"
          >
            {entityCandidates.length === 0 ? (
              <p role="status">No matching records.</p>
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

export const KnowledgeEditor = ({
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
  const [searchIndexState, setSearchIndexState] = useState<
    "current" | "rebuilding" | "unavailable"
  >("rebuilding");
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
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentStates, setAttachmentStates] = useState<
    Record<string, "checking" | "available" | "unavailable">
  >({});
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
          // Poziomy nagłówków biorą się z kontraktu treści, nie z domyślnych
          // ustawień StarterKita: walidator i edytor mają przyjmować ten sam
          // zbiór, a przepisanie go tutaj z powrotem na literał odtworzyłoby
          // dokładnie to rozejście, które ta stała zamyka.
          heading: { levels: [...STRUCTURED_DOCUMENT_HEADING_LEVELS] },
        }),
        Placeholder.configure({
          placeholder: "Start writing. Sources stay separate.",
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
          "aria-label": `Body: ${document.title}`,
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
        const managed = value.evidence.filter(
          (item) => item.attachment !== undefined,
        );
        setAttachmentStates(
          Object.fromEntries(
            managed.map((item) => [item.recordId, "checking"]),
          ),
        );
        void Promise.all(
          managed.map(async (item) => {
            const attachment = item.attachment!;
            const inspected = await client
              .inspectManagedPayload?.({
                captureId: attachment.captureId,
                original: attachment.original,
              })
              .catch(() => ({ state: "unavailable" as const }));
            setAttachmentStates((current) => ({
              ...current,
              [item.recordId]: inspected?.state ?? attachment.availability,
            }));
          }),
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
        setSearchIndexState(opened.searchIndexState);
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
    opening: "Opening…",
    local: "Saved locally",
    connecting: "Connecting…",
    current: "Collaboration live",
    offline:
      pending > 0
        ? `Offline · ${countLabel(pending, "change")} waiting`
        : "Offline",
    denied: "Access was revoked",
    upgrade_required: "Needs a newer version of the app",
    migration_failed: "Could not prepare the editor",
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
            <p className="eyebrow">Frozen state</p>
            <h4 id={revisionNameId}>Named versions</h4>
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
                    message: `${result.message} The content revision is saved; link the version again.`,
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
                    "Could not freeze the version. The content is still saved.",
                }),
              )
              .finally(() => setBusy(false));
          }}
        >
          <label htmlFor={`${revisionNameId}-name`}>Version name</label>
          <div className="named-version-controls">
            <input
              id={`${revisionNameId}-name`}
              name="versionName"
              value={revisionName}
              maxLength={120}
              onChange={(event) => setRevisionName(event.target.value)}
              placeholder="e.g. Client report · Jul 15"
            />
            <button className="primary-button" disabled={busy}>
              {busy ? "Freezing…" : "Freeze version"}
            </button>
          </div>
          <fieldset className="milestone-options">
            <legend>Version milestone</legend>
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
              Loading named versions…
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
                  {countLabel(version.evidence.length, "evidence item")} ·{" "}
                  {version.evidence.some((item) => item.changed)
                    ? "sources changed since"
                    : "evidence still matches"}
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
                  Restore as a new change
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="inline-empty">
            A version appears when you finalize or deliver.
          </p>
        )}
      </section>

      <section
        className="evidence-inspector"
        aria-labelledby={evidenceHeadingId}
      >
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Evidence state</p>
            <h4 id={evidenceHeadingId}>Sources and notes</h4>
          </div>
          <span>
            {context ? selectedSources.length + selectedNotes.length : "–"}
          </span>
        </div>
        <div className="document-attachment-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={attachmentBusy || access !== "edit"}
            onClick={() => {
              setAttachmentBusy(true);
              void attachManagedFileToDocument(client, snapshot, document.id)
                .then(async (result) => {
                  if (result.kind !== "success") {
                    if (result.message !== "No file was chosen.")
                      onFailure(result);
                    return;
                  }
                  await onReload();
                  reloadContext();
                })
                .finally(() => setAttachmentBusy(false));
            }}
          >
            {attachmentBusy ? "Securing file…" : "Attach file"}
          </button>
          <p aria-live="polite">
            The file goes to managed storage; the document keeps only the link.
          </p>
        </div>
        {context?.evidence.some((item) => item.attachment !== undefined) && (
          <ul className="document-attachment-list" aria-label="Attachments">
            {context.evidence.flatMap((item) =>
              item.attachment === undefined ||
              (item.attachment.original.kind !== "managed_file" &&
                item.attachment.original.kind !== "screenshot")
                ? []
                : (() => {
                    const custodyState =
                      attachmentStates[item.recordId] ?? "checking";
                    return [
                      <li key={item.recordId}>
                        <div>
                          <strong>
                            {item.attachment.original.payload.displayName}
                          </strong>
                          <small>
                            {item.attachment.original.payload.mediaType} ·{" "}
                            {Math.ceil(
                              item.attachment.original.payload.byteLength /
                                1024,
                            )}{" "}
                            KB
                          </small>
                        </div>
                        <span className={`attachment-state ${custodyState}`}>
                          {custodyState === "available"
                            ? "In managed storage"
                            : custodyState === "checking"
                              ? "Checking storage…"
                              : "File not available on this device"}
                        </span>
                        {custodyState === "unavailable" && (
                          <button
                            type="button"
                            className="text-button"
                            disabled={attachmentBusy}
                            onClick={() => {
                              setAttachmentBusy(true);
                              void client
                                .restoreManagedPayload?.({
                                  captureId: item.attachment!.captureId,
                                  original: item.attachment!.original,
                                })
                                .then((result) => {
                                  setAttachmentStates((current) => ({
                                    ...current,
                                    [item.recordId]:
                                      result?.state ?? "unavailable",
                                  }));
                                })
                                .finally(() => setAttachmentBusy(false));
                            }}
                          >
                            Fetch again
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-button"
                          disabled={attachmentBusy || access !== "edit"}
                          onClick={() => {
                            setAttachmentBusy(true);
                            void setKnowledgeEvidence(
                              client,
                              snapshot,
                              document.id,
                              selectedSources.filter(
                                (id) => id !== item.recordId,
                              ),
                              selectedNotes,
                            )
                              .then(async (result) => {
                                if (result.kind !== "success")
                                  return onFailure(result);
                                await onReload();
                                reloadContext();
                              })
                              .finally(() => setAttachmentBusy(false));
                          }}
                        >
                          Unlink
                        </button>
                      </li>,
                    ];
                  })(),
            )}
          </ul>
        )}
        {contextError ? (
          <div className="inline-error" role="alert">
            <strong>Could not read the evidence.</strong>
            <button className="text-button" onClick={reloadContext}>
              Try again
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
              <legend>Sources</legend>
              {allSources.length === 0 ? (
                <p className="inline-empty">Save a source first.</p>
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
                      <small>Source · v{source.version}</small>
                    </span>
                  </label>
                ))
              )}
            </fieldset>
            <fieldset disabled={contextLoading}>
              <legend>Notes</legend>
              {noteCandidates.length === 0 ? (
                <p className="inline-empty">No other notes in this Space.</p>
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
                      <small>Note · v{note.version}</small>
                    </span>
                  </label>
                ))
              )}
            </fieldset>
            <button
              className="secondary-button"
              disabled={busy || contextLoading}
            >
              {busy ? "Saving…" : "Save evidence set"}
            </button>
          </form>
        )}
      </section>

      {revisions.length > 0 && (
        <details className="technical-revisions">
          <summary>Working revisions ({revisions.length})</summary>
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
          <p className="sr-only" role="status">
            {searchIndexState === "current"
              ? "This document is searchable."
              : searchIndexState === "rebuilding"
                ? "Search index is rebuilding. Editing still works."
                : "Search index is unavailable. Editing still works."}
          </p>
          <div className={`document-presence ${status}`} role="status">
            <span aria-hidden="true" />
            {limitReached
              ? "Reached the 200,000 character limit"
              : saveAcknowledged
                ? "Changes save automatically"
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
            <strong>This content is no longer available.</strong>
            <p>The local session was closed and its cache removed.</p>
          </div>
        ) : status === "upgrade_required" ? (
          <div className="document-blocked" role="alert">
            <strong>This document uses a newer format.</strong>
            <p>Update Constellation to edit it without losing structure.</p>
          </div>
        ) : status === "migration_failed" ? (
          <div className="document-blocked" role="alert">
            <strong>Could not prepare the document safely.</strong>
            <p>The original content is intact. You can open it again.</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setStatus("opening");
                setSessionGeneration((value) => value + 1);
              }}
            >
              Try again
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
