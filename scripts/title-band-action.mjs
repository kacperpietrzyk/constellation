// Czy akcja główna ekranu stoi w RZĘDZIE TYTUŁU — czyli pomiar MIEJSCA akcji,
// a nie jej farby.
//
// PO CO TO ISTNIEJE, i to jest jedyny akapit, który trzeba przeczytać. Dziewięć
// z 71 potwierdzonych rozjazdów z prototypem to jedno zdanie: akcja główna stoi
// WIERSZ NIŻEJ niż tytuł, zamiast po prawej stronie tego samego pasma. Ten
// przelot doszedł do tej samej przyczyny WŁASNYM pomiarem i naliczył pod nią
// SIEDEM podmiotów — rachunek co do wiersza stoi przy teście listy kanonicznej.
// Lot C2 zamknął z nich SZEŚĆ; zostają Spotkania, i to jest cała dzisiejsza
// zawartość `TITLE_BAND_DIVERGENCES`.
// Pary mierzą jej FARBĘ — L2-08 i L3-06 wracają ZIELONE, bo przycisk naprawdę
// jest fioletowy — i ani jedna nie mierzy jej MIEJSCA. To jest ta sama klasa co
// przy locie B1: bramka jest zielona na stu z górą parach, bo PARA MIERZY
// WYŁĄCZNIE TO, CO KTOŚ UMIAŁ ZAPISAĆ SELEKTOREM, a „pion tej rzeczy względem
// tamtej" nie jest właściwością jednego elementu i żadna para nie umie o to
// zapytać.
//
// OSIE SĄ DWIE OD LOTU C2 — PION I POZIOM — i miara pozioma stoi niżej pod
// nagłówkiem o końcu pasma. Do C2 mierzył się sam pion, co pozwalało wstawić
// akcję do pasma przy LEWEJ krawędzi i przejść na zielono.
//
// CO TU JEST WZORCEM. Prototyp składa nagłówek KAŻDEGO ekranu jedną funkcją:
// `crumbbar(crumbs, actions)` (`v3/app.js:677-679`) rysuje pasmo
// o `min-height: var(--header-band-height)`, wyrównane `align-items: center`,
// z rozpychaczem `.spacer` przed drugim argumentem (`v3/app.css:281-292`).
// Drugi argument tej funkcji to jest, dosłownie, „akcja w paśmie": widać go
// w źródle, ma numer linii i nie wymaga oglądania zrzutu. Dlatego kolumna
// `prototype` w tabeli niżej jest CYTATEM z prototypu, a nie odczytem z pikseli
// — i dlatego każdy wiersz niesie adres.
//
// DLACZEGO TO NIE JEST PARA. Para czyta JEDEN selektor i ma strażnika, który
// przy wielu dopasowaniach woła NOT_MEASURED. Tu podmiotem jest RELACJA dwóch
// pudełek na kilkunastu ekranach naraz, a odpowiedź „na tym ekranie nie ma
// akcji" jest równie ważnym wynikiem jak „jest, ale niżej" — para nie umie
// zwrócić ani jednego, ani drugiego.
//
// PASM TYTUŁU JEST W TEJ APLIKACJI CZTERY, NIE JEDNO, i to jest powód, dla
// którego podmiot bierze się z DEKLARACJI `#surface-title`, a nie z klasy:
// `.surface-header` (powierzchnie), `.meeting-hero` (Spotkania),
// `library.module.css .header` (Biblioteka) i `.header` trzech ekranów rekordu.
// Ten sam błąd raz już przepuścił złą liczbę i jest w repozytorium opisany:
// „Sonda wierności go NIE MIERZYŁA, bo jej podmiotem był selektor
// `.surface-header h1, h2`, a Spotkania rysują `.meeting-hero`"
// (`styles.css:3946-3950`). Pasmo = `#surface-title`.closest("header") obejmuje
// jedną regułą wszystkie cztery.
//
// ── MIARA, I DLACZEGO NIE JEST PROSTOKĄTEM PASMA ────────────────────────────
//
// Kuszące „środek akcji leży wewnątrz prostokąta pasma" jest ZIELONE NA TEJ
// WADZIE, której szukamy. `.surface-header` ma `flex-wrap: wrap` postawione
// świadomie (`styles.css:1826-1831`, żeby przy 200% nie robić poziomego paska
// przewijania), więc pasmo, które ZAWINĘŁO, rośnie tak, żeby objąć OBA rzędy —
// i akcja w drugim rzędzie leży wtedy „wewnątrz pasma". Prostokąt pasma nie
// odróżnia więc rzędu tytułu od rzędu pod nim. Pasma rekordu są tu jeszcze
// wymowniejsze: zmierzone 285 px wysokości nad tytułem o 24,6 px, bo niosą
// jeszcze plakietki i zakładki.
//
// MIARĄ JEST WIĘC RZĄD TYTUŁU:
//
//     |środek(akcja) − środek(tytuł)| ≤ max(wysokość(akcja), wysokość(tytuł))/2
//
// Obie wysokości są ODCZYTANE W TYM SAMYM PRZELOCIE, więc próg rośnie razem
// z pismem i ta reguła znaczy to samo przy 100%, 200% i 300%. NIE MA TU ANI
// JEDNEJ LICZBY PIKSELI i nie ma `--header-band-height`: ten token jest
// `min-height`, czyli podłogą, a nie wysokością pasma (`styles.css:1818`),
// więc wzorzec z niego zbudowany opisywałby pasmo, którego nie ma.
//
// ZAPAS JEST DUŻY I ZMIERZONY, żeby nikt nie musiał wierzyć w finezję progu:
// Projekty (akcja W paśmie) dają rozjazd 2,5 px przy progu 18; Lejek (akcja
// wiersz niżej) 74,1 px przy tym samym progu; ekran rekordu projektu (akcja
// NAD tytułem) 46,3 px przy progu 16. Przyrząd nie stoi na wartości progu.
//
// ── KTÓRY PRZYCISK JEST AKCJĄ ───────────────────────────────────────────────
//
// NIE `.primary-button`. Cztery ekrany CRM PRZEŁĄCZAJĄ klasę akcji zależnie od
// stanu formularza — `creating ? "secondary-button" : "primary-button"` — bo
// otwarty formularz ma własną akcję główną, a kontrakt zabrania dwóch wypełnień
// akcentu w jednym pojemniku (`.ui-craft/tokens.md`, „Usage constraints" 3).
// Przyrząd kluczowany na jednej z tych klas gubiłby podmiot na czterech
// ekranach w połowie ich stanów i przechodził po cichu — więc klasą akcji jest
// ZBIÓR, poniżej.
//
// (Do lotu C2 Organizacje i Ludzie miały `secondary-button` BEZWARUNKOWO, czyli
// nie miały akcentu w żadnym stanie; to była druga połowa ich wpisu w rejestrze
// i lot C2 ją zamknął. Zbiór był wtedy potrzebny z tego samego powodu i jest
// potrzebny dalej.)
//
// `.ghost-button` do tego zbioru NIE NALEŻY, i to jest pomiar, nie gust. Jest
// świadomie przezroczysty (`styles.css:787`) — to odpowiednik prototypowego
// `.btn` bez modyfikatora — i siedzi na rzeczach, które akcją główną nie są:
// trzy strzałki tygodnia na Kalendarzu i „Areas and initiatives" na Projektach.
// (Trzeci przykład, „Why read-only?", stał tu do 2026-08-11 i wypadł, bo ta
// afordancja jest dziś okrągłym znacznikiem `.help-mark` na obu ekranach,
// na których stoi — nie `.ghost-button`. Przykład, który przestał istnieć,
// czyta się przy odbiorze jak pomiar.) Wciągnięcie go zamieniłoby Kalendarz w znalezisko
// (jego pasmo NIESIE trzy ghosty, a prototypowy Kalendarz nie ma w paśmie
// żadnej akcji), czyli czerwień nad ekranem, o którym rejestr rozjazdów nie ma
// nic do powiedzenia. Wypełnienie niosą `--action-primary-bg` i
// `--action-secondary-bg` (`styles.css:726`, `:761`) — i to są dwie klasy niżej.
//
// TEN SAM PREDYKAT MUSI STAĆ PO STRONIE PROTOTYPU, i to jest wada, która ten
// przyrząd już raz miała: kolumna `today` liczyła wyłącznie przyciski
// z WYPEŁNIENIEM, a kolumna `prototype` — KAŻDY `<button>` w drugim argumencie
// crumbbara. Na ośmiu wierszach nie widać różnicy, bo prototyp stawia tam
// `primary` albo `bordered` (oba mają tło). Na dziewiątym widać: pasmo rekordu
// zadania niesie WYŁĄCZNIE `.btn.quiet` i `.icon-btn`, czyli po prototypowej
// stronie dokładnie to, czym po naszej jest `.ghost-button` — kontrolkę bez tła.
// Wiersz oceniony niesymetrycznie był rozjazdem NIESPEŁNIALNYM: wierna poprawka
// (przezroczysty „Subscribe") zostawiłaby go czerwonym, a poprawka zielona
// musiałaby wstawić wypełnienie tam, gdzie prototyp go NIE MA, czyli wyprodukować
// nowy rozjazd na żądanie przyrządu. Modyfikatory prototypu niosące tło stoją
// niżej jako `PROTOTYPE_FILLED_MODIFIERS` i mają test symetrii.
//
// ── GDZIE SIĘ SZUKA, CZYLI JEDYNA NIEOCZYWISTA CZĘŚĆ TEGO PRZYRZĄDU ─────────
//
// Akcja przesunięta poza pasmo leży w rzędzie SĄSIADUJĄCYM z pasmem: na
// czterech ekranach CRM w `.crumbbar` zaraz POD pasmem, na ekranie rekordu
// w `.crumbs` zaraz NAD nim. Ale samo „rodzeństwo pasma" jest za szerokie —
// zmierzone: na Dziś i w Skrzynce rodzeństwem pasma jest PIERWSZA SEKCJA
// TREŚCI, a w niej stoją przyciski wierszy („Open task", „Mark as read"),
// które akcją ekranu nie są i których zgłoszenie byłoby fałszywym trafieniem
// na dwóch zdrowych ekranach.
//
// GRANICĄ JEST WIĘC WYSOKOŚĆ, ODCZYTANA, NIE WPISANA: sąsiad wchodzi do
// obszaru tytułu tylko wtedy, gdy jest NIE WYŻSZY OD SAMEGO PASMA. Rząd chromu
// jest rzędem; obszar treści jest wysoki. TABELA PRZELICZONA 2026-08-11 przy
// naprawie po przeglądzie lotu D2, wszystkie liczby z JEDNEGO przelotu
// 1440×900 i odczytane z linii „[searched, ceiling h≤…]" tego przyrządu —
// poprzednia wersja miała pięć wierszy i cztery z nich były już nieprawdą,
// bo loty C2, D1 i D2 ruszyły i pasma, i ich sąsiadów:
//
//     rekord proj. pasmo 58,6  ← `.crumbs`      32    WCHODZI  (akcje, rząd wyżej)
//     Dziś         pasmo 40    ← `p[data-capacity]` 16 WCHODZI  (rząd bez akcji)
//     Skrzynka     pasmo 40    ← `section`     106,9  ODPADA   (to jest treść)
//     Zadania      pasmo 40    ← `.viewbar`     88,6  ODPADA
//     Spotkania    pasmo 40    ← `.meeting-body` 611,9 ODPADA
//
// WIERSZ SPOTKAŃ PRZELICZONY 2026-08-12 PRZY LOCIE D7 i przepisany razem
// z nazwą, bo `.meeting-lanes` przestało istnieć: rekompozycja ciała tego
// ekranu (wpisy #63/#64/#65) zamieniła dwa pasy na jedną kolumnę
// `.meeting-body`. Liczba z tego samego przelotu 1440×900 co reszta tabeli
// nie jest — i to jest powiedziane, a nie przemilczane — ale werdykt się nie
// zmienia i nie mógłby: sąsiad pasma jest kolumną treści, więc odpada
// z powodu, który nie zależy od tego, ile dokładnie ma wysokości.
//
// WIERSZ „DZIŚ" ZMIENIŁ SIĘ Z `ODPADA` NA `WCHODZI` I TO JEST ZMIANA ZAKRESU
// TEGO PRZYRZĄDU, a nie kosmetyka tabeli. Lot D2 wyprowadził akapit pojemności
// z `.surface-header` do kolumny treści (para D2-02c mierzy
// `.surface-header [data-capacity]` = 0), więc rodzeństwem pasma na tym ekranie
// nie jest już pierwsza sekcja o wysokości 64 px, tylko rząd 16 px. Werdykt się
// nie zmienił — `today` dalej mierzy się `NO_ACTION/NO_ACTION` po obu stronach —
// i to NIE JEST przypadek do przemilczenia: nie zmienił się dlatego, że w tym
// rzędzie nie stoi ani jeden `<button>`. Granica ZOSTAJE taka, jaka jest,
// świadomie: gdyby ktoś kiedyś postawił akcję ekranu w rzędzie pojemności,
// przyrząd ma ją ZOBACZYĆ, a nie zameldować „bez akcji". Zapisane tutaj, bo lot
// D1 jest jedyną rzeczą między tym przyrządem a uzbrojeniem, a zakres zmieniony
// bez przepisania własnego dowodu jest długiem oddawanym uzbrojonej bramce.
//
// CZTERY DALSZE WIERSZE TEJ TABELI ZNIKNĘŁY WRAZ Z LOTEM C2, i to jest jedyny
// powód, dla którego ta granica ma dziś mniej roboty: Lejek, Odnowienia,
// Organizacje i Ludzie miały akcję w `.crumbbar` (36 px pod pasmem 40 px),
// a lot C2 przeniósł ją DO pasma i skasował te rzędy. Granica sąsiedztwa
// zostaje, bo zostaje jedyny wiersz `ABOVE_BAND` — i bo ekran, który ją znowu
// wyprowadzi poza pasmo, ma zostać ZNALEZIONY, a nie zgłoszony jako „bez akcji".
//
// ŚLEPA PLAMA TEJ GRANICY, wypisana, bo jest realna: akcja włożona do rzędu
// chromu WYŻSZEGO od pasma (dziś taki jest pasek widoku Zadań, 96,6 px)
// zostałaby przeoczona. Reguła myli się WIĘC W STRONĘ „brak akcji" — a „brak
// akcji" jest w tabeli niżej znaleziskiem wszędzie tam, gdzie prototyp akcję
// ma, czyli myli się w stronę CZERWIENI, nie ciszy.
//
// DRUGA STRONA TEJ GRANICY, i ta myli się w stronę PRZECIWNĄ, więc też musi tu
// stać: sufitem jest wysokość PASMA, a pasma rekordu są wysokie (zmierzone
// 285,1 px na rekordzie zadania). Nad takim pasmem sufit przepuściłby rząd
// treści, a przycisk wiersza zgłosiłby się jako akcja ekranu. Dziś nie ma to
// wystawy: ±1 rodzeństwa pasm rekordu to `.crumbs` 23 px i `._strip` 48 px, oba
// są chromem — ale zabezpieczeniem jest wtedy KSZTAŁT CUDZEGO DRZEWA, nie reguła
// tego przyrządu, więc przelot DRUKUJE sufit i wysokości rzędów, które odpadły.
// Bez tego „sufit wynosił 285,1" jest niewidoczne przy odbiorze.
//
// SUFIT WYPROWADZONY Z RZĘDU TYTUŁU (zamiast z pasma) został ODRZUCONY POMIAREM,
// a nie gustem: `.crumbs` ekranu rekordu ma 36 px przy tytule 24,6 px, więc
// zabrałby JEDYNY wiersz `ABOVE_BAND`, czyli trzeci kształt rozjazdu w całości;
// `.crumbbar` czterech ekranów CRM ma 36 px przy tytule 16,9 px, więc nie
// przeszedłby nawet przy sufcie dwukrotnym i zabrałby cztery rozjazdy naraz.
// Granica, która kasuje pięć z ośmiu znalezisk, nie jest ostrożniejsza — jest
// ślepsza.
//
// TRZECIA MIARA BYŁA DO LOTU C2 ŚLEPĄ PLAMĄ, I JUŻ NIĄ NIE JEST. Do 2026-08-10
// ten przyrząd mierzył WYŁĄCZNIE PION i stała tu nota: „prototyp odpycha akcję do
// PRAWEGO końca pasma (`.crumbbar .spacer { flex: 1 }`, `v3/app.css:293`), a ten
// werdykt nie odróżni tego od przycisku wciśniętego tuż za tytułem". Lot C2 akcje
// PRZENOSI, więc bez tej miary mógłby wstawić je do pasma przy LEWEJ krawędzi
// i przejść na zielono — a rejestr rozjazdów mówi przy Odnowieniach
// (`faza-4-porownanie-ekranow.md`, wpis o „New renewal") i przy Organizacjach
// (wpis o „New organization"), że akcja ma być DOSUNIĘTA DO PRAWEJ. Miara stoi
// więc niżej jako `judgeActionAgainstBandEnd` i jest OSOBNĄ OSIĄ, a nie nowym
// stanem osi pionowej: piętnaście kolumn `today` to piętnaście przewidywań, które
// już raz zostały zmierzone, a wciągnięcie poziomu do tego samego enuma
// przepisałoby je wszystkie i zabrało zdanie „pion się trzyma, poziom się ruszył".
//
// MIARĄ POZIOMU JEST KONIEC PASMA, ODCZYTANY, NIE WPISANY:
//
//     koniec_treści(pasmo) − prawa(akcja) ≤ odstęp_kolumnowy(pasmo)
//
// gdzie `koniec_treści` to prawa krawędź pasma MINUS jego własna wyściółka
// i ramka, a tolerancją jest `column-gap` TEGO pasma — czyli najmniejszy odstęp
// poziomy, jaki to pasmo samo deklaruje między swoimi dziećmi. Obie liczby są
// odczytane w tym samym przelocie z `getComputedStyle`, więc rosną razem z rem
// i reguła znaczy to samo przy 100%, 200% i 300%. NIE MA TU ANI JEDNEJ LICZBY
// PIKSELI, tak samo jak w mierze pionowej.
//
// ZAPAS JEST DUŻY I ZMIERZONY, żeby nikt nie musiał wierzyć w finezję tolerancji.
// Liczby są ODCZYTANE Z PRZELOTU (`dowody/c2-czerwien-poziom.txt`, drzewo PRZED
// poprawką tego lotu), nie wyliczone z głowy — dokładnie z tego powodu, z którego
// fikstury testu jednostkowego niżej mają być przepisane z wyjścia:
//
//     Projekty      akcja u końca pasma       odstęp   0,0 px   przy tol. 16
//     Lejek         `margin-inline-start:auto` odstęp  16,0 px   przy tol. 16
//     Organizacje   akcja przy LEWEJ krawędzi  odstęp 954,6 px   przy tol. 16
//     Ludzie        akcja przy LEWEJ krawędzi  odstęp 990,1 px   przy tol. 16
//     Odnowienia    akcja przy LEWEJ krawędzi  odstęp 986,2 px   przy tol. 16
//
// Przyrząd nie stoi na wartości tolerancji: trzy rozjazdy leżą sześćdziesiąt razy
// dalej niż próg.
//
// PRZYPADEK BRZEGOWY, WYPISANY, BO JEST DZIŚ NA WYSTAWIE: Lejek ma akcję
// w `.crumbbar` z `margin-inline-start: auto` (`pipeline.module.css:72-81`), więc
// jej prawa krawędź stoi o WYŚCIÓŁKĘ crumbbara (`var(--space-4)`, 16 px) przed
// końcem pasma — DOKŁADNIE na tolerancji, czyli `FLUSH_END` przez `≤`. To jest
// odczyt prawdziwy (ta akcja naprawdę jest dosunięta do prawej), ale stoi na
// granicy: crumbbar z wyściółką szerszą niż odstęp pasma wróciłby jako rozjazd
// poziomy nad ekranem, którego nikt nie zepsuł. Lot C2 wyjmuje tę akcję
// z crumbbara do pasma i po nim zapas wynosi całe 16 px — dopóki tam stała,
// ta liczba należała do raportu, a nie do niczyjej głowy.
//
// MIARY POZIOMEJ NIE MA DLA EKRANU BEZ AKCJI, i to nie jest luka: `NO_ACTION`
// jest tą samą odpowiedzią na obu osiach, a wymyślanie dla niej trzeciego stanu
// poziomego robiłoby z jednego faktu dwa.
//
// Sam pomiar wymaga przeglądarki, więc siedzi jako przelot
// `titleBandActionCensus` w `verify-renderer-layout.mjs`. Sama REGUŁA jest
// funkcją nad liczbami i mieszka tutaj — chodzi w `npm run check` na wszystkich
// trzech systemach, tak samo i z tego samego powodu co `record-screen-geometry.mjs`
// i `control-paint.mjs` (lot B1): reguła jest przenośna, PIKSELE nie są.
//
// DŁUG, KTÓRY TEN PRZYRZĄD ZOSTAWIA FAZIE C, i lepiej, żeby stał tu niż
// w niczyjej głowie: pary L2-08, L3-06 i L3-07 są `enforced` na selektorze
// `[class*="_crumbbar_"] button`. Lot C2, przenosząc cztery akcje CRM
// z crumbbara do pasma, MUSI w tym samym locie przepisać ich `subject.selector`
// — inaczej bramka wróci z `ROUTED_NOT_MEASURED`, co czyta się jak zepsuty
// przyrząd, a nie jak dowieziona poprawka.

