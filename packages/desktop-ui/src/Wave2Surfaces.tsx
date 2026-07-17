import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type {
  CaptureId,
  CommandId,
  PrincipalId,
  ProjectId,
  RelationId,
  TaskId,
  TaskStatusId,
} from "@constellation/contracts";
import type {
  ConstellationRendererClient,
  DesktopWorkspaceCockpitEntry,
} from "@constellation/desktop-preload/client";

import {
  searchGlobal,
  type ActivityProjection,
  type DesktopSnapshot,
  type MutationFailure,
  type ProjectOverviewProjection,
  type SearchProjection,
  type UndoPreview,
} from "./client/workflow.js";
import type { SurfaceId } from "./client/wave2-fixtures.js";

const Mark = ({ kind }: { readonly kind: string }) => (
  <span className={`record-mark mark-${kind}`} aria-hidden="true" />
);

const SurfaceHeader = ({
  kicker,
  title,
  description,
  action,
}: {
  readonly kicker: string;
  readonly title: string;
  readonly description: string;
  readonly action?: React.ReactNode;
}) => (
  <header className="surface-header wave2-header">
    <div>
      <p className="eyebrow">{kicker}</p>
      <h1 id="surface-title">{title}</h1>
      <p>{description}</p>
    </div>
    {action}
  </header>
);

const InlineState = ({
  title,
  detail,
  action,
}: {
  readonly title: string;
  readonly detail: string;
  readonly action?: React.ReactNode;
}) => (
  <div className="empty-state" role="status">
    <span className="empty-glyph">
      <Mark kind="warning" />
    </span>
    <div>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
    {action}
  </div>
);

