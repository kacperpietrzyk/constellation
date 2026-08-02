// Czy PRZEPEŁNIENIE POTOMKA jest dozwolone — decyzja wyjęta z przeglądarki.
//
// Po co osobny moduł: `verify-renderer-layout.mjs` potrzebuje przeglądarki
// i serwera dev, więc nie chodzi w `npm run check` — ma w CI WŁASNE zadanie
// `layout`, na jednym systemie (uzasadnienie w nagłówku tamtego pliku). Sama
// reguła „wolno czy nie wolno" jest zwykłą funkcją nad liczbami i napisami,
// więc mieszka tutaj i ma testy, które chodzą w `check` na wszystkich trzech
// systemach — reguła jest przenośna, PIKSELE nie są.
//
// DLACZEGO TO W OGÓLE POWSTAŁO. Bramka układu mierzyła PIERWSZE DZIECKO
// powierzchni (`scrollWidth` kontra `clientWidth`) i nic poniżej. Zmierzone
// przy rekonesansie fali D, przy tekście skalowanym do 200%: bramka zwracała
// „brak przepełnienia" na WSZYSTKICH PIĘTNASTU celach, podczas gdy sześć z nich
// miało potomka wychodzącego poza własne pudełko o 53–341 px. Kontenery
// przewijania tej powłoki są zrobione tak, żeby wchłaniać szeroką treść, więc
// korzeń raportuje `scrollWidth === clientWidth` niezależnie od tego, co się
// dzieje w środku. Ekran o trzech panelach — drzewo │ lista │ treść — jest
// dokładnie tym kształtem, który się tak prześlizguje.
//
// CZTERY WYNIKI, i są to CZTERY RÓŻNE rzeczy, celowo nie jedna lista wyjątków:
//
//   "contained" — pudełko samo obcina treść (`overflow-x: hidden` albo `clip`).
//                 Nic nie wychodzi na zewnątrz, więc UKŁAD jest cały; długi
//                 tytuł ucięty wielokropkiem to ZAMIERZONE traktowanie, a nie
//                 defekt (`styles.css` — `.knowledge-document-list strong`
//                 i `.history-row-copy strong` mają wprost
//                 `overflow: hidden; text-overflow: ellipsis`). Gdyby to padało,
//                 najtańszą naprawą byłoby SKRÓCENIE FIKSTURY — czyli zabicie
//                 dokładnie tego pomiaru, dla którego ta bramka powstała.
//                 Wypisywane w trybie raportu, nieegzekwowane.
//   "declared"  — element deklaruje, że przewija się w poziomie
//                 (`[data-scrolls-horizontally]`). To KONTRAKT powierzchni:
//                 tablica lejka i szeroka tabela zadań mają prawo być szersze
//                 niż okno, ale muszą to POWIEDZIEĆ. Element z `overflow-x:
//                 auto` BEZ tej deklaracji jest przewinięciem PRZYPADKOWYM
//                 i pada — „powłoka to wchłonie" przestaje być wymówką dopiero
//                 wtedy, kiedy region sam mówi, że tak ma być.
//   "known"     — DŁUG, nie kontrakt. Wpis w rejestrze niżej z nazwanym
//                 wątkiem, który jest jego właścicielem, i ZMIERZONYM sufitem.
//                 Wpis nie zwalnia elementu z pomiaru: przekroczenie zmierzonej
//                 wartości dalej pada, więc następna fala nie pogorszy tego po
//                 cichu.
//   "violation" — treść WYCHODZI ze swojego pudełka (`overflow-x: visible`)
//                 albo przewija się bez deklaracji. To jest defekt układu.
//
// Rejestr długu jest ITEMIZOWANY i każdy wpis wskazuje właściciela. Zbiorcze
// zwolnienie („powierzchnie sprzed fali D nie liczą się") przeszłoby przez tę
// samą bramkę i nie znaczyłoby nic.

/** Atrybut, którym element deklaruje, że przewija się w poziomie z założenia. */
export const HORIZONTAL_SCROLL_ATTRIBUTE = "data-scrolls-horizontally";

