// What the Renewals screen knows, computed once and rendered by nothing here.
//
// THE SCREEN ORGANISES BY TIME TO START AND LEADS EACH ROW WITH THE EXPIRY
// DATE. The first pass of the walkthrough decided the opposite — "show time to
// start, not «expires 30 September»" — and the third pass reversed it with
// Kacper's acceptance: the row leads with `ends Sep 30 · in 65 days`, and
// "time to start" is carried by the SECTION and the lead chip. The decision was
// about what the screen organises, not about which number is fattest. Both
// halves live in this file: `sections` is the organisation, `contractClock` is
// what every row prints.
//
// THREE RULES THIS FILE EXISTS TO KEEP STRUCTURAL RATHER THAN REMEMBERED:
//
//  1. THE SPLIT IS ON `closed`, NEVER ON TWO NAMED STATES. `closed` is
//     `state !== "watching"` — one negation, so a fourth closed state added
//     later is closed by construction. Splitting on the two obvious names
//     (`renewed`, `not_renewing`) leaves `irrelevant` in "Watching", where it
//     reads as work somebody still has to do.
//  2. THE ELAPSED TERM IS CLIPPED TO THE TERM. A contract renewed after its
//     expiry has more elapsed time than term, and an unclipped numerator prints
//     "1 yr 1 mo of 1 yr" — which reads as a broken sum, not as a late renewal.
//  3. AN EMPTY "TIME TO START" IS A COMPUTED ANSWER. `nextLead` is derived from
//     the watching set, so the empty section can say how many contracts are
//     under watch and when the nearest window opens. It is never produced by a
//     failed read — the surface renders the slice's own message instead, and
//     the section headings never appear with a zero beside them.
//
// WHAT THIS FILE CANNOT SAY, and says nothing rather than something plausible:
// A RENEWAL CARRIES NO MONEY. The projection's renewal arm is `.strict()` and
// has no value field at all (`contracts/src/query.ts:589-605`), so
// `renewalOutlook` is called with no `value` and no linked deal and can only
// answer `none` today. The uplift projection and the linked-deal reading are
// both built and both unreachable until a value lands on the record; see the
// note on `outlookFor`.

import type { RelationshipWorkspaceProjection } from "../client/workflow.js";
import type { DesktopSnapshot } from "../client/workflow.js";

import {
  renewalLead,
  type CrmProse,
  type OpportunityRecord,
  type OrganizationRecord,
  type PersonRecord,
  type RelationshipIndex,
  type RenewalRecord,
} from "../crm/organization-reading.js";
import { renewalOutlook, type RenewalOutlookReading } from "../crm/money.js";
import { formatDate } from "../i18n.js";
import { daysUntil } from "../today-plan.js";

type StrategicRecord = RelationshipWorkspaceProjection["records"][number];
type TaskRecord = DesktopSnapshot["tasks"][number];

/** The link type an amendment rides. One edge, named once. */
const AMENDS = "opportunity_amends_renewal";

/**
 * Where a contract stands, in the two units the screen prints: days to the
 * expiry and months into the term.
 *
 * `startAction`, `daysLeft` and `closed` come from `renewalLead` in
 * `crm/organization-reading.ts` rather than being recomputed — the group head
 * on People prints the same three numbers, and the same arithmetic written
 * twice is this repository's named `restated-shape-drift` defect class. What is
 * added here is the part that belongs to this screen alone: how far into its
 * term the contract is.
 */
export interface ContractClock {
  /** Days to the expiry; negative once it has passed. */
  readonly daysLeft: number;
  /** Days until the lead window opens; negative once it has. */
  readonly startAction: number;
  readonly closed: boolean;
  /** Days since the term began; absent when nobody recorded a start. */
  readonly elapsedDays: number | undefined;
  /** Elapsed plus remaining, from the dates. Absent for the same reason. */
  readonly totalDays: number | undefined;
  /** 0..1, or absent when the dates cannot answer it. */
  readonly progress: number | undefined;
  /** The lead window has opened: this contract wants something from you. */
  readonly dueToStart: boolean;
  /** Still before the lead window: the conversation here is about adding to
   *  the contract, not about renewing it. */
  readonly canAmend: boolean;
}

