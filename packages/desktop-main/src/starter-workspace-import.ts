import { createHash, randomUUID } from "node:crypto";

import {
  CaptureIdSchema,
  CommandEnvelopeSchema,
  StrategicRecordIdSchema,
  type DeviceId,
  type CommandOutcome,
  type ProjectId,
  type SpaceId,
  type TaskId,
  type WorkspaceId,
} from "@constellation/contracts";
import {
  parseStructuredDocument,
  structuredDocumentEntityReferences,
  type StructuredDocument,
} from "@constellation/realtime-documents";

import type { DesktopKernelService } from "./runtime-kernel-service.js";

interface StarterArea {
  readonly key: string;
  readonly title: string;
  // Optional for the same reason it is optional on the command: an exported
  // workspace may legitimately hold work whose intent was never written.
  readonly responsibility?: string;
}

interface StarterInitiative {
  readonly key: string;
  readonly title: string;
  readonly intendedOutcome?: string;
}

interface StarterProject {
  readonly key: string;
  readonly title: string;
  readonly intendedOutcome?: string;
  readonly areaKey?: string;
  readonly initiativeKey?: string;
  readonly structuredContent?: StructuredDocument;
  readonly entityReferences?: readonly StarterEntityReference[];
}

interface StarterEntityReference {
  readonly targetKind:
    "task" | "project" | "person" | "organization" | "meeting";
  readonly targetId: string;
  readonly targetKey: string;
}

interface StarterTask {
  readonly key: string;
  readonly title: string;
  readonly projectKey?: string;
  readonly operationalState?: "actionable" | "waiting" | "blocked";
  readonly waitingOn?: string;
  readonly description?: string;
  readonly priority?: "urgent" | "high" | "normal" | "low";
  readonly startAt?: string;
  readonly dueAt?: string;
  readonly statusLabel?: string;
}

interface StarterDocument {
  readonly key: string;
  readonly title: string;
  readonly role?: "note" | "document" | "deliverable";
  /** Plain text; the collaborative document is created from it on import. */
  readonly text?: string;
  readonly structuredContent?: StructuredDocument;
  readonly entityReferences?: readonly StarterEntityReference[];
}

interface StarterTaskStatus {
  readonly key: string;
  readonly label: string;
  readonly operationalSemantics:
    "actionable" | "waiting" | "blocked" | "paused";
}

export interface StarterWorkspaceManifest {
  readonly version: 1 | 2 | 3 | 4 | 5 | 6;
  readonly importId: string;
  readonly areas: readonly StarterArea[];
  readonly initiatives: readonly StarterInitiative[];
  readonly projects: readonly StarterProject[];
  readonly tasks: readonly StarterTask[];
  /**
   * v3 (ADR-052). Workspace configuration the tasks depend on. Without it a
   * package whose tasks carry a custom status label cannot be imported into a
   * workspace that has never heard of that status — the import refuses an
   * unknown label by design, and rightly.
   */
  readonly taskStatuses?: readonly StarterTaskStatus[];
  /**
   * v4 (ADR-053). Native documents with their text. A package that carries a
   * project's work but not the note explaining it moves half the context.
   */
  readonly documents?: readonly StarterDocument[];
}

export interface StarterWorkspaceImportResult {
  readonly taskStatuses: number;
  readonly documents: number;
  readonly areas: number;
  readonly initiatives: number;
  readonly projects: number;
  readonly tasks: number;
  readonly links: number;
}

