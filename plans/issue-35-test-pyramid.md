# Plan: Issue #35 — Multi-Layer Test Pyramid

**Epic:** #25 (Enterprise-Gap #3)
**Priorität:** P0
**Geschätzter Aufwand:** 5-8 Tage

## Objective

Die aktuelle Testabdeckung (114 Unit-Tests) ist ein guter Start, aber für ein UI-abhängiges System nicht ausreichend. Wir brauchen eine **3-stufige Testpyramide**: Unit → Integration → Chaos-E2E.

## Ursprüngliche Issues

- **#25**: Issue-Body fordert Vitest, Property-Based Tests, Chaos E2E → nie implementiert
- **#24**: "Kritisch niedrige Testabdeckung"
- **#6, #7, #11-#15**: Feature-Issues ohne Integrationstests

## Implementierung

### Phase 1: Vitest + Property-Based Tests

- Migriere `node:test` zu Vitest (oder erhalte node:test + ergänze mit fast-check)
- Property-Based Tests für:
  - `parseQwenResponse`: Invariante "nie null bei validem Input"
  - `validateConsultResponse`: Invariante "nie undefined bei validen Constraints"
  - `guardPromptLength`: Invariante "nie länger als MAX_PROMPT_LENGTH"
  - `resolveSelector`: Invariante "gibt immer einen validen Selector oder null"

### Phase 2: Integration Tests

- Teste Modul-Interaktionen ohne Live-Browser:
  - `context.js` + `prompt-builder.js` → korrektes Prompt-Payload
  - `browser-hardening.js` + `validator.js` → korrekte Validierung
  - `lifecycle.js` + `logger.js` → korrekte Ressourcen-Cleanup

### Phase 3: Chaos-Driven E2E Tests

- Playwright-basiert mit Chaos-Injection:
  - Latenz-Injection (1-3s) → testet Timeout-Handling
  - 503-Simulation → testet Failover
  - DOM-Änderungs-Simulation (Selector ungültig) → testet Self-Healing

### Phase 4: Test-Reporting

- Test-Ergebnisse als JUnit-XML für CI
- Coverage-Report (c8 oder nyc)
- Metrik: Test-Quality-Gate (mind. 80% Coverage)

## Akzeptanzkriterien

- [ ] Vitest/fast-check setup (neben node:test)
- [ ] 10+ Property-Based Test Cases
- [ ] 20+ Integration Tests
- [ ] 5+ Chaos-E2E Tests (opt-in, nicht in CI)
- [ ] Coverage-Reporting
- [ ] 80%+ Testabdeckung in packages/qwen-core/
- [ ] Bestehende 114 Tests bleiben grün
