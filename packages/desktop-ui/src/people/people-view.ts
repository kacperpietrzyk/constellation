// What the People screen knows about each person, and how the screen is
// grouped. No JSX here: the reading is asserted on its own, and a layout that
// recomputes any part of it would be the second definition this repository
// keeps paying for.
//
// WHO IS ON THIS SCREEN, and why the answer is a KIND rather than a field.
// A person in the graph is somebody dealt with at a client. They never sign
// in, they hold no permission and they are not a principal — the workspace's
// own members and its agents live in `workspace.bootstrapContext` and in
// `agent.access`, in a different vocabulary entirely. The screen therefore
// draws exactly one arm of `relationship.workspace` and merges nothing into
// it. Filtering by "has an organization" instead would silently drop a person
// with no company, and that is a record like any other (`v3/screens/crm.js:391-396`).
//
// WHAT THE ROW SHOWS is participation, never an account: deals the person is
// on, meetings they attended, when they were last met. That is decision #3 of
// the accepted screen, and it is carried BY THE LAYOUT — the paragraph that
// used to explain it was removed on the third pass and does not come back.
//
// TWO THINGS THE PROTOTYPE'S ROW CARRIES THAT THIS PRODUCT CANNOT ANSWER YET,
// stated here so the absence is a known gap rather than a quiet zero:
//
//  - NOTES NAMING A PERSON. The reference exists only in `document.backlinks`,
//    one query per target (`contracts/src/query.ts:1595-1612`); `document.list`
//    carries none. A collection cannot issue one fetch per row, so the notes
//    chip is not drawn at all rather than drawn as a zero.
//  - THE NEXT MEETING. Every meeting record here is an IMPORTED one and has
//    already happened; nothing in this projection describes a calendar. So the
//    row says when somebody was last met and stops.

import type { WorkOverviewProjection } from "../client/workflow.js";

import {
  isOpenDeal,
  type MeetingRecord,
  type OpportunityRecord,
  type OrganizationRecord,
  type PersonRecord,
  type RelationshipIndex,
} from "../crm/organization-reading.js";
import { countLabel, formatDate } from "../i18n.js";

export type WorkTask = WorkOverviewProjection["tasks"][number];

/**
 * A task standing on this person. `waitingOn` is a STRUCTURED field here —
 * `{kind, label, recordId}` (`contracts/src/query.ts:816-825`) — so the match
 * is the reference, not the surname. The accepted prototype matched free text
 * because its fixture had nothing else, and its own comment calls that the
 * limit rather than the design (`crm.js:398-405`). Matching by name where a
 * reference exists would re-introduce exactly the silent control this screen
 * removes.
 */
export interface WaitingOnPerson {
  readonly taskId: string;
  readonly title: string;
  /** When it was promised, when somebody promised. */
  readonly expectedAt: string | undefined;
}

export interface PersonReading {
  readonly person: PersonRecord;
  readonly organization: OrganizationRecord | undefined;
  /** Deals this person is on: theirs to run, or named on. */
  readonly deals: readonly OpportunityRecord[];
  readonly meetings: readonly MeetingRecord[];
  /** The most recent meeting that happened, as an ISO instant. */
  readonly lastMetAt: string | undefined;
  /**
   * What is being waited on from this person, with the task as the evidence.
   * EMPTY when the work plane could not be read — the screen then says nothing
   * about waiting rather than drawing a chip with no task behind it.
   */
  readonly waiting: readonly WaitingOnPerson[];
  readonly accessibleName: string;
}

const waitingTasksFor = (
  person: PersonRecord,
  tasks: readonly WorkTask[] | undefined,
): readonly WaitingOnPerson[] =>
  (tasks ?? [])
    .filter(
      (task) =>
        task.completionState === "open" &&
        task.waitingOn?.kind === "person" &&
        task.waitingOn.recordId === person.id &&
        // A wait pointed at us is not a wait ON this person. The field is
        // optional and its absence is silence, not a denial — same rule the
        // project reading applies (`projects/project-view.ts:127-132`).
        task.waitingOn.direction !== "we_owe",
    )
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      expectedAt: task.waitingOn?.expectedAt,
    }));

