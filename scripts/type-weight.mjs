// Czy NARYSOWANA WAGA KROJU należy do skali, którą tokeny DEKLARUJĄ —
// decyzja wyjęta z przeglądarki.
//
// Po co osobny moduł, ten sam powód co przy `descendant-overflow.mjs`:
// `verify-renderer-layout.mjs` potrzebuje przeglądarki i serwera dev, więc nie
// chodzi w `npm run check`. Sama reguła („czy ta waga jest stopniem skali",
// „czy ten dług jest zapisany", „czy wpis rejestru jeszcze cokolwiek opisuje")
// jest zwykłą funkcją nad liczbami i napisami, więc mieszka tutaj i ma testy,
// które chodzą w `check` na wszystkich trzech systemach. Reguła jest
// przenośna, PIKSELE nie są — a skala wag nie jest nawet pikselem.
//
// ── DLACZEGO TO POWSTAŁO (przyrząd P5 Fazy I, 2026-08-13) ────────────────────
//
// Prototyp v3 używa DOKŁADNIE czterech wag i ani jednej innej: 400 (3
// deklaracje), 500 (64), 600 (85), 700 (3). Aplikacja miała w chwili
// postawienia tego przyrządu DZIEWIĘĆ wartości poza tym zbiorem — 550, 560,
// 570, 580, 590, 620, 630, 650, 750, razem 92 deklaracje — i NIC tego nie
// mierzyło. Trzy pary w `visual-language-pairs.mjs` czytają `fontWeight`
// (`D2-01b`, `D2-01d`, `L5-04`) i wszystkie trzy są asercjami o JEDNYM
// podmiocie z JEDNĄ wpisaną liczbą; żadna nie pyta o PRZYNALEŻNOŚĆ do zbioru,
// bo zbiór nie istniał jako dana po żadnej stronie. Sam przyrząd, który wagę
// mierzy (`judgeRecordTitleBand`), wypisywał ją z dopiskiem „reported, not
// judged" — czyli pomiar bez osądu, a reguła nieosądzona to reguła
// NIEZMIERZONA.
//
// ── CZYM TEN PRZYRZĄD NIE JEST ───────────────────────────────────────────────
//
// NIE JEST listą dziewięciu wartości do wyplenienia. Lista wartości to lista
// OBJAWÓW, a „ręczna lista obok zamkniętego słownika" jest w tym repozytorium
// nazwaną klasą defektu — trafiła w nie sześć razy. Dlatego zbiór dozwolony
// jest CZYTANY Z DEKLARACJI (`--weight-*` w `packages/desktop-ui/src/tokens.css`)
// i pytanie brzmi „czy ta waga jest stopniem tej skali", a nie „czy ta waga
// jest jedną z dziewięciu, które kiedyś spisałem".
//
// ── CZTERY WYNIKI, I SĄ TO CZTERY RÓŻNE RZECZY ───────────────────────────────
//
//   "no-scale"   — `tokens.css` nie deklaruje ANI JEDNEGO stopnia. To nie jest
//                  werdykt o produkcie, tylko AWARIA PRZYRZĄDU: nie ma zbioru,
//                  którego członkiem cokolwiek mogłoby być. Pada zawsze,
//                  niezależnie od tego, czy właściciel pozycji dowiózł.
//   "in-scale"   — waga jest jednym z zadeklarowanych stopni. Cisza, ale
//                  LICZONA — sam licznik naruszeń nie odróżnia „zero naruszeń"
//                  od „zero pomiarów".
//   "known-debt" — DŁUG, nie licencja. Wpis w rejestrze niżej z nazwanym
//                  właścicielem i wskazanym arkuszem. Wpis nie zwalnia z
//                  pomiaru: ZMIANA wartości na inną spoza skali dalej pada, bo
//                  wpis wiąże sygnaturę Z KONKRETNĄ liczbą. REJESTR JEST DZIŚ
//                  PUSTY (lot L5 Fazy II), więc ten werdykt nie zapada na
//                  niczym — powód i cena stoją przy samej tablicy.
//   "violation"  — waga spoza skali, której nikt nie zarejestrował. Nowy
//                  rozjazd ma padać w dniu, w którym ląduje.
//
// KTÓRA STRONA DAJE ZBIÓR: nazwy i wartości czyta `verify-renderer-layout.mjs`
// Z ARKUSZA (bo osądza w Node, po zamknięciu strony), a przeglądarka jest
// pytana o TE SAME nazwy osobno — rozjazd arkusz↔korzeń jest nazwaną awarią
// (`TYPE_WEIGHT_SCALE_NOT_LIVE`), a nie cichym wyborem jednej ze stron.
//
// ── DLACZEGO KLUCZEM JEST `sygnatura|waga`, A NIE `powierzchnia|sygnatura` ───
//
// To jest różnica wobec obu rejestrów w `descendant-overflow.mjs` i jest
// zamierzona. Przepełnienie jest GEOMETRIĄ: ten sam element przepełnia się na
// jednym ekranie i mieści na drugim, więc wpis MUSI nieść powierzchnię i sufit
// per przelot. Waga kroju jest własnością REGUŁY ARKUSZA: `.eyebrow` niesie
// 650 wszędzie, gdzie się narysuje, bo tak stoi w `styles.css`. Rejestr
// z wymiarem powierzchni byłby więc rejestrem TRASY PRZELOTU, a nie długu —
// jeden zapis chromu powłoki musiałby mieć tyle wpisów, ile przystanków ma
// bramka, i psułby się przy każdej zmianie fikstury.
//
// Powierzchnie, na których wagę ZOBACZONO, są w rejestrze RAPORTOWANE
// (`surfaces`), a nie asertowane — bo to fakt o zasięgu przelotu, nie o długu.

