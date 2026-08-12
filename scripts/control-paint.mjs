// Czy KTÓRAKOLWIEK narysowana kontrolka ma tło, którego nie ustawił arkusz tej
// aplikacji — czyli spis powszechny farby kontrolek, nie lista zadeklarowanych
// podmiotów.
//
// PO CO TO ISTNIEJE, i to jest jedyny akapit, który trzeba przeczytać. Bramka
// układu jest ZIELONA na 122 parach języka wizualnego, a od prototypu dzieli
// tę aplikację 71 potwierdzonych rozjazdów. To nie jest sprzeczność: PARA
// MIERZY WYŁĄCZNIE TO, CO KTOŚ UMIAŁ ZAPISAĆ SELEKTOREM. Cztery z tych
// rozjazdów miały jedną przyczynę — `packages/desktop-ui/src/styles.css`
// resetował `button` przez `border: 0` i `touch-action`, a dwie linijki wyżej ta
// sama grupa kontrolek dostawała `color` i `font`. Brakowało `background`, w całym
// arkuszu nie ma ani jednej deklaracji `appearance`, więc każdy przycisk,
// któremu żadna reguła nie dała tła, malował się SYSTEMOWYM `ButtonFace`. Skutek
// widoczny gołym okiem: niewybrany chip był JAŚNIEJSZY od wybranego.
//
// LOT C3 TO ZAMKNĄŁ I DLATEGO TEN PRZYRZĄD JEST DZIŚ UZBROJONY. Reset deklaruje
// `background: none` — tak samo i z tego samego powodu co prototyp
// (`v3/app.css:19`) — a pola tekstowe bez klasy biorą `--input-bg` obok
// `select`, który miał materiał tej aplikacji od zawsze. Rejestr niżej jest
// PUSTY, `CONTROL_PAINT_STATUS` stoi na „enforced" i KAŻDY werdykt tego spisu
// zatrzymuje przebieg. Zdanie, które ten plik wypowiada od lotu C3, brzmi więc
// bezwarunkowo: ani jedna narysowana kontrolka nie maluje się farbą, której nie
// ustawił ten arkusz.
//
// Żadna para tego nie pyta i nie mogła zapytać: para wymaga, żeby ktoś
// najpierw NAZWAŁ podmiot. Tu podmiotów jest 133 na 422 elementy `<button>`
// w znaczniku, a 105 z nich nie niesie klasy, którą analiza statyczna umie
// rozstrzygnąć. Dlatego to jest SPIS POWSZECHNY, a nie mapa — nikt nie wypisuje
// tu podmiotów, spis bierze KAŻDĄ narysowaną kontrolkę tam, gdzie stanie.
//
// GDZIE STAJE, WYPISANE DOKŁADNIE, bo „powszechny" bez granicy jest
// nieprawdą, a nieprawda w nagłówku jest gorsza od luki w pokryciu:
//
//   OBJĘTE — powłoka (pasek boczny, tabbar, dok) raz; każdy cel nawigacji
//            `.nav-item[data-surface]`; tryb Ustawień wchodzony kołem zębatym;
//            KAŻDY stan soczewki `[data-layout]` na celu, który je deklaruje.
//   NIEOBJĘTE — wszystko, co rysuje się dopiero PO WYBORZE albo PO OTWARCIU:
//            panel deala na Lejku (`pipeline/PipelineSurface.tsx:1020-1037` →
//            `.moveButton`, `pipeline.module.css:225`, i `.dealPanelLink`,
//            `:206` — obie bez tła w spoczynku, obie tej samej klasy co dług
//            niżej), otwarty ekran rekordu, dialogi i menu. Spis ich NIE WIDZI,
//            więc cisza o nich nie jest zdaniem o nich. Domknięcie tego jest
//            robotą osobnego lotu (Faza B, B2), nie ozdobą tego pliku.
//
// Spisu nie da się rozbroić pominięciem podmiotu — da się go rozbroić
// pominięciem PRZYSTANKU, i dokładnie dlatego przystanki są niżej WYPROWADZONE
// z żywego DOM-u i porównywane z tym, co spis naprawdę obejrzał
// (`classifyControlPaintCensus`), a nie wypisane listą.
//
// REGUŁA: tło jest legalne, jeżeli (a) jest W PEŁNI PRZEZROCZYSTE — arkusz
// mówi „background: transparent" 38 razy i mówi to świadomie (`.ghost-button`,
// `styles.css:787`) — albo (b) rozwiązuje się do wartości Z PALETY TOKENÓW tej
// strony. Paleta NIE JEST WPISANA: bierze się ją z żywych własności `--*` na
// korzeniu dokumentu i rozwiązuje SONDĄ W TEJ SAMEJ STRONIE, przez TĘ SAMĄ
// właściwość, którą czyta podmiot (mechanika `expect.kind: "token"`,
// `verify-renderer-layout.mjs:3687-3704`). Bez tego „oklch(…)" nigdy nie
// zrównałoby się z „rgb(…)", a przyrząd meldowałby rozjazd na samej notacji.
//
// CZEGO TU CELOWO NIE MA I DLACZEGO — bo literał farby byłby dokładnie tą wadą,
// przed którą ten przyrząd stoi:
//
//   * NIE MA `rgb(107, 107, 107)`. `ButtonFace` jest INNY w każdym motywie
//     (zmierzone w Chromium: ciemny 107,107,107; jasny 239,239,239) i może być
//     inny na każdym systemie. Bramka chodzi w DWÓCH motywach, więc literał
//     byłby zielony w połowie przebiegów, zanim ktokolwiek dojechałby do
//     Linuksa. Wartość UA jest tu SONDOWANA, i to tylko po to, żeby
//     ROZRÓŻNIĆ dwie klasy znaleziska w raporcie — werdykt jej nie potrzebuje.
//   * NIE MA progu percepcyjnego ani kontrastu. Wada jest w obu motywach TĄ
//     SAMĄ wadą CSS; w ciemnym kontrolka ŚWIECI, w jasnym WYGASA. Objaw się
//     odwraca, wada zostaje.
//   * NIE MA UZNAWANIA WARTOŚCI WYPROWADZONYCH Z TOKENU, i to jest ŚWIADOME.
//     Legalne jest tło RÓWNE rozwiązanemu napisowi tokenu, więc
//     `color-mix(in oklch, var(--surface-stage), transparent 22%)`
//     (`styles.css:4726`) NIE jest w palecie i wychodzi jako `OFF_PALETTE` —
//     czyli werdykt SPOZA rejestru, czyli PADA. Rozpoznanie takiej wartości
//     wymagałoby porównania „z dokładnością do alfy" po konwersji przestrzeni
//     WEWNĄTRZ przyrządu, czyli arytmetyki, której poprawności ten przyrząd nie
//     umie udowodnić o sobie samym. Przypięte testem.
//
//     ZMIERZONE, I GORSZE, NIŻ WYGLĄDA: przestrzeń interpolacji zostaje
//     w wartości wyliczonej, a idiom prototypu (`v3/app.css:466`) brzmi
//     `color-mix(in oklab, …)` — to wraca jako `oklab(…)`, czego `parseColor`
//     NIE ROZKŁADA. Taka kontrolka nie dostaje więc werdyktu `OFF_PALETTE`,
//     tylko `UNREADABLE`, czyli AWARIĘ PRZYRZĄDU, która pada bezwarunkowo,
//     również przy `pending`. Komunikat `UNREADABLE` mówi to wprost i podaje
//     obie drogi wyjścia (zapisać mieszankę `in oklch` albo nauczyć
//     `parseColor` tej przestrzeni), bo inaczej Faza C zobaczyłaby czerwień
//     wskazującą na zepsuty przyrząd tam, gdzie zepsuty przyrząd nie jest
//     przyczyną.
//   * SONDA GOŁEJ KONTROLKI NIE SIĘGA `select` W PEŁNI. Arkusz tej aplikacji
//     daje `select` tło z tokenu (`styles.css:513-519`), więc sonda wstawiona
//     do dokumentu czytała TOKEN, nie silnik, i drukowała go jako „farbę tej
//     przeglądarki". Sonda siedzi teraz w OTWARTYM shadow roocie — selektory
//     dokumentu tam nie sięgają, a `color-scheme` jako własność dziedziczona
//     sięga, więc motyw zostaje zachowany. To jest jedyny sposób, jaki tu
//     działa: `all: revert` zdjęłoby również `color-scheme` i sonda ciemnego
//     motywu wróciłaby z farbą jasnego.
//
// Sam pomiar wymaga przeglądarki, więc siedzi jako przelot w
// `verify-renderer-layout.mjs`. Sama REGUŁA jest funkcją nad napisami
// i mieszka tutaj — chodzi w `npm run check` na wszystkich trzech systemach,
// tak samo i z tego samego powodu co `descendant-overflow.mjs`
// i `record-screen-geometry.mjs`: reguła jest przenośna, PIKSELE I FARBA
// KONKRETNEJ PLATFORMY nie są.
import { parseColor } from "./color-contrast.mjs";

