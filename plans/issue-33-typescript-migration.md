# Plan: Issue #33 — TypeScript Migration

**Epic:** #25 (Enterprise-Gap #1)
**Priorität:** P1
**Geschätzter Aufwand:** 8-12 Tage

## Objective
Der gesamte Codebase ist vanille JavaScript ohne Typen. Für enterprise-grade Wartbarkeit, Refactoring-Sicherheit und IDE-Unterstützung migrieren wir zu **TypeScript mit strict mode**.

## Ursprüngliche Issues
- **#25**: Issue-Body fordert TypeScript, aber nur JS-Scaffold umgesetzt
- **#6, #7, #11-#14**: Hätten von Type-Safety profitiert

## Implementierung

### Phase 1: tsconfig + Build Pipeline
- `tsconfig.json` mit `strict: true`, `moduleResolution: bundler`
- Build: `tsc` oder `tsup` für Bundle
- JSDoc-Typen als Zwischenschritt (optional)

### Phase 2: Schrittweise Migration
1. `packages/qwen-core/` zuerst (pure Module, keine Seiteneffekte)
2. `packages/qwen-core/lib/` als nächstes
3. Root-CLI-Dateien als letztes (höchste Priorität für Type-Safety)

### Phase 3: Strict Mode
- `noImplicitAny`, `strictNullChecks`, `noUnusedLocals` aktiv
- Eigene Typdefs für Qwen-DOM-Struktur, Session-State, Config-Schema

## Akzeptanzkriterien
- [ ] `tsconfig.json` mit strict mode
- [ ] `packages/qwen-core/` vollständig in TypeScript
- [ ] Alle 114 Tests laufen via `tsx` oder kompiliertem JS
- [ ] Build produziert valides JS
- [ ] Typdefinitionen für Qwen-DOM + Config + Session

## Risiken
- Playwright-Typen können mit strict mode kollidieren → `skipLibCheck: true`
- Migration kann bestehende Logik brechen → schrittweise, Modul für Modul
