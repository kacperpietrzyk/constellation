import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  ExecutionContextSchema,
  type ExecutionContext,
} from "@constellation/contracts";

export const writeHubAuthorizationFile = (
  filename: string,
  context: ExecutionContext,
): void => {
  const parsed = ExecutionContextSchema.parse(context);
  const directory = path.dirname(filename);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${filename}.tmp`;
  rmSync(temporary, { force: true });
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    renameSync(temporary, filename);
    if (process.platform !== "win32") {
      const directoryDescriptor = openSync(directory, "r");
      try {
        fsyncSync(directoryDescriptor);
      } finally {
        closeSync(directoryDescriptor);
      }
    }
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
};
