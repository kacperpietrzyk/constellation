import {
  closeSync,
  fsyncSync,
  linkSync,
  openSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type { ReleaseStatus } from "@constellation/desktop-preload/client";

export const SUPPORT_REPORT_FORMAT = "constellation.support-report.v1" as const;

export interface PrivacySafeSupportReportInput {
  readonly generatedAt: string;
  readonly build: {
    readonly version: string;
    readonly channel: "developer-preview" | "local-alpha";
    readonly persistence: "in-memory" | "encrypted-local";
    readonly startupRecovery: "none" | "previous_workspace_restored";
    readonly workspaceAvailability: "ready" | "recovery_required";
    readonly recoveryReason?: string;
  };
  readonly packaged: boolean;
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
  readonly electronVersion: string;
  readonly dataHome?: {
    readonly descriptor: {
      readonly providerKind: string;
      readonly storageRole: string;
    };
    readonly availability: string;
    readonly syncState: string;
    readonly checkpointState: string;
    readonly quota: { readonly state: string };
    readonly recoveryActions: readonly string[];
    readonly detailCode?: string | undefined;
  };
  readonly release: ReleaseStatus;
}

export const createPrivacySafeSupportReport = (
  input: PrivacySafeSupportReportInput,
) => ({
  format: SUPPORT_REPORT_FORMAT,
  generatedAt: input.generatedAt,
  application: {
    version: input.build.version,
    channel: input.build.channel,
    persistence: input.build.persistence,
    packaged: input.packaged,
  },
  runtime: {
    platform: input.platform,
    architecture: input.architecture,
    electronVersion: input.electronVersion,
  },
  workspace: {
    availability: input.build.workspaceAvailability,
    startupRecovery: input.build.startupRecovery,
    ...(input.build.recoveryReason === undefined
      ? {}
      : { recoveryReason: input.build.recoveryReason }),
  },
  dataHome:
    input.dataHome === undefined
      ? { status: "unavailable" as const }
      : {
          status: "reported" as const,
          providerKind: input.dataHome.descriptor.providerKind,
          storageRole: input.dataHome.descriptor.storageRole,
          availability: input.dataHome.availability,
          syncState: input.dataHome.syncState,
          checkpointState: input.dataHome.checkpointState,
          quotaState: input.dataHome.quota.state,
          recoveryActions: [...input.dataHome.recoveryActions].sort(),
          ...(input.dataHome.detailCode === undefined
            ? {}
            : { detailCode: input.dataHome.detailCode }),
        },
  release:
    input.release.kind === "failure"
      ? {
          kind: input.release.kind,
          currentVersion: input.release.currentVersion,
          operation: input.release.operation,
        }
      : input.release.kind === "unavailable"
        ? {
            kind: input.release.kind,
            currentVersion: input.release.currentVersion,
            reason: input.release.reason,
          }
        : {
            kind: input.release.kind,
            currentVersion: input.release.currentVersion,
            ...("version" in input.release
              ? { targetVersion: input.release.version }
              : {}),
          },
});

export const writePrivacySafeSupportReport = (
  destination: string,
  report: ReturnType<typeof createPrivacySafeSupportReport>,
): void => {
  const directory = path.dirname(destination);
  const temporary = path.join(
    directory,
    `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    const temporaryHandle = openSync(temporary, "r");
    try {
      fsyncSync(temporaryHandle);
    } finally {
      closeSync(temporaryHandle);
    }
    linkSync(temporary, destination);
    // Windows cannot open a directory handle with Node's regular file API.
    // The exclusive hard-link publication remains atomic there; POSIX also
    // flushes the parent directory entry before reporting success.
    if (process.platform !== "win32") {
      const directoryHandle = openSync(directory, "r");
      try {
        fsyncSync(directoryHandle);
      } finally {
        closeSync(directoryHandle);
      }
    }
  } finally {
    rmSync(temporary, { force: true });
  }
};
