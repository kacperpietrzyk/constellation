import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const findTests = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") return [];
      return findTests(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".test.js") ? [entryPath] : [];
  });

const tests = findTests(path.join(root, "packages")).sort();
if (tests.length === 0) {
  throw new Error("No compiled test files were found.");
}

const result = spawnSync(process.execPath, ["--test", ...tests], {
  cwd: root,
  stdio: "inherit",
});

if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
