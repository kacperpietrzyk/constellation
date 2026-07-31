import { useMemo, useState } from "react";

import type { StrategicRecordId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  fmtTotals,
  indexRelationships,
  readOrganization,
  renewalPhrase,
  type DeliveryReading,
  type OrganizationReading,
  type SignalKey,
} from "../crm/organization-reading.js";
import {
  createPerson,
  readSlice,
  type DesktopSnapshot,
  type MutationFailure,
} from "../client/workflow.js";
import { Icon } from "../components/Icon.js";
import {
  useListNavigation,
  type ListNavigationItemProps,
} from "../hooks/useListNavigation.js";
import { countLabel, dateKeyInZone, formatDate } from "../i18n.js";
import { readProjects } from "../projects/project-view.js";
import {
  NO_ORGANIZATION_GROUP,
  orderedReadings,
  peopleTally,
  readPeople,
  type PeopleGroup,
  type PersonReading,
} from "./people-view.js";
import styles from "./people.module.css";

// The first of the five CRM screens, and the one with the lightest backend
// behind it: it counts participation and reads dates. Everything it draws
// comes out of `relationship.workspace`, the one slice all five CRM kinds ride.
//
// THE GROUP HEAD CARRIES ORGANIZATION FACTS, NOT PERSON FACTS. A person has no
// edge to a project in this model — a project carries a lead, who is a
// workspace member, and a client, who is an organization. Rather than
// attributing somebody else's delivery to a human, the head states each fact
// where it actually sits, which is also what turns grouping into an action
// instead of row-clustering (`v3/screens/crm.js:463-467`).
//
// The reason under the reading is VISIBLE text. In the prototype it survived
// only as a `title` (`crm.js:481`), and a native tooltip does not exist for a
// keyboard or for touch.

const LAYOUTS = [
  ["organizations", "By organization"],
  ["table", "Table"],
] as const;
type Layout = (typeof LAYOUTS)[number][0];

// The relationship state is a DECLARATION somebody made, so it is drawn as a
// pill rather than as the computed reading beside it — two different kinds of
// claim must not look alike.
const RELATIONSHIP_STATE_LABELS: Readonly<
  Record<OrganizationReading["organization"]["relationshipState"], string>
> = {
  active: "Active",
  prospect: "Prospect",
  inactive: "Inactive",
};

const SIGNAL_MARKS: Readonly<Record<SignalKey, string>> = {
  risk: "▲",
  watch: "◧",
  good: "■",
  none: "□",
};

const RelationshipSignalChip = ({
  reading,
}: {
  readonly reading: OrganizationReading;
}) => (
  <span
    className={`${styles.signal} ${styles[`signal_${reading.signal.key}`]}`}
    data-relationship-signal={reading.signal.key}
  >
    <span aria-hidden="true" className={styles.signalMark}>
      {SIGNAL_MARKS[reading.signal.key]}
    </span>
    {reading.signal.label}
  </span>
);

const Initials = ({ name }: { readonly name: string }) => (
  <span aria-hidden="true" className={styles.avatar}>
    {name
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.slice(0, 1).toUpperCase())
      .join("")}
  </span>
);

