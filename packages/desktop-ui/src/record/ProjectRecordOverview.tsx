import { Fragment, useState, type ReactNode } from "react";

import {
  compositionSentence,
  deadlineDate,
  deadlineSentence,
  deadlineTone,
  HEALTH_MARKS,
  type ProjectBuckets,
  type ProjectProse,
  type ProjectReading,
} from "../projects/project-view.js";
import type {
  ProjectCheckInListProjection,
  ProjectCheckInSlice,
  ProjectOverviewProjection,
} from "../client/workflow.js";
import { countLabel } from "../i18n.js";
import { Icon } from "../components/Icon.js";
import styles from "./project-record.module.css";

// The Overview of a project record, and the header that stands over it.
//
// Three things are deliberately different from the surface this replaces, and
// each one answers a complaint rather than a taste:
//
//  1. Health and the deadline live in the HEADER, as one sentence about the
//     project's state — never a card with a title of its own. They arrive
//     already read, from `readProject`; nothing here recognises a state name or
//     re-cases one, which is how "Waiting" was added without this file being
//     touched, and how the next state will be.
//  2. "Does it still fit" runs the full width. It is the only decision number
//     on the screen, and it is read HORIZONTALLY — in a narrow column the
//     numbers stack one under another and never add up to a sentence.
//  3. The document gets a reading width and stops being cut. Real intended
//     outcomes run several paragraphs, and the LINE is what gets limited, never
//     the height: there is no expander and nothing to un-truncate.
//
// The panel draws NO selectable rows. Every exit on the rail is a plain control
// outside the record's roving tab stop, so this file takes no `itemProps` and
// cannot consume an index belonging to a panel that is on screen.

type ClientOrganization =
  ProjectOverviewProjection["clientOrganizations"][number];
type EvidenceSource = ProjectOverviewProjection["evidenceSources"][number];

/**
 * How long the project has been quiet, said the way a person says it.
 *
 * Deliberately NOT reconciled with the "last moved jul 25" that the On-track
 * health reason carries. That one dates the movement, this one measures the
 * silence, and a reader wants a different one of the two in each place.
 */
const movedSentence = (idleDays: number): string => {
  if (idleDays <= 0) return "moved today";
  if (idleDays === 1) return "last moved yesterday";
  return `last moved ${countLabel(idleDays, "day")} ago`;
};

/**
 * The composition bar, drawn the same way the Projects list draws it and read
 * from the same place. The reading is shared — `buckets` and
 * `compositionSentence` both come from `project-view.ts` — and only the drawing
 * is restated, because the list's stylesheet belongs to the list. What must
 * never be restated is the arithmetic, and it is not.
 *
 * A bucket of zero draws nothing: a hairline segment is a claim about a count
 * nobody has. The legend below states the zero instead.
 */
const BAR_SEGMENTS = ["done", "held", "open"] as const;

/** The words the legend uses, in the order the bar draws them and in the same
 *  order the bar's accessible name lists them. Two orders of one scale drift
 *  apart the first time a bucket is added. */
const LEGEND: readonly (readonly [(typeof BAR_SEGMENTS)[number], string])[] = [
  ["done", "closed"],
  ["held", "waiting or blocked"],
  // "unblocked", never "open" — the line above this bar says `open.length`,
  // which counts the held ones too, so two numbers one apart would sit two
  // lines from each other under one word. The same wording as
  // `compositionSentence`, which is what a screen reader hears here.
  ["open", "unblocked"],
];

const CompositionBar = ({ buckets }: { readonly buckets: ProjectBuckets }) => (
  <span
    aria-label={compositionSentence(buckets)}
    className={styles.bar}
    role="img"
  >
    {BAR_SEGMENTS.map((segment) =>
      buckets[segment] === 0 ? null : (
        <span
          className={styles[`bar_${segment}`]}
          key={segment}
          style={{ inlineSize: `${(buckets[segment] / buckets.total) * 100}%` }}
        />
      ),
    )}
  </span>
);

export interface ProjectRecordHeaderProps {
  readonly reading: ProjectReading;
  readonly prose: ProjectProse;
  /** The client this is delivered to. Absent means none is linked — a fact to
   *  state, not a gap to hide. */
  readonly client?: ClientOrganization | undefined;
  readonly onOpenClient?: ((client: ClientOrganization) => void) | undefined;
}

