<a name="readme-top"></a>

<p align="center">
  <img src="https://img.shields.io/badge/coder--SIN--Qwen-🤖_Relay_Proxy-7B3FE4?style=for-the-badge" alt="coder-SIN-Qwen" width="480" />
</p>

<p align="center">
  <a href="https://github.com/OpenSIN-Browser-Use-Agents/coder-SIN-Qwen/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
  </a>
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/node.js-20+-339933?logo=node.js&logoColor=white" alt="Node.js" />
  </a>
  <a href="https://github.com/OpenSIN-Browser-Use-Agents/coder-SIN-Qwen/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/OpenSIN-Browser-Use-Agents/coder-SIN-Qwen/ci.yml?label=CI&logo=github" alt="CI" />
  </a>
  <a href="https://qwen.ai">
    <img src="https://img.shields.io/badge/Qwen-UI_Automation-068A0A?logo=quora&logoColor=white" alt="Qwen" />
  </a>
  <a href="https://opensin.ai">
    <img src="https://img.shields.io/badge/OpenSIN--AI-Agent_Fleet-7B3FE4?logo=github&logoColor=white" alt="OpenSIN-AI" />
  </a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#features">Features</a> ·
  <a href="#cli-commands">Commands</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

> **Ask Qwen anything about your code — without leaving your terminal.**
> coder-SIN-Qwen is a standalone relay proxy that collects local project context, sends it to Qwen via browser UI automation, and returns the answer. No API key needed — just Chrome and a Qwen account.

---

## Quick Start

<table>
<tr>
<td width="33%" align="center">
<strong>1. Clone</strong><br/><br/>
<code>git clone https://github.com/OpenSIN-Browser-Use-Agents/coder-SIN-Qwen.git</code><br/><br/>
<img src="https://img.shields.io/badge/⏱️_30s-blue?style=flat" />
</td>
<td width="33%" align="center">
<strong>2. Install</strong><br/><br/>
<code>pnpm install</code><br/><br/>
<img src="https://img.shields.io/badge/⏱️_30s-blue?style=flat" />
</td>
<td width="33%" align="center">
<strong>3. Ask Qwen</strong><br/><br/>
<code>node ./index.js "Review this repo"</code><br/><br/>
<img src="https://img.shields.io/badge/⏱️_Go!-green?style=flat" />
</td>
</tr>
</table>

> [!TIP]
> No API key needed. Requires Chrome + Qwen account. Set `CHROME_CDP_URL` or let the sidecar handle it.

---

## Architecture

```mermaid
flowchart TB
    subgraph CLI["CLI Layer"]
        direction LR
        CLI["index.js<br/>CLI Entrypoint"]
        PRE["preflight.js<br/>Env & Dep Checks"]
        SMOKE["smoke.js<br/>Readiness Check"]
    end

    subgraph Core["packages/qwen-core"]
        direction LR
        CTX["context.js<br/>Context Collector"]
        PB["prompt-builder.js<br/>Prompt Shaping"]
        VAL["validator.js<br/>Response Validator"]
        BR["browser-hardening.js<br/>UI Hardening"]
        LC["lifecycle.js<br/>Resource Manager"]
        TR["trace.js<br/>Observability"]
        CONV["conversation-tree.js<br/>Branching Store"]
    end

    subgraph Lib["packages/qwen-core/lib"]
        direction LR
        SC["secret-client.js<br/>Zero-Trust Secrets"]
        SM["browser-state-machine.js<br/>9-State Machine"]
        SH["self-heal.js<br/>Recovery Playbooks"]
        CR["context-compressor.js<br/>Token Budget"]
        EL["async-event-loop.js<br/>Task Queue"]
        SL["structured-log.js<br/>Observability 2.0"]
    end

    subgraph Browser["Browser Automation"]
        B["browser.js<br/>Playwright Session"]
        CDP["CDP Sidecar<br/>Chrome Debug"]
        Q["chat.qwen.ai<br/>Qwen UI"]
    end

    CLI --> Core
    Core --> Lib
    Core --> B
    B --> CDP
    CDP --> Q

    classDef cliClass fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef coreClass fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef libClass fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef browserClass fill:#fce4ec,stroke:#880e4f,stroke-width:2px

    class CLI,PRE,SMOKE cliClass
    class CTX,PB,VAL,BR,LC,TR,CONV coreClass
    class SC,SM,SH,CR,EL,SL libClass
    class B,CDP,Q browserClass
```

<p align="center">
  <sub>Full architecture details in <a href="docs/architecture.md">docs/architecture.md</a></sub>
</p>

---

## Features

