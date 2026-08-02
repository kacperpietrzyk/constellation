import type {
  DocumentId,
  FolderId,
  PrincipalId,
  SpaceId,
  WorkspaceId,
} from "@constellation/contracts";

import type { NativeDocument } from "./model.js";

export const createNativeDocument = (input: {
  readonly id: DocumentId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly title: string;
  readonly folderId?: FolderId;
  readonly externalId?: string;
  readonly role?: "note" | "document" | "deliverable";
  readonly createdBy: PrincipalId;
  readonly occurredAt: string;
}): NativeDocument => ({
  id: input.id,
  workspaceId: input.workspaceId,
  spaceId: input.spaceId,
  title: input.title,
  ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
  ...(input.externalId === undefined ? {} : { externalId: input.externalId }),
  role: input.role ?? "document",
  evidence: { sourceIds: [], noteDocumentIds: [] },
  createdBy: input.createdBy,
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

/**
 * The note's title, replaced.
 *
 * It lives here rather than beside `setDocumentFolder` in `folder.ts` for the
 * reason that file gives for holding a document helper at all: the move is
 * part of the FOLDER tree and reads as one. A rename is not — it touches
 * nothing outside the note, which is why it is the second function in this
 * file rather than the third in that one.
 *
 * `title` is required on the record, so this replaces a value and never
 * introduces or removes a key; there is no absent state to spell and no
 * destructuring to do.
 */
export const renameNativeDocument = (
  document: NativeDocument,
  title: string,
  occurredAt: string,
): NativeDocument => ({
  ...document,
  title,
  version: document.version + 1,
  updatedAt: occurredAt,
});
