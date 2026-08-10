import { useId, useState } from "react";

import { KNOWLEDGE_SOURCE_AVAILABILITY } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  createKnowledgeSource,
  updateKnowledgeSourceAvailability,
  updateKnowledgeSourceTitle,
  type DesktopSnapshot,
  type KnowledgeSourceRecord,
  type MutationFailure,
  type MutationResult,
} from "../client/workflow.js";
import { Icon } from "../components/Icon.js";
import { InlinePopover } from "../components/InlinePopover.js";
import { TopicHelp } from "../help/TopicHelp.js";
import { useListNavigation } from "../hooks/useListNavigation.js";
import { countLabel } from "../i18n.js";
import {
  EvidenceMotif,
  availabilityCopy,
  sourceKindCopy,
} from "./library-chrome.js";
import styles from "./sources.module.css";
import {
  UNAVAILABLE_CONSEQUENCE,
  addedDay,
  dependentKindLabel,
  emptyKindLine,
  firstSourceInRenderOrder,
  groupSourcesByKind,
  observationDay,
  restsOnSentence,
  sourceRowName,
} from "./sources-view.js";

/* SOURCES — WHAT YOU COLLECTED, AS OPPOSED TO WHAT YOU WROTE.
 *
 * Two panels: the list, grouped by kind, and the source being read. Everything
 * this screen knows how to say is worked out in `sources-view.ts`; this file
 * turns it into elements and owns nothing else.
 *
 * THREE PROPERTIES THIS SCREEN IS, RATHER THAN HAS, and each is asserted:
 *
 *   1. EVERY KIND GETS A GROUP HEAD, INCLUDING THE EMPTY ONES. The heads come
 *      from `sourceKindRenderOrder`, which is asserted to be a permutation of
 *      the contract vocabulary — so a fifth kind cannot arrive without a group.
 *      On the real workspace `screenshot` is 0 of 81, and its head is the only
 *      thing that says the kind exists.
 *   2. AVAILABILITY IS CARRIED BY TEXT. The badge is a word before it is a
 *      colour, the row's accessible name repeats it, and the reason the three
 *      states mean what they mean is a `?` topic — never a `title=`, which does
 *      not exist for a keyboard, for touch, or for anybody not hovering.
 *   3. OBSERVED AND ADDED ARE TWO FACTS. `observationDay` and `addedDay` each
 *      take the source and reach for their own field, so neither can be handed
 *      the other's.
 *
 * WHAT IS NOT HERE, ON PURPOSE. No folder tree: sources are ordered by kind
 * (WALKTHROUGH :1265), they have no incoming tree to migrate, and the axis that
 * carries risk on collected material is availability, not placement. No lecture
 * above the list either — decision #21 cut four of them off this screen and
 * they came back three times; what they said is now a `?` at the thing.
 */

const AvailabilityBadge = ({
  availability,
}: {
  readonly availability: KnowledgeSourceRecord["availability"];
}) => (
  // The word first, the tone second. A reader with no colour, or a screenshot
  // in grey, still gets the whole fact.
  <span className={`${styles.badge} ${styles[`badge_${availability}`] ?? ""}`}>
    {availabilityCopy[availability]}
  </span>
);

const SourceRow = ({
  itemProps,
  selected,
  source,
  onSelect,
}: {
  readonly itemProps: ReturnType<ReturnType<typeof useListNavigation>>;
  readonly selected: boolean;
  readonly source: KnowledgeSourceRecord;
  readonly onSelect: () => void;
}) => (
  <li className={styles.rowItem} role="presentation">
    <div
      {...itemProps}
      aria-label={sourceRowName(
        source,
        availabilityCopy[source.availability],
        sourceKindCopy[source.sourceKind],
      )}
      aria-selected={selected}
      className={`${styles.row} ${selected ? styles.rowSelected : ""}`}
      data-source-row={source.id}
      onClick={onSelect}
      role="option"
    >
      <span className={styles.rowTop}>
        {/* Two lines, not one line with an ellipsis. Real titles run to 199
            characters and a column of URLs truncated at the same prefix is a
            column of identical rows. */}
        <span className={styles.rowTitle}>{source.title}</span>
        <AvailabilityBadge availability={source.availability} />
      </span>
      <span className={styles.rowMeta}>
        <span className={styles.kindChip}>
          {sourceKindCopy[source.sourceKind]}
        </span>
        <span>{restsOnSentence(source.referencedByCount)}</span>
        <span>observed {observationDay(source)}</span>
      </span>
    </div>
  </li>
);

