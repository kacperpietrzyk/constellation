import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesDirectory = path.join(root, "packages");

for (const entry of readdirSync(packagesDirectory, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    for (const outputDirectory of ["build", "dist"]) {
      rmSync(path.join(packagesDirectory, entry.name, outputDirectory), {
        force: true,
        recursive: true,
      });
    }
  }
}
