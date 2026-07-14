BEGIN;

CREATE TABLE IF NOT EXISTS constellation_hub_meta (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO constellation_hub_meta (singleton, schema_version)
VALUES (true, 1)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS constellation_hub_workspaces (
  workspace_id uuid PRIMARY KEY,
  checkpoint bigint NOT NULL DEFAULT 0 CHECK (checkpoint >= 0),
  snapshot jsonb NOT NULL,
  snapshot_digest char(64) NOT NULL CHECK (snapshot_digest ~ '^[0-9a-f]{64}$'),
  remote_agent_state jsonb NOT NULL DEFAULT '{"grants":[],"memberships":[],"spaceGrants":[],"runs":[],"checkpoints":[],"handoffs":[],"federationScopes":{}}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE constellation_hub_workspaces
  ADD COLUMN IF NOT EXISTS remote_agent_state jsonb NOT NULL
  DEFAULT '{"grants":[],"memberships":[],"spaceGrants":[],"runs":[],"checkpoints":[],"handoffs":[],"federationScopes":{}}'::jsonb;

UPDATE constellation_hub_meta
SET schema_version = 2, updated_at = now()
WHERE singleton = true AND schema_version < 2;

CREATE TABLE IF NOT EXISTS constellation_hub_enrollments (
  enrollment_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES constellation_hub_workspaces(workspace_id) ON DELETE CASCADE,
  auth_context jsonb NOT NULL,
  secret_digest char(64) NOT NULL UNIQUE CHECK (secret_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE IF NOT EXISTS constellation_hub_devices (
  workspace_id uuid NOT NULL REFERENCES constellation_hub_workspaces(workspace_id) ON DELETE CASCADE,
  device_id text NOT NULL,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  auth_context jsonb NOT NULL,
  credential_digest char(64) NOT NULL UNIQUE CHECK (credential_digest ~ '^[0-9a-f]{64}$'),
  checkpoint bigint NOT NULL DEFAULT 0 CHECK (checkpoint >= 0),
  revoked_at timestamptz,
  purge_requested boolean NOT NULL DEFAULT false,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, device_id)
);

CREATE TABLE IF NOT EXISTS constellation_hub_command_receipts (
  workspace_id uuid NOT NULL REFERENCES constellation_hub_workspaces(workspace_id) ON DELETE CASCADE,
  command_id uuid NOT NULL,
  outcome jsonb NOT NULL,
  checkpoint bigint CHECK (checkpoint > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, command_id)
);

CREATE INDEX IF NOT EXISTS constellation_hub_receipts_checkpoint
  ON constellation_hub_command_receipts (workspace_id, checkpoint)
  WHERE checkpoint IS NOT NULL;

CREATE TABLE IF NOT EXISTS constellation_hub_documents (
  workspace_id uuid NOT NULL REFERENCES constellation_hub_workspaces(workspace_id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  space_id uuid NOT NULL,
  engine text NOT NULL CHECK (engine = 'yjs-13'),
  state bytea NOT NULL CHECK (octet_length(state) BETWEEN 1 AND 1048576),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, document_id)
);

CREATE TABLE IF NOT EXISTS constellation_hub_document_revisions (
  revision_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES constellation_hub_workspaces(workspace_id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  space_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  engine text NOT NULL CHECK (engine = 'yjs-13'),
  state bytea NOT NULL CHECK (octet_length(state) BETWEEN 1 AND 1048576),
  state_vector bytea NOT NULL CHECK (octet_length(state_vector) BETWEEN 1 AND 1048576),
  created_by uuid NOT NULL,
  created_by_device_id text NOT NULL,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  restored_from_revision_id uuid
);

CREATE INDEX IF NOT EXISTS constellation_hub_document_revisions_history
  ON constellation_hub_document_revisions (workspace_id, document_id, created_at DESC, revision_id DESC);

CREATE TABLE IF NOT EXISTS constellation_hub_attachment_uploads (
  upload_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES constellation_hub_workspaces(workspace_id) ON DELETE CASCADE,
  device_id text NOT NULL,
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_length bigint NOT NULL CHECK (byte_length BETWEEN 1 AND 1073741824),
  received_bytes bigint NOT NULL DEFAULT 0 CHECK (received_bytes >= 0),
  state text NOT NULL CHECK (state IN ('staging', 'published', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS constellation_hub_attachment_upload_identity
  ON constellation_hub_attachment_uploads (workspace_id, content_sha256)
  WHERE state IN ('staging', 'published');

CREATE TABLE IF NOT EXISTS constellation_hub_attachments (
  workspace_id uuid NOT NULL REFERENCES constellation_hub_workspaces(workspace_id) ON DELETE CASCADE,
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_length bigint NOT NULL CHECK (byte_length BETWEEN 1 AND 1073741824),
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, content_sha256)
);

COMMIT;
