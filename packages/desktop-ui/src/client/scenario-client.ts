import type { QueryEnvelope } from "@constellation/contracts";
import type {
  ConstellationRendererClient,
  RendererQueryResponse,
} from "@constellation/desktop-preload/client";

export interface ScenarioFixtures {
  readonly queries: Partial<
    Record<QueryEnvelope["queryName"], RendererQueryResponse>
  >;
}

/** Deterministic UI fixture adapter. It returns scripted contract outcomes only. */
export const createScenarioClient = (
  fixtures: ScenarioFixtures,
): ConstellationRendererClient => ({
  executeCommand: async () => ({
    kind: "contract_rejected",
    diagnosticCode: "contract.invalid",
    issues: [
      {
        path: "",
        code: "custom",
      },
    ],
  }),
  getBuildInfo: async () => ({
    channel: "developer-preview",
    persistence: "in-memory",
    version: "scenario",
  }),
  runQuery: async (query) => {
    const response = fixtures.queries[query.queryName];
    if (response !== undefined) return response;
    return {
      kind: "query_result",
      result: {
        contractVersion: 1,
        queryId: query.queryId,
        kernelTime: "2026-07-13T12:00:00.000Z",
        outcome: "rejected",
        diagnosticCode: "query.not_available",
      },
    };
  },
});
