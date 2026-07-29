import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { strategicRecordReferences } from "@constellation/contracts";
import type {
  CaptureId,
  CaptureOriginal,
  CommandId,
  DocumentId,
  PrincipalId,
  ProjectId,
  RelationId,
  StrategicRecordId,
  TaskId,
} from "@constellation/contracts";
import type {
  CapturePayloadResponse,
  ConstellationRendererClient,
  DesktopBuildInfo,
} from "@constellation/desktop-preload/client";
import {
  desktopSurfaceRegistry,
  type LazyDesktopSurface,
} from "@constellation/desktop-preload/surface-registry";

import { Icon } from "./components/Icon.js";
import { NarrativeGap } from "./components/RecordNarrative.js";
import {
  ShortcutsOverlay,
  modifierLabel,
  surfaceShortcutHint,
  type SurfaceShortcutHint,
} from "./components/ShortcutsOverlay.js";
import { recordNarrativeGaps } from "./record-narrative.js";
import { RecordRemovalSection } from "./components/RecordRemovalSection.js";
import { TaskRemovalSection } from "./components/TaskRemovalSection.js";
import { TaskReservationSection } from "./components/TaskReservationSection.js";
import {
  navigationGroups,
  useCollapsedNavigationGroups,
} from "./hooks/useCollapsedNavigationGroups.js";
import { useDismissiblePanel } from "./hooks/useDismissiblePanel.js";
import {
  AttentionDetail,
  AttentionSurface,
  CommentsPanel,
} from "./CollaborationSurfaces.js";
import {
  recurrenceCadenceLabels,
  strategicStateLabels,
} from "./strategic-labels.js";
import {
  countLabel,
  dateKeyInZone,
  formatDate,
  formatDateTime,
  instantForZonedDate,
  recordKindLabels,
} from "./i18n.js";

import {
  CaptureHistoryDetail,
  CockpitSurface,
  HistorySurface,
  ProjectsSurface,
  SearchOverlay,
  TasksSurface,
  UndoDialog,
} from "./Wave2Surfaces.js";
import {
  addWorkspaceMember,
  addComment,
  editComment,
  applyTemplateToProject,
  createProject,
  directClientLinks,
  linkableClientOrganizations,
  linkOrganizationDelivery,
  linkProjectClient,
  unlinkOrganizationDelivery,
  unlinkProjectClient,
  createTask,
  setRecordFieldValue,
  updateTaskDetails,
  type FieldValue,
  loadDesktopSnapshot,
  loadProjectOverview,
  loadComments,
  loadDocumentBacklinks,
  previewUndo,
  revokeWorkspaceMember,
  relateTask,
  setTaskCompletion,
  setTaskAssignment,
  setTaskStatus,
  setWorkspaceMemberAccess,
  setCommentResolved,
  setProjectLifecycle,
  stageManagedAttachment,
  submitQuickCapture,
  undoCommand,
  unrelateTask,
  updateAreaResponsibility,
  updateInitiativeOutcome,
  updateProjectOutcome,
  updateAttention,
  createAgentGrant,
  rotateAgentCredential,
  updateAgentGrantScope,
  revokeAgentGrant,
  createRemoteAgentGrant,
  rotateRemoteAgentCredential,
  revokeRemoteAgentGrant,
  routeCaptureException,
  requestVoiceAudioDeletion,
  resolveCaptureException,
  type AttentionInboxProjection,
  type AuditReceiptProjection,
  type DesktopSnapshot,
  type DocumentBacklinksProjection,
  type MutationFailure,
  type ProjectOverviewProjection,
  type CommentListProjection,
  type DataSlice,
  type RelationshipWorkspaceProjection,
  type UndoPreview,
} from "./client/workflow.js";
import {
  activateShellContext,
  activeShellContext,
  canMoveShellHistory,
  closeShellContext,
  createShellNavigation,
  destinationShortcutIndex,
  destinationContext,
  documentContext,
  moveShellHistory,
  navigateShellContext,
  openShellContextReportingEviction,
  organizationContext,
  projectContext,
  pruneInaccessibleShellContexts,
  restoreShellNavigation,
  serializeShellNavigation,
  taskContext,
  type ShellContext,
} from "./client/shell-navigation.js";
import { subscribeToAgentWrites } from "./client/agent-write-reload.js";
import {
  settingsCategories,
  settingsCategoryElementId,
} from "./settings-categories.js";
import {
  conditionCopy,
  type PreviewCondition,
  type SurfaceId,
} from "./client/wave2-fixtures.js";
import type { WorkContextKind } from "./WorkSurface.js";
import {
  MAX_VOICE_NOTE_BYTES,
  startVoiceRecording,
  type VoiceRecordingSession,
} from "./voice-recorder.js";

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "recovery"; readonly build: DesktopBuildInfo }
  | { readonly kind: "unavailable" | "error"; readonly message: string }
  | { readonly kind: "ready"; readonly snapshot: DesktopSnapshot };

const taskPriorityLabels: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

type DocumentBacklinkTarget = {
  readonly targetKind:
    "task" | "project" | "person" | "organization" | "meeting";
  readonly targetId: string;
};

const backlinkRoleLabels = {
  note: "Note",
  document: "Document",
  deliverable: "Deliverable",
} as const;

