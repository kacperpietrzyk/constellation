// Break-testy z DOWODEM, że przebudowa naprawdę się odbyła.
//
// PO CO TO ISTNIEJE. Trzy fale tego repozytorium opierają się na jednej
// pisanej regule: „break-test potrzebuje `tsc -b` WEWNĄTRZ pętli, bo
// `@constellation/contracts` rozwiązuje się do `dist/`". Reguła jest
// KONIECZNA, ale NIEWYSTARCZAJĄCA — i to nie jest teoria, tylko zmierzony
// tryb awarii z lotu Import fali D (PR #210):
//
//   cp plik plik.bak → zepsuj → tsc -b → uruchom test → mv plik.bak plik → tsc -b
//
// `mv` zachowuje mtime KOPII, który jest starszy niż `.tsbuildinfo` zapisany
// przy budowie zepsutej wersji. `tsc -b` uznaje projekt za aktualny i NIC NIE
// ROBI. Od tej chwili `dist/` niesie kod ZEPSUTY przez poprzedni break-test,
// a każdy następny test chodzi na nim. W fali D zaraziło to trzy kolejne
// break-testy i zostało wykryte przypadkiem.
//
// To jest „zielono na skasowanym kodzie" OD DRUGIEJ STRONY: reguła ostrzega
// przed ZŁAMANIEM, które się nie kompiluje, a tutaj nie kompiluje się
// PRZYWRÓCENIE. Objaw jest gorszy — nie fałszywa zieleń jednego testu, tylko
// zatruty stan dla wszystkiego, co uruchomisz potem.
//
// ZMIERZONE ZACHOWANIE `tsc -b`, na którym stoi cały ten moduł (sonda
// odtworzona ręcznie 2026-08-02, TypeScript z tego repozytorium):
//
//   1. Przebudowa będąca NO-OPEM **nie przepisuje** `.tsbuildinfo`.
//   2. Przebudowa, która PADA na błędzie typów, `.tsbuildinfo` **przepisuje**
//      (i emituje zepsuty JS — `noEmitOnError` jest domyślnie wyłączone).
//   3. Zatrucie bije WYŁĄCZNIE wtedy, gdy złamanie SIĘ KOMPILOWAŁO. Po
//      złamaniu, które się nie kompiluje, `tsc -b` przebudowuje mimo starszego
//      mtime, bo projekt jest zapisany jako niosący błędy.
//
// Z (1) i (2) wynika dowód, którego ten moduł używa: **`.tsbuildinfo`, który
// nie przesunął się po fazie zapisującej źródło, znaczy „kompilator nie zrobił
// nic"**. Przesuwa się po sukcesie I po porażce; stoi tylko na no-opie.
//
// DWIE POŁOWY, obie potrzebne:
//
//   ŚCIEŻKA PRZYWRÓCENIA, KTÓRA NIE UMIE WYPRODUKOWAĆ TEGO STANU — oryginalny
//   tekst trzymany w PAMIĘCI (nie jako `.bak` obok źródła, gdzie widzi go
//   prettier, eslint i sam `tsc`), przywracany ZAPISEM, z asercją, że tekst
//   wraca bajt w bajt, i z wymuszeniem mtime ściśle nowszego niż każdy stempel
//   budowy. Po takim przywróceniu no-op jest niemożliwy, nie nieprawdopodobny.
//
//   HARNESS, KTÓRY PADA GŁOŚNO ZAMIAST IŚĆ DALEJ — jeżeli po fazie zapisującej
//   źródło żaden stempel budowy się nie przesunął, przebudowa się NIE ODBYŁA
//   i harness przerywa cały przebieg. Przebudowa będąca no-opem jest
//   nieodróżnialna od udanej po samym kodzie wyjścia; jest odróżnialna po
//   stemplu.
//
// TRZY LICZBY NA KAŻDE ZŁAMANIE, nie dwie: baza ZIELONA → złamanie CZERWONE →
// przywrócenie ZIELONE. Sama para „baza/złamanie" nie widzi zatrucia, bo
// zatrucie zaczyna się dopiero przy przywróceniu.

