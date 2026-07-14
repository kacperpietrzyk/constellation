import { readFileSync, statSync } from "node:fs";
import net from "node:net";

import {
  AuthenticatedIpcRequestSchema,
  LocalCredentialDescriptorSchema,
  MAX_IPC_MESSAGE_BYTES,
  McpOperatorResponseSchema,
  type McpOperatorInvocation,
  type McpOperatorResponse,
} from "./protocol.js";

export class LocalMcpUnavailableError extends Error {
  public constructor(
    public readonly code:
      | "credential_file_unsafe"
      | "credential_file_invalid"
      | "desktop_unavailable"
      | "response_invalid"
      | "response_too_large",
  ) {
    super(`Local Constellation MCP unavailable: ${code}.`);
    this.name = "LocalMcpUnavailableError";
  }
}

const loadDescriptor = (filePath: string) => {
  try {
    const stat = statSync(filePath);
    if (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
      throw new LocalMcpUnavailableError("credential_file_unsafe");
    return LocalCredentialDescriptorSchema.parse(
      JSON.parse(readFileSync(filePath, "utf8")) as unknown,
    );
  } catch (error) {
    if (error instanceof LocalMcpUnavailableError) throw error;
    throw new LocalMcpUnavailableError("credential_file_invalid");
  }
};

export const invokeDesktopMcp = (
  credentialFile: string,
  invocation: McpOperatorInvocation,
  timeoutMs = 10_000,
): Promise<McpOperatorResponse> => {
  const descriptor = loadDescriptor(credentialFile);
  const request = `${JSON.stringify(
    AuthenticatedIpcRequestSchema.parse({
      credentialId: descriptor.credentialId,
      secret: descriptor.secret,
      invocation,
    }),
  )}\n`;
  if (Buffer.byteLength(request) > MAX_IPC_MESSAGE_BYTES)
    return Promise.reject(new LocalMcpUnavailableError("response_too_large"));
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(descriptor.endpoint);
    let response = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new LocalMcpUnavailableError("desktop_unavailable"));
    }, timeoutMs);
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write(request));
    socket.on("data", (chunk: string) => {
      response += chunk;
      if (Buffer.byteLength(response) > MAX_IPC_MESSAGE_BYTES) {
        socket.destroy();
        clearTimeout(timer);
        reject(new LocalMcpUnavailableError("response_too_large"));
        return;
      }
      const newline = response.indexOf("\n");
      if (newline < 0) return;
      socket.end();
      clearTimeout(timer);
      try {
        resolve(
          McpOperatorResponseSchema.parse(
            JSON.parse(response.slice(0, newline)) as unknown,
          ),
        );
      } catch {
        reject(new LocalMcpUnavailableError("response_invalid"));
      }
    });
    socket.once("error", () => {
      clearTimeout(timer);
      reject(new LocalMcpUnavailableError("desktop_unavailable"));
    });
  });
};
