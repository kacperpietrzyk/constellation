// THE `Folder │ Record │ Date` SWITCHER — exactly what it reorders, and the
// larger half: WHAT IT MUST NOT CHANGE.
//
// The switcher is an ARRANGEMENT, never a filter. In all three positions the
// set of notes is whatever the tree selected, the tree keeps its selection and
// its counters, the panel header keeps its number, and — the property nothing
// in this repo guarded until this lot — THE READING PANE DOES NOT CHANGE. Only
// the headings the rows sit under, their order, and one slot on the row change.
//
// This module is a pure function over the read, with no React, so the property
// above is provable without a browser and the screen has nothing to re-derive.

import type { DocumentId, FolderId } from "@constellation/contracts";

import {
  documentEntityKindCopy,
  type DocumentEntityTargetKind,
} from "../document-entity-reference.js";
import {
  folderPath,
  folderTreeOrder,
  isUnfiled,
  type FolderSummary,
} from "./folder-tree.js";

export const noteArrangements = ["folder", "record", "date"] as const;
export type NoteArrangement = (typeof noteArrangements)[number];

export const noteArrangementLabel: Record<NoteArrangement, string> = {
  folder: "Folder",
  record: "Record",
  date: "Date",
};

export interface NoteReference {
  readonly targetKind: DocumentEntityTargetKind;
  readonly targetId: string;
  readonly label: string;
}

export interface ArrangeableNote {
  readonly id: DocumentId;
  readonly title: string;
  readonly folderId?: FolderId | undefined;
  readonly references: readonly NoteReference[];
  readonly updatedAt: string;
}

export interface NoteGroup<Note extends ArrangeableNote> {
  readonly key: string;
  readonly label: string;
  /** The record KIND under a `Record` heading — two clients can share a name. */
  readonly sub?: string;
  readonly items: readonly Note[];
}

/** Newest first, id as the tiebreak so equal timestamps still have one order. */
const newestFirst = <Note extends ArrangeableNote>(
  left: Note,
  right: Note,
): number =>
  right.updatedAt.localeCompare(left.updatedAt) ||
  left.id.localeCompare(right.id);

/**
 * `Unfiled` is a group like any other and it is FORCED LAST, not sorted there:
 * it is not a folder, so it has no place in tree order, and putting it first
 * would read as the tree's first entry.
 */
const UNFILED_GROUP = "unfiled";

/** The group a note with no references sits in — see `arrangeNotes`. */
export const NO_RECORD_GROUP = "no-record";

/**
 * The three date buckets, DERIVED FROM A CLOCK THE CALLER PASSES IN.
 *
 * `now` is a parameter and not `Date.now()` inside, and that is not style: an
 * assertion over a bucket boundary needs to choose the day it is standing on,
 * and this wave has already turned `main` red overnight with a duration
 * asserted against a hard-coded date. Nothing here pins a date, a month or a
 * count.
 */
const dateBuckets = ["Last seven days", "Earlier this month", "Older"] as const;

const bucketOf = (
  updatedAt: string,
  now: number,
): (typeof dateBuckets)[number] => {
  const days = (now - new Date(updatedAt).getTime()) / 86_400_000;
  if (days < 7) return "Last seven days";
  if (days < 31) return "Earlier this month";
  return "Older";
};

/**
 * THE ROTATION LOSES NOTHING, and in `Record` mode that costs an arithmetic
 * surprise which is intentional and must not be "fixed": a note with N
 * references is read under N headings, so the group sizes sum to MORE than the
 * number of notes. The header counts NOTES; the groups count APPEARANCES. A row
 * count against the note count is red by design here — count distinct ids, and
 * say which mode you are in.
 *
 * And a note about no record at all still appears, under its own heading. The
 * prototype's own comment says why: without it the rotation silently drops part
 * of the library, and a switcher that hides notes is not an arrangement.
 */
export const arrangeNotes = <Note extends ArrangeableNote>(
  mode: NoteArrangement,
  notes: readonly Note[],
  folders: readonly FolderSummary[],
  now: number,
): readonly NoteGroup<Note>[] => {
  const sorted = [...notes].sort(newestFirst);
  if (mode === "folder") {
    const groups: NoteGroup<Note>[] = [];
    // TREE ORDER, not alphabetical: the headings walk the tree the panel beside
    // them draws, so a reader scanning down the list is scanning down the tree.
    // Sorting the full paths as strings would look almost right and would put a
    // deep subtree before its own parent's siblings.
    for (const folder of folderTreeOrder(folders)) {
      const items = sorted.filter((note) => note.folderId === folder.id);
      if (items.length === 0) continue;
      groups.push({
        key: folder.id,
        label: folderPath(folders, folder.id),
        items,
      });
    }
    const loose = sorted.filter((note) => isUnfiled(note, folders));
    if (loose.length > 0)
      groups.push({ key: UNFILED_GROUP, label: "Unfiled", items: loose });

    return groups;
  }
  if (mode === "record") {
    const groups = new Map<
      string,
      { reference: NoteReference; items: Note[] }
    >();
    const loose: Note[] = [];
    for (const note of sorted) {
      if (note.references.length === 0) {
        loose.push(note);
        continue;
      }
      for (const reference of note.references) {
        const key = `${reference.targetKind}:${reference.targetId}`;
        const held = groups.get(key);
        if (held === undefined) groups.set(key, { reference, items: [note] });
        else held.items.push(note);
      }
    }
    const ordered = [...groups.entries()]
      .sort(
        ([leftKey, left], [rightKey, right]) =>
          right.items.length - left.items.length ||
          left.reference.label.localeCompare(right.reference.label, "pl") ||
          leftKey.localeCompare(rightKey),
      )
      .map(([key, group]) => ({
        key,
        label: group.reference.label,
        // The KIND, from the one map that is total over the contract union —
        // never a second copy of that vocabulary written here. Without it two
        // groups named `Northstar` are indistinguishable.
        sub: documentEntityKindCopy[group.reference.targetKind],
        items: group.items,
      }));
    return loose.length === 0
      ? ordered
      : [
          ...ordered,
          {
            key: NO_RECORD_GROUP,
            label: "Not about any record yet",
            items: loose,
          },
        ];
  }
  // `Date` — and here an EMPTY BUCKET DISAPPEARS, which is the opposite of the
  // Sources screen, where an empty kind keeps its heading. Both are deliberate:
  // an empty bucket says something about the calendar, an empty source kind
  // says something about your week.
  return dateBuckets
    .map((bucket) => ({
      key: bucket,
      label: bucket,
      items: sorted.filter((note) => bucketOf(note.updatedAt, now) === bucket),
    }))
    .filter((group) => group.items.length > 0);
};
