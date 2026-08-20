import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(
  new URL("../packages/desktop-ui/src/styles.css", import.meta.url),
  "utf8",
);
const tokens = readFileSync(
  new URL("../packages/desktop-ui/src/tokens.css", import.meta.url),
  "utf8",
);
const settings = readFileSync(
  new URL("../packages/desktop-ui/src/SettingsSurface.tsx", import.meta.url),
  "utf8",
);

test("the full sidebar has enough capacity and one stable metadata grid", () => {
  assert.match(tokens, /--sidebar-width:\s*13\.75rem;/u);
  assert.match(
    styles,
    /\.nav-entry\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*position:\s*relative;/su,
  );
  assert.match(
    styles,
    /\.nav-item-meta\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*1\.65rem;/su,
  );
  assert.match(
    styles,
    /\.nav-item-meta:has\(\.nav-count\)\s*\{[^}]*grid-template-columns:\s*1\.25rem 1\.65rem;/su,
  );
});

test("Theme is one compact segmented radio control", () => {
  assert.match(settings, /data-theme-choice="segmented"/u);
  assert.match(
    styles,
    /\.settings-control > \.settings-segments\s*\{[^}]*background:\s*var\(--surface-sunken\);[^}]*width:\s*fit-content;/su,
  );
  assert.match(
    styles,
    /\.settings-choice label\s*\{[^}]*min-height:\s*2rem;/su,
  );
});

test("Settings rhythm uses the shared spacing scale instead of local decimals", () => {
  assert.match(
    styles,
    /\.settings-category > section\s*\{[^}]*gap:\s*var\(--space-3\);/su,
  );
  assert.match(
    styles,
    /\.settings-control\s*\{[^}]*gap:\s*var\(--space-2\);/su,
  );
  assert.doesNotMatch(
    styles.match(/\.settings-control\s*\{[^}]*\}/su)?.[0] ?? "",
    /0\.45rem/u,
  );
});

test("Notes primary actions stay intrinsic instead of becoming full-width bars", () => {
  assert.equal(
    (
      settings.match(/className="primary-button settings-inline-action"/gu) ??
      []
    ).length,
    2,
  );
  assert.match(
    styles,
    /\.settings-control > \.settings-inline-action\s*\{[^}]*align-self:\s*flex-start;/su,
  );
});
