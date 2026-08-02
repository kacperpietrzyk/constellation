import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { HocuspocusProvider } from "@hocuspocus/provider";
import Collaboration from "@tiptap/extension-collaboration";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { SERVABLE_IMAGE_MEDIA_TYPES } from "@constellation/contracts";
import type { DocumentId, KnowledgeSourceId } from "@constellation/contracts";
import type {
  ConstellationRendererClient,
  RendererDocumentRevision,
} from "@constellation/desktop-preload/client";
import * as Y from "yjs";
import {
  LEGACY_DOCUMENT_TEXT_ROOT,
  MAX_DOCUMENT_TEXT_LENGTH,
  MAX_IMAGE_ALT_LENGTH,
  RICH_DOCUMENT_FRAGMENT_ROOT,
  documentContentFormat,
  documentEntityReferences,
  documentPlainText,
  markdownRecordUri,
  migrateDocumentToRich,
  noteMarkdownFile,
  structuredDocumentFromYjs,
  structuredDocumentToMarkdown,
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
import {
  InlinePopover,
  reportFirstEmptyRequiredField,
} from "../components/InlinePopover.js";
import {
  DOCUMENT_ENTITY_ACTIVATE_EVENT,
  documentEntityKindCopy,
  publishDocumentEntityLabels,
  type DocumentEntityCandidate,
  type DocumentEntityTargetKind,
} from "../document-entity-reference.js";
import { DOCUMENT_SCHEMA_EXTENSIONS } from "../document-editor-extensions.js";

import { useInlineSuggestions } from "../components/InlineSuggestions.js";
import { countLabel, formatDateTime } from "../i18n.js";
import { roleCopy, type DocumentItem } from "./library-chrome.js";

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
                  <small>{documentEntityKindCopy[candidate.targetKind]}</small>
                </div>
              ))
            )}
          </div>
        </div>
      </InlinePopover>
    </div>
  );
};

/**
 * CHANGING THE NAME OF THE NOTE YOU ARE READING.
 *
 * `document.rename` shipped in #212 and until this control existed a note's
 * title could be changed by an agent through MCP and by nobody else — the gap
 * Wave D named was half-closed, and the wave's own sentence, *every screen
 * shows the title and none offers to change it*, was still true of the
 * interface. It sits in the reading pane's header because that is the band
 * that already carries the name (`h2#document-title` names the whole pane),
 * beside the other whole-note action there. The list row was the alternative
 * and was rejected: a row's controls are about WHERE a note is filed, and
 * renaming from a row renames a note the reader is not reading.
 *
 * WHAT THE COMMAND REFUSES, SAID HERE RATHER THAN DISCOVERED IN A TOAST. The
 * boundary trims and then demands one character (`command.ts`), so a title of
 * pure whitespace is refused — the browser's own `required` catches an empty
 * field and `reportFirstEmptyRequiredField` names the whitespace case, which
 * passes native validation and would otherwise fail silently a process away.
 * The two rules the command does NOT make are not invented here either: a
 * title another note already carries is accepted, because nothing in this
 * domain makes a note's name unique, and the name the note already has is
 * accepted, for the reason the handler writes down.
 */