export const CockpitSurface = ({
  client,
  snapshot,
  onOpenProject,
  onSelectTask,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly onOpenProject: (id: ProjectId) => void;
  readonly onSelectTask: (id: TaskId) => void;
}) => {
  const cockpit = snapshot.cockpit;
  const projects = snapshot.projects;
  const focus = cockpit.kind === "ready" ? cockpit.data.focus : [];
  const [workspaceFocus, setWorkspaceFocus] = useState<
    readonly DesktopWorkspaceCockpitEntry[]
  >([]);
  const [workspaceFocusUnavailable, setWorkspaceFocusUnavailable] =
    useState(false);
  useEffect(() => {
    if (!client?.getCrossWorkspaceCockpit) return;
    let active = true;
    void client
      .getCrossWorkspaceCockpit()
      .then((items) => {
        if (!active) return;
        setWorkspaceFocus(items);
        setWorkspaceFocusUnavailable(false);
      })
      .catch(() => active && setWorkspaceFocusUnavailable(true));
    return () => {
      active = false;
    };
  }, [client]);
  return (
    <div className="surface-scroll cockpit-surface">
      <SurfaceHeader
        kicker={
          cockpit.kind === "ready"
            ? `${cockpit.data.weekStart} – ${cockpit.data.weekEnd}`
            : "Widok tygodnia"
        }
        title="Tydzień oparty na aktualnych danych"
        description="Deterministyczna kolejność otwartych zadań i aktywnych projektów. Bez generowanych rekomendacji."
      />
      {workspaceFocus.length > 1 && (
        <section
          className="workspace-focus-strip"
          aria-labelledby="workspace-focus-title"
        >
          <header>
            <div>
              <p className="eyebrow">Twoje workspace</p>
              <h2 id="workspace-focus-title">Fokus bez mieszania danych</h2>
            </div>
            <span>{workspaceFocus.length} autoryzowane</span>
          </header>
          <div>
            {workspaceFocus.map((workspace) => (
              <button
                type="button"
                key={workspace.workspaceId}
                disabled={
                  workspace.active ||
                  workspace.availability === "unavailable" ||
                  !client?.switchWorkspace
                }
                onClick={() =>
                  client?.switchWorkspace?.({
                    workspaceId: workspace.workspaceId,
                  })
                }
              >
                <span>
                  <strong>{workspace.name}</strong>
                  <small>
                    {workspace.availability === "unavailable"
                      ? "Lokalna projekcja niedostępna"
                      : (workspace.firstFocus ?? "Brak otwartych działań")}
                  </small>
                </span>
                <em>
                  {workspace.active
                    ? "Otwarty"
                    : workspace.availability === "ready"
                      ? `${workspace.focusCount ?? 0} działań`
                      : "Offline"}
                </em>
              </button>
            ))}
          </div>
        </section>
      )}
      {workspaceFocusUnavailable && (
        <InlineState
          title="Przekrojowy fokus jest chwilowo niedostępny"
          detail="Bieżący workspace działa normalnie; pozostałe zaszyfrowane projekcje nie zostały otwarte."
        />
      )}
      {cockpit.kind === "unavailable" ? (
        <InlineState
          title="Widok tygodnia jest niedostępny"
          detail={cockpit.message}
        />
      ) : focus.length === 0 ? (
        <InlineState
          title="Brak otwartych działań na ten tydzień"
          detail="Dodaj zadanie przez Quick Capture albo utwórz projekt z konkretnym wynikiem."
        />
      ) : (
        <>
          <section className="now-panel" aria-labelledby="now-title">
            <div className="now-copy">
              <p className="eyebrow">Pierwszy fokus</p>
              <h2 id="now-title">{focus[0]?.title}</h2>
              <div className="reason-line" aria-label="Powody kolejności">
                {focus[0]?.reasons.map((reason) => (
                  <span key={reason.code}>
                    {reason.code === "task_open"
                      ? "Otwarte zadanie"
                      : reason.code === "created_this_week"
                        ? "Utworzone w tym tygodniu"
                        : `Aktywny projekt: ${reason.projectTitle}`}
                  </span>
                ))}
              </div>
            </div>
            <button
              className="primary-button"
              onClick={() => focus[0] && onSelectTask(focus[0].taskId)}
            >
              Otwórz zadanie
            </button>
          </section>
          <section
            className="active-work reading-panel"
            aria-labelledby="active-work-title"
          >
            <header className="section-heading">
              <div>
                <p className="eyebrow">Aktywna praca</p>
                <h2 id="active-work-title">Następne działania</h2>
              </div>
              <span>{focus.length} w kolejności</span>
            </header>
            <div className="compact-record-list">
              {focus.map((task) => (
                <button
                  key={task.taskId}
                  onClick={() => onSelectTask(task.taskId)}
                >
                  <Mark kind="task" />
                  <span>
                    <strong>{task.title}</strong>
                    <small>
                      {task.reasons
                        .map((reason) =>
                          reason.code === "active_project"
                            ? reason.projectTitle
                            : reason.code === "created_this_week"
                              ? "Utworzone w tym tygodniu"
                              : "Otwarte",
                        )
                        .join(" · ")}
                    </small>
                  </span>
                  <em>{task.score} pkt</em>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
      <section
        className="outcome-rail reading-panel"
        aria-labelledby="outcomes-title"
      >
        <header className="section-heading">
          <div>
            <p className="eyebrow">Aktywne projekty</p>
            <h2 id="outcomes-title">Wyniki do osiągnięcia</h2>
          </div>
          <span>
            {projects.kind === "ready" ? projects.data.items.length : "—"}
          </span>
        </header>
        {projects.kind === "unavailable" ? (
          <InlineState
            title="Projekty są niedostępne"
            detail={projects.message}
          />
        ) : projects.data.items.length === 0 ? (
          <p className="capacity-note">Nie ma jeszcze aktywnych projektów.</p>
        ) : (
          projects.data.items.map((project, index) => (
            <button
              className="outcome-row"
              key={project.id}
              onClick={() => onOpenProject(project.id)}
            >
              <span className="outcome-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <strong>{project.intendedOutcome}</strong>
                <small>{project.title}</small>
              </span>
              <em>{project.relatedOpenTaskCount} otw.</em>
            </button>
          ))
        )}
      </section>
    </div>
  );
};

export const TasksSurface = ({
  snapshot,
  selectedTaskId,
  busyTaskId,
  onSelectTask,
  onCapture,
  onSetStatus,
  onSetCompleted,
  onSetAssignment,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly selectedTaskId: TaskId | undefined;
  readonly busyTaskId: TaskId | undefined;
  readonly onSelectTask: (id: TaskId) => void;
  readonly onCapture: () => void;
  readonly onSetStatus: (id: TaskId, statusId: TaskStatusId) => void;
  readonly onSetCompleted: (id: TaskId, completed: boolean) => void;
  readonly onSetAssignment: (
    id: TaskId,
    principalId: PrincipalId | undefined,
  ) => void;
}) => (
  <div className="surface-scroll">
    <SurfaceHeader
      kicker="Root Space · lokalny widok"
      title="Zadania"
      description="Przechwycone działania, ich stan i zachowane źródła."
      action={
        <button className="secondary-button" onClick={onCapture}>
          Nowe zadanie
        </button>
      }
    />
    <section className="task-panel" aria-label="Lista zadań">
      <header>
        <div>
          <h2>Wszystkie zadania</h2>
          <span>{snapshot.tasks.length} w widoku</span>
        </div>
      </header>
      {snapshot.tasks.length === 0 ? (
        <InlineState
          title="Jeszcze nie ma zadań"
          detail="Zapisz pierwszą myśl. Oryginał pozostanie powiązany z wynikiem routingu."
          action={
            <button className="secondary-button" onClick={onCapture}>
              Otwórz Quick Capture
            </button>
          }
        />
      ) : (
        <div className="task-list">
          {snapshot.tasks.map((task) => (
            <div
              key={task.id}
              className={`task-row ${task.id === selectedTaskId ? "selected" : ""}`}
            >
              <button
                className="task-check"
                aria-label={
                  task.completionState === "completed"
                    ? `Otwórz ponownie: ${task.title}`
                    : `Ukończ: ${task.title}`
                }
                aria-pressed={task.completionState === "completed"}
                disabled={busyTaskId === task.id}
                onClick={() =>
                  onSetCompleted(task.id, task.completionState !== "completed")
                }
              />
              <button
                className="task-copy"
                onClick={() => onSelectTask(task.id)}
              >
                <strong>{task.title}</strong>
                <span>
                  {task.sourceCaptureId
                    ? "Z Quick Capture · oryginał zachowany"
                    : "Root Space"}
                </span>
              </button>
              <label className="sr-only" htmlFor={`status-${task.id}`}>
                Status zadania {task.title}
              </label>
              <select
                id={`status-${task.id}`}
                className="task-status"
                value={task.status.id}
                disabled={busyTaskId === task.id}
                onChange={(event) =>
                  onSetStatus(task.id, event.target.value as TaskStatusId)
                }
              >
                {snapshot.bootstrap.taskStatuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor={`assignee-${task.id}`}>
                Osoba odpowiedzialna za {task.title}
              </label>
              <select
                id={`assignee-${task.id}`}
                className="task-assignee"
                aria-label={`Osoba odpowiedzialna za ${task.title}`}
                value={
                  task.assignment?.availability !== "active" && task.assignment
                    ? "unavailable-member"
                    : (task.assignment?.assigneePrincipalId ?? "")
                }
                disabled={
                  busyTaskId === task.id ||
                  snapshot.assignmentCandidates.kind !== "ready"
                }
                onChange={(event) =>
                  onSetAssignment(
                    task.id,
                    event.target.value === ""
                      ? undefined
                      : (event.target.value as PrincipalId),
                  )
                }
              >
                <option value="">Nieprzypisane</option>
                {task.assignment?.availability !== "active" &&
                  task.assignment !== undefined && (
                    <option value="unavailable-member" disabled>
                      {task.assignment.availability === "former_member"
                        ? "Były członek"
                        : "Brak dostępu do Space"}
                    </option>
                  )}
                {snapshot.assignmentCandidates.kind === "ready" &&
                  snapshot.assignmentCandidates.data.candidates.map(
                    (candidate) => (
                      <option
                        key={candidate.principalId}
                        value={candidate.principalId}
                      >
                        {candidate.displayName}
                        {candidate.participantKind === "guest" ? " · gość" : ""}
                      </option>
                    ),
                  )}
              </select>
            </div>
          ))}
        </div>
      )}
    </section>
  </div>
);

export const ProjectsSurface = ({
  snapshot,
  selectedProjectId,
  overview,
  relation,
  busy,
  onSelectProject,
  onCreate,
  onUpdateOutcome,
  onSetLifecycle,
  onRelate,
  onUnrelate,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly selectedProjectId: ProjectId | undefined;
  readonly overview: ProjectOverviewProjection | undefined;
  readonly relation:
    | {
        readonly id: RelationId;
        readonly version: number;
        readonly taskId: TaskId;
      }
    | undefined;
  readonly busy: boolean;
  readonly onSelectProject: (id: ProjectId) => void;
  readonly onCreate: (title: string, outcome: string) => Promise<boolean>;
  readonly onUpdateOutcome: (outcome: string) => void;
  readonly onSetLifecycle: (lifecycle: "active" | "closed") => void;
  readonly onRelate: (taskId: TaskId) => void;
  readonly onUnrelate: () => void;
}) => {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [outcome, setOutcome] = useState(
    overview?.project.intendedOutcome ?? "",
  );
  useEffect(
    () => setOutcome(overview?.project.intendedOutcome ?? ""),
    [overview],
  );
  const projects = snapshot.projects;
  const unrelated = snapshot.tasks.filter(
    (task) => !overview?.relatedTasks.some((related) => related.id === task.id),
  );
  return (
    <div className="surface-scroll project-surface">
      <SurfaceHeader
        kicker="Projekty · aktywne"
        title={overview?.project.title ?? "Projekty"}
        description="Operacyjny przegląd zamierzonego wyniku i powiązanej pracy."
        action={
          <button
            className="secondary-button"
            onClick={() => setCreating((value) => !value)}
          >
            {creating ? "Anuluj" : "Nowy projekt"}
          </button>
        }
      />
      {creating && (
        <form
          className="project-overview"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (title.trim() && outcome.trim()) {
              void onCreate(title, outcome).then((created) => {
                if (!created) return;
                setCreating(false);
                setTitle("");
                setOutcome("");
              });
            }
          }}
        >
          <div className="overview-intent">
            <label htmlFor="project-title">Nazwa projektu</label>
            <input
              id="project-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <label htmlFor="project-outcome">Zamierzony wynik</label>
            <textarea
              id="project-outcome"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            />
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? "Tworzę…" : "Utwórz projekt"}
            </button>
          </div>
        </form>
      )}
      {projects.kind === "unavailable" ? (
        <InlineState
          title="Lista projektów jest niedostępna"
          detail={projects.message}
        />
      ) : projects.data.items.length === 0 ? (
        <InlineState
          title="Nie ma jeszcze projektów"
          detail="Utwórz projekt i nazwij wynik, po którym poznasz, że praca jest skończona."
        />
      ) : (
        <div className="cockpit-grid">
          <section
            className="outcome-rail reading-panel"
            aria-label="Lista projektów"
          >
            {projects.data.items.map((project) => (
              <button
                className={`outcome-row ${project.id === selectedProjectId ? "selected" : ""}`}
                key={project.id}
                onClick={() => onSelectProject(project.id)}
              >
                <Mark kind="project" />
                <span>
                  <strong>{project.title}</strong>
                  <small>{project.intendedOutcome}</small>
                </span>
                <em>{project.relatedOpenTaskCount} otw.</em>
              </button>
            ))}
          </section>
          {overview && (
            <section
              className="project-overview"
              aria-labelledby="project-outcome-title"
            >
              <div className="overview-intent">
                <p className="eyebrow">Zamierzony wynik</p>
                {editing ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      onUpdateOutcome(outcome);
                    }}
                  >
                    <label className="sr-only" htmlFor="edited-project-outcome">
                      Zamierzony wynik
                    </label>
                    <textarea
                      id="edited-project-outcome"
                      value={outcome}
                      onChange={(event) => setOutcome(event.target.value)}
                    />
                    <div className="capture-footer">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setEditing(false)}
                      >
                        Anuluj
                      </button>
                      <button
                        className="primary-button"
                        disabled={busy}
                        type="submit"
                      >
                        Zapisz wynik
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <h2 id="project-outcome-title">
                      {overview.project.intendedOutcome}
                    </h2>
                    <div className="capture-footer">
                      <button
                        className="ghost-button"
                        onClick={() => setEditing(true)}
                      >
                        Edytuj wynik
                      </button>
                      <button
                        className="secondary-button compact"
                        disabled={busy}
                        onClick={() =>
                          onSetLifecycle(
                            overview.project.lifecycle === "active"
                              ? "closed"
                              : "active",
                          )
                        }
                      >
                        {overview.project.lifecycle === "active"
                          ? "Zamknij projekt"
                          : "Otwórz ponownie"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}
        </div>
      )}
      {overview && (
        <section
          className="project-work reading-panel"
          aria-labelledby="project-work-title"
        >
          <header className="section-heading">
            <div>
              <p className="eyebrow">Powiązana praca</p>
              <h2 id="project-work-title">Zadania projektu</h2>
            </div>
            {relation ? (
              <button
                className="secondary-button compact"
                disabled={busy}
                onClick={onUnrelate}
              >
                Usuń ostatnie powiązanie
              </button>
            ) : unrelated[0] ? (
              <button
                className="secondary-button compact"
                disabled={busy}
                onClick={() => onRelate(unrelated[0]!.id)}
              >
                Powiąż „{unrelated[0].title}”
              </button>
            ) : null}
          </header>
          {overview.relatedTasks.length === 0 ? (
            <p className="capacity-note">
              Ten projekt nie ma jeszcze powiązanych zadań.
            </p>
          ) : (
            <div className="compact-record-list">
              {overview.relatedTasks.map((task) => (
                <div key={task.id} className="compact-record">
                  <Mark kind="task" />
                  <span>
                    <strong>{task.title}</strong>
                    <small>Powiązane z projektem</small>
                  </span>
                  <em>
                    {task.completionState === "completed"
                      ? "Ukończone"
                      : "Otwarte"}
                  </em>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export const HistorySurface = ({
  snapshot,
  onUndo,
  onDeleteVoiceAudio,
  busyCaptureId,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly onUndo: (targetCommandId: CommandId) => void;
  readonly onDeleteVoiceAudio: (captureId: CaptureId, version: number) => void;
  readonly busyCaptureId: CaptureId | undefined;
}) => {
  const activity =
    snapshot.activity.kind === "ready" ? snapshot.activity.data.items : [];
  return (
    <div className="surface-scroll">
      <SurfaceHeader
        kicker="Capture History"
        title="Każdy oryginał ma dalszy ślad"
        description="Udane przetworzenie pozostaje sprawdzalne i odwracalne, jeśli bieżące wersje na to pozwalają."
      />
      {snapshot.captures.length === 0 ? (
        <InlineState
          title="Historia Capture jest pusta"
          detail="Pierwszy zapis przez Quick Capture pojawi się tutaj wraz z wynikiem przetwarzania."
        />
      ) : (
        <div className="history-grid">
          {snapshot.captures.map((capture) => {
            const routeActivity = activity.find(
              (item) =>
                item.activityType === "capture_routed" &&
                item.recordId === capture.id,
            );
            return (
              <article className="history-card" key={capture.id}>
                <header>
                  <Mark kind="capture" />
                  <div>
                    <p className="eyebrow">
                      Oryginał ·{" "}
                      {capture.original.kind === "text"
                        ? "tekst"
                        : capture.original.kind === "url"
                          ? "link"
                          : capture.original.kind === "screenshot"
                            ? "screenshot"
                            : capture.original.kind === "managed_file"
                              ? "zarządzany plik"
                              : capture.original.kind === "voice_note"
                                ? "notatka głosowa"
                                : "odwołanie do pliku"}
                    </p>
                    <h2>{capture.originalText}</h2>
                  </div>
                  <time>
                    {new Date(capture.capturedAt).toLocaleTimeString("pl-PL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </header>
                <ol className="processing-timeline">
                  <li className="done">
                    <i />
                    <div>
                      <strong>Zapisano oryginał</strong>
                      <span>
                        {capture.original.kind === "managed_file" ||
                        capture.original.kind === "screenshot" ||
                        capture.original.kind === "voice_note"
                          ? `Zaszyfrowana kopia · ${Math.ceil(capture.original.payload.byteLength / 1024).toLocaleString("pl-PL")} KB · integralność SHA-256`
                          : "Stan lokalny potwierdzony"}
                      </span>
                    </div>
                  </li>
                  <li className="current">
                    <i />
                    <div>
                      <strong>
                        {capture.processingState === "routed_as_task"
                          ? "Utworzono zadanie"
                          : capture.processingState ===
                              "routed_as_knowledge_source"
                            ? "Utworzono źródło wiedzy"
                            : capture.processingState === "needs_review"
                              ? "Wymaga decyzji w Attention"
                              : capture.processingState ===
                                  "awaiting_transcript"
                                ? "Oczekuje na transkrypcję agenta"
                                : capture.processingState === "transcript_ready"
                                  ? capture.audioState === "retained"
                                    ? "Transkrypcja gotowa · audio zachowane"
                                    : capture.audioState === "deleted"
                                      ? "Transkrypcja gotowa · audio usunięte"
                                      : "Transkrypcja gotowa · usuwanie audio"
                                  : capture.processingState === "unclassified"
                                    ? "Zachowano bez klasyfikacji"
                                    : "Oczekuje na przetworzenie"}
                      </strong>
                      <span>
                        {capture.processingState === "transcript_ready"
                          ? capture.transcript.text
                          : capture.originalText}
                      </span>
                      {capture.processingState === "transcript_ready" && (
                        <small>
                          Zapis: {capture.transcript.writtenByKind} ·{" "}
                          {new Date(
                            capture.transcript.writtenAt,
                          ).toLocaleString("pl-PL")}
                          {capture.transcript.hostRunId
                            ? " · przebieg " + capture.transcript.hostRunId
                            : ""}
                        </small>
                      )}
                    </div>
                  </li>
                </ol>
                <footer>
                  <button
                    className="secondary-button"
                    disabled={routeActivity === undefined}
                    title={
                      routeActivity === undefined
                        ? "Brak odwracalnego polecenia dla tego Capture"
                        : undefined
                    }
                    onClick={() =>
                      routeActivity && onUndo(routeActivity.targetCommandId)
                    }
                  >
                    Podgląd cofnięcia
                  </button>
                  {capture.processingState === "transcript_ready" &&
                    capture.audioState === "retained" && (
                      <button
                        className="secondary-button"
                        disabled={busyCaptureId === capture.id}
                        onClick={() =>
                          onDeleteVoiceAudio(capture.id, capture.version)
                        }
                      >
                        {busyCaptureId === capture.id
                          ? "Usuwanie…"
                          : "Usuń zachowane audio"}
                      </button>
                    )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

const activityLabels: Record<
  ActivityProjection["items"][number]["activityType"],
  string
> = {
  capture_routed: "Capture przekształcono w zadanie",
  capture_transcript_ready: "Zapisano transkrypcję notatki głosowej",
  project_created: "Utworzono projekt",
  project_outcome_changed: "Zmieniono zamierzony wynik projektu",
  task_completed: "Ukończono zadanie",
  task_reopened: "Ponownie otwarto zadanie",
  task_assigned: "Przypisano odpowiedzialność za zadanie",
  task_unassigned: "Usunięto odpowiedzialność za zadanie",
  comment_added: "Dodano komentarz",
  comment_resolved: "Rozwiązano wątek komentarzy",
  comment_reopened: "Ponownie otwarto wątek komentarzy",
  relation_added: "Powiązano zadanie z projektem",
  relation_removed: "Usunięto powiązanie",
  knowledge_source_created: "Zachowano źródło wiedzy",
  knowledge_source_updated: "Zaktualizowano źródło wiedzy",
  knowledge_evidence_updated: "Zmieniono dowody dokumentu",
  knowledge_named_version_created: "Zamrożono nazwaną wersję",
  knowledge_named_version_voided: "Unieważniono nazwaną wersję",
  strategic_record_changed: "Zmieniono rekord strategiczny",
  command_undone: "Cofnięto polecenie",
};

export const ActivitySurface = ({
  activity,
  onUndo,
}: {
  readonly activity: DesktopSnapshot["activity"];
  readonly onUndo: (targetCommandId: CommandId) => void;
}) => (
  <div className="surface-scroll">
    <SurfaceHeader
      kicker="Znacząca aktywność"
      title="Historia pracy, nie log techniczny"
      description="Timeline pokazuje potwierdzone zmiany. Atrybucja i pełny receipt pozostają w audycie."
    />
    <section
      className="meaningful-timeline reading-panel"
      aria-labelledby="timeline-title"
    >
      <header className="section-heading">
        <div>
          <p className="eyebrow">Lokalny timeline</p>
          <h2 id="timeline-title">Ostatnie zmiany</h2>
        </div>
      </header>
      {activity.kind === "unavailable" ? (
        <InlineState
          title="Aktywność jest niedostępna"
          detail={activity.message}
        />
      ) : activity.data.items.length === 0 ? (
        <InlineState
          title="Nie ma jeszcze znaczących zmian"
          detail="Utworzenie projektu, routing Capture lub zmiana zadania pojawią się tutaj."
        />
      ) : (
        activity.data.items.map((item) => (
          <div className="activity-row" key={item.eventId}>
            <span className="actor-avatar actor-human">•</span>
            <span>
              <strong>{activityLabels[item.activityType]}</strong>
              <small>
                {new Date(item.occurredAt).toLocaleString("pl-PL")} · rekord{" "}
                {item.recordId.slice(0, 8)}
              </small>
            </span>
            <button
              className="ghost-button"
              onClick={() => onUndo(item.targetCommandId)}
            >
              Podgląd cofnięcia
            </button>
          </div>
        ))
      )}
    </section>
  </div>
);

export const SearchOverlay = ({
  client,
  snapshot,
  destinations,
  onClose,
  onOpenDestination,
  onNavigate,
}: {
  readonly client: ConstellationRendererClient;
  readonly snapshot: DesktopSnapshot;
  readonly destinations: readonly {
    readonly id: SurfaceId;
    readonly label: string;
  }[];
  readonly onClose: () => void;
  readonly onOpenDestination: (surface: SurfaceId, label: string) => void;
  readonly onNavigate: (surface: SurfaceId, recordId: string) => void;
}) => {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    | { readonly kind: "idle" | "loading" }
    | { readonly kind: "ready"; readonly data: SearchProjection }
    | { readonly kind: "error"; readonly message: string }
  >({ kind: "idle" });
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "loading" });
    let active = true;
    const timer = window.setTimeout(() => {
      void searchGlobal(client, snapshot, text)
        .then((data) => active && setState({ kind: "ready", data }))
        .catch(
          (error: unknown) =>
            active &&
            setState({
              kind: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Wyszukiwanie jest niedostępne.",
            }),
        );
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [client, query, snapshot]);
  const results = state.kind === "ready" ? state.data.items : [];
  const commandResults = destinations.filter((item) =>
    item.label
      .toLocaleLowerCase("pl-PL")
      .includes(query.trim().toLocaleLowerCase("pl-PL")),
  );
  const choose = (item: SearchProjection["items"][number] | undefined) => {
    if (!item) return;
    onNavigate(
      item.recordKind === "project"
        ? "projects"
        : item.recordKind === "task"
          ? "tasks"
          : item.recordKind === "capture"
            ? "history"
            : "documents",
      item.recordId,
    );
    onClose();
  };
  const chooseIndex = (index: number) => {
    const command = commandResults[index];
    if (command !== undefined) {
      onOpenDestination(command.id, command.label);
      onClose();
      return;
    }
    choose(results[index - commandResults.length]);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((value) =>
        Math.min(value + 1, commandResults.length + results.length - 1),
      );
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((value) => Math.max(value - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      chooseIndex(activeIndex);
    }
    if (event.key === "Escape") onClose();
  };
  return (
    <dialog
      ref={dialogRef}
      className="search-backdrop"
      aria-labelledby="search-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <section className="search-dialog">
        <h2 id="search-title" className="sr-only">
          Paleta poleceń i globalne wyszukiwanie
        </h2>
        <div className="search-query">
          <Mark kind="search" />
          <label className="sr-only" htmlFor="global-search">
            Otwórz widok albo szukaj projektów, zadań i Capture
          </label>
          <input
            id="global-search"
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Widok, projekt, zadanie, źródło…"
          />
          <kbd>Esc</kbd>
        </div>
        <p className="search-scope">
          Lokalny indeks · {snapshot.bootstrap.workspace.name} · dane bieżącego
          workspace
        </p>
        {state.kind === "idle" ? (
          <div
            className="search-results search-command-list"
            role="listbox"
            aria-label="Polecenia nawigacji"
          >
            <p>Otwórz widok</p>
            {commandResults.map((item, index) => (
              <button
                key={item.id}
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? "active" : ""}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseIndex(index)}
              >
                <Mark kind="command" />
                <span>
                  <strong>{item.label}</strong>
                  <small>Polecenie nawigacji</small>
                </span>
                <em>↵</em>
              </button>
            ))}
          </div>
        ) : state.kind === "loading" && commandResults.length === 0 ? (
          <div className="search-empty" aria-busy="true">
            <strong>Wyszukuję…</strong>
            <span>Sprawdzam projekty, zadania i Capture.</span>
          </div>
        ) : state.kind === "error" && commandResults.length === 0 ? (
          <div className="search-empty" role="alert">
            <strong>Wyszukiwanie jest niedostępne</strong>
            <span>{state.message}</span>
          </div>
        ) : results.length === 0 && commandResults.length === 0 ? (
          <div className="search-empty">
            <strong>Brak wyników dla „{query}”</strong>
            <span>Sprawdź pisownię albo wyszukaj szersze pojęcie.</span>
            <button className="secondary-button" onClick={() => setQuery("")}>
              Wyczyść zapytanie
            </button>
          </div>
        ) : (
          <div
            className="search-results"
            role="listbox"
            aria-label="Wyniki wyszukiwania"
          >
            {commandResults.map((item, index) => (
              <button
                key={`command:${item.id}`}
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? "active" : ""}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseIndex(index)}
              >
                <Mark kind="command" />
                <span>
                  <strong>{item.label}</strong>
                  <small>Polecenie nawigacji</small>
                </span>
                <em>↵</em>
              </button>
            ))}
            {results.map((item, index) => (
              <button
                key={`${item.recordKind}-${item.recordId}`}
                role="option"
                aria-selected={index + commandResults.length === activeIndex}
                className={
                  index + commandResults.length === activeIndex ? "active" : ""
                }
                onMouseEnter={() =>
                  setActiveIndex(index + commandResults.length)
                }
                onClick={() => choose(item)}
              >
                <Mark kind={item.recordKind} />
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.recordKind} · {item.snippet}
                  </small>
                </span>
                <em>{item.score}</em>
              </button>
            ))}
          </div>
        )}
        <footer>
          <span>↑↓ wybierz</span>
          <span>↵ otwórz</span>
          <span>Esc zamknij</span>
        </footer>
      </section>
    </dialog>
  );
};

const compensationCopy: Record<string, string> = {
  "project.restore_outcome": "Przywrócenie poprzedniego wyniku projektu",
  "task.restore_state": "Przywrócenie poprzedniego stanu zadania",
  "task.restore_operational_state":
    "Przywrócenie poprzedniego stanu operacyjnego zadania",
  "work_link.restore_state": "Przywrócenie poprzedniego powiązania pracy",
  "relation.remove": "Usunięcie dodanej relacji",
  "relation.restore": "Przywrócenie usuniętej relacji",
  "capture.undo_route": "Cofnięcie uporządkowania Capture",
  "capture.undo_knowledge_route": "Cofnięcie skierowania Capture do wiedzy",
  "knowledge.restore_source": "Przywrócenie poprzedniego źródła",
  "knowledge.restore_evidence": "Przywrócenie poprzedniego zestawu dowodów",
  "knowledge.void_named_version": "Unieważnienie nazwanej wersji",
};

const unavailableReasonCopy: Record<string, string> = {
  unsupported: "To polecenie nie obsługuje cofnięcia",
  already_undone: "To polecenie zostało już cofnięte",
  later_change: "Późniejsza zmiana blokuje bezpieczne cofnięcie",
};

export const UndoDialog = ({
  preview,
  busy,
  onClose,
  onConfirm,
}: {
  readonly preview: UndoPreview;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const available =
    preview.recovery.available && preview.command.projection.available;
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="undo-backdrop"
      aria-labelledby="undo-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <section className="undo-dialog">
        <header>
          <div>
            <p className="eyebrow">Podgląd cofnięcia</p>
            <h2 id="undo-title">
              {available ? "Cofnij tę zmianę?" : "Tej zmiany nie można cofnąć"}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Zamknij podgląd cofnięcia"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <dl>
          <div>
            <dt>Polecenie</dt>
            <dd className="mono">{preview.targetCommandId.slice(0, 18)}…</dd>
          </div>
          <div>
            <dt>Wpływ</dt>
            <dd>{preview.recovery.affectedRecordIds.length} rekordów</dd>
          </div>
          <div>
            <dt>Kompensacja</dt>
            <dd>
              {preview.recovery.compensationKind !== undefined
                ? (compensationCopy[preview.recovery.compensationKind] ??
                  "Przywrócenie poprzedniego stanu")
                : preview.recovery.unavailableReason !== undefined
                  ? (unavailableReasonCopy[
                      preview.recovery.unavailableReason
                    ] ?? "Niedostępna")
                  : "Niedostępna"}
            </dd>
          </div>
        </dl>
        <div className="undo-safety">
          <Mark kind={available ? "recovery" : "warning"} />
          <span>
            <strong>
              {available
                ? "Wersje są zgodne"
                : "Stan zmienił się od czasu polecenia"}
            </strong>
            <small>
              {available
                ? "Cofnięcie zapisze osobne, audytowalne polecenie."
                : "Nie wykonano żadnej zmiany."}
            </small>
          </span>
        </div>
        <footer>
          <button
            ref={cancelRef}
            className="ghost-button"
            disabled={busy}
            onClick={onClose}
          >
            Anuluj
          </button>
          <button
            className="primary-button"
            disabled={!available || busy}
            onClick={onConfirm}
          >
            {busy ? "Cofam…" : "Cofnij zmianę"}
          </button>
        </footer>
      </section>
    </dialog>
  );
};

export const failureMessage = (failure: MutationFailure): string =>
  failure.message;
