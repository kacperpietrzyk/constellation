import type { PrincipalId } from "@constellation/contracts";

import type {
  AccessProjection,
  AgentAccessProjection,
  DataSlice,
  MentionCandidatesProjection,
} from "../client/workflow.js";
import {
  SYSTEM_ACTOR,
  type CommentActor,
  type CommentThread,
} from "./record-tabs.js";

// Who wrote a line on a record, resolved once for every panel that names an
// author.
//
// `comment.list` carries only `{ principalId?, displayName }` — no agent flag
// and no role — so the panels cannot work this out and deliberately do not
// guess. The resolution order is the PRINCIPAL first: Hermes and Claude Code
// hold separate grants, so they are separate identities, and a stream that
// showed one name for both would take away the only question worth asking of
// it.

type Grant = AgentAccessProjection["grants"][number];

/**
 * Whose voice this is, and what it may do to a comment — read once, for every
 * panel that mounts the comments.
 *
 * It lives beside `buildActorResolver` and `buildMentionResolver` because these
 * three booleans travel with them into every comments mount, and because the
 * shell and the organization loader used to spell the same five steps out
 * separately: two readings of one permission are free to drift, and this repo
 * has a named repeat defect for exactly that.
 *
 * The Space grant is `spaces[0]` — the FIRST Space's access, whichever Space
 * the record actually lives in. That is arguably the wrong question to ask, and
 * it is moved here VERBATIM on purpose: correcting it changes what a
 * multi-Space member may do on a record, which is a different change with a
 * different blast radius than removing a duplicate.
 *
 * Stated rather than folded into `busy`: a control dead because a write is in
 * flight and one dead because the grant is read-only stay two different facts.
 *
 * Takes the slice rather than the snapshot, and takes it possibly-undefined,
 * because the shell holds a snapshot that may not have arrived and the record
 * loaders hold one that has.
 */
export const readCommentPermissions = (
  access: DataSlice<AccessProjection> | undefined,
): {
  readonly currentPrincipalId: PrincipalId | undefined;
  readonly canComment: boolean;
  readonly canResolve: boolean;
} => {
  const currentPrincipalId =
    access?.kind === "ready" ? access.data.currentPrincipalId : undefined;
  const currentMember =
    access?.kind === "ready"
      ? access.data.members.find(
          (member) => member.principalId === currentPrincipalId,
        )
      : undefined;
  const currentGrant = currentMember?.spaces[0];
  const canResolve =
    currentMember?.role === "owner" || currentGrant?.access === "edit";
  return {
    currentPrincipalId,
    canComment: canResolve || currentGrant?.access === "comment",
    canResolve,
  };
};

/** Two letters, or one, or a question mark — never an empty chip. */
export const initialsOf = (name: string): string => {
  const letters = name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => (part[0] ?? "").toLocaleUpperCase("pl-PL"))
    .join("");
  return letters === "" ? "?" : letters;
};

/**
 * An agent's grant is what identifies it, and the PRESET is what it is allowed
 * to do — which is the honest answer to "what is this thing". A grant that has
 * been revoked or has expired still names the author of a line it wrote while
 * it was live, so status is not filtered here: the history is not rewritten by
 * a permission change.
 */
export const buildActorResolver = (
  agentAccess: AgentAccessProjection | undefined,
): ((comment: CommentThread) => CommentActor) => {
  const agents = new Map<string, Grant>(
    (agentAccess?.grants ?? []).map((grant) => [grant.agentPrincipalId, grant]),
  );
  return (comment) => {
    const principalId = comment.author.principalId;
    const grant =
      principalId === undefined ? undefined : agents.get(principalId);
    if (grant !== undefined)
      return {
        name: grant.displayName,
        // Replaced by the spark in the panel, so it never reaches a reader —
        // but it is filled rather than left empty, because a shape with a hole
        // in it invites the next caller to render the hole.
        short: initialsOf(grant.displayName),
        agent: true,
        role: grant.preset,
      };
    const name = comment.author.displayName.trim();
    // Written by the application itself rather than by anyone in the
    // workspace. Named as such instead of shown as a blank chip: an empty
    // author reads as a rendering fault, and this one is a fact.
    if (name === "") return SYSTEM_ACTOR;
    return { name, short: initialsOf(name), agent: false, role: "member" };
  };
};

/**
 * What a mention says out loud. Your own name is "You" — a mention list that
 * names you in the third person makes you read every line to find out whether
 * one of them was addressed to you.
 *
 * A principal nobody can name is "Participant" and not the raw id: an
 * identifier on a line of prose is noise, and the fact worth carrying is that
 * somebody was named at all.
 */
export const buildMentionResolver = (
  candidates: MentionCandidatesProjection | undefined,
  currentPrincipalId: PrincipalId | undefined,
): ((principalId: string) => string) => {
  const byId = new Map<string, string>(
    (candidates?.candidates ?? []).map((candidate) => [
      candidate.principalId,
      candidate.displayName,
    ]),
  );
  return (principalId) =>
    principalId === currentPrincipalId
      ? "You"
      : (byId.get(principalId) ?? "Participant");
};
