// BRAMKA KONTRASTU NA KONSUMENCIE, NIE NA PARZE TOKENÓW (przyrząd P3).
//
// ── PO CO ISTNIEJE ──────────────────────────────────────────────────────────
// `status-contrast.test.mjs` czyta WYŁĄCZNIE `tokens.css` (ścieżka przybita na
// sztywno, `:67-73`) i mierzy PARY TOKENÓW: rodziny o kształcie `--X-bg` +
// `--X-text`, statusy, tekst na powierzchniach czytania. Wszystkie arkusze
// powierzchni — `styles.css` i trzydzieści siedem CSS Modułów — są dla niej
// niewidzialne. To znaczy, że reguła malująca DOWOLNY token tekstu na DOWOLNYM
// tokenie tła przechodzi bez pomiaru, o ile ta konkretna para nie jest rodziną.
//
// To nie jest teoria. Na drzewie z 2026-08-07 ta bramka znalazła
// `.nav-count--attention` (`styles.css:1254`): `color: var(--on-accent)` na
// `background: var(--accent)`, czyli w motywie CIEMNYM 3,54:1 przy progu 4,5.
// Liczba 3,54 jest w tym repo ZAPISANA — `tokens.css:568` wymienia ją w tabeli
// stopni akcentu pod nagłówkiem „PONIŻEJ" — a mimo to plakietka została tak
// pomalowana i wszystkie 27 asercji `status-contrast` zostało zielonych.
// Para `--accent` × `--on-accent` nie jest rodziną `--X-bg`/`--X-text`, więc
// tamta bramka nie miała jak o nią zapytać. Brakujący przyrząd, nie zły kod.
//
// Drugi dowód tej samej dziury, tańszy do sprawdzenia: arkusze powierzchni
// malują `background: var(--border-subtle)` (osiem reguł),
// `background: var(--text-tertiary)` (pięć) i `background: var(--text-primary)`
// (trzy). Bramka tokenowa nie ma jak zobaczyć tokenu, którego NAZWA mówi
// „krawędź" albo „tekst", użytego jako farba tła — ta widzi każdy taki przypadek,
// bo pyta o REGUŁĘ, nie o nazwę.
//
// ── DLACZEGO OSOBNY PLIK, A NIE ROZSZERZENIE `status-contrast.test.mjs` ──────
// Bo `status-contrast.test.mjs` sam, w trzech osobnych miejscach, nazywa koszt
// rzutu na poziomie modułu: kasuje CAŁY plik, a `EXIT=1` z zera wykonanych testów
// wygląda identycznie jak `EXIT=1` z prawdziwej czerwieni (`:370-373`, `:588-594`,
// `:857-859`). Ta bramka czyta ~39 arkuszy ODKRYTYCH Z DYSKU; jeden arkusz
// o kształcie, którego nie umiem rozłożyć, wyzerowałby wtedy 27 zielonych asercji
// o tokenach, które z nim nie mają nic wspólnego. Różne podmioty, różne tryby
// awarii, rozdzielony promień rażenia.
// Wspólna jest MATEMATYKA (`color-contrast.mjs`) i KASKADA MOTYWÓW
// (`css-tokens.mjs`, wyjęta z tamtego pliku tym samym ruchem) — czyli dokładnie
// to, czego przepisanie drugi raz byłoby znaną z tego repo klasą defektu.
//
// ── JĘZYK ───────────────────────────────────────────────────────────────────
// Komentarze po polsku, wbrew ogólnej konwencji repo (angielski), bo oba pliki,
// na których ta bramka stoi i do których się odwołuje wierszami, są w całości
// po polsku. Bramka z rozumowaniem w połowie po polsku, w połowie po angielsku
// byłaby gorsza od obu wariantów; do odwrócenia jedną decyzją właściciela.
//
// ── PRÓG ────────────────────────────────────────────────────────────────────
// 4,5:1 — WCAG 2.x SC 1.4.3 (tekst o normalnej wielkości), importowany jako
// `WCAG_AA_NORMAL_TEXT`, nie przepisany. Ulga 3:1 dla tekstu POWIĘKSZONEGO nie
// jest tu zaimplementowana: rozmiar czcionki reguły bywa dziedziczony i nie da
// się go ustalić z samego arkusza, więc bramka jest jednolicie ostrożna. Dziś
// nic to nie kosztuje — ani jeden zmierzony wiersz nie siedzi w oknie 3–4,5
// poza tymi, które i tak są zwolnione jako nieaktywne kontrolki.
// SC 1.4.11 (3:1, kontrast NIEBĘDĄCY TEKSTEM) rządzi krawędziami i pierścieniem
// ogniska i NIE jest tu używany. Krawędzie zostają przy precedensie
// `status-contrast.test.mjs:1163-1187`: mierzone i wypisane, NIE asertowane,
// bo z samych tokenów nie da się wyprowadzić, czy kontrolkę wolno rozpoznać po
// wypełnieniu zamiast po włosie. Ta bramka nie zmienia tamtej decyzji.
//
// ── ŻE UMIE BYĆ CZERWONA I ŻE UMIE BYĆ ZIELONA (2026-08-07) ─────────────────
// Bramka, która nie umie zzielenieć, nie jest pomiarem tylko blokadą; bramka,
// która nie umie sczerwienieć, nie mierzy nic. Sprawdzone oba kierunki:
//   * NA DZISIEJSZYM DRZEWIE, bez żadnego złamania: 5/6, jedna porażka —
//     `dark/styles.css:1254 .nav-count--attention: 3.54:1`. Czerwień nie jest
//     tu inscenizowana, tylko ZASTANA.
//   * `.nav-count--attention` przestawione TYMCZASOWO na
//     `--action-primary-bg` / `--action-primary-text`: 6/6 zielone, przy
//     NIEZMIENIONYCH licznikach (305 konsumentów, 764 wiersze). Ta druga połowa
//     jest tu istotą: zieleń z niezmienionej liczby wierszy dowodzi, że przyszła
//     ze ZMIENIONEJ WARTOŚCI, a nie ze zniknięcia konsumenta z pomiaru.
//   * Złamanie w CSS MODULE, żeby udowodnić, że przelot naprawdę tam sięga:
//     `renewals.module.css:291 .state_renewed` z `--status-success` na
//     `--text-disabled` (oba tokeny ISTNIEJĄ — podmiana na nieistniejący
//     wywaliłaby `css-token-lint` z zupełnie innego powodu i udawała sukces).
//     Złapane w trzech wierszach: 4,11:1 i 4,41:1 w ciemnym, 4,38:1 w jasnym,
//     każdy z nazwą podłoża, na którym złożono podbarwienie.
// Po przywróceniu plików NIE TRZEBA `touch`: pułapka zatrutego `dist` dotyczy
// asercji czytających ZBUDOWANY kod przez `tsc -b`, a ta bramka czyta `.css`
// prosto z dysku i nic jej nie buforuje.
//
// ── TO SAMO DLA STOPNI GRADIENTU I ZWOLNIENIA DEKORACYJNEGO (2026-08-07) ────
// Rozkładanie gradientów doszło jednym ruchem z poprawką kafla przestrzeni,
// więc czerwień MUSIAŁA być pokazana PRZED poprawką wartości — inaczej nowy
// przelot byłby zielony od urodzenia i nikt by nie wiedział, czy w ogóle patrzy:
//   * PRZED POPRAWKĄ, na niezmienionym `styles.css`: 8/9, jedna porażka —
//     `.workspace-avatar` 2,57:1 w OBU motywach, na stopniu `--a-400` kafla,
//     który niesie inicjał nazwy przestrzeni. Czerwień ZASTANA, nie
//     inscenizowana: ta reguła stała tak od lotu nasady. UWAGA PRZY
//     ODTWARZANIU: tamten przelot miał tabelę rozłożonych gradientów przypiętą
//     do ÓWCZESNEGO jednego wpisu, bo tabela jest urządzeniem ANTYGNILNYM po
//     poprawce, a nie częścią dowodu czerwieni. Cofnięcie samego `styles.css`
//     przy dzisiejszej, dwuwpisowej tabeli daje 7/9, nie 8/9 — druga porażka
//     mówi wtedy „gradient zniknął z listy rozłożonych" i jest poprawna.
//   * PO POPRAWCE: 9/9, przy NIEZMIENIONEJ liczbie konsumentów (305) i liczbie
//     wierszy 774 zamiast 764 — czyli nic z pomiaru nie wypadło, a dziesięć
//     wierszy do niego weszło. Zieleń ze zwężenia zakresu wyglądałaby odwrotnie.
//   * PRZESTROJENIE WARTOŚCI `--a-600` w `tokens.css` (55% → 60% jasności),
//     czyli dokładnie to, czego zamknięty zbiór kształtów NIE UMIAŁ ZOBACZYĆ:
//     złapane, `.workspace-avatar` 4,20:1 na stopniu górnym, w obu motywach,
//     razem z ośmioma konsumentami akcji głównej. Przedtem ten sam ruch
//     przechodził bez jednego pomiaru.
//   * ZNIKNIĘCIE `aria-hidden` z `components/BrandMark.tsx` (podmienione na
//     `role="img"`): zwolnienie dekoracyjne PADA z komunikatem o utraconym
//     dowodzie. Przemianowanie samej reguły `.brand-mark` w arkuszu: pada
//     dwa razy — wyjątek traci podmiot, a reguła bez wyjątku wraca pod próg.
//   * STOPIEŃ, KTÓREGO NIE UMIEM ROZŁOŻYĆ (górny stopień kafla podmieniony
//     tymczasowo na `color-mix`): CAŁY gradient wypada z pomiaru i wraca
//     IMIENNIE na listę kształtów nierozłożonych — połowa stopni nie zostaje
//     zmierzona po cichu, bo to byłaby fałszywa zieleń nie do odróżnienia.
//
// ── CZEGO TA BRAMKA NIE UMIE, POWIEDZIANE WPROST ────────────────────────────
// Kaskada MIĘDZY regułami nie jest statycznie rozstrzygalna: dwie reguły
// o tym samym podmiocie są mierzone OBIE, choć w przeglądarce wygrywa jedna.
// Bramka może więc zgłosić parę, która nigdy się nie maluje. Wewnątrz jednej
// reguły ostatnia deklaracja wygrywa i to jest obsłużone. Nadmiarowe zgłoszenie
// jest tu wybrane ŚWIADOMIE zamiast milczenia: fałszywy alarm kosztuje minutę
// czytania, a przemilczana para kosztuje wydanie.
//
// Wnioskowanie z bazy zostało PRZEJRZANE CO DO SZTUKI, nie tylko tam, gdzie
// wypadło czerwono: siedemnaście par, wszystkie tego samego kształtu
// (`.x:hover`, `.x:active`, `.x[aria-selected="true"]`, `.x:not(:disabled):hover`)
// i w każdej baza deklaruje własność TEGO SAMEGO elementu. Przejrzenie wyłącznie
// par czerwonych zostawiłoby błędne-a-zielone wnioskowanie na później — kiedy
// wypadnie fałszywą czerwienią i podważy cały przyrząd dokładnie wtedy, gdy
// będzie potrzebny.
//
// Pseudoelementy wypadły z wnioskowania (patrz `baseSelectorOf`) i to znaczy,
// że `.shell-tab.active::after` — akcentowa kreska niosąca stan „ta zakładka
// jest bieżąca" — NIE JEST MIERZONA NIGDZIE. To jest żywe pytanie o SC 1.4.11
// (3:1 dla stanu kontrolki), świadomie poza zakresem tego lotu, i ma zostać
// nazwane jako NIEPOKRYTA POWIERZCHNIA, a nie jako brak problemu.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  WCAG_AA_NORMAL_TEXT,
  compositeOver,
  contrastRatio,
  parseColor,
} from "./color-contrast.mjs";
import { tokenSheet } from "./css-tokens.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
// Katalog przybity na sztywno, tak samo i z tego samego powodu, co w bramce
// tokenowej: wejście dające się przestawić z zewnątrz pozwoliłoby tej bramce
// zostać zieloną, mierząc arkusze, których nikt nie wysyła. Za to LISTA plików
// bierze się z DYSKU — dołożenie arkusza razem z nowym ekranem ma go wciągnąć
// do pomiaru samo, bez dopisywania nazwy tutaj. Tak samo robi `css-token-lint`
// i to jest ta sama lekcja: lista arkuszy wpisana z palca wymieniała dwa
// z dziesięciu realnie wysyłanych.
const styleRoot = path.join(repoRoot, "packages", "desktop-ui", "src");
const TOKENS_FILE = "tokens.css";

