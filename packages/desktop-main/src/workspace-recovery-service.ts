import { randomBytes, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  CredentialIdSchema,
  GrantIdSchema,
  type WorkspaceBackupExportResult,
  type WorkspaceBackupFailureCode,
  type WorkspaceRestorePreviewResult,
  type WorkspaceRestoreResult,
} from "@constellation/contracts";
import {
  exportEncryptedLocalStore,
  openEncryptedLocalStore,
  type EncryptedSqliteDatabaseFactory,
  type LocalWorkspaceRecoverySummary,
} from "@constellation/local-store";

import {
  createDurableKernelService,
  DurableWorkspaceOpenError,
  type DurableBootstrapProjection,
  type DurableKernelService,
} from "./durable-kernel-service.js";
import {
  createRecoveryCode,
  extractWorkspaceBackup,
  publishWorkspaceBackupArchive,
  WorkspaceBackupArchiveError,
  type WorkspaceBackupMetadata,
} from "./workspace-backup-archive.js";
import {
  WorkspaceKeyCustody,
  WorkspaceKeyCustodyError,
  type AsyncSafeStorage,
} from "./workspace-key-custody.js";

const ACTIVE_DIRECTORY = "local-alpha-workspace";
const RECOVERY_DIRECTORY = "workspace-recovery";
const JOURNAL_FORMAT = "constellation.workspace-restore-activation/v1";
const OPERATION_FORMAT = "constellation.workspace-restore-operation/v1";

type ActivationState =
  "prepared" | "previous_retained" | "candidate_active_unverified";

interface ActivationJournal {
  readonly format: typeof JOURNAL_FORMAT;
  readonly restoreId: string;
  readonly state: ActivationState;
}

interface PreparedRestore {
  readonly restoreId: string;
  readonly candidateRoot: string;
  readonly operationRoot: string;
  readonly metadata: WorkspaceBackupMetadata;
  readonly summary: LocalWorkspaceRecoverySummary;
}

export interface WorkspaceRecoveryService {
  readonly kernel: DurableKernelService | undefined;
  readonly recoveryReason:
    | "none"
    | "secure_storage_unavailable"
    | "protected_key_unavailable"
    | "workspace_unavailable";
  readonly startupRecovery: "none" | "previous_workspace_restored";
  cancelRestore(restoreId: string): void;
  close(): void;
  confirmRestore(restoreId: string): Promise<WorkspaceRestoreResult>;
  exportBackup(): Promise<WorkspaceBackupExportResult>;
  prepareRestore(recoveryCode: string): Promise<WorkspaceRestorePreviewResult>;
}

export interface WorkspaceRecoveryFailpoint {
  (boundary: "after-previous-retained" | "after-candidate-activated"): void;
}

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(value);

const syncDirectory = (directory: string): void => {
  if (process.platform === "win32") return;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
};

const writeCanonicalFile = (filename: string, value: unknown): void => {
  const directory = path.dirname(filename);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(
    directory,
    `.${path.basename(filename)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value)}\n`, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, filename);
    syncDirectory(directory);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporary, { force: true });
  }
};

const readJournal = (filename: string): ActivationJournal | undefined => {
  if (!existsSync(filename)) return undefined;
  const metadata = lstatSync(filename);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 4096) {
    throw new Error("WORKSPACE_RESTORE_JOURNAL_INVALID");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filename, "utf8")) as unknown;
  } catch {
    throw new Error("WORKSPACE_RESTORE_JOURNAL_INVALID");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("WORKSPACE_RESTORE_JOURNAL_INVALID");
  }
  const record = parsed as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !== "format,restoreId,state" ||
    record.format !== JOURNAL_FORMAT ||
    !isUuid(record.restoreId) ||
    (record.state !== "prepared" &&
      record.state !== "previous_retained" &&
      record.state !== "candidate_active_unverified")
  ) {
    throw new Error("WORKSPACE_RESTORE_JOURNAL_INVALID");
  }
  return {
    format: JOURNAL_FORMAT,
    restoreId: record.restoreId,
    state: record.state,
  };
};

