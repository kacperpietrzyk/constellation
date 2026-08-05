import assert from "node:assert/strict";
import test from "node:test";

import {
  capabilitiesForAgentGrantPreset,
  COMMAND_CAPABILITIES,
  CommandEnvelopeSchema,
  operationCapabilities,
  operationPermitsPrincipalKind,
  QUERY_CAPABILITIES,
  QueryEnvelopeSchema,
  type AgentGrantPreset,
  type CommandName,
  type OperationCapabilityRequirement,
  type QueryName,
} from "@constellation/contracts";

import { buildOperationCatalog } from "../src/catalog.js";

/**
 * The catalog half of the principal-kind claim. Its other half —
 * that the kernel really refuses what this table marks — is measured against
 * the running kernel in
 * packages/testkit/test/operation-capabilities.conformance.test.ts, which this
 * package cannot import; neither half is worth anything alone, so read them
 * together.
 *
 * What went wrong without it: the catalog stopped matching capability names
 * against operation names and started reading COMMAND_CAPABILITIES, which fixed
 * two operations an `operate` grant could reach and were never listed — and
 * began listing `capture.requestAudioDeletion`, whose capability is
 * `capture.process` (in every `operate` and `full_access` grant) and whose arm
 * refuses every principal that is not human. The capability said yes; the arm
 * said no; a capability-shaped filter could not see the difference.
 *
 * Nothing below names an operation by hand. The expected set is computed from
 * the same table the kernel authorizes against, so a row added to the table
 * moves the expectation and the catalog together — and the day the catalog
 * stops honouring the field, the two stop agreeing.
 */

const PRESETS: readonly AgentGrantPreset[] = ["operate", "full_access"];

const requirementFor = (
  name: string,
  kind: string,
): OperationCapabilityRequirement =>
  kind === "query"
    ? QUERY_CAPABILITIES[name as QueryName]
    : COMMAND_CAPABILITIES[name as CommandName];

test("lists an agent grant nothing its own principal kind cannot execute", () => {
  let probes = 0;
  for (const preset of PRESETS) {
    const scope = new Set<string>(capabilitiesForAgentGrantPreset(preset));
    const listed = new Set(
      buildOperationCatalog([...scope]).operations.map(
        (operation) => operation.name,
      ),
    );
    // Every envelope operation whose capabilities this preset holds — the
    // catalog's own reachability question, asked here independently — split by
    // the one further question the table answers.
    const reachable = [
      ...CommandEnvelopeSchema.options.map(
        (option) => [option.shape.commandName.value, "command"] as const,
      ),
      ...QueryEnvelopeSchema.options.map(
        (option) => [option.shape.queryName.value, "query"] as const,
      ),
    ].filter(([name, kind]) =>
      operationCapabilities(requirementFor(name, kind)).every((capability) =>
        scope.has(capability),
      ),
    );
    assert.ok(
      reachable.length > 20,
      `${preset}: a preset reaching almost nothing would make every assertion below pass without measuring anything (reached ${String(reachable.length)})`,
    );
    for (const [name, kind] of reachable) {
      probes += 1;
      const executable = operationPermitsPrincipalKind(
        requirementFor(name, kind),
        "agent",
      );
      // `agent.checkpointRevert` is the one row this test must not judge on
      // kind: an agent may hold the capability, and the catalog withholds the
      // command anyway because the dedicated revert tool answers the same
      // capability with the diagnostics the guidance promises. The suppression
      // is asserted by name in server.test.ts, where its reason lives.
      if (name === "agent.checkpointRevert") continue;
      assert.equal(
        listed.has(name),
        executable,
        executable
          ? `${preset}: ${name} is reachable with this preset's capabilities and an agent may execute it, yet the catalog withholds it`
          : `${preset}: the catalog offers ${name} to an agent grant, and the kernel arm behind it refuses any principal that is not [${(requirementFor(name, kind).principalKinds ?? []).join(", ")}] — an agent that follows the catalog spends a call to learn that`,
      );
    }
  }
  // A loop over nothing reports the same green as a loop over everything.
  assert.ok(
    probes > 200,
    `both presets together must probe every operation they reach, not ${String(probes)}`,
  );
});

test("withholds from an agent exactly the operations the table marks not-agent", () => {
  const marked = [
    ...CommandEnvelopeSchema.options
      .map((option) => option.shape.commandName.value)
      .filter(
        (name) =>
          !operationPermitsPrincipalKind(
            COMMAND_CAPABILITIES[name as CommandName],
            "agent",
          ),
      ),
    ...QueryEnvelopeSchema.options
      .map((option) => option.shape.queryName.value)
      .filter(
        (name) =>
          !operationPermitsPrincipalKind(
            QUERY_CAPABILITIES[name as QueryName],
            "agent",
          ),
      ),
  ];
  assert.ok(
    marked.length > 0,
    "a table marking nothing would make the assertion below vacuous — the filter could be deleted and this test would stay green",
  );
  // The widest scope any grant can hold, so absence here is never absence for
  // want of a capability.
  const widest = [...capabilitiesForAgentGrantPreset("full_access")];
  const listed = new Set(
    buildOperationCatalog(widest).operations.map((operation) => operation.name),
  );
  for (const name of marked)
    assert.ok(
      !listed.has(name),
      `${name}: the table says no agent principal may execute it, and the catalog offers it to a full_access grant anyway`,
    );
});
