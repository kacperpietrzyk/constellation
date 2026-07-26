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
          Nie udało się wczytać organizacji, więc nie można teraz połączyć
          klienta.
        </small>
      ) : candidates.length === 0 ? (
        <small>
          Brak organizacji do połączenia w przestrzeni tego projektu.
        </small>
      ) : (
        <>
          <label className="sr-only" htmlFor="project-client-link">
            Organizacja klienta do połączenia
          </label>
          <select
            id="project-client-link"
            value={selected}
            disabled={busy}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">Wybierz klienta…</option>
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
            Połącz klienta
          </button>
        </>
      )}
      {detachable.map((organization) =>
        confirmingId === organization.id ? (
          <Fragment key={organization.id}>
            <small>
              Odłączenie usuwa tylko bezpośrednie powiązanie. Klient wskazany
              też przez szansę lub spotkanie zostanie na liście.
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
              Potwierdź odłączenie
            </button>
            <button
              type="button"
              className="secondary-button compact"
              disabled={busy}
              onClick={() => setConfirmingId(undefined)}
            >
              Anuluj
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
            Odłącz „{organization.name}”
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
      eyebrow: "Kontekst relacji",
      title: "Klient",
      // Named the three reaches rather than the two it used to, because since
      // 0.1.5 a Project can be linked straight to an Organization and this line
      // was telling the reader to go looking for a deal that need not exist.
      empty: "Brak klienta połączonego przez szansę, spotkanie lub powiązanie.",
      wide: true,
      items: overview.clientOrganizations.map((organization) => ({
        id: organization.id,
        kind: "organization",
        title: organization.name,
        detail: "Klient projektu",
        status:
          organization.relationshipState === "active"
            ? "Aktywny"
            : organization.relationshipState === "prospect"
              ? "Prospekt"
              : "Nieaktywny",
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
      eyebrow: "Rozmowy",
      title: "Spotkania",
      empty: "Żadne spotkanie nie zostało jeszcze skierowane do projektu.",
      items: overview.relatedMeetings.map((meeting) => ({
        id: meeting.id,
        kind: "meeting",
        title: meeting.title,
        detail: formatDate(meeting.startedAt),
        status: meeting.triage === "ready" ? "Gotowe" : "Do przeglądu",
        onOpen: () => onOpenMeeting(meeting.id),
      })),
    },
    {
      key: "documents",
      eyebrow: "Materiały",
      title: "Dokumenty",
      empty: "Dodaj odnośnik do projektu w dokumencie, aby pojawił się tutaj.",
      items: overview.relatedDocuments.map((document) => ({
        id: document.id,
        kind: "document",
        title: document.title,
        detail:
          document.role === "deliverable"
            ? "Rezultat"
            : document.role === "note"
              ? "Notatka"
              : "Dokument",
        status: formatDate(document.updatedAt),
        onOpen: () => onOpenDocument(document.id, document.title),
      })),
    },
    {
      key: "decisions",
      eyebrow: "Ustalenia",
      title: "Decyzje",
      empty: "Brak decyzji wskazujących ten projekt.",
      items: overview.relatedDecisions.map((decision) => ({
        id: decision.id,
        kind: "decision",
        title: decision.title,
        detail: "Decyzja projektu",
        status: decision.state === "current" ? "Aktualna" : "Zastąpiona",
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
