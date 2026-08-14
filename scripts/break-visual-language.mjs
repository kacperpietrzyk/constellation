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
 * WERYFIKACJA ARKUSZOWA, nie przeglądarkowa.
 *
 * Domyślnym `verify` tego harnessu jest bramka układu — ona chodzi po ŻYWEJ
 * aplikacji i o treści arkuszy ani o zawartość list w skryptach bramek nie ma
 * ŻADNEGO zdania. Złamanie celujące w `consumer-contrast.test.mjs` puszczone
 * przez domyślny `verify` wróciłoby więc ZIELONE, a harness zgłosiłby to jako
 * defekt przyrządu — poprawnie, tylko że defektem byłby wtedy dobór bramki,
 * nie kod. Dlatego złamania lotu D8 mierzone w arkuszu podają swoją bramkę
 * wprost. `entry.verify` obsługuje `break-test.mjs` zarówno przy złamaniu, jak
 * i przy przywróceniu, więc obie strony pętli patrzą na ten sam przyrząd.
 */
const CONTRAST_VERIFY = {
  command: "node",
  args: ["--test", "scripts/consumer-contrast.test.mjs"],
};

/**
 * Cofnięcie wypełnienia akcji głównej do płaskiego tokenu.
 *
 * JEDNA EDYCJA, DWA ZŁAMANIA, i to jest treść, a nie oszczędność: ta sama
 * regresja jest pytana raz w żywej przeglądarce (świadek spisu kontrolek) i raz
 * w arkuszu (zamknięta tabela gradientów). Dwie kopie tego samego napisu
 * rozjechałyby się przy pierwszej zmianie formatowania i jedno ze złamań
 * zamieniłoby się w no-op — a `replaceOnce` zgłasza to dopiero, gdy napis
 * zniknie CAŁKIEM, nie gdy zniknie z jednej z dwóch kopii.
 */
