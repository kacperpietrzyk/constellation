// Which columns the table draws, kept per saved view and per device.
//
// It came off the retired work surface, where it chose which FIELDS the list
// rows showed. It lands on the TABLE rather than on the list, and that is the
// substance of the move: the table is the layout that answers "what does this
// whole set look like, field by field", and the list is the one that answers in
// a sentence. Choosing columns on a layout that has none was the older screen
// working around not having a table.
//
// Two columns are not offered. The title is what a row IS, and the status shape
// is the one mark the row is told apart by; a table that can hide either draws
// rows nobody can read.

/** A column the reader may turn off. Workspace fields join by id, which is why
 *  this is a template and not a closed union. */
export type TaskColumnKey =
  | "project"
  | "plan"
  | "deadline"
  | "state"
  | "priority"
  | "owner"
  | `field:${string}`;

/** The built-in columns, in the order the table draws them. The LABELS are not
 *  here: only the chooser needs them, the chooser is lazy, and Tasks is not —
 *  so a table of English strings imported by the screen would be paid for by
 *  every reader who never opens it. */
export const taskColumnKeys: readonly TaskColumnKey[] = [
  "project",
  "plan",
  "deadline",
  "state",
  "priority",
  "owner",
];

const storageKey = (viewKey: string): string =>
  `constellation.task-columns.${viewKey}`;

/**
 * Where the same preference sat when it chose LIST fields on the work surface,
 * and the names it used there.
 *
 * Kept rather than abandoned: this is a device-local choice, and silently
 * resetting one is the kind of loss nobody reports because nobody is sure it was
 * ever set. The two names that changed did so because the column is named after
 * what the table calls it, not after what the projection calls it.
 */
const retiredKey = (viewKey: string): string =>
  `constellation.work-list-fields.${viewKey}`;

const RETIRED_NAMES: Readonly<Record<string, TaskColumnKey>> = {
  context: "project",
  status: "state",
  assignee: "owner",
  priority: "priority",
  start: "plan",
  due: "deadline",
};

const translate = (stored: readonly string[]): TaskColumnKey[] =>
  stored
    .map((name) =>
      name.startsWith("field:") ? (name as TaskColumnKey) : RETIRED_NAMES[name],
    )
    .filter((name): name is TaskColumnKey => name !== undefined);

const readStored = (key: string): readonly string[] | undefined => {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw === null || raw === undefined) return undefined;
    const parsed: unknown = JSON.parse(raw);
    // A half-written value reads as nothing stored. Losing a column choice is
    // not worth failing the render over.
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string")
      ? (parsed as string[])
      : undefined;
  } catch {
    return undefined;
  }
};

export const readTaskColumns = (
  viewKey: string,
  available: readonly TaskColumnKey[],
): readonly TaskColumnKey[] => {
  const current = readStored(storageKey(viewKey));
  const chosen =
    current === undefined
      ? translate(readStored(retiredKey(viewKey)) ?? [])
      : (current as TaskColumnKey[]);
  // Nothing stored at either key is different from a stored EMPTY set: the
  // first means "never chosen", the second means "this reader turned everything
  // off". Only the first falls back to the default.
  if (current === undefined && chosen.length === 0) return available;
  // A column for a field the workspace has since dropped is silently gone, and
  // that is right — it has no data and no heading to draw.
  return chosen.filter((key) => available.includes(key));
};

const persist = (viewKey: string, columns: readonly TaskColumnKey[]): void => {
  try {
    globalThis.localStorage?.setItem(
      storageKey(viewKey),
      JSON.stringify(columns),
    );
  } catch {
    // Storage refused — a full or blocked quota. The choice still applies for
    // as long as this surface is mounted.
  }
};

/**
 * Every column this workspace can offer, built ONCE and called by both readers.
 *
 * Both of them are lazy — the table and the chooser — and neither is the Tasks
 * screen, which is what keeps this whole module off the hot path. The screen
 * holds one piece of state, the chosen set, and knows nothing about how it is
 * stored or what it may contain.
 */
export const availableTaskColumns = (
  fields: readonly {
    readonly id: string;
    readonly state?: string | undefined;
  }[],
): readonly TaskColumnKey[] => [
  ...taskColumnKeys,
  ...fields
    .filter((definition) => definition.state !== "retired")
    .map((definition): TaskColumnKey => `field:${definition.id}`),
];

/**
 * The columns to draw: what the reader has chosen this session, or what they
 * chose last time, or all of them.
 *
 * Keyed on the SAVED VIEW rather than on the surface, exactly as it was: a
 * reader who narrows a view to "waiting on somebody" wants the person column
 * there and wants it back off on the view that is only their own work.
 */
export const taskColumnsFor = (
  chosen: readonly TaskColumnKey[] | undefined,
  viewKey: string,
  available: readonly TaskColumnKey[],
): readonly TaskColumnKey[] => chosen ?? readTaskColumns(viewKey, available);

/** Turning one on or off, in the declared order. Appending instead would move a
 *  column every time it was switched off and back on. */
export const toggledTaskColumn = (
  current: readonly TaskColumnKey[],
  key: TaskColumnKey,
  available: readonly TaskColumnKey[],
): readonly TaskColumnKey[] =>
  current.includes(key)
    ? current.filter((candidate) => candidate !== key)
    : available.filter(
        (candidate) => candidate === key || current.includes(candidate),
      );

export const persistTaskColumns = persist;
