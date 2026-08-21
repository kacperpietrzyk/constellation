import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test, vi } from "vitest";

import {
  ProjectCreateClassifier,
  composeProjectIntendedOutcome,
  projectOutcomeWarnings,
  type ProjectCreateClassifierProps,
} from "../src/projects/ProjectCreateClassifier.js";

const PROJECT_A = {
  id: "00000000-0000-4000-8000-000000000701" as never,
  spaceId: "00000000-0000-4000-8000-000000000001" as never,
  title: "Northstar migration",
  lifecycle: "active" as const,
  version: 3,
};
const PROJECT_B = {
  id: "00000000-0000-4000-8000-000000000702" as never,
  spaceId: "00000000-0000-4000-8000-000000000001" as never,
  title: "Northstar migration readiness",
  lifecycle: "active" as const,
  version: 2,
};

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  if (mounted) {
    act(() => root.unmount());
    mounted = false;
  }
  container.remove();
});

const waitFor = async (condition: () => boolean, message: string) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await act(async () => void (await Promise.resolve()));
  }
  assert.fail(`${message}: ${container.textContent ?? ""}`);
};

const setValue = async (
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) => {
  await act(async () => {
    const prototype =
      field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : field instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
      field,
      value,
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const button = (name: string): HTMLButtonElement => {
  const found = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (candidate) =>
      (candidate.textContent ?? "").trim() === name ||
      (candidate.querySelector("strong")?.textContent ?? "").trim() === name,
  );
  assert.ok(found, `No button named ${name}`);
  return found;
};

const field = <
  T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
>(
  name: string,
): T => {
  const found = container.querySelector<T>(`[aria-label="${name}"]`);
  assert.ok(found, `No field named ${name}`);
  return found;
};

const baseProps = (
  over: Partial<ProjectCreateClassifierProps> = {},
): ProjectCreateClassifierProps => ({
  busy: false,
  projects: [PROJECT_A, PROJECT_B],
  organizations: [
    {
      id: "00000000-0000-4000-8000-000000000801" as never,
      name: "Northstar",
    },
  ],
  templates: [],
  onCancel: vi.fn(),
  onOpenCapture: vi.fn(),
  onOpenProject: vi.fn(),
  onCreateProject: vi.fn(async () => true),
  onCreateTaskInProject: vi.fn(async () => true),
  onOpenExistingAuthoring: vi.fn(),
  onLoadSimilarCandidates: vi.fn<
    ProjectCreateClassifierProps["onLoadSimilarCandidates"]
  >(async () => ({ kind: "ready", items: [] })),
  ...over,
});

const mount = async (props: ProjectCreateClassifierProps) => {
  root = createRoot(container);
  mounted = true;
  await act(async () =>
    root.render(createElement(ProjectCreateClassifier, props)),
  );
};

test("classifier offers exactly the six record roles and composes optional Project outcome sections", async () => {
  const onCreateProject = vi.fn<
    ProjectCreateClassifierProps["onCreateProject"]
  >(async () => true);
  await mount(baseProps({ onCreateProject }));

  const choices = [
    ...container.querySelectorAll<HTMLElement>("[data-project-create-kind]"),
  ].map((item) => item.dataset.projectCreateKind);
  assert.deepEqual(choices, [
    "project",
    "task",
    "area",
    "initiative",
    "opportunity",
    "capture",
  ]);

  await act(async () => button("Project").click());
  await setValue(field("Project title"), "Deliver Northstar migration");
  await setValue(
    field("Result (optional)"),
    "Northstar runs on the new platform.",
  );
  await setValue(
    field("Done criterion (optional)"),
    "The signed acceptance journey passes.",
  );
  await setValue(
    field("Out of scope (optional)"),
    "The legacy archive stays unchanged.",
  );

  assert.equal(
    composeProjectIntendedOutcome({
      result: "Northstar runs on the new platform.",
      doneCriterion: "The signed acceptance journey passes.",
      outOfScope: "The legacy archive stays unchanged.",
    }),
    "Result\nNorthstar runs on the new platform.\n\nDone criterion\nThe signed acceptance journey passes.\n\nOut of scope\nThe legacy archive stays unchanged.",
  );
  assert.deepEqual(projectOutcomeWarnings("Status update", "short", ""), [
    "The title reads like a status update. A Project title should name the bounded outcome.",
    "The result is brief. Add enough detail to distinguish this Project from a Task.",
  ]);

  await act(async () => {
    field("Project title")
      .closest("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await waitFor(
    () => onCreateProject.mock.calls.length === 1,
    "Project was not created",
  );
  assert.deepEqual(onCreateProject.mock.calls[0]![0], {
    title: "Deliver Northstar migration",
    intendedOutcome:
      "Result\nNorthstar runs on the new platform.\n\nDone criterion\nThe signed acceptance journey passes.\n\nOut of scope\nThe legacy archive stays unchanged.",
  });
});

test("similar preflight ignores stale responses and exposes only the three authorized actions", async () => {
  let resolveFirst!: (value: { kind: "ready"; items: [] }) => void;
  const first = new Promise<{ kind: "ready"; items: [] }>((resolve) => {
    resolveFirst = resolve;
  });
  const load = vi
    .fn<ProjectCreateClassifierProps["onLoadSimilarCandidates"]>()
    .mockImplementationOnce(async () => first)
    .mockImplementationOnce(async () => ({
      kind: "ready",
      items: [
        {
          projectId: PROJECT_B.id,
          spaceId: PROJECT_B.spaceId,
          title: PROJECT_B.title,
          lifecycle: "active",
          version: PROJECT_B.version,
          matchedOn: ["title"],
        },
      ],
    }));
  const onOpenProject = vi.fn<ProjectCreateClassifierProps["onOpenProject"]>();
  const onCreateTaskInProject = vi.fn<
    ProjectCreateClassifierProps["onCreateTaskInProject"]
  >(async () => true);
  const onCreateProject = vi.fn<
    ProjectCreateClassifierProps["onCreateProject"]
  >(async () => true);
  await mount(
    baseProps({
      onLoadSimilarCandidates: load,
      onOpenProject,
      onCreateTaskInProject,
      onCreateProject,
    }),
  );
  await act(async () => button("Project").click());
  await setValue(field("Project title"), "Northstar");
  await act(async () => button("Check for similar projects").click());
  await setValue(field("Project title"), "Northstar migration readiness");
  await act(async () => button("Check for similar projects").click());
  resolveFirst({ kind: "ready", items: [] });
  await waitFor(
    () => container.textContent?.includes(PROJECT_B.title) === true,
    "fresh similar candidate never rendered",
  );

  const actions = [
    ...container.querySelectorAll<HTMLElement>("[data-similar-action]"),
  ].map((node) => (node.textContent ?? "").trim());
  assert.deepEqual(actions, [
    "Open existing",
    "Add task there",
    "Create anyway",
  ]);
  assert.equal(container.textContent?.includes("more"), false);
  assert.equal(container.textContent?.includes("merge"), false);

  await act(async () => button("Open existing").click());
  assert.deepEqual(onOpenProject.mock.calls[0], [PROJECT_B.id]);

  await act(async () => button("Add task there").click());
  await waitFor(
    () => field<HTMLSelectElement>("Existing Project").value === PROJECT_B.id,
    "candidate did not seed Task in existing Project",
  );
  await setValue(field("Task title"), "Prepare acceptance");
  await act(async () => {
    field("Task title")
      .closest("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await waitFor(
    () => onCreateTaskInProject.mock.calls.length === 1,
    "Task in Project was not created",
  );
  assert.equal(onCreateTaskInProject.mock.calls[0]![0].projectId, PROJECT_B.id);
});

test("true-none and unavailable similarity remain distinct while Create anyway stays available", async () => {
  const load = vi
    .fn<ProjectCreateClassifierProps["onLoadSimilarCandidates"]>()
    .mockResolvedValueOnce({ kind: "ready", items: [] })
    .mockResolvedValueOnce({
      kind: "unavailable",
      message: "Query unavailable.",
    });
  await mount(baseProps({ onLoadSimilarCandidates: load }));
  await act(async () => button("Project").click());
  await setValue(field("Project title"), "One");
  await act(async () => button("Check for similar projects").click());
  await waitFor(
    () =>
      container.textContent?.includes(
        "No similar authorized Project was found",
      ) === true,
    "true-none state missing",
  );
  assert.ok(button("Create anyway"));
  await setValue(field("Project title"), "Two");
  await act(async () => button("Check for similar projects").click());
  await waitFor(
    () => container.textContent?.includes("Suggestions unavailable") === true,
    "unavailable state missing",
  );
  assert.equal(
    container.textContent?.includes("No similar authorized Project was found"),
    false,
  );
  assert.ok(button("Create anyway"));
});

test("Task authoring omits closed Projects from its direct picker", async () => {
  await mount(
    baseProps({
      projects: [PROJECT_A, { ...PROJECT_B, lifecycle: "closed" }],
    }),
  );
  await act(async () => button("Task").click());
  const options = [
    ...container.querySelectorAll<HTMLOptionElement>(
      'select[aria-label="Existing Project"] option',
    ),
  ].map((option) => option.textContent);
  assert.ok(options.includes(PROJECT_A.title));
  assert.equal(options.includes(PROJECT_B.title), false);
});

test("Area, Initiative, Opportunity and Capture route through their existing operations", async () => {
  const onOpenExistingAuthoring =
    vi.fn<ProjectCreateClassifierProps["onOpenExistingAuthoring"]>();
  const onOpenCapture = vi.fn<ProjectCreateClassifierProps["onOpenCapture"]>();
  await mount(baseProps({ onOpenExistingAuthoring, onOpenCapture }));

  await act(async () => button("Area").click());
  assert.deepEqual(onOpenExistingAuthoring.mock.calls[0], ["area"]);
  await act(async () => button("Initiative").click());
  assert.deepEqual(onOpenExistingAuthoring.mock.calls[1], ["initiative"]);
  await act(async () => button("Opportunity").click());
  assert.deepEqual(onOpenExistingAuthoring.mock.calls[2], ["opportunity"]);
  await act(async () => button("Capture").click());
  assert.equal(onOpenCapture.mock.calls.length, 1);
});
