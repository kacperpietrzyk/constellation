// One reading of one client relationship, for every CRM screen that shows one.
//
// The accepted prototype computes it once (`v3/screens/crm.js:114-186`) and
// both places that need it read the same object: the Organizations row and the
// group head on People (`crm.js:490` — "one reading, two screens"). The same
// shape derived twice is this repository's named `restated-shape-drift` defect
// class, so it lives beside `money.ts` in `src/crm/` rather than inside either
// screen's directory. Nothing here renders and nothing here reads a snapshot
// field it was not handed, which is what lets the whole module be asserted
// without mounting anything.
//
// TWO RULES THE PROTOTYPE STATES AND THIS FILE KEEPS:
//
//  1. THE STATE OF A RELATIONSHIP IS COMPUTED, NEVER STORED. `organization`
//     carries `relationshipState` — a DECLARATION somebody makes — and this
//     file reads it only to tell a dormant relationship from a live one. The
//     reading itself comes from what actually moved: the contract, the
//     meetings, the deals and the delivery.
//  2. RELATIONSHIP RISK IS NOT DELIVERY RISK. A blocked task does not mean the
//     client is leaving; that is "watch". "At risk" is reserved for money and
//     the contract. Without the split, every client with a busy project turns
//     red and the column stops meaning anything (`crm.js:21-26`).
//
// WHAT THIS FILE DELIBERATELY CANNOT SAY, and why it says nothing rather than
// something cheerful. Two branches of the prototype's reading have no data
// behind them in this product yet:
//
//  - NOTES NAMING AN ORGANIZATION. `document.list` carries no entity
//    references (`contracts/src/query.ts:1566-1578`); the reference lives in
//    `document.backlinks`, one fetch per target, which a collection screen
//    cannot issue per row. So "last touch" is assembled from meetings alone,
//    and a note written yesterday does not count as contact.
//  - ANYTHING SCHEDULED. Every meeting record in `relationship.workspace` is
//    an IMPORTED one — it has already happened (`meeting-loop.ts:314-349` has
//    `startedAt`, no state, and no future arm). The prototype's
//    "no contact in N days, none scheduled" therefore cannot be written here:
//    the second half would be a claim about a calendar this reading never saw.
//    It says the silence and stops.
//
// Both are recorded as work rather than worked around, and neither is allowed
// to make a relationship read as healthy.

import type { RelationshipWorkspaceProjection } from "../client/workflow.js";

import { countLabel, formatDate } from "../i18n.js";
import { daysUntil } from "../today-plan.js";
import {
  fmtMoney,
  opportunityValue,
  sumByCurrency,
  type Money,
  type OpportunityValueInput,
  type OpportunityValueReading,
} from "./money.js";

type StrategicRecord = RelationshipWorkspaceProjection["records"][number];
export type OrganizationRecord = Extract<
  StrategicRecord,
  { kind: "organization" }
>;
export type PersonRecord = Extract<StrategicRecord, { kind: "person" }>;
export type OpportunityRecord = Extract<
  StrategicRecord,
  { kind: "opportunity" }
>;
export type OfferRecord = Extract<StrategicRecord, { kind: "offer" }>;
export type RenewalRecord = Extract<StrategicRecord, { kind: "renewal" }>;
export type FactRecord = Extract<
  StrategicRecord,
  { kind: "relationship_fact" }
>;
export type MeetingRecord = Extract<StrategicRecord, { kind: "meeting" }>;

/** No contact for longer than this stops being quiet and starts being a signal. */
export const CRM_QUIET_DAYS = 30;
/** How long before a renewal's lead window opens the conversation starts. */
export const CRM_LEAD_SOON = 14;
/** A deal standing in one stage longer than this has stopped moving. */
export const CRM_DEAL_STALE = 45;

/** Today, in the workspace's calendar rather than the machine's. */
export interface CrmProse {
  readonly timeZone: string;
  readonly todayKey: string;
}

