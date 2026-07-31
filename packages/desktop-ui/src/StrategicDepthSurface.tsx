import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";

import type { ProjectId, StrategicRecordId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import { NarrativeText } from "./components/RecordNarrative.js";
import { StrategicCreatePanel } from "./StrategicCreatePanel.js";

import {
  addComment,
  createOrganization,
  directDeliveryProjects,
  editComment,
  generateRecurrenceOccurrence,
  loadComments,
  linkableDeliveryProjects,
  loadOrganizationOverview,
  readSlice,
  resolveDecisionImpact,
  resolveRadarCandidate,
  setCommentResolved,
  type CommentTarget,
  type DesktopSnapshot,
  type MutationFailure,
  type OrganizationOverviewProjection,
  type RelationshipWorkspaceProjection,
} from "./client/workflow.js";
import {
  fmtTotals,
  indexRelationships,
  renewalPhrase,
  type CrmProse,
  type OrganizationReading,
  type SignalKey,
} from "./crm/organization-reading.js";
import { Icon } from "./components/Icon.js";
import {
  countSentence,
  filterOrganizations,
  heldStatesSentence,
  readOrganizations,
  relationshipStateLabel,
  rollUpDelivery,
  stateCounts,
  RELATIONSHIP_STATES,
  type OrganizationRow,
} from "./organizations/organizations-view.js";
import organizationStyles from "./organizations/organizations.module.css";
import { readProjects } from "./projects/project-view.js";
import {
  useListNavigation,
  type ListNavigationItemProps,
} from "./hooks/useListNavigation.js";
import {
  buildActorResolver,
  buildMentionResolver,
  readCommentPermissions,
} from "./record/record-actors.js";
import { RecordCommentsPanel } from "./record/RecordCommentsPanel.js";
import { RecordTabStrip } from "./record/RecordTabStrip.js";
import { openThreadCount, type RecordTab } from "./record/record-tabs.js";
import {
  countLabel,
  dateKeyInZone,
  formatDate,
  formatDateTime,
  plural,
  recordKindLabels,
} from "./i18n.js";
import {
  recurrenceCadenceLabels,
  strategicStateLabels,
} from "./strategic-labels.js";

type Record = RelationshipWorkspaceProjection["records"][number];
type Radar = Extract<Record, { kind: "radar_candidate" }>;
type Review = Extract<Record, { kind: "impact_review" }>;

// The impact-review audit note is stored data, so it carries the product's
// tool voice instead of an English implementation remark.
const impactReviewNote =
  "Reviewed on the Relationships surface; no automatic changes.";

/** One home for the comment target, built from the LOADED organization rather
 *  than from the id this screen was opened with: the kernel refuses a target
 *  whose id turns out to name a Person or an Opportunity, and the projection is
 *  the only thing here that has already answered which kind the record is. Four
 *  writes read it, and the same shape restated four times is how one of them
 *  ends up naming a different record than the other three. */
const organizationCommentTarget = (
  organization: OrganizationOverviewProjection["organization"],
): CommentTarget => ({
  kind: "organization",
  organizationId: organization.id,
});

const StateMark = ({ state }: { readonly state: string }) => (
  <span className={`strategic-state strategic-state--${state}`}>
    <i aria-hidden="true" />
    {strategicStateLabels[state] ?? state.replaceAll("_", " ")}
  </span>
);

// ─────────────────────────────────────────────────────────────────────────────
// THE ORGANIZATIONS COLLECTION
//
// The export keeps its old name because the name is a SEAM: `shell/lazy-
// surfaces.tsx` and `RealApp.tsx:2003` both reach for `module.StrategicDepth-
// Surface`, and both files belong to other lots this wave. What the component
// IS has changed completely — it is the client list, not the CRM ledger it was.
//
// WHAT THE COLLECTION STOPPED RENDERING, and where each kind went instead:
// opportunities and offers to Pipeline, people to People, renewals to Renewals,
// relationship facts to the organisation record's "What we know" below. Every
// one of those had to ship before this did, which is why this lot merges last.
//
// WHAT IT STILL RENDERS, AND WHY — because "retire the kinds that now have a
// home" leaves two that do not:
//
//  1. `decision`, `impact_review` and `recurrence` have NO edge to an
//     organisation in this model. `decision` carries `linkedRecordIds`, which
//     the only authoring path writes as `[]` (`client/workflow.ts:2925`);
//     `impact_review` links two decisions; `recurrence` carries an optional
//     `contextRecordId` nothing sets. So they cannot be attributed to a client
//     and cannot move to the client's record — three sections that would be
//     empty by construction is a capability nothing mounts, not a home.
//  2. `radar_candidate` rides `snapshot.radar`, NOT `snapshot.relationships`,
//     and the shell's inspector resolves a selection only against the latter
//     (`RealApp.tsx:816-825`). The review rail is the only place in the product
//     a radar candidate can be seen or resolved at all.
//
// Both are reported as findings rather than worked around, and both sit BELOW
// the accepted screen so the client list is what the surface opens on.

// Spelled as a mapped type rather than `Record<…>`: this file declares its own
// local `Record` alias for a strategic record, which shadows the built-in.
const SIGNAL_MARKS: { readonly [K in SignalKey]: string } = {
  risk: "▲",
  watch: "◧",
  good: "■",
  none: "□",
};

const LAYOUTS = [
  ["list", "List"],
  ["table", "Table"],
] as const;
type Layout = (typeof LAYOUTS)[number][0];

const SignalChip = ({ reading }: { readonly reading: OrganizationReading }) => (
  <span
    className={`${organizationStyles.signal} ${organizationStyles[`signal_${reading.signal.key}`]}`}
    data-relationship-signal={reading.signal.key}
  >
    <span aria-hidden="true" className={organizationStyles.signalMark}>
      {SIGNAL_MARKS[reading.signal.key]}
    </span>
    {reading.signal.label}
  </span>
);

const StatePill = ({ state }: { readonly state: string }) => (
  <span
    className={`${organizationStyles.state} ${organizationStyles[`state_${state}`]}`}
  >
    {relationshipStateLabel(state)}
  </span>
);

const Initials = ({ name }: { readonly name: string }) => (
  <span aria-hidden="true" className={organizationStyles.avatar}>
    {name
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.slice(0, 1).toUpperCase())
      .join("")}
  </span>
);

