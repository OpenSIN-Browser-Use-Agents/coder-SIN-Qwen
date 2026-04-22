#!/usr/bin/env bash
set -euo pipefail

# Local post-write hook: install, test, then run the build gate.
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm test
npm run build
