# ADR-0001: UI Automation over API

**Status:** Accepted (2026-04-22)
**Context:** The project needed to interact with Qwen's language model. Two options existed: use the official API or automate the browser UI.
**Decision:** Use browser UI automation. Qwen's web UI provides access to features not available via API (thinking mode, model selection, conversation history). The UI-first approach allows full feature access without depending on API availability or rate limits.
**Consequences:** + Full feature access, + No API dependency, - Fragile to UI changes, - Requires Chrome + profile
**Mitigations:** Selector resilience chains (#26), self-healing recovery (#29), DOM hash drift detection
