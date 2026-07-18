import { useMemo, useState } from "react";

import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import { StrategicCreatePanel } from "./StrategicCreatePanel.js";

import {
  generateRecurrenceOccurrence,
  resolveDecisionImpact,
  resolveRadarCandidate,
  resolveRenewal,
  type DesktopSnapshot,
  type MutationFailure,
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
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  /** Rekord pokazywany w shellowym inspectorze (select, nie open). */
  readonly selectedRecordId: string | undefined;
  readonly onSelectRecord: (id: string) => void;
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
              historię. Dodaj pierwszą organizację przyciskiem „Organizacja”
              powyżej; szanse i pozostałe rekordy pojawią się, gdy będzie je do
              czego podłączyć.
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
          </main>

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
