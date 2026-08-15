import type { ProjectId } from "@constellation/contracts";

import { TopicHelp } from "../help/TopicHelp.js";
import {
  compositionSentence,
  deadlineSentence,
  deadlineTone,
  groupByHealth,
  rowAccessibleName,
  type HealthKey,
  type ProjectBuckets,
  type ProjectGroup,
  type ProjectLayoutProps,
} from "./project-view.js";
import styles from "./project-list.module.css";

// The default layout of Projects, and the one the other two are judged
// against: one row per project, grouped by health, rows lying on the canvas
// under sticky group headers.
//
// Everything a row says comes from ONE reading (`project-view.ts`). Nothing is
// derived a second time here: a list saying "At risk" over a record saying "On
// track" is not a rendering difference, it is two answers to one question, and
// that is this repo's named repeat defect class.
//
// There are deliberately no checkboxes and no bulk operations. Bulk acts on
// tasks, and a project cannot be "moved to a status".

/** Where each group's rows start in the ONE index space `itemProps` is keyed
 *  by. Row indices run unbroken across group boundaries — restarting them per
 *  group gives several rows the same key, and the single roving tab stop then
 *  lands on all of them. */
const withBaseIndex = (
  groups: readonly ProjectGroup[],
): readonly { readonly base: number; readonly group: ProjectGroup }[] => {
  let base = 0;
  return groups.map((group) => {
    const entry = { base, group };
    base += group.readings.length;
    return entry;
  });
};

/** Five marks that differ by SHAPE — filled square, diagonal half, square with
 *  an exclamation punched out, two bars for a pause, dashed outline. Colour
 *  only reinforces, and the label stands beside it in every row. */
const HealthMark = ({ healthKey }: { readonly healthKey: HealthKey }) => (
  <span
    aria-hidden="true"
    className={`${styles.mark} ${styles[`mark_${healthKey}`]}`}
  />
);

/** Drawn in the order the work moves, and a bucket of zero draws nothing —
 *  a hairline segment is a lie about a count nobody has. */
const BAR_SEGMENTS = ["done", "held", "open"] as const;

const CompositionBar = ({ buckets }: { readonly buckets: ProjectBuckets }) => (
  <span className={styles.composition}>
    <span
      aria-label={compositionSentence(buckets)}
      className={styles.bar}
      role="img"
    >
      {BAR_SEGMENTS.map((segment) => {
        if (buckets[segment] === 0) return null;
        return (
          <span
            className={styles[`bar_${segment}`]}
            key={segment}
            style={{
              inlineSize: `${(buckets[segment] / buckets.total) * 100}%`,
            }}
          />
        );
      })}
    </span>
    <span className={styles.count}>
      {buckets.done}/{buckets.total}
    </span>
  </span>
);

export const ProjectListLayout = ({
  readings,
  itemProps,
  selectedProjectId,
  onSelect,
  onOpen,
  clientOf,
}: ProjectLayoutProps) => (
  <div className={styles.list}>
    {withBaseIndex(groupByHealth(readings)).map(({ base, group }, position) => (
      <div className={styles.group} key={group.key}>
        <div className={styles.groupHead}>
          <HealthMark healthKey={group.key as HealthKey} />
          <span className={styles.groupLabel}>{group.label}</span>
          <span className={styles.groupCount}>{group.readings.length}</span>
          {/* Only the first header carries it: the answer is the same for
              every state, and four stacked question marks are decoration.
              A real button, never a `title=` — an explanation hidden in a
              tooltip does not exist for a keyboard or a finger.

              WPIS 5-4 DOKUMENTU PRZEJŚCIA, DOMKNIĘTY PRZEZ LOT L7 FAZY II —
              I DWIE RZECZY BYŁY TU ZŁE, NIE JEDNA.

              Widoczna: prototyp stawia `helpBtn("health")` ZARAZ ZA liczbą
              grupy (`v3/screens/projects.js:231`), a arkusz tej apki dawał
              znakowi `margin-inline-start: auto`, więc pytanie odjeżdżało na
              prawą krawędź okna (x ≈ 1670), a rzecz, której dotyczy, została
              przy x ≈ 60. Odległość między pytaniem a rzeczą była całą
              szerokością ekranu.

              Niewidoczna, i to ona jest gorsza: ten przycisk NIE MIAŁ
              `onClick`. Był okrągłym „?", który nie otwierał niczego —
              i przechodził przez najostrzejszą bramkę pomocy w repozytorium
              (`test/topic-help.interaction.test.tsx`), bo bramka chodzi po
              `[data-help-topic]`, a kontrolka, która się pomocą nie
              przedstawiła, jest dla niej niewidzialna. Kontrakt trasy
              Projektów asertował „ten ekran nie niesie żadnej pomocy" i był
              zielony nad żywym pytajnikiem.

              `TopicHelp` naprawia obie naraz: jedna forma z `styles.css`,
              zadeklarowany temat, prawdziwy dymek. */}
          {position === 0 && <TopicHelp topic="project-health" />}
        </div>
        <div
          aria-label={`${group.label} — by deadline`}
          className={styles.rows}
          role="listbox"
        >
          {group.readings.map((reading, offset) => {
            const projectId = reading.project.id as ProjectId;
            const selected = projectId === selectedProjectId;
            const client = clientOf(projectId);
            return (
              <div
                {...itemProps(base + offset)}
                aria-label={rowAccessibleName(
                  reading,
                  clientOf(reading.project.id),
                )}
                aria-selected={selected}
                className={`${styles.row} ${
                  selected ? styles.rowSelected : ""
                }`}
                key={projectId}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey) {
                    onOpen(projectId);
                    return;
                  }
                  onSelect(projectId);
                }}
                onDoubleClick={() => onOpen(projectId)}
                role="option"
                data-project-row={projectId}
              >
                <span
                  className={`${styles.chip} ${
                    styles[`chip_${reading.health.key}`]
                  }`}
                >
                  <HealthMark healthKey={reading.health.key} />
                  <span className={styles.chipLabel}>
                    {reading.health.label}
                  </span>
                </span>
                <span className={styles.main}>
                  <span className={styles.title} data-row-title>
                    {reading.project.title}
                  </span>
                  {/* The reason sits beside the project, never in a summary
                      above the list: when four of six are at risk, only the
                      reason makes the badge information. */}
                  <span className={styles.why}>
                    {reading.health.why.join(" · ")}
                  </span>
                </span>
                <CompositionBar buckets={reading.buckets} />
                <span
                  className={`${styles.client} ${
                    client === undefined ? styles.clientNone : ""
                  }`}
                >
                  {client ?? "No client"}
                </span>
                {/* The pair this screen exists for: how much work is still
                    open, and how long there is for it. The tone only shouts;
                    the sentence beside it says the same thing in words. */}
                <span className={styles.load}>
                  <b className={styles.open}>{reading.open.length} open</b>
                  <span
                    className={`${styles.left} ${
                      styles[`left_${deadlineTone(reading)}`]
                    }`}
                  >
                    {deadlineSentence(reading)}
                  </span>
                </span>
                {/* The prototype's sixth column held a lead avatar. The real
                    Project has no lead, so the slot stays empty and the three
                    layouts keep one grid. */}
                <span aria-hidden="true" className={styles.trailing} />
              </div>
            );
          })}
        </div>
      </div>
    ))}
  </div>
);
