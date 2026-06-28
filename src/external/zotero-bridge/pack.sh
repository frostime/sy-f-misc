#!/usr/bin/env bash
# Pack the Zotero bridge plugin into an xpi file.
# Usage: bash pack.sh [output_dir]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT="${1:-$SCRIPT_DIR/build}"
XPI_NAME="f-zotero-ext@frostime.github.io.xpi"

mkdir -p "$OUTPUT"

cd "$SCRIPT_DIR"
zip -r "$OUTPUT/$XPI_NAME" manifest.json bootstrap.js content/

echo "Packed: $OUTPUT/$XPI_NAME"
ls -lh "$OUTPUT/$XPI_NAME"
