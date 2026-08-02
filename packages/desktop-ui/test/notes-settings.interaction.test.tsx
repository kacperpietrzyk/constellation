import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import { settingsCategories } from "../src/settings-categories.js";
import { shellQueries } from "./shell-fixture.js";

/**
 * THE NOTES SECTION, AND THE BADGE THAT MUST NOT COUNT RECORDS.
 *
 * Two things are asserted here that `settings-navigation-contract` cannot see,
 * because it reads the screen as TEXT:
 *
 *   1. The section's status line is a statement ABOUT THE SECTION, never a
 *      count of the workspace's records. "Notes 16" was written once and is
 *      the reason this assertion exists; it reads as a badge and answers a
 *      question nobody asked of a settings page.
 *   2. Pressing the export calls the export. A panel whose button is wired to
 *      nothing satisfies every text-shaped guard there is.
 */

let container: HTMLDivElement;
let root: Root;
let exports = 0;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  exports = 0;
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const mountSettings = async (
  result: {
    readonly outcome:
      "success" | "cancelled" | "failure" | "would_overwrite" | "partial";
    readonly directoryLabel?: string;
    readonly count?: number;
    readonly written?: Readonly<Record<string, number>>;
    readonly counts?: Readonly<Record<string, number>>;
  } = {
    outcome: "success",
    directoryLabel: "Vault",
    counts: {
      notes: 3,
      attachments: 1,
      unreadable: 0,
      unresolvedReferences: 0,
      missingAttachments: 0,
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
    exportNotesMarkdown: async () => {
      exports += 1;
      return result;
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

const exportButton = (): HTMLButtonElement => {
  const button = container.querySelector<HTMLButtonElement>(
    '[data-notes-export="true"]',
  );
  assert.ok(button, "the Notes section offers no way to export");
  return button;
};

const notesStatus = (): string => {
  const entry = [
    ...container.querySelectorAll<HTMLElement>(".settings-navigator button"),
  ].find(
    (button) =>
      button.querySelector("span")?.textContent?.trim() ===
      settingsCategories.find((category) => category.id === "notes")?.label,
  );
  assert.ok(entry, "the navigator does not list the Notes section");
  return entry.querySelector("small")?.textContent?.trim() ?? "";
};

test("the Notes section arrives with the export it is about", async () => {
  await mountSettings();
  assert.ok(
    container.querySelector('[data-settings-category="notes"]'),
    "no Notes section is anchored on the page",
  );
  // The seam the Obsidian import plugs into: its panel becomes a second
  // `<section>` inside this same category, and nothing else has to move.
  assert.equal(
    container.querySelectorAll('[data-settings-category="notes"] > section')
      .length,
    1,
  );
});

test("the section's status names what the section does, not how many records exist", async () => {
  await mountSettings();
  const status = notesStatus();
  assert.ok(status.length > 0, "the Notes section carries no status at all");
  // THE SHAPE, not a phrase. A badge counting records is a NUMBER, and the
  // number would be the workspace's note count — a fact about the graph that
  // a settings navigator has no business answering. Any digit here is the
  // defect, whatever words surround it.
  assert.doesNotMatch(
    status,
    /\d/u,
    `the Notes status carries a count: ${status}`,
  );
});

test("pressing the export calls the export and reports where the files went", async () => {
  await mountSettings();
  await act(async () => {
    exportButton().click();
  });
  assert.equal(exports, 1, "the button is wired to nothing");
  const message = container.querySelector<HTMLElement>(
    '[data-settings-category="notes"] [role="status"]',
  );
  assert.ok(message, "the export said nothing about what it did");
  assert.match(message.textContent ?? "", /Vault/u);
  assert.match(message.textContent ?? "", /3 files/u);
});

test("what did NOT come out is reported in the same breath as what did", async () => {
  // A round number that quietly excluded the notes this build could not read
  // looks exactly like a complete export, and the person finds out by missing
  // one. So an export with losses reports them, and does it as an alert.
  await mountSettings({
    outcome: "success",
    directoryLabel: "Vault",
    counts: {
      notes: 3,
      attachments: 0,
      unreadable: 2,
      unresolvedReferences: 1,
      missingAttachments: 0,
    },
  });
  await act(async () => {
    exportButton().click();
  });
  const alert = container.querySelector<HTMLElement>(
    '[data-settings-category="notes"] [role="alert"]',
  );
  assert.ok(alert, "an export that lost two notes reported no loss");
  assert.match(alert.textContent ?? "", /2 could not be read/u);
  assert.match(alert.textContent ?? "", /1 links? point at records/u);
});

test("an export that would replace existing files writes nothing and counts them", async () => {
  // The gesture this invites is "point it at my Obsidian vault", and the save
  // dialog offers no overwrite confirmation while the write truncates. An
  // export that destroyed somebody's existing files with no warning would be
  // the same silent loss this whole feature exists to refuse.
  await mountSettings({
    outcome: "would_overwrite",
    directoryLabel: "Vault",
    count: 4,
  });
  await act(async () => {
    exportButton().click();
  });
  const alert = container.querySelector<HTMLElement>(
    '[data-settings-category="notes"] [role="alert"]',
  );
  assert.ok(alert, "an export that would overwrite four files said nothing");
  assert.match(alert.textContent ?? "", /4 files/u);
  assert.match(alert.textContent ?? "", /nothing was written/u);
});

test("an export that stopped part-way says what is already on disk", async () => {
  // "Nothing was written" would be true of the notes and false of the folder,
  // and the person would find out by opening it.
  await mountSettings({
    outcome: "partial",
    directoryLabel: "Vault",
    written: { notes: 12, attachments: 1 },
  });
  await act(async () => {
    exportButton().click();
  });
  const alert = container.querySelector<HTMLElement>(
    '[data-settings-category="notes"] [role="alert"]',
  );
  assert.ok(alert, "a half-finished export reported nothing");
  assert.match(alert.textContent ?? "", /Stopped after 12 files/u);
  assert.match(alert.textContent ?? "", /on disk/u);
});

test("a cancelled export says nothing was written", async () => {
  await mountSettings({ outcome: "cancelled" });
  await act(async () => {
    exportButton().click();
  });
  const message = container.querySelector<HTMLElement>(
    '[data-settings-category="notes"] [role="status"]',
  );
  assert.match(message?.textContent ?? "", /Nothing was written/u);
});
