import { Fragment, useEffect, useMemo, useState } from "react";

import type { ProjectId, StrategicRecordId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import { NarrativeText } from "./components/RecordNarrative.js";
import { StrategicCreatePanel } from "./StrategicCreatePanel.js";

import {
  directDeliveryProjects,
  generateRecurrenceOccurrence,
  linkableDeliveryProjects,
  loadOrganizationOverview,
  resolveDecisionImpact,
  resolveRadarCandidate,
  resolveRenewal,
  type DesktopSnapshot,
  type MutationFailure,
  type OrganizationOverviewProjection,
  type RelationshipWorkspaceProjection,
} from "./client/workflow.js";
import { useListNavigation } from "./hooks/useListNavigation.js";
import {
  countLabel,
  formatDate,
  formatDateTime,
  plural,
  recordKindLabels,
} from "./i18n.js";
import {
  recurrenceCadenceLabels,
  strategicStateLabels,
} from "./strategic-labels.js";

type Record = RelationshipWorkspaceProjection["records"][number];
type Radar = Extract<Record, { kind: "radar_candidate" }>;
type Review = Extract<Record, { kind: "impact_review" }>;

// The impact-review audit note is stored data, so it carries the product's
// tool voice instead of an English implementation remark.
const impactReviewNote =
  "Reviewed on the Relationships surface; no automatic changes.";

const StateMark = ({ state }: { readonly state: string }) => (
  <span className={`strategic-state strategic-state--${state}`}>
    <i aria-hidden="true" />
    {strategicStateLabels[state] ?? state.replaceAll("_", " ")}
  </span>
);

export const StrategicDepthSurface = ({
  client,
  snapshot,
  selectedRecordId,
  onSelectRecord,
  onOpenOrganization,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  /** Rekord pokazywany w shellowym inspectorze (select, nie open). */
  readonly selectedRecordId: string | undefined;
  readonly onSelectRecord: (id: string) => void;
  readonly onOpenOrganization: (id: Record["id"], name: string) => void;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const [busyId, setBusyId] = useState<string>();
  const records =
    snapshot.relationships.kind === "ready"
      ? snapshot.relationships.data.records
      : [];
  const organizations = records.filter(
    (record) => record.kind === "organization",
  );
  const opportunities = records.filter(
    (record) => record.kind === "opportunity",
  );
  const offers = records.filter((record) => record.kind === "offer");
  const people = records.filter((record) => record.kind === "person");
  const decisions = records.filter((record) => record.kind === "decision");
  const renewals = records.filter((record) => record.kind === "renewal");
  const facts = records.filter((record) => record.kind === "relationship_fact");
  const reviews = records.filter(
    (record): record is Review => record.kind === "impact_review",
  );
  const recurrences = records.filter((record) => record.kind === "recurrence");
  const radar = useMemo(
    () =>
      snapshot.radar.kind === "ready"
        ? snapshot.radar.data.items.filter(
            (record): record is Radar => record.kind === "radar_candidate",
          )
        : [],
    [snapshot.radar],
  );
  const openConsequences = reviews.flatMap((review) =>
    review.consequences
      .filter((item) => item.state === "open")
      .map((item) => ({ review, item })),
  );
  // Wiersze rekordów są wybieralne i zasilają inspector; nawigacja
  // strzałkami działa na tym samym prymitywie co listy Pracy i kokpitu.
  const orderedOpportunities = organizations.flatMap((organization) =>
    opportunities.filter((item) => item.organizationId === organization.id),
  );
  const timelyRecords = [...renewals, ...facts];
  const supportRecords = [...people, ...decisions, ...recurrences];
  const selectAt =
    (list: readonly Record[]) =>
    (index: number): void => {
      const record = list[index];
      if (record) onSelectRecord(record.id);
    };
  const opportunityNav = useListNavigation({
    itemCount: orderedOpportunities.length,
    onOpen: selectAt(orderedOpportunities),
    onSelect: selectAt(orderedOpportunities),
  });
  const opportunityIndex = new Map(
    orderedOpportunities.map((record, index) => [record.id, index]),
  );
  const timelyNav = useListNavigation({
    itemCount: timelyRecords.length,
    onOpen: selectAt(timelyRecords),
    onSelect: selectAt(timelyRecords),
  });
  const supportNav = useListNavigation({
    itemCount: supportRecords.length,
    onOpen: selectAt(supportRecords),
    onSelect: selectAt(supportRecords),
  });
  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await action();
      await onReload();
    } catch {
      // A rejected transport promise must not leave the surface busy or fail
      // silently; the record state on disk is unchanged.
      onFailure({
        kind: "unavailable",
        message:
          "Could not reach the data layer, so nothing changed. Try again.",
      });
    } finally {
      setBusyId(undefined);
    }
  };
  const resolveRadar = (candidate: Radar, state: "saved" | "dismissed") => {
    if (!client) return;
    void act(`${candidate.id}:${state}`, async () => {
      const result = await resolveRadarCandidate(
        client,
        snapshot,
        candidate,
        state,
      );
      if (result.kind !== "success") onFailure(result);
    });
  };
  const resolveImpact = (review: Review, recordId: string) => {
    if (!client) return;
    void act(`${review.id}:${recordId}`, async () => {
      const result = await resolveDecisionImpact(
        client,
        snapshot,
        review,
        recordId,
        impactReviewNote,
      );
      if (result.kind !== "success") onFailure(result);
    });
  };

  return (
    <div className="surface-scroll strategic-surface">
      <header className="surface-header strategic-header">
        <div>
          <p className="eyebrow">Relationships and reviews</p>
          <h1 id="surface-title" tabIndex={-1}>
            Relationships
          </h1>
          <p>
            Opportunities, offers, renewals and decisions keep their sources and
            history.
          </p>
        </div>
        <div className="strategic-summary" aria-label="Review status">
          <strong>{radar.length + openConsequences.length}</strong>
          <span>
            {plural(
              radar.length + openConsequences.length,
              "item needs a decision",
              "items need a decision",
            )}
          </span>
        </div>
      </header>

      {snapshot.relationships.kind === "ready" && (
        <StrategicCreatePanel
          client={client}
          snapshot={snapshot}
          records={records}
          busy={busyId !== undefined}
          onRun={async (id, operation) => {
            let succeeded = false;
            await act(`create:${id}`, async () => {
              const result = await operation();
              if (result.kind === "success") succeeded = true;
              else onFailure(result);
            });
            return succeeded;
          }}
        />
      )}

      {snapshot.relationships.kind === "unavailable" ? (
        <section className="empty-state" role="status">
          <span className="empty-glyph" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M12 5v8M12 17v.5" />
            </svg>
          </span>
          <div>
            <h2>Relationships are unavailable</h2>
            <p>{snapshot.relationships.message}</p>
          </div>
          <button className="secondary-button" onClick={() => void onReload()}>
            Try again
          </button>
        </section>
      ) : records.length === 0 ? (
        <section className="strategic-empty" role="status">
          <span aria-hidden="true">◇</span>
          <div>
            <h2>Build the first relationship</h2>
            <p>
              A relationship links an organization to a confirmed need, an
              offer, a project, a renewal and a decision, and every step keeps
              its source. Open “Add record” and start with an organization; the
              rest appear once there is something to attach them to.
            </p>
          </div>
        </section>
      ) : (
        <div className="strategic-layout">
          <div className="strategic-work-plane">
            <section
              className="strategic-thread"
              aria-labelledby="thread-title"
            >
              <header className="section-heading">
                <div>
                  <h2 id="thread-title">From organization to project</h2>
                </div>
                <span>{countLabel(opportunities.length, "active thread")}</span>
              </header>
              {organizations.map((organization) => {
                const related = opportunities.filter(
                  (item) => item.organizationId === organization.id,
                );
                return (
                  <article className="relationship-row" key={organization.id}>
                    <div className="relationship-anchor">
                      <span aria-hidden="true">O</span>
                      <button
                        type="button"
                        className="relationship-select"
                        aria-pressed={selectedRecordId === organization.id}
                        onClick={() => onSelectRecord(organization.id)}
                        onDoubleClick={() =>
                          onOpenOrganization(organization.id, organization.name)
                        }
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          onOpenOrganization(
                            organization.id,
                            organization.name,
                          );
                        }}
                      >
                        <strong>{organization.name}</strong>
                        <small>
                          {organization.nextAction ?? "No next move"}
                        </small>
                      </button>
                      <StateMark state={organization.relationshipState} />
                    </div>
                    <div className="relationship-branches">
                      {related.length === 0 ? (
                        <p>
                          No opportunity is linked to this relationship yet.
                        </p>
                      ) : (
                        related.map((opportunity) => (
                          <div
                            key={opportunity.id}
                            className={`opportunity-line${
                              selectedRecordId === opportunity.id
                                ? " selected"
                                : ""
                            }`}
                          >
                            <button
                              type="button"
                              className="opportunity-select"
                              aria-pressed={selectedRecordId === opportunity.id}
                              {...opportunityNav(
                                opportunityIndex.get(opportunity.id) ?? 0,
                              )}
                              onClick={() => onSelectRecord(opportunity.id)}
                            >
                              <strong>{opportunity.title}</strong>
                              <span>{opportunity.need}</span>
                              <small>{opportunity.nextAction}</small>
                            </button>
                            <div className="opportunity-outcomes">
                              <StateMark state={opportunity.state} />
                              <button
                                type="button"
                                className="outcome-link"
                                aria-label={`Show offers for ${opportunity.title} in the context panel`}
                                onClick={() => onSelectRecord(opportunity.id)}
                              >
                                {countLabel(
                                  opportunity.offerIds.length,
                                  "offer",
                                )}
                              </button>
                              <button
                                type="button"
                                className="outcome-link"
                                aria-label={`Show projects for ${opportunity.title} in the context panel`}
                                onClick={() => onSelectRecord(opportunity.id)}
                              >
                                {countLabel(
                                  opportunity.projectIds.length,
                                  "project",
                                )}
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                );
              })}
            </section>

            <section
              className="strategic-ledger"
              aria-labelledby="ledger-title"
            >
              <header className="section-heading">
                <div>
                  <h2 id="ledger-title">Renewals and fact freshness</h2>
                </div>
              </header>
              {timelyRecords.map((record, index) => (
                <div
                  className={`ledger-row${
                    selectedRecordId === record.id ? " selected" : ""
                  }`}
                  key={record.id}
                >
                  <button
                    type="button"
                    className="ledger-select"
                    aria-pressed={selectedRecordId === record.id}
                    {...timelyNav(index)}
                    onClick={() => onSelectRecord(record.id)}
                  >
                    <span className="record-kind">
                      {record.kind === "renewal"
                        ? "Renewal"
                        : "Relationship fact"}
                    </span>
                    <span className="ledger-copy">
                      <strong>
                        {record.kind === "renewal"
                          ? record.title
                          : record.factType}
                      </strong>
                      <small>
                        {record.kind === "renewal"
                          ? `${record.scope} · ${formatDate(record.expiresAt)}`
                          : `${record.value} · verified ${formatDate(record.verifiedAt)}`}
                      </small>
                    </span>
                  </button>
                  <StateMark state={record.state} />
                  {record.kind === "renewal" && record.state === "watching" && (
                    <div className="ledger-actions">
                      <button
                        type="button"
                        disabled={!client || busyId === record.id}
                        onClick={() => {
                          if (!client) return;
                          void act(record.id, async () => {
                            const result = await resolveRenewal(
                              client,
                              snapshot,
                              record,
                              "renewed",
                            );
                            if (result.kind !== "success") onFailure(result);
                          });
                        }}
                      >
                        Renewed
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {timelyRecords.length === 0 && (
                <p className="strategic-quiet">
                  Nothing time-bound to show yet.
                </p>
              )}
            </section>

            <section
              className="strategic-ledger"
              aria-labelledby="supporting-title"
            >
              <header className="section-heading">
                <div>
                  <h2 id="supporting-title">Supporting records</h2>
                </div>
              </header>
              {supportRecords.map((record, index) => (
                <div
                  className={`ledger-row${
                    selectedRecordId === record.id ? " selected" : ""
                  }`}
                  key={record.id}
                >
                  <button
                    type="button"
                    className="ledger-select"
                    aria-pressed={selectedRecordId === record.id}
                    {...supportNav(index)}
                    onClick={() => onSelectRecord(record.id)}
                  >
                    <span className="record-kind">
                      {recordKindLabels[record.kind] ?? record.kind}
                    </span>
                    <span className="ledger-copy">
                      <strong>
                        {record.kind === "person" ? record.name : record.title}
                      </strong>
                      <small>
                        {record.kind === "person"
                          ? [record.role, record.email]
                              .filter(Boolean)
                              .join(" · ") || "No further details"
                          : record.kind === "decision"
                            ? record.rationale
                            : `${record.taskTitle} · ${recurrenceCadenceLabels[record.cadence]}`}
                      </small>
                    </span>
                  </button>
                  {record.kind === "recurrence" ? (
                    <button
                      type="button"
                      className="ledger-action"
                      disabled={!client || busyId === record.id}
                      onClick={() => {
                        if (!client) return;
                        void act(record.id, async () => {
                          const result = await generateRecurrenceOccurrence(
                            client,
                            snapshot,
                            record,
                          );
                          if (result.kind !== "success") onFailure(result);
                        });
                      }}
                    >
                      Create occurrence
                    </button>
                  ) : (
                    <StateMark
                      state={
                        record.kind === "person" ? "current" : record.state
                      }
                    />
                  )}
                </div>
              ))}
              {supportRecords.length === 0 && (
                <p className="strategic-quiet">
                  No supporting records in this Space.
                </p>
              )}
            </section>
          </div>

          <aside className="strategic-review" aria-labelledby="review-title">
            <header>
              <h2 id="review-title">To decide</h2>
              <span>The list does not grow while you review it.</span>
            </header>
            {radar.map((candidate) => {
              const radarBusy =
                busyId === `${candidate.id}:saved` ||
                busyId === `${candidate.id}:dismissed`;
              return (
                <article key={candidate.id} className="review-item">
                  <span className="review-type">Knowledge radar</span>
                  <strong>{candidate.title}</strong>
                  <p>{candidate.relevance}</p>
                  <div className="review-actions">
                    <button
                      className="secondary-button compact"
                      disabled={radarBusy}
                      onClick={() => resolveRadar(candidate, "saved")}
                    >
                      {busyId === `${candidate.id}:saved` ? "Saving…" : "Keep"}
                    </button>
                    <button
                      className="secondary-button compact"
                      disabled={radarBusy}
                      onClick={() => resolveRadar(candidate, "dismissed")}
                    >
                      {busyId === `${candidate.id}:dismissed`
                        ? "Saving…"
                        : "Dismiss"}
                    </button>
                  </div>
                </article>
              );
            })}
            {openConsequences.map(({ review, item }) => (
              <article
                key={`${review.id}:${item.recordId}`}
                className="review-item"
              >
                <span className="review-type">Decision impact</span>
                <strong>
                  {recordKindLabels[item.recordKind] ?? item.recordKind}
                </strong>
                <p>{review.reason}</p>
                <button
                  className="secondary-button compact"
                  disabled={busyId === `${review.id}:${item.recordId}`}
                  onClick={() => resolveImpact(review, item.recordId)}
                >
                  Mark impact as reviewed
                </button>
              </article>
            ))}
            {radar.length + openConsequences.length === 0 && (
              <div className="review-complete" role="status">
                <span aria-hidden="true">✓</span>
                <strong>Review complete</strong>
                <p>New items appear only with a new source or context.</p>
              </div>
            )}
            <footer>
              <span>{countLabel(offers.length, "offer")}</span>
              <span>{countLabel(recurrences.length, "recurrence")}</span>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
};

const emptySectionCopy = {
  people: "No people are linked to this organization yet.",
  opportunities: "No active opportunities are linked to this organization.",
  // `activeProjects` unions two reaches (ADR-071) — the projects this client's
  // opportunities name, and deliveries linked straight at the client — so
  // attributing the emptiness to the shortage of deals alone was misleading.
  projects: "No active projects are linked to this client.",
  tasks: "No open tasks in the client's active projects.",
  renewals: "No renewals need tracking.",
  facts: "No verified relationship facts yet.",
  meetings: "No meetings are assigned to this organization.",
  documents: "No documents are linked to this organization.",
} as const;

const EmptyOrganizationSection = ({
  children,
}: {
  readonly children: string;
}) => <p className="organization-empty">{children}</p>;

/**
 * The authoring row under Aktywna praca — the mirror of the Klient card's row
 * on the Project page, and deliberately the same shape: one edge, two ends, one
 * pair of verbs. Presentational, for the same reason its twin is: which
 * Projects may be offered and which are directly linked are both kernel
 * preconditions, and this file must not learn them.
 */
const DeliveryLinkRow = ({
  candidates,
  detachable,
  busy,
  onLink,
  onUnlink,
}: {
  readonly candidates:
    readonly { readonly id: ProjectId; readonly title: string }[] | undefined;
  readonly detachable: readonly {
    readonly id: ProjectId;
    readonly title: string;
  }[];
  readonly busy: boolean;
  readonly onLink: (projectId: ProjectId) => void;
  readonly onUnlink: (projectId: ProjectId) => void;
}) => {
  const [selected, setSelected] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | undefined>(
    undefined,
  );
  return (
    <div className="organization-context__actions">
      {candidates === undefined ? (
        // "The read did not land" and "there are none" are different facts and
        // the row says which. Two projections feed this one: the Projects and
        // the links already made.
        <small>
          Could not load projects, so a delivery cannot be linked right now.
        </small>
      ) : candidates.length === 0 ? (
        <small>No active projects to link in this client's Space.</small>
      ) : (
        <>
          <label className="sr-only" htmlFor="organization-delivery-link">
            Project delivered for this client
          </label>
          <select
            id="organization-delivery-link"
            value={selected}
            disabled={busy}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">Choose project…</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondary-button compact"
            disabled={busy || selected === ""}
            onClick={() => {
              onLink(selected as ProjectId);
              setSelected("");
            }}
          >
            Link project
          </button>
        </>
      )}
      {detachable.map((project) =>
        confirmingId === project.id ? (
          <Fragment key={project.id}>
            {/* `activeProjects` unions two reaches, so a project this client's
                opportunity also names stays on the list after detaching. Said
                out loud, or the button reads as broken. */}
            <small>
              Unlinking removes only the direct link. A project an opportunity
              also names stays on the list.
            </small>
            <button
              type="button"
              className="status-danger"
              disabled={busy}
              onClick={() => {
                setConfirmingId(undefined);
                onUnlink(project.id);
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
            key={project.id}
            type="button"
            className="ghost-button"
            disabled={busy}
            onClick={() => setConfirmingId(project.id)}
          >
            Unlink “{project.title}”
          </button>
        ),
      )}
    </div>
  );
};

export const OrganizationContextSurface = ({
  overview,
  deliveryCandidates,
  linkedProjectIds,
  linkBusy,
  onLinkDelivery,
  onUnlinkDelivery,
  onOpenProject,
  onOpenTask,
  onOpenDocument,
  onOpenMeeting,
  onOpenRelationship,
}: {
  readonly overview: OrganizationOverviewProjection;
  // Resolved by the caller, exactly as on the Project side.
  readonly deliveryCandidates:
    readonly { readonly id: ProjectId; readonly title: string }[] | undefined;
  readonly linkedProjectIds: ReadonlySet<string>;
  readonly linkBusy: boolean;
  readonly onLinkDelivery: (id: ProjectId) => void;
  readonly onUnlinkDelivery: (id: ProjectId) => void;
  readonly onOpenProject: (
    id: OrganizationOverviewProjection["activeProjects"][number]["id"],
    title: string,
  ) => void;
  readonly onOpenTask: (
    id: OrganizationOverviewProjection["openTasks"][number]["id"],
    title: string,
  ) => void;
  readonly onOpenDocument: (
    id: OrganizationOverviewProjection["documents"][number]["id"],
    title: string,
  ) => void;
  readonly onOpenMeeting: (
    id: OrganizationOverviewProjection["meetings"][number]["id"],
  ) => void;
  readonly onOpenRelationship: (
    id: OrganizationOverviewProjection["opportunities"][number]["id"],
  ) => void;
}) => {
  const { organization } = overview;
  const lastMeeting = overview.meetings[0];
  const nextRenewal = overview.renewals[0];
  return (
    <div className="surface-scroll organization-context">
      <header className="surface-header organization-context__header">
        <div>
          <p className="eyebrow">Organization · full context</p>
          <h1 id="surface-title" tabIndex={-1}>
            {organization.name}
          </h1>
          <p>{organization.nextAction ?? "No next move set yet."}</p>
        </div>
        <StateMark state={organization.relationshipState} />
      </header>

      <section
        className="organization-context__pulse"
        aria-label="Relationship status"
      >
        <div>
          <span>Active projects</span>
          <strong>{overview.activeProjects.length}</strong>
        </div>
        <div>
          <span>Open tasks</span>
          <strong>{overview.openTasks.length}</strong>
        </div>
        <div>
          <span>Last contact</span>
          <strong>
            {lastMeeting ? formatDate(lastMeeting.startedAt) : "—"}
          </strong>
        </div>
        <div>
          <span>Next renewal</span>
          <strong>
            {nextRenewal ? formatDate(nextRenewal.expiresAt) : "—"}
          </strong>
        </div>
      </section>

      <div className="organization-context__grid">
        <section
          className="organization-context__section organization-context__section--wide"
          aria-labelledby="org-work-title"
        >
          <header>
            <div>
              <p className="section-label">Delivery</p>
              <h2 id="org-work-title">Active work</h2>
            </div>
          </header>
          {overview.activeProjects.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.projects}
            </EmptyOrganizationSection>
          ) : (
            <ul className="organization-context__rows">
              {overview.activeProjects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => onOpenProject(project.id, project.title)}
                  >
                    <span>
                      <strong>{project.title}</strong>
                      <small>
                        <NarrativeText
                          kind="project"
                          text={project.intendedOutcome}
                          needsReview={project.needsReview}
                        />
                      </small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <DeliveryLinkRow
            candidates={deliveryCandidates}
            // The title comes from the listed record, because the id set the
            // caller passes carries no label — and only a listed delivery can
            // be offered a detach at all.
            detachable={overview.activeProjects.filter((project) =>
              linkedProjectIds.has(project.id),
            )}
            busy={linkBusy}
            onLink={onLinkDelivery}
            onUnlink={onUnlinkDelivery}
          />
          {overview.openTasks.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.tasks}
            </EmptyOrganizationSection>
          ) : (
            <ul className="organization-context__rows organization-context__rows--tasks">
              {overview.openTasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id, task.title)}
                  >
                    <span>
                      <strong>{task.title}</strong>
                      <small>
                        {task.dueAt
                          ? `Deadline ${formatDate(task.dueAt)}`
                          : "No deadline"}{" "}
                        ·{" "}
                        {strategicStateLabels[task.operationalState] ??
                          task.operationalState}
                      </small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="organization-context__section"
          aria-labelledby="org-people-title"
        >
          <header>
            <div>
              <p className="section-label">Relationship</p>
              <h2 id="org-people-title">People</h2>
            </div>
            <span>{overview.people.length}</span>
          </header>
          {overview.people.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.people}
            </EmptyOrganizationSection>
          ) : (
            <ul className="organization-context__plain-list">
              {overview.people.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRelationship(person.id)}
                  >
                    <strong>{person.name}</strong>
                    <span>{person.role ?? person.email ?? "Contact"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="organization-context__section"
          aria-labelledby="org-pipeline-title"
        >
          <header>
            <div>
              <p className="section-label">Pipeline</p>
              <h2 id="org-pipeline-title">Opportunities and offers</h2>
            </div>
            <span>{overview.opportunities.length}</span>
          </header>
          {overview.opportunities.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.opportunities}
            </EmptyOrganizationSection>
          ) : (
            <ul className="organization-context__plain-list">
              {overview.opportunities.map((opportunity) => (
                <li key={opportunity.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRelationship(opportunity.id)}
                  >
                    <strong>{opportunity.title}</strong>
                    <span>{opportunity.nextAction}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {overview.offers.map((offer) => (
            <button
              className="organization-context__inline-link"
              type="button"
              key={offer.id}
              onClick={() => onOpenRelationship(offer.id)}
            >
              {offer.title} · {strategicStateLabels[offer.state] ?? offer.state}
            </button>
          ))}
        </section>

        <section
          className="organization-context__section"
          aria-labelledby="org-renewals-title"
        >
          <header>
            <div>
              <p className="section-label">Deadlines</p>
              <h2 id="org-renewals-title">Renewals</h2>
            </div>
            <span>{overview.renewals.length}</span>
          </header>
          {overview.renewals.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.renewals}
            </EmptyOrganizationSection>
          ) : (
            <ul className="organization-context__plain-list">
              {overview.renewals.map((renewal) => (
                <li key={renewal.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRelationship(renewal.id)}
                  >
                    <strong>{renewal.title}</strong>
                    <span>
                      {formatDate(renewal.expiresAt)} · {renewal.scope}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="organization-context__section"
          aria-labelledby="org-facts-title"
        >
          <header>
            <div>
              <p className="section-label">Knowledge</p>
              <h2 id="org-facts-title">Relationship facts</h2>
            </div>
            <span>{overview.facts.length}</span>
          </header>
          {overview.facts.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.facts}
            </EmptyOrganizationSection>
          ) : (
            <dl className="organization-context__facts">
              {overview.facts.map((fact) => (
                <div key={fact.id}>
                  <dt>{fact.factType}</dt>
                  <dd>
                    {fact.value}
                    <small>
                      {strategicStateLabels[fact.state] ?? fact.state}
                    </small>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section
          className="organization-context__section"
          aria-labelledby="org-meetings-title"
        >
          <header>
            <div>
              <p className="section-label">Contact</p>
              <h2 id="org-meetings-title">Meetings</h2>
            </div>
            <span>{overview.meetings.length}</span>
          </header>
          {overview.meetings.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.meetings}
            </EmptyOrganizationSection>
          ) : (
            <ul className="organization-context__plain-list">
              {overview.meetings.map((meeting) => (
                <li key={meeting.id}>
                  <button
                    type="button"
                    onClick={() => onOpenMeeting(meeting.id)}
                  >
                    <strong>{meeting.title}</strong>
                    <span>{formatDateTime(meeting.startedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="organization-context__section"
          aria-labelledby="org-docs-title"
        >
          <header>
            <div>
              <p className="section-label">Materials</p>
              <h2 id="org-docs-title">Documents</h2>
            </div>
            <span>{overview.documents.length}</span>
          </header>
          {overview.documents.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.documents}
            </EmptyOrganizationSection>
          ) : (
            <ul className="organization-context__plain-list">
              {overview.documents.map((document) => (
                <li key={document.id}>
                  <button
                    type="button"
                    onClick={() => onOpenDocument(document.id, document.title)}
                  >
                    <strong>{document.title}</strong>
                    <span>
                      {recordKindLabels[document.role] ?? document.role}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

type OrganizationContextNavigation = Pick<
  Parameters<typeof OrganizationContextSurface>[0],
  | "onOpenProject"
  | "onOpenTask"
  | "onOpenDocument"
  | "onOpenMeeting"
  | "onOpenRelationship"
>;

// Authoring, as against navigation. Threaded from the app rather than run here
// because a link changes the whole snapshot — the candidate list and the Klient
// card on the Project page both re-derive from it — and this loader can only
// re-run its own query.
type OrganizationContextAuthoring = Pick<
  Parameters<typeof OrganizationContextSurface>[0],
  "linkBusy" | "onLinkDelivery" | "onUnlinkDelivery"
>;

export const OrganizationContextLoader = ({
  client,
  snapshot,
  organizationId,
  ...navigation
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly organizationId: StrategicRecordId;
} & OrganizationContextNavigation &
  OrganizationContextAuthoring) => {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    | { readonly kind: "loading" }
    | { readonly kind: "ready"; readonly data: OrganizationOverviewProjection }
    | { readonly kind: "unavailable"; readonly message: string }
  >({ kind: "loading" });
  useEffect(() => {
    const organization =
      snapshot.relationships.kind === "ready"
        ? snapshot.relationships.data.records.find(
            (record) =>
              record.kind === "organization" && record.id === organizationId,
          )
        : undefined;
    if (!client || !organization || organization.kind !== "organization") {
      setState({
        kind: "unavailable",
        message: "This organization's context is no longer available.",
      });
      return;
    }
    let active = true;
    setState({ kind: "loading" });
    void loadOrganizationOverview(
      client,
      snapshot,
      organization.id,
      organization.spaceId,
    )
      .then((data) => active && setState({ kind: "ready", data }))
      .catch(() => {
        if (active)
          setState({
            kind: "unavailable",
            message: "Could not load the overview. Nothing was changed.",
          });
      });
    return () => {
      active = false;
    };
  }, [attempt, client, organizationId, snapshot]);
  if (state.kind === "ready")
    return (
      <OrganizationContextSurface
        overview={state.data}
        // Derived here rather than in the surface: which Projects the kernel
        // would accept is a precondition, and the Space comes off the
        // projection's own organization so the picker cannot offer a Project
        // from a Space this client is not in.
        deliveryCandidates={linkableDeliveryProjects(
          snapshot,
          state.data.organization,
        )}
        linkedProjectIds={
          new Set(
            directDeliveryProjects(snapshot, state.data.organization.id).keys(),
          )
        }
        {...navigation}
      />
    );
  return (
    <section
      className="surface-load-state"
      role={state.kind === "loading" ? "status" : "alert"}
    >
      <p className="eyebrow">Organization</p>
      <h1 id="surface-title" tabIndex={-1}>
        {state.kind === "loading"
          ? "Opening client context…"
          : "Could not open the client context"}
      </h1>
      {state.kind === "unavailable" && (
        <>
          <p>{state.message}</p>
          <button
            className="secondary-button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </button>
        </>
      )}
    </section>
  );
};
