# Self-hosted Constellation Hub

The Hub coordinates one workspace across devices while every desktop keeps an
encrypted local projection and durable command queue. It synchronizes commands,
snapshots, checkpoints, receipts, and content-addressed attachments. It never
synchronizes an open SQLite database file.

Native document collaboration uses the same Hub process at `/v1/realtime`.
PostgreSQL is authoritative for bounded Yjs document state and named revision
checkpoints; live presence is ephemeral. Run one Hub instance for this preview:
cross-instance realtime fan-out is not claimed.

The same process exposes authenticated Streamable HTTP MCP at
`/v1/mcp/<workspace-id>`. Remote agent principals, one-way credential digests,
grants, host runs, receipts, checkpoints, revocations, and independent
federation authorities are Hub control state in PostgreSQL. They are not copied
into device projections.

This is an operator preview. Keep it private behind a firewall or authenticated
reverse proxy and take verified backups before every upgrade.

## Requirements

- PostgreSQL 18;
- a durable filesystem volume for attachments;
- TLS 1.3 certificate and private key;
- Node.js 24 when running without the supplied container;
- two independent backup destinations: one for PostgreSQL and one for the
  attachment volume.

Copy `deploy/hub/compose.yml` into an operator-owned deployment directory.
Create `secrets/postgres_password` with only the database password and
`secrets/database_url` with the complete PostgreSQL URL. Put the TLS certificate
and key at `tls/tls.crt` and `tls/tls.key`. Restrict all four files to the
operator account.

```sh
docker compose build
docker compose run --rm hub migrate
docker compose up -d
curl --fail https://hub.example.com:4318/readyz
```

`/healthz` proves the process is alive. `/readyz` additionally checks the
supported database schema (currently version 2). Neither endpoint returns
workspace content.

The public MCP route accepts only HTTPS outside explicit loopback development.
Keep request logs body-free and authorization-header-free. The management routes
under `/v1/remote-mcp/grants` are for the authenticated desktop main process;
do not expose them as a general operator API or pass a durable device credential
to the renderer.

## Initialize a workspace

The first device publishes its current logical snapshot only after authenticated
enrollment. The Hub accepts this bootstrap once, while its checkpoint and
receipt log are empty. A later attempt cannot replace an active workspace.

On the first desktop, open **Data Home and recovery** and choose **Export Hub
authorization file**. This main-process action writes the current, validated
workspace authorization context through the native save dialog; the renderer
never receives its raw contents or path. Move that file to the Hub operator's
private `admin` directory, then run:

```sh
docker compose run --rm \
  -e CONSTELLATION_HUB_AUTHORIZATION_FILE=/run/admin/authorization.json \
  -v "$PWD/admin:/run/admin:ro" \
  hub init-workspace
```

The command prints one enrollment secret and its 15-minute expiry. Paste it into
Data Home on the existing desktop. The desktop sends the initial snapshot,
stores its device credential with the operating-system credential service, and
verifies the first checkpoint.

The authorization file can mint enrollment credentials for its declared scope.
Restrict it to the operator account, do not place it in source control, and
delete operator copies after all intended devices have been enrolled.

For another device, restore the same encrypted portable workspace backup first.
Run `create-enrollment` with the same authorization file, then enter that new
one-use secret on the second device. Never copy an active database file through
Dropbox, iCloud Drive, OneDrive, or a generic synchronized folder.

## Upgrade and schema migration

1. Check the target release notes and back up both stores.
2. Stop the Hub while leaving PostgreSQL available.
3. Run the new image's `migrate` command. Migrations are transactional and the
   current image supports a fresh database plus schema v1 and v2, upgrading v1
   to the current v2. It refuses v3 or newer before applying migration SQL.
4. Start one Hub instance and require `/readyz` to return HTTP 200.
5. Let one test device synchronize before restoring normal access.

Do not roll the application image back after a schema migration unless that
release explicitly documents backward compatibility. Restore the pre-upgrade
database and attachment backup together instead.

Migration startup is serialized with a PostgreSQL advisory lock. A failed v1
to v2 migration rolls back its schema and data changes; after correcting the
cause, rerunning `migrate` is the supported recovery path. Release checks inject
such a failure, verify the v1 data remains intact, then prove a clean retry.

## Backup and restore

Pause the Hub before the backup boundary so PostgreSQL metadata and attachment
objects describe the same published set. Staging uploads may be discarded and
resumed by clients.

```sh
docker compose stop hub
docker compose exec -T postgres pg_dump -Fc -U constellation constellation > hub.pgdump
docker run --rm -v constellation_attachment-data:/data:ro \
  -v "$PWD:/backup" alpine tar -C /data -czf /backup/hub-attachments.tgz .
sha256sum hub.pgdump hub-attachments.tgz > hub-backup.sha256
docker compose start hub
```

For restore, create empty PostgreSQL and attachment volumes, verify the checksum,
restore the database with `pg_restore`, extract attachments without following
symlinks, run `doctor`, and connect a disposable device. Prove a prior attachment
digest and a post-backup command receipt before declaring the restore usable.

Practice this drill after setup and after every storage-layout migration. A
backup that has not passed restore is not recovery evidence.

The PostgreSQL dump includes native-document state, revisions, and remote MCP
control state. After restore, open a named revision from a disposable scoped
device, add an offline edit, restart the Hub, and verify convergence. Then use a
disposable remote host to prove one known query, an idempotent command replay,
checkpoint visibility, an already revoked token remaining rejected, and a
rotation invalidating the pre-rotation token. Presence is intentionally absent
after restart.

## Revocation and recovery

Set `CONSTELLATION_HUB_WORKSPACE_ID` and `CONSTELLATION_HUB_DEVICE_ID`, then run
`revoke-device`. The next client contact is rejected and requests local
projection purge. The portable encrypted backup remains a separate recovery
path; revocation never silently rewrites it.

Remote agent revocation and rotation are performed from **Access → External
agents** on an enrolled administrator device. They take effect against the
Hub-authoritative credential state immediately; no desktop projection round
trip is required. If the only administrator device is unavailable, restore its
encrypted portable workspace and enroll the recovered device before changing
remote grants. Do not edit credential digests directly in PostgreSQL.

Remote agents with `document.readContent` or `document.replaceContent` operate
on the Hub's authoritative realtime document gateway. Structured writes and
restores require the current state-vector digest, are bounded and idempotent,
reauthorize the grant, Space, access level, schema, document, and every linked
target, and create attributed recovery revisions. The legacy whole-text tools
remain explicitly unsupported remotely because they would flatten rich
content.

If PostgreSQL is unavailable, desktops continue to queue permitted local work.
An already open native document continues in encrypted local state and queues
bounded updates. After PostgreSQL and the Hub return, the desktop mints a fresh
short-lived room session and converges; do not copy its active SQLite file.
If attachment storage is unavailable, record synchronization remains separate;
the failed transfer resumes from its confirmed byte offset. Digest mismatch
quarantines the staging upload instead of publishing corrupt content.

## Operational signals

Monitor process restarts, `/readyz`, PostgreSQL connection saturation, database
and attachment-volume free space, staging-upload age, HTTP 4xx/5xx rates, and
backup age. Treat repeated unknown-effect reconciliation or version conflicts
as product signals, not as successful sync. Logs must contain IDs and diagnostic
codes, never credentials, capture text, document content, or attachment bytes.
Monitor remote MCP 401/403/429 and retryable-error rates separately. A burst of
authentication failures may indicate a stale or exposed descriptor; rotate or
revoke before investigating record content.
