import type { z } from "zod";

import { CommandEnvelopeSchema, type CommandEnvelope } from "./command.js";
import {
  ExecutionContextSchema,
  type ExecutionContext,
} from "./execution-context.js";
import { QueryEnvelopeSchema, type QueryEnvelope } from "./query.js";

export interface ContractIssue {
  readonly code: string;
  readonly path: string;
}

export type ContractValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ContractIssue[] };

const safeIssues = (error: z.ZodError): readonly ContractIssue[] =>
  error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.map(String).join("."),
  }));

const validate = <T>(
  schema: z.ZodType<T>,
  input: unknown,
): ContractValidation<T> => {
  const result = schema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, issues: safeIssues(result.error) };
};

export const validateExecutionContext = (
  input: unknown,
): ContractValidation<ExecutionContext> =>
  validate(ExecutionContextSchema, input);

export const validateCommandEnvelope = (
  input: unknown,
): ContractValidation<CommandEnvelope> =>
  validate(CommandEnvelopeSchema, input);

export const validateQueryEnvelope = (
  input: unknown,
): ContractValidation<QueryEnvelope> => validate(QueryEnvelopeSchema, input);
