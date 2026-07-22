import { useEffect, useId, useMemo, useState } from "react";

import { HocuspocusProvider } from "@hocuspocus/provider";
import Collaboration from "@tiptap/extension-collaboration";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { ProjectId, SpaceId } from "@constellation/contracts";
import type {
  ConstellationRendererClient,
  RendererDocumentRevision,
} from "@constellation/desktop-preload/client";
import {
  MAX_DOCUMENT_TEXT_LENGTH,
  RICH_DOCUMENT_FRAGMENT_ROOT,
  documentEntityReferences,
  documentPlainText,
} from "@constellation/realtime-documents";
import * as Y from "yjs";

import { loadDocumentLinkCandidates } from "./client/workflow.js";
import type { DesktopSnapshot } from "./client/workflow.js";
import {
  DOCUMENT_ENTITY_ACTIVATE_EVENT,
  EntityReference,
  publishDocumentEntityLabels,
  type DocumentEntityCandidate,
  type DocumentEntityTargetKind,
} from "./document-entity-reference.js";

const kindLabel: Record<DocumentEntityTargetKind, string> = {
  task: "Zadanie",
  project: "Projekt",
  person: "Osoba",
  organization: "Organizacja",
  meeting: "Spotkanie",
};

type EditorStatus =
  | "opening"
  | "local"
  | "connecting"
  | "current"
  | "offline"
  | "denied"
  | "upgrade_required";

const statusCopy: Record<EditorStatus, string> = {
  opening: "Otwieram treść…",
  local: "Zapis lokalny",
  connecting: "Łączę współpracę…",
  current: "Współpraca aktualna",
  offline: "Offline · zmiany czekają",
  denied: "Brak dostępu do treści",
  upgrade_required: "Wymagana nowsza wersja aplikacji",
};

