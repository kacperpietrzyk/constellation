// WHICH FOLDERS ARE OPEN — device-local, per workspace, and NOT graph data.
//
// The tree opens expanded to level 1 and collapsed below (brief ruling E), and
// what a reader opens after that is remembered. It is remembered THE WAY A
// PINNED ITEM IS: in this device's storage, under the workspace it belongs to.
// It is not a field on `Folder` and must never become one — two people reading
// the same Space would then fight over each other's disclosure triangles, and a
// synchronised workspace would ship one person's navigation habits to another.
//
// The idiom below (try/catch around both reads and writes, a half-written value
// read as "nothing stored") is `tasks/task-columns.ts`'s, deliberately, because
// this is the same class of state and a second dialect of it is how one of them
// quietly stops working.

import type { FolderId, WorkspaceId } from "@constellation/contracts";

import { defaultExpandedFolders, type FolderSummary } from "./folder-tree.js";

/** Per workspace: two workspaces are two different trees, not one habit. */
const storageKey = (workspaceId: WorkspaceId): string =>
  `constellation.note-folders-expanded.${workspaceId}`;

const readStored = (
  workspaceId: WorkspaceId,
): readonly string[] | undefined => {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(workspaceId));
    if (raw === null || raw === undefined) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string")
      ? (parsed as string[])
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * NOTHING STORED IS NOT THE SAME AS STORED EMPTY, and conflating the two is
 * how a reader who deliberately collapsed the whole tree finds it open again
 * every morning. Nothing stored means "never chosen" and takes the default;
 * an empty list means "this reader closed everything" and is honoured.
 *
 * An id for a folder that no longer exists is dropped rather than kept: it has
 * no row to disclose, and keeping it would let the stored set grow forever.
 */
export const readExpandedFolders = (
  workspaceId: WorkspaceId,
  folders: readonly FolderSummary[],
): ReadonlySet<FolderId> => {
  const stored = readStored(workspaceId);
  if (stored === undefined) return defaultExpandedFolders(folders);
  const live = new Set<string>(folders.map((folder) => folder.id));
  return new Set(
    stored.filter((id): id is FolderId => live.has(id)) as FolderId[],
  );
};

export const writeExpandedFolders = (
  workspaceId: WorkspaceId,
  expanded: ReadonlySet<FolderId>,
): void => {
  try {
    globalThis.localStorage?.setItem(
      storageKey(workspaceId),
      JSON.stringify([...expanded]),
    );
  } catch {
    // Storage refused — a full or blocked quota. The tree still answers to the
    // reader for as long as this screen is mounted; losing the memory of a
    // disclosure triangle is not worth failing a render over.
  }
};