export const contractClock = (
  renewal: RenewalRecord,
  prose: CrmProse,
): ContractClock => {
  const lead = renewalLead(renewal, prose);
  const elapsedDays =
    renewal.termStartsAt === undefined
      ? undefined
      : -daysUntil(renewal.termStartsAt, prose.todayKey, prose.timeZone);
  const totalDays =
    elapsedDays === undefined ? undefined : elapsedDays + lead.daysLeft;
  const progress =
    totalDays === undefined || totalDays <= 0 || elapsedDays === undefined
      ? undefined
      : Math.min(1, Math.max(0, elapsedDays / totalDays));
  // Both flags are gated on `closed`, which the prototype leaves to the caller
  // (`v3/screens/renewals.js:191-193` filters the closed ones out first). Gating
  // them here makes the section split impossible to get wrong from the outside:
  // a closed contract can never be `dueToStart`, so it can never appear in the
  // section that means "somebody has to act". It also stops a contract marked
  // "not renewing" from offering an amendment, which would be a sale on a
  // conversation that is over.
  return {
    daysLeft: lead.daysLeft,
    startAction: lead.startAction,
    closed: lead.closed,
    elapsedDays,
    totalDays,
    progress,
    dueToStart: !lead.closed && lead.startAction <= 0,
    canAmend: !lead.closed && lead.startAction > 0,
  };
};

/** Months, not days: "664 days of 730" does not answer "am I 1.5 years into
 *  three", and "1 yr 10 mo of 2 yrs" does. */
export const monthsFromDays = (days: number): number =>
  Math.max(0, Math.round((days * 12) / 365.25));

export const spanLabel = (months: number): string => {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [
    years === 0 ? "" : `${years} ${years === 1 ? "yr" : "yrs"}`,
    rest === 0 ? "" : `${rest} mo`,
  ].filter((part) => part !== "");
  return parts.length === 0 ? "0 mo" : parts.join(" ");
};

export interface TermReading {
  /** "1 yr 10 mo of 2 yrs". The numerator is CLIPPED to the denominator. */
  readonly label: string;
  readonly percent: number;
  /** The "term 3" the row prints, when the cycle was recorded. */
  readonly cycleOrdinal: number | undefined;
}

/**
 * The contract clock in small print. The denominator is `termMonths` —
 * CONTRACT DATA — and falls back to the span the two dates imply only when
 * nobody recorded a term. The numerator is then clipped to it, which is the
 * whole reason both numbers exist: a contract renewed two months after it
 * expired has 14 months elapsed against a 12-month term, and "1 yr 2 mo of
 * 1 yr" reads as arithmetic nobody checked.
 */
export const termReading = (
  renewal: RenewalRecord,
  clock: ContractClock,
): TermReading | undefined => {
  if (clock.progress === undefined || clock.elapsedDays === undefined)
    return undefined;
  const months =
    renewal.termMonths ??
    (clock.totalDays === undefined
      ? undefined
      : monthsFromDays(clock.totalDays));
  if (months === undefined) return undefined;
  const done = Math.min(monthsFromDays(clock.elapsedDays), months);
  return {
    label: `${spanLabel(done)} of ${spanLabel(months)}`,
    percent: Math.round(clock.progress * 100),
    cycleOrdinal: renewal.cycleOrdinal,
  };
};

/**
 * Who is on the follow-up, in three states rather than two.
 *
 *  - `none` — nobody has started this. A first-class state four of five real
 *    contracts sit in, and unreachable at all until `followUpTaskId` became
 *    optional. It carries the `Start` control.
 *  - `task` — the follow-up, with its status: "started but blocked for six
 *    days" is not the same claim as "started".
 *  - `detached` — the renewal names a task that is not on the loaded page.
 *    `task.list` is capped at 100 rows, so this is reachable on a real
 *    workspace, and it is NOT the same as `none`: saying "nobody has started
 *    this" about a task that exists is the lie this arm prevents. It is also
 *    exactly the state in which `resolveRenewal` refuses with a sentence,
 *    because the kernel completes the task in the same transaction and cannot
 *    be handed a version nothing read.
 */
export type FollowUpReading =
  | { readonly kind: "none" }
  | { readonly kind: "detached" }
  | {
      readonly kind: "task";
      readonly task: TaskRecord;
      /** Days past the due date, when there is one and it has passed. */
      readonly lateDays: number | undefined;
    };

export interface AmendmentReading {
  readonly opportunity: OpportunityRecord;
  /** When the amendment was opened. The link has no date of its own that the
   *  projection carries, so this is the deal's own creation. */
  readonly at: string;
}

