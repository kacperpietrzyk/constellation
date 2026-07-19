/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";
import * as Y from "yjs";

import { computeDocumentTextEdit } from "../src/document-text-diff.js";

const applyToYText = (previous: string, next: string): string => {
  const yDocument = new Y.Doc();
  const content = yDocument.getText("content");
  content.insert(0, previous);
  const edit = computeDocumentTextEdit(content.toString(), next);
  if (edit !== undefined) {
    if (edit.removed > 0) content.delete(edit.index, edit.removed);
    if (edit.inserted !== "") content.insert(edit.index, edit.inserted);
  }
  return content.toString();
};

test("zamiana emoji o wspólnym wysokim surogacie nie korumpuje Y.Text", () => {
  // 😀 i 😁 dzielą wysoki surogat \ud83d — naiwny diff tnie parę zastępczą.
  assert.equal(applyToYText("x 😀 y", "x 😁 y"), "x 😁 y");
  assert.equal(applyToYText("👍", "👎"), "👎");
  assert.doesNotMatch(applyToYText("x 😀 y", "x 😁 y"), /�/);
});

test("zamiana emoji o wspólnym niskim surogacie nie korumpuje Y.Text", () => {
  // 😀 (U+1F600) i 🈀 (U+1F200) dzielą niski surogat \ude00.
  assert.equal(applyToYText("a😀b", "a🈀b"), "a🈀b");
  assert.doesNotMatch(applyToYText("a😀b", "a🈀b"), /�/);
});

test("zwykła edycja pozostaje minimalną zmianą środka tekstu", () => {
  const edit = computeDocumentTextEdit("abc AAA def", "abc BB def");
  assert.deepEqual(edit, { index: 4, removed: 3, inserted: "BB" });
  assert.equal(computeDocumentTextEdit("bez zmian", "bez zmian"), undefined);
  assert.equal(applyToYText("abc", "abcd"), "abcd");
  assert.equal(applyToYText("abcd", "abd"), "abd");
});
