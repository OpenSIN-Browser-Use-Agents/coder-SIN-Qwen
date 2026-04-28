# ADR-0005: Conversation Tree as Local File-Backed Store

**Status:** Accepted (2026-04-25)
**Context:** Multi-turn conversations need to persist across CLI invocations. Options: in-memory only, database, local JSON file.
**Decision:** Use a local JSON file (`.coder-sin-qwen-conversations.json`) as the conversation store. The tree structure allows branching from any earlier node. File-backed means no external database, no network dependency.
**Implementation:** `conversation-tree.js` + `conversation-tree-store.js` in `packages/qwen-core/`
**Consequences:** + Portable (single file), + No DB setup, + Supports branching, - Not suitable for concurrent access, - No query capabilities
**CLI flags:** `--branch`, `--tree`, `--checkout`
