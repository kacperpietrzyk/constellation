#!/usr/bin/env bash
set -euo pipefail

SQLCIPHER_TAG="v4.16.0"
SQLCIPHER_COMMIT="e2a6040f2ae5cfff2b3e08eb3320007d93cdf3fc"
OUTPUT_DIR="${1:?usage: generate-amalgamation.sh OUTPUT_DIR}"
WORK_DIR="$(mktemp -d)"
SOURCE_DIR="$WORK_DIR/sqlcipher"
BUILD_DIR="$WORK_DIR/build"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

git clone --depth 1 --branch "$SQLCIPHER_TAG" \
  https://github.com/sqlcipher/sqlcipher.git "$SOURCE_DIR"

ACTUAL_COMMIT="$(git -C "$SOURCE_DIR" rev-parse HEAD)"
if [[ "$ACTUAL_COMMIT" != "$SQLCIPHER_COMMIT" ]]; then
  echo "SQLCipher commit mismatch: $ACTUAL_COMMIT" >&2
  exit 3
fi

mkdir -p "$BUILD_DIR" "$OUTPUT_DIR"
(
  cd "$BUILD_DIR"
  CFLAGS="-DSQLITE_HAS_CODEC -DSQLCIPHER_CRYPTO_OPENSSL -DSQLITE_EXTRA_INIT=sqlcipher_extra_init -DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown -DSQLITE_ENABLE_FTS5 -DSQLITE_DQS=0 -DSQLITE_OMIT_LOAD_EXTENSION" \
    LDFLAGS="-lcrypto" \
    "$SOURCE_DIR/configure" --with-tempstore=yes --enable-fts5
  make sqlite3.c sqlite3.h
)

cp "$BUILD_DIR/sqlite3.c" "$OUTPUT_DIR/sqlite3.c"
cp "$BUILD_DIR/sqlite3.h" "$OUTPUT_DIR/sqlite3.h"
cp "$SOURCE_DIR/LICENSE.md" "$OUTPUT_DIR/SQLCipher-LICENSE.md"

SQLITE_C_SHA256="$(sha256sum "$OUTPUT_DIR/sqlite3.c" | cut -d ' ' -f 1)"
SQLITE_H_SHA256="$(sha256sum "$OUTPUT_DIR/sqlite3.h" | cut -d ' ' -f 1)"
printf '%s\n' \
  "SQLCipher tag: $SQLCIPHER_TAG" \
  "SQLCipher commit: $SQLCIPHER_COMMIT" \
  "sqlite3.c SHA-256: $SQLITE_C_SHA256" \
  "sqlite3.h SHA-256: $SQLITE_H_SHA256" \
  >"$OUTPUT_DIR/ORIGIN.txt"
