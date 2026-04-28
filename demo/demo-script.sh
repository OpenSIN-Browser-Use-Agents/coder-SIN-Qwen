#!/usr/bin/env bash
# coder-SIN-Qwen 30s Demo Script
# Phase 1 from /video-demo skill
set -euo pipefail

clear
echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║     coder-SIN-Qwen — Qwen 3.6 Max FREE          ║"
echo "  ║     from your terminal. No API key needed.       ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""
sleep 3

echo "  $ tree -L 2 packages/qwen-core/lib/"
echo ""
tree -L 2 packages/qwen-core/lib/ 2>/dev/null | head -18 || \
  ls packages/qwen-core/lib/ | head -15
echo ""
sleep 4

echo "  $ node --test test/selector-chain.test.js"
node --test test/selector-chain.test.js 2>&1 | tail -3
sleep 2

echo ""
echo "  $ node --test test/self-heal.test.js"
node --test test/self-heal.test.js 2>&1 | tail -3
sleep 2

echo ""
echo "  $ node --test test/secret-client.test.js"
node --test test/secret-client.test.js 2>&1 | tail -3
sleep 2

echo ""
echo "  ▸ 21 production-hardened modules"
echo "  ▸ 200+ tests (unit + property-based + integration)"
echo "  ▸ Self-Healing browser automation"
echo "  ▸ Zero-trust SecretClient"
echo "  ▸ 9-State Browser State Machine"
sleep 4

echo ""
echo "  ┌──────────────────────────────────────────────────┐"
echo "  │                                                  │"
echo "  │   git clone OpenSIN-Browser-Use-Agents/          │"
echo "  │        coder-SIN-Qwen                            │"
echo "  │   cd coder-SIN-Qwen && pnpm install              │"
echo "  │   node ./index.js \"Review my code\"               │"
echo "  │                                                  │"
echo "  │   FREE · Open Source · v1.0.0 · MIT License      │"
echo "  │                                                  │"
echo "  └──────────────────────────────────────────────────┘"
echo ""
sleep 3
