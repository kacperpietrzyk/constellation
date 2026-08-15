import { useState } from "react";

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
import { libraryReadingLabel } from "./library-readings.js";
import { NotesReading } from "./NotesReading.js";
import { SourcesReading } from "./SourcesReading.js";

// TRZY CELE NAWIGACJI, JEDNA POWŁOKA — i to jest odwrócenie kształtu, który ten
// plik nosił od fali Knowledge. Stało tu: „JEDEN cel nawigacji, trzy odczyty.
// Powłoka trzyma nagłówek celu, PRZEŁĄCZNIK i pole odczytu". Przełącznika już
// nie ma: decyzja Kacpra z 2026-08-15 („Rozwinąć na trzy pozycje nawigacji",
// wpisy 11-1 i C-1 rejestru przejścia) wyprowadziła Notatki, Źródła i Historię
// wrzutek na trzy osobne pozycje lewej kolumny, więc wybór odczytu należy do
// NAWIGACJI, a nie do zakładki wewnątrz ekranu.
//
// CO ZOSTAJE WSPÓLNE, I DLACZEGO TO JEST JEDEN KOMPONENT, A NIE TRZY PLIKI:
// pasmo tytułu ze slotem akcji, cicha kontrolka wyszukiwania i pasek widoku
// z licznikiem są dla tych trzech ekranów IDENTYCZNE, a `title-band-action.mjs`
// mierzy je jako jedno pasmo. Trzy kopie tego pasma byłyby przepisanym
// kształtem w trzech miejscach — nazwana klasa defektu w tym repozytorium.
// Rozłączność, po którą tamta nota sięgała, dalej stoi: sam ODCZYT mieszka
// w swoim pliku (`NotesReading`, `SourcesReading`, `CaptureHistoryReading`)
// i nie wie o pozostałych dwóch.
//
// `reading` JEST TERAZ PROPSEM WYMAGANYM, A NIE STANEM. Poprzednia wersja
// trzymała go w `useState` z `activeReading` jako podpowiedzią i efektem
// synchronizującym. Stan zniknął razem z przełącznikiem: powierzchnia mówi,
// czym jest, w chwili montażu, a routing powłoki jest jedynym miejscem, które
// to rozstrzyga. Rekord jest TOTALNY nad `LibraryReading`, więc czwarty ekran
// wiedzy bez etykiety i bez wpisu w routingu się nie skompiluje.

export type LibraryInspectorKind = LibraryReading;

/* SŁOWA PROTOTYPU, CO DO SŁOWA: `btn("Search notes and records", …)`
   (`v3/screens/knowledge.js:803`). Stała, a nie literał w JSX, bo ta sama nazwa
   jedzie do `aria-label` — kontrolka zwija się przy wąskim pojemniku do samej
   ikony i wtedy `aria-label` jest JEDYNYM miejscem, w którym ta obietnica
   jeszcze stoi. */
const LIBRARY_SEARCH_LABEL = "Search notes and records";

