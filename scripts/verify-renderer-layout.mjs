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
import {
  RECORD_TITLE_BAND_OWNER,
  VISUAL_LANGUAGE_EXPECTED,
  VISUAL_LANGUAGE_NOT_COVERED,
  VISUAL_LANGUAGE_PAIRS,
  VISUAL_LANGUAGE_ROUTED_EXPECTED,
  VISUAL_LANGUAGE_ROUTED_NOT_COVERED,
  VISUAL_LANGUAGE_ROUTED_PAIRS,
} from "./visual-language-pairs.mjs";

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
    async ({
      fontSize,
      scrollAttribute,
      surfaces,
      SETTINGS_SURFACE,
      titleSelector,
      recordScreenSelector,
    }) => {
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
      // ── TYTUŁ EKRANU NA KAŻDEJ GEOMETRII ──────────────────────────────────
      // Sonda wierności wizualnej otwiera JEDNO okno 1440×900 i tyle. Reguła
      // `@media (max-width: 30rem)` powiększająca tytuł 2,15× (28,0 px przy
      // suficie 20,0 px) przechodziła przez nią zielono, bo tamten przelot
      // nigdy nie schodzi do 480 px. Te przeloty schodzą — 320 px, 200% tekstu,
      // dwie szerokości Biblioteki — więc pomiar jedzie TUTAJ, na już otwartych
      // celach, bez ani jednego dodatkowego wczytania strony.
      const titles = [];
      const titleCounts = [];
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
          // Podmiot z DEKLARACJI (`id="surface-title"`), a nie z klasy
          // nagłówka — powód stoi przy `TITLE_SELECTOR`. Pytany jest CAŁY
          // dokument, nie `drawn`: liczba dopasowań ma być liczbą wystąpień
          // identyfikatora na stronie, bo dwa z nich to awaria przyrządu
          // niezależnie od tego, w którym poddrzewie siedzą.
          {
            const found = [...document.querySelectorAll(titleSelector)];
            titleCounts.push({ surface: label, matched: found.length });
            for (const element of found) {
              const style = window.getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              titles.push({
                surface: label,
                selector: titleSelector,
                signature: signature(element),
                record: element.closest(recordScreenSelector) !== null,
                // The record KIND, taken from the same declaration that says
                // this is a record screen at all. The coverage guard over the
                // record-title band needs to answer "which kind stopped being
                // measured", and the surface label (`tasks:task:comments`)
                // only spells the kind by convention — this reads it.
                recordKind:
                  element
                    .closest(recordScreenSelector)
                    ?.getAttribute("data-record-kind") ?? null,
                // PRZYCIĘTY DO NICZEGO ALBO NIEWIDOCZNY — po KSZTAŁCIE, nie po
                // nazwie klasy: sr-only `<h1>` stanu ładowania ma tę postać,
                // a osąd rozmiaru nad nim mówiłby o afordancji, której nikt
                // nie ogląda.
                parked:
                  element.getClientRects().length === 0 ||
                  rect.width * rect.height <= 4 ||
                  style.visibility === "hidden" ||
                  style.opacity === "0",
                value: `${style.fontSize} ${style.fontWeight}`,
                text: (element.textContent ?? "").trim().slice(0, 48),
              });
            }
          }
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
        titles,
        titleCounts,
        // Rem MIERZONY, nie wyliczony z napisu „200%": pasmo tytułu jest w rem,
        // więc sufit w pikselach musi wyjść z tego samego korzenia, który
        // narysował literę.
        rootFontSizePx: Number.parseFloat(
          window.getComputedStyle(document.documentElement).fontSize,
        ),
      };
    },
    {
      fontSize,
      scrollAttribute: HORIZONTAL_SCROLL_ATTRIBUTE,
      surfaces,
      SETTINGS_SURFACE,
      titleSelector: TITLE_SELECTOR,
      recordScreenSelector: RECORD_SCREEN_SELECTOR,
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
  // ── TYTUŁ EKRANU NA TEJ GEOMETRII ─────────────────────────────────────────
  // Osobna lista zwracana z tego przelotu, a nie `layoutProblems`, i to jest
  // decyzja o KSIĘGOWOŚCI, nie o stylu. `layoutProblems` to rejestr przepełnień
  // i tryb raportu (`LAYOUT_DESCENDANT_REPORT=1`) je wycisza, bo mają rejestr
  // do odświeżenia. Werdykt o rozmiarze tytułu żadnego rejestru nie ma i wyciszać
  // go nie ma po co — sonda wierności egzekwuje swoje bezwarunkowo i ten pomiar
  // jest jej drugim zakresem, a nie nowym trybem.
  const titleProblems = [];
  for (const seen of measured.titleCounts.filter(
    (entry) => entry.matched !== 1,
  ))
    failures.push({
      surface: seen.surface,
      reason:
        `„${TITLE_SELECTOR}" matched ${seen.matched} element(s) here, not exactly one — an id is ` +
        "unique by definition, so with two this pass judges whichever came first and cannot say " +
        "which, and with none it judges nothing. Instrument failure, not a verdict about the title",
    });
  const rootFontSizePx = measured.rootFontSizePx;
  if (!Number.isFinite(rootFontSizePx) || rootFontSizePx <= 0) {
    failures.push({
      surface: "-",
      reason: `the document element computed a root font size of „${rootFontSizePx}", so the ${TITLE_MIN_REM}–${TITLE_MAX_REM}rem title band cannot be turned into pixels and no title was judged on this geometry`,
    });
  } else {
    const parkedTitles = measured.titles.filter(
      (entry) => entry.parked === true,
    );
    const recordTitles = measured.titles.filter(
      (entry) => entry.record === true && entry.parked !== true,
    );
    const screenTitles = measured.titles.filter(
      (entry) => entry.record !== true && entry.parked !== true,
    );
    const judgedTitles = judgeTitleBand({
      entries: screenTitles,
      rootFontSizePx,
      where: label,
    });
    for (const failure of judgedTitles.failures)
      failures.push({ surface: "-", reason: failure });
    titleProblems.push(...judgedTitles.problems);
    // DRUGIE PASMO, NIE DRUGI RAPORT. Tytuł rekordu ma teraz własny osąd
    // (`judgeRecordTitleBand`) i wchodzi do tej samej listy werdyktów, co
    // tytuł ekranu — powód przy definicji pasma.
    //
    // `problems` IS EMPTY HERE while lot 4 has not delivered the position: the
    // measurement comes out in `pending` instead and is printed below, without
    // failing the pass. `openedKinds` IS THIS PASS'S COVERAGE FLOOR and comes
    // from what the pass ACTUALLY opened — the same field it reports as
    // "opened here" above. A pass that opens no record (320 px, Library) owes
    // no record title and is not reddened for it.
    const judgedRecords = judgeRecordTitleBand({
      entries: recordTitles,
      rootFontSizePx,
      where: label,
      openedKinds: measured.recordKinds,
    });
    for (const failure of judgedRecords.failures)
      failures.push({ surface: "-", reason: failure });
    titleProblems.push(...judgedRecords.problems);
    console.log(
      `${label}\tscreen title\t${screenTitles.length} screen title(s), ` +
        `${judgedTitles.lines.length} distinct size/weight pair(s), on ` +
        `${new Set(screenTitles.map((entry) => entry.surface)).size} of ` +
        `${measured.titleCounts.length} screen state(s) measured\t` +
        `${recordTitles.length} record title(s) judged against the ` +
        `${judgedRecords.wantedPx.toFixed(1)}px --text-xl band, ` +
        `${parkedTitles.length} clipped to nothing\tband ` +
        `${judgedTitles.floorPx.toFixed(1)}–${judgedTitles.ceilingPx.toFixed(1)}px ` +
        `(${TITLE_MIN_REM}–${TITLE_MAX_REM}rem at a ${rootFontSizePx}px root), weight floor ` +
        `${TITLE_MIN_WEIGHT}`,
    );
    for (const line of judgedTitles.lines) console.log(`${label}\t${line}`);
    for (const line of judgedRecords.lines) console.log(`${label}\t${line}`);
    // THE MEASUREMENT OF AN UNDELIVERED POSITION PRINTS EVERY TIME. A silent
    // "pending" is worse than a throwing assertion: the throwing one at least
    // says where to look.
    for (const line of judgedRecords.pending)
      console.log(`${label}\trecord title band\tPENDING\t${line}`);
    // PRZELOT, KTÓRY NIE ZMIERZYŁ ANI JEDNEGO TYTUŁU EKRANU, nie jest przelotem
    // zielonym — jest przelotem niemym. Bez tego zdania wycięcie tytułu ze
    // wszystkich powierzchni naraz przechodziłoby tu w ciszy.
    if (screenTitles.length === 0)
      failures.push({
        surface: "-",
        reason: `no visible screen title was measured on any of the ${measured.titleCounts.length} screen state(s) this pass walked, so this pass says NOTHING about the size of the title at this geometry`,
      });
  }
  await page.close();
  return { failures, layoutProblems, matchedRegistryEntries, titleProblems };
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
  //     cienie motywu jasnego `oklch(40% 0.03 285 / …)` (:224-227)      0.03
  //     obramowania motywu jasnego `oklch(30% 0.02 285 / …)` (:200-202) 0.02
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
// Sufit tytułu ekranu w `rem`. Łapie regresję do nagłówka display. Gdy ta
// asercja powstawała, tytuł rysował `--text-display: clamp(1.9rem, 2.2vw,
// 2.6rem)`, czyli 30–42 px; Faza 2 ten stopień ZDJĘŁA i dziś zmierzone jest
// 13,0 px o wadze 600 na dwunastu z trzynastu celów, bo prototyp daje temu
// samemu tytułowi `--text-sm` o wadze 600 w pasku crumbbar. Trzynasty cel
// (Biblioteka) rysuje 28,0 px i jest werdyktem tej bramki, nie wyjątkiem.
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

// ── PODMIOT TYTUŁU: DEKLARACJA, NIE KLASA NAGŁÓWKA ───────────────────────────
// Do tej wersji podmiotem był `.surface-header h1, .surface-header h2`, czyli
// KLASA NAGŁÓWKA. Kosztowało to dwa niezauważone defekty i oba wyszły z jednej
// dziury: sonda mierzyła to, co NAZYWA SIĘ `.surface-header`, a nie to, co JEST
// tytułem ekranu.
//
//   * Spotkania rysują `.meeting-hero`, Biblioteka — nagłówek z modułu CSS.
//     Raport UCZCIWIE pisał „no title drawn on: meetings, library" (11 z 13
//     powierzchni, oba motywy), czyli przyrząd MÓWIŁ, że nie mierzy — i nikt
//     tego nie przekuł w asercję. Powiększenie tytułu Spotkań przeszło zielono.
//   * `h2` w tamtym selektorze nie dopasowało DZIŚ ani jednego elementu:
//     zmierzone 11 tytułów, JEDNA grupa rozmiar/waga, sygnatura `h1`, w obu
//     motywach. Wymiana selektora nie zabiera więc żadnego żywego pokrycia —
//     zabiera tylko martwe ramię, które przez trzy fale wyglądało na zakres.
//
// AFORDANCJA JEST ZADEKLAROWANA, A POWŁOKA JUŻ NA NIEJ STOI: tytuł każdego
// ekranu niesie `id="surface-title"`, a `RealApp` używa go dwa razy —
// `aria-labelledby="surface-title"` nazywa płaszczyznę pracy, a efekt po zmianie
// celu przenosi tam ognisko. Niesie go 16 plików renderera. Zmierzone na 105
// stanach ekranu, przez które przechodzi ten skrypt (13 celów plus soczewki
// i otwarte rekordy, pięć geometrii): DOKŁADNIE JEDEN element z tym
// identyfikatorem na każdym z nich.
//
// ZERO ALBO DWA TO GŁOŚNA AWARIA PRZYRZĄDU, nie werdykt: identyfikator jest
// jeden z definicji, a sonda mierząca „któryś z dwóch" nie wie, o czym mówi.
// Obie liczby padają nazwanym kodem (`VISUAL_PROBE_TITLE_NOT_UNIQUE`).
//
// CO SIĘ STANIE, GDY TO ZNIKNIE: `#surface-title` przestaje się dopasowywać,
// sonda nie znajduje ANI JEDNEGO tytułu i pada z `VISUAL_PROBE_NO_SCREEN_TITLE`
// — czyli głośno, z nazwą afordancji do poprawienia. Nigdy jako cicha zieleń.
const TITLE_SELECTOR = "#surface-title";

// TYTUŁ REKORDU TO NIE TYTUŁ EKRANU, a pasmo crumbbara nie jest jego pasmem.
// Rozdzielone STRUKTURALNIE, nie listą nazw ekranów: ekran rekordu deklaruje
// `data-record-kind` — ten sam rejestr, z którego ten plik bierze podmioty przez
// `derive()` — i tytuł rekordu siedzi w środku tej deklaracji. Zmierzone przy
// 1440 px: Zadanie i Projekt 28,0 px o wadze 580, Szansa 22,0 px o wadze 620.
// Trzech wartości, których pasmo 10–20 px nie opisuje, ta sonda nie ma prawa nim
// osądzać — v3 daje tytułowi REKORDU inne proporcje niż tytułowi EKRANU, a lot
// NAG pomylił jedno z drugim dokładnie dlatego, że nic ich nie rozdzielało.
// Są za to RAPORTOWANE z liczbami: nieosądzone i przemilczane to dwie różne
// rzeczy, a ten plik zbiera od fal wyłącznie tę drugą.
const RECORD_SCREEN_SELECTOR = "[data-record-kind]";

// ── JEDNA MIARA PASMA DLA OBU PRZELOTÓW ──────────────────────────────────────
// Sonda wierności pyta o tytuł przy 1440 px w obu motywach; przeloty geometrii
// pytają o ten sam tytuł przy 320 px, przy tekście przeskalowanym do 200% i przy
// dwóch szerokościach Biblioteki. To jest JEDNO pytanie i ma mieć JEDNO zdanie
// odpowiedzi, więc osąd stoi w jednym miejscu, a nie w dwóch kopiach, które
// rozjadą się po cichu przy pierwszej zmianie pasma.
//
// SUFIT LICZONY Z ŻYWEGO `rem`, nie z wpisanych 20 px, i to jest warunek, bez
// którego cały ten drugi zakres byłby kłamstwem: `1.25rem` znaczy „dwadzieścia
// pikseli przy domyślnym rem", a przy tekście przeskalowanym do 200% znaczy
// czterdzieści. Zmierzone: tytuł ekranu rysuje 13,0 px przy rem 16 px i 26,0 px
// przy rem 32 px, czyli SKALUJE SIĘ. Pod wpisaną liczbą pikseli przelot 200%
// meldowałby OVER nad tytułem, który urósł dokładnie tak, jak ma.
const judgeTitleBand = ({ entries, rootFontSizePx, where }) => {
  const ceilingPx = TITLE_MAX_REM * rootFontSizePx;
  const floorPx = TITLE_MIN_REM * rootFontSizePx;
  const lines = [];
  const problems = [];
  const failures = [];
  for (const group of groupMeasurements(entries)) {
    const [size, weight] = group.value.split(" ");
    const px = Number.parseFloat(size);
    const fontWeight = Number.parseFloat(weight);
    if (!Number.isFinite(px) || !Number.isFinite(fontWeight)) {
      failures.push(
        `VISUAL_PROBE_UNREADABLE_TITLE_TYPE (${where}): ${group.signature} on ` +
          `${group.surfaces.join(", ")} computed a font size/weight of „${group.value}", which ` +
          "this probe cannot read as a number of pixels and a numeric weight.",
      );
      continue;
    }
    lines.push(
      `screen title\t${group.signature}\ton ${group.surfaces.join(", ")}\t${px.toFixed(1)}px\t` +
        `weight ${fontWeight}\t` +
        `${px > ceilingPx ? "OVER" : px < floorPx ? "UNDER" : "WITHIN"} the ` +
        `${floorPx.toFixed(1)}–${ceilingPx.toFixed(1)}px band\t` +
        `${fontWeight >= TITLE_MIN_WEIGHT ? "weight ok" : "TOO LIGHT"}`,
    );
    if (px > ceilingPx)
      problems.push(
        `the screen title ${group.signature} on ${group.surfaces.join(", ")} draws at ` +
          `${px.toFixed(1)}px, over the ${ceilingPx.toFixed(1)}px ceiling ` +
          `(${TITLE_MAX_REM}rem at a ${rootFontSizePx}px root). That is a display heading, not a ` +
          "title bar — the v3 header is a crumbbar carrying the title at --text-sm with weight 600.",
      );
    else if (px < floorPx)
      problems.push(
        `the screen title ${group.signature} on ${group.surfaces.join(", ")} draws at ` +
          `${px.toFixed(1)}px, under the ${floorPx.toFixed(1)}px floor (${TITLE_MIN_REM}rem at a ` +
          `${rootFontSizePx}px root). Shrinking the display heading past the crumbbar is not the ` +
          "fix either — v3 draws this title at --text-sm, 0.8125rem.",
      );
    if (fontWeight < TITLE_MIN_WEIGHT)
      problems.push(
        `the screen title ${group.signature} on ${group.surfaces.join(", ")} draws at weight ` +
          `${fontWeight}, under the ${TITLE_MIN_WEIGHT} the v3 crumbbar gives it ` +
          "(v3/app.css:292). At --text-sm the weight is what separates a title from body text, " +
          "so a lighter title is not a smaller title — it is no title.",
      );
  }
  return { lines, problems, failures, ceilingPx, floorPx };
};

// ── PASMO TYTUŁU REKORDU — DRUGA POŁOWA P4 ───────────────────────────────────
// Do tej wersji tytuł rekordu był RAPORTOWANY i wprost NIE OSĄDZANY (zdanie
// „reported only — the crumbbar band does not describe a record title" stało
// w dwóch miejscach). Powód był dobry: pasmo crumbbara 0,625–1,25 rem opisuje
// tytuł EKRANU i osądzanie nim tytułu REKORDU mówiłoby o czymś innym niż
// mierzy. Powód nie był jednak argumentem za milczeniem, tylko za DRUGIM
// pasmem — i to jest ono. Brief Fazy 3, przyrząd P4: „plus pasmo tytułu
// REKORDU wyprowadzone z --text-xl i żywego rem, zadeklarowane per
// data-record-kind".
//
// WARTOŚĆ Z PROTOTYPU, NIE Z DZISIEJSZEJ APLIKACJI: `v3/app.css:651` —
// `.rec-title { font-size: var(--text-xl) }`, a `v3/tokens.css:29` daje
// `--text-xl: 1.375rem`. Aplikacja ma DOKŁADNIE TĘ SAMĄ wartość tokenu
// (`packages/desktop-ui/src/tokens.css:27`), więc pasmo nie zależy od tego,
// czy Faza 3 przesunie skalę — zależy od liczby, którą obie strony deklarują
// dziś tak samo. Zmierzone przy 1440 px: Projekt i Zadanie 28,0 px
// (`--text-2xl`, project-record.module.css:28, task-record.module.css:34),
// Szansa 22,0 px (`--text-xl`, opportunity-record.module.css:34). Dwa z trzech
// ekranów są OVER i to jest pozycja #1 lotu 4.
//
// SUFIT LICZONY Z ŻYWEGO `rem` — z tego samego powodu, co przy pasmie ekranu:
// `1.375rem` przy tekście przeskalowanym do 200% znaczy 44 px, a wpisana liczba
// pikseli meldowałaby OVER nad tytułem, który urósł dokładnie tak, jak ma.
//
// WAGA JEST RAPORTOWANA, NIE OSĄDZANA, i to NIE jest ostrożność — to zakaz
// zapisany w briefie. Lot 4: „Nie rusza wag pisma 580/590/620 (konwencja całej
// aplikacji, nie dryf tego ekranu)". Podłoga 600 wzięta z v3 (`.rec-title
// { font-weight: 600 }`) czerwieniłaby się WIECZNIE na 580, którego właściciel
// tej pozycji ma zakaz ruszać — czyli asercja nie do spłacenia przez nikogo.
// Liczba jest w wierszu raportu, żeby zmiana wagi nie przeszła w ciszy.
//
// ── WHAT CHANGED AFTER THE FIRST RUN OF THIS BAND, AND WHY ───────────────────
// EVERYTHING ABOVE DESCRIBES THE MEASUREMENT AND THE MEASUREMENT STAYS. The
// only thing that changed is whether an UNDELIVERED position turns the run
// red, and the reason is symmetry, not comfort: on this exact tree the band
// threw over lot 4 position #1 while 104 other measurements of positions lots
// 2-6 have not delivered only REPORTED. Two instruments, one map, opposite
// consequences for the same kind of fact — so lots 2, 3, 5 and 6 could not
// read this gate's exit code as a signal about their own work until lot 4
// landed. A gate whose red has to be interpreted gets switched off; that is a
// written lesson of this repo, not a prediction.
//
// THE RULE NOW IS ONE RULE FOR BOTH INSTRUMENTS: an undelivered position
// REPORTS, a delivered position that broke THROWS. The band asks the pairs map
// which of the two it is (`RECORD_TITLE_BAND_OWNER` → L4-01a/L4-01b), so lot 4
// arms it by flipping those entries to "enforced" — the same single switch
// that arms the routed pass. There is no second place to remember.
//
// THREE THINGS KEEP THIS FROM BEING A MUTE BUTTON, and each is asserted below,
// because "pending" written without them is exactly how a measurement is lost:
//   * the numbers are still PRINTED every pass, on every geometry, with the
//     owner's name on them (`lot 4 #1`) — see `lines` and the pending report;
//   * a record kind the pass OPENED and whose title this band then did not
//     measure is an instrument failure, per pass and by kind — the same
//     doctrine as NOT_MEASURED in the pairs map, and the pairs additionally
//     carry it per kind through ROUTED_NOT_MEASURED;
//   * a pending position that suddenly MATCHES is already loud through
//     ROUTED_PENDING_ALREADY_MATCHES on L4-01a/L4-01b, which read the same
//     property on the same subjects. That mechanism is not duplicated here on
//     purpose: two instruments shouting the same "flip the status" at a reader
//     who has one status to flip is how the second one gets ignored.
const RECORD_TITLE_REM = 1.375;
// Pół piksela: `getComputedStyle` oddaje wartość użytą, a 1,375 rem przy
// nieparzystym korzeniu nie musi wypaść na całkowitej liczbie pikseli.
const RECORD_TITLE_TOLERANCE_PX = 0.5;

// ── IS THE BAND ARMED? ASK THE MAP, AND CHECK WHAT IT ANSWERS ────────────────
// Resolved ONCE, at load, because a pointer into the pairs map that only
// resolves on the unhappy path is a pointer nobody notices has rotted. The
// three ways this can go wrong are all named failures, never silence:
// a missing id, an id that drifted to another lot/position, and an id that no
// longer reads the property this band judges.
const recordTitleBandDelivery = () => {
  const failures = [];
  const statuses = [];
  for (const id of RECORD_TITLE_BAND_OWNER.pairs) {
    const pair = VISUAL_LANGUAGE_ROUTED_PAIRS.find((entry) => entry.id === id);
    if (pair === undefined) {
      failures.push(
        `RECORD_TITLE_BAND_OWNER_MISSING: „${id}" is declared as an owner of the record-title ` +
          "band in visual-language-pairs.mjs (RECORD_TITLE_BAND_OWNER), and there is no pair " +
          "with that id in VISUAL_LANGUAGE_ROUTED_PAIRS. The band cannot tell whether the " +
          "position was delivered, so it judges nothing and says so.",
      );
      continue;
    }
    const mismatch = [
      pair.lot === RECORD_TITLE_BAND_OWNER.lot
        ? null
        : `lot ${pair.lot}, not ${RECORD_TITLE_BAND_OWNER.lot}`,
      pair.position === RECORD_TITLE_BAND_OWNER.position
        ? null
        : `position ${pair.position}, not ${RECORD_TITLE_BAND_OWNER.position}`,
      pair.read?.property === RECORD_TITLE_BAND_OWNER.read
        ? null
        : `reads ${pair.read?.property ?? "nothing"}, not ${RECORD_TITLE_BAND_OWNER.read}`,
      pair.expect?.token === RECORD_TITLE_BAND_OWNER.token
        ? null
        : `expects ${pair.expect?.token ?? pair.expect?.kind ?? "nothing"}, not ` +
          `${RECORD_TITLE_BAND_OWNER.token}`,
    ].filter((part) => part !== null);
    if (mismatch.length > 0) {
      failures.push(
        `RECORD_TITLE_BAND_OWNER_DRIFTED: „${id}" is named as an owner of the record-title band, ` +
          `but it ${mismatch.join("; ")}. A SIZE band armed by a pair that measures something ` +
          "else would fire for a reason no reader can trace back to what it judges.",
      );
      continue;
    }
    statuses.push({ id, status: pair.status });
  }
  return {
    failures,
    statuses,
    // Armed only when EVERY owner is enforced. Half a flip is half a delivery,
    // and it stays reported — visibly, with both statuses spelled out below,
    // so "one enforced, one pending" cannot read as "nothing happened".
    armed:
      failures.length === 0 &&
      statuses.length === RECORD_TITLE_BAND_OWNER.pairs.length &&
      statuses.every((entry) => entry.status === "enforced"),
  };
};
const RECORD_TITLE_BAND = recordTitleBandDelivery();
// The owners' statuses spelled out, or the reason there are none: "pending"
// without naming what has to flip is an instruction with no address.
const RECORD_TITLE_BAND_STATUS =
  RECORD_TITLE_BAND.statuses.length === 0
    ? "no owning pair resolved — see the instrument failure on this run"
    : RECORD_TITLE_BAND.statuses
        .map((entry) => `${entry.id}: ${entry.status}`)
        .join(", ");

// ── THE BAND'S CENSUS: WHAT THIS RUN ACTUALLY MEASURED ───────────────────────
// A pending measurement that measures nothing is indistinguishable from a
// pending measurement that holds, and it is the cheaper of the two to write by
// accident. This census exists so the run can assert, at the end, that the
// band was not simply absent — and so the numbers land in ONE summary line
// instead of only in the 480-line stream nobody greps when the run is green.
const RECORD_TITLE_BAND_CENSUS = {
  passes: 0,
  entries: 0,
  groups: 0,
  kinds: new Set(),
  pending: [],
};

const judgeRecordTitleBand = ({
  entries,
  rootFontSizePx,
  where,
  openedKinds = [],
}) => {
  const wantedPx = RECORD_TITLE_REM * rootFontSizePx;
  const lines = [];
  const problems = [];
  const pending = [];
  const failures = [];
  const measuredKinds = new Set(
    entries
      .map((entry) => entry.recordKind)
      .filter((kind) => typeof kind === "string" && kind.length > 0),
  );
  for (const group of groupMeasurements(entries)) {
    const [size, weight] = group.value.split(" ");
    const px = Number.parseFloat(size);
    const fontWeight = Number.parseFloat(weight);
    if (!Number.isFinite(px) || !Number.isFinite(fontWeight)) {
      failures.push(
        `VISUAL_PROBE_UNREADABLE_RECORD_TITLE_TYPE (${where}): ${group.signature} on ` +
          `${group.surfaces.join(", ")} computed a font size/weight of „${group.value}", which ` +
          "this probe cannot read as a number of pixels and a numeric weight.",
      );
      continue;
    }
    const off = px - wantedPx;
    lines.push(
      `record title\t${group.signature}\ton ${group.surfaces.join(", ")}\t${px.toFixed(1)}px\t` +
        `weight ${fontWeight} (reported, not judged — lot 4 may not touch 580/590/620)\t` +
        `${
          Math.abs(off) <= RECORD_TITLE_TOLERANCE_PX
            ? "AT"
            : off > 0
              ? "OVER"
              : "UNDER"
        } the ${wantedPx.toFixed(1)}px --text-xl band\t` +
        `[${RECORD_TITLE_BAND_OWNER.label}, ${
          RECORD_TITLE_BAND.armed ? "enforced" : "pending"
        }]`,
    );
    if (Math.abs(off) <= RECORD_TITLE_TOLERANCE_PX) continue;
    // ONE SENTENCE, TWO DESTINATIONS. The measurement — which title, on which
    // screens, how many pixels against how many — is identical either way; the
    // difference is who is being told and what it costs them. The verdict says
    // which of the two it is, so a reader never has to work it out from where
    // the line came out.
    const verdict =
      `the record title ${group.signature} on ${group.surfaces.join(", ")} draws at ` +
      `${px.toFixed(1)}px, ${off > 0 ? "over" : "under"} the ${wantedPx.toFixed(1)}px the ` +
      `prototype gives it (v3/app.css:651 — .rec-title is --text-xl, ${RECORD_TITLE_REM}rem ` +
      `at a ${rootFontSizePx}px root; the app declares the same token in tokens.css:27). ` +
      "Lot 4, position #1 — the three record screens carry three different title sizes.";
    if (RECORD_TITLE_BAND.armed) {
      problems.push(verdict);
      continue;
    }
    pending.push(
      `${verdict} REPORTED, NOT THROWN: ${RECORD_TITLE_BAND_OWNER.label} has not been delivered ` +
        `(${RECORD_TITLE_BAND_STATUS}), and this band throws the moment those entries flip ` +
        'to "enforced" — the same flip the routed pass demands when they start matching. ' +
        "Do not spend this by softening the band.",
    );
  }
  // ── A SUBJECT THAT DISAPPEARED IS AN INSTRUMENT FAILURE ───────────────────
  // The floor is not a written number, it is what THIS pass opened: a record
  // kind whose screen was walked and whose title this band then did not
  // measure means the title stopped being drawn, was clipped to nothing, or
  // the selector stopped reaching it. All three are silence dressed as a pass
  // — a pending band that measures nothing reads exactly like a pending band
  // that measures three record screens. Passes that open no records owe
  // nothing and stay quiet; the fidelity pass is one of them by design.
  for (const kind of new Set(openedKinds))
    if (!measuredKinds.has(kind))
      failures.push(
        `VISUAL_PROBE_RECORD_TITLE_NOT_MEASURED (${where}): this pass OPENED a „${kind}" record ` +
          `and the record-title band then measured no visible title inside ` +
          `[data-record-kind="${kind}"] — it measured ${
            measuredKinds.size === 0
              ? "none of the kinds it opened"
              : `only ${[...measuredKinds].join(", ")}`
          }. Instrument failure, not a verdict about the size: the band said NOTHING about that ` +
          `record screen, and ${RECORD_TITLE_BAND_OWNER.label} is measured by it.`,
      );
  if (entries.length > 0) {
    RECORD_TITLE_BAND_CENSUS.passes += 1;
    RECORD_TITLE_BAND_CENSUS.entries += entries.length;
    RECORD_TITLE_BAND_CENSUS.groups += lines.length;
    for (const kind of measuredKinds) RECORD_TITLE_BAND_CENSUS.kinds.add(kind);
  }
  for (const line of pending)
    RECORD_TITLE_BAND_CENSUS.pending.push(`${where} — ${line}`);
  return { lines, problems, pending, failures, wantedPx };
};

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
// Dzisiejsza aplikacja trafia w ten trzeci (`tokens.css:881` daje przy fokusie
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

// ── WIDOCZNOŚĆ OGNISKA: DRUGIE PYTANIE, DRUGI ZBIÓR PODMIOTÓW ────────────────
// DLACZEGO SĄ DWA ZBIORY, a nie jeden — bo to są dwa różne pytania i mają dwie
// różne odpowiedzi na tej samej kontrolce.
//
// PYTANIE PIERWSZE (sonda akcentu wyżej): „czy pierścień fokusa jest w kolorze
// v3". Podmiotem jest `painting`, czyli przystanki, na których fokus COKOLWIEK
// namalował. Kontrolka nadpisująca globalny pierścień własnym cieniem wypada
// z tamtego zbioru SŁUSZNIE: jej elewacja nie jest pierścieniem fokusa,
// a werdykt „ten pierścień nie niesie akcentu" wydany nad cudzym cieniem
// mówiłby o rzeczy, o którą nikt nie pytał.
//
// PYTANIE DRUGIE (tutaj): „czy człowiek idący Tabem widzi, gdzie stoi". Na to
// pytanie „nadpisała pierścień własnym cieniem" NIE JEST ulgą — jest
// odpowiedzią „NIE". Dlatego to wykluczenie NIE MA PRAWA tu przejść i podmiotem
// jest `armed` (przystanek w zakresie reguły pierścienia, z uzbrojonym
// `:focus-visible`), a nie `painting`.
//
// ZMIERZONE NA DZISIEJSZYM DRZEWIE, W OBU MOTYWACH: sonda akcentu osądza
// DZIEWIĘĆ przystanków z dziewięciu. Bramka wypisuje 18 wierszy „CARRIES THE
// RING" — po jednym na przystanek 0–8 w każdym z dwóch motywów — a raport
// „focus ring" wymienia wszystkie dziewięć numerów w obu przebiegach.
//
// TEN AKAPIT MÓWIŁ „SIEDEM" I WYMIENIAŁ DWA WYJĄTKI (`button.nav-item.active`,
// `button.capture-dock`), i tak BYŁO, zanim lot FOK przeniósł lekarstwo na ROLĘ
// CIENIA: `styles.css:608-633` zapamiętuje cień spoczynkowy pod drugą nazwą
// i przy `:focus-visible` remapuje SAM TOKEN na „pierścień, potem to, co było"
// (`--elevation-rest: var(--control-focus-ring), var(--elevation-rest-resting)`).
// Kontrolka z własnym cieniem rysuje go więc dalej, a pierścień stoi PRZED nim,
// czyli nie ma już czego nadpisywać. Zmierzone na przystanku 8
// (`button.capture-dock`, `styles.css:1867`): przy fokusie
// `oklch(0.55 0.21 295) 0px 0px 0px 1px` i trzy warstwy własnej elewacji za nim.
// Wykluczenie zostaje w kodzie, bo jest poprawne dla kontrolki, która ten remap
// ominie — ale DZIŚ nie odsiewa ani jednego przystanku.
//
// Aktywna pozycja nawigacji (`styles.css:1116`) jest trzecim przystankiem Tab na
// każdym ekranie (WCAG 2.4.7).
//
// PODŁOGA LICZBY PODMIOTÓW. Werdykt liczony na zbiorze, który fikstura albo
// powłoka mogą cicho opróżnić, jest nieodróżnialny od poprawnego — ta sama
// klasa kłamstwa, którą ten plik zbiera od fal. Dziewięć to POMIAR (przystanki
// 0–8, oba motywy, dzisiejszy harness), nie życzenie.
const FOCUS_VISIBILITY_MIN_STOPS = 9;

// Krawędź maluje coś tylko wtedy, gdy ma styl inny niż `none`, dodatnią grubość
// i niezerową alfę — te same trzy warunki co kontur w `outlineOf`, bo to ta sama
// pułapka: przemalowanie krawędzi o zerowej grubości nie jest wskaźnikiem
// ogniska, tylko zmianą napisu w wyliczonym stylu.
const borderSideVisible = (side) => {
  const width = Number.parseFloat(side.width);
  const literal = colorLiterals(side.color)[0];
  const alpha = literal === undefined ? undefined : paintAlpha(literal);
  return (
    side.style !== "none" &&
    Number.isFinite(width) &&
    width > 0 &&
    alpha !== undefined &&
    alpha > 0
  );
};

const describeBorder = (border) =>
  Array.isArray(border)
    ? border
        .map((side) => `${side.side} ${side.style} ${side.width} ${side.color}`)
        .join(" | ")
    : "NOT SNAPSHOTTED";

// CZTERY RAMIONA, BO NA CZTERY SPOSOBY KONTROLKA MOŻE POKAZAĆ OGNISKO: cieniem,
// konturem, krawędzią albo tłem. Pytanie „czy fokus wygląda inaczej" postawione
// na samym `box-shadow` odpowiadałoby „nie" nad kontrolką, która zaznacza
// ognisko konturem — i byłoby wtedy werdyktem o rzeczy, której sonda nie
// zmierzyła.
//
// KAŻDE RAMIĘ MA WŁASNY WARUNEK WIDOCZNOŚCI i to nie jest ozdoba. Ramię konturu
// porównujące SAM NAPIS byłoby zielone na wszystkich dziewięciu przystankach:
// `tokens.css:881` stawia przy fokusie `outline: 2px solid transparent` jako
// podkładkę pod tryb wymuszonych kolorów, więc napis konturu zmienia się ZAWSZE
// (zmierzone: `none 0px …` → `solid 2px rgba(0, 0, 0, 0)` na całej dziewiątce,
// w obu motywach). Ten werdykt mierzyłby wtedy podkładkę, a nie wskaźnik.
//
// Obie strony każdego porównania pochodzą z JEDNEJ funkcji
// (`__focusProbeRingPaint`), więc pole nie może istnieć po jednej stronie
// i zniknąć po drugiej — a przystanek bez zdjęcia spoczynkowego jest odsiewany
// wcześniej, jako awaria przyrządu.
const judgeFocusVisibility = ({ resting, paint, focusedOutline }) => {
  const restBorder = Array.isArray(resting.border) ? resting.border : [];
  const focusedBorder = Array.isArray(paint.border) ? paint.border : [];
  const arms = [
    {
      name: "box-shadow",
      rest: resting.boxShadow,
      focused: paint.boxShadow,
      changed: paint.boxShadow !== resting.boxShadow,
    },
    {
      name: "outline",
      rest: resting.outline,
      focused: focusedOutline,
      changed: focusedOutline !== resting.outline && outlineOf(paint).visible,
    },
    {
      name: "border",
      rest: describeBorder(resting.border),
      focused: describeBorder(paint.border),
      changed: focusedBorder.some((side, index) => {
        const was = restBorder[index];
        if (was === undefined) return false;
        return (
          (side.style !== was.style ||
            side.width !== was.width ||
            side.color !== was.color) &&
          borderSideVisible(side)
        );
      }),
    },
    {
      name: "background",
      rest: resting.background,
      focused: paint.background,
      changed: paint.background !== resting.background,
    },
  ];
  return { arms, visible: arms.some((arm) => arm.changed) };
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
    //
    // KRAWĘDŹ I TŁO DOKŁADANE SĄ POD DRUGIE PYTANIE — „czy fokus w ogóle coś
    // zmienia" — i NIE WCHODZĄ do osądu akcentu: `painting` (zbiór podmiotów
    // sondy akcentu) porównuje dalej wyłącznie cień i widoczny kontur. Gdyby
    // krawędź i tło wpadły tam, sonda akcentu zaczęłaby osądzać jako pierścień
    // kontrolkę, która przy fokusie zmienia samo tło.
    window.__focusProbeRingPaint = (element) => {
      const style = window.getComputedStyle(element);
      return {
        boxShadow: style.boxShadow,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        // Cztery boki osobno, bo `border-color` skraca się do jednego napisu
        // dopiero wtedy, gdy wszystkie cztery są równe — a wskaźnik ogniska
        // bywa krawędzią JEDNEGO boku.
        border: ["Top", "Right", "Bottom", "Left"].map((side) => ({
          side: side.toLowerCase(),
          style: style[`border${side}Style`],
          width: style[`border${side}Width`],
          color: style[`border${side}Color`],
        })),
        // Kolor I OBRAZ tła w jednym napisie, tak samo jak przy akcji głównej:
        // przy gradiencie cały wskaźnik siedziałby w `background-image`, a sam
        // `background-color` byłby przezroczysty.
        background: `${style.backgroundColor} ${style.backgroundImage}`,
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
        border: paint.border,
        background: paint.background,
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
  // ELEMENT, NA KTÓRYM FOKUS COKOLWIEK NAMALOWAŁ. Filtr powstał, bo reguła
  // pierścienia w `tokens.css` stoi na `:where(button, a, …):focus-visible`,
  // czyli ma specyficzność (0,1,0), a `styles.css` jest importowany PO
  // `tokens.css` — więc kontrolka z własnym `box-shadow` o specyficzności
  // ≥ (0,1,0) NADPISYWAŁA pierścień (`.nav-item.active` = (0,2,0),
  // `.secondary-button` = (0,1,0) później w kolejności). Mierzenie takiej
  // kontrolki dałoby czerwień, która nie mówi nic o `--focus-ring`.
  //
  // DZIŚ NIE ODSIEWA NIKOGO — zmierzone, nie założone: lot FOK remapuje przy
  // `:focus-visible` same tokeny cienia (`styles.css:608-633`), więc pierścień
  // stoi PRZED cieniem własnym kontrolki i nadpisywać nie ma czego. Wszystkie
  // dziewięć przystanków wpada do `painting` w obu motywach. Filtr zostaje jako
  // zabezpieczenie na kontrolkę, która ten remap ominie własną deklaracją
  // `box-shadow` przy fokusie.
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
  // ZMIANA, KTÓRĄ WIDAĆ — nie każda zmiana napisu. `tokens.css:881` ustawia przy
  // fokusie `outline: 2px solid transparent`, więc SAM NAPIS konturu zmienia się
  // na KAŻDEJ kontrolce, także na tej, która nadpisze pierścień własnym cieniem.
  // Wpuszczenie takiej kontrolki tutaj kazałoby sondzie osądzić CUDZY cień jako
  // pierścień fokusa — zmierzone przed lotem FOK: dwa przystanki
  // (`.nav-item.active`, `.capture-dock`) dostawały werdykt o „pierścieniu",
  // który był ich własną elewacją. Po remapie ról cienia
  // (`styles.css:608-633`) oba niosą pierścień naprawdę i ten warunek ich już
  // nie dotyczy.
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

  // ── WIDOCZNOŚĆ OGNISKA — OSOBNY WERDYKT, SZERSZY ZBIÓR PODMIOTÓW ──────────
  // Podmiotem jest `armed` ze zdjęciem spoczynkowym, NIE `painting`. Powód stoi
  // przy `judgeFocusVisibility`: przystanki, które nadpisują pierścień własnym
  // cieniem, mają tu ZOSTAĆ OSĄDZONE, bo to pytanie jest właśnie o nie.
  // Przystanek bez zdjęcia spoczynkowego jest już wyżej awarią przyrządu
  // (`VISUAL_PROBE_NO_RESTING_SHADOW`) i tutaj nie ma czego mierzyć.
  const focusSubjects = armed.filter((stop) => stop.resting !== null);
  if (focusSubjects.length < FOCUS_VISIBILITY_MIN_STOPS)
    failures.push(
      `VISUAL_PROBE_TOO_FEW_FOCUS_STOPS (${theme}): focus visibility was judged on only ` +
        `${focusSubjects.length} tab stop(s), under the floor of ${FOCUS_VISIBILITY_MIN_STOPS} ` +
        "measured on today's harness in both themes. The fixture, the shell or the Tab budget " +
        "shrank the walk, so silence below would be silence over a smaller product than the one " +
        "this floor describes — not evidence that focus is visible. Instrument failure.",
    );
  // NAZWANY BRAK POKRYCIA, WYPISANY Z DANYCH, nie z prozy. Pętla Tabów chodzi po
  // ŚWIEŻO WCZYTANEJ powłoce — kolejność wyżej jest asercją o przyrządzie, bo
  // chodzenie po celach KLIKA, a kliknięcie przestawia `activeElement` — więc
  // zbiór przystanków jest zbiorem afordancji LĄDOWANIA. Zmierzone: nie ma w nim
  // ani `.primary-button`, ani `.secondary-button`, a `.secondary-button` jedzie
  // `box-shadow: var(--elevation-rest)` (`styles.css:747`), czyli ma dokładnie
  // ten kształt, który przed lotem FOK dawał odpowiedź „NIE".
  //
  // NIE PODNOSZĘ BUDŻETU TABÓW, żeby po niego sięgnąć, i to jest decyzja
  // o zakresie: `stops` karmi też `painting`, więc głębszy spacer dokłada
  // podmioty SONDZIE AKCENTU i zamienia jej dzisiejszy wynik w inny — czerwień
  // o czymś, o co ten werdykt nie pyta. Brak jest więc NAZWANY, a przed cichym
  // zniknięciem chroni go podłoga liczby przystanków wyżej.
  const uncoveredSubjects = ["primary-button", "secondary-button"].filter(
    (name) => !focusSubjects.some((stop) => stop.signature.includes(name)),
  );
  report(
    `focus visibility\tcoverage\t${focusSubjects.length} tab stop(s) judged ` +
      `(floor ${FOCUS_VISIBILITY_MIN_STOPS})\tnot a tab stop on the landing shell, ` +
      `so NOT judged here: ${uncoveredSubjects.join(", ") || "none"}`,
  );
  for (const stop of focusSubjects) {
    const judged = judgeFocusVisibility(stop);
    // WSZYSTKIE CZTERY RAMIONA W RAPORCIE, nie tylko to, które rozstrzygnęło.
    // Werdykt „nic nie widać" bez wypisanego spoczynku i fokusu na każdej
    // własności jest twierdzeniem, a nie pomiarem — czytelnik ma móc go
    // sprawdzić bez odpalania sondy.
    for (const arm of judged.arms)
      report(
        `focus visibility\ttab stop ${stop.index}\t${stop.signature}\t${arm.name}\t` +
          `rest: ${arm.rest}\tfocused: ${arm.focused}\t` +
          `${arm.changed ? "CHANGES VISIBLY" : "no visible change"}`,
      );
    report(
      `focus visibility\ttab stop ${stop.index}\t${stop.signature}\tVERDICT\t` +
        `${judged.visible ? "focus is visible" : "FOCUS LOOKS IDENTICAL TO REST"}`,
    );
    if (!judged.visible)
      // KAŻDE ZDANIE TEGO WERDYKTU JEST WYPROWADZONE Z POMIARU. Ramiona
      // dostają trzy stany, nie dwa, bo „nie zmieniło się" i „zmieniło się na
      // coś, co nic nie rysuje" to dwie różne prawdy — a poprzedni zapis
      // twierdził jedno o wszystkich czterech. Zdanie o przyczynie jest
      // WARUNKOWE: mówi o cieniu własnym kontrolki tylko wtedy, gdy ta kontrolka
      // naprawdę go w spoczynku ma. Bez tego werdykt nad kontrolką bez cienia
      // podawałby przyczynę, której u niej nie ma.
      layoutProblems.push(
        `focus on ${stop.signature} (tab stop ${stop.index}) draws NOTHING a person can see: ` +
          `${judged.arms
            .map(
              (arm) =>
                `${arm.name} ${
                  arm.changed
                    ? "changes visibly"
                    : arm.rest === arm.focused
                      ? "is identical to rest"
                      : "changes to something that draws nothing"
                }`,
            )
            .join(", ")}. ` +
          (stop.resting.boxShadow === "none"
            ? ""
            : "This control carries its own box-shadow at rest and that shadow wins over the " +
              "global ring: the ring rule is written with " +
              "`:where(button, a, …):focus-visible`, so it has specificity (0,1,0), and " +
              "styles.css loads after tokens.css. ") +
          "This is not a verdict about the accent: if the accent probe skipped this stop, it did " +
          "so because the paint here is not the ring. It is a keyboard user unable to tell where " +
          "focus is. WCAG 2.4.7.",
      );
  }

  // ── AKCJA GŁÓWNA, AKTYWNA NAWIGACJA I TYTUŁ — NA KAŻDYM CELU ──────────────
  const collected = await page.evaluate(
    async ({
      actionSelectors,
      navActiveSelectors,
      titleSelector,
      recordScreenSelector,
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
      // `styles.css:4434-4444`) i zjeżdża w kadr dopiero z fokusem.
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
      const titleCounts = [];
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
        // LICZBA DOPASOWAŃ ZAPISANA OSOBNO OD POMIARU. Identyfikator ma być
        // jeden; zero i dwa to dwie różne awarie przyrządu, a filtr widoczności
        // niżej zamieniłby obie w ciszę.
        const found = [...document.querySelectorAll(titleSelector)];
        titleCounts.push({ surface, matched: found.length });
        for (const element of found) {
          if (!visible(element)) continue;
          const style = window.getComputedStyle(element);
          title.push({
            surface,
            selector: titleSelector,
            signature: signature(element),
            parked: parkedOutOfFrame(element),
            // TYTUŁ REKORDU ODDZIELONY PRZY POMIARZE, nie przy osądzie: to jest
            // fakt o elemencie (siedzi w deklaracji `data-record-kind`), a nie
            // ulga wybrana po zobaczeniu wyniku.
            record: element.closest(recordScreenSelector) !== null,
            // Same shape as the geometry pass reads (`recordKind` there too).
            // This pass opens no records, so it is null here — and the shape
            // is written anyway, because one measurement restated in two
            // places with two different sets of fields is how a consumer of
            // the second one silently reads `undefined`.
            recordKind:
              element
                .closest(recordScreenSelector)
                ?.getAttribute("data-record-kind") ?? null,
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
        titleCounts,
        rootFontSizePx: Number.parseFloat(
          window.getComputedStyle(document.documentElement).fontSize,
        ),
      };
    },
    {
      actionSelectors,
      navActiveSelectors,
      titleSelector: TITLE_SELECTOR,
      recordScreenSelector: RECORD_SCREEN_SELECTOR,
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
  // Osąd pasma stoi w `judgeTitleBand`, wspólnie z przelotami geometrii — tutaj
  // zostaje to, czego tamten przelot nie umie: nazwa motywu i pokrycie liczone
  // po celach powłoki.
  //
  // NIEJEDNOZNACZNY IDENTYFIKATOR IDZIE PIERWSZY. Zero dopasowań i dwa
  // dopasowania to dwie awarie przyrządu, nie werdykty o rozmiarze: przy dwóch
  // sonda mierzy „któryś z nich" i nie wie który, a przy zerze nie mierzy nic
  // i milczy tak samo jak nad zdrowym ekranem.
  for (const seen of collected.titleCounts.filter(
    (entry) => entry.matched !== 1,
  ))
    failures.push(
      `VISUAL_PROBE_TITLE_NOT_UNIQUE (${theme}): „${TITLE_SELECTOR}" matched ${seen.matched} ` +
        `element(s) on ${seen.surface}, not exactly one. An id is unique by definition — with two ` +
        "this probe judges whichever came first and cannot say which, with none it judges nothing. " +
        "Instrument failure, not a verdict about the title.",
    );
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
    // TRZY POPULACJE, NIE JEDNA. Tytuł ekranu jest osądzany pasmem crumbbara;
    // tytuł REKORDU jest raportowany z liczbami i nie jest nim osądzany (powód
    // przy `RECORD_SCREEN_SELECTOR`); tytuł zaparkowany poza kadrem albo
    // przycięty do niczego jest LICZONY, ale nie osądzany — sr-only `<h1>`
    // w stanie ładowania Spotkań ma tę postać, a osąd rozmiaru nad afordancją,
    // której nikt nie widzi, mówiłby o czymś, o co nikt nie pytał.
    const parked = collected.title.filter((entry) => entry.parked === true);
    const recordTitles = collected.title.filter(
      (entry) => entry.record === true && entry.parked !== true,
    );
    const screenTitles = collected.title.filter(
      (entry) => entry.record !== true && entry.parked !== true,
    );
    const judged = judgeTitleBand({
      entries: screenTitles,
      rootFontSizePx: collected.rootFontSizePx,
      where: theme,
    });
    const judgedRecords = judgeRecordTitleBand({
      entries: recordTitles,
      rootFontSizePx: collected.rootFontSizePx,
      where: theme,
    });
    const titled = new Set(screenTitles.map((entry) => entry.surface));
    const blind = scanned.filter((surface) => !titled.has(surface));
    report(
      `screen title\t${screenTitles.length} screen title(s), ${judged.lines.length} distinct ` +
        `size/weight pair(s), on ${titled.size} of ${scanned.length} surface(s) walked\t` +
        `${recordTitles.length} record title(s) judged against the ` +
        `${judgedRecords.wantedPx.toFixed(1)}px --text-xl band, ` +
        `${parked.length} parked out of frame\tno title drawn on: ${blind.join(", ") || "none"}\t` +
        `band ${judged.floorPx.toFixed(1)}–${judged.ceilingPx.toFixed(1)}px ` +
        `(${TITLE_MIN_REM}–${TITLE_MAX_REM}rem at a ${collected.rootFontSizePx}px root), ` +
        `weight floor ${TITLE_MIN_WEIGHT}`,
    );
    for (const line of judged.lines) report(line);
    failures.push(...judged.failures);
    layoutProblems.push(...judged.problems);
    // TYTUŁY REKORDÓW OSĄDZONE WŁASNYM PASMEM. Ta sonda rekordów NIE OTWIERA,
    // więc tutaj lista jest pusta i pusto ma się czytać jako pomiar — otwiera
    // je przelot geometrii i nowy przelot tras, i tam to pasmo coś mierzy.
    //
    // `openedKinds` STAYS EMPTY for the same reason: the coverage floor is a
    // debt of the pass that OPENED a record, not a sentence about records
    // spoken by a pass that never walks into one.
    for (const line of judgedRecords.lines) report(line);
    for (const line of judgedRecords.pending)
      report(`record title band\tPENDING\t${line}`);
    failures.push(...judgedRecords.failures);
    layoutProblems.push(...judgedRecords.problems);
    // POKRYCIE JEST TERAZ ASERCJĄ, NIE WIERSZEM RAPORTU, i to jest ta zmiana,
    // która złapałaby defekt Spotkań. Poprzednia wersja pisała „no title drawn
    // on: meetings, library" i szła dalej — przyrząd sam meldował, że dwóch
    // ekranów nie widzi, a zieleń czytała się jak zdanie o wszystkich
    // trzynastu. Podmiot wyprowadzony z `id="surface-title"` daje dziś
    // 13 z 13, więc podłoga „każdy obejrzany cel" jest POMIAREM, nie życzeniem.
    if (blind.length > 0)
      failures.push(
        `VISUAL_PROBE_SCREEN_TITLE_COVERAGE (${theme}): no visible screen title was measured on ` +
          `${blind.join(", ")} (${blind.length} of ${scanned.length} surface(s) walked). Every ` +
          'destination names itself with id="surface-title" — so either a screen stopped drawing ' +
          "its title, or it drew one this probe could not see. Either way the size of the title " +
          "on those screens was NOT measured, and silence about them is not a pass.",
      );
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

// ── P1: PARY „SELEKTOR PROTOTYPU → SELEKTOR APLIKACJI → WŁAŚCIWOŚĆ" ──────────
//
// MAPA JEST W `scripts/visual-language-pairs.mjs` I JEST DANYMI. Tutaj stoi
// wyłącznie mechanika: rozwiązanie tokenów w tej samej stronie, odczyt
// właściwości, osąd i trzy komunikaty. Rozdział jest po to, żeby dopisanie pary
// przez lot 2-6 nie wymagało dotknięcia ani jednej linii kodu.
//
// DLACZEGO OSOBNY PRZELOT, A NIE KOLEJNA SEKCJA W `measureTheme`. Trzy powody,
// wszystkie o przyrządzie:
//   1. `measureTheme` kończy chodzenie po celach KLIKNIĘCIEM W USTAWIENIA,
//      a wejście w ten tryb PODMIENIA LEWĄ KOLUMNĘ. Pary powłoki zmierzone po
//      tamtej pętli mierzyłyby kolumnę trybu Ustawień, nie boczny pasek.
//   2. Sekwencja czternastu Tabów zostawia `:focus-visible` na kontrolce
//      i zmienia `opacity` oraz `box-shadow` — czyli dokładnie te właściwości,
//      które czytają pary pozycji 3 i 6.
//   3. Kolejność asercji w `measureTheme` jest sama w sobie asercją (komentarz
//      przy pierścieniu ogniska). Czwarta troska przewleczona przez tamtą
//      funkcję kosztowałaby tamtą własność.
// Cena: jedno dodatkowe wczytanie strony na motyw.
//
// STEMPEL MOTYWU JEST POWTÓRZONY, NIE POŻYCZONY, i to nie jest kopia przez
// niedopatrzenie: przelot, który nie dowodzi, że przełączenie zaszło, mierzy
// jeden motyw dwa razy i wraca z podwojoną, zgodną odpowiedzią. Ten plik ma już
// jeden opisany przypadek tego kłamstwa.
const REM_TOLERANCE_PX = 0.5;
const PSEUDO_ABSENT = "PSEUDO_ABSENT";

const remOf = (observed, rootFontSizePx) => {
  const px = Number.parseFloat(observed);
  return Number.isFinite(px) ? px / rootFontSizePx : Number.NaN;
};

// Jedna zmierzona para → jeden z TRZECH stanów. `NOT_MEASURED` istnieje, bo
// „selektor nie trafił w nic" i „trafił, wartość jest inna" są w świecie
// dwustanowym nieodróżnialne — a pod statusem „pending" ten pierwszy byłby
// wieczną, cichą zielenią.
const judgeVisualPair = (pair, measured, rootFontSizePx, theme) => {
  if (measured.state === "not-measured")
    return { state: "NOT_MEASURED", reason: measured.reason };

  const expect = pair.expect;
  const observed = measured.observed;

  // PSEUDOELEMENT, KTÓREGO NIE MA, JEST POMIAREM, NIE AWARIĄ. `content: none`
  // znaczy, że warstwa nie została wygenerowana — a to jest dokładnie stan,
  // który pozycje 3 i 8 opisują jako brakujący. Gdyby to szło do
  // `NOT_MEASURED`, obie byłyby czerwone jako zepsuty przyrząd do chwili, w
  // której lot je odda.
  if (observed === PSEUDO_ABSENT)
    return {
      state: "DIFFERS",
      observed: `the ${pair.read.pseudo} pseudo-element is not generated (content: none)`,
      expected: `${pair.read.pseudo} generated and ${expect.kind === "accent" ? "painted with the accent" : `${pair.read.property} ${expect.kind} ${expect.value ?? ""}`}`,
    };

  if (expect.kind === "count") {
    const wanted =
      expect.equals === undefined
        ? `at least ${expect.atLeast}`
        : `exactly ${expect.equals}`;
    const met =
      expect.equals === undefined
        ? measured.matches >= expect.atLeast
        : measured.matches === expect.equals;
    return {
      state: met ? "MATCH" : "DIFFERS",
      observed: `${measured.matches} element(s) match „${pair.subject.selector}"`,
      expected: `${wanted} element(s)`,
    };
  }

  if (expect.kind === "accentCount") {
    // ZERO PODMIOTÓW TO NIE JEST „ZERO AKCENTÓW". Ta gałąź jest jedyną, która
    // omija strażniki „selektor nie trafił w nic" i „nic nie jest narysowane"
    // — bo liczy, a licznik jest dobrze określony na zerze. Bez tej linii
    // literówka w selektorze dawała `0 of 0` czyli DIFFERS, czyli WIECZNE,
    // CICHE zaliczenie pod statusem „pending": dokładnie ta awaria, dla której
    // istnieją trzy stany zamiast dwóch.
    if (measured.paints.length === 0)
      return {
        state: "NOT_MEASURED",
        reason:
          `„${pair.subject.selector}" produced NO rendered element to read paint from ` +
          `(${measured.matches} element(s) matched the selector at all), so „0 accents" is ` +
          "a fact about this probe, not about the paint.",
      };
    const verdicts = measured.paints.map((paint) =>
      judgeAccent({
        subject: pair.title,
        where: theme,
        signature: paint.signature,
        paint: paint.value,
      }),
    );
    const unreadable = verdicts.filter(
      (verdict) => verdict.failure !== undefined,
    );
    const carrying = verdicts.filter((verdict) => verdict.accent === true);
    // Nieczytelne malowanie podnosi awarię TYLKO wtedy, gdy bez niego liczba
    // wychodzi zero — bo wtedy „zero akcentów" mogłoby być kłamstwem przyrządu,
    // a nie faktem o farbie.
    if (carrying.length === 0 && unreadable.length > 0)
      return { state: "NOT_MEASURED", reason: unreadable[0].failure };
    return {
      state: carrying.length >= expect.atLeast ? "MATCH" : "DIFFERS",
      observed:
        `${carrying.length} of ${measured.paints.length} rendered element(s) under ` +
        `„${pair.subject.selector}" resolve to the accent` +
        (unreadable.length > 0
          ? ` (${unreadable.length} unreadable paint(s))`
          : ""),
      expected: `at least ${expect.atLeast}`,
    };
  }

  if (expect.kind === "accent") {
    const judged = judgeAccent({
      subject: pair.title,
      where: theme,
      signature: measured.signature,
      paint: observed,
    });
    if (judged.failure !== undefined)
      return { state: "NOT_MEASURED", reason: judged.failure };
    const best = judged.carrying ?? judged.verdicts[0];
    return {
      state: judged.accent ? "MATCH" : "DIFFERS",
      observed: `${observed} → ${describeOklch(best)}${judged.accent ? "" : ` — ${explainVerdicts(judged.verdicts)}`}`,
      expected: `a colour within ${ACCENT.hueTolerance}° of hue ${ACCENT.hue} at chroma ≥ ${ACCENT.chromaFloor}`,
    };
  }

  if (expect.kind === "rem") {
    const wantedPx = expect.value * rootFontSizePx;
    const seenPx = Number.parseFloat(observed);
    if (!Number.isFinite(seenPx))
      return {
        state: "NOT_MEASURED",
        reason:
          `„${pair.read.property}" computed to „${observed}", which is not a length. A rem pair ` +
          "cannot compare it against anything — this probe measured nothing.",
      };
    return {
      state:
        Math.abs(seenPx - wantedPx) <= REM_TOLERANCE_PX ? "MATCH" : "DIFFERS",
      observed: `${observed} (${remOf(observed, rootFontSizePx).toFixed(4)}rem at a ${rootFontSizePx}px root)`,
      expected: `${expect.value}rem = ${wantedPx.toFixed(1)}px (±${REM_TOLERANCE_PX}px)`,
    };
  }

  if (expect.kind === "token") {
    if (measured.expectedResolved === "" || measured.expectedResolved == null)
      return {
        state: "NOT_MEASURED",
        reason:
          `the expectation names var(${expect.token}), which resolved to nothing on this page. ` +
          "A pair whose expected side is empty can never match and never says why — instrument " +
          "failure, not a verdict.",
      };
    return {
      state: observed === measured.expectedResolved ? "MATCH" : "DIFFERS",
      observed,
      expected: `var(${expect.token}) → ${measured.expectedResolved}`,
    };
  }

  if (expect.kind === "text")
    return {
      state: observed === expect.notValue ? "DIFFERS" : "MATCH",
      observed: `„${observed}"`,
      expected: `any visible text other than „${expect.notValue}"`,
    };

  if (expect.kind === "contains")
    return {
      state: observed.includes(expect.value) ? "MATCH" : "DIFFERS",
      observed,
      expected: `a value containing „${expect.value}"`,
    };

  if (expect.kind === "not")
    return {
      state: observed === expect.value ? "DIFFERS" : "MATCH",
      observed,
      expected: `anything other than „${expect.value}"`,
    };

  if (expect.kind === "literal")
    return {
      state: observed === expect.value ? "MATCH" : "DIFFERS",
      observed,
      expected: `„${expect.value}"`,
    };

  return {
    state: "NOT_MEASURED",
    reason:
      `the map declares expect.kind „${expect.kind}", which this runner does not implement. ` +
      "A pair nobody can evaluate is not a pending pair — it is a hole in the instrument.",
  };
};

// Księgowość mapy, sprawdzana BEZ przeglądarki: wpis nie może zniknąć po cichu,
// a pozycja briefu nie może wypaść z OBU list naraz.
const auditVisualLanguageMap = () => {
  const failures = [];
  const seen = new Set();
  for (const pair of VISUAL_LANGUAGE_PAIRS) {
    if (seen.has(pair.id))
      failures.push(
        `VISUAL_LANGUAGE_DUPLICATE_ID: two entries in the map carry id „${pair.id}". The report ` +
          "would then name two different pairs identically and a reader could not tell which failed.",
      );
    seen.add(pair.id);
  }
  const enforced = VISUAL_LANGUAGE_PAIRS.filter(
    (pair) => pair.status === "enforced",
  );
  const pending = VISUAL_LANGUAGE_PAIRS.filter((pair) =>
    pair.status.startsWith("pending"),
  );
  if (enforced.length + pending.length !== VISUAL_LANGUAGE_PAIRS.length)
    failures.push(
      `VISUAL_LANGUAGE_UNKNOWN_STATUS: ${VISUAL_LANGUAGE_PAIRS.length - enforced.length - pending.length} ` +
        'pair(s) carry a status that is neither „enforced" nor „pending: LOT N". Such a pair is ' +
        "asserted in neither direction and is indistinguishable from an entry nobody measures.",
    );
  for (const [label, seenCount, wanted] of [
    ["pairs", VISUAL_LANGUAGE_PAIRS.length, VISUAL_LANGUAGE_EXPECTED.pairs],
    ["enforced pairs", enforced.length, VISUAL_LANGUAGE_EXPECTED.enforced],
    ["pending pairs", pending.length, VISUAL_LANGUAGE_EXPECTED.pending],
    [
      "not-covered entries",
      VISUAL_LANGUAGE_NOT_COVERED.length,
      VISUAL_LANGUAGE_EXPECTED.notCovered,
    ],
  ])
    if (seenCount !== wanted)
      failures.push(
        `VISUAL_LANGUAGE_COUNT_DRIFT: the map holds ${seenCount} ${label}, and ` +
          `scripts/visual-language-pairs.mjs declares ${wanted}. Either an entry was added or ` +
          "removed without saying so, or the declared number is stale. The count is written down " +
          "precisely so an entry cannot disappear quietly.",
      );
  for (const [lot, expectation] of Object.entries(
    VISUAL_LANGUAGE_EXPECTED.lots,
  )) {
    const positions = new Set(
      VISUAL_LANGUAGE_PAIRS.filter((pair) => String(pair.lot) === lot).map(
        (pair) => pair.position,
      ),
    );
    if (positions.size !== expectation.positionsWithPairs)
      failures.push(
        `VISUAL_LANGUAGE_POSITION_DRIFT (lot ${lot}): the map covers ${positions.size} brief ` +
          `position(s) with at least one pair, and declares ${expectation.positionsWithPairs}.`,
      );
    for (const position of expectation.positionsWithoutPairs)
      if (positions.has(position))
        failures.push(
          `VISUAL_LANGUAGE_POSITION_CONTRADICTION (lot ${lot}): position ${position} is declared ` +
            "as having no pair, and the map holds one for it. The not-covered list is a " +
            "deliverable — it may not go stale while the map grows.",
        );
    if (
      positions.size + expectation.positionsWithoutPairs.length !==
      expectation.positionsInBrief
    )
      failures.push(
        `VISUAL_LANGUAGE_POSITION_GAP (lot ${lot}): ${positions.size} position(s) carry pairs and ` +
          `${expectation.positionsWithoutPairs.length} are declared uncovered, which does not add ` +
          `up to the ${expectation.positionsInBrief} position(s) the brief lists. A position that ` +
          "falls off BOTH lists is work nobody measures and nobody admits to skipping.",
      );
  }
  return failures;
};

// ── JEDNA DEFINICJA POMIARU PARY, DWA PRZELOTY ───────────────────────────────
// Ten blok stał do tej wersji WEWNĄTRZ `visualLanguagePairs`, jako domknięcie
// przekazywane do `page.evaluate`. Wyszedł na poziom modułu, bo przelot tras
// (`routedVisualLanguage` niżej) mierzy DOKŁADNIE TE SAME pary tą samą
// arytmetyką, tylko po dojściu na miejsce — a dwie kopie tej arytmetyki
// rozjechałyby się przy pierwszej poprawce i dwa przeloty mówiłyby o tej samej
// wartości dwie różne rzeczy. Funkcja jest bezkontekstowa (Playwright
// serializuje jej ŹRÓDŁO, nie domknięcie), więc wszystko, czego potrzebuje,
// przychodzi argumentem.
const measureVisualLanguageInPage = async ({
  pairs,
  notCovered,
  wantedTheme,
  pseudoAbsent,
  // GDZIE TO ZMIERZONO, PODANE Z ZEWNĄTRZ. Do rozdzielenia przelotów ta funkcja
  // pisała w każdej diagnozie „on the landing shell", bo mierzył ją wyłącznie
  // przelot powłoki. Przelot tras stoi na Bibliotece albo na otwartym rekordzie
  // i to samo zdanie wysyłałoby czytającego szukać afordancji na ekranie, na
  // którym jej z definicji nie ma.
  where,
}) => {
  const frame = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  document.documentElement.dataset.theme = wantedTheme;
  await frame();
  const shell = window.getComputedStyle(document.body);
  const fingerprint = `${shell.backgroundColor} on ${shell.color}`;

  // Token rozwiązywany PRZEZ TĘ SAMĄ WŁAŚCIWOŚĆ, którą para czyta —
  // inaczej obie strony porównania przechodziłyby przez inną
  // normalizację przeglądarki i „oklch(…)" nigdy nie zrównałoby się
  // z „rgb(…)". Sonda jest ukryta, ale NIE `display: none`: wartość
  // użyta długości bierze się z układu.
  const resolveAs = (property, value) => {
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.left = "-9999px";
    probe.style.top = "0";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style[property] = value;
    document.body.append(probe);
    const resolved = window.getComputedStyle(probe)[property];
    probe.remove();
    return resolved ?? "";
  };
  const rendered = (element) => {
    const style = window.getComputedStyle(element);
    if (style.display === "none") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const signature = (element) => {
    const classes = [...element.classList]
      .map((token) => {
        const match = /^_(.+)_[a-z0-9]{5,7}_\d+$/u.exec(token);
        return match === null ? token : `_${match[1]}`;
      })
      .join(".");
    return classes === ""
      ? element.tagName.toLowerCase()
      : `${element.tagName.toLowerCase()}.${classes}`;
  };
  const paintOf = (element) => {
    const style = window.getComputedStyle(element);
    return `${style.backgroundColor} ${style.backgroundImage}`;
  };
  const readValue = (element, read) => {
    if (read.pseudo !== undefined && read.pseudo !== null) {
      const style = window.getComputedStyle(element, read.pseudo);
      const content = style.content;
      if (content === "none" || content === "normal" || content === "")
        return pseudoAbsent;
      return style[read.property] ?? "";
    }
    if (read.property === "paint") return paintOf(element);
    if (read.property === "text") return (element.textContent ?? "").trim();
    if (read.property === "rect.left") {
      const rect = element.getBoundingClientRect();
      return `${Math.round(rect.left * 100) / 100}px`;
    }
    return window.getComputedStyle(element)[read.property] ?? "";
  };

  const measurements = [];
  for (const pair of pairs) {
    // PODMIOT TOKENOWY: para mierzy wartość tokenu, bo element, który go
    // niesie, składa dziś DWA tokeny w jedną wysokość.
    if (pair.subject.token !== undefined) {
      const observed = resolveAs(
        pair.read.property,
        `var(${pair.subject.token})`,
      );
      measurements.push({
        id: pair.id,
        state: observed === "" ? "not-measured" : "measured",
        reason:
          observed === ""
            ? `var(${pair.subject.token}) resolved to nothing on this page — the token was ` +
              "renamed or never defined, so this pair measured NOTHING."
            : undefined,
        matches: 1,
        observed,
        signature: `var(${pair.subject.token})`,
      });
      continue;
    }
    let found;
    try {
      found = [...document.querySelectorAll(pair.subject.selector)];
    } catch (error) {
      measurements.push({
        id: pair.id,
        state: "not-measured",
        reason:
          `the selector „${pair.subject.selector}" is not valid in this engine ` +
          `(${String(error)}).`,
      });
      continue;
    }
    if (pair.expect.kind === "count") {
      measurements.push({
        id: pair.id,
        state: "measured",
        matches: found.length,
      });
      continue;
    }
    if (pair.expect.kind === "accentCount") {
      measurements.push({
        id: pair.id,
        state: "measured",
        matches: found.length,
        paints: found.filter(rendered).map((element) => ({
          signature: signature(element),
          value: paintOf(element),
        })),
      });
      continue;
    }
    if (found.length === 0) {
      // ── DIAGNOZA, KTÓRA ROZDZIELA DWIE AWARIE O JEDNYM OBJAWIE ────────────
      // „Selektor nie trafił w nic" ma dwie zupełnie różne przyczyny i
      // WYMAGAJĄ ONE RÓŻNEJ ROBOTY: (a) nazwa klasy się zmieniła albo
      // przedrostek jest zły — wtedy poprawia się MAPĘ; (b) nazwa żyje, tylko
      // ten stan fikstury jej nie rysuje (rekord bez wyjść, komentarz bez
      // agenta, ekran powitalny przy wybranej notatce) — wtedy poprawia się
      // FIKSTURĘ albo dopisuje `blind`. Bez tej liczby oba czyta się jako
      // literówkę w selektorze, a to jest ta sama pomyłka, którą ten plik
      // zbiera od fal: „nigdzie nie ma X" było prawdą o pasie, który się nie
      // narysował. Każda część selektora rozdzielona spacją liczona OSOBNO
      // w całym dokumencie.
      const parts = pair.subject.selector
        .split(/\s+/u)
        .filter((part) => part !== "" && part !== ">");
      const census = parts
        .map((part) => {
          try {
            return `${part} → ${document.querySelectorAll(part).length}`;
          } catch {
            return `${part} → not a valid selector on its own`;
          }
        })
        .join(", ");
      measurements.push({
        id: pair.id,
        state: "not-measured",
        reason:
          `„${pair.subject.selector}" matched NO element on ${where}. This pair measured ` +
          "nothing. Each part of the selector counted separately across the whole document: " +
          `${census}. A part at ZERO is a name that is not on this page at all — renamed, or ` +
          "this fixture state does not draw it. Every part above zero while the whole is zero " +
          "means the parts ARE on the page and are not nested the way the map says.",
      });
      continue;
    }
    const live = found.filter(rendered);
    if (live.length === 0) {
      measurements.push({
        id: pair.id,
        state: "not-measured",
        reason:
          `„${pair.subject.selector}" matched ${found.length} element(s) on ${where}, and NONE ` +
          "of them is rendered (display: none or a zero-area box). A computed style read off " +
          "an unrendered box describes nothing a person can see.",
      });
      continue;
    }
    const values = live.map((element) => readValue(element, pair.read));
    const distinct = [...new Set(values)];
    if (distinct.length > 1) {
      measurements.push({
        id: pair.id,
        state: "not-measured",
        reason:
          `„${pair.subject.selector}" matched ${live.length} rendered element(s) on ${where} ` +
          `computing ` +
          `${distinct.length} DIFFERENT values for ${pair.read.property} ` +
          `(${distinct.join(" | ")}). This pair cannot say which one it judged.`,
      });
      continue;
    }
    measurements.push({
      id: pair.id,
      state: "measured",
      matches: live.length,
      observed: distinct[0],
      signature: signature(live[0]),
      expectedResolved:
        pair.expect.kind === "token"
          ? resolveAs(pair.read.property, `var(${pair.expect.token})`)
          : undefined,
    });
  }

  // Selektory pozycji NIEOBJĘTYCH: nie asercja, tylko liczba w raporcie.
  const probes = notCovered.map((entry) => ({
    lot: entry.lot,
    position: entry.position,
    selector: entry.probe ?? null,
    matched:
      entry.probe === undefined || entry.probe === null
        ? null
        : document.querySelectorAll(entry.probe).length,
  }));

  return {
    applied: document.documentElement.dataset.theme ?? "",
    fingerprint,
    measurements,
    probes,
    rootFontSizePx: Number.parseFloat(
      window.getComputedStyle(document.documentElement).fontSize,
    ),
  };
};

const visualLanguagePairs = async (browser) => {
  const failures = auditVisualLanguageMap();
  const verdicts = [];
  const fingerprints = new Map();

  for (const theme of THEME_ORDER) {
    const report = (line) => console.log(`visual language\t${theme}\t${line}`);
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      colorScheme: theme,
    });
    page.on("pageerror", (error) =>
      failures.push(`VISUAL_LANGUAGE_PAGE_ERROR (${theme}): ${String(error)}`),
    );
    await page.goto(HARNESS, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const collected = await page.evaluate(measureVisualLanguageInPage, {
      pairs: VISUAL_LANGUAGE_PAIRS,
      notCovered: VISUAL_LANGUAGE_NOT_COVERED,
      wantedTheme: theme,
      pseudoAbsent: PSEUDO_ABSENT,
      where: "the landing shell",
    });

    if (collected.applied !== theme)
      failures.push(
        `VISUAL_LANGUAGE_THEME_NOT_STAMPED: this pass set data-theme="${theme}" and read back ` +
          `„${collected.applied}". Every pair below would describe a theme this pass did not ` +
          "choose. Instrument failure — nothing was measured.",
      );
    fingerprints.set(theme, collected.fingerprint);
    report(
      `theme stamped\tdata-theme=${collected.applied}\tbody paint ${collected.fingerprint}\t` +
        `root font size ${collected.rootFontSizePx}px`,
    );

    const byId = new Map(
      collected.measurements.map((entry) => [entry.id, entry]),
    );
    let matched = 0;
    let differed = 0;
    for (const pair of VISUAL_LANGUAGE_PAIRS) {
      const measured = byId.get(pair.id);
      if (measured === undefined) {
        failures.push(
          `VISUAL_LANGUAGE_NOT_MEASURED (${theme}) — ${pair.id} „${pair.title}": the in-page pass ` +
            "returned no measurement for this pair at all. Instrument failure.",
        );
        continue;
      }
      const judged = judgeVisualPair(
        pair,
        measured,
        collected.rootFontSizePx,
        theme,
      );
      // PODMIOT WYPISANY TAK, JAK GO ZMIERZONO. Para o podmiocie tokenowym nie
      // ma selektora, a wypisanie „undefined" w miejscu podmiotu robi z wiersza
      // raportu zdanie o niczym — zmierzone na pierwszym przebiegu.
      const subject = pair.subject.selector ?? `var(${pair.subject.token})`;
      const cite =
        `${pair.prototype.file}:${pair.prototype.lines} („${pair.prototype.value}") ` +
        `↔ ${subject} [${pair.read.property ?? "count"}]`;
      if (judged.state === "NOT_MEASURED") {
        failures.push(
          `VISUAL_LANGUAGE_NOT_MEASURED (${theme}) — ${pair.id} „${pair.title}" ` +
            `[${pair.status}]: ${judged.reason} Pair: ${cite}. A pair that measures nothing is ` +
            'indistinguishable from a pair that passes, which is exactly why "pending must not ' +
            'match" is not enough on its own.',
        );
        report(`${pair.id}\tNOT_MEASURED\t${judged.reason}`);
        continue;
      }
      report(
        `${pair.id}\t${judged.state}\t${pair.status}\t${pair.title}\t` +
          `observed: ${judged.observed}\texpected: ${judged.expected}\t${cite}`,
      );
      if (judged.state === "MATCH") matched += 1;
      else differed += 1;
      if (pair.status === "enforced" && judged.state !== "MATCH")
        verdicts.push(
          `${theme} theme — ${pair.id} „${pair.title}": ${subject} computes ` +
            `${pair.read.property} = ${judged.observed}, and ${pair.prototype.file}:` +
            `${pair.prototype.lines} says ${judged.expected}. Contract: ${pair.contract}.`,
        );
      if (pair.status.startsWith("pending") && judged.state === "MATCH")
        failures.push(
          `VISUAL_LANGUAGE_PENDING_ALREADY_MATCHES (${theme}) — ${pair.id} „${pair.title}" is ` +
            `filed as „${pair.status}", and it MATCHES today: ${subject} computes ` +
            `${pair.read.property} = ${judged.observed}, which is what ${pair.prototype.file}:` +
            `${pair.prototype.lines} asks for. Exactly one of two things is true and both are ` +
            `loud: the lot delivered this and the entry must flip to „enforced", or the ` +
            "expectation is written so that it can never fail and the pair has been measuring " +
            "nothing. Do not soften the expectation to keep it pending.",
        );
    }
    for (const probe of collected.probes)
      report(
        `not covered\tL${probe.lot}-${String(probe.position).padStart(2, "0")}\t` +
          `${probe.selector ?? "no probe selector"}\t` +
          `${probe.matched === null ? "not counted" : `${probe.matched} element(s) on the landing shell`}`,
      );
    report(
      `summary\t${VISUAL_LANGUAGE_PAIRS.length} pair(s)\t${matched} MATCH\t${differed} DIFFERS\t` +
        `${VISUAL_LANGUAGE_PAIRS.length - matched - differed} NOT_MEASURED\t` +
        `${VISUAL_LANGUAGE_NOT_COVERED.length} position(s)/aspect(s) declared NOT COVERED`,
    );
    await page.close();
  }

  if (new Set(fingerprints.values()).size < fingerprints.size)
    failures.push(
      "VISUAL_LANGUAGE_THEME_DID_NOT_SWITCH: the shell painted IDENTICALLY in every theme this " +
        `pass walked (${[...fingerprints]
          .map(([theme, print]) => `${theme}: ${print}`)
          .join(
            " | ",
          )}). Both passes measured the same paint twice, so no pair below is a ` +
        "statement about two themes. Instrument failure.",
    );
  return { failures, verdicts };
};

// ════════════════════════════════════════════════════════════════════════════
// PRZELOT TRAS — PARY LOTÓW 2-6 I PRZYRZĄD P7 (POZYCJA PO PRZEWINIĘCIU)
// ════════════════════════════════════════════════════════════════════════════
//
// DWA PRZYRZĄDY W JEDNYM SPACERZE, I TO NIE JEST OSZCZĘDNOŚĆ CZASU. Gdyby P7
// miał WŁASNĄ, ręcznie wypisaną listę ekranów, powstałaby dokładnie ta awaria,
// przed którą P7 stoi: podmiot przyklejony żyjący na ekranie, którego lista P7
// zapomniała odwiedzić, asercja, która nigdy nie biegnie, i bramka zielona.
// Przystanki są więc WYPROWADZONE z map par — jedna deklaracja tras dla obu
// przyrządów. Kto dopisze parę na nowym ekranie, dostaje pod nią pomiar
// przyklejenia za darmo; kto skasuje ostatnią parę ekranu, straci go w obu
// przyrządach naraz i zobaczy to w księgowości niżej.
//
// KOLEJNOŚĆ NA PRZYSTANKU: pary (bez przewijania) → przyklejenie (przewija)
// → `scrollTop = 0` przed następnym kliknięciem. Pary czytają `rect.left`
// i filtrują po `rendered()`, więc przewinięcie pionowe nie rusza żadnej z tych
// dwóch rzeczy — ale ta kolejność znaczy, że nie trzeba tego udowadniać.
//
// PRZYKLEJENIE MIERZONE W JEDNYM MOTYWIE, pary w dwóch. `position` i
// `getBoundingClientRect()` nie są funkcją farby; dwa przeloty przyklejenia
// dałyby dwa razy tę samą liczbę i dwa razy ten sam czas bramki.

// Marker DOJŚCIA na ekran, z deklaracji ekranu, nie z klasy przycisku
// nawigacji. Klasa `active` na pozycji nawigacji mówi, co się PODŚWIETLIŁO;
// ten marker mówi, co się NARYSOWAŁO — a przelot, który zaliczy powłokę
// zamiast ekranu, zmierzy pary Pipeline'u na powierzchni lądowania i wpisze
// je wszystkie jako awarię przyrządu.
const ROUTED_ARRIVAL = {
  // PipelineSurface.tsx:737 / RenewalsSurface.tsx:774 — deklaracja korzenia
  // ekranu, ta sama, z której pary tej mapy biorą przedrostek podmiotu.
  pipeline: "[data-pipeline-surface]",
  renewals: "[data-renewals-surface]",
  // Projekty i Zadania nie deklarują korzenia, więc markerem jest afordancja,
  // którą ten przystanek i tak zaraz otworzy: bez wiersza nie ma ekranu, a bez
  // ekranu nie ma czego mierzyć. ZAKRES `#main-content` jest tu nośny —
  // `[data-task-row]` rysuje też panel zadań NA REKORDZIE i kalendarz.
  projects: "#main-content [data-project-row]",
  tasks: "#main-content [data-task-row]",
  // Biblioteka: przełącznik soczewek (LibraryShell.tsx:111). Ten sam znacznik,
  // po którym przelot geometrii wylicza obiektywy.
  library: "#main-content [data-layout]",
};

// RODZAJ REKORDU, KTÓREGO SIĘ SPODZIEWAMY PO TYCH DRZWIACH. Trzy drzwi, trzy
// rodzaje — spisane w tym pliku wyżej, przy przelocie geometrii: zadanie przez
// `[data-task-row]`, projekt przez `[data-project-row]`, szansa przez
// `[data-pipeline-card]`, i wiersz odnowienia NIE OTWIERA niczego. Sprawdzenie
// rodzaju jest tu po to, żeby „otworzył się JAKIŚ rekord" nie przeszło za
// „otworzył się TEN rekord": para `[data-record-kind="project"] …` zmierzona
// na otwartym zadaniu wraca jako awaria przyrządu, a przyczyną jest trasa.
const ROUTED_RECORD_KIND = {
  "[data-project-row]": "project",
  "[data-task-row]": "task",
  "[data-pipeline-card]": "opportunity",
  // THE SAME DOOR, NARROWED TO ONE COLUMN. `[data-pipeline-card]` takes the
  // first card in board order, which is stage order, which puts the deal that
  // has nothing priced yet first — so a pair about offers opened a record with
  // none. A door scoped by `[data-pipeline-column]` is still declaration-based
  // (`PipelineSurface.tsx:406` stamps the stage id from the closed dictionary
  // in `commercial-defaults.ts:140`), and it opens the same KIND.
  '[data-pipeline-column="negotiation"] [data-pipeline-card]': "opportunity",
};

// Klucz przystanku — jedna postać dla map par i dla rejestru P7, żeby wpis
// przyklejenia nie mógł wskazać na trasę, której nikt nie chodzi.
// `treeKey` IS PART OF THE KEY, NOT A SILENT EXTRA CLICK. A stop is „the state
// this pass measures in", and selecting a folder in the Notes tree produces a
// genuinely different state of the same lens — an empty reading pane instead of
// an open note. Left out of the key, that stop would collapse into
// „library | notes | - | -" and the pair riding it would measure the OTHER
// state's elements, which is the shape of a green pair that proves nothing.
const routeKey = (route) =>
  route.settingsMode === true
    ? "settings"
    : [
        route.surface ?? "?",
        route.layout ?? "-",
        route.treeKey ?? "-",
        route.openRecord ?? "-",
        route.recordTab ?? "-",
      ].join(" | ");

const routeLabel = (route) =>
  route.settingsMode === true
    ? "Settings (mode)"
    : [
        route.surface,
        route.layout === undefined ? null : `lens ${route.layout}`,
        route.treeKey === undefined ? null : `tree node ${route.treeKey}`,
        route.openRecord === undefined
          ? null
          : `record via ${route.openRecord}`,
        route.recordTab === undefined ? null : `tab ${route.recordTab}`,
      ]
        .filter((part) => part !== null && part !== undefined)
        .join(" › ");

// ── REJESTR P7: PODMIOTY, KTÓRE MAJĄ SIĘ PRZYKLEIĆ, A JESZCZE SIĘ NIE KLEJĄ ──
// Podmiot żywy bierze się Z DEKLARACJI ROZWIĄZANEJ — skan pyta każdy narysowany
// element o `getComputedStyle().position === "sticky"`. Podmiot OCZEKIWANY tak
// się wziąć nie da, bo on się dziś liczy do `static`: jest niewidzialny dla
// każdego skanu, który pyta o stan faktyczny. Dlatego stoi wypisany, z
// właścicielem i adresem prototypu — i jest głośny w OBIE strony: selektor,
// który nie trafia w nic, to awaria przyrządu (afordancja się przeniosła),
// a podmiot, który JUŻ się klei, to sygnał, że lot dowiózł i wpis ma zniknąć.
// Bez tej drugiej połowy lista gnije w ciszy — ta sama doktryna, co
// `VISUAL_LANGUAGE_PENDING_ALREADY_MATCHES`.
const STICKY_PENDING_SUBJECTS = [
  // ── PUSTY, I TO JEST WERDYKT, NIE ZANIEDBANIE ─────────────────────────────
  // ODBIÓR LOTÓW 2 I 4, 2026-08-07. Oba wpisy, które tu stały, wyleciały tego
  // samego dnia i z tego samego powodu, który sam ten rejestr wypisuje wyżej:
  // podmiot, który JUŻ się klei, jest sygnałem, że lot dowiózł, a wpis ma
  // zniknąć. Przelot zgłosił dokładnie to, dwa razy:
  //   P7-01 (lot 4 #8, pasek zakładek rekordu) — div._strip computes
  //     position: sticky; na przystanku „projects › record" HELD, przewinięte
  //     195 z 194,6 px, elementFromPoint trafia div._strip;
  //   P7-02 (lot 2 #6, nagłówek kolumny lejka) — div._columnHead computes
  //     position: sticky; NOT_EXERCISED, bo div._scroller poproszony o 49 px
  //     przesunął się o 0 (to jest bezwładność, którą lot 2 opisał sam przy
  //     regule, a nie wada pomiaru).
  //
  // CZEGO PO TYM USUNIĘCIU NIE MIERZY JUŻ NIC, wypisane, bo pusty rejestr jest
  // najłatwiejszym miejscem, w którym wiedza znika po cichu:
  //   1. PASEK ZAKŁADEK NA EKRANIE ZADANIA JEST BEZWŁADNY. Zmierzone w tym
  //      samym przelocie i jest to najmocniejszy artefakt tej rundy: na
  //      przystanku „tasks › record" pojemnikiem przewijania paska jest
  //      div.surface-scroll._tasks i przelot poprosił go o 408,1 px, dostając 0;
  //      na „projects › record" pojemnikiem jest div.work-surface.wave2-work
  //      i pasek TRZYMA. To jest różnica POJEMNIKA (tasks/tasks.module.css
  //      deklaruje overflow-x: hidden), nie różnica długości treści. Para
  //      L4-08a czyta samą deklarację i na obu ekranach widzi to samo, więc
  //      ona tego nie złapie. Wejście fazy poprawek.
  //   2. PRZEJŚCIE PASKA NAD PRZYKLEJONYM NAGŁÓWKIEM GRUPY — nadal
  //      niemierzalne z tego samego powodu, co przed lotem: spis powszechny na
  //      każdym przystanku rekordu pokazał ZERO narysowanych nagłówków grup
  //      (RecordTasksPanel rysuje je tylko przy zadaniach, a projekt harnessu
  //      ich nie ma). Stan bez zmiany, nie regresja.
  //   3. ZACHOWANIE NAGŁÓWKA KOLUMNY LEJKA — raportowane jako żywy podmiot
  //      NOT_EXERCISED przy każdym przelocie i tam trzeba go szukać.
  //
  // KTO DOPISUJE TU KOLEJNY WPIS: to jest lista podmiotów, które MAJĄ się
  // przykleić, a jeszcze się nie klejają. Pusta znaczy „nikt nie czeka", nie
  // „przyklejenie jest zmierzone" — zasięg mierzy linia „sticky coverage"
  // niżej, i ona mówi dziś 3 z 11 reguł osądzonych jednoznacznie.
];

// Ile podmiotów przyklejenia ten przelot ma ZOBACZYĆ. Liczba stoi tu z tego
// samego powodu, co `VISUAL_LANGUAGE_EXPECTED`: podmiot, który zniknie razem
// z ekranem, ma zrobić czerwień w księgowości, a nie ubyć po cichu z raportu.
// ZMIERZONE, nie założone — wpisane po pierwszym przebiegu.
// ILE PODMIOTÓW ŻYWYCH TEN SPACER MA NAPRAWDĘ PRZEWINĄĆ. Bez tej podłogi
// przelot, któremu skan przestał cokolwiek znajdować — bo zmieniła się fikstura,
// bo `getComputedStyle` przestał liczyć się do „sticky", bo pętla skanu
// wyleciała przy refaktorze — meldowałby ZERO defektów przyklejenia i wyglądał
// identycznie jak przelot, na którym wszystko trzyma.
//
// LICZONE SĄ WERDYKTY ZACHOWANIA (HELD/SLIPPED/COVERED), NIE ZNALEZIONE
// PODMIOTY, i ta różnica jest cała treść tej podłogi. Podmiot, który skan
// znalazł, ale którego fikstura nie umiała przewinąć, wraca jako
// NOT_EXERCISED — i policzenie go tutaj dałoby próg spełniony przez trzy
// pomiary, z których żaden niczego nie sprawdził. To jest ta sama hollow green
// piętro wyżej niż `STICKY_NOT_EXERCISED`.
//
// LICZBA ZMIERZONA NA TYM DRZEWIE: 3 (nagłówek grupy notatek, nagłówek grupy
// źródeł, nawigator Ustawień), wszystkie trzy HELD. Podłoga, nie równość: nowy
// przyklejony nagłówek na dowolnym z tych ekranów ma tę bramkę wzmacniać.
// ── PRZEPISANE PRZY ODBIORZE LOTÓW 2-4, 2026-08-07 ───────────────────────────
// `pending` 2 → 0: oba wpisy rejestru wyleciały, powód i cena stoją w samym
// rejestrze wyżej. Zero jest tu ASERCJĄ, nie brakiem liczby — dopisanie wpisu
// bez podniesienia tej liczby dalej jest czerwienią.
//
// `liveExercised` 3 → 4, I TO JEST WZMOCNIENIE, O KTÓRE PROSI AKAPIT NIŻEJ.
// Przelot odbioru osądził cztery żywe podmioty: nagłówek grupy notatek,
// nagłówek grupy źródeł, nawigator Ustawień (te trzy stały w podłodze od
// początku) ORAZ pasek zakładek rekordu na przystanku „projects › record",
// nowy z lotu 4 i HELD z trafieniem kursorem.
//
// SPRAWDZONE, ŻE TA CZWÓRKA PRZEŻYWA USUNIĘCIE WPISÓW P7, a nie tylko że
// wypadła z tego jednego przebiegu. Wpis P7-01 fundował przystanek
// „projects › record › tab tasks" (`routedStops` dokłada przystanek dla
// podmiotu przyklejenia bez pary) i ten przystanek znika razem z nim — ale
// osądzony tam był `div._strip` jako NOT_EXERCISED, czyli zero werdyktów
// zachowania. Wszystkie cztery HELD siedzą na przystankach, które fundują
// PARY (projects › record, library › notes, library › sources, Ustawienia),
// więc podłoga jest osiągalna bez rejestru P7.
//
// CZEGO TA LICZBA NADAL NIE LICZY, i to jest cała jej treść: `div._columnHead`
// oraz `div._strip` na trzech pozostałych przystankach rekordu wracają
// NOT_EXERCISED. Podmiot ZNALEZIONY, ale nieprzewinięty, nie liczy się do
// podłogi i nie wolno go tu wliczyć — inaczej próg spełniałyby pomiary, z
// których żaden niczego nie sprawdził.
//
// ── 4 → 5 PRZY OSADZIE LOTÓW 2-4, 2026-08-07 ────────────────────────────────
// Akapit wyżej wyliczał CZTERY podmioty i po poprawce `scrollBoxOf` (patrz jej
// komentarz — `clip` nie jest pojemnikiem przewijania) przestał być prawdziwy.
// Piątym jest `div._strip` na przystanku „tasks › record", i to jest jedyny
// zakomitowany dowód na poprawkę lotu 4 w `tasks/tasks.module.css`: zmierzone
// HELD, przewinięte 408 z 408,1 px w `div.work-surface.wave2-work`,
// `elementFromPoint` trafia `div._strip`. Przed poprawką przyrządu ten sam
// podmiot wracał NOT_EXERCISED, bo przelot prosił o przewinięcie pudełko
// z `overflow-x: clip`, które nigdy nie przewija.
// Podniesienie podłogi jest tu ZAMKNIĘCIEM tej poprawki: gdyby ktoś przywrócił
// `overflow-x: hidden`, podmiot wróciłby do NOT_EXERCISED, liczba spadłaby do 4
// i bramka byłaby czerwona. Bez podniesienia poprawka dalej byłaby niemierzona.
// Sprawdzone przełamaniem, nie rozumowaniem: 5 (baza) → 4 i wyjście 1 po
// przywróceniu `hidden` → 5 po cofnięciu, z przebudową między krokami.
// DRUGA DROGA DO CZERWIENI, żeby nikt nie zaczynał debugowania od CSS: ten
// podmiot potrzebuje 368,1 px przewinięcia w zakresie 1134,4 px, więc KRÓTSZY
// rekord zadania w harnessie zbija liczbę do 4 tak samo skutecznie jak zmiana
// `overflow`. Czerwień na tej podłodze to pytanie „co się skróciło", nie tylko
// „co się zmieniło w arkuszu".
const STICKY_EXPECTED = { pending: 0, liveExercised: 5 };

const STICKY_PROBE_PX = 40;

// ── ILE REGUŁ PRZYKLEJENIA ISTNIEJE, A ILE TEN SPACER OSĄDZIŁ ────────────────
// Bez tej liczby raport P7 czyta się jako „przyklejenie jest zmierzone", a mówi
// wyłącznie „zmierzone są te reguły przyklejenia, które trafiły się na trasach
// mapy par". Podmioty są tu WYPROWADZONE ZE ŹRÓDŁA, tą samą doktryną, co
// `derive()` wyżej: lista obok kodu, który decyduje, ile ich jest, gnije.
// Dopasowanie idzie po OSTATNIEJ klasie selektora, bo tak właśnie wygląda
// sygnatura w przeglądarce po normalizacji hasha modułu (`.groupHead` →
// `._groupHead`). To jest raport, nie asercja — reguła może być poprawnie
// nieosiągalna na dzisiejszej fiksturze, a przełożenie tego na czerwień
// zrobiłoby z zasięgu przelotu warunek poprawności produktu.
const declaredStickyRules = () => {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) {
        // KOMENTARZE WYCIĘTE, NUMERY LINII ZACHOWANE. Bez tego skan czytał
        // `project-timeline.module.css:63` — zdanie PROZĄ o tym, że
        // `position: sticky` przypięłoby się tam do złego pudełka — jako
        // deklarację, i raportował nieistniejącą regułę jako niezmierzoną.
        // To ta sama pułapka, którą ten repozytorium ma zapisaną przy
        // `css-token-lint`: arkusz czytany RAZEM Z KOMENTARZAMI.
        const lines = readFileSync(full, "utf8")
          .replace(/\/\*[\s\S]*?\*\//gu, (block) =>
            block.replace(/[^\n]/gu, " "),
          )
          .split("\n");
        for (const [index, line] of lines.entries()) {
          if (!/position:\s*sticky/u.test(line)) continue;
          // Selektor to ostatnia niepusta linia przed nawiasem otwierającym
          // blok, w którym stoi ta deklaracja.
          let at = index;
          while (at > 0 && !lines[at].includes("{")) at -= 1;
          const selector = lines[at].split("{")[0].trim();
          const classes = [...selector.matchAll(/\.([A-Za-z0-9_-]+)/gu)].map(
            (match) => match[1],
          );
          // JAK TA KLASA WYGLĄDA W PRZEGLĄDARCE. Arkusz modułowy dostaje hash,
          // który `signature()` normalizuje do `._nazwa`; arkusz globalny
          // zostaje `.nazwa`. Bez tego rozróżnienia `.settings-navigator`
          // — reguła, którą ten przelot NAPRAWDĘ osądził — meldowała się jako
          // niezmierzona, bo szukano jej pod postacią modułową.
          const leaf =
            classes.length === 0 ? null : classes[classes.length - 1];
          found.push({
            file: path.relative(root, full),
            line: index + 1,
            selector,
            leaf,
            token:
              leaf === null
                ? null
                : entry.name.endsWith(".module.css")
                  ? `._${leaf}`
                  : `.${leaf}`,
          });
        }
      }
    }
  };
  walk(RENDERER_SOURCE);
  return found;
};

// ── KSIĘGOWOŚĆ MAPY TRAS ─────────────────────────────────────────────────────
const auditRoutedMap = () => {
  const failures = [];
  const seen = new Set();
  for (const pair of VISUAL_LANGUAGE_ROUTED_PAIRS) {
    if (seen.has(pair.id))
      failures.push(
        `ROUTED_DUPLICATE_ID: two entries in the routed map carry id „${pair.id}".`,
      );
    seen.add(pair.id);
    // A STATUS THIS PASS CANNOT READ IS SILENCE IN BOTH DIRECTIONS, and it
    // became so the moment the two branches below started reading it: a pair
    // filed as neither "enforced" nor "pending: LOT N" now gets no verdict
    // when it differs AND no already-matches when it matches. The lot-1 map
    // has carried this guard from the start (VISUAL_LANGUAGE_UNKNOWN_STATUS);
    // the routed map did not need it while every branch was unconditional,
    // and needs it now. A typo in a status is a pair that measures for
    // nobody.
    if (
      pair.status !== "enforced" &&
      !/^pending: LOT \d+$/u.test(pair.status ?? "")
    )
      failures.push(
        `ROUTED_UNKNOWN_STATUS: ${pair.id} „${pair.title}" carries the status „${pair.status}", ` +
          'which is neither „enforced" nor „pending: LOT N". This pass decides what a measurement ' +
          "COSTS from that string — a delivered pair that broke throws, an undelivered one " +
          "reports — so a status it cannot read makes the pair cost nothing in either direction.",
      );
    const route = pair.route;
    if (route === undefined || route === null) {
      failures.push(
        `ROUTED_NO_ROUTE: ${pair.id} „${pair.title}" declares no route. A pair without a route ` +
          "is measured on whatever screen happened to be open, which is the failure this whole " +
          "pass exists to remove.",
      );
      continue;
    }
    if (route.settingsMode !== true) {
      if (ROUTED_ARRIVAL[route.surface] === undefined)
        failures.push(
          `ROUTED_UNKNOWN_SURFACE: ${pair.id} routes to „${route.surface}", and this pass has no ` +
            "arrival marker for that screen. Add one to ROUTED_ARRIVAL — a screen this pass " +
            "cannot prove it reached is a screen it may not report a measurement from.",
        );
      if (
        route.openRecord !== undefined &&
        ROUTED_RECORD_KIND[route.openRecord] === undefined
      )
        failures.push(
          `ROUTED_UNKNOWN_RECORD_DOOR: ${pair.id} opens a record through „${route.openRecord}", ` +
            "and this pass does not know which record kind that door opens.",
        );
    }
  }
  const blind = VISUAL_LANGUAGE_ROUTED_PAIRS.filter(
    (pair) => pair.blind !== undefined && pair.blind !== null,
  );
  for (const [label, seenCount, wanted] of [
    [
      "routed pairs",
      VISUAL_LANGUAGE_ROUTED_PAIRS.length,
      VISUAL_LANGUAGE_ROUTED_EXPECTED.pairs,
    ],
    [
      "not-covered entries",
      VISUAL_LANGUAGE_ROUTED_NOT_COVERED.length,
      VISUAL_LANGUAGE_ROUTED_EXPECTED.notCovered,
    ],
    // PARY ŚLEPE SĄ POLICZONE, bo `blind` jest JEDYNYM polem w tej mapie, które
    // ZDEJMUJE awarię przyrządu (NOT_MEASURED przestaje być czerwienią). Pole,
    // które wycisza, i którego nikt nie liczy, jest wyłącznikiem bramki
    // dopisywalnym jednym słowem.
    ["blind pairs", blind.length, VISUAL_LANGUAGE_ROUTED_EXPECTED.blind],
    [
      "declared sticky subjects",
      STICKY_PENDING_SUBJECTS.length,
      STICKY_EXPECTED.pending,
    ],
  ])
    if (seenCount !== wanted)
      failures.push(
        `ROUTED_COUNT_DRIFT: this pass holds ${seenCount} ${label}, and the declared number is ` +
          `${wanted}. Either an entry was added or removed without saying so, or the declared ` +
          "number is stale.",
      );
  for (const [lot, expectation] of Object.entries(
    VISUAL_LANGUAGE_ROUTED_EXPECTED.lots,
  )) {
    const ofLot = VISUAL_LANGUAGE_ROUTED_PAIRS.filter(
      (pair) => String(pair.lot) === lot,
    );
    if (ofLot.length !== expectation.pairs)
      failures.push(
        `ROUTED_LOT_DRIFT (lot ${lot}): ${ofLot.length} pair(s) carried, ${expectation.pairs} declared.`,
      );
    const positions = new Set(ofLot.map((pair) => pair.position));
    if (positions.size !== expectation.positionsWithPairs)
      failures.push(
        `ROUTED_POSITION_DRIFT (lot ${lot}): ${positions.size} brief position(s) covered, ` +
          `${expectation.positionsWithPairs} declared.`,
      );
    for (const position of expectation.positionsWithoutPairs)
      if (positions.has(position))
        failures.push(
          `ROUTED_POSITION_CONTRADICTION (lot ${lot}): position ${position} is declared as ` +
            "having no pair, and the map holds one for it.",
        );
    if (
      positions.size + expectation.positionsWithoutPairs.length !==
      expectation.positionsInBrief
    )
      failures.push(
        `ROUTED_POSITION_GAP (lot ${lot}): ${positions.size} covered plus ` +
          `${expectation.positionsWithoutPairs.length} declared uncovered does not add up to the ` +
          `${expectation.positionsInBrief} position(s) the brief lists.`,
      );
  }
  // Podmiot przyklejenia MUSI mieć trasę, którą ten przelot umie przejść —
  // inaczej `routedStops` dokłada przystanek, którego `walkRouteInPage` nie
  // dowiezie, i pojawia się awaria trasy pod nazwą awarii selektora.
  for (const subject of STICKY_PENDING_SUBJECTS) {
    if (subject.route.settingsMode === true) continue;
    if (ROUTED_ARRIVAL[subject.route.surface] === undefined)
      failures.push(
        `STICKY_UNKNOWN_SURFACE: ${subject.id} routes to „${subject.route.surface}", and this ` +
          "pass has no arrival marker for that screen.",
      );
    if (
      subject.route.openRecord !== undefined &&
      ROUTED_RECORD_KIND[subject.route.openRecord] === undefined
    )
      failures.push(
        `STICKY_UNKNOWN_RECORD_DOOR: ${subject.id} opens a record through ` +
          `„${subject.route.openRecord}", and this pass does not know which kind that opens.`,
      );
  }
  return failures;
};

// ── PRZYSTANKI: WYPROWADZONE Z MAPY, NIGDY Z DOM-U ───────────────────────────
// Sonda wierności buduje spacer z `[...document.querySelectorAll(".nav-item[data-surface]")]`
// i klika KAŻDY — nowy wiersz nawigacji po cichu wydłuża jej trasę. Ten przelot
// klika DOKŁADNIE te ekrany, których żąda mapa; brak pozycji nawigacji jest tu
// głośną awarią trasy z nazwą ekranu, a nie krótszym spacerem.
const routedStops = () => {
  const stops = new Map();
  for (const pair of VISUAL_LANGUAGE_ROUTED_PAIRS) {
    if (pair.route === undefined || pair.route === null) continue;
    const key = routeKey(pair.route);
    const stop = stops.get(key) ?? { key, route: pair.route, pairs: [] };
    stop.pairs.push(pair);
    stops.set(key, stop);
  }
  // PRZYSTANEK MOŻE ISTNIEĆ WYŁĄCZNIE DLA PRZYKLEJENIA, i to jest poprawka po
  // pierwszym przebiegu. Wersja, w której trasy brały się TYLKO z par, kazała
  // podmiotowi P7 mieszkać na przystanku, który ma parę — a najgroźniejsza
  // pozycja fali (pasek zakładek NAD przyklejonymi nagłówkami grup) jest
  // groźna dokładnie na zakładce, do której żadna para nie prowadzi.
  // Wybór był między „zmierz to na ekranie, gdzie konflikt nie istnieje"
  // a „dołóż przystanek". Drugie mierzy rzecz, pierwsze mierzy jej nazwę.
  for (const subject of STICKY_PENDING_SUBJECTS) {
    const key = routeKey(subject.route);
    if (stops.has(key)) continue;
    stops.set(key, { key, route: subject.route, pairs: [], stickyOnly: true });
  }
  // TRYB USTAWIEŃ NA KOŃCU. Wejście PODMIENIA lewą kolumnę, więc pozycja
  // nawigacji następnego celu przestaje istnieć — ten sam powód, dla którego
  // sonda wierności stawia go ostatnim. Wyjście `[data-settings-back]` i tak
  // jest klikane na wejściu każdego przystanku, więc to jest pas i szelki.
  return [...stops.values()].sort(
    (left, right) =>
      Number(left.route.settingsMode === true) -
      Number(right.route.settingsMode === true),
  );
};

// ── DOJŚCIE NA MIEJSCE ───────────────────────────────────────────────────────
// TWARDY WARUNEK ZADANIA: jeśli kliknięcie nie dowiozło ekranu, ten przelot ma
// paść GŁOŚNO z nazwą ekranu — nie zmierzyć po cichu powłoki i zapisać par jako
// oczekujących. Każdy krok ma więc warunek DOJŚCIA, a nie tylko kliknięcie.
const walkRouteInPage = async ({ route, arrival, recordKind }) => {
  const frame = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  const settle = async (ms) => {
    await frame();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await frame();
  };
  const rendered = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const steps = [];

  // Wyjście z trybu Ustawień PRZED każdym krokiem nawigacji: bez tego każdy
  // cel po Ustawieniach mierzyłby Ustawienia (zmierzone w tym pliku przy
  // `sweep`, gdzie kosztowało trzynaście powierzchni zmierzonych jako jedna).
  const back = document.querySelector("[data-settings-back]");
  if (back instanceof HTMLElement) {
    back.click();
    await settle(400);
    steps.push("left settings mode");
  }

  if (route.settingsMode === true) {
    const entry = document.querySelector("[data-settings-entry]");
    if (!(entry instanceof HTMLElement))
      return {
        ok: false,
        steps,
        step: "settings",
        reason:
          "„[data-settings-entry]" +
          "” matched no element — Settings is a MODE entered by the gear, and this shell drew no gear.",
      };
    entry.click();
    await settle(700);
    if (document.querySelector("[data-settings-back]") === null)
      return {
        ok: false,
        steps,
        step: "settings",
        reason:
          "the gear was clicked and the left column did NOT swap — „[data-settings-back]” is " +
          "absent, so this pass is still standing on the shell it started from.",
      };
    steps.push("entered settings mode");
    return { ok: true, steps };
  }

  const item = document.querySelector(
    `.nav-item[data-surface="${route.surface}"]`,
  );
  if (!(item instanceof HTMLElement))
    return {
      ok: false,
      steps,
      step: `surface ${route.surface}`,
      reason: `.nav-item[data-surface="${route.surface}"] matched no element — the destination is not in the left column.`,
    };
  item.click();
  await settle(700);
  const landed = document.querySelector(arrival);
  if (!rendered(landed))
    return {
      ok: false,
      steps,
      step: `surface ${route.surface}`,
      reason:
        `the nav item for „${route.surface}" was clicked and its arrival marker „${arrival}" is ` +
        `${landed === null ? "absent" : "present but not rendered"}. The click did NOT deliver ` +
        "the screen, so anything measured here would be a statement about whatever stayed on " +
        "the page.",
    };
  steps.push(
    `surface ${route.surface} (aria-current=${item.getAttribute("aria-current") ?? "none"})`,
  );

  if (route.layout !== undefined) {
    const lens = document.querySelector(
      `#main-content [data-layout="${route.layout}"]`,
    );
    if (!(lens instanceof HTMLElement))
      return {
        ok: false,
        steps,
        step: `lens ${route.layout}`,
        reason: `#main-content [data-layout="${route.layout}"] matched no element on ${route.surface}.`,
      };
    lens.click();
    await settle(700);
    const after = document.querySelector(
      `#main-content [data-layout="${route.layout}"]`,
    );
    const selected = after?.getAttribute("aria-selected") ?? null;
    if (selected !== "true")
      return {
        ok: false,
        steps,
        step: `lens ${route.layout}`,
        reason:
          `the lens switch „${route.layout}" was clicked and reads aria-selected="${selected}". ` +
          "The reading did not change, so the pairs below would describe the lens this screen " +
          "opens on, under the name of one it never showed.",
      };
    steps.push(`lens ${route.layout} (aria-selected=true)`);
  }

  // ── WYBÓR WĘZŁA W DRZEWIE ────────────────────────────────────────────────
  // Jeden ekran w tej aplikacji ma stan osiągalny WYŁĄCZNIE przez zaznaczenie
  // czegoś w swojej własnej nawigacji wewnętrznej: powitanie w czytelni Notatek
  // rysuje się tylko przy pustym widoku, a widok jest pusty tylko w pustym
  // folderze (`NotesReading.tsx` otwiera najświeższą notatkę z zaznaczenia,
  // więc „nic nie otwarte" nie jest stanem, do którego da się dojść inaczej).
  //
  // Ten krok NIE JEST uogólnieniem na dowolną nawigację wewnątrz ekranu — jest
  // dokładnie tym jednym drzewem, i dlatego czyta `[data-tree-key]`, a nie
  // wymyślony atrybut rodziny. Kiedy drugi ekran będzie tego potrzebował,
  // uogólnienie ma powstać z DWÓCH przypadków, nie z jednego.
  if (route.treeKey !== undefined) {
    const node = document.querySelector(
      `#main-content [data-tree-key="${route.treeKey}"]`,
    );
    if (!(node instanceof HTMLElement))
      return {
        ok: false,
        steps,
        step: `tree node ${route.treeKey}`,
        reason:
          `#main-content [data-tree-key="${route.treeKey}"] matched no element on ` +
          `${route.surface} › ${route.layout}. Either the fixture stopped drawing that node or ` +
          "the key changed; in both cases nothing below this step was measured in the state it " +
          "names.",
      };
    node.click();
    await settle(700);
    const seated = document.querySelector(
      `#main-content [data-tree-key="${route.treeKey}"]`,
    );
    const chosen = seated?.getAttribute("aria-selected") ?? null;
    if (chosen !== "true")
      return {
        ok: false,
        steps,
        step: `tree node ${route.treeKey}`,
        reason:
          `the tree node „${route.treeKey}" was clicked and reads aria-selected="${chosen}". The ` +
          "selection did not move, so this stop is still standing in whatever node the screen " +
          "opened on.",
      };
    steps.push(`tree node ${route.treeKey} (aria-selected=true)`);
  }

  if (route.openRecord !== undefined) {
    const row = document.querySelector(`#main-content ${route.openRecord}`);
    if (!(row instanceof HTMLElement))
      return {
        ok: false,
        steps,
        step: `record via ${route.openRecord}`,
        reason: `#main-content ${route.openRecord} matched no row on ${route.surface} — nothing to open.`,
      };
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await settle(900);
    const opened = document.querySelector("[data-record-kind]");
    const kind = opened?.getAttribute("data-record-kind") ?? null;
    if (kind === null)
      return {
        ok: false,
        steps,
        step: `record via ${route.openRecord}`,
        reason:
          `the row was double-clicked and no [data-record-kind] screen is on the page. The ` +
          "record did not open.",
      };
    if (kind !== recordKind)
      return {
        ok: false,
        steps,
        step: `record via ${route.openRecord}`,
        reason:
          `the row opened a „${kind}" record and this route expects „${recordKind}". Pairs are ` +
          "written against one record kind each; measuring them on another is a route defect " +
          "reported as a selector defect.",
      };
    steps.push(`record ${kind}`);
  }

  if (route.recordTab !== undefined) {
    const tab = document.querySelector(
      `[role="tab"][data-record-tab="${route.recordTab}"]`,
    );
    if (!(tab instanceof HTMLElement))
      return {
        ok: false,
        steps,
        step: `tab ${route.recordTab}`,
        reason: `[role="tab"][data-record-tab="${route.recordTab}"] matched no element on the open record.`,
      };
    tab.click();
    await settle(500);
    const selected =
      document
        .querySelector(`[role="tab"][data-record-tab="${route.recordTab}"]`)
        ?.getAttribute("aria-selected") ?? null;
    if (selected !== "true")
      return {
        ok: false,
        steps,
        step: `tab ${route.recordTab}`,
        reason: `the tab „${route.recordTab}" was clicked and reads aria-selected="${selected}".`,
      };
    steps.push(`tab ${route.recordTab}`);
  }

  return { ok: true, steps };
};

// ── P7: POZYCJA PO PRZEWINIĘCIU ──────────────────────────────────────────────
// `position: sticky` MILKNIE BEZ BŁĘDU pod dowolnym przodkiem z `overflow`
// innym niż `visible`. Nie ma ostrzeżenia w konsoli, nie ma czerwieni w
// arkuszu, nie ma niczego — deklaracja jest poprawna i nie robi nic. Dlatego
// asercja o OBECNOŚCI deklaracji (para L4-08a czyta `position` i wystarczy jej
// „sticky") jest tu nie do przyjęcia jako całość dowodu: ona mierzy, że ktoś
// napisał słowo, a nie że nagłówek zostaje na ekranie.
//
// FAŁSZYWA ZIELEŃ TEGO PRZYRZĄDU MA JEDNO IMIĘ: „nic się nie przewinęło".
// Lista krótsza niż jej pojemnik nie przewija się wcale, `rect.top` nie maleje,
// asercja przechodzi — nad elementem, którego przyklejenia NIKT NIE SPRAWDZIŁ.
// To ten sam kształt, co „pusta fikstura chroni fałszywą asercję". Dlatego
// `STICKY_NOT_EXERCISED` jest OSOBNYM kubełkiem: nie zaliczeniem i nie awarią,
// tylko zmierzonym faktem o dzisiejszej fiksturze.
//
// ILE PRZEWINĄĆ, POLICZONE, NIE WPISANE. Dwie liczby wychodzą z geometrii:
//   `needed` = ile brakuje, żeby element DOSZEDŁ do swojej pozycji przyklejenia
//              (odległość od górnej krawędzi pojemnika minus wcięcie `top`),
//   `range`  = jak długo POZOSTAJE przyklejony, zanim wypchnie go dolna
//              krawędź jego własnego bloku zawierającego.
// Przewijamy `min(range, needed + próbka)`. Ograniczenie przez `range` nie jest
// ostrożnością — bez niego przy KILKU nagłówkach grup w jednym pojemniku
// przelot przewinąłby pierwszy nagłówek POZA jego własną grupę, gdzie ma prawo
// odjechać do góry (tak działają przyklejone nagłówki), i zgłosiłby poprawne
// zachowanie jako defekt.
//
// DRUGA POŁOWA: KOLEJNOŚĆ MALOWANIA. Element, który się przykleja, ale maluje
// się POD sąsiadem, spełnia każdą asercję o `rect.top`. Pytanie o to zadaje się
// trafieniem kursorem (`document.elementFromPoint`), a nie odczytem
// `z-index` — bo `z-index` bez kontekstu układania nie mówi nic.
const measureStickyInPage = async ({ pending, probePx }) => {
  const frame = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  const signature = (element) => {
    const classes = [...element.classList]
      .map((token) => {
        const match = /^_(.+)_[a-z0-9]{5,7}_\d+$/u.exec(token);
        return match === null ? token : `_${match[1]}`;
      })
      .join(".");
    return classes === ""
      ? element.tagName.toLowerCase()
      : `${element.tagName.toLowerCase()}.${classes}`;
  };
  const rendered = (element) => {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  // Pojemnik przewijania: najbliższy przodek, którego `overflow` w osi Y NIE
  // jest `visible`. Sticky pozycjonuje się względem NIEGO, nawet jeśli ten
  // przodek nigdy nie przewija — i to jest dokładnie ta cicha awaria.
  //
  // `clip` NIE JEST POJEMNIKIEM PRZEWIJANIA, i ten wyjątek jest poprawką
  // przyrządu z odbioru lotów 2-4 (2026-08-07), nie ostrożnością. CSS Overflow
  // rozróżnia dwie rzeczy, które ten warunek wcześniej zlepiał: `hidden`,
  // `scroll` i `auto` USTANAWIAJĄ pojemnik przewijania (a `hidden` na jednej
  // osi wypycha drugą oś z `visible` na `auto`), natomiast `clip` obcina i NIE
  // ustanawia go — więc `position: sticky` pod takim przodkiem pozycjonuje się
  // względem pojemnika WYŻEJ. Warunek „cokolwiek innego niż visible" wskazywał
  // na pudełko z `overflow-x: clip` jako na pojemnik, po czym prosił je
  // o przewinięcie i dostawał zero — czyli produkował `NOT_EXERCISED`
  // NIEODRÓŻNIALNE od prawdziwej bezwładności. Zmierzone na `tasks › record`:
  // `div._strip` w `div.surface-scroll._tasks`, poproszone o 408,1 px,
  // przesunięte o 0, przy sprawnie działającym przyklejeniu wyżej.
  //
  // Predykat jest w OBU osiach, bo `overflow-x: clip` z `overflow-y: hidden`
  // dalej jest pojemnikiem przewijania — pomija się samo `clip`, nie pudełko.
  const scrolls = (value) => value !== "visible" && value !== "clip";
  const scrollBoxOf = (element) => {
    let node = element.parentElement;
    while (node !== null && node !== document.body) {
      const style = window.getComputedStyle(node);
      if (scrolls(style.overflowY) || scrolls(style.overflowX)) return node;
      node = node.parentElement;
    }
    return null;
  };
  const overflowChain = (element, box) => {
    const chain = [];
    let node = element.parentElement;
    while (node !== null && node !== box && node !== document.body) {
      const style = window.getComputedStyle(node);
      if (style.overflowY !== "visible" || style.overflowX !== "visible")
        chain.push(
          `${signature(node)} {overflow-x: ${style.overflowX}; overflow-y: ${style.overflowY}}`,
        );
      node = node.parentElement;
    }
    return chain;
  };

  const judge = async (element) => {
    const style = window.getComputedStyle(element);
    const insetRaw = style.top;
    if (insetRaw === "auto")
      return {
        verdict: "UNJUDGED",
        reason:
          `it declares position: sticky with top: auto (bottom: ${style.bottom}). This probe ` +
          "asserts the TOP edge; a bottom-sticky subject needs its own assertion and this pass " +
          "does not pretend to have made one.",
      };
    const inset = Number.parseFloat(insetRaw);
    if (!Number.isFinite(inset))
      return {
        verdict: "UNJUDGED",
        reason: `its top inset computed „${insetRaw}", which this probe cannot read as pixels.`,
      };
    const box = scrollBoxOf(element);
    const scroller =
      box ?? document.scrollingElement ?? document.documentElement;
    const boxTop = box === null ? 0 : box.getBoundingClientRect().top;
    const before = element.getBoundingClientRect();
    const parent = element.parentElement;
    const parentBottom =
      parent === null ? before.bottom : parent.getBoundingClientRect().bottom;
    const needed = before.top - boxTop - inset;
    const range = parentBottom - boxTop - inset - before.height;
    const amount = Math.min(range, Math.max(needed, 0) + probePx);
    const shape = {
      signature: signature(element),
      box: box === null ? "the document" : signature(box),
      boxOverflowY:
        box === null
          ? window.getComputedStyle(document.documentElement).overflowY
          : window.getComputedStyle(box).overflowY,
      inset,
      needed: Math.round(needed * 10) / 10,
      range: Math.round(range * 10) / 10,
      amount: Math.round(amount * 10) / 10,
      chain: overflowChain(element, box),
    };
    if (!(amount > needed + 1))
      return {
        ...shape,
        verdict: "NOT_EXERCISED",
        reason:
          `the furthest this subject can be scrolled inside its own containing block is ` +
          `${shape.range}px, and it needs ${shape.needed}px just to REACH its sticky position. ` +
          "The fixture cannot push it past the pin, so nothing about its stickiness was tested.",
      };
    const scrolledFrom = scroller.scrollTop;
    scroller.scrollTop = scrolledFrom + amount;
    await frame();
    const moved = scroller.scrollTop - scrolledFrom;
    if (moved < amount - 2) {
      scroller.scrollTop = scrolledFrom;
      await frame();
      return {
        ...shape,
        verdict: "NOT_EXERCISED",
        moved: Math.round(moved * 10) / 10,
        reason:
          `this pass asked ${shape.box} to scroll ${shape.amount}px and it moved ${Math.round(moved * 10) / 10}px. ` +
          "A container that does not scroll cannot demonstrate stickiness, and an assertion over " +
          "it would pass without having tested anything.",
      };
    }
    const after = element.getBoundingClientRect();
    const wanted = boxTop + inset;
    const held = after.top >= wanted - 1;
    // Trafienie kursorem w środku pudełka PO przewinięciu — druga połowa, bez
    // której „przykleiło się, ale pod spodem" czyta się jako zaliczenie.
    const x = Math.min(
      Math.max(after.left + after.width / 2, 1),
      window.innerWidth - 1,
    );
    const y = Math.min(
      Math.max(after.top + after.height / 2, 1),
      window.innerHeight - 1,
    );
    const hit = document.elementFromPoint(x, y);
    const onTop =
      hit !== null &&
      (hit === element || element.contains(hit) || hit.contains(element));
    scroller.scrollTop = scrolledFrom;
    await frame();
    return {
      ...shape,
      verdict: held ? (onTop ? "HELD" : "COVERED") : "SLIPPED",
      moved: Math.round(moved * 10) / 10,
      top: Math.round(after.top * 10) / 10,
      wanted: Math.round(wanted * 10) / 10,
      hit: hit === null ? "nothing" : signature(hit),
      reason: held
        ? onTop
          ? undefined
          : `it holds its position and something else paints over it: the point at its centre ` +
            `hits ${hit === null ? "nothing" : signature(hit)}.`
        : `after ${shape.amount}px of scroll its top edge sits at ${Math.round(after.top * 10) / 10}px, ` +
          `below the ${Math.round(wanted * 10) / 10}px its own top inset asks for. It scrolled away ` +
          "with the content — position: sticky is declared and inert.",
    };
  };

  // ── PODMIOTY ŻYWE: Z DEKLARACJI ROZWIĄZANEJ ────────────────────────────────
  // Jeden podmiot na (sygnatura × pojemnik), i to jest wymuszone przez samą
  // rzecz: przyklejone nagłówki rodzeństwa WYPYCHAJĄ SIĘ NAWZAJEM, więc drugi
  // i trzeci nagłówek grupy mają pełne prawo odjechać do góry. Sądzony jest
  // PIERWSZY w kolejności dokumentu.
  const live = [];
  const claimed = new Set();
  for (const element of document.querySelectorAll("*")) {
    if (window.getComputedStyle(element).position !== "sticky") continue;
    if (!rendered(element)) continue;
    const box = scrollBoxOf(element);
    const key = `${signature(element)}|${box === null ? "-" : signature(box)}`;
    if (claimed.has(key)) continue;
    claimed.add(key);
    live.push({ key, element });
  }
  const liveResults = [];
  for (const entry of live)
    liveResults.push({ key: entry.key, ...(await judge(entry.element)) });

  // ── PODMIOTY OCZEKUJĄCE: Z REJESTRU ───────────────────────────────────────
  const pendingResults = [];
  for (const subject of pending) {
    let found;
    try {
      found = [...document.querySelectorAll(subject.selector)];
    } catch (error) {
      pendingResults.push({
        id: subject.id,
        state: "instrument",
        reason: `the selector „${subject.selector}" is not valid in this engine (${String(error)}).`,
      });
      continue;
    }
    const drawn = found.filter(rendered);
    if (drawn.length === 0) {
      pendingResults.push({
        id: subject.id,
        state: "instrument",
        matched: found.length,
        reason:
          `„${subject.selector}" matched ${found.length} element(s) and ${found.length === 0 ? "none exists" : "none is rendered"} ` +
          "on the stop this subject declares. The affordance moved and the registry has to move " +
          "with it — an entry that matches nothing is measured by nobody.",
      });
      continue;
    }
    const element = drawn[0];
    const position = window.getComputedStyle(element).position;
    if (position === "sticky") {
      pendingResults.push({
        id: subject.id,
        state: "delivered",
        matched: drawn.length,
        signature: signature(element),
        ...(await judge(element)),
      });
      continue;
    }
    const box = scrollBoxOf(element);
    // CZY TO PUDEŁKO W OGÓLE PRZEWIJA SIĘ W PIONIE — bo to jest CAŁA prognoza
    // dla obu tych pozycji, nie przypis. `top: 0` w pudełku, którego treść się
    // mieści, jest deklaracją bez skutku i BEZ OSTRZEŻENIA; brief nazywa to
    // przy Pipeline #6 („może przykleić się do ZŁEJ krawędzi"). Dwie surowe
    // liczby, nie sam werdykt: lot ma zobaczyć, o ile treść przerasta pudełko.
    const scrollBox =
      box ?? document.scrollingElement ?? document.documentElement;
    pendingResults.push({
      id: subject.id,
      state: "pending",
      matched: drawn.length,
      signature: signature(element),
      position,
      box: box === null ? "the document" : signature(box),
      boxOverflowX:
        box === null ? "visible" : window.getComputedStyle(box).overflowX,
      boxOverflowY:
        box === null ? "visible" : window.getComputedStyle(box).overflowY,
      boxScrollHeight: Math.round(scrollBox.scrollHeight),
      boxClientHeight: Math.round(scrollBox.clientHeight),
      boxScrollsVertically: scrollBox.scrollHeight > scrollBox.clientHeight + 1,
      // DIAGNOZA WYPRZEDZAJĄCA, policzona ZANIM ktokolwiek napisze deklarację:
      // przodkowie z `overflow` innym niż `visible` między podmiotem a jego
      // pudełkiem przewijania to lista rzeczy, które UCISZĄ przyklejenie
      // w dniu, w którym lot je doda. Brief nazywa to przy pozycji 10 lotu 4.
      chain: overflowChain(element, box),
    });
  }

  // SPIS POWSZECHNY PODMIOTU, KTÓRY MIAŁBY BYĆ PRZYKLEJONY, ALE GO NIE MA.
  // Zero żywych podmiotów na przystanku nie drukuje dziś ŻADNEGO wiersza,
  // czyli czyta się identycznie jak przystanek, na którym wszystko trzyma.
  // Ta liczba zamienia brak w pomiar — a przy pozycji 8 lotu 4 jest wprost
  // odpowiedzią na pytanie „czy konflikt kolejności malowania ma na tym
  // ekranie jakikolwiek podmiot".
  return {
    live: liveResults,
    pending: pendingResults,
    census: {
      sticky: liveResults.length,
      groupHeads: document.querySelectorAll('[class*="_groupHead_"]').length,
      tablists: document.querySelectorAll('[role="tablist"]').length,
    },
  };
};

// ── PRZELOT ──────────────────────────────────────────────────────────────────
const routedVisualLanguage = async (browser) => {
  const failures = auditRoutedMap();
  // Verdicts about the PRODUCT, kept apart from instrument and route
  // failures. The list is empty today by measurement, not by assumption: no
  // pair in this map is "enforced" yet. Empty is to be read as "nothing that
  // was delivered has broken".
  const verdicts = [];
  const stops = routedStops();
  const buckets = new Map();
  const bump = (lot, bucket) => {
    const row = buckets.get(lot) ?? {
      MATCH: 0,
      DIFFERS: 0,
      NOT_MEASURED: 0,
      BLIND: 0,
      ROUTE_FAILED: 0,
    };
    row[bucket] += 1;
    buckets.set(lot, row);
  };
  const startedAt = Date.now();
  let liveSeen = 0;
  const judgedSignatures = new Set();

  for (const theme of THEME_ORDER) {
    const report = (line) => console.log(`routed\t${theme}\t${line}`);
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      colorScheme: theme,
    });
    page.on("pageerror", (error) =>
      failures.push(`ROUTED_PAGE_ERROR (${theme}): ${String(error)}`),
    );
    await page.goto(HARNESS, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    // PRZYKLEJENIE MIERZONE W PIERWSZYM MOTYWIE. Powód przy nagłówku bloku.
    const measureSticky = theme === THEME_ORDER[0];

    for (const stop of stops) {
      // Przystanek istniejący WYŁĄCZNIE dla przyklejenia nie ma po co chodzić
      // w drugim motywie: `position` i `getBoundingClientRect()` nie są
      // funkcją farby, a przejście tej trasy kosztuje ~2,5 s.
      if (stop.pairs.length === 0 && !measureSticky) continue;
      const walked = await page.evaluate(walkRouteInPage, {
        route: stop.route,
        arrival: ROUTED_ARRIVAL[stop.route.surface] ?? "body",
        recordKind:
          stop.route.openRecord === undefined
            ? null
            : (ROUTED_RECORD_KIND[stop.route.openRecord] ?? null),
      });
      if (!walked.ok) {
        // GŁOŚNO, Z NAZWĄ EKRANU, I NIGDY JAKO „pending". Trasa, która nie
        // dowiozła ekranu, jest awarią NAWIGACJI — zapisanie jej jako
        // niezmierzonej pary wysyła czytającego szukać defektu selektora,
        // którego nie ma, a zapisanie jako oczekującej jest po prostu
        // kłamstwem o tym, co przelot zobaczył.
        failures.push(
          `ROUTED_ROUTE_FAILED (${theme}) — ${routeLabel(stop.route)}: ${walked.reason} ` +
            `Steps that DID land: ${walked.steps.join(" → ") || "none"}. ` +
            `${stop.pairs.length} pair(s) on this stop measured NOTHING.`,
        );
        report(
          `ROUTE_FAILED\t${routeLabel(stop.route)}\tat step ${walked.step}\t${stop.pairs.length} pair(s) lost`,
        );
        for (const pair of stop.pairs) bump(pair.lot, "ROUTE_FAILED");
        continue;
      }
      report(`arrived\t${routeLabel(stop.route)}\t${walked.steps.join(" → ")}`);

      const collected = await page.evaluate(measureVisualLanguageInPage, {
        pairs: stop.pairs,
        notCovered: [],
        wantedTheme: theme,
        pseudoAbsent: PSEUDO_ABSENT,
        where: routeLabel(stop.route),
      });
      if (collected.applied !== theme)
        failures.push(
          `ROUTED_THEME_NOT_STAMPED (${theme}) at ${routeLabel(stop.route)}: read back ` +
            `„${collected.applied}".`,
        );
      const byId = new Map(
        collected.measurements.map((entry) => [entry.id, entry]),
      );
      for (const pair of stop.pairs) {
        const measured = byId.get(pair.id);
        if (measured === undefined) {
          failures.push(
            `ROUTED_NOT_MEASURED (${theme}) — ${pair.id} „${pair.title}": the in-page pass ` +
              "returned no measurement at all. Instrument failure.",
          );
          bump(pair.lot, "NOT_MEASURED");
          continue;
        }
        const judged = judgeVisualPair(
          pair,
          measured,
          collected.rootFontSizePx,
          theme,
        );
        const subject = pair.subject.selector ?? `var(${pair.subject.token})`;
        const cite =
          `${pair.prototype.file}:${pair.prototype.lines} („${pair.prototype.value}") ` +
          `↔ ${subject} [${pair.read?.property ?? "count"}]`;
        if (judged.state === "NOT_MEASURED") {
          // ŚLEPA PARA NIE JEST AWARIĄ PRZYRZĄDU. `blind` znaczy „dzisiejsza
          // fikstura tego nie rysuje" i jest FAKTEM O DANYCH, nie o kodzie.
          // Liczba ślepych par jest za to asertowana w księgowości wyżej, bo
          // pole, które wycisza czerwień, i którego nikt nie liczy, jest
          // wyłącznikiem bramki dopisywalnym jednym słowem.
          if (pair.blind !== undefined && pair.blind !== null) {
            report(
              `${pair.id}\tBLIND\t${pair.title}\t${judged.reason}\t${pair.blind}`,
            );
            bump(pair.lot, "BLIND");
            continue;
          }
          failures.push(
            `ROUTED_NOT_MEASURED (${theme}) — ${pair.id} „${pair.title}" [${pair.status}] at ` +
              `${routeLabel(stop.route)}: ${judged.reason} Pair: ${cite}. The route DID land ` +
              "(steps above), so this is the selector, not the navigation.",
          );
          report(`${pair.id}\tNOT_MEASURED\t${judged.reason}`);
          bump(pair.lot, "NOT_MEASURED");
          continue;
        }
        report(
          `${pair.id}\t${judged.state}\t${pair.status}\t${pair.title}\t` +
            `observed: ${judged.observed}\texpected: ${judged.expected}\t${cite}`,
        );
        bump(pair.lot, judged.state === "MATCH" ? "MATCH" : "DIFFERS");
        // ── THE STATUS IS READ BOTH WAYS NOW, NOT ONLY ONE ────────────────
        // This branch used to look ONLY at the measurement and never at the
        // pair's status, and that was invisible because EVERY pair in this
        // map is pending today. Measured, by flipping L4-01a to "enforced"
        // with an expectation that matches: the pass printed „is filed as
        // «enforced» … the entry must flip to «enforced»" — a red nothing can
        // clear, because it demands the state the entry is already in, and it
        // appears EXACTLY when a lot delivers the position. The other half of
        // the same hole is quiet and worse: an "enforced" pair that STOPPED
        // matching reached nothing at all, so the routed map could not enforce
        // a single delivered position.
        //
        // The rule is the one `visualLanguagePairs` already follows and the
        // one the record-title band was just given: an UNDELIVERED position
        // reports, a DELIVERED one that broke throws. The verdict goes on its
        // own list, because calling a sentence about the product an
        // "instrument failure" sends the reader off to repair the instrument.
        if (pair.status === "enforced" && judged.state !== "MATCH")
          verdicts.push(
            `${theme} theme at ${routeLabel(stop.route)} — ${pair.id} „${pair.title}": ` +
              `${subject} computes ${pair.read?.property ?? "count"} = ${judged.observed}, and ` +
              `${pair.prototype.file}:${pair.prototype.lines} says ${judged.expected}. ` +
              `Contract: ${pair.contract}.`,
          );
        if (pair.status.startsWith("pending") && judged.state === "MATCH")
          failures.push(
            `ROUTED_PENDING_ALREADY_MATCHES (${theme}) — ${pair.id} „${pair.title}" is filed as ` +
              `„${pair.status}", and it MATCHES today: ${subject} computes ` +
              `${pair.read?.property ?? "count"} = ${judged.observed}, which is what ` +
              `${pair.prototype.file}:${pair.prototype.lines} asks for. Either the lot delivered ` +
              'this and the entry must flip to "enforced", or the expectation is written so it ' +
              "can never fail. Do not soften it to keep it pending.",
          );
      }

      if (measureSticky) {
        const pendingHere = STICKY_PENDING_SUBJECTS.filter(
          (subject) => routeKey(subject.route) === stop.key,
        );
        const sticky = await page.evaluate(measureStickyInPage, {
          pending: pendingHere.map((subject) => ({
            id: subject.id,
            selector: subject.selector,
          })),
          probePx: STICKY_PROBE_PX,
        });
        liveSeen += sticky.live.filter((entry) =>
          ["HELD", "SLIPPED", "COVERED"].includes(entry.verdict),
        ).length;
        for (const entry of sticky.live)
          if (entry.verdict !== "UNJUDGED")
            judgedSignatures.add(entry.signature);
        report(
          `sticky scan\t${routeLabel(stop.route)}\t${sticky.census.sticky} live subject(s)\t` +
            `${sticky.census.groupHeads} group head(s) drawn\t` +
            `${sticky.census.tablists} tablist(s) drawn`,
        );
        for (const entry of sticky.live) {
          report(
            `sticky live\t${entry.signature ?? entry.key}\tin ${entry.box ?? "-"}\t` +
              `${entry.verdict}\ttop ${entry.top ?? "-"}px vs wanted ${entry.wanted ?? "-"}px\t` +
              `scrolled ${entry.moved ?? 0}/${entry.amount ?? 0}px (needed ${entry.needed ?? "-"}, ` +
              `range ${entry.range ?? "-"})\thit ${entry.hit ?? "-"}`,
          );
          if (entry.verdict === "SLIPPED" || entry.verdict === "COVERED")
            failures.push(
              `STICKY_${entry.verdict} (${routeLabel(stop.route)}) — ${entry.signature} declares ` +
                `position: sticky and ${entry.reason}` +
                (entry.chain !== undefined && entry.chain.length > 0
                  ? ` Ancestors between it and ${entry.box} that clip: ${entry.chain.join("; ")}.`
                  : ""),
            );
          if (entry.verdict === "UNJUDGED")
            failures.push(
              `STICKY_UNJUDGED (${routeLabel(stop.route)}) — ${entry.signature ?? entry.key}: ${entry.reason}`,
            );
        }
        for (const subject of pendingHere) {
          const entry = sticky.pending.find((row) => row.id === subject.id);
          if (entry === undefined) {
            failures.push(
              `STICKY_SUBJECT_NOT_MEASURED — ${subject.id} „${subject.title}" returned nothing ` +
                "from the in-page pass. Instrument failure.",
            );
            continue;
          }
          if (entry.state === "instrument") {
            failures.push(
              `STICKY_SUBJECT_MISSING — ${subject.id} „${subject.title}" (owner: ${subject.owner}): ` +
                `${entry.reason} Registered selector: ${subject.selector}, app: ${subject.app}.`,
            );
            report(`sticky pending\t${subject.id}\tSUBJECT MISSING`);
            continue;
          }
          if (entry.state === "delivered") {
            failures.push(
              `STICKY_PENDING_ALREADY_STICKY — ${subject.id} „${subject.title}" is registered as ` +
                `waiting for ${subject.owner}, and ${entry.signature} computes position: sticky ` +
                `TODAY (verdict after scrolling: ${entry.verdict}). Either the lot delivered it ` +
                "and this entry must go, or something else made it sticky by accident. A pending " +
                "list nobody contradicts is a list that rots.",
            );
            report(
              `sticky pending\t${subject.id}\tALREADY STICKY\t${entry.verdict}`,
            );
            continue;
          }
          report(
            `sticky pending\t${subject.id}\t${subject.title}\towner ${subject.owner}\t` +
              `${entry.signature} computes position: ${entry.position}\t` +
              `scroll box ${entry.box} {overflow-x: ${entry.boxOverflowX}; overflow-y: ${entry.boxOverflowY}}\t` +
              `${entry.boxScrollsVertically ? "SCROLLS vertically" : "DOES NOT scroll vertically"} ` +
              `(${entry.boxScrollHeight}px of content in a ${entry.boxClientHeight}px box) — a ` +
              "top-sticky subject in a box that never scrolls vertically is silently inert\t" +
              `clipping ancestors: ${entry.chain.length === 0 ? "none" : entry.chain.join("; ")}\t` +
              `prototype ${subject.prototype}`,
          );
        }
      }

      // Powrót na górę PRZED następnym kliknięciem: przewinięty ekran zostaje
      // przewinięty, a następny przystanek mierzyłby pary na widoku, którego
      // nie wybrał.
      await page.evaluate(() => {
        for (const node of [
          document.scrollingElement,
          ...document.querySelectorAll("*"),
        ])
          if (node !== null && node.scrollTop > 0) node.scrollTop = 0;
      });
    }
    await page.close();
  }

  const elapsedMs = Date.now() - startedAt;
  if (liveSeen < STICKY_EXPECTED.liveExercised)
    failures.push(
      `STICKY_NOTHING_EXERCISED: across every stop this pass walked, ${liveSeen} live sticky ` +
        `subject(s) were actually scrolled past their pin and judged, under a floor of ` +
        `${STICKY_EXPECTED.liveExercised}. A subject that is FOUND but never exercised reports ` +
        "no defect and reads exactly like a subject that holds. Instrument failure — either a " +
        "screen stopped drawing its sticky heading, or its list got too short to demonstrate " +
        "stickiness and the fixture has to grow.",
    );
  for (const entry of VISUAL_LANGUAGE_ROUTED_NOT_COVERED)
    console.log(
      `routed\tnot covered\tL${entry.lot}-${String(entry.position).padStart(2, "0")}\t` +
        `${entry.scope}\t${entry.title}`,
    );
  for (const [lot, row] of [...buckets.entries()].sort())
    console.log(
      `routed\tlot ${lot}\t${row.MATCH} MATCH\t${row.DIFFERS} DIFFERS\t` +
        `${row.NOT_MEASURED} NOT_MEASURED\t${row.BLIND} BLIND\t${row.ROUTE_FAILED} ROUTE_FAILED\t` +
        "(counted over both themes)",
    );
  // ZASIĘG P7, WYPISANY JAKO UŁAMEK. Reguła nieosądzona to reguła NIEZMIERZONA,
  // a nie reguła poprawna — i tylko ta linia odróżnia jedno od drugiego.
  const declared = declaredStickyRules();
  // NIEJEDNOZNACZNOŚĆ NAZWANA, NIE ZALICZONA. Sześć różnych arkuszy modułowych
  // deklaruje regułę `.groupHead`, a sygnatura w przeglądarce po normalizacji
  // hasha brzmi w każdym z nich `._groupHead`. Przypisanie osądzonego podmiotu
  // do KONKRETNEJ reguły jest więc niemożliwe tym dopasowaniem — a wpisanie
  // sześciu reguł jako „JUDGED", bo osądzono trzy podmioty o tej nazwie, byłoby
  // dokładnie tym, czego ten plik zabrania: bramką mierzącą OBECNOŚĆ nazwy.
  const shared = new Map();
  for (const rule of declared)
    if (rule.token !== null)
      shared.set(rule.token, (shared.get(rule.token) ?? 0) + 1);
  const statusOf = (rule) => {
    if (rule.token === null) return "NO CLASS — this walk cannot address it";
    const hit = [...judgedSignatures].some((signature) =>
      signature.includes(rule.token),
    );
    if (!hit) return "NOT MEASURED by this walk — no stop draws it";
    return shared.get(rule.token) > 1
      ? `AMBIGUOUS — ${shared.get(rule.token)} declared rules share the class „${rule.leaf}", ` +
          "so a judged subject cannot be attributed to this one"
      : "JUDGED";
  };
  const statuses = declared.map(statusOf);
  console.log(
    `routed\tsticky coverage\t${statuses.filter((status) => status === "JUDGED").length} of ` +
      `${declared.length} declared position: sticky rule(s) in packages/desktop-ui/src judged ` +
      `unambiguously\t${statuses.filter((status) => status.startsWith("AMBIGUOUS")).length} ` +
      `matched a judged subject but share a class name\t` +
      `${statuses.filter((status) => status.startsWith("NOT MEASURED")).length} on screens no ` +
      `stop draws\t${liveSeen} live subject(s) actually exercised`,
  );
  for (const [index, rule] of declared.entries())
    console.log(
      `routed\tsticky rule\t${rule.file}:${rule.line}\t${rule.selector}\t${statuses[index]}`,
    );
  console.log(
    `routed\twalk\t${stops.length} stop(s) × ${THEME_ORDER.length} theme(s)\t` +
      `${liveSeen} live sticky subject(s) exercised and judged (floor ` +
      `${STICKY_EXPECTED.liveExercised}), ` +
      `${STICKY_PENDING_SUBJECTS.length} declared-pending subject(s)\t${elapsedMs} ms wall clock`,
  );
  return { failures, verdicts, buckets, elapsedMs, stops: stops.length };
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
    const { failures, layoutProblems, matchedRegistryEntries, titleProblems } =
      await sweep(browser, pass);
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
    // BEZWARUNKOWO, RÓWNIEŻ W TRYBIE RAPORTU — powód przy `titleProblems`
    // w `sweep`: tryb raportu odświeża REJESTR PRZEPEŁNIEŃ, a rozmiar tytułu
    // żadnego rejestru nie ma.
    for (const problem of titleProblems) {
      problems.push(`${pass.label} — visual fidelity: ${problem}`);
    }
    const counted =
      failures.length + layoutProblems.length + titleProblems.length;
    console.log(
      `${pass.label}: ${
        counted === 0
          ? "no overflow, title within band"
          : `${counted} problem(s)`
      }`,
    );
  }
  // SONDA WIERNOŚCI WIZUALNEJ — osobny przelot, bo KOLOR mierzy się inaczej niż
  // geometrię: wymaga dwóch motywów, świeżego kontekstu na każdy z nich
  // i sekwencji prawdziwych Tabów na nieklikniętej powłoce. Barwa akcentu nie
  // zmienia się od szerokości okna, więc ten przelot chodzi po jednym viewporcie.
  //
  // ROZMIAR TYTUŁU JUŻ TAK NIE CHODZI, i to jest poprawka po dwóch defektach:
  // pasmo tytułu jest asertowane RÓWNIEŻ w przelotach geometrii wyżej (320 px,
  // 200% tekstu, dwie szerokości Biblioteki), bo reguła `@media` może zmienić
  // tytuł w oknie, którego ten przelot nigdy nie otwiera. Tutaj zostaje to,
  // czego tamte przeloty nie umieją: nazwa motywu przy każdym werdykcie
  // i pokrycie liczone po celach powłoki.
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
  // ── THE RECORD-TITLE BAND: ONE LINE THAT TELLS THE WHOLE TRUTH ───────────
  // This band's verdicts are scattered across the geometry passes and, while
  // the position is undelivered, they do not stop the run — so without this
  // line the whole measurement would live only in a stream nobody returns to
  // when the run is green. The line prints UNCONDITIONALLY, every run, and
  // carries the owner, its pairs' statuses and how many titles were judged.
  // A measurement that vanished shows up here as a zero, not as a missing
  // paragraph.
  const bandFailures = [...RECORD_TITLE_BAND.failures];
  // ZERO TITLES JUDGED IN THE WHOLE RUN is not "a pending that holds" — it is
  // a band that does not exist. The per-pass floor (over the record kinds a
  // pass opened) cannot see this: a pass that stopped opening records owes no
  // kind at all.
  if (RECORD_TITLE_BAND_CENSUS.entries === 0)
    bandFailures.push(
      "RECORD_TITLE_BAND_MEASURED_NOTHING: not one visible record title was judged against the " +
        `${RECORD_TITLE_REM}rem band in ANY pass of this run. The band is filed as ` +
        `${RECORD_TITLE_BAND_OWNER.label} (${RECORD_TITLE_BAND_STATUS}), and a pending position ` +
        "that measures nothing is indistinguishable from one that holds — so this is an " +
        "instrument failure, not silence.",
    );
  console.log(
    `record title band: ${RECORD_TITLE_BAND_OWNER.label} — ` +
      `${RECORD_TITLE_BAND.armed ? "ENFORCED (a verdict fails this run)" : "PENDING (verdicts are reported, not thrown)"}\t` +
      `owners ${RECORD_TITLE_BAND_STATUS}\t` +
      `${RECORD_TITLE_BAND_CENSUS.entries} record title(s) judged in ` +
      `${RECORD_TITLE_BAND_CENSUS.passes} pass(es), ` +
      `${RECORD_TITLE_BAND_CENSUS.groups} size/weight group observation(s) across those passes ` +
      `(each pass groups its own geometry, so this is a sum, not a count of distinct sizes)\t` +
      `on record kind(s): ` +
      `${[...RECORD_TITLE_BAND_CENSUS.kinds].sort().join(", ") || "NONE"}\t` +
      `${RECORD_TITLE_BAND_CENSUS.pending.length} verdict(s) reported`,
  );
  for (const line of RECORD_TITLE_BAND_CENSUS.pending)
    console.log(`record title band\treported\t${line}`);
  for (const failure of bandFailures) {
    problems.push(`record title band — instrument: ${failure}`);
  }
  // ── P1: PARY JĘZYKA WIZUALNEGO ──────────────────────────────────────────
  // OSOBNY PRZELOT, powody przy `visualLanguagePairs`. Obie listy egzekwowane
  // bezwarunkowo, również w trybie raportu, z tego samego powodu co sonda
  // wierności: `REPORT_ONLY` zdejmuje w tym pliku JEDNĄ, nazwaną rzecz —
  // czy przepełnienie robi się błędem — a mapa par nie ma żadnego rejestru do
  // odświeżenia.
  const language = await visualLanguagePairs(browser);
  for (const failure of language.failures) {
    problems.push(`visual language — instrument: ${failure}`);
  }
  for (const verdict of language.verdicts) {
    problems.push(`visual language — ${verdict}`);
  }
  // WIERSZ PODSUMOWANIA MÓWI, ILE PAR JEST W KTÓRYM STANIE, a nie „trzyma".
  // Zieleń nad mapą, w której WSZYSTKIE pary są „pending", nie znaczy, że język
  // wizualny jest przyjęty — znaczy, że każda nieoddana pozycja została
  // zmierzona i NIE PASUJE. Zdanie „N pair(s) hold" czytałoby się dokładnie
  // odwrotnie i było pierwszą wersją tej linii.
  const enforcedPairs = VISUAL_LANGUAGE_PAIRS.filter(
    (pair) => pair.status === "enforced",
  ).length;
  console.log(
    `visual language: ${
      language.failures.length + language.verdicts.length === 0
        ? `${enforcedPairs} enforced pair(s) match and ` +
          `${VISUAL_LANGUAGE_PAIRS.length - enforcedPairs} pending pair(s) still differ, in both ` +
          `themes; ${VISUAL_LANGUAGE_NOT_COVERED.length} aspect(s) declared NOT COVERED`
        : `${language.failures.length} instrument failure(s), ${language.verdicts.length} verdict(s)`
    }`,
  );
  // ── P7 + PARY LOTÓW 2-6: PRZELOT TRAS ───────────────────────────────────
  // OSOBNY PRZELOT OD `visualLanguagePairs`, i to nie jest podział estetyczny:
  // tamten chodzi po POWŁOCE LĄDOWANIA i mierzy pary lotu 1 bez jednego
  // kliknięcia, ten chodzi po EKRANACH i bez kliknięć nie mierzy niczego.
  // Zlanie ich w jeden dałoby przelot, w którym awaria nawigacji kładzie
  // również pary, które nawigacji nie potrzebują.
  //
  // CZERWIEŃ TEGO PRZELOTU JEST OCZEKIWANA I NIE JEST TYM SAMYM CO AWARIA.
  // Werdykt „DIFFERS" na parze oczekującej NIE trafia do `problems` — lot 2
  // jeszcze nie pobiegł i wpisanie mu tego jako błędu bramki uczyniłoby ją
  // czerwoną do końca Fazy 3, czyli bezużyteczną. Do `problems` idą WYŁĄCZNIE
  // awarie przyrządu i trasy: selektor, który nie trafia, ekran, który się nie
  // otworzył, para oczekująca, która JUŻ pasuje, i przyklejenie, które milczy.
  //
  // AND — from this version — A VERDICT OVER A DELIVERED PAIR. "Pending does
  // not throw" does not mean "nothing throws": a pair flipped to "enforced"
  // that stopped matching is a regression of delivered work and must fail the
  // run, or "enforced" would mean nothing in this map. The list is empty
  // today because the routed map has no delivered pair yet.
  const routed = await routedVisualLanguage(browser);
  for (const failure of routed.failures) {
    problems.push(`routed — instrument: ${failure}`);
  }
  for (const verdict of routed.verdicts) {
    problems.push(`routed — ${verdict}`);
  }
  console.log(
    `routed: ${routed.stops} stop(s) walked in ${routed.elapsedMs} ms; ` +
      `${routed.failures.length} instrument/route failure(s), ` +
      `${routed.verdicts.length} verdict(s) over delivered pair(s)`,
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