export interface RenewalReading {
  readonly renewal: RenewalRecord;
  readonly organization: OrganizationRecord | undefined;
  /** The contact AT the client, when the organisation records one. */
  readonly mainContact: PersonRecord | undefined;
  readonly clock: ContractClock;
  readonly outlook: RenewalOutlookReading;
  readonly followUp: FollowUpReading;
  readonly amendments: readonly AmendmentReading[];
  readonly term: TermReading | undefined;
  /** What the row says as one sentence, for a reader who cannot see the layout. */
  readonly accessibleName: string;
}

export const CLOSED_STATE_LABELS: Readonly<
  Record<Exclude<RenewalRecord["state"], "watching">, string>
> = {
  renewed: "renewed",
  not_renewing: "not renewing",
  irrelevant: "no longer relevant",
};

/**
 * What the renewal is likely to be worth. Routed through `money.ts` so the
 * rounding, the `≈` and the "a real deal beats a projection" rule are decided
 * in one place for four screens.
 *
 * IT CAN ONLY ANSWER `none` TODAY, and that is a gap rather than a design. The
 * renewal arm of the projection carries no amount, so there is nothing to apply
 * the uplift to; and the one renewal↔opportunity edge that exists means
 * AMENDMENT — a mid-contract sale that explicitly does not move the term — so
 * feeding it in here would print an add-on's value as the contract's renewal
 * value. That is the plausible-wrong-number this wave exists to stop, so it is
 * not done. Both branches are built and reported as unexercised.
 */
const outlookFor = (upliftPct: number): RenewalOutlookReading =>
  // The input is empty because nothing on the record can fill it. Written as a
  // call rather than as a constant so that the day an amount lands on the
  // renewal this is one added key here and no new decision anywhere about
  // rounding, about the `≈`, or about which number wins.
  renewalOutlook({}, { upliftPct });

const followUpFor = (
  renewal: RenewalRecord,
  tasks: readonly TaskRecord[],
  prose: CrmProse,
): FollowUpReading => {
  if (renewal.followUpTaskId === undefined) return { kind: "none" };
  const task = tasks.find(
    (candidate) => candidate.id === renewal.followUpTaskId,
  );
  if (task === undefined) return { kind: "detached" };
  const due =
    task.dueAt === undefined
      ? undefined
      : daysUntil(task.dueAt, prose.todayKey, prose.timeZone);
  return {
    kind: "task",
    task,
    lateDays: due !== undefined && due < 0 ? -due : undefined,
  };
};

/**
 * Amendments, from the one edge that carries them. The link's `state` is what
 * says whether it still holds: `work.linkRemove` flips it and leaves
 * `recordState` alone, so a detached link stays in the projection forever and
 * reading past it would count an amendment somebody removed.
 */
export const amendmentsByRenewal = (
  records: readonly StrategicRecord[],
  index: RelationshipIndex,
): ReadonlyMap<string, AmendmentReading[]> => {
  const byRenewal = new Map<string, AmendmentReading[]>();
  for (const record of records) {
    if (record.recordState !== "active") continue;
    if (record.kind !== "work_link") continue;
    if (record.state !== "active" || record.linkType !== AMENDS) continue;
    const opportunity = index.opportunitiesById.get(record.sourceRecordId);
    if (opportunity === undefined) continue;
    const reading: AmendmentReading = {
      opportunity,
      at: opportunity.createdAt,
    };
    const bucket = byRenewal.get(record.targetRecordId);
    if (bucket === undefined) byRenewal.set(record.targetRecordId, [reading]);
    else bucket.push(reading);
  }
  return byRenewal;
};

const accessibleNameFor = (
  renewal: RenewalRecord,
  organization: OrganizationRecord | undefined,
  clock: ContractClock,
  followUp: FollowUpReading,
  prose: CrmProse,
): string => {
  const parts = [
    organization?.name ?? "Unknown client",
    renewal.title,
    renewal.scope,
    `${clock.closed ? "ended" : "ends"} ${formatDate(renewal.expiresAt, prose.timeZone)}, ${relativeDays(clock.daysLeft)}`,
  ];
  const lead = leadPhrase(renewal, clock);
  if (lead !== undefined) parts.push(lead.text);
  parts.push(
    clock.closed
      ? (CLOSED_STATE_LABELS[
          renewal.state as Exclude<RenewalRecord["state"], "watching">
        ] ?? renewal.state)
      : followUp.kind === "task"
        ? "follow-up started"
        : followUp.kind === "detached"
          ? "follow-up not loaded"
          : "nobody has started this",
  );
  return parts.join(", ");
};