/**
 * The header, which is one sentence and not a card: what is happening, then
 * with whom and by when, in that reading order.
 *
 * It renders the screen's only `<h1>` — the record names itself once, at level
 * one. The crumbbar above it names the same project as a trail, not a heading.
 *
 * That `<h1>` carries `id="surface-title"` and `tabIndex={-1}` because the shell
 * uses BOTH: `aria-labelledby="surface-title"` names the whole work plane, and
 * the effect that runs after a destination change moves focus onto that id,
 * falling back to the panel. Rendering a heading without them would leave the
 * work plane unnamed and send focus to the panel instead of the record —
 * silently, and only for the keyboard.
 */
export const ProjectRecordHeader = ({
  reading,
  prose,
  client,
  onOpenClient,
}: ProjectRecordHeaderProps) => {
  const due = deadlineDate(reading, prose);
  const tone = deadlineTone(reading);
  return (
    <header className={styles.header}>
      <h1 className={styles.title} id="surface-title" tabIndex={-1}>
        {reading.project.title}
      </h1>
      <div className={styles.head}>
        <span
          className={`${styles.state} ${styles[`state_${reading.health.key}`]}`}
        >
          <span aria-hidden="true" className={styles.mark}>
            {HEALTH_MARKS[reading.health.key]}
          </span>
          {reading.health.label}
        </span>
        {/* The reason travels with the state everywhere the state goes. A
            label alone says which bucket; only the reason says why. */}
        <span className={styles.why}>{reading.health.why.join(" · ")}</span>
        <span className={styles.gap} />
        {/* JEDEN SLOT, JEDEN GLIF — w obu stanach `organization`.
            Slot klienta rysował dotąd DWA rysunki zależnie od tego, czy jest
            wypełniony: pusty niósł `organization`, wypełniony
            `relationships`. Ikona pustego stanu ma mówić, CZEGO tu nie ma
            (rejestr, wpis #52), a wtedy musi być tym samym rysunkiem, który ta
            rzecz nosi, kiedy JEST. Ujednolicone w stronę `organization`, bo
            tak stoi w prototypie (`v3/screens/record.js:441` — wypełniona
            plakietka klienta to `icon("org")`) i bo `relationships` na
            organizacji jest w tym drzewie nazwaną wadą: złamanie dwudzieste
            czwarte („point Organizations back at the relationships glyph")
            istnieje po to, żeby dwa wiersze grupy CRM nie niosły jednego
            rysunku. */}
        {client === undefined ? (
          <span className={styles.chipDashed}>
            <Icon name="organization" />
            No client
          </span>
        ) : onOpenClient === undefined ? (
          // Nothing to enter, so nothing that looks enterable. A greyed
          // control with no stated reason is a dummy.
          <span className={styles.chip}>
            <Icon name="organization" />
            <span className={styles.chipLabel}>{client.name}</span>
          </span>
        ) : (
          <button
            className={styles.chip}
            onClick={() => onOpenClient(client)}
            type="button"
          >
            <Icon name="organization" />
            <span className={styles.chipLabel}>{client.name}</span>
          </button>
        )}
        {due === undefined ? (
          <span className={styles.chipDashed}>
            <Icon name="clock" />
            No deadline
          </span>
        ) : (
          <span className={styles.due}>
            {due}
            <span aria-hidden="true" className={styles.sep}>
              ·
            </span>
            <b className={styles[`left_${tone}`]}>
              {deadlineSentence(reading)}
            </b>
          </span>
        )}
      </div>
    </header>
  );
};

/** One exit. A row with somewhere to go is a button; a row with nowhere to go
 *  is a flat row and not a disabled control — a greyed thing that never says
 *  why is a dummy, and this project names dummies as a defect of their own. */
