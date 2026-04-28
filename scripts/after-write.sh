#!/usr/bin/env bash
set -euo pipefail

# Local post-write hook: install, test, then run the build gate.
if [[ -f pnpm-lock.yaml ]]; then
  pnpm install --frozen-lockfile
else
  pnpm install
fi
pnpm test
pnpm run build