/**
 * Klasy, które w tej aplikacji znaczą „to jest akcja", czyli niosą WYPEŁNIENIE.
 *
 * Zbiór, a nie jedna nazwa — powód stoi w nagłówku i sprowadza się do tego, że
 * dwa ekrany przełączają się między tymi dwiema klasami w locie.
 */
export const TITLE_BAND_ACTION_CLASSES = ["primary-button", "secondary-button"];

/**
 * Modyfikatory PROTOTYPU, które malują tło — czyli druga połowa tego samego
 * predykatu, po drugiej stronie porównania.
 *
 * `.btn.primary` (`v3/app.css:321-332`, gradient akcentu) i `.btn.bordered`
 * (`:319`, `background: var(--surface-raised)`) są jedynymi, które tło niosą.
 * Baza `.btn` (`:306-314`) nie ma ANI JEDNEJ deklaracji `background`,
 * `.btn.quiet` (`:318`) zmienia wyłącznie kolor, a `.icon-btn` (`:135-139`)
 * dostaje tło dopiero na `:hover`/`:active`/`[aria-pressed]`.
 *
 * Stoi tu jako zbiór, a nie w prozie, bo test symetrii żąda, żeby cytat KAŻDEGO
 * wiersza `prototype: "action"` nazywał jeden z tych dwóch modyfikatorów —
 * inaczej ta sama asymetria wróci przy pierwszym nowym wierszu.
 */
