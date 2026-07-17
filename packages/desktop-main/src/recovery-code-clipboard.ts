export interface RecoveryClipboardWriter {
  writeText(text: string): void;
}

export type RecoveryClipboardResult =
  { readonly outcome: "success" } | { readonly outcome: "failure" };

const parseRecoveryCode = (input: unknown): string | undefined => {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.keys(input).join(",") !== "recoveryCode"
  ) {
    return undefined;
  }
  const recoveryCode = (input as { recoveryCode?: unknown }).recoveryCode;
  if (
    typeof recoveryCode !== "string" ||
    !/^cst1_[A-Za-z0-9_-]{43}$/.test(recoveryCode)
  ) {
    return undefined;
  }
  const encoded = recoveryCode.slice("cst1_".length);
  const decoded = Buffer.from(encoded, "base64url");
  const canonical =
    decoded.byteLength === 32 && decoded.toString("base64url") === encoded;
  decoded.fill(0);
  return canonical ? recoveryCode : undefined;
};

export const copyRecoveryCodeToClipboard = (
  clipboard: RecoveryClipboardWriter,
  input: unknown,
): RecoveryClipboardResult => {
  const recoveryCode = parseRecoveryCode(input);
  if (recoveryCode === undefined) return { outcome: "failure" };
  try {
    clipboard.writeText(recoveryCode);
    return { outcome: "success" };
  } catch {
    return { outcome: "failure" };
  }
};