/** What the row prints about the client's deliveries. `undefined` open tasks is
 *  a FAILED READ of the work plane, not a zero — and it says so. */
const projectPhrase = (row: OrganizationRow): string =>
  row.delivery.openTasks === undefined
    ? "open tasks unavailable"
    : `${row.delivery.openTasks} open`;

const OrganizationRowView = ({
  row,
  index,
  itemProps,
  selected,
  onSelect,
  onOpen,
}: {
  readonly row: OrganizationRow;
  readonly index: number;
  readonly itemProps: (index: number) => ListNavigationItemProps;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
  readonly onOpen: (row: OrganizationRow) => void;
}) => {
  const nav = itemProps(index);
  const organization = row.reading.organization;
  const phrase =
    row.reading.lead === undefined
      ? undefined
      : renewalPhrase(row.reading.lead);
  return (
    <div
      {...nav}
      aria-label={row.accessibleName}
      aria-selected={selected}
      className={`${organizationStyles.row} ${selected ? organizationStyles.rowSelected : ""}`}
      data-org-row={organization.id}
      onClick={() => onSelect(organization.id)}
      onDoubleClick={() => onOpen(row)}
      role="option"
    >
      {/* THE READING LEADS, before the name. A list of clients is read for what
          needs attention first; the name is what you confirm once you are
          already looking. */}
      <SignalChip reading={row.reading} />
      <span className={organizationStyles.main}>
        <span className={organizationStyles.nameLine}>
          <span className={organizationStyles.name}>{organization.name}</span>
          <StatePill state={organization.relationshipState} />
          {organization.segment !== undefined && (
            <span className={organizationStyles.segment}>
              {organization.segment}
            </span>
          )}
        </span>
        {/* The reason, as visible text directly beneath the name. */}
        <span className={organizationStyles.why} data-org-why>
          {row.reading.signal.why.join(" · ")}
        </span>
      </span>
      <span className={organizationStyles.num}>
        {row.reading.deals.length === 0 ? (
          <b className={organizationStyles.absent}>No open deal</b>
        ) : (
          <>
            <b>{countLabel(row.reading.deals.length, "deal")}</b>
            {/* Per currency, never one converted number. */}
            <span className={organizationStyles.sub} data-org-deal-total>
              {fmtTotals(row.reading.dealTotals)}
            </span>
          </>
        )}
      </span>
      <span className={organizationStyles.num}>
        {row.delivery.projectCount === 0 ? (
          <b className={organizationStyles.absent}>No project</b>
        ) : (
          <>
            <b>{countLabel(row.delivery.projectCount, "project")}</b>
            <span className={organizationStyles.sub}>{projectPhrase(row)}</span>
          </>
        )}
      </span>
      <span className={organizationStyles.num}>
        {phrase === undefined || row.reading.renewal === undefined ? (
          <b className={organizationStyles.absent}>No contract watched</b>
        ) : (
          <>
            <b className={organizationStyles[phrase.tone] ?? ""}>
              {phrase.text}
            </b>
            <span className={organizationStyles.sub}>
              {row.reading.renewal.title}
            </span>
          </>
        )}
      </span>
      <span className={organizationStyles.next}>
        <span className={organizationStyles.nextText}>
          {organization.nextAction ?? (
            <span className={organizationStyles.absent}>No next step</span>
          )}
        </span>
        {/* WHAT IS NOT HERE: the prototype's "next meeting …". Every meeting in
            `relationship.workspace` is one that already happened, so a next
            meeting would be a claim about a calendar this screen never read.
            What it CAN say is when contact last happened, which the reading
            already computed. */}
        <span className={organizationStyles.sub}>
          {row.reading.idleDays === undefined
            ? "nothing recorded as contact"
            : row.reading.idleDays === 0
              ? "contact today"
              : `last contact ${row.reading.idleDays} days ago`}
        </span>
      </span>
      {row.contactName === undefined ? (
        <span
          aria-hidden="true"
          className={`${organizationStyles.avatar} ${organizationStyles.avatarNone}`}
        >
          —
        </span>
      ) : (
        <Initials name={row.contactName} />
      )}
    </div>
  );
};