/**
 * Rodzaje kontrolek objętych spisem.
 *
 * DOKŁADNIE TA GRUPA, którą wymienia reguła resetu (`styles.css:501-505`) —
 * bo to ona jest przyczyną i to o niej ten przyrząd wydaje zdanie. `input`,
 * `textarea` i `select` są tu również jako KONTROLA DODATNIA: jeżeli spis
 * potrafi wrócić z werdyktem „w palecie" tylko dlatego, że nigdy nie zobaczył
 * kontrolki z tłem, to nie jest spisem, tylko sondą, która umie wyłącznie
 * czerwienieć.
 *
 * Natywna strzałka `<select>` NIE należy do tego przyrządu — to osobna pozycja
 * (Faza C, lot C5) i osobna właściwość. Tu czyta się WYŁĄCZNIE tło.
 */
export const CONTROL_PAINT_TAGS = ["button", "input", "textarea", "select"];

/**
 * Nazwa przystanku, którym jest sama POWŁOKA.
 *
 * Pasek boczny, tabbar i dok przechwytywania rysują się na KAŻDYM celu, więc
 * liczone pod każdym z nich zrobiłyby z rejestru dwanaście kopii jednego długu.
 * Stoi tu, a nie literałem w dwóch plikach, bo strażnik „powłoka to nie jest
 * cel nawigacji" musi pytać o dokładnie tę nazwę, którą wpisuje spacer.
 */
export const CONTROL_PAINT_SHELL = "shell";

/**
 * Status pozycji. Zapisany TUTAJ, a nie w prozie planu, bo od niego zależy, czy
 * przelot rzuca, czy raportuje — i bo prozy nikt nie kompiluje.
 *
 * WARUNEK PRZEŁĄCZENIA NA „enforced" BYŁ TAKI: Faza C, lot C3 domyka reset
 * przycisku, po czym rejestr `KNOWN_CONTROL_PAINT` niżej robi się PUSTY. Oba
 * warunki są spełnione — reset deklaruje `background: none`, pola tekstowe biorą
 * `--input-bg`, a przelot przestał widzieć czternaście kształtów, o których
 * rejestr mówił (zmierzone: `UA_DEFAULT 0, OFF_PALETTE 0` w obu motywach, przy
 * 99 osądzonych grupach i 233 narysowanych kontrolkach na trzynastu celach).
 * Pusty rejestr + `enforced` znaczy „ani jedna narysowana kontrolka nie maluje
 * się farbą, której nie ustawił ten arkusz".
 *
 * CZEGO TO NIE ZNACZY: `enforced` nie egzekwuje na kontrolkach, których ten
 * spacer NIE ODWIEDZA — panel deala na Lejku, otwarty ekran rekordu, dialogi
 * i menu stoją wypisane w nagłówku jako NIEOBJĘTE i tak zostaje. Uzbrojenie
 * zamyka to, co spis widzi, a nie to, o czym milczy.
 */
