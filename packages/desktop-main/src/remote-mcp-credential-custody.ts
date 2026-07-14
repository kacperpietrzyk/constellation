import {
  chmodSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

import type { GrantId } from "@constellation/contracts";

export class RemoteMcpCredentialCustody {
  private readonly root: string;

  public constructor(stateRoot: string) {
    this.root = path.join(stateRoot, "mcp", "remote-agents");
  }

  public descriptorPath(grantId: GrantId): string {
    return path.join(this.root, `${grantId}.json`);
  }

  public publish(input: {
    readonly grantId: GrantId;
    readonly endpoint: string;
    readonly bearerToken: string;
  }): string {
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    const destination = this.descriptorPath(input.grantId);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    writeFileSync(
      temporary,
      `${JSON.stringify(
        {
          format: "constellation.remote-mcp/v1",
          endpoint: input.endpoint,
          headers: { Authorization: `Bearer ${input.bearerToken}` },
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    renameSync(temporary, destination);
    if (process.platform !== "win32") chmodSync(destination, 0o600);
    return destination;
  }

  public revoke(grantId: GrantId): void {
    rmSync(this.descriptorPath(grantId), { force: true });
  }
}
