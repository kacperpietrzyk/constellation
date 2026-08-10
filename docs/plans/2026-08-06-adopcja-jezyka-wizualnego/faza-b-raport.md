# Faza B — raport domknięcia

Gałąź `agent/domkniecie-wizualne-v3`, odbita od `main` @75af233 (PR #231, adopcja języka
wizualnego v3, fazy 0–3). Cztery commity fazy: `3ef4666`, `73ef03d` (B1), `28238f7`,
`cd5e425` (B2). Wszystkie liczby niżej zmierzone 2026-08-10 na tym drzewie, macOS 25.6.0,
Node 24.

**Czym Faza B była:** postawieniem dwóch przyrządów **zanim** ktokolwiek dotknie farby.
Ani jedna linia w `packages/desktop-ui/src` nie została zmieniona — dowód niżej, punkt 3.

---

## 1. Co mierzy każdy przyrząd — jednym zdaniem

**B1 — spis farby kontrolek (`scripts/control-paint.mjs` + przelot `controlPaintCensus`).**
Chodzi po trzynastu celach nawigacji w obu motywach i pyta o każdą **narysowaną** kontrolkę
(`button`, `input`, `textarea`, `select`), czy jej wyliczone tło jest kolorem z palety tokenów
tego arkusza — czy raczej domyślną farbą silnika, której ten arkusz nigdy nie ustawił.

**B2 — spis pozycji akcji głównej (`scripts/title-band-action.mjs` + przelot
`titleBandActionCensus`).** Odwiedza piętnaście zadeklarowanych ekranów i pyta, czy środek
pionu akcji głównej mieści się w rzędzie tytułu — miara: `|środek(akcja) − środek(tytuł)| ≤
max(wysokość(akcja), wysokość(tytuł))/2`, obie wysokości odczytane w tym samym przelocie —
a wynik zestawia z **cytatem z kodu prototypu**, gdzie każdy ekran v3 składa
`crumbbar(crumbs, actions)` i drugi argument tej funkcji JEST akcją w paśmie.

---

## 2. Czerwień obu przyrządów na dzisiejszym kodzie

Oba przeloty chodzą w trybie **raportującym** (`pending`), więc kod wyjścia bramki to 0
i czerwień jest **treścią raportu**, nie kodem wyjścia. To jest świadome i uzasadnione niżej,
w punkcie 6.

### B1 — 14 kształtów, 27 narysowanych elementów, w KAŻDYM motywie

```
control paint	dark	summary	98 control group(s) judged	232 rendered control(s)	across 13 destination(s)	IN_PALETTE 42, PAINTED_IMAGE 1, TRANSPARENT 41, UA_DEFAULT 14
control paint	light	summary	98 control group(s) judged	232 rendered control(s)	across 13 destination(s)	IN_PALETTE 42, PAINTED_IMAGE 1, TRANSPARENT 41, UA_DEFAULT 14
```

Czternaście kształtów na pięciu ekranach, identycznych w obu motywach (dark → `rgb(107,107,107)`,
light → `rgb(239,239,239)`; pole tekstowe odpowiednio `rgb(59,59,59)` / `rgb(255,255,255)`):

| ekran | podpis | elementów | pierwszy napis |
|---|---|---|---|
| pipeline | `button._stagesLink` | 1 | „Stages” |
| organizations | `button._switch` | 1 | „Table” |
| organizations | `button._chip` | 3 | „Active1” |
| people | `button._switch` | 1 | „Table” |
| people | `button._groupName` | 2 | „Northwind Manufacturing Grou” |
| renewals | `button._basisLink` | 2 | „from the estimate” |
| renewals | `button._follow` | 1 | „Potwierdź wariant recoveryW ” |
| renewals | `button._action` | 4 | „Close” |
| renewals | `button._more` | 1 | „Show” |
| library | `button._switch` | 3 | „Sources” |
| library | `button._treeNode._treeNodeLoose` | 1 | „Unfiled1” |
| library | `button._treeNode` | 4 | „Archiwum0” |
| library | `button._arrangementButton` | 2 | „Record” |
| library | `input[name=sourceTitle]` | 1 | pole zmiany tytułu źródła |