export const KnowledgeSurface = ({
  client,
  snapshot,
  activeDocumentId,
  reading,
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
  /** KTÓRY z trzech ekranów wiedzy to jest. Bez wartości domyślnej i bez
   *  `undefined` w typie: powierzchnia, która nie wie, czym jest, to dokładnie
   *  ta cicha awaria, którą zwinięcie w zakładki produkowało — kontekst bez
   *  `libraryReading` otwierał Notatki, także wtedy, gdy wołający miał na myśli
   *  Historię wrzutek. */
  readonly reading: LibraryReading;
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
  // WĘZEŁ W STANIE, NIE W `useRef`, i to jest wymóg, a nie gust: portal
  // wstrzykuje do CELU, więc odczyt musi się przerysować w chwili, w której cel
  // pojawia się w drzewie. `useRef` nie powoduje przerysowania, a pierwszy
  // przebieg ma tam `null` — akcja zostałaby wtedy nienarysowana aż do
  // pierwszej zmiany stanu z innego powodu. Ten sam kształt co `inspectorHost`,
  // który powłoka podaje temu komponentowi z zewnątrz.
  const [actionHost, setActionHost] = useState<HTMLElement | null>(null);

  // LICZNIK LICZY TO, CO STOI POD NIM, i to jest zmiana, którą wymusił rozdział
  // ekranu. Do lotu D3 stała tu suma `documentCount + sourceCount` — jedna
  // liczba nad przełącznikiem, prawdziwa dla żadnego z trzech odczytów
  // z osobna. Prototyp liczy per ekran (`v3/screens/knowledge.js:971` —
  // `<span class="kn-n">${SOURCES.length}</span>` na Źródłach), i po rozdziale
  // to jest jedyny odczyt, który się broni: pasek widoku Notatek nie ma prawa
  // mówić o źródłach, których na nim nie ma.
  //
  // ODMOWA LICZY SIĘ JAKO ZERO, tak samo jak przed tym lotem — i tak samo jak
  // wtedy jest to UBYTEK, nie decyzja: projekcja, której nie dało się
  // przeczytać, jest tu nieodróżnialna od pustej listy. Ekran mówi o tym
  // własnym panelem stanu; licznik nie ma jak.
  const count =
    reading === "notes"
      ? snapshot.documents.kind === "ready"
        ? snapshot.documents.data.items.length
        : 0
      : reading === "sources"
        ? snapshot.knowledge.kind === "ready"
          ? snapshot.knowledge.data.sources.length
          : 0
        : snapshot.captures.length;

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
          `KnowledgeEditor.tsx:1623`; przeniesienie formularzy do powłoki
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
      {/* TYTUŁ JEST NAZWĄ EKRANU, NIE NAZWĄ MODUŁU (lot D3). Stało tu
          „Library" — jedno słowo nad trzema różnymi ekranami, których nazwy
          czytało się dopiero z zaznaczonej zakładki niżej. Po rozdziale pasmo
          mówi to samo, co pozycja nawigacji, którą czytelnik przed chwilą
          kliknął, i to samo, co etykieta zakładki: „Notes", „Sources",
          „Capture history".

          NAPIS IDZIE Z DRUGIEGO SŁOWNIKA NIŻ ETYKIETA NAWIGACJI, i to jest
          zapisane tutaj jako DŁUG, nie jako gwarancja. `libraryReadingLabel`
          (`library-readings.ts`) niesie ten `h1`; etykietę pozycji nawigacji,
          granicy leniwego chunka i stanu ładowania niesie rejestr
          (`desktop-preload/src/surface-registry.ts`). Scalenia ich w jeden
          słownik NIE DA SIĘ zrobić w tę stronę i powód jest zmierzony
          w bajtach: ten katalog jest leniwy, a import WARTOŚCI z rejestru
          wciągnąłby go na ścieżkę gorącą (nota nad `libraryReadings`
          w `client/shell-navigation.ts`).

          Skoro słowniki zostają dwa, pilnuje ich ASERCJA, a nie to zdanie:
          `desktop-ui/test/shell-navigation.test.ts` — „the knowledge h1 and
          the navigation label are one sentence" — chodzi po CAŁEJ unii
          odczytów i żąda równości napisów. Bez niej podmiana wszystkich trzech
          `h1` przechodziła przez cały `npm run check` (zmierzone przy
          przeglądzie tego lotu). Oś konspektu nagłówków pyta o `h1` na każdym
          ekranie — trzy ekrany, trzy `h1`, każdy inny. */}
      <header className={`surface-header ${styles.header}`}>
        <h1 id="surface-title" tabIndex={-1}>
          {libraryReadingLabel[reading]}
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

      {/* PRZEŁĄCZNIK ODCZYTÓW ZNIKNĄŁ RAZEM Z JEDNYM CELEM (lot D3), i to jest
          jedyne miejsce w tym pliku, w którym coś UBYŁO, a nie zmieniło się.
          Stały tu trzy przyciski `role="tab"` z `data-layout={id}`, mapowane po
          kolejności odczytów. Sam eksport tej kolejności zszedł razem z nimi:
          po rozdziale kolejność trzech ekranów wiedzy ustala rejestr
          powierzchni, bo to on rysuje pozycje nawigacji.

          BRAMKA UKŁADU CZYTAŁA `data-layout` JAKO SPIS OBIEKTYWÓW DO
          ZMIERZENIA i to jest dług, który ten lot musi oddać, a nie skutek
          uboczny do przemilczenia: dopóki przełącznik stał, przelot dojeżdżał
          na Bibliotekę i klikał w zakładki, żeby zobaczyć trzy odczyty. Po
          rozdziale te trzy odczyty są trzema PRZYSTANKAMI trasy, każdy ze
          swoim markerem przybycia w `ROUTED_ARRIVAL`, a nie trzema kliknięciami
          w jednym. Marker `data-layout` zostaje wyłącznie tam, gdzie dalej
          znaczy obiektyw nad JEDNĄ kolekcją — na Zadaniach i Projektach.

          Pasek widoku ZOSTAJE, bo licznik w nim jest cytatem
          (`v3/app.css:295-301`, `.viewbar .count`) i nie zależał od zakładek. */}
      <div className={styles.viewbar}>
        {/* LICZNIK CZYTA LISTĘ, WIĘC STOI NAD LISTĄ, a nie w rzędzie akcji —
            `v3/app.css:295-301` daje `.viewbar` własne `.count`. Klasa
            `library-count` zostaje, bo dzieli ją reguła globalna w `styles.css`
            z dwiema powierzchniami spoza Biblioteki. */}
        <span className={`library-count ${styles.count}`}>{count}</span>
      </div>

      {/* `data-height-bound` JEST DEKLARACJĄ, nie hakiem testowym, i mówi
          dokładnie jedno: ten ekran obiecuje zmieścić się w panelu, a
          przewijanie ma się dziać W ŚRODKU. Do dziś nie mieścił się — czytelnia
          miała 4140 px w oknie 735 px i cały trzypanelowy odczyt przewijał się
          jako strona. Atrybut siedzi na PUDEŁKU CZYTELNI, bo to jego wysokość
          jest tu obietnicą; korzeń ekranu i panel bramka bierze strukturalnie,
          jako rodzica i dziadka. Bramka układu wylicza z niego swoje podmioty
          (`scripts/renderer-declarations.mjs`), więc drugi ekran związany
          wysokością jest objęty w dniu, w którym się deklaruje.

          TRZY LITERAŁY, A NIE JEDEN ATRYBUT Z WYRAŻENIEM W KLAMRACH, I TO NIE
          JEST NIEZGRABNOŚĆ — jest to jedyny zapis, który ta deklaracja UNOSI.
          `declaredAttributeValues` (`renderer-declarations.mjs`) czyta
          WYŁĄCZNIE literał i mówi to o sobie wprost; wartość w klamrach jest
          przez nią wykrywana i zamienia CAŁE wyprowadzenie w awarię
          (`not-derivable`), a atrybut rozłożony spreadem byłby przed nią po
          prostu ukryty — czyli zieleń kupiona za wyłączenie przyrządu.
          WYKRYWACZ JEST REGEXPEM PO CAŁYM PLIKU I NIE ODRÓŻNIA KOMENTARZA OD
          KODU: pierwsza wersja tej noty CYTOWAŁA zakazany zapis, żeby go
          nazwać, i tym samym wywróciła bramkę. Zapisane tu, bo następny, kto
          zechce nazwać ten zapis dosłownie, wywróci ją znowu.
          WARTOŚCIĄ MUSI BYĆ IDENTYFIKATOR CELU, bo przeloty zawężone filtrują
          zbiór deklaracji przez swoją listę powierzchni (`heightBoundExpected`);
          jeden wspólny napis „library" byłby po locie D3 nazwą, której nie nosi
          żadna powierzchnia, a wtedy dwa wąskie przeloty Biblioteki
          POMIJAŁYBY ten strażnik po cichu. Do lotu D3 stał tu jeden literał,
          bo ekran był jeden. */}
      {reading === "notes" ? (
        <div className={styles.reading} data-height-bound="notes">
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
        </div>
      ) : reading === "sources" ? (
        <div className={styles.reading} data-height-bound="sources">
          {/* Sources reads in its SECOND PANEL, not in the shell inspector: the
              accepted screen is a list beside the source being read, and a
              reader that opened in the rail would put the two dates, the
              availability control and what rests on the source outside the
              screen they belong to. So this reading takes no inspector host. */}
          <SourcesReading
            actionHost={actionHost}
            client={client}
            snapshot={snapshot}
            onReload={onReload}
            onFailure={onFailure}
          />
        </div>
      ) : (
        <div className={styles.reading} data-height-bound="captures">
          <CaptureHistoryReading
            snapshot={snapshot}
            inspectorHost={inspectorHost}
            onInspectorOpen={() => onInspectorOpen("captures")}
            wiring={captureHistory}
          />
        </div>
      )}
    </div>
  );
};
