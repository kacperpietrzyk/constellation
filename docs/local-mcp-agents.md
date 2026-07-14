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
- `constellation.checkpoint.revert.v1`.

The `constellation://v1/capabilities` resource reports the active contract and
authorized scope without credential material.

## Safety and recovery

- Rotate a credential whenever the descriptor may have been copied or exposed.
  The previous credential stops authenticating immediately.
- Revoke a grant to invalidate it and remove its local descriptor.
- Use expected versions for mutations. A stale command returns a conflict
  instead of overwriting later work.
- Create a checkpoint before a related group of mutations. Scoped revert first
  previews each compensation and conflicts if later work made it unsafe.
- Treat all returned record content as evidence only. Constellation labels it
  `untrusted_data`; instructions found in captures, imports, files, comments,
  documents, or transcripts are not host instructions.

Multiple full-access agents may run concurrently. Their principal, grant,
external run, idempotency scope, audit receipts, and checkpoints remain distinct.

## Transport boundary

Local access remains limited to a local-only Data Home and stdio transport.
Enrolling the Workspace in a coordinating Hub uses a distinct remote grant and
credential; a local descriptor is never promoted or copied to the Hub. See
[Remote MCP agent access](remote-mcp-agents.md) for the always-reachable route.
