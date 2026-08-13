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
  // ── CRM: PIERWSZE CZTERY WPISY ZMIERZONE, A NIE ODZIEDZICZONE ─────────────
  // Fala C dowiozła cztery ekrany CRM, a ta bramka nie zobaczyła ani jednego
  // zapełnionego — harness nie odpowiadał na `relationship.workspace` w ogóle,
  // więc Lejek, Odnowienia, Relacje i Ludzie rysowały odmowę odczytu i każdy
  // przelot był zielony nad geometrią, której nie było. Fikstura z fali E je
  // zapełnia i to są cztery przepełnienia, które bramka zobaczyła PIERWSZY RAZ.
  //
  // WSZYSTKIE CZTERY NALEŻĄ DO WĄTKU SKALOWANIA INTERFEJSU, i to jest twierdzenie
  // O DWÓCH POŁOWACH, z których druga jest nośna: pojawiają się przy tekście
  // 200% albo w oknie 320 px, i NIE POJAWIAJĄ SIĘ przy oknie 1440 px, na którym
  // produkt stoi. Gdyby choć jedno wystawało przy domyślnym rozmiarze, nie
  // byłoby materiałem tego wątku i musiałoby zostać naprawione w tej fali —
  // dokładnie to rozróżnienie zrobił rejestr fali D dla trzech wpisów ekranu
  // rekordu Zadania i wyłącznie dzięki niemu ta fala znalazła ekran rysujący
  // tytuł po jednym znaku w wierszu. Wątek jest odłożony ZA falę E (R3-5).
  //
  // Sufity zmierzone przelotem `LAYOUT_DESCENDANT_REPORT=1` na tej gałęzi, po
  // zasianiu fikstury. Fikstura jest materiałem DEWELOPERSKIM: każda z tych
  // liczb jest zdaniem o JEJ kształcie, nie o workspace'ie Kacpra.
  {
    surface: "organizations",
    signature: "span._nameLine",
    ceilings: {
      "text scaled to 200%": 61,
      "a 320 px window": 43,
    },
    thread:
      "skalowanie interfejsu (R3-5, za falą E) — nazwa klienta w wierszu relacji",
  },
  // ── SPŁACONY I SKASOWANY: `people` / `span._parts`, 2026-08-12 ────────────
  // Stał tu wpis z sufitami 25 px (tekst 200%) i 24 px (okno 320 px) na pasie
  // uczestnictwa, z wątkiem „skalowanie interfejsu (R3-5, za falą E)". Nie jest
  // to podniesienie sufitu ani przeniesienie długu — przepełnienie PRZESTAŁO
  // ISTNIEĆ w każdym z trzech przelotów, i jest to zmierzone przed i po:
  //
  //   przelot           | przed | po | plakietka ↔ tor
  //   1440 px           |  +0   | +0 | 54,1 px w torze 259 px
  //   tekst 200% (1024) |  +25  | +0 | 99,0 w 73,5  →  166,2 w 166,2
  //   okno 320 px       |  +21  | +0 | 54,1 w 33    →   89,4 w 89,4
  //
  // PRZYCZYNA NIE ZGADZAŁA SIĘ Z ZAPISANĄ. Wpis był prowadzony jako „rozbicie
  // kontaktu przy skalowaniu", czyli jako defekt SKALI. Lot D9 zmierzył tor,
  // a nie treść: plakietka „3 deals" nie mieściła się w swoim torze także BEZ
  // glifu — tor `minmax(0, 1fr)` kazał ustępować jedynej komórce wiersza, która
  // nie umie się skrócić, podczas gdy pięć komórek obok niosło
  // `text-overflow: ellipsis` i stało. To jest defekt KOLEJNOŚCI USTĘPOWANIA,
  // strukturalny, i mieszkał w cudzym wątku tylko dlatego, że pokazywał się
  // dopiero przy ciasnym wierszu. Poprawka: `minmax(min-content, 1fr)` na
  // trzecim torze `.row` (`people/people.module.css`), uzasadniona przy regule.
  //
  // CZEGO TA SPŁATA NIE ZAŁATWIA, powiedziane wprost, żeby skasowany wpis nie
  // czytał się szerzej, niż był: (1) tory przestały być identyczne w każdym
  // wierszu przy ciasnej szerokości — `min-content` zależy od treści wiersza,
  // więc przy 200% i przy 320 px kolumny listy nie stoją już w jednej linii
  // (przy 1440 px stoją, bo udział 1fr jest tam większy niż `min-content`);
  // (2) nazwa oddaje przy 200% około 43 px na rzecz plakietki. Oba są mniejsze
  // od tego, co było: plakietka rysowała się PO WIERZCHU kolumny kontaktu, bo
  // `.parts` nie ma i nie miała `overflow: hidden`.
  // ── SPŁACONY I SKASOWANY: `people` / `b._absent`, 2026-08-12 ──────────────
  // Stał tu wpis z sufitami 19 px (tekst 200%) i 16 px (okno 320 px) na „Never
  // met", z wątkiem „skalowanie interfejsu (R3-5, za falą E)". Skasowany jako
  // UBOCZNY SKUTEK innej poprawki i to jest cała historia: lot D9 zasiał
  // spotkania, przez co po raz pierwszy narysowała się DRUGA gałąź tej samej
  // komórki — data zamiast „Never met" — i wyszła ze swojego toru jako świeże
  // naruszenie (`people` / `b`, +34 px przy 200%, +22 px przy 320 px).
  // Przyczyna okazała się wspólna dla obu gałęzi: `.met b` była jedyną komórką
  // tekstową tego wiersza BEZ `overflow: hidden; text-overflow: ellipsis;
  // white-space: nowrap`, które sześć sąsiednich niesie od początku. Dopisanie
  // ich zdejmuje werdykt z obu gałęzi naraz — obie są dziś `contained`, czyli
  // treścią, dla której wielokropek JEST zamierzonym potraktowaniem.
  //
  // NIE JEST TO PRZEKWALIFIKOWANIE POD ZIELEŃ, i różnica jest sprawdzalna:
  // odmówiono dokładnie tego samego ruchu na `span._parts` w tym samym locie,
  // bo tam treścią jest LICZNIK, a ucięty licznik nie wygląda na ucięty, tylko
  // na inną liczbę. Pas uczestnictwa dostał zamiast tego więcej miejsca.
  // Uzasadnienie obu decyzji stoi przy regułach w `people/people.module.css`.
  // ── SPŁACONY I SKASOWANY: `renewals` / `div._money`, 2026-08-07 ────────────
  // Stał tu wpis z sufitami 19 px (tekst 200%) i 54 px (okno 320 px) na kwotę
  // przy umowie, z wątkiem „skalowanie interfejsu (R3-5, za falą E)". Przelot
  // odbioru lotów 2-4 zgłosił go jako NIGDY NIETRAFIONY w żadnym przebiegu —
  // czyli w tym rejestrze jako „albo naprawione i wpis ma zniknąć, albo bramka
  // przestała widzieć ten ekran".
  //
  // ROZSTRZYGNIĘTE NA PIERWSZE, I TO DWUCZĘŚCIOWYM DOWODEM, a nie założeniem:
  //   (1) EKRAN BYŁ ZAMIATANY — ten sam przebieg zgłosił NOWE przepełnienie na
  //       `renewals` przy oknie 320 px (`div._viewbar`), więc powierzchnia
  //       została odwiedzona i zmierzona przy obu istotnych szerokościach;
  //   (2) WIERSZE SIĘ RYSOWAŁY — pary L3-04 i L3-05 policzyły żywe glify
  //       wewnątrz wierszy odnowień na tym samym przelocie, więc podmiot nie
  //       zniknął z ekranu.
  // Skoro ekran jest zamiatany, a wiersze narysowane, to brak trafienia znaczy
  // brak przepełnienia. Zapłacił je lot 3, pozycja 1: `flex-wrap: wrap` na obu
  // pigułkach kwoty (`renewals.module.css`, `.outlookAssumed`/`.outlookReal`)
  // zamienia min-content pudełka z SUMY dzieci na NAJSZERSZE dziecko.
  //
  // DOWÓD (1) JEST JUŻ NIEODTWARZALNY I DLATEGO STOI TU JEGO NASTĘPCA. Faza
  // poprawek tego samego dnia skasowała `white-space: nowrap` z `.count`, więc
  // przepełnienie `div._viewbar`, na które powołuje się punkt (1), NIE ZACHODZI
  // od tamtej poprawki — kto uruchomi bramkę dziś, zobaczy czysty przebieg
  // i może wziąć tamten dowód za zmyślony. Dowód zastępczy, zmierzony przy
  // osadzie lotów 2-4: w przebiegu „a 320 px window" spis tytułów ekranu
  // wymienia `renewals` wśród zmierzonych powierzchni, a przebieg kończy się
  // „no overflow" — czyli ekran jest odwiedzany przy tej szerokości i jest
  // czysty. To ta sama teza co (1), tylko na obserwacji, która się powtarza.
  //
  // CO TO KOSZTUJE, POWIEDZIANE WPROST: ten wpis był JEDYNYM sufitem nad tym
  // pudełkiem. Po jego usunięciu nic nie pilnuje, żeby kolejna ikona w kwocie
  // nie odtworzyła przepełnienia — złapie ją dopiero ogólny werdykt bramki,
  // czyli od razu jako czerwień, a nie jako przekroczony sufit. To jest
  // zamierzone: rejestr trzyma DŁUGI, a ten dług przestał istnieć.
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

  // ── DWA WPISY, KTÓRYCH ŻADEN PRZELOT NIE MÓGŁ WCZEŚNIEJ ZOBACZYĆ ──────────
  // Fikstura przeglądarkowa (`CollaborationHarness.tsx`) trzymała JEDNO zadanie
  // w stanie `actionable` i NIE odpowiadała na `agent.access`. Oba te fakty są
  // niewidzialne w raporcie: powierzchnie się rysowały, bramka była nad nimi
  // zielona, a dwie komórki po prostu nie miały treści. Runda C4 zasiała stan
  // `waiting` (bo bez niego para lotu 4 #2 nie miała czego mierzyć) i grant
  // agenta (bo bez niego żaden komentarz nie jest komentarzem agenta) — i te
  // dwa przepełnienia pojawiły się w tej samej chwili. To NIE jest regresja
  // tamtych zmian: to jest geometria, która stała tam od zawsze i której żaden
  // przelot nie dosięgnął. Ta sama klasa, co cztery wpisy CRM wyżej.
  //
  // POWÓD, ZMIERZONY: `.state` w wierszu listy zadań ma `white-space: nowrap`
  // (`tasks/task-list.module.css:143-151`) i siedzi w torze siatki, który nie
  // rośnie z tekstem. Dla zadania `actionable` komórka rysuje PUSTY NAPIS
  // (`TaskListLayout.tsx:157-161` — nieobecność rysowana jako nic, świadomie),
  // więc dopóki jedyne zadanie fikstury było actionable, wystawać nie miało co.
  // Słowo „waiting" wystaje o 47 px przy tekście 200% i o 6 px w oknie 320 px;
  // przy pełnym oknie NIE WYSTAJE i dlatego nie ma tu trzeciego sufitu.
  {
    surface: "tasks",
    signature: "span._state",
    ceilings: {
      "text scaled to 200%": 47,
      "a 320 px window": 6,
    },
    thread:
      "skalowanie interfejsu (R3-5, za falą E) — komórka stanu w wierszu listy zadań",
  },
  // TEN WPIS JEST INNEGO RODZAJU NIŻ WSZYSTKIE POWYŻSZE I MÓWI TO WPROST:
  // to nie jest dług układu, tylko OZDOBA MALOWANA POZA SWOIM PUDEŁKIEM.
  // `.orbitMark::before` ma `inset: 0.42rem -0.18rem`
  // (`settings/access-section.module.css:609-614`) — pierścień orbity jest
  // CELOWO szerszy od okręgu, o 0,36 rem łącznie. Zgadza się co do piksela
  // z pomiarem: 5 px przy korzeniu 16 px i 11 px przy 32 px. Znak jest
  // `aria-hidden`, nie niesie treści i niczego nie przesuwa.
  //
  // DLATEGO NIE MA GO W ŻADNEJ Z POZOSTAŁYCH TRZECH SZUFLAD: `contained`
  // wymagałoby `overflow-x: hidden`, czyli OBCIĘCIA pierścienia — to zmiana
  // rysunku, nie pomiaru; `declared` wymagałoby `[data-scrolls-horizontally]`,
  // czyli oświadczenia, że element się przewija, a on się nie przewija. Rejestr
  // jest jedynym miejscem, w którym da się to zapisać ze zmierzonym sufitem,
  // i jest to jedyny wpis, który przy PEŁNYM OKNIE też ma liczbę — bo ozdoba
  // nie zależy od skali.
  //
  // WARUNEK WYJŚCIA (właściciel: lot 6): albo znak dostaje pudełko, które
  // pierścień mieści (np. `padding-inline` równy odsadzce), albo ta bramka uczy
  // się PIĄTEJ szuflady dla świadomego wycieku dekoracji. Do tego czasu wpis
  // pilnuje, żeby wyciek nie urósł.
  //
  // LOT 6 OBEJRZAŁ I ZOSTAWIŁ — ŚWIADOMIE, z pomiarem, nie przez przeoczenie.
  // Zmierzone w przeglądarce po całej robocie lotu: dwa wystąpienia znaku,
  // wyciek 5 px i 2 px przy korzeniu 16 px, czyli DOKŁADNIE tyle co przed
  // lotem — sufity zostają bez zmiany. Odrzucone zostały obie drogi wyjścia,
  // każda z podanym powodem:
  //   * `padding-inline: 0.18rem` na `.orbitMark` NIE jest zmianą pomiaru,
  //     tylko RYSUNKU. Odsadzka `inset: … -0.18rem` liczy się od pudełka
  //     wyściółki, więc przy `box-sizing: border-box` pierścień zwęża się
  //     o 0,36 rem, a bez niego okrąg 2,25 rem rośnie o tyle samo. Jedno
  //     i drugie zmienia znak, którego ten lot nie dotyka.
  //   * piąta szuflada tej bramki to ROBOTA PRZYRZĄDOWA, a przyrządy tej fazy
  //     są osobną pozycją (sekcja 4 briefu), nie pozycją ekranową lotu 6.
  // Wpis zostaje więc tam, gdzie był, i dalej pilnuje, żeby wyciek nie urósł.
  {
    surface: "settings",
    signature: "span._orbitMark",
    ceilings: {
      "text scaled to 200%": 11,
      "a 320 px window": 5,
      "a full-size window": 5,
    },
    thread:
      "ozdoba malowana poza pudełkiem — pierścień orbity przy grancie agenta (lot 6)",
  },
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

