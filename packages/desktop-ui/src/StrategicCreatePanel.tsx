import { useState, type FormEvent } from "react";

import type {
  DocumentId,
  KnowledgeSourceId,
  StrategicRecordId,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  createDecision,
  createOffer,
  createOpportunity,
  createOrganization,
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
import {
  InlinePopover,
  reportFirstEmptyRequiredField,
} from "./components/InlinePopover.js";

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
  readonly onRun: (id: string, operation: Operation) => Promise<boolean>;
}) => {
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [openId, setOpenId] = useState<string>();
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
  // The popover form resets by unmounting, so it closes (and resets) only
  // after the mutation succeeds; a failure keeps the draft visible. A make()
  // that returns undefined means a required field holds only whitespace —
  // report it instead of refusing silently.
  const submit = async (
    id: string,
    event: FormEvent<HTMLFormElement>,
    make: (data: FormData) => Operation | undefined,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!client) return;
    const operation = make(new FormData(form));
    if (operation === undefined) {
      reportFirstEmptyRequiredField(form);
      return;
    }
    if (await onRun(id, operation)) {
      setOpenId(undefined);
      setLauncherOpen(false);
    }
  };

  const toggleLauncher = () => {
    if (launcherOpen) setOpenId(undefined);
    setLauncherOpen(!launcherOpen);
  };

  return (
    <section
      className="strategic-create-panel"
      aria-labelledby="strategic-create-title"
    >
      <div className="strategic-create-toolbar">
        <div>
          <h2 id="strategic-create-title">Rejestr relacji</h2>
          <span>Każdy zapis ma wersję, autora i audyt</span>
        </div>
        <button
          type="button"
          className="strategic-create-toggle"
          aria-expanded={launcherOpen}
          {...(launcherOpen
            ? { "aria-controls": "strategic-create-options" }
            : {})}
          onClick={toggleLauncher}
        >
          <span aria-hidden="true">{launcherOpen ? "×" : "+"}</span>
          {launcherOpen ? "Zamknij wybór" : "Dodaj rekord"}
        </button>
      </div>
      {launcherOpen && (
        <div className="strategic-create-options" id="strategic-create-options">
          <header>
            <h3>Co chcesz dodać?</h3>
            <p>
              Wybierz typ dopiero wtedy, gdy wiesz, jaką rolę ma pełnić zapis.
            </p>
          </header>
          <div className="strategic-create-grid">
            <InlinePopover
              label="Organizacja"
              panelLabel="Dodaj organizację"
              open={openId === "organization"}
              onOpenChange={(next) =>
                setOpenId(next ? "organization" : undefined)
              }
            >
              <form
                onSubmit={(event) =>
                  void submit("organization", event, (data) => {
                    const name = value(data, "name");
                    if (!name) return;
                    return () =>
                      createOrganization(client!, snapshot, {
                        name,
                        nextAction: value(data, "nextAction"),
                      });
                  })
                }
              >
                <input
                  name="name"
                  aria-label="Nazwa organizacji"
                  placeholder="Nazwa organizacji"
                  required
                />
                <input
                  name="nextAction"
                  aria-label="Następny ruch dla organizacji"
                  placeholder="Co ma wydarzyć się dalej?"
                />
                <button disabled={busy}>Dodaj organizację</button>
              </form>
            </InlinePopover>

            <InlinePopover
              label="Szansa"
              panelLabel="Dodaj szansę"
              open={openId === "opportunity"}
              onOpenChange={(next) =>
                setOpenId(next ? "opportunity" : undefined)
              }
            >
              <form
                onSubmit={(event) =>
                  void submit("opportunity", event, (data) => {
                    const organizationId = value(data, "organizationId");
                    const title = value(data, "title");
                    const need = value(data, "need");
                    const nextAction = value(data, "nextAction");
                    if (!organizationId || !title || !need || !nextAction)
                      return;
                    return () =>
                      createOpportunity(client!, snapshot, {
                        organizationId: organizationId as StrategicRecordId,
                        title,
                        need,
                        nextAction,
                      });
                  })
                }
              >
                <select
                  name="organizationId"
                  aria-label="Organizacja szansy"
                  required
                >
                  <option value="">Wybierz organizację</option>
                  {organizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  name="title"
                  aria-label="Nazwa szansy"
                  placeholder="Nazwa szansy"
                  required
                />
                <input
                  name="need"
                  aria-label="Potwierdzona potrzeba szansy"
                  placeholder="Jaka potrzeba jest potwierdzona?"
                  required
                />
                <input
                  name="nextAction"
                  aria-label="Następny ruch dla szansy"
                  placeholder="Jedna konkretna czynność"
                  required
                />
                <button disabled={busy || organizations.length === 0}>
                  Dodaj szansę
                </button>
                {organizations.length === 0 && (
                  <small>Najpierw dodaj organizację.</small>
                )}
              </form>
            </InlinePopover>

            <InlinePopover
              label="Osoba"
              panelLabel="Dodaj osobę"
              open={openId === "person"}
              onOpenChange={(next) => setOpenId(next ? "person" : undefined)}
            >
              <form
                onSubmit={(event) =>
                  void submit("person", event, (data) => {
                    const name = value(data, "name");
                    if (!name) return;
                    const organizationId = value(data, "organizationId");
                    return () =>
                      createPerson(client!, snapshot, {
                        name,
                        ...(organizationId
                          ? {
                              organizationId:
                                organizationId as StrategicRecordId,
                            }
                          : {}),
                        role: value(data, "role"),
                        email: value(data, "email"),
                      });
                  })
                }
              >
                <input
                  name="name"
                  aria-label="Imię i nazwisko osoby"
                  placeholder="Imię i nazwisko"
                  required
                />
                <select name="organizationId" aria-label="Organizacja osoby">
                  <option value="">Bez organizacji</option>
                  {organizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input name="role" aria-label="Rola osoby" placeholder="Rola" />
                <input
                  name="email"
                  type="email"
                  aria-label="Adres e-mail osoby"
                  placeholder="E-mail"
                />
                <button disabled={busy}>Dodaj osobę</button>
              </form>
            </InlinePopover>

            <InlinePopover
              label="Oferta"
              panelLabel="Utwórz szkic oferty"
              open={openId === "offer"}
              onOpenChange={(next) => setOpenId(next ? "offer" : undefined)}
            >
              <form
                onSubmit={(event) =>
                  void submit("offer", event, (data) => {
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
                <select
                  name="opportunityId"
                  aria-label="Szansa dla oferty"
                  required
                >
                  <option value="">Wybierz szansę</option>
                  {opportunities.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <select
                  name="documentId"
                  aria-label="Deliverable dla oferty"
                  required
                >
                  <option value="">Wybierz Deliverable</option>
                  {deliverables.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <input
                  name="title"
                  aria-label="Nazwa oferty"
                  placeholder="Nazwa oferty"
                  required
                />
                <input
                  name="nextAction"
                  aria-label="Następny ruch dla oferty"
                  placeholder="Następny ruch"
                  required
                />
                <button
                  disabled={
                    busy ||
                    opportunities.length === 0 ||
                    deliverables.length === 0
                  }
                >
                  Utwórz szkic
                </button>
                {deliverables.length === 0 && (
                  <small>Najpierw utwórz dokument typu Deliverable.</small>
                )}
              </form>
            </InlinePopover>

            <InlinePopover
              label="Odnowienie"
              panelLabel="Dodaj odnowienie"
              open={openId === "renewal"}
              onOpenChange={(next) => setOpenId(next ? "renewal" : undefined)}
            >
              <form
                onSubmit={(event) =>
                  void submit("renewal", event, (data) => {
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
                <select
                  name="organizationId"
                  aria-label="Organizacja odnowienia"
                  required
                >
                  <option value="">Wybierz organizację</option>
                  {organizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  name="title"
                  aria-label="Nazwa odnowienia"
                  placeholder="Nazwa odnowienia"
                  required
                />
                <input
                  name="scope"
                  aria-label="Zakres odnowienia"
                  placeholder="Zakres"
                  required
                />
                <input
                  name="expiresAt"
                  type="date"
                  aria-label="Data wygaśnięcia odnowienia"
                  required
                />
                <select name="sourceId" aria-label="Źródło odnowienia">
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
            </InlinePopover>

            <InlinePopover
              label="Fakt ze źródłem"
              panelLabel="Zapisz fakt ze źródłem"
              open={openId === "fact"}
              onOpenChange={(next) => setOpenId(next ? "fact" : undefined)}
            >
              <form
                onSubmit={(event) =>
                  void submit("fact", event, (data) => {
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
                <select
                  name="organizationId"
                  aria-label="Organizacja opisywana przez fakt"
                  required
                >
                  <option value="">Wybierz organizację</option>
                  {organizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  name="factType"
                  aria-label="Typ faktu"
                  placeholder="Typ faktu"
                  required
                />
                <textarea
                  name="factValue"
                  aria-label="Potwierdzona wartość faktu"
                  placeholder="Potwierdzona wartość"
                  required
                />
                <select name="sourceId" aria-label="Źródło faktu" required>
                  <option value="">Wybierz źródło</option>
                  {sources.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <button disabled={busy || sources.length === 0}>
                  Zapisz fakt
                </button>
              </form>
            </InlinePopover>

            <InlinePopover
              label="Decyzja"
              panelLabel="Zapisz decyzję"
              open={openId === "decision"}
              onOpenChange={(next) => setOpenId(next ? "decision" : undefined)}
            >
              <form
                onSubmit={(event) =>
                  void submit("decision", event, (data) => {
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
                <input
                  name="title"
                  aria-label="Treść decyzji"
                  placeholder="Co zdecydowano?"
                  required
                />
                <textarea
                  name="rationale"
                  aria-label="Uzasadnienie decyzji"
                  placeholder="Dlaczego?"
                  required
                />
                <select name="sourceId" aria-label="Źródło decyzji">
                  <option value="">Bez źródła</option>
                  {sources.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <button disabled={busy}>Zapisz decyzję</button>
              </form>
            </InlinePopover>

            <InlinePopover
              label="Zastąp decyzję"
              panelLabel="Zastąp decyzję z historią"
              open={openId === "supersede"}
              onOpenChange={(next) => setOpenId(next ? "supersede" : undefined)}
            >
              <form
                onSubmit={(event) =>
                  void submit("supersede", event, (data) => {
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
                <select
                  name="decisionId"
                  aria-label="Decyzja do zastąpienia"
                  required
                >
                  <option value="">Bieżąca decyzja</option>
                  {decisions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <input
                  name="title"
                  aria-label="Treść nowej decyzji"
                  placeholder="Nowa decyzja"
                  required
                />
                <textarea
                  name="rationale"
                  aria-label="Uzasadnienie nowej decyzji"
                  placeholder="Nowe uzasadnienie"
                  required
                />
                <input
                  name="reason"
                  aria-label="Powód zastąpienia poprzedniej decyzji"
                  placeholder="Dlaczego zastępuje poprzednią?"
                  required
                />
                <button disabled={busy || decisions.length === 0}>
                  Zastąp z historią
                </button>
              </form>
            </InlinePopover>

            <InlinePopover
              label="Reguła cykliczna"
              panelLabel="Dodaj regułę cykliczną"
              open={openId === "recurrence"}
              onOpenChange={(next) =>
                setOpenId(next ? "recurrence" : undefined)
              }
            >
              <form
                onSubmit={(event) =>
                  void submit("recurrence", event, (data) => {
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
                <input
                  name="title"
                  aria-label="Nazwa reguły cyklicznej"
                  placeholder="Nazwa reguły"
                  required
                />
                <input
                  name="taskTitle"
                  aria-label="Tytuł powtarzanego zadania"
                  placeholder="Tytuł powtarzanego zadania"
                  required
                />
                <select name="cadence" aria-label="Częstotliwość reguły">
                  <option value="weekly">Co tydzień</option>
                  <option value="monthly">Co miesiąc</option>
                  <option value="daily">Codziennie</option>
                  <option value="yearly">Co rok</option>
                </select>
                <button disabled={busy}>Dodaj regułę</button>
              </form>
            </InlinePopover>

            <InlinePopover
              label="Kandydat Radar"
              panelLabel="Dodaj kandydata Radaru"
              open={openId === "radar"}
              onOpenChange={(next) => setOpenId(next ? "radar" : undefined)}
            >
              <form
                onSubmit={(event) =>
                  void submit("radar", event, (data) => {
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
                <select
                  name="sourceId"
                  aria-label="Źródło kandydata Radar"
                  required
                >
                  <option value="">Wybierz źródło</option>
                  {sources.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <input
                  name="title"
                  aria-label="Tytuł kandydata Radar"
                  placeholder="Co warto przejrzeć?"
                  required
                />
                <textarea
                  name="relevance"
                  aria-label="Znaczenie kandydata Radar"
                  placeholder="Dlaczego to może być istotne?"
                  required
                />
                <button disabled={busy || sources.length === 0}>
                  Dodaj do skończonego przeglądu
                </button>
              </form>
            </InlinePopover>
          </div>
        </div>
      )}
    </section>
  );
};
