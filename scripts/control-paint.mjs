// Czy KTÓRAKOLWIEK narysowana kontrolka ma tło, którego nie ustawił arkusz tej
// aplikacji — czyli spis powszechny farby kontrolek, nie lista zadeklarowanych
// podmiotów.
//
// PO CO TO ISTNIEJE, i to jest jedyny akapit, który trzeba przeczytać. Bramka
// układu jest ZIELONA na 122 parach języka wizualnego, a od prototypu dzieli
// tę aplikację 71 potwierdzonych rozjazdów. To nie jest sprzeczność: PARA
// MIERZY WYŁĄCZNIE TO, CO KTOŚ UMIAŁ ZAPISAĆ SELEKTOREM. Cztery z tych
// rozjazdów mają jedną przyczynę — `packages/desktop-ui/src/styles.css:509-512`
// resetuje `button` przez `border: 0` i `touch-action`, a dwie linijki wyżej ta
// sama grupa kontrolek dostaje `color` i `font`. Brakuje `background`, w całym
// arkuszu nie ma ani jednej deklaracji `appearance`, więc każdy przycisk,
// któremu żadna reguła nie da tła, maluje się SYSTEMOWYM `ButtonFace`. Skutek
// widoczny gołym okiem: niewybrany chip jest JAŚNIEJSZY od wybranego.
//
// Żadna para tego nie pyta i nie mogła zapytać: para wymaga, żeby ktoś
// najpierw NAZWAŁ podmiot. Tu podmiotów jest 133 na 422 elementy `<button>`
// w znaczniku, a 105 z nich nie niesie klasy, którą analiza statyczna umie
// rozstrzygnąć. Dlatego to jest SPIS POWSZECHNY każdej narysowanej kontrolki
// na przystanku, a nie mapa — mapy nie da się rozbroić pominięciem podmiotu,
// spisu owszem, ale tylko przez skasowanie samego ekranu.
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
 * Status pozycji. Zapisany TUTAJ, a nie w prozie planu, bo od niego zależy, czy
 * przelot rzuca, czy raportuje — i bo prozy nikt nie kompiluje.
 *
 * WARUNEK PRZEŁĄCZENIA NA „enforced": Faza C, lot C3 domyka reset przycisku
 * (`styles.css:509-512` dostaje `background`), po czym rejestr `KNOWN_CONTROL_PAINT`
 * niżej robi się PUSTY. Pusty rejestr + `enforced` znaczy „ani jedna narysowana
 * kontrolka nie maluje się farbą, której nie ustawił ten arkusz" i dopiero
 * wtedy wolno to zdanie egzekwować. Przełączenie przy NIEPUSTYM rejestrze
 * zrobiłoby z bramki układu czerwień do końca fali, czyli przyrząd, który nie
 * pilnuje niczego innego.
 */
export const CONTROL_PAINT_STATUS = "pending: FAZA C, lot C3";

/**
 * Czy ten przelot EGZEKWUJE werdykty spisu.
 *
 * Reguła tego repozytorium, ta sama co przy `RECORD_TITLE_BAND`: pozycja
 * NIEODDANA raportuje, rzuca dopiero to, co ODDANE i ZEPSUTE. Werdykt nad
 * kontrolką z rejestru jest opisem znanego długu Fazy C; werdykt nad kontrolką
 * SPOZA rejestru jest regresją oddanej roboty i pada zawsze — patrz
 * `classifyControlPaintCensus`.
 */
export const CONTROL_PAINT_ARMED = CONTROL_PAINT_STATUS === "enforced";

/**
 * Nazwa elementu, po której da się go rozpoznać w rejestrze i w raporcie.
 *
 * Ta sama normalizacja co w bramce (`verify-renderer-layout.mjs:578-581`)
 * i z tego samego powodu: CSS Modules dokleja do klasy skrót treści arkusza
 * (`_chip_1kitm_126`), więc JEDNA edycja arkusza zmieniłaby nazwy wszystkich
 * jego klas i unieważniła cały rejestr naraz. Rejestr, który sam się kasuje
 * przy przebudowie, nie pilnuje niczego.
 */
