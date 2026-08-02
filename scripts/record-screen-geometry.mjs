// Czy korzeń ekranu rekordu MA JESZCZE SZEROKOŚĆ TREŚCI — decyzja wyjęta
// z przeglądarki.
//
// PO CO TO ISTNIEJE, i to jest jedyny akapit, który naprawdę trzeba przeczytać.
// Bramka układu obok mierzy WYŁĄCZNIE `scrollWidth > clientWidth`, czyli pyta,
// czy treść wychodzi ze SWOJEGO pudełka. Nigdy nie pytała, czy pudełko ma
// jakikolwiek sens. Ekran rekordu Zadania miał ZEROWĄ szerokość treści od #178:
// mierzył 48 px, czyli własny padding wewnętrzny, a tytuł zadania rysował się
// po jednym znaku w wierszu. Bramka zgłosiła z tego ekranu trzy przepełnienia
// potomków — +32 na `span._chipDashed`, +44 na `p._unavailable`, +89 na
// `article._entry` — i KAŻDA Z TYCH LICZB BYŁA PRAWDZIWA. Nie zgłosiła nigdy,
// że rodzic tych trzech elementów nie ma szerokości. Cztery fale, bramka CSS,
// bramka układu i smoke paczkowanej apki na trzech systemach przeszły nad
// ekranem, który się nie rysował.
//
// To jest ósmy przyrząd tego programu kłamiący w stronę fałszywego spokoju
// i PIERWSZY, który skłamał BĘDĄC ŚCISŁYM CO DO NIEWŁAŚCIWEJ RZECZY. Dlatego
// ta kontrola mierzy w DRUGĄ STRONĘ niż tamta: nie „czy coś wystaje", tylko
// „czy zostało jeszcze miejsce w środku".
//
// REGUŁA JEST NAD KSZTAŁTEM, NIE NAD LISTĄ EKRANÓW. Przypięta lista
// `{ tasks: 772, projects: 1140 }` byłaby ręczną listą obok zamkniętego
// słownika — rodziną, którą to repozytorium płaci od czterech fal i która ma
// dwadzieścia żywych miejsc — a do tego listą PIKSELI, czyli asercją gnijącą
// przy pierwszej zmianie odstępu. Zamiast tego: podmioty bierze się z DOM-u po
// `[data-record-kind]` (czyli z rejestru rodzajów rekordu, bo to on decyduje,
// co się rysuje), a próg jest UŁAMKIEM tego, na co pozwala reguła wymiarująca
// ten element. Czwarty rodzaj rekordu jest objęty w dniu, w którym powstaje,
// bez dopisywania czegokolwiek tutaj.
//
// Sam pomiar wymaga przeglądarki, więc siedzi w `verify-renderer-layout.mjs`.
// Sama REGUŁA jest funkcją nad liczbami i mieszka tutaj — chodzi w `npm run
// check` na wszystkich trzech systemach, tak samo i z tego samego powodu co
// `descendant-overflow.mjs`: reguła jest przenośna, PIKSELE nie są.

/**
 * Ile najmniej z przysługującej szerokości musi zostać ekranowi rekordu.
 *
 * DLACZEGO POŁOWA, a nie „prawie wszystko". Próg ma łapać ZAPAŚĆ, nie pilnować
 * układu: ekran rekordu wolno zwęzić szyną, marginesem czytelności albo własnym
 * `max-width`, i asercja, która by na to padała, zostałaby skasowana przy
 * pierwszym czerwonym przebiegu — czyli przestałaby pilnować czegokolwiek.
 *
 * Połowa jest jednocześnie WYSTARCZAJĄCO OSTRA, i to jest zmierzone, a nie
 * przyjęte. Trzy sondy z rekonesansu na tym samym ekranie: defekt dawał 0.00,
 * `container-type: normal` — czyli lekarstwo POŁOWICZNE, które wygląda na
 * naprawę — dawał 365/820 = **0.445**, a pełna naprawa 1.00. Próg 0.5 odrzuca
 * obie pierwsze i przyjmuje trzecią.
 */
export const MINIMUM_RECORD_CONTENT_FRACTION = 0.5;