export const previewStarterWorkspace = (
  manifest: StarterWorkspaceManifest,
): StarterWorkspaceImportResult => ({
  // A status the target already has is not created again, so the preview
  // counts what the package carries rather than promising what it will add.
  taskStatuses: manifest.taskStatuses?.length ?? 0,
  documents: manifest.documents?.length ?? 0,
  areas: manifest.areas.length,
  initiatives: manifest.initiatives.length,
  projects: manifest.projects.length,
  tasks: manifest.tasks.length,
  links:
    manifest.projects.filter((project) => project.areaKey !== undefined)
      .length +
    manifest.projects.filter((project) => project.initiativeKey !== undefined)
      .length +
    manifest.tasks.filter((task) => task.projectKey !== undefined).length,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
};

const text = (value: unknown, maximum: number): string | undefined =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= maximum
    ? value.trim()
    : undefined;

const key = (value: unknown): string | undefined => {
  const parsed = text(value, 80);
  return parsed !== undefined && /^[a-z0-9][a-z0-9._-]*$/.test(parsed)
    ? parsed
    : undefined;
};

const parseArray = <T>(
  value: unknown,
  parser: (item: unknown) => T | undefined,
): readonly T[] | undefined => {
  if (!Array.isArray(value) || value.length > 100) return undefined;
  const parsed = value.map(parser);
  return parsed.every((item): item is T => item !== undefined)
    ? parsed
    : undefined;
};

export const parseStarterWorkspaceManifest = (
  value: unknown,
): StarterWorkspaceManifest | undefined => {
  if (
    !isRecord(value) ||
    !exactKeys(
      value,
      ["version", "importId", "areas", "initiatives", "projects", "tasks"],
      ["taskStatuses", "documents"],
    ) ||
    (value.version !== 1 &&
      value.version !== 2 &&
      value.version !== 3 &&
      value.version !== 4 &&
      value.version !== 5 &&
      value.version !== 6) ||
    (value.taskStatuses !== undefined && value.version < 3) ||
    (value.documents !== undefined && value.version < 4) ||
    typeof value.importId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(value.importId)
  )
    return undefined;
  const version = value.version;
  const areas = parseArray(value.areas, (item): StarterArea | undefined => {
    if (
      !isRecord(item) ||
      !exactKeys(item, ["key", "title"], ["responsibility"])
    )
      return undefined;
    const parsedKey = key(item.key);
    const title = text(item.title, 500);
    const responsibility =
      item.responsibility === undefined
        ? undefined
        : text(item.responsibility, 4_000);
    return parsedKey &&
      title &&
      (item.responsibility === undefined || responsibility !== undefined)
      ? {
          key: parsedKey,
          title,
          ...(responsibility === undefined ? {} : { responsibility }),
        }
      : undefined;
  });
  const initiatives = parseArray(
    value.initiatives,
    (item): StarterInitiative | undefined => {
      if (
        !isRecord(item) ||
        !exactKeys(item, ["key", "title"], ["intendedOutcome"])
      )
        return undefined;
      const parsedKey = key(item.key);
      const title = text(item.title, 500);
      const intendedOutcome =
        item.intendedOutcome === undefined
          ? undefined
          : text(item.intendedOutcome, 4_000);
      return parsedKey &&
        title &&
        (item.intendedOutcome === undefined || intendedOutcome !== undefined)
        ? {
            key: parsedKey,
            title,
            ...(intendedOutcome === undefined ? {} : { intendedOutcome }),
          }
        : undefined;
    },
  );
  const projects = parseArray(
    value.projects,
    (item): StarterProject | undefined => {
      if (
        !isRecord(item) ||
        !exactKeys(
          item,
          ["key", "title"],
          [
            "intendedOutcome",
            "areaKey",
            "initiativeKey",
            "structuredContent",
            "entityReferences",
          ],
        )
      )
        return undefined;
      const parsedKey = key(item.key);
      const title = text(item.title, 500);
      const intendedOutcome =
        item.intendedOutcome === undefined
          ? undefined
          : text(item.intendedOutcome, 4_000);
      const areaKey =
        item.areaKey === undefined ? undefined : key(item.areaKey);
      const initiativeKey =
        item.initiativeKey === undefined ? undefined : key(item.initiativeKey);
      let structuredContent: StructuredDocument | undefined;
      try {
        structuredContent =
          item.structuredContent === undefined
            ? undefined
            : parseStructuredDocument(item.structuredContent);
      } catch {
        return undefined;
      }
      const entityReferences =
        item.entityReferences === undefined
          ? undefined
          : parseArray(item.entityReferences, (reference) => {
              if (
                !isRecord(reference) ||
                !exactKeys(reference, [
                  "targetKind",
                  "targetId",
                  "targetKey",
                ]) ||
                ![
                  "task",
                  "project",
                  "person",
                  "organization",
                  "meeting",
                ].includes(String(reference.targetKind)) ||
                typeof reference.targetId !== "string" ||
                !/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(reference.targetId)
              )
                return undefined;
              const targetKey = key(reference.targetKey);
              return targetKey === undefined
                ? undefined
                : {
                    targetKind:
                      reference.targetKind as StarterEntityReference["targetKind"],
                    targetId: reference.targetId,
                    targetKey,
                  };
            });
      const contentReferences =
        structuredContent === undefined
          ? []
          : structuredDocumentEntityReferences(structuredContent);
      if (
        !parsedKey ||
        !title ||
        (item.intendedOutcome !== undefined && intendedOutcome === undefined) ||
        (item.areaKey !== undefined && !areaKey) ||
        (item.initiativeKey !== undefined && !initiativeKey) ||
        ((item.structuredContent !== undefined ||
          item.entityReferences !== undefined) &&
          version < 6) ||
        (structuredContent !== undefined && entityReferences === undefined) ||
        (structuredContent === undefined && entityReferences !== undefined) ||
        (entityReferences !== undefined &&
          (entityReferences.length !== contentReferences.length ||
            entityReferences.some(
              (reference, index) =>
                reference.targetKind !== contentReferences[index]?.targetKind ||
                reference.targetId !== contentReferences[index]?.targetId,
            )))
      )
        return undefined;
      return {
        key: parsedKey,
        title,
        ...(intendedOutcome === undefined ? {} : { intendedOutcome }),
        ...(areaKey ? { areaKey } : {}),
        ...(initiativeKey ? { initiativeKey } : {}),
        ...(structuredContent === undefined ? {} : { structuredContent }),
        ...(entityReferences === undefined ? {} : { entityReferences }),
      };
    },
  );
  const instant = (candidate: unknown): string | undefined =>
    typeof candidate === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      candidate,
    ) &&
    !Number.isNaN(Date.parse(candidate))
      ? candidate
      : undefined;
  const tasks = parseArray(value.tasks, (item): StarterTask | undefined => {
    if (
      !isRecord(item) ||
      !exactKeys(
        item,
        ["key", "title"],
        // v2 introduced the richer task fields and v3 keeps them: gating on
        // equality would have silently narrowed a task back to v1 the moment
        // the format grew again (it did — ADR-052).
        version >= 2
          ? [
              "projectKey",
              "operationalState",
              "waitingOn",
              "description",
              "priority",
              "startAt",
              "dueAt",
              "statusLabel",
            ]
          : ["projectKey", "operationalState", "waitingOn"],
      )
    )
      return undefined;
    const parsedKey = key(item.key);
    const title = text(item.title, 500);
    const projectKey =
      item.projectKey === undefined ? undefined : key(item.projectKey);
    const operationalState = item.operationalState;
    const waitingOn =
      item.waitingOn === undefined ? undefined : text(item.waitingOn, 500);
    const description =
      item.description === undefined
        ? undefined
        : text(item.description, 8_000);
    const priority = item.priority;
    const startAt =
      item.startAt === undefined ? undefined : instant(item.startAt);
    const dueAt = item.dueAt === undefined ? undefined : instant(item.dueAt);
    const statusLabel =
      item.statusLabel === undefined ? undefined : text(item.statusLabel, 120);
    if (
      !parsedKey ||
      !title ||
      (item.projectKey !== undefined && !projectKey) ||
      (operationalState !== undefined &&
        operationalState !== "actionable" &&
        operationalState !== "waiting" &&
        operationalState !== "blocked") ||
      (item.waitingOn !== undefined && !waitingOn) ||
      ((operationalState === "waiting" || operationalState === "blocked") &&
        !waitingOn) ||
      (item.description !== undefined && !description) ||
      (priority !== undefined &&
        priority !== "urgent" &&
        priority !== "high" &&
        priority !== "normal" &&
        priority !== "low") ||
      (item.startAt !== undefined && !startAt) ||
      (item.dueAt !== undefined && !dueAt) ||
      (item.statusLabel !== undefined && !statusLabel)
    )
      return undefined;
    return {
      key: parsedKey,
      title,
      ...(projectKey ? { projectKey } : {}),
      ...(operationalState ? { operationalState } : {}),
      ...(waitingOn ? { waitingOn } : {}),
      ...(description ? { description } : {}),
      ...(priority ? { priority } : {}),
      ...(startAt ? { startAt } : {}),
      ...(dueAt ? { dueAt } : {}),
      ...(statusLabel ? { statusLabel } : {}),
    };
  });
  if (!areas || !initiatives || !projects || !tasks) return undefined;
  const allKeys = [
    ...areas.map((item) => `area:${item.key}`),
    ...initiatives.map((item) => `initiative:${item.key}`),
    ...projects.map((item) => `project:${item.key}`),
    ...tasks.map((item) => `task:${item.key}`),
  ];
  if (new Set(allKeys).size !== allKeys.length) return undefined;
  if (
    projects.some(
      (project) =>
        (project.areaKey &&
          !areas.some((area) => area.key === project.areaKey)) ||
        (project.initiativeKey &&
          !initiatives.some(
            (initiative) => initiative.key === project.initiativeKey,
          )),
    ) ||
    tasks.some(
      (task) =>
        task.projectKey &&
        !projects.some((project) => project.key === task.projectKey),
    )
  )
    return undefined;
  const taskStatuses =
    value.taskStatuses === undefined
      ? undefined
      : parseArray(
          value.taskStatuses,
          (item): StarterTaskStatus | undefined => {
            if (
              !isRecord(item) ||
              !exactKeys(item, ["key", "label", "operationalSemantics"])
            )
              return undefined;
            const parsedKey = key(item.key);
            const label = text(item.label, 60);
            const semantics = item.operationalSemantics;
            return parsedKey &&
              label &&
              (semantics === "actionable" ||
                semantics === "waiting" ||
                semantics === "blocked" ||
                semantics === "paused")
              ? { key: parsedKey, label, operationalSemantics: semantics }
              : undefined;
          },
        );
  if (value.taskStatuses !== undefined && taskStatuses === undefined)
    return undefined;
  // Two statuses with one label would be ambiguous on the reading side, where
  // labels are how a task names its status.
  if (
    taskStatuses !== undefined &&
    new Set(
      taskStatuses.map((status) => status.label.toLocaleLowerCase("pl-PL")),
    ).size !== taskStatuses.length
  )
    return undefined;
  const documents =
    value.documents === undefined
      ? undefined
      : parseArray(value.documents, (item): StarterDocument | undefined => {
          if (
            !isRecord(item) ||
            !exactKeys(
              item,
              ["key", "title"],
              ["role", "text", "structuredContent", "entityReferences"],
            )
          )
            return undefined;
          const parsedKey = key(item.key);
          const title = text(item.title, 500);
          const role = item.role;
          const body =
            item.text === undefined ? undefined : text(item.text, 200_000);
          let structuredContent: StructuredDocument | undefined;
          try {
            structuredContent =
              item.structuredContent === undefined
                ? undefined
                : parseStructuredDocument(item.structuredContent);
          } catch {
            return undefined;
          }
          const entityReferences =
            item.entityReferences === undefined
              ? undefined
              : parseArray(item.entityReferences, (reference) => {
                  if (
                    !isRecord(reference) ||
                    !exactKeys(reference, [
                      "targetKind",
                      "targetId",
                      "targetKey",
                    ]) ||
                    ![
                      "task",
                      "project",
                      "person",
                      "organization",
                      "meeting",
                    ].includes(String(reference.targetKind)) ||
                    typeof reference.targetId !== "string" ||
                    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(reference.targetId)
                  )
                    return undefined;
                  const targetKey = key(reference.targetKey);
                  return targetKey === undefined
                    ? undefined
                    : {
                        targetKind: reference.targetKind as
                          | "task"
                          | "project"
                          | "person"
                          | "organization"
                          | "meeting",
                        targetId: reference.targetId,
                        targetKey,
                      };
                });
          const contentReferences =
            structuredContent === undefined
              ? []
              : structuredDocumentEntityReferences(structuredContent);
          if (
            !parsedKey ||
            !title ||
            (role !== undefined &&
              role !== "note" &&
              role !== "document" &&
              role !== "deliverable") ||
            (item.text !== undefined && body === undefined) ||
            ((item.structuredContent !== undefined ||
              item.entityReferences !== undefined) &&
              version < 5) ||
            (structuredContent !== undefined &&
              entityReferences === undefined) ||
            (structuredContent === undefined &&
              entityReferences !== undefined) ||
            (entityReferences !== undefined &&
              (entityReferences.length !== contentReferences.length ||
                entityReferences.some(
                  (reference, index) =>
                    reference.targetKind !==
                      contentReferences[index]?.targetKind ||
                    reference.targetId !== contentReferences[index]?.targetId,
                )))
          )
            return undefined;
          return {
            key: parsedKey,
            title,
            ...(role === undefined ? {} : { role }),
            ...(body === undefined ? {} : { text: body }),
            ...(structuredContent === undefined ? {} : { structuredContent }),
            ...(entityReferences === undefined ? {} : { entityReferences }),
          };
        });
  if (value.documents !== undefined && documents === undefined)
    return undefined;
  return {
    version,
    importId: value.importId,
    areas,
    initiatives,
    projects,
    tasks,
    ...(taskStatuses === undefined ? {} : { taskStatuses }),
    ...(documents === undefined ? {} : { documents }),
  };
};

