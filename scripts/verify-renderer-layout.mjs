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
import { existsSync, readFileSync, readdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { parseColor, srgbToOklch } from "./color-contrast.mjs";
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
// PORT JEST PARAMETREM, BO INACZEJ PRZYRZĄD NIE UMIE POWIEDZIEĆ, CZYJĄ
// APLIKACJĘ ZMIERZYŁ. `--strictPort` niżej znaczy, że port ma JEDNEGO
// właściciela: kto zwiąże go pierwszy, ten go ma. Przy dwóch drzewach roboczych
// na jednej maszynie drugi serwer dev NIE WSTAJE, a `reachable()` i tak dostaje
// 200 — od serwera SĄSIADA. Przebieg kończył się wtedy zerem, pięcioma
// przejściami i ciszą rejestru, mierząc CUDZY PROGRAM. To najgorszy dostępny
// tryb awarii: bramka całkowicie zielona nad drzewem, którego nie widziała.
//
// CI TEGO NIE ZŁAPIE — STRUKTURALNIE, nie przez przeoczenie: na runnerze stoi
// jedna aplikacja, więc kolizja nie ma jak zajść, a sufit albo próg zmierzony
// na cudzym drzewie przechodzi tam na zielono NA ZAWSZE.
const PORT = Number(process.env.LAYOUT_PORT ?? 5178);
const ORIGIN = `http://127.0.0.1:${PORT}`;
// Powłoka NIE WSTAJE pod gołym adresem — renderer wymaga mostka preload, więc
// w przeglądarce montuje ją harness deweloperski ze zaślepionym klientem.
const HARNESS = `${ORIGIN}/?surface=collaboration`;
// Identyfikator TRYBU Ustawień — jedyny cel, do którego nie wchodzi się
// pozycją `.nav-item[data-surface]`. Stoi tu z ręki, bo ten skrypt nie
// importuje rejestru TypeScriptowego, i to jest bezpieczne w JEDYNYM kierunku,
// który ma znaczenie: gdyby ten identyfikator kiedyś się zmienił, wpisy
// `surface: "settings"` w `descendant-overflow.mjs` przestałyby się dopasowywać
// i `unusedRegistryEntries` rzuciłby, zamiast przemilczeć.
const SETTINGS_SURFACE = "settings";

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

// ── CZY TEN PORT JEST WOLNY, ZANIM O COKOLWIEK ZAPYTAM ───────────────────────
// To jest kontrola, która NAPRAWDĘ zamyka dziurę „czyją aplikację zmierzyłem",
// i stoi PRZED uruchomieniem serwera, bo po nim jest już za późno. Zmierzone:
// przy zajętym porcie własne `npm run dev` kończy się kodem 1 po 225 ms, a cudzy
// serwer, KTÓRY JUŻ STOI, odpowiada w pojedynczych milisekundach. Pytanie „czy
// moje dziecko żyje" zadane po pierwszym udanym `fetch` przegrywa więc ten wyścig
// ZAWSZE — sprawdzone, bramka przeszła na zielono nad podstawionym serwerem.
//
// Kolejność odwrócona rozstrzyga: port dowiedziony jako wolny → `--strictPort`
// wiąże go MOJEMU dziecku → cokolwiek odpowiada pod `ORIGIN`, jest moje. Dowód
// przez wykluczenie, nie przez tożsamość, i ta różnica jest nazwana niżej.
//
// Wiązane jest jawnie `127.0.0.1`, nie wildcard, bo pod tym adresem stawia się
// vite — próba na `0.0.0.0` odpowiadałaby na inne pytanie niż zadane.
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", (error) =>
    reject(
      new Error(
        `LAYOUT_CHECK_PORT_TAKEN: port ${PORT} is already listening (${error.code}), so this ` +
          `check cannot know whose application it would be measuring. With --strictPort this ` +
          `tree's dev server would fail to bind and the pass would silently drive SOMEBODY ` +
          `ELSE'S program — a second worktree, or a server leaked by an earlier run.\n` +
          `Re-run on a port nothing else holds:  LAYOUT_PORT=<free port> ...\n` +
          `Find the current owner with:  lsof -nP -iTCP:${PORT} -sTCP:LISTEN`,
      ),
    ),
  );
  probe.listen(PORT, "127.0.0.1", () => probe.close(resolve));
});

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
  // WŁASNA GRUPA PROCESÓW, żeby dało się ubić CAŁE drzewo, a nie samą owijkę.
  // `npm` jest tu pośrednikiem: sygnał wysłany JEMU musi jeszcze zostać
  // przekazany do vite, a na ścieżce błędu nie zdąża.
  { cwd: root, stdio: "ignore", detached: true },
);

// WYJŚCIE Z TEJ BRAMKI MA ZOSTAWIAĆ PORT WOLNY, i to jest asercja o przyrządzie,
// nie sprzątanie dla porządku. Następny przebieg zaczyna od próby wiązania tego
// samego portu, więc serwer, który przeżył poprzedni, ZATRZYMUJE kolejny —
// a break-test odpala tę bramkę trzy razy na każde złamanie, jedno po drugim.
//
// Dokładnie to zaszło przy pierwszym przebiegu break-testów tego lotu: trzecie
// złamanie zaraportowało „czerwone PO PRZYWRÓCENIU", co czyta się jak niedoszłe
// przywrócenie kodu, a było zajętym portem po serwerze z poprzedniego złamania.
// Źródło było przywrócone poprawnie — sprawdzone `git status`.
//
// Mechanizm NIE JEST tym, który zgadłem dwa razy. Nie cieknie ani ścieżka
// czerwona sama z siebie (sprawdzone osobnym harnessem: symulowany rzut po
// `stop()` zwalnia port), ani przebieg zielony (sprawdzone: port wolny po
// czystym przejściu). Cieknie przebieg Z PODŁĄCZONĄ PRZEGLĄDARKĄ: vite zamyka
// się łagodnie i czeka na zamknięcie połączeń, a Playwright trzyma gniazda HMR.
// SIGTERM zostaje przyjęty i NIC SIĘ NIE DZIEJE.
//
// Dlatego zatrzymanie jest CZEKAJĄCE i eskalujące, a nie „wyślij i wyjdź":
// sygnał idzie do CAŁEJ GRUPY (żeby dosięgnąć vite bez pośrednictwa `npm`,
// które przy osieroceniu niczego nie przekazuje), a potem pytamy PORTU, czy
// naprawdę jest wolny — bo tylko to jest warunkiem, na którym zależy następnemu
// przebiegowi. Po czasie łaski przychodzi SIGKILL, którego łagodne zamykanie
// zignorować nie może.
const portFree = async () =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(PORT, "127.0.0.1", () => probe.close(() => resolve(true)));
  });

const signalGroup = (signal) => {
  try {
    process.kill(-server.pid, signal);
  } catch {
    // Grupy już nie ma — czyli dokładnie to, o co chodziło.
  }
};

const stop = async () => {
  signalGroup("SIGTERM");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server.exitCode !== null && (await portFree())) return;
    // Łagodne zamknięcie dostaje sekundę; potem przestajemy prosić.
    if (attempt === 4) signalGroup("SIGKILL");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `LAYOUT_CHECK_PORT_NOT_RELEASED: port ${PORT} is still held after this run was ` +
      "told to stop, so the NEXT run would refuse to start or, without the pre-flight " +
      "probe, would measure this leftover server instead of its own.",
  );
};
const stopQuietly = () => {
  void stop().catch(() => {});
};
process.once("SIGINT", stopQuietly);
process.once("SIGTERM", stopQuietly);

// SIATKA BEZPIECZEŃSTWA NA KAŻDE WYJŚCIE, i jest tu z powodu ZMIERZONEJ awarii,
// nie z ostrożności. Serwer wstaje w tym pliku ponad tysiąc linii przed `try`,
// które go zatrzymuje, a w tym oknie stoją instrukcje, które RZUCAJĄ — przede
// wszystkim wyprowadzenie podmiotów z deklaracji w źródłach (`derive`) i
// uruchomienie przeglądarki. Rzut stamtąd omijał zatrzymanie w całości.
//
// Tak wyglądała ta awaria z zewnątrz: break-test kasujący deklarację
// `data-height-bound` szedł na czerwono POPRAWNIE, ale zostawiał serwer, więc
// przebieg PO PRZYWRÓCENIU dostawał zajęty port i meldował „czerwone po
// przywróceniu". Czyta się to jak niedoszłe przywrócenie kodu albo zatrute
// `dist` — czyli jak defekt w drzewie — a było wyłącznie wyciekiem przyrządu.
// Dwa kolejne przebiegi całej serii utknęły na tym samym trzecim złamaniu.
//
// `exit` nie przyjmuje pracy asynchronicznej, więc idzie tu SIGKILL na grupę:
// to pojedyncze wywołanie systemowe, a na tej ścieżce nie ma już czego zamykać
// łagodnie. Przy zwykłym wyjściu grupa jest martwa od `stop()` i ESRCH jest
// wyciszony.
process.once("exit", () => signalGroup("SIGKILL"));

// „Coś odpowiada pod tym adresem" NIE ZNACZY „mój serwer odpowiada pod tym
// adresem", a różnicy między tymi zdaniami ten przyrząd nie umiał wypowiedzieć.
//
// TA KONTROLA JEST ZABEZPIECZENIEM, NIE MECHANIZMEM — i jest tak nazwana, bo
// napisana najpierw JAKO mechanizm okazała się nie do wywołania. Sama nie łapie
// niczego: kiedy cudzy serwer już stoi, pierwszy `fetch` wraca wcześniej, niż
// własne dziecko zdąży paść (zmierzone: 225 ms do wyjścia, milisekundy do
// odpowiedzi), więc pętla kończy się sukcesem na pierwszym obiegu i o śmierci
// dziecka nikt już nie pyta. Dziurę zamyka próba wiązania PRZED uruchomieniem;
// to zostaje na okno między jej zamknięciem a wiązaniem vite — jedyny przypadek,
// w którym port był wolny, a mimo to przegraliśmy go komuś innemu.
const reachable = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null)
      throw new Error(
        `LAYOUT_CHECK_SERVER_DIED: the dev server for this worktree exited with ` +
          `${server.exitCode} instead of binding ${ORIGIN}. With --strictPort that means ` +
          `SOMEBODY ELSE HOLDS PORT ${PORT} — most likely a second worktree, or a leaked ` +
          `server from an earlier run. Whatever answers on that port is NOT this tree, and ` +
          `measuring it would report somebody else's application as this one's.\n` +
          `Run this check on a port nothing else holds:  LAYOUT_PORT=<free port> ...\n` +
          `Find the current owner with:  lsof -nP -iTCP:${PORT} -sTCP:LISTEN`,
      );
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
  await stop();
  throw new Error(`LAYOUT_CHECK_SERVER_NOT_REACHABLE: ${ORIGIN}`);
}

