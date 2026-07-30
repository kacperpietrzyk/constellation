import { useState } from "react";

import type { PrincipalId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  setTaskAssignment,
  type DesktopSnapshot,
  type MutationFailure,
} from "../client/workflow.js";

// Who holds this task, and the one place in the application where that can be
// changed.
//
// Until this existed, nobody could. `task.assign` and `task.unassign` have been
// in the contract and the kernel throughout; `setTaskAssignment` has been in
// the renderer's client layer with ZERO call sites; and a complete picker sat
// in an orphaned surface nothing imports. Every reachable screen showed the
// assignee and none of them could set it.
//
// It lives in the task's inspector rail because a task has no record screen
// yet — the rows on the Tasks collection say so in as many words ("a row says
// who holds the work, the record screen is where it changes hands"). It is a
// standalone component so it can move to a record tab without being rewritten.

/** The version the write must expect is the one read BEFORE the reload, so it
 *  is captured at submit rather than read again in the callback. */
export const TaskAssignmentSection = ({
  client,
  snapshot,
  task,
  onAssigned,
  onFailure,
}: {
  readonly client: ConstellationRendererClient;
  readonly snapshot: DesktopSnapshot;
  readonly task: DesktopSnapshot["tasks"][number];
  readonly onAssigned: (message: string) => Promise<void>;
  readonly onFailure: (result: MutationFailure) => void;
}) => {
  const [busy, setBusy] = useState(false);
  const candidates =
    snapshot.assignmentCandidates.kind === "ready"
      ? snapshot.assignmentCandidates.data.candidates
      : [];
  const unreadable =
    snapshot.assignmentCandidates.kind === "unavailable"
      ? snapshot.assignmentCandidates.message
      : undefined;

  // A redacted assignee has a NAME and no id: this reader may know that
  // somebody holds the task without being allowed to know who. The select then
  // shows an unselectable option rather than "Unassigned", which would state
  // something false, and rather than the raw id, which states nothing.
  const redacted =
    task.assignment !== undefined && task.assignment.availability !== "active";
  const value = redacted
    ? "unavailable-member"
    : (task.assignment?.assigneePrincipalId ?? "");

  const change = (next: PrincipalId | undefined): void => {
    // Guarded only in the ASSIGN direction. `next === undefined` beside a
    // redacted assignment also compares equal — both sides are undefined — and
    // that is precisely the clear that matters most: a task held by somebody
    // this reader cannot name is the one a person most wants to hand on.
    if (next !== undefined && next === task.assignment?.assigneePrincipalId)
      return;
    setBusy(true);
    void setTaskAssignment(client, snapshot, task, next).then(
      async (result) => {
        setBusy(false);
        if (result.kind === "success")
          await onAssigned(
            next === undefined ? "Assignee cleared." : "Assignee updated.",
          );
        else onFailure(result);
      },
    );
  };

  return (
    <section className="inspector-section assignment-block">
      <p className="section-label">Assignee</p>
      <label className="sr-only" htmlFor={`task-assignee-${task.id}`}>
        Assignee for {task.title}
      </label>
      <select
        className="task-assignee"
        disabled={busy || snapshot.assignmentCandidates.kind !== "ready"}
        id={`task-assignee-${task.id}`}
        onChange={(event) =>
          change(
            event.target.value === ""
              ? undefined
              : (event.target.value as PrincipalId),
          )
        }
        value={value}
      >
        <option value="">Unassigned</option>
        {redacted && task.assignment !== undefined && (
          <option disabled value="unavailable-member">
            {task.assignment.availability === "former_member"
              ? "Former member"
              : "No access to the Space"}
          </option>
        )}
        {candidates.map((candidate) => (
          <option key={candidate.principalId} value={candidate.principalId}>
            {candidate.displayName}
            {candidate.participantKind === "guest" ? " · guest" : ""}
          </option>
        ))}
      </select>
      {/* A control greyed out with no stated reason is a dummy, and dummies are
          a named defect here. The candidates are read once at startup, so a
          read that did not land leaves this the only place that can say so. */}
      {unreadable !== undefined && (
        <p className="inline-error" role="alert">
          {unreadable}
        </p>
      )}
      {/* A known limitation, said rather than hidden: the candidate list is
          loaded once for the first Space. A task in another Space can be
          offered somebody the kernel will refuse, and the refusal is what the
          reader would otherwise have to interpret unaided. */}
      {candidates.length === 0 && unreadable === undefined && (
        <p className="muted-text">
          Nobody in this Space can be assigned work yet.
        </p>
      )}
    </section>
  );
};

export default TaskAssignmentSection;
