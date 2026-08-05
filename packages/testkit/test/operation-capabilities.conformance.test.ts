import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import {
  type ApplicationCommandResponse,
  type AuthorizationRequest,
} from "@constellation/application";
import {
  capabilitiesForAgentGrantPreset,
  COMMAND_CAPABILITIES,
  CommandEnvelopeSchema,
  ExecutionContextSchema,
  GrantIdSchema,
  operationCapabilities,
  operationPermitsPrincipalKind,
  type Capability,
  type CommandName,
  type ExecutionContext,
  type PrincipalKind,
  WorkspaceIdSchema,
} from "@constellation/contracts";

import { createReferenceHarness, type ReferenceHarness } from "../src/index.js";

/**
 * Does the capability set the MCP catalog publishes for an operation match the
 * one the kernel actually consults — measured against the real authorization
 * path, never against a second copy of the table?
 *
 * The defect this exists to catch: the catalog used to decide reachability
 * from a hand-written alias table of four rows, its test asserted that table
 * against a hand-written expected array, and the mirror agreed with the defect
 * it was there to see. Two commands a `capture.process` grant could and did
 * execute appeared in no catalog, and two more needed a second capability the
 * catalog never mentioned, so an agent that checked `requiredCapability`
 * exactly as the guidance told it to was denied with no way out.
 *
 * So nothing here is a list of expected capabilities. For every command in
 * `CommandEnvelopeSchema` — iterated from the union, so a new command is
 * probed the day it is added and no exclusion list can swallow it — the
 * published set is fed to `ApplicationKernel.execute` and the kernel's own
 * verdict is the oracle:
 *
 *   sufficient — with exactly the published set, the answer is not
 *                `authorization.denied` (it is usually a precondition, because
 *                the probe names a target that does not exist, and that is the
 *                point: a precondition means the grant question passed);
 *   necessary  — with any one published capability removed, it IS
 *                `authorization.denied`;
 *   complete   — with every capability held, the kernel consults nothing the
 *                table does not state.
 *
 * What this CANNOT see, stated so nobody reads its green as more than it is:
 * the kernel and the catalog now read one table, so editing the table moves
 * both together and no probe here goes red. That is the mechanism working, not
 * the instrument failing — the divergence the table makes impossible is the
 * one this file no longer has to police. What it still polices is the kind of
 * divergence a table cannot prevent: a capability CONSULTED IN CODE that the
 * table does not state (the third probe), and an arm that never reaches its
 * consult at all (the second). Verified by reintroducing the pre-fix defect —
 * the literal `task.create` back in the promotion arm, its entry out of the
 * table — which turns two of the three probes red by name.
 */

const ids = {
  workspace: "5a000000-0000-4000-8000-000000000001",
  rootSpace: "5a000000-0000-4000-8000-000000000002",
  owner: "5a000000-0000-4000-8000-000000000003",
  ownerCredential: "5a000000-0000-4000-8000-000000000004",
  ownerGrant: "5a000000-0000-4000-8000-000000000005",
  agent: "5a000000-0000-4000-8000-000000000006",
  agentCredential: "5a000000-0000-4000-8000-000000000007",
  agentGrant: "5a000000-0000-4000-8000-000000000008",
  meeting: "5a000000-0000-4000-8000-000000000009",
  workItem: "5a000000-0000-4000-8000-00000000000a",
  agentMembership: "5a000000-0000-4000-8000-00000000000b",
  agentSpaceGrant: "5a000000-0000-4000-8000-00000000000c",
  // A workspace that does NOT exist, so `workspace.createLocal` can be driven
  // to a real success instead of to a refusal shared by every caller.
  freshWorkspace: "5a000000-0000-4000-8000-00000000000d",
  freshSpace: "5a000000-0000-4000-8000-00000000000e",
} as const;

let sequence = 0x20000;
const uuid = (): string =>
  `5a000000-0000-4000-8000-${(sequence++).toString(16).padStart(12, "0")}`;

/**
 * A capability no command's authorization consults, held only so a narrowed
 * scope stays legal. `ExecutionContext.capabilityScope` is `.min(1)`, so
 * removing the single capability a command needs would otherwise fail contract
 * validation and the probe would read a rejected envelope as a passing test.
 */
const FILLER: Capability = "capture.audioRead";

/**
 * The same principal with only its KIND changed — the discriminator the
 * principal-kind suite below is built on.
 *
 * Two different principals would differ in membership, role and Space access,
 * and any of those explains a different verdict just as well as the kind does;
 * a probe that cannot tell which one answered proves nothing. Flipping one
 * field of one context leaves exactly one candidate explanation, because
 * `principalKind` is read in four places in the whole authorization pass and
 * nowhere else.
 */