/**
 * Zapas nad zmierzoną wartością długu. Układ przeglądarki potrafi się różnić
 * o pojedyncze piksele między wersjami Chromium i między maszynami, a rejestr,
 * który pada od jednego piksela zaokrąglenia, zostanie skasowany przy pierwszym
 * czerwonym przebiegu — czyli przestanie pilnować czegokolwiek. Zapas jest
 * MAŁY świadomie: 8 px nie ukryje regresji układu, a łapie zaokrąglenie.
 */
export const KNOWN_OVERFLOW_TOLERANCE_PX = 8;

/**
 * DŁUG UKŁADU ZMIERZONY, NIE ZGADNIĘTY. Każdy wpis pochodzi z przebiegu
 * `npm run test:renderer-layout` na `main` @3cfc099 i niesie wątek, do którego
 * należy. Nic tutaj nie jest robotą fali D — fala D ma tego NIE POGARSZAĆ,
 * i po to jest sufit przy każdym wpisie.
 *
 * `surface` dopasowuje się do etykiety pomiaru z prefiksu: `tasks` łapie
 * `tasks`, `tasks:board` i `tasks:task:overview`, bo to ta sama powierzchnia
 * oglądana w innym obiektywie, a rozbicie na etykiety dałoby rejestr, którego
 * nikt nie przeczyta.
 *
 * SUFIT JEST OSOBNY DLA KAŻDEGO PRZELOTU, i to nie jest ozdoba. Jeden sufit
 * wzięty z najgorszego przelotu przepuszczałby po cichu wzrost na pozostałych:
 * `span._chipDashed` ma 56 px przy 200% i 32 px przy pełnym oknie, więc wspólna
 * liczba 56 dawałaby 24 px darmowego wzrostu dokładnie tam, gdzie ten defekt
 * jest najbardziej dotkliwy — przy szerokości, przy której ekranu się używa.
 * Przelot NIEWYMIENIONY w `ceilings` znaczy „ten element NIE PRZEPEŁNIA się
 * tutaj" i przepełnienie na nim pada, tak jak każde nowe.
 */
