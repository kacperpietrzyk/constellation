// CZY EKRAN, KTÓRY DEKLARUJE SIĘ ZWIĄZANYM WYSOKOŚCIĄ, NAPRAWDĘ NIM JEST —
// pierwszy PIONOWY pomiar, jaki ta bramka kiedykolwiek miała.
//
// PO CO TO ISTNIEJE, i to jest jedyny akapit, który trzeba przeczytać.
// `verify-renderer-layout.mjs` mierzy od czterech fal jedną liczbę:
// `scrollWidth - clientWidth`. KAŻDA jego asercja jest o osi poziomej. Nigdy
// nie spojrzał w dół. Dlatego czytelnia Biblioteki miała 4140 px wysokości
// w oknie 735 px, cały trzypanelowy ekran przewijał się JAKO STRONA, drzewo
// plików uciekało razem z notatką — i pięć zielonych przelotów mówiło „no
// overflow". Fala D zgłosiła to w trakcie scalania i świadomie nie ruszyła.
//
// DWIE POŁOWY, I DRUGA JEST WAŻNIEJSZA OD PIERWSZEJ.
//
//   SUFIT — ekran, który mieści się w swoim związanym korzeniu, nie ma prawa
//   przewijać STRONY. To defekt z księgi fali D.
//
//   PODŁOGA — czytelnia nie ma prawa być niższa niż ułamek ekranu. Ta połowa
//   nie jest ostrożnością, tylko wynikiem sondy: sam `block-size: 100%` na
//   powłoce Biblioteki, czyli lekarstwo, które rekonesans zmierzył i polecił,
//   przy tekście 300% zostawia wiersz czytelni o wysokości **ZERO**. Nagłówek
//   i pasek odczytów chcą wtedy 795 px z 404-pikselowego pudełka. Notatka jest
//   obecna, przewijalna i ma zero pikseli. To jest zerowa szerokość treści
//   ekranu rekordu obrócona o dziewięćdziesiąt stopni — ósmy kłamiący przyrząd
//   tego programu odtworzony przez poprawkę na dziewiątym. Sam sufit tego NIE
//   WIDZI: nic nie wystaje, wszystko się mieści.
//
// Sam pomiar wymaga przeglądarki i siedzi w `verify-renderer-layout.mjs`.
// Sama REGUŁA jest funkcją nad liczbami i mieszka tutaj, żeby chodziła
// w `npm run check` na trzech systemach — tak samo i z tego samego powodu co
// `descendant-overflow.mjs` i `record-screen-geometry.mjs`: reguła jest
// przenośna, PIKSELE nie są.
//
// PRZYPIĘCIE DO macOS, powiedziane wprost, bo pomiar pionowy jest na czcionki
// WRAŻLIWSZY niż poziomy: bramka chodzi w CI na jednym systemie i ten lot tego
// nie zmienia. Wysokość wiersza tekstu różni się między Ubuntu a macOS bardziej
// niż jego szerokość, a wszystkie liczby niżej to UŁAMKI I PORÓWNANIA DWÓCH
// ZMIERZONYCH WYSOKOŚCI, nigdy piksel wpisany z ręki — dlatego reguła przenosi
// się, choć jej wejścia nie.

