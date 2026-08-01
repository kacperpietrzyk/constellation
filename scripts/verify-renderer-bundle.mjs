import { gzipSync } from "node:zlib";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

// 2026-07-28 (przebudowa UI/UX → 0.2.0): bramka przepisana, bo miała dwie role
// naraz i przy przepisywaniu renderera zostałaby z gorszej z nich.
//
// Do tej pory pięć liczb mieszało „nie wciągnij przypadkiem czegoś wielkiego"
// z „udokumentuj każdy wzrost". Druga rola produkowała datowany komentarz przy
// każdej funkcji — historia tych podbić jest w gicie i tam zostaje. Przy
// przebudowie, w której zmienia się każdy ekran, ta rola dawałaby trzydzieści
// kolejnych wpisów i zagłuszyłaby pierwszą. Dlatego teraz:
//
//   ŚCIEŻKA GORĄCA (hotPath*) — wszystkie skrypty wejściowe plus wszystko, co
//   index.html deklaruje jako `modulepreload`, plus arkusze wpięte w <head>.
//   To jedyne liczby, które mają związek z tym, jak szybko pokazuje się okno.
//   Są TWARDE: przesuwa je wyłącznie zmiana z nazwanym, zmierzonym
//   uzasadnieniem. Wejście biblioteki animacji do powłoki ma tu pęknąć — to
//   jest decyzja, nie skutek uboczny. (Zmierzone: 129 kB Motion doklejone do
//   preładowanego chunka powłoki daje 722 640 B i bramka pada, podczas gdy oba
//   sufity zostają zielone — czyli tę robotę wykonuje wyłącznie ten budżet.)
//
//   SUFIT BEZPIECZEŃSTWA (total*) — jedna liczba na resztę, ustawiona RAZ,
//   z zapasem ok. 30%, i NIEPODNOSZONA przez PR-y ekranowe. Łapie „ktoś wciągnął
//   moment.js", nie „doszedł ekran". Zapas jest duży świadomie: pojedyncza
//   przypadkowa zależność poniżej ~400 kB przejdzie tu po cichu. Jeśli sufit
//   zaczyna przeszkadzać, to jest sygnał do rozmowy o zależnościach, a nie do
//   podniesienia liczby.
//
// Dwie asercje ważniejsze niż którakolwiek z tych liczb, bo pilnują własności,
// której rozmiar nie widzi:
//
//   1. PRZYNALEŻNOŚĆ EDYTORA. Stos tiptap/prosemirror/yjs (dziś ok. 531 kB)
//      jest poprawnie leniwy. Uzasadnienie tej asercji NIE jest takie, że
//      przeniesienie całego edytora do entry przeszłoby niezauważone — to było
//      moje pierwsze zdanie i jest FAŁSZYWE, sprawdzone: 531 kB nie mieści się
//      w 26 kB zapasu ścieżki gorącej, więc same budżety by pękły (choć suma
//      bajtów rzeczywiście się nie zmienia, a `largestLazy` wręcz POPRAWIA się
//      z 531 583 na 36 851 — liczba mająca sygnalizować ciężki leniwy chunk
//      wygląda lepiej, gdy aplikacja ma się gorzej).
//      Prawdziwym powodem jest WYCIEK CZĄSTKOWY: przypadkowy import z tiptapa
//      wciągnięty do komponentu powłoki. Zmierzone: 12 kB fragmentu edytora
//      doklejone do entry pada wyłącznie na przynależności, a przy pustej
//      liście markerów przechodzi z każdym budżetem na zielono.
//
//   2. CAŁY CSS, nie sam arkusz wejściowy. Poprzednia wersja dopasowywała
//      PIERWSZY <link> i sumowała wyłącznie pliki `.js`. Poza pomiarem leżało
//      36 371 B (16% CSS-a) w arkuszach leniwych powierzchni — dokładnie tam,
//      gdzie trafiają CSS Modules. Sprawdzone na starej wersji wyjętej z gita:
//      arkusz dołożony obok był dla niej niewidoczny nawet przy 5 MB.
//
// Trzy dziury znalezione przez adwersaryjny przegląd 28.07 i tu zamknięte,
// każda odtworzona zanim ją naprawiono:
//   - `html.match` zamiast `matchAll` mierzyło TYLKO PIERWSZY tag <script>.
//     Drugi <script type="module"> wskazujący na chunk edytora dawał wynik
//     BAJT W BAJT identyczny z bazowym, exit 0 — pół megabajta ładowane
//     natychmiast, liczone jako zero, a skan markerów w ogóle nie czytał tego
//     pliku, bo czyta wyłącznie to, co parser już uznał za gorące.
//   - sumy chodziły po `dist/assets` bez rekurencji i bez sprawdzenia
//     wiarygodności: przeniesienie plików do `dist/assets/js/` dawało
//     „JS total 0 B, CSS total 0 B" i exit 0.
//   - lista markerów zawierała słowa, które NORMALNIE WYSTĘPUJĄ W TEKŚCIE
//     interfejsu. `i18n-*.js` i `src-*.js` są na liście `modulepreload`
//     z definicji, więc całe copy aplikacji mieszka na ścieżce gorącej na
//     stałe; 95 bajtów tekstu pomocy o formacie dokumentów wywalało bramkę
//     komunikatem, który był nieprawdą. Do tego `yjs` jest podciągiem
//     zainstalowanego `linkifyjs`, a `"yjs-13"` istnieje jako znacznik
//     wersji formatu w wysyłanych `.d.ts`. Bramka chodzi wewnątrz `npm test`,
//     czyli wewnątrz `npm run check` — fałszywy alarm nie wywala jednej liczby,
//     tylko blokuje cały zestaw testów, zanim ruszy pierwszy. A najtańszą
//     „naprawą" dla zmęczonego człowieka jest skasowanie słowa z interfejsu
//     albo markera z listy. Dlatego markery są teraz wąskie i techniczne.
//
// Baseline zmierzony przy przepisaniu (build z 2026-07-28, gałąź
// agent/ui-ux-rebuild): ścieżka gorąca 593 640 B / 159 997 B gzip / CSS
// 189 089 B; całość 1 360 102 B JS i 225 460 B CSS; największy leniwy chunk
// 531 583 B (edytor).
// PODNIESIENIE ŚCIEŻKI GORĄCEJ, 2026-07-31, fala C (lot S — nasada). Zmierzone,
// czysty rebuild przed każdym odczytem, na tym worktree:
//
//   main @ 7bf3812, bez moich zmian     614 626 B / 167 978 B gzip
//   + useSurfaceDensity (pułapka 30)    614 675 B / 168 003 B gzip
//   + useListNavigation (Enter/spacja)  614 705 B / 168 018 B gzip
//   + client/workflow.ts `readSlice`    bez zmiany — nic go jeszcze nie importuje,
//                                       więc wypada przy tree-shakingu
//
// SEDNO, i to jest właściwe znalezisko: baseline wyżej (593 640 B / 159 997 B)
// dostał 26 360 B surowych i 8 003 B gzip zapasu. Fale A i B zjadły z tego
// 20 986 B i 7 981 B. Bramka zrobiła dokładnie to, do czego jest — i skończył
// jej się zapas. To nie jest „brakuje 18 bajtów", tylko „przydział się wyczerpał
// i nikt tego nie zauważył, dopóki następna fala nie poprosiła o miejsce".
//
// Podniesione OBIE liczby JS-owe, nie samo gzip: surowe 614 626 z 620 000 to
// 5 374 B, a pięć PR-ów ekranowych przebiłoby i to. CSS zostaje na 200 000 —
// 179 284 B daje 20 kB, a arkusze CRM-u to CSS Modules na leniwych chunkach.
//
// ROZMIAR NOWEGO SUFITU JEST WYLICZONY, a nie dobrany. Pierwsza wersja tego
// bloku stała na 172 000 i nie liczyła jednej rzeczy: **`packages/contracts`
// samo leży na ścieżce gorącej**, więc loty backendowe wydają z TEGO budżetu,
// nie z żadnego innego. Zmierzył to lot B od strony backendu. Rachunek:
//
//   zapas pod 172 000 po moim własnym wydatku            3 982 B
//   lot A, zmierzone i podane na PR #185                  +564 B
//   lot B, cztery komendy (dziś doszło `offer.update`)  ~+1 400 B
//   pięć PR-ów ekranowych (rejestr + ścieżki `Icon` +
//     dyspozytor + nawigacja)                           ~+2 500 B
//                                                       ----------
//   spodziewana suma                                   ~ 4 464 B
//
// 172 000 nie mieści tego z góry wiadomego rachunku, a sufit policzony na
// „nie starczy" gwarantowałby złamanie warunku 3 w połowie fali — czyli
// dokładnie ten nawyk „podnieś liczbę, dopisz komentarz", przeciwko któremu
// ten blok powstał. 174 000 to ≈ 6 kB nad `main` i zostawia ≈ 5 980 B po moim
// własnym wydatku. Surowe idzie tym samym krokiem: 648 000.
//
// WARUNKI TEGO PODNIESIENIA, wiążące dla każdego, kto to czyta:
//   1. To jest CAŁY przydział fali C — loty backendowe (A, B) i pięć PR-ów
//      ekranowych: wpis do rejestru, człon `Icon.tsx` z danymi ścieżki, wpis
//      w dyspozytorze, nawigacja. I nic poza tym.
//   2. Każdy PR fali podaje ZMIERZONĄ liczbę gzip i pozostały zapas. Skrypt
//      drukuje jedno i drugie, niezależnie od tego, czy przechodzi.
//   3. Żadnego drugiego podniesienia w tej fali. PR, który przekroczyłby 174 000,
//      zatrzymuje się i pyta. Jeżeli fala naprawdę potrzebuje więcej niż 6 kB
//      gzip ładowanych od razu, to jest rozmowa o tym, CO jest ładowane od
//      razu, a nie liczba do przesunięcia.
//   4. Podaje się to, co się ZMIERZYŁO, a nie to, czego się spodziewa: czysty
//      rebuild i cytat z własnej linii skryptu.
// PODNIESIENIE SUFITU ARKUSZY, 2026-07-31, fala C (lot Renewals), za zgodą
// koordynatora, po dowodzie że NIE MA CZEGO ODZYSKAĆ. Zmierzone, czysty rebuild
// przed każdym odczytem, na tym worktree:
//
//   main @ 8b0eda0 (po #191)          293 605 B CSS łącznie — zapas 1 395 B
//   + arkusz ekranu Odnowień            +9 711 B
//                                     -----------
//   drzewo tego PR-a                  303 316 B
//
// SEDNO, i jest to inne znalezisko niż przy ścieżce gorącej: 295 000 policzono
// od baseline'u 225 460 B (`:74-77`, build z 2026-07-28), kiedy aplikacja nie
// miała ANI JEDNEGO arkusza CRM. Fala C dołożyła ich pięć — wszystkie jako CSS
// leniwych chunków, czyli dokładnie tam, gdzie miały trafić — i `main` doszedł
// do 1 395 B zapasu SAM, zanim ten lot cokolwiek dodał. Organizations
// przekroczyłby ten sufit nawet gdyby tego ekranu nie było. Sufit, który łamie
// ZAPLANOWANA I ZAAKCEPTOWANA robota fali, nie łapie tycia — melduje, że jego
// baseline jest starszy niż projekt.
//
// Dlaczego 330 000, a nie więcej: 303 316 B zmierzone z tym arkuszem, plus
// Organizations (własny arkusz, ale oddaje 3 026 B ścieżki gorącej CSS) i lot
// pomocy na żądanie — to rzutuje na ~312 000. 330 000 zostawia ~6% nad
// rzutowanym stanem końcowym: dość, żeby fala się skończyła, ciasno na tyle,
// żeby liczba dalej coś znaczyła.
//
// Dowód, że nie ma czego odzyskać, podany PRZED liczbą: arkusz Odnowień ma 61
// klas zdefiniowanych i 61 używanych, zero martwych i zero brakujących; stoi
// w rodzinie sąsiadów (Lejek 9 461 B, Ludzie 7 342 B, rekord szansy 7 090 B,
// `access` 12 636 B).
//
// WARUNKI TEGO PODNIESIENIA, wiążące dla każdego, kto to czyta:
//   1. To pokrywa POZOSTAŁĄ robotę fali C — Organizations i lot pomocy — i nic
//      poza tym.
//   2. Liczba jest PRZEBAZOWANA na zamknięciu fali, świadomie, tak jak `:74-77`
//      zapisuje baseline z 2026-07-28. Sufit niesiony dalej na zwietrzałym
//      baselinie jest dokładnie tym, jak do tego doszło.
//   3. Każdy pozostały lot podaje ZMIERZONY `totalStylesheetBytes` i zapas —
//      tak samo, jak już podaje ścieżkę gorącą.
//   4. Żadnego drugiego podniesienia w tej fali. Lot, który przekroczyłby
//      330 000, zatrzymuje się i pyta.
//
// ── PRZEBAZOWANIE NA ZAMKNIĘCIU FALI C, 2026-07-31 ──────────────────────────
// Warunek 2 obu podniesień wyżej. Zmierzone na `main` @43587ea po zmergowaniu
// wszystkich piętnastu PR-ów fali, czystym rebuildem, cytat z linii skryptu:
//
//   ścieżka gorąca   631 114 B / 171 645 B gzip   (sufity 648 000 / 174 000)
//   CSS gorący       176 258 B                    (sufit  200 000)
//   JS łącznie     1 629 597 B                    (sufit 1 770 000)
//   CSS łącznie      308 750 B                    (sufit  330 000)
//   największy leniwy 603 238 B                   (sufit  700 000)
//
// TO JEST NOWY BASELINE. Kto czyta te liczby przy następnej fali, porównuje się
// z nimi, a nie z buildem z 2026-07-28 — bo właśnie porównywanie z martwym
// baselinem doprowadziło do 22 bajtów zapasu, których nikt nie zauważył.
//
// CO ZOSTAŁO Z ZAPASU, i to jest wynik do przeczytania, a nie do przemilczenia:
//   gzip ścieżki gorącej   2 355 B  (1,4% sufitu)
//   CSS łącznie           21 250 B  (6,4% sufitu)
//   surowy JS ścieżki     16 886 B  · JS łącznie 140 403 B · leniwy 96 762 B
//
// DWIE RZECZY DO ROZSTRZYGNIĘCIA PRZED NASTĘPNĄ FALĄ, świadomie NIEROZSTRZYGNIĘTE
// tutaj, bo podnoszenie sufitu bez roboty w ręku to ten sam nawyk, przeciwko
// któremu stoi cały ten blok:
//   • 2 355 B gzip nie pokryje żadnej fali ekranowej. Następna fala albo zaczyna
//     od nazwanego, ZMIERZONEGO podniesienia z projektem w ręku, albo od rozmowy
//     o tym, CO jest ładowane od razu. Nie od odkrycia w połowie, jak ta.
//   • `totalStylesheetBytes` przestał być sufitem BEZPIECZEŃSTWA: model z planu
//     daje mu ~30% zapasu, a 330 000 nad 308 750 to 6,4%. Albo dostaje rozmiar
//     zgodny ze swoją rolą, albo przestaje być tak nazywany. Jedno albo drugie —
//     nie zostawiać go w tym stanie po cichu.
//
// ── PODNIESIENIE SUFITU ARKUSZY, 2026-08-01, fala D (lot S1) ────────────────
// Rozstrzygnięcie drugiego z dwóch pytań zostawionych wyżej otwartych, podjęte
// PRZED robotą fali, z projektem w ręku — a nie w jej połowie. Rachunek stoi
// nad liczbą, bo to on jest uzasadnieniem, nie ona:
//
//   sufit dotychczasowy                                        330 000 B
//   main @3cfc099, zmierzone czystym rebuildem                 308 750 B  (zapas 21 250 B, 6,4%)
//   wycofanie `history` oddaje NA SUMIE                             ≈ 0 B
//   ---------------------------------------------------------------------
//   w co fala D ma się zmieścić                                  21 250 B
//   ile fala ekranowa NAPRAWDĘ kosztuje (fala C, zmierzone
//     end-to-end: 269 711 B @7bf3812 → 308 750 B @3cfc099)       39 039 B
//
// Nie mieści się, a luka nie jest marginalna — jest prawie dwukrotna. Oddanie
// jest zerowe, bo wycofanie `history` to SCALENIE TREŚCI: reguły `.history-*`
// nie znikają, tylko obsługują ten sam rejestr jako odczyt Biblioteki. (Sam
// `hotPathStylesheetBytes` oddaje realnie, i to jest inna liczba.)
//
// Rzutowany stan końcowy fali D, po stawce fali C: ~348 000 B. Model, którym
// ten sufit jest opisany w `:23-28`, to baseline × ok. 1,30:
//
//   348 000 × 1,30 ≈ 452 000  →  450 000
//
// CO TA LICZBA ZNACZY, i to jest ważniejsze niż ona sama: `totalStylesheetBytes`
// znowu JEST SUFITEM BEZPIECZEŃSTWA. Łapie „ktoś wciągnął framework CSS"
// i przestaje łapać „doszedł zaplanowany ekran". Koszt jest nazwany wprost
// i jest tym samym, który bliźniaczy sufit JS-owy ma przyjęty od początku
// (`:26-28` — pojedyncza przypadkowa zależność poniżej ~400 kB przechodzi po
// cichu): tutaj przejdzie po cichu pojedynczy zabłąkany arkusz poniżej ~100 kB.
//
// WARUNKI TEGO PODNIESIENIA, wiążące dla każdego, kto to czyta:
//   1. USTAWIONE RAZ i **NIE PRZEBAZOWANE NA ZAMKNIĘCIU TEJ FALI**. To jest
//      świadome uchylenie warunku 2 podniesienia z 2026-07-31 (`:157-166`)
//      — dla TEJ jednej liczby i tylko dla niej; ścieżka gorąca dalej podlega
//      przebazowaniu. Powód: przebazowywanie sufitu bezpieczeństwa po każdej
//      fali jest dokładnie tym, co zamieniło go w przydział na falę, i to
//      dlatego trzeba go dziś podnosić o 36%.
//   2. To pokrywa CAŁĄ falę D — trzy arkusze ekranowe (Notatki, Źródła,
//      Historia wrzutek jako odczyt), style węzłów obrazka i tabeli oraz
//      sekcję importu w Ustawieniach. I nic poza tym.
//   3. Każdy lot fali podaje ZMIERZONY `totalStylesheetBytes` i zapas — obok
//      `hotPathJavaScriptGzipBytes`, oraz obok `totalJavaScriptBytes`, który
//      jest drugą najciaśniejszą liczbą w tym pliku (zapas 140 403 B) i o
//      którego podanie nie proszono dotąd żadnego lotu.
//   4. Żadnego drugiego podniesienia w tej fali. Lot, który przekroczyłby
//      450 000, zatrzymuje się i pyta.
const limits = {
  // Ścieżka gorąca — twarda. Zapas liczony od baseline'u, nie „na wyrost".
  hotPathJavaScriptBytes: 648_000,
  hotPathJavaScriptGzipBytes: 174_000,
  hotPathStylesheetBytes: 200_000,
  // Sufit bezpieczeństwa — ustawiony raz, z zapasem. Nie podnosić per PR.
  totalJavaScriptBytes: 1_770_000,
  totalStylesheetBytes: 450_000,
  // Osobny sufit na największy leniwy chunk. Uwaga na uzasadnienie: dla NOWEGO
  // chunka sufit sumy pada wcześniej (przy +409 899 B), więc ten limit nigdy
  // nie zadziała pierwszy w tym scenariuszu. Zarabia na siebie przy WZROŚCIE
  // W MIEJSCU już istniejącego, największego chunka — tam jest o 241 kB
  // ciaśniejszy niż suma.
  largestLazyJavaScriptBytes: 700_000,
};

