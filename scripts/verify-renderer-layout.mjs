// Pomiar UKŁADU renderera w prawdziwym silniku, lokalnie.
//
// Po co, skoro jest happy-dom: happy-dom NIE LICZY UKŁADU. Asercja o szerokości
// wygląda tam na pomiar, nie będąc nim. A dwie rzeczy, które psują ekran
// najczęściej — skalowanie tekstu do 200% i wąskie okno — objawiają się
// wyłącznie geometrią. Ten skrypt złapał przepełnienie nagłówka Kalendarza
// (612 px treści w pudełku 584 px), które inaczej wyszłoby dopiero z paczkowanego
// smoke'a: dwadzieścia minut i trzy systemy naraz.
//
// GDZIE TO CHODZI — poprawione, bo poprzednia wersja tego nagłówka była
// nieprawdziwa i to ją kosztowało: „runner CI nie ma ani przeglądarki, ani
// serwera dev" opisywało domyślny obraz runnera, a nie ograniczenie. Skutek
// był dokładnie taki, jak zapowiada zdanie niżej — bramka nie chodziła nigdzie
// poza czyimś laptopem, jej własna sprzeczna księgowość nie zaalarmowała
// nikogo przez cały pierwszy rundę fali D i wyszła dopiero dlatego, że dwa
// loty odpaliły ją z ręki.
//
//   * lokalnie, przed wypchnięciem ekranu:  npm run test:renderer-layout
//   * w CI: własne zadanie `layout` w `.github/workflows/ci.yml`, na JEDNYM
//     systemie — sufity w `descendant-overflow.mjs` są w PIKSELACH, a piksele
//     zależą od renderowania czcionek, więc rejestr zmierzony na trzech
//     systemach to trzy różne prawdy o jednej regule.
//
// Nadal NIE w `npm run check`: `check` musi chodzić z czystego klona bez
// przeglądarki, a Playwright celowo nie jest zależnością tego repo (patrz
// niżej). Zadanie CI dokłada go jawnym krokiem.
//
// Paczkowany smoke sprawdza to samo NA WYDANEJ APLIKACJI; ten skrypt jest
// szybką wersją tej samej gwarancji, żeby nie płacić cyklu paczkowania za
// literówkę w CSS.
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import {
  HORIZONTAL_SCROLL_ATTRIBUTE,
  KNOWN_DESCENDANT_OVERFLOWS,
  classifyDescendantOverflow,
  unusedRegistryEntries,
} from "./descendant-overflow.mjs";
import {
  classifyRecordScreenGeometry,
  classifyRecordScreenSweep,
} from "./record-screen-geometry.mjs";
import {
  classifyDeclarationCoverage,
  classifyDeclarationSet,
  declaredAttributeValues,
} from "./renderer-declarations.mjs";
import {
  classifyHeightBoundEvidence,
  classifyHeightBoundScreen,
  classifyHeightBoundSweep,
} from "./surface-height-bound.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5178;
const ORIGIN = `http://127.0.0.1:${PORT}`;
// Powłoka NIE WSTAJE pod gołym adresem — renderer wymaga mostka preload, więc
// w przeglądarce montuje ją harness deweloperski ze zaślepionym klientem.
const HARNESS = `${ORIGIN}/?surface=collaboration`;

// Playwright nie jest zależnością tego repo i nie ma nią być — `npm run check`
// ma się dać odtworzyć z czystego klona, a `npm ci --ignore-scripts` i tak
// pominąłby jego postinstall, więc wpis w `devDependencies` nie pobrałby
// przeglądarki, tylko złamał tamten warunek. Bierzemy go z cache'u npx; zadanie
// CI `layout` napełnia ten cache jawnym, PRZYPIĘTYM krokiem instalacji.
const playwrightCandidates = () => {
  const cache = path.join(os.homedir(), ".npm", "_npx");
  if (!existsSync(cache)) return [];
  return readdirSync(cache)
    .map((entry) => path.join(cache, entry, "node_modules", "playwright"))
    .filter((candidate) => existsSync(path.join(candidate, "index.mjs")));
};

