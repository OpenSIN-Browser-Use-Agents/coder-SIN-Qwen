# Changelog

## [Unreleased]

### Fixed

- **Conversation tree branch spawning** — same-session turns now append to the same branch instead of creating new children of root. `appendTurn()` in `conversation-tree-store.js` checks `sessionId` from metadata and finds the latest node with that session as the parent. This prevents "branch wastelands" where every relay call spawned a new root child. (Issue #17)
- **`index.js` branch resolution** — `appendTurn()` now receives `resolvedBranchId` (which includes `tree.activeId`) instead of raw `branchId`, so the already-resolved active branch is used as the parent when no explicit `--branch` flag is provided.
- **`setActiveNode` condition** — changed from `Boolean(!branchId && tree?.activeId)` to `Boolean(tree)` so new nodes always become active when a tree exists, not only when `branchId` is falsy.
- **PCPM project ID** — renamed from `omo-SIN-Qwen` to `coder-SIN-Qwen` across hooks, config, and AGENTS.md.

### Removed

- **Garbage test nodes** — cleaned 2 stale smoke-test entries from `.coder-sin-qwen-conversations.json` that were inflating the root's child count without real conversation content.
