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
const organizationStyles = readFileSync(
  path.join(root, "src", "organization-context.css"),
  "utf8",
);
const tokens = readFileSync(path.join(root, "src", "tokens.css"), "utf8");
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
const projectRichBody = readFileSync(
  path.join(root, "src", "ProjectRichBody.tsx"),
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
const recordRemoval = readFileSync(
  path.join(root, "src", "components", "RecordRemovalSection.tsx"),
  "utf8",
);
const workSurface = readFileSync(
  path.join(root, "src", "WorkSurface.tsx"),
  "utf8",
);
const workBoardStyles = readFileSync(
  path.join(root, "src", "work-board.css"),
  "utf8",
);
const workTimelineStyles = readFileSync(
  path.join(root, "src", "work-timeline.css"),
  "utf8",
);
const workCalendarStyles = readFileSync(
  path.join(root, "src", "work-calendar.css"),
  "utf8",
);
const workDensityStyles = readFileSync(
  path.join(root, "src", "work-density.css"),
  "utf8",
);
const workFieldVisibilityStyles = readFileSync(
  path.join(root, "src", "work-field-visibility.css"),
  "utf8",
);
const collaborationSurfaces = readFileSync(
  path.join(root, "src", "CollaborationSurfaces.tsx"),
  "utf8",
);
const taskAttachments = readFileSync(
  path.join(root, "src", "TaskAttachmentsSection.tsx"),
  "utf8",
);
const projectContextSections = readFileSync(
  path.join(root, "src", "ProjectContextSections.tsx"),
  "utf8",
);
const meetings = readFileSync(
  path.join(root, "src", "MeetingsSurface.tsx"),
  "utf8",
);
const strategicSurface = readFileSync(
  path.join(root, "src", "StrategicDepthSurface.tsx"),
  "utf8",
);
const strategicCreate = readFileSync(
  path.join(root, "src", "StrategicCreatePanel.tsx"),
  "utf8",
);
const searchOverlay = surfaces.slice(
  surfaces.indexOf("export const SearchOverlay"),
  surfaces.indexOf("export const UndoDialog"),
);

// A slice taken between two literals passes every assertion vacuously the
// moment one literal moves. This helper refuses to hand back an empty or
// inverted slice, so a moved anchor fails loudly instead of turning the
// assertions over it into green nothing.
const sliceBetween = (
  source: string,
  start: string,
  end: string,
  label: string,
): string => {
  const from = source.indexOf(start);
  assert.ok(from > -1, `${label}: opening anchor ${start} is missing`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `${label}: closing anchor ${end} is missing`);
  const slice = source.slice(from, to);
  assert.ok(slice.trim().length > 0, `${label}: slice is empty`);
  return slice;
};

// Source comments discuss the rules the copy has to obey ("the copy never says
// permanently"), so a claim ABOUT the copy has to be checked against the copy —
// otherwise a comment quoting the forbidden word fails an honest file. Only
// whole-line comments are stripped, deliberately: a `//` anywhere on a line
// would also swallow the rest of a line of real copy (a protocol-relative
// `//docs…/` href is enough), and a forbidden word after it would go unseen.
// Stripping less keeps the claim about the copy honest.
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const assertSearchOverlaySliced = () =>
  assert.ok(
    searchOverlay.length > 0 &&
      searchOverlay.includes("export const SearchOverlay"),
    "The SearchOverlay slice is empty — every assertion over it would pass vacuously.",
  );

describe("interaction recovery contracts", () => {
  it("keeps global-search failure content-safe and explicitly recoverable", () => {
    assertSearchOverlaySliced();
    // The guarantee is the recovery shape, not the words on the buttons: a
    // failed search announces itself as an alert and offers two ways forward
    // inside that alert.
    assert.match(
      searchOverlay,
      /state\.kind === "error" \? \(\s*<div className="search-empty" role="alert">[\s\S]{0,600}?className="search-empty-actions"/,
    );
    assert.match(surfaces, /ref=\{searchInputRef\}/);
    // Retry: focus returns to the input and the attempt counter moves. The
    // counter is an effect dependency, so bumping it genuinely re-runs the
    // query — that chain is what "recoverable" means here.
    assert.match(
      searchOverlay,
      /searchInputRef\.current\?\.focus\(\);\s*setSearchAttempt\(\(attempt\) => attempt \+ 1\);/,
    );
    assert.match(surfaces, /\[client, query, searchAttempt, snapshot\]/);
    // Clear: focus returns to the input and the query is emptied.
    assert.match(
      searchOverlay,
      /searchInputRef\.current\?\.focus\(\);\s*setQuery\(""\);/,
    );
    // Positive counterpart for the negative below: a rejected search IS caught
    // and turned into a state, so the doesNotMatch cannot pass on a file that
    // simply stopped handling errors.
    assert.match(
      searchOverlay,
      /\.catch\(\(\) => active && setState\(\{ kind: "error" \}\)\)/,
    );
    assert.doesNotMatch(
      surfaces,
      /error instanceof Error\s*\?\s*error\.message/,
      "Renderer errors can contain paths or provider details and must not be shown verbatim.",
    );
  });

  it("returns focus from global search to the exact invoking control", () => {
    assertSearchOverlaySliced();
    assert.match(
      searchOverlay,
      /const returnTargetRef = useRef<HTMLElement \| null>/,
    );
    assert.match(
      searchOverlay,
      /const activeElement = document\.activeElement/,
    );
    assert.match(
      searchOverlay,
      /returnTarget\?\.isConnected && !returnTarget\.hasAttribute\("disabled"\)/,
    );
    assert.match(
      searchOverlay,
      /returnTarget\.focus\(\{ preventScroll: true \}\)/,
    );
  });

  it("opens a document-body result as the exact document context", () => {
    assertSearchOverlaySliced();
    // A body hit must be marked as one, or the row shows a snippet the title
    // does not explain. The guarantee is the distinguishing prefix, not the
    // word chosen for it — so the label is required to be non-empty, not to be
    // any particular string.
    assert.match(
      searchOverlay,
      /matchedFields\.includes\("body"\) \? "[^"]+ · " : ""/,
    );
    assert.match(
      realApp,
      /nextSurface === "library"[\s\S]*state\.snapshot\.knowledge[\s\S]*documents\.find[\s\S]*documentContext\(id, document\.title\)/,
    );
  });

  it("offers the same removal an agent has, and explains the block before the click", () => {
    // The kernel refuses to remove a record other work still points at. The
    // inspector holds the same projection the guard reads, so it says which
    // work blocks the removal instead of letting the owner click into a
    // precondition error.
    assert.match(realApp, /<RecordRemovalSection/);
    assert.match(
      realApp,
      /dependentLabels=\{strategicDependentLabels\(record, records\)\}/,
    );
    assert.match(
      realApp,
      /strategicRecordReferences\(candidate\)\.includes\(record\.id\)/,
    );
    // The blocked branch names what points at the record AND offers no delete
    // control at all — that absence is the guarantee ("explains the block
    // before the click"), and it is structural, not a sentence.
    const blockedBranch = sliceBetween(
      recordRemoval,
      "if (dependentLabels.length > 0) {",
      "{confirming ? (",
      "blocked-removal branch",
    );
    assert.match(blockedBranch, /dependentLabels\.join\(", "\)/);
    // Positive counterpart: the file does render delete controls, so their
    // absence from the blocked branch is a fact rather than a vacuous pass.
    assert.match(recordRemoval, /<button/);
    assert.doesNotMatch(
      blockedBranch,
      /<button/,
      "A blocked removal must not offer a control that can only end in a precondition error.",
    );
    // This one is legitimately about words: a soft delete must never promise
    // permanence, because undo restores the record. The positive assertions
    // come first so the negative below cannot pass on a file that lost the
    // undo promise entirely.
    assert.match(recordRemoval, /You can undo it\./);
    assert.match(recordRemoval, /Undo if that was a mistake\./);
    assert.doesNotMatch(
      withoutComments(recordRemoval),
      /permanent|irreversib|cannot be undone|forever/i,
    );
  });

  it("re-reads the workspace when an external agent writes to it", () => {
    // An agent and this window are equal operators over one graph, but the
    // window holds its own projection: without this the human sees the state
    // the window opened with and reads a correct agent write as a missing one.
    // The coalescing itself now lives in client/agent-write-reload.ts and is
    // covered by behaviour there. What RealApp still owns — and all this file
    // can honestly check — is the wiring: the bridge callback feeds that
    // subscription, the workspace filter reads the CURRENT workspace, the
    // reload reaches the CURRENT reload through a ref, and the effect is laid
    // once per client so a burst cannot fall between unsubscribe and
    // resubscribe.
    assert.match(
      realApp,
      /return subscribeToAgentWrites\(\{\s*subscribe: \(listener\) => onWorkspaceChanged\(listener\),\s*currentWorkspaceId: \(\) => workspaceIdRef\.current,\s*reload: \(\) => \{\s*void reloadSnapshotRef\.current\(\);/,
    );
    assert.match(realApp, /\}\);\s*\}, \[client\]\);/);
  });

  it("gives the inspector separator a 24px pointer target without thickening its seam", () => {
    assert.match(styles, /\.inspector-resize::before\s*\{[^}]*width:\s*24px/s);
    assert.match(styles, /\.inspector-resize::after\s*\{[^}]*width:\s*1px/s);
  });

  it("returns focus from the undo preview to the invoking Activity action", () => {
    assert.match(
      surfaces,
      /const returnTargetRef = useRef<HTMLElement \| null>/,
    );
    assert.match(surfaces, /const activeElement = document\.activeElement/);
    assert.match(
      surfaces,
      /activeElement instanceof HTMLElement && activeElement !== document\.body/,
    );
    assert.match(
      surfaces,
      /returnTarget\?\.isConnected && !returnTarget\.hasAttribute\("disabled"\)/,
    );
    assert.match(surfaces, /returnTarget\.focus\(\{ preventScroll: true \}\)/);
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

  it("keeps Cockpit actions and intended outcomes in one responsive decision ledger", () => {
    assert.match(
      surfaces,
      /<div className="cockpit-grid">[\s\S]*className="active-work reading-panel"[\s\S]*\{outcomeRail\}[\s\S]*<\/div>/,
    );
    // The rail is a labelled region: the section points at the heading that
    // names it. The pairing is the guarantee; the wording is not.
    assert.match(
      surfaces,
      /className="outcome-rail reading-panel"\s+aria-labelledby="outcomes-title"/,
    );
    assert.match(surfaces, /<h2 id="outcomes-title">/);
    assert.match(
      surfaces,
      /else onSelectTask\(task\.taskId\)[\s\S]*onDoubleClick=\{\(\) => onOpenTask\(task\.taskId\)\}/,
    );
    assert.match(
      styles,
      /\.cockpit-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.2fr\) minmax\(17rem, 0\.8fr\)/s,
    );
    assert.match(
      styles,
      /@media \(max-width: 84rem\)[\s\S]*?\.cockpit-grid,[\s\S]*?grid-template-columns:\s*1fr/s,
    );
  });

  it("keeps Capture History as a compact ledger until deliberate activation", () => {
    assert.match(surfaces, /className="history-ledger"/);
    assert.match(surfaces, /className=\{`history-row/);
    assert.match(
      surfaces,
      /aria-pressed=\{selectedCaptureId === capture\.id\}/,
    );
    assert.match(surfaces, /\.\.\.captureNav\(index\)/);
    assert.match(
      surfaces,
      /onClick=\{\(\) => onSelectCapture\(capture\.id\)\}/,
    );
    assert.match(surfaces, /export const CaptureHistoryDetail/);
    assert.doesNotMatch(surfaces, /className="history-card"/);
    assert.match(realApp, /const \[selectedCaptureId, setSelectedCaptureId\]/);
    assert.match(realApp, /selectedCapture \|\|/);
    assert.match(realApp, /<CaptureHistoryDetail/);
    assert.match(
      styles,
      /\.history-ledger\s*\{[^}]*background:\s*var\(--panel-reading-bg\);[^}]*box-shadow:\s*var\(--elevation-raised\)/s,
    );
    assert.match(
      styles,
      /\.history-row\.selected\s*\{[^}]*background:\s*var\(--surface-selected\)/s,
    );
  });

  it("keeps Tasks as a filterable ledger with deliberate inspector entry", () => {
    assert.match(
      surfaces,
      /className="task-control-strip" aria-label="Task filters"/,
    );
    assert.match(surfaces, /className="task-column-head"/);
    // Keyboard navigation covers exactly the rows that are on screen.
    assert.match(surfaces, /itemCount: filteredTasks\.length/);
    // Filtering to nothing is a state with a way out, not a blank list: the
    // empty state's action clears the filters that produced it.
    assert.match(
      surfaces,
      /filteredTasks\.length === 0 \? \(\s*<InlineState[\s\S]{0,400}?onClick=\{resetFilters\}/,
    );
    assert.match(surfaces, /else onSelectTask\(task\.id\)/);
    assert.match(surfaces, /onDoubleClick=\{\(\) => onOpenTask\(task\.id\)\}/);
    assert.match(
      styles,
      /\.task-panel\s*\{[^}]*background:\s*var\(--panel-reading-bg\);[^}]*box-shadow:\s*var\(--elevation-raised\)/s,
    );
    assert.match(
      styles,
      /\.task-control-strip\s*\{[^}]*background:\s*var\(--surface-sunken\)/s,
    );
    assert.match(styles, /@container \(max-width: 42rem\)/);
  });

  it("composes Project context as navigable sections without duplicating records", () => {
    // Section identity travels on the stable key, not on the visible title.
    for (const key of ["client", "meetings", "documents", "decisions"])
      assert.match(projectContextSections, new RegExp(`key: "${key}"`));
    assert.match(projectContextSections, /overview\.clientOrganizations\.map/);
    assert.match(projectContextSections, /overview\.relatedMeetings\.map/);
    assert.match(projectContextSections, /overview\.relatedDocuments\.map/);
    assert.match(projectContextSections, /overview\.relatedDecisions\.map/);
    assert.match(projectContextSections, /onOpenDocument\(document\.id/);
    assert.match(projectContextSections, /onOpenMeeting\(meeting\.id\)/);
    assert.match(projectContextSections, /onOpenRelationship\(decision\.id\)/);
    assert.match(
      styles,
      /\.project-context-grid\s*\{[^}]*grid-template-columns/s,
    );
    assert.match(
      styles,
      /@container \(max-width: 34rem\)[\s\S]*\.project-context-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
    );
  });

  it("lets a human link and detach a client from the Klient card", () => {
    // The row has to be WIRED, not merely defined: it hangs off the Klient
    // section as a footer and is rendered outside the list/empty branch,
    // because linking the first client is exactly the empty state.
    assert.match(projectContextSections, /footer: \(\s*<ClientLinkRow/);
    assert.match(projectContextSections, /\{section\.footer\}/);
    // A read that did not land and a Space with no organizations are different
    // facts and must not share a sentence — the whole reason this branch
    // exists is a surface that said "unavailable" without naming a cause.
    assert.match(projectContextSections, /candidates === undefined \? \(/);
    assert.match(projectContextSections, /candidates\.length === 0 \? \(/);
    // These two really are about wording: the branches exist only so that a
    // read that did not land and a Space with no organizations stop sharing a
    // sentence. Asserting the branch conditions alone would let both render the
    // same "unavailable" copy and still pass.
    assert.match(projectContextSections, /Could not load organizations/);
    assert.match(
      projectContextSections,
      /No organization to link in this project/,
    );
    assert.match(projectContextSections, /className="project-context-actions"/);
    // The picker is a labelled select with an unset placeholder option, and
    // linking is disabled until something is chosen.
    assert.match(projectContextSections, /htmlFor="project-client-link"/);
    assert.match(projectContextSections, /id="project-client-link"/);
    assert.match(projectContextSections, /<option value="">/);
    assert.match(
      projectContextSections,
      /disabled=\{busy \|\| selected === ""\}/,
    );
    assert.match(
      projectContextSections,
      /onLink\(selected as StrategicRecordId\)/,
    );
    // Two steps, in place, like every other destructive verb here: a quiet
    // trigger arms the confirm, the danger control performs it, and a third
    // control disarms without acting.
    assert.match(
      projectContextSections,
      /className="ghost-button"[\s\S]{0,200}?onClick=\{\(\) => setConfirmingId\(organization\.id\)\}/,
    );
    assert.match(
      projectContextSections,
      /confirmingId === organization\.id \? \(/,
    );
    assert.match(
      projectContextSections,
      /className="status-danger"[\s\S]{0,300}?onUnlink\(organization\.id\)/,
    );
    assert.match(
      projectContextSections,
      /onClick=\{\(\) => setConfirmingId\(undefined\)\}/,
    );
    // Also legitimately about words: a client reached through an opportunity or
    // a meeting stays on the list after a detach, so the confirm has to say
    // that only the direct link goes — otherwise a working detach reads as
    // broken. Worded differently from its twin on the Organization page, so
    // this is deliberately its own regex.
    assert.match(projectContextSections, /Only the direct link goes\./);
    // The row shares the accepted in-project action row rather than declaring
    // a second geometry for the same shape. Three selectors now, since the
    // Organization page authors the same edge from the other end.
    assert.match(
      styles,
      /\.project-template-row,\s*\.organization-context__actions,\s*\.project-context-actions\s*\{[^}]*display:\s*flex/s,
    );
    // RealApp resolves both kernel preconditions; the card stays presentational.
    assert.match(realApp, /linkableClientOrganizations\(/);
    assert.match(realApp, /directClientLinks\(/);
    // Both verbs are wired to a kernel command, and neither outcome is silent:
    // success re-reads the workspace, failure is surfaced. Sliced per handler,
    // so the next handler's error path cannot stand in for this one's.
    for (const [command, until] of [
      ["void linkProjectClient(", "onUnlinkClient={"],
      ["void unlinkProjectClient(", "onUnrelate={"],
    ] as const) {
      const handler = sliceBetween(realApp, command, until, command);
      // One ordered chain, bounded: success re-reads the workspace and the
      // failure branch hangs off THAT test, so a file where showFailure drifted
      // away from the success check no longer passes on proximity alone.
      assert.match(
        handler,
        /result\.kind === "success"[\s\S]{0,200}?refreshAfter\([\s\S]{0,200}?else showFailure\(result\)/,
      );
      assert.match(handler, /else showFailure\(result\)/);
    }
  });

  it("lets a human link and detach a delivery from the client's Aktywna praca card", () => {
    // The same edge as the Klient card, authored from the other end. The row is
    // rendered outside the list/empty branch here too, because linking the
    // first delivery is exactly the empty state.
    assert.match(strategicSurface, /<DeliveryLinkRow/);
    assert.match(strategicSurface, /candidates === undefined \? \(/);
    assert.match(strategicSurface, /candidates\.length === 0 \? \(/);
    // Two projections feed this picker, so "did not load" and "there are none"
    // stay separate sentences — the same distinction the Project side draws,
    // and the same reason it is asserted as copy: identical wording in both
    // branches would satisfy the branch conditions and lose the guarantee.
    assert.match(strategicSurface, /Could not load projects/);
    assert.match(strategicSurface, /No active projects to link in this client/);
    assert.match(strategicSurface, /className="organization-context__actions"/);
    assert.match(strategicSurface, /htmlFor="organization-delivery-link"/);
    assert.match(strategicSurface, /id="organization-delivery-link"/);
    assert.match(strategicSurface, /<option value="">/);
    assert.match(strategicSurface, /onLink\(selected as ProjectId\)/);
    // Two steps, in place — the same arm/perform/disarm shape as the Klient
    // card, asserted on the wiring rather than on the verbs.
    assert.match(
      strategicSurface,
      /className="ghost-button"[\s\S]{0,200}?onClick=\{\(\) => setConfirmingId\(project\.id\)\}/,
    );
    assert.match(strategicSurface, /confirmingId === project\.id \? \(/);
    assert.match(
      strategicSurface,
      /className="status-danger"[\s\S]{0,300}?onUnlink\(project\.id\)/,
    );
    // Copy again, for the same reason as its twin: `activeProjects` unions two
    // reaches, so a delivery an opportunity also names stays listed and a
    // working detach would otherwise read as broken. Worded differently here.
    assert.match(strategicSurface, /Unlinking removes only the direct link\./);
    // The loader resolves both kernel preconditions; the card stays
    // presentational, exactly as ProjectContextSections does.
    assert.match(strategicSurface, /linkableDeliveryProjects\(/);
    assert.match(strategicSurface, /directDeliveryProjects\(/);
    for (const [command, until] of [
      ["void linkOrganizationDelivery(", "onUnlinkDelivery={"],
      ["void unlinkOrganizationDelivery(", "onOpenProject={"],
    ] as const) {
      const handler = sliceBetween(realApp, command, until, command);
      // Same ordered chain as its twin on the Klient card, and bounded for the
      // same reason.
      assert.match(
        handler,
        /result\.kind === "success"[\s\S]{0,200}?refreshAfter\([\s\S]{0,200}?else showFailure\(result\)/,
      );
      assert.match(handler, /else showFailure\(result\)/);
    }
    // The tasks below the row keep their separation from it.
    assert.match(
      organizationStyles,
      /\.organization-context__actions \+ \.organization-context__rows/,
    );
  });

  it("opens Organization as one restorable client context with real navigation", () => {
    // Seven labelled regions. Both halves of the pairing are asserted: the id
    // alone does not prove a region points at it, and the aria-labelledby alone
    // does not prove the heading exists.
    for (const region of [
      "work",
      "people",
      "pipeline",
      "renewals",
      "facts",
      "meetings",
      "docs",
    ]) {
      assert.match(
        strategicSurface,
        new RegExp(`aria-labelledby="org-${region}-title"`),
      );
      assert.match(
        strategicSurface,
        new RegExp(`<h2 id="org-${region}-title">`),
      );
    }
    assert.match(strategicSurface, /overview\.activeProjects\.map/);
    assert.match(strategicSurface, /overview\.openTasks\.map/);
    assert.match(strategicSurface, /overview\.people\.map/);
    assert.match(strategicSurface, /overview\.opportunities\.map/);
    assert.match(strategicSurface, /overview\.renewals\.map/);
    assert.match(strategicSurface, /overview\.facts\.map/);
    assert.match(strategicSurface, /overview\.meetings\.map/);
    assert.match(strategicSurface, /overview\.documents\.map/);
    assert.match(
      strategicSurface,
      /onDoubleClick=\{\(\) =>[\s\S]*onOpenOrganization/,
    );
    assert.match(strategicSurface, /event\.key !== "Enter"/);
    assert.match(realApp, /organizationContext\(id, name\)/);
    assert.match(strategicSurface, /loadOrganizationOverview\(/);
    assert.match(strategicSurface, /export const OrganizationContextLoader/);
    // A context that could not be read offers a retry that actually re-runs the
    // load (the attempt counter is what the loader effect watches).
    assert.match(
      strategicSurface,
      /state\.kind === "unavailable" && \([\s\S]{0,400}?setAttempt\(\(value\) => value \+ 1\)/,
    );
    assert.match(
      surfaces,
      /getHumanRecordKindDescriptor\(item\.recordKind\)\.inspectorSurface/,
    );
    assert.match(
      realApp,
      /nextSurface === "organizations"[\s\S]*record\?\.kind === "organization"[\s\S]*organizationContext\(record\.id, record\.name\)/,
    );
    assert.match(realApp, /onOpenProject=\{\(id, title\) =>/);
    assert.match(realApp, /onOpenTask=\{\(id, title\) =>/);
    assert.match(realApp, /onOpenDocument=\{\(id, title\) =>/);
    assert.match(
      organizationStyles,
      /\.organization-context__grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s,
    );
    assert.match(organizationStyles, /@container \(max-width: 720px\)/);
    assert.match(
      organizationStyles,
      /@media \(forced-colors: active\)[\s\S]*\.organization-context__rows/,
    );
  });

  it("keeps Attention mutations behind deliberate signal selection", () => {
    assert.match(collaborationSurfaces, /className="attention-ledger"/);
    assert.match(collaborationSurfaces, /\.\.\.attentionNav\(index\)/);
    assert.match(
      collaborationSurfaces,
      /aria-pressed=\{selectedItemId === item\.id\}/,
    );
    assert.match(collaborationSurfaces, /onClick=\{\(\) => onSelect\(item\)\}/);
    assert.match(
      collaborationSurfaces,
      /onDoubleClick=\{\(\) => onOpen\(item\)\}/,
    );
    // "Unavailable" and "empty" are different states and are branched as such:
    // the unavailable one is announced and carries a retry, the empty one does
    // not, because there is nothing to retry.
    assert.match(
      collaborationSurfaces,
      /attention\.kind === "unavailable" \? \(\s*<div className="attention-empty" role="status">[\s\S]{0,400}?onClick=\{onRetry\}/,
    );
    assert.match(
      collaborationSurfaces,
      /items\.length === 0 \? \(\s*<div className="attention-empty">/,
    );
    // Two claims that are legitimately about language. A failed read must state
    // that it changed nothing (the inbox's own action is marking as read), and
    // the empty state must promise that routine activity is not quietly piling
    // up somewhere — that promise is the surface's whole premise.
    assert.match(collaborationSurfaces, /Nothing was marked as read\./);
    assert.match(collaborationSurfaces, /never becomes a backlog\./);
    assert.match(collaborationSurfaces, /export const AttentionDetail/);
    assert.doesNotMatch(collaborationSurfaces, /className="attention-actions"/);
    assert.match(realApp, /const \[selectedAttentionId/);
    assert.match(realApp, /selectedAttention \|\|/);
    assert.match(realApp, /<AttentionDetail/);
    assert.match(
      styles,
      /\.attention-ledger\s*\{[^}]*background:\s*var\(--panel-reading-bg\);[^}]*box-shadow:\s*var\(--elevation-raised\)/s,
    );
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
      /aria-controls=\{\s*visibleTranscriptMeetingId === selectedMeeting\.id\s*\? "meeting-result-transcript-content"\s*: undefined/s,
    );
    assert.match(
      meetings,
      /<MeetingMarkdown\s+value=\{selectedMeeting\.summaryMarkdown\}/s,
    );
  });

  it("keeps Jamie results ahead of provider context in a raised work plane", () => {
    const completedIndex = meetings.indexOf('className="meeting-completed"');
    const contextIndex = meetings.indexOf('className="meeting-context-rail"');
    assert.ok(completedIndex > -1, "Jamie result plane must exist");
    assert.ok(contextIndex > completedIndex, "Provider context follows work");
    assert.match(meetings, /\{jamieConnection\}[\s\S]*meeting-results-browser/);
    assert.match(
      styles,
      /\.meeting-lanes\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(18rem, 22rem\)/s,
    );
    assert.match(
      styles,
      /\.meeting-completed\s*\{[^}]*background:\s*var\(--panel-reading-bg\)[^}]*box-shadow:\s*var\(--elevation-raised\)/s,
    );
    assert.match(
      styles,
      /\.meeting-context-rail\s*\{[^}]*background:\s*var\(--surface-sunken\)/s,
    );
    assert.doesNotMatch(
      meetings,
      /selectedMeeting[\s\S]{0,120}\?\?\s*surface\.completed\[0\]/,
      "Opening Meetings must not select or expose a result before activation.",
    );
    assert.match(meetings, /selected && inspectorHost/);
  });

  it("keeps the shell main landmark named while surfaces load or fail", () => {
    // The guarantee is that neither transient state leaves the main landmark
    // without a focusable, named h1 — not what that h1 says. RealApp already
    // carries state anchors, so they are what the heading is asserted against.
    // Sliced per state region, so a heading belonging to the OTHER state
    // cannot satisfy the assertion for this one.
    const failedState = sliceBetween(
      realApp,
      'data-surface-state="failed"',
      "</section>",
      "failed surface state",
    );
    // The two slices must stay disjoint, or the loading heading could stand in
    // for the failed one and the pair would prove nothing.
    assert.doesNotMatch(failedState, /data-surface-state="loading"/);
    assert.match(
      failedState,
      /<h1 id="surface-title" tabIndex=\{-1\}>\s*[^<\s]/,
    );
    assert.match(failedState, /data-surface-action="retry"/);
    const loadingState = sliceBetween(
      realApp,
      'data-surface-state="loading"',
      "</section>",
      "loading surface state",
    );
    assert.doesNotMatch(loadingState, /data-surface-state="failed"/);
    assert.match(
      loadingState,
      /<h1 id="surface-title" tabIndex=\{-1\}>\s*[^<\s]/,
    );
    // Meetings has no data-surface-state anchor yet, so its state classes are
    // the closest stable anchor available from a test.
    assert.match(
      meetings,
      /className="meeting-surface meeting-skeleton" aria-busy="true">\s*<h1 id="surface-title" className="sr-only" tabIndex=\{-1\}>\s*[^<\s]/,
    );
    const meetingsError = sliceBetween(
      meetings,
      'className="meeting-surface state-panel state-panel--error"',
      "</section>",
      "meetings error state",
    );
    assert.match(
      meetingsError,
      /<h1 id="surface-title" tabIndex=\{-1\}>\s*[^<\s]/,
    );
  });

  it("makes Relations one raised work plane with a quieter review rail", () => {
    assert.match(strategicSurface, /<div className="strategic-work-plane">/);
    assert.doesNotMatch(
      strategicSurface,
      /<main className="strategic-work-plane">/,
      "The Relations work plane lives inside the shell's main landmark and must not create a second main landmark.",
    );
    assert.match(
      styles,
      /\.strategic-work-plane\s*\{[^}]*background:\s*var\(--panel-reading-bg\)[^}]*box-shadow:\s*var\(--elevation-raised\)/s,
    );
    assert.match(
      styles,
      /\.strategic-ledger\s*\{[^}]*border-top:\s*1px solid var\(--border-subtle\)/s,
    );
    assert.match(
      styles,
      /\.strategic-review\s*\{[^}]*background:\s*var\(--surface-sunken\)/s,
    );
    assert.match(
      styles,
      /@container \(max-width: 480px\)[\s\S]*?\.ledger-select\s*\{[^}]*grid-column:\s*1 \/ -1/s,
    );
  });

  it("reveals strategic record types only after one deliberate create action", () => {
    assert.match(strategicCreate, /const \[launcherOpen, setLauncherOpen\]/);
    // One toggle governs the reveal, and it announces its own state.
    assert.match(
      strategicCreate,
      /className="strategic-create-toggle"\s+aria-expanded=\{launcherOpen\}/,
    );
    assert.match(strategicCreate, /onClick=\{toggleLauncher\}/);
    assert.match(
      strategicCreate,
      /launcherOpen\s*\?\s*\{ "aria-controls": "strategic-create-options" \}/s,
    );
    assert.match(
      strategicCreate,
      /\{launcherOpen && \([\s\S]*id="strategic-create-options"[\s\S]*className="strategic-create-grid"/,
    );
    assert.match(
      styles,
      /\.strategic-create-toggle\s*\{[^}]*min-height:\s*2\.75rem/s,
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
    // Groups are labelled regions, so a dense list stays navigable.
    assert.match(
      activitySurface,
      /className="activity-group"[\s\S]{0,200}?aria-labelledby=\{`activity-group-\$\{group\.key\}`\}[\s\S]{0,200}?<h3 id=\{`activity-group-\$\{group\.key\}`\}>/,
    );
    // Filtering to nothing is a state with a way out of it.
    assert.match(
      activitySurface,
      /filteredItems\.length === 0 \? \(\s*<ActivityInlineState[\s\S]{0,400}?onClick=\{resetFilters\}/,
    );
    assert.match(
      activityStyles,
      /\.activity-group\s*\{[^}]*border:[^;]+;[^}]*background:\s*var\(--surface-raised\)/s,
    );
    assert.match(
      activityStyles,
      /\.activity-controls\s*\{[^}]*background:\s*var\(--surface-sunken\)/s,
    );
  });

  it("keeps composite search and meeting-row focus visible in forced colors", () => {
    assert.match(
      styles,
      /\.task-search-control:focus-within,\s*\.task-create-title:focus-within,\s*\.capture-field input:focus-visible,[\s\S]*?\{[^}]*box-shadow:\s*var\(--focus-ring\)/s,
    );
    assert.doesNotMatch(
      styles,
      /\.meeting-result-row:focus-visible\s*\{[^}]*outline:\s*(?:0|none)/s,
      "Meeting rows must not override the shared forced-color outline.",
    );
    assert.match(
      tokens,
      /@media \(forced-colors: active\)[\s\S]*?outline-color:\s*Highlight/s,
    );
    assert.match(
      styles,
      /\.task-search-control input\s*\{[^}]*box-shadow:\s*none/s,
    );
    assert.doesNotMatch(
      styles,
      /\.task-search-control input\s*\{[^}]*outline:\s*(?:0|none)/s,
    );
    assert.match(
      activityStyles,
      /\.activity-search input\s*\{[^}]*box-shadow:\s*none/s,
    );
    assert.doesNotMatch(
      activityStyles,
      /\.activity-search input\s*\{[^}]*outline:\s*(?:0|none)/s,
    );
  });

  it("keeps the Work list linear while separating context from its reading plane", () => {
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

  it("renders one saved Task set as an accessible board without implicit drag mutation", () => {
    assert.match(workSurface, /setSavedWorkViewLayout/);
    assert.match(
      workSurface,
      /requestedLayout === "board" && groupBy === undefined/,
    );
    // The board is one composite widget with an accessible name, and each
    // column is a named group inside it.
    assert.match(
      workSurface,
      /className="work-task-board"\s+role="listbox"\s+aria-label="Next actions — board"/,
    );
    assert.match(
      workSurface,
      /className="work-board-column"\s+role="group"\s+aria-label=\{group\.label\}/,
    );
    // An empty group still renders a cell, so the board shows the whole
    // grouping rather than silently dropping columns.
    assert.match(workSurface, /group\.tasks\.length === 0 \? \(\s*<p>/);
    // Board without grouping is refused, and the reason is wired to the
    // disabled control as its description rather than left as loose text.
    assert.match(
      workSurface,
      /aria-describedby=\{\s*groupBy === undefined\s*\?\s*"work-board-requirement"/,
    );
    assert.match(
      workSurface,
      /groupBy === undefined && \(\s*<small id="work-board-requirement">/,
    );
    assert.doesNotMatch(workSurface, /draggable=|onDrag|onDrop/);
    assert.match(
      workBoardStyles,
      /\.work-task-board\s*\{[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto/s,
    );
    assert.match(
      workBoardStyles,
      /@container \(max-width: 38\.75rem\)[\s\S]*?\.work-task-board\s*\{[^}]*grid-auto-columns:\s*minmax\(13\.25rem, 82%\)/s,
    );
  });

  it("projects Task timing on a non-draggable timeline without replacing Saved View order", () => {
    // The layout switch is a pressed-state control that writes the layout, not
    // a word on a button.
    assert.match(
      workSurface,
      /aria-pressed=\{activeLayout === "timeline"\}[\s\S]{0,300}?changeLayout\("timeline"\)/,
    );
    assert.match(
      workSurface,
      /className="work-task-timeline"\s+role="listbox"\s+aria-label="Next actions — timeline"/,
    );
    assert.match(workSurface, /visibleTasks\.map\(\(task, index\) =>/);
    assert.match(workSurface, /task\.startAt \?\? task\.dueAt/);
    assert.match(workSurface, /task\.dueAt \?\? task\.startAt/);
    // A task with no dates still gets a row, marked as unscheduled instead of
    // being dropped off the axis.
    assert.match(workSurface, /className="work-timeline-unscheduled"/);
    assert.doesNotMatch(workSurface, /draggable=|onDrag|onDrop|onResize/);
    assert.match(
      workTimelineStyles,
      /\.work-task-timeline\s*\{[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto/s,
    );
    assert.match(
      workTimelineStyles,
      /\.work-timeline-content\s*\{[^}]*min-width:\s*36rem/s,
    );
  });

  it("renders every Saved View Task once in a navigable month calendar without invoking calendar writes", () => {
    assert.match(
      workSurface,
      /aria-pressed=\{activeLayout === "calendar"\}[\s\S]{0,300}?changeLayout\("calendar"\)/,
    );
    assert.match(workSurface, /<nav aria-label="Month navigation">/);
    assert.match(workSurface, /aria-label="Previous month"/);
    assert.match(workSurface, /aria-label="Next month"/);
    assert.match(workSurface, /task\.dueAt \?\? task\.startAt/);
    assert.match(workSurface, /calendarTasksByDate\.set/);
    // "Every Task once" is the bucketing, not the bucket labels: a task lands
    // in the month grid or in exactly one of three overflow buckets, and all
    // three are rendered.
    assert.match(workSurface, /calendarUndatedTasks\.push\(task\)/);
    assert.match(workSurface, /calendarBeforeTasks\.push\(task\)/);
    assert.match(workSurface, /calendarAfterTasks\.push\(task\)/);
    assert.match(
      workSurface,
      /const calendarOverflowGroups = \[[\s\S]{0,200}?tasks: calendarBeforeTasks[\s\S]{0,200}?tasks: calendarAfterTasks[\s\S]{0,200}?tasks: calendarUndatedTasks/,
    );
    assert.match(workSurface, /calendarOverflowGroups\.map\(/);
    assert.match(workSurface, /setCalendarMonthKey/);
    assert.doesNotMatch(
      workSurface,
      /previewCalendarBlocks|confirmCalendarBlocks|calendarWriter|draggable=|onDrag|onDrop/,
    );
    assert.match(
      workCalendarStyles,
      /\.work-calendar-scroll\s*\{[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto/s,
    );
    assert.match(
      workCalendarStyles,
      /\.work-calendar-grid\s*\{[^}]*grid-template-columns:\s*repeat\(7,/s,
    );
  });

  it("changes only Work spacing through a local per-surface density preference", () => {
    assert.match(workSurface, /useSurfaceDensity\("work"\)/);
    assert.match(workSurface, /data-density=\{density\}/);
    // A named fieldset with two mutually pressed options — the accessible name
    // is the guarantee that this control is findable at all.
    assert.match(
      workSurface,
      /<fieldset className="work-density-switch">\s*<legend>Work surface density<\/legend>/,
    );
    assert.match(
      workSurface,
      /aria-pressed=\{density === "comfortable"\}[\s\S]{0,200}?setDensity\("comfortable"\)/,
    );
    assert.match(
      workSurface,
      /aria-pressed=\{density === "compact"\}[\s\S]{0,200}?setDensity\("compact"\)/,
    );
    assert.match(
      workDensityStyles,
      /\.work-surface\[data-density="compact"\] \.work-context-row/,
    );
    assert.match(
      workDensityStyles,
      /\.work-surface\[data-density="compact"\] \.work-board-column/,
    );
    assert.match(
      workDensityStyles,
      /\.work-surface\[data-density="compact"\] \.work-timeline-row/,
    );
    assert.match(
      workDensityStyles,
      /\.work-surface\[data-density="compact"\] \.work-calendar-day/,
    );
    assert.match(
      workDensityStyles,
      /@container \(max-width: 38\.75rem\)[\s\S]*?\.work-header\s*\{[^}]*flex-direction:\s*column/,
    );
    for (const match of workDensityStyles.matchAll(
      /\.work-surface\[data-density="compact"\][^{]+\{([^}]*)\}/g,
    )) {
      assert.doesNotMatch(
        match[1] ?? "",
        /display\s*:|visibility\s*:|font-size\s*:/,
        "compact density may change spacing but must not hide content or shrink type",
      );
    }
  });

  it("configures personal Work list fields without hiding title, state, or narrow labels", () => {
    assert.match(workSurface, /useWorkListFieldVisibility\(/);
    assert.match(workSurface, /activeView\?\.id \?\? "all"/);
    // Structural half of "without hiding title": the toggleable field list is
    // real, and no entry in it can switch the title off.
    assert.match(workSurface, /\{ key: "context", label: "Context" \}/);
    assert.doesNotMatch(
      workSurface,
      /\{ key: "title",/,
      "The title must not be one of the fields a person can switch off.",
    );
    // Copy half, kept on purpose: this is the promise the panel makes about
    // what stays visible and about the choice being device-local rather than a
    // change to the shared Saved View. The doesNotMatch below enforces the
    // second half of that promise.
    assert.match(workSurface, /Title and action state always show\./);
    assert.match(workSurface, /This choice is local\s+to this device\./);
    assert.match(workSurface, /type="checkbox"/);
    assert.match(workSurface, /onClick=\{resetListFields\}/);
    assert.match(workSurface, /className="work-list-field-headings"/);
    assert.match(workSurface, /className="work-list-field-cell"/);
    assert.doesNotMatch(
      workSurface,
      /setSavedWorkView.*Field|commandName:\s*"savedView\.update"[\s\S]*visible/,
    );
    assert.match(
      workFieldVisibilityStyles,
      /\.work-list-field-headings,[\s\S]*?grid-template-columns:\s*repeat\(/,
    );
    assert.match(
      workFieldVisibilityStyles,
      /@container \(max-width: 64rem\)[\s\S]*?\.work-list-columns\s*\{[^}]*display:\s*none/s,
    );
    assert.match(
      workFieldVisibilityStyles,
      /\.work-list-field-cell > small\s*\{[^}]*display:\s*block/s,
    );
  });

  it("collapses labelled navigation groups without hiding rail destinations or hidden focus targets", () => {
    assert.match(realApp, /useCollapsedNavigationGroups\(\)/);
    assert.match(realApp, /aria-expanded=\{expanded\}/);
    assert.match(realApp, /aria-controls=\{groupId\}/);
    assert.match(realApp, /role="group"/);
    assert.match(realApp, /hidden=\{!expanded\}/);
    assert.match(
      realApp,
      /const expanded =\s*railMode \|\| !collapsedNavigationGroups\.includes\(group\)/,
    );
    assert.match(
      realApp,
      /\.nav-item, \.nav-group-toggle[\s\S]*?button\.closest\("\[hidden\]"\) === null/,
    );
    assert.match(styles, /\.nav-group-toggle\s*\{[^}]*min-height:\s*2rem/s);
  });

  it("keeps Projects as a collection until the user deliberately opens its full view", () => {
    assert.match(realApp, /onSelectProject=\{selectProjectInInspector\}/);
    assert.match(realApp, /activeProjectId=\{activeContext\.projectId\}/);
    assert.match(
      realApp,
      /surface === "projects" && activeContext\.projectId !== undefined/,
    );
    assert.match(realApp, /\(selectedProject && !projectFullView\)/);
    assert.match(
      surfaces,
      /className="project-portfolio" aria-label="Project list"/,
    );
    assert.match(surfaces, /\.\.\.projectNav\(index\)/);
    assert.match(
      surfaces,
      /onDoubleClick=\{\(\) => onOpenProject\(project\.id\)\}/,
    );
    assert.match(surfaces, /className="project-detail-flow"/);
    // The way back out of the full view exists, and only in the full view —
    // that gating is the guarantee, not the label on the button.
    assert.match(
      surfaces,
      /\{fullView && \([\s\S]{0,300}?onClick=\{onBackToProjects\}/,
    );
    assert.match(
      surfaces,
      /aria-controls=\{creating \? "project-create-form" : undefined\}/,
    );
    assert.match(
      styles,
      /\.project-portfolio\s*\{[^}]*border:[^;]+;[^}]*background:\s*var\(--panel-reading-bg\);[^}]*box-shadow:\s*var\(--elevation-rest\)/s,
    );
    assert.match(
      styles,
      /\.project-detail-flow\s*\{[^}]*display:\s*grid;[^}]*gap:[^;]+;[^}]*margin:\s*0 auto/s,
    );
  });

  it("makes an opened Project a recoverable collaborative document", () => {
    assert.match(
      surfaces,
      /lazy\(\(\) => import\("\.\/ProjectRichBody\.js"\)\)/,
    );
    assert.match(projectRichBody, /kind: "project", projectId: project\.id/);
    assert.match(projectRichBody, /Collaboration\.configure\(/);
    assert.match(projectRichBody, /openCollaborativeContent/);
    assert.match(projectRichBody, /persistCollaborativeContentUpdate/);
    assert.match(projectRichBody, /DOCUMENT_ENTITY_ACTIVATE_EVENT/);
    assert.match(projectRichBody, /createCollaborativeContentRevision/);
    assert.match(projectRichBody, /restoreCollaborativeContentRevision/);
    assert.match(
      projectRichBody,
      /setContentGeneration\(\(value\) => value \+ 1\)/,
    );
    assert.match(
      styles,
      /@container \(max-width: 34rem\)[\s\S]*?\.project-revision-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
    );
  });

  it("keeps Document creation progressive and the editor on a distinct reading plane", () => {
    assert.match(
      documentsSurface,
      /className="knowledge-create-bar"\s+aria-label="Create in the library"/,
    );
    // The two create paths are separately discoverable by name; the accessible
    // name is what makes each one findable, so it is asserted as one.
    assert.match(documentsSurface, /label="Add source"/);
    assert.match(documentsSurface, /label="New content"/);
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

  it("makes managed document attachments explicit, recoverable, and responsive", () => {
    assert.match(
      documentsSurface,
      /className="document-attachment-list" aria-label="Attachments"/,
    );
    assert.match(documentsSurface, /inspectManagedPayload/);
    // "Recoverable": a payload the device no longer holds — and only then —
    // offers a control that re-fetches it into custody.
    assert.match(
      documentsSurface,
      /custodyState === "unavailable" && \(\s*<button[\s\S]{0,400}?restoreManagedPayload\?\.\(/,
    );
    // "Explicit": detaching removes exactly this source from the evidence set
    // rather than deleting anything.
    assert.match(
      documentsSurface,
      /selectedSources\.filter\(\s*\(id\) => id !== item\.recordId,?\s*\)/,
    );
    assert.match(
      styles,
      /\.document-inspector-detail\s*\{[^}]*container-type:\s*inline-size/s,
    );
    assert.match(
      styles,
      /@container \(max-width: 32rem\)[\s\S]*?\.document-attachment-actions\s*\{[^}]*flex-direction:\s*column[\s\S]*?\.document-attachment-list li\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
    );
  });

  it("reuses managed custody for Task and comment attachments", () => {
    assert.match(taskAttachments, /stageManagedAttachment/);
    assert.match(taskAttachments, /inspectManagedPayload/);
    assert.match(taskAttachments, /attachmentSourceIds/);
    // The same custody contract as the document list: re-fetch offered only
    // when the payload is gone, detach offered always.
    assert.match(
      taskAttachments,
      /custody\[attachment\.sourceId\] === "unavailable" && \(\s*<button[\s\S]{0,400}?onRestore\(attachment\)/,
    );
    assert.match(taskAttachments, /onClick=\{\(\) => unlink\(attachment\)\}/);
    assert.match(collaborationSurfaces, /aria-label="Comment attachments"/);
    assert.match(collaborationSurfaces, /onInspectAttachment/);
    // Staged-but-not-yet-sent attachments are their own named list, so a person
    // can tell what is already on the comment from what is about to be.
    assert.match(
      collaborationSurfaces,
      /className="managed-attachment-list pending"\s+aria-label="New comment attachments"/,
    );
    assert.match(collaborationSurfaces, /pendingAttachments\.map/);
    assert.match(
      styles,
      /\.managed-attachment-list li\s*\{[^}]*display:\s*flex;[^}]*min-width:\s*0/s,
    );
  });

  it("keeps Access ledgers primary and opens grant construction deliberately", () => {
    // One shell for both deliberate acts: issuing a grant and changing one.
    // "One shell" is enforced by there being exactly one modal opener in the
    // file — a second surface growing its own dialog would break this.
    assert.match(accessSurface, /const AccessDialog =/);
    assert.equal(
      (accessSurface.match(/\.showModal\(\)/g) ?? []).length,
      1,
      "Every Access dialog must go through the one AccessDialog shell.",
    );
    // Three deliberate entries into that shell, each gated on its own state.
    assert.match(
      accessSurface,
      /openCreation === "person" && \(\s*<AccessDialog/,
    );
    assert.match(
      accessSurface,
      /openCreation === "agent" && \(\s*<AccessDialog/,
    );
    assert.match(
      accessSurface,
      /rescoping !== undefined && \(\s*<AccessDialog/,
    );
    assert.match(accessSurface, /aria-haspopup="dialog"/);
    // The dimensions of a grant are named groups, not loose inputs. A legend is
    // the group's accessible name, so the text is the anchor here.
    assert.match(accessSurface, /<legend>Capability level<\/legend>/);
    assert.match(
      accessSurface,
      /className="agent-space-scope"[\s\S]{0,300}?<legend>Data scope<\/legend>/,
    );
    assert.match(
      accessSurface,
      /agentTransport === "remote_hub" && \(\s*<fieldset className="agent-federation-scope">\s*<legend>Cross-workspace boundaries<\/legend>/,
    );
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
