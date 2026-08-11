// Break-testy sondy wierności wizualnej — czyli DOWÓD, że przyrząd, który
// Faza 0 postawiła, naprawdę mierzy język wizualny v3, a nie własną obecność.
//
// PO CO TO ISTNIEJE, skoro sonda była CZERWONA na `c2f7b5d`. Tamta czerwień
// jest dowodem MOMENTU: pokazała, że na farbie sprzed Fazy 1 przyrząd widzi
// brak akcentu. Nie jest dowodem TRWAŁYM. Od tamtej chwili doszło pięć lotów,
// dziesięć przyrządów i sto dwadzieścia par — a jedyne zdanie, jakie ktokolwiek
// mógłby dziś powiedzieć o tej sondzie, brzmi „przechodzi". Sonda, o której
// wiadomo wyłącznie, że jest zielona, jest nieodróżnialna od sondy, która nic
// nie mierzy. To jest dokładnie ta klasa fałszywego spokoju, którą to
// repozytorium zbiera od fal — i którą sonda wierności miała zamknąć.
//
// Plan adopcji języka v3 żąda tego wprost w punkcie 5 weryfikacji: „cofnąć
// akcent w tokenach i potwierdzić CZERWIEŃ. Zielony break-test = sonda nie
// mierzy."
//
// Po co osobny plik obok `scripts/break-test.mjs` (#211): tamten jest PĘTLĄ
// (dowodzi, że złamanie doszło do drzewa, a przywrócenie naprawdę przebudowało),
// a to jest LISTA ZŁAMAŃ — mówi, CO w tej fali miało prawo paść i dlaczego.
// Precedens: `scripts/break-crm-fixture.mjs`, `scripts/break-title-debt.mjs`.
//
// CHODZI RĘCZNIE, nie w `npm run check`: dzieli ograniczenie
// `verify-renderer-layout.mjs` — potrzebuje przeglądarki, której czysty klon
// nie ma. PORT PODAJE SIĘ Z ZEWNĄTRZ i to nie jest wygoda: bramka przypina go
// z `--strictPort`, ten harness odpala ją raz za razem, a dwa drzewa robocze na
// jednej maszynie zmierzyłyby sobie nawzajem aplikacje i wróciły ZIELONE
// (zmierzone w locie ACC fali E).
//
//   LAYOUT_PORT=5291 node scripts/break-visual-language.mjs
//
// KAŻDE ZŁAMANIE MA WŁASNY POWÓD CZERWIENI — i to jest cała treść tego pliku.
// Jedno złamanie dowodzi tylko tego, że sonda umie paść; kilka, celujących
// w RÓŻNE reguły, dowodzi, że pada na TYM, co deklaruje, a nie na czymkolwiek.
// Lot C2 dołożył szóste, dla POZIOMEJ osi pasma tytułu: pasmo ma już złamanie
// psujące PION (rozłożenie go na blok), a wada, przeciw której powstała druga
// oś, jest inna — akcja stoi w rzędzie tytułu, ale przy jego LEWEJ krawędzi.
//
// NAPRAWA PO PRZEGLĄDZIE LOTU C2 DOŁOŻYŁA DZIEWIĄTE, i to jest jedyne złamanie
// w tym pliku, które odtwarza WADĘ NAPRAWDĘ WYDANĄ na tej gałęzi, a nie wadę
// wyobrażoną: literał `box-shadow` na `.primary-button` zabrał akcji głównej
// pierścień ogniska w obu zwykłych motywach, a bramka wróciła zielona. Złamanie
// istnieje po to, żeby druga taka regresja nie mogła przejść cicho.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBreakTests } from "./break-test.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Podmiana, która PADA, kiedy nie trafiła.
 *
 * Napis, który nie trafił, jest najczęstszym powodem, dla którego break-test
 * wraca zielony: edycja jest wtedy no-opem, a pętla mierzy niezmieniony kod.
 * Wielokrotne trafienie jest równie złe — edycja ląduje gdzie indziej niż
 * celuje, więc werdykt opisuje inne złamanie niż nazwa.
 */
const replaceOnce = (text, needle, replacement, what) => {
  const at = text.indexOf(needle);
  if (at === -1)
    throw new Error(
      `${what}: the text this break edits is no longer in the file, so the ` +
        "break would be a no-op and a green run would mean nothing.",
    );
  if (text.indexOf(needle, at + needle.length) !== -1)
    throw new Error(
      `${what}: the text this break edits appears more than once, so the edit ` +
        "would not land where it is aimed.",
    );
  return text.slice(0, at) + replacement + text.slice(at + needle.length);
};

/**
 * Które złamania z tej listy naprawdę wykonać.
 *
 * PO CO, skoro pełna lista jest treścią tego pliku: jedno złamanie to trzy
 * przebudowy i trzy przeloty bramki, a lista ma ich trzynaście — czyli godziny.
 * Lot, który uzbraja JEDEN przyrząd, ma obowiązek podać trzy liczby dla SWOJEGO
 * złamania i nie ma powodu przepalać cudzych. Filtr jest po fragmencie
 * NAZWY, więc nie da się nim wskazać złamania, które nie istnieje: pusty wybór
 * pada niżej zamiast wrócić zielony na zerze wykonanych złamań — dokładnie ta
 * pułapka, którą fala C zapłaciła na harnessie ekranu szansy.
 *
 *   BREAK_ONLY="button reset" LAYOUT_PORT=5291 node scripts/break-visual-language.mjs
 */
const only = process.env.BREAK_ONLY ?? "";
const select = (breaks) => {
  if (only === "") return breaks;
  // KILKA FRAGMENTÓW ROZDZIELONYCH `|`, bo lot, który dowozi cztery złamania,
  // inaczej płaci za każde z nich osobną BAZĄ — a baza to pełny przelot bramki.
  // Dopisane w locie D1 Fazy D, po przebiegu, w którym cztery nazwy podane
  // naraz nie trafiły w nic i harness — poprawnie — padł zamiast wrócić zielony
  // na zerze wykonanych złamań.
  const needles = only.split("|").filter((part) => part !== "");
  const chosen = breaks.filter((entry) =>
    needles.some((needle) => entry.name.includes(needle)),
  );
  if (chosen.length === 0)
    throw new Error(
      `BREAK_ONLY="${only}" matched none of the ${breaks.length} break(s) in this file, ` +
        "so this run would prove nothing while looking like a pass. Names available:\n" +
        breaks.map((entry) => `  ${entry.name}`).join("\n"),
    );
  console.log(
    `BREAK_ONLY="${only}" → running ${chosen.length} of ${breaks.length} break(s)`,
  );
  return chosen;
};

