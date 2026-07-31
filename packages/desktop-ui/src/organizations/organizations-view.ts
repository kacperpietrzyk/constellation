// What the Organizations screen shows, decided without rendering anything.
//
// The READING itself is not here — it is `crm/organization-reading.ts`, landed
// by the People lot, and this file imports it rather than restating it. One
// reading, two screens, which is the whole point of putting it beside
// `money.ts` (`restated-shape-drift` is this repository's named defect class).
// What IS here is everything the collection adds on top of a reading: the
// relationship filter, the chip counts, the delivery roll-up per client, and
// the composed accessible name of a row.
//
// THE FILTER REALLY FILTERS, AND IT HAS TWO WAYS OUT. An empty selection means
// no filter at all; a held selection can be dropped by unclicking the last
// chip or by one `Show all`. A control a reader cannot get out of is worse
// than no control (`v3/screens/crm.js:204-212`) — the second-pass defect this
// screen was rebuilt to remove was a chip bar that promised a filter and
// removed no row.
//
// AND THE CHIP COUNTS COME FROM THE FULL SET. They answer "how many are like
// this", not "how many do you see now": counts recomputed over the filtered
// rows collapse to the selection itself and stop being an answer.

import type {
  DeliveryReading,
  OrganizationReading,
  RelationshipIndex,
  CrmProse,
} from "../crm/organization-reading.js";
import {
  fmtTotals,
  readOrganization,
  renewalPhrase,
} from "../crm/organization-reading.js";
import type { ProjectReading } from "../projects/project-view.js";
import { countLabel } from "../i18n.js";

/** The relationship state a person DECLARED. Three, in the order the accepted
 *  screen lists them, and the ids are the projection's own. */
export const RELATIONSHIP_STATES = [
  ["active", "Active"],
  ["prospect", "Prospect"],
  ["inactive", "Inactive"],
] as const;

export type RelationshipStateKey = (typeof RELATIONSHIP_STATES)[number][0];

export const relationshipStateLabel = (key: string): string =>
  RELATIONSHIP_STATES.find(([id]) => id === key)?.[1] ?? key;

/**
 * What the client's delivery looks like from the collection: how many projects
 * are linked, and how many of their tasks are still open.
 *
 * `atRisk` is `undefined` — never `0` — when the work plane could not be read.
 * The distinction is the whole reason `DeliveryReading` exists: a client whose
 * projects failed to load must not come out of the reading saying "On track".
 * The COUNT survives a failed work plane because the
 * `project_serves_organization` link rides `relationship.workspace` with
 * everything else; only the health of those projects is lost.
 */
export interface DeliveryRollup {
  readonly projectCount: number;
  readonly openTasks: number | undefined;
  readonly atRisk: number | undefined;
}

/**
 * One roll-up per organization, built once for the whole screen rather than
 * per row. `readings` is `undefined` exactly when `readProjects` answered
 * `undefined`, which it does when either the Projects or the work slice is
 * unavailable.
 */
export const rollUpDelivery = (
  index: RelationshipIndex,
  readings: readonly ProjectReading[] | undefined,
): ((organizationId: string) => DeliveryRollup) => {
  const byProject = new Map(
    (readings ?? []).map((reading) => [reading.project.id as string, reading]),
  );
  return (organizationId) => {
    const projectIds = index.projectsByOrganization.get(organizationId) ?? [];
    if (readings === undefined)
      return {
        projectCount: projectIds.length,
        openTasks: undefined,
        atRisk: undefined,
      };
    let openTasks = 0;
    let atRisk = 0;
    for (const projectId of projectIds) {
      const reading = byProject.get(projectId);
      if (reading === undefined) continue;
      openTasks += reading.open.length;
      if (reading.health.key === "risk") atRisk += 1;
    }
    return { projectCount: projectIds.length, openTasks, atRisk };
  };
};

export interface OrganizationRow {
  readonly reading: OrganizationReading;
  readonly delivery: DeliveryRollup;
  /** The person named as the contact AT the client — never an owner on our
   *  side, which this model has no edge for (`build-brief §2.20`). */
  readonly contactName: string | undefined;
  /** The whole row as one sentence, for somebody who cannot see the layout. */
  readonly accessibleName: string;
}

/** At risk first, then watch, then everything else — the order the reading is
 *  read in. Within a band, by name, in Polish collation: these are record
 *  contents, not interface chrome. */
const SIGNAL_ORDER = ["risk", "watch", "none", "good"] as const;

