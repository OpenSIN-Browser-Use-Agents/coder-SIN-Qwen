# coder-SIN-Qwen Index

## What this repo is

`coder-SIN-Qwen` is a standalone relay proxy that sends project context to Qwen via Chrome browser UI automation and returns the answer. No API key needed.

## Quick Links

| Resource     | Path                                         |
| :----------- | :------------------------------------------- |
| README       | [README.md](README.md)                       |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| ADRs         | [docs/adr/](docs/adr/)                       |
| Installation | [INSTALL.md](INSTALL.md)                     |
| Operations   | [OPS.md](OPS.md)                             |
| Security     | [SECURITY.md](SECURITY.md)                   |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md)           |
| Agent Rules  | [AGENTS.md](AGENTS.md)                       |
| Changelog    | [CHANGELOG.md](CHANGELOG.md)                 |

## Project Structure

```
coder-SIN-Qwen/
├── index.js                    # CLI Entrypoint
├── browser.js                  # Playwright session
├── preflight.js                # Env & dep gate
├── cli-autotraining.js         # Self-improvement
├── push-secrets.js             # Infisical push
├── verify.js                   # Install/test/build gate
├── smoke.js                    # Readiness check
├── restore.js                  # Rollback
├── qwen-account-rotation.js    # Account rotation
├── public-task-file.js         # Task packet writer
├── packages/qwen-core/         # Shared library
│   ├── index.js                # Barrel exports
│   ├── context.js              # Context collection
│   ├── prompt-builder.js       # Prompt shaping
│   ├── validator.js            # Response validation
│   ├── lifecycle.js            # Resource cleanup
│   ├── trace.js                # Observability
│   ├── parser.js               # Response parsing
│   ├── conversation-tree.js    # Branching store
│   ├── secrets-check.js        # Secret validation
│   ├── browser-hardening.js    # UI interaction
│   ├── runtime-config.js       # Config validation
│   ├── logger.js               # JSONL logging
│   ├── ignore-filter.js        # .qwenignore filtering
│   ├── circuit-breaker.js      # Rate limit backoff
│   ├── consult-memory.js       # Consult persistence
│   ├── secret-schema.js        # Secret schema
│   └── lib/                    # Internal utilities
│       ├── secret-client.js    # Zero-trust secrets
│       ├── selector-chain.js   # DOM selector engine
│       ├── selector-resolver.js# Adaptive resolution
│       ├── browser-state-machine.js  # 9-state FSM
│       ├── dom-hash.js         # DOM drift detection
│       ├── recovery-playbook.js# 6 playbooks
│       ├── self-heal.js        # Recovery orchestrator
│       ├── context-compressor.js# Compression pipeline
│       ├── token-budget.js     # Budget allocation
│       ├── relevance-scorer.js # TF-IDF scoring
│       ├── structured-log.js   # Observability 2.0
│       ├── dom-snapshot.js     # HTML snapshots
│       ├── async-event-loop.js # Task queue
│       ├── ephemeral-profile.js# Session isolation
│       ├── attachment-hardening.js # File validation
│       ├── memory-writer.js    # Atomic file writes
│       ├── prompt-guard.js     # Length enforcement
│       ├── wait-for-completion.js # Stability check
│       ├── cdp-probe.js        # CDP health check
│       ├── conversation-tree-cli.js # Tree CLI
│       └── git-prepare.js      # Commit prep
├── apps/qwen-connector/        # CLI wrapper
├── test/                       # 200+ tests
├── docs/
│   ├── adr/                    # 5 ADRs
│   └── architecture.md         # Full design docs
├── plans/                      # 14 plans
├── scripts/                    # Shell helpers
├── .github/workflows/          # CI pipeline
├── Dockerfile / docker-compose.yml
├── tsconfig.json               # TypeScript config
├── llms.txt / llms-full.txt    # AI discoverability
└── pnpm-lock.yaml / turbo.json
```

## Key Scripts

| Command                  | Purpose                    |
| :----------------------- | :------------------------- |
| `pnpm run ask`           | Run the CLI (basic prompt) |
| `pnpm run ask:json`      | CLI with JSON output       |
| `pnpm test`              | Run all tests              |
| `pnpm run typecheck`     | TypeScript check           |
| `pnpm run coverage`      | Coverage report            |
| `pnpm run verify`        | Full verification          |
| `pnpm run preflight`     | Env & dep checks           |
| `pnpm run smoke`         | Readiness check            |
| `pnpm run secrets:check` | Validate secrets           |

## OpenCode

Use the repo-local `./.opencode/opencode.json` config for `/ask-qwen` and the `coder-SIN-Qwen` agent entry.

## Project Status

- ✅ 200+ tests (property-based + integration + unit)
- ✅ 21+ modules in packages/qwen-core/
- ✅ 14 implementation plans in plans/
- ✅ 5 ADRs in docs/adr/
- ✅ TypeScript-ready (strict mode, 0 errors)
- ✅ Docker + docker-compose support
- ✅ llms.txt for AI discoverability
