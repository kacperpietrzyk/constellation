/**
 * The kinds a rich document can reference inline.
 *
 * This package deliberately depends on nothing of ours, so it cannot import
 * `DOCUMENT_ENTITY_TARGET_KINDS` from `@constellation/contracts` the way every
 * other holder of this vocabulary does. It keeps its own array instead, and
 * `document-entity-vocabulary.test.ts` in the renderer — the one package that
 * can see both — holds the two equal. That test is the guard that an arm added
 * upstream cannot land here silently.
 *
 * It lives in its own module rather than beside either consumer because
 * `yjs-document-adapter` and `structured-document` import each other: a
 * constant declared in one and read at module scope by the other is `undefined`
 * on whichever side loads second, and that fails at load, not at a call.
 */
export const DOCUMENT_ENTITY_REFERENCE_KINDS = [
  "task",
  "project",
  "person",
  "organization",
  "meeting",
  "document",
] as const;

export type DocumentEntityReferenceKind =
  (typeof DOCUMENT_ENTITY_REFERENCE_KINDS)[number];
