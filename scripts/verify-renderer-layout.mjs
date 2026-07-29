// Pomiar UKŁADU renderera w prawdziwym silniku, lokalnie.
//
// Po co, skoro jest happy-dom: happy-dom NIE LICZY UKŁADU. Asercja o szerokości
// wygląda tam na pomiar, nie będąc nim. A dwie rzeczy, które psują ekran
// najczęściej — skalowanie tekstu do 200% i wąskie okno — objawiają się
// wyłącznie geometrią. Ten skrypt złapał przepełnienie nagłówka Kalendarza
// (612 px treści w pudełku 584 px), które inaczej wyszłoby dopiero z paczkowanego
// smoke'a: dwadzieścia minut i trzy systemy naraz.
//
// Dlaczego NIE w `npm run check`: potrzebuje przeglądarki i serwera dev.
// Runner CI nie ma ani jednego, a bramka, która po cichu się pomija, jest
// gorsza niż jej brak — udaje pomiar. Uruchamiaj przed wypchnięciem ekranu:
//
//     npm run test:renderer-layout
//
// Paczkowany smoke sprawdza to samo NA WYDANEJ APLIKACJI i chodzi w CI; ten
// skrypt jest szybką wersją tej samej gwarancji, żeby nie płacić cyklu CI za
// literówkę w CSS.
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5178;
const ORIGIN = `http://127.0.0.1:${PORT}`;
// Powłoka NIE WSTAJE pod gołym adresem — renderer wymaga mostka preload, więc
// w przeglądarce montuje ją harness deweloperski ze zaślepionym klientem.
const HARNESS = `${ORIGIN}/?surface=collaboration`;

// Playwright nie jest zależnością tego repo i nie ma nią być: chodzi lokalnie,
// w CI tę samą gwarancję niesie paczkowany smoke. Bierzemy go z cache'u npx.
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

// Jeden przelot: otwórz każdy cel z nawigacji i sprawdź, czy powierzchnia mieści
// się w swoim pudełku, a dokument w oknie. Zwracamy WSZYSTKIE przewinienia, nie
// pierwsze — inaczej naprawa jednego ekranu ukrywa drugi.
const sweep = async (browser, { width, fontSize }) => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const failures = [];
  page.on("pageerror", (error) =>
    failures.push({ surface: "-", reason: `page error: ${String(error)}` }),
  );
  await page.goto(HARNESS, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const measured = await page.evaluate(async (fontSize) => {
    const frame = () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    if (fontSize) document.documentElement.style.fontSize = fontSize;
    await frame();
    const ids = [...document.querySelectorAll(".nav-item[data-surface]")].map(
      (item) => item.dataset.surface,
    );
    const results = [];
    for (const id of ids) {
      document.querySelector(`.nav-item[data-surface="${id}"]`)?.click();
      await frame();
      await new Promise((resolve) => setTimeout(resolve, 700));
      await frame();
      const work = document.querySelector('#main-content[role="tabpanel"]');
      const surface = [...(work?.children ?? [])].find(
        (element) =>
          element.getClientRects().length > 0 &&
          !element.classList.contains("shell-tabbar") &&
          !element.classList.contains("capture-dock"),
      );
      results.push({
        surface: id,
        present: surface !== undefined,
        surfaceWidth: surface?.scrollWidth ?? 0,
        surfaceClientWidth: surface?.clientWidth ?? 0,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      });
    }
    return { ids, results };
  }, fontSize);

  if (measured.ids.length < 5) {
    failures.push({
      surface: "-",
      reason: `only ${measured.ids.length} destinations rendered — an empty sweep is a broken measurement, not a pass`,
    });
  }
  for (const entry of measured.results) {
    if (!entry.present) {
      failures.push({ surface: entry.surface, reason: "rendered no surface" });
      continue;
    }
    if (entry.surfaceWidth > entry.surfaceClientWidth) {
      failures.push({
        surface: entry.surface,
        reason: `content ${entry.surfaceWidth} px wide in a ${entry.surfaceClientWidth} px box`,
      });
    }
    if (entry.documentWidth > entry.viewportWidth) {
      failures.push({
        surface: entry.surface,
        reason: `document ${entry.documentWidth} px wide in a ${entry.viewportWidth} px window`,
      });
    }
  }
  await page.close();
  return failures;
};

const browser = await openBrowser();
const passes = [
  { width: 1024, fontSize: "200%", label: "text scaled to 200%" },
  { width: 320, fontSize: undefined, label: "a 320 px window" },
  { width: 1440, fontSize: undefined, label: "a full-size window" },
];

const problems = [];
try {
  for (const pass of passes) {
    const failures = await sweep(browser, pass);
    for (const failure of failures) {
      problems.push(`${pass.label} — ${failure.surface}: ${failure.reason}`);
    }
    console.log(
      `${pass.label}: ${failures.length === 0 ? "no overflow" : `${failures.length} problem(s)`}`,
    );
  }
} finally {
  await browser.close();
  stop();
}

if (problems.length > 0) {
  throw new Error(`RENDERER_LAYOUT_INVALID:\n${problems.join("\n")}`);
}
