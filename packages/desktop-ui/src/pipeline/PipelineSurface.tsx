import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import type {
  PipelineStage,
  StrategicRecordId,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import { TopicHelp } from "../help/TopicHelp.js";
import {
  fmtApprox,
  fmtMargin,
  fmtMarkup,
  fmtMoney,
  type Currency,
  type Money,
} from "../crm/money.js";
import { readMoneySettings } from "../crm/money-settings.js";
import {
  fmtTotals,
  indexRelationships,
  type OrganizationRecord,
} from "../crm/organization-reading.js";
import {
  createOpportunity,
  readSlice,
  updateOffer,
  updateOpportunity,
  type DesktopSnapshot,
  type MutationFailure,
} from "../client/workflow.js";
import { Icon } from "../components/Icon.js";
import { SurfaceTitleBand } from "../SurfaceTitleBand.js";
import {
  useListNavigation,
  type ListNavigationItemProps,
} from "../hooks/useListNavigation.js";
import { countLabel, dateKeyInZone, formatDate } from "../i18n.js";
import {
  boardCards,
  conversionNote,
  missingMarginNote,
  missingPriceNote,
  readBoard,
  OFFER_STATE_LABELS,
  type PipelineCard,
  type PipelineColumn,
} from "./pipeline-view.js";
import styles from "./pipeline.module.css";

// The board, and the money that does not lie.
//
// Two questions at once: where every conversation stands, and how much of it is
// left. The second is the one that decides the shape of a card — cost is the
// anchor, price is derived from it, and what is left is the difference of the
// two numbers printed directly above it.
//
// NOTHING ON THIS SCREEN CARRIES A `title=`. A native tooltip does not exist for
// a keyboard or for touch, so an explanation living in one does not exist for
// part of the audience. Everything the accepted prototype put in a tooltip is
// either visible text here or a help topic recorded for the help lot.
//
// EVERY CONTROL LIVES OUTSIDE THE LISTBOX. The board has exactly one Tab stop,
// numbered across all columns in DOM order; a button inside a card would add one
// per card and would sit in a place the accessibility tree does not define — a
// composite widget with a roving tab stop has options in it, not controls. So
// moving a deal and confirming its price both happen in a panel that stands
// above the board, on the deal the board has selected.

const MOVE_HINT_KEY = "m";

/**
 * One frame later — and where there are no frames, now.
 *
 * A browser snapshots the drag image FROM THE SOURCE NODE once the `dragstart`
 * handler has returned, so a card that goes translucent inside that handler
 * hands the cursor a translucent ghost. The prototype does not hit this because
 * it builds a ghost element of its own (`v3/app.js:2290-2297`); this screen uses
 * the native one, so the dimming waits a frame.
 *
 * The fallback is not defensive dressing: the interaction tests drive `dragstart`
 * through `dispatchEvent` in an environment with no compositor, and a deferral
 * that never runs there would make the state untestable.
 */
const nextFrame = (run: () => void) => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else run();
};

const priceMinorFromMajor = (text: string): number | undefined => {
  const trimmed = text.trim().replace(/\s/gu, "");
  if (!/^\d+([.,]\d{1,2})?$/u.test(trimmed)) return undefined;
  const [major, minor = ""] = trimmed.replace(",", ".").split(".");
  return Number(major) * 100 + Number(minor.padEnd(2, "0"));
};