/**
 * The row's accessible name, composed. It carries the facts the row draws as
 * shape, position or a bare number — a chip reading "2 deals" beside a name
 * says very little read aloud, and "last met" is a date in a cell whose label
 * is three characters. Deliberately a runtime composition rather than a static
 * sentence: the shape guard only reads literals, and flattening this into one
 * would (correctly) trip it.
 */
const personAccessibleName = (
  reading: Omit<PersonReading, "accessibleName">,
  timeZone: string,
): string => {
  const parts: string[] = [reading.person.name];
  if (reading.person.role !== undefined) parts.push(reading.person.role);
  parts.push(reading.organization?.name ?? "no organization recorded");
  if (reading.deals.length > 0)
    parts.push(`${countLabel(reading.deals.length, "open deal")} on them`);
  if (reading.meetings.length > 0)
    parts.push(countLabel(reading.meetings.length, "meeting"));
  for (const wait of reading.waiting)
    parts.push(`you are waiting on them for: ${wait.title}`);
  parts.push(
    reading.lastMetAt === undefined
      ? "never met"
      : `last met ${formatDate(reading.lastMetAt, timeZone)}`,
  );
  if (reading.person.email !== undefined) parts.push(reading.person.email);
  if (reading.person.phone !== undefined) parts.push(reading.person.phone);
  return parts.join(", ");
};

export const readPerson = (
  person: PersonRecord,
  index: RelationshipIndex,
  tasks: readonly WorkTask[] | undefined,
  timeZone: string,
): PersonReading => {
  const organization =
    person.organizationId === undefined
      ? undefined
      : index.organizations.find(
          (candidate) => candidate.id === person.organizationId,
        );
  const deals = [...index.opportunitiesById.values()].filter(
    (deal) =>
      isOpenDeal(deal) &&
      (deal.ownerPersonId === person.id || deal.personIds.includes(person.id)),
  );
  const meetings = index.meetingsByPerson.get(person.id) ?? [];
  const lastMetAt = meetings
    .map((meeting) => meeting.meeting.startedAt)
    .sort((left, right) => right.localeCompare(left))[0];
  const reading = {
    person,
    organization,
    deals,
    meetings,
    lastMetAt,
    waiting: waitingTasksFor(person, tasks),
  };
  return {
    ...reading,
    accessibleName: personAccessibleName(reading, timeZone),
  };
};

/** One organization's people, or the people who belong to none. `organization`
 *  is `undefined` for exactly one group and it always comes last: somebody
 *  without a company is still on this screen. */
export interface PeopleGroup {
  readonly key: string;
  readonly organization: OrganizationRecord | undefined;
  readonly readings: readonly PersonReading[];
}

export const NO_ORGANIZATION_GROUP = "No organization recorded";

/**
 * Every person in the Space, grouped. The order of the groups follows the
 * organizations as the projection carries them, so two renders of the same
 * data draw the same list — and the row indices run unbroken across group
 * boundaries, because the roving tab stop is one `useListNavigation` over the
 * whole screen.
 */
export const readPeople = (
  index: RelationshipIndex,
  tasks: readonly WorkTask[] | undefined,
  timeZone: string,
): readonly PeopleGroup[] => {
  const groups: PeopleGroup[] = [];
  for (const organization of index.organizations) {
    const people = index.peopleByOrganization.get(organization.id) ?? [];
    if (people.length === 0) continue;
    groups.push({
      key: organization.id,
      organization,
      readings: people.map((person) =>
        readPerson(person, index, tasks, timeZone),
      ),
    });
  }
  if (index.loosePeople.length > 0)
    groups.push({
      key: "no-organization",
      organization: undefined,
      readings: index.loosePeople.map((person) =>
        readPerson(person, index, tasks, timeZone),
      ),
    });
  return groups;
};

/** How many people are on the screen and how many companies they sit at. The
 *  loose group is not a company, so it is not counted as one. */
export const peopleTally = (
  groups: readonly PeopleGroup[],
): { readonly people: number; readonly organizations: number } => ({
  people: groups.reduce((total, group) => total + group.readings.length, 0),
  organizations: groups.filter((group) => group.organization !== undefined)
    .length,
});

/** The rows in the order they are drawn — the order Enter and the arrows use. */
export const orderedReadings = (
  groups: readonly PeopleGroup[],
): readonly PersonReading[] => groups.flatMap((group) => group.readings);