Razem **27 elementów na motyw**, 54 łącznie. **OFF_PALETTE: zero** — czyli nie ma dziś
kontrolki pomalowanej kolorem spoza palety; cały dług to kontrolki, których arkusz **nie maluje
w ogóle**, przez co maluje je silnik.

Spacer w każdym motywie: 13 zadeklarowanych celów, **12 z 12 potwierdzonych przybyć**,
**11 z 11 otwartych soczewek**, wejście w Ustawienia znalezione. Świadkowie (kontrolki, które
MUSZĄ wyjść inaczej, inaczej spis mierzy sam siebie): `.primary-button` IN_PALETTE (5 elementów),
`.secondary-button` IN_PALETTE (13), `.ghost-button` TRANSPARENT (7).

Paleta: **55 odrębnych kolorów tokenowych ze 190 własności** korzenia w motywie ciemnym,
**68 ze 190** w jasnym (podłoga `MINIMUM_TOKEN_PALETTE = 40`).

### B2 — 8 ekranów stawia akcję główną poza rzędem tytułu

```
title band: pending: FAZA C, lot C2 — PENDING (a divergence the screen list predicts is reported, any screen that drifted from it still fails)	15 of 15 declared screen(s) judged	8 screen(s) place the primary action outside the title row, 6 agree with the prototype, 1 have no prototype counterpart	8 divergence(s) on the canonical list	0 verdict(s) thrown, 8 reported	16349 ms wall clock
```

| ekran | werdykt | zmierzone | cytat z prototypu |
|---|---|---|---|
| tasks | NO_ACTION | brak przycisku akcji w sąsiedztwie pasma (sufit h≤40; odpadł `div._viewbar` h=96,6) | `v3/screens/tasks.js:507-513` |
| projects/record:project | ABOVE_BAND | „Close project” i „Apply” y 86–118, dryf **−46,3 px** przy tolerancji 16 px | `v3/screens/record.js:429-431` |
| pipeline | BELOW_BAND | „New opportunity” y 140–176, dryf **+74,1 px** przy tolerancji 18 px | `v3/screens/pipeline.js:409-410` |
| organizations | BELOW_BAND | „New organization” y 140–176, dryf **+74,1 px** | `v3/screens/crm.js:371` |
| people | BELOW_BAND | „New person” y 140–176, dryf **+74,1 px** | `v3/screens/crm.js:540` |
| renewals | BELOW_BAND | „New renewal” y 140–176, dryf **+74,1 px** | `v3/screens/renewals.js:217` |
| meetings | NO_ACTION | brak przycisku w sąsiedztwie `header.meeting-hero` h=70,6 | `v3/screens/meetings.js:431-433` |
| library | NO_ACTION | brak przycisku w sąsiedztwie `header._header` h=59,9 | `v3/screens/knowledge.js:802-804`, `:967-968` |

Jedyny świadek po drugiej stronie: **projects → IN_BAND**, „New project” y 67,9–103,9, dryf
2,5 px przy tolerancji 18 px. Ten jeden ekran jest powodem, dla którego przyrząd nie jest
sondą umiejącą wyłącznie czerwienieć — i dlatego piąte złamanie celuje właśnie w niego.

Spacer: **12 z 12 potwierdzonych przybyć**, wejście w Ustawienia znalezione, root font 16 px.
Ekrany zgodne z prototypem: `today`, `calendar`, `inbox`, `tasks/record:task`, `settings`
i `projects`. Nieporównywalny: `pipeline/record:opportunity` (prototyp nie ma ekranu rekordu
szansy).

---

## 3. Liczby bazowe dla Fazy C

### Bramka układu (`npm run test:renderer-layout`, EXIT 0)

**To jest liczba bazowa całej Fazy C. Każdy lot C podaje ją przed i po.**

**MIANOWNIK JEST DWOJAKI I NIE WOLNO GO SUMOWAĆ W CIEMNO** — bramka drukuje dwa przeloty
w dwóch różnych jednostkach, a jedna liczba „razem” byłaby ani parami, ani pomiarami:

