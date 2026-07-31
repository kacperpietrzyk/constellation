import { strategicRecordReferences } from "@constellation/contracts";
import type { ProjectId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import { DecisionClientSection } from "./components/DecisionClientSection.js";
import { RecordRemovalSection } from "./components/RecordRemovalSection.js";
import {
  recurrenceCadenceLabels,
  strategicStateLabels,
} from "./strategic-labels.js";
import { countLabel, formatDate, recordKindLabels } from "./i18n.js";
import type {
  DesktopSnapshot,
  MutationFailure,
  RelationshipWorkspaceProjection,
} from "./client/workflow.js";

export type StrategicRecord =
  RelationshipWorkspaceProjection["records"][number];

const strategicRecordState = (record: StrategicRecord): string =>
  record.kind === "organization"
    ? record.relationshipState
    : "state" in record
      ? record.state
      : "current";

const strategicRecordTitle = (record: StrategicRecord): string =>
  record.kind === "organization" || record.kind === "person"
    ? record.name
    : record.kind === "relationship_fact"
      ? record.factType
      : record.kind === "saved_view"
        ? record.name
        : "title" in record
          ? record.title
          : (recordKindLabels[record.kind] ?? record.kind);

// Rekord strategiczny w shellowym inspectorze: wybór wiersza na powierzchni
// Relacje (albo klik licznika ofert/projektów) prowadzi tutaj. Powiązane
// oferty wybiera się dalej w inspectorze, a projekty otwierają się jako
// pełnoprawny kontekst shellu.
// What the kernel would refuse this removal for, in the reader's words. The
// same references strategicRecordReferences names on the kernel side, read out
// of the projection the inspector already holds — so the block is explained
// before the click, not after the rejection.
const strategicDependentLabels = (
  record: StrategicRecord,
  records: readonly StrategicRecord[],
): readonly string[] =>
  records
    .filter(
      (candidate) =>
        candidate.id !== record.id &&
        strategicRecordReferences(candidate).includes(record.id),
    )
    .map(
      (candidate) =>
        `${recordKindLabels[candidate.kind] ?? "record"}: ${strategicRecordTitle(candidate)}`,
    );

export const StrategicRecordInspector = ({
  record,
  records,
  projects,
  client,
  snapshot,
  onSelectRecord,
  onOpenProject,
  onRemoved,
  onUpdated,
  onRemoveFailure,
}: {
  readonly record: StrategicRecord;
  readonly records: readonly StrategicRecord[];
  readonly projects: readonly {
    readonly id: ProjectId;
    readonly title: string;
  }[];
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly onSelectRecord: (id: string) => void;
  readonly onOpenProject: (id: ProjectId, title: string) => void;
  readonly onRemoved: (message: string) => Promise<void>;
  // Refresh WITHOUT dropping the selection, where `onRemoved` clears it: a
  // record that was corrected is still there, and the reader is still looking
  // at it.
  readonly onUpdated: (message: string) => Promise<void>;
  readonly onRemoveFailure: (result: MutationFailure) => void;
}) => {
  const state = strategicRecordState(record);
  // Every organisation in the Space the inspector was handed, which is the set
  // the kernel will accept: it refuses an id that is not an organisation in
  // this decision's own Space.
  const organizations = records.filter(
    (item): item is Extract<StrategicRecord, { kind: "organization" }> =>
      item.kind === "organization",
  );
  const organization =
    "organizationId" in record && record.organizationId !== undefined
      ? records.find((item) => item.id === record.organizationId)
      : undefined;
  const organizationName =
    organization?.kind === "organization" ? organization.name : undefined;
  const relatedOpportunities =
    record.kind === "organization"
      ? records.filter(
          (item): item is Extract<StrategicRecord, { kind: "opportunity" }> =>
            item.kind === "opportunity" && item.organizationId === record.id,
        )
      : [];
  const relatedOffers =
    record.kind === "opportunity"
      ? records.filter(
          (item): item is Extract<StrategicRecord, { kind: "offer" }> =>
            item.kind === "offer" && item.opportunityId === record.id,
        )
      : [];
  const linkedProjects =
    record.kind === "opportunity"
      ? projects.filter((project) => record.projectIds.includes(project.id))
      : [];
  const parentOpportunity =
    record.kind === "offer"
      ? records.find(
          (item): item is Extract<StrategicRecord, { kind: "opportunity" }> =>
            item.kind === "opportunity" && item.id === record.opportunityId,
        )
      : undefined;
  return (
    <div className="inspector-body">
      <span className="record-status">
        <i />
        {strategicStateLabels[state] ?? state.replaceAll("_", " ")}
      </span>
      <h2>{strategicRecordTitle(record)}</h2>
      <p className="record-summary">
        {organizationName
          ? `${recordKindLabels[record.kind] ?? "Record"} in the ${organizationName} relationship.`
          : "Versioned strategic record in the active Space."}
      </p>
      {record.kind === "organization" && (
        <>
          <section className="inspector-section provenance-block">
            <p className="section-label">Next move</p>
            <blockquote>{record.nextAction ?? "No next move"}</blockquote>
            <p>This relationship carries opportunities, offers and renewals.</p>
          </section>
          <section className="inspector-section">
            <p className="section-label">
              {countLabel(
                relatedOpportunities.length,
                "opportunity",
                "opportunities",
              )}
            </p>
            {relatedOpportunities.length === 0 ? (
              <p>No opportunities linked to this relationship yet.</p>
            ) : (
              <ul className="inspector-links">
                {relatedOpportunities.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelectRecord(item.id)}
                    >
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {record.kind === "person" && (
        <section className="inspector-section">
          <p className="section-label">Contact details</p>
          <dl className="record-fields">
            <div>
              <dt>Role</dt>
              <dd>{record.role ?? "—"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{record.email ?? "—"}</dd>
            </div>
          </dl>
        </section>
      )}
      {record.kind === "opportunity" && (
        <>
          <section className="inspector-section provenance-block">
            <p className="section-label">Confirmed need</p>
            <blockquote>{record.need}</blockquote>
            <p>Next move: {record.nextAction}</p>
          </section>
          <section className="inspector-section">
            <p className="section-label">
              {countLabel(relatedOffers.length, "offer")}
            </p>
            {relatedOffers.length === 0 ? (
              <p>This opportunity has no offers yet.</p>
            ) : (
              <ul className="inspector-links">
                {relatedOffers.map((offer) => (
                  <li key={offer.id}>
                    <button
                      type="button"
                      onClick={() => onSelectRecord(offer.id)}
                    >
                      {offer.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="inspector-section">
            <p className="section-label">
              {countLabel(linkedProjects.length, "project")}
            </p>
            {linkedProjects.length === 0 ? (
              <p>This opportunity does not lead to a project yet.</p>
            ) : (
              <ul className="inspector-links">
                {linkedProjects.map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => onOpenProject(project.id, project.title)}
                    >
                      {project.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {record.kind === "offer" && (
        <section className="inspector-section provenance-block">
          <p className="section-label">Next move</p>
          <blockquote>{record.nextAction}</blockquote>
          {parentOpportunity && (
            <p>
              Opportunity:{" "}
              <button
                type="button"
                className="inspector-link"
                onClick={() => onSelectRecord(parentOpportunity.id)}
              >
                {parentOpportunity.title}
              </button>
            </p>
          )}
        </section>
      )}
      {record.kind === "renewal" && (
        <section className="inspector-section">
          <p className="section-label">Dates</p>
          <dl className="record-fields">
            <div>
              <dt>Scope</dt>
              <dd>{record.scope}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{formatDate(record.expiresAt)}</dd>
            </div>
          </dl>
        </section>
      )}
      {record.kind === "relationship_fact" && (
        <section className="inspector-section provenance-block">
          <p className="section-label">Confirmed value</p>
          <blockquote>{record.value}</blockquote>
          <p>Verified {formatDate(record.verifiedAt)}.</p>
        </section>
      )}
      {record.kind === "decision" && (
        <>
          <section className="inspector-section provenance-block">
            <p className="section-label">Rationale</p>
            <blockquote>{record.rationale}</blockquote>
            <p>This decision stays part of the versioned history.</p>
          </section>
          {client !== undefined && (
            // Keyed on the record: the control holds the pending choice in
            // local state, and selecting a different decision has to start
            // from that decision's own client, not the previous one's.
            <DecisionClientSection
              key={record.id}
              client={client}
              snapshot={snapshot}
              decision={record}
              organizations={organizations}
              onUpdated={onUpdated}
              onFailure={onRemoveFailure}
            />
          )}
        </>
      )}
      {record.kind === "recurrence" && (
        <section className="inspector-section">
          <p className="section-label">Rule</p>
          <dl className="record-fields">
            <div>
              <dt>Task</dt>
              <dd>{record.taskTitle}</dd>
            </div>
            <div>
              <dt>Cadence</dt>
              <dd>{recurrenceCadenceLabels[record.cadence]}</dd>
            </div>
          </dl>
        </section>
      )}
      {record.kind === "radar_candidate" && (
        <section className="inspector-section provenance-block">
          <p className="section-label">Relevance</p>
          <blockquote>{record.relevance}</blockquote>
          <p>This candidate is waiting for a decision in Organizations.</p>
        </section>
      )}
      {client !== undefined && (
        <RecordRemovalSection
          client={client}
          snapshot={snapshot}
          record={record}
          dependentLabels={strategicDependentLabels(record, records)}
          onRemoved={onRemoved}
          onFailure={onRemoveFailure}
        />
      )}
    </div>
  );
};
