import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CommandOutcomeSchema,
  GlobalSearchRecordKindSchema,
  QueryProjectionSchema,
  QueryResultSchema,
  WorkLinkTypeSchema,
  getHumanRecordKindDescriptor,
  globalSearchRecordKindIds,
  humanRecordKindRegistry,
  isGlobalSearchRecordKind,
  validateCommandEnvelope,
  validateExecutionContext,
  validateQueryEnvelope,
} from "../src/index.js";

const ids = {
  workspace: "00000000-0000-4000-8000-000000000001",
  space: "00000000-0000-4000-8000-000000000002",
  principal: "00000000-0000-4000-8000-000000000003",
  credential: "00000000-0000-4000-8000-000000000004",
  grant: "00000000-0000-4000-8000-000000000005",
  command: "00000000-0000-4000-8000-000000000006",
  correlation: "00000000-0000-4000-8000-000000000007",
  query: "00000000-0000-4000-8000-000000000008",
} as const;

const context = {
  principalId: ids.principal,
  principalKind: "human",
  credentialId: ids.credential,
  grantId: ids.grant,
  policyVersion: 1,
  workspaceId: ids.workspace,
  spaceScope: [ids.space],
  capabilityScope: [
    "capture.submit",
    "capture.process",
    "capture.submitText",
    "capture.routeAsTask",
    "capture.history",
    "task.list",
  ],
  origin: "desktop",
};

const captureCommand = {
  contractVersion: 1,
  commandName: "capture.submitText",
  commandId: ids.command,
  workspaceId: ids.workspace,
  payload: {
    spaceId: ids.space,
    originalText: "Synthetic private body",
    deviceId: "test-device",
    source: "global_quick_capture",
  },
  idempotencyKey: "capture-1",
  expectedVersions: {},
  correlationId: ids.correlation,
};

const routeCommand = {
  contractVersion: 1,
  commandName: "capture.routeAsTask",
  commandId: ids.command,
  workspaceId: ids.workspace,
  payload: {
    captureId: ids.query,
    title: "Synthetic routed task",
  },
  idempotencyKey: "route-1",
  expectedVersions: { [ids.query]: 1 },
  correlationId: ids.correlation,
};

const submitUrlCommand = {
  ...captureCommand,
  commandName: "capture.submit",
  payload: {
    spaceId: ids.space,
    original: {
      kind: "url",
      url: "https://example.test/research?utm_source=ignored",
      title: "Research source",
    },
    deviceId: "test-device",
    source: "global_quick_capture",
  },
  idempotencyKey: "capture-url-1",
};

const processCaptureCommand = {
  ...captureCommand,
  commandName: "capture.process",
  payload: {
    captureId: ids.query,
    destination: "auto",
  },
  idempotencyKey: "capture-process-1",
  expectedVersions: { [ids.query]: 1 },
};

