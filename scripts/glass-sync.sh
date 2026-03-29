#!/usr/bin/env bash
# glass-sync.sh
#
# Shell wrapper for sync-glass.js — resolves the correct Node.js binary
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
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh" --no-use
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
  echo "$(date): glass-sync: node not found — install Node.js or check PATH" >&2
  exit 1
fi

echo "$(date): glass-sync: starting with Node $("$NODE" --version)"
cd "$PROJECT_DIR"
"$NODE" scripts/sync-glass.js
echo "$(date): glass-sync: done"