export const readOrganizations = (
  index: RelationshipIndex,
  delivery: (organizationId: string) => DeliveryRollup,
  prose: CrmProse,
): readonly OrganizationRow[] =>
  index.organizations
    .map((organization) => {
      const rollup = delivery(organization.id);
      // The reading is handed `undefined` — not a zero — when delivery could
      // not be read, so a broken work plane cannot come back as "On track".
      const health: DeliveryReading | undefined =
        rollup.atRisk === undefined
          ? undefined
          : { projectsAtRisk: rollup.atRisk };
      const reading = readOrganization(organization, index, health, prose);
      const contact =
        organization.mainContactPersonId === undefined
          ? undefined
          : reading.people.find(
              (person) => person.id === organization.mainContactPersonId,
            );
      return {
        reading,
        delivery: rollup,
        contactName: contact?.name,
        accessibleName: accessibleRowName(reading, rollup, contact?.name),
      };
    })
    .sort(
      (left, right) =>
        SIGNAL_ORDER.indexOf(left.reading.signal.key) -
          SIGNAL_ORDER.indexOf(right.reading.signal.key) ||
        left.reading.organization.name.localeCompare(
          right.reading.organization.name,
          "pl",
        ),
    );

/**
 * Everything the row draws, in words. The visual row separates the reading
 * from its reason, the deal count from its money and the renewal phrase from
 * the contract it is about; a reader who cannot see the layout gets one
 * sentence carrying all of it, because a badge read out on its own says
 * nothing once half the list is reporting something.
 *
 * Composed at runtime on purpose, and the prose guard cannot see it — which is
 * correct: flattening this into a static string would trip that guard, because
 * a 200-character English sentence written as a literal IS the thing it
 * forbids (`recon-screens §1.1`).
 */
const accessibleRowName = (
  reading: OrganizationReading,
  delivery: DeliveryRollup,
  contactName: string | undefined,
): string => {
  const organization = reading.organization;
  const phrase =
    reading.lead === undefined ? undefined : renewalPhrase(reading.lead);
  return [
    organization.name,
    relationshipStateLabel(organization.relationshipState),
    ...(organization.segment === undefined ? [] : [organization.segment]),
    reading.signal.label,
    reading.signal.why.join(", "),
    reading.deals.length === 0
      ? "no open deal"
      : `${countLabel(reading.deals.length, "open deal")} worth ${fmtTotals(reading.dealTotals)}`,
    delivery.projectCount === 0
      ? "no project"
      : delivery.openTasks === undefined
        ? `${countLabel(delivery.projectCount, "project")}, open tasks could not be read`
        : `${countLabel(delivery.projectCount, "project")}, ${countLabel(delivery.openTasks, "open task")}`,
    phrase === undefined || reading.renewal === undefined
      ? "no contract watched"
      : `renewal ${reading.renewal.title}, ${phrase.text}`,
    `next step: ${organization.nextAction ?? "none recorded"}`,
    contactName === undefined
      ? "no main contact recorded"
      : `main contact ${contactName}`,
  ].join(", ");
};

/** An empty selection is NO filter. Anything else keeps only the states held. */
export const filterOrganizations = (
  rows: readonly OrganizationRow[],
  held: readonly string[],
): readonly OrganizationRow[] =>
  held.length === 0
    ? rows
    : rows.filter((row) =>
        held.includes(row.reading.organization.relationshipState),
      );

/** How many organizations are in each state, over the FULL set. */
export const stateCounts = (
  rows: readonly OrganizationRow[],
): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const [id] of RELATIONSHIP_STATES) counts.set(id, 0);
  for (const row of rows) {
    const key = row.reading.organization.relationshipState;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

/** "3 of 8 organizations" while a filter holds something, "8 organizations"
 *  when it does not — the count is an answer to a question the reader asked. */
export const countSentence = (shown: number, total: number): string =>
  shown === total
    ? countLabel(total, "organization")
    : `${shown} of ${countLabel(total, "organization")}`;

/** What the filter is holding, named, so the empty state says which states
 *  produced it rather than "nothing here". Never lowercased: the labels are
 *  proper interface words and the prototype's `.toLowerCase()` on them is the
 *  same per-author casing decision the date rule forbids. */
export const heldStatesSentence = (held: readonly string[]): string => {
  const labels = RELATIONSHIP_STATES.filter(([id]) => held.includes(id)).map(
    ([, label]) => label,
  );
  if (labels.length === 0) return "";
  if (labels.length === 1) return `${labels[0]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
};
