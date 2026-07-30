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
    let recordPanels = 0;
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
      const target = document.querySelector(`.nav-item[data-surface="${id}"]`);
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
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        });
      };
      measure(id);
      // A destination can carry several LENSES over the same records, and the
      // widest of them — a board of columns, a table of eight — is exactly
      // where a narrow window or scaled text overflows. Sweeping only the
      // default lens would report a pass for geometry nobody measured.
      const lenses = [...(work?.querySelectorAll("[data-layout]") ?? [])];
      for (const lens of lenses) {
        const label = lens.getAttribute("data-layout");
        if (label === null) continue;
        lens.click();
        await frame();
        await new Promise((resolve) => setTimeout(resolve, 700));
        await frame();
        measure(`${id}:${label}`);
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
      const row = work?.querySelector("[data-project-row]");
      if (row instanceof HTMLElement) {
        row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        await frame();
        await new Promise((resolve) => setTimeout(resolve, 900));
        await frame();
        measure(`${id}:record`);
        // Every tab, because the panels differ in kind: a reading column, a
        // list of rows, a stream. The widest of them is where a narrow window
        // overflows, and it is not the one the record opens on.
        const tabs = [
          ...(document.querySelectorAll('[role="tab"][data-record-tab]') ?? []),
        ];
        for (const tab of tabs) {
          const label = tab.getAttribute("data-record-tab");
          if (label === null || !(tab instanceof HTMLElement)) continue;
          tab.click();
          await frame();
          await new Promise((resolve) => setTimeout(resolve, 500));
          await frame();
          measure(`${id}:record:${label}`);
        }
        recordPanels += tabs.length;
      }
    }
    return { ids, results, recordPanels };
  }, fontSize);

  if (measured.ids.length < 5) {
    failures.push({
      surface: "-",
      reason: `only ${measured.ids.length} destinations rendered — an empty sweep is a broken measurement, not a pass`,
    });
  }
  // The lens sweep is the part most likely to measure nothing while looking
  // green: a destination whose data slice is unavailable renders a refusal with
  // no layout buttons at all, so the loop finds none and the pass is vacuous.
  const lensesMeasured = measured.results.filter((entry) =>
    entry.surface.includes(":"),
  ).length;
  if (lensesMeasured < 4) {
    failures.push({
      surface: "-",
      reason: `only ${lensesMeasured} lenses were measured — a destination with several layouts drew none of them, so this pass covers geometry nobody looked at`,
    });
  }
  // The same trap one level down, and it is the one that bit: an opened record
  // is a DIFFERENT screen from the collection that opens it, and this gate
  // swept Projects thirteen times without ever seeing it. A workspace whose
  // rows never rendered would now pass here in silence, so the count is a
  // failure rather than a shrug.
  if (measured.recordPanels < 5) {
    failures.push({
      surface: "-",
      reason: `only ${measured.recordPanels} record panels were measured — no project opened, so the record screen's geometry is untested and this pass says nothing about it`,
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
