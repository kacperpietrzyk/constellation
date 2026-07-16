/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MeetingMarkdown } from "../src/MeetingMarkdown.js";

test("renders Jamie markdown as safe semantic content", () => {
  const markup = renderToStaticMarkup(
    createElement(MeetingMarkdown, {
      value: [
        "## Executive Summary",
        "",
        "- **Planowane spotkanie** z przedstawicielem.",
        "- Drugi punkt z `kodem`.",
        "",
        "> Ustalenie pozostaje po stronie zespołu.",
        "",
        "[Źródło](https://example.com) <script>alert('x')</script>",
      ].join("\n"),
    }),
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