const daysAgo = (
  instant: string | undefined,
  prose: CrmProse,
): number | undefined =>
  instant === undefined
    ? undefined
    : -daysUntil(instant, prose.todayKey, prose.timeZone);

/**
 * Where a contract stands against the moment somebody has to start talking
 * about it. `startAction` counts DOWN to that moment and goes negative once it
 * has passed, exactly as the prototype's clock does (`v3/app.js:287-301`).
 *
 * The full contract clock — elapsed term, `term 3`, the progress bar — belongs
 * to the Renewals screen and is not here: a group head shows when the
 * conversation starts, not how far into its term a contract is.
 */
export interface RenewalLead {
  readonly daysLeft: number;
  readonly startAction: number;
  readonly closed: boolean;
}

export const renewalLead = (
  renewal: RenewalRecord,
  prose: CrmProse,
): RenewalLead => ({
  daysLeft: daysUntil(renewal.expiresAt, prose.todayKey, prose.timeZone),
  startAction:
    daysUntil(renewal.expiresAt, prose.todayKey, prose.timeZone) -
    renewal.leadTimeDays,
  closed: renewal.state !== "watching",
});

/**
 * What the group head prints about the contract. "Time to start", never
 * "expires on the 30th": the expiry date is trivia until it is known how much
 * room is left for the conversation.
 */
export type RenewalTone = "soon" | "late" | "calm";

export const renewalPhrase = (
  lead: RenewalLead,
): { readonly text: string; readonly tone: RenewalTone } => {
  if (lead.startAction > 0)
    return {
      text: `start in ${countLabel(lead.startAction, "day")}`,
      tone: lead.startAction <= CRM_LEAD_SOON ? "soon" : "calm",
    };
  if (lead.startAction === 0) return { text: "start today", tone: "late" };
  return {
    text: `${countLabel(-lead.startAction, "day")} into the window`,
    tone: "late",
  };
};

/** The five shapes a reading can take. Shared with the project reading so one
 *  mark means one thing everywhere the shell draws it. */
export type SignalKey = "risk" | "watch" | "good" | "none";

export interface RelationshipSignal {
  readonly key: SignalKey;
  readonly label: string;
  /** Why it says that. Never empty — a badge without a reason is decoration,
   *  and this reason is rendered as VISIBLE text beside the badge, never as a
   *  `title` the keyboard and touch cannot reach. */
  readonly why: readonly string[];
}

/**
 * What the delivery side of the relationship knows about its HEALTH.
 * `undefined` means the projects or the work plane could not be read AT ALL —
 * which is a different answer from "no project is at risk" and must never be
 * rendered as the second one.
 *
 * The COUNT of deliveries is not in here on purpose: the
 * `project_serves_organization` link rides `relationship.workspace` with
 * everything else, so a client's project count survives a failed work plane
 * while its health does not.
 */
export interface DeliveryReading {
  readonly projectsAtRisk: number;
}

export interface OrganizationReading {
  readonly organization: OrganizationRecord;
  readonly deals: readonly OpportunityRecord[];
  /** One total per currency. Never one converted number — see `money.ts`. */
  readonly dealTotals: readonly Money[];
  readonly projectCount: number;
  readonly people: readonly PersonRecord[];
  /** The live contract nearest to expiry, if one is being watched. */
  readonly renewal: RenewalRecord | undefined;
  readonly lead: RenewalLead | undefined;
  /** Days since the last meeting that actually happened; `undefined` when none
   *  ever did. Notes do not count — this product cannot see which record a
   *  note names without a fetch per record. */
  readonly idleDays: number | undefined;
  readonly signal: RelationshipSignal;
}

/**
 * The records of one Space, bucketed by the organization they hang off, so a
 * screen with eight rows does not walk the whole projection eight times.
 * Built once per render and handed to every reading.
 */
