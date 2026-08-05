import assert from "node:assert/strict";
import { it } from "node:test";

import {
  CommandEnvelopeSchema,
  PARTIAL_BY_FIELD_COMMANDS,
} from "@constellation/contracts";

import {
  buildOperationCatalog,
  completeOperationScope,
} from "../src/catalog.js";

/**
 * A Zod schema reduced to the surface this derivation walks. Zod's own types
 * describe far more than is needed and none of `.shape` / `.options` / `.values`
 * survives a `ZodType` annotation, so the schemas are read through this instead
 * of through casts scattered at each use.
 */
interface ProbeSchema {
  readonly safeParse: (value: unknown) => {
    readonly success: boolean;
    readonly error?: {
      readonly issues: readonly {
        readonly path: readonly PropertyKey[];
        readonly code: string;
        readonly message: string;
      }[];
    };
  };
  readonly shape?: Readonly<Record<string, ProbeSchema>>;
  readonly options?: readonly unknown[];
  readonly element?: ProbeSchema;
  readonly values?: unknown;
  readonly unwrap?: () => ProbeSchema;
}

const UNBUILDABLE = Symbol("unbuildable");

/**
 * Values tried against a field until one is accepted, in the order that keeps a
 * PAIR of fields orderable: the clock- and counter-derived entries hand a later
 * instant and a larger number to each successive field, so a nested rule like
 * "must end after it starts" is satisfied by declaration order rather than by
 * knowing about it. The constant 1 and 0 sit last as the fallback for a field
 * too narrow for the counter (weekday numbers), and the date is derived from the
 * clock rather than pinned, because a pinned date has twice turned this
 * repository's main red on a day nobody committed anything.
 */
let ladderTick = 0;
const LADDER: readonly (() => unknown)[] = [
  () => "5f3b9d2e-1a4c-4d7e-8b6f-0c2a1e9d3b47",
  () => new Date(Date.now() + ++ladderTick * 3_600_000).toISOString(),
  () => `probe${++ladderTick}`,
  () => ++ladderTick,
  () => true,
  () => "UTC",
  () => "a".repeat(64),
  () => null,
  () => [],
  () => ({}),
  () => 1,
  () => 0,
];

const build = (
  schema: ProbeSchema,
  depth = 0,
): unknown | typeof UNBUILDABLE => {
  if (depth > 8) return UNBUILDABLE;
  // A literal names the only value it takes, which no ladder would ever guess;
  // reading it is what makes a discriminated union reachable at all.
  if (schema.values instanceof Set) {
    for (const value of schema.values as ReadonlySet<unknown>) {
      if (schema.safeParse(value).success) return value;
    }
  }
  for (const make of LADDER) {
    const value = make();
    if (schema.safeParse(value).success) return value;
  }
  // `.optional()` / `.nullable()` hide the shape they wrap, so an enum or an
  // object behind one is invisible to everything below without this.
  if (typeof schema.unwrap === "function") {
    const inner = build(schema.unwrap(), depth + 1);
    if (inner !== UNBUILDABLE && schema.safeParse(inner).success) return inner;
  }
  if (schema.shape !== undefined) {
    const built: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(schema.shape)) {
      if (field.safeParse(undefined).success) continue;
      const value = build(field, depth + 1);
      if (value === UNBUILDABLE) return UNBUILDABLE;
      built[key] = value;
    }
    return schema.safeParse(built).success ? built : UNBUILDABLE;
  }
  if (Array.isArray(schema.options)) {
    for (const option of schema.options) {
      const candidate = option as ProbeSchema;
      const value =
        typeof candidate.safeParse === "function"
          ? build(candidate, depth + 1)
          : option;
      if (value !== UNBUILDABLE && schema.safeParse(value).success)
        return value;
    }
    return UNBUILDABLE;
  }
  if (schema.element !== undefined) {
    const value = build(schema.element, depth + 1);
    if (value !== UNBUILDABLE && schema.safeParse([value]).success)
      return [value];
    return UNBUILDABLE;
  }
  return UNBUILDABLE;
};

const buildTopLevel = (schema: ProbeSchema): unknown | typeof UNBUILDABLE => {
  ladderTick = 0;
  return build(schema);
};

interface Derivation {
  readonly partial: readonly string[];
  /** A required field no candidate value satisfied: the command was not measured. */
  readonly unmeasured: readonly string[];
  /** A refusal that named a FIELD, so the synthesis is wrong rather than the command partial. */
  readonly fieldLevelRefusals: readonly string[];
}

/**
 * The kernel's own definition of partiality, executed: a payload carrying ONLY
 * the fields the schema requires is refused, and adding one optional field makes
 * the same payload acceptable.
 *
 * Structure alone cannot answer this. `task.create` has optional fields AND a
 * refinement — enforcing startAt <= dueAt — and is not partial by field at all,
 * so "optional fields plus a refinement" names it wrongly. Nor is a cheaper
 * probe available: zod 4 SKIPS a `.refine()` when the object beneath it failed
 * to parse, so a payload missing its required ids never reaches the refinement
 * and every command looks alike. Valid required values have to be built.
 */
