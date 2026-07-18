/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const findPackageRoot = (): string => {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "src", "styles.css"))) {
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("Could not locate the desktop-ui package root.");
    }
    directory = parent;
  }
  return directory;
};

const root = findPackageRoot();
const surfaces = readFileSync(
  path.join(root, "src", "Wave2Surfaces.tsx"),
  "utf8",
);
const styles = readFileSync(path.join(root, "src", "styles.css"), "utf8");
const activitySurface = readFileSync(
  path.join(root, "src", "ActivitySurface.tsx"),
  "utf8",
);
const activityStyles = readFileSync(
  path.join(root, "src", "activity-surface.css"),
  "utf8",
);
const documentsSurface = readFileSync(
  path.join(root, "src", "DocumentsSurface.tsx"),
  "utf8",
);
const accessSurface = readFileSync(
  path.join(root, "src", "AccessSurface.tsx"),
  "utf8",
);
const accessStyles = readFileSync(
  path.join(root, "src", "access-surface.css"),
  "utf8",
);
const realApp = readFileSync(path.join(root, "src", "RealApp.tsx"), "utf8");
const meetings = readFileSync(
  path.join(root, "src", "MeetingsSurface.tsx"),
  "utf8",
);

describe("interaction recovery contracts", () => {
  it("keeps global-search failure content-safe and explicitly recoverable", () => {
    assert.match(surfaces, /const searchInputRef = useRef<HTMLInputElement>/);
    assert.match(
      surfaces,
      /const \[searchAttempt, setSearchAttempt\] = useState\(0\)/,
    );
    assert.match(surfaces, /ref=\{searchInputRef\}/);
    assert.match(surfaces, /Ponów wyszukiwanie/);
    assert.match(surfaces, /Wyczyść zapytanie/);
    assert.match(surfaces, /searchInputRef\.current\?\.focus\(\)/);
    assert.doesNotMatch(
      surfaces,
      /error instanceof Error\s*\?\s*error\.message/,
      "Renderer errors can contain paths or provider details and must not be shown verbatim.",
    );
  });

  it("gives the inspector separator a 24px pointer target without thickening its seam", () => {
    assert.match(styles, /\.inspector-resize::before\s*\{[^}]*width:\s*24px/s);
    assert.match(styles, /\.inspector-resize::after\s*\{[^}]*width:\s*1px/s);
  });

  it("keeps the inspector out of the layout until deliberate object selection", () => {
    assert.match(realApp, /inspectorDetailOpen \? " inspector-open" : ""/);
    assert.match(
      styles,
      /\.desktop-shell:not\(\.inspector-open\) > \.inspector\s*\{[^}]*display:\s*none/s,
    );
    assert.match(
      styles,
      /\.desktop-shell\.inspector-open\s*\{[^}]*--inspector-width/s,
    );
    assert.match(realApp, /onClick=\{dismissInspector\}/);
    assert.match(realApp, /setMeetingInspectorOpen\(false\)/);
    assert.match(realApp, /setDocumentInspectorOpen\(false\)/);
  });

  it("keeps meeting collection options concise while full content stays in the inspector", () => {
    assert.match(
      meetings,
      /toMeetingResultPreview\(meeting\.summaryMarkdown\)/,
    );
    assert.match(meetings, /aria-label=\{`\$\{title\}/);
    assert.match(meetings, /aria-describedby=\{previewId\}/);
    assert.match(
      meetings,
      /<MeetingMarkdown\s+value=\{selectedMeeting\.summaryMarkdown\}/s,
    );
  });

  it("maps ghost actions to the accepted quiet-button target contract", () => {
    assert.match(
      styles,
      /\.quiet-button,\s*\.ghost-button\s*\{[^}]*min-height:\s*2\.25rem/s,
    );
    assert.match(
      styles,
      /@media \(max-width: 50rem\)[\s\S]*?\.quiet-button,\s*\.ghost-button\s*\{[^}]*min-height:\s*2\.75rem/s,
    );
  });

  it("keeps dense Activity controllable and semantically grouped", () => {
    assert.match(activitySurface, /id="activity-search"/);
    assert.match(activitySurface, /id="activity-category"/);
    assert.match(
      activitySurface,
      /filterActivityItems\(items, category, query\)/,
    );
    assert.match(
      activitySurface,
      /groupActivityItems\(filteredItems, timezone\)/,
    );
    assert.match(activitySurface, /<ol className="activity-list">/);
    assert.match(activitySurface, /Brak pasujących zmian/);
    assert.match(
      activityStyles,
      /\.activity-group\s*\{[^}]*border:[^;]+;[^}]*background:\s*var\(--surface-raised\)/s,
    );
    assert.match(
      activityStyles,
      /\.activity-controls\s*\{[^}]*background:\s*var\(--surface-sunken\)/s,
    );
  });

  it("separates Work context from the primary reading plane without card rows", () => {
    assert.match(
      styles,
      /\.work-context-column\s*\{[^}]*background:\s*var\(--surface-sunken\);[^}]*border:[^;]+;[^}]*border-radius:[^;]+;[^}]*padding:/s,
    );
    assert.match(
      styles,
      /\.work-delivery-column\s*\{[^}]*background:\s*var\(--panel-reading-bg\);[^}]*border:[^;]+;[^}]*box-shadow:\s*var\(--elevation-rest\);[^}]*padding:/s,
    );
    assert.match(
      styles,
      /\.work-context-row,\s*\.work-project-row,\s*\.work-task-row\s*\{[^}]*border-top:[^;]+;[^}]*background:\s*transparent;/s,
    );
  });

  it("keeps Document creation progressive and the editor on a distinct reading plane", () => {
    assert.match(documentsSurface, /className="knowledge-create-bar"/);
    assert.match(documentsSurface, /label="Dodaj źródło"/);
    assert.match(documentsSurface, /label="Nowa treść"/);
    assert.match(
      documentsSurface,
      /open=\{openCreate === "source"\}[\s\S]*open=\{openCreate === "content"\}/,
    );
    assert.match(
      styles,
      /\.knowledge-library\s*\{[^}]*background:\s*var\(--surface-sunken\)/s,
    );
    assert.match(
      styles,
      /\.document-canvas\s*\{[^}]*border:[^;]+;[^}]*background:\s*var\(--panel-reading-bg\);[^}]*box-shadow:\s*var\(--elevation-rest\)/s,
    );
    assert.match(
      styles,
      /\.knowledge-welcome\s*\{[^}]*border:[^;]+;[^}]*background:\s*var\(--panel-reading-bg\);[^}]*box-shadow:\s*var\(--elevation-rest\)/s,
    );
  });

  it("keeps Access ledgers primary and opens grant construction deliberately", () => {
    assert.match(accessSurface, /const AccessCreateDialog =/);
    assert.match(accessSurface, /dialog\.showModal\(\)/);
    assert.match(accessSurface, /openCreation === "person"/);
    assert.match(accessSurface, /openCreation === "agent"/);
    assert.match(accessSurface, /aria-haspopup="dialog"/);
    assert.match(accessSurface, /Dodaj osobę/);
    assert.match(accessSurface, /Dodaj agenta/);
    assert.match(accessSurface, /Poziom możliwości/);
    assert.match(accessSurface, /Zakres danych/);
    assert.match(accessSurface, /Granice między workspace/);
    assert.match(accessSurface, /concept-help-backdrop access-dialog-backdrop/);
    assert.match(accessSurface, /concept-help-dialog access-dialog/);
    assert.match(
      accessStyles,
      /\.access-ledger\s*\{[^}]*border:[^;]+;[^}]*background:\s*var\(--panel-reading-bg\);[^}]*box-shadow:\s*var\(--elevation-raised\)/s,
    );
    assert.match(
      styles,
      /\.concept-help-dialog\s*\{[^}]*background:\s*var\(--overlay-bg\);[^}]*max-height:[^;]+;[^}]*overflow:\s*hidden/s,
    );
    assert.match(
      accessStyles,
      /\.concept-help-dialog\.access-dialog\s*\{[^}]*display:\s*grid;[^}]*width:[^;]+;[^}]*grid-template-rows:[^;]+;[^}]*overflow:\s*hidden/s,
    );
  });
});
