# Operations

## Run modes

- `pnpm run preflight` — dependency and environment gate
- `pnpm run verify` — install, test, build
- `pnpm run smoke` — local browser/profile readiness check
- `pnpm run smoke:live` — browser smoke with screenshots + selector report
- `pnpm run cdp:start` — launch a separate debug sidecar without closing main Chrome
- `pnpm run cdp:status` — check whether the CDP endpoint is alive
- `pnpm run live:prepare` — preflight + secrets + live browser smoke
- `node ./index.js --dry-run <prompt>` — context only
- `node ./index.js --snapshot <prompt>` — create a Git snapshot before execution

## Logging

Set `SIN_CODER_QWEN_LOG_FILE` to capture JSONL run logs.

Use `SIN_CODER_QWEN_ARTIFACT_DIR` to change where screenshots are stored.

## Secrets

If your organization uses Infisical, mirror only the needed fields there one by one:

- `CHROME_PROFILE`
- `CHROME_PROFILE_DIRECTORY`
- `CHROME_CDP_URL`
- `CHROME_REMOTE_DEBUGGING_PORT`
- `QWEN_URL`
- `SIN_CODER_QWEN_LOG_FILE`
- `SIN_CODER_QWEN_ARTIFACT_DIR`
- `SIN_CODER_QWEN_REQUIRE_PROFILE`
- `GH_TOKEN`

Never commit browser cookies or token files.

Run `pnpm run secrets:check` after pulling from Infisical.
Run `pnpm run secrets:push` only when you are sure the current Infisical project is the intended target.

## Rollback

- Use `--snapshot` before risky runs.
- If something breaks, revert with `git reset --hard <snapshot-hash>`.
- Or run `pnpm run restore:last`.

## Merge helper

- `pnpm run merge:main` is guarded by `ALLOW_GH_MERGE=1` and `GH_TOKEN`.
- It creates/merges a PR via the GitHub CLI.
- `pnpm run remote:init` is separately guarded by `ALLOW_GH_REMOTE_CREATE=1`.

## Browser verification

- Use `pnpm run smoke` for local readiness.
- Set `SIN_CODER_QWEN_SMOKE_LIVE=1` for a live page check.
- Screenshots are stored in `artifacts/` by default.
- Live checks prepare the sidecar CDP attach path automatically, so your main Chrome can stay open.
- The sidecar attach path is the only supported runtime browser path.
- Sidecar launches default to `CHROME_SIDECAR_SYNC_MODE=none` to avoid copying live credential stores.
