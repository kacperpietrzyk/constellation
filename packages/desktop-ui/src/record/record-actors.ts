import type { PrincipalId } from "@constellation/contracts";

import type {
  AgentAccessProjection,
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
