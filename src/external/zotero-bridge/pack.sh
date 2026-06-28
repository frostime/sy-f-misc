#!/usr/bin/env bash
# Pack the Zotero bridge plugin into an xpi file and compute its SHA-256 hash.
# Usage: bash pack.sh [output_dir]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT="${1:-$SCRIPT_DIR}"
XPI_NAME="f-zotero-ext@frostime.github.io.xpi"
XPI_PATH="$OUTPUT/$XPI_NAME"

cd "$SCRIPT_DIR"
zip -r "$XPI_PATH" manifest.json bootstrap.js content/

echo "Packed: $XPI_PATH"
ls -lh "$XPI_PATH"

HASH=$(sha256sum "$XPI_PATH" | cut -d' ' -f1)
echo ""
echo "SHA-256: $HASH"
echo "update_hash: \"sha256:$HASH\""
echo ""
echo "→ Copy this hash into updates.json → update_hash field."
