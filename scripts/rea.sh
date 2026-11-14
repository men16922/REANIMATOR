#!/bin/sh
# Project-scoped REA runtime. No global Node or shared source-tree changes.
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
node_dir="$project_root/.tools/node-v26.13.1-darwin-arm64/bin"
rea_entry="$project_root/.tools/rea-6.9.0/node_modules/rea-agents/scripts/rea.mjs"
if [ ! -x "$node_dir/node" ] || [ ! -f "$rea_entry" ]; then
  echo 'Project REA runtime is missing; see docs/evidence/TOOLCHAIN.md.' >&2
  exit 1
fi
PATH="$node_dir:$PATH"
export PATH
# Empty inherited JAVA_HOME is invalid to REA; keep this adjustment in the child.
if [ -z "${JAVA_HOME:-}" ]; then unset JAVA_HOME; fi
exec "$node_dir/node" "$rea_entry" "$@"
