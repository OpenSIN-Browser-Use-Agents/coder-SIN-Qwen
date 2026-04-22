#!/usr/bin/env bash
set -euo pipefail

# Resolve the repo root first so the command works from nested OpenCode sessions.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROMPT="$*"

# Support both slash-command arguments and stdin piping.
if [[ -z "$PROMPT" ]]; then
  PROMPT="$(cat)"
fi

if [[ -z "$PROMPT" ]]; then
  echo "Usage: /ask-qwen <prompt>"
  exit 1
fi

# Delegate to the repo-local CLI so behavior stays consistent everywhere.
# Force a single conversational turn for normal chat usage.
exec node "$ROOT_DIR/index.js" --turns 1 "$PROMPT"
