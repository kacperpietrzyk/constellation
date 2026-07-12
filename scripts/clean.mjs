import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesDirectory = path.join(root, "packages");

for (const entry of readdirSync(packagesDirectory, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    rmSync(path.join(packagesDirectory, entry.name, "dist"), {
      force: true,
      recursive: true,
    });
  }
}
