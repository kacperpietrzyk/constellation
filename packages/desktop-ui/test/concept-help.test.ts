/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { conceptHelpTopics } from "../src/components/ConceptHelpDialog.js";
import {
  helpTopic,
  helpTopics,
  type HelpTopicId,
} from "../src/help/help-topics.js";

const trimmed = (value: string): string => value.trim();

describe("contextual concept help contract", () => {
  it("defines every enterprise term once in user language", () => {
    assert.deepEqual(
      conceptHelpTopics.map((topic) => topic.id),
      [
        "data-home",
        "hub",
        "mcp",
        "agent-access",
        "calendar-meetings",
        "recovery",
      ],
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

/* THE 180-CHARACTER CAP FROM #35, AND WHOSE IT IS.
 *
 * The decision fixes 180 characters per topic. Until now that number was
 * asserted NOWHERE — `prose-guard.test.ts` stated it in prose as the reason
 * help is exempt from the shape guard, while the contract above enforces a ≥80
 * floor and NO ceiling on `explanation` and again on `boundary`. The six
 * shipped concept topics measure 117-149 + 98-142, so about 215-280 characters
 * as a reader sees them: the cap was already exceeded by everything that ships.
 *
 * The ruling PR #198 implemented: the NEW topics are capped, the six shipped
 * concept ones are left alone (retrofitting them is real work and is not this
 * wave's), and the assertion says so in its own name. A green run here claims
 * exactly what it measured — `helpTopics` — and nothing about the concept
 * dialog. The array was called `crmHelpTopics` until Wave D put a Meetings
 * topic in it; the name moved with the scope rather than staying behind and
 * making this assertion's own name a false claim about what it measured.
 *
 * ONE PARAGRAPH is asserted as well as 180 characters. A cap on length alone
 * is a cap two 179-character paragraphs walk straight through, which is the
 * lecture-behind-one-click this number exists to prevent.
 */
describe("the #35 help topics — the six shipped concept topics are out of scope", () => {
  const HELP_TOPIC_LIMIT = 180;

  it("gives every #35 topic one paragraph of at most 180 characters", () => {
    const count = helpTopics.length;
    assert.ok(count > 0, "no #35 topic was measured — an empty sweep passes");
    assert.equal(new Set(helpTopics.map((topic) => topic.id)).size, count);
    assert.equal(new Set(helpTopics.map((topic) => topic.term)).size, count);
    assert.equal(
      new Set(helpTopics.map((topic) => trimmed(topic.answer))).size,
      count,
      "two #35 topics answer with the same paragraph",
    );

    for (const topic of helpTopics) {
      const answer = trimmed(topic.answer);
      assert.match(
        topic.question,
        /\?$/u,
        `Topic ${topic.id} does not label its trigger with a question.`,
      );
      assert.ok(
        answer.length >= 80,
        `Topic ${topic.id} answers in ${answer.length} characters — that is a label, not an answer.`,
      );
      assert.ok(
        answer.length <= HELP_TOPIC_LIMIT,
        `Topic ${topic.id} is ${answer.length} characters — a topic over ${HELP_TOPIC_LIMIT} has become a lecture hidden one click away.`,
      );
      assert.ok(
        !/\n/u.test(topic.answer),
        `Topic ${topic.id} answers in more than one paragraph — the cap is 180 characters in ONE.`,
      );
    }
  });

  /* THE VOCABULARY OF TOPIC IDS IS THE ARRAY ITSELF — asserted BOTH WAYS, and
   * asserted by the COMPILER, because that is where this defect lives.
   *
   * `HelpTopicId` used to be a hand-written union standing beside `helpTopics`.
   * An id added to the union alone compiled, `TopicHelp.tsx` returned `null`
   * for it — no `?` drew at all — and this very file stayed green, because it
   * iterates the array and the array had no such entry. So no runtime check
   * placed here could have caught it: the missing thing is missing from the
   * only list a runtime check can read.
   *
   * Both directions matter and each fails a different way. Widening
   * `HelpTopicId` past the array reproduces the original defect. Narrowing it
   * below the array makes an entry that exists unreferenceable. Under a derived
   * union neither is expressible, and BREAKING THE DERIVATION STOPS THE BUILD
   * rather than reddening a test — which is the stronger result of the two.
   */
  it("keeps the topic-id vocabulary derived from the topics themselves", () => {
    type ArrayIds = (typeof helpTopics)[number]["id"];
    const derivedBothWays: [
      HelpTopicId extends ArrayIds
        ? true
        : "HelpTopicId admits an id no topic in the array has",
      ArrayIds extends HelpTopicId
        ? true
        : "a topic in the array has an id HelpTopicId does not admit",
    ] = [true, true];
    assert.deepEqual(derivedBothWays, [true, true]);

    // And the runtime half the type cannot state: every id the union admits
    // resolves to a topic, so `TopicHelp` never takes its silent `null` path.
    for (const id of helpTopics.map((topic) => topic.id)) {
      assert.ok(
        helpTopic(id) !== undefined,
        `the ? for ${id} would render nothing at all`,
      );
    }
  });
});