// The CSV surface is a fixed, documented header set mapped onto the v2
// exchange manifest: inspectable input, one engine, production commands
// only. A file with any malformed row does not execute.
const CSV_HEADERS = [
  "title",
  "project",
  "status",
  "priority",
  "due",
  "start",
  "description",
  "state",
  "waitingOn",
] as const;

const parseCsvRows = (input: string): readonly (readonly string[])[] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  const textInput = input.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  for (let index = 0; index < textInput.length; index += 1) {
    const character = textInput[index]!;
    if (quoted) {
      if (character === '"') {
        if (textInput[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      pushField();
    } else if (character === "\n") {
      pushRow();
    } else {
      field += character;
    }
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows.filter(
    (candidate) => !(candidate.length === 1 && candidate[0] === ""),
  );
};

const slugKey = (value: string, fallback: string): string => {
  const slug = value
    .toLocaleLowerCase("pl-PL")
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, 60);
  return /^[a-z0-9][a-z0-9._-]*$/.test(slug) ? slug : fallback;
};

export type TasksCsvResult =
  | { readonly outcome: "success"; readonly manifest: StarterWorkspaceManifest }
  | { readonly outcome: "failure"; readonly errors: readonly string[] };

export const parseTasksCsv = (input: string): TasksCsvResult => {
  if (Buffer.byteLength(input, "utf8") > 256 * 1024) {
    return { outcome: "failure", errors: ["Plik przekracza limit 256 KB."] };
  }
  const rows = parseCsvRows(input);
  const header = rows[0];
  if (header === undefined) {
    return { outcome: "failure", errors: ["Plik CSV jest pusty."] };
  }
  const columns = header.map((name) => name.trim());
  if (
    !columns.includes("title") ||
    columns.some(
      (name) => !(CSV_HEADERS as readonly string[]).includes(name),
    ) ||
    new Set(columns).size !== columns.length
  ) {
    return {
      outcome: "failure",
      errors: [
        `Nagłówek CSV musi używać wyłącznie kolumn: ${CSV_HEADERS.join(", ")} (kolumna "title" jest wymagana).`,
      ],
    };
  }
  if (rows.length - 1 > 100) {
    return {
      outcome: "failure",
      errors: ["Plik CSV może mieć najwyżej 100 wierszy zadań."],
    };
  }
  const errors: string[] = [];
  const cell = (row: readonly string[], name: string): string | undefined => {
    const index = columns.indexOf(name);
    if (index === -1) return undefined;
    const value = (row[index] ?? "").trim();
    return value === "" ? undefined : value;
  };
  const projectTitles: string[] = [];
  const tasks: StarterTask[] = [];
  rows.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2;
    if (row.length !== columns.length) {
      errors.push(
        `Wiersz ${rowNumber}: liczba pól (${row.length}) nie zgadza się z nagłówkiem (${columns.length}).`,
      );
      return;
    }
    const title = cell(row, "title");
    if (title === undefined || title.length > 500) {
      errors.push(`Wiersz ${rowNumber}: wymagany tytuł (do 500 znaków).`);
      return;
    }
    const project = cell(row, "project");
    if (project !== undefined && !projectTitles.includes(project)) {
      projectTitles.push(project);
    }
    const priority = cell(row, "priority");
    if (
      priority !== undefined &&
      !["urgent", "high", "normal", "low"].includes(priority)
    ) {
      errors.push(
        `Wiersz ${rowNumber}: priorytet musi być jednym z urgent, high, normal, low.`,
      );
      return;
    }
    const date = (name: string): string | undefined | null => {
      const value = cell(row, name);
      if (value === undefined) return undefined;
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return `${value}T12:00:00.000Z`;
      }
      if (!Number.isNaN(Date.parse(value)) && value.includes("T")) return value;
      errors.push(
        `Wiersz ${rowNumber}: kolumna "${name}" wymaga daty YYYY-MM-DD albo pełnego znacznika ISO.`,
      );
      return null;
    };
    const dueAt = date("due");
    const startAt = date("start");
    if (dueAt === null || startAt === null) return;
    const state = cell(row, "state");
    if (
      state !== undefined &&
      !["actionable", "waiting", "blocked"].includes(state)
    ) {
      errors.push(
        `Wiersz ${rowNumber}: stan musi być jednym z actionable, waiting, blocked.`,
      );
      return;
    }
    const waitingOn = cell(row, "waitingOn");
    if (
      (state === "waiting" || state === "blocked") &&
      waitingOn === undefined
    ) {
      errors.push(
        `Wiersz ${rowNumber}: stan "${state}" wymaga wypełnionej kolumny "waitingOn".`,
      );
      return;
    }
    const description = cell(row, "description");
    if (description !== undefined && description.length > 8_000) {
      errors.push(`Wiersz ${rowNumber}: opis przekracza 8000 znaków.`);
      return;
    }
    const statusLabel = cell(row, "status");
    tasks.push({
      key: `row${rowNumber}`,
      title,
      ...(project === undefined
        ? {}
        : {
            projectKey: slugKey(
              project,
              `project-${projectTitles.indexOf(project) + 1}`,
            ),
          }),
      ...(state === undefined || state === "actionable"
        ? {}
        : { operationalState: state as "waiting" | "blocked" }),
      ...(waitingOn === undefined ? {} : { waitingOn }),
      ...(description === undefined ? {} : { description }),
      ...(priority === undefined
        ? {}
        : { priority: priority as "urgent" | "high" | "normal" | "low" }),
      ...(startAt === undefined ? {} : { startAt }),
      ...(dueAt === undefined ? {} : { dueAt }),
      ...(statusLabel === undefined ? {} : { statusLabel }),
    });
  });
  if (errors.length > 0) return { outcome: "failure", errors };
  const importId = deterministicUuid(`tasks-csv:${input}`);
  return {
    outcome: "success",
    manifest: {
      version: 2,
      importId,
      areas: [],
      initiatives: [],
      projects: projectTitles.map((title, index) => ({
        key: slugKey(title, `project-${index + 1}`),
        title,
        intendedOutcome: `Zaimportowano z pliku CSV (${importId.slice(0, 8)}).`,
      })),
      tasks,
    },
  };
};

