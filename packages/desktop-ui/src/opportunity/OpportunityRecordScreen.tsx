import { useState, type ReactElement } from "react";

import type {
  Currency,
  KnowledgeSourceId,
  PrincipalId,
  ProjectId,
  StrategicRecordId,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import type {
  CommentListProjection,
  DataSlice,
  DesktopSnapshot,
  MutationFailure,
} from "../client/workflow.js";
import { updateOffer, updateOpportunity } from "../client/workflow.js";
import {
  fmtApprox,
  fmtMoney,
  type Money,
  type MoneySettings,
  type OfferPriceState,
} from "../crm/money.js";
import {
  dealValueReading,
  indexRelationships,
  type OfferRecord,
  type OpportunityRecord,
} from "../crm/organization-reading.js";
import { countLabel, dateKeyInZone, formatDate } from "../i18n.js";
import {
  RecordCommentsPanel,
  type MentionCandidate,
} from "../record/RecordCommentsPanel.js";
import {
  openThreadCount,
  restoreTab,
  type AttachmentCustody,
  type CommentActor,
  type CommentAttachment,
  type CommentThread,
  type PendingAttachment,
  type RecordTab,
} from "../record/record-tabs.js";
import { RecordTabStrip } from "../record/RecordTabStrip.js";
import screen from "../record/record-screen.module.css";
import {
  offerSheet,
  OFFER_STATE_LABELS,
  orderOffers,
  paragraphsOf,
  stageStanding,
} from "./opportunity-view.js";
import styles from "./opportunity-record.module.css";

// The deal READ whole — the fifth screen of the CRM wave, and the first place a
// Pipeline card can open that is not somebody else's record.
//
// Until it existed a card opened the ORGANISATION, and three things followed
// from that. `qualification` — the CRM analogue of a project's intended outcome,
// and prose of the same length — was on no screen at all, and the accepted
// Pipeline card deliberately keeps it off (`recon §1.5`) precisely because it
// arrives as paragraphs. An offer's history had nowhere to be read: the card
// shows ONE offer, the leading one, and the versions behind it were a chip
// saying how many. And a comment cannot hang on a deal without a record to hang
// it on.
//
// It mirrors `ProjectRecordScreen` and `TaskRecordScreen` and keeps the three
// rules those files state, because they are the rules that make a record screen
// work rather than this file's preferences:
//
//  1. One `<h1>`, and it is this record's title. The surface does not draw a
//     second one for this view.
//  2. `RecordTabStrip` owns the single `role="tabpanel"`. A second one trips the
//     dangling-ARIA guard locally and burns a three-second deadline per
//     destination in the packaged smoke, which then fails with a message about a
//     timeout rather than about ARIA.
//  3. Only the panel on screen is built.
//
// It is LAZY at its mount for a measured reason, not a preference: this file
// plus its sheet plus the comments panel are several times the room the hot-path
// size gate leaves, and a deal nobody has opened costs nothing.
//
// WHAT IT DOES NOT AUTHOR, named rather than left to be discovered. An
// opportunity's `state` moves through `opportunity.linkOutcomes` together with
// the links it belongs to, and that command is `revertability: "never"` and
// demands `offerIds`, `projectIds`, `state` and `nextAction` in one write. No
// wrapper sets `state` alone and this screen does not reach for one: a control
// here would overwrite links it never meant to touch. Cost and rate are not
// edited either — they arrive from the distribution, and a form for them is a
// data-entry screen nobody has specified.

/**
 * Which tab each DEAL was left on.
 *
 * A third `localStorage` key, and separate for the mechanical reason the task
 * record's own header gives: each key holds a 20-entry LRU window written by a
 * module-private helper, so two writers over one key keep two windows and each
 * one's write evicts entries the other still believes are stored. Records would
 * lose their tab at random.
 */
const TAB_STORE_KEY = "constellation.opportunity-record-tab.v1";
const TAB_STORE_LIMIT = 20;

const readStoredTabs = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(TAB_STORE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
};

const rememberTab = (recordId: string, tab: RecordTab): void => {
  try {
    const stored = readStoredTabs();
    delete stored[recordId];
    const entries = [...Object.entries(stored), [recordId, tab] as const].slice(
      -TAB_STORE_LIMIT,
    );
    localStorage.setItem(
      TAB_STORE_KEY,
      JSON.stringify(Object.fromEntries(entries)),
    );
  } catch {
    // Storage refused. Losing which tab a record was left on is not worth
    // failing the render over.
  }
};

/**
 * The sections a deal offers. Three, and the absences are decisions.
 *
 * No Tasks tab: nothing in the domain hangs a task off an opportunity — the
 * projects it turned into are on Overview, as exits, beside the client.
 * No Documents tab: an offer's deliverable is reached from the offer that owns
 * it, and a flat list of them would lose which version each belongs to.
 * No Activity tab: `activity.list` is keyed on work records, and a tab that
 * could only ever be empty is a capability nobody built dressed as one somebody
 * did.
 */
const OPPORTUNITY_TABS: readonly RecordTab[] = [
  "overview",
  "offers",
  "comments",
];

/**
 * The workspace's home currency — the ONE place this screen decides it, and a
 * NAMED GAP rather than a default.
 *
 * `costInHome` converts *to* something, and that something is a workspace
 * setting: decision §2.3 accepted `homeCurrency` and an allowed-currency list
 * onto `Workspace`, and the scheduling amendment moved them out of both backend
 * lots into a follow-on PR that has not landed. `CommercialDefaultsProjection`
 * carries `{stages, markupPct, upliftPct}` and no currency.
 *
 * It is a single constant read once, and deliberately NOT a per-offer fallback
 * such as "convert to whatever the rate points at". That shape is what produces
 * a plausible amount in the wrong currency that nobody questions, which is the
 * exact failure `costInHome`'s pair guard exists to prevent — here a mismatched
 * pair still refuses, and refusing is the honest answer. The value is the
 * accepted prototype's own (`v3/data.js` `WORKSPACE_CONFIG.homeCurrency`).
 *
 * When the follow-on lands this becomes one field read off
 * `snapshot.bootstrap.workspace`, and nothing else on this screen moves.
 */
const HOME_CURRENCY: Currency = "PLN";

export interface OpportunityRecordScreenProps {
  /** Every reading comes off the snapshot, and it is passed whole for the reason
   *  `TaskRecordScreen` states: the mount lives in the entry chunk, and nine
   *  derivations spelled there are paid for on first paint by every reader who
   *  never opens a deal. The same nine here are paid for by whoever opens one. */
  readonly snapshot: DesktopSnapshot;
  /** The deal as `relationship.workspace` carries it. Passed rather than looked
   *  up because FINDING it is the mount's gate — a screen that could not find
   *  its own record would have to invent a state the surface already has. */
  readonly opportunity: OpportunityRecord;
  readonly client: ConstellationRendererClient | undefined;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
  readonly busy: boolean;
  readonly comments: DataSlice<CommentListProjection>;
  readonly commentBusy: boolean;
  readonly canComment: boolean;
  /** Settling anybody else's thread. The author may always settle their own,
   *  which is why this and `currentPrincipalId` travel together. */
  readonly canResolve: boolean;
  readonly currentPrincipalId: PrincipalId | undefined;
  readonly actorOf: (comment: CommentThread) => CommentActor;
  readonly mentionNameOf: (principalId: string) => string;
  readonly mentionCandidates: readonly MentionCandidate[];
  /** All FOUR arguments are forwarded to the panel. A caller supplying a
   *  two-parameter function is assignable here while silently dropping the last
   *  two — the answer then lands as a fresh comment under a strip that promised
   *  it was a reply, and the staged files never reach the write. */
  readonly onAddComment: (
    body: string,
    mentions: readonly PrincipalId[],
    parent?: CommentThread,
    attachmentSourceIds?: readonly KnowledgeSourceId[],
  ) => Promise<boolean>;
  readonly onEditComment: (
    comment: CommentThread,
    body: string,
    attachmentSourceIds?: readonly KnowledgeSourceId[],
  ) => Promise<boolean>;
  readonly onResolveComment: (
    comment: CommentThread,
    resolved: boolean,
  ) => Promise<boolean>;
  readonly onAttachToComment: () => Promise<PendingAttachment | undefined>;
  readonly onInspectAttachment: (
    attachment: CommentAttachment,
  ) => Promise<AttachmentCustody>;
  readonly onRestoreAttachment: (
    attachment: CommentAttachment,
  ) => Promise<AttachmentCustody>;
  readonly onBack: () => void;
  /** The NAME travels with the id because the shell names the tab it opens, and
   *  this screen has already resolved the record it was clicked on. */
  readonly onOpenOrganization: (
    organizationId: StrategicRecordId,
    name: string,
  ) => void;
  readonly onOpenProject: (projectId: ProjectId, title: string) => void;
}

/** A written field and its editor, sharing one shape so the three on this screen
 *  cannot drift apart. */
type Field = "need" | "qualification" | "nextAction";

const FIELD_LABELS: Readonly<Record<Field, string>> = {
  need: "What they need",
  qualification: "Qualification",
  nextAction: "Next action",
};

const FIELD_EMPTY: Readonly<Record<Field, string>> = {
  need: "Nothing written about what they need",
  qualification: "This deal has not been qualified in writing",
  nextAction: "No next action recorded",
};

export const OpportunityRecordScreen = ({
  snapshot,
  opportunity,
  client,
  onReload,
  onFailure,
  busy,
  comments,
  commentBusy,
  canComment,
  canResolve,
  currentPrincipalId,
  actorOf,
  mentionNameOf,
  mentionCandidates,
  onAddComment,
  onEditComment,
  onResolveComment,
  onAttachToComment,
  onInspectAttachment,
  onRestoreAttachment,
  onBack,
  onOpenOrganization,
  onOpenProject,
}: OpportunityRecordScreenProps) => {
  const [selected, setSelected] = useState<RecordTab>(() =>
    restoreTab(readStoredTabs()[opportunity.id]),
  );
  const [editing, setEditing] = useState<Field | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [writing, setWriting] = useState(false);
  const [confirmingOfferId, setConfirmingOfferId] = useState<
    string | undefined
  >(undefined);
  const [priceDraft, setPriceDraft] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [estimateDraft, setEstimateDraft] = useState("");

  const select = (tab: RecordTab): void => {
    rememberTab(opportunity.id, tab);
    setSelected(tab);
  };

  const workspace = snapshot.bootstrap.workspace;
  const settings: MoneySettings = {
    homeCurrency: HOME_CURRENCY,
    markupPct: workspace.commercialDefaults.markupPct,
  };
  const stages = workspace.commercialDefaults.stages;
  const timeZone = workspace.timezone;

  // The record is only reachable because the mount found it in this slice, so
  // the slice is `ready` by construction here. The index is still built from it
  // rather than from a narrower prop: one reading, and `dealValue` is the same
  // arithmetic the board and the organisation row use.
  const index = indexRelationships(
    snapshot.relationships.kind === "ready"
      ? snapshot.relationships.data.records
      : [],
  );
  const organization = index.organizations.find(
    (record) => record.id === opportunity.organizationId,
  );
  const owner =
    opportunity.ownerPersonId === undefined
      ? undefined
      : (index.peopleByOrganization
          .get(opportunity.organizationId)
          ?.find((person) => person.id === opportunity.ownerPersonId) ??
        index.loosePeople.find(
          (person) => person.id === opportunity.ownerPersonId,
        ));
  const contacts =
    index.peopleByOrganization.get(opportunity.organizationId) ?? [];
  const offers = orderOffers(
    index.offersByOpportunity.get(opportunity.id) ?? [],
  );
  const standing = stageStanding(opportunity, stages, {
    timeZone,
    todayKey: dateKeyInZone(new Date(), timeZone),
  });
  const value = dealValueReading(opportunity, index);

  // Undefined and empty are DIFFERENT facts. A failed load collapsed into an
  // empty list would put "Comments 0" on the tab beside a panel saying the
  // comments could not be read — a number is a claim, and there is nothing to
  // claim it from.
  const threads = comments.kind === "ready" ? comments.data.threads : undefined;

  const counts: Partial<Record<RecordTab, number>> = {
    offers: offers.length,
    ...(threads === undefined ? {} : { comments: openThreadCount(threads) }),
  };

  const settle = (
    result: { readonly kind: string } & Record<string, unknown>,
  ): void => {
    setWriting(false);
    if (result.kind === "success") void onReload();
    else onFailure(result as unknown as MutationFailure);
  };

  const write = (change: Parameters<typeof updateOpportunity>[3]): void => {
    if (client === undefined) return;
    setWriting(true);
    void updateOpportunity(client, snapshot, opportunity, change).then(settle);
  };

  const writeOffer = (
    offer: OfferRecord,
    change: Parameters<typeof updateOffer>[3],
  ): void => {
    if (client === undefined) return;
    setWriting(true);
    void updateOffer(client, snapshot, offer, change).then(settle);
  };

  const openEditor = (field: Field): void => {
    setDraft(opportunity[field]);
    setEditing(field);
  };

  const locked = busy || writing || client === undefined;

  const writtenField = (field: Field): ReactElement => {
    const text = opportunity[field];
    const paragraphs = paragraphsOf(text);
    return (
      <section className={styles.doc} key={field}>
        <div className={styles.docHead}>
          <h2 className={styles.docHeading}>{FIELD_LABELS[field]}</h2>
          {editing !== field && (
            <button
              className={styles.textAction}
              disabled={locked}
              onClick={() => openEditor(field)}
              type="button"
            >
              {paragraphs.length === 0 ? "Write it" : "Edit"}
            </button>
          )}
        </div>
        {editing === field ? (
          <form
            aria-label={`Edit ${FIELD_LABELS[field].toLowerCase()}`}
            className={styles.editor}
            onSubmit={(event) => {
              event.preventDefault();
              setEditing(undefined);
              write({ [field]: draft });
            }}
          >
            <label className="sr-only" htmlFor={`opportunity-${field}`}>
              {FIELD_LABELS[field]}
            </label>
            <textarea
              className={styles.textarea}
              id={`opportunity-${field}`}
              // The kernel's own bound on the only capped one of the three.
              // `need` and `qualification` are free prose and get no ceiling
              // here that the command does not impose.
              {...(field === "nextAction" ? { maxLength: 1000 } : {})}
              onChange={(event) => setDraft(event.target.value)}
              rows={field === "nextAction" ? 3 : 10}
              value={draft}
            />
            <div className={styles.editorActions}>
              <button className={styles.action} disabled={locked} type="submit">
                Save
              </button>
              <button
                className={styles.textAction}
                onClick={() => setEditing(undefined)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : paragraphs.length === 0 ? (
          <p className={styles.docEmpty}>{FIELD_EMPTY[field]}</p>
        ) : (
          // The BODY of the record, not a teaser of one. The LINE is limited
          // and the height deliberately is not: there is no clamp, no
          // max-block-size and no expander. A real qualification runs several
          // paragraphs, and hiding them behind a control is the thing this
          // screen exists to stop.
          <div className={styles.prose} data-opportunity-field={field}>
            {paragraphs.map((paragraph, position) => (
              <p key={`${field}-${position.toString()}`}>{paragraph}</p>
            ))}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className={screen.screen} data-record-kind="opportunity">
      <div className={screen.crumbs}>
        <button className={screen.back} onClick={onBack} type="button">
          <span aria-hidden="true">‹</span> Pipeline
        </button>
      </div>

      <header className={styles.header}>
        <h1 className={styles.title} id="surface-title" tabIndex={-1}>
          {opportunity.title}
        </h1>
        <p className={styles.head}>
          {organization === undefined ? (
            <span className={styles.quiet}>Client unavailable</span>
          ) : (
            <button
              className={styles.link}
              onClick={() =>
                onOpenOrganization(organization.id, organization.name)
              }
              type="button"
            >
              {organization.name}
            </button>
          )}
          <span aria-hidden="true" className={styles.sep}>
            ·
          </span>
          <span data-opportunity-stage={standing.stageId}>
            {standing.label}
            {!standing.configured && (
              <span className={styles.warn}> · not a configured stage</span>
            )}
          </span>
          <span aria-hidden="true" className={styles.sep}>
            ·
          </span>
          {/* The duration is `stageEnteredAt` and NOTHING else. Falling back to
              the record's own age is the single mistake this field exists to
              prevent: the two were the same number for as long as a stage could
              not move, and a screen that kept the fallback would print the
              deal's age under the word "stage" and be wrong without ever
              looking wrong. */}
          <span data-opportunity-standing>
            {standing.days === undefined
              ? "time in this stage unknown"
              : `${countLabel(standing.days, "day")} in this stage`}
            {standing.stale && (
              <span className={styles.warn}> · not moving</span>
            )}
          </span>
        </p>
        <p className={styles.figures}>
          {/* The first number a reader sees, and it SAYS WHICH KIND it is.
              A confirmed offer amount and somebody's guess print as the same
              string otherwise — an assumption rendered like a fact, which is
              this repository's named defect and the thing the offer sheet below
              spends four channels avoiding. Two channels here as well: the word,
              and the `≈` that only an estimate carries. */}
          <span data-opportunity-value data-value-basis={value.basis}>
            {value.amount === null
              ? "No value yet — neither an estimate nor a confirmed offer"
              : value.basis === "offer"
                ? `${fmtMoney(value.amount)} from an offer`
                : `${fmtApprox(value.amount)} estimated`}
          </span>
          <span aria-hidden="true" className={styles.sep}>
            ·
          </span>
          <span>
            {owner === undefined ? "no owner recorded" : `run by ${owner.name}`}
          </span>
        </p>
      </header>

      <RecordTabStrip
        counts={counts}
        onSelect={select}
        recordId={opportunity.id}
        selected={selected}
        tabs={OPPORTUNITY_TABS}
      >
        {selected === "overview" && (
          <div className={styles.body}>
            <div className={styles.docs}>
              {writtenField("need")}
              {writtenField("qualification")}
              {writtenField("nextAction")}
            </div>

            <div className={styles.rail}>
              <section className={styles.railSection}>
                <h2 className={styles.railHeading}>Stage</h2>
                <label className="sr-only" htmlFor="opportunity-stage">
                  Stage
                </label>
                <select
                  className={styles.select}
                  disabled={locked}
                  id="opportunity-stage"
                  onChange={(event) => write({ stage: event.target.value })}
                  value={standing.stageId}
                >
                  {/* A deal standing on a stage the funnel no longer lists keeps
                      its position readable rather than being silently moved. It
                      is listed here so the select has a value, and marked so
                      nobody reads it as configured. */}
                  {!standing.configured && (
                    <option value={standing.stageId}>
                      {standing.stageId} — not configured
                    </option>
                  )}
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </section>

              <section className={styles.railSection}>
                <h2 className={styles.railHeading}>Estimate</h2>
                {/* The one money field the DEAL owns, as against the ones its
                    offers own — and this record is the only screen that could
                    ever write it: the Pipeline card has no room and no form.
                    Leaving it readable but unwritable while an offer's price is
                    both would be lopsided, so it is here.

                    It is what the board falls back to when no offer has a
                    confirmed price, which is why the block at the top says
                    WHICH of the two it is showing. */}
                {estimating ? (
                  <form
                    aria-label="Set the estimate"
                    className={styles.priceForm}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const major = Number(estimateDraft);
                      if (!Number.isFinite(major) || major < 0) return;
                      setEstimating(false);
                      write({
                        estimate: {
                          amountMinor: Math.round(major * 100),
                          currency: HOME_CURRENCY,
                        } satisfies Money,
                      });
                    }}
                  >
                    <label htmlFor="opportunity-estimate">
                      What the deal is worth, {HOME_CURRENCY}
                    </label>
                    <input
                      className={styles.input}
                      id="opportunity-estimate"
                      inputMode="decimal"
                      onChange={(event) => setEstimateDraft(event.target.value)}
                      type="text"
                      value={estimateDraft}
                    />
                    <button
                      className={styles.action}
                      disabled={locked}
                      type="submit"
                    >
                      Save
                    </button>
                    <button
                      className={styles.textAction}
                      onClick={() => setEstimating(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <small className={styles.railNote}>
                      {/* Never a zero. Nobody having put a number on a deal is
                          not the same as the deal being worth nothing. */}
                      {opportunity.estimate === undefined
                        ? "Nobody has put a number on this deal."
                        : fmtMoney(opportunity.estimate)}
                    </small>
                    <button
                      className={styles.textAction}
                      disabled={locked}
                      onClick={() => {
                        setEstimateDraft(
                          opportunity.estimate === undefined
                            ? ""
                            : String(opportunity.estimate.amountMinor / 100),
                        );
                        setEstimating(true);
                      }}
                      type="button"
                    >
                      {opportunity.estimate === undefined
                        ? "Estimate it"
                        : "Change the estimate"}
                    </button>
                  </>
                )}
              </section>

              <section className={styles.railSection}>
                <h2 className={styles.railHeading}>Owner</h2>
                <label className="sr-only" htmlFor="opportunity-owner">
                  Who runs this deal
                </label>
                <select
                  className={styles.select}
                  disabled={locked}
                  id="opportunity-owner"
                  onChange={(event) =>
                    write({
                      ownerPersonId:
                        event.target.value === ""
                          ? null
                          : (event.target.value as StrategicRecordId),
                    })
                  }
                  value={opportunity.ownerPersonId ?? ""}
                >
                  <option value="">Nobody recorded</option>
                  {contacts.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </section>

              <section className={styles.railSection}>
                <h2 className={styles.railHeading}>Delivered as</h2>
                {opportunity.projectIds.length === 0 ? (
                  <small className={styles.railNote}>
                    Nothing has been turned into a project yet.
                  </small>
                ) : (
                  opportunity.projectIds.map((projectId) => {
                    const project =
                      snapshot.projects.kind === "ready"
                        ? snapshot.projects.data.items.find(
                            (candidate: { readonly id: string }) =>
                              candidate.id === projectId,
                          )
                        : undefined;
                    return (
                      <button
                        className={styles.railRow}
                        data-opportunity-project={projectId}
                        disabled={project === undefined}
                        key={projectId}
                        onClick={() =>
                          project !== undefined &&
                          onOpenProject(project.id, project.title)
                        }
                        type="button"
                      >
                        {/* A project this reader cannot reach says so rather
                            than offering a button that goes nowhere: the
                            projects slice is independently degradable, and an
                            id rendered as a title would be a claim about a
                            record nobody read. */}
                        {project?.title ??
                          (snapshot.projects.kind === "unavailable"
                            ? "Projects could not be read"
                            : "Not in this reader's Spaces")}
                      </button>
                    );
                  })
                )}
              </section>

              <section className={styles.railSection}>
                <h2 className={styles.railHeading}>Evidence</h2>
                {opportunity.evidenceSourceIds.length === 0 ? (
                  <small className={styles.railNote}>
                    No source recorded behind this deal.
                  </small>
                ) : (
                  <small className={styles.railNote}>
                    {countLabel(opportunity.evidenceSourceIds.length, "source")}{" "}
                    recorded behind this deal.
                  </small>
                )}
              </section>
            </div>
          </div>
        )}

        {selected === "offers" && (
          <div className={styles.offers}>
            {offers.length === 0 ? (
              <p className={styles.docEmpty}>
                No offer on this deal yet. Its value is
                {value.amount === null
                  ? " not recorded either."
                  : " the estimate above."}
              </p>
            ) : (
              offers.map((offer, position) => {
                const sheet = offerSheet(offer, settings, timeZone);
                return (
                  <article
                    aria-label={sheet.sentence}
                    className={styles.offer}
                    data-offer={offer.id}
                    data-offer-lead={position === 0 ? "true" : undefined}
                    key={offer.id}
                  >
                    <div className={styles.offerHead}>
                      <h2 className={styles.offerTitle}>{offer.title}</h2>
                      <span
                        className={styles.offerState}
                        data-offer-state={offer.state}
                      >
                        {OFFER_STATE_LABELS[offer.state]}
                      </span>
                      {/* Which one is current is carried by ORDER, and order
                          alone is not a channel a reader arriving mid-list can
                          use. The word says it too. */}
                      {position === 0 && offers.length > 1 && (
                        <span className={styles.offerLead}>
                          current version
                        </span>
                      )}
                    </div>

                    {sheet.waiting !== undefined ? (
                      // Waiting for the distribution's quote is a STATE OF THE
                      // WORK, not missing data, and the first number to arrive
                      // is the cost. A zero here would be a lie about the value
                      // of the conversation.
                      <p className={styles.wait} data-offer-waiting>
                        {sheet.waiting}
                      </p>
                    ) : (
                      <dl className={styles.quote}>
                        {sheet.rows.map((row) => (
                          <div className={styles.quoteRow} key={row.key}>
                            <dt>{row.label}</dt>
                            <dd data-offer-row={row.key}>
                              <b>{row.value}</b>
                              {row.chip !== "" && (
                                <span
                                  className={`${styles.chip} ${styles[`chip_${row.chipKind}`] ?? ""}`}
                                  data-price-basis={
                                    row.key === "price"
                                      ? row.chipKind
                                      : undefined
                                  }
                                >
                                  {row.chip}
                                </span>
                              )}
                              {row.note !== "" && (
                                <span className={styles.note}>{row.note}</span>
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    <div className={styles.offerActions}>
                      <label
                        className="sr-only"
                        htmlFor={`offer-state-${offer.id}`}
                      >
                        State of {offer.title}
                      </label>
                      <select
                        className={styles.select}
                        disabled={locked}
                        id={`offer-state-${offer.id}`}
                        onChange={(event) =>
                          writeOffer(offer, {
                            state: event.target.value as OfferRecord["state"],
                          })
                        }
                        value={offer.state}
                      >
                        {(
                          Object.keys(
                            OFFER_STATE_LABELS,
                          ) as OfferRecord["state"][]
                        ).map((state) => (
                          <option key={state} value={state}>
                            {OFFER_STATE_LABELS[state]}
                          </option>
                        ))}
                      </select>

                      {confirmingOfferId === offer.id ? (
                        <form
                          aria-label={`Confirm the price of ${offer.title}`}
                          className={styles.priceForm}
                          onSubmit={(event) => {
                            event.preventDefault();
                            const major = Number(priceDraft);
                            if (!Number.isFinite(major)) return;
                            setConfirmingOfferId(undefined);
                            const price: OfferPriceState = {
                              basis: "confirmed",
                              price: {
                                amountMinor: Math.round(major * 100),
                                currency: HOME_CURRENCY,
                              } satisfies Money,
                            };
                            writeOffer(offer, { price });
                          }}
                        >
                          <label htmlFor={`offer-price-${offer.id}`}>
                            Agreed price, {HOME_CURRENCY}
                          </label>
                          <input
                            className={styles.input}
                            id={`offer-price-${offer.id}`}
                            inputMode="decimal"
                            onChange={(event) =>
                              setPriceDraft(event.target.value)
                            }
                            type="text"
                            value={priceDraft}
                          />
                          <button
                            className={styles.action}
                            disabled={locked}
                            type="submit"
                          >
                            Confirm
                          </button>
                          <button
                            className={styles.textAction}
                            onClick={() => setConfirmingOfferId(undefined)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <button
                            className={styles.textAction}
                            disabled={locked}
                            onClick={() => {
                              setPriceDraft("");
                              setConfirmingOfferId(offer.id);
                            }}
                            type="button"
                          >
                            {offer.price?.basis === "confirmed"
                              ? "Change the agreed price"
                              : "Confirm this price"}
                          </button>
                          {offer.price?.basis === "confirmed" && (
                            // `{basis:"derived"}` is SENT, never treated as
                            // "nothing to change": the kernel turns it into a
                            // clear, so derived has exactly one spelling on the
                            // record and un-confirming can never leave a stale
                            // amount behind a card that reads as derived.
                            <button
                              className={styles.textAction}
                              disabled={locked}
                              onClick={() =>
                                writeOffer(offer, {
                                  price: { basis: "derived" },
                                })
                              }
                              type="button"
                            >
                              Un-confirm the price
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <p className={styles.railNote}>
                      Written {formatDate(offer.updatedAt, timeZone)}
                    </p>
                  </article>
                );
              })
            )}
          </div>
        )}

        {selected === "comments" && (
          <>
            {/* A read that failed says so, and says it ABOVE the panel rather
                than in place of it: the write is checked against the RECORD's
                version, which this slice does not carry, so it still lands with
                no threads on screen — and a reader whose only grant is `comment`
                would otherwise be left with a sentence and nothing to type
                into. */}
            {comments.kind === "unavailable" && (
              <p className={screen.unavailable} role="status">
                {comments.message}
              </p>
            )}
            <RecordCommentsPanel
              actorOf={actorOf}
              busy={commentBusy || busy}
              canComment={canComment}
              canResolve={canResolve}
              currentPrincipalId={currentPrincipalId}
              mentionCandidates={mentionCandidates}
              mentionNameOf={(principalId) => mentionNameOf(principalId)}
              onAttach={onAttachToComment}
              onEdit={onEditComment}
              onInspectAttachment={onInspectAttachment}
              onResolve={onResolveComment}
              onRestoreAttachment={onRestoreAttachment}
              onSubmit={onAddComment}
              recordKey={opportunity.id}
              threads={threads ?? []}
              threadsKnown={threads !== undefined}
              timeZone={timeZone}
            />
          </>
        )}
      </RecordTabStrip>
    </div>
  );
};

export default OpportunityRecordScreen;