/** "in 65 days" / "today" / "31 days ago". */
export const relativeDays = (days: number): string =>
  days < 0 ? `${-days} days ago` : days === 0 ? "today" : `in ${days} days`;

export interface LeadPhrase {
  readonly text: string;
  /** True once the window has opened. It carries its own words and its own
   *  mark, so the reading survives a screen with no colour. */
  readonly open: boolean;
}

export const leadPhrase = (
  renewal: RenewalRecord,
  clock: ContractClock,
): LeadPhrase | undefined => {
  if (clock.closed) return undefined;
  const days = renewal.leadTimeDays;
  if (clock.startAction > 0)
    return {
      text: `${days}-day lead opens in ${clock.startAction} days`,
      open: false,
    };
  if (clock.startAction === 0)
    return { text: `${days}-day lead opens today`, open: true };
  return {
    text: `${days}-day lead began ${-clock.startAction} days ago`,
    open: true,
  };
};

export interface RenewalSections {
  readonly due: readonly RenewalReading[];
  readonly watching: readonly RenewalReading[];
  readonly closed: readonly RenewalReading[];
  /** Everything not closed, whichever section it stands in. */
  readonly openCount: number;
  /**
   * When the nearest lead window opens, computed from the WATCHING set. This is
   * what makes an empty "Time to start" an answer: both the count and the date
   * come from data, so the section can say what is being watched instead of
   * drawing a picture of nothing.
   */
  readonly nextLead:
    { readonly days: number; readonly onDayKey: string } | undefined;
}

const addDays = (dayKey: string, days: number): string =>
  new Date(Date.parse(`${dayKey}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

/**
 * A day key rendered through the shell's one date function. The key is already
 * a wall-clock date in the workspace's calendar, so it is formatted AS one —
 * handing it a second timezone would shift it by a day at the edges and print
 * a date that is off by one from the number beside it.
 */
export const formatDayKey = (dayKey: string): string =>
  formatDate(`${dayKey}T00:00:00.000Z`, "UTC");

export const readRenewals = (
  records: readonly StrategicRecord[],
  index: RelationshipIndex,
  tasks: readonly TaskRecord[],
  upliftPct: number,
  prose: CrmProse,
): RenewalSections => {
  const amendments = amendmentsByRenewal(records, index);
  const organizations = new Map(
    index.organizations.map((organization) => [organization.id, organization]),
  );
  const people = new Map<string, PersonRecord>();
  for (const bucket of index.peopleByOrganization.values())
    for (const person of bucket) people.set(person.id, person);
  for (const person of index.loosePeople) people.set(person.id, person);

  const readings: RenewalReading[] = [];
  for (const bucket of index.renewalsByOrganization.values()) {
    for (const renewal of bucket) {
      const organization = organizations.get(renewal.organizationId);
      const clock = contractClock(renewal, prose);
      const followUp = followUpFor(renewal, tasks, prose);
      readings.push({
        renewal,
        organization,
        mainContact:
          organization?.mainContactPersonId === undefined
            ? undefined
            : people.get(organization.mainContactPersonId),
        clock,
        outlook: outlookFor(upliftPct),
        followUp,
        amendments: amendments.get(renewal.id) ?? [],
        term: termReading(renewal, clock),
        accessibleName: accessibleNameFor(
          renewal,
          organization,
          clock,
          followUp,
          prose,
        ),
      });
    }
  }
  // The expiry orders every section, because inside a section the nearest date
  // is the one that matters. Between sections the ordering is the work, which
  // is what the three headings are.
  readings.sort((left, right) =>
    left.renewal.expiresAt.localeCompare(right.renewal.expiresAt),
  );

  const closed = readings.filter((reading) => reading.clock.closed);
  const open = readings.filter((reading) => !reading.clock.closed);
  const due = open.filter((reading) => reading.clock.dueToStart);
  const watching = open.filter((reading) => !reading.clock.dueToStart);

  const nearest = watching
    .map((reading) => reading.clock.startAction)
    .sort((left, right) => left - right)[0];

  return {
    due,
    watching,
    closed,
    openCount: open.length,
    nextLead:
      nearest === undefined
        ? undefined
        : { days: nearest, onDayKey: addDays(prose.todayKey, nearest) },
  };
};