| Capability               | Description                                                | Status |
| :----------------------- | :--------------------------------------------------------- | :----: |
| **Qwen Relay**           | Send code context to Qwen via browser UI automation        |   ✅   |
| **Zero API Keys**        | No API key needed — uses real Qwen web UI                  |   ✅   |
| **Conversation Tree**    | Persistent branching, `--branch`/`--tree`/`--checkout`     |   ✅   |
| **Account Rotation**     | 3+ Qwen accounts with cooldown + circuit breaker           |   ✅   |
| **Self-Healing**         | DOM drift detection, recovery playbooks, 6 error scenarios |   ✅   |
| **State Machine**        | 9-state browser lifecycle with event-driven sync           |   ✅   |
| **SecretClient**         | Zero-trust secret management, never logs values            |   ✅   |
| **Context Compression**  | Token budget manager + relevance scoring (TF-IDF)          |   ✅   |
| **Observability 2.0**    | Structured logging with step IDs, DOM snapshots            |   ✅   |
| **Async CLI**            | Task queue with timeout, progress spinner                  |   ✅   |
| **Attachment Hardening** | Size validation, MIME checks, upload retry                 |   ✅   |
| **Test Pyramid**         | 200+ tests, property-based + integration + unit            |   ✅   |
| **TypeScript Ready**     | `tsconfig.json` with strict mode, 0 type errors            |   ✅   |
| **ADRs**                 | 5 architecture decision records in `docs/adr/`             |   ✅   |

---

## Use Cases

| Who                | Problem                            | Solution                                   |
| :----------------- | :--------------------------------- | :----------------------------------------- |
| **Developer**      | Need code review but no API budget | Relay context to Qwen's free UI            |
| **OpenCode Agent** | Needs Qwen consultation mid-task   | `/ask-qwen` command → structured reply     |
| **DevOps**         | Automate code analysis in CI       | `--json` mode for machine-readable output  |
| **Researcher**     | Compare model outputs iteratively  | Conversation tree with branching           |
| **Team Lead**      | Audit code quality at scale        | Autotraining snapshots + trace correlation |

---

## CLI Commands

<details>
<summary>🔍 Ask Qwen (Core Relay)</summary>

```bash
# Basic prompt
node ./index.js "Review the error handling in this repo"

# Machine-readable JSON output
node ./index.js --json "List all exported functions"

# Multi-turn conversation
node ./index.js --turns 2 "Design the next feature"

# Dry-run (no browser)
node ./index.js --dry-run "What context would you send?"
```

</details>

<details>
<summary>🌳 Conversation Tree</summary>

```bash
# Print current tree
node ./index.js --tree

# Branch from specific node
node ./index.js --branch <node-id> "Refine this branch"

# Switch active branch
node ./index.js --checkout <node-id>
node ./index.js --checkout latest
node ./index.js --checkout none

# Prepare commit (dry-run)
node ./index.js --prepare-commit --dry-run
```

</details>

<details>
<summary>🧪 Validation & Smoke</summary>

```bash
# Full test suite
pnpm test

# Preflight checks
node ./preflight.js

# Smoke tests
pnpm run smoke
pnpm run smoke:live

# Coverage report
pnpm run coverage
```

</details>

<details>
<summary>🔐 Secrets & Auth</summary>

```bash
# Validate secrets
pnpm run secrets:check

# Pull from Infisical
pnpm run secrets:pull

# Push to Infisical
pnpm run secrets:push

# CDP sidecar
pnpm run cdp:start
pnpm run cdp:status
```

</details>

<details>
<summary>🔄 Release & Merge</summary>

```bash
# Merge to main (requires ALLOW_GH_MERGE=1)
pnpm run merge:main

# Release
pnpm run release:patch
pnpm run release:minor
pnpm run release:major

# Verify after changes
node ./verify.js
```

</details>

---

## Project Structure

```
coder-SIN-Qwen/
├── index.js                    # CLI Entrypoint
├── browser.js                  # Playwright browser session
├── preflight.js                # Env & dependency gate
├── cli-autotraining.js         # Self-improvement engine
├── push-secrets.js             # Infisical push helper
├── verify.js                   # Install/test/build gate
├── smoke.js                    # Readiness check
├── restore.js                  # Rollback helper
├── packages/
│   └── qwen-core/              # 📦 Shared library (21+ modules)
│       ├── index.js            # Barrel exports
│       ├── context.js          # Context collector
│       ├── prompt-builder.js   # Prompt shaping
│       ├── validator.js        # Response validator
│       ├── lifecycle.js        # Resource cleanup
│       ├── trace.js            # Observability
│       ├── conversation-tree.js # Branching store
│       ├── secret-schema.js    # Secret schema
│       └── lib/                # Internal utilities
│           ├── secret-client.js    # SecretClient
│           ├── selector-chain.js   # DOM selector engine
│           ├── browser-state-machine.js  # 9-state FSM
│           ├── self-heal.js         # Recovery playbooks
│           ├── dom-hash.js          # DOM drift detection
│           ├── context-compressor.js # Token budgeting
│           ├── structured-log.js    # Observability 2.0
│           ├── async-event-loop.js  # Task queue
│           ├── ephemeral-profile.js # Session isolation
│           └── attachment-hardening.js # File validation
├── apps/qwen-connector/        # CLI package wrapper
├── test/                       # 200+ tests
├── docs/
│   ├── adr/                    # 5 ADRs
│   └── architecture.md         # Full design docs
├── plans/                      # 14 implementation plans
├── scripts/                    # Shell helpers
├── .github/workflows/ci.yml    # CI pipeline
├── Dockerfile                  # Container support
├── docker-compose.yml          # Dev environment
├── tsconfig.json               # TypeScript config
├── pnpm-lock.yaml              # Lockfile
└── turbo.json                  # Task orchestration
```

