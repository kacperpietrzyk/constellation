# Application kernel

Status: pre-alpha reference implementation. No contract is stable yet.

Constellation keeps product behavior in a storage- and transport-neutral
application kernel. Desktop UI, imports, deterministic rules, and the future MCP
adapter must call this same boundary. Electron, a database, HTTP, and MCP are
adapters; none may reimplement domain behavior.

```text
desktop / import / rule / MCP adapter
                 |
       runtime-validated contract
                 |
      authorization + application kernel
                 |
       unit of work and read-model ports
                 |
     local store or coordinating Data Home
```

## Implemented reference subset

Commands:

- `workspace.createLocal`
- `workspace.rename`
- `workspace.memberAdd`
- `workspace.memberSetAccess`
- `workspace.memberRevoke`
- `capture.submitText`
- `capture.routeAsTask`
- `project.create`
- `project.updateOutcome`
- `task.setStatus`
- `task.complete`
- `task.reopen`
- `record.relate`
- `record.unrelate`
- `command.previewUndo`
- `command.undo`

Queries:

- `workspace.bootstrapContext`
- `workspace.access`
- `workspace.exportScoped`
- `capture.history`
- `task.list`
- `project.list`
- `project.operationalOverview`
- `search.global`
- `cockpit.week`
- `activity.meaningful`
- `recovery.preview`
- `audit.receipt`

This subset proves the command/query mechanics across the in-memory reference
adapter, the Electron transport, and a restart-safe encrypted relational local
store adapter. The packaged production entry point uses that durable store; the
developer preview remains an explicit in-memory adapter. A local workspace
starts with one versioned
default Task status whose display label is data and whose broad operational
semantics are `actionable`. An explicit routing command preserves the original
Capture, advances its processing state, and creates one canonical standalone
Task that points back to its source.

Capture provenance is optional on the core Task model. A routed Task records
its source Capture, while future direct `task.create` commands will not invent
one.

The implementation deliberately does not parse task syntax or start automatic
processing. A future deterministic rule adapter must invoke the same
`capture.routeAsTask` command. The current slice has a runnable desktop flow,
typed Project relations, status/completion, scoped search, explainable cockpit,
meaningful activity, and version-safe undo. It does not yet claim Attention
processing, synchronization, editable workflow configuration, or an MCP server.

## Boundary rules

- Zod schemas validate untrusted envelopes at runtime and reject unknown fields.
- A trusted adapter constructs the execution context; request payloads cannot
  choose their actor, credential, grant, workspace, or capability scope.
- Authorization resolves the current credential, grant, policy version,
  capability, Workspace membership, owning Space, and record scope before every
  command, query, and idempotent replay. Revoked grants cannot reuse an earlier
  durable outcome.
- Workspace role and Space data scope are independent. Owner membership covers
  only the bootstrap root Space implicitly; every additional Space, including
  one used by an owner or administrator, requires an active durable grant that
  also intersects the caller's declared scope.
- Membership and Space-grant changes are versioned, idempotent, audited policy
  mutations. Revocation invalidates older policy contexts, rejects queued Hub
  work, and removes the affected coordinated local projection.
- Commands carry a caller-scoped idempotency key and semantic fingerprint.
  Identical replay returns the original durable outcome without new audit or
  version churn; different input under the same key conflicts.
- Existing-record mutations require expected versions. Stale writes return an
  explicit conflict and never apply last-write-wins.
- Capture routing requires the exact current Capture version. Repeating a
  committed route with the same idempotency input returns its original result;
  a distinct attempt cannot create a second Task.
- Record changes, domain events, audit receipts, idempotency outcomes, and outbox
  entries share one unit of work. Success is returned only after that unit commits.
- Audit, events, outbox records, validation issues, and diagnostics omit capture
  bodies. Authorized Capture History retains the original text and routing
  provenance, while the Task projection exposes only the canonical Task fields.
- Query freshness comes from the read provider, never from the caller's requested
  consistency. The current local reference reports an authoritative local view;
  a projection reports its checkpoint and missing capabilities, and rejects an
  unavailable authoritative read.
- Permission-filtered records, relations, search, counts, meaningful activity,
  exports, and Hub snapshots derive from the same effective Space-access
  evaluator. A coordinating Hub never sends its authoritative raw snapshot to
  a partially scoped human principal.

## Package direction

```text
testkit -> application + domain + contracts
application -> domain + contracts
domain -> contracts (identity and actor types only)
contracts -> Zod
```

- `contracts` owns schemas, branded IDs, result taxonomy, and safe validation
  issues.
- `domain` owns framework-independent workspace, Space, membership, Capture,
  Task, Task status, event, audit, and outbox records.
- `application` owns authorization orchestration, command/query handlers, and
  storage ports.
- `testkit` owns deterministic clocks/IDs, hashing/cursor fixtures, the in-memory
  reference adapter, and failure injection. It is not production persistence.
- `local-store` owns the relational ApplicationStore schema and the fail-closed
  SQLCipher driver gate. Electron main retains native loading and key custody.
- `application` also owns the privileged Data Home provider port. Its versioned
  descriptor, capabilities, status, and closed outcome vocabulary live in
  `contracts`; React receives only safe status and portability operations.

## Verification

Run the complete local gate:

```sh
npm ci --ignore-scripts
npm run check
```

The conformance suite currently verifies strict contract rejection, workspace
bootstrap, durable capture semantics, ten identical replays, conflicting-key
rejection, credential rotation and grant revocation, stale-version rejection,
permission-safe history/audit queries, actual freshness reporting, opaque cursor
pagination, content-safe diagnostics, and rollback after injected failure at
each capture unit-of-work boundary. Capture-to-Task coverage additionally proves
original preservation, standalone Task projection, strict expected versions,
double-route conflict, grant revocation and credential rotation, Workspace/Space
denial without target disclosure, typed opaque pagination, actual freshness,
and rollback after every Capture update, Task, event, audit, idempotency, and
outbox boundary.

Collaboration coverage uses two human principals and two Spaces, including a
private sentinel. It proves that role does not imply scope, hidden content does
not appear through direct search or scoped export counts, view-only access
cannot mutate, policy changes invalidate older contexts, Hub projections omit
out-of-scope data, and membership revocation removes access and coordinated
cache state.

Production signing/notarization, installer/updater continuity, MCP mapping,
deterministic syntax parsing, Attention processing, checkpoint revert, editable
configuration, synchronized Data Homes, and the exhaustive cross-workspace leak
matrix remain later capability gates.

The current adapters and their remaining runtime boundaries are documented in
[Local store](local-store.md) and [Data Homes](data-homes.md).
