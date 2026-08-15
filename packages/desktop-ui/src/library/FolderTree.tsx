import { useEffect, useRef, useState } from "react";

import type { FolderId } from "@constellation/contracts";

import { Icon } from "../components/Icon.js";
import { TopicHelp } from "../help/TopicHelp.js";
import { countLabel } from "../i18n.js";
import {
  ALL_NOTES,
  UNFILED,
  visibleTreeRows,
  type FolderSummary,
  type NoteSummary,
  type TreeSelection,
} from "./folder-tree.js";
import styles from "./notes.module.css";

// PANEL 1 — THE FOLDER TREE. A real tree, not a list that looks like one.
//
// The rows are flattened into ONE array with a declared `aria-level` rather
// than nested `role="group"`s: the keyboard then walks the order a reader can
// SEE, without recursing per arrow key, and collapsing a node is a change to
// which rows exist rather than to how deep the walk goes.
//
// TWO TRAPS ALREADY PAID FOR, ported as behaviour rather than as markup:
//
//   1. THE TREE KEEPS EXACTLY ONE TAB STOP, INCLUDING AFTER THE FOCUSED NODE
//      IS COLLAPSED. Roving `tabindex` puts the stop on the focused row; if a
//      collapse takes that row off the screen and nothing moves the stop, the
//      whole tree leaves the Tab order until the window reloads. `tabStopKey`
//      below is therefore computed from the rows that EXIST, falling back to
//      the first one, rather than from the key that was last focused.
//   2. MOVING FOCUS RE-RENDERS NOTHING. Walking the tree with the arrow keys
//      changes what is focused and nothing else — it does not select, does not
//      change the list beside it, and does not reload anything.
//
// Every key press stops propagating for the reason the prototype ran its
// listener in the capture phase: the surrounding shell binds arrow keys to list
// rows regardless of where focus is, so an arrow pressed inside the tree would
// otherwise scroll the note list beside it.
//
// CLICKING A FOLDER SELECTS IT AND OPENS IT, one gesture, and that is why there
// is no separate twist button: a nested control inside a `treeitem` is a button
// a screen reader announces as part of the item's own name, which is the exact
// mistake the note row avoids with its record link. Pure expansion without
// selection stays available on `→` / `←`.