// Markery muszą być techniczne i wąskie: mają nie występować w prozie
// interfejsu ani w nazwie chunka. Sprawdzone na buildzie z 2026-07-28 —
// każdy występuje wyłącznie w chunku edytora i ZERO razy w którymkolwiek
// z 11 plików ścieżki gorącej (liczby w nawiasach to trafienia w chunku).
// Świadomie NIE używamy `ProseMirror`, `tiptap`, `yjs` ani `Hocuspocus`:
// pierwsze dwa pojawią się w tekście pomocy o formacie dokumentów, `yjs` jest
// podciągiem `linkifyjs`, a nazwa pliku źródłowego typu `TiptapEditor.tsx`
// wpisuje swój specyfikator do importującego chunka, więc łapałaby się nawet
// przy poprawnie leniwym edytorze.
const editorMarkers = [
  "addProseMirrorPlugins", // 21
  "ProseMirror-gapcursor", // 4
  "ProseMirror-selectednode", // 4
  "data-tiptap-style", // 2
  "__tiptap__private", // 1
];
// Erozja markerów jest cicha: sama zmiana ustawień minifikatora potrafi zetrzeć
// całe rodziny napisów, a wtedy asercja przynależności przestaje cokolwiek
// znaczyć, nie zapalając się ani razu. Wymagamy więc, żeby co najmniej dwa
// markery były wciąż OBECNE GDZIEKOLWIEK w buildzie. Próg dwóch, a nie
// wszystkich pięciu, żeby podbicie tiptapa kasujące jeden napis nie blokowało
// CI z powodu, który nie jest regresją.
const minimumSurvivingMarkers = 2;

