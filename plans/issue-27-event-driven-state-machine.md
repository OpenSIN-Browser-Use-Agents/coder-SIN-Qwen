# Plan: Issue #27 — Event-Driven CDP Sync & Browser State Machine

**Epic:** #17 (SOTA-Upgrade #2)
**Priorität:** P0
**Geschätzter Aufwand:** 4-6 Tage

## Objective

Ersetze die aktuellen fixen Waits und linearen Timeouts durch eine **CDP-event-getriebene State Machine** mit klaren Zuständen, Events und Recovery-Pfaden.

## Ursprüngliche Issues

- **#17 SOTA#2**: "Keine CDP-Event-Steuerung, keine State-Machine, Risiko von Race-Conditions oder Timeout-Drift"
- **#2**: Multi-turn ohne Turn-Timeout-Handling
- **#20**: Login-Wait ohne Event-Steuerung

## Implementierung

### Phase 1: State Machine Definition

```javascript
// packages/qwen-core/lib/browser-state-machine.js
export const BrowserState = {
  IDLE: "IDLE",
  INPUT_READY: "INPUT_READY",
  SENDING: "SENDING",
  THINKING: "THINKING",
  STREAMING: "STREAMING",
  RESPONSE_READY: "RESPONSE_READY",
  ERROR: "ERROR",
  RECOVERING: "RECOVERING",
};

export const BrowserEvent = {
  PAGE_LOADED: "PAGE_LOADED",
  INPUT_VISIBLE: "INPUT_VISIBLE",
  SEND_CLICKED: "SEND_CLICKED",
  THINKING_STARTED: "THINKING_STARTED",
  THINKING_DONE: "THINKING_DONE",
  STREAM_CHUNK: "STREAM_CHUNK",
  STREAM_DONE: "STREAM_DONE",
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
  RECOVERY_SUCCESS: "RECOVERY_SUCCESS",
  RECOVERY_FAILED: "RECOVERY_FAILED",
};
```

### Phase 2: CDP Event Listener

Nutze CDP-Events statt fixer Waits:

- `Network.loadingFinished` → Detektiert Seitenwechsel
- `Network.responseReceived` → Erkennt API-Responses
- `DOM.childNodeInserted` → Erkennt DOM-Updates (neue Chat-Responses)
- `Runtime.consoleAPICalled` → Fängt Qwen-Console-Events

### Phase 3: State Machine Engine

Implementiere `BrowserStateMachine` mit:

- Validem State-Transition-Graph
- Timeout pro State (konfigurierbar)
- Auto-Recovery bei ERROR → RECOVERING → vorheriger State
- Event-History für Debugging

### Phase 4: Integration in browser.js

Ersetze `waitForSelector`, `waitForTimeout` und lineare Waits durch:

```javascript
const sm = new BrowserStateMachine(page, {
  stateTimeout: {
    THINKING: 60000,
    STREAMING: 120000,
    SENDING: 10000,
  },
  onTransition: (from, to, event) => {
    logTrace("state_transition", { from, to, event });
  },
  onError: (state, error) => {
    captureSnapshot(page, `error_${state}`);
  },
});
await sm.waitFor(BrowserState.RESPONSE_READY);
```

## Akzeptanzkriterien

- [ ] State-Machine mit 9 Zuständen und validen Transitions implementiert
- [ ] CDP-Event-Listener für Network, DOM, Console aktiv
- [ ] Timeout pro State konfigurierbar (env-Override)
- [ ] Recovery-Pfad: ERROR → RECOVERING → vorheriger State
- [ ] Event-History wird in JSONL geloggt
- [ ] Bestehende Tests (114) bleiben grün
- [ ] Neuer Test: `test/browser-state-machine.test.js`
- [ ] Neuer Test: `test/cdp-event-listener.test.js`

## Abhängigkeiten

- Liefert Event-History an #31 (Observability 2.0)
- Nutzt DOM-Hash von #26 (Selector Resilience)

## Risiken

- CDP-Event-Interface kann sich mit Playwright-Updates ändern
- Mitigator: Abstraktionsschicht zwischen CDP und State Machine
- Zu viele Events können Performance beeinträchtigen → Event-Throttling
