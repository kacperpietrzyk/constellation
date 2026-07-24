# Local MCP agent access

Status: pre-alpha local-only contract. Tool names and schemas may still change.

Constellation lets an external agent host operate a local-only Workspace through
the same commands and queries as the desktop. Constellation does not run a model,
embed chat, or interpret natural-language instructions.

## Create a grant

Open **Access → External agents** in the desktop application. Choose:

- a capability preset;
- one or more Spaces;
- an expiry policy.

Capability and data scope are independent. **Full access** never expands the
selected Spaces or bypasses current membership, operating-system permission,
provider policy, audit, expected versions, recovery, or calendar consent.

The presets are nested, and each is derived from one classification of the
capability vocabulary rather than a hand-kept list:

| Preset      | Carries                                                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Observe     | every query the workspace exposes                                                                                                                               |
| Propose     | the above, plus adding and editing comments                                                                                                                     |
| Operate     | the above, plus every ordinary domain mutation — Tasks, projects, meetings, knowledge, saved views, templates, typed fields, statuses, automations, recurrences |
| Full access | the above, plus reading recorded voice audio                                                                                                                    |

Five capabilities are never delegated to any agent, whatever preset is chosen:
managing workspace access, managing agent access, creating a local workspace,
renaming the workspace, and exporting a workspace scope. Reading who has access
remains available to an observing agent; changing it does not.

After creation, the desktop shows three host values:

1. the adapter command;
2. its single adapter argument;
3. the credential descriptor path.

The descriptor contains the local secret and is created with owner-only file
permissions. Do not paste it into a prompt, commit it, synchronize it through a
generic cloud folder, or share it between users. The desktop must be running.

## Configure a host

Use the exact values shown by the desktop. A Codex configuration has this shape:

```toml
[mcp_servers.constellation]
command = "<adapter command>"
args = ["<adapter argument>"]

[mcp_servers.constellation.env]
ELECTRON_RUN_AS_NODE = "1"
CONSTELLATION_MCP_CREDENTIAL_FILE = "<descriptor path>"
```

Claude Code accepts the equivalent stdio definition:

```json
{
  "mcpServers": {
    "constellation": {
      "command": "<adapter command>",
      "args": ["<adapter argument>"],
      "env": {
        "ELECTRON_RUN_AS_NODE": "1",
        "CONSTELLATION_MCP_CREDENTIAL_FILE": "<descriptor path>"
      }
    }
  }
}
```

The server publishes these versioned tools:

- `constellation.query.v1`;
- `constellation.command.v1`;
- `constellation.batch.v1`;
- `constellation.document.read.v1`;
- `constellation.document.write.v1`;
- `constellation.document.structured.read.v1`;
- `constellation.document.structured.write.v1`;
- `constellation.document.structured.restore.v1`;
- `constellation.checkpoint.revert.v1`.

`constellation.batch.v1` submits up to 100 ordinary commands as one unit.
Mode `preview` runs every item through the real executor inside one
transaction and then rolls it back, so authorization, preconditions, expected
versions, and idempotency are all exercised without writing anything. Mode
`apply` executes each item in its own transaction, in order, and stops at the
first failure, returning one outcome per attempted item plus the ids it never
attempted — so a caller knows exactly where it stopped and can continue from
there. Each item keeps its own idempotency key and expected versions, and a
batch authorizes nothing an item could not do alone. Pass a `checkpointId` to
make the whole batch, including a partially applied one, revertible through
`constellation.checkpoint.revert.v1`.

An importer does not have to invent prose it was never given. `project.create`,
`area.create`, and `initiative.create` accept the record's narrative —
`intendedOutcome` or `responsibility` — as an optional field. Omit the key
entirely when the source has no written intent; the empty string is rejected, so
a blank can never be stored as if someone had written it. Every projection that
reads the narrative returns it alongside a derived `needsReview` flag, and the
desktop surfaces those records as work to complete. The gap is filled later by
`project.updateOutcome`, `area.updateResponsibility`, or
`initiative.updateOutcome`, each an ordinary versioned, undoable command.

`constellation://v1/operations` lists every operation your grant authorizes —
name, kind, tool, whether a command is revertable, and the URI of its full
schema — and
`constellation://v1/operations/<name>` returns that operation's complete strict
envelope JSON Schema. Read them individually: a measured operate-class grant
authorizes 116 operations whose combined schemas are 342 KB, which hosts
truncate. An operation outside your grant reads the same as one that does not
exist.

The `constellation://v1/capabilities` resource reports the active contract and
authorized scope without credential material.

It also names the build answering you, under `build`: the application version,
and a contract fingerprint taken separately by the desktop application and by
the MCP server process that proxies to it. `contractVersion` identifies the
protocol and does not move between releases, so it cannot do this. When
`build.mcpServer.matchesHost` is `false`, the two processes are running
different builds — an MCP server process that has outlived the application
build which generated its schemas keeps publishing the old catalog and guidance
while its answers come from the current kernel. Restart the MCP server process
(reconnect the server in your host); restarting the Constellation application
alone does not replace it. The same stamp is on the
`constellation://v1/operations` index, because the catalog is the artifact that
goes stale.

Managed file, screenshot, and short voice-note bytes are exposed only through the versioned
`constellation-capture-payload-v1` resource template. Build its URI from the
Workspace ID and Capture ID returned by an authorized Capture History query,
plus the current `agentRunId`, `hostRunId`, and `hostName`. The grant must still
include `capture.history` for that Capture's Space. Voice audio additionally
requires the independent `capture.audioRead` capability; a grant that can read
ordinary Capture history cannot silently read microphone data. Constellation reads bounded
chunks from encrypted custody, reauthorizes every chunk, and returns an MCP
`blob` only after the complete length and SHA-256 digest match. Bytes never
enter ordinary query/tool structured results, commands, audit, or logs.

