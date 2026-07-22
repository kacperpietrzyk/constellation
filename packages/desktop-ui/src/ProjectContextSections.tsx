import type { DocumentId, StrategicRecordId } from "@constellation/contracts";

import type { ProjectOverviewProjection } from "./client/workflow.js";
import { formatDate } from "./i18n.js";

const Mark = ({ kind }: { readonly kind: string }) => (
  <span className={`record-mark mark-${kind}`} aria-hidden="true" />
);

export default function ProjectContextSections({
  overview,
  onOpenDocument,
  onOpenMeeting,
  onOpenRelationship,
}: {
  readonly overview: ProjectOverviewProjection;
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
      empty: "Brak klienta połączonego przez szansę lub spotkanie.",
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
        </section>
      ))}
    </div>
  );
}