// ─────────────────────────────────────────────────────────────────────────────
// DRUGA POŁOWA TEJ SAMEJ AWARII: TREŚĆ, KTÓRA ZNIKŁA, ZAMIAST WYSTAWAĆ
// ─────────────────────────────────────────────────────────────────────────────
//
// PO CO TO POWSTAŁO, i to jest jedyny powód, dla którego wolno dokładać drugi
// rejestr. Przelotka przepełnień wyżej pomija każdy element o `clientWidth <= 1`
// (`verify-renderer-layout.mjs`, filtr „narzędzie tylko dla czytnika ekranu"),
// bo pudełko 1×1 px z całym zdaniem w środku jest zawsze przepełnione i nigdy
// widoczne. Filtr jest słuszny i zostaje — ale ma skutek uboczny, którego nikt
// nie zapisał: KOMÓRKA TEKSTOWA PRZESTAJE BYĆ RAPORTOWANA DOKŁADNIE WTEDY, GDY
// PRZESTAJE BYĆ WIDOCZNA. Element skrócony wielokropkiem wypisuje się jako
// `contained`; ten sam element ściśnięty do zera wypada z raportu i przelot
// czyta się jak poprawa.
//
// TO NIE JEST HIPOTEZA. Przegląd fali D zgłosił „lot D9 zapadł rolę na ekranie
// Ludzi przy 200%" na podstawie komentarza w arkuszu, a komentarz mówił, że
// przed zmianą rola „wychodziła o 237 px, czyli była skrócona wielokropkiem".
// Zmierzone w przeglądarce na obu wersjach toru: rola miała przy 200% szerokość
// wewnętrzną 0 / 2,3 / 0 px PRZED zmianą i 0 / 0 / 0 px PO. Liczba 237 była
// PRZEPEŁNIENIEM nad pudełkiem szerokim na 2,3 px, a nie szerokością widocznego
// napisu. Ani autor lotu, ani przegląd nie mieli czym tego rozstrzygnąć, bo
// NIC W TYM DRZEWIE NIE MIERZYŁO SZEROKOŚCI WIDOCZNEJ. Ten rejestr jest tym
// przyrządem — powstał z pomyłki, którą sam czyni niemożliwą.
//
// PRÓG JEST BINARNY I DLATEGO BEZSPORNY. Nie „za wąskie na jeden znak" (to
// wymagałoby wybrania liczby, a wybrana liczba jest sufitem, który da się
// przesunąć pod własną dostawę), tylko `clientWidth < 1` — czyli DOKŁADNIE ten
// zbiór, który przelotka przepełnień odrzuca. Ten rejestr mówi o ślepej plamce
// tamtej przelotki i o niczym więcej.
//
// CO ZNACZY WPIS. Tak samo jak wyżej: `passes` wymienia przeloty, w których
// zapadnięcie jest ZNANYM DŁUGIEM z nazwanym właścicielem. Przelot NIEWYMIENIONY
// znaczy „ten element się tutaj NIE zapada", więc zapadnięcie na nim pada jak
// każde nowe. Nie ma tu żadnej liczby do podniesienia — jest tylko lista
// przelotów, a skrócenie jej jest spłatą długu.

