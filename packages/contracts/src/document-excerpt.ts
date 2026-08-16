/**
 * THE ONE PLACE THAT TURNS A NOTE'S BODY INTO THE LINE UNDER ITS TITLE.
 *
 * Phase III, entry 11-2. The reference draws a two-line fragment of the text
 * under every row of the note list (`v3/screens/knowledge.css:158-161`,
 * `.kn-row-excerpt`); this application drew a title, a kind and a date, so the
 * only way to tell two notes apart was to open both.
 *
 * WHY THIS IS A MODULE AND NOT THREE LINES INSIDE THE `knowledge.list` ARM.
 * Three callers need the SAME answer or the screen contradicts itself: the
 * kernel composing the projection, the reference store answering the same
 * question with nothing to answer it from, and the development fixture, which
 * has to derive its excerpt from the note body it already carries instead of
 * restating the text by hand. A second spelling of "what the opening of a note
 * looks like" is the `restated-shape-drift` this project keeps re-learning:
 * the fixture would agree with the screen on the day it was written and stop
 * agreeing the day the rule moved.
 *
 * TWO BOUNDS, AND THEY ANSWER TWO DIFFERENT QUESTIONS. Neither is the visible
 * one.
 *
 *   - `DOCUMENT_EXCERPT_SOURCE_CHARS` is how much of the body the STORE is
 *     asked for. It exists so that reading a Space of two hundred notes does
 *     not move two hundred whole bodies through memory to render a list.
 *   - `DOCUMENT_EXCERPT_MAX_CHARS` is how much of that survives into the
 *     projection. It exists so the answer that crosses the process boundary is
 *     bounded no matter how the store cut.
 *   - THE VISIBLE CUT IS NEITHER, and that is deliberate: the row clamps to two
 *     lines in CSS, so what a reader actually sees depends on their column
 *     width and their text size. Trimming to a character count here AND
 *     clamping there would be one decision written in two places, and the two
 *     would disagree the first time somebody read the app at 200% text.
 *
 * Which is also why nothing here appends an ellipsis. The CSS clamp adds its
 * own when it overflows; a second one baked into the string would show up as
 * "…" mid-row on a wide column where nothing was actually cut.
 *
 * AND WHY THE TITLE IS AN ARGUMENT. A body's first block is very often the
 * note's own name written a second time — that is what an Obsidian import
 * produces by construction, because it takes the title from the FILE NAME
 * (`obsidian-import.ts`, `titleOf`) and keeps the `# Title` line as a heading
 * node (`markdown-import.ts`). The plain text this reads is flat, so a heading
 * is indistinguishable from a paragraph in it, and the two run together into
 * one sentence the moment whitespace collapses. A row that then opens by
 * repeating the line directly above it spends its whole visible clamp saying
 * what the reader already read — the reference never does this (every excerpt
 * in `v3/data.js:557-576` is body prose), and the contract this entry wrote
 * says the row must say what the note is ABOUT, not what it is called. The
 * title is therefore not decoration here: it is the only thing that makes the
 * echo recognisable.
 */

/**
 * How much of the body the store is asked to return per note.
 *
 * Wider than `DOCUMENT_EXCERPT_MAX_CHARS` on purpose: the prefix arrives raw,
 * so collapsing its whitespace can shorten it, and the word boundary below can
 * only step BACKWARDS. Asking for exactly the maximum would make a body whose
 * first line is heavily wrapped come back visibly shorter than one that is not,
 * for no reason a reader could see.
 */
export const DOCUMENT_EXCERPT_SOURCE_CHARS = 600;

/**
 * How much of the excerpt reaches the projection.
 *
 * Chosen against the reference rather than invented: its own excerpts run
 * roughly 90 to 110 characters (`v3/data.js:557-576`), which is about two lines
 * of the column it draws. Twice that leaves the CSS clamp something to clamp
 * when the column is wide or the text is small, and keeps the answer bounded
 * when it is not.
 */