import { spawnSync } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

/**
 * Ile sekund ponad najnowszy stempel budowy dostaje przywrócony plik.
 *
 * Nie jest to „zapas na wszelki wypadek", tylko domknięcie dokładnie tej
 * nierówności, z której bierze się defekt: `tsc -b` porównuje mtime źródła ze
 * stemplem projektu. Sekunda wystarcza każdemu systemowi plików, na którym to
 * repozytorium się buduje, a wyprzedzenie zegara o sekundę nie ma żadnego
 * innego czytelnika.
 */
const REBUILD_CLOCK_MARGIN_SECONDS = 1;

/**
 * Gdzie każdy pakiet trzyma swój stempel budowy — WYPROWADZONE z `tsconfig`,
 * nigdy nie wypisane listą.
 *
 * Lista pakietów wpisana tutaj byłaby dwunastym miejscem rodziny „ręczna lista
 * obok zamkniętego słownika", którą to repozytorium płaci od czterech fal:
 * nowy pakiet nie trafiłby na listę, jego stempel nie byłby obserwowany,
 * a dowód przebudowy po cichu przestałby obejmować jego kod. `tsconfig.json`
 * pakietu JEST rejestrem, bo bez wpisu `tsBuildInfoFile` nic się nie zbuduje.
 */
export const buildStampFiles = (root) => {
  const packagesRoot = path.join(root, "packages");
  const stamps = [];
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const config = path.join(packagesRoot, entry.name, "tsconfig.json");
    let text;
    try {
      text = readFileSync(config, "utf8");
    } catch {
      continue;
    }
    // `tsconfig.json` niesie komentarze, więc nie jest JSON-em. Szukany wpis
    // jest jednoznaczny, a błędne dopasowanie objawia się natychmiast: dowód
    // przebudowy przestaje istnieć i harness pada.
    const found = /"tsBuildInfoFile"\s*:\s*"([^"]+)"/u.exec(text);
    if (found === null) continue;
    stamps.push(path.join(packagesRoot, entry.name, found[1]));
  }
  return stamps.sort();
};

/** Stan stempli budowy w jednej chwili. Brakujący plik ma stan `null`. */
export const readBuildStamps = (files) => {
  const stamps = new Map();
  for (const file of files) {
    try {
      const info = statSync(file);
      stamps.set(file, { mtimeMs: info.mtimeMs, size: info.size });
    } catch {
      stamps.set(file, null);
    }
  }
  return stamps;
};

/**
 * Czy kompilator w ogóle coś zrobił.
 *
 * Czysta funkcja nad dwoma stanami stempli, żeby ten dowód dało się złamać
 * testem, który niczego nie buduje.
 *
 * PRZEPISANY, NIE „PÓŹNIEJSZY", i ta różnica została znaleziona przez test:
 * stempel z przyszłości (przestawiony zegar, plik z archiwum) po prawdziwej
 * przebudowie dostaje mtime WCZEŚNIEJSZY niż miał. Warunek `>` uznawał to za
 * brak przebudowy i harness przerywał poprawny przebieg — czyli przyrząd mylił
 * się w stronę fałszywego alarmu, ale mylił się. Liczy się KAŻDA zmiana.
 * Rozmiar sprawdzany osobno, bo system plików o grubszym zegarze potrafi
 * zapisać stempel w tej samej chwili, w której go czytaliśmy.
 */
export const rebuildHappened = (before, after) => {
  const rewritten = [];
  for (const [file, next] of after) {
    const previous = before.get(file);
    if (next === null) continue;
    if (
      previous === undefined ||
      previous === null ||
      next.mtimeMs !== previous.mtimeMs ||
      next.size !== previous.size
    )
      rewritten.push(file);
  }
  return { proven: rewritten.length > 0, rewritten };
};

