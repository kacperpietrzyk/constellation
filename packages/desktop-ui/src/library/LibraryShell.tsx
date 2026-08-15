import { useEffect, useState } from "react";

import type { DocumentId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import type { LibraryReading } from "../client/shell-navigation.js";
import { Icon } from "../components/Icon.js";
import { modifierLabel } from "../components/ShortcutsOverlay.js";
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

/* SŁOWA PROTOTYPU, CO DO SŁOWA: `btn("Search notes and records", …)`
   (`v3/screens/knowledge.js:803`). Stała, a nie literał w JSX, bo ta sama nazwa
   jedzie do `aria-label` — kontrolka zwija się przy wąskim pojemniku do samej
   ikony i wtedy `aria-label` jest JEDYNYM miejscem, w którym ta obietnica
   jeszcze stoi. */
const LIBRARY_SEARCH_LABEL = "Search notes and records";

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
  onOpenSearch,
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
  /** Otwiera paletę wyszukiwania — TĘ SAMĄ, którą otwiera `⌘K` i kontrolka
   *  w szynie powłoki. Pasmo prototypu ma tu przycisk, nie własne pole
   *  (`v3/screens/knowledge.js:803`), więc ten odczyt niczego nie wyszukuje
   *  sam: mówi tylko, że stąd też się to robi. */
  readonly onOpenSearch: () => void;
  readonly captureHistory: CaptureHistoryWiring;
}) => {
  const [reading, setReading] = useState<LibraryReading>(
    activeReading ?? "notes",
  );
  // WĘZEŁ W STANIE, NIE W `useRef`, i to jest wymóg, a nie gust: portal
  // wstrzykuje do CELU, więc odczyt musi się przerysować w chwili, w której cel
  // pojawia się w drzewie. `useRef` nie powoduje przerysowania, a pierwszy
  // przebieg ma tam `null` — akcja zostałaby wtedy nienarysowana aż do
  // pierwszej zmiany stanu z innego powodu. Ten sam kształt co `inspectorHost`,
  // który powłoka podaje temu komponentowi z zewnątrz.
  const [actionHost, setActionHost] = useState<HTMLElement | null>(null);
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
      {/* PASMO TYTUŁU DOSTAJE SLOT AKCJI, A LICZNIK SCHODZI DO PASKA WIDOKU
          (Faza C, lot C2 — pozycje rejestru o Notatkach i o Źródłach; JEDNA
          poprawka na dwa ekrany, bo pasmo jest jedno).

          Prototyp: `v3/screens/knowledge.js:802-804` stawia `btn("New note",
          { cls: "primary", icon: "plus" })` jako drugi argument
          `crumbbar(crumbs, actions)` (`v3/app.js:677-683`), a `:967-968` robi
          to samo z „Add a source"; rozpychacz `.crumbbar .spacer { flex: 1 }`
          (`v3/app.css:293`) odpycha akcję do prawego końca pasma, a wypełnienie
          idzie z `.btn.primary` (`v3/app.css:321-332`). Licznik siedzi
          w prototypie w PASKU WIDOKU pod pasmem (`v3/app.css:295-301`, `.viewbar
          .count`) — ta sama zmiana, którą Odnowienia dostały w swoim locie jako
          pozycja 7. Kontrakt: `.ui-craft/tokens.md`, „Usage constraints" 3 —
          pasek akcji ekranu to pojemnik, któremu wolno nieść jedną akcję
          z wypełnieniem akcentu; rejestr notuje o obu tych ekranach, że NIE MA
          NA NICH ANI JEDNEJ powierzchni wypełnionej akcentem.

          KOLEJNOŚĆ MA ZNACZENIE I JEST MIERZONA. Licznik stał na PRAWYM KOŃCU
          pasma, więc sam slot akcji by nie wystarczył: akcja stanęłaby PRZED
          liczbą i pasmo dalej kończyłoby się liczbą — co spis pasma tytułu
          czyta jako `INSET_FROM_END`. Licznik schodzi więc niżej, a koniec
          pasma należy do akcji.

          AKCJA JEST WSTRZYKIWANA PRZEZ PORTAL, nie budowana tutaj. Odczyt wie,
          co na nim znaczy „utwórz" (Notatki otwierają dymek z formularzem,
          Źródła mają własny), a powłoka wie, GDZIE ta akcja stoi. Ten sam
          wzorzec, co `inspectorHost` w tym samym pliku i w
          `KnowledgeEditor.tsx:1603`; przeniesienie formularzy do powłoki
          znaczyłoby przeniesienie ich stanu, czyli przebudowę dwóch odczytów
          w locie o POŁOŻENIU akcji. Historia przechwyceń akcji tworzenia nie ma
          i slot zostaje wtedy pusty — „ten odczyt nie ma akcji" jest
          odpowiedzią, nie luką. */}
      {/* PASMO BIBLIOTEKI JEST TYM SAMYM PASMEM, CO POZOSTAŁE JEDENAŚCIE
          (lot L2). Trzy rzeczy zmieniły się tu naraz i wszystkie trzy są
          jednym zdaniem prototypu — `crumbbar("Notes", btn("Search notes and
          records", { cls: "quiet", icon: "search", act: "palette", kbd: "⌘K" })
          + btn("New note", { cls: "primary", icon: "plus" }))`
          (`v3/screens/knowledge.js:802-804`):

          1. NADTYTUŁ „Sources and deliverables" ZNIKA — prototyp nazywa ekran
             raz, a `.crumbs .cur` (`v3/app.css:292`) jest `nowrap`: lewa strona
             pasma to jeden wiersz (wpis 11-7 rejestru przejścia mówi o tym
             samym paśmie co ten punkt);
          2. KLASA `surface-header` DOCHODZI DO MODUŁOWEJ, więc ten nagłówek
             bierze wysokość pasma (`--header-band-height`), włoskową kreskę
             i rozkład `space-between` z tej samej reguły, co jedenaście
             pozostałych. Przed tym lotem rysował własne 60 px przy 40 px
             wszędzie indziej — trzeci wariant tego samego pasma. Reguły
             modułowe zostają WYŁĄCZNIE tam, gdzie mówią coś, czego reguła
             globalna nie mówi (zawijanie i łamanie słów przy 300% pisma);
          3. WYSZUKIWANIE WRACA DO PASMA jako kontrolka CICHA (`ghost-button`,
             czyli poza zbiorem klas akcji — oś miejsca akcji dalej mierzy tu
             „New note" i dalej widzi je na końcu pasma). Otwiera tę samą
             paletę, co `⌘K` i kontrolka w szynie powłoki; skrót jest
             wypisany tym samym glifem co tam. */}
      <header className={`surface-header ${styles.header}`}>
        <h1 id="surface-title" tabIndex={-1}>
          Library
        </h1>
        <div className={styles.headerAction}>
          <button
            aria-label={`${LIBRARY_SEARCH_LABEL} (${modifierLabel}K)`}
            className={`ghost-button compact ${styles.searchInBand}`}
            onClick={onOpenSearch}
            type="button"
          >
            <Icon name="search" />
            <span className={styles.searchLabel}>{LIBRARY_SEARCH_LABEL}</span>
            <span className={styles.searchHint}>{modifierLabel}K</span>
          </button>
          <div className={styles.actionSlot} ref={setActionHost} />
        </div>
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
        {/* LICZNIK CZYTA LISTĘ, WIĘC STOI NAD LISTĄ, a nie w rzędzie akcji —
            `v3/app.css:295-301` daje `.viewbar` własne `.count`. Klasa
            `library-count` zostaje, bo dzieli ją reguła globalna w `styles.css`
            z dwiema powierzchniami spoza Biblioteki. */}
        <span className={`library-count ${styles.count}`}>
          {documentCount + sourceCount}
        </span>
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
            actionHost={actionHost}
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
            actionHost={actionHost}
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