export const PROTOTYPE_FILLED_MODIFIERS = ["primary", "bordered"];

/**
 * Status pozycji. Zapisany TUTAJ, a nie w prozie planu, bo od niego zależy, czy
 * przelot rzuca, czy raportuje — i bo prozy nikt nie kompiluje.
 *
 * WARUNEK PRZEŁĄCZENIA NA „enforced", zapisany tak, żeby dało się go
 * ROZSTRZYGNĄĆ, a nie ocenić: KAŻDY wiersz `prototype: "action"` ma zmierzone
 * `today` równe swojemu `prototypeRow` ORAZ `todayInline` równe swojemu
 * `prototypeInline`, czyli `TITLE_BAND_DIVERGENCES` jest PUSTE. Warunek jest
 * zapisany KOLUMNAMI, a nie napisem „IN_BAND": prototyp stawia akcję w rzędzie
 * tytułu na powierzchniach i RZĄD WYŻEJ na ekranach rekordu, więc „każdy wiersz
 * IN_BAND" byłoby warunkiem, którego wierna aplikacja NIE MOŻE spełnić.
 *
 * WARUNEK SPEŁNIONY 2026-08-11, LOT D1 FAZY D — i dlatego ta pozycja jest dziś
 * „enforced". Lot C2 zamknął siedem z ośmiu podmiotów: Zadania, Lejek,
 * Odnowienia, Organizacje, Ludzie (akcja do pasma, u jego końca), Bibliotekę
 * (slot akcji w `LibraryShell`, licznik do paska widoku) i rekord projektu (ten
 * stał poza rzędem ZGODNIE z prototypem — rozjazdem była FARBA). Ósmym były
 * SPOTKANIA i były jedynym powodem, dla którego ten przelot tylko raportował:
 * `.meeting-hero` było siatką JEDNOKOLUMNOWĄ, czyli pasmem bez prawego końca.
 *
 * Lot D1 skasował `.meeting-hero` i przepiął ekran na `SurfaceTitleBand` — ten
 * sam prymityw, przez który przechodzi sześć ekranów C2 — z akcją „Import from
 * Jamie" u końca pasma. `TITLE_BAND_DIVERGENCES` jest przez to PUSTE, więc
 * warunek zapisany wyżej jest spełniony kolumnami, a nie deklaracją.
 *
 * CO SIĘ ZMIENIA PO UZBROJENIU: rozjazd przestaje być opisem znanego długu
 * i staje się awarią przebiegu. Dopóki tablica jest wewnętrznie zgodna
 * z pomiarem, nic nie pada; ekran, który wróci do akcji rząd niżej albo przy
 * lewej krawędzi pasma, kładzie bramkę.
 *
 * Rekord zadania NIE JEST na tej liście i to nie jest przeoczenie: prototyp
 * stawia tam wyłącznie kontrolki bez tła, więc nasze puste pasmo jest z nim
 * ZGODNE — patrz predykat symetrii w nagłówku.
 */
export const TITLE_BAND_ACTION_STATUS = "enforced";