const stylesheets = readdirSync(styleRoot, {
  recursive: true,
  withFileTypes: true,
})
  .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
  .map((entry) => {
    const absolute = path.join(entry.parentPath ?? styleRoot, entry.name);
    return {
      name: path.relative(styleRoot, absolute),
      css: readFileSync(absolute, "utf8"),
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name));

const tokensEntry = stylesheets.find((sheet) => sheet.name === TOKENS_FILE);
if (!tokensEntry) {
  throw new Error(
    `Nie znalazłem ${TOKENS_FILE} w ${styleRoot}; bramka nie ma czym rozwiązać ` +
      "ani jednego tokenu.",
  );
}

// Komentarze lecą PRZED parsowaniem. Uwaga na odwrotną pułapkę tego repo:
// `css-token-lint` czyta arkusz RAZEM z komentarzami, więc fraza wyglądająca
// jak odwołanie do nieistniejącego tokenu, napisana w prozie, wywala TAMTĄ
// bramkę. Tutaj komentarz nie może wpłynąć na pomiar, ale to nie znaczy, że
// wolno go w arkuszu napisać dowolnie.
//
// PRZEŁAMANIA LINII ZOSTAJĄ. Komentarz zamieniony na pusty napis przesuwa
// wszystko pod nim: pierwsza wersja tej bramki wskazała `.nav-count--attention`
// na `styles.css:1085`, a reguła stoi w wierszu 1254 — różnica jest dokładnie
// sumą komentarzy nad nią. Bramka wskazująca nie ten wiersz każe człowiekowi
// szukać defektu ręcznie i podważa własny raport.
const withoutComments = (css) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));

const { themeTokens, resolve, colorOf } = tokenSheet({
  css: withoutComments(tokensEntry.css),
  sourcePath: path.join(styleRoot, TOKENS_FILE),
});

const THEMES = ["dark", "light"];
// Podłoża, na których składane są tła z alfą — te same dwa, co w bramce
// tokenowej, i z tego samego powodu: arkusz nie mówi, na czym reguła siedzi,
// więc mierzone są OBA kryjące plany czytania, a nie zgadywany jeden.
const BACKDROPS = ["--surface-canvas", "--surface-content"];

// ── CO JEST WYŁĄCZONE Z PRZELOTU I DLACZEGO ─────────────────────────────────
// `@media (forced-colors: active)` maluje słowami kluczowymi systemu
// (`CanvasText`, `Canvas`, `Highlight`), których wartości dostarcza SYSTEM
// OPERACYJNY, a nie ten arkusz. Kontrast w tym trybie jest poza gestią produktu
// i WCAG go tu nie wiąże. Dziś ani jedna reguła w tych blokach nie deklaruje
// jednocześnie tła i tekstu, więc bez tego wyłączenia bramka przechodziłaby
// PRZEZ PRZYPADEK — a pierwsza taka reguła wywaliłaby ją z powodu, który nie
// jest defektem. Wyłączenie jest NAZWANE, nie milczące.
//
// DRUGIE WYŁĄCZENIE, KTÓREGO DZIŚ NIE MA I MUSI ZOSTAĆ NAPISANE. Reguła
// z wnętrza `@media (prefers-color-scheme: dark)` obowiązuje w JEDNYM motywie,
// a ten przelot mierzy każdą znalezioną regułę w OBU — więc taki blok
// wyprodukowałby parę, która nigdy się nie maluje, i mógłby pójść w dowolną
// stronę (fałszywa czerwień albo fałszywa zieleń). Sprawdzone 2026-08-07:
// w `packages/desktop-ui/src` nie ma ANI JEDNEGO takiego bloku — motyw jedzie
// atrybutem `data-theme`, który ustawia `main.tsx`. Gdy pierwszy się pojawi,
// trzeba go BRAMKOWAĆ MOTYWEM, a nie dodawać do wyłączeń: to jest farba
// produktu, tylko obowiązująca warunkowo.
const IGNORED_AT_RULE = /^@media[^{]*forced-colors/i;
const DESCENDABLE_AT_RULE = /^@(media|supports|container|layer|scope)\b/i;

/**
 * Reguły arkusza, z zejściem w at-reguły warunkowe. `@keyframes` i reszta
 * at-reguł nie są podmiotem: ich „selektory" to procenty albo nazwy, nie
 * elementy, i nie ma tam czego pytać o kontrast.
 */
// `lineBase` przenosi numerację przez zejście w at-regułę: bez niego reguła
// wewnątrz `@media` dostawałaby numer liczony od początku CIAŁA tej at-reguły,
// czyli wskazywałaby na plik w miejscu, gdzie nic nie ma.
const rulesOf = (css, onRule, context = [], lineBase = 0) => {
  let depth = 0;
  let start = 0;
  let bodyStart = -1;
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      depth += 1;
      if (depth === 1) bodyStart = index + 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        const rawPrelude = css.slice(start, bodyStart - 1);
        const prelude = rawPrelude.trim();
        const body = css.slice(bodyStart, index);
        // Wiersz liczony od PIERWSZEGO ZNAKU SELEKTORA, nie od końca poprzedniej
        // reguły: między nimi stoi komentarz (nad `.nav-count--attention` ma
        // dwanaście wierszy), a numer wskazujący na komentarz posyła człowieka
        // w złe miejsce równie skutecznie jak brak numeru.
        const preludeStart =
          start + (rawPrelude.length - rawPrelude.trimStart().length);
        if (prelude.startsWith("@")) {
          if (
            !IGNORED_AT_RULE.test(prelude) &&
            DESCENDABLE_AT_RULE.test(prelude)
          ) {
            rulesOf(
              body,
              onRule,
              [...context, prelude.replace(/\s+/g, " ")],
              lineBase + css.slice(0, bodyStart).split("\n").length - 1,
            );
          }
        } else if (prelude !== "") {
          onRule({
            selector: prelude.replace(/\s+/g, " "),
            body,
            context,
            line: lineBase + css.slice(0, preludeStart).split("\n").length,
          });
        }
        start = index + 1;
      }
    }
  }
};

/** Deklaracje `właściwość: wartość` z ciała reguły, W KOLEJNOŚCI ŹRÓDŁA. */
const declarationsOf = (body) => {
  const declarations = [];
  let depth = 0;
  let start = 0;
  const push = (chunk) => {
    const text = chunk.trim();
    // Ciało zagnieżdżonej reguły (gdyby kiedyś powstało) nie jest deklaracją.
    if (text === "" || text.includes("{")) return;
    const colon = text.indexOf(":");
    if (colon < 0) return;
    declarations.push([
      text.slice(0, colon).trim().toLowerCase(),
      text
        .slice(colon + 1)
        .trim()
        .replace(/\s+/g, " "),
    ]);
  };
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "(" || character === "{") depth += 1;
    else if (character === ")" || character === "}") depth -= 1;
    else if (character === ";" && depth === 0) {
      push(body.slice(start, index));
      start = index + 1;
    }
  }
  push(body.slice(start));
  return declarations;
};

// ── ROZWIĄZYWANIE WARTOŚCI KONSUMENTA ───────────────────────────────────────
//
// Cztery odpowiedzi, nie dwie. „Nie ma tu farby" (`transparent`, `none`) to co
// innego niż „jest farba, ale nie umiem jej ustalić" (`inherit`, `currentColor`)
// i co innego niż „jest farba w kształcie, którego moja matematyka nie bierze"
// (`color-mix`, tło wielowarstwowe). Zlanie ich w jedno wiadro „pominięte"
// zamieniłoby listę „czego nie zmierzyłem" w listę, z której nic nie wynika.
// Czwarta odpowiedź — GRADIENT ROZŁOŻONY NA STOPNIE — powstała 2026-08-07 i ma
// własny akapit niżej.
const NOT_PAINTED = new Set(["transparent", "none"]);
const NOT_STATIC = new Set([
  "inherit",
  "currentcolor",
  "unset",
  "initial",
  "revert",
  "revert-layer",
]);
const SINGLE_VAR = /^var\(\s*(--[a-zA-Z0-9-]+)\s*\)$/;
const VAR_WITH_FALLBACK = /^var\(\s*(--[a-zA-Z0-9-]+)\s*,([\s\S]*)\)$/;

// ── GRADIENT: KAŻDY JEGO STOPIEŃ JEST FARBĄ, KTÓRĄ TEKST MOŻE PRZYKRYĆ ──────
//
// Do 2026-08-07 gradient wypadał z pomiaru jako „kształt spoza matematyki
// koloru" i siedział w zamkniętym zbiorze niżej — a ten zbiór pinuje SUROWY
// TEKST wartości. To znaczyło dokładnie tyle: podmiana stopnia na inny token
// wywalała asercję, ale PRZESTROJENIE wartości stopnia w `tokens.css` już nie,
// i żaden pomiar nie liczył wynikającego stosunku. Kafel przestrzeni
// (`styles.css`, selektor `.workspace-avatar`) niesie przy tym PRAWDZIWĄ
// LITERĘ — inicjał nazwy przestrzeni, `RealApp.tsx` — więc wiąże go ten sam
// próg co każdy inny napis. Wyjątek zdjęty z zamkniętego zbioru zamiast
// poszerzony: to jest różnica między „wiem o tym" a „mierzę to".
//
// MIERZONY JEST KAŻDY ZADEKLAROWANY STOPIEŃ, a asercja i tak pyta o najgorszy,
// bo próg wiąże każdy punkt kafla, a nie jego średnią. Że najgorszy punkt LEŻY
// W STOPNIU, a nie między stopniami: przeglądarka interpoluje odcinek między
// dwoma sąsiednimi stopniami kanał po kanale (z premnożoną alfą), więc na
// odcinku każda składowa biegnie monotonicznie, a za nią luminancja — ekstremum
// siada na końcu odcinka. Dla rampy o JEDNYM odcieniu i malejącej jasności,
// a taka jest tutaj, to jest ścisłe. Gradient przez pół koła odcienia
// przestałby to spełniać i wtedy trzeba by odcinek PRÓBKOWAĆ; dziś próbkowanie
// mierzyłoby punkty, których w arkuszu nie ma.
//
// CZEGO NIE ROZKŁADAM I DLACZEGO — każda z tych odmów wraca IMIENNIE na listę
// niepokrytych, żadna nie milczy:
//   * TŁO WIELOWARSTWOWE (`--capture-bg` → gradient NA kolorze). Dolna warstwa
//     prześwituje przez alfę górnej; policzenie tego to złożenie warstwa po
//     warstwie, a potem dopiero na planie czytania. Rozkładanie samej górnej
//     warstwy dałoby kolor, którego nikt nie widzi — czyli fałszywą zieleń,
//     najgorszy możliwy tryb awarii tej bramki. Dlatego podział na warstwy
//     idzie PRZED rozpoznaniem gradientu.
//   * WSZYSTKO POZA `linear-gradient()`: promienisty, stożkowy, powtarzalny.
//     Ich stopnie są tak samo kolorami, ale ani jeden nie stoi dziś w parze
//     tło × tekst, a gałąź bez wykonania jest gałęzią bez dowodu.
//   * GRADIENT, KTÓREGO CHOĆ JEDEN STOPIEŃ SIĘ NIE ROZKŁADA (`color-mix`,
//     obraz, nieznany kształt) — CAŁY. Zmierzenie połowy stopni jest
//     nieodróżnialne od zmierzenia wszystkich i to jest ta sama fałszywa
//     zieleń, tylko cichsza.
//   * GRADIENT W `color` (czyli `background-clip: text`). W tym repo nie ma ani
//     jednej takiej reguły, więc rozkładany jest WYŁĄCZNIE background.

/** Podział napisu na granicach NA GŁĘBOKOŚCI ZERO nawiasów. */
const splitOutsideParens = (text, isSeparator) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (depth === 0 && isSeparator(character)) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part !== "");
};

const AT_COMMA = (character) => character === ",";
// Literał tokenu przychodzi z `tokens.css` NIEZNORMALIZOWANY, więc bywa
// wielowierszowy — separatorem jest każdy biały znak, nie sama spacja.
const AT_SPACE = (character) => /\s/.test(character);

const LINEAR_GRADIENT = /^linear-gradient\(([\s\S]*)\)$/i;
// Pierwszy argument, który NIE jest stopniem: kąt, „to bottom right",
// przestrzeń interpolacji. Tylko na pierwszej pozycji — dalej byłby błędem
// składni, a nie czymś do pominięcia.
const GRADIENT_CONFIGURATION = /^(to\s|in\s|[-+.\d]+(deg|grad|rad|turn)$)/i;
// Pozycja stopnia albo podpowiedź interpolacji. Żaden zapis koloru nie ma tego
// kształtu, więc obcięcie ogona nie może zjeść farby.
const STOP_POSITION =
  /^[-+.\d]+(%|px|rem|em|ch|ex|vw|vh|vmin|vmax|pt|pc|cm|mm|in|q)?$/i;