const outcome = runBreakTests({
  root,
  build: { command: "npm", args: ["run", "build"] },
  verify: { command: "npm", args: ["run", "test:renderer-layout"] },
  breaks: select([
    {
      // ZŁAMANIE PIERWSZE — TO, KTÓREGO ŻĄDA PLAN: cofnięcie akcentu do
      // Black Glass. Nie „przygaszenie", tylko powrót do tego, co ta aplikacja
      // niosła przez trzy fale: rampa prawie achromatyczna o odcieniu 255.
      //
      // TRZY EDYCJE, NIE JEDNA, i to jest treść, a nie porządki. Sama rampa
      // `--a-*` nie wystarcza: akcent o niskiej mocy (`--accent-quiet`,
      // `--accent-quieter`, `--accent-edge`, `--accent-glow`) stoi w tym pliku
      // LITERAŁAMI `oklch()`, osobno w każdym motywie, i przeżyłby zgaszenie
      // samej rampy. Aktywna pozycja nawigacji bierze `--accent-quieter`, więc
      // złamanie tylko rampy zaczerwieniłoby akcję główną i pierścień, a
      // nawigację ZOSTAWIŁO ZIELONĄ — co czyta się jak „sonda mierzy dwa z
      // trzech podmiotów", a znaczy „złamanie było niepełne".
      //
      // Chroma 0.005 przy odcieniu 255 pada na OBU warunkach sondy naraz
      // (podłoga chromy 0.09, pas odcienia 295±25) — czyli tak, jak padał
      // dzisiejszy neutralny przed Fazą 1.
      name: "revert the accent to Black Glass: the primary action, the active navigation item and the focus ring all go neutral",
      file: "packages/desktop-ui/src/tokens.css",
      edit: (text) => {
        const ramp = replaceOnce(
          text,
          `  --a-700: oklch(46% 0.19 295);
  --a-600: oklch(55% 0.21 295);
  --a-500: oklch(64% 0.2 295);
  --a-400: oklch(72% 0.17 295);
  --a-300: oklch(80% 0.12 295);`,
          `  --a-700: oklch(46% 0.005 255);
  --a-600: oklch(55% 0.005 255);
  --a-500: oklch(64% 0.005 255);
  --a-400: oklch(72% 0.005 255);
  --a-300: oklch(80% 0.005 255);`,
          "the accent ramp",
        );
        const dark = replaceOnce(
          ramp,
          `  --accent-quiet: oklch(64% 0.2 295 / 0.16);
  --accent-quieter: oklch(64% 0.2 295 / 0.08);
  --accent-edge: oklch(64% 0.2 295 / 0.42);
  --accent-glow: oklch(64% 0.2 295 / 0.28);`,
          `  --accent-quiet: oklch(64% 0.005 255 / 0.16);
  --accent-quieter: oklch(64% 0.005 255 / 0.08);
  --accent-edge: oklch(64% 0.005 255 / 0.42);
  --accent-glow: oklch(64% 0.005 255 / 0.28);`,
          "the dark theme's low-power accent literals",
        );
        return replaceOnce(
          dark,
          `  --accent-quiet: oklch(55% 0.21 295 / 0.13);
  --accent-quieter: oklch(55% 0.21 295 / 0.07);
  --accent-edge: oklch(55% 0.21 295 / 0.4);
  --accent-glow: oklch(55% 0.21 295 / 0.22);`,
          `  --accent-quiet: oklch(55% 0.005 255 / 0.13);
  --accent-quieter: oklch(55% 0.005 255 / 0.07);
  --accent-edge: oklch(55% 0.005 255 / 0.4);
  --accent-glow: oklch(55% 0.005 255 / 0.22);`,
          "the light theme's low-power accent literals",
        );
      },
    },
    {
      // ZŁAMANIE DRUGIE — I BEZ NIEGO PIERWSZE DOWODZI POŁOWY. Akcent zostaje
      // w arkuszu w pełnej mocy, zdefiniowany, fioletowy i policzalny grepem;
      // odpięty zostaje JEDEN konsument. `--action-primary-bg` wraca na
      // `--neutral-100`, czyli DOKŁADNIE na wartość sprzed Fazy 1 (`21c7864~1`,
      // tokens.css:166) — biały przycisk akcji głównej.
      //
      // To jest test SONDY, nie tokenów: przyrząd czytający ŹRÓDŁO („czy
      // `--accent` jest zdefiniowany", „czy nazwa pada w arkuszu") przechodzi
      // to złamanie bez mrugnięcia, bo nazwa nadal tam stoi i nadal jest
      // fioletowa. Czerwień może tu przyjść WYŁĄCZNIE z odczytu tego, co
      // przeglądarka naprawdę narysowała na przycisku. Nazwa w CSS przechodzi,
      // kiedy nikt jej nie użył — od tego zdania zaczęła się cała ta faza.
      name: "keep the accent defined and unplug one consumer: the primary action goes white while --accent stays violet in the sheet",
      file: "packages/desktop-ui/src/tokens.css",
      edit: (text) =>
        replaceOnce(
          text,
          "  --action-primary-bg: var(--accent-legible-bg);",
          "  --action-primary-bg: var(--neutral-100);",
          "the primary action's resting fill",
        ),
    },
    {
      // ZŁAMANIE TRZECIE — DRUGA POŁOWA JĘZYKA, TA NIE-KOLOROWA. Faza 2 zdjęła
      // tytuł ekranu z nagłówka display (`--text-display`, 30-42 px) na pasmo
      // crumbbara (`--text-sm`, waga 600). Kolor i typografia to w tym planie
      // jedna pozycja, więc break-test mierzący wyłącznie farbę zostawiłby
      // połowę adopcji bez ani jednego dowodu.
      //
      // Wraca dokładnie ten literał, który stał tu przed Fazą 2 — nie „coś
      // większego". Sufit sondy to 1,25 rem wyliczone z ŻYWEGO rem, więc to
      // złamanie ma paść tak samo przy tekście przeskalowanym do 200%, gdzie
      // wpisana liczba pikseli by się rozjechała.
      name: "put the display heading back on the surface header: the screen title draws over the crumbbar ceiling again",
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.surface-header h1,
.surface-header h2 {
  margin: 0;
  font-size: var(--text-sm);`,
          `.surface-header h1,
.surface-header h2 {
  margin: 0;
  font-size: clamp(1.9rem, 2.2vw, 2.6rem);`,
          "the surface header's title size",
        ),
    },
    {
      // ZŁAMANIE CZWARTE — DLA SPISU FARBY KONTROLEK (Faza B, lot B1;
      // PRZECELOWANE W LOCIE C3 FAZY C).
      //
      // CO SIĘ ZMIENIŁO I DLACZEGO TO JEST CAŁA TREŚĆ TEGO WPISU. Dopóki
      // przyrząd stał na `pending`, był na drzewie CZERWONY: znajdował
      // CZTERNAŚCIE kształtów kontrolek na PIĘCIU ekranach malujących się farbą
      // systemową. Baza nie mogła więc być zielona „bo nic nie znaleziono" —
      // była zielona, bo te czternaście stało WYPISANYCH w `KNOWN_CONTROL_PAINT`
      // i tylko się DRUKOWAŁO. Złamanie musiało wtedy celować w kontrolkę, która
      // tło MA (`.secondary-button`), żeby w ogóle powstał podpis SPOZA rejestru.
      //
      // Lot C3 domknął przyczynę: reset deklaruje `background: none`
      // (`packages/desktop-ui/src/styles.css`, za prototypem `v3/app.css:19`),
      // rejestr jest PUSTY, a `CONTROL_PAINT_STATUS` stoi na „enforced". Baza
      // jest dziś zielona dlatego, że przyrząd NAPRAWDĘ niczego nie znajduje —
      // i to znaczy, że złamanie wolno wreszcie wycelować w SAMĄ ODDANĄ
      // POPRAWKĘ, zamiast w kontrolkę zastępczą.
      //
      // ZŁAMANIE ZDEJMUJE JEDNĄ DEKLARACJĘ Z RESETU. Trzynaście kształtów
      // przyciskowych wraca wtedy na `ButtonFace` silnika (zmierzone:
      // `rgb(107,107,107)` w ciemnym, `rgb(239,239,239)` w jasnym) przy pustym
      // rejestrze i uzbrojonym przyrządzie, więc każdy z nich jest werdyktem,
      // który zatrzymuje przebieg. Czternasty kształt — bezklasowe pole „Change
      // title" w Bibliotece — bierze tło z osobnej reguły i CELOWO nie jest tym
      // złamaniem ruszany: gdyby jedna edycja gasiła wszystko naraz, ten
      // break-test dowodziłby, że przyrząd umie paść, a nie że pada na TYM, co
      // deklaruje.
      //
      // CZEGO TO ZŁAMANIE JUŻ NIE DOWODZI, i to jest świadoma strata: dawna
      // wersja gasiła zarazem KONTROLĘ DODATNIĄ (`.secondary-button` jest jednym
      // z trzech świadków), więc zapalała też `CONTROL_PAINT_WITNESS_FLAGGED`.
      // Ta ścieżka nie ma dziś własnego złamania. Wybór jest taki: czerwień
      // PRZYPISYWALNA do oddanej deklaracji bije czerwień nadokreśloną, a
      // świadek dalej pilnuje siebie w każdym przebiegu bramki — po prostu nie
      // jest tu łamany.
      name: "take `background: none` off the button reset: thirteen shapes fall back to the engine's ButtonFace against an EMPTY registry on an ARMED census",
      // CZERWIEŃ PRZYPIĘTA DO NAZWANEJ ASERCJI, a nie do kodu wyjścia. Zdjęcie
      // tła z resetu zapala trzynaście werdyktów naraz i sam kod wyjścia nie
      // umie powiedzieć, który z nich to zrobił — ani czy nie zrobił tego
      // zupełnie inny przelot bramki. Oba fragmenty pochodzą z `classifyControlPaint`,
      // czyli z WERDYKTU, nie z awarii przyrządu, a drugi jest zdaniem
      // wypowiadanym WYŁĄCZNIE wtedy, gdy farba kontrolki równa się farbie gołej
      // kontrolki tej przeglądarki — czyli dokładnie tym, co ta poprawka usunęła.
      expectRedContains: [
        "which is neither fully transparent nor any of the",
        "so no rule of this stylesheet set it",
      ],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `button {
  border: 0;
  background: none;
  touch-action: manipulation;
}`,
          `button {
  border: 0;
  touch-action: manipulation;
}`,
          "the button reset's declared transparency",
        ),
    },
    {
      // ZŁAMANIE PIĄTE — DLA POZYCJI AKCJI W PAŚMIE TYTUŁU (Faza B, lot B2).
      //
      // TEN SAM PROBLEM, KTÓRY ZŁAMANIE CZWARTE MIAŁO DO LOTU C3, I TA SAMA
      // ODPOWIEDŹ — tamto zostało PRZECELOWANE, kiedy jego przyrząd wreszcie
      // przestał cokolwiek znajdować; ten wpis czeka na to samo. Przyrząd
      // B2 jest na dzisiejszym drzewie CZERWONY: osiem ekranów stawia akcję
      // główną poza rzędem tytułu. Baza nie może więc być zielona „bo nic nie
      // znaleziono" — jest zielona, bo te osiem stoi WYPISANYCH
      // w `TITLE_BAND_ROWS` (`scripts/title-band-action.mjs`) z adresem
      // w prototypie, i tylko się drukuje. Kod wyjścia bramki zależy od tego,
      // czy przyrząd znalazł coś, czego kanoniczna lista NIE PRZEWIDUJE.
      //
      // DLATEGO ZŁAMANIE CELUJE W JEDYNY EKRAN, KTÓRY DZIŚ TRZYMA AKCJĘ
      // W PAŚMIE. Projekty są w tej tabeli jedynym wierszem `IN_BAND`
      // (`Wave2Surfaces.tsx:53-73` renderuje `{action}` jako drugie dziecko
      // pasma, `:789` wkłada tam „New project"). Zdjęcie `display: flex`
      // z `.surface-header` rozkłada pasmo na blok, czyli przenosi akcję pod
      // tytuł — dokładnie ten rozjazd, którego ten przyrząd szuka, tyle że
      // wprowadzony tam, gdzie go dziś NIE MA.
      //
      // CZERWIENIĄ JEST WERDYKT NAD EKRANEM, KTÓRY ROZJECHAŁ SIĘ Z KANONICZNĄ
      // LISTĄ: Projekty zmierzone jako BELOW_BAND wobec deklarowanego IN_BAND.
      //
      // `TITLE_BAND_NEVER_IN_BAND` ZSZEDŁ Z TEJ LISTY W LOCIE C2 i to jest
      // zapisane tutaj, a nie przemilczane. Do C2 Projekty były JEDYNYM
      // ekranem trzymającym akcję w paśmie, więc to złamanie zabierało
      // przyrządowi ostatniego świadka i strażnik padał razem z werdyktem.
      // Lot C2 dał pasmo akcji także Zadaniom, Lejkowi, Odnowieniom,
      // Organizacjom, Ludziom i Bibliotece — a Biblioteka składa własny
      // nagłówek (`library.module.css .header`), którego ta edycja NIE dotyka.
      // Świadek zostaje więc nawet przy rozłożonym `.surface-header`, strażnik
      // milczy i fragment po nim byłby dziś asercją na zdarzenie, które nie
      // zachodzi — czyli break-testem, który przeszedł z niewłaściwego powodu.
      //
      // FRAGMENT JEST PREFIKSEM WERDYKTU, BEZ CZĘŚCI POZIOMEJ: wiersz raportu
      // niesie od lotu C2 OBIE osie (`BELOW_BAND/INSET_FROM_END`), a ten
      // break-test odpowiada za oś PIONOWĄ. Wpisanie tu pełnej pary związałoby
      // go z werdyktem drugiego przyrządu.
      name: "lay the surface header out as a block: the screens that keep their primary action in the title row drop it a line",
      expectRedContains: [
        "projects: this pass measured BELOW_BAND",
        "organizations: this pass measured BELOW_BAND",
      ],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.surface-header {
  max-width: var(--surface-measure, 58rem);
  min-height: var(--header-band-height);
  margin: 0 auto var(--space-6);
  display: flex;`,
          `.surface-header {
  max-width: var(--surface-measure, 58rem);
  min-height: var(--header-band-height);
  margin: 0 auto var(--space-6);
  display: block;`,
          "the surface header's row layout",
        ),
    },
    {
      // ZŁAMANIE DLA OSI POZIOMEJ PASMA TYTUŁU (Faza C, lot C2).
      //
      // PO CO OSOBNE ZŁAMANIE, SKORO PASMO MA JUŻ JEDNO. Tamto rozkłada pasmo
      // na blok, czyli psuje PION — akcja spada wiersz niżej. Oś pozioma
      // powstała przeciw zupełnie innej wadzie: akcji, która JEST w rzędzie
      // tytułu, ale stoi tuż za tytułem zamiast u prawego końca pasma. Raport
      // Fazy B nazywał tę ślepotę wprost („NIE MIERZĘ POZIOMU, TYLKO PION"),
      // a rejestr rozjazdów żąda przy Odnowieniach i przy Organizacjach akcji
      // DOSUNIĘTEJ DO PRAWEJ. Bez tego złamania nowa oś jest regułą, o której
      // wiadomo wyłącznie, że jest zielona.
      //
      // EDYCJA ZDEJMUJE DOKŁADNIE JEDNĄ DEKLARACJĘ — `justify-content:
      // space-between` z `.surface-header`. To jest ta sama reguła, która
      // w prototypie nazywa się `.crumbbar .spacer { flex: 1 }`
      // (`v3/app.css:293`) i która do lotu C2 stała w tym arkuszu MARTWA, bo
      // pasmo miało jedno dziecko. Bez niej pasmo zostaje rzędem
      // (`display: flex`, `align-items: center`), więc PION się nie rusza —
      // i to jest cała wartość tego złamania: czerwień przychodzi WYŁĄCZNIE
      // z osi poziomej, a werdykt czyta się `IN_BAND/INSET_FROM_END`.
      //
      // DWA EKRANY W ASERCJI, NIE JEDEN: fragment na pojedynczym ekranie
      // przeszedłby również wtedy, gdyby edycja trafiła w coś, co dotyka tylko
      // jego. Oba wymienione niżej rysują `.surface-header`, więc oba muszą
      // paść razem.
      //
      // `TITLE_BAND_NEVER_FLUSH_END` NIE JEST TU OCZEKIWANY i to jest ten sam
      // powód co przy złamaniu wyżej: Biblioteka składa własny nagłówek, który
      // ta edycja pomija, więc świadek osi poziomej zostaje.
      //
      // KOTWICA MA DWIE HISTORIE I OBIE SĄ TREŚCIĄ, bo obie są klasami defektu
      // tego harnessu:
      //
      //   1. `align-items: center; justify-content: space-between; gap: …` stoi
      //      w `styles.css` STO SZEŚĆDZIESIĄT razy, więc pierwszy przebieg padł
      //      na strażniku wielokrotnego trafienia w `replaceOnce` — dokładnie
      //      tak, jak miał: edycja, która nie wie, gdzie ląduje, opisuje inne
      //      złamanie niż jej nazwa. To jest awaria GŁOŚNA i tania.
      //   2. Poprawka po niej kotwiczyła od selektora i WSTAWIAŁA
      //      `justify-content: flex-start` przed `display: flex` — a reguła
      //      trzy wiersze niżej dalej deklarowała `space-between`. W CSS wygrywa
      //      deklaracja PÓŹNIEJSZA, więc złamanie było no-opem dla kaskady
      //      i wróciło ZIELONE: „baseline GREEN → break GREEN → restore GREEN".
      //      To jest awaria CICHA i jest dokładnie tą, którą ten plik istnieje,
      //      żeby łapać: strażnik `replaceOnce` pilnuje, gdzie ląduje TEKST,
      //      i nie ma zdania o tym, co robi z nim KASKADA.
      //
      // Kotwicą jest więc SAMA DEKLARACJA razem z komentarzem nad nią (napis
      // unikalny w całym arkuszu), a edycja PODMIENIA wartość zamiast dokładać
      // drugą.
      name: "take space-between off the surface header: the primary action stops standing at the band's end and stands right behind the title instead",
      expectRedContains: [
        "organizations: this pass measured IN_BAND/INSET_FROM_END",
        "renewals: this pass measured IN_BAND/INSET_FROM_END",
      ],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `     niczego, co widać. W rzędzie o wysokości pasma równa się do rzędu tytułu. */
  align-items: center;
  justify-content: space-between;`,
          `     niczego, co widać. W rzędzie o wysokości pasma równa się do rzędu tytułu. */
  align-items: center;
  justify-content: flex-start;`,
          "the surface header's end alignment",
        ),
    },
    {
      // ZŁAMANIE SZÓSTE — DLA SZYNY AKTYWNEJ NAWIGACJI (Faza C, lot C1).
      //
      // CELUJE W WARSTWĘ, KTÓRĄ PARA NAPRAWDĘ CZYTA, i to jest jedyny wybór,
      // który cokolwiek dowodzi. Kuszące złamanie — zdjęcie `position: relative`
      // z `.nav-item` — wraca ZIELONE i jest tego dowodem: `::before` dalej się
      // generuje i dalej rozwiązuje się do akcentu, więc obie pary C1-01a
      // i C1-02 mają swój pomiar, a szyna ląduje przy górnej krawędzi całej
      // kolumny. Dokładnie ta klasa ślepoty asercji zwróciła pięć zielonych
      // break-testów przy wycofywaniu powierzchni `work`.
      //
      // Skasowanie WYPEŁNIENIA szyny nie wystarcza z drugiej strony: bez
      // `background` pseudoelement dalej istnieje, a `backgroundColor` wraca
      // `rgba(0, 0, 0, 0)`, czyli farbą NIECZYTELNĄ — para zgłasza wtedy
      // NOT_MEASURED (awarię przyrządu), a nie werdykt o produkcie. Złamanie
      // zdejmuje więc `content`, czyli JEDYNĄ deklarację, która decyduje o tym,
      // czy warstwa w ogóle powstaje: `getComputedStyle(el, "::before").content`
      // wraca wtedy „none", przelot mapuje to na PSEUDO_ABSENT, a PSEUDO_ABSENT
      // jest DIFFERS z nazwą pozycji.
      //
      // CZERWIEŃ PADA NA DWÓCH PRZELOTACH NARAZ i to jest treść, nie hałas:
      // powłoka lądowania traci szynę wiersza bieżącego (C1-01a), a przelot
      // tras traci ją na celu nadrzędnym otwartego rekordu projektu (C1-02) —
      // czyli obie połowy jednej reguły powłokowej, każda zmierzona tam, gdzie
      // się rysuje. Fragmenty niżej pinują obie, bo sam kod wyjścia nie
      // odróżnia ich ani od siebie, ani od czerwieni pozostałych przelotów.
      //
      // TRZECIĄ PARĄ JEST C1-01c (szerokość szyny), dopisana przy naprawie lotu.
      // Nie jest tu z uprzejmości: `readValue` sprawdza `content` PRZED odczytem
      // właściwości, więc na `content: none` KAŻDY odczyt tego pseudoelementu
      // wraca `PSEUDO_ABSENT` — także pomiar geometryczny. `expectRedContains`
      // jest ZAWIERANIEM, więc pominięcie C1-01c zostawiłoby to złamanie
      // ZIELONE mimo trzeciej padającej pary, a fragment przestałby opisywać
      // zasięg, który naprawdę ma.
      name: "stop generating the navigation rail: the row the reader is on says so with a wash alone, and both the shell pass and the routed pass lose the ink",
      expectRedContains: [
        "C1-01a",
        "C1-01c",
        "C1-02",
        "the ::before pseudo-element is not generated (content: none)",
      ],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.nav-item.active::before,
.nav-item[data-nav-open]::before {
  content: "";
  position: absolute;`,
          `.nav-item.active::before,
.nav-item[data-nav-open]::before {
  position: absolute;`,
          "the navigation rail's generating declaration",
        ),
    },
    {
      // ZŁAMANIE SIÓDME — DLA PARY, KTÓRA NIOSŁA NAGŁÓWEK LOTU (Faza C, lot C1).
      //
      // Szóste złamanie celuje w `content`, więc czerwień przypisuje się do
      // C1-01a i C1-02 — obu par czytających FARBĘ szyny. C1-01b („przestaje
      // ramkować wiersz") nie miała ani jednego dowodu, że umie się zaczerwienić
      // na złamanym kodzie, a to jest dokładnie ta pozycja, którą lot ogłasza
      // w swoim tytule. Złamanie PRZYWRACA wadę, którą lot usunął: obwódkę
      // akcentu po całym obwodzie wiersza.
      //
      // DLACZEGO TO IDZIE NA CZERWONO: baza `.nav-item` niesie
      // `border: 1px solid transparent` (żeby stan aktywny nie ruszał układu),
      // więc przywrócony `border-color` rozwiązuje się do akcentu i rozmija
      // z literałem `rgba(0, 0, 0, 0)`, którego żąda C1-01b.
      //
      // CZEGO TU NIE MA I DLACZEGO: NIE MA złamania na
      // `margin-left: calc(-1 * var(--nav-gutter))` w `.sidebar nav`, choć to
      // jedyny mechanizm decydujący o tym, czy szynę WIDAĆ. Wróciłoby ZIELONE:
      // wszystkie trzy pary czytają `getComputedStyle`, a styl wyliczony nie
      // wie o przycięciu. Złamanie, o którym z góry wiadomo, że jest zielone,
      // to uzbrojenie udawane — pozycja stoi zamiast tego wypisana
      // w `VISUAL_LANGUAGE_NOT_COVERED`.
      name: "put the accent frame back around the current navigation row: the rail stops being the only ink and the row is outlined again",
      expectRedContains: ["C1-01b"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.nav-item.active,
.nav-item[data-nav-open] {
  color: var(--nav-active-text);`,
          `.nav-item.active,
.nav-item[data-nav-open] {
  border-color: var(--nav-active-border);
  color: var(--nav-active-text);`,
          "the current navigation row's paint rule",
        ),
    },
    {
      // ZŁAMANIE ÓSME — DLA SONDY KIEROWANEJ NA AKCJĘ GŁÓWNĄ PASMA, dopisane
      // przy naprawie po przeglądzie lotu C2.
      //
      // ODTWARZA DOKŁADNIE TĘ WADĘ, KTÓRĄ LOT C2 WPROWADZIŁ, A BRAMKA
      // PRZEPUŚCIŁA. Lot dał `.primary-button` własny `box-shadow` LITERAŁEM,
      // czyli selektorem klasowym o swoistości (0,1,0) w `styles.css` — pliku
      // wczytywanym PO `tokens.css`. Globalna reguła pierścienia stoi na
      // `:where(button, a, …):focus-visible`, ma tę samą swoistość (0,1,0)
      // i przegrywa KOLEJNOŚCIĄ, więc akcja główna sześciu ekranów wyglądała
      // przy ognisku dokładnie tak, jak w spoczynku, w obu zwykłych motywach.
      // Cała bramka wróciła wtedy ZIELONA, łącznie z przelotem widoczności
      // ogniska — bo `.primary-button` nie był przystankiem spaceru lądowania,
      // a jego brak był w przyrządzie NAZWANY zamiast zmierzony.
      //
      // DLACZEGO TO IDZIE NA CZERWONO DZISIAJ: sonda kierowana dochodzi Tabem
      // do `.surface-header .primary-button` na Ludziach i porównuje jego farbę
      // spoczynkową z farbą przy `:focus-visible`. Z rolą cienia pierścień
      // składa się PRZED materiałem i cień się zmienia; z literałem nie zmienia
      // się nic — ani cień, ani tło, ani krawędź, a kontur jest przezroczystą
      // podkładką pod tryb wymuszonych kolorów, nie wskaźnikiem.
      //
      // ŁAMANA JEST SAMA REGUŁA SPOCZYNKOWA, NIE HOVER: sonda nie najeżdża
      // kursorem, więc złamanie hoveru wróciłoby ZIELONE i uzbrojenie byłoby
      // udawane. Wariant hoveru czyta bliźniaczą rolę i jest chroniony tym samym
      // mechanizmem, ale JEGO dowodem jest kaskada, nie ten break-test — i tak
      // to trzeba czytać.
      name: "give the band's primary action its own literal box-shadow again: the material stops being a role and the focus ring loses to it on order",
      expectRedContains: [
        "the band's primary action",
        ".surface-header .primary-button",
        "draws NOTHING a person can see",
      ],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.primary-button {
  color: var(--action-primary-text);
  background: var(--action-primary-bg);
  box-shadow: var(--action-primary-shadow);
}`,
          `.primary-button {
  color: var(--action-primary-text);
  background: var(--action-primary-bg);
  box-shadow:
    inset 0 1px 0 oklch(100% 0 0 / 0.24),
    0 1px 2px oklch(0% 0 0 / 0.28),
    0 0 0 1px var(--accent-edge);
}`,
          "the primary action's shadow role",
        ),
    },
    {
      // ZŁAMANIE DZIESIĄTE — DLA PARY LOTU C5, czyli dla kontrolki wyboru
      // stojącej w paśmie akcji rekordu projektu.
      //
      // ODTWARZA DOKŁADNIE STAN SPRZED TEGO LOTU, a nie wadę wyobrażoną:
      // przed C5 `.actions select` nie istniało w ogóle, więc goły `<select>`
      // brał całą swoją postać z gołej reguły `select` arkusza globalnego —
      // stopień pisma odziedziczony po `body` (`--text-base`, 0,875 rem) obok
      // sąsiadów o `--text-sm` (0,8125 rem) i `--radius-sm` obok ich
      // `--radius-md`. Skasowanie tej jednej reguły cofa OBIE własności naraz.
      //
      // DLACZEGO TO IDZIE NA CZERWONO: obie pary czytają `getComputedStyle` na
      // `[data-record-kind="project"] [class*="_crumbs_"] select` po otwarciu
      // rekordu projektu i porównują z tokenem rozwiązanym W TEJ SAMEJ
      // STRONIE. Bez tej reguły `fontSize` wraca 14px przy żądanych 13px,
      // a `borderTopLeftRadius` 6px przy żądanych 12px — dwie różne liczby
      // z dwóch różnych miejsc kaskady, więc czerwień da się przypisać do
      // pary, a nie do „czegoś w tym pliku".
      //
      // CO TO ZŁAMANIE ZOSTAWIA NIETKNIĘTE I DLACZEGO: zostawia
      // `max-inline-size`, żeby czerwień dało się przypisać do C5-01a/b i tylko
      // do nich. Szerokość ma OD 2026-08-11 własne złamania (jedenaste,
      // dwunaste, trzynaste) — do tamtej daty stała tu nota mówiąca, że pary na
      // szerokość napisać SIĘ NIE DA, i była ona nieprawdą o runnerze.
      name: "delete the record strip's select rule: the control goes back to the bare `select` rule and stands beside the buttons with a bigger type size and a different corner",
      expectRedContains: ["C5-01a", "C5-01b"],
      file: "packages/desktop-ui/src/record/record-screen.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.actions select {
  max-inline-size: 16rem;
  padding-inline: var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}`,
          `.actions select {
  max-inline-size: 16rem;
}`,
          "the record action strip's select rule",
        ),
    },
    {
      // ZŁAMANIE JEDENASTE — SUFIT SZEROKOŚCI W PAŚMIE AKCJI (C5-01c).
      //
      // PODNIESIENIE SUFITU, A NIE JEGO SKASOWANIE, i ta różnica jest treścią.
      // Skasowana deklaracja daje `max-width: none`, a `none` nie jest
      // długością: runner wraca wtedy NOT_MEASURED (`verify-renderer-layout
      // .mjs:3665-3672`), czyli AWARIĄ PRZYRZĄDU, a awaria przyrządu to nie
      // jest werdykt o kodzie. `32rem` daje czysty DIFFERS — „512px” przy
      // żądanych „256px” — z obiema liczbami wydrukowanymi w wierszu pary.
      name: "raise the record strip's select ceiling to 32rem: the control may run twice as wide as the sheet declares",
      expectRedContains: ["C5-01c"],
      file: "packages/desktop-ui/src/record/record-screen.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.actions select {
  max-inline-size: 16rem;`,
          `.actions select {
  max-inline-size: 32rem;`,
          "the record action strip's select ceiling",
        ),
    },
    {
      // ZŁAMANIE DWUNASTE — OBIE OSIE KONTROLKI W USTAWIENIACH (C5-02a/b).
      //
      // JEDEN WPIS, DWIE PARY, bo to jeden plik i jedna pozycja lotu, a harness
      // złamań edytuje w jednym wpisie dokładnie jeden plik. Czerwień zostaje
      // przypisywalna mimo to: `expectRedContains` wymaga OBU identyfikatorów,
      // więc wpis przechodzi tylko wtedy, gdy KAŻDA z dwóch par naprawdę
      // zareagowała (`break-test.mjs:203-213`).
      //
      // ODTWARZA STAN SPRZED LOTU CO DO ZNAKU: `align-self: stretch` (kolumna
      // rozpina kontrolkę na całą taflę) i `flex: 1` (kontrolka zjada wolne
      // miejsce rzędu, więc pole wyboru staje się tak szerokie jak sąsiednie
      // pole tekstowe).
      name: "put the settings select back under the column's stretch and let it eat the row's free space",
      expectRedContains: ["C5-02a", "C5-02b"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          replaceOnce(
            text,
            `.settings-control > select {
  align-self: start;
}`,
            `.settings-control > select {
  align-self: stretch;
}`,
            "the settings select's cross-axis rule",
          ),
          `.settings-control select {
  min-height: 2.75rem;
  flex: 0 1 auto;`,
          `.settings-control select {
  min-height: 2.75rem;
  flex: 1;`,
          "the settings select's main-axis rule",
        ),
    },
    {
      // ZŁAMANIE TRZYNASTE — KONTROLKA WIĄZANIA KLIENTA NA SZYNIE REKORDU
      // (C5-03). Wraca dokładnie do `flex: 1 1 8rem` sprzed lotu, czyli do
      // kontrolki zjadającej całe wolne miejsce rzędu obok przycisku.
      name: "give the record rail's select its growth back: it eats every pixel the Link client button leaves",
      expectRedContains: ["C5-03"],
      file: "packages/desktop-ui/src/record/project-record.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.railSelect {
  flex: 0 1 auto;`,
          `.railSelect {
  flex: 1 1 8rem;`,
          "the record rail's select growth",
        ),
    },
    {
      // ZŁAMANIE CZTERNASTE — PASMO WRACA DO KOLUMNY CZYTANIA (D1-01b).
      //
      // ODTWARZA STAN SPRZED LOTU D1 CO DO ZNAKU: sufit `--surface-measure`
      // z powrotem na paśmie, automatyczne marginesy zamiast ujemnej rynny
      // i zero wyściółki. To jest dokładnie ten kształt, który rejestr Fazy 4
      // zmierzył jako JEDNĄ kreskę wciętą o 40 CSS z obu stron zamiast dwóch
      // ciągnących się od krawędzi do krawędzi.
      //
      // KRESKA ZOSTAJE NIETKNIĘTA, i to jest treść tego złamania: pasmo dalej
      // ma własną dolną krawędź, więc para czytająca samą kreskę (D1-01a) jest
      // przy tym złamaniu ZIELONA. Czerwień musi przyjść z pary czytającej
      // sufit — inaczej „pasmo na całą szerokość" nie byłoby zmierzone przez
      // nic i pierwszy lot, który je z powrotem wsunie, przeszedłby cicho.
      name: "put the title band back inside the reading column: the hairline stops at the measure instead of the canvas edge",
      expectRedContains: ["D1-01b"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.surface-header {
  min-height: var(--header-band-height);
  margin: calc(-1 * var(--surface-band-lift, 0px))
    calc(-1 * var(--surface-gutter, 0px)) var(--space-6);
  padding-inline: var(--surface-gutter, 0px);`,
          `.surface-header {
  min-height: var(--header-band-height);
  max-width: var(--surface-measure, 58rem);
  margin: 0 auto var(--space-6);
  padding-inline: 0;`,
          "the title band's span",
        ),
    },
    {
      // ZŁAMANIE PIĘTNASTE — PASEK WIDOKU TRACI WŁOSKOWĄ KRESKĘ (D1-02a).
      //
      // OSOBNE ZŁAMANIE OD CZTERNASTEGO, bo to są dwa różne zdania o dwóch
      // różnych elementach: tamto psuje SZEROKOŚĆ pasma tytułu, to psuje
      // KRAWĘDŹ pasma pod nim. Wpis #9 rejestru mówi o obu naraz („paski nad
      // tablicą bez włoskowych kresek i bez wysokości pasma"), a jedno złamanie
      // na dwa zdania zostawiłoby jedno z nich bez dowodu.
      name: "take the hairline off the view bar: the row under the title band stops being a band",
      expectRedContains: ["D1-02a"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.view-band {
  min-height: var(--header-band-height);
  margin-inline: calc(-1 * var(--surface-gutter, 0px));
  padding-inline: var(--surface-gutter, 0px);
  border-bottom: 1px solid var(--border-subtle);`,
          `.view-band {
  min-height: var(--header-band-height);
  margin-inline: calc(-1 * var(--surface-gutter, 0px));
  padding-inline: var(--surface-gutter, 0px);`,
          "the view band's hairline",
        ),
    },
    {
      // ZŁAMANIE SZESNASTE — AKCJA GŁÓWNA ROŚNIE Z POWROTEM DO 2,25 REM (D1-04).
      //
      // Wpis #10 rejestru zmierzył tę wadę na zrzutach — „app 66 px urządzenia
      // = 33 CSS, prototyp 56 px = 28 CSS" — a NIE MIERZYŁ jej dotąd żaden
      // przyrząd tej fali: spis B2 czyta POŁOŻENIE akcji w paśmie i nie ma
      // zdania o jej rozmiarze, a spis B1 czyta jej FARBĘ. Złamanie jest więc
      // testem świeżej pary, nie starej.
      name: "grow the primary action back to 2.25rem: the band's action is a third taller than the reference's button",
      expectRedContains: ["D1-04"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.primary-button,
.secondary-button {
  min-height: 1.75rem;`,
          `.primary-button,
.secondary-button {
  min-height: 2.25rem;`,
          "the action height",
        ),
    },
    {
      // ZŁAMANIE SIEDEMNASTE — DOWÓD, ŻE SPIS PASMA TYTUŁU JEST NAPRAWDĘ
      // UZBROJONY, a nie tylko tak o sobie pisze.
      //
      // DLACZEGO NIE „ZDEJMIJ AKCJĘ ZE SPOTKAŃ": takie złamanie pada RÓWNIEŻ
      // przy `pending`, bo pomiar rozjeżdża się wtedy z kolumną `today`
      // (`titleBandVerdictThrows({ predicted: false })` jest prawdziwe w obu
      // trybach). Zaobserwowane na żywo w tym locie, zanim przyrząd został
      // uzbrojony — więc jako dowód UZBROJENIA byłoby bezwartościowe.
      //
      // TO ZŁAMANIE PADA WYŁĄCZNIE UZBROJONE: przestawia kolumnę PROTOTYPU
      // Spotkań na `ABOVE_BAND`, czyli mówi „prototyp stawia tę akcję rząd
      // wyżej". Pomiar dalej zgadza się z kolumną `today` (`predicted: true`),
      // więc jedyne, co zostaje, to ROZJAZD Z PROTOTYPEM — a rozjazd kładzie
      // przebieg tylko wtedy, gdy pozycja jest `enforced`.
      name: "declare that the prototype puts the Meetings action a row higher: an armed census fails on a divergence a pending one would only report",
      expectRedContains: ["meetings"],
      file: "scripts/title-band-action.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `    id: "meetings",
    prototype: "action",
    prototypeRow: "IN_BAND",`,
          `    id: "meetings",
    prototype: "action",
    prototypeRow: "ABOVE_BAND",`,
          "the Meetings prototype row",
        ),
    },
    {
      // ZŁAMANIE OSIEMNASTE — AKCJA PASMA SPOTKAŃ TRACI GLIF (D1-05).
      //
      // ODTWARZA WADĘ NAPRAWDĘ WYDANĄ NA TEJ GAŁĘZI, a nie wyobrażoną: lot D1
      // przeniósł z prototypu etykietę i modyfikator, a `icon: "arrow"` pominął.
      // Poniżej 50 rem okna arkusz gasi etykietę akcji pasma i zostawia glif,
      // więc przycisk bez `svg` był w tym trybie PUSTYM pudełkiem — i wszystkie
      // przyrządy naraz wracały zielone, bo bramka układu mierzy PRZEPEŁNIENIE,
      // spis B2 POŁOŻENIE, a spis B1 FARBĘ.
      //
      // CZERWIEŃ JEST AWARIĄ PRZYRZĄDU, NIE ROZJAZDEM LICZBY, i to jest jedyna
      // rzecz, o której trzeba tu wiedzieć: selektor bez dopasowania wraca jako
      // `NOT_MEASURED`, a `NOT_MEASURED` na parze `enforced` kładzie przelot.
      name: "take the glyph off the Meetings band action: below 50rem the band draws an empty box",
      expectRedContains: ["D1-05"],
      file: "packages/desktop-ui/src/MeetingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `      <Icon name="arrow" />
`,
          "",
          "the Meetings band glyph",
        ),
    },
    {
      // ZŁAMANIE DZIEWIĘTNASTE — NAGŁÓWEK SEKCJI DZISIAJ ZNOWU KRZYCZY GŁOŚNIEJ
      // NIŻ TYTUŁ EKRANU NAD NIM (D2-01a).
      //
      // Odtwarza wpis #2 rejestru dokładnie tak, jak stał: 16 px zamiast 13.
      // Do tego lotu nie mierzył go NIC — `heading-typography.mjs` pyta, czy
      // reguła DEKLARUJE stopień i wagę, i była zielona na obu wartościach,
      // bo obie są zadeklarowane.
      name: "make the Today section heading bigger than the screen title again",
      expectRedContains: ["D2-01a"],
      file: "packages/desktop-ui/src/today.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: -0.005em;`,
          `  font-size: var(--text-md);
  font-weight: 600;
  letter-spacing: -0.005em;`,
          "the Today section heading size",
        ),
    },
    {
      // ZŁAMANIE DWUDZIESTE — POMOC WRACA DO ROZMIARU KONTROLKI (D2-03a).
      //
      // Wpis #4 mówi o KSZTAŁCIE afordancji, nie o jej istnieniu, więc
      // złamaniem nie jest skasowanie przycisku — to złapałby każdy licznik.
      // Rozdmuchanie znacznika do wysokości akcji jest tą samą wadą, którą
      // rejestr zmierzył: obiekt szerszy od etykiety, przy której stoi.
      name: "blow the help mark up to control size: the footnote becomes wider than the label it annotates",
      expectRedContains: ["D2-03a"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.help-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.125rem;
  height: 1.125rem;`,
          `.help-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 1.125rem;`,
          "the help mark's width",
        ),
    },
    {
      // ZŁAMANIE DWUDZIESTE PIERWSZE — ZAKŁADKA ZNOWU ROŚNIE NA CAŁE PASMO
      // (D2-04a).
      //
      // Odtwarza wpis #5 co do deklaracji: `flex: 1 1 10rem` przy podłodze
      // 7 rem. Rejestr zmierzył skutek na zrzutach, na których OBA produkty
      // rysują jedną zakładkę — 205 px CSS wobec 55 — a żaden przyrząd tej
      // fali nie miał o tym zdania.
      name: "let the shell tab grow into the strip again: one tab fills the whole band",
      expectRedContains: ["D2-04a"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  align-items: center;
  flex: 0 1 auto;`,
          `  align-items: center;
  flex: 1 1 10rem;`,
          "the shell tab's flex",
        ),
    },
    {
      // ZŁAMANIE DWUDZIESTE DRUGIE — PISMO WRACA DO GRUBSZEJ KRESKI (D2-05).
      //
      // Wpis #12 stoi na pomiarze TUSZU, którego nie widzi żaden inny przyrząd
      // w tym repozytorium: o 24% więcej pikseli >120 przy identycznej
      // szerokości napisu. Grep za `font-smoothing` dawał do tego lotu ZERO
      // trafień w całym `packages/desktop-ui/src`, więc stan sprzed lotu jest
      // dokładnie tym, co to złamanie odtwarza.
      name: "drop font smoothing: the same type draws a quarter heavier than the reference",
      expectRedContains: ["D2-05"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;`,
          `  -moz-osx-font-smoothing: grayscale;`,
          "the body font smoothing",
        ),
    },
    {
      // ZŁAMANIE DWUDZIESTE TRZECIE — DASZEK MODUŁU WRACA NA KONIEC WIERSZA
      // (D2-06).
      //
      // Wpisy #13 i #54. Złamaniem jest PRZENIESIENIE, nie skasowanie:
      // skasowany daszek byłby czerwony także dla pary, która pyta wyłącznie
      // „czy w ogóle jest", a rejestr skarży się na POŁOŻENIE. Po tej edycji
      // znak dalej istnieje, dalej się rysuje i dalej działa — stoi tylko przy
      // prawej krawędzi paska, oddzielony od napisu całą szerokością kolumny.
      name: "send the module chevron back to the far edge: it still draws, just nowhere near its label",
      expectRedContains: ["D2-06"],
      file: "packages/desktop-ui/src/RealApp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `                        <span
                          className="nav-group-chevron"
                          aria-hidden="true"
                        />
                        <span>{group}</span>
                        {activeGroupItem !== undefined && !expanded && (
                          <small>{activeGroupItem.label}</small>
                        )}`,
          `                        <span>{group}</span>
                        {activeGroupItem !== undefined && !expanded && (
                          <small>{activeGroupItem.label}</small>
                        )}
                        <span
                          className="nav-group-chevron"
                          aria-hidden="true"
                        />`,
          "the module chevron's place in the row",
        ),
    },
    {
      // ZŁAMANIE DWUDZIESTE CZWARTE — ORGANIZACJE ZNOWU NOSZĄ ZNAK LUDZI
      // (D2-07c).
      //
      // Wpis #24, zmierzony przez rejestr na powiększeniu 3×: `relationships`
      // i `people` różni kreska łącznika, której przy 16 px nie widać, a obie
      // pozycje stoją w tej samej grupie CRM. Glif `relationships` ZOSTAJE
      // w zestawie i po tej edycji dalej się rysuje — złamana jest sama
      // PRZYPISANIE, czyli dokładnie to, co było wadą.
      name: "point Organizations back at the relationships glyph: two rows of the CRM group carry one drawing",
      expectRedContains: ["D2-07c"],
      file: "packages/desktop-preload/src/surface-registry.ts",
      edit: (text) =>
        replaceOnce(
          text,
          `    label: "Organizations",
    icon: "organization",`,
          `    label: "Organizations",
    icon: "relationships",`,
          "the Organizations icon",
        ),
    },
    {
      // ZŁAMANIE DWUDZIESTE PIĄTE — LICZNIKI CRM ZNIKAJĄ Z NAWIGACJI (D2-08).
      //
      // Wpisy #50 i #66. TO ZŁAMANIE WYBRAŁO LICZBĘ W PARZE: pierwsza wersja
      // D2-08 miała podłogę 3 i po tej edycji wracała ZIELONA, bo Zadania,
      // Projekty i Biblioteka zostają. Podłoga poszła więc na 6 — czyli para
      // pada na utracie KTÓREGOKOLWIEK z dwóch odczytów, na których ten lot
      // stoi, a nie dopiero na utracie wszystkich.
      name: "take the CRM counts off the navigation: four rows go back to an empty right edge",
      expectRedContains: ["D2-08"],
      file: "packages/desktop-ui/src/RealApp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `          pipeline: countLiveRecords(strategicRecords, "opportunity"),
          organizations: countLiveRecords(strategicRecords, "organization"),
          people: countLiveRecords(strategicRecords, "person"),
          renewals: countLiveRecords(strategicRecords, "renewal"),
`,
          "",
          "the CRM navigation counts",
        ),
    },
    {
      // ZŁAMANIE DWUDZIESTE SZÓSTE — LICZNIK SEKCJI ZNOWU JEST TAK DUŻY, JAK
      // NAGŁÓWEK, KTÓREGO JEST DOPISKIEM (D2-01c).
      //
      // TO NIE JEST WADA WYOBRAŻONA: dokładnie ten stan pojechał w locie D2
      // i wyszedł na jaw dopiero przy przeglądzie. Lot zdjął stopień
      // NAGŁÓWKOWI (`--text-md` → `--text-sm`) i zostawił licznik na
      // `--text-sm`, więc stopień między nimi zniknął, a para na sam nagłówek
      // (D2-01a) była nad tym ZIELONA — bo nagłówek ma dokładnie tę wartość,
      // której się od niego chce. Złamanie przywraca tamten dzień.
      name: "put the section count back at heading size: the footnote stops being a footnote",
      expectRedContains: ["D2-01c"],
      file: "packages/desktop-ui/src/today.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.count {
  color: var(--text-quaternary);
  font-size: var(--text-xs);`,
          `.count {
  color: var(--text-quaternary);
  font-size: var(--text-sm);`,
          "the Today section count size",
        ),
    },
    {
      // ZŁAMANIE DWUDZIESTE ÓSME — LICZNIK ZOSTAJE MAŁY, ALE WRACA DO WAGI
      // TEKSTU CIĄGŁEGO (D2-01d).
      //
      // Osobne złamanie, bo osobna para, bo osobna psucha: D2-01c czyta STOPIEŃ
      // i po tej edycji jest ZIELONA — licznik dalej ma 12 px. Prototyp daje mu
      // wagę 500 (`v3/screens/today.css:47`), czyli o stopień więcej niż tekst
      // ciągły, żeby dopisek dało się odczytać przy mniejszym piśmie.
      name: "drop the section count back to body weight: the smaller type stops being legible as a label",
      expectRedContains: ["D2-01d"],
      file: "packages/desktop-ui/src/today.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  font-variant-numeric: tabular-nums;
  font-weight: 500;
}`,
          `  font-variant-numeric: tabular-nums;
  font-weight: 400;
}`,
          "the Today section count weight",
        ),
    },
    {
      // ZŁAMANIE DWUDZIESTE SIÓDME — WIERSZ POJEMNOŚCI ZNOWU PRZESUWA SIĘ
      // PRZY KAŻDYM PRZELICZENIU DNIA (D2-02d).
      //
      // Para czyta `fontVariantNumeric`, a przed nią nie robiła tego ŻADNA para
      // w tym pliku — więc to złamanie jest też jedynym dowodem, że przelot tę
      // własność w ogóle widzi. Zielone złamanie znaczyłoby tu „para mierzy
      // własną obecność", a nie „kod jest dobry".
      name: "take the tabular numerals off the capacity line: the only all-number row on the surface goes proportional again",
      expectRedContains: ["D2-02d"],
      file: "packages/desktop-ui/src/today.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  font-variant-numeric: tabular-nums;
}

/* Prototyp wyróżnia wolny czas WAGĄ i KOLOREM`,
          `}

/* Prototyp wyróżnia wolny czas WAGĄ i KOLOREM`,
          "the capacity line's tabular numerals",
        ),
    },
    {
      // ZŁAMANIE DWUDZIESTE DZIEWIĄTE — WIERSZ ŹRÓDŁA WRACA DO BYCIA WSUNIĘTĄ
      // KARTĄ (D3-05a, wpis #41 rejestru).
      //
      // Sam promień wystarcza jako złamanie, bo to on jest w tym wpisie
      // czynnikiem odróżniającym „wiersz" od „karty": kreska włoskowa zostaje,
      // a mimo to lista przestaje być listą. Gdyby para czytała wyłącznie
      // kreskę, ta edycja wróciłaby ZIELONA — i dlatego są dwie pary, a nie
      // jedna.
      name: "give the source row its card corner back: the list stops being a column of rows and becomes a stack of inset cards",
      expectRedContains: ["D3-05a"],
      file: "packages/desktop-ui/src/library/sources.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  padding: 0.5625rem var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
  border-left: 2px solid transparent;`,
          `  padding: 0.5625rem var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  border-left: 2px solid transparent;`,
          "the source row's corner",
        ),
    },
    {
      // ZŁAMANIE TRZYDZIESTE — TREŚĆ NOTATKI ZNOWU UNOSI SIĘ NAD PŁASZCZYZNĄ
      // CZYTANIA (D3-10a, wpis #38 rejestru).
      //
      // Cień jest tu jedynym kanałem, który odróżnia „karta" od „obszar
      // z obwódką", i jedynym, którego nie widzi ani spis farby (czyta TŁO),
      // ani bramka układu (czyta PRZEPEŁNIENIE). Bez tego złamania para
      // D3-10a jest nieodróżnialna od pary mierzącej własną obecność.
      name: "float the note body back over the reading plane: the third surface returns where the reference has one",
      expectRedContains: ["D3-10a"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  background: none;
  box-shadow: none;
  font-size: var(--text-sm);
  line-height: var(--leading-normal);`,
          `  background: none;
  box-shadow: var(--elevation-rest);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);`,
          "the Library canvas elevation",
        ),
    },
    {
      // ZŁAMANIE TRZYDZIESTE PIERWSZE — GŁOWA GRUPY NOTATEK ODZYSKUJE MARGINES
      // PRZEGLĄDARKI (D3-02, druga połowa wpisu #34).
      //
      // To jedyne złamanie z tej trójki, które nie zmienia ŻADNEJ deklarowanej
      // wartości, tylko ją USUWA — a usunięta deklaracja to dokładnie ta
      // postać wady, która przeżyła tu dwie fale: `<h3>` bez resetu bierze
      // `1em` marginesu w każdą stronę, więc lista rozjeżdża się o 11 px na
      // grupę i nikt nie widzi w arkuszu reguły, którą można by o to obwinić.
      name: "let the notes group head take the browser's heading margin back: every group drifts 11 px down again",
      expectRedContains: ["D3-02"],
      file: "packages/desktop-ui/src/library/notes.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  min-width: 0;
  margin: 0;
  padding: var(--space-2) var(--space-4);`,
          `  min-width: 0;
  padding: var(--space-2) var(--space-4);`,
          "the notes group head margin",
        ),
    },
    {
      // ZŁAMANIE TRZYDZIESTE DRUGIE — DATA ŹRÓDŁA TRACI SWÓJ ELEMENT (D3-06,
      // wpis #45 rejestru).
      //
      // Edycja jest w TSX, nie w arkuszu, i to jest jej sens: pas daty nie jest
      // regułą CSS, tylko istnieniem elementu, który tę regułę może przyjąć.
      // Wiersz dalej DRUKUJE datę — zmienia się wyłącznie to, czy ma ona własne
      // pudełko. Para licząca elementy pada, para czytająca styl nie miałaby
      // czego czytać.
      name: "put the source's date back into the shared meta lane: it stops being an element and stops having a lane",
      expectRedContains: ["D3-06"],
      file: "packages/desktop-ui/src/library/SourcesReading.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `        <time className={styles.rowWhen} dateTime={source.observedAt}>
          observed {observationDay(source)}
        </time>`,
          `        <span>observed {observationDay(source)}</span>`,
          "the source row's date element",
        ),
    },
    {
      // ZŁAMANIE TRZYDZIESTE TRZECIE — GŁOWA GRUPY ŹRÓDEŁ ZOSTAJE NA STAREJ
      // WYŚCIÓŁCE, KIEDY WIERSZ POD NIĄ DOSZEDŁ DO KRAWĘDZI (D3-04c, druga
      // połowa wpisu #41).
      //
      // TO JEST WADA NAPRAWDĘ WYDANA NA TEJ GAŁĘZI, nie wyobrażona: lot D3
      // przeniósł `.row` z `var(--space-3)` na `var(--space-4)` i zostawił
      // `.groupHead` na starej liczbie, przez co rozjazd lewych krawędzi tekstu
      // urósł z 2 px do 6 px — a bramka wróciła ZIELONA, bo żadna para tej
      // wyściółki nie czytała. Złamanie odtwarza dokładnie ten stan.
      //
      // Czemu akurat `paddingLeft`, skoro reguła zmienia obie osie poziome:
      // lewa krawędź jest tą, wzdłuż której czytelnik zjeżdża wzrokiem po
      // liście, i to ją prototyp zrównuje jedną parą reguł
      // (`v3/screens/knowledge.css:198` i `:139`).
      name: "leave the sources group head a step inside the rows below it: the column gets two left edges",
      expectRedContains: ["D3-04c"],
      file: "packages/desktop-ui/src/library/sources.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  padding: var(--space-2) var(--space-4);
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-sunken);`,
          `  padding: var(--space-2) var(--space-3);
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-sunken);`,
          "the sources group head padding",
        ),
    },
    {
      // ZŁAMANIE TRZYDZIESTE CZWARTE — DOKUMENT PROJEKTU WRACA OBOK SIATKI
      // (D4-01a, wpis #47 rejestru, BLOKUJĄCY).
      //
      // Odtwarza dokładnie stan sprzed lotu: `{body}` renderowany jako
      // RODZEŃSTWO dwukolumnowej siatki, a nie w kolumnie tekstu. Zmierzone
      // przed poprawką przy 1440 px: karta biegła przez całą szerokość siatki
      // (prawa krawędź 1376 px wobec kolumny kończącej się na 1072), więc
      // przechodziła pod pasem powiązań, a włoskowa krawędź pasa urywała się
      // na jej górnym rogu (obie liczby y=667,6).
      //
      // Para liczy ZAWIERANIE, nie geometrię, i dlatego to złamanie ją zapala:
      // po tej edycji `.project-rich-body` przestaje być potomkiem kolumny.
      name: "render the project document beside the two-column body again: the card leaves the reading column and crosses under the rail",
      expectRedContains: ["D4-01a"],
      file: "packages/desktop-ui/src/record/ProjectRecordScreen.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `          <ProjectRecordOverview
            body={body}`,
          `          <ProjectRecordOverview`,
          "the project document's place in the Overview",
        ),
    },
    {
      // ZŁAMANIE TRZYDZIESTE PIĄTE — KRAWĘDŹ PASA ZNOWU KOŃCZY SIĘ NA TREŚCI
      // (D4-01b, druga połowa wpisu #47).
      //
      // OSOBNE ZŁAMANIE OD POPRZEDNIEGO, BO TO OSOBNA POŁOWA WADY I OSOBNA
      // REGUŁA. Karta może siedzieć w kolumnie tekstu, a pas i tak urywać się
      // w połowie dokumentu — dokładnie to zmierzono w trakcie lotu, po samym
      // przeniesieniu węzła: kolumna 422,6..1193,1 px, pas 422,6..667,6, czyli
      // 525,5 px krawędzi brakowało. Bez tego złamania para D4-01b byłaby
      // asercją, o której nikt nie wie, czy umie paść.
      name: "let the rail box stop at its own content again: the column edge ends 525 px above the body's floor",
      expectRedContains: ["D4-01b"],
      file: "packages/desktop-ui/src/record/project-record.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  align-self: stretch;
  gap: var(--space-5);`,
          `  gap: var(--space-5);`,
          "the rail's stretch",
        ),
    },
    {
      // ZŁAMANIE TRZYDZIESTE SZÓSTE — ZNACZNIK AUTORA-CZŁOWIEKA ZNOWU BEZ
      // OBWÓDKI (D4-05, wpis #59).
      //
      // Kasuje obwódkę z reguły BAZOWEJ i zostawia ją wariantowi agenta — czyli
      // odtwarza stan, w którym jeden wątek niósł dwa języki oznaczania autora.
      // Wariant agenta zostaje nietknięty CELOWO: gdyby złamanie zdejmowało
      // obwódkę obu, nie dowodziłoby, że para patrzy na znacznik człowieka.
      name: "take the border off the base author mark: the human's initials read as loose text beside the agent's ring",
      expectRedContains: ["D4-05"],
      file: "packages/desktop-ui/src/record/record-comments.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  background: var(--surface-raised);
  color: var(--text-secondary);`,
          `  border-radius: var(--radius-full);
  background: var(--surface-sunken);
  color: var(--text-secondary);`,
          "the base author mark's edge",
        ),
    },
    {
      // ZŁAMANIE TRZYDZIESTE SIÓDME — PLAKIETKA ROLI AGENTA TRACI KSZTAŁT
      // (D4-04, wpis #56).
      //
      // Celuje w STYL krawędzi, nie w kolor, i to jest cała różnica: akcent ma
      // być podwojony przerywaną krawędzią, więc para czytająca sam kolor
      // stałaby zielona nad pigułką z krawędzią ciągłą.
      name: "make the agent's role pill solid-edged again: the accent stops being doubled by anything but hue",
      expectRedContains: ["D4-04"],
      file: "packages/desktop-ui/src/record/record-comments.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  border: 1px dashed var(--accent-edge);
  border-radius: var(--radius-full);
  color: var(--accent);`,
          `  border: 1px solid var(--accent-edge);
  border-radius: var(--radius-full);
  color: var(--accent);`,
          "the agent role pill's dashed edge",
        ),
    },
    {
      // ZŁAMANIE TRZYDZIESTE ÓSME — PRZYCISK WYSYŁKI WYCHODZI Z RAMKI POLA
      // (D4-06a, wpis #58).
      //
      // Edycja jest w TSX, bo „wewnątrz ramki" jest faktem o DRZEWIE, nie
      // o arkuszu. Wiersz wysyłki wraca pod oprawę — czyli tam, gdzie stał
      // przed lotem, dwa wiersze pod polem, do którego należy.
      name: "stop the composer's frame from being a frame: every send control is outside one again",
      expectRedContains: ["D4-06a"],
      file: "packages/desktop-ui/src/record/RecordCommentsPanel.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `          <div className={styles.composerField}>`,
          `          <div className={styles.composerMain}>`,
          "the composer frame's own class",
        ),
    },
  ]),
});

for (const result of outcome.results)
  console.log(`${result.verdict.toUpperCase()}  ${result.name}`);
for (const result of outcome.failed) console.error(`FAILED: ${result.name}`);
if (!outcome.ok) process.exitCode = 1;