const derive = (): Derivation => {
  const partial: string[] = [];
  const unmeasured: string[] = [];
  const fieldLevelRefusals: string[] = [];
  for (const option of CommandEnvelopeSchema.options) {
    const name = (
      option.shape.commandName as unknown as { readonly value: string }
    ).value;
    const payload = option.shape.payload as unknown as ProbeSchema;
    // record.relate and capture.resolveException take a union rather than an
    // object, so they have no shape to strip optional fields from — and neither
    // is partial by field.
    if (payload.shape === undefined) continue;
    const required: Record<string, unknown> = {};
    const optionalKeys: string[] = [];
    let missing: string | undefined;
    for (const [key, field] of Object.entries(payload.shape)) {
      if (field.safeParse(undefined).success) {
        optionalKeys.push(key);
        continue;
      }
      const value = buildTopLevel(field);
      if (value === UNBUILDABLE) {
        missing = key;
        break;
      }
      required[key] = value;
    }
    if (missing !== undefined) {
      unmeasured.push(`${name}.${missing}`);
      continue;
    }
    const result = payload.safeParse(required);
    if (result.success) continue;
    const issues = result.error?.issues ?? [];
    const named = issues.filter((issue) => issue.path.length > 0);
    if (named.length > 0) {
      fieldLevelRefusals.push(
        `${name}: ${named.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(" ; ")}`,
      );
      continue;
    }
    // The second half of the definition. Without it a refinement that refuses
    // the required-only payload for some OTHER reason — two required fields that
    // must differ, handed equal values by the ladder — would put a command that
    // replaces what it omits into the sentence telling agents it does not.
    const relieved = optionalKeys.some((key) => {
      const value = buildTopLevel(
        (payload.shape as Readonly<Record<string, ProbeSchema>>)[
          key
        ] as ProbeSchema,
      );
      return (
        value !== UNBUILDABLE &&
        payload.safeParse({ ...required, [key]: value }).success
      );
    });
    if (relieved) partial.push(name);
  }
  return {
    partial: partial.sort(),
    unmeasured,
    fieldLevelRefusals,
  };
};

/**
 * THE CATALOGUE'S OWN LIST OF WHICH COMMANDS ARE PARTIAL BY FIELD, held against
 * the schemas.
 *
 * `INVOCATION_GUIDANCE.command` had to name them, because JSON Schema can state
 * neither "an omitted field is left alone" nor "send at least one". It named
 * them in a HAND-WRITTEN LIST that said eight and had been twelve for four
 * waves: savedView.update, task.updateDetails, template.updateContents and
 * meeting.route all joined the family without joining the sentence. An agent
 * reading it concludes task.updateDetails REPLACES the fields it omits and
 * clears a description nobody asked it to touch.
 *
 * The sentence now interpolates PARTIAL_BY_FIELD_COMMANDS and this executes the
 * schemas to prove that constant exactly right — the list is the cached answer,
 * this is the derivation. `unmeasured` is asserted empty on purpose: a required
 * field the ladder cannot build would drop its command silently, which is the
 * defect wearing the costume of the fix.
 *
 * BROKEN BY: a command joining or leaving the family, and by replacing the
 * interpolation with a hand-written list.
 */
it("names every command that is partial by field, and no other", () => {
  const derived = derive();
  assert.deepEqual(
    derived.unmeasured,
    [],
    "a required field no candidate value satisfies leaves its command unmeasured, so this guard is blind to it",
  );
  assert.deepEqual(
    derived.fieldLevelRefusals,
    [],
    "a payload was refused over a named field, so the synthesized value is wrong and the verdict means nothing",
  );
  assert.ok(
    derived.partial.length > 0,
    "no command is partial by field at all, so this guard is measuring nothing",
  );
  assert.deepEqual(
    [...PARTIAL_BY_FIELD_COMMANDS].sort(),
    derived.partial,
    "the constant the guidance interpolates and the schemas it describes disagree",
  );

  // task.create is the false positive a purely structural test produces: optional
  // fields and a refinement, and it replaces nothing.
  assert.equal(
    derived.partial.includes("task.create"),
    false,
    "task.create is not partial by field; its refinement orders two dates",
  );
  assert.equal(
    derived.partial.includes("task.updateDetails"),
    true,
    "task.updateDetails is partial by field, and was the omission that started this",
  );

  // The ENUMERATION AND THE COUNT read OUT of the sentence rather than searched
  // for inside it. Every one of these names appears elsewhere in the same
  // paragraph for other reasons, so "does the guidance mention it" is the check
  // that comes back green over a deleted list.
  const catalog = buildOperationCatalog(completeOperationScope());
  const sentence =
    /(\d+) commands are partial by field — (.*?): a field you omit is left alone/u.exec(
      catalog.guidance.command ?? "",
    );
  assert.ok(sentence, "the guidance no longer enumerates the family at all");
  assert.deepEqual(
    sentence[2]?.split(", ").sort(),
    derived.partial,
    "the sentence an agent reads and the schemas it describes disagree",
  );
  assert.equal(
    sentence[1],
    String(derived.partial.length),
    "the count in the sentence is not the length of the list beside it",
  );
});
