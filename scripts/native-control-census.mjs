// SPIS NATYWNYCH KONTROLEK W ŹRÓDLE RENDERERA — EWIDENCJA DŁUGU, KTÓRA
// CZERWIENIEJE PRZY NOWYM WYSTĄPIENIU.
//
// PO CO TO ISTNIEJE, i dlaczego nie wystarczają pary bramki układu.
// Przyrząd P4 (Faza I) postawił osiem par pytających, czy powierzchnia treści
// SZEŚCIU ekranów trzyma kontrolkę rysowaną przez system. Jego własny wpis
// `LP4-03` w `visual-language-pairs.mjs` zapisał przy tym, jak da się go
// oszukać, i zapisał to ZANIM ktokolwiek próbował:
//
//   „Faza II może zamknąć P4-01a/b i P4-02a/b, przenosząc te same kontrolki
//    o jedno kliknięcie dalej — do panelu, do dialogu albo do rozwijanego
//    wiersza — i cały ten przyrząd zrobi się zielony nad produktem, który dalej
//    wybiera natywnym widżetem."
//
// Ten spis jest odpowiedzią na tamto zdanie. Liczy kontrolki w ŹRÓDLE, więc
// `<select>` przeniesiony do dymka dalej się w nim liczy, a plik, który dołoży
// nowy, kładzie bramkę z własną nazwą.
//
// CZEGO TEN SPIS NIE WIE, powiedziane wprost, bo przemilczane ograniczenie
// przyrządu jest tym, od czego zaczyna się fałszywy spokój:
//
//   1. NIE WIE, GDZIE kontrolka stoi. Plik, który przeniesie swój `<select>`
//      z pasa widoku do dymka, ma tę samą liczbę i spis nic o tym nie powie.
//      O miejscu mówią wyłącznie pary `P4-*` bramki układu — i tylko na sześciu
//      ekranach, na które ona umie dojechać. Spis i pary są dwiema połowami
//      jednego zdania.
//   2. NIE WIE, czy kontrolka jest RYSOWANA. Element pod martwą gałęzią
//      warunku liczy się tak samo jak ten na ekranie.
//   3. NIE ODRÓŻNIA produktu od rusztowania. `src/dev/` to harnessy, a nie
//      aplikacja — dziś nie mają ani jednej kontrolki, ale gdyby dostały, spis
//      policzy je razem z resztą.
//   4. LICZY WYŁĄCZNIE ELEMENT JSX ZAPISANY W SKŁADNI JSX. Kontrolka zrobiona
//      przez `document.createElement("select")`, przez `createElement("input")`
//      albo wstrzyknięta napisem do `innerHTML` nie jest elementem JSX i ten
//      spis jej nie zobaczy. Dziś w `packages/desktop-ui/src` nie ma ani
//      jednego takiego miejsca i to jest ZMIERZONE, nie założone:
//      `grep -rn createElement packages/desktop-ui/src` daje ZERO trafień,
//      `innerHTML` też. Gdyby kiedyś powstało, to jest droga obejścia tego
//      spisu i jest tu nazwana, a nie przemilczana.
//   5. CZYTA SKŁADNIĘ, NIE TYPY. `<Select />` z wielkiej litery to komponent
//      i nie jest liczony, choćby renderował natywny `<select>` w środku —
//      ale wtedy liczy się ten `<select>`, w pliku, w którym stoi.
//
// DLACZEGO AST, A NIE TEKST — I DLACZEGO TO JEST POPRAWKA, A NIE GUST.
// Pierwsza wersja tego spisu (lot L6, 2026-08-15) liczyła po tekście, przez
// własny mały skaner stanu wycinający komentarze i napisy, i uzasadniała to
// zdaniem „parser TSX byłby zależnością". To zdanie było NIEPRAWDZIWE o tym
// repozytorium: `typescript` stoi w `devDependencies` (6.0.3) i chodzi w tej
// samej bramce w kroku `typecheck`, więc parser nie jest tu zależnością do
// dodania, tylko zależnością już opłaconą.
//
// A tekstowy skaner był NIE TYLKO nadmiarowy — był ŚLEPY, i to jest zmierzone
// na oddawanym drzewie, nie przypuszczone. Apostrof w TREŚCI JSX otwierał mu
// napis, którego nic nie zamykało do następnego apostrofu; wszystko pomiędzy
// znikało razem z kodem. Pięć takich stref stało w tym drzewie 2026-08-15,
// a jedna z nich POŁYKAŁA ŻYWĄ KONTROLKĘ:
//
//   `StrategicDepthSurface.tsx:1233` — `<small>No active projects to link in
//   this client's Space.</small>` otwiera napis apostrofem w słowie „client's”
//   i zamyka go 1163 znaki dalej, a w środku stoi PRAWDZIWY
//   `<select id="organization-delivery-link">` (`:1239`). Skaner tekstowy
//   liczył w tym pliku 4 kontrolki, AST liczy 5. Ewidencja przyjechała do
//   przeglądu ZANIŻONA o dokładnie ten jeden element.
//
// Ślepota działała w obie strony i żadna z nich nie jest łagodna: kontrolka
// SCHOWANA w strefie połknięcia dawała `NATIVE_CONTROL_REMOVED`, czyli
// polecenie „obniż ewidencję" nad żywym długiem, a kontrolka DOPISANA w strefie
// już połkniętej nie dawała nic — cichą zieleń dokładnie tam, gdzie ten spis
// miał bronić. Deklaracja „plik, który dołoży nowy, kładzie bramkę z własną
// nazwą" była więc nieprawdą o przyrządzie, dopóki liczył po tekście.
//
// Parser rozstrzyga to nie „lepiej", tylko INACZEJ CO DO RODZAJU: nie zgaduje,
// gdzie kończy się napis, bo zna gramatykę. Apostrof w treści JSX, cudzysłów
// w literale wyrażenia regularnego i niedomknięty backtick w prozie przestają
// być pytaniem. Skanowane są `.tsx` ORAZ `.ts` — `.ts` nie może nieść składni
// JSX i zawsze wyliczy się do zera, ale spis, który czyta tylko jedno
// rozszerzenie, ma ograniczenie, o którym nikt nie napisał; ten go nie ma.
// Koszt: 0,23 s na całe drzewo renderera.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";

