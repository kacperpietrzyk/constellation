import type { ReleaseStatus } from "@constellation/desktop-preload/client";

export interface DesktopUpdateInfo {
  readonly version: string;
  readonly releaseDate?: string;
}

export interface DesktopUpdaterAdapter {
  checkForUpdates(): Promise<{ readonly updateInfo: DesktopUpdateInfo } | null>;
  downloadUpdate(): Promise<readonly string[]>;
  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void;
}

const numericVersion = (
  value: string,
): readonly [number, number, number] | undefined => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
  if (match === null) return undefined;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger)
    ? (parts as unknown as readonly [number, number, number])
    : undefined;
};

export const isNewerRelease = (candidate: string, current: string): boolean => {
  const next = numericVersion(candidate);
  const installed = numericVersion(current);
  if (next === undefined || installed === undefined) return false;
  for (let index = 0; index < 3; index += 1) {
    if (next[index]! > installed[index]!) return true;
    if (next[index]! < installed[index]!) return false;
  }
  return false;
};

const failureStatus = (
  currentVersion: string,
  operation: "check" | "download" | "install",
): ReleaseStatus => ({
  kind: "failure",
  currentVersion,
  operation,
  message:
    operation === "check"
      ? "Nie udało się bezpiecznie sprawdzić aktualizacji. Obecna wersja pozostaje bez zmian."
      : operation === "download"
        ? "Pobieranie nie zostało potwierdzone. Obecna wersja pozostaje gotowa do użycia."
        : "Aktualizacja nie została uruchomiona. Uruchom Constellation ponownie i spróbuj jeszcze raz.",
});

export class DesktopReleaseService {
  private status: ReleaseStatus;
  private operation: Promise<ReleaseStatus> | undefined;

  public constructor(
    private readonly currentVersion: string,
    private readonly updater: DesktopUpdaterAdapter | undefined,
    unavailableReason?: Extract<
      ReleaseStatus,
      { kind: "unavailable" }
    >["reason"],
  ) {
    this.status =
      updater === undefined
        ? {
            kind: "unavailable",
            currentVersion,
            reason: unavailableReason ?? "mechanism_only_build",
          }
        : { kind: "idle", currentVersion };
  }

  public getStatus(): ReleaseStatus {
    return this.status;
  }

  public check(): Promise<ReleaseStatus> {
    if (this.updater === undefined) return Promise.resolve(this.status);
    if (this.operation !== undefined) return this.operation;
    this.status = { kind: "checking", currentVersion: this.currentVersion };
    this.operation = this.updater
      .checkForUpdates()
      .then((result) => {
        const info = result?.updateInfo;
        this.status =
          info !== undefined &&
          isNewerRelease(info.version, this.currentVersion)
            ? {
                kind: "available",
                currentVersion: this.currentVersion,
                version: info.version,
                ...(info.releaseDate === undefined
                  ? {}
                  : { releasedAt: info.releaseDate }),
              }
            : {
                kind: "current",
                currentVersion: this.currentVersion,
                checkedAt: new Date().toISOString(),
              };
        return this.status;
      })
      .catch(() => {
        this.status = failureStatus(this.currentVersion, "check");
        return this.status;
      })
      .finally(() => {
        this.operation = undefined;
      });
    return this.operation;
  }

  public download(): Promise<ReleaseStatus> {
    if (this.updater === undefined) return Promise.resolve(this.status);
    if (this.operation !== undefined) return this.operation;
    if (this.status.kind !== "available") return Promise.resolve(this.status);
    const version = this.status.version;
    this.status = {
      kind: "downloading",
      currentVersion: this.currentVersion,
      version,
    };
    this.operation = this.updater
      .downloadUpdate()
      .then(() => {
        this.status = {
          kind: "ready",
          currentVersion: this.currentVersion,
          version,
        };
        return this.status;
      })
      .catch(() => {
        this.status = failureStatus(this.currentVersion, "download");
        return this.status;
      })
      .finally(() => {
        this.operation = undefined;
      });
    return this.operation;
  }

  public install(): ReleaseStatus {
    if (this.updater === undefined || this.status.kind !== "ready") {
      return this.status;
    }
    const version = this.status.version;
    this.status = {
      kind: "installing",
      currentVersion: this.currentVersion,
      version,
    };
    try {
      this.updater.quitAndInstall(false, true);
    } catch {
      this.status = failureStatus(this.currentVersion, "install");
    }
    return this.status;
  }
}
