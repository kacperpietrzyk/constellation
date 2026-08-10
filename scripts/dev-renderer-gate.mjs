// Brama, przez którą Electron nie wchodzi w okno, w którym renderer nie
// istnieje.
//
// ZMIERZONY DEFEKT (2026-08-10, ten worktree, zapis z osi czasu jednego
// przebiegu `desktop-ui build --watch` od chwili spawnu):
//
//     +0 ms     `npm run build` zostawił KOMPLETNY `dist/`
//     +190 ms   vite: „building client environment for production…"
//     +463 ms   `index.html` WCIĄŻ JEST, ze starym mtime — ale plików
//               `assets/*`, do których się odwołuje, JUŻ NIE MA
//     +467 ms   `index.html` znika (ENOENT)
//     +569 ms   `index.html` wraca, mtime nowy, wszystkie assety na dysku
//
// Czyli: 106 ms, w których `dist/` jest niekompletny albo pusty, a przed nimi
// 463 ms, w których wygląda IDEALNIE — bo to jeszcze poprzedni build.
// `scripts/dev-desktop.mjs` startował Electrona w chwili 0. Zmierzone: trzy
// starty z rzędu padły na `ERR_FILE_NOT_FOUND (-6) loading index.html`, a
// czwarty przeszedł, bo trafił poza okno.
//
// DLACZEGO SAMO „CZY PLIK JEST" TO TEN SAM DEFEKT W PRZEBRANIU. Sprawdzenie
// istnienia — a nawet istnienia razem z kompletem assetów — jest spełnione
// przez `dist/` z chwili +0 ms, czyli przez bundle, który watcher zaraz skasuje.
// Brama musi odpowiadać NIE na pytanie „czy coś tam leży", tylko na pytanie
// „czy to jest wynik przebudowy, która już się skończyła".
//
// Stąd dwa warunki, oba konieczne i żaden z nich nie jest odczekaniem:
//
//   ŚWIEŻOŚĆ    — `index.html` musi być PRZEPISANY względem stempla zdjętego
//                 po `npm run build`, a przed uruchomieniem watchera. To zabija
//                 przejście na starym bundlu.
//   KOMPLETNOŚĆ — każdy lokalny plik, do którego `index.html` się odwołuje, ma
//                 leżeć na dysku. To zabija przejście na bundlu zapisanym
//                 w połowie.
//
// „Przepisany", nie „nowszy": stempel z przyszłości (przestawiony zegar, plik
// z archiwum) po prawdziwej przebudowie dostaje mtime WCZEŚNIEJSZY, niż miał.
// Ta sama lekcja co w `break-test.mjs` — liczy się KAŻDA zmiana.

import { existsSync, readFileSync, statSync, watch } from "node:fs";
import path from "node:path";

/** Gdzie renderer ląduje względem korzenia repozytorium. */
export const RENDERER_DIST = path.join("packages", "desktop-ui", "dist");

/**
 * Ile czekać, zanim brama powie, czego zabrakło.
 *
 * Zmierzone wyżej: 569 ms na całą pierwszą przebudowę. Sufit jest o dwa rzędy
 * wielkości wyższy, bo ma łapać awarię, a nie wolną maszynę — i ma paść
 * GŁOŚNO, z nazwą brakującego pliku. Bezterminowe czekanie byłoby tą samą
 * klasą defektu, którą ten plik usuwa: pętla dev, która stoi i nie mówi czemu.
 */
export const BUNDLE_READY_TIMEOUT_MS = 60_000;

/**
 * Lokalne pliki, bez których `index.html` jest bezużyteczny.
 *
 * Bierze wyłącznie odwołania względne (`./…`) — `https://…` nie jest częścią
 * bundla i jego nieobecność na dysku niczego nie znaczy.
 */
export const referencedAssets = (html) => [
  ...new Set(
    [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/gu)].map((match) => match[1]),
  ),
];

/** Stan `dist/` w jednej chwili. Nieobecny `index.html` ma `present: false`. */
export const readBundleStamp = (distDirectory) => {
  const index = path.join(distDirectory, "index.html");
  let info;
  let html;
  try {
    info = statSync(index);
    html = readFileSync(index, "utf8");
  } catch {
    return { present: false, mtimeMs: 0, size: 0, missingAssets: [] };
  }
  const missingAssets = referencedAssets(html).filter(
    (asset) => !existsSync(path.join(distDirectory, asset)),
  );
  return {
    present: true,
    mtimeMs: info.mtimeMs,
    size: info.size,
    missingAssets,
  };
};

/**
 * Czy wolno uruchomić Electrona.
 *
 * Czysta funkcja nad dwoma stemplami, żeby cała treść bramy dała się złamać
 * testem, który nie uruchamia ani przeglądarki, ani Electrona.
 */
