# Installation

## 1. Install dependencies

```bash
npm install
```

This repo targets Node.js 20 (`.nvmrc` + `.npmrc` enforce it).

If you want a local env file, copy the example first:

```bash
cp .env.example .env
```

## 2. Verify the repo

```bash
npm run preflight
npm run verify
```

## 3. Prepare Chrome

Log into Qwen in your local Chrome `Default` profile.

If the repo is used by multiple people, do not share that profile directory.
Close any other Chrome windows using that same profile before live smoke or live runs.

Default profile path examples:

- macOS: `~/Library/Application Support/Google/Chrome/Default`
- Linux: `~/.config/google-chrome/Default`

Advanced override:

```bash
export CHROME_PROFILE="$HOME/Library/Application Support/Google/Chrome"
export CHROME_PROFILE_DIRECTORY="Default"
```

If you never want this repo to launch a second Chrome owner, attach to an already-running debug-enabled Chrome instead:

```bash
export CHROME_CDP_URL="http://127.0.0.1:9222"
```

In attach mode the repo will try to reuse an existing blank tab first and will not auto-close the attached tab when the run finishes.

## 4. Use OpenCode

Keep the repo-local OpenCode config in place:

```text
./.opencode/opencode.json
```

Then run:

```text
/ask-qwen build a feature
```

If your OpenCode global config contains the `omo-SIN-Qwen` agent entry, you can also select `omo-SIN-Qwen` directly from the agent picker for Qwen-first execution.

The repo-local `/ask-qwen` and `/ask-qwen-json` entries call `node ./index.js` directly.
If your global OpenCode config also contains those commands, both paths use the same direct CLI strategy.

The browser relay will auto-switch to `Qwen3.6-Max-Preview` before sending prompts.
After each completed turn it will also re-assert `Qwen3.6-Max-Preview` so the same chat does not visually drift back to Plus.

For repo-aware prompts, the relay includes GitHub URLs for the repo and relevant files plus curated official reference URLs for the detected stack.
It also persists compact consult memory with `context_id`, `message_id`, and the previous summary in `.omo-sin-qwen-memory.json` by default.
The persisted prompt state now follows a canonical `state_snapshot` envelope so future consults can resume from compact structured memory instead of raw chat history.

The wrapper has been validated in CDP attach mode against Qwen; it sends a normal human-style message and returns the raw Qwen reply by default.

If you explicitly want an extra same-chat follow-up, opt in with:

```bash
node ./index.js --turns 2 "build a feature"
```

If you need parsed machine-readable output instead:

```bash
node ./index.js --json "build a feature"
```

## 5. Optional flags

- `--dry-run`
- `--json`
- `--snapshot`
- `--turns <n>`
- `--smoke`
- `--smoke-live`
- `--preflight`

## 6. Secrets sync

If Infisical is configured for this repo, pull local env files with:

```bash
npm run secrets:pull
npm run secrets:check
```

If the target Infisical project is already correct and you want to publish current values:

```bash
export INFISICAL_PROJECT_ID="fa7758b4-f84c-4297-966e-710056d531ef"
export INFISICAL_SECRET_PATH="/opensin/omo-sin-qwen"
npm run secrets:push
```

Current Infisical target for this repo:

- project id: `fa7758b4-f84c-4297-966e-710056d531ef`
- secret path: `/opensin/omo-sin-qwen`

## 7. Logging

To capture JSONL logs, set `SIN_OMO_QWEN_LOG_FILE=/path/to/omo-sin-qwen.log`.

To force profile validation in preflight, set `SIN_OMO_QWEN_REQUIRE_PROFILE=1`.

## 8. Restore

If a snapshot was created, restore the last one with:

```bash
npm run restore:last
```

## 9. Artifacts

Screenshots from live checks are written to `artifacts/` by default.

If `npm run smoke:live` fails with a profile lock message, close Chrome and rerun it.
If you do not want to close Chrome, use CDP attach mode instead.

Or start a separate debug sidecar that leaves your main Chrome alone:

```bash
export CHROME_REMOTE_DEBUGGING_PORT="9335"
npm run cdp:start
npm run cdp:status
```

If authentication does not survive the sidecar snapshot, retry with:

```bash
export CHROME_SIDECAR_SYNC_MODE=full
```

## 10. Live-run preparation

```bash
npm run live:prepare
```

Detailed sequence: `LIVE_RUNBOOK.md`

## 11. GitHub merge helper

If you want the guarded merge helper, set `ALLOW_GH_MERGE=1` before running:

```bash
npm run merge:main
```

If `GH_TOKEN` is not already exported, the helper will use `gh auth token` automatically.

Detailed sequence: `MERGE_RUNBOOK.md`

If the local repo has no `origin` yet, bootstrap one first:

```bash
export ALLOW_GH_REMOTE_CREATE=1
npm run remote:init
```
