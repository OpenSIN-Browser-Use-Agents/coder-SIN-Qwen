# Plan: Issue #32 — Async CLI & Worker Architecture

**Epic:** #17 (SOTA-Upgrade #7)
**Priorität:** P1
**Geschätzter Aufwand:** 5-8 Tage

## Objective

Der aktuelle CLI-Relay ist synchron und blockierend — bei langen Thinking/Streaming-Phasen hängt das CLI. Wir brauchen einen **non-blocking Async-Loop mit Worker-Queue** für Multi-Turn, parallele Runs und Graceful Degradation.

## Ursprüngliche Issues

- **#17 SOTA#7**: "Kein asynchroner CDP-Event-Loop, keine Worker-Queue, CLI hängt bei langen Render/Thinking-Phasen"
- **#2**: Multi-turn ohne parallele Verarbeitung
- **#11**: Keine Ressourcenlimits für parallele Runs

## Implementierung

### Phase 1: Async CLI Event Loop

Refaktor `index.js` zu einem nicht-blockierenden Event-Loop:

```javascript
const loop = new AsyncEventLoop({
  maxConcurrency: 1, // Qwen erlaubt nur 1 Session
  queueTimeout: 60000, // Max Wartezeit in Queue
  onError: (task, error) => handleTaskError(task, error),
});

loop.enqueue({
  id: "run_001",
  prompt: "...",
  onProgress: (state) => process.stdout.write("."),
  onComplete: (result) => console.log(result),
});
```

### Phase 2: Worker Thread Pool

CPU-intensive Operationen (Parsing, Context-Sammeln, Tree-Sitter) in Worker-Threads auslagern:

```javascript
// packages/qwen-core/lib/worker-pool.js
class WorkerPool {
  constructor(maxWorkers = 4) {
    this.workers = [];
    this.queue = [];
  }
  async exec(task, data) {
    // Worker aus dem Pool oder neuen erstellen
    // data per structuredClone transferieren
    // Timeout pro Task
  }
}
```

### Phase 3: Graceful Degradation

Wenn Qwen nicht erreichbar oder Session abgelaufen ist:

- Queue neue Tasks (statt Fail)
- Retry mit Account-Rotation
- Bei dauerhaftem Fehler: degradiere zu `--dry-run` (print context only)
- User kriegt klares Signal: "Qwen offline, running in dry-run mode"

### Phase 4: CLI Progress Indicator

- Spinner/Progress-Bar während Wartezeit
- Zeige aktuellen State der State Machine
- Bei `--verbose`: zeige DOM-Hash, Selector-Chain-Position, Timing

## Akzeptanzkriterien

- [ ] AsyncEventLoop mit Queue, Timeout, Error-Handling
- [ ] WorkerPool mit 4 Workern
- [ ] Graceful Degradation: Qwen offline → dry-run mode
- [ ] Progress Indicator im CLI
- [ ] Bestehende Tests (114) bleiben grün
- [ ] Neuer Test: `test/async-event-loop.test.js`
- [ ] Neuer Test: `test/worker-pool.test.js`

## Abhängigkeiten

- State Machine von #27 für Progress Indicator
- Timing-Metriken von #31
- Secret-Client von #34 für Rotation

## Risiken

- Worker-Threads können Debugging erschweren
- Mitigator: `--no-workers` Flag für sequentiellen Modus
- Async Event Loop kann Race Conditions einführen
- Mitigator: State Machine stellt sicher, dass nur 1 Task gleichzeitig läuft
