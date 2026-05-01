# Architecture

> Detailed system design for coder-SIN-Qwen relay proxy.

## System Overview

```mermaid
flowchart TB
    subgraph User["User / OpenCode Agent"]
        CLI["node ./index.js"]
        ARGS["--json --turns N --branch X"]
    end

    subgraph Relay["Relay Pipeline"]
        direction LR
        PRE["preflight.js<br/>Env & Profile Check"]
        CTX["context.js<br/>Collect Files + Git"]
        PB["prompt-builder.js<br/>Build Structured Prompt"]
        SEC["secret-client.js<br/>Resolve Credentials"]
    end

    subgraph Browser["Browser Automation"]
        CDP["CDP Probe<br/>probeCdpEndpoint()"]
        SM["State Machine<br/>9 States"]
        SH["Self-Heal<br/>6 Playbooks"]
        Q["chat.qwen.ai"]
    end

    subgraph Response["Response Pipeline"]
        VAL["validator.js<br/>Strip Fluff"]
        PARSE["parser.js<br/>Parse JSON"]
        TREE["conversation-tree.js<br/>Save to Tree"]
        LOG["structured-log.js<br/>Log Entry"]
    end

    CLI --> PRE --> CTX --> PB --> SEC
    SEC --> CDP --> SM --> Q
    Q --> VAL --> PARSE --> TREE --> LOG
    LOG --> CLI

    classDef userClass fill:#e1f5fe,stroke:#01579b
    classDef relayClass fill:#e8f5e9,stroke:#1b5e20
    classDef browserClass fill:#fce4ec,stroke:#880e4f
    classDef responseClass fill:#fff3e0,stroke:#e65100

    class CLI,ARGS userClass
    class PRE,CTX,PB,SEC relayClass
    class CDP,SM,SH,Q browserClass
    class VAL,PARSE,TREE,LOG responseClass
```

## State Machine

```mermaid
flowchart LR
    IDLE -->|INIT| PAGE_LOADING
    PAGE_LOADING -->|PAGE_LOADED| INPUT_READY
    PAGE_LOADING -->|NETWORK_ERROR| ERROR
    INPUT_READY -->|SEND_CLICKED| SENDING
    INPUT_READY -->|NETWORK_ERROR| ERROR
    SENDING -->|THINKING_STARTED| THINKING
    SENDING -->|NETWORK_ERROR| ERROR
    THINKING -->|THINKING_DONE| STREAMING
    THINKING -->|TIMEOUT| ERROR
    STREAMING -->|STREAM_DONE| RESPONSE_READY
    STREAMING -->|TIMEOUT| ERROR
    RESPONSE_READY -->|SEND_CLICKED| SENDING
    RESPONSE_READY -->|RESET| IDLE
    ERROR -->|RECOVERY_SUCCESS| RECOVERING
    ERROR -->|RESET| IDLE
    RECOVERING -->|RECOVERY_SUCCESS| IDLE
    RECOVERING -->|RECOVERY_FAILED| ERROR

    classDef stateFill fill:#e8f5e9,stroke:#1b5e20
    class IDLE,PAGE_LOADING,INPUT_READY,SENDING,THINKING,STREAMING,RESPONSE_READY stateFill
    classDef errorFill fill:#ffebee,stroke:#c62828
    class ERROR,RECOVERING errorFill
```

## Self-Healing Playbooks

```mermaid
flowchart TB
    ERR["Error Occurs"] --> INFER["inferPlaybookFromError()"]
    INFER --> CHECK{"Playbook Found?"}
    CHECK -->|Yes| EXEC["Execute Playbook Steps"]
    CHECK -->|No| FAIL["Return recovered=false"]
    EXEC --> RESULT{"All Steps OK?"}
    RESULT -->|Yes| SUCCESS["Return recovered=true"]
    RESULT -->|No| RETRY{"Retries Left?"}
    RETRY -->|Yes| EXEC
    RETRY -->|No| FAIL

    classDef errFill fill:#ffebee,stroke:#c62828
    class ERR,FAIL errFill
    classDef okFill fill:#e8f5e9,stroke:#1b5e20
    class SUCCESS okFill
    class INFER,CHECK,EXEC,RESULT,RETRY fill:#e3f2fd,stroke:#01579b
```

