import { createHash } from "node:crypto";

import { buildOperationCatalog, completeOperationScope } from "./catalog.js";
import { MCP_CONTRACT_VERSION, MCP_TOOL_NAMES } from "./protocol.js";

/**
 * External evidence (2026-07-23): an integrator spent hours on a workspace
 * whose desktop application had been updated while a long-lived MCP server
 * process kept serving the previous build's schemas, catalog, and guidance —
 * new kernel answers, old published contract, one coherent-looking server.
 * Nothing in any response distinguished the two, and `contractVersion` cannot:
 * it stays 1 across builds that regenerate every schema.
 *
 * A fingerprint can. It is taken over the artifacts that actually drift — the
 * whole generated operation catalog, its guidance, and the tool list — so two
 * processes running the same code always agree and two running different code
 * never do. Both the desktop host and the MCP server process compute it from
 * their own copy, so a client reads them side by side and sees the split in one
 * call.
 *
 * Not a version and not ordered: it says "these two processes are the same
 * build" or "they are not", never which is newer.
 */
const fingerprint = (): string => {
  // Every operation, not the grant's subset: the stamp must identify the build,
  // and two grants of the same build have to produce the same value.
  const catalog = buildOperationCatalog(completeOperationScope());
  return createHash("sha256")
    .update(
      JSON.stringify({
        contractVersion: MCP_CONTRACT_VERSION,
        tools: MCP_TOOL_NAMES,
        guidance: catalog.guidance,
        operations: catalog.operations,
      }),
    )
    .digest("hex")
    .slice(0, 32);
};

let stamp: string | undefined;

/**
 * The generated contract's identity in this process. Hashing the full catalog
 * is the same work a single `constellation://v1/operations` read already does,
 * and the result cannot change while the process lives, so it is taken once.
 */
export const contractFingerprint = (): string => (stamp ??= fingerprint());

/**
 * The fingerprint the desktop host published alongside its capabilities, if it
 * published one. A host that publishes none predates this field, which is
 * itself a build difference.
 */
export const hostContractFingerprint = (
  result: unknown,
): string | undefined => {
  if (typeof result !== "object" || result === null) return undefined;
  const build = (result as { readonly build?: unknown }).build;
  if (typeof build !== "object" || build === null) return undefined;
  const value = (build as { readonly contractFingerprint?: unknown })
    .contractFingerprint;
  return typeof value === "string" ? value : undefined;
};

export const CONTRACT_SPLIT_WARNING =
  "This MCP server process is serving contract artifacts (schemas, catalog, guidance) that the running Constellation application no longer generates. Its answers come from the current kernel, so behaviour and documentation disagree. Restart the MCP server process — restarting the application alone does not replace it.";

/**
 * The MCP server process's own half of the build stamp, with the comparison
 * already made: an integrator should not have to know that a fingerprint
 * mismatch means "stale process" to notice one.
 */
export const serverBuildStamp = (
  hostFingerprint: string | undefined,
): {
  readonly process: "mcp-server";
  readonly contractFingerprint: string;
  readonly matchesHost: boolean;
  readonly warning?: string;
} => {
  const own = contractFingerprint();
  const matchesHost = hostFingerprint === own;
  return {
    process: "mcp-server",
    contractFingerprint: own,
    matchesHost,
    ...(matchesHost ? {} : { warning: CONTRACT_SPLIT_WARNING }),
  };
};

/**
 * The host's capabilities result with this process's stamp folded in, so one
 * read of constellation://v1/capabilities shows both builds.
 */
export const withServerBuildStamp = (result: unknown): unknown => {
  if (typeof result !== "object" || result === null) return result;
  const build = (result as { readonly build?: unknown }).build;
  return {
    ...result,
    build: {
      ...(typeof build === "object" && build !== null ? build : {}),
      mcpServer: serverBuildStamp(hostContractFingerprint(result)),
    },
  };
};