/** Elementy, które rysuje silnik, a nie arkusz aplikacji. */
export const NATIVE_CONTROL_TAGS = ["select", "input", "textarea"];

/**
 * Ile natywnych kontrolek niesie JEDEN kawałek źródła.
 *
 * Wyeksportowane po to, żeby test sprawdzał SAM SKANER na przypadkach
 * granicznych, na małych napisach, zamiast wnioskować z tego, że suma po
 * drzewie wygląda sensownie. Nazwa pliku steruje wyłącznie trybem parsera
 * (`.ts` bez JSX, wszystko inne z JSX), więc domyślna wartość jest `.tsx`.
 *
 * Liczone są `JsxOpeningElement` i `JsxSelfClosingElement`, których nazwa jest
 * DOKŁADNIE jednym z `NATIVE_CONTROL_TAGS`. Parser nie wraca z błędem na
 * niedomkniętym drzewie — zwraca to, co zrozumiał, i to jest tu pożądane:
 * spis ma liczyć, a nie kompilować. Kompilator jest osobnym krokiem bramki.
 */
export const countNativeControls = (source, fileName = "probe.tsx") => {
  const tree = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    false,
    fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX,
  );
  const perTag = Object.fromEntries(NATIVE_CONTROL_TAGS.map((tag) => [tag, 0]));
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      // `getText` czyta z pliku źródłowego, a nie z węzła, więc nazwa
      // kwalifikowana (`Foo.Bar`) i wielka litera odpadają same: żadna z nich
      // nie jest równa „select", „input" ani „textarea".
      const tag = node.tagName.getText(tree);
      if (Object.hasOwn(perTag, tag)) perTag[tag] += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return {
    perTag,
    total: Object.values(perTag).reduce((sum, count) => sum + count, 0),
  };
};

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