export const normaliseClassToken = (token) => {
  const match = /^_(.+)_[a-z0-9]{5,7}_\d+$/u.exec(token);
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
        `${group.signature} computes background-color „${group.backgroundColor}", which this ` +
        "instrument cannot decompose. Instrument failure — the verdict would be a guess.",
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
 * arkusza, i które zamyka Faza C.
 *
 * KLUCZ TO `surface` + `signature`, NIGDY LICZBA ELEMENTÓW. `.treeNode` to
 * jeden wiersz na folder, `.chip` jeden na stan relacji, `.groupName` jeden na
 * organizację w fiksturze — rejestr trzymający liczby zgniłby przy pierwszym
 * urośnięciu fikstury i zaczerwienił bramkę na danych, nie na kodzie. Liczby
 * SĄ drukowane, ale nie są asertowane.
 *
 * Każdy wpis niesie `why` — czyli miejsce w arkuszu, w którym reguła MILCZY
 * o tle. To jest robota lotu C3, wypisana adresami, a nie prozą.
 */
export const KNOWN_CONTROL_PAINT = [
  {
    surface: "pipeline",
    signature: "button._stagesLink",
    why: "pipeline/pipeline.module.css:123 — no background in the resting state",
  },
  {
    surface: "organizations",
    signature: "button._switch",
    why: "organizations/organizations.module.css:94 — resting state silent, :102 [aria-selected] paints",
  },
  {
    surface: "organizations",
    signature: "button._chip",
    why: "organizations/organizations.module.css:126 — resting state silent, :141 [aria-pressed] paints",
  },
  {
    surface: "people",
    signature: "button._switch",
    why: "people/people.module.css:85 — resting state silent, :93 [aria-selected] paints",
  },
  {
    surface: "people",
    signature: "button._groupName",
    why: "people/people.module.css:151 — no background in the resting state",
  },
  {
    surface: "renewals",
    signature: "button._basisLink",
    why: "renewals/renewals.module.css:665 — no background in the resting state",
  },
  {
    surface: "renewals",
    signature: "button._follow",
    why: "renewals/renewals.module.css:694 — no background in the resting state",
  },
  {
    surface: "renewals",
    signature: "button._action",
    why: "renewals/renewals.module.css:862 — no background in the resting state",
  },
  {
    surface: "renewals",
    signature: "button._more",
    why: "renewals/renewals.module.css:219 — no background in the resting state",
  },
  {
    surface: "library",
    signature: "button._switch",
    why: "library/library.module.css:122 — resting state silent, :130 [aria-selected] paints",
  },
  {
    surface: "library",
    signature: "button._treeNode",
    why: "library/notes.module.css:144 — resting state silent, :236 .treeNodeSelected paints",
  },
  {
    surface: "library",
    signature: "button._treeNode._treeNodeLoose",
    why: "library/notes.module.css:144 + :204 — neither declares a background",
  },
  {
    surface: "library",
    signature: "button._arrangementButton",
    why: "library/notes.module.css:386 — resting state silent, :410 [aria-pressed] paints",
  },
  {
    // NIE PRZYCISK, I TO JEST TREŚĆ TEGO WPISU. Rejestr znalezisk ma to
    // zapisane jako „Pole «Change title» jest rysowane domyślnym stylem
    // systemowym" i przypisane innej rodzinie — a to ta sama reguła i ta sama
    // przyczyna: `styles.css:501-505` daje `input` `color` i `font`, i nie daje
    // `background`. Spis obejmujący WYŁĄCZNIE `<button>` nigdy by tego nie
    // powiedział.
    surface: "library",
    signature: "input[no class]",
    why: "library/SourcesReading.tsx:304 („Change title”) carries no rule at all; styles.css:501-505 gives input color and font but no background",
  },
];

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
 * Werdykt o KONTROLACH DODATNICH całego przebiegu.
 *
 * `observed` to mapa `podpis → zbiór stanów`, zebrana ze wszystkich motywów.
 * Świadek nienarysowany i świadek osądzony inaczej, niż deklaruje, są tą samą
 * klasą awarii — przyrządu, nie produktu — ale mają RÓŻNE komunikaty, bo
 * wymagają różnej roboty.
 */
export const classifyControlPaintWitnesses = ({
  observed,
  witnesses = CONTROL_PAINT_WITNESSES,
}) => {
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
        `CONTROL_PAINT_WITNESS_NOT_DRAWN: the census never saw a rendered .${witness.class} in ` +
          "any theme. This instrument then has NO evidence that it can return anything but a " +
          "finding, and a probe that can only go red is indistinguishable from a broken one.",
      );
      lines.push(`witness\t.${witness.class}\tNOT DRAWN`);
      continue;
    }
    const wrong = [...states].filter((state) => state !== witness.expect);
    lines.push(
      `witness\t.${witness.class}\t${[...states].sort().join(", ")}\t${elements} element(s)`,
    );
    if (wrong.length > 0)
      failures.push(
        `CONTROL_PAINT_WITNESS_FLAGGED: .${witness.class} is declared legal as ${witness.expect} ` +
          `and this run judged it ${wrong.join(", ")}. Either a rule stopped setting its ` +
          "background — which is a regression of delivered work — or this instrument reports " +
          "false positives, and a false positive is a defect OF THE INSTRUMENT.",
      );
  }
  return { failures, lines };
};