export const bundleVerdict = (baseline, current) => {
  if (!current.present)
    return {
      ready: false,
      reason:
        "index.html is not on disk; the renderer watcher has emptied dist",
    };
  if (current.size === 0)
    return { ready: false, reason: "index.html is empty" };
  if (
    baseline.present &&
    current.mtimeMs === baseline.mtimeMs &&
    current.size === baseline.size
  )
    return {
      ready: false,
      reason:
        "index.html is still the one the pre-watch build left behind, so the " +
        "watcher has not rewritten it yet and is about to delete it",
    };
  if (current.missingAssets.length > 0)
    return {
      ready: false,
      reason: `index.html references ${current.missingAssets.length} file(s) the watcher has not written yet, starting with ${current.missingAssets[0]}`,
    };
  return {
    ready: true,
    reason:
      "the renderer watcher rewrote index.html and every file it references is on disk",
  };
};

/**
 * Powiadamiaj o KAŻDEJ zmianie w `dist/`.
 *
 * `fs.watch` jest sygnałem; interwał NIE jest odczekaniem ani zapasem — jest
 * ubezpieczeniem od zgubionego zdarzenia, po którym brama spałaby aż do sufitu
 * czasu. Werdykt i tak liczy się z dysku, więc obudzenie bez powodu nie może
 * niczego przepuścić.
 */
export const subscribeToBundle = (distDirectory, notify) => {
  const watcher = watch(distDirectory, { recursive: true }, () => notify());
  const tick = setInterval(notify, 50);
  return () => {
    watcher.close();
    clearInterval(tick);
  };
};

/**
 * Jak często brama mówi, na co jeszcze czeka.
 *
 * Cisza jest tą samą klasą defektu co bezterminowe czekanie: pętla dev stoi,
 * a czytelnik nie wie, czy renderer się buduje, czy się wywrócił. Zmierzone
 * 569 ms na pełną przebudowę, więc pierwszy komunikat po trzech sekundach
 * nigdy nie zobaczy zdrowego startu.
 */
export const BUNDLE_PROGRESS_INTERVAL_MS = 3_000;

/**
 * Czekaj na przebudowany bundle i PADNIJ z nazwą tego, czego zabrakło.
 *
 * `probe` i `subscribe` są wstrzykiwane, bo to jedyny sposób, żeby przebieg
 * testowy sterował chwilą, w której bundle staje się gotowy.
 *
 * `abandoned` jest tu, a nie dopiero po rozwiązaniu obietnicy, i to jest
 * poprawka błędu, który ten plik sam by popełnił: watcher renderera potrafi
 * paść przy starcie (błąd kompilacji, zajęty port), pętla wypisuje wtedy
 * „Tearing down the dev loop" i woła `stop()` — a brama nieznająca tego stanu
 * milczałaby jeszcze przez cały sufit czasu nad rozebraną już pętlą.
 */
export const waitForRebuiltBundle = ({
  probe,
  subscribe,
  timeoutMs = BUNDLE_READY_TIMEOUT_MS,
  abandoned = () => false,
  report = () => {},
  progressIntervalMs = BUNDLE_PROGRESS_INTERVAL_MS,
  timers = { setTimeout, clearTimeout, setInterval, clearInterval },
}) =>
  new Promise((resolve, reject) => {
    let last = probe();
    if (last.ready) {
      resolve(last);
      return;
    }
    let settled = false;
    const finish = (settle, value) => {
      if (settled) return;
      settled = true;
      timers.clearTimeout(timer);
      timers.clearInterval(progress);
      unsubscribe();
      settle(value);
    };
    const evaluate = () => {
      if (settled) return;
      if (abandoned()) {
        finish(
          reject,
          new Error(
            "The dev loop was torn down while the renderer bundle was still " +
              `building (${last.reason}), so Electron was never started.`,
          ),
        );
        return;
      }
      last = probe();
      if (last.ready) finish(resolve, last);
    };
    const timer = timers.setTimeout(
      () =>
        finish(
          reject,
          new Error(
            `The renderer bundle was not rebuilt within ${timeoutMs} ms: ${last.reason}. ` +
              "Electron was not started, because it would have loaded a bundle that is not there.",
          ),
        ),
      timeoutMs,
    );
    let waited = 0;
    const progress = timers.setInterval(() => {
      evaluate();
      if (settled) return;
      waited += progressIntervalMs;
      report(last.reason, waited);
    }, progressIntervalMs);
    const unsubscribe = subscribe(evaluate);
  });

/**
 * Kolejność w jednym miejscu: START DOPIERO PO ZDARZENIU.
 *
 * Wydzielone, bo bez tego jedyną rzeczą, jaką dałoby się przetestować, byłby
 * predykat — a defekt siedział w KOLEJNOŚCI, nie w predykacie, którego wtedy
 * w ogóle nie było.
 */
export const startAfterRebuiltBundle = async ({
  wait,
  start,
  abandoned = () => false,
}) => {
  const verdict = await wait();
  // Ctrl-C w trakcie czekania: pętla jest już rozbierana, więc uruchomienie
  // Electrona zostawiłoby proces, którego nikt nie zamknie.
  if (abandoned())
    return {
      started: false,
      reason:
        "the dev loop was torn down while the renderer bundle was building",
    };
  start();
  return { started: true, reason: verdict.reason };
};
