import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import {
  CommandEnvelopeSchema,
  CredentialIdSchema,
  GrantIdSchema,
  PrincipalIdSchema,
  QueryEnvelopeSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
} from "@constellation/contracts";
import type {
  EncryptedSqliteDatabase,
  EncryptedSqliteDatabaseFactory,
  SqliteStatement,
} from "@constellation/local-store";

import {
  DurableWorkspaceOpenError,
  createDurableKernelService,
} from "../src/durable-kernel-service.js";
import { runAlphaSmoke } from "../src/alpha-smoke.js";
import {
  WorkspaceKeyCustody,
  type AsyncSafeStorage,
} from "../src/workspace-key-custody.js";

const rowStatement = (row: unknown): SqliteStatement => ({
  all: () => (row === undefined ? [] : [row]),
  get: () => row,
  run: () => ({ changes: 0 }),
});

class SyntheticEncryptedDatabase implements EncryptedSqliteDatabase {
  public constructor(private readonly database: DatabaseSync) {}

  public key(key: Uint8Array): void {
    assert.equal(key.byteLength, 32);
    assert(key.some((value) => value !== 0));
  }

  public loadExtension(): never {
    throw new TypeError("Loadable extensions are disabled");
  }

  public exec(sql: string): void {
    this.database.exec(sql);
  }

  public prepare(sql: string): SqliteStatement {
    const normalized = sql.trim();
    if (normalized === "PRAGMA cipher_version") {
      return rowStatement({ cipher_version: "4.16.0 community" });
    }
    if (normalized === "PRAGMA cipher_provider") {
      return rowStatement({ cipher_provider: "commoncrypto" });
    }
    if (normalized === "PRAGMA cipher_provider_version") {
      return rowStatement({
        cipher_provider_version: "Apple CommonCrypto synthetic",
      });
    }
    if (normalized === "PRAGMA compile_options") {
      return {
        ...rowStatement(undefined),
        all: () =>
          [
            "HAS_CODEC",
            "ENABLE_FTS5",
            "TEMP_STORE=2",
            "OMIT_LOAD_EXTENSION",
          ].map((compile_options) => ({ compile_options })),
      };
    }
    if (normalized === "PRAGMA cipher_integrity_check") {
      return { ...rowStatement(undefined), all: () => [] };
    }
    if (normalized === "PRAGMA journal_mode = WAL") {
      this.database.exec("PRAGMA journal_mode = WAL");
      return rowStatement({ journal_mode: "wal" });
    }
    if (normalized === "SELECT load_extension(?)") {
      return {
        ...rowStatement(undefined),
        get: () => {
          throw new Error("no such function: load_extension");
        },
      };
    }
    return this.database.prepare(sql) as unknown as SqliteStatement;
  }

  public close(): void {
    this.database.close();
  }
}

class SyntheticEncryptedFactory implements EncryptedSqliteDatabaseFactory {
  public open(
    filename: string,
    options: { readonly fileMustExist: boolean },
  ): EncryptedSqliteDatabase {
    if (options.fileMustExist && !existsSync(filename)) {
      throw new Error("database missing");
    }
    return new SyntheticEncryptedDatabase(new DatabaseSync(filename));
  }
}

class SyntheticSafeStorage implements AsyncSafeStorage {
  public async isAsyncEncryptionAvailable(): Promise<boolean> {
    return true;
  }

  public async encryptStringAsync(value: string): Promise<Buffer> {
    return Buffer.from(Buffer.from(value, "utf8").map((byte) => byte ^ 0xa5));
  }

  public async decryptStringAsync(value: Buffer): Promise<{
    readonly result: string;
    readonly shouldReEncrypt: boolean;
  }> {
    return {
      result: Buffer.from(value.map((byte) => byte ^ 0xa5)).toString("utf8"),
      shouldReEncrypt: false,
    };
  }
}

