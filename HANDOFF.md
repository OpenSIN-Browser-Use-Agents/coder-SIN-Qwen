# Hand-off for Future OpenCode Agents

## Repo purpose

`coder-SIN-Qwen` is a standalone OpenCode agent repo that relays tasks to Qwen through the local Chrome `Default` profile.

## Current guarantees

- UI-only browser flow
- no API fallback
- strict Chrome profile use via `CHROME_PROFILE`
- optional `--snapshot` Git safety
- optional `--dry-run`
- `.qwenignore` token filtering

## Main entrypoints

- `node ./index.js <prompt>`
- `npm run verify`
- `npm run ask`
- `/ask-qwen` through `.opencode/opencode.json`

## Important files

- `index.js`
- `browser.js`
- `context.js`
- `ignore-filter.js`
- `git.js`
- `verify.js`

## Before changing behavior

1. Run `node ./verify.js`
2. Keep `browser.js` UI-only
3. Keep the repo self-contained
4. Update `README.md`, `INDEX.md`, and `INSTALL.md` if workflow changes

## Notes

- Default profile path is resolved automatically per OS.
- The browser selectors are intentionally conservative and may need updates when Qwen UI changes.
- Attach mode now prefers reusing an existing blank tab and leaves the attached tab open.
- Non-interactive Infisical sync now expects `INFISICAL_PROJECT_ID` when the repo is not linked with `infisical init`.
- Prompt delivery is now human-style text instead of a forced JSON-status instruction.
- Raw Qwen text is now the default CLI output; use `--json` only when machine-readable parsing is needed.
- The live browser flow now auto-selects `Qwen3.6-Max-Preview` before the first prompt.
- After each completed turn the relay re-asserts `Qwen3.6-Max-Preview` to keep the active chat visually pinned to the intended model.
- Before each prompt send the relay now also enforces the thinking selector to `Denken` / `Thinking`.
- If Qwen lands on `/auth`, the relay now attempts the controlled Google-login fallback selectors before giving up.
- Extra Qwen turns are opt-in only via `--turns 2+` and now stay in the same chat.
- Repo-aware prompts now include repository URLs, relevant file URLs, issue URLs, capability manifests, and curated official reference URLs for the detected stack.
- Repo-aware consults now persist `context_id`, `message_id`, and the latest compact summary in `.coder-sin-qwen-memory.json` (or `SIN_CODER_QWEN_MEMORY_FILE`).
- The consult memory now follows a canonical `state_snapshot` envelope (`protocolVersion`, `metadata`, `mandate`, `stateSnapshot`, `decisionHistory`, `constraints`, `completionCriteria`).
- Repo-aware replies now flow through `validator.js`, which produces a deterministic review object (`pass`, `score`, `violations`, `retry_action`) before stdout/log persistence.
- `modul-qwen-autotraining.js` now builds snapshot/suggestion artifacts for Qwen-guided self-improvement and persists them to `.coder-sin-qwen-autotraining.jsonl` (or `SIN_CODER_QWEN_AUTOTRAINING_FILE`).
- `lifecycle.js` now owns bounded graceful cleanup for registered resources such as browser sessions and CLI signal handling.
- The parser still prefers the final assistant JSON payload over echoed prompt JSON from the page body.
- Resolved milestones: `#1 Stabilize ask-qwen wrapper execution`, `#2 Support real multi-turn Qwen conversations`, `#3 Keep Max Preview pinned after each turn`.
- The repo-local OpenCode config now defines the canonical `/ask-qwen` command and the `coder-SIN-Qwen` agent directly in `.opencode/opencode.json` so the shell wrapper is no longer required.
- The global OpenCode config now uses a portable launcher plus `--project-root "$PWD"`, so external repos do not accidentally send coder-SIN-Qwen's own repo context to Qwen.
- The shared global launcher now auto-detects a reachable local CDP endpoint before attempting browser launch, preventing the profile-lock failure seen when Chrome is already running.
- The preferred attach order is now the real Default-profile path on `9335` first, with the `9444` sidecar kept only as a fallback.
- The sidecar recovery launch now opens the configured Qwen URL directly so fallback windows do not sit on `about:blank`.
