// Testy bramy renderera — bez Electrona i bez przeglądarki, bo defekt, którego
// pilnują, nie jest w Electronie. Jest w KOLEJNOŚCI, w jakiej pętla dev robi
// trzy rzeczy, i w tym, co uznaje za „bundle jest gotowy".
//
// Każdy z tych testów ma paść na logice sprzed naprawy. Ta poprzednia logika
// nie miała bramy w ogóle, więc jej dwie możliwe kopie to:
//   • „start od razu" — pada test kolejności niżej;
//   • „sprawdź, czy `index.html` istnieje" — pada test o bundlu sprzed
//     watchera, bo w chwili startu plik ISTNIEJE i jest kompletny.
// Oba złamania są uruchamiane przez `scripts/break-dev-tooling.mjs`.
//
// Testy nad modułem mierzą go z wstrzykniętymi atrapami, więc SAME W SOBIE nie
// widzą, czy pętla dev przez tę bramę przechodzi. Dlatego na końcu pliku stoi
// test czytający `scripts/dev-desktop.mjs` — plik, w którym defekt mieszkał.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  WITHOUT_PRE_WATCH_STAMP,
  bundleVerdict,
  createRestartLedger,
  readBundleStamp,
  referencedAssets,
  startAfterRebuiltBundle,
  waitForRebuiltBundle,
} from "./dev-renderer-gate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const INDEX = [
  '<!doctype html><html><head><link rel="icon" href="./favicon.svg" />',
  '<script type="module" crossorigin src="./assets/index-C2HUXfvH.js"></script>',
  '<link rel="modulepreload" crossorigin href="./assets/react-BhjfaixL.js">',
  '<link rel="stylesheet" crossorigin href="./assets/index-CUNNmBD0.css">',
  '<script src="https://example.invalid/analytics.js"></script>',
  '</head><body><div id="root"></div></body></html>',
].join("\n");

/** Zapisz `dist/` o zadanej kompletności i oddaj jego ścieżkę. */
const writeDist = ({ complete }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "renderer-dist-"));
  fs.mkdirSync(path.join(directory, "assets"));
  fs.writeFileSync(path.join(directory, "index.html"), INDEX);
  fs.writeFileSync(path.join(directory, "favicon.svg"), "<svg/>");
  const assets = [
    "assets/index-C2HUXfvH.js",
    "assets/react-BhjfaixL.js",
    "assets/index-CUNNmBD0.css",
  ];
  for (const asset of complete ? assets : assets.slice(0, 1))
    fs.writeFileSync(path.join(directory, asset), "// chunk");
  return directory;
};

test("only local references count as bundle files", () => {
  const assets = referencedAssets(INDEX);
  assert.deepEqual(assets, [
    "favicon.svg",
    "assets/index-C2HUXfvH.js",
    "assets/react-BhjfaixL.js",
    "assets/index-CUNNmBD0.css",
  ]);
  // Odwołanie zdalne nie jest częścią bundla, więc jego brak na dysku nie może
  // wstrzymać startu.
  assert.equal(
    assets.some((asset) => asset.includes("example.invalid")),
    false,
  );
});

