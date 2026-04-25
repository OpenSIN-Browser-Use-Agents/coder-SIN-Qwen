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

Use the prepared sidecar path only:

```bash
export CHROME_REMOTE_DEBUGGING_PORT="9444"
npm run cdp:start
npm run cdp:status
```

The relay will attach to that sidecar endpoint and keep the main Chrome process alone.

Default sidecar sync mode is `none` to avoid copying live cookies or login databases. If you explicitly need copied profile state, set `CHROME_SIDECAR_SYNC_MODE=minimal` or `CHROME_SIDECAR_SYNC_MODE=full` and restart the sidecar.

## If live smoke fails

- Check `artifacts/` for screenshots and selector reports
- Read the lock diagnostics from `npm run smoke:live`
- Re-run `npm run preflight`