/**
 * Czy ten przelot EGZEKWUJE werdykty tabeli.
 *
 * Reguła tego repozytorium, ta sama co przy `CONTROL_PAINT_ARMED`
 * i `RECORD_TITLE_BAND`: pozycja NIEODDANA raportuje, rzuca dopiero to, co
 * ODDANE i ZEPSUTE. Wiersz zmierzony ZGODNIE z kolumną `today` jest opisem
 * znanego długu Fazy C; wiersz, który się od niej ROZJECHAŁ, jest regresją albo
 * dowiezioną poprawką, o której tabela nie wie — i pada zawsze, również przy
 * `pending`.
 */
export const TITLE_BAND_ACTION_ARMED = TITLE_BAND_ACTION_STATUS === "enforced";

/**
 * Nazwa elementu w raporcie. Ta sama normalizacja i ten sam powód co w B1:
 * CSS Modules dokleja do klasy skrót TREŚCI arkusza (`_createToggle_1kitm_80`),
 * więc jedna edycja arkusza unieważniłaby wszystkie nazwy naraz, a tabela,
 * która sama się kasuje przy przebudowie, nie pilnuje niczego.
 *
 * WZORZEC JEST NAPISEM, bo Playwright serializuje ŹRÓDŁO funkcji mierzącej —
 * importu tam nie ma, a WKLEJONA kopia regexpa robi z testu strażnika kopii
 * martwej („regex zielony, zachowanie zepsute"). Napis przechodzi argumentem
 * i odtwarza się w stronie przez `new RegExp`, więc obie strony mają dosłownie
 * ten sam wzorzec.
 */
export const CSS_MODULE_HASH_PATTERN = "^_(.+)_[a-z0-9]{5,7}_\\d+$";

/**
 * Stany, w jakich może być JEDEN ekran. Wypisane, bo tabela niżej deklaruje je
 * napisami, a literówka w napisie deklaracji jest cichym zezwoleniem na
 * wszystko.
 */
export const TITLE_BAND_STATES = [
  "IN_BAND",
  "BELOW_BAND",
  "ABOVE_BAND",
  "SPLIT_BAND",
  "NO_ACTION",
];

/**
 * Stany OSI POZIOMEJ, i to jest osobny słownik, a nie trzy nowe napisy w tamtym.
 *
 * Powód stoi w nagłówku: pion i poziom są dwoma niezależnymi faktami o tej samej
 * akcji, a zlanie ich w jeden enum zabrałoby zdanie „pion się trzyma, poziom się
 * ruszył" — czyli dokładnie ten werdykt, którego lot C2 potrzebuje, kiedy
 * przeniesie przycisk do pasma i zostawi go przy lewej krawędzi.
 *
 * `NO_ACTION` powtarza się w obu słownikach ŚWIADOMIE: ekran bez akcji ma na obie
 * osie tę samą odpowiedź i wymyślanie dla niego czwartego napisu robiłoby
 * z jednego faktu dwa.
 */
export const TITLE_BAND_INLINE_STATES = [
  "FLUSH_END",
  "INSET_FROM_END",
  "NO_ACTION",
];

/**
 * Werdykt o JEDNEJ akcji względem JEDNEGO tytułu.
 *
 * Świadomie nie przyjmuje elementu DOM, tylko odczytane liczby — dzięki temu
 * daje się przetestować bez przeglądarki, i dzięki temu jedyna arytmetyka tego
 * przyrządu ma test jednostkowy chodzący na trzech systemach.
 *
 * `tolerance` NIE JEST parametrem: wynika z pomiaru. Podanie go z zewnątrz
 * byłoby zaproszeniem do wpisania liczby pikseli w wołającym, czyli do wady,
 * przed którą ten przyrząd stoi.
 */
export const judgeActionAgainstTitleRow = ({ title, action }) => {
  const titleCentre = (title.top + title.bottom) / 2;
  const actionCentre = (action.top + action.bottom) / 2;
  const tolerance = Math.max(action.height, title.height) / 2;
  const drift = actionCentre - titleCentre;
  return {
    state:
      Math.abs(drift) <= tolerance
        ? "IN_BAND"
        : drift > 0
          ? "BELOW_BAND"
          : "ABOVE_BAND",
    drift: Math.round(drift * 10) / 10,
    tolerance: Math.round(tolerance * 10) / 10,
  };
};

/**
 * Werdykt o CAŁYM ekranie.
 *
 * ZŁOŻENIE JEST „KTÓRAKOLWIEK W PAŚMIE WYGRYWA", i to jest treść, nie wygoda.
 * Pytanie tego przyrządu brzmi „czy pasmo tytułu NIESIE akcję", więc ekran,
 * który ma jedną akcję w paśmie i drugą gdzie indziej, na to pytanie
 * odpowiada TAK. Projekty są dokładnie tym przypadkiem: w paśmie stoją
 * `ghost-button` „Areas and initiatives" i `secondary-button` „New project",
 * a niżej w treści bywają kolejne.
 *
 * `SPLIT_BAND` istnieje po to, żeby ekran z akcjami PO OBU stronach tytułu nie
 * musiał zostać zaokrąglony do jednej z nich. Dziś nie ma takiego ekranu —
 * i właśnie dlatego ten stan ma być NIEUŻYWANY w tabeli, a nie nieistniejący
 * w kodzie: gdyby powstał, zaokrąglenie zamieniłoby go w cudzy znany dług.
 */
export const classifyTitleBandAction = ({ title, actions }) => {
  if (actions.length === 0) return { state: "NO_ACTION", judged: [] };
  const judged = actions.map((action) => ({
    ...action,
    ...judgeActionAgainstTitleRow({ title, action }),
  }));
  if (judged.some((entry) => entry.state === "IN_BAND"))
    return { state: "IN_BAND", judged };
  const above = judged.some((entry) => entry.state === "ABOVE_BAND");
  const below = judged.some((entry) => entry.state === "BELOW_BAND");
  return {
    state: above && below ? "SPLIT_BAND" : above ? "ABOVE_BAND" : "BELOW_BAND",
    judged,
  };
};

/**
 * Werdykt POZIOMY o JEDNEJ akcji względem KOŃCA JEDNEGO pasma.
 *
 * `band` niesie DWIE odczytane liczby i ani jednej wpisanej: `contentRight` to
 * prawa krawędź pudełka TREŚCI pasma (krawędź ramki minus wyściółka i obramowanie
 * — czyli miejsce, w którym `justify-content: flex-end` postawiłoby ostatnie
 * dziecko), a `columnGap` to `column-gap` tego pasma rozwiązany do pikseli.
 *
 * TOLERANCJĄ JEST ODSTĘP KOLUMNOWY PASMA, i to jest wybór o pomiarze: to jedyna
 * poziomia odległość, którą to pasmo samo o sobie deklaruje, więc rośnie razem
 * z rem i nie jest niczyim gustem. Pasmo bez zadeklarowanego odstępu
 * (`column-gap: normal`) dostaje tolerancję ZERO — i tak ma być: nie deklaruje
 * żadnego luzu, więc żadnego nie dostaje.
 *
 * Świadomie nie przyjmuje elementu DOM, dokładnie z tego samego powodu co
 * `judgeActionAgainstTitleRow`: dzięki temu jedyna arytmetyka tej osi ma test
 * jednostkowy chodzący bez przeglądarki, na trzech systemach.
 */
/*
 * CZEGO TA OŚ NIE PYTA, NAZWANE 2026-08-11 PRZY NAPRAWIE PO PRZEGLĄDZIE C2 —
 * bo dziura nazwana jest tańsza od dziury odkrytej przez adwersarza, a ta akurat
 * została odkryta przez adwersarza.
 *
 * `contentRight` liczy się z pudełka TEGO pasma, więc pytanie brzmi „czy akcja
 * stoi u końca PASMA", a nie „czy stoi u końca KOLUMNY TREŚCI pod nim". Dla
 * przyrządu są to dziś dwa nierozróżnialne zdania — i rozjeżdżają się naprawdę:
 * `.surface-header` nie deklaruje `padding-inline` żadnego, a paski widoku
 * czterech ekranów CRM (Organizacje, Ludzie, Lejek, Odnowienia) deklarują
 * `padding-inline: var(--space-4)`. Oba pudełka są dziećmi `.surface-scroll > *`,
 * czyli mają IDENTYCZNĄ ramkę — więc licznik w pasku widoku kończy się 16 px
 * WCZEŚNIEJ niż akcja w paśmie nad nim, i dwa elementy dosunięte do prawej stoją
 * w dwóch różnych liniach. Zadania tej wady NIE MAJĄ, bo ich `.viewbar` nie
 * deklaruje `padding-inline` — czyli to jest niespójność per-ekran, a nie
 * konwencja pasma.
 *
 * NIE JEST TO NAPRAWIONE W TYM LOCIE I TO JEST DECYZJA O ZAKRESIE: rozstrzygnięcie
 * brzmi „gdzie kończy się kolumna chromu" i dotyka pięciu arkuszy naraz, więc
 * jest lotem, a nie poprawką w locie naprawczym. Kto go weźmie, ma dołożyć tej
 * osi TRZECIĄ odpowiedź — koniec pasma przeciw końcowi pierwszego rodzeństwa
 * treści — bo bez niej poprawka nie ma jak dowieść, że zadziałała.
 */
