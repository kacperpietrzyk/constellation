import { useEffect, useState } from "react";

import type { DocumentId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  createDocument,
  type DesktopSnapshot,
  type MutationFailure,
} from "../client/workflow.js";
import { InlinePopover } from "../components/InlinePopover.js";
import type { DocumentEntityTargetKind } from "../document-entity-reference.js";
import { countLabel } from "../i18n.js";
import { KnowledgeEditor } from "./KnowledgeEditor.js";
import {
  EvidenceMotif,
  roleAccusativeCopy,
  roleCopy,
} from "./library-chrome.js";

// Odczyt „Notatki" Biblioteki: lista treści, wejście „New content" i płaszczyzna
// pisania. Przeniesione z jednego pliku ekranu bez zmiany zachowania.
//
// Ekran Notatek z fali Knowledge — trzy panele, drzewo folderów z licznikami,
// przełącznik `Folder │ Record │ Date` — dostawia się TUTAJ: drzewo wchodzi
// jako pierwszy panel przed `.knowledge-library`, a lista zostaje drugim.
// Żaden inny odczyt nie czyta `snapshot.documents`.

export const NotesReading = ({
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
  readonly onInspectorOpen: () => void;
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
  const [newTitle, setNewTitle] = useState("");
  const [newRole, setNewRole] = useState<"note" | "document" | "deliverable">(
    "note",
  );
  const [creating, setCreating] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  useEffect(() => {
    if (
      activeDocumentId !== undefined &&
      items.some((item) => item.id === activeDocumentId)
    ) {
      setSelectedId(activeDocumentId);
    }
  }, [activeDocumentId, items]);
  const inspectorControls = inspectorHost
    ? { "aria-controls": "document-inspector-detail" }
    : {};

  return (
    <div className="knowledge-layout">
      <aside className="knowledge-library" aria-label="Notes">
        <div
          className="knowledge-create-bar"
          aria-label="Create in the library"
        >
          <InlinePopover
            label="New content"
            panelLabel="Create content in the library"
            open={openCreate}
            onOpenChange={setOpenCreate}
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
                    setNewTitle("");
                    setOpenCreate(false);
                    await onReload();
                  },
                );
              }}
            >
              <label htmlFor="knowledge-title">New content</label>
              <input
                id="knowledge-title"
                name="knowledgeTitle"
                required
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="Note or deliverable title"
                maxLength={500}
              />
              <div
                className="role-options"
                role="group"
                aria-label="Content kind"
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
                Create {roleAccusativeCopy[newRole]}
              </button>
            </form>
          </InlinePopover>
        </div>

        <section className="library-section" aria-labelledby="documents-title">
          <div className="library-section-heading">
            <h2 id="documents-title">Content</h2>
            <span>{items.length}</span>
          </div>
          {snapshot.documents.kind === "unavailable" ? (
            <p className="inline-error">
              Content is not available in this scope.
            </p>
          ) : items.length === 0 ? (
            <div className="library-empty">
              <p>A note can evolve. A deliverable keeps named versions.</p>
            </div>
          ) : (
            <ul className="knowledge-document-list">
              {items.map((item) => {
                const summary = knowledge?.documents.find(
                  (candidate) => candidate.id === item.id,
                );
                const active = selected?.id === item.id;
                return (
                  <li key={item.id}>
                    <button
                      className={active ? "active" : ""}
                      aria-current={active ? "page" : undefined}
                      {...inspectorControls}
                      onClick={() => {
                        setSelectedId(item.id);
                        onInspectorOpen();
                      }}
                    >
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {roleCopy[item.role]} ·{" "}
                          {countLabel(
                            summary?.evidenceCount ?? 0,
                            "evidence item",
                          )}
                        </small>
                      </span>
                      {summary?.staleEvidence && (
                        <em title="Evidence changed since the last version">
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
          inspectorHost={inspectorHost}
          onEntityActivate={onEntityActivate}
          onReload={onReload}
          onFailure={onFailure}
        />
      ) : (
        <section className="knowledge-welcome">
          <EvidenceMotif />
          <h2>From source to version, without losing provenance</h2>
          <p>
            Save a source, expand it in a note, and freeze a deliverable when it
            matters.
          </p>
        </section>
      )}
    </div>
  );
};