const sourceFiles = (directory) => {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) found.push(full);
  }
  return found.sort();
};

/**
 * Ile natywnych kontrolek stoi w każdym pliku `.ts`/`.tsx` pod `root`.
 *
 * Zwraca WYŁĄCZNIE pliki z niezerową liczbą — ewidencja ma być listą długu,
 * a nie spisem katalogu.
 */
export const censusNativeControls = ({ root }) => {
  const perFile = {};
  const perTag = Object.fromEntries(NATIVE_CONTROL_TAGS.map((tag) => [tag, 0]));
  for (const file of sourceFiles(root)) {
    const counted = countNativeControls(readFileSync(file, "utf8"), file);
    for (const tag of NATIVE_CONTROL_TAGS) perTag[tag] += counted.perTag[tag];
    if (counted.total > 0)
      perFile[path.relative(root, file).replaceAll("\\", "/")] = counted.total;
  }
  return {
    perFile,
    perTag,
    total: Object.values(perFile).reduce((sum, count) => sum + count, 0),
    files: Object.keys(perFile).length,
  };
};

// ── EWIDENCJA ─────────────────────────────────────────────────────────────
//
// ZMIERZONE 2026-08-15 PARSEREM, po locie L6 Fazy II i po naprawie tego spisu:
// **190 kontrolek w 31 plikach** (`select` 57, `input` 119, `textarea` 14).
// Stan przed lotem L6: 193 (`select` 60). Lot zdjął trzy `<select>` z pasa
// widoku Zadań i przeniósł parę `<select>` + `<input>` z listy Spotkań do
// Ustawień, więc `input` i `textarea` stoją w miejscu, a `select` schodzi
// 60 → 57.
//
// TE LICZBY SĄ O JEDEN WYŻSZE NIŻ TE, KTÓRE ODDAŁ LOT L6 (189 / `select` 56),
// I RÓŻNICA NIE JEST ZAOKRĄGLENIEM: pierwsza, tekstowa wersja skanera nie
// widziała `<select id="organization-delivery-link">` w
// `StrategicDepthSurface.tsx:1239`, bo apostrof w „this client's Space." nad
// nim otwierał jej napis. Ewidencja mówiła w tym pliku 4, źródło niosło 5.
// Powód stoi w nagłówku tego pliku.
//
// TO NIE JEST SUFIT, TYLKO ODCISK. Sufit („nie więcej niż N") pozwala jednemu
// plikowi urosnąć kosztem drugiego i zamyka oczy na przenosiny; równość
// per plik nie pozwala. Wpis USUNIĘTY też kładzie bramkę — z poleceniem
// obniżenia liczby — bo dług, który wolno cicho odrosnąć do dawnej wartości,
// nie jest ewidencjonowany, tylko wspominany.
//
// JAK TO ZAKTUALIZOWAĆ PO ŚWIADOMEJ ZMIANIE: uruchom
// `node --test scripts/native-control-census.test.mjs` — komunikat porażki
// wypisuje nazwę pliku, liczbę wpisaną i liczbę zmierzoną, więc poprawka jest
// jednym wierszem. Podniesienie wpisu jest zawsze DECYZJĄ, nie porządkami:
// każda nowa natywna kontrolka na powierzchni treści łamie „Pattern: Control
// size" i wymaga zdania w opisie zmiany.
export const NATIVE_CONTROL_LEDGER = {
  "CaptureDialog.tsx": 3,
  "MeetingsSurface.tsx": 5,
  "OnboardingFlow.tsx": 1,
  "ProjectRichBody.tsx": 2,
  "RealApp.tsx": 12,
  "SettingsSurface.tsx": 20,
  "StrategicCreatePanel.tsx": 37,
  // PIĘĆ, A NIE CZTERY: piąta to `<select id="organization-delivery-link">`
  // (`:1239`), której tekstowa wersja tego spisu nie widziała.
  "StrategicDepthSurface.tsx": 5,
  "Wave2Surfaces.tsx": 9,
  "WorkspaceRecovery.tsx": 4,
  "components/ChoicePopover.tsx": 1,
  "components/DecisionClientSection.tsx": 1,
  "components/TaskAssignmentSection.tsx": 1,
  "components/TaskReservationSection.tsx": 3,
  "library/KnowledgeEditor.tsx": 7,
  "library/NotesReading.tsx": 1,
  "library/SourcesReading.tsx": 4,
  "opportunity/OpportunityRecordScreen.tsx": 8,
  "people/PeopleSurface.tsx": 4,
  "pipeline/PipelineSurface.tsx": 7,
  "projects/ProjectContextPanel.tsx": 6,
  // Portfolio filters remain ordinary labelled selects, keeping Area,
  // Initiative and client selection keyboard-native without a query builder.
  "projects/ProjectCollection.tsx": 4,
  // The one-step classifier owns bounded Project/Task authoring and routes the
  // other four kinds to their existing forms; its fields are labelled at 320 px.
  "projects/ProjectCreateClassifier.tsx": 7,
  "record/ProjectRecordOverview.tsx": 4,
  // Reclassification is an explicit, previewed form: native controls keep all
  // required Area/Initiative/Opportunity facts labelled and keyboard-operable.
  "record/ProjectReclassificationDialog.tsx": 6,
  "record/RecordCommentsPanel.tsx": 2,
  // Four bounded native fields keep direct Task/Project authoring keyboard-first
  // on the Area/Initiative record; no generic relation builder is introduced.
  "record/WorkContextRecordScreen.tsx": 4,
  "record/TaskOperationsPanel.tsx": 4,
  "renewals/RenewalsSurface.tsx": 9,
  "settings/AccessSection.tsx": 13,
  "settings/ActivitySection.tsx": 4,
  "settings/CommercialDefaultsSection.tsx": 6,
  "settings/WorkingDaySection.tsx": 3,
  "tasks/SavedViewFilterForm.tsx": 4,
  "tasks/SavedViewManager.tsx": 3,
};