export const CONTROL_PAINT_STATUS = "enforced";

/**
 * Czy ten przelot EGZEKWUJE werdykty spisu.
 *
 * Reguła tego repozytorium, ta sama co przy `RECORD_TITLE_BAND`: pozycja
 * NIEODDANA raportuje, rzuca dopiero to, co ODDANE i ZEPSUTE. Werdykt nad
 * kontrolką z rejestru jest opisem znanego długu Fazy C; werdykt nad kontrolką
 * SPOZA rejestru jest regresją oddanej roboty i pada zawsze — patrz
 * `classifyControlPaintCensus`.
 *
 * OD LOTU C3 TE DWIE ŚCIEŻKI SIĘ ZBIEGŁY: rejestr jest pusty, więc KAŻDA
 * kontrolka jest „spoza rejestru" i każdy werdykt pada również bez
 * `armed`. Uzbrojenie nie zmienia dziś ANI JEDNEGO werdyktu — zmienia to, co
 * stanie się jutro, kiedy ktoś dopisze wpis: przy `enforced` wpis nie ucisza
 * już niczego, więc rejestr przestał być drogą wyjścia.
 */
export const CONTROL_PAINT_ARMED = CONTROL_PAINT_STATUS === "enforced";

/**
 * Nazwa elementu, po której da się go rozpoznać w rejestrze i w raporcie.
 *
 * Ta sama normalizacja co w bramce i z tego samego powodu: CSS Modules dokleja
 * do klasy skrót treści arkusza (`_chip_1kitm_126`), więc JEDNA edycja arkusza
 * zmieniłaby nazwy wszystkich jego klas i unieważniła cały rejestr naraz.
 * Rejestr, który sam się kasuje przy przebudowie, nie pilnuje niczego.
 *
 * WZORZEC JEST NAPISEM, I TO NIE JEST OZDOBA. Playwright serializuje ŹRÓDŁO
 * funkcji mierzącej, więc tej funkcji nie da się do strony zaimportować — a
 * WKLEJONA kopia regexpa robi z testu niżej strażnika kopii martwej: edycja
 * kopii żywej zostawiłaby go zielonym („regex zielony, zachowanie zepsute").
 * Napis przechodzi do `page.evaluate` argumentem i tam odtwarza się przez
 * `new RegExp`, więc obie strony mają dosłownie ten sam wzorzec i rozjazd jest
 * niewykonalny. Kopia w `sweep` (`verify-renderer-layout.mjs:578-581`) NIE
 * została tym objęta — pilnuje innego rejestru i to osobna robota.
 */
export const CSS_MODULE_HASH_PATTERN = "^_(.+)_[a-z0-9]{5,7}_\\d+$";

export const normaliseClassToken = (token) => {
  const match = new RegExp(CSS_MODULE_HASH_PATTERN, "u").exec(token);
  return match === null ? token : `_${match[1]}`;
};

/**
 * Czy ta wyliczona farba jest W PEŁNI przezroczysta.
 *
 * Przez `parseColor`, a NIE przez regexp na „rgba(…, 0)". Chromium ZACHOWUJE
 * przestrzeń koloru w wartości wyliczonej: tło zapisane w `oklch()` wraca jako
 * `oklch(0.21 0.012 285)`, a zapisane w sRGB jako `rgba(…)`. Regexp trafiłby
 * jedną z tych dwóch notacji i milczał o drugiej.
 *
 * Farba, której NIE UMIEMY rozłożyć, nie jest przezroczysta „na wszelki
 * wypadek" — jest NIEROZSTRZYGNIĘTA i wraca jako `null`, żeby przelot mógł
 * zgłosić awarię przyrządu zamiast wpisać zgadywanie do werdyktu.
 */
export const alphaOf = (value) => {
  try {
    const color = parseColor(value);
    return typeof color.alpha === "number" ? color.alpha : 1;
  } catch {
    return null;
  }
};

/**
 * Jeden werdykt o jednej GRUPIE kontrolek — czyli o wszystkich elementach
 * jednego kształtu (`surface` + `signature`) wyliczających tę samą farbę.
 *
 * Świadomie NIE przyjmuje elementu DOM: bierze to, co z niego odczytano, żeby
 * dała się przetestować bez przeglądarki.
 *
 * `palette` to LISTA JUŻ ROZWIĄZANYCH wartości tokenów — rozwiązanych sondą
 * w tej samej stronie, przez `background-color`. Porównanie jest napisem do
 * napisu i to jest cała sztuczka: obie strony przeszły przez tę samą
 * normalizację przeglądarki.
 *
 * `uaPaint` to farba, którą ta przeglądarka daje GOŁEJ kontrolce tego rodzaju
 * w tym motywie. Nie wchodzi do werdyktu — rozdziela dwie klasy znaleziska,
 * bo wymagają one RÓŻNEJ roboty: `UA_DEFAULT` naprawia się resetem, a
 * `OFF_PALETTE` (wpisany literał, `color-mix` bez tokenu) naprawia się w tej
 * jednej regule.
 */
