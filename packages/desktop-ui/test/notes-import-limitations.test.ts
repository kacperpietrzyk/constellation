import assert from "node:assert/strict";
import test from "node:test";

import {
  MARKDOWN_IMPORT_CONSTRUCTS,
  STRUCTURED_DOCUMENT_MARK_KINDS,
  STRUCTURED_DOCUMENT_NODE_KINDS,
} from "@constellation/realtime-documents";

import { notesImportLimitations } from "../src/notes-import-limitations.js";

/**
 * THE GUARD ON THE "WILL NOT MIGRATE" LIST.
 *
 * The list is a hand-written list beside a closed vocabulary, which is the
 * defect family this repository has met eleven times — so it is held against
 * the vocabulary in BOTH directions rather than read for phrases. It watches
 * the shape: what is counted must be named, what is named must be counted, and
 * a construct's stated reason for having no home must still be true.
 *
 * Each assertion below was verified by breaking it, with `tsc -b` inside the
 * loop.
 */

test("every construct the parser counts is named in the list, exactly once", () => {
  // BROKEN BY: adding a member to `MARKDOWN_IMPORT_CONSTRUCTS` and not adding
  // an entry here. A vault construct the scan counts and the screen never
  // mentions is exactly the surprise this list exists to prevent.
  const claimed = notesImportLimitations.flatMap((entry) =>
    entry.construct === false ? [] : [entry.construct],
  );
  assert.deepEqual(
    [...claimed].sort(),
    [...MARKDOWN_IMPORT_CONSTRUCTS].sort(),
    "the list and the parser's own vocabulary do not cover each other",
  );
  assert.equal(
    new Set(claimed).size,
    claimed.length,
    "two entries claim one construct, so one count would be shown twice",
  );
});

test("nothing in the list claims a home the schema already has", () => {
  // BROKEN BY: adding `callout` to `STRUCTURED_DOCUMENT_NODE_KINDS`. The day a
  // construct becomes expressible, its entry here stops being true and has to
  // be removed — which is the moment nobody would otherwise notice.
  for (const entry of notesImportLimitations) {
    if (entry.wouldNeedNodeKind !== undefined)
      assert.equal(
        (STRUCTURED_DOCUMENT_NODE_KINDS as readonly string[]).includes(
          entry.wouldNeedNodeKind,
        ),
        false,
        `"${entry.id}" says there is no ${entry.wouldNeedNodeKind} node, and there is one`,
      );
    if (entry.wouldNeedMark !== undefined)
      assert.equal(
        (STRUCTURED_DOCUMENT_MARK_KINDS as readonly string[]).includes(
          entry.wouldNeedMark,
        ),
        false,
        `"${entry.id}" says there is no ${entry.wouldNeedMark} mark, and there is one`,
      );
  }
});

test("every entry has its own id", () => {
  // Two entries under one id would render one row twice and leave the other
  // construct unnamed — the count beside it would go to the wrong line.
  const ids = notesImportLimitations.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(
    ids.length > 0,
    "the list is empty, so this guard measures nothing",
  );
});

// THE WORDS are asserted where they are rendered, in
// `notes-import.interaction.test.tsx`: every entry must draw a `<dd>` saying
// what happens instead, because an entry naming a construct with no account of
// the consequence is a warning label with nothing on it. They live in
// `SettingsSurface.tsx` — deliberately outside the prose guard, which is what
// the Settings exception exists for — behind a TOTAL `Record` keyed by these
// ids, so an id added here without copy does not compile.
