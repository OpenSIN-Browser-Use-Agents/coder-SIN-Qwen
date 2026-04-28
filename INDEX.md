# coder-SIN-Qwen Index

## What this repo is

`coder-SIN-Qwen` is a standalone OpenCode agent repo that relays tasks to Qwen through the local Chrome `Default` profile.

## Workspace scaffold

- `apps/qwen-connector/` — monorepo app wrapper for the CLI entrypoint
- `packages/qwen-core/` — shared pure helpers (context, prompts, trace, logging, runtime config, parser, validator, lifecycle, conversation tree, secrets, consult memory, and internal `lib/` utilities)
- `packages/qwen-core/lib/` — internal helpers (memory-writer, prompt-guard, wait-for-completion, cdp-probe, conversation-tree-cli, git-prepare)
- `pnpm-workspace.yaml` / `turbo.json` — workspace and task-graph foundation
- `pnpm-lock.yaml` — pnpm lockfile (npm lockfile removed)

## Main files

- `index.js` — CLI entrypoint
- `browser.js` — strict UI-only browser session
- `public-task-file.js` — temporary task packets and optional public gist publishing
- `qwen-account-rotation.js` — account cooldown and circuit breaker state
- prompt delivery is normalized into a structured task envelope for both simple and repo-aware prompts, wrapper prefixes like `/ask-qwen` are stripped first, and the parser still prefers final assistant JSON over echoed prompt/context JSON
- each run now gets a dedicated Qwen session id/tab binding so parallel agents cannot read or send in the wrong chat
- only verified public URLs are rendered; private or unreachable URLs are stripped into local-only metadata
- live chat auto-selects `Qwen3.6-Max-Preview` before sending the prompt
- prompt entry uses keyboard-safe injection for short messages and a faster insert path for long ones to reduce cutoff risk
- auth now prefers direct email/password login with Infisical-backed Qwen accounts and rotates by cooldown/order state in `artifacts/qwen-account-state.json`
- extra turns happen only when `--turns 2+` is requested, and they continue in the same chat
- repo-aware prompts include repository/file URLs plus curated official reference URLs for the current stack; small ranked source-file attachments are uploaded locally for code turns, PDFs/text/logs can still be attached, and image files stay local-only; URL-bearing context is capped at 10 unique links by default (override with `SIN_CODER_QWEN_MAX_URLS` up to 25), decision history stays short, and completion detection now fails closed when the final reply never stabilizes or looks structurally truncated
- repo-aware consults persist `context_id`, `message_id`, and a compact previous summary in `.coder-sin-qwen-memory.json`
- consult memory now uses a canonical `state_snapshot` envelope with metadata, mandate, decision history, constraints, and completion criteria
- validator/critic review now checks constraints, completion criteria, and fluff before the final reply is returned
- runtime config validation now enforces `email_password` auth, sane session timeouts, and safe CDP port/rate-limit bounds before browser work begins
- trace correlation now propagates `SIN_CODER_QWEN_RUN_ID`, `SIN_CODER_QWEN_TRACE_ID`, `SIN_CODER_QWEN_SPAN_ID`, and `SIN_CODER_QWEN_PARENT_SPAN_ID` into logs and artifacts
- `SIN_CODER_QWEN_SESSION_ID` binds the browser tab and consult memory to one agent session
- `context.urlAccessibility` switches between public URL rendering and local-only fallbacks when URL checks fail
- `coder-sin-qwen-tasks/` is the runtime workspace for temporary task packets and is ignored by git
- rate-limit tracking now records cooldowns plus a circuit breaker in `artifacts/qwen-account-state.json`
- CDP attach now sets `PW_CHROMIUM_DISABLE_DOWNLOAD_BEHAVIOR=1` so Playwright does not trip Browser.setDownloadBehavior on connect
- assistant text stabilization now waits for a stable non-empty answer before the model selectors are reasserted
- consult memory persistence now writes atomically so interrupted runs do not corrupt `.coder-sin-qwen-memory.json`
- CDP reachability checks now use one bounded probe helper with abort-based timeouts across attach/recovery flows
- the browser input boundary now strips `/ask-qwen`, rejects CLI artifacts, and truncates oversized prompts before typing into Qwen
- conversation-tree branching is now available through `--branch <nodeId>` and `--tree`, with local prompt-path expansion backed by `.coder-sin-qwen-conversations.json`
- conversation-tree output now highlights the active/latest branch and JSON mode includes branch path + role history metadata for the new node
- `--checkout <nodeId|latest|root|none>` persists the active conversation node locally, and `--prepare-commit` stages changes plus prints a commit-ready diff stat without creating a commit
- `preflight.js` — dependency and env checks
- `SECRETS.md` — Infisical and env checklist
- `LIVE_RUNBOOK.md` — live execution sequence
- `MERGE_RUNBOOK.md` — guarded merge sequence
- `scripts/start-cdp-sidecar.sh` — launch non-destructive CDP sidecar
- sidecar startup now launches Chrome directly, seeds cloned startup URLs, suppresses crash-restore/search-choice behavior, and opens the configured Qwen URL directly
- the auth flow now clicks the Qwen sign-in entry when needed, uses email/password login, and waits for a real assistant reply before returning
- live smoke checks reuse the same recovery path as normal runs, so `--smoke-live` validates the recovered browser session
- `scripts/cdp-status.sh` — check CDP endpoint
- sidecar CDP attach is the only allowed browser path; the relay prepares it and leaves the attached tab open, and attach mode now probes the CDP endpoint before skipping cloned-profile validation and logs the decision for auditability
- `scripts/bootstrap-remote.sh` — create remote repo when explicitly allowed
- `verify.js` — install/test/build verification
- `smoke.js` — local readiness check
- `modul-qwen-autotraining.js` — Qwen-first self-improvement snapshot/suggestion orchestration
- `cli-autotraining.js` — autotraining CLI entrypoint
- `OPS.md` — ops, logging, secrets, rollback
- `SECURITY.md` — secret handling rules
- `scripts/merge-main.sh` — guarded GitHub merge helper
- `scripts/prepare-live-run.sh` — live-run gate
- `test/selectors.test.js` — selector regression test
- `.nvmrc` / `.npmrc` — runtime and package-manager guardrails

## Commands

- `ppnpm run ask` — run the CLI
- `ppnpm run ask:json` — run the CLI with parsed JSON output
- `ppnpm run verify` — install, test, build
- `node ./index.js --snapshot <prompt>` — snapshot before run
- `node ./index.js --dry-run <prompt>` — context only

## OpenCode

Use the repo-local `./.opencode/opencode.json` config for `/ask-qwen` and the `coder-SIN-Qwen` agent entry.
