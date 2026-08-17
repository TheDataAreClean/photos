#!/usr/bin/env bash
# local-sync.sh
#
# Shell wrapper for publish-local.js — resolves the correct Node.js binary
# regardless of whether it was installed via nvm, Homebrew (Intel or Apple
# Silicon), or a system package. Needed because launchd agents run with a
# minimal PATH that won't include nvm shims or Homebrew paths.
#
# Called by the launchd agent — do not rename or move this file.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Find Node ──────────────────────────────────────────
find_node() {
  # 1. nvm (sources .nvm/nvm.sh if present)
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    # nvm.sh can return non-zero as normal internal control flow; under
    # `set -e` that would silently abort this whole script before we ever
    # reach the Homebrew/PATH fallbacks below. Disable -e only around the
    # source call, then restore it immediately after.
    set +e
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh" --no-use
    set -e
    if command -v nvm &>/dev/null; then
      nvm use default --silent 2>/dev/null || true
    fi
    if command -v node &>/dev/null; then echo "$(command -v node)"; return; fi
  fi

  # 2. Homebrew Apple Silicon
  if [ -x "/opt/homebrew/bin/node" ]; then echo "/opt/homebrew/bin/node"; return; fi

  # 3. Homebrew Intel
  if [ -x "/usr/local/bin/node" ]; then echo "/usr/local/bin/node"; return; fi

  # 4. System PATH
  if command -v node &>/dev/null; then echo "$(command -v node)"; return; fi

  echo "" # not found
}

NODE="$(find_node)"

if [ -z "$NODE" ]; then
  echo "$(date): local-sync: node not found — install Node.js or check PATH" >&2
  exit 1
fi

echo "$(date): local-sync: starting with Node $("$NODE" --version)"
cd "$PROJECT_DIR"
"$NODE" scripts/publish-local.js
echo "$(date): local-sync: done"
