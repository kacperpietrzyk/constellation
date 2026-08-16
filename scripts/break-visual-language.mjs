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
 * BRAMKA DLA ZŁAMAŃ OGONA FAZY III, KTÓRYCH PODMIOTEM JEST TREŚĆ.
 *
 * Ta sama zasada co przy `CONTRAST_VERIFY`, na innym przyrządzie: siedem
 * pozycji ogona ma oczekiwaną wartość WYPROWADZONĄ Z DANYCH — liczba pozycji
 * narysowanych w szynie, liczba wierszy w sekcji, kształt napisu nad wiekiem,
 * który rośnie z zegara. Bramka układu czyta wyliczone własności CSS i o żadnej
 * z tych rzeczy nie ma zdania, więc puszczone przez nią wróciłyby ZIELONE,
 * a harness zgłosiłby przyrząd zamiast kodu.
 */
const INTERACTION_VERIFY = {
  command: "npm",
  args: ["run", "test:interaction", "-w", "@constellation/desktop-ui"],
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

// FRAGMENT WSPÓLNY DLA DWÓCH ZŁAMAŃ LOTU D2 FAZY III — wiersz stanu sekcji
// „Identity", bajt w bajt z `SettingsSurface.tsx`. Stoi tu RAZ, bo złamanie #2
// go kasuje, a #3 przenosi: dwie kopie tego samego literału rozjechałyby się
// przy pierwszej poprawce copy i jedno z dwóch złamań wróciłoby „nie znalazłem
// czego szukam" pod nazwą wady produktu.
const IDENTITY_STATE_ROW = `                <SectionState
                  says={\`This workspace is called \${snapshot.bootstrap.workspace.name}, and every screen in this window is looking at it.\`}
                  state={
                    name.trim() === snapshot.bootstrap.workspace.name
                      ? "Saved"
                      : "Edited, not saved"
                  }
                  settled={name.trim() === snapshot.bootstrap.workspace.name}
                />
`;

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
      // IGŁA JEST WERDYKTEM, NIE IDENTYFIKATOREM — poprawione przy naprawie
      // lotu nasady Fazy III, tą samą drogą i z tego samego powodu, co przy
      // rodzinie L8 (`:4284-4291`). Stało tu gołe „D2-01a", a przelot drukuje
      // ten napis dla KAŻDEJ pary niezależnie od werdyktu, więc złamanie
      // przechodziło na DOWOLNEJ czerwieni bramki — także takiej, która nie ma
      // z tym nagłówkiem nic wspólnego. Zmierzone na zielonym przebiegu tej
      // naprawy (`scratchpad/base-layout.txt`, wyjście 0): „D2-01a" pada tam
      // 2 razy (dwa wiersze `MATCH`, po jednym na motyw), a „— D2-01a „" ZERO
      // razy. Forma werdyktu pary powłoki to `— ${id} „${title}"`
      // (`verify-renderer-layout.mjs:4998-5001`) i tę samą formę ma
      // `VISUAL_LANGUAGE_NOT_MEASURED` (`:4940`, `:4960`), więc igła w tym
      // kształcie pokrywa OBA kanały czerwieni i nie da się jej spełnić
      // zielenią.
      expectRedContains: ["— D2-01a „"],
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
  flex: none;
  width: 1.125rem;
  height: 1.125rem;`,
          `.help-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
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
      // ── WPIS 10-3, ZŁAMANIE PIERWSZE — ŁAŃCUCH PROWENANCJI WRACA DO WIERSZA
      // (D7-01f, w miejsce skasowanego złamania nad D7-01e).
      //
      // TO ZŁAMANIE ZASTĄPIŁO SWOJEGO POPRZEDNIKA, A NIE STANĘŁO OBOK NIEGO.
      // Poprzednie cofało `flex` kreski łańcucha do reguły bazowej i dowodziło
      // pary `D7-01e`; wpis 10-3 zdjął łańcuch z tego wiersza w całości, więc
      // tamto złamanie nie miałoby czego edytować, a `replaceOnce` rzuciłby na
      // nietrafionej kotwicy. Nowe dowodzi pary, która zajęła jej miejsce.
      //
      // WSTAWIA MOTYW Z POWROTEM, ZAMIAST KASOWAĆ PODMIOT — i to jest jedyny
      // kierunek, jaki tu działa. Para liczy łańcuch w wierszu na ZERO, więc
      // złamaniem jest jego OBECNOŚĆ. Wstawiany kształt jest DOKŁADNIE tym,
      // który stał w wierszu do wpisu 10-3 (trzy plakietki, dwie kreski), więc
      // złamanie odtwarza stan, w którym ekran naprawdę stał, a nie stan
      // wymyślony.
      name: "put the provenance chain back into the upcoming meeting row",
      expectRedContains: ["D7-01f"],
      file: "packages/desktop-ui/src/MeetingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `                {event.attendees.length === 0 ? (`,
          `                <div className="evidence-thread">
                  <span className="evidence-node">Event</span>
                  <i aria-hidden="true" />
                  <span className="evidence-node">Fact brief</span>
                  <i aria-hidden="true" />
                  <span className="evidence-node evidence-node--muted">
                    Jamie result after
                  </span>
                </div>
                {event.attendees.length === 0 ? (`,
          "the head of the room branch in the upcoming row",
        ),
    },
    {
      // ── WPIS 10-3, ZŁAMANIE DRUGIE — WIERSZ ZNOWU LICZY UCZESTNIKÓW,
      // ZAMIAST ICH WYMIENIAĆ (D7-01g).
      //
      // PRZESTAWIONY JEST WARUNEK, A NIE SKASOWANA GAŁĄŹ, i to jest wybór:
      // wiersz po złamaniu rysuje DOSŁOWNIE ten napis, który stał w nim do
      // wpisu 10-3 (`countLabel(event.attendees.length, "participant")`). To
      // nie jest „wiersz bez niczego", tylko wiersz, który mówi „2
      // participants" i wygląda na kompletny — dokładnie ten stan para ma
      // odrzucać. Złamanie kasujące gałąź dowodziłoby tylko tego, że pusty
      // ekran jest pusty.
      //
      // PARA CELUJE PO NAPRAWIE W `.meeting-person-name`, nie w opakowanie,
      // więc to złamanie dowodzi jej nadal — po przestawieniu warunku żaden
      // element imienia się nie rysuje. Złamanie szóste niżej dokłada drugą,
      // ostrzejszą drogę: element zostaje, znika samo słowo.
      name: "count the participants again instead of naming them",
      expectRedContains: ["D7-01g"],
      file: "packages/desktop-ui/src/MeetingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `                {event.attendees.length === 0 ? (
                  <p className="meeting-room-none">
                    The calendar lists nobody for this meeting.
                  </p>
                ) : (`,
          `                {event.attendees.length >= 0 ? (
                  <p className="meeting-room-none">
                    {countLabel(event.attendees.length, "participant")}
                  </p>
                ) : (`,
          "the branch that decides whether the row names the room",
        ),
    },
    {
      // ── WPIS 10-3, ZŁAMANIE TRZECIE — POZYCJA PRZYGOTOWANIA TRACI ŚCIEŻKĘ
      // CELU (D7-01h).
      //
      // ZDEJMOWANA JEST SAMA ŚCIEŻKA — i po naprawie wpisu 10-3 jest to
      // JEDYNE złamanie, które ta para umie zobaczyć, bo pigułki celu na
      // wierszu już nie ma (`recordId` dowodu nie adresuje nazwanego rekordu;
      // wpis `ROUTED_NOT_COVERED` lot D7 pozycja 1). Para mówi dziś „pozycja
      // leży na trzech torach prototypu", a nie „ma wyjście", i to złamanie
      // dowodzi dokładnie tego zdania: wracamy do dwóch ścieżek, czyli do
      // geometrii, którą pozycja miała do wpisu 10-3.
      name: "take the target track off the preparation item",
      expectRedContains: ["D7-01h"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.meeting-prep-item {
  display: grid;
  grid-template-columns: 13rem minmax(0, 1fr) auto;`,
          `.meeting-prep-item {
  display: grid;
  grid-template-columns: 13rem minmax(0, 1fr);`,
          "the track list of the preparation item",
        ),
    },
    {
      // ── WPIS 10-3, ZŁAMANIE CZWARTE — DOSTAWCA WRACA WYŁĄCZNIE DO NAGŁÓWKA
      // SEKCJI (D7-02g).
      //
      // TO ZŁAMANIE MA BLIŹNIAKA, KTÓRY MUSI ZOSTAĆ ZIELONY. Plakietka przy
      // nagłówku sekcji ma własną parę (`D7-03g`) i własne złamanie wyżej;
      // tutaj kasowana jest plakietka WIERSZA, a tamta zostaje nietknięta.
      // Jeśli oba wpisy zapaliłyby się razem, znaczyłoby to, że któraś z par
      // mierzy nie ten podmiot, o którym mówi.
      name: "take the provider badge off the upcoming row and leave it only on the section head",
      expectRedContains: ["D7-02g"],
      file: "packages/desktop-ui/src/MeetingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `                <span className="meeting-locked">
                  <Icon name="lock" />
                  {providerLabel(event.provider)}
                </span>
`,
          ``,
          "the provider badge inside the upcoming row",
        ),
    },
    {
      // ── WPIS 10-3, ZŁAMANIE PIĄTE — PLAKIETKA ZOSTAJE, ZNIKA JEJ SŁOWO
      // (D7-02h).
      //
      // TO JEST ZŁAMANIE, KTÓRE PRZEGLĄD ADWERSARIALNY WYKONAŁ RĘKĄ I NAD
      // KTÓRYM BRAMKA BYŁA ZIELONA. Kasowany jest sam napis dostawcy; nośnik,
      // obwódka i kłódka zostają, więc wiersz WYGLĄDA na kompletny i mówi
      // czytelnikowi zero słów o tym, czyj jest ten wpis. `D7-02g` liczy
      // plakietkę i przechodzi zielona nad tym stanem — i tak ma być, bo ona
      // pyta o nośnik. Czerwień ma zapalić WYŁĄCZNIE `D7-02h`, czyli para,
      // która czyta `textContent`. Gdyby zapaliły się obie, znaczyłoby to, że
      // podział na dwie pary niczego nie rozdzielił.
      name: "silence the provider word and leave the padlock standing",
      expectRedContains: ["D7-02h"],
      file: "packages/desktop-ui/src/MeetingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `                  <Icon name="lock" />
                  {providerLabel(event.provider)}
`,
          `                  <Icon name="lock" />
`,
          "the provider word inside the row badge",
        ),
    },
    {
      // ── WPIS 10-3, ZŁAMANIE SZÓSTE — IMIĘ ZNIKA, A JEGO ELEMENT ZOSTAJE
      // (D7-01g).
      //
      // DRUGIE ZŁAMANIE Z PRZEGLĄDU ADWERSARIALNEGO, I OSTRZEJSZE OD JEGO
      // WŁASNEGO. Adwersarz skasował cały `<span className="meeting-person-name">`
      // i bramka wróciła zielona, bo para stała wtedy na `.meeting-person`,
      // czyli na opakowaniu. Tutaj element ZOSTAJE, a znika sam napis — czyli
      // dokładnie ten stan, którego nie widzi ani liczenie pojemnika, ani
      // liczenie „ile jest elementów w DOM". Para jest czerwona, bo `atLeast`
      // liczy dopasowania NARYSOWANE, a `<span>` bez tekstu ma zerową
      // szerokość (`verify-renderer-layout.mjs:4681-4686`). Bez tego złamania
      // ta droga byłaby przeczytana w kodzie i niesprawdzona.
      name: "empty the attendee name without touching the element that holds it",
      expectRedContains: ["D7-01g"],
      file: "packages/desktop-ui/src/MeetingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `                        <span className="meeting-person-name">
                          {attendee.name}
                        </span>`,
          `                        <span className="meeting-person-name">
                          {""}
                        </span>`,
          "the attendee name inside its own element",
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
      // (`styles.css:2337`), wylicza 1152 px zamiast 1184 i para `enforced`
      // wrzuca WERDYKT (`verify-renderer-layout.mjs:8056-8062`), który idzie do
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
      // (`verify-renderer-layout.mjs:8025-8032`) i kładzie bramkę niezależnie
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
      // (`verify-renderer-layout.mjs:4893-4901` — status jest tam wyłącznie
      // DRUKOWANY, nie sprawdzany), więc złamanie musi ZABIĆ ISTNIENIE
      // PODMIOTU. Ten sam wybór, z tego samego powodu, zrobiło złamanie P1
      // nad Skrzynką.
      //
      // ZABIJANA JEST ROLA, A NIE ATRYBUT WIERSZA, i to jest wybór o
      // najmniejszym koszcie ubocznym. `[data-planned-row]` jest kotwicą progu
      // `rowCounts.todayPlannedRows` (`verify-renderer-layout.mjs:1146-1149`)
      // ORAZ podmiotem czwartej pary tego przyrządu (P2-02), więc skasowanie
      // atrybutu zapaliłoby trzy czerwienie naraz i żadnej nie dałoby się
      // przypisać. `role="listbox"` nie jest czytane przez ŻADNĄ bramkę tego
      // repozytorium — sprawdzone grepem po `scripts/`: jedyne wystąpienie
      // poza parami P2 to komentarz o liście Źródeł
      // (`verify-renderer-layout.mjs:1107`). Wiersze zachowują własne
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
      // (`:4647`), to pada w `routedVisualLanguage` jako `ROUTED_NOT_MEASURED`
      // (`:7554`) — dwa różne przeloty i dwie różne gałęzie kodu. Tylko to
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
    // ── ZŁAMANIE FAZY I / P3 „take the eyebrow out of the Inbox band" STAŁO
    // TU I ZOSTAŁO SKASOWANE PRZEZ LOT L2, a nie przeniesione. Powód jest
    // mechaniczny, nie porządkowy: jego kotwicą był `<div>` z nadtytułem
    // Skrzynki, którego ten lot już nie rysuje, więc `replaceOnce` PADAŁBY przy
    // każdym zbiorczym przebiegu harnessu — i czytałoby się to jak zepsuty
    // harness, a nie jak zamknięta pozycja.
    //
    // CO SIĘ ZE ZŁAMANIEM STAŁO: dowodziło dryfu od kolumny `today` W STRONĘ
    // POPRAWKI (przyrząd ma zauważyć, że lot dowiózł i nie zapisał). Ten dryf
    // JEST dowiedziony — zobaczyliśmy go w przebiegu bramki po samej farbie,
    // pięć razy naraz: `TITLE_BAND_STACK_DRIFT — calendar/inbox/projects/
    // library/settings`, na drzewie, którego tabela jeszcze nie znała. Jego
    // miejsce zajmuje złamanie niżej, o TYM SAMYM podmiocie i przeciwnym
    // kierunku: wraca nadtytuł, a przelot pisze `TITLE_BAND_STACK_DRIFT` —
    // z tego samego powodu, dla którego pisał go wtedy (pomiar rozjeżdża się
    // z kolumną `today`), tylko w drugą stronę.
    {
      // ── FAZA I, PRZYRZĄD P3, ZŁAMANIE DRUGIE — OŚ OTWARCIA TREŚCI ─────────
      // NAGŁÓWEK SEKCJI KALENDARZA UDAJE OTWARCIE EKRANU.
      //
      // Oś 4 ma dziś TRZYNAŚCIE wierszy zgodnych i ZERO trafień `OPENING_2XL`
      // w całej aplikacji, więc złamanie, które psuje produkt, musi przewrócić
      // jednego świadka. Pierwszym NARYSOWANYM nagłówkiem treści Kalendarza
      // jest — zmierzone, nie założone, przelot 2026-08-13 przy 1440×900 —
      // `h2 „Deadline this week or already past…"` o 16 px (słowo poprawione
      // razem z copy we wpisie 2-9 ogona Fazy III — cytat, który przestał być
      // prawdziwy o produkcie, jest w tym repozytorium klasą defektu)
      // (`CalendarSurface.tsx:896-904`, reguła `calendar.module.css:466-503`).
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
      // WAGA ZOSTAJE NIETKNIĘTA ŚWIADOMIE: to osobna oś i osobny lot (L5 Fazy II
      // przepisał ją z 560 na `var(--weight-semibold)`), a złamanie ruszające
      // dwie rzeczy naraz nie mówi, która zapaliła.
      //
      // KOTWICA MUSI WCIĄGNĄĆ `gap` I `margin`: `font-size: var(--text-md)`
      // pada w tym arkuszu dwa razy (`:99`, `:500`), a `font-weight:
      // var(--weight-semibold)` po locie L5 jeszcze częściej; `replaceOnce`
      // rzuca przy dwóch trafieniach. Czterowierszowy blok jest w tym pliku
      // jedyny — sprawdzone maszynowo po przepisaniu wagi.
      name: "let the Calendar section heading open the screen at 2xl: the opening axis loses a witness",
      expectRedContains: ["TITLE_BAND_OPENING_DRIFT — calendar"],
      file: "packages/desktop-ui/src/calendar.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);`,
          `  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);`,
          "the Calendar section heading size",
        ),
    },
    {
      // ── FAZA II, LOT L6 · ZŁAMANIE 1 Z 5 — NATYWNA KONTROLKA WRACA ────────
      //
      // TO ZŁAMANIE ZASTĄPIŁO INNE, I POWÓD JEST WART ZAPISANIA. Stało tu
      // „delete the Tasks search field: a pending count-0 pair starts matching
      // without a delivery" — złamanie Fazy I, którego czerwienią było
      // `ROUTED_PENDING_ALREADY_MATCHES`: para `P4-01b` była wtedy `pending`,
      // a skasowanie pola sprawiało, że nagle PASOWAŁA. Lot L6 oddał tamtą
      // parę, więc jej status jest dziś `enforced` i tamta czerwień nie ma jak
      // powstać; sam napis do podmiany też zniknął razem z polem. Złamanie,
      // którego kotwicy nie ma w źródle, nie jest złamaniem słabym — jest
      // AWARIĄ HARNESSU (`replaceOnce` rzuca), więc zostawienie go tu byłoby
      // zostawieniem czerwieni, która nie mówi nic o produkcie.
      //
      // CO DOWODZI TA WERSJA: że pary `P4-01a/b` mierzą DOSTAWĘ, a nie
      // dzisiejszy przypadek. Wstawiony `<select>` jest jednym elementem
      // w pasie widoku — dokładnie tym, co lot stamtąd zdjął — i licznik
      // `#main-content select` idzie z 0 na 1, więc para `enforced` rzuca
      // werdykt. Bez tego złamania zieleń czterech par `P4-01*`/`P4-02*` byłaby
      // nieodróżnialna od selektora, który przestał trafiać w cokolwiek.
      //
      // WSTAWKA, A NIE KASOWANIE, i to jest wybór: skasowanie czegoś z pasa
      // dowodziłoby, że para reaguje na ZNIKANIE, a ona pilnuje dokładnie
      // odwrotnego kierunku — żeby natywna kontrolka nie WRÓCIŁA. Złamanie ma
      // iść w stronę, w którą naprawdę psuje się produkt.
      name: "put a native select back into the Tasks view band: the delivered count-0 pair stops matching",
      expectRedContains: ["P4-01a", "#main-content select"],
      file: "packages/desktop-ui/src/tasks/TasksSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `        <p aria-live="polite" className={styles.count} role="status">`,
          `        <select id="tasks-broken">
          <option value="a">A</option>
        </select>
        <p aria-live="polite" className={styles.count} role="status">`,
          "the Tasks count line, as the anchor for a native select",
        ),
    },
    {
      // ── FAZA II, LOT L6 · ZŁAMANIE 2 Z 5 — ETYKIETA WRACA NAD PAS ─────────
      //
      // Wpis 4-2 ma DWIE połowy i psują się osobno: „nie ma etykiet" oraz
      // „stan stoi w treści pigułki". To złamanie celuje w pierwszą. Etykieta
      // wstawiona obok pigułki jest dokładnie tym, co pas miał przed lotem —
      // „Group" napisane obok kontrolki zamiast w niej — i para `II6-01a`
      // (`#main-content .view-band label`, count 0) idzie z 0 na 1.
      //
      // BEZ TEGO ZŁAMANIA para `II6-01a` jest nieodróżnialna od selektora,
      // który nie trafia: `.view-band` mogłaby zmienić nazwę klasy, a licznik
      // dalej pokazywałby zero i dalej byłby zielony. To jest ta sama wada, co
      // „pusta fikstura chroni fałszywą asercję" — tylko po stronie selektora.
      name: "label a control in the Tasks view band again: the form-style label count stops being zero",
      expectRedContains: ["II6-01a", ".view-band label"],
      file: "packages/desktop-ui/src/tasks/TaskViewControls.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `    <ChoicePopover
      choices={groupingOptions}`,
          `    <label htmlFor="tasks-group">Group</label>
    <ChoicePopover
      choices={groupingOptions}`,
          "the grouping chip, as the anchor for a returning field label",
        ),
    },
    {
      // ── FAZA II, LOT L6 · ZŁAMANIE 3 Z 5 — PIGUŁKA PRZESTAJE MÓWIĆ STAN ───
      //
      // Druga połowa wpisu 4-2, i to jest połowa, którą najłatwiej zgubić przy
      // porządkach: wyzwalacz dalej jest rysowaną pigułką, dalej otwiera
      // rysowane menu, dalej nie ma obok siebie etykiety — a przestaje mówić,
      // KTÓRE grupowanie jest wybrane. Produkt wygląda wtedy poprawnie
      // i informuje gorzej niż `<select>`, który przynajmniej pokazywał wybraną
      // opcję. Para `II6-01b` czyta `textContent` wyzwalacza i szuka „Group: "
      // Z ODSTĘPEM, więc napis „Group" sam werdykt zapala.
      //
      // ZŁAMANIE NIE RUSZA MENU, tylko treść wyzwalacza — czyli dowodzi, że
      // para pilnuje WIDOCZNEGO STANU, a nie istnienia kontrolki. `II6-01a`
      // zostaje przy tym zielona (etykiet dalej nie ma), więc ten przebieg
      // pokazuje też, że dwie pary jednej pozycji nie zapalają się razem.
      name: "strip the grouping out of the group chip: the pill stops naming the state it carries",
      expectRedContains: ["II6-01b", "Group: "],
      file: "packages/desktop-ui/src/tasks/TaskViewControls.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          '      trigger={`Group: ${groupingOptions.find((candidate) => candidate.value === groupingValue)?.label ?? "None"}`}',
          '      trigger="Group"',
          "the grouping chip's stateful trigger text",
        ),
    },
    {
      // ── FAZA II, LOT L6 · ZŁAMANIE 4 Z 5 — RAMKA FORMULARZA WRACA ─────────
      //
      // Wpis 4-3. Obwódki ~2 px nikt nie narysował: brała się z `<fieldset>`
      // i z klasy `.density`, której w arkuszu modułu NIE BYŁO. To złamanie
      // przywraca element (bez klasy, dokładnie w stanie, w jakim stał), więc
      // przeglądarka znów maluje `border: 2px groove`, a para `II6-02a`
      // (`#main-content fieldset`, count 0) idzie z 0 na 1. Zapala się przy tym
      // także jej świadek `II6-02b` — podmiana zabiera `aria-label="Row height"`
      // razem z `<div>`, więc para obecności spada na 0. Obie czerwienie są
      // o tej samej pozycji i obie są pożądane.
      //
      // DOWODZI TEGO, CZEGO PARA CZYTAJĄCA `borderWidth` DOWIEŚĆ NIE MOŻE:
      // że asercja jest o ELEMENCIE. Para pisana na grubość obwódki byłaby
      // zielona po dopisaniu `border: 0` do `<fieldset>`, czyli po zamknięciu
      // objawu bez zamknięcia jego przyczyny.
      name: "wrap the density switch in a fieldset again: the browser draws its default frame back",
      expectRedContains: ["II6-02a", "#main-content fieldset"],
      file: "packages/desktop-ui/src/tasks/SavedViewManager.tsx",
      // DWIE PODMIANY, BO JSX MUSI SIĘ SKOMPILOWAĆ. Sam otwierający znacznik
      // zostawiłby `<fieldset>` domknięty przez `</div>` i złamanie
      // zdegradowałoby się do „the build refused the broken tree" — czyli do
      // czerwieni, która NIE JEST zdaniem o parze. Zamykający znacznik jest
      // wyszukiwany razem z linią pod nim, bo samo `      </div>` stoi w tym
      // pliku więcej niż raz, a `replaceOnce` żąda jednego trafienia.
      edit: (text) =>
        replaceOnce(
          replaceOnce(
            text,
            '      <div aria-label="Row height" className={styles.density} role="group">',
            '      <fieldset className={styles.density}>\n        <legend className="sr-only">Row height</legend>',
            "the density group, as the anchor for a returning fieldset",
          ),
          `          Compact
        </button>
      </div>`,
          `          Compact
        </button>
      </fieldset>`,
          "the density group's closing tag",
        ),
    },
    {
      // ── FAZA II, LOT L6 · ZŁAMANIE 5 Z 5 — FORMULARZ NIE DOJECHAŁ ─────────
      //
      // TO JEST ZŁAMANIE PRZECIWKO NAJŁATWIEJSZEMU SPOSOBOWI OSZUKANIA TEGO
      // LOTU, i dlatego istnieje. Pary `P4-02a` i `P4-02b` mówią, że na liście
      // Spotkań nie ma już `<select>` ani `<input>` — a to zdanie jest
      // prawdziwe RÓWNIEŻ o produkcie, z którego konfigurację Jamie po prostu
      // skasowano. Wpis 10-1 nie mówił „usuń", mówił „przenieś do Ustawień".
      //
      // Złamanie kasuje pole klucza z Ustawień i nie rusza Spotkań, więc obie
      // pary `P4-02*` zostają ZIELONE, a czerwień przychodzi wyłącznie z pary
      // dodatniej `II6-03` (`#jamie-key`, count 1 → 0). Dokładnie to jest jej
      // tezą: dostawa jest przeprowadzką, nie usunięciem, i bramka umie
      // odróżnić jedno od drugiego.
      name: "delete the Jamie key field from Settings: the moved form turns out to have been dropped",
      expectRedContains: ["II6-03", "#jamie-key"],
      file: "packages/desktop-ui/src/SettingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `                  <input
                    autoComplete="off"
                    id="jamie-key"`,
          `                  <input
                    autoComplete="off"
                    id="jamie-key-removed"`,
          "the Jamie key field in Settings",
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
      // czytające `fontWeight` celują w `_sectionHead_ :is(h2,h3)`,
      // `_sectionHead_ _count_` i `_panelHead_ h2`. Czerwień nie jest więc
      // nadokreślona cudzą asercją.
      //
      // 650 → 655, A NIE 650 → 400, I TO JEST CAŁA RÓŻNICA: łamana jest
      // PRZYNALEŻNOŚĆ DO REJESTRU, nie przynależność do skali. Wartość 400
      // zazieleniłaby te trzy sygnatury i zostawiła WYŁĄCZNIE trzy osierocone
      // wpisy (`TYPE_WEIGHT_UNUSED_ENTRY`), czyli czerwień o zupełnie innej
      // nazwie niż to złamanie.
      //
      // CZERWIEŃ TEGO ZŁAMANIA MIAŁA SZEŚĆ WIERSZY DO LOTU L5 FAZY II, DZIŚ MA
      // TRZY, i to jest różnica, którą tamten lot dowiózł: trzy
      // `TYPE_WEIGHT_UNREGISTERED` na wadze 655 i ANI JEDNEGO
      // `TYPE_WEIGHT_UNUSED_ENTRY`, bo rejestr długu jest pusty i nie ma czego
      // osierocić. `expectRedContains` jest listą ZAWIERANIA
      // (`break-test.mjs:203-213` odrzuca tylko BRAKI), więc ta zmiana liczby
      // wierszy niczego w tym złamaniu nie unieważnia.
      //
      // IGŁA PRZEPISANA RAZEM Z PRODUKTEM: reguła nie niesie już literału 650,
      // tylko `var(--weight-semibold)`. Sam napis `font-weight:
      // var(--weight-semibold);` stoi w `styles.css` wiele razy, więc igłą
      // zostaje CAŁY siedmiowierszowy blok, który występuje raz.
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
  font-weight: var(--weight-semibold);`,
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
      // CZERWIEŃ BYŁA TU SZEROKA I PRZESTAŁA BYĆ PO LOCIE L5 FAZY II: obok
      // nazwanego `TYPE_WEIGHT_SWEEP_MEASURED_NOTHING` wypadało 46 wierszy
      // `TYPE_WEIGHT_UNUSED_ENTRY` (rejestr, którego nikt nie spotkał, jest
      // z definicji cały martwy), a dziś rejestr jest pusty, więc zostaje sama
      // nazwana czerwień. `expectRedContains` jest listą ZAWIERANIA
      // (`break-test.mjs:203-213`), więc dowód jest ten sam w obu stanach.
      //
      // CZEGO TO ZŁAMANIE NIE DOWODZI, i dlatego lot naprawczy dołożył obok
      // niego podłogę: ono zabija przelotkę CAŁKOWICIE, więc dowodzi wyłącznie
      // progu ZERA. Zwężenie zasięgu z `document.body` do treści albo zaostrzenie
      // filtra dałoby odczytów MNIEJ, a nie zero — i do lotu naprawczego nie
      // istniała asercja, która by to zobaczyła. Widzi to teraz
      // `TYPE_WEIGHT_SWEEP_SHRANK` (podłoga `TYPE_WEIGHT_EXPECTED.readingsFloor`).
      // Kolejność `if/else if` w przyrządzie jest zamierzona: przy zerze pada
      // nazwa z tego złamania, nie podłoga, więc ta igła dalej trafia.
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
    // ── FAZA II, LOT L11 (POWŁOKA) — DZIESIĘĆ ZŁAMAŃ ──────────────────────
    //
    // Każde celuje w JEDNĄ parę (albo w jeden test) i każde jest odwróceniem
    // dokładnie tej rzeczy, którą lot dowiózł — nie „zepsuciem powłoki
    // w okolicy". Podział, policzony z tego pliku, a nie z pamięci autora
    // (bo liczba przepisana zamiast odczytanej myli się o jeden, i akurat tu
    // pomyliła się o jeden przy pierwszym zapisie tej noty):
    //   * CZTERY zabijają ISTNIENIE podmiotu — glif kafla, marker tożsamości,
    //     drugi poziom pod Zadaniami — albo je PRZYWRACAJĄ (znacznik zakładki);
    //   * PIĘĆ jest WARTOŚCIOWYCH: element stoi, mierzy się, i mówi albo waży
    //     co innego (rozmiar glifu, napis kafla, treść miejsca na imię, napis
    //     wyszukiwarki, cyfra w mapie skrótów);
    //   * JEDNO nie robi ani jednego, ani drugiego i dlatego jest osobne:
    //     wiersz zapisanego widoku traci CEL. Nic nie znika, nic nie zmienia
    //     wartości — znika tylko to, co się dzieje po kliknięciu, czego żadna
    //     para bramki nie umie zobaczyć.
    //
    // BYŁO ICH SZEŚĆ NA BRAMKĘ + JEDNO WŁASNE. Przegląd adwersarialny
    // pokazał, że dwa z nich nazywały się szerzej, niż sięgała ich edycja
    // („stops naming the reader" kasowało sam ZACZEP), a trzy rzeczy, które
    // lot oddał, nie miały złamania w ogóle: rozmiar glifu, TREŚĆ miejsca na
    // imię i cel wiersza zapisanego widoku. Trzy złamania doszły, dwa zostały
    // przemianowane na to, co naprawdę robią, a każda igła nazywa DOKŁADNY
    // identyfikator pary — `["L11-01"]` trafiało po rozcięciu w L11-01a i
    // L11-01b naraz, czyli dowodziło „któraś z dwóch zauważyła".
    {
      // NAZWA MÓWI, CO EDYCJA ROBI, i po przeglądzie adwersarialnym już nie
      // więcej: kasuje GLIF, a nie „to, że kafel się przełącza" — czego żadna
      // para nie umie zobaczyć. Czerwone są tu OBIE pary pozycji 2: L11-01a
      // nie ma czego policzyć, a L11-01b nie ma czego zmierzyć.
      name: "the workspace tile loses the glyph in its third track",
      expectRedContains: ["L11-01a", "L11-01b"],
      file: "packages/desktop-ui/src/RealApp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `              <Icon name="chevron-right" />
            </button>`,
          `            </button>`,
          "the workspace tile's chevron",
        ),
    },
    {
      // ── ZŁAMANIE WARTOŚCIOWE PO STRONIE ARKUSZA ──────────────────────────
      //
      // Glif stoi, jest narysowany i policzalny — ma tylko rozmiar, którego
      // prototyp nie zna. To jest dokładnie ten rozjazd, który para L11-01
      // CYTOWAŁA na swojej prototypowej stronie („0,75 rem") nad produktem
      // stojącym na 0,85 i którego nie umiała zobaczyć, bo pytała wyłącznie
      // „czy w trzecim torze stoi jedno dziecko". Czerwona ma być DOKŁADNIE
      // JEDNA para: `L11-01b`. `L11-01a` zostaje zielona i to jest dowód, że
      // rozcięcie na dwie pary nie było kosmetyką.
      name: "the workspace chevron goes back to a size the prototype does not have",
      expectRedContains: ["L11-01b"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.workspace-switcher > svg {
  width: 0.75rem;`,
          `.workspace-switcher > svg {
  width: 0.85rem;`,
          "the chevron's size in the sheet",
        ),
    },
    {
      // ZŁAMANIE WARTOŚCIOWE: `<small>` stoi, jest narysowany i mierzalny —
      // mówi tylko z powrotem samą USTERKĘ, bez miejsca. To jest dosłownie
      // napis, który ten kafel niósł w podglądzie deweloperskim przed lotem,
      // i którego żadna para nie widziała.
      name: "the workspace tile goes back to reporting a fault instead of a place",
      expectRedContains: ["L11-02"],
      file: "packages/desktop-ui/src/RealApp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          "  return `${place} · ${state}`;",
          '  return "Data Home needs attention";',
          "the storage line of the workspace tile",
        ),
    },
    {
      // NAZWA BYŁA WIĘKSZA NIŻ EDYCJA. Ta zmiana kasuje ZACZEP, po którym
      // bramka znajduje imię, i zostawia imię narysowane na ekranie —
      // czytelnik jest dalej nazwany. Dowodzi więc istnienia MARKERA, a nie
      // nazwania, i dokładnie tak się teraz nazywa. Złamanie po stronie SŁÓW
      // stoi zaraz niżej i jest osobnym pytaniem.
      name: "the foot of the left column loses the marker that finds the reader's name",
      expectRedContains: ["L11-03a"],
      file: "packages/desktop-ui/src/RealApp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `              <span className="sidebar-foot-who" data-sidebar-identity="true">`,
          `              <span className="sidebar-foot-who">`,
          "the identity marker in the sidebar foot",
        ),
    },
    {
      // ── ZŁAMANIE, KTÓRE PRZEGLĄD ADWERSARIALNY WYKONAŁ NA ŻYWO ────────────
      //
      // Zmienia SAME SŁOWA, nie ruszając ani struktury, ani zaczepu: stopka
      // dalej ma element `[data-sidebar-identity]`, dalej jest narysowany,
      // a w miejscu człowieka stoi zastępnik, którego kontrakt zakazuje po
      // imieniu („no »You«"). Przed rozcięciem pary bramka wracała po tej
      // edycji ZIELONA w OBU motywach — cały lot nie miał ani jednego
      // przyrządu na treść tego miejsca. Czerwona ma być dokładnie `L11-03b`;
      // `L11-03a` zostaje zielona, bo element nadal istnieje.
      name: "the foot of the left column fills the reader's place with a placeholder",
      expectRedContains: ["L11-03b"],
      file: "packages/desktop-ui/src/RealApp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `              <span className="sidebar-foot-who" data-sidebar-identity="true">
                {viewerName}`,
          `              <span className="sidebar-foot-who" data-sidebar-identity="true">
                {"You"}`,
          "the words in the identity slot",
        ),
    },
    {
      // JEDEN LITERAŁ, CZTERY MIEJSCA — i to jest właśnie powód, dla którego
      // napis jest stałą. Złamanie dowodzi obu rzeczy naraz: że para czyta
      // treść etykiety, i że cztery drogi do tej obietnicy mają jedno źródło.
      name: "the search control goes back to promising only a search",
      expectRedContains: ["L11-04"],
      file: "packages/desktop-ui/src/RealApp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `const SEARCH_CONTROL_LABEL = "Search and run…";`,
          `const SEARCH_CONTROL_LABEL = "Search";`,
          "the search control's promise",
        ),
    },
    {
      // ZŁAMANIE PRZEZ PRZYWRÓCENIE, nie przez skasowanie — bo para L11-05
      // mówi „tego tu nie ma". Element wraca bez reguły arkusza, i to nie
      // osłabia dowodu: para liczy DOPASOWANIA, także niewidoczne, dokładnie
      // po to, żeby element przeniesiony pod `display: none` nie przechodził
      // jako skasowany.
      name: "the tab gets its meaningless ring back before the title",
      expectRedContains: ["L11-05"],
      file: "packages/desktop-ui/src/RealApp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `                  <span>{tab.label}</span>`,
          `                  <span className="shell-tab-kind" aria-hidden="true" />
                  <span>{tab.label}</span>`,
          "the tab kind marker",
        ),
    },
    {
      // ── FAZA II, LOT L11 — SIÓDME ZŁAMANIE, INNY PRZYRZĄD ─────────────────
      //
      // JEDYNE ZŁAMANIE TEGO LOTU, KTÓREGO BRAMKA UKŁADU NIE ZOBACZY, i dlatego
      // niesie WŁASNY `verify`. Mapa skrótów nie jest wyliczoną własnością CSS
      // — przeglądarka nie ma z niej czego odczytać — więc pilnuje jej
      // `assert.deepEqual` nad CAŁYM zbiorem `[id, shortcut]` w
      // `packages/desktop-preload/test/client.test.ts`. Ten test chodzi
      // w `npm run check`, czyli na trzech systemach, i kosztuje sekundy
      // zamiast trzech przelotów przeglądarki.
      //
      // ZŁAMANIE ODTWARZA DOKŁADNIE TEN STAN, KTÓRY LOT ZASTAŁ: Meetings wraca
      // na dziewiątkę. Poprzednia asercja (unikalność i zasięg [1..9]) byłaby
      // po tym ZIELONA — dziewiątka jest unikalna i mieści się w zasięgu — i to
      // jest cały powód, dla którego rozjazd z prototypem przeżył w tym
      // rejestrze dwie fale.
      name: "the shortcut map drifts from the prototype again at 8",
      // „meetings", NIE „shortcut": zmierzone przez uruchomienie tego złamania
      // na miejscu — w wyjściu `assert.deepEqual` słowo „shortcut" nie pada ANI
      // RAZU (diff pokazuje pary `[id, cyfra]`), a „meetings" trzy razy. Igła
      // dobrana z wydruku, nie z nazwy pola.
      expectRedContains: ["meetings"],
      verify: {
        command: "node",
        args: ["--test", "packages/desktop-preload/dist/test/client.test.js"],
      },
      file: "packages/desktop-preload/src/surface-registry.ts",
      edit: (text) =>
        replaceOnce(
          text,
          `    id: "meetings",
    label: "Meetings",
    icon: "meetings",
    group: "Knowledge",
    shortcut: 8,`,
          `    id: "meetings",
    label: "Meetings",
    icon: "meetings",
    group: "Knowledge",
    shortcut: 9,`,
          "the Meetings shortcut in the surface registry",
        ),
    },
    {
      // GAŁĄŹ, NIE DANE: fikstura dalej niesie zapisany widok, a drugi poziom
      // pod Zadaniami znika, bo nikt go nie rysuje. Para na dzieciach Projektów
      // (`L1-02`) zostaje przy tym ZIELONA — projekt dalej rysuje swoją gałąź
      // — i to jest dowód, że nowa para pyta o Zadania, a nie o „drugi poziom
      // gdziekolwiek".
      name: "Tasks loses its second level in the navigation tree",
      expectRedContains: ["L11-06"],
      file: "packages/desktop-ui/src/RealApp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `                          : item.id === "tasks" && !railMode`,
          `                          : item.id === "tasks" && railMode`,
          "the Tasks branch of the second navigation level",
        ),
    },
    {
      // ── DZIEWIĄTE ZŁAMANIE, DRUGI PRZYRZĄD Z WŁASNYM `verify` ────────────
      //
      // WIERSZ ZOSTAJE, TRACI TYLKO CEL. Pojemnik drugiego poziomu stoi,
      // wiersze stoją, nazwa widoku stoi na wierszu — a kliknięcie prowadzi na
      // goły cel „Tasks", czyli na „All work". `L11-06` liczy POJEMNIK, więc
      // zostaje ZIELONA i to jest cała treść tego złamania: bramka układu nie
      // ma jak zobaczyć afordancji bez celu, a kontrakt lotu żąda wprost, żeby
      // wiersze „actually OPEN what they name".
      //
      // WŁASNY `verify`, bo dowód jest zachowaniem po KLIKNIĘCIU, a przelot
      // powłoki nie klika ani razu. Igła jest zdaniem asercji, nie nazwą pola:
      // test czeka na grupy widoku po polu i pada z komunikatem o wierszu,
      // który nie otworzył tego, co nazywa.
      name: "the saved-view row in the navigation becomes an affordance with no target",
      expectRedContains: ["never opened the view it names"],
      verify: { command: "npm", args: ["run", "test:interaction"] },
      file: "packages/desktop-ui/src/RealApp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `                {...navHandlers(tasksSavedViewContext(view.id))}`,
          `                {...navHandlers(destinationContext("tasks", "Tasks"))}`,
          "the target of a saved-view row",
        ),
    },
    // ── LOT L2: CZTERY ZŁAMANIA NA TO, CO TEN LOT DOWIÓZŁ ─────────────────
    //
    // Trzy osie spisu pasma tytułu dostają z tego lotu własne złamanie — skład
    // (oś 3, przestawiona z „pending" na „enforced"), wysokość pasma (oś 5,
    // nowa i uzbrojona) i to, co pasmo niesie (oś 6, nowa; przy naprawie po
    // przeglądzie adwersarialnym zeszła na „pending", bo trasa rekordu zadania
    // okazała się rozjazdem). Oś bez złamania jest zdaniem, o którym wiadomo
    // wyłącznie, że jest dziś zielone. Oś 6 dostaje DWA: ma dwie flagi mierzone
    // dwoma różnymi zdaniami o tekście i jedna zielona nie mówi nic o drugiej.
    //
    // WSZYSTKIE CZTERY NAZYWAJĄ CZERWIEŃ Z RODZINY `_DRIFT`, NIE `_DIVERGED`,
    // i to jest poprawka po przeglądzie adwersarialnym: poprzednio nazywały
    // `_DIVERGED` i ŻADNE z nich nie mogło wrócić czerwienią, którą nazywa.
    // Mechanika, przeczytana w `title-band-action.mjs`
    // (`titleBandVerdictThrows = !predicted || (armed && divergent)`) i w obu
    // gałęziach napisu w `verify-renderer-layout.mjs`: `predicted` znaczy
    // „pomiar zgadza się z kolumną `today` tabeli". Złamanie produktu rusza
    // POMIAR, a nie tabelę, więc `predicted` robi się `false` i przelot pisze
    // `_DRIFT`. `_DIVERGED` pada w sytuacji ODWROTNEJ — pomiar zgodny
    // z tabelą, a tabela rozjechana z prototypem — czyli po złamaniu TABELI,
    // nie produktu. Ten sam autor użył tego poprawnie o dwa złamania wyżej
    // (oś otwarcia: `TITLE_BAND_OPENING_DRIFT — calendar`).
    //
    // CO Z TEGO WYNIKA DLA UZBROJENIA: `_DRIFT` pada niezależnie od `armed`,
    // więc te cztery złamania dowodzą, że osie MIERZĄ, a nie że są uzbrojone.
    // Uzbrojenie każdej z nich jest przypięte osobno, w
    // `title-band-action.test.mjs` („what each L2 axis does with a divergence
    // it predicted comes from its own status"), i tamten test czyta STAŁE
    // `TITLE_BAND_*_ARMED`, więc przestawienie statusu go przewraca.
    {
      // ZŁAMANIE — SKRZYNKA DOSTAJE NADTYTUŁ Z POWROTEM.
      //
      // Dokładnie ta wada, którą ten lot zdjął: `<p class="eyebrow">` nad
      // `<h1>`, oba w jednym `<div>`, czyli pasmo policzone na jeden wiersz
      // rysujące dwa. Tabela mówi ONE_ROW, pomiar powie STACKED — pomiar
      // rozjeżdża się z tabelą, więc przelot pisze `TITLE_BAND_STACK_DRIFT`
      // i robi to niezależnie od uzbrojenia osi (powód przy nagłówku bloku).
      //
      // DLACZEGO SKRZYNKA, a nie któryś z czterech pozostałych oddanych ekranów:
      // Skrzynka jest NIEOSIĄGALNA dla mapy powłoki (przelot par nie klika ani
      // razu) i nie ma żadnej pary w mapie trasowanej, więc czerwień może
      // przyjść WYŁĄCZNIE z tej osi — żadna para jej nie podrobi.
      name: "the Inbox band gets its eyebrow back: the stack axis loses its delivery",
      expectRedContains: ["TITLE_BAND_STACK_DRIFT — inbox"],
      file: "packages/desktop-ui/src/InboxSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `        <h1 id="surface-title" tabIndex={-1}>
          Inbox
        </h1>`,
          `        <div>
          <p className="eyebrow">Signals and captures</p>
          <h1 id="surface-title" tabIndex={-1}>
            Inbox
          </h1>
        </div>`,
          "the Inbox band's title",
        ),
    },
    {
      // ZŁAMANIE — BIBLIOTEKA WRACA DO WŁASNEGO PASMA.
      //
      // Jedna klasa mniej i pasmo Biblioteki przestaje być pasmem powłoki:
      // wraca do własnej wysokości (zmierzone przed tym lotem: 60 px przy 40 px
      // na dziewięciu innych ekranach), bo `min-height`, kreska i rozkład idą
      // z reguły `.surface-header`, której ten nagłówek już nie nosi. Oś 5
      // czyta wtedy `OWN_HEAD` tam, gdzie tabela mówi `SHELL_BAND`.
      //
      // TO JEST ZŁAMANIE NA REGULE, NIE NA LICZBIE: nie zmienia ani jednego
      // piksela w żadnym arkuszu, tylko zabiera deklarację przynależności.
      // Dokładnie o to ta oś pyta.
      name: "the Library band stops being the shell's band: the height axis loses its delivery",
      // NAZWA WIERSZA ZMIENIŁA SIĘ W LOCIE D3 — `library` rozwinął się na
      // trzy cele, a pasmo dalej jest JEDNO, więc to złamanie zapala oś
      // wysokości na wszystkich trzech naraz. Oczekiwanie nazywa Notatki,
      // bo jeden ekran wystarczy, żeby złamanie było czerwone, a trzy
      // nazwy w tym polu wiązałyby je z liczbą ekranów wiedzy.
      expectRedContains: ["TITLE_BAND_HEIGHT_DRIFT — notes"],
      file: "packages/desktop-ui/src/library/LibraryShell.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          "<header className={`surface-header ${styles.header}`}>",
          "<header className={styles.header}>",
          "the Library band's shared class",
        ),
    },
    {
      // ZŁAMANIE — KONTROLKA WYSZUKIWANIA GUBI SKRÓT.
      //
      // Przycisk ZOSTAJE, jego etykieta ZOSTAJE, znika sam glif skrótu — i oś 6
      // ma zgasnąć flagę `SEARCH`, bo mierzy SŁOWA kontrolki, a nie jej
      // obecność. To jest jedyne złamanie w tym pliku, które sprawdza, czy
      // przyrząd czyta tekst: gdyby oś pytała „czy w paśmie jest przycisk",
      // wróciłaby zielona nad pasmem, które obiecuje wyszukiwanie bez
      // powiedzenia, czym się je otwiera — a prototyp pisze tam `kbd: "⌘K"`
      // wprost (`v3/screens/knowledge.js:803`).
      //
      // I DOKŁADNIE TO SIĘ STAŁO. Do przeglądu adwersarialnego oś czytała
      // `leadText(node) + aria-label`, a `LibraryShell.tsx` wpisuje w
      // `aria-label` całe „Search notes and records (⌘K)" — więc to złamanie
      // wracało ZIELONE na złamanym produkcie, czyli najgorszy z możliwych
      // wyników dla złamania. Naprawione po stronie osi, nie po stronie
      // produktu: `aria-label` ma tam stać (jest jedynym nośnikiem obietnicy
      // w stanie zwiniętym), tylko nie jest ODPOWIEDZIĄ na pytanie tej osi.
      name: "the Library search control drops its shortcut: the carries axis stops reading words",
      expectRedContains: ["TITLE_BAND_CARRIES_DRIFT — notes"],
      file: "packages/desktop-ui/src/library/LibraryShell.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `            <span className={styles.searchHint}>{modifierLabel}K</span>
`,
          "",
          "the shortcut glyph in the Library band",
        ),
    },
    {
      // ZŁAMANIE — TRASA REKORDU PRZESTAJE NAZYWAĆ REKORD.
      //
      // Pasmo zostaje, odnośnik do kolekcji zostaje, znika CZŁON MÓWIĄCY, GDZIE
      // JESTEŚ — czyli wraca dokładnie to, co apka miała przed tym lotem:
      // „‹ Tasks" i nic o rekordzie (wpis 12-2 rejestru przejścia). Trasa spada
      // wtedy do JEDNEGO członu, a jeden człon nie jest trasą, więc oś 6 czyta
      // `NAME_ONLY`/`NO_TRAIL` tam, gdzie tabela mówi `TRAIL`/`TRAIL_2_TITLE`.
      //
      // WERDYKT MUSI PRZYJŚĆ Z EKRANU REKORDU ZADANIA, i dlatego złamanie
      // celuje w `TaskRecordScreen`: to jedyny z trzech rekordów, którego
      // prototyp ma i którego trasa jest w prototypie trzyczłonowa
      // (`v3/screens/record.js:556-562`).
      name: "the task record's trail stops naming the record: the carries axis loses the trail",
      expectRedContains: ["TITLE_BAND_CARRIES_DRIFT — tasks/record:task"],
      file: "packages/desktop-ui/src/record/TaskRecordScreen.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `        <span aria-hidden="true" className={screen.crumbSeparator}>
          ›
        </span>
        <span className={screen.crumbCurrent}>{task.title}</span>
`,
          "",
          "the current crumb of the task record",
        ),
    },
    // ── ZŁAMANIE USUNIĘTE PRZEZ LOT NAPRAWCZY L5, I POWODEM JEST POMIAR ──────
    //
    // Stało tu „put the shell label's paid-off weight back at 650: a debt that
    // was cleared stops being a licence". Nazwa obiecywała dowód, którego ten
    // harness wydać NIE MOŻE. Teza brzmiała „pada wartość, którą rejestr KIEDYŚ
    // licencjonował", czyli była twierdzeniem o PRZESZŁYM stanie tablicy —
    // a przyrząd widzi wyłącznie dzisiejsze drzewo. Zmierzone wprost:
    // `classifyTypeWeight` nad pustym rejestrem oddaje `{verdict:"violation"}`
    // dla 650 i dla 655 IDENTYCZNIE, więc czerwień pod tą nazwą nie odróżnia
    // „dług spłacony" od „wartość nigdy niewidziana".
    //
    // Złamanie edytowało DOKŁADNIE ten sam siedmiowierszowy blok
    // `.eyebrow/.nav-label/.section-label`, co istniejące „655" wyżej,
    // asertowało tę samą nazwę `TYPE_WEIGHT_UNREGISTERED` i różniło się jedną
    // cyfrą — czyli kosztowało 15-18 minut harnessu za dowód, który już stoi
    // obok. Blok jest dalej pokryty: kotwicą złamania „655" jest ta sama
    // deklaracja `font-weight: var(--weight-semibold);` w tym bloku, więc
    // cofnięcie reguły do literału wywraca tamto złamanie na braku igły.
    {
      // ── FAZA II, LOT L5 — PASMO TYTUŁU REKORDU ZACZYNA RZUCAĆ ─────────────
      //
      // DRUGA POŁOWA DOSTAWY, I JEST TO INNY PRZYRZĄD NIŻ WYŻEJ. Ramię wagi
      // w `judgeRecordTitleBand` (`verify-renderer-layout.mjs`) do tego lotu
      // MELDOWAŁO — `TYPE_WEIGHT_BAND.armed` czyta status par `P5-01a`/`P5-01b`,
      // a te stały „pending: LOT L5". Lot przerzucił obie na „enforced", więc
      // obca waga na TYTULE rekordu jest od teraz werdyktem, a nie wierszem
      // raportu.
      //
      // ŁAMANY JEST TYTUŁ SZANSY, NIE ZADANIA, I TO JEST WYBÓR: rozmiar tytułu
      // Szansy zgadzał się z prototypem od zawsze (`--text-xl`), więc ramię
      // ROZMIARU nad tym ekranem milczy i czerwień, która wypada, może przyjść
      // WYŁĄCZNIE z ramienia wagi. Na Zadaniu obie osie mówiłyby naraz i dowód
      // byłby nadokreślony.
      //
      // CZERWIEŃ MA TRZY ŹRÓDŁA I WSZYSTKIE TRZY SĄ TĄ SAMĄ DOSTAWĄ: werdykt
      // pasma, `TYPE_WEIGHT_UNREGISTERED` (620 nie ma już wpisu) i para
      // `P5-01b`, która jest dziś `enforced`, więc jej DIFFERS jest czerwienią.
      // IGŁA CZERWIENI CELUJE W RAMIĘ PASMA, NIE W PRZELOTKĘ, i to jest wybór:
      // `TYPE_WEIGHT_UNREGISTERED` napisze o tej samej wadze zdanie „draws at
      // weight 620 ON …", a ramię pasma „draws at weight 620, WHICH IS NOT one
      // of the …". Sprawdzany jest ten drugi napis plus fraza o dostawie L5,
      // która stoi WYŁĄCZNIE w werdykcie pasma — inaczej to złamanie byłoby
      // zaliczone przez czerwień, której nie nazywa.
      name: "the opportunity record title goes back to 620: the record-title band's weight arm has to throw, not report",
      expectRedContains: [
        "draws at weight 620, which is not one of the",
        "delivered by lot L5 of phase II",
      ],
      file: "packages/desktop-ui/src/opportunity/opportunity-record.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  overflow-wrap: anywhere;
  text-wrap: balance;`,
          `  font-size: var(--text-xl);
  font-weight: 620;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  overflow-wrap: anywhere;
  text-wrap: balance;`,
          "the opportunity record title's weight",
        ),
    },
    {
      // ── FAZA II, LOT L5 — PRZEŁĄCZNIK DOSTAWY JEST NOŚNY ──────────────────
      //
      // TRZECIA STRONA, I ŁAMIE PRZYRZĄD, A NIE PRODUKT. Dwa złamania wyżej
      // cofają farbę; to cofa samą DEKLARACJĘ DOSTAWY i pyta, czy bramka umie
      // powiedzieć, że produkt jest czysty, a właściciel wciąż udaje, że nie.
      // Bez niego dałoby się przepisać wszystkie 92 deklaracje, zostawić pary
      // na „pending" i mieć zielony przebieg z wyłączonym ramieniem wagi —
      // czyli dowieźć farbę i po cichu zdjąć pomiar.
      //
      // DWIE NAZWANE CZERWIENIE NARAZ, i to nie jest hałas, tylko dwie różne
      // asercje o tym samym: `ROUTED_PENDING_ALREADY_MATCHES` mówi „para
      // pasuje, a status kłamie", a `TYPE_WEIGHT_PENDING_ALREADY_CLEAN` mówi
      // „nie ma czego spłacać, a pozycja stoi otwarta". Pierwsza pilnuje MAPY
      // PAR, druga PRZELOTKI WAG — dwa przyrządy, jeden przełącznik.
      // Sprawdzana jest ta druga, bo to ona należy do P5.
      //
      // NAZWA PIERWSZEJ POPRAWIONA PRZEZ LOT NAPRAWCZY: stało tu
      // `VISUAL_LANGUAGE_PENDING_ALREADY_MATCHES`, czyli ramię MAPY POWŁOKI.
      // `P5-01b` leży w mapie TRASOWANEJ (`VISUAL_LANGUAGE_ROUTED_PAIRS`), więc
      // pada wariant trasowany. Złamanie działało mimo błędu, bo
      // `expectRedContains` sprawdza wyłącznie nazwę drugiej asercji — myliła
      // się proza, nie dowód, i dlatego nie znalazł tego żaden przebieg.
      name: "leave the type-weight position pending over a clean product: a status that cannot fail is not a measurement",
      expectRedContains: ["TYPE_WEIGHT_PENDING_ALREADY_CLEAN"],
      file: "scripts/visual-language-pairs.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `    expect: { kind: "token", token: "--weight-semibold" },
    // Jak wyżej — dowiezione przez lot L5 Fazy II. OBIE muszą stać
    // „enforced" razem: \`TYPE_WEIGHT_OWNER.pairs\` wymienia je obie
    // i \`typeWeightBandDelivery()\` uzbraja pasmo dopiero, gdy KAŻDA z nich
    // jest „enforced" — jedna przerzucona zostawiłaby werdykt raportowany.
    status: "enforced",`,
          `    expect: { kind: "token", token: "--weight-semibold" },
    status: "pending: LOT L5",`,
          "the delivery switch of the type-weight position",
        ),
    },
    {
      // ZŁAMANIE — ZNAK ROZWINIĘCIA WRACA PRZED ETYKIETĘ (L8-01…L8-04).
      //
      // Wpis P-15. Złamaniem jest PRZENIESIENIE WARSTWY, nie skasowanie znaku:
      // po tej edycji szewron dalej się rysuje, dalej obraca się przy
      // `aria-expanded` i dalej ma tę samą geometrię — stoi tylko z powrotem
      // PRZED słowem, czyli dokładnie tam, gdzie stał do 2026-08-15 na
      // wszystkich dwudziestu trzech wyzwalaczach dymka.
      //
      // CZERWIENIĄ SĄ WSZYSTKIE CZTERY PARY NARAZ, i to jest własność tego
      // przyrządu, nie niedbałość złamania: `readValue` oddaje `PSEUDO_ABSENT`
      // dla warstwy, której `content` wyliczyło się na `none`, więc zniknięcie
      // `::after` zabiera podmiot każdej z nich. Osobność par pokazują trzy
      // złamania NIŻEJ, z których każde zostawia warstwę na miejscu i rusza
      // dokładnie jedną deklarację.
      //
      // TRZY HUNKI, A NIE JEDEN, I TO JEST POPRAWKA PO PRZEGLĄDZIE
      // ADWERSARIALNYM. Pierwsza wersja tego złamania cofała SAM ZNAK i
      // zostawiała wyciszenie akcji głównej na `::after` — czyli w stanie,
      // w którym nic już nie wycisza. Zmierzone sondą w jednej sesji
      // przeglądarki (`scratchpad/nap8-probe-actionslot.mjs`, 1092×900, pismo
      // 300 %): akcja główna pasma Biblioteki odzyskiwała wtedy szewron
      // i przelot dostawał TRZY dodatkowe czerwienie spoza tego wpisu —
      // `div._actionSlot overflows its own box by 19 / 19 / 11 px`, co do
      // piksela tyle, ile stało w przebiegu „przed" tego lotu. Ten sam pomiar
      // na stanie HEAD bajt w bajt (znak ORAZ wyciszenie na `::before`) daje
      // zero przepełnień. Złamanie cofa więc CAŁY wpis, żeby jedyną czerwienią
      // były cztery pary, które ono nazywa; sprzężenie znacznika z wyciszeniem
      // ma własne złamanie niżej.
      name: "the popover mark goes back in front of the label: twenty-three triggers point sideways again",
      // IGŁA MUSI BYĆ WERDYKTEM, A NIE SAMYM `id`, i to też jest poprawka po
      // przeglądzie. `classifyBreakOutcome` szuka fragmentu w CAŁYM wyjściu
      // (`break-test.mjs:203-213`), a raport przelotu drukuje wiersz z `id` dla
      // KAŻDEJ pary niezależnie od werdyktu (`verify-renderer-layout.mjs
      // :8012-8015`). Zmierzone na zielonym przebiegu (`scratchpad/
      // gate-final.txt`): napis „L8-01" pada tam 2 razy, a „— L8-01 „" ZERO
      // razy. Forma trasowanego werdyktu to `— ${id} „${title}"`
      // (`:8035-8040`) i tę samą formę ma `ROUTED_NOT_MEASURED` (`:8004`),
      // więc igła w tym kształcie pokrywa OBA kanały czerwieni i nie da się
      // jej spełnić zielenią.
      expectRedContains: ["— L8-01 „", "— L8-02 „", "— L8-03 „", "— L8-04 „"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          replaceOnce(
            text,
            `.inline-popover-trigger::after {
  content: "";
  display: inline-block;
  width: 0.32em;
  height: 0.32em;
  margin-left: 0.25rem;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(-0.2em) rotate(45deg);
  transition: transform var(--duration-fast) var(--ease-out);
}

.inline-popover-trigger[aria-expanded="true"]::after {
  transform: translateY(-0.02em) rotate(225deg);
}`,
            `.inline-popover-trigger::before {
  content: "";
  display: inline-block;
  width: 0.32em;
  height: 0.32em;
  margin-right: 0.5em;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(-0.14em) rotate(-45deg);
  transition: transform var(--duration-fast) var(--ease-out);
}

.inline-popover-trigger[aria-expanded="true"]::before {
  transform: translateY(-0.2em) rotate(45deg);
}`,
            "the layer the popover's disclosure mark is drawn on",
          ),
          `.inline-popover-trigger.primary-button::after {
  content: none;
}`,
          `.inline-popover-trigger.primary-button::before {
  content: none;
}`,
          "the layer the primary action's silencer points at",
        ),
    },
    {
      // ZŁAMANIE — WYCISZENIE ZOSTAJE NA STAREJ WARSTWIE, ZNAK NIE.
      //
      // Nie mierzy żadnej pary L8 i celowo: mierzy SPRZĘŻENIE, o którym
      // arkusz mówi prozą („`::before` zostawione tutaj nie wyciszyłoby
      // niczego i akcja główna pasma Biblioteki odzyskałaby szewron po
      // cichu"), a którego do przeglądu adwersarialnego lotu L8 nie pilnowało
      // NIC. Zdanie w komentarzu, którego żaden przyrząd nie umie obalić,
      // przeżyje każdego, kto pamięta, dlaczego je napisano.
      //
      // JEDNOWIERSZOWA EDYCJA I JEDNO ŹRÓDŁO CZERWIENI. Znak zostaje na
      // `::after`, więc CZTERY pary L8 zostają ZIELONE — zmierzone sondą:
      // wyzwalacz w paśmie okruchów rekordu projektu nie ma klasy
      // `primary-button` i nic się na nim nie zmienia. Czerwień przychodzi
      // z zamiatania przepełnień przy 300 % pisma: 12 px na czytelni notatek
      // i 5 px na źródłach (`scratchpad/nap8-probe-2.mjs`, stan
      // „WYCISZENIE zostawione na ::before").
      name: "the primary action's silencer is left on the layer the mark just left",
      expectRedContains: ["descendant div._actionSlot overflows its own box"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.inline-popover-trigger.primary-button::after {
  content: none;
}`,
          `.inline-popover-trigger.primary-button::before {
  content: none;
}`,
          "the layer the primary action's silencer points at",
        ),
    },
    {
      // ZŁAMANIE — ZNAK ZOSTAJE ZA ETYKIETĄ I POKAZUJE W BOK (L8-01).
      //
      // Druga połowa wpisu P-15, i istnieje osobno, bo psuje się osobno.
      // Rejestr skarży się na DWIE rzeczy naraz („przed etykietą" ORAZ
      // „wskazuje w bok"), a poprawka, która przenosi znak za słowo i zostawia
      // go obróconym w bok, oddaje połowę wpisu. Para, która pyta wyłącznie
      // o istnienie `::after`, byłaby nad taką połową ZIELONA — dlatego L8-01
      // czyta podmacierz obrotu, a nie samą obecność warstwy.
      //
      // KOTWICĄ JEST `margin-left`, NIE SAM `transform`, i to nie jest ozdoba
      // napisu: identyczny wiersz `transform: translateY(-0.2em) rotate(45deg);`
      // stoi w tym arkuszu DRUGI RAZ — na otwartym `<details>`
      // (`.support-report-details[open] > summary::before`), czyli pod
      // zwijaczem sekcji, którego ten lot świadomie nie ruszył. `replaceOnce`
      // pada przy wielokrotnym trafieniu, więc bez kotwicy to złamanie nie
      // wykonałoby się wcale.
      //
      // L8-02, L8-03 I L8-04 ZOSTAJĄ ZIELONE, i to jest treść tego złamania:
      // przerwa, krawędzie i wymiar się nie zmieniają, więc raport pokazuje
      // JEDNĄ czerwoną parę z czterech i dowodzi, że pary mierzą cztery różne
      // deklaracje.
      name: "the popover mark keeps its place and turns sideways: half of P-15 comes back and only one pair notices",
      // Werdykt, nie sam `id` — powód przy złamaniu wyżej. Tu igła jest
      // WĘŻSZA niż tam i to jest treść tego złamania: `L8-02`, `L8-03`
      // i `L8-04` zostają zielone, bo przerwa, krawędzie i wymiar się nie
      // ruszają. Czego ta igła NIE UMIE powiedzieć: „a tamte trzy zostały
      // zielone". Sprawdzone w kodzie, nie założone — `classifyBreakOutcome`
      // (`break-test.mjs:203-213`) zna wyłącznie `expectRedContains`, czyli
      // fragmenty, które MAJĄ paść; pola na fragment, który ma być NIEOBECNY,
      // ten harness nie ma. Dodanie go jest zmianą we wspólnym harnessie
      // wołanym przez wszystkie loty i nie należy do naprawy jednego wpisu.
      expectRedContains: ["— L8-01 „"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  margin-left: 0.25rem;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(-0.2em) rotate(45deg);`,
          `  margin-left: 0.25rem;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(-0.14em) rotate(-45deg);`,
          "the direction the popover's disclosure mark points",
        ),
    },
    {
      // ZŁAMANIE — ZNAK ZOSTAJE ZA ETYKIETĄ, OBRACA SIĘ TAK SAMO I POKAZUJE
      // W GÓRĘ (L8-03).
      //
      // To jest dziura, którą pierwsza wersja tego lotu zostawiła otwartą,
      // wypisana wprost przez przegląd adwersarialny i POTWIERDZONA POMIAREM
      // na żywym podmiocie (`scratchpad/nap8-probe-2.mjs`): po tej edycji
      // `transform` wraca BAJT W BAJT ten sam
      // (`matrix(0.707107, 0.707107, -0.707107, 0.707107, 0, -2.6)`),
      // `marginLeft` się nie rusza, a glif jest obrócony o 180° i pokazuje
      // W GÓRĘ. Trzy pary z czterech zostają wtedy ZIELONE nad znakiem, który
      // mówi coś przeciwnego niż jego własny tytuł.
      //
      // DLATEGO `L8-03` CZYTA `borderStyle`, A NIE `borderWidth`: zmierzone,
      // że skrót szerokości wraca jako „0px 1px 1px 0px" — deklarowane 1,5 px
      // zaokrągla się do piksela urządzenia — więc asercja na nim byłaby
      // asercją o DPR maszyny. `borderStyle` jest bezwymiarowy.
      name: "the popover mark points up: the same rotation with the ink moved to the other two edges",
      expectRedContains: ["— L8-03 „"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  margin-left: 0.25rem;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;`,
          `  margin-left: 0.25rem;
  border-left: 1.5px solid currentColor;
  border-top: 1.5px solid currentColor;`,
          "which two edges of the popover's disclosure mark carry ink",
        ),
    },
    {
      // ZŁAMANIE — ZNAK GAŚNIE W MIEJSCU (L8-04).
      //
      // Najtańsza połowa tej samej dziury: `width: 0` zabiera glif z ekranu
      // i zostawia `transform`, `marginLeft` oraz `borderStyle` mówiące
      // dokładnie to, co dziś. Zmierzone tą samą sondą — `width` spada
      // 4.15625px → 0px, pozostałe trzy odczyty nie drgają — więc bez `L8-04`
      // trzy pary byłyby zielone nad kontrolką bez wskaźnika rozwinięcia.
      //
      // KOTWICĄ JEST `margin-left`, jak w złamaniach wyżej i z tego samego
      // powodu: goła para `width: 0.32em; height: 0.32em;` stoi w tym arkuszu
      // dwa razy — drugi raz pod zwijaczem sekcji `<details>`, którego ten lot
      // świadomie nie ruszył — a `replaceOnce` pada przy wielokrotnym
      // trafieniu.
      name: "the popover mark is switched off in place: zero width with every other declaration intact",
      expectRedContains: ["— L8-04 „"],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `  width: 0.32em;
  height: 0.32em;
  margin-left: 0.25rem;`,
          `  width: 0;
  height: 0.32em;
  margin-left: 0.25rem;`,
          "the body of the popover's disclosure mark",
        ),
    },
    // ── LOT L7: PIĘĆ ZŁAMAŃ NA TO, CO TEN LOT DOWIÓZŁ ─────────────────────
    //
    // Lot zbiegł SIEDEMNAŚCIE afordancji pomocy w CZTERECH formach do jednej
    // reguły `.help-mark`, dołożył pięć plakietek tam, gdzie prototyp je ma,
    // a aplikacja nie miała, i zdjął jedyną deklarację, która plakietkę
    // przestawiała. Trzy pierwsze złamania mierzy BRAMKA UKŁADU (kształt,
    // położenie, istnienie podmiotu), dwa ostatnie muszą podać SWÓJ przyrząd
    // — i to jest treść, nie oszczędność: bramka układu czyta WYLICZONE
    // WŁASNOŚCI, więc etykieta wracająca z „?" na całe pytanie NIE RUSZA
    // ani jednej z nich (`.help-mark` deklaruje `width: 1.125rem` wprost, więc
    // pudełko zostaje osiemnastopikselowe nad dowolnie długim napisem). Oś
    // „co jest narysowane w środku znaku" należy do kontraktu tras w jsdom
    // i tylko on może ją zobaczyć.
    {
      // ZŁAMANIE PIERWSZE — POMOC WRACA DO PODKREŚLONEGO ZDANIA.
      //
      // Odtwarza dokładnie tę deklarację, którą lot skasował z modułu
      // `TopicHelp`: kropkowane podkreślenie było JEDYNĄ rzeczą, która
      // odróżniała formę słowną od znacznika, i wraca bez ruszania rozmiaru.
      // Para na szerokości byłaby nad tym ZIELONA — dlatego pozycja 1 ma dwie
      // pary, a nie jedną.
      name: "help takes its dotted underline back: the mark reads as a link in prose again",
      // IGŁA JEST WERDYKTEM, NIE SAMYM `id`, I TO JEST POPRAWKA PO PRZEGLĄDZIE
      // ODBIORCZYM — dokładnie ta sama, którą lot L8 zrobił 200 linii wyżej
      // w tym pliku. `classifyBreakOutcome` szuka fragmentu w CAŁYM wyjściu
      // (`break-test.mjs:203-213`), a przelot drukuje wiersz raportu z `id`
      // dla KAŻDEJ pary niezależnie od werdyktu — wywołanie `report()` stoi
      // NAD gałęzią `if (judged.state === "MATCH")` (`verify-renderer-layout
      // .mjs:4879-4882` w powłoce, `:8017-8020` w trasie). Igła „L7-01b" była
      // więc spełniona przez DOWOLNĄ czerwień w przebiegu i nie mówiła nic
      // o parze, którą nazywa.
      //
      // ZMIERZONE DWUSTRONNIE na dwóch zapisanych przelotach tego lotu, a nie
      // wywnioskowane. W ZIELONYM (`scratchpad/L7-gate-po3.txt`, ostatnia
      // linia `GATE_EXIT=0`): „L7-01b" pada 2×, „— L7-01b „" ZERO razy.
      // W CZERWONYM (`scratchpad/L7-gate-po.txt`, `GATE_EXIT=1`, para wróciła
      // wtedy DIFFERS/NOT_MEASURED z kotwicy przed przepięciem): „L7-01b"
      // pada 4×, a „— L7-01b „" 2× — po jednym na motyw. Ta sama forma
      // `— ${id} „${title}"` niesie OBA kanały czerwieni w OBU mapach:
      // werdykt enforced (`:4888-4893` powłoka, `:8035-8040` trasa) oraz
      // `NOT_MEASURED` (`:4872-4876` powłoka, `:7990-7995` i `:8004` trasa),
      // co widać w czerwonym pliku na wierszu 1170:
      // „VISUAL_LANGUAGE_NOT_MEASURED (dark) — L7-01a „on-demand help is
      // a mark…". Zielenią nie da się jej spełnić.
      expectRedContains: ["— L7-01b „"],
      file: "packages/desktop-ui/src/help/topic-help.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.trigger.trigger::before,
.trigger.trigger::after {
  content: none;
}`,
          `.trigger.trigger {
  text-decoration: underline;
  text-decoration-style: dotted;
}

.trigger.trigger::before,
.trigger.trigger::after {
  content: none;
}`,
          "the help trigger's own sheet",
        ),
    },
    {
      // ZŁAMANIE DRUGIE — WYWOŁANIE ZNOWU PRZESTAWIA PLAKIETKĘ (wpis 5-4).
      //
      // `2rem`, A NIE `auto`, I POWÓD JEST O PRZYRZĄDZIE, NIE O WIERNOŚCI.
      // Wadą w kodzie było `margin-inline-start: auto`, ale wartość WYLICZONA
      // marginesu `auto` w rzędzie flex jest rozdzieloną wolną przestrzenią,
      // a ILE jej tam jest, NIE ZOSTAŁO ZMIERZONE — przy zerowej wolnej
      // przestrzeni `auto` wyliczyłoby się do `0px` i to złamanie wróciłoby
      // ZIELONE nad żywym rozjazdem. Złamanie, które MOŻE być zielone, nie
      // jest złamaniem. Liczba jawna dowodzi tej samej reguły („żadne
      // wywołanie nie przestawia tej plakietki") i dowodzi jej na pewno.
      name: "a call site pushes the help mark away from the label it stands beside",
      // Igła w kształcie werdyktu z tego samego powodu i z tym samym pomiarem
      // co przy złamaniu pierwszym; tu jest to werdykt TRASOWANY
      // (`— ${id} „${title}"`, `verify-renderer-layout.mjs:8475-8481`), a więc
      // ta sama forma. W zielonym przelocie „L7-04a" pada 2×, „— L7-04a „"
      // ZERO razy (`scratchpad/L7-gate-po3.txt`).
      expectRedContains: ["— L7-04a „"],
      file: "packages/desktop-ui/src/projects/project-list.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.groupCount {
  color: var(--text-tertiary);`,
          `.groupHead :global(.help-mark) {
  margin-inline-start: 2rem;
}

.groupCount {
  color: var(--text-tertiary);`,
          "the Projects group head sheet",
        ),
    },
    {
      // ZŁAMANIE TRZECIE — PLAKIETKA PRZESTAJE SIĘ PRZEDSTAWIAĆ.
      //
      // Zabija ISTNIENIE PODMIOTU, a nie jego wartość, i to jest jedyny
      // schemat, który dowodzi, że deklaracja `data-help-topic` naprawdę
      // niesie pomiar: bez atrybutu selektory par trafiają w ZERO elementów,
      // co daje `NOT_MEASURED`, czyli czerwień. Dowodzi przy okazji tego
      // samego o parze D3-01b, która stoi na tym atrybucie od lotu D3.
      name: "the help mark stops declaring itself, so every assertion over it goes quiet",
      // IGŁA MÓWI TERAZ, ŻE TO ZŁAMANIE JEST NADOKREŚLONE — bo jest, i to
      // była druga połowa uwagi z przeglądu. `TopicHelp.tsx` jest WSPÓLNY dla
      // szesnastu montaży, więc zdjęcie z niego atrybutu zabija podmiot par
      // L7 ORAZ pary D3-01b z lotu D3, która stoi na tym samym atrybucie
      // w czytelni Biblioteki. Igła „L7-02b" nie odróżniała tej czerwieni od
      // czerwieni złamania pierwszego ani drugiego; para z DRUGIEGO LOTU
      // odróżnia ją od obu, bo żadne z tamtych dwóch jej nie rusza — jedno
      // wraca do arkusza modułu, drugie do arkusza Projektów.
      // Forma werdyktu i pomiar dwustronny — jak przy złamaniu pierwszym
      // („L7-02b" 2× w zielonym przelocie, „— L7-02b „" zero razy).
      expectRedContains: ["— L7-02b „", "— D3-01b „"],
      file: "packages/desktop-ui/src/help/TopicHelp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `<span className={styles.help} data-help-topic={id}>`,
          `<span className={styles.help}>`,
          "the help anchor's own declaration",
        ),
    },
    {
      // ZŁAMANIE CZWARTE, PIERWSZY WŁASNY `verify` TEGO LOTU — ETYKIETĄ ZNOWU
      // JEST CAŁE PYTANIE.
      //
      // To jest DOKŁADNIE stan sprzed lotu, odtworzony jedną linią, i bramka
      // układu jest nad nim ZIELONA: `.help-mark` deklaruje `width: 1.125rem`
      // i `border-radius: var(--radius-full)` wprost, więc pudełko zostaje
      // okrągłe i osiemnastopikselowe, choćby wylewało się z niego zdanie.
      // Zobaczyć to może wyłącznie przyrząd pytający, CO JEST W ŚRODKU znaku
      // — a takiego przyrządu przed tym lotem nie było i to jest zapisane
      // w rejestrze jako `greenWrong` wpisu, który ten lot zamyka.
      name: "the help trigger draws the whole question again instead of the one mark",
      expectRedContains: ["instead of the one-character mark"],
      verify: { command: "npm", args: ["run", "test:interaction"] },
      file: "packages/desktop-ui/src/help/TopicHelp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `        label="?"`,
          `        label={topic.question}`,
          "the help trigger's visible label",
        ),
    },
    {
      // ZŁAMANIE PIĄTE, DRUGI WŁASNY `verify` — ZMIERZONA ŚLEPOTA WRACA.
      //
      // Odtwarza CO DO KSZTAŁTU kontrolkę, która stała na Projektach przez
      // cztery wydania: okrągły „?" w `<span aria-hidden="true">`, z nazwą,
      // bez `onClick`, bez tematu i bez `aria-haspopup`. Kotwica `TopicHelp`
      // ZOSTAJE obok, więc pierwsza asercja kontraktu (zbiór tematów w obie
      // strony) jest nad tym złamaniem ZIELONA — czerwień może dać wyłącznie
      // nowe zamiatanie po widocznym znaku.
      //
      // `aria-hidden` W ŚRODKU JEST CZĘŚCIĄ ZŁAMANIA, NIE OZDOBĄ: zamiatanie
      // liczące nazwę dostępną zobaczyłoby tu PUSTY napis i przeszłoby obok,
      // czyli powtórzyłoby tę samą ślepotę. Dlatego oracle czyta surowy
      // `textContent`, a nie nazwę — powód stoi przy funkcji `visibleText`.
      name: "a second round question mark reaches a screen without declaring itself as help",
      expectRedContains: ["stands outside any [data-help-topic] anchor"],
      verify: { command: "npm", args: ["run", "test:interaction"] },
      file: "packages/desktop-ui/src/projects/ProjectListLayout.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `          {position === 0 && <TopicHelp topic="project-health" />}`,
          `          {position === 0 && <TopicHelp topic="project-health" />}
          {position === 0 && (
            <button aria-label="How health is worked out" type="button">
              <span aria-hidden="true">?</span>
            </button>
          )}`,
          "the Projects group head",
        ),
    },
    {
      // ── LOT L3, ZŁAMANIE PIERWSZE — POWITANIE PRZESTAJE BYĆ NAGŁÓWKIEM ──
      //
      // Element ZOSTAJE, jego klasa zostaje, jego 28 px zostaje, jego słowa
      // zostają. Zmienia się jedna rzecz: `<h2>` staje się `<p>`. Ekran
      // wygląda wtedy identycznie na zrzucie i nie ma go jak odróżnić okiem —
      // a oś czwarta ma zaczerwienieć, bo pyta o PIERWSZY NAGŁÓWEK w treści,
      // nie o pierwszy duży napis. To jest cała różnica między otwarciem,
      // które czytnik ekranu wymieni w spisie, a napisem, który dla niego nie
      // istnieje.
      //
      // Po złamaniu pierwszym nagłówkiem poza pasmem zostaje `h3#today-meetings`
      // („In the calendar", 13 px), czyli dokładnie ten stan, w jakim ten ekran
      // był przed tym lotem — a tabela mówi już `OPENING_2XL`, więc werdykt
      // przychodzi ramieniem DRYFU, nie ramieniem uzbrojenia.
      //
      // TO ZŁAMANIE MA OD LOTU NASADY FAZY III DRUGĄ CZERWIEŃ, PRZEWIDZIANĄ
      // I NIEURUCHOMIONĄ: bez powitania treść zaczyna się od `h3`, a pierwszym
      // szczeblem jest `h1` pasma, więc oś konspektu dopisze
      // `HEADING_OUTLINE_SKIPPED_RUNG — today`. `expectRedContains` jest listą
      // ZAWIERANIA (`break-test.mjs` odrzuca wyłącznie BRAKI), więc dodatkowy
      // wiersz niczego tu nie unieważnia. Zapisane bez przelotu harnessu —
      // wynika z reguły, nie z pomiaru, i tak trzeba to czytać.
      name: "Today's greeting stops being a heading: the same 28px words, no longer an opening",
      expectRedContains: ["TITLE_BAND_OPENING_DRIFT — today"],
      file: "packages/desktop-ui/src/TodaySurface.tsx",
      edit: (text) => {
        const opened = replaceOnce(
          text,
          `      <h2
        className={styles.greeting}`,
          `      <p
        className={styles.greeting}`,
          "the greeting's element",
        );
        return replaceOnce(
          opened,
          `        {greeting}
      </h2>`,
          `        {greeting}
      </p>`,
          "the greeting's closing tag",
        );
      },
    },
    {
      // ── LOT L3, ZŁAMANIE DRUGIE — TYTUŁ TYGODNIA GUBI JEDEN STOPIEŃ ─────
      //
      // Nagłówek zostaje nagłówkiem, zostaje pierwszy w treści, zostaje na
      // swoim miejscu i dalej mówi, który tydzień. Schodzi o JEDEN stopień
      // skali: `--text-2xl` → `--text-xl`, czyli 28 px → 22 px. Różnica jest
      // na zrzucie prawie niewidoczna i to jest sedno tego złamania —
      // przyrząd, który pyta „czy jest duży nagłówek", przechodzi je, a ten
      // ma paść, bo porównuje z tokenem ROZWIĄZANYM W TEJ SAMEJ STRONIE.
      //
      // DRUGA POŁOWA DOWODU: gdyby oś trzymała wpisane 28 px zamiast sondy
      // `--text-2xl`, to złamanie byłoby nieodróżnialne od przeskalowania
      // pisma na 200% — a tam 28 px to nie jest 28 px.
      name: "the Calendar's week title drops a step of the scale: 2xl becomes xl and nothing else changes",
      expectRedContains: ["TITLE_BAND_OPENING_DRIFT — calendar"],
      file: "packages/desktop-ui/src/calendar.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.weekTitle {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--text-2xl);`,
          `.weekTitle {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--text-xl);`,
          "the week title's step",
        ),
    },
    {
      // ── LOT L3, ZŁAMANIE TRZECIE — I JEST JEDYNYM, KTÓRE MIERZY SAMO
      //    UZBROJENIE, a nie farbę pod nim.
      //
      // Dwa złamania wyżej przychodzą ramieniem DRYFU, które działało już
      // wtedy, gdy oś stała na „pending" — czyli dowodzą, że podmiot żyje, ale
      // NIE dowodzą, że przełącznik tego lotu cokolwiek zmienił. Ramię
      // uzbrojenia zapala się przy `predicted && divergent`, a tego nie da się
      // wywołać jedną edycją farby: trzeba ekranu, na którym pomiar ZGADZA SIĘ
      // z tabelą, a tabela NIE ZGADZA SIĘ z prototypem.
      //
      // Zadania są tym ekranem za jedną wartość: mierzone `NO_OPENING`, tabela
      // `NO_OPENING`, prototyp `NOT_2XL`. Przepisanie kolumny PROTOTYPU na
      // `OPENING_2XL` mówi więc „prototyp otwiera ten ekran dużym tytułem,
      // a my nie" — zdanie tej samej postaci, co dwa prawdziwe rozjazdy, które
      // ten lot właśnie zamknął. Przed uzbrojeniem ta sama edycja dawała
      // WYŁĄCZNIE wiersz w raporcie i bramkę zieloną; po uzbrojeniu ma
      // rzucić.
      //
      // ŚWIADOMIE ŁAMIE TEŻ `scripts/title-band-action.test.mjs` (asercja
      // „prototyp otwiera dokładnie dwa ekrany"), ale to złamanie weryfikuje
      // się bramką układu, a nie testami jednostkowymi, więc czerwień przyjdzie
      // z osi — i tak ma być: obie rzeczy pilnują tej samej liczby.
      name: "the prototype column claims a twelfth screen opens at 2xl: the newly armed axis has to throw where it used to report",
      expectRedContains: ["TITLE_BAND_OPENING_DIVERGED — tasks"],
      file: "scripts/title-band-action.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          // KOTWICA JEST ZDANIEM WŁASNYM WIERSZA ZADAŃ, nie samą nazwą pola:
          // `prototypeOpening: "NOT_2XL"` stoi w tym pliku dwanaście razy,
          // a komentarz „PRZELOT #1 POPRAWIŁ TĘ KOLUMNĘ" — trzy. Słowo
          // „sześciokrotny" pada RAZ, w komentarzu należącym do Zadań, więc
          // `replaceOnce` nie ma gdzie trafić obok.
          `    // opakowania — to jest świadek tej osi, sześciokrotny.
    todayStack: "ONE_ROW",
    prototypeOpening: "NOT_2XL",`,
          `    // opakowania — to jest świadek tej osi, sześciokrotny.
    todayStack: "ONE_ROW",
    prototypeOpening: "OPENING_2XL",`,
          "the prototype's opening column on Tasks",
        ),
    },
    {
      // ── LOT NASADY FAZY III — OŚ KONSPEKTU MUSI PAŚĆ NAD ZEREM PIKSELI ────
      //
      // CO DOKŁADNIE JEST TU ŁAMANE: trzy nagłówki sekcji Dzisiaj wracają na
      // szczebel powitania. Nic więcej. Ani jednej deklaracji, ani jednego
      // tokena, ani jednego `id`, ani jednej klasy — sam znacznik.
      //
      // DLACZEGO TO JEST JEDYNE UCZCIWE ZŁAMANIE TEJ OSI. Wada, którą oś
      // nazywa, była wadą RANGI PRZY POPRAWNEJ FARBIE: nagłówek stał 13 px
      // wagą 600 dokładnie tak, jak chce prototyp, i był przy tym rodzeństwem
      // swojego rodzica. Złamanie, które przy okazji rusza piksele,
      // odtwarzałoby INNĄ wadę i dowodziło INNEJ osi. Dlatego reguła farby
      // w `today.module.css` wymienia oba szczeble (`.sectionHead h2,
      // .sectionHead h3`), a pary D2-01a/b czytają `:is(h2,h3)` — powód
      // stoi przy obu, a tutaj stoi jego skutek: po tej edycji ekran wygląda
      // PIKSEL W PIKSEL tak samo.
      //
      // I TO JEST ASERTOWANE, NIE OBIECANE. `expectRedContains` żąda obok
      // czerwieni konspektu DWÓCH wierszy `MATCH` z par czytających stopień
      // i wagę tego samego nagłówka. Gdyby złamanie ruszyło farbę, te dwie
      // pary wróciłyby `DIFFERS` albo `NOT_MEASURED` i harness by je odrzucił
      // jako BRAK żądanego fragmentu — czyli „bez zmiany piksela" jest tu
      // warunkiem przejścia złamania, a nie zdaniem w komentarzu.
      //
      // ŻADEN INNY PRZYRZĄD NIE MA PRAWA TU ZAPALIĆ, i to jest teza całego
      // pliku `heading-outline.mjs`: oś 4 dalej mierzy `OPENING_2XL` (powitanie
      // jest nietknięte, wciąż pierwsze, wciąż 28 px), `heading-typography`
      // czyta arkusz, którego ta edycja nie dotyka, a 281 par nie czyta ani
      // jednej nazwy znacznika. Przyrząd, którego złamanie widzi ktoś inny,
      // nie udowodnił, że jest potrzebny.
      name: "Today's section heads climb back to the greeting's rung: three h3 become h2 and not one pixel moves",
      expectRedContains: [
        "HEADING_OUTLINE_FLAT — today",
        // OBIE PARY FARBY ZOSTAJĄ ZIELONE POD CZERWIENIĄ RANGI — dowód
        // pikselowej obojętności tej edycji, czytany z wyjścia bramki.
        "D2-01a\tMATCH",
        "D2-01b\tMATCH",
      ],
      file: "packages/desktop-ui/src/TodaySurface.tsx",
      edit: (text) => {
        const meetings = replaceOnce(
          text,
          `          <h3 id="today-meetings">In the calendar</h3>`,
          `          <h2 id="today-meetings">In the calendar</h2>`,
          "the meetings section head",
        );
        const planned = replaceOnce(
          meetings,
          `          <h3 id="today-planned">
            Planned for today{" "}
            <span className={styles.count}>{planned.length}</span>
          </h3>`,
          `          <h2 id="today-planned">
            Planned for today{" "}
            <span className={styles.count}>{planned.length}</span>
          </h2>`,
          "the planned section head",
        );
        return replaceOnce(
          planned,
          `          <h3 id="today-approaching">
            Deadline approaching, nobody planned it{" "}
            <span className={styles.count}>{approaching.length}</span>
          </h3>`,
          `          <h2 id="today-approaching">
            Deadline approaching, nobody planned it{" "}
            <span className={styles.count}>{approaching.length}</span>
          </h2>`,
          "the approaching section head",
        );
      },
    },
    {
      // ── LOT D2 FAZY III · ZŁAMANIE 1 — SPIS USTAWIEŃ WRACA DO OTWIERANIA
      //    SIĘ OD MASZYNY ────────────────────────────────────────────────────
      //
      // CO JEST ŁAMANE: kategoria `appearance` wraca z początku listy na jej
      // koniec, czyli dokładnie tam, gdzie stała do wpisu 13-2. Nic więcej —
      // ani jednej nazwy grupy, ani jednego glifu, ani jednej sekcji. Grup dalej
      // jest TRZY i dalej nazywają się tak samo, więc `D5-02a` (`count equals
      // 3`) zostaje zielona: to jest właśnie ta para, która przez całą Fazę II
      // stała nad odwróconym spisem i nie miała o nim nic do powiedzenia.
      //
      // DLACZEGO OBIE NOWE PARY MUSZĄ ZAPALIĆ, a nie jedna. Przy trzech grupach
      // o unikalnych nazwach przeniesienie skrajnej pozycji zmienia OBA końce
      // („You" → „What the app runs on" na przodzie, „This workspace" → „You"
      // na końcu). Gdyby czerwień przyszła tylko z jednego końca, znaczyłoby to,
      // że drugi świadek stoi nad czymś innym, niż deklaruje.
      name: "the settings list opens with the machine again: Appearance goes back to the end of the dictionary",
      expectRedContains: [
        "FIII2-02a „the settings list opens with the human",
        "FIII2-02b „and closes with the workspace it is configuring",
      ],
      file: "packages/desktop-ui/src/settings-categories.ts",
      edit: (text) => {
        const lifted = replaceOnce(
          text,
          `  { id: "appearance", label: "Appearance", group: "You", icon: "panel" },
  {
    id: "access",`,
          `  {
    id: "access",`,
          "the Appearance entry at the head of the dictionary",
        );
        return replaceOnce(
          lifted,
          `  { id: "notes", label: "Notes", group: "This workspace", icon: "documents" },
] as const satisfies readonly {`,
          `  { id: "notes", label: "Notes", group: "This workspace", icon: "documents" },
  { id: "appearance", label: "Appearance", group: "You", icon: "panel" },
] as const satisfies readonly {`,
          "the tail of the dictionary",
        );
      },
    },
    {
      // ── LOT D2 FAZY III · ZŁAMANIE 2 — JEDNA SEKCJA ZNOWU OTWIERA SIĘ POLEM ─
      //
      // CO JEST ŁAMANE: z sekcji „Identity" znika wiersz stanu. Sekcja wraca do
      // kształtu sprzed decyzji D2 — nagłówek, akapit o regule, pole „Workspace
      // name" — czyli pyta „na co to zmienić" kogoś, komu nie powiedziała, co
      // jest. Reszta osiemnastu sekcji zostaje nietknięta.
      //
      // DWIE ASERCJE MUSZĄ PAŚĆ NARAZ i to jest sedno tego złamania. Sama
      // `SETTINGS_STATE_MISSING` przeszłaby też wtedy, gdyby ktoś skasował całe
      // pasmo nagłówka (wtedy nie ma czego pytać); sama `SETTINGS_STATE_COUNT`
      // nie powiedziałaby KTÓREJ sekcji brakuje. Razem mówią: pasm jest dalej
      // osiemnaście, wierszy siedemnaście, i brakuje tego jednego, z nazwy.
      //
      // TO JEST DOWÓD NA RÓWNOŚĆ WYPROWADZONĄ, nie na wpisaną liczbę: nigdzie
      // w bramce nie stoi „18", więc czerwień bierze się z ROZJECHANIA dwóch
      // policzonych zbiorów, a nie z niezgodności z zapisanym oczekiwaniem.
      name: "the Identity section opens with its field again: one settings section loses the sentence about what is already true",
      expectRedContains: [
        // FRAGMENT BEZ LICZBY, i to jest poprawka do pierwszej wersji tego
        // złamania. Stało tu „18 section head(s) drawn and 17" — czyli ta sama
        // wpisana liczba, której BRAK jest tezą tej bramki. Dwudziesta sekcja
        // dopisana kiedykolwiek później wywróciłaby to złamanie na „fragment
        // absent" pod nazwą wady produktu.
        "SETTINGS_STATE_COUNT:",
        'SETTINGS_STATE_MISSING — the settings section „Identity"',
      ],
      file: "packages/desktop-ui/src/SettingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          IDENTITY_STATE_ROW,
          "",
          "the state row of the Identity section",
        ),
    },
    {
      // ── LOT D2 FAZY III · ZŁAMANIE 3 — ZDANIE ZJEŻDŻA POD POLE ─────────────
      //
      // CO JEST ŁAMANE: wiersz stanu „Identity" nie znika — PRZEPROWADZA SIĘ
      // pod formularz. Wszystkie osiemnaście wierszy dalej istnieje, więc
      // `SETTINGS_STATE_COUNT` MILCZY, i to jest cały powód, dla którego to
      // złamanie jest osobne od drugiego: gdyby bramka pytała wyłącznie „ile
      // ich jest", ta wersja przeszłaby na zielono, a jest dokładnie tą wadą,
      // którą decyzja D2 nazywa po imieniu. Zdanie o stanie przeczytane PO polu
      // jest zdaniem przeczytanym po decyzji, którą miało poinformować.
      //
      // DWIE NAZWANE ASERCJE, DWIE RÓŻNE RZECZY: `ORPHANED` mówi, że wiersz
      // wypadł ze swojego pasma nagłówka (czyli liczba wierszy przestała być
      // zdaniem o sekcjach), a `BEHIND_CONTROL` — że stoi za kontrolką. Ta
      // druga jest jedynym powodem, dla którego filtr kontrolek w
      // `measureSettingsStateInPage` odrzuca WYŁĄCZNIE `.help-anchor`, a nie
      // całe pasmo: przy szerszym filtrze ten ruch byłby dla bramki
      // niewidzialny.
      name: "the Identity sentence moves under the field it was supposed to inform: every row still exists and the order is gone",
      expectRedContains: [
        'SETTINGS_STATE_ORPHANED: 1 „[data-settings-state]" row(s) stand outside',
        'SETTINGS_STATE_BEHIND_CONTROL — the state row of „Identity"',
      ],
      file: "packages/desktop-ui/src/SettingsSurface.tsx",
      edit: (text) => {
        const lifted = replaceOnce(
          text,
          IDENTITY_STATE_ROW,
          "",
          "the state row of the Identity section",
        );
        return replaceOnce(
          lifted,
          `                </div>
              </form>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Task statuses</h2>`,
          `                </div>
              </form>
${IDENTITY_STATE_ROW}            </section>

            <section>
              <div className="settings-copy">
                <h2>Task statuses</h2>`,
          "the closing of the Identity form",
        );
      },
    },
    {
      // ── LOT D2 FAZY III · ZŁAMANIE 4 — SONDA ZAZNACZENIA PRZESTAJE
      //    WCIĄGAĆ PODMIOT W KADR ────────────────────────────────────────────
      //
      // CZEGO TO DOWODZI, I DLACZEGO NIE JEST TO PORZĄDEK W CUDZYM PLIKU.
      // Ten lot przestawił kolejność kategorii Ustawień, przez co
      // `[data-commercial-defaults]` zjechało z pierwszej kategorii na czwartą
      // i przy 1440 × 900 stoi POD krawędzią okna. `boundingBox()` oddaje
      // współrzędne względem OKNA, a `mouse.move` ich używa — więc kursor
      // lądował poza kadrem, a sonda meldowała `SELECTION_HOVER_NOT_REACHED`
      // ze zdaniem „coś zasłania podmiot" nad ekranem, na którym nic nikogo nie
      // zasłania. Zmierzone: przelot z 2026-08-15 padł dokładnie tak, w OBU
      // motywach, i pociągnął za sobą podłogę pokrycia (6 z 8).
      //
      // Poprawką jest jedna linia (`scrollIntoViewIfNeeded`) i to złamanie
      // istnieje po to, żeby ta linia miała świadka: bez niej diagnoza
      // „zasłonięty" jest funkcją POŁOŻENIA sekcji na stronie, a nie tego, co
      // sonda deklaruje, że mierzy.
      //
      // DWA FRAGMENTY, DWA RÓŻNE ZDANIA: pierwszy nazywa podmiot, który
      // przestał być dosięgnięty, drugi — podłogę pokrycia, która istnieje
      // właśnie po to, żeby lista sond po cichu opróżniona nie przeszła jako
      // lista sond, którą każda przetrwała.
      name: "the selection probe stops pulling its subject into frame: a section pushed below the fold reads as a covered one",
      expectRedContains: [
        "SELECTION_HOVER_NOT_REACHED (dark) — P8-01",
        "SELECTION_HOVER_COVERAGE_FELL:",
      ],
      file: "scripts/verify-renderer-layout.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `        await page
          .locator(subject.selector)
          .first()
          .scrollIntoViewIfNeeded()
          .catch(() => {});
        const box = await page`,
          `        const box = await page`,
          "the scroll that puts the selection subject in frame",
        ),
    },
    {
      // ── NAPRAWA LOTU D2 · ZŁAMANIE 5 — WIERSZ STANU PRZESTAJE BYĆ WIDOCZNY,
      //    A DALEJ STOI W DRZEWIE ────────────────────────────────────────────
      //
      // TO ZŁAMANIE ISTNIEJE, BO RAZ JUŻ PRZESZŁO. Pierwsza wersja przyrządu
      // 13-1 nakładała filtr narysowania na pasma nagłówka i NIE nakładała go
      // na wiersze stanu: `document.querySelectorAll("[data-settings-state]")`
      // brało wszystko, co jest w drzewie. `display: none` dopisane do reguły
      // `.settings-state` dawało wtedy bramkę z kodem wyjścia 0, spis
      // „18 section head(s) drawn / 18 state row(s) / 17 proven ahead of
      // a control" i osiemnaście zacytowanych zdań, których czytelnik nie
      // widzi. Zmierzone przy odbiorze lotu, nie wywnioskowane.
      //
      // DLACZEGO TO NIE JEST TO SAMO CO ZŁAMANIE 2. Tamto KASUJE wiersz
      // z kodu — zbiór maleje po stronie źródła. To ukrywa go farbą, przez
      // którą żadna asercja o `textContent` ani o `compareDocumentPosition`
      // nie przechodzi. Reguła D2 mówi, co sekcja MÓWI CZYTELNIKOWI, więc
      // wiersz obecny i niewidoczny jest dokładnie tą samą wadą co jego brak,
      // a przyrząd musi to nazwać tak samo.
      //
      // JEDNA REGUŁA ARKUSZA, ŻADNEJ ZMIANY W TSX: dowód dotyczy filtru
      // narysowania, a nie znaczników.
      name: "the state row is painted out of the page while every one of them stays in the tree",
      expectRedContains: [
        "SETTINGS_STATE_COUNT:",
        'SETTINGS_STATE_MISSING — the settings section „Identity"',
      ],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.settings-state {
  display: flex;`,
          `.settings-state {
  display: none;`,
          "the display of the settings state row",
        ),
    },
    {
      // ── NAPRAWA LOTU D2 · ZŁAMANIE 6 — ZDANIE O STANIE ZOSTAJE WPISANE ────
      //
      // WŁASNOŚĆ NOŚNA WPISU 13-1 NIE MIAŁA ŚWIADKA. Bramka układu czyta farbę
      // i kolejność; osiemnaście wpisanych z ręki zdań po trzy słowa przechodzi
      // tam komplet asercji, a wiersz stanu, którego treść nie zależy od
      // danych, skłamie przy pierwszej ich zmianie i będzie WYGLĄDAŁ
      // prawdziwie. Świadkiem jest od tej naprawy asercja „computes every
      // settings state sentence instead of writing it out"
      // (`packages/desktop-ui/test/settings-navigation-contract.test.ts`).
      //
      // WŁASNY `verify`, bo to jest asercja o ŹRÓDLE, nie o narysowanej
      // stronie: przelot bramki nad tym złamaniem zostaje ZIELONY i to jest
      // poprawne — zdanie dalej ma trzy słowa, plakietkę i swoje miejsce.
      // Precedens własnego `verify` w tym pliku: `CONTRAST_VERIFY`.
      //
      // ŁAMANE JEST DOKŁADNIE JEDNO Z DZIEWIĘTNASTU WYWOŁAŃ, żeby czerwień
      // mówiła „jedno zdanie jest stałą", a nie „ten plik się nie kompiluje".
      // Podmieniany szablon jest zastąpiony napisem o TEJ SAMEJ treści dla
      // dzisiejszej fikstury — czyli złamaniem, którego nie widać na ekranie
      // i którego żaden pomiar farby nie może zobaczyć.
      name: "one state sentence stops being computed and becomes a written-out string",
      expectRedContains: [
        "A settings state sentence is a written-out constant",
      ],
      verify: { command: "npm", args: ["run", "test:core"] },
      file: "packages/desktop-ui/src/SettingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          "says={`This workspace is called ${snapshot.bootstrap.workspace.name}, and every screen in this window is looking at it.`}",
          'says={"This workspace is called Praca, and every screen in this window is looking at it."}',
          "the computed sentence of the Identity section",
        ),
    },
    {
      // ══ WPIS 11-2 FAZY III · CZTERY ZŁAMANIA NA TRZY PARY ═════════════════
      //
      // TRZY PARY, KTÓRE PADAJĄ OSOBNO, SĄ TRZEMA PARAMI. Trzy, które padają
      // zawsze razem, są jedną parą o trzech identyfikatorach — i to jest
      // jedyny powód, dla którego złamań jest cztery, a nie jedno „skasuj
      // urywek". Każde z pierwszych trzech celuje w INNĄ z nich i zostawia
      // pozostałe zielone; czwarte zabija podmiot i musi zgasić wszystkie.
      //
      // ZŁAMANIE 1 — TREŚĆ. Wiersz dalej rysuje pas, dalej go klamruje,
      // i pokazuje w nim TYTUŁ zamiast tekstu notatki. To jest realna droga
      // wady, nie wymyślona: tytuł jest tuż obok w tym samym komponencie i był
      // jedyną rzeczą, którą ten wiersz pokazywał przed tym wpisem. Czerwona
      // ma być WYŁĄCZNIE `L5-12a` — klamra i pudełko nie mają o treści zdania.
      name: "the note row shows its title again instead of the note's own text",
      // FRAGMENT PRZYPIĘTY DO WERDYKTU, NIE DO IDENTYFIKATORA. Gołe „L5-12a"
      // stoi w wyjściu ZIELONEGO przebiegu (wiersz raportu `L5-12a\tMATCH`),
      // a sama forma `L5-12a „tytuł"` jest wspólna dla werdyktu DIFFERS
      // i awarii NOT_MEASURED — czyli nie odróżniłaby tego złamania od
      // czwartego. Dwukropek po cudzysłowie należy WYŁĄCZNIE do werdyktu
      // (`… „${pair.title}": ${subject} computes …`), a wersja NOT_MEASURED
      // ma w tym miejscu „ [enforced] at ". Zmierzone na zielonym logu tego
      // odbioru: 0 wystąpień.
      expectRedContains: [
        "L5-12a „the note row shows the opening of the note's own text\": ",
      ],
      file: "packages/desktop-ui/src/library/NotesReading.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          "{note.excerpt}",
          "{note.title}",
          "the text the excerpt element renders",
        ),
    },
    {
      // ZŁAMANIE 2 — LICZBA WIERSZY. Pas zostaje, treść zostaje, pudełko
      // zostaje; klamra przestaje być dwuwierszowa. Czerwona ma być WYŁĄCZNIE
      // `L5-12b`.
      name: "the excerpt clamp counts four lines where the reference counts two",
      expectRedContains: ['L5-12b „the excerpt is clamped to two lines": '],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.knowledge-row-excerpt {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;`,
          `.knowledge-row-excerpt {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;`,
          "the line count of the excerpt clamp",
        ),
    },
    {
      // ZŁAMANIE 3 — I TO JEST TO, DLA KTÓREGO `L5-12c` W OGÓLE ISTNIEJE.
      //
      // Pudełko przestaje być pudełkiem klamry: `display: block` zamiast
      // `-webkit-box`. Urywek LEJE SIĘ NA SZEŚĆ WIERSZY i rozpycha listę —
      // czyli dokładnie ta wada, przed którą ta pozycja ma bronić.
      //
      // A TERAZ RZECZ, KTÓRA JEST TU CAŁĄ POINTĄ: `L5-12b` ZOSTAJE ZIELONA.
      // `-webkit-line-clamp` wylicza się na „2" także wtedy, gdy nie obcina
      // niczego, więc para czytająca samą klamrę zaświadczyłaby ten stan jako
      // poprawny. Gdyby ten wpis dowiózł dwie pary zamiast trzech, przeszedłby
      // odbiór z przyrządem ślepym na własny przedmiot. To złamanie jest
      // jedynym dowodem, że tak nie jest — i dlatego jego `expectRedContains`
      // wymienia TYLKO `L5-12c`.
      name: "the excerpt stops being the box a clamp can bite on",
      expectRedContains: [
        'L5-12c „the excerpt is the box the clamp needs to bite on": ',
      ],
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.knowledge-row-excerpt {
  display: -webkit-box;
  overflow: hidden;`,
          `.knowledge-row-excerpt {
  display: block;
  overflow: hidden;`,
          "the display of the excerpt element",
        ),
    },
    {
      // ZŁAMANIE 4 — ISTNIENIE PODMIOTU. Znacznik znika, więc selektor
      // trzech par nie ma czego zmierzyć. Wszystkie trzy muszą wrócić
      // `NOT_MEASURED`, i to jest asercja o TRASIE: dowodzi, że pas urywków
      // jest naprawdę rysowany na tym przystanku, a nie że pary są zielone,
      // bo nikt na nie nie patrzy.
      //
      // KAŻDY FRAGMENT PRZYPINA STAN DO PARY, i to jest poprawka z odbioru.
      // Pierwsza wersja wymieniała `"VISUAL_LANGUAGE_NOT_MEASURED"` obok
      // gołych identyfikatorów — a gołe „L5-12a" stoi w wyjściu ZIELONEGO
      // przebiegu, więc asercja dowodziła wyłącznie, że `NOT_MEASURED` padło
      // GDZIEKOLWIEK. Forma „ [enforced] at " jest wyłączną własnością
      // wiersza `ROUTED_NOT_MEASURED` (werdykt DIFFERS ma tam dwukropek),
      // więc trzy fragmenty niżej są prawdziwe DOKŁADNIE wtedy, gdy te trzy
      // pary nie zmierzyły niczego.
      //
      // 12d I 12e ZOSTAJĄ ZIELONE PO TYM ZŁAMANIU I TO JEST POPRAWNE: bez
      // znacznika żaden wiersz nie ma pasa, więc „wiersz bez pasa istnieje"
      // jest spełnione, a „pas pusty nie istnieje" jest spełnione pusto.
      // Ich dowodem jest złamanie 7.
      name: "the excerpt element loses the marker every one of its pairs aims at",
      expectRedContains: [
        "L5-12a „the note row shows the opening of the note's own text\" [enforced] at ",
        'L5-12b „the excerpt is clamped to two lines" [enforced] at ',
        'L5-12c „the excerpt is the box the clamp needs to bite on" [enforced] at ',
      ],
      file: "packages/desktop-ui/src/library/NotesReading.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `                              className="knowledge-row-excerpt"
                              data-note-excerpt`,
          `                              className="knowledge-row-excerpt"`,
          "the marker attribute on the excerpt element",
        ),
    },
    {
      // ZŁAMANIE 5 — PROJEKCJA, I ONO CELOWO NIE JEST MIERZONE BRAMKĄ UKŁADU.
      //
      // Kernel przestaje składać `excerpt` na `knowledge.list`. Bramka układu
      // zostaje wtedy ZIELONA i to jest poprawne, a nie luka: harness rysuje
      // Bibliotekę z klienta scenariuszowego nad fiksturą, więc nie przechodzi
      // przez kernel ANI RAZU. Puszczenie tego złamania przez domyślny
      // `verify` zgłosiłoby defekt przyrządu tam, gdzie defektem jest dobór
      // bramki — precedens `CONTRAST_VERIFY` wyżej.
      //
      // Świadkiem jest jedyny test, który może nim być: `knowledge.list`
      // wołany przez PRAWDZIWY kernel nad PRAWDZIWYM SQLite
      // (`packages/local-store/test/document-excerpt-projection.test.ts`).
      // Zestaw zgodności nad sklepem odniesienia NIE MOŻE nim być — ten sklep
      // nie ma ciał dokumentów i byłby zielony przy urywku zawsze nieobecnym.
      //
      // FRAGMENT MUSI POCHODZIĆ Z KOMUNIKATU ASERCJI, a nie z nazwy `describe`
      // — i to jest poprawka z odbioru. Nazwa zestawu („the excerpt a note
      // list shows under a title") jest DRUKOWANA PRZEZ ZIELONY PRZEBIEG
      // `test:core`, więc pierwsza wersja tego wpisu nie przypinała czerwieni
      // do niczego. Komunikat niżej stoi przy roszczeniu 1 i pojawia się
      // wyłącznie, gdy ono padnie.
      name: "the projection stops carrying the excerpt the note list reads",
      expectRedContains: [
        "the note list must receive the opening of the indexed body",
      ],
      verify: { command: "npm", args: ["run", "test:core"] },
      file: "packages/application/src/wave2.ts",
      edit: (text) =>
        replaceOnce(
          text,
          `          ...(excerpt === undefined ? {} : { excerpt }),`,
          // Zmienna ZOSTAJE wyliczona, żeby złamanie było o PROJEKCJI, a nie
          // o nieużywanej zmiennej: usunięcie całego wyrażenia zostawiłoby
          // `excerpt` bez konsumenta i pierwszą czerwienią byłaby uwaga
          // lintera o martwym kodzie, a nie test mówiący, że lista notatek
          // przestała dostawać treść.
          `          ...(excerpt === undefined ? {} : {}),`,
          "the excerpt composed onto knowledge.list",
        ),
    },
    {
      // ZŁAMANIE 6 — ECHO TYTUŁU WRACA, I TO JEST DOWÓD, ŻE POPRAWKA ODBIORU
      // JEST TYM, CO CZYNI `L5-12a` ZIELONĄ.
      //
      // Do odbioru wpisu 11-2 urywek notatki `runbook` otwierał się
      // nagłówkiem H1 powtarzającym tytuł wiersza, a para stała na `contains`
      // — czyli była ZIELONA nad pasem, którego 50 z 67 widocznych znaków było
      // tytułem stojącym linijkę wyżej. To złamanie przywraca dokładnie tamten
      // stan: zdejmuje zdejmowanie echa i zostawia wszystko inne.
      //
      // FRAGMENT PRZYPINA ZAOBSERWOWANĄ TREŚĆ, nie identyfikator pary: werdykt
      // DIFFERS o `L5-12a` wypisałoby także złamanie 1, a te dwa mówią o dwóch
      // różnych wadach. Napis niżej może paść wyłącznie wtedy, gdy pas OTWIERA
      // SIĘ tytułem.
      name: "the excerpt opens by repeating the title standing one line above it",
      expectRedContains: [
        "computes text = Runbook uruchomienia środowiska po stronie klienta Notatka opisuje",
      ],
      file: "packages/contracts/src/document-excerpt.ts",
      edit: (text) =>
        replaceOnce(
          text,
          `  const flattened = withoutTitleEcho(body, title).replace(/\\s+/gu, " ").trim();`,
          `  void withoutTitleEcho;
  const flattened = body.replace(/\\s+/gu, " ").trim();`,
          "the removal of the title echo from the opening of the excerpt",
        ),
    },
    {
      // ZŁAMANIE 7 — PAS RYSOWANY BEZWARUNKOWO, I TO JEST JEDYNY DOWÓD
      // TRZECIEJ POŁOWY KONTRAKTU.
      //
      // Wiersz notatki bez tekstu dostaje pas, tylko pusty. Czytelnik widzi
      // wtedy pod tytułem pustą wstęgę, czyli zdanie „ta notatka nic nie
      // mówi" o notatce, o której ekran nie wie nic. Do odbioru wpisu 11-2 ta
      // gałąź nie była asertowana NIGDZIE po stronie renderu — test
      // jednostkowy pilnował PROJEKCJI (brak klucza), a `L5-12a/b/c` są na
      // nią ślepe: pusty `<span>` albo wypada z `rendered()` i tamte trzy
      // sądzą te same cztery elementy, albo nie wypada i wszystkie dziewięć
      // wylicza tę samą klamrę. Zielone w OBU gałęziach.
      //
      // Obie nowe pary muszą paść, i padają z RÓŻNYCH powodów: 12d nie
      // znajduje ani jednego wiersza BEZ pasa, 12e znajduje pięć pasów
      // pustych.
      name: "every note row gets a band, and five of them have nothing to put in it",
      expectRedContains: [
        'L5-12d „a note with no text of its own gets a row with no band": ',
        'L5-12e „no note row carries a band with nothing in it": ',
      ],
      file: "packages/desktop-ui/src/library/NotesReading.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `                          {note.excerpt === undefined ? null : (
                            <span
                              className="knowledge-row-excerpt"
                              data-note-excerpt
                            >
                              {note.excerpt}
                            </span>
                          )}`,
          `                          <span
                            className="knowledge-row-excerpt"
                            data-note-excerpt
                          >
                            {note.excerpt ?? ""}
                          </span>`,
          "the condition that keeps a bandless note row bandless",
        ),
    },

    // ══ OGON FAZY III — JEDENAŚCIE ZŁAMAŃ, PO JEDNYM NA ZAMKNIĘTY WPIS ══════
    //
    // KAŻDE ODTWARZA DOKŁADNIE TĘ WADĘ, KTÓRĄ WPIS ZAMYKA, i to jest jedyny
    // powód, dla którego jest ich jedenaście, a nie jedno: pomiar postawiony
    // razem z poprawką jest nieodróżnialny od pomiaru, który nic nie mierzy,
    // dopóki nikt nie pokaże go czerwonym nad kodem SPRZED poprawki. Cztery
    // z tych wpisów miały nad sobą przyrząd, który był ZIELONY nad rozjazdem
    // (albo — przy 2-9 — certyfikował rozjazd jako stan docelowy), więc „coś
    // to mierzy" nie wystarczyło ani razu.
    //
    // DWA `verify`, BO DWA PRZYRZĄDY. Pozycje, których podmiotem jest
    // wyliczona własność CSS, mierzy bramka układu (domyślny `verify`);
    // pozycje, których oczekiwana wartość jest WYPROWADZONA Z DANYCH — liczba
    // pozycji szyny, liczba wierszy sekcji, kształt napisu nad rosnącym
    // wiekiem — mierzą asercje interakcyjne. Złamanie treści puszczone przez
    // bramkę wróciłoby ZIELONE i harness zgłosiłby wtedy przyrząd zamiast
    // kodu, a to jest ta sama pomyłka, przed którą przestrzega nota przy
    // `CONTRAST_VERIFY`.
    {
      name: "FIII3 1-8: put the two extra articles back into the capture dock prompt",
      expectRedContains: [
        "the capture dock's prompt is the reference's sentence",
      ],
      file: "packages/desktop-ui/src/RealApp.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          "                Capture a thought, link or task…\n",
          "                Capture a thought, a link or a task…\n",
          "the capture dock prompt",
        ),
    },
    {
      name: "FIII3 2-7: take the caps off the calendar day name",
      expectRedContains: ["the day name is set in caps"],
      file: "packages/desktop-ui/src/calendar.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          "  letter-spacing: var(--tracking-wide);\n  text-transform: uppercase;\n}\n\n.dayNum {",
          "  letter-spacing: var(--tracking-wide);\n}\n\n.dayNum {",
          "the caps on the day name",
        ),
    },
    {
      name: "FIII3 2-8: let the non-working day speak in the working day's voice",
      expectRedContains: ["and a day nobody works speaks quieter still"],
      file: "packages/desktop-ui/src/calendar.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          ".freeOff {\n  color: var(--text-disabled);\n}",
          ".freeOff {\n  color: var(--text-tertiary);\n}",
          "the third step of the capacity label",
        ),
    },
    {
      name: "FIII3 2-9: the calendar tray heading calls an overdue deadline late again",
      expectRedContains: ["/already past/"],
      verify: INTERACTION_VERIFY,
      file: "packages/desktop-ui/src/CalendarSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          '? "Deadline this week or already past, nobody planned it"',
          '? "Deadline this week or already late, nobody planned it"',
          "the tray heading of the current week",
        ),
    },
    {
      name: "FIII3 3-3: the inbox band sums its two mailboxes into one number again",
      expectRedContains: ["one number summed over two mailboxes"],
      verify: INTERACTION_VERIFY,
      file: "packages/desktop-ui/src/InboxSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          "{`${mailboxes.work.length} to decide`}",
          "{`${mailboxes.work.length + mailboxes.captures.length} waiting`}",
          "the left number of the inbox band",
        ),
    },
    {
      name: "FIII3 3-4: the inbox row kicker goes back to the interface face",
      expectRedContains: ["the inbox row's kicker is set in the mono family"],
      file: "packages/desktop-ui/src/inbox.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          "  font-family: var(--font-mono);\n  font-size: var(--text-2xs);\n  letter-spacing: var(--tracking-wide);\n  text-transform: none;",
          "  font-size: var(--text-2xs);\n  letter-spacing: var(--tracking-wide);\n  text-transform: none;",
          "the mono family on the inbox kicker",
        ),
    },
    {
      name: "FIII3 5-2: New project goes back to being the one create action with no accent",
      expectRedContains: [
        "the Projects band carries an accent-filled create action",
      ],
      file: "packages/desktop-ui/src/Wave2Surfaces.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          'className={creating ? "secondary-button" : "primary-button"}\n              aria-expanded={creating}\n              aria-controls={creating ? "project-create-form" : undefined}',
          'className="secondary-button"\n              aria-expanded={creating}\n              aria-controls={creating ? "project-create-form" : undefined}',
          "the paint of the Projects create action",
        ),
    },
    {
      name: "FIII3 6-4: the age badge appends the word stale again",
      expectRedContains: ["an age badge said more than the number of days"],
      verify: INTERACTION_VERIFY,
      file: "packages/desktop-ui/src/pipeline/PipelineSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          "{`${card.ageDays} d`}",
          '{`${card.ageDays} d${card.stale ? " · stale" : ""}`}',
          "the text of the age badge",
        ),
    },
    {
      name: "FIII3 7-3: the review rail's footer counts something other than what it drew",
      expectRedContains: ["review item(s) drawn in the same rail"],
      verify: INTERACTION_VERIFY,
      file: "packages/desktop-ui/src/StrategicDepthSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          "                {countLabel(\n                  radar.length + openConsequences.length,",
          "                {countLabel(\n                  0 * radar.length + openConsequences.length,",
          "the count in the review rail footer",
        ),
    },
    {
      name: "FIII3 9-3: the renewals band puts the noun back in front of open",
      expectRedContains: ["a noun between the number and the word open"],
      verify: INTERACTION_VERIFY,
      file: "packages/desktop-ui/src/renewals/RenewalsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          "{`${sections.openCount} open · ${sections.closed.length} closed this cycle`}",
          '{`${countLabel(sections.openCount, "contract")} open · ${sections.closed.length} closed this cycle`}',
          "the renewals view band count",
        ),
    },
    {
      name: "FIII3 10-2: the meetings section is named after the vendor again",
      expectRedContains: [
        "a section heading names the system the rows came from",
      ],
      verify: INTERACTION_VERIFY,
      file: "packages/desktop-ui/src/MeetingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          '          What is left of the ones that happened{" "}\n',
          '          Jamie results{" "}\n',
          "the heading of the completed meetings section",
        ),
    },

    // ══ NAPRAWA OGONA — CZTERY ZŁAMANIA, KAŻDE ZA ZNALEZISKIEM PRZEGLĄDU ═══
    //
    // DWA PIERWSZE stoją pod pozycjami, których lot nie postawił w ŻADNEJ ze
    // swoich dwóch tabel (2-6b i reszta 1-4). DWA DALSZE stoją pod napisami,
    // które lot ZMIENIŁ i o których napisał „MIERZONA: tak" — a przegląd
    // adwersarialny udowodnił złamaniem, że oba wracają ZIELONE. To jest
    // najgorszy z trzech stanów przyrządu i jedyny, którego nie widać
    // z tabeli: pozycja bez pomiaru i pozycja z pomiarem obok wyglądają
    // w niej identycznie.
    {
      name: "FIII3 2-6b: the day column goes back to a floor two thirds of the reference's",
      expectRedContains: [
        "an empty day is as tall as the reference's empty day",
      ],
      file: "packages/desktop-ui/src/calendar.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          "  min-height: 19rem;\n",
          "  min-height: 12rem;\n",
          "the declared floor of the calendar day column",
        ),
    },
    {
      name: "FIII3 1-4: the calendar tray heading gets louder than the week above it",
      expectRedContains: [
        "the calendar's tray heading is quieter than the week it hangs under",
      ],
      file: "packages/desktop-ui/src/calendar.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          "  font-size: var(--text-sm);\n  font-weight: var(--weight-semibold);\n  letter-spacing: var(--tracking-tight);\n",
          "  font-size: var(--text-md);\n  font-weight: var(--weight-semibold);\n  letter-spacing: var(--tracking-tight);\n",
          "the type size of the calendar section heading",
        ),
    },
    {
      // ZŁAMANIE, KTÓRE PRZEGLĄD WYKONAŁ I DOSTAŁ ZIELEŃ. Czwarte ramię
      // rejestru pojemności nie rysowało się w ŻADNEJ fiksturze, więc
      // `english-copy`, `prose-guard` i cała bramka układu przepuszczały
      // wielką literę w jednej z czterech odpowiedzi tego samego slotu.
      name: "FIII3 2-8b: one of the four capacity answers is capitalised again",
      expectRedContains: [
        "a working day with no free minutes left names that state in some other way",
      ],
      verify: INTERACTION_VERIFY,
      file: "packages/desktop-ui/src/CalendarSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          '                ? "full"\n',
          '                ? "Full"\n',
          "the fourth arm of the day capacity register",
        ),
    },
    {
      // DRUGIE ZŁAMANIE PRZEGLĄDU, TA SAMA KLASA. Wpis 10-2 przepisał DWA
      // napisy — widoczny nagłówek i nazwę dostępną listy pod nim — a asercja
      // lotu skanuje wyłącznie `.meeting-sec-head h2`. Reguła o równości nazwy
      // dostępnej z widoczną była zadeklarowana w komentarzu i przez nic
      // niemierzona.
      name: "FIII3 10-2b: the completed list answers to the vendor's name again",
      expectRedContains: [
        "a row container announces a different name than the heading above it",
      ],
      verify: INTERACTION_VERIFY,
      file: "packages/desktop-ui/src/MeetingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          '            aria-label="What is left of the ones that happened"\n',
          '            aria-label="Jamie results"\n',
          "the accessible name of the completed meetings list",
        ),
    },
  ]),
});

for (const result of outcome.results)
  console.log(`${result.verdict.toUpperCase()}  ${result.name}`);
for (const result of outcome.failed) console.error(`FAILED: ${result.name}`);
if (!outcome.ok) process.exitCode = 1;
