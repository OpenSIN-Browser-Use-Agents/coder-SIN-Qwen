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
- runtime config validation for auth mode, session timeout, and CDP port bounds
- trace correlation via `SIN_CODER_QWEN_RUN_ID`, `SIN_CODER_QWEN_TRACE_ID`, and span metadata
- rate-limit cooldowns plus a circuit breaker stored in `artifacts/qwen-account-state.json`

## Main entrypoints

- `node ./index.js <prompt>`
- `pnpm run verify`
- `pnpm run ask`
- `/ask-qwen` through `.opencode/opencode.json`

## Important files

- `index.js`
- `browser.js`
- `context.js`
- `ignore-filter.js`
- `git.js`
- `verify.js`
- `public-task-file.js`
- `coder-sin-qwen-tasks/`

## Before changing behavior

1. Run `node ./verify.js`
2. Keep `browser.js` UI-only
3. Keep the repo self-contained
4. Update `README.md`, `INDEX.md`, `INSTALL.md`, and `HANDOFF.md` if workflow changes

## Notes

- Default profile path is resolved automatically per OS.
- The browser selectors are intentionally conservative and may need updates when Qwen UI changes.
- Attach mode now prefers reusing an existing blank tab and leaves the attached tab open.
- Attach mode now probes the live CDP endpoint before skipping cloned-profile existence checks, logs the decision, and fails fast if the endpoint is stale.
- Non-interactive Infisical sync now expects `INFISICAL_PROJECT_ID` when the repo is not linked with `infisical init`.
- Prompt delivery is now human-style text instead of a forced JSON-status instruction.
- Raw Qwen text is now the default CLI output; use `--json` only when machine-readable parsing is needed.
- The live browser flow now auto-selects `Qwen3.6-Max-Preview` before the first prompt.
- After each completed turn the relay re-asserts `Qwen3.6-Max-Preview` to keep the active chat visually pinned to the intended model.
- Before each prompt send the relay now also enforces the thinking selector to `Denken` / `Thinking`.
- Prompt injection now prefers keyboard-safe typing for short messages and a faster insert path for very long prompts to reduce cut-off risk.
- If Qwen lands on `/auth`, the relay now uses direct email/password login with Infisical-backed Qwen accounts only.
- Extra Qwen turns are opt-in only via `--turns 2+` and now stay in the same chat.
- Repo-aware prompts now include repository URLs, relevant file URLs, issue URLs, capability manifests, and curated official reference URLs for the detected stack; a ranked set of relevant local source files is uploaded for code turns, PDFs/text/logs can still be attached, but image files stay local-only, URL-bearing context is capped at 10 unique links by default (`SIN_CODER_QWEN_MAX_URLS` can raise it to 25), and decision history is trimmed to the last 2 relevant turns.
- Prompt shaping is now centralized in `prompt-builder.js`, which keeps repo-aware turns in a strict code-oriented schema before they reach Qwen.
- `context.urlAccessibility` now flips to `local_only` when repo/commit URLs fail verification, and `prompt-builder.js` suppresses URL blocks unless the context is verified public.
- When repo URLs are not public, the relay also writes a temporary Markdown task packet under `coder-sin-qwen-tasks/` and can publish it as a short-lived public GitHub Gist for Qwen.
- Repo-aware consults now persist `context_id`, `message_id`, and the latest compact summary in `.coder-sin-qwen-memory.json` (or `SIN_CODER_QWEN_MEMORY_FILE`), and `SIN_CODER_QWEN_SESSION_ID` now binds that memory to one browser tab/session.
- The consult memory now follows a canonical `state_snapshot` envelope (`protocolVersion`, `metadata`, `mandate`, `stateSnapshot`, `decisionHistory`, `constraints`, `completionCriteria`).
- Consult memory persistence now writes atomically, so interrupts and parallel exits do not leave `.coder-sin-qwen-memory.json` partially written.
- Repo-aware replies now flow through `validator.js`, which produces a deterministic review object (`pass`, `score`, `violations`, `retry_action`) before stdout/log persistence.
- Simple prompts are now normalized into a structured task message, and German repo-style prompts like `optimiere das projekt` should trigger repo context instead of raw passthrough.
- Wrapper prefixes like `/ask-qwen` are stripped before the prompt is sent to Qwen.
- CDP attach now sets `PW_CHROMIUM_DISABLE_DOWNLOAD_BEHAVIOR=1` so the browser can connect cleanly.
- The relay now waits for a stable non-empty assistant answer before reasserting model settings or ending the turn, and it fails closed when completion never stabilizes or the extracted reply looks truncated/broken instead of returning partial fallback text.
- The browser input boundary now strips `/ask-qwen`, rejects CLI artifacts, and truncates oversized prompts before typing into Qwen; JSONL logs record `prompt_truncated` when this happens.
- A local conversation-tree store now supports branch-based follow-up runs via `--branch <nodeId>` and prints via `--tree`; branch ancestry is expanded into the final prompt before the browser send step.
- Tree printing now marks the active path and latest node explicitly, and JSON output includes branch path/history metadata so downstream tooling can continue from the correct node without reparsing the tree file.
- `--checkout` now persists a local active conversation node for future runs, and `--prepare-commit` stages the repo plus prints a commit-ready diff summary without creating a commit.
- Runtime validation rejects unsupported auth modes and invalid session/port/rate-limit settings before browser work begins.
- Auth fallback and model-pinning failures now emit structured JSONL events before throwing so selector drift is easier to audit.
- Trace context is auto-generated once per run and written into logs, smoke output, consult memory, autotraining snapshots, and the session-binding marker used to isolate parallel agents.
- Rate-limit failures update the account state file with cooldown timestamps and open a circuit breaker after repeated hits.
- `modul-qwen-autotraining.js` now builds snapshot/suggestion artifacts for Qwen-guided self-improvement and persists them to `.coder-sin-qwen-autotraining.jsonl` (or `SIN_CODER_QWEN_AUTOTRAINING_FILE`).
- `lifecycle.js` now owns bounded graceful cleanup for registered resources such as browser sessions and CLI signal handling.
- The parser still prefers the final assistant JSON payload over echoed prompt JSON from the page body.
- Resolved milestones: `#1 Stabilize ask-qwen wrapper execution`, `#2 Support real multi-turn Qwen conversations`, `#3 Keep Max Preview pinned after each turn`.
- The repo-local OpenCode config now defines the canonical `/ask-qwen` command and the `coder-SIN-Qwen` agent directly in `.opencode/opencode.json` so the shell wrapper is no longer required.
- The global OpenCode config now uses a portable launcher plus `--project-root "$PWD"`, so external repos do not accidentally send coder-SIN-Qwen's own repo context to Qwen.
- The shared global launcher now auto-detects a reachable local CDP endpoint before attempting browser launch, preventing the profile-lock failure seen when Chrome is already running.
- CDP reachability now goes through one bounded probe helper so stale ports fail fast across both attach-mode checks and sidecar recovery.
- The only allowed attach order is the prepared sidecar CDP endpoint on `9444` (or the configured sidecar port).
- The sidecar recovery launch now uses the Chrome binary directly, seeds the cloned profile's startup URLs, suppresses crash-restore behavior, and opens the configured Qwen URL directly so fallback windows land in chat immediately.
- The Chrome launch args now also suppress the search-engine-choice screen so startup stays deterministic on recent Chrome builds.
- The only allowed browser path is the fallback sidecar CDP attach; the relay prepares it automatically and keeps the browser open.
- `--smoke-live` now reuses the same recovery path as normal runs, so it can validate the recovered auth/session path instead of failing on a locked Default profile.

## Research note: blank startup windows

- macOS `open` goes through LaunchServices; `-n` only forces a new instance, while `--args` just forwards argv to the app entrypoint. That means Chrome startup can still be shaped by macOS resume/session behavior, not just the URL argument.
- Chromium startup code reads profile prefs like `restore_on_startup` and `startup_urls`, and Chrome Enterprise documents `RestoreOnStartupURLs` as the startup-URL source. If that state is blank, stale, or crash-restored, Chrome can still surface a blank/new-tab window.
- Practical takeaway: never use `open -na` / blank-tab startup. Always use the prepared sidecar CDP attach path.

Sources:
- Apple Launch Services docs: https://developer.apple.com/library/archive/documentation/Carbon/Conceptual/LaunchServicesConcepts/LSCTasks/LSCTasks.html
- macOS `open(1)` behavior summary: https://www.unix.com/man-page/osx/1/open?os=osx&section=1&query=open
- Chromium startup prefs: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/prefs/session_startup_pref.cc
- Chrome Enterprise startup URLs policy: https://chromeenterprise.google/intl/en_au/policies/restore-on-startup-ur-ls/