describe("application contracts", () => {
  it("derives human record discovery from one bounded registry", () => {
    assert.equal(
      new Set(humanRecordKindRegistry.map((descriptor) => descriptor.id)).size,
      humanRecordKindRegistry.length,
    );
    assert.deepEqual(globalSearchRecordKindIds, [
      "task",
      "project",
      "capture",
      "source",
      "note",
      "document",
      "deliverable",
      "organization",
      "person",
      "opportunity",
      "offer",
      "renewal",
      "relationship_fact",
      "decision",
      "impact_review",
      "area",
      "recurrence",
      "radar_candidate",
      "meeting",
    ]);
    assert.equal(
      humanRecordKindRegistry.every(
        (descriptor) =>
          descriptor.label.length > 0 &&
          (descriptor.searchable
            ? descriptor.searchSource !== null
            : descriptor.searchSource === null),
      ),
      true,
    );
    assert.equal(
      GlobalSearchRecordKindSchema.safeParse("meeting").success,
      true,
    );
    assert.equal(
      GlobalSearchRecordKindSchema.safeParse("saved_view").success,
      false,
    );
    assert.equal(isGlobalSearchRecordKind("document"), true);
    assert.equal(isGlobalSearchRecordKind("commitment"), false);
    assert.equal(
      getHumanRecordKindDescriptor("organization").inspectorSurface,
      "organizations",
    );
  });

  it("accepts strict execution, command, and query envelopes", () => {
    assert.equal(validateExecutionContext(context).ok, true);
    assert.equal(validateCommandEnvelope(captureCommand).ok, true);
    assert.equal(validateCommandEnvelope(routeCommand).ok, true);
    assert.equal(validateCommandEnvelope(submitUrlCommand).ok, true);
    assert.equal(validateCommandEnvelope(processCaptureCommand).ok, true);
    assert.equal(
      validateQueryEnvelope({
        contractVersion: 1,
        queryName: "capture.history",
        queryId: ids.query,
        workspaceId: ids.workspace,
        consistency: "local_authoritative",
        parameters: { spaceId: ids.space },
      }).ok,
      true,
    );
    assert.equal(
      validateQueryEnvelope({
        contractVersion: 1,
        queryName: "task.list",
        queryId: ids.query,
        workspaceId: ids.workspace,
        consistency: "local_authoritative",
        parameters: { spaceId: ids.space, limit: 50 },
      }).ok,
      true,
    );
  });

  it("accepts references and managed payload descriptors while rejecting file content", () => {
    const submitText = validateCommandEnvelope({
      ...submitUrlCommand,
      payload: {
        ...submitUrlCommand.payload,
        original: { kind: "text", text: "Follow up with Patryk" },
      },
    });
    const submitFile = validateCommandEnvelope({
      ...submitUrlCommand,
      payload: {
        ...submitUrlCommand.payload,
        original: {
          kind: "file",
          displayName: "brief.pdf",
          reference: "constellation-file://picker/brief.pdf",
          mediaType: "application/pdf",
          sizeBytes: 42_000,
        },
      },
    });
    const fileWithContent = validateCommandEnvelope({
      ...submitUrlCommand,
      payload: {
        ...submitUrlCommand.payload,
        original: {
          kind: "file",
          displayName: "brief.pdf",
          reference: "constellation-file://picker/brief.pdf",
          content: "private bytes",
        },
      },
    });
    const managedFile = validateCommandEnvelope({
      ...submitUrlCommand,
      payload: {
        ...submitUrlCommand.payload,
        original: {
          kind: "managed_file",
          payload: {
            payloadId: "00000000-0000-4000-8000-000000000009",
            displayName: "brief.pdf",
            mediaType: "application/pdf",
            byteLength: 42_000,
            contentSha256: "a".repeat(64),
            custodyState: "available",
          },
        },
      },
    });
    const screenshotWithPath = validateCommandEnvelope({
      ...submitUrlCommand,
      payload: {
        ...submitUrlCommand.payload,
        original: {
          kind: "screenshot",
          payload: {
            payloadId: "00000000-0000-4000-8000-000000000009",
            displayName: "Screenshot.png",
            mediaType: "image/png",
            byteLength: 200,
            contentSha256: "b".repeat(64),
            custodyState: "available",
            path: "/private/customer/Screenshot.png",
          },
        },
      },
    });

    assert.equal(submitText.ok, true);
    assert.equal(submitFile.ok, true);
    assert.equal(managedFile.ok, true);
    assert.equal(fileWithContent.ok, false);
    assert.equal(screenshotWithPath.ok, false);
  });

  it("rejects unknown route and task-list fields at strict boundaries", () => {
    const route = validateCommandEnvelope({
      ...routeCommand,
      payload: { ...routeCommand.payload, actorId: ids.principal },
    });
    const taskList = validateQueryEnvelope({
      contractVersion: 1,
      queryName: "task.list",
      queryId: ids.query,
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.space, hiddenFilter: "private" },
    });

    assert.equal(route.ok, false);
    assert.equal(taskList.ok, false);
    if (!route.ok && !taskList.ok) {
      assert.deepEqual(route.issues, [
        { code: "unrecognized_keys", path: "payload" },
      ]);
      assert.deepEqual(taskList.issues, [
        { code: "unrecognized_keys", path: "parameters" },
      ]);
    }
  });

  it("rejects unknown fields at the envelope and payload boundaries", () => {
    const topLevel = validateCommandEnvelope({
      ...captureCommand,
      unexpected: true,
    });
    const payload = validateCommandEnvelope({
      ...captureCommand,
      payload: { ...captureCommand.payload, unexpected: true },
    });

    assert.equal(topLevel.ok, false);
    assert.equal(payload.ok, false);
    if (!topLevel.ok && !payload.ok) {
      assert.deepEqual(topLevel.issues, [
        { code: "unrecognized_keys", path: "" },
      ]);
      assert.deepEqual(payload.issues, [
        { code: "unrecognized_keys", path: "payload" },
      ]);
    }
  });

  it("returns content-safe validation issues without echoing capture text", () => {
    const secret = "DO_NOT_ECHO_THIS_CAPTURE_BODY";
    const result = validateCommandEnvelope({
      ...captureCommand,
      payload: {
        ...captureCommand.payload,
        originalText: "",
        privateDebugValue: secret,
      },
    });

    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes(secret), false);
    if (!result.ok) {
      assert.deepEqual(
        result.issues.map((issue) => issue.path),
        ["payload.originalText", "payload"],
      );
    }
  });

  it("rejects an invalid workspace time zone before domain execution", () => {
    const result = validateCommandEnvelope({
      ...captureCommand,
      commandName: "workspace.createLocal",
      payload: {
        workspaceId: ids.workspace,
        rootSpaceId: ids.space,
        ownerPrincipalId: ids.principal,
        name: "Synthetic workspace",
        timezone: "Mars/Olympus_Mons",
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.issues, [
        { code: "custom", path: "payload.timezone" },
      ]);
    }
  });

  it("rejects outcome and diagnostic combinations that contradict each other", () => {
    const result = CommandOutcomeSchema.safeParse({
      outcome: "success",
      contractVersion: 1,
      commandId: ids.command,
      correlationId: ids.correlation,
      kernelTime: "2026-07-12T12:00:00.000Z",
      diagnosticCode: "workspace.created",
      affected: [],
      auditReceiptId: ids.query,
      projection: {
        kind: "capture.stored",
        captureId: ids.query,
        processingState: "pending_processing",
        version: 1,
      },
    });
    assert.equal(result.success, false);

    const wave2Result = CommandOutcomeSchema.safeParse({
      outcome: "success",
      contractVersion: 1,
      commandId: ids.command,
      correlationId: ids.correlation,
      kernelTime: "2026-07-12T12:00:00.000Z",
      diagnosticCode: "project.created",
      affected: [],
      auditReceiptId: ids.query,
      projection: {
        kind: "project.outcome_updated",
        projectId: ids.query,
        title: "Synthetic Project",
        intendedOutcome: "Contradictory projection",
        lifecycle: "active",
        version: 2,
      },
    });
    assert.equal(wave2Result.success, false);
  });

  it("carries a project rename with a deadline, and refuses a null one", () => {
    const outcome = (projection: Readonly<Record<string, unknown>>) =>
      CommandOutcomeSchema.safeParse({
        outcome: "success",
        contractVersion: 1,
        commandId: ids.command,
        correlationId: ids.correlation,
        kernelTime: "2026-07-12T12:00:00.000Z",
        diagnosticCode: "project.details_updated",
        affected: [],
        auditReceiptId: ids.query,
        projection,
      });

    const base = {
      kind: "project.details_updated",
      projectId: ids.query,
      title: "Renamed delivery",
      intendedOutcome: "The client works unaided",
      needsReview: false,
      lifecycle: "active",
      version: 2,
    } as const;

    assert.equal(outcome(base).success, true, "a rename with no deadline");
    assert.equal(
      outcome({ ...base, dueAt: "2026-09-30T21:59:59.999Z" }).success,
      true,
    );
    // `null` jest tu ODMOWĄ, nie wartością, i to jest cała treść tej asercji:
    // zapisany `null` przechodzi zapis i wywala ODCZYT, bo `project.list` ma to
    // pole jako `.strict()`-ISO — awaria jeden ekran od miejsca zapisu. Termin
    // zdejmuje się `null`-em w KOMENDZIE, nigdy w projekcji.
    assert.equal(outcome({ ...base, dueAt: null }).success, false);
  });

  it("names the records that block a removal, up to the cap", () => {
    const blocked = (
      blockedBy: readonly Readonly<Record<string, unknown>>[],
      blockedByCount: number,
    ): boolean =>
      CommandOutcomeSchema.safeParse({
        outcome: "rejected",
        contractVersion: 1,
        commandId: ids.command,
        correlationId: ids.correlation,
        kernelTime: "2026-07-24T12:00:00.000Z",
        diagnosticCode: "record.still_referenced",
        blockedBy,
        blockedByCount,
      }).success;
    const person = {
      recordId: ids.query,
      recordKind: "strategicRecord",
      recordType: "person",
    };
    assert.equal(blocked([person], 1), true);
    // The cap is what keeps the outcome a bounded message; the count carries
    // the rest.
    assert.equal(
      blocked(
        Array.from({ length: 20 }, () => person),
        45,
      ),
      true,
    );
    assert.equal(
      blocked(
        Array.from({ length: 21 }, () => person),
        45,
      ),
      false,
    );
    // A count below the sample it summarises would under-report the work left.
    assert.equal(blocked([person, person], 1), false);
  });

  it("accepts exact retryable storage recovery diagnostics", () => {
    for (const diagnosticCode of [
      "storage.unit_of_work_failed",
      "storage.capacity_exhausted",
      "storage.permission_denied",
    ] as const) {
      assert.equal(
        CommandOutcomeSchema.safeParse({
          outcome: "retryable",
          contractVersion: 1,
          commandId: ids.command,
          correlationId: ids.correlation,
          kernelTime: "2026-07-17T00:00:00.000Z",
          diagnosticCode,
        }).success,
        true,
      );
    }
  });

  it("states one recovery vocabulary for commands and one for checkpoints", () => {
    const undoPreview = (
      projection: Readonly<Record<string, unknown>>,
    ): boolean =>
      CommandOutcomeSchema.safeParse({
        outcome: "preview",
        contractVersion: 1,
        commandId: ids.command,
        correlationId: ids.correlation,
        kernelTime: "2026-07-22T00:00:00.000Z",
        diagnosticCode: "undo.previewed",
        projection: {
          kind: "undo.previewed",
          targetCommandId: ids.command,
          available: false,
          affectedRecordIds: [],
          requiredVersions: {},
          ...projection,
        },
      }).success;
    const recoveryPreview = (
      projection: Readonly<Record<string, unknown>>,
    ): boolean =>
      QueryResultSchema.safeParse({
        outcome: "success",
        contractVersion: 1,
        queryId: ids.query,
        kernelTime: "2026-07-22T00:00:00.000Z",
        freshness: {
          mode: "local_authoritative",
          checkpoint: null,
          missingCapabilities: [],
        },
        projection: {
          kind: "recovery.preview",
          targetCommandId: ids.command,
          available: false,
          affectedRecordIds: [],
          requiredVersions: {},
          ...projection,
        },
      }).success;
    const checkpointPreview = (
      projection: Readonly<Record<string, unknown>>,
    ): boolean =>
      QueryResultSchema.safeParse({
        outcome: "success",
        contractVersion: 1,
        queryId: ids.query,
        kernelTime: "2026-07-22T00:00:00.000Z",
        freshness: {
          mode: "local_authoritative",
          checkpoint: null,
          missingCapabilities: [],
        },
        projection: {
          kind: "agent.checkpoint_revert_preview",
          checkpointId: ids.query,
          available: false,
          commandIds: [ids.command],
          affectedRecordIds: [],
          blocked: [],
          ...projection,
        },
      }).success;

    for (const unavailableReason of [
      "unsupported",
      "already_undone",
      "later_change",
    ] as const) {
      assert.equal(undoPreview({ unavailableReason }), true);
      assert.equal(recoveryPreview({ unavailableReason }), true);
    }
    // A checkpoint summarizes the captured command that blocks it, so every
    // per-command reason has to be sayable here too — the checkpoint
    // vocabulary is the command one plus the two states only a checkpoint can
    // be in. Keeping "already_undone" out of it forced the preview to report a
    // consumed compensation as "later_change", which named the wrong cause.
    for (const unavailableReason of [
      "unsupported",
      "already_reverted",
      "empty",
      "later_change",
      "already_undone",
      "still_referenced",
    ] as const) {
      assert.equal(checkpointPreview({ unavailableReason }), true);
    }

    // The asymmetry that remains: a single command has no revert lifecycle, so
    // neither checkpoint-only state is sayable about one.
    assert.equal(undoPreview({ unavailableReason: "already_reverted" }), false);
    assert.equal(undoPreview({ unavailableReason: "empty" }), false);
    assert.equal(
      recoveryPreview({ unavailableReason: "already_reverted" }),
      false,
    );
    assert.equal(checkpointPreview({ unavailableReason: "missing" }), false);
    // The blocked list is the preview's own refusal, in the revert's shape, so
    // it carries the per-command vocabulary and nothing else.
    assert.equal(
      checkpointPreview({
        blocked: [
          {
            targetCommandId: ids.command,
            unavailableReason: "still_referenced",
          },
        ],
      }),
      true,
    );
    assert.equal(
      checkpointPreview({
        blocked: [
          {
            targetCommandId: ids.command,
            unavailableReason: "already_reverted",
          },
        ],
      }),
      false,
    );
  });

  // 0.1.5 widened the work-link vocabulary at the command and in the domain but
  // in neither projection that carries a link, and because query results are
  // parsed strictly, one such link faulted `relationship.workspace` and
  // `work.overview` outright rather than degrading. The compile-time guard in
  // `wave2.ts` compares key sets, so a widened VALUE inside an existing key is
  // invisible to it. This loop is the artifact that closes that gap: it is
  // driven by the vocabulary itself, so a member added tomorrow is covered
  // without anyone remembering to add a case. It is also the only check that
  // reaches the `work.overview` links array, which is an inline anonymous
  // object no type-level guard can name.
  for (const linkType of WorkLinkTypeSchema.options) {
    it(`projects a ${linkType} work link through both readers`, () => {
      const freshness = {
        mode: "local_authoritative",
        checkpoint: null,
        missingCapabilities: [],
      } as const;
      const result = {
        outcome: "success",
        contractVersion: 1,
        queryId: ids.query,
        kernelTime: "2026-07-22T00:00:00.000Z",
        freshness,
      } as const;

      assert.equal(
        QueryResultSchema.safeParse({
          ...result,
          projection: {
            kind: "relationship.workspace",
            records: [
              {
                id: ids.command,
                workspaceId: ids.workspace,
                spaceId: ids.space,
                createdBy: ids.principal,
                kind: "work_link",
                linkType,
                sourceRecordId: ids.query,
                targetRecordId: ids.correlation,
                state: "active",
                version: 1,
                createdAt: "2026-07-22T00:00:00.000Z",
                updatedAt: "2026-07-22T00:00:00.000Z",
              },
            ],
            freshness,
          },
        }).success,
        true,
      );

      assert.equal(
        QueryResultSchema.safeParse({
          ...result,
          projection: {
            kind: "work.overview",
            tasks: [],
            projects: [],
            areas: [],
            initiatives: [],
            links: [
              {
                id: ids.command,
                linkType,
                sourceRecordId: ids.query,
                targetRecordId: ids.correlation,
                state: "active",
                version: 1,
              },
            ],
            savedViews: [],
            freshness,
          },
        }).success,
        true,
      );
    });
  }

  it("allows a direct Task projection without fabricated Capture provenance", () => {
    const result = QueryResultSchema.safeParse({
      outcome: "success",
      contractVersion: 1,
      queryId: ids.query,
      kernelTime: "2026-07-12T12:00:00.000Z",
      freshness: {
        mode: "local_authoritative",
        checkpoint: null,
        missingCapabilities: [],
      },
      projection: {
        kind: "task.list",
        items: [
          {
            id: ids.query,
            spaceId: ids.space,
            title: "Direct synthetic Task",
            status: {
              id: ids.command,
              label: "To do",
              operationalSemantics: "actionable",
            },
            completionState: "open",
            attachments: [],
            createdAt: "2026-07-12T12:00:00.000Z",
            updatedAt: "2026-07-12T12:00:00.000Z",
            version: 1,
          },
        ],
        nextCursor: null,
      },
    });
    assert.equal(result.success, true);
  });
});