export const judgeActionAgainstBandEnd = ({ band, action }) => {
  const tolerance = Number.isFinite(band.columnGap) ? band.columnGap : 0;
  const endGap = band.contentRight - action.right;
  return {
    // ODSTĘP UJEMNY TEŻ JEST `FLUSH_END`, i to nie jest przeoczenie: akcja
    // wystająca poza koniec pasma jest wadą PRZEPEŁNIENIA, którą mierzy
    // `descendant-overflow.mjs`, a nie akcją stojącą przy złej krawędzi. Ten
    // przyrząd pyta wyłącznie „czy stoi u końca", i wystająca stoi.
    inlineState: endGap <= tolerance ? "FLUSH_END" : "INSET_FROM_END",
    endGap: Math.round(endGap * 10) / 10,
    inlineTolerance: Math.round(tolerance * 10) / 10,
  };
};

/**
 * Werdykt POZIOMY o CAŁYM ekranie.
 *
 * Złożenie jest to samo co w pionie i z tego samego powodu — „którakolwiek u
 * końca wygrywa". Pytanie brzmi „czy koniec pasma NIESIE akcję", więc ekran,
 * który ma jedną akcję u końca i drugą gdzie indziej, odpowiada TAK. Projekty są
 * dokładnie tym przypadkiem po stronie pionu i będą nim po stronie poziomu.
 */
export const classifyTitleBandInline = ({ band, actions }) => {
  if (actions.length === 0) return { inlineState: "NO_ACTION", judged: [] };
  const judged = actions.map((action) => ({
    ...action,
    ...judgeActionAgainstBandEnd({ band, action }),
  }));
  return {
    inlineState: judged.some((entry) => entry.inlineState === "FLUSH_END")
      ? "FLUSH_END"
      : "INSET_FROM_END",
    judged,
  };
};

/**
 * KANONICZNA LISTA EKRANÓW, i to jest najważniejsza rzecz w tym pliku.
 *
 * Po co lista, skoro cele bierze się z żywego DOM-u (i bierze się, patrz
 * `classifyTitleBandCensus`): bo „pusta fikstura chroni fałszywą asercję" ma
 * stopień, którego porównanie z DOM-em nie widzi. Ekran, który przestał
 * rysować pasmo, wypada z pomiaru CICHO i wygląda dokładnie jak ekran zdrowy.
 * Ta tabela jest listą ekranów, o których ten przyrząd TWIERDZI, że coś wie —
 * więc wiersz, którego przelot nie dotknął, jest awarią, a ekran, którego
 * w tabeli nie ma, jest robotą, o której nikt nie wie, że ją pominął (ta sama
 * umowa co `VISUAL_LANGUAGE_POSITION_GAP`).
 *
 * DWIE KOLUMNY, DWA RÓŻNE RODZAJE FAKTU, i pomylenie ich byłoby tu najgorszą
 * możliwą wadą:
 *
 *   `prototype` — CO ROBI PROTOTYP. Fakt o cudzym źródle, z adresem. „action"
 *                 znaczy: wywołanie `crumbbar(crumbs, actions)` ma DRUGI
 *                 argument i stoi w nim przycisk NIOSĄCY TŁO, czyli `.btn`
 *                 z modyfikatorem z `PROTOTYPE_FILLED_MODIFIERS`. „no-action"
 *                 znaczy: drugiego argumentu nie ma, nie ma w nim przycisku
 *                 ALBO są w nim wyłącznie kontrolki przezroczyste — `.btn.quiet`
 *                 i `.icon-btn` są prototypowym odpowiednikiem naszego
 *                 `.ghost-button` i po obu stronach porównania znaczą to samo.
 *                 To jest rozstrzygalne czytaniem, nie oglądaniem zrzutu.
 *   `prototypeRow` / `prototypeInline` — GDZIE prototyp ją stawia, na obu
 *                 osiach, i to są kolumny, których BRAK zrobił z tego przyrządu
 *                 przyrząd niesymetryczny po raz drugi. Do 2026-08-10 predykat
 *                 miał tu wpisane literały „IN_BAND" i „FLUSH_END", czyli
 *                 twierdził, że prototyp stawia akcję w rzędzie tytułu na KAŻDYM
 *                 ekranie. Na EKRANACH POWIERZCHNI to prawda i to jest cała
 *                 przyczyna C2: prototyp nie rysuje tam `<h1>` w ogóle, tytułem
 *                 jest `<span class="cur">` W crumbbarze, więc tytuł i akcja
 *                 dzielą JEDNO pasmo. Na EKRANACH REKORDU to FAŁSZ: crumbbar
 *                 niesie ŚLAD i akcję, a tytuł jest osobnym `<h1 class="rec-title">`
 *                 w NASTĘPNYM paśmie — `v3/screens/record.js:428-432` to
 *                 dosłownie `crumbbar(ślad, btn("New task", { cls: "primary" }))
 *                 + rcShell(`<h1 class="rec-title">…`)`, czyli sklejenie DWÓCH
 *                 rodzeństw. Nasz `.crumbs` z `.actions` nad `header._header`
 *                 jest tym samym kształtem, więc `ABOVE_BAND` na rekordzie
 *                 projektu jest ZGODNOŚCIĄ, nie rozjazdem. Rejestr mówi o tym
 *                 ekranie to samo i tylko to: wpis „W pasie akcji NAD TYTUŁEM
 *                 nie ma ANI JEDNEJ powierzchni akcentowej" nazywa położenie
 *                 pasa normalnym i skarży się wyłącznie na FARBĘ — i dlatego
 *                 plan liczy ten ekran pod przyczyną C4, a nie C2.
 *   `today`     — CO ROBI TA APLIKACJA DZIŚ W PIONIE. Fakt o naszym drzewie,
 *                 ODCZYTANY Z PRZELOTU (`dowody/b2-czerwien.txt`), nie z lektury
 *                 kodu.
 *   `todayInline` — CO ROBI TA APLIKACJA DZIŚ W POZIOMIE, tak samo odczytane
 *                 (`dowody/c2-czerwien-poziom.txt`). Kolumna dołożona w locie C2,
 *                 zanim ten lot ruszył jeden bajt farby — bo bez niej lot mógłby
 *                 przenieść akcję do pasma, zostawić ją przy LEWEJ krawędzi
 *                 i przejść na zielono.
 *
 * OSIE SĄ DWIE I NIE WOLNO ICH SUMOWAĆ. Ekran jest rozjazdem, jeżeli rozjeżdża
 * się KTÓRAKOLWIEK — a przewidywanie, od którego pada werdykt dryfu, jest
 * KONIUNKCJĄ obu kolumn. Gdyby `predicted` czytało samą kolumnę pionową, akcja
 * przesunięta w poziomie i nigdzie nie zapisana przechodziłaby po cichu, czyli
 * druga oś nie pilnowałaby niczego.
 *
 * ZNALEZISKIEM JEST ROZJAZD TYCH DWÓCH KOLUMN, a nie sama wartość którejkolwiek.
 * Dlatego Dziś, Skrzynka, Kalendarz i Ustawienia — ekrany bez akcji w paśmie
 * po OBU stronach — są tu MATCH-em, a nie znaleziskiem. Przyrząd, który
 * czerwieniłby każde „brak akcji", zgłaszałby cztery zdrowe ekrany i zostałby
 * skasowany przy pierwszym przebiegu.
 *
 * WIERSZ BEZ `prototype` NIE ISTNIEJE — poza jednym, jawnie oznaczonym
 * „no-screen" (ekran rekordu szansy), którego prototyp nie ma w ogóle.
 * Taki wiersz jest MIERZONY i RAPORTOWANY, ale nie może być znaleziskiem, bo
 * nie ma się od czego rozjechać. To jest zadeklarowana ślepa plama, nie cisza.
 */
