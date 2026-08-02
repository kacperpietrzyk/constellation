import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import { notesImportLimitations } from "../src/notes-import-limitations.js";
import { shellQueries } from "./shell-fixture.js";

/**
 * THE OBSIDIAN IMPORT PANEL.
 *
 * Two properties nothing else can see, and both are about what a person knows
 * BEFORE anything is written:
 *
 *   1. The "what will not migrate" list is on the screen with no scan run and
 *      no folder chosen. It is derived from what the schema cannot express,
 *      not from having run the import once and written down what broke.
 *   2. There is NO path to the import that skips the preview. The run button
 *      does not exist until a scan has answered, and the scan writes nothing.
 *
 * Every assertion here was verified by breaking it.
 */

let container: HTMLDivElement;
let root: Root;
let scans = 0;
let imports: string[] = [];

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  scans = 0;
  imports = [];
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const scanned = {
  outcome: "success" as const,
  directoryLabel: "Vault",
  scanId: "scan-1",
  counts: {
    files: 214,
    notesCreated: 200,
    notesMatched: 14,
    foldersCreated: 31,
    foldersMatched: 0,
    links: 480,
    linksToNotes: 410,
    linksToRecords: 12,
    linksUnresolved: 58,
    titlesDiverged: 2,
    skipped: 1,
  },
  constructs: { frontmatter: 41, embed: 3, tag: 96 },
  unresolvedTargets: ["Wdrożenie w Łodzi", "Gone"],
  skipped: [{ path: "Huge.md", reason: "too_large" }],
  refused: [{ path: "Latin.md", reason: "not_utf8" }],
};

const mountSettings = async (
  scan: Record<string, unknown> = scanned,
  run: Record<string, unknown> = {
    outcome: "success",
    directoryLabel: "Vault",
    counts: {
      foldersCreated: 31,
      foldersMatched: 0,
      notesCreated: 200,
      notesMatched: 14,
      bodiesWritten: 214,
      bodiesFailed: 0,
      linksResolved: 422,
      linksUnresolved: 58,
      titlesDiverged: 2,
      skipped: 1,
    },
  },
): Promise<void> => {
  const { SettingsSurface } = await import("../src/SettingsSurface.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const base = createScenarioClient({ queries: shellQueries });
  const snapshot = await loadDesktopSnapshot(base);
  const client = {
    ...base,
    scanObsidianVault: async () => {
      scans += 1;
      return scan;
    },
    importObsidianVault: async (scanId: string) => {
      imports.push(scanId);
      return run;
    },
  } as typeof base;

  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(SettingsSurface, {
        client,
        snapshot,
        onReload: async () => undefined,
        onFailure: () => undefined,
        onOpenRecovery: () => undefined,
        onNavigate: () => undefined,
      }),
    );
  });
};

const button = (attribute: string): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>(
    `[${attribute}="true"]`,
  );
  assert.ok(found, `no ${attribute} control on the page`);
  return found;
};

const press = async (attribute: string): Promise<void> => {
  await act(async () => {
    button(attribute).click();
  });
};

test("what will not migrate is on the screen before a folder is even chosen", async () => {
  await mountSettings();
  const listed = [
    ...container.querySelectorAll<HTMLElement>("[data-import-limitation]"),
  ].map((entry) => entry.dataset.importLimitation);
  assert.deepEqual(
    listed,
    notesImportLimitations.map((limitation) => limitation.id),
    "the panel shows a different set of limitations than the module declares",
  );
  assert.equal(scans, 0, "the panel scanned something to draw its own list");
  for (const entry of container.querySelectorAll<HTMLElement>(
    "[data-import-limitation] dd",
  ))
    assert.ok(
      (entry.textContent ?? "").length > 40,
      "a limitation is named with no account of what happens instead",
    );
});

test("there is no way to import without first seeing what the import would do", async () => {
  await mountSettings();
  assert.equal(
    container.querySelector('[data-notes-import-run="true"]'),
    null,
    "the import can be run without a scan",
  );
  await press("data-notes-import-scan");
  assert.equal(scans, 1);
  assert.ok(
    container.querySelector('[data-vault-scan="true"]'),
    "the scan reported nothing",
  );
  await press("data-notes-import-run");
  assert.deepEqual(imports, ["scan-1"], "the run did not quote its own scan");
});