/**
 * Ile najmniej z wysokości ekranu musi zostać samej czytelni.
 *
 * ZMIERZONE, NIE WYBRANE. Cztery punkty z przelotów tej bramki:
 *
 *   • zapaść wiersza czytelni (sama poprawka rekonesansu, 300%) — **0.000**
 *   • stan USTĘPUJĄCY, tekst 200% — **0.500** (285 px z 570 px)
 *   • stan USTĘPUJĄCY, tekst 300% — **0.500** (202 px z 404 px)
 *   • zdrowy ekran, 1440 i 760 px — **0.785** (577 px z 735 px)
 *
 * PRÓG BYŁ 0.5 I TO BYŁ BEZPIECZNIK Z OPÓŹNIONYM ZAPŁONEM. Porównanie niżej
 * jest ostre (`fraction < minimumFraction`), więc 0.500000 przechodziło —
 * ale przechodziło DOKŁADNIE NA KRAWĘDZI, z zapasem szerokości jednego piksela
 * zaokrąglenia, a docblock w tym miejscu twierdził, że próg „ma zapas w OBIE
 * strony". To zdanie było prawdziwe wyłącznie w stanach ZWIĄZANYCH.
 *
 * Lot LIBP zmierzył tę zerową rezerwę i uznał ją za nieszkodliwą, bo
 * „`minmax(50%, 1fr)` przypina wiersz do progu". TAKIEJ REGUŁY NIE MA:
 * `notes.module.css` nie zawiera ani jednego `50%`, a stan ustępujący jest
 * układany przez `grid-template-rows: minmax(3rem, 9rem) minmax(4rem, 14rem)
 * minmax(0, 1fr)`. Ta sama bramka mierzy zresztą TRZECI stan jednokolumnowy
 * przy oknie 320 px i dostaje tam **0.694**, a nie połowę — czyli równa połowa
 * nie jest własnością stanu, tylko wynikiem DWÓCH pomiarów. Próg postawiony na
 * mierzonej wartości bez rezerwy czerwieni się od różnicy metryk czcionek
 * między tą maszyną a runnerem CI, na niczyjej gałęzi — a bramka pionowa jest
 * na czcionki wrażliwsza od poziomej, co ten plik mówi w nagłówku.
 *
 * WYBRANO WIĘC ZAPAS, KTÓRY DOKUMENTACJA I TAK OBIECYWAŁA, a nie przepisanie
 * obietnicy na „stoi na krawędzi i tak ma być". 0.35 leży między zapaścią
 * (0.000) a najniższym zmierzonym stanem ustępującym (0.500): 0.35 rezerwy nad
 * zapaścią i 0.15 pod stanem ustępującym, czyli około 85 px przy panelu 570 px.
 * Zapaść, dla której ten próg powstał, dalej nie ma jak go spełnić. Próg
 * bliższy zdrowej wartości (0.75) czerwieniłby się od jednego wiersza więcej
 * w nagłówku, czyli zostałby skasowany przy pierwszym przebiegu — a asercja
 * skasowana pod presją nie pilnuje niczego.
 */
export const MINIMUM_READING_HEIGHT_FRACTION = 0.35;

/**
 * Ile pikseli różnicy jest ARYTMETYKĄ, a nie układem.
 *
 * Ścieżki `grid-template-rows` rozwiązują się na wartościach ułamkowych
 * (zmierzone `577.312px`), a `clientHeight` i `scrollHeight` są całkowite.
 * Jeden piksel to zaokrąglenie jednej takiej ścieżki. Nie jest to „zapas na
 * wszelki wypadek": dwa piksele przepuściłyby już ekran, który naprawdę
 * wystaje o dwa.
 */
export const HEIGHT_BOUND_TOLERANCE_PX = 1;

/**
 * Jeden werdykt o jednej czytelni. Świadomie NIE przyjmuje elementu DOM —
 * bierze to, co z niego odczytano, żeby dała się przetestować bez przeglądarki.
 *
 * `panelsSideBySide` i `readingScrollPx` niosą DRUGI, ODDZIELNY defekt, ten,
 * który rekonesans nazwał osobno: kiedy panel czytania nie ma własnego
 * przewijania, to PUDEŁKO CZYTELNI przewija wszystkie trzy panele naraz, więc
 * czytający długą notatkę traci drzewo plików. Ekran przechodzi wtedy sufit
 * (strona się nie przewija) i podłogę (czytelnia ma swoją wysokość).
 *
 * MIERZONE JEST PRZEWIJANIE PUDEŁKA, NIE WYSOKOŚĆ PANELU, i to jest poprawka
 * zrobiona po tym, jak pierwsza wersja tej kontroli okazała się PUSTA. Panel bez
 * `overflow-y` nie robi się wyższy — jego `clientHeight` zostaje równy wierszowi
 * gridu (zmierzone: 577 px), a treść WYLEWA SIĘ z niego widocznie. Kontrola nad
 * `clientHeight` panelu liczyła więc zawsze zero, świeciła na zielono i była
 * dokładnie tym, przed czym ten lot ma bronić: asercją, która przechodzi, nie
 * mierząc niczego. Złamanie, które ją „potwierdzało", było czerwone z innego
 * powodu. Pudełko czytelni przewijające 4140 px w 577 px NIE DA SIĘ podrobić.
 */