const recoverInterruptedRestore = (
  stateRoot: string,
): "none" | "previous_workspace_restored" => {
  const recoveryRoot = path.join(stateRoot, RECOVERY_DIRECTORY);
  const journalPath = path.join(recoveryRoot, "activation.json");
  const journal = readJournal(journalPath);
  if (journal === undefined) return "none";
  const activeRoot = path.join(stateRoot, ACTIVE_DIRECTORY);
  const retainedRoot = path.join(recoveryRoot, `retained-${journal.restoreId}`);
  const candidateRoot = path.join(
    recoveryRoot,
    "operations",
    journal.restoreId,
    "candidate",
  );

  if (journal.state === "prepared") {
    const activeExists = existsSync(activeRoot);
    const retainedExists = existsSync(retainedRoot);
    const candidateExists = existsSync(candidateRoot);
    if (activeExists && candidateExists && !retainedExists) {
      rmSync(journalPath, { force: true });
      return "none";
    }
    if (!activeExists && retainedExists && candidateExists) {
      renameSync(retainedRoot, activeRoot);
      rmSync(journalPath, { force: true });
      syncDirectory(stateRoot);
      return "previous_workspace_restored";
    }
    if (!activeExists || !candidateExists) {
      throw new Error("WORKSPACE_RESTORE_PREPARED_STATE_INVALID");
    }
    throw new Error("WORKSPACE_RESTORE_PREPARED_STATE_AMBIGUOUS");
  }

  if (!existsSync(retainedRoot)) {
    throw new Error("WORKSPACE_RESTORE_PREVIOUS_MISSING");
  }
  if (journal.state === "previous_retained") {
    if (existsSync(activeRoot)) {
      throw new Error("WORKSPACE_RESTORE_ACTIVE_UNEXPECTED");
    }
    renameSync(retainedRoot, activeRoot);
  } else {
    if (!existsSync(activeRoot) || existsSync(candidateRoot)) {
      throw new Error("WORKSPACE_RESTORE_CANDIDATE_STATE_INVALID");
    }
    renameSync(activeRoot, candidateRoot);
    renameSync(retainedRoot, activeRoot);
  }
  rmSync(journalPath, { force: true });
  syncDirectory(stateRoot);
  return "previous_workspace_restored";
};

const mapFailure = (error: unknown): WorkspaceBackupFailureCode => {
  if (error instanceof WorkspaceKeyCustodyError) {
    return error.code === "encryption_unavailable"
      ? "secure_storage_unavailable"
      : "workspace_identity_invalid";
  }
  if (error instanceof WorkspaceBackupArchiveError) {
    switch (error.code) {
      case "archive_unsupported":
        return "archive_unsupported";
      case "recovery_code_invalid":
        return "recovery_code_invalid";
      case "archive_invalid":
      case "archive_too_large":
        return "archive_invalid";
      case "archive_exists":
      case "archive_io_failed":
        return "io_failed";
    }
  }
  return "io_failed";
};

const metadataDto = (metadata: WorkspaceBackupMetadata) => ({
  archiveId: metadata.archiveId,
  workspaceId: metadata.workspaceId,
  workspaceName: metadata.workspaceName,
  createdAt: metadata.createdAt,
  appVersion: metadata.appVersion,
  databaseByteLength: metadata.databaseByteLength,
});

const createEmptyFile = (filename: string): void => {
  const descriptor = openSync(filename, "wx", 0o600);
  closeSync(descriptor);
};

class DefaultWorkspaceRecoveryService implements WorkspaceRecoveryService {
  private current: DurableKernelService | undefined;
  private readonly prepared = new Map<string, PreparedRestore>();
  private busy = false;

  public constructor(
    initial: DurableKernelService | undefined,
    public readonly startupRecovery: "none" | "previous_workspace_restored",
    public readonly recoveryReason: WorkspaceRecoveryService["recoveryReason"],
    private readonly input: {
      readonly appVersion: string;
      readonly databaseFactory: EncryptedSqliteDatabaseFactory;
      readonly failpoint?: WorkspaceRecoveryFailpoint;
      readonly platform?: NodeJS.Platform;
      readonly safeStorage: AsyncSafeStorage;
      readonly selectBackupPath: () => Promise<string | undefined>;
      readonly selectExportPath: (
        workspaceName: string,
      ) => Promise<string | undefined>;
      readonly stateRoot: string;
      readonly timezone: string;
    },
  ) {
    this.current = initial;
  }

  public get kernel(): DurableKernelService | undefined {
    return this.current;
  }

  public close(): void {
    this.current?.close();
  }