/**
 * Nazwy stopni czytane Z ARKUSZA, w kolejności deklaracji.
 *
 * KOMENTARZE WYCIĘTE, I TO JEST WARUNEK, ŻEBY ZŁAMANIE B1 COKOLWIEK DOWODZIŁO.
 * `tokens.css` wypisuje nazwy tych czterech stopni PROZĄ, w komentarzu nad
 * deklaracjami. Parser czytający surowy tekst znalazłby je tam po skasowaniu
 * samych deklaracji i oddał pełną skalę nad arkuszem, który jej nie ma — czyli
 * dokładnie ten fałszywy spokój, któremu ten przyrząd ma zapobiegać. Cięcie
 * jest przepisane z `css-token-lint.test.ts` i z `declaredStickyRules()`:
 * komentarz zastępowany jest tyloma znakami nowej linii, ile miał, żeby `^`
 * dalej widziało deklarację stojącą pod nim.
 *
 * Wartość z arkusza jest tu zwracana WYŁĄCZNIE po to, żeby dało się ją
 * porównać z tym, co oddaje żywy korzeń. Werdykt o wadze bierze wartości
 * z przeglądarki — odczyt samej deklaracji jest kontrolą ŹRÓDŁA, a nie
 * kontrolą tego, co się narysowało.
 */
export const declaredWeightScale = (tokensCssText) => {
  const code = tokensCssText.replace(/\/\*[\s\S]*?\*\//gu, (comment) =>
    "\n".repeat((comment.match(/\n/gu) ?? []).length),
  );
  const found = [];
  const seen = new Set();
  for (const match of code.matchAll(
    /^\s*(--weight-[a-zA-Z0-9-]+)\s*:\s*([^;]+);/gmu,
  )) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    found.push({ name, value: match[2].trim() });
  }
  return found;
};

