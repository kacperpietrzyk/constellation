import type { FieldDefinitionId, WorkspaceId } from "@constellation/contracts";

import type {
  FieldDefinition,
  FieldDefinitionType,
  FieldValue,
  FieldValueMap,
} from "./model.js";

const numericField = (
  fields: FieldValueMap | undefined,
  fieldId: FieldDefinitionId,
): number | undefined => {
  const value = fields?.[fieldId];
  return value?.kind === "number" ? value.value : undefined;
};

/**
 * Adds deterministic derived values to a Task projection. Computed values are
 * never persisted: callers provide only related records already authorized
 * for the same Space, which keeps the evaluator permission-safe by design.
 */
export const taskFieldsWithComputedValues = (
  stored: FieldValueMap | undefined,
  definitions: readonly FieldDefinition[],
  subtasks: readonly { readonly fields?: FieldValueMap }[],
): FieldValueMap | undefined => {
  const next: Record<string, FieldValue> = { ...(stored ?? {}) };
  for (const definition of definitions) {
    if (
      definition.targetKind !== "task" ||
      fieldDefinitionState(definition) !== "active"
    )
      continue;
    if (definition.type.kind === "formula") {
      const operands = definition.type.fieldIds.map((fieldId) =>
        numericField(stored, fieldId),
      );
      if (operands.every((value): value is number => value !== undefined)) {
        const value = operands.reduce((sum, operand) => sum + operand, 0);
        if (Number.isFinite(value))
          next[definition.id] = { kind: "number", value };
      }
      continue;
    }
    if (definition.type.kind !== "rollup") continue;
    if (definition.type.operation === "count") {
      next[definition.id] = { kind: "number", value: subtasks.length };
      continue;
    }
    const sourceFieldId = definition.type.fieldId;
    const value = subtasks.reduce(
      (sum, subtask) =>
        sum + (numericField(subtask.fields, sourceFieldId) ?? 0),
      0,
    );
    if (Number.isFinite(value)) next[definition.id] = { kind: "number", value };
  }
  return Object.keys(next).length === 0 ? undefined : next;
};

export const fieldDefinitionState = (
  definition: FieldDefinition,
): "active" | "retired" => definition.state ?? "active";

/**
 * The one reading of a saved view's field predicates, so the desktop and an
 * operator's query cannot answer the same view differently.
 *
 * It takes the COMPUTED value map, never the stored one. A formula or rollup
 * definition has no stored entry at all — `taskFieldsWithComputedValues`
 * synthesizes it, and a `count` rollup synthesizes one unconditionally, even at
 * zero. Run against storage instead, `set` answers false for every field the
 * workspace computes and `empty` answers true for all of them: it typechecks,
 * it passes any fixture whose fields are plain text, and it is wrong for
 * exactly the fields somebody bothered to define.
 */
export const taskFieldValuesMatchFilters = (
  values: FieldValueMap | undefined,
  filters: readonly {
    readonly fieldId: FieldDefinitionId;
    readonly predicate:
      | { readonly kind: "choice_is"; readonly option: string }
      | { readonly kind: "set" }
      | { readonly kind: "empty" };
  }[],
): boolean => {
  for (const filter of filters) {
    const value = values?.[filter.fieldId];
    if (filter.predicate.kind === "set" && value === undefined) return false;
    if (filter.predicate.kind === "empty" && value !== undefined) return false;
    if (
      filter.predicate.kind === "choice_is" &&
      (value?.kind !== "choice" || value.value !== filter.predicate.option)
    )
      return false;
  }
  return true;
};

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