// ── CZYJĄ APLIKACJĘ WŁAŚCIWIE ZŁAPALIŚMY ─────────────────────────────────────
// Próba wiązania portu wyżej dowodzi własności PRZEZ WYKLUCZENIE: port był
// wolny, więc serwer, który go zajął, jest mój. To rozumowanie jest poprawne
// i CAŁKOWICIE POŚREDNIE — nie pyta serwera o nic. Tu jest dowód WPROST, i jest
// tani, bo vite sam go daje.
//
// Serwer deweloperski trzyma listę katalogów, z których wolno mu czytać, i jest
// ona zakorzeniona w JEGO drzewie. Prośba o plik spod MOJEGO korzenia jest więc
// pytaniem, na które sąsiad odpowiedzieć NIE MOŻE. Zmierzone na dwóch żywych
// serwerach naraz: własny oddaje `200`, serwer drugiego worktree oddaje
// `403 Restricted … outside of Vite serving allow list`.
//
// GRANICA TEGO DOWODU, powiedziana wprost: rozróżnia DRZEWA, nie STANY drzewa.
// Serwer zostawiony pod tą samą ścieżką z wcześniejszego stanu przeszedłby tę
// kontrolę — i właśnie taki serwer stał za pierwotną awarią. Zamyka go dopiero
// próba wiązania portu, która odmawia startu przy JAKIMKOLWIEK zastanym
// serwerze. Dopiero obie razem odpowiadają na całe pytanie: jedna mówi, że nikt
// tu nie stał, druga — że ten, kto stoi, czyta z tego drzewa.
const identityProbe = await fetch(`${ORIGIN}/@fs${root}/package.json`).catch(
  (error) => ({ ok: false, status: `unreachable (${error.message})` }),
);
if (!identityProbe.ok) {
  await stop().catch(() => {});
  throw new Error(
    `LAYOUT_CHECK_WRONG_APPLICATION: the server answering ${ORIGIN} refused a file from ` +
      `THIS worktree's root (${identityProbe.status}), so it is serving a DIFFERENT tree. ` +
      "Everything this gate would measure against it — every ceiling, every floor, every " +
      "registry entry — would be a number about somebody else's application reported as " +
      "this one's. A green run here would be the worst kind of green.\n" +
      `Root this check expects to be served: ${root}\n` +
      `Find who actually holds the port with:  lsof -nP -iTCP:${PORT} -sTCP:LISTEN`,
  );
}

