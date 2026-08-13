// THE FOLDER TREE OF THE NOTES SCREEN — decision #30, and the arithmetic the
// screen must not do twice.
//
// Everything here is a pure function over the `knowledge.list` read, with no
// React and no DOM, for one reason: the properties this lot has to prove are
// properties of the READ THE SCREEN RENDERS, and a helper that recomputes a
// count from the document list would be testing its own arithmetic. `noteCount`
// and `ownNoteCount` arrive from the kernel (authorization is a kernel
// property) and are passed through untouched — this module decides ORDER and
// MEMBERSHIP, never a number.

import type { DocumentId, FolderId } from "@constellation/contracts";

/** One row of `knowledge.list.folders`, narrowed to what the tree reads. */
export interface FolderSummary {
  readonly id: FolderId;
  readonly name: string;
  readonly parentFolderId?: FolderId | undefined;
  readonly noteCount: number;
  readonly ownNoteCount: number;
}

/** One row of `knowledge.list.documents`, narrowed to what the tree reads. */
export interface NoteSummary {
  readonly id: DocumentId;
  readonly folderId?: FolderId | undefined;
}

/**
 * The two roots are NOT folders, and the tree says so with its own glyph and a
 * rule beneath them rather than by pretending they are.
 *
 * `Unfiled` is a DESTINATION, not a waiting room: the model lets somebody write
 * before they know where it belongs, and dropping a note here is "take it out
 * of a folder" — an explicit operation with a command behind it, never a
 * failure state. That is why it accepts a drop and why it carries a dashed
 * folder rather than a warning triangle.
 */
export const ALL_NOTES = "all-notes" as const;
export const UNFILED = "unfiled" as const;

export type TreeSelection = typeof ALL_NOTES | typeof UNFILED | FolderId;

export interface TreeRow {
  /** Stable across renders and across expansion — the roving focus rides it. */
  readonly key: TreeSelection;
  readonly kind: "all" | "unfiled" | "folder";
  readonly name: string;
  /** 1 for the roots and for a folder with no parent; deeper below. */
  readonly level: number;
  /**
   * What the counter beside the name says. Never recomputed here.
   *
   * ABSENT when the number would be a claim nobody read. `All notes` and
   * `Unfiled` are counted from `document.list`; when that read fails those two
   * counts collapse to zero while every folder row beside them still carries
   * its own `noteCount` from `knowledge.list` — a tree saying "All notes: 0"
   * over folders declaring a dozen. A withdrawn number is the honest half of
   * that pair, and the type makes withdrawing it the only way to say so.
   */
  readonly count?: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  /** `Klienci / Orbit / Wdrożenie` — the note's address, not just its leaf. */
  readonly path: string;
}

/**
 * SIBLING ORDER IS THE SCREEN'S, AND IT HAS TO BE.
 *
 * `knowledge.list.folders` arrives in `updated_at DESC, id DESC` — the store's
 * order, and a RECENCY order. Rendered as a tree it would reshuffle every time
 * anybody renamed or moved a folder, so the same tree would look different
 * between two readings for a reason nobody could see. Siblings are therefore
 * sorted by name on Polish collation (folder names are data, and the records
 * this workspace holds are Polish — the same split `i18n.ts` states), with the
 * id as the tiebreak so two folders sharing a name still have ONE order.
 */
const byName = (left: FolderSummary, right: FolderSummary): number =>
  left.name.localeCompare(right.name, "pl") || left.id.localeCompare(right.id);

/**
 * Depth-first, parents before their children, each subtree contiguous. THIS is
 * what "tree order" means everywhere else in this screen — the `Folder` mode
 * group order equals this sequence, which is a different thing from sorting the
 * full paths alphabetically and is the property the switcher's assertion binds.
 *
 * A folder whose `parentFolderId` names no folder in the list is treated as a
 * root rather than dropped: the contract already documents an id that resolves
 * to nothing (`query.ts`, on `documents[].folderId`), and a tree that silently
 * loses a subtree is worse than one that shows it at the top.
 */
export const folderTreeOrder = (
  folders: readonly FolderSummary[],
): readonly FolderSummary[] => {
  const known = new Set(folders.map((folder) => folder.id));
  const childrenOf = new Map<FolderId | "", FolderSummary[]>();
  for (const folder of folders) {
    const parent =
      folder.parentFolderId !== undefined && known.has(folder.parentFolderId)
        ? folder.parentFolderId
        : "";
    const held = childrenOf.get(parent);
    if (held === undefined) childrenOf.set(parent, [folder]);
    else held.push(folder);
  }
  for (const siblings of childrenOf.values()) siblings.sort(byName);
  const ordered: FolderSummary[] = [];
  // A cycle cannot be written through `folder.setParent` — the kernel refuses a
  // move under a folder's own descendant — but a walk that trusts that and is
  // wrong hangs the renderer, so the visited set is here rather than the trust.
  const visited = new Set<FolderId>();
  const walk = (parent: FolderId | "") => {
    for (const folder of childrenOf.get(parent) ?? []) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      ordered.push(folder);
      walk(folder.id);
    }
  };
  walk("");
  return ordered;
};

/** `Klienci / Orbit` — every ancestor, because the leaf alone is ambiguous. */
export const folderPath = (
  folders: readonly FolderSummary[],
  folderId: FolderId,
): string => {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  let current = byId.get(folderId);
  const seen = new Set<FolderId>();
  while (current !== undefined && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current =
      current.parentFolderId === undefined
        ? undefined
        : byId.get(current.parentFolderId);
  }
  return names.join(" / ");
};

