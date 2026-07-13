import type {
  CommandEnvelope,
  CommandOutcome,
  ContractIssue,
  QueryEnvelope,
  QueryResult,
  WorkspaceId,
} from "@constellation/contracts";

export const DESKTOP_CHANNELS = {
  executeCommand: "constellation:command:execute",
  getBuildInfo: "constellation:build:info",
  runQuery: "constellation:query:run",
} as const;

export interface ContractRejection {
  readonly kind: "contract_rejected";
  readonly diagnosticCode: "contract.invalid";
  readonly issues: readonly ContractIssue[];
}

export type RendererCommandResponse =
  | { readonly kind: "command_outcome"; readonly outcome: CommandOutcome }
  | ContractRejection;

export type RendererQueryResponse =
  | { readonly kind: "query_result"; readonly result: QueryResult }
  | ContractRejection;

export interface DesktopBuildInfo {
  readonly channel: "developer-preview";
  readonly initialWorkspaceId: WorkspaceId;
  readonly persistence: "in-memory";
  readonly version: string;
}

export interface ConstellationRendererClient {
  executeCommand(command: CommandEnvelope): Promise<RendererCommandResponse>;
  getBuildInfo(): Promise<DesktopBuildInfo>;
  runQuery(query: QueryEnvelope): Promise<RendererQueryResponse>;
}

export type DesktopInvoke = (
  channel: (typeof DESKTOP_CHANNELS)[keyof typeof DESKTOP_CHANNELS],
  payload?: unknown,
) => Promise<unknown>;

export const createRendererClient = (
  invoke: DesktopInvoke,
): ConstellationRendererClient => ({
  executeCommand: (command) =>
    invoke(
      DESKTOP_CHANNELS.executeCommand,
      command,
    ) as Promise<RendererCommandResponse>,
  getBuildInfo: () =>
    invoke(DESKTOP_CHANNELS.getBuildInfo) as Promise<DesktopBuildInfo>,
  runQuery: (query) =>
    invoke(DESKTOP_CHANNELS.runQuery, query) as Promise<RendererQueryResponse>,
});
