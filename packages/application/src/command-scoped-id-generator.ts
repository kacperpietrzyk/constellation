import type { CommandId } from "@constellation/contracts";

import type { GeneratedIdKind, IdGenerator, SemanticHasher } from "./ports.js";

/**
 * Produces stable IDs for optimistic offline execution and authoritative Hub
 * replay. A command scope must be selected before the first generated ID.
 */
export class CommandScopedIdGenerator implements IdGenerator {
  private commandId: CommandId | undefined;
  private ordinal = 0;

  public constructor(private readonly hasher: SemanticHasher) {}

  public begin(commandId: CommandId): void {
    this.commandId = commandId;
    this.ordinal = 0;
  }

  public next(kind: GeneratedIdKind): string {
    if (this.commandId === undefined) {
      throw new Error("A command-scoped ID generator requires begin().");
    }
    const digest = this.hasher.fingerprint({
      commandId: this.commandId,
      kind,
      ordinal: this.ordinal,
    });
    this.ordinal += 1;
    if (!/^[0-9a-f]{32,}$/u.test(digest)) {
      throw new Error(
        "The semantic hasher did not return a hexadecimal digest.",
      );
    }
    const value = digest.slice(0, 32).split("");
    value[12] = "4";
    value[16] = ((Number.parseInt(value[16] ?? "0", 16) & 0x3) | 0x8).toString(
      16,
    );
    return `${value.slice(0, 8).join("")}-${value.slice(8, 12).join("")}-${value.slice(12, 16).join("")}-${value.slice(16, 20).join("")}-${value.slice(20).join("")}`;
  }
}