  public async exportBackup(): Promise<WorkspaceBackupExportResult> {
    if (this.busy) return { outcome: "failure", code: "operation_busy" };
    if (this.current === undefined) {
      return { outcome: "failure", code: "workspace_identity_invalid" };
    }
    this.busy = true;
    const operationRoot = path.join(
      this.input.stateRoot,
      RECOVERY_DIRECTORY,
      "exports",
      randomUUID(),
    );
    let exportKey: Buffer | undefined;
    let recoveryKey: Buffer | undefined;
    try {
      const filename = await this.input.selectExportPath(
        this.current.workspaceName,
      );
      if (filename === undefined) return { outcome: "cancelled" };
      mkdirSync(operationRoot, { recursive: true, mode: 0o700 });
      const databasePath = path.join(
        this.input.stateRoot,
        ACTIVE_DIRECTORY,
        "workspace.db",
      );
      const portableDatabase = path.join(operationRoot, "workspace-export.db");
      createEmptyFile(portableDatabase);
      const custody = new WorkspaceKeyCustody(
        this.input.safeStorage,
        path.join(this.input.stateRoot, ACTIVE_DIRECTORY, "key-wrapper.json"),
      );
      const bundle = await custody.load(this.current.identity.workspaceId);
      exportKey = randomBytes(32);
      exportEncryptedLocalStore({
        databaseFactory: this.input.databaseFactory,
        sourcePath: databasePath,
        sourceKey: bundle.key,
        destinationPath: portableDatabase,
        destinationKey: Buffer.from(exportKey),
        ...(this.input.platform === undefined
          ? {}
          : { platform: this.input.platform }),
      });
      const verified = openEncryptedLocalStore({
        databaseFactory: this.input.databaseFactory,
        databasePath: portableDatabase,
        key: Buffer.from(exportKey),
        ...(this.input.platform === undefined
          ? {}
          : { platform: this.input.platform }),
      });
      try {
        const summary = verified.store.recoverySummary(
          this.current.identity.workspaceId,
        );
        if (
          summary.workspace.rootSpaceId !== this.current.identity.rootSpaceId ||
          summary.principalId !== this.current.identity.principalId
        ) {
          throw new Error("WORKSPACE_EXPORT_IDENTITY_MISMATCH");
        }
      } finally {
        verified.close();
      }
      const recovery = createRecoveryCode();
      recoveryKey = recovery.key;
      const metadata = publishWorkspaceBackupArchive({
        filename,
        databasePath: portableDatabase,
        workspaceId: this.current.identity.workspaceId,
        workspaceName: this.current.workspaceName,
        appVersion: this.input.appVersion,
        createdAt: new Date().toISOString(),
        exportKey,
        recoveryKey,
      });
      exportKey = undefined;
      recoveryKey = undefined;
      return {
        outcome: "success",
        recoveryCode: recovery.code,
        fileLabel: path.basename(filename),
        metadata: metadataDto(metadata),
      };
    } catch (error) {
      console.error(
        "Workspace backup export stopped safely.",
        error instanceof Error ? `${error.name}: ${error.message}` : "unknown",
      );
      return { outcome: "failure", code: mapFailure(error) };
    } finally {
      exportKey?.fill(0);
      recoveryKey?.fill(0);
      rmSync(operationRoot, { recursive: true, force: true });
      this.busy = false;
    }
  }

