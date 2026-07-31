import { useState } from "react";

import { InlinePopover } from "../components/InlinePopover.js";
import styles from "./crm-help.module.css";
import { crmHelpTopic, type CrmHelpTopicId } from "./help-topics.js";

/* THE `?` AT THE THING (#35).
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
 */
export const CrmHelp = ({ topic: id }: { readonly topic: CrmHelpTopicId }) => {
  const [open, setOpen] = useState(false);
  const topic = crmHelpTopic(id);
  // Unreachable through the type, and still not a crash if it ever is: the
  // route assertion fails on the missing anchor instead of the screen going.
  if (topic === undefined) return null;

  return (
    <span className={styles.help} data-help-topic={id}>
      <InlinePopover
        label={topic.question}
        onOpenChange={setOpen}
        open={open}
        panelLabel={topic.question}
        triggerClassName={styles.trigger ?? ""}
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
