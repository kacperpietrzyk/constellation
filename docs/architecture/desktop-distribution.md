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
path. It requires an exact version, a public HTTPS update origin, protected
platform signing credentials, and the `desktop-release` environment. The build
fails if signing credentials are absent. macOS must pass Developer ID signing,
notarization, stapling, Gatekeeper assessment, and signature verification;
Windows must pass Authenticode verification. Only then does the embedded
release configuration enable update checks.

## Update behavior

The renderer receives only a bounded state projection through the preload:
unavailable, idle, checking, current, available, downloading, ready,
installing, or retryable failure. Feed configuration, native updater objects,
artifact paths, and credentials remain in the main process.

Updates are manual in this slice:

1. the user explicitly checks the configured signed channel;
2. an available version is named before download;
3. the user explicitly downloads and verifies it;
4. installation begins only after a second explicit restart action.

There is no background download, forced restart, renderer-selected feed URL,
or silent downgrade. A failed check or download leaves the installed
application and workspace unchanged.

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
