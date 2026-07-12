#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "x86_64" ]]; then
  echo "This probe requires a native macOS x64 runner." >&2
  exit 2
fi

AMALGAMATION_DIR="${1:?usage: build-macos.sh AMALGAMATION_DIR}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_VERSION="43.1.0"

test -f "$AMALGAMATION_DIR/sqlite3.c"
test -f "$AMALGAMATION_DIR/sqlite3.h"

node "$ROOT/scripts/patch-binding.mjs"

(
  cd "$ROOT/node_modules/better-sqlite3"
  rm -rf build
  MACOSX_DEPLOYMENT_TARGET="12.0" \
    CFLAGS="-DSQLITE_HAS_CODEC -DSQLCIPHER_CRYPTO_CC -DSQLITE_THREADSAFE=1 -DSQLITE_TEMP_STORE=2 -DSQLITE_EXTRA_INIT=sqlcipher_extra_init -DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown -DSQLITE_ENABLE_FTS5 -DSQLITE_DQS=0 -DSQLITE_OMIT_LOAD_EXTENSION" \
    CXXFLAGS="-DSQLITE_HAS_CODEC -DSQLCIPHER_CRYPTO_CC" \
    LDFLAGS="-framework Security -framework CoreFoundation" \
    "$ROOT/node_modules/.bin/node-gyp" rebuild \
      --release \
      --target="$ELECTRON_VERSION" \
      --arch=x64 \
      --dist-url=https://electronjs.org/headers \
      --sqlite3="$AMALGAMATION_DIR"
)

test -f "$ROOT/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
