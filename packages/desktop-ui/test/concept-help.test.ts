/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { conceptHelpTopics } from "../src/components/ConceptHelpDialog.js";

describe("contextual concept help contract", () => {
  it("defines every enterprise term once in user language", () => {
    assert.deepEqual(
      conceptHelpTopics.map((topic) => topic.id),
      ["data-home", "hub", "mcp", "agent-access", "recovery"],
    );
    assert.equal(new Set(conceptHelpTopics.map((topic) => topic.id)).size, 5);
    assert.equal(new Set(conceptHelpTopics.map((topic) => topic.term)).size, 5);
    for (const topic of conceptHelpTopics) {
      assert.match(topic.question, /\?$/);
      assert.ok(topic.explanation.length >= 80);
      assert.ok(topic.boundary.length >= 80);
    }
  });

  it("explains technical boundaries without inventing product capabilities", () => {
    const content = conceptHelpTopics
      .map((topic) => `${topic.explanation} ${topic.boundary}`)
      .join(" ");
    assert.match(content, /nie uruchamia modelu ani czatu/i);
    assert.match(content, /nie synchronizuje otwartego pliku bazy/i);
    assert.match(content, /Nie omija granic workspace/i);
    assert.match(content, /nie są zastępowane bez potwierdzenia/i);
  });
});