/**
 * Na co reguła wymiarująca POZWALA temu ekranowi.
 *
 * Nie sama szerokość panelu, i to nie jest drobiazg: `.surface-scroll > *` ma
 * `max-width: var(--surface-measure)`, więc w bardzo szerokim oknie ekran jest
 * węższy od panelu CAŁKIEM ZGODNIE Z PROJEKTEM. Porównanie z samym panelem
 * dałoby asercję, która robi się czerwona od rozciągnięcia okna — trzecia
 * odmiana „asercji z zapalnikiem czasowym", tylko zapalnikiem jest tu monitor
 * czytającego, a nie kalendarz.
 */
export const allowedRecordContentWidth = ({ paneContentPx, maxWidthPx }) =>
  maxWidthPx === undefined ||
  maxWidthPx === null ||
  !Number.isFinite(maxWidthPx)
    ? paneContentPx
    : Math.min(paneContentPx, maxWidthPx);

/**
 * Jeden werdykt o jednym ekranie rekordu. Świadomie NIE przyjmuje elementu DOM —
 * bierze to, co z niego odczytano, żeby dała się przetestować bez przeglądarki.
 *
 * `contentPx` to szerokość TREŚCI, czyli `clientWidth` bez paddingu w osi
 * poziomej. Ta różnica jest całym pomiarem: zapadnięty ekran miał `clientWidth`
 * równy 48 i szerokość treści równą ZERO, więc kontrola nad samym `clientWidth`
 * widziałaby czterdzieści osiem pikseli i uznała, że coś tam jest.
 */
export const classifyRecordScreenGeometry = ({
  kind,
  surface,
  contentPx,
  paneContentPx,
  maxWidthPx,
  minimumFraction = MINIMUM_RECORD_CONTENT_FRACTION,
}) => {
  // Panel bez szerokości znaczy, że pomiar zastał ekran, którego nie ma na
  // ekranie — a ułamek z zerowym mianownikiem to nie wynik, tylko cisza
  // z liczbą. Osobny werdykt, bo to awaria PRZYRZĄDU, nie układu.
  if (!Number.isFinite(paneContentPx) || paneContentPx <= 0)
    return {
      verdict: "unmeasurable",
      reason:
        `the pane holding the ${kind} record on ${surface} has no width of its own, ` +
        "so any fraction measured against it is arithmetic over nothing",
    };
  if (!Number.isFinite(contentPx) || contentPx < 0)
    return {
      verdict: "unmeasurable",
      reason: `the ${kind} record on ${surface} reported no content width at all`,
    };
  const allowed = allowedRecordContentWidth({ paneContentPx, maxWidthPx });
  const fraction = contentPx / allowed;
  if (fraction >= minimumFraction)
    return { verdict: "roomy", fraction, allowed };
  return {
    verdict: "collapsed",
    fraction,
    allowed,
    reason:
      `the ${kind} record screen on ${surface} has ${Math.round(contentPx)} px of CONTENT width ` +
      `where the rule sizing it allows ${Math.round(allowed)} px — ${(fraction * 100).toFixed(1)}% of it, ` +
      `under the ${(minimumFraction * 100).toFixed(0)}% this screen is held to. ` +
      "A screen root this narrow does not render its own header, and NOTHING ELSE IN THIS GATE " +
      "WOULD SAY SO: the descendant sweep asks whether content leaves its box, which stays true " +
      "and stays useless while the box itself has nothing in it",
  };
};

/**
 * Werdykt o CAŁYM przelocie, nie o pojedynczym ekranie.
 *
 * Istnieje wyłącznie po to, żeby ta kontrola nie mogła przejść, nie mierząc
 * niczego. Bramka, w której siedzi, przeszła już raz nad zerową liczbą
 * rekordów, a rekonesans, który znalazł ten defekt, dwa razy zmierzył pustkę,
 * zanim zmierzył ekran. Pusty pomiar jest awarią przyrządu, nie wynikiem —
 * i dlatego LICZBA ZMIERZONYCH KORZENI jest częścią asercji, a nie ozdobą
 * raportu.
 */
export const classifyRecordScreenSweep = ({ measured, expected }) => {
  if (!expected) return { verdict: "not-expected", measured };
  if (measured <= 0)
    return {
      verdict: "measured-nothing",
      measured,
      reason:
        "no record screen root was measured for content width, so this pass says nothing " +
        "about whether any record still renders — an empty measurement is a broken " +
        "instrument, not a pass",
    };
  return { verdict: "measured", measured };
};
