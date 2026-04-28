# Changelog

## [Unreleased]

### Added

- **Monorepo migration complete** — all shared modules now live in `packages/qwen-core/`:
  - `context.js`, `ignore-filter.js`, `circuit-breaker.js`, `logger.js`, `runtime-config.js`, `trace.js`, `browser-hardening.js`, `prompt-builder.js` (Phase 1)
  - `parser.js`, `validator.js`, `lifecycle.js`, `conversation-tree.js`, `secrets-check.js`, `conversation-tree-store.js`, `consult-memory.js` (Phase 2)
  - `lib/memory-writer.js`, `lib/prompt-guard.js`, `lib/wait-for-completion.js`, `lib/cdp-probe.js`, `lib/conversation-tree-cli.js`, `lib/git-prepare.js` (Phase 2)
- **pnpm workspace** — replaced `package-lock.json` with `pnpm-lock.yaml`, set `packageManager: pnpm@10.0.0`
- **CI updated** — `.github/workflows/ci.yml` and `release.yml` now use `pnpm/action-setup@v4` + `ppnpm install --frozen-lockfile` instead of `ppnpm install --frozen-lockfile`
- **Barrel exports** — `packages/qwen-core/index.js` re-exports all public modules; `packages/qwen-core/package.json` exposes `./lib/*` subpath

### Removed

- Root duplicates deleted: `parser.js`, `validator.js`, `lifecycle.js`, `conversation-tree.js`, `secrets-check.js`, `conversation-tree-store.js`, `consult-memory.js`, `logger.js`, `runtime-config.js`, `trace.js`, `browser-hardening.js`, `prompt-builder.js`, `ignore-filter.js`, `circuit-breaker.js`, `context.js`
- Root `lib/` directory deleted (all files moved to `packages/qwen-core/lib/`)
- `package-lock.json` deleted in favor of `pnpm-lock.yaml`

### Fixed

- **Long-prompt relay failure** — prompts exceeding ~430 characters silently failed with "(no output)" because `page.keyboard.insertText()` bypasses React's synthetic event system. The Qwen textarea never registered the text, so Enter didn't submit. Three-layer fix:
  1. `browser-hardening.js`: `triggerReactCompatibleEvents()` now dispatches `input` and `change` events on the textarea after `insertText`, so React picks up the value change.
  2. `browser.js` `enterPrompt()`: `verifyReactInputRegistration()` checks whether the React app actually registered the text after `safeInjectInput` returns. If not, falls through to `input.fill()` which Playwright handles with proper React event dispatch.
  3. `browser.js` `submitPrompt()`: Added a final `input.fill()` + Enter fallback after send-button click attempt, so even if all earlier paths fail, the prompt still gets submitted.
- **`maxSequentialMs` raised from 12s to 30s** — `pressSequentially` (character-by-character typing) is the most reliable path because each keystroke fires React-compatible keyboard events. The old 12s ceiling was too low for typical relay prompts (~430 chars × 28ms = 12s). 30s allows ~1070 chars before falling back to `insertText`.
- **`SELECTORS.sendButton` updated** — added `div.chat-prompt-send-button button` as the primary send button selector (confirmed from public Qwen automation code). The old selectors (`.send-button`, `button[type="submit"]`, etc.) matched 0 elements in the current Qwen Studio UI.
- **`SELECTORS.assistantOutput` updated** — added `.chat-container-statement .markdown-prose` and `.markdown-prose` as fallback selectors for Qwen's assistant response containers.
- **`SELECTORS.newChat` updated** — added `div.sidebar-side-fold-container-open` for opening a collapsed sidebar before clicking the new-chat button.
- **`submitPrompt()` send button locator** — changed from hardcoded `page.locator('button.send-button')` to `page.locator('div.chat-prompt-send-button').locator('button')`, matching the actual Qwen Studio DOM structure.

### Added

- **Circuit breaker for GitHub API calls** — added `circuit-breaker.js` with exponential backoff and jitter to prevent cascading failures when publishing temporary public task files to GitHub Gists. Integrated into `public-task-file.js` for both gist creation and deletion operations.

### Removed

- **Garbage test nodes** — cleaned 2 stale smoke-test entries from `.coder-sin-qwen-conversations.json` that were inflating the root's child count without real conversation content.

### Added (from PR #21 — sidecar auth repair)

- repair sidecar attach auth flow and ban broken browser startups
- browser hardening helpers for safe prompt injection and click guards
- Qwen account rotation with Infisical-backed credential cycling
- sidecar CDP attach as the only supported runtime browser path
- fail-fast CDP recovery when no live endpoint can be established
- direct email/password Qwen auth with account rotation only
- auto-attach to reachable local CDP endpoint in shared launcher
- enforce Qwen thinking selector before each send
- keyboard-safe prompt injection with faster insert fallback for long prompts
- persistent consult memory with `context_id`, `message_id`, and compact summaries
- deterministic validator/critic pass that scores replies and strips fluff
- `modul-qwen-autotraining` and `cli-autotraining.js` for Qwen-guided self-improvement
- `lifecycle.js` for bounded graceful shutdown and resource cleanup
- external-project mode with `--project-root`, issue URLs, and capability manifests
- conversation tree with local file-backed branching and `--tree`/`--branch`/`--checkout` CLI
- `--prepare-commit` for staging changes without creating a commit
- trace context with `runId`, `traceId`, `spanId` correlation across logs and snapshots
- public task file with temporary GitHub Gist publishing for private repos
- prompt builder for centralized repo-aware turn construction

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
