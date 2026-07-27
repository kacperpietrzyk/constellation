import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  agentContentBaseline,
  projectAgentContent,
  storedStateVectorSha256,
} from "../src/agent-content.js";

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
});
