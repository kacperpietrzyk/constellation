import type {
  ImportedMeeting,
  QueryProjection,
} from "@constellation/contracts";

/* DECISION #32 — WHAT IS ATTACHED TO A MEETING, IN ONE NAMED FUNCTION.
 *
 * Two facts meet here and they are deliberately kept apart:
 *
 *   • WHAT A NOTE IS ABOUT — the author's statement, carried as an entity
 *     reference inside the note's body and read back through
 *     `document.backlinks`. It belongs to the note and to everyone who reads
 *     it, so nothing on this screen may change it.
 *   • WHAT BELONGS ON THIS MEETING — the reader's statement, carried as
 *     `ImportedMeeting.detachedNoteIds` and written by `meeting.detachNote`.
 *
 * THE SUBTRACTION HAPPENS HERE AND NOT INSIDE `document.backlinks`. Three other
 * surfaces read that query and the note's own reference must stay observable to
 * all of them; a meeting-scoped suppression that quietly narrowed a general
 * query would make "the agent wrote something wrong" indistinguishable from
 * "the agent wrote something true that I do not want on this meeting" for every
 * reader who never asked about the meeting at all.
 *
 * There is no acceptance gate anywhere in this file, and its absence is the
 * decision: an agent's note is attached the moment it points here.
 */

export type MeetingBacklink = Extract<
  QueryProjection,
  { kind: "document.backlinks" }
>["items"][number];

/** Notes pointing at this meeting that the reader has not taken off it. */
export const attachedNotesFor = (
  meeting: Pick<ImportedMeeting, "detachedNoteIds">,
  backlinks: readonly MeetingBacklink[],
): readonly MeetingBacklink[] => {
  const detached = new Set(meeting.detachedNoteIds ?? []);
  return backlinks.filter((note) => !detached.has(note.documentId));
};

/* Authorship is the only real evidence this row can carry, and #32 requires it:
 * the gate is gone, so the reader judges an attachment by who wrote the note
 * and when. The prototype's "names <person>, who was in the room" was an
 * INFERENCE over fixtures — the shipped product stores no attach provenance at
 * all — so it is not spelled here rather than being approximated.
 */
export const attachedNoteAuthorship = (
  note: MeetingBacklink,
  day: string,
): string =>
  note.author.authoredByAgent
    ? `${note.author.displayName} attached this · written ${day}`
    : `Written by ${note.author.displayName} · ${day}`;
