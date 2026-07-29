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
} from "./activity-collection.js";
import type { DesktopSnapshot } from "./client/workflow.js";
import { Icon } from "./components/Icon.js";
import { countLabel, formatDateTime } from "./i18n.js";

import "./activity-surface.css";

const ActivityHeader = () => (
  <header className="surface-header wave2-header">
    <div>
      <p className="eyebrow">Meaningful activity</p>
      <h1 id="surface-title" tabIndex={-1}>
        Activity
      </h1>
      <p>
        Confirmed changes. Attribution and full receipts stay in the audit log.
      </p>
    </div>
  </header>
);

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
    <div>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
    {action}
  </div>
);

export const ActivitySurface = ({
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
    <div className="surface-scroll">
      <ActivityHeader />
      <section
        className="meaningful-timeline reading-panel"
        aria-labelledby="timeline-title"
      >
        <header className="section-heading activity-heading">
          <div>
            <p className="eyebrow">Local timeline</p>
            <h2 id="timeline-title">Recent changes</h2>
          </div>
          {activity.kind === "ready" && items.length > 0 && (
            <p
              className="activity-result-count"
              role="status"
              aria-live="polite"
            >
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
            <div className="activity-controls" aria-label="Activity filters">
              <label className="activity-search" htmlFor="activity-search">
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
                className="activity-category-control"
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
                className="quiet-button activity-clear-filters"
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
              <div className="activity-groups">
                {groups.map((group) => (
                  <section
                    className="activity-group"
                    key={group.key}
                    aria-labelledby={`activity-group-${group.key}`}
                  >
                    <header>
                      <h3 id={`activity-group-${group.key}`}>{group.label}</h3>
                      <span>{countLabel(group.items.length, "change")}</span>
                    </header>
                    <ol className="activity-list">
                      {group.items.map((item) => {
                        const itemCategory = activityCategoryFor(item);
                        return (
                          <li className="activity-row" key={item.eventId}>
                            <span
                              className={`activity-kind-mark activity-kind-mark--${itemCategory}`}
                              aria-hidden="true"
                            >
                              {activityCategoryMark[itemCategory]}
                            </span>
                            <span className="activity-row-copy">
                              <small>
                                {activityCategoryLabel(itemCategory)} ·{" "}
                                {formatDateTime(item.occurredAt, timezone)}
                              </small>
                              <strong>
                                {activityLabels[item.activityType]}
                              </strong>
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
    </div>
  );
};