export const classifyControlPaint = ({ group, palette, uaPaint }) => {
  // GRADIENT WYKLUCZA PODMIOT, I TO NIE JEST OSTROŻNOŚĆ, TYLKO POMIAR:
  // kontrolka malowana SAMYM gradientem wylicza `background-color` równe
  // `ButtonFace` POD tym gradientem (zmierzone w Chromium). Akcja główna
  // prototypu jest właśnie gradientem akcentu, więc bez tego warunku
  // NAJWAŻNIEJSZY przycisk aplikacji byłby fałszywym trafieniem w każdym
  // przebiegu. Zadeklarowana ślepa plama: kontrolka z obrazem tła i ZŁYM
  // kolorem pod nim przechodzi tu na zielono.
  if (group.backgroundImage !== "none")
    return {
      state: "PAINTED_IMAGE",
      reason:
        `${group.signature} paints an image (${group.backgroundImage}), so its background-color ` +
        "says nothing about what a person sees",
    };
  const alpha = alphaOf(group.backgroundColor);
  if (alpha === null)
    return {
      state: "UNREADABLE",
      reason:
        `${group.signature} on ${group.surface} computes background-color ` +
        `„${group.backgroundColor}", which this instrument cannot decompose (it reads oklch(), ` +
        "rgb()/rgba() and hex). Instrument failure — the verdict would be a guess. THE LIKELY " +
        "CAUSE IS NOT A BROKEN PROBE: a `color-mix()` resolves in its INTERPOLATION SPACE, so " +
        "`color-mix(in oklab, …)` — the prototype's own idiom — computes to `oklab(…)` and lands " +
        "exactly here. Write the mix `in oklch`, and it will be judged (as a finding: see the " +
        "header, a mix over a token is deliberately NOT in the palette), or teach `parseColor` " +
        "that space. Do not silence this line.",
    };
  if (alpha === 0) return { state: "TRANSPARENT" };
  if (palette.includes(group.backgroundColor)) return { state: "IN_PALETTE" };
  return {
    state:
      uaPaint !== undefined && uaPaint === group.backgroundColor
        ? "UA_DEFAULT"
        : "OFF_PALETTE",
    reason:
      `${group.count} rendered <${group.tag}> matching ${group.signature} on ${group.surface} ` +
      `computes background-color = ${group.backgroundColor}, which is neither fully transparent ` +
      `nor any of the ${palette.length} token value(s) this page resolves` +
      (uaPaint !== undefined && uaPaint === group.backgroundColor
        ? ` — it is EXACTLY what this browser paints on a bare <${group.tag}> here (${uaPaint}), ` +
          "so no rule of this stylesheet set it"
        : ` — and it is not the bare-<${group.tag}> paint either (${uaPaint ?? "not probed"}), ` +
          "so a rule set it to a value that is not a token"),
  };
};

/**
 * ZNANY DŁUG — kontrolki, o których wiadomo DZIŚ, że malują się farbą spoza
 * arkusza. PUSTY OD LOTU C3 FAZY C, i to jest jedyny stan, w którym wolno
 * trzymać ten spis uzbrojonym.
 *
 * DLACZEGO PUSTY, A NIE SKREŚLONY. Rejestr niósł czternaście wpisów, każdy
 * z adresem, pod którym reguła MILCZAŁA o tle. Wychodziły stąd WYŁĄCZNIE
 * dlatego, że przelot przestał je widzieć po poprawce w resecie
 * (`packages/desktop-ui/src/styles.css`, `button { background: none }` plus tło
 * z `--input-bg` na polach tekstowych) — nie dlatego, że ktoś skreślił wiersz.
 * Dowodem jest przebieg, nie ta proza: `UA_DEFAULT 0, OFF_PALETTE 0` w obu
 * motywach przy 99 osądzonych grupach, 233 narysowanych kontrolkach i trzynastu
 * celach, czyli przy TYCH SAMYCH liczbach spaceru co przed poprawką. Zapis
 * czternastu zamkniętych kształtów zostaje w historii gita i w raporcie lotu;
 * tutaj rejestr, który nie jest pusty, byłby wyłącznie długiem.
 *
 * KSZTAŁT WPISU, GDYBY KTOŚ MUSIAŁ GO ZNÓW DOPISAĆ (a dopisanie wpisu przy
 * `CONTROL_PAINT_STATUS === "enforced"` jest ZDJĘCIEM strażnika, nie
 * ewidencją — patrz wyżej): KLUCZ TO `surface` + `signature` + `state`, NIGDY
 * LICZBA ELEMENTÓW. `.treeNode` to jeden wiersz na folder, `.chip` jeden na stan
 * relacji, `.groupName` jeden na organizację w fiksturze — rejestr trzymający
 * liczby zgniłby przy pierwszym urośnięciu fikstury i zaczerwienił bramkę na
 * danych, nie na kodzie. `state` jest częścią klucza, bo wpis bez niego byłby
 * zezwoleniem na KSZTAŁT, a nie na dzisiejszą wadę tego kształtu: kontrolka,
 * która zmieniła RODZAJ wady (`UA_DEFAULT` → `OFF_PALETTE`), jest podmiotem,
 * o którym rejestr nie wydał zdania. Każdy wpis niesie `why`, czyli miejsce
 * w arkuszu, w którym reguła milczy o tle — adresem, nie prozą.
 */
export const KNOWN_CONTROL_PAINT = [];

/**
 * KONTROLE DODATNIE — kontrolki, które ten spis MUSI zobaczyć i MUSI uznać za
 * legalne.
 *
 * Bez nich ten przyrząd byłby sondą, która umie WYŁĄCZNIE czerwienieć, a taka
 * sonda jest nieodróżnialna od sondy zepsutej: literówka w zbieraniu podmiotów
 * dałaby „zero legalnych kontrolek" i wyglądałaby jak sukces. Trzy świadkowie,
 * trzy różne legalne kształty:
 *
 *   * `ghost-button`  — świadomie PRZEZROCZYSTA (`styles.css:787`). To jest ten
 *                       świadek, o którego pyta zadanie: kontrolka bez tła,
 *                       która NIE JEST wadą. Zgłoszenie jej byłoby fałszywym
 *                       trafieniem, czyli wadą przyrządu.
 *   * `primary-button`, `secondary-button` — tło Z TOKENU (`styles.css:726`,
 *                       `:761`). Świadek na to, że porównanie z paletą w ogóle
 *                       umie zwrócić „w palecie", a nie tylko „nie znam".
 *
 * Świadek NIENARYSOWANY jest awarią przyrządu, nie ciszą: spacer, który go nie
 * spotkał, nie obejrzał ekranów, o których myśli, że je obejrzał.
 */
