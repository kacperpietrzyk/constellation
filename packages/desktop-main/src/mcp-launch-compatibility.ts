import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import path from "node:path";

const PUBLIC_APP_BUNDLE = "Constellation.app";
const PUBLIC_EXECUTABLE = "Constellation";
const LEGACY_APP_BUNDLE = "Constellation Local Alpha.app";
const LEGACY_EXECUTABLE = "Constellation Local Alpha";
const MCP_ENTRYPOINT = "constellation-mcp.mjs";

export type MacMcpLaunchCompatibilityResult =
  | { readonly status: "created"; readonly legacyAppPath: string }
  | { readonly status: "ready"; readonly legacyAppPath: string }
  | { readonly status: "unsupported" }
  | { readonly status: "invalid_bundle" }
  | { readonly status: "conflict"; readonly legacyAppPath: string }
  | { readonly status: "unavailable"; readonly legacyAppPath: string };

export interface MacMcpLaunchCompatibilityOptions {
  readonly platform?: NodeJS.Platform;
  readonly executablePath?: string;
  readonly markHidden?: (target: string) => void;
}

const markPathHidden = (target: string): void => {
  const result = spawnSync("/usr/bin/chflags", ["-h", "hidden", target], {
    encoding: "utf8",
    timeout: 10_000,
  });
  if (result.status !== 0) throw new Error("LEGACY_MCP_PATH_HIDE_FAILED");
};

const existingPathKind = (target: string): "absent" | "symlink" | "other" => {
  try {
    return lstatSync(target).isSymbolicLink() ? "symlink" : "other";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    throw error;
  }
};

export const ensureMacMcpLaunchCompatibility = (
  options: MacMcpLaunchCompatibilityOptions = {},
): MacMcpLaunchCompatibilityResult => {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin") return { status: "unsupported" };

  const executablePath = path.resolve(
    options.executablePath ?? process.execPath,
  );
  const executableRoot = path.dirname(executablePath);
  const contentsRoot = path.dirname(executableRoot);
  const appBundle = path.dirname(contentsRoot);
  if (
    path.basename(executablePath) !== PUBLIC_EXECUTABLE ||
    path.basename(executableRoot) !== "MacOS" ||
    path.basename(contentsRoot) !== "Contents" ||
    path.basename(appBundle) !== PUBLIC_APP_BUNDLE
  ) {
    return { status: "invalid_bundle" };
  }

  const legacyExecutable = path.join(executableRoot, LEGACY_EXECUTABLE);
  const mcpEntrypoint = path.join(contentsRoot, "Resources", MCP_ENTRYPOINT);
  try {
    if (
      !existsSync(legacyExecutable) ||
      !existsSync(mcpEntrypoint) ||
      realpathSync(legacyExecutable) !== realpathSync(executablePath)
    ) {
      return { status: "invalid_bundle" };
    }
  } catch {
    return { status: "invalid_bundle" };
  }

  const legacyAppPath = path.join(path.dirname(appBundle), LEGACY_APP_BUNDLE);
  const markHidden = options.markHidden ?? markPathHidden;
  let kind: ReturnType<typeof existingPathKind>;
  try {
    kind = existingPathKind(legacyAppPath);
  } catch {
    return { status: "unavailable", legacyAppPath };
  }

  if (kind === "other") return { status: "conflict", legacyAppPath };
  if (kind === "symlink") {
    try {
      const target = path.resolve(
        path.dirname(legacyAppPath),
        readlinkSync(legacyAppPath),
      );
      if (target !== appBundle) return { status: "conflict", legacyAppPath };
      markHidden(legacyAppPath);
      return { status: "ready", legacyAppPath };
    } catch {
      return { status: "unavailable", legacyAppPath };
    }
  }

  let createdIdentity:
    | {
        readonly birthtimeMs: number;
        readonly dev: number;
        readonly ino: number;
      }
    | undefined;
  try {
    symlinkSync(PUBLIC_APP_BUNDLE, legacyAppPath);
    const created = lstatSync(legacyAppPath);
    createdIdentity = {
      birthtimeMs: created.birthtimeMs,
      dev: created.dev,
      ino: created.ino,
    };
    markHidden(legacyAppPath);
    const marked = lstatSync(legacyAppPath);
    if (
      !marked.isSymbolicLink() ||
      marked.birthtimeMs !== createdIdentity.birthtimeMs ||
      marked.dev !== createdIdentity.dev ||
      marked.ino !== createdIdentity.ino
    ) {
      return { status: "unavailable", legacyAppPath };
    }
    return { status: "created", legacyAppPath };
  } catch {
    try {
      const current = lstatSync(legacyAppPath);
      if (
        createdIdentity !== undefined &&
        current.isSymbolicLink() &&
        current.birthtimeMs === createdIdentity.birthtimeMs &&
        current.dev === createdIdentity.dev &&
        current.ino === createdIdentity.ino
      ) {
        rmSync(legacyAppPath, { force: true });
      }
    } catch {
      // Best effort only: never turn a compatibility path into a startup failure.
    }
    return { status: "unavailable", legacyAppPath };
  }
};
