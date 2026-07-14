import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const architecture = process.env.CONSTELLATION_ALPHA_ARCH ?? process.arch;
const release = {
  darwin: {
    arm64: {
      filename: "electron-v43.1.0-darwin-arm64.zip",
      sha256:
        "2ee24f768c41bc2ed9bd580d7797b185dffb550dafca59c2cd08b51965bcda3a",
    },
    x64: {
      filename: "electron-v43.1.0-darwin-x64.zip",
      sha256:
        "c84cd358a6c58ee9d6ce26ced694ab3b750109e9f29145ff5a639db64037f1de",
    },
  },
  win32: {
    x64: {
      filename: "electron-v43.1.0-win32-x64.zip",
      sha256:
        "a07dc1e3d5e589593d37e3b19d1b373e02bb58270e2eb0d6633eee0198ad09f0",
    },
  },
}[process.platform]?.[architecture];

if (!release) throw new Error("ELECTRON_PLATFORM_UNSUPPORTED");

const downloadRoot = path.join(root, "build", "electron-zips");
const target = path.join(downloadRoot, release.filename);
const temporary = `${target}.${process.pid}.tmp`;

async function digestFile(filename) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

fs.mkdirSync(downloadRoot, { recursive: true, mode: 0o700 });
if (fs.existsSync(target)) {
  if ((await digestFile(target)) !== release.sha256) {
    fs.rmSync(target, { force: true });
    throw new Error("ELECTRON_ARCHIVE_DIGEST_MISMATCH");
  }
} else {
  const response = await fetch(
    `https://github.com/electron/electron/releases/download/v43.1.0/${release.filename}`,
    {
      redirect: "follow",
      signal: AbortSignal.timeout(120_000),
      headers: { "user-agent": "constellation-alpha-packager" },
    },
  );
  if (!response.ok || !response.body) {
    throw new Error("ELECTRON_ARCHIVE_DOWNLOAD_FAILED");
  }

  const hash = crypto.createHash("sha256");
  const hashingStream = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      hashingStream,
      fs.createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
    );
    if (hash.digest("hex") !== release.sha256) {
      throw new Error("ELECTRON_ARCHIVE_DIGEST_MISMATCH");
    }
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

process.stdout.write(
  `${JSON.stringify({
    status: "pass",
    electron: "43.1.0",
    platform: process.platform,
    architecture,
    sha256: release.sha256,
  })}\n`,
);
