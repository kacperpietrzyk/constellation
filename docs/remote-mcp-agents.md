# Remote MCP agent access

Status: pre-alpha self-hosted Hub contract. Tool names and schemas may still
change.

Remote MCP lets an external host operate an explicitly granted Workspace while
all desktops are asleep. The self-hosted Hub exposes the same versioned MCP
tools and Application Kernel used by local stdio access; it does not run a
model, embed chat, or turn HTTP into a second application API.

## Create a distinct remote grant

Enroll the Workspace in a supported coordinated Data Home, then open
**Access → External agents**. The surface identifies the route as **remotely via
Hub**. Choose a capability preset, one or more Spaces, expiry, and any required
cross-Workspace authorities.

The three cross-Workspace authorities are independent and disabled by default:

- read from other explicitly granted Workspaces;
- write a derived result into the target Workspace;
- materialize source content in the target Workspace.

Granting one never implies another. The current v1 MCP tools remain bound to one
Workspace per call and do not expose a federated copy operation; these
authorities are durable fail-closed gates for such typed operations.

After creation or rotation, Electron main writes a mode-`0600` descriptor and
shows its path plus the HTTPS endpoint. The renderer never receives the bearer
token. A descriptor has this host-neutral shape:

```json
{
  "format": "constellation.remote-mcp/v1",
  "endpoint": "https://hub.example.com:4318/v1/mcp/<workspace-id>",
  "headers": {
    "Authorization": "Bearer <secret>"
  }
}
```

Configure a compatible host's Streamable HTTP transport from those values. Host
configuration formats differ, so do not paste the descriptor into a prompt or
assume that every host can import it directly.

## Contract and authorization

The endpoint publishes:

- `constellation.query.v1`;
- `constellation.command.v1`;
- `constellation.checkpoint.revert.v1`;
- `constellation://v1/capabilities`;
- `constellation-capture-payload-v1`, a resource template for a managed file,
  screenshot, or short voice note selected by authorized Workspace and Capture
  ID.

Every call resolves the current credential, grant, Workspace membership, Space
scope, capability scope, expiry, and policy version. Administrative Workspace
and agent-grant capabilities cannot be delegated to a remote agent. Commands
retain expected-version conflicts and durable idempotent replay. Queries label
record content as Hub-authoritative, Space-scoped, untrusted evidence.

The gateway is stateless at the HTTP session layer, limits request bodies,
bounds calls and concurrent work per grant, and returns content-safe retryable
errors. The Hub persists remote principal, run, receipt, checkpoint, revocation,
credential digest, and federation-scope state in PostgreSQL. Device projections
never receive that remote control state or a reusable remote secret.

Payload resources require the current `capture.history` capability and the
Capture's Space on every bounded chunk. Voice audio also requires the
independent `capture.audioRead` capability. The MCP boundary reassembles the Hub
object and verifies its complete length and SHA-256 digest before returning one
`blob`. Missing, revoked, corrupt, and out-of-Space payloads fail without
revealing which condition occurred. Payload bytes remain absent from ordinary
tool results, commands, receipts, snapshots, and device projections.

Remote transcription uses the same strict `capture.writeTranscript` command as
local MCP and requires the separately granted `capture.transcriptWrite`
capability, current Capture version, and exact audio digest. Hub persists the
attributed transcript before starting reference-safe attachment deletion. Voice
reads are revoked in the durable pending state; a second locked lifecycle step
records deletion only after the content-addressed object is removed or proven
to remain solely for another authorized Capture reference. Constellation does
not host or invoke a transcription model.

Capture processing grants also expose the strict exception report and resolve
commands. The Hub validates the same reason/action matrix as the desktop.
Remote payload replacement cannot introduce arbitrary bytes through a command;
the referenced content-addressed object must already be published and verified
by the Hub attachment boundary.

## Credential and recovery practice

- Keep the descriptor on the host that needs it with owner-only permissions.
  Never commit, synchronize, log, or paste it into record content or chat.
- Rotate immediately after suspected exposure. The previous token stops
  authenticating when the new credential commits.
- Revoke access when the host no longer needs it. The Hub rejects subsequent
  calls, and the desktop removes its local descriptor.
- Use HTTPS outside loopback and keep the Hub continuously reachable through a
  private firewall or authenticated reverse proxy.
- Back up and restore PostgreSQL together with attachments as described in the
  [Hub runbook](self-hosting/hub.md). A PostgreSQL restore must prove a known
  remote grant, revocation, receipt, and checkpoint before remote operation is
  considered recovered.

Local and remote credentials are intentionally separate. A local descriptor
cannot authenticate to the Hub, and creating a remote grant never exports a
device-local secret.