export const classifyHeightBoundScreen = ({
  name,
  surface,
  paneClientPx,
  rootHeightPx,
  rootClientPx,
  rootScrollPx,
  readingClientPx,
  readingScrollPx,
  panelsSideBySide,
  minimumFraction = MINIMUM_READING_HEIGHT_FRACTION,
  tolerancePx = HEIGHT_BOUND_TOLERANCE_PX,
}) => {
  // Pudełko bez wysokości znaczy, że pomiar zastał ekran, którego nie ma na
  // ekranie — a ułamek z zerowym mianownikiem to nie wynik, tylko cisza
  // z liczbą. Osobny werdykt, bo to awaria PRZYRZĄDU, nie układu.
  if (!Number.isFinite(paneClientPx) || paneClientPx <= 0)
    return {
      verdict: "unmeasurable",
      reason:
        `the pane holding ${name} on ${surface} has no height of its own, so any ` +
        "comparison against it is arithmetic over nothing",
    };
  if (!Number.isFinite(rootClientPx) || rootClientPx <= 0)
    return {
      verdict: "unmeasurable",
      reason: `the ${name} screen on ${surface} reported no height at all`,
    };
  if (!Number.isFinite(readingClientPx) || readingClientPx < 0)
    return {
      verdict: "unmeasurable",
      reason: `the reading area of ${name} on ${surface} reported no height at all`,
    };

  // ── PODŁOGA ────────────────────────────────────────────────────────────────
  const fraction = readingClientPx / rootClientPx;
  if (fraction < minimumFraction)
    return {
      verdict: "collapsed",
      fraction,
      reason:
        `the reading area of ${name} on ${surface} is ${Math.round(readingClientPx)} px tall ` +
        `inside a ${Math.round(rootClientPx)} px screen — ${(fraction * 100).toFixed(1)}% of it, ` +
        `under the ${(minimumFraction * 100).toFixed(0)}% this screen is held to. ` +
        "The header and the reading switcher have eaten the row the reading lives in. " +
        "NOTHING ELSE IN THIS GATE WOULD SAY SO: nothing overflows, every box fits, and " +
        "the reading is present, scrollable and zero pixels tall",
    };

  // ── SUFIT ──────────────────────────────────────────────────────────────────
  // Ekran, którego własne chrome NIE MIEŚCI SIĘ w panelu, wraca do przewijania
  // strony — i to jest zadeklarowana degradacja, nie usterka. Trzymanie sufitu
  // również tam znaczyłoby „albo związany, albo czerwony", a jedynym wyjściem
  // byłoby zabranie czytelni podłogi. Podłoga obowiązuje w OBU stanach; sufit
  // tylko w tym, w którym da się go dotrzymać.
  const fits = rootScrollPx <= rootClientPx + tolerancePx;
  if (!fits) return { verdict: "yields", fraction };

  // MIERZONA JEST WYSOKOŚĆ SAMEGO EKRANU, NIE PRZEWIJANIE PANELU, i to jest
  // poprawka zrobiona po pierwszym czerwonym przebiegu tej kontroli: w oknie
  // 320 px panel miał 744 px treści przy 735 px pudełka, a powłoka Biblioteki
  // mieściła się w nim co do piksela. Te dziewięć pikseli należało do
  // RODZEŃSTWA powłoki w tym samym panelu. Asercja nad przewijaniem panelu
  // obciąża ekran cudzą geometrią; asercja nad WYSOKOŚCIĄ EKRANU pyta dokładnie
  // o defekt — czy ten ekran wyrasta poza swoje okno — i jest odporna zarówno na
  // rodzeństwo, jak i na to, w którym miejscu panel jest przewinięty.
  if (rootHeightPx > paneClientPx + tolerancePx)
    return {
      verdict: "unbounded",
      fraction,
      reason:
        `${name} on ${surface} is ${Math.round(rootHeightPx)} px tall in a ` +
        `${Math.round(paneClientPx)} px viewport, so the PAGE scrolls instead of the panels. ` +
        "A screen that asks for a floor (`min-height: 100%`) where it needs a BOUND " +
        "is not height-bounded — its panels never get a definite height, their own " +
        "`overflow: auto` never engages, and the whole screen scrolls as one page",
    };

  if (panelsSideBySide && readingScrollPx > readingClientPx + tolerancePx)
    return {
      verdict: "panels-scroll-together",
      fraction,
      reason:
        `the panels of ${name} on ${surface} stand side by side and the box holding them ` +
        `scrolls: ${Math.round(readingScrollPx)} px of content in a ${Math.round(readingClientPx)} px ` +
        "box. So all of them scroll at once instead of each scrolling in its own, and a reader " +
        "who scrolls a long note loses the file tree beside it — a separate defect from the page " +
        "scroll above, and invisible to it",
    };

  return { verdict: "bounded", fraction };
};