const ClientLink = ({
  organization,
  onOpen,
}: {
  readonly organization: OrganizationRecord;
  readonly onOpen: (id: StrategicRecordId, name: string) => void;
}) => (
  <button
    className={styles.dealPanelLink}
    onClick={() => onOpen(organization.id, organization.name)}
    type="button"
  >
    {organization.name}
  </button>
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

/** One named row of the offer sheet: `cost`, `price`, `leaves`. The label is
 *  always there, because an amount with no name on a CRM card reads as the value
 *  of the deal — and that is very often a different number. */
const QuoteRow = ({
  term,
  children,
  badge,
  note,
}: {
  readonly term: string;
  readonly children: ReactNode;
  readonly badge?: ReactNode;
  readonly note?: string | undefined;
}) => (
  <div className={styles.quoteRow}>
    <dt className={styles.quoteTerm}>{term}</dt>
    <dd className={styles.quoteValue}>
      <span className={styles.quoteAmount}>{children}</span>
      {badge}
      {note !== undefined && <span className={styles.quoteNote}>{note}</span>}
    </dd>
  </div>
);

const OfferSheet = ({
  card,
  markupPct,
  homeCurrency,
  timeZone,
}: {
  readonly card: PipelineCard;
  readonly markupPct: number;
  readonly homeCurrency: Currency;
  readonly timeZone: string | undefined;
}) => {
  const reading = card.offer;
  if (reading === undefined) return null;
  const head = (
    <div className={styles.offerHead}>
      <span className={styles.offerState}>
        {`Offer · ${OFFER_STATE_LABELS[reading.offer.state]}`}
      </span>
      {reading.versions > 1 && (
        <span className={styles.offerVersions}>
          {countLabel(reading.versions, "version")}
        </span>
      )}
    </div>
  );

  // Waiting for the distributor's quote is a STATE OF WORK, not missing data,
  // and the first number that will arrive is the cost. A zero here would be a
  // lie about what the conversation is worth.
  if (reading.offer.cost === undefined && reading.price.basis !== "confirmed")
    return (
      <div className={`${styles.offer} ${styles.offerWaiting}`}>
        {head}
        <p className={styles.waiting} data-offer-waiting>
          {/* `v3/screens/pipeline.css:186-194` draws this note with a warning
              mark in a lane of its own. The mark repeats what the amber and the
              dashed edge already say; the sentence is what carries it. */}
          <Icon name="warn" />
          <span className={styles.waitingText}>
            {`No cost from distribution yet — ${reading.offer.nextAction}`}
          </span>
        </p>
      </div>
    );

  const cost = reading.offer.cost;
  const rate = reading.offer.rate;
  const margin = reading.margin;
  return (
    <div className={styles.offer}>
      {head}
      <dl className={styles.quote}>
        <QuoteRow
          note={conversionNote(reading, { homeCurrency }, timeZone)}
          term="cost"
        >
          {cost === undefined ? (
            "not quoted yet"
          ) : reading.home !== null &&
            rate !== undefined &&
            reading.converted ? (
            // The rate stands between the two amounts it relates, so the
            // conversion can be checked by eye rather than believed.
            <>
              {`${fmtMoney(cost)} × ${(rate.rateMicros / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 2 })} = `}
              <b>{fmtMoney(reading.home)}</b>
            </>
          ) : (
            <b>{fmtMoney(cost)}</b>
          )}
        </QuoteRow>
        {reading.price.basis === "confirmed" ? (
          <QuoteRow
            badge={
              <span className={`${styles.basis} ${styles.basisOffer}`}>
                confirmed
              </span>
            }
            term="price"
          >
            <b>{fmtMoney(reading.price.amount)}</b>
          </QuoteRow>
        ) : reading.price.basis === "derived" ? (
          <QuoteRow
            badge={
              // The markup FROM SETTINGS, never one back-computed from the
              // rounded price: rounding moves the price, so the implied markup
              // is not the number the workspace is configured with.
              <span className={`${styles.basis} ${styles.basisDerived}`}>
                {`derived · ${fmtMarkup(markupPct)}`}
              </span>
            }
            term="price"
          >
            <b>{fmtApprox(reading.price.amount)}</b>
          </QuoteRow>
        ) : (
          <QuoteRow note={missingPriceNote(reading)} term="price">
            not known yet
          </QuoteRow>
        )}
        {margin === null ? (
          <QuoteRow note={missingMarginNote(reading)} term="leaves">
            not known yet
          </QuoteRow>
        ) : margin.assumed ? (
          <QuoteRow
            badge={
              <span className={styles.assumed}>assumed, not measured</span>
            }
            term="leaves"
          >
            {/* EXACT under the `≈`. It is the difference of the two amounts
                printed above it, and rounding it a second time would make the
                three numbers stop subtracting. */}
            <b>{fmtApprox(margin.amount)}</b>
          </QuoteRow>
        ) : (
          <QuoteRow
            badge={
              <span className={styles.percent}>
                {fmtMargin(margin.marginPct)}
              </span>
            }
            term="leaves"
          >
            <b>{fmtMoney(margin.amount)}</b>
          </QuoteRow>
        )}
      </dl>
    </div>
  );
};

const DealCard = ({
  card,
  index,
  itemProps,
  selected,
  markupPct,
  homeCurrency,
  timeZone,
  onSelect,
  onOpen,
  onMoveRequest,
  onDragStart,
  onDragEnd,
}: {
  readonly card: PipelineCard;
  readonly index: number;
  readonly itemProps: (index: number) => ListNavigationItemProps;
  readonly selected: boolean;
  readonly markupPct: number;
  readonly homeCurrency: Currency;
  readonly timeZone: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly onOpen: (card: PipelineCard) => void;
  readonly onMoveRequest: (card: PipelineCard) => void;
  readonly onDragStart: (card: PipelineCard) => void;
  readonly onDragEnd: () => void;
}) => {
  const nav = itemProps(index);
  return (
    <article
      {...nav}
      aria-label={card.accessibleName}
      aria-selected={selected}
      className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
      data-pipeline-card={card.opportunity.id}
      draggable
      onClick={() => onSelect(card.opportunity.id)}
      onDoubleClick={() => onOpen(card)}
      // THE STATE OF A DRAG LIVES ON THE DOM, NOT IN REACT. `dragover` fires
      // tens of times a second while a card is over a column, and a state
      // update on that signal would re-render every card on the board for every
      // one of them. The card marks itself; the column below marks itself; the
      // stylesheet reads both as attributes.
      onDragEnd={(event: ReactDragEvent<HTMLElement>) => {
        event.currentTarget.removeAttribute("data-dragging");
        // A drag abandoned outside the board — Escape, or a drop on nothing —
        // fires ONLY here. Without this the accent stayed on the last column
        // the cursor crossed until somebody dropped something.
        onDragEnd();
      }}
      onDragStart={(event: ReactDragEvent<HTMLElement>) => {
        onDragStart(card);
        const node = event.currentTarget;
        nextFrame(() => {
          node.setAttribute("data-dragging", "");
        });
      }}
      onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
        // `M` moves the deal, and it is handled here rather than in the shared
        // list hook because it is this screen's gesture. The same
        // target-is-the-row gate the hook uses applies: a key pressed inside a
        // control that happens to sit in a row is that control's key.
        if (
          event.target === event.currentTarget &&
          event.key.toLowerCase() === MOVE_HINT_KEY
        ) {
          event.preventDefault();
          onMoveRequest(card);
          return;
        }
        nav.onKeyDown(event);
      }}
      role="option"
    >
      <span className={styles.client}>
        {card.organization?.name ?? "No client recorded"}
      </span>
      {/* Wraps and clamps rather than ellipsizing on one line: a truncated deal
          title is indistinguishable from another deal at the same client. */}
      <span className={styles.title}>{card.opportunity.title}</span>
      <span className={styles.value} data-price-basis={card.valueBasis}>
        {card.value === null ? (
          <>
            <span className={styles.amountNone}>No value yet</span>
            <span className={styles.basis}>
              neither an estimate nor an offer
            </span>
          </>
        ) : (
          <>
            <span
              className={`${styles.amount} ${card.valueBasis === "estimate" ? styles.amountEstimate : ""}`}
            >
              {card.valueBasis === "estimate"
                ? fmtApprox(card.value)
                : fmtMoney(card.value)}
            </span>
            <span
              className={`${styles.basis} ${card.valueBasis === "offer" ? styles.basisOffer : ""}`}
            >
              {card.valueBasis}
            </span>
          </>
        )}
      </span>
      <OfferSheet
        card={card}
        homeCurrency={homeCurrency}
        markupPct={markupPct}
        timeZone={timeZone}
      />
      {/* The arrow says "this is what happens next" before the sentence does
          (`v3/screens/pipeline.css:196-202`). It is `aria-hidden` inside `Icon`,
          so nothing is added to the card's accessible name, which already
          carries the next step in prose. */}
      <span className={styles.next}>
        <Icon name="arrow" />
        <span className={styles.nextText}>{card.opportunity.nextAction}</span>
      </span>
      <span className={styles.meta}>
        {/* Three channels, not one: the word "stale", the filled red badge and
            the clock (`v3/screens/pipeline.js:326`). Remove the colour and the
            sentence still says it. */}
        <span className={`${styles.age} ${card.stale ? styles.ageStale : ""}`}>
          {card.stale && <Icon name="clock" />}
          {`${card.ageDays} d${card.stale ? " · stale" : ""}`}
        </span>
        {card.owner !== undefined && <Initials name={card.owner.name} />}
      </span>
    </article>
  );
};