const flippedContext = (
  principalKind: "human" | "agent",
  capabilityScope: readonly Capability[],
  overrides: {
    readonly workspaceId?: string;
    readonly spaceScope?: readonly string[];
    readonly origin?: "desktop" | "maintenance";
    readonly policyVersion?: number;
  } = {},
): ExecutionContext =>
  ExecutionContextSchema.parse({
    principalId: ids.owner,
    principalKind,
    credentialId: ids.ownerCredential,
    grantId: ids.ownerGrant,
    policyVersion: overrides.policyVersion ?? 1,
    workspaceId: overrides.workspaceId ?? ids.workspace,
    spaceScope: overrides.spaceScope ?? [ids.rootSpace],
    capabilityScope,
    origin: overrides.origin ?? "desktop",
  });

const context = (
  principalKind: "human" | "agent",
  capabilityScope: readonly Capability[],
): ExecutionContext =>
  ExecutionContextSchema.parse(
    principalKind === "human"
      ? {
          principalId: ids.owner,
          principalKind: "human",
          credentialId: ids.ownerCredential,
          grantId: ids.ownerGrant,
          policyVersion: 1,
          workspaceId: ids.workspace,
          spaceScope: [ids.rootSpace],
          capabilityScope,
          origin: "desktop",
        }
      : {
          principalId: ids.agent,
          principalKind: "agent",
          credentialId: ids.agentCredential,
          grantId: ids.agentGrant,
          policyVersion: 1,
          workspaceId: ids.workspace,
          spaceScope: [ids.rootSpace],
          capabilityScope,
          origin: "mcp",
        },
  );

// ---------------------------------------------------------------------------
// Payloads, synthesized from the same Zod schemas the kernel validates with.
//
// Hand-writing 135 payloads would rot the day a required field moved, and a
// stale payload fails as a contract rejection — which reads exactly like the
// authorization answer this file is asking for. Generating them from the
// schema cannot be wrong about shape, and a schema this cannot instantiate
// throws by name rather than skipping the command silently.
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;

/** Ordered widest-first; the first one the pattern accepts wins. */
const PATTERN_CANDIDATES: readonly string[] = [
  "x",
  "a".repeat(64),
  "2026-07-20",
  "someone@example.com",
  "1",
];

let instant = Date.parse("2026-07-20T09:00:00.000Z");
const nextInstant = (): string => {
  instant += 60_000;
  return new Date(instant).toISOString();
};

const resolve = (
  schema: JsonSchema,
  defs: Record<string, JsonSchema>,
): JsonSchema => {
  const ref = schema["$ref"];
  if (typeof ref !== "string") return schema;
  const target = defs[ref.replace("#/$defs/", "")];
  if (target === undefined) throw new Error(`Unresolvable ${ref}.`);
  return resolve(target, defs);
};

const instantiate = (
  raw: JsonSchema,
  defs: Record<string, JsonSchema>,
  fillOptional: boolean,
): unknown => {
  const schema = resolve(raw, defs);
  if ("const" in schema) return schema["const"];
  const enumerated = schema["enum"];
  if (Array.isArray(enumerated) && enumerated.length > 0) return enumerated[0];
  for (const key of ["anyOf", "oneOf"] as const) {
    const branches = schema[key];
    if (Array.isArray(branches) && branches.length > 0) {
      // A nullable field is `anyOf: [T, {type: "null"}]`; taking null would
      // satisfy the schema while telling the arm nothing, so the real branch
      // wins whenever there is one.
      const chosen =
        (branches as JsonSchema[]).find(
          (branch) => resolve(branch, defs)["type"] !== "null",
        ) ?? (branches[0] as JsonSchema);
      return instantiate(chosen, defs, fillOptional);
    }
  }
  const allOf = schema["allOf"];
  if (Array.isArray(allOf) && allOf.length > 0)
    return instantiate(allOf[0] as JsonSchema, defs, fillOptional);

  switch (schema["type"]) {
    case "null":
      return null;
    case "boolean":
      return false;
    case "integer":
    case "number": {
      const minimum = schema["minimum"];
      return typeof minimum === "number" ? minimum : 1;
    }
    case "array": {
      const minItems = schema["minItems"];
      const count = typeof minItems === "number" && minItems > 0 ? minItems : 1;
      const items = schema["items"];
      if (typeof items !== "object" || items === null)
        throw new Error("An array without an item schema.");
      return Array.from({ length: count }, () =>
        instantiate(items as JsonSchema, defs, fillOptional),
      );
    }
    case "object": {
      const properties = (schema["properties"] ?? {}) as Record<
        string,
        JsonSchema
      >;
      const required = new Set(
        Array.isArray(schema["required"])
          ? (schema["required"] as string[])
          : [],
      );
      const value: Record<string, unknown> = {};
      for (const [key, property] of Object.entries(properties)) {
        if (!required.has(key) && !fillOptional) continue;
        value[key] = instantiate(property, defs, fillOptional);
      }
      return value;
    }
    case "string": {
      if (schema["format"] === "uuid") return uuid();
      // Strictly increasing, because several payloads carry an interval and
      // refuse one that ends before it starts. Properties are instantiated in
      // schema declaration order, so the later field gets the later instant.
      if (schema["format"] === "date-time") return nextInstant();
      const pattern = schema["pattern"];
      if (typeof pattern === "string") {
        // Tried against the real regex rather than guessed from its text: the
        // candidate that matches is the answer, and a pattern none of them fit
        // fails here, by command name, instead of arriving at the kernel as a
        // contract rejection that reads exactly like an authorization answer.
        const expression = new RegExp(pattern, "u");
        const candidate = PATTERN_CANDIDATES.find((value) =>
          expression.test(value),
        );
        if (candidate === undefined)
          throw new Error(`A string constrained by ${pattern}.`);
        return candidate;
      }
      const minLength = schema["minLength"];
      const length =
        typeof minLength === "number" && minLength > 0 ? minLength : 1;
      return "x".repeat(length);
    }
    default:
      throw new Error(`Uninstantiable schema ${JSON.stringify(schema)}.`);
  }
};