export const KNOWN_DESCENDANT_OVERFLOWS = [
  // ── wątek skalowania interfejsu (recon fali D §3e) ────────────────────────
  // Widoczne WYŁĄCZNIE przy tekście 200% albo w oknie 320 px, czyli poniżej
  // własnego minimum produktu (`BrowserWindow minWidth: 760`). Mechanizm jest
  // wspólny dla dziewięciu powierzchni i nie jest knowledge-specific: odstępy
  // powłoki i `--surface-measure` są w `rem`, więc żądana szerokość rośnie
  // z rozmiarem czcionki, a okno nie.
  {
    surface: "projects",
    signature: "div._row",
    ceilings: {
      "text scaled to 200%": 194,
    },
    thread: "skalowanie interfejsu (recon fali D §3e) — wiersz kolekcji",
  },
  {
    surface: "tasks",
    signature: "span._plan._plan_unplanned",
    ceilings: {
      "text scaled to 200%": 65,
      "a 320 px window": 15,
    },
    thread: "skalowanie interfejsu (recon fali D §3e) — znacznik planu",
  },
  {
    surface: "tasks",
    signature: "div._cellHead",
    ceilings: {
      "text scaled to 200%": 86,
    },
    thread: "skalowanie interfejsu (recon fali D §3e) — nagłówek dnia",
  },
  // PRZEKLUCZOWANY, NIE PRZEMIANOWANY. Ten wpis stał pod `access`
  // z sygnaturą `div.member-list`; treść wsiąkła w sekcję „Access and
  // connections" Ustawień, więc zmienił się I EKRAN, I SYGNATURA — arkusz
  // jest teraz CSS Modułem, a bramka normalizuje `_memberList_4zvhy_268`
  // do `_memberList`.
  //
  // SUFIT ZMIERZONY PO PRZEPROWADZCE, nie przepisany: 18 px przy oknie
  // 320 px, ZERO przy tekście 200% — więc drugiego sufitu ten wpis nie
  // dostaje, bo brak sufitu jest naruszeniem tylko dla przelotu, w którym
  // coś naprawdę wystaje. I NIE JEST TO ZERO Z KRAWĘDZI, co ma znaczenie,
  // bo sufity są prawdą o JEDNEJ maszynie: przy 200% min-content wiersza to
  // 448 px w pudełku 500 px, czyli 52 px zapasu, więc renderowanie czcionek
  // na innym systemie nie zamieni tego przelotu w losową czerwień. Zmierzone
  // przez ustawienie liście `width: min-content` — samo `scrollWidth` NIGDY
  // nie schodzi poniżej `clientWidth`, więc „zapas 0" z tej różnicy znaczy
  // tylko „nic nie wystaje" i nie mówi nic o marginesie.
  //
  // PO DRODZE BYŁO 52 px i 14 px: scalenie wsadziło treść pod WŁASNY margines
  // Ustawień i dokładało drugi, więc pudełko listy miało 188 px zamiast 222
  // na kolumnie 224 px. Sekcja jedzie teraz przy
  // wąskim oknie na pełną szerokość kategorii i tamte 34 px wróciły —
  // dokładnie tyle, ile przeprowadzka zabrała, ani piksela więcej.
  //
  // ZOSTAJE 18 px, bo PRZYCZYNA JEST NIESPŁACONA i nie jest moja: wiersz
  // członka ma min-content 240 px (awatar 36 + odstęp 16 + tożsamość 156
  // + wyściółka 32), a kolumna sekcji przy oknie 320 px ma 224 px. To jest
  // wątek skalowania interfejsu, który koordynator odłożył ZA falę E
  // (R3-5), a nie defekt tego scalenia.
  {
    surface: "settings",
    signature: "div._memberList",
    ceilings: {
      "a 320 px window": 18,
    },
    thread:
      "skalowanie interfejsu — wiersz członka nie mieści się w kolumnie 224 px",
  },
  // ── Activity: DŁUG SPŁACONY, i dlatego nie ma tu wpisów ──────────────────
  // Stały tu DWA wpisy — `activity / h3` (53 przy 200%) i `activity / p`
  // (33 przy 200%) — opisane jako „powierzchnia `activity`, poza zakresem
  // fali D". Dziennik zmian wsiąkł w fali E w kategorię „Data and privacy"
  // Ustawień, więc oba MUSIAŁY zostać rozstrzygnięte: `unusedRegistryEntries`
  // czyni z wpisu, którego nic nie dopasowało, PORAŻKĘ.
  //
  // NAJPIERW ZMIERZONE PO PRZEPROWADZCE, nie przepisane. Pod nowym adresem
  // oba przepełnienia PRZEŻYŁY i były GORSZE: 133 px i 113 px przy 200%
  // tekstu. Sygnatury trzeba było przy tym ZAWĘZIĆ, bo gołe `h3` i `p` były
  // jednoznaczne wyłącznie dopóki `activity` było własnym ekranem — wewnątrz
  // Ustawień bramka trzyma NAJSZERSZEGO potomka o danej sygnaturze na danym
  // ekranie, więc `settings / p` zacząłby po cichu pilnować całej
  // sześciokategoriowej strony. Po zawężeniu (`h3._stateTitle`,
  // `p._stateDetail`) pomiar wskazał JEDEN element i pokazał przyczynę.
  //
  // PRZYCZYNA, ZMIERZONA A NIE ZGADNIĘTA: kolumna tekstu w stanie pustym miała
  // 13 px szerokości treści przy 146 px potrzebnych. `.empty-state`
  // (`styles.css`) jest siatką `2.25rem / 1fr / auto`, a jej reguła składania
  // stoi pod `@media (max-width: 50rem)` — pod SZEROKOŚCIĄ OKNA. Rozwala ten
  // układ SKALA TEKSTU: w `@media` `rem` liczy się od POCZĄTKOWEGO rozmiaru
  // czcionki, więc przy tekście 200% w oknie 1024 px zapytanie nie odpala,
  // a przycisk skalujący się z tekstem zabiera trzecią kolumnę. To jest zerowa
  // szerokość treści ekranu rekordu obrócona o dziewięćdziesiąt stopni — ta
  // sama klasa co nagłówek tej fali — a rejestr niósł ją jako dwa objawy.
  //
  // WPISY ZNIKAJĄ, BO ELEMENTY PRZESTAŁY SIĘ PRZEPEŁNIAĆ, a nie dlatego, że
  // bramka przestała je widzieć — to rozróżnienie, o którym mówią akapity
  // Biblioteki i ekranu rekordu niżej. DOWÓD, nie założenie: łamanie
  // `scripts/break-activity-retirement.mjs` przywraca globalny układ stanu
  // pustego w tej tafli i bramka wraca CZERWONA na obu tych sygnaturach; na
  // przywróconym drzewie jest zielona. Lekarstwem jest zapytanie KONTENEROWE
  // w module tej tafli (`activity-section.module.css`), więc stan pusty
  // żadnego innego ekranu się nie ruszył — globalna `.empty-state` należy do
  // wątku skalowania interfejsu, odłożonego ZA falę E (R3-5).
  {
    surface: "settings",
    signature: "form.status-create",
    ceilings: {
      "text scaled to 200%": 117,
      "a 320 px window": 117,
    },
    thread: "Settings poza sekcją Notes fali D",
  },
  // ── Library: DŁUG SPŁACONY, i dlatego nie ma tu wpisu ────────────────────
  // Stał tu wpis `library / div.document-editor-shell` z sufitami 494 (200%)
  // i 274 (okno 320 px) — powłoka Biblioteki o stałych torach, która nigdy nie
  // mieściła się w wąskim oknie. Właścicielem był lot ekranu Notatek fali D
  // i wpis miał zniknąć DOPIERO wtedy, kiedy wyląduje zadeklarowana kolejność
  // zwijania paneli. Wyladował: `notes.module.css` deklaruje, w jakiej
  // kolejności panele ustępują i dlaczego, a `document-editor-shell` dostał
  // `grid-template-columns: minmax(0, 1fr)` — niejawny tor `auto` był
  // wymiarowany MAX-CONTENTEM treści, więc jeden niełamliwy napis w notatce
  // rozpychał całą powłokę.
  //
  // WPIS ZNIKA, BO ELEMENT PRZESTAŁ SIĘ PRZEPEŁNIAĆ, a nie dlatego, że bramka
  // przestała go widzieć — i to jest rozróżnienie, które ten rejestr już raz
  // pomylił. DOWÓD, nie założenie: strażnik `MINIMUM_ROWS.libraryNoteBody`
  // wymaga 1 500 znaków w `.document-canvas`, a ten kanwas STOI WEWNĄTRZ
  // `document-editor-shell` — więc każdy zielony przelot, łącznie z nowymi przy
  // 364 px i przy minimalnym oknie, jest jednocześnie dowodem, że ta powłoka
  // dalej się rysuje i dalej jest mierzona. Sama zieleń bramki tego nie mówi:
  // jest tak samo zgodna z „element zniknął".

  // ── ekran rekordu Zadania: DŁUG SPŁACONY, i dlatego nie ma tu wpisów ──────
  // Stały tu TRZY wpisy — `span._chipDashed` (56 przy 200%, 32 przy pełnym
  // oknie), `p._unavailable` (78 / 44) i `article._entry` (162 / 89) — opisane
  // jako defekt przy DOMYŚLNYM rozmiarze okna, w odróżnieniu od wątku
  // skalowania interfejsu wyżej. To rozróżnienie było trafne i okazało się
  // trafne z powodu, którego nikt wtedy nie miał: te trzy przepełnienia nie
  // były trzema defektami, tylko TRZEMA OBJAWAMI JEDNEGO — potomkami ekranu
  // rekordu, którego szerokość TREŚCI wynosiła ZERO. Ekran mierzył 48 px, czyli
  // własny padding wewnętrzny, a tytuł zadania rysował się po jednym znaku
  // w wierszu. Od #178, przez cztery fale, bramkę CSS, bramkę układu i smoke
  // paczkowanej apki na trzech systemach.
  //
  // Przyczyna spłacona w `styles.css` — `.surface-scroll > *` dostało definitną
  // `inline-size: 100%`, bez której auto-marginesy w osi poprzecznej wyłączały
  // `stretch`, a `container-type: inline-size` rozwiązywał fit-content do zera.
  //
  // WPISY ZNIKAJĄ, BO ELEMENTY PRZESTAŁY SIĘ PRZEPEŁNIAĆ, a nie dlatego, że
  // bramka przestała je widzieć — to jest rozróżnienie, które ten rejestr już
  // raz pomylił i o którym mówi akapit Biblioteki wyżej. DOWÓD, nie założenie:
  // przelot `LAYOUT_DESCENDANT_REPORT=1` przed poprawką i po niej różni się
  // DOKŁADNIE o sześć wierszy — te trzy sygnatury przy obu przelotach, które
  // miały dla nich sufit — i o ANI JEDEN więcej w drugą stronę. Ekran dalej
  // jest otwierany i mierzony: strażnik `recordKinds` wymaga rekordu `task`
  // z nazwy, a nowa kontrola geometrii niżej w `verify-renderer-layout.mjs`
  // mierzy jego szerokość treści i pada, kiedy ta się zapada. Sama zieleń
  // bramki tego nie mówi: jest tak samo zgodna z „ekran zniknął".
];

