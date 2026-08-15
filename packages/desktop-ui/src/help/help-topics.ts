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
 * WHERE THE `question` GOES, SINCE LOT L7 OF PHASE II — and this paragraph is
 * a CORRECTION, not an addition. It used to read "the `question` is the
 * trigger's own visible label, so the button always has an accessible name and
 * the name always matches the panel it opens", and that lot inverted every
 * clause of it while leaving the sentence standing. A contract in the source
 * that states the opposite of the code outlives everybody who remembers why it
 * was written, so it is rewritten here rather than annotated.
 *
 * What is true now: the trigger's VISIBLE label is the one character `?`
 * (`TopicHelp.tsx`), because the reference draws this affordance as a round
 * mark smaller than the label it stands beside and never as a sentence in
 * prose (`v3/app.css:896-903`, one class, eleven calls). The `question` is the
 * PANEL's name (`panelLabel={topic.question}`), and the trigger's accessible
 * name is DECLARED, not derived — `triggerAriaLabel` in the reference's own
 * wording, "What this means: <term>". The guarantee therefore survives with a
 * different mechanism behind it: the button still always has a name, and that
 * name still names the thing the panel is about. It is asserted, both halves,
 * in `test/topic-help.interaction.test.tsx` — the `aria-label` must be there
 * and must not be the glyph.
 */

/* THE SHAPE OF AN ENTRY. It does NOT name the ids: the ids are the array, and
 * the union below is read off it.
 *
 * WHAT THIS REPLACED, and why it was a defect rather than a style: `HelpTopicId`
 * was a hand-written union of ten strings STANDING BESIDE this array. An id
 * added to the union alone compiled, `TopicHelp` returned `null` for it — the
 * `?` simply did not draw — and the cap assertion stayed green, because it
 * iterates the ARRAY. Two of this repository's named defect families in one
 * declaration: a hand-written list beside a closed vocabulary, and a capability
 * nothing mounts. Derived the way `settings-categories.ts` derives
 * `SettingsCategoryId`, an eleventh topic cannot be referred to before it
 * exists, and an eleventh entry needs no second edit.
 *
 * THE ARRAY IS THE AUTHORITY, checked rather than assumed: nothing computes
 * `helpTopics` from anywhere else, so this is a guard over the source and not
 * over a restatement of it. */
type HelpTopicShape = {
  readonly id: string;
  /** What the topic is called, above the answer. */
  readonly term: string;
  /** The PANEL's name, and a question, because that is what a reader has.
   *  It was the trigger's visible label until lot L7 of phase II turned the
   *  trigger into the one-character mark; the label a reader hears now is
   *  `What this means: <term>`, declared on the button itself. */
  readonly question: string;
  /** ONE paragraph, at most 180 characters. A topic that grows is a lecture. */
  readonly answer: string;
};

