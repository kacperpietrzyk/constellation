import type {
  DocumentId,
  FolderId,
  PrincipalId,
  SpaceId,
  WorkspaceId,
} from "@constellation/contracts";

import type { Folder, NativeDocument } from "./model.js";

export const createFolder = (input: {
  readonly id: FolderId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly name: string;
  readonly parentFolderId?: FolderId;
  readonly createdBy: PrincipalId;
  readonly occurredAt: string;
}): Folder => ({
  id: input.id,
  workspaceId: input.workspaceId,
  spaceId: input.spaceId,
  name: input.name,
  ...(input.parentFolderId === undefined
    ? {}
    : { parentFolderId: input.parentFolderId }),
  createdBy: input.createdBy,
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export const renameFolder = (
  folder: Folder,
  name: string,
  occurredAt: string,
): Folder => ({
  ...folder,
  name,
  version: folder.version + 1,
  updatedAt: occurredAt,
});

/**
 * `undefined` moves the folder to the root of its Space's tree. The prior key
 * is destructured away rather than overwritten with `undefined`, so a folder
 * that moved to the root has no `parentFolderId` key at all — the same shape
 * `setTaskParent` produces, and the shape `payload_json` round-trips through
 * `JSON.stringify` without inventing a null nobody wrote.
 */
export const setFolderParent = (
  folder: Folder,
  parentFolderId: FolderId | undefined,
  occurredAt: string,
): Folder => {
  const { parentFolderId: _prior, ...base } = folder;
  void _prior;
  return {
    ...base,
    ...(parentFolderId === undefined ? {} : { parentFolderId }),
    version: folder.version + 1,
    updatedAt: occurredAt,
  };
};

/** `undefined` files the note under Unfiled, which is a legal placement. */
export const setDocumentFolder = (
  document: NativeDocument,
  folderId: FolderId | undefined,
  occurredAt: string,
): NativeDocument => {
  const { folderId: _prior, ...base } = document;
  void _prior;
  return {
    ...base,
    ...(folderId === undefined ? {} : { folderId }),
    version: document.version + 1,
    updatedAt: occurredAt,
  };
};

/**
 * The ancestor chain of `folderId`, nearest first, walked through the folders
 * given. `Task.parentTaskId` needs nothing like this: two guards cap its depth
 * at two, so a cycle is structurally unreachable. Decision #30 asks for
 * unbounded nesting, which buys back every problem that cap avoided — so the
 * walk is bounded by the number of folders it has seen rather than by trust
 * that the stored tree is acyclic. A tree that somehow held a cycle would
 * otherwise hang the kernel rather than refuse the command.
 */
export const folderAncestorIds = (
  folders: readonly Folder[],
  folderId: FolderId,
): readonly FolderId[] => {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const ancestors: FolderId[] = [];
  const seen = new Set<FolderId>([folderId]);
  let current = byId.get(folderId)?.parentFolderId;
  while (current !== undefined && !seen.has(current)) {
    ancestors.push(current);
    seen.add(current);
    current = byId.get(current)?.parentFolderId;
  }
  return ancestors;
};

/**
 * Every folder at or below `folderId`, the folder itself included. The set the
 * deletion guard and the rolled-up count both read; one walk, so a folder
 * cannot report a count that disagrees with what blocks its removal.
 */
export const folderSubtreeIds = (
  folders: readonly Folder[],
  folderId: FolderId,
): ReadonlySet<FolderId> => {
  const subtree = new Set<FolderId>([folderId]);
  // Repeated passes rather than recursion: `listFolders` returns no order, so
  // a child can appear before its parent, and one pass would drop it.
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (
        folder.parentFolderId !== undefined &&
        subtree.has(folder.parentFolderId) &&
        !subtree.has(folder.id)
      ) {
        subtree.add(folder.id);
        grew = true;
      }
    }
  }
  return subtree;
};

/**
 * What each folder holds, as the tree renders it: `ownNoteCount` is the notes
 * filed directly in it, `noteCount` adds every descendant's own notes.
 *
 * BOTH numbers are projected, and that is a decision rather than convenience.
 * The property this wave has to prove is
 * `noteCount(p) === ownNoteCount(p) + Σ noteCount(child)`; with only the total
 * projected, an assertion would have to re-derive the left-hand side from the
 * document list and would then be testing its own arithmetic instead of the
 * read the Notes screen actually renders — which is exactly the defect the
 * prototype's B35 has, comparing a note count against a child-folder count.
 */
export const folderNoteCounts = (
  folders: readonly Folder[],
  documents: readonly { readonly folderId?: FolderId }[],
): ReadonlyMap<
  FolderId,
  { readonly ownNoteCount: number; readonly noteCount: number }
> => {
  const own = new Map<FolderId, number>();
  for (const folder of folders) own.set(folder.id, 0);
  for (const document of documents) {
    if (document.folderId === undefined) continue;
    const held = own.get(document.folderId);
    if (held !== undefined) own.set(document.folderId, held + 1);
  }
  const counts = new Map<
    FolderId,
    { ownNoteCount: number; noteCount: number }
  >();
  for (const folder of folders) {
    const ownNoteCount = own.get(folder.id) ?? 0;
    counts.set(folder.id, { ownNoteCount, noteCount: ownNoteCount });
  }
  // Roll each folder's own notes up its ancestor chain, so the number a
  // reader sees at any nesting level counts everything underneath it.
  for (const folder of folders) {
    const ownNoteCount = own.get(folder.id) ?? 0;
    if (ownNoteCount === 0) continue;
    for (const ancestorId of folderAncestorIds(folders, folder.id)) {
      const held = counts.get(ancestorId);
      if (held !== undefined) held.noteCount += ownNoteCount;
    }
  }
  return counts;
};

/** Notes filed anywhere at or below `folderId`, the folder's own included. */
export const documentsInFolderSubtree = <
  DocumentType extends {
    readonly id: DocumentId;
    readonly folderId?: FolderId;
  },
>(
  folders: readonly Folder[],
  documents: readonly DocumentType[],
  folderId: FolderId,
): readonly DocumentType[] => {
  const subtree = folderSubtreeIds(folders, folderId);
  return documents.filter(
    (document) =>
      document.folderId !== undefined && subtree.has(document.folderId),
  );
};