const RailRow = ({
  icon,
  label,
  meta,
  onOpen,
}: {
  readonly icon: "relationships" | "documents";
  readonly label: string;
  readonly meta?: string | undefined;
  readonly onOpen?: (() => void) | undefined;
}) => {
  const content = (
    <>
      <Icon name={icon} />
      <span className={styles.railMain}>
        <span className={styles.railLabel}>{label}</span>
        {meta !== undefined && <span className={styles.railMeta}>{meta}</span>}
      </span>
      {onOpen !== undefined && (
        <span aria-hidden="true" className={styles.railArrow}>
          →
        </span>
      )}
    </>
  );
  // `data-rail-exit` marks an EXIT and nothing else. The section around it also
  // holds authoring controls that mention the same record by name — the detach
  // button says "Unlink Northstar" — so an assertion that counted exits by
  // reading text would count that too and report a duplicate that is not one.
  return onOpen === undefined ? (
    <div className={styles.railRow} data-rail-exit={label}>
      {content}
    </div>
  ) : (
    <button
      className={styles.railRow}
      data-rail-exit={label}
      onClick={onOpen}
      type="button"
    >
      {content}
    </button>
  );
};

/** What a source is, and whether it can still be reached. "available" is the
 *  ordinary case and says nothing worth the width; the other two are the whole
 *  reason the field exists. */
const sourceMeta = (source: EvidenceSource): string =>
  source.availability === "available"
    ? source.sourceKind
    : `${source.sourceKind} · ${source.availability.replaceAll("_", " ")}`;

/** Paragraphs, split on blank lines. Single newlines inside a paragraph are
 *  kept by the stylesheet rather than turned into more paragraphs — the text
 *  is somebody's writing, and re-flowing it is editing it. */
const paragraphsOf = (outcome: string): readonly string[] =>
  outcome
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");

/**
 * Attaching and detaching the client, which is an AUTHORING affordance on a
 * rail otherwise made only of exits.
 *
 * It is here because it had exactly one home — the context card this record
 * screen replaces — and a structural deletion that drops the only place an
 * operation can be performed is a silent regression, not a simplification. The
 * shape is the card's, kept deliberately: the caller has already resolved which
 * organizations may be offered and which hold a DIRECT link, because both are
 * kernel preconditions and this file must not learn them.
 */
export interface ProjectClientLinking {
  readonly candidates:
    readonly { readonly id: string; readonly name: string }[] | undefined;
  /** The listed clients that hold a direct link — the only ones a detach can
   *  be offered for. */
  readonly detachableIds: ReadonlySet<string>;
  readonly busy: boolean;
  readonly onLink: (organizationId: string) => void;
  readonly onUnlink: (organizationId: string) => void;
}

const ClientLinking = ({
  linking,
  clients,
}: {
  readonly linking: ProjectClientLinking;
  readonly clients: readonly ClientOrganization[];
}) => {
  const [selected, setSelected] = useState("");
  const [confirmingId, setConfirmingId] = useState<string>();
  const { busy, candidates } = linking;
  const detachable = clients.filter((client) =>
    linking.detachableIds.has(client.id),
  );
  return (
    <div className={styles.railActions}>
      {candidates === undefined ? (
        // Told apart from "there are none" on purpose: the first is a read that
        // did not land and is worth retrying, the second is a fact about the
        // Space.
        <small className={styles.railNote}>
          Could not load organizations, so no client can be linked right now.
        </small>
      ) : candidates.length === 0 ? (
        <small className={styles.railNote}>
          No organization to link in this project’s Space.
        </small>
      ) : (
        <>
          <label className="sr-only" htmlFor="project-client-link">
            Client organization to link
          </label>
          <select
            className={styles.railSelect}
            disabled={busy}
            id="project-client-link"
            onChange={(event) => setSelected(event.target.value)}
            value={selected}
          >
            <option value="">Choose a client…</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
          <button
            className={styles.railAction}
            disabled={busy || selected === ""}
            onClick={() => {
              linking.onLink(selected);
              setSelected("");
            }}
            type="button"
          >
            Link client
          </button>
        </>
      )}
      {detachable.map((organization) =>
        confirmingId === organization.id ? (
          <Fragment key={organization.id}>
            {/* The copy names the DIRECT link on purpose. `clientOrganizations`
                is a set over three reaches — opportunity, meeting, direct link
                — so a client also reached by a deal stays listed after
                detaching, and a shorter sentence would read as a broken
                button. */}
            <small className={styles.railNote}>
              Only the direct link goes. A client also reached by an opportunity
              or meeting stays listed.
            </small>
            <button
              className={styles.railDanger}
              disabled={busy}
              onClick={() => {
                setConfirmingId(undefined);
                linking.onUnlink(organization.id);
              }}
              type="button"
            >
              Confirm unlink
            </button>
            <button
              className={styles.railAction}
              disabled={busy}
              onClick={() => setConfirmingId(undefined)}
              type="button"
            >
              Cancel
            </button>
          </Fragment>
        ) : (
          <button
            className={styles.railAction}
            disabled={busy}
            key={organization.id}
            onClick={() => setConfirmingId(organization.id)}
            type="button"
          >
            {/* The name is carried only when it is needed to tell two triggers
                apart. Real client names run to "Aplikacje Krytyczne Sp. z o.o.
                (AKMF)", which wrapped this arming control onto two lines and
                made a secondary verb the heaviest thing on the rail. */}
            {detachable.length === 1
              ? "Unlink client"
              : `Unlink “${organization.name}”`}
          </button>
        ),
      )}
    </div>
  );
};