/**
 * DŁUG WAGI: SPŁACONY, NIE ZAPOMNIANY. Ta tablica jest dziś PUSTA i to jest
 * dowieziony stan, a nie brak pomiaru — lot L5 Fazy II przepisał na stopnie
 * skali WSZYSTKIE 92 deklaracje obcych wag w arkuszach aplikacji, czyli
 * dziewięć wartości (550, 560, 570, 580, 590, 620, 630, 650, 750) w 34
 * arkuszach. Przed tym lotem stały tu 46 wpisów: tyle par `sygnatura|waga`
 * poza skalą narysował przelot z 2026-08-13, bo 92 deklaracje w arkuszach to
 * NIE 92 narysowane elementy — część reguł opisuje stany puste, dialogi
 * i popovery, których fikstura nie rysuje.
 *
 * TRZY LICZBY, KTÓRE ZNACZĄ TRZY RÓŻNE RZECZY, i mieszanie ich jest sposobem,
 * w jaki lot wygląda na dowieziony:
 *   * 92 — deklaracje w arkuszach (grep, przepisane co do jednej);
 *   * 46 — pary `sygnatura|waga`, które przelot NARYSOWAŁ (rejestr, dziś zero);
 *   *  4 — wpisy rejestru rozjazdów, które plan lotu przewidywał (P-12, 2-4,
 *          3-8, 12-3). Plan liczył OBJAWY widoczne przy tej fiksturze.
 *
 * CZEGO TEN LOT NIE ZMIERZYŁ, MIMO ŻE PRZEPISAŁ — I JEST TEGO WIĘKSZOŚĆ, NIE
 * GARSTKA. Pierwsza wersja tego akapitu wyliczała zbiór niezmierzony jako
 * CZTERY pozycje (570, 750 i `.trustBoundary`). To była nieprawda i obala ją
 * pomiar, nie zdanie. Przelot z 2026-08-13 wypisał „0 unregistered, 46
 * registered debt(s)", więc te 46 kluczy `sygnatura|waga` to WSZYSTKIE obce
 * wagi, jakie którykolwiek przelot NARYSOWAŁ — gdyby narysował 47., wrócił
 * by czerwony. Zestawione z 92 podstawieniami daje to trzy liczby:
 *   * 42 z 92 podstawionych linii wskazuje pole `sheet` któregoś z 46 wpisów,
 *     czyli mają ŚWIADKA — z zastrzeżeniem, które stoi niżej przy kształcie
 *     wpisu: `sheet` to NAJLEPSZY DOWÓD, nie pewnik, bo `font-weight` dziedziczy;
 *   * 50 z 92 nie wskazuje żaden wpis. O nich przelot nie powiedział NIC;
 *   * 33 z tych 50 stoi w regule, która nie może wyprodukować ŻADNEGO
 *     z narysowanych kluczy o tej wadze (podmiot selektora ma inny znacznik
 *     albo inną klasę) — te są niezmierzone dowodliwie, a nie tylko bez świadka.
 * Skrajny przypadek: waga 580 ma 11 podstawień i JEDEN narysowany klucz
 * (`h1._title`); 570 i 750 mają po zerze kluczy, więc żadna z ich trzech
 * deklaracji nie mogła się narysować. Wszystkie 92 są przepisane u ŹRÓDŁA
 * i to jest wszystko, co o pięćdziesięciu z nich wolno powiedzieć —
 * NIE ZMIERZONE, nie „przeszło". Populacja po tej stronie to dialogi, stany
 * puste, `capture-*`, `recovery-*`, `shortcuts-*` i `undo-dialog`, czyli
 * dokładnie to, czego fikstura harnessu nie rysuje.
 *
 * CZEGO NIE OBEJMUJE UZASADNIENIE „TOKEN, NIE LITERAŁ": lot podstawił token
 * tam, gdzie waga BYŁA POZA SKALĄ, i tylko tam. W arkuszach źródłowych
 * pakietów stoi dziś 126 literałów W SKALI (400×8, 500×55, 600×60, 700×3) plus jeden
 * w skrócie `font:`. Nie są zaległością tego lotu — jego zakresem było
 * dziewięć wartości spoza skali — ale argument „arkusz psuje się RAZEM ze
 * skalą" ich NIE DOTYCZY, a bez tego zdania czytałby się, jakby dotyczył.
 *
 * CO TEN LOT ZEPSUŁ SAM, I MÓWIMY TO JAKO REGRESJĘ, A NIE JAKO ZASTANY OGON:
 * `kbd` (`styles.css`, reguła nad `.primary-button kbd`) stoi 600. PRZED tym
 * lotem przycisk stał 650, czyli skrót był LŻEJSZY od etykiety, którą wycisza;
 * po zejściu przycisku na 500 jest CIĘŻSZY. Relację odwrócił ten lot.
 * Prototyp nie deklaruje wagi dla `.btn .kbd` w ogóle: dziedziczy ją
 * z przycisku i tłumi kryciem 0,6 (`v3/app.css:334`), czyli w prototypie skrót
 * ma DOKŁADNIE wagę przycisku. Obie liczby (600 i 500) należą do skali, więc
 * reguła tego pliku milczy i milczeć powinna — dlatego zapis stoi tutaj.
 * WARUNEK WYJŚCIA: `kbd` bierze wagę z przycisku (albo `var(--weight-medium)`
 * globalnie), ale `kbd` jest regułą ELEMENTU, używaną też w omniboksie,
 * w nawigacji i w arkuszu skrótów, więc to szersza decyzja niż sam przycisk
 * i osobny lot — nie cicha poprawka doklejona do tego.
 *
 * PUSTA TABLICA ZMIENIA TO, CO POTRAFI BRAMKA, i mówimy to wprost:
 * `TYPE_WEIGHT_UNUSED_ENTRY` nie ma dziś po czym iterować, więc ta asercja
 * jest NIEODPALALNA aż do pierwszego nowego wpisu. Uzbrojone zostają trzy:
 * `TYPE_WEIGHT_NO_DECLARED_SCALE`, `TYPE_WEIGHT_SWEEP_MEASURED_NOTHING`
 * i `TYPE_WEIGHT_UNREGISTERED` — a ta ostatnia jest TOTALNA nad każdą wagą
 * spoza skali, KTÓRĄ PRZELOT NARYSUJE. Nie nad każdą, jaka stoi w arkuszach:
 * reguła na ekranie, którego fikstura nie dosięga, nie zapala niczego, i to
 * jest ta sama granica, o której mówi akapit „czego ten lot nie zmierzył".
 *
 * CO ZNIKŁO RAZEM Z WPISAMI, I DLACZEGO COŚ MUSIAŁO WEJŚĆ NA TO MIEJSCE.
 * 46 wpisów było nie tylko księgą długu — każdy był CZUJNIKIEM POKRYCIA.
 * Dopóki stały, zapaść przelotu (mniej odwiedzonych ekranów, martwy marker
 * przybycia) wypisywała 46 wierszy `TYPE_WEIGHT_UNUSED_ENTRY` i bramka robiła
 * się czerwona. Po ich spłacie jedynym progiem został `readings.length === 0`,
 * czyli próg, którego nie przekroczy nawet przelot zredukowany do jednego
 * ekranu — sam pasek boczny zawsze coś narysuje. Dlatego lot naprawczy dołożył
 * `TYPE_WEIGHT_SURFACE_MEASURED_NOTHING` w `verify-renderer-layout.mjs`: pyta
 * PER PRZELOT, czy każdy cel, który ten przelot zamierzał odwiedzić, wniósł
 * choć jeden odczyt. Nie jest to podłoga na LICZBĘ odczytów i celowo — ta
 * liczba maleje zgodnie z prawem, kiedy klucze się zwijają: ten lot zszedł
 * z 340 kluczy na 325, bo `h2|560`, `h2|590` i `h2|620` sklejają się w jeden
 * `h2|600`. I MÓWIMY, CZEGO TA LICZBA NIE ZNACZY: wydruk podaje liczbę KLUCZY
 * mapy `sygnatura|waga`, a nie liczbę osądzonych ELEMENTÓW. Przyrząd liczby
 * elementów nie zna, więc „zwinęło się, a nie skurczyło" jest wnioskiem
 * z kształtu klucza, nie odczytem z wydruku — i dlatego rozróżnia je dopiero
 * asercja pokrycia niżej, a nie porównanie dwóch liczb odczytów.
 *
 * KSZTAŁT WPISU ZOSTAJE UDOKUMENTOWANY, bo tablica pusta nie uczy nikogo, co
 * wpisać. Wpis niesie `signature` (znacznik + klasy po zdjęciu hasha modułu,
 * czyli klucz, który widzi przeglądarka), `weight`, `sheet` (arkusz i linia —
 * NAJLEPSZY DOWÓD, nie pewnik: `font-weight` dziedziczy, więc numer wskazuje
 * regułę, z której waga PRZYSZŁA), `surfaces` (RAPORT z przebiegu, nie
 * asercja), `owner` i `thread`. Klucz to `sygnatura|waga`, nie
 * `powierzchnia|sygnatura`, bo waga jest własnością REGUŁY ARKUSZA, a nie
 * geometrii ekranu — powody stoją w nagłówku pliku i się nie zmieniły.
 *
 * @type {Array<{signature: string, weight: number, sheet: string, surfaces: string, owner: string, thread: string}>}
 */