/**
 * Wpisy rejestru, których ŻADEN przelot nie spotkał.
 *
 * Wpis niedopasowany opisuje kontrolkę, której nie ma — albo dług spłacono
 * i wpis ma zniknąć, albo spis przestał ten ekran widzieć. Oba przypadki
 * znaczą, że zieleń wyżej nie mówi tego, co wygląda, że mówi. Ta sama umowa co
 * `unusedRegistryEntries` w `descendant-overflow.mjs`: lot, który naprawia
 * kontrolkę, KASUJE jej wpis w tym samym locie. To jest zamierzony przepływ
 * Fazy C, nie tarcie.
 */
export const unmetControlPaintEntries = (met) =>
  KNOWN_CONTROL_PAINT.filter(
    (entry) => !met.has(`${entry.surface}\t${entry.signature}`),
  );

/**
 * Werdykt o CAŁYM przelocie, nie o jednej kontrolce.
 *
 * Istnieje po to, żeby ten spis nie mógł przejść, NIE MIERZĄC NICZEGO — to jest
 * klasa defektu, którą to repozytorium płaci od czterech fal („pusta fikstura
 * chroni fałszywą asercję"): asercja, której fikstura nie dosięga, jest
 * nieodróżnialna od poprawnej.
 *
 * Cztery awarie przyrządu, każda z innym mechanizmem:
 *
 *   * cel, na którym spis obejrzał ZERO kontrolek — ekran, który się nie
 *     narysował, albo przystanek, który nie doszedł;
 *   * sonda gołej kontrolki oddająca farbę PRZEZROCZYSTĄ — wtedy przyrząd nie
 *     odróżnia wady od świadomej przezroczystości i CAŁY jest wydmuszką;
 *   * dwa motywy o IDENTYCZNEJ palecie — oba przeloty zmierzyły tę samą stronę
 *     dwa razy (precedens: `VISUAL_LANGUAGE_THEME_DID_NOT_SWITCH`);
 *   * paleta pusta albo śmiesznie mała — enumeracja `--*` przestała działać
 *     i KAŻDA kontrolka wyszłaby wtedy jako „spoza palety".
 */
export const MINIMUM_TOKEN_PALETTE = 40;

export const classifyControlPaintCensus = ({
  examined,
  uaPaints,
  palettesByTheme,
}) => {
  const failures = [];
  for (const [surface, count] of Object.entries(examined))
    if (count === 0)
      failures.push(
        `CONTROL_PAINT_EXAMINED_NOTHING: the census reached „${surface}" and found ZERO rendered ` +
          "controls on it. A screen with no control is not a screen this instrument measured — " +
          "an empty fixture does not merely fail to measure, IT PROTECTS A WRONG ASSERTION FROM " +
          "EVER BEING WRONG.",
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
 * I TO JEST DOKŁADNIE TO, CO MIERZY BREAK-TEST. Bramka nie może być „zielona
 * przed złamaniem", jeżeli mierzy się ją kodem wyjścia nad przyrządem, który
 * dziś czerwieni 100+ podmiotów — więc break-test NIE mierzy tego, czy przyrząd
 * coś znalazł. Mierzy, czy znalazł coś NOWEGO: złamanie zdejmuje `background`
 * z kontrolki, która je DZIŚ MA (`.primary-button`), przez co pojawia się
 * podpis spoza rejestru i kod wyjścia bramki idzie z 0 na 1. Baza ZIELONA,
 * złamanie CZERWONE, przywrócenie ZIELONE — na przyrządzie, który przez cały
 * ten czas raportuje ten sam znany dług.
 */
export const controlPaintVerdictThrows = ({ registered, armed }) =>
  armed || !registered;
