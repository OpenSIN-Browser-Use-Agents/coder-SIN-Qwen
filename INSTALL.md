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

`preflight` validates runtime config too, so invalid auth mode, timeout, or port values fail before Chrome starts.

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

If you never want this repo to touch the main Chrome owner, prepare the dedicated sidecar instead:

```bash
export CHROME_REMOTE_DEBUGGING_PORT="9444"
npm run cdp:start
npm run cdp:status
```

The relay then attaches only to that prepared sidecar endpoint and will not auto-close the attached tab when the run finishes.

## 4. Use OpenCode

Keep the repo-local OpenCode config in place:

```text
./.opencode/opencode.json
```

Then run:

```text
/ask-qwen build a feature
```

If your OpenCode global config contains the `coder-SIN-Qwen` agent entry, you can also select `coder-SIN-Qwen` directly from the agent picker for Qwen-first execution.

The repo-local `/ask-qwen` entry calls `node ./index.js` directly.
If your global OpenCode config also contains `/ask-qwen`, both paths use the same direct CLI strategy.
The shared global launcher prepares the sidecar CDP endpoint first, so it can attach instead of launching a broken second Chrome owner when your main browser is already open.

The browser relay will auto-switch to `Qwen3.6-Max-Preview` before sending prompts.
After each completed turn it will also re-assert `Qwen3.6-Max-Preview` so the same chat does not visually drift back to Plus.
For auth, the relay now uses direct email/password login with Infisical-backed account credentials only.
Prompt entry now uses keyboard-safe injection for ordinary messages and a faster insert path for very long prompts to avoid cut-off input.
Simple prompts are normalized into a structured task message so `/ask-qwen optimiere das projekt` is not passed through verbatim.
The `/ask-qwen` wrapper is stripped before Qwen receives the final prompt.
CDP attach now sets `PW_CHROMIUM_DISABLE_DOWNLOAD_BEHAVIOR=1` so the connection step does not fail on `Browser.setDownloadBehavior`.
The turn now waits for a stable non-empty assistant answer before any post-send reassertion happens.
The browser input boundary now strips `/ask-qwen` and rejects CLI artifacts before typing into Qwen.

For repo-aware prompts, the relay includes GitHub URLs for the repo and relevant files plus curated official reference URLs for the detected stack.
It also persists compact consult memory with `context_id`, `message_id`, and the previous summary in `.coder-sin-qwen-memory.json` by default.
The persisted prompt state now follows a canonical `state_snapshot` envelope so future consults can resume from compact structured memory instead of raw chat history.
Repo-aware replies now also pass through a deterministic validator/critic layer that can flag violations and strip obvious fluff before stdout is returned.
When you invoke coder-SIN-Qwen from another repo, pass that target repo as `--project-root "$PWD"` (the global launcher now does this automatically).
For public repos the relay sends repo/file/issue URLs plus provider docs and also uploads a small ranked set of relevant local source files; image files stay local-only; for private repos it uploads relevant local files instead.
If you need a stable browser/chat binding across repeated invocations, set `SIN_CODER_QWEN_SESSION_ID` yourself; otherwise the CLI derives a unique session id per run.
When repo URLs are not public, the relay now also writes a temporary Markdown task packet under `coder-sin-qwen-tasks/` and can publish it as a short-lived public GitHub Gist via `gh` auth.
If `gh` auth is unavailable, the relay keeps the local packet only and still cleans it up after the run.

The wrapper has been validated in CDP attach mode against Qwen; it sends a normal human-style message and returns the raw Qwen reply by default.

If you explicitly want an extra same-chat follow-up, opt in with:

```bash
node ./index.js --turns 2 "build a feature"
```

Autotraining helper:

```bash
node ./cli-autotraining.js "Design the next coder-SIN-Qwen improvement"
```

Use `--json` if you want the full snapshot + suggestion output.

The CLI entrypoints now attach a lifecycle manager that cleans up registered resources on signals or fatal runtime failures.

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
export INFISICAL_SECRET_PATH="/opensin/coder-sin-qwen"
npm run secrets:push
```

Current Infisical target for this repo:

- project id: `fa7758b4-f84c-4297-966e-710056d531ef`
- secret path: `/opensin/coder-sin-qwen`

## 7. Logging

To capture JSONL logs, set `SIN_CODER_QWEN_LOG_FILE=/path/to/coder-sin-qwen.log`.

To force profile validation in preflight, set `SIN_CODER_QWEN_REQUIRE_PROFILE=1`.

If you want stable correlation across a whole run, set `SIN_CODER_QWEN_RUN_ID`, `SIN_CODER_QWEN_TRACE_ID`, and `SIN_CODER_QWEN_SPAN_ID` before invoking the CLI.

Temporary public task packets can be controlled with `SIN_CODER_QWEN_PUBLIC_TASK_FILE=auto|always|off`.

Rate-limit recovery is controlled with `QWEN_RATE_LIMIT_COOLDOWN_HOURS`, `QWEN_RATE_LIMIT_FAILURE_THRESHOLD`, and `QWEN_RATE_LIMIT_CIRCUIT_BREAKER_MINUTES`.

## 8. Restore

If a snapshot was created, restore the last one with:

```bash
npm run restore:last
```

## 9. Artifacts

Screenshots from live checks are written to `artifacts/` by default.

If `npm run smoke:live` fails, inspect `artifacts/` and rerun the sidecar preparation flow instead of closing your main Chrome.

The only allowed browser path is the fallback sidecar CDP attach. The relay prepares the sidecar and attaches to it automatically:

```bash
npm run cdp:start
npm run cdp:status
```

The sidecar launch uses the Chrome binary directly, seeds cloned startup URLs, suppresses crash-restore/search-choice behavior, and opens `QWEN_URL` directly (default: `https://chat.qwen.ai`).
If a live CDP endpoint is already available, attach mode re-probes `/json/version`, logs the skip decision, and only then bypasses the cloned sidecar profile path check.
PDF/text/code attachments are eligible for upload; image files stay local-only and should be summarized before asking Qwen about them.
Keep outbound URL-bearing context to 10 unique links per message so the relay stays within Qwen's practical prompt budget.
If you truly need more room, set `SIN_CODER_QWEN_MAX_URLS` (the relay caps it at 25).
If the Qwen UI finishes but the DOM stays flaky, the relay will use a local screenshot OCR fallback before giving up.
The Qwen auth flow now clicks the sign-in entry when needed, uses email/password login, and waits for the assistant reply before returning.
`--smoke-live` now uses the same recovery path as normal runs, so it can verify the recovered sidecar attach path end-to-end.
Account rotation state is stored only as non-secret metadata in `artifacts/qwen-account-state.json` by default.
That state file is also where the cooldown and circuit-breaker metadata lives, so it is safe to keep in artifacts but should not be committed.

If you explicitly need more copied non-secret profile state, retry with:

```bash
export CHROME_SIDECAR_SYNC_MODE=full
```

To seed Infisical-backed Qwen accounts for this repo, use the path `/opensin/coder-sin-qwen` with env names like `QWEN_ACCOUNT_1_EMAIL`, `QWEN_ACCOUNT_1_PASSWORD`, `QWEN_ACCOUNT_2_EMAIL`, `QWEN_ACCOUNT_2_PASSWORD`, `QWEN_ACCOUNT_3_EMAIL`, and `QWEN_ACCOUNT_3_PASSWORD`.

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