const DocumentBacklinks = ({
  client,
  snapshot,
  target,
  onOpenDocument,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly target: DocumentBacklinkTarget | undefined;
  readonly onOpenDocument: (documentId: DocumentId, title: string) => void;
}) => {
  const [projection, setProjection] = useState<DocumentBacklinksProjection>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!client || !target) {
      setProjection(undefined);
      setUnavailable(false);
      return;
    }
    let active = true;
    setProjection(undefined);
    setUnavailable(false);
    void loadDocumentBacklinks(client, snapshot, target)
      .then((next) => active && setProjection(next))
      .catch(() => active && setUnavailable(true));
    return () => {
      active = false;
    };
  }, [client, snapshot, target?.targetId, target?.targetKind]);

  if (!target) return null;
  return (
    <section className="inspector-section entity-backlinks" aria-live="polite">
      <p className="section-label">Mentioned in documents</p>
      {unavailable ? (
        <p className="entity-backlinks-status">
          Mentions are unavailable right now.
        </p>
      ) : projection === undefined ? (
        <p className="entity-backlinks-status">Checking mentions…</p>
      ) : projection.items.length === 0 ? (
        <p className="entity-backlinks-status">No mentions.</p>
      ) : (
        <ul className="entity-backlinks-list">
          {projection.items.map((item) => (
            <li key={item.documentId}>
              <button
                type="button"
                onClick={() => onOpenDocument(item.documentId, item.title)}
              >
                <span>{item.title}</span>
                <small>{backlinkRoleLabels[item.role]}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const loadDocumentsSurface = () => import("./DocumentsSurface.js");
const DocumentsSurface = lazy(() =>
  loadDocumentsSurface().then((module) => ({
    default: module.DocumentsSurface,
  })),
);
const TaskAttachmentsSection = lazy(() =>
  import("./TaskAttachmentsSection.js").then((module) => ({
    default: module.TaskAttachmentsSection,
  })),
);
const loadMeetingsSurface = () => import("./MeetingsSurface.js");
const MeetingsSurface = lazy(() =>
  loadMeetingsSurface().then((module) => ({ default: module.MeetingsSurface })),
);
const loadActivitySurface = () => import("./ActivitySurface.js");
const ActivitySurface = lazy(() =>
  loadActivitySurface().then((module) => ({ default: module.ActivitySurface })),
);
const loadSettingsSurface = () => import("./SettingsSurface.js");
const SettingsSurface = lazy(() =>
  loadSettingsSurface().then((module) => ({ default: module.SettingsSurface })),
);
const loadWorkSurface = () => import("./WorkSurface.js");
const WorkSurface = lazy(() =>
  loadWorkSurface().then((module) => ({ default: module.WorkSurface })),
);
const loadAccessSurface = async () => {
  await import("./access-surface.css");
  return import("./AccessSurface.js");
};
const AccessSurface = lazy(() =>
  loadAccessSurface().then((module) => ({ default: module.AccessSurface })),
);
const loadStrategicDepthSurface = async () => {
  await import("./organization-context.css");
  return import("./StrategicDepthSurface.js");
};
const StrategicDepthSurface = lazy(() =>
  loadStrategicDepthSurface().then((module) => ({
    default: module.StrategicDepthSurface,
  })),
);
const OrganizationContextLoader = lazy(() =>
  loadStrategicDepthSurface().then((module) => ({
    default: module.OrganizationContextLoader,
  })),
);
// Onboarding i recovery są modalne oraz rzadkie; ich kod nie należy do
// wejściowego chunku renderera.
const OnboardingFlow = lazy(() =>
  import("./OnboardingFlow.js").then((module) => ({
    default: module.OnboardingFlow,
  })),
);
const WorkspaceRecovery = lazy(() =>
  import("./WorkspaceRecovery.js").then((module) => ({
    default: module.WorkspaceRecovery,
  })),
);

// Eksportowane wyłącznie po to, żeby test mógł sprawdzić KOMPLETNOŚĆ tej mapy
// bez czytania pliku źródłowego. Klauzula `satisfies` niżej pilnuje jej dziś na
// etapie kompilacji, ale pilnuje jej TYLKO TUTAJ — gdyby ktoś ją przy rozbiciu
// powłoki zgubił, nic by nie padło. Nie wołaj tych loaderów w teście na Node:
// `access` i `relationships` robią `await import("./*.css")`, czego `node --test`
// nie rozwiąże. Sprawdzaj obecność klucza, nie wynik wywołania.
export const lazySurfaceLoaders = {
  library: loadDocumentsSurface,
  meetings: loadMeetingsSurface,
  activity: loadActivitySurface,
  settings: loadSettingsSurface,
  work: loadWorkSurface,
  access: loadAccessSurface,
  organizations: loadStrategicDepthSurface,
} satisfies Record<LazyDesktopSurface, () => Promise<unknown>>;

const preloadSurface = (surface: SurfaceId) => {
  const loader = lazySurfaceLoaders[surface as LazyDesktopSurface];
  if (loader !== undefined) void loader().catch(() => undefined);
};

class LazySurfaceBoundary extends Component<
  { readonly children: ReactNode; readonly label: string },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (this.state.failed) {
      return (
        // `data-surface-state` i `data-surface-action`: gwarancją jest „powierzchnia,
        // której nie da się otworzyć, ZAWSZE proponuje ponowienie" — a nie to, jakimi
        // słowami to mówi. Smoke sprawdzał to dopasowaniem polskiej treści, więc flip
        // na angielski wywaliłby test, który pilnuje czegoś prawdziwego.
        <section
          className="surface-load-state"
          data-surface-state="failed"
          role="alert"
        >
          <p className="eyebrow">{this.props.label}</p>
          <h1 id="surface-title" tabIndex={-1}>
            Could not open this part of the app
          </h1>
          <p>Nothing was changed. Refresh the app and try again.</p>
          <button
            className="secondary-button"
            data-surface-action="retry"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}

const SurfaceLoadingState = ({ label }: { readonly label: string }) => (
  <section
    className="surface-load-state"
    data-surface-state="loading"
    aria-busy="true"
    aria-live="polite"
  >
    <p className="eyebrow">{label}</p>
    <h1 id="surface-title" tabIndex={-1}>
      Opening this part of the app…
    </h1>
    <p>Loading the current workspace content.</p>
  </section>
);

type AgentGrantDetails = {
  readonly title: string;
  readonly descriptorLabel: string;
  readonly descriptorPath: string;
  readonly connectionLabel: string;
  readonly connectionValue: string;
};

const AgentGrantDetailsDialog = ({
  details,
  onClose,
}: {
  readonly details: AgentGrantDetails;
  readonly onClose: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState<string>();
  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied(undefined);
    }
  };
  return (
    <dialog
      ref={dialogRef}
      className="capture-backdrop"
      aria-labelledby="agent-grant-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="capture-dialog agent-grant-dialog">
        <header className="capture-header">
          <div>
            <p className="eyebrow">MCP</p>
            <h2 id="agent-grant-title">{details.title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close access details"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <dl className="agent-grant-details">
          <div>
            <dt>{details.descriptorLabel}</dt>
            <dd className="mono">{details.descriptorPath}</dd>
            <button
              className="secondary-button"
              onClick={() => void copy("descriptor", details.descriptorPath)}
            >
              {copied === "descriptor" ? "Copied" : "Copy"}
            </button>
          </div>
          <div>
            <dt>{details.connectionLabel}</dt>
            <dd className="mono">{details.connectionValue}</dd>
            <button
              className="secondary-button"
              onClick={() => void copy("connection", details.connectionValue)}
            >
              {copied === "connection" ? "Copied" : "Copy"}
            </button>
          </div>
        </dl>
        <footer className="capture-footer">
          <span>
            Copy these values now — the MCP host asks for them at setup.
          </span>
          <button className="primary-button" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </dialog>
  );
};

const BrandMark = () => (
  <svg className="brand-mark" aria-hidden="true" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="3.2" fill="currentColor" />
    <circle cx="16" cy="4.7" r="1.55" fill="currentColor" />
    <circle cx="25.8" cy="10.3" r="1.55" fill="currentColor" />
    <circle cx="24.4" cy="22.9" r="1.55" fill="currentColor" />
    <circle cx="8.2" cy="23.7" r="1.55" fill="currentColor" />
    <circle cx="5.7" cy="10.8" r="1.55" fill="currentColor" />
    <path
      d="m16 4.7 9.8 5.6-1.4 12.6-16.2.8-2.5-12.9L16 4.7Zm0 0v11.3m9.8-5.7L16 16m8.4 6.9L16 16M8.2 23.7 16 16M5.7 10.8 16 16"
      fill="none"
      stroke="currentColor"
      strokeOpacity=".42"
      strokeWidth="1"
    />
  </svg>
);

type StrategicRecord = RelationshipWorkspaceProjection["records"][number];

const strategicRecordState = (record: StrategicRecord): string =>
  record.kind === "organization"
    ? record.relationshipState
    : "state" in record
      ? record.state
      : "current";

const strategicRecordTitle = (record: StrategicRecord): string =>
  record.kind === "organization" || record.kind === "person"
    ? record.name
    : record.kind === "relationship_fact"
      ? record.factType
      : record.kind === "saved_view"
        ? record.name
        : "title" in record
          ? record.title
          : (recordKindLabels[record.kind] ?? record.kind);

// Rekord strategiczny w shellowym inspectorze: wybór wiersza na powierzchni
// Relacje (albo klik licznika ofert/projektów) prowadzi tutaj. Powiązane
// oferty wybiera się dalej w inspectorze, a projekty otwierają się jako
// pełnoprawny kontekst shellu.
// What the kernel would refuse this removal for, in the reader's words. The
// same references strategicRecordReferences names on the kernel side, read out
// of the projection the inspector already holds — so the block is explained
// before the click, not after the rejection.
const strategicDependentLabels = (
  record: StrategicRecord,
  records: readonly StrategicRecord[],
): readonly string[] =>
  records
    .filter(
      (candidate) =>
        candidate.id !== record.id &&
        strategicRecordReferences(candidate).includes(record.id),
    )
    .map(
      (candidate) =>
        `${recordKindLabels[candidate.kind] ?? "record"}: ${strategicRecordTitle(candidate)}`,
    );

const StrategicRecordInspector = ({
  record,
  records,
  projects,
  client,
  snapshot,
  onSelectRecord,
  onOpenProject,
  onRemoved,
  onRemoveFailure,
}: {
  readonly record: StrategicRecord;
  readonly records: readonly StrategicRecord[];
  readonly projects: readonly {
    readonly id: ProjectId;
    readonly title: string;
  }[];
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly onSelectRecord: (id: string) => void;
  readonly onOpenProject: (id: ProjectId, title: string) => void;
  readonly onRemoved: (message: string) => Promise<void>;
  readonly onRemoveFailure: (result: MutationFailure) => void;
}) => {
  const state = strategicRecordState(record);
  const organization =
    "organizationId" in record && record.organizationId !== undefined
      ? records.find((item) => item.id === record.organizationId)
      : undefined;
  const organizationName =
    organization?.kind === "organization" ? organization.name : undefined;
  const relatedOpportunities =
    record.kind === "organization"
      ? records.filter(
          (item): item is Extract<StrategicRecord, { kind: "opportunity" }> =>
            item.kind === "opportunity" && item.organizationId === record.id,
        )
      : [];
  const relatedOffers =
    record.kind === "opportunity"
      ? records.filter(
          (item): item is Extract<StrategicRecord, { kind: "offer" }> =>
            item.kind === "offer" && item.opportunityId === record.id,
        )
      : [];
  const linkedProjects =
    record.kind === "opportunity"
      ? projects.filter((project) => record.projectIds.includes(project.id))
      : [];
  const parentOpportunity =
    record.kind === "offer"
      ? records.find(
          (item): item is Extract<StrategicRecord, { kind: "opportunity" }> =>
            item.kind === "opportunity" && item.id === record.opportunityId,
        )
      : undefined;
  return (
    <div className="inspector-body">
      <span className="record-status">
        <i />
        {strategicStateLabels[state] ?? state.replaceAll("_", " ")}
      </span>
      <h2>{strategicRecordTitle(record)}</h2>
      <p className="record-summary">
        {organizationName
          ? `${recordKindLabels[record.kind] ?? "Record"} in the ${organizationName} relationship.`
          : "Versioned strategic record in the active Space."}
      </p>
      {record.kind === "organization" && (
        <>
          <section className="inspector-section provenance-block">
            <p className="section-label">Next move</p>
            <blockquote>{record.nextAction ?? "No next move"}</blockquote>
            <p>This relationship carries opportunities, offers and renewals.</p>
          </section>
          <section className="inspector-section">
            <p className="section-label">
              {countLabel(
                relatedOpportunities.length,
                "opportunity",
                "opportunities",
              )}
            </p>
            {relatedOpportunities.length === 0 ? (
              <p>No opportunities linked to this relationship yet.</p>
            ) : (
              <ul className="inspector-links">
                {relatedOpportunities.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelectRecord(item.id)}
                    >
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {record.kind === "person" && (
        <section className="inspector-section">
          <p className="section-label">Contact details</p>
          <dl className="record-fields">
            <div>
              <dt>Role</dt>
              <dd>{record.role ?? "—"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{record.email ?? "—"}</dd>
            </div>
          </dl>
        </section>
      )}
      {record.kind === "opportunity" && (
        <>
          <section className="inspector-section provenance-block">
            <p className="section-label">Confirmed need</p>
            <blockquote>{record.need}</blockquote>
            <p>Next move: {record.nextAction}</p>
          </section>
          <section className="inspector-section">
            <p className="section-label">
              {countLabel(relatedOffers.length, "offer")}
            </p>
            {relatedOffers.length === 0 ? (
              <p>This opportunity has no offers yet.</p>
            ) : (
              <ul className="inspector-links">
                {relatedOffers.map((offer) => (
                  <li key={offer.id}>
                    <button
                      type="button"
                      onClick={() => onSelectRecord(offer.id)}
                    >
                      {offer.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="inspector-section">
            <p className="section-label">
              {countLabel(linkedProjects.length, "project")}
            </p>
            {linkedProjects.length === 0 ? (
              <p>This opportunity does not lead to a project yet.</p>
            ) : (
              <ul className="inspector-links">
                {linkedProjects.map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => onOpenProject(project.id, project.title)}
                    >
                      {project.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {record.kind === "offer" && (
        <section className="inspector-section provenance-block">
          <p className="section-label">Next move</p>
          <blockquote>{record.nextAction}</blockquote>
          {parentOpportunity && (
            <p>
              Opportunity:{" "}
              <button
                type="button"
                className="inspector-link"
                onClick={() => onSelectRecord(parentOpportunity.id)}
              >
                {parentOpportunity.title}
              </button>
            </p>
          )}
        </section>
      )}
      {record.kind === "renewal" && (
        <section className="inspector-section">
          <p className="section-label">Dates</p>
          <dl className="record-fields">
            <div>
              <dt>Scope</dt>
              <dd>{record.scope}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{formatDate(record.expiresAt)}</dd>
            </div>
          </dl>
        </section>
      )}
      {record.kind === "relationship_fact" && (
        <section className="inspector-section provenance-block">
          <p className="section-label">Confirmed value</p>
          <blockquote>{record.value}</blockquote>
          <p>Verified {formatDate(record.verifiedAt)}.</p>
        </section>
      )}
      {record.kind === "decision" && (
        <section className="inspector-section provenance-block">
          <p className="section-label">Rationale</p>
          <blockquote>{record.rationale}</blockquote>
          <p>This decision stays part of the versioned history.</p>
        </section>
      )}
      {record.kind === "recurrence" && (
        <section className="inspector-section">
          <p className="section-label">Rule</p>
          <dl className="record-fields">
            <div>
              <dt>Task</dt>
              <dd>{record.taskTitle}</dd>
            </div>
            <div>
              <dt>Cadence</dt>
              <dd>{recurrenceCadenceLabels[record.cadence]}</dd>
            </div>
          </dl>
        </section>
      )}
      {record.kind === "radar_candidate" && (
        <section className="inspector-section provenance-block">
          <p className="section-label">Relevance</p>
          <blockquote>{record.relevance}</blockquote>
          <p>This candidate is waiting for a decision in Organizations.</p>
        </section>
      )}
      {client !== undefined && (
        <RecordRemovalSection
          client={client}
          snapshot={snapshot}
          record={record}
          dependentLabels={strategicDependentLabels(record, records)}
          onRemoved={onRemoved}
          onFailure={onRemoveFailure}
        />
      )}
    </div>
  );
};

export const CaptureDialog = ({
  busy,
  client,
  initialMode = "text",
  defaultVoiceRetentionPolicy,
  workspaceName,
  onClose,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly client: ConstellationRendererClient | undefined;
  readonly initialMode?: "text" | "url" | "file" | "voice";
  readonly defaultVoiceRetentionPolicy: "delete_after_transcript" | "retain";
  readonly workspaceName: string;
  readonly onClose: () => void;
  readonly onSubmit: (original: CaptureOriginal) => Promise<string | undefined>;
}) => {
  const [mode, setMode] = useState<"text" | "url" | "file" | "voice">(
    initialMode,
  );
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [managedOriginal, setManagedOriginal] = useState<CaptureOriginal>();
  const [payloadBusy, setPayloadBusy] = useState(false);
  const [payloadError, setPayloadError] = useState<string>();
  const [voiceState, setVoiceState] = useState<
    "idle" | "requesting" | "recording" | "staging"
  >("idle");
  const [voiceElapsedMs, setVoiceElapsedMs] = useState(0);
  const [retainVoice, setRetainVoice] = useState(
    defaultVoiceRetentionPolicy === "retain",
  );
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const voiceSessionRef = useRef<VoiceRecordingSession | undefined>(undefined);
  const voiceGenerationRef = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
    inputRef.current?.focus();
    return () => dialogRef.current?.close();
  }, []);
  useEffect(() => {
    if (voiceState !== "recording") return;
    const timer = window.setInterval(() => {
      const startedAt = voiceSessionRef.current?.startedAt;
      if (startedAt !== undefined)
        setVoiceElapsedMs(Math.min(120_000, Date.now() - startedAt));
    }, 250);
    return () => window.clearInterval(timer);
  }, [voiceState]);
  useEffect(
    () => () => {
      voiceGenerationRef.current += 1;
      voiceSessionRef.current?.cancel();
    },
    [],
  );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const original =
      mode === "text" && text.trim()
        ? ({ kind: "text", text } as const)
        : mode === "url" && url.trim()
          ? ({ kind: "url", url: url.trim() } as const)
          : mode === "file" &&
              (managedOriginal?.kind === "managed_file" ||
                managedOriginal?.kind === "screenshot")
            ? managedOriginal
            : mode === "voice" && managedOriginal?.kind === "voice_note"
              ? managedOriginal
              : undefined;
    if (original === undefined) return;
    setPayloadError(undefined);
    const error = await onSubmit(original);
    if (error !== undefined) setPayloadError(error);
  };
  const payloadFailure = (code: string): string => {
    switch (code) {
      case "payload_empty":
        return "That file is empty. Choose another file.";
      case "payload_too_large":
        return "That file is over the 25 MB limit. Keep a smaller version.";
      case "payload_unsupported":
        return "That file cannot be captured safely.";
      case "payload_transfer_unavailable":
        return "Files in a Hub workspace need secure transfer turned on. Text and links still work.";
      case "cancelled":
        return "";
      default:
        return "Could not keep that file. Try again.";
    }
  };
  const acceptPayload = (result: CapturePayloadResponse) => {
    setPayloadBusy(false);
    if (result.outcome === "success") {
      if (managedOriginal !== undefined)
        void client?.discardCapturePayload?.(managedOriginal);
      setManagedOriginal(result.original);
      setPayloadError(undefined);
    } else {
      const message = payloadFailure(result.code);
      setPayloadError(message || undefined);
    }
  };
  const stageFile = async (
    nextFile: File,
    inputKind: "file" | "screenshot",
  ) => {
    if (client?.stageCapturePayload === undefined) {
      setPayloadError("Managed files are unavailable in this build.");
      return;
    }
    if (nextFile.size === 0) {
      setPayloadError(payloadFailure("payload_empty"));
      return;
    }
    if (nextFile.size > 25 * 1024 * 1024) {
      setPayloadError(payloadFailure("payload_too_large"));
      return;
    }
    setPayloadBusy(true);
    setPayloadError(undefined);
    try {
      acceptPayload(
        await client.stageCapturePayload({
          displayName:
            nextFile.name || `Screenshot ${formatDateTime(new Date())}.png`,
          mediaType: nextFile.type || "application/octet-stream",
          inputKind,
          bytes: new Uint8Array(await nextFile.arrayBuffer()),
        }),
      );
    } catch {
      setPayloadBusy(false);
      setPayloadError(
        "Could not read that file. Check its permissions and try again.",
      );
    }
  };
  const choosePayload = async () => {
    if (client?.selectCapturePayload === undefined) {
      setPayloadError("Choosing a managed file is unavailable.");
      return;
    }
    setPayloadBusy(true);
    setPayloadError(undefined);
    try {
      acceptPayload(await client.selectCapturePayload());
    } catch {
      setPayloadBusy(false);
      setPayloadError("Could not open that file. Try again.");
    }
  };
  const voiceFailure = (code: string): string => {
    switch (code) {
      case "unsupported":
        return "Recording a short voice note is not supported in this build.";
      case "permission_denied":
        return "No microphone access. Allow Constellation the microphone in system settings and try again.";
      case "device_unavailable":
        return "The microphone is unavailable or in use by another app.";
      default:
        return "The recording was not kept. Try again.";
    }
  };
  const startVoice = async () => {
    if (client?.stageCapturePayload === undefined) {
      setPayloadError("Encrypted voice notes are unavailable.");
      return;
    }
    if (managedOriginal !== undefined) discardPayload();
    const generation = voiceGenerationRef.current + 1;
    voiceGenerationRef.current = generation;
    setVoiceState("requesting");
    setVoiceElapsedMs(0);
    setPayloadError(undefined);
    const started = await startVoiceRecording();
    if (voiceGenerationRef.current !== generation) {
      if ("finished" in started) started.cancel();
      return;
    }
    if (!("finished" in started)) {
      setVoiceState("idle");
      if (started.outcome === "failure")
        setPayloadError(voiceFailure(started.code));
      return;
    }
    voiceSessionRef.current = started;
    setVoiceState("recording");
    const retentionPolicy = retainVoice ? "retain" : "delete_after_transcript";
    void started.finished.then(async (finished) => {
      if (voiceGenerationRef.current !== generation) return;
      voiceSessionRef.current = undefined;
      if (finished.outcome === "cancelled") {
        setVoiceState("idle");
        setVoiceElapsedMs(0);
        return;
      }
      if (finished.outcome === "failure") {
        setVoiceState("idle");
        setPayloadError(voiceFailure(finished.code));
        return;
      }
      if (finished.bytes.byteLength > MAX_VOICE_NOTE_BYTES) {
        setVoiceState("idle");
        setPayloadError("The recording went over 25 MB and was not saved.");
        return;
      }
      setVoiceState("staging");
      setPayloadBusy(true);
      const extension =
        finished.mediaType === "audio/mp4"
          ? "m4a"
          : finished.mediaType === "audio/ogg"
            ? "ogg"
            : "webm";
      try {
        acceptPayload(
          await client.stageCapturePayload!({
            displayName: `Voice note ${formatDateTime(new Date())}.${extension}`,
            mediaType: finished.mediaType,
            inputKind: "voice_note",
            bytes: finished.bytes,
            durationMs: finished.durationMs,
            retentionPolicy,
          }),
        );
        setVoiceElapsedMs(finished.durationMs);
        setVoiceState("idle");
        if (finished.automaticallyStopped)
          setPayloadError(
            "The 2 minute limit was reached. The recording is ready to save.",
          );
      } catch {
        setPayloadBusy(false);
        setVoiceState("idle");
        setPayloadError("Could not encrypt the recording. Try again.");
      }
    });
  };
  const cancelVoice = () => {
    voiceGenerationRef.current += 1;
    voiceSessionRef.current?.cancel();
    voiceSessionRef.current = undefined;
    setVoiceState("idle");
    setVoiceElapsedMs(0);
  };
  const discardPayload = () => {
    if (managedOriginal !== undefined)
      void client?.discardCapturePayload?.(managedOriginal);
    setManagedOriginal(undefined);
  };
  const close = () => {
    cancelVoice();
    discardPayload();
    dialogRef.current?.close();
    onClose();
  };
  const dirty =
    text.trim().length > 0 ||
    url.trim().length > 0 ||
    managedOriginal !== undefined ||
    voiceState === "recording";
  const requestClose = () => {
    if (busy || payloadBusy) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    close();
  };
  const canSubmit =
    mode === "text"
      ? text.trim().length > 0
      : mode === "url"
        ? url.trim().length > 0
        : mode === "file"
          ? managedOriginal?.kind === "managed_file" ||
            managedOriginal?.kind === "screenshot"
          : managedOriginal?.kind === "voice_note";
  return (
    <dialog
      ref={dialogRef}
      className="capture-backdrop"
      aria-labelledby="capture-title"
      onCancel={(event) => {
        event.preventDefault();
        if (confirmDiscard) {
          setConfirmDiscard(false);
          return;
        }
        requestClose();
      }}
      onMouseDown={(event) =>
        event.target === event.currentTarget && requestClose()
      }
      onPaste={(event) => {
        if (mode !== "file") return;
        const image = [...event.clipboardData.files].find((item) =>
          item.type.startsWith("image/"),
        );
        if (image !== undefined) {
          event.preventDefault();
          void stageFile(image, "screenshot");
        }
      }}
    >
      <section className="capture-dialog">
        <header className="capture-header">
          <div>
            <p className="eyebrow">Quick Capture</p>
            <h2 id="capture-title">Capture anything</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close Quick Capture"
            disabled={busy || payloadBusy}
            onClick={requestClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="capture-kind" role="group" aria-label="Capture kind">
            {(["text", "url", "file", "voice"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={mode === kind}
                onClick={() => {
                  if (mode === "voice" && kind !== "voice") cancelVoice();
                  setMode(kind);
                }}
              >
                {kind === "text"
                  ? "Text"
                  : kind === "url"
                    ? "Link"
                    : kind === "file"
                      ? "File"
                      : "Voice"}
              </button>
            ))}
          </div>
          {mode === "text" ? (
            <>
              <label className="sr-only" htmlFor="capture-text">
                Capture content
              </label>
              <textarea
                id="capture-text"
                name="capture"
                ref={inputRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="A thought, a task, or something to do…"
                maxLength={262_144}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
                    submit(event);
                }}
              />
              <small className="capture-mode-note">
                System dictation types here like any text — no audio is kept.
              </small>
            </>
          ) : mode === "url" ? (
            <label className="capture-field">
              <span>URL</span>
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://…"
                autoFocus
                required
              />
            </label>
          ) : mode === "voice" ? (
            <div className="capture-voice" aria-busy={voiceState === "staging"}>
              <div className="capture-voice-status" aria-live="polite">
                <span
                  className={
                    voiceState === "recording"
                      ? "voice-indicator is-recording"
                      : "voice-indicator"
                  }
                  aria-hidden="true"
                />
                <div>
                  <strong>
                    {managedOriginal?.kind === "voice_note"
                      ? "Recording encrypted and ready"
                      : voiceState === "requesting"
                        ? "Waiting for system permission…"
                        : voiceState === "recording"
                          ? "Recording"
                          : voiceState === "staging"
                            ? "Encrypting and keeping…"
                            : "Short voice note"}
                  </strong>
                  <span>
                    {managedOriginal?.kind === "voice_note"
                      ? `${Math.ceil(managedOriginal.durationMs / 1000)} s · ${Math.ceil(managedOriginal.payload.byteLength / 1024).toLocaleString("en-US")} KB`
                      : `${Math.floor(voiceElapsedMs / 60_000)}:${Math.floor(
                          (voiceElapsedMs % 60_000) / 1000,
                        )
                          .toString()
                          .padStart(2, "0")} / 2:00`}
                  </span>
                </div>
              </div>
              <div className="capture-voice-actions">
                {voiceState === "recording" ? (
                  <>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => voiceSessionRef.current?.stop()}
                    >
                      Stop
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={cancelVoice}
                    >
                      Cancel recording
                    </button>
                  </>
                ) : (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={
                      voiceState === "requesting" || voiceState === "staging"
                    }
                    onClick={() => void startVoice()}
                  >
                    {managedOriginal?.kind === "voice_note"
                      ? "Record again"
                      : "Start recording"}
                  </button>
                )}
              </div>
              <label className="capture-voice-retention">
                <input
                  type="checkbox"
                  checked={retainVoice}
                  disabled={
                    voiceState !== "idle" ||
                    managedOriginal?.kind === "voice_note"
                  }
                  onChange={(event) => setRetainVoice(event.target.checked)}
                />
                <span>
                  Keep the audio after transcription. By default it is deleted
                  once an MCP agent has written the transcript.
                </span>
              </label>
              <small>
                Constellation does not transcribe or record meetings. The
                microphone runs only while this window is visibly recording.
              </small>
              {payloadError && (
                <p className="capture-payload-error" role="alert">
                  {payloadError}
                </p>
              )}
            </div>
          ) : (
            <div
              className="capture-file"
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const dropped = event.dataTransfer.files[0];
                if (dropped !== undefined)
                  void stageFile(
                    dropped,
                    dropped.type.startsWith("image/") ? "screenshot" : "file",
                  );
              }}
              aria-busy={payloadBusy}
            >
              <strong>
                {managedOriginal?.kind === "managed_file" ||
                managedOriginal?.kind === "screenshot"
                  ? managedOriginal.payload.displayName
                  : payloadBusy
                    ? "Encrypting and keeping…"
                    : "Drop a file or paste a screenshot"}
              </strong>
              <button
                className="secondary-button"
                type="button"
                disabled={payloadBusy}
                onClick={() => void choosePayload()}
              >
                {managedOriginal === undefined ? "Choose file" : "Change file"}
              </button>
              <small>
                Constellation keeps an encrypted copy in this workspace before
                filing it. The local path is not saved.
              </small>
              {payloadError && (
                <p className="capture-payload-error" role="alert">
                  {payloadError}
                </p>
              )}
            </div>
          )}
          <div className="capture-target">
            <div>
              <span>Workspace</span>
              <strong>{workspaceName}</strong>
            </div>
            <div>
              <span>Result</span>
              <strong>App rule · can be undone</strong>
            </div>
          </div>
          {confirmDiscard && (
            <div className="capture-discard-confirm" role="alert">
              <span>You have unsaved content. Discard it?</span>
              <div>
                <button
                  type="button"
                  className="secondary-button"
                  autoFocus
                  onClick={() => setConfirmDiscard(false)}
                >
                  Back to editing
                </button>
                <button
                  type="button"
                  className="quiet-danger-button"
                  onClick={close}
                >
                  Discard content
                </button>
              </div>
            </div>
          )}
          <footer className="capture-footer">
            <span>The original is kept and linked to the result.</span>
            <button
              className="primary-button"
              type="submit"
              disabled={busy || payloadBusy || !canSubmit}
            >
              {busy ? "Working…" : "Save and file"}
            </button>
          </footer>
        </form>
      </section>
    </dialog>
  );
};

const navItems = desktopSurfaceRegistry.map(({ shortcut, ...surface }) => ({
  ...surface,
  ...(shortcut === null ? undefined : { shortcut: String(shortcut) }),
}));

export const RealApp = ({
  client,
  initialSnapshot,
}: {
  readonly client: ConstellationRendererClient | undefined;
  // Szew testowy, ten sam wzorzec co `initialStatus` w `WorkspaceRecovery`:
  // stan startowy to zawsze „loading", a `renderToStaticMarkup` NIE URUCHAMIA
  // efektów, więc bez tego każdy cel renderuje się jako ten sam ekran ładowania
  // i o żadnej powierzchni nie da się orzec niczego. Podanie snapshotu wsadza
  // powłokę od razu w gałąź „ready". Produkcja nie podaje go nigdy.
  readonly initialSnapshot?: DesktopSnapshot;
}) => {
  const [state, setState] = useState<LoadState>(() =>
    initialSnapshot === undefined
      ? { kind: "loading" }
      : { kind: "ready", snapshot: initialSnapshot },
  );
  const [navigation, setNavigation] = useState(() => {
    const parameters = new URLSearchParams(window.location.search);
    const requested = navItems.find(
      (item) => item.id === parameters.get("destination"),
    );
    const fallback = destinationContext(
      requested?.id ?? "today",
      requested?.label ?? "Today",
    );
    return parameters.get("detached") === "1"
      ? createShellNavigation(fallback)
      : restoreShellNavigation(
          localStorage.getItem("constellation.shell-navigation"),
          fallback,
        );
  });
  const navigationRef = useRef(navigation);
  const [favorites, setFavorites] = useState<readonly SurfaceId[]>(() => {
    try {
      const parsed = JSON.parse(
        localStorage.getItem("constellation.favorites") ?? "[]",
      ) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is SurfaceId =>
            navItems.some((entry) => entry.id === item),
          )
        : (["today", "tasks"] satisfies readonly SurfaceId[]);
    } catch {
      return ["today", "tasks"] satisfies readonly SurfaceId[];
    }
  });
  const [collapsedNavigationGroups, toggleNavigationGroup] =
    useCollapsedNavigationGroups();
  const [inspectorWidth, setInspectorWidth] = useState<number>(() => {
    const stored = Number(
      localStorage.getItem("constellation.inspector-width"),
    );
    return Number.isFinite(stored) && stored >= 280 && stored <= 640
      ? stored
      : 320;
  });
  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId>();
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId>();
  const [selectedWorkContext, setSelectedWorkContext] = useState<{
    readonly kind: WorkContextKind;
    readonly id: string;
  }>();
  // Obszar i Inicjatywa nie mają własnej powierzchni edycji, więc nienapisaną
  // intencję uzupełnia się tam, gdzie jest widoczna — w inspectorze.
  const [workContextNarrative, setWorkContextNarrative] = useState<string>();
  const [selectedStrategicId, setSelectedStrategicId] = useState<string>();
  const [selectedCaptureId, setSelectedCaptureId] = useState<CaptureId>();
  const [selectedAttentionId, setSelectedAttentionId] = useState<string>();
  const [meetingInspectorHost, setMeetingInspectorHost] =
    useState<HTMLElement | null>(null);
  const [meetingInspectorOpen, setMeetingInspectorOpen] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>();
  const [documentInspectorHost, setDocumentInspectorHost] =
    useState<HTMLElement | null>(null);
  const [documentInspectorOpen, setDocumentInspectorOpen] = useState(false);
  const [documentInspectorKind, setDocumentInspectorKind] = useState<
    "document" | "source"
  >("document");
  const [projectOverview, setProjectOverview] =
    useState<ProjectOverviewProjection>();
  const [busyTaskId, setBusyTaskId] = useState<TaskId>();
  const [taskEditOpen, setTaskEditOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState({
    title: "",
    description: "",
    nextAction: "",
    startDate: "",
    dueDate: "",
    priority: "",
  });
  const [taskEditBusy, setTaskEditBusy] = useState(false);
  const taskEditButtonRef = useRef<HTMLButtonElement | null>(null);
  const taskEditWantsFocusRef = useRef(false);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [subtaskBusy, setSubtaskBusy] = useState(false);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const [fieldSaveBusy, setFieldSaveBusy] = useState(false);
  useEffect(() => {
    if (!taskEditOpen && taskEditWantsFocusRef.current) {
      taskEditWantsFocusRef.current = false;
      taskEditButtonRef.current?.focus();
    }
  }, [taskEditOpen]);
  const [projectBusy, setProjectBusy] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attentionBusy, setAttentionBusy] = useState(false);
  const [historyBusyCaptureId, setHistoryBusyCaptureId] = useState<CaptureId>();
  const [comments, setComments] = useState<DataSlice<CommentListProjection>>({
    kind: "unavailable",
    message: "Choose a task or a project.",
  });
  const [sessionRelation, setSessionRelation] = useState<{
    id: RelationId;
    version: number;
    taskId: TaskId;
  }>();
  const [undoPreview, setUndoPreview] = useState<UndoPreview>();
  const [undoBusy, setUndoBusy] = useState(false);
  const [receipts, setReceipts] = useState<
    Record<string, AuditReceiptProjection>
  >({});
  const [notice, setNotice] = useState<MutationFailure>();
  // Toasty są kolejkowane zamiast nadpisywane: widoczny jest pierwszy wpis,
  // kolejne czekają, a odwracalna mutacja niesie akcję „Cofnij”.
  const [toasts, setToasts] = useState<
    readonly {
      readonly id: number;
      readonly message: string;
      readonly restore?: ShellContext;
      readonly undoCommandId?: CommandId;
    }[]
  >([]);
  const toastIdRef = useRef(0);
  const pushToast = useCallback(
    (toast: {
      readonly message: string;
      readonly restore?: ShellContext;
      readonly undoCommandId?: CommandId;
    }) => {
      toastIdRef.current += 1;
      const id = toastIdRef.current;
      setToasts((current) => [...current, { ...toast, id }]);
    },
    [],
  );
  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);
  const activeToast = toasts[0];
  // Hover lub fokus w toaście wstrzymuje automatyczne zamknięcie, żeby akcje
  // „Cofnij”/„Przywróć” nie znikały użytkownikowi spod kursora ani spod
  // fokusa klawiatury; timer rusza od nowa po opuszczeniu toastu.
  const [toastPaused, setToastPaused] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [agentGrantDetails, setAgentGrantDetails] =
    useState<AgentGrantDetails>();
  const [previewCondition, setPreviewCondition] =
    useState<PreviewCondition>("ready");
  const [narrowShell, setNarrowShell] = useState(
    () => window.matchMedia("(max-width: 75rem)").matches,
  );
  const [railMode, setRailMode] = useState(
    () => window.matchMedia("(max-width: 50rem)").matches,
  );
  const [focusedNavItemId, setFocusedNavItemId] = useState<SurfaceId>();
  const [railTip, setRailTip] = useState<{
    readonly label: string;
    readonly hint?: SurfaceShortcutHint;
    readonly top: number;
  }>();
  const navRef = useRef<HTMLElement>(null);
  const tabRef = useRef<HTMLDivElement>(null);
  const captureReturnFocusRef = useRef<HTMLElement | null>(null);
  const captureRestoreFocusPendingRef = useRef(false);
  const activeContext = activeShellContext(navigation);
  const surface = activeContext.surface;
  // Bound to a const so the "an Organization is open" narrowing survives into
  // the callbacks below: a property access is not narrowed inside a closure,
  // and the client-link handlers need the id after the check, not before it.
  const activeOrganizationId = activeContext.organizationId;
  const detachedWindow =
    new URLSearchParams(window.location.search).get("detached") === "1";
  const recentContexts = navigation.history
    .slice(0, navigation.historyIndex + 1)
    .reverse()
    .reduce<ShellContext[]>((items, context) => {
      if (
        context.key === activeContext.key ||
        context.key.startsWith("destination:") ||
        items.some((item) => item.key === context.key)
      )
        return items;
      items.push(context);
      return items;
    }, [])
    .slice(0, 3);

  useEffect(() => {
    if (detachedWindow) return;
    localStorage.setItem(
      "constellation.shell-navigation",
      serializeShellNavigation(navigation),
    );
  }, [detachedWindow, navigation]);

  useEffect(() => {
    localStorage.setItem("constellation.favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (detachedWindow) return;
    localStorage.setItem(
      "constellation.inspector-width",
      String(inspectorWidth),
    );
  }, [detachedWindow, inspectorWidth]);

  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 75rem)");
    const rail = window.matchMedia("(max-width: 50rem)");
    const update = () => {
      setNarrowShell(narrow.matches);
      setRailMode(rail.matches);
    };
    narrow.addEventListener("change", update);
    rail.addEventListener("change", update);
    return () => {
      narrow.removeEventListener("change", update);
      rail.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    if (!railMode) setRailTip(undefined);
  }, [railMode]);
  // W trybie rail etykiety sidebaru są ukryte; tooltip z etykietą i skrótem
  // pojawia się przy hover oraz fokusie klawiatury obok zwiniętej kolumny.
  const showRailTip = (
    target: HTMLElement,
    label: string,
    hint?: SurfaceShortcutHint,
  ) => {
    if (!railMode) return;
    const rect = target.getBoundingClientRect();
    setRailTip({
      label,
      ...(hint === undefined ? {} : { hint }),
      top: rect.top + rect.height / 2,
    });
  };
  const hideRailTip = () => setRailTip(undefined);

  // Separator szerokości inspektora używa pointer capture, więc przeciąganie
  // nie gubi się poza oknem; podwójne kliknięcie przywraca domyślne 320 px.
  const resizePointerIdRef = useRef<number | undefined>(undefined);
  const beginInspectorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };
  const moveInspectorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizePointerIdRef.current !== event.pointerId) return;
    setInspectorWidth(
      Math.min(640, Math.max(280, window.innerWidth - event.clientX)),
    );
  };
  const endInspectorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizePointerIdRef.current !== event.pointerId) return;
    resizePointerIdRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  };

  // Każde otwarcie kontekstu w bieżącej karcie (sidebar, ⌘1-9, Enter,
  // dblclick, wyszukiwarka) przenosi fokus na nagłówek nowej powierzchni —
  // flaga jest ustawiana w jednym miejscu, żeby żadna ścieżka nie gubiła
  // fokusa na odmontowanym elemencie listy.
  const surfaceFocusPendingRef = useRef(false);
  const openContext = useCallback((context: ShellContext) => {
    surfaceFocusPendingRef.current = true;
    setNavigation((current) => navigateShellContext(current, context));
  }, []);

  // Ustawienia są TRYBEM, nie kolejnym ekranem w rzędzie: wejście podmienia
  // lewą kolumnę, a wyjście wraca tam, gdzie się było. Kontekst powrotu
  // zapamiętujemy przy WEJŚCIU, bo po otwarciu Ustawień aktywnym kontekstem są
  // już one same i nie da się go odtworzyć.
  const [settingsReturn, setSettingsReturn] = useState<ShellContext>();
  const openSettings = useCallback(() => {
    surfaceFocusPendingRef.current = true;
    setNavigation((current) => {
      const active = activeShellContext(current);
      if (active.surface !== "settings") setSettingsReturn(active);
      return navigateShellContext(
        current,
        destinationContext("settings", "Settings"),
      );
    });
  }, []);
  const leaveSettings = useCallback(() => {
    surfaceFocusPendingRef.current = true;
    const back = settingsReturn ?? destinationContext("today", "Today");
    setNavigation((current) => navigateShellContext(current, back));
    setSettingsReturn(undefined);
  }, [settingsReturn]);
  const openContextInNewTab = useCallback(
    (context: ShellContext) => {
      const outcome = openShellContextReportingEviction(navigation, context);
      setNavigation(outcome.state);
      if (outcome.evictedContext !== undefined) {
        pushToast({
          message: `Closed the “${outcome.evictedContext.label}” tab to open a new one.`,
          restore: outcome.evictedContext,
        });
      }
    },
    [navigation, pushToast],
  );
  const [navMenu, setNavMenu] = useState<{
    readonly x: number;
    readonly y: number;
    readonly context: ShellContext;
  }>();
  const navMenuRef = useRef<HTMLDivElement>(null);
  const navMenuReturnFocusRef = useRef<HTMLElement | null>(null);
  const navHandlers = (context: ShellContext) => ({
    onClick: (event: ReactMouseEvent) => {
      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        openContextInNewTab(context);
      } else {
        openContext(context);
      }
    },
    onAuxClick: (event: ReactMouseEvent) => {
      if (event.button === 1) {
        event.preventDefault();
        openContextInNewTab(context);
      }
    },
    onContextMenu: (event: ReactMouseEvent) => {
      event.preventDefault();
      navMenuReturnFocusRef.current =
        event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
      setNavMenu({
        x: Math.min(event.clientX, window.innerWidth - 208),
        y: Math.min(event.clientY, window.innerHeight - 96),
        context,
      });
    },
  });
  const closeNavMenu = useCallback((restoreFocus: boolean) => {
    setNavMenu(undefined);
    if (restoreFocus && navMenuReturnFocusRef.current?.isConnected)
      navMenuReturnFocusRef.current.focus();
  }, []);
  useEffect(() => {
    if (navMenu === undefined) return;
    navMenuRef.current
      ?.querySelector<HTMLButtonElement>("[role='menuitem']")
      ?.focus();
  }, [navMenu]);
  const navMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [
      ...(navMenuRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']",
      ) ?? []),
    ];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      items[(current + delta + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeNavMenu(true);
    } else if (event.key === "Tab") {
      closeNavMenu(false);
    }
  };
  const openCapture = useCallback(() => {
    const activeElement = document.activeElement;
    captureReturnFocusRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : document.querySelector<HTMLElement>(".capture-dock");
    setCaptureOpen(true);
  }, []);
  const dismissCapture = useCallback(() => {
    captureRestoreFocusPendingRef.current = true;
    setCaptureOpen(false);
  }, []);
  useLayoutEffect(() => {
    if (captureOpen || !captureRestoreFocusPendingRef.current) return;
    captureRestoreFocusPendingRef.current = false;
    const returnTarget = captureReturnFocusRef.current;
    if (returnTarget?.isConnected) returnTarget.focus();
    else document.querySelector<HTMLElement>(".capture-dock")?.focus();
    captureReturnFocusRef.current = null;
  }, [captureOpen]);

  useEffect(() => {
    setSelectedTaskId(activeContext.taskId);
    setSelectedProjectId(activeContext.projectId);
    if (
      activeContext.taskId ||
      activeContext.projectId ||
      activeContext.organizationId
    ) {
      setSelectedWorkContext(undefined);
      setSelectedStrategicId(undefined);
      setSelectedCaptureId(undefined);
      setSelectedAttentionId(undefined);
    }
  }, [
    activeContext.organizationId,
    activeContext.projectId,
    activeContext.taskId,
  ]);

  // Inspector selection is intentionally separate from the active context:
  // selecting a row keeps the collection surface in place and only feeds the
  // inspector; opening (Enter, double-click, ⌘click) promotes the record to
  // the active shell context.
  const selectTaskInInspector = useCallback((id: TaskId) => {
    setSelectedProjectId(undefined);
    setSelectedWorkContext(undefined);
    setSelectedStrategicId(undefined);
    setSelectedCaptureId(undefined);
    setSelectedAttentionId(undefined);
    setSelectedTaskId(id);
    setTaskEditOpen(false);
  }, []);
  const selectProjectInInspector = useCallback((id: ProjectId) => {
    setSelectedTaskId(undefined);
    setSelectedWorkContext(undefined);
    setSelectedStrategicId(undefined);
    setSelectedCaptureId(undefined);
    setSelectedAttentionId(undefined);
    setSelectedProjectId(id);
  }, []);
  const selectWorkContextInInspector = useCallback(
    (kind: WorkContextKind, id: string) => {
      setSelectedTaskId(undefined);
      setSelectedProjectId(undefined);
      setSelectedStrategicId(undefined);
      setSelectedCaptureId(undefined);
      setSelectedAttentionId(undefined);
      setSelectedWorkContext({ kind, id });
    },
    [],
  );
  const selectStrategicInInspector = useCallback((id: string) => {
    setSelectedTaskId(undefined);
    setSelectedProjectId(undefined);
    setSelectedWorkContext(undefined);
    setSelectedCaptureId(undefined);
    setSelectedAttentionId(undefined);
    setSelectedStrategicId(id);
  }, []);
  const selectCaptureInInspector = useCallback((id: CaptureId) => {
    setSelectedTaskId(undefined);
    setSelectedProjectId(undefined);
    setSelectedWorkContext(undefined);
    setSelectedStrategicId(undefined);
    setSelectedAttentionId(undefined);
    setSelectedCaptureId(id);
  }, []);
  const selectAttentionInInspector = useCallback((id: string) => {
    setSelectedTaskId(undefined);
    setSelectedProjectId(undefined);
    setSelectedWorkContext(undefined);
    setSelectedStrategicId(undefined);
    setSelectedCaptureId(undefined);
    setSelectedAttentionId(id);
  }, []);

  // Surface changes requested from the sidebar or ⌘1-9 move focus onto the
  // freshly rendered surface heading; lazy surfaces fall back to the panel.
  useEffect(() => {
    if (!surfaceFocusPendingRef.current) return;
    surfaceFocusPendingRef.current = false;
    (
      document.getElementById("surface-title") ??
      document.getElementById("main-content")
    )?.focus();
  }, [activeContext.key]);

  useEffect(() => {
    if (surface !== "meetings") setMeetingInspectorOpen(false);
    if (surface !== "library") {
      setDocumentInspectorOpen(false);
      setDocumentInspectorKind("document");
    }
    if (surface !== "organizations") setSelectedStrategicId(undefined);
    if (surface !== "history") setSelectedCaptureId(undefined);
    if (surface !== "inbox") setSelectedAttentionId(undefined);
  }, [surface]);

  const snapshot = state.kind === "ready" ? state.snapshot : undefined;
  const selectedWorkContextRecord = useMemo(() => {
    if (!snapshot || snapshot.work.kind !== "ready" || !selectedWorkContext)
      return undefined;
    if (selectedWorkContext.kind === "area") {
      const area = snapshot.work.data.areas.find(
        (item) => item.id === selectedWorkContext.id,
      );
      return area === undefined
        ? undefined
        : {
            kind: "area" as const,
            id: area.id,
            version: area.version,
            title: area.title,
            detail: area.responsibility,
            needsReview: area.needsReview,
            stateLabel: area.state === "active" ? "Active" : "Archived",
          };
    }
    const initiative = snapshot.work.data.initiatives.find(
      (item) => item.id === selectedWorkContext.id,
    );
    return initiative === undefined
      ? undefined
      : {
          kind: "initiative" as const,
          id: initiative.id,
          version: initiative.version,
          title: initiative.title,
          detail: initiative.intendedOutcome,
          needsReview: initiative.needsReview,
          stateLabel: initiative.state === "active" ? "Active" : "Closed",
        };
  }, [selectedWorkContext, snapshot]);
  // Szkic należy do wybranego rekordu, nie do inspectora — zmiana wyboru nie
  // może przenieść nienapisanej intencji na inny Obszar czy Inicjatywę.
  useEffect(
    () => setWorkContextNarrative(undefined),
    [selectedWorkContext?.kind, selectedWorkContext?.id],
  );
  const selectedStrategicRecord = useMemo(
    () =>
      snapshot?.relationships.kind === "ready" &&
      selectedStrategicId !== undefined
        ? snapshot.relationships.data.records.find(
            (record) => record.id === selectedStrategicId,
          )
        : undefined,
    [selectedStrategicId, snapshot],
  );
  useEffect(() => {
    if (!snapshot) return;
    const taskIds = new Set(snapshot.tasks.map((task) => task.id));
    const projectIds = new Set(
      snapshot.projects.kind === "ready"
        ? snapshot.projects.data.items.map((project) => project.id)
        : [],
    );
    const documentIds = new Set(
      snapshot.documents.kind === "ready"
        ? snapshot.documents.data.items.map((document) => document.id)
        : [],
    );
    const organizationIds = new Set(
      snapshot.relationships.kind === "ready"
        ? snapshot.relationships.data.records
            .filter((record) => record.kind === "organization")
            .map((record) => record.id)
        : [],
    );
    setNavigation((current) =>
      pruneInaccessibleShellContexts(
        current,
        { taskIds, projectIds, documentIds, organizationIds },
        destinationContext("today", "Today"),
      ),
    );
  }, [snapshot]);

  useEffect(() => {
    if (!client) return;
    return client.onAttentionActivated((destination) => {
      if (destination.kind === "task") {
        openContext(taskContext(destination.taskId, "Task"));
      } else if (destination.kind === "project") {
        openContext(projectContext(destination.projectId, "Project"));
      } else {
        openContext(destinationContext("library", "Library"));
      }
    });
  }, [client, openContext]);

  const reloadSnapshot = async () => {
    if (!client) return undefined;
    const next = await loadDesktopSnapshot(client, snapshot?.build);
    setState({ kind: "ready", snapshot: next });
    return next;
  };
  const reload = async () => {
    await reloadSnapshot();
  };

  // Agent writes land in the same graph this window is showing, but the window
  // holds its own projection: without a re-read it keeps rendering the state it
  // opened with, and a correct agent write reads as a missing one. The
  // subscription is laid once per client and reaches the current reload through
  // a ref, so a burst of agent commands cannot slip between unsubscribe and
  // resubscribe.
  //
  // Samo sklejanie mieszka w `client/agent-write-reload.ts`. Tu zostaje tylko
  // spięcie go z Reactem, bo w domknięciu `useEffect` ta logika była
  // NIESPRAWDZALNA: jedynym jej pokryciem była asercja, że stała opóźnienia
  // występuje w tekście tego pliku — zielona przy dowolnie zepsutym sklejaniu.
  const reloadSnapshotRef = useRef(reloadSnapshot);
  const workspaceIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    reloadSnapshotRef.current = reloadSnapshot;
    workspaceIdRef.current = snapshot?.bootstrap.workspace.id;
  });
  useEffect(() => {
    const onWorkspaceChanged = client?.onWorkspaceChanged;
    if (onWorkspaceChanged === undefined) return;
    return subscribeToAgentWrites({
      subscribe: (listener) => onWorkspaceChanged(listener),
      currentWorkspaceId: () => workspaceIdRef.current,
      reload: () => {
        void reloadSnapshotRef.current();
      },
    });
  }, [client]);

  useEffect(() => {
    if (!client) {
      setState({
        kind: "unavailable",
        message:
          "The secure Electron bridge is unavailable. Start the app through the desktop script.",
      });
      return;
    }
    let active = true;
    void client
      .getBuildInfo()
      .then((build) => {
        if (build.workspaceAvailability === "recovery_required") {
          if (active) {
            setState({ kind: "recovery", build });
            setRecoveryOpen(true);
          }
          return undefined;
        }
        return loadDesktopSnapshot(client, build);
      })
      .then((next) => {
        if (!active || next === undefined) return;
        setState({ kind: "ready", snapshot: next });
        if (
          next.build.channel !== "developer-preview" &&
          localStorage.getItem(
            `constellation.onboarded:${next.bootstrap.workspace.id}`,
          ) !== "1"
        )
          setOnboardingOpen(true);
      })
      .catch(
        (error: unknown) =>
          active &&
          setState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not open the workspace.",
          }),
      );
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (!client || !snapshot || !selectedProjectId) {
      setProjectOverview(undefined);
      return;
    }
    let active = true;
    void loadProjectOverview(client, snapshot, selectedProjectId)
      .then((overview) => active && setProjectOverview(overview))
      .catch((error: unknown) => {
        if (active) {
          setProjectOverview(undefined);
          setNotice({
            kind: "unavailable",
            message:
              error instanceof Error
                ? error.message
                : "The project overview is unavailable.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [client, selectedProjectId, snapshot]);

  useEffect(() => {
    if (!client || !snapshot || (!selectedTaskId && !selectedProjectId)) {
      setComments({
        kind: "unavailable",
        message: "Choose a task or a project.",
      });
      return;
    }
    let active = true;
    const target = selectedTaskId
      ? { kind: "task" as const, taskId: selectedTaskId }
      : { kind: "project" as const, projectId: selectedProjectId! };
    void loadComments(client, snapshot, target)
      .then((data) => active && setComments({ kind: "ready", data }))
      .catch(
        (error: unknown) =>
          active &&
          setComments({
            kind: "unavailable",
            message:
              error instanceof Error
                ? error.message
                : "Comments are unavailable.",
          }),
      );
    return () => {
      active = false;
    };
  }, [client, selectedProjectId, selectedTaskId, snapshot]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modalOpen = document.querySelector("dialog[open]") !== null;
      const shortcutIndex = destinationShortcutIndex(event.code);
      // Nieprzypisana cyfra ⌘Digit nie jest przechwytywana — zdarzenie
      // przechodzi dalej zamiast znikać bez efektu.
      const shortcutItem =
        shortcutIndex === undefined
          ? undefined
          : navItems.find(
              (entry) => entry.shortcut === String(shortcutIndex + 1),
            );
      if (modalOpen && event.key !== "Escape") return;
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.code === "KeyK"
      ) {
        event.preventDefault();
        openCapture();
      } else if ((event.metaKey || event.ctrlKey) && event.code === "KeyK") {
        event.preventDefault();
        setSearchOpen(true);
      } else if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        (event.key === "," || event.code === "Comma")
      ) {
        // ⌘, to systemowy skrót do ustawień na macOS — człowiek przychodzi
        // z nim z każdej innej aplikacji.
        event.preventDefault();
        openSettings();
      } else if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        (event.key === "/" || event.code === "Slash")
      ) {
        event.preventDefault();
        setShortcutsOpen(true);
      } else if (
        (event.metaKey || event.ctrlKey) &&
        shortcutItem !== undefined
      ) {
        event.preventDefault();
        openContext(destinationContext(shortcutItem.id, shortcutItem.label));
      } else if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        setNavigation((current) => moveShellHistory(current, -1));
      } else if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        setNavigation((current) => moveShellHistory(current, 1));
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "Tab" &&
        navigation.tabs.length > 1
      ) {
        event.preventDefault();
        const current = navigation.tabs.findIndex(
          (tab) => tab.key === navigation.activeKey,
        );
        const delta = event.shiftKey ? -1 : 1;
        const next =
          navigation.tabs[
            (current + delta + navigation.tabs.length) % navigation.tabs.length
          ];
        if (next)
          setNavigation((value) => activateShellContext(value, next.key));
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.code === "KeyW" &&
        navigation.tabs.length > 1
      ) {
        event.preventDefault();
        setNavigation((current) =>
          closeShellContext(current, current.activeKey),
        );
      } else if (event.key === "Escape") {
        const overlayOpen =
          searchOpen || undoPreview !== undefined || navMenu !== undefined;
        setSearchOpen(false);
        setUndoPreview(undefined);
        setNavMenu(undefined);
        // Escape z fokusem w polu edycji nie czyści selekcji inspektora —
        // wyczyszczenie odmontowałoby formularz razem z wpisanym szkicem.
        const target = event.target;
        const editableTarget =
          target instanceof HTMLElement &&
          (target.matches("input, textarea, select") ||
            target.isContentEditable);
        if (!modalOpen && !overlayOpen && !editableTarget) {
          setSelectedTaskId(undefined);
          setSelectedProjectId(undefined);
          setSelectedWorkContext(undefined);
          setSelectedStrategicId(undefined);
          setMeetingInspectorOpen(false);
          setDocumentInspectorOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    navigation.activeKey,
    navigation.tabs,
    navMenu,
    openCapture,
    openContext,
    searchOpen,
    undoPreview,
  ]);

  // Subskrypcja komend IPC jest zakładana raz na klienta; liczba kart jest
  // czytana z refa aktualizowanego przy każdym renderze, żeby ⌘W z menu nie
  // działał na nieaktualnym stanie (i żeby komendy nie przepadały w oknie
  // między unsubscribe a resubscribe).
  useEffect(() => {
    navigationRef.current = navigation;
  }, [navigation]);
  useEffect(() => {
    if (client?.onShellCommand === undefined) return;
    return client.onShellCommand((command) => {
      if (document.querySelector("dialog[open]") !== null) return;
      if (command.kind === "close-tab") {
        if (navigationRef.current.tabs.length <= 1) window.close();
        else
          setNavigation((current) =>
            closeShellContext(current, current.activeKey),
          );
      } else if (command.kind === "open-capture") {
        openCapture();
      } else if (command.kind === "open-search") {
        setSearchOpen(true);
      } else if (command.kind === "open-shortcuts") {
        setShortcutsOpen(true);
      } else {
        const item = navItems.find(
          (entry) => entry.shortcut === String(command.digit),
        );
        if (item) {
          openContext(destinationContext(item.id, item.label));
        }
      }
    });
  }, [client, openCapture, openContext]);
  useEffect(() => {
    if (activeToast === undefined) {
      setToastPaused(false);
      return;
    }
    if (toastPaused) return;
    const timer = window.setTimeout(
      () => dismissToast(activeToast.id),
      activeToast.undoCommandId === undefined ? 5000 : 8000,
    );
    return () => window.clearTimeout(timer);
  }, [activeToast, dismissToast, toastPaused]);

  useEffect(() => {
    const element = tabRef.current;
    if (!element) return;
    const update = () => {
      const overflowing = element.scrollWidth - element.clientWidth > 1;
      element.dataset.overflowLeft = String(
        overflowing && element.scrollLeft > 1,
      );
      element.dataset.overflowRight = String(
        overflowing &&
          element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
      );
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [navigation.tabs.length]);

  useEffect(() => {
    tabRef.current
      ?.querySelector(`[data-shell-tab="${CSS.escape(navigation.activeKey)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [navigation.activeKey]);

  const selectedTask = useMemo(
    () => snapshot?.tasks.find((task) => task.id === selectedTaskId),
    [selectedTaskId, snapshot],
  );
  const selectedProject = useMemo(
    () =>
      snapshot?.projects.kind === "ready"
        ? snapshot.projects.data.items.find(
            (project) => project.id === selectedProjectId,
          )
        : undefined,
    [selectedProjectId, snapshot],
  );
  const selectedCapture = useMemo(
    () =>
      snapshot?.captures.find((capture) => capture.id === selectedCaptureId),
    [selectedCaptureId, snapshot],
  );
  const selectedAttention = useMemo(
    () =>
      snapshot?.attention.kind === "ready"
        ? snapshot.attention.data.items.find(
            (item) => item.id === selectedAttentionId,
          )
        : undefined,
    [selectedAttentionId, snapshot],
  );
  const selectedCaptureRouteActivity = useMemo(
    () =>
      selectedCapture && snapshot?.activity.kind === "ready"
        ? snapshot.activity.data.items.find(
            (item) =>
              item.activityType === "capture_routed" &&
              item.recordId === selectedCapture.id,
          )
        : undefined,
    [selectedCapture, snapshot],
  );
  const projectFullView = Boolean(
    surface === "projects" && activeContext.projectId !== undefined,
  );
  const inspectorDetailOpen = Boolean(
    selectedTask ||
    (selectedProject && !projectFullView) ||
    selectedWorkContextRecord ||
    selectedStrategicRecord ||
    selectedCapture ||
    selectedAttention ||
    (surface === "meetings" && meetingInspectorOpen) ||
    (surface === "library" && documentInspectorOpen),
  );
  const dismissInspector = useCallback(() => {
    if (surface === "meetings") {
      setMeetingInspectorOpen(false);
      return;
    }
    if (surface === "library") {
      setDocumentInspectorOpen(false);
      return;
    }
    setSelectedTaskId(undefined);
    setSelectedProjectId(undefined);
    setSelectedWorkContext(undefined);
    setSelectedStrategicId(undefined);
    setSelectedCaptureId(undefined);
    setSelectedAttentionId(undefined);
  }, [surface]);
  // Każdy inspector jest zamykalny Escape i oddaje fokus do obiektu, który go
  // otworzył. Poniżej 75rem działa jako drawer i dodatkowo przenosi fokus na
  // nagłówek; na szerokim ekranie fokus pozostaje w kolekcji do czasu jawnej
  // interakcji z panelem.
  const inspectorPanel = useDismissiblePanel({
    open: inspectorDetailOpen,
    onDismiss: dismissInspector,
    focusOnOpen: narrowShell,
  });
  const sourceCapture =
    selectedTask?.sourceCaptureId === undefined
      ? undefined
      : snapshot?.captures.find(
          (capture) => capture.id === selectedTask.sourceCaptureId,
        );
  const receipt =
    selectedTask === undefined ? undefined : receipts[selectedTask.id];
  const showFailure = (result: MutationFailure) => setNotice(result);
  const currentPrincipalId =
    snapshot?.access.kind === "ready"
      ? snapshot.access.data.currentPrincipalId
      : undefined;
  const currentMember =
    snapshot?.access.kind === "ready"
      ? snapshot.access.data.members.find(
          (member) => member.principalId === currentPrincipalId,
        )
      : undefined;
  const currentGrant = currentMember?.spaces[0];
  const canResolveComments =
    currentMember?.role === "owner" || currentGrant?.access === "edit";
  const canComment = canResolveComments || currentGrant?.access === "comment";
  // Po odwracalnej mutacji toast niesie akcję „Cofnij”: świeży wpis na
  // szczycie timeline aktywności wskazuje polecenie, którego podgląd
  // cofnięcia otwiera istniejący UndoDialog.
  const refreshAfter = async (message: string) => {
    const previousHeadEventId =
      snapshot?.activity.kind === "ready"
        ? snapshot.activity.data.items[0]?.eventId
        : undefined;
    const next = await reloadSnapshot();
    const head =
      next?.activity.kind === "ready" ? next.activity.data.items[0] : undefined;
    const undoCommandId =
      head !== undefined &&
      head.eventId !== previousHeadEventId &&
      head.activityType !== "command_undone"
        ? head.targetCommandId
        : undefined;
    pushToast({
      message,
      ...(undoCommandId === undefined ? {} : { undoCommandId }),
    });
  };
  const writeWorkContextNarrative = () => {
    const record = selectedWorkContextRecord;
    const narrative = workContextNarrative?.trim();
    if (!client || !snapshot || record === undefined || !narrative) return;
    setProjectBusy(true);
    const target = { id: record.id, version: record.version };
    void (
      record.kind === "area"
        ? updateAreaResponsibility(client, snapshot, target, narrative)
        : updateInitiativeOutcome(client, snapshot, target, narrative)
    ).then(async (result) => {
      setProjectBusy(false);
      if (result.kind !== "success") {
        showFailure(result);
        return;
      }
      setWorkContextNarrative(undefined);
      await refreshAfter(
        record.kind === "area"
          ? "Responsibility saved."
          : "Intended outcome saved.",
      );
    });
  };
  const stageCommentAttachment = async () => {
    if (!client || !snapshot) return undefined;
    const result = await stageManagedAttachment(client, snapshot);
    if (result.kind !== "success") {
      if (result.message !== "No file was chosen.") showFailure(result);
      return undefined;
    }
    setState({ kind: "ready", snapshot: result.data.snapshot });
    return {
      sourceId: result.data.sourceId,
      original: result.data.original,
    };
  };
  const inspectManagedAttachment = async (
    attachment: DesktopSnapshot["tasks"][number]["attachments"][number],
  ): Promise<"available" | "unavailable"> => {
    if (!client?.inspectManagedPayload) return "unavailable";
    return client
      .inspectManagedPayload({
        captureId: attachment.captureId,
        original: attachment.original,
      })
      .then((result) => result.state)
      .catch(() => "unavailable");
  };
  const restoreManagedAttachment = async (
    attachment: DesktopSnapshot["tasks"][number]["attachments"][number],
  ): Promise<"available" | "unavailable"> => {
    if (!client?.restoreManagedPayload) return "unavailable";
    try {
      const result = await client.restoreManagedPayload({
        captureId: attachment.captureId,
        original: attachment.original,
      });
      if (result.state === "available") {
        await reloadSnapshot();
        pushToast({ message: "The attachment is available again." });
        return "available";
      }
    } catch {
      // The content-safe recovery below is the same for native and Hub errors.
    }
    showFailure({
      kind: "retry",
      message: "Could not fetch the attachment to this device yet. Try again.",
    });
    return "unavailable";
  };

  type AttentionItem = AttentionInboxProjection["items"][number];
  const openAttentionDestination = (item: AttentionItem) => {
    const destination = item.destination;
    if (destination.kind === "task") {
      const task = tasks.find(
        (candidate) => candidate.id === destination.taskId,
      );
      openContext(taskContext(destination.taskId, task?.title ?? item.title));
    } else if (destination.kind === "project") {
      const project =
        snapshot?.projects.kind === "ready"
          ? snapshot.projects.data.items.find(
              (candidate) => candidate.id === destination.projectId,
            )
          : undefined;
      openContext(
        projectContext(destination.projectId, project?.title ?? item.title),
      );
    } else if (destination.kind === "document") {
      openContext(destinationContext("library", "Library"));
    } else {
      openContext(destinationContext("history", "Capture history"));
    }
    if (client && snapshot && item.state === "unread") {
      setAttentionBusy(true);
      void updateAttention(client, snapshot, item, "read").then(
        async (result) => {
          setAttentionBusy(false);
          if (result.kind === "success") await reload();
          else showFailure(result);
        },
      );
    }
  };
  const readAttention = (item: AttentionItem) => {
    if (!client || !snapshot) return;
    setAttentionBusy(true);
    void updateAttention(client, snapshot, item, "read").then(
      async (result) => {
        setAttentionBusy(false);
        if (result.kind === "success")
          await refreshAfter("Signal marked as read.");
        else showFailure(result);
      },
    );
  };
  const dismissAttention = (item: AttentionItem) => {
    if (!client || !snapshot) return;
    setAttentionBusy(true);
    void updateAttention(client, snapshot, item, "dismiss").then(
      async (result) => {
        setAttentionBusy(false);
        if (result.kind === "success")
          await refreshAfter("Signal removed from the inbox.");
        else showFailure(result);
      },
    );
  };
  const routeAttentionCapture = (
    item: AttentionItem,
    destination: "task" | "knowledge_source",
  ) => {
    if (!client || !snapshot || item.destination.kind !== "capture") return;
    setAttentionBusy(true);
    void routeCaptureException(
      client,
      snapshot,
      item.destination.captureId,
      destination,
    ).then(async (result) => {
      setAttentionBusy(false);
      if (result.kind === "success")
        await refreshAfter(
          destination === "task"
            ? "Capture filed as a task."
            : "Capture filed as a knowledge source.",
        );
      else showFailure(result);
    });
  };
  const retryAttentionCapture = (item: AttentionItem) => {
    if (!client || !snapshot) return;
    setAttentionBusy(true);
    void resolveCaptureException(client, snapshot, item, "retry").then(
      async (result) => {
        setAttentionBusy(false);
        if (result.kind === "success")
          await refreshAfter("Capture is back in the safe processing queue.");
        else showFailure(result);
      },
    );
  };
  const keepAttentionCapture = (item: AttentionItem) => {
    if (!client || !snapshot) return;
    setAttentionBusy(true);
    void resolveCaptureException(
      client,
      snapshot,
      item,
      "keep_unclassified",
    ).then(async (result) => {
      setAttentionBusy(false);
      if (result.kind === "success")
        await refreshAfter("Original kept without a forced classification.");
      else showFailure(result);
    });
  };
  const replaceAttentionPayload = (item: AttentionItem) => {
    if (!client?.selectCapturePayload || !snapshot) {
      pushToast({ message: "Choosing a file is unavailable right now." });
      return;
    }
    setAttentionBusy(true);
    void client.selectCapturePayload().then(async (selected) => {
      if (selected.outcome !== "success") {
        setAttentionBusy(false);
        if (selected.code !== "cancelled")
          pushToast({
            message: "Could not prepare a safe replacement file. Try again.",
          });
        return;
      }
      const result = await resolveCaptureException(
        client,
        snapshot,
        item,
        "replace_payload",
        selected.original,
      );
      setAttentionBusy(false);
      if (result.kind === "success")
        await refreshAfter("Original replaced and sent back for processing.");
      else showFailure(result);
    });
  };

  const openUndo = async (
    targetCommandId: Parameters<typeof previewUndo>[2],
  ) => {
    if (!client || !snapshot) return;
    setNotice(undefined);
    const result = await previewUndo(client, snapshot, targetCommandId);
    if (result.kind === "success") setUndoPreview(result.data);
    else showFailure(result);
  };

  const navKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    )
      return;
    event.preventDefault();
    const buttons = [
      ...(navRef.current?.querySelectorAll<HTMLButtonElement>(
        ".nav-item, .nav-group-toggle",
      ) ?? []),
    ].filter((button) => button.closest("[hidden]") === null);
    if (buttons.length === 0) return;
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[nextIndex]?.focus();
  };

  const tabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    key: string,
  ) => {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    )
      return;
    event.preventDefault();
    const current = navigation.tabs.findIndex((tab) => tab.key === key);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? navigation.tabs.length - 1
          : (current +
              (event.key === "ArrowRight" ? 1 : -1) +
              navigation.tabs.length) %
            navigation.tabs.length;
    const next = navigation.tabs[nextIndex];
    if (!next) return;
    setNavigation((value) => activateShellContext(value, next.key));
    window.requestAnimationFrame(() => {
      tabRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-shell-tab="${CSS.escape(next.key)}"]`,
        )
        ?.focus();
    });
  };

  if (state.kind === "loading")
    return (
      <main className="center-state" aria-busy="true">
        <BrandMark />
        <div className="loading-line" />
        <p>Opening the workspace…</p>
      </main>
    );
  if (state.kind === "recovery") {
    const reason =
      state.build.recoveryReason === "secure_storage_unavailable"
        ? "The system keychain is unavailable. Unlock the system and try again, or restore a verified backup."
        : state.build.recoveryReason === "protected_key_unavailable"
          ? "The protected workspace key is unavailable or damaged. Existing data was not replaced."
          : "The local workspace did not open safely. Constellation stopped before writing anything.";
    return (
      <main className="center-state recovery-required-state">
        <BrandMark />
        <p className="eyebrow">Workspace recovery</p>
        <h1>This data needs a safe restore</h1>
        <p>{reason}</p>
        <div>
          <button
            className="primary-button"
            onClick={() => setRecoveryOpen(true)}
          >
            Open recovery
          </button>
          <button
            className="secondary-button"
            onClick={() => window.location.reload()}
          >
            Try opening again
          </button>
        </div>
        {recoveryOpen && client && (
          <Suspense fallback={null}>
            <WorkspaceRecovery
              client={client}
              workspaceName="Local workspace"
              recoveredPrevious={false}
              restoreOnly
              onClose={() => setRecoveryOpen(false)}
              onRestored={async () => window.location.reload()}
            />
          </Suspense>
        )}
      </main>
    );
  }
  if (state.kind !== "ready")
    return (
      <main className="center-state">
        <span className="state-symbol">!</span>
        <p className="eyebrow">Constellation</p>
        <h1>
          {state.kind === "unavailable"
            ? "The desktop bridge is unavailable"
            : "Could not open the workspace"}
        </h1>
        <p>{state.message}</p>
        <button
          className="secondary-button"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </main>
    );

  const { bootstrap, build, tasks } = state.snapshot;
  const isPreview = build.channel === "developer-preview";
  const coordinatedDataHome =
    state.snapshot.dataHome?.descriptor.providerKind === "coordinated";
  const dataHomeLabel = coordinatedDataHome
    ? `${state.snapshot.dataHome?.descriptor.displayName ?? "Hub"} · coordinated`
    : "Local only · data on this device";
  // Product-owner correction (2026-07-18): the work plane owns the available
  // width until a deliberate record selection opens the inspector. The panel
  // remains the single detail plane, but it never consumes an empty column.
  // Jedno miejsce, w którym powstaje pozycja nawigacji. Wcześniej ten blok
  // istniał wyłącznie WEWNĄTRZ pętli po grupach, więc cel bez modułu
  // (`group: null` — pozycje dnia, Access, Settings) nie renderował się
  // w ogóle: był w rejestrze, miał skrót i trasę, a w sidebarze go nie było.
  const navEntry = (item: (typeof navItems)[number]) => {
    const shortcutHint = surfaceShortcutHint(item);
    return (
      <div className="nav-entry" key={item.id}>
        <button
          data-surface={item.id}
          className={`nav-item ${surface === item.id ? "active" : ""}`}
          tabIndex={surface === item.id ? 0 : -1}
          aria-label={
            item.id === "tasks"
              ? `${item.label} · ${tasks.length}`
              : item.id === "inbox" &&
                  state.snapshot.attention.kind === "ready" &&
                  state.snapshot.attention.data.unreadCount > 0
                ? `${item.label} · ${state.snapshot.attention.data.unreadCount} unread`
                : item.label
          }
          aria-current={surface === item.id ? "page" : undefined}
          title={
            railMode
              ? undefined
              : shortcutHint.kind === "direct"
                ? `${item.label} · ${shortcutHint.keys}`
                : `${item.label} · via palette ${shortcutHint.keys}`
          }
          onFocus={(event) => {
            setFocusedNavItemId(item.id);
            preloadSurface(item.id);
            showRailTip(event.currentTarget, item.label, shortcutHint);
          }}
          onBlur={hideRailTip}
          onMouseEnter={(event) => {
            preloadSurface(item.id);
            showRailTip(event.currentTarget, item.label, shortcutHint);
          }}
          onMouseLeave={hideRailTip}
          {...navHandlers(destinationContext(item.id, item.label))}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
          <span className="nav-item-meta" aria-hidden="true">
            {item.id === "tasks" ? (
              <span className="nav-count">{tasks.length}</span>
            ) : item.id === "inbox" &&
              state.snapshot.attention.kind === "ready" &&
              state.snapshot.attention.data.unreadCount > 0 ? (
              <span className="nav-count nav-count--attention">
                {state.snapshot.attention.data.unreadCount}
              </span>
            ) : null}
            <kbd
              className={
                shortcutHint.kind === "palette"
                  ? "nav-palette-shortcut"
                  : undefined
              }
            >
              {shortcutHint.keys}
              {shortcutHint.kind === "palette" ? "…" : ""}
            </kbd>
          </span>
        </button>
        <button
          type="button"
          className="nav-favorite-toggle"
          tabIndex={
            focusedNavItemId === item.id || surface === item.id ? 0 : -1
          }
          aria-label={`${favorites.includes(item.id) ? "Remove" : "Add"} ${item.label} ${favorites.includes(item.id) ? "from" : "to"} favorites`}
          aria-pressed={favorites.includes(item.id)}
          onClick={() =>
            setFavorites((current) =>
              current.includes(item.id)
                ? current.filter((id) => id !== item.id)
                : [...current, item.id],
            )
          }
        >
          {favorites.includes(item.id) ? "★" : "☆"}
        </button>
      </div>
    );
  };

  // Dyspozytor ekranów. Do PR 6 był to płaski łańcuch dwunastu
  // `{surface === "x" && …}` rozciągnięty na ~600 linii: żeby dołożyć ekran,
  // trzeba było znaleźć właściwe miejsce w środku pliku, a żeby sprawdzić,
  // co się renderuje dla danego celu — przeczytać wszystkie dwanaście.
  //
  // Mapa jest TOTALNA nad `DesktopSurface`, więc nowy cel w rejestrze wywala
  // build do czasu podpięcia ekranu — zamiast renderować pusty panel. Wpisy
  // są funkcjami, nie elementami: inaczej każdy ekran liczyłby swój JSX przy
  // każdym renderze powłoki, także ten, którego nikt nie ogląda.
  const surfacePanels: Record<SurfaceId, () => ReactNode> = {
    today: () => (
      <CockpitSurface
        client={client}
        snapshot={state.snapshot}
        selectedTaskId={selectedTaskId}
        selectedProjectId={selectedProjectId}
        onOpenProject={(id) => {
          const project =
            state.snapshot.projects.kind === "ready"
              ? state.snapshot.projects.data.items.find(
                  (item) => item.id === id,
                )
              : undefined;
          openContext(projectContext(id, project?.title ?? "Project"));
        }}
        onSelectProject={selectProjectInInspector}
        onOpenTask={(id) => {
          const task = tasks.find((item) => item.id === id);
          openContext(taskContext(id, task?.title ?? "Task"));
        }}
        onSelectTask={selectTaskInInspector}
        onOpenAttention={() =>
          openContext(destinationContext("inbox", "Inbox"))
        }
        onCapture={openCapture}
      />
    ),
    meetings: () =>
      client === undefined ? null : (
        <LazySurfaceBoundary label="Meetings">
          <Suspense fallback={<SurfaceLoadingState label="Meetings" />}>
            <MeetingsSurface
              client={client}
              activeMeetingId={selectedMeetingId}
              inspectorHost={meetingInspectorHost}
              onInspectorOpen={() => setMeetingInspectorOpen(true)}
              onMeetingSelected={setSelectedMeetingId}
            />
          </Suspense>
        </LazySurfaceBoundary>
      ),
    organizations: () => (
      <LazySurfaceBoundary label="Organizations">
        <Suspense fallback={<SurfaceLoadingState label="Organizations" />}>
          {activeOrganizationId === undefined ? (
            <StrategicDepthSurface
              client={client}
              snapshot={state.snapshot}
              selectedRecordId={selectedStrategicId}
              onSelectRecord={selectStrategicInInspector}
              onOpenOrganization={(id, name) =>
                openContext(organizationContext(id, name))
              }
              onReload={reload}
              onFailure={showFailure}
            />
          ) : (
            <OrganizationContextLoader
              client={client}
              snapshot={state.snapshot}
              organizationId={activeOrganizationId}
              // The same flag the Project page's client row uses: this is
              // the same edge authored from the other end, and the two
              // contexts are never open at once.
              linkBusy={projectBusy}
              onLinkDelivery={(projectId) => {
                if (!client) return;
                setProjectBusy(true);
                void linkOrganizationDelivery(
                  client,
                  state.snapshot,
                  activeOrganizationId,
                  projectId,
                ).then(async (result) => {
                  setProjectBusy(false);
                  if (result.kind === "success")
                    await refreshAfter("Project linked to the client.");
                  else showFailure(result);
                });
              }}
              onUnlinkDelivery={(projectId) => {
                if (!client) return;
                setProjectBusy(true);
                void unlinkOrganizationDelivery(
                  client,
                  state.snapshot,
                  activeOrganizationId,
                  projectId,
                ).then(async (result) => {
                  setProjectBusy(false);
                  if (result.kind === "success")
                    await refreshAfter("Project link removed.");
                  else showFailure(result);
                });
              }}
              onOpenProject={(id, title) =>
                openContext(projectContext(id, title))
              }
              onOpenTask={(id, title) => openContext(taskContext(id, title))}
              onOpenDocument={(id, title) =>
                openContext(documentContext(id, title))
              }
              onOpenMeeting={(id) => {
                setSelectedMeetingId(id);
                openContext(destinationContext("meetings", "Meetings"));
              }}
              onOpenRelationship={(id) => {
                openContext(
                  destinationContext("organizations", "Organizations"),
                );
                selectStrategicInInspector(id);
              }}
            />
          )}
        </Suspense>
      </LazySurfaceBoundary>
    ),
    work: () => (
      <LazySurfaceBoundary label="Saved views">
        <Suspense fallback={<SurfaceLoadingState label="Saved views" />}>
          <WorkSurface
            client={client}
            snapshot={state.snapshot}
            selectedTaskId={selectedTaskId}
            selectedProjectId={selectedProjectId}
            selectedContextId={selectedWorkContext?.id}
            onSelectTask={selectTaskInInspector}
            onOpenTask={(id) => {
              const task = tasks.find((item) => item.id === id);
              openContext(taskContext(id, task?.title ?? "Task"));
            }}
            onSelectProject={selectProjectInInspector}
            onSelectContext={selectWorkContextInInspector}
            onReload={reload}
            onFailure={showFailure}
          />
        </Suspense>
      </LazySurfaceBoundary>
    ),
    settings: () => (
      <LazySurfaceBoundary label="Settings">
        <Suspense fallback={<SurfaceLoadingState label="Settings" />}>
          <SettingsSurface
            client={client}
            snapshot={state.snapshot}
            onReload={reload}
            onFailure={showFailure}
            onOpenRecovery={() => setRecoveryOpen(true)}
            onNavigate={(next, label) =>
              openContext(destinationContext(next, label))
            }
          />
        </Suspense>
      </LazySurfaceBoundary>
    ),
    tasks: () => (
      <TasksSurface
        snapshot={state.snapshot}
        selectedTaskId={selectedTaskId}
        busyTaskId={busyTaskId}
        onOpenTask={(id) => {
          const task = tasks.find((item) => item.id === id);
          openContext(taskContext(id, task?.title ?? "Task"));
        }}
        onSelectTask={selectTaskInInspector}
        onCapture={openCapture}
        onCreateTask={async (title) => {
          if (!client) return false;
          const result = await createTask(client, state.snapshot, {
            title,
          });
          if (result.kind === "success") {
            await refreshAfter("Task created.");
            selectTaskInInspector(result.data.taskId);
            return true;
          }
          showFailure(result);
          return false;
        }}
        onSetStatus={(id, statusId) => {
          const task = tasks.find((item) => item.id === id);
          if (!client || !task) return;
          setBusyTaskId(id);
          void setTaskStatus(
            client,
            state.snapshot,
            id,
            task.version,
            statusId,
          ).then(async (result) => {
            setBusyTaskId(undefined);
            if (result.kind === "success")
              await refreshAfter("Task status updated.");
            else showFailure(result);
          });
        }}
        onSetCompleted={(id, completed) => {
          const task = tasks.find((item) => item.id === id);
          if (!client || !task) return;
          setBusyTaskId(id);
          void setTaskCompletion(
            client,
            state.snapshot,
            id,
            task.version,
            completed,
          ).then(async (result) => {
            setBusyTaskId(undefined);
            if (result.kind === "success")
              await refreshAfter(
                completed ? "Task completed." : "Task reopened.",
              );
            else showFailure(result);
          });
        }}
        onSetAssignment={(id: TaskId, principalId: PrincipalId | undefined) => {
          const task = tasks.find((item) => item.id === id);
          if (!client || !task) return;
          if (principalId === undefined && task.assignment === undefined)
            return;
          setBusyTaskId(id);
          void setTaskAssignment(
            client,
            state.snapshot,
            task,
            principalId,
          ).then(async (result) => {
            setBusyTaskId(undefined);
            if (result.kind === "success")
              await refreshAfter(
                principalId === undefined
                  ? "Assignee removed."
                  : "Assignee set.",
              );
            else showFailure(result);
          });
        }}
      />
    ),
    library: () => (
      <LazySurfaceBoundary label="Library">
        <Suspense fallback={<SurfaceLoadingState label="Library" />}>
          <DocumentsSurface
            client={client}
            snapshot={state.snapshot}
            activeDocumentId={activeContext.documentId}
            inspectorHost={documentInspectorHost}
            onInspectorOpen={(kind) => {
              setDocumentInspectorKind(kind);
              setDocumentInspectorOpen(true);
            }}
            onEntityActivate={(target) => {
              if (target.targetKind === "task") {
                const task = state.snapshot.tasks.find(
                  (item) => item.id === target.targetId,
                );
                openContext(
                  taskContext(target.targetId as TaskId, task?.title ?? "Task"),
                );
                return;
              }
              if (target.targetKind === "project") {
                const project =
                  state.snapshot.projects.kind === "ready"
                    ? state.snapshot.projects.data.items.find(
                        (item) => item.id === target.targetId,
                      )
                    : undefined;
                openContext(
                  projectContext(
                    target.targetId as ProjectId,
                    project?.title ?? "Project",
                  ),
                );
                return;
              }
              if (
                target.targetKind === "person" ||
                target.targetKind === "organization"
              ) {
                setSelectedStrategicId(target.targetId as StrategicRecordId);
                openContext(
                  destinationContext("organizations", "Organizations"),
                );
                return;
              }
              setSelectedMeetingId(target.targetId);
              openContext(destinationContext("meetings", "Meetings"));
            }}
            onReload={reload}
            onFailure={showFailure}
          />
        </Suspense>
      </LazySurfaceBoundary>
    ),
    projects: () => (
      <ProjectsSurface
        client={client}
        snapshot={state.snapshot}
        selectedProjectId={selectedProjectId}
        activeProjectId={activeContext.projectId}
        overview={projectOverview}
        relation={sessionRelation}
        clientCandidates={
          projectOverview
            ? linkableClientOrganizations(
                state.snapshot,
                projectOverview.project,
              )
            : []
        }
        linkedClientIds={
          new Set(
            projectOverview
              ? directClientLinks(
                  state.snapshot,
                  projectOverview.project.id,
                ).keys()
              : [],
          )
        }
        busy={projectBusy}
        onOpenProject={(id) => {
          const project =
            state.snapshot.projects.kind === "ready"
              ? state.snapshot.projects.data.items.find(
                  (item) => item.id === id,
                )
              : undefined;
          openContext(projectContext(id, project?.title ?? "Project"));
        }}
        onSelectProject={selectProjectInInspector}
        onBackToProjects={() =>
          openContext(destinationContext("projects", "Projects"))
        }
        onOpenDocument={(id, title) => openContext(documentContext(id, title))}
        onOpenMeeting={(id) => {
          setSelectedMeetingId(id);
          openContext(destinationContext("meetings", "Meetings"));
        }}
        onOpenRelationship={(id) => {
          setSelectedStrategicId(id);
          openContext(destinationContext("organizations", "Organizations"));
        }}
        onEntityActivate={(target) => {
          if (target.targetKind === "task") {
            setSelectedTaskId(target.targetId as TaskId);
            openContext(destinationContext("tasks", "Tasks"));
            return;
          }
          if (target.targetKind === "project") {
            const project =
              state.snapshot.projects.kind === "ready"
                ? state.snapshot.projects.data.items.find(
                    (item) => item.id === target.targetId,
                  )
                : undefined;
            openContext(
              projectContext(
                target.targetId as ProjectId,
                project?.title ?? "Project",
              ),
            );
            return;
          }
          if (
            target.targetKind === "person" ||
            target.targetKind === "organization"
          ) {
            setSelectedStrategicId(target.targetId as StrategicRecordId);
            openContext(destinationContext("organizations", "Organizations"));
            return;
          }
          setSelectedMeetingId(target.targetId);
          openContext(destinationContext("meetings", "Meetings"));
        }}
        onCreate={async (title, outcome, templateId) => {
          if (!client) return false;
          setProjectBusy(true);
          const result = await createProject(
            client,
            state.snapshot,
            title,
            outcome,
          );
          if (result.kind !== "success") {
            setProjectBusy(false);
            showFailure(result);
            return false;
          }
          if (templateId !== undefined) {
            const applied = await applyTemplateToProject(
              client,
              state.snapshot,
              {
                projectId: result.data.projectId,
                projectVersion: 1,
                templateId,
              },
            );
            if (applied.kind !== "success") showFailure(applied);
          }
          setProjectBusy(false);
          openContext(projectContext(result.data.projectId, title.trim()));
          await refreshAfter("Project created.");
          return true;
        }}
        onApplyTemplate={(templateId) => {
          if (!client || !projectOverview) return;
          setProjectBusy(true);
          void applyTemplateToProject(client, state.snapshot, {
            projectId: projectOverview.project.id,
            projectVersion: projectOverview.project.version,
            templateId,
          }).then(async (result) => {
            setProjectBusy(false);
            if (result.kind === "success") {
              await refreshAfter("Template applied.");
            } else {
              showFailure(result);
            }
          });
        }}
        onUpdateOutcome={(outcome) => {
          if (!client || !projectOverview) return;
          setProjectBusy(true);
          void updateProjectOutcome(
            client,
            state.snapshot,
            projectOverview.project,
            outcome,
          ).then(async (result) => {
            setProjectBusy(false);
            if (result.kind === "success")
              await refreshAfter("Intended outcome updated.");
            else showFailure(result);
          });
        }}
        onSetLifecycle={(lifecycle) => {
          if (!client || !projectOverview) return;
          setProjectBusy(true);
          void setProjectLifecycle(
            client,
            state.snapshot,
            projectOverview.project,
            lifecycle,
          ).then(async (result) => {
            setProjectBusy(false);
            if (result.kind === "success")
              await refreshAfter(
                lifecycle === "closed"
                  ? "Project closed. History and open tasks are unchanged."
                  : "Project reopened.",
              );
            else showFailure(result);
          });
        }}
        onRelate={(taskId) => {
          const task = tasks.find((item) => item.id === taskId);
          if (!client || !task || !projectOverview) return;
          setProjectBusy(true);
          void relateTask(
            client,
            state.snapshot,
            task.id,
            task.version,
            projectOverview.project.id,
            projectOverview.project.version,
          ).then(async (result) => {
            setProjectBusy(false);
            if (result.kind === "success") {
              setSessionRelation({
                id: result.data.relationId,
                version: result.data.version,
                taskId,
              });
              await refreshAfter("Task linked to the project.");
            } else showFailure(result);
          });
        }}
        onLinkClient={(organizationId) => {
          if (!client || !projectOverview) return;
          setProjectBusy(true);
          void linkProjectClient(
            client,
            state.snapshot,
            projectOverview.project,
            organizationId,
          ).then(async (result) => {
            setProjectBusy(false);
            if (result.kind === "success")
              await refreshAfter("Client linked to the project.");
            else showFailure(result);
          });
        }}
        // Detaching reloads the whole snapshot like every other write
        // here, which is what re-derives both the Klient list and the
        // candidate set — the link record the command needs lives in that
        // snapshot, not in session state.
        onUnlinkClient={(organizationId) => {
          if (!client || !projectOverview) return;
          setProjectBusy(true);
          void unlinkProjectClient(
            client,
            state.snapshot,
            projectOverview.project.id,
            organizationId,
          ).then(async (result) => {
            setProjectBusy(false);
            if (result.kind === "success")
              await refreshAfter("Client link removed.");
            else showFailure(result);
          });
        }}
        onUnrelate={() => {
          if (!client || !sessionRelation) return;
          setProjectBusy(true);
          void unrelateTask(
            client,
            state.snapshot,
            sessionRelation.id,
            sessionRelation.version,
          ).then(async (result) => {
            setProjectBusy(false);
            if (result.kind === "success") {
              setSessionRelation(undefined);
              await refreshAfter("Link removed.");
            } else showFailure(result);
          });
        }}
      />
    ),
    history: () => (
      <HistorySurface
        snapshot={state.snapshot}
        selectedCaptureId={selectedCaptureId}
        onSelectCapture={selectCaptureInInspector}
      />
    ),
    activity: () => (
      <LazySurfaceBoundary label="Activity">
        <Suspense fallback={<SurfaceLoadingState label="Activity" />}>
          <ActivitySurface
            activity={state.snapshot.activity}
            timezone={state.snapshot.bootstrap.workspace.timezone}
            onUndo={(id) => void openUndo(id)}
            onRetry={() => void reload()}
          />
        </Suspense>
      </LazySurfaceBoundary>
    ),
    inbox: () => (
      <AttentionSurface
        attention={state.snapshot.attention}
        selectedItemId={selectedAttentionId}
        onRetry={() => void reload()}
        onOpen={openAttentionDestination}
        onSelect={(item) => selectAttentionInInspector(item.id)}
      />
    ),
    access: () => (
      <LazySurfaceBoundary label="Access">
        <Suspense fallback={<SurfaceLoadingState label="Access" />}>
          <AccessSurface
            access={state.snapshot.access}
            agentAccess={state.snapshot.agentAccess}
            agentTransport={
              state.snapshot.dataHome?.descriptor.providerKind === "coordinated"
                ? "remote_hub"
                : "local"
            }
            spaces={state.snapshot.bootstrap.spaces}
            busy={accessBusy}
            onAdd={(input) => {
              if (!client) return;
              setAccessBusy(true);
              setNotice(undefined);
              void addWorkspaceMember(client, state.snapshot, input).then(
                async (result) => {
                  setAccessBusy(false);
                  if (result.kind === "success")
                    await refreshAfter("Access created.");
                  else showFailure(result);
                },
              );
            }}
            onSetAccess={(member, access) => {
              if (!client) return;
              setAccessBusy(true);
              setNotice(undefined);
              void setWorkspaceMemberAccess(
                client,
                state.snapshot,
                member,
                access,
              ).then(async (result) => {
                setAccessBusy(false);
                if (result.kind === "success")
                  await refreshAfter("Access scope updated.");
                else showFailure(result);
              });
            }}
            onRevoke={(member) => {
              if (!client) return;
              setAccessBusy(true);
              setNotice(undefined);
              void revokeWorkspaceMember(client, state.snapshot, member).then(
                async (result) => {
                  setAccessBusy(false);
                  if (result.kind === "success")
                    await refreshAfter(
                      "Access revoked. Devices drop the projection at the next sync.",
                    );
                  else showFailure(result);
                },
              );
            }}
            onAgentAdd={(input) => {
              if (!client) return;
              setAccessBusy(true);
              setNotice(undefined);
              const remote =
                state.snapshot.dataHome?.descriptor.providerKind ===
                "coordinated";
              void (
                remote
                  ? createRemoteAgentGrant(client, input)
                  : createAgentGrant(client, state.snapshot, input)
              ).then(async (result) => {
                setAccessBusy(false);
                if (result.kind === "success") {
                  await reload();
                  setAgentGrantDetails(
                    "endpoint" in result.data
                      ? {
                          title: "Remote MCP access created",
                          descriptorLabel: "Protected configuration file",
                          descriptorPath: result.data.descriptorPath,
                          connectionLabel: "Endpoint",
                          connectionValue: result.data.endpoint,
                        }
                      : {
                          title: "MCP access created",
                          descriptorLabel: "Access file",
                          descriptorPath: result.data.descriptorPath,
                          connectionLabel: "Host adapter",
                          connectionValue: `${result.data.launchCommand} ${result.data.launchArgs.join(" ")}`,
                        },
                  );
                } else showFailure(result);
              });
            }}
            onAgentRotate={(grant) => {
              if (!client) return;
              setAccessBusy(true);
              setNotice(undefined);
              const remote =
                state.snapshot.dataHome?.descriptor.providerKind ===
                "coordinated";
              void (
                remote
                  ? rotateRemoteAgentCredential(client, grant)
                  : rotateAgentCredential(client, state.snapshot, grant)
              ).then(async (result) => {
                setAccessBusy(false);
                if (result.kind === "success") {
                  await reload();
                  setAgentGrantDetails(
                    "endpoint" in result.data
                      ? {
                          title: "Remote credential rotated",
                          descriptorLabel: "Protected configuration file",
                          descriptorPath: result.data.descriptorPath,
                          connectionLabel: "Endpoint",
                          connectionValue: result.data.endpoint,
                        }
                      : {
                          title: "Credential rotated",
                          descriptorLabel: "Access file",
                          descriptorPath: result.data.descriptorPath,
                          connectionLabel: "Host adapter",
                          connectionValue: `${result.data.launchCommand} ${result.data.launchArgs.join(" ")}`,
                        },
                  );
                } else showFailure(result);
              });
            }}
            onAgentRescope={async (grant, target) => {
              if (!client) return "No connection to the kernel. Try again.";
              setAccessBusy(true);
              setNotice(undefined);
              const result = await updateAgentGrantScope(
                client,
                state.snapshot,
                grant,
                target,
              );
              setAccessBusy(false);
              if (result.kind === "conflict") {
                // The versions the dialog read are the ones that just
                // lost the race, so every retry from it would re-send
                // them. Reload instead, and say that plainly — the
                // workflow's own "refresh and try again" would be asking
                // for something this line has already done.
                setNotice({
                  kind: "conflict",
                  message:
                    "This access changed meanwhile, so the write did not go through. The data is refreshed — open “Change permissions” again and check the scope before saving.",
                });
                await reloadSnapshot();
                return undefined;
              }
              if (result.kind !== "success") {
                showFailure(result);
                // Returned as well as noticed: the notice sits on a
                // surface the open dialog covers, and the person who has
                // to act on the refusal is inside the dialog.
                return result.message;
              }
              await refreshAfter("Agent permissions updated.");
              return undefined;
            }}
            onAgentRevoke={(grant) => {
              if (!client) return;
              setAccessBusy(true);
              setNotice(undefined);
              const remote =
                state.snapshot.dataHome?.descriptor.providerKind ===
                "coordinated";
              void (
                remote
                  ? revokeRemoteAgentGrant(client, grant)
                  : revokeAgentGrant(client, state.snapshot, grant)
              ).then(async (result) => {
                setAccessBusy(false);
                if (result.kind === "success")
                  await refreshAfter(
                    remote
                      ? "Remote agent access revoked and its configuration file deleted."
                      : "Agent access revoked and the local credential deleted.",
                  );
                else showFailure(result);
              });
            }}
          />
        </Suspense>
      </LazySurfaceBoundary>
    ),
  };

  return (
    <div
      className={`desktop-shell wave2-shell${inspectorDetailOpen ? " inspector-open" : ""}${surface === "meetings" ? " meeting-context-shell" : ""}`}
      style={{ ["--inspector-width" as string]: `${inspectorWidth}px` }}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Workspace and navigation">
        <div className="window-drag" />
        <div className="brand-row">
          <BrandMark />
          <strong>Constellation</strong>
        </div>
        <button
          type="button"
          className="workspace-switcher"
          aria-label={`Workspace ${bootstrap.workspace.name}, ${dataHomeLabel}`}
          disabled={isPreview}
          title={
            isPreview
              ? "Open workspace settings"
              : coordinatedDataHome
                ? "Open coordinated workspace settings"
                : "Open workspace settings and switching"
          }
          onClick={() =>
            openContext(destinationContext("settings", "Settings"))
          }
        >
          <span className="workspace-avatar">I</span>
          <span>
            <strong>{bootstrap.workspace.name}</strong>
            <small>
              {state.snapshot.dataHome?.availability === "available"
                ? dataHomeLabel
                : "Data Home needs attention"}
            </small>
          </span>
          {!isPreview && <span className="workspace-switcher-action">•••</span>}
        </button>
        <button
          className="search-control"
          aria-label={`Search · ${modifierLabel}K`}
          onFocus={(event) =>
            showRailTip(event.currentTarget, "Search", {
              keys: `${modifierLabel}K`,
              kind: "direct",
            })
          }
          onBlur={hideRailTip}
          onMouseEnter={(event) =>
            showRailTip(event.currentTarget, "Search", {
              keys: `${modifierLabel}K`,
              kind: "direct",
            })
          }
          onMouseLeave={hideRailTip}
          onClick={() => setSearchOpen(true)}
        >
          <Icon name="search" />
          <span>Search</span>
          <kbd>{modifierLabel}K</kbd>
        </button>
        <nav ref={navRef} aria-label="Main navigation" onKeyDown={navKeyDown}>
          {favorites.length > 0 && (
            <>
              <p className="nav-label">Favorites</p>
              {favorites.map((favorite) => {
                const item = navItems.find((entry) => entry.id === favorite);
                return item ? (
                  <button
                    key={`favorite:${item.id}`}
                    className={`nav-item nav-favorite ${surface === item.id ? "active" : ""}`}
                    tabIndex={-1}
                    aria-current={surface === item.id ? "page" : undefined}
                    onFocus={() => preloadSurface(item.id)}
                    onMouseEnter={() => preloadSurface(item.id)}
                    {...navHandlers(destinationContext(item.id, item.label))}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    <span aria-hidden="true">★</span>
                  </button>
                ) : null;
              })}
            </>
          )}
          {recentContexts.length > 0 && (
            <>
              <p className="nav-label">Recent</p>
              {recentContexts.map((recent) => {
                const item = navItems.find(
                  (entry) => entry.id === recent.surface,
                );
                return (
                  <button
                    key={`recent:${recent.key}`}
                    className="nav-item nav-recent"
                    tabIndex={-1}
                    {...navHandlers(recent)}
                  >
                    <Icon name={item?.icon ?? "project"} />
                    <span>{recent.label}</span>
                    {item !== undefined && item.label !== recent.label && (
                      <small>{item.label}</small>
                    )}
                  </button>
                );
              })}
            </>
          )}
          {/* TRYB USTAWIEŃ: lewa kolumna przestaje być nawigacją po pracy
              i staje się spisem sekcji. Nawigacja nie jest ukrywana stylem —
              po prostu się nie renderuje, więc nie zostaje osiągalna Tabem
              w miejscu, którego nie widać. */}
          {surface === "settings" ? (
            <nav
              className="settings-mode-column"
              aria-label="Settings sections"
            >
              <button
                type="button"
                className="nav-item settings-mode-back"
                data-settings-back="true"
                onClick={leaveSettings}
              >
                <span aria-hidden="true">‹</span>
                <span>Settings</span>
              </button>
              {settingsCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="nav-item settings-mode-section"
                  data-settings-section={category.id}
                  onClick={() =>
                    document
                      .getElementById(settingsCategoryElementId(category.id))
                      ?.scrollIntoView({ block: "start", behavior: "auto" })
                  }
                >
                  <span>{category.label}</span>
                </button>
              ))}
            </nav>
          ) : (
            <>
              {/* Cele bez modułu (Today, Inbox) stoją NAD modułami i bez nagłówka
              grupy: to nie są filtry, tylko tryby pracy. Renderują się tą samą
              funkcją co pozycje w modułach, więc nie mogą się od nich rozjechać. */}
              {navItems
                .filter((item) => item.group === null && item.shortcut !== null)
                .map((item) => navEntry(item))}
              {navigationGroups.map((group) => {
                const groupItems = navItems.filter(
                  (item) => item.group === group,
                );
                const activeGroupItem = groupItems.find(
                  (item) => item.id === surface,
                );
                const expanded =
                  railMode || !collapsedNavigationGroups.includes(group);
                // `aria-controls` rozdziela wartość po BIAŁYCH ZNAKACH, więc nazwa
                // modułu ze spacją („Work Management") rozpadała się na dwa tokeny
                // — `primary-navigation-work` i `management` — z których żaden nie
                // istniał. Przycisk rozwijania wskazywał w nicość, a asystujące
                // technologie nie miały jak powiedzieć, co on właściwie otwiera.
                // Poprzednie nazwy grup („Praca", „Wiedza") były jednowyrazowe,
                // więc defekt czekał na pierwszą nazwę ze spacją.
                const groupId = `primary-navigation-${group
                  .toLocaleLowerCase("en")
                  .replace(/[^a-z0-9]+/gu, "-")
                  .replace(/^-|-$/gu, "")}`;
                return (
                  <div className="nav-group" key={group}>
                    {!railMode && (
                      <button
                        type="button"
                        className={`nav-group-toggle${activeGroupItem === undefined ? "" : " contains-current"}`}
                        tabIndex={
                          activeGroupItem !== undefined && !expanded ? 0 : -1
                        }
                        aria-expanded={expanded}
                        aria-controls={groupId}
                        aria-label={
                          activeGroupItem === undefined
                            ? group
                            : `${group}, current view ${activeGroupItem.label}`
                        }
                        onClick={() => toggleNavigationGroup(group)}
                      >
                        <span>{group}</span>
                        {activeGroupItem !== undefined && !expanded && (
                          <small>{activeGroupItem.label}</small>
                        )}
                        <span
                          className="nav-group-chevron"
                          aria-hidden="true"
                        />
                      </button>
                    )}
                    <div
                      id={groupId}
                      className="nav-group-items"
                      role="group"
                      aria-label={group}
                      hidden={!expanded}
                    >
                      {groupItems.map((item) => navEntry(item))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </nav>
        <div className="sidebar-spacer" />
        {isPreview && (
          <details className="fixture-condition">
            <summary>Preview condition</summary>
            <select
              value={previewCondition}
              onChange={(event) =>
                setPreviewCondition(event.target.value as PreviewCondition)
              }
              aria-label="Choose a deterministic preview condition"
            >
              <option value="ready">Ready</option>
              <option value="offline">Offline</option>
              <option value="retry">Retry</option>
              <option value="partial">Partial</option>
              <option value="conflict">Conflict</option>
              <option value="permission">Permission</option>
              <option value="recovery">Recovery</option>
            </select>
          </details>
        )}
        <div className="preview-identity">
          <span className="status-dot" />
          <div>
            <strong>
              {isPreview
                ? "Developer preview"
                : coordinatedDataHome
                  ? "Coordinated workspace"
                  : "Local workspace"}
            </strong>
            <span>
              {coordinatedDataHome
                ? "Hub + encrypted working copy"
                : build.persistence === "encrypted-local"
                  ? "Encrypted local storage"
                  : "Session memory"}{" "}
              · {build.version}
            </span>
          </div>
          {/* Wejście w tryb Ustawień stoi PRZY tożsamości, bo to jest miejsce,
              w którym człowiek szuka „moich rzeczy" — a nie kolejna pozycja
              w rzędzie celów pracy. */}
          <button
            type="button"
            className="settings-entry"
            data-settings-entry="true"
            aria-label="Open settings"
            title="Settings (⌘,)"
            onClick={openSettings}
          >
            <Icon name="settings" />
          </button>
        </div>
      </aside>

      {/* `data-surface` na planie roboczym: stabilny zaczep, po którym testy
          i smoke'i spakowanej apki rozpoznają aktywny cel, zamiast dopasowywać
          nazwę klasy albo widoczny napis. Klasa `work-column` przeniesie się
          przy rozbiciu powłoki, a napis zmieni się przy flipie na angielski —
          ten atrybut nie zmienia się przy żadnym z nich. */}
      <main
        className="work-column"
        data-surface={surface}
        aria-labelledby="surface-title"
      >
        <div className="shell-tabbar" aria-label="Open contexts">
          <div className="shell-history-controls" aria-label="Context history">
            <button
              className="icon-button"
              data-shell-history="back"
              aria-label="Back"
              title="Back · Alt+←"
              disabled={!canMoveShellHistory(navigation, -1)}
              onClick={() =>
                setNavigation((current) => moveShellHistory(current, -1))
              }
            >
              <span aria-hidden="true">←</span>
            </button>
            <button
              className="icon-button"
              data-shell-history="forward"
              aria-label="Forward"
              title="Forward · Alt+→"
              disabled={!canMoveShellHistory(navigation, 1)}
              onClick={() =>
                setNavigation((current) => moveShellHistory(current, 1))
              }
            >
              <span aria-hidden="true">→</span>
            </button>
          </div>
          <div
            ref={tabRef}
            className="shell-tabs"
            role="tablist"
            aria-label="Contexts"
          >
            {navigation.tabs.map((tab, index) => {
              const active = tab.key === navigation.activeKey;
              return (
                <div
                  className={`shell-tab ${active ? "active" : ""}`}
                  role="presentation"
                  key={tab.key}
                >
                  <button
                    type="button"
                    role="tab"
                    id={`shell-tab-${index}`}
                    aria-selected={active}
                    aria-controls="main-content"
                    tabIndex={active ? 0 : -1}
                    data-shell-tab={tab.key}
                    onKeyDown={(event) => tabKeyDown(event, tab.key)}
                    onClick={() =>
                      setNavigation((current) =>
                        activateShellContext(current, tab.key),
                      )
                    }
                  >
                    <span className="shell-tab-kind" aria-hidden="true" />
                    <span>{tab.label}</span>
                  </button>
                  {navigation.tabs.length > 1 && (
                    <button
                      type="button"
                      className="shell-tab-close"
                      aria-label={`Close context ${tab.label}`}
                      title={`Close · ${modifierLabel}W`}
                      onClick={() =>
                        setNavigation((current) =>
                          closeShellContext(current, tab.key),
                        )
                      }
                    >
                      <Icon name="close" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="shell-detach"
            aria-label={
              detachedWindow
                ? "Close the separate window"
                : `Open ${activeContext.label} in a separate window`
            }
            disabled={
              !detachedWindow && client?.openDetachedSurface === undefined
            }
            onClick={() => {
              if (detachedWindow) window.close();
              else
                void client?.openDetachedSurface?.(surface).catch(() =>
                  setNotice({
                    kind: "unavailable",
                    message:
                      "Could not open a separate window. This context stays here.",
                  }),
                );
            }}
          >
            <span className="shell-detach-long">
              {detachedWindow ? "Attach back" : "Separate window"}
            </span>
            <span className="shell-detach-short" aria-hidden="true">
              {detachedWindow ? "Attach" : "Window"}
            </span>
          </button>
        </div>
        <div
          className="work-surface wave2-work"
          id="main-content"
          role="tabpanel"
          tabIndex={-1}
          aria-labelledby={`shell-tab-${Math.max(
            0,
            navigation.tabs.findIndex(
              (tab) => tab.key === navigation.activeKey,
            ),
          )}`}
        >
          {notice && (
            <div
              className={`notice notice-${notice.kind}`}
              role={notice.kind === "error" ? "alert" : "status"}
            >
              <span>{notice.message}</span>
              {notice.kind !== "retry" && (
                <button
                  className="text-button"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(`${notice.kind}: ${notice.message}`)
                      .catch(() => undefined)
                  }
                >
                  Copy details
                </button>
              )}
              <button
                className="icon-button"
                aria-label="Close message"
                onClick={() => setNotice(undefined)}
              >
                <Icon name="close" />
              </button>
            </div>
          )}
          {isPreview && previewCondition !== "ready" && (
            <div
              className={`condition-banner tone-${conditionCopy[previewCondition].tone}`}
              role="status"
            >
              <span className="condition-symbol" aria-hidden="true">
                i
              </span>
              <div>
                <strong>{conditionCopy[previewCondition].title}</strong>
                <span>{conditionCopy[previewCondition].detail}</span>
              </div>
              <button
                className="secondary-button compact"
                onClick={() => setPreviewCondition("ready")}
              >
                {conditionCopy[previewCondition].action}
              </button>
            </div>
          )}
          {surfacePanels[surface]?.()}
        </div>

        <div className="capture-dock-layer">
          <button className="capture-dock" onClick={openCapture}>
            <span className="capture-dock-content">
              <Icon name="capture" />
              <span className="capture-dock-label">
                Capture a thought, a link or a task…
              </span>
            </span>
            <kbd>{modifierLabel}⇧K</kbd>
          </button>
        </div>
      </main>

      {narrowShell && inspectorDetailOpen && (
        <div
          className="inspector-scrim"
          aria-hidden="true"
          onClick={dismissInspector}
        />
      )}
      <aside
        className={`inspector${surface === "meetings" ? " inspector--meeting" : ""}${inspectorDetailOpen ? " open" : ""}`}
        aria-label="Context preview"
        aria-hidden={!inspectorDetailOpen}
      >
        <div
          className="inspector-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the preview panel"
          aria-valuemin={280}
          aria-valuemax={640}
          aria-valuenow={inspectorWidth}
          title="Double-click restores the default width"
          tabIndex={0}
          onPointerDown={beginInspectorResize}
          onPointerMove={moveInspectorResize}
          onPointerUp={endInspectorResize}
          onPointerCancel={endInspectorResize}
          onDoubleClick={() => setInspectorWidth(320)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setInspectorWidth((width) => Math.min(640, width + 16));
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              setInspectorWidth((width) => Math.max(280, width - 16));
            }
          }}
        />
        <header
          className="inspector-header"
          tabIndex={-1}
          ref={inspectorPanel.focusTargetRef}
        >
          <div>
            <span>Context preview</span>
            <small>
              {selectedTask
                ? "Task"
                : selectedProject
                  ? "Project"
                  : selectedWorkContextRecord
                    ? selectedWorkContextRecord.kind === "area"
                      ? "Area"
                      : "Initiative"
                    : selectedStrategicRecord
                      ? (recordKindLabels[selectedStrategicRecord.kind] ??
                        "Strategic record")
                      : selectedCapture
                        ? "Capture"
                        : selectedAttention
                          ? "Signal"
                          : surface === "meetings"
                            ? "Jamie result"
                            : surface === "library"
                              ? documentInspectorKind === "source"
                                ? "Source"
                                : "Document"
                              : "Workspace"}
            </small>
          </div>
          <button
            className="icon-button"
            aria-label="Close the context preview"
            onClick={dismissInspector}
          >
            <Icon name="close" />
          </button>
        </header>
        {surface === "meetings" ? (
          <div
            className="surface-inspector-host"
            ref={setMeetingInspectorHost}
          />
        ) : surface === "library" ? (
          <div
            className="surface-inspector-host"
            ref={setDocumentInspectorHost}
          />
        ) : selectedAttention ? (
          <AttentionDetail
            item={selectedAttention}
            busy={attentionBusy}
            onOpen={openAttentionDestination}
            onRead={readAttention}
            onDismiss={dismissAttention}
            onRouteCapture={routeAttentionCapture}
            onRetryCapture={retryAttentionCapture}
            onKeepCapture={keepAttentionCapture}
            onReplaceCapturePayload={replaceAttentionPayload}
          />
        ) : selectedCapture ? (
          <CaptureHistoryDetail
            capture={selectedCapture}
            timezone={state.snapshot.bootstrap.workspace.timezone}
            {...(selectedCaptureRouteActivity?.targetCommandId
              ? {
                  undoCommandId: selectedCaptureRouteActivity.targetCommandId,
                }
              : {})}
            busy={historyBusyCaptureId === selectedCapture.id}
            onUndo={(id) => void openUndo(id)}
            onDeleteVoiceAudio={(captureId, version) => {
              if (!client) return;
              setHistoryBusyCaptureId(captureId);
              void requestVoiceAudioDeletion(
                client,
                state.snapshot,
                captureId,
                version,
              ).then(async (result) => {
                setHistoryBusyCaptureId(undefined);
                if (result.kind === "success")
                  await refreshAfter("The kept audio was deleted.");
                else showFailure(result);
              });
            }}
          />
        ) : selectedTask ? (
          <div className="inspector-body">
            <span className="record-status">
              <i />
              {selectedTask.completionState === "completed"
                ? "Completed"
                : selectedTask.status.label}
            </span>
            <h2>{selectedTask.title}</h2>
            <p className="record-summary">
              {sourceCapture
                ? "Created from a kept Capture."
                : "In the active workspace."}
            </p>
            <section className="inspector-section task-context-block">
              <p className="section-label">Working context</p>
              {taskEditOpen ? (
                <form
                  className="task-context-editor"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      taskEditWantsFocusRef.current = true;
                      setTaskEditOpen(false);
                    }
                  }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!client || taskEditBusy) return;
                    const timeZone =
                      state.snapshot.bootstrap.workspace.timezone;
                    const title = taskDraft.title.trim();
                    const description = taskDraft.description.trim();
                    const nextAction = taskDraft.nextAction.trim();
                    if (title.length === 0) return;
                    const currentStartDate =
                      selectedTask.startAt === undefined
                        ? ""
                        : dateKeyInZone(selectedTask.startAt, timeZone);
                    const currentDueDate =
                      selectedTask.dueAt === undefined
                        ? ""
                        : dateKeyInZone(selectedTask.dueAt, timeZone);
                    const startAt =
                      taskDraft.startDate === ""
                        ? null
                        : instantForZonedDate(
                            taskDraft.startDate,
                            timeZone,
                            "start",
                          );
                    const dueAt =
                      taskDraft.dueDate === ""
                        ? null
                        : instantForZonedDate(
                            taskDraft.dueDate,
                            timeZone,
                            "end",
                          );
                    if (startAt === undefined || dueAt === undefined) {
                      showFailure({
                        kind: "error",
                        message: "That date has an invalid format.",
                      });
                      return;
                    }
                    if (
                      taskDraft.startDate !== "" &&
                      taskDraft.dueDate !== "" &&
                      taskDraft.startDate > taskDraft.dueDate
                    ) {
                      showFailure({
                        kind: "error",
                        message:
                          "Start cannot fall after the deadline. Fix the dates and save again.",
                      });
                      return;
                    }
                    const currentPriority = selectedTask.priority ?? "";
                    const draft = {
                      ...(title === selectedTask.title ? {} : { title }),
                      ...(description === (selectedTask.description ?? "")
                        ? {}
                        : {
                            description:
                              description.length === 0 ? null : description,
                          }),
                      ...(nextAction === (selectedTask.nextAction ?? "")
                        ? {}
                        : {
                            nextAction:
                              nextAction.length === 0 ? null : nextAction,
                          }),
                      ...(taskDraft.startDate === currentStartDate
                        ? {}
                        : { startAt }),
                      ...(taskDraft.dueDate === currentDueDate
                        ? {}
                        : { dueAt }),
                      ...(taskDraft.priority === currentPriority
                        ? {}
                        : {
                            priority:
                              taskDraft.priority === ""
                                ? null
                                : (taskDraft.priority as
                                    "urgent" | "high" | "normal" | "low"),
                          }),
                    };
                    if (Object.keys(draft).length === 0) {
                      taskEditWantsFocusRef.current = true;
                      setTaskEditOpen(false);
                      return;
                    }
                    setTaskEditBusy(true);
                    void updateTaskDetails(
                      client,
                      state.snapshot,
                      selectedTask.id,
                      selectedTask.version,
                      draft,
                    ).then(async (result) => {
                      setTaskEditBusy(false);
                      if (result.kind === "success") {
                        taskEditWantsFocusRef.current = true;
                        setTaskEditOpen(false);
                        await refreshAfter("Task context saved.");
                      } else showFailure(result);
                    });
                  }}
                >
                  <label>
                    <span>Title</span>
                    <input
                      value={taskDraft.title}
                      maxLength={500}
                      required
                      autoFocus
                      disabled={taskEditBusy}
                      onChange={(event) =>
                        setTaskDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>Context</span>
                    <textarea
                      value={taskDraft.description}
                      rows={6}
                      maxLength={16000}
                      disabled={taskEditBusy}
                      placeholder="What do you need to know to pick this up later?"
                      onChange={(event) =>
                        setTaskDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>Next step</span>
                    <input
                      value={taskDraft.nextAction}
                      maxLength={500}
                      disabled={taskEditBusy}
                      placeholder="One sentence: where to start."
                      onChange={(event) =>
                        setTaskDraft((current) => ({
                          ...current,
                          nextAction: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="task-context-dates">
                    <label>
                      <span>Start</span>
                      <input
                        type="date"
                        value={taskDraft.startDate}
                        disabled={taskEditBusy}
                        onChange={(event) =>
                          setTaskDraft((current) => ({
                            ...current,
                            startDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>Deadline</span>
                      <input
                        type="date"
                        value={taskDraft.dueDate}
                        disabled={taskEditBusy}
                        onChange={(event) =>
                          setTaskDraft((current) => ({
                            ...current,
                            dueDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label>
                    <span>Priority</span>
                    <select
                      value={taskDraft.priority}
                      disabled={taskEditBusy}
                      onChange={(event) =>
                        setTaskDraft((current) => ({
                          ...current,
                          priority: event.target.value,
                        }))
                      }
                    >
                      <option value="">Default (normal)</option>
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="normal">Normal</option>
                      <option value="low">Low</option>
                    </select>
                  </label>
                  <div className="task-context-actions">
                    <button
                      type="submit"
                      className="secondary-button"
                      disabled={taskEditBusy || !client}
                    >
                      {taskEditBusy ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={taskEditBusy}
                      onClick={() => {
                        taskEditWantsFocusRef.current = true;
                        setTaskEditOpen(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {selectedTask.description ? (
                    <p className="task-context-text">
                      {selectedTask.description}
                    </p>
                  ) : (
                    <p>
                      No context saved yet. Add notes so you can pick this up
                      without reconstructing it from memory.
                    </p>
                  )}
                  {selectedTask.nextAction && (
                    <p className="task-next-action">
                      <span>Next step:</span> {selectedTask.nextAction}
                    </p>
                  )}
                  {(selectedTask.startAt !== undefined ||
                    selectedTask.dueAt !== undefined ||
                    selectedTask.priority !== undefined) && (
                    <p className="task-timing-line">
                      {selectedTask.startAt !== undefined && (
                        <span>
                          Start:{" "}
                          {formatDate(
                            selectedTask.startAt,
                            state.snapshot.bootstrap.workspace.timezone,
                          )}
                        </span>
                      )}
                      {selectedTask.dueAt !== undefined && (
                        <span
                          className={
                            selectedTask.completionState === "open" &&
                            Date.parse(selectedTask.dueAt) < Date.now()
                              ? "task-overdue"
                              : undefined
                          }
                        >
                          Deadline:{" "}
                          {formatDate(
                            selectedTask.dueAt,
                            state.snapshot.bootstrap.workspace.timezone,
                          )}
                          {selectedTask.completionState === "open" &&
                          Date.parse(selectedTask.dueAt) < Date.now()
                            ? " · overdue"
                            : ""}
                        </span>
                      )}
                      {selectedTask.priority !== undefined &&
                        selectedTask.priority !== "normal" && (
                          <span>
                            Priority:{" "}
                            {taskPriorityLabels[selectedTask.priority]}
                          </span>
                        )}
                    </p>
                  )}
                  <button
                    type="button"
                    className="secondary-button"
                    ref={taskEditButtonRef}
                    onClick={() => {
                      const timeZone =
                        state.snapshot.bootstrap.workspace.timezone;
                      setTaskDraft({
                        title: selectedTask.title,
                        description: selectedTask.description ?? "",
                        nextAction: selectedTask.nextAction ?? "",
                        startDate:
                          selectedTask.startAt === undefined
                            ? ""
                            : dateKeyInZone(selectedTask.startAt, timeZone),
                        dueDate:
                          selectedTask.dueAt === undefined
                            ? ""
                            : dateKeyInZone(selectedTask.dueAt, timeZone),
                        priority: selectedTask.priority ?? "",
                      });
                      setTaskEditOpen(true);
                    }}
                  >
                    Edit context
                  </button>
                </>
              )}
            </section>
            {client && (
              <TaskReservationSection
                client={client}
                snapshot={state.snapshot}
                taskId={selectedTask.id}
                taskVersion={selectedTask.version}
                taskTitle={selectedTask.title}
                block={selectedTask.calendarBlock}
                onRecorded={refreshAfter}
                onFailure={showFailure}
              />
            )}
            <section className="inspector-section subtasks-block">
              <p className="section-label">Subtasks</p>
              {selectedTask.parentTaskId !== undefined ? (
                <p>
                  Part of:{" "}
                  <button
                    type="button"
                    className="inspector-link"
                    onClick={() => {
                      const parentId = selectedTask.parentTaskId;
                      if (parentId !== undefined)
                        selectTaskInInspector(parentId);
                    }}
                  >
                    {tasks.find((item) => item.id === selectedTask.parentTaskId)
                      ?.title ?? "Parent task"}
                  </button>
                </p>
              ) : (
                (() => {
                  const children = tasks.filter(
                    (item) => item.parentTaskId === selectedTask.id,
                  );
                  const doneCount = children.filter(
                    (child) => child.completionState === "completed",
                  ).length;
                  return (
                    <>
                      {children.length === 0 ? (
                        <p>
                          Split the outcome only when part of the work has its
                          own state, deadline or assignee.
                        </p>
                      ) : (
                        <>
                          <p>
                            {doneCount} of {children.length} completed
                            {doneCount === children.length
                              ? " · closing the outcome stays your call"
                              : ""}
                          </p>
                          <ul className="inspector-links subtask-list">
                            {children.map((child) => (
                              <li key={child.id}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    selectTaskInInspector(child.id)
                                  }
                                >
                                  <i
                                    aria-hidden="true"
                                    className={
                                      child.completionState === "completed"
                                        ? "subtask-done"
                                        : "subtask-open"
                                    }
                                  />
                                  {child.title}
                                  {child.completionState === "completed"
                                    ? " · completed"
                                    : ""}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      <form
                        className="subtask-create"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (!client || subtaskBusy) return;
                          const title = subtaskDraft.trim();
                          if (title.length === 0) return;
                          setSubtaskBusy(true);
                          void createTask(client, state.snapshot, {
                            title,
                            parentTaskId: selectedTask.id,
                          }).then(async (result) => {
                            setSubtaskBusy(false);
                            if (result.kind === "success") {
                              setSubtaskDraft("");
                              await refreshAfter("Subtask created.");
                            } else showFailure(result);
                          });
                        }}
                      >
                        <label>
                          <span className="sr-only">New subtask title</span>
                          <input
                            value={subtaskDraft}
                            maxLength={500}
                            disabled={subtaskBusy}
                            placeholder="Add a subtask"
                            onChange={(event) =>
                              setSubtaskDraft(event.target.value)
                            }
                          />
                        </label>
                        <button
                          type="submit"
                          className="secondary-button"
                          disabled={subtaskBusy || subtaskDraft.trim() === ""}
                        >
                          Add
                        </button>
                      </form>
                    </>
                  );
                })()
              )}
            </section>
            {(state.snapshot.bootstrap.fieldDefinitions ?? []).some(
              (definition) =>
                definition.targetKind === "task" &&
                (definition.state !== "retired" ||
                  selectedTask.fields?.[definition.id] !== undefined),
            ) && (
              <section className="inspector-section task-fields-block">
                <p className="section-label">Fields</p>
                {(state.snapshot.bootstrap.fieldDefinitions ?? [])
                  .filter(
                    (definition) =>
                      definition.targetKind === "task" &&
                      (definition.state !== "retired" ||
                        selectedTask.fields?.[definition.id] !== undefined),
                  )
                  .map((definition) => {
                    const current = selectedTask.fields?.[definition.id];
                    const retired = definition.state === "retired";
                    const draft = fieldDrafts[definition.id];
                    const commit = (value: FieldValue | null) => {
                      if (!client || fieldSaveBusy) return;
                      setFieldSaveBusy(true);
                      void setRecordFieldValue(client, state.snapshot, {
                        targetKind: "task",
                        recordId: selectedTask.id,
                        recordVersion: selectedTask.version,
                        fieldId: definition.id,
                        value,
                      }).then(async (result) => {
                        setFieldSaveBusy(false);
                        if (result.kind === "success") {
                          setFieldDrafts((currentDrafts) => {
                            const next = { ...currentDrafts };
                            delete next[definition.id];
                            return next;
                          });
                          await refreshAfter("Field value saved.");
                        } else showFailure(result);
                      });
                    };
                    return (
                      <div className="task-field-row" key={definition.id}>
                        <span className="task-field-label">
                          {definition.label}
                          {retired ? " (retired)" : ""}
                        </span>
                        {retired ||
                        definition.type.kind === "formula" ||
                        definition.type.kind === "rollup" ? (
                          <span className="task-field-value">
                            {current?.kind === "date"
                              ? formatDate(
                                  current.value,
                                  state.snapshot.bootstrap.workspace.timezone,
                                )
                              : String(current?.value ?? "—")}
                            {!retired &&
                            (definition.type.kind === "formula" ||
                              definition.type.kind === "rollup")
                              ? " · calculated"
                              : ""}
                          </span>
                        ) : definition.type.kind === "choice" ? (
                          <select
                            aria-label={definition.label}
                            disabled={fieldSaveBusy}
                            value={
                              current?.kind === "choice" ? current.value : ""
                            }
                            onChange={(event) =>
                              commit(
                                event.target.value === ""
                                  ? null
                                  : {
                                      kind: "choice",
                                      value: event.target.value,
                                    },
                              )
                            }
                          >
                            <option value="">—</option>
                            {definition.type.options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : definition.type.kind === "date" ? (
                          <input
                            type="date"
                            aria-label={definition.label}
                            disabled={fieldSaveBusy}
                            value={
                              current?.kind === "date"
                                ? dateKeyInZone(
                                    current.value,
                                    state.snapshot.bootstrap.workspace.timezone,
                                  )
                                : ""
                            }
                            onChange={(event) => {
                              const date = event.target.value;
                              if (date === "") {
                                if (current !== undefined) commit(null);
                                return;
                              }
                              const instant = instantForZonedDate(
                                date,
                                state.snapshot.bootstrap.workspace.timezone,
                                "end",
                              );
                              if (instant !== undefined)
                                commit({ kind: "date", value: instant });
                            }}
                          />
                        ) : (
                          <form
                            className="task-field-edit"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const raw = (
                                draft ?? String(current?.value ?? "")
                              ).trim();
                              if (raw === "") {
                                if (current !== undefined) commit(null);
                                return;
                              }
                              if (definition.type.kind === "number") {
                                const parsed = Number(raw);
                                if (!Number.isFinite(parsed)) {
                                  showFailure({
                                    kind: "error",
                                    message: "That number is not valid.",
                                  });
                                  return;
                                }
                                commit({ kind: "number", value: parsed });
                              } else {
                                commit({ kind: "text", value: raw });
                              }
                            }}
                          >
                            <input
                              aria-label={definition.label}
                              disabled={fieldSaveBusy}
                              inputMode={
                                definition.type.kind === "number"
                                  ? "decimal"
                                  : undefined
                              }
                              value={draft ?? String(current?.value ?? "")}
                              onChange={(event) =>
                                setFieldDrafts((currentDrafts) => ({
                                  ...currentDrafts,
                                  [definition.id]: event.target.value,
                                }))
                              }
                            />
                            {draft !== undefined &&
                              draft !== String(current?.value ?? "") && (
                                <button
                                  type="submit"
                                  className="secondary-button"
                                  disabled={fieldSaveBusy}
                                >
                                  Save
                                </button>
                              )}
                          </form>
                        )}
                      </div>
                    );
                  })}
              </section>
            )}
            <section className="inspector-section assignment-block">
              <p className="section-label">Assignee</p>
              <p>
                {selectedTask.assignment?.displayName ?? "Unassigned"}
                {selectedTask.assignment?.availability === "former_member"
                  ? " · access revoked"
                  : ""}
              </p>
            </section>
            <section className="inspector-section provenance-block">
              <p className="section-label">Capture origin</p>
              {sourceCapture ? (
                <>
                  <blockquote>{sourceCapture.originalText}</blockquote>
                  <p>Quick Capture · original kept</p>
                </>
              ) : (
                <p>No linked Capture source.</p>
              )}
            </section>
            <Suspense fallback={null}>
              <TaskAttachmentsSection
                client={client}
                snapshot={state.snapshot}
                task={selectedTask}
                canEdit={Boolean(canResolveComments)}
                busy={attachmentBusy}
                onBusyChange={setAttachmentBusy}
                onSnapshot={(next) =>
                  setState({ kind: "ready", snapshot: next })
                }
                onChanged={refreshAfter}
                onFailure={showFailure}
                onRestore={restoreManagedAttachment}
              />
            </Suspense>
            <section className="inspector-section audit-block">
              <p className="section-label">Audit trail</p>
              {receipt ? (
                <dl>
                  <div>
                    <dt>Command</dt>
                    <dd>{receipt.commandName}</dd>
                  </div>
                  <div>
                    <dt>Receipt</dt>
                    <dd className="mono">{receipt.id.slice(0, 18)}…</dd>
                  </div>
                </dl>
              ) : (
                <p>The full receipt stays in the local data core.</p>
              )}
            </section>
            {client && (
              <TaskRemovalSection
                client={client}
                snapshot={state.snapshot}
                taskId={selectedTask.id}
                taskVersion={selectedTask.version}
                activeChildCount={
                  tasks.filter((item) => item.parentTaskId === selectedTask.id)
                    .length
                }
                onRemoved={async (message) => {
                  await refreshAfter(message);
                  setSelectedTaskId(undefined);
                }}
                onFailure={showFailure}
              />
            )}
            <CommentsPanel
              key={`task-${selectedTask.id}`}
              comments={comments}
              candidates={state.snapshot.mentionCandidates}
              currentPrincipalId={currentPrincipalId}
              canComment={Boolean(canComment)}
              canResolve={Boolean(canResolveComments)}
              busy={commentBusy}
              onAttach={stageCommentAttachment}
              onInspectAttachment={inspectManagedAttachment}
              onRestoreAttachment={restoreManagedAttachment}
              onAdd={(body, mentions, parent, attachmentSourceIds) => {
                if (!client) return Promise.resolve(false);
                setCommentBusy(true);
                return addComment(
                  client,
                  state.snapshot,
                  { kind: "task", taskId: selectedTask.id },
                  selectedTask.version,
                  body,
                  mentions,
                  parent,
                  attachmentSourceIds,
                ).then(async (result) => {
                  setCommentBusy(false);
                  if (result.kind === "success") {
                    const data = await loadComments(client, state.snapshot, {
                      kind: "task",
                      taskId: selectedTask.id,
                    });
                    setComments({ kind: "ready", data });
                    pushToast({ message: "Comment saved." });
                    return true;
                  }
                  showFailure(result);
                  return false;
                });
              }}
              onEdit={(comment, body, attachmentSourceIds) => {
                if (!client) return Promise.resolve(false);
                setCommentBusy(true);
                return editComment(
                  client,
                  state.snapshot,
                  comment.id,
                  comment.version,
                  body,
                  comment.mentionPrincipalIds,
                  attachmentSourceIds,
                ).then(async (result) => {
                  setCommentBusy(false);
                  if (result.kind === "success") {
                    const data = await loadComments(client, state.snapshot, {
                      kind: "task",
                      taskId: selectedTask.id,
                    });
                    setComments({ kind: "ready", data });
                    return true;
                  }
                  showFailure(result);
                  return false;
                });
              }}
              onResolve={(comment, resolved) => {
                if (!client) return;
                setCommentBusy(true);
                void setCommentResolved(
                  client,
                  state.snapshot,
                  comment,
                  resolved,
                ).then(async (result) => {
                  setCommentBusy(false);
                  if (result.kind === "success") {
                    const data = await loadComments(client, state.snapshot, {
                      kind: "task",
                      taskId: selectedTask.id,
                    });
                    setComments({ kind: "ready", data });
                  } else showFailure(result);
                });
              }}
            />
          </div>
        ) : selectedProject ? (
          <div className="inspector-body">
            <span className="record-status">
              <i />
              {selectedProject.lifecycle === "active"
                ? "Active"
                : selectedProject.lifecycle}
            </span>
            <h2>{selectedProject.title}</h2>
            <p className="record-summary">
              In the active workspace and the current Space scope.
            </p>
            <section className="inspector-section provenance-block">
              <p className="section-label">Intended outcome</p>
              {/* Inspector jest podglądem, więc luka prowadzi na powierzchnię
                  Projektu, gdzie wynik da się napisać. */}
              {selectedProject.needsReview ? (
                <NarrativeGap
                  kind="project"
                  onWrite={() =>
                    openContext(
                      projectContext(selectedProject.id, selectedProject.title),
                    )
                  }
                />
              ) : (
                <blockquote>{selectedProject.intendedOutcome}</blockquote>
              )}
              <p>The outcome stays part of the versioned project record.</p>
            </section>
            <section className="inspector-section">
              <p className="section-label">Work context</p>
              <dl className="record-fields">
                <div>
                  <dt>Open</dt>
                  <dd>
                    {countLabel(selectedProject.relatedOpenTaskCount, "task")}
                  </dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>
                    {projectOverview?.project.version ??
                      selectedProject.version}
                  </dd>
                </div>
              </dl>
            </section>
            <CommentsPanel
              key={`project-${selectedProject.id}`}
              comments={comments}
              candidates={state.snapshot.mentionCandidates}
              currentPrincipalId={currentPrincipalId}
              canComment={Boolean(canComment)}
              canResolve={Boolean(canResolveComments)}
              busy={commentBusy}
              onAttach={stageCommentAttachment}
              onInspectAttachment={inspectManagedAttachment}
              onRestoreAttachment={restoreManagedAttachment}
              onAdd={(body, mentions, parent, attachmentSourceIds) => {
                if (!client) return Promise.resolve(false);
                setCommentBusy(true);
                return addComment(
                  client,
                  state.snapshot,
                  { kind: "project", projectId: selectedProject.id },
                  projectOverview?.project.version ?? selectedProject.version,
                  body,
                  mentions,
                  parent,
                  attachmentSourceIds,
                ).then(async (result) => {
                  setCommentBusy(false);
                  if (result.kind === "success") {
                    const data = await loadComments(client, state.snapshot, {
                      kind: "project",
                      projectId: selectedProject.id,
                    });
                    setComments({ kind: "ready", data });
                    pushToast({ message: "Comment saved." });
                    return true;
                  }
                  showFailure(result);
                  return false;
                });
              }}
              onEdit={(comment, body, attachmentSourceIds) => {
                if (!client) return Promise.resolve(false);
                setCommentBusy(true);
                return editComment(
                  client,
                  state.snapshot,
                  comment.id,
                  comment.version,
                  body,
                  comment.mentionPrincipalIds,
                  attachmentSourceIds,
                ).then(async (result) => {
                  setCommentBusy(false);
                  if (result.kind === "success") {
                    const data = await loadComments(client, state.snapshot, {
                      kind: "project",
                      projectId: selectedProject.id,
                    });
                    setComments({ kind: "ready", data });
                    return true;
                  }
                  showFailure(result);
                  return false;
                });
              }}
              onResolve={(comment, resolved) => {
                if (!client) return;
                setCommentBusy(true);
                void setCommentResolved(
                  client,
                  state.snapshot,
                  comment,
                  resolved,
                ).then(async (result) => {
                  setCommentBusy(false);
                  if (result.kind === "success") {
                    const data = await loadComments(client, state.snapshot, {
                      kind: "project",
                      projectId: selectedProject.id,
                    });
                    setComments({ kind: "ready", data });
                  } else showFailure(result);
                });
              }}
            />
          </div>
        ) : selectedWorkContextRecord ? (
          <div className="inspector-body">
            <span className="record-status">
              <i />
              {selectedWorkContextRecord.stateLabel}
            </span>
            <h2>{selectedWorkContextRecord.title}</h2>
            <p className="record-summary">
              {selectedWorkContextRecord.kind === "area"
                ? "A standing responsibility in the work model."
                : "An initiative with an outcome to close."}
            </p>
            <section className="inspector-section provenance-block">
              <p className="section-label">
                {selectedWorkContextRecord.kind === "area"
                  ? "Standing responsibility"
                  : "Intended outcome"}
              </p>
              {!selectedWorkContextRecord.needsReview ? (
                <blockquote>{selectedWorkContextRecord.detail}</blockquote>
              ) : workContextNarrative === undefined ? (
                <NarrativeGap
                  kind={selectedWorkContextRecord.kind}
                  onWrite={() => setWorkContextNarrative("")}
                />
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    writeWorkContextNarrative();
                  }}
                >
                  <label className="sr-only" htmlFor="work-context-narrative">
                    {recordNarrativeGaps[selectedWorkContextRecord.kind].field}
                  </label>
                  <textarea
                    id="work-context-narrative"
                    value={workContextNarrative}
                    autoFocus
                    onChange={(event) =>
                      setWorkContextNarrative(event.target.value)
                    }
                  />
                  <div className="capture-footer">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setWorkContextNarrative(undefined)}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary-button"
                      disabled={
                        projectBusy || workContextNarrative.trim() === ""
                      }
                      type="submit"
                    >
                      Save
                    </button>
                  </div>
                </form>
              )}
              <p>
                {selectedWorkContextRecord.kind === "area"
                  ? "An area has no end date; projects close inside it."
                  : "An initiative closes when this outcome is reached."}
              </p>
            </section>
          </div>
        ) : selectedStrategicRecord ? (
          <StrategicRecordInspector
            record={selectedStrategicRecord}
            records={
              state.snapshot.relationships.kind === "ready"
                ? state.snapshot.relationships.data.records
                : []
            }
            projects={
              state.snapshot.projects.kind === "ready"
                ? state.snapshot.projects.data.items
                : []
            }
            client={client}
            snapshot={state.snapshot}
            onSelectRecord={selectStrategicInInspector}
            onOpenProject={(id, title) =>
              openContext(projectContext(id, title))
            }
            onRemoved={async (message) => {
              await refreshAfter(message);
              setSelectedStrategicId(undefined);
            }}
            onRemoveFailure={showFailure}
          />
        ) : (
          <div className="inspector-empty workspace-context">
            <BrandMark />
            <p className="eyebrow">Active context</p>
            <h2>{bootstrap.workspace.name}</h2>
            <p>
              Root Space ·{" "}
              {coordinatedDataHome
                ? "coordinated Data Home"
                : "local data source"}
            </p>
            <dl>
              <div>
                <dt>Mode</dt>
                <dd>
                  {coordinatedDataHome
                    ? "Hub + encrypted working copy"
                    : build.persistence === "encrypted-local"
                      ? "Encrypted local storage"
                      : "Developer preview"}
                </dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>Ready</dd>
              </div>
            </dl>
          </div>
        )}
        {surface !== "library" && (
          <DocumentBacklinks
            client={client}
            snapshot={state.snapshot}
            target={
              surface === "meetings" && selectedMeetingId
                ? { targetKind: "meeting", targetId: selectedMeetingId }
                : selectedTask
                  ? { targetKind: "task", targetId: selectedTask.id }
                  : selectedProject
                    ? { targetKind: "project", targetId: selectedProject.id }
                    : selectedStrategicRecord?.kind === "person" ||
                        selectedStrategicRecord?.kind === "organization"
                      ? {
                          targetKind: selectedStrategicRecord.kind,
                          targetId: selectedStrategicRecord.id,
                        }
                      : undefined
            }
            onOpenDocument={(documentId, title) =>
              openContext(documentContext(documentId, title))
            }
          />
        )}
      </aside>

      {inspectorDetailOpen && (
        <span className="context-thread" aria-hidden="true" />
      )}
      {captureOpen && (
        <CaptureDialog
          busy={capturing}
          client={client}
          defaultVoiceRetentionPolicy={
            bootstrap.workspace.voiceAudioRetentionPolicy
          }
          workspaceName={bootstrap.workspace.name}
          onClose={() => !capturing && dismissCapture()}
          onSubmit={async (original) => {
            if (!client) return "The desktop is unavailable right now.";
            setCapturing(true);
            setNotice(undefined);
            const result = await submitQuickCapture(
              client,
              state.snapshot,
              original,
            );
            setCapturing(false);
            if (result.kind !== "success") {
              showFailure(result);
              return result.message;
            }
            setState({ kind: "ready", snapshot: result.snapshot });
            const captureResult = result.result;
            if (captureResult.kind === "task") {
              const task = result.snapshot.tasks.find(
                (item) => item.id === captureResult.taskId,
              );
              openContext(
                taskContext(captureResult.taskId, task?.title ?? "New task"),
              );
              setReceipts((current) => ({
                ...current,
                [captureResult.taskId]: result.receipt,
              }));
            } else if (captureResult.kind === "review") {
              openContext(destinationContext("inbox", "Inbox"));
            } else if (captureResult.kind === "voice_note") {
              openContext(destinationContext("history", "Capture history"));
            } else {
              openContext(destinationContext("library", "Library"));
            }
            setCaptureOpen(false);
            pushToast({
              message:
                captureResult.kind === "task"
                  ? "Capture filed as a task."
                  : captureResult.kind === "knowledge_source"
                    ? "Capture filed as a knowledge source."
                    : captureResult.kind === "voice_note"
                      ? "The voice note is safe and waiting for an agent to transcribe it."
                      : "This capture needs a decision and went to the inbox.",
            });
            return undefined;
          }}
        />
      )}
      {searchOpen && client && (
        <SearchOverlay
          client={client}
          snapshot={state.snapshot}
          destinations={[
            ...favorites
              .map((id) => navItems.find((item) => item.id === id))
              .filter(
                (item): item is (typeof navItems)[number] => item !== undefined,
              ),
            ...navItems.filter((item) => !favorites.includes(item.id)),
          ]}
          onClose={() => setSearchOpen(false)}
          onOpenDestination={(nextSurface, label) =>
            openContext(destinationContext(nextSurface, label))
          }
          onNavigate={(nextSurface, recordId) => {
            if (nextSurface === "tasks") {
              const id = recordId as TaskId;
              const task = tasks.find((item) => item.id === id);
              openContext(taskContext(id, task?.title ?? "Task"));
            } else if (nextSurface === "projects") {
              const id = recordId as ProjectId;
              const project =
                state.snapshot.projects.kind === "ready"
                  ? state.snapshot.projects.data.items.find(
                      (item) => item.id === id,
                    )
                  : undefined;
              openContext(projectContext(id, project?.title ?? "Project"));
            } else if (nextSurface === "library") {
              const id = recordId as DocumentId;
              const document =
                state.snapshot.knowledge.kind === "ready"
                  ? state.snapshot.knowledge.data.documents.find(
                      (item) => item.id === id,
                    )
                  : undefined;
              if (document !== undefined) {
                openContext(documentContext(id, document.title));
              } else {
                const item = navItems.find((entry) => entry.id === nextSurface);
                openContext(
                  destinationContext(nextSurface, item?.label ?? "Library"),
                );
              }
            } else if (nextSurface === "organizations") {
              const record =
                state.snapshot.relationships.kind === "ready"
                  ? state.snapshot.relationships.data.records.find(
                      (item) => item.id === recordId,
                    )
                  : undefined;
              if (record?.kind === "organization") {
                openContext(organizationContext(record.id, record.name));
              } else {
                openContext(
                  destinationContext("organizations", "Organizations"),
                );
                selectStrategicInInspector(recordId);
              }
            } else if (nextSurface === "meetings") {
              setSelectedMeetingId(recordId);
              openContext(destinationContext("meetings", "Meetings"));
            } else {
              const item = navItems.find((entry) => entry.id === nextSurface);
              openContext(
                destinationContext(nextSurface, item?.label ?? "View"),
              );
            }
          }}
        />
      )}
      {undoPreview && (
        <UndoDialog
          preview={undoPreview}
          busy={undoBusy}
          onClose={() => !undoBusy && setUndoPreview(undefined)}
          onConfirm={() => {
            if (!client) return;
            setUndoBusy(true);
            void undoCommand(client, state.snapshot, undoPreview).then(
              async (result) => {
                setUndoBusy(false);
                if (result.kind === "success") {
                  setUndoPreview(undefined);
                  await refreshAfter(
                    "Change undone and recorded in the audit.",
                  );
                  openContext(destinationContext("activity", "Activity"));
                } else showFailure(result);
              },
            );
          }}
        />
      )}
      {onboardingOpen && client && (
        <Suspense fallback={null}>
          <OnboardingFlow
            client={client}
            snapshot={state.snapshot}
            onComplete={async () => {
              setOnboardingOpen(false);
              await reload();
            }}
            onFailure={showFailure}
          />
        </Suspense>
      )}
      {recoveryOpen && client && (
        <Suspense fallback={null}>
          <WorkspaceRecovery
            client={client}
            {...(state.snapshot.dataHome === undefined
              ? {}
              : { initialStatus: state.snapshot.dataHome })}
            workspaceName={bootstrap.workspace.name}
            recoveredPrevious={
              build.startupRecovery === "previous_workspace_restored"
            }
            onClose={() => setRecoveryOpen(false)}
            onRestored={async () => {
              await reload();
              openContext(destinationContext("today", "Today"));
              pushToast({
                message: "Workspace restored and reopened.",
              });
            }}
          />
        </Suspense>
      )}
      {agentGrantDetails && (
        <AgentGrantDetailsDialog
          details={agentGrantDetails}
          onClose={() => setAgentGrantDetails(undefined)}
        />
      )}
      {navMenu && (
        <div
          className="context-menu-layer"
          onMouseDown={() => closeNavMenu(false)}
          onContextMenu={(event) => {
            event.preventDefault();
            closeNavMenu(false);
          }}
        >
          <div
            ref={navMenuRef}
            className="context-menu"
            role="menu"
            aria-label={`Actions for ${navMenu.context.label}`}
            style={{ left: navMenu.x, top: navMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={navMenuKeyDown}
          >
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                openContext(navMenu.context);
                closeNavMenu(true);
              }}
            >
              Open
            </button>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                openContextInNewTab(navMenu.context);
                closeNavMenu(true);
              }}
            >
              Open in a new tab
            </button>
          </div>
        </div>
      )}
      {railMode && railTip && (
        <div
          className="nav-rail-tooltip"
          role="presentation"
          style={{ top: railTip.top }}
        >
          <span>{railTip.label}</span>
          {railTip.hint !== undefined && (
            <span>
              {railTip.hint.kind === "palette" && <small>via palette</small>}
              <kbd>{railTip.hint.keys}</kbd>
            </span>
          )}
        </div>
      )}
      {shortcutsOpen && (
        <ShortcutsOverlay
          surfaces={navItems}
          onClose={() => setShortcutsOpen(false)}
        />
      )}
      {activeToast && (
        <div
          className="undo-toast"
          role="status"
          onMouseEnter={() => setToastPaused(true)}
          onMouseLeave={() => setToastPaused(false)}
          onFocus={() => setToastPaused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setToastPaused(false);
          }}
        >
          <span>{activeToast.message}</span>
          {toasts.length > 1 && (
            <span
              className="undo-toast-queue"
              aria-label={`${toasts.length - 1} queued`}
            >
              +{toasts.length - 1}
            </span>
          )}
          {activeToast.restore && (
            <button
              className="ghost-button"
              onClick={() => {
                const restore = activeToast.restore;
                dismissToast(activeToast.id);
                if (restore) openContextInNewTab(restore);
              }}
            >
              Restore
            </button>
          )}
          {activeToast.undoCommandId && (
            <button
              className="ghost-button"
              onClick={() => {
                const target = activeToast.undoCommandId;
                dismissToast(activeToast.id);
                if (target) void openUndo(target);
              }}
            >
              Undo
            </button>
          )}
          <button
            className="ghost-button"
            onClick={() => dismissToast(activeToast.id)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};