/**
 * The commands whose authorization arm asks its SECOND question only after it
 * has resolved a real target, plus the two that are agent-only. Everything
 * else is probed against a target that does not exist, which is enough because
 * the grant-level consult is hoisted before every read (ADR-067, restated at
 * the top of kernel.ts) — and if that ordering were ever broken, the necessity
 * probe below would go red, which is the second thing this file measures.
 *
 * Named rather than skipped: a command that needs a fixture and does not get
 * one fails its necessity probe loudly, because the additional capability is
 * never consulted and no denial is ever produced.
 */
const PROBES: Partial<
  Record<CommandName, { readonly patch?: Record<string, unknown> }>
> = {
  // Promotion inserts a Task and linking can create a Person; both consults
  // happen only once the meeting resolves, so both need the real meeting.
  "meeting.promoteWorkItem": { patch: { meetingId: ids.meeting } },
  "meeting.linkParticipants": { patch: { meetingId: ids.meeting } },
  // Fields the generated JSON Schema cannot describe well enough to guess: an
  // IANA zone, a hex digest, an enum the refinement narrows further. They are
  // payload SHAPE, never a capability — nothing here states an expectation
  // about authorization.
  "workspace.createLocal": { patch: { timezone: "Europe/Warsaw" } },
  // The nine template/automation/recurrence.sweep commands need no patch: they
  // authorize at workspace level against the owner membership the fixture
  // already holds, so their `task.create` consult is reached as it stands.
};

/**
 * Which kind of principal the probe runs as, READ FROM THE SAME TABLE the
 * kernel reads. It used to be two hand-written rows naming
 * `agent.checkpointCreate` and `agent.handoffSubmit` — a mirror of the exact
 * field `principalKinds` now states, and a mirror is the second opinion this
 * file exists to abolish.
 *
 * Human unless the table forbids it, because human is what the fixture's owner
 * membership makes reachable. Deriving it also makes the necessity probe below
 * the oracle for an agent-only marker: mark the wrong kind and the probe runs
 * as the kind `isAgentAccessCommandAuthorized` short-circuits on, no consult
 * happens, no denial is produced, and the probe goes red by name.
 */
const probeKind = (commandName: CommandName): "human" | "agent" =>
  operationPermitsPrincipalKind(COMMAND_CAPABILITIES[commandName], "human")
    ? "human"
    : "agent";

const payloadSchemas = new Map<CommandName, JsonSchema>();
for (const option of CommandEnvelopeSchema.options) {
  payloadSchemas.set(
    option.shape.commandName.value,
    z.toJSONSchema(option.shape.payload as z.ZodType, {
      io: "input",
      unrepresentable: "any",
    }) as JsonSchema,
  );
}

