import { useMemo, useState, type FormEvent } from "react";

import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  createArea,
  createInitiative,
  createSavedWorkView,
  createWorkLink,
  setTaskOperationalState,
  type DesktopSnapshot,
  type MutationFailure,
} from "./client/workflow.js";

const stateLabel = {
  actionable: "Do działania",
  waiting: "Czekam na",
  blocked: "Zablokowane",
} as const;

const WorkEmpty = ({
  title,
  detail,
}: {
  readonly title: string;
  readonly detail: string;
}) => (
  <div className="work-empty" role="status">
    <span className="empty-glyph" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <path d="M5 12h14" />
      </svg>
    </span>
    <div>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  </div>
);

export const WorkSurface = ({
  client,
  snapshot,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const work = snapshot.work;
  const [busy, setBusy] = useState(false);
  const [waitingDraft, setWaitingDraft] = useState<Record<string, string>>({});
  const projection = work.kind === "ready" ? work.data : undefined;
  const activeLinks =
    projection?.links.filter((link) => link.state === "active") ?? [];
  const projectContext = useMemo(
    () =>
      new Map(
        activeLinks
          .filter((link) => link.linkType !== "task_depends_on_task")
          .map((link) => [
            link.sourceRecordId,
            link.linkType === "project_advances_initiative"
              ? projection?.initiatives.find(
                  (initiative) => initiative.id === link.targetRecordId,
                )?.title
              : projection?.areas.find(
                  (area) => area.id === link.targetRecordId,
                )?.title,
          ]),
      ),
    [activeLinks, projection],
  );

  const run = async (operation: () => Promise<{ readonly kind: string }>) => {
    if (busy) return;
    setBusy(true);
    const result = await operation();
    setBusy(false);
    if (result.kind === "success") await onReload();
    else onFailure(result as MutationFailure);
  };

  if (projection === undefined) {
    return (
      <div className="surface-scroll work-surface">
        <header className="surface-header wave2-header">
          <div>
            <p className="eyebrow">Model pracy</p>
            <h1 id="surface-title">Praca</h1>
            <p>Odpowiedzialność, wyniki i następne działania w jednym wątku.</p>
          </div>
        </header>
        <WorkEmpty
          title="Widok pracy jest niedostępny"
          detail={
            work.kind === "unavailable" ? work.message : "Spróbuj ponownie."
          }
        />
      </div>
    );
  }

  const submitArea = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    const responsibility = String(data.get("responsibility") ?? "").trim();
    if (!client || !title || !responsibility) return;
    void run(() => createArea(client, snapshot, title, responsibility));
    event.currentTarget.reset();
  };
  const submitInitiative = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    const outcome = String(data.get("outcome") ?? "").trim();
    if (!client || !title || !outcome) return;
    void run(() => createInitiative(client, snapshot, title, outcome));
    event.currentTarget.reset();
  };
  const submitView = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const state = String(data.get("state") ?? "actionable") as
      "actionable" | "waiting" | "blocked";
    if (!client || !name) return;
    void run(() => createSavedWorkView(client, snapshot, name, [state]));
    event.currentTarget.reset();
  };
  const submitProjectLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const projectId = String(data.get("projectId") ?? "");
    const target = String(data.get("target") ?? "");
    const [kind, targetId] = target.split(":");
    if (!client || !projectId || !targetId) return;
    void run(() =>
      createWorkLink(
        client,
        snapshot,
        kind === "initiative"
          ? "project_advances_initiative"
          : "project_serves_area",
        projectId,
        targetId,
      ),
    );
  };
  const submitDependency = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const taskId = String(data.get("taskId") ?? "");
    const dependencyId = String(data.get("dependencyId") ?? "");
    if (!client || !taskId || !dependencyId || taskId === dependencyId) return;
    void run(() =>
      createWorkLink(
        client,
        snapshot,
        "task_depends_on_task",
        taskId,
        dependencyId,
      ),
    );
  };

  return (
    <div className="surface-scroll work-surface">
      <header className="surface-header wave2-header work-header">
        <div>
          <p className="eyebrow">Obszar → inicjatywa → projekt → działanie</p>
          <h1 id="surface-title">Praca</h1>
          <p>
            Trwała odpowiedzialność jest oddzielona od wyniku do osiągnięcia.
            Zadania pokazują, co można zrobić teraz, a co czeka albo jest
            blokowane.
          </p>
        </div>
        <span className="work-freshness">
          {projection.freshness.mode === "local_authoritative"
            ? "Lokalne źródło prawdy"
            : "Projekcja zsynchronizowana"}
        </span>
      </header>

      <nav className="saved-view-strip" aria-label="Zapisane widoki pracy">
        <span>Widoki</span>
        {projection.savedViews.length === 0 ? (
          <em>Jeszcze bez zapisanych filtrów</em>
        ) : (
          projection.savedViews.map((view) => (
            <button type="button" key={view.id} className="view-chip">
              {view.name}
            </button>
          ))
        )}
        <details className="work-inline-create">
          <summary>Zapisz widok</summary>
          <form onSubmit={submitView}>
            <input
              name="name"
              aria-label="Nazwa widoku"
              placeholder="Moje oczekujące"
              required
            />
            <select name="state" aria-label="Stan zadań">
              <option value="actionable">Do działania</option>
              <option value="waiting">Czekam na</option>
              <option value="blocked">Zablokowane</option>
            </select>
            <button disabled={busy || !client}>Zapisz</button>
          </form>
        </details>
      </nav>

      <div className="work-thread">
        <section
          className="work-context-column"
          aria-labelledby="work-context-title"
        >
          <div className="work-section-heading">
            <div>
              <h2 id="work-context-title">Kontekst odpowiedzialności</h2>
            </div>
            <span>
              {projection.areas.length + projection.initiatives.length}
            </span>
          </div>
          {projection.areas.map((area) => (
            <article className="work-context-row area-row" key={area.id}>
              <span className="work-node" aria-hidden="true">
                A
              </span>
              <div>
                <small>Obszar odpowiedzialności</small>
                <h3>{area.title}</h3>
                <p>{area.responsibility}</p>
              </div>
            </article>
          ))}
          {projection.initiatives.map((initiative) => (
            <article
              className="work-context-row initiative-row"
              key={initiative.id}
            >
              <span className="work-node" aria-hidden="true">
                I
              </span>
              <div>
                <small>Inicjatywa · wynik do zamknięcia</small>
                <h3>{initiative.title}</h3>
                <p>{initiative.intendedOutcome}</p>
              </div>
            </article>
          ))}
          {projection.areas.length + projection.initiatives.length === 0 && (
            <WorkEmpty
              title="Brak kontekstu pracy"
              detail="Dodaj trwały Obszar albo Inicjatywę z konkretnym wynikiem."
            />
          )}
          <div className="work-create-pair">
            <details>
              <summary>Dodaj Obszar</summary>
              <form onSubmit={submitArea}>
                <input
                  name="title"
                  aria-label="Nazwa obszaru"
                  placeholder="np. Relacje z klientami"
                  required
                />
                <textarea
                  name="responsibility"
                  aria-label="Stała odpowiedzialność obszaru"
                  placeholder="Za co stale odpowiadasz?"
                  required
                />
                <button disabled={busy || !client}>Dodaj</button>
              </form>
            </details>
            <details>
              <summary>Dodaj Inicjatywę</summary>
              <form onSubmit={submitInitiative}>
                <input
                  name="title"
                  aria-label="Nazwa inicjatywy"
                  placeholder="np. Interaktywna alfa"
                  required
                />
                <textarea
                  name="outcome"
                  aria-label="Oczekiwany wynik inicjatywy"
                  placeholder="Jaki wynik pozwoli ją zamknąć?"
                  required
                />
                <button disabled={busy || !client}>Dodaj</button>
              </form>
            </details>
          </div>
        </section>

        <section
          className="work-delivery-column"
          aria-labelledby="work-delivery-title"
        >
          <div className="work-section-heading">
            <div>
              <h2 id="work-delivery-title">Projekty i następne działania</h2>
            </div>
            <span>
              {projection.projects.length} / {projection.tasks.length}
            </span>
          </div>
          {projection.projects.map((project) => (
            <article className="work-project-row" key={project.id}>
              <span className="work-branch" aria-hidden="true" />
              <div>
                <small>
                  {projectContext.get(project.id) ??
                    "Projekt bez przypisanego kontekstu"}
                </small>
                <h3>{project.title}</h3>
                <p>{project.intendedOutcome}</p>
              </div>
            </article>
          ))}
          {projection.projects.length === 0 && (
            <WorkEmpty
              title="Brak projektów"
              detail="Projekt powinien prowadzić do jednego sprawdzalnego wyniku."
            />
          )}
          <div className="work-task-list" aria-label="Następne działania">
            {projection.tasks.map((task) => {
              const dependency = activeLinks.find(
                (link) =>
                  link.linkType === "task_depends_on_task" &&
                  link.sourceRecordId === task.id,
              );
              const dependencyTitle = projection.tasks.find(
                (item) => item.id === dependency?.targetRecordId,
              )?.title;
              return (
                <article
                  className={`work-task-row state-${task.operationalState}`}
                  key={task.id}
                >
                  <span className="task-state-mark" aria-hidden="true" />
                  <div className="work-task-copy">
                    <h3>{task.title}</h3>
                    <p>
                      {task.waitingOn?.label ??
                        (dependencyTitle
                          ? `Zależy od: ${dependencyTitle}`
                          : "Gotowe do podjęcia")}
                    </p>
                  </div>
                  <details className="task-state-menu">
                    <summary>{stateLabel[task.operationalState]}</summary>
                    <div className="task-state-actions">
                      <button
                        type="button"
                        disabled={busy || !client}
                        onClick={() =>
                          client &&
                          void run(() =>
                            setTaskOperationalState(
                              client,
                              snapshot,
                              task,
                              "actionable",
                            ),
                          )
                        }
                      >
                        Do działania
                      </button>
                      <input
                        value={
                          waitingDraft[task.id] ?? task.waitingOn?.label ?? ""
                        }
                        onChange={(event) =>
                          setWaitingDraft((current) => ({
                            ...current,
                            [task.id]: event.target.value,
                          }))
                        }
                        placeholder="Na kogo lub co czekasz?"
                        aria-label={`Powód oczekiwania: ${task.title}`}
                      />
                      <button
                        type="button"
                        disabled={
                          busy ||
                          !client ||
                          !(
                            waitingDraft[task.id] ?? task.waitingOn?.label
                          )?.trim()
                        }
                        onClick={() =>
                          client &&
                          void run(() =>
                            setTaskOperationalState(
                              client,
                              snapshot,
                              task,
                              "waiting",
                              waitingDraft[task.id] ?? task.waitingOn?.label,
                            ),
                          )
                        }
                      >
                        Ustaw oczekiwanie
                      </button>
                      <button
                        type="button"
                        disabled={busy || !client}
                        onClick={() =>
                          client &&
                          void run(() =>
                            setTaskOperationalState(
                              client,
                              snapshot,
                              task,
                              "blocked",
                            ),
                          )
                        }
                      >
                        Zablokowane
                      </button>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
          {projection.tasks.length === 0 && (
            <WorkEmpty
              title="Brak następnych działań"
              detail="Quick Capture utworzy zadanie bez wymagania klasyfikacji na wejściu."
            />
          )}
          <div className="work-link-tools">
            <details>
              <summary>Przypisz projekt do kontekstu</summary>
              <form onSubmit={submitProjectLink}>
                <select name="projectId" required aria-label="Projekt">
                  <option value="">Wybierz projekt</option>
                  {projection.projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <select
                  name="target"
                  required
                  aria-label="Obszar lub inicjatywa"
                >
                  <option value="">Wybierz kontekst</option>
                  {projection.initiatives.map((item) => (
                    <option key={item.id} value={`initiative:${item.id}`}>
                      Inicjatywa · {item.title}
                    </option>
                  ))}
                  {projection.areas.map((item) => (
                    <option key={item.id} value={`area:${item.id}`}>
                      Obszar · {item.title}
                    </option>
                  ))}
                </select>
                <button disabled={busy || !client}>Połącz</button>
              </form>
            </details>
            <details>
              <summary>Dodaj zależność zadań</summary>
              <form onSubmit={submitDependency}>
                <select name="taskId" required aria-label="Zadanie zależne">
                  <option value="">Zadanie zależne</option>
                  {projection.tasks.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <select
                  name="dependencyId"
                  required
                  aria-label="Zadanie wymagane"
                >
                  <option value="">Wymaga zadania</option>
                  {projection.tasks.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <button disabled={busy || !client}>Dodaj zależność</button>
              </form>
            </details>
          </div>
        </section>
      </div>
    </div>
  );
};