/**
 * Wartość tła → `{ stops }` albo `{ reason }`. `resolveStop` jest wstrzyknięte,
 * żeby stopień przechodził DOKŁADNIE TĄ SAMĄ ścieżką co każda inna wartość
 * (`var(--x)`, `var(--x, zapas)`, literał) — drugi parser tego samego wejścia
 * jest w tym repo nazwaną klasą defektu.
 */
const decomposeGradient = (literal, resolveStop) => {
  const layers = splitOutsideParens(literal, AT_COMMA);
  if (layers.length !== 1) {
    return {
      reason: `tło wielowarstwowe (${layers.length} warstwy) — dolna prześwituje przez alfę górnej`,
    };
  }
  const gradient = LINEAR_GRADIENT.exec(layers[0]);
  if (!gradient) return { reason: "nie jest pojedynczym `linear-gradient()`" };

  const stops = [];
  const parts = splitOutsideParens(gradient[1], AT_COMMA);
  for (const [index, part] of parts.entries()) {
    if (index === 0 && GRADIENT_CONFIGURATION.test(part)) continue;
    // CSS dopuszcza DWIE pozycje na jednym stopniu (`czerwony 20% 40%`).
    let chunks = splitOutsideParens(part, AT_SPACE);
    while (chunks.length > 1 && STOP_POSITION.test(chunks.at(-1))) {
      chunks = chunks.slice(0, -1);
    }
    // Sama pozycja bez farby to podpowiedź interpolacji — nie ma czego mierzyć,
    // i to NIE jest powód, żeby odrzucić cały gradient.
    if (chunks.length === 1 && STOP_POSITION.test(chunks[0])) continue;
    const text = chunks.join(" ");
    const resolved = resolveStop(text);
    if (resolved.kind !== "color") {
      return {
        reason: `stopień „${text}" nie jest kolorem, który umiem rozłożyć (${resolved.kind})`,
      };
    }
    stops.push({ text, color: resolved.color });
  }
  if (stops.length === 0) {
    return { reason: "ani jeden argument nie okazał się stopniem-kolorem" };
  }
  return { stops };
};

/**
 * Wartość CSS z arkusza powierzchni → `{ kind, ... }`.
 *
 * `var(--x, zapas)` jest rozwijany TUTAJ, a nie we wspólnym `css-tokens.mjs`:
 * `tokens.css` nie ma ani jednej wartości zapasowej, więc dołożenie tego tam
 * rozszerzyłoby zachowanie zielonej bramki po to, żeby obsłużyć wejście,
 * którego ona nigdy nie dostaje. Zapas rozwiązuje strona, która go ma.
 */
//
// DWA RÓŻNE NIEPOWODZENIA TOKENU, NIE JEDNO. „Motyw nie definiuje `--x`" jest
// awarią KONTRAKTU (asertowana na pusto niżej), a „`--x` rozwiązuje się do
// gradientu" jest znanym KSZTAŁTEM, którego matematyka koloru nie bierze
// (zamknięta lista). Zlane w jedno wiadro, pierwsze z nich schowałoby się za
// drugim — a to jest różnica między martwym tokenem a świadomą luką.
//
// `decompose` mówi „to jest TŁO", a nie „spróbuj mocniej": tylko tło wolno
// rozłożyć na stopnie gradientu. Stopnie rozwiązują się z tą flagą OPUSZCZONĄ,
// więc gradient w gradiencie nie zapętla rekursji, tylko wraca jako
// nierozłożony i unieważnia całość.
const fromToken = (tokens, name, themeName, decompose) => {
  let resolved;
  try {
    resolved = resolve(tokens, name, themeName);
  } catch (cause) {
    return { kind: "undefined-token", value: name, reason: cause.message };
  }
  try {
    return {
      kind: "color",
      color: {
        ...parseColor(resolved.literal),
        token: name,
        literal: resolved.literal,
      },
    };
  } catch {
    // Kluczem zamkniętej listy jest NAZWA TOKENU, nie jego literał: `--capture-bg`
    // rozwija się do DWÓCH różnych teł wielowarstwowych (po jednym na motyw),
    // więc lista pinowana literałem musiałaby wymieniać oba i gniłaby przy
    // każdym przestrojeniu farby, o które nikt tej bramki nie pyta.
    return {
      ...shapeOrGradient(tokens, resolved.literal, themeName, decompose),
      key: name,
    };
  }
};

// Jedna decyzja „stopnie albo imienna odmowa", wołana z obu miejsc, w których
// wartość okazała się nie-kolorem. Rozdzielona na dwa miejsca milczałaby
// osobno w każdym z nich.
const shapeOrGradient = (tokens, literal, themeName, decompose) => {
  if (!decompose) {
    return {
      kind: "unsupported-shape",
      value: literal,
      reason: "kształt spoza matematyki koloru; TEKST nie jest rozkładany",
    };
  }
  const gradient = decomposeGradient(literal, (stop) =>
    resolveValue(tokens, stop, themeName, false),
  );
  return gradient.stops
    ? { kind: "gradient", value: literal, stops: gradient.stops }
    : { kind: "unsupported-shape", value: literal, reason: gradient.reason };
};

const resolveValue = (tokens, rawValue, themeName, decompose) => {
  const value = rawValue.trim();
  const lower = value.toLowerCase();
  if (NOT_PAINTED.has(lower)) return { kind: "not-painted", value };
  if (NOT_STATIC.has(lower)) return { kind: "not-static", value };

  const single = SINGLE_VAR.exec(value);
  if (single) return fromToken(tokens, single[1], themeName, decompose);

  const fallback = VAR_WITH_FALLBACK.exec(value);
  if (fallback) {
    const head = fromToken(tokens, fallback[1], themeName, decompose);
    // Token zdefiniowany → zapas jest martwy, dokładnie jak w przeglądarce.
    // Dopiero token NIEZDEFINIOWANY oddaje głos wartości zapasowej.
    return head.kind === "undefined-token"
      ? resolveValue(tokens, fallback[2], themeName, decompose)
      : head;
  }

  try {
    return {
      kind: "color",
      color: { ...parseColor(value), token: value, literal: value },
    };
  } catch {
    return {
      ...shapeOrGradient(tokens, value, themeName, decompose),
      key: value,
    };
  }
};

// ── PODMIOT: SELEKTOR I JEGO BAZA ───────────────────────────────────────────
//
// „Dziedziczy w sposób dający się ustalić statycznie" jest tu zawężone do
// JEDNEGO kształtu, bo tylko ten daje się rozstrzygnąć z arkusza: reguła stanu
// (`.x:hover`, `.x[aria-selected="true"]`, `.x::before`) dziedziczy po regule
// SWOJEJ BAZY (`.x`) w TYM SAMYM pliku. Dziedziczenie po przodku w DOM-ie nie
// jest statycznie rozstrzygalne i tu się go NIE ZGADUJE.
//
// Warunek „DOKŁADNIE JEDNA reguła bazy deklaruje tę własność" jest istotą, nie
// ostrożnością: przy dwóch kandydatach wybór którejkolwiek jest zgadywaniem,
// a para zgadnięta źle jest nieodróżnialna od pary zgadniętej dobrze. Reguła
// z dwoma kandydatami idzie do NIEPOKRYTYCH.
const STATE_SUFFIX = /(:[a-zA-Z-]+(\([^)]*\))?|\[[^\]]*\])+$/;
const PSEUDO_ELEMENT = /::[a-zA-Z-]/;

const baseSelectorOf = (selector) => {
  // PSEUDOELEMENT NIE DZIEDZICZY TEKSTU, KTÓRY WIDAĆ. `::before` i `::after`
  // to osobne pudełka, a ich treścią jest `content` — w tym repo prawie zawsze
  // pusty napis, bo są KROPKĄ albo PODKREŚLENIEM, nie tekstem. Wnioskowanie
  // koloru z bazy dało tu dwa fałszywe alarmy naraz (`.state::before` na
  // `--status-success` = 1,07:1 i `.shell-tab.active::after` na `--accent`
  // = 3,38:1) — obie „pary" mierzą tekst, którego tam nie ma. Reguła
  // pseudoelementu, która SAMA deklaruje `color`, jest dalej mierzona wprost:
  // wtedy autor powiedział, że coś tam pisze.
  if (PSEUDO_ELEMENT.test(selector)) return null;
  // Ostatni złożony selektor listy — to on nazywa mierzony element.
  const compound = selector.split(/\s*[>+~]\s*|\s+/).pop() ?? "";
  const base = compound.replace(STATE_SUFFIX, "");
  return base === "" || base === compound ? null : base;
};

const splitSelectorList = (selector) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(selector.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts.filter((part) => part !== "");
};