export default function ProjectRichBody({
  client,
  snapshot,
  project,
  onEntityActivate,
}: {
  readonly client: ConstellationRendererClient;
  readonly snapshot: DesktopSnapshot;
  readonly project: {
    readonly id: ProjectId;
    readonly spaceId: SpaceId;
    readonly title: string;
  };
  readonly onEntityActivate: (target: {
    readonly targetKind: DocumentEntityTargetKind;
    readonly targetId: string;
  }) => void;
}) {
  const owner = useMemo(
    () => ({ kind: "project", projectId: project.id }) as const,
    [project.id],
  );
  const [contentGeneration, setContentGeneration] = useState(0);
  const yDocument = useMemo(
    () => new Y.Doc({ gc: true }),
    [contentGeneration, project.id],
  );
  const entityListId = useId();
  const revisionNameId = useId();
  const [status, setStatus] = useState<EditorStatus>("opening");
  const [access, setAccess] = useState<"view" | "comment" | "edit">("view");
  const [pending, setPending] = useState(0);
  const [entityOpen, setEntityOpen] = useState(false);
  const [entityQuery, setEntityQuery] = useState("");
  const [entityCandidates, setEntityCandidates] = useState<
    readonly DocumentEntityCandidate[]
  >([]);
  const [resolvedEntityCandidates, setResolvedEntityCandidates] = useState<
    readonly DocumentEntityCandidate[]
  >([]);
  const [activeEntityIndex, setActiveEntityIndex] = useState(0);
  const [revisions, setRevisions] = useState<
    readonly RendererDocumentRevision[]
  >([]);
  const [revisionName, setRevisionName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const [limitReached, setLimitReached] = useState(false);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ undoRedo: false, link: { openOnClick: false } }),
        Placeholder.configure({
          placeholder: "Rozwiń wynik w plan, kontekst i decyzje projektu.",
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
          class: "document-canvas project-document-canvas",
          role: "textbox",
          "aria-label": `Treść projektu: ${project.title}`,
          "aria-multiline": "true",
          spellcheck: "true",
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
          const length = view.state.doc.textBetween(
            0,
            view.state.doc.content.size,
            "\n",
          ).length;
          if (
            length + insertedText.length - (to - from) <=
            MAX_DOCUMENT_TEXT_LENGTH
          )
            return false;
          setLimitReached(true);
          window.setTimeout(() => setLimitReached(false), 2_500);
          return true;
        },
        handlePaste: (view, event) => {
          const pastedText = event.clipboardData?.getData("text/plain") ?? "";
          if (pastedText === "") return false;
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
          setLimitReached(true);
          window.setTimeout(() => setLimitReached(false), 2_500);
          return true;
        },
      },
    },
    [project.id, project.title, yDocument],
  );

  useEffect(() => {
    editor?.setEditable(access === "edit" && status !== "upgrade_required");
  }, [access, editor, status]);

  useEffect(() => {
    if (!entityOpen) return;
    const timer = window.setTimeout(() => {
      void loadDocumentLinkCandidates(
        client,
        snapshot,
        project.spaceId,
        entityQuery,
      )
        .then((projection) => {
          setEntityCandidates(projection.items);
        })
        .catch(() => setEntityCandidates([]));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [client, entityOpen, entityQuery, project.spaceId, snapshot]);

  useEffect(() => setActiveEntityIndex(0), [entityCandidates, entityQuery]);

  useEffect(
    () =>
      publishDocumentEntityLabels([
        ...resolvedEntityCandidates,
        ...entityCandidates,
      ]),
    [entityCandidates, resolvedEntityCandidates],
  );

  const reloadRevisions = () =>
    void client
      .listCollaborativeContentRevisions({ owner })
      .then(setRevisions)
      .catch(() => setRevisions([]));

  useEffect(reloadRevisions, [client, owner]);

  useEffect(() => {
    const activate = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        { targetKind?: unknown; targetId?: unknown } | undefined;
      if (
        detail !== undefined &&
        typeof detail.targetId === "string" &&
        typeof detail.targetKind === "string" &&
        detail.targetKind in kindLabel
      ) {
        onEntityActivate({
          targetKind: detail.targetKind as DocumentEntityTargetKind,
          targetId: detail.targetId,
        });
      }
    };
    window.addEventListener(DOCUMENT_ENTITY_ACTIVATE_EVENT, activate);
    return () =>
      window.removeEventListener(DOCUMENT_ENTITY_ACTIVATE_EVENT, activate);
  }, [onEntityActivate]);

  useEffect(() => {
    let disposed = false;
    let provider: HocuspocusProvider | undefined;
    let renewal: number | undefined;
    let persistTimer: number | undefined;
    let localAuthoritative = false;
    const updates: Uint8Array[] = [];
    const flush = () => {
      if (persistTimer !== undefined) window.clearTimeout(persistTimer);
      persistTimer = undefined;
      if (updates.length === 0) return;
      const update =
        updates.length === 1 ? updates[0]! : Y.mergeUpdates(updates);
      updates.length = 0;
      void client
        .persistCollaborativeContentUpdate({
          owner,
          spaceId: project.spaceId,
          state: Y.encodeStateAsUpdate(yDocument),
          update,
        })
        .then(() => {
          if (!localAuthoritative) setPending((value) => value + 1);
        })
        .catch(() => setStatus("offline"));
    };
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      try {
        documentPlainText(yDocument);
      } catch {
        setStatus("upgrade_required");
      }
      if (origin === "constellation.bootstrap") return;
      updates.push(update.slice());
      persistTimer ??= window.setTimeout(flush, 400);
    };
    yDocument.on("update", onUpdate);
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    void client
      .openCollaborativeContent({
        owner,
        spaceId: project.spaceId,
        supportedDocumentFormats: ["rich-v1"],
      })
      .then((opened) => {
        if (disposed) return;
        if (opened.state !== undefined)
          Y.applyUpdate(yDocument, opened.state, "constellation.bootstrap");
        const linkedTargets = documentEntityReferences(yDocument);
        if (linkedTargets.length > 0)
          void loadDocumentLinkCandidates(
            client,
            snapshot,
            project.spaceId,
            "",
            linkedTargets,
          )
            .then((projection) => setResolvedEntityCandidates(projection.items))
            .catch(() => setResolvedEntityCandidates([]));
        else setResolvedEntityCandidates([]);
        setPending(opened.pendingUpdateCount);
        if (opened.mode === "local") {
          localAuthoritative = true;
          setAccess("edit");
          setStatus("local");
          return;
        }
        if (opened.session === undefined) {
          setStatus("offline");
          renewal = window.setTimeout(
            () => setSessionGeneration((value) => value + 1),
            2_000,
          );
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
              .acknowledgeCollaborativeContentUpdates({
                owner,
                spaceId: project.spaceId,
              })
              .then(() => setPending(0));
          },
          onAuthenticationFailed: () => setStatus("denied"),
          onClose: () => setStatus("offline"),
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
        setStatus(
          message.includes("UPGRADE")
            ? "upgrade_required"
            : message.includes("AVAILABLE")
              ? "denied"
              : "offline",
        );
      });
    return () => {
      disposed = true;
      flush();
      if (renewal !== undefined) window.clearTimeout(renewal);
      provider?.destroy();
      yDocument.off("update", onUpdate);
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [client, owner, project.spaceId, sessionGeneration, snapshot, yDocument]);

  const insertEntity = (candidate: DocumentEntityCandidate) => {
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
      .run();
    setEntityOpen(false);
    setEntityQuery("");
  };

  return (
    <section
      className="project-rich-body reading-panel"
      aria-labelledby="project-body-title"
    >
      <header className="section-heading project-body-heading">
        <div>
          <p className="eyebrow">Dokument projektu</p>
          <h2 id="project-body-title">Plan i kontekst</h2>
        </div>
        <span className={`document-sync-state status-${status}`} role="status">
          {statusCopy[status]}
          {pending > 0 ? ` · ${pending} oczekuje` : ""}
        </span>
      </header>
      <div
        className="document-toolbar"
        role="toolbar"
        aria-label="Formatowanie treści projektu"
      >
        <button
          type="button"
          aria-label="Pogrubienie"
          aria-pressed={editor?.isActive("bold") ?? false}
          disabled={access !== "edit"}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          aria-label="Kursywa"
          aria-pressed={editor?.isActive("italic") ?? false}
          disabled={access !== "edit"}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          aria-label="Nagłówek drugiego poziomu"
          aria-pressed={editor?.isActive("heading", { level: 2 }) ?? false}
          disabled={access !== "edit"}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          H2
        </button>
        <button
          type="button"
          aria-label="Lista punktowana"
          aria-pressed={editor?.isActive("bulletList") ?? false}
          disabled={access !== "edit"}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          • Lista
        </button>
        <button
          type="button"
          aria-expanded={entityOpen}
          aria-controls={entityOpen ? entityListId : undefined}
          disabled={access !== "edit"}
          onClick={() => setEntityOpen((value) => !value)}
        >
          Powiąż rekord
        </button>
      </div>
      {entityOpen && (
        <div className="document-entity-picker project-entity-picker">
          <label htmlFor={`${entityListId}-query`}>Znajdź rekord</label>
          <input
            id={`${entityListId}-query`}
            type="search"
            role="combobox"
            autoFocus
            value={entityQuery}
            aria-expanded="true"
            aria-controls={entityListId}
            onChange={(event) => setEntityQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const direction = event.key === "ArrowDown" ? 1 : -1;
                setActiveEntityIndex((current) =>
                  entityCandidates.length === 0
                    ? 0
                    : (current + direction + entityCandidates.length) %
                      entityCandidates.length,
                );
              } else if (event.key === "Enter") {
                const candidate = entityCandidates[activeEntityIndex];
                if (candidate !== undefined) {
                  event.preventDefault();
                  insertEntity(candidate);
                }
              } else if (event.key === "Escape") {
                setEntityOpen(false);
                editor?.commands.focus();
              }
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
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeEntityIndex}
                  className={index === activeEntityIndex ? "active" : ""}
                  key={`${candidate.targetKind}:${candidate.targetId}`}
                  onMouseEnter={() => setActiveEntityIndex(index)}
                  onClick={() => insertEntity(candidate)}
                >
                  <span>{candidate.label}</span>
                  <small>{kindLabel[candidate.targetKind]}</small>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {limitReached && (
        <p className="capacity-note" role="alert">
          Treść osiągnęła bezpieczny limit długości.
        </p>
      )}
      <EditorContent
        editor={editor}
        className="document-editor-shell project-editor-shell"
      />
      <div className="project-revision-row">
        <label htmlFor={revisionNameId}>Punkt odzyskiwania</label>
        <input
          id={revisionNameId}
          value={revisionName}
          maxLength={120}
          placeholder="np. Przed przeglądem"
          onChange={(event) => setRevisionName(event.target.value)}
        />
        <button
          type="button"
          className="secondary-button compact"
          disabled={busy || access !== "edit" || revisionName.trim() === ""}
          onClick={() => {
            setBusy(true);
            void client
              .createCollaborativeContentRevision({ owner, name: revisionName })
              .then(() => {
                setRevisionName("");
                reloadRevisions();
              })
              .finally(() => setBusy(false));
          }}
        >
          Utwórz punkt
        </button>
      </div>
      {revisions.length > 0 && (
        <ul
          className="project-revision-list"
          aria-label="Punkty odzyskiwania projektu"
        >
          {revisions.slice(0, 5).map((revision) => (
            <li key={revision.id}>
              <span>{revision.name}</span>
              <button
                type="button"
                className="ghost-button"
                disabled={busy || access !== "edit"}
                onClick={() => {
                  setBusy(true);
                  void client
                    .restoreCollaborativeContentRevision({
                      owner,
                      revisionId: revision.id,
                    })
                    .then(() => {
                      setStatus("opening");
                      setContentGeneration((value) => value + 1);
                      reloadRevisions();
                    })
                    .finally(() => setBusy(false));
                }}
              >
                Przywróć
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
