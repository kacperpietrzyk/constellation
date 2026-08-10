#!/usr/bin/env bash
set -euo pipefail

# Ten skrypt bywał wołany WYŁĄCZNIE z ubuntu-24.04 i przez to zakładał
# środowisko runnera w dwóch miejscach: `-lcrypto` na domyślnej ścieżce
# linkera i GNU-owy `sha256sum`. Oba padają na czystym macOS-ie, więc pętla
# deweloperska musiała trzymać prywatną kopię tego pliku poza repozytorium.
#
# Dwie rzeczy naprawione i JEDNA zasada: wszystko, czego skrypt potrzebuje,
# jest sprawdzane ZANIM zacznie się `git clone`. Sonda po klonowaniu każe
# czekać minutę na sieć po to, żeby usłyszeć „nie mam sha256sum" — a taka
# kolejność jest też jedynym powodem, dla którego ten skrypt daje się w ogóle
# przetestować bez sieci.

SQLCIPHER_TAG="v4.16.0"
SQLCIPHER_COMMIT="e2a6040f2ae5cfff2b3e08eb3320007d93cdf3fc"
OUTPUT_DIR="${1:?usage: generate-sqlcipher-amalgamation.sh OUTPUT_DIR}"

missing_tool() {
  echo "generate-sqlcipher-amalgamation: missing $1. $2" >&2
  exit 2
}

for tool in git make; do
  command -v "$tool" >/dev/null 2>&1 ||
    missing_tool "$tool" "Install the platform build tools (on macOS: xcode-select --install)."
done

# macOS nie ma `sha256sum`; ma `shasum -a 256`. Oba wypisują sumę jako pierwsze
# pole, więc `cut -d ' ' -f 1` obsługuje jedno i drugie.
if command -v sha256sum >/dev/null 2>&1; then
  sha256_of() { sha256sum "$1" | cut -d ' ' -f 1; }
elif command -v shasum >/dev/null 2>&1; then
  sha256_of() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
else
  missing_tool "a SHA-256 tool (sha256sum or shasum)" \
    "Install coreutils, or run this on a host whose base system ships shasum."
fi

# SQLCipher konfiguruje się przeciw OpenSSL-owi i jego `configure` KOMPILUJE
# I LINKUJE próbkę, więc sama ścieżka biblioteki nie wystarczy — potrzebny jest
# też nagłówek. Kolejność: `pkg-config` (tak wygląda ubuntu-24.04 z libssl-dev,
# czyli oba workflowy), potem Homebrew (tak wygląda czysty macOS), na końcu
# domyślna ścieżka systemowa. Kiedy żadna nie ma nagłówka, skrypt mówi wprost,
# co doinstalować, zamiast oddać błąd linkera z wnętrza `configure`.
CRYPTO_CPPFLAGS=""
CRYPTO_LDFLAGS=""
if command -v pkg-config >/dev/null 2>&1 && pkg-config --exists libcrypto; then
  CRYPTO_CPPFLAGS="$(pkg-config --cflags libcrypto)"
  CRYPTO_LDFLAGS="$(pkg-config --libs libcrypto)"
elif command -v brew >/dev/null 2>&1; then
  for formula in openssl@3 openssl; do
    prefix="$(brew --prefix "$formula" 2>/dev/null || true)"
    if [[ -n "$prefix" && -f "$prefix/include/openssl/evp.h" ]]; then
      CRYPTO_CPPFLAGS="-I$prefix/include"
      CRYPTO_LDFLAGS="-L$prefix/lib -lcrypto"
      break
    fi
  done
fi
if [[ -z "$CRYPTO_LDFLAGS" ]]; then
  if [[ -f /usr/include/openssl/evp.h ]]; then
    CRYPTO_LDFLAGS="-lcrypto"
  else
    missing_tool "the OpenSSL development headers and library" \
      "On macOS: brew install openssl@3 pkg-config. On Debian/Ubuntu: apt-get install libssl-dev pkg-config."
  fi
fi
echo "generate-sqlcipher-amalgamation: linking OpenSSL with ${CRYPTO_LDFLAGS}" >&2

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
# `CPPFLAGS` podawane WYŁĄCZNIE wtedy, gdy jest co podać. Na ubuntu-24.04
# z `libssl-dev` — czyli na jedynej konfiguracji, na której ten skrypt naprawdę
# przeszedł do końca — `pkg-config --cflags libcrypto` bywa puste, a to jest
# skrypt, którego w tym drzewie roboczym uruchomić się nie da. Pusta zmienna
# przekazana do `configure` jest różnicą wobec stanu, który wydał każdą wersję,
# więc jej tam nie ma.
(
  cd "$BUILD_DIR"
  if [[ -n "$CRYPTO_CPPFLAGS" ]]; then
    export CPPFLAGS="$CRYPTO_CPPFLAGS"
  fi
  CFLAGS="-DSQLITE_HAS_CODEC -DSQLCIPHER_CRYPTO_OPENSSL -DSQLITE_EXTRA_INIT=sqlcipher_extra_init -DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown -DSQLITE_ENABLE_FTS5 -DSQLITE_DQS=0 -DSQLITE_OMIT_LOAD_EXTENSION" \
    LDFLAGS="$CRYPTO_LDFLAGS" \
    "$SOURCE_DIR/configure" --with-tempstore=yes --enable-fts5
  make sqlite3.c sqlite3.h
)

cp "$BUILD_DIR/sqlite3.c" "$OUTPUT_DIR/sqlite3.c"
cp "$BUILD_DIR/sqlite3.h" "$OUTPUT_DIR/sqlite3.h"
cp "$SOURCE_DIR/LICENSE.md" "$OUTPUT_DIR/SQLCipher-LICENSE.md"

SQLITE_C_SHA256="$(sha256_of "$OUTPUT_DIR/sqlite3.c")"
SQLITE_H_SHA256="$(sha256_of "$OUTPUT_DIR/sqlite3.h")"
printf '%s\n' \
  "SQLCipher tag: $SQLCIPHER_TAG" \
  "SQLCipher commit: $SQLCIPHER_COMMIT" \
  "sqlite3.c SHA-256: $SQLITE_C_SHA256" \
  "sqlite3.h SHA-256: $SQLITE_H_SHA256" \
  >"$OUTPUT_DIR/ORIGIN.txt"