const PersonRow = ({
  reading,
  index,
  itemProps,
  selected,
  timeZone,
  onSelect,
  onOpen,
}: {
  readonly reading: PersonReading;
  readonly index: number;
  readonly itemProps: (index: number) => ListNavigationItemProps;
  readonly selected: boolean;
  readonly timeZone: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly onOpen: (reading: PersonReading) => void;
}) => {
  const nav = itemProps(index);
  const wait = reading.waiting[0];
  return (
    <div
      {...nav}
      aria-label={reading.accessibleName}
      aria-selected={selected}
      className={`${styles.row} ${selected ? styles.rowSelected : ""}`}
      data-person-row={reading.person.id}
      onClick={() => onSelect(reading.person.id)}
      onDoubleClick={() => onOpen(reading)}
      role="option"
    >
      <Initials name={reading.person.name} />
      <span className={styles.main}>
        <span className={styles.nameLine}>
          <span className={styles.name}>{reading.person.name}</span>
          {reading.person.role !== undefined && (
            <span className={styles.role}>{reading.person.role}</span>
          )}
        </span>
        {/* The one claim this row makes about somebody else's behaviour, so it
            carries its own proof: the task. A count with no task behind it is
            the silent control this screen exists to remove. */}
        {wait === undefined ? (
          <span className={styles.why}>
            {reading.organization?.name ?? NO_ORGANIZATION_GROUP}
          </span>
        ) : (
          <span className={styles.waiting} data-person-waiting>
            <span aria-hidden="true" className={styles.waitingMark}>
              ◷
            </span>
            <span className={styles.clip}>
              {wait.expectedAt === undefined
                ? "Waiting on them"
                : `Waiting on them since ${formatDate(wait.expectedAt, timeZone)}`}
              {" · "}
              {wait.title}
            </span>
          </span>
        )}
      </span>
      {/* Participation, and only what exists. A chip reading "0 deals" is
          noise dressed as content. */}
      <span className={styles.parts}>
        {reading.deals.length === 0 && reading.meetings.length === 0 ? (
          <span className={styles.absent}>Nothing recorded yet</span>
        ) : (
          <>
            {reading.deals.length > 0 && (
              <span className={styles.part}>
                {countLabel(reading.deals.length, "deal")}
              </span>
            )}
            {reading.meetings.length > 0 && (
              <span className={styles.part}>
                {countLabel(reading.meetings.length, "meeting")}
              </span>
            )}
          </>
        )}
      </span>
      <span className={styles.contact}>
        <span className={styles.mail}>
          {reading.person.email ?? (
            <span className={styles.absent}>No email recorded</span>
          )}
        </span>
        {reading.person.phone !== undefined && (
          <span className={styles.sub}>{reading.person.phone}</span>
        )}
      </span>
      <span className={styles.met}>
        {reading.lastMetAt === undefined ? (
          <b className={styles.absent}>Never met</b>
        ) : (
          <>
            <b>{formatDate(reading.lastMetAt, timeZone)}</b>
            <span className={styles.sub}>last met</span>
          </>
        )}
      </span>
    </div>
  );
};

const GroupHead = ({
  reading,
  peopleCount,
  onOpenOrganization,
}: {
  readonly reading: OrganizationReading;
  readonly peopleCount: number;
  readonly onOpenOrganization: (id: StrategicRecordId, name: string) => void;
}) => {
  const phrase =
    reading.lead === undefined ? undefined : renewalPhrase(reading.lead);
  return (
    <div
      className={styles.groupHead}
      data-people-group={reading.organization.id}
    >
      <button
        className={styles.groupName}
        onClick={() =>
          onOpenOrganization(reading.organization.id, reading.organization.name)
        }
        type="button"
      >
        {reading.organization.name}
      </button>
      <span className={styles.groupCount}>{peopleCount}</span>
      <span
        className={`${styles.state} ${styles[`state_${reading.organization.relationshipState}`]}`}
      >
        {RELATIONSHIP_STATE_LABELS[reading.organization.relationshipState]}
      </span>
      <span className={styles.groupFacts}>
        {reading.deals.length === 0
          ? "no open deal"
          : `${countLabel(reading.deals.length, "deal")} · ${fmtTotals(reading.dealTotals)}`}
        <span aria-hidden="true" className={styles.groupSep}>
          ·
        </span>
        {reading.projectCount === 0
          ? "no project"
          : countLabel(reading.projectCount, "project")}
        <span aria-hidden="true" className={styles.groupSep}>
          ·
        </span>
        {phrase === undefined
          ? "no contract watched"
          : `renewal talks ${phrase.text}`}
      </span>
      <span className={styles.groupSignal}>
        <RelationshipSignalChip reading={reading} />
        <span className={styles.groupWhy}>
          {reading.signal.why.join(" · ")}
        </span>
      </span>
    </div>
  );
};

/** Table compares fields, so it carries only what every row can fill. The
 *  waiting signal and the phone stay out of it on purpose — they apply to a
 *  minority, and a column of dashes is emptiness rendered as densely as
 *  content. Both live in the default layout, beside the person they concern. */