/**
 * Werdykt jednej fazy złamania — czysty, bo to jest ta część, którą najłatwiej
 * napisać źle i najtrudniej zauważyć.
 *
 * `expectRedContains` (opcjonalne) to fragmenty, które MUSZĄ stać w wyjściu
 * czerwonego przebiegu. Po co, skoro kod wyjścia już jest czerwony: bo czerwień
 * bywa NADOKREŚLONA. Złamanie, które zapala dwie niezależne asercje naraz, ma
 * ten sam kod wyjścia co złamanie zapalające tę jedną, o którą chodziło — a
 * kiedy ta druga zniknie (bo ktoś przepisał przyrząd), trzy liczby nadal
 * wyglądają na dowód. Fragment przypina czerwień do NAZWANEJ asercji. Pole
 * NIEOBECNE nie zmienia niczego: każdy istniejący `break-*.mjs` znaczy dokładnie
 * to, co znaczył.
 *
 * `expect` ma DWA legalne kształty i to rozróżnienie jest treścią, nie
 * formalnością:
 *
 *   "assertion-fails" — złamanie MA SIĘ SKOMPILOWAĆ i ma zapalić asercję.
 *                       Kompilator, który je odrzuca, daje czerwień z INNEGO
 *                       powodu niż badany, więc taki przebieg jest przerwany,
 *                       a nie zaliczony. Break-test czerwony nie z tego powodu
 *                       co trzeba nie dowodzi niczego o asercji.
 *   "build-refuses"   — dowodem JEST odmowa kompilatora (np. totalny `Record`
 *                       bez ramienia, TS2741). Wtedy udana budowa to porażka:
 *                       typ przepuścił to, co miał odrzucić.
 */
export const classifyBreakOutcome = ({
  expect,
  buildOk,
  verifyOk,
  output = "",
  expectRedContains = [],
}) => {
  if (expect === "build-refuses")
    return buildOk
      ? {
          verdict: "failed",
          reason: "the compiler accepted a break it was supposed to refuse",
        }
      : { verdict: "passed", reason: "the compiler refused the break" };
  if (!buildOk)
    return {
      verdict: "aborted",
      reason:
        "the break did not compile, so any red comes from the compiler and " +
        'not from the assertion under test; declare `expect: "build-refuses"` ' +
        "if that is the proof you meant",
    };
  if (verifyOk)
    return {
      verdict: "failed",
      reason: "the assertion stayed green on broken code",
    };
  const absent = expectRedContains.filter(
    (fragment) => !output.includes(fragment),
  );
  if (absent.length > 0)
    return {
      verdict: "failed",
      reason:
        "the run went red, but WITHOUT the message this break names " +
        `(${absent.map((fragment) => `„${fragment}"`).join(", ")}) — so the ` +
        "red belongs to some other assertion and proves nothing about this one",
    };
  return {
    verdict: "passed",
    reason:
      expectRedContains.length === 0
        ? "the assertion went red on broken code"
        : "the named assertion went red on broken code",
  };
};

const run = ({ command, args, cwd, env }) => {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined) throw result.error;
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

/**
 * Zapisz tekst i UPEWNIJ SIĘ, że plik jest młodszy niż każdy stempel budowy.
 *
 * To jest ta połowa, przez którą zatruty stan przestaje być osiągalny.
 * Zapisanie treści nadaje świeży mtime w normalnym przypadku, ale „normalny
 * przypadek" jest dokładnie tym, na czym harness fali D się przejechał — więc
 * nierówność jest tu SPRAWDZANA, a nie zakładana, i wymuszana, kiedy nie
 * zachodzi.
 */