/** Czy odczyt mówi o elemencie, który niesie tekst i nie ma go czym pokazać. */
export const COLLAPSED_CLIENT_WIDTH_PX = 1;

/**
 * GDZIE TEN REJESTR JEST EGZEKWOWANY, i dlaczego to nie jest obniżony próg.
 *
 * Przelotka zbiera zapadniętą treść na KAŻDEJ powierzchni i wypisuje wszystko,
 * co znajdzie, w każdym przebiegu. Egzekwowana jest jedna: `people` — ta, dla
 * której ten przyrząd powstał.
 *
 * DLACZEGO NIE OD RAZU WSZĘDZIE. Pierwszy przebieg tej przelotki zwrócił
 * SZESNAŚCIE zapadniętych komórek na PIĘCIU powierzchniach (`tasks`,
 * `projects`, `organizations`, `people` i ich soczewki) — wszystkie zastane,
 * żadna z nich nie jest robotą tego przeglądu, i żadna nie była dotąd przez
 * cokolwiek mierzona. Egzekwowanie ich naraz znaczyłoby albo wpisanie
 * szesnastu długów z wątkami, których nikt nie przyjął, albo naprawę pięciu
 * ekranów w przeglądzie, którego przedmiotem są przyrządy. Jedno i drugie jest
 * gorsze niż powiedzenie wprost, ile ich jest i gdzie.
 *
 * DLACZEGO TO NIE JEST OSŁABIENIE ASERCJI: ten przyrząd POWSTAJE w tym
 * przebiegu. Nic z tych szesnastu nie było wcześniej egzekwowane ani nawet
 * widziane, więc ograniczenie zakresu przy narodzinach niczego nie zdejmuje —
 * zamienia zero widocznych na szesnaście wypisanych i jedną pilnowaną.
 *
 * WYJŚCIE, żeby ta lista nie została zakresem na zawsze: każda powierzchnia
 * dopisana tutaj wymaga albo kolejności zwijania (czyli naprawy), albo wpisu
 * w `KNOWN_COLLAPSED_TEXT` z właścicielem. Najpilniejszy podmiot jest
 * NAZWANY i zmierzony, żeby nie zginął w wypisie: `organizations` /
 * `span._segment` ma szerokość wewnętrzną 0 px przy treści 186 px przy 1440 px
 * I przy 1920 px — czyli przy szerokościach, na których produkt naprawdę
 * chodzi, a nie w wąskim przelocie. Mechanizm jest strukturalny, nie fiksturowy
 * (`flex: 0 6 auto; min-width: 0` bez podłogi; wiersz o krótszej nazwie pokazuje
 * ten sam element na 39,1 px). Nie jest naprawiany tutaj, bo lekarstwo —
 * podłoga `min-width` — jest wprost ODRZUCONE w tym samym arkuszu przy
 * `.nameLine` jako decyzja projektowa, a jej odwrócenie należy do właściciela.
 */
