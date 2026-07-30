import { useMemo, useState, type FormEvent } from "react";

import type {
  SavedWorkView,
  SavedWorkViewFilterChange,
} from "../client/workflow.js";
import { PRIORITY_LABELS, type TaskStatus } from "./task-view.js";
import styles from "./saved-view-filters.module.css";

// Editing the conditions of a view that already exists. Until this, a saved
// view was writable exactly once — at creation — and the renderer's only
// `savedView.update` sent nothing but `layout`.
//
// There is deliberately NO create form here. Creating a view lives on Work
// (`WorkSurface.tsx:675-768`) and is not duplicated onto Tasks. Editing was
// the missing half; creating was not forgotten.
//
// This form shows FOUR of the nine conditions a view can carry. The other
// five — relation conditions, field predicates, assignees, the scheduled flag
// and the unassigned flag — are not editable here and MUST survive an edit
// untouched. That is not a promise this component keeps by being careful: the
// kernel replaces `filters` wholesale, so it is kept by `updateSavedWorkView`
// seeding the whole object from the stored view. This form names only what it
// changed.

type Filters = SavedWorkView["filters"];
type OperationalState = NonNullable<Filters["operationalStates"]>[number];
type Priority = NonNullable<Filters["priorities"]>[number];
type DueWindow = NonNullable<Filters["dueWindow"]>;
type StatusId = NonNullable<Filters["statusIds"]>[number];

/** Display order. The label maps beside them are keyed by the contract union
 *  rather than by `string`, so a member added to the vocabulary stops the
 *  build here instead of rendering a condition with no name on it. */
const OPERATIONAL_STATES: readonly OperationalState[] = [
  "actionable",
  "waiting",
  "blocked",
];
const PRIORITIES: readonly Priority[] = ["urgent", "high", "normal", "low"];
const DUE_WINDOWS: readonly DueWindow[] = ["overdue", "today", "this_week"];

const STATE_LABELS: Record<OperationalState, string> = {
  actionable: "Actionable",
  waiting: "Waiting",
  blocked: "Blocked",
};

const DUE_LABELS: Record<DueWindow, string> = {
  overdue: "Overdue",
  today: "Due today",
  this_week: "Due this week",
};

/** What the four controls hold. An empty list and an empty deadline both mean
 *  "this view does not constrain that", which is the ABSENT key rather than an
 *  empty one — the difference the kernel reads. */
interface Selection {
  readonly operationalStates: OperationalState[];
  readonly priorities: Priority[];
  readonly statusIds: StatusId[];
  readonly dueWindow: DueWindow | "";
}

const selectionOf = (filters: Filters): Selection => ({
  operationalStates: filters.operationalStates ?? [],
  priorities: filters.priorities ?? [],
  statusIds: filters.statusIds ?? [],
  dueWindow: filters.dueWindow ?? "",
});

const toggled = <Member extends string>(
  list: readonly Member[],
  member: Member,
): Member[] =>
  list.includes(member)
    ? list.filter((value) => value !== member)
    : [...list, member];

/** Order-insensitive on purpose. The stored order is whoever wrote the view's,
 *  and rebuilding it in this form's display order would otherwise report a
 *  change nobody made — leaving Save lit on a form nobody touched. */
const sameList = (
  left: readonly string[],
  right: readonly string[] | undefined,
): boolean => {
  const other = right ?? [];
  if (left.length !== other.length) return false;
  const ordered = [...other].sort();
  return [...left].sort().every((value, index) => value === ordered[index]);
};

/** Only the conditions this reader actually moved. `null` is what removes one;
 *  omitting the key would leave it as it was, which is a different answer. */
const changeOf = (
  selection: Selection,
  filters: Filters,
): SavedWorkViewFilterChange => ({
  ...(sameList(selection.operationalStates, filters.operationalStates)
    ? {}
    : {
        operationalStates:
          selection.operationalStates.length === 0
            ? null
            : selection.operationalStates,
      }),
  ...(sameList(selection.priorities, filters.priorities)
    ? {}
    : {
        priorities:
          selection.priorities.length === 0 ? null : selection.priorities,
      }),
  ...(sameList(selection.statusIds, filters.statusIds)
    ? {}
    : {
        statusIds:
          selection.statusIds.length === 0 ? null : selection.statusIds,
      }),
  ...(selection.dueWindow === (filters.dueWindow ?? "")
    ? {}
    : {
        dueWindow: selection.dueWindow === "" ? null : selection.dueWindow,
      }),
});

