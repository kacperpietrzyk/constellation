// Czy akcja główna ekranu stoi w RZĘDZIE TYTUŁU — czyli pomiar MIEJSCA akcji,
// a nie jej farby.
//
// PO CO TO ISTNIEJE, i to jest jedyny akapit, który trzeba przeczytać. Dziewięć
// z 71 potwierdzonych rozjazdów z prototypem to jedno zdanie: akcja główna stoi
// WIERSZ NIŻEJ niż tytuł, zamiast po prawej stronie tego samego pasma. Ten
// przelot dochodzi do tej samej przyczyny WŁASNYM pomiarem i liczy pod nią
// OSIEM podmiotów — rachunek co do wiersza stoi przy `TITLE_BAND_DIVERGENCES`.
// Dziś mierzy się jej FARBĘ — pary L2-08 i L3-06 wracają ZIELONE, bo przycisk
// naprawdę jest fioletowy — i nikt nie mierzy jej MIEJSCA. To jest ta sama
// klasa co przy locie B1: bramka jest zielona na 122 parach, bo PARA MIERZY
// WYŁĄCZNIE TO, CO KTOŚ UMIAŁ ZAPISAĆ SELEKTOREM, a „pion tej rzeczy względem
// tamtej" nie jest właściwością jednego elementu i żadna para nie umie o to
// zapytać.
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
// NIE `.primary-button`. Lejek i Odnowienia PRZEŁĄCZAJĄ klasę akcji zależnie od
// stanu formularza (`PipelineSurface.tsx:860`, `RenewalsSurface.tsx:826`:
// `creating ? "secondary-button" : "primary-button"`), a Organizacje i Ludzie
// mają `secondary-button` BEZWARUNKOWO. Przyrząd kluczowany na jednej z tych
// klas gubiłby podmiot na czterech ekranach i przechodził po cichu — więc
// klasą akcji jest ZBIÓR, poniżej.
//
// `.ghost-button` do tego zbioru NIE NALEŻY, i to jest pomiar, nie gust. Jest
// świadomie przezroczysty (`styles.css:787`) — to odpowiednik prototypowego
// `.btn` bez modyfikatora — i siedzi na rzeczach, które akcją główną nie są:
// „Why read-only?" na Dziś, trzy strzałki tygodnia na Kalendarzu, „Areas and
// initiatives" na Projektach. Wciągnięcie go zamieniłoby Kalendarz w znalezisko
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
// jest rzędem; obszar treści jest wysoki. Zmierzone na dzisiejszym drzewie,
// wszystkie liczby z jednego przelotu 1440×900:
//
//     Lejek        pasmo 40    ← `.crumbbar` 36     WCHODZI  (akcja, wiersz niżej)
//     Odnowienia   pasmo 40    ← `.crumbbar` 36     WCHODZI
//     Organizacje  pasmo 40    ← `.crumbbar` 36     WCHODZI
//     Ludzie       pasmo 40    ← `.crumbbar` 36     WCHODZI
//     rekord proj. pasmo 58,6  ← `.crumbs`   36     WCHODZI  (akcje, rząd wyżej)
//     Dziś         pasmo 40    ← `section`   64     ODPADA   (to jest treść)
//     Skrzynka     pasmo 40    ← `section`  106,9   ODPADA   (to jest treść)
//     Zadania      pasmo 40    ← `.viewbar`  96,6   ODPADA
//     Spotkania    pasmo 70,6  ← `.lanes`   624,4   ODPADA
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
// TRZECIA ŚLEPA PLAMA, i domknięcie listy: MIARA JEST WYŁĄCZNIE PIONOWA. Prototyp
// odpycha akcję do PRAWEGO końca pasma (`.crumbbar .spacer { flex: 1 }`,
// `v3/app.css:293`), a ten werdykt nie odróżni tego od przycisku wciśniętego tuż
// za tytułem. Druga miara (porównanie krawędzi, tak samo bezpikselowa) należy do
// lotu, który akcje PRZENOSI — dokładanie jej tutaj zmieniłoby zbiór rozjazdów
// w locie, który ma tylko stawiać przyrządy. Do tego czasu przelot drukuje
// `x` obu pudełek, żeby przy odbiorze Fazy C dało się to sprawdzić z raportu,
// a nie ze zrzutu.
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
 * ROZSTRZYGNĄĆ, a nie ocenić: Faza C, lot C2 przenosi akcję główną do pasma
 * tytułu na czterech ekranach CRM i na Zadaniach, daje slot akcji `LibraryShell`
 * i `.meeting-hero`, i zdejmuje rząd akcji sprzed tytułu na ekranie rekordu
 * projektu — po czym KAŻDY wiersz `prototype: "action"` ma `today: "IN_BAND"`,
 * czyli `TITLE_BAND_DIVERGENCES` jest PUSTE. Dopiero wtedy zdanie „akcja główna
 * stoi w rzędzie tytułu" jest o tej aplikacji PRAWDĄ i wolno je egzekwować.
 * Przełączenie wcześniej zrobiłoby z bramki układu czerwień do końca fali, czyli
 * przyrząd, który nie pilnuje niczego innego.
 *
 * Rekord zadania NIE JEST na tej liście i to nie jest przeoczenie: prototyp
 * stawia tam wyłącznie kontrolki bez tła, więc nasze puste pasmo jest z nim
 * ZGODNE — patrz predykat symetrii w nagłówku.
 */
