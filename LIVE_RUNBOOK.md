# Live Runbook

## Goal

Prepare and execute a real browser-backed Qwen run without losing diagnostics.

## Safe order

1. `pnpm run preflight`
2. `pnpm run secrets:check`
3. `pnpm run smoke`
4. `pnpm run smoke:live`
5. `node ./index.js --snapshot "<prompt>"`

## If Chrome must remain open

Use the prepared sidecar path only:

```bash
export CHROME_REMOTE_DEBUGGING_PORT="9444"
pnpm run cdp:start
pnpm run cdp:status
```

The relay will attach to that sidecar endpoint and keep the main Chrome process alone.

Default sidecar sync mode is `none` to avoid copying live cookies or login databases. If you explicitly need copied profile state, set `CHROME_SIDECAR_SYNC_MODE=minimal` or `CHROME_SIDECAR_SYNC_MODE=full` and restart the sidecar.

## If live smoke fails

- Check `artifacts/` for screenshots and selector reports
- Read the lock diagnostics from `pnpm run smoke:live`
- Re-run `pnpm run preflight`
