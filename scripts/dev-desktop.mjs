import { spawn, spawnSync } from "node:child_process";
import { existsSync, watch } from "node:fs";
import path from "node:path";

import {
  RENDERER_DIST,
  WITHOUT_PRE_WATCH_STAMP,
  bundleVerdict,
  createRestartLedger,
  readBundleStamp,
  startAfterRebuiltBundle,
  subscribeToBundle,
  waitForRebuiltBundle,
} from "./dev-renderer-gate.mjs";
import { devStateRoot } from "./dev-state.mjs";
import { NATIVE_SETUP_REMEDY, nativeDriverState } from "./setup-native.mjs";

const RESTART_DEBOUNCE_MS = 300;
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const stateRoot = devStateRoot();

if (
  !existsSync(path.join(stateRoot, "local-alpha-workspace", "key-wrapper.json"))
) {
  console.error("No development snapshot yet. Run: npm run dev:snapshot");
  process.exit(1);
}

// Sprawdzane TUTAJ, a nie zostawione Electronowi: bez tego kroku pętla dev
// pada dopiero przy otwieraniu workspace'u, modalnym oknem bez ani jednej
// szczegółowej informacji. Krok istniał wyłącznie w CI, więc znika po każdym
// `npm install` — a wtedy jedyne, co widać, to nieudany start.
const driver = nativeDriverState(repositoryRoot);
if (!driver.ready) {
  console.error(
    `The desktop development loop needs a native driver, but ${driver.reason}`,
  );
  console.error(NATIVE_SETUP_REMEDY);
  process.exit(1);
}

