#!/bin/sh
# Project-scoped provider env for REA (Ghidra 12.2 + Temurin 25). Usage: scripts/rea-env.sh <rea args>
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
GHIDRA_INSTALL_DIR="$project_root/.tools/ghidra_12.2_PUBLIC"
JAVA_HOME="$project_root/.tools/jdk-25.0.5+8/Contents/Home"
PATH="$JAVA_HOME/bin:$PATH"
export GHIDRA_INSTALL_DIR JAVA_HOME PATH
exec "$project_root/scripts/rea.sh" "$@"