const writeSourceNewerThanStamps = (file, text, stampFiles) => {
  writeFileSync(file, text);
  const newestStamp = [...readBuildStamps(stampFiles).values()].reduce(
    (newest, stamp) =>
      stamp === null ? newest : Math.max(newest, stamp.mtimeMs),
    0,
  );
  if (statSync(file).mtimeMs > newestStamp) return;
  const when = newestStamp / 1000 + REBUILD_CLOCK_MARGIN_SECONDS;
  utimesSync(file, when, when);
  if (statSync(file).mtimeMs <= newestStamp)
    throw new Error(
      `cannot make ${file} newer than the newest build stamp; a rebuild ` +
        "would no-op and every later test would run against poisoned dist",
    );
};

/**
 * Ostatnie niepuste wiersze wyjścia sprawdzenia — dowód dołączany do odmowy.
 *
 * Bramki tego repozytorium kończą listą problemów, więc ogon jest tą częścią,
 * która mówi CO padło. Limit jest po to, żeby komunikat błędu dało się
 * przeczytać, a nie żeby coś ukryć: pełne wyjście stoi w pliku, do którego
 * wołający przekierował przebieg.
 */
const tailOf = (output, lines = 20) => {
  const kept = output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .slice(-lines);
  return kept.length === 0
    ? "  (sprawdzenie nie napisało ani jednego wiersza)"
    : kept.map((line) => `  ${line}`).join("\n");
};

const readBack = (file) => readFileSync(file, "utf8");

/**
 * Pętla break-testów.
 *
 * `breaks` to lista `{ name, file, edit, expect, expectRedContains }`, gdzie
 * `edit` dostaje oryginalny tekst i zwraca zepsuty. Tekst identyczny z oryginałem jest
 * PRZERWANIEM, nie przejściem: regexp, który nie trafił, to najczęstszy powód,
 * dla którego break-test wraca zielony, a lot fali D miał trzy takie naraz.
 */
