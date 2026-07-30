import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import { RECORD_TAB_LABELS, type RecordTab } from "./record-tabs.js";
import styles from "./record-tabs.module.css";

// The tab bar all three record kinds wear — task, project, organization — and
// the panel it names.
//
// The tab SET arrives as a prop rather than being read from `RECORD_TABS`: the
// three kinds do not offer the same sections, and a strip that draws every tab
// it knows about would put a Tasks tab on an organization. The COUNTS arrive
// the same way, because each one is a different question about a different
// collection and only the caller has read them.
//
// This component holds no state. Which tab is open is per-record and persists,
// so it belongs to whoever owns that record's state — not to the bar.

/**
 * ARIA ids are built from the record id and the tab KEY, never from a label.
 *
 * `aria-controls` and `aria-labelledby` take a space-separated LIST of ids, so
 * an id containing a space silently becomes two references that resolve to
 * nothing: the tab controls no panel and the panel has no name. Nothing throws
 * — the relationship is simply gone. Labels are the only strings on this bar
 * that can contain a space, so they are kept out of ids entirely.
 */
const idSafe = (recordId: string): string => recordId.replace(/\s+/gu, "-");

export const recordTabId = (recordId: string, tab: RecordTab): string =>
  `tab-${idSafe(recordId)}-${tab}`;

export const recordPanelId = (recordId: string): string =>
  `panel-${idSafe(recordId)}`;

/**
 * Where each key lands. Arrows wrap, because a five-item bar has no reason to
 * dead-end; Home and End are the direct route to the ends either way.
 */
const nextIndex = (
  key: string,
  index: number,
  count: number,
): number | undefined => {
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return undefined;
};

export interface RecordTabStripProps {
  /** The record the strip belongs to; the ids on the page are built from it. */
  readonly recordId: string;
  readonly tabs: readonly RecordTab[];
  /** A tab with no entry shows no count — which is not the same as a zero. */
  readonly counts: Partial<Record<RecordTab, number>>;
  readonly selected: RecordTab;
  readonly onSelect: (tab: RecordTab) => void;
  readonly children: ReactNode;
}

export const RecordTabStrip = ({
  recordId,
  tabs,
  counts,
  selected,
  onSelect,
  children,
}: RecordTabStripProps) => {
  const buttons = useRef(new Map<RecordTab, HTMLButtonElement>());
  const pending = useRef<RecordTab | undefined>(undefined);

  // Activation moves focus to the button that replaced the one just used. React
  // rebuilds the strip on selection, and focus left on a node that is gone
  // falls to the document body — the next Tab then starts from the top of the
  // page instead of continuing from the bar.
  useEffect(() => {
    const target = pending.current;
    if (target === undefined) return;
    pending.current = undefined;
    buttons.current.get(target)?.focus();
  });

  // A stored key this record kind does not offer must not leave the strip with
  // nothing selected and `aria-labelledby` pointing at an id that is not on the
  // page. `restoreTab` cannot catch that on its own: it validates against every
  // tab that exists, not against the subset one kind shows.
  const active = tabs.includes(selected) ? selected : tabs[0];

  const activate = (tab: RecordTab): void => {
    if (tab === active) {
      buttons.current.get(tab)?.focus();
      return;
    }
    pending.current = tab;
    onSelect(tab);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (active === undefined) return;
    const target = nextIndex(event.key, tabs.indexOf(active), tabs.length);
    if (target === undefined) return;
    const tab = tabs[target];
    if (tab === undefined) return;
    event.preventDefault();
    activate(tab);
  };

  const panelId = recordPanelId(recordId);

  return (
    <>
      <div
        aria-label="Record sections"
        className={styles.strip}
        onKeyDown={onKeyDown}
        role="tablist"
      >
        {tabs.map((tab) => {
          const count = counts[tab];
          // Only the open tab is a Tab stop: the bar is one control, and the
          // arrows are how you move inside it.
          return (
            <button
              aria-controls={panelId}
              aria-selected={tab === active}
              className={styles.tab}
              data-record-tab={tab}
              id={recordTabId(recordId, tab)}
              key={tab}
              onClick={() => activate(tab)}
              ref={(node) => {
                if (node === null) buttons.current.delete(tab);
                else buttons.current.set(tab, node);
              }}
              role="tab"
              tabIndex={tab === active ? 0 : -1}
              type="button"
            >
              {RECORD_TAB_LABELS[tab]}
              {/* Left inside the button on purpose, so the count is part of the
                  tab's accessible name. It is the whole compensation for
                  decision #28 — a strip was seen in passing, a tab will not
                  show itself — and hiding it from a screen reader would spend
                  the price of that decision without buying anything. */}
              {count === undefined ? null : (
                <span className={styles.count}>{count}</span>
              )}
            </button>
          );
        })}
      </div>
      <div
        aria-labelledby={
          active === undefined ? undefined : recordTabId(recordId, active)
        }
        className={styles.panel}
        id={panelId}
        role="tabpanel"
        tabIndex={0}
      >
        {children}
      </div>
    </>
  );
};