export const TITLE_BAND_ROWS = [
  {
    id: "today",
    prototype: "no-action",
    prototypeRow: "NO_ACTION",
    prototypeInline: "NO_ACTION",
    cite: 'v3/app.js:762-763 — crumbbar(„Today”, `<span class="when">`): drugi argument nie niesie przycisku',
    today: "NO_ACTION",
    todayInline: "NO_ACTION",
    // SKŁAD PASMA PRZELICZONY 2026-08-11: lot D2 wyprowadził akapit pojemności
    // do kolumny treści, a w paśmie została data. Plik też był zły — od czasu
    // przed tym lotem ekran mieszka w `TodaySurface.tsx`, nie w `Wave2Surfaces`.
    app: "RealApp Today — .surface-header z <h1> i <span data-band-date> (TodaySurface.tsx:224-235)",
  },
  {
    id: "calendar",
    prototype: "no-action",
    prototypeRow: "NO_ACTION",
    prototypeInline: "NO_ACTION",
    cite: 'v3/screens/calendar.js:202 — crumbbar(„Calendar”, `<span class="when">`)',
    today: "NO_ACTION",
    todayInline: "NO_ACTION",
    app: "CalendarSurface.tsx:640-670 — w paśmie trzy ghost-button nawigacji tygodnia, żadnej akcji z wypełnieniem",
  },
  {
    id: "inbox",
    prototype: "no-action",
    prototypeRow: "NO_ACTION",
    prototypeInline: "NO_ACTION",
    cite: 'v3/screens/inbox.js:287-288 — crumbbar(„Inbox”, `<span class="when">`)',
    today: "NO_ACTION",
    todayInline: "NO_ACTION",
    app: "Wave2Surfaces.tsx:283-303 — drugie dziecko pasma to licznik, nie akcja",
  },
  {
    id: "settings",
    prototype: "no-action",
    prototypeRow: "NO_ACTION",
    prototypeInline: "NO_ACTION",
    // JEDYNY WIERSZ, KTÓREGO PROTOTYP NIE SKŁADA CRUMBBAREM, więc jedyny,
    // przy którym cytat trzeba było sprawdzić dwa razy: `app.js:1516` woła
    // `crumbbar("Settings")` bez drugiego argumentu, ale ta kopia jest
    // NIEŻYWA — `screens/settings.js` ładuje się po `app.js` i podmienia
    // Ustawienia na TRYB, tak samo jak podmienia Dziś, Skrzynkę, Projekty,
    // Lejek i Bibliotekę. Żywa głowa panelu niesie tytuł sekcji i podtytuł,
    // i ani jednego przycisku.
    cite: 'v3/screens/settings.js:1003-1006 — `.st-panel-head` to `<h2 id="st-title">` i `.st-panel-sub`, bez slotu akcji; tryb nie woła crumbbara w ogóle',
    today: "NO_ACTION",
    todayInline: "NO_ACTION",
    app: "SettingsSurface.tsx:990-1007 — w paśmie `settings-help-entry`, klasa spoza zbioru akcji",
  },
  {
    id: "projects",
    prototype: "action",
    prototypeRow: "IN_BAND",
    prototypeInline: "FLUSH_END",
    cite: 'v3/screens/projects.js:343 — btn("New project", { cls: "primary", icon: "plus" })',
    today: "IN_BAND",
    todayInline: "FLUSH_END",
    app: "Wave2Surfaces.tsx:53-73 (SurfaceHeader renderuje {action}) + :789 secondary-button „New project”",
    // JEDYNY DZIŚ WIERSZ „IN_BAND", czyli JEDYNY dowód, że ten przyrząd umie
    // zwrócić cokolwiek poza znaleziskiem. Strażnik `TITLE_BAND_NEVER_IN_BAND`
    // pilnuje, żeby ten dowód nie zniknął po cichu.
  },
  {
    id: "tasks",
    prototype: "action",
    prototypeRow: "IN_BAND",
    prototypeInline: "FLUSH_END",
    cite: 'v3/screens/tasks.js:507-513 — btn("New task", { cls: "primary", icon: "plus", act: "new-task" })',
    today: "IN_BAND",
    todayInline: "FLUSH_END",
    app: "tasks/TasksSurface.tsx:460-495 — SurfaceTitleBand z akcją „New task” (primary-button) wpiętą w onCreateTask; addToGroup (:353-355) zostaje jako tworzenie W GRUPIE",
    // JEDYNY PODMIOT, KTÓREGO REJESTR NIE MA. Rejestr liczy dziewięć wpisów
    // przyczyny C2 i Zadań wśród nich nie ma; ten przelot mierzy, że prototyp
    // stawia w paśmie Zadań „+ New task", a nasze pasmo Zadań nie niesie ani
    // jednej akcji. Zgłoszone tu, a nie dopisane do rejestru, bo rejestr jest
    // dokumentem tamtego przelotu porównawczego — ten przyrząd ma prawo znaleźć
    // więcej, niż zapisano, i nie ma prawa tego przemilczeć.
  },
  {
    id: "pipeline",
    prototype: "action",
    prototypeRow: "IN_BAND",
    prototypeInline: "FLUSH_END",
    cite: 'v3/screens/pipeline.js:409-410 — btn("New opportunity", { cls: "primary", icon: "plus" })',
    today: "IN_BAND",
    todayInline: "FLUSH_END",
    app: "pipeline/PipelineSurface.tsx:840-872 — akcja w paśmie; .crumbbar skasowany razem ze swoją regułą w pipeline.module.css",
  },
  {
    id: "renewals",
    prototype: "action",
    prototypeRow: "IN_BAND",
    prototypeInline: "FLUSH_END",
    cite: 'v3/screens/renewals.js:217 — btn("New renewal", { cls: "primary", icon: "plus" })',
    today: "IN_BAND",
    todayInline: "FLUSH_END",
    app: "renewals/RenewalsSurface.tsx:806-835 — akcja w paśmie; licznik zostaje w swoim viewbarze z lotu 3",
  },
  {
    id: "organizations",
    prototype: "action",
    prototypeRow: "IN_BAND",
    prototypeInline: "FLUSH_END",
    cite: 'v3/screens/crm.js:371 — btn("New organization", { cls: "primary", icon: "plus" })',
    today: "IN_BAND",
    todayInline: "FLUSH_END",
    app: "StrategicDepthSurface.tsx:687-720 — akcja w paśmie i warunkowo primary-button; .crumbbar skasowany",
  },
  {
    id: "people",
    prototype: "action",
    prototypeRow: "IN_BAND",
    prototypeInline: "FLUSH_END",
    cite: 'v3/screens/crm.js:540 — btn("New person", { cls: "primary", icon: "plus" })',
    today: "IN_BAND",
    todayInline: "FLUSH_END",
    app: "people/PeopleSurface.tsx:484-517 — akcja w paśmie i warunkowo primary-button; .crumbbar skasowany",
  },
  {
    id: "meetings",
    prototype: "action",
    prototypeRow: "IN_BAND",
    prototypeInline: "FLUSH_END",
    cite: 'v3/screens/meetings.js:431-433 — btn("Import from Jamie", { cls: "bordered", icon: "arrow" })',
    today: "IN_BAND",
    todayInline: "FLUSH_END",
    // OSTATNI ROZJAZD TEJ TABLICY, ZAMKNIĘTY W LOCIE D1 FAZY D — i to jest
    // powód, dla którego `TITLE_BAND_ACTION_STATUS` niżej mówi dziś „enforced".
    // `.meeting-hero` NIE ISTNIEJE: ekran rysuje ten sam `SurfaceTitleBand`, co
    // sześć ekranów lotu C2, a akcją pasma jest „Import from Jamie"
    // (`secondary-button`, bo prototypowy modyfikator to `bordered`, nie
    // `primary`). CYTAT JEST Z PRZELOTU NA CZUBKU NAPRAWY PO PRZEGLĄDZIE
    // LOTU D1, i to jest druga wersja tych liczb: pierwsza niosła wysokość
    // akcji sprzed zejścia na 1,75 rem — pomiar unieważniony dwa commity
    // później w tym samym locie — a jej oś pozioma unieważniła sama naprawa,
    // bo dołożony glif poszerzył przycisk o 24 px (1248,1 → 1224,1 na lewej
    // krawędzi, koniec bez ruchu). Pomiar 2026-08-11: „band header.surface-header
    // h=40 content ends x=1400 (right x=1440 − padding 40) column-gap 16
    // button.secondary-button „Import from Jamie” band y 45.5–73.5 h=28
    // x 1224.1–1400 drift 0px vs tolerance 14px → IN_BAND | end gap 0px vs
    // tolerance 16px → FLUSH_END”.
    app: 'MeetingsSurface.tsx — <SurfaceTitleBand action={bandAction} title="Meetings" />; akcja bezwarunkowa, bez klucza Jamie prowadzi do tafli integracji zamiast się chować',
  },
  {
    id: "library",
    prototype: "action",
    prototypeRow: "IN_BAND",
    prototypeInline: "FLUSH_END",
    cite: "v3/screens/knowledge.js:802-804 („New note”, primary) i :967-968 („Add a source”, primary)",
    today: "IN_BAND",
    todayInline: "FLUSH_END",
    app: "library/LibraryShell.tsx:79-125 — slot akcji w paśmie, licznik zszedł do paska widoku; NotesReading i SourcesReading wstrzykują swoją akcję portalem",
    // JEDEN WIERSZ NA DWA WPISY REJESTRU, i to jest świadome. Rejestr filuje
    // Notatki i Źródła osobno, bo porównywał ZRZUTY dwóch ekranów. Pasmo jest
    // JEDNO — ten sam `LibraryShell` nad każdym z trzech odczytów, z tym samym
    // tytułem i tym samym brakiem slotu akcji — więc policzenie go dwa razy
    // byłoby dopisaniem podmiotu, którego nie ma. Poprawka też jest jedna.
  },
  {
    id: "projects/record:project",
    prototype: "action",
    prototypeRow: "ABOVE_BAND",
    prototypeInline: "FLUSH_END",
    cite: 'v3/screens/record.js:428-432 — `crumbbar(ślad, btn("New task", { cls: "primary", icon: "plus", act: "new-task" })) + rcShell(`<h1 class="rec-title">…`)`: filled action w crumbbarze, tytuł rekordu w NASTĘPNYM paśmie — dwa rodzeństwa sklejone `+`, więc prototyp stawia tu akcję RZĄD WYŻEJ niż tytuł',
    today: "ABOVE_BAND",
    todayInline: "FLUSH_END",
    app: "record/ProjectRecordScreen.tsx:300-336 — .crumbs z .actions renderowane PRZED nagłówkiem, tak jak w prototypie; lot C2 dołożył tam primary-button „New task” (jedyne wypełnienie akcentu w tym pasie), record-screen.module.css:62-68",
    // TRZECI KSZTAŁT POŁOŻENIA: nie „wiersz niżej", tylko RZĄD WYŻEJ. Przyrząd
    // szukający akcji wyłącznie POD pasmem przegapiłby ten ekran w całości.
    //
    // I TO JEST DZIŚ ZGODNOŚĆ, NIE ROZJAZD, a wiersz stoi z uzasadnieniem, bo do
    // lotu C2 był liczony jako ósmy rozjazd C2. Prototyp robi tu DOKŁADNIE to
    // samo co my — `crumbbar(ślad, akcja)` sklejony z `rcShell(<h1 class=
    // "rec-title">)` — więc `prototypeRow` to `ABOVE_BAND`, a nie `IN_BAND`.
    // Rozjazd tego ekranu jest o FARBIE (rejestr: „w pasie akcji nad tytułem
    // nie ma ani jednej powierzchni akcentowej", przyczyna C4) i lot C2 zamyka
    // go, dokładając do tego pasa `primary-button` „New task" — tę samą akcję,
    // którą cytuje prototyp, wpiętą w istniejące `onNewTask`
    // (`ProjectRecordScreen.tsx:195`), dziś osiągalne wyłącznie ze stanu pustego
    // panelu zadań. POKRYCIE SIĘ NIE ZMNIEJSZA: ekran jest dalej odwiedzany,
    // mierzony, drukowany i osądzany na obu osiach — wraca tylko jako MATCH.
  },
  {
    id: "tasks/record:task",
    prototype: "no-action",
    prototypeRow: "NO_ACTION",
    prototypeInline: "NO_ACTION",
    cite: 'v3/screens/record.js:556-561 — drugim argumentem crumbbara są btn("Subscribe", { cls: "quiet" }) i <button class="icon-btn">, czyli DWIE kontrolki bez tła (app.css:306-314 baza bez `background`, :318 quiet zmienia sam kolor, :135-139 icon-btn dostaje tło dopiero na hover) — żadnego modyfikatora z PROTOTYPE_FILLED_MODIFIERS',
    today: "NO_ACTION",
    todayInline: "NO_ACTION",
    app: "record/TaskRecordScreen.tsx:475-480 — .crumbs niesie WYŁĄCZNIE przycisk powrotu; slot .actions przyjmuje tylko ProjectRecordScreen (:208)",
    // WIERSZ, KTÓRY BYŁ ROZJAZDEM PRZEZ NIESYMETRYCZNY PREDYKAT, i dlatego stoi
    // tu z uzasadnieniem, a nie po cichu jako MATCH. Póki kolumna `prototype`
    // liczyła KAŻDY przycisk, a `today` tylko te z wypełnieniem, ten ekran był
    // dziewiątym znaleziskiem — NIESPEŁNIALNYM w stronę prototypu (patrz
    // nagłówek). Symetrycznie oceniony jest zgodny: prototyp nie stawia tu akcji
    // z wypełnieniem i my też nie. Pomiar się NIE ZMNIEJSZYŁ — ekran nadal jest
    // odwiedzany, mierzony i drukowany, tylko wraca jako MATCH.
  },
  {
    id: "pipeline/record:opportunity",
    prototype: "no-screen",
    prototypeRow: "NO_ACTION",
    prototypeInline: "NO_ACTION",
    cite: "v3: `grep -n crumbbar screens/record.js app.js` daje ekrany rekordu projektu (:429), zadania (:556) i organizacji (:773) — szansy NIE MA",
    today: "NO_ACTION",
    todayInline: "NO_ACTION",
    app: "opportunity/OpportunityRecordScreen.tsx:482-487 — .crumbs z samym przyciskiem powrotu",
    // ZADEKLAROWANA ŚLEPA PLAMA. Wiersz jest mierzony i drukowany, ale nie może
    // być znaleziskiem: nie ma prototypu, od którego miałby się rozjechać.
    // Stoi tu, żeby ekran nie wypadł z pokrycia po cichu — cisza o nim byłaby
    // nieodróżnialna od ekranu zdrowego.
  },
];

