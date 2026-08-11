import { useMemo, useState, type ReactNode } from "react";

import type { StrategicRecordId, TaskId } from "@constellation/contracts";

import type { Currency } from "../crm/money.js";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  createOpportunity,
  createRenewal,
  createTask,
  createWorkLink,
  readSlice,
  resolveRenewal,
  updateRenewalTerm,
  type DesktopSnapshot,
  type MutationFailure,
  type MutationResult,
} from "../client/workflow.js";
import { TopicHelp } from "../help/TopicHelp.js";
import { indexRelationships } from "../crm/organization-reading.js";
import { fmtApprox, fmtMoney, fmtUplift } from "../crm/money.js";
import { Icon } from "../components/Icon.js";
import { SurfaceTitleBand } from "../SurfaceTitleBand.js";
import {
  useListNavigation,
  type ListNavigationItemProps,
} from "../hooks/useListNavigation.js";
import {
  countLabel,
  dateKeyInZone,
  dayDistance,
  formatDate,
  instantForZonedDate,
} from "../i18n.js";
import {
  CLOSED_STATE_LABELS,
  formatDayKey,
  leadPhrase,
  readRenewals,
  type RenewalReading,
} from "./renewals-view.js";
import styles from "./renewals.module.css";

// RENEWALS. The screen answers "what do I have to start", and it answers it
// with THREE SECTIONS rather than with a sort control: the sections ARE the
// ordering, and a switch that switches nothing lies the same way the old
// Organizations filter chip did.
//
// Each row LEADS WITH THE EXPIRY DATE — `ends Sep 30 · in 65 days`. "Time to
// start" is what the screen organises by, carried by the section it stands in
// and by the lead chip beside the date. That reading was reversed once during
// the walkthrough and accepted on the third pass; the reason is that the
// decision was about what the screen organises, not about which number is
// fattest.
//
// The contract clock — "1 yr 10 mo of 2 yrs · term 3" — sits in SMALL PRINT at
// the foot of the row, because it is context for the dates rather than a thing
// to act on.
//
// WHAT THIS SCREEN DELIBERATELY DOES NOT HAVE: explanatory paragraphs (the rule
// is said at the control it governs); a `Sort: Expiry` control; and a
// bulk-select checkbox, because a renewal is not a record this list can select
// in bulk — the selectable id would be the ORGANISATION's, which is not what
// you are looking at.

const CLOSE_OUTCOMES = [
  ["renewed", "Renewed"],
  ["not_renewing", "Not renewing"],
  ["irrelevant", "No longer relevant"],
] as const;

type CloseOutcome = (typeof CLOSE_OUTCOMES)[number][0];

/**
 * The mark that leads a row. Shape first: it reads the same with no colour —
 * and now it is DRAWN rather than typed, so the shape is the product's and not
 * whichever glyph the reader's font happens to carry for `▲ ◷ ■`. The three
 * names and the section each belongs to come from the prototype
 * (`v3/screens/renewals.js:139`); the drawings come from the shell's
 * consolidated set and this file adds none.
 */
const SECTION_MARKS = {
  due: "warn",
  watching: "clock",
  closed: "check",
} as const;

type SectionKind = keyof typeof SECTION_MARKS;

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

/**
 * The money on a contract: what it is worth now, and what the next term is
 * likely to be worth.
 *
 * WHICH KIND OF NUMBER THE SECOND ONE IS, said with two DIFFERENT THINGS rather
 * than two shades of one colour. A projection is rounded, wears `≈`, names its
 * percentage and stands in a dashed outline; a real linked deal is exact, wears
 * a solid one, and carries a way to the deal — because a real offer beats a
 * projection and that has to be visible across the room.
 *
 * The deal behind the second branch is the one that RENEWS the contract. An
 * amendment sells inside the running term and never answers this question; the
 * two edges exist so that the reader picks, and this reader picks in
 * `renewals-view.ts` rather than here.
 *
 * The amounts are printed in the CONTRACT'S OWN currency and nothing here
 * converts. `homeCurrency` says which single currency a MIXED total may be
 * summed into; one contract is not a mixed total, and a conversion would need
 * a rate, which a renewal does not carry.
 */