type ProjectCheckInItem = ProjectCheckInListProjection["items"][number];

const CheckInEntry = ({
  item,
  latest = false,
}: {
  readonly item: ProjectCheckInItem;
  readonly latest?: boolean;
}) => (
  <article
    className={latest ? styles.checkInLatest : styles.checkInEarlier}
    {...(latest ? { "data-latest-check-in": item.id } : {})}
  >
    <p>{item.summary}</p>
    {item.waitingOn !== undefined && <p>Waiting on: {item.waitingOn}</p>}
    {item.nextCheckpointAt !== undefined && (
      <p>Next checkpoint: {item.nextCheckpointAt.slice(0, 10)}</p>
    )}
    {item.evidenceSourceIds.length > 0 && (
      <p>Evidence: {countLabel(item.evidenceSourceIds.length, "source")}</p>
    )}
    {item.references.length > 0 && (
      <ul>
        {item.references.map((reference) => (
          <li key={`${reference.kind}:${reference.recordId}`}>
            {reference.label ?? "Reference unavailable"} · {reference.kind}
          </li>
        ))}
      </ul>
    )}
    <small>
      {item.actor?.displayName ?? "Author unavailable"} ·{" "}
      {item.createdAt.slice(0, 10)}
      {item.hostRunId === undefined ? "" : ` · ${item.hostRunId}`}
      {item.state === "voided" ? " · Voided" : ""}
      {item.supersededByCheckInId === undefined ? "" : " · Superseded"}
    </small>
  </article>
);

export interface ProjectRecordOverviewProps {
  /** The one reading of this project. Health is never recomputed here: two
   *  surfaces answering the same question twice is this repo's named repeat
   *  defect. */
  readonly reading: ProjectReading;
  readonly overview: ProjectOverviewProjection;
  readonly checkIns?: ProjectCheckInSlice;
  readonly busy?: boolean;
  readonly onAddCheckIn?: (draft: {
    readonly summary: string;
    readonly waitingOn?: string;
    readonly nextCheckpointAt?: string;
  }) => Promise<boolean>;
  readonly onReloadCheckIns?: () => void;
  readonly onOpenClient?: ((client: ClientOrganization) => void) | undefined;
  readonly onOpenSource?: ((source: EvidenceSource) => void) | undefined;
  /** Absent means this reader cannot write the outcome, and then the empty
   *  state offers no button rather than a dead one. */
  readonly onWriteOutcome?: (() => void) | undefined;
  /** Conversations and agreements reach the project the same way the client
   *  does — as exits. They were sections of the card this screen replaces, and
   *  they are on the rail rather than in a tab because neither is a collection
   *  anybody works inside. */
  readonly onOpenMeeting?: ((meetingId: string) => void) | undefined;
  readonly onOpenDecision?: ((decisionId: string) => void) | undefined;
  readonly clientLinking?: ProjectClientLinking | undefined;
  /** Replaces the READING of the outcome while somebody writes it, and nothing
   *  else on the screen. Swapping the whole Overview for a textarea would take
   *  away the health, the composition and every exit for the duration of an
   *  edit — the reader is editing one field, not leaving the record. */
  readonly outcomeEditor?: ReactNode;
  /** CIAŁO PROJEKTU — dokument bogaty, który stoi POD zamierzonym skutkiem
   *  i W TEJ SAMEJ KOLUMNIE co on. Prop istnieje, bo dokument ładuje się
   *  leniwie i jest składany w `Wave2Surfaces`, a mieszka tutaj, bo jest
   *  ciałem tekstu, nie kolejnym panelem ekranu.
   *
   *  DLACZEGO TO JEST PROP, A NIE RODZEŃSTWO SIATKI (rejestr, wpis #47).
   *  Renderowany obok `.body` dokument dostawał CAŁĄ szerokość ekranu, więc
   *  przechodził pod pas powiązań, a lewa krawędź pasa urywała się na jego
   *  górnym rogu — pas kończył się tam, gdzie kończyła się siatka. Odniesienie
   *  robi dokładnie to, co ten prop: `v3/screens/record.js:454-460` wkłada
   *  `${doc}` do `<div class="rc-doc">` WEWNĄTRZ `<div class="rc-body">`,
   *  a `.rc-rail` (`v3/screens/record.css:101`) niesie własną lewą krawędź
   *  przez całą wysokość siatki. */
  readonly body?: ReactNode;
}

