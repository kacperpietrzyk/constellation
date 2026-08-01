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
import {
  useListNavigation,
  type ListNavigationItemProps,
} from "../hooks/useListNavigation.js";
import { countLabel, formatDate } from "../i18n.js";
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
          {`No cost from distribution yet — ${reading.offer.nextAction}`}
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
      onDragStart={() => onDragStart(card)}
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
      <span className={styles.next}>{card.opportunity.nextAction}</span>
      <span className={styles.meta}>
        {/* The word carries the warning, not the colour. */}
        <span
          className={`${styles.age} ${card.stale ? styles.ageStale : ""}`}
        >{`${card.ageDays} d${card.stale ? " · stale" : ""}`}</span>
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
  onDropInto,
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
  readonly onDropInto: (stageId: string) => void;
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

  const timeZone = snapshot.bootstrap.workspace.timezone;
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
    () => readBoard(index, stages, settings, Date.now()),
    [index, stages, settings.homeCurrency, settings.markupPct],
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

  const header = (
    <header className="surface-header">
      <h1 id="surface-title" tabIndex={-1}>
        Pipeline
      </h1>
    </header>
  );

  if (activeOpportunityId !== undefined)
    return (
      <div
        className={`surface-scroll ${styles.pipeline}`}
        data-pipeline-surface
      >
        {renderRecordScreen === undefined ? (
          <>
            {header}
            <section className={styles.emptyState} role="status">
              <div>
                <h2>This deal has no record screen yet</h2>
                {/* The honest sentence for the one release in which the context
                    exists and the screen that draws it has not landed. It says
                    what is missing rather than showing a board that ignores the
                    request. */}
                <p data-pipeline-record-missing>
                  The opportunity record is a context on this surface, and
                  nothing has been handed in to draw it.
                </p>
              </div>
            </section>
          </>
        ) : (
          renderRecordScreen()
        )}
      </div>
    );

  if (!relationships.available)
    return (
      <div
        className={`surface-scroll ${styles.pipeline}`}
        data-pipeline-surface
      >
        {header}
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
    );

  return (
    <div className={`surface-scroll ${styles.pipeline}`} data-pipeline-surface>
      {header}
      <div className={styles.crumbbar}>
        <button
          aria-expanded={creating}
          className="secondary-button"
          onClick={() => setCreating((open) => !open)}
          type="button"
        >
          <Icon name="capture" />
          New opportunity
        </button>
      </div>
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
      <div className={styles.viewbar}>
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
                disabled={busy || priceMinorFromMajor(priceDraft) === undefined}
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
  );
};