export interface RelationshipIndex {
  readonly organizations: readonly OrganizationRecord[];
  readonly peopleByOrganization: ReadonlyMap<string, PersonRecord[]>;
  readonly loosePeople: readonly PersonRecord[];
  readonly opportunitiesByOrganization: ReadonlyMap<
    string,
    OpportunityRecord[]
  >;
  readonly opportunitiesById: ReadonlyMap<string, OpportunityRecord>;
  readonly offersByOpportunity: ReadonlyMap<string, OfferRecord[]>;
  readonly renewalsByOrganization: ReadonlyMap<string, RenewalRecord[]>;
  readonly factsByOrganization: ReadonlyMap<string, FactRecord[]>;
  readonly meetingsByOrganization: ReadonlyMap<string, MeetingRecord[]>;
  readonly meetingsByPerson: ReadonlyMap<string, MeetingRecord[]>;
  /** Project ids delivered at each organization, from the live half of the
   *  `project_serves_organization` edge. `work.linkRemove` flips the link's own
   *  `state` and leaves `recordState` alone, so a detached link stays in the
   *  projection forever — reading it as still linked would count a delivery
   *  that ended. Same filter as `client/workflow.ts:1812-1839`. */
  readonly projectsByOrganization: ReadonlyMap<string, string[]>;
}

const push = <T>(map: Map<string, T[]>, key: string, value: T): void => {
  const bucket = map.get(key);
  if (bucket === undefined) map.set(key, [value]);
  else bucket.push(value);
};

export const indexRelationships = (
  records: readonly StrategicRecord[],
): RelationshipIndex => {
  const organizations: OrganizationRecord[] = [];
  const peopleByOrganization = new Map<string, PersonRecord[]>();
  const loosePeople: PersonRecord[] = [];
  const opportunitiesByOrganization = new Map<string, OpportunityRecord[]>();
  const opportunitiesById = new Map<string, OpportunityRecord>();
  const offersByOpportunity = new Map<string, OfferRecord[]>();
  const renewalsByOrganization = new Map<string, RenewalRecord[]>();
  const factsByOrganization = new Map<string, FactRecord[]>();
  const meetingsByOrganization = new Map<string, MeetingRecord[]>();
  const meetingsByPerson = new Map<string, MeetingRecord[]>();
  const projectsByOrganization = new Map<string, string[]>();

  for (const record of records) {
    // A removed record is still in the projection: `recordState` is what says
    // whether it counts, and reading past it is how a deleted client keeps
    // appearing in a total.
    if (record.recordState !== "active") continue;
    switch (record.kind) {
      case "organization":
        organizations.push(record);
        break;
      case "person":
        if (record.organizationId === undefined) loosePeople.push(record);
        else push(peopleByOrganization, record.organizationId, record);
        break;
      case "opportunity":
        opportunitiesById.set(record.id, record);
        push(opportunitiesByOrganization, record.organizationId, record);
        break;
      case "offer":
        push(offersByOpportunity, record.opportunityId, record);
        break;
      case "renewal":
        push(renewalsByOrganization, record.organizationId, record);
        break;
      case "relationship_fact":
        push(factsByOrganization, record.organizationId, record);
        break;
      case "meeting": {
        const organizationId = record.meeting.organizationId;
        if (organizationId !== undefined)
          push(meetingsByOrganization, organizationId, record);
        for (const participant of record.meeting.participants) {
          if (participant.personId !== undefined)
            push(meetingsByPerson, participant.personId, record);
        }
        break;
      }
      case "work_link":
        if (
          record.state === "active" &&
          record.linkType === "project_serves_organization"
        )
          push(
            projectsByOrganization,
            record.targetRecordId,
            record.sourceRecordId,
          );
        break;
      default:
        break;
    }
  }

  return {
    organizations,
    peopleByOrganization,
    loosePeople,
    opportunitiesByOrganization,
    opportunitiesById,
    offersByOpportunity,
    renewalsByOrganization,
    factsByOrganization,
    meetingsByOrganization,
    meetingsByPerson,
    projectsByOrganization,
  };
};

/** A deal that is still being worked. `state` carries the outcome; `stage` is a
 *  workspace-configured position and cannot answer this, which is why the
 *  prototype's `stage in {won, lost}` test does not port. */
