# ADR-0004: Zero-Trust Secret Management

**Status:** Accepted (2026-04-28)
**Context:** Secrets (Qwen account credentials, API tokens) were managed via environment variables and `.env` files, creating risk of accidental exposure.
**Decision:** Implement zero-trust secret management via SecretClient. All secret access goes through a typed client that never logs values. Infisical is the canonical source in production; env vars are fallback for local dev.
**Implementation:** `packages/qwen-core/lib/secret-client.js` + `packages/qwen-core/secret-schema.js`
**Consequences:** + Secrets never logged, + Type-safe access, + Clear audit trail, - Requires Infisical setup for production
**Enforced by:** preflight.js secrets audit, `secrets-check.js` migrated to SecretClient