// Ile wierszy musi się narysować, żeby pomiar cokolwiek znaczył. Fikstura
// niesie ich więcej; progi są niskie celowo, bo mają łapać „lista jest pusta",
// a nie pilnować dokładnej zawartości fikstury — to drugie robiłoby z bramki
// układu test danych i padałoby przy każdej edycji harnessu. Osobne progi na
// osobne listy: jedna suma przepuszczała wyzerowanie dokumentów, bo dobijały
// do niej same źródła.
//
// KAŻDY PRÓG NAZYWA CEL, KTÓRY MUSI BYĆ W ZAKRESIE PRZELOTU, ŻEBY PRÓG W OGÓLE
// COŚ ZNACZYŁ — i to jest ta sama poprawka, którą ten plik ma już przy rekordach
// (`recordsExpected`) i przy wysokości (`heightBoundExpected`). Przelot ZAWĘŻONY
// odwiedza wyłącznie cele, które wymienia, więc próg na karty lejka sprawdzany
// w przelocie zawężonym do Biblioteki nie mierzy zapadniętego ekranu, tylko
// zamienia ZADEKLAROWANE wyłączenie w czerwień, która nigdy nie miała nic
// wspólnego z mierzoną rzeczą. Zmierzone od razu: bez tego dwa przeloty
// Biblioteki fali D czerwieniły się na CRM-ie, którego z definicji nie widzą.
//
// LICZENIE ZOSTAJE GLOBALNE — selektory niżej chodzą po KAŻDEJ powierzchni,
// dokładnie z powodu opisanego przy nich (historia przechwyceń przeniosła się
// do Biblioteki i licznik przywiązany do nazwy celu przestałby liczyć). Cel
// stoi tu wyłącznie przy OCZEKIWANIU, nie przy pomiarze: „gdzie to policzono"
// i „który przelot ma prawo tego żądać" to dwa różne pytania i przez jedną falę
// miały jedną odpowiedź.
const MINIMUM_ROWS = {
  libraryDocuments: { floor: 5, needs: "library" },
  librarySources: { floor: 4, needs: "library" },
  captureHistory: { floor: 5, needs: "library" },
  // Nie wiersz, tylko ZNAKI TREŚCI notatki, i jest tu z powodu zmierzonego na
  // tym PR-ze: fikstura potrafi mieć komplet wierszy i PUSTĄ treść. Tak było —
  // dokument bez stempla formatu czytał się jako `plain-v1`, edytor odpalał
  // migrację, migracja podmieniała treść na pusty tekst starego korzenia,
  // a trzy strażniki liczby wierszy dalej świeciły na zielono. Próg jest pod
  // dolną granicą zmierzonego zbioru, bo pilnuje „pusto", a nie długości.
  //
  // CZEGO TEN PRÓG NIE ZŁAPIE, powiedziane wprost, bo strażnik z niewypowiedzianą
  // granicą czyta się jak strażnik bez granicy. Wszystkie cztery liczniki są
  // MAKSIMAMI po przelocie (`Math.max` niżej), więc łapią „WSZYSTKO zniknęło",
  // a nie „ZNIKNĘŁO COŚ". Przy notatce jest to dotkliwsze niż przy listach,
  // bo mierzona jest JEDNA otwarta notatka w każdym przelocie: 3 711 znaków
  // z przelotu pełnowymiarowego przykryje zero z przelotu 200%.
  //
  // ZŁAPAŁABY TO ASERCJA NA PRZELOT, nie na przebieg — próg sprawdzany osobno
  // w każdym z pięciu przelotów. NIE JEST TO ZBUDOWANE ŚWIADOMIE i powód jest
  // mierzalny: Biblioteka ma ZADEKLAROWANĄ KOLEJNOŚĆ USTĘPOWANIA PANELI
  // (`notes.module.css`, kroki 1 i 2), więc przy 300% tekstu i przy minimalnym
  // oknie panel czytania stoi w jednej kolumnie pod dwoma innymi i jego
  // obecność w kadrze jest funkcją przewinięcia, a nie poprawności. Próg na
  // przelot czerwieniłby się tam PRAWIDŁOWEGO ekranu — czyli kupowałby jedną
  // klasę fałszywej ciszy za jedną klasę fałszywej czerwieni, a ta druga jest
  // gorsza: asercja, która czerwieni się na zdrowym drzewie, zostaje skasowana
  // przy pierwszym przebiegu. Tryb raportu wypisuje surową liczbę przy KAŻDYM
  // przelocie, więc różnica między przelotami jest dziś widoczna gołym okiem;
  // to jest świadomie mniej niż asercja i dlatego stoi tu napisane.
  libraryNoteBody: { floor: 1_500, needs: "library" },
  // ── CRM, AND WHY IT IS COUNTED BY NAME RATHER THAN BY A TOTAL ──────────────
  // Until Wave E the harness answered no `relationship.workspace` query at all,
  // so four screens shipped by Wave C rendered "this view's data is unavailable
  // right now" and every pass here was green over geometry nobody had looked
  // at. These two counters are what stops that returning in silence.
  //
  // TWO ENTRIES, NOT ONE, for the reason the Library counters are three: a
  // single CRM total would be met by the board alone while the contracts list
  // emptied, and a guard that is met by the wrong subject is the failure this
  // wave met twice — a sweep that read 139 of the wrong files while satisfying
  // its own file-count floor, and a gate that measured the wrong worktree's
  // application while passing every check it had. A floor must be able to say
  // WHICH subject it counted.
  //
  // Counted off the attributes the record sweep already opens records by, not
  // off class names: a class name is a CSS Module hash away from silently
  // counting zero, which `.source-list > li` above carries a warning about.
  //
  // Floors sit under what was measured — 5 cards drew and 2 contract rows drew
  // — because they guard "this screen drew nothing", not the fixture's exact
  // contents. THE FIXTURE HOLDS THREE CONTRACTS AND TWO ROWS DRAW, and that is
  // not a discrepancy: the third stands in the "Closed this cycle" section,
  // which opens on a disclosure this sweep does not click. Written down because
  // a floor of three would have been the obvious number and would have reddened
  // a healthy screen.
  //
  // A ZATEM `renewalRows` NIE MA ZAPASU, i to jest wybór, nie przeoczenie. Dwie
  // OTWARTE sekcje tego ekranu rysują po jednym wierszu, więc próg 2 żąda, żeby
  // narysowały się OBIE. Próg 1 pozwoliłby dowolnej z nich opustoszeć po cichu
  // — a ten ekran organizuje pracę SEKCJAMI, więc pusta sekcja jest tą właśnie
  // rzeczą, o której zieleń nie ma prawa milczeć. Próg jest przypięty do
  // STRUKTURY ekranu, nie do zawartości fikstury.
  pipelineCards: { floor: 4, needs: "pipeline" },
  renewalRows: { floor: 2, needs: "renewals" },
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
    async ({ fontSize, scrollAttribute, surfaces, SETTINGS_SURFACE }) => {
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
      // DWIE AFORDANCJE, JEDNA LISTA — i to jest poprawka, bez której ta bramka
      // przestałaby widzieć Ustawienia w tej samej chwili, w której przestały
      // być pozycją nawigacji.
      //
      // Do fali E `settings` trafiały tu WYŁĄCZNIE dlatego, że filtr lewej
      // kolumny (`shortcut !== null`) niczego nie odsiewał i rysował je jako
      // `.nav-item[data-surface]` wbrew dwóm komentarzom mówiącym, że tak nie
      // jest. Lot ACT robi te komentarze prawdziwymi — a to znaczy, że bramka,
      // która zna tylko jedną afordancję, przestaje mierzyć CAŁY ekran
      // Ustawień: dwa wpisy rejestru (`form.status-create` w OBU przelotach
      // i `div._memberList` przy 320 px) poszłyby jako niedopasowane
      // i `unusedRegistryEntries` rzuciłby `RENDERER_LAYOUT_INVALID`.
      //
      // NAZWANE WPROST, BO JEST WARTE WIĘCEJ NIŻ POPRAWKA: POKRYCIE TEJ BRAMKI
      // JEST FUNKCJĄ KSZTAŁTU NAWIGACJI. Powierzchnia, która przestaje być
      // pozycją nawigacji, przestaje być mierzona — a jedyne, co dzieli tę
      // ciszę od fałszywego spokoju, to rejestr, który zamienia ją w GŁOŚNĄ
      // porażkę. Odwrotnie niż każdy inny defekt przyrządu tej fali.
      //
      // Lista dalej pochodzi Z ŻYWEGO DOM-u, a nie z wypisanej listy celów —
      // zmienia się tylko to, że afordancji jest dwie. Tryb Ustawień ma własną,
      // stabilną: `[data-settings-entry]` (koło zębate przy tożsamości).
      const all = [...document.querySelectorAll(".nav-item[data-surface]")].map(
        (item) => item.dataset.surface,
      );
      if (
        document.querySelector("[data-settings-entry]") !== null &&
        !all.includes(SETTINGS_SURFACE)
      )
        all.push(SETTINGS_SURFACE);
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
        pipelineCards: 0,
        renewalRows: 0,
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
        // Ustawienia wchodzi się KOŁEM ZĘBATYM, nie pozycją nawigacji — patrz
        // akapit przy budowaniu `all`. Pętla jest jedna, bo wszystko po
        // kliknięciu (pomiar, soczewki, rekordy, wysokość) jest identyczne;
        // różni się WYŁĄCZNIE afordancja, którą się otwiera cel.
        // Koło zębate jest PIERWSZE, a nie zapasowe: to jest drzwi, którymi
        // wchodzi człowiek, więc to je ma otwierać bramka. Pozycja nawigacji
        // zostaje jako druga wyłącznie po to, żeby ten skrypt nie zależał od
        // kolejności lądowania z poprawką lewej kolumny.
        const target =
          id === SETTINGS_SURFACE
            ? (document.querySelector("[data-settings-entry]") ??
              document.querySelector(`.nav-item[data-surface="${id}"]`))
            : document.querySelector(`.nav-item[data-surface="${id}"]`);
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
          rowCounts.pipelineCards = Math.max(
            rowCounts.pipelineCards,
            count("[data-pipeline-card]"),
          );
          rowCounts.renewalRows = Math.max(
            rowCounts.renewalRows,
            count("[data-renewal-row]"),
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
        // AND THE THIRD KIND IS REACHED FROM HERE TOO — by the PIPELINE CARD,
        // and by that door alone.
        //
        // THE SENTENCE THAT STOOD HERE UNTIL THE FIXTURE DREW ROWS SAID "a
        // pipeline card AND A RENEWAL ROW both open the opportunity record",
        // and `[data-renewal-row]` was in the selector below on the strength of
        // it. IT IS NOT TRUE AND NEVER WAS. Measured, not reasoned:
        // `RenewalsSurface.tsx` gives the row an `onClick` that SELECTS it and
        // no `onDoubleClick` at all; the only route from a contract to a deal
        // is a button inside the row's outlook panel, and that button exists
        // only for a contract that HAS a renewing deal. A renewal has no record
        // screen of its own — `data-record-kind` declares exactly three, and
        // all three are reached by their own doors: task by `[data-task-row]`,
        // project by `[data-project-row]`, opportunity by
        // `[data-pipeline-card]`. So this selector bought ZERO coverage and
        // cost a red run the moment a renewal row existed to double-click.
        //
        // WHY IT SHIPPED GREEN, WHICH IS THE PART WORTH KEEPING. The claim
        // could not be wrong while the harness held no renewals: the assertion
        // never reached the thing it was asserting about. An empty fixture does
        // not merely fail to measure — IT PROTECTS A WRONG ASSERTION FROM EVER
        // BEING WRONG. That is the same shape as this file's own port
        // collision, and neither is a mistake of the lot that wrote it: both
        // are instruments that could not be exercised in the state the repo was
        // in at the time. Removing the selector deletes a claim, not coverage.
        const row =
          window.innerWidth >= 760
            ? work?.querySelector(
                "[data-project-row], [data-task-row], [data-pipeline-card]",
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
    {
      fontSize,
      scrollAttribute: HORIZONTAL_SCROLL_ATTRIBUTE,
      surfaces,
      SETTINGS_SURFACE,
    },
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
  // A W TRYBIE RAPORTU STRAŻNIK MÓWI TEŻ, ILE NAPRAWDĘ NALICZYŁ. Progi niżej
  // wyprowadzono z liczb zmierzonych na fikstrze, ale sam przyrząd tych liczb
  // NIE POKAZYWAŁ — dało się przeczytać wyłącznie „przeszło" albo „za mało".
  // Próg uzasadniony pomiarem, którego nie da się powtórzyć, jest progiem
  // wpisanym z ręki jedno odświeżenie fikstury później.
  //
  // ITERUJEMY PO `MINIMUM_ROWS`, czyli po tym samym źródle, po którym idzie
  // asercja niżej — NIE po `rowCounts`. Te dwa kształty są deklarowane osobno
  // i to jest ta sama klasa driftu, co przepisany kształt w dwóch schematach:
  // licznik dodany bez progu wypisałby tu `floor undefined`, a pętla asercji,
  // idąca w drugą stronę, milczałaby o tym samym rozjeździe. W trybie raportu
  // nikt by tego nie zauważył, bo raport niczego nie czerwieni.
  //
  // A ZAKRES PRZELOTU JEST WYPISANY PRZY KAŻDYM PROGU, nie domyślny: raport,
  // który pokazuje „0 (floor 4)" i przemilcza, że ten przelot nigdy nie
  // odwiedził Lejka, wysyła czytającego szukać pustego ekranu zamiast pustego
  // pomiaru — dokładnie tak, jak zrobił to komunikat opisany niżej.
  const expectedHere = (needs) =>
    surfaces === undefined || surfaces.includes(needs);
  if (REPORT_ONLY)
    console.log(
      `report: fixture counts — ${Object.entries(MINIMUM_ROWS)
        .map(
          ([what, { floor, needs }]) =>
            `${what} ${measured.rowCounts[what]} (floor ${floor}` +
            (expectedHere(needs) ? "" : `, not in scope: needs ${needs}`) +
            ")",
        )
        .join(", ")}`,
    );
  for (const [what, { floor: minimum, needs }] of Object.entries(
    MINIMUM_ROWS,
  )) {
    if (!expectedHere(needs)) continue;
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

// ── SONDA WIERNOŚCI WIZUALNEJ ────────────────────────────────────────────────
// Wszystko powyżej pyta o GEOMETRIĘ. Ta sonda pyta o JĘZYK WIZUALNY, i powstała,
// bo przez trzy fale przebudowy nie było ŻADNEJ bramki, która porównywałaby
// wygląd. Skutek jest zmierzony i nazwany w planie adopcji: aplikacja stoi na
// systemie „Black Glass" (bez akcentu, rampa neutralna hue 255), który prototyp
// v3 ŚWIADOMIE zastąpił jednym akcentem indygo-fioletowym o hue 295 i chłodną
// fioletową rampą. Rozjazd rósł bez jednego czerwonego przebiegu, bo nikt go nie
// mierzył. Ta sonda jest JEDYNYM ŚLEDZONYM egzekutorem tego języka: kontrakt
// projektowy `.ui-craft/` jest gitignorowany, więc nie jedzie w PR-ze i CI go
// nie widzi.
//
// CZTERY RZECZY, KTÓRE MOGŁYBY ZAMIENIĆ TĘ SONDĘ W KŁAMSTWO, i jak każda jest
// obchodzona — spisane, bo każda z nich jest udokumentowaną klasą defektu tego
// repo, a nie hipotezą:
//
//   A. `:focus-visible` NIE ARMUJE SIĘ od `element.focus()` wywołanego z
//      `page.evaluate()` — Chromium wymaga modalności KLAWIATUROWEJ. Sonda
//      naciska więc prawdziwy Tab (`page.keyboard.press`) i dodatkowo PYTA
//      elementu, czy `:focus-visible` naprawdę na nim siedzi. Bez tego odczyt
//      brzmiałby „brak pierścienia", ktoś „naprawiłby" to osłabieniem asercji
//      i zbudowałby dokładnie to, czemu ta sonda ma zapobiec.
//
//   B. CZYTAMY WŁAŚCIWOŚĆ ROZWIĄZANĄ, nie własność niestandardową.
//      `getComputedStyle(el).getPropertyValue("--focus-ring")` oddaje SUROWY
//      TEKST TOKENU — to jest kontrola ŹRÓDŁA, czyli dokładnie ten fałszywy
//      spokój, który to repo zbiera od fal: nazwa tokenu w arkuszu przechodzi,
//      gdy nikt jej nie użył. Mierzone są `backgroundColor`, `backgroundImage`,
//      `boxShadow`, `outline*` i `fontSize`/`fontWeight`, czyli to, co
//      przeglądarka NAPRAWDĘ narysowała.
//
//   C. ROZRÓŻNIAMY PO CHROMIE, ODCIENIU I ALFIE, nie po „to nie jest neutralny".
//      Porównanie napisów z neutralnym przechodzi na czymkolwiek. Wyliczony
//      kolor idzie do OKLCH (`color-contrast.mjs` — JEDYNA implementacja
//      matematyki koloru w tym repo, nie pisz drugiej) i pytanie brzmi: czy
//      chroma jest powyżej podłogi, czy odcień siedzi w pasie akcentu ORAZ czy
//      alfa jest na tyle wysoka, żeby cokolwiek było widać. Liczby i ich
//      wyprowadzenie z POMIARU stoją przy `ACCENT` niżej.
//
//   E. MIERZYMY OBA MOTYWY JAWNIE. Pierwsza wersja tej sondy deklarowała
//      „wyłącznie motyw ciemny" i mierzyła JASNY: `main.tsx` ustawia
//      `dataset.theme` z `localStorage` albo z `matchMedia`, a świeży kontekst
//      Playwrighta jest domyślnie jasny. To nie jest drobiazg o etykiecie —
//      `--focus-ring` jest zdefiniowany TYLKO w bloku ciemnym, a
//      `--action-primary-bg` i `--surface-selected` nadpisuje też blok jasny.
//      Poprawka przepinająca akcent w jednym bloku zazieleniłaby więc pierścień
//      i zostawiła akcję główną czerwoną — co czyta się jak „poprawka zadziałała
//      w połowie", a znaczy „bramka mierzy drugi motyw". Każdy werdykt niesie
//      nazwę motywu, a to, że przełączenie NAPRAWDĘ zaszło, jest osobno
//      dowiedzione odciskiem malowania powłoki.
//
//   D. PODMIOT NIEZNALEZIONY = GŁOŚNA AWARIA PRZYRZĄDU, nigdy czerwona asercja.
//      Sonda czerwona, bo nic nie zmierzyła, czyta się IDENTYCZNIE jak sonda
//      czerwona, bo brakuje akcentu — i wtedy ktoś „naprawia" akcent, nie
//      zmierzywszy nigdy niczego. Każdy podmiot ma osobny, nazwany komunikat
//      awarii, a te lecą do `failures`, nie do werdyktów.
const ACCENT = {
  // Odcień akcentu v3 (`v3/tokens.css:57-61`) — indygo-fiolet 295, postawiony
  // celowo z dala od czterech odcieni semantycznych (150 / 78 / 22 / 232), żeby
  // akcentu nie dało się pomylić ze stanem.
  hue: 295,
  // Pas, nie równość: rampa akcentu ma pięć kroków, a przeglądarka wraca
  // z zaokrągleniem przez sRGB, więc odcień pływa o kilka stopni. ±25 zostawia
  // zapas na krok jasności i wciąż nie sięga sąsiednich odcieni semantycznych
  // (najbliższy, info 232, jest 63 stopnie stąd).
  hueTolerance: 25,
  // ROZSTRZYGAJĄCY PRÓG — I TO NIE JEST FIGURA RETORYCZNA, tylko jedyny warunek,
  // który po Fazie 1 cokolwiek rozdziela. Rampa neutralna v3 ma odcień 285, czyli
  // DZIESIĘĆ STOPNI od akcentu: siedzi WEWNĄTRZ pasa wyżej. Odcień odsiewa więc
  // wyłącznie kolory semantyczne i dzisiejszą rampę hue 255; neutralnego od
  // akcentu nie odróżni ani teraz, ani nigdy potem. Robi to CHROMA i tylko ona.
  //
  // LICZBA JEST WYPROWADZONA Z POMIARU, nie z okrągłości. Wypisane wprost
  // z `v3/tokens.css`, bo to jedyny sposób, żeby następny czytelnik mógł ją
  // podważyć liczbą, a nie wrażeniem:
  //
  //   akcent (`--a-700…--a-300`, :55-61)  0.19  0.21  0.20  0.17  0.12
  //   rampa neutralna (`--n-*`, :36-51)   0.004 0.005 0.007 0.009 0.010 0.011
  //                                       0.012 0.013 0.014 0.015 (maks 0.015)
  //   NAJSILNIEJSZY PODSZYWACZ, odcień 285, czyli WEWNĄTRZ pasa ±25:
  //     cienie motywu jasnego `oklch(40% 0.03 285 / …)` (:255-259)   0.03
  //     obramowania motywu jasnego `oklch(30% 0.02 285 / …)` (:236)  0.02
  //
  // Rozdzielany przedział to więc (0.03, 0.12], a NIE (0.015, 0.19]: rampa
  // neutralna nie jest tu wiążąca, wiążące są cienie i obramowania jasnego
  // motywu. 0.09 stoi TRZY RAZY nad najsilniejszym podszywaczem i na 0.75
  // najsłabszego stopnia akcentu (`--a-300`) — więc KAŻDY stopień v3 przechodzi
  // z zapasem, a wartość pośrednia (średnia arytmetyczna zbiorów, 0.0675, i
  // zmierzony przez sceptyka `oklch(64% 0.051 295)`) NIE przechodzi. Poprzednia
  // podłoga 0.05 przepuszczała akcent CZTERY RAZY słabszy od prototypowego.
  chromaFloor: 0.09,
  // PODŁOGA ALFY. Bez niej `oklch(55% 0.21 295 / 0.01)` przechodził jako akcent —
  // kolor o właściwej chromie i właściwym odcieniu, którego NIKT NIE ZOBACZY.
  // Wyprowadzona z tego, czego v3 NAPRAWDĘ używa w trzech rolach akcentu
  // (`v3/tokens.css:150-156` ciemny, `:205-211` jasny):
  //
  //   --accent-quieter  0.08 / 0.07   ← aktywna nawigacja (`app.css:218-220`)
  //                                     i halo pierścienia (`app.css:39`)
  //   --accent-quiet    0.16 / 0.13
  //   --accent-glow     0.28 / 0.22
  //   --accent-edge     0.42 / 0.40
  //   --accent (linia pierścienia, `app.css:37`)            1
  //
  // Najniższa REALNA alfa to 0.07. Jedna podłoga wystarczy na oba podmioty (tło
  // i cień), bo w obu najniższą wartość niesie TEN SAM token `--accent-quieter`.
  // 0.04 siedzi wyraźnie pod 0.07 i cztery razy nad niewidzialnym 0.01.
  alphaFloor: 0.04,
};
// Sufit tytułu ekranu w `rem`. Łapie regresję do nagłówka display: dziś tytuł
// rysuje `--text-display: clamp(1.9rem, 2.2vw, 2.6rem)`, czyli 30–42 px, a
// prototyp daje temu samemu tytułowi `--text-sm` o wadze 600 w pasku crumbbar.
const TITLE_MAX_REM = 1.25;
// I PODŁOGA, bo sam sufit przepuszcza tytuł czterech pikseli — „mniejszy" nie
// znaczy „poprawiony". v3 rysuje tytuł `--text-sm`, czyli 0.8125rem; podłoga
// 0.625rem (10 px przy domyślnym rem) stoi 1.3× pod tą wartością i wielokrotnie
// nad zerem, więc mieści krok w dół, a nie zniknięcie tytułu.
const TITLE_MIN_REM = 0.625;
// I WAGA, bo w pasku crumbbar to ONA odróżnia tytuł od zwykłego tekstu: pasek
// jedzie `--text-sm` (`v3/app.css:286`), a bieżący element okruszków — czyli
// tytuł ekranu — dostaje `font-weight: 600` (`v3/app.css:292`). Sufit rozmiaru
// bez asercji na wadze przyjąłby tytuł 13 px o wadze 400, czyli akapit
// w miejscu nagłówka.
const TITLE_MIN_WEIGHT = 600;

// Arkusz GLOBALNY renderera — i tylko on, świadomie. Klasy z `*.module.css` są
// w DOM-ie zahaszowane (`_title_1kitm_195`), więc selektor wyprowadzony z modułu
// nie dopasowałby się do niczego i sonda meldowałaby awarię przyrządu przy
// zdrowym ekranie.
const RENDERER_SHEET = path.join(RENDERER_SOURCE, "styles.css");

// ── PODMIOTY WYPROWADZONE Z DEKLARACJI, NIE WYPISANE OBOK NICH ───────────────
// Ten plik ma już ten idiom dwa razy (`derive()` czyta atrybuty z TSX-ów, sweep
// bierze cele z `.nav-item[data-surface]` w ŻYWYM DOM-ie). Tutaj podmiotem jest
// „co maluje się tokenem X" — więc pytamy o to ARKUSZA, zamiast wpisywać listę
// selektorów, która rozjedzie się z nim po cichu.
//
// Selektory ze stanem (`:hover`, `:active`, `:focus*`) są odsiewane: sonda mierzy
// stan SPOCZYNKOWY, a `document.querySelector(".x:hover")` i tak nie dopasowałby
// niczego i udawałby, że podmiotu nie ma.
const paintedBy = ({ property, token }) => {
  const sheet = readFileSync(RENDERER_SHEET, "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const declaration = new RegExp(
    `(?:^|;)\\s*${property}\\s*:[^;]*var\\(\\s*--${token}\\b`,
    "i",
  );
  const found = [];
  // Reguły zagnieżdżone w `@media` też są łapane — wzorzec dopasowuje BLOK BEZ
  // KLAMER W ŚRODKU, więc owijka medialna jest przeskakiwana, a reguła w niej
  // znaleziona. Warunek medialny ginie i to jest w porządku: dopasowanie i tak
  // rozstrzyga się na żywym DOM-ie.
  for (const [, selectorText, body] of sheet.matchAll(
    /([^{}]+)\{([^{}]*)\}/g,
  )) {
    if (!declaration.test(body)) continue;
    for (const selector of selectorText.split(",")) {
      const one = selector.trim();
      if (one === "" || one.startsWith("@")) continue;
      if (/:(?:hover|active|focus|focus-visible|focus-within)\b/u.test(one))
        continue;
      if (!found.includes(one)) found.push(one);
    }
  }
  return found;
};

// Wyliczony kolor bywa oddany w kilku zapisach: `rgb()/rgba()` dla starych
// kolorów sRGB, ale `oklch(...)` dla literału OKLCH — Chromium ZACHOWUJE
// przestrzeń koloru w wartości wyliczonej. Wyciągamy WSZYSTKIE, bo `box-shadow`
// jest wartością złożoną z kilkoma kolorami naraz.
const COLOR_LITERAL =
  /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/giu;
const colorLiterals = (value) => String(value).match(COLOR_LITERAL) ?? [];

const hueDistance = (hue) => {
  const raw = Math.abs(hue - ACCENT.hue) % 360;
  return Math.min(raw, 360 - raw);
};

// Literał → werdykt o akcencie, z LICZBAMI. Komunikat porażki ma powiedzieć,
// KTÓRY warunek nie przeszedł i z jaką wartością: „chroma 0.0041 poniżej podłogi
// 0.05" jest zdaniem, „nie jest akcentem" nie jest. Neutralny, którego odcień
// przypadkiem wypadnie koło 295, ma dalej paść NA CHROMIE i raport ma to pokazać.
const accentOf = (literal) => {
  const parsed = parseColor(literal);
  const color = parsed.space === "oklch" ? parsed : srgbToOklch(parsed);
  const alpha = color.alpha ?? 1;
  const distance = hueDistance(color.h);
  return {
    literal,
    l: color.l,
    c: color.c,
    h: color.h,
    alpha,
    hueDistance: distance,
    // Alfa POD PODŁOGĄ nie maluje NIC, CO WIDAĆ, więc taki kolor nie niesie
    // akcentu niezależnie od tego, jak wygląda jego chroma. „Alfa > 0" tego nie
    // pilnowała: `oklch(55% 0.21 295 / 0.01)` przechodziło jako akcent.
    accent:
      color.c >= ACCENT.chromaFloor &&
      distance <= ACCENT.hueTolerance &&
      alpha >= ACCENT.alphaFloor,
  };
};
const describeOklch = (verdict) =>
  `oklch(${(verdict.l * 100).toFixed(1)}% ${verdict.c.toFixed(4)} ${verdict.h.toFixed(1)}` +
  `${verdict.alpha < 1 ? ` / ${verdict.alpha.toFixed(3)}` : ""})`;

// KTÓRY warunek nie przeszedł i z jaką wartością — jedno miejsce, bo ten sam
// wzorzec zdania obsługuje pierścień, akcję główną i nawigację. Kolejność
// odczytu jest kolejnością diagnozy: najpierw to, co odsiewa najczęściej.
const whyNotAccent = (verdict) =>
  verdict.c < ACCENT.chromaFloor
    ? `chroma ${verdict.c.toFixed(4)} below the ${ACCENT.chromaFloor} floor`
    : verdict.hueDistance > ACCENT.hueTolerance
      ? `hue ${verdict.h.toFixed(1)} is ${verdict.hueDistance.toFixed(1)}° from ${ACCENT.hue}`
      : `alpha ${verdict.alpha.toFixed(3)} is below the ${ACCENT.alphaFloor} floor — nothing visible is painted`;
const explainVerdicts = (verdicts) =>
  verdicts
    .map((verdict) => `${describeOklch(verdict)} — ${whyNotAccent(verdict)}`)
    .join("; ");

// Jedna zmierzona rzecz → werdykt albo AWARIA PRZYRZĄDU. Rozdział jest tu, a nie
// u wołającego, bo to jest miejsce, w którym „nie umiem tego odczytać" musi
// przestać wyglądać jak „nie ma akcentu".
const judgeAccent = ({ subject, where, signature, paint }) => {
  const literals = colorLiterals(paint);
  if (literals.length === 0) {
    return {
      failure:
        `VISUAL_PROBE_UNREADABLE_PAINT: ${subject} on ${where} (${signature}) computed to ` +
        `„${paint}", and this probe found NO colour literal in it. It measured nothing about ` +
        `the accent — this is an instrument failure, not a verdict about the visual language.`,
    };
  }
  const verdicts = [];
  for (const literal of literals) {
    try {
      verdicts.push(accentOf(literal));
    } catch (error) {
      return {
        failure:
          `VISUAL_PROBE_UNKNOWN_COLOUR_NOTATION: ${subject} on ${where} (${signature}) computed ` +
          `to „${paint}" and this probe cannot read the colour „${literal}" ` +
          `(${error instanceof Error ? error.message : String(error)}). ` +
          "Most likely cause: the token was written with color-mix(), which Chromium computes " +
          "to oklab()/color(srgb …). Write the accent as a plain oklch() literal, or teach " +
          "scripts/color-contrast.mjs the notation — do not weaken this assertion.",
      };
    }
  }
  const carrying = verdicts.find((verdict) => verdict.accent);
  return {
    verdicts,
    // TŁO jest JEDNYM malowaniem zapisanym czasem kilkoma kolorami (kolor plus
    // gradient), więc tu warunek „co najmniej jeden literał niesie akcent" jest
    // uczciwy. Dla PIERŚCIENIA nie jest — patrz `judgeRing` niżej.
    accent: carrying !== undefined,
    carrying,
  };
};

// ── PIERŚCIEŃ FOKUSA: KTÓRA WARSTWA MUSI NIEŚĆ AKCENT ────────────────────────
// Warunek „co najmniej jedna z czterech warstw" jest tu ZA SŁABY i przepuszcza
// dokładnie tę poprawkę, której ta sonda ma nie przepuścić: pierścień, którego
// widoczna linia zostaje neutralna, a akcent dostaje wyłącznie rozmyta poświata
// przy alfie 0.12. Człowiek zobaczyłby wtedy dalej szarą obwódkę.
//
// REGUŁA JEST WYPROWADZONA Z TEGO, CO v3 NAPRAWDĘ ROBI (`v3/app.css:36-43`):
//   outline: 2px solid var(--accent);        ← LINIA. Alfa 1, pełny akcent.
//   outline-offset: 1px;
//   box-shadow: 0 0 0 5px var(--accent-quieter);  ← halo, alfa 0.07-0.08
// oraz z kontraktu `.ui-craft/tokens.md`, który dla tej aplikacji zostawia
// dzisiejszą GEOMETRIĘ (jednopikselowa krawędź, dwupikselowe halo, miękki
// spadek) i zmienia WYŁĄCZNIE kolor. W obu zapisach akcent niesie ta warstwa,
// która rysuje OSTRĄ LINIĘ przy krawędzi kontrolki.
//
// Nośnikiem jest więc:
//   • widoczny `outline` (styl inny niż `none`, grubość > 0, alfa > 0), albo
//   • warstwa `box-shadow` ZEWNĘTRZNA (nie `inset`) i OSTRA (promień rozmycia
//     0 px) o NAJMNIEJSZYM rozejściu — czyli ta, która dotyka kształtu.
// Warstwa `inset` jest świadomie poza nośnikami: w dzisiejszym pierścieniu jest
// nią biały refleks `oklch(100% 0 0 / 0.36)`, który ma zostać biały. Poświata
// (rozmycie > 0) też jest poza nośnikami — to jej dotyczy cały ten akapit.
const splitTopLevel = (value) => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of String(value)) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== "");
};

// Chromium serializuje wyliczony `box-shadow` jako „KOLOR x y blur spread
// [inset]" i ZAWSZE oddaje cztery długości w pikselach — zmierzone na dzisiejszym
// pierścieniu: „oklch(0.973 0.003 255 / 0.84) 0px 0px 0px 1px". `0.0625rem`
// wraca więc jako `1px` i nie ma tu żadnego przeliczania jednostek do zrobienia.
const shadowLayers = (value) => {
  const text = String(value).trim();
  if (text === "" || text === "none") return [];
  return splitTopLevel(text).map((layer) => {
    const literals = colorLiterals(layer);
    let geometry = layer;
    for (const literal of literals) geometry = geometry.replace(literal, " ");
    const lengths = [...geometry.matchAll(/(-?\d*\.?\d+)px/gu)].map((match) =>
      Number(match[1]),
    );
    return {
      raw: layer,
      literal: literals[0],
      inset: /\binset\b/u.test(layer),
      blur: lengths[2],
      spread: lengths[3],
    };
  });
};

// Nazwa roli jedzie do raportu, żeby czytelnik widział, KTÓRĄ warstwę sonda
// osądziła, a nie tylko liczbę.
const describeLayer = (layer) =>
  layer.inset
    ? "inset specular"
    : !Number.isFinite(layer.blur) || !Number.isFinite(layer.spread)
      ? "unreadable geometry"
      : layer.blur > 0
        ? `glow (blur ${layer.blur}px)`
        : `crisp edge (spread ${layer.spread}px)`;

const judgeRing = ({ where, signature, boxShadow, outline }) => {
  const layers = shadowLayers(boxShadow);
  // GEOMETRIA, KTÓREJ NIE UMIEM ODCZYTAĆ, TO AWARIA PRZYRZĄDU — doktryna D
  // z nagłówka tej sondy, zastosowana do warstw. Bez tego warstwa bez czytelnego
  // rozmycia i rozejścia cicho wypadałaby ze zbioru nośników i pierścień dostawał
  // WERDYKT „nie rysuje widocznej linii", choć prawda brzmiałaby „nie umiem tego
  // przeczytać". Dziś nie zachodzi: Chromium oddaje cztery długości w pikselach.
  const unreadable = layers.find(
    (layer) => !Number.isFinite(layer.blur) || !Number.isFinite(layer.spread),
  );
  if (unreadable !== undefined)
    return {
      failure:
        `VISUAL_PROBE_UNREADABLE_RING_GEOMETRY: the focus ring on ${where} (${signature}) computed ` +
        `to „${boxShadow}" and this probe cannot read the blur and spread of the layer ` +
        `„${unreadable.raw}" as pixels. It therefore cannot tell which layer draws the visible ` +
        "line, and it measured NOTHING about the ring — instrument failure, not a verdict.",
    };
  const crisp = layers.filter(
    (layer) =>
      !layer.inset &&
      Number.isFinite(layer.blur) &&
      layer.blur === 0 &&
      Number.isFinite(layer.spread),
  );
  const narrowest =
    crisp.length === 0
      ? undefined
      : crisp.reduce((best, layer) =>
          layer.spread < best.spread ? layer : best,
        );
  const measured = [];
  for (const [index, layer] of layers.entries()) {
    if (layer.literal === undefined)
      return {
        failure:
          `VISUAL_PROBE_UNREADABLE_RING_LAYER: the focus ring on ${where} (${signature}) computed ` +
          `to „${boxShadow}" and layer ${index + 1} („${layer.raw}") carries no colour literal this ` +
          "probe can read. It measured NOTHING about that layer — instrument failure, not a verdict.",
      };
    try {
      measured.push({
        role: describeLayer(layer),
        carrier: layer === narrowest,
        verdict: accentOf(layer.literal),
      });
    } catch (error) {
      return {
        failure:
          `VISUAL_PROBE_UNKNOWN_COLOUR_NOTATION: the focus ring on ${where} (${signature}) computed ` +
          `to „${boxShadow}" and this probe cannot read the colour „${layer.literal}" ` +
          `(${error instanceof Error ? error.message : String(error)}). ` +
          "Most likely cause: the token was written with color-mix(), which Chromium computes " +
          "to oklab()/color(srgb …). Write the accent as a plain oklch() literal, or teach " +
          "scripts/color-contrast.mjs the notation — do not weaken this assertion.",
      };
    }
  }
  if (outline.visible && outline.literal !== undefined) {
    try {
      measured.unshift({
        role: `outline ${outline.width}px`,
        carrier: true,
        verdict: accentOf(outline.literal),
      });
    } catch (error) {
      return {
        failure:
          `VISUAL_PROBE_UNKNOWN_COLOUR_NOTATION: the focus outline on ${where} (${signature}) ` +
          `computed to „${outline.literal}" and this probe cannot read it ` +
          `(${error instanceof Error ? error.message : String(error)}).`,
      };
    }
  }
  const carriers = measured.filter((entry) => entry.carrier);
  return {
    measured,
    // ŻADNEGO NOŚNIKA to nie awaria przyrządu, tylko werdykt o narysowanym
    // pierścieniu: znaczy, że fokus nie rysuje ANI widocznego konturu, ANI
    // ostrej linii — samą poświatę. Sonda zmierzyła wtedy dokładnie to, o co
    // pyta, i odpowiedź brzmi „nie".
    hasCarrier: carriers.length > 0,
    accent: carriers.some((entry) => entry.verdict.accent),
    carriers,
  };
};

// Zbieramy KAŻDE wystąpienie na KAŻDYM celu, bez wcześniejszego wyjścia z pętli.
// Podmiot znaleziony na pierwszym ekranie, który go ma, i uznany za dowód dla
// wszystkich, jest dokładnie tym kształtem, który to repo zbiera od fal:
// asercja, do której fikstura nie dosięga, jest nieodróżnialna od poprawnej.
// `.surface-header` renderuje JEDENAŚCIE powierzchni i jedna poprawka może nie
// sięgnąć wszystkich.
const groupMeasurements = (entries) => {
  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.signature}|${entry.value}`;
    const group = groups.get(key) ?? {
      signature: entry.signature,
      selector: entry.selector,
      value: entry.value,
      surfaces: [],
      // Ile wystąpień w tej grupie stoi TAM, GDZIE CZŁOWIEK JE WIDZI. Grupa
      // złożona wyłącznie z afordancji zaparkowanych poza kadrem nie jest
      // dowodem, że podmiot w ogóle się narysował — patrz `parked` w `scan()`.
      onscreen: 0,
      parked: 0,
    };
    if (!group.surfaces.includes(entry.surface))
      group.surfaces.push(entry.surface);
    if (entry.parked === true) group.parked += 1;
    else group.onscreen += 1;
    groups.set(key, group);
  }
  return [...groups.values()];
};

// Tytuł ekranu stoi tu Z RĘKI i to jest jedyny wpisany selektor w tej sondzie.
// DLACZEGO: nie ma tokenu, po którym dałoby się go wyprowadzić z arkusza tak,
// żeby wyprowadzenie PRZEŻYŁO POPRAWKĘ. Dziś tytuł rysuje `--text-display`, ale
// Faza 2 planu ten token USUWA — sonda wyprowadzona z „co używa --text-display"
// zwracałaby wtedy zbiór pusty i meldowała awarię przyrządu w chwili, w której
// naprawa wylądowała. `.surface-header` i `<h1>` przeżywają tę zmianę oba:
// plan sprowadza nagłówek do proporcji crumbbara, ale ZOSTAWIA `<h1>` ze względu
// na dostępność (poziom nagłówka niesie hierarchię dokumentu, nie rozmiar liter).
//
// CO SIĘ STANIE, GDY TO ZNIKNIE: `.surface-header h1, h2` przestaje się
// dopasowywać, sonda nie znajduje ANI JEDNEGO tytułu na żadnym celu i pada
// z `VISUAL_PROBE_NO_SCREEN_TITLE` — czyli głośno, jako awaria przyrządu,
// z nazwą selektora do poprawienia. Nigdy jako cicha zieleń.
//
// `h2` jest w selektorze, bo dzieli z `h1` JEDNĄ regułę w arkuszu
// (`styles.css`: „.surface-header h1, .surface-header h2") — to tytuł odczytu
// zagnieżdżonego, jadący na tej samej deklaracji. Asercja na samym `h1`
// zostawiłaby połowę tej reguły niezmierzoną.
const TITLE_SELECTOR = ".surface-header h1, .surface-header h2";

// Alfa bez osądzania akcentu — potrzebna, żeby powiedzieć „ten kontur NIC nie
// maluje", zanim w ogóle stanie się kandydatem na nośnik. Nieczytelny zapis
// oddaje `undefined`, a decyzję o awarii podejmuje wołający.
const paintAlpha = (literal) => {
  try {
    return parseColor(literal).alpha ?? 1;
  } catch {
    return undefined;
  }
};

// Wyliczony `outline` → „czy to w ogóle coś rysuje". Trzy warunki, bo trzy różne
// sposoby na kontur, którego nie widać: styl `none`, zerowa grubość i alfa 0.
// Dzisiejsza aplikacja trafia w ten trzeci (`tokens.css:278` daje przy fokusie
// `outline: 2px solid transparent` jako podkładkę pod tryb wymuszonych kolorów),
// a v3 stawia tam `outline: 2px solid var(--accent)` — czyli linię pierścienia.
const outlineOf = (paint) => {
  const width = Number.parseFloat(paint.outlineWidth);
  const literal = colorLiterals(paint.outlineColor)[0];
  const alpha = literal === undefined ? undefined : paintAlpha(literal);
  return {
    visible:
      paint.outlineStyle !== "none" &&
      Number.isFinite(width) &&
      width > 0 &&
      alpha !== undefined &&
      alpha > 0,
    width: Number.isFinite(width) ? width : 0,
    literal,
  };
};

// ── OBA MOTYWY, JAWNIE ───────────────────────────────────────────────────────
// Kolejność jest znacząca tylko o tyle, że ciemny jest motywem domyślnym
// produktu — mierzone są oba tak samo i oba raportowane z nazwą.
const THEME_ORDER = ["dark", "light"];

// Jeden motyw = jeden świeży kontekst przeglądarki. `newPage` zakłada nowy
// kontekst, więc `localStorage` (a w nim `constellation.theme`) NIE PRZECIEKA
// między przebiegami, a `colorScheme` ustawia media query, z którego `main.tsx`
// czyta motyw startowy. Atrybut i tak jest potem STEMPLOWANY jawnie: media query
// to jest domysł przeglądarki, a ta sonda nie ma prawa polegać na domyśle.
const measureTheme = async (
  browser,
  theme,
  { actionSelectors, navActiveSelectors },
) => {
  const failures = [];
  const layoutProblems = [];
  const report = (line) => console.log(`visual fidelity\t${theme}\t${line}`);

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    colorScheme: theme,
  });
  page.on("pageerror", (error) =>
    failures.push(`VISUAL_PROBE_PAGE_ERROR (${theme}): ${String(error)}`),
  );
  await page.goto(HARNESS, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // STEMPEL PO NARYSOWANIU POWŁOKI, nie przed: `main.tsx` ustawia
  // `dataset.theme` przy montowaniu, więc wartość postawiona wcześniej zostałaby
  // nadpisana i sonda mierzyłaby motyw, którego nie wybrała.
  const stamped = await page.evaluate(async (wanted) => {
    const frame = () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    document.documentElement.dataset.theme = wanted;
    await frame();
    const shell = window.getComputedStyle(document.body);
    return {
      applied: document.documentElement.dataset.theme ?? "",
      // ODCISK MALOWANIA POWŁOKI, nie nazwa motywu. `body` jedzie
      // `background: var(--surface-stage)` i `color: var(--text-primary)`
      // (`styles.css:496-498`), a oba tokeny są remapowane przez blok jasny —
      // więc równy odcisk w obu przebiegach ZNACZY, że przełączenie nie zaszło.
      fingerprint: `${shell.backgroundColor} on ${shell.color}`,
    };
  }, theme);
  if (stamped.applied !== theme)
    failures.push(
      `VISUAL_PROBE_THEME_NOT_STAMPED: this probe set data-theme="${theme}" on the document ` +
        `element and read back „${stamped.applied}". Something in the renderer owns that attribute ` +
        "and overwrote it, so every measurement below would describe a theme this probe did not " +
        "choose. Instrument failure — nothing was measured.",
    );
  report(
    `theme stamped\tdata-theme=${stamped.applied}\tbody paint ${stamped.fingerprint}`,
  );

  // ── PIERŚCIEŃ FOKUSA IDZIE PIERWSZY, NA ŚWIEŻO WCZYTANEJ STRONIE ───────────
  // Kolejność jest asercją o przyrządzie, nie porządkiem. Chodzenie po celach
  // KLIKA, a kliknięcie przestawia `document.activeElement` — sekwencja Tabów
  // ruszałaby wtedy z nieznanego miejsca i dawała inny zbiór przystanków przy
  // każdym przebiegu. Zdjęcie spoczynkowych cieni też musi być zrobione, ZANIM
  // cokolwiek dostanie fokus.
  await page.evaluate(() => {
    // Malowanie pierścienia to DZIŚ `box-shadow`, a w v3 `outline` plus jedna
    // warstwa cienia. Zdjęcie obejmuje OBIE własności, bo inaczej przyjęcie
    // zapisu prototypowego zamieniłoby zieleń w `FOCUS_PAINTS_NOTHING` —
    // głośną awarię przyrządu dokładnie w chwili, w której poprawka ląduje.
    window.__focusProbeRingPaint = (element) => {
      const style = window.getComputedStyle(element);
      return {
        boxShadow: style.boxShadow,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
      };
    };
    window.__focusProbeOutline = (paint) =>
      `${paint.outlineStyle} ${paint.outlineWidth} ${paint.outlineColor}`;
    window.__focusProbeResting = new WeakMap();
    for (const element of document.querySelectorAll(
      'button, a, input, textarea, select, summary, [tabindex]:not([tabindex="-1"])',
    )) {
      const paint = window.__focusProbeRingPaint(element);
      window.__focusProbeResting.set(element, {
        boxShadow: paint.boxShadow,
        outline: window.__focusProbeOutline(paint),
      });
    }
  });
  const stops = [];
  for (let index = 0; index < 14; index += 1) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(80);
    const stop = await page.evaluate(() => {
      const element = document.activeElement;
      if (
        element === null ||
        element === document.body ||
        element === document.documentElement
      )
        return null;
      const classes = [...element.classList]
        .map((token) => {
          const match = /^_(.+)_[a-z0-9]{5,7}_\d+$/u.exec(token);
          return match === null ? token : `_${match[1]}`;
        })
        .join(".");
      const paint = window.__focusProbeRingPaint(element);
      return {
        signature:
          classes === ""
            ? element.tagName.toLowerCase()
            : `${element.tagName.toLowerCase()}.${classes}`,
        // Czy reguła pierścienia w ogóle OBEJMUJE ten element. Fokus na czymś
        // spoza jej zakresu nie mówi nic o pierścieniu.
        inScope: element.matches(
          'button, a, input, textarea, select, summary, [tabindex]:not([tabindex="-1"])',
        ),
        // PUŁAPKA A, sprawdzona wprost: czy modalność klawiaturowa naprawdę
        // uzbroiła `:focus-visible`. `element.focus()` z `page.evaluate` tego
        // NIE robi; prawdziwy Tab robi.
        focusVisible: element.matches(":focus-visible"),
        paint,
        focusedOutline: window.__focusProbeOutline(paint),
        resting: window.__focusProbeResting?.get(element) ?? null,
      };
    });
    if (stop === null) continue;
    if (stops.some((seen) => seen.signature === stop.signature)) continue;
    stops.push({ index, ...stop });
  }
  for (const stop of stops)
    report(
      `focus stop ${stop.index}\t${stop.signature}\tin scope: ${stop.inScope}\t` +
        `:focus-visible: ${stop.focusVisible}\t` +
        `resting box-shadow: ${stop.resting?.boxShadow ?? "NOT SNAPSHOTTED"}\t` +
        `focused box-shadow: ${stop.paint.boxShadow}\t` +
        `resting outline: ${stop.resting?.outline ?? "NOT SNAPSHOTTED"}\t` +
        `focused outline: ${stop.focusedOutline}`,
    );
  // Trzy różne awarie przyrządu, trzy różne komunikaty — bo prowadzą do trzech
  // różnych miejsc.
  const armed = stops.filter((stop) => stop.inScope && stop.focusVisible);
  // ELEMENT, NA KTÓRYM FOKUS COKOLWIEK NAMALOWAŁ. Filtr jest konieczny i jego
  // powód jest zmierzony: reguła pierścienia w `tokens.css` stoi na
  // `:where(button, a, …):focus-visible`, czyli ma specyficzność (0,1,0), a
  // `styles.css` jest importowany PO `tokens.css` — więc każda kontrolka
  // z własnym `box-shadow` o specyficzności ≥ (0,1,0) NADPISUJE pierścień
  // (`.nav-item.active` = (0,2,0), `.secondary-button` = (0,1,0) później
  // w kolejności). Mierzenie takiej kontrolki dałoby czerwień, która nie mówi
  // nic o `--focus-ring`.
  //
  // A PRZYSTANEK BEZ ZDJĘCIA SPOCZYNKOWEGO NIE JEST PODMIOTEM, tylko AWARIĄ
  // PRZYRZĄDU — i to jest dokładnie ta klasa kłamstwa, przeciwko której stoi cała
  // ta sonda. Zdjęcie robi się PRZED pętlą Tabów, więc kontrolka zamontowana
  // w jej trakcie (albo wtedy jeszcze poza zakresem reguły) ma `resting === null`,
  // a `focused !== null` jest wtedy PRAWDZIWE ZAWSZE. Taki przystanek wpadłby do
  // `painting`, a sonda osądziłaby JEGO WŁASNY cień jako pierścień fokusa
  // i wydała werdykt o rzeczy, która pierścieniem nie jest. Dziś nie zachodzi —
  // każdy z dziewięciu przystanków miał wartość spoczynkową — więc to jest
  // zamknięcie luki, nie poprawka wyniku.
  for (const stop of armed.filter((stop) => stop.resting === null))
    failures.push(
      `VISUAL_PROBE_NO_RESTING_SHADOW (${theme}): tab stop ${stop.index} (${stop.signature}) was ` +
        "not in the resting paint snapshot taken before the Tab loop — it mounted during the loop, " +
        "or it was outside the ring rule's scope when the snapshot was taken. This probe therefore " +
        "cannot tell that control's focus ring from its own shadow, and it measured NOTHING about " +
        "the ring there. Instrument failure, not a verdict about the accent.",
    );
  // ZMIANA, KTÓRĄ WIDAĆ — nie każda zmiana napisu. `tokens.css:278` ustawia przy
  // fokusie `outline: 2px solid transparent`, więc SAM NAPIS konturu zmienia się
  // na KAŻDEJ kontrolce, także na tych, które nadpisują pierścień własnym cieniem
  // (`.nav-item.active`, `.capture-dock`). Wpuszczenie ich tutaj kazałoby sondzie
  // osądzić CUDZY cień jako pierścień fokusa — zmierzone: dwa takie przystanki
  // dostawały werdykt o „pierścieniu", który jest ich własną elewacją.
  // Kontur liczy się więc dopiero, gdy jest WIDOCZNY (styl, grubość, alfa), czyli
  // dokładnie wtedy, gdy zapis prototypowy (`outline: 2px solid var(--accent)`)
  // naprawdę zastąpi dzisiejszy cień.
  const painting = armed.filter(
    (stop) =>
      stop.resting !== null &&
      (stop.paint.boxShadow !== stop.resting.boxShadow ||
        (stop.focusedOutline !== stop.resting.outline &&
          outlineOf(stop.paint).visible)),
  );
  if (stops.length === 0)
    failures.push(
      `VISUAL_PROBE_NO_TAB_STOP (${theme}): fourteen Tab presses moved focus nowhere — ` +
        "document.activeElement never left <body>. Nothing was measured about the focus ring.",
    );
  else if (armed.length === 0)
    failures.push(
      `VISUAL_PROBE_FOCUS_VISIBLE_NOT_ARMED (${theme}): ${stops.length} tab stop(s) took focus and ` +
        "NONE of them matched :focus-visible while in the ring rule's scope. That is the probe " +
        "failing to reach keyboard modality, not the application missing a ring — do NOT weaken " +
        "the assertion, fix the probe (real key events, not element.focus()).",
    );
  else if (painting.length === 0)
    failures.push(
      `VISUAL_PROBE_FOCUS_PAINTS_NOTHING (${theme}): ${armed.length} tab stop(s) were ` +
        ":focus-visible and in the ring rule's scope, and on none of them did focus change " +
        "box-shadow or outline at all. Either --focus-ring resolves to nothing, or every stop " +
        "reached here overrides the ring with its own box-shadow (the :where() rule has " +
        "specificity (0,1,0) and styles.css loads after tokens.css). Check that before hunting " +
        "a missing accent — nothing was measured either way.",
    );
  for (const stop of painting) {
    const judged = judgeRing({
      where: `tab stop ${stop.index}`,
      signature: stop.signature,
      boxShadow: stop.paint.boxShadow,
      outline: outlineOf(stop.paint),
    });
    if (judged.failure !== undefined) {
      failures.push(judged.failure);
      continue;
    }
    for (const layer of judged.measured)
      report(
        `focus ring\ttab stop ${stop.index}\t${stop.signature}\t${layer.role}\t` +
          `${layer.carrier ? "CARRIES THE RING" : "not the carrying layer"}\t` +
          `${describeOklch(layer.verdict)}\tchroma ${layer.verdict.c.toFixed(4)} ` +
          `(floor ${ACCENT.chromaFloor})\thue ${layer.verdict.h.toFixed(1)} ` +
          `(${layer.verdict.hueDistance.toFixed(1)}° from ${ACCENT.hue}, tolerance ` +
          `${ACCENT.hueTolerance})\talpha ${layer.verdict.alpha.toFixed(3)} ` +
          `(floor ${ACCENT.alphaFloor})\t${layer.verdict.accent ? "ACCENT" : "NOT ACCENT"}`,
      );
    if (!judged.hasCarrier) {
      layoutProblems.push(
        `the focus ring on ${stop.signature} (tab stop ${stop.index}) draws NO visible line at all: ` +
          `no outline, and no crisp box-shadow layer — only ${judged.measured
            .map((layer) => layer.role)
            .join(
              ", ",
            )}. A ring made of glow alone is not the v3 focus treatment, which is a ` +
          "line tight to the shape.",
      );
      continue;
    }
    if (!judged.accent)
      layoutProblems.push(
        `the focus ring on ${stop.signature} (tab stop ${stop.index}) carries no accent on the ` +
          `layer that actually draws its line — ${judged.carriers
            .map(
              (layer) =>
                `${layer.role}: ${describeOklch(layer.verdict)} — ${whyNotAccent(layer.verdict)}`,
            )
            .join(
              "; ",
            )}. Layers that do NOT draw the line (glow, inset specular) were measured ` +
          `too and are NOT accepted as the accent: ${judged.measured
            .filter((layer) => !layer.carrier)
            .map((layer) => `${layer.role} ${describeOklch(layer.verdict)}`)
            .join(
              "; ",
            )}. The v3 language puts the accent exactly where focus is, on the line.`,
      );
  }

  // ── AKCJA GŁÓWNA, AKTYWNA NAWIGACJA I TYTUŁ — NA KAŻDYM CELU ──────────────
  const collected = await page.evaluate(
    async ({
      actionSelectors,
      navActiveSelectors,
      titleSelector,
      wantedTheme,
      settingsSurface,
    }) => {
      const frame = () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      const normaliseClass = (token) => {
        const match = /^_(.+)_[a-z0-9]{5,7}_\d+$/u.exec(token);
        return match === null ? token : `_${match[1]}`;
      };
      const signature = (element) => {
        const tag = element.tagName.toLowerCase();
        const classes = [...element.classList].map(normaliseClass).join(".");
        return classes === "" ? tag : `${tag}.${classes}`;
      };
      const visible = (element) => element.getClientRects().length > 0;
      // ZAPARKOWANY POZA KADREM albo PRZYCIĘTY DO NICZEGO. Wyprowadzone
      // z KSZTAŁTU, nie z nazwy klasy: pytanie brzmi „czy człowiek to widzi",
      // a nie „czy to się nazywa skip-link". Afordancja dostępnościowa siedzi
      // dziś nad początkiem układu (`transform: translate(-50%, -180%)`,
      // `styles.css:4275-4285`) i zjeżdża w kadr dopiero z fokusem.
      //
      // CELOWO NIE liczymy „poniżej zgięcia" jako zaparkowania: kontrolka pod
      // spodem jest osiągalna przewinięciem, a ta nad początkiem kadru — tylko
      // fokusem. Tamto jest zwykłym układem, to jest ukryciem.
      const parkedOutOfFrame = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.bottom <= 0 ||
          rect.right <= 0 ||
          rect.left >= window.innerWidth ||
          rect.width * rect.height <= 4 ||
          style.visibility === "hidden" ||
          style.opacity === "0"
        );
      };
      const action = [];
      const navActive = [];
      const title = [];
      const themeDrift = [];
      // Motyw sprawdzany PRZY KAŻDYM POMIARZE, nie raz na przebieg. Renderer
      // przemontowuje ekrany przy przejściu, a stempel postawiony raz nie jest
      // dowodem na to, co obowiązywało dziesięć kliknięć później.
      const holdTheme = (surface) => {
        const seen = document.documentElement.dataset.theme ?? "";
        if (seen === wantedTheme) return;
        themeDrift.push({ surface, seen });
        document.documentElement.dataset.theme = wantedTheme;
      };
      const scan = (surface) => {
        holdTheme(surface);
        for (const [selectors, into] of [
          [actionSelectors, action],
          [navActiveSelectors, navActive],
        ]) {
          for (const selector of selectors) {
            for (const element of document.querySelectorAll(selector)) {
              if (!visible(element)) continue;
              const style = window.getComputedStyle(element);
              into.push({
                surface,
                selector,
                signature: signature(element),
                parked: parkedOutOfFrame(element),
                // Kolor tła I OBRAZ tła w jednym napisie: gdyby przycisk kiedyś
                // dostał gradient, `backgroundColor` byłby przezroczysty, a cały
                // akcent siedziałby w `background-image`. Czytanie samego koloru
                // dałoby wtedy czerwień nad poprawnym ekranem.
                value: `${style.backgroundColor} ${style.backgroundImage}`,
              });
            }
          }
        }
        for (const element of document.querySelectorAll(titleSelector)) {
          if (!visible(element)) continue;
          const style = window.getComputedStyle(element);
          title.push({
            surface,
            selector: titleSelector,
            signature: signature(element),
            parked: parkedOutOfFrame(element),
            // ROZMIAR I WAGA W JEDNYM NAPISIE, bo grupowanie idzie po wartości:
            // tytuł 13 px o wadze 400 i tytuł 13 px o wadze 600 to DWA różne
            // pomiary i mają nie wpaść do jednej grupy.
            value: `${style.fontSize} ${style.fontWeight}`,
            text: (element.textContent ?? "").trim().slice(0, 48),
          });
        }
      };
      const destinations = [
        ...document.querySelectorAll(".nav-item[data-surface]"),
      ].map((item) => item.dataset.surface);
      const visited = [];
      scan("landing");
      for (const id of destinations) {
        const target = document.querySelector(
          `.nav-item[data-surface="${id}"]`,
        );
        if (!(target instanceof HTMLElement)) continue;
        target.click();
        await frame();
        await new Promise((resolve) => setTimeout(resolve, 500));
        await frame();
        visited.push(id);
        scan(id);
      }
      // USTAWIENIA SĄ TRYBEM, nie pozycją nawigacji — wchodzi się kołem zębatym
      // (`[data-settings-entry]`), a wejście PODMIENIA lewą kolumnę, więc
      // pozycja nawigacji następnego celu przestaje istnieć. Dlatego ten cel
      // jest OSTATNI: pętla wyżej ma już wtedy za sobą wszystkie kliknięcia
      // i nie ma czego rozwalić (`sweep` rozwiązuje to inaczej, bo tam Ustawienia
      // stoją w środku listy i wymagają wyjścia `[data-settings-back]`).
      // Bez tego dwa z pięciu selektorów akcji głównej były STRUKTURALNIE
      // nieosiągalne: `.settings-control …` rysuje się tylko tutaj.
      let settingsVisited = false;
      const settingsEntry = document.querySelector("[data-settings-entry]");
      if (settingsEntry instanceof HTMLElement) {
        settingsEntry.click();
        await frame();
        await new Promise((resolve) => setTimeout(resolve, 500));
        await frame();
        visited.push(settingsSurface);
        settingsVisited = true;
        scan(settingsSurface);
      }
      return {
        destinations,
        visited,
        settingsVisited,
        themeDrift,
        action,
        navActive,
        title,
        rootFontSizePx: Number.parseFloat(
          window.getComputedStyle(document.documentElement).fontSize,
        ),
      };
    },
    {
      actionSelectors,
      navActiveSelectors,
      titleSelector: TITLE_SELECTOR,
      wantedTheme: theme,
      settingsSurface: SETTINGS_SURFACE,
    },
  );

  for (const drift of collected.themeDrift)
    failures.push(
      `VISUAL_PROBE_THEME_DRIFTED (${theme}): on ${drift.surface} the document element carried ` +
        `data-theme="${drift.seen}" instead of "${theme}". Something in the renderer rewrites that ` +
        "attribute while this probe walks, so measurements taken after that point describe a theme " +
        "this probe did not choose. Instrument failure.",
    );
  if (collected.destinations.length < 5)
    failures.push(
      `VISUAL_PROBE_EMPTY_SHELL (${theme}): only ${collected.destinations.length} navigation ` +
        "destination(s) rendered, so this probe walked almost nothing. An empty walk is a broken " +
        "measurement, not a pass.",
    );
  if (!collected.settingsVisited)
    failures.push(
      `VISUAL_PROBE_NO_SETTINGS_ENTRY (${theme}): „[data-settings-entry]" matched nothing, so the ` +
        "Settings mode was not walked and the primary-action selectors that only render there " +
        "(.settings-control …) were NOT measured. The affordance moved — this probe has to move " +
        "with it.",
    );
  // Powierzchnie NAPRAWDĘ obejrzane: lądowanie plus każdy cel, który dał się
  // otworzyć. Mianownik pokrycia bierze się stąd, a nie z liczby pozycji
  // w nawigacji — inaczej cel, który się nie otworzył, cicho podnosiłby wynik.
  const scanned = ["landing", ...collected.visited];

  for (const [subject, entries, selectors, code] of [
    [
      "primary action background",
      collected.action,
      actionSelectors,
      "VISUAL_PROBE_NO_PRIMARY_ACTION",
    ],
    [
      "active navigation item",
      collected.navActive,
      navActiveSelectors,
      "VISUAL_PROBE_NO_ACTIVE_NAV",
    ],
  ]) {
    if (selectors.length === 0) continue;
    if (entries.length === 0) {
      failures.push(
        `${code} (${theme}): none of the ${selectors.length} selector(s) derived from styles.css ` +
          `(${selectors.join(", ")}) drew a visible element on any of the ${scanned.length} ` +
          `surface(s) walked (${scanned.join(", ")}). THIS PROBE MEASURED NOTHING about the ` +
          `${subject} — that is an instrument failure, not evidence that the accent is missing.`,
      );
      continue;
    }
    // ── PODŁOGA POKRYCIA, PODMIOT PO PODMIOCIE ──────────────────────────────
    // „N of M" WYPISANE nie jest asercją: podmiot znaleziony na jednym celu
    // przechodził tak samo jak na dwunastu. Zmierzone: `.primary-button`
    // narysował się na JEDNYM celu, a zbiór trzymał niepustym `a.skip-link` —
    // afordancja dostępnościowa zaparkowana poza kadrem. Zniknięciu prawdziwego
    // przycisku głównego nie odpowiadała ŻADNA awaria.
    const onscreen = entries.filter((entry) => entry.parked !== true);
    if (onscreen.length === 0)
      failures.push(
        `${code}_ONLY_PARKED (${theme}): every one of the ${entries.length} element(s) matched for ` +
          `the ${subject} is parked out of the frame or clipped to nothing ` +
          `(${[...new Set(entries.map((entry) => entry.signature))].join(", ")}). An off-screen ` +
          "accessibility affordance keeps the set non-empty while the real affordance is gone — " +
          "so this probe measured NOTHING a person can see. Instrument failure.",
      );
    const coveredSurfaces = new Set(entries.map((entry) => entry.surface));
    const groups = groupMeasurements(entries);
    report(
      `${subject}\t${entries.length} element(s) (${onscreen.length} on screen, ` +
        `${entries.length - onscreen.length} parked out of frame), ${groups.length} distinct ` +
        `paint(s), on ${coveredSurfaces.size} of ${scanned.length} surface(s) walked`,
    );
    for (const group of groups) {
      const judged = judgeAccent({
        subject,
        where: group.surfaces.join("/"),
        signature: group.signature,
        paint: group.value,
      });
      if (judged.failure !== undefined) {
        failures.push(judged.failure);
        continue;
      }
      const best = judged.carrying ?? judged.verdicts[0];
      report(
        `${subject}\t${group.signature}\t[${group.selector}]\ton ${group.surfaces.join(", ")}\t` +
          `${group.onscreen} on screen / ${group.parked} parked\t${describeOklch(best)}\t` +
          `chroma ${best.c.toFixed(4)} (floor ${ACCENT.chromaFloor})\t` +
          `hue ${best.h.toFixed(1)} (${best.hueDistance.toFixed(1)}° from ${ACCENT.hue}, ` +
          `tolerance ${ACCENT.hueTolerance})\talpha ${best.alpha.toFixed(3)} ` +
          `(floor ${ACCENT.alphaFloor})\t${judged.accent ? "ACCENT" : "NOT ACCENT"}`,
      );
      if (!judged.accent)
        layoutProblems.push(
          `the ${subject} ${group.signature} on ${group.surfaces.join(", ")} does not resolve to ` +
            `the accent: ${explainVerdicts(judged.verdicts)}. The v3 language spends its one ` +
            "accent on exactly this: what is active, what is primary, and where focus is.",
        );
    }
    // AKTYWNA NAWIGACJA NALEŻY SIĘ KAŻDEMU EKRANOWI: powłoka zawsze mówi, gdzie
    // jesteś. Ustawienia są wyjęte i to nie jest ulga, tylko fakt o kształcie —
    // ten TRYB podmienia lewą kolumnę, więc pozycji nawigacji tam po prostu nie
    // ma. Akcja główna ma podłogę „co najmniej jedno wystąpienie w kadrze",
    // wyżej: ekran bez akcji głównej jest normalny, aplikacja bez niej nie.
    if (subject === "active navigation item") {
      const owed = scanned.filter((surface) => surface !== SETTINGS_SURFACE);
      const blind = owed.filter((surface) => !coveredSurfaces.has(surface));
      if (blind.length > 0)
        failures.push(
          `VISUAL_PROBE_ACTIVE_NAV_COVERAGE (${theme}): the shell drew no active navigation item ` +
            `on ${blind.join(", ")} (${blind.length} of ${owed.length} surface(s) owed one). ` +
            "Either the shell stopped marking where you are, or the selector derived from " +
            "styles.css stopped matching it there — either way this probe measured NOTHING about " +
            "the accent on those screens.",
        );
    }
  }

  // ── TYTUŁ EKRANU ──────────────────────────────────────────────────────────
  // Sufit liczony z ŻYWEGO `rem`, nie z wpisanych 20 px: `1.25rem` znaczy
  // „dwadzieścia pikseli przy domyślnym rem", a przy przeskalowanym tekście
  // znaczy odpowiednio więcej. Wpisana liczba pikseli byłaby asercją, która
  // gnije przy pierwszej zmianie rozmiaru bazowego.
  if (
    !Number.isFinite(collected.rootFontSizePx) ||
    collected.rootFontSizePx <= 0
  )
    failures.push(
      `VISUAL_PROBE_NO_ROOT_FONT_SIZE (${theme}): the document element computed a root font size ` +
        `of „${collected.rootFontSizePx}", so the ${TITLE_MIN_REM}–${TITLE_MAX_REM}rem band cannot ` +
        "be turned into pixels and the screen title was not measured.",
    );
  else if (collected.title.length === 0)
    failures.push(
      `VISUAL_PROBE_NO_SCREEN_TITLE (${theme}): „${TITLE_SELECTOR}" matched no visible element on ` +
        `any of the ${scanned.length} surface(s) walked (${scanned.join(", ")}). THIS PROBE ` +
        "MEASURED NOTHING about the screen title — the header affordance moved and this selector " +
        "has to move with it. Not evidence that the title is the right size.",
    );
  else {
    const ceilingPx = TITLE_MAX_REM * collected.rootFontSizePx;
    const floorPx = TITLE_MIN_REM * collected.rootFontSizePx;
    const groups = groupMeasurements(collected.title);
    const titled = new Set(collected.title.map((entry) => entry.surface));
    // Pokrycie tytułu jest RAPORTOWANE Z NAZWAMI, a asertowana jest tylko
    // podłoga „co najmniej jeden" (wyżej). Dziś dwa cele nie rysują `<h1>`
    // w `.surface-header` — podniesienie tej podłogi do „każdy cel" zamieniłoby
    // znany brak pokrycia w awarię przyrządu, czyli w czerwień, która nie mówi
    // nic o języku wizualnym.
    report(
      `screen title\t${collected.title.length} title(s), ${groups.length} distinct size/weight ` +
        `pair(s), on ${titled.size} of ${scanned.length} surface(s) walked\tno title drawn on: ` +
        `${scanned.filter((surface) => !titled.has(surface)).join(", ") || "none"}\t` +
        `band ${floorPx.toFixed(1)}–${ceilingPx.toFixed(1)}px ` +
        `(${TITLE_MIN_REM}–${TITLE_MAX_REM}rem at a ${collected.rootFontSizePx}px root), ` +
        `weight floor ${TITLE_MIN_WEIGHT}`,
    );
    for (const group of groups) {
      const [size, weight] = group.value.split(" ");
      const px = Number.parseFloat(size);
      const fontWeight = Number.parseFloat(weight);
      if (!Number.isFinite(px) || !Number.isFinite(fontWeight)) {
        failures.push(
          `VISUAL_PROBE_UNREADABLE_TITLE_TYPE (${theme}): ${group.signature} on ` +
            `${group.surfaces.join(", ")} computed a font size/weight of „${group.value}", which ` +
            "this probe cannot read as a number of pixels and a numeric weight.",
        );
        continue;
      }
      report(
        `screen title\t${group.signature}\ton ${group.surfaces.join(", ")}\t${px.toFixed(1)}px\t` +
          `weight ${fontWeight}\t` +
          `${px > ceilingPx ? "OVER" : px < floorPx ? "UNDER" : "WITHIN"} the ` +
          `${floorPx.toFixed(1)}–${ceilingPx.toFixed(1)}px band\t` +
          `${fontWeight >= TITLE_MIN_WEIGHT ? "weight ok" : "TOO LIGHT"}`,
      );
      if (px > ceilingPx)
        layoutProblems.push(
          `the screen title ${group.signature} on ${group.surfaces.join(", ")} draws at ` +
            `${px.toFixed(1)}px, over the ${ceilingPx.toFixed(1)}px ceiling ` +
            `(${TITLE_MAX_REM}rem). That is a display heading, not a title bar — the v3 header is ` +
            "a crumbbar carrying the title at --text-sm with weight 600.",
        );
      else if (px < floorPx)
        layoutProblems.push(
          `the screen title ${group.signature} on ${group.surfaces.join(", ")} draws at ` +
            `${px.toFixed(1)}px, under the ${floorPx.toFixed(1)}px floor (${TITLE_MIN_REM}rem). ` +
            "Shrinking the display heading past the crumbbar is not the fix either — v3 draws " +
            "this title at --text-sm, 0.8125rem.",
        );
      if (fontWeight < TITLE_MIN_WEIGHT)
        layoutProblems.push(
          `the screen title ${group.signature} on ${group.surfaces.join(", ")} draws at weight ` +
            `${fontWeight}, under the ${TITLE_MIN_WEIGHT} the v3 crumbbar gives it ` +
            "(v3/app.css:292). At --text-sm the weight is what separates a title from body text, " +
            "so a lighter title is not a smaller title — it is no title.",
        );
    }
  }

  await page.close();
  return {
    failures,
    // NAZWA MOTYWU DOKLEJONA DO KAŻDEGO WERDYKTU, nie tylko do wierszy raportu.
    // Werdykt bez niej czyta się jak zdanie o produkcie, a po Fazie 1 połowa
    // z nich będzie różna w obu motywach: `--focus-ring` jest zdefiniowany
    // wyłącznie w bloku ciemnym, a `--action-primary-bg` i `--surface-selected`
    // nadpisuje też blok jasny. Czytelnik ma widzieć, KTÓRY blok poprawić.
    layoutProblems: layoutProblems.map(
      (problem) => `in the ${theme} theme, ${problem}`,
    ),
    fingerprint: stamped.fingerprint,
  };
};

