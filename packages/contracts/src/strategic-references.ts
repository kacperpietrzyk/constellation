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
  readonly ownerPersonId?: string | undefined;
  readonly mainContactPersonId?: string | undefined;
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
    // An organisation held no reference at all until it could name a main
    // contact, so this arm did not exist and the kind fell through to the
    // default. The compile guard above does NOT catch that: adding an optional
    // key to the projection still satisfies `extends`, so a missing arm here is
    // silent — the person would be removable and the organisation would keep a
    // dead id, which is the exact state every removal guard exists to prevent.
    case "organization":
      return record.mainContactPersonId === undefined
        ? []
        : [record.mainContactPersonId];
    case "person":
      return record.organizationId === undefined ? [] : [record.organizationId];
    case "opportunity":
      return [
        ...(record.organizationId === undefined ? [] : [record.organizationId]),
        ...(record.personIds ?? []),
        // The owner blocks their own removal like any other named person:
        // removing them would leave the deal owned by nobody, silently.
        ...(record.ownerPersonId === undefined ? [] : [record.ownerPersonId]),
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