export const isOpenDeal = (deal: OpportunityRecord): boolean =>
  deal.state !== "rejected" && deal.state !== "lost";

/**
 * A deal in the vocabulary `money.ts` reasons about: an estimate, and every
 * offer's state and price. Exported because THREE different questions are asked
 * of it — "what is this deal worth" and "what kind of number is that" here, and
 * "what will this contract be worth when it renews" on the Renewals screen,
 * which hands the same object to `renewalOutlook`. One mapping, because a second
 * copy of it is where an offer state or a price basis quietly stops being read
 * on one screen only.
 */
export const opportunityValueInput = (
  deal: OpportunityRecord,
  index: RelationshipIndex,
): OpportunityValueInput => ({
  ...(deal.estimate === undefined ? {} : { estimate: deal.estimate }),
  offers: (index.offersByOpportunity.get(deal.id) ?? []).map((offer) => ({
    state: offer.state,
    ...(offer.price === undefined ? {} : { price: offer.price }),
  })),
});

/**
 * What a deal is worth AND what kind of number that is. One arithmetic module,
 * four screens.
 *
 * The basis is carried rather than dropped because a confirmed offer amount and
 * somebody's guess are not the same claim, and printed bare they are the same
 * string. `opportunityValue` returns `{amount, basis}` for exactly this reason;
 * a caller that only wants the amount takes `dealValue` below, which is this
 * function with the basis thrown away — a collection row has room for one number
 * and a record does not have that excuse.
 */
export const dealValueReading = (
  deal: OpportunityRecord,
  index: RelationshipIndex,
): OpportunityValueReading =>
  opportunityValue(opportunityValueInput(deal, index));

/** The amount alone, for the rows that have room for one number. */
export const dealValue = (
  deal: OpportunityRecord,
  index: RelationshipIndex,
): Money | null => dealValueReading(deal, index).amount;

/** "162,328 PLN · 40,000 EUR", or the honest absence. Never a zero: nobody
 *  having put a number on a deal is not the same as the deal being worth
 *  nothing. */
export const fmtTotals = (totals: readonly Money[]): string =>
  totals.length === 0
    ? "no value recorded"
    : totals.map((total) => fmtMoney(total)).join(" · ");