const DocumentRenameControl = ({
  title,
  onRename,
}: {
  readonly title: string;
  readonly onRename: (title: string) => Promise<boolean>;
}) => {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);
  return (
    <InlinePopover
      label="Rename"
      onOpenChange={(opening) => {
        // Opening starts from the name the note carries NOW, not from whatever
        // was abandoned in the field last time: a draft kept across a close
        // would offer to overwrite a title somebody else had since changed.
        if (opening) setDraft(title);
        setOpen(opening);
      }}
      open={open}
      panelLabel={`Rename ${title}`}
      triggerClassName="secondary-button document-rename-trigger"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          if (draft.trim() === "") {
            reportFirstEmptyRequiredField(event.currentTarget);
            return;
          }
          setBusy(true);
          void onRename(draft).then((renamed) => {
            setBusy(false);
            if (renamed) setOpen(false);
          });
        }}
      >
        <label htmlFor={`${fieldId}-rename`}>Change title</label>
        <input
          data-document-rename-input="true"
          id={`${fieldId}-rename`}
          maxLength={500}
          name="documentTitle"
          onChange={(event) => setDraft(event.target.value)}
          required
          value={draft}
        />
        <button disabled={busy}>{busy ? "Saving…" : "Save title"}</button>
      </form>
    </InlinePopover>
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
  onRename,
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
  /**
   * Writes the note's new name and answers whether it landed. The command and
   * the version it needs belong to the screen that holds both reads of this
   * note; what belongs here is the one place a reader sees the name.
   */
  readonly onRename: (title: string) => Promise<boolean>;
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
  const [markdownOpen, setMarkdownOpen] = useState(false);
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
  const suggestions = useInlineSuggestions({
    client,
    snapshot,
    spaceId: document.spaceId,
    excludeDocumentId: document.id,
    disabled: access !== "edit" || status === "migration_failed",
  });
  const editor = useEditor(
    {
      extensions: [
        // The schema comes from ONE array both editors spread. Two copies of
        // this list is how the editors and the validator drifted on
        // `heading.levels` in the first place.
        ...DOCUMENT_SCHEMA_EXTENSIONS,
        suggestions.extension,
        Placeholder.configure({
          placeholder: "Start writing. Sources stay separate.",
        }),
        Collaboration.configure({
          document: yDocument,
          field: RICH_DOCUMENT_FRAGMENT_ROOT,
        }),
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

  useEffect(
    () => suggestions.setEditor(editor),
    [editor, suggestions.setEditor],
  );

  useEffect(() => {
    const onActivate = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        { targetKind?: unknown; targetId?: unknown } | undefined;
      if (
        detail &&
        typeof detail.targetId === "string" &&
        typeof detail.targetKind === "string" &&
        detail.targetKind in documentEntityKindCopy
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
      void loadDocumentLinkCandidates(client, snapshot, document.spaceId, {
        text: entityQuery,
        excludeDocumentId: document.id,
      })
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
    void loadDocumentLinkCandidates(client, snapshot, document.spaceId, {
      targets: linkedTargets,
    })
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

  // The per-note markdown PREVIEW (decision #17).
  //
  // It is a preview and not a download on purpose: the storage format is a
  // ProseMirror document inside a Yjs CRDT — not a file anybody can open with
  // anything else — so the export has to be a real transformation whose output
  // you can SEE before you trust two hundred notes to it.
  //
  // It reads through `structuredDocumentFromYjs`, the same parse every agent
  // read and every idempotency digest goes through, rather than off the
  // editor's own JSON. A preview taken from the editor would show markdown for
  // content the product would refuse to store.
  const markdownPreview = useMemo(() => {
    if (!markdownOpen) return undefined;
    // `text` is not read here; it is in the dependency list because it changes
    // on every document update, which is what keeps an open preview current
    // while somebody types.
    void text;
    try {
      const structured = structuredDocumentFromYjs(yDocument);
      const labels = new Map(
        resolvedLinkedTargets.map((item) => [
          `${item.targetKind}:${item.targetId}`,
          item.label,
        ]),
      );
      const body = structuredDocumentToMarkdown(structured, {
        // The SAME read the bulk export resolves through
        // (`document.linkCandidates` with `targets`), so a reference that
        // resolves in one surface resolves in the other. Resolving from the
        // shared render-label map instead would have made the preview print
        // the privacy marker for references that resolve perfectly well —
        // that map is cleared on every publish and holds whatever the
        // surrounding screen last loaded.
        resolveReference: ({ targetKind, targetId }) =>
          labels.get(`${targetKind}:${targetId}`),
        imageLink: (sourceId) => markdownRecordUri("source", sourceId),
      });
      return {
        kind: "ready" as const,
        file: noteMarkdownFile({
          id: document.id,
          title: document.title,
          updatedAt: document.updatedAt,
          body,
          sources: (context?.evidence ?? []).flatMap((item) => {
            if (item.kind !== "source") return [];
            const source = allSources.find(
              (candidate) => candidate.id === item.recordId,
            );
            return source === undefined
              ? []
              : [
                  {
                    title: source.title,
                    sourceKind: source.sourceKind,
                    availability: source.availability,
                    canonicalUrl: source.canonicalUrl,
                  },
                ];
          }),
        }),
      };
    } catch {
      // The parse refuses for the same reasons the editor already reports —
      // content this build cannot read. Saying so beats an empty box.
      return { kind: "unreadable" as const };
    }
  }, [
    allSources,
    context,
    document.id,
    document.title,
    document.updatedAt,
    markdownOpen,
    resolvedLinkedTargets,
    text,
    yDocument,
  ]);

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
                    const attachmentPayload = item.attachment.original.payload;
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
                        {/*
                          The image node's ONLY human producer. It sits here
                          rather than behind a picker in the toolbar because
                          the `sourceId` an image node stores is already in
                          hand at this row — the attachment is the identity,
                          so there is nothing to search for. Without it, both
                          new node kinds would have shipped with no path a
                          person could walk, which is the state the wave's own
                          census ruling names: a capability nothing exercises
                          is indistinguishable from one that was never built.
                        */}
                        {SERVABLE_IMAGE_MEDIA_TYPES.has(
                          attachmentPayload.mediaType,
                        ) && (
                          <button
                            type="button"
                            className="text-button"
                            disabled={
                              attachmentBusy ||
                              access !== "edit" ||
                              editor === null ||
                              custodyState !== "available"
                            }
                            onClick={() => {
                              editor
                                ?.chain()
                                .focus()
                                .insertContent({
                                  type: "image",
                                  attrs: {
                                    sourceId: item.recordId,
                                    // The file's own name is a real
                                    // description far more often than an empty
                                    // string is, and an empty alt means
                                    // "decorative" — a claim nobody made here.
                                    alt: attachmentPayload.displayName.slice(
                                      0,
                                      MAX_IMAGE_ALT_LENGTH,
                                    ),
                                  },
                                })
                                .run();
                            }}
                          >
                            Insert into note
                          </button>
                        )}
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
          <DocumentRenameControl onRename={onRename} title={document.title} />
          <button
            type="button"
            className="secondary-button document-markdown-toggle"
            data-document-markdown-toggle="true"
            aria-expanded={markdownOpen}
            aria-controls="document-markdown-preview"
            onClick={() => setMarkdownOpen((open) => !open)}
          >
            {markdownOpen ? "Hide the markdown" : "Export to Markdown"}
          </button>
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
          <div className="document-editor-frame" ref={suggestions.containerRef}>
            <EditorContent editor={editor} className="document-editor-shell" />
            {suggestions.panel}
          </div>
        )}

        {markdownOpen && (
          <section
            className="document-markdown-preview"
            id="document-markdown-preview"
            aria-label="Markdown export of this note"
          >
            {/* THE DIFFERENCE IS STATED, NOT HIDDEN (OPEN-8c). This surface and
                the full export in Settings produce different markdown for an
                image — here the picture is named by its source, there the bytes
                are written out beside the note. A preview that lied by omission
                would be worse than one that admits a limit, so the sentence is
                rendered whenever the preview is, not only when the note happens
                to hold a picture. */}
            <p data-markdown-preview-statement="true">
              A picture is named here. The full export in Settings writes the
              attachment out.
            </p>
            {markdownPreview?.kind === "ready" ? (
              <pre tabIndex={0}>
                <code>{markdownPreview.file}</code>
              </pre>
            ) : (
              <p role="status">
                This note uses a format this version cannot read. Nothing is
                shown, and nothing changed.
              </p>
            )}
            {contextError && (
              <p role="status">
                The note&rsquo;s sources could not be read. They are missing
                here.
              </p>
            )}
          </section>
        )}
      </div>

      {inspectorHost && createPortal(documentContextDetail, inspectorHost)}
    </section>
  );
};
