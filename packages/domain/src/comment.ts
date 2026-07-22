import type { KnowledgeSourceId, PrincipalId } from "@constellation/contracts";

import type { AttentionSignal, RecordComment } from "./model.js";

export const editComment = (
  comment: RecordComment,
  body: string,
  mentionPrincipalIds: readonly PrincipalId[],
  editedBy: PrincipalId,
  occurredAt: string,
  attachmentSourceIds: readonly KnowledgeSourceId[] = comment.attachmentSourceIds ??
    [],
): RecordComment => ({
  ...comment,
  body,
  mentionPrincipalIds,
  attachmentSourceIds,
  revisions: [
    ...comment.revisions,
    {
      body: comment.body,
      mentionPrincipalIds: comment.mentionPrincipalIds,
      ...(comment.attachmentSourceIds === undefined
        ? {}
        : { attachmentSourceIds: comment.attachmentSourceIds }),
      editedBy,
      editedAt: occurredAt,
    },
  ],
  version: comment.version + 1,
  updatedAt: occurredAt,
});

export const setCommentThreadState = (
  comment: RecordComment,
  state: "open" | "resolved",
  principalId: PrincipalId,
  occurredAt: string,
): RecordComment => {
  const base = { ...comment };
  delete base.resolvedAt;
  delete base.resolvedBy;
  return {
    ...base,
    threadState: state,
    version: comment.version + 1,
    updatedAt: occurredAt,
    ...(state === "resolved"
      ? { resolvedAt: occurredAt, resolvedBy: principalId }
      : {}),
  };
};

export const setAttentionState = (
  signal: AttentionSignal,
  state: "read" | "dismissed",
  occurredAt: string,
): AttentionSignal => ({
  ...signal,
  state,
  version: signal.version + 1,
  updatedAt: occurredAt,
  ...(state === "read" ? { readAt: occurredAt } : { dismissedAt: occurredAt }),
});