export const readOrganization = (
  organization: OrganizationRecord,
  index: RelationshipIndex,
  delivery: DeliveryReading | undefined,
  prose: CrmProse,
): OrganizationReading => {
  const deals = (
    index.opportunitiesByOrganization.get(organization.id) ?? []
  ).filter(isOpenDeal);
  const dealTotals = sumByCurrency(deals.map((deal) => dealValue(deal, index)));
  const people = index.peopleByOrganization.get(organization.id) ?? [];
  const projectCount = (index.projectsByOrganization.get(organization.id) ?? [])
    .length;
  const facts = index.factsByOrganization.get(organization.id) ?? [];
  const meetings = index.meetingsByOrganization.get(organization.id) ?? [];

  const renewal = (index.renewalsByOrganization.get(organization.id) ?? [])
    .filter((candidate) => candidate.state === "watching")
    .sort((left, right) => left.expiresAt.localeCompare(right.expiresAt))[0];
  const lead = renewal === undefined ? undefined : renewalLead(renewal, prose);

  const lastMet = meetings
    .map((meeting) => meeting.meeting.startedAt)
    .sort((left, right) => right.localeCompare(left))[0];
  const idleDays = daysAgo(lastMet, prose);

  const decisionMaker = facts.find(
    (fact) => fact.factType === "decision_maker",
  );
  const decisionMakerKnown = decisionMaker?.state === "current";

  // AT RISK — money and the contract, and nothing else.
  const risks: string[] = [];
  if (lead !== undefined && lead.startAction <= CRM_LEAD_SOON) {
    if (!decisionMakerKnown) {
      const when =
        lead.startAction > 0
          ? `renewal talks start in ${countLabel(lead.startAction, "day")}`
          : `renewal talks are ${countLabel(-lead.startAction, "day")} late to start`;
      const who =
        decisionMaker === undefined ? "never recorded" : decisionMaker.state;
      risks.push(`${when} · decision-maker ${who}`);
    }
  }
  // A deal that stopped moving. Measured from the moment it entered its stage
  // — and when that was never recorded the branch does NOT fire, because the
  // record's own age is a different quantity and the field exists precisely to
  // stop the two being confused (`contracts/src/query.ts:558-565`).
  const stalest = deals
    .map((deal) => ({ deal, days: daysAgo(deal.stageEnteredAt, prose) }))
    .filter(
      (entry): entry is { deal: OpportunityRecord; days: number } =>
        entry.days !== undefined,
    )
    .sort((left, right) => right.days - left.days)[0];
  if (stalest !== undefined && stalest.days > CRM_DEAL_STALE) {
    risks.push(
      `a deal has stood in one stage for ${countLabel(stalest.days, "day")}`,
    );
  }
  if (
    organization.relationshipState === "inactive" &&
    (deals.length > 0 || renewal !== undefined)
  ) {
    risks.push(
      deals.length > 0
        ? `marked inactive, but ${deals.length === 1 ? "a deal is" : `${deals.length} deals are`} still open`
        : "marked inactive, but a contract is still watched",
    );
  }

  // WATCH — delivery and silence. Real, but not what Monday morning is about.
  const watch: string[] = [];
  if (delivery === undefined) {
    // The failed read is stated, never swallowed. An organization whose
    // delivery could not be read must not come out of this function saying
    // "On track" — that is the green reading on a broken workspace.
    watch.push("delivery could not be read");
  } else if (delivery.projectsAtRisk > 0) {
    watch.push(
      `${delivery.projectsAtRisk} ${delivery.projectsAtRisk === 1 ? "project" : "projects"} at risk`,
    );
  }
  if (idleDays === undefined) watch.push("nothing recorded as contact");
  else if (idleDays > CRM_QUIET_DAYS)
    watch.push(`no contact in ${countLabel(idleDays, "day")}`);
  // A decision-maker already named beside the renewal does not come back a
  // second time; a repeated reason reads as two problems.
  const named =
    risks.length > 0 && decisionMaker !== undefined && !decisionMakerKnown;
  const unverified = facts.filter(
    (fact) =>
      fact.state !== "current" && !(named && fact.id === decisionMaker?.id),
  );
  if (unverified.length === 1 && unverified[0] !== undefined)
    watch.push(
      `${unverified[0].factType} not verified since ${formatDate(unverified[0].verifiedAt, prose.timeZone)}`,
    );
  else if (unverified.length > 1)
    watch.push(`${unverified.length} relationship facts unverified`);

  const contactPhrase =
    idleDays === undefined
      ? "no contact ever recorded"
      : idleDays === 0
        ? "contact today"
        : `last contact ${countLabel(idleDays, "day")} ago`;

  let signal: RelationshipSignal;
  if (organization.relationshipState === "inactive") {
    // A dormant relationship is neither healthy nor endangered — nothing in it
    // is standing. That is a state of its own, not the absence of one.
    const why = [...risks, ...watch];
    signal = {
      key: "none",
      label: "Dormant",
      why:
        why.length > 0 ? why : [`nothing open against it · ${contactPhrase}`],
    };
  } else if (risks.length > 0) {
    signal = { key: "risk", label: "At risk", why: [...risks, ...watch] };
  } else if (watch.length > 0) {
    signal = { key: "watch", label: "Watch", why: watch };
  } else if (
    deals.length === 0 &&
    projectCount === 0 &&
    renewal === undefined
  ) {
    signal = {
      key: "none",
      label: "No signal",
      why: ["no deal, no project and no contract watched"],
    };
  } else {
    signal = {
      key: "good",
      label: "On track",
      why: [
        `${deals.length === 1 ? "1 deal" : `${deals.length} deals`} open · ${contactPhrase}`,
      ],
    };
  }

  return {
    organization,
    deals,
    dealTotals,
    projectCount,
    people,
    renewal,
    lead,
    idleDays,
    signal,
  };
};