---

## Configuration

<details>
<summary>📋 Environment Variables</summary>

| Variable                            | Default                | Description                  |
| :---------------------------------- | :--------------------- | :--------------------------- |
| `QWEN_URL`                          | `https://chat.qwen.ai` | Qwen chat URL                |
| `QWEN_AUTH_METHOD`                  | `email_password`       | Auth mode (locked)           |
| `CHROME_CDP_URL`                    | —                      | CDP endpoint for attach mode |
| `CHROME_REMOTE_DEBUGGING_PORT`      | `9444`                 | Sidecar CDP port             |
| `CHROME_PROFILE`                    | —                      | Chrome profile path          |
| `QWEN_ACCOUNT_ORDER`                | —                      | Account rotation order       |
| `QWEN_ACCOUNT_1_EMAIL`              | —                      | Account 1 email              |
| `QWEN_ACCOUNT_1_PASSWORD`           | —                      | Account 1 password           |
| `SIN_CODER_QWEN_DRY_RUN`            | `0`                    | Skip browser automation      |
| `SIN_CODER_QWEN_LOG_FILE`           | —                      | JSONL log path               |
| `SIN_CODER_QWEN_ARTIFACT_DIR`       | `artifacts/`           | Screenshot output            |
| `SIN_CODER_QWEN_MAX_PROMPT_LENGTH`  | `12000`                | Max prompt chars             |
| `SIN_CODER_QWEN_SESSION_TIMEOUT_MS` | —                      | Browser timeout              |
| `INFISICAL_PROJECT_ID`              | —                      | Infisical project ID         |
| `GH_TOKEN`                          | —                      | GitHub token                 |

</details>

<details>
<summary>📁 Key Files</summary>

| File                                 | Purpose                     |
| :----------------------------------- | :-------------------------- |
| `.qwenignore`                        | Token-saving context filter |
| `.coder-sin-qwen-memory.json`        | Consult memory store        |
| `.coder-sin-qwen-conversations.json` | Conversation tree store     |
| `secrets.required.json`              | Secret validation spec      |
| `coder-sin-qwen-tasks/`              | Task packet workspace       |

</details>

---

## Browser Setup

The relay uses **sidecar CDP attach** as the only supported browser path:

```bash
# Start the CDP sidecar
export CHROME_REMOTE_DEBUGGING_PORT="9444"
pnpm run cdp:start
export CHROME_CDP_URL="http://127.0.0.1:9444"

# Run with live browser
node ./index.js --smoke-live
```

> [!IMPORTANT]
> No direct browser launches. The sidecar attaches to your Chrome via CDP. Close other Chrome instances first to avoid profile locks.

---

## OpenCode Integration

```json
// .opencode/opencode.json
{
  "commands": {
    "ask-qwen": {
      "command": "node ./index.js --turns 1 --json \"$ARGUMENTS\""
    }
  }
}
```

Run `/ask-qwen` from any OpenCode session to consult Qwen without leaving your workflow.

---

## Development

```bash
# Install
pnpm install

# Run tests
pnpm test

# TypeScript check
pnpm run typecheck

# Coverage
pnpm run coverage

# Build
pnpm run build

# Full verification
node ./verify.js
```

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Run tests (`pnpm test`)
4. Commit (`git commit -m 'feat: add amazing feature'`)
5. Push (`git push origin feature/amazing`)
6. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for more information.

---

<p align="center">
  <a href="https://opensin.ai">
    <img src="https://img.shields.io/badge/🤖_Powered_by-OpenSIN--AI-7B3FE4?style=for-the-badge&logo=github&logoColor=white" alt="Powered by OpenSIN-AI" />
  </a>
</p>

<p align="center">
  <sub>Entwickelt vom <a href="https://opensin.ai"><strong>OpenSIN-AI</strong></a> Ökosystem – Enterprise AI Agents die autonom arbeiten.</sub><br/>
  <sub>🌐 <a href="https://opensin.ai">opensin.ai</a> · 💬 <a href="https://opensin.ai/agents">Alle Agenten</a> · 🚀 <a href="https://opensin.ai/dashboard">Dashboard</a></sub>
</p>

<p align="right">(<a href="#readme-top">back to top</a>)</p>
