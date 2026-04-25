# coder-SIN-Qwen

coder-SIN-Qwen is a **standalone relay proxy repo** for OpenCode-style execution.

It does not “think” for you. It:

1. collects local project context,
2. sends it to Qwen in the browser,
3. waits for the answer,
4. returns the plain Qwen answer by default.

If you explicitly need machine-readable output, use `--json` so the repo prints the parsed payload instead.
For richer Qwen back-and-forth, the relay can take one short follow-up turn when the answer clearly suggests a useful next step.

## Files

- `index.js` — CLI entrypoint
- `context.js` — gathers repo context
- `browser.js` — browser/session adapter
- `parser.js` — turns model output into structured actions
- `preflight.js` — dependency and environment gate
- `modul-qwen-autotraining.js` — Qwen-first self-improvement snapshot/suggestion engine
- `cli-autotraining.js` — CLI entrypoint for autotraining runs
- `lifecycle.js` — graceful shutdown and resource cleanup manager
- `secrets-check.js` — secret presence validator
- `push-secrets.js` — Infisical push helper
- `git.js` — optional snapshot helper
- `logger.js` — JSONL run logging
- `smoke.js` — readiness check
- `restore.js` — rollback helper
- `public-task-file.js` — temporary task packet writer and optional public gist publisher
- `scripts/merge-main.sh` — guarded GitHub merge helper
- `ignore-filter.js` — `.qwenignore` / `.gitignore` filtering
- `INDEX.md` — repo map
- `INSTALL.md` — setup guide
- `OPS.md` — operations and rollback notes
- `coder-sin-qwen-tasks/` — runtime workspace for generated task packets
- `.nvmrc` / `.npmrc` — runtime guardrails

## Usage

```bash
node ./index.js "Review the repo and propose the next implementation step"
```

Machine-readable output:

```bash
node ./index.js --json "Review the repo and propose the next implementation step"
```

Autotraining cycle:

```bash
node ./cli-autotraining.js "Design the next coder-SIN-Qwen improvement"
```

Optional snapshot before run:

```bash
node ./index.js --snapshot "Review the repo and propose the next implementation step"
```

Dry run:

```bash
node ./index.js --dry-run "Review the repo and propose the next implementation step"
```

Preflight:

```bash
node ./index.js --preflight
```

Live smoke:

```bash
node ./index.js --smoke-live
```

If Chrome already has the `Default` profile open, close those windows first.

## Verify after writes

```bash
bash ./scripts/after-write.sh
```

This runs `npm install` and then `npm run build`.

Recommended reliable verification:

```bash
node ./verify.js
```

or:

```bash
npm run verify
```

## Testing

```bash
npm test
```

Preflight and smoke:

```bash
npm run preflight
npm run smoke
npm run smoke:live
npm run cdp:status
```

Live-run preparation:

```bash
npm run live:prepare
```

Use the dedicated non-destructive sidecar path; the relay prepares it and attaches by CDP:

```bash
export CHROME_REMOTE_DEBUGGING_PORT="9444"
npm run cdp:start
export CHROME_CDP_URL="http://127.0.0.1:9444"
```

The sidecar now launches the Chrome binary directly, seeds the cloned profile's startup URLs, suppresses crash-restore and search-engine-choice prompts, and opens the Qwen chat URL directly.
The auth flow clicks the Qwen sign-in entry when needed, uses direct email/password login, and waits for a real assistant reply before returning.
Live smoke checks now reuse the same recovery path as normal runs, so `--smoke-live` can validate the authenticated sidecar/attach flow instead of failing on a locked Default profile.

By default the sidecar uses **no profile sync** for the fastest and least fragile recovery path. Set `CHROME_SIDECAR_SYNC_MODE=minimal` or `CHROME_SIDECAR_SYNC_MODE=full` only if you explicitly need copied profile state.