test("the preview separates folders it will match from folders it will create", async () => {
  // A `Folder` carries no source key, so a re-run finds one by its path.
  // Rename a folder here and a second run builds a second tree beside it —
  // which cannot be prevented cheaply and MUST NOT be walked into blind.
  await mountSettings();
  await press("data-notes-import-scan");
  const folders = container.querySelector<HTMLElement>(
    '[data-vault-folders="true"]',
  );
  assert.ok(folders, "the preview says nothing about folders");
  const text = folders.textContent ?? "";
  assert.match(text, /31 folders to create/u);
  assert.match(text, /0 folders matched/u);
});

test("the preview names the files it cannot store and the links that answer to nothing", async () => {
  await mountSettings();
  await press("data-notes-import-scan");
  assert.match(
    container.querySelector('[data-vault-skipped="true"]')?.textContent ?? "",
    /Huge\.md/u,
  );
  assert.match(
    container.querySelector('[data-vault-refused="true"]')?.textContent ?? "",
    /Latin\.md/u,
  );
  const unresolved =
    container.querySelector('[data-vault-unresolved="true"]')?.textContent ??
    "";
  assert.match(unresolved, /\[\[Wdrożenie w Łodzi\]\]/u);
  assert.match(unresolved, /stay as the text you wrote/u);
});

test("the scan's own counts of unmigratable constructs land beside the thing they are about", async () => {
  await mountSettings();
  await press("data-notes-import-scan");
  const frontmatter = container.querySelector<HTMLElement>(
    '[data-import-limitation="frontmatter"]',
  );
  assert.match(frontmatter?.textContent ?? "", /41 founds?/u);
  // A construct the vault does not hold says nothing rather than "0 found":
  // a zero beside every line reads as a warning about something that is not
  // happening.
  const shape = container.querySelector<HTMLElement>(
    '[data-import-limitation="list-shape"]',
  );
  assert.equal(shape?.querySelector("[data-limitation-found]"), null);
});

test("what did not arrive is reported in the same breath as what did", async () => {
  await mountSettings();
  await press("data-notes-import-scan");
  await press("data-notes-import-run");
  const alert = container.querySelector<HTMLElement>(
    '[data-settings-category="notes"] [role="alert"]',
  );
  assert.ok(alert, "an import that lost 58 links reported no loss");
  const text = alert.textContent ?? "";
  assert.match(text, /200 notes/u);
  assert.match(text, /58 links point at nothing here/u);
  assert.match(text, /2 kept the title/u);
});

test("a scan the main process no longer holds refuses rather than writing a vault nobody looked at", async () => {
  await mountSettings(scanned, { outcome: "expired" });
  await press("data-notes-import-scan");
  await press("data-notes-import-run");
  const alert = container.querySelector<HTMLElement>(
    '[data-settings-category="notes"] [role="alert"]',
  );
  assert.match(alert?.textContent ?? "", /nothing was written/u);
  assert.equal(
    container.querySelector('[data-notes-import-run="true"]'),
    null,
    "the expired preview is still offering to run",
  );
});

test("a re-run with nothing new to bring in does not offer to import zero notes", async () => {
  // Every file is already here, and the run STILL does something: each body is
  // rewritten from the file. A button reading "Import 0 notes" would say it
  // does nothing, next to a line saying fourteen notes will be replaced.
  await mountSettings({
    ...scanned,
    counts: {
      ...scanned.counts,
      notesCreated: 0,
      foldersCreated: 0,
      foldersMatched: 31,
    },
  });
  await press("data-notes-import-scan");
  assert.match(
    button("data-notes-import-run").textContent ?? "",
    /Bring 14 notes up to date/u,
  );
});

test("a folder holding no markdown says so instead of reporting an empty import", async () => {
  await mountSettings({ outcome: "empty", directoryLabel: "Documents" });
  await press("data-notes-import-scan");
  const alert = container.querySelector<HTMLElement>(
    '[data-settings-category="notes"] [role="alert"]',
  );
  assert.match(alert?.textContent ?? "", /Documents holds no \.md files/u);
});
