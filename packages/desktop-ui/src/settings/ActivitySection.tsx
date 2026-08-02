import { useMemo, useState } from "react";

import type { CommandId } from "@constellation/contracts";

import {
  activityCategoryDefinitions,
  activityCategoryFor,
  activityCategoryLabel,
  activityCategoryMark,
  activityLabels,
  filterActivityItems,
  groupActivityItems,
  type ActivityCategory,
} from "../activity-collection.js";
import type { DesktopSnapshot } from "../client/workflow.js";
import { Icon } from "../components/Icon.js";
import { countLabel, formatDateTime } from "../i18n.js";
import { settingsPaneElementId } from "../settings-categories.js";

import styles from "./activity-section.module.css";

/**
 * WHAT HAPPENED TO YOUR DATA, AND HOW TO TAKE IT BACK — inside Settings.
 *
 * This was a destination of its own until Wave E. It is not a Library reading
 * and it is not a seventh Settings category: Library means the READING
 * MATERIAL — what you wrote and what you collected — and a workspace audit log
 * is not knowledge, it is the record of what the system did to your data
 * across every record family. Putting it in Library would have redefined
 * Library from "the reading material" into "lists of things", which is the
 * inversion this whole rebuild exists to undo. A reverse-chronological list of
 * what changed WITH UNDO answers a `Data and privacy` question, so it is a
 * pane of that category.
 *
 * IT ADDS NO SETTING, so the category's badge does not move — and that is the
 * test for whether a thing belongs IN a category rather than BEING one.
 *
 * The section is a SECTION, not a surface: no `h1`, no `#surface-title`, no
 * whole-screen state. `Settings` owns the screen's name, and a second element
 * carrying that id would take the main landmark's `aria-labelledby` with it.
 * Same ruling as `AccessSection`, for the same reason.
 */
/**
 * KLASY MODUŁOWE NA `h3` I `p`, i to nie jest kosmetyka. Rejestr długu bramki
 * układu dopasowuje po sygnaturze `tag.class`, a bramka trzyma NAJSZERSZEGO
 * potomka o danej sygnaturze na danym ekranie. Gołe `h3` i `p` były
 * jednoznaczne tylko dopóki `activity` było własnym ekranem; wewnątrz Ustawień
 * `settings / p` pilnowałoby po cichu całej sześciokategoriowej strony zamiast
 * tej tafli — czyli wpis o jednym elemencie zacząłby mierzyć coś innego, nie
 * mówiąc o tym ani słowa.
 */
const ActivityInlineState = ({
  title,
  detail,
  action,
}: {
  readonly title: string;
  readonly detail: string;
  readonly action?: React.ReactNode;
}) => (
  <div className="empty-state empty-state--neutral" role="status">
    <span className="empty-glyph">
      <span className="record-mark mark-empty" aria-hidden="true" />
    </span>
    <div className={styles.stateCopy}>
      <h3 className={styles.stateTitle}>{title}</h3>
      <p className={styles.stateDetail}>{detail}</p>
    </div>
    {action}
  </div>
);

