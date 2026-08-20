import { useEffect, useRef, useState, type FormEvent } from "react";

import type {
  ProjectId,
  SpaceId,
  StrategicRecordId,
} from "@constellation/contracts";

import styles from "./project-create-classifier.module.css";

export type ProjectCreateKind =
  "project" | "task" | "area" | "initiative" | "opportunity" | "capture";

export interface SimilarProjectCandidate {
  readonly projectId: ProjectId;
  readonly spaceId: SpaceId;
  readonly title: string;
  readonly lifecycle: "active" | "closed";
  readonly version: number;
  readonly matchedOn: readonly ("title" | "client" | "area" | "initiative")[];
}

export type SimilarCandidatesState =
  | {
      readonly kind: "ready";
      readonly items: readonly SimilarProjectCandidate[];
    }
  | { readonly kind: "unavailable"; readonly message: string };

export interface ProjectCreateClassifierProps {
  readonly busy: boolean;
  readonly spaceId?: SpaceId;
  readonly projects: readonly {
    readonly id: ProjectId;
    readonly spaceId: SpaceId;
    readonly title: string;
    readonly lifecycle: "active" | "closed";
    readonly version: number;
  }[];
  readonly organizations: readonly {
    readonly id: StrategicRecordId;
    readonly name: string;
  }[];
  readonly contexts?: readonly {
    readonly id: StrategicRecordId;
    readonly kind: "area" | "initiative";
    readonly title: string;
  }[];
  readonly templates: readonly { readonly id: string; readonly name: string }[];
  readonly onCancel: () => void;
  readonly onOpenCapture: () => void;
  readonly onOpenProject: (projectId: ProjectId) => void;
  readonly onOpenExistingAuthoring: (
    kind: "area" | "initiative" | "opportunity",
  ) => void;
  readonly onCreateProject: (input: {
    readonly title: string;
    readonly intendedOutcome?: string;
    readonly templateId?: string;
  }) => Promise<boolean>;
  readonly onCreateTaskInProject: (input: {
    readonly projectId: ProjectId;
    readonly projectVersion: number;
    readonly spaceId: SpaceId;
    readonly title: string;
  }) => Promise<boolean>;
  readonly onLoadSimilarCandidates: (input: {
    readonly title: string;
    readonly spaceId?: SpaceId;
    readonly clientOrganizationIds?: readonly StrategicRecordId[];
    readonly contexts?: readonly {
      readonly kind: "area" | "initiative";
      readonly recordId: StrategicRecordId;
    }[];
  }) => Promise<SimilarCandidatesState>;
}

const TYPES = [
  ["project", "Project", "A bounded outcome with a finish line."],
  ["task", "Task", "One action inside an existing Project."],
  ["area", "Area", "A responsibility that continues."],
  ["initiative", "Initiative", "A finite outcome spanning Projects."],
  ["opportunity", "Opportunity", "A qualified commercial need."],
  ["capture", "Capture", "Keep the original now; classify it later."],
] as const satisfies readonly (readonly [ProjectCreateKind, string, string])[];

export const composeProjectIntendedOutcome = ({
  result,
  doneCriterion,
  outOfScope,
}: {
  readonly result: string;
  readonly doneCriterion: string;
  readonly outOfScope: string;
}): string | undefined => {
  const sections = [
    ["Result", result.trim()],
    ["Done criterion", doneCriterion.trim()],
    ["Out of scope", outOfScope.trim()],
  ].filter(([, body]) => body !== "");
  return sections.length === 0
    ? undefined
    : sections.map(([heading, body]) => `${heading}\n${body}`).join("\n\n");
};

export const projectOutcomeWarnings = (
  title: string,
  result: string,
  doneCriterion: string,
): readonly string[] => {
  const warnings: string[] = [];
  if (
    /^(status|update|progress|weekly|daily|waiting|blocked)\b/iu.test(
      title.trim(),
    )
  )
    warnings.push(
      "The title reads like a status update. A Project title should name the bounded outcome.",
    );
  if (result.trim() !== "" && result.trim().length < 24)
    warnings.push(
      "The result is brief. Add enough detail to distinguish this Project from a Task.",
    );
  if (doneCriterion.trim() !== "" && doneCriterion.trim().length < 24)
    warnings.push(
      "The done criterion is brief. Name the evidence that will prove completion.",
    );
  return warnings;
};

const value = (data: FormData, key: string): string =>
  String(data.get(key) ?? "").trim();

