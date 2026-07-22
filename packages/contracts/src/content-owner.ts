import { z } from "zod";

import {
  DocumentIdSchema,
  ProjectIdSchema,
  type DocumentId,
  type ProjectId,
} from "./ids.js";

export const CollaborativeContentOwnerSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("document"), documentId: DocumentIdSchema })
    .strict(),
  z.object({ kind: z.literal("project"), projectId: ProjectIdSchema }).strict(),
]);

export type CollaborativeContentOwner = z.infer<
  typeof CollaborativeContentOwnerSchema
>;

export type CollaborativeContentOwnerKind = CollaborativeContentOwner["kind"];

export const collaborativeContentOwnerId = (
  owner: CollaborativeContentOwner,
): DocumentId | ProjectId =>
  owner.kind === "document" ? owner.documentId : owner.projectId;