The shared launcher prepares only the sidecar CDP endpoint on `9444` (or your configured `CHROME_REMOTE_DEBUGGING_PORT`). If that recovery path cannot produce a live CDP endpoint within the bounded startup window, the relay fails fast with a clear message instead of silently falling back to a broken startup method.

## Browser setup

The browser flow is strict UI-only and uses your local Chrome `Default` profile.
Node.js 20 is the supported runtime floor for this repo.
To enable real Qwen submission with Playwright:

```bash
npm i -D playwright
npx playwright install chromium
```

Then optionally point the script at an authenticated Chrome profile:

```bash
export CHROME_PROFILE="$HOME/Library/Application Support/Google/Chrome/Default"
```

If needed, you can also provide the Chrome user-data root plus a separate profile name:

```bash
export CHROME_PROFILE="$HOME/Library/Application Support/Google/Chrome"
export CHROME_PROFILE_DIRECTORY="Default"
```

The only allowed browser path is the fallback sidecar CDP attach. The relay sets `CHROME_ATTACH_MODE=1` and `CHROME_CDP_URL` internally during preparation:

```bash
export CHROME_REMOTE_DEBUGGING_PORT="9444"
```

Attach mode keeps the browser alive and does not auto-close the attached tab afterward.
When attach mode is active, the relay probes `/json/version` before skipping the cloned sidecar profile check, logs `attach_mode_skip_sidecar_profile_check`, and fails fast if the endpoint is stale.

If the recovered session lands on the Qwen auth page, the relay uses direct email/password login with Infisical-backed Qwen accounts only.

## CI / release

- CI runs `npm test` and `npm run build`
- release versions use semver via `npm run release:patch|minor|major`
- after version bumps, create a Git tag and push it to publish a release

## Environment

- `QWEN_AUTH_METHOD` — locked to `email_password` by runtime validation
- `SIN_CODER_QWEN_SESSION_TIMEOUT_MS` — hard timeout for one Qwen browser session
- `QWEN_RATE_LIMIT_COOLDOWN_HOURS` — cooldown window after a rate-limit hit
- `QWEN_RATE_LIMIT_FAILURE_THRESHOLD` — number of consecutive rate-limit hits before the circuit breaker opens
- `QWEN_RATE_LIMIT_CIRCUIT_BREAKER_MINUTES` — how long the circuit breaker stays open
- `QWEN_URL` — defaults to `https://chat.qwen.ai`
- `QWEN_ACCOUNT_ORDER` — preferred account order for fallback login (for example `2,3,1`)
- `QWEN_ACCOUNT_STATE_FILE` — non-secret cooldown state file for account rotation (defaults to `artifacts/qwen-account-state.json`)
- `QWEN_ACCOUNT_1_EMAIL` / `QWEN_ACCOUNT_1_PASSWORD` — direct login credentials for account 1
- `QWEN_ACCOUNT_2_EMAIL` / `QWEN_ACCOUNT_2_PASSWORD` — direct login credentials for account 2
- `QWEN_ACCOUNT_3_EMAIL` / `QWEN_ACCOUNT_3_PASSWORD` — direct login credentials for account 3
- `CHROME_PROFILE` — Chrome profile folder for authenticated browser runs
- `CHROME_PROFILE_DIRECTORY` — explicit Chrome profile name when `CHROME_PROFILE` points at the user-data root
- `CHROME_CDP_URL` — attach to an already-running Chrome debug endpoint
- `CHROME_REMOTE_DEBUGGING_PORT` — shorthand for a local CDP endpoint
- `SIN_CODER_QWEN_DRY_RUN=1` — skip browser automation and print payload only
- `--json` — print the parsed machine-readable payload instead of raw Qwen text
- `SIN_CODER_QWEN_LOG_FILE` — JSONL log destination
- `SIN_CODER_QWEN_ARTIFACT_DIR` — screenshot output directory
- `SIN_CODER_QWEN_MEMORY_FILE` — persistent consult memory file (defaults to `.coder-sin-qwen-memory.json`)
- `SIN_CODER_QWEN_AUTOTRAINING_FILE` — JSONL file for autotraining snapshots/suggestions
- `SIN_CODER_QWEN_RUN_ID` / `SIN_CODER_QWEN_TRACE_ID` / `SIN_CODER_QWEN_SPAN_ID` / `SIN_CODER_QWEN_PARENT_SPAN_ID` / `SIN_CODER_QWEN_SESSION_ID` — trace and chat-session correlation fields written into logs, snapshots, and browser tab binding
- `SIN_CODER_QWEN_PUBLIC_TASK_FILE` — `auto` (default), `always`, or `off` for temporary public Markdown task packets
- `INFISICAL_ENV_NAME` — Infisical environment slug for sync commands
- `INFISICAL_SECRET_PATH` — Infisical folder path for sync commands
- `INFISICAL_PROJECT_ID` — Infisical project id for non-interactive pull/push flows
- `SIN_CODER_QWEN_SMOKE_LIVE=1` — run a real browser smoke proof
- `SIN_CODER_QWEN_REQUIRE_PROFILE=1` — force preflight to fail when the Chrome profile is missing
- `.qwenignore` — preferred token-saving context filter
- `--snapshot` — create a Git snapshot before the Qwen run

