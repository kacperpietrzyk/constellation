import {
  HEALTH_MARKS,
  compositionSentence,
  deadlineDate,
  deadlineSentence,
  deadlineTone,
  groupByClient,
  rowAccessibleName,
  type ProjectBuckets,
  type ProjectLayoutProps,
} from "./project-view.js";
import styles from "./project-clients.module.css";

// The same collection as the list layout, read along the other axis anyone
// actually asks about: who is this for. The rows are deliberately the same
// grammar as the list rows — the two layouts are compared at a glance, so a
// project must look the same in both — and every fact in them comes from the
// one reading in `project-view.ts`, never recomputed here.

const NO_CLIENT_CELL = "No client";

const CompositionBar = ({ buckets }: { readonly buckets: ProjectBuckets }) => {
  // A COMPOSITION bar, not a progress bar: on real work almost nothing is
  // closed, so a percentage says nothing and where the work stands says
  // everything. Empty buckets draw no segment — and are still told in words.
  const segments = (
    [
      ["done", buckets.done],
      ["held", buckets.held],
      ["open", buckets.open],
    ] as const
  ).filter(([, count]) => count > 0);
  return (
    <span className={styles.composition}>
      <span
        aria-label={compositionSentence(buckets)}
        className={styles.bar}
        role="img"
      >
        {buckets.total > 0 &&
          segments.map(([name, count]) => (
            <span
              className={`${styles.segment} ${styles[`segment_${name}`]}`}
              key={name}
              style={{ inlineSize: `${(count / buckets.total) * 100}%` }}
            />
          ))}
      </span>
      <span className={styles.ratio}>{`${buckets.done}/${buckets.total}`}</span>
    </span>
  );
};

export const ProjectClientsLayout = ({
  readings,
  prose,
  itemProps,
  selectedProjectId,
  onSelect,
  onOpen,
  clientOf,
}: ProjectLayoutProps) => {
  const groups = groupByClient(readings, clientOf);
  // Row indices run unbroken across group boundaries, because the roving tab
  // stop is the surface's one `useListNavigation` and it keys on them.
  const baseIndexes = groups.map((_, position) =>
    groups
      .slice(0, position)
      .reduce((total, earlier) => total + earlier.readings.length, 0),
  );
  return (
    <div className={styles.list} role="listbox" aria-label="Projects by client">
      {groups.map((group, position) => (
        <div className={styles.group} key={group.key}>
          {/* The heading is the client and the count, and nothing else. A
              second severity ornament here would claim the group has a health
              — the group has a client; the row has a health. */}
          <div className={styles.groupHead}>
            <span className={styles.groupLabel}>{group.label}</span>
            <span className={styles.groupCount}>{group.readings.length}</span>
          </div>
          {group.readings.map((reading, offset) => {
            const index = (baseIndexes[position] ?? 0) + offset;
            const nav = itemProps(index);
            const selected = reading.project.id === selectedProjectId;
            return (
              <div
                {...nav}
                aria-label={rowAccessibleName(
                  reading,
                  clientOf(reading.project.id),
                  deadlineDate(reading, prose),
                )}
                aria-selected={selected}
                className={`${styles.row} ${selected ? styles.rowSelected : ""}`}
                key={reading.project.id}
                onClick={() => onSelect(reading.project.id)}
                onDoubleClick={() => onOpen(reading.project.id)}
                role="option"
                data-project-row={reading.project.id}
              >
                <span
                  className={`${styles.health} ${
                    styles[`health_${reading.health.key}`]
                  }`}
                >
                  <span aria-hidden="true" className={styles.healthMark}>
                    {HEALTH_MARKS[reading.health.key]}
                  </span>
                  {reading.health.label}
                </span>
                <span className={styles.main}>
                  <span className={styles.title} data-row-title>
                    {reading.project.title}
                  </span>
                  {/* The reason stands next to the project, never in a summary
                      above the list: when half the projects are at risk the
                      label alone stops carrying information. */}
                  <span className={styles.why}>
                    {reading.health.why.join(" · ")}
                  </span>
                </span>
                <CompositionBar buckets={reading.buckets} />
                {/* Kept, and hidden by the stylesheet: the group heading
                    already says the client, but the cell holds the column
                    against the other layouts. */}
                <span className={styles.client}>
                  {clientOf(reading.project.id) ?? NO_CLIENT_CELL}
                </span>
                <span className={styles.tail}>
                  {/* A deadline is a promise, the work under it is the plan.
                      How long is left is the sentence this cell has room for;
                      the date it falls on rides the ROW'S accessible name.
                      It was a `title` here, which for a keyboard, for touch and
                      for a screen reader is the same as not being anywhere. */}
                  <b className={styles.open}>{`${reading.open.length} open`}</b>
                  <span
                    className={`${styles.left} ${
                      styles[`left_${deadlineTone(reading)}`]
                    }`}
                  >
                    {deadlineSentence(reading)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