export const DOCUMENT_EXCERPT_MAX_CHARS = 220;

/**
 * Case-folded, whitespace-collapsed, for comparing one line against another.
 *
 * `toLowerCase`, NOT `toLocaleLowerCase`, and this repository already wrote the
 * rule down one file over (`commercial-defaults.ts`, on `taskStatus.rename`):
 * a locale-dependent fold takes the HOST's locale, so two machines would
 * compute different excerpts from the same note — the Turkish dotless ı is the
 * standard way that goes wrong — and no test on one machine can see it.
 */
const sameWords = (text: string): string =>
  text.replace(/\s+/gu, " ").trim().toLowerCase();

/**
 * THE BODY WITHOUT ITS OPENING ECHO OF THE TITLE.
 *
 * The test is deliberately ASYMMETRIC, and the asymmetry is the whole safety
 * of it: the first line goes only when it says NOTHING THE TITLE DOES NOT
 * ALREADY SAY — it is contained in the title AND no longer than it. A first
 * paragraph that merely mentions the note's name is longer than the name and
 * survives, which is the case that matters: a note called „EPS" whose text
 * opens „EPS liczony z próbki tygodniowej zaniża…" must keep its opening. The
 * symmetric rule („either contains the other") would eat exactly that.
 *
 * ONE LINE, NEVER MORE, and never the last one. A second heading under the
 * first is a section name and belongs to the text; a body that is nothing but
 * its own title keeps it, because „no excerpt" and „an excerpt that repeats
 * the title" are both wrong and the second is at least true.
 */
const withoutTitleEcho = (body: string, title: string): string => {
  const breakAt = body.indexOf("\n");
  if (breakAt === -1) return body;
  const opening = sameWords(body.slice(0, breakAt));
  const named = sameWords(title);
  if (opening === "" || named === "") return body;
  if (opening.length > named.length || !named.includes(opening)) return body;
  const rest = body.slice(breakAt + 1);
  return sameWords(rest) === "" ? body : rest;
};

/**
 * The opening of a note body, or `undefined` when there is nothing to open
 * with.
 *
 * The `title` is what the row already shows one line above, and it is here so
 * the excerpt does not repeat it — see the note at the top of this file for
 * why that is a production state rather than a fixture accident.
 *
 * ABSENT IS NOT EMPTY. A note whose body has never been written has no row in
 * the search projection at all, and a note whose body is whitespace has one
 * that says nothing; both must reach the reader as "no excerpt", because the
 * alternative is an empty band under a title, which reads as "this note is
 * blank" — a claim about the note that the screen has not earned. The same
 * distinction `structureReadable` draws one file over in the Notes screen.
 *
 * The cut steps back to a word boundary when there is one to step back to, and
 * takes the hard cut when there is not: a single unbroken 300-character token
 * is not a reason to return nothing.
 */
export const documentExcerpt = (
  body: string,
  title: string,
): string | undefined => {
  // ONE LINE, because the row is one paragraph's worth of space and the body
  // arrives with its block structure still in it. Newlines in a `-webkit-box`
  // clamp spend a whole line on a heading and leave one for the text.
  //
  // THE ECHO GOES FIRST, WHILE THE LINES ARE STILL LINES. After this collapse
  // a heading and the paragraph under it are one string with a space in the
  // middle and nothing to tell them apart.
  const flattened = withoutTitleEcho(body, title).replace(/\s+/gu, " ").trim();
  if (flattened === "") return undefined;
  if (flattened.length <= DOCUMENT_EXCERPT_MAX_CHARS) return flattened;
  const cut = flattened.slice(0, DOCUMENT_EXCERPT_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  // The floor keeps the word boundary from eating the excerpt when the opening
  // is one long token: better a word cut in half than a row that says nothing.
  return lastSpace >= DOCUMENT_EXCERPT_MAX_CHARS / 2
    ? cut.slice(0, lastSpace)
    : cut;
};
