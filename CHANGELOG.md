# Changelog

## Unreleased

- fixed Qwen send-button detection for the current web UI
- reduced context noise by excluding sidecar/artifact directories from `.qwenignore`
- taught the parser to prefer the final assistant JSON over echoed prompt JSON
- removed the forced `End with {"status":"draft"|"final"}` suffix so Qwen receives a normal message
- switched the default CLI output to raw Qwen text and added explicit `--json` mode
- auto-select `Qwen3.6-Max-Preview` before sending live prompts
- keep extra Qwen turns opt-in only, continue them in the same chat, and wait for assistant text to stabilize before reading it
- replace the local shell wrapper with the canonical repo-local `/ask-qwen` command in `.opencode/opencode.json`
- re-assert `Qwen3.6-Max-Preview` after each completed turn so the chat does not drift back to Plus
- include repository URLs, relevant file URLs, and curated official reference URLs in repo-aware Qwen prompts
- add persistent consult memory with `context_id`, `message_id`, and compact summaries for repo-aware sessions
- upgrade consult memory to a canonical `state_snapshot` envelope with decision history and metadata
- add a deterministic validator/critic pass that scores replies, flags violations, and strips fluff when appropriate
- add `modul-qwen-autotraining` and `cli-autotraining.js` for Qwen-guided self-improvement snapshots and suggestions
- add `lifecycle.js` for bounded graceful shutdown and resource cleanup across CLI/browser flows
- enforce the Qwen thinking selector onto `Denken` / `Thinking` before each send
- add external-project mode with `--project-root`, issue URLs, capability manifests, and private-repo attachment candidates
- prefer auto-attach to a reachable local CDP endpoint in the shared launcher to avoid Chrome profile-lock failures

## 0.1.0

- Initial standalone `coder-SIN-Qwen` repo scaffold
- UI-only Chrome Default-profile browser relay
- Git snapshot support
- `.qwenignore` filtering
- OpenCode `/ask-qwen` command integration
- install/test/build verification flow
- smoke check, JSONL logging, and ops/security docs
- preflight checks, selector regression tests, guarded merge helper
- live-run preparation and Infisical secret validation helpers
- corrected Chrome launch config for real Default-profile use
