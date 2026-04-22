#!/usr/bin/env bash
set -euo pipefail

# Optional debug trace for wrapper hangs.
if [[ -n "${ASK_QWEN_DEBUG_LOG:-}" ]]; then
  printf 'start pid=%s argv=%s\n' "$$" "$*" >> "$ASK_QWEN_DEBUG_LOG"
fi

# Resolve the repo root first so the command works from nested OpenCode sessions.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROMPT="$*"

# Support OpenCode ARGUMENTS and normal shell arguments.
PROMPT="${ARGUMENTS:-${*:-}}"

if [[ -z "$PROMPT" ]]; then
  echo "Usage: /ask-qwen <prompt>"
  exit 1
fi

# Delegate to the repo-local CLI so behavior stays consistent everywhere.
if [[ -n "${ASK_QWEN_DEBUG_LOG:-}" ]]; then
  printf 'exec root=%s prompt=%s\n' "$ROOT_DIR" "$PROMPT" >> "$ASK_QWEN_DEBUG_LOG"
fi
exec node "$ROOT_DIR/index.js" --turns 1 "$PROMPT"
