import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ObsidianVaultFile } from "./obsidian-import.js";

/**
 * The vault, read where it stands.
 *
 * The prototype's own words for this screen: *"A vault is read where it
 * stands. Nothing in it is moved, renamed or deleted, and the scan writes
 * nothing"* (`v3/screens/settings.js:813-815`). This module opens files and
 * never writes one, and it is the ONLY part of the import that touches a disk.
 *
 * Everything it refuses, it refuses out loud through `refused`, because a
 * silent skip inside a two-hundred-file walk is indistinguishable from a file
 * that was never there.
 */

/** A vault this size is not a vault; it is a mistaken folder choice. */
export const MAX_VAULT_FILES = 20_000;

/** Total markdown bytes read into memory at once. */
export const MAX_VAULT_BYTES = 64 * 1024 * 1024;

/** One file this large is not a note. */
export const MAX_VAULT_FILE_BYTES = 8 * 1024 * 1024;

/** Deeper than this is a loop somebody made with links, not a folder tree. */
export const MAX_VAULT_DEPTH = 32;

export type ObsidianVaultRefusal =
  "file_too_large" | "not_utf8" | "unreadable" | "too_deep" | "vault_too_large";

export interface ObsidianVaultReadResult {
  readonly files: readonly ObsidianVaultFile[];
  /** Paths the walk would not take, and why. Never silently dropped. */
  readonly refused: readonly {
    readonly path: string;
    readonly reason: ObsidianVaultRefusal;
  }[];
}

/**
 * A directory Obsidian itself owns, or one no vault means to migrate.
 *
 * `.obsidian` holds the workspace's own configuration and `.trash` holds what
 * the person already deleted — importing either would put settings files and
 * deleted notes into somebody's Library under the guise of their writing.
 * Every dot-directory is skipped for the same reason `.git` is.
 */
const isSkippedDirectory = (name: string): boolean => name.startsWith(".");

export const readObsidianVault = (root: string): ObsidianVaultReadResult => {
  const files: ObsidianVaultFile[] = [];
  const refused: { path: string; reason: ObsidianVaultRefusal }[] = [];
  let bytes = 0;
  const resolvedRoot = path.resolve(root);

  const walk = (directory: string, depth: number): void => {
    if (depth > MAX_VAULT_DEPTH) {
      refused.push({
        path: path.relative(resolvedRoot, directory).split(path.sep).join("/"),
        reason: "too_deep",
      });
      return;
    }
    let entries: readonly { name: string; isDirectory: boolean }[];
    try {
      entries = readdirSync(directory, { withFileTypes: true })
        .map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          // A SYMLINK IS NOT FOLLOWED. `withFileTypes` reports the link itself,
          // so a link pointing at the vault's own parent — or at somebody's
          // home directory — is refused here rather than walked into a loop or
          // out of the folder the person chose.
          isLink: entry.isSymbolicLink(),
        }))
        .filter((entry) => !entry.isLink);
    } catch {
      refused.push({
        path: path.relative(resolvedRoot, directory).split(path.sep).join("/"),
        reason: "unreadable",
      });
      return;
    }
    for (const entry of [...entries].sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (files.length >= MAX_VAULT_FILES || bytes >= MAX_VAULT_BYTES) {
        refused.push({ path: entry.name, reason: "vault_too_large" });
        return;
      }
      const absolute = path.join(directory, entry.name);
      const relative = path
        .relative(resolvedRoot, absolute)
        .split(path.sep)
        .join("/");
      if (entry.isDirectory) {
        if (!isSkippedDirectory(entry.name)) walk(absolute, depth + 1);
        continue;
      }
      if (!/\.md$/iu.test(entry.name)) continue;
      let size: number;
      try {
        size = lstatSync(absolute).size;
      } catch {
        refused.push({ path: relative, reason: "unreadable" });
        continue;
      }
      if (size > MAX_VAULT_FILE_BYTES) {
        refused.push({ path: relative, reason: "file_too_large" });
        continue;
      }
      try {
        const buffer = readFileSync(absolute);
        const text = buffer.toString("utf8");
        // A file that is not UTF-8 comes back full of replacement characters
        // rather than throwing, so it is caught by re-encoding: importing it
        // would store mojibake that looks like the person's own writing.
        if (Buffer.compare(Buffer.from(text, "utf8"), buffer) !== 0) {
          refused.push({ path: relative, reason: "not_utf8" });
          continue;
        }
        bytes += size;
        files.push({ path: relative, text });
      } catch {
        refused.push({ path: relative, reason: "unreadable" });
      }
    }
  };

  walk(resolvedRoot, 0);
  return { files, refused };
};