## Recovery Playbooks

| Playbook                   | Triggers                                 | Steps                                             |
| :------------------------- | :--------------------------------------- | :------------------------------------------------ |
| AUTH_MODAL_VISIBLE         | `auth`, `login`, DOM contains "Anmelden" | Click sign-in → wait for email field → verify     |
| MODEL_SELECTOR_CHANGED     | `model`, `selector`                      | Click dropdown → wait for list → select preview   |
| THINKING_TOGGLE_MISSING    | `thinking`, `denken`                     | Click selector → open dropdown → select option    |
| SEND_BUTTON_STALE          | `send`, `stale`, `detached`              | Wait for DOM update → click with force → fallback |
| SESSION_EXPIRED            | `session`, `expired`                     | Navigate to chat → wait → re-authenticate         |
| ASSISTANT_RESPONSE_MISSING | `response`, `timeout`                    | Wait longer → retry wait → verify                 |

## Secret Management Flow

```mermaid
flowchart LR
    APP["Application"] --> SC["SecretClient.get(name)"]
    SC --> ENV{"process.env[name]?"}
    ENV -->|Yes| RETURN["Return value"]
    ENV -->|No| LOCAL{"env.local[name]?"}
    LOCAL -->|Yes| RETURN
    LOCAL -->|No| INF{"Infisical SDK?"}
    INF -->|Yes| FETCH["Fetch from Infisical"]
    INF -->|No| THROW["Throw MissingSecret"]

    classDef appFill fill:#e1f5fe,stroke:#01579b
    classDef secFill fill:#e8f5e9,stroke:#1b5e20
    classDef decFill fill:#fff3e0,stroke:#e65100
    class APP appFill
    class SC,THROW secFill
    class ENV,LOCAL,INF,INFETCH,RETURN decFill
```

## Package Dependencies

```mermaid
flowchart TB
    INDEX["index.js"] --> QCORE["packages/qwen-core"]
    INDEX --> B["browser.js"]
    INDEX --> PRE["preflight.js"]
    B --> QCORE
    PRE --> QCORE
    QCORE --> CTX["context.js"]
    QCORE --> PB["prompt-builder.js"]
    QCORE --> LC["lifecycle.js"]
    QCORE --> TR["trace.js"]
    QCORE --> SC["lib/secret-client.js"]
    QCORE --> SM["lib/browser-state-machine.js"]
    QCORE --> SH["lib/self-heal.js"]

    classDef entry fill:#e1f5fe,stroke:#01579b
    classDef core fill:#e8f5e9,stroke:#1b5e20
    classDef lib fill:#fff3e0,stroke:#e65100

    class INDEX,B,PRE entry
    class QCORE,CTX,PB,LC,TR core
    class SC,SM,SH lib
```

## Key Design Decisions

| Decision                     | Rationale                                   |                     ADR                     |
| :--------------------------- | :------------------------------------------ | :-----------------------------------------: |
| UI automation over API       | Full Qwen feature access without API limits |    [ADR-0001](adr/0001-ui-automation.md)    |
| Sidecar CDP attach only      | No profile locks, clean process separation  | [ADR-0002](adr/0002-sidecar-cdp-attach.md)  |
| pnpm + Turborepo             | Strict module isolation, cache-efficient CI | [ADR-0003](adr/0003-pnpm-turbo-monorepo.md) |
| Zero-trust SecretClient      | Secrets never logged, typed access          |  [ADR-0004](adr/0004-secret-management.md)  |
| Local JSON conversation tree | Portable, no DB, supports branching         |  [ADR-0005](adr/0005-conversation-tree.md)  |
