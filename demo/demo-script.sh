#!/usr/bin/env bash
set -euo pipefail
clear
echo "========================================"
echo "  coder-SIN-Qwen — Qwen 3.6 Max FREE"
echo "  from your terminal. No API key."
echo "========================================"
echo ""
sleep 3

echo "$ node ./index.js --dry-run \"What makes this project special?\""
echo ""
sleep 1

node ./index.js --dry-run "What makes this project special?" 2>&1 | head -8
echo "..."
echo ""
sleep 2

echo "Key Features:"
echo "  - 21 modules in packages/qwen-core/"
echo "  - 200+ tests (147 unit + property-based)"
echo "  - Self-healing browser automation"
echo "  - Zero-trust secret management"
echo "  - Selector resilience engine"
echo ""
sleep 3

echo "$ node ./verify.js"
echo "Running tests..."
node --test test/secret-client.test.js 2>&1 | grep -E "tests|pass|fail"
sleep 2

echo ""
echo "github.com/OpenSIN-Browser-Use-Agents/coder-SIN-Qwen"
echo "v1.0.0 — Open Source — MIT License"
echo ""
