import { Fragment, useState, type ReactNode } from "react";

import type { DocumentId, StrategicRecordId } from "@constellation/contracts";

import type { ProjectOverviewProjection } from "./client/workflow.js";
import { formatDate } from "./i18n.js";

const Mark = ({ kind }: { readonly kind: string }) => (
  <span className={`record-mark mark-${kind}`} aria-hidden="true" />
);

/**
 * The authoring row under the Klient card. It stays presentational: the caller
 * has already resolved which Organizations may be offered and which of the
 * listed ones hold a direct link, because both answers are kernel preconditions
 * and this file must not learn them.
 *
 * The detach copy names the direct link on purpose. `clientOrganizations` is a
 * set over three reaches — opportunity, meeting and the direct link — so a
 * client reached by a deal as well stays on the list after detaching, and a
 * shorter sentence would read as a broken button.
 */
const ClientLinkRow = ({
  candidates,
  detachable,
  busy,
  onLink,
  onUnlink,
}: {
  readonly candidates:
    | readonly { readonly id: StrategicRecordId; readonly name: string }[]
    | undefined;
  readonly detachable: readonly {
    readonly id: StrategicRecordId;
    readonly name: string;
  }[];
  readonly busy: boolean;
  readonly onLink: (organizationId: StrategicRecordId) => void;
  readonly onUnlink: (organizationId: StrategicRecordId) => void;
}) => {
  const [selected, setSelected] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | undefined>(
    undefined,
  );
  return (
    <div className="project-context-actions">
      {candidates === undefined ? (
        // Told apart from "there are none" on purpose: the first is a read that
        // did not land and is worth retrying, the second is a fact about the
        // Space. Collapsing them is what left two surfaces saying "unavailable"
        // with nothing naming the cause.
        <small>
          Could not load organizations, so no client can be linked right now.
        </small>
      ) : candidates.length === 0 ? (
        <small>No organization to link in this project’s Space.</small>
      ) : (
        <>
          <label className="sr-only" htmlFor="project-client-link">
            Client organization to link
          </label>
          <select
            id="project-client-link"
            value={selected}
            disabled={busy}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">Choose a client…</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondary-button compact"
            disabled={busy || selected === ""}
            onClick={() => {
              onLink(selected as StrategicRecordId);
              setSelected("");
            }}
          >
            Link client
          </button>
        </>
      )}
      {detachable.map((organization) =>
        confirmingId === organization.id ? (
          <Fragment key={organization.id}>
            <small>
              Only the direct link goes. A client also reached by an opportunity
              or meeting stays listed.
            </small>
            <button
              type="button"
              className="status-danger"
              disabled={busy}
              onClick={() => {
                setConfirmingId(undefined);
                onUnlink(organization.id);
              }}
            >
              Confirm unlink
            </button>
            <button
              type="button"
              className="secondary-button compact"
              disabled={busy}
              onClick={() => setConfirmingId(undefined)}
            >
              Cancel
            </button>
          </Fragment>
        ) : (
          <button
            key={organization.id}
            type="button"
            className="ghost-button"
            disabled={busy}
            onClick={() => setConfirmingId(organization.id)}
          >
            Unlink “{organization.name}”
          </button>
        ),
      )}
    </div>
  );
};