const OrganizationsTable = ({
  rows,
  itemProps,
  selectedRecordId,
  onSelect,
  onOpen,
}: {
  readonly rows: readonly OrganizationRow[];
  readonly itemProps: (index: number) => ListNavigationItemProps;
  readonly selectedRecordId: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly onOpen: (row: OrganizationRow) => void;
}) => (
  // A GRID, declared. The rows own a roving tab stop and carry a selected
  // state, and `aria-selected` on a plain `<tr>` is not a combination the
  // accessibility tree defines.
  <table
    aria-label="Organizations"
    className={organizationStyles.table}
    role="grid"
  >
    <thead>
      <tr role="row">
        <th
          className={organizationStyles.colName}
          role="columnheader"
          scope="col"
        >
          <span className={organizationStyles.cell}>Organization</span>
        </th>
        <th
          className={organizationStyles.colState}
          role="columnheader"
          scope="col"
        >
          <span className={organizationStyles.cell}>Relationship</span>
        </th>
        <th
          className={organizationStyles.colReading}
          role="columnheader"
          scope="col"
        >
          <span className={organizationStyles.cell}>Reading</span>
        </th>
        <th
          className={organizationStyles.colDeals}
          role="columnheader"
          scope="col"
        >
          <span className={organizationStyles.cell}>Open deals</span>
        </th>
        <th
          className={organizationStyles.colProjects}
          role="columnheader"
          scope="col"
        >
          <span className={organizationStyles.cell}>Projects</span>
        </th>
        <th
          className={organizationStyles.colRenewal}
          role="columnheader"
          scope="col"
        >
          <span className={organizationStyles.cell}>Renewal</span>
        </th>
        <th
          className={organizationStyles.colNext}
          role="columnheader"
          scope="col"
        >
          <span className={organizationStyles.cell}>Next step</span>
        </th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row, index) => {
        const nav = itemProps(index);
        const organization = row.reading.organization;
        const phrase =
          row.reading.lead === undefined
            ? undefined
            : renewalPhrase(row.reading.lead);
        return (
          <tr
            {...nav}
            aria-label={row.accessibleName}
            aria-selected={organization.id === selectedRecordId}
            className={organizationStyles.tableRow}
            data-org-row={organization.id}
            key={organization.id}
            onClick={() => onSelect(organization.id)}
            onDoubleClick={() => onOpen(row)}
            role="row"
          >
            <td role="gridcell">
              <span
                className={`${organizationStyles.cell} ${organizationStyles.tableName}`}
              >
                {organization.name}
              </span>
            </td>
            <td role="gridcell">
              <span className={organizationStyles.cell}>
                <StatePill state={organization.relationshipState} />
              </span>
            </td>
            {/* The reason is VISIBLE here. In the prototype the Table layout
                carried it in a `title` and nowhere else — so the whole
                informational content of the reading disappeared for a keyboard
                and for touch the moment somebody switched layout. */}
            <td role="gridcell">
              <span className={organizationStyles.cell}>
                <SignalChip reading={row.reading} />
              </span>
              <span className={organizationStyles.cellWhy} data-org-why>
                {row.reading.signal.why.join(" · ")}
              </span>
            </td>
            <td role="gridcell">
              <span className={organizationStyles.cell}>
                {row.reading.deals.length === 0 ? (
                  <span className={organizationStyles.absent}>
                    No open deal
                  </span>
                ) : (
                  `${row.reading.deals.length} · ${fmtTotals(row.reading.dealTotals)}`
                )}
              </span>
            </td>
            <td role="gridcell">
              <span className={organizationStyles.cell}>
                {row.delivery.projectCount === 0 ? (
                  <span className={organizationStyles.absent}>No project</span>
                ) : (
                  `${row.delivery.projectCount} · ${projectPhrase(row)}`
                )}
              </span>
            </td>
            <td role="gridcell">
              <span className={organizationStyles.cell}>
                {phrase === undefined ? (
                  <span className={organizationStyles.absent}>
                    None watched
                  </span>
                ) : (
                  phrase.text
                )}
              </span>
            </td>
            <td role="gridcell">
              <span className={organizationStyles.cell}>
                {organization.nextAction ?? (
                  <span className={organizationStyles.absent}>
                    No next step
                  </span>
                )}
              </span>
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

export const StrategicDepthSurface = ({
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
  /** Rekord pokazywany w shellowym inspectorze (select, nie open). */
  readonly selectedRecordId: string | undefined;
  readonly onSelectRecord: (id: string) => void;
  readonly onOpenOrganization: (id: Record["id"], name: string) => void;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const [busyId, setBusyId] = useState<string>();
  const [layout, setLayout] = useState<Layout>("list");
  // The filter and the layout are state of the SCREEN, not of the route. Routed
  // through navigation they would clear the selection and close the inspector on
  // every click — and switching layout is exactly the moment you are looking at
  // a selected record from the other side (`v3/screens/crm.js:219-224`).
  const [held, setHeld] = useState<readonly string[]>([]);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftState, setDraftState] = useState<
    "prospect" | "active" | "inactive"
  >("prospect");
  const [draftSegment, setDraftSegment] = useState("");
  const [draftNextAction, setDraftNextAction] = useState("");

  const timeZone = snapshot.bootstrap.workspace.timezone;
  const relationships = readSlice(snapshot.relationships);
  const records = relationships.available ? relationships.data.records : [];

  const index = useMemo(() => indexRelationships(records), [records]);

  // Everything the collection still renders that is NOT an organization, and
  // there are exactly two groups of it — see the block comment above the row
  // components for why each has nowhere else to go.
  const decisions = records.filter((record) => record.kind === "decision");
  const recurrences = records.filter((record) => record.kind === "recurrence");
  const reviews = records.filter(
    (record): record is Review => record.kind === "impact_review",
  );
  const supportRecords = [...decisions, ...recurrences];
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

  // TODAY IS TAKEN IN THE WORKSPACE'S CALENDAR, not the machine's, and it is
  // built INSIDE the memo rather than beside it: a fresh object every render
  // would be a new dependency every render, and the memo would recompute
  // without anything having changed.
  //
  // `readProjects` answers `undefined` when the work plane could not be read at
  // all, and that `undefined` is carried all the way into the reading rather
  // than flattened to a zero: a client whose deliveries failed to load must not
  // come back saying "On track". The project COUNT survives, because the
  // `project_serves_organization` link rides this same relationship slice.
  const allRows = useMemo(() => {
    const prose: CrmProse = {
      timeZone: timeZone ?? "UTC",
      todayKey: dateKeyInZone(new Date(), timeZone),
    };
    return readOrganizations(
      index,
      rollUpDelivery(index, readProjects(snapshot, prose)),
      prose,
    );
  }, [index, snapshot, timeZone]);
  const rows = filterOrganizations(allRows, held);
  // FROM THE FULL SET. The chip answers "how many are like this", not "how many
  // do you see now" — recomputed over the filtered rows it would collapse into
  // the selection itself and stop being an answer.
  const counts = stateCounts(allRows);

  const openOrganization = (row: OrganizationRow) =>
    onOpenOrganization(
      row.reading.organization.id,
      row.reading.organization.name,
    );

  const itemProps = useListNavigation({
    itemCount: rows.length,
    onOpen: (position) => {
      const row = rows[position];
      if (row !== undefined) openOrganization(row);
    },
    onSelect: (position) => {
      const row = rows[position];
      if (row !== undefined) onSelectRecord(row.reading.organization.id);
    },
  });

  // The residual ledger owns a SECOND roving tab stop, because it is a second
  // list: its rows are decisions and recurrences, not organizations, and one
  // index shared across both would put the arrow keys on rows the reader is not
  // looking at.
  const supportNav = useListNavigation({
    itemCount: supportRecords.length,
    onOpen: (position) => {
      const record = supportRecords[position];
      if (record !== undefined) onSelectRecord(record.id);
    },
    onSelect: (position) => {
      const record = supportRecords[position];
      if (record !== undefined) onSelectRecord(record.id);
    },
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
          "Could not reach the data layer, so nothing changed. Try again.",
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

  const submitOrganization = () => {
    if (client === undefined || draftName.trim() === "") return;
    void act("create:organization", async () => {
      const result = await createOrganization(client, snapshot, {
        name: draftName.trim(),
        relationshipState: draftState,
        ...(draftSegment.trim() === "" ? {} : { segment: draftSegment.trim() }),
        ...(draftNextAction.trim() === ""
          ? {}
          : { nextAction: draftNextAction.trim() }),
      });
      if (result.kind === "success") {
        setCreating(false);
        setDraftName("");
        setDraftSegment("");
        setDraftNextAction("");
        setDraftState("prospect");
      } else onFailure(result);
    });
  };

  const header = (
    <header className="surface-header">
      <h1 id="surface-title" tabIndex={-1}>
        Organizations
      </h1>
    </header>
  );

  // The slice's OWN message, and a way to try again. Never an empty list: an
  // unreadable workspace and a workspace with no clients in it are different
  // answers and this screen has to say which one it is holding.
  if (!relationships.available)
    return (
      <div
        className={`surface-scroll ${organizationStyles.organizations}`}
        data-organizations-surface
      >
        {header}
        <section className={organizationStyles.emptyState} role="status">
          <div>
            <h2>Organizations are unavailable</h2>
            <p data-organizations-unavailable>{relationships.message}</p>
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
    <div
      className={`surface-scroll ${organizationStyles.organizations}`}
      data-organizations-surface
    >
      {header}
      <div className={organizationStyles.crumbbar}>
        <button
          aria-expanded={creating}
          className="secondary-button"
          onClick={() => setCreating((open) => !open)}
          type="button"
        >
          <Icon name="capture" />
          New organization
        </button>
      </div>
      {creating && (
        <form
          aria-label="New organization"
          className={organizationStyles.create}
          onSubmit={(event) => {
            event.preventDefault();
            submitOrganization();
          }}
        >
          <label className={organizationStyles.field}>
            Name
            <input
              onChange={(event) => setDraftName(event.target.value)}
              required
              value={draftName}
            />
          </label>
          <label className={organizationStyles.field}>
            Relationship
            <select
              onChange={(event) =>
                setDraftState(
                  event.target.value as "prospect" | "active" | "inactive",
                )
              }
              value={draftState}
            >
              {RELATIONSHIP_STATES.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={organizationStyles.field}>
            Segment
            <input
              onChange={(event) => setDraftSegment(event.target.value)}
              value={draftSegment}
            />
          </label>
          <label className={organizationStyles.field}>
            Next step
            <input
              onChange={(event) => setDraftNextAction(event.target.value)}
              value={draftNextAction}
            />
          </label>
          <button
            className="primary-button"
            disabled={busyId !== undefined || draftName.trim() === ""}
            type="submit"
          >
            {busyId === "create:organization" ? "Adding…" : "Add organization"}
          </button>
        </form>
      )}
      <div className={organizationStyles.viewbar}>
        <div
          aria-label="Organizations layout"
          className={organizationStyles.switcher}
          role="tablist"
        >
          {LAYOUTS.map(([id, label]) => (
            <button
              aria-selected={layout === id}
              className={organizationStyles.switch}
              key={id}
              onClick={() => setLayout(id)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {/* THE FILTER, AND BOTH WAYS OUT OF IT. The chips toggle, so unclicking
            the last one clears it; `Show all` clears it in one press and appears
            only while there is something to clear. A control a reader cannot get
            out of is worse than no control. */}
        <div
          aria-label="Filter by relationship"
          className={organizationStyles.filter}
          role="group"
        >
          <span className={organizationStyles.filterKey}>Relationship</span>
          {RELATIONSHIP_STATES.map(([id, label]) => (
            <button
              aria-pressed={held.includes(id)}
              className={organizationStyles.chip}
              data-org-filter={id}
              key={id}
              onClick={() =>
                setHeld((current) =>
                  current.includes(id)
                    ? current.filter((entry) => entry !== id)
                    : [...current, id],
                )
              }
              type="button"
            >
              {label}
              <span className={organizationStyles.chipCount}>
                {counts.get(id) ?? 0}
              </span>
            </button>
          ))}
          {held.length > 0 && (
            <button
              className={organizationStyles.showAll}
              data-org-filter="all"
              onClick={() => setHeld([])}
              type="button"
            >
              Show all
            </button>
          )}
        </div>
        <span
          aria-live="polite"
          className={organizationStyles.count}
          data-org-count
          role="status"
        >
          {countSentence(rows.length, allRows.length)}
        </span>
      </div>
      {allRows.length === 0 ? (
        <section className={organizationStyles.emptyState} role="status">
          <div>
            <h2>No organizations yet</h2>
            <p>An organization is a client you deal with, not a folder.</p>
          </div>
        </section>
      ) : rows.length === 0 ? (
        <section className={organizationStyles.emptyState} role="status">
          <div>
            <h2>Nothing matches this filter</h2>
            {/* The sentence names which states are being held, because "nothing
                here" is not something a reader can act on. */}
            <p>
              {`The filter is holding ${heldStatesSentence(held)}, and no organization is in that state.`}
            </p>
          </div>
          <button
            className="secondary-button"
            data-org-filter="all"
            onClick={() => setHeld([])}
            type="button"
          >
            Show all organizations
          </button>
        </section>
      ) : layout === "table" ? (
        <OrganizationsTable
          itemProps={itemProps}
          onOpen={openOrganization}
          onSelect={onSelectRecord}
          rows={rows}
          selectedRecordId={selectedRecordId}
        />
      ) : (
        <div
          aria-label="Organizations"
          className={organizationStyles.list}
          role="listbox"
        >
          {rows.map((row, position) => (
            <OrganizationRowView
              index={position}
              itemProps={itemProps}
              key={row.reading.organization.id}
              onOpen={openOrganization}
              onSelect={onSelectRecord}
              row={row}
              selected={row.reading.organization.id === selectedRecordId}
            />
          ))}
        </div>
      )}

      {/* ── What the retirement could not rehome ──────────────────────────
          Everything below this line is the residue named in the block comment
          above: the create panel (the only authoring path for the kinds with no
          screen), the records with no edge to a client, and the review rail
          whose items do not ride the relationship slice at all. */}
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

      <div className="strategic-layout">
        <div className="strategic-work-plane">
          <section
            className="strategic-ledger"
            aria-labelledby="supporting-title"
          >
            <header className="section-heading">
              <div>
                <h2 id="supporting-title">Supporting records</h2>
              </div>
            </header>
            {supportRecords.map((record, position) => (
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
                  {...supportNav(position)}
                  onClick={() => onSelectRecord(record.id)}
                >
                  <span className="record-kind">
                    {recordKindLabels[record.kind] ?? record.kind}
                  </span>
                  <span className="ledger-copy">
                    <strong>{record.title}</strong>
                    <small>
                      {record.kind === "decision"
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
                    Create occurrence
                  </button>
                ) : (
                  <StateMark state={record.state} />
                )}
              </div>
            ))}
            {supportRecords.length === 0 && (
              <p className="strategic-quiet">
                No supporting records in this Space.
              </p>
            )}
          </section>
        </div>

        <aside className="strategic-review" aria-labelledby="review-title">
          <header>
            <h2 id="review-title">To decide</h2>
            <span>The list does not grow while you review it.</span>
          </header>
          {radar.map((candidate) => {
            const radarBusy =
              busyId === `${candidate.id}:saved` ||
              busyId === `${candidate.id}:dismissed`;
            return (
              <article key={candidate.id} className="review-item">
                <span className="review-type">Knowledge radar</span>
                <strong>{candidate.title}</strong>
                <p>{candidate.relevance}</p>
                <div className="review-actions">
                  <button
                    className="secondary-button compact"
                    disabled={radarBusy}
                    onClick={() => resolveRadar(candidate, "saved")}
                  >
                    {busyId === `${candidate.id}:saved` ? "Saving…" : "Keep"}
                  </button>
                  <button
                    className="secondary-button compact"
                    disabled={radarBusy}
                    onClick={() => resolveRadar(candidate, "dismissed")}
                  >
                    {busyId === `${candidate.id}:dismissed`
                      ? "Saving…"
                      : "Dismiss"}
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
              <span className="review-type">Decision impact</span>
              <strong>
                {recordKindLabels[item.recordKind] ?? item.recordKind}
              </strong>
              <p>{review.reason}</p>
              <button
                className="secondary-button compact"
                disabled={busyId === `${review.id}:${item.recordId}`}
                onClick={() => resolveImpact(review, item.recordId)}
              >
                Mark impact as reviewed
              </button>
            </article>
          ))}
          {radar.length + openConsequences.length === 0 && (
            <div className="review-complete" role="status">
              <span aria-hidden="true">✓</span>
              <strong>Review complete</strong>
              <p>New items appear only with a new source or context.</p>
            </div>
          )}
          <footer>
            <span>
              {plural(
                radar.length + openConsequences.length,
                "item needs a decision",
                "items need a decision",
              )}
            </span>
          </footer>
        </aside>
      </div>
    </div>
  );
};

const emptySectionCopy = {
  people: "No people are linked to this organization yet.",
  opportunities: "No active opportunities are linked to this organization.",
  // `activeProjects` unions two reaches (ADR-071) — the projects this client's
  // opportunities name, and deliveries linked straight at the client — so
  // attributing the emptiness to the shortage of deals alone was misleading.
  projects: "No active projects are linked to this client.",
  tasks: "No open tasks in the client's active projects.",
  renewals: "No renewals need tracking.",
  facts: "No verified relationship facts yet.",
  meetings: "No meetings are assigned to this organization.",
  documents: "No documents are linked to this organization.",
} as const;

const EmptyOrganizationSection = ({
  children,
}: {
  readonly children: string;
}) => <p className="organization-empty">{children}</p>;

/**
 * The authoring row under Aktywna praca — the mirror of the Klient card's row
 * on the Project page, and deliberately the same shape: one edge, two ends, one
 * pair of verbs. Presentational, for the same reason its twin is: which
 * Projects may be offered and which are directly linked are both kernel
 * preconditions, and this file must not learn them.
 */
const DeliveryLinkRow = ({
  candidates,
  detachable,
  busy,
  onLink,
  onUnlink,
}: {
  readonly candidates:
    readonly { readonly id: ProjectId; readonly title: string }[] | undefined;
  readonly detachable: readonly {
    readonly id: ProjectId;
    readonly title: string;
  }[];
  readonly busy: boolean;
  readonly onLink: (projectId: ProjectId) => void;
  readonly onUnlink: (projectId: ProjectId) => void;
}) => {
  const [selected, setSelected] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | undefined>(
    undefined,
  );
  return (
    <div className="organization-context__actions">
      {candidates === undefined ? (
        // "The read did not land" and "there are none" are different facts and
        // the row says which. Two projections feed this one: the Projects and
        // the links already made.
        <small>
          Could not load projects, so a delivery cannot be linked right now.
        </small>
      ) : candidates.length === 0 ? (
        <small>No active projects to link in this client's Space.</small>
      ) : (
        <>
          <label className="sr-only" htmlFor="organization-delivery-link">
            Project delivered for this client
          </label>
          <select
            id="organization-delivery-link"
            value={selected}
            disabled={busy}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">Choose project…</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondary-button compact"
            disabled={busy || selected === ""}
            onClick={() => {
              onLink(selected as ProjectId);
              setSelected("");
            }}
          >
            Link project
          </button>
        </>
      )}
      {detachable.map((project) =>
        confirmingId === project.id ? (
          <Fragment key={project.id}>
            {/* `activeProjects` unions two reaches, so a project this client's
                opportunity also names stays on the list after detaching. Said
                out loud, or the button reads as broken. */}
            <small>
              Unlinking removes only the direct link. A project an opportunity
              also names stays on the list.
            </small>
            <button
              type="button"
              className="status-danger"
              disabled={busy}
              onClick={() => {
                setConfirmingId(undefined);
                onUnlink(project.id);
              }}
            >
              Confirm unlink
            </button>
            <button
              type="button"
              className="secondary-button compact"
              disabled={busy}
              onClick={() => setConfirmingId(undefined)}
            >
              Cancel
            </button>
          </Fragment>
        ) : (
          <button
            key={project.id}
            type="button"
            className="ghost-button"
            disabled={busy}
            onClick={() => setConfirmingId(project.id)}
          >
            Unlink “{project.title}”
          </button>
        ),
      )}
    </div>
  );
};

/** An organization offers two of the five sections a record can have. The
 *  others need collections it does not own: its projects and tasks are the
 *  CLIENT's work, listed in the body as exits, not a backlog it holds. */
const ORGANIZATION_TABS: readonly RecordTab[] = ["overview", "comments"];

export const OrganizationContextSurface = ({
  overview,
  deliveryCandidates,
  linkedProjectIds,
  linkBusy,
  onLinkDelivery,
  onUnlinkDelivery,
  onOpenProject,
  onOpenTask,
  onOpenDocument,
  onOpenMeeting,
  onOpenRelationship,
  comments,
  commentCount,
}: {
  readonly overview: OrganizationOverviewProjection;
  // Resolved by the caller, exactly as on the Project side.
  readonly deliveryCandidates:
    readonly { readonly id: ProjectId; readonly title: string }[] | undefined;
  readonly linkedProjectIds: ReadonlySet<string>;
  readonly linkBusy: boolean;
  readonly onLinkDelivery: (id: ProjectId) => void;
  readonly onUnlinkDelivery: (id: ProjectId) => void;
  readonly onOpenProject: (
    id: OrganizationOverviewProjection["activeProjects"][number]["id"],
    title: string,
  ) => void;
  readonly onOpenTask: (
    id: OrganizationOverviewProjection["openTasks"][number]["id"],
    title: string,
  ) => void;
  readonly onOpenDocument: (
    id: OrganizationOverviewProjection["documents"][number]["id"],
    title: string,
  ) => void;
  readonly onOpenMeeting: (
    id: OrganizationOverviewProjection["meetings"][number]["id"],
  ) => void;
  readonly onOpenRelationship: (
    id: OrganizationOverviewProjection["opportunities"][number]["id"],
  ) => void;
  /** Decision #28's second record kind. OPTIONAL, and the surface is unchanged
   *  without it: this component has a second call site — the development
   *  harness — that supplies no loader, and a required prop would break the
   *  build there rather than at the place the decision was taken. */
  readonly comments?: ReactNode | undefined;
  readonly commentCount?: number | undefined;
}) => {
  const { organization } = overview;
  const lastMeeting = overview.meetings[0];
  const nextRenewal = overview.renewals[0];
  // Held here rather than in the strip, because which tab is open is per-record
  // and the bar is stateless by design. Two tabs, not five: an organization has
  // no Tasks panel and no Documents panel of its own — the strip takes its tab
  // SET as a prop precisely so a kind can show fewer than every tab that
  // exists, and drawing an empty one would be a promise about a collection this
  // record does not have.
  const [tab, setTab] = useState<RecordTab>("overview");
  const tabbed = comments !== undefined;
  const body = (
    <>
      <section
        className="organization-context__pulse"
        aria-label="Relationship status"
      >
        <div>
          <span>Active projects</span>
          <strong>{overview.activeProjects.length}</strong>
        </div>
        <div>
          <span>Open tasks</span>
          <strong>{overview.openTasks.length}</strong>
        </div>
        <div>
          <span>Last contact</span>
          <strong>
            {lastMeeting ? formatDate(lastMeeting.startedAt) : "—"}
          </strong>
        </div>
        <div>
          <span>Next renewal</span>
          <strong>
            {nextRenewal ? formatDate(nextRenewal.expiresAt) : "—"}
          </strong>
        </div>
      </section>

      <div className="organization-context__grid">
        <section
          className="organization-context__section organization-context__section--wide"
          aria-labelledby="org-work-title"
        >
          <header>
            <div>
              <p className="section-label">Delivery</p>
              <h2 id="org-work-title">Active work</h2>
            </div>
          </header>
          {overview.activeProjects.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.projects}
            </EmptyOrganizationSection>
          ) : (
            <ul className="organization-context__rows">
              {overview.activeProjects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => onOpenProject(project.id, project.title)}
                  >
                    <span>
                      <strong>{project.title}</strong>
                      <small>
                        <NarrativeText
                          kind="project"
                          text={project.intendedOutcome}
                          needsReview={project.needsReview}
                        />
                      </small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <DeliveryLinkRow
            candidates={deliveryCandidates}
            // The title comes from the listed record, because the id set the
            // caller passes carries no label — and only a listed delivery can
            // be offered a detach at all.
            detachable={overview.activeProjects.filter((project) =>
              linkedProjectIds.has(project.id),
            )}
            busy={linkBusy}
            onLink={onLinkDelivery}
            onUnlink={onUnlinkDelivery}
          />
          {overview.openTasks.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.tasks}
            </EmptyOrganizationSection>
          ) : (
            <ul className="organization-context__rows organization-context__rows--tasks">
              {overview.openTasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id, task.title)}
                  >
                    <span>
                      <strong>{task.title}</strong>
                      <small>
                        {task.dueAt
                          ? `Deadline ${formatDate(task.dueAt)}`
                          : "No deadline"}{" "}
                        ·{" "}
                        {strategicStateLabels[task.operationalState] ??
                          task.operationalState}
                      </small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="organization-context__section"
          aria-labelledby="org-people-title"
        >
          <header>
            <div>
              <p className="section-label">Relationship</p>
              <h2 id="org-people-title">People</h2>
            </div>
            <span>{overview.people.length}</span>
          </header>
          {overview.people.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.people}
            </EmptyOrganizationSection>
          ) : (
            <ul className="organization-context__plain-list">
              {overview.people.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRelationship(person.id)}
                  >
                    <strong>{person.name}</strong>
                    <span>{person.role ?? person.email ?? "Contact"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="organization-context__section"
          aria-labelledby="org-pipeline-title"
        >
          <header>
            <div>
              <p className="section-label">Pipeline</p>
              <h2 id="org-pipeline-title">Opportunities and offers</h2>
            </div>
            <span>{overview.opportunities.length}</span>
          </header>
          {overview.opportunities.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.opportunities}
            </EmptyOrganizationSection>
          ) : (
            <ul className="organization-context__plain-list">
              {overview.opportunities.map((opportunity) => (
                <li key={opportunity.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRelationship(opportunity.id)}
                  >
                    <strong>{opportunity.title}</strong>
                    <span>{opportunity.nextAction}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {overview.offers.map((offer) => (
            <button
              className="organization-context__inline-link"
              type="button"
              key={offer.id}
              onClick={() => onOpenRelationship(offer.id)}
            >
              {offer.title} · {strategicStateLabels[offer.state] ?? offer.state}
            </button>
          ))}
        </section>

        <section
          className="organization-context__section"
          aria-labelledby="org-renewals-title"
        >
          <header>
            <div>
              <p className="section-label">Deadlines</p>
              <h2 id="org-renewals-title">Renewals</h2>
            </div>
            <span>{overview.renewals.length}</span>
          </header>
          {overview.renewals.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.renewals}
            </EmptyOrganizationSection>
          ) : (
            <ul className="organization-context__plain-list">
              {overview.renewals.map((renewal) => (
                <li key={renewal.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRelationship(renewal.id)}
                  >
                    <strong>{renewal.title}</strong>
                    <span>
                      {formatDate(renewal.expiresAt)} · {renewal.scope}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* WHAT WE KNOW — the section the retired collection handed over.
            "Renewals and fact freshness" was where a fact's verification date
            and its staleness were readable; the collection no longer draws it,
            so the freshness comes here with the facts rather than disappearing.

            IT HOLDS FACTS AND NOTHING ELSE, and that is a finding rather than a
            choice. The plan put decisions here too, but a `decision` carries no
            edge to an organisation: `linkedRecordIds` is written `[]` by the
            only authoring path there is, `impact_review` links two decisions to
            each other, and `recurrence`'s `contextRecordId` is optional and
            unset. Three sections that could never fill would be worse than the
            gap being named. */}
        <section
          className="organization-context__section"
          aria-labelledby="org-facts-title"
        >
          <header>
            <div>
              <p className="section-label">Knowledge</p>
              <h2 id="org-facts-title">What we know</h2>
            </div>
            <span data-organization-fact-freshness>
              {overview.facts.filter((fact) => fact.state !== "current")
                .length === 0
                ? `${overview.facts.length} verified`
                : `${overview.facts.filter((fact) => fact.state !== "current").length} of ${overview.facts.length} to re-verify`}
            </span>
          </header>
          {overview.facts.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.facts}
            </EmptyOrganizationSection>
          ) : (
            <dl className="organization-context__facts">
              {overview.facts.map((fact) => (
                <div data-organization-fact={fact.id} key={fact.id}>
                  <dt>{fact.factType}</dt>
                  <dd>
                    {fact.value}
                    {/* The date it was last checked, beside the word for its
                        state. "Stale" on its own does not say how stale, and a
                        fact nobody has looked at since spring is a different
                        thing from one that went stale yesterday. */}
                    <small>
                      {strategicStateLabels[fact.state] ?? fact.state} ·
                      verified {formatDate(fact.verifiedAt)}
                    </small>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section
          className="organization-context__section"
          aria-labelledby="org-meetings-title"
        >
          <header>
            <div>
              <p className="section-label">Contact</p>
              <h2 id="org-meetings-title">Meetings</h2>
            </div>
            <span>{overview.meetings.length}</span>
          </header>
          {overview.meetings.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.meetings}
            </EmptyOrganizationSection>
          ) : (
            <ul className="organization-context__plain-list">
              {overview.meetings.map((meeting) => (
                <li key={meeting.id}>
                  <button
                    type="button"
                    onClick={() => onOpenMeeting(meeting.id)}
                  >
                    <strong>{meeting.title}</strong>
                    <span>{formatDateTime(meeting.startedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="organization-context__section"
          aria-labelledby="org-docs-title"
        >
          <header>
            <div>
              <p className="section-label">Materials</p>
              <h2 id="org-docs-title">Documents</h2>
            </div>
            <span>{overview.documents.length}</span>
          </header>
          {overview.documents.length === 0 ? (
            <EmptyOrganizationSection>
              {emptySectionCopy.documents}
            </EmptyOrganizationSection>
          ) : (
            <ul className="organization-context__plain-list">
              {overview.documents.map((document) => (
                <li key={document.id}>
                  <button
                    type="button"
                    onClick={() => onOpenDocument(document.id, document.title)}
                  >
                    <strong>{document.title}</strong>
                    <span>
                      {recordKindLabels[document.role] ?? document.role}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );

  return (
    <div className="surface-scroll organization-context">
      <header className="surface-header organization-context__header">
        <div>
          <p className="eyebrow">Organization · full context</p>
          <h1 id="surface-title" tabIndex={-1}>
            {organization.name}
          </h1>
          <p>{organization.nextAction ?? "No next move set yet."}</p>
        </div>
        <StateMark state={organization.relationshipState} />
      </header>
      {tabbed ? (
        <RecordTabStrip
          counts={commentCount === undefined ? {} : { comments: commentCount }}
          onSelect={setTab}
          recordId={organization.id}
          selected={tab}
          tabs={ORGANIZATION_TABS}
        >
          {tab === "comments" ? comments : body}
        </RecordTabStrip>
      ) : (
        body
      )}
    </div>
  );
};

type OrganizationContextNavigation = Pick<
  Parameters<typeof OrganizationContextSurface>[0],
  | "onOpenProject"
  | "onOpenTask"
  | "onOpenDocument"
  | "onOpenMeeting"
  | "onOpenRelationship"
>;

// Authoring, as against navigation. Threaded from the app rather than run here
// because a link changes the whole snapshot — the candidate list and the Klient
// card on the Project page both re-derive from it — and this loader can only
// re-run its own query.
type OrganizationContextAuthoring = Pick<
  Parameters<typeof OrganizationContextSurface>[0],
  "linkBusy" | "onLinkDelivery" | "onUnlinkDelivery"
>;

export const OrganizationContextLoader = ({
  client,
  snapshot,
  organizationId,
  ...navigation
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly organizationId: StrategicRecordId;
} & OrganizationContextNavigation &
  OrganizationContextAuthoring) => {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    | { readonly kind: "loading" }
    | { readonly kind: "ready"; readonly data: OrganizationOverviewProjection }
    | { readonly kind: "unavailable"; readonly message: string }
  >({ kind: "loading" });
  // A record's comments are a TARGETED fetch, not a snapshot slice, so they are
  // read here beside the overview rather than threaded down from the shell —
  // the same reason the overview itself is read here. `undefined` means the
  // read has not landed or the contract refused, and the surface then renders
  // exactly as it did before the tab existed.
  const [comments, setComments] =
    useState<Awaited<ReturnType<typeof loadComments>>>();
  // Whose voice this is and what it may do to a comment — the SAME reading the
  // shell makes, from the one place that makes it. It was spelled out here as
  // well until the two copies were one edit away from disagreeing about who may
  // resolve a thread.
  const {
    currentPrincipalId,
    canComment,
    canResolve: canResolveComments,
  } = readCommentPermissions(snapshot.access);
  const [commentBusy, setCommentBusy] = useState(false);
  // One shape for all three comment writes. Each RE-READS the list on success
  // rather than patching it: the version the write expected has just moved, and
  // a list assembled from the old one refuses the NEXT write with a version
  // conflict nobody can explain.
  const settleCommentWrite = async (
    api: ConstellationRendererClient,
    organization: OrganizationOverviewProjection["organization"],
    result: { readonly kind: string },
  ): Promise<boolean> => {
    setCommentBusy(false);
    if (result.kind !== "success") return false;
    const target = organizationCommentTarget(organization);
    try {
      setComments(await loadComments(api, snapshot, target));
    } catch {
      // The re-read is the refusable half, and it is the one documented below:
      // a kernel predating 0.2.0 answers the organization comment target with a
      // refusal. Nothing catches this downstream — the panel attaches only
      // `.then` — so an uncaught rejection is what a stale kernel would cost.
      //
      // Swallowed, and the answer stays TRUE: the WRITE has already landed.
      // This boolean is what clears the composer and closes the editor, so
      // returning false here would leave the author's text sitting under a
      // comment that DID post, and the retry double-posts it. The list is
      // simply one read behind until the next one lands.
    }
    return true;
  };
  useEffect(() => {
    const organization =
      snapshot.relationships.kind === "ready"
        ? snapshot.relationships.data.records.find(
            (record) =>
              record.kind === "organization" && record.id === organizationId,
          )
        : undefined;
    if (!client || !organization || organization.kind !== "organization") {
      setState({
        kind: "unavailable",
        message: "This organization's context is no longer available.",
      });
      return;
    }
    let active = true;
    setState({ kind: "loading" });
    void loadOrganizationOverview(
      client,
      snapshot,
      organization.id,
      organization.spaceId,
    )
      .then((data) => active && setState({ kind: "ready", data }))
      .catch(() => {
        if (active)
          setState({
            kind: "unavailable",
            message: "Could not load the overview. Nothing was changed.",
          });
      });
    void loadComments(client, snapshot, {
      kind: "organization",
      organizationId: organization.id,
    })
      .then((data) => active && setComments(data))
      // Swallowed on purpose, and it is the ONLY thing swallowed here. The
      // organization arm of the comment target landed in 0.2.0; a workspace
      // whose kernel predates it refuses the query, and that must cost the
      // client context nothing — the record still opens, without the tab.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [attempt, client, organizationId, snapshot]);
  if (state.kind === "ready")
    return (
      <OrganizationContextSurface
        overview={state.data}
        // Derived here rather than in the surface: which Projects the kernel
        // would accept is a precondition, and the Space comes off the
        // projection's own organization so the picker cannot offer a Project
        // from a Space this client is not in.
        deliveryCandidates={linkableDeliveryProjects(
          snapshot,
          state.data.organization,
        )}
        linkedProjectIds={
          new Set(
            directDeliveryProjects(snapshot, state.data.organization.id).keys(),
          )
        }
        {...navigation}
        commentCount={
          comments === undefined ? undefined : openThreadCount(comments.threads)
        }
        comments={
          client === undefined || comments === undefined ? undefined : (
            <RecordCommentsPanel
              actorOf={buildActorResolver(
                snapshot.agentAccess.kind === "ready"
                  ? snapshot.agentAccess.data
                  : undefined,
              )}
              busy={commentBusy}
              canComment={canComment}
              canResolve={canResolveComments}
              currentPrincipalId={currentPrincipalId}
              mentionCandidates={
                snapshot.mentionCandidates.kind === "ready"
                  ? snapshot.mentionCandidates.data.candidates.filter(
                      (candidate) =>
                        candidate.principalId !== currentPrincipalId,
                    )
                  : []
              }
              mentionNameOf={buildMentionResolver(
                snapshot.mentionCandidates.kind === "ready"
                  ? snapshot.mentionCandidates.data
                  : undefined,
                currentPrincipalId,
              )}
              onEdit={async (comment, body, attachmentSourceIds) => {
                setCommentBusy(true);
                // The mentions are carried over unchanged: an edit is a
                // correction to the text, and re-sending an empty list would
                // quietly un-name everybody the comment had woken.
                const result = await editComment(
                  client,
                  snapshot,
                  comment.id,
                  comment.version,
                  body,
                  comment.mentionPrincipalIds,
                  attachmentSourceIds,
                );
                return settleCommentWrite(
                  client,
                  state.data.organization,
                  result,
                );
              }}
              onResolve={async (comment, resolved) => {
                setCommentBusy(true);
                const result = await setCommentResolved(
                  client,
                  snapshot,
                  comment,
                  resolved,
                );
                return settleCommentWrite(
                  client,
                  state.data.organization,
                  result,
                );
              }}
              // All FOUR arguments forwarded. A two-parameter function is
              // assignable to this prop and drops the last two silently, which
              // lands an answer as a fresh thread and leaves staged files
              // behind — neither of which the panel can see from here.
              onSubmit={async (body, mentions, parent, attachmentSourceIds) => {
                setCommentBusy(true);
                const result = await addComment(
                  client,
                  snapshot,
                  organizationCommentTarget(state.data.organization),
                  state.data.organization.version,
                  body,
                  mentions,
                  parent,
                  attachmentSourceIds,
                );
                return settleCommentWrite(
                  client,
                  state.data.organization,
                  result,
                );
              }}
              recordKey={state.data.organization.id}
              threads={comments.threads}
              // The organization tab exists only when the read SUCCEEDED — a
              // kernel that refuses this target leaves `comments` undefined and
              // the strip does not appear at all — so by the time this mounts
              // the list is always the answer.
              threadsKnown
              timeZone={snapshot.bootstrap.workspace.timezone}
            />
          )
        }
      />
    );
  return (
    <section
      className="surface-load-state"
      role={state.kind === "loading" ? "status" : "alert"}
    >
      <p className="eyebrow">Organization</p>
      <h1 id="surface-title" tabIndex={-1}>
        {state.kind === "loading"
          ? "Opening client context…"
          : "Could not open the client context"}
      </h1>
      {state.kind === "unavailable" && (
        <>
          <p>{state.message}</p>
          <button
            className="secondary-button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </button>
        </>
      )}
    </section>
  );
};