export const TITLE_BAND_ACTION_STATUS = "pending: FAZA C, lot C2";

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
 *   `today`     — CO ROBI TA APLIKACJA DZIŚ. Fakt o naszym drzewie, ODCZYTANY
 *                 Z PRZELOTU (`dowody/b2-czerwien.txt`), nie z lektury kodu.
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
    cite: 'v3/app.js:762-763 — crumbbar(„Today”, `<span class="when">`): drugi argument nie niesie przycisku',
    today: "NO_ACTION",
    app: "RealApp Today — .surface-header z <h1> i <p> pojemności (Wave2Surfaces.tsx:209-248)",
  },
  {
    id: "calendar",
    prototype: "no-action",
    cite: 'v3/screens/calendar.js:202 — crumbbar(„Calendar”, `<span class="when">`)',
    today: "NO_ACTION",
    app: "CalendarSurface.tsx:640-670 — w paśmie trzy ghost-button nawigacji tygodnia, żadnej akcji z wypełnieniem",
  },
  {
    id: "inbox",
    prototype: "no-action",
    cite: 'v3/screens/inbox.js:287-288 — crumbbar(„Inbox”, `<span class="when">`)',
    today: "NO_ACTION",
    app: "Wave2Surfaces.tsx:283-303 — drugie dziecko pasma to licznik, nie akcja",
  },
  {
    id: "settings",
    prototype: "no-action",
    // JEDYNY WIERSZ, KTÓREGO PROTOTYP NIE SKŁADA CRUMBBAREM, więc jedyny,
    // przy którym cytat trzeba było sprawdzić dwa razy: `app.js:1516` woła
    // `crumbbar("Settings")` bez drugiego argumentu, ale ta kopia jest
    // NIEŻYWA — `screens/settings.js` ładuje się po `app.js` i podmienia
    // Ustawienia na TRYB, tak samo jak podmienia Dziś, Skrzynkę, Projekty,
    // Lejek i Bibliotekę. Żywa głowa panelu niesie tytuł sekcji i podtytuł,
    // i ani jednego przycisku.
    cite: 'v3/screens/settings.js:1003-1006 — `.st-panel-head` to `<h2 id="st-title">` i `.st-panel-sub`, bez slotu akcji; tryb nie woła crumbbara w ogóle',
    today: "NO_ACTION",
    app: "SettingsSurface.tsx:990-1007 — w paśmie `settings-help-entry`, klasa spoza zbioru akcji",
  },
  {
    id: "projects",
    prototype: "action",
    cite: 'v3/screens/projects.js:343 — btn("New project", { cls: "primary", icon: "plus" })',
    today: "IN_BAND",
    app: "Wave2Surfaces.tsx:53-73 (SurfaceHeader renderuje {action}) + :789 secondary-button „New project”",
    // JEDYNY DZIŚ WIERSZ „IN_BAND", czyli JEDYNY dowód, że ten przyrząd umie
    // zwrócić cokolwiek poza znaleziskiem. Strażnik `TITLE_BAND_NEVER_IN_BAND`
    // pilnuje, żeby ten dowód nie zniknął po cichu.
  },
  {
    id: "tasks",
    prototype: "action",
    cite: 'v3/screens/tasks.js:507-513 — btn("New task", { cls: "primary", icon: "plus", act: "new-task" })',
    today: "NO_ACTION",
    app: "tasks/TasksSurface.tsx:460-464 — pasmo z samym <h1>; tworzenie idzie przez addToGroup (:353-355), nie przez akcję",
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
    cite: 'v3/screens/pipeline.js:409-410 — btn("New opportunity", { cls: "primary", icon: "plus" })',
    today: "BELOW_BAND",
    app: "pipeline/PipelineSurface.tsx:780-784 (pasmo, JEDNO dziecko) vs :844-868 (.crumbbar wiersz niżej)",
  },
  {
    id: "renewals",
    prototype: "action",
    cite: 'v3/screens/renewals.js:217 — btn("New renewal", { cls: "primary", icon: "plus" })',
    today: "BELOW_BAND",
    app: "renewals/RenewalsSurface.tsx:735-739 vs :823-833 (.crumbbar wiersz niżej)",
  },
  {
    id: "organizations",
    prototype: "action",
    cite: 'v3/screens/crm.js:371 — btn("New organization", { cls: "primary", icon: "plus" })',
    today: "BELOW_BAND",
    app: "StrategicDepthSurface.tsx:687-691 vs :726-736 (.crumbbar wiersz niżej, bez margin-inline-start: auto)",
  },
  {
    id: "people",
    prototype: "action",
    cite: 'v3/screens/crm.js:540 — btn("New person", { cls: "primary", icon: "plus" })',
    today: "BELOW_BAND",
    app: "people/PeopleSurface.tsx:484-488 vs :517-527 (.crumbbar wiersz niżej)",
  },
  {
    id: "meetings",
    prototype: "action",
    cite: 'v3/screens/meetings.js:431-433 — btn("Import from Jamie", { cls: "bordered", icon: "arrow" })',
    today: "NO_ACTION",
    app: "MeetingsSurface.tsx:729-739 — .meeting-hero to siatka JEDNOKOLUMNOWA (styles.css:3933-3937), prawy koniec pasma nie istnieje",
  },
  {
    id: "library",
    prototype: "action",
    cite: "v3/screens/knowledge.js:802-804 („New note”, primary) i :967-968 („Add a source”, primary)",
    today: "NO_ACTION",
    app: "library/LibraryShell.tsx:81-91 — pasmo ma DWOJE dzieci, ale prawy koniec trzyma LICZNIK; tworzenie stoi w kolumnie listy (NotesReading.tsx:364-371)",
    // JEDEN WIERSZ NA DWA WPISY REJESTRU, i to jest świadome. Rejestr filuje
    // Notatki i Źródła osobno, bo porównywał ZRZUTY dwóch ekranów. Pasmo jest
    // JEDNO — ten sam `LibraryShell` nad każdym z trzech odczytów, z tym samym
    // tytułem i tym samym brakiem slotu akcji — więc policzenie go dwa razy
    // byłoby dopisaniem podmiotu, którego nie ma. Poprawka też jest jedna.
  },
  {
    id: "projects/record:project",
    prototype: "action",
    cite: 'v3/screens/record.js:429-431 — btn("New task", { cls: "primary", icon: "plus", act: "new-task" }) W PAŚMIE',
    today: "ABOVE_BAND",
    app: "record/ProjectRecordScreen.tsx:300-306 — .crumbs z .actions renderowane PRZED nagłówkiem (:308); record-screen.module.css:62-68",
    // TRZECI KSZTAŁT ROZJAZDU: nie „wiersz niżej", tylko RZĄD WYŻEJ. Przyrząd
    // szukający akcji wyłącznie POD pasmem przegapiłby ten ekran w całości.
  },
  {
    id: "tasks/record:task",
    prototype: "no-action",
    cite: 'v3/screens/record.js:556-561 — drugim argumentem crumbbara są btn("Subscribe", { cls: "quiet" }) i <button class="icon-btn">, czyli DWIE kontrolki bez tła (app.css:306-314 baza bez `background`, :318 quiet zmienia sam kolor, :135-139 icon-btn dostaje tło dopiero na hover) — żadnego modyfikatora z PROTOTYPE_FILLED_MODIFIERS',
    today: "NO_ACTION",
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
    cite: "v3: `grep -n crumbbar screens/record.js app.js` daje ekrany rekordu projektu (:429), zadania (:556) i organizacji (:773) — szansy NIE MA",
    today: "NO_ACTION",
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
 * `no-screen` nie jest rozjazdem — patrz komentarz przy wierszu szansy.
 */
export const isTitleBandDivergence = (row) =>
  row.prototype === "action" ? row.today !== "IN_BAND" : false;

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
 *     wyłącznie, że umie czerwienieć, jest nieodróżnialny od zepsutego.
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

  return failures;
};