export const runBreakTests = ({
  root,
  build,
  verify,
  breaks,
  stampFiles = buildStampFiles(root),
  log = console.log,
}) => {
  if (stampFiles.length === 0)
    throw new Error(
      `no tsBuildInfoFile found under ${path.join(root, "packages")}; the ` +
        "rebuild proof would be vacuous",
    );

  const rebuild = (phase, proofRequired) => {
    const before = readBuildStamps(stampFiles);
    const result = run({ ...build, cwd: root });
    const proof = rebuildHappened(before, readBuildStamps(stampFiles));
    if (proofRequired && !proof.proven)
      throw new Error(
        `${phase}: the build changed no build stamp, so the compiler did ` +
          "nothing and dist still holds the previous source. This is the " +
          "no-op rebuild that makes a break-test report green on deleted code.",
      );
    return result;
  };

  const originals = new Map();
  const restoreEverything = () => {
    let restored = false;
    for (const [file, text] of originals)
      if (readBack(file) !== text) {
        writeSourceNewerThanStamps(file, text, stampFiles);
        restored = true;
      }
    // Przebieg, który padł w środku, zostawiłby `dist/` zbudowany ze złamania.
    // Źródło jest już młodsze od każdego stempla, więc ta przebudowa NIE MOŻE
    // być no-opem — i dokładnie dlatego wolno ją tu zrobić bez dowodu.
    if (restored) run({ ...build, cwd: root });
  };

  /**
   * BAZA JEST MIERZONA DLA KAŻDEGO SPRAWDZENIA, KTÓRE ZESTAW NAPRAWDĘ WOŁA.
   *
   * Złamanie z własnym `verify` (np. konformans w kernelu zamiast testu
   * interakcyjnego) było dotąd porównywane z bazą zmierzoną na sprawdzeniu
   * DOMYŚLNYM — a wiersz wyjścia i tak zaczynał się od zaszytego „baseline
   * GREEN". Dwie liczby zmierzone i jedna wpisana, w skrypcie, którego własny
   * komentarz obiecuje trzy obserwacje.
   *
   * Zestawy bez per-złamaniowego `verify` mierzą dokładnie jedną bazę, tak jak
   * przedtem: mapa ma wtedy jeden klucz, a `throw` poniżej gwarantuje, że
   * jedyną wartością, jaką da się z niej odczytać, jest „GREEN".
   *
   * Wolno to wołać tylko przy nietkniętym drzewie — czyli przed pierwszym
   * złamaniem albo po przywróceniu, kiedy `dist` jest już przebudowany.
   */
  const baselines = new Map();
  const baselineFor = (check, whose) => {
    const key = JSON.stringify([check.command, check.args]);
    const seen = baselines.get(key);
    if (seen !== undefined) return seen;
    const result = run({ ...check, cwd: root });
    if (!result.ok)
      throw new Error(
        `baseline is not green before the first break${whose}; ` +
          "a break-test loop starting from red proves nothing about any break in it",
      );
    baselines.set(key, "GREEN");
    return "GREEN";
  };

  const results = [];
  try {
    log("baseline: building and running the assertions before any break");
    run({ ...build, cwd: root });
    log(`baseline ${baselineFor(verify, "")}`);

    for (const entry of breaks) {
      const file = path.resolve(root, entry.file);
      const original = originals.get(file) ?? readBack(file);
      originals.set(file, original);
      const broken = entry.edit(original);
      if (broken === original)
        throw new Error(
          `${entry.name}: the edit produced text identical to the original, ` +
            "so nothing was broken and a green run means nothing",
        );

      // DOWÓD PRZEBUDOWY DOTYCZY PLIKÓW, KTÓRE SIĘ KOMPILUJĄ. Skrypt `.mjs`
      // nie ma `dist/`, więc nie ma czego zatruć — i żądanie stempla zrobiłoby
      // z harnessu narzędzie, którym nie da się przetestować własnego
      // oprzyrządowania. Żeby to nie stało się furtką z powrotem do defektu,
      // rozstrzyga ROZSZERZENIE PLIKU, a nie deklaracja wołającego.
      const compiled = /\.(?:ts|tsx|mts|cts)$/u.test(file);
      // NA NIETKNIĘTYM DRZEWIE, więc przed zapisem złamania: jeśli to złamanie
      // niesie własne sprawdzenie, jego baza nie została jeszcze zmierzona.
      const baselinePhase = baselineFor(
        entry.verify ?? verify,
        ` for the check \`${entry.name}\` brings of its own`,
      );
      writeSourceNewerThanStamps(file, broken, stampFiles);
      const brokenBuild = rebuild(`${entry.name} (break)`, compiled);
      const expect = entry.expect ?? "assertion-fails";
      const verifyResult = brokenBuild.ok
        ? run({ ...(entry.verify ?? verify), cwd: root })
        : { ok: false, status: null, stdout: "", stderr: "" };
      const outcome = classifyBreakOutcome({
        expect,
        buildOk: brokenBuild.ok,
        verifyOk: verifyResult.ok,
        // OBA STRUMIENIE. Bramki tego repozytorium piszą część werdyktów na
        // stdout, a listę problemów na stderr — grep po jednym z nich
        // meldowałby brak fragmentu, który stoi w drugim.
        output: `${verifyResult.stdout}${verifyResult.stderr}`,
        expectRedContains: entry.expectRedContains,
      });

      // PRZYWRÓCENIE JEST BEZWARUNKOWE i dzieje się przed oceną werdyktu:
      // przebieg, który pada w środku, nie ma prawa zostawić repozytorium
      // z zepsutym źródłem ani z zatrutym `dist`.
      writeSourceNewerThanStamps(file, original, stampFiles);
      rebuild(`${entry.name} (restore)`, compiled);
      const restored = run({ ...(entry.verify ?? verify), cwd: root });
      // TRZY LICZBY, każda z tego, co naprawdę zaobserwowano — nie z werdyktu.
      // Para „baza/złamanie" nie widzi zatrucia, bo zatrucie zaczyna się przy
      // przywróceniu, więc trzecia liczba jest tą, dla której to się drukuje.
      //
      // DRUKOWANE PRZED PRZERWANIAMI PONIŻEJ, nie po nich: przebieg, który pada
      // na czerwonym przywróceniu, jest dokładnie tym, w którym czytelnik
      // potrzebuje zobaczyć „restore RED". Drukowane za `throw`, ta liczba
      // umiała przyjąć tylko jedną wartość i była literałem w przebraniu.
      const brokenPhase = !brokenBuild.ok
        ? "BUILD REFUSED"
        : verifyResult.ok
          ? "GREEN"
          : "RED";
      log(
        `${entry.name}: baseline ${baselinePhase} → break ${brokenPhase} →` +
          ` restore ${restored.ok ? "GREEN" : "RED"}` +
          ` — ${outcome.verdict.toUpperCase()} (${outcome.reason})`,
      );
      // TEKST WRACA BAJT W BAJT — sprawdzane NA KOŃCU obiegu, nie zaraz po
      // zapisie. Zaraz po zapisie ta asercja nie umie paść na żadnym systemie
      // plików, na którym to repozytorium chodzi, czyli byłaby ozdobą. Na
      // końcu łapie realną rzecz: budowę albo weryfikację, która sama pisze po
      // źródle (formater, generator), przez co następne złamanie startowałoby
      // z innego tekstu, niż myśli, że startuje.
      //
      // PRZED PRZERWANIEM O CZERWONYM PRZYWRÓCENIU, bo weryfikacja pisząca po
      // źródle jest jedną z przyczyn takiej czerwieni — a wtedy diagnoza
      // „przywrócenie nie doszło do dist" wskazuje nie tam, gdzie trzeba.
      if (readBack(file) !== original)
        throw new Error(
          `${entry.name}: ${file} does not match the text it started with. ` +
            "Something in this break's own loop wrote to it, so the next " +
            "break would start from a different file than it believes.",
        );
      if (!restored.ok)
        throw new Error(
          `${entry.name}: the assertions are RED after the restore. Either ` +
            "the restore did not reach dist, or an earlier break left it " +
            "poisoned. Nothing after this point would mean anything." +
            // ── DIAGNOZA NIESIE POMIAR, NIE SAMĄ HIPOTEZĘ ────────────────────
            // Dopisane przy naprawie lotu L8 (2026-08-15), po przebiegu,
            // w którym ten `throw` padł nad plikiem `.css` — a więc nad
            // przywróceniem, którego `dist` NIE MOŻE zatruć, bo bramka układu
            // czyta arkusz z serwera dev, nie z paczki. Obie nazwane przyczyny
            // były wtedy niemożliwe, dowodu nie było żadnego, a ponowny
            // przelot tego samego drzewa wrócił zielony. Komunikat, który
            // wymienia dwie hipotezy i nie pokazuje ANI JEDNEGO wiersza
            // czerwieni, wysyła czytelnika w stronę `dist` także wtedy, gdy
            // czerwień jest gdzie indziej — a wtedy „nic dalej nie znaczy nic"
            // przerywa cały zestaw bez podania powodu.
            //
            // Dlatego ogon wyjścia przywrócenia idzie do komunikatu. Ogon,
            // a nie całość: przelot bramki to setki tysięcy znaków, a lista
            // problemów stoi zawsze na jego końcu.
            `\n\nOstatnie wiersze przywrócenia (${restored.status === null ? "brak kodu wyjścia" : `kod wyjścia ${restored.status}`}):\n` +
            tailOf(`${restored.stdout}${restored.stderr}`),
        );

      if (outcome.verdict === "aborted")
        throw new Error(`${entry.name}: ${outcome.reason}`);
      results.push({ name: entry.name, ...outcome });
    }
  } finally {
    restoreEverything();
  }

  const failed = results.filter((result) => result.verdict !== "passed");
  return { results, failed, ok: failed.length === 0 };
};