  public async prepareRestore(
    recoveryCode: string,
  ): Promise<WorkspaceRestorePreviewResult> {
    if (this.busy) return { outcome: "failure", code: "operation_busy" };
    this.busy = true;
    const restoreId = randomUUID();
    const operationRoot = path.join(
      this.input.stateRoot,
      RECOVERY_DIRECTORY,
      "operations",
      restoreId,
    );
    const candidateRoot = path.join(operationRoot, "candidate");
    let archiveKey: Buffer | undefined;
    let localKey: Buffer | undefined;
    try {
      const filename = await this.input.selectBackupPath();
      if (filename === undefined) return { outcome: "cancelled" };
      mkdirSync(candidateRoot, { recursive: true, mode: 0o700 });
      const archiveDatabase = path.join(operationRoot, "archive.db");
      const extracted = extractWorkspaceBackup({
        filename,
        recoveryCode,
        destinationPath: archiveDatabase,
      });
      archiveKey = extracted.exportKey;
      const archiveStore = openEncryptedLocalStore({
        databaseFactory: this.input.databaseFactory,
        databasePath: archiveDatabase,
        key: Buffer.from(archiveKey),
        ...(this.input.platform === undefined
          ? {}
          : { platform: this.input.platform }),
      });
      let archiveSummary: LocalWorkspaceRecoverySummary;
      try {
        archiveSummary = archiveStore.store.recoverySummary(
          extracted.metadata.workspaceId,
        );
      } finally {
        archiveStore.close();
      }
      const candidateDatabase = path.join(candidateRoot, "workspace.db");
      createEmptyFile(candidateDatabase);
      localKey = randomBytes(32);
      exportEncryptedLocalStore({
        databaseFactory: this.input.databaseFactory,
        sourcePath: archiveDatabase,
        sourceKey: archiveKey,
        destinationPath: candidateDatabase,
        destinationKey: Buffer.from(localKey),
        ...(this.input.platform === undefined
          ? {}
          : { platform: this.input.platform }),
      });
      archiveKey = undefined;
      const candidateStore = openEncryptedLocalStore({
        databaseFactory: this.input.databaseFactory,
        databasePath: candidateDatabase,
        key: Buffer.from(localKey),
        ...(this.input.platform === undefined
          ? {}
          : { platform: this.input.platform }),
      });
      let candidateSummary: LocalWorkspaceRecoverySummary;
      try {
        candidateSummary = candidateStore.store.recoverySummary(
          extracted.metadata.workspaceId,
        );
      } finally {
        candidateStore.close();
      }
      if (
        JSON.stringify(candidateSummary.counts) !==
          JSON.stringify(archiveSummary.counts) ||
        candidateSummary.workspace.rootSpaceId !==
          archiveSummary.workspace.rootSpaceId ||
        candidateSummary.principalId !== archiveSummary.principalId
      ) {
        throw new Error("WORKSPACE_RESTORE_IDENTITY_MISMATCH");
      }
      const custody = new WorkspaceKeyCustody(
        this.input.safeStorage,
        path.join(candidateRoot, "key-wrapper.json"),
      );
      await custody.createWithKey(
        {
          workspaceId: extracted.metadata.workspaceId,
          rootSpaceId: candidateSummary.workspace.rootSpaceId,
          principalId: candidateSummary.principalId,
          credentialId: CredentialIdSchema.parse(randomUUID()),
          grantId: GrantIdSchema.parse(randomUUID()),
        },
        localKey,
        "ready",
      );
      localKey = undefined;
      rmSync(archiveDatabase, { force: true });
      writeCanonicalFile(path.join(operationRoot, "operation.json"), {
        format: OPERATION_FORMAT,
        restoreId,
        archiveId: extracted.metadata.archiveId,
        workspaceId: extracted.metadata.workspaceId,
        state: "candidate_verified",
      });
      const prepared: PreparedRestore = {
        restoreId,
        candidateRoot,
        operationRoot,
        metadata: extracted.metadata,
        summary: candidateSummary,
      };
      this.prepared.set(restoreId, prepared);
      return {
        outcome: "preview",
        restoreId,
        metadata: metadataDto(extracted.metadata),
        counts: candidateSummary.counts,
      };
    } catch (error) {
      console.error(
        "Workspace restore preview stopped safely.",
        error instanceof Error ? `${error.name}: ${error.message}` : "unknown",
      );
      rmSync(operationRoot, { recursive: true, force: true });
      return { outcome: "failure", code: mapFailure(error) };
    } finally {
      archiveKey?.fill(0);
      localKey?.fill(0);
      this.busy = false;
    }
  }

  public cancelRestore(restoreId: string): void {
    if (!isUuid(restoreId) || this.busy) return;
    const prepared = this.prepared.get(restoreId);
    if (prepared === undefined) return;
    this.prepared.delete(restoreId);
    rmSync(prepared.operationRoot, { recursive: true, force: true });
  }

