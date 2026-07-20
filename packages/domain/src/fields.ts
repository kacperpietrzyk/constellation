import type { FieldDefinitionId, WorkspaceId } from "@constellation/contracts";

import type {
  FieldDefinition,
  FieldDefinitionType,
  FieldValue,
  FieldValueMap,
} from "./model.js";

export const fieldDefinitionState = (
  definition: FieldDefinition,
): "active" | "retired" => definition.state ?? "active";

export interface CreateFieldDefinitionInput {
  readonly id: FieldDefinitionId;
  readonly workspaceId: WorkspaceId;
  readonly targetKind: "task" | "project";
  readonly label: string;
  readonly type: FieldDefinitionType;
  readonly position: number;
  readonly occurredAt: string;
}

export const createFieldDefinition = (
  input: CreateFieldDefinitionInput,
): FieldDefinition => ({
  id: input.id,
  workspaceId: input.workspaceId,
  targetKind: input.targetKind,
  label: input.label,
  type: input.type,
  state: "active",
  position: input.position,
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export interface FieldDefinitionUpdate {
  readonly label?: string;
  readonly state?: "active" | "retired";
}

export const updateFieldDefinition = (
  definition: FieldDefinition,
  update: FieldDefinitionUpdate,
  occurredAt: string,
): FieldDefinition => {
  const { retiredAt: currentRetiredAt, ...base } = definition;
  const retiredAt =
    update.state === "retired"
      ? occurredAt
      : update.state === "active"
        ? undefined
        : currentRetiredAt;
  return {
    ...base,
    label: update.label ?? definition.label,
    state: update.state ?? fieldDefinitionState(definition),
    ...(retiredAt === undefined ? {} : { retiredAt }),
    version: definition.version + 1,
    updatedAt: occurredAt,
  };
};

/** True when the value matches the definition's declared type. */
export const fieldValueMatchesType = (
  type: FieldDefinitionType,
  value: FieldValue,
): boolean => {
  if (type.kind !== value.kind) return false;
  if (type.kind === "choice" && value.kind === "choice") {
    return type.options.includes(value.value);
  }
  if (value.kind === "number") return Number.isFinite(value.value);
  if (value.kind === "date") return !Number.isNaN(Date.parse(value.value));
  return true;
};

export const MAX_POPULATED_FIELDS = 32;

/** Returns the next field map, or undefined when the map would be empty. */
export const withFieldValue = (
  fields: FieldValueMap | undefined,
  fieldId: FieldDefinitionId,
  value: FieldValue | undefined,
): FieldValueMap | undefined => {
  const next: Record<string, FieldValue> = { ...(fields ?? {}) };
  if (value === undefined) delete next[fieldId];
  else next[fieldId] = value;
  return Object.keys(next).length === 0 ? undefined : next;
};
