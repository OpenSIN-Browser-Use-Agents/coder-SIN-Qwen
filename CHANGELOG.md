# Changelog

## [Unreleased]

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

- **Conversation tree branch spawning** — same-session turns now append to the same branch instead of creating new children of root. `appendTurn()` in `conversation-tree-store.js` checks `sessionId` from metadata and finds the latest node with that session as the parent. This prevents "branch wastelands" where every relay call spawned a new root child. (Issue #17)
- **`index.js` branch resolution** — `appendTurn()` now receives `resolvedBranchId` (which includes `tree.activeId`) instead of raw `branchId`, so the already-resolved active branch is used as the parent when no explicit `--branch` flag is provided.
- **`setActiveNode` condition** — changed from `Boolean(!branchId && tree?.activeId)` to `Boolean(tree)` so new nodes always become active when a tree exists, not only when `branchId` is falsy.
- **PCPM project ID** — renamed from `omo-SIN-Qwen` to `coder-SIN-Qwen` across hooks, config, and AGENTS.md.

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