export const ProjectCreateClassifier = ({
  busy,
  spaceId,
  projects,
  organizations,
  contexts = [],
  templates,
  onCancel,
  onOpenCapture,
  onOpenProject,
  onOpenExistingAuthoring,
  onCreateProject,
  onCreateTaskInProject,
  onLoadSimilarCandidates,
}: ProjectCreateClassifierProps) => {
  const [kind, setKind] = useState<ProjectCreateKind>();
  const [taskProjectId, setTaskProjectId] = useState("");
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [similar, setSimilar] = useState<
    { readonly kind: "idle" | "loading" } | SimilarCandidatesState
  >({ kind: "idle" });
  const generation = useRef(0);
  const firstField = useRef<HTMLInputElement>(null);
  const projectForm = useRef<HTMLFormElement>(null);

  useEffect(() => {
    generation.current += 1;
    setSimilar({ kind: "idle" });
  }, [spaceId]);
  useEffect(() => firstField.current?.focus(), [kind]);

  const choose = (next: ProjectCreateKind) => {
    generation.current += 1;
    setSimilar({ kind: "idle" });
    if (next === "capture") {
      onCancel();
      onOpenCapture();
    } else if (
      next === "area" ||
      next === "initiative" ||
      next === "opportunity"
    ) {
      onCancel();
      onOpenExistingAuthoring(next);
    } else setKind(next);
  };
  const finish = (success: boolean) => success && onCancel();
  const formData = () => new FormData(projectForm.current ?? undefined);

  const checkSimilar = async () => {
    const data = formData();
    const title = value(data, "title");
    if (title === "") return;
    const request = ++generation.current;
    setSimilar({ kind: "loading" });
    const context = contexts.find(
      (item) => `${item.kind}:${item.id}` === value(data, "context"),
    );
    const clientId = value(data, "clientId");
    const result = await onLoadSimilarCandidates({
      title,
      ...(spaceId === undefined ? {} : { spaceId }),
      ...(clientId === ""
        ? {}
        : { clientOrganizationIds: [clientId as StrategicRecordId] }),
      ...(context === undefined
        ? {}
        : { contexts: [{ kind: context.kind, recordId: context.id }] }),
    }).catch((error: unknown) => ({
      kind: "unavailable" as const,
      message: error instanceof Error ? error.message : "Query unavailable.",
    }));
    if (generation.current === request) setSimilar(result);
  };

  const renderProject = () => (
    <form
      className={styles.form}
      onInput={(event) => {
        const target = event.target;
        if (!(
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ))
          return;
        if (target.name === "title") {
          generation.current += 1;
          setSimilar({ kind: "idle" });
        }
        const data = new FormData(event.currentTarget);
        setWarnings(
          projectOutcomeWarnings(
            value(data, "title"),
            value(data, "result"),
            value(data, "doneCriterion"),
          ),
        );
      }}
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) {
          generation.current += 1;
          setSimilar({ kind: "idle" });
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const title = value(data, "title");
        if (title === "") return;
        const intendedOutcome = composeProjectIntendedOutcome({
          result: value(data, "result"),
          doneCriterion: value(data, "doneCriterion"),
          outOfScope: value(data, "outOfScope"),
        });
        const templateId = value(data, "templateId");
        void onCreateProject({
          title,
          ...(intendedOutcome === undefined ? {} : { intendedOutcome }),
          ...(templateId === "" ? {} : { templateId }),
        }).then(finish);
      }}
      ref={projectForm}
    >
      <label>
        Project title
        <input
          aria-label="Project title"
          id="project-title"
          maxLength={160}
          name="title"
          ref={firstField}
          required
        />
      </label>
      {(
        [
          ["result", "Result", "Result (optional)"],
          ["doneCriterion", "Done criterion", "Done criterion (optional)"],
          ["outOfScope", "Out of scope", "Out of scope (optional)"],
        ] as const
      ).map(([name, label, ariaLabel]) => (
        <label key={name}>
          {label}
          <textarea
            aria-label={ariaLabel}
            id={name === "result" ? "project-outcome" : undefined}
            name={name}
          />
        </label>
      ))}
      {organizations.length > 0 && (
        <label>
          Client for similarity
          <select aria-label="Client for similarity (optional)" name="clientId">
            <option value="">No client token</option>
            {organizations.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {contexts.length > 0 && (
        <label>
          Context for similarity
          <select aria-label="Context for similarity (optional)" name="context">
            <option value="">No context token</option>
            {contexts.map(({ id, kind: contextKind, title }) => (
              <option key={id} value={`${contextKind}:${id}`}>
                {contextKind === "area" ? "Area" : "Initiative"} · {title}
              </option>
            ))}
          </select>
        </label>
      )}
      {templates.length > 0 && (
        <label>
          Starting template
          <select aria-label="Starting template (optional)" name="templateId">
            <option value="">No template</option>
            {templates.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {warnings.length > 0 && (
        <ul
          className={styles.warnings}
          aria-label="Project quality suggestions"
        >
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        <button
          disabled={busy || similar.kind === "loading"}
          onClick={() => void checkSimilar()}
          type="button"
        >
          {similar.kind === "loading"
            ? "Checking…"
            : "Check for similar projects"}
        </button>
        <button
          className="primary-button"
          data-project-submit
          disabled={busy}
          type="submit"
        >
          Create anyway
        </button>
      </div>
      {similar.kind === "ready" && similar.items.length === 0 && (
        <p className={styles.similarState} role="status">
          No similar authorized Project was found. Hidden records and totals are
          never shown.
        </p>
      )}
      {similar.kind === "unavailable" && (
        <p className={styles.similarState} role="status">
          Suggestions unavailable; this is not proof that no similar Project
          exists.
        </p>
      )}
      {similar.kind === "ready" && similar.items.length > 0 && (
        <div
          className={styles.candidates}
          aria-label="Similar authorized Projects"
        >
          {similar.items.map((candidate) => (
            <article
              data-similar-project={candidate.projectId}
              key={candidate.projectId}
            >
              <div>
                <strong>{candidate.title}</strong>
                <small>
                  {candidate.lifecycle === "closed" ? "Closed" : "Active"} ·
                  matched on {candidate.matchedOn.join(", ")}
                </small>
              </div>
              <div className={styles.actions}>
                <button
                  data-similar-action="open"
                  onClick={() => onOpenProject(candidate.projectId)}
                  type="button"
                >
                  Open existing
                </button>
                <button
                  data-similar-action="task"
                  disabled={candidate.lifecycle === "closed"}
                  onClick={() => {
                    setTaskProjectId(candidate.projectId);
                    setKind("task");
                  }}
                  type="button"
                >
                  Add task there
                </button>
                <button
                  data-similar-action="create"
                  disabled={busy}
                  type="submit"
                >
                  Create anyway
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </form>
  );

  const renderTask = () => (
    <form
      className={styles.form}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const project = projects.find(
          (item) => item.id === value(data, "projectId"),
        );
        const title = value(data, "title");
        if (project === undefined || title === "") return;
        void onCreateTaskInProject({
          projectId: project.id,
          projectVersion: project.version,
          spaceId: project.spaceId,
          title,
        }).then(finish);
      }}
    >
      <label>
        Existing Project
        <select
          aria-label="Existing Project"
          defaultValue={taskProjectId}
          name="projectId"
          required
        >
          <option value="">Choose Project</option>
          {projects
            .filter(
              (project) =>
                project.lifecycle === "active" &&
                project.spaceId === (spaceId ?? project.spaceId),
            )
            .map(({ id, title }) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
        </select>
      </label>
      <label>
        Task title
        <input aria-label="Task title" name="title" ref={firstField} required />
      </label>
      <button className="primary-button" disabled={busy} type="submit">
        Add task
      </button>
    </form>
  );

  return (
    <section
      aria-labelledby="project-create-classifier-title"
      className={styles.panel}
      data-project-create-classifier
      id="project-create-classifier"
    >
      <header className={styles.header}>
        <div>
          <h2 id="project-create-classifier-title">
            What are you trying to add?
          </h2>
          <p>
            Choose the role once. Capture remains available when you do not know
            yet.
          </p>
        </div>
        <button onClick={onCancel} type="button">
          Cancel
        </button>
      </header>
      <div className={styles.types} aria-label="Record type">
        {TYPES.map(([type, label, detail]) => (
          <button
            aria-pressed={kind === type}
            data-project-create-kind={type}
            key={type}
            onClick={() => choose(type)}
            type="button"
          >
            <strong>{label}</strong>
            <span>{detail}</span>
          </button>
        ))}
      </div>
      {kind === "project" && renderProject()}
      {kind === "task" && renderTask()}
    </section>
  );
};
