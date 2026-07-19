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
      <p className="eyebrow">Znacząca aktywność</p>
      <h1 id="surface-title" tabIndex={-1}>
        Aktywność
      </h1>
      <p>
        Timeline pokazuje potwierdzone zmiany. Atrybucja i pełny receipt
        pozostają w audycie.
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
            <p className="eyebrow">Lokalny timeline</p>
            <h2 id="timeline-title">Ostatnie zmiany</h2>
          </div>
          {activity.kind === "ready" && items.length > 0 && (
            <p
              className="activity-result-count"
              role="status"
              aria-live="polite"
            >
              {filtersActive
                ? `${countLabel(filteredItems.length, "wynik", "wyniki", "wyników")} z ${items.length}`
                : countLabel(items.length, "zmiana", "zmiany", "zmian")}
            </p>
          )}
        </header>
        {activity.kind === "unavailable" ? (
          <ActivityInlineState
            title="Aktywność jest niedostępna"
            detail={activity.message}
            action={
              <button
                type="button"
                className="secondary-button"
                onClick={onRetry}
              >
                Spróbuj ponownie
              </button>
            }
          />
        ) : items.length === 0 ? (
          <ActivityInlineState
            title="Nie ma jeszcze znaczących zmian"
            detail="Utworzenie projektu, routing Capture lub zmiana zadania pojawią się tutaj."
          />
        ) : (
          <>
            <div
              className="activity-controls"
              aria-label="Filtrowanie aktywności"
            >
              <label className="activity-search" htmlFor="activity-search">
                <span className="sr-only">Szukaj w aktywności</span>
                <Icon name="search" />
                <input
                  id="activity-search"
                  type="search"
                  value={query}
                  placeholder="Zdarzenie lub ID rekordu"
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
              </label>
              <label
                className="activity-category-control"
                htmlFor="activity-category"
              >
                <span>Rodzaj</span>
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
                Wyczyść
              </button>
            </div>

            {filteredItems.length === 0 ? (
              <ActivityInlineState
                title="Brak pasujących zmian"
                detail="Zmień rodzaj lub wyszukiwane słowa. Pełna historia pozostała bez zmian."
                action={
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={resetFilters}
                  >
                    Pokaż wszystkie
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
                      <span>
                        {countLabel(
                          group.items.length,
                          "zmiana",
                          "zmiany",
                          "zmian",
                        )}
                      </span>
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
                              <code>rekord {item.recordId.slice(0, 8)}</code>
                            </span>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => onUndo(item.targetCommandId)}
                            >
                              Podgląd cofnięcia
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
