// The CRDT edit derived from a textarea change: the shared prefix and suffix
// are measured in UTF-16 units and then snapped back to full code points.
// Without the snap, replacing an emoji that shares a surrogate half with the
// previous one would split the pair and Y.Text would materialize U+FFFD.

export type DocumentTextEdit = {
  readonly index: number;
  readonly removed: number;
  readonly inserted: string;
};

const isHighSurrogate = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;
const isLowSurrogate = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;

export const computeDocumentTextEdit = (
  previous: string,
  next: string,
): DocumentTextEdit | undefined => {
  if (previous === next) return undefined;
  const shared = Math.min(previous.length, next.length);
  let prefix = 0;
  while (prefix < shared && previous[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < shared - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  )
    suffix += 1;
  // Snap to code-point boundaries. Both strings agree on the boundary units,
  // so checking one side is enough; widening by one unit is always safe.
  if (prefix > 0 && isHighSurrogate(previous.charCodeAt(prefix - 1)))
    prefix -= 1;
  if (
    suffix > 0 &&
    isLowSurrogate(previous.charCodeAt(previous.length - suffix))
  )
    suffix -= 1;
  return {
    index: prefix,
    removed: previous.length - prefix - suffix,
    inserted: next.slice(prefix, next.length - suffix),
  };
};
