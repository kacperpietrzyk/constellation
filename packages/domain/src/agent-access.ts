import type {
  AgentRunId,
  Capability,
  CheckpointId,
  CredentialId,
  GrantId,
  PrincipalId,
  SpaceId,
  WorkspaceId,
} from "@constellation/contracts";

import type {
  AgentAccessGrant,
  AgentAccessPreset,
  AgentCheckpoint,
} from "./model.js";

export const createAgentAccessGrant = (input: {
  readonly id: GrantId;
  readonly workspaceId: WorkspaceId;
  readonly agentPrincipalId: PrincipalId;
  readonly delegatingUserId: PrincipalId;
  readonly displayName: string;
  readonly preset: AgentAccessPreset;
  readonly capabilityScope: readonly Capability[];
  readonly spaceScope: readonly SpaceId[];
  readonly credentialId: CredentialId;
  readonly credentialDigest: string;
  readonly expiresAt?: string;
  readonly occurredAt: string;
}): AgentAccessGrant => ({
  ...input,
  credentialVersion: 1,
  status: "active",
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export const rotateAgentCredential = (
  grant: AgentAccessGrant,
  credentialId: CredentialId,
  credentialDigest: string,
  occurredAt: string,
): AgentAccessGrant => ({
  ...grant,
  credentialId,
  credentialDigest,
  credentialVersion: grant.credentialVersion + 1,
  version: grant.version + 1,
  updatedAt: occurredAt,
});

/**
 * Replaces the scope whole. The credential is untouched on purpose: the agent
 * keeps working through the same descriptor and simply may do more, or less,
 * from its next call onwards — a re-scope is not a reissue.
 */
export const setAgentGrantScope = (
  grant: AgentAccessGrant,
  preset: AgentAccessPreset,
  capabilityScope: readonly Capability[],
  occurredAt: string,
): AgentAccessGrant => ({
  ...grant,
  preset,
  capabilityScope,
  version: grant.version + 1,
  updatedAt: occurredAt,
});

export const revokeAgentAccessGrant = (
  grant: AgentAccessGrant,
  occurredAt: string,
): AgentAccessGrant => ({
  ...grant,
  status: "revoked",
  version: grant.version + 1,
  updatedAt: occurredAt,
  revokedAt: occurredAt,
});

export const createAgentCheckpoint = (input: {
  readonly id: CheckpointId;
  readonly workspaceId: WorkspaceId;
  readonly agentPrincipalId: PrincipalId;
  readonly grantId: GrantId;
  readonly runId: AgentRunId;
  readonly label: string;
  readonly occurredAt: string;
}): AgentCheckpoint => ({
  id: input.id,
  workspaceId: input.workspaceId,
  agentPrincipalId: input.agentPrincipalId,
  grantId: input.grantId,
  runId: input.runId,
  label: input.label,
  commandIds: [],
  status: "open",
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});