export const CONTROL_PAINT_WITNESSES = [
  { class: "ghost-button", expect: "TRANSPARENT" },
  { class: "primary-button", expect: "IN_PALETTE" },
  { class: "secondary-button", expect: "IN_PALETTE" },
];

/**
 * Czy podpis niesie tę klasę. Po TOKENACH, nie przez `includes` na napisie:
 * `button.primary-button` i `button.secondary-button` mają wspólny podnapis
 * „-button", a `.compact` doklejone obok nie ma prawa zerwać dopasowania.
 */
export const signatureCarriesClass = (signature, className) =>
  signature.split(".").slice(1).includes(className);

/**
 * Werdykt o KONTROLACH DODATNICH JEDNEGO MOTYWU.
 *
 * `observed` to mapa `podpis → zbiór stanów` z TEGO motywu, nie z całego
 * przebiegu — i to jest poprawka, nie kosmetyka. Mapa zlana z obu motywów
 * milczy o motywie, w którym spacer padł i nie narysował ani jednego świadka:
 * drugi motyw wypełnia klucze za niego i „świadek nienarysowany" nie ma prawa
 * paść. Każdy motyw sądzi się osobno, a komunikat mówi który.
 *
 * Świadek nienarysowany i świadek osądzony inaczej, niż deklaruje, są tą samą
 * klasą awarii — przyrządu, nie produktu — ale mają RÓŻNE komunikaty, bo
 * wymagają różnej roboty.
 */
export const classifyControlPaintWitnesses = ({
  observed,
  theme = "",
  witnesses = CONTROL_PAINT_WITNESSES,
}) => {
  const where = theme === "" ? "" : ` (${theme})`;
  const failures = [];
  const lines = [];
  for (const witness of witnesses) {
    const states = new Set();
    let elements = 0;
    for (const [signature, seen] of Object.entries(observed)) {
      if (!signatureCarriesClass(signature, witness.class)) continue;
      for (const state of seen.states) states.add(state);
      elements += seen.count;
    }
    if (states.size === 0) {
      failures.push(
        `CONTROL_PAINT_WITNESS_NOT_DRAWN${where}: the census never saw a rendered ` +
          `.${witness.class} in this theme. This instrument then has NO evidence that it can ` +
          "return anything but a finding, and a probe that can only go red is indistinguishable " +
          "from a broken one.",
      );
      lines.push(`witness\t${theme}\t.${witness.class}\tNOT DRAWN`);
      continue;
    }
    const wrong = [...states].filter((state) => state !== witness.expect);
    lines.push(
      `witness\t${theme}\t.${witness.class}\t${[...states].sort().join(", ")}\t` +
        `${elements} element(s)`,
    );
    if (wrong.length > 0)
      failures.push(
        `CONTROL_PAINT_WITNESS_FLAGGED${where}: .${witness.class} is declared legal as ` +
          `${witness.expect} ` +
          `and this run judged it ${wrong.join(", ")}. Either a rule stopped setting its ` +
          "background — which is a regression of delivered work — or this instrument reports " +
          "false positives, and a false positive is a defect OF THE INSTRUMENT.",
      );
  }
  return { failures, lines };
};

/**
 * Czy TA grupa jest opisana wpisem rejestru — po `surface`, `signature` I STANIE.
 *
 * REJESTR WCHODZI PARAMETREM, i to jest poprawka lotu C3, nie ozdoba. Od chwili,
 * w której `KNOWN_CONTROL_PAINT` zrobił się PUSTY, test czytający wprost żywy
 * rejestr nie umiał już powiedzieć NIC o kluczowaniu po stanie — asercja nad
 * pustą listą jest prawdziwa niezależnie od tego, czy reguła działa. Domyślna
 * wartość zostawia produkcyjne wywołanie bez zmian, a test dowodzi REGUŁY na
 * własnym rejestrze zamiast na dzisiejszych danych. Ten sam idiom co
 * `witnesses` i `floors` niżej.
 *
 * Stan w porównaniu jest tym, co odróżnia „znany dług" od „znanego kształtu".
 * Powód stoi przy `KNOWN_CONTROL_PAINT` i sprowadza się do jednego zdania:
 * kontrolka, która zmieniła RODZAJ wady, jest podmiotem, o którym rejestr nie
 * wydał zdania.
 */
export const isRegisteredControlPaint = ({
  surface,
  signature,
  state,
  registry = KNOWN_CONTROL_PAINT,
}) =>
  registry.some(
    (entry) =>
      entry.surface === surface &&
      entry.signature === signature &&
      entry.state === state,
  );

/**
 * Wpisy rejestru, których ŻADEN przelot nie spotkał.
 *
 * Wpis niedopasowany opisuje kontrolkę, której nie ma — albo dług spłacono
 * i wpis ma zniknąć, albo spis przestał ten ekran widzieć. Oba przypadki
 * znaczą, że zieleń wyżej nie mówi tego, co wygląda, że mówi. Ta sama umowa co
 * `unusedRegistryEntries` w `descendant-overflow.mjs`: lot, który naprawia
 * kontrolkę, KASUJE jej wpis w tym samym locie. To jest zamierzony przepływ
 * Fazy C, nie tarcie.
 *
 * SPOTKANIE JEST UNIĄ PO MOTYWACH i to jest wybór, nie niedopatrzenie: reguła,
 * która maluje tło tylko w jednym motywie, dałaby przy księgowaniu per motyw
 * wpis „niespotkany" w drugim — czyli czerwień nad poprawną deklaracją. Przed
 * martwym spacerem w jednym motywie broni tu co innego, i to mocniej:
 * `CONTROL_PAINT_EXAMINED_*` liczy kontrolki OSOBNO W KAŻDYM MOTYWIE, więc
 * motyw, który niczego nie obejrzał, pada na podłodze, zanim ktokolwiek zapyta
 * o rejestr.
 */