/**
 * Werdykt o CAŁYM przelocie, nie o pojedynczym ekranie.
 *
 * Istnieje wyłącznie po to, żeby ta kontrola nie mogła przejść, nie mierząc
 * niczego. Rekonesans, który znalazł ten defekt, DWA RAZY zmierzył pustkę,
 * zanim zmierzył ekran, a lot REC trafił na to samo tego samego popołudnia.
 * Liczba zmierzonych podmiotów jest więc częścią asercji, a nie ozdobą raportu,
 * i bierze się z REJESTRU (deklaracji w źródłach), a nie z tego, co przelot
 * sam znalazł — miara, którą mierzony może sobie ustawić, nie jest miarą.
 */
export const classifyHeightBoundSweep = ({ declared, measured, expected }) => {
  if (!expected) return { verdict: "not-expected", measured: measured.length };
  if (declared.length === 0)
    return {
      verdict: "no-declarations",
      measured: measured.length,
      reason:
        "no screen in the renderer declares itself height-bound, so this pass looped over " +
        "an empty set and proved nothing — an assertion that cannot fail is decoration",
    };
  const seen = new Set(measured);
  const missing = declared.filter((name) => !seen.has(name));
  if (missing.length > 0)
    return {
      verdict: "short",
      measured: measured.length,
      missing,
      reason:
        `${missing.join(", ")} declare(s) itself height-bound and this pass never measured it, ` +
        "so the pass says nothing about the one screen it exists for",
    };
  return { verdict: "measured", measured: measured.length };
};

/**
 * Czy w tym przelocie było w ogóle CO związać.
 *
 * Sufit sam przechodzi nad PUSTĄ fiksturą — ekran bez treści nigdy nie przewija
 * strony — i to jest dokładnie pułapka, w którą ta powłoka wpadła w #203.
 * Dowodem, że pomiar zastał prawdziwe przepełnienie, jest to, że gdzieś w tych
 * ekranach coś NAPRAWDĘ się przewija.
 */
export const classifyHeightBoundEvidence = ({
  scrollingSubjects,
  expected,
}) => {
  if (!expected) return { verdict: "not-expected" };
  if (scrollingSubjects > 0) return { verdict: "witnessed", scrollingSubjects };
  return {
    verdict: "nothing-overflowed",
    scrollingSubjects,
    reason:
      "not one height-bound screen held content taller than its own reading box, so the " +
      "bound was never asked to do anything. A ceiling measured over a reading that fits " +
      "is a pass over geometry nobody has, and this shell has emptied its fixture before",
  };
};
