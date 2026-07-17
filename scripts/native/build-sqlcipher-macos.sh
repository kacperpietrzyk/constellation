#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This build requires macOS." >&2
  exit 2
fi
HOST_ARCH="$(uname -m)"
if [[ "$HOST_ARCH" != "x86_64" && "$HOST_ARCH" != "arm64" ]]; then
  echo "This build requires an x64 or arm64 macOS host." >&2
  exit 2
fi

if [[ $# -gt 2 ]]; then
  echo "usage: build-sqlcipher-macos.sh AMALGAMATION_DIR [TARGET_ROOT]" >&2
  exit 2
fi

AMALGAMATION_DIR="${1:?usage: build-sqlcipher-macos.sh AMALGAMATION_DIR [TARGET_ROOT]}"
SCRIPT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ROOT="$SCRIPT_ROOT"
if [[ $# -ge 2 ]]; then
  ROOT="$(cd "$2" && pwd)"
fi
ELECTRON_VERSION="43.1.0"
TARGET_ARCH="${CONSTELLATION_ALPHA_ARCH:-$HOST_ARCH}"
if [[ "$TARGET_ARCH" == "x64" ]]; then
  TARGET_ARCH="x86_64"
fi
if [[ "$TARGET_ARCH" != "x86_64" && "$TARGET_ARCH" != "arm64" ]]; then
  echo "Unsupported macOS target architecture: $TARGET_ARCH" >&2
  exit 2
fi
if [[ "$TARGET_ARCH" != "$HOST_ARCH" ]]; then
  echo "Cross-architecture macOS builds are not supported; use a native runner." >&2
  exit 2
fi
NODE_GYP_ARCH="${TARGET_ARCH/x86_64/x64}"
ARCH_FLAGS="-arch $TARGET_ARCH"

test -f "$AMALGAMATION_DIR/sqlite3.c"
test -f "$AMALGAMATION_DIR/sqlite3.h"
test -f "$AMALGAMATION_DIR/SQLCipher-LICENSE.md"

node "$SCRIPT_ROOT/scripts/native/patch-better-sqlite3.mjs" "$ROOT"

(
  cd "$ROOT/node_modules/better-sqlite3"
  rm -rf build
  MACOSX_DEPLOYMENT_TARGET="12.0" \
    CFLAGS="$ARCH_FLAGS -DSQLITE_HAS_CODEC -DSQLCIPHER_CRYPTO_CC -DSQLITE_THREADSAFE=1 -DSQLITE_TEMP_STORE=2 -DSQLITE_EXTRA_INIT=sqlcipher_extra_init -DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown -DSQLITE_ENABLE_FTS5 -DSQLITE_DQS=0 -DSQLITE_OMIT_LOAD_EXTENSION" \
    CXXFLAGS="$ARCH_FLAGS -DSQLITE_HAS_CODEC -DSQLCIPHER_CRYPTO_CC" \
    LDFLAGS="$ARCH_FLAGS -framework Security -framework CoreFoundation" \
    "$ROOT/node_modules/.bin/node-gyp" rebuild \
      --release \
      --target="$ELECTRON_VERSION" \
      --arch="$NODE_GYP_ARCH" \
      --dist-url=https://electronjs.org/headers \
      --sqlite3="$AMALGAMATION_DIR"
)

test -f "$ROOT/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
file "$ROOT/node_modules/better-sqlite3/build/Release/better_sqlite3.node" | grep -q "$TARGET_ARCH"
cp "$AMALGAMATION_DIR/SQLCipher-LICENSE.md" "$ROOT/node_modules/better-sqlite3/SQLCipher-LICENSE.md"