// Cache npx potrafi trzymać KILKA wersji Playwrighta, a przeglądarka jest
// pobierana per wersja — pierwszy znaleziony katalog bywa tym, dla którego jej
// nie ma. Bierzemy więc pierwszy, który NAPRAWDĘ WSTAJE, zamiast pierwszego,
// który istnieje.
const openBrowser = async () => {
  const candidates = playwrightCandidates();
  const refusals = [];
  for (const candidate of candidates) {
    try {
      const { chromium } = await import(path.join(candidate, "index.mjs"));
      return await chromium.launch();
    } catch (error) {
      refusals.push(
        `${candidate}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      );
    }
  }
  throw new Error(
    [
      "LAYOUT_CHECK_NEEDS_PLAYWRIGHT: no usable Playwright + Chromium in the npx cache.",
      "Install one once, then re-run this check:",
      "  npx --yes playwright@latest install chromium",
      ...refusals,
    ].join("\n"),
  );
};

const server = spawn(
  "npm",
  [
    "run",
    "dev",
    "-w",
    "@constellation/desktop-ui",
    "--",
    "--port",
    String(PORT),
    "--strictPort",
  ],
  { cwd: root, stdio: "ignore" },
);

const stop = () => {
  server.kill("SIGTERM");
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const reachable = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(ORIGIN);
      if (response.ok) return true;
    } catch {
      // Pętla czeka wyłącznie na lokalny serwer.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

if (!(await reachable())) {
  stop();
  throw new Error(`LAYOUT_CHECK_SERVER_NOT_REACHABLE: ${ORIGIN}`);
}

// Ile wierszy musi się narysować, żeby pomiar cokolwiek znaczył. Fikstura
// niesie ich więcej; progi są niskie celowo, bo mają łapać „lista jest pusta",
// a nie pilnować dokładnej zawartości fikstury — to drugie robiłoby z bramki
// układu test danych i padałoby przy każdej edycji harnessu. Osobne progi na
// osobne listy: jedna suma przepuszczała wyzerowanie dokumentów, bo dobijały
// do niej same źródła.
const MINIMUM_ROWS = {
  libraryDocuments: 5,
  librarySources: 4,
  captureHistory: 5,
  // Nie wiersz, tylko ZNAKI TREŚCI notatki, i jest tu z powodu zmierzonego na
  // tym PR-ze: fikstura potrafi mieć komplet wierszy i PUSTĄ treść. Tak było —
  // dokument bez stempla formatu czytał się jako `plain-v1`, edytor odpalał
  // migrację, migracja podmieniała treść na pusty tekst starego korzenia,
  // a trzy strażniki liczby wierszy dalej świeciły na zielono. Próg jest pod
  // dolną granicą zmierzonego zbioru (1 771 znaków), bo pilnuje „pusto",
  // a nie długości.
  libraryNoteBody: 1_500,
};

// Tryb raportu: wypisz KAŻDE przepełnienie z werdyktem i nie przerywaj. Tak
// powstał rejestr długu niżej i tak się go odświeża — wpis wpisany z ręki, bez
// przebiegu, jest zgadywaniem.
//
// TRYB RAPORTU WYCISZA WYŁĄCZNIE WERDYKTY UKŁADU, a nie strażników samego
// przyrządu, i ten podział jest wynikiem defektu zmierzonego na `main`
// @1edcf40. Wcześniej `REPORT_ONLY` przeskakiwał całą pętlę klasyfikacji —
// razem z KSIĘGOWANIEM dopasowań rejestru — a kontrola „wpis nigdy nie
// dopasowany" na końcu nie była nim objęta wcale. Efekt: jeden przebieg
// wypisywał `library div.document-editor-shell +494px … known` i w tej samej
// konsoli twierdził, że ten wpis „was never met in any pass", po czym RZUCAŁ
// wyjątkiem linijkę po tym, jak sam napisał „no descendant verdict was
// enforced". Dwa loty przeczytały te dwa zdania i zgłosiły sprzeczne rzeczy.
// Przyrząd, który opowiada dwie różne historie zależnie od zmiennej
// środowiskowej, jest gorszy niż jego brak.
//
// Dlatego: dopasowania rejestru księgują się ZAWSZE, strażnicy pustego pomiaru
// (zero powierzchni, zero obiektywów, zero wierszy fikstury) padają ZAWSZE —
// bo raport zrobiony nad pustym ekranem to nie pomiar, tylko cisza z liczbami —
// a tryb raportu zdejmuje tylko to jedno: czy przepełnienie robi się błędem.
const REPORT_ONLY = process.env.LAYOUT_DESCENDANT_REPORT === "1";

// ── PODMIOTY WYPROWADZONE ZE ŹRÓDEŁ, NIE WYPISANE OBOK NICH ──────────────────
// Do #213 włącznie ten plik niósł `for (const kind of ["project", "task"])` —
// dwuelementową listę ekranów rekordu stojącą obok kodu, który decyduje, ile
// ich jest. Ekranów jest TRZY. Ta sama funkcja czyta drugą deklarację, po której
// bierze podmioty pierwszy pionowy przelot tej bramki.
const RENDERER_SOURCE = path.join(root, "packages", "desktop-ui", "src");
const derive = (attribute) => {
  const found = declaredAttributeValues({ root: RENDERER_SOURCE, attribute });
  const decision = classifyDeclarationSet({ attribute, ...found });
  if (decision.verdict !== "derived")
    throw new Error(`RENDERER_LAYOUT_INVALID:\n${decision.reason}`);
  return decision.values;
};
const DECLARED_RECORD_KINDS = derive("data-record-kind");
const DECLARED_HEIGHT_BOUND = derive("data-height-bound");

// Jeden przelot: otwórz każdy cel z nawigacji i sprawdź, czy powierzchnia mieści
// się w swoim pudełku, a dokument w oknie. Zwracamy WSZYSTKIE przewinienia, nie
// pierwsze — inaczej naprawa jednego ekranu ukrywa drugi.
const sweep = async (browser, { width, fontSize, label, surfaces }) => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  // DWIE listy, bo to dwa różne rodzaje złej wiadomości. `failures` to awarie
  // PRZYRZĄDU — nic się nie narysowało, lista jest pusta, strona rzuciła —
  // i pada w każdym trybie, bo raport nad niczym nie jest raportem.
  // `layoutProblems` to WERDYKTY o układzie, czyli to, co tryb raportu
  // wypisuje zamiast egzekwować.
  const failures = [];
  const layoutProblems = [];
  page.on("pageerror", (error) =>
    failures.push({ surface: "-", reason: `page error: ${String(error)}` }),
  );
  await page.goto(HARNESS, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const measured = await page.evaluate(
    async ({ fontSize, scrollAttribute, surfaces }) => {
      const frame = () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      if (fontSize) document.documentElement.style.fontSize = fontSize;
      await frame();
      // A SCOPED PASS visits only the destinations it names. It exists so a
      // screen can be held to a width the rest of the shell is not yet held to
      // — Wave D's Notes ships a declared collapse order for 364 px and ~540 px
      // while nine other destinations still fail a 300% pass, and that is the
      // interface-scaling thread, not this one. Scoping it is not a weakening:
      // `ceilings` are keyed by PASS LABEL and a missing ceiling is a
      // violation, so an unscoped new pass would turn every debt entry in the
      // registry red at once and the only cheap fix would be raising them.
      const all = [...document.querySelectorAll(".nav-item[data-surface]")].map(
        (item) => item.dataset.surface,
      );
      const ids =
        surfaces === undefined
          ? all
          : all.filter((id) => surfaces.includes(id));
      const missing =
        surfaces === undefined
          ? []
          : surfaces.filter((id) => !all.includes(id));
      const results = [];
      const descendants = [];
      const recordScreens = [];
      const heightBound = [];
      // Ile wierszy i kart NADAJĄCYCH SIĘ DO OTWARCIA narysował każdy cel.
      // Liczone po KSZTAŁCIE atrybutu (`…Row`, `…Card`), nie po wypisanej
      // liście selektorów, bo lista byłaby dwudziestym drugim miejscem tej samej
      // rodziny. Służy jednemu zdaniu w raporcie: który cel nie miał czego
      // otworzyć — czyli o którym ten przebieg nie mówi nic.
      const openableRows = {};
      const openAttempts = [];
      const rowCounts = {
        libraryDocuments: 0,
        librarySources: 0,
        captureHistory: 0,
        libraryNoteBody: 0,
      };
      let recordPanels = 0;
      let lensesDeclared = 0;
      const recordKinds = [];
      // Nazwa elementu, po której da się go rozpoznać w rejestrze długu i w
      // raporcie. Sam znacznik nie wystarcza (`div` jest wszędzie), a pełna
      // ścieżka od korzenia zmienia się przy każdej zmianie zagnieżdżenia
      // i unieważniałaby rejestr przy przeprowadzce panelu, która niczego nie
      // psuje. Nazwa musi też PRZEŻYĆ REBUILD: CSS Modules dokleja skrót treści
      // arkusza (`_title_1kitm_195`), więc jedna edycja arkusza zmieniałaby
      // nazwy wszystkich jego klas i unieważniała cały rejestr długu naraz —
      // rejestr, który sam się kasuje przy przebudowie, nie pilnuje niczego.
      // Zostaje część czytelna dla człowieka.
      const normaliseClass = (token) => {
        const match = /^_(.+)_[a-z0-9]{5,7}_\d+$/u.exec(token);
        return match === null ? token : `_${match[1]}`;
      };
      const signature = (element) => {
        const tag = element.tagName.toLowerCase();
        const classes = [...element.classList].map(normaliseClass).join(".");
        return classes === "" ? tag : `${tag}.${classes}`;
      };
      // WSZYSTKO poniżej narysowanej powierzchni, nie samo pierwsze dziecko.
      // Element schowany za deklaracją `[data-scrolls-horizontally]` — sam albo
      // przez przodka — jest wolno szeroki: region POWIEDZIAŁ, że się przewija.
      // SZEROKOŚĆ TREŚCI, nie `clientWidth`, i cała ta funkcja jest o tej
      // różnicy. Zapadnięty ekran rekordu miał `clientWidth` równy 48 —
      // dokładnie tyle, ile ma własnego paddingu — i szerokość treści równą
      // ZERO. Kontrola nad samym `clientWidth` zobaczyłaby czterdzieści osiem
      // pikseli i uznała, że coś tam jest.
      const contentBox = (element) => {
        const style = window.getComputedStyle(element);
        const pad =
          (Number.parseFloat(style.paddingLeft) || 0) +
          (Number.parseFloat(style.paddingRight) || 0);
        const max = Number.parseFloat(style.maxWidth);
        return {
          content: element.clientWidth - pad,
          maxWidth: Number.isFinite(max) ? max : null,
        };
      };
      // Podmioty biorą się z DOM-u po `[data-record-kind]` — czyli z rejestru
      // rodzajów rekordu, bo to on decyduje, co się rysuje — a NIE z listy
      // nazw ekranów wypisanej tutaj. Czwarty rodzaj rekordu jest objęty w dniu,
      // w którym powstaje.
      const sweepRecordScreens = (drawn, label) => {
        if (drawn === undefined) return;
        for (const screen of drawn.querySelectorAll("[data-record-kind]")) {
          if (screen.getClientRects().length === 0) continue;
          const pane = screen.parentElement;
          if (pane === null) continue;
          const own = contentBox(screen);
          recordScreens.push({
            surface: label,
            kind: screen.getAttribute("data-record-kind") ?? "record",
            signature: signature(screen),
            contentPx: own.content,
            maxWidthPx: own.maxWidth,
            paneContentPx: contentBox(pane).content,
          });
        }
      };
      // ── PIERWSZY PIONOWY POMIAR TEJ BRAMKI ────────────────────────────────
      // Wszystko powyżej pyta o `scrollWidth - clientWidth`. Ta funkcja pyta
      // o wysokość, i to w dwie strony naraz: czy ekran MIEŚCI SIĘ w panelu
      // (sufit) i czy została mu jeszcze czytelnia (podłoga). Podmioty biorą się
      // z deklaracji `data-height-bound`, korzeń i panel — strukturalnie, jako
      // rodzic i dziadek pudełka czytelni.
      const sweepHeightBound = (drawn, label) => {
        if (drawn === undefined) return;
        for (const reading of drawn.querySelectorAll("[data-height-bound]")) {
          if (reading.getClientRects().length === 0) continue;
          const screenRoot = reading.parentElement;
          const pane = screenRoot?.parentElement;
          if (screenRoot === null || pane === null || pane === undefined)
            continue;
          const inner = reading.firstElementChild;
          // PANELE LICZĄ SIĘ TYLKO TAM, GDZIE STOJĄ OBOK SIEBIE, i to jest
          // reguła nad KSZTAŁTEM, nie lista odczytów. Odczyt ułożony w jedną
          // kolumnę — historia wrzutek zawsze, notatki i źródła po zwinięciu —
          // JEST kolumną do przewinięcia, więc „każdy panel przewija się
          // u siebie" nie ma tam czego znaczyć. Dwa tory w gridzie albo więcej
          // znaczą, że drzewo stoi obok notatki, a wtedy przewinięcie notatki
          // nie ma prawa zabrać drzewa.
          const tracks =
            inner === null
              ? []
              : window
                  .getComputedStyle(inner)
                  .gridTemplateColumns.split(" ")
                  .filter((track) => track !== "" && track !== "none");
          const panelsSideBySide = tracks.length >= 2;
          const panels = inner === null ? [] : [...inner.children];
          heightBound.push({
            name: reading.getAttribute("data-height-bound") ?? "-",
            surface: label,
            paneClientPx: pane.clientHeight,
            rootHeightPx: screenRoot.offsetHeight,
            rootClientPx: screenRoot.clientHeight,
            rootScrollPx: screenRoot.scrollHeight,
            readingClientPx: reading.clientHeight,
            readingScrollPx: reading.scrollHeight,
            panelsSideBySide,
            panelCount: panels.length,
            somethingScrolls:
              reading.scrollHeight > reading.clientHeight + 1 ||
              panels.some(
                (panel) => panel.scrollHeight > panel.clientHeight + 1,
              ),
          });
        }
      };
      const sweepDescendants = (drawn, label) => {
        if (drawn === undefined) return;
        const overflowing = [];
        for (const element of drawn.querySelectorAll("*")) {
          const overflowPx = element.scrollWidth - element.clientWidth;
          if (overflowPx <= 0) continue;
          // Element bez pudełka nie ma geometrii do zmierzenia, a `scrollWidth`
          // policzony na czymś, czego nie widać, jest szumem, nie wynikiem.
          if (element.getClientRects().length === 0) continue;
          // Narzędzie „tylko dla czytnika ekranu" to pudełko 1×1 px z pełnym
          // zdaniem w środku — zawsze przepełnione i NIGDY widoczne. Odsiewane
          // po KSZTAŁCIE (pudełko nie ma wymiaru), nie po nazwie klasy, żeby
          // reguła nie była listą nazw, która rozjedzie się z arkuszem.
          if (element.clientWidth <= 1 || element.clientHeight <= 1) continue;
          // Pole tekstowe przewija SWOJĄ TREŚĆ z natury: `scrollWidth` mówi tu
          // o długości wpisanego napisu, nie o tym, że kontrolka nie mieści się
          // w układzie. Mierzone jest samo pole, więc wpis użytkownika nie jest
          // defektem układu.
          if (
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement
          )
            continue;
          overflowing.push({
            element,
            surface: label,
            signature: signature(element),
            overflowPx,
            declaresHorizontalScroll:
              element.closest(`[${scrollAttribute}]`) !== null,
            overflowX: window.getComputedStyle(element).overflowX,
          });
        }
        // TYLKO NAJGŁĘBSZY. Jedno zbyt szerokie pudełko rozpycha każdego swojego
        // przodka, więc bez tego jeden defekt ekranu rekordu meldował się
        // dwadzieścia pięć razy — a rejestr długu, w którym jeden defekt zajmuje
        // dwadzieścia pięć wierszy, jest nie do przeczytania i przez to martwy.
        // Naprawa najgłębszego elementu naprawia całą kolumnę nad nim.
        const widest = new Map();
        for (const candidate of overflowing) {
          if (
            overflowing.some(
              (other) =>
                other.element !== candidate.element &&
                candidate.element.contains(other.element),
            )
          )
            continue;
          const previous = widest.get(candidate.signature);
          if (
            previous !== undefined &&
            previous.overflowPx >= candidate.overflowPx
          )
            continue;
          // Element DOM zostaje w przeglądarce: `page.evaluate` serializuje
          // wynik, a węzeł nie przechodzi przez tę granicę.
          widest.set(candidate.signature, {
            surface: candidate.surface,
            signature: candidate.signature,
            overflowPx: candidate.overflowPx,
            declaresHorizontalScroll: candidate.declaresHorizontalScroll,
            overflowX: candidate.overflowX,
          });
        }
        descendants.push(...widest.values());
      };
      for (const id of ids) {
        // Settings is a MODE: entering it replaces the left column, so the nav
        // item for the next destination is not there to click. Without leaving
        // first, every destination after Settings measured Settings again — the
        // sweep reported thirteen surfaces while looking at one. Found by a
        // guard that asked whether the lens sweep had measured anything at all.
        const back = document.querySelector("[data-settings-back]");
        if (back instanceof HTMLElement) {
          back.click();
          await frame();
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
        const target = document.querySelector(
          `.nav-item[data-surface="${id}"]`,
        );
        if (!(target instanceof HTMLElement)) {
          results.push({
            surface: id,
            present: false,
            surfaceWidth: 0,
            surfaceClientWidth: 0,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
          });
          continue;
        }
        target.click();
        await frame();
        await new Promise((resolve) => setTimeout(resolve, 700));
        await frame();
        const work = document.querySelector('#main-content[role="tabpanel"]');
        // Re-found on every measurement, never captured once: switching lens
        // replaces the drawn element, so a stale reference would report the
        // geometry of the layout that just left.
        const measure = (label) => {
          const drawn = [...(work?.children ?? [])].find(
            (element) =>
              element.getClientRects().length > 0 &&
              !element.classList.contains("shell-tabbar") &&
              !element.classList.contains("capture-dock"),
          );
          results.push({
            surface: label,
            present: drawn !== undefined,
            surfaceWidth: drawn?.scrollWidth ?? 0,
            surfaceClientWidth: drawn?.clientWidth ?? 0,
            // Korzeń powierzchni idzie przez ten sam rejestr długu co potomek:
            // inaczej jedno przepełnienie ma dwie różne reguły w zależności od
            // tego, na której wysokości drzewa się trafiło.
            signature: drawn === undefined ? "-" : signature(drawn),
            overflowX:
              drawn === undefined
                ? "visible"
                : window.getComputedStyle(drawn).overflowX,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
          });
          sweepDescendants(drawn, label);
          sweepRecordScreens(drawn, label);
          sweepHeightBound(drawn, label);
          // Ile wierszy NAPRAWDĘ się narysowało. Bez tego fikstura może się
          // opróżnić, a bramka dalej melduje „brak przepełnienia" — nad
          // geometrią, której nie ma.
          //
          // TRZY OSOBNE LICZBY, nie jedna suma, i to jest wynik break-testu:
          // przy jednej sumie wyzerowanie listy DOKUMENTÓW przechodziło na
          // zielono, bo same źródła dobijały do progu. Sumowanie różnych rzeczy
          // daje strażnika, który milczy o tej, która zniknęła.
          //
          // Liczone selektorem na KAŻDEJ powierzchni, nie pod etykietą
          // `library`: historia przechwyceń przenosi się do Library w tej fali,
          // a strażnik przywiązany do nazwy celu przestałby wtedy liczyć,
          // niczego nie zgłaszając.
          const count = (selector) =>
            drawn?.querySelectorAll(selector).length ?? 0;
          rowCounts.libraryDocuments = Math.max(
            rowCounts.libraryDocuments,
            count(".knowledge-document-list > li"),
          );
          // TEN SELEKTOR JEST NOŚNY I EKRAN ŹRÓDEŁ O TYM WIE. Lista źródeł to
          // dziś JEDEN `role="listbox"` z czterema grupami — po jednej na
          // rodzaj — i została `<ul>`/`<li>` (z `role="presentation"` na
          // `<ul>`) WYŁĄCZNIE po to, żeby ta liczba dalej coś liczyła.
          // Przepisanie jej na `<div>`-y, jak w `ProjectClientsLayout`, wyzeruje
          // ten licznik po cichu, a komunikat niżej wyśle czytającego szukać
          // defektu ekranu, którego nie ma. Kto to zmienia, zmienia RÓWNIEŻ ten
          // selektor — wiersz niesie `data-source-row`.
          rowCounts.librarySources = Math.max(
            rowCounts.librarySources,
            count(".source-list > li"),
          );
          rowCounts.captureHistory = Math.max(
            rowCounts.captureHistory,
            count(".history-row"),
          );
          rowCounts.libraryNoteBody = Math.max(
            rowCounts.libraryNoteBody,
            drawn?.querySelector(".document-canvas")?.textContent?.length ?? 0,
          );
        };
        measure(id);
        openableRows[id] = [...(work?.querySelectorAll("*") ?? [])].filter(
          (element) =>
            Object.keys(element.dataset).some((key) =>
              /(?:Row|Card)$/u.test(key),
            ),
        ).length;
        // A destination can carry several LENSES over the same records, and the
        // widest of them — a board of columns, a table of eight — is exactly
        // where a narrow window or scaled text overflows. Sweeping only the
        // default lens would report a pass for geometry nobody measured.
        const lenses = [...(work?.querySelectorAll("[data-layout]") ?? [])];
        lensesDeclared += lenses.length;
        for (const lens of lenses) {
          const label = lens.getAttribute("data-layout");
          if (label === null) continue;
          lens.click();
          await frame();
          await new Promise((resolve) => setTimeout(resolve, 700));
          await frame();
          measure(`${id}:${label}`);
        }
        // Back to the lens the destination opens on, before opening a record.
        // The sweep above leaves the surface on the LAST layout, and the last
        // layout is not always one that draws rows — a calendar draws days. The
        // record sweep below then found nothing to open and reported, in
        // silence, that a screen had been measured when none had.
        const first = lenses[0];
        if (lenses.length > 0 && first instanceof HTMLElement) {
          first.click();
          await frame();
          await new Promise((resolve) => setTimeout(resolve, 700));
          await frame();
        }

        // A destination can also OPEN a record, and the record is a different
        // screen — its own header, its own tab bar, a reading column and a rail.
        // Sweeping only the collection reported a pass for geometry nobody
        // measured: this gate visited Projects thirteen times without once
        // seeing the screen a project opens as.
        //
        // What this DOES catch, verified by breaking it: a record that renders
        // nothing, and a page that grows past the window. What it does NOT catch
        // is the same blind spot every other surface has here — a box made wider
        // than its parent is absorbed, because `scrollWidth > clientWidth` asks
        // whether CONTENT overflows its own box, and the scroll containers on
        // this shell are designed to let wide content scroll inside them. Two
        // deliberate breaks (a 90rem minimum on the record screen, then on the
        // surface root) both passed. Stated rather than implied, so nobody reads
        // a green run here as a promise it does not make.
        // TWO kinds of row open a record, and they do not open the same screen.
        // A task record has three sections where a project has five, and its
        // Overview is a reading column at full width beside a rail — the geometry
        // that has already gone wrong on five surfaces when fixed tracks met real
        // prose. Sweeping only `[data-project-row]` reported a pass for a screen
        // this gate had never seen, which is the same mistake one kind earlier.
        // Records are opened only at a width the PRODUCT can actually be at.
        // `BrowserWindow` sets `minWidth: 760` (desktop-main/src/main.ts:111), so
        // a 320 px window is a stress case for the collections — which do have to
        // survive it, and are still swept there — and not a state a record can be
        // read in. At 320 the sidebar alone is 220, leaving a hundred pixels: a
        // record drawn into that is not a layout defect to fix but a window the
        // OS refuses to make. The 200%-text pass is the real narrow-pane case and
        // it DOES open records.
        // AND THE THIRD KIND IS REACHED FROM HERE TOO, so the derived set is
        // not derived against a door only two of its members have. A pipeline
        // card and a renewal row both open the opportunity record; neither is
        // drawn by today's harness fixture, so adding them changes nothing
        // measured today and covers the screen on the day the fixture does.
        const row =
          window.innerWidth >= 760
            ? work?.querySelector(
                "[data-project-row], [data-task-row], [data-pipeline-card], [data-renewal-row]",
              )
            : null;
        if (row instanceof HTMLElement) {
          row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
          await frame();
          await new Promise((resolve) => setTimeout(resolve, 900));
          await frame();
          const opened = document.querySelector("[data-record-kind]");
          openAttempts.push({
            surface: id,
            kind: opened?.getAttribute("data-record-kind") ?? null,
          });
          const kind = opened?.getAttribute("data-record-kind") ?? "record";
          measure(`${id}:${kind}`);
          // Every tab, because the panels differ in kind: a reading column, a
          // list of rows, a stream. The widest of them is where a narrow window
          // overflows, and it is not the one the record opens on.
          const tabs = [
            ...(document.querySelectorAll('[role="tab"][data-record-tab]') ??
              []),
          ];
          for (const tab of tabs) {
            const label = tab.getAttribute("data-record-tab");
            if (label === null || !(tab instanceof HTMLElement)) continue;
            tab.click();
            await frame();
            await new Promise((resolve) => setTimeout(resolve, 500));
            await frame();
            measure(`${id}:${kind}:${label}`);
          }
          if (tabs.length > 0) recordKinds.push(kind);
          recordPanels += tabs.length;
        }
      }
      return {
        ids,
        missing,
        results,
        descendants,
        recordScreens,
        heightBound,
        openableRows,
        openAttempts,
        rowCounts,
        recordPanels,
        recordKinds,
        lensesDeclared,
      };
    },
    { fontSize, scrollAttribute: HORIZONTAL_SCROLL_ATTRIBUTE, surfaces },
  );

  if (measured.missing.length > 0) {
    failures.push({
      surface: "-",
      reason: `this pass names ${measured.missing.join(", ")} and the shell drew no such destination — a scope that matches nothing measures nothing`,
    });
  }
  if (surfaces === undefined && measured.ids.length < 5) {
    failures.push({
      surface: "-",
      reason: `only ${measured.ids.length} destinations rendered — an empty sweep is a broken measurement, not a pass`,
    });
  }
  // The lens sweep is the part most likely to measure nothing while looking
  // green: a destination whose data slice is unavailable renders a refusal with
  // no layout buttons at all, so the loop finds none and the pass is vacuous.
  // DERIVED, not a pinned four: the sweep now counts how many `[data-layout]`
  // lenses each destination DECLARED and requires that every one was measured.
  // The old constant said nothing about a scoped pass and would have had to be
  // guessed for each new one — a number a registry can answer is exactly the
  // kind of assertion this wave keeps finding rotten.
  const lensesMeasured = measured.results.filter((entry) =>
    entry.surface.includes(":"),
  ).length;
  if (measured.lensesDeclared === 0) {
    failures.push({
      surface: "-",
      reason:
        "no destination declared a [data-layout] lens — either the shell stopped marking its switchers or this pass opened nothing",
    });
  } else if (lensesMeasured < measured.lensesDeclared) {
    failures.push({
      surface: "-",
      reason: `${lensesMeasured} of ${measured.lensesDeclared} declared lenses were measured — a destination with several layouts drew none of them, so this pass covers geometry nobody looked at`,
    });
  }
  // The same trap one level down, and it is the one that bit: an opened record
  // is a DIFFERENT screen from the collection that opens it, and this gate
  // swept Projects thirteen times without ever seeing it. A workspace whose
  // rows never rendered would now pass here in silence, so the count is a
  // failure rather than a shrug.
  // The record guards apply only to a sweep that was ALLOWED to open records.
  // Below the product's own minimum window width the sweep deliberately does
  // not, and demanding a record there would turn a stated exclusion into a
  // failure that never had anything to do with the layout.
  // A SCOPED pass never visits the destinations a record opens from, so
  // demanding one there would turn a stated exclusion into a failure that has
  // nothing to do with the widths being measured.
  const recordsExpected = width >= 760 && surfaces === undefined;
  if (recordsExpected && measured.recordPanels < 5) {
    failures.push({
      surface: "-",
      reason: `only ${measured.recordPanels} record panels were measured — no project opened, so the record screen's geometry is untested and this pass says nothing about it`,
    });
  }
  // And a COUNT is not the guard, because two kinds of record open here and one
  // of them has five sections against the other's three: eight panels and five
  // panels both clear the number above while the task record goes unseen. The
  // kinds are named instead, so a screen that stops opening fails by name.
  // DERIVED FROM THE SOURCE, not from a pair written beside it. The old
  // `["project", "task"]` could not name a third screen, and there is one:
  // `OpportunityRecordScreen.tsx` has carried `data-record-kind="opportunity"`
  // since Wave C and no pass has ever opened it.
  //
  // AND THE DERIVED SET DOES NOT ALL OPEN, WHICH IS THE POINT OF SAYING IT OUT
  // LOUD. Measured today: the harness fixture holds no opportunities and no
  // renewals, so `pipeline` and `renewals` draw ZERO rows and there is nothing
  // to double-click. Failing on that would ship a red gate for a fixture gap
  // that is owned elsewhere; being silent about it would let a green run read
  // as coverage. So the unreachable members are NAMED on every run, including
  // a perfect one — "never opened" and "fine" are different sentences and this
  // gate says the second one only when it measured it.
  const kindCoverage = classifyDeclarationCoverage({
    declared: recordsExpected ? DECLARED_RECORD_KINDS : [],
    measured: measured.recordKinds,
  });
  if (recordsExpected && kindCoverage.verdict === "measured-nothing") {
    failures.push({ surface: "-", reason: kindCoverage.reason });
  }
  if (recordsExpected) {
    const blind = Object.entries(measured.openableRows)
      .filter(([, count]) => count === 0)
      .map(([id]) => id);
    console.log(
      `${label}\trecord kinds declared in the renderer: ${DECLARED_RECORD_KINDS.join(", ")}` +
        ` | opened here: ${measured.recordKinds.join(", ") || "none"}` +
        ` | NEVER OPENED — not looked at, NOT proven fine: ${kindCoverage.unreachable.join(", ") || "none"}` +
        ` | destinations that drew no row or card to open: ${blind.join(", ") || "none"}`,
    );
  }
  // A destination that HAD a row to open and opened nothing is a different
  // thing entirely, and that one is a failure: the rows were there, the
  // double-click did nothing, so a screen stopped opening. This is what the
  // hand-written pair was really guarding, and it now guards it by observation
  // rather than by naming two kinds it happened to know about.
  for (const attempt of recordsExpected ? measured.openAttempts : []) {
    if (attempt.kind === null)
      failures.push({
        surface: attempt.surface,
        reason: `${attempt.surface} offered a row to open and double-clicking it opened no record screen, so that screen's geometry is untested`,
      });
  }
  // ── CZY EKRAN REKORDU MA JESZCZE SZEROKOŚĆ TREŚCI ─────────────────────────
  // Ta kontrola mierzy w DRUGĄ STRONĘ niż cały pomiar wyżej i po to powstała.
  // Sweep potomków pyta, czy treść WYCHODZI ze swojego pudełka. Ekran rekordu
  // Zadania miał od #178 zerową szerokość treści — 48 px, czyli własny padding
  // — i przez cztery fale zgłaszał stąd trzy przepełnienia potomków (+32, +44,
  // +89), z których KAŻDA LICZBA BYŁA PRAWDZIWA. Ani jedna nie mówiła, że
  // rodzic tych trzech elementów nie ma szerokości. Przyrząd ścisły co do
  // niewłaściwej rzeczy jest gorszy niż przyrząd nieścisły, bo brzmi jak dowód.
  //
  // Reguła siedzi w `record-screen-geometry.mjs` i ma tam testy chodzące
  // w `npm run check` na trzech systemach; tutaj jest tylko pomiar.
  for (const screen of measured.recordScreens) {
    const decision = classifyRecordScreenGeometry(screen);
    if (REPORT_ONLY) {
      console.log(
        `${label}\t${screen.surface}\t${screen.signature}\t${Math.round(screen.contentPx)}px content\t` +
          `record-screen\t${decision.verdict}` +
          (decision.fraction === undefined
            ? ""
            : `\t${(decision.fraction * 100).toFixed(1)}%`),
      );
    }
    // „Nie da się zmierzyć" to awaria PRZYRZĄDU, nie werdykt o układzie, więc
    // pada również w trybie raportu — raport zrobiony nad panelem bez
    // szerokości dałby ułamki policzone nad niczym.
    if (decision.verdict === "unmeasurable")
      failures.push({ surface: screen.surface, reason: decision.reason });
    else if (decision.verdict === "collapsed")
      layoutProblems.push({ surface: screen.surface, reason: decision.reason });
  }
  // I LICZBA ZMIERZONYCH KORZENI JEST CZĘŚCIĄ ASERCJI, nie ozdobą raportu.
  // Kontrola, która może przejść, nie mierząc niczego, byłaby dziewiątym
  // przyrządem kłamiącym w stronę fałszywego spokoju — a ten lot istnieje
  // z powodu ósmego. Ta bramka przeszła już raz nad zerową liczbą rekordów,
  // a rekonesans, który znalazł ten defekt, dwa razy zmierzył pustkę, zanim
  // zmierzył ekran.
  const sweepVerdict = classifyRecordScreenSweep({
    measured: measured.recordScreens.length,
    expected: recordsExpected,
  });
  if (sweepVerdict.verdict === "measured-nothing")
    failures.push({ surface: "-", reason: sweepVerdict.reason });
  if (REPORT_ONLY && recordsExpected)
    console.log(
      `${label}\t-\trecord screens measured for content width: ${sweepVerdict.measured}`,
    );
  // ── CZY EKRAN ZWIĄZANY WYSOKOŚCIĄ NAPRAWDĘ JEST ZWIĄZANY ──────────────────
  // PIERWSZY PIONOWY PRZELOT TEJ BRAMKI. Każda liczba brana wyżej to
  // `scrollWidth - clientWidth`; ta bramka nigdy nie spojrzała w dół i dlatego
  // pięć zielonych przelotów mówiło „no overflow" nad czytelnią mającą 4140 px
  // w oknie 735 px. Reguła siedzi w `surface-height-bound.mjs` i ma tam testy
  // chodzące w `npm run check` na trzech systemach; tutaj jest tylko pomiar.
  for (const screen of measured.heightBound) {
    const decision = classifyHeightBoundScreen(screen);
    if (REPORT_ONLY) {
      console.log(
        `${label}\t${screen.surface}\t${screen.name}\theight-bound\t` +
          `pane ${screen.paneClientPx}\t` +
          `screen ${screen.rootHeightPx} (${screen.rootClientPx}/${screen.rootScrollPx})\t` +
          `reading ${screen.readingClientPx}/${screen.readingScrollPx}\t` +
          `panels ${screen.panelCount} ${screen.panelsSideBySide ? "side by side" : "in one column"}\t` +
          `${decision.verdict}` +
          (decision.fraction === undefined
            ? ""
            : `\t${(decision.fraction * 100).toFixed(1)}%`),
      );
    }
    if (decision.verdict === "unmeasurable")
      failures.push({ surface: screen.surface, reason: decision.reason });
    else if (
      decision.verdict === "collapsed" ||
      decision.verdict === "unbounded" ||
      decision.verdict === "panels-scroll-together"
    )
      layoutProblems.push({ surface: screen.surface, reason: decision.reason });
  }
  // I LICZBA ZMIERZONYCH PODMIOTÓW JEST CZĘŚCIĄ ASERCJI, wyprowadzoną
  // z deklaracji w źródłach — czyli z miary, której mierzony nie ustawia sobie
  // sam. Kontrola, która może przejść, nie mierząc niczego, byłaby dziewiątym
  // przyrządem kłamiącym w stronę fałszywego spokoju, a ten lot istnieje
  // z powodu ósmego.
  //
  // A SCOPED PASS never visits the destinations it does not name, so demanding
  // a screen there would turn a stated exclusion into a failure that has
  // nothing to do with the heights being measured — the same reasoning the
  // record guard above already carries. The declaration's VALUE is the
  // destination id precisely so this filter is possible without a second list.
  const heightBoundExpected =
    surfaces === undefined
      ? DECLARED_HEIGHT_BOUND
      : DECLARED_HEIGHT_BOUND.filter((name) => surfaces.includes(name));
  const heightSweep = classifyHeightBoundSweep({
    declared: heightBoundExpected,
    measured: measured.heightBound.map((screen) => screen.name),
    // An unscoped pass is always expected to meet the whole registry, so an
    // EMPTY registry stays a failure there rather than a quiet skip.
    expected: surfaces === undefined || heightBoundExpected.length > 0,
  });
  if (
    heightSweep.verdict !== "measured" &&
    heightSweep.verdict !== "not-expected"
  )
    failures.push({ surface: "-", reason: heightSweep.reason });
  // I DRUGA POŁOWA TEGO SAMEGO STRAŻNIKA: sufit sam przechodzi nad PUSTĄ
  // fiksturą, bo ekran bez treści nigdy nie przewija strony. Dowodem, że pomiar
  // zastał prawdziwe przepełnienie, jest to, że gdzieś coś naprawdę się
  // przewija.
  const heightEvidence = classifyHeightBoundEvidence({
    scrollingSubjects: measured.heightBound.filter(
      (screen) => screen.somethingScrolls,
    ).length,
    expected: measured.heightBound.length > 0,
  });
  if (heightEvidence.verdict === "nothing-overflowed")
    failures.push({ surface: "-", reason: heightEvidence.reason });
  // Fikstura harnessu może się opróżnić bez jednego czerwonego testu — nic
  // w niej nie jest typowane przez ekran, który ją rysuje. Wtedy Library
  // mierzy się PUSTA i cała bramka przechodzi nad geometrią, której nie ma.
  // To jest ta sama dziura co „zmierzono trzynaście powierzchni, patrząc na
  // jedną", tylko o poziom niżej, więc jest liczbą, a nie założeniem.
  //
  // Strażnik chodzi RÓWNIEŻ w trybie raportu. Raport jest przyrządem pomiarowym
  // — z niego przepisuje się sufity do rejestru — więc raport zrobiony nad pustą
  // Biblioteką dałby sufity zmierzone na niczym.
  for (const [what, minimum] of Object.entries(MINIMUM_ROWS)) {
    const drew = measured.rowCounts[what];
    if (drew < minimum) {
      failures.push({
        surface: what,
        // KOMUNIKAT NAZYWA OBIE PRZYCZYNY, i to jest poprawka, nie kosmetyka.
        // Poprzednia wersja mówiła wyłącznie „this is empty" — czyli twierdziła,
        // że EKRAN jest pusty. Na `main` @1edcf40 ekran był pełny (6 źródeł,
        // 7 wierszy historii, sprawdzone przez kliknięcie przełącznika), a pusty
        // był POMIAR: przelot nigdy nie otworzył tego odczytu. Dwa loty poszły
        // szukać defektu ekranu, którego nie było, bo bramka nazwała im złą
        // przyczynę.
        reason:
          `only ${drew} drew, fewer than ${minimum}. Either the screen carrying it renders nothing, ` +
          `or THIS PASS NEVER OPENED IT — a reading reached by a switcher is only swept if that ` +
          `switcher is marked [data-layout]. Check which before hunting a screen defect; either way ` +
          `every measurement of that screen is a pass over geometry nobody looked at`,
      });
    }
  }
  const matchedRegistryEntries = new Set();
  // Wpis rejestru jest DOPASOWANY, kiedy klasyfikacja go użyła — i to jest fakt
  // o przebiegu, nie o trybie. Księgowanie schowane pod `if (!REPORT_ONLY)` było
  // źródłem sprzeczności opisanej przy `REPORT_ONLY`.
  const noteRegistryMatch = (surface, signature) => {
    matchedRegistryEntries.add(`${surface.split(":")[0]}|${signature}`);
  };
  for (const descendant of measured.descendants) {
    const decision = classifyDescendantOverflow({
      ...descendant,
      pass: label,
    });
    if (REPORT_ONLY) {
      console.log(
        `${label}\t${descendant.surface}\t${descendant.signature}\t+${descendant.overflowPx}px\toverflow-x:${descendant.overflowX}\t${decision.verdict}`,
      );
    }
    if (decision.verdict === "known" || decision.regressedFrom !== undefined) {
      noteRegistryMatch(descendant.surface, descendant.signature);
    }
    if (decision.verdict !== "violation") continue;
    if (decision.regressedFrom !== undefined) {
      layoutProblems.push({
        surface: descendant.surface,
        reason: `${descendant.signature} overflows by ${descendant.overflowPx} px, worse than the ${decision.regressedFrom} px recorded for it (owner: ${decision.thread})`,
      });
      continue;
    }
    layoutProblems.push({
      surface: descendant.surface,
      // DWA lekarstwa, nie jedno, i to rozróżnienie jest tu z powodu: skrót
      // `overflow: auto` ustawia RÓWNIEŻ `overflow-x`, więc panel, który chce
      // się przewijać wyłącznie w pionie (`.knowledge-library` ma dokładnie
      // ten skrót), trafia tutaj z komunikatem proponującym deklarację —
      // a wzięcie jej byłoby kłamstwem, do którego namówiła bramka.
      reason:
        `descendant ${descendant.signature} overflows its own box by ${descendant.overflowPx} px ` +
        `(overflow-x: ${descendant.overflowX}). If it is MEANT to scroll sideways, declare it with ` +
        `[${HORIZONTAL_SCROLL_ATTRIBUTE}]. If it only ever wanted to scroll VERTICALLY, say ` +
        `overflow-y: auto rather than the shorthand — the attribute would be a lie. ` +
        `Otherwise it is a layout defect`,
    });
  }
  for (const entry of measured.results) {
    if (!entry.present) {
      failures.push({ surface: entry.surface, reason: "rendered no surface" });
      continue;
    }
    if (entry.surfaceWidth > entry.surfaceClientWidth) {
      const overflowPx = entry.surfaceWidth - entry.surfaceClientWidth;
      const decision = classifyDescendantOverflow({
        surface: entry.surface,
        signature: entry.signature,
        overflowPx,
        overflowX: entry.overflowX,
        declaresHorizontalScroll: false,
        pass: label,
      });
      if (REPORT_ONLY) {
        // Korzeń powierzchni idzie do raportu TAK SAMO jak potomek. Bez tego
        // raport — z którego przepisuje się sufity — nie pokazywał metryki
        // pierwszego dziecka wcale, więc wpis rejestru dla korzenia można było
        // odświeżyć wyłącznie z czerwonego przebiegu.
        console.log(
          `${label}\t${entry.surface}\t${entry.signature}\t+${overflowPx}px\tsurface-root\t${decision.verdict}`,
        );
      }
      if (
        decision.verdict === "known" ||
        decision.regressedFrom !== undefined
      ) {
        matchedRegistryEntries.add(
          `${entry.surface.split(":")[0]}|${entry.signature}`,
        );
      }
      if (decision.verdict !== "known") {
        layoutProblems.push({
          surface: entry.surface,
          reason:
            `content ${entry.surfaceWidth} px wide in a ${entry.surfaceClientWidth} px box` +
            (decision.regressedFrom === undefined
              ? ""
              : ` — worse than the ${decision.regressedFrom} px recorded for it (owner: ${decision.thread})`),
        });
      }
    }
    if (entry.documentWidth > entry.viewportWidth) {
      layoutProblems.push({
        surface: entry.surface,
        reason: `document ${entry.documentWidth} px wide in a ${entry.viewportWidth} px window`,
      });
    }
  }
  await page.close();
  return { failures, layoutProblems, matchedRegistryEntries };
};