export const KNOWN_OFF_SCALE_WEIGHTS = [];

/** Klucz rejestru: reguła arkusza, nie miejsce, w którym ją zobaczono. */
export const weightKey = ({ signature, weight }) => `${signature}|${weight}`;

/**
 * Jedna decyzja o jednej narysowanej wadze. Świadomie NIE przyjmuje elementu
 * DOM — bierze to, co z niego odczytano, żeby dała się przetestować bez
 * przeglądarki.
 *
 * `allowed` to zbiór wartości Z ARKUSZA, podany jako napisy, bo
 * `getComputedStyle` oddaje napisy. **Nie są to wartości rozwiązane w żywym
 * korzeniu i mówimy to wprost**: `judgeRecordTitleBand` osądza w Node, gdzie
 * żywego korzenia już nie ma, więc zbiór musi być gotowy przed przelotem.
 * Druga strona doktryny stoi obok, jako osobna nazwana awaria: przelot pyta
 * korzeń o TE SAME nazwy i rozjazd arkusz↔korzeń pada jako
 * `TYPE_WEIGHT_SCALE_NOT_LIVE`, a nazwa rozwiązana do pustego napisu jako
 * `TYPE_WEIGHT_NO_DECLARED_SCALE`. Sam odczyt arkusza jest kontrolą ŹRÓDŁA
 * i sam by nie wystarczył.
 *
 * Pusty zbiór NIE ZNACZY „nic nie wolno" — znaczy, że przyrząd nie ma o co
 * pytać, i to jest osobny werdykt.
 */