const build = spawnSync("npm", ["run", "build"], {
  cwd: repositoryRoot,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

// Stempel zdjęty TUTAJ: po pełnej budowie, a przed uruchomieniem watchera
// renderera. To jest jedyna chwila, w której da się zapisać „tak wygląda
// bundle, którego watcher jeszcze nie dotknął" — a bez tego zapisu brama
// niżej byłaby spełniona przez bundle, który za moment zniknie.
const rendererDist = path.join(repositoryRoot, RENDERER_DIST);
const bundleBeforeWatch = readBundleStamp(rendererDist);

// Set once teardown has started, so a child that dies as a *consequence* of
// stop() (killed on purpose) does not report itself as an unexpected failure
// or re-enter stop().
let stopping = false;

const children = [];
const watchProcess = (label, args) => {
  const child = spawn("npm", args, { cwd: repositoryRoot, stdio: "inherit" });
  children.push(child);
  child.once("error", (error) => {
    if (stopping) return;
    console.error(`${label} failed to start: ${error.message}`);
    stop();
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (stopping) return;
    console.error(
      `${label} exited unexpectedly (code ${code ?? "null"}, signal ${
        signal ?? "null"
      }) — rebuilds have stopped. Tearing down the dev loop.`,
    );
    stop();
    process.exitCode = 1;
  });
  return child;
};

watchProcess("tsc -b --watch (main process)", [
  "exec",
  "--",
  "tsc",
  "-b",
  "--watch",
  "--preserveWatchOutput",
]);
watchProcess("desktop-ui build --watch (renderer)", [
  "run",
  "build",
  "-w",
  "@constellation/desktop-ui",
  "--",
  "--watch",
]);

const electronBinary = path.join(
  repositoryRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron",
);
const entry = path.join(
  repositoryRoot,
  "packages",
  "desktop-main",
  "dist",
  "src",
  "dev-main.js",
);

let electron;
// "The current Electron process is being killed on purpose, start a fresh one
// once it's gone" — written by the watcher below, consumed by the single exit
// listener attached in startElectron, never by a listener attached per-restart,
// so at most one listener ever observes a given exit. Why a ledger rather than
// a bare flag: see createRestartLedger.
const restarts = createRestartLedger();
const startElectron = () => {
  electron = spawn(electronBinary, [entry], {
    cwd: repositoryRoot,
    env: { ...process.env, CONSTELLATION_DEV_STATE_ROOT: stateRoot },
    stdio: "inherit",
  });
  electron.once("exit", (code) => {
    if (stopping) return;
    if (restarts.claim()) {
      // RESTART IDZIE PRZEZ TĘ SAMĄ BRAMĘ CO PIERWSZY START. Bez tego okno
      // pustego `dist/` zamykało się wyłącznie dla pierwszego startu: jedna
      // edycja paczki współdzielonej (`@constellation/contracts` jest
      // zależnością i renderera, i procesu głównego) rusza OBA watchery, więc
      // restart trafiał dokładnie w te 106 ms, w których vite opróżnił `dist/`,
      // a `loadFile` oddawało ERR_FILE_NOT_FOUND — i wtedy wychodził cały
      // proces, nie samo okno.
      void startWhenBundleIsWhole(WITHOUT_PRE_WATCH_STAMP)
        .catch(reportGateFailure)
        .finally(() => restarts.settle());
      return;
    }
    stop();
    process.exitCode = code ?? 0;
  });
};

// Brama w JEDNYM miejscu, wołana z obu ścieżek startu. Baseline jest jedyną
// różnicą między nimi i jest opisany przy `WITHOUT_PRE_WATCH_STAMP`.
const startWhenBundleIsWhole = (baseline) =>
  startAfterRebuiltBundle({
    wait: () =>
      waitForRebuiltBundle({
        probe: () => bundleVerdict(baseline, readBundleStamp(rendererDist)),
        subscribe: (notify) => subscribeToBundle(rendererDist, notify),
        abandoned: () => stopping,
        report: (reason, waited) =>
          console.error(
            `Still waiting ${waited / 1000}s for the renderer bundle: ${reason}`,
          ),
      }),
    start: startElectron,
    abandoned: () => stopping,
  });

const reportGateFailure = (error) => {
  console.error(error.message);
  stop();
  process.exitCode = 1;
  return { started: false };
};

let pending;
let mainWatcher;
const stop = () => {
  stopping = true;
  if (pending !== undefined) clearTimeout(pending);
  mainWatcher?.close();
  for (const child of children) child.kill("SIGTERM");
  electron?.kill("SIGTERM");
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

// ELECTRON STARTUJE PO ZDARZENIU, NIE PO CZASIE. `desktop-ui build --watch`
// opróżnia `dist/` i buduje od nowa, więc przez ~100 ms `index.html` nie
// istnieje — a przez ~460 ms przed tym leży tam KOMPLETNY bundle z poprzedniej
// budowy, który każdą bramę „czy plik jest" spełnia. Zmierzone: trzy starty
// z rzędu padały na `ERR_FILE_NOT_FOUND (-6)`. Warunki i pomiar:
// `scripts/dev-renderer-gate.mjs`.
const started =
  await startWhenBundleIsWhole(bundleBeforeWatch).catch(reportGateFailure);
// Electron nie wstał — albo brama padła, albo ktoś nacisnął Ctrl-C w trakcie
// czekania. W obu wypadkach nie ma czego pilnować, a założenie watchera
// procesu głównego trzymałoby przy życiu pętlę bez okna.
if (!started.started) process.exit(process.exitCode ?? 0);

// A renderer change is picked up by dev-main's own watcher; only main-process
// output needs the window torn down and rebuilt. Measured: an idle
// `tsc -b --watch` emits nothing here over 15 seconds, so this does not storm.
//
// A second rebuild landing while a restart is already in flight collapses into
// it: requestRestart only ever records in the ledger and re-signals whatever
// `electron` currently points at, and the one exit listener that matters is the
// single one startElectron attached when that process was spawned — so a
// repeated debounce firing can re-send SIGTERM but can never attach a second
// listener to the same exit. Once the ledger has handed the restart out, a
// further request is refused rather than recorded, because the spawn it would
// be asking for has not happened yet and will carry the same rebuilt output.
const requestRestart = () => {
  if (restarts.request()) electron?.kill("SIGTERM");
};
mainWatcher = watch(
  path.join(repositoryRoot, "packages", "desktop-main", "dist", "src"),
  { recursive: true },
  (_event, filename) => {
    if (filename !== null && !filename.endsWith(".js")) return;
    if (pending !== undefined) clearTimeout(pending);
    pending = setTimeout(requestRestart, RESTART_DEBOUNCE_MS);
  },
);
