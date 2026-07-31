import { useState, type FormEvent } from "react";

import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  createSavedWorkView,
  deleteSavedWorkView,
  renameSavedWorkView,
  updateSavedWorkView,
  type DesktopSnapshot,
  type MutationFailure,
} from "../client/workflow.js";
import { InlinePopover } from "../components/InlinePopover.js";
import type { SurfaceDensity } from "../hooks/useSurfaceDensity.js";
import {
  availableTaskColumns,
  persistTaskColumns,
  taskColumnsFor,
  toggledTaskColumn,
  type TaskColumnKey,
} from "./task-columns.js";

/** What each built-in column is called. It lives HERE and not beside the keys,
 *  because only this chooser reads it and this chooser is lazy — a table of
 *  English strings imported by the Tasks screen would be paid for on first paint
 *  by every reader who never opens it. */
const COLUMN_LABELS: Readonly<Record<string, string>> = {
  project: "Project",
  plan: "Plan",
  deadline: "Deadline",
  state: "State",
  priority: "Priority",
  owner: "Owner",
};
import {
  savedViewGroupByOf,
  savedViewSortOf,
  type TaskGroupBy,
  type TaskLayout,
  type TaskSort,
  type WorkSavedView,
} from "./task-view.js";
import styles from "./saved-view-manager.module.css";

// Keeping a saved view: making one, renaming it, deleting it, and writing the
// reader's lens back into it.
//
// It moved here from the retired work surface, and the create form did NOT come
// with it. There it was ten controls — name, state, status, priority, deadline,
// assignee, project, a field and its predicate, grouping and order — standing
// beside a screen that had none of those. Tasks HAS them: a search box, a group
// select, an order select and a layout switcher, all above this. So the gesture
// is "save what I am looking at", and the conditions are edited afterwards by
// `SavedViewFilterForm`, which is the other half and was already here.
//
// A view created this way carries no filters. That is the honest reading of the
// gesture — the reader was looking at all the work, grouped and ordered a
// particular way — and it is one click from being narrowed.
//
// `lazy()` behind one trigger: Tasks is an eager destination and the hot path
// has a few hundred bytes left, so nothing here may be imported statically —
// including any helper this file might have exported for the mount to call.
//
// The armed delete is disarmed by the MOUNT, which keys this component on the
// open view. On the surface it left, that reset lived on a different control
// entirely — the view chip's own click handler — so rehoming the button without
// it would have left "Confirm delete" armed across a view switch, and one more
// click would have deleted the WRONG view, successfully, with no error
// anywhere.

