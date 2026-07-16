import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ACCEPTED_LICENSE_EXPRESSIONS = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "ISC",
  "MIT",
  "MPL-2.0",
  "Python-2.0",
  "WTFPL",
  "WTFPL OR ISC",
  "(BSD-2-Clause OR MIT OR Apache-2.0)",
  "(MIT OR CC0-1.0)",
  "(MIT OR WTFPL)",
  "(WTFPL OR MIT)",
]);

const dependencyName = (packagePath) => {
  const marker = "node_modules/";
  const start = packagePath.lastIndexOf(marker);
  return packagePath.slice(start + marker.length);
};

export const verifyDependencyLicenses = (lockfile) => {
  if (
    lockfile === null ||
    typeof lockfile !== "object" ||
    lockfile.lockfileVersion !== 3 ||
    lockfile.packages === null ||
    typeof lockfile.packages !== "object"
  ) {
    throw new Error("DEPENDENCY_LICENSE_LOCKFILE_INVALID");
  }

  const counts = new Map();
  const violations = [];
  for (const [packagePath, metadata] of Object.entries(lockfile.packages)) {
    if (!packagePath.includes("node_modules/")) continue;
    if (metadata === null || typeof metadata !== "object") {
      violations.push({
        packageName: dependencyName(packagePath),
        license: "",
      });
      continue;
    }
    const linkedMetadata =
      metadata.link === true && typeof metadata.resolved === "string"
        ? lockfile.packages[metadata.resolved]
        : undefined;
    const license =
      typeof metadata.license === "string"
        ? metadata.license
        : linkedMetadata !== null &&
            typeof linkedMetadata === "object" &&
            typeof linkedMetadata.license === "string"
          ? linkedMetadata.license
          : "";
    if (!ACCEPTED_LICENSE_EXPRESSIONS.has(license)) {
      violations.push({ packageName: dependencyName(packagePath), license });
      continue;
    }
    counts.set(license, (counts.get(license) ?? 0) + 1);
  }

  if (violations.length > 0) {
    const detail = violations
      .sort((left, right) => left.packageName.localeCompare(right.packageName))
      .map(
        ({ packageName, license }) =>
          `${packageName}: ${license || "missing license"}`,
      )
      .join(", ");
    throw new Error(`DEPENDENCY_LICENSE_NOT_ACCEPTED: ${detail}`);
  }

  return {
    dependencyCount: [...counts.values()].reduce(
      (total, count) => total + count,
      0,
    ),
    licenses: Object.fromEntries(
      [...counts].sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
};

const run = async () => {
  const lockfile = JSON.parse(await readFile("package-lock.json", "utf8"));
  const result = verifyDependencyLicenses(lockfile);
  process.stdout.write(
    `Dependency licenses: ${result.dependencyCount} packages accepted.\n`,
  );
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await run();
}
