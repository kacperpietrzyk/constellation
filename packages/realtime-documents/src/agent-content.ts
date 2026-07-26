import { createHash } from "node:crypto";

import * as Y from "yjs";

import {
  YjsRealtimeDocumentAdapter,
  type DocumentChangeOrigin,
  type DocumentContentFormat,
} from "./yjs-document-adapter.js";
import type { StructuredDocument } from "./structured-document.js";

/**
 * ADR-070. What an owner's collaborative body is right now, from the agent's
 * side of the boundary. "absent" is a state, not a failure: a Project nobody
 * has opened simply has no body yet, and saying so is what lets a write create
 * one.
 */
export type AgentContentState = "absent" | "plain-v1" | "rich-v1";

/**
 * The digest an owner with no stored body answers with, and therefore the one
 * a caller quotes to say "I expect this owner to have nothing yet". It is the
 * state vector of an empty Yjs document — computed, never written down, so it
 * cannot drift from the engine — which keeps a first write an ordinary
 * compare-and-set instead of a sentinel the contract would have to explain.
 */
export const ABSENT_CONTENT_STATE_VECTOR_SHA256 = ((): string => {
  const document = new Y.Doc();
  try {
    return createHash("sha256")
      .update(Y.encodeStateVector(document))
      .digest("hex");
  } finally {
    document.destroy();
  }
})();

/** The seed a Project's body starts from (ADR-056 §3), when it has one. */
export interface AgentContentSeed {
  readonly text: string;
  readonly principalId: string;
}

export const contentStateOf = (state?: Uint8Array): AgentContentState => {
  if (state === undefined) return "absent";
  const adapter = new YjsRealtimeDocumentAdapter(state);
  try {
    return adapter.getFormat() satisfies DocumentContentFormat as
      "plain-v1" | "rich-v1";
  } finally {
    adapter.destroy();
  }
};

/**
 * The state vector of what is stored, or of an empty document when nothing is.
 * A collaborator's update is computed against this, so a body that was seeded
 * or upgraded on the way in still arrives as one applicable change.
 */
export const storedStateVector = (state?: Uint8Array): Uint8Array => {
  const document = new Y.Doc();
  try {
    if (state !== undefined) Y.applyUpdate(document, state, { kind: "remote" });
    return Y.encodeStateVector(document);
  } finally {
    document.destroy();
  }
};

export const storedStateVectorSha256 = (state?: Uint8Array): string => {
  if (state === undefined) return ABSENT_CONTENT_STATE_VECTOR_SHA256;
  const adapter = new YjsRealtimeDocumentAdapter(state);
  try {
    return createHash("sha256")
      .update(adapter.checkpoint().stateVector)
      .digest("hex");
  } finally {
    adapter.destroy();
  }
};

/**
 * The one case a total read still cannot answer: the stored body exists but its
 * rich projection cannot be produced — too large, or holding nodes outside the
 * schema. It names itself rather than arriving as an internal fault, which is
 * how the plain-v1 case used to reach an agent.
 */
export class AgentContentUnreadableError extends Error {
  public constructor() {
    super("AGENT_CONTENT_UNREADABLE");
    this.name = "AgentContentUnreadableError";
  }
}

/**
 * The document a write starts from, always rich-v1: an absent body is created
 * (seeded from the Project's intended outcome where there is one, so an agent
 * writing first never costs the Project the seed a human would have got), and
 * a plain-v1 body is upgraded in place.
 *
 * The legacy digest the upgrade records is computed here from the document's
 * own text and never accepted from a caller, so it keeps meaning what ADR-054
 * says it means.
 */
