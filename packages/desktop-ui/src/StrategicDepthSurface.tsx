import { useMemo, useState, type FormEvent } from "react";

import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import { StrategicCreatePanel } from "./StrategicCreatePanel.js";

import {
  createOpportunity,
  createOrganization,
  generateRecurrenceOccurrence,
  resolveDecisionImpact,
  resolveRadarCandidate,
  resolveRenewal,
  type DesktopSnapshot,
  type MutationFailure,
  type RelationshipWorkspaceProjection,
} from "./client/workflow.js";

type Record = RelationshipWorkspaceProjection["records"][number];
type Radar = Extract<Record, { kind: "radar_candidate" }>;
type Review = Extract<Record, { kind: "impact_review" }>;

const StateMark = ({ state }: { readonly state: string }) => (
  <span className={`strategic-state strategic-state--${state}`}>
    <i aria-hidden="true" />
    {state.replaceAll("_", " ")}
  </span>
);

export const StrategicDepthSurface = ({
  client,
  snapshot,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const [busyId, setBusyId] = useState<string>();
  const [organizationName, setOrganizationName] = useState("");
  const [organizationAction, setOrganizationAction] = useState("");
  const [opportunityOrganizationId, setOpportunityOrganizationId] =
    useState("");
  const [opportunityTitle, setOpportunityTitle] = useState("");
  const [opportunityNeed, setOpportunityNeed] = useState("");
  const [opportunityAction, setOpportunityAction] = useState("");
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
  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await action();
      await onReload();
    } finally {
      setBusyId(undefined);
    }
  };
  const dismissRadar = (candidate: Radar) => {
    if (!client) return;
    void act(candidate.id, async () => {
      const result = await resolveRadarCandidate(
        client,
        snapshot,
        candidate,
        "dismissed",
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
        "Reviewed in the strategic-depth surface; no automatic rewrite applied.",
      );
      if (result.kind !== "success") onFailure(result);
    });
  };
  const submitOrganization = (event: FormEvent) => {
    event.preventDefault();
    if (!client || organizationName.trim() === "") return;
    void act("new-organization", async () => {
      const result = await createOrganization(client, snapshot, {
        name: organizationName.trim(),
        nextAction: organizationAction.trim(),
      });
      if (result.kind !== "success") onFailure(result);
      else {
        setOrganizationName("");
        setOrganizationAction("");
      }
    });
  };
  const submitOpportunity = (event: FormEvent) => {
    event.preventDefault();
    const organization = organizations.find(
      (item) => item.id === opportunityOrganizationId,
    );
    if (
      !client ||
      organization === undefined ||
      opportunityTitle.trim() === "" ||
      opportunityNeed.trim() === "" ||
      opportunityAction.trim() === ""
    )
      return;
    void act("new-opportunity", async () => {
      const result = await createOpportunity(client, snapshot, {
        organizationId: organization.id,
        title: opportunityTitle.trim(),
        need: opportunityNeed.trim(),
        nextAction: opportunityAction.trim(),
      });
      if (result.kind !== "success") onFailure(result);
      else {
        setOpportunityTitle("");
        setOpportunityNeed("");
        setOpportunityAction("");
      }
    });
  };

  return (
    <div className="surface-scroll strategic-surface">
      <header className="surface-header strategic-header">
        <div>
          <p className="eyebrow">Relationships and reviews</p>
          <h1 id="surface-title">Jedna nić od relacji do następnego ruchu</h1>
          <p>
            Szanse, oferty, odnowienia, decyzje i wiedza zachowują źródła oraz
            historię. Aplikacja pokazuje skutki, ale nie podejmuje decyzji za
            Ciebie.
          </p>
        </div>
        <div className="strategic-summary" aria-label="Stan przeglądu">
          <strong>{radar.length + openConsequences.length}</strong>
          <span>elementów wymagających decyzji</span>
        </div>
      </header>

      {snapshot.relationships.kind === "ready" && (
        <section
          className="strategic-compose"
          aria-label="Dodaj relację lub szansę"
        >
          <form onSubmit={submitOrganization}>
            <div>
              <p className="eyebrow">New relationship</p>
              <strong>Dodaj Organization</strong>
            </div>
            <label>
              <span>Nazwa</span>
              <input
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                placeholder="np. Northstar Industries"
                required
              />
            </label>
            <label>
              <span>Następny ruch</span>
              <input
                value={organizationAction}
                onChange={(event) => setOrganizationAction(event.target.value)}
                placeholder="Co ma wydarzyć się dalej?"
              />
            </label>
            <button
              className="secondary-button compact"
              disabled={!client || busyId === "new-organization"}
            >
              {busyId === "new-organization" ? "Zapisuję…" : "Dodaj relację"}
            </button>
          </form>
          <form onSubmit={submitOpportunity}>
            <div>
              <p className="eyebrow">New opportunity</p>
              <strong>Dodaj Opportunity</strong>
            </div>
            <label>
              <span>Organization</span>
              <select
                value={opportunityOrganizationId}
                onChange={(event) =>
                  setOpportunityOrganizationId(event.target.value)
                }
                required
              >
                <option value="">Wybierz relację</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Tytuł i potrzeba</span>
              <input
                value={opportunityTitle}
                onChange={(event) => setOpportunityTitle(event.target.value)}
                placeholder="Nazwa szansy"
                required
              />
              <input
                value={opportunityNeed}
                onChange={(event) => setOpportunityNeed(event.target.value)}
                placeholder="Jaka potrzeba jest potwierdzona?"
                required
              />
            </label>
            <label>
              <span>Następny ruch</span>
              <input
                value={opportunityAction}
                onChange={(event) => setOpportunityAction(event.target.value)}
                placeholder="Jedna konkretna czynność"
                required
              />
            </label>
            <button
              className="secondary-button compact"
              disabled={
                !client ||
                organizations.length === 0 ||
                busyId === "new-opportunity"
              }
            >
              {busyId === "new-opportunity" ? "Zapisuję…" : "Dodaj szansę"}
            </button>
          </form>
        </section>
      )}

      {snapshot.relationships.kind === "ready" && (
        <StrategicCreatePanel
          client={client}
          snapshot={snapshot}
          records={records}
          busy={busyId !== undefined}
          onRun={(id, operation) => {
            void act(`create:${id}`, async () => {
              const result = await operation();
              if (result.kind !== "success") onFailure(result);
            });
          }}
        />
      )}

      {snapshot.relationships.kind === "unavailable" ? (
        <section className="empty-state" role="status">
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
            <h2>Brak relacji i przeglądów w tym Space</h2>
            <p>
              Zacznij od Organization powyżej. Użytkownik i uprawniony agent
              zapisują ją przez ten sam kontrakt poleceń i wspólny audyt.
            </p>
          </div>
        </section>
      ) : (
        <div className="strategic-layout">
          <main>
            <section
              className="strategic-thread"
              aria-labelledby="thread-title"
            >
              <header className="section-heading">
                <div>
                  <p className="eyebrow">Commercial thread</p>
                  <h2 id="thread-title">Od Organization do Projectu</h2>
                </div>
                <span>{opportunities.length} aktywnych wątków</span>
              </header>
              {organizations.map((organization) => {
                const related = opportunities.filter(
                  (item) => item.organizationId === organization.id,
                );
                return (
                  <article className="relationship-row" key={organization.id}>
                    <div className="relationship-anchor">
                      <span aria-hidden="true">O</span>
                      <div>
                        <strong>{organization.name}</strong>
                        <small>
                          {organization.nextAction ?? "Brak następnego ruchu"}
                        </small>
                      </div>
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
                            className="opportunity-line"
                          >
                            <div>
                              <strong>{opportunity.title}</strong>
                              <span>{opportunity.need}</span>
                              <small>{opportunity.nextAction}</small>
                            </div>
                            <div className="opportunity-outcomes">
                              <StateMark state={opportunity.state} />
                              <span>{opportunity.offerIds.length} ofert</span>
                              <span>
                                {opportunity.projectIds.length} projektów
                              </span>
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
                  <p className="eyebrow">Time-aware records</p>
                  <h2 id="ledger-title">Odnowienia i świeżość faktów</h2>
                </div>
              </header>
              {[...renewals, ...facts].map((record) => (
                <div className="ledger-row" key={record.id}>
                  <span className="record-kind">
                    {record.kind === "renewal" ? "Renewal" : "Fact"}
                  </span>
                  <div>
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
                  </div>
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
              {renewals.length + facts.length === 0 && (
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
                  <p className="eyebrow">People, decisions, recurrence</p>
                  <h2 id="supporting-title">Rekordy wspierające nić</h2>
                </div>
              </header>
              {people.map((person) => (
                <div className="ledger-row" key={person.id}>
                  <span className="record-kind">Person</span>
                  <div>
                    <strong>{person.name}</strong>
                    <small>
                      {[person.role, person.email]
                        .filter(Boolean)
                        .join(" · ") || "Bez dodatkowych danych"}
                    </small>
                  </div>
                  <StateMark state="current" />
                </div>
              ))}
              {decisions.map((decision) => (
                <div className="ledger-row" key={decision.id}>
                  <span className="record-kind">Decision</span>
                  <div>
                    <strong>{decision.title}</strong>
                    <small>{decision.rationale}</small>
                  </div>
                  <StateMark state={decision.state} />
                </div>
              ))}
              {recurrences.map((recurrence) => (
                <div className="ledger-row" key={recurrence.id}>
                  <span className="record-kind">Recurrence</span>
                  <div>
                    <strong>{recurrence.title}</strong>
                    <small>
                      {recurrence.taskTitle} · {recurrence.cadence}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="ledger-action"
                    disabled={!client || busyId === recurrence.id}
                    onClick={() => {
                      if (!client) return;
                      void act(recurrence.id, async () => {
                        const result = await generateRecurrenceOccurrence(
                          client,
                          snapshot,
                          recurrence,
                        );
                        if (result.kind !== "success") onFailure(result);
                      });
                    }}
                  >
                    Utwórz wystąpienie
                  </button>
                </div>
              ))}
              {people.length + decisions.length + recurrences.length === 0 && (
                <p className="strategic-quiet">
                  Brak dodatkowych rekordów w tym Space.
                </p>
              )}
            </section>
          </main>

          <aside className="strategic-review" aria-labelledby="review-title">
            <header>
              <p className="eyebrow">Finite review</p>
              <h2 id="review-title">Do rozstrzygnięcia</h2>
              <span>Lista nie rozszerza się podczas przeglądu.</span>
            </header>
            {radar.map((candidate) => (
              <article key={candidate.id} className="review-item">
                <span className="review-type">Knowledge Radar</span>
                <strong>{candidate.title}</strong>
                <p>{candidate.relevance}</p>
                <div>
                  <button
                    className="secondary-button compact"
                    disabled={busyId === candidate.id}
                    onClick={() => dismissRadar(candidate)}
                  >
                    {busyId === candidate.id ? "Zapisuję…" : "Odrzuć kandydat"}
                  </button>
                </div>
              </article>
            ))}
            {openConsequences.map(({ review, item }) => (
              <article
                key={`${review.id}:${item.recordId}`}
                className="review-item"
              >
                <span className="review-type">Decision impact</span>
                <strong>{item.recordKind}</strong>
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
              <span>{offers.length} ofert</span>
              <span>{recurrences.length} reguł cyklicznych</span>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
};