export const COLLAPSED_TEXT_ENFORCED_SURFACES = ["people"];

/**
 * ZAPADNIĘTA TREŚĆ ZMIERZONA, NIE ZGADNIĘTA. Każdy wpis pochodzi z przebiegu
 * sondy na tym drzewie 2026-08-12 i niesie wątek, do którego należy.
 */
export const KNOWN_COLLAPSED_TEXT = [
  {
    surface: "people",
    signature: "span._role",
    // Zmierzone: treść 239–371 px przy szerokości wewnętrznej 0 px na KAŻDYM
    // z trzech wierszy, w obu wąskich przelotach. Sprawdzone także PRZED
    // poprawką toru z lotu D9 (`minmax(0, 1fr)`): 0 / 2,3 / 0 px przy 200%
    // i 0 / 0 / 0 px przy 320 px, czyli zapadnięcie jest STARSZE od tamtego
    // lotu i nie jest jego regresją. Przy 760 px — czyli przy własnym minimum
    // okna produktu — rola ma 43,8 / 130,7 / 77,6 px i czyta się; przy 1440 px
    // 176 / 132 / 145 px. Dlatego oba szerokie przeloty stoją tu NIEWYMIENIONE
    // i zapadnięcie na nich pada.
    passes: ["text scaled to 200%", "a 320 px window"],
    thread:
      "skalowanie interfejsu (R3-5, za falą E) — kolejność zwijania w wierszu osoby",
  },
];

