# Packaged Electron safeStorage probe

This contributor tool answers one bounded question: can the same packaged
Electron 43.1.0 x64 artifact protect and recover a synthetic workspace key
across a complete process relaunch on native macOS and Windows runners?

Electron documents the asynchronous provider as Keychain-backed on macOS and
DPAPI-backed on Windows. The probe requires the real packaged operation to pass;
the availability flag alone is not accepted as evidence.

## Evidence produced

The probe fails unless all of these checks pass:

- the direct executable is a packaged Electron 43.1.0 x64 application with the
  fixed product name, bundle identifier, and early persistent profile;
- asynchronous safeStorage encrypts a random 32-byte synthetic value in one
  process and decrypts it in a distinct process launched from the same package;
- the plaintext wrapper metadata declares format, workspace identity, and key
  version, while the encrypted payload independently binds its own format, the
  same context, and the exact synthetic key; only that metadata, ciphertext, and
  a one-way verifier reach disk;
- wrapper publication uses an exclusive temporary file, file flush, atomic
  no-clobber hard-link publication, restrictive requested mode, and a directory
  flush on macOS;
- missing, empty, truncated, random, bit-flipped, cross-workspace, and forged
  outer-context wrappers fail closed without modifying the original;
- stdout, stderr, the package source archive, profile, wrapper, temp, and crash
  directories do not contain the exact synthetic bytes or their encoded payload;
- macOS uses an ad-hoc-signed package whose signature verifies, and Windows runs
  the unsigned package under the hosted runner user;
- the synthetic key reaches the child through Node's dedicated inherited IPC
  channel, never through argv, environment, stdin, a regular file, an
  application-created named network endpoint, or logs;
- a write launch without that channel fails before safeStorage access and does
  not create a wrapper;
- the hosted macOS job uses a fresh disposable user Keychain, then restores the
  runner's prior default and search list before deleting that Keychain;
- every package, profile, wrapper, and test value is removed without upload; the
  exact probe-only macOS Keychain service/account item is deleted and its
  absence verified when it was present (`Constellation Key Custody Probe Safe
Storage` / `Constellation Key Custody Probe Key`).

The child processes have a 45-second watchdog so an interactive Keychain prompt
or provider hang becomes a failure instead of blocking CI.

## Scope limits

This is packaged relaunch continuity, not production release-identity evidence.
It does not prove Developer ID/notarized or Authenticode-signed update continuity,
an installer, reboot or OS-account migration, actual rotation, temporary provider
unavailability, same-user malware resistance, reliable JavaScript heap
zeroization, SQLCipher integration, renderer/IPC isolation, or portable recovery.
Windows DPAPI is user-scoped and does not isolate one same-user application from
another.

A later protected release gate must wrap with signed build N and unwrap with an
independently built N+1 under the same real signing identity. Rotation and
temporary-unavailability behavior also require adapter-level fault injection.

## Execution boundary

The supported evidence path is the hosted workflow. Its macOS isolation scripts
refuse to alter Keychain configuration outside GitHub Actions. A direct local
probe briefly creates the exact synthetic item in the current user's default
Keychain; the probe removes it in `finally`, and `npm run cleanup` is the
interruption-recovery path. Rebuilding an ad-hoc-signed package changes its code
identity, so stale items from an interrupted older build can otherwise trigger
an interactive authorization prompt.

## Pinned inputs

| Input                | Pin                                                                         | Purpose                                | License      |
| -------------------- | --------------------------------------------------------------------------- | -------------------------------------- | ------------ |
| Electron macOS x64   | 43.1.0 / `c84cd358a6c58ee9d6ce26ced694ab3b750109e9f29145ff5a639db64037f1de` | Packaged async Keychain runtime        | MIT          |
| Electron Windows x64 | 43.1.0 / `a07dc1e3d5e589593d37e3b19d1b373e02bb58270e2eb0d6633eee0198ad09f0` | Packaged async DPAPI runtime           | MIT          |
| `@electron/packager` | 20.0.2                                                                      | Produce native x64 application folders | BSD-2-Clause |

The workflow installs dependencies without lifecycle scripts, verifies the
Electron release archive against the committed platform digest before allowing
Packager to consume it, has read-only repository permissions, references no
project secrets, and publishes no artifacts. Pull requests from forks run only
under GitHub's normal approval and restricted-token controls.

See Electron's versioned
[`safeStorage` documentation](https://github.com/electron/electron/blob/v43.1.0/docs/api/safe-storage.md)
and its
[relaunch conformance test](https://github.com/electron/electron/blob/v43.1.0/spec/api-safe-storage-spec.ts).