export const unmetControlPaintEntries = (met, registry = KNOWN_CONTROL_PAINT) =>
  registry.filter((entry) => !met.has(`${entry.surface}\t${entry.signature}`));

/**
 * PODŁOGA LICZBY KONTROLEK NA CELU, wyprowadzona z pomiaru, nie wymyślona.
 *
 * Po co, skoro zero jest już awarią: „pusta fikstura chroni fałszywą asercję"
 * ma stopień pośredni, którego zero nie widzi. Cel, który spadł ze stu pięciu
 * narysowanych kontrolek do jednej — regresja fikstury, nawigacja, która
 * przestała dojeżdżać, soczewka, która się nie otworzyła — przechodziłby
 * z komunikatem „zmierzono", a przelot dalej twierdziłby o nim zdanie. Ta sama
 * klasa i ten sam kształt lekarstwa co `FOCUS_VISIBILITY_MIN_STOPS`
 * w `verify-renderer-layout.mjs`.
 *
 * LICZBY POCHODZĄ Z PRZEBIEGU (`dowody/b1-czerwien.txt`), a nie z głowy, i są
 * ŚWIADOMIE ZANIŻONE — 60% zmierzonego, minimum 1. Podłoga równa pomiarowi
 * czerwieniłaby bramkę przy pierwszej edycji fikstury, czyli na DANYCH zamiast
 * na kodzie; podłoga na 60% przepuszcza normalne drgnięcie zawartości i pada
 * na zapadnięciu się ekranu. Komunikat niesie OBIE liczby, żeby pierwsza
 * czerwień na innej fiksturze dała się odróżnić od awarii przyrządu.
 *
 * Cel BEZ wpisu nie jest błędem (nowy ekran nie ma prawa zaczerwienić bramki
 * w dniu, w którym powstaje) — ale wpis, którego żaden motyw nie odwiedził,
 * JEST: opisuje przystanek, który zniknął ze spaceru.
 */
export const CONTROL_PAINT_SURFACE_FLOORS = {
  // zmierzone → podłoga (60%, minimum 1), przelot z 2026-08-10, oba motywy
  // oddały te same liczby co do jednej kontrolki.
  //
  // JEDNA ADNOTACJA JEST JUŻ NIEAKTUALNA I ZOSTAJE ŚWIADOMIE: przelot
  // z 2026-08-11 (`dowody/c3-zielen.txt`) naliczył na `tasks` OSIEMNAŚCIE
  // kontrolek, nie siedemnaście — pozostałe dwanaście celów oddało te same
  // liczby. Podłoga się nie rusza (60% z 18 to dalej 10), a liczba w komentarzu
  // NIE jest podmieniana pojedynczo, bo cała tabela nosi w nagłówku JEDEN
  // przelot i JEDNĄ datę: łata na jednym wierszu robi z niej mieszankę dwóch
  // pomiarów, czyli dokładnie to, po czym lot B1 przepisał swój zapis w całości
  // zamiast go poprawiać. Następny pełny przelot przepisuje tabelę i nagłówek
  // razem. Adnotacja, która milczy o tym, że rozminęła się z pomiarem, byłaby
  // za to tą samą wadą, którą naprawa po przeglądzie lotu C3 usuwała z dwóch
  // komentarzy w `styles.css`.
  //
  // DRUGA TAKA ADNOTACJA, TĄ SAMĄ DROGĄ I Z TEGO SAMEGO POWODU: przelot
  // z 2026-08-12 (lot D7, rekompozycja ciała Spotkań) naliczył na `meetings`
  // DZIEWIĘĆ kontrolek, nie cztery, w obu motywach. Przyrost jest ZAMIERZONY
  // i wiadomo, z czego się bierze, kontrolka po kontrolce: harness powłoki
  // dostał w tym locie własną pętlę spotkań, więc ekran rysuje wreszcie
  // kontrolkę uprawnienia kalendarza (która przeniosła się ze skasowanej szyny
  // do sekcji „Coming up") i wiersze wyników Jamie, nagłówek sekcji
  // „Jamie results" dostał wyjście „Open Sources →", a przy odbiorze tego lotu
  // fikstura zaczęła rysować JEDEN wiersz nadchodzących — czyli dziewiąty
  // przycisk, „Preview block". Podłoga NIE JEST przy tej okazji podnoszona
  // z 2 na 5 (60% z 9), i to jest ta sama zasada, co wyżej: jeden wiersz
  // przeliczony osobno robi z tej tabeli mieszankę dwóch przelotów. Następny
  // pełny przelot przepisuje tabelę, nagłówek i obie te adnotacje razem.
  // LICZBA W TEJ ADNOTACJI ZOSTAŁA PRZY ODBIORZE POPRAWIONA Z „OSIEM" —
  // adnotacja, która sama rozminęła się z pomiarem, jest tą samą wadą, którą
  // ten lot naprawiał w cudzych komentarzach.
  shell: 22, // 37
  today: 1, // 1
  calendar: 1, // 3
  inbox: 2, // 4
  tasks: 10, // 17
  projects: 3, // 6
  pipeline: 2, // 4
  organizations: 5, // 9
  people: 3, // 5
  renewals: 6, // 11
  meetings: 2, // 4
  library: 34, // 57
  settings: 44, // 74
};