const PeopleTable = ({
  readings,
  itemProps,
  selectedRecordId,
  timeZone,
  onSelect,
  onOpen,
}: {
  readonly readings: readonly PersonReading[];
  readonly itemProps: (index: number) => ListNavigationItemProps;
  readonly selectedRecordId: string | undefined;
  readonly timeZone: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly onOpen: (reading: PersonReading) => void;
}) => (
  <table className={styles.table}>
    <thead>
      <tr>
        <th scope="col">Name</th>
        <th scope="col">Role</th>
        <th scope="col">Organization</th>
        <th scope="col">Email</th>
        <th scope="col">Deals</th>
        <th scope="col">Meetings</th>
        <th scope="col">Last met</th>
      </tr>
    </thead>
    <tbody>
      {readings.map((reading, index) => {
        const nav = itemProps(index);
        return (
          <tr
            {...nav}
            aria-label={reading.accessibleName}
            aria-selected={reading.person.id === selectedRecordId}
            className={styles.tableRow}
            data-person-row={reading.person.id}
            key={reading.person.id}
            onClick={() => onSelect(reading.person.id)}
            onDoubleClick={() => onOpen(reading)}
          >
            <td className={styles.tableName}>{reading.person.name}</td>
            <td>{reading.person.role ?? "—"}</td>
            <td>{reading.organization?.name ?? NO_ORGANIZATION_GROUP}</td>
            <td className={styles.mail}>{reading.person.email ?? "—"}</td>
            <td>{reading.deals.length}</td>
            <td>{reading.meetings.length}</td>
            <td>
              {reading.lastMetAt === undefined
                ? "Never"
                : formatDate(reading.lastMetAt, timeZone)}
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

export const PeopleSurface = ({
  client,
  snapshot,
  selectedRecordId,
  onSelectRecord,
  onOpenOrganization,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly selectedRecordId: string | undefined;
  readonly onSelectRecord: (id: string) => void;
  readonly onOpenOrganization: (id: StrategicRecordId, name: string) => void;
  readonly onReload: () => Promise<void> | void;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const [layout, setLayout] = useState<Layout>("organizations");
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftOrganizationId, setDraftOrganizationId] = useState("");
  const [draftRole, setDraftRole] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const timeZone = snapshot.bootstrap.workspace.timezone;
  const relationships = readSlice(snapshot.relationships);

  const index = useMemo(
    () =>
      indexRelationships(
        relationships.available ? relationships.data.records : [],
      ),
    [relationships],
  );

  // `readProjects` answers `undefined` when the work plane could not be read.
  // Health is the only thing that depends on it — the project COUNT rides the
  // relationship slice, so a client keeps its delivery count and loses only
  // the reading of it.
  const delivery = useMemo(() => {
    const prose = {
      timeZone,
      todayKey: dateKeyInZone(new Date(), timeZone),
    };
    const readings = readProjects(snapshot, prose);
    if (readings === undefined) return undefined;
    const atRisk = new Set(
      readings
        .filter((reading) => reading.health.key === "risk")
        .map((reading) => reading.project.id as string),
    );
    return (organizationId: string): DeliveryReading => ({
      projectsAtRisk: (
        index.projectsByOrganization.get(organizationId) ?? []
      ).filter((projectId) => atRisk.has(projectId)).length,
    });
  }, [index, snapshot, timeZone]);

  const tasks = useMemo(() => {
    const work = readSlice(snapshot.work);
    return work.available ? work.data.tasks : undefined;
  }, [snapshot.work]);

  const groups = useMemo(
    () => readPeople(index, tasks, timeZone),
    [index, tasks, timeZone],
  );
  const ordered = useMemo(() => orderedReadings(groups), [groups]);
  const tally = peopleTally(groups);

  const openPerson = (reading: PersonReading) => {
    if (reading.organization !== undefined)
      onOpenOrganization(reading.organization.id, reading.organization.name);
  };

  const itemProps = useListNavigation({
    itemCount: ordered.length,
    onOpen: (position) => {
      const reading = ordered[position];
      if (reading !== undefined) openPerson(reading);
    },
    onSelect: (position) => {
      const reading = ordered[position];
      if (reading !== undefined) onSelectRecord(reading.person.id);
    },
  });

  const prose = {
    timeZone,
    todayKey: dateKeyInZone(new Date(), timeZone),
  };

  const submit = () => {
    if (client === undefined || draftName.trim() === "") return;
    setBusy(true);
    void createPerson(client, snapshot, {
      name: draftName.trim(),
      ...(draftOrganizationId === ""
        ? {}
        : { organizationId: draftOrganizationId as StrategicRecordId }),
      ...(draftRole.trim() === "" ? {} : { role: draftRole.trim() }),
      ...(draftEmail.trim() === "" ? {} : { email: draftEmail.trim() }),
    }).then(async (result) => {
      setBusy(false);
      if (result.kind === "success") {
        setCreating(false);
        setDraftName("");
        setDraftOrganizationId("");
        setDraftRole("");
        setDraftEmail("");
        await onReload();
      } else onFailure(result);
    });
  };

  const header = (
    <header className="surface-header">
      <h1 id="surface-title" tabIndex={-1}>
        People
      </h1>
    </header>
  );

  if (!relationships.available)
    return (
      <div className={`surface-scroll ${styles.people}`} data-people-surface>
        {header}
        <section className={styles.emptyState} role="status">
          <div>
            <h2>People are unavailable</h2>
            {/* The slice's own reason, not a sentence written here: a fixed
                line tells a reader nothing they can act on, and the message is
                the only thing that names what failed. */}
            <p data-people-unavailable>{relationships.message}</p>
          </div>
          <button
            className="secondary-button"
            onClick={() => void onReload()}
            type="button"
          >
            Try again
          </button>
        </section>
      </div>
    );

  return (
    <div className={`surface-scroll ${styles.people}`} data-people-surface>
      {header}
      <div className={styles.crumbbar}>
        <button
          aria-expanded={creating}
          className="secondary-button"
          onClick={() => setCreating((open) => !open)}
          type="button"
        >
          <Icon name="capture" />
          New person
        </button>
      </div>
      {creating && (
        <form
          aria-label="New person"
          className={styles.create}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className={styles.field}>
            Name
            <input
              onChange={(event) => setDraftName(event.target.value)}
              required
              value={draftName}
            />
          </label>
          <label className={styles.field}>
            Organization
            <select
              onChange={(event) => setDraftOrganizationId(event.target.value)}
              value={draftOrganizationId}
            >
              <option value="">{NO_ORGANIZATION_GROUP}</option>
              {index.organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Role
            <input
              onChange={(event) => setDraftRole(event.target.value)}
              value={draftRole}
            />
          </label>
          <label className={styles.field}>
            Email
            <input
              onChange={(event) => setDraftEmail(event.target.value)}
              type="email"
              value={draftEmail}
            />
          </label>
          <button
            className="primary-button"
            disabled={busy || draftName.trim() === ""}
            type="submit"
          >
            {busy ? "Adding…" : "Add person"}
          </button>
        </form>
      )}
      <div className={styles.viewbar}>
        <div
          aria-label="People layout"
          className={styles.switcher}
          role="tablist"
        >
          {LAYOUTS.map(([id, label]) => (
            <button
              aria-selected={layout === id}
              className={styles.switch}
              key={id}
              onClick={() => setLayout(id)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <span aria-live="polite" className={styles.count} role="status">
          {`${countLabel(tally.people, "person", "people")} across ${countLabel(tally.organizations, "organization")}`}
        </span>
      </div>
      {ordered.length === 0 ? (
        <section className={styles.emptyState} role="status">
          <div>
            <h2>No people yet</h2>
            <p>
              A person is somebody you deal with at a client — not somebody who
              signs in here.
            </p>
          </div>
        </section>
      ) : layout === "table" ? (
        <PeopleTable
          itemProps={itemProps}
          onOpen={openPerson}
          onSelect={onSelectRecord}
          readings={ordered}
          selectedRecordId={selectedRecordId}
          timeZone={timeZone}
        />
      ) : (
        <div aria-label="People" className={styles.list} role="listbox">
          {groups.map((group: PeopleGroup, position) => {
            const base = groups
              .slice(0, position)
              .reduce((total, earlier) => total + earlier.readings.length, 0);
            return (
              <div className={styles.group} key={group.key}>
                {group.organization === undefined ? (
                  <div className={styles.groupHead} data-people-group="none">
                    <span className={styles.groupName}>
                      {NO_ORGANIZATION_GROUP}
                    </span>
                    <span className={styles.groupCount}>
                      {group.readings.length}
                    </span>
                  </div>
                ) : (
                  <GroupHead
                    onOpenOrganization={onOpenOrganization}
                    peopleCount={group.readings.length}
                    reading={readOrganization(
                      group.organization,
                      index,
                      delivery === undefined
                        ? undefined
                        : delivery(group.organization.id),
                      prose,
                    )}
                  />
                )}
                {group.readings.map((reading, offset) => (
                  <PersonRow
                    index={base + offset}
                    itemProps={itemProps}
                    key={reading.person.id}
                    onOpen={openPerson}
                    onSelect={onSelectRecord}
                    reading={reading}
                    selected={reading.person.id === selectedRecordId}
                    timeZone={timeZone}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
