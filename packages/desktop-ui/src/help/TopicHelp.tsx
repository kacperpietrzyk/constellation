import { useState } from "react";

import { InlinePopover } from "../components/InlinePopover.js";
import styles from "./topic-help.module.css";
import { helpTopic, type HelpTopicId } from "./help-topics.js";

/* THE `?` AT THE THING (#35), FOR EVERY SCREEN.
 *
 * Built on the shell's own `InlinePopover`, which already is the contract this
 * lot has to meet: a real `<button type="button" aria-haspopup="dialog">`, a
 * portaled `role="dialog"` with a name, Escape, click-outside and focus
 * returned to the trigger. Nothing here re-implements any of it, and nothing
 * here is ever a `title=` — an explanation in a `title` does not exist for a
 * keyboard, for touch, or for a screen reader that is not hovering.
 *
 * The wrapper carries `data-help-topic` rather than the button, because
 * `InlinePopover` owns the button's attributes. It is what the route assertion
 * counts: the set of topics anchored on a screen, compared BOTH ways against
 * what that screen is supposed to carry.
 *
 * LOT L7 FAZY II — POMOC JEST PLAKIETKĄ PRZY RZECZY, NIE PODKREŚLONYM LINKIEM
 * PROZĄ. Do tego lotu ten wyzwalacz rysował CAŁE PYTANIE („What do these three
 * states mean?") z kropkowanym podkreśleniem, i było to DRUGĄ formą tej samej
 * afordancji w produkcie: okrągły znacznik `.help-mark` stał na Dzisiaj i na
 * Kalendarzu, a ten komponent w dziesięciu miejscach na siedmiu ekranach.
 *
 * Prototyp ma DOKŁADNIE JEDNĄ formę i stawia ją jedenaście razy przez jedną
 * funkcję: `v3/app.js:2001-2005` (`helpBtn`) rysuje `<button class="helpb"
 * aria-label="What this means: ${title}">?</button>`, a `v3/app.css:896-903`
 * daje tej klasie 1,125 rem, `--radius-full` i `--text-2xs`. Komentarz nad tą
 * regułą (`v3/app.css:893-895`) mówi, po co: „Wielkość znaku ma być mniejsza
 * niż etykieta, przy której stoi — to jest dopisek, nie kontrolka do klikania
 * na co dzień."
 *
 * Kontrakt: `.ui-craft/patterns.md` — „Pattern: On-demand help mark" oraz
 * `.ui-craft/surfaces/contextual-concept-help.md` — „Visual contract". Obie
 * strony mówią tu jedno; to APLIKACJA miała dwie formy, nie dokumenty.
 *
 * REGUŁA JEST JEDNA I MIESZKA W `styles.css` (`.help-mark`), a nie w tym
 * module. Gdyby ten arkusz przepisał tę samą formę u siebie, produkt miałby
 * znowu dwa kształty pod jednym zdaniem — ten sam dług, który ten lot spłaca.
 * Moduł zostawia sobie WYŁĄCZNIE to, czego globalna reguła nie może wiedzieć:
 * wyciszenie szewrona rozwinięcia, który niesie `.inline-popover-trigger`.
 */
export const TopicHelp = ({ topic: id }: { readonly topic: HelpTopicId }) => {
  const [open, setOpen] = useState(false);
  const topic = helpTopic(id);
  // Unreachable through the type, and still not a crash if it ever is: the
  // route assertion fails on the missing anchor instead of the screen going.
  if (topic === undefined) return null;

  return (
    <span className={styles.help} data-help-topic={id}>
      <InlinePopover
        label="?"
        onOpenChange={setOpen}
        open={open}
        panelLabel={topic.question}
        /* Brzmienie prototypu, co do słowa (`v3/app.js:2004`). Nie samo
           pytanie: znak „?" jest dopiskiem przy rzeczy, a nazwa mówi, PRZY
           JAKIEJ — czego pytanie oderwane od etykiety nie mówi. */
        triggerAriaLabel={`What this means: ${topic.term}`}
        triggerClassName={`help-mark ${styles.trigger ?? ""}`}
      >
        <div className={styles.panel}>
          <h3 className={styles.term}>{topic.term}</h3>
          <p data-help-answer={topic.id}>{topic.answer}</p>
          {/* A control the panel can be left by, and the element
              `InlinePopover` moves the focus to on open. */}
          <button
            className={styles.close}
            onClick={() => setOpen(false)}
            type="button"
          >
            Close
          </button>
        </div>
      </InlinePopover>
    </span>
  );
};