const Outlook = ({
  reading,
  upliftPct,
  onOpenOpportunity,
}: {
  readonly reading: RenewalReading;
  readonly upliftPct: number;
  readonly onOpenOpportunity: (id: StrategicRecordId, title: string) => void;
}) => {
  const { outlook, clock, renewal } = reading;
  const current =
    renewal.value === undefined ? null : (
      <span className={styles.current} data-renewal-value>
        {clock.closed ? "was" : "now"} <b>{fmtMoney(renewal.value)}</b>
      </span>
    );
  // A closed contract has no "at renewal": the question was answered by
  // closing it, and a projection beside a contract nobody is renewing is a
  // number about a term that will not happen.
  if (clock.closed) return current;
  if (outlook.basis === "none")
    return (
      <>
        {current}
        <span className={styles.outlookNone} data-renewal-outlook="none">
          nothing to project from
        </span>
      </>
    );
  if (outlook.basis === "uplift")
    return (
      <>
        {current}
        <span className={styles.outlookAssumed} data-renewal-outlook="uplift">
          at renewal <b>{fmtApprox(outlook.amount)}</b>
          <span className={styles.basis}>{fmtUplift(upliftPct)}</span>
        </span>
      </>
    );
  return (
    <>
      {current}
      <span className={styles.outlookReal} data-renewal-outlook={outlook.basis}>
        at renewal <b>{fmtMoney(outlook.amount)}</b>
        <button
          className={styles.basisLink}
          data-renewal-deal={outlook.opportunityId ?? undefined}
          onClick={() => {
            if (reading.renewing !== undefined)
              onOpenOpportunity(reading.renewing.id, reading.renewing.title);
          }}
          type="button"
        >
          {/* The exit says where it goes with a mark of the destination and an
              arrow away from here, as the reference writes it
              (`v3/screens/renewals.js:84-85`). */}
          <Icon name="pipeline" />
          {outlook.basis === "offer" ? "from the offer" : "from the estimate"}
          <Icon name="arrow" />
        </button>
      </span>
    </>
  );
};