Runtime validation rejects unsupported auth modes and invalid timeout/port values before the browser starts.
Rate-limit failures are tracked in `QWEN_ACCOUNT_STATE_FILE`; once the threshold is reached, the circuit breaker pauses account rotation until the cooldown expires.
Trace fields are injected automatically so JSONL logs, smoke output, consult memory, and autotraining snapshots can be correlated across a single run.
Simple prompts now get normalized into a structured task message instead of being forwarded verbatim.
Wrapper prefixes like `/ask-qwen` are stripped before Qwen sees the prompt.
CDP attach now forces `PW_CHROMIUM_DISABLE_DOWNLOAD_BEHAVIOR=1` so Playwright can connect without the Browser.setDownloadBehavior error.
The relay now waits for a stable non-empty assistant answer before it reasserts model settings or finishes the turn, and falls back to stabilized body-text extraction when the usual assistant selectors drift.
If that still fails, it performs a local screenshot OCR fallback before timing out, so finished responses can still be recovered when Qwen's DOM shifts.
The browser input boundary now strips `/ask-qwen` and rejects CLI artifacts before typing into Qwen.

## OpenCode

Run `/ask-qwen` from OpenCode through the repo-local `./.opencode/opencode.json` command template.
See `INSTALL.md` for the full setup.

The global OpenCode config exposes the canonical `/ask-qwen` command, which calls `node ./index.js` directly. The repo-local config follows that same direct-CLI path instead of relying on a shell wrapper.
The shared global launcher now prepares the reachable local sidecar CDP endpoint before browser work begins, which avoids Chrome profile-lock failures when your main browser is already running.

OpenCode can also expose `coder-SIN-Qwen` as a selectable agent. That agent is meant to consult Qwen first, keep only the useful best-practice suggestions, and then continue the local task without blindly following extra fluff.

The live browser path now auto-selects `Qwen3.6-Max-Preview` before chatting.
It also re-asserts `Qwen3.6-Max-Preview` after each completed turn so the active chat stays pinned to the intended model.
Before each send it also enforces the Qwen thinking selector onto `Denken` / `Thinking`.
Prompt entry now prefers keyboard-safe injection and falls back to a faster text-insert path for very long prompts so chat content is less likely to be cut off.

The wrapper has been verified end-to-end against Qwen in attach mode; it now sends a normal human-style message, returns the raw Qwen reply by default, and can still recover the final assistant JSON when you ask for `--json`.

Extra Qwen turns are now opt-in only. Use `--turns 2` or higher when you explicitly want a same-chat follow-up.