export const FolderTree = ({
  folders,
  notes,
  selection,
  expanded,
  onSelect,
  onToggle,
  onDropNote,
  notesReadable = true,
}: {
  readonly folders: readonly FolderSummary[];
  readonly notes: readonly NoteSummary[];
  readonly selection: TreeSelection;
  readonly expanded: ReadonlySet<FolderId>;
  readonly onSelect: (selection: TreeSelection) => void;
  readonly onToggle: (folderId: FolderId, open: boolean) => void;
  /** `null` is Unfiled — a destination, never an absence. */
  readonly onDropNote: (folderId: FolderId | null) => void;
  /** False when `notes` is what a refused `document.list` degraded to, so the
   *  two rows counted from it withdraw their number instead of printing zero. */
  readonly notesReadable?: boolean;
}) => {
  const rows = visibleTreeRows(folders, notes, expanded, notesReadable);
  const [focusKey, setFocusKey] = useState<TreeSelection>(selection);
  const [dropTarget, setDropTarget] = useState<TreeSelection | undefined>();
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const seatOn = useRef<TreeSelection | undefined>(undefined);

  // Exactly one row is a Tab stop, always, and it is one that exists.
  const tabStopKey =
    rows.find((row) => row.key === focusKey)?.key ?? rows[0]?.key ?? ALL_NOTES;

  // Focus is seated only when a key press asked for it. Re-seating on every
  // render would steal focus from the list beside the tree whenever the
  // projection reloaded.
  useEffect(() => {
    const wanted = seatOn.current;
    if (wanted === undefined) return;
    seatOn.current = undefined;
    nodes.current.get(String(wanted))?.focus();
  });

  const move = (from: TreeSelection, delta: number) => {
    const at = rows.findIndex((row) => row.key === from);
    const next = rows[Math.min(Math.max(at + delta, 0), rows.length - 1)];
    if (next === undefined) return;
    setFocusKey(next.key);
    seatOn.current = next.key;
  };

  const collapse = (key: TreeSelection) => {
    const row = rows.find((entry) => entry.key === key);
    if (row === undefined) return;
    if (row.kind === "folder" && row.hasChildren && row.expanded) {
      onToggle(row.key as FolderId, false);
      return;
    }
    // Already closed, or a leaf: `←` walks to the parent, which is the row
    // above it at one level less.
    const at = rows.findIndex((entry) => entry.key === key);
    for (let index = at - 1; index >= 0; index -= 1) {
      const candidate = rows[index];
      if (candidate !== undefined && candidate.level < row.level) {
        setFocusKey(candidate.key);
        seatOn.current = candidate.key;
        return;
      }
    }
  };

  const onKeyDown = (event: React.KeyboardEvent, key: TreeSelection) => {
    const row = rows.find((entry) => entry.key === key);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        event.stopPropagation();
        move(key, 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        move(key, -1);
        return;
      case "Home":
        event.preventDefault();
        event.stopPropagation();
        move(key, -rows.length);
        return;
      case "End":
        event.preventDefault();
        event.stopPropagation();
        move(key, rows.length);
        return;
      case "ArrowRight":
        event.preventDefault();
        event.stopPropagation();
        if (row?.kind === "folder" && row.hasChildren && !row.expanded)
          onToggle(row.key as FolderId, true);
        else move(key, 1);
        return;
      case "ArrowLeft":
        event.preventDefault();
        event.stopPropagation();
        collapse(key);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        event.stopPropagation();
        onSelect(key);
        return;
      default:
        return;
    }
  };

  return (
    <div className={styles.treePanel}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}>
          <h2>Folders</h2>
        </div>
        {/* The number of FOLDERS, not of notes — the notes are counted beside
            each name and again on the list's own header. The global class stays
            so the shared rule keeps ONE owner; the module class beside it flattens
            the pill for this screen only (see the sheet). */}
        <span className={`library-count ${styles.headCount}`}>
          {folders.length}
        </span>
        {/* WPIS 11-8 DOKUMENTU PRZEJŚCIA, POŁOWA DOTYCZĄCA POMOCY. Prototyp:
            `v3/screens/knowledge.js:807` —
            `<div class="kn-side-head"><span>Folders</span><span class="kn-n">N
            </span>${"${helpBtn(\"folders\")}"}</div>`. Plakietka stoi ZA
            liczbą, na prawym końcu głowy, i tak samo wypada tutaj: `.panelHead`
            jest flexem, a `.panelTitle` ma `flex: 1 1 auto`, więc licznik
            i plakietka lądują obok siebie z `gap: var(--space-2)`.

            WERSALIKÓW TEN LOT NIE DOTYKA, i to jest zapisane, nie przeoczone:
            druga połowa wpisu 11-8 mówi o `text-transform`, a para D3-04a
            ŚWIADOMIE go na tej głowie nie asertuje — ta głowa niesie ścieżkę
            folderu czytelnika, a nie napis stały. Powód stoi przy parze. */}
        <TopicHelp topic="folders" />
      </div>
      <div className={styles.treeScroll}>
        <div aria-label="Folders" className={styles.tree} role="tree">
          {rows.map((row, index) => {
            const droppable = row.kind !== "all";
            const selected = row.key === selection;
            return (
              <button
                aria-expanded={row.hasChildren ? row.expanded : undefined}
                // THE FULL PATH, not the leaf, and NOT in a `title`: the name
                // truncates in a narrow column, and this project's help rule
                // says an explanation that lives in a tooltip does not exist
                // for a keyboard, for touch, or for anybody not hovering. The
                // accessible name is where the address belongs.
                aria-label={`${row.path}, ${
                  row.count === undefined
                    ? "note count unavailable, the note list could not be read"
                    : countLabel(row.count, "note")
                }`}
                aria-level={row.level}
                aria-posinset={index + 1}
                aria-selected={selected}
                aria-setsize={rows.length}
                className={`${styles.treeNode}${
                  row.kind === "folder" ? "" : ` ${styles.treeNodeLoose}`
                }${selected ? ` ${styles.treeNodeSelected}` : ""}${
                  dropTarget === row.key ? ` ${styles.treeNodeDrop}` : ""
                }`}
                data-tree-key={String(row.key)}
                {...(droppable ? { "data-dropzone": "folder" } : {})}
                key={String(row.key)}
                onClick={() => {
                  setFocusKey(row.key);
                  onSelect(row.key);
                  if (row.kind === "folder" && row.hasChildren && !row.expanded)
                    onToggle(row.key as FolderId, true);
                }}
                onDragLeave={() => setDropTarget(undefined)}
                onDragOver={
                  droppable
                    ? (event) => {
                        event.preventDefault();
                        setDropTarget(row.key);
                      }
                    : undefined
                }
                onDrop={
                  droppable
                    ? (event) => {
                        event.preventDefault();
                        setDropTarget(undefined);
                        onDropNote(
                          row.key === UNFILED ? null : (row.key as FolderId),
                        );
                      }
                    : undefined
                }
                onKeyDown={(event) => onKeyDown(event, row.key)}
                ref={(element) => {
                  if (element === null) nodes.current.delete(String(row.key));
                  else nodes.current.set(String(row.key), element);
                }}
                role="treeitem"
                style={{ "--tree-depth": row.level - 1 } as React.CSSProperties}
                tabIndex={row.key === tabStopKey ? 0 : -1}
                type="button"
              >
                <span aria-hidden="true" className={styles.treeTwist}>
                  {row.hasChildren ? (
                    <Icon
                      name={row.expanded ? "chevron-down" : "chevron-right"}
                    />
                  ) : null}
                </span>
                {/* THE GLYPH SAYS WHAT KIND OF DESTINATION THIS IS, and the
                    dashed one is a statement rather than a decoration: „All
                    notes" and „Unfiled" are real targets that are not folders,
                    and a reader who cannot see that goes looking for the folder
                    to move something out of. `v3/screens/knowledge.css:55-63`
                    makes exactly that distinction; `Icon.tsx` records why the
                    dashed outline is not a warning triangle. Hidden from the
                    accessible name, which already carries the path and the
                    count. */}
                <span aria-hidden="true" className={styles.treeGlyph}>
                  <Icon
                    name={row.kind === "folder" ? "folder" : "folder-loose"}
                  />
                </span>
                <span className={styles.treeName}>{row.name}</span>
                {/* AN EM DASH IS NOT A ZERO. The two rows counted from
                    `document.list` withdraw their number when that read failed,
                    rather than printing a zero the reader would take for an
                    answer — the folder rows beside them still carry theirs. */}
                <span className={styles.treeCount}>
                  {row.count === undefined ? "—" : row.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