| przelot | jednostka | MATCH | DIFFERS | NOT_MEASURED | BLIND |
|---|---|---|---|---|---|
| `visual language` (powłoka startowa) | 27 **par**, identycznie w każdym motywie | 26 | **1** | 0 | 0 |
| `routed` — lot 2 | **pomiary**, po obu motywach łącznie | 28 | 0 | 0 | 0 |
| `routed` — lot 3 | j.w. | 22 | 0 | 0 | 0 |
| `routed` — lot 4 | j.w. | 34 | 0 | 0 | 0 |
| `routed` — lot 5 | j.w. | 26 | 0 | 0 | **2** |
| `routed` — lot 6 | j.w. | 12 | 0 | 0 | 0 |
| `routed` — **razem** | **pomiary**, po obu motywach łącznie | **122** | **0** | **0** | **2** |

Dwa zdania, którymi lot C ma cytować bazę, żeby porównanie „przed i po” miało sens:

- `visual language`: **27 par, 26 MATCH / 1 DIFFERS / 0 NOT_MEASURED**, tak samo w obu motywach
  (bramka drukuje to dwa razy, raz na motyw — 54 pomiary, 52 MATCH, 2 DIFFERS);
- `routed`: **122 MATCH / 0 DIFFERS / 0 NOT_MEASURED / 2 BLIND**, liczone po obu motywach
  łącznie. To jest owe „122 pary” z planu.

Trzy rzeczy, których nie wolno przy tej tabeli przemilczeć:

1. **DIFFERS to jedna para, zgłoszona dwa razy:** `L1-15a` („the sidebar is 15rem wide”,
   zmierzone 220 px wobec oczekiwanych 240 px), raz w każdym motywie, status `pending: LOT 1`.
2. **BLIND to czwarty stan**, którego zadanie nie wymieniało: `L5-03b` na Źródłach —
   selektor nie trafił w ani jeden element, bo `[class*="_welcome_"]` rysuje się wyłącznie
   przy `sources.length === 0`, a żaden krok trasy tam nie dojdzie. Para **nic nie zmierzyła**
   i nie wolno jej liczyć jako MATCH.
3. **10 pozycji zadeklarowanych jako NOT COVERED** (L1-10, L2-01, L2-04, L4-09, L5-11, L5-12,
   L6-01, L6-06, L6-07, L6-08) — pomiaru nie ma i przyrząd mówi to wprost.

Pozostałe przeloty tej samej bramki w tym samym przebiegu: `record title band` ENFORCED,
28 tytułów rekordu, 0 werdyktów; `routed` walk 11 przystanków × 2 motywy w 42 992 ms,
0 awarii przyrządu/trasy; pokrycie `sticky` 2 z 10 reguł rozstrzygnięte jednoznacznie
(6 dzieli nazwę klasy, 2 na ekranach, których żaden przystanek nie rysuje).

### Budżet (`node scripts/verify-renderer-bundle.mjs`, EXIT 0)

```
Renderer bundle: hot path 631907 B (171702 B gzip) across 21 chunks, hot path CSS 184067 B, JS total 1708649 B, CSS total 343778 B, largest lazy JS 617695 B.
```

| budżet | zmierzone | sufit | zapas |
|---|---|---|---|
| JS ścieżki gorącej, gzip | **171 702 B** | 174 000 B | **2 298 B** |
| JS ścieżki gorącej, surowy | 631 907 B | 648 000 B | 16 093 B |
| CSS ścieżki gorącej | **184 067 B** | 200 000 B | 15 933 B |
| CSS łącznie | **343 778 B** | 450 000 B | 106 222 B |
| JS łącznie | 1 708 649 B | 1 770 000 B | 61 351 B |
| największy leniwy JS | 617 695 B | 700 000 B | 82 305 B |

**Faza B nie ruszyła budżetu i jest to dowiedzione dwa razy, nie raz:**

- gzip ścieżki gorącej to **dokładnie** 171 702 B — co do bajta liczba podana w zadaniu jako
  baza. Tak samo surowy JS (631 907), JS łącznie (1 708 649) i największy leniwy (617 695)
  są identyczne z blokiem przebazowania w `verify-renderer-bundle.mjs:296-313`;
- `git diff --name-only 75af233..HEAD -- packages/` zwraca **zero plików**. Cała faza to
  `package.json` (jedna linia) i osiem plików w `scripts/`.