const dist = path.join(process.cwd(), "packages", "desktop-ui", "dist");
const html = await readFile(path.join(dist, "index.html"), "utf8");

const entryPaths = [
  ...html.matchAll(/<script[^>]+src="\.\/([^"?]+\.js)"/gu),
].map((match) => match[1]);

const linkTags = [...html.matchAll(/<link\b[^>]*>/gu)].map((match) => match[0]);
const linkHref = (tag, relation) => {
  const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/u)?.[1];
  if (rel?.trim().toLowerCase() !== relation) return undefined;
  return tag.match(/\bhref\s*=\s*["']\.\/([^"'?]+)["']/u)?.[1];
};
const preloadPaths = linkTags
  .map((tag) => linkHref(tag, "modulepreload"))
  .filter((href) => href !== undefined && href.endsWith(".js"));
const stylesheetPaths = linkTags
  .map((tag) => linkHref(tag, "stylesheet"))
  .filter((href) => href !== undefined && href.endsWith(".css"));

// Pusty wynik parsowania to awaria pomiaru, nie wynik. Każdy przypadek dostaje
// własny komunikat — inaczej nie wiadomo, który przyrząd się zepsuł. Rzucamy
// PRZED wypisaniem pomiaru, żeby nie było mniejszej-ale-zielonej liczby, którą
// dałoby się wziąć za przejście.
if (entryPaths.length === 0) {
  throw new Error(
    "dist/index.html nie wskazuje ani jednego skryptu wejściowego renderera.",
  );
}
if (stylesheetPaths.length === 0) {
  throw new Error(
    "dist/index.html nie wpina ani jednego arkusza stylów renderera.",
  );
}
if (preloadPaths.length === 0) {
  throw new Error(
    "dist/index.html nie deklaruje ani jednego modulepreload — ścieżki gorącej nie da się zmierzyć.",
  );
}

