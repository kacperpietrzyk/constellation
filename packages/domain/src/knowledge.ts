import type {
  DocumentId,
  KnowledgeSourceId,
  PrincipalId,
  SpaceId,
  WorkspaceId,
} from "@constellation/contracts";

import type {
  KnowledgeSource,
  NamedDocumentVersion,
  NativeDocument,
} from "./model.js";

export const createKnowledgeSource = (input: {
  readonly id: KnowledgeSourceId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly sourceKind: KnowledgeSource["sourceKind"];
  readonly title: string;
  readonly canonicalUrl?: string;
  readonly excerpt?: string;
  readonly availability: KnowledgeSource["availability"];
  readonly observedAt: string;
  readonly createdBy: PrincipalId;
  readonly occurredAt: string;
}): KnowledgeSource => ({
  ...input,
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export const updateKnowledgeSource = (
  source: KnowledgeSource,
  input: Pick<
    KnowledgeSource,
    "title" | "canonicalUrl" | "excerpt" | "availability" | "observedAt"
  > & { readonly occurredAt: string },
): KnowledgeSource => {
  const { canonicalUrl: _canonicalUrl, excerpt: _excerpt, ...base } = source;
  void _canonicalUrl;
  void _excerpt;
  return {
    ...base,
    title: input.title,
    ...(input.canonicalUrl === undefined
      ? {}
      : { canonicalUrl: input.canonicalUrl }),
    ...(input.excerpt === undefined ? {} : { excerpt: input.excerpt }),
    availability: input.availability,
    observedAt: input.observedAt,
    version: source.version + 1,
    updatedAt: input.occurredAt,
  };
};

export const setDocumentEvidence = (
  document: NativeDocument,
  input: {
    readonly sourceIds: readonly KnowledgeSourceId[];
    readonly noteDocumentIds: readonly DocumentId[];
    readonly occurredAt: string;
  },
): NativeDocument => ({
  ...document,
  evidence: {
    sourceIds: [...new Set(input.sourceIds)].sort(),
    noteDocumentIds: [...new Set(input.noteDocumentIds)].sort(),
  },
  version: document.version + 1,
  updatedAt: input.occurredAt,
});

export const createNamedDocumentVersion = (
  input: Omit<
    NamedDocumentVersion,
    "state" | "version" | "createdAt" | "updatedAt"
  > & { readonly occurredAt: string },
): NamedDocumentVersion => ({
  ...input,
  state: "active",
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export const voidNamedDocumentVersion = (
  version: NamedDocumentVersion,
  input: { readonly principalId: PrincipalId; readonly occurredAt: string },
): NamedDocumentVersion => ({
  ...version,
  state: "voided",
  version: version.version + 1,
  updatedAt: input.occurredAt,
  voidedAt: input.occurredAt,
  voidedBy: input.principalId,
});
