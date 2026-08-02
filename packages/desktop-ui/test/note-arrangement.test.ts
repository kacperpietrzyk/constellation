import { strict as assert } from "node:assert";

import { describe, it } from "node:test";

import { DocumentIdSchema, FolderIdSchema } from "@constellation/contracts";

import {
  arrangeNotes,
  type ArrangeableNote,
} from "../src/library/note-arrangement.js";

/* THE `Date` ARM OF THE SWITCHER, ASSERTED WITHOUT A CLOCK.
 *
 * `arrangeNotes` takes `now` as a parameter rather than reading it, and this
 * file is the reason. A bucket boundary can only be exercised by choosing the
 * day you are standing on, and this wave has already turned `main` red
 * overnight with a duration asserted against a hard-coded date. Nothing here
 * pins a date: every timestamp below is derived from the chosen `now`, so the
 * file says the same thing in any month.
 *
 * The property that matters and is stated nowhere else: AN EMPTY BUCKET
 * DISAPPEARS. That is the deliberate opposite of the Sources screen, where an
 * empty kind keeps its heading — an empty bucket says something about the
 * calendar, an empty source kind says something about your week. A test that
 * only filled all three buckets would pass over a version that always renders
 * all three.
 */

const note = (
  suffix: string,
  daysAgo: number,
  now: number,
): ArrangeableNote => ({
  id: DocumentIdSchema.parse(`00000000-0000-4000-8000-0000000041${suffix}`),
  title: `Note ${suffix}`,
  references: [],
  updatedAt: new Date(now - daysAgo * 86_400_000).toISOString(),
});

// A fixed instant chosen by the test, never "today": the arrangement is a
// function of the two arguments and nothing else.
const NOW = Date.parse("2026-08-01T12:00:00.000Z");

describe("arranging notes by date", () => {
  it("puts a note in the bucket its own age names", () => {
    const notes = [
      note("01", 1, NOW),
      note("02", 12, NOW),
      note("03", 200, NOW),
    ];
    assert.deepEqual(
      arrangeNotes("date", notes, [], NOW).map((group) => [
        group.label,
        group.items.length,
      ]),
      [
        ["Last seven days", 1],
        ["Earlier this month", 1],
        ["Older", 1],
      ],
    );
  });

  it("drops a bucket nothing falls into", () => {
    const notes = [note("04", 2, NOW), note("05", 300, NOW)];
    assert.deepEqual(
      arrangeNotes("date", notes, [], NOW).map((group) => group.label),
      ["Last seven days", "Older"],
      "an empty bucket kept its heading, which is the Sources rule, not this one",
    );
  });

  it("holds the boundary rather than rounding across it", () => {
    // Six days and eight days, not "about a week": the boundary is the whole
    // content of the rule and a fixture that straddles it loosely proves that
    // sorting works, not that the rule does.
    const inside = arrangeNotes("date", [note("06", 6, NOW)], [], NOW);
    const outside = arrangeNotes("date", [note("07", 8, NOW)], [], NOW);
    assert.deepEqual(
      [inside[0]?.label, outside[0]?.label],
      ["Last seven days", "Earlier this month"],
    );
  });

  it("orders every arrangement newest first inside a group", () => {
    const notes = [note("08", 3, NOW), note("09", 1, NOW), note("10", 5, NOW)];
    assert.deepEqual(
      arrangeNotes("date", notes, [], NOW)[0]?.items.map((item) => item.title),
      ["Note 09", "Note 08", "Note 10"],
    );
  });
});

/* AND THE ROTATION LOSES NOTHING — the same claim the screen test makes from
 * the DOM, made here over the function, because the two can disagree only if
 * the screen filters after arranging and that is worth being able to tell
 * apart. A note about no record keeps its own heading in `Record`, and a note
 * outside every folder keeps its own in `Folder`.
 */
describe("arranging notes by record and by folder", () => {
  const folderId = FolderIdSchema.parse("00000000-0000-4000-8000-000000004201");
  const folders = [
    {
      id: folderId,
      name: "Clients",
      noteCount: 1,
      ownNoteCount: 1,
    },
  ];
  const filed: ArrangeableNote = { ...note("11", 1, NOW), folderId };
  const named: ArrangeableNote = {
    ...note("12", 2, NOW),
    references: [
      { targetKind: "task", targetId: "t-1", label: "Confirm the rules" },
      { targetKind: "project", targetId: "p-1", label: "Orbit onboarding" },
    ],
  };

  it("reads a note under every record it names and keeps the rest", () => {
    const groups = arrangeNotes("record", [filed, named], folders, NOW);
    assert.deepEqual(
      groups.map((group) => [group.label, group.sub, group.items.length]),
      [
        ["Confirm the rules", "Task", 1],
        ["Orbit onboarding", "Project", 1],
        ["Not about any record yet", undefined, 1],
      ],
    );
  });

  it("keeps a note outside every folder under its own heading, last", () => {
    const groups = arrangeNotes("folder", [named, filed], folders, NOW);
    assert.deepEqual(
      groups.map((group) => group.label),
      ["Clients", "Unfiled"],
    );
  });
});
