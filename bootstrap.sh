#!/bin/sh
# frontend-guard one-line installer.
#   curl -fsSL https://raw.githubusercontent.com/Odissey-Venetikidi/frontend-guard/main/bootstrap.sh | sh
# Clones the repo to a temp dir and runs the global setup (writes to ~/.claude).
set -e

REPO="${FRONTEND_GUARD_REPO:-https://github.com/Odissey-Venetikidi/frontend-guard.git}"
BRANCH="${FRONTEND_GUARD_BRANCH:-main}"

command -v git  >/dev/null 2>&1 || { echo "frontend-guard: git is required" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "frontend-guard: node (>=18) is required" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "frontend-guard: cloning $REPO ..."
git clone --depth 1 --branch "$BRANCH" "$REPO" "$TMP/fg" >/dev/null 2>&1 || git clone --depth 1 "$REPO" "$TMP/fg"
node "$TMP/fg/setup.mjs" "$@"
echo "frontend-guard: done. Restart Claude Code to load the hooks."
