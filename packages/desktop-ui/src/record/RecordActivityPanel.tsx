import {
  activityCategoryFor,
  activityCategoryMark,
  activityLabelFor,
  type ActivityItem,
} from "../activity-collection.js";
import { formatDateTime } from "../i18n.js";
import styles from "./record-panels.module.css";

// What HAPPENED to this record, which is not the same question as what somebody
// is FLAGGING about it.
//
// Comments are excluded, and that is the whole reason this panel and the
// Comments tab are two things. An audit stream that also replayed every comment
// would turn "the deadline moved on Tuesday" and "I think this deadline is
// wrong" into one undifferentiated column, and the second is the only one that
// asks anything of the reader.

export type { ActivityItem };

/**
 * Who did it, when that can be known.
 *
 * Resolution order, when a caller has a principal to resolve: the PRINCIPAL
 * first — Hermes and Claude Code hold separate grants, so they are separate
 * identities and this list has to show that — then a Person record, because the
 * audit stream is older and identifies people that way.
 */
export interface RecordActor {
  readonly name: string;
  readonly agent: boolean;
}

export interface RecordActivityEntry {
  readonly item: ActivityItem;
  /** Absent when nothing in reach names an author. The entry then states the
   *  event and its time and stops there, rather than crediting a placeholder:
   *  a name on an audit line is a claim, and a wrong one is invisible to the
   *  person reading it. */
  readonly actor?: RecordActor | undefined;
}

/**
 * The filter this panel is defined by, exported so the tab badge counts exactly
 * what the panel lists. A count and a list disagreeing about their own subject
 * is a bug a reader cannot report, because both look right on their own.
 *
 * A prefix test rather than a list of three: `comment_added`, `comment_resolved`
 * and `comment_reopened` are the ones that exist today, and an enumeration would
 * quietly readmit the fourth on the day it lands.
 */
export const isRecordActivity = (item: ActivityItem): boolean =>
  !item.activityType.startsWith("comment_");

export const recordActivityItems = (
  items: readonly ActivityItem[],
): readonly ActivityItem[] => items.filter(isRecordActivity);

export const recordActivityEntries = (
  items: readonly ActivityItem[],
  recordId: string,
): readonly RecordActivityEntry[] =>
  recordActivityItems(items.filter((item) => item.recordId === recordId)).map(
    (item) => ({
      item,
      ...(item.actor === undefined
        ? {}
        : {
            actor: {
              name: item.actor.displayName,
              agent: item.actor.kind === "agent",
            },
          }),
    }),
  );

/** Newest first, ties broken on the event id so a batch written by one command
 *  holds its order between renders. */
const byRecency = (
  entries: readonly RecordActivityEntry[],
): readonly RecordActivityEntry[] =>
  [...entries].sort(
    (left, right) =>
      right.item.occurredAt.localeCompare(left.item.occurredAt) ||
      left.item.eventId.localeCompare(right.item.eventId),
  );

export const RecordActivityPanel = ({
  entries,
  timeZone,
}: {
  readonly entries: readonly RecordActivityEntry[];
  readonly timeZone: string;
}) => {
  const shown = byRecency(
    entries.filter((entry) => isRecordActivity(entry.item)),
  );

  if (shown.length === 0)
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nothing recorded yet</p>
          <p className={styles.emptyBody}>
            Status changes, links and date changes land here.
          </p>
        </div>
      </div>
    );

  return (
    <div className={styles.panel}>
      <ol className={styles.stream}>
        {shown.map(({ item, actor }) => (
          <li className={styles.event} key={item.eventId}>
            {/* The mark comes from the shared category vocabulary rather than a
                second glyph table keyed by event type: two tables over one enum
                drift apart the first event kind after this one. */}
            <span aria-hidden="true" className={styles.eventMark}>
              {activityCategoryMark[activityCategoryFor(item)]}
            </span>
            <span className={styles.eventText}>
              {actor !== undefined && (
                <>
                  <b className={styles.eventActor}>{actor.name}</b>
                  {/* An agent is named as one every time it appears. A stream
                      that reads the same whoever wrote the line takes away the
                      only question worth asking of it. */}
                  {actor.agent && (
                    <span className={styles.eventAgent}>agent</span>
                  )}{" "}
                </>
              )}
              {activityLabelFor(item)}
            </span>
            <span className={styles.eventWhen}>
              {formatDateTime(item.occurredAt, timeZone)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};