// Nieaktywna kontrolka jest wymieniona w SC 1.4.3 („Incidental") jako wyjątek
// od progu 4,5 — i tutaj, w przeciwieństwie do warstwy tokenów, DA SIĘ z tego
// skorzystać uczciwie, bo to SELEKTOR nazywa stan, a nie nazwa tokenu.
//
// TO NIE JEST SPRZECZNOŚĆ Z `status-contrast.test.mjs:1450-1455`, które ten sam
// wyjątek świadomie ODRZUCA. Tamta bramka pyta o TOKEN `--text-disabled`,
// a ten token maluje w tym repo także treść ŻYWĄ (`.amountNone`, `.state_none`,
// ikonę aktywnego wiersza, kropkę jako `background`) — więc na warstwie tokenu
// wyjątek nie przysługuje. Ta bramka pyta o REGUŁĘ, a reguła `.submit:disabled`
// mówi wprost, że komponent jest nieaktywny. Dwie bramki, pozornie sprzeczne
// decyzje, obie poprawne. Bez tej noty ktoś „naprawi" jedną z nich.
//
// Wiersze zwolnione są MIERZONE I WYPISANE — zwolnienie zdejmuje asercję,
// nie pomiar.
const INACTIVE_COMPONENT =
  /(:disabled|\[disabled\]|\[aria-disabled=["']?true["']?\])/;

// ── DRUGIE ZWOLNIENIE: CZYSTA DEKORACJA, WYPISANA Z IMIENIA ────────────────
//
// WCAG 2.x SC 1.4.3 wiąże TEKST. Rysunek, który jest wycięty z drzewa
// dostępności (`aria-hidden="true"`) i stoi obok tej samej treści napisanej
// literami, nie jest tekstem i progu nie dotyka. TA BRAMKA NIE UMIE TEGO
// ZOBACZYĆ SAMA: czyta arkusze, a `aria-hidden` jest atrybutem w JSX. Wyjątek
// musi więc być JAWNY — i musi PAŚĆ, kiedy przestanie mieć pokrycie, bo
// wyjątek, który po cichu przeżywa usunięcie swojego podmiotu, jest kolejnym
// kłamiącym przyrządem.
//
// DLACZEGO OSOBNY ZNACZNIK, A NIE `exempt`: zbiór zwolnionych wierszy pod
// progiem jest zamknięty i jego komunikat mówi „bo jego kontrolka jest
// nieaktywna". Dorzucenie tam dekoracji zamieniłoby tamten komunikat
// w nieprawdę. Dwa różne powody, dwa różne zbiory, dwa różne bloki wypisu.
//
// DWA NIEZALEŻNE POWODY na jeden wyjątek, i wystarczy każdy z osobna: znak
// marki NIE NIESIE ŻADNEGO TEKSTU (to `<svg>` z kółkami i kreskami malowanymi
// `currentColor`, `components/BrandMark.tsx`), a do tego jest wycięty
// z drzewa dostępności i stoi obok wypisanej nazwy produktu
// (`RealApp.tsx:1746-1747`, `.brand-row strong` = „Constellation").
// SPRAWDZANE JEST TO, CO DA SIĘ SPRAWDZIĆ: obecność atrybutu przy tej klasie.
// „Nazwa stoi obok" jest twierdzeniem o drzewie DOM i zostaje prozą.
const DECORATIVE_EXEMPTIONS = [
  {
    sheet: "styles.css",
    selector: ".brand-mark",
    source: "components/BrandMark.tsx",
    className: "brand-mark",
    reason:
      'znak marki: `<svg aria-hidden="true">` bez treści tekstowej, obok wypisanej nazwy produktu',
  },
];
// Klucz jest PARĄ arkusz + DOKŁADNY selektor. Reguła potomna
// (`.center-state .brand-mark`) zwolnienia NIE DZIEDZICZY: dziś nie deklaruje
// tła, więc nie jest mierzona, a gdyby zaczęła, ma trafić tutaj świadomie.
const decorativeKey = (sheet, selector) => `${sheet}|${selector}`;
const DECORATIVE_KEYS = new Set(
  DECORATIVE_EXEMPTIONS.map((entry) =>
    decorativeKey(entry.sheet, entry.selector),
  ),
);

// ── STOS POWIERZCHNI ODZIEDZICZONY PO PRZODKU W DOM-IE ──────────────────────
//
// PO CO. Reguła, która deklaruje SAM KOLOR, wpada wyżej do `declaredColorOnly`
// (dziś 799 reguł) i nie jest mierzona nigdzie. Dla większości z nich to jest
// uczciwa odpowiedź: `baseSelectorOf` umie wywieść tło tylko z reguły BAZY
// w tym samym pliku, a dziedziczenie po PRZODKU W DOM-ie nie jest z arkusza
// rozstrzygalne. Ale „nie z arkusza" nie znaczy „nie da się" — plan powierzchni
// jest w tej aplikacji deklarowany TOKENEM, a układ przodków stoi w JSX-ie,
// który da się przeczytać i wypisać RĘKĄ. Ta tabela jest tym wypisem.
//
// Powstała dla PIĘCIU reguł akcentu dołożonych przez loty 2–4 Fazy 3
// (`.basisLink`, `.offerState[data-offer-state="submitted"]`, `.eventAgent`,
// `.badgeMention`, `.markAgent`). Każda z nich maluje pismo akcentem i ani
// jedna nie była mierzona — ani tutaj (bo nie deklaruje tła), ani przez bramkę
// tokenową (bo akcent nie tworzy rodziny `--X-bg`/`--X-text`).
//
// CZYM TA TABELA NIE JEST. Nie jest zwolnieniem i nie jest deklaracją wyniku.
// Wnosi WYŁĄCZNIE odpowiedź na pytanie „na czym to stoi", a liczbę wylicza ta
// sama matematyka, co dla każdego innego konsumenta. Cena tej wiedzy to
// RĘCZNY WPIS, więc każdy wpis jest obudowany kontrolami, które go zabijają,
// kiedy przestanie być prawdziwy (test „STOS NAZWANY ma pokrycie w kodzie"):
//   1. reguła-cel ISTNIEJE w tym arkuszu i deklaruje `color`;
//   2. reguła-cel NIE MALUJE własnego tła — inaczej wpis nadpisywałby prawdziwy
//      pomiar swoim twierdzeniem, co jest najgorszym trybem awarii tej bramki;
//   3. każda warstwa NAZWANA selektorem naprawdę deklaruje w tym arkuszu
//      DOKŁADNIE tę wartość tła (nie „jakieś" — dokładnie tę);
//   4. każda nazwa klasy z uzasadnienia stoi w podanym pliku JSX;
//   5. wpis daje wiersze pomiaru w OBU motywach.
// Czego kontrole NIE sprawdzają, powiedziane wprost: KOLEJNOŚCI ZAGNIEŻDŻENIA
// w drzewie DOM. To jest twierdzenie o JSX-ie, nie o arkuszu, i zostaje prozą —
// dokładnie jak „nazwa stoi obok" przy zwolnieniu dekoracyjnym wyżej.
//
// STOS, NIE JEDNA WARSTWA, i to jest cała lekcja tego lotu. Reszta tej bramki
// składa tło z alfą na DWÓCH kryjących planach czytania i na tym kończy —
// a `.basisLink` stoi na laserunku akcentu, NA podbarwieniu stanu wiersza,
// NA kryjącym tle listy. Trzy warstwy. Dwuwarstwowy pomiar dawał 5,02:1
// i tak właśnie ta reguła została opisana w arkuszu; trzywarstwowy daje
// 4,18:1 i jest PONIŻEJ progu. Pomiar zatrzymany o jedną warstwę za wcześnie
// nie jest ostrożny, tylko fałszywie spokojny.
//
// Warstwy idą OD DOŁU. `from` nazywa regułę z TEGO SAMEGO arkusza, która tę
// warstwę deklaruje; `plane: true` znaczy „w tym arkuszu nie maluje jej nic,
// więc pod spodem jest goły plan czytania" i rozwija się na KAŻDY z `BACKDROPS`,
// czyli tak samo, jak ta bramka robi to od początku dla tła z alfą.
const INHERITED_SURFACES = [
  {
    sheet: "renewals/renewals.module.css",
    selector: ".basisLink",
    source: "renewals/RenewalsSurface.tsx",
    classNames: ["basisLink", "outlookReal", "row", "rowSelected", "list"],
    reason:
      "wyjście z wiersza odnowienia; oba jego miejsca stoją w `.row` na `.list`, " +
      "a pierwsze dodatkowo pod laserunkiem `.outlookReal`",
    stacks: [
      {
        label: "w plakietce, wiersz spokojny",
        layers: [
          { value: "var(--surface-content)", from: ".list" },
          { value: "var(--accent-quieter)", from: ".outlookReal" },
        ],
      },
      {
        label: "w plakietce, wiersz pod kursorem",
        layers: [
          { value: "var(--surface-content)", from: ".list" },
          { value: "var(--surface-hover)", from: ".row:hover" },
          { value: "var(--accent-quieter)", from: ".outlookReal" },
        ],
      },
      {
        label: "w plakietce, wiersz bieżący",
        layers: [
          { value: "var(--surface-content)", from: ".list" },
          { value: "var(--surface-selected)", from: ".rowSelected" },
          { value: "var(--accent-quieter)", from: ".outlookReal" },
        ],
      },
      {
        label: "przy aneksie, wiersz spokojny",
        layers: [{ value: "var(--surface-content)", from: ".list" }],
      },
      {
        label: "przy aneksie, wiersz pod kursorem",
        layers: [
          { value: "var(--surface-content)", from: ".list" },
          { value: "var(--surface-hover)", from: ".row:hover" },
        ],
      },
      {
        label: "przy aneksie, wiersz bieżący",
        layers: [
          { value: "var(--surface-content)", from: ".list" },
          { value: "var(--surface-selected)", from: ".rowSelected" },
        ],
      },
    ],
  },
  {
    sheet: "opportunity/opportunity-record.module.css",
    selector: '.offerState[data-offer-state="submitted"]',
    source: "opportunity/OpportunityRecordScreen.tsx",
    classNames: ["offerState"],
    reason:
      "stan oferty na ekranie rekordu szansy; `.offer` i `.offerHead` nie malują " +
      "tła, a ten arkusz nie ma pod nimi ŻADNEJ reguły z tłem — karta leży na planie",
    stacks: [{ label: "na planie ekranu", layers: [{ plane: true }] }],
  },
  {
    sheet: "record/record-panels.module.css",
    selector: ".eventAgent",
    source: "record/RecordActivityPanel.tsx",
    classNames: ["eventAgent"],
    reason:
      "plakietka agenta w strumieniu aktywności; nagłówek tego arkusza mówi wprost, " +
      "że te trzy panele leżą bezpośrednio na płótnie, bez karty i bez tła panelu",
    stacks: [{ label: "na planie ekranu", layers: [{ plane: true }] }],
  },
  {
    sheet: "record/record-comments.module.css",
    selector: ".badgeMention",
    source: "record/RecordCommentsPanel.tsx",
    classNames: ["badgeMention", "entry", "entryAgent"],
    reason:
      "plakietka wzmianki w stopce komentarza; stoi na karcie ludzkiej " +
      "(`--surface-content`, kryjące) albo na karcie agenta (laserunek nad planem)",
    stacks: [
      {
        label: "na karcie człowieka",
        layers: [{ value: "var(--surface-content)", from: ".entry" }],
      },
      {
        label: "na karcie agenta",
        layers: [
          { plane: true },
          { value: "var(--accent-quieter)", from: ".entryAgent" },
        ],
      },
    ],
  },
  {
    sheet: "record/record-comments.module.css",
    selector: ".markAgent",
    source: "record/RecordCommentsPanel.tsx",
    classNames: ["markAgent", "entryAgent"],
    reason:
      "znacznik agenta; sam odbiera sobie wypełnienie (`background: none`), więc " +
      "widać przez niego kartę agenta — a ta nosi laserunek nad planem",
    stacks: [
      {
        label: "na karcie agenta",
        layers: [
          { plane: true },
          { value: "var(--accent-quieter)", from: ".entryAgent" },
        ],
      },
    ],
  },
];

// ── ZBIÓR KONSUMENTÓW ───────────────────────────────────────────────────────
//
// Zebrany RAZ, poza pętlą mierzącą, żeby liczby, którymi asertuję pokrycie,
// nie brzmiały „zmierzyłem tyle, ile zmierzyłem".
const consumers = [];
const uncoveredBackgrounds = [];
const declaredColorOnly = [];
// Płaska lista WSZYSTKICH reguł, potrzebna do asercji o KSZTAŁCIE reguły
// (a nie o kontraście pary) niżej. Zbierana w tej samej pętli, żeby nie
// rozkładać arkuszy drugi raz inną ścieżką kodu — dwa parsery tego samego
// wejścia to znana z tego repo klasa defektu.
const allRules = [];

for (const sheet of stylesheets) {
  const collected = [];
  rulesOf(withoutComments(sheet.css), (rule) => collected.push(rule));

  // Indeks „selektor bazy → reguły, które go deklarują" w OBRĘBIE PLIKU.
  const byExactSelector = new Map();
  for (const rule of collected) {
    const declarations = declarationsOf(rule.body);
    const colorDeclaration = declarations
      .filter(([property]) => property === "color")
      .at(-1);
    // `background` (skrót) resetuje `background-color`, więc o tło pyta się
    // OSTATNIĄ z obu własności w kolejności źródła, nie każdą z osobna.
    const backgroundDeclaration = declarations
      .filter(
        ([property]) =>
          property === "background" || property === "background-color",
      )
      .at(-1);
    rule.color = colorDeclaration?.[1];
    rule.background = backgroundDeclaration?.[1];
    // `opacity` jest zbierane NIE PO TO, ŻEBY JE LICZYĆ, tylko żeby dało się
    // je WYPISAĆ. Przezroczystość elementu blednie tekst RAZEM z jego tłem,
    // więc kontrast pod nią jest inny niż zmierzony — a ta bramka jej nie
    // modeluje. Lista jest niżej, pod „CZEGO TA BRAMKA NIE ZMIERZYŁA".
    rule.opacity = declarations
      .filter(([property]) => property === "opacity")
      .at(-1)?.[1];
    allRules.push({
      sheet: sheet.name,
      where: `${sheet.name}:${rule.line}`,
      selector: rule.selector,
      color: rule.color,
      background: rule.background,
      opacity: rule.opacity,
    });
    for (const selector of splitSelectorList(rule.selector)) {
      if (!byExactSelector.has(selector)) byExactSelector.set(selector, []);
      byExactSelector.get(selector).push(rule);
    }
  }

  const inheritedFrom = (rule, property) => {
    const bases = splitSelectorList(rule.selector)
      .map(baseSelectorOf)
      .filter((base) => base !== null);
    if (bases.length !== 1) return null;
    const candidates = (byExactSelector.get(bases[0]) ?? []).filter(
      (candidate) => candidate !== rule && candidate[property] !== undefined,
    );
    if (candidates.length !== 1) return null;
    return { value: candidates[0][property], from: bases[0] };
  };

  for (const rule of collected) {
    const where = `${sheet.name}:${rule.line}`;
    const subject = `${rule.selector}${rule.context.length > 0 ? ` {${rule.context.join(" ")}}` : ""}`;

    if (rule.background !== undefined && rule.color !== undefined) {
      consumers.push({
        sheet: sheet.name,
        where,
        subject,
        selector: rule.selector,
        background: rule.background,
        color: rule.color,
        origin: "wprost",
      });
      continue;
    }
    if (rule.background !== undefined) {
      const inherited = inheritedFrom(rule, "color");
      if (inherited) {
        consumers.push({
          sheet: sheet.name,
          where,
          subject,
          selector: rule.selector,
          background: rule.background,
          color: inherited.value,
          origin: `tekst z bazy ${inherited.from}`,
        });
      } else if (!NOT_PAINTED.has(rule.background.toLowerCase())) {
        // TO JEST LISTA „TEGO NIE ZMIERZYŁEM" (pozycja P5 briefu, której nie
        // budujemy jako osobnego przyrządu). Reguła maluje tło i NIE DA SIĘ
        // ustalić, jakim kolorem pisze po tym tle — więc nie jest mierzona.
        // Ciche pominięcie zamieniłoby ją w zieleń nie do odróżnienia od pomiaru.
        uncoveredBackgrounds.push({
          sheet: sheet.name,
          where,
          subject,
          background: rule.background,
        });
      }
      continue;
    }
    if (rule.color !== undefined) {
      const inherited = inheritedFrom(rule, "background");
      if (inherited) {
        consumers.push({
          sheet: sheet.name,
          where,
          subject,
          selector: rule.selector,
          background: inherited.value,
          color: rule.color,
          origin: `tło z bazy ${inherited.from}`,
        });
      } else {
        declaredColorOnly.push(where);
      }
    }
  }
}

// ── ROZWIĄZANIE TABELI STOSÓW, POZA PĘTLĄ MIERZĄCĄ ──────────────────────────
//
// Wpisy są zamieniane na CELE (reguła + rozwinięte stosy) TUTAJ, żeby liczba,
// którą asertuję pokrycie, była policzona z TABELI, a nie z pętli, która mierzy.
// Asercja wyprowadzona z tej samej pętli mówiłaby „zmierzyłem tyle, ile
// zmierzyłem" — to jest w tym repo nazwana klasa wadliwego przyrządu.
const inheritedTargets = [];
const inheritedSetupFailures = [];

for (const entry of INHERITED_SURFACES) {
  const rule = allRules.find(
    (candidate) =>
      candidate.sheet === entry.sheet && candidate.selector === entry.selector,
  );
  if (rule === undefined) {
    inheritedSetupFailures.push(
      `${entry.sheet} ${entry.selector} — nie ma takiej reguły w tym arkuszu. ` +
        "Wpis stracił podmiot: usuń go albo popraw selektor.",
    );
    continue;
  }
  if (rule.color === undefined) {
    inheritedSetupFailures.push(
      `${entry.sheet} ${entry.selector} — reguła nie deklaruje już koloru. ` +
        "Wpis nazywa powierzchnię pod pismem, którego tam nie ma.",
    );
    continue;
  }
  if (
    rule.background !== undefined &&
    !NOT_PAINTED.has(rule.background.toLowerCase())
  ) {
    inheritedSetupFailures.push(
      `${entry.sheet} ${entry.selector} — reguła MALUJE własne tło ` +
        `(„${rule.background}"), więc jest mierzona bez tej tabeli. Ręczny wpis ` +
        "nadpisywałby prawdziwy pomiar twierdzeniem i to jest najgorszy tryb " +
        "awarii tej bramki.",
    );
    continue;
  }
  // Warstwa NAZWANA selektorem musi być w tym arkuszu naprawdę zadeklarowana,
  // i to DOKŁADNIE tą wartością. „Jakieś tło" pozwoliłoby wpisowi przeżyć
  // przemalowanie warstwy, czyli dokładnie tę zmianę, o którą tu chodzi.
  let broken = false;
  for (const stack of entry.stacks) {
    for (const layer of stack.layers) {
      if (layer.plane === true) continue;
      const source = allRules.find(
        (candidate) =>
          candidate.sheet === entry.sheet && candidate.selector === layer.from,
      );
      if (source === undefined || source.background !== layer.value) {
        inheritedSetupFailures.push(
          `${entry.sheet} ${entry.selector} / ${stack.label}: warstwa „${layer.from}" ` +
            `miała deklarować background: ${layer.value}, a deklaruje ` +
            `„${source === undefined ? "reguły nie ma" : (source.background ?? "nic")}".`,
        );
        broken = true;
      }
    }
  }
  if (broken) continue;
  // Stos z gołym planem na dnie rozwija się na KAŻDY plan czytania — tak samo,
  // jak ta bramka robi to od początku dla tła z alfą, i z tego samego powodu:
  // arkusz nie mówi, na którym planie leży ekran, więc mierzone są oba.
  const expanded = [];
  for (const stack of entry.stacks) {
    const bottom = stack.layers[0];
    if (bottom?.plane === true) {
      for (const backdrop of BACKDROPS) {
        expanded.push({
          label: `${stack.label} (${backdrop})`,
          layers: [
            { value: `var(${backdrop})`, from: null },
            ...stack.layers.slice(1),
          ],
        });
      }
    } else expanded.push(stack);
  }
  inheritedTargets.push({ ...entry, rule, expanded });
}

// Liczba wierszy WYLICZONA Z TABELI: motywy × rozwinięte stosy.
const expectedInheritedRows =
  THEMES.length *
  inheritedTargets.reduce((sum, target) => sum + target.expanded.length, 0);

// ── POMIAR ──────────────────────────────────────────────────────────────────
const measurements = [];
const inheritedUnmeasurable = [];
const notPainted = [];
const notStatic = [];
const unsupportedShapes = [];
const unresolvable = [];
const alphaText = [];
// Gradienty ROZŁOŻONE — czyli lista tego, co bramka zaczęła widzieć. Bez niej
// asercja o kurczącym się zbiorze kształtów nierozłożonych dowodziłaby tylko
// tego, że coś z niego wypadło, a nie tego, że zostało ZMIERZONE.
const decomposedGradients = [];

for (const themeName of THEMES) {
  const tokens = themeTokens(themeName);
  const backdrops = BACKDROPS.map((name) => {
    const backdrop = colorOf(tokens, name, themeName);
    if (backdrop.alpha !== 1) {
      throw new Error(
        `Motyw „${themeName}": ${backdrop.token} = „${backdrop.literal}" nie jest ` +
          "kryjące, więc nie ma na czym składać teł z alfą. Zgłoś to, nie zgaduj.",
      );
    }
    return backdrop;
  });

  for (const consumer of consumers) {
    const background = resolveValue(
      tokens,
      consumer.background,
      themeName,
      true,
    );
    const text = resolveValue(tokens, consumer.color, themeName, false);
    const label = `${consumer.where} ${consumer.subject}`;

    for (const [role, resolved] of [
      ["tło", background],
      ["tekst", text],
    ]) {
      if (resolved.kind === "not-painted")
        notPainted.push(`${label} (${role})`);
      else if (resolved.kind === "not-static")
        notStatic.push(`${label} (${role}: ${resolved.value})`);
      else if (resolved.kind === "unsupported-shape")
        unsupportedShapes.push({
          label,
          role,
          key: resolved.key,
          reason: resolved.reason,
        });
      else if (resolved.kind === "undefined-token")
        unresolvable.push(
          `${label} (${role}: ${resolved.value}) — ${resolved.reason}`,
        );
      else if (resolved.kind === "gradient")
        decomposedGradients.push({
          theme: themeName,
          where: consumer.where,
          key: resolved.key,
          stops: resolved.stops.map((stop) => stop.text),
        });
    }
    // FARBA TO LISTA, NIE POJEDYNCZY KOLOR. Zwykłe tło daje listę jednoelementową,
    // gradient — po jednej pozycji na stopień. Pusta lista znaczy „nie zmierzone",
    // a powód poszedł już wyżej na którąś z imiennych list.
    const paints =
      background.kind === "color"
        ? [{ color: background.color, label: consumer.background }]
        : background.kind === "gradient"
          ? background.stops.map((stop) => ({
              color: stop.color,
              label: `stopień ${stop.text} w ${consumer.background}`,
              gradientKey: background.key,
            }))
          : [];
    if (paints.length === 0 || text.kind !== "color") continue;
    if (text.color.alpha !== 1) {
      // Tekst z alfą trzeba by złożyć NA TŁE, a potem porównać Z TYM SAMYM
      // tłem — matematyka jest ta sama, ale dziś takiego konsumenta nie ma,
      // więc gałąź, której nikt nie wykonuje, byłaby kodem bez dowodu.
      alphaText.push(`${label} (${text.color.literal})`);
      continue;
    }

    for (const paint of paints) {
      const surfaces =
        paint.color.alpha === 1
          ? [{ color: paint.color, label: paint.label }]
          : backdrops.map((backdrop) => ({
              color: compositeOver(paint.color, backdrop),
              label: `${paint.label} nad ${backdrop.token}`,
            }));

      for (const surface of surfaces) {
        measurements.push({
          theme: themeName,
          sheet: consumer.sheet,
          where: consumer.where,
          subject: consumer.subject,
          selector: consumer.selector,
          origin: consumer.origin,
          ratio: contrastRatio(text.color, surface.color),
          textValue: consumer.color,
          textLiteral: text.color.literal,
          surfaceLabel: surface.label,
          backgroundLiteral: paint.color.literal,
          gradientKey: paint.gradientKey,
          exempt: INACTIVE_COMPONENT.test(consumer.selector),
          decorative: DECORATIVE_KEYS.has(
            decorativeKey(consumer.sheet, consumer.selector),
          ),
        });
      }
    }
  }

  // ── STOSY NAZWANE ────────────────────────────────────────────────────────
  // Ta sama matematyka, to samo wiadro `measurements` (więc te wiersze podlegają
  // asercji „KAŻDY konsument zdaje AA" jak każdy inny) — różnica jest wyłącznie
  // w tym, SKĄD wiadomo, na czym reguła stoi.
  for (const target of inheritedTargets) {
    const text = resolveValue(tokens, target.rule.color, themeName, false);
    if (text.kind !== "color" || text.color.alpha !== 1) {
      inheritedUnmeasurable.push(
        `${themeName}: ${target.sheet} ${target.selector} — pisma ` +
          `„${target.rule.color}" nie umiem rozłożyć na kryjący kolor (${text.kind}).`,
      );
      continue;
    }
    for (const stack of target.expanded) {
      let surface = null;
      let failed = false;
      for (const layer of stack.layers) {
        const resolved = resolveValue(tokens, layer.value, themeName, false);
        if (resolved.kind !== "color") {
          inheritedUnmeasurable.push(
            `${themeName}: ${target.sheet} ${target.selector} / ${stack.label} — ` +
              `warstwy „${layer.value}" nie umiem rozłożyć (${resolved.kind}).`,
          );
          failed = true;
          break;
        }
        if (surface === null) {
          if (resolved.color.alpha !== 1) {
            inheritedUnmeasurable.push(
              `${themeName}: ${target.sheet} ${target.selector} / ${stack.label} — ` +
                `DNO stosu „${layer.value}" nie jest kryjące, więc nie ma na czym ` +
                "składać reszty. Zgłoś to, nie zgaduj.",
            );
            failed = true;
            break;
          }
          surface = resolved.color;
        } else {
          surface =
            resolved.color.alpha === 1
              ? resolved.color
              : compositeOver(resolved.color, surface);
        }
      }
      if (failed || surface === null) continue;
      measurements.push({
        theme: themeName,
        sheet: target.sheet,
        where: target.rule.where,
        subject: target.selector,
        selector: target.selector,
        origin: `stos nazwany: ${stack.label}`,
        ratio: contrastRatio(text.color, surface),
        textValue: target.rule.color,
        textLiteral: text.color.literal,
        surfaceLabel: stack.layers.map((layer) => layer.value).join(" → "),
        backgroundLiteral: stack.layers.at(-1).value,
        gradientKey: undefined,
        inherited: true,
        exempt: INACTIVE_COMPONENT.test(target.selector),
        decorative: false,
      });
    }
  }
}

const format = (value) => value.toFixed(2);
const sheetsWithMeasurement = new Set(measurements.map((row) => row.sheet));
const inheritedMeasurements = measurements.filter(
  (row) => row.inherited === true,
);

// Cztery arkusze, których brief Fazy 3 nazywa po imieniu jako zagrożone przez
// tę właśnie dziurę (Renewals #1/#5, Library #5/#10, rekord #3, Pipeline #2/#3/#5).
// Podłoga per PLIK, nie tylko globalna: zmiana ścieżki, która przestałaby
// schodzić do `src/renewals/`, obcięłaby pomiar po cichu, a suma dalej
// wyglądałaby okazale.
const AT_RISK_SHEETS = [
  "library/sources.module.css",
  "pipeline/pipeline.module.css",
  "renewals/renewals.module.css",
  "styles.css",
];

// GRANICA WYPISU, WYPROWADZONA Z PROGU, NIE WYMYŚLONA. Wiersz o kontraście
// PODWOJONEGO progu ma sto procent zapasu — żeby spadł pod 4,5:1, musi się
// zdarzyć zmiana farby, a nie poprawka. Takich wierszy jest dziś 574 z 764
// i wypisanie ich co do jednego zamieniłoby raport w ścianę, przez którą nikt
// nie przejdzie (a raport, którego nikt nie czyta, nie różni się od braku
// raportu). Wszystko, co ma choćby cień zapasu mniejszy niż podwójny, jest
// wypisane CO DO WIERSZA, a reszta jest POLICZONA — więc nic nie znika, znika
// tylko powtórzenie.
const PRINT_BELOW = WCAG_AA_NORMAL_TEXT * 2;

test("wypisuje każdy zmierzony wiersz BEZ PODWÓJNEGO ZAPASU, resztę liczy", () => {
  const sorted = measurements
    .slice()
    .sort((left, right) => left.ratio - right.ratio);
  const printed = sorted.filter((row) => row.ratio < PRINT_BELOW);
  const lines = printed.map(
    (row) =>
      `${row.theme.padEnd(5)} ${format(row.ratio).padStart(6)}:1  ` +
      // ZNACZNIK ZWOLNIENIA MUSI POKRYWAĆ OBA POWODY. Wiersz „PONIŻEJ" bez
      // adnotacji w PRZELOCIE ZIELONYM czyta się jak sprzeczność i podważa cały
      // wypis — a kafel dekoracyjny takie wiersze produkuje.
      `${row.ratio >= WCAG_AA_NORMAL_TEXT ? "AA     " : "PONIŻEJ"}${row.exempt ? " (zwolniony)  " : row.decorative ? " (dekoracja)  " : "              "}` +
      `${row.where.padEnd(44)} ${row.subject}  ` +
      `[${row.origin}]  ${row.textValue} = ${row.textLiteral} na ${row.surfaceLabel}`,
  );
  console.log(
    `\nKontrast KONSUMENTÓW (reguła arkusza, nie para tokenów), próg ` +
      `${WCAG_AA_NORMAL_TEXT}:1, WCAG 2.x SC 1.4.3.\n` +
      `Wypisane są wiersze poniżej ${PRINT_BELOW}:1 (${printed.length} z ${measurements.length}); ` +
      `pozostałe ${measurements.length - printed.length} mają co najmniej podwójny zapas:\n` +
      lines.join("\n") +
      `\n\nArkuszy przejrzanych: ${stylesheets.length}; z pomiarem: ` +
      `${sheetsWithMeasurement.size}. Konsumentów: ${consumers.length} ` +
      `(wprost: ${consumers.filter((item) => item.origin === "wprost").length}, ` +
      `przez bazę: ${consumers.filter((item) => item.origin !== "wprost").length}). ` +
      `Wierszy pomiaru: ${measurements.length}.\n`,
  );
  assert.ok(
    lines.length > 0,
    "Nie ma czego wypisać — pomiar konsumentów nie zebrał ani jednego wiersza.",
  );
  // Gdyby granica wypisu zjadła CAŁY zbiór albo NIC z niego nie zjadła, raport
  // przestałby być raportem, a nikt by tego nie zauważył.
  assert.ok(
    printed.length < measurements.length && printed.length > 20,
    `Granica wypisu ${PRINT_BELOW}:1 przepuściła ${printed.length} z ${measurements.length} ` +
      "wierszy — to znaczy, że przestała dzielić zbiór.",
  );
});

test("CZEGO TA BRAMKA NIE ZMIERZYŁA — wypisane, nie przemilczane", () => {
  // Bramka, która nie umie powiedzieć, czego nie zmierzyła, oddaje ciszę jako
  // werdykt. Cztery różne powody, cztery listy — zlane w jedno „pominięte"
  // nie dałoby się z niczego wyprowadzić.
  const byBackground = new Map();
  for (const row of uncoveredBackgrounds) {
    if (!byBackground.has(row.background)) byBackground.set(row.background, []);
    byBackground.get(row.background).push(`${row.where} ${row.subject}`);
  }
  // Konsumenci `--status-*-bg` są WYMIENIENI CO DO REGUŁY, bo to o nich jest
  // pozycja P5 briefu (`.badge_available`, `sources.module.css`, używa POŁOWY
  // pary, a komentarz nad nim twierdzi, że używa całej). Reszta idzie zbiorczo,
  // po tokenie tła: trzysta wierszy z nazwami klas nie niesie więcej informacji
  // niż trzydzieści wierszy z liczbami, a czyta się gorzej.
  const isStatusTint = (value) => /--status-[a-z]+-bg/.test(value);
  const statusTints = [...byBackground.entries()].filter(([value]) =>
    isStatusTint(value),
  );
  console.log(
    "\nNIEPOKRYTE: reguła MALUJE TŁO, a koloru tekstu nie da się ustalić " +
      `statycznie (${uncoveredBackgrounds.length} reguł). To jest lista, którą ` +
      "brief nazywa P5 — nie budujemy jej jako osobnego przyrządu, ale nie wolno " +
      "jej przemilczeć.\n" +
      "  ── konsumenci podbarwienia statusu, WYMIENIENI (podmiot P5) ──\n" +
      statusTints
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([value, where]) => `  ${value}\n    ${where.join("\n    ")}`)
        .join("\n") +
      "\n  ── pozostałe tła bez ustalonego tekstu, zbiorczo ──\n" +
      [...byBackground.entries()]
        .filter(([value]) => !isStatusTint(value))
        .sort((left, right) => right[1].length - left[1].length)
        .map(
          ([value, where]) =>
            `  ${String(where.length).padStart(4)}×  ${value}`,
        )
        .join("\n") +
      `\n\nKSZTAŁT SPOZA MATEMATYKI KOLORU (color-mix, tło wielowarstwowe, ` +
      `gradient nie do rozłożenia): ${unsupportedShapes.length} wystąpień ` +
      `w ${unsupportedShapes.length === 0 ? 0 : new Set(unsupportedShapes.map((row) => row.label)).size} regułach.\n` +
      // KAŻDY Z POWODEM. „Nie umiem" bez odpowiedzi „dlaczego" jest listą,
      // z której nie da się wyprowadzić ani poprawki, ani decyzji.
      [
        ...new Map(
          unsupportedShapes.map((row) => [
            row.key,
            row.reason ?? "powód nienazwany",
          ]),
        ).entries(),
      ]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([key, reason]) => `  ${key}\n    → ${reason}`)
        .join("\n") +
      `\n\nTOKEN, KTÓREGO MOTYW NIE DEFINIUJE: ${unresolvable.length}` +
      (unresolvable.length > 0 ? `\n  ${unresolvable.join("\n  ")}` : "") +
      `\n\nNIE MA FARBY (transparent/none): ${notPainted.length} deklaracji.` +
      `\nNIE DA SIĘ USTALIĆ (inherit/currentColor): ${notStatic.length} deklaracji — ` +
      "reguła z takim TŁEM jest tak samo niezmierzona jak te wyżej." +
      `\nTEKST Z ALFĄ (gałąź niewykonywana): ${alphaText.length}.` +
      `\nDEKLARUJĄ TYLKO TEKST, bez ustalonego tła: ${declaredColorOnly.length} reguł ` +
      `(z tego ${inheritedTargets.length} dostało STOS NAZWANY, patrz osobny test).\n`,
  );

  // ── DWA MECHANIZMY, KTÓRYCH TA BRAMKA NIE MODELUJE ────────────────────────
  //
  // Wypisane, bo obie luki dotykają reguł, które WYGLĄDAJĄ na zmierzone —
  // a to jest gorszy rodzaj dziury niż reguła jawnie nieobjęta.
  //
  // 1. PRZEZROCZYSTOŚĆ ELEMENTU (`opacity`). Blednie tekst RAZEM z jego tłem,
  //    więc kontrast pod nią jest INNY niż zmierzony i zawsze NIŻSZY. Przykład
  //    z tego drzewa, policzony ręcznie tą samą matematyką:
  //    `record/record-comments.module.css` `.entryResolved` niesie
  //    `opacity: 0.6`, więc pismo akcentu na rozstrzygniętym komentarzu wypada
  //    ≈2,6:1 w ciemnym i ≈2,5:1 w jasnym zamiast ponad 5:1 z tabeli wyżej.
  //    Modelowanie tego wymaga wiedzy, przez ILE przodków z alfą element
  //    prześwituje — a to jest pytanie o DOM, nie o arkusz. Lista jest tu po to,
  //    żeby dług był policzalny.
  // 2. STOS GRUBSZY NIŻ DWIE WARSTWY. Poza tabelą `INHERITED_SURFACES` ta
  //    bramka składa tło z alfą na planie czytania i na tym kończy. Reguła
  //    stojąca na laserunku NA podbarwieniu stanu wiersza NA planie jest
  //    mierzona o warstwę za płytko, czyli za korzystnie. To jest dokładnie
  //    defekt, przez który powstała tabela: dwuwarstwowo 5,02:1, trójwarstwowo
  //    4,18:1. Pozostałe reguły w takich miejscach NIE SĄ policzone.
  const dimmed = allRules
    .filter((rule) => rule.opacity !== undefined)
    .filter((rule) => {
      const value = Number.parseFloat(rule.opacity);
      return Number.isFinite(value) && value < 1;
    });
  const byOpacity = new Map();
  for (const rule of dimmed) {
    if (!byOpacity.has(rule.opacity)) byOpacity.set(rule.opacity, []);
    byOpacity.get(rule.opacity).push(`${rule.where} ${rule.selector}`);
  }
  console.log(
    `\nNIEMODELOWANE — PRZEZROCZYSTOŚĆ ELEMENTU: ${dimmed.length} reguł ` +
      "deklaruje `opacity` poniżej 1. Każda z nich blednie pismo RAZEM z tłem, " +
      "więc realny kontrast pod nią jest NIŻSZY niż którakolwiek liczba wyżej:\n" +
      [...byOpacity.entries()]
        .sort((left, right) => Number(left[0]) - Number(right[0]))
        .map(
          ([value, where]) =>
            `  opacity: ${value}\n    ${where.join("\n    ")}`,
        )
        .join("\n") +
      "\n\nNIEMODELOWANE — STOS GRUBSZY NIŻ DWIE WARSTWY: poza tabelą " +
      `INHERITED_SURFACES (${inheritedTargets.length} reguł) każde tło z alfą jest ` +
      "składane WPROST na planie czytania, bez warstw pośrednich. Powód " +
      "istnienia tabeli i miara jej niekompletności naraz.\n",
  );

  assert.deepEqual(
    unresolvable,
    [],
    "Konsumenci odwołujący się do tokenu, którego motyw nie definiuje. To jest " +
      `awaria kontraktu tokenów, nie wynik pomiaru: ${unresolvable.join(" | ")}`,
  );
  assert.ok(
    uncoveredBackgrounds.length > 0,
    "Zero reguł niepokrytych znaczy, że wykrywanie tła bez ustalonego tekstu " +
      "przestało działać — w tym drzewie takie reguły NA PEWNO są " +
      "(`.badge_available` w `library/sources.module.css` jest w briefie nazwana " +
      "po imieniu).",
  );
  // Wykrywanie przezroczystości musi COŚ znajdować, inaczej lista „czego nie
  // modeluję" byłaby pusta z powodu awarii, a nie z powodu braku długu —
  // i wtedy cisza znowu udawałaby werdykt. `.entryResolved` jest nazwane
  // z imienia, bo to o nie chodzi w akapicie wyżej.
  assert.ok(
    dimmed.some(
      (rule) =>
        rule.sheet === "record/record-comments.module.css" &&
        rule.selector === ".entryResolved",
    ),
    "`.entryResolved` z `record/record-comments.module.css` wypadło z listy reguł " +
      `przezroczystych (znalezionych: ${dimmed.length}). Albo reguła zniknęła, albo ` +
      "wykrywanie `opacity` przestało działać — w drugim wypadku ta lista kłamie.",
  );
});

test("kształty spoza matematyki koloru są DOKŁADNIE tymi, o których wiem", () => {
  // Zamknięty zbiór, nie „pusto" i nie „ile się trafi". Nowy gradient albo nowy
  // `color-mix` w parze tło×tekst ma wywalić TĘ asercję z własną nazwą, zamiast
  // po cichu dołączyć do zwolnionych — to jest urządzenie antygnilne przepisane
  // z `status-contrast.test.mjs:1256-1269`, gdzie zdało egzamin.
  const shapes = [...new Set(unsupportedShapes.map((row) => row.key))].sort();
  assert.deepEqual(
    shapes,
    [
      "--capture-bg",
      "color-mix(in oklch, var(--status-error) 9%, transparent)",
      "color-mix(in srgb, var(--surface-raised) 58%, transparent)",
      "color-mix(in srgb, var(--surface-raised) 78%, transparent)",
    ],
    `Zbiór kształtów, których nie umiem rozłożyć, się zmienił. Dziś: ` +
      `[${shapes.join(" | ")}]. Dopisz nowy kształt tutaj ŚWIADOMIE albo naucz ` +
      "`color-contrast.mjs` go liczyć — cicho pominąć go nie wolno.",
  );
});

test("GRADIENTY SĄ ROZŁOŻONE NA STOPNIE, a każdy stopień zmierzony", () => {
  // TA ASERCJA JEST TWIERDZENIEM POZYTYWNYM i tylko dlatego coś znaczy.
  // Zniknięcie gradientu z listy kształtów nierozłożonych (asercja wyżej) samo
  // w sobie dowodzi WYŁĄCZNIE tego, że coś z niej wypadło — tak samo wygląda
  // usunięcie reguły, zawężenie ścieżki i cicha zmiana klucza. Dowodem, że
  // zieleń przyszła z POMIARU, a nie ze zwężenia zakresu, jest dopiero to:
  // KTÓRE gradienty się rozłożyły, na ILE stopni i ILE dały wierszy.
  const byGradient = new Map();
  for (const row of decomposedGradients) {
    if (!byGradient.has(row.key)) {
      byGradient.set(row.key, { stops: row.stops, themes: new Set() });
    }
    byGradient.get(row.key).themes.add(row.theme);
  }
  const gradientRows = measurements.filter(
    (row) => row.gradientKey !== undefined,
  );
  console.log(
    `\nGRADIENTY ROZŁOŻONE NA STOPNIE: ${byGradient.size}; wierszy pomiaru ` +
      `z gradientu: ${gradientRows.length}.\n` +
      [...byGradient.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([key, entry]) => {
          const rows = gradientRows.filter((row) => row.gradientKey === key);
          const worst = rows.reduce(
            (accumulator, row) => Math.min(accumulator, row.ratio),
            Number.POSITIVE_INFINITY,
          );
          return (
            `  ${key}\n    stopnie: ${entry.stops.join(" | ")}\n` +
            `    motywy: ${[...entry.themes].sort().join(", ")}; ` +
            `najgorszy stopień: ${rows.length === 0 ? "brak wierszy" : `${format(worst)}:1`}`
          );
        })
        .join("\n") +
      "\n",
  );

  // Zamknięta TABELA „gradient → liczba stopni", nie sama lista nazw. Gradient,
  // który straciłby stopień przez błąd parsera ogona pozycji, dalej byłby na
  // liście — a zniknąłby z niego najciemniejszy albo najjaśniejszy stopień,
  // czyli dokładnie ten, o który w tej bramce chodzi.
  const table = [...byGradient.entries()]
    .map(([key, entry]) => `${key} → ${entry.stops.length}`)
    .sort();
  assert.deepEqual(
    table,
    [
      "linear-gradient( 150deg, var(--a-400), var(--a-600) 62%, var(--a-700) ) → 3",
      "linear-gradient( 150deg, var(--accent-legible-bg), var(--a-700) 62% ) → 2",
    ],
    `Zbiór ROZŁOŻONYCH gradientów albo liczba ich stopni się zmieniły. Dziś: ` +
      `[${table.join(" | ")}]. Jeżeli gradient zniknął z tej listy, a nie ma go ` +
      "też wśród kształtów nierozłożonych, to znaczy, że wypadł z POMIARU.",
  );
  for (const [key, entry] of byGradient) {
    assert.deepEqual(
      [...entry.themes].sort(),
      ["dark", "light"],
      `Gradient ${key} rozłożył się tylko w motywach [${[...entry.themes].join(", ")}]. ` +
        "Stopień, który istnieje w jednym motywie, a w drugim nie, jest awarią kaskady.",
    );
  }
  // RÓWNOŚĆ, NIE PODŁOGA, i liczona z ROZŁOŻENIA, nie wpisana z palca: każde
  // rozłożenie (konsument × motyw) ma dać dokładnie tyle wierszy, ile miało
  // stopni. Mniej = stopień wypadł z pomiaru. Więcej = któryś stopień ma alfę
  // i został złożony na dwóch planach czytania — dziś takiego nie ma, a gdyby
  // powstał, ma się zgłosić TUTAJ, a nie rozpłynąć w sumie.
  const expectedRows = decomposedGradients.reduce(
    (sum, row) => sum + row.stops.length,
    0,
  );
  assert.equal(
    gradientRows.length,
    expectedRows,
    `Stopnie gradientów dały ${gradientRows.length} wierszy pomiaru zamiast ` +
      `${expectedRows} (suma stopni każdego rozłożenia). Wiersz, który nie ` +
      "powstał, jest stopniem, którego nikt nie zmierzył.",
  );
});

test("mierzy NIEPUSTY zbiór, w OBU motywach i w KAŻDYM zagrożonym arkuszu", () => {
  // Podłogi liczone POZA pętlą mierzącą i przypięte do nazw, nie do liczb
  // wyprowadzonych z tej samej pętli — inaczej asercja mówiłaby „zmierzyłem
  // tyle, ile zmierzyłem". To jest cała lekcja pustej fikstury: przyrząd, który
  // od razu jest zielony na pustym zbiorze, nie mierzy — on CHOWA.
  assert.ok(
    stylesheets.length >= 30,
    `Znalazłem ${stylesheets.length} arkuszy w ${styleRoot}; poniżej trzydziestu ` +
      "przelot przestał widzieć CSS Moduły, po które ta bramka powstała.",
  );
  assert.ok(
    consumers.length >= 200,
    `Znalazłem ${consumers.length} konsumentów (reguła z tłem I tekstem) — poniżej ` +
      "dwustu wykrywanie się rozjechało.",
  );
  assert.ok(
    measurements.length >= 2 * consumers.length,
    `${measurements.length} wierszy przy ${consumers.length} konsumentach — każdy ` +
      "konsument musi dać co najmniej jeden wiersz na motyw.",
  );
  for (const themeName of THEMES) {
    assert.ok(
      measurements.filter((row) => row.theme === themeName).length >= 200,
      `Motyw „${themeName}" ma ${measurements.filter((row) => row.theme === themeName).length} ` +
        "wierszy — motywy nie mogą się tak rozjechać.",
    );
  }
  for (const sheet of AT_RISK_SHEETS) {
    assert.ok(
      sheetsWithMeasurement.has(sheet),
      `Arkusz ${sheet} nie dał ANI JEDNEGO zmierzonego wiersza. Brief Fazy 3 nazywa ` +
        "go po imieniu jako zagrożony przez dziurę, którą ta bramka zamyka — zero " +
        "wierszy znaczy, że przelot go nie widzi.",
    );
  }
  // Złożenie alfy musi się WYKONAĆ. `--surface-hover`, `--surface-raised`,
  // `--surface-sunken` i `--status-*-bg` są w tym arkuszu przezroczyste i są
  // najczęściej malowanymi tłami w całej aplikacji; gdyby ta gałąź obumarła,
  // zostałyby zmierzone jako farba kryjąca, czyli w kolorze, którego nikt nie widzi.
  const composited = measurements.filter((row) =>
    row.surfaceLabel.includes(" nad "),
  );
  assert.ok(
    composited.length >= 100,
    `Tylko ${composited.length} wierszy powstało przez złożenie alfy; tła z alfą są ` +
      "w tej aplikacji najczęstsze, więc ta liczba nie może spaść tak nisko.",
  );
});

test("KAŻDY konsument zdaje AA (WCAG 2.x SC 1.4.3, próg 4,5:1)", () => {
  const failures = measurements
    .filter(
      (row) =>
        !row.exempt && !row.decorative && row.ratio < WCAG_AA_NORMAL_TEXT,
    )
    .sort((left, right) => left.ratio - right.ratio)
    .map(
      (row) =>
        `${row.theme}/${row.where} ${row.subject}: ${format(row.ratio)}:1 ` +
        `(${row.textValue} = ${row.textLiteral} na ${row.surfaceLabel} = ${row.backgroundLiteral})`,
    );
  assert.deepEqual(
    failures,
    [],
    `Reguły arkusza malujące tekst poniżej ${WCAG_AA_NORMAL_TEXT}:1 na własnym tle: ` +
      `${failures.join("; ")}. Progu NIE WOLNO obniżyć — zmienia się wartość ` +
      "w regule albo wartość tokenu.",
  );
});

test("STOS NAZWANY jest ROZWIĄZANY, ZMIERZONY i ma pokrycie w kodzie", () => {
  // Awaria wpisu NIE JEST tu ciszą. Każdy powód, dla którego wpis przestał być
  // prawdziwy, ma własny komunikat — bo ręczna tabela bez takich kontroli jest
  // dokładnie tym kłamiącym przyrządem, który ta fala tępi.
  assert.deepEqual(
    inheritedSetupFailures,
    [],
    "Wpisy INHERITED_SURFACES, które straciły pokrycie w arkuszu: " +
      inheritedSetupFailures.join(" | "),
  );
  assert.deepEqual(
    inheritedUnmeasurable,
    [],
    "Stosy nazwane, których nie umiem rozłożyć (nie zgaduję): " +
      inheritedUnmeasurable.join(" | "),
  );

  const lines = inheritedMeasurements
    .slice()
    .sort((left, right) => left.ratio - right.ratio)
    .map(
      (row) =>
        `  ${row.theme.padEnd(5)} ${format(row.ratio).padStart(6)}:1  ` +
        `${row.ratio >= WCAG_AA_NORMAL_TEXT ? "AA     " : "PONIŻEJ"}  ` +
        `${row.where.padEnd(46)} ${row.subject}\n` +
        `        ${row.textValue} = ${row.textLiteral} na ${row.surfaceLabel}\n` +
        `        [${row.origin}]`,
    );
  console.log(
    `\nSTOSY NAZWANE — reguła deklaruje SAM KOLOR, a powierzchnię pod nią wnosi ` +
      `tabela INHERITED_SURFACES (${inheritedTargets.length} reguł, ` +
      `${inheritedMeasurements.length} wierszy, próg ${WCAG_AA_NORMAL_TEXT}:1):\n` +
      lines.join("\n") +
      "\n\nKażdy z tych wierszy byłby BEZ TABELI niezmierzony — reguła siedziałaby " +
      "w wiadrze „deklarują tylko tekst” i nie pytałby o nią ŻADEN przyrząd.\n",
  );

  // RÓWNOŚĆ, nie podłoga, i wyliczona z TABELI — nie z pętli, która mierzy.
  assert.ok(
    expectedInheritedRows >= 20,
    `Z tabeli wychodzi ${expectedInheritedRows} wierszy (motywy × rozwinięte stosy) — ` +
      "poniżej dwudziestu przestaje ona pilnować tego, po co powstała.",
  );
  assert.equal(
    inheritedMeasurements.length,
    expectedInheritedRows,
    `Stosy nazwane dały ${inheritedMeasurements.length} wierszy zamiast ` +
      `${expectedInheritedRows} wyliczonych z tabeli. Wiersz, który nie powstał, ` +
      "jest powierzchnią, której nikt nie zmierzył.",
  );
  for (const target of inheritedTargets) {
    for (const themeName of THEMES) {
      assert.ok(
        inheritedMeasurements.some(
          (row) => row.selector === target.selector && row.theme === themeName,
        ),
        `${target.sheet} ${target.selector} nie dał ANI JEDNEGO wiersza w motywie ` +
          `„${themeName}".`,
      );
    }
  }

  // ZAMKNIĘTY ZBIÓR PODMIOTÓW. Wpis, który wyparuje z tabeli razem z regułą,
  // zabrałby ze sobą pomiar i nikt by tego nie zobaczył — pięć reguł akcentu
  // z lotów 2–4 jest tu wymienionych z nazwy, bo to o nie chodzi.
  assert.deepEqual(
    inheritedTargets
      .map((target) => `${target.sheet} ${target.selector}`)
      .sort(),
    [
      'opportunity/opportunity-record.module.css .offerState[data-offer-state="submitted"]',
      "record/record-comments.module.css .badgeMention",
      "record/record-comments.module.css .markAgent",
      "record/record-panels.module.css .eventAgent",
      "renewals/renewals.module.css .basisLink",
    ],
    "Zbiór reguł ze stosem nazwanym się zmienił. Każda z nich to miejsce, gdzie " +
      "loty 2–4 postawiły akcent na piśmie i gdzie bez tabeli nie mierzy nic.",
  );

  // DOWÓD W KODZIE RENDERUJĄCYM. Sprawdzane jest to, co da się sprawdzić:
  // że każda nazwa klasy z uzasadnienia naprawdę stoi w podanym pliku. Kolejność
  // zagnieżdżenia w drzewie DOM zostaje prozą i jest tak nazwana nad tabelą.
  const rendererRoot = path.join(repoRoot, "packages", "desktop-ui", "src");
  for (const target of inheritedTargets) {
    const source = readFileSync(path.join(rendererRoot, target.source), "utf8");
    for (const className of target.classNames) {
      assert.ok(
        source.includes(`styles.${className}`),
        `Klasa styles.${className} nie występuje już w ${target.source}, a wpis ` +
          `dla ${target.selector} opiera na niej swoje twierdzenie o powierzchni ` +
          `(${target.reason}).`,
      );
    }
  }
});

test("ZWOLNIENIE DLA DEKORACJI ma pokrycie w kodzie, inaczej PADA", () => {
  // Trzy rzeczy naraz, bo wyjątek bez każdej z nich jest kłamiącym przyrządem:
  //   1. PODMIOT ISTNIEJE — reguła, której dotyczy, dała wiersze pomiaru.
  //      Wyjątek, który przeżył usunięcie swojego selektora, zwalnia powietrze.
  //   2. DOWÓD ISTNIEJE — ta klasa jest w kodzie renderującym nałożona na
  //      element z `aria-hidden="true"`. To jest jedyna część uzasadnienia,
  //      którą da się sprawdzić maszyną, więc jest sprawdzana.
  //   3. WYJĄTEK JEST WĄSKI — dokładnie jeden selektor w dokładnie jednym
  //      arkuszu, wymieniony z nazwy. Wzorzec zamiast nazw byłby workiem.
  const rendererRoot = path.join(repoRoot, "packages", "desktop-ui", "src");
  for (const entry of DECORATIVE_EXEMPTIONS) {
    const rows = measurements.filter(
      (row) => row.decorative && row.sheet === entry.sheet,
    );
    assert.ok(
      rows.length > 0,
      `Zwolnienie dla dekoracji ${entry.sheet} ${entry.selector} nie ma ANI ` +
        "JEDNEGO zmierzonego wiersza. Podmiot zniknął albo zmienił nazwę — " +
        "usuń wyjątek albo popraw jego selektor, bo dziś nie zwalnia niczego.",
    );
    const source = readFileSync(path.join(rendererRoot, entry.source), "utf8");
    const marker = `className="${entry.className}"`;
    const occurrences = source.split(marker).length - 1;
    assert.equal(
      occurrences,
      1,
      `Klasa ${entry.className} jest w ${entry.source} nałożona ${occurrences} razy. ` +
        "Wyjątek dla dekoracji stoi na JEDNYM elemencie i jego atrybucie; przy " +
        "dwóch nie wiadomo, o którym mówi.",
    );
    const at = source.indexOf(marker);
    const tag = source.slice(
      source.lastIndexOf("<", at),
      source.indexOf(">", at),
    );
    assert.match(
      tag,
      /aria-hidden="true"/,
      `Element z klasą ${entry.className} w ${entry.source} NIE MA JUŻ ` +
        `aria-hidden="true": „${tag.replace(/\s+/g, " ")}". Wyjątek stracił swój ` +
        "dowód — albo atrybut wraca, albo kafel musi zdać próg jak każdy inny " +
        `napis (powód wyjątku: ${entry.reason}).`,
    );
  }

  // Wiersze zwolnione są MIERZONE I WYPISANE, tak samo jak przy nieaktywnej
  // kontrolce: zwolnienie zdejmuje asercję, nie pomiar. Ta liczba jest tu po to,
  // żeby dług dekoracyjny był WIDOCZNY — kafel marki liczy dziś tyle samo, co
  // liczył kafel przestrzeni, zanim go poprawiono.
  const decorative = measurements.filter((row) => row.decorative);
  console.log(
    `\nZWOLNIENI (czysta dekoracja, poza zakresem SC 1.4.3): ${decorative.length} wierszy:\n` +
      decorative
        .slice()
        .sort((left, right) => left.ratio - right.ratio)
        .map(
          (row) =>
            `  ${row.theme.padEnd(5)} ${format(row.ratio).padStart(6)}:1  ` +
            `${row.where} ${row.subject}  ${row.surfaceLabel}`,
        )
        .join("\n") +
      "\n",
  );
});

// ── DŁUG NAZWANY W `tokens.css`, ZAMIENIONY NA ASERCJĘ ──────────────────────
//
// `tokens.css` niósł przez dwa loty akapit prozy o tym, że `.primary-button kbd`
// maluje się przez `color-mix(… 62%, transparent)` i NIE ZDAJE AA w dwóch
// stanach z trzech (2,98 / 3,93 / 4,99). Lot nasady zamknął to w `styles.css`:
// skrót nie ma już własnego koloru i dziedziczy pismo przycisku. Proza została
// zamieniona na tę asercję, bo długu zapisanego wyłącznie w komentarzu nikt nie
// pilnuje — to jest dosłownie klasa „przyrząd, którego nie było".
//
// ASERCJA JEST O KSZTAŁCIE REGUŁY, NIE O STOSUNKU, i to jest jedyna uczciwa
// forma: dziedziczenie `currentColor` przez DOM nie da się rozstrzygnąć z samego
// arkusza, więc nie ma tu żadnej pary do zmierzenia. Da się natomiast
// rozstrzygnąć, czy któraś reguła ODBIERA skrótowi odziedziczone pismo —
// a dopóki go nie odbiera, skrót stoi dokładnie na tym kontraście, co napis
// przycisku, i ten jest mierzony jako zwykły konsument (druga część niżej).
//
// CZEGO NIE ŁAPIE, POWIEDZIANE WPROST: regułę o przodku spoza samego przycisku
// (`.jakiś-dialog .primary-button kbd`) uznałaby za cudzą i przepuściła. Dziś
// takiej nie ma; gdy powstanie, ten warunek trzeba rozszerzyć, a nie zdjąć.
const kbdInsidePrimaryButton = [];
for (const rule of allRules) {
  for (const part of splitSelectorList(rule.selector)) {
    const compounds = part.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
    if (compounds.at(-1) !== "kbd") continue;
    const ancestors = compounds.slice(0, -1);
    // Pusty przodek = goła reguła `kbd`, która obowiązuje TAKŻE wewnątrz
    // przycisku głównego, więc jest w tym pytaniu tak samo istotna.
    if (!ancestors.every((compound) => compound.startsWith(".primary-button")))
      continue;
    kbdInsidePrimaryButton.push({ ...rule, part });
  }
}

test("SKRÓT NA AKCJI GŁÓWNEJ nie odzyskuje własnego koloru", () => {
  // ZAMKNIĘTY ZBIÓR, NIE „ZERO NARUSZEŃ". Asercja o pustej liście naruszeń jest
  // nieodróżnialna od asercji, której wykrywanie przestało cokolwiek znajdować —
  // ta pułapka ma w tym repo własny wpis. Więc najpierw NAZWY reguł, które mają
  // tu być, a dopiero potem ich kształt.
  assert.deepEqual(
    [...new Set(kbdInsidePrimaryButton.map((rule) => rule.part))].sort(),
    [".primary-button kbd", "kbd"],
    "Zbiór reguł malujących skrót WEWNĄTRZ akcji głównej się zmienił. " +
      "Zero reguł znaczy, że dopasowanie przestało łapać, a nie że dług zniknął.",
  );
  const withOwnPaint = kbdInsidePrimaryButton
    .filter((rule) => rule.color !== undefined || rule.background !== undefined)
    .map(
      (rule) =>
        `${rule.where} ${rule.part} (color: ${rule.color ?? "brak"}, ` +
        `background: ${rule.background ?? "brak"})`,
    );
  assert.deepEqual(
    withOwnPaint,
    [],
    "Skrót klawiszowy na akcji głównej znowu ma własną farbę: " +
      `${withOwnPaint.join("; ")}. Wygaszanie go przezroczystością nie mieści ` +
      "się w AA i nie da się go zmieścić przy wygaszeniu, które cokolwiek znaczy " +
      "(pomiar stoi przy samej regule w `styles.css`). Sygnał niesie stopień " +
      "pisma i grubość, nie kontrast.",
  );

  // DRUGA POŁOWA: pismo, które skrót dziedziczy, MUSI BYĆ MIERZONE. Bez tego
  // asercja wyżej pilnowałaby tylko tego, że skrót nie ma koloru — nie mówiąc
  // nic o tym, czy kolor, który bierze, w ogóle zdaje.
  //
  // DWIE PISOWNIE TEGO SAMEGO TUSZU, i to nie jest ostrożność na zapas.
  // `--action-primary-text` rozwiązuje się od 2026-08-07 przez rolę
  // `--accent-legible-text` (`tokens.css`), więc reguła arkusza może dziś
  // deklarować którąkolwiek z tych nazw i dostanie ten sam kolor. Gdyby ta lista
  // pinowała jedną pisownię, przepięcie konsumentów na rolę — dokładnie ten ruch,
  // do którego rola zaprasza loty ekranowe — wyzerowałoby ją, a podłoga niżej
  // wywaliłaby bramkę z komunikatem o „konsumentach, którzy wypadli z przelotu",
  // czyli o czymś, co się nie stało.
  const PRIMARY_ACTION_INK = new Set([
    "var(--action-primary-text)",
    "var(--accent-legible-text)",
  ]);
  const inheritedInk = measurements.filter((row) =>
    PRIMARY_ACTION_INK.has(row.textValue),
  );
  const failing = inheritedInk
    .filter((row) => row.ratio < WCAG_AA_NORMAL_TEXT)
    .map((row) => `${row.theme}/${row.where}: ${format(row.ratio)}:1`);
  assert.ok(
    inheritedInk.length >= 12,
    `Pismo akcji głównej dało ${inheritedInk.length} wierszy pomiaru — poniżej ` +
      "dwunastu (sześć reguł × dwa motywy) znaczy, że konsumenci akcji wypadli " +
      "z przelotu i skrót dziedziczy kontrast, którego nikt nie mierzy.",
  );
  assert.deepEqual(
    failing,
    [],
    `Wypełnienia akcji głównej poniżej progu: ${failing.join("; ")}.`,
  );
});

test("zwolnienia dla NIEAKTYWNYCH kontrolek są mierzone i policzalne", () => {
  // Zwolnienie zdejmuje asercję, nie pomiar. Gdyby wzorzec `:disabled` przestał
  // łapać, wiersze wróciłyby pod próg — więc ta lista musi być NIEPUSTA, żeby
  // „zwolnione" nie stało się cichym workiem na wszystko.
  const exempt = measurements.filter((row) => row.exempt);
  const belowThreshold = exempt.filter(
    (row) => row.ratio < WCAG_AA_NORMAL_TEXT,
  );
  console.log(
    `\nZWOLNIENI (SC 1.4.3 „Incidental", nieaktywna kontrolka): ${exempt.length} ` +
      `wierszy, z tego ${belowThreshold.length} poniżej progu:\n` +
      belowThreshold
        .map(
          (row) =>
            `  ${row.theme} ${format(row.ratio)}:1  ${row.where} ${row.subject}`,
        )
        .join("\n") +
      "\n",
  );
  assert.ok(
    exempt.length > 0,
    "Ani jeden wiersz nie trafił do zwolnionych; wzorzec nieaktywnej kontrolki " +
      "przestał łapać, a wtedy zwolnienie jest martwym kodem udającym decyzję.",
  );
  // ZWOLNIENIE NIE MOŻE BYĆ WORKIEM. Liczba wszystkich zwolnionych wierszy nic
  // nie znaczy (większość i tak zdaje próg) — znaczy dokładnie ten zbiór, który
  // zwolnienie RATUJE. Jest zamknięty i wypisany z nazwy, więc kolejna nieaktywna
  // kontrolka pod progiem wywali TĘ asercję i trafi tu ŚWIADOMIE, zamiast
  // wpaść do zwolnionych po cichu. Wiersz jest bez numeru linii celowo: numer
  // gnije przy pierwszej edycji nad nim i zamieniłby asercję o produkcie
  // w asercję o formatowaniu.
  assert.deepEqual(
    [
      ...new Set(
        belowThreshold.map(
          (row) => `${row.sheet} ${row.subject} (${row.theme})`,
        ),
      ),
    ].sort(),
    [
      "record/record-comments.module.css .submit:disabled (dark)",
      "tasks/saved-view-filters.module.css .save:disabled (dark)",
    ],
    "Zbiór zwolnionych wierszy POD PROGIEM się zmienił. Każdy taki wiersz to " +
      "decyzja, że napis wolno mieć poniżej 4,5:1, bo jego kontrolka jest " +
      "nieaktywna. Decyzję podejmuje człowiek, nie wzorzec.",
  );
});