/**
 * Jedna decyzja o jednym zapadnięciu. Jak wyżej: bierze ODCZYTY, nie węzeł DOM,
 * żeby dała się przetestować bez przeglądarki.
 */
export const classifyCollapsedText = (
  { surface, signature, clientWidth, textLength, pass },
  registry = KNOWN_COLLAPSED_TEXT,
) => {
  if (textLength === 0) return { verdict: "empty" };
  if (clientWidth >= COLLAPSED_CLIENT_WIDTH_PX) return { verdict: "visible" };
  const entry = registry.find(
    (candidate) =>
      matchesSurface(surface, candidate.surface) &&
      candidate.signature === signature,
  );
  if (entry === undefined) return { verdict: "violation" };
  if (!entry.passes.includes(pass))
    return { verdict: "violation", thread: entry.thread };
  return { verdict: "known", thread: entry.thread };
};

/** Czy werdykt o tej powierzchni pada, czy jest tylko wypisywany. */
export const collapsedTextEnforced = (
  surface,
  scope = COLLAPSED_TEXT_ENFORCED_SURFACES,
) => scope.some((candidate) => matchesSurface(surface, candidate));

/** Ta sama kontrola co `unusedRegistryEntries`, nad drugim rejestrem. */
export const unusedCollapsedEntries = (
  matchedSignatures,
  registry = KNOWN_COLLAPSED_TEXT,
) =>
  registry.filter(
    (entry) => !matchedSignatures.has(`${entry.surface}|${entry.signature}`),
  );
