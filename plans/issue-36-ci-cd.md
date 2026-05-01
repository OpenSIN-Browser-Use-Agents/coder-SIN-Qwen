# Plan: Issue #36 — Intelligent CI/CD Pipeline

**Epic:** #25 (Enterprise-Gap #4)
**Priorität:** P1
**Geschätzter Aufwand:** 2-4 Tage

## Objective

Der aktuelle CI (pnpm install → test → build) ist funktional, aber nicht intelligent. Wir brauchen einen CI mit **Change-Detection, Quality-Gates und parallelen Jobs**.

## Ursprüngliche Issues

- **#25**: Issue-Body fordert SonarQube, Path-Filtering, Concurrency-Grouping
- **#13**: Config-Validierung ohne CI-Integration

## Implementierung

### Phase 1: Path-Filtering

Nutze `dorny/paths-filter@v2` für Change-Detection:

```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      core: ${{ steps.filter.outputs.core }}
      cli: ${{ steps.filter.outputs.cli }}
      ci: ${{ steps.filter.outputs.ci }}
    steps:
      - uses: dorny/paths-filter@v2
        id: filter
        with:
          filters: |
            core: 'packages/qwen-core/**'
            cli: '*.js'
            ci: '.github/workflows/**'
```

### Phase 2: Parallele Quality Gates

- `lint` (ESLint + Prettier Check)
- `typecheck` (tsc --noEmit, nach #33)
- `test` (unit + integration)
- `build` (pnpm turbo run build)
- Alle parallel wenn Changes in relevanten Pfaden

### Phase 3: Concurrency + Caching

- Concurrency-Grouping: gleicher Branch → alte Runs abbrechen
- Turbo-Remote-Caching (optional, via Vercel)
- pnpm store caching für schnelleres Install

### Phase 4: Release Automation

- Automatischer Release bei Tag-Push
- Changelog-Generierung aus Conventional Commits
- GitHub Release mit Asset-Upload

## Akzeptanzkriterien

- [ ] Path-Filtering in 3+ Kategorien
- [ ] Parallele Quality Gates (lint, typecheck, test, build)
- [ ] Concurrency-Grouping aktiv
- [ ] CI-Runtime unter 3 Minuten (bei Cache-Hit)
- [ ] Release-Workflow automatisiert
- [ ] Bestehende Tests (114) laufen in CI