export const SavedViewManager = ({
  client,
  snapshot,
  view,
  grouping,
  sort,
  layout,
  onOpened,
  onReload,
  onFailure,
  chosenColumns,
  fields,
  viewKey,
  onChooseColumns,
  density,
  onDensity,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  /** The view on screen, or none when the reader is on all the work. */
  readonly view: WorkSavedView | undefined;
  /** The lens as it stands, which is what "save this view" saves and what the
   *  writes below put back into a stored view. */
  readonly grouping: TaskGroupBy;
  readonly sort: TaskSort;
  readonly layout: TaskLayout;
  /** Opens a view by id — used when one has just been created, so the reader
   *  lands inside the thing they named instead of beside it. */
  readonly onOpened: (savedViewId: string) => void;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
  /** The two DEVICE-local preferences that came off the same surface. They are
   *  not saved-view state and never travel to the kernel — which is exactly why
   *  they ride in this component rather than in one of their own: Tasks is an
   *  eager destination with a few hundred bytes of hot path left, and a second
   *  lazy boundary beside this one would cost more than the controls do. */
  readonly chosenColumns: readonly TaskColumnKey[] | undefined;
  readonly viewKey: string;
  readonly onChooseColumns: (columns: readonly TaskColumnKey[]) => void;
  /** The workspace fields a column may name, so a heading reads as the field
   *  rather than as its id. */
  readonly fields: readonly {
    readonly id: string;
    readonly label: string;
    readonly state?: string | undefined;
  }[];
  readonly density: SurfaceDensity;
  readonly onDensity: (density: SurfaceDensity) => void;
}) => {
  const availableColumns = availableTaskColumns(fields);
  const columns = taskColumnsFor(chosenColumns, viewKey, availableColumns);
  const chooseColumns = (next: readonly TaskColumnKey[]): void => {
    onChooseColumns(next);
    persistTaskColumns(viewKey, next);
  };

  const [busy, setBusy] = useState<string>();
  const [openPopover, setOpenPopover] = useState<string>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const run = async <Result,>(
    id: string,
    operation: () => Promise<{ readonly kind: string }>,
  ): Promise<Result | undefined> => {
    if (busy !== undefined) return undefined;
    setBusy(id);
    try {
      const result = await operation();
      if (result.kind === "success") {
        await onReload();
        setOpenPopover((current) => (current === id ? undefined : current));
        return result as Result;
      }
      onFailure(result as MutationFailure);
      return undefined;
    } catch {
      onFailure({
        kind: "unavailable",
        message: "Could not reach the data layer. Nothing changed — try again.",
      });
      return undefined;
    } finally {
      setBusy(undefined);
    }
  };

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!client || name === "") return;
    const groupBy = savedViewGroupByOf(grouping);
    const created = await run<{ readonly savedViewId: string }>("create", () =>
      createSavedWorkView(
        client,
        snapshot,
        name,
        // No conditions. The reader was looking at all the work in a particular
        // shape, and that shape is what they asked to keep. Narrowing it is the
        // filter editor beside this, one click away.
        {},
        savedViewSortOf(sort),
        // Ungrouped is the key being ABSENT on create, never `null` and never
        // the word "none" — which is why the mapping answers null and this is
        // the one place that turns null into an omission.
        groupBy ?? undefined,
        layout,
      ),
    );
    if (created !== undefined) onOpened(created.savedViewId);
  };

  const submitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!client || view === undefined || name === "" || name === view.name)
      return;
    await run("rename", () =>
      renameSavedWorkView(client, snapshot, view.id, view.version, name),
    );
  };

  const remove = async (): Promise<void> => {
    if (!client || view === undefined) return;
    // Two clicks, and the FIRST one only arms. The button says which state it
    // is in, so the second click is never a surprise.
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    const deleted = await run("delete", () =>
      deleteSavedWorkView(client, snapshot, view.id, view.version),
    );
    if (deleted !== undefined) onOpened("");
  };

  /** Writing the lens on screen back into the stored view.
   *
   *  Until this, a view could be opened as itself but never re-saved: the only
   *  `savedView.update` the renderer sent carried `layout` alone, so a reader
   *  who regrouped a view and came back found the old grouping. */
  const keepLens = async (): Promise<void> => {
    if (!client || view === undefined) return;
    await run("keep", () =>
      updateSavedWorkView(client, snapshot, view, {
        sort: savedViewSortOf(sort),
        groupBy: savedViewGroupByOf(grouping),
        layout,
      }),
    );
  };

  return (
    <div className={styles.manager}>
      <InlinePopover
        disabled={!client}
        label="Save this view"
        onOpenChange={(next) => setOpenPopover(next ? "create" : undefined)}
        open={openPopover === "create"}
        panelLabel="Save the current view"
      >
        <form
          className={styles.form}
          onSubmit={(event) => void submitCreate(event)}
        >
          <label className={styles.field} htmlFor="saved-view-name">
            Name this view
          </label>
          <input
            id="saved-view-name"
            maxLength={200}
            name="name"
            placeholder="e.g. This week, by project"
            required
          />
          {/* What is actually being kept, said out loud. A reader who cannot
              see what "this view" means has to save one to find out. */}
          <p className={styles.note}>
            Keeps the grouping, order and layout on screen. Conditions are added
            after, with Edit filters.
          </p>
          <button disabled={busy !== undefined || !client} type="submit">
            {busy === "create" ? "Saving…" : "Save"}
          </button>
        </form>
      </InlinePopover>

      {view !== undefined && (
        <>
          <button
            className={styles.action}
            disabled={busy !== undefined || !client}
            onClick={() => void keepLens()}
            type="button"
          >
            {busy === "keep" ? "Keeping…" : "Keep this shape"}
          </button>

          <InlinePopover
            label="Rename"
            onOpenChange={(next) => setOpenPopover(next ? "rename" : undefined)}
            open={openPopover === "rename"}
            panelLabel={`Rename ${view.name}`}
          >
            <form
              className={styles.form}
              onSubmit={(event) => void submitRename(event)}
            >
              <label className={styles.field} htmlFor="saved-view-rename">
                New view name
              </label>
              <input
                defaultValue={view.name}
                id="saved-view-rename"
                maxLength={200}
                name="name"
                required
              />
              <button disabled={busy !== undefined || !client} type="submit">
                {busy === "rename" ? "Saving…" : "Rename"}
              </button>
            </form>
          </InlinePopover>

          <button
            className={styles.action}
            disabled={busy !== undefined || !client}
            onClick={() => void remove()}
            type="button"
          >
            {confirmingDelete ? "Confirm delete" : "Delete view"}
          </button>
        </>
      )}

      {/* Which columns the TABLE draws, kept per view. It chose LIST fields on
          the surface it came from, and moving it to the table is the substance
          of the move rather than a detail of it: the table is the layout that
          answers field by field, and choosing columns on a layout that has none
          was the older screen working around not having one. */}
      <InlinePopover
        label={`Columns · ${columns.length}`}
        onOpenChange={(next) => setOpenPopover(next ? "columns" : undefined)}
        open={openPopover === "columns"}
        panelLabel={`Columns in the table — ${view?.name ?? "All work"}`}
      >
        <div className={styles.form}>
          <p className={styles.note}>
            Title and status always show. Kept for this view, on this device.
          </p>
          {availableColumns.map((key) => (
            <label className={styles.choice} key={key}>
              <input
                checked={columns.includes(key)}
                onChange={() =>
                  chooseColumns(
                    toggledTaskColumn(columns, key, availableColumns),
                  )
                }
                type="checkbox"
              />
              {key.startsWith("field:")
                ? (fields.find((definition) => `field:${definition.id}` === key)
                    ?.label ?? key.slice("field:".length))
                : (COLUMN_LABELS[key] ?? key)}
            </label>
          ))}
          <button
            className={styles.action}
            onClick={() => chooseColumns(availableColumns)}
            type="button"
          >
            Show all
          </button>
        </div>
      </InlinePopover>

      {/* Row height, per device. Compact may change SPACING only — never
          `display`, `visibility` or `font-size` — because density that hides
          content or shrinks type is not density. */}
      <fieldset className={styles.density}>
        <legend className="sr-only">Row height</legend>
        <button
          aria-pressed={density === "comfortable"}
          className={styles.action}
          onClick={() => onDensity("comfortable")}
          type="button"
        >
          Comfortable
        </button>
        <button
          aria-pressed={density === "compact"}
          className={styles.action}
          onClick={() => onDensity("compact")}
          type="button"
        >
          Compact
        </button>
      </fieldset>
    </div>
  );
};
