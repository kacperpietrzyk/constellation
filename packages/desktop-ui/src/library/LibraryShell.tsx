import { useEffect, useState } from "react";

import type { DocumentId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import type { LibraryReading } from "../client/shell-navigation.js";
import type { DesktopSnapshot, MutationFailure } from "../client/workflow.js";
import type { DocumentEntityTargetKind } from "../document-entity-reference.js";
import {
  CaptureHistoryReading,
  type CaptureHistoryWiring,
} from "./CaptureHistoryReading.js";
import styles from "./library.module.css";
import {
  libraryReadingLabel,
  libraryReadingOrder,
} from "./library-readings.js";
import { NotesReading } from "./NotesReading.js";
import { SourcesReading } from "./SourcesReading.js";

// JEDEN cel nawigacji, trzy odczyty. Powłoka trzyma nagłówek celu, przełącznik
// i pole odczytu; sam odczyt nie wie o pozostałych dwóch. Dzięki temu ekrany
// Notatek i Źródeł z dalszych lotów dopisują się każdy do SWOJEGO pliku, a nie
// do wspólnego, tysiąclinijkowego ekranu — trzy loty edytujące jeden plik to
// przeciwieństwo rozłącznych plików.
//
// Przełącznik mapuje po `libraryReadings`, a nie po ręcznie wypisanych trzech
// przyciskach: dopisanie odczytu do słownika bez przycisku (albo odwrotnie)
// jest wtedy niemożliwe, a nie ciche.

export type LibraryInspectorKind = LibraryReading;

export const LibraryShell = ({
  client,
  snapshot,
  activeDocumentId,
  activeReading,
  inspectorHost,
  onInspectorOpen,
  onEntityActivate,
  onReload,
  onFailure,
  captureHistory,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly activeDocumentId?: DocumentId | undefined;
  readonly activeReading?: LibraryReading | undefined;
  readonly inspectorHost: HTMLElement | null;
  readonly onInspectorOpen: (kind: LibraryInspectorKind) => void;
  readonly onEntityActivate: (target: {
    readonly targetKind: DocumentEntityTargetKind;
    readonly targetId: string;
  }) => void;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
  readonly captureHistory: CaptureHistoryWiring;
}) => {
  const [reading, setReading] = useState<LibraryReading>(
    activeReading ?? "notes",
  );
  // Kontekst powłoki niesie żądany odczyt, więc wrzutka głosowa i wrzutka
  // otwarta z Inboxa lądują na rejestrze, a nie na Notatkach. Bez tego efektu
  // przepięcie tamtych dwóch wywołań z wycofanego `history` na `library`
  // kompiluje się, przechodzi testy i po cichu wysyła człowieka nie tam.
  useEffect(() => {
    if (activeReading !== undefined) setReading(activeReading);
  }, [activeReading]);

  const documentCount =
    snapshot.documents.kind === "ready"
      ? snapshot.documents.data.items.length
      : 0;
  const sourceCount =
    snapshot.knowledge.kind === "ready"
      ? snapshot.knowledge.data.sources.length
      : 0;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">Sources and deliverables</p>
          <h1 id="surface-title" tabIndex={-1}>
            Library
          </h1>
        </div>
        <span className={`library-count ${styles.count}`}>
          {documentCount + sourceCount}
        </span>
      </header>

      <div className={styles.viewbar}>
        <div
          aria-label="Library reading"
          className={styles.switcher}
          role="tablist"
        >
          {libraryReadingOrder.map((id) => (
            <button
              aria-selected={reading === id}
              className={styles.switch}
              // Ten sam znacznik, co przełącznik układów Zadań
              // (`TasksSurface.tsx`) i Projektów (`ProjectCollection.tsx`), i on
              // jest tym, po czym bramka układu wylicza obiektywy do zmierzenia.
              // Bez niego przelot mierzył WYŁĄCZNIE odczyt Notatek, a Źródła
              // i Historia przechwyceń były raportowane jako „0 wierszy" —
              // przy pełnych listach po drugiej stronie kliknięcia. Deklaracja
              // stoi tutaj, a nie w selektorze bramki rozszerzonym o
              // `[role="tab"]`, bo tamten łapie też pasek zakładek rekordu.
              data-layout={id}
              key={id}
              onClick={() => setReading(id)}
              role="tab"
              type="button"
            >
              {libraryReadingLabel[id]}
            </button>
          ))}
        </div>
      </div>

      {/* `data-height-bound` JEST DEKLARACJĄ, nie hakiem testowym, i mówi
          dokładnie jedno: ten ekran obiecuje zmieścić się w panelu, a
          przewijanie ma się dziać W ŚRODKU. Do dziś nie mieścił się — czytelnia
          miała 4140 px w oknie 735 px i cały trzypanelowy odczyt przewijał się
          jako strona. Atrybut siedzi na PUDEŁKU CZYTELNI, bo to jego wysokość
          jest tu obietnicą; korzeń ekranu i panel bramka bierze strukturalnie,
          jako rodzica i dziadka. Bramka układu wylicza z niego swoje podmioty
          (`scripts/renderer-declarations.mjs`), więc drugi ekran związany
          wysokością jest objęty w dniu, w którym się deklaruje. */}
      <div className={styles.reading} data-height-bound="library">
        {reading === "notes" ? (
          <NotesReading
            client={client}
            snapshot={snapshot}
            activeDocumentId={activeDocumentId}
            inspectorHost={inspectorHost}
            onInspectorOpen={() => onInspectorOpen("notes")}
            onEntityActivate={onEntityActivate}
            onReload={onReload}
            onFailure={onFailure}
          />
        ) : reading === "sources" ? (
          // Sources reads in its SECOND PANEL, not in the shell inspector: the
          // accepted screen is a list beside the source being read, and a
          // reader that opened in the rail would put the two dates, the
          // availability control and what rests on the source outside the
          // screen they belong to. So this reading takes no inspector host.
          <SourcesReading
            client={client}
            snapshot={snapshot}
            onReload={onReload}
            onFailure={onFailure}
          />
        ) : (
          <CaptureHistoryReading
            snapshot={snapshot}
            inspectorHost={inspectorHost}
            onInspectorOpen={() => onInspectorOpen("captures")}
            wiring={captureHistory}
          />
        )}
      </div>
    </div>
  );
};
