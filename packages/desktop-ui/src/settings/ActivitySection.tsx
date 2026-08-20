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
  groupActivityOperations,
  type ActivityCategory,
  type ActivityItem,
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

const activityRecordKindLabel = (kind: string | undefined): string =>
  kind === undefined
    ? "Record"
    : kind
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, (value) => value.toUpperCase());

const ActivityRow = ({
  item,
  timezone,
  onUndo,
}: {
  readonly item: ActivityItem;
  readonly timezone: string | undefined;
  readonly onUndo: (targetCommandId: CommandId) => void;
}) => {
  const itemCategory = activityCategoryFor(item);
  return (
    <li className={styles.row}>
      <span
        className={`${styles.kindMark} ${styles[itemCategory] ?? ""}`}
        aria-hidden="true"
      >
        {activityCategoryMark[itemCategory]}
      </span>
      <span className={styles.rowCopy}>
        <small>
          {item.actor === undefined
            ? activityCategoryLabel(itemCategory)
            : `${item.actor.displayName}${item.actor.kind === "agent" ? " · agent" : ""}`}{" "}
          · {formatDateTime(item.occurredAt, timezone)}
        </small>
        <strong>
          {item.recordTitle ?? "Record details unavailable"}
          {item.recordKind === undefined
            ? ""
            : ` · ${activityRecordKindLabel(item.recordKind)}`}
        </strong>
        <span className={styles.action}>
          {activityLabels[item.activityType]}
        </span>
        {item.changedFields !== undefined && item.changedFields.length > 0 && (
          <code>{item.changedFields.join(" · ")}</code>
        )}
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
};

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
  const [actorPrincipalId, setActorPrincipalId] = useState("all");
  const [recordKind, setRecordKind] = useState("all");
  const items = activity.kind === "ready" ? activity.data.items : [];
  const actorOptions = useMemo(
    () =>
      [
        ...new Map(
          items
            .filter((item) => item.actor !== undefined)
            .map((item) => [item.actor!.principalId, item.actor!] as const),
        ).values(),
      ].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      ),
    [items],
  );
  const recordKindOptions = useMemo(
    () =>
      [
        ...new Set(
          items
            .map((item) => item.recordKind)
            .filter(
              (kind): kind is NonNullable<typeof kind> => kind !== undefined,
            ),
        ),
      ].sort((left, right) => left.localeCompare(right)),
    [items],
  );
  const filteredItems = useMemo(
    () =>
      filterActivityItems(items, category, query, actorPrincipalId, recordKind),
    [items, category, query, actorPrincipalId, recordKind],
  );
  const groups = useMemo(
    () => groupActivityItems(filteredItems, timezone),
    [filteredItems, timezone],
  );
  const filtersActive =
    category !== "all" ||
    actorPrincipalId !== "all" ||
    recordKind !== "all" ||
    query.trim().length > 0;
  const resetFilters = () => {
    setCategory("all");
    setActorPrincipalId("all");
    setRecordKind("all");
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
            Authorized records, actors and operation context. Full receipts stay
            in the audit log.
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
                placeholder="Record, actor or action"
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
            <label className={styles.categoryControl} htmlFor="activity-actor">
              <span>Actor</span>
              <select
                id="activity-actor"
                value={actorPrincipalId}
                onChange={(event) =>
                  setActorPrincipalId(event.currentTarget.value)
                }
              >
                <option value="all">All actors</option>
                {actorOptions.map((actor) => (
                  <option key={actor.principalId} value={actor.principalId}>
                    {actor.displayName}
                    {actor.kind === "agent" ? " · agent" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label
              className={styles.categoryControl}
              htmlFor="activity-record-kind"
            >
              <span>Record</span>
              <select
                id="activity-record-kind"
                value={recordKind}
                onChange={(event) => setRecordKind(event.currentTarget.value)}
              >
                <option value="all">All record kinds</option>
                {recordKindOptions.map((kind) => (
                  <option key={kind} value={kind}>
                    {activityRecordKindLabel(kind)}
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
                    {groupActivityOperations(group.items).map((operation) => {
                      if (!operation.grouped) {
                        const item = operation.items[0]!;
                        return (
                          <ActivityRow
                            key={item.eventId}
                            item={item}
                            timezone={timezone}
                            onUndo={onUndo}
                          />
                        );
                      }
                      const first = operation.items[0]!;
                      return (
                        <li className={styles.operation} key={operation.key}>
                          <details>
                            <summary>
                              <span>
                                <strong>
                                  {first.actor?.displayName ?? "Operation"}
                                </strong>
                                <small>
                                  {countLabel(operation.items.length, "change")}
                                  {first.hostRunId === undefined
                                    ? ""
                                    : ` · run ${first.hostRunId}`}
                                </small>
                              </span>
                              <span aria-hidden="true">⌄</span>
                            </summary>
                            <ol className={styles.list}>
                              {operation.items.map((item) => (
                                <ActivityRow
                                  key={item.eventId}
                                  item={item}
                                  timezone={timezone}
                                  onUndo={onUndo}
                                />
                              ))}
                            </ol>
                          </details>
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
