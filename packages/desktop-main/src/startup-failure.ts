import { EncryptedStoreCapabilityError } from "@constellation/local-store";

import { DurableWorkspaceOpenError } from "./durable-kernel-service.js";
import { WorkspaceKeyCustodyError } from "./workspace-key-custody.js";

/**
 * What a failed startup tells the person in front of the window.
 *
 * `guidance` is the fixed sentence for a recognised failure: what is safe, and
 * what to do next. `cause` is the underlying error, and it is a separate field
 * rather than a paragraph inside the guidance so that a caller can print one,
 * the other, or both without parsing prose.
 *
 * Why the cause exists at all: it used to be swallowed unless
 * `CONSTELLATION_ALPHA_RECOVERY_SMOKE_ROOT` was set — and that same variable
 * *also* reroutes the workspace under a recovery smoke root. Asking the
 * application why it failed therefore changed what it did, so the answer
 * described a different run than the failing one. Diagnostics that move the
 * thing being measured are not diagnostics; showing the cause is now
 * unconditional and carries no behaviour with it.
 */
export interface StartupFailure {
  readonly code: string;
  readonly guidance: string;
  readonly cause: string;
  readonly detail: string;
}

/**
 * How much of the cause reaches the dialog.
 *
 * Bounded on purpose: an unbounded message pushes the guidance out of a
 * modal that cannot be scrolled, and the guidance is the part that says the
 * workspace was not damaged.
 */
export const STARTUP_CAUSE_LIMIT = 400;

/**
 * The underlying failure as one line — never a stack.
 *
 * A stack in a modal is unreadable and leaks absolute paths into screenshots;
 * `name: message` is what identifies the failure, and the stack is already on
 * the console for anyone running from a terminal.
 */
export const startupFailureCause = (error: unknown): string => {
  const described =
    error instanceof Error
      ? // An error thrown with no message at all still identifies itself by
        // class, and "Error:" trailing a colon into nothing reads as a
        // truncated log line rather than as the whole of what is known.
        error.message.trim() === ""
        ? `${error.name} with no message`
        : `${error.name}: ${error.message}`
      : typeof error === "string" && error.trim() !== ""
        ? error
        : `a thrown ${typeof error} with no message`;
  const collapsed = described.replaceAll(/\s+/gu, " ").trim();
  if (collapsed === "") return "an error with no message";
  return collapsed.length > STARTUP_CAUSE_LIMIT
    ? `${collapsed.slice(0, STARTUP_CAUSE_LIMIT - 1)}…`
    : collapsed;
};

const guidanceFor = (
  error: unknown,
): { readonly code: string; readonly guidance: string } => {
  if (error instanceof WorkspaceKeyCustodyError) {
    if (error.code === "encryption_unavailable") {
      return {
        code: "secure-storage-unavailable",
        guidance:
          "Secure operating-system key storage is unavailable. Unlock your sign-in keychain or credential store, then start Constellation again.",
      };
    }
    return {
      code: "protected-key-unavailable",
      guidance:
        "The protected workspace key could not be opened safely. Constellation did not modify the workspace. Restore the key wrapper and database from the same backup before trying again.",
    };
  }
  if (error instanceof DurableWorkspaceOpenError) {
    return {
      code: "workspace-open-blocked",
      guidance:
        error.code === "database_without_key"
          ? "The encrypted database is present but its protected key wrapper is missing. Constellation did not modify the database. Restore both files from the same backup before trying again."
          : "The local workspace could not be opened safely. Constellation did not continue with a partial workspace. Restore a known-good workspace backup before trying again.",
    };
  }
  if (error instanceof EncryptedStoreCapabilityError) {
    return {
      code: "encrypted-store-unavailable",
      guidance:
        "The encrypted database component did not pass its startup safety checks. Reinstall this Constellation build; your existing workspace was not intentionally changed.",
    };
  }
  return {
    code: "desktop-startup-failed",
    guidance:
      "Constellation could not start the local workspace safely. Your workspace was not intentionally changed. Open the data folder for recovery or try reinstalling this build.",
  };
};

export const startupFailureCopy = (error: unknown): StartupFailure => {
  const { code, guidance } = guidanceFor(error);
  const cause = startupFailureCause(error);
  // The cause is labelled and placed after the guidance, so the sentence that
  // says the workspace is intact is still the first thing read.
  return { code, guidance, cause, detail: `${guidance}\n\nCause: ${cause}` };
};