export const ActivitySection = ({
  activity,
  timezone,
  onUndo,
  onRetry,
}: {
  readonly activity: DesktopSnapshot["activity"];
  readonly timezone?: string;
  readonly onUndo: (targetCommandId: CommandId) => void;
  readonly onRetry: () => void;
}) => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ActivityCategory>("all");
  const items = activity.kind === "ready" ? activity.data.items : [];
  const filteredItems = useMemo(
    () => filterActivityItems(items, category, query),
    [items, category, query],
  );
  const groups = useMemo(
    () => groupActivityItems(filteredItems, timezone),
    [filteredItems, timezone],
  );
  const filtersActive = category !== "all" || query.trim().length > 0;
  const resetFilters = () => {
    setCategory("all");
    setQuery("");
  };

  return (
    <section
      className={styles.root}
      /* THE PANE'S OWN ANCHOR, and it is what the palette route lands on. The
         id comes from the same vocabulary the palette destination is derived
         from, so a pane that is declared and never mounted is a broken link
         rather than a silent one — asserted in
         `settings-reachability.interaction.test.tsx`. */
      id={settingsPaneElementId("activity")}
      data-settings-pane="activity"
      aria-labelledby="settings-activity-title"
    >
      <header className={styles.head}>
        <div>
          <p className="eyebrow">Meaningful activity</p>
          <h2 id="settings-activity-title" className={styles.title}>
            Activity
          </h2>
          <p className={styles.lede}>
            Confirmed changes. Attribution and full receipts stay in the audit
            log.
          </p>
        </div>
        {activity.kind === "ready" && items.length > 0 && (
          <p className={styles.resultCount} role="status" aria-live="polite">
            {filtersActive
              ? `${countLabel(filteredItems.length, "result")} of ${items.length}`
              : countLabel(items.length, "change")}
          </p>
        )}
      </header>
      {activity.kind === "unavailable" ? (
        <ActivityInlineState
          title="Activity is unavailable"
          detail={activity.message}
          action={
            <button
              type="button"
              className="secondary-button"
              onClick={onRetry}
            >
              Try again
            </button>
          }
        />
      ) : items.length === 0 ? (
        <ActivityInlineState
          title="No meaningful changes yet"
          detail="Creating a project, routing a Capture or changing a task will show up here."
        />
      ) : (
        <>
          <div className={styles.controls} aria-label="Activity filters">
            <label className={styles.search} htmlFor="activity-search">
              <span className="sr-only">Search activity</span>
              <Icon name="search" />
              <input
                id="activity-search"
                type="search"
                value={query}
                placeholder="Event or record ID"
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </label>
            <label
              className={styles.categoryControl}
              htmlFor="activity-category"
            >
              <span>Category</span>
              <select
                id="activity-category"
                value={category}
                onChange={(event) =>
                  setCategory(event.currentTarget.value as ActivityCategory)
                }
              >
                {activityCategoryDefinitions.map((definition) => (
                  <option key={definition.id} value={definition.id}>
                    {definition.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={`quiet-button ${styles.clearFilters}`}
              disabled={!filtersActive}
              onClick={resetFilters}
            >
              Clear
            </button>
          </div>

          {filteredItems.length === 0 ? (
            <ActivityInlineState
              title="No matching changes"
              detail="Change the category or the search words. The full history is unchanged."
              action={
                <button
                  type="button"
                  className="secondary-button"
                  onClick={resetFilters}
                >
                  Show all
                </button>
              }
            />
          ) : (
            <div className={styles.groups}>
              {groups.map((group) => (
                <section
                  className={styles.group}
                  key={group.key}
                  aria-labelledby={`activity-group-${group.key}`}
                >
                  <header>
                    <h3
                      className={styles.groupTitle}
                      id={`activity-group-${group.key}`}
                    >
                      {group.label}
                    </h3>
                    <span>{countLabel(group.items.length, "change")}</span>
                  </header>
                  <ol className={styles.list}>
                    {group.items.map((item) => {
                      const itemCategory = activityCategoryFor(item);
                      return (
                        <li className={styles.row} key={item.eventId}>
                          <span
                            className={`${styles.kindMark} ${styles[itemCategory] ?? ""}`}
                            aria-hidden="true"
                          >
                            {activityCategoryMark[itemCategory]}
                          </span>
                          <span className={styles.rowCopy}>
                            <small>
                              {activityCategoryLabel(itemCategory)} ·{" "}
                              {formatDateTime(item.occurredAt, timezone)}
                            </small>
                            <strong>{activityLabels[item.activityType]}</strong>
                            <code>record {item.recordId.slice(0, 8)}</code>
                          </span>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => onUndo(item.targetCommandId)}
                          >
                            Preview undo
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};