/**
 * Werdykt o CAŁYM przelocie, nie o jednej kontrolce.
 *
 * Istnieje po to, żeby ten spis nie mógł przejść, NIE MIERZĄC NICZEGO — to jest
 * klasa defektu, którą to repozytorium płaci od czterech fal („pusta fikstura
 * chroni fałszywą asercję"): asercja, której fikstura nie dosięga, jest
 * nieodróżnialna od poprawnej.
 *
 * `walks` to JEDEN WPIS NA MOTYW, nie suma. Księgowość zlana po motywach nie
 * umie powiedzieć, że w jednym z nich spacer padł: drugi wypełnia klucze za
 * niego, każda podłoga jest spełniona sumą i wiersz podsumowania pisze „judged
 * in 2 theme(s)" nad przebiegiem, który zmierzył jeden.
 *
 * Awarie przyrządu, każda z innym mechanizmem:
 *
 *   * przystanek ZADEKLAROWANY, którego spis nie obejrzał — i przystanek
 *     obejrzany, którego nikt nie deklarował. Zbiór celów bierze się z żywego
 *     DOM-u i jest tu PORÓWNYWANY z tym, co spis naprawdę policzył, zamiast
 *     być podłogą na liczbę (podłoga wymaga zgadywania i gnije przy każdej
 *     zmianie kształtu nawigacji);
 *   * koło zębate Ustawień, które nie trafiło — Ustawienia są TRYBEM, nie
 *     pozycją nawigacji, więc ich brak nie objawia się nigdzie indziej;
 *   * kliknięcie, po którym powłoka NIE DOJECHAŁA na deklarowany cel — bez tego
 *     spis liczy ten sam panel pod trzynastoma nazwami, wszystkie niezerowo;
 *   * soczewka `[data-layout]` zadeklarowana i nieotworzona (albo zero
 *     zadeklarowanych) — precedens `measured.lensesDeclared` w `sweep`;
 *   * cel, na którym spis obejrzał ZERO kontrolek albo MNIEJ niż podłoga;
 *   * sonda gołej kontrolki oddająca farbę PRZEZROCZYSTĄ — wtedy przyrząd nie
 *     odróżnia wady od świadomej przezroczystości i CAŁY jest wydmuszką;
 *   * dwa motywy o IDENTYCZNEJ palecie — oba przeloty zmierzyły tę samą stronę
 *     dwa razy (precedens: `VISUAL_LANGUAGE_THEME_DID_NOT_SWITCH`);
 *   * paleta pusta albo śmiesznie mała — enumeracja `--*` przestała działać
 *     i KAŻDA kontrolka wyszłaby wtedy jako „spoza palety".
 */
export const MINIMUM_TOKEN_PALETTE = 40;

