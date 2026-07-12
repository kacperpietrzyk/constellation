import type {
  AuthorizationRequest,
  CurrentAuthorizationPolicy,
} from "@constellation/application";
import type {
  Capability,
  ExecutionContext,
  GrantId,
  SpaceId,
} from "@constellation/contracts";

interface CurrentGrant {
  readonly active: boolean;
  readonly capabilityScope: ReadonlySet<Capability>;
  readonly context: ExecutionContext;
  readonly spaceScope: ReadonlySet<SpaceId>;
}

export class InMemoryAuthorizationPolicy implements CurrentAuthorizationPolicy {
  private readonly grants = new Map<GrantId, CurrentGrant>();

  public register(context: ExecutionContext): void {
    this.grants.set(context.grantId, {
      active: true,
      capabilityScope: new Set(context.capabilityScope),
      context,
      spaceScope: new Set(context.spaceScope),
    });
  }

  public revoke(grantId: GrantId): void {
    const grant = this.grants.get(grantId);
    if (grant !== undefined) {
      this.grants.set(grantId, { ...grant, active: false });
    }
  }

  public authorize(request: AuthorizationRequest): boolean {
    const grant = this.grants.get(request.context.grantId);
    return (
      grant !== undefined &&
      grant.active &&
      grant.context.principalId === request.context.principalId &&
      grant.context.principalKind === request.context.principalKind &&
      grant.context.credentialId === request.context.credentialId &&
      grant.context.workspaceId === request.workspaceId &&
      grant.context.policyVersion === request.context.policyVersion &&
      request.context.capabilityScope.includes(request.capability) &&
      grant.capabilityScope.has(request.capability) &&
      (request.spaceId === undefined ||
        (request.context.spaceScope.includes(request.spaceId) &&
          grant.spaceScope.has(request.spaceId)))
    );
  }
}