test("the bundle the pre-watch build left behind is NOT ready", () => {
  // TO JEST TEN TEST. Zmierzone: przez pierwsze 463 ms po uruchomieniu
  // watchera `dist/` z poprzedniego `npm run build` jest obecny i kompletny —
  // a potem znika na 106 ms. Brama pytająca „czy plik jest" przepuszcza tutaj
  // i Electron ląduje w ERR_FILE_NOT_FOUND.
  const directory = writeDist({ complete: true });
  try {
    const baseline = readBundleStamp(directory);
    assert.equal(baseline.present, true);
    assert.deepEqual(baseline.missingAssets, []);

    const verdict = bundleVerdict(baseline, readBundleStamp(directory));
    assert.equal(verdict.ready, false);
    assert.match(verdict.reason, /pre-watch build/u);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("an emptied dist and a half-written one are both refused, by name", () => {
  const directory = writeDist({ complete: true });
  const baseline = readBundleStamp(directory);
  try {
    fs.rmSync(path.join(directory, "index.html"));
    const gone = bundleVerdict(baseline, readBundleStamp(directory));
    assert.equal(gone.ready, false);
    assert.match(gone.reason, /not on disk/u);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }

  const partial = writeDist({ complete: false });
  try {
    const verdict = bundleVerdict(
      { present: false, mtimeMs: 0, size: 0, missingAssets: [] },
      readBundleStamp(partial),
    );
    assert.equal(verdict.ready, false);
    // Nazwa brakującego pliku, nie sama liczba: bez niej czytelnik nie wie,
    // czy czeka na renderer, czy na coś zepsutego.
    assert.match(verdict.reason, /assets\/react-BhjfaixL\.js/u);
  } finally {
    fs.rmSync(partial, { recursive: true, force: true });
  }
});

test("a rewritten, complete bundle is ready", () => {
  const directory = writeDist({ complete: true });
  try {
    const baseline = readBundleStamp(directory);
    // Przepisanie tym samym rozmiarem, ale innym stemplem — dokładnie to robi
    // watcher, kiedy nic w źródłach się nie zmieniło.
    const when = baseline.mtimeMs / 1000 + 5;
    fs.utimesSync(path.join(directory, "index.html"), when, when);
    const verdict = bundleVerdict(baseline, readBundleStamp(directory));
    assert.equal(verdict.ready, true, verdict.reason);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("the wait resolves on the event that makes the bundle fresh, not before", async () => {
  let fresh = false;
  const listeners = [];
  const probe = () =>
    fresh
      ? { ready: true, reason: "rebuilt" }
      : { ready: false, reason: "index.html is not on disk" };
  const waiting = waitForRebuiltBundle({
    probe,
    subscribe: (notify) => {
      listeners.push(notify);
      return () => listeners.splice(listeners.indexOf(notify), 1);
    },
    timeoutMs: 5_000,
  });
  let settled = false;
  void waiting.then(() => {
    settled = true;
  });

  // Zdarzenie, po którym bundle NADAL nie jest gotowy, nie może zwolnić bramy.
  for (const notify of listeners) notify();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);

  fresh = true;
  for (const notify of listeners) notify();
  const verdict = await waiting;
  assert.equal(verdict.ready, true);
  // Subskrypcja zamknięta, inaczej pętla dev zostawiłaby żywy watcher i
  // interwał na każdy start.
  assert.equal(listeners.length, 0);
});

test("a bundle that never arrives fails loudly with the last reason", async () => {
  await assert.rejects(
    waitForRebuiltBundle({
      probe: () => ({
        ready: false,
        reason: "index.html is still the one the pre-watch build left behind",
      }),
      subscribe: () => () => {},
      timeoutMs: 20,
    }),
    (error) => {
      assert.match(error.message, /was not rebuilt within 20 ms/u);
      assert.match(error.message, /pre-watch build/u);
      // Powiedzenie, że Electron NIE wystartował, jest częścią diagnozy:
      // inaczej czytelnik szuka okna, którego nigdy nie było.
      assert.match(error.message, /Electron was not started/u);
      return true;
    },
  );
});

test("Electron is not started while the bundle is still building", async () => {
  // TO JEST TEST KOLEJNOŚCI — ten, który pada na logice sprzed naprawy,
  // gdzie start Electrona był zwykłym kolejnym wierszem po uruchomieniu
  // watcherów.
  let started = 0;
  let release;
  const sequence = startAfterRebuiltBundle({
    wait: () =>
      new Promise((resolve) => {
        release = () => resolve({ ready: true, reason: "rebuilt" });
      }),
    start: () => {
      started += 1;
    },
  });
  // Kilka obrotów pętli zdarzeń: gdyby start był synchroniczny albo nie czekał
  // na obietnicę, licznik już by się ruszył.
  for (let turn = 0; turn < 5; turn += 1)
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, 0);

  release();
  const outcome = await sequence;
  assert.equal(started, 1);
  assert.equal(outcome.started, true);
});

test("a dev loop torn down while waiting never starts Electron", async () => {
  let started = 0;
  const outcome = await startAfterRebuiltBundle({
    wait: async () => ({ ready: true, reason: "rebuilt" }),
    start: () => {
      started += 1;
    },
    abandoned: () => true,
  });
  assert.equal(started, 0);
  assert.equal(outcome.started, false);
  assert.match(outcome.reason, /torn down/u);
});

test("a torn-down loop stops waiting at once instead of sitting out the timeout", async () => {
  // Zmierzalna ścieżka, nie hipoteza: kiedy watcher renderera pada przy
  // starcie, `dev-desktop.mjs` wypisuje „Tearing down the dev loop" i woła
  // `stop()`. Brama nieznająca tego stanu milczałaby jeszcze przez 60 sekund.
  let stopped = false;
  const listeners = [];
  const waiting = waitForRebuiltBundle({
    probe: () => ({ ready: false, reason: "index.html is not on disk" }),
    subscribe: (notify) => {
      listeners.push(notify);
      return () => listeners.splice(listeners.indexOf(notify), 1);
    },
    abandoned: () => stopped,
    // Sufit jest tu po to, żeby ODMOWA MIAŁA INNĄ TREŚĆ, kiedy ta asercja
    // zostanie złamana: brama bez `abandoned` doczeka do sufitu i odmówi
    // słowami o nieprzebudowanym bundlu, a nie o rozebranej pętli. Poprawna
    // wersja nie dotyka go nigdy — odmawia na pierwszym zdarzeniu.
    timeoutMs: 1_000,
  });
  stopped = true;
  for (const notify of listeners) notify();
  await assert.rejects(waiting, (error) => {
    assert.match(error.message, /torn down/u);
    assert.match(error.message, /Electron was never started/u);
    return true;
  });
  assert.equal(listeners.length, 0);
});

test("waiting is not silent: the current reason is reported while it lasts", async () => {
  const reported = [];
  await assert.rejects(
    waitForRebuiltBundle({
      probe: () => ({
        ready: false,
        reason: "index.html is not on disk",
      }),
      subscribe: () => () => {},
      report: (reason, waited) => reported.push([reason, waited]),
      progressIntervalMs: 5,
      timeoutMs: 60,
    }),
    /was not rebuilt within 60 ms/u,
  );
  assert.equal(reported.length > 0, true);
  assert.deepEqual(reported[0], ["index.html is not on disk", 5]);
  // Czas rośnie, więc czytelnik widzi, JAK DŁUGO to trwa, a nie tylko że trwa.
  assert.equal(reported.at(-1)[1] > reported[0][1], true);
});

test("the restart baseline refuses an emptied dist without demanding a rewrite", () => {
  // Zmiana WYŁĄCZNIE w procesie głównym nie przepisuje renderera. Brama
  // restartu żądająca ŚWIEŻOŚCI czekałaby więc na przepisanie, którego nie
  // będzie, aż do sufitu czasu — nad pętlą, która ma tylko wymienić okno.
  const whole = writeDist({ complete: true });
  try {
    const ready = bundleVerdict(
      WITHOUT_PRE_WATCH_STAMP,
      readBundleStamp(whole),
    );
    assert.equal(ready.ready, true, ready.reason);

    fs.rmSync(path.join(whole, "index.html"));
    const emptied = bundleVerdict(
      WITHOUT_PRE_WATCH_STAMP,
      readBundleStamp(whole),
    );
    assert.equal(emptied.ready, false);
    assert.match(emptied.reason, /not on disk/u);
  } finally {
    fs.rmSync(whole, { recursive: true, force: true });
  }

  const partial = writeDist({ complete: false });
  try {
    const verdict = bundleVerdict(
      WITHOUT_PRE_WATCH_STAMP,
      readBundleStamp(partial),
    );
    assert.equal(verdict.ready, false);
    assert.match(verdict.reason, /assets\/react-BhjfaixL\.js/u);
  } finally {
    fs.rmSync(partial, { recursive: true, force: true });
  }
});

test("a restart request arriving mid-restart is refused, not left behind", () => {
  const ledger = createRestartLedger();
  assert.equal(ledger.request(), true);
  assert.equal(ledger.claim(), true);

  // Watcher procesu głównego odpalił drugi raz, kiedy brama restartu jeszcze
  // czeka na renderer. Zapisane żądanie dotyczyłoby procesu, który JUŻ NIE
  // ŻYJE, więc nikt by go nie zużył.
  assert.equal(ledger.request(), false);
  // I to jest cała zawartość defektu: pierwsze PRAWDZIWE wyjście następnego
  // okna przeczytałoby taką flagę jako „to był restart" i wstało po cichu
  // zamiast zwinąć pętlę dev.
  assert.equal(ledger.claim(), false);

  ledger.settle();
  assert.equal(ledger.request(), true);
  assert.equal(ledger.claim(), true);
});

test("an exit nobody asked for is never claimed as a restart", () => {
  assert.equal(createRestartLedger().claim(), false);
});

test("the dev loop starts Electron only through the gate, on BOTH paths", () => {
  // TEN TEST CZYTA PLIK, W KTÓRYM DEFEKT MIESZKAŁ. Cała reszta tego pliku
  // mierzy moduł bramy z wstrzykniętymi atrapami, więc jest ślepa na to, czy
  // pętla dev przez tę bramę w ogóle przechodzi: implementacja, która kasuje
  // wywołanie bramy i wpisuje w to miejsce `startElectron();`, przechodziła
  // KOMPLET pozostałych asercji. To jest znana tu klasa „zdolność, której nic
  // nie montuje".
  const source = fs.readFileSync(path.join(here, "dev-desktop.mjs"), "utf8");

  // Żadnego gołego wywołania: `startElectron` wolno wyłącznie ODDAĆ bramie.
  assert.equal(
    /(?<![\w.])startElectron\s*\(/u.test(source),
    false,
    "scripts/dev-desktop.mjs calls startElectron directly somewhere, which is the pre-fix logic itself",
  );
  assert.match(source, /start: startElectron,/u);

  // Dwie ścieżki startu, obie przez tę samą bramę: pierwszy start i restart
  // po przebudowie procesu głównego.
  assert.equal(
    [...source.matchAll(/startWhenBundleIsWhole\(/gu)].length,
    2,
    "scripts/dev-desktop.mjs no longer has exactly two gated start paths",
  );
  assert.match(source, /startWhenBundleIsWhole\(bundleBeforeWatch\)/u);

  const restartBranch = /if \(restarts\.claim\(\)\) \{([\s\S]*?)\n {4}\}/u.exec(
    source,
  );
  assert.notEqual(
    restartBranch,
    null,
    "scripts/dev-desktop.mjs no longer has a restart branch in the exit listener",
  );
  assert.match(
    restartBranch[1],
    /startWhenBundleIsWhole\(WITHOUT_PRE_WATCH_STAMP\)/u,
  );

  // Żądanie restartu przechodzi przez księgę, a nie przez gołą flagę — inaczej
  // wraca wyciek, który przy bramie trwającej sekundy jest osiągalny.
  const requestBody = /const requestRestart = \(\) => \{([\s\S]*?)\n\};/u.exec(
    source,
  );
  assert.notEqual(requestBody, null);
  assert.match(requestBody[1], /restarts\.request\(\)/u);
});
