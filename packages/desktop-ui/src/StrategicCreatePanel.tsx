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
import { recurrenceCadenceLabels } from "./strategic-labels.js";

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
          <h2 id="strategic-create-title">Relationship register</h2>
          <span>Every record keeps a revision, an author and an audit</span>
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
          {launcherOpen ? "Close" : "Add record"}
        </button>
      </div>
      {launcherOpen && (
        <div className="strategic-create-options" id="strategic-create-options">
          <header>
            <h3>What do you want to add?</h3>
            <p>Pick a type once you know the role the record has to play.</p>
          </header>
          <div className="strategic-create-grid">
            <InlinePopover
              label="Organization"
              panelLabel="Add organization"
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
                  aria-label="Organization name"
                  placeholder="Organization name"
                  required
                />
                <input
                  name="nextAction"
                  aria-label="Next move for the organization"
                  placeholder="What happens next?"
                />
                <button disabled={busy}>Add organization</button>
              </form>
            </InlinePopover>

            <InlinePopover
              label="Opportunity"
              panelLabel="Add opportunity"
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
                  aria-label="Organization for the opportunity"
                  required
                >
                  <option value="">Choose organization</option>
                  {organizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  name="title"
                  aria-label="Opportunity name"
                  placeholder="Opportunity name"
                  required
                />
                <input
                  name="need"
                  aria-label="Confirmed need behind the opportunity"
                  placeholder="What need is confirmed?"
                  required
                />
                <input
                  name="nextAction"
                  aria-label="Next move for the opportunity"
                  placeholder="One concrete action"
                  required
                />
                <button disabled={busy || organizations.length === 0}>
                  Add opportunity
                </button>
                {organizations.length === 0 && (
                  <small>Add an organization first.</small>
                )}
              </form>
            </InlinePopover>

            <InlinePopover
              label="Person"
              panelLabel="Add person"
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
                  aria-label="Full name of the person"
                  placeholder="Full name"
                  required
                />
                <select
                  name="organizationId"
                  aria-label="Organization for the person"
                >
                  <option value="">No organization</option>
                  {organizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  name="role"
                  aria-label="Role of the person"
                  placeholder="Role"
                />
                <input
                  name="email"
                  type="email"
                  aria-label="Email address of the person"
                  placeholder="Email"
                />
                <button disabled={busy}>Add person</button>
              </form>
            </InlinePopover>

            <InlinePopover
              label="Offer"
              panelLabel="Create offer draft"
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
                  aria-label="Opportunity for the offer"
                  required
                >
                  <option value="">Choose opportunity</option>
                  {opportunities.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <select
                  name="documentId"
                  aria-label="Deliverable for the offer"
                  required
                >
                  <option value="">Choose deliverable</option>
                  {deliverables.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <input
                  name="title"
                  aria-label="Offer name"
                  placeholder="Offer name"
                  required
                />
                <input
                  name="nextAction"
                  aria-label="Next move for the offer"
                  placeholder="Next move"
                  required
                />
                <button
                  disabled={
                    busy ||
                    opportunities.length === 0 ||
                    deliverables.length === 0
                  }
                >
                  Create draft
                </button>
                {deliverables.length === 0 && (
                  <small>Create a deliverable document first.</small>
                )}
              </form>
            </InlinePopover>

            <InlinePopover
              label="Renewal"
              panelLabel="Add renewal"
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
                  aria-label="Organization for the renewal"
                  required
                >
                  <option value="">Choose organization</option>
                  {organizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  name="title"
                  aria-label="Renewal name"
                  placeholder="Renewal name"
                  required
                />
                <input
                  name="scope"
                  aria-label="Scope of the renewal"
                  placeholder="Scope"
                  required
                />
                <input
                  name="expiresAt"
                  type="date"
                  aria-label="Expiry date of the renewal"
                  required
                />
                <select name="sourceId" aria-label="Source for the renewal">
                  <option value="">No source</option>
                  {sources.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <button disabled={busy || organizations.length === 0}>
                  Add and create follow-up
                </button>
              </form>
            </InlinePopover>

            <InlinePopover
              label="Relationship fact"
              panelLabel="Save a relationship fact with its source"
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
                  aria-label="Organization the fact describes"
                  required
                >
                  <option value="">Choose organization</option>
                  {organizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  name="factType"
                  aria-label="Fact type"
                  placeholder="Fact type"
                  required
                />
                <textarea
                  name="factValue"
                  aria-label="Confirmed value of the fact"
                  placeholder="Confirmed value"
                  required
                />
                <select
                  name="sourceId"
                  aria-label="Source for the fact"
                  required
                >
                  <option value="">Choose source</option>
                  {sources.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <button disabled={busy || sources.length === 0}>
                  Save fact
                </button>
              </form>
            </InlinePopover>

            <InlinePopover
              label="Decision"
              panelLabel="Save decision"
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
                  aria-label="What the decision says"
                  placeholder="What was decided?"
                  required
                />
                <textarea
                  name="rationale"
                  aria-label="Rationale for the decision"
                  placeholder="Why?"
                  required
                />
                <select name="sourceId" aria-label="Source for the decision">
                  <option value="">No source</option>
                  {sources.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <button disabled={busy}>Save decision</button>
              </form>
            </InlinePopover>

            <InlinePopover
              label="Supersede decision"
              panelLabel="Supersede a decision and keep the history"
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
                  aria-label="Decision to supersede"
                  required
                >
                  <option value="">Current decision</option>
                  {decisions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <input
                  name="title"
                  aria-label="What the new decision says"
                  placeholder="New decision"
                  required
                />
                <textarea
                  name="rationale"
                  aria-label="Rationale for the new decision"
                  placeholder="New rationale"
                  required
                />
                <input
                  name="reason"
                  aria-label="Reason for superseding the previous decision"
                  placeholder="Why does it replace the previous one?"
                  required
                />
                <button disabled={busy || decisions.length === 0}>
                  Supersede and keep history
                </button>
              </form>
            </InlinePopover>

            <InlinePopover
              label="Recurrence"
              panelLabel="Add recurrence"
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
                  aria-label="Name of the recurrence"
                  placeholder="Recurrence name"
                  required
                />
                <input
                  name="taskTitle"
                  aria-label="Title of the repeated task"
                  placeholder="Title of the repeated task"
                  required
                />
                <select name="cadence" aria-label="Cadence of the recurrence">
                  <option value="weekly">
                    {recurrenceCadenceLabels.weekly}
                  </option>
                  <option value="monthly">
                    {recurrenceCadenceLabels.monthly}
                  </option>
                  <option value="daily">{recurrenceCadenceLabels.daily}</option>
                  <option value="yearly">
                    {recurrenceCadenceLabels.yearly}
                  </option>
                </select>
                <button disabled={busy}>Add recurrence</button>
              </form>
            </InlinePopover>

            <InlinePopover
              label="Knowledge radar"
              panelLabel="Add a knowledge radar candidate"
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
                  aria-label="Source for the radar candidate"
                  required
                >
                  <option value="">Choose source</option>
                  {sources.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <input
                  name="title"
                  aria-label="Title of the radar candidate"
                  placeholder="What is worth reading?"
                  required
                />
                <textarea
                  name="relevance"
                  aria-label="Why the radar candidate matters"
                  placeholder="Why might this matter?"
                  required
                />
                <button disabled={busy || sources.length === 0}>
                  Add to review
                </button>
              </form>
            </InlinePopover>
          </div>
        </div>
      )}
    </section>
  );
};