Jedyna różnica wobec bloku w skrypcie: CSS gorący 184 067 wobec 184 092 (**−25 B**) i CSS
łącznie 343 778 wobec 343 803 (**−25 B**). Ta różnica **nie należy do tej gałęzi** — blok
zapisano przy zamknięciu Fazy 3 na drzewie sprzed PR #231, a ta gałąź zmienia zero bajtów pod
`packages/`. Zgłaszam ją jako liczbę do przepisania w bloku przy najbliższej okazji, nie jako
regresję.

### Pełna bramka lokalna (`npm run check`, EXIT 0)

```
SUMMARY — suite "check"

  PASS  format:check            5.7s
  PASS  lint:code               3.6s
  PASS  lint:md                 0.4s
  PASS  typecheck               0.2s
  PASS  clean                   0.3s
  PASS  build                  12.9s
  PASS  test:renderer-bundle    0.1s
  PASS  audit:licenses          0.1s
  PASS  test:scripts            7.7s
  PASS  test:core               9.6s
  PASS  test:interaction        4.4s

  passed 11 / failed 0 / not run 0 of 11 steps in this suite
  Every step of this suite ran and passed.
```

`test:scripts` 264 testy / 0 porażek (w tym **34 testy B1** w `control-paint.test.mjs` i **29
testów B2** w `title-band-action.test.mjs` — zmierzone osobno, `node --test <plik>`),
`test:core` 976 testów / 975 pass / 1 skipped / 0 fail, `test:interaction` 336 testów w 40 plikach.

**Czego `npm run check` NIE uruchamia — nazywam to, zamiast udawać, że go nie ma:**

- **`test:renderer-layout`** nie należy do żadnej suity i jest to zamierzone
  (`run-check.mjs:39`): czysty klon nie ma przeglądarki. Bramka układu chodzi osobnym zadaniem
  CI (`ci.yml:117-119, 151`, `macos-26`) i została uruchomiona osobno — punkt wyżej.
- **`audit:dependencies`** nie jest w `STEPS` w ogóle, więc `npm run check` nie mówi o nim ani
  słowa. Uruchomiony osobno: `npm run audit:dependencies` → **`found 0 vulnerabilities`**, EXIT 0.
  Nie jest to zdanie o całym drzewie zależności — bramka tego repozytorium celowo pyta tylko
  o `--omit=dev --audit-level=high`, więc advisory w łańcuchu narzędzi budowania (m.in. znany
  łańcuch `electron-builder`) są **poza jej zasięgiem** i nie należą do tej gałęzi: Faza B nie
  dotyka `package-lock.json` ani żadnej zależności.

---

## 4. Break-testy — dowód, że każdy przyrząd naprawdę mierzy to, co deklaruje

