import type {
  MembershipId,
  PrincipalId,
  SpaceGrantId,
  SpaceId,
  WorkspaceId,
} from "@constellation/contracts";

import type {
  SpaceGrant,
  Workspace,
  WorkspaceMembership,
  WorkspaceRole,
} from "./model.js";

export const addWorkspaceMember = (input: {
  readonly membershipId: MembershipId;
  readonly workspaceId: WorkspaceId;
  readonly principalId: PrincipalId;
  readonly displayName: string;
  readonly role: Exclude<WorkspaceRole, "owner">;
  readonly occurredAt: string;
}): WorkspaceMembership => ({
  id: input.membershipId,
  workspaceId: input.workspaceId,
  principalId: input.principalId,
  displayName: input.displayName,
  role: input.role,
  status: "active",
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export const grantSpaceAccess = (input: {
  readonly id: SpaceGrantId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly principalId: PrincipalId;
  readonly access: "view" | "edit";
  readonly occurredAt: string;
}): SpaceGrant => ({
  ...input,
  status: "active",
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export const changeSpaceAccess = (
  grant: SpaceGrant,
  access: SpaceGrant["access"],
  occurredAt: string,
): SpaceGrant => {
  const { revokedAt: _revokedAt, ...activeGrant } = grant;
  void _revokedAt;
  return {
    ...activeGrant,
    access,
    status: "active",
    version: grant.version + 1,
    updatedAt: occurredAt,
  };
};

export const revokeWorkspaceMember = (
  membership: WorkspaceMembership,
  occurredAt: string,
): WorkspaceMembership => ({
  ...membership,
  status: "revoked",
  version: membership.version + 1,
  updatedAt: occurredAt,
  revokedAt: occurredAt,
});

export const revokeSpaceGrant = (
  grant: SpaceGrant,
  occurredAt: string,
): SpaceGrant => ({
  ...grant,
  status: "revoked",
  version: grant.version + 1,
  updatedAt: occurredAt,
  revokedAt: occurredAt,
});

export const bumpWorkspacePolicy = (
  workspace: Workspace,
  occurredAt: string,
): Workspace => ({
  ...workspace,
  policyVersion: (workspace.policyVersion ?? 1) + 1,
  version: workspace.version + 1,
  updatedAt: occurredAt,
});