/**
 * Czy TEN wiersz jest dziś rozjazdem z prototypem.
 *
 * ROZJAZD NA KTÓREJKOLWIEK OSI JEST ROZJAZDEM, i to jest cała treść dołożenia
 * drugiej miary: prototyp stawia akcję w rzędzie tytułu ORAZ u prawego końca
 * pasma (`v3/app.js:677-679` przez `v3/app.css:293`), więc ekran, który spełnia
 * jedno i nie spełnia drugiego, prototypu NIE odtwarza. Alternatywa —
 * koniunkcja — dawałaby zielone Organizacje z przyciskiem w paśmie przy lewej
 * krawędzi, czyli dokładnie ten wynik, przed którym ta oś powstała.
 *
 * PORÓWNANIE IDZIE Z KOLUMNAMI PROTOTYPU, A NIE ZE STAŁYMI „IN_BAND"/„FLUSH_END",
 * i to jest druga naprawa niesymetrycznego predykatu w tym pliku — pierwsza była
 * o FARBIE (`.btn.quiet` nie jest akcją), ta jest o MIEJSCU. Wpisany literał
 * twierdził, że prototyp stawia akcję w rzędzie tytułu na KAŻDYM ekranie, a na
 * ekranach REKORDU stawia ją rząd wyżej — patrz `prototypeRow` przy wierszu
 * rekordu projektu. Wiersz oceniony literałem był rozjazdem NIESPEŁNIALNYM
 * dokładnie tak samo jak tamten: poprawka wierna prototypowi (akcja zostaje nad
 * tytułem) zostawiłaby go czerwonym, a poprawka zielona musiałaby przenieść
 * akcję TAM, GDZIE PROTOTYP JEJ NIE MA.
 *
 * `no-screen` nie jest rozjazdem — patrz komentarz przy wierszu szansy.
 */
export const isTitleBandDivergence = (row) =>
  row.prototype === "action"
    ? row.today !== row.prototypeRow || row.todayInline !== row.prototypeInline
    : false;

export const TITLE_BAND_DIVERGENCES = TITLE_BAND_ROWS.filter(
  isTitleBandDivergence,
);

