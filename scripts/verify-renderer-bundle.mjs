import { gzipSync } from "node:zlib";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

// 2026-07-18: totalJavaScript i stylesheet podniesione po fali „enterprise
// shell polish" (menu natywne, paleta ⌘K z semantyką combobox, ściąga skrótów,
// popovery, moduł i18n, pełny renderer Markdownu, drawer inspektora). Entry
// pozostaje na starym budżecie — nowe powierzchnie ładują się jako osobne
// chunki (Access, Relacje, Onboarding, Recovery dołączyły do split-listy).
// 2026-07-20: stylesheet podniesiony po R12.1 (kontekst roboczy zadania:
// edytor w inspektorze i wiersz bezpośredniego tworzenia zadania), a
// totalJavaScript po dodaniu planowania w czasie (pola dat i priorytetu,
// konwersja stref czasowych workspace, linia terminu w wierszach zadań).
// 2026-07-20 (R12.2): oba podniesione po podzadaniach (sekcja inspektora,
// wiersz dodawania, link do rodzica) i jawnym kierunku/terminie oczekiwania
// w Work.
// 2026-07-20 (R12.3): totalJavaScript i entry po bloku zarządzania statusami
// zadań w Ustawieniach (wiersze definicji, dwustopniowa archiwizacja,
// wiersz dodawania, wrappery komend taskStatus.*).
// 2026-07-20 (R13.1): wszystkie trzy po typowanych polach rekordów
// (zarządzanie definicjami w Ustawieniach, kontrolki wartości per typ w
// inspektorze, wrappery fieldDef.*/record.setFieldValue).
// 2026-07-20 (R13.2): entry i totalJavaScript po szablonach projektów
// (blok zarządzania w Ustawieniach, wybór szablonu przy tworzeniu projektu,
// rząd zastosowania z prowieniencją, wrappery template.*/project.applyTemplate).
// 2026-07-20 (R13.3): totalJavaScript po cyklu życia widoków (zmiana nazwy,
// dwustopniowe usunięcie, warunek pola i grupowanie w popoverze zapisu,
// nagłówki grup listy zadań, wrappery savedView.rename/update/delete).
// 2026-07-20 (R13.4): entry i totalJavaScript po ograniczonych
// automatyzacjach (blok reguł w Ustawieniach z zamkniętym słownikiem
// przepisów, wrappery automation.*, etykieta nowego powodu Do uwagi).
// 2026-07-20 (R12.5): totalJavaScript i stylesheet po projekcji spotkania w
// graf pracy (sekcje kontekstu i uczestnikow w inspektorze, akcja tworzenia
// zadania z zapisu, wrappery meeting.route/promoteWorkItem/linkParticipants).
const limits = {
  entryBytes: 531_000,
  entryGzipBytes: 143_000,
  totalJavaScriptBytes: 818_000,
  stylesheetBytes: 176_000,
};

const dist = path.join(process.cwd(), "packages", "desktop-ui", "dist");
const html = await readFile(path.join(dist, "index.html"), "utf8");
const entryMatch = html.match(/<script[^>]+src="\.\/(assets\/[^"?]+\.js)"/u);
const stylesheetMatch = html.match(
  /<link[^>]+href="\.\/(assets\/[^"?]+\.css)"/u,
);

if (!entryMatch || !stylesheetMatch) {
  throw new Error(
    "Nie znaleziono wejściowych plików renderera w dist/index.html.",
  );
}

const entryPath = path.join(dist, entryMatch[1]);
const stylesheetPath = path.join(dist, stylesheetMatch[1]);
const entry = await readFile(entryPath);
const stylesheet = await stat(stylesheetPath);
const assets = await readdir(path.join(dist, "assets"), {
  withFileTypes: true,
});
let totalJavaScriptBytes = 0;

for (const asset of assets) {
  if (asset.isFile() && asset.name.endsWith(".js")) {
    totalJavaScriptBytes += (await stat(path.join(dist, "assets", asset.name)))
      .size;
  }
}

const measurements = {
  entryBytes: entry.byteLength,
  entryGzipBytes: gzipSync(entry).byteLength,
  totalJavaScriptBytes,
  stylesheetBytes: stylesheet.size,
};
const failures = Object.entries(limits).filter(
  ([key, limit]) => measurements[key] > limit,
);

console.log(
  `Renderer bundle: entry ${measurements.entryBytes} B (${measurements.entryGzipBytes} B gzip), JS total ${measurements.totalJavaScriptBytes} B, CSS ${measurements.stylesheetBytes} B.`,
);

if (failures.length > 0) {
  for (const [key, limit] of failures) {
    console.error(
      `Budżet ${key} przekroczony: ${measurements[key]} B > ${limit} B.`,
    );
  }
  process.exitCode = 1;
}