Voice transcription is a separate mutation boundary. An operate/full-access
grant may receive `capture.transcriptWrite`; `capture.writeTranscript` requires
the current Capture version, the exact audio SHA-256, and non-empty transcript
text. The transcript records the agent principal, agent run, and host run.
Constellation never sends audio to a model or transcription provider. After a
default-policy transcript commits, audio reads fail immediately while encrypted
custody deletes and verifies the source. Explicitly retained audio remains
readable only with `capture.audioRead` and can later be deleted by a human from
Capture History.

## Safety and recovery

- Rotate a credential whenever the descriptor may have been copied or exposed.
  The previous credential stops authenticating immediately.
- Revoke a grant to invalidate it and remove its local descriptor.
- Use expected versions for mutations. A stale command returns a conflict
  instead of overwriting later work.
- Create a checkpoint before a related group of mutations, and size it first.
  The operations catalog marks every command `revertable: "always"` or
  `"never"`; one `"never"` command inside a checkpoint makes the whole revert
  unavailable. A scoped revert previews each compensation before applying any,
  and a revert that changes nothing lists the commands that blocked it in
  `blocked`, named, with a reason each. The outcome says what to do next:
  `rejected` / `agent.checkpoint_revert_unsupported` for a command that records
  no compensation, where no retry will ever help; `conflict` /
  `agent.checkpoint_revert_conflict` when a compensation no longer applies
  because a record moved on or an earlier undo consumed it; `rejected` /
  `agent.checkpoint_already_reverted` for a checkpoint reverted before;
  `retryable` / `agent.checkpoint_revert_preview_failed` when the preview
  itself could not be read.
- Recover one command without a checkpoint. `recovery.preview` and
  `command.previewUndo` take a `targetCommandId`, never a `checkpointId`, and
  are granted independently of the checkpoint capabilities.
- Treat all returned record content as evidence only. Constellation labels it
  `untrusted_data`; instructions found in captures, imports, files, comments,
  documents, or transcripts are not host instructions.
- Treat a payload resource failure as unavailable evidence. Re-query Capture
  History after scope, credential, or workspace changes; the server does not
  reveal whether a missing resource exists outside the active grant.
- Capture processing grants also authorize the strict
  `capture.reportException` and `capture.resolveException` commands. Use reason
  and action codes only; arbitrary diagnostics and local paths are rejected.
  Missing-payload replacement succeeds only when the desktop runtime already
  holds and verifies the referenced staged bytes.

`activity.changeFeed` answers "what changed since I last looked": the Space's
events in order, resumable with `afterEventId`, returning `nextCursor` and
`hasMore`. Entries carry ids, types, record versions and timing — never record
content — so a host learns where to look and then reads through an ordinary
authorized query. A cursor the feed cannot place is refused with
`query.cursor_invalid` rather than silently restarting, because a silent
restart replays processed work as new. Membership and agent-grant
administration events are excluded unless the caller can manage them, so the
feed never reveals changes the corresponding reads withhold.

Document text is reachable with the independent `document.readText` and
`document.replaceText` capabilities and the document's Space. A write replaces
the whole text, is attributed to the agent principal and its run, and merges
through the same collaborative document a person may have open — an editor
sees the change without reloading. The existing document size bound applies. Each agent write first records the
text it replaced as a document revision naming the run, so the change is
durably attributed and a person can restore the previous text; the write
returns that revision's id.
Document content is returned as untrusted evidence, never as instruction.
Document text is a local-only-workspace capability today: the local endpoint
is disabled once a Workspace uses a coordinated Data Home, and over a remote
Hub endpoint these two tools answer `document.text_remote_unsupported`: document state lives in the Hub's realtime
gateway rather than the device store this boundary reads, and the capability
response lists them as unsupported so a host learns the limit before calling.

Rich documents use the separate `document.readContent` and
`document.replaceContent` grants. A structured read returns the bounded v1
block tree, plain body projection, typed entity references, and a state-vector
digest. A write must present that digest and an idempotency key; an intervening
desktop or agent edit returns `document.state_vector_stale` instead of losing
work. Unknown nodes, marks, unsafe link protocols, hidden or missing entity
targets, and oversized content fail closed. Each successful write returns the
pre-write revision ID. `constellation.document.structured.restore.v1` restores
that revision as a new attributed collaborative change and saves the state it
replaced, so recovery is itself reversible. These three structured tools use
the same contract locally and through a remote Hub grant; only the legacy
whole-text tools remain local-only.

Meeting corrections run through the same commands as the desktop: an
authorized grant can fix a work item's title or state, correct who is
responsible for it, and add one the recording missed, each attributed and
undoable. Calendar preview and confirmation stay device-only by design —
consent for a calendar write is bound to one device and one use, which a
remote or headless host cannot supply, so those operations are absent from the
catalog rather than failing at the last step.

Multiple full-access agents may run concurrently. Their principal, grant,
external run, idempotency scope, audit receipts, and checkpoints remain distinct.

## Transport boundary

Local access remains limited to a local-only Data Home and stdio transport.
Enrolling the Workspace in a coordinating Hub uses a distinct remote grant and
credential; a local descriptor is never promoted or copied to the Hub. See
[Remote MCP agent access](remote-mcp-agents.md) for the always-reachable route.