export default function ProjectContextSections({
  overview,
  clientCandidates,
  linkedClientIds,
  busy,
  onLinkClient,
  onUnlinkClient,
  onOpenDocument,
  onOpenMeeting,
  onOpenRelationship,
}: {
  readonly overview: ProjectOverviewProjection;
  readonly clientCandidates:
    | readonly { readonly id: StrategicRecordId; readonly name: string }[]
    | undefined;
  readonly linkedClientIds: ReadonlySet<string>;
  readonly busy: boolean;
  readonly onLinkClient: (organizationId: StrategicRecordId) => void;
  readonly onUnlinkClient: (organizationId: StrategicRecordId) => void;
  readonly onOpenDocument: (id: DocumentId, title: string) => void;
  readonly onOpenMeeting: (id: StrategicRecordId) => void;
  readonly onOpenRelationship: (id: StrategicRecordId) => void;
}) {
  const sections: readonly {
    readonly key: string;
    readonly eyebrow: string;
    readonly title: string;
    readonly empty: string;
    readonly wide?: boolean;
    readonly footer?: ReactNode;
    readonly items: readonly {
      readonly id: string;
      readonly kind: string;
      readonly title: string;
      readonly detail: string;
      readonly status: string;
      readonly onOpen: () => void;
    }[];
  }[] = [
    {
      key: "client",
      eyebrow: "Relationship context",
      title: "Client",
      // Named the three reaches rather than the two it used to, because since
      // 0.1.5 a Project can be linked straight to an Organization and this line
      // was telling the reader to go looking for a deal that need not exist.
      empty: "No client linked by an opportunity, a meeting or a direct link.",
      wide: true,
      items: overview.clientOrganizations.map((organization) => ({
        id: organization.id,
        kind: "organization",
        title: organization.name,
        detail: "Project client",
        status:
          organization.relationshipState === "active"
            ? "Active"
            : organization.relationshipState === "prospect"
              ? "Prospect"
              : "Inactive",
        onOpen: () => onOpenRelationship(organization.id),
      })),
      footer: (
        <ClientLinkRow
          candidates={clientCandidates}
          // The name comes from the listed record, because the id set the
          // caller passes carries no label — and only a listed client can be
          // offered a detach at all.
          detachable={overview.clientOrganizations.filter((organization) =>
            linkedClientIds.has(organization.id),
          )}
          busy={busy}
          onLink={onLinkClient}
          onUnlink={onUnlinkClient}
        />
      ),
    },
    {
      key: "meetings",
      eyebrow: "Conversations",
      title: "Meetings",
      empty: "No meeting has been routed to this project yet.",
      items: overview.relatedMeetings.map((meeting) => ({
        id: meeting.id,
        kind: "meeting",
        title: meeting.title,
        detail: formatDate(meeting.startedAt),
        status: meeting.triage === "ready" ? "Ready" : "To review",
        onOpen: () => onOpenMeeting(meeting.id),
      })),
    },
    {
      key: "documents",
      eyebrow: "Materials",
      title: "Documents",
      empty: "Reference this project from a document and it shows up here.",
      items: overview.relatedDocuments.map((document) => ({
        id: document.id,
        kind: "document",
        title: document.title,
        detail:
          document.role === "deliverable"
            ? "Deliverable"
            : document.role === "note"
              ? "Note"
              : "Document",
        status: formatDate(document.updatedAt),
        onOpen: () => onOpenDocument(document.id, document.title),
      })),
    },
    {
      key: "decisions",
      eyebrow: "Agreements",
      title: "Decisions",
      empty: "No decision references this project.",
      items: overview.relatedDecisions.map((decision) => ({
        id: decision.id,
        kind: "decision",
        title: decision.title,
        detail: "Project decision",
        status: decision.state === "current" ? "Current" : "Superseded",
        onOpen: () => onOpenRelationship(decision.id),
      })),
    },
  ];

  return (
    <div className="project-context-grid">
      {sections.map((section) => (
        <section
          className={`project-context-card reading-panel${section.wide ? " project-client-context" : ""}`}
          aria-labelledby={`project-${section.key}-title`}
          key={section.key}
        >
          <header className="section-heading">
            <div>
              <p className="eyebrow">{section.eyebrow}</p>
              <h2 id={`project-${section.key}-title`}>{section.title}</h2>
            </div>
          </header>
          {section.items.length === 0 ? (
            <p className="capacity-note">{section.empty}</p>
          ) : (
            <div className="compact-record-list">
              {section.items.map((item) => (
                <button type="button" key={item.id} onClick={item.onOpen}>
                  <Mark kind={item.kind} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <em>{item.status}</em>
                </button>
              ))}
            </div>
          )}
          {/* Outside the list/empty branch on purpose: linking the FIRST client
              is the primary case, and that is exactly the empty state. */}
          {section.footer}
        </section>
      ))}
    </div>
  );
}
