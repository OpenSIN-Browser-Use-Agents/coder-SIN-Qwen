# ADR-0003: pnpm + Turborepo Monorepo

**Status:** Accepted (2026-04-28)
**Context:** The project grew beyond a single file. Shared modules needed to be organized for maintainability, and the CI pipeline needed efficient caching.
**Decision:** Use pnpm workspaces + Turborepo. pnpm provides strict dependency isolation and disk-efficient storage. Turbo provides task orchestration with caching.
**Structure:** `apps/` for deployable applications, `packages/qwen-core/` for shared libraries, `packages/qwen-core/lib/` for internal utilities.
**Consequences:** + Strict module boundaries, + Parallel CI builds, + Cache-efficient, - Learning curve for pnpm/Turbo
**Package manager:** pnpm@10.0.0, enforced via `package.json` `packageManager` field
