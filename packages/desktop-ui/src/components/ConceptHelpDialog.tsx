import { useEffect, useRef, useState } from "react";

export type ConceptHelpTopicId =
  "data-home" | "hub" | "mcp" | "agent-access" | "recovery";

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
    question: "Gdzie są dane tego workspace?",
    explanation:
      "Data Home to wybrane miejsce przechowywania danych jednego workspace. Może działać tylko na tym urządzeniu albo koordynować pracę kilku urządzeń.",
    boundary:
      "Zmiana miejsca danych nigdy nie odbywa się po cichu. Constellation pokazuje zakres i wymaga jawnej operacji.",
  },
  {
    id: "hub",
    term: "Hub",
    question: "Jak urządzenia pozostają aktualne?",
    explanation:
      "Hub to usługa wybrana i kontrolowana przez Ciebie. Koordynuje zmiany między urządzeniami, gdy Data Home nie jest tylko lokalny.",
    boundary:
      "Hub nie synchronizuje otwartego pliku bazy przez zwykły folder chmurowy. Bez połączenia nadal możesz pracować na lokalnej, zaszyfrowanej kopii.",
  },
  {
    id: "mcp",
    term: "MCP",
    question: "Jak zewnętrzny agent pracuje w Constellation?",
    explanation:
      "Model Context Protocol (MCP) to interfejs dla zewnętrznych agentów. Agent korzysta z tych samych wyszukiwań i działań co aplikacja.",
    boundary:
      "Constellation nie uruchamia modelu ani czatu. Host agenta odpowiada za model, a każda operacja pozostawia przypisany ślad audytowy.",
  },
  {
    id: "agent-access",
    term: "Dostęp agenta",
    question: "Co wolno agentowi?",
    explanation:
      "Profil dostępu określa dozwolone działania, widoczne Space i czas ważności. W dokumentacji technicznej taki profil bywa nazywany grantem.",
    boundary:
      "Pełny dostęp usuwa dodatkowe pytania tylko w przyznanym zakresie. Nie omija granic workspace, uprawnień systemu, wersji ani audytu.",
  },
  {
    id: "recovery",
    term: "Odzyskiwanie",
    question: "Jak wrócić do pracy po awarii?",
    explanation:
      "Odzyskiwanie przywraca workspace z zaszyfrowanego backupu przy użyciu osobnego kodu. Przed zmianą Constellation sprawdza plik i pokazuje zakres.",
    boundary:
      "Bieżące dane nie są zastępowane bez potwierdzenia. Przerwaną operację można bezpiecznie rozpoznać i wznowić po restarcie.",
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
            <p className="eyebrow">Pojęcia</p>
            <h2 id="concept-help-title">Jak działają dane i dostęp</h2>
            <p id="concept-help-intro">
              Wybierz pojęcie. Odpowiedź opisuje skutek dla Twojej pracy, nie
              architekturę systemu.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Zamknij pomoc pojęciową"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="concept-help-layout">
          <nav aria-label="Pojęcia danych i dostępu">
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
              <strong>Najważniejsza granica</strong>
              <span>{activeTopic.boundary}</span>
            </aside>
          </article>
        </div>

        <footer>
          <button type="button" onClick={onClose}>
            Zamknij pomoc
          </button>
        </footer>
      </section>
    </dialog>
  );
};
