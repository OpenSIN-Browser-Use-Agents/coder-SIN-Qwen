# brain.md — coder-SIN-Qwen Configuration Brain

> **DO NOT DELETE:** This file persists Chrome profile config and runtime knowledge.

## Chrome Profile

coder-SIN-Qwen auto-detects Chrome profiles via `chrome-profile-resolver.js`.

**Active profile on this machine:**
```bash
export QWEN_CHROME_PROFILE_NAME="zukunftsorientierte"
```

**Priority chain for profile resolution:**
1. `CHROME_PROFILE` — explicit full path
2. `CHROME_PROFILE_DIRECTORY` — profile dir name (e.g. `Profile 166`)
3. `QWEN_CHROME_PROFILE_NAME` / `CHROME_PROFILE_NAME` — auto-detect by display name
4. Falls back to `Default`

**Current machine profiles (62 total, existing matching "zukunftsorientierte"):**

| Directory | Name | Exists |
|-----------|------|--------|
| Profile 166 | zukunftsorientierte-energie.de | ✅ |

**Resolution result:** `Profile 166` is selected when `QWEN_CHROME_PROFILE_NAME=zukunftsorientierte`.

## Qwen Account

Account rotation is managed via `qwen-account-rotation.js` using Infisical-backed credentials.

**Active accounts:** 3 accounts configured via env vars:
- `QWEN_ACCOUNT_1_EMAIL` / `QWEN_ACCOUNT_1_PASSWORD`
- `QWEN_ACCOUNT_2_EMAIL` / `QWEN_ACCOUNT_2_PASSWORD`  
- `QWEN_ACCOUNT_3_EMAIL` / `QWEN_ACCOUNT_3_PASSWORD`

**Cooldown state:** `artifacts/qwen-account-state.json`

## CDP Sidecar

```bash
export CHROME_REMOTE_DEBUGGING_PORT="9444"
pnpm run cdp:start
export CHROME_CDP_URL="http://127.0.0.1:9444"
```

## Quick Start (with correct profile)

```bash
export QWEN_CHROME_PROFILE_NAME="zukunftsorientierte"
export CHROME_REMOTE_DEBUGGING_PORT="9444"
pnpm run cdp:start
export CHROME_CDP_URL="http://127.0.0.1:9444"
node ./index.js "Review this codebase"
```

## Key Modules

| Module | Purpose |
|--------|---------|
| `packages/qwen-core/lib/chrome-profile-resolver.js` | Reads Chrome Local State, finds correct profile |
| `browser.js` | Browser session, uses profile resolver |
| `qwen-account-rotation.js` | Account cooldown + rotation logic |
| `packages/qwen-core/lib/secret-client.js` | Zero-trust secret access |
| `cdp-recovery.js` | CDP endpoint recovery |
| `preflight.js` | Pre-run validation |

## v1.0.0 Release

Tagged 2026-04-28. First stable release with 21 modules, 200+ tests.

## Known Issues

- Screen recording requires macOS permission (System Preferences > Privacy)
- `--dry-run` output can exceed terminal buffer due to conversation tree accumulation
- ffmpeg avfoundation may fail when terminal has no screen recording permission