const BoardColumn = ({
  column,
  meterMax,
  indexOf,
  itemProps,
  selectedRecordId,
  markupPct,
  homeCurrency,
  timeZone,
  onSelect,
  onOpen,
  onMoveRequest,
  onDragStart,
  onDragEnd,
  onDropInto,
  onDropTarget,
}: {
  readonly column: PipelineColumn;
  readonly meterMax: number;
  readonly indexOf: (id: string) => number;
  readonly itemProps: (index: number) => ListNavigationItemProps;
  readonly selectedRecordId: string | undefined;
  readonly markupPct: number;
  readonly homeCurrency: Currency;
  readonly timeZone: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly onOpen: (card: PipelineCard) => void;
  readonly onMoveRequest: (card: PipelineCard) => void;
  readonly onDragStart: (card: PipelineCard) => void;
  readonly onDragEnd: () => void;
  readonly onDropInto: (stageId: string) => void;
  /** Board-wide, because exactly one column can be the target at a time and the
   *  board is the only place that knows which one it is. */
  readonly onDropTarget: (node: HTMLElement | null) => void;
}) => {
  const quiet = column.terminal || column.stray;
  const width =
    meterMax > 0 && !quiet
      ? Math.round((column.meterMinor / meterMax) * 100)
      : 0;
  const totals = fmtTotals(column.totals);
  return (
    <section
      className={`${styles.column} ${quiet ? styles.columnQuiet : ""} ${column.stray ? styles.columnStray : ""}`}
      data-pipeline-column={column.id}
    >
      <div className={styles.columnHead}>
        <span className={styles.stage}>{column.label}</span>
        <span className={styles.stageCount}>{column.cards.length}</span>
        <span className={styles.stageSum}>{totals}</span>
        {meterMax > 0 && !quiet && (
          <span aria-hidden="true" className={styles.meter} data-pipeline-meter>
            <span className={styles.meterFill} style={{ width: `${width}%` }} />
          </span>
        )}
      </div>
      {column.stray && (
        // Visible text, not a tooltip. The card cannot vanish from the board —
        // it would still be counted by the number at the top — so the column
        // says what it is and refuses to be dropped into.
        <p className={styles.strayNote}>
          Not a configured stage. Move a card out with <kbd>M</kbd>.
        </p>
      )}
      <div
        aria-label={`${column.label}${column.stray ? ", not a configured stage" : ""}, ${countLabel(column.cards.length, "opportunity", "opportunities")}, ${totals}`}
        className={styles.columnBody}
        // A stray column has NO dropzone and no drop handler: moving a card onto
        // a stage that does not exist means nothing, so the gesture is refused
        // by the absence of the target rather than by a message after the drop.
        data-dropzone={column.stray ? undefined : column.id}
        // WHERE THE CARD WOULD LAND. `dragenter` and `dragleave` also fire for
        // every child crossed, so leaving is only believed when the cursor has
        // gone somewhere this body does not contain — the standard reading of
        // `relatedTarget`, and it self-heals after a cancelled drag in a way a
        // depth counter does not.
        onDragEnter={
          column.stray
            ? undefined
            : (event: ReactDragEvent<HTMLElement>) =>
                onDropTarget(event.currentTarget)
        }
        onDragLeave={
          column.stray
            ? undefined
            : (event: ReactDragEvent<HTMLElement>) => {
                // ORDER MATTERS AND IT IS NOT THE OBVIOUS ONE: crossing from one
                // column to the next fires `dragenter` ON THE NEW TARGET BEFORE
                // `dragleave` on the old one. A leave that cleared the board's
                // mark unconditionally would therefore strip the column the
                // cursor has just entered, and the highlight would never appear
                // while moving between columns — `dragover` does not set it.
                // So this only clears a mark that is still ITS OWN, and the mark
                // itself is the record of whose it is.
                if (!event.currentTarget.hasAttribute("data-drop-target"))
                  return;
                // And leaving for one's own child is not leaving.
                const to = event.relatedTarget;
                if (to instanceof Node && event.currentTarget.contains(to))
                  return;
                onDropTarget(null);
              }
        }
        onDragOver={
          column.stray
            ? undefined
            : (event: ReactDragEvent<HTMLElement>) => event.preventDefault()
        }
        onDrop={
          column.stray
            ? undefined
            : (event: ReactDragEvent<HTMLElement>) => {
                event.preventDefault();
                onDropTarget(null);
                onDropInto(column.id);
              }
        }
        role="listbox"
      >
        {column.cards.map((card) => (
          <DealCard
            card={card}
            homeCurrency={homeCurrency}
            index={indexOf(card.opportunity.id)}
            itemProps={itemProps}
            key={card.opportunity.id}
            markupPct={markupPct}
            onDragEnd={onDragEnd}
            onDragStart={onDragStart}
            onMoveRequest={onMoveRequest}
            onOpen={onOpen}
            onSelect={onSelect}
            selected={card.opportunity.id === selectedRecordId}
            timeZone={timeZone}
          />
        ))}
      </div>
      {column.cards.length === 0 && (
        // Outside the listbox: a `role="listbox"` carrying a child that is not
        // an option reads as a broken tree.
        <p className={styles.columnEmpty}>Nothing in this stage.</p>
      )}
    </section>
  );
};

