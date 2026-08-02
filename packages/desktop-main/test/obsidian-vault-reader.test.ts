import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readObsidianVault } from "../src/obsidian-vault-reader.js";

/**
 * The walk — the only part of the import that touches a disk.
 *
 * Every assertion here was verified by breaking it, with `tsc -b` inside the
 * loop. What it is really guarding is that a scan CANNOT reach outside the
 * folder somebody chose and cannot quietly pass over a file it declined.
 */

const vault = (
  files: Readonly<Record<string, string>>,
): { readonly root: string; readonly dispose: () => void } => {
  const root = mkdtempSync(path.join(tmpdir(), "constellation-vault-"));
  for (const [relative, text] of Object.entries(files)) {
    const absolute = path.join(root, ...relative.split("/"));
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
  }
  return {
    root,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
};

test("markdown is read with its vault-relative path, and other files are not", () => {
  const { root, dispose } = vault({
    "Klienci/Wdrożenie w Łodzi.md": "Zażółć gęślą jaźń.",
    "Klienci/Falcon/Kickoff.md": "Start.",
    "Loose.md": "Loose.",
    "Klienci/photo.png": "not markdown",
    "notes.txt": "not markdown",
  });
  try {
    const result = readObsidianVault(root);
    assert.deepEqual(
      result.files.map((file) => file.path),
      ["Klienci/Falcon/Kickoff.md", "Klienci/Wdrożenie w Łodzi.md", "Loose.md"],
    );
    assert.equal(result.files[1]?.text, "Zażółć gęślą jaźń.");
    assert.deepEqual(result.refused, []);
  } finally {
    dispose();
  }
});

test("Obsidian's own folders and everything else dotted are left alone", () => {
  // `.obsidian` is the vault's configuration and `.trash` is what the person
  // already deleted; importing either puts settings and deleted notes into
  // somebody's Library dressed as their writing.
  const { root, dispose } = vault({
    "Real.md": "real",
    ".obsidian/workspace.md": "config",
    ".trash/Deleted.md": "deleted",
    ".git/COMMIT_EDITMSG.md": "message",
  });
  try {
    assert.deepEqual(
      readObsidianVault(root).files.map((file) => file.path),
      ["Real.md"],
    );
  } finally {
    dispose();
  }
});

test("a symlink is not followed, so a scan cannot leave the chosen folder", () => {
  const outside = vault({ "Secret.md": "not yours to read" });
  const { root, dispose } = vault({ "Real.md": "real" });
  try {
    symlinkSync(outside.root, path.join(root, "escape"));
    symlinkSync(
      path.join(outside.root, "Secret.md"),
      path.join(root, "Link.md"),
    );
    assert.deepEqual(
      readObsidianVault(root).files.map((file) => file.path),
      ["Real.md"],
      "the walk followed a link out of the folder somebody chose",
    );
  } finally {
    dispose();
    outside.dispose();
  }
});

test("a file that is not UTF-8 is refused by name rather than imported as mojibake", () => {
  // Reading Latin-1 as UTF-8 does not throw; it produces replacement
  // characters, and a note full of them looks exactly like the person's own
  // writing gone wrong with nothing saying it happened.
  const { root, dispose } = vault({ "Fine.md": "fine" });
  try {
    writeFileSync(path.join(root, "Latin.md"), Buffer.from([0x41, 0xff, 0x42]));
    const result = readObsidianVault(root);
    assert.deepEqual(
      result.files.map((file) => file.path),
      ["Fine.md"],
    );
    assert.deepEqual(result.refused, [
      { path: "Latin.md", reason: "not_utf8" },
    ]);
  } finally {
    dispose();
  }
});

test("an empty folder is an empty read rather than a failure", () => {
  const { root, dispose } = vault({});
  try {
    assert.deepEqual(readObsidianVault(root), { files: [], refused: [] });
  } finally {
    dispose();
  }
});