const browser = await openBrowser();
const passes = [
  { width: 1024, fontSize: "200%", label: "text scaled to 200%" },
  { width: 320, fontSize: undefined, label: "a 320 px window" },
  { width: 1440, fontSize: undefined, label: "a full-size window" },
  // ── WAVE D, NOTES: THE TWO WIDTHS THAT SCREEN DECLARES A COLLAPSE ORDER FOR
  // 1092 px at 300% text leaves the work column about 364 px wide in the units
  // a `rem`-based layout is written in; 760 px is the product's own minimum
  // window (`BrowserWindow minWidth`, desktop-main/src/main.ts) and leaves it
  // about 540 px beside the sidebar. Three fixed tracks fit neither, which is
  // why the collapse order exists and why it is measured here rather than
  // asserted in prose.
  //
  // SCOPED TO `library` ON PURPOSE. The brief's ruling is explicit: no 300%
  // pass for the shell, because nine of fifteen destinations fail one today and
  // that is the interface-scaling thread. A lot that widened this to every
  // surface would be handing that thread's work to itself and would light up
  // every Wave E debt entry, none of which has a ceiling for these labels.
  {
    width: 1092,
    fontSize: "300%",
    label: "Library at 300% text",
    surfaces: ["library"],
  },
  {
    width: 760,
    fontSize: undefined,
    label: "Library at the minimum window",
    surfaces: ["library"],
  },
];

