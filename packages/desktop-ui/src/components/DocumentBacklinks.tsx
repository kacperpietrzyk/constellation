import { useEffect, useState } from "react";

import type { DocumentId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  loadDocumentBacklinks,
  type DesktopSnapshot,
  type DocumentBacklinksProjection,
} from "../client/workflow.js";

export type DocumentBacklinkTarget = {
  readonly targetKind:
    "task" | "project" | "person" | "organization" | "meeting";
  readonly targetId: string;
};

const backlinkRoleLabels = {
  note: "Note",
  document: "Document",
  deliverable: "Deliverable",
} as const;

export const DocumentBacklinks = ({
  client,
  snapshot,
  target,
  onOpenDocument,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly target: DocumentBacklinkTarget | undefined;
  readonly onOpenDocument: (documentId: DocumentId, title: string) => void;
}) => {
  const [projection, setProjection] = useState<DocumentBacklinksProjection>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!client || !target) {
      setProjection(undefined);
      setUnavailable(false);
      return;
    }
    let active = true;
    setProjection(undefined);
    setUnavailable(false);
    void loadDocumentBacklinks(client, snapshot, target)
      .then((next) => active && setProjection(next))
      .catch(() => active && setUnavailable(true));
    return () => {
      active = false;
    };
  }, [client, snapshot, target?.targetId, target?.targetKind]);

  if (!target) return null;
  return (
    <section className="inspector-section entity-backlinks" aria-live="polite">
      <p className="section-label">Mentioned in documents</p>
      {unavailable ? (
        <p className="entity-backlinks-status">
          Mentions are unavailable right now.
        </p>
      ) : projection === undefined ? (
        <p className="entity-backlinks-status">Checking mentions…</p>
      ) : projection.items.length === 0 ? (
        <p className="entity-backlinks-status">No mentions.</p>
      ) : (
        <ul className="entity-backlinks-list">
          {projection.items.map((item) => (
            <li key={item.documentId}>
              <button
                type="button"
                onClick={() => onOpenDocument(item.documentId, item.title)}
              >
                <span>{item.title}</span>
                <small>{backlinkRoleLabels[item.role]}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