export const classifyControlPaintCensus = ({
  walks,
  uaPaints,
  palettesByTheme,
  floors = CONTROL_PAINT_SURFACE_FLOORS,
}) => {
  const failures = [];
  const visited = new Set();
  for (const walk of walks) {
    const theme = walk.theme;
    const examined = walk.examined;
    if (!walk.settingsEntry)
      failures.push(
        `CONTROL_PAINT_NO_SETTINGS_ENTRY (${theme}): „[data-settings-entry]" matched nothing, so ` +
          "the Settings mode was never entered and every control that only renders there went " +
          "unseen. A destination the census cannot reach leaves NO key behind — silence about it " +
          "is indistinguishable from a clean screen. The affordance moved; this census has to " +
          "move with it.",
      );
    if (walk.declared.filter((id) => id !== CONTROL_PAINT_SHELL).length === 0)
      failures.push(
        `CONTROL_PAINT_NO_DESTINATIONS (${theme}): the shell drew no „.nav-item[data-surface]" at ` +
          "all, so this walk had nowhere to go. An empty walk is a broken measurement, not a pass.",
      );
    const seen = Object.keys(examined);
    const unvisited = walk.declared.filter((id) => !seen.includes(id));
    const unexpected = seen.filter((id) => !walk.declared.includes(id));
    if (unvisited.length > 0 || unexpected.length > 0)
      failures.push(
        `CONTROL_PAINT_DESTINATIONS_DIVERGED (${theme}): the shell declared ` +
          `${walk.declared.length} destination(s) and the census counted controls on ` +
          `${seen.length}` +
          (unvisited.length > 0
            ? ` — declared and never examined: ${unvisited.join(", ")}`
            : "") +
          (unexpected.length > 0
            ? ` — examined and never declared: ${unexpected.join(", ")}`
            : "") +
          ". A destination that leaves no key behind is not a destination this pass measured, " +
          "and no floor below can speak about it.",
      );
    for (const arrival of walk.arrivals) {
      if (arrival.seen === null) {
        failures.push(
          `CONTROL_PAINT_NO_AFFORDANCE (${theme}): the shell declared „${arrival.id}" as a ` +
            "destination and the census found nothing to click for it — no nav item, no gear. " +
            "Nothing was navigated, so the count below this name describes the screen the walk " +
            "was already standing on, not that destination.",
        );
        continue;
      }
      if (arrival.seen !== arrival.id)
        failures.push(
          `CONTROL_PAINT_DID_NOT_ARRIVE (${theme}): the census clicked the affordance for ` +
            `„${arrival.id}" and the work pane still reads data-surface="${arrival.seen}". ` +
            "Navigation that silently fails makes this census count ONE panel under every " +
            "destination's name, with every count non-zero and every floor met.",
        );
    }
    if (walk.lensesDeclared === 0)
      failures.push(
        `CONTROL_PAINT_NO_LENSES (${theme}): no destination declared a „[data-layout]" lens. ` +
          "Either the shell stopped marking its switchers or this walk opened nothing — and the " +
          "control of a selected lens paints differently from an unselected one, which is exactly " +
          "the pair this census exists for.",
      );
    else if (walk.lensesMeasured < walk.lensesDeclared)
      failures.push(
        `CONTROL_PAINT_LENS_NOT_MEASURED (${theme}): ${walk.lensesMeasured} of ` +
          `${walk.lensesDeclared} declared „[data-layout]" lens state(s) were opened and counted, ` +
          "so this pass covers paint nobody looked at.",
      );
    for (const [surface, count] of Object.entries(examined)) {
      visited.add(surface);
      if (count === 0) {
        failures.push(
          `CONTROL_PAINT_EXAMINED_NOTHING (${theme}): the census reached „${surface}" and found ` +
            "ZERO rendered controls on it. A screen with no control is not a screen this " +
            "instrument measured — an empty fixture does not merely fail to measure, IT PROTECTS " +
            "A WRONG ASSERTION FROM EVER BEING WRONG.",
        );
        continue;
      }
      const floor = floors[surface];
      if (typeof floor === "number" && count < floor)
        failures.push(
          `CONTROL_PAINT_EXAMINED_TOO_FEW (${theme}): „${surface}" drew ${count} rendered ` +
            `control(s), under the floor of ${floor} derived from today's harness. The fixture, ` +
            "the navigation or a lens shrank this screen, so silence about it is silence over a " +
            "smaller product than the one this floor describes — not evidence that its controls " +
            "are painted.",
        );
    }
  }
  for (const surface of Object.keys(floors))
    if (!visited.has(surface))
      failures.push(
        `CONTROL_PAINT_FLOOR_UNMET: a floor is declared for „${surface}" and no theme examined ` +
          "that destination. Either the screen was renamed and the floor stayed behind, or the " +
          "census stopped reaching it — and a floor over a destination nobody visits is a number " +
          "that can never fail.",
      );
  for (const [key, paint] of Object.entries(uaPaints)) {
    const alpha = alphaOf(paint);
    if (alpha === null)
      failures.push(
        `CONTROL_PAINT_PROBE_UNREADABLE: the bare-control probe for ${key} computed ` +
          `„${paint}", which this instrument cannot decompose.`,
      );
    else if (alpha === 0)
      failures.push(
        `CONTROL_PAINT_PROBE_TRANSPARENT: the bare-control probe for ${key} computed ${paint} — ` +
          "fully transparent. On an engine that leaves controls unpainted, „no rule set this " +
          "background” and „a rule set it to transparent on purpose” are the same reading, so " +
          "this instrument cannot tell a defect from a deliberate ghost button. Instrument " +
          "failure, NOT a green run.",
      );
  }
  const themes = Object.keys(palettesByTheme);
  for (const theme of themes) {
    const palette = palettesByTheme[theme];
    if (palette.length < MINIMUM_TOKEN_PALETTE)
      failures.push(
        `CONTROL_PAINT_PALETTE_TOO_SMALL (${theme}): only ${palette.length} custom propert(ies) ` +
          `on the document root resolved to a colour, under the floor of ${MINIMUM_TOKEN_PALETTE}. ` +
          "Enumeration of `--*` stopped working, and EVERY control would then read as off-palette.",
      );
  }
  if (themes.length > 1) {
    const prints = new Set(
      themes.map((theme) => palettesByTheme[theme].join("|")),
    );
    if (prints.size < themes.length)
      failures.push(
        `CONTROL_PAINT_THEME_DID_NOT_SWITCH: the token palette resolved IDENTICALLY in every ` +
          `theme this pass walked (${themes.join(", ")}). Both passes measured the same page ` +
          "twice, so nothing below is a statement about two themes. Instrument failure.",
      );
  }
  return failures;
};

/**
 * Czy TEN werdykt pada, czy jest raportowany.
 *
 * Tu mieszka cała odpowiedź na pytanie „przyrząd jest dziś czerwony, a CI ma
 * być zielone". Werdykt nad kontrolką WPISANĄ do rejestru jest opisem znanego
 * długu Fazy C i tylko się drukuje. Werdykt nad kontrolką SPOZA rejestru jest
 * regresją: ktoś właśnie zdjął tło z kontrolki, która je miała, albo dołożył
 * ekran z kontrolkami bez tła. To pada ZAWSZE, również przy `pending`.
 *
 * I TO JEST DOKŁADNIE TO, CO MIERZY BREAK-TEST — a od lotu C3 mierzy to
 * WPROST. Dopóki rejestr niósł czternaście kształtów, przyrząd czerwienił
 * w każdym przebiegu i baza nie mogła być zielona „bo nic nie znaleziono",
 * więc złamanie musiało celować w kontrolkę, która tło DZIŚ MA
 * (`.secondary-button`), żeby powstał podpis spoza rejestru. Dziś baza jest
 * zielona, bo przyrząd naprawdę NICZEGO nie znajduje, więc złamanie celuje
 * w SAMĄ ODDANĄ POPRAWKĘ: zdejmuje `background: none` z resetu przycisku
 * i trzynaście kształtów wraca na farbę silnika przy PUSTYM rejestrze
 * i `enforced` (wykonane złamanie i jego powód stoją
 * w `scripts/break-visual-language.mjs`). Baza ZIELONA, złamanie CZERWONE,
 * przywrócenie ZIELONE — i czerwień jest tym razem zdaniem o tej jednej
 * deklaracji, którą lot oddał.
 *
 * TA CZERWIEŃ JEST NADOKREŚLONA i to też jest zapisane, nie przemilczane:
 * zdjęcie tła z resetu zapala werdykty na trzynastu kształtach naraz, a sam kod
 * wyjścia nie umie powiedzieć, KTÓRY z nich poszedł na czerwono. Dlatego
 * złamanie żąda od break-testu FRAGMENTU KOMUNIKATU (`expectRedContains`
 * w `scripts/break-test.mjs`), czyli zdania z werdyktu `UA_DEFAULT` — „so no
 * rule of this stylesheet set it". Trzy liczby mówią wtedy również, co je
 * wyprodukowało.
 */
export const controlPaintVerdictThrows = ({ registered, armed }) =>
  armed || !registered;