export const agentContentBaseline = (input: {
  readonly state?: Uint8Array;
  readonly seed?: AgentContentSeed;
  readonly origin: DocumentChangeOrigin;
}): {
  readonly adapter: YjsRealtimeDocumentAdapter;
  readonly created: boolean;
  readonly upgradedFrom?: "plain-v1";
} => {
  if (input.state === undefined) {
    const adapter = new YjsRealtimeDocumentAdapter();
    // The seed is a human's material — the outcome they wrote on the Project —
    // so it is attributed to them rather than to the agent that happened to
    // materialise it (ADR-056 §3).
    const seedOrigin: DocumentChangeOrigin =
      input.seed === undefined
        ? input.origin
        : { kind: "human", principalId: input.seed.principalId };
    const text = input.seed?.text ?? "";
    adapter.replaceText(text, seedOrigin);
    adapter.migrateToRich(
      createHash("sha256").update(text).digest("hex"),
      seedOrigin,
    );
    return { adapter, created: true };
  }
  const adapter = new YjsRealtimeDocumentAdapter(input.state);
  if (adapter.getFormat() === "rich-v1") return { adapter, created: false };
  adapter.migrateToRich(
    createHash("sha256").update(adapter.getText()).digest("hex"),
    input.origin,
  );
  return { adapter, created: false, upgradedFrom: "plain-v1" };
};

/**
 * Where the body a read hands back came from — the question `contentState`
 * looks like it answers and does not.
 *
 * A Project's body is materialised the moment a person merely *opens* it, and
 * the app seeds it with the Project's own `intendedOutcome` (ADR-056 §3). So
 * `rich-v1` covers both "somebody did real work here" and "a page was looked
 * at once", and an agent deciding whether it may write has no way to tell the
 * two apart from the read. Measured in the field on 0.1.6: of four real
 * Projects, two held nothing but a word-for-word echo of their own outcome.
 * Skipping those wastes the Project; overwriting the fourth destroys work.
 *
 * `seeded` states that the stored body holds nothing the system did not put
 * there itself — for a Project, the seed; for a document, which has no seed,
 * an empty body. It is a claim about *content*, not about authorship: a person
 * who edits one word of the seeded paragraph has authored it, and that is the
 * correct reading, because from then on there is something to lose.
 */
export type AgentContentOrigin = "absent" | "seeded" | "authored";

const seedOnlyContent = (seed?: AgentContentSeed): string => {
  const baseline = agentContentBaseline({
    ...(seed === undefined ? {} : { seed }),
    origin: { kind: "remote" },
  });
  try {
    return JSON.stringify(baseline.adapter.getStructuredContent());
  } finally {
    baseline.adapter.destroy();
  }
};

/**
 * The total read. The digest and the state describe what is *stored*, so a
 * caller can quote the digest back and have its write refuse if anything moved
 * meanwhile; the body describes what the next write will start from, produced
 * by running the very same baseline on a throwaway copy. Nothing here is
 * persisted, and no update is emitted: reading never mutates.
 */
export const projectAgentContent = (input: {
  readonly state?: Uint8Array;
  readonly seed?: AgentContentSeed;
}): {
  readonly contentState: AgentContentState;
  readonly contentOrigin: AgentContentOrigin;
  readonly content: StructuredDocument;
  readonly text: string;
  readonly entityReferences: ReturnType<
    YjsRealtimeDocumentAdapter["getEntityReferences"]
  >;
  readonly stateVectorSha256: string;
} => {
  const contentState = contentStateOf(input.state);
  const stateVectorSha256 = storedStateVectorSha256(input.state);
  const baseline = agentContentBaseline({
    ...(input.state === undefined ? {} : { state: input.state }),
    ...(input.seed === undefined ? {} : { seed: input.seed }),
    origin: { kind: "remote" },
  });
  try {
    const content = baseline.adapter.getStructuredContent();
    return {
      contentState,
      // Compared structurally against what the seed alone produces, rather
      // than by matching text against `intendedOutcome`: an added block, a
      // link, or a changed word all make a body somebody's, and only the
      // structure sees all three.
      contentOrigin:
        contentState === "absent"
          ? "absent"
          : JSON.stringify(content) === seedOnlyContent(input.seed)
            ? "seeded"
            : "authored",
      content,
      text: baseline.adapter.getText(),
      entityReferences: baseline.adapter.getEntityReferences(),
      stateVectorSha256,
    };
  } catch {
    throw new AgentContentUnreadableError();
  } finally {
    baseline.adapter.destroy();
  }
};
