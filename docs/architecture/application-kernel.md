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
- `capture.submitText`

Queries:

- `workspace.bootstrapContext`
- `capture.history`
- `audit.receipt`

This subset proves the command/query mechanics before encrypted persistence or a
desktop transport is introduced. It is deliberately small and does not claim a
runnable capture UI, routing, synchronization, or MCP server.

## Boundary rules

- Zod schemas validate untrusted envelopes at runtime and reject unknown fields.
- A trusted adapter constructs the execution context; request payloads cannot
  choose their actor, credential, grant, workspace, or capability scope.
- Authorization resolves the current credential, grant, policy version,
  capability, Workspace membership, owning Space, and record scope before every
  command, query, and idempotent replay. Revoked grants cannot reuse an earlier
  durable outcome.
- Commands carry a caller-scoped idempotency key and semantic fingerprint.
  Identical replay returns the original durable outcome without new audit or
  version churn; different input under the same key conflicts.
- Existing-record mutations require expected versions. Stale writes return an
  explicit conflict and never apply last-write-wins.
- Record changes, domain events, audit receipts, idempotency outcomes, and outbox
  entries share one unit of work. Success is returned only after that unit commits.
- Audit, events, outbox records, validation issues, and diagnostics omit capture
  bodies. The authorized capture projection retains the original text.
- Query freshness comes from the read provider, never from the caller's requested
  consistency. The current local reference reports an authoritative local view;
  a projection reports its checkpoint and missing capabilities, and rejects an
  unavailable authoritative read.

## Package direction

```text
testkit -> application + domain + contracts
application -> domain + contracts
domain -> contracts (identity and actor types only)
contracts -> Zod
```

- `contracts` owns schemas, branded IDs, result taxonomy, and safe validation
  issues.
- `domain` owns framework-independent workspace, Space, membership, capture,
  event, audit, and outbox records.
- `application` owns authorization orchestration, command/query handlers, and
  storage ports.
- `testkit` owns deterministic clocks/IDs, hashing/cursor fixtures, the in-memory
  reference adapter, and failure injection. It is not production persistence.

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
each capture unit-of-work boundary.

The production encrypted store, process-kill durability, Electron preload
surface, MCP mapping, undo/checkpoints, configuration, and cross-workspace leak
matrix remain later capability gates.
