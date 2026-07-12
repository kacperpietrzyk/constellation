# SQLCipher native compatibility probe

This contributor tool answers one bounded question: can Constellation compile
the pinned SQLCipher Community source into `better-sqlite3` for the Electron
ABI and execute the same encrypted-store smoke test on native macOS x64 and
Windows x64 runners?

The probe is intentionally synthetic. It contains no customer data, workspace
content, production keys, private specifications, or application persistence
code. Generated databases and keys exist only in a runner's temporary
directory and are removed before the process exits.

## Evidence produced

The probe fails unless all of these checks pass:

- the process is native x64 and uses Electron 43.1.0;
- SQLCipher reports version 4.16.0 Community and a platform crypto provider;
- compile options include codec support, FTS5, and disabled loadable
  extensions;
- encrypted WAL mode and an FTS5 query work together, and the live WAL does not
  expose the synthetic plaintext marker;
- cipher, ordinary database, and foreign-key integrity checks pass;
- database and encrypted export files hide the SQLite header and a known
  synthetic plaintext marker;
- the probe-only binding converts exactly 32 high-entropy bytes inside native
  memory to SQLCipher's documented raw-key blob-literal format, then wipes the
  temporary encoding;
- a wrong raw key is rejected;
- a parameterized attach plus named-database raw-key call and
  `sqlcipher_export()` round trip preserve the test row without putting key
  material in SQL text.

This is compatibility evidence, not a production persistence package. In
particular it does not prove key custody, packaged application behavior,
code-signing, DPAPI or Keychain behavior, crash recovery, disk-full handling,
or a supported archive format. The binding patch is probe-only and must not be
treated as a supported public API.

## Pinned inputs and licenses

| Input               | Pin                                                                                  | License      |
| ------------------- | ------------------------------------------------------------------------------------ | ------------ |
| SQLCipher Community | `v4.16.0` / `e2a6040f2ae5cfff2b3e08eb3320007d93cdf3fc`                               | BSD-3-Clause |
| OpenSSL for Windows | `3.5.7` / SHA-256 `a8c0d28a529ca480f9f36cf5792e2cd21984552a3c8e4aa11a24aa31aeac98e8` | Apache-2.0   |
| better-sqlite3      | `12.11.1`                                                                            | MIT          |
| Electron            | `43.1.0`                                                                             | MIT          |
| node-gyp            | `13.0.1`                                                                             | MIT          |

The generated SQLCipher amalgamation artifact includes the upstream license
from the pinned source tree. The Windows job builds OpenSSL from the official
release tarball only after checking its published SHA-256 digest; no OpenSSL
binary is uploaded or retained. Dependency lockfiles preserve the npm package
sources and integrity digests used by the probe.

## Running

The GitHub Actions workflow performs the supported build. Local execution
requires the same native compiler and crypto-provider prerequisites as the
corresponding runner, plus a generated SQLCipher amalgamation directory.

The workflow deliberately runs only for same-repository pull requests or a
manual dispatch. It has read-only repository permissions, receives no secrets,
and does not publish compiled binaries or database files.
