# Plan: Issue #37 — ADRs & Docker Dev Environment

**Epic:** #25 (Enterprise-Gap #5)
**Priorität:** P2
**Geschätzter Aufwand:** 2-3 Tage

## Objective

Dem Projekt fehlen Architekturentscheidungen (ADRs) und eine schnelle Dev-Umgebung. Wir brauchen **ADR-Dokumentation aller großen Entscheidungen** und ein **Docker-One-Click-Setup** für neue Entwickler.

## Ursprüngliche Issues

- **#25**: Issue-Body fordert ADRs, OpenAPI Spec, Docker-Compose

## Implementierung

### Phase 1: ADR-Verzeichnis

Erstelle `docs/adr/` mit:

- ADR-0001: Entscheidung für UI-Automation statt API
- ADR-0002: Sidecar CDP Attach als einziger Browser-Pfad
- ADR-0003: pnpm + Turbo als Monorepo-Tooling
- ADR-0004: Infisical als Secret Manager
- ADR-0005: Playwright als Browser-Automation-Layer
- ADR-0006: Konversations-Baum als lokales File-Backing
- ADR-XXXX: Pro größere Entscheidung

### Phase 2: Docker Dev Environment

```dockerfile
# Dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y chromium
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
CMD ["node", "./index.js"]
```

`docker-compose.yml`:

```yaml
services:
  qwen-relay:
    build: .
    environment:
      - CHROME_CDP_URL=http://chrome:9222
    depends_on:
      - chrome
  chrome:
    image: chromedp/headless-shell:latest
    ports:
      - "9222:9222"
```

### Phase 3: CONTRIBUTING.md

- One-Click Dev Setup Guide
- Branching-Strategie (Feature-Branches + PRs)
- Test-Guide (welche Tests wann laufen)
- CI/CD-Übersicht

## Akzeptanzkriterien

- [ ] 5+ ADRs im `docs/adr/` Verzeichnis
- [ ] Dockerfile + docker-compose.yml
- [ ] CONTRIBUTING.md mit Setup-Guide
- [ ] docker-compose up startet Relay + Chrome
