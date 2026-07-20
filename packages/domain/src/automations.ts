import type { AutomationRuleId, WorkspaceId } from "@constellation/contracts";

import type { AutomationRecipe, AutomationRule } from "./model.js";

export const automationRuleState = (
  rule: AutomationRule,
): "active" | "disabled" => rule.state ?? "active";

export interface CreateAutomationRuleInput {
  readonly id: AutomationRuleId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly recipe: AutomationRecipe;
  readonly position: number;
  readonly occurredAt: string;
}

export const createAutomationRule = (
  input: CreateAutomationRuleInput,
): AutomationRule => ({
  id: input.id,
  workspaceId: input.workspaceId,
  name: input.name,
  recipe: input.recipe,
  state: "active",
  position: input.position,
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export interface AutomationRuleUpdate {
  readonly name?: string;
  readonly state?: "active" | "disabled";
  readonly position?: number;
}

export const updateAutomationRule = (
  rule: AutomationRule,
  update: AutomationRuleUpdate,
  occurredAt: string,
): AutomationRule => {
  const { disabledAt: currentDisabledAt, ...base } = rule;
  const state = update.state ?? automationRuleState(rule);
  const disabledAt =
    update.state === undefined
      ? currentDisabledAt
      : update.state === "disabled"
        ? occurredAt
        : undefined;
  return {
    ...base,
    name: update.name ?? rule.name,
    state,
    ...(disabledAt === undefined ? {} : { disabledAt }),
    position: update.position ?? rule.position,
    version: rule.version + 1,
    updatedAt: occurredAt,
  };
};
