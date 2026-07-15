import type {
  DocumentId,
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
  readonly role?: "note" | "document" | "deliverable";
  readonly createdBy: PrincipalId;
  readonly occurredAt: string;
}): NativeDocument => ({
  id: input.id,
  workspaceId: input.workspaceId,
  spaceId: input.spaceId,
  title: input.title,
  role: input.role ?? "document",
  evidence: { sourceIds: [], noteDocumentIds: [] },
  createdBy: input.createdBy,
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});
