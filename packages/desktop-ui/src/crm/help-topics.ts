/* HELP ON DEMAND FOR THE CRM SCREENS (#35).
 *
 * A topic hangs on ONE thing a reader can point at, and it is the SECOND
 * resort: every anchor below already says what it is in visible text, and the
 * topic answers the question that text raises rather than repeating it.
 *
 * THE SHAPE, and why it is not the shape `conceptHelpTopics` has. The concept
 * dialog splits a topic into `explanation` + `boundary`, each with a ≥80
 * character floor and no ceiling — about 215-280 characters as the reader sees
 * them. #35 caps a topic at 180 characters, so the two shapes cannot share an
 * array. New CRM topics are therefore ONE paragraph of at most 180 characters,
 * asserted in `test/concept-help.test.ts` under a name that says whose cap it
 * is. The six shipped concept topics are knowingly left alone: retrofitting
 * them is real work and it is not this lot's.
 *
 * The `question` is the trigger's own visible label, so the button always has
 * an accessible name and the name always matches the panel it opens.
 */

export type CrmHelpTopicId =
  | "price-basis"
  | "stage-sums"
  | "unconfigured-stage"
  | "relationship-reading"
  | "lead-time"
  | "amendment";

export type CrmHelpTopic = {
  readonly id: CrmHelpTopicId;
  /** What the topic is called, above the answer. */
  readonly term: string;
  /** The trigger's label. A question, because that is what a reader has. */
  readonly question: string;
  /** ONE paragraph, at most 180 characters. A topic that grows is a lecture. */
  readonly answer: string;
};

export const crmHelpTopics: readonly CrmHelpTopic[] = [
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
    id: "amendment",
    term: "Amendment",
    question: "What does this create?",
    answer:
      "An amendment opens a deal for extra work sold on this contract. The contract keeps its own term: nothing here moves the dates the renewal is measured against.",
  },
];

export const crmHelpTopic = (id: CrmHelpTopicId): CrmHelpTopic | undefined =>
  crmHelpTopics.find((topic) => topic.id === id);
