# Live Runbook

## Goal

Prepare and execute a real browser-backed Qwen run without losing diagnostics.

## Safe order

1. `npm run preflight`
2. `npm run secrets:check`
3. `npm run smoke`
4. `npm run smoke:live`
5. `node ./index.js --snapshot "<prompt>"`

## If Chrome must remain open

Use attach mode:

```bash
export CHROME_CDP_URL="http://127.0.0.1:9222"
```

or:

```bash
export CHROME_REMOTE_DEBUGGING_PORT="9222"
```

This keeps the existing Chrome process alive and opens a temporary tab for automation.

If you do not already have a debug-enabled Chrome instance, start a separate sidecar instead:

```bash
export CHROME_REMOTE_DEBUGGING_PORT="9335"
npm run cdp:start
npm run cdp:status
export CHROME_CDP_URL="http://127.0.0.1:9335"
```

This does not close or reuse the main Chrome process; it launches a separate debug copy from a profile snapshot.

Default sidecar sync mode is `minimal` for speed. If the copied session is missing auth state, set `CHROME_SIDECAR_SYNC_MODE=full` and restart the sidecar.

## If live smoke fails

- Check `artifacts/` for screenshots and selector reports
- Read the lock diagnostics from `npm run smoke:live`
- Re-run `npm run preflight`
