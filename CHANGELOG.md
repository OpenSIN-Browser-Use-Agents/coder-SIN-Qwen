# Changelog

## Unreleased

- fixed Qwen send-button detection for the current web UI
- reduced context noise by excluding sidecar/artifact directories from `.qwenignore`
- taught the parser to prefer the final assistant JSON over echoed prompt JSON
- removed the forced `End with {"status":"draft"|"final"}` suffix so Qwen receives a normal message
- switched the default CLI output to raw Qwen text and added explicit `--json` mode
- auto-select `Qwen3.6-Max-Preview` before sending live prompts

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