const SourceReader = ({
  client,
  snapshot,
  source,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly source: KnowledgeSourceRecord;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const fieldId = useId();
  const [title, setTitle] = useState(source.title);
  const [busy, setBusy] = useState(false);
  const nextTitle = title.trim();
  const shown = source.referencedBy;
  const hidden = source.referencedByCount - shown.length;

  const run = (work: Promise<MutationResult<void>>) => {
    setBusy(true);
    void work.then(async (result) => {
      setBusy(false);
      if (result.kind !== "success") return onFailure(result);
      await onReload();
    });
  };

  return (
    <article
      aria-labelledby={`${fieldId}-title`}
      className={styles.reader}
      data-source-reader={source.id}
    >
      <header className={styles.readerHead}>
        <p className="eyebrow">{sourceKindCopy[source.sourceKind]}</p>
        <h3 id={`${fieldId}-title`}>{source.title}</h3>
        <p className={styles.readerAvailability}>
          <AvailabilityBadge availability={source.availability} />
          <TopicHelp topic="source-availability" />
        </p>
        {source.availability === "unavailable" && (
          <p className={styles.consequence}>{UNAVAILABLE_CONSEQUENCE}</p>
        )}
      </header>

      {/* TWO DATES UNDER TWO LABELS. The screen is the only place they are ever
          seen side by side, and it is where collapsing them would show. */}
      <dl className={styles.dates}>
        <div>
          <dt>Observed</dt>
          <dd data-source-observed>{observationDay(source)}</dd>
        </div>
        <div>
          <dt>Added</dt>
          <dd data-source-added>{addedDay(source)}</dd>
        </div>
      </dl>

      {source.canonicalUrl !== undefined && (
        <section className={styles.section}>
          <p className={styles.sectionLabel}>Where it is</p>
          <a
            className={styles.link}
            href={source.canonicalUrl}
            rel="noreferrer"
            target="_blank"
          >
            {source.canonicalUrl}
          </a>
        </section>
      )}

      {/* WHAT RESTS ON THIS — one stored edge, read from the source's end. The
          other end is the note's own evidence, and nothing is stored twice. */}
      <section className={styles.section}>
        <p className={styles.sectionLabel}>
          What rests on this{" "}
          <span className={styles.sectionCount}>
            {source.referencedByCount}
          </span>
        </p>
        {source.referencedByCount === 0 ? (
          <p className={styles.empty}>
            Nothing rests on this source yet — it was collected, not yet used.
          </p>
        ) : (
          <ul className={styles.restsList}>
            {shown.map((reference) => (
              <li key={reference.recordId} data-source-dependent>
                <span className={styles.restsRow}>
                  {/* ONE GLYPH FOR EVERY KIND, and the word beside it carries
                      which kind this is. A glyph chosen per kind would be a
                      hand-written map standing beside a closed dictionary
                      (`RecordKindSchema`), and a kind missing from that map
                      would draw a blank rather than fail — the silent shape of
                      this defect class. The square is a marker that a record is
                      here; the label is the fact. */}
                  <span className={styles.restsIcon}>
                    <Icon name="list" />
                  </span>
                  <span className={styles.restsBody}>
                    {/* The kind word is worked out in `sources-view.ts`, like
                        every other fact this screen states, so the test can
                        meet the reading rather than a rendered string. */}
                    <span
                      className={styles.restsKind}
                      data-source-dependent-kind
                    >
                      {dependentKindLabel(reference)}
                    </span>
                    <span data-source-dependent-title>{reference.title}</span>
                  </span>
                </span>
              </li>
            ))}
            {hidden > 0 && (
              <li className={styles.restsMore}>
                {countLabel(hidden, "more record")} not listed here
              </li>
            )}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <p className={styles.sectionLabel} id={`${fieldId}-availability`}>
          Can it still be reached
        </p>
        {/* NATIVE RADIOS, not a select and not buttons wearing `role="radio"`.
            Three states with three visible words, all on screen at once, with
            the browser's own arrow-key model and its own checked state — the
            two things a hand-rolled group gets wrong. A collapsed control would
            hide exactly the fact this screen is about.
            Every member comes from the contract vocabulary, so a fourth state
            appears here the moment it exists rather than the moment somebody
            remembers this file. */}
        <div
          aria-labelledby={`${fieldId}-availability`}
          className={styles.availabilityChoice}
          role="group"
        >
          {KNOWLEDGE_SOURCE_AVAILABILITY.map((value) => (
            <label className={styles.choice} key={value}>
              <input
                checked={source.availability === value}
                data-source-availability={value}
                disabled={client === undefined || busy}
                name={`${fieldId}-availability-choice`}
                onChange={() => {
                  if (client === undefined || source.availability === value)
                    return;
                  run(
                    updateKnowledgeSourceAvailability(
                      client,
                      snapshot,
                      source,
                      value,
                    ),
                  );
                }}
                type="radio"
                value={value}
              />
              {availabilityCopy[value]}
            </label>
          ))}
        </div>
      </section>

      <form
        className={styles.section}
        onSubmit={(event) => {
          event.preventDefault();
          if (!client || busy || nextTitle === "" || nextTitle === source.title)
            return;
          run(updateKnowledgeSourceTitle(client, snapshot, source, nextTitle));
        }}
      >
        <label className={styles.sectionLabel} htmlFor={`${fieldId}-rename`}>
          Change title
        </label>
        <input
          id={`${fieldId}-rename`}
          maxLength={500}
          name="sourceTitle"
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
        <button
          className="secondary-button"
          disabled={
            !client || busy || nextTitle === "" || nextTitle === source.title
          }
        >
          {busy ? "Saving…" : "Save title"}
        </button>
      </form>
    </article>
  );
};

export const SourcesReading = ({
  client,
  snapshot,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const knowledge =
    snapshot.knowledge.kind === "ready" ? snapshot.knowledge.data : undefined;
  const sources = knowledge?.sources ?? [];
  const [selectedSourceId, setSelectedSourceId] = useState<string>();
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);

  const groups = groupSourcesByKind(sources);
  // One flat order behind the groups, because the roving tab stop is ONE tab
  // stop for the whole listbox and it keys on position. Indices that restarted
  // per group would give several rows the same key and the stop would land on
  // all of them.
  const ordered = groups.flatMap((group) => group.sources);
  const selected =
    ordered.find((source) => source.id === selectedSourceId) ??
    firstSourceInRenderOrder(sources);
  const itemProps = useListNavigation({
    itemCount: ordered.length,
    onOpen: (index) => setSelectedSourceId(ordered[index]?.id),
    onSelect: (index) => setSelectedSourceId(ordered[index]?.id),
  });

  return (
    <div className={styles.layout} data-sources-reading>
      <aside className={styles.listPanel}>
        <header className={styles.listHead}>
          <div className={styles.listTitle}>
            <h2 id="sources-title">Everything you collected</h2>
            <TopicHelp topic="sources" />
          </div>
          <span className={`library-count ${styles.count}`}>
            {sources.length}
          </span>
        </header>

        <div
          className="knowledge-create-bar"
          aria-label="Create in the library"
        >
          <InlinePopover
            label="Add source"
            panelLabel="Add a source to the library"
            open={openCreate}
            onOpenChange={setOpenCreate}
            disabled={!client || creating}
          >
            <form
              className="quick-source-form knowledge-create-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!client || !sourceTitle.trim() || creating) return;
                setCreating(true);
                void createKnowledgeSource(client, snapshot, {
                  title: sourceTitle,
                  ...(sourceUrl.trim() === ""
                    ? {}
                    : { canonicalUrl: sourceUrl }),
                }).then(async (result) => {
                  setCreating(false);
                  if (result.kind !== "success") return onFailure(result);
                  setSourceTitle("");
                  setSourceUrl("");
                  setOpenCreate(false);
                  await onReload();
                });
              }}
            >
              <label htmlFor="knowledge-source-title">Save a source</label>
              <input
                id="knowledge-source-title"
                name="sourceTitle"
                required
                value={sourceTitle}
                onChange={(event) => setSourceTitle(event.target.value)}
                placeholder="What is worth keeping?"
                maxLength={500}
              />
              <input
                name="sourceUrl"
                type="url"
                aria-label="Source URL"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://… (optional)"
              />
              <button className="primary-button" disabled={creating}>
                Save source
              </button>
            </form>
          </InlinePopover>
        </div>

        {snapshot.knowledge.kind === "unavailable" ? (
          <div className="inline-error" role="status">
            {/* The slice's own reason and a way back, in place of a sentence
                that said only what the empty list already showed. */}
            <p data-sources-unavailable>{snapshot.knowledge.message}</p>
            <button
              className="secondary-button"
              onClick={() => void onReload()}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : (
          <div
            aria-label="Sources"
            className={styles.groups}
            role="listbox"
            tabIndex={-1}
          >
            {groups.map((group) => (
              <div className={styles.group} key={group.kind}>
                <div
                  className={styles.groupHead}
                  data-source-group={group.kind}
                >
                  <span>{sourceKindCopy[group.kind]}</span>
                  <span className={styles.groupCount}>
                    {group.sources.length}
                  </span>
                </div>
                {group.sources.length === 0 ? (
                  <p className={styles.groupEmpty}>
                    {emptyKindLine(group.kind)}
                  </p>
                ) : (
                  // `role="presentation"` so the options are owned by the
                  // listbox above rather than by four separate lists. The
                  // element stays a `<ul>` because the layout gate counts
                  // `.source-list > li` to know the screen drew anything.
                  <ul className="source-list" role="presentation">
                    {group.sources.map((source) => (
                      <SourceRow
                        itemProps={itemProps(
                          ordered.findIndex((item) => item.id === source.id),
                        )}
                        key={source.id}
                        onSelect={() => setSelectedSourceId(source.id)}
                        selected={selected?.id === source.id}
                        source={source}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </aside>

      {selected ? (
        <SourceReader
          client={client}
          key={`${selected.id}:${selected.version}`}
          onFailure={onFailure}
          onReload={onReload}
          snapshot={snapshot}
          source={selected}
        />
      ) : (
        <section className={styles.welcome}>
          <EvidenceMotif />
          <h3>Nothing collected yet</h3>
          <p>A source stays separate, even when it later feeds a note.</p>
        </section>
      )}
    </div>
  );
};
