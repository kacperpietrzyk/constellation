import type { DocumentId } from "@constellation/contracts";

import type { DocumentListProjection } from "../client/workflow.js";
import { formatDate } from "../i18n.js";
import styles from "./record-panels.module.css";

// Documents that hang OFF the project — deliverables, offers, meeting notes.
//
// The project's own document is not here. It is in Overview, because it is the
// record's BODY and not an attachment: a reader who has to open a tab to find
// out what the project is for has been told the outcome is optional.
//
// These are not selectable rows. There is nothing to preview in an inspector —
// a document is a place you go — so one click goes there and the panel draws no
// `data-row` and joins no roving tab stop. A list that looked selectable and
// then navigated instead would be two behaviours wearing one appearance.

export type RecordDocument = DocumentListProjection["items"][number];

/** The three roles the projection can carry, named for a reader. The vocabulary
 *  is the domain's, not this screen's: an "offer" is a deliverable here until
 *  the model says otherwise, and inventing a fourth label would put a word on
 *  screen that nothing can ever set. */
export const DOCUMENT_ROLE_LABELS: Record<RecordDocument["role"], string> = {
  note: "Note",
  document: "Document",
  deliverable: "Deliverable",
};

/** Most recently touched first. "What changed" is the question a document list
 *  on a record is read with; alphabetical order answers a different one. Ties
 *  break on the title so a batch written in one command holds still between
 *  renders, and titles are record CONTENT, so they collate as Polish. */
const byRecency = (
  documents: readonly RecordDocument[],
): readonly RecordDocument[] =>
  [...documents].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.title.localeCompare(right.title, "pl"),
  );

export const RecordDocumentsPanel = ({
  documents,
  timeZone,
  onOpen,
}: {
  readonly documents: readonly RecordDocument[];
  readonly timeZone: string;
  readonly onOpen: (documentId: DocumentId) => void;
}) => {
  if (documents.length === 0)
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No documents</p>
          <p className={styles.emptyBody}>
            Deliverables, offers and meeting notes attached to this project
            appear here.
          </p>
        </div>
      </div>
    );

  return (
    <div className={styles.panel}>
      <ul className={styles.docs}>
        {byRecency(documents).map((entry) => (
          <li key={entry.id}>
            <button
              className={styles.doc}
              onClick={() => onOpen(entry.id)}
              type="button"
            >
              <span aria-hidden="true" className={styles.docMark}>
                ▤
              </span>
              <span className={styles.docTitle}>{entry.title}</span>
              <span className={styles.docRole}>
                {DOCUMENT_ROLE_LABELS[entry.role]}
              </span>
              <span className={styles.docWhen}>
                {formatDate(entry.updatedAt, timeZone)}
              </span>
              {/* The arrow appears on hover and focus only. Thirteen permanent
                  arrows down a panel read as an invoice, not as a hint. */}
              <span aria-hidden="true" className={styles.docGo}>
                →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