export const PipelineSurface = ({
  client,
  snapshot,
  selectedRecordId,
  activeOpportunityId,
  renderRecordScreen,
  onSelectRecord,
  onOpenOpportunity,
  onOpenOrganization,
  onNavigate,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly selectedRecordId: string | undefined;
  /** The deal a context asked to open AS A RECORD, as against one merely
   *  selected on the board. The opportunity record screen is a context on this
   *  surface exactly as the task record is a context on `tasks`. */
  readonly activeOpportunityId?: StrategicRecordId | undefined;
  readonly renderRecordScreen?: (() => ReactNode) | undefined;
  readonly onSelectRecord: (id: string) => void;
  readonly onOpenOpportunity: (id: StrategicRecordId, title: string) => void;
  readonly onOpenOrganization: (id: StrategicRecordId, name: string) => void;
  readonly onNavigate: (surface: "settings", label: string) => void;
  readonly onReload: () => Promise<void> | void;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const [creating, setCreating] = useState(false);
  const [draftOrganizationId, setDraftOrganizationId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNeed, setDraftNeed] = useState("");
  const [draftNextAction, setDraftNextAction] = useState("");
  const [draftEstimate, setDraftEstimate] = useState("");
  // Undefined until somebody picks one: the default depends on the workspace,
  // and reading a workspace value into `useState` would freeze it at whatever
  // the first render happened to see.
  const [draftCurrency, setDraftCurrency] = useState<Currency | undefined>(
    undefined,
  );
  const [priceDraft, setPriceDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [movePending, setMovePending] = useState(false);
  // The deal the keyboard asked to move, as against the one the board has
  // SELECTED. `M` must not select: selecting a strategic record opens the
  // shell's context preview, and that panel takes the focus for itself
  // (`inspector-header`, `tabIndex={-1}`) — so a gesture that selected first
  // would hand the focus straight back out of the controls it just opened.
  const [moveFor, setMoveFor] = useState<string | undefined>(undefined);
  const dragged = useRef<string | undefined>(undefined);
  const moveRef = useRef<HTMLButtonElement | null>(null);
  // The column body currently marked as the drop target, held as a node rather
  // than an id because clearing it must not depend on that column still being
  // rendered — a board reloads under a drag that changed a stage.
  const dropTarget = useRef<HTMLElement | null>(null);

  const markDropTarget = (node: HTMLElement | null) => {
    if (dropTarget.current === node) return;
    dropTarget.current?.removeAttribute("data-drop-target");
    dropTarget.current = node;
    node?.setAttribute("data-drop-target", "");
  };

  const timeZone = snapshot.bootstrap.workspace.timezone;
  // The board's day counts are WORKSPACE calendar days, like every other
  // surface's — so the prose carries the zone and the day the reader is
  // standing on, rather than the board flooring a raw millisecond difference.
  const prose = { timeZone, todayKey: dateKeyInZone(new Date(), timeZone) };
  const settings = readMoneySettings(snapshot);
  const stages: readonly PipelineStage[] =
    snapshot.bootstrap.workspace.commercialDefaults.stages;
  // What the estimate picker offers, and which of them it starts on. NOTHING
  // GUARANTEES the home currency is a member of the workspace's own list — the
  // settings PR reported that gap rather than papering over it — so the picker
  // starts on the home currency only when it is actually offered, and otherwise
  // on the first currency that is. Selecting a value the list does not carry
  // would leave the control blank and send an estimate in a currency nobody
  // chose.
  const offeredCurrencies = settings.currencies;
  const preferredCurrency = offeredCurrencies.includes(settings.homeCurrency)
    ? settings.homeCurrency
    : offeredCurrencies[0];
  const relationships = readSlice(snapshot.relationships);

  const index = useMemo(
    () =>
      indexRelationships(
        relationships.available ? relationships.data.records : [],
      ),
    [relationships],
  );

  const board = useMemo(
    () => readBoard(index, stages, settings, prose),
    [
      index,
      stages,
      settings.homeCurrency,
      settings.markupPct,
      prose.timeZone,
      prose.todayKey,
    ],
  );
  const cards = useMemo(() => boardCards(board), [board]);
  const order = useMemo(() => {
    const positions = new Map<string, number>();
    cards.forEach((card, position) =>
      positions.set(card.opportunity.id, position),
    );
    return positions;
  }, [cards]);

  const selected = cards.find(
    (card) => card.opportunity.id === (moveFor ?? selectedRecordId),
  );
  const firstMoveTargetId = stages.find(
    (stage) => stage.id !== selected?.opportunity.stage,
  )?.id;

  const move = (card: PipelineCard, stageId: string) => {
    if (client === undefined || card.opportunity.stage === stageId) return;
    setBusy(true);
    void updateOpportunity(
      client,
      snapshot,
      { id: card.opportunity.id, version: card.opportunity.version },
      { stage: stageId },
    ).then(async (result) => {
      setBusy(false);
      if (result.kind === "success") await onReload();
      else onFailure(result);
    });
  };

  const openDeal = (card: PipelineCard) =>
    onOpenOpportunity(card.opportunity.id, card.opportunity.title);

  const itemProps = useListNavigation({
    itemCount: cards.length,
    onOpen: (position) => {
      const card = cards[position];
      if (card !== undefined) openDeal(card);
    },
    onSelect: (position) => {
      const card = cards[position];
      if (card !== undefined) onSelectRecord(card.opportunity.id);
    },
  });

  useEffect(() => {
    if (!movePending) return;
    moveRef.current?.focus();
    setMovePending(false);
  }, [movePending, moveFor]);

  const submitDeal = () => {
    if (client === undefined || draftTitle.trim() === "") return;
    const estimateMinor = priceMinorFromMajor(draftEstimate);
    const estimate: Money | undefined =
      draftEstimate.trim() === "" || estimateMinor === undefined
        ? undefined
        : {
            amountMinor: estimateMinor,
            currency: draftCurrency ?? preferredCurrency!,
          };
    setBusy(true);
    void createOpportunity(client, snapshot, {
      organizationId: draftOrganizationId as StrategicRecordId,
      title: draftTitle.trim(),
      need: draftNeed.trim() === "" ? "Not recorded yet." : draftNeed.trim(),
      nextAction:
        draftNextAction.trim() === ""
          ? "Decide the next step."
          : draftNextAction.trim(),
      ...(estimate === undefined ? {} : { estimate }),
    }).then(async (result) => {
      setBusy(false);
      if (result.kind === "success") {
        setCreating(false);
        setDraftTitle("");
        setDraftNeed("");
        setDraftNextAction("");
        setDraftEstimate("");
        await onReload();
      } else onFailure(result);
    });
  };

  const writePrice = (
    card: PipelineCard,
    price:
      | { readonly basis: "derived" }
      | { readonly basis: "confirmed"; readonly price: Money },
  ) => {
    const offer = card.offer?.offer;
    if (client === undefined || offer === undefined) return;
    setBusy(true);
    void updateOffer(
      client,
      snapshot,
      { id: offer.id, version: offer.version },
      { price },
    ).then(async (result) => {
      setBusy(false);
      if (result.kind === "success") {
        setPriceDraft("");
        await onReload();
      } else onFailure(result);
    });
  };

  const header = (action?: ReactNode) => (
    <SurfaceTitleBand action={action} title="Pipeline" />
  );

  // R3 × #232: ten blok stał u mnie PRZED strażnikiem dostępności, a jego
  // kolejność jest własnością POPRAWNOŚCI, nie układu — więc wygrywa wersja
  // z maina, a przepięcie pasm dostaje ją niżej, tam gdzie teraz stoi.
  // THE AVAILABILITY GUARD RUNS FIRST, AHEAD OF THE RECORD SLOT, and the order
  // is the whole point. A deal opened as a record is drawn from the SAME slice
  // as the board: `RealApp.tsx:2109-2121` only looks the opportunity up when
  // `relationships.kind === "ready"`, so an unreadable slice arrives here as
  // `renderRecordScreen === undefined` — indistinguishable, from inside this
  // branch, from a deal that genuinely is not there. Checking the record slot
  // first is how the one path that jumps this guard told a reader "this deal
  // has no record screen yet" about a read that never happened: no reason, no
  // retry, and a claim about the product where the truth was a failure.
  if (!relationships.available)
    return (
      // Pasmo jest RODZEŃSTWEM przewijanego pudełka także w stanie awaryjnym —
      // patrz nota przy głównym zwrocie niżej. Gdyby ta gałąź trzymała stary
      // układ, chrom skakałby o 12 px dokładnie w chwili, w której ekran ma
      // powiedzieć, że czegoś nie dało się przeczytać.
      <>
        {header()}
        <div
          className={`surface-scroll ${styles.pipeline}`}
          data-pipeline-surface
        >
          <section className={styles.emptyState} role="status">
            <div>
              <h2>The pipeline is unavailable</h2>
              {/* The slice's own reason. A fixed sentence names nothing a reader
                  can act on, and an empty board would read as "no deals". */}
              <p data-pipeline-unavailable>{relationships.message}</p>
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
      </>
    );

  if (activeOpportunityId !== undefined)
    // TYLKO RAMIĘ Z PASMEM WYNOSI PASMO. Drugie ramię oddaje ekran rekordu,
    // który rysuje WŁASNY chrom — objęcie go tym fragmentem postawiłoby pasmo
    // ekranu Lejka nad pasmem rekordu, czyli dwa pasma jedno pod drugim.
    //
    // `header()` Z NAWIASAMI: na mainie `header` był WARTOŚCIĄ, w tej fali jest
    // FUNKCJĄ przyjmującą akcję pasma. Przeniesione `{header}` wyrenderowałoby
    // funkcję jako dziecko, czyli nie wyrenderowałoby pasma w ogóle.
    return renderRecordScreen === undefined ? (
      <>
        {header()}
        <div
          className={`surface-scroll ${styles.pipeline}`}
          data-pipeline-surface
        >
          <section className={styles.emptyState} role="status">
            <div>
              <h2>This deal is not in the pipeline</h2>
              {/* Past the guard above, the slice READ FINE and this deal is
                    not in it — a context restored from device state naming a
                    record removed since, or one belonging to a Space this
                    session cannot see (`RealApp.tsx:2113-2116` anticipates
                    exactly that). Saying "no record screen yet" here described
                    a gap in the product that was closed releases ago, and said
                    it about data. */}
              <p data-pipeline-record-missing>
                The deal this view was opened for is no longer among the ones
                you can read here. It may have been removed, or it may live in a
                Space you do not have.
              </p>
            </div>
          </section>
        </div>
      </>
    ) : (
      <div
        className={`surface-scroll ${styles.pipeline}`}
        data-pipeline-surface
      >
        {renderRecordScreen()}
      </div>
    );

  return (
    // PASMA SĄ RODZEŃSTWEM PRZEWIJANEGO PUDEŁKA, NIE JEGO DZIEĆMI — układ
    // prototypu (`v3/app.css:278-303`: `.crumbbar`, `.viewbar` i `.scroller` to
    // troje dzieci `.canvas`, a przewija się wyłącznie trzecie). Mechanizm stoi
    // w `styles.css` przy `.work-surface:has(> .surface-header)`; ekran zgłasza
    // się do niego TYM, że wynosi pasma na zewnątrz, a nie nazwą na liście.
    //
    // Fragment zamiast pojemnika jest tu WARUNKIEM, a nie stylem: pasma muszą
    // być bezpośrednimi dziećmi `.work-surface`, więc żaden dodatkowy element
    // nie może stanąć między nimi a nośnikiem.
    <>
      {header(
        /* THE ACTION OF THE SCREEN, AT THE END OF ITS TITLE BAND. The prototype
           draws it as the primary action and pushes it right
           (`v3/screens/pipeline.js:409-410` through `v3/app.css:293`,
           `:321-332`); the contract calls the primary action one per container
           that owns one and the largest solid-accent object a view may hold
           (`.ui-craft/tokens.md`, "Usage constraints" 3).

           THE CONDITIONAL IS NOT FORCED BY THAT RULE, and saying it was is what
           this comment got wrong until 2026-08-11. One per CONTAINER is the
           wording, and the create form is its own container — a sibling of the
           band, not a second action inside it — so the contract licenses the
           form's "Add opportunity" and a filled band action at the same time.
           The toggle steps down to secondary anyway, as a choice about MEANING:
           once the form is on screen the thing to press is inside it, and this
           button only closes it again. It is a deliberate divergence from the
           prototype, whose `crumbbar(crumbs, actions)` (`v3/app.js:677-683`) has
           no state in which the band action goes grey. The same paragraph stands
           on People, Organizations and Renewals.

           PHASE C, LOT C2 — IT USED TO STAND A ROW LOWER, IN ITS OWN
           `.crumbbar`. The prototype has no second bar: `crumbbar(crumbs,
           actions)` (`v3/app.js:677-683`) is ONE band carrying the screen's name
           and its action. Measured before the fix
           (`dowody/c2-czerwien-poziom.txt`): 74.1 px below the title row against
           a tolerance of 18. Horizontally it was already at the end — 16 px
           short against a tolerance of 16, i.e. exactly the crumb bar's own
           inline padding — which is why the horizontal axis reported it as
           FLUSH_END and why that reading sat on the boundary rather than in the
           clear. Inside the band the same action ends flush with the band's
           content box. */
        <button
          aria-expanded={creating}
          className={creating ? "secondary-button" : "primary-button"}
          onClick={() => setCreating((open) => !open)}
          type="button"
        >
          <Icon name="capture" />
          New opportunity
        </button>,
      )}
      <div className={`view-band ${styles.viewbar}`}>
        {/* The control IS the statement that stages are configurable. The
            paragraph that used to say so is gone and this is where it went. */}
        <button
          className={styles.stagesLink}
          onClick={() => onNavigate("settings", "Settings")}
          type="button"
        >
          <Icon name="settings" />
          Stages
        </button>
        {board.strayStageCount > 0 && (
          <>
            <span className={styles.warnTag} data-pipeline-stray-count>
              {`${board.strayStageCount} not configured`}
            </span>
            <TopicHelp topic="unconfigured-stage" />
          </>
        )}
        <span
          aria-live="polite"
          className={styles.count}
          data-pipeline-count
          role="status"
        >
          {`${board.openCount} open · ${fmtTotals(board.openTotals)}`}
          <span className={styles.split}>
            {`${board.pricedCount} from an offer, ${board.openCount - board.pricedCount} estimated`}
          </span>
        </span>
        {/* HELP ON DEMAND (#35), and both triggers stand OUTSIDE the live
            region: a button inside `role="status"` is re-announced every time
            the reading changes. The per-currency topic hangs on this reading
            rather than on a column head — §1.3 named the head, but the sums in
            the heads and the sum here are the same `fmtTotals`, and the concept
            is the board's, not one column's. Seven identical triggers would be
            seven identical accessible names for one answer. */}
        <TopicHelp topic="price-basis" />
        <TopicHelp topic="stage-sums" />
      </div>
      <div
        className={`surface-scroll ${styles.pipeline}`}
        data-pipeline-surface
      >
        {/* FORMULARZ TWORZENIA ZJECHAŁ POD PASEK WIDOKU, i to jest skutek układu,
          a nie osobna decyzja o kolejności. Do tego lotu stał MIĘDZY pasmami —
          czyli rozpychał chrom w stanie tworzenia, a `.surface-header +
          .view-band` przestawało wtedy trafiać i pasma się rozjeżdżały. Prototyp
          układa dwa pasma jedno na drugim i dopiero pod nimi treść
          (`v3/app.css:278-303`), a formularz jest treścią: przewija się razem
          z listą, którą uzupełnia. */}
        {creating && (
          <form
            aria-label="New opportunity"
            className={styles.create}
            onSubmit={(event) => {
              event.preventDefault();
              submitDeal();
            }}
          >
            <label className={styles.field}>
              Client
              <select
                onChange={(event) => setDraftOrganizationId(event.target.value)}
                required
                value={draftOrganizationId}
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
              Title
              <input
                onChange={(event) => setDraftTitle(event.target.value)}
                required
                value={draftTitle}
              />
            </label>
            <label className={styles.field}>
              Need
              <input
                onChange={(event) => setDraftNeed(event.target.value)}
                value={draftNeed}
              />
            </label>
            <label className={styles.field}>
              Next step
              <input
                onChange={(event) => setDraftNextAction(event.target.value)}
                value={draftNextAction}
              />
            </label>
            <label className={styles.field}>
              Estimate
              <input
                inputMode="decimal"
                onChange={(event) => setDraftEstimate(event.target.value)}
                value={draftEstimate}
              />
            </label>
            <label className={styles.field}>
              Currency
              <select
                onChange={(event) =>
                  setDraftCurrency(event.target.value as Currency)
                }
                value={draftCurrency ?? preferredCurrency}
              >
                {/* The workspace's own list, never a third copy of the currency
                  union written out by hand. `money.ts` defines the vocabulary,
                  the workspace says which of it a picker offers. */}
                {offeredCurrencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              disabled={
                busy || draftTitle.trim() === "" || draftOrganizationId === ""
              }
              type="submit"
            >
              {busy ? "Adding…" : "Add opportunity"}
            </button>
          </form>
        )}
        {selected !== undefined && (
          // OUTSIDE the board. Every control the deal needs, in one place, so the
          // listbox holds nothing but options and the board keeps its single Tab
          // stop. `M` lands the focus on the first stage the deal is not already
          // standing on, which is the first control it can actually press.
          <section
            aria-label={`Selected deal: ${selected.opportunity.title}`}
            className={styles.dealPanel}
            data-pipeline-deal-panel={selected.opportunity.id}
            onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
              // A control you cannot get out of is worse than no control. Escape
              // closes the move panel and returns the focus to the card it was
              // opened from, rather than dropping it at the top of the document.
              if (event.key !== "Escape" || moveFor === undefined) return;
              event.preventDefault();
              const card = document.querySelector<HTMLElement>(
                `[data-pipeline-card="${moveFor}"]`,
              );
              setMoveFor(undefined);
              card?.focus();
            }}
          >
            <div className={styles.dealPanelHead}>
              <span className={styles.dealPanelTitle}>
                {selected.opportunity.title}
              </span>
              {selected.organization !== undefined && (
                <ClientLink
                  onOpen={onOpenOrganization}
                  organization={selected.organization}
                />
              )}
              {selected.opportunity.stageEnteredAt !== undefined && (
                <span className={styles.dealPanelSub}>
                  {`in this stage since ${formatDate(selected.opportunity.stageEnteredAt, timeZone)}`}
                </span>
              )}
            </div>
            <div
              aria-label="Move this deal to a stage"
              className={styles.moveGroup}
              role="group"
            >
              {stages.map((stage) => (
                <button
                  aria-current={selected.opportunity.stage === stage.id}
                  className={styles.moveButton}
                  data-pipeline-move={stage.id}
                  disabled={busy || selected.opportunity.stage === stage.id}
                  key={stage.id}
                  onClick={() => move(selected, stage.id)}
                  // The first stage the deal is not already standing on. Focusing
                  // by position would land on a DISABLED button whenever the deal
                  // stands on the first stage, and `.focus()` on a disabled
                  // control is a silent no-op — which would make `M` do nothing
                  // for exactly the deals the funnel starts with.
                  ref={stage.id === firstMoveTargetId ? moveRef : undefined}
                  type="button"
                >
                  {stage.label}
                </button>
              ))}
            </div>
            {selected.offer !== undefined && (
              <div className={styles.priceControls}>
                {selected.offer.price.basis === "confirmed" ? (
                  // Un-confirming CLEARS the stored amount rather than leaving one
                  // behind a card that reads as derived, which is why this is a
                  // command and not a local toggle.
                  <button
                    className="secondary-button"
                    data-pipeline-underive
                    disabled={busy}
                    onClick={() => writePrice(selected, { basis: "derived" })}
                    type="button"
                  >
                    Use the derived price
                  </button>
                ) : null}
                <label className={styles.field}>
                  Confirmed price
                  <input
                    data-pipeline-price-input
                    inputMode="decimal"
                    onChange={(event) => setPriceDraft(event.target.value)}
                    value={priceDraft}
                  />
                </label>
                <button
                  className="secondary-button"
                  data-pipeline-confirm-price
                  disabled={
                    busy || priceMinorFromMajor(priceDraft) === undefined
                  }
                  onClick={() => {
                    const amountMinor = priceMinorFromMajor(priceDraft);
                    if (amountMinor === undefined) return;
                    writePrice(selected, {
                      basis: "confirmed",
                      price: {
                        amountMinor,
                        currency: settings.homeCurrency,
                      },
                    });
                  }}
                  type="button"
                >
                  {`Confirm price in ${settings.homeCurrency}`}
                </button>
              </div>
            )}
          </section>
        )}
        {/* The horizontal overflow lives HERE and nowhere above it. The packaged
          text-scaling gate measures the first visible child of the work plane
          against its own client width, so a board wider than the window has to
          be held by a scroll container that is itself exactly as wide as the
          surface. */}
        {/* Deklaracja dla przeglądu układu potomków: ten region przewija się
          w poziomie Z ZAŁOŻENIA. Dopóki go o tym nie powie, „powłoka to
          wchłonie" jest wymówką, a nie projektem. */}
        <div className={styles.scroller} data-scrolls-horizontally>
          <div className={styles.board} data-pipeline-board>
            {board.columns.map((column) => (
              <BoardColumn
                column={column}
                homeCurrency={settings.homeCurrency}
                indexOf={(id) => order.get(id) ?? 0}
                itemProps={itemProps}
                key={column.id}
                markupPct={settings.markupPct}
                meterMax={board.meterMax}
                onDragEnd={() => {
                  dragged.current = undefined;
                  markDropTarget(null);
                }}
                onDragStart={(card) => {
                  dragged.current = card.opportunity.id;
                }}
                onDropInto={(stageId) => {
                  const card = cards.find(
                    (candidate) => candidate.opportunity.id === dragged.current,
                  );
                  dragged.current = undefined;
                  // The same call the keyboard makes. One path, so the gesture
                  // that can be driven in a test is the gesture that ships.
                  if (card !== undefined) move(card, stageId);
                }}
                onDropTarget={markDropTarget}
                onMoveRequest={(card) => {
                  setMoveFor(card.opportunity.id);
                  setMovePending(true);
                }}
                onOpen={openDeal}
                onSelect={onSelectRecord}
                selectedRecordId={selectedRecordId}
                timeZone={timeZone}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
