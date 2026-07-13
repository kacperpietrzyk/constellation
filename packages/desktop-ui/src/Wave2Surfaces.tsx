import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { TaskId } from "@constellation/contracts";

import type { DesktopSnapshot } from "./client/workflow.js";
import {
  activity,
  buildSearchFixtures,
  projects,
  type ActivityFixture,
  type SearchFixture,
  type SurfaceId,
} from "./client/wave2-fixtures.js";

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

export const CockpitSurface = ({
  snapshot,
  onOpenProject,
  onSelectTask,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly onOpenProject: () => void;
  readonly onSelectTask: (id: TaskId) => void;
}) => {
  const realTasks = snapshot.tasks.slice(0, 3);
  return (
    <div className="surface-scroll cockpit-surface">
      <SurfaceHeader
        kicker="Tydzień 29 · 13–19 lipca"
        title="Dziś prowadzi jeden wynik"
        description="Deterministyczny widok lokalnych terminów, priorytetów i wyjątków. Bez generowanych rekomendacji."
      />
      <section className="now-panel" aria-labelledby="now-title">
        <div className="now-copy">
          <p className="eyebrow">Teraz · 10:45–12:15</p>
          <h2 id="now-title">Oferta gotowa do decyzji handlowej</h2>
          <p>
            Najbliższy termin przypada w piątek, a model cenowy pozostaje jedyną
            jawną blokadą wyniku.
          </p>
          <div className="reason-line" aria-label="Powody priorytetu">
            <span>Termin w tym tygodniu</span>
            <span>Aktywny projekt</span>
            <span>1 blokada</span>
          </div>
        </div>
        <button className="primary-button" onClick={onOpenProject}>
          Otwórz projekt
        </button>
      </section>

      <div className="cockpit-grid">
        <section
          className="outcome-rail reading-panel"
          aria-labelledby="outcomes-title"
        >
          <header className="section-heading">
            <div>
              <p className="eyebrow">Wyniki tygodnia</p>
              <h2 id="outcomes-title">Dwa aktywne kierunki</h2>
            </div>
            <span>2 projekty</span>
          </header>
          {projects.map((project, index) => (
            <button
              className={`outcome-row ${index === 0 ? "selected" : ""}`}
              key={project.id}
              onClick={onOpenProject}
            >
              <span className="outcome-number">0{index + 1}</span>
              <span>
                <strong>{project.outcome}</strong>
                <small>{project.nextAction}</small>
              </span>
              <em>{project.deadline}</em>
            </button>
          ))}
        </section>

        <section
          className="capacity-panel reading-panel"
          aria-labelledby="capacity-title"
        >
          <header className="section-heading">
            <div>
              <p className="eyebrow">Pojemność</p>
              <h2 id="capacity-title">Najbliższe spokojne okno</h2>
            </div>
            <span>14:00–15:30</span>
          </header>
          <div className="week-strip" aria-label="Obciążenie dni tygodnia">
            {[
              ["Pon", "3h", 64],
              ["Wt", "5h", 86],
              ["Śr", "2h", 42],
              ["Czw", "4h", 72],
              ["Pt", "3h", 58],
            ].map(([day, label, value]) => (
              <div key={day as string}>
                <span>{day}</span>
                <i
                  style={
                    { "--load": `${String(value)}%` } as React.CSSProperties
                  }
                />
                <small>{label}</small>
              </div>
            ))}
          </div>
          <p className="capacity-note">
            Dziś: 2 spotkania · 1 blok pracy · 90 min bez fragmentacji
          </p>
        </section>
      </div>

      <section
        className="active-work reading-panel"
        aria-labelledby="active-work-title"
      >
        <header className="section-heading">
          <div>
            <p className="eyebrow">Aktywna praca</p>
            <h2 id="active-work-title">Następne działania</h2>
          </div>
          <span>{Math.max(realTasks.length, 3)} w kolejności</span>
        </header>
        <div className="compact-record-list">
          {(realTasks.length > 0
            ? realTasks
            : [
                {
                  id: "fixture-1",
                  title: "Uzupełnij model cenowy",
                  status: { label: "W toku" },
                },
                {
                  id: "fixture-2",
                  title: "Zsyntetyzuj wywiady kwalifikacyjne",
                  status: { label: "Zaplanowane" },
                },
                {
                  id: "fixture-3",
                  title: "Sprawdź warunki odnowienia",
                  status: { label: "Oczekuje" },
                },
              ]
          ).map((task, index) => (
            <button
              key={task.id}
              onClick={() => {
                if (realTasks.length > 0) onSelectTask(task.id as TaskId);
              }}
            >
              <Mark kind="task" />
              <span>
                <strong>{task.title}</strong>
                <small>
                  {index === 0 ? "Oferta Northstar · dziś" : "Root Space"}
                </small>
              </span>
              <em>{task.status.label}</em>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export const TasksSurface = ({
  snapshot,
  selectedTaskId,
  onSelectTask,
  onCapture,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly selectedTaskId: TaskId | undefined;
  readonly onSelectTask: (id: TaskId) => void;
  readonly onCapture: () => void;
}) => (
  <div className="surface-scroll">
    <SurfaceHeader
      kicker="Root Space · lokalny widok"
      title="Zadania"
      description="Przechwycone działania i ich zachowane źródła."
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
        <div className="empty-state">
          <span className="empty-glyph">
            <Mark kind="task" />
          </span>
          <div>
            <h3>Jeszcze nie ma zadań</h3>
            <p>
              Zapisz pierwszą myśl. Oryginał pozostanie powiązany z wynikiem
              routingu.
            </p>
          </div>
          <button className="secondary-button" onClick={onCapture}>
            Otwórz Quick Capture
          </button>
        </div>
      ) : (
        <div className="task-list">
          {snapshot.tasks.map((task) => (
            <button
              key={task.id}
              className={`task-row ${task.id === selectedTaskId ? "selected" : ""}`}
              onClick={() => onSelectTask(task.id)}
              aria-pressed={task.id === selectedTaskId}
            >
              <span className="task-check" aria-hidden="true" />
              <span className="task-copy">
                <strong>{task.title}</strong>
                <span>
                  {task.sourceCaptureId
                    ? "Z Quick Capture · oryginał zachowany"
                    : "Root Space"}
                </span>
              </span>
              <span className="task-status">{task.status.label}</span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}
    </section>
  </div>
);

export const ProjectsSurface = ({
  relationAdded,
  onRelate,
}: {
  readonly relationAdded: boolean;
  readonly onRelate: () => void;
}) => {
  const project = projects[0]!;
  return (
    <div className="surface-scroll project-surface">
      <SurfaceHeader
        kicker="Projekt · aktywny"
        title={project.title}
        description="Operacyjny przegląd wyniku, następnego działania i ryzyka."
        action={<button className="secondary-button">Edytuj wynik</button>}
      />
      <section className="project-overview" aria-labelledby="project-outcome">
        <div className="overview-intent">
          <p className="eyebrow">Oczekiwany wynik</p>
          <h2 id="project-outcome">{project.outcome}</h2>
          <p>Jeden wariant zakresu, kosztu i odpowiedzialności partnerów.</p>
        </div>
        <dl className="overview-facts">
          <div>
            <dt>Stan</dt>
            <dd>{project.state}</dd>
          </div>
          <div>
            <dt>Następna akcja</dt>
            <dd>{project.nextAction}</dd>
          </div>
          <div>
            <dt>Najbliższy termin</dt>
            <dd>{project.deadline}</dd>
          </div>
        </dl>
        <div className="overview-attention" role="note">
          <Mark kind="warning" />
          <div>
            <p className="eyebrow">Ryzyko</p>
            <strong>Brak cennika dystrybutora</strong>
            <span>{project.risk}</span>
          </div>
          <button className="ghost-button">Otwórz zależność</button>
        </div>
      </section>
      <section
        className="project-work reading-panel"
        aria-labelledby="project-work-title"
      >
        <header className="section-heading">
          <div>
            <p className="eyebrow">Powiązana praca</p>
            <h2 id="project-work-title">Zadania projektu</h2>
          </div>
          <button className="secondary-button compact" onClick={onRelate}>
            Powiąż zadanie
          </button>
        </header>
        <div className="compact-record-list">
          {[
            ...project.taskTitles,
            ...(relationAdded ? ["Sprawdź warunki odnowienia"] : []),
          ].map((title, index) => (
            <button key={title}>
              <Mark kind="task" />
              <span>
                <strong>{title}</strong>
                <small>
                  {index === 0 ? "Dziś · wysoki priorytet" : "Root Space"}
                </small>
              </span>
              <em>{index === 0 ? "W toku" : "Zaplanowane"}</em>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export const HistorySurface = ({
  snapshot,
  onUndo,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly onUndo: () => void;
}) => {
  const captures =
    snapshot.captures.length > 0
      ? snapshot.captures
      : [
          {
            id: "fixture-capture",
            originalText: "Sprawdź warunki odnowienia",
            processingState: "routed_as_task" as const,
            capturedAt: "2026-07-13T09:18:02.000Z",
          },
        ];
  return (
    <div className="surface-scroll">
      <SurfaceHeader
        kicker="Capture History"
        title="Każdy oryginał ma dalszy ślad"
        description="Udane przetworzenie nie zajmuje skrzynki uwagi, ale pozostaje sprawdzalne i odwracalne."
      />
      <div className="history-grid">
        {captures.map((capture) => (
          <article className="history-card" key={capture.id}>
            <header>
              <Mark kind="capture" />
              <div>
                <p className="eyebrow">Oryginał · Quick Capture</p>
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
                  <span>Stan lokalny potwierdzony</span>
                </div>
              </li>
              <li className="done">
                <i />
                <div>
                  <strong>Rozpoznano jawny zamiar</strong>
                  <span>Deterministyczna reguła routingu</span>
                </div>
              </li>
              <li className="current">
                <i />
                <div>
                  <strong>
                    {capture.processingState === "routed_as_task"
                      ? "Utworzono zadanie"
                      : "Oczekuje na decyzję"}
                  </strong>
                  <span>{capture.originalText}</span>
                </div>
              </li>
            </ol>
            <footer>
              <button className="ghost-button">Otwórz wynik</button>
              <button className="secondary-button" onClick={onUndo}>
                Podgląd cofnięcia
              </button>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
};

const ActivityRow = ({
  item,
  undone,
  onUndo,
}: {
  readonly item: ActivityFixture;
  readonly undone: boolean;
  readonly onUndo: (item: ActivityFixture) => void;
}) => (
  <div className={`activity-row ${undone ? "undone" : ""}`}>
    <span className={`actor-avatar actor-${item.actor}`}>
      {item.actor === "human" ? "KN" : item.actor === "agent" ? "A" : "↗"}
    </span>
    <span>
      <strong>{undone ? `Cofnięto: ${item.title}` : item.title}</strong>
      <small>
        {item.time} · {item.detail}
      </small>
    </span>
    <button
      className="ghost-button"
      disabled={!item.reversible || undone}
      onClick={() => onUndo(item)}
    >
      {undone ? "Cofnięte" : item.reversible ? "Zobacz zmiany" : "Otwórz"}
    </button>
  </div>
);

export const ActivitySurface = ({
  undoneActivityId,
  onUndo,
}: {
  readonly undoneActivityId: string | undefined;
  readonly onUndo: (item: ActivityFixture) => void;
}) => (
  <div className="surface-scroll">
    <SurfaceHeader
      kicker="Znacząca aktywność"
      title="Historia pracy, nie log techniczny"
      description="Codzienny timeline mówi, co zmieniło się w pracy. Pełny receipt pozostaje obok."
    />
    <div className="activity-layout">
      <section
        className="meaningful-timeline reading-panel"
        aria-labelledby="timeline-title"
      >
        <header className="section-heading">
          <div>
            <p className="eyebrow">Timeline człowieka</p>
            <h2 id="timeline-title">Dzisiaj</h2>
          </div>
          <button className="ghost-button">Pełny audyt</button>
        </header>
        {activity.map((item) => (
          <ActivityRow
            key={item.id}
            item={item}
            undone={undoneActivityId === item.id}
            onUndo={onUndo}
          />
        ))}
      </section>
      <aside className="deep-audit" aria-labelledby="audit-title">
        <p className="eyebrow">Pełny ślad</p>
        <h2 id="audit-title">Ostatni receipt</h2>
        <code>record.relate · version 18 → 19</code>
        <code>actor user_KN · grant owner_local</code>
        <code>corr_81B2 · checkpoint cp_07</code>
        <p>Zmiana jest atrybuowalna, wersjonowana i odwracalna.</p>
      </aside>
    </div>
  </div>
);

export const SearchOverlay = ({
  snapshot,
  onClose,
  onNavigate,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly onClose: () => void;
  readonly onNavigate: (surface: SurfaceId) => void;
}) => {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const allResults = useMemo(() => buildSearchFixtures(snapshot), [snapshot]);
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pl");
    return normalized.length === 0
      ? allResults.slice(0, 5)
      : allResults.filter((item) =>
          `${item.title} ${item.detail} ${item.kind}`
            .toLocaleLowerCase("pl")
            .includes(normalized),
        );
  }, [allResults, query]);
  const choose = (item: SearchFixture | undefined) => {
    if (item) {
      onNavigate(item.surface);
      onClose();
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((value) => Math.min(value + 1, results.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((value) => Math.max(value - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      choose(results[activeIndex]);
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
          Globalne wyszukiwanie
        </h2>
        <div className="search-query">
          <Mark kind="search" />
          <label className="sr-only" htmlFor="global-search">
            Szukaj projektów, zadań i Capture
          </label>
          <input
            id="global-search"
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Projekt, zadanie, źródło…"
          />
          <kbd>Esc</kbd>
        </div>
        <p className="search-scope">
          Lokalny indeks · {snapshot.bootstrap.workspace.name} · dane
          syntetyczne i bieżąca sesja
        </p>
        {results.length === 0 ? (
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
            {results.map((item, index) => (
              <button
                key={`${item.kind}-${item.id}`}
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? "active" : ""}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(item)}
              >
                <Mark kind={item.kind.toLocaleLowerCase("pl")} />
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.kind} · {item.detail}
                  </small>
                </span>
                <em>{item.group}</em>
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

export const UndoDialog = ({
  item,
  onClose,
  onConfirm,
}: {
  readonly item: ActivityFixture;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
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
        onClose();
      }}
    >
      <section className="undo-dialog">
        <header>
          <div>
            <p className="eyebrow">Podgląd cofnięcia</p>
            <h2 id="undo-title">Cofnij tę zmianę?</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Zamknij podgląd cofnięcia"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p className="undo-summary">{item.title}</p>
        <dl>
          <div>
            <dt>Polecenie</dt>
            <dd>{item.command}</dd>
          </div>
          <div>
            <dt>Wersje</dt>
            <dd>{item.version}</dd>
          </div>
          <div>
            <dt>Wpływ</dt>
            <dd>
              Usunięte zostanie jedno powiązanie. Rekordy pozostaną zachowane.
            </dd>
          </div>
        </dl>
        <div className="undo-safety">
          <Mark kind="recovery" />
          <span>
            <strong>Bezpieczne do natychmiastowego cofnięcia</strong>
            <small>Preview nie wykrył późniejszych zmian zależnych.</small>
          </span>
        </div>
        <footer>
          <button ref={cancelRef} className="ghost-button" onClick={onClose}>
            Anuluj
          </button>
          <button className="primary-button" onClick={onConfirm}>
            Cofnij zmianę
          </button>
        </footer>
      </section>
    </dialog>
  );
};
