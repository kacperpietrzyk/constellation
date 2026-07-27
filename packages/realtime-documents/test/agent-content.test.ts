import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  agentContentBaseline,
  projectAgentContent,
  storedStateVectorSha256,
} from "../src/agent-content.js";
import { YjsRealtimeDocumentAdapter } from "../src/index.js";

const OUTCOME_BEFORE = "Zamknąć migrację AKMF do końca lipca.";
const OUTCOME_AFTER = "Zamknąć migrację AKMF i wydać raport powdrożeniowy.";
const AUTHOR = "41000000-0000-4000-8000-0000000000f1";

/** The body a Project gets the first time anything opens or writes it. */
const materialised = (text: string): Uint8Array => {
  const baseline = agentContentBaseline({
    seed: { text, principalId: AUTHOR },
    origin: { kind: "remote" },
  });
  try {
    assert.equal(baseline.created, true);
    return baseline.adapter.encodeState();
  } finally {
    baseline.adapter.destroy();
  }
};

describe("a Project body is measured against the seed it was made from", () => {
  /**
   * The defect this closes: `contentOrigin` compared the stored body against the
   * *current* `intendedOutcome`, so rewriting that field reclassified a body
   * nobody had touched as somebody's work. An agent honouring `authored` then
   * refused to write the page that most needed writing, and a person opening the
   * Project was shown a stale copy of a field the record had already corrected,
   * with nothing saying the two disagreed.
   */
  it("still reads as seeded after the intended outcome is rewritten", () => {
    const state = materialised(OUTCOME_BEFORE);
    const before = projectAgentContent({
      state,
      seed: { text: OUTCOME_BEFORE, principalId: AUTHOR },
    });
    assert.equal(before.contentOrigin, "seeded");

    const after = projectAgentContent({
      state,
      seed: { text: OUTCOME_AFTER, principalId: AUTHOR },
    });
    assert.equal(
      after.contentOrigin,
      "seeded",
      "the seed moved, the body did not — that is drift, not authorship",
    );
    // The discriminator: nothing about the stored body changed between the two
    // reads, so any difference in the verdict could only have come from the seed.
    assert.equal(after.stateVectorSha256, before.stateVectorSha256);
    assert.equal(after.stateVectorSha256, storedStateVectorSha256(state));
  });

  /**
   * The half that must not be lost with it. `seeded` has to keep meaning "there
   * is nothing here to destroy", so real work still has to read as `authored`
   * whether or not the outcome has since moved.
   */
  it("reads as authored once somebody adds to the body, before and after the outcome moves", () => {
    const baseline = agentContentBaseline({
      seed: { text: OUTCOME_BEFORE, principalId: AUTHOR },
      origin: { kind: "remote" },
    });
    let state: Uint8Array;
    try {
      baseline.adapter.replaceText(
        `${OUTCOME_BEFORE}\n\nUstalenia ze spotkania 24.07.`,
        { kind: "human", principalId: AUTHOR },
      );
      state = baseline.adapter.encodeState();
    } finally {
      baseline.adapter.destroy();
    }
    assert.equal(
      projectAgentContent({
        state,
        seed: { text: OUTCOME_BEFORE, principalId: AUTHOR },
      }).contentOrigin,
      "authored",
    );
    assert.equal(
      projectAgentContent({
        state,
        seed: { text: OUTCOME_AFTER, principalId: AUTHOR },
      }).contentOrigin,
      "authored",
      "a body carrying work stays authored no matter which seed it is read against",
    );
  });

  /**
   * A body that happens to hold the *new* outcome is somebody having written it
   * there: the materialisation digest does not match, and the current seed does.
   * Both routes have to agree on `seeded` for the flag to stay one claim.
   */
  it("reads a body rewritten to the current outcome as seeded through the current seed", () => {
    const state = materialised(OUTCOME_AFTER);
    assert.equal(
      projectAgentContent({
        state,
        seed: { text: OUTCOME_AFTER, principalId: AUTHOR },
      }).contentOrigin,
      "seeded",
    );
  });

  /** A body with no seed behind it — a document — is unaffected either way. */
  it("leaves an unseeded empty body reading as seeded", () => {
    const baseline = agentContentBaseline({ origin: { kind: "remote" } });
    let state: Uint8Array;
    try {
      state = baseline.adapter.encodeState();
    } finally {
      baseline.adapter.destroy();
    }
    assert.equal(projectAgentContent({ state }).contentOrigin, "seeded");
  });

  /**
   * The trap the seedless side sets. A document has no seed, but the import path
   * still records a digest — of the text it was handed — so a body an agent
   * wrote there satisfies "this is what seeding its own text would produce". It
   * is somebody's work all the same, and only the caller knowing there was never
   * a seed keeps it reading that way.
   *
   * A Project cannot reach this state: its own import path hands `text: ""`, so
   * the digest it records can only match a body that is empty. Which is why the
   * guard is the seed's presence and not a second discriminator on the body.
   */
  it("reads an agent-written body with no seed behind it as authored", () => {
    const adapter = new YjsRealtimeDocumentAdapter();
    let state: Uint8Array;
    try {
      const written = "Notatka ze spotkania z 24.07.";
      adapter.replaceText(written, { kind: "remote" });
      adapter.migrateToRich(
        createHash("sha256").update(written).digest("hex"),
        { kind: "remote" },
      );
      state = adapter.encodeState();
    } finally {
      adapter.destroy();
    }
    assert.equal(projectAgentContent({ state }).contentOrigin, "authored");
  });

  /**
   * The other half of the same trap, and the one that would have cost real work.
   * A body stored as plain-v1 carries no materialisation digest — the read mints
   * one from the body's own text on the way to upgrading it — so asking whether
   * the body matches "the seed it was made from" compares it against itself and
   * is true for every plain-v1 body there is. A Project page a person filled in
   * would have read as a disposable echo.
   */
  it("reads a plain-v1 body a person filled in as authored, not as its own seed", () => {
    const adapter = new YjsRealtimeDocumentAdapter();
    let state: Uint8Array;
    try {
      adapter.replaceText("Cały kontekst wdrożenia, spisany ręcznie.", {
        kind: "human",
        principalId: AUTHOR,
      });
      state = adapter.encodeState();
    } finally {
      adapter.destroy();
    }
    const read = projectAgentContent({
      state,
      seed: { text: OUTCOME_BEFORE, principalId: AUTHOR },
    });
    assert.equal(read.contentState, "plain-v1");
    assert.equal(read.contentOrigin, "authored");
    // And the legitimate plain-v1 seeded case still answers through the current
    // seed, so the gate costs nothing it should not.
    const seededPlain = new YjsRealtimeDocumentAdapter();
    let seededState: Uint8Array;
    try {
      seededPlain.replaceText(OUTCOME_BEFORE, {
        kind: "human",
        principalId: AUTHOR,
      });
      seededState = seededPlain.encodeState();
    } finally {
      seededPlain.destroy();
    }
    assert.equal(
      projectAgentContent({
        state: seededState,
        seed: { text: OUTCOME_BEFORE, principalId: AUTHOR },
      }).contentOrigin,
      "seeded",
    );
  });
});