  public async confirmRestore(
    restoreId: string,
  ): Promise<WorkspaceRestoreResult> {
    if (this.busy) return { outcome: "failure", code: "operation_busy" };
    if (!isUuid(restoreId)) {
      return { outcome: "failure", code: "workspace_identity_invalid" };
    }
    const prepared = this.prepared.get(restoreId);
    if (prepared === undefined) {
      return { outcome: "failure", code: "restore_interrupted" };
    }
    this.busy = true;
    const recoveryRoot = path.join(this.input.stateRoot, RECOVERY_DIRECTORY);
    const journalPath = path.join(recoveryRoot, "activation.json");
    const activeRoot = path.join(this.input.stateRoot, ACTIVE_DIRECTORY);
    const retainedRoot = path.join(recoveryRoot, `retained-${restoreId}`);
    try {
      writeCanonicalFile(journalPath, {
        format: JOURNAL_FORMAT,
        restoreId,
        state: "prepared",
      });
      this.current?.close();
      renameSync(activeRoot, retainedRoot);
      writeCanonicalFile(journalPath, {
        format: JOURNAL_FORMAT,
        restoreId,
        state: "previous_retained",
      });
      this.input.failpoint?.("after-previous-retained");
      renameSync(prepared.candidateRoot, activeRoot);
      writeCanonicalFile(journalPath, {
        format: JOURNAL_FORMAT,
        restoreId,
        state: "candidate_active_unverified",
      });
      this.input.failpoint?.("after-candidate-activated");
      const next = await createDurableKernelService({
        databaseFactory: this.input.databaseFactory,
        safeStorage: this.input.safeStorage,
        stateRoot: this.input.stateRoot,
        timezone: this.input.timezone,
        ...(this.input.platform === undefined
          ? {}
          : { platform: this.input.platform }),
      });
      if (next.identity.workspaceId !== prepared.metadata.workspaceId) {
        next.close();
        throw new Error("WORKSPACE_RESTORE_OPEN_IDENTITY_MISMATCH");
      }
      this.current = next;
      this.prepared.delete(restoreId);
      rmSync(journalPath, { force: true });
      rmSync(prepared.operationRoot, { recursive: true, force: true });
      syncDirectory(this.input.stateRoot);
      return { outcome: "success", workspaceId: next.identity.workspaceId };
    } catch {
      try {
        recoverInterruptedRestore(this.input.stateRoot);
        this.current = await createDurableKernelService({
          databaseFactory: this.input.databaseFactory,
          safeStorage: this.input.safeStorage,
          stateRoot: this.input.stateRoot,
          timezone: this.input.timezone,
          ...(this.input.platform === undefined
            ? {}
            : { platform: this.input.platform }),
        });
        this.prepared.delete(restoreId);
        rmSync(prepared.operationRoot, { recursive: true, force: true });
      } catch {
        return { outcome: "failure", code: "restore_interrupted" };
      }
      return { outcome: "failure", code: "restore_interrupted" };
    } finally {
      this.busy = false;
    }
  }
}

export const createWorkspaceRecoveryService = async (input: {
  readonly appVersion: string;
  readonly databaseFactory: EncryptedSqliteDatabaseFactory;
  readonly failpoint?: WorkspaceRecoveryFailpoint;
  readonly platform?: NodeJS.Platform;
  readonly safeStorage: AsyncSafeStorage;
  readonly selectBackupPath: () => Promise<string | undefined>;
  readonly selectExportPath: (
    workspaceName: string,
  ) => Promise<string | undefined>;
  readonly stateRoot: string;
  readonly timezone: string;
  readonly bootstrapProjection?: DurableBootstrapProjection;
}): Promise<WorkspaceRecoveryService> => {
  const startupRecovery = recoverInterruptedRestore(input.stateRoot);
  let kernel: DurableKernelService | undefined;
  let recoveryReason: WorkspaceRecoveryService["recoveryReason"] = "none";
  try {
    kernel = await createDurableKernelService({
      databaseFactory: input.databaseFactory,
      safeStorage: input.safeStorage,
      stateRoot: input.stateRoot,
      timezone: input.timezone,
      ...(input.bootstrapProjection === undefined
        ? {}
        : { bootstrapProjection: input.bootstrapProjection }),
      ...(input.platform === undefined ? {} : { platform: input.platform }),
    });
  } catch (error) {
    if (error instanceof WorkspaceKeyCustodyError) {
      recoveryReason =
        error.code === "encryption_unavailable"
          ? "secure_storage_unavailable"
          : "protected_key_unavailable";
    } else if (error instanceof DurableWorkspaceOpenError) {
      recoveryReason = "workspace_unavailable";
    } else {
      throw error;
    }
  }
  return new DefaultWorkspaceRecoveryService(
    kernel,
    startupRecovery,
    recoveryReason,
    input,
  );
};

export const recoverInterruptedWorkspaceRestore = recoverInterruptedRestore;
