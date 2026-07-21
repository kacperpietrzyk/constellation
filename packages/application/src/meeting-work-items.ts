import type {
  ImportedMeeting,
  MeetingWorkItem,
  MeetingWorkItemKind,
  MeetingWorkItemState,
} from "@constellation/contracts";

/**
 * The three work-item corrections, as pure transformations over a meeting
 * (ADR-047). The kernel commands own the write path; this module owns what the
 * write means, so the rule that a title matching the source value re-accepts
 * the source cannot drift away from the rule that decides triage.
 *
 * `undefined` is a refusal: the caller turns it into a precondition failure.
 */

const retriaged = (
  meeting: ImportedMeeting,
  workItems: readonly MeetingWorkItem[],
  occurredAt: string,
): ImportedMeeting => ({
  ...meeting,
  workItems: [...workItems],
  // A conflicted item outranks a partial import: it is the one a person must
  // resolve before the meeting can be trusted.
  triage: workItems.some((item) => item.state === "conflicted")
    ? "conflicted"
    : meeting.missingComponents.length > 0
      ? "partial"
      : "ready",
  // Both reconciliation points compare this inner version, not the strategic
  // record's own version (ADR-047 §2).
  version: meeting.version + 1,
  updatedAt: occurredAt,
});

const workItemAt = (
  meeting: ImportedMeeting,
  workItemId: string,
  expectedVersion: number,
): MeetingWorkItem | undefined => {
  const item = meeting.workItems.find(
    (candidate) => candidate.id === workItemId,
  );
  return item?.version === expectedVersion ? item : undefined;
};

export const editMeetingWorkItem = (
  meeting: ImportedMeeting,
  input: {
    readonly workItemId: string;
    readonly expectedWorkItemVersion: number;
    readonly title: string;
    readonly state: MeetingWorkItemState;
    readonly occurredAt: string;
  },
): ImportedMeeting | undefined => {
  const item = workItemAt(
    meeting,
    input.workItemId,
    input.expectedWorkItemVersion,
  );
  if (item === undefined) return undefined;
  const title = input.title.trim();
  if (title.length === 0) return undefined;
  const workItems = meeting.workItems.map((candidate): MeetingWorkItem => {
    if (candidate.id !== item.id) return candidate;
    // Typing the source value back is an acceptance of the source rather than
    // a local edit: the conflict clears and the item returns to source
    // control, so the next delivery stops being reported as a conflict.
    const acceptedSource =
      candidate.sourceValueInConflict !== undefined &&
      title === candidate.sourceValueInConflict;
    const { sourceValueInConflict: _resolved, ...withoutConflict } = candidate;
    void _resolved;
    return {
      ...withoutConflict,
      title,
      state: input.state,
      sourceControlled: acceptedSource,
      locallyModified: !acceptedSource,
      version: candidate.version + 1,
    };
  });
  return retriaged(meeting, workItems, input.occurredAt);
};

export const correctMeetingWorkItemResponsibility = (
  meeting: ImportedMeeting,
  input: {
    readonly workItemId: string;
    readonly expectedWorkItemVersion: number;
    // null clears the override and returns the item to its source
    // responsibility.
    readonly name: string | null;
    readonly occurredAt: string;
  },
): ImportedMeeting | undefined => {
  const item = workItemAt(
    meeting,
    input.workItemId,
    input.expectedWorkItemVersion,
  );
  // A decision or a note has no responsibility to correct; accepting one
  // would record an assignment nothing reads.
  if (item === undefined || item.kind === "decision" || item.kind === "note")
    return undefined;
  const name = input.name === null ? null : input.name.trim();
  if (name !== null && (name.length === 0 || name.length > 300))
    return undefined;
  const workItems = meeting.workItems.map((candidate): MeetingWorkItem => {
    if (candidate.id !== item.id) return candidate;
    const { responsibilityOverride: _override, ...withoutOverride } = candidate;
    void _override;
    return {
      ...withoutOverride,
      ...(name === null ? {} : { responsibilityOverride: { name } }),
      version: candidate.version + 1,
    };
  });
  return retriaged(meeting, workItems, input.occurredAt);
};

export const addMeetingWorkItem = (
  meeting: ImportedMeeting,
  input: {
    readonly workItemId: string;
    readonly kind: MeetingWorkItemKind;
    readonly title: string;
    readonly occurredAt: string;
  },
): ImportedMeeting | undefined => {
  const title = input.title.trim();
  if (title.length === 0) return undefined;
  // Reusing an existing id is a refusal, not a silent no-op: the caller
  // believes it is creating something.
  if (meeting.workItems.some((item) => item.id === input.workItemId))
    return undefined;
  return retriaged(
    meeting,
    [
      ...meeting.workItems,
      {
        id: input.workItemId,
        kind: input.kind,
        sourceExternalId: `local:${input.workItemId}`,
        title,
        state: "open",
        sourceControlled: false,
        locallyModified: true,
        version: 1,
      },
    ],
    input.occurredAt,
  );
};
