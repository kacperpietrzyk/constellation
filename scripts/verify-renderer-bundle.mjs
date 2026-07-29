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
const limits = {
  // Ścieżka gorąca — twarda. Zapas liczony od baseline'u, nie „na wyrost".
  hotPathJavaScriptBytes: 620_000,
  hotPathJavaScriptGzipBytes: 168_000,
  hotPathStylesheetBytes: 200_000,
  // Sufit bezpieczeństwa — ustawiony raz, z zapasem. Nie podnosić per PR.
  totalJavaScriptBytes: 1_770_000,
  totalStylesheetBytes: 295_000,
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
