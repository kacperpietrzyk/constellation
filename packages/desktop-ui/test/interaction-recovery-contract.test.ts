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

  it("returns focus from global search to the exact invoking control", () => {
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
    assert.match(
      searchOverlay,
      /matchedFields\.includes\("body"\) \? "Treść · " : ""/,
    );
    assert.match(
      realApp,
      /nextSurface === "documents"[\s\S]*state\.snapshot\.knowledge[\s\S]*documents\.find[\s\S]*documentContext\(id, document\.title\)/,
    );
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
    assert.match(
      surfaces,
      /<h2 id="outcomes-title">Wyniki do osiągnięcia<\/h2>/,
    );
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
    assert.match(surfaces, /className="task-control-strip"/);
    assert.match(surfaces, /className="task-column-head"/);
    assert.match(surfaces, /const filteredTasks = snapshot\.tasks\.filter/);
    assert.match(surfaces, /itemCount: filteredTasks\.length/);
    assert.match(surfaces, /Brak zadań w tym widoku/);
    assert.match(surfaces, /Wyczyść filtry/);
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
    for (const heading of ["Klient", "Spotkania", "Dokumenty", "Decyzje"])
      assert.match(projectContextSections, new RegExp(`title: "${heading}"`));
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
    assert.match(
      collaborationSurfaces,
      /Skrzynka uwagi jest chwilowo niedostępna[\s\S]*Spróbuj ponownie/,
    );
    assert.match(
      collaborationSurfaces,
      /Nic nie wymaga reakcji[\s\S]*nie tworzy długu uwagi/,
    );
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
    assert.match(
      realApp,
      /<h1 id="surface-title" tabIndex=\{-1\}>\s*Nie udało się otworzyć tej części aplikacji/s,
    );
    assert.match(
      realApp,
      /<h1 id="surface-title" tabIndex=\{-1\}>\s*Otwieram tę część aplikacji…/s,
    );
    assert.match(
      meetings,
      /<h1 id="surface-title" className="sr-only" tabIndex=\{-1\}>\s*Otwieram spotkania…/s,
    );
    assert.match(
      meetings,
      /<h1 id="surface-title" tabIndex=\{-1\}>\s*Spotkania są chwilowo niedostępne/s,
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
    assert.match(
      strategicCreate,
      /launcherOpen \? "Zamknij wybór" : "Dodaj rekord"/,
    );
    assert.match(strategicCreate, /aria-expanded=\{launcherOpen\}/);
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

  it("keeps Projects as a collection until the user deliberately opens its full view", () => {
    assert.match(realApp, /onSelectProject=\{selectProjectInInspector\}/);
    assert.match(realApp, /activeProjectId=\{activeContext\.projectId\}/);
    assert.match(
      realApp,
      /surface === "projects" && activeContext\.projectId !== undefined/,
    );
    assert.match(realApp, /\(selectedProject && !projectFullView\)/);
    assert.match(surfaces, /const fullView =/);
    assert.match(surfaces, /className="project-portfolio"/);
    assert.match(surfaces, /\.\.\.projectNav\(index\)/);
    assert.match(
      surfaces,
      /onDoubleClick=\{\(\) => onOpenProject\(project\.id\)\}/,
    );
    assert.match(surfaces, /className="project-detail-flow"/);
    assert.match(surfaces, /Wróć do projektów/);
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

  it("makes managed document attachments explicit, recoverable, and responsive", () => {
    assert.match(documentsSurface, /aria-label="Załączniki"/);
    assert.match(documentsSurface, /inspectManagedPayload/);
    assert.match(documentsSurface, /restoreManagedPayload/);
    assert.match(documentsSurface, /Pobierz ponownie/);
    assert.match(documentsSurface, />\s*Odłącz\s*</s);
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
    assert.match(taskAttachments, /Pobierz ponownie/);
    assert.match(taskAttachments, />\s*Odłącz\s*</s);
    assert.match(collaborationSurfaces, /aria-label="Załączniki komentarza"/);
    assert.match(collaborationSurfaces, /Gotowy do dołączenia/);
    assert.match(collaborationSurfaces, /onInspectAttachment/);
    assert.match(collaborationSurfaces, /pendingAttachments\.map/);
    assert.match(
      styles,
      /\.managed-attachment-list li\s*\{[^}]*display:\s*flex;[^}]*min-width:\s*0/s,
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