const revertPrimaryFill = (text) =>
  replaceOnce(
    text,
    `  background: linear-gradient(
    180deg,
    var(--a-400),
    var(--a-500) 55%,
    var(--a-600)
  );
  box-shadow: var(--action-primary-shadow);`,
    `  background: var(--action-primary-bg);
  box-shadow: var(--action-primary-shadow);`,
    "the primary action's gradient fill",
  );

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
          // IGŁA PRZEPISANA 2026-08-12 (lot D7) — BYŁA MARTWA OD DAWNA I NIE
          // ZŁAMAŁ JEJ TEN LOT. Reguła `.surface-header` straciła
          // `max-width` i zmieniła margines w jednym z lotów Fazy C/D,
          // a `replaceOnce` RZUCA na nietrafionej igle, więc CAŁY ten
          // harness padał na tym złamaniu i nie dojeżdżał do następnych.
          // Sprawdzone przeciwko `git show HEAD:…` na czubku `b5130cf`:
          // stary napis nie występował tam ani razu. Intencja złamania się
          // nie zmienia — `display: flex` → `display: block` — zmienia się
          // wyłącznie kotwica.
          `.surface-header {
  min-height: var(--header-band-height);
  margin: calc(-1 * var(--surface-band-lift, 0px))
    calc(-1 * var(--surface-gutter, 0px)) var(--space-6);
  padding-inline: var(--surface-gutter, 0px);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;`,
          `.surface-header {
  min-height: var(--header-band-height);
  margin: calc(-1 * var(--surface-band-lift, 0px))
    calc(-1 * var(--surface-gutter, 0px)) var(--space-6);
  padding-inline: var(--surface-gutter, 0px);
  border-bottom: 1px solid var(--border-subtle);
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
          // ŹRÓDŁO PRZEPISANE W LOCIE D8 razem z samą regułą. Ta łatka OSADZA
          // literalny blok spoczynkowy `.primary-button`, a lot D8 zmienił w nim
          // linię wypełnienia — bez tej aktualizacji `replaceOnce` przestałoby
          // cokolwiek podmieniać, a złamanie raportowałoby ZIELEŃ na niewykonanej
          // edycji. Łamany jest dalej sam `box-shadow`, nie wypełnienie.
          `.primary-button {
  color: var(--action-primary-text);
  background: linear-gradient(
    180deg,
    var(--a-400),
    var(--a-500) 55%,
    var(--a-600)
  );
  box-shadow: var(--action-primary-shadow);
}`,
          `.primary-button {
  color: var(--action-primary-text);
  background: linear-gradient(
    180deg,
    var(--a-400),
    var(--a-500) 55%,
    var(--a-600)
  );
  box-shadow:
    inset 0 1px 0 oklch(100% 0 0 / 0.24),
    0 1px 2px oklch(0% 0 0 / 0.28),
    0 0 0 1px var(--accent-edge);
}`,
          "the primary action's shadow role",
        ),
    },
    {
      // ZŁAMANIE LOTU D8 (a1) — COFNIĘCIE WYPEŁNIENIA AKCJI GŁÓWNEJ DO PŁASKIEGO
      // TOKENU, SPRAWDZONE W ŻYWEJ PRZEGLĄDARCE. To jest złamanie DOWODZĄCE
      // POZYCJI #1 REJESTRU, a nie jej braku: płaskie `--action-primary-bg`
      // (= `--a-600`) zdaje kontrast 5,19:1, więc bramka kontrastu na samym
      // progu wróciłaby ZIELONA i „usunięcie gradientu" byłoby zmianą, której
      // nie widzi żaden przyrząd. Widzi ją świadek spisu kontrolek: klasyfikator
      // zwraca `PAINTED_IMAGE` tylko dla kontrolki z OBRAZEM tła, a spis
      // deklaruje od lotu D8, że akcja główna nim jest.
      name: "revert the primary action's fill to the flat token, measured in the browser: the reference's gradient leaves the one control it is drawn on",
      expectRedContains: [
        "CONTROL_PAINT_WITNESS_FLAGGED",
        ".primary-button is declared legal as PAINTED_IMAGE",
      ],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) => revertPrimaryFill(text),
    },
    {
      // ZŁAMANIE LOTU D8 (a2) — TA SAMA EDYCJA, DRUGI PRZYRZĄD. Świadek wyżej
      // mówi „kontrolka nosi jakiś obraz"; ON NIE WIE, JAKI. Zamknięta tabela
      // „gradient → liczba stopni" w `consumer-contrast.test.mjs` wie: wpis
      // akcji głównej znika z listy ROZŁOŻONYCH, więc trzy stopnie przestają
      // być mierzone. Bez tego drugiego złamania podmiana gradientu na
      // JAKIKOLWIEK inny obraz tła przeszłaby przez świadka na zielono.
      //
      // WŁASNY `verify`, bo domyślnym jest bramka układu, a ta o arkuszach nie
      // ma zdania — bez tego złamanie wróciłoby ZIELONE i harness zgłosiłby
      // przyrząd, nie kod.
      name: "revert the primary action's fill to the flat token, measured in the sheet: three stops leave the closed table of decomposed gradients",
      expectRedContains: [
        "Zbiór ROZŁOŻONYCH gradientów albo liczba ich stopni się zmieniły",
      ],
      verify: CONTRAST_VERIFY,
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) => revertPrimaryFill(text),
    },
    {
      // ZŁAMANIE LOTU D8 (b) — ZWOLNIENIE ROZLEWA SIĘ NA DRUGI PODMIOT.
      // Warunek właściciela mówi o JEDNEJ parze. Bez asercji wąskości dopisanie
      // `.secondary-button` do listy przeszłoby bez śladu i zwolnienie z AA
      // stałoby się workiem. Czerwień ma przyjść z `deepEqual` na zbiorze
      // podmiotów, NIE z kontrastu — `.secondary-button` zdaje próg, więc sam
      // pomiar niczego by nie zauważył.
      name: "let the accent-gradient exemption cover a second control: one owner decision starts forgiving everything",
      expectRedContains: [
        "Zbiór podmiotów zwolnionych z AA na gradiencie akcentu się ZMIENIŁ",
      ],
      verify: CONTRAST_VERIFY,
      file: "scripts/consumer-contrast.test.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `const ACCENT_GRADIENT_EXEMPTIONS = [
  {
    sheet: "styles.css",
    selector: ".primary-button",`,
          `const ACCENT_GRADIENT_EXEMPTIONS = [
  {
    sheet: "styles.css",
    selector: ".secondary-button",
    source: "styles.css",
    forgivenRatios: [],
    passingRatio: 5.19,
    decidedBy: "nikt",
    reason: "rozlanie zwolnienia",
  },
  {
    sheet: "styles.css",
    selector: ".primary-button",`,
          "the narrowness of the accent-gradient exemption",
        ),
    },
    {
      // ZŁAMANIE LOTU D8 (c) — PRZESTROJONY STOPIEŃ CHOWA SIĘ POD ZWOLNIENIEM.
      // Zwolnienie wydane na „2,57 i 3,54" nie może milcząco obejmować 2,60 ani
      // żadnej innej liczby: wtedy przestrojenie `--a-400` byłoby zmianą, której
      // nie widzi ŻADEN przyrząd. Łamana jest LISTA, nie token — bo to liczba
      // w liście jest tu asercją, a token ma prawo się zmienić, o ile się zgłosi.
      name: "retune a forgiven ratio in the accent-gradient exemption: a moved ramp step hides inside a decision made about a different number",
      expectRedContains: ["Stopnie WYBACZONE na .primary-button"],
      verify: CONTRAST_VERIFY,
      file: "scripts/consumer-contrast.test.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          "    forgivenRatios: [2.57, 3.54],",
          "    forgivenRatios: [2.6, 3.54],",
          "the closed set of forgiven ratios",
        ),
    },
    {
      // ZŁAMANIE (d) — DOŁOŻONE PO PRZEGLĄDZIE LOTU D8. Zwolnienie było
      // kluczowane wyłącznie na `sheet|selector`, więc DRUGA reguła o tej samej
      // liście selektorów — a `@media` daje ją za darmo — dostawała wybaczenie
      // z AA, mimo że nie maluje żadnego gradientu. Trzy złamania wyżej tego
      // nie widziały i to nie jest ich wina: (b) i (c) łamią LISTĘ zwolnień,
      // a obie asercje na liczby filtrują wprzód do wierszy Z `gradientKey`,
      // czyli dokładnie omijają wiersz z płaskim wypełnieniem.
      //
      // ŁAMANY JEST ARKUSZ, NIE TEST, i o to chodzi: to jest regresja, którą
      // popełni ktoś piszący CSS, nie ktoś edytujący zwolnienie. Wartości są
      // LITERAŁAMI, a nie tokenami, żeby czerwień nie zależała od tego, czy
      // ktoś kiedyś przestroi rampę: 1,48:1 (zmierzone `contrastRatio` na
      // `oklch(70% 0 0)` nad `oklch(60% 0 0)`) leży pod progiem 4,5:1 z takim
      // zapasem, że żadna zmiana tokenów tego nie uratuje.
      name: "let a second flat-filled .primary-button rule ride the gradient exemption: an @media rule that paints no gradient is forgiven from AA",
      expectRedContains: ["KAŻDY konsument"],
      verify: CONTRAST_VERIFY,
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.primary-button:not(:disabled):hover {`,
          `@media (min-width: 1px) {
  .primary-button {
    color: oklch(70% 0 0);
    background: oklch(60% 0 0);
  }
}

.primary-button:not(:disabled):hover {`,
          "a second flat-filled rule under the exempted selector",
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
      //
      // ┌ PRZEPIĘTE W LOCIE D11, 2026-08-12 ────────────────────────────────┐
      // │ REGUŁA `.actions select` PRZESTAŁA ISTNIEĆ RAZEM ZE SWOIM         │
      // │ PODMIOTEM: pas akcji nie niesie już `<select>`, tylko wyzwalacz    │
      // │ dymka. Złamanie zostawione bez zmian byłoby no-opem, na który      │
      // │ `replaceOnce` rzuca — czyli głośno, ale bezużytecznie.             │
      // │                                                                    │
      // │ NOWE ZŁAMANIE ŁAMIE REGUŁĘ, A NIE KASUJE PODMIOTU (zasada 7).     │
      // │ `.inline-popover-trigger` NADAL deklaruje własne                   │
      // │ `font-size: var(--text-2xs)` i `border-radius: var(--radius-full)`;│
      // │ przegrywa z `.primary-button, .secondary-button` WYŁĄCZNIE         │
      // │ kolejnością w tym samym arkuszu, przy równej swoistości (0,1,0).   │
      // │ Podniesienie jej selektora do dwuklasowego (0,2,0) odwraca tę      │
      // │ kaskadę bez ruszania ani jednej wartości — i wyzwalacz wraca do    │
      // │ metryki pigułki, stojąc w paśmie przycisków. To JEST wada, którą   │
      // │ pary C5-01a/b nazywają.                                            │
      // │                                                                    │
      // │ DLACZEGO NIE ZŁAMAĆ `.secondary-button`: ta reguła jest WSPÓLNA   │
      // │ dla kilkudziesięciu przycisków aplikacji, więc jej czerwień        │
      // │ zaczerwieniłaby pół mapy naraz i nie dałoby się jej przypisać do   │
      // │ tych dwóch par. Wzorzec dwuklasowy istnieje w tym arkuszu obok —   │
      // │ `.inline-popover-trigger.primary-button` — więc złamanie nie       │
      // │ wymyśla mechanizmu, tylko go odwraca.                              │
      // │                                                                    │
      // │ DLACZEGO DOPISANIE REGUŁY, A NIE ZWĘŻENIE ISTNIEJĄCEJ: zwężenie    │
      // │ `.inline-popover-trigger` do dwuklasowego selektora zabrałoby       │
      // │ pigułkę POZOSTAŁYM SIEDMIU konsumentom naraz, a wtedy czerwień      │
      // │ mogłaby przyjść skądkolwiek. Dopisana reguła dotyka DOKŁADNIE tego  │
      // │ jednego wyzwalacza i nie zmienia ani jednej wartości — przenosi     │
      // │ tylko, kto wygrywa.                                                 │
      // └────────────────────────────────────────────────────────────────────┘
      name: "let the popover trigger's chip metrics win the cascade back: the template chooser stands in a strip of buttons wearing a pill's type size and corner",
      expectRedContains: ["C5-01a", "C5-01b"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.inline-popover-trigger {
  background: transparent;`,
          `.inline-popover-trigger.secondary-button {
  font-size: var(--text-2xs);
  border-radius: var(--radius-full);
}

.inline-popover-trigger {
  background: transparent;`,
          "the inline popover trigger's own metric rule",
        ),
    },
    {
      // ZŁAMANIE JEDENASTE — SUFIT SZEROKOŚCI TAM, GDZIE MIESZKA TREŚĆ REKORDU
      // (C5-01c).
      //
      // PODNIESIENIE SUFITU, A NIE JEGO SKASOWANIE, i ta różnica jest treścią.
      // Skasowana deklaracja daje `max-width: none`, a `none` nie jest
      // długością: runner wraca wtedy NOT_MEASURED (`verify-renderer-layout
      // .mjs:3665-3672`), czyli AWARIĄ PRZYRZĄDU, a awaria przyrządu to nie
      // jest werdykt o kodzie. Podwojenie daje czysty DIFFERS — „768px” przy
      // żądanych „384px” — z obiema liczbami wydrukowanymi w wierszu pary.
      //
      // PRZEPIĘTE W LOCIE D11 z `.actions select` na `.inline-popover`: nazwy
      // szablonów przeniosły się z opcji kontrolki wyboru do przycisków panelu,
      // więc sufit, który je ogranicza, jest teraz sufitem panelu. Sam panel
      // rysuje się WYŁĄCZNIE po otwarciu dymka — trasa pary robi to krokiem
      // `openPopover`, dopisanym w tym samym locie.
      name: "raise the popover panel's ceiling to 48rem: the template names may run twice as wide as the sheet declares",
      expectRedContains: ["C5-01c"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          "  max-width: min(24rem, calc(100vw - 1.5rem));",
          "  max-width: min(48rem, calc(100vw - 1.5rem));",
          "the inline popover panel's width ceiling",
        ),
    },
    {
      // ZŁAMANIE DLA PARY LOTU D11 — KONTROLKA FORMULARZA WRACA DO PASMA.
      //
      // DOSTAWIA `<select>` OBOK DYMKA, A NIE ZAMIAST NIEGO, i to jest cała
      // treść tego złamania. Wersja kasująca dymek dowodziłaby NIEOBECNOŚCI
      // (zasada 7) i przewróciłaby przy okazji C5-01a/b, więc czerwieni nie
      // dałoby się przypisać. Tak jak jest, wyzwalacz stoi nietknięty, obie
      // tamte pary zostają zielone co do joty, a czerwona jest DOKŁADNIE ta
      // jedna, która mówi, czego w paśmie stać nie ma.
      //
      // ODTWARZA REGRESJĘ REALNĄ, nie wyobrażoną: „dołóż kontrolkę obok" jest
      // najtańszym ruchem dla kogoś, kto dokłada do tego pasma następną
      // operację — i jest dokładnie tym, co wpis #51 rejestru zakazuje.
      name: "put a form control back into the record's action strip beside the disclosure",
      expectRedContains: ["D11-01"],
      file: "packages/desktop-ui/src/Wave2Surfaces.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `                <Suspense fallback={null}>
                  <ApplyTemplatePopover`,
          `                <Suspense fallback={null}>
                  <select aria-label="Apply template">
                    {appliable.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <ApplyTemplatePopover`,
          "the project record's action slot",
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
      //
      // PRZEPISANE PO PRZEGLĄDZIE LOTU D4 (odzyskane zgłoszenie, MAJOR).
      // Pierwsza wersja tego złamania zdejmowała prop `body` w
      // `ProjectRecordScreen.tsx`, a `{body}` ma w całej aplikacji JEDEN punkt
      // montowania (`ProjectRecordOverview.tsx`, wewnątrz `.doc`). Po tamtej
      // edycji dokument nie rysował się NIGDZIE, więc para szła na zero
      // z powodu NIEOBECNOŚCI karty, a nie z powodu złego rodzica — czyli
      // dokładnie ta wada, którą lot rozpoznał u złamania 38 („złamanie nie
      // odróżnia «ramka jest, a przycisk z niej uciekł» od «ramki nie ma»”)
      // i której u siebie nie zobaczył. Ta wersja PRZENOSI węzeł: karta dalej
      // istnieje i dalej się rysuje, tylko wisi jako dziecko `.overview` obok
      // dwukolumnowej `.body`. Czerwień D4-01a jest wtedy przypisywalna do
      // zawierania, bo jedyne, co się zmieniło, to rodzic.
      name: "render the project document beside the two-column body again: the card leaves the reading column and crosses under the rail",
      expectRedContains: ["D4-01a"],
      file: "packages/desktop-ui/src/record/ProjectRecordOverview.tsx",
      edit: (text) =>
        replaceOnce(
          replaceOnce(
            text,
            `          {/* Dokument projektu zamyka KOLUMNĘ tekstu, a nie ekran. */}
          {body}
        </div>`,
            `        </div>`,
            "the project document's place inside the reading column",
          ),
          `        </aside>
      </div>
    </div>`,
          `        </aside>
      </div>
      {body}
    </div>`,
          "the project document's place beside the two-column body",
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
      // ZŁAMANIE TRZYDZIESTE ÓSME — PRZYCISK WYSYŁKI WYCHODZI Z RAMKI POLA
      // (D4-06a, wpis #58).
      //
      // Edycja jest w TSX, bo „wewnątrz ramki" jest faktem o DRZEWIE, nie
      // o arkuszu — żadna reguła CSS nie umie tego złamać. Oprawa `.composerField`
      // ZOSTAJE i dalej rysuje ramkę; zmienia się wyłącznie to, po której jej
      // stronie stoi wiersz wysyłki. To odróżnia dwie rzeczy, które łatwo
      // pomylić: „ramki nie ma" i „ramka jest, a przycisk z niej uciekł".
      // Druga jest tą, którą rejestr zmierzył na tej gałęzi, i tylko ona
      // dowodzi, że para D4-06a łapie regresję, a nie brak komponentu.
      //
      // DWIE PODMIANY, bo przeniesienie węzła to zamknięcie oprawy WCZEŚNIEJ
      // i skasowanie osieroconego zamknięcia z ogona. Jedna bez drugiej daje
      // niezrównoważony JSX, czyli „BUILD REFUSED" — werdykt, który nie mówi
      // nic o parze.
      name: "move the send row out of the composer frame: the frame stays and the button leaves it",
      expectRedContains: ["D4-06a"],
      file: "packages/desktop-ui/src/record/RecordCommentsPanel.tsx",
      edit: (text) => {
        const closedEarly = replaceOnce(
          text,
          `            <div className={styles.send}>`,
          `          </div>
            <div className={styles.send}>`,
          "the composer frame's closing tag",
        );
        return replaceOnce(
          closedEarly,
          `            </div>
          </div>
        </div>
      </form>`,
          `            </div>
        </div>
      </form>`,
          "the orphaned closing tag left in the form's tail",
        );
      },
    },
    {
      // ZŁAMANIE TRZYDZIESTE DZIEWIĄTE — POWŁOKA PRACY WRACA NAD SPIS SEKCJI
      // (D5-01a, wpis #67).
      //
      // Edycja jest w TSX, bo „Ustawienia są trybem" jest faktem o DRZEWIE:
      // żadna reguła arkusza nie umie tego złamać tak, jak było złamane
      // naprawdę — kontrolka nie była schowana, ona po prostu się rysowała.
      // Warunek jest odwracany na `true`, a nie kasowany, żeby złamanie
      // dotknęło JEDNEJ z dwóch kontrolek: wyszukiwarka zostaje niewidoczna,
      // więc czerwień da się przypisać karcie przestrzeni, a nie „czemuś
      // w tej gałęzi".
      name: "put the workspace card back above the settings sections: the work shell stops being replaced by the mode",
      expectRedContains: ["D5-01a"],
      file: "packages/desktop-ui/src/RealApp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `        {!settingsMode && (
          <>
            <button
              type="button"
              className="workspace-switcher"`,
          `        {true && (
          <>
            <button
              type="button"
              className="workspace-switcher"`,
          "the settings-mode guard around the workspace card",
        ),
    },
    {
      // ZŁAMANIE CZTERDZIESTE — SPIS SEKCJI TRACI GLIFY (D5-02b, wpis #69).
      //
      // Kasowany jest `<Icon>`, a NIE pole `icon` w słowniku kategorii: pole
      // jest typowane `IconName`, więc jego skasowanie nie skompilowałoby się
      // i harness zwróciłby „BUILD REFUSED" — werdykt, który nie mówi nic
      // o parze. Tak złamana pozycja dalej ma etykietę i dalej się rysuje;
      // znika wyłącznie to, co mierzy D5-02b.
      name: "take the glyphs off the settings sections: the list goes back to six lines of bare text",
      expectRedContains: ["D5-02b"],
      file: "packages/desktop-ui/src/RealApp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `                      <Icon name={category.icon} />
                      <span>{category.label}</span>`,
          `                      <span>{category.label}</span>`,
          "the section entry's glyph",
        ),
    },
    {
      // ZŁAMANIE CZTERDZIESTE PIERWSZE — WIERSZ LISTY WRACA DO BYCIA KARTĄ
      // (D5-03b, wpis #68).
      //
      // Wraca sam PROMIEŃ, bez obwódki i bez tła. To rozróżnia dwie rzeczy,
      // które łatwo pomylić: „lista nie ma plastra" (mierzy D5-03a) i „plaster
      // jest, a wiersz w środku dalej rysuje się jak osobna karta". Druga jest
      // tą, którą rejestr opisał, i tylko ona dowodzi, że D5-03b łapie regresję
      // wiersza, a nie brak listy.
      name: "give the status row its card corner back: the plate stays and the rows inside it round off again",
      expectRedContains: ["D5-03b"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  border-bottom: 1px solid var(--border-subtle);
}
.status-list li:last-child {`,
          `  border-bottom: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}
.status-list li:last-child {`,
          "the status row's radius",
        ),
    },
    {
      // ZŁAMANIE CZTERDZIESTE DRUGIE — TRZY SEKCJE WRACAJĄ DO JEDNEJ KARTY
      // (D5-04a, wpis #70).
      //
      // Znika obrys SEKCJI, a nie obrys kategorii: kategoria dalej nie jest
      // kartą, więc złamanie nie odtwarza starego kształtu w całości i nie
      // da się go pomylić z cofnięciem commita. Mierzone jest dokładnie jedno
      // zdanie — „sekcja ma własny obrys".
      name: "take the outline off the settings section: the sections stop being cards and go back to being floors",
      expectRedContains: ["D5-04a"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  padding: 0 0 var(--space-5);
  border: 1px solid var(--panel-reading-border);`,
          `  padding: 0 0 var(--space-5);
  border: 0;`,
          "the settings section's outline",
        ),
    },
    {
      // ZŁAMANIE CZTERDZIESTE TRZECIE — PASEK DODAWANIA WRACA DO WYSOKOŚCI
      // WIERSZA PANELU (D5-05, wpis #71).
      //
      // Kasowana jest WYŚCIÓŁKA, a nie podłoga, i to jest cała treść tego
      // złamania: 44 px brały się z `padding: 0.6rem` reguły panelowej, więc
      // złamanie zdejmujące `min-height` byłoby zielone (kontrolka i tak
      // urosłaby z wyściółki), a złamanie zdejmujące wyściółkę pokazuje, że
      // para czyta WYSOKOŚĆ NARYSOWANĄ, a nie zadeklarowaną liczbę.
      name: "let the panel padding back onto the add bar: the select grows past the field beside it again",
      expectRedContains: ["D5-05"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  min-height: 1.75rem;
  padding: 0 var(--space-2);
}`,
          `  min-height: 1.75rem;
}`,
          "the add bar's own padding",
        ),
    },
    {
      // ZŁAMANIE CZTERDZIESTE CZWARTE — PASMO WYJŚCIA WRACA POD NÓŻ (D5-01d,
      // wpis #67), i jest to złamanie POPRAWKI PO PRZEGLĄDZIE, nie lotu.
      //
      // Zdejmowana jest para deklaracji, która przesuwa krawędź przycięcia
      // nawigacji na prawą krawędź kolumny. Pasmo zostaje nietknięte — dalej ma
      // symetryczny margines ujemny, dalej MIERZY się na pełną szerokość
      // kolumny i dalej ma kreskę we właściwym tokenie, więc D5-01c zostaje
      // zielona. Czerwień może pochodzić wyłącznie z odczytu świadomego
      // przycięcia, i o to w tym złamaniu chodzi.
      name: "take the clip edge back off the settings column: the exit band gets its right gutter shaved off again",
      expectRedContains: ["D5-01d"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  margin-right: calc(-1 * var(--nav-gutter));
  padding-right: var(--nav-gutter);
}
.settings-mode-head {`,
          `}
.settings-mode-head {`,
          "the settings column's right clip edge",
        ),
    },
    {
      // ZŁAMANIE CZTERDZIESTE PIĄTE — BLOK LUDZI WYPADA ZE ZBIORU KART
      // (D5-04c, wpis #70), też złamanie POPRAWKI PO PRZEGLĄDZIE.
      //
      // Wracany jest TAG, i tylko tag: `styles.css` zostaje nietknięty, więc
      // pozostałe dwadzieścia sekcji dalej jest kartami i D5-04a/b zostają
      // zielone — dokładnie tak, jak były zielone nad tą wadą, kiedy istniała
      // naprawdę. Czerwona ma być wyłącznie para licząca dzieci kategorii.
      name: "hand the People block its plain div back: one category child stops being a card and both card pairs stay green",
      expectRedContains: ["D5-04c"],
      file: "packages/desktop-ui/src/settings/AccessSection.tsx",
      edit: (text) =>
        replaceOnce(
          replaceOnce(
            text,
            `    <section className={styles.root}>`,
            `    <div className={styles.root}>`,
            "the Access section's root tag (opening)",
          ),
          `      </section>
    </section>
  );
};`,
          `      </section>
    </div>
  );
};`,
          "the Access section's root tag (closing)",
        ),
    },
    {
      // ZŁAMANIE CZTERDZIESTE SZÓSTE — ZNACZNIK SYGNAŁU WRACA DO ROZMIARU
      // ZNAKU PISMA (D6-01a/D6-02a, wpisy #20 i #30).
      //
      // Nie kasujemy pudełka: zjeżdżamy jego bok z prototypowych 0,8125 rem na
      // 0,4375 rem, czyli do wielkości, jaką miał glif ▲ z kroju czytelnika.
      // Kształt zostaje, więc INTENCJĄ jest, żeby D6-01b (ukośne
      // półwypełnienie) i D6-01c (wypełnienie „At risk") zostały zielone,
      // a czerwona była wyłącznie para czytająca wymiar, i tylko na arkuszu
      // Organizacji, bo bliźniak Ludzi jest osobnym plikiem.
      //
      // CZEGO TEN HARNESS NIE SPRAWDZA: `expectRedContains` pyta, czy nazwana
      // para JEST w zbiorze czerwonych (`break-test.mjs:203-213`) — nie pyta,
      // czy jest w nim SAMA. Wyłączność wyżej jest więc intencją projektu
      // złamania, a nie zmierzonym faktem, i tak samo należy ją czytać przy
      // trzech następnych złamaniach.
      name: "shrink the relationship mark back to the size of a typed glyph: the box stops being letter-height",
      expectRedContains: ["D6-01a"],
      file: "packages/desktop-ui/src/organizations/organizations.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  position: relative;
  width: 0.8125rem;
  height: 0.8125rem;`,
          `  position: relative;
  width: 0.4375rem;
  height: 0.4375rem;`,
          "the drawn relationship mark's box on Organizations",
        ),
    },
    {
      // ZŁAMANIE CZTERDZIESTE SIÓDME — CZTERY KSZTAŁTY ZAPADAJĄ SIĘ W CZTERY
      // KOLORY (D6-01b, wpis #20).
      //
      // TO JEST ZŁAMANIE, DLA KTÓREGO TA PARA POWSTAŁA. Ukośne półwypełnienie
      // „Watch" zamieniamy na PEŁNE wypełnienie tym samym tokenem — czyli na
      // wersję, która wygląda poprawnie na kolorowym ekranie i jest nie do
      // odróżnienia od „At risk" bez koloru. Pudełko, jego wymiar i obwódka
      // zostają, więc D6-01a i D6-01c zostają zielone: czerwień ma przyjść
      // z KSZTAŁTU, nie z obecności znacznika.
      name: "fill the Watch mark solid: four shapes collapse into four colours and nothing else changes",
      expectRedContains: ["D6-01b"],
      file: "packages/desktop-ui/src/organizations/organizations.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  border-color: var(--status-warning);
  background: linear-gradient(
    135deg,
    var(--status-warning) 50%,
    transparent 50%
  );`,
          `  border-color: var(--status-warning);
  background: var(--status-warning);`,
          "the diagonal half-fill of the Watch mark",
        ),
    },
    {
      // ZŁAMANIE CZTERDZIESTE ÓSME — BLIŹNIAK NA LUDZIACH ZOSTAJE Z TYŁU
      // (D6-02a, wpis #30).
      //
      // Ten sam kształt mieszka w DWÓCH arkuszach modułowych i właśnie dlatego
      // ma dwie pary. Złamanie celuje w arkusz Ludzi i nie dotyka Organizacji;
      // intencją jest, żeby D6-01a/b/c zostały zielone — gdyby padły razem
      // z nim, para nad Ludźmi mierzyłaby cudzy plik. Wyłączności ten harness
      // nie sprawdza, patrz uwaga przy złamaniu czterdziestym siódmym.
      name: "shrink the People twin of the mark only: the Organizations pairs stay green over half a fix",
      expectRedContains: ["D6-02a"],
      file: "packages/desktop-ui/src/people/people.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  position: relative;
  width: 0.8125rem;
  height: 0.8125rem;`,
          `  position: relative;
  width: 0.4375rem;
  height: 0.4375rem;`,
          "the drawn relationship mark's box on People",
        ),
    },
    {
      // ZŁAMANIE CZTERDZIESTE DZIEWIĄTE — „PROSPECT" WRACA DO INFORMACJI
      // (D6-03a, wpis #19).
      //
      // Wracany jest SAM TUSZ; laserunek zostaje. To jest ta połowa wady,
      // której druga para (D6-03b, czytająca `--accent-quieter`) nie ma prawa
      // zobaczyć — i o to chodzi: gdyby złamanie tuszu zapaliło obie pary,
      // jedna z nich byłaby zbędna. Że druga NAPRAWDĘ została zielona, ten
      // harness nie mierzy; patrz uwaga przy złamaniu czterdziestym siódmym.
      name: "put the Prospect pill back on the info hue: the accent leaves the word and the tint stays",
      expectRedContains: ["D6-03a"],
      file: "packages/desktop-ui/src/organizations/organizations.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.state_prospect {
  color: var(--accent);`,
          `.state_prospect {
  color: var(--status-info);`,
          "the Prospect pill's ink on Organizations",
        ),
    },
    {
      // ZŁAMANIE PIĘĆDZIESIĄTE — SEGMENTY UKŁADU TRACĄ GLIF (D6-04a, druga
      // połowa wpisu #21).
      //
      // Zdejmowany jest JEDEN z dwóch znaków, nie oba, i to jest cała treść
      // tego złamania: podłoga pary wynosi 2 właśnie dlatego, że prototyp
      // rysuje znak przy OBU segmentach. Złamanie na obu naraz byłoby zielone
      // przy podłodze 1 i nie powiedziałoby nic o wybranym progu.
      //
      // ŁAMANY JEST MONTAŻ, NIE TYP. Pierwsza wersja tego złamania zmieniała
      // trzeci człon krotki na `null` i rozszerzała typ na `IconName | null` —
      // czego `<Icon name={glyph} />` nie kompiluje (TS2322). `npm run build`
      // zaczyna się od `tsc -b`, więc takie złamanie nie dochodzi do drzewa:
      // albo harness rzuca na nieudanym buildzie, albo `dist` zostaje ze
      // starym źródłem i bramka wraca ZIELONA, czyli break-test raportuje
      // porażkę z powodu, który nie jest zachowaniem produktu. Warunek na
      // `id` zostawia typ nietknięty i zdejmuje dokładnie jeden narysowany
      // znak.
      name: "take the glyph off one layout segment: the floor of two is what makes this red",
      expectRedContains: ["D6-04a"],
      file: "packages/desktop-ui/src/StrategicDepthSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `              <Icon name={glyph} />
              {label}`,
          `              {id === "list" ? <Icon name={glyph} /> : null}
              {label}`,
          "the Table segment's glyph mount on Organizations",
        ),
    },
    {
      // ZŁAMANIE PIĘĆDZIESIĄTE PIERWSZE — NAGŁÓWEK GRUPY TRACI BUDYNEK
      // (D6-05a, druga połowa wpisu #26).
      //
      // Kasowany jest sam montaż znaku; reguła `.groupName svg` zostaje
      // w arkuszu. Para liczy ELEMENTY, więc martwa reguła jej nie uratuje —
      // a gdyby liczyła deklarację, ten właśnie układ (reguła jest, znaku nie
      // ma) przeszedłby na zielono.
      name: "drop the building glyph from the group heading: the rule survives and the mark does not",
      expectRedContains: ["D6-05a"],
      file: "packages/desktop-ui/src/people/PeopleSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `        <Icon name="organization" />
        {reading.organization.name}`,
          `        {reading.organization.name}`,
          "the organization glyph in the People group heading",
        ),
    },
    {
      // ZŁAMANIE PIĘĆDZIESIĄTE DRUGIE — SEGMENT UKŁADU DOSTAJE ROZMIAR TREŚCI
      // WIERSZA (D6-04c, druga połowa wpisu #21).
      //
      // To nie jest złamanie wymyślone: to jest DOKŁADNIE stan, w jakim lot D6
      // oddał tę regułę i w jakim przeszła bramka. 0,8125 rem z `v3/app.css:348`
      // (chrom paska widoku) zjeżdża na 0,6875 rem z `v3/screens/crm.css:162`
      // (treść wiersza, plakietka uczestnictwa). Znak ZOSTAJE narysowany, więc
      // D6-04a — para LICZĄCA — ma zostać zielona; czerwień ma przyjść wyłącznie
      // z pary czytającej wymiar. Po to ta para powstała.
      //
      // ANKIETOWANY JEST WIERSZ SELEKTORA, nie sam blok wymiarów: po poprawce
      // `people.module.css` niesie DWIE reguły o identycznych trzech pierwszych
      // deklaracjach (`.switch svg` i `.groupName svg`), a `replaceOnce` pada na
      // wielokrotnym trafieniu. Anchor na selektorze trzyma oba złamania
      // jednoznaczne w obu arkuszach.
      //
      // Wyłączności ten harness nie sprawdza — patrz uwaga przy złamaniu
      // czterdziestym siódmym.
      name: "shrink the layout segment glyph to row-content size: the count pair stays green over the wrong dimension",
      expectRedContains: ["D6-04c"],
      file: "packages/desktop-ui/src/organizations/organizations.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.switch svg {
  width: 0.8125rem;
  height: 0.8125rem;`,
          `.switch svg {
  width: 0.6875rem;
  height: 0.6875rem;`,
          "the layout segment glyph's size on Organizations",
        ),
    },
    {
      // ZŁAMANIE PIĘĆDZIESIĄTE TRZECIE — BLIŹNIAK NA LUDZIACH ZOSTAJE Z TYŁU
      // (D6-04d, połowa wpisu #29 o segmentach).
      //
      // Ta sama reguła mieszka w DWÓCH arkuszach modułowych i dlatego ma dwie
      // pary — tak samo jak znacznik sygnału (złamania czterdzieste szóste
      // i czterdzieste ósme). Złamanie celuje w arkusz Ludzi i nie dotyka
      // Organizacji: intencją jest, żeby D6-04c została zielona, bo inaczej
      // para nad Ludźmi mierzyłaby cudzy plik.
      name: "shrink the People twin of the segment glyph only: the Organizations size pair stays green over half a fix",
      expectRedContains: ["D6-04d"],
      file: "packages/desktop-ui/src/people/people.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.switch svg {
  width: 0.8125rem;
  height: 0.8125rem;`,
          `.switch svg {
  width: 0.6875rem;
  height: 0.6875rem;`,
          "the layout segment glyph's size on People",
        ),
    },
    {
      // ZŁAMANIE PIĘĆDZIESIĄTE CZWARTE — KOMPOZYTOR ZNOWU BEZ ZNACZNIKA AUTORA
      // (D4-06c, pierwsza połowa wpisu #58).
      //
      // DOPISANE PO PRZEGLĄDZIE LOTU D4, NIE PRZEZ LOT D4 — i stoi na końcu
      // listy, a nie obok złamań 34-38, bo numeracja tego pliku jest cytowana
      // w tabeli raportu fazy D. Przesunięcie dwudziestu numerów, żeby jedno
      // złamanie stanęło w swojej grupie, kosztowałoby więcej niż daje.
      //
      // POZYCJA, KTÓRA PRZEZ CAŁY LOT NIE MIAŁA CZYM PAŚĆ. Wpis #58 nazywa
      // się „kompozytor: brak awatara", a mapa trasowana liczyła tę pozycję
      // jako pokrytą dwiema parami, z których ŻADNA nie patrzyła na znacznik
      // (D4-06a liczy wysyłki poza ramką, D4-06b czyta `resize` pola). Para
      // `D4-06c` dopiero domknęła to w `8e5f698`.
      //
      // DLACZEGO KASOWANIE, A NIE PODMIANA MARGINESU. `D4-06c` czyta
      // `marginTop` znacznika, więc złamanie na samej liczbie dowiodłoby
      // tylko, że para czyta swój wymiar. Zdanie wpisu jest o OBECNOŚCI,
      // a para broni obecności inaczej: przy skasowanym znaczniku odczyt
      // właściwości nie ma na czym stanąć i para wraca `NOT_MEASURED`, co
      // `verify-renderer-layout.mjs` liczy jako AWARIĘ z nazwą pary
      // (a nie jako ciszę, jak zrobiłoby zliczanie dopełnienia). To złamanie
      // jest jedynym dowodem, że ta ścieżka naprawdę zapala bramkę.
      name: "take the author mark out of the comment composer: the thread stamps every comment and the box the reader writes in is stamped with nothing",
      expectRedContains: ["D4-06c"],
      file: "packages/desktop-ui/src/record/RecordCommentsPanel.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `        <span
          aria-hidden="true"
          className={\`\${styles.mark} \${styles.composerMark}\`}
        >
          {currentDisplayName === undefined ? (
            <Icon name="people" />
          ) : (
            initialsOf(currentDisplayName)
          )}
        </span>
`,
          ``,
          "the composer's author mark",
        ),
    },
    {
      // ZŁAMANIE PIĘĆDZIESIĄTE PIĄTE — SZYNA WRACA, CZYLI DWA PASY ZAMIAST
      // DWÓCH SEKCJI JEDNA POD DRUGĄ (D7-01a, wpis #63).
      //
      // MODYFIKACJA SIATKI, NIE SKASOWANIE SEKCJI, i to jest cała różnica
      // między dowodem wpisu a dowodem nieobecności. Obie sekcje dalej
      // istnieją, dalej się rysują i dalej trafiają w swoje selektory —
      // czerwień przychodzi z KSZTAŁTU, dokładnie tak, jak wpis go nazywa.
      name: "put the rail back on Meetings: two lanes instead of two sections stacked in one column",
      expectRedContains: ["D7-01a"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.meeting-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);`,
          `.meeting-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 22rem);`,
          "the meetings body grid",
        ),
    },
    {
      // ZŁAMANIE PIĘĆDZIESIĄTE SZÓSTE — WYNIKI JAMIE ZNOWU NAD NADCHODZĄCYMI
      // (D7-01b, druga połowa wpisu #63).
      //
      // JEDNA LINIJKA, I PO TO ISTNIEJĄ STAŁE `upcomingSection`
      // / `completedSection`: kolejność, o którą chodzi rejestrowi, daje się
      // odwrócić bez dotykania czegokolwiek w środku sekcji. NIC NIE ZNIKA —
      // rusza się wyłącznie to, co wpis nazywa. Bez tego złamania D7-01a
      // stałaby zielona nad jedną kolumną z odwróconą kolejnością.
      name: "render Jamie results above Coming up again: one column, wrong order",
      expectRedContains: ["D7-01b"],
      file: "packages/desktop-ui/src/MeetingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `        {upcomingSection}
        {completedSection}`,
          `        {completedSection}
        {upcomingSection}`,
          "the order of the two meeting sections",
        ),
    },
    {
      // ZŁAMANIE PIĘĆDZIESIĄTE SIÓDME — CHROM KARTY WRACA NA SEKCJĘ, A LISTA
      // ZNOWU WPUSZCZONA (D7-02a i D7-02b, wpis #64).
      //
      // DWIE EDYCJE W JEDNYM ZŁAMANIU, bo to jest JEDNA wada: farba nie ma
      // zniknąć, tylko wrócić na niewłaściwy element. Odtwarza to dzisiejszy
      // stan ekranu co do deklaracji. Karta NIE JEST kasowana — zmienia się
      // to, KTO nosi farbę, i dokładnie o tym jest wpis #64.
      name: "give the meetings section back its raised chrome and sink the list inside it",
      expectRedContains: ["D7-02a", "D7-02b"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          replaceOnce(
            text,
            `.meeting-upcoming,
.meeting-completed {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}`,
            `.meeting-upcoming,
.meeting-completed {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
.meeting-completed {
  padding: var(--space-5);
  border: 1px solid var(--panel-reading-border);
  border-radius: var(--radius-xl);
  background: var(--panel-reading-bg);
  box-shadow: var(--elevation-raised);
}`,
            "the raised chrome on the completed section",
          ),
          `  border-radius: var(--radius-md);
  background: var(--panel-reading-bg);
  box-shadow: var(--shadow-sm);
}
.meeting-result-list > li:not(:last-child) {`,
          `  border-radius: var(--radius-md);
  background: var(--surface-sunken);
  box-shadow: var(--shadow-sm);
}
.meeting-result-list > li:not(:last-child) {`,
          "the result list's own plane",
        ),
    },
    {
      // ZŁAMANIE PIĘĆDZIESIĄTE ÓSME — NAGŁÓWEK ZNOWU JAKO KRESKA DZIAŁOWA
      // KARTY (D7-03d, połowa wpisu #65).
      //
      // DOPISANIE, NIE SKASOWANIE: nagłówek dalej istnieje, dalej stoi tam,
      // gdzie stał, i dalej trafia w swój selektor. Wraca wyłącznie ta jedna
      // deklaracja, która trzymała go w środku pudełka.
      name: "draw the meetings section head as the card's divider again",
      expectRedContains: ["D7-03d"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.meeting-sec-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}`,
          `.meeting-sec-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
}`,
          "the section head's divider rule",
        ),
    },
    {
      // ZŁAMANIE PIĘĆDZIESIĄTE DZIEWIĄTE — PRAWY KONIEC NAGŁÓWKA ZNOWU PUSTY
      // (D7-03c, druga połowa wpisu #65).
      //
      // TO JEDYNE ZŁAMANIE W TYM PLIKU, KTÓRE KASUJE SWÓJ PODMIOT, I JEST TO
      // UPRAWNIONE DOKŁADNIE TUTAJ. Reguła tego harnessu brzmi: złamanie ma
      // dowodzić WPISU, nie nieobecności — a zarejestrowaną wadą JEST tu
      // nieobecność („nagłówek sekcji nie ma prawego końca"). Para czyta
      // LICZBĘ (`expect: { kind: "count", equals: 1 }`), a `judgeVisualPair`
      // rozstrzyga `count` ZANIM dojdzie do gałęzi „selektor nie trafił
      // w nic", więc 1 → 0 wraca jako DIFFERS Z NAZWĄ PARY, a nie jako
      // NOT_MEASURED ze zepsutego selektora. Sprawdzone w przyrządzie, nie
      // założone.
      name: "take the right-side affordance off the Jamie results head",
      expectRedContains: ["D7-03c"],
      file: "packages/desktop-ui/src/MeetingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `        <button
          type="button"
          className="meeting-sec-more"
          data-open-sources
          onClick={onOpenSources}
        >
          Open Sources →
        </button>
`,
          ``,
          "the Open Sources exit in the Jamie results head",
        ),
    },
    {
      // ZŁAMANIE SZEŚĆDZIESIĄTE — WIERSZ NADCHODZĄCYCH ZNOWU W GEOMETRII SZYNY
      // (D7-01d, czwarta strona wpisu #63).
      //
      // TO JEST DOKŁADNIE PÓŁSTAN, PRZED KTÓRYM OSTRZEGA REJESTR, i dlatego ma
      // własne złamanie: sekcja stoi tam, gdzie ma stać, na pełnej szerokości
      // i pierwsza, więc D7-01a, D7-01b i D7-01c wracają ZIELONE — czerwona
      // jest wyłącznie para czytająca środek przeniesionego pudełka. Jedna
      // kolumna to geometria zaprojektowana na 18-22 rem; nic nie znika.
      name: "give the upcoming row back the single column it wore inside the rail",
      expectRedContains: ["D7-01d"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.meeting-event {
  display: grid;
  grid-template-columns: 7.5rem minmax(0, 1fr) auto;`,
          `.meeting-event {
  display: grid;
  grid-template-columns: minmax(0, 1fr);`,
          "the upcoming row's track count",
        ),
    },
    {
      // ZŁAMANIE SZEŚĆDZIESIĄTE PIERWSZE — DRABINA ODWRÓCONA O JEDEN SZCZEBEL
      // NIŻEJ (D7-02e i D7-02f, sedno wpisu #64).
      //
      // DWIE EDYCJE, JEDNA WADA, ZAMIANA A NIE SKASOWANIE: karta bierze
      // wypełnienie wiersza, wiersz bierze wypełnienie karty. Oba podmioty dalej
      // istnieją i dalej trafiają w swoje selektory, a farba jest ta sama co
      // była — siedzi tylko na niewłaściwym szczeblu. Bez tej pary złamanie
      // z lotu („chrom karty wraca na sekcję") zostawiało nadchodzące
      // nietknięte, bo mierzyła je wtedy WYŁĄCZNIE proza.
      name: "swap the paint between the upcoming card and the row sunken inside it",
      expectRedContains: ["D7-02e", "D7-02f"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          replaceOnce(
            text,
            `.meeting-upcoming-list {
  display: grid;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--panel-reading-bg);`,
            `.meeting-upcoming-list {
  display: grid;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-sunken);`,
            "the upcoming card's plane",
          ),
          `  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-sunken);
}
.meeting-event:last-child {`,
          `  border-bottom: 1px solid var(--border-subtle);
  background: var(--panel-reading-bg);
}
.meeting-event:last-child {`,
          "the upcoming row's plane",
        ),
    },
    {
      // ZŁAMANIE SZEŚĆDZIESIĄTE DRUGIE — NAGŁÓWEK NADCHODZĄCYCH PRZESTAJE BYĆ
      // TYM SAMYM NAGŁÓWKIEM (D7-03f, bliźniak z wpisu #65).
      //
      // ZMIANA KLASY, NIE SKASOWANIE ELEMENTU: nagłówek dalej się rysuje, dalej
      // niesie tytuł, liczbę i kłódkę — przestaje tylko należeć do wspólnego
      // wzorca „nagłówek nad kartą", czyli wraca do stanu, w którym ta sekcja
      // miała własny nagłówek pod cudzą regułą. Złamanie jest ostre także
      // w drugą stronę: D7-03e (stopień pisma, bez klasy sekcji) i D7-03g
      // (kłódka, selektor potomka) zostają ZIELONE, więc czerwień nie może
      // pochodzić z żadnej innej pary tej pozycji.
      name: "let the upcoming head fall out of the shared section-head pattern",
      expectRedContains: ["D7-03f"],
      file: "packages/desktop-ui/src/MeetingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `      <div className="meeting-sec-head">
        <h2 id="upcoming-title">`,
          `      <div className="meeting-upcoming-head">
        <h2 id="upcoming-title">`,
          "the class carrying the upcoming section head",
        ),
    },
    {
      // ZŁAMANIE SZEŚĆDZIESIĄTE TRZECIE — PRAWY KONIEC NAGŁÓWKA NADCHODZĄCYCH
      // ZNOWU PUSTY (D7-03g, druga połowa wpisu #65 nad DRUGĄ sekcją).
      //
      // DRUGIE I OSTATNIE ZŁAMANIE W TYM PLIKU, KTÓRE KASUJE SWÓJ PODMIOT,
      // z tym samym uprawnieniem co złamanie nad `[data-open-sources]`:
      // zarejestrowaną wadą JEST tu nieobecność prawego końca, a para czyta
      // LICZBĘ, którą `judgeVisualPair` rozstrzyga ZANIM dojdzie do gałęzi
      // „selektor nie trafił w nic". 1 → 0 wraca więc jako DIFFERS z nazwą pary.
      name: "take the lock badge off the Coming up head",
      expectRedContains: ["D7-03g"],
      file: "packages/desktop-ui/src/MeetingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `        <span className="meeting-sec-lock">
          <Icon name="lock" />
          {surface.capability.provider === "eventkit"
            ? "Apple Calendar"
            : "Calendar"}
        </span>
`,
          ``,
          "the lock badge in the Coming up head",
        ),
    },
    {
      // ZŁAMANIE SZEŚĆDZIESIĄTE CZWARTE — KRESKA ŁAŃCUCHA ZNOWU WCHŁANIA CAŁĄ
      // NADWYŻKĘ WIERSZA (D7-01e, regresja wprowadzona przez sam lot D7).
      //
      // COFNIĘCIE DO REGUŁY BAZOWEJ, NIE SKASOWANIE NADPISU DO ZERA: wartość,
      // którą tu wpisujemy, jest DOKŁADNIE tą, którą element odziedziczyłby po
      // `.evidence-thread i`, gdyby nadpisu nie było — czyli złamanie odtwarza
      // stan, w którym ekran naprawdę stał po rekompozycji, a nie stan
      // wymyślony. Nic nie znika: łańcuch dalej się rysuje, dalej ma trzy
      // plakietki i dwie kreski, tylko kreski znowu rosną z wierszem.
      name: "let the provenance connectors absorb the row's free width again",
      expectRedContains: ["D7-01e"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.meeting-event .evidence-thread i {
  flex: 0 0 1.5rem;
}`,
          `.meeting-event .evidence-thread i {
  flex: 1 1 1.5rem;
}`,
          "the scoped connector width in the upcoming row",
        ),
    },
    {
      // ── LOT D9, ZŁAMANIE PIERWSZE — PLAKIETKA UCZESTNICTWA TRACI GLIF ──────
      // Kasowany jest JEDEN z dwóch montaży, nie oba — plakietka spotkań dalej
      // rysuje swój znak — bo złamanie ma dowieść, że para pilnuje OBU połówek
      // dostawy, a nie tylko obecności czegokolwiek na tym ekranie.
      //
      // TO ZŁAMANIE WRÓCIŁO RAZ ZIELONE I ZMIENIŁO PARĘ, NIE SIEBIE. `D9-01a`
      // stała najpierw na `[data-part] svg` z podłogą 2; fikstura rysuje PIĘĆ
      // znaków (trzy plakietki dealów, dwie spotkań), więc po zdjęciu glifu
      // z całej połowy dealowej zostawały 2 i asercja przechodziła nad zepsutym
      // kodem. Harness zgłosił to jako `FAILED (the assertion stayed green on
      // broken code)`. Podłoga rozdzielona atrybutem `data-part` — dopiero
      // wtedy to złamanie mierzy podmiot, o którym mówi.
      name: "take the glyph off the deals half of the participation badge: the pill goes back to a bare typed count",
      expectRedContains: ["D9-01a"],
      file: "packages/desktop-ui/src/people/PeopleSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `              <span className={styles.part} data-part="deals">
                <Icon name="pipeline" />
`,
          `              <span className={styles.part} data-part="deals">
`,
          "the deals badge's leading glyph",
        ),
    },
    {
      // ── LOT D9, ZŁAMANIE DRUGIE — GLIF W ROZMIARZE CHROMU PASKA WIDOKU ─────
      // TO JEST ZŁAMANIE, KTÓRE `D9-01a` PRZEPUSZCZA, I PO TO ISTNIEJE
      // `D9-01b`. Znak zostaje na miejscu, liczba elementów się nie zmienia,
      // więc para licząca wraca ZIELONA — zmienia się wyłącznie WYMIAR,
      // z 0,6875 rem treści wiersza na 0,8125 rem chromu paska widoku. Dokładnie
      // ta pomyłka pojechała już raz na tym ekranie w drugą stronę (lot D6 dał
      // segmentowi rozmiar plakietki) i nie zobaczyła jej żadna bramka.
      name: "give the participation glyph the view bar's size: the row's own third step of glyph size disappears",
      expectRedContains: ["D9-01b"],
      file: "packages/desktop-ui/src/people/people.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.part svg {
  width: 0.6875rem;
  height: 0.6875rem;`,
          `.part svg {
  width: 0.8125rem;
  height: 0.8125rem;`,
          "the participation glyph's own size",
        ),
    },
    {
      // ── LOT D9, ZŁAMANIE TRZECIE — TOR PLAKIETKI ZNOWU USTĘPUJE PIERWSZY ───
      // ZŁAMANIE, KTÓRE DOWODZI WPISU, A NIE JEGO NIEOBECNOŚCI, i to jest tu
      // rozstrzygające. Wpis rejestru `people|span._parts` został przez ten lot
      // SPŁACONY I SKASOWANY, więc powrót do `minmax(0, 1fr)` nie wraca do
      // tolerowanego długu — wraca jako ŚWIEŻE `violation`, bo dla tej
      // sygnatury nie ma już żadnego sufitu. Gdyby wpis zostawić „na wszelki
      // wypadek", to złamanie wróciłoby ZIELONE pod sufitem 25 px, a lot
      // twierdziłby, że mierzy coś, czego nie mierzy.
      //
      // ŁAMANY JEST TOR, NIE PLAKIETKA. Skasowanie plakietki też dałoby
      // czerwień, ale dowodziłoby jej NIEOBECNOŚCI — a poprawka tego lotu
      // dotyczy kolejności ustępowania w wierszu, więc to ona ma być łamana.
      name: "let the participation track give up its room before the truncatable cells again",
      expectRedContains: ["span._parts"],
      file: "packages/desktop-ui/src/people/people.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `    1.5rem minmax(0, 1.4fr) minmax(min-content, 1fr) minmax(0, 1fr)`,
          `    1.5rem minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)`,
          "the participation track's content floor",
        ),
    },
    {
      // ── LOT D9, ZŁAMANIE TRZECIE-BIS — KOMÓRKA DATY ZNOWU BEZ SKRACANIA ────
      // DOŁOŻONE PO PRZEGLĄDZIE FALI, i przegląd miał w tej sprawie rację.
      // Lot D9 skasował wpis rejestru `people|b._absent` i zastąpił go trzema
      // deklaracjami na `.met b` — a te trzy deklaracje NIE MIAŁY ŻADNEGO
      // STRAŻNIKA. Dało się je usunąć jednym ruchem i żadne złamanie tego lotu
      // nie zrobiłoby się czerwone, mimo że wpis rejestru zniknął właśnie na ich
      // rzecz. Wpis skasowany bez złamania nie jest spłatą długu, tylko jego
      // przeniesieniem w miejsce, którego nikt nie pilnuje.
      //
      // ŁAMANE JEST SAMO OBCINANIE, NIE KOMÓRKA. `text-overflow` i
      // `white-space` zostają — zdjęcie `overflow: hidden` przestawia werdykt
      // przelotki z `contained` na `visible`, więc gałąź z datą wychodzi ze
      // swojego toru o 107 px przy 200% i jako świeże `violation`, bo dla
      // sygnatury `b` żadnego sufitu w rejestrze nie ma. Skasowanie całej
      // komórki dowodziłoby jej nieobecności, a nie reguły.
      name: "take the truncation off the last-met date: the cell the registry entry was retired for goes back to spilling out of its track",
      expectRedContains: ["descendant b overflows its own box"],
      file: "packages/desktop-ui/src/people/people.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}`,
          `  color: var(--text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}`,
          "the last-met date's own truncation",
        ),
    },
    {
      // ── PRZYRZĄD PRZEGLĄDU — REJESTR ZAPADNIĘTEJ TREŚCI MA PRZEDMIOT ───────
      // Nowa przelotka `sweepCollapsedText` i rejestr `KNOWN_COLLAPSED_TEXT`
      // powstały w tym przeglądzie, więc w tym przeglądzie są łamane. To
      // złamanie kasuje JEDYNY wpis rejestru: jeśli przelotka naprawdę widzi
      // zapadniętą rolę, brak wpisu zamienia ją w `violation` i bramka pada.
      // Zieleń tutaj znaczyłaby, że rejestr opisuje coś, czego pomiar nie
      // dosięga — czyli dokładnie ten rodzaj deklaracji, który ten przegląd
      // zgłosił jako defekt.
      name: "delete the only collapsed-text debt entry: a cell with no inner width has to fail when nothing owns it",
      expectRedContains: ["has NO inner width"],
      file: "scripts/descendant-overflow.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `    passes: ["text scaled to 200%", "a 320 px window"],
    thread:
      "skalowanie interfejsu (R3-5, za falą E) — kolejność zwijania w wierszu osoby",`,
          `    passes: ["a full-size window"],
    thread:
      "skalowanie interfejsu (R3-5, za falą E) — kolejność zwijania w wierszu osoby",`,
          "the passes the collapsed role is registered for",
        ),
    },
    {
      // ── PRZYRZĄD PRZEGLĄDU — PRZELOTKA NAPRAWDĘ MIERZY ────────────────────
      // DRUGA STRONA TEGO SAMEGO PYTANIA, i bez niej pierwsze złamanie nie
      // wystarcza. Tamto dowodzi, że BRAK WPISU pada; to dowodzi, że wpis jest
      // ZASPOKAJANY POMIAREM, a nie samą swoją obecnością. Złamanie przywraca
      // ślepotę przelotki (pomija komórki, które i tak są niewidoczne), więc
      // wpis nie zostaje dopasowany w żadnym przelocie i pada
      // `unusedCollapsedEntries`. Bez tego dałoby się zostawić rejestr nad
      // przelotką, która niczego nie zbiera, i całość wracałaby zielona.
      name: "make the collapsed-text sweep blind again: the registry entry stops being met by any pass",
      expectRedContains: ["the collapsed-text registry"],
      file: "scripts/verify-renderer-layout.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `          if (element.clientWidth >= 1) continue;
          if (element.clientHeight < 1) continue;`,
          `          if (element.clientWidth >= 0) continue;
          if (element.clientHeight < 1) continue;`,
          "the collapsed-text sweep's own threshold",
        ),
    },
    {
      // ── LOT D9, ZŁAMANIE CZWARTE — EKRAN DZIŚ ZNOWU NIE MA WIERSZA PLANU ───
      // DWA STRAŻNIKI NA JEDNO ZŁAMANIE, I TO JEST CAŁY POWÓD, DLA KTÓREGO OBA
      // ISTNIEJĄ. Zdjęcie `plannedBy` z jedynej pozycji `task.list` zabiera
      // plakietce autorstwa jej stan: `D2-09b` liczy wtedy 0 zamiast 1.
      // Zdjęcie `startAt` zabrałoby wiersz W OGÓLE i zaczerwieniło RÓWNIEŻ próg
      // `todayPlannedRows` — ale łamiemy `plannedBy`, bo to jest węższe
      // złamanie i dowodzi, że para pilnuje SWOJEGO podmiotu, a nie tego, że na
      // ekranie cokolwiek się rysuje.
      name: "take the plan's authorship off the harness task: the Today section head loses its right end again",
      expectRedContains: ["D2-09b"],
      file: "packages/desktop-ui/src/dev/CollaborationHarness.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `          plannedBy: {
            principalId: agentPrincipalId,
            principalKind: "agent" as const,
            at: plannedByAt,
          },`,
          ``,
          "the plan authorship on the harness task",
        ),
    },
    {
      // ── LOT D9, ZŁAMANIE PIĄTE — PRÓG `todayPlannedRows` ───────────────────
      // PRÓG DOŁOŻONY PRZEZ TEN LOT, WIĘC ZŁAMANY PRZEZ TEN LOT. Bez tego
      // złamania `MINIMUM_ROWS.todayPlannedRows` byłby asercją, której nikt
      // nigdy nie zobaczył na czerwono — a to jest w tym repozytorium nazwana
      // klasa („przyrząd, którego nie było"): strażnik dopisany razem z dostawą
      // i nigdy nieuruchomiony różni się od braku strażnika wyłącznie tym, że
      // wygląda na obecnego.
      //
      // ŁAMANA JEST DATA, NIE OBECNOŚĆ POLA. Skasowanie `startAt` osierociłoby
      // `plannedStartAt` i czerwień przyszłaby z lintu, czyli spoza mierzonej
      // rzeczy. Przypięcie daty do 2020 roku zostawia kod poprawny i wypycha
      // zadanie poza „dziś", więc `plannedForDay` nie zwraca nic i sekcja planu
      // wraca do stanu „Nothing is planned for today" — dokładnie tego, w którym
      // stała przez całą falę D.
      //
      // DWA OCZEKIWANE PODMIOTY, bo padają dwie różne rzeczy: próg (nie ma
      // wiersza) i para D2-09b (nie ma plakietki). Asertowanie samego D2-09b
      // pozwoliłoby temu złamaniu przejść na czerwieni pary i NIE dowieść progu.
      name: "pin the harness task's plan to a date that is not today: the Today plan section empties again",
      expectRedContains: ["todayPlannedRows", "D2-09b"],
      file: "packages/desktop-ui/src/dev/CollaborationHarness.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          "const plannedStartAt = `${todayKey}T12:00:00.000Z`;",
          `const plannedStartAt = "2020-01-01T12:00:00.000Z";`,
          "the clock-derived start of the planned harness task",
        ),
    },
    {
      // ── LOT D10, ZŁAMANIE PIERWSZE — PASEK WIDOKU WRACA DO ŚRODKA ─────────
      //
      // ŁAMANY JEST UKŁAD, NIE OBECNOŚĆ PASMA, i to jest cała treść tego
      // złamania. Skasowanie paska widoku dowiodłoby wyłącznie tego, że bramka
      // widzi jego brak — czyli nieobecności, nie wpisu. Ten edit PRZENOSI go
      // z powrotem do przewijanego pudełka: pasek dalej się rysuje, dalej niesie
      // swój licznik, dalej ma dolną krawędź — i znowu jedzie z treścią.
      // Zmierzone przed lotem i po nim na Odnowieniach przy 1440 px: przy
      // `scrollTop = 60` pasmo tytułu schodziło z y=40 na y=-20, a pasek widoku
      // z y=80 na y=20; po locie oba stoją.
      //
      // CZERWIEŃ IDZIE Z D10-01d, czyli z pary liczącej BEZPOŚREDNIE dzieci
      // nośnika. Pary czytające `overflow` (D10-01a/b) zostają przy tym złamaniu
      // ZIELONE — nośnik dalej deklaruje `hidden`, pudełko pod nim dalej `auto`
      // — i to jest powód, dla którego para o położeniu w ogóle istnieje.
      name: "put the view bar back inside the scrolling box: the band travels with the content again",
      expectRedContains: ["D10-01d"],
      file: "packages/desktop-ui/src/renewals/RenewalsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `      <div className={\`view-band \${styles.viewbar}\`}>
        <span aria-live="polite" className={styles.count} role="status">
          {\`\${countLabel(sections.openCount, "contract")} open · \${sections.closed.length} closed this cycle\`}
        </span>
      </div>

      <div
        className={\`surface-scroll \${styles.renewals}\`}
        data-renewals-surface
      >`,
          `      <div
        className={\`surface-scroll \${styles.renewals}\`}
        data-renewals-surface
      >
        <div className={\`view-band \${styles.viewbar}\`}>
          <span aria-live="polite" className={styles.count} role="status">
            {\`\${countLabel(sections.openCount, "contract")} open · \${sections.closed.length} closed this cycle\`}
          </span>
        </div>`,
          "the view bar's place beside the scrolling box",
        ),
    },
    {
      // ── LOT D10, ZŁAMANIE DRUGIE — NOŚNIK ZNOWU PRZEWIJA ──────────────────
      //
      // DRUGIE ZDANIE WPISU, ŁAMANE OSOBNO. Złamanie pierwsze rusza POŁOŻENIE
      // pasm; to rusza to, KTÓRE PUDEŁKO jest portem przewijania. Rozdzielone,
      // bo przy jednym złamaniu na oba zdania para o `overflow` mogłaby nigdy
      // nie zaczerwienić się z własnego powodu i nikt by tego nie zobaczył.
      //
      // `auto` zamiast `hidden` zostawia obie pary o położeniu ZIELONE (pasma
      // dalej są rodzeństwem) i obie geometrie prawie nietknięte — a robi
      // z ekranu DWA zagnieżdżone porty przewijania. Dokładnie ta cicha wada,
      // przed którą ta reguła ma bronić.
      //
      // PIERWSZA WERSJA TEGO ZŁAMANIA WRÓCIŁA ZIELONA I JEST TO LEKCJA O TYM
      // HARNESSIE, nie o parze. Dopisywała `overflow: auto` NAD `flex-direction`
      // — czyli PRZED własnym `overflow: hidden` tego samego bloku, które jako
      // późniejsze wygrywało. Edycja wylądowała dokładnie tam, gdzie celowała,
      // `replaceOnce` nie miał czego zgłosić, a wartość obliczona nie drgnęła:
      // strażnik jednokrotnego trafienia pilnuje, GDZIE ląduje tekst, i nie umie
      // powiedzieć, CZY tekst cokolwiek zmienia. Harness zgłosił to jako FAILED
      // i to była poprawna diagnoza — złamanie było no-opem. Wersja niżej rusza
      // ISTNIEJĄCĄ deklarację, więc nie ma nad sobą nikogo, kto ją przykryje.
      name: "let the migrated carrier keep its own scrolling: two nested scroll ports instead of one",
      expectRedContains: ["D10-01a"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `     tego strona miałaby DWA pudełka przewijania jedno w drugim. */
  overflow: hidden;`,
          `     tego strona miałaby DWA pudełka przewijania jedno w drugim. */
  overflow: auto;`,
          "the migrated carrier's own overflow",
        ),
    },
    {
      // ── LOT D10, ZŁAMANIE TRZECIE — PRZYRZĄD, NIE PRODUKT ─────────────────
      //
      // NAPRAWA PRZYRZĄDU DOŁOŻONA PRZEZ TEN LOT, WIĘC ZŁAMANA PRZEZ TEN LOT.
      // `measure()` brał PIERWSZE widoczne dziecko `#main-content` i nazywał je
      // powierzchnią. Odkąd pasma są rodzeństwem, pierwszym dzieckiem jest
      // PASMO — 40-pikselowy pasek — więc wszystkie przelotki i wszystkie
      // liczniki wierszy chodziły po nim zamiast po ekranie. To złamanie wraca
      // do tamtej wąskiej wersji `count`.
      //
      // CZERWIEŃ IDZIE Z PODŁOGI, NIE Z PARY, i to jest tu pointa: same
      // przelotki przepełnienia wróciłyby ZIELONE nad poddrzewem, w którym nie
      // ma czego przepełnić. Jedynym przyrządem, który tę wąskość widzi, jest
      // liczba narysowanych wierszy — i dlatego ten lot nie mógł jej obejść.
      //
      // ŁAMANE SĄ OBIE POŁOWY POPRAWKI, licznik I przelotki, i to jest poprawka
      // po przeglądzie tego lotu. Pierwsza wersja cofała sam `count`: wracała
      // czerwona, więc wyglądała na dowód — a dowodziła WYŁĄCZNIE zakresu
      // licznika, zostawiając bez strażnika tę połowę, która jest groźniejsza.
      // To przelotki zgłosiły `organizations / span._nameLine` jako „never met
      // in any pass", czyli zaprosiły następny lot do skasowania ŻYWEGO wpisu
      // rejestru jako spłaconego. Złamanie, które tej połowy nie rusza, zostawia
      // ją w stanie, o którym da się powiedzieć tylko „jest zielona".
      // ROZDZIELONE NA DWA ZŁAMANIA PO PRZEGLĄDZIE FALI, i przegląd miał rację.
      // Wersja poprzednia cofała OBIE połowy jedną edycją, ale asertowała
      // wyłącznie `renewalRows` — a `renewalRows` produkuje SAM licznik. Czerwień
      // dawała się więc przypisać w całości cofnięciu licznika, a połowa
      // groźniejsza (zakres przelotek) nie miała nic, co by ją czytało: złamanie
      // ruszające tylko ją spełniałoby zero asercji tego wpisu. Dwa złamania
      // niżej pytają o dwie różne rzeczy dwoma różnymi przyrządami, więc żadnej
      // z połówek nie da się cofnąć pod zieloną bramką.
      name: "measure the surface by its first child again, the row counters: a 40 px band has no rows to count",
      expectRedContains: ["renewalRows"],
      file: "scripts/verify-renderer-layout.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `          const count = (selector) =>
            roots.reduce(
              (total, root) => total + root.querySelectorAll(selector).length,
              0,
            );`,
          `          const count = (selector) =>
            drawn?.querySelectorAll(selector).length ?? 0;`,
          "the row counter's scope",
        ),
    },
    {
      // ── LOT D10, ZŁAMANIE CZWARTE — DRUGA POŁOWA TEJ SAMEJ POPRAWKI ────────
      // TA POŁOWA JEST GROŹNIEJSZA I DOTĄD NIE MIAŁA ASERCJI. Przelotki
      // chodzące po 40-pikselowym paśmie nie zgłaszają przepełnień — bo w paśmie
      // nie ma czego przepełnić — więc same z siebie wracają ZIELONE. Widzi to
      // dopiero `unusedRegistryEntries`: wpis `organizations|span._nameLine`
      // przestaje być dopasowany w jakimkolwiek przelocie i bramka mówi „never
      // met in any pass", czyli zaprasza następny lot do skasowania ŻYWEGO długu
      // jako spłaconego. Dokładnie to zaszło w locie D10 przed poprawką.
      //
      // ASERTOWANY JEST WPIS, NIE LICZNIK — licznika to złamanie nie rusza, więc
      // czerwień nie da się przypisać niczemu innemu.
      name: "measure the surface by its first child again, the sweeps: a live registry entry starts reading as paid",
      expectRedContains: ["span._nameLine was never met in any pass"],
      file: "scripts/verify-renderer-layout.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `          for (const root of roots) {
            sweepDescendants(root, label);
            sweepCollapsedText(root, label);
            sweepRecordScreens(root, label);
            sweepHeightBound(root, label);
          }`,
          `          sweepDescendants(drawn, label);
          sweepCollapsedText(drawn, label);
          sweepRecordScreens(drawn, label);
          sweepHeightBound(drawn, label);`,
          "the sweeps' scope",
        ),
    },
    {
      // ── FAZA I, PRZYRZĄD P1, ZŁAMANIE PIERWSZE — OŚ WARTOŚCI ──────────────
      // USTAWIENIA TRACĄ WŁASNĄ MIARĘ (P1-13).
      //
      // JEDYNE ZŁAMANIE W TYM PLIKU, KTÓRE ZMIENIA WARTOŚĆ SUFITU KOLUMNY
      // CZYTELNEJ, i to jest cała jego treść. Ustawienia są jedynym ekranem tej
      // aplikacji, który deklaruje własną miarę, więc jedynym, na którym para
      // P1 jest dziś MATCH — czyli jedynym, który da się przewrócić z zieleni
      // w czerwień POMIAREM, a nie zabiciem podmiotu. Po skasowaniu tej jednej
      // linii `.settings-layout` dziedziczy 72 rem z `.work-surface`
      // (`styles.css:2149`), wylicza 1152 px zamiast 1184 i para `enforced`
      // wrzuca WERDYKT (`verify-renderer-layout.mjs:7083-7088`), który idzie do
      // `problems`.
      //
      // CZYM RÓŻNI SIĘ OD POZOSTAŁYCH: najbliższe mu złamanie czternaste („put
      // the title band back inside the reading column", D1-01b) DODAJE sufit
      // tam, gdzie go nie ma, i mierzy PASMO. To zabiera sufit tam, gdzie jest,
      // i mierzy TREŚĆ. Żadne inne złamanie tego pliku nie rusza WARTOŚCI
      // `--surface-measure` na żadnym ekranie.
      //
      // NAPIS DO TRAFIENIA JEST JEDNOKROTNY: `--surface-measure: 74rem`
      // występuje w `styles.css` dokładnie raz (`.settings-surface`).
      name: "take the Settings screen's own reading measure away: the one screen that declares its ceiling inherits the shell's",
      expectRedContains: ["P1-13"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.settings-surface {
  --surface-measure: 74rem;
  container-type: inline-size;`,
          `.settings-surface {
  container-type: inline-size;`,
          "the Settings screen's own reading measure",
        ),
    },
    {
      // ── FAZA I, PRZYRZĄD P1, ZŁAMANIE DRUGIE — OŚ ISTNIENIA ───────────────
      // SKRZYNKA TRACI NOŚNIK TREŚCI (P1-03).
      //
      // DOWODZI TEZY PARY OCZEKUJĄCEJ, A NIE JEJ LICZBY: podmiot P1-03 ŻYJE
      // i jest mierzony dzisiaj, więc „nie pasuje" jest POMIAREM, a nie martwym
      // selektorem. Dla pary `pending` nie ma innej drogi — `pending + DIFFERS`
      // jest zielone, `pending + MATCH` żąda poprawki produktu (niewyrażalnej
      // przez `replaceOnce`), a `NOT_MEASURED` JEST ŚLEPE NA STATUS
      // (`verify-renderer-layout.mjs:7050-7057`) i kładzie bramkę niezależnie
      // od tego, czy para jest oczekująca. Po zdjęciu klasy modułowej
      // z nośnika `[class*="_inbox_"]` nie trafia w nic, para wraca
      // `ROUTED_NOT_MEASURED` razem ze spisem części selektora — czyli
      // z diagnozą, a nie z samym „czerwono".
      //
      // WYBÓR PODMIOTU JEST POMIAREM, NIE WYGODĄ. Trzy warunki naraz spełnia
      // tylko Skrzynka: (a) `styles.inbox` występuje w pliku DOKŁADNIE RAZ,
      // więc `replaceOnce` ma w co trafić; (b) marker przybycia tego ekranu to
      // `[data-inbox-row]`, a nie ta klasa, a sama klasa niesie wyłącznie
      // `--surface-measure: 68rem; display:flex; flex-direction:column; gap`
      // (`inbox.module.css:12-15`; przed lotem L1 były to trzy deklaracje
      // z `:5-9`, sufit dołożył czwartą) — nic z tego nie gasi wiersza, więc
      // trasa DALEJ LĄDUJE i czerwień jest
      // o selektorze, nie o nawigacji (`ROUTED_ROUTE_FAILED` nie niesie
      // identyfikatorów par, więc trasa, która pada, minęłaby
      // `expectRedContains`); (c) `_inbox_` nie występuje w ŻADNYM skrypcie
      // bramek, więc złamanie nie zabija cudzych par. Renewals, Pipeline
      // i rekord odpadają po (b) — ich podmiot JEST markerem przybycia.
      name: "take the module class off the Inbox content box: the P1 subject stops existing while the route still lands",
      expectRedContains: ["P1-03"],
      file: "packages/desktop-ui/src/InboxSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          "<div className={`surface-scroll ${styles.inbox}`}>",
          '<div className="surface-scroll">',
          "the Inbox content carrier",
        ),
    },
    {
      // ── FAZA I, PRZYRZĄD P2, ZŁAMANIE PIERWSZE — MAPA POWŁOKI ─────────────
      // LISTA DZISIAJ PRZESTAJE BYĆ LISTĄ (P2-01a/b/c).
      //
      // SCHEMAT JEST Z KONIECZNOŚCI INNY NIŻ W ZŁAMANIACH, KTÓRE PSUJĄ
      // WARTOŚĆ, i powód jest arytmetyczny, nie stylistyczny. Wszystkie trzy
      // pary tej pozycji są `pending` i są DIFFERS już dziś — nie da się ich
      // „bardziej rozjechać", a doprowadzenie apki do zgodności (żeby zapalić
      // `PENDING_ALREADY_MATCHES`) jest POPRAWKĄ, nie edycją jednego napisu,
      // i `replaceOnce` tego nie wyrazi. Jedyną gałęzią osądu, która pada
      // NIEZALEŻNIE OD STATUSU, jest `NOT_MEASURED`
      // (`verify-renderer-layout.mjs:4555-4562` — status jest tam wyłącznie
      // DRUKOWANY, nie sprawdzany), więc złamanie musi ZABIĆ ISTNIENIE
      // PODMIOTU. Ten sam wybór, z tego samego powodu, zrobiło złamanie P1
      // nad Skrzynką.
      //
      // ZABIJANA JEST ROLA, A NIE ATRYBUT WIERSZA, i to jest wybór o
      // najmniejszym koszcie ubocznym. `[data-planned-row]` jest kotwicą progu
      // `rowCounts.todayPlannedRows` (`verify-renderer-layout.mjs:1126-1129`)
      // ORAZ podmiotem czwartej pary tego przyrządu (P2-02), więc skasowanie
      // atrybutu zapaliłoby trzy czerwienie naraz i żadnej nie dałoby się
      // przypisać. `role="listbox"` nie jest czytane przez ŻADNĄ bramkę tego
      // repozytorium — sprawdzone grepem po `scripts/`: jedyne wystąpienie
      // poza parami P2 to komentarz o liście Źródeł
      // (`verify-renderer-layout.mjs:1087`). Wiersze zachowują własne
      // `role="option"`, więc pary innych ekranów czytające `[role="option"]`
      // (D3, D7) też stoją nietknięte.
      //
      // CO TO DOWODZI: że podmiot pojemnika jest rozwiązywany PRZEZ ROLĘ i że
      // ta rola żyje dzisiaj. P2-02 zostaje zmierzona i zostaje cicha
      // (pending + DIFFERS), więc czerwień da się przypisać co do pary.
      name: "take the list role off the Today plan list: the container P2 measures stops existing",
      expectRedContains: ["P2-01a", "NOT_MEASURED"],
      file: "packages/desktop-ui/src/TodaySurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `          <ul
            className={styles.rows}
            role="listbox"
            aria-label="Planned for today"
          >`,
          `          <ul
            className={styles.rows}
            role="group"
            aria-label="Planned for today"
          >`,
          "the Today plan list's role",
        ),
    },
    {
      // ── FAZA I, PRZYRZĄD P2, ZŁAMANIE DRUGIE — MAPA TRASOWANA ─────────────
      // TO SAMO ZDANIE, DRUGI PRZELOT (P2-03a/b/c).
      //
      // NIE JEST TO KOPIA POPRZEDNIEGO I RÓŻNICA NIE JEST KOSMETYCZNA: tamto
      // pada w `visualLanguagePairs` jako `VISUAL_LANGUAGE_NOT_MEASURED`
      // (`:4555`), to pada w `routedVisualLanguage` jako `ROUTED_NOT_MEASURED`
      // (`:7071`) — dwa różne przeloty i dwie różne gałęzie kodu. Tylko to
      // drugie dowodzi, że pary P2 naprawdę są mierzone PO DOJŚCIU na miejsce.
      //
      // DOWODZI TEŻ ROZŁĄCZNOŚCI PODMIOTU I MARKERA PRZYBYCIA. Marker
      // Skrzynki to `#main-content [data-inbox-row]` (`ROUTED_ARRIVAL`,
      // dopisany przez przyrząd P1), a ta edycja zdejmuje rolę z `<ul>`,
      // zostawiając atrybut na `<li>` — więc trasa DALEJ LĄDUJE i czerwień
      // mówi „the route DID land (steps above), so this is the selector, not
      // the navigation". Gdyby przybycie było przypięte do roli, to samo
      // złamanie wróciłoby jako `ROUTED_ROUTE_FAILED`, który NIE NIESIE
      // identyfikatorów par i minąłby `expectRedContains` — czyli złamanie
      // byłoby czerwone z niewłaściwego powodu.
      //
      // JEDNOKROTNOŚĆ NAPISU: `role="list"` stoi w tym pliku dwa razy — nad
      // skrzynką `work` i nad `captures` — więc dopasowanie MUSI nieść
      // `aria-labelledby="inbox-work"`, i niesie. Skrzynka przechwytów jest
      // w tej fiksturze pusta i rysuje `<p>` zamiast `<ul>`, więc jej rola
      // i tak nie stoi dziś w drzewie.
      name: "take the list role off the Inbox work list: the routed stop lands and the container P2 measures is gone",
      expectRedContains: ["P2-03a", "ROUTED_NOT_MEASURED"],
      file: "packages/desktop-ui/src/InboxSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `              <ul
                className={styles.rows}
                role="list"
                aria-labelledby="inbox-work"
              >`,
          `              <ul
                className={styles.rows}
                role="group"
                aria-labelledby="inbox-work"
              >`,
          "the Inbox work list's role",
        ),
    },
    {
      // ── FAZA I, PRZYRZĄD P3, ZŁAMANIE PIERWSZE — OŚ SKŁADU PASMA ──────────
      // SKRZYNKA GUBI NADTYTUŁ, A TABELA DALEJ MÓWI „STACKED".
      //
      // KIERUNEK JEST ODWROTNY NIŻ WE WSZYSTKICH POPRZEDNICH ZŁAMANIACH TEGO
      // PLIKU i to jest cała jego wartość: tamte PSUJĄ produkt, a to go
      // POPRAWIA. Spis pasma ma w nagłówku zapisane, że dryf od kolumny
      // `today` znaczy jedno z dwojga — „ktoś przesunął i nie zapisał" albo
      // „lot dowiózł poprawkę i zostawił wiersz" — i do dziś udowodniony był
      // wyłącznie pierwszy z nich. Bez tego dowodu tabela mogłaby zacząć
      // kłamać w kierunku, którego nikt nie sprawdził, a lot L2 zamknąłby
      // rozjazd bez ani jednej czerwonej lampki po drodze.
      //
      // TO JEST DOKŁADNIE POPRAWKA, KTÓREJ ŻĄDA OŚ 3: po tej edycji `<h1>` jest
      // bezpośrednim dzieckiem `<header>`, w paśmie nie stoi nic z tekstem
      // przed tytułem, a przelot mierzy `ONE_ROW` wobec tabeli mówiącej
      // `STACKED`.
      //
      // NAZWA W `expectRedContains` JEST JEDNYM ZŁĄCZONYM LITERAŁEM, NIE DWOMA
      // FRAGMENTAMI. Samo „inbox" trafia w dowolne miejsce czterominutowego
      // wyjścia (bramka drukuje ten ekran w kilkunastu przelotach), więc
      // złamanie mogłoby przejść na CUDZEJ czerwieni. To jest ten sam napis,
      // który buduje werdykt `TITLE_BAND_STACK_DRIFT`.
      //
      // ŻADNE Z POPRZEDNICH ZŁAMAŃ NIE DOTYKA TEGO PASMA: jedyne inne, które
      // edytuje `InboxSurface.tsx` (P2), zdejmuje rolę z `<ul>` w TREŚCI i pada
      // jako `ROUTED_NOT_MEASURED` na parach P2-03a — inna gałąź kodu, inny
      // przelot, inny napis.
      name: "take the eyebrow out of the Inbox band: the stack column stops describing the product",
      expectRedContains: ["TITLE_BAND_STACK_DRIFT — inbox"],
      file: "packages/desktop-ui/src/InboxSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `        <div>
          <p className="eyebrow">Signals and captures</p>
          <h1 id="surface-title" tabIndex={-1}>
            Inbox
          </h1>
        </div>
`,
          `        <h1 id="surface-title" tabIndex={-1}>
          Inbox
        </h1>
`,
          "the Inbox band eyebrow wrapper",
        ),
    },
    {
      // ── FAZA I, PRZYRZĄD P3, ZŁAMANIE DRUGIE — OŚ OTWARCIA TREŚCI ─────────
      // NAGŁÓWEK SEKCJI KALENDARZA UDAJE OTWARCIE EKRANU.
      //
      // Oś 4 ma dziś TRZYNAŚCIE wierszy zgodnych i ZERO trafień `OPENING_2XL`
      // w całej aplikacji, więc złamanie, które psuje produkt, musi przewrócić
      // jednego świadka. Pierwszym NARYSOWANYM nagłówkiem treści Kalendarza
      // jest — zmierzone, nie założone, przelot 2026-08-13 przy 1440×900 —
      // `h2 „Deadline this week or already late…"` o 16 px
      // (`CalendarSurface.tsx:791-799`, reguła `calendar.module.css:361-369`).
      // Podniesienie go do `--text-2xl` daje `OPENING_2XL` wobec tabeli
      // mówiącej `OPENING_SMALLER`.
      //
      // DLACZEGO KALENDARZ, A NIE DZISIAJ: ten ekran jest NIEOSIĄGALNY dla obu
      // map par — nie ma go w `ROUTED_ARRIVAL`, bo klient scenariuszowy
      // świadomie odmawia kalendarza — więc czerwień może przyjść WYŁĄCZNIE
      // z tej osi i żadna para nie może jej podrobić. `grep -c
      // "calendar.module.css" scripts/break-visual-language.mjs` → 0: ani jedno
      // z poprzednich złamań nie dotyka tego arkusza.
      //
      // WAGA 560 ZOSTAJE NIETKNIĘTA ŚWIADOMIE: jest podmiotem osobnego wpisu
      // rejestru, a złamanie ruszające dwie rzeczy naraz nie mówi, która
      // zapaliła.
      //
      // KOTWICA MUSI WCIĄGNĄĆ `gap` I `margin`: `font-size: var(--text-md)`
      // pada w tym arkuszu dwa razy (`:53`, `:366`) i `font-weight: 560` też
      // dwa razy, a `replaceOnce` rzuca przy dwóch trafieniach. Czterowierszowy
      // blok jest w tym pliku jedyny — sprawdzone przed napisaniem tego wpisu.
      name: "let the Calendar section heading open the screen at 2xl: the opening axis loses a witness",
      expectRedContains: ["TITLE_BAND_OPENING_DRIFT — calendar"],
      file: "packages/desktop-ui/src/calendar.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-md);
  font-weight: 560;`,
          `  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 560;`,
          "the Calendar section heading size",
        ),
    },
    {
      // ZŁAMANIE PRZYRZĄDU P4 — I PIERWSZE W TYM PLIKU, KTÓRE DOWODZI TRZECIEJ
      // GAŁĘZI OSĄDU. Wszystkie wcześniejsze złamania pokazują albo
      // `NOT_MEASURED` po zabiciu podmiotu, albo werdykt nad parą `enforced`.
      // Tu czerwień ma nazwę `ROUTED_PENDING_ALREADY_MATCHES` i znaczy coś
      // innego: para P4-01b jest zapisana jako NIEODDANA, a produkt nagle
      // spełnia jej oczekiwanie.
      //
      // CZERWIEŃ NIE JEST TU ZDANIEM O PRODUKCIE i nikt nie ma prawa jej tak
      // przeczytać: to jest zdanie o REJESTRZE („przerzuć wpis na enforced albo
      // oczekiwanie jest napisane tak, że nigdy nie padnie"). Skasowanie pola
      // wyszukiwania NIE naprawia ekranu Zadań — prototyp zastępuje je
      // omniboksem powłoki, a nie pustym miejscem.
      //
      // DLACZEGO TO JEST MOCNIEJSZY DOWÓD NIŻ SCHEMAT „ZABIJ PODMIOT →
      // NOT_MEASURED", którym chodzą pozostałe pary `pending` tej fazy. Tamten
      // schemat mówi „selektor żyje". Ten mówi więcej: podmiot żyje, jest
      // LICZONY, a licznik naprawdę reaguje na jego zniknięcie — czyli
      // dzisiejsze „nie pasuje" jest POMIAREM, a nie martwym selektorem, i para
      // zauważy dostawę lotu L6 w tej samej chwili, w której ona nastąpi.
      // Dla pary `count` zabicie podmiotu jest właśnie tym, co para MIERZY,
      // więc daje `pending` + MATCH zamiast `NOT_MEASURED`.
      //
      // DLACZEGO AKURAT TO POLE: jest jedynym `<input>` na powierzchni treści
      // Zadań, więc jedna edycja zeruje licznik CAŁEJ pary. Trzy `<select>`
      // obok są nietknięte, więc P4-01a musi zostać DIFFERS — i to jest druga
      // rzecz, którą ten przebieg dowodzi: złamanie jednej pary nie rusza
      // sąsiedniej. `<label htmlFor="tasks-search">` zostaje osierocona i to
      // jest w porządku dla złamania: bramka układu nie ma sondy sierocej
      // etykiety (sprawdzone), a `noUnusedLocals` jest w tym repozytorium
      // wyłączony, więc nieużywane `setSearch` dalej się kompiluje. Gdyby
      // złamanie nie zbudowało się, `break-test.mjs` zgłosiłby to osobno
      // („the build refused the broken tree"), a nie zaliczył jako czerwień.
      //
      // SPRAWDZONE PRZED NAPISANIEM: `grep -rn "tasks-search" packages scripts`
      // → wyłącznie `TasksSurface.tsx` (etykieta i pole). Złamanie nie może
      // więc zapalić cudzej czerwieni i zostać zaliczone z niewłaściwego
      // powodu. Domyślny `verify` wystarcza — pary P4 chodzą w tym samym
      // przelocie co reszta mapy trasowanej.
      name: "delete the Tasks search field: a pending count-0 pair starts matching without a delivery",
      expectRedContains: ["ROUTED_PENDING_ALREADY_MATCHES", "P4-01b"],
      file: "packages/desktop-ui/src/tasks/TasksSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `          <input
            id="tasks-search"
            onChange={(event) => setSearch(event.target.value)}
            type="search"
            value={search}
          />
`,
          "",
          "the Tasks search field",
        ),
    },
    {
      // ── FAZA I, PRZYRZĄD P5 — SKALA WAG JEST DANĄ, NIE OZDOBĄ ─────────────
      //
      // Zbiór dozwolony P5 czyta się z `tokens.css`, a nie z listy w skrypcie.
      // Bez tego złamania NIKT NIGDY nie zobaczy, że deklaracja jest NOŚNA:
      // przyrząd z wpisanym `[400, 500, 600, 700]` w kodzie wyglądałby
      // identycznie w każdym raporcie i byłby zielony po skasowaniu wszystkich
      // czterech tokenów.
      //
      // CZERWIEŃ JEST POJEDYNCZA I TO JEST ARGUMENT ZA TYM ZŁAMANIEM, NIE
      // PRZECIW. Pary `P5-01a`/`P5-01b` po tym złamaniu NIE wracają
      // `NOT_MEASURED`: `resolveAs` ustawia `var(--weight-semibold)` na próbce
      // doklejonej do dokumentu, a nierozwiązywalne `var()` w NIE-niestandardowej
      // własności jest *invalid at computed-value time* — `font-weight` jest
      // DZIEDZICZONA, więc próbka wylicza wagę odziedziczoną, a nie pusty
      // napis. `NOT_MEASURED` z tytułu tokenu wymaga PUSTEGO rozwiązania, więc
      // obie pary zostają `DIFFERS`, a `pending` + `DIFFERS` to cisza.
      // WNIOSEK, KTÓRY TO ZŁAMANIE ZAPISUJE: skasowanie skali jest dla par
      // NIEWIDZIALNE. Bez osobnej, uzbrojonej asercji
      // `TYPE_WEIGHT_NO_DECLARED_SCALE` usunięcie czterech tokenów przeszłoby
      // przez bramkę na zielono, a przyrząd porównywałby wagi ze zbiorem,
      // którego nie ma.
      //
      // ŻADNE Z POZOSTAŁYCH ZŁAMAŃ TEGO PLIKU NIE ATAKUJE DEKLARACJI UŻYTEJ
      // JAKO ZBIÓR DOZWOLONY. Najbliższe jest „drop the section count back to
      // body weight", ale ono łamie produkt pod parę z WPISANYM literałem
      // „500" — dowodzi asercji o JEDNEJ liczbie, a nie o zbiorze. To jest
      // pierwsze złamanie w tym pliku, po którym przyrząd nie wie, czego
      // oczekiwać.
      name: "delete the declared weight scale: the membership assertion has nothing to be a member of",
      expectRedContains: ["TYPE_WEIGHT_NO_DECLARED_SCALE"],
      file: "packages/desktop-ui/src/tokens.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;`,
          "",
          "the declared weight scale",
        ),
    },
    {
      // ── FAZA I, PRZYRZĄD P5 — PRZELOTKA NAPRAWDĘ CHODZI PO ŻYWYM DRZEWIE ──
      //
      // DRUGA STRONA TEGO SAMEGO PYTANIA. Złamanie wyżej dowodzi, że ZBIÓR
      // jest nośny; to dowodzi, że POMIAR jest nośny i że rejestr długu jest
      // ZAMKNIĘTY. Bez niego dałoby się dopisać dziesiątą obcą wagę i przejść
      // cicho.
      //
      // WYBRANA REGUŁA JEST WSPÓLNA dla `.eyebrow`, `.nav-label`
      // i `.section-label`, czyli dla CHROMU POWŁOKI — a chrom powłoki leży
      // poza `#main-content`, więc dowodzi przy okazji, że przelotka nie
      // zatrzymuje się na treści. NIE CZYTA JEJ ŻADNA PARA: trzy pary tej mapy
      // czytające `fontWeight` celują w `_sectionHead_ h2`, `_sectionHead_
      // _count_` i `_panelHead_ h2`. Czerwień nie jest więc nadokreślona cudzą
      // asercją.
      //
      // 650 → 655, A NIE 650 → 400, I TO JEST CAŁA RÓŻNICA: łamana jest
      // PRZYNALEŻNOŚĆ DO REJESTRU, nie przynależność do skali. Wartość 400
      // zazieleniłaby te trzy sygnatury i zostawiła WYŁĄCZNIE trzy osierocone
      // wpisy (`TYPE_WEIGHT_UNUSED_ENTRY`), czyli czerwień o zupełnie innej
      // nazwie niż to złamanie.
      //
      // CZERWIEŃ TEGO ZŁAMANIA MA SZEŚĆ WIERSZY, NIE TRZY, i mówimy to tutaj,
      // żeby czytający raport nie wziął połowy z nich za regresję: trzy
      // `TYPE_WEIGHT_UNREGISTERED` na wadze 655 (to jest nazwana czerwień)
      // ORAZ trzy `TYPE_WEIGHT_UNUSED_ENTRY` na `p.eyebrow|650`,
      // `p.nav-label|650` i `p.section-label|650`, bo po tej edycji nikt już
      // nie rysuje 650 pod tymi sygnaturami. Osierocenie zachodzi przy OBU
      // wartościach — różnicą jest to, że 655 dokłada do niego asercję, którą
      // to złamanie NAZYWA. `expectRedContains` jest listą ZAWIERANIA
      // (`break-test.mjs:203-213` odrzuca tylko BRAKI), więc dodatkowe wiersze
      // niczego nie unieważniają.
      //
      // IGŁA SPRAWDZONA NA UNIKALNOŚĆ: sam napis `font-weight: 650;` stoi
      // w `styles.css` DZIEWIĘĆ razy, więc krótsza igła rzuciłaby na
      // wielokrotnym trafieniu; ten siedmiowierszowy blok występuje raz.
      name: "give a shell label an off-scale weight nobody registered: a new divergence has to fail the run the day it lands",
      expectRedContains: ["TYPE_WEIGHT_UNREGISTERED", "655"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.eyebrow,
.nav-label,
.section-label {
  margin: 0;
  color: var(--text-quaternary);
  font-size: var(--text-2xs);
  font-weight: 650;`,
          `.eyebrow,
.nav-label,
.section-label {
  margin: 0;
  color: var(--text-quaternary);
  font-size: var(--text-2xs);
  font-weight: 655;`,
          "the shell label's off-scale weight",
        ),
    },
    {
      // ── FAZA I, PRZYRZĄD P5 — OŚLEPIENIE WŁASNEJ PRZELOTKI ────────────────
      //
      // TRZECIA STRONA TEGO SAMEGO PYTANIA i ten sam kształt, co złamanie
      // oślepiające przelotkę zapadniętej treści: dwa poprzednie łamią
      // PRODUKT, to łamie PRZYRZĄD. Bez niego „46 sygnatur poza skalą" jest
      // nieodróżnialne od „przelotka nie chodzi", bo obie odpowiedzi mają
      // dokładnie ten sam kolor przy zielonej bramce — a „pusta fikstura nie
      // tylko nie mierzy, ona CHOWA" jest w tym repozytorium nazwaną klasą.
      //
      // ŁAMANY JEST ZASIĘG, NIE FILTR, i to jest wybór: podmiana `document.body`
      // na `null` trafia w strażnika na wejściu `sweepTypeWeight`, więc przelot
      // kończy się z ZEREM odczytów zamiast z odczytami o złych wartościach.
      // Zaostrzenie filtra kształtu dałoby liczbę mniejszą, a nie zero, czyli
      // dowodziłoby czegoś, czego ta nazwa nie mówi.
      //
      // CZERWIEŃ JEST TU SZEROKA I TO JEST NIEUNIKNIONE: obok nazwanego
      // `TYPE_WEIGHT_SWEEP_MEASURED_NOTHING` wypada 46 wierszy
      // `TYPE_WEIGHT_UNUSED_ENTRY`, bo rejestr, którego nikt nie spotkał, jest
      // z definicji cały martwy. `expectRedContains` jest listą ZAWIERANIA
      // (`break-test.mjs:203-213`), więc czerwień nazwana jest sprawdzana,
      // a reszta nie unieważnia dowodu.
      //
      // EDYCJA IDZIE W `scripts/`, NIE W PRODUKT, i dlatego przywrócenie jest
      // czyste: ten plik nie przechodzi przez `tsc -b`, więc nie ma `dist`,
      // który mógłby zostać zatruty przywróceniem z backupu.
      name: "blind the type-weight sweep: an empty measurement has to look different from a clean product",
      expectRedContains: ["TYPE_WEIGHT_SWEEP_MEASURED_NOTHING"],
      file: "scripts/verify-renderer-layout.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          "          sweepTypeWeight(document.body, label);",
          "          sweepTypeWeight(null, label);",
          "the type-weight sweep's scope",
        ),
    },
    {
      // ── FAZA II, LOT L1 — SUFIT WRACA DO POWŁOKI ──────────────────────────
      //
      // CO DOKŁADNIE DOWIÓZŁ TEN LOT, wyrażone jako rzecz, którą da się cofnąć:
      // sufit kolumny czytelnej przestał być JEDNĄ liczbą powłoki i stał się
      // wartością, którą deklaruje ekran. Zdjęcie tej jednej deklaracji
      // z korzenia Dzisiaj nie zostawia ekranu bez sufitu — oddaje go z powrotem
      // powłoce, bo `.work-surface` dalej niesie swoje 72rem dla chromu, który
      // ekranem nie jest. Produkt po złamaniu wygląda DOKŁADNIE tak, jak
      // wyglądał przed lotem L1: 1152 px zamiast 1088 px.
      //
      // ZŁAMANIE WARTOŚCIOWE, A NIE ZABICIE PODMIOTU, i to jest wybór, nie
      // wygoda. Selektor pary zostaje nietknięty i dalej trafia w cztery
      // narysowane dzieci, więc czerwień jest WERDYKTEM o liczbie
      // (`observed: 1152px` wobec `expected: 68rem`), a nie `NOT_MEASURED`,
      // czyli awarią przyrządu. Ta różnica jest w tym repozytorium nazwana:
      // złamanie, które kasuje podmiot, dowodzi tylko, że selektor żyje.
      //
      // DLACZEGO DZISIAJ, A NIE SPOTKANIA ANI REKORD. Oba tamte podmioty niosą
      // sufit LITERAŁEM na własnym korzeniu, więc jego zdjęcie zostawia
      // wyliczone „none", a `rem` porównany z „none" wraca NOT_MEASURED
      // (`verify-renderer-layout.mjs`) — czyli znowu awaria przyrządu zamiast
      // werdyktu. Dzisiaj stoi dodatkowo w mapie POWŁOKI (`HARNESS` ląduje na
      // tym ekranie bez kliknięcia), więc dowód nie kosztuje ani jednego kroku
      // trasy.
      //
      // SPRAWDZONE PRZED NAPISANIEM: kotwica jest w tym arkuszu jedyna
      // (`--surface-measure` pada w `today.module.css` dwa razy — raz jako
      // deklaracja korzenia, raz jako konsument w `.capacity` — a czterowierszowy
      // blok z `gap: var(--space-8)` tylko raz), więc `replaceOnce` nie ma
      // drugiego trafienia, na którym mógłby paść.
      name: "give the reading measure back to the shell: Today stops declaring its own ceiling",
      expectRedContains: ["P1-01"],
      file: "packages/desktop-ui/src/today.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  --surface-measure: 68rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-8);`,
          `  display: flex;
  flex-direction: column;
  gap: var(--space-8);`,
          "the Today screen's own reading measure",
        ),
    },
    {
      // ── FAZA II, LOT L10 — PASMO GUBI DZIEŃ TYGODNIA ──────────────────────
      //
      // Wpis 1-7 mówi jedno zdanie: na ekranie, którego cała treść to
      // „dzisiaj", data podaje DZIEŃ TYGODNIA. Element z tym dniem albo jest,
      // albo go nie ma, więc złamaniem jest jego zdjęcie — a napis pasma
      // zostaje pełny („, 14 August 2026"), czyli produkt po złamaniu wygląda
      // dokładnie tak, jak wyglądał przed lotem: bez informacji, którą wpis
      // nazywa.
      //
      // TO JEST ZDJĘCIE PODMIOTU I MIMO TO WERDYKT, NIE AWARIA PRZYRZĄDU —
      // zmierzone, nie założone: przelot na kodzie sprzed tego lotu wrócił dla
      // tej pary `DIFFERS  enforced  observed: 0 rendered element(s)`, bo `count` jest
      // dobrze określony na zerze (`verify-renderer-layout.mjs` robi `continue`
      // przed strażnikiem „zero dopasowań"). Dlatego wolno tu użyć kształtu,
      // który przy `rem` albo `token` byłby `NOT_MEASURED`.
      name: "the Today band drops the weekday from its date",
      expectRedContains: ["L10-01"],
      file: "packages/desktop-ui/src/TodaySurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          "<span data-band-weekday>{band.weekday}</span>",
          "{band.weekday}",
          "the weekday element in the Today band",
        ),
    },
    {
      // ── FAZA II, LOT L10 — ROK BIEŻĄCY WRACA NA KAŻDĄ DATĘ ────────────────
      //
      // Wpis 9-2: rok bieżący jest POMIJANY. Złamanie jest WARTOŚCIOWE, nie
      // kasujące podmiot — element daty zostaje na miejscu i dalej deklaruje
      // gałąź, tylko deklaruje ZŁĄ: notatka z tego roku mówi „Jan 15 2026"
      // zamiast „Jan 15". Czerwień jest więc zdaniem o REGULE, a nie o tym, że
      // selektor żyje.
      //
      // CZERWONA MA BYĆ JEDNA PARA, I TO JEST CELOWANIE, NIE OSZCZĘDNOŚĆ:
      // L10-04 stoi na notatce przypiętej do roku bieżącego, a L10-05 na
      // notatce sprzed roku — druga po złamaniu dalej pasuje, bo „inny rok"
      // jest tu odpowiedzią poprawną. Złamanie, po którym czerwienieją obie,
      // nie umiałoby powiedzieć, którą z dwóch gałęzi zepsuło.
      name: "the day rule forgets which year the reader is standing in",
      expectRedContains: ["L10-04"],
      file: "packages/desktop-ui/src/i18n.ts",
      edit: (text) =>
        replaceOnce(
          text,
          `  days >= -1 && days <= 1
    ? "relative"
    : year === todayYear
      ? "thisYear"
      : "otherYear";`,
          `  days >= -1 && days <= 1 ? "relative" : "otherYear";`,
          "the current-year branch of the day rule",
        ),
    },
    {
      // ── FAZA II, LOT L10 — WCZORAJ PRZESTAJE BYĆ SŁOWEM ───────────────────
      //
      // Wpis 11-6: dzień sąsiedni czyta się słowem. Złamanie zwęża gałąź
      // względną do samego „dzisiaj", więc głowa czytelni wraca do „updated
      // Aug 13" — znowu daty, którą czytelnik musi odjąć od dzisiaj. Znowu
      // złamanie WARTOŚCIOWE: `<time>` stoi, `data-day-form` stoi, mówi tylko
      // „thisYear" tam, gdzie reguła każe mówić „relative".
      //
      // DLACZEGO TO JEST OSOBNE ZŁAMANIE OD POPRZEDNIEGO: trzy gałęzie tej
      // reguły psują się osobno i naprawia je osobna robota. Jedno złamanie na
      // całą funkcję dowodziłoby tylko, że para umie paść na czymkolwiek w tym
      // pliku.
      name: "yesterday stops being a word and goes back to being a date",
      expectRedContains: ["L10-03"],
      file: "packages/desktop-ui/src/i18n.ts",
      edit: (text) =>
        replaceOnce(
          text,
          "  days >= -1 && days <= 1",
          "  days === 0",
          "the relative branch of the day rule",
        ),
    },
    {
      // ── FAZA II, LOT L10 — ZŁAMANIE PO STRONIE SŁÓW, NIE ATRYBUTU ─────────
      //
      // TRZY ZŁAMANIA WYŻEJ STOJĄ PO STRONIE `dayFormFromDays`, czyli po
      // stronie WYBORU GAŁĘZI. Przegląd adwersarialny zmierzył, że to jest
      // cała odporność tego lotu: napis idzie z `formatDayFromDays`, atrybut
      // z `dayFormFromDays`, i podmiana samych SŁÓW wewnątrz gałęzi zostawia
      // atrybut nietknięty. Cztery pary czytające `data-day-form` przechodzą
      // wtedy na zielono nad produktem, który wrócił do „updated Aug 13".
      //
      // TO ZŁAMANIE JEST DOWODEM, ŻE L10-06 CZYTA CO INNEGO NIŻ L10-03. Gałąź
      // względna oddaje datę zamiast słowa; `dayFormFromDays` nie jest ruszone,
      // więc `data-day-form` dalej mówi „relative" i L10-03 zostaje ZIELONA.
      // Czerwona ma być dokładnie jedna para — ta, która czyta tekst.
      name: "the relative branch keeps its name but goes back to printing a date",
      expectRedContains: ["L10-06"],
      file: "packages/desktop-ui/src/i18n.ts",
      edit: (text) =>
        replaceOnce(
          text,
          '      return days === 0 ? "Today" : days === 1 ? "Tomorrow" : "Yesterday";',
          "      return `${day.month} ${day.day}`;",
          "the words of the relative branch",
        ),
    },
    {
      // ══ FAZA II, LOT L4 — CHROM KARTY NA POJEMNIKU LISTY ══════════════════
      //
      // SZEŚĆ ZŁAMAŃ NA JEDEN LOT, I ŻADNE Z NICH NIE JEST ZŁAMANIEM ISTNIENIA
      // PODMIOTU. Pary przyrządu P2 były do tego lotu `pending`, więc jedynym
      // schematem, który dla nich działał, było zabicie podmiotu (`NOT_MEASURED`
      // kładzie przelot niezależnie od statusu). Od chwili, w której lot je
      // oddał i przerzucił na `enforced`, działa schemat MOCNIEJSZY: złamanie
      // WARTOŚCIOWE — podmiot dalej istnieje, dalej jest mierzony, a liczba
      // jest inna. Czerwień jest wtedy zdaniem o produkcie, nie awarią
      // przyrządu.
      //
      // FRAGMENT `expectRedContains` JEST WZIĘTY Z WIERSZA WERDYKTU, NIE
      // Z SAMEGO IDENTYFIKATORA, i to jest poprawka po przeglądzie. Sam
      // `„P2-01a"` stoi w wyjściu KAŻDEGO przelotu, także zielonego: bramka
      // drukuje wiersz raportu dla każdej pary niezależnie od werdyktu
      // (zmierzone na zielonym przelocie — po dwa wystąpienia każdego z tych
      // sześciu identyfikatorów). Warunek „musi stać w wyjściu czerwonego
      // przebiegu" spełniałaby więc DOWOLNA czerwień, także cudza. Kształt
      // `„— P2-01a „"` — myślnik, identyfikator, cudzysłów otwierający —
      // składa się wyłącznie w `verify-renderer-layout.mjs` w trzech miejscach
      // i wszystkie trzy są czerwienią O TEJ PARZE: werdykt powłoki
      // (`${theme} theme — ${pair.id} „${pair.title}"`), werdykt trasowany
      // (`… at ${route} — ${pair.id} „…`) i `VISUAL_LANGUAGE_NOT_MEASURED`.
      // Wiersz raportu jest rozdzielany tabulatorami i tego kształtu nie ma.
      // Sprawdzone przed uruchomieniem harnessu: każdy z siedmiu fragmentów ma
      // ZERO trafień w zapisanym wyjściu zielonego przelotu.
      //
      // ZŁAMANIE PIERWSZE — POJEMNIK TRACI RAMKĘ (P2-01a).
      // Odtwarza stan sprzed lotu dosłownie: wpis 3-1 dokumentu przejścia
      // zmierzył na tej rodzinie ekranów ZBIÓR PUSTY pojemników z ramką albo
      // promieniem, przy 206 zielonych parach całego rejestru. Czerwona ma być
      // dokładnie jedna para: `P2-01b` czyta promień, który tu zostaje, i to
      // jest cały powód, dla którego ramka i promień są czytane OSOBNO.
      name: "the Today list card loses its hairline border again",
      expectRedContains: ["— P2-01a „"],
      file: "packages/desktop-ui/src/today.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-content);
`,
          `  border-radius: var(--radius-md);
  background: var(--surface-content);
`,
          "the Today list card border",
        ),
    },
    {
      // ZŁAMANIE DRUGIE — WIERSZ ZNOWU BIERZE RÓG KARTY (P2-02).
      //
      // DRUGA POŁOWA TEZY PRZYRZĄDU, i bez niej pozycja 1 spełnia się także
      // przy PODWÓJNYM zaokrągleniu, którego prototyp nie ma na żadnym ekranie.
      // Złamanie oddaje wierszowi promień, którego lot go pozbawił, i zostawia
      // chrom pojemnika nietknięty — więc trzy pary pojemnika zostają zielone,
      // a pada dokładnie ta jedna, która mówi „wiersz nie jest kartą".
      name: "the Today row takes the card corner back from the list",
      expectRedContains: ["— P2-02 „"],
      file: "packages/desktop-ui/src/today.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  padding: var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-secondary);
`,
          `  padding: var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
`,
          "the Today row card corner",
        ),
    },
    {
      // ZŁAMANIE TRZECIE — SEPARATOR ROBI SIĘ DWUPIKSELOWY (P2-01d).
      //
      // TO JEST ZŁAMANIE, KTÓRE NIE MIAŁO CZEGO ZAPALIĆ AŻ DO TEGO LOTU, i po
      // to tu stoi. Oba wpisy `NOT_COVERED` przyrządu P2 nazywały tę jedną
      // drogę porażki: wiersz dostaje `border-bottom`, a pojemnik ZOSTAJE
      // z własnym odstępem, więc oko widzi kreskę 2 px przy KOMPLECIE par
      // chromu zielonych. Przed `P2-01d` ani jedna para obu map nie czytała
      // `gap` i to złamanie wróciłoby zielone — czyli byłoby złamaniem
      // udającym uzbrojenie.
      name: "the Today list gets its own gap back and the separator doubles",
      expectRedContains: ["— P2-01d „"],
      file: "packages/desktop-ui/src/today.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.rows,
.meetings {
  display: flex;
  flex-direction: column;
  margin: 0;
`,
          `.rows,
.meetings {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
`,
          "the Today list gap",
        ),
    },
    {
      // ZŁAMANIE CZWARTE — RÓG U GŁOWY KARTY PRZESTAJE BYĆ DOMKNIĘTY (P2-01c).
      //
      // Lista planu na Dzisiaj NIE PRZYCINA, a prototyp przycina i wycina przy
      // tym własny wskaźnik ogniska — rozjazd świadomy, zmierzony po obu
      // stronach i zapisany przy parze. Róg domyka zamiast przycięcia wiersz
      // skrajny, lekarstwem lotu R1 tej samej aplikacji.
      //
      // NAZWA TEGO ZŁAMANIA MÓWI „U GŁOWY", BO TYLE ONO DOWODZI. Lekarstwo to
      // cztery deklaracje w dwóch regułach, a złamanie zdejmuje jedną — tę,
      // którą `P2-01c` czyta. Dowodzi więc uzbrojenia TEGO odczytu, nie całej
      // tezy „róg karty jest domknięty"; drugą regułę bierze złamanie siódme.
      // Wartościowe, nie strukturalne: `<li>` stoi, reguła stoi, brakuje
      // jednej deklaracji.
      name: "the Today card corner stops being cut on the row that meets its head",
      expectRedContains: ["— P2-01c „"],
      file: "packages/desktop-ui/src/today.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.rows > li:first-child {
  border-start-start-radius: var(--radius-md);
  border-start-end-radius: var(--radius-md);
}
`,
          `.rows > li:first-child {
  border-start-end-radius: var(--radius-md);
}
`,
          "the Today card's first-row corner",
        ),
    },
    {
      // ZŁAMANIE SIÓDME — CAŁA DRUGA REGUŁA LEKARSTWA ZNIKA (P2-01e).
      //
      // TO JEST ZŁAMANIE, KTÓRE PRZED NAPRAWĄ LOTU WRACAŁO ZIELONE, i po to tu
      // stoi. Skasowanie reguły `.rows > li:last-child` w całości robi dokładnie
      // tę wadę, dla której lekarstwo istnieje — wypełnienie hover i zaznaczenia
      // ostatniego wiersza wychodzi kwadratowym rogiem za zaokrągloną dolną
      // krawędź karty — a `P2-01c` była na to ślepa Z KONSTRUKCJI: czyta inny
      // selektor i inną własność. Para `P2-01e` czyta tę regułę i pada.
      //
      // ZŁAMANIE STRUKTURALNE, ALE NIE ZABÓJSTWO PODMIOTU: `<li>` dalej istnieje
      // i dalej jest mierzone, znika sama deklaracja promienia. Czerwień jest
      // więc werdyktem o produkcie (`enforced` + DIFFERS), nie
      // `NOT_MEASURED`-em — i fragment werdyktu to sprawdza.
      name: "the Today card foot stops being cut and the whole last-row rule goes",
      expectRedContains: ["— P2-01e „"],
      file: "packages/desktop-ui/src/today.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.rows > li:last-child {
  border-end-start-radius: var(--radius-md);
  border-end-end-radius: var(--radius-md);
}

`,
          "",
          "the Today card's last-row corner rule",
        ),
    },
    {
      // ZŁAMANIE PIĄTE — SKRZYNKA PRZESTAJE PRZYCINAĆ (P2-03c).
      //
      // DRUGI EKRAN RODZINY I ODWROTNY WERDYKT, i to jest cały powód, dla
      // którego to złamanie jest osobne od czterech powyżej. Skrzynka PRZYCINA,
      // bo jej element ogniskowalny stoi 8 px i 12 px w głębi wiersza, więc
      // twarde pierścienie mieszczą się w luzie — zmierzone prawdziwym Tabem
      // w Chromium, oba motywy. Ta sama deklaracja jest tu poprawna, a jedną
      // powierzchnię dalej byłaby regresją dostępności; złamanie dowodzi, że
      // rejestr umie powiedzieć to o KAŻDYM z tych dwóch ekranów osobno.
      name: "the Inbox list card stops clipping its rows to the card corner",
      expectRedContains: ["— P2-03c „"],
      file: "packages/desktop-ui/src/inbox.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  overflow: hidden;
`,
          "",
          "the Inbox list clip",
        ),
    },
    {
      // ZŁAMANIE SZÓSTE — TEN SAM ODSTĘP, DRUGI EKRAN (P2-03d).
      //
      // Bliźniak złamania trzeciego, i NIE jest zbędny: `P2-01d` i `P2-03d`
      // czytają dwa RÓŻNE pojemniki w dwóch RÓŻNYCH mapach, więc odstęp
      // wrócony na jednym ekranie jest niewidoczny dla pary z drugiego.
      // Złamanie, które zapala obie naraz, nie istnieje — reguły są osobne.
      name: "the Inbox list gets its own gap back and the separator doubles",
      expectRedContains: ["— P2-03d „"],
      file: "packages/desktop-ui/src/inbox.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.rows {
  display: flex;
  flex-direction: column;
  margin: 0;
`,
          `.rows {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
`,
          "the Inbox list gap",
        ),
    },
    // ══ LOT L9 (FAZA II) — EKRAN REKORDU ZADANIA ═════════════════════════════
    // Sześć złamań: pięć na to, co lot DOWIÓZŁ (piąte — (f) — dopisane przy
    // naprawie po przeglądzie, razem z parą `L9-01d`), i jedno na parę, której
    // lot świadomie NIE dowiózł. To ostatnie jest tu, bo `L9-03a` jest `pending`, a
    // `pending` + `DIFFERS` jest z definicji ZIELONE — bez złamania nikt nigdy
    // się nie dowie, czy ta para w ogóle patrzy na żywy podmiot.
    {
      // ZŁAMANIE L9 (a) — STATUS WRACA DO GOŁEGO TEKSTU (L9-01a).
      //
      // Zdejmowana jest KRAWĘDŹ, nie tło, bo tego para pyta: `--surface-raised`
      // bywa w motywie jasnym nieodróżnialne od kanwy, więc pudełko poznaje się
      // po kresce. Kontekst edycji sięga aż do `color: var(--text-primary)`, bo
      // trzy linijki wyżej są znak w znak tym samym, co w regule `.chip`
      // dziesięć linijek niżej — `replaceOnce` zgłosiłby dwukrotność.
      name: "the task record's status loses its edge and reads as bare text again",
      expectRedContains: ["— L9-01a „"],
      file: "packages/desktop-ui/src/record/task-record.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text-primary);`,
          `  padding: var(--space-1) var(--space-2);
  background: var(--surface-raised);
  color: var(--text-primary);`,
          "the task record status pill's edge",
        ),
    },
    {
      // ZŁAMANIE L9 (b) — ROZPYCHACZ WRACA MIĘDZY PIGUŁKI (L9-01b).
      //
      // KLASA JEST TU LITERAŁEM, I TO JEST WYBÓR, NIE SKRÓT. `L9-01b` LICZY
      // ELEMENTY (`[class*="_gap_"]`), a nie style, więc dowodem jest sama
      // obecność nośnika. Reguła `.gap` została z arkusza usunięta razem
      // z użyciem, a `entry.file` przyjmuje JEDEN plik — złamanie odtwarzające
      // regułę i użycie musiałoby dotknąć dwóch. Literał daje dokładnie to,
      // czego para zabrania, w jednym pliku i bez martwej reguły w arkuszu.
      name: "the elastic spacer comes back into the task record's metadata row",
      expectRedContains: ["— L9-01b „"],
      file: "packages/desktop-ui/src/record/TaskRecordScreen.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `          {taskProjects.length === 0 ? (`,
          `          <span className="_gap_break_0" />
          {taskProjects.length === 0 ? (`,
          "the task record metadata spacer",
        ),
    },
    {
      // ZŁAMANIE L9 (c) — PIGUŁKI WRACAJĄ NA KAPSUŁĘ (L9-01c).
      //
      // To złamanie odtwarza wadę NAPRAWDĘ WYDANĄ, nie wyobrażoną: `--radius-full`
      // stało w tym arkuszu obok `--radius-sm` w arkuszu rekordu projektu przez
      // całą falę D, i mierzyła to tylko jedna z dwóch stron.
      name: "the task record's chips go back to being capsules, drifting from the project record's",
      expectRedContains: ["— L9-01c „"],
      file: "packages/desktop-ui/src/record/task-record.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text-secondary);`,
          `  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  background: var(--surface-raised);
  color: var(--text-secondary);`,
          "the task record chip radius",
        ),
    },
    {
      // ZŁAMANIE L9 (d) — JEDNA POŁOWA PANELU TRACI GLIF (L9-02a).
      //
      // JEDNA, NIE OBIE, i to jest treść tego złamania: para żąda `atLeast: 2`
      // właśnie po to, żeby połowa zrobiona i połowa zapomniana nie przeszła.
      // Złamanie zdejmujące oba glify dowiodłoby wyłącznie, że para umie paść
      // na zerze — czyli nie dowiodłoby tego, po co ta liczba tam stoi.
      name: "only one half of the plan panel keeps its glyph",
      expectRedContains: ["— L9-02a „"],
      file: "packages/desktop-ui/src/record/TaskRecordScreen.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `              <Icon name="calendar" />
`,
          "",
          "the plan cell's glyph",
        ),
    },
    {
      // ZŁAMANIE L9 (f) — PUSTA PLAKIETKA TRACI GLIF (L9-01d).
      //
      // DOPISANE PRZY NAPRAWIE PO PRZEGLĄDZIE, razem z parą, której dowodzi.
      // Kontekst edycji nie może być samym `<Icon name="project" />`: ten napis
      // stoi w tym pliku DWA RAZY (gałąź pusta i gałąź wypełniona), więc
      // `replaceOnce` zgłosiłby dwukrotność. Kotwicą jest otwarcie gałęzi
      // pustej — `styles.chipDashed` występuje w pliku dokładnie raz.
      name: "the empty project pill loses the glyph the reference gives every pill of the row",
      expectRedContains: ["— L9-01d „"],
      file: "packages/desktop-ui/src/record/TaskRecordScreen.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `            <span className={styles.chipDashed}>
              <Icon name="project" />
              No project`,
          `            <span className={styles.chipDashed}>
              No project`,
          "the empty project pill's glyph",
        ),
    },
    {
      // ZŁAMANIE L9 (e) — PARA `pending` DOSTAJE SWOJĄ CZERWIEŃ (L9-03a).
      //
      // TO JEST JEDYNE ZŁAMANIE W TYM PLIKU, KTÓRE APLIKUJE POPRAWKĘ, A NIE
      // WADĘ — i tak musi być. `L9-03a` jest `pending`, bo jej lekarstwo jest
      // decyzją funkcjonalną (zamknięcie podglądu odbiera rekordowi zadania
      // pięć zdolności, których on nie ma u siebie — patrz komentarz przy
      // parze). `pending` + `DIFFERS` jest zielone, więc jedyną obserwowalną
      // zmianą stanu tej pary jest `MATCH`, a `pending` + `MATCH` to
      // `ROUTED_PENDING_ALREADY_MATCHES`, czyli czerwień.
      //
      // CO TO DOWODZI, POWIEDZIANE WPROST: że selektor `aside.inspector.open`
      // ŻYJE i że przelot naprawdę stoi na otwartym rekordzie zadania — czyli
      // że dzisiejsze „nie pasuje" jest POMIAREM, a nie martwym selektorem.
      // Schemat z `recon-mechanika.md` §3 (złamanie zabija ISTNIENIE podmiotu →
      // NOT_MEASURED) jest tu NIEDOSTĘPNY: para jest typu `count`, a `count`
      // robi `continue` przed strażnikiem zera i nigdy nie wraca NOT_MEASURED.
      name: "the preview panel is guarded on the task record and the pending pair notices",
      expectRedContains: ["ROUTED_PENDING_ALREADY_MATCHES"],
      file: "packages/desktop-ui/src/RealApp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `  const inspectorDetailOpen = Boolean(
    selectedTask ||`,
          `  const inspectorDetailOpen = Boolean(
    (selectedTask &&
      !(surface === "tasks" && activeContext.record === true)) ||`,
          "the missing task-record guard on the preview panel",
        ),
    },
  ]),
});

for (const result of outcome.results)
  console.log(`${result.verdict.toUpperCase()}  ${result.name}`);
for (const result of outcome.failed) console.error(`FAILED: ${result.name}`);
if (!outcome.ok) process.exitCode = 1;
