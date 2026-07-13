import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(root, "release", "local-alpha-manifest.json"),
    "utf8",
  ),
);
const stateRoot = path.join(root, "build", "packaged-alpha-smoke-state");
const reportPath = path.join(stateRoot, "report.json");
fs.rmSync(stateRoot, { recursive: true, force: true });
fs.mkdirSync(stateRoot, { recursive: true });

const run = (expectedPhase) => {
  fs.rmSync(reportPath, { force: true });
  const result = spawnSync(
    manifest.executable,
    [`--user-data-dir=${path.join(stateRoot, "user-data")}`],
    {
      encoding: "utf8",
      timeout: 60_000,
      env: {
        ...process.env,
        CONSTELLATION_ALPHA_SMOKE_REPORT: reportPath,
      },
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`PACKAGED_ALPHA_PROCESS_FAILED_${String(result.status)}`);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (
    report.status !== "pass" ||
    report.phase !== expectedPhase ||
    report.persistence !== "encrypted-local" ||
    report.cipherVersion !== "4.16.0 community" ||
    report.taskCount !== 1
  ) {
    throw new Error("PACKAGED_ALPHA_REPORT_INVALID");
  }
  return report;
};

const created = run("created");
const restored = run("restored");
process.stdout.write(
  `${JSON.stringify({
    status: "pass",
    platform: process.platform,
    phases: [created.phase, restored.phase],
    persistence: restored.persistence,
    cipherVersion: restored.cipherVersion,
    provider: restored.provider,
    taskCount: restored.taskCount,
  })}\n`,
);