const hotPathJavaScript = [...new Set([...entryPaths, ...preloadPaths])];

// Rekurencyjnie po CAŁYM `dist`, nie po samym `dist/assets`: arkusz albo skrypt
// położony obok (np. skopiowany z `public/`) uciekał wcześniej obu sumom.
// Zbieramy PRZED mierzeniem ścieżki gorącej, żeby brakujący plik dał własny
// komunikat, a nie surowy błąd odczytu z połowy pomiaru. Klucze mapy są
// POSIX-owe, bo takie są ścieżki w HTML-u: bez tej normalizacji na Windows
// separator systemowy nie zgadzałby się z żadnym `href` i CAŁA ścieżka gorąca
// przeklasyfikowałaby się po cichu na leniwą.
const walked = await readdir(dist, { recursive: true, withFileTypes: true });
const bundleFiles = new Map();
for (const entry of walked) {
  if (!entry.isFile()) continue;
  if (!entry.name.endsWith(".js") && !entry.name.endsWith(".css")) continue;
  const absolute = path.join(entry.parentPath ?? dist, entry.name);
  const relative = path.relative(dist, absolute).split(path.sep).join("/");
  bundleFiles.set(relative, absolute);
}

// Wiarygodność sum. Bez tego przeniesienie plików do podkatalogu dawało trzy
// budżety równe 0 B i zielone przejście — czyli bramka meldowała sukces,
// nie mierząc niczego.
const missingFromDisk = hotPathJavaScript
  .concat(stylesheetPaths)
  .filter((relative) => !bundleFiles.has(relative));