/**
 * Rozjazd między ewidencją a pomiarem, jako lista ZDAŃ, nie jako `false`.
 *
 * Trzy rodzaje, i każdy ma inne zalecenie, bo są to trzy różne rzeczy:
 * plik, który dołożył kontrolkę; plik, który ją zdjął (ewidencja ma zejść);
 * plik, którego w ewidencji nie ma wcale.
 */
export const compareToLedger = (census, ledger = NATIVE_CONTROL_LEDGER) => {
  const drift = [];
  for (const [file, counted] of Object.entries(census.perFile)) {
    const pinned = ledger[file];
    if (pinned === undefined) {
      drift.push(
        `NATIVE_CONTROL_NEW_FILE — ${file} carries ${counted} native control(s) and is not in the ledger. ` +
          "A file that draws its own <select>/<input>/<textarea> is debt against „Pattern: Control size”: " +
          "either the choice becomes a drawn menu (components/ChoicePopover.tsx), or the count is pinned " +
          "here with a sentence in the change that says why.",
      );
      continue;
    }
    if (counted > pinned)
      drift.push(
        `NATIVE_CONTROL_ADDED — ${file}: ledger says ${pinned}, source has ${counted}. ` +
          `${counted - pinned} native control(s) were added.`,
      );
    if (counted < pinned)
      drift.push(
        `NATIVE_CONTROL_REMOVED — ${file}: ledger says ${pinned}, source has ${counted}. ` +
          "Lower the ledger in the same change: a debt allowed to grow back quietly is not a ledger.",
      );
  }
  for (const file of Object.keys(ledger))
    if (census.perFile[file] === undefined)
      drift.push(
        `NATIVE_CONTROL_GONE — ${file}: ledger says ${ledger[file]}, the file has none (or is gone). ` +
          "Remove the row.",
      );
  return drift;
};