/** Czy etykieta pomiaru należy do powierzchni z wpisu. */
export const matchesSurface = (label, surface) =>
  label === surface || label.startsWith(`${surface}:`);

/**
 * Jedna decyzja o jednym przepełnieniu. Świadomie NIE przyjmuje elementu DOM —
 * bierze to, co z niego odczytano, żeby dała się przetestować bez przeglądarki.
 */
export const classifyDescendantOverflow = (
  { surface, signature, overflowPx, overflowX, declaresHorizontalScroll, pass },
  registry = KNOWN_DESCENDANT_OVERFLOWS,
) => {
  if (overflowPx <= 0) return { verdict: "fits" };
  if (overflowX === "hidden" || overflowX === "clip")
    return { verdict: "contained" };
  if (declaresHorizontalScroll) return { verdict: "declared" };
  const entry = registry.find(
    (candidate) =>
      matchesSurface(surface, candidate.surface) &&
      candidate.signature === signature,
  );
  if (entry === undefined) return { verdict: "violation" };
  // Brak sufitu DLA TEGO PRZELOTU nie znaczy „wolno": znaczy, że ten element
  // się tutaj nie przepełniał, więc właśnie zaczął.
  const ceiling = entry.ceilings[pass];
  if (ceiling === undefined)
    return { verdict: "violation", thread: entry.thread };
  if (overflowPx > ceiling + KNOWN_OVERFLOW_TOLERANCE_PX) {
    return {
      verdict: "violation",
      // Osobny komunikat, bo to inna wiadomość niż „nowe przepełnienie":
      // ten element jest w rejestrze i właśnie zrobił się GORSZY.
      regressedFrom: ceiling,
      thread: entry.thread,
    };
  }
  return { verdict: "known", thread: entry.thread };
};

/**
 * Rejestr, który przestał opisywać cokolwiek, jest gorszy niż jego brak —
 * wygląda jak księga długu, a jest listą zdań o nieistniejących elementach.
 * Dlatego przebieg, w którym wpis NIE ZOSTAŁ ANI RAZU DOPASOWANY, jest błędem:
 * albo dług został spłacony i wpis ma zniknąć, albo pomiar przestał widzieć ten
 * ekran i wtedy zieleń całej bramki nic nie znaczy.
 */
export const unusedRegistryEntries = (
  matchedSignatures,
  registry = KNOWN_DESCENDANT_OVERFLOWS,
) =>
  registry.filter(
    (entry) => !matchedSignatures.has(`${entry.surface}|${entry.signature}`),
  );