if (missingFromDisk.length > 0) {
  throw new Error(
    `index.html wskazuje pliki, których nie ma w zebranym buildzie: ${missingFromDisk.join(", ")}.`,
  );
}

let hotPathJavaScriptBytes = 0;
let hotPathJavaScriptGzipBytes = 0;
let totalJavaScriptBytes = 0;
let totalStylesheetBytes = 0;
let largestLazyJavaScriptBytes = 0;
const editorOnHotPath = [];
const survivingMarkers = new Set();

for (const [relative, absolute] of bundleFiles) {
  if (relative.endsWith(".css")) {
    totalStylesheetBytes += (await stat(absolute)).size;
    continue;
  }

  const contents = await readFile(absolute);
  const hot = hotPathJavaScript.includes(relative);
  totalJavaScriptBytes += contents.byteLength;
  if (hot) {
    hotPathJavaScriptBytes += contents.byteLength;
    hotPathJavaScriptGzipBytes += gzipSync(contents).byteLength;
  } else {
    largestLazyJavaScriptBytes = Math.max(
      largestLazyJavaScriptBytes,
      contents.byteLength,
    );
  }

  // Markery liczymy w KAŻDYM chunku, nie tylko w leniwych. Gdyby strażnik
  // erozji patrzył wyłącznie na leniwe, to przeniesienie edytora na ścieżkę
  // gorącą — czyli dokładnie ta regresja, dla której istnieje ta bramka —
  // opróżniałoby zbiór markerów i bramka meldowałaby „markery przestały
  // cokolwiek rozpoznawać" zamiast powiedzieć, co się naprawdę stało.
  const text = contents.toString("utf8");
  const found = editorMarkers.filter((marker) => text.includes(marker));
  for (const marker of found) survivingMarkers.add(marker);
  if (hot && found.length > 0) {
    editorOnHotPath.push({ file: relative, markers: found });
  }
}

