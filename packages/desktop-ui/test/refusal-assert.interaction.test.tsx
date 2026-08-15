import { strict as assert } from "node:assert";

import { test } from "vitest";

import { projectionRefusedMessage } from "../src/client/workflow.js";
import {
  assertRefusalIsRecoverable,
  assertRefusalReadsAsASentence,
} from "./refusal-assert.js";

// DOWÓD, ŻE POPRAWKA COPY 7-2 JEST MOŻLIWA BEZ PRZEWRACANIA TESTÓW — i że nowa
// asercja nie jest przez to pusta. Dwa kierunki, oba na sztucznym panelu, bo
// pytanie dotyczy SAMEJ ASERCJI, nie ekranu.
//
// Dlaczego to jest test interakcji, a nie `node:test`: potrzebuje DOM-u
// (`attributes`, `children`, `textContent`), a DOM w tym repozytorium ma
// wyłącznie Vitest z happy-domem.

const panelWith = (html: string): HTMLElement => {
  const panel = document.createElement("div");
  panel.innerHTML = html;
  return panel;
};

const throws = (run: () => void): string => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
};

test("today's panel — the identifiers in the prose — satisfies the assertion", () => {
  const panel = panelWith(
    `<p>${projectionRefusedMessage("radar.review", "query.not_available")}</p>`,
  );
  assertRefusalIsRecoverable(panel, {
    queryName: "radar.review",
    diagnosticCode: "query.not_available",
    what: "today's shape",
  });
  assertRefusalReadsAsASentence(panel, "today's shape");
});

test("the copy fix — a human sentence plus the identifiers in data- attributes — also satisfies it", () => {
  // Dokładnie ten kształt, do którego ogon ma doprowadzić `workflow.ts`:
  // z prozy znika identyfikator kontraktu, a przyczyna zostaje ODZYSKIWALNA.
  const panel = panelWith(
    `<p data-refused-query="radar.review" data-refused-code="query.not_available">` +
      `We could not read the review list. The kernel declined this read; try again.</p>`,
  );
  assertRefusalIsRecoverable(panel, {
    queryName: "radar.review",
    diagnosticCode: "query.not_available",
    what: "the shape the tail is expected to deliver",
  });
  assertRefusalReadsAsASentence(
    panel,
    "the shape the tail is expected to deliver",
  );
});

test("a rewrite that DROPS the cause fails, and says which channel it looked in", () => {
  const panel = panelWith("<p>This view's data is unavailable right now.</p>");
  const message = throws(() =>
    assertRefusalIsRecoverable(panel, {
      queryName: "radar.review",
      diagnosticCode: "query.not_available",
      what: "a rewrite that kept only the advice",
    }),
  );
  assert.match(message, /radar\.review/u);
  assert.match(
    message,
    /neither from its text nor from a declared „data-refused-…" attribute/u,
  );
  // KOMUNIKAT NIE MOŻE OBIECYWAĆ WIĘCEJ, NIŻ ASERCJA SPRAWDZA. Stał w nim
  // argument o czytelniku BEZ DevToolsów, a asercja przechodzi także wtedy, gdy
  // identyfikator jest wyłącznie w atrybucie — czyli w kanale, którego taki
  // czytelnik nie widzi. Ta asercja pilnuje, żeby zdanie nie wróciło.
  assert.ok(
    !/DevTools/u.test(message),
    "the failure message must not argue with a reader who cannot see the channel it accepts: " +
      `„${message}"`,
  );
});

test("an identifier hidden in an UNDECLARED data- attribute does not count as a channel", () => {
  // ZMIERZONE PRZEZ PRZEGLĄD ADWERSARIALNY LOTU NASADY: ten panel PRZECHODZIŁ,
  // bo asercja pytała o dowolny atrybut `data-`. Wtedy `data-testid` albo
  // atrybut dołożony w innym celu spełniał ją przypadkiem, a proza mogła nie
  // mówić czytelnikowi nic.
  const panel = panelWith(
    `<p data-x="radar.review" data-y="query.not_available">Nothing readable here.</p>`,
  );
  assert.match(
    throws(() =>
      assertRefusalIsRecoverable(panel, {
        queryName: "radar.review",
        diagnosticCode: "query.not_available",
        what: "identifiers parked in an attribute nobody declared",
      }),
    ),
    /cannot be recovered from the panel/u,
  );
});

test("a panel made of identifiers is not a sentence, which `length > 20` could not tell", () => {
  const panel = panelWith(
    "<p>radar.review query.not_available 0x1f 0x22 0x40 0x51</p>",
  );
  assert.ok(
    (panel.textContent ?? "").length > 20,
    "the assertion this replaces would have passed this panel",
  );
  assert.match(
    throws(() => assertRefusalReadsAsASentence(panel, "an identifier dump")),
    /ordinary word\(s\)/u,
  );
});