`LAYOUT_PORT=5311 node scripts/break-visual-language.mjs` — jeden przebieg, seryjnie, na
dokładnie tym kodzie, który jest zakomitowany. Pięć złamań tej fali: trzy z Fazy 0 (PR #231),
czwarte należy do B1, piąte do B2. Każde złamanie to dwie przebudowy i dwa przeloty bramki,
więc cały harness uruchamia bramkę układu jedenaście razy.

| # | złamanie | plik | baza | złamanie | przywrócenie | werdykt |
|---|---|---|---|---|---|---|
| 1 | cofnij akcent do Black Glass — akcja główna, aktywna nawigacja i pierścień ogniska idą w neutral | `tokens.css` | GREEN | **RED** | GREEN | PASSED |
| 2 | zostaw akcent zdefiniowany i odepnij jednego konsumenta — akcja główna bieleje, a `--accent` zostaje fioletowy w arkuszu | `tokens.css` | GREEN | **RED** | GREEN | PASSED |
| 3 | wstaw nagłówek display z powrotem na `.surface-header` — tytuł ekranu znów rysuje się ponad sufitem crumbbara | `styles.css` | GREEN | **RED** | GREEN | PASSED |
| 4 | **(B1)** zdejmij tokenowe tło z `.secondary-button` — kontrolki, które tło MAJĄ, spadają do domyślnej farby silnika i spis widzi kształt, którego jego rejestr nie zna | `styles.css` | GREEN | **RED** | GREEN | PASSED |
| 5 | **(B2)** ułóż `.surface-header` jako `block` — jedyny ekran trzymający akcję w rzędzie tytułu gubi ją o wiersz, a przelot pasma traci swojego jedynego świadka | `styles.css` | GREEN | **RED** | GREEN | PASSED |

Zero pozycji `FAILED`, zero `aborted`.

**Złamania 4 i 5 padły MOCNIEJ niż pozostałe trzy** — i to jest różnica, o którą warto się tu
upomnieć. Trzy pierwsze raportują „the assertion went red on broken code”, czyli **kod wyjścia**
bramki poszedł na czerwono. Czwarte i piąte raportują „**the named** assertion went red”, bo
mają `expectRedContains` i żądają konkretnego fragmentu werdyktu w wyjściu:

- **#4** żąda `„which is neither fully transparent nor any of the"` i `„so no rule of this
  stylesheet set it"` — czyli czerwieni **nad podpisem spoza rejestru**, a nie czerwieni
  jakiegokolwiek innego przelotu tej samej bramki;
- **#5** żąda `„projects: this pass measured BELOW_BAND and the canonical screen list says
  IN_BAND"` **oraz** `„TITLE_BAND_NEVER_IN_BAND"` — czyli obu ścieżek naraz: rozjazdu z listą
  kanoniczną i strażnika „ani jeden ekran nie wrócił IN_BAND”.

Sam kod wyjścia nie odróżniłby ich ani od siebie, ani od czerwieni któregokolwiek z ośmiu
pozostałych przelotów tej bramki — a `display: block` na paśmie rusza również geometrię
mierzoną przez przeloty sprzed tej fazy.

**Trzecia liczba nie jest ozdobą.** Harness dowodzi przebudowy stemplem `tsBuildInfoFile`
i wymusza mtime źródła nowszy od stempla, bo przywrócenie z backupu bez tego zostawia zatruty
`dist/` i następne złamanie mierzy nieaktualny kod. Po przebiegu: `git status` **czysty**,
`git diff HEAD -- packages/` **pusty** — `tokens.css` i `styles.css` wróciły bajt w bajt.

---

## 5. Miejsce rejestracji

**Jedna zmiana rejestracyjna na przyrząd**, obie w `package.json:39`:
`scripts/control-paint.test.mjs` i `scripts/title-band-action.test.mjs` dopisane do
`test:scripts`. To są reguły **bez przeglądarki**, więc chodzą w `npm run check` i `npm run test`
na wszystkich trzech systemach.

**Sam pomiar przeglądarkowy nie wymagał ani jednej linii rejestracji**: oba przeloty siedzą
w `scripts/verify-renderer-layout.mjs`, a ten jest już zarejestrowany jako
`package.json:37 test:renderer-layout` → `.github/workflows/ci.yml:151`, zadanie `layout`
na `macos-26`.

**`scripts/run-check.mjs` i `.github/workflows/ci.yml` ŚWIADOMIE NIETKNIĘTE.** Dwa powody, oba
sprawdzalne: dopisanie kroku do `STEPS` złamałoby `assert.deepEqual` pinujący całe listy kroków
trzech suit (`run-check.test.mjs:169-204`), a `ci.yml:151` już woła bramkę układu, więc każde
dopisanie dałoby drugie wywołanie tego samego.

**Podział plików** jest zgodny z kryterium zapisanym w źródle tego repozytorium
(`record-screen-geometry.mjs:31-35`): pomiar wymagający przeglądarki jest **przelotem** w bramce
układu, przenośna reguła mieszka we własnym module z `.test.mjs` w `test:scripts`. Żaden nowy
samodzielny skrypt przeglądarkowy nie powstał.

---

## 6. Warunek przełączenia na tryb rzucający

Oba przeloty są dziś **raportujące**, zgodnie z regułą tego repozytorium: *pozycja nieoddana
RAPORTUJE; rzuca dopiero to, co oddane i zepsute*. Status jest zapisany w kodzie, nie w prozie
planu — bo prozy nikt nie kompiluje:

- `CONTROL_PAINT_STATUS = "pending: FAZA C, lot C3"` → `CONTROL_PAINT_ARMED` wyprowadzony przez
  porównanie z `"enforced"` (`control-paint.mjs:135-146`);
- `TITLE_BAND_ACTION_STATUS = "pending: FAZA C, lot C2"` → `TITLE_BAND_ACTION_ARMED`
  (`title-band-action.mjs:211-223`).

**B1 wolno uzbroić dopiero, gdy** lot C3 domknie reset przycisku (`styles.css:509-512` dostaje
`background`), po czym rejestr `KNOWN_CONTROL_PAINT` robi się **PUSTY**. Dopiero pusty rejestr
plus `enforced` znaczy „ani jedna narysowana kontrolka nie maluje się farbą, której nie ustawił
ten arkusz”.

**B2 wolno uzbroić dopiero, gdy** lot C2 przeniesie akcję główną do pasma na czterech ekranach
CRM i na Zadaniach, da slot akcji `LibraryShell` i `.meeting-hero` i zdejmie rząd akcji sprzed
tytułu na rekordzie projektu — po czym **każdy** wiersz `prototype: "action"` ma
`today: "IN_BAND"`, czyli `TITLE_BAND_DIVERGENCES` jest puste.

**Przełączenie wcześniej, przy niepustym rejestrze, zrobiłoby z bramki układu czerwień do końca
fali** — czyli przyrząd, który nie pilnuje niczego innego.

**Co rzuca JUŻ DZIŚ, mimo `pending`** — i to jest powód, dla którego `pending` nie znaczy
„wyłączony”:

- **B1:** każdy podmiot **spoza** rejestru (regresja oddanej roboty) oraz osiem awarii przyrządu
  — motyw niezastemplowany, cel z zerem kontrolek, sonda przezroczysta, paleta poniżej podłogi
  40, dwa motywy o identycznej palecie, świadek nienarysowany albo zgłoszony, wpis rejestru
  niespotkany, farba nierozkładalna.
- **B2:** każdy ekran **rozjechany** z kanoniczną listą (regresja albo dowieziona poprawka,
  o której lista nie wie) oraz dziewięć awarii przyrządu — `TITLE_BAND_NOT_MEASURED`,
  `TITLE_BAND_DESTINATIONS_DIVERGED`, `TITLE_BAND_NO_AFFORDANCE`, `TITLE_BAND_DID_NOT_ARRIVE`,
  `TITLE_BAND_ROW_UNTOUCHED`, `TITLE_BAND_ROW_UNDECLARED`, `TITLE_BAND_NO_DESTINATIONS`,
  `TITLE_BAND_NO_SETTINGS_ENTRY`, `TITLE_BAND_NEVER_IN_BAND`.

---

## 7. Czego te przyrządy NIE mierzą

Ta sekcja jest częścią produktu, nie przypisem. Przyrząd, którego zasięg nie jest nazwany,
czyta się jako pokrycie, którego nie ma.

### Wspólne dla obu

**Zielone na macOS znaczy zielone na macOS.** Zadanie `layout` w CI chodzi wyłącznie na
`macos-26` (`ci.yml:117-119`). Żaden z tych dwóch **pomiarów** nigdy nie biegł na Linuksie ani
na Windowsie. Ta sama fala zapłaciła już raz za ten mechanizm — para L1-01b padała tylko na CI,
przez `prefers-reduced-transparency: reduce` domyślne w bezgłowym Chromium na Linuksie. Same
**reguły** są przenośne i mają testy bez przeglądarki chodzące na trzech systemach; pomiary nie.

**Jedna szerokość, jedna fikstura.** Oba przeloty chodzą przy 1440×900 na fiksturze harnessu.
Przy 320 px i przy 200%/300% tekstu nie ma z nich żadnego pomiaru. Nie ma też pomiaru na realnych
danych Kacpra — a ta fala ma już zapisaną lekcję, że pusta albo za mała fikstura nie tylko nie
mierzy, ona **chowa**.

**Baza wyżej to JEDEN przebieg bramki, nie badanie stabilności.** Liczby z punktu 3 zostały
zmierzone raz. Oba przeloty przeszły zielono również sześć razy wewnątrz pętli break-testów, ale
te sześć chodziło na **innych stanach drzewa** (po złamaniu i po przywróceniu), więc nie są
powtórzeniami tego samego pomiaru. Repozytorium ma zapisaną lekcję, że jeden zielony przebieg
nie dowodzi niczego o teście mierzącym CZAS zamiast ZDARZENIA — potwierdzenia przybycia w obu
przelotach odpytują zdarzenie, a nie śpią, i to jest argument z konstrukcji, nie pomiar.
Traktuj bazę jako liczbę do porównania, nie jako liczbę o dowiedzionej stabilności.

**Żaden z nich nie otwiera dialogu, menu, popovera ani panelu deala**, i żaden nie wchodzi na
ekran kontekstu organizacji (nie jest odwiedzany przez ŻADNY przelot tej bramki). Cisza o tych
miejscach nie jest zdaniem o nich.

### B1 — spis farby kontrolek

- **Spis jest w SPOCZYNKU.** Nie otwiera ekranu rekordu i nie wchodzi w żaden stan interakcji.
  Poza jego zasięgiem zostają m.in. `.status-danger` za krokiem `confirming`
  (`RecordRemovalSection.tsx:84`, `TaskRemovalSection.tsx:60`), `.showAll` po wciśnięciu chipa,
  `.moveButton` w menu, `.wide` na rekordzie zadania.
- **Gradient wyklucza podmiot przed osądem.** Kontrolka z `background-image !== "none"` wychodzi
  jako PAINTED_IMAGE i nie jest sądzona — zmierzone w Chromium: przycisk malowany samym
  gradientem wylicza `background-color` dokładnie równe ButtonFace pod tym gradientem. Skutek
  uboczny: kontrolka z gradientem i **złym** kolorem pod nim przechodzi tu na zielono. Dziś
  1 taki podmiot na motyw.
- **Rejestr kluczuje na `ekran + podpis`, nigdy na liczbie elementów** — świadomie, żeby nie
  czerwienić na danych. Cena: jeżeli fikstura przestanie rysować **część** elementów danego
  kształtu, spis tego nie zauważy. Liczby są drukowane, nie asertowane.
- **Widzi tylko cele, które są pozycją nawigacji** (`.nav-item[data-surface]`,
  `[data-settings-entry]`) i ich soczewki. Powierzchnia, która przestanie być pozycją nawigacji,
  przestanie być mierzona.
- **Czyta WYŁĄCZNIE tło.** Natywna strzałka `<select>` (przyczyna C5) i kolor tekstu nie należą
  do tego przyrządu.
- **Nie zmierzono**, czy `appearance: auto` zmienia odczyt przy `forced-colors: active` — bramka
  nie emuluje tej preferencji w żadnym przelocie.
- **Podłoga palety `MINIMUM_TOKEN_PALETTE = 40` przy zmierzonych 55** (motyw ciemny) to 15
  wartości zapasu. Łapie **załamanie** enumeracji `--*`, nie pilnuje liczby tokenów.

### B2 — spis pozycji akcji głównej

- **Mierzę PION, nie POZIOM.** Dosunięcie akcji do prawej krawędzi pasma — o którym rejestr mówi
  wprost przy Odnowieniach i Organizacjach, i którego brakuje trzem z czterech crumbbarów CRM
  (tylko `pipeline.module.css:79-81` ma `margin-inline-start: auto`) — **nie jest sprawdzane**.
  Lot C2 może przenieść akcję do pasma, zostawić ją przy lewej krawędzi i przejść na zielono.
- **Kolumna `prototype` to CYTAT Z KODU, nie pomiar prototypu.** Nikt nie uruchomił prototypu
  w przeglądarce i nie zmierzył w nim ani jednego pudełka. Jeżeli prototyp rysuje coś inaczej,
  niż wygląda jego źródło (np. reguła `@media` chowa akcję), ten przyrząd tego nie zobaczy.
- **Granica sąsiedztwa ma zmierzoną ślepą plamę.** Do obszaru tytułu wchodzi tylko rodzeństwo
  **nie wyższe** od pasma; akcja włożona do rzędu chromu wyższego od pasma zostałaby przeoczona
  (dziś odpadają: `div._viewbar` 96,6 px, `section._section` 64 px i 106,9 px,
  `div.meeting-lanes` 624,4 px). Pomyłka idzie w stronę „brak akcji”, czyli w stronę czerwieni —
  ale to jest kierunek pomyłki, nie jej brak.
- **Nie odwiedza zakładek rekordu** (świadomie: `.crumbs` z `.actions` renderuje się poza panelem
  zakładki, więc każda zakładka pokazywałaby te same elementy) ani rekordów otwieranych inaczej
  niż dwuklikiem w `[data-project-row]`, `[data-task-row]`, `[data-pipeline-card]`.
- **Nie mierzy przy zawiniętym paśmie.** `.surface-header` ma `flex-wrap: wrap`
  (`styles.css:1826-1831`) postawione celowo, więc w wąskim oknie akcja **legalnie** stoi wiersz
  niżej i asercja czerwieniłaby zdrowy ekran.
- **`divergent` liczy WIERSZE tabeli, nie pomiary.** Dziś tożsame; w przebiegu z dryfem
  podsumowanie mogłoby nazwać rozjazdem ekran zmierzony jako `IN_BAND`.

---

## 8. Do decyzji Kacpra

Zebrane w jednym miejscu, bo każda z tych rzeczy zmienia zakres Fazy C i żadnej nie wolno
rozstrzygnąć samemu przy budowaniu.

**a) Dwa spisy tej samej roboty dają dwie różne liczby — trzeba je uzgodnić, ZANIM ktoś odhaczy
jedną i uzna drugą za zamkniętą.**

| przyczyna | plan / rejestr 71 rozjazdów | przyrząd Fazy B |
|---|---|---|
| C2 — akcja poza pasmem | **9** trafień | **8** ekranów |
| C3 — domyślna szarość przeglądarki | **4** trafienia | **14** kształtów / 27 elementów |

Zbiory nie są wymienne w żadną stronę. Rejestr liczy Notatki i Źródła osobno (jedno pasmo
`LibraryShell` — przyrząd liczy raz) oraz rekord projektu dwa razy; w zamian przyrząd nazywa
powierzchnię Zadań, której rejestr pod przyczyną C2 nie ma. Przy C3 rozjazd jest odwrotny
i większy: **jedna poprawka** (`styles.css:509-512` dostaje `background`) zamyka obie liczby
naraz, ale rejestr widział cztery ekrany, a spis widzi czternaście kształtów na pięciu.
**Ryzyko konkretne:** lot C3 odhaczy „cztery”, a rejestr `KNOWN_CONTROL_PAINT` nie zrobi się
pusty i B1 nie da się uzbroić.

**b) Żywa wada, która nie jest w rejestrze 71 rozjazdów.** `.status-danger` za krokiem
`confirming` (`RecordRemovalSection.tsx:84`, `TaskRemovalSection.tsx:60`) — kontrolka, którą
spis B1 **potwierdził jako prawdopodobną, ale której nie dosięga**, bo nie wchodzi w stan
interakcji. Do decyzji: dopisać do rejestru i do zakresu C3, czy zostawić na Fazę D.

**c) `L5-03b` nie da się dziś zmierzyć i wyjście jest WYBOREM, nie linijką.**
`[class*="_welcome_"]` w Źródłach rysuje się tylko przy `sources.length === 0`, a fikstura
harnessu ma źródła. Pusta lista zabiera przy okazji podmiot L5-06, L5-09a/b i L5-10. Albo ekran
dostaje afordancję zamykającą czytelnię, albo przelot dostaje **drugą fiksturę pustej
przestrzeni pod osobnym adresem harnessu** (dziś bramka robi jedno `goto` na motyw). Należy do
Lotu 5, nie do Fazy B.

**d) Czy uzbroić przyrządy w tej samej fali, czy zostawić `pending` do końca.** Warunki
przełączenia są zapisane rozstrzygalnie (punkt 6) i **żaden z nich nie jest spełniony**. Zapis
jest tak zrobiony, żeby lot C2 i C3 mogły je przełączyć jedną linią — ale to jest decyzja
o tym, kiedy bramka układu zaczyna blokować `main`.

**e) Blok budżetu w `verify-renderer-bundle.mjs:296-313` ma dwie liczby CSS o 25 B nieaktualne**
wobec `main` @75af233. Nie jest to regresja tej gałęzi (zero bajtów pod `packages/`), ale jest to
liczba, którą ktoś przy najbliższym locie przepisze albo od której zacznie ścigać ducha.

**f) Ten raport leży pod `docs/plans/`, który jest gitignorowany** (`.gitignore:8`) — zadanie
kazało go zakomitować, więc poszedł `git add -f`, wbrew konwencji tej fali, gdzie **żaden**
dokument fali nie jest śledzony (`git ls-files docs/plans` zwraca pustkę). Jeśli to niepożądane,
odwrócenie to jeden `git rm --cached`.