const visualFidelity = async (browser) => {
  const failures = [];
  const layoutProblems = [];

  const actionSelectors = paintedBy({
    property: "background(?:-color)?",
    token: "action-primary-bg",
  });
  const navActiveSelectors = paintedBy({
    property: "background(?:-color)?",
    token: "nav-active-bg",
  });
  if (actionSelectors.length === 0)
    failures.push(
      "VISUAL_PROBE_NO_PRIMARY_ACTION_RULE: no rule in packages/desktop-ui/src/styles.css paints " +
        "background from var(--action-primary-bg), so this probe has no subject to measure for the " +
        "primary action. The affordance moved, or the token was renamed — the accent was NOT checked.",
    );
  if (navActiveSelectors.length === 0)
    failures.push(
      "VISUAL_PROBE_NO_NAV_ACTIVE_RULE: no rule in packages/desktop-ui/src/styles.css paints " +
        "background from var(--nav-active-bg), so this probe has no subject to measure for the " +
        "active navigation item. The affordance moved, or the token was renamed — the accent was " +
        "NOT checked.",
    );

  const fingerprints = new Map();
  for (const theme of THEME_ORDER) {
    const measured = await measureTheme(browser, theme, {
      actionSelectors,
      navActiveSelectors,
    });
    failures.push(...measured.failures);
    layoutProblems.push(...measured.layoutProblems);
    fingerprints.set(theme, measured.fingerprint);
  }
  // DOWÓD, ŻE PRZEŁĄCZENIE ZASZŁO — i to jest asercja o PRZYRZĄDZIE, nie
  // o produkcie. Bez niej dwa przebiegi mierzące ten sam motyw wracają
  // z podwojoną, zgodną odpowiedzią i wyglądają na potwierdzenie. Tak właśnie
  // powstała pierwsza wersja tej sondy: deklarowała ciemny, mierzyła jasny.
  if (new Set(fingerprints.values()).size < fingerprints.size)
    failures.push(
      "VISUAL_PROBE_THEME_DID_NOT_SWITCH: the shell painted IDENTICALLY in every theme this probe " +
        `walked (${[...fingerprints]
          .map(([theme, print]) => `${theme}: ${print}`)
          .join(
            " | ",
          )}). Setting data-theme did not change what the browser drew, so both passes ` +
        "measured the same paint twice. Instrument failure — no verdict below is about two themes.",
    );
  return { failures, layoutProblems };
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
  // SONDA WIERNOŚCI WIZUALNEJ — osobny przelot, bo mierzy KOLOR i ROZMIAR, a nie
  // geometrię, i nie ma czego szukać w wąskim oknie ani przy 200% tekstu.
  //
  // OBIE LISTY EGZEKWOWANE BEZWARUNKOWO, RÓWNIEŻ W TRYBIE RAPORTU. `REPORT_ONLY`
  // ma w tym pliku jeden, nazwany zakres — rejestr przepełnień („tryb raportu
  // zdejmuje tylko to jedno: czy przepełnienie robi się błędem") — a dla werdyktu
  // o akcencie nie ma żadnego rejestru do odświeżenia. Wyciszenie go tutaj
  // zrobiłoby z tej sondy dziewiąty przyrząd opowiadający dwie różne historie
  // zależnie od zmiennej środowiskowej, czego ten plik ma już jeden opisany
  // przypadek.
  const fidelity = await visualFidelity(browser);
  for (const failure of fidelity.failures) {
    problems.push(`visual fidelity — instrument: ${failure}`);
  }
  for (const problem of fidelity.layoutProblems) {
    problems.push(`visual fidelity — ${problem}`);
  }
  console.log(
    `visual fidelity: ${
      fidelity.failures.length + fidelity.layoutProblems.length === 0
        ? "the v3 visual language holds"
        : `${fidelity.failures.length} instrument failure(s), ${fidelity.layoutProblems.length} verdict(s)`
    }`,
  );
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
  // Nieudane zatrzymanie jest RAPORTOWANE, nie RZUCANE: `finally`, które rzuca,
  // podmienia prawdziwy werdykt bramki na własną awarię — a to jest dokładnie ta
  // klasa kłamstwa, przed którą stoi ten plik. Zablokowany port i tak zatrzyma
  // NASTĘPNY przebieg, na próbie wiązania, z nazwanym powodem.
  await stop().catch((error) => console.error(error.message));
}

if (REPORT_ONLY) {
  console.log(
    `\nReport mode: ${KNOWN_DESCENDANT_OVERFLOWS.length} registry entries, no descendant verdict was enforced.`,
  );
}

if (problems.length > 0) {
  throw new Error(`RENDERER_LAYOUT_INVALID:\n${problems.join("\n")}`);
}
