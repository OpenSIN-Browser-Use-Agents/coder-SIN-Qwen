# Plan: Issue #17 — New Roadmap (SOTA-Upgrade Epic)

## Status: OPEN — Epic

## Objective

Transform `coder-SIN-Qwen` von einem funktionalen Relay in ein **enterprise-grade, production-hardened Browser-Automation-System**. Dieses Epic fasst 7 konkrete SOTA-Upgrade-Bereiche zusammen, die als separate Issues umgesetzt werden.

## Ursprüngliches Issue

Issue #17 enthielt eine detaillierte SOTA-Analyse mit 7 Upgrade-Bereichen. Der Fehler war: Ich habe es geschlossen, **ohren ein einziges Upgrade umzusetzen**. Dieses Epic bleibt offen, bis ALLE 7 Bereiche abgeschlossen sind.

## Abdeckung der ursprünglich geschlossenen Issues

Dieses Epic adressiert die nicht-CEO-Level implementierten Aspekte folgender geschlossener Issues:

- **#1-#10**: Basis-Features ohne Production-Hardening → werden durch SOTA-Upgrades gehärtet
- **#11, #12, #14**: Lifecycle, Trace, Circuit Breaker ohne Metriken/Profiling → SOTA#6
- **#13**: Runtime Config ohne Schema-Versionierung → SOTA#7 + CI/CD
- **#15**: macOS-only ohne Linux/Docker → SOTA#5
- **#16**: Session-Auth ohne Health-Monitoring → SOTA#5
- **#18-#20**: Browser-Flow ohne Self-Healing → SOTA#4

## Die 7 Upgrade-Bereiche

| #   | Bereich                                     | Issue | Priorität | Aufwand  |
| --- | ------------------------------------------- | ----- | --------- | -------- |
| 1   | DOM Selector Resilience & Adaptive Recovery | #26   | P0        | 3-5 Tage |
| 2   | Event-Driven CDP Sync & State Machine       | #27   | P0        | 4-6 Tage |
| 3   | Prompt Context Compression Pipeline         | #28   | P1        | 5-8 Tage |
| 4   | Self-Healing Infrastructure                 | #29   | P0        | 4-6 Tage |
| 5   | Ephemeral Session Isolation & Security      | #30   | P0        | 5-8 Tage |
| 6   | Observability 2.0                           | #31   | P1        | 3-5 Tage |
| 7   | Async CLI & Worker Architecture             | #32   | P1        | 5-8 Tage |

## Abhängigkeiten

- Keine blockierenden Abhängigkeiten zwischen den 7 Bereichen
- #28 (Context Compression) profitiert von #27 (State Machine)
- #31 (Observability) profitiert von #27 und #32
- #30 (Session Isolation) profitiert von #34 (Secret Management)

## Erfolgskriterien

- [ ] Alle 7 Upgrade-Issues sind geschlossen
- [ ] 114+ Tests bestehen (bestehende + neue)
- [ ] Integrationstests für jeden Upgrade-Bereich
- [ ] Dokumentation der neuen Architektur in ADRs
- [ ] Nachweis der Resilienz durch Chaos-Tests

## Risk Assessment

- **UI-Änderungen bei Qwen**: Höchstes Risiko. Mitigator: Self-Healing + Selector-Resilienz
- **Timeline**: 30-50 Tage Gesamtaufwand bei sequentieller Bearbeitung
- **Parallelisierung**: 3 Streams möglich (Frontend/UI, Backend/Architektur, Testing/CI)

## Entscheidungslog

| Datum      | Entscheidung              | Begründung                                         |
| ---------- | ------------------------- | -------------------------------------------------- |
| 2026-04-28 | Issue #17 wieder geöffnet | War fälschlich als "superseded by #25" geschlossen |