// Kontrakt wyprowadzony z REJESTRU projekcji, nie z listy pisanej ręcznie —
// lekcja z fali prototypu: ręczna lista dała 41/41 na zielono przy czterech
// nieruszonych ekranach. Tutaj chodzi o `Task`, a `Task` NIE MA strażnika
// `UnprojectableKeys` (jedyny taki strażnik w repo pilnuje `StrategicRecord`),
// więc pole dodane na modelu i w komendzie skompiluje się i po prostu nigdy nie
// dojdzie do UI. Ten test jest tym, czego kompilator nie zrobi.
describe("task schedule projections", () => {
  // Kształt rozpoznajemy po OBU końcach terminu: `startAt` razem z `dueAt` to
  // własny harmonogram zadania. Sam `startAt` nosi też powód „starts_this_week"
  // w cocpicie — tam jest dowodem, nie planem, i autorstwa nie potrzebuje.
  const scheduleShapes = (): ReadonlyArray<{
    readonly path: string;
    readonly keys: readonly string[];
  }> => {
    const visited = new Set<unknown>();
    const found: { path: string; keys: readonly string[] }[] = [];
    const walk = (schema: unknown, path: string): void => {
      if (schema === null || typeof schema !== "object") return;
      const inner = (schema as { _zod?: { def?: Record<string, unknown> } })
        ._zod;
      if (inner?.def === undefined || visited.has(schema)) return;
      visited.add(schema);
      const def = inner.def;
      if (def["type"] === "object") {
        const shape = def["shape"] as Record<string, unknown>;
        const keys = Object.keys(shape);
        if (keys.includes("startAt") && keys.includes("dueAt")) {
          found.push({ path, keys });
        }
        for (const key of keys) walk(shape[key], `${path}.${key}`);
        return;
      }
      if (Array.isArray(def["options"])) {
        (def["options"] as unknown[]).forEach((option, index) => {
          walk(option, `${path}|${index}`);
        });
        return;
      }
      for (const [key, suffix] of [
        ["element", "[]"],
        ["innerType", ""],
        ["valueType", "{}"],
      ] as const) {
        if (def[key] !== undefined) {
          walk(def[key], `${path}${suffix}`);
          return;
        }
      }
      if (Array.isArray(def["items"])) {
        (def["items"] as unknown[]).forEach((item, index) => {
          walk(item, `${path}#${index}`);
        });
      }
    };
    walk(QueryProjectionSchema, "projection");
    return found;
  };

  it("finds the task schedules at all", () => {
    // Pusty wynik pomiaru to awaria pomiaru, nie wynik: gdyby chodzenie po
    // schemacie przestało działać, poniższy test przeszedłby na zero kształtach.
    assert.ok(
      scheduleShapes().length >= 3,
      `spodziewane co najmniej trzy projekcje harmonogramu, znaleziono ${scheduleShapes().length}`,
    );
  });

  it("hands the reader an effective working day, never a default to guess", () => {
    // Kontrakt: gdziekolwiek projekcja niesie dzień roboczy, niesie go jako
    // pole WYMAGANE. Opcjonalne pole zmusiłoby każdy ekran do przepisania u
    // siebie ośmiu godzin, czyli dokładnie tego, co ta pozycja usuwa.
    const optional: string[] = [];
    const present: string[] = [];
    const seen = new Set<unknown>();
    const walk = (schema: unknown, path: string): void => {
      if (schema === null || typeof schema !== "object") return;
      const inner = (schema as { _zod?: { def?: Record<string, unknown> } })
        ._zod;
      if (inner?.def === undefined || seen.has(schema)) return;
      seen.add(schema);
      const def = inner.def;
      if (def["type"] === "object") {
        const shape = def["shape"] as Record<string, unknown>;
        for (const [key, value] of Object.entries(shape)) {
          if (key === "workingDay") {
            present.push(`${path}.${key}`);
            const kind = (value as { _zod: { def: { type: string } } })._zod.def
              .type;
            if (kind === "optional") optional.push(`${path}.${key}`);
          }
          walk(value, `${path}.${key}`);
        }
        return;
      }
      if (Array.isArray(def["options"])) {
        (def["options"] as unknown[]).forEach((option, index) => {
          walk(option, `${path}|${index}`);
        });
        return;
      }
      for (const [key, suffix] of [
        ["element", "[]"],
        ["innerType", ""],
        ["valueType", "{}"],
      ] as const) {
        if (def[key] !== undefined) {
          walk(def[key], `${path}${suffix}`);
          return;
        }
      }
    };
    walk(QueryProjectionSchema, "projection");
    // Pusty wynik pomiaru to awaria pomiaru: bez tego zdania test przechodzi
    // także wtedy, gdy dzień roboczy zniknął z projekcji w całości.
    assert.ok(
      present.length >= 2,
      `spodziewane ustawienia workspace'u ORAZ tydzień, znaleziono ${present.length}`,
    );
    assert.deepEqual(
      optional,
      [],
      `dzień roboczy podany jako opcjonalny: ${optional.join(", ")}`,
    );
  });

  it("every projected task schedule says who planned it", () => {
    const missing = scheduleShapes()
      .filter((shape) => !shape.keys.includes("plannedBy"))
      .map((shape) => shape.path);
    assert.deepEqual(
      missing,
      [],
      `projekcje niosą startAt bez autorstwa planu: ${missing.join(", ")}`,
    );
  });
});
