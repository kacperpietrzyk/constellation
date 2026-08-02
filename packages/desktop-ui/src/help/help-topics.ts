/* HELP ON DEMAND (#35) — THE 180-CHARACTER TOPICS, FOR EVERY SCREEN.
 *
 * A topic hangs on ONE thing a reader can point at, and it is the SECOND
 * resort: every anchor below already says what it is in visible text, and the
 * topic answers the question that text raises rather than repeating it.
 *
 * THE SHAPE, and why it is not the shape `conceptHelpTopics` has. The concept
 * dialog splits a topic into `explanation` + `boundary`, each with a ≥80
 * character floor and no ceiling — about 215-280 characters as the reader sees
 * them. #35 caps a topic at 180 characters, so the two shapes cannot share an
 * array. Topics here are therefore ONE paragraph of at most 180 characters,
 * asserted in `test/concept-help.test.ts` under a name that says whose cap it
 * is. The six shipped concept topics are knowingly left alone: retrofitting
 * them is real work and it is not this wave's.
 *
 * THIS ARRAY WAS CALLED `helpTopics` AND LIVED IN `src/crm/`, and the name
 * was renamed rather than copied the moment a second family of screens needed
 * it. A second array with the same contract is the restated-shape defect this
 * repo has already met in three waves; keeping the CRM name over a Meetings
 * topic would instead have made the cap assertion's own name — "the six
 * shipped concept topics are out of scope" — say CRM about something that is
 * not CRM, and an assertion whose name lies is the other failure this wave
 * keeps finding.
 *
 * The `question` is the trigger's own visible label, so the button always has
 * an accessible name and the name always matches the panel it opens.
 */

export type HelpTopicId =
  | "price-basis"
  | "stage-sums"
  | "unconfigured-stage"
  | "relationship-reading"
  | "lead-time"
  | "amendment"
  | "attached-notes"
  | "sources"
  | "source-availability";

export type HelpTopic = {
  readonly id: HelpTopicId;
  /** What the topic is called, above the answer. */
  readonly term: string;
  /** The trigger's label. A question, because that is what a reader has. */
  readonly question: string;
  /** ONE paragraph, at most 180 characters. A topic that grows is a lecture. */
  readonly answer: string;
};

export const helpTopics: readonly HelpTopic[] = [
  {
    id: "price-basis",
    term: "Derived and confirmed prices",
    question: "Why two prices?",
    answer:
      "A deal is worth the price confirmed on its offer. With none confirmed, the board derives one from the cost and the configured markup and says so.",
  },
  {
    id: "stage-sums",
    term: "Sums per currency",
    question: "Why per currency?",
    answer:
      "A stage adds up amounts standing in the same currency. One converted total would move with the rate on the day it was read rather than with the deals.",
  },
  {
    id: "unconfigured-stage",
    term: "Unconfigured stage",
    question: "What is not configured?",
    answer:
      "A deal can stand on a stage Settings no longer lists. Its column stays on the board, last, because hiding the column would hide the deal and not the stage.",
  },
  {
    id: "relationship-reading",
    term: "The reading",
    question: "How is the reading worked out?",
    answer:
      "The reading is computed from what this client already has here: open deals, contracts, delivery and silence. It is never typed in and changes when they do.",
  },
  {
    id: "lead-time",
    term: "Lead time",
    question: "What is a lead time?",
    answer:
      "A lead time is the notice a contract needs before it expires. The screen is organised by the day that notice opens, because that is when the work starts.",
  },
  {
    // #32. The one thing the row cannot say for itself: what Detach costs.
    // A reader who thinks it edits the agent's note will not press it.
    id: "attached-notes",
    term: "Attached notes",
    question: "What does Detach do?",
    answer:
      "A note is here because it names this meeting. Detach takes it off this meeting only: the note keeps its own text, and every other place it appears is untouched.",
  },
  {
    id: "amendment",
    term: "Amendment",
    question: "What does this create?",
    answer:
      "An amendment opens a deal for extra work sold on this contract. The contract keeps its own term: nothing here moves the dates the renewal is measured against.",
  },
  {
    // Decision #21 cut this exact explanation as a lecture standing above the
    // source list. #35's rule is that a `?` goes EXACTLY where a cut lecture
    // used to stand — the separation between what you collected and what you
    // wrote is the whole reason the two readings are apart, and a reader who
    // has not been told it will use Sources as a drawer.
    id: "sources",
    term: "Sources",
    question: "What is a source?",
    answer:
      "A source is what you found; a note is what you made of it. A source carries where it came from, and whether it can still be reached.",
  },
  {
    // THE REASON A STATE MEANS WHAT IT MEANS USED TO LIVE IN A `title=`, which
    // #35 forbids as the sole carrier: a tooltip does not exist for a keyboard,
    // for touch, or for anybody not hovering. The three labels are on the
    // screen in words; this answers what they cost, which the labels cannot.
    id: "source-availability",
    term: "Availability",
    question: "What do these three states mean?",
    answer:
      "Available means a copy is kept here. Reference only means the address is held, not the content. Unavailable means the address no longer answers.",
  },
];

export const helpTopic = (id: HelpTopicId): HelpTopic | undefined =>
  helpTopics.find((topic) => topic.id === id);
