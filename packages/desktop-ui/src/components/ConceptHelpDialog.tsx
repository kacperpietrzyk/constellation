import { useEffect, useRef, useState } from "react";

export type ConceptHelpTopicId =
  | "data-home"
  | "hub"
  | "mcp"
  | "agent-access"
  | "recovery"
  | "calendar-meetings";

export type ConceptHelpTopic = {
  readonly id: ConceptHelpTopicId;
  readonly term: string;
  readonly question: string;
  readonly explanation: string;
  readonly boundary: string;
};

export const conceptHelpTopics: readonly ConceptHelpTopic[] = [
  {
    id: "data-home",
    term: "Data Home",
    question: "Where does this workspace keep its data?",
    explanation:
      "Data Home is the chosen storage location for one workspace. It can stay on this device alone, or coordinate the work of several devices.",
    boundary:
      "Moving the data is never silent. Constellation shows the scope and asks for an explicit operation.",
  },
  {
    id: "hub",
    term: "Hub",
    question: "How do devices stay up to date?",
    explanation:
      "The Hub is a service you choose and control. It coordinates changes between devices when Data Home is not local only.",
    boundary:
      "The Hub does not sync an open database file through a plain cloud folder. With no connection you still work on a local encrypted copy.",
  },
  {
    id: "mcp",
    term: "MCP",
    question: "How does an outside agent work in Constellation?",
    explanation:
      "Model Context Protocol (MCP) is the interface for outside agents. An agent uses the same searches and actions as the app.",
    boundary:
      "Constellation runs no model and no chat. The agent host owns the model, and every operation leaves an attributed audit trail.",
  },
  {
    id: "agent-access",
    term: "Agent access",
    question: "What is an agent allowed to do?",
    explanation:
      "An access profile sets the allowed actions, the visible Spaces and how long it lasts. Technical documentation calls such a profile a grant.",
    boundary:
      "Full access drops extra prompts only inside the granted scope. It does not bypass workspace bounds, system permissions, versions or the audit.",
  },
  {
    id: "calendar-meetings",
    term: "Meetings",
    question: "Why can't I move a meeting here?",
    explanation:
      "Meetings belong to the calendar they came from. Constellation reads them so the day shows its real shape, and moves only the time it reserved itself.",
    boundary:
      "Rescheduling a meeting notifies the people in it, so that stays with the calendar app that owns the invitation.",
  },
  {
    id: "recovery",
    term: "Recovery",
    question: "How do you get back to work after a failure?",
    explanation:
      "Recovery restores a workspace from an encrypted backup using a separate code. Constellation checks the file and shows the scope first.",
    boundary:
      "Current data is never replaced without a confirmation. An interrupted operation can be recognized and safely resumed after a restart.",
  },
];

export const ConceptHelpDialog = ({
  initialTopic,
  onClose,
}: {
  readonly initialTopic: ConceptHelpTopicId;
  readonly onClose: () => void;
}) => {
  const [activeTopicId, setActiveTopicId] = useState(initialTopic);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeButtonRef = useRef<HTMLButtonElement>(null);
  const activeTopic =
    conceptHelpTopics.find((topic) => topic.id === activeTopicId) ??
    conceptHelpTopics[0]!;

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnTarget =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    dialog?.showModal();
    activeButtonRef.current?.focus();
    return () => {
      dialog?.close();
      returnTarget?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="concept-help-backdrop"
      aria-labelledby="concept-help-title"
      aria-describedby="concept-help-intro"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="concept-help-dialog">
        <header>
          <div>
            <p className="eyebrow">Concepts</p>
            <h2 id="concept-help-title">How data and access work</h2>
            <p id="concept-help-intro">
              Pick a concept. Each answer describes the effect on your work.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close concept help"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="concept-help-layout">
          <nav aria-label="Data and access concepts">
            <ol>
              {conceptHelpTopics.map((topic) => (
                <li key={topic.id}>
                  <button
                    ref={topic.id === activeTopicId ? activeButtonRef : null}
                    type="button"
                    aria-current={
                      topic.id === activeTopicId ? "true" : undefined
                    }
                    aria-controls="concept-help-topic"
                    onClick={() => setActiveTopicId(topic.id)}
                  >
                    <span>{topic.term}</span>
                    <small>{topic.question}</small>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <article id="concept-help-topic" aria-live="polite">
            <p>{activeTopic.question}</p>
            <h3>{activeTopic.term}</h3>
            <p>{activeTopic.explanation}</p>
            <aside>
              <strong>Where this ends</strong>
              <span>{activeTopic.boundary}</span>
            </aside>
          </article>
        </div>

        <footer>
          <button type="button" onClick={onClose}>
            Close help
          </button>
        </footer>
      </section>
    </dialog>
  );
};
