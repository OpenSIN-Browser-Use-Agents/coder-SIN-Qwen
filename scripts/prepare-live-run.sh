#!/usr/bin/env bash
set -euo pipefail

# Production-style live-run preparation: validate environment, secrets, and browser profile first.
node ./preflight.js
node ./secrets-check.js
node ./smoke.js --live