export const manifestStatusErrors = (
  manifest: StarterWorkspaceManifest,
  knownStatusLabels: readonly string[],
): readonly string[] => {
  // A v3 package brings its own statuses, and they are created before any
  // task is routed — so a label the package carries is known even though the
  // workspace has never seen it. Checking only the workspace made the preview
  // refuse exactly the packages manifest v3 exists to accept, which left the
  // feature unreachable from the surface even though the import itself worked
  // (caught by the installed journey, not by any unit test).
  const known = new Set(
    [
      ...knownStatusLabels,
      ...(manifest.taskStatuses ?? []).map((status) => status.label),
    ].map((label) => label.toLocaleLowerCase("pl-PL")),
  );
  return manifest.tasks
    .filter(
      (task) =>
        task.statusLabel !== undefined &&
        !known.has(task.statusLabel.toLocaleLowerCase("pl-PL")),
    )
    .map(
      (task) =>
        `Zadanie „${task.title}": status „${task.statusLabel}" nie istnieje w tym workspace.`,
    );
};

const deterministicUuid = (seed: string): string => {
  const chars = createHash("sha256")
    .update(seed)
    .digest("hex")
    .slice(0, 32)
    .split("");
  chars[12] = "4";
  chars[16] = ((Number.parseInt(chars[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${chars.slice(0, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}-${chars.slice(16, 20).join("")}-${chars.slice(20).join("")}`;
};

const execute = (
  service: DesktopKernelService,
  input: Record<string, unknown>,
): Extract<CommandOutcome, { outcome: "success" }> => {
  const result = service.execute(CommandEnvelopeSchema.parse(input));
  if (result.kind !== "command_outcome" || result.outcome.outcome !== "success")
    throw new Error("STARTER_WORKSPACE_COMMAND_FAILED");
  return result.outcome;
};

export const importStarterWorkspace = (input: {
  readonly service: DesktopKernelService;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly deviceId: DeviceId;
  readonly manifest: StarterWorkspaceManifest;
  readonly resolveStatusId?: (label: string) => string | undefined;
  /** Labels the target workspace already holds, so none is duplicated. */
  readonly existingStatusLabels?: readonly string[];
  /** Writes imported document text; absent leaves documents empty. */
  readonly writeDocumentText?: (input: {
    readonly documentId: string;
    readonly spaceId: SpaceId;
    readonly text: string;
  }) => void;
  readonly writeDocumentContent?: (input: {
    readonly documentId: string;
    readonly spaceId: SpaceId;
    readonly text: string;
    readonly content: StructuredDocument;
  }) => void;
  readonly writeProjectContent?: (input: {
    readonly projectId: ProjectId;
    readonly spaceId: SpaceId;
    readonly content: StructuredDocument;
  }) => void;
  readonly defaultTaskStatusId?: string;
}): StarterWorkspaceImportResult => {
  const base = (
    keyName: string,
    expectedVersions: Record<string, number> = {},
  ) => ({
    contractVersion: 1,
    commandId: randomUUID(),
    workspaceId: input.workspaceId,
    idempotencyKey: `starter:${input.manifest.importId}:${keyName}`,
    expectedVersions,
    correlationId: input.manifest.importId,
  });
  // v3 configuration first: a task can only name a status the workspace
  // already has, so the statuses the package carries must exist before any
  // task lands (ADR-052). A status whose label the target already holds is
  // skipped rather than duplicated — labels are how a task names its status,
  // so two with one label would be ambiguous.
  let createdStatuses = 0;
  // Statuses this run creates, so a task naming one resolves without the
  // caller re-reading the workspace mid-import. A caller that snapshots its
  // status list before the call — which the desktop does, and which is the
  // obvious way to write it — would otherwise fail on exactly the package
  // this section exists to make importable.
  const createdStatusIds = new Map<string, string>();
  const existingStatusLabels = new Set(
    (input.existingStatusLabels ?? []).map((label) =>
      label.toLocaleLowerCase("pl-PL"),
    ),
  );
  for (const status of input.manifest.taskStatuses ?? []) {
    if (existingStatusLabels.has(status.label.toLocaleLowerCase("pl-PL")))
      continue;
    // A caller that did not enumerate existing labels still must not turn a
    // duplicate into a failed import: the kernel refuses the second status
    // with that label, and skipping is the same outcome the enumerated path
    // reaches. Any other refusal (authorization, for instance) still aborts,
    // because it means the package cannot be applied as written.
    const statusId = deterministicUuid(
      `${input.manifest.importId}:task-status:${status.key}`,
    );
    const created = input.service.execute(
      CommandEnvelopeSchema.parse({
        ...base(`task-status:${status.key}`),
        commandName: "taskStatus.create",
        payload: {
          statusId,
          label: status.label,
          operationalSemantics: status.operationalSemantics,
        },
      }),
    );
    const outcome =
      created.kind === "command_outcome" ? created.outcome : undefined;
    if (outcome?.outcome === "success") {
      existingStatusLabels.add(status.label.toLocaleLowerCase("pl-PL"));
      createdStatusIds.set(status.label.toLocaleLowerCase("pl-PL"), statusId);
      createdStatuses += 1;
      continue;
    }
    if (outcome?.diagnosticCode !== "command.precondition_failed")
      throw new Error("STARTER_WORKSPACE_COMMAND_FAILED");
    existingStatusLabels.add(status.label.toLocaleLowerCase("pl-PL"));
  }
  // v4 documents. Created after configuration and before work, so a note that
  // explains a project exists by the time the project is read. Text is written
  // through the injected port because document text is collaborative state,
  // not kernel state (ADR-049/053); without the port the metadata still
  // imports and the text is reported as skipped rather than silently dropped.
  let createdDocuments = 0;
  const pendingDocuments: {
    readonly documentId: string;
    readonly document: StarterDocument;
  }[] = [];
  for (const document of input.manifest.documents ?? []) {
    const documentId = deterministicUuid(
      `${input.manifest.importId}:document:${document.key}`,
    );
    const outcome = input.service.execute(
      CommandEnvelopeSchema.parse({
        ...base(`document:${document.key}`),
        commandName: "document.create",
        payload: {
          documentId,
          spaceId: input.spaceId,
          title: document.title,
          ...(document.role === undefined ? {} : { role: document.role }),
        },
      }),
    );
    if (
      outcome.kind !== "command_outcome" ||
      outcome.outcome.outcome !== "success"
    )
      throw new Error("STARTER_WORKSPACE_COMMAND_FAILED");
    createdDocuments += 1;
    pendingDocuments.push({ documentId, document });
  }
  const areaIds = new Map<string, string>();
  const initiativeIds = new Map<string, string>();
  const projectIds = new Map<string, ProjectId>();
  const taskIds = new Map<string, TaskId>();
  const pendingProjects: {
    readonly projectId: ProjectId;
    readonly project: StarterProject;
  }[] = [];
  let links = 0;
  for (const area of input.manifest.areas) {
    const areaId = StrategicRecordIdSchema.parse(
      deterministicUuid(`${input.manifest.importId}:area:${area.key}`),
    );
    execute(input.service, {
      ...base(`area:${area.key}`),
      commandName: "area.create",
      payload: {
        areaId,
        spaceId: input.spaceId,
        title: area.title,
        ...(area.responsibility === undefined
          ? {}
          : { responsibility: area.responsibility }),
      },
    });
    areaIds.set(area.key, areaId);
  }
  for (const initiative of input.manifest.initiatives) {
    const initiativeId = StrategicRecordIdSchema.parse(
      deterministicUuid(
        `${input.manifest.importId}:initiative:${initiative.key}`,
      ),
    );
    execute(input.service, {
      ...base(`initiative:${initiative.key}`),
      commandName: "initiative.create",
      payload: {
        initiativeId,
        spaceId: input.spaceId,
        title: initiative.title,
        ...(initiative.intendedOutcome === undefined
          ? {}
          : { intendedOutcome: initiative.intendedOutcome }),
      },
    });
    initiativeIds.set(initiative.key, initiativeId);
  }
  for (const project of input.manifest.projects) {
    const result = execute(input.service, {
      ...base(`project:${project.key}`),
      commandName: "project.create",
      payload: {
        spaceId: input.spaceId,
        title: project.title,
        ...(project.intendedOutcome === undefined
          ? {}
          : { intendedOutcome: project.intendedOutcome }),
      },
    });
    if (result.projection.kind !== "project.created")
      throw new Error("STARTER_WORKSPACE_PROJECT_INVALID");
    const projectId = result.projection.projectId;
    projectIds.set(project.key, projectId);
    pendingProjects.push({ projectId, project });
    const targets = [
      project.areaKey
        ? {
            type: "project_serves_area",
            key: `area:${project.areaKey}`,
            id: areaIds.get(project.areaKey),
          }
        : undefined,
      project.initiativeKey
        ? {
            type: "project_advances_initiative",
            key: `initiative:${project.initiativeKey}`,
            id: initiativeIds.get(project.initiativeKey),
          }
        : undefined,
    ].filter(
      (
        item,
      ): item is {
        type: "project_serves_area" | "project_advances_initiative";
        key: string;
        id: string;
      } => item?.id !== undefined,
    );
    for (const target of targets) {
      execute(input.service, {
        ...base(`link:${project.key}:${target.key}`),
        commandName: "work.linkCreate",
        payload: {
          linkId: StrategicRecordIdSchema.parse(
            deterministicUuid(
              `${input.manifest.importId}:link:${project.key}:${target.key}`,
            ),
          ),
          spaceId: input.spaceId,
          linkType: target.type,
          sourceRecordId: projectId,
          targetRecordId: target.id,
        },
      });
      links += 1;
    }
  }
  for (const task of input.manifest.tasks) {
    const stored = execute(input.service, {
      ...base(`task:${task.key}:capture`),
      commandName: "capture.submit",
      payload: {
        spaceId: input.spaceId,
        original: { kind: "text", text: task.title },
        deviceId: input.deviceId,
        source: "in_app_quick_capture",
      },
    });
    if (stored.projection.kind !== "capture.stored")
      throw new Error("STARTER_WORKSPACE_CAPTURE_INVALID");
    const captureId = CaptureIdSchema.parse(stored.projection.captureId);
    const routed = execute(input.service, {
      ...base(`task:${task.key}:process`, {
        [captureId]: stored.projection.version,
      }),
      commandName: "capture.process",
      payload: { captureId, destination: "task", title: task.title },
    });
    if (routed.projection.kind !== "capture.routed_as_task")
      throw new Error("STARTER_WORKSPACE_TASK_INVALID");
    const taskId: TaskId = routed.projection.taskId;
    taskIds.set(task.key, taskId);
    let taskVersion = routed.projection.taskVersion;
    if (task.description || task.priority || task.startAt || task.dueAt) {
      const details = execute(input.service, {
        ...base(`task:${task.key}:details`, { [taskId]: taskVersion }),
        commandName: "task.updateDetails",
        payload: {
          taskId,
          ...(task.description ? { description: task.description } : {}),
          ...(task.priority ? { priority: task.priority } : {}),
          ...(task.startAt ? { startAt: task.startAt } : {}),
          ...(task.dueAt ? { dueAt: task.dueAt } : {}),
        },
      });
      if (details.projection.kind !== "task.details_updated")
        throw new Error("STARTER_WORKSPACE_TASK_DETAILS_INVALID");
      taskVersion = details.projection.version;
    }
    if (task.statusLabel) {
      const statusId =
        createdStatusIds.get(task.statusLabel.toLocaleLowerCase("pl-PL")) ??
        input.resolveStatusId?.(task.statusLabel);
      if (statusId === undefined)
        throw new Error("STARTER_WORKSPACE_STATUS_UNKNOWN");
      if (statusId === input.defaultTaskStatusId) {
        // Routing already left the Task in the default status; setStatus
        // would refuse a no-op change.
      } else {
        const status = execute(input.service, {
          ...base(`task:${task.key}:status`, { [taskId]: taskVersion }),
          commandName: "task.setStatus",
          payload: { taskId, statusId },
        });
        if (status.projection.kind !== "task.status_changed")
          throw new Error("STARTER_WORKSPACE_TASK_STATUS_INVALID");
        taskVersion = status.projection.version;
      }
    }
    if (task.operationalState && task.operationalState !== "actionable") {
      const state = execute(input.service, {
        ...base(`task:${task.key}:state`, { [taskId]: taskVersion }),
        commandName: "task.setOperationalState",
        payload: {
          taskId,
          operationalState: task.operationalState,
          waitingOn: {
            kind: "external",
            label: task.waitingOn,
          },
        },
      });
      if (state.projection.kind !== "task.operational_state_changed")
        throw new Error("STARTER_WORKSPACE_TASK_STATE_INVALID");
      taskVersion = state.projection.version;
    }
    if (task.projectKey) {
      const projectId = projectIds.get(task.projectKey);
      if (!projectId) throw new Error("STARTER_WORKSPACE_PROJECT_MISSING");
      execute(input.service, {
        ...base(`task:${task.key}:project`, {
          [taskId]: taskVersion,
          [projectId]: 1,
        }),
        commandName: "record.relate",
        payload: {
          relationType: "task_contributes_to_project",
          taskId,
          projectId,
        },
      });
      links += 1;
    }
  }
  const remapStructuredContent = (
    structuredContent: StructuredDocument,
    entityReferences: readonly StarterEntityReference[],
  ): StructuredDocument => {
    const targetIds = new Map<string, string>();
    for (const reference of entityReferences) {
      const targetId =
        reference.targetKind === "task"
          ? taskIds.get(reference.targetKey)
          : reference.targetKind === "project"
            ? projectIds.get(reference.targetKey)
            : undefined;
      if (targetId === undefined)
        throw new Error("STARTER_WORKSPACE_CONTENT_REFERENCE_UNRESOLVED");
      targetIds.set(`${reference.targetKind}:${reference.targetId}`, targetId);
    }
    const content = JSON.parse(
      JSON.stringify(structuredContent),
    ) as StructuredDocument;
    const remap = (node: {
      attrs?: Readonly<Record<string, unknown>>;
      content?: readonly unknown[];
      type?: string;
    }): void => {
      if (node.type === "entityReference" && node.attrs !== undefined) {
        const targetKind = String(node.attrs.targetKind);
        const targetId = String(node.attrs.targetId);
        const mapped = targetIds.get(`${targetKind}:${targetId}`);
        if (mapped === undefined)
          throw new Error("STARTER_WORKSPACE_CONTENT_REFERENCE_UNRESOLVED");
        (node.attrs as Record<string, unknown>).targetId = mapped;
      }
      for (const child of node.content ?? []) remap(child as never);
    };
    remap(content as never);
    return parseStructuredDocument(content);
  };
  for (const pending of pendingProjects) {
    const { projectId, project } = pending;
    if (
      project.structuredContent !== undefined &&
      project.entityReferences !== undefined &&
      input.writeProjectContent !== undefined
    ) {
      input.writeProjectContent({
        projectId,
        spaceId: input.spaceId,
        content: remapStructuredContent(
          project.structuredContent,
          project.entityReferences,
        ),
      });
    }
  }
  for (const pending of pendingDocuments) {
    const { documentId, document } = pending;
    if (
      document.structuredContent !== undefined &&
      document.entityReferences !== undefined &&
      input.writeDocumentContent !== undefined
    ) {
      input.writeDocumentContent({
        documentId,
        spaceId: input.spaceId,
        text: document.text ?? "",
        content: remapStructuredContent(
          document.structuredContent,
          document.entityReferences,
        ),
      });
    } else if (document.text !== undefined && document.text.length > 0) {
      input.writeDocumentText?.({
        documentId,
        spaceId: input.spaceId,
        text: document.text,
      });
    }
  }
  return {
    taskStatuses: createdStatuses,
    documents: createdDocuments,
    areas: input.manifest.areas.length,
    initiatives: input.manifest.initiatives.length,
    projects: input.manifest.projects.length,
    tasks: input.manifest.tasks.length,
    links,
  };
};
