import { z } from "zod";

/* THE TWO CLOSED VOCABULARIES A KNOWLEDGE SOURCE IS DESCRIBED BY, IN ONE PLACE.
 *
 * Both were spelled out by hand at every site that needed them — the kind at
 * three (`knowledge.sourceCreate`, the projection, the domain interface) and
 * the availability at five, counting the compensation entry that restores a
 * prior one. Nothing bound those spellings together, so a fifth kind or a
 * fourth availability could reach the writer and never the reader, or reach
 * both and never the screen that branches on them.
 *
 * That is the defect family Wave D has now met at eight live sites: a
 * hand-written list standing beside a closed vocabulary, with no compiler
 * between them. The worst of the eight defaulted a missing member to an empty
 * array with 265 tests green. This module is the same remedy
 * `DOCUMENT_ENTITY_TARGET_KINDS` already applies to the entity-link vocabulary:
 * ONE exported array, the schema derived from it, and the TypeScript union
 * derived from the array rather than restated beside it.
 *
 * THE ARRAY ORDER IS THE VOCABULARY ORDER AND IT IS NOT A DISPLAY ORDER. The
 * Sources screen groups by kind in `file, url, excerpt, screenshot` — a
 * deliberate, different order, chosen so muscle memory works on the group a
 * reader reaches for most. The two are held apart on purpose and the screen
 * asserts its order is a PERMUTATION of this one, so a fifth kind cannot be
 * added here and quietly go without a group of its own.
 */

export const KNOWLEDGE_SOURCE_KINDS = [
  "url",
  "file",
  "screenshot",
  "excerpt",
] as const;

export type KnowledgeSourceKind = (typeof KNOWLEDGE_SOURCE_KINDS)[number];

export const KnowledgeSourceKindSchema = z.enum(KNOWLEDGE_SOURCE_KINDS);

/**
 * Whether the thing behind a Source can still be reached.
 *
 * `reference_only` is the ordinary case and says the address is held, not the
 * content. `unavailable` is the one that has to be said out loud: a source that
 * no longer answers must announce itself BEFORE somebody rests a decision on
 * it, which is why every reader carries this in text and never in colour alone.
 */
export const KNOWLEDGE_SOURCE_AVAILABILITY = [
  "reference_only",
  "available",
  "unavailable",
] as const;

export type KnowledgeSourceAvailability =
  (typeof KNOWLEDGE_SOURCE_AVAILABILITY)[number];

export const KnowledgeSourceAvailabilitySchema = z.enum(
  KNOWLEDGE_SOURCE_AVAILABILITY,
);
