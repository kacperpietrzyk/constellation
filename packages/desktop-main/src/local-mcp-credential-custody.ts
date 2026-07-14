import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  CredentialIdSchema,
  type CredentialId,
  type GrantId,
  type WorkspaceId,
} from "@constellation/contracts";
import {
  LocalCredentialDescriptorSchema,
  type LocalCredentialDescriptor,
} from "@constellation/mcp/protocol";

export const localMcpCredentialDigest = (input: {
  readonly grantId: GrantId;
  readonly credentialId: CredentialId;
  readonly secret: string;
}): string =>
  createHash("sha256")
    .update(`${input.grantId}:${input.credentialId}:${input.secret}`, "utf8")
    .digest("hex");

export interface PreparedLocalMcpCredential {
  readonly credentialId: CredentialId;
  readonly credentialDigest: string;
  readonly secret: string;
}

export class LocalMcpCredentialCustody {
  private readonly descriptorsRoot: string;

  public constructor(private readonly stateRoot: string) {
    this.descriptorsRoot = path.join(stateRoot, "mcp", "agents");
    mkdirSync(this.descriptorsRoot, { recursive: true, mode: 0o700 });
  }

  public prepare(grantId: GrantId): PreparedLocalMcpCredential {
    const credentialId = CredentialIdSchema.parse(randomUUID());
    const secret = randomBytes(32).toString("base64url");
    return {
      credentialId,
      secret,
      credentialDigest: localMcpCredentialDigest({
        grantId,
        credentialId,
        secret,
      }),
    };
  }

  public descriptorPath(grantId: GrantId): string {
    return path.join(this.descriptorsRoot, `${grantId}.json`);
  }

  public publish(input: {
    readonly workspaceId: WorkspaceId;
    readonly grantId: GrantId;
    readonly endpoint: string;
    readonly credential: PreparedLocalMcpCredential;
  }): string {
    const descriptor = LocalCredentialDescriptorSchema.parse({
      descriptorVersion: 1,
      workspaceId: input.workspaceId,
      grantId: input.grantId,
      credentialId: input.credential.credentialId,
      endpoint: input.endpoint,
      secret: input.credential.secret,
    });
    this.writeDescriptor(this.descriptorPath(input.grantId), descriptor);
    return this.descriptorPath(input.grantId);
  }

  public refreshEndpoint(grantId: GrantId, endpoint: string): void {
    const filePath = this.descriptorPath(grantId);
    if (!existsSync(filePath)) return;
    let descriptor: LocalCredentialDescriptor;
    try {
      descriptor = LocalCredentialDescriptorSchema.parse(
        JSON.parse(readFileSync(filePath, "utf8")) as unknown,
      );
    } catch {
      rmSync(filePath, { force: true });
      return;
    }
    this.writeDescriptor(filePath, { ...descriptor, endpoint });
  }

  public revoke(grantId: GrantId): void {
    rmSync(this.descriptorPath(grantId), { force: true });
  }

  private writeDescriptor(
    filePath: string,
    descriptor: LocalCredentialDescriptor,
  ): void {
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(descriptor)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    chmodSync(temporary, 0o600);
    renameSync(temporary, filePath);
    if (process.platform !== "win32") chmodSync(filePath, 0o600);
  }
}
