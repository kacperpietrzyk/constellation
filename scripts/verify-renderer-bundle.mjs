import { gzipSync } from "node:zlib";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const limits = {
  entryBytes: 510_000,
  entryGzipBytes: 140_000,
  totalJavaScriptBytes: 680_000,
  stylesheetBytes: 145_000,
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