let hotPathStylesheetBytes = 0;
for (const relative of stylesheetPaths) {
  hotPathStylesheetBytes += (await stat(bundleFiles.get(relative))).size;
}

if (totalJavaScriptBytes < hotPathJavaScriptBytes) {
  throw new Error(
    `Suma JavaScriptu (${totalJavaScriptBytes} B) jest mniejsza niż sama ścieżka gorąca (${hotPathJavaScriptBytes} B) — pomiar zebrał nie te pliki.`,
  );
}
if (totalStylesheetBytes < hotPathStylesheetBytes) {
  throw new Error(
    `Suma CSS-a (${totalStylesheetBytes} B) jest mniejsza niż sam arkusz wejściowy (${hotPathStylesheetBytes} B) — pomiar zebrał nie te pliki.`,
  );
}
if (survivingMarkers.size < minimumSurvivingMarkers) {
  throw new Error(
    `Tylko ${survivingMarkers.size} z ${editorMarkers.length} markerów edytora występuje jeszcze w buildzie — ` +
      "asercja przynależności przestała cokolwiek rozpoznawać. Wybierz nowe markery, nie kasuj sprawdzenia.",
  );
}

const measurements = {
  hotPathJavaScriptBytes,
  hotPathJavaScriptGzipBytes,
  hotPathStylesheetBytes,
  totalJavaScriptBytes,
  totalStylesheetBytes,
  largestLazyJavaScriptBytes,
};
const failures = Object.entries(limits).filter(
  ([key, limit]) => measurements[key] > limit,
);

console.log(
  `Renderer bundle: hot path ${measurements.hotPathJavaScriptBytes} B ` +
    `(${measurements.hotPathJavaScriptGzipBytes} B gzip) across ${hotPathJavaScript.length} chunks, ` +
    `hot path CSS ${measurements.hotPathStylesheetBytes} B, ` +
    `JS total ${measurements.totalJavaScriptBytes} B, CSS total ${measurements.totalStylesheetBytes} B, ` +
    `largest lazy JS ${measurements.largestLazyJavaScriptBytes} B.`,
);

for (const { file, markers } of editorOnHotPath) {
  console.error(
    `Edytor rich-text wszedł na ścieżkę gorącą: ${file} zawiera ${markers.join(", ")}. ` +
      `Stos tiptap/prosemirror/yjs ma zostać w leniwym chunku — inaczej okno wstaje wolniej, ` +
      `a żaden budżet rozmiaru tego nie pokaże, dopóki wyciek jest cząstkowy.`,
  );
}

for (const [key, limit] of failures) {
  console.error(
    `Budżet ${key} przekroczony: ${measurements[key]} B > ${limit} B.`,
  );
}

if (failures.length > 0 || editorOnHotPath.length > 0) {
  process.exitCode = 1;
}
