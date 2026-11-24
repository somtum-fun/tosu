#!/usr/bin/env bash
# Rebuilds somtum-pp's WebAssembly and copies its JS package into packages/somtum-pp.
# usage: scripts/sync-somtum-pp.sh ../somtum-pp
set -euo pipefail
src=$(realpath "${1:?path to a somtum-pp checkout}")
dst=$(dirname "$(realpath "$0")")/../packages/somtum-pp
"$src/scripts/build-wasm.sh"
cp "$src"/js/{index.mjs,index.d.ts,wasm.mjs,package.json,wasm.sha256} "$dst/"
sed -i "s/at \`[0-9a-f]*\`/at \`$(git -C "$src" rev-parse --short HEAD)\`/" "$dst/README.md"
echo "synced somtum-pp $(git -C "$src" rev-parse --short HEAD)"
