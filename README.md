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
- `scripts/merge-main.sh` — guarded GitHub merge helper
- `ignore-filter.js` — `.qwenignore` / `.gitignore` filtering
- `INDEX.md` — repo map
- `INSTALL.md` — setup guide
- `OPS.md` — operations and rollback notes
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

If you want a dedicated non-destructive debug sidecar instead of touching the main browser owner:

```bash
export CHROME_REMOTE_DEBUGGING_PORT="9335"
npm run cdp:start
export CHROME_CDP_URL="http://127.0.0.1:9335"
```

By default the sidecar uses a **minimal auth/state sync** for faster startup. Set `CHROME_SIDECAR_SYNC_MODE=full` only if the minimal snapshot misses required session state.

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

If Chrome must stay open, prefer attach mode instead of launching a second profile owner:

```bash
export CHROME_CDP_URL="http://127.0.0.1:9222"
# or
export CHROME_REMOTE_DEBUGGING_PORT="9222"
```

In attach mode the repo reuses an existing blank tab when possible, keeps your Chrome session alive, and does not auto-close the attached tab afterward.

## CI / release

- CI runs `npm test` and `npm run build`
- release versions use semver via `npm run release:patch|minor|major`
- after version bumps, create a Git tag and push it to publish a release

## Environment

- `QWEN_URL` — defaults to `https://chat.qwen.ai`
- `CHROME_PROFILE` — Chrome profile folder for authenticated browser runs
- `CHROME_PROFILE_DIRECTORY` — explicit Chrome profile name when `CHROME_PROFILE` points at the user-data root
- `CHROME_CDP_URL` — attach to an already-running Chrome debug endpoint
- `CHROME_REMOTE_DEBUGGING_PORT` — shorthand for a local CDP endpoint
- `SIN_CODER_QWEN_DRY_RUN=1` — skip browser automation and print payload only (legacy `SIN_OMO_QWEN_DRY_RUN` still works)
- `--json` — print the parsed machine-readable payload instead of raw Qwen text
- `SIN_CODER_QWEN_LOG_FILE` — JSONL log destination (legacy `SIN_OMO_QWEN_LOG_FILE` still works)
- `SIN_CODER_QWEN_ARTIFACT_DIR` — screenshot output directory (legacy `SIN_OMO_QWEN_ARTIFACT_DIR` still works)
- `SIN_CODER_QWEN_MEMORY_FILE` — persistent consult memory file (defaults to `.coder-sin-qwen-memory.json`; legacy var still works)
- `SIN_CODER_QWEN_AUTOTRAINING_FILE` — JSONL file for autotraining snapshots/suggestions (legacy var still works)
- `INFISICAL_ENV_NAME` — Infisical environment slug for sync commands
- `INFISICAL_SECRET_PATH` — Infisical folder path for sync commands
- `INFISICAL_PROJECT_ID` — Infisical project id for non-interactive pull/push flows
- `SIN_CODER_QWEN_SMOKE_LIVE=1` — run a real browser smoke proof (legacy `SIN_OMO_QWEN_SMOKE_LIVE` still works)
- `SIN_CODER_QWEN_REQUIRE_PROFILE=1` — force preflight to fail when the Chrome profile is missing (legacy `SIN_OMO_QWEN_REQUIRE_PROFILE` still works)
- `.qwenignore` — preferred token-saving context filter
- `--snapshot` — create a Git snapshot before the Qwen run

## OpenCode

Run `/ask-qwen` from OpenCode through the repo-local `./.opencode/opencode.json` command template.
See `INSTALL.md` for the full setup.

The global OpenCode config can also expose `/ask-qwen` and `/ask-qwen-json` command templates that call `node ./index.js` directly. The repo-local config now follows that same direct-CLI path instead of relying on a shell wrapper.

OpenCode can also expose `coder-SIN-Qwen` as a selectable agent. That agent is meant to consult Qwen first, keep only the useful best-practice suggestions, and then continue the local task without blindly following extra fluff.

The live browser path now auto-selects `Qwen3.6-Max-Preview` before chatting.
It also re-asserts `Qwen3.6-Max-Preview` after each completed turn so the active chat stays pinned to the intended model.

The wrapper has been verified end-to-end against Qwen in attach mode; it now sends a normal human-style message, returns the raw Qwen reply by default, and can still recover the final assistant JSON when you ask for `--json`.

Extra Qwen turns are now opt-in only. Use `--turns 2` or higher when you explicitly want a same-chat follow-up.

For repo-aware prompts, the relay now also includes:
- the repository web URL
- commit URL
- selected file URLs from the current repo state
- curated official reference URLs for relevant technologies such as Node.js, Playwright, GitHub Actions, and Infisical when applicable
- persistent consult metadata (`context_id`, `message_id`, previous summary)
- a canonical `state_snapshot` envelope with protocol version, sender/receiver metadata, decision history, constraints, and completion criteria
- a validator/critic review pass that scores replies, flags violations, and can strip fluff before returning text output
- an autotraining module that stores snapshot/suggestion pairs for iterative Qwen-guided self-improvement
- a lifecycle manager that tracks browser/CLI resources and performs bounded graceful cleanup on shutdown or fatal process events

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

Live smoke checks and browser failures can write screenshots to `artifacts/` (or `SIN_CODER_QWEN_ARTIFACT_DIR`, with legacy alias support).

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