const withStateRoot = async (
  run: (stateRoot: string) => Promise<void>,
): Promise<void> => {
  const stateRoot = mkdtempSync(path.join(tmpdir(), "constellation-durable-"));
  try {
    await run(stateRoot);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
};

describe("durable desktop kernel lifecycle", () => {
  it("restores identity and Capture to Task state across restart", async () => {
    await withStateRoot(async (stateRoot) => {
      const input = {
        databaseFactory: new SyntheticEncryptedFactory(),
        safeStorage: new SyntheticSafeStorage(),
        stateRoot,
        timezone: "Europe/Warsaw",
        platform: "darwin" as const,
      };
      const first = await createDurableKernelService(input);
      assert.match(first.identity.workspaceId, /^[0-9a-f-]{36}$/);
      const submitted = first.service.execute(
        CommandEnvelopeSchema.parse({
          contractVersion: 1,
          commandName: "capture.submitText",
          commandId: crypto.randomUUID(),
          workspaceId: first.identity.workspaceId,
          idempotencyKey: "durable-capture-v1",
          expectedVersions: {},
          correlationId: crypto.randomUUID(),
          payload: {
            spaceId: first.identity.rootSpaceId,
            originalText: "Ship durable interactive alpha",
            deviceId: "durable-test",
            source: "in_app_quick_capture",
          },
        }),
      );
      if (
        submitted.kind !== "command_outcome" ||
        submitted.outcome.outcome !== "success" ||
        submitted.outcome.projection.kind !== "capture.stored"
      ) {
        assert.fail("Capture should be stored.");
      }
      const capture = submitted.outcome.projection;
      const routed = first.service.execute(
        CommandEnvelopeSchema.parse({
          contractVersion: 1,
          commandName: "capture.routeAsTask",
          commandId: crypto.randomUUID(),
          workspaceId: first.identity.workspaceId,
          idempotencyKey: "durable-route-v1",
          expectedVersions: { [capture.captureId]: capture.version },
          correlationId: crypto.randomUUID(),
          payload: {
            captureId: capture.captureId,
            title: "Ship durable interactive alpha",
          },
        }),
      );
      assert.equal(routed.kind, "command_outcome");
      first.close();

      const second = await createDurableKernelService(input);
      assert.deepEqual(second.identity, first.identity);
      const tasks = second.service.query(
        QueryEnvelopeSchema.parse({
          contractVersion: 1,
          queryName: "task.list",
          queryId: crypto.randomUUID(),
          workspaceId: second.identity.workspaceId,
          consistency: "local_authoritative",
          parameters: { spaceId: second.identity.rootSpaceId },
        }),
      );
      if (
        tasks.kind !== "query_result" ||
        tasks.result.outcome !== "success" ||
        tasks.result.projection.kind !== "task.list"
      ) {
        assert.fail("Task list should be restored.");
      }
      assert.equal(tasks.result.projection.items.length, 1);
      assert.equal(
        tasks.result.projection.items[0]?.sourceCaptureId,
        capture.captureId,
      );
      second.close();
    });
  });

  it("recovers a prepared identity when database creation was interrupted", async () => {
    await withStateRoot(async (stateRoot) => {
      const safeStorage = new SyntheticSafeStorage();
      const input = {
        databaseFactory: new SyntheticEncryptedFactory(),
        safeStorage,
        stateRoot,
        timezone: "Europe/Warsaw",
        platform: "darwin" as const,
      };
      const identity = {
        workspaceId: WorkspaceIdSchema.parse(
          "00000000-0000-4000-8000-000000000101",
        ),
        rootSpaceId: SpaceIdSchema.parse(
          "00000000-0000-4000-8000-000000000102",
        ),
        principalId: PrincipalIdSchema.parse(
          "00000000-0000-4000-8000-000000000103",
        ),
        credentialId: CredentialIdSchema.parse(
          "00000000-0000-4000-8000-000000000104",
        ),
        grantId: GrantIdSchema.parse("00000000-0000-4000-8000-000000000105"),
      };
      const custody = new WorkspaceKeyCustody(
        safeStorage,
        path.join(stateRoot, "local-alpha-workspace", "key-wrapper.json"),
      );
      const prepared = await custody.create(identity);
      prepared.key.fill(0);

      const recovered = await createDurableKernelService(input);
      assert.deepEqual(recovered.identity, identity);
      recovered.close();
    });
  });

  it("fails into recovery when a ready workspace database is missing", async () => {
    await withStateRoot(async (stateRoot) => {
      const input = {
        databaseFactory: new SyntheticEncryptedFactory(),
        safeStorage: new SyntheticSafeStorage(),
        stateRoot,
        timezone: "Europe/Warsaw",
        platform: "darwin" as const,
      };
      const ready = await createDurableKernelService(input);
      ready.close();
      rmSync(path.join(stateRoot, "local-alpha-workspace", "workspace.db"));
      await assert.rejects(
        () => createDurableKernelService(input),
        (error: unknown) => {
          assert(error instanceof DurableWorkspaceOpenError);
          return error.code === "workspace_recovery_required";
        },
      );
    });
  });

  it("keeps first creation retryable when the native driver is incompatible", async () => {
    await withStateRoot(async (stateRoot) => {
      const safeStorage = new SyntheticSafeStorage();
      await assert.rejects(() =>
        createDurableKernelService({
          databaseFactory: {
            open: () => {
              throw new TypeError("incompatible native driver");
            },
          },
          safeStorage,
          stateRoot,
          timezone: "Europe/Warsaw",
          platform: "darwin",
        }),
      );
      const workspaceRoot = path.join(stateRoot, "local-alpha-workspace");
      assert.equal(existsSync(path.join(workspaceRoot, "workspace.db")), false);
      assert.equal(
        existsSync(path.join(workspaceRoot, "key-wrapper.json")),
        true,
      );

      const retried = await createDurableKernelService({
        databaseFactory: new SyntheticEncryptedFactory(),
        safeStorage,
        stateRoot,
        timezone: "Europe/Warsaw",
        platform: "darwin",
      });
      retried.close();
    });
  });

  it("proves the packaged smoke journey is created once and restored", async () => {
    await withStateRoot(async (stateRoot) => {
      const input = {
        databaseFactory: new SyntheticEncryptedFactory(),
        safeStorage: new SyntheticSafeStorage(),
        stateRoot,
        timezone: "Europe/Warsaw",
        platform: "darwin" as const,
      };
      const reportPath = path.join(stateRoot, "smoke.json");
      const first = await createDurableKernelService(input);
      runAlphaSmoke({
        facts: first.facts,
        identity: first.identity,
        reportPath,
        service: first.service,
      });
      assert.equal(
        JSON.parse(readFileSync(reportPath, "utf8")).phase,
        "created",
      );
      first.close();

      const second = await createDurableKernelService(input);
      runAlphaSmoke({
        facts: second.facts,
        identity: second.identity,
        reportPath,
        service: second.service,
      });
      assert.equal(
        JSON.parse(readFileSync(reportPath, "utf8")).phase,
        "restored",
      );
      second.close();
    });
  });
});