/** Depth of a folder in the rendered tree; a root is 1, as `aria-level` wants. */
const levelOf = (
  folders: readonly FolderSummary[],
  folder: FolderSummary,
): number => {
  const byId = new Map(folders.map((entry) => [entry.id, entry]));
  let level = 1;
  let parentId = folder.parentFolderId;
  const seen = new Set<FolderId>();
  while (parentId !== undefined && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (parent === undefined) break;
    level += 1;
    parentId = parent.parentFolderId;
  }
  return level;
};

/**
 * A note whose `folderId` names no folder on the list is UNFILED to the reader.
 * The contract states the case and states why it is not a bug: a note is
 * soft-removed keeping its folder, the folder — empty by then — is removed, and
 * the removal is undone. Treating the id as a successful lookup would put the
 * note in a folder the tree does not draw, where nothing could reach it.
 */
export const isUnfiled = (
  note: NoteSummary,
  folders: readonly FolderSummary[],
): boolean =>
  note.folderId === undefined ||
  !folders.some((folder) => folder.id === note.folderId);

/** Every folder at or below `folderId`, itself included. */
const subtreeIds = (
  folders: readonly FolderSummary[],
  folderId: FolderId,
): ReadonlySet<FolderId> => {
  const reachable = new Set<FolderId>([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (
        folder.parentFolderId !== undefined &&
        reachable.has(folder.parentFolderId) &&
        !reachable.has(folder.id)
      ) {
        reachable.add(folder.id);
        grew = true;
      }
    }
  }
  return reachable;
};

/**
 * WHAT THE LIST BESIDE THE TREE SHOWS — and the reason it is not "notes whose
 * folderId equals this one".
 *
 * The counter on a folder node is RECURSIVE (`noteCount` adds every
 * descendant's). A list that showed only the folder's own notes would be
 * narrower than the number printed beside it, which makes the number a lie
 * about the list under the reader's own eyes. So selecting a folder shows that
 * folder AND everything below it, and the two agree by construction.
 */
export const notesInSelection = <Note extends NoteSummary>(
  notes: readonly Note[],
  folders: readonly FolderSummary[],
  selection: TreeSelection,
): readonly Note[] => {
  if (selection === ALL_NOTES) return notes;
  if (selection === UNFILED)
    return notes.filter((note) => isUnfiled(note, folders));
  const reachable = subtreeIds(folders, selection);
  return notes.filter(
    (note) =>
      note.folderId !== undefined &&
      reachable.has(note.folderId) &&
      !isUnfiled(note, folders),
  );
};

/**
 * THE TREE OPENS EXPANDED TO LEVEL 1 AND COLLAPSED BELOW (brief ruling E).
 *
 * Returned as the set to store, not applied silently: expansion is DEVICE-LOCAL
 * state like a pinned item, and the caller persists exactly what it renders.
 * The prototype opened everything, and its own comment already said that stops
 * working at two hundred notes.
 */
export const defaultExpandedFolders = (
  folders: readonly FolderSummary[],
): ReadonlySet<FolderId> =>
  new Set(
    folders
      .filter((folder) => levelOf(folders, folder) === 1)
      .map((folder) => folder.id),
  );

/**
 * The rows a reader can actually see and walk with the arrow keys, flattened
 * into ONE array with a declared level rather than nested `role="group"`s.
 * The keyboard then walks the order on screen without recursing per key press,
 * which is the whole reason the pattern exists.
 */
export const visibleTreeRows = (
  folders: readonly FolderSummary[],
  notes: readonly NoteSummary[],
  expanded: ReadonlySet<FolderId>,
  /**
   * Whether `notes` is the note list or the empty array a failed `document.list`
   * degrades to. Defaults to true, so the readable path renders exactly what it
   * rendered before; only the two rows counted FROM `notes` are affected.
   */
  notesReadable = true,
): readonly TreeRow[] => {
  const ordered = folderTreeOrder(folders);
  const rows: TreeRow[] = [
    {
      key: ALL_NOTES,
      kind: "all",
      name: "All notes",
      level: 1,
      // EVERY note in the library, filed or not — which is why this is not the
      // sum of the top-level folder counts whenever anything is unfiled. That
      // is correct and must not be "fixed": #30's hard requirement is that the
      // library has one place showing all of it.
      ...(notesReadable ? { count: notes.length } : {}),
      hasChildren: false,
      expanded: false,
      path: "All notes",
    },
    {
      key: UNFILED,
      kind: "unfiled",
      name: "Unfiled",
      level: 1,
      ...(notesReadable
        ? { count: notes.filter((note) => isUnfiled(note, folders)).length }
        : {}),
      hasChildren: false,
      expanded: false,
      path: "Unfiled",
    },
  ];
  const collapsedAncestors = new Set<FolderId>();
  for (const folder of ordered) {
    const level = levelOf(folders, folder);
    const hidden =
      folder.parentFolderId !== undefined &&
      (collapsedAncestors.has(folder.parentFolderId) ||
        !expanded.has(folder.parentFolderId));
    if (hidden) {
      collapsedAncestors.add(folder.id);
      continue;
    }
    rows.push({
      key: folder.id,
      kind: "folder",
      name: folder.name,
      level,
      // Straight from the read. The equation
      // `noteCount(p) === ownNoteCount(p) + Σ noteCount(child)` is therefore
      // checkable from what is on screen, without the screen re-deriving it.
      count: folder.noteCount,
      hasChildren: folders.some(
        (candidate) => candidate.parentFolderId === folder.id,
      ),
      expanded: expanded.has(folder.id),
      path: folderPath(folders, folder.id),
    });
  }
  return rows;
};