Each run now binds to one dedicated Qwen tab/session via a session id marker, so parallel agents do not cross-read or reuse the wrong chat.

Prompt shaping is centralized in `prompt-builder.js`, which keeps repo-aware turns in a strict code-oriented schema before they reach Qwen.
URL-bearing context is only rendered when `context.urlAccessibility === 'public'`; private or unreachable URLs are stripped and replaced with local-only metadata.
When repo URLs are not public, the relay can also write a temporary Markdown task packet under `coder-sin-qwen-tasks/` and publish it as a short-lived public GitHub Gist so Qwen can inspect the same context via a public URL.

For repo-aware prompts, the relay now also includes:
- the repository web URL
- commit URL
- selected file URLs from the current repo state
- ranked source files plus PDFs/text/logs can be attached when useful; image files stay local-only and are not uploaded to Qwen
- issue URLs explicitly present in the task
- capability manifest entries that describe the relay's evidence/tool boundaries
- curated official reference URLs for relevant technologies such as Node.js, Playwright, GitHub Actions, and Infisical when applicable
- persistent consult metadata (`context_id`, `message_id`, previous summary)
- a canonical `state_snapshot` envelope with protocol version, sender/receiver metadata, decision history, constraints, and completion criteria
- a validator/critic review pass that scores replies, flags violations, and can strip fluff before returning text output
- an autotraining module that stores snapshot/suggestion pairs for iterative Qwen-guided self-improvement
- a lifecycle manager that tracks browser/CLI resources and performs bounded graceful cleanup on shutdown or fatal process events

Prompt budgeting notes:
- outbound URL-bearing context is capped at 10 unique URLs per message
- set `SIN_CODER_QWEN_MAX_URLS` to temporarily raise the URL cap (bounded to 25)
- decision history is trimmed to the last 2 relevant turns
- image files stay local-only; ranked source files plus PDFs/text/logs are eligible upload formats

Public/private behavior:
- public repos: prefer repo/file/issue URLs plus official provider/platform docs links, and upload a small ranked set of relevant local source files so Qwen can inspect exact code when needed
- private repos: attach relevant local files instead of relying on inaccessible repo URLs
- image files are not sent to Qwen; describe them locally before asking Qwen to reason about them

Resolved milestones:

- #1 Stabilize `ask-qwen` wrapper execution
- #2 Support real multi-turn Qwen conversations
- #3 Keep Max Preview pinned after each turn

## Handoff

See `HANDOFF.md` for the compact operating notes for future agents.

## Agents

See `AGENTS.md` for repo rules and validation steps.

## Changelog

See `CHANGELOG.md` for the initial release notes.

## Operations

See `OPS.md` for smoke tests, logging, secrets handling, and rollback.
See `LIVE_RUNBOOK.md` and `MERGE_RUNBOOK.md` for operational execution sequences.

If slash-command execution still misbehaves in your environment, use the direct fallback temporarily:

```bash
node ./index.js --turns 1 "your prompt"
```

## Artifacts

Live smoke checks and browser failures can write screenshots to `artifacts/` (or `SIN_CODER_QWEN_ARTIFACT_DIR`).

## Secrets

Use `npm run secrets:pull` after configuring Infisical locally.
Validate secret presence with `npm run secrets:check` and see `SECRETS.md`.
Push available values with `npm run secrets:push` only when the target Infisical project is correct.
For non-interactive use, set `INFISICAL_PROJECT_ID` first.

## Merge

Use `npm run merge:main` only when `ALLOW_GH_MERGE=1` is set.
The helper falls back to `gh auth token` when `GH_TOKEN` is not exported.
If the repo has no remote yet, bootstrap one with `npm run remote:init` and `ALLOW_GH_REMOTE_CREATE=1`.

## Notes

- Node.js 20+
- runtime deps: `ignore`, `playwright`
- browser automation is required for live Qwen runs
- secrets should stay out of git; use environment variables or an approved secret manager
