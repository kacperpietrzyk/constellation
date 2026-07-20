import type {
  FieldDefinitionId,
  ProjectTemplateId,
  WorkspaceId,
} from "@constellation/contracts";

import type { ProjectTemplate } from "./model.js";

export const projectTemplateState = (
  template: ProjectTemplate,
): "active" | "retired" => template.state ?? "active";

export interface CreateProjectTemplateInput {
  readonly id: ProjectTemplateId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly description?: string;
  readonly taskTitles: readonly string[];
  readonly fieldIds: readonly FieldDefinitionId[];
  readonly position: number;
  readonly occurredAt: string;
}

export const createProjectTemplate = (
  input: CreateProjectTemplateInput,
): ProjectTemplate => ({
  id: input.id,
  workspaceId: input.workspaceId,
  name: input.name,
  ...(input.description === undefined
    ? {}
    : { description: input.description }),
  taskTitles: input.taskTitles,
  fieldIds: input.fieldIds,
  state: "active",
  position: input.position,
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export interface ProjectTemplateUpdate {
  readonly name?: string;
  readonly description?: string | null;
  readonly taskTitles?: readonly string[];
  readonly fieldIds?: readonly FieldDefinitionId[];
  readonly state?: "active" | "retired";
}

export const updateProjectTemplate = (
  template: ProjectTemplate,
  update: ProjectTemplateUpdate,
  occurredAt: string,
): ProjectTemplate => {
  const {
    description: currentDescription,
    retiredAt: currentRetiredAt,
    ...base
  } = template;
  const description =
    update.description === undefined
      ? currentDescription
      : update.description === null
        ? undefined
        : update.description;
  const retiredAt =
    update.state === "retired"
      ? occurredAt
      : update.state === "active"
        ? undefined
        : currentRetiredAt;
  return {
    ...base,
    name: update.name ?? template.name,
    ...(description === undefined ? {} : { description }),
    taskTitles: update.taskTitles ?? template.taskTitles,
    fieldIds: update.fieldIds ?? template.fieldIds,
    state: update.state ?? projectTemplateState(template),
    ...(retiredAt === undefined ? {} : { retiredAt }),
    version: template.version + 1,
    updatedAt: occurredAt,
  };
};
