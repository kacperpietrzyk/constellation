import type { FormEvent } from "react";

import type {
  DocumentId,
  KnowledgeSourceId,
  StrategicRecordId,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  createDecision,
  createOffer,
  createPerson,
  createRadarCandidate,
  createRecurrence,
  createRelationshipFact,
  createRenewal,
  supersedeDecision,
  type DesktopSnapshot,
  type MutationResult,
  type RelationshipWorkspaceProjection,
} from "./client/workflow.js";

type Record = RelationshipWorkspaceProjection["records"][number];
type Operation = () => Promise<MutationResult<unknown>>;

const value = (data: FormData, name: string) =>
  String(data.get(name) ?? "").trim();

export const StrategicCreatePanel = ({
  client,
  snapshot,
  records,
  busy,
  onRun,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly records: readonly Record[];
  readonly busy: boolean;
  readonly onRun: (id: string, operation: Operation) => void;
}) => {
  const organizations = records.filter(
    (record): record is Extract<Record, { kind: "organization" }> =>
      record.kind === "organization",
  );
  const opportunities = records.filter(
    (record): record is Extract<Record, { kind: "opportunity" }> =>
      record.kind === "opportunity",
  );
  const decisions = records.filter(
    (record): record is Extract<Record, { kind: "decision" }> =>
      record.kind === "decision" && record.state === "current",
  );
  const deliverables =
    snapshot.documents.kind === "ready"
      ? snapshot.documents.data.items.filter(
          (document) => document.role === "deliverable",
        )
      : [];
  const sources =
    snapshot.knowledge.kind === "ready" ? snapshot.knowledge.data.sources : [];
  const submit = (
    id: string,
    event: FormEvent<HTMLFormElement>,
    make: (data: FormData) => Operation | undefined,
  ) => {
    event.preventDefault();
    if (!client) return;
    const operation = make(new FormData(event.currentTarget));
    if (operation === undefined) return;
    onRun(id, operation);
    event.currentTarget.reset();
  };

  return (
    <section
      className="strategic-create-panel"
      aria-labelledby="strategic-create-title"
    >
      <header>
        <div>
          <p className="eyebrow">Direct manipulation</p>
          <h2 id="strategic-create-title">
            Dodaj rekord tam, gdzie ma konsekwencje
          </h2>
        </div>
        <span>Każdy zapis ma wersję, autora i audyt</span>
      </header>
      <div className="strategic-create-grid">
        <details>
          <summary>Osoba</summary>
          <form
            onSubmit={(event) =>
              submit("person", event, (data) => {
                const name = value(data, "name");
                if (!name) return;
                const organizationId = value(data, "organizationId");
                return () =>
                  createPerson(client!, snapshot, {
                    name,
                    ...(organizationId
                      ? { organizationId: organizationId as StrategicRecordId }
                      : {}),
                    role: value(data, "role"),
                    email: value(data, "email"),
                  });
              })
            }
          >
            <input name="name" placeholder="Imię i nazwisko" required />
            <select name="organizationId">
              <option value="">Bez Organization</option>
              {organizations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input name="role" placeholder="Rola" />
            <input name="email" type="email" placeholder="E-mail" />
            <button disabled={busy}>Dodaj osobę</button>
          </form>
        </details>

        <details>
          <summary>Oferta</summary>
          <form
            onSubmit={(event) =>
              submit("offer", event, (data) => {
                const opportunityId = value(data, "opportunityId");
                const documentId = value(data, "documentId");
                const title = value(data, "title");
                const nextAction = value(data, "nextAction");
                if (!opportunityId || !documentId || !title || !nextAction)
                  return;
                return () =>
                  createOffer(client!, snapshot, {
                    opportunityId: opportunityId as StrategicRecordId,
                    deliverableDocumentId: documentId as DocumentId,
                    title,
                    nextAction,
                  });
              })
            }
          >
            <select name="opportunityId" required>
              <option value="">Wybierz Opportunity</option>
              {opportunities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <select name="documentId" required>
              <option value="">Wybierz Deliverable</option>
              {deliverables.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <input name="title" placeholder="Nazwa oferty" required />
            <input name="nextAction" placeholder="Następny ruch" required />
            <button
              disabled={
                busy || opportunities.length === 0 || deliverables.length === 0
              }
            >
              Utwórz szkic
            </button>
            {deliverables.length === 0 && (
              <small>Najpierw utwórz dokument typu Deliverable.</small>
            )}
          </form>
        </details>

        <details>
          <summary>Odnowienie</summary>
          <form
            onSubmit={(event) =>
              submit("renewal", event, (data) => {
                const organizationId = value(data, "organizationId");
                const title = value(data, "title");
                const scope = value(data, "scope");
                const date = value(data, "expiresAt");
                if (!organizationId || !title || !scope || !date) return;
                const sourceId = value(data, "sourceId");
                return () =>
                  createRenewal(client!, snapshot, {
                    organizationId: organizationId as StrategicRecordId,
                    title,
                    scope,
                    expiresAt: `${date}T00:00:00.000Z`,
                    evidenceSourceIds: sourceId
                      ? [sourceId as KnowledgeSourceId]
                      : [],
                  });
              })
            }
          >
            <select name="organizationId" required>
              <option value="">Wybierz Organization</option>
              {organizations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input name="title" placeholder="Nazwa odnowienia" required />
            <input name="scope" placeholder="Zakres" required />
            <input name="expiresAt" type="date" required />
            <select name="sourceId">
              <option value="">Bez źródła</option>
              {sources.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <button disabled={busy || organizations.length === 0}>
              Dodaj i utwórz follow-up
            </button>
          </form>
        </details>

        <details>
          <summary>Fakt ze źródłem</summary>
          <form
            onSubmit={(event) =>
              submit("fact", event, (data) => {
                const organizationId = value(data, "organizationId");
                const factType = value(data, "factType");
                const factValue = value(data, "factValue");
                const sourceId = value(data, "sourceId");
                if (!organizationId || !factType || !factValue || !sourceId)
                  return;
                return () =>
                  createRelationshipFact(client!, snapshot, {
                    organizationId: organizationId as StrategicRecordId,
                    factType,
                    value: factValue,
                    evidenceSourceId: sourceId as KnowledgeSourceId,
                  });
              })
            }
          >
            <select name="organizationId" required>
              <option value="">Wybierz Organization</option>
              {organizations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input name="factType" placeholder="Typ faktu" required />
            <textarea
              name="factValue"
              placeholder="Potwierdzona wartość"
              required
            />
            <select name="sourceId" required>
              <option value="">Wybierz źródło</option>
              {sources.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <button disabled={busy || sources.length === 0}>Zapisz fakt</button>
          </form>
        </details>

        <details>
          <summary>Decyzja</summary>
          <form
            onSubmit={(event) =>
              submit("decision", event, (data) => {
                const title = value(data, "title");
                const rationale = value(data, "rationale");
                if (!title || !rationale) return;
                const sourceId = value(data, "sourceId");
                return () =>
                  createDecision(
                    client!,
                    snapshot,
                    title,
                    rationale,
                    sourceId ? [sourceId as KnowledgeSourceId] : [],
                  );
              })
            }
          >
            <input name="title" placeholder="Co zdecydowano?" required />
            <textarea name="rationale" placeholder="Dlaczego?" required />
            <select name="sourceId">
              <option value="">Bez źródła</option>
              {sources.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <button disabled={busy}>Zapisz decyzję</button>
          </form>
        </details>

        <details>
          <summary>Zastąp decyzję</summary>
          <form
            onSubmit={(event) =>
              submit("supersede", event, (data) => {
                const prior = decisions.find(
                  (item) => item.id === value(data, "decisionId"),
                );
                const title = value(data, "title");
                const rationale = value(data, "rationale");
                const reason = value(data, "reason");
                if (!prior || !title || !rationale || !reason) return;
                return () =>
                  supersedeDecision(client!, snapshot, prior, {
                    title,
                    rationale,
                    reason,
                  });
              })
            }
          >
            <select name="decisionId" required>
              <option value="">Bieżąca decyzja</option>
              {decisions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <input name="title" placeholder="Nowa decyzja" required />
            <textarea
              name="rationale"
              placeholder="Nowe uzasadnienie"
              required
            />
            <input
              name="reason"
              placeholder="Dlaczego zastępuje poprzednią?"
              required
            />
            <button disabled={busy || decisions.length === 0}>
              Zastąp z historią
            </button>
          </form>
        </details>

        <details>
          <summary>Reguła cykliczna</summary>
          <form
            onSubmit={(event) =>
              submit("recurrence", event, (data) => {
                const title = value(data, "title");
                const taskTitle = value(data, "taskTitle");
                const cadence = value(data, "cadence") as
                  "daily" | "weekly" | "monthly" | "yearly";
                if (!title || !taskTitle || !cadence) return;
                return () =>
                  createRecurrence(client!, snapshot, {
                    title,
                    taskTitle,
                    cadence,
                  });
              })
            }
          >
            <input name="title" placeholder="Nazwa reguły" required />
            <input
              name="taskTitle"
              placeholder="Tytuł powtarzanego zadania"
              required
            />
            <select name="cadence">
              <option value="weekly">Co tydzień</option>
              <option value="monthly">Co miesiąc</option>
              <option value="daily">Codziennie</option>
              <option value="yearly">Co rok</option>
            </select>
            <button disabled={busy}>Dodaj regułę</button>
          </form>
        </details>

        <details>
          <summary>Kandydat Radar</summary>
          <form
            onSubmit={(event) =>
              submit("radar", event, (data) => {
                const sourceId = value(data, "sourceId");
                const title = value(data, "title");
                const relevance = value(data, "relevance");
                if (!sourceId || !title || !relevance) return;
                return () =>
                  createRadarCandidate(client!, snapshot, {
                    sourceId: sourceId as KnowledgeSourceId,
                    title,
                    relevance,
                  });
              })
            }
          >
            <select name="sourceId" required>
              <option value="">Wybierz źródło</option>
              {sources.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <input name="title" placeholder="Co warto przejrzeć?" required />
            <textarea
              name="relevance"
              placeholder="Dlaczego to może być istotne?"
              required
            />
            <button disabled={busy || sources.length === 0}>
              Dodaj do skończonego przeglądu
            </button>
          </form>
        </details>
      </div>
    </section>
  );
};
