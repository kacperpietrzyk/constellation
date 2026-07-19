/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  MeetingMarkdown,
  toMeetingResultPreview,
  toPlainMeetingMarkdown,
} from "../src/MeetingMarkdown.js";

const render = (value: string): string =>
  renderToStaticMarkup(createElement(MeetingMarkdown, { value }));

test("renders Jamie markdown as safe semantic content", () => {
  const markup = render(
    [
      "## Executive Summary",
      "",
      "- **Planowane spotkanie** z przedstawicielem.",
      "- Drugi punkt z `kodem`.",
      "",
      "> Ustalenie pozostaje po stronie zespołu.",
      "",
      "[Źródło](https://example.com) <script>alert('x')</script>",
    ].join("\n"),
  );

  assert.match(markup, /<h4>Executive Summary<\/h4>/);
  assert.match(markup, /<ul><li><strong>Planowane spotkanie<\/strong>/);
  assert.match(markup, /<code>kodem<\/code>/);
  assert.match(markup, /<blockquote>Ustalenie/);
  assert.match(markup, /href="https:\/\/example.com"/);
  assert.doesNotMatch(markup, /\*\*/);
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
});

test("renders fenced code blocks without leaking fence syntax", () => {
  const markup = render(
    [
      "Fragment konfiguracji:",
      "```json",
      '{ "retry": true }',
      "```",
      "Po bloku wracamy do akapitu.",
    ].join("\n"),
  );

  assert.match(
    markup,
    /<pre><code>\{ &quot;retry&quot;: true \}<\/code><\/pre>/,
  );
  assert.doesNotMatch(markup, /```/);
  assert.match(markup, /<p>Po bloku wracamy do akapitu\.<\/p>/);
});

test("degrades tables to a labelled list without pipe syntax", () => {
  const markup = render(
    [
      "| Temat | Właściciel |",
      "| --- | --- |",
      "| Budżet | Anna |",
      "| Termin | Piotr |",
    ].join("\n"),
  );

  assert.doesNotMatch(markup, /\|/);
  assert.doesNotMatch(markup, /<table/);
  assert.match(markup, /<ul><li>/);
  assert.match(markup, /<strong>Temat: <\/strong>Budżet/);
  assert.match(markup, /<strong>Właściciel: <\/strong>Anna/);
  assert.match(markup, /<strong>Temat: <\/strong>Termin/);
  assert.match(markup, /<strong>Właściciel: <\/strong>Piotr/);
});

test("degrades images to links carrying the alt text", () => {
  const markup = render(
    "Diagram: ![Przepływ decyzji](https://example.com/diagram.png)",
  );

  assert.doesNotMatch(markup, /<img/);
  assert.doesNotMatch(markup, /!\[/);
  assert.match(
    markup,
    /<a href="https:\/\/example.com\/diagram.png"[^>]*>Przepływ decyzji<\/a>/,
  );
});

test("keeps every item when a list starts deeper than later lines", () => {
  const markup = render(
    ["   - podpunkt", "- punkt główny", "- drugi punkt"].join("\n"),
  );

  assert.match(markup, /<li>podpunkt<\/li>/);
  assert.match(markup, /<ul><li>punkt główny<\/li><li>drugi punkt<\/li><\/ul>/);
});

test("keeps items that dedent below the list's starting level", () => {
  const markup = render(["  - a", "  - b", "- top"].join("\n"));

  assert.match(markup, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(markup, /<li>top<\/li>/);
});

test("splits a table glued to the preceding paragraph", () => {
  const markup = render(
    ["Wyniki:", "| A | B |", "| --- | --- |", "| 1 | 2 |"].join("\n"),
  );

  assert.doesNotMatch(markup, /\|/);
  assert.match(markup, /<p>Wyniki:<\/p>/);
  assert.match(markup, /<strong>A: <\/strong>1/);
  assert.match(markup, /<strong>B: <\/strong>2/);
});

test("does not swallow a pipe-containing paragraph right after a table", () => {
  const markup = render(
    ["| A | B |", "| --- | --- |", "| 1 | 2 |", "Koszt 10 | 20 zł"].join("\n"),
  );

  assert.match(markup, /<strong>A: <\/strong>1/);
  assert.match(markup, /<p>Koszt 10 \| 20 zł<\/p>/);
  assert.doesNotMatch(markup, /<strong>A: <\/strong>Koszt/);
});

test("renders nested lists as nested markup", () => {
  const markup = render(["- Plan", "  - Szczegół", "- Koniec"].join("\n"));

  assert.match(
    markup,
    /<ul><li>Plan<ul><li>Szczegół<\/li><\/ul><\/li><li>Koniec<\/li><\/ul>/,
  );
});

test("allows http and mailto links but drops unsafe schemes", () => {
  const markup = render(
    [
      "[Dokumentacja](http://example.com/docs)",
      "[Napisz](mailto:zespol@example.com)",
      "[Zło](javascript:alert(1))",
    ].join(" "),
  );

  assert.match(markup, /<a href="http:\/\/example.com\/docs"/);
  assert.match(markup, /<a href="mailto:zespol@example.com"/);
  assert.doesNotMatch(markup, /javascript:/);
  assert.match(markup, /<span>Zło<\/span>/);
});

test("toPlainMeetingMarkdown strips extended syntax from summaries", () => {
  const plain = toPlainMeetingMarkdown(
    [
      "## Ustalenia",
      "| Temat | Osoba |",
      "| --- | --- |",
      "| Budżet | Anna |",
      "![Diagram](https://example.com/d.png)",
      "```",
      "kod pomocniczy",
      "```",
      "[Notatka](mailto:zespol@example.com)",
    ].join("\n"),
  );

  assert.doesNotMatch(plain, /[|`#!\[\]]/);
  assert.match(plain, /Ustalenia/);
  assert.match(plain, /Budżet Anna/);
  assert.match(plain, /Diagram/);
  assert.match(plain, /Notatka/);
});

test("toMeetingResultPreview keeps collection content semantic and bounded", () => {
  const preview = toMeetingResultPreview(
    `## Ustalenia\n${"Bardzo długie podsumowanie spotkania. ".repeat(20)}`,
  );

  assert.ok(preview.length <= 220);
  assert.match(preview, /^Ustalenia Bardzo długie/);
  assert.match(preview, /…$/);
  assert.doesNotMatch(preview, /[#*_`]/);
});

test("toMeetingResultPreview leaves short summaries intact", () => {
  assert.equal(
    toMeetingResultPreview("**Krótki wynik** bez dalszych szczegółów."),
    "Krótki wynik bez dalszych szczegółów.",
  );
});