export const classifyTypeWeight = (
  { signature, weight, allowed },
  registry = KNOWN_OFF_SCALE_WEIGHTS,
) => {
  if (allowed === undefined || allowed.size === 0)
    return { verdict: "no-scale" };
  if (allowed.has(String(weight))) return { verdict: "in-scale" };
  const entry = registry.find(
    (candidate) =>
      candidate.signature === signature &&
      String(candidate.weight) === String(weight),
  );
  if (entry === undefined) return { verdict: "violation" };
  return { verdict: "known-debt", thread: entry.thread, owner: entry.owner };
};

/**
 * Rejestr, który przestał opisywać cokolwiek, jest gorszy niż jego brak —
 * wygląda jak księga długu, a jest listą zdań o nieistniejących regułach.
 * Ta sama kontrola co `unusedRegistryEntries`, nad trzecim rejestrem.
 *
 * ROZLICZANE GLOBALNIE, PO WSZYSTKICH PRZELOTACH, nie per przelot: dwa z pięciu
 * przelotów geometrii chodzą wyłącznie po Bibliotece, więc rozliczenie per
 * przelot zapaliłoby fałszywy `UNUSED_ENTRY` na każdej wąskiej geometrii.
 */
export const unusedWeightEntries = (
  seenKeys,
  registry = KNOWN_OFF_SCALE_WEIGHTS,
) => registry.filter((entry) => !seenKeys.has(weightKey(entry)));
