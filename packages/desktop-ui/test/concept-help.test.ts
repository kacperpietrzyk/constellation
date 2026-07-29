/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { conceptHelpTopics } from "../src/components/ConceptHelpDialog.js";

const trimmed = (value: string): string => value.trim();

describe("contextual concept help contract", () => {
  it("defines every enterprise term once in user language", () => {
    assert.deepEqual(
      conceptHelpTopics.map((topic) => topic.id),
      ["data-home", "hub", "mcp", "agent-access", "recovery"],
    );
    const count = conceptHelpTopics.length;
    assert.equal(
      new Set(conceptHelpTopics.map((topic) => topic.id)).size,
      count,
    );
    assert.equal(
      new Set(conceptHelpTopics.map((topic) => topic.term)).size,
      count,
    );
    for (const topic of conceptHelpTopics) {
      assert.match(topic.question, /\?$/);
      assert.ok(
        trimmed(topic.explanation).length >= 80,
        `Pojęcie ${topic.id} nie ma wyjaśnienia.`,
      );
    }
  });

  /* Granica jest osobnym polem i osobną obietnicą: pomoc ma powiedzieć, gdzie
     możliwość się KOŃCZY. Nie da się tego sprawdzić po słowach bez wiązania
     testu z jednym językiem, więc sprawdzamy to strukturalnie — dla KAŻDEGO
     pojęcia, nie tylko dla tych, które kiedyś wpadły w regex. */
  it("states a boundary for every concept, distinct from its explanation", () => {
    const count = conceptHelpTopics.length;
    const explanations = new Set(
      conceptHelpTopics.map((topic) => trimmed(topic.explanation)),
    );

    for (const topic of conceptHelpTopics) {
      const boundary = trimmed(topic.boundary);
      const explanation = trimmed(topic.explanation);
      assert.ok(
        boundary.length >= 80,
        `Pojęcie ${topic.id} nie mówi, gdzie kończy się możliwość.`,
      );
      assert.notEqual(
        boundary,
        explanation,
        `Pojęcie ${topic.id} podaje wyjaśnienie zamiast granicy.`,
      );
      assert.ok(
        !explanation.includes(boundary) && !boundary.includes(explanation),
        `Granica pojęcia ${topic.id} tylko powtarza wyjaśnienie.`,
      );
      assert.ok(
        !explanations.has(boundary),
        `Granica pojęcia ${topic.id} jest wyjaśnieniem innego pojęcia.`,
      );
    }

    // Żadne pojęcie nie pożycza granicy ani wyjaśnienia od sąsiada.
    assert.equal(
      new Set(conceptHelpTopics.map((topic) => trimmed(topic.boundary))).size,
      count,
    );
    assert.equal(explanations.size, count);
  });
});
