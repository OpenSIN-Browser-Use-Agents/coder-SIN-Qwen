# Changelog

## Unreleased

- fixed Qwen send-button detection for the current web UI
- reduced context noise by excluding sidecar/artifact directories from `.qwenignore`
- taught the parser to prefer the final assistant JSON over echoed prompt JSON
- removed the forced `End with {"status":"draft"|"final"}` suffix so Qwen receives a normal message
- switched the default CLI output to raw Qwen text and added explicit `--json` mode
- auto-select `Qwen3.6-Max-Preview` before sending live prompts
- keep extra Qwen turns opt-in only, continue them in the same chat, and wait for assistant text to stabilize before reading it
- replace the local shell wrapper with repo-local OpenCode command templates in `.opencode/opencode.json`
- re-assert `Qwen3.6-Max-Preview` after each completed turn so the chat does not drift back to Plus

## 0.1.0

- Initial standalone `omo-SIN-Qwen` repo scaffold
- UI-only Chrome Default-profile browser relay
- Git snapshot support
- `.qwenignore` filtering
- OpenCode `/ask-qwen` command integration
- install/test/build verification flow
- smoke check, JSONL logging, and ops/security docs
- preflight checks, selector regression tests, guarded merge helper
- live-run preparation and Infisical secret validation helpers
- corrected Chrome launch config for real Default-profile use
