# omo-SIN-Qwen Index

## What this repo is

`omo-SIN-Qwen` is a standalone OpenCode agent repo that relays tasks to Qwen through the local Chrome `Default` profile.

## Main files

- `index.js` — CLI entrypoint
- `browser.js` — strict UI-only browser session
- `context.js` — repo context collector
- `ignore-filter.js` — `.qwenignore` / `.gitignore` filtering
- `git.js` — snapshot helper
- `parser.js` — response parser
- prompt delivery is human-style text, raw text is the default output, and the parser still prefers final assistant JSON over echoed prompt/context JSON
- live chat auto-selects `Qwen3.6-Max-Preview` before sending the prompt
- extra turns happen only when `--turns 2+` is requested, and they continue in the same chat
- repo-aware prompts include repository/file URLs plus curated official reference URLs for the current stack
- repo-aware consults persist `context_id`, `message_id`, and a compact previous summary in `.omo-sin-qwen-memory.json`
- consult memory now uses a canonical `state_snapshot` envelope with metadata, mandate, decision history, constraints, and completion criteria
- validator/critic review now checks constraints, completion criteria, and fluff before the final reply is returned
- `preflight.js` — dependency and env checks
- `secrets-check.js` — secret presence checks
- `SECRETS.md` — Infisical and env checklist
- `LIVE_RUNBOOK.md` — live execution sequence
- `MERGE_RUNBOOK.md` — guarded merge sequence
- `scripts/start-cdp-sidecar.sh` — launch non-destructive CDP sidecar
- `scripts/cdp-status.sh` — check CDP endpoint
- attach mode reuses an existing blank tab when possible and leaves the attached tab open
- `scripts/bootstrap-remote.sh` — create remote repo when explicitly allowed
- `verify.js` — install/test/build verification
- `smoke.js` — local readiness check
- `logger.js` — JSONL logging helper
- `OPS.md` — ops, logging, secrets, rollback
- `SECURITY.md` — secret handling rules
- `scripts/merge-main.sh` — guarded GitHub merge helper
- `scripts/prepare-live-run.sh` — live-run gate
- `test/selectors.test.js` — selector regression test
- `.nvmrc` / `.npmrc` — runtime and package-manager guardrails

## Commands

- `npm run ask` — run the CLI
- `npm run ask:json` — run the CLI with parsed JSON output
- `npm run verify` — install, test, build
- `node ./index.js --snapshot <prompt>` — snapshot before run
- `node ./index.js --dry-run <prompt>` — context only

## OpenCode

Use the repo-local `./.opencode/opencode.json` config for `/ask-qwen`, `/ask-qwen-json`, and the `omo-SIN-Qwen` agent entry.