export const ProjectRecordOverview = ({
  reading,
  overview,
  checkIns,
  busy = false,
  onAddCheckIn = async () => false,
  onReloadCheckIns = () => undefined,
  onOpenClient,
  onOpenSource,
  onWriteOutcome,
  onOpenMeeting,
  onOpenDecision,
  clientLinking,
  outcomeEditor,
  body,
}: ProjectRecordOverviewProps) => {
  const { buckets } = reading;
  const clients = overview.clientOrganizations;
  const sources = overview.evidenceSources;
  const meetings = overview.relatedMeetings;
  const decisions = overview.relatedDecisions;
  const visibleCheckIns: ProjectCheckInSlice = checkIns ?? {
    kind: "unavailable",
    projectId: overview.project.id,
    message: "Project check-ins are unavailable.",
  };
  const [checkInComposerOpen, setCheckInComposerOpen] = useState(false);
  const [checkInDraft, setCheckInDraft] = useState({
    summary: "",
    waitingOn: "",
    nextCheckpointDate: "",
  });
  const [checkInError, setCheckInError] = useState<string>();
  const latestCheckIn =
    visibleCheckIns.kind === "ready" &&
    visibleCheckIns.data.latestCheckInId !== undefined
      ? visibleCheckIns.data.items.find(
          (item) => item.id === visibleCheckIns.data.latestCheckInId,
        )
      : undefined;
  const historyCheckIns =
    visibleCheckIns.kind === "ready"
      ? visibleCheckIns.data.items.filter(
          (item) => item.id !== latestCheckIn?.id,
        )
      : [];
  const written =
    !overview.project.needsReview && overview.project.intendedOutcome !== "";
  return (
    <div className={styles.overview}>
      <section aria-label="Does it still fit" className={styles.fit}>
        <h2 className={styles.fitHeading}>Does it still fit</h2>
        {/* One line, read across. This is the only decision number on the
            screen; stacked in a column the parts stop being a sentence. */}
        <p className={styles.fitLine}>
          <b className={styles.fitCount}>{reading.open.length}</b> open
          <span aria-hidden="true" className={styles.sep}>
            ·
          </span>
          <b
            className={`${styles.fitStrong} ${
              styles[`left_${deadlineTone(reading)}`]
            }`}
          >
            {deadlineSentence(reading)}
          </b>
          <span aria-hidden="true" className={styles.sep}>
            ·
          </span>
          <span className={styles.fitQuiet}>
            {movedSentence(reading.idleDays)}
          </span>
        </p>
        <CompositionBar buckets={buckets} />
        {/* Horizontal, because the band is horizontal — a vertical list under
            a horizontal bar is read twice in two directions. Hidden from the
            reader who hears it, because the bar's own name already says all
            three counts, and saying them twice is not saying them clearly.
            A zero DIMS and stays: "0 closed" is information, and a row that
            vanished is a riddle. */}
        <ul aria-hidden="true" className={styles.legend}>
          {LEGEND.map(([segment, label]) => (
            <li
              className={`${styles.legendItem} ${
                buckets[segment] === 0 ? styles.legendZero : ""
              }`}
              key={segment}
            >
              <span
                className={`${styles.swatch} ${styles[`bar_${segment}`]}`}
              />
              {buckets[segment]} {label}
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.body}>
        <section aria-label="Project check-ins" className={styles.checkIns}>
          <div className={styles.checkInHeading}>
            <h2 className={styles.docHeading}>Project check-ins</h2>
            <button
              className={styles.railAction}
              disabled={busy}
              onClick={() => setCheckInComposerOpen((open) => !open)}
              type="button"
            >
              Add check-in
            </button>
          </div>
          {visibleCheckIns.kind === "loading" ? (
            <p role="status">Loading project check-ins…</p>
          ) : visibleCheckIns.kind === "unavailable" ? (
            <div role="status">
              <p>{visibleCheckIns.message}</p>
              <button
                className={styles.railAction}
                onClick={onReloadCheckIns}
                type="button"
              >
                Try again
              </button>
            </div>
          ) : visibleCheckIns.data.items.length === 0 ? (
            <p className={styles.railNote}>No check-ins yet.</p>
          ) : (
            <>
              {latestCheckIn === undefined ? (
                <p className={styles.railNote}>No active check-in.</p>
              ) : (
                <CheckInEntry item={latestCheckIn} latest />
              )}
              {historyCheckIns.length > 0 && (
                <details open={latestCheckIn === undefined}>
                  <summary>
                    {latestCheckIn === undefined
                      ? "Check-in history"
                      : "Earlier check-ins"}{" "}
                    ({historyCheckIns.length})
                  </summary>
                  {historyCheckIns.map((item) => (
                    <CheckInEntry item={item} key={item.id} />
                  ))}
                </details>
              )}
            </>
          )}
          {checkInComposerOpen && (
            <form
              className={styles.checkInComposer}
              onSubmit={(event) => {
                event.preventDefault();
                setCheckInError(undefined);
                void onAddCheckIn({
                  summary: checkInDraft.summary,
                  ...(checkInDraft.waitingOn.trim() === ""
                    ? {}
                    : { waitingOn: checkInDraft.waitingOn }),
                  ...(checkInDraft.nextCheckpointDate === ""
                    ? {}
                    : {
                        nextCheckpointAt: new Date(
                          `${checkInDraft.nextCheckpointDate}T12:00:00.000Z`,
                        ).toISOString(),
                      }),
                }).then((saved) => {
                  if (!saved) {
                    setCheckInError(
                      "The check-in was not saved. Your draft is still here.",
                    );
                    return;
                  }
                  setCheckInDraft({
                    summary: "",
                    waitingOn: "",
                    nextCheckpointDate: "",
                  });
                  setCheckInComposerOpen(false);
                });
              }}
            >
              <label>
                Summary
                <textarea
                  maxLength={4000}
                  onChange={(event) =>
                    setCheckInDraft((draft) => ({
                      ...draft,
                      summary: event.target.value,
                    }))
                  }
                  required
                  value={checkInDraft.summary}
                />
              </label>
              <label>
                Waiting or blocker
                <textarea
                  maxLength={2000}
                  onChange={(event) =>
                    setCheckInDraft((draft) => ({
                      ...draft,
                      waitingOn: event.target.value,
                    }))
                  }
                  value={checkInDraft.waitingOn}
                />
              </label>
              <label>
                Next checkpoint
                <input
                  onChange={(event) =>
                    setCheckInDraft((draft) => ({
                      ...draft,
                      nextCheckpointDate: event.target.value,
                    }))
                  }
                  type="date"
                  value={checkInDraft.nextCheckpointDate}
                />
              </label>
              {checkInError !== undefined && <p role="alert">{checkInError}</p>}
              <button
                className={styles.railAction}
                disabled={busy}
                type="submit"
              >
                Save check-in
              </button>
            </form>
          )}
        </section>
        <div className={styles.doc}>
          <h2 className={styles.docHeading}>Intended outcome</h2>
          {outcomeEditor !== undefined ? (
            outcomeEditor
          ) : written ? (
            <div className={styles.prose}>
              {paragraphsOf(overview.project.intendedOutcome).map(
                (paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ),
              )}
            </div>
          ) : (
            <div className={styles.docEmpty}>
              <p>
                <b>No intended outcome written</b>
              </p>
              {onWriteOutcome !== undefined && (
                <button
                  className={styles.docEmptyAction}
                  onClick={onWriteOutcome}
                  type="button"
                >
                  Write the intended outcome
                </button>
              )}
            </div>
          )}
          {/* Dokument projektu zamyka KOLUMNĘ tekstu, a nie ekran. */}
          {body}
        </div>

        {/* Exits, not reading matter — which is why narrow costs nothing here.
            An empty section is left out entirely: a rail answering "there is
            no exit" six times over is noise. The client is the one exception,
            because a project delivered to nobody is itself a fact. */}
        <aside
          aria-label="What this project is connected to"
          className={styles.rail}
        >
          <section className={styles.railSection}>
            <h3 className={styles.railHeading}>Client</h3>
            {clients.length === 0 ? (
              <p className={styles.railNone}>Not linked to a client</p>
            ) : (
              // The client the HEADER already names is not listed again. Seen
              // on real records: the header chip and this row carried the same
              // "Aplikacje Krytyczne Sp. z o.o. (AKMF)" a finger apart, and the
              // rail's copy was the truncated one — the same exit twice, worse
              // the second time. A project with several clients still lists the
              // rest here, which is the only case where this section is an
              // index rather than a repetition.
              clients
                .slice(1)
                .map((client) => (
                  <RailRow
                    icon="relationships"
                    key={client.id}
                    label={client.name}
                    onOpen={
                      onOpenClient === undefined
                        ? undefined
                        : () => onOpenClient(client)
                    }
                  />
                ))
            )}
            {/* Outside the list/empty branch on purpose: linking the FIRST
                client is the primary case, and that is exactly the empty
                state. */}
            {clientLinking !== undefined && (
              <ClientLinking clients={clients} linking={clientLinking} />
            )}
          </section>

          {meetings.length > 0 && (
            <section className={styles.railSection}>
              <h3 className={styles.railHeading}>Meetings</h3>
              {meetings.map((meeting) => (
                <RailRow
                  icon="relationships"
                  key={meeting.id}
                  label={meeting.title}
                  meta={meeting.triage === "ready" ? undefined : "to review"}
                  onOpen={
                    onOpenMeeting === undefined
                      ? undefined
                      : () => onOpenMeeting(meeting.id)
                  }
                />
              ))}
            </section>
          )}

          {decisions.length > 0 && (
            <section className={styles.railSection}>
              <h3 className={styles.railHeading}>Decisions</h3>
              {decisions.map((decision) => (
                <RailRow
                  icon="documents"
                  key={decision.id}
                  label={decision.title}
                  // Only the state that changes how the decision must be read
                  // is said. "Current" on every line is the default said out
                  // loud.
                  meta={decision.state === "current" ? undefined : "superseded"}
                  onOpen={
                    onOpenDecision === undefined
                      ? undefined
                      : () => onOpenDecision(decision.id)
                  }
                />
              ))}
            </section>
          )}

          {sources.length > 0 && (
            <section className={styles.railSection}>
              <h3 className={styles.railHeading}>Sources</h3>
              {sources.map((source) => (
                <RailRow
                  icon="documents"
                  key={source.id}
                  label={source.title}
                  meta={sourceMeta(source)}
                  onOpen={
                    onOpenSource === undefined
                      ? undefined
                      : () => onOpenSource(source)
                  }
                />
              ))}
            </section>
          )}

          {/* Version only. The prototype's line also said whether the record
              was imported or made here, and that reading needs `externalId`,
              which this projection does not carry — so it is left unsaid
              rather than guessed from an adjacent slice. */}
          <p className={styles.prov}>v{overview.project.version}</p>
        </aside>
      </div>
    </div>
  );
};
