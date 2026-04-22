#!/usr/bin/env bash
set -euo pipefail

# Check whether a local Chrome CDP endpoint is reachable.
PORT="${CHROME_REMOTE_DEBUGGING_PORT:-9335}"
URL="${CHROME_CDP_URL:-http://127.0.0.1:$PORT}"

VERSION_URL="${URL%/}/json/version"

if ! command -v curl >/dev/null 2>&1; then
  echo '{"ok": false, "error": "curl is required"}'
  exit 1
fi

curl --max-time 5 --silent --show-error "$VERSION_URL"
