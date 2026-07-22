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
import {
  ShortcutsOverlay,
  modifierLabel,
  surfaceShortcutHint,
  type SurfaceShortcutHint,
} from "./components/ShortcutsOverlay.js";
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
  updateProjectOutcome,
  updateAttention,
  createAgentGrant,
  rotateAgentCredential,
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
  urgent: "Pilny",
  high: "Wysoki",
  normal: "Normalny",
  low: "Niski",
};

type DocumentBacklinkTarget = {
  readonly targetKind:
    "task" | "project" | "person" | "organization" | "meeting";
  readonly targetId: string;
};

const backlinkRoleLabels = {
  note: "Notatka",
  document: "Dokument",
  deliverable: "Rezultat",
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
      <p className="section-label">Wspomniane w dokumentach</p>
      {unavailable ? (
        <p className="entity-backlinks-status">
          Odwołania są teraz niedostępne.
        </p>
      ) : projection === undefined ? (
        <p className="entity-backlinks-status">Sprawdzam odwołania…</p>
      ) : projection.items.length === 0 ? (
        <p className="entity-backlinks-status">Brak odwołań.</p>
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

const lazySurfaceLoaders = {
  documents: loadDocumentsSurface,
  meetings: loadMeetingsSurface,
  activity: loadActivitySurface,
  settings: loadSettingsSurface,
  work: loadWorkSurface,
  access: loadAccessSurface,
  relationships: loadStrategicDepthSurface,
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
        <section className="surface-load-state" role="alert">
          <p className="eyebrow">{this.props.label}</p>
          <h1 id="surface-title" tabIndex={-1}>
            Nie udało się otworzyć tej części aplikacji
          </h1>
          <p>
            Dane nie zostały zmienione. Odśwież aplikację i spróbuj ponownie.
          </p>
          <button
            className="secondary-button"
            onClick={() => window.location.reload()}
          >
            Spróbuj ponownie
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}

const SurfaceLoadingState = ({ label }: { readonly label: string }) => (
  <section className="surface-load-state" aria-busy="true" aria-live="polite">
    <p className="eyebrow">{label}</p>
    <h1 id="surface-title" tabIndex={-1}>
      Otwieram tę część aplikacji…
    </h1>
    <p>Ładuję bieżącą zawartość workspace.</p>
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
            aria-label="Zamknij szczegóły dostępu"
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
              {copied === "descriptor" ? "Skopiowano" : "Kopiuj"}
            </button>
          </div>
          <div>
            <dt>{details.connectionLabel}</dt>
            <dd className="mono">{details.connectionValue}</dd>
            <button
              className="secondary-button"
              onClick={() => void copy("connection", details.connectionValue)}
            >
              {copied === "connection" ? "Skopiowano" : "Kopiuj"}
            </button>
          </div>
        </dl>
        <footer className="capture-footer">
          <span>
            Skopiuj wartości teraz — poda je host MCP przy konfiguracji.
          </span>
          <button className="primary-button" onClick={onClose}>
            Gotowe
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
const StrategicRecordInspector = ({
  record,
  records,
  projects,
  onSelectRecord,
  onOpenProject,
}: {
  readonly record: StrategicRecord;
  readonly records: readonly StrategicRecord[];
  readonly projects: readonly {
    readonly id: ProjectId;
    readonly title: string;
  }[];
  readonly onSelectRecord: (id: string) => void;
  readonly onOpenProject: (id: ProjectId, title: string) => void;
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
          ? `${recordKindLabels[record.kind] ?? "Rekord"} w relacji ${organizationName}.`
          : "Wersjonowany rekord strategiczny w aktywnym Space."}
      </p>
      {record.kind === "organization" && (
        <>
          <section className="inspector-section provenance-block">
            <p className="section-label">Następny ruch</p>
            <blockquote>
              {record.nextAction ?? "Brak następnego ruchu"}
            </blockquote>
            <p>Relacja prowadzi szanse, oferty i odnowienia.</p>
          </section>
          <section className="inspector-section">
            <p className="section-label">
              {countLabel(
                relatedOpportunities.length,
                "szansa",
                "szanse",
                "szans",
              )}
            </p>
            {relatedOpportunities.length === 0 ? (
              <p>Nie ma jeszcze szans powiązanych z tą relacją.</p>
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
          <p className="section-label">Dane kontaktowe</p>
          <dl className="record-fields">
            <div>
              <dt>Rola</dt>
              <dd>{record.role ?? "—"}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{record.email ?? "—"}</dd>
            </div>
          </dl>
        </section>
      )}
      {record.kind === "opportunity" && (
        <>
          <section className="inspector-section provenance-block">
            <p className="section-label">Potwierdzona potrzeba</p>
            <blockquote>{record.need}</blockquote>
            <p>Następny ruch: {record.nextAction}</p>
          </section>
          <section className="inspector-section">
            <p className="section-label">
              {countLabel(relatedOffers.length, "oferta", "oferty", "ofert")}
            </p>
            {relatedOffers.length === 0 ? (
              <p>Ta szansa nie ma jeszcze ofert.</p>
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
              {countLabel(
                linkedProjects.length,
                "projekt",
                "projekty",
                "projektów",
              )}
            </p>
            {linkedProjects.length === 0 ? (
              <p>Ta szansa nie prowadzi jeszcze do projektu.</p>
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
          <p className="section-label">Następny ruch</p>
          <blockquote>{record.nextAction}</blockquote>
          {parentOpportunity && (
            <p>
              Szansa:{" "}
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
          <p className="section-label">Terminy</p>
          <dl className="record-fields">
            <div>
              <dt>Zakres</dt>
              <dd>{record.scope}</dd>
            </div>
            <div>
              <dt>Wygasa</dt>
              <dd>{new Date(record.expiresAt).toLocaleDateString("pl-PL")}</dd>
            </div>
          </dl>
        </section>
      )}
      {record.kind === "relationship_fact" && (
        <section className="inspector-section provenance-block">
          <p className="section-label">Potwierdzona wartość</p>
          <blockquote>{record.value}</blockquote>
          <p>
            Zweryfikowano{" "}
            {new Date(record.verifiedAt).toLocaleDateString("pl-PL")}.
          </p>
        </section>
      )}
      {record.kind === "decision" && (
        <section className="inspector-section provenance-block">
          <p className="section-label">Uzasadnienie</p>
          <blockquote>{record.rationale}</blockquote>
          <p>Decyzja pozostaje częścią wersjonowanej historii.</p>
        </section>
      )}
      {record.kind === "recurrence" && (
        <section className="inspector-section">
          <p className="section-label">Reguła</p>
          <dl className="record-fields">
            <div>
              <dt>Zadanie</dt>
              <dd>{record.taskTitle}</dd>
            </div>
            <div>
              <dt>Rytm</dt>
              <dd>{recurrenceCadenceLabels[record.cadence]}</dd>
            </div>
          </dl>
        </section>
      )}
      {record.kind === "radar_candidate" && (
        <section className="inspector-section provenance-block">
          <p className="section-label">Znaczenie</p>
          <blockquote>{record.relevance}</blockquote>
          <p>Kandydat czeka na decyzję w przeglądzie Relacji.</p>
        </section>
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
        return "Ten plik jest pusty. Wybierz inny plik.";
      case "payload_too_large":
        return "Plik przekracza limit 25 MB. Zachowaj mniejszą wersję.";
      case "payload_unsupported":
        return "Tego pliku nie można bezpiecznie przejąć.";
      case "payload_transfer_unavailable":
        return "Pliki w workspace z Hubem będą dostępne po włączeniu bezpiecznego transferu. Tekst i linki działają nadal.";
      case "cancelled":
        return "";
      default:
        return "Nie udało się zachować pliku. Spróbuj ponownie.";
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
      setPayloadError("Zarządzane pliki są niedostępne w tym uruchomieniu.");
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
            nextFile.name ||
            `Screenshot ${new Date().toLocaleString("pl-PL")}.png`,
          mediaType: nextFile.type || "application/octet-stream",
          inputKind,
          bytes: new Uint8Array(await nextFile.arrayBuffer()),
        }),
      );
    } catch {
      setPayloadBusy(false);
      setPayloadError(
        "Nie udało się odczytać pliku. Sprawdź uprawnienia i spróbuj ponownie.",
      );
    }
  };
  const choosePayload = async () => {
    if (client?.selectCapturePayload === undefined) {
      setPayloadError("Wybór zarządzanego pliku jest niedostępny.");
      return;
    }
    setPayloadBusy(true);
    setPayloadError(undefined);
    try {
      acceptPayload(await client.selectCapturePayload());
    } catch {
      setPayloadBusy(false);
      setPayloadError("Nie udało się otworzyć pliku. Spróbuj ponownie.");
    }
  };
  const voiceFailure = (code: string): string => {
    switch (code) {
      case "unsupported":
        return "Nagrywanie krótkiej notatki głosowej nie jest wspierane w tym uruchomieniu.";
      case "permission_denied":
        return "Brak dostępu do mikrofonu. Zezwól Constellation na mikrofon w ustawieniach systemu i spróbuj ponownie.";
      case "device_unavailable":
        return "Mikrofon jest niedostępny lub używany przez inną aplikację.";
      default:
        return "Nagranie nie zostało zachowane. Spróbuj ponownie.";
    }
  };
  const startVoice = async () => {
    if (client?.stageCapturePayload === undefined) {
      setPayloadError("Szyfrowane notatki głosowe są niedostępne.");
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
        setPayloadError(
          "Nagranie przekroczyło limit 25 MB i nie zostało zapisane.",
        );
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
            displayName: `Notatka głosowa ${new Date().toLocaleString("pl-PL")}.${extension}`,
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
            "Osiągnięto limit 2 minut. Nagranie jest gotowe do zapisania.",
          );
      } catch {
        setPayloadBusy(false);
        setVoiceState("idle");
        setPayloadError(
          "Nie udało się zaszyfrować nagrania. Spróbuj ponownie.",
        );
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
            <h2 id="capture-title">Zapisz cokolwiek</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Zamknij Quick Capture"
            disabled={busy || payloadBusy}
            onClick={requestClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <form onSubmit={submit}>
          <div
            className="capture-kind"
            role="group"
            aria-label="Rodzaj Capture"
          >
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
                  ? "Tekst"
                  : kind === "url"
                    ? "Link"
                    : kind === "file"
                      ? "Plik"
                      : "Głos"}
              </button>
            ))}
          </div>
          {mode === "text" ? (
            <>
              <label className="sr-only" htmlFor="capture-text">
                Treść przechwycenia
              </label>
              <textarea
                id="capture-text"
                name="capture"
                ref={inputRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Myśl, zadanie albo coś do zrobienia…"
                maxLength={262_144}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
                    submit(event);
                }}
              />
              <small className="capture-mode-note">
                Dyktowanie systemowe działa w tym polu jak zwykły tekst —
                Constellation nie zachowuje wtedy audio.
              </small>
            </>
          ) : mode === "url" ? (
            <label className="capture-field">
              <span>Adres URL</span>
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
                      ? "Nagranie zaszyfrowane i gotowe"
                      : voiceState === "requesting"
                        ? "Czekam na zgodę systemu…"
                        : voiceState === "recording"
                          ? "Nagrywanie"
                          : voiceState === "staging"
                            ? "Szyfruję i zachowuję…"
                            : "Krótka notatka głosowa"}
                  </strong>
                  <span>
                    {managedOriginal?.kind === "voice_note"
                      ? `${Math.ceil(managedOriginal.durationMs / 1000)} s · ${Math.ceil(managedOriginal.payload.byteLength / 1024).toLocaleString("pl-PL")} KB`
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
                      Zatrzymaj
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={cancelVoice}
                    >
                      Anuluj nagranie
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
                      ? "Nagraj ponownie"
                      : "Rozpocznij nagrywanie"}
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
                  Zachowaj audio po transkrypcji. Domyślnie zostanie usunięte
                  dopiero po trwałym zapisie transkryptu przez zewnętrznego
                  agenta MCP.
                </span>
              </label>
              <small>
                Constellation nie transkrybuje i nie nagrywa spotkań. Mikrofon
                działa wyłącznie podczas widocznego nagrywania w tym oknie.
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
                    ? "Szyfruję i zachowuję…"
                    : "Upuść plik lub wklej screenshot"}
              </strong>
              <button
                className="secondary-button"
                type="button"
                disabled={payloadBusy}
                onClick={() => void choosePayload()}
              >
                {managedOriginal === undefined ? "Wybierz plik" : "Zmień plik"}
              </button>
              <small>
                Constellation zachowa zaszyfrowaną kopię w tym workspace przed
                uporządkowaniem. Lokalna ścieżka nie zostanie zapisana.
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
              <span>Wynik</span>
              <strong>Reguła aplikacji · z możliwością cofnięcia</strong>
            </div>
          </div>
          {confirmDiscard && (
            <div className="capture-discard-confirm" role="alert">
              <span>Masz niezapisaną treść. Odrzucić ją?</span>
              <div>
                <button
                  type="button"
                  className="secondary-button"
                  autoFocus
                  onClick={() => setConfirmDiscard(false)}
                >
                  Wróć do edycji
                </button>
                <button
                  type="button"
                  className="quiet-danger-button"
                  onClick={close}
                >
                  Odrzuć treść
                </button>
              </div>
            </div>
          )}
          <footer className="capture-footer">
            <span>Oryginał zostanie zachowany i powiązany z wynikiem.</span>
            <button
              className="primary-button"
              type="submit"
              disabled={busy || payloadBusy || !canSubmit}
            >
              {busy ? "Przetwarzam…" : "Zapisz i uporządkuj"}
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
}: {
  readonly client: ConstellationRendererClient | undefined;
}) => {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [navigation, setNavigation] = useState(() => {
    const parameters = new URLSearchParams(window.location.search);
    const requested = navItems.find(
      (item) => item.id === parameters.get("destination"),
    );
    const fallback = destinationContext(
      requested?.id ?? "cockpit",
      requested?.label ?? "Tydzień",
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
        : ["cockpit", "work"];
    } catch {
      return ["cockpit", "work"];
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
    message: "Wybierz Zadanie albo Projekt.",
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
  const openContextInNewTab = useCallback(
    (context: ShellContext) => {
      const outcome = openShellContextReportingEviction(navigation, context);
      setNavigation(outcome.state);
      if (outcome.evictedContext !== undefined) {
        pushToast({
          message: `Zamknięto kartę „${outcome.evictedContext.label}”, aby otworzyć nową.`,
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
    if (surface !== "documents") {
      setDocumentInspectorOpen(false);
      setDocumentInspectorKind("document");
    }
    if (surface !== "relationships") setSelectedStrategicId(undefined);
    if (surface !== "history") setSelectedCaptureId(undefined);
    if (surface !== "attention") setSelectedAttentionId(undefined);
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
            title: area.title,
            detail: area.responsibility,
            stateLabel: area.state === "active" ? "Aktywny" : "Zarchiwizowany",
          };
    }
    const initiative = snapshot.work.data.initiatives.find(
      (item) => item.id === selectedWorkContext.id,
    );
    return initiative === undefined
      ? undefined
      : {
          kind: "initiative" as const,
          title: initiative.title,
          detail: initiative.intendedOutcome,
          stateLabel: initiative.state === "active" ? "Aktywna" : "Zamknięta",
        };
  }, [selectedWorkContext, snapshot]);
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
        destinationContext("cockpit", "Tydzień"),
      ),
    );
  }, [snapshot]);

  useEffect(() => {
    if (!client) return;
    return client.onAttentionActivated((destination) => {
      if (destination.kind === "task") {
        openContext(taskContext(destination.taskId, "Zadanie"));
      } else if (destination.kind === "project") {
        openContext(projectContext(destination.projectId, "Projekt"));
      } else {
        openContext(destinationContext("documents", "Dokumenty"));
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

  useEffect(() => {
    if (!client) {
      setState({
        kind: "unavailable",
        message:
          "Bezpieczny most Electron jest niedostępny. Uruchom aplikację przez skrypt desktopowy.",
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
                : "Nie udało się otworzyć workspace.",
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
                : "Przegląd projektu jest niedostępny.",
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
        message: "Wybierz Zadanie albo Projekt.",
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
                : "Komentarze są niedostępne.",
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
    (surface === "documents" && documentInspectorOpen),
  );
  const dismissInspector = useCallback(() => {
    if (surface === "meetings") {
      setMeetingInspectorOpen(false);
      return;
    }
    if (surface === "documents") {
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
  const stageCommentAttachment = async () => {
    if (!client || !snapshot) return undefined;
    const result = await stageManagedAttachment(client, snapshot);
    if (result.kind !== "success") {
      if (result.message !== "Nie wybrano pliku.") showFailure(result);
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
        pushToast({ message: "Załącznik jest ponownie dostępny." });
        return "available";
      }
    } catch {
      // The content-safe recovery below is the same for native and Hub errors.
    }
    showFailure({
      kind: "retry",
      message: "Nie udało się jeszcze pobrać załącznika na to urządzenie.",
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
      openContext(destinationContext("documents", "Dokumenty"));
    } else {
      openContext(destinationContext("history", "Historia Capture"));
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
          await refreshAfter("Sygnał oznaczono jako przeczytany.");
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
          await refreshAfter("Sygnał usunięto z uwagi.");
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
            ? "Capture skierowano do zadań."
            : "Capture zapisano jako źródło wiedzy.",
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
          await refreshAfter(
            "Capture wrócił do bezpiecznej kolejki przetwarzania.",
          );
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
        await refreshAfter("Oryginał zachowano bez wymuszonej klasyfikacji.");
      else showFailure(result);
    });
  };
  const replaceAttentionPayload = (item: AttentionItem) => {
    if (!client?.selectCapturePayload || !snapshot) {
      pushToast({ message: "Wybór pliku jest chwilowo niedostępny." });
      return;
    }
    setAttentionBusy(true);
    void client.selectCapturePayload().then(async (selected) => {
      if (selected.outcome !== "success") {
        setAttentionBusy(false);
        if (selected.code !== "cancelled")
          pushToast({
            message:
              "Nie udało się przygotować bezpiecznego pliku zastępczego.",
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
        await refreshAfter(
          "Oryginał zastąpiono i skierowano do ponownego przetwarzania.",
        );
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
        <p>Otwieram workspace…</p>
      </main>
    );
  if (state.kind === "recovery") {
    const reason =
      state.build.recoveryReason === "secure_storage_unavailable"
        ? "Bezpieczny magazyn systemu jest niedostępny. Możesz spróbować ponownie po odblokowaniu systemu albo przywrócić zweryfikowany backup."
        : state.build.recoveryReason === "protected_key_unavailable"
          ? "Chroniony klucz workspace’u jest niedostępny lub uszkodzony. Istniejące dane nie zostały zastąpione."
          : "Lokalny workspace nie przeszedł bezpiecznego otwarcia. Constellation zatrzymał się przed zapisem.";
    return (
      <main className="center-state recovery-required-state">
        <BrandMark />
        <p className="eyebrow">Odzyskiwanie workspace</p>
        <h1>Dane wymagają bezpiecznego restore</h1>
        <p>{reason}</p>
        <div>
          <button
            className="primary-button"
            onClick={() => setRecoveryOpen(true)}
          >
            Otwórz odzyskiwanie
          </button>
          <button
            className="secondary-button"
            onClick={() => window.location.reload()}
          >
            Spróbuj otworzyć ponownie
          </button>
        </div>
        {recoveryOpen && client && (
          <Suspense fallback={null}>
            <WorkspaceRecovery
              client={client}
              workspaceName="Lokalny workspace"
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
            ? "Most desktopowy jest niedostępny"
            : "Nie udało się otworzyć workspace"}
        </h1>
        <p>{state.message}</p>
        <button
          className="secondary-button"
          onClick={() => window.location.reload()}
        >
          Spróbuj ponownie
        </button>
      </main>
    );

  const { bootstrap, build, tasks } = state.snapshot;
  const isPreview = build.channel === "developer-preview";
  const coordinatedDataHome =
    state.snapshot.dataHome?.descriptor.providerKind === "coordinated";
  const dataHomeLabel = coordinatedDataHome
    ? `${state.snapshot.dataHome?.descriptor.displayName ?? "Hub"} · skoordynowany`
    : "Local only · dane na tym urządzeniu";
  // Product-owner correction (2026-07-18): the work plane owns the available
  // width until a deliberate record selection opens the inspector. The panel
  // remains the single detail plane, but it never consumes an empty column.
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
        Przejdź do treści
      </a>
      <aside className="sidebar" aria-label="Workspace i nawigacja">
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
              ? "Otwórz ustawienia workspace"
              : coordinatedDataHome
                ? "Otwórz ustawienia skoordynowanego workspace"
                : "Otwórz ustawienia i przełączanie workspace"
          }
          onClick={() =>
            openContext(destinationContext("settings", "Ustawienia"))
          }
        >
          <span className="workspace-avatar">I</span>
          <span>
            <strong>{bootstrap.workspace.name}</strong>
            <small>
              {state.snapshot.dataHome?.availability === "available"
                ? dataHomeLabel
                : "Data Home wymaga uwagi"}
            </small>
          </span>
          {!isPreview && <span className="workspace-switcher-action">•••</span>}
        </button>
        <button
          className="search-control"
          aria-label={`Szukaj · ${modifierLabel}K`}
          onFocus={(event) =>
            showRailTip(event.currentTarget, "Szukaj", {
              keys: `${modifierLabel}K`,
              kind: "direct",
            })
          }
          onBlur={hideRailTip}
          onMouseEnter={(event) =>
            showRailTip(event.currentTarget, "Szukaj", {
              keys: `${modifierLabel}K`,
              kind: "direct",
            })
          }
          onMouseLeave={hideRailTip}
          onClick={() => setSearchOpen(true)}
        >
          <Icon name="search" />
          <span>Szukaj</span>
          <kbd>{modifierLabel}K</kbd>
        </button>
        <nav ref={navRef} aria-label="Główna nawigacja" onKeyDown={navKeyDown}>
          {favorites.length > 0 && (
            <>
              <p className="nav-label">Ulubione</p>
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
              <p className="nav-label">Ostatnie</p>
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
          {navigationGroups.map((group) => {
            const groupItems = navItems.filter((item) => item.group === group);
            const activeGroupItem = groupItems.find(
              (item) => item.id === surface,
            );
            const expanded =
              railMode || !collapsedNavigationGroups.includes(group);
            const groupId = `primary-navigation-${group.toLocaleLowerCase("pl")}`;
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
                        : `${group}, bieżący widok ${activeGroupItem.label}`
                    }
                    onClick={() => toggleNavigationGroup(group)}
                  >
                    <span>{group}</span>
                    {activeGroupItem !== undefined && !expanded && (
                      <small>{activeGroupItem.label}</small>
                    )}
                    <span className="nav-group-chevron" aria-hidden="true" />
                  </button>
                )}
                <div
                  id={groupId}
                  className="nav-group-items"
                  role="group"
                  aria-label={group}
                  hidden={!expanded}
                >
                  {groupItems.map((item) => {
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
                              : item.id === "attention" &&
                                  state.snapshot.attention.kind === "ready" &&
                                  state.snapshot.attention.data.unreadCount > 0
                                ? `${item.label} · ${state.snapshot.attention.data.unreadCount} nieprzeczytanych`
                                : item.label
                          }
                          aria-current={
                            surface === item.id ? "page" : undefined
                          }
                          title={
                            railMode
                              ? undefined
                              : shortcutHint.kind === "direct"
                                ? `${item.label} · ${shortcutHint.keys}`
                                : `${item.label} · przez paletę ${shortcutHint.keys}`
                          }
                          onFocus={(event) => {
                            setFocusedNavItemId(item.id);
                            preloadSurface(item.id);
                            showRailTip(
                              event.currentTarget,
                              item.label,
                              shortcutHint,
                            );
                          }}
                          onBlur={hideRailTip}
                          onMouseEnter={(event) => {
                            preloadSurface(item.id);
                            showRailTip(
                              event.currentTarget,
                              item.label,
                              shortcutHint,
                            );
                          }}
                          onMouseLeave={hideRailTip}
                          {...navHandlers(
                            destinationContext(item.id, item.label),
                          )}
                        >
                          <Icon name={item.icon} />
                          <span>{item.label}</span>
                          <span className="nav-item-meta" aria-hidden="true">
                            {item.id === "tasks" ? (
                              <span className="nav-count">{tasks.length}</span>
                            ) : item.id === "attention" &&
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
                            focusedNavItemId === item.id || surface === item.id
                              ? 0
                              : -1
                          }
                          aria-label={`${favorites.includes(item.id) ? "Usuń" : "Dodaj"} ${item.label} ${favorites.includes(item.id) ? "z" : "do"} ulubionych`}
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
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-spacer" />
        {isPreview && (
          <details className="fixture-condition">
            <summary>Stan podglądu</summary>
            <select
              value={previewCondition}
              onChange={(event) =>
                setPreviewCondition(event.target.value as PreviewCondition)
              }
              aria-label="Wybierz deterministyczny stan podglądu"
            >
              <option value="ready">Gotowy</option>
              <option value="offline">Offline</option>
              <option value="retry">Retry</option>
              <option value="partial">Częściowy</option>
              <option value="conflict">Konflikt</option>
              <option value="permission">Uprawnienia</option>
              <option value="recovery">Recovery</option>
            </select>
          </details>
        )}
        <div className="preview-identity">
          <span className="status-dot" />
          <div>
            <strong>
              {isPreview
                ? "Podgląd deweloperski"
                : coordinatedDataHome
                  ? "Skoordynowany workspace"
                  : "Lokalny workspace"}
            </strong>
            <span>
              {coordinatedDataHome
                ? "Hub + zaszyfrowana kopia robocza"
                : build.persistence === "encrypted-local"
                  ? "Zaszyfrowany zapis lokalny"
                  : "Pamięć sesji"}{" "}
              · {build.version}
            </span>
          </div>
        </div>
      </aside>

      <main className="work-column" aria-labelledby="surface-title">
        <div className="shell-tabbar" aria-label="Otwarte konteksty">
          <div
            className="shell-history-controls"
            aria-label="Historia kontekstu"
          >
            <button
              className="icon-button"
              aria-label="Wstecz"
              title="Wstecz · Alt+←"
              disabled={!canMoveShellHistory(navigation, -1)}
              onClick={() =>
                setNavigation((current) => moveShellHistory(current, -1))
              }
            >
              <span aria-hidden="true">←</span>
            </button>
            <button
              className="icon-button"
              aria-label="Dalej"
              title="Dalej · Alt+→"
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
            aria-label="Konteksty"
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
                      aria-label={`Zamknij kontekst ${tab.label}`}
                      title={`Zamknij · ${modifierLabel}W`}
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
                ? "Zamknij osobne okno"
                : `Otwórz ${activeContext.label} w osobnym oknie`
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
                      "Nie udało się otworzyć osobnego okna. Bieżący kontekst pozostaje tutaj.",
                  }),
                );
            }}
          >
            <span className="shell-detach-long">
              {detachedWindow ? "Dołącz z powrotem" : "Osobne okno"}
            </span>
            <span className="shell-detach-short" aria-hidden="true">
              {detachedWindow ? "Dołącz" : "Okno"}
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
                  Kopiuj szczegóły
                </button>
              )}
              <button
                className="icon-button"
                aria-label="Zamknij komunikat"
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
          {surface === "cockpit" && (
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
                openContext(projectContext(id, project?.title ?? "Projekt"));
              }}
              onSelectProject={selectProjectInInspector}
              onOpenTask={(id) => {
                const task = tasks.find((item) => item.id === id);
                openContext(taskContext(id, task?.title ?? "Zadanie"));
              }}
              onSelectTask={selectTaskInInspector}
              onOpenAttention={() =>
                openContext(destinationContext("attention", "Do uwagi"))
              }
              onCapture={openCapture}
            />
          )}
          {surface === "meetings" && client && (
            <LazySurfaceBoundary label="Spotkania">
              <Suspense fallback={<SurfaceLoadingState label="Spotkania" />}>
                <MeetingsSurface
                  client={client}
                  activeMeetingId={selectedMeetingId}
                  inspectorHost={meetingInspectorHost}
                  onInspectorOpen={() => setMeetingInspectorOpen(true)}
                  onMeetingSelected={setSelectedMeetingId}
                />
              </Suspense>
            </LazySurfaceBoundary>
          )}
          {surface === "relationships" && (
            <LazySurfaceBoundary label="Relacje">
              <Suspense fallback={<SurfaceLoadingState label="Relacje" />}>
                {activeContext.organizationId === undefined ? (
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
                    organizationId={activeContext.organizationId}
                    onOpenProject={(id, title) =>
                      openContext(projectContext(id, title))
                    }
                    onOpenTask={(id, title) =>
                      openContext(taskContext(id, title))
                    }
                    onOpenDocument={(id, title) =>
                      openContext(documentContext(id, title))
                    }
                    onOpenMeeting={(id) => {
                      setSelectedMeetingId(id);
                      openContext(destinationContext("meetings", "Spotkania"));
                    }}
                    onOpenRelationship={(id) => {
                      openContext(
                        destinationContext("relationships", "Relacje"),
                      );
                      selectStrategicInInspector(id);
                    }}
                  />
                )}
              </Suspense>
            </LazySurfaceBoundary>
          )}
          {surface === "work" && (
            <LazySurfaceBoundary label="Praca">
              <Suspense fallback={<SurfaceLoadingState label="Praca" />}>
                <WorkSurface
                  client={client}
                  snapshot={state.snapshot}
                  selectedTaskId={selectedTaskId}
                  selectedProjectId={selectedProjectId}
                  selectedContextId={selectedWorkContext?.id}
                  onSelectTask={selectTaskInInspector}
                  onOpenTask={(id) => {
                    const task = tasks.find((item) => item.id === id);
                    openContext(taskContext(id, task?.title ?? "Zadanie"));
                  }}
                  onSelectProject={selectProjectInInspector}
                  onSelectContext={selectWorkContextInInspector}
                  onReload={reload}
                  onFailure={showFailure}
                />
              </Suspense>
            </LazySurfaceBoundary>
          )}
          {surface === "settings" && (
            <LazySurfaceBoundary label="Ustawienia">
              <Suspense fallback={<SurfaceLoadingState label="Ustawienia" />}>
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
          )}
          {surface === "tasks" && (
            <TasksSurface
              snapshot={state.snapshot}
              selectedTaskId={selectedTaskId}
              busyTaskId={busyTaskId}
              onOpenTask={(id) => {
                const task = tasks.find((item) => item.id === id);
                openContext(taskContext(id, task?.title ?? "Zadanie"));
              }}
              onSelectTask={selectTaskInInspector}
              onCapture={openCapture}
              onCreateTask={async (title) => {
                if (!client) return false;
                const result = await createTask(client, state.snapshot, {
                  title,
                });
                if (result.kind === "success") {
                  await refreshAfter("Zadanie utworzono.");
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
                    await refreshAfter("Status zadania zaktualizowano.");
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
                      completed
                        ? "Zadanie ukończono."
                        : "Zadanie otwarto ponownie.",
                    );
                  else showFailure(result);
                });
              }}
              onSetAssignment={(
                id: TaskId,
                principalId: PrincipalId | undefined,
              ) => {
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
                        ? "Odpowiedzialność usunięto."
                        : "Odpowiedzialność przypisano.",
                    );
                  else showFailure(result);
                });
              }}
            />
          )}
          {surface === "documents" && (
            <LazySurfaceBoundary label="Dokumenty">
              <Suspense fallback={<SurfaceLoadingState label="Dokumenty" />}>
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
                        taskContext(
                          target.targetId as TaskId,
                          task?.title ?? "Zadanie",
                        ),
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
                          project?.title ?? "Projekt",
                        ),
                      );
                      return;
                    }
                    if (
                      target.targetKind === "person" ||
                      target.targetKind === "organization"
                    ) {
                      setSelectedStrategicId(
                        target.targetId as StrategicRecordId,
                      );
                      openContext(
                        destinationContext("relationships", "Relacje"),
                      );
                      return;
                    }
                    setSelectedMeetingId(target.targetId);
                    openContext(destinationContext("meetings", "Spotkania"));
                  }}
                  onReload={reload}
                  onFailure={showFailure}
                />
              </Suspense>
            </LazySurfaceBoundary>
          )}
          {surface === "projects" && (
            <ProjectsSurface
              client={client}
              snapshot={state.snapshot}
              selectedProjectId={selectedProjectId}
              activeProjectId={activeContext.projectId}
              overview={projectOverview}
              relation={sessionRelation}
              busy={projectBusy}
              onOpenProject={(id) => {
                const project =
                  state.snapshot.projects.kind === "ready"
                    ? state.snapshot.projects.data.items.find(
                        (item) => item.id === id,
                      )
                    : undefined;
                openContext(projectContext(id, project?.title ?? "Projekt"));
              }}
              onSelectProject={selectProjectInInspector}
              onBackToProjects={() =>
                openContext(destinationContext("projects", "Projekty"))
              }
              onOpenDocument={(id, title) =>
                openContext(documentContext(id, title))
              }
              onOpenMeeting={(id) => {
                setSelectedMeetingId(id);
                openContext(destinationContext("meetings", "Spotkania"));
              }}
              onOpenRelationship={(id) => {
                setSelectedStrategicId(id);
                openContext(destinationContext("relationships", "Relacje"));
              }}
              onEntityActivate={(target) => {
                if (target.targetKind === "task") {
                  setSelectedTaskId(target.targetId as TaskId);
                  openContext(destinationContext("tasks", "Zadania"));
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
                      project?.title ?? "Projekt",
                    ),
                  );
                  return;
                }
                if (
                  target.targetKind === "person" ||
                  target.targetKind === "organization"
                ) {
                  setSelectedStrategicId(target.targetId as StrategicRecordId);
                  openContext(destinationContext("relationships", "Relacje"));
                  return;
                }
                setSelectedMeetingId(target.targetId);
                openContext(destinationContext("meetings", "Spotkania"));
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
                openContext(
                  projectContext(result.data.projectId, title.trim()),
                );
                await refreshAfter("Projekt utworzono.");
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
                    await refreshAfter("Szablon zastosowano.");
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
                    await refreshAfter("Zamierzony wynik zaktualizowano.");
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
                        ? "Projekt zamknięto; historia i otwarte zadania pozostały bez zmian."
                        : "Projekt otwarto ponownie.",
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
                    await refreshAfter("Zadanie powiązano z projektem.");
                  } else showFailure(result);
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
                    await refreshAfter("Powiązanie usunięto.");
                  } else showFailure(result);
                });
              }}
            />
          )}
          {surface === "history" && (
            <HistorySurface
              snapshot={state.snapshot}
              selectedCaptureId={selectedCaptureId}
              onSelectCapture={selectCaptureInInspector}
            />
          )}
          {surface === "activity" && (
            <LazySurfaceBoundary label="Aktywność">
              <Suspense fallback={<SurfaceLoadingState label="Aktywność" />}>
                <ActivitySurface
                  activity={state.snapshot.activity}
                  timezone={state.snapshot.bootstrap.workspace.timezone}
                  onUndo={(id) => void openUndo(id)}
                  onRetry={() => void reload()}
                />
              </Suspense>
            </LazySurfaceBoundary>
          )}
          {surface === "attention" && (
            <AttentionSurface
              attention={state.snapshot.attention}
              selectedItemId={selectedAttentionId}
              onRetry={() => void reload()}
              onOpen={openAttentionDestination}
              onSelect={(item) => selectAttentionInInspector(item.id)}
            />
          )}
          {surface === "access" && (
            <LazySurfaceBoundary label="Dostęp">
              <Suspense fallback={<SurfaceLoadingState label="Dostęp" />}>
                <AccessSurface
                  access={state.snapshot.access}
                  agentAccess={state.snapshot.agentAccess}
                  agentTransport={
                    state.snapshot.dataHome?.descriptor.providerKind ===
                    "coordinated"
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
                          await refreshAfter("Dostęp utworzono.");
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
                        await refreshAfter("Zakres dostępu zaktualizowano.");
                      else showFailure(result);
                    });
                  }}
                  onRevoke={(member) => {
                    if (!client) return;
                    setAccessBusy(true);
                    setNotice(undefined);
                    void revokeWorkspaceMember(
                      client,
                      state.snapshot,
                      member,
                    ).then(async (result) => {
                      setAccessBusy(false);
                      if (result.kind === "success")
                        await refreshAfter(
                          "Dostęp cofnięto. Urządzenia usuną projekcję po synchronizacji.",
                        );
                      else showFailure(result);
                    });
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
                                title: "Zdalny dostęp MCP utworzono",
                                descriptorLabel: "Chroniony plik konfiguracji",
                                descriptorPath: result.data.descriptorPath,
                                connectionLabel: "Endpoint",
                                connectionValue: result.data.endpoint,
                              }
                            : {
                                title: "Dostęp MCP utworzono",
                                descriptorLabel: "Plik dostępu",
                                descriptorPath: result.data.descriptorPath,
                                connectionLabel: "Adapter hosta",
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
                                title: "Zdalne poświadczenie obrócono",
                                descriptorLabel: "Chroniony plik konfiguracji",
                                descriptorPath: result.data.descriptorPath,
                                connectionLabel: "Endpoint",
                                connectionValue: result.data.endpoint,
                              }
                            : {
                                title: "Poświadczenie obrócono",
                                descriptorLabel: "Plik dostępu",
                                descriptorPath: result.data.descriptorPath,
                                connectionLabel: "Adapter hosta",
                                connectionValue: `${result.data.launchCommand} ${result.data.launchArgs.join(" ")}`,
                              },
                        );
                      } else showFailure(result);
                    });
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
                            ? "Zdalny dostęp agenta cofnięto, a chroniony plik konfiguracji usunięto."
                            : "Dostęp agenta cofnięto, a lokalne poświadczenie usunięto.",
                        );
                      else showFailure(result);
                    });
                  }}
                />
              </Suspense>
            </LazySurfaceBoundary>
          )}
        </div>

        <div className="capture-dock-layer">
          <button className="capture-dock" onClick={openCapture}>
            <span className="capture-dock-content">
              <Icon name="capture" />
              <span className="capture-dock-label">
                Zapisz myśl, link albo zadanie…
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
        aria-label="Podgląd kontekstu"
        aria-hidden={!inspectorDetailOpen}
      >
        <div
          className="inspector-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Zmień szerokość panelu podglądu"
          aria-valuemin={280}
          aria-valuemax={640}
          aria-valuenow={inspectorWidth}
          title="Podwójne kliknięcie przywraca domyślną szerokość"
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
            <span>Podgląd kontekstu</span>
            <small>
              {selectedTask
                ? "Zadanie"
                : selectedProject
                  ? "Projekt"
                  : selectedWorkContextRecord
                    ? selectedWorkContextRecord.kind === "area"
                      ? "Obszar odpowiedzialności"
                      : "Inicjatywa"
                    : selectedStrategicRecord
                      ? (recordKindLabels[selectedStrategicRecord.kind] ??
                        "Rekord strategiczny")
                      : selectedCapture
                        ? "Capture"
                        : selectedAttention
                          ? "Sygnał uwagi"
                          : surface === "meetings"
                            ? "Wynik Jamie"
                            : surface === "documents"
                              ? documentInspectorKind === "source"
                                ? "Źródło"
                                : "Dokument"
                              : "Workspace"}
            </small>
          </div>
          <button
            className="icon-button"
            aria-label="Zamknij podgląd kontekstu"
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
        ) : surface === "documents" ? (
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
                  await refreshAfter("Zachowane audio zostało usunięte.");
                else showFailure(result);
              });
            }}
          />
        ) : selectedTask ? (
          <div className="inspector-body">
            <span className="record-status">
              <i />
              {selectedTask.completionState === "completed"
                ? "Ukończone"
                : selectedTask.status.label}
            </span>
            <h2>{selectedTask.title}</h2>
            <p className="record-summary">
              {sourceCapture
                ? "Utworzone z zachowanego Capture."
                : "Zadanie w aktywnym workspace."}
            </p>
            <section className="inspector-section task-context-block">
              <p className="section-label">Kontekst roboczy</p>
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
                        message: "Data ma nieprawidłowy format.",
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
                          "Start nie może wypadać po terminie. Popraw daty i zapisz ponownie.",
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
                        await refreshAfter("Kontekst zadania zapisano.");
                      } else showFailure(result);
                    });
                  }}
                >
                  <label>
                    <span>Tytuł</span>
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
                    <span>Kontekst</span>
                    <textarea
                      value={taskDraft.description}
                      rows={6}
                      maxLength={16000}
                      disabled={taskEditBusy}
                      placeholder="Co trzeba wiedzieć, aby podjąć to zadanie po przerwie?"
                      onChange={(event) =>
                        setTaskDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>Następny krok</span>
                    <input
                      value={taskDraft.nextAction}
                      maxLength={500}
                      disabled={taskEditBusy}
                      placeholder="Jedno zdanie: od czego zacząć."
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
                      <span>Termin</span>
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
                    <span>Priorytet</span>
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
                      <option value="">Domyślny (normalny)</option>
                      <option value="urgent">Pilny</option>
                      <option value="high">Wysoki</option>
                      <option value="normal">Normalny</option>
                      <option value="low">Niski</option>
                    </select>
                  </label>
                  <div className="task-context-actions">
                    <button
                      type="submit"
                      className="secondary-button"
                      disabled={taskEditBusy || !client}
                    >
                      {taskEditBusy ? "Zapisywanie…" : "Zapisz"}
                    </button>
                    <button
                      type="button"
                      disabled={taskEditBusy}
                      onClick={() => {
                        taskEditWantsFocusRef.current = true;
                        setTaskEditOpen(false);
                      }}
                    >
                      Anuluj
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
                      Brak zapisanego kontekstu. Dodaj notatki, aby wrócić do
                      zadania bez odtwarzania z pamięci.
                    </p>
                  )}
                  {selectedTask.nextAction && (
                    <p className="task-next-action">
                      <span>Następny krok:</span> {selectedTask.nextAction}
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
                          Termin:{" "}
                          {formatDate(
                            selectedTask.dueAt,
                            state.snapshot.bootstrap.workspace.timezone,
                          )}
                          {selectedTask.completionState === "open" &&
                          Date.parse(selectedTask.dueAt) < Date.now()
                            ? " · po terminie"
                            : ""}
                        </span>
                      )}
                      {selectedTask.priority !== undefined &&
                        selectedTask.priority !== "normal" && (
                          <span>
                            Priorytet:{" "}
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
                    Edytuj kontekst
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
              <p className="section-label">Podzadania</p>
              {selectedTask.parentTaskId !== undefined ? (
                <p>
                  Część zadania:{" "}
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
                      ?.title ?? "Zadanie nadrzędne"}
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
                          Rozbij wynik tylko wtedy, gdy część pracy ma własny
                          stan, termin lub odpowiedzialność.
                        </p>
                      ) : (
                        <>
                          <p>
                            Ukończone {doneCount} z {children.length}
                            {doneCount === children.length
                              ? " · wynik zamykasz świadomie"
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
                                    ? " · ukończone"
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
                              await refreshAfter("Podzadanie utworzono.");
                            } else showFailure(result);
                          });
                        }}
                      >
                        <label>
                          <span className="sr-only">
                            Tytuł nowego podzadania
                          </span>
                          <input
                            value={subtaskDraft}
                            maxLength={500}
                            disabled={subtaskBusy}
                            placeholder="Dodaj podzadanie"
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
                          Dodaj
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
                <p className="section-label">Pola</p>
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
                          await refreshAfter("Wartość pola zapisano.");
                        } else showFailure(result);
                      });
                    };
                    return (
                      <div className="task-field-row" key={definition.id}>
                        <span className="task-field-label">
                          {definition.label}
                          {retired ? " (wycofane)" : ""}
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
                              ? " · wyliczane"
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
                                    message:
                                      "Wartość liczbowa jest nieprawidłowa.",
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
                                  Zapisz
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
              <p className="section-label">Odpowiedzialność</p>
              <p>
                {selectedTask.assignment?.displayName ?? "Nieprzypisane"}
                {selectedTask.assignment?.availability === "former_member"
                  ? " · dostęp cofnięty"
                  : ""}
              </p>
            </section>
            <section className="inspector-section provenance-block">
              <p className="section-label">Pochodzenie z Capture</p>
              {sourceCapture ? (
                <>
                  <blockquote>{sourceCapture.originalText}</blockquote>
                  <p>Quick Capture · oryginał zachowany</p>
                </>
              ) : (
                <p>Brak powiązanego źródła Capture.</p>
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
              <p className="section-label">Ślad audytowy</p>
              {receipt ? (
                <dl>
                  <div>
                    <dt>Polecenie</dt>
                    <dd>{receipt.commandName}</dd>
                  </div>
                  <div>
                    <dt>Receipt</dt>
                    <dd className="mono">{receipt.id.slice(0, 18)}…</dd>
                  </div>
                </dl>
              ) : (
                <p>
                  Pełne potwierdzenie operacji pozostaje w lokalnym rdzeniu
                  danych.
                </p>
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
                    pushToast({ message: "Komentarz zapisano." });
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
                ? "Aktywny"
                : selectedProject.lifecycle}
            </span>
            <h2>{selectedProject.title}</h2>
            <p className="record-summary">
              Projekt w aktywnym workspace i bieżącym zakresie Space.
            </p>
            <section className="inspector-section provenance-block">
              <p className="section-label">Zamierzony wynik</p>
              <blockquote>{selectedProject.intendedOutcome}</blockquote>
              <p>Wynik pozostaje częścią wersjonowanego rekordu Projektu.</p>
            </section>
            <section className="inspector-section">
              <p className="section-label">Kontekst pracy</p>
              <dl className="record-fields">
                <div>
                  <dt>Otwarte</dt>
                  <dd>{selectedProject.relatedOpenTaskCount} zadań</dd>
                </div>
                <div>
                  <dt>Wersja</dt>
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
                    pushToast({ message: "Komentarz zapisano." });
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
                ? "Trwała odpowiedzialność w modelu pracy."
                : "Inicjatywa z wynikiem do zamknięcia."}
            </p>
            <section className="inspector-section provenance-block">
              <p className="section-label">
                {selectedWorkContextRecord.kind === "area"
                  ? "Stała odpowiedzialność"
                  : "Zamierzony wynik"}
              </p>
              <blockquote>{selectedWorkContextRecord.detail}</blockquote>
              <p>
                {selectedWorkContextRecord.kind === "area"
                  ? "Obszar nie ma daty końca; zamyka się projektami."
                  : "Inicjatywę zamyka osiągnięcie tego wyniku."}
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
            onSelectRecord={selectStrategicInInspector}
            onOpenProject={(id, title) =>
              openContext(projectContext(id, title))
            }
          />
        ) : (
          <div className="inspector-empty workspace-context">
            <BrandMark />
            <p className="eyebrow">Aktywny kontekst</p>
            <h2>{bootstrap.workspace.name}</h2>
            <p>
              Root Space ·{" "}
              {coordinatedDataHome
                ? "skoordynowany Data Home"
                : "lokalne źródło danych"}
            </p>
            <dl>
              <div>
                <dt>Tryb</dt>
                <dd>
                  {coordinatedDataHome
                    ? "Hub + zaszyfrowana kopia robocza"
                    : build.persistence === "encrypted-local"
                      ? "Zaszyfrowany zapis lokalny"
                      : "Podgląd deweloperski"}
                </dd>
              </div>
              <div>
                <dt>Stan</dt>
                <dd>Gotowy</dd>
              </div>
            </dl>
          </div>
        )}
        {surface !== "documents" && (
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
            if (!client) return "Desktop jest chwilowo niedostępny.";
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
                taskContext(
                  captureResult.taskId,
                  task?.title ?? "Nowe zadanie",
                ),
              );
              setReceipts((current) => ({
                ...current,
                [captureResult.taskId]: result.receipt,
              }));
            } else if (captureResult.kind === "review") {
              openContext(destinationContext("attention", "Do uwagi"));
            } else if (captureResult.kind === "voice_note") {
              openContext(destinationContext("history", "Historia Capture"));
            } else {
              openContext(destinationContext("documents", "Dokumenty"));
            }
            setCaptureOpen(false);
            pushToast({
              message:
                captureResult.kind === "task"
                  ? "Capture zapisano jako zadanie."
                  : captureResult.kind === "knowledge_source"
                    ? "Capture zapisano jako źródło wiedzy."
                    : captureResult.kind === "voice_note"
                      ? "Notatka głosowa jest bezpieczna i czeka na transkrypcję agenta."
                      : "Capture wymaga decyzji i trafił do Attention.",
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
              openContext(taskContext(id, task?.title ?? "Zadanie"));
            } else if (nextSurface === "projects") {
              const id = recordId as ProjectId;
              const project =
                state.snapshot.projects.kind === "ready"
                  ? state.snapshot.projects.data.items.find(
                      (item) => item.id === id,
                    )
                  : undefined;
              openContext(projectContext(id, project?.title ?? "Projekt"));
            } else if (nextSurface === "documents") {
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
                  destinationContext(nextSurface, item?.label ?? "Dokumenty"),
                );
              }
            } else if (nextSurface === "relationships") {
              const record =
                state.snapshot.relationships.kind === "ready"
                  ? state.snapshot.relationships.data.records.find(
                      (item) => item.id === recordId,
                    )
                  : undefined;
              if (record?.kind === "organization") {
                openContext(organizationContext(record.id, record.name));
              } else {
                openContext(destinationContext("relationships", "Relacje"));
                selectStrategicInInspector(recordId);
              }
            } else if (nextSurface === "meetings") {
              setSelectedMeetingId(recordId);
              openContext(destinationContext("meetings", "Spotkania"));
            } else {
              const item = navItems.find((entry) => entry.id === nextSurface);
              openContext(
                destinationContext(nextSurface, item?.label ?? "Widok"),
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
                  await refreshAfter("Zmianę cofnięto i zapisano w audycie.");
                  openContext(destinationContext("activity", "Aktywność"));
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
              openContext(destinationContext("cockpit", "Tydzień"));
              pushToast({
                message: "Workspace przywrócono i otwarto ponownie.",
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
            aria-label={`Akcje kontekstu ${navMenu.context.label}`}
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
              Otwórz
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
              Otwórz w nowej karcie
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
              {railTip.hint.kind === "palette" && <small>przez paletę</small>}
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
              aria-label={`W kolejce: ${toasts.length - 1}`}
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
              Przywróć
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
              Cofnij
            </button>
          )}
          <button
            className="ghost-button"
            onClick={() => dismissToast(activeToast.id)}
          >
            Zamknij
          </button>
        </div>
      )}
    </div>
  );
};
