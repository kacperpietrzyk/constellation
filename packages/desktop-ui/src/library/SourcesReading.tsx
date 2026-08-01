import { useId, useState } from "react";
import { createPortal } from "react-dom";

import type { KnowledgeSourceId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  createKnowledgeSource,
  updateKnowledgeSourceTitle,
  type DesktopSnapshot,
  type KnowledgeSourceRecord,
  type MutationFailure,
} from "../client/workflow.js";
import { InlinePopover } from "../components/InlinePopover.js";
import { formatDateTime } from "../i18n.js";
import {
  EvidenceMotif,
  availabilityCopy,
  sourceKindCopy,
} from "./library-chrome.js";

// Odczyt „Źródła" Biblioteki. Tu leży to, co powłoka wozi dzisiaj — lista
// źródeł, wejście „Add source" i karta źródła w inspektorze — przeniesione
// z jednego pliku ekranu bez zmiany zachowania. Ekran Źródeł z fali Knowledge
// (cztery rodzaje, dostępność, data obserwacji, prowieniencja wrzutki)
// dostawia się TUTAJ i tylko tutaj: żaden inny odczyt nie czyta
// `snapshot.knowledge.sources`.

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
        <p className="eyebrow">Source</p>
        <h3 id={`${renameId}-title`}>{source.title}</h3>
      </header>
      <section className="inspector-section">
        <p className="section-label">Metadata</p>
        <dl className="record-fields">
          <div>
            <dt>Kind</dt>
            <dd>{sourceKindCopy[source.sourceKind]}</dd>
          </div>
          <div>
            <dt>Availability</dt>
            <dd>{availabilityCopy[source.availability]}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd className="mono">v{source.version}</dd>
          </div>
          <div>
            <dt>Observed</dt>
            <dd>{formatDateTime(source.observedAt)}</dd>
          </div>
        </dl>
      </section>
      {source.canonicalUrl !== undefined && (
        <section className="inspector-section">
          <p className="section-label">Source URL</p>
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
        <label htmlFor={`${renameId}-input`}>Change title</label>
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
          {busy ? "Saving…" : "Save title"}
        </button>
      </form>
    </article>
  );
};

export const SourcesReading = ({
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
  readonly onInspectorOpen: () => void;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const knowledge =
    snapshot.knowledge.kind === "ready" ? snapshot.knowledge.data : undefined;
  const [selectedSourceId, setSelectedSourceId] = useState<KnowledgeSourceId>();
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const selectedSource = knowledge?.sources.find(
    (source) => source.id === selectedSourceId,
  );
  const inspectorControls = inspectorHost
    ? { "aria-controls": "document-inspector-detail" }
    : {};

  return (
    <div className="knowledge-layout">
      <aside className="knowledge-library" aria-label="Sources">
        <div
          className="knowledge-create-bar"
          aria-label="Create in the library"
        >
          <InlinePopover
            label="Add source"
            panelLabel="Add a source to the library"
            open={openCreate}
            onOpenChange={setOpenCreate}
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
                  setOpenCreate(false);
                  await onReload();
                });
              }}
            >
              <label htmlFor="knowledge-source-title">Save a source</label>
              <input
                id="knowledge-source-title"
                name="sourceTitle"
                required
                value={sourceTitle}
                onChange={(event) => setSourceTitle(event.target.value)}
                placeholder="What is worth keeping?"
                maxLength={500}
              />
              <input
                name="sourceUrl"
                type="url"
                aria-label="Source URL"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://… (optional)"
              />
              <button className="primary-button" disabled={creating}>
                Save source
              </button>
            </form>
          </InlinePopover>
        </div>

        <section className="library-section" aria-labelledby="sources-title">
          <div className="library-section-heading">
            <h2 id="sources-title">Sources</h2>
            <span>{knowledge?.sources.length ?? 0}</span>
          </div>
          {snapshot.knowledge.kind === "unavailable" ? (
            <div className="inline-error" role="status">
              Source metadata is unavailable right now.
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
                      onInspectorOpen();
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
              <p>A source stays separate, even when it later feeds a note.</p>
            </div>
          )}
        </section>
      </aside>

      <section className="knowledge-welcome">
        <EvidenceMotif />
        <h2>From source to version, without losing provenance</h2>
        <p>
          Save a source, expand it in a note, and freeze a deliverable when it
          matters.
        </p>
      </section>

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
