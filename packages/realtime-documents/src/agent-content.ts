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
 *
 * The seed a body is measured against is the one it was *materialised* from, not
 * only the one the record carries today. Comparing against today's alone made
 * `project.updateOutcome` enough to report a body nobody had touched as
 * `authored` — the flag then said "the body no longer equals the current seed",
 * which is not what a caller reads it as, and it withheld exactly the pages most
 * worth rewriting.
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
 * Whether this body is still the seed it was materialised from, after that seed
 * has been rewritten on the record.
 *
 * The comparison against the *current* seed cannot answer it: a
 * `project.updateOutcome` moves the field out from under a body nobody touched,
 * and reporting that as authorship tells an agent there is work to lose where
 * there is none — and tells a person the page they are reading is theirs when it
 * is a stale copy of a field the record has already corrected.
 *
 * Nothing new is stored to answer it. Materialisation already records the sha256
 * of the text it seeded from, inside the document (`migrateDocumentToRich`), so
 * the question becomes: is this body exactly what seeding *its own text* would
 * produce, and is that text the text this body was made from? Both halves are
 * needed. The digest alone would let an added empty block pass; the structural
 * match alone would call any single-paragraph body a seed.
 *
 * Only ever asked of an owner that *has* a seed, and only of a body that was
 * *stored* rich. Both gates are load-bearing and neither is obvious.
 *
 * A document has no seed, and the import path records a digest of the text it
 * was handed — so a document whose body an agent wrote would answer this
 * question with "yes" and have somebody's work reported as disposable.
 *
 * A body stored as plain-v1 has no recorded materialisation seed at all: the
 * baseline mints one *during this very read*, from the body's own text, in order
 * to upgrade it. Asking then compares the body against itself and is true for
 * every plain-v1 body ever written — which would report a page a person filled
 * in as an echo of a seed. `contentState` is the only thing that distinguishes
 * a digest this document has carried since it was made from one invented a
 * microsecond ago, so the caller checks it.
 */
const matchesMaterialisationSeed = (
  adapter: YjsRealtimeDocumentAdapter,
  content: StructuredDocument,
  principalId: string,
): boolean => {
  const digest = adapter.getLegacyDigest();
  if (digest === undefined) return false;
  const text = adapter.getText();
  if (createHash("sha256").update(text).digest("hex") !== digest) return false;
  return JSON.stringify(content) === seedOnlyContent({ text, principalId });
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
          : JSON.stringify(content) === seedOnlyContent(input.seed) ||
              (input.seed !== undefined &&
                contentState === "rich-v1" &&
                matchesMaterialisationSeed(
                  baseline.adapter,
                  content,
                  input.seed.principalId,
                ))
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