export const SavedViewFilterForm = ({
  busy = false,
  onSave,
  statuses,
  view,
}: {
  readonly busy?: boolean;
  /** Resolves true only once the write is confirmed, for the reason every
   *  other composer in this app takes the same shape: a refused edit has to
   *  leave the selection where the reader left it. */
  readonly onSave: (change: SavedWorkViewFilterChange) => Promise<boolean>;
  readonly statuses: readonly TaskStatus[];
  readonly view: SavedWorkView;
}) => {
  // Remembers WHICH view it was opened on, not merely that it was opened. A
  // boolean would leave the form standing open across a view switch showing
  // one view's controls over another view's conditions, and a selection
  // staged on the first would still be sitting in it.
  const [openedOn, setOpenedOn] = useState<string>();
  const [selection, setSelection] = useState<Selection>(() =>
    selectionOf(view.filters),
  );
  const [saving, setSaving] = useState(false);
  const open = openedOn === view.id;

  const change = useMemo(
    () => changeOf(selection, view.filters),
    [selection, view.filters],
  );
  const changed = Object.keys(change).length > 0;

  // An archived status still filters a stored view, so one this view already
  // names stays offered. Dropping it would leave a condition nobody can see
  // and nobody can remove, quietly narrowing every result.
  const offered = statuses.filter(
    (status) =>
      status.state !== "archived" || selection.statusIds.includes(status.id),
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!changed || saving || busy) return;
    setSaving(true);
    try {
      // Nothing is cleared afterwards. Save goes quiet on its own once the
      // refreshed view agrees with the selection — which is the confirmation
      // — and a refused write leaves every box where the reader left it.
      //
      // `onSave` must not resolve before the refreshed view is in hand. Until
      // it is, `changed` still reads against the OLD conditions, so a second
      // click would send the old version against a record the write already
      // moved — a version conflict reported on a save that landed.
      await onSave(change);
    } finally {
      // Reloading the shell can throw. Leaving `saving` set would then hold
      // the form shut for good over a write that may well have gone through.
      setSaving(false);
    }
  };

  return (
    <div className={styles.editor}>
      <button
        aria-expanded={open}
        className={styles.disclosure}
        onClick={() => {
          if (open) {
            setOpenedOn(undefined);
            return;
          }
          setOpenedOn(view.id);
          setSelection(selectionOf(view.filters));
        }}
        type="button"
      >
        {open ? "Close filters" : "Edit filters"}
      </button>
      {open && (
        <form
          aria-label="Saved view filters"
          className={styles.form}
          onSubmit={submit}
        >
          <div
            aria-label="State"
            className={styles.group}
            data-condition="operationalStates"
            role="group"
          >
            <span className={styles.groupName}>State</span>
            {OPERATIONAL_STATES.map((state) => (
              <label className={styles.choice} key={state}>
                <input
                  checked={selection.operationalStates.includes(state)}
                  onChange={() => {
                    setSelection((current) => ({
                      ...current,
                      operationalStates: toggled(
                        current.operationalStates,
                        state,
                      ),
                    }));
                  }}
                  type="checkbox"
                  value={state}
                />
                <span>{STATE_LABELS[state]}</span>
              </label>
            ))}
          </div>

          <div
            aria-label="Priority"
            className={styles.group}
            data-condition="priorities"
            role="group"
          >
            <span className={styles.groupName}>Priority</span>
            {PRIORITIES.map((priority) => (
              <label className={styles.choice} key={priority}>
                <input
                  checked={selection.priorities.includes(priority)}
                  onChange={() => {
                    setSelection((current) => ({
                      ...current,
                      priorities: toggled(current.priorities, priority),
                    }));
                  }}
                  type="checkbox"
                  value={priority}
                />
                <span>{PRIORITY_LABELS[priority]}</span>
              </label>
            ))}
          </div>

          {offered.length > 0 && (
            <div
              aria-label="Status"
              className={styles.group}
              data-condition="statusIds"
              role="group"
            >
              <span className={styles.groupName}>Status</span>
              {offered.map((status) => (
                <label className={styles.choice} key={status.id}>
                  <input
                    checked={selection.statusIds.includes(status.id)}
                    onChange={() => {
                      setSelection((current) => ({
                        ...current,
                        statusIds: toggled(current.statusIds, status.id),
                      }));
                    }}
                    type="checkbox"
                    value={status.id}
                  />
                  <span>{status.label}</span>
                </label>
              ))}
            </div>
          )}

          {/* A wrapping label names the select without an `id`: this form can
              in principle stand beside a second one, and two elements sharing
              an id name each other's control. */}
          <label className={styles.group} data-condition="dueWindow">
            <span className={styles.groupName}>Deadline</span>
            <select
              onChange={(event) => {
                setSelection((current) => ({
                  ...current,
                  dueWindow: event.target.value as DueWindow | "",
                }));
              }}
              value={selection.dueWindow}
            >
              <option value="">Any deadline</option>
              {DUE_WINDOWS.map((deadline) => (
                <option key={deadline} value={deadline}>
                  {DUE_LABELS[deadline]}
                </option>
              ))}
            </select>
          </label>

          <p className={styles.note}>Conditions not shown here are kept.</p>

          <div className={styles.actions}>
            <button
              className={styles.save}
              disabled={!changed || saving || busy}
              type="submit"
            >
              Save filters
            </button>
            <span className={styles.hint}>
              {saving ? "Saving…" : changed ? "" : "Nothing changed yet."}
            </span>
          </div>
        </form>
      )}
    </div>
  );
};
