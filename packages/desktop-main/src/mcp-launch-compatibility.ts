import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readlinkSync, realpathSync } from "node:fs";
import path from "node:path";

const PUBLIC_APP_BUNDLE = "Constellation.app";
const PUBLIC_EXECUTABLE = "Constellation";
const LEGACY_APP_BUNDLE = "Constellation Local Alpha.app";
const LEGACY_EXECUTABLE = "Constellation Local Alpha";
const MCP_ENTRYPOINT = "constellation-mcp.mjs";
const EXCLUSIVE_RENAME_HELPER = "constellation-rename-exclusive";

type ExclusivePublishResult = "published" | "exists" | "unavailable";

interface SymlinkIdentity {
  readonly birthtimeMs: number;
  readonly dev: number;
  readonly ino: number;
}

const symlinkIdentity = (target: string): SymlinkIdentity | undefined => {
  const stat = lstatSync(target);
  return stat.isSymbolicLink()
    ? { birthtimeMs: stat.birthtimeMs, dev: stat.dev, ino: stat.ino }
    : undefined;
};

const hasSymlinkIdentity = (
  target: string,
  identity: SymlinkIdentity,
): boolean => {
  const current = symlinkIdentity(target);
  return (
    current !== undefined &&
    current.birthtimeMs === identity.birthtimeMs &&
    current.dev === identity.dev &&
    current.ino === identity.ino
  );
};

const hasExpectedTarget = (
  symlinkPath: string,
  expectedTarget: string,
): boolean =>
  path.resolve(path.dirname(symlinkPath), readlinkSync(symlinkPath)) ===
  expectedTarget;

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
  readonly publishExclusive?: (
    target: string,
    destination: string,
  ) => ExclusivePublishResult;
}

const publishPathExclusive = (
  helper: string,
  target: string,
  destination: string,
): ExclusivePublishResult => {
  const result = spawnSync(helper, [target, destination], {
    encoding: "utf8",
    timeout: 10_000,
  });
  if (result.status === 0) return "published";
  if (result.status === 17) return "exists";
  return "unavailable";
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
  const publishExclusive =
    options.publishExclusive ??
    ((target: string, destination: string) =>
      publishPathExclusive(
        path.join(contentsRoot, "Resources", EXCLUSIVE_RENAME_HELPER),
        target,
        destination,
      ));
  let kind: ReturnType<typeof existingPathKind>;
  try {
    kind = existingPathKind(legacyAppPath);
  } catch {
    return { status: "unavailable", legacyAppPath };
  }

  if (kind === "other") return { status: "conflict", legacyAppPath };
  if (kind === "symlink") {
    try {
      const existingIdentity = symlinkIdentity(legacyAppPath);
      if (existingIdentity === undefined) {
        return { status: "unavailable", legacyAppPath };
      }
      if (!hasExpectedTarget(legacyAppPath, appBundle)) {
        return { status: "conflict", legacyAppPath };
      }
      if (!hasSymlinkIdentity(legacyAppPath, existingIdentity)) {
        return { status: "unavailable", legacyAppPath };
      }
      return { status: "ready", legacyAppPath };
    } catch {
      return { status: "unavailable", legacyAppPath };
    }
  }

  try {
    if (publishExclusive(PUBLIC_APP_BUNDLE, legacyAppPath) !== "published") {
      return { status: "unavailable", legacyAppPath };
    }
    const publishedIdentity = symlinkIdentity(legacyAppPath);
    if (
      publishedIdentity === undefined ||
      !hasExpectedTarget(legacyAppPath, appBundle) ||
      !hasSymlinkIdentity(legacyAppPath, publishedIdentity)
    ) {
      return { status: "unavailable", legacyAppPath };
    }
    return { status: "created", legacyAppPath };
  } catch {
    return { status: "unavailable", legacyAppPath };
  }
};
