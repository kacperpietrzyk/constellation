import { useEffect, useMemo, useState } from "react";

import type { StrategicRecordId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import { StrategicCreatePanel } from "./StrategicCreatePanel.js";

import {
  generateRecurrenceOccurrence,
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
import { countLabel, pluralize, recordKindLabels } from "./i18n.js";
import {
  recurrenceCadenceLabels,
  strategicStateLabels,
} from "./strategic-labels.js";

type Record = RelationshipWorkspaceProjection["records"][number];
type Radar = Extract<Record, { kind: "radar_candidate" }>;
type Review = Extract<Record, { kind: "impact_review" }>;

// The impact-review audit note is stored data, so it carries the product's
// Polish tool voice instead of an English implementation remark.
const impactReviewNote =
  "Przejrzano na powierzchni strategicznej; bez automatycznych zmian.";

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
          "Polecenie nie dotarło do warstwy danych. Nic nie zmieniono — spróbuj ponownie.",
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
          <p className="eyebrow">Relacje i przeglądy</p>
          <h1 id="surface-title" tabIndex={-1}>
            Relacje
          </h1>
          <p>
            Szanse, oferty, odnowienia, decyzje i wiedza zachowują źródła oraz
            historię. Aplikacja pokazuje skutki, ale nie podejmuje decyzji za
            Ciebie.
          </p>
        </div>
        <div className="strategic-summary" aria-label="Stan przeglądu">
          <strong>{radar.length + openConsequences.length}</strong>
          <span>
            {pluralize(
              radar.length + openConsequences.length,
              "element wymaga decyzji",
              "elementy wymagają decyzji",
              "elementów wymaga decyzji",
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
            <h2>Relacje są chwilowo niedostępne</h2>
            <p>{snapshot.relationships.message}</p>
          </div>
          <button className="secondary-button" onClick={() => void onReload()}>
            Spróbuj ponownie
          </button>
        </section>
      ) : records.length === 0 ? (
        <section className="strategic-empty" role="status">
          <span aria-hidden="true">◇</span>
          <div>
            <h2>Zbuduj pierwszą relację</h2>
            <p>
              Relacja łączy organizację z potwierdzoną potrzebą, ofertą,
              projektem, odnowieniem i decyzją — każdy krok zachowuje źródło i
              historię. Otwórz „Dodaj rekord” i zacznij od organizacji; szanse
              oraz pozostałe rekordy pojawią się, gdy będzie je do czego
              podłączyć.
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
                  <h2 id="thread-title">Od organizacji do projektu</h2>
                </div>
                <span>
                  {countLabel(
                    opportunities.length,
                    "aktywny wątek",
                    "aktywne wątki",
                    "aktywnych wątków",
                  )}
                </span>
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
                          {organization.nextAction ?? "Brak następnego ruchu"}
                        </small>
                      </button>
                      <StateMark state={organization.relationshipState} />
                    </div>
                    <div className="relationship-branches">
                      {related.length === 0 ? (
                        <p>
                          Nie ma jeszcze Opportunity powiązanego z tą relacją.
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
                                aria-label={`Pokaż oferty szansy ${opportunity.title} w podglądzie kontekstu`}
                                onClick={() => onSelectRecord(opportunity.id)}
                              >
                                {countLabel(
                                  opportunity.offerIds.length,
                                  "oferta",
                                  "oferty",
                                  "ofert",
                                )}
                              </button>
                              <button
                                type="button"
                                className="outcome-link"
                                aria-label={`Pokaż projekty szansy ${opportunity.title} w podglądzie kontekstu`}
                                onClick={() => onSelectRecord(opportunity.id)}
                              >
                                {countLabel(
                                  opportunity.projectIds.length,
                                  "projekt",
                                  "projekty",
                                  "projektów",
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
                  <h2 id="ledger-title">Odnowienia i świeżość faktów</h2>
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
                      {record.kind === "renewal" ? "Odnowienie" : "Fakt"}
                    </span>
                    <span className="ledger-copy">
                      <strong>
                        {record.kind === "renewal"
                          ? record.title
                          : record.factType}
                      </strong>
                      <small>
                        {record.kind === "renewal"
                          ? `${record.scope} · ${new Date(record.expiresAt).toLocaleDateString("pl-PL")}`
                          : `${record.value} · zweryfikowano ${new Date(record.verifiedAt).toLocaleDateString("pl-PL")}`}
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
                        Odnowiono
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {timelyRecords.length === 0 && (
                <p className="strategic-quiet">
                  Brak terminowych rekordów do pokazania.
                </p>
              )}
            </section>

            <section
              className="strategic-ledger"
              aria-labelledby="supporting-title"
            >
              <header className="section-heading">
                <div>
                  <h2 id="supporting-title">Rekordy wspierające nić</h2>
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
                              .join(" · ") || "Bez dodatkowych danych"
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
                      Utwórz wystąpienie
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
                  Brak dodatkowych rekordów w tym Space.
                </p>
              )}
            </section>
          </div>

          <aside className="strategic-review" aria-labelledby="review-title">
            <header>
              <h2 id="review-title">Do rozstrzygnięcia</h2>
              <span>Lista nie rozszerza się podczas przeglądu.</span>
            </header>
            {radar.map((candidate) => {
              const radarBusy =
                busyId === `${candidate.id}:saved` ||
                busyId === `${candidate.id}:dismissed`;
              return (
                <article key={candidate.id} className="review-item">
                  <span className="review-type">Radar wiedzy</span>
                  <strong>{candidate.title}</strong>
                  <p>{candidate.relevance}</p>
                  <div className="review-actions">
                    <button
                      className="secondary-button compact"
                      disabled={radarBusy}
                      onClick={() => resolveRadar(candidate, "saved")}
                    >
                      {busyId === `${candidate.id}:saved`
                        ? "Zapisuję…"
                        : "Zachowaj"}
                    </button>
                    <button
                      className="secondary-button compact"
                      disabled={radarBusy}
                      onClick={() => resolveRadar(candidate, "dismissed")}
                    >
                      {busyId === `${candidate.id}:dismissed`
                        ? "Zapisuję…"
                        : "Odrzuć"}
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
                <span className="review-type">Skutek decyzji</span>
                <strong>
                  {recordKindLabels[item.recordKind] ?? item.recordKind}
                </strong>
                <p>{review.reason}</p>
                <button
                  className="secondary-button compact"
                  disabled={busyId === `${review.id}:${item.recordId}`}
                  onClick={() => resolveImpact(review, item.recordId)}
                >
                  Oznacz skutek jako przejrzany
                </button>
              </article>
            ))}
            {radar.length + openConsequences.length === 0 && (
              <div className="review-complete" role="status">
                <span aria-hidden="true">✓</span>
                <strong>Przegląd zakończony</strong>
                <p>
                  Nowe elementy pojawią się tylko z nowym źródłem lub
                  kontekstem.
                </p>
              </div>
            )}
            <footer>
              <span>
                {countLabel(offers.length, "oferta", "oferty", "ofert")}
              </span>
              <span>
                {countLabel(
                  recurrences.length,
                  "reguła cykliczna",
                  "reguły cykliczne",
                  "reguł cyklicznych",
                )}
              </span>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
};

const emptySectionCopy = {
  people: "Nie ma jeszcze osób powiązanych z tą organizacją.",
  opportunities: "Nie ma aktywnych szans powiązanych z tą organizacją.",
  projects: "Nie ma aktywnych projektów wynikających z tych szans.",
  tasks: "Nie ma otwartych zadań w aktywnych projektach klienta.",
  renewals: "Nie ma odnowień wymagających śledzenia.",
  facts: "Nie ma jeszcze zweryfikowanych faktów o relacji.",
  meetings: "Nie ma spotkań przypisanych do tej organizacji.",
  documents: "Nie ma dokumentów połączonych z tą organizacją.",
} as const;

const EmptyOrganizationSection = ({
  children,
}: {
  readonly children: string;
}) => <p className="organization-empty">{children}</p>;

export const OrganizationContextSurface = ({
  overview,
  onOpenProject,
  onOpenTask,
  onOpenDocument,
  onOpenMeeting,
  onOpenRelationship,
}: {
  readonly overview: OrganizationOverviewProjection;
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
          <p className="eyebrow">Organizacja · pełny kontekst</p>
          <h1 id="surface-title" tabIndex={-1}>
            {organization.name}
          </h1>
          <p>
            {organization.nextAction ??
              "Nie ustalono jeszcze następnego ruchu."}
          </p>
        </div>
        <StateMark state={organization.relationshipState} />
      </header>

      <section
        className="organization-context__pulse"
        aria-label="Stan relacji"
      >
        <div>
          <span>Aktywne projekty</span>
          <strong>{overview.activeProjects.length}</strong>
        </div>
        <div>
          <span>Otwarte zadania</span>
          <strong>{overview.openTasks.length}</strong>
        </div>
        <div>
          <span>Ostatni kontakt</span>
          <strong>
            {lastMeeting
              ? new Date(lastMeeting.startedAt).toLocaleDateString("pl-PL")
              : "—"}
          </strong>
        </div>
        <div>
          <span>Najbliższe odnowienie</span>
          <strong>
            {nextRenewal
              ? new Date(nextRenewal.expiresAt).toLocaleDateString("pl-PL")
              : "—"}
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
              <p className="section-label">Realizacja</p>
              <h2 id="org-work-title">Aktywna praca</h2>
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
                      <small>{project.intendedOutcome}</small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
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
                          ? `Termin ${new Date(task.dueAt).toLocaleDateString("pl-PL")}`
                          : "Bez terminu"}{" "}
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
              <p className="section-label">Relacja</p>
              <h2 id="org-people-title">Osoby</h2>
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
                    <span>{person.role ?? person.email ?? "Kontakt"}</span>
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
              <h2 id="org-pipeline-title">Szanse i oferty</h2>
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
              <p className="section-label">Terminy</p>
              <h2 id="org-renewals-title">Odnowienia</h2>
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
                      {new Date(renewal.expiresAt).toLocaleDateString("pl-PL")}{" "}
                      · {renewal.scope}
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
              <p className="section-label">Wiedza</p>
              <h2 id="org-facts-title">Fakty o relacji</h2>
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
              <p className="section-label">Kontakt</p>
              <h2 id="org-meetings-title">Spotkania</h2>
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
                    <span>
                      {new Date(meeting.startedAt).toLocaleString("pl-PL")}
                    </span>
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
              <p className="section-label">Materiały</p>
              <h2 id="org-docs-title">Dokumenty</h2>
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

export const OrganizationContextLoader = ({
  client,
  snapshot,
  organizationId,
  ...navigation
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly organizationId: StrategicRecordId;
} & OrganizationContextNavigation) => {
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
        message: "Kontekst tej organizacji nie jest już dostępny.",
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
            message:
              "Nie udało się pobrać przeglądu. Dane nie zostały zmienione.",
          });
      });
    return () => {
      active = false;
    };
  }, [attempt, client, organizationId, snapshot]);
  if (state.kind === "ready")
    return <OrganizationContextSurface overview={state.data} {...navigation} />;
  return (
    <section
      className="surface-load-state"
      role={state.kind === "loading" ? "status" : "alert"}
    >
      <p className="eyebrow">Organizacja</p>
      <h1 id="surface-title" tabIndex={-1}>
        {state.kind === "loading"
          ? "Otwieram kontekst klienta…"
          : "Nie udało się otworzyć kontekstu klienta"}
      </h1>
      {state.kind === "unavailable" && (
        <>
          <p>{state.message}</p>
          <button
            className="secondary-button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Spróbuj ponownie
          </button>
        </>
      )}
    </section>
  );
};
