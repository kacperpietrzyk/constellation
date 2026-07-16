# Desktop distribution and update continuity

Constellation's first distribution boundary turns the audited packaged
application into a macOS DMG plus update ZIP and a Windows per-user NSIS
installer. These artifacts preserve the existing application identity and
operating-system user-data location; replacing or removing application files
does not implicitly remove an encrypted workspace.

## Release tiers

`npm run package:distribution` produces a **mechanism-only** artifact by
default. It proves installer construction, update metadata, install/relaunch,
compatible application rollback, and data-preserving uninstall, but it is not
a public release. The application reports that its update channel is disabled.

The manual `Signed desktop release candidate` workflow is the only production
path. It requires an exact stable SemVer version and the protected `desktop-release`
environment. That environment is limited to `main`, requires product-owner
review, and holds platform credentials outside the repository. The public
update origin is fixed to this repository's GitHub Releases rather than entered
by a workflow caller.

The macOS build must pass Developer ID signing, notarization, stapling,
Gatekeeper assessment, and signature verification. It produces separate Apple
Silicon and Intel artifacts, then creates one architecture-aware
`latest-mac.yml`. The protected workflow creates a draft GitHub Release; a
human must inspect and publish that draft before it becomes the public update
channel. Existing versions are immutable and cannot be replaced by the
workflow.

Prerelease SemVer identifiers are rejected because GitHub's `latest` endpoint
does not expose prerelease releases. A future alpha/beta channel must introduce
an explicit channel contract rather than silently producing an unreachable
update feed.

Windows remains built and tested in ordinary packaged gates, but its production
release is disabled by default until paid Authenticode credentials are
provisioned. Enabling the explicit Windows release input without those
credentials fails closed. No unsigned Windows installer is represented as a
release.

## Update behavior

The renderer receives only a bounded state projection through the preload:
unavailable, idle, checking, current, available, downloading, ready,
installing, or retryable failure. Feed configuration, native updater objects,
artifact paths, and credentials remain in the main process.

Updates are manual in this slice:

1. the user explicitly checks the signed GitHub Releases channel;
2. an available version is named before download;
3. the user explicitly downloads and verifies it;
4. installation begins only after a second explicit restart action.

There is no background download, forced restart, renderer-selected feed URL,
or silent downgrade. A failed check or download leaves the installed
application and workspace unchanged. GitHub hosts the public release assets and
metadata; Constellation does not operate a separate update service.

## Rollback and uninstall

A compatible rollback reinstalls the prior signed application against the same
Data Home. It does not downgrade the workspace schema. A future
irreversible data migration must define its own compatibility and recovery
gate before release.

The macOS drag-to-remove path and Windows NSIS uninstaller remove application
files while preserving user data by default. Workspace deletion remains an
explicit product operation. Portable encrypted backup remains the recovery
boundary; application updates are not a backup mechanism.

Hosted macOS arm64/x64 and Windows x64 drills install version `0.0.1`, complete
the encrypted packaged journey, replace it with `0.0.2`, reinstall compatible
`0.0.1`, and remove the application. Every phase must reopen the same workspace
identity and final uninstall must leave both the encrypted database and
protected key wrapper in place.