/**
 * Czy TEN werdykt pada, czy jest raportowany.
 *
 * Tu mieszka cała odpowiedź na pytanie „przyrząd jest dziś czerwony, a CI ma
 * być zielone", i jest to dokładnie ta sama odpowiedź co w B1. Wiersz zmierzony
 * ZGODNIE z tabelą jest opisem stanu, który tabela zna — drukuje się. Wiersz,
 * który się od tabeli ROZJECHAŁ, znaczy jedno z dwojga i oba muszą zatrzymać
 * przebieg: albo ktoś przesunął akcję i nikt tego nie zapisał (regresja), albo
 * lot C2 dowiózł poprawkę i nie skasował wpisu (tabela zaczyna kłamać).
 *
 * `armed` DOKŁADA ROZJAZDY, NIE ZASTĘPUJE REGUŁY, i to jest poprawka wady, którą
 * ten przyrząd nosił: `armed || !predicted` jest prawdziwe dla KAŻDEGO wiersza,
 * więc w chwili przełączenia na „enforced" padłyby również ekrany zmierzone
 * dokładnie tak, jak tabela przewiduje — bramka czerwona na zawsze, niezależnie
 * od zgodności z prototypem, i werdykt o treści wewnętrznie sprzecznej („ten
 * przelot zmierzył NO_ACTION, a lista mówi NO_ACTION"). Zasięg jest teraz taki
 * sam jak w B1, gdzie zdrowe kontrolki wypadają z osądu WCZEŚNIEJ: pada dryf
 * od tabeli (zawsze) oraz rozjazd z prototypem (dopiero po uzbrojeniu).
 *
 * I TO JEST TO, CO MIERZY BREAK-TEST. Baza nie może być „zielona, bo nic nie
 * znaleziono" — ten przyrząd znajduje dziś osiem rozjazdów i ma je znajdować.
 * Break-test nie mierzy więc, czy przyrząd coś znalazł; mierzy, czy znajduje
 * coś, czego tabela NIE PRZEWIDUJE.
 */
export const titleBandVerdictThrows = ({ predicted, divergent, armed }) =>
  !predicted || (armed && divergent);

/**
 * Werdykt o CAŁYM przelocie, nie o jednym ekranie.
 *
 * Istnieje po to, żeby ten pomiar nie mógł przejść, NIE MIERZĄC NICZEGO — to
 * jest klasa defektu, którą to repozytorium płaci od czterech fal.
 *
 * Awarie przyrządu, każda z innym mechanizmem:
 *
 *   * cel ZADEKLAROWANY przez powłokę, którego spacer nie dotknął — i cel
 *     dotknięty, którego powłoka nie deklaruje. Zbiór celów bierze się
 *     z żywego DOM-u (`.nav-item[data-surface]` + koło zębate) i jest tu
 *     PORÓWNYWANY z tym, co przelot naprawdę zmierzył. Ta sama umowa co
 *     `CONTROL_PAINT_DESTINATIONS_DIVERGED`;
 *   * kliknięcie, po którym powłoka NIE DOJECHAŁA na deklarowany cel — bez
 *     tego przelot mierzy jeden panel pod trzynastoma nazwami;
 *   * ekran bez `#surface-title` albo z kilkoma — pasmo jest wtedy
 *     NIEROZSTRZYGNIĘTE, a nie „bez akcji". To jest wprost punkt 2 zadania:
 *     ekran, który nie wyrenderował pasma, ma zostać zgłoszony jako
 *     NIEZMIERZONY, a nie po cichu wypaść z pokrycia;
 *   * wiersz tabeli, którego przelot nie dotknął, i ekran zmierzony, którego
 *     tabela nie zna;
 *   * ANI JEDEN wiersz `IN_BAND` w całym przebiegu — przyrząd, o którym wiadomo
 *     wyłącznie, że umie czerwienieć, jest nieodróżnialny od zepsutego;
 *   * ANI JEDEN wiersz `FLUSH_END` — to samo zdanie o drugiej osi, dołożone
 *     razem z nią w locie C2.
 */
export const classifyTitleBandCensus = ({
  walk,
  measured,
  rows = TITLE_BAND_ROWS,
}) => {
  const failures = [];

  if (walk.declared.length === 0)
    failures.push(
      "TITLE_BAND_NO_DESTINATIONS: the shell drew no „.nav-item[data-surface]” at all, so this " +
        "walk had nowhere to go. An empty walk is a broken measurement, not a pass.",
    );
  if (!walk.settingsEntry)
    failures.push(
      "TITLE_BAND_NO_SETTINGS_ENTRY: „[data-settings-entry]” matched nothing, so the Settings " +
        "mode was never entered. A destination the walk cannot reach leaves NO row behind, and " +
        "silence about it is indistinguishable from a screen that holds.",
    );
  for (const arrival of walk.arrivals) {
    if (arrival.seen === null) {
      failures.push(
        `TITLE_BAND_NO_AFFORDANCE: the shell declared „${arrival.id}” as a destination and this ` +
          "walk found nothing to click for it — no nav item, no gear. Nothing was navigated, so " +
          "the row under this name describes the screen the walk was already standing on.",
      );
      continue;
    }
    if (arrival.seen !== arrival.id)
      failures.push(
        `TITLE_BAND_DID_NOT_ARRIVE: this walk clicked the affordance for „${arrival.id}” and the ` +
          `work pane still reads data-surface="${arrival.seen}". Navigation that silently fails ` +
          "makes one panel be judged under every destination's name.",
      );
  }

  const seen = measured.map((entry) => entry.id);
  const surfacesSeen = seen.map((id) => id.split("/")[0]);
  const unvisited = walk.declared.filter((id) => !surfacesSeen.includes(id));
  const unexpected = [...new Set(surfacesSeen)].filter(
    (id) => !walk.declared.includes(id),
  );
  if (unvisited.length > 0 || unexpected.length > 0)
    failures.push(
      `TITLE_BAND_DESTINATIONS_DIVERGED: the shell declared ${walk.declared.length} ` +
        `destination(s) and this pass produced rows for ${new Set(surfacesSeen).size}` +
        (unvisited.length > 0
          ? ` — declared and never judged: ${unvisited.join(", ")}`
          : "") +
        (unexpected.length > 0
          ? ` — judged and never declared: ${unexpected.join(", ")}`
          : "") +
        ". A destination that leaves no row behind is not a destination this pass measured.",
    );

  for (const entry of measured) {
    if (entry.titles !== 1)
      failures.push(
        `TITLE_BAND_NOT_MEASURED — ${entry.id}: „#surface-title” matched ${entry.titles} rendered ` +
          "element(s) here, not exactly one. The title band is UNRESOLVED on this screen, which " +
          "is a different sentence from „this screen has no action” — and reporting it as the " +
          "latter is how a screen drops out of coverage without anybody noticing.",
      );
    else if (entry.band === null)
      failures.push(
        `TITLE_BAND_NOT_MEASURED — ${entry.id}: „#surface-title” resolved but has no ancestor ` +
          "<header>, so this pass has no band to measure the action against. Instrument failure, " +
          "not a screen without an action.",
      );
  }

  const declared = rows.map((row) => row.id);
  const untouched = declared.filter((id) => !seen.includes(id));
  const undeclared = seen.filter((id) => !declared.includes(id));
  if (untouched.length > 0)
    failures.push(
      `TITLE_BAND_ROW_UNTOUCHED: ${untouched.length} of ${declared.length} row(s) in the ` +
        `canonical screen list were never reached by this walk (${untouched.join(", ")}). Either ` +
        "the screen was renamed and the row stayed behind, or the walk stopped getting there — " +
        "and a row nobody visits is a claim that can never be wrong.",
    );
  if (undeclared.length > 0)
    failures.push(
      `TITLE_BAND_ROW_UNDECLARED: this walk judged ${undeclared.join(", ")}, which the canonical ` +
        "screen list does not know. A screen measured but undeclared carries no statement about " +
        "what the prototype does there, so nothing above can call it a divergence — and work " +
        "nobody declared is work nobody admits to having skipped.",
    );

  if (!measured.some((entry) => entry.state === "IN_BAND"))
    failures.push(
      "TITLE_BAND_NEVER_IN_BAND: not one screen in this whole pass came back with its action in " +
        "the title row. This instrument then has NO evidence that it can return anything but a " +
        "finding, and a probe that can only go red is indistinguishable from a broken one. " +
        "Projects is today's witness (its band carries „New project”); if it stopped being one, " +
        "either delivered work regressed or the subject rule stopped matching.",
    );
  // TEN SAM STRAŻNIK NA DRUGIEJ OSI, i to nie jest symetria dla symetrii. Oś
  // pozioma powstała w locie, który akcje PRZENOSI, więc jest najmłodszą regułą
  // w tym pliku i jedyną, której nikt jeszcze nie widział zielonej na całej fali.
  // Reguła mierząca koniec pasma, która pomyliłaby stronę albo czytała krawędź
  // RAMKI zamiast krawędzi TREŚCI, wracałaby czerwona wszędzie — a „wszędzie
  // czerwono" jest w tym repozytorium nieodróżnialne od „przyrząd nie działa".
  if (!measured.some((entry) => entry.inlineState === "FLUSH_END"))
    failures.push(
      "TITLE_BAND_NEVER_FLUSH_END: not one screen in this whole pass came back with an action at " +
        "the END of its title band. The horizontal axis then has NO evidence that it can return " +
        "anything but a finding. Projects is today's witness on this axis too (its „New project” " +
        "ends exactly where the band's content box ends); if it stopped being one, either the " +
        "band stopped pushing its action to the end or this rule is reading the wrong edge.",
    );

  return failures;
};
