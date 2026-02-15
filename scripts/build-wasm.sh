#!/bin/bash
# Build WASM module for pokercraft-local web app

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WASM_CRATE="$PROJECT_ROOT/crates/wasm"
WEB_WASM_DIR="$PROJECT_ROOT/web/src/wasm"

echo "=== Building WASM module ==="
echo "Project root: $PROJECT_ROOT"
echo "WASM crate: $WASM_CRATE"
echo "Output dir: $WEB_WASM_DIR"
echo

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "Error: wasm-pack is not installed"
    echo "Install with: cargo install wasm-pack"
    exit 1
fi

# Build WASM
cd "$WASM_CRATE"
echo "Running wasm-pack build..."
wasm-pack build --target web --out-dir "$WEB_WASM_DIR"

# Clean up unnecessary files
echo "Cleaning up..."
rm -f "$WEB_WASM_DIR/.gitignore"
rm -f "$WEB_WASM_DIR/package.json"

echo
echo "=== WASM build complete ==="
echo "Output files:"
ls -la "$WEB_WASM_DIR"