const payloadFor = (commandName: CommandName): Record<string, unknown> => {
  const schema = payloadSchemas.get(commandName);
  if (schema === undefined) throw new Error(`No schema for ${commandName}.`);
  const defs = (schema["$defs"] ?? {}) as Record<string, JsonSchema>;
  const patch = PROBES[commandName]?.patch ?? {};
  const errors: string[] = [];
  // Required-only first, then every property: a command refined with "at least
  // one field must be present" rejects the minimal object, and one refined
  // with mutually exclusive fields rejects the maximal one. Trying both covers
  // the whole union without a per-command table of which is which.
  for (const fillOptional of [false, true]) {
    let candidate: Record<string, unknown>;
    try {
      candidate = {
        ...(instantiate(schema, defs, fillOptional) as Record<string, unknown>),
        ...patch,
      };
    } catch (error) {
      errors.push(`${fillOptional ? "full" : "minimal"}: ${String(error)}`);
      continue;
    }
    const parsed = CommandEnvelopeSchema.safeParse({
      contractVersion: 1,
      commandId: uuid(),
      workspaceId: ids.workspace,
      idempotencyKey: `capabilities-probe-${sequence}`,
      expectedVersions: {},
      correlationId: uuid(),
      commandName,
      payload: candidate,
    });
    if (parsed.success) return candidate;
    errors.push(
      `${fillOptional ? "full" : "minimal"}: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
    );
  }
  throw new Error(
    `Could not synthesize a payload for ${commandName}; add a patch to PROBES. ${errors.join(" | ")}`,
  );
};

const commandNames: readonly CommandName[] = CommandEnvelopeSchema.options.map(
  (option) => option.shape.commandName.value,
);

/**
 * Built once, eagerly, and every failure reported together: a synthesizer that
 * stops at the first unsatisfiable schema hides the rest, and a maintainer who
 * has to rerun the suite once per missing patch stops reading the message.
 */
const PAYLOADS: ReadonlyMap<CommandName, Record<string, unknown>> = (() => {
  const built = new Map<CommandName, Record<string, unknown>>();
  const failures: string[] = [];
  for (const commandName of commandNames) {
    try {
      built.set(commandName, payloadFor(commandName));
    } catch (error) {
      failures.push(String(error));
    }
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
  return built;
})();

// ---------------------------------------------------------------------------

const fixture = (): ReferenceHarness => {
  const harness = createReferenceHarness();
  const owner = context("human", [
    "workspace.createLocal",
    "meeting.upsertImported",
  ]);
  harness.authorization.register(owner);
  const created = harness.kernel.execute(owner, {
    contractVersion: 1,
    commandId: uuid(),
    workspaceId: ids.workspace,
    idempotencyKey: "capabilities-fixture-workspace",
    expectedVersions: {},
    correlationId: uuid(),
    commandName: "workspace.createLocal",
    payload: {
      workspaceId: ids.workspace,
      rootSpaceId: ids.rootSpace,
      ownerPrincipalId: ids.owner,
      name: "Capability conformance workspace",
      timezone: "Europe/Warsaw",
    },
  });
  assert.equal(
    created.kind === "command_outcome" ? created.outcome.outcome : created.kind,
    "success",
    "the fixture workspace must exist, or every probe measures a missing workspace",
  );
  // The one record a target-resolving arm needs: two commands ask their second
  // capability question only after the meeting resolves.
  const meeting = harness.kernel.execute(owner, {
    contractVersion: 1,
    commandId: uuid(),
    workspaceId: ids.workspace,
    idempotencyKey: "capabilities-fixture-meeting",
    expectedVersions: {},
    correlationId: uuid(),
    commandName: "meeting.upsertImported",
    payload: {
      meeting: {
        id: ids.meeting,
        workspaceId: ids.workspace,
        spaceId: ids.rootSpace,
        connectionId: "capabilities-connection",
        externalMeetingId: "capabilities-meeting-1",
        title: "Capability conformance meeting",
        startedAt: "2026-07-20T09:00:00.000Z",
        participants: [{ externalId: "participant-1", name: "Antek" }],
        workItems: [
          {
            id: ids.workItem,
            kind: "follow_up",
            sourceExternalId: "item-1",
            title: "Publish the table",
            state: "open",
            sourceControlled: true,
            locallyModified: false,
            version: 1,
          },
        ],
        contentHash: "c".repeat(64),
        triage: "ready",
        missingComponents: [],
        version: 1,
        updatedAt: "2026-07-20T10:00:00.000Z",
      },
    },
  });
  assert.equal(
    meeting.kind === "command_outcome" ? meeting.outcome.outcome : meeting.kind,
    "success",
    "the fixture meeting must exist, or the additional-capability probes measure nothing",
  );
  return harness;
};

const diagnosticFor = (
  harness: ReferenceHarness,
  commandName: CommandName,
  capabilityScope: readonly Capability[],
): string => {
  const probe = context(probeKind(commandName), capabilityScope);
  // Re-registered every time: the in-memory policy consults BOTH the request
  // context's scope and the scope frozen on the stored grant, so a narrowed
  // context alone would still be authorized by the wide grant behind it.
  harness.authorization.register(probe);
  const response: ApplicationCommandResponse = harness.kernel.execute(probe, {
    contractVersion: 1,
    commandId: uuid(),
    workspaceId: ids.workspace,
    idempotencyKey: `capabilities-probe-${uuid()}`,
    expectedVersions: {},
    correlationId: uuid(),
    commandName,
    payload: PAYLOADS.get(commandName),
  });
  if (response.kind !== "command_outcome")
    throw new Error(
      `${commandName}: the probe envelope was rejected by the contract, so nothing about authorization was measured — ${JSON.stringify(response.issues)}`,
    );
  return response.outcome.outcome === "success"
    ? "success"
    : ((response.outcome as { readonly diagnosticCode?: string })
        .diagnosticCode ?? "unknown");
};

/**
 * How many commands a pass must have actually executed. Derived from the union
 * and asserted at the end of every probe loop: a suite that iterates nothing
 * reports the same green as one that iterates everything, and this repository
 * has already been fooled by a harness returning success on zero tests.
 */
const EXPECTED_PROBES = commandNames.length;

describe("Operation capabilities", () => {
  it("states a capability set the kernel accepts for every command", () => {
    const harness = fixture();
    let probes = 0;
    for (const commandName of commandNames) {
      const published = operationCapabilities(
        COMMAND_CAPABILITIES[commandName],
      );
      const diagnostic = diagnosticFor(harness, commandName, [
        ...published,
        FILLER,
      ]);
      probes += 1;
      assert.notEqual(
        diagnostic,
        "authorization.denied",
        `${commandName}: the catalog publishes [${published.join(", ")}] and the kernel still refused the grant, so an agent holding exactly what the catalog told it to hold cannot run this command`,
      );
    }
    assert.equal(probes, EXPECTED_PROBES);
  });

  it("states no capability the kernel does not require", () => {
    const harness = fixture();
    let probes = 0;
    for (const commandName of commandNames) {
      const published = operationCapabilities(
        COMMAND_CAPABILITIES[commandName],
      );
      probes += 1;
      for (const withheld of published) {
        const narrowed = published.filter(
          (capability) => capability !== withheld,
        );
        const diagnostic = diagnosticFor(harness, commandName, [
          ...narrowed,
          FILLER,
        ]);
        assert.equal(
          diagnostic,
          "authorization.denied",
          `${commandName}: withholding ${withheld} did not deny the grant (answered ${diagnostic}), so either the kernel does not consult it — and the catalog is over-stating what a grant must carry — or this probe never drove the command far enough to ask`,
        );
      }
    }
    assert.equal(probes, EXPECTED_PROBES);
  });

  it("publishes every capability the kernel consults", () => {
    const harness = fixture();
    const consulted: string[] = [];
    const policy = harness.authorization;
    const authorize = policy.authorize.bind(policy);
    policy.authorize = (request: AuthorizationRequest): boolean => {
      consulted.push(request.capability);
      return authorize(request);
    };
    // Every capability, so nothing short-circuits on a refusal and each arm
    // runs as far as its structural checks allow. What this catches is the
    // opposite defect from the two probes above: a NEW second consult added to
    // an arm without a matching entry in the table.
    const everything = [
      ...new Set(
        commandNames.flatMap((commandName) =>
          operationCapabilities(COMMAND_CAPABILITIES[commandName]),
        ),
      ),
      FILLER,
    ];
    let probes = 0;
    for (const commandName of commandNames) {
      consulted.length = 0;
      diagnosticFor(harness, commandName, everything);
      probes += 1;
      const published = new Set<string>(
        operationCapabilities(COMMAND_CAPABILITIES[commandName]),
      );
      for (const capability of new Set(consulted))
        assert.ok(
          published.has(capability),
          `${commandName}: the kernel consulted ${capability}, which the catalog does not publish — an agent comparing requiredCapability against its scope would be denied with nothing to act on`,
        );
    }
    assert.equal(probes, EXPECTED_PROBES);
  });
});

// ---------------------------------------------------------------------------
// Principal kind — the OTHER thing the table states and both readers consult.
//
// The defect: `capture.requestAudioDeletion` authorizes against
// `capture.process`, which every `operate` and `full_access` grant carries, so
// the moment the MCP catalog started deriving reachability from capabilities it
// listed a command whose kernel arm refuses every principal that is not human.
// The rule was real and the catalog could not see it, because it lived inside a
// `case` body. `principalKinds` moves it where both readers look; this suite is
// what stops that field from becoming a second opinion nobody checks.
//
// The oracle is a DIFFERENCE, not an outcome. Asserting "an agent is refused"
// proves nothing on its own — the probe names targets that mostly do not
// resolve, so almost everything is refused for reasons that have nothing to do
// with the kind. So each marked command is run twice through the real kernel
// with ONE field changed, and the two answers must differ. An answer is the
// refusal code together with how many capability consults the pass made,
// because the two halves catch different arms: `workspace.createLocal` differs
// by outcome (a human really creates the workspace, an agent is refused), the
// capture deletions differ by consult count (the kind gate sits between the
// hoisted grant-level consult and the Space-level one), and the agent-only pair
// differs by consult count in the other direction (a human short-circuits
// before the consult, which is exactly why `agent-access.ts` asks the kind
// first).
//
// The second test is the half a table cannot enforce: every command the table
// is SILENT about must answer identically for both kinds. That is what would
// catch a new hand-written kind check added to an arm — the exact way the
// catalog and the kernel drifted apart the last time.
// ---------------------------------------------------------------------------

const PROBE_KINDS: readonly ["human", "agent"] = ["human", "agent"];

interface KindFixture {
  readonly harness: ReferenceHarness;
  readonly captureId: string;
  readonly policyVersion: number;
  readonly workspaceVersion: number;
  readonly grantVersion: number;
}

/**
 * The fixture the kind probes need on top of the capability one: a capture that
 * really exists, and an agent grant that really exists.
 *
 * Both are here because the kind gates they guard sit AFTER a target is
 * resolved, and a probe whose target is missing is refused before it reaches
 * the gate — identically for both kinds, which is a green that measured
 * nothing. Minting the grant bumps the workspace's policy version, so the
 * versions every probe context and envelope needs are read back from the store
 * rather than assumed; a stale policy version refuses every later probe for a
 * reason unrelated to its kind.
 */
const kindFixture = (): KindFixture => {
  const harness = fixture();
  const owner = context("human", ["capture.submit", "agent.manageAccess"]);
  harness.authorization.register(owner);
  const submitted = harness.kernel.execute(owner, {
    contractVersion: 1,
    commandId: uuid(),
    workspaceId: ids.workspace,
    idempotencyKey: "principal-kind-fixture-capture",
    expectedVersions: {},
    correlationId: uuid(),
    commandName: "capture.submit",
    payload: {
      spaceId: ids.rootSpace,
      original: {
        kind: "text",
        text: "A capture the deletion probes resolve.",
      },
      deviceId: "principal-kind-device",
      source: "global_quick_capture",
    },
  });
  if (
    submitted.kind !== "command_outcome" ||
    submitted.outcome.outcome !== "success" ||
    submitted.outcome.projection.kind !== "capture.stored"
  )
    throw new Error(
      "the fixture capture must exist, or both audio-deletion probes are refused before the kind gate and answer alike",
    );
  const captureId = submitted.outcome.projection.captureId;
  const granted = harness.kernel.execute(owner, {
    contractVersion: 1,
    commandId: uuid(),
    workspaceId: ids.workspace,
    idempotencyKey: "principal-kind-fixture-grant",
    expectedVersions: { [ids.workspace]: 1 },
    correlationId: uuid(),
    commandName: "agent.grantCreate",
    payload: {
      grantId: ids.agentGrant,
      membershipId: ids.agentMembership,
      agentPrincipalId: ids.agent,
      displayName: "Principal kind conformance operator",
      preset: "operate",
      capabilityScope: [...capabilitiesForAgentGrantPreset("operate")],
      spaces: [
        {
          spaceGrantId: ids.agentSpaceGrant,
          spaceId: ids.rootSpace,
          access: "edit",
        },
      ],
      credentialId: ids.agentCredential,
      credentialDigest: "b".repeat(64),
    },
  });
  assert.equal(
    granted.kind === "command_outcome" ? granted.outcome.outcome : granted.kind,
    "success",
    "the fixture agent grant must exist, or the three grant-editing probes name a target that is not there and both kinds answer alike",
  );
  const state = harness.store.read((view) => ({
    workspace: view.getWorkspace(WorkspaceIdSchema.parse(ids.workspace)),
    grant: view.getAgentGrant(GrantIdSchema.parse(ids.agentGrant)),
  }));
  if (state.workspace === undefined || state.grant === undefined)
    throw new Error("the fixture workspace and grant must be readable back");
  return {
    harness,
    captureId,
    policyVersion: state.workspace.policyVersion ?? 1,
    workspaceVersion: state.workspace.version,
    grantVersion: state.grant.version,
  };
};

interface KindProbe {
  /** Payload fields the synthesizer cannot guess: real targets, mostly. */
  readonly patch?: Record<string, unknown>;
  readonly expectedVersions?: Record<string, number>;
  readonly origin?: "desktop" | "maintenance";
  readonly workspaceId?: string;
  readonly spaceScope?: readonly string[];
}

/**
 * Per-command SHAPE — targets, versions, the origin — and never an expectation.
 * Nothing here states which kind may run what; that comes from the table, and
 * a command the table marks without an entry here throws by name below rather
 * than being measured against a target that does not exist.
 */
const kindProbes = (
  state: KindFixture,
): Partial<Record<CommandName, KindProbe>> => ({
  // Driven against a workspace that does NOT yet exist, so the human answer is
  // a real success. Against the fixture workspace both kinds are refused — one
  // by the kind gate, one by an executor that will not create what is already
  // there — and the probe could not tell them apart.
  "workspace.createLocal": {
    patch: {
      workspaceId: ids.freshWorkspace,
      rootSpaceId: ids.freshSpace,
      ownerPrincipalId: ids.owner,
      name: "A workspace this probe really creates",
      timezone: "Europe/Warsaw",
    },
    workspaceId: ids.freshWorkspace,
    spaceScope: [ids.freshSpace],
  },
  "capture.requestAudioDeletion": { patch: { captureId: state.captureId } },
  // `maintenance` for BOTH flips, not for the human one: the origin gate is a
  // separate rule and a probe that gave only one side the right origin would
  // report the origin's refusal as the kind's.
  "capture.confirmAudioDeletion": {
    patch: {
      captureId: state.captureId,
      audioContentSha256: "a".repeat(64),
    },
    origin: "maintenance",
  },
  "agent.grantCreate": {
    patch: {
      grantId: uuid(),
      membershipId: uuid(),
      agentPrincipalId: uuid(),
      displayName: "A grant this probe really mints",
      preset: "operate",
      capabilityScope: [...capabilitiesForAgentGrantPreset("operate")],
      spaces: [
        { spaceGrantId: uuid(), spaceId: ids.rootSpace, access: "edit" },
      ],
      credentialId: uuid(),
      credentialDigest: "c".repeat(64),
    },
    expectedVersions: { [ids.workspace]: state.workspaceVersion },
  },
  "agent.grantRevoke": {
    patch: { grantId: ids.agentGrant },
    expectedVersions: { [ids.agentGrant]: state.grantVersion },
  },
  "agent.grantRotateCredential": {
    patch: {
      grantId: ids.agentGrant,
      credentialId: uuid(),
      credentialDigest: "d".repeat(64),
    },
    expectedVersions: { [ids.agentGrant]: state.grantVersion },
  },
  "agent.grantSetScope": {
    patch: {
      grantId: ids.agentGrant,
      preset: "observe",
      capabilityScope: [...capabilitiesForAgentGrantPreset("observe")],
      spaces: [
        {
          spaceGrantId: ids.agentSpaceGrant,
          spaceId: ids.rootSpace,
          access: "view",
        },
      ],
    },
    expectedVersions: { [ids.agentGrant]: state.grantVersion },
  },
  // The agent-only pair needs no target: their arm asks the kind before the
  // consult, so the consult COUNT is what differs and a synthesized run id is
  // enough to reach it.
  "agent.checkpointCreate": {},
  "agent.handoffSubmit": {},
});

/**
 * One run of one command as one kind, reported as the refusal code plus the
 * sequence of capability consults the pass made. A fresh harness every time on
 * purpose: the grant probes succeed for the permitted kind, and revoking or
 * re-scoping a grant would leave the next probe measuring a target that has
 * already moved.
 */
const kindAnswer = (
  commandName: CommandName,
  principalKind: "human" | "agent",
): string => {
  const state = kindFixture();
  const probe = kindProbes(state)[commandName];
  if (
    probe === undefined &&
    COMMAND_CAPABILITIES[commandName].principalKinds !== undefined
  )
    throw new Error(
      `${commandName}: the table restricts which principal kinds may run it and this suite has no probe for it, so the restriction would be measured against a target that does not resolve — add an entry to kindProbes`,
    );
  // The SHAPE of every consult, not how many there were. A bare count cannot
  // tell an arm that reached its Space-level question from one that refused and
  // had its verdict re-taken at workspace level — `RecordedAuthorization` asks
  // the policy again, without a Space, to decide whether the grant is what
  // refused, and that second ask lands here too. Both answered "2" for
  // `capture.requestAudioDeletion` and the probe went green on a real
  // difference. Recording whether a Space was named separates them, and the
  // re-take is itself signal: it happens only when the pass refused.
  const consulted: string[] = [];
  const policy = state.harness.authorization;
  const authorize = policy.authorize.bind(policy);
  policy.authorize = (request: AuthorizationRequest): boolean => {
    consulted.push(
      request.spaceId === undefined
        ? request.capability
        : `${request.capability}@space`,
    );
    return authorize(request);
  };
  const workspaceId = probe?.workspaceId ?? ids.workspace;
  const executionContext = flippedContext(
    principalKind,
    [...operationCapabilities(COMMAND_CAPABILITIES[commandName]), FILLER],
    {
      workspaceId,
      policyVersion: state.policyVersion,
      ...(probe?.spaceScope === undefined
        ? {}
        : { spaceScope: probe.spaceScope }),
      ...(probe?.origin === undefined ? {} : { origin: probe.origin }),
    },
  );
  state.harness.authorization.register(executionContext);
  const response = state.harness.kernel.execute(executionContext, {
    contractVersion: 1,
    commandId: uuid(),
    workspaceId,
    idempotencyKey: `principal-kind-${uuid()}`,
    expectedVersions: probe?.expectedVersions ?? {},
    correlationId: uuid(),
    commandName,
    payload: { ...PAYLOADS.get(commandName), ...(probe?.patch ?? {}) },
  });
  if (response.kind !== "command_outcome")
    throw new Error(
      `${commandName} as ${principalKind}: the probe envelope was rejected by the contract, so nothing about the principal kind was measured — ${JSON.stringify(response.issues)}`,
    );
  const verdict =
    response.outcome.outcome === "success"
      ? "success"
      : ((response.outcome as { readonly diagnosticCode?: string })
          .diagnosticCode ?? "unknown");
  return `${verdict} after [${consulted.join(", ")}]`;
};

const MARKED_COMMANDS: readonly CommandName[] = commandNames.filter(
  (commandName) =>
    COMMAND_CAPABILITIES[commandName].principalKinds !== undefined,
);

/**
 * The nine rules the kernel used to state as literals inside its own arms,
 * written down once more so that DELETING one is visible.
 *
 * Everything else in this suite is derived from the table, and derivation has
 * exactly one blind spot, which is the blind spot that matters here: the kernel
 * READS the table, so removing a row removes the rule from both readers at
 * once, they go on agreeing, and every derived probe stays green over a
 * protection that has silently gone. Measured, not assumed — deleting
 * `principalKinds` from `capture.requestAudioDeletion` left all four derived
 * probes and both catalog probes green while the catalog quietly went back to
 * offering the command to every `operate` grant.
 *
 * So this is a list, knowingly, and it is the only one in this file. It is not
 * a mirror of another list in the repository — those literals no longer exist —
 * and it is not asserted against the table alone: every row is driven through
 * the running kernel below, so a row kept here while the kernel stopped
 * enforcing it fails just as loudly as a row deleted.
 */
const RULES_THE_KERNEL_USED_TO_STATE_BY_HAND: Readonly<
  Partial<Record<CommandName, readonly PrincipalKind[]>>
> = {
  "workspace.createLocal": ["human"],
  "capture.requestAudioDeletion": ["human"],
  "capture.confirmAudioDeletion": ["human"],
  "agent.grantCreate": ["human"],
  "agent.grantRotateCredential": ["human"],
  "agent.grantRevoke": ["human"],
  "agent.grantSetScope": ["human"],
  "agent.checkpointCreate": ["agent"],
  "agent.handoffSubmit": ["agent"],
};

describe("Operation principal kinds", () => {
  it("refuses a forbidden principal kind everywhere the table names one", () => {
    assert.ok(
      MARKED_COMMANDS.length > 0,
      "a table stating no kind restriction at all would make every assertion below vacuous",
    );
    let probes = 0;
    for (const commandName of MARKED_COMMANDS) {
      const requirement = COMMAND_CAPABILITIES[commandName];
      const permitted = PROBE_KINDS.filter((kind) =>
        operationPermitsPrincipalKind(requirement, kind),
      );
      const forbidden = PROBE_KINDS.filter(
        (kind) => !operationPermitsPrincipalKind(requirement, kind),
      );
      assert.ok(
        permitted.length > 0 && forbidden.length > 0,
        `${commandName}: the table permits [${permitted.join(", ")}] of the two kinds this suite can drive, so there is nothing to compare and the row is unmeasured`,
      );
      for (const allowed of permitted)
        for (const refused of forbidden) {
          probes += 1;
          assert.notEqual(
            kindAnswer(commandName, allowed),
            kindAnswer(commandName, refused),
            `${commandName}: the table says only [${(requirement.principalKinds ?? []).join(", ")}] may run it, and the kernel answered a ${refused} principal exactly as it answered a ${allowed} one — either the kernel does not enforce the restriction the MCP catalog is filtering on, or this probe never drove the command far enough to reach the gate`,
          );
        }
    }
    assert.equal(probes, MARKED_COMMANDS.length);
  });

  it("treats a human and an agent alike everywhere the table is silent", () => {
    let probes = 0;
    for (const commandName of commandNames) {
      if (COMMAND_CAPABILITIES[commandName].principalKinds !== undefined)
        continue;
      probes += 1;
      assert.equal(
        kindAnswer(commandName, "human"),
        kindAnswer(commandName, "agent"),
        `${commandName}: the kernel answers a human and an agent differently and the table says nothing about it — an unstated kind rule is invisible to the MCP catalog, which is how it came to advertise capture.requestAudioDeletion to every operate grant`,
      );
    }
    assert.equal(probes, commandNames.length - MARKED_COMMANDS.length);
  });

  it("still enforces every principal-kind rule the kernel used to state by hand", () => {
    const pinned = Object.entries(RULES_THE_KERNEL_USED_TO_STATE_BY_HAND) as [
      CommandName,
      readonly PrincipalKind[],
    ][];
    let probes = 0;
    for (const [commandName, kinds] of pinned) {
      probes += 1;
      assert.deepEqual(
        COMMAND_CAPABILITIES[commandName].principalKinds,
        kinds,
        `${commandName}: the kernel refused every principal that is not [${kinds.join(", ")}] before this table existed, and the table no longer says so — the kernel reads the table, so the rule is gone from the kernel too and the MCP catalog will start offering the command to grants that can only be refused by it`,
      );
      for (const refused of PROBE_KINDS.filter((kind) => !kinds.includes(kind)))
        assert.notEqual(
          kindAnswer(commandName, kinds[0] as "human" | "agent"),
          kindAnswer(commandName, refused),
          `${commandName}: the table still says only [${kinds.join(", ")}] may run it, and the kernel answered a ${refused} principal identically — the row is being kept by a table nothing enforces`,
        );
    }
    assert.equal(probes, pinned.length);
    // The other direction, so a row silently ADDED is visible too: a new kind
    // restriction removes operations from every agent's catalog, which is a
    // product decision and not a refactor.
    assert.deepEqual(
      [...MARKED_COMMANDS].sort(),
      pinned.map(([commandName]) => commandName).sort(),
    );
  });
});