export const helpTopics = [
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
    // #30. The one thing the switcher cannot say for itself: it never changes
    // WHICH notes are listed, and under Record a note is read more than once.
    // A reader who thinks Record filters will trust a shorter list than they
    // have, and one who counts the headings will not trust the total.
    id: "note-arrangement",
    term: "Arranging notes",
    question: "What does this reorder?",
    answer:
      "It regroups the same notes; the folder you picked is the only filter. Under Record a note appears once per record it names, so the groups add up to more than the list.",
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

  /* SZEŚĆ TEMATÓW DOPISANYCH PRZEZ LOT L7 FAZY II, I ICH TREŚĆ JEST WZIĘTA
   * Z PROTOTYPU, A NIE NAPISANA TUTAJ.
   *
   * Lot przebiera wyzwalacz pomocy w jedną formę, a `patterns.md` mówi wprost,
   * że „a lot restyling the trigger has no licence to grow the topic". Cztery
   * wpisy dokumentu przejścia (1-6, 3-6, 10-4, 11-8) i jeden wpis planu (5-4)
   * to jednak nie forma, tylko BRAK: prototyp stawia tam plakietkę, a aplikacja
   * nie ma w tym miejscu żadnej. Plakietka bez tematu jest ozdobą, więc temat
   * musi powstać — i powstaje przez PRZEPISANIE mapy `HELP` prototypu
   * (`v3/app.js:1975-2000`), a nie przez wymyślenie własnych zdań. Adres
   * każdego zdania stoi przy nim.
   *
   * `term` jest tu rzeczownikiem, a nie tytułem prototypu, i to jest jedyne
   * miejsce, w którym te wpisy odchodzą od tamtej strony. Powód jest po naszej
   * stronie: `term` rysuje się jako nagłówek panelu (`TopicHelp.tsx`), a każdy
   * z dziesięciu tematów, które tu już stały, jest rzeczownikiem. Tytuł
   * prototypu bywa całym zdaniem („How the free time is worked out"), więc
   * przepisany dosłownie dałby panel mówiący nagłówkiem to, co mówi pytanie.
   *
   * SPOTKANIA (wpis 10-4) NIE MAJĄ TU WPISU I TO JEST WYBÓR: prototypowy
   * `helpBtn("outlook")` na sekcji spotkań pyta o dokładnie tę rzecz, którą
   * w tej aplikacji tłumaczy temat pojęciowy `calendar-meetings` — ten sam,
   * który niosą znaczniki na Dzisiaj i na Kalendarzu. Jedenasty temat obok
   * istniejącego byłby drugą listą przy zamkniętym słowniku.
   */

  {
    // `v3/screens/today.js:99` — `helpBtn("capacity")` stoi PRZY wierszu
    // wolnego czasu. Zdanie: `v3/app.js:1978-1979`.
    id: "capacity",
    term: "Free time",
    question: "How is the free time worked out?",
    answer:
      "Your working day minus the meetings in it, minus the time already blocked for work. The length of the day is yours to set, in Settings.",
  },
  {
    // `v3/screens/today.js:149` — przy głowie sekcji terminów.
    // Zdanie: `v3/app.js:1980-1981`.
    id: "unplanned",
    term: "Unplanned deadlines",
    question: "What is listed here?",
    answer:
      "A deadline is meant to warn you before it lands. Listed here is work with a date coming up that nothing has been scheduled against.",
  },
  {
    // `v3/screens/inbox.js:292` — przy pierwszej głowie Skrzynki.
    // Zdanie: `v3/app.js:1982-1983`.
    id: "inbox-work",
    term: "Signals about work",
    question: "What lands here?",
    answer:
      "Each one names a record and leads to it. A comment on your records never lands here; a mention does.",
  },
  {
    // `v3/screens/inbox.js:301` — przy drugiej głowie Skrzynki.
    // Zdanie: `v3/app.js:1984-1985`.
    id: "inbox-plumbing",
    term: "Captures that did not land",
    question: "Why is this separate?",
    answer:
      "Plumbing, not thinking. Something arrived and could not be filed — deciding is a moment, and none of it is work you planned.",
  },
  {
    // `v3/screens/knowledge.js:807` — w głowie kolumny folderów.
    // Zdanie: `v3/app.js:1996-1997`.
    id: "folders",
    term: "Folders and references",
    question: "What is a folder?",
    answer:
      "A folder says where a note lives, and it lives in exactly one. A reference says what a note is about, and there can be any number of those.",
  },
  {
    // `v3/screens/projects.js:231` — `helpBtn("health")` PRZY etykietą grupy
    // sygnału. Zdanie: `v3/app.js:1994-1995`.
    //
    // TEN TEMAT ZASTĘPUJE KONTROLKĘ, KTÓRA NIE ROBIŁA NIC. Do tego lotu
    // `ProjectListLayout.tsx` rysowała własny okrągły „?" bez `onClick`, bez
    // `data-help-topic` i bez `aria-haspopup` — czyli afordancję, która nie
    // otwierała niczego i której najostrzejsza bramka pomocy w tym repozytorium
    // NIE WIDZIAŁA, bo chodzi po `[data-help-topic]`. Kontrakt trasy Projektów
    // asertował „ten ekran nie niesie pomocy" i był zielony nad żywym „?".
    id: "project-health",
    term: "Project health",
    question: "How is health worked out?",
    answer:
      "Counted from the tasks under the project: what is overdue, what is blocked, what has waited past its date, and how long nothing has moved. Never typed in.",
  },
] as const satisfies readonly HelpTopicShape[];

export type HelpTopic = (typeof helpTopics)[number];

export type HelpTopicId = HelpTopic["id"];

export const helpTopic = (id: HelpTopicId): HelpTopic | undefined =>
  helpTopics.find((topic) => topic.id === id);
