import type { StrategicRecordProjection } from "./query.js";

/**
 * The reference fields a strategic record can hold, named structurally so both
 * the kernel's record and the published projection satisfy it — they differ
 * only in array mutability. A second copy of this list is how the rule the
 * kernel enforces and the rule the desktop inspector explains would come to
 * disagree about what blocks a removal.
 */
export interface StrategicRecordReferenceFields {
  readonly kind: string;
  readonly state?: string | undefined;
  readonly organizationId?: string | undefined;
  readonly personIds?: readonly string[] | undefined;
  readonly offerIds?: readonly string[] | undefined;
  readonly opportunityId?: string | undefined;
  readonly supersededById?: string | undefined;
  readonly linkedRecordIds?: readonly string[] | undefined;
  readonly priorDecisionId?: string | undefined;
  readonly replacementDecisionId?: string | undefined;
  readonly sourceRecordId?: string | undefined;
  readonly targetRecordId?: string | undefined;
  readonly contextRecordId?: string | undefined;
  readonly resolutionRecordId?: string | undefined;
}

// Fails to compile if a published record kind stops satisfying the shape above
// — a renamed or retyped reference field has to be reflected here, not
// silently dropped from the guard.
export type StrategicProjectionsCarryTheirReferences =
  StrategicRecordProjection extends StrategicRecordReferenceFields
    ? true
    : never;

/**
 * Every strategic-record reference one record holds to another, flattened.
 *
 * Removal reads this to refuse rather than orphan (ADR-043 §3, as task.remove):
 * a record still pointed at by live work stays, and the caller resolves the
 * reference first.
 */
export const strategicRecordReferences = (
  record: StrategicRecordReferenceFields,
): readonly string[] => {
  switch (record.kind) {
    case "person":
      return record.organizationId === undefined ? [] : [record.organizationId];
    case "opportunity":
      return [
        ...(record.organizationId === undefined ? [] : [record.organizationId]),
        ...(record.personIds ?? []),
        ...(record.offerIds ?? []),
      ];
    case "offer":
      return record.opportunityId === undefined ? [] : [record.opportunityId];
    case "renewal":
    case "relationship_fact":
      return record.organizationId === undefined ? [] : [record.organizationId];
    case "decision":
      return [
        ...(record.supersededById === undefined ? [] : [record.supersededById]),
        ...(record.linkedRecordIds ?? []),
      ];
    case "impact_review":
      return [
        ...(record.priorDecisionId === undefined
          ? []
          : [record.priorDecisionId]),
        ...(record.replacementDecisionId === undefined
          ? []
          : [record.replacementDecisionId]),
      ];
    case "work_link":
      // A removed link no longer holds its ends: work.linkRemove is the
      // documented way to detach, and a detached link must not keep an Area or
      // an Initiative pinned in place.
      return record.state === "active"
        ? [
            ...(record.sourceRecordId === undefined
              ? []
              : [record.sourceRecordId]),
            ...(record.targetRecordId === undefined
              ? []
              : [record.targetRecordId]),
          ]
        : [];
    case "recurrence":
      return record.contextRecordId === undefined
        ? []
        : [record.contextRecordId];
    case "radar_candidate":
      return record.resolutionRecordId === undefined
        ? []
        : [record.resolutionRecordId];
    default:
      return [];
  }
};