const problems = [];
const matchedRegistry = new Set();
try {
  for (const pass of passes) {
    const { failures, layoutProblems, matchedRegistryEntries } = await sweep(
      browser,
      pass,
    );
    for (const entry of matchedRegistryEntries) matchedRegistry.add(entry);
    for (const failure of failures) {
      problems.push(`${pass.label} — ${failure.surface}: ${failure.reason}`);
    }
    // Werdykty układu egzekwuje tylko tryb normalny; awarie przyrządu wyżej
    // padają zawsze. Podsumowanie liczy JEDNE I DRUGIE, bo poprzednia wersja
    // pisała w trybie raportu „no overflow" nad przebiegiem, który właśnie
    // wypisał kilkanaście przepełnień — trzeci wariant tego samego kłamstwa.
    if (!REPORT_ONLY) {
      for (const problem of layoutProblems) {
        problems.push(`${pass.label} — ${problem.surface}: ${problem.reason}`);
      }
    }
    const counted = failures.length + layoutProblems.length;
    console.log(
      `${pass.label}: ${counted === 0 ? "no overflow" : `${counted} problem(s)`}`,
    );
  }
  // Wpis, którego nie dopasował ŻADEN przelot, opisuje element, którego nie ma
  // — albo dług spłacono i wpis ma zniknąć, albo pomiar przestał ten ekran
  // widzieć. Oba przypadki znaczą, że zieleń wyżej nie mówi tego, co wygląda,
  // że mówi, więc rejestr pilnuje sam siebie.
  for (const entry of unusedRegistryEntries(matchedRegistry)) {
    const line =
      `the known-overflow registry — ${entry.surface}: ${entry.signature} was never met in any pass. ` +
      `Either it is fixed and the entry goes, or this gate stopped seeing that screen.`;
    // Dopasowania są teraz księgowane w obu trybach, więc ta lista mówi
    // w trybie raportu to samo, co w normalnym — ale w raporcie jest INFORMACJĄ,
    // nie błędem. Wcześniej była błędem rzucanym w trybie, który sam o sobie
    // pisał, że niczego nie egzekwuje.
    if (REPORT_ONLY) console.log(`report: ${line}`);
    else problems.push(line);
  }
} finally {
  await browser.close();
  stop();
}

if (REPORT_ONLY) {
  console.log(
    `\nReport mode: ${KNOWN_DESCENDANT_OVERFLOWS.length} registry entries, no descendant verdict was enforced.`,
  );
}

if (problems.length > 0) {
  throw new Error(`RENDERER_LAYOUT_INVALID:\n${problems.join("\n")}`);
}