const RenewalRow = ({
  reading,
  section,
  index,
  itemProps,
  selected,
  timeZone,
  upliftPct,
  busy,
  message,
  onSelect,
  onOpenOpportunity,
  onOpenTask,
  onStart,
  onAmend,
  onClose,
}: {
  readonly reading: RenewalReading;
  readonly section: SectionKind;
  readonly index: number;
  readonly itemProps: (index: number) => ListNavigationItemProps;
  readonly selected: boolean;
  readonly timeZone: string | undefined;
  readonly upliftPct: number;
  readonly busy: boolean;
  readonly message: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly onOpenOpportunity: (id: StrategicRecordId, title: string) => void;
  readonly onOpenTask: (id: TaskId, title: string) => void;
  readonly onStart: (reading: RenewalReading) => void;
  readonly onAmend: (reading: RenewalReading) => void;
  readonly onClose: (reading: RenewalReading, outcome: CloseOutcome) => void;
}) => {
  const [closing, setClosing] = useState(false);
  const nav = itemProps(index);
  const { renewal, clock, followUp, term } = reading;
  const lead = leadPhrase(renewal, clock);
  const closedLabel =
    renewal.state === "watching"
      ? undefined
      : CLOSED_STATE_LABELS[renewal.state];

  // A LIST, NOT A LISTBOX, and the difference is the reason this screen exists
  // in the shape it does: the row carries real controls — `Start`, `Close` and
  // its three outcomes, `Add to contract`, the follow-up, the amendment's deal.
  // A listbox may hold only options and groups, and a focusable control inside
  // a composite widget with a roving tab stop is undefined in the accessibility
  // tree and dead to the arrow keys. People kept its one button OUTSIDE the
  // listbox for exactly this; the accepted prototype reaches the same place from
  // the other side, using `role="list"` with `aria-current` for the selection
  // (`v3/screens/renewals.js:148`, `:184`). Selection is therefore `aria-current`
  // and not `aria-selected`, which a `listitem` does not define.
  return (
    <div
      {...nav}
      aria-current={selected ? "true" : undefined}
      aria-label={reading.accessibleName}
      className={`${styles.row} ${styles[`row_${section}`]} ${selected ? styles.rowSelected : ""}`}
      data-renewal-row={renewal.id}
      onClick={() => onSelect(renewal.id)}
      role="listitem"
    >
      <span aria-hidden="true" className={styles.mark}>
        <Icon name={SECTION_MARKS[section]} />
      </span>
      <div className={styles.main}>
        <div className={styles.top}>
          <span className={styles.client}>
            {reading.organization?.name ?? "Unknown client"}
          </span>
          <span className={styles.title}>{renewal.title}</span>
          <span className={styles.scope}>{renewal.scope}</span>
          {closedLabel !== undefined && (
            <span
              className={`${styles.state} ${styles[`state_${renewal.state}`]}`}
              data-renewal-state={renewal.state}
            >
              {closedLabel}
            </span>
          )}
          {reading.mainContact !== undefined && (
            <span
              aria-label={`Main contact: ${reading.mainContact.name}`}
              className={styles.contact}
              role="img"
            >
              <Initials name={reading.mainContact.name} />
            </span>
          )}
        </div>

        {/* THE DATES LEAD. The lead window stands beside them because it is
            what says whether the date is already your problem. */}
        <div className={styles.dates} data-renewal-dates>
          <b>
            {clock.closed ? "ended" : "ends"}{" "}
            {formatDate(renewal.expiresAt, timeZone)}
          </b>
          <span aria-hidden="true" className={styles.dot}>
            ·
          </span>
          <span className={styles.relative}>
            {dayDistance(clock.daysLeft, "elapsed")}
          </span>
          {lead !== undefined && (
            <span
              className={`${styles.lead} ${lead.open ? styles.leadOpen : ""}`}
              data-renewal-lead={lead.open ? "open" : "waiting"}
            >
              {/* Drawn, not typed, for the same reason as the row mark, and
                  picked the same way the prototype picks it
                  (`v3/screens/renewals.js:59-61`): a clock while the window is
                  still ahead, a warning once it has opened. The colour on
                  `.leadOpen` reinforces what the glyph and the words already
                  say. */}
              <Icon name={lead.open ? "warn" : "clock"} />
              {lead.text}
            </span>
          )}
        </div>

        <div className={styles.money}>
          <Outlook
            onOpenOpportunity={onOpenOpportunity}
            reading={reading}
            upliftPct={upliftPct}
          />
        </div>

        {/* The follow-up, and its state with it: "started but blocked for six
            days" is not the same claim as "started". */}
        {!clock.closed && (
          <div className={styles.line}>
            {followUp.kind === "none" ? (
              <>
                <span className={styles.followNone} data-renewal-follow="none">
                  <Icon name="flag" /> nobody has started this
                </span>
                <button
                  className={styles.action}
                  disabled={busy}
                  onClick={() => onStart(reading)}
                  type="button"
                >
                  {/* `capture` IS the prototype's plus, to within a quarter of a
                      unit — `components/Icon.tsx` says so where the set is
                      declared, and a second entry for the same cross would be one
                      drawing paid for twice on the hot path. */}
                  <Icon name="capture" />
                  Start
                </button>
              </>
            ) : followUp.kind === "detached" ? (
              <span
                className={styles.followNone}
                data-renewal-follow="detached"
              >
                {/* AN APP-ONLY STATE TAKING THE NEIGHBOURING GLYPH BY ANALOGY,
                    said out loud because the reference does not draw it: a
                    follow-up outside `task.list`'s page is, to this reader, the
                    same family as one nobody started — "no follow-up you can
                    see" — so it wears the same mark as the branch above rather
                    than inventing a second one. */}
                <Icon name="flag" /> its follow-up task is not on this page
              </span>
            ) : (
              <button
                className={styles.follow}
                data-renewal-follow="task"
                onClick={() =>
                  onOpenTask(followUp.task.id, followUp.task.title)
                }
                type="button"
              >
                {/* Opens with what it is and closes with where it goes, exactly
                    as the reference builds this control
                    (`v3/screens/renewals.js:100-104`). */}
                <Icon name="list" />
                <span className={styles.clip}>{followUp.task.title}</span>
                <span className={styles.tag}>{followUp.task.status.label}</span>
                {followUp.lateDays !== undefined && (
                  <span className={`${styles.tag} ${styles.tagLate}`}>
                    {/* `lateDays` counts days ALREADY late, so it is positive;
                        the lead voice reads a deadline signed the other way. */}
                    {dayDistance(-followUp.lateDays, "lead")}
                  </span>
                )}
                <Icon name="arrow" />
              </button>
            )}
          </div>
        )}

        {reading.amendments.map((amendment) => (
          <div
            className={styles.amendment}
            data-renewal-amendment={amendment.opportunity.id}
            key={amendment.opportunity.id}
          >
            <Icon name="check" />
            <span className={styles.clip}>{amendment.opportunity.title}</span>
            <span className={styles.when}>
              {formatDate(amendment.at, timeZone)}
            </span>
            <button
              className={styles.basisLink}
              onClick={() =>
                onOpenOpportunity(
                  amendment.opportunity.id,
                  amendment.opportunity.title,
                )
              }
              type="button"
            >
              <Icon name="pipeline" />
              the opportunity
              <Icon name="arrow" />
            </button>
          </div>
        ))}

        <div className={styles.foot}>
          {term !== undefined && (
            <>
              <span className={styles.term} data-renewal-term>
                {term.label}
              </span>
              <span
                aria-label={`${term.label}, ${term.percent}% of the term elapsed`}
                className={styles.bar}
                role="img"
              >
                <i style={{ width: `${term.percent}%` }} />
              </span>
              {term.cycleOrdinal !== undefined && (
                <span className={styles.cycle}>term {term.cycleOrdinal}</span>
              )}
            </>
          )}
          <span className={styles.spacer} />
          {clock.canAmend && (
            <>
              <button
                className={styles.action}
                disabled={busy}
                onClick={() => onAmend(reading)}
                type="button"
              >
                <Icon name="capture" />
                Add to contract
              </button>
              {/* The rule stands AT the control it governs, which is the only
                  place it is needed. The topic behind the `?` answers what the
                  hint raises rather than repeating it: the row already says the
                  term does not move, and the topic says what IS created. */}
              <span className={styles.hint}>no change to the term</span>
              <TopicHelp topic="amendment" />
            </>
          )}
          {/* The toggle STAYS, so `aria-expanded` can be true as well as false.
              A control that announces "collapsed" and then disappears tells a
              reader less than one that says nothing. */}
          {!clock.closed && (
            <span className={styles.closeGroup}>
              <button
                aria-expanded={closing}
                className={styles.action}
                onClick={() => setClosing((open) => !open)}
                type="button"
              >
                Close
              </button>
              {closing && (
                <span
                  aria-label={`How ${renewal.title} ended`}
                  className={styles.closeGroup}
                  data-renewal-close
                  role="group"
                >
                  {CLOSE_OUTCOMES.map(([outcome, label]) => (
                    <button
                      className={styles.action}
                      disabled={busy}
                      key={outcome}
                      onClick={() => onClose(reading, outcome)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </span>
              )}
            </span>
          )}
        </div>

        {/* The refusal a person can act on, beside the control that produced
            it. `resolveRenewal` completes the follow-up task in the same
            transaction, so it needs the task's version — and a task outside
            `task.list`'s 100-row page has none to give. The wrapper says so
            instead of sending an envelope the kernel is certain to refuse, and
            this is where it gets said. */}
        {message !== undefined && (
          <p className={styles.rowMessage} data-renewal-message role="status">
            {message}
          </p>
        )}
      </div>
    </div>
  );
};

export const RenewalsSurface = ({
  client,
  snapshot,
  selectedRecordId,
  onSelectRecord,
  onOpenOrganization,
  onOpenOpportunity,
  onOpenTask,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly selectedRecordId: string | undefined;
  readonly onSelectRecord: (id: string) => void;
  readonly onOpenOrganization: (id: StrategicRecordId, name: string) => void;
  readonly onOpenOpportunity: (id: StrategicRecordId, title: string) => void;
  readonly onOpenTask: (id: TaskId, title: string) => void;
  readonly onReload: () => Promise<void> | void;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const [showClosed, setShowClosed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [amending, setAmending] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [rowMessage, setRowMessage] = useState<{
    readonly id: string;
    readonly message: string;
  }>();
  const [draft, setDraft] = useState({
    organizationId: "",
    title: "",
    scope: "",
    expiresAt: "",
    // Major units, as typed. Empty means nobody put a number on this contract,
    // which is a state and not a zero.
    value: "",
    currency: "",
  });
  const [amendment, setAmendment] = useState({
    title: "",
    need: "",
    nextAction: "",
  });

  const timeZone = snapshot.bootstrap.workspace.timezone;
  // Every commercial number comes from the workspace's own settings, which the
  // projection guarantees: `commercialDefaults` is REQUIRED, so there is no
  // fallback here and no second copy of a default that would go stale the day
  // Settings moves.
  const commercial = snapshot.bootstrap.workspace.commercialDefaults;
  const upliftPct = commercial.upliftPct;
  // The picker offers exactly what the workspace records money in — no
  // hand-written union, which is the `restated-shape-drift` family this repo
  // has been bitten by three times, and money is where the drift produces a
  // plausible number rather than an error.
  //
  // KNOWN GAP, named in #189 and handled rather than assumed: nothing enforces
  // `homeCurrency` ∈ `currencies`. Preselecting a home currency the list does
  // not offer would leave the control showing the FIRST option while the state
  // says another — a silent currency swap on a number about money. So the
  // preselection falls back to what is actually offered.
  const currencies = commercial.currencies;
  const defaultCurrency = currencies.includes(commercial.homeCurrency)
    ? commercial.homeCurrency
    : currencies[0];
  const relationships = readSlice(snapshot.relationships);
  const records = relationships.available ? relationships.data.records : [];

  const index = useMemo(() => indexRelationships(records), [records]);
  const sections = useMemo(
    () =>
      readRenewals(records, index, snapshot.tasks, upliftPct, {
        timeZone,
        todayKey: dateKeyInZone(new Date(), timeZone),
      }),
    [records, index, snapshot.tasks, upliftPct, timeZone],
  );

  const ordered = useMemo(
    () => [
      ...sections.due,
      ...sections.watching,
      ...(showClosed ? sections.closed : []),
    ],
    [sections, showClosed],
  );

  const openClient = (reading: RenewalReading) => {
    if (reading.organization !== undefined)
      onOpenOrganization(reading.organization.id, reading.organization.name);
  };

  const itemProps = useListNavigation({
    itemCount: ordered.length,
    onOpen: (position) => {
      const reading = ordered[position];
      if (reading !== undefined) openClient(reading);
    },
    onSelect: (position) => {
      const reading = ordered[position];
      if (reading !== undefined) onSelectRecord(reading.renewal.id);
    },
  });

  const after = async (
    reading: RenewalReading,
    result: MutationResult<unknown>,
  ) => {
    setBusy(false);
    if (result.kind === "success") {
      setRowMessage(undefined);
      await onReload();
      return;
    }
    // The reason travels to the row that produced it. A toast is where a
    // refusal about ONE contract goes to be missed, and this one names a state
    // of that contract rather than a transport failure.
    setRowMessage({ id: reading.renewal.id, message: result.message });
    onFailure(result);
  };

  const close = (reading: RenewalReading, outcome: CloseOutcome) => {
    if (client === undefined) return;
    setBusy(true);
    void resolveRenewal(client, snapshot, reading.renewal, outcome).then(
      (result) => after(reading, result),
    );
  };

  const start = (reading: RenewalReading) => {
    if (client === undefined) return;
    setBusy(true);
    void createTask(client, snapshot, {
      title: `Renewal: ${reading.renewal.title}`,
      nextAction: "Agree the scope of the next term with the client.",
    }).then(async (created) => {
      if (created.kind !== "success") {
        await after(reading, created);
        return;
      }
      // Two commands, and the second is what makes the first mean anything: a
      // task nobody attached is a task in the list with no contract behind it.
      // If the attach fails the task stays and the row says so, which is a
      // state somebody can fix — a silent rollback is not available here.
      const attached = await updateRenewalTerm(
        client,
        snapshot,
        reading.renewal,
        { followUpTaskId: created.data.taskId },
      );
      await after(reading, attached);
    });
  };

  const amend = (reading: RenewalReading) => {
    if (client === undefined || reading.organization === undefined) return;
    setBusy(true);
    void createOpportunity(client, snapshot, {
      organizationId: reading.organization.id,
      title: amendment.title.trim(),
      need: amendment.need.trim(),
      nextAction: amendment.nextAction.trim(),
    }).then(async (created) => {
      if (created.kind !== "success") {
        await after(reading, created);
        return;
      }
      // The amendment IS the edge. An opportunity created and not linked is an
      // ordinary deal at that client, which is a different thing from a change
      // to this contract — so the link failing has to be visible.
      const linked = await createWorkLink(
        client,
        snapshot,
        reading.renewal.spaceId,
        "opportunity_amends_renewal",
        created.data.recordId,
        reading.renewal.id,
      );
      setAmending(undefined);
      setAmendment({ title: "", need: "", nextAction: "" });
      await after(reading, linked);
    });
  };

  const submitRenewal = () => {
    if (client === undefined) return;
    // A date input answers a WALL-CLOCK day in the workspace's calendar, and a
    // contract expires at the end of the day somebody picked. Stamping midnight
    // UTC lands on the previous local day in every workspace west of Greenwich,
    // and then every number on the row is one off from the date on the form.
    const expiresAt = instantForZonedDate(draft.expiresAt, timeZone, "end");
    if (expiresAt === undefined) return;
    // Minor units, integer, and rounded ONCE at the boundary — every amount in
    // this product is an integer of the minor unit precisely so that money
    // never travels as a float. A blank field stays absent: nobody having put
    // a number on a contract is not the same as the contract being worth zero.
    const typed = draft.value.trim();
    const currency = draft.currency === "" ? defaultCurrency : draft.currency;
    const value =
      typed === "" || currency === undefined
        ? undefined
        : {
            amountMinor: Math.round(Number(typed) * 100),
            currency: currency as Currency,
          };
    if (typed !== "" && !Number.isFinite(Number(typed))) return;
    setBusy(true);
    void createRenewal(client, snapshot, {
      organizationId: draft.organizationId as StrategicRecordId,
      title: draft.title.trim(),
      scope: draft.scope.trim(),
      expiresAt,
      evidenceSourceIds: [],
      ...(value === undefined ? {} : { value }),
      // The state four of five real contracts sit in, and the one the screen
      // has a first-class row for. A renewal created with a task nobody wrote
      // would arrive already claiming somebody started it.
      startFollowUp: false,
    }).then(async (result) => {
      setBusy(false);
      if (result.kind === "success") {
        setCreating(false);
        setDraft({
          organizationId: "",
          title: "",
          scope: "",
          expiresAt: "",
          value: "",
          currency: "",
        });
        await onReload();
      } else onFailure(result);
    });
  };

  const header = (action?: ReactNode) => (
    <SurfaceTitleBand action={action} title="Renewals" />
  );

  if (!relationships.available)
    return (
      <div
        className={`surface-scroll ${styles.renewals}`}
        data-renewals-surface
      >
        {header()}
        <section className={styles.emptyState} role="status">
          <div>
            <h2>Renewals are unavailable</h2>
            {/* The slice's own reason. The three section headings do NOT render
                behind this: an empty "Time to start" is an answer computed from
                the watching set, and printing it over a failed read would say
                "nothing to do" when the truth is "nothing could be asked". */}
            <p data-renewals-unavailable>{relationships.message}</p>
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

  const renderRows = (
    readings: readonly RenewalReading[],
    section: SectionKind,
    base: number,
    label: string,
  ) => (
    <div aria-label={label} className={styles.list} role="list">
      {readings.map((reading, offset) => (
        <RenewalRow
          busy={busy}
          index={base + offset}
          itemProps={itemProps}
          key={reading.renewal.id}
          message={
            rowMessage?.id === reading.renewal.id
              ? rowMessage.message
              : undefined
          }
          onAmend={(target) => setAmending(target.renewal.id)}
          onClose={close}
          onOpenOpportunity={onOpenOpportunity}
          onOpenTask={onOpenTask}
          onSelect={onSelectRecord}
          onStart={start}
          reading={reading}
          section={section}
          selected={reading.renewal.id === selectedRecordId}
          timeZone={timeZone}
          upliftPct={upliftPct}
        />
      ))}
    </div>
  );

  const amendTarget = ordered.find(
    (reading) => reading.renewal.id === amending,
  );

  return (
    <div className={`surface-scroll ${styles.renewals}`} data-renewals-surface>
      {header(
        /* POSITION 6 — THE SCREEN'S OWN ACTION IS PAINTED AS THE PRIMARY ONE.
           This is ruling R2, taken once for five surfaces and not decided here:
           the reference gives this control `.btn.primary`
           (`v3/screens/renewals.js:217`, painted at `v3/app.css:321-332`), and
           `.ui-craft/tokens.md` "Accent rule" job 2 licenses exactly one primary
           action per container that owns one.

           IT IS A TOGGLE, SO IT DEMOTES ITSELF — AND THE RULE DOES NOT MAKE IT.
           Corrected 2026-08-11 after review: what "Usage constraints" 3 forbids
           by counting is two accent fills inside ONE CONTAINER, not two in one
           view. The rule was rewritten on 2026-08-07 precisely to stop saying
           "one per view" (`.ui-craft/tokens.md`: "one per container that owns a
           main action, not one per view"). Checked rather than assumed: the
           create form is a SIBLING of the band, its own element below in this
           file, so the contract licenses both fills outright.

           It stays as a choice about MEANING: once the form is on screen the
           thing to press is inside it, and this button only closes it again.
           That is a deliberate divergence from the prototype, whose
           `crumbbar(crumbs, actions)` (`v3/app.js:677-683`) has no state in
           which the band action goes grey. The same paragraph stands on People,
           Organizations and Pipeline.

           PHASE C, LOT C2 — THE BAR IT STOOD IN IS GONE, AND THE ACTION MOVED
           INTO THE TITLE BAND. The prototype does not stack a title band and an
           action bar: `crumbbar(crumbs, actions)` (`v3/app.js:677-683`) is ONE
           band carrying the screen's name and its action, with the action pushed
           to the end by `.crumbbar .spacer { flex: 1 }` (`v3/app.css:293`).
           Measured before the fix (`dowody/c2-czerwien-poziom.txt`): 74.1 px
           below the title row against a tolerance of 18, and 986.2 px short of
           the band's end against a tolerance of 16. */
        <button
          aria-expanded={creating}
          className={creating ? "secondary-button" : "primary-button"}
          onClick={() => setCreating((open) => !open)}
          type="button"
        >
          <Icon name="capture" />
          New renewal
        </button>,
      )}
      {/* POSITION 7 — the reading of the list stands in its own band, under the
          row that acts on it (`v3/app.css:295-301`,
          `v3/screens/renewals.js:218-221`). */}
      <div className={`view-band ${styles.viewbar}`}>
        <span aria-live="polite" className={styles.count} role="status">
          {`${countLabel(sections.openCount, "contract")} open · ${sections.closed.length} closed this cycle`}
        </span>
      </div>

      {creating && (
        <form
          aria-label="New renewal"
          className={styles.create}
          onSubmit={(event) => {
            event.preventDefault();
            submitRenewal();
          }}
        >
          <label className={styles.field}>
            Client
            <select
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  organizationId: event.target.value,
                }))
              }
              required
              value={draft.organizationId}
            >
              <option value="">Choose a client</option>
              {index.organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Contract
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              required
              value={draft.title}
            />
          </label>
          <label className={styles.field}>
            Scope
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  scope: event.target.value,
                }))
              }
              required
              value={draft.scope}
            />
          </label>
          <label className={styles.field}>
            Expires
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  expiresAt: event.target.value,
                }))
              }
              required
              type="date"
              value={draft.expiresAt}
            />
          </label>
          {/* What the contract is worth per term. It is the number the NEXT
              term is projected from, so without it the row can only say
              "nothing to project from" — and until this field existed there
              was no way to put one on a contract from the product at all. */}
          <label className={styles.field}>
            Worth per term
            <input
              inputMode="decimal"
              // The command bounds the amount to non-negative
              // (`MoneyInputSchema`), so the control refuses a negative here
              // rather than letting it travel and come back as a toast about a
              // rejected command. `step` admits the minor unit: the row prints
              // whole major units, but a contract may be worth 195 000,50.
              min={0}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  value: event.target.value,
                }))
              }
              step="0.01"
              type="number"
              value={draft.value}
            />
          </label>
          <label className={styles.field}>
            Currency
            <select
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  currency: event.target.value,
                }))
              }
              value={
                draft.currency === "" ? (defaultCurrency ?? "") : draft.currency
              }
            >
              {currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary-button"
            disabled={
              busy ||
              draft.organizationId === "" ||
              draft.title.trim() === "" ||
              draft.scope.trim() === "" ||
              draft.expiresAt === ""
            }
            type="submit"
          >
            {busy ? "Adding…" : "Add contract"}
          </button>
        </form>
      )}

      {amendTarget !== undefined && (
        <form
          // The form NAMES the contract it will write to. It opens above the
          // sections rather than inside the row, so with more than one contract
          // under watch an unnamed form is a form pointing at whichever one you
          // last pressed — and it writes a sale.
          aria-label={`Add to ${amendTarget.renewal.title}`}
          className={styles.create}
          onSubmit={(event) => {
            event.preventDefault();
            amend(amendTarget);
          }}
        >
          <p className={styles.formTitle}>
            Add to <b>{amendTarget.renewal.title}</b>
            {amendTarget.organization === undefined
              ? ""
              : ` · ${amendTarget.organization.name}`}
          </p>
          <label className={styles.field}>
            What is being added
            <input
              onChange={(event) =>
                setAmendment((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              required
              value={amendment.title}
            />
          </label>
          <label className={styles.field}>
            Why
            <input
              onChange={(event) =>
                setAmendment((current) => ({
                  ...current,
                  need: event.target.value,
                }))
              }
              required
              value={amendment.need}
            />
          </label>
          <label className={styles.field}>
            Next step
            <input
              onChange={(event) =>
                setAmendment((current) => ({
                  ...current,
                  nextAction: event.target.value,
                }))
              }
              required
              value={amendment.nextAction}
            />
          </label>
          <button
            className="primary-button"
            disabled={
              busy ||
              amendment.title.trim() === "" ||
              amendment.need.trim() === "" ||
              amendment.nextAction.trim() === ""
            }
            type="submit"
          >
            {busy ? "Opening…" : "Open the amendment"}
          </button>
          <button
            className="secondary-button"
            onClick={() => setAmending(undefined)}
            type="button"
          >
            Cancel
          </button>
        </form>
      )}

      <section className={styles.section} data-renewal-section="due">
        <div className={styles.sectionHead}>
          <h2>
            Time to start{" "}
            <span className={styles.n}>{sections.due.length}</span>
          </h2>
          {/* The section, not the expiry date, organises this screen — so the
              question "what is a lead time" belongs at the section heading and
              nowhere else (#35). */}
          <TopicHelp topic="lead-time" />
        </div>
        {sections.due.length === 0 ? (
          // AN ANSWER, NOT AN ABSENCE. Both numbers below are computed from the
          // watching set, which is why this can be said at all.
          <div
            className={styles.computedEmpty}
            data-renewal-empty
            role="status"
          >
            <p>
              <b>No contract has entered its lead time.</b>
            </p>
            <p className={styles.sub}>
              {sections.nextLead === undefined
                ? "Nothing is being watched."
                : `${countLabel(sections.watching.length, "contract")} under watch — the nearest lead opens ${dayDistance(sections.nextLead.days, "elapsed")}, on ${formatDayKey(sections.nextLead.onDayKey)}.`}
            </p>
          </div>
        ) : (
          renderRows(sections.due, "due", 0, "Time to start")
        )}
      </section>

      <section className={styles.section} data-renewal-section="watching">
        <div className={styles.sectionHead}>
          <h2>
            Watching{" "}
            <span className={styles.n}>{sections.watching.length}</span>
          </h2>
        </div>
        {sections.watching.length === 0 ? (
          <p className={styles.none}>Nothing is waiting for its lead time.</p>
        ) : (
          renderRows(
            sections.watching,
            "watching",
            sections.due.length,
            "Watching",
          )
        )}
      </section>

      <section className={styles.section} data-renewal-section="closed">
        <div className={styles.sectionHead}>
          <h2>
            Closed this cycle{" "}
            <span className={styles.n}>{sections.closed.length}</span>
          </h2>
          <button
            aria-expanded={showClosed}
            className={styles.more}
            onClick={() => setShowClosed((open) => !open)}
            type="button"
          >
            {showClosed ? "Hide" : "Show"}
            {/* The state the button announces is now also a state the button
                SHOWS: the chevron turns on `aria-expanded="true"`
                (`v3/screens/renewals.css:31-32`,
                `v3/screens/renewals.js:237-238`). */}
            <Icon name="chevron-down" />
          </button>
        </div>
        {showClosed &&
          (sections.closed.length === 0 ? (
            <p className={styles.none}>Nothing has closed this cycle.</p>
          ) : (
            renderRows(
              sections.closed,
              "closed",
              sections.due.length + sections.watching.length,
              "Closed this cycle",
            )
          ))}
      </section>
    </div>
  );
};
