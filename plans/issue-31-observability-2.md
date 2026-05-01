# Plan: Issue #31 — Observability 2.0

**Epic:** #17 (SOTA-Upgrade #6)
**Priorität:** P1
**Geschätzter Aufwand:** 3-5 Tage

## Objective

Aktuelles JSONL-Logging ist zu dünn für Produktions-Debugging. Wir brauchen **strukturierte Observability** mit DOM-Snapshots, CDP-Traces, Timing-Metriken und Error-Context pro Schritt.

## Ursprüngliche Issues

- **#17 SOTA#6**: "Keine Schritt-für-Schritt DOM-Snapshots, keine CDP-Traces, keine strukturierten Error-Contexts"
- **#12**: Trace-Korrelation ohne Metriken
- **#14**: Circuit Breaker ohne Metrik-Export

## Implementierung

### Phase 1: Structured Log Entry Schema

Definiere ein kanonisches Log-Schema für jeden Schritt:

```javascript
{
  step_id: 'send_message_3',
  trace_id: 'tr_abc123',
  span_id: 'sp_456',
  parent_span_id: 'sp_123',
  state: BrowserState.SENDING,
  dom_hash: 'a1b2c3d4',
  selector_chain_used: ['testid', 'role', 'css'],
  timing_ms: { start: 0, click: 120, network: 350, done: 420 },
  error: null,
  recovery_attempts: 0,
  snapshot_path: 'artifacts/snapshots/send_message_3.png',
}
```

### Phase 2: DOM-Snapshot-Manager

Implementiere `DomSnapshotManager`:

- Macht DOM-Snapshots (nicht Screenshots) bei jedem State-Transition
- Speichert als komprimierten HTML-Snippet (nur relevanter Subtree)
- Rotation: behält max 50 Snapshots, löscht älteste
- Snapshots sind durchsuchbar (grep nach Fehlermeldungen)

### Phase 3: Timing & Metrik-Export

- Timing pro Schritt (State-Machine-Transition-Zeiten)
- Metriken exportieren als Prometheus-Text-Format für `/metrics` Endpoint
- Oder: einfacher Metrik-File in `artifacts/metrics/` (JSONL)
- Key-Metriken: `login_success_rate`, `avg_response_time_ms`, `selector_fallback_rate`, `recovery_success_rate`

### Phase 4: Error-Context-Enrichment

Jeder Error wird angereichert mit:

- DOM-Hash zum Zeitpunkt des Fehlers
- Letzter erfolgreicher State
- Screenshot-Pfad
- Selector-Chain-Status (welche Strategie war aktiv?)
- Recovery-Versuche (Anzahl, Ergebnisse)

## Akzeptanzkriterien

- [ ] Kanonisches Log-Schema definiert und in JSONL implementiert
- [ ] DOM-Snapshot-Manager (HTML-Snippets, Rotation)
- [ ] Timing-Metriken pro State-Transition
- [ ] Error-Context mit DOM-Hash + Screenshot + Selector-Status
- [ ] Prometheus-Export (optional, über env konfigurierbar)
- [ ] Bestehende Tests (114) bleiben grün

## Abhängigkeiten

- DOM-Hash-Format von #29 (Self-Healing)
- State-Transition-Events von #27 (State Machine)
- Timing hängt an #32 (Async CLI) für präzise Metriken

## Risiken

- DOM-Snapshots können sensitiven Content enthalten (Credentials)
- Mitigator: Sanitize-Funktion entfernt input/value-Attribute
- Prometheus-Export erfordert offenen Port → optional, default off
