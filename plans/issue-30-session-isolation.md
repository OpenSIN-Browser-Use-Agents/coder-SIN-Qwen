# Plan: Issue #30 — Ephemeral Session Isolation & Secure Credential Transfer

**Epic:** #17 (SOTA-Upgrade #5)
**Priorität:** P0
**Geschätzter Aufwand:** 5-8 Tage

## Objective

Aktuell wird das Chrome `Default`-Profil direkt gemountet, was Sicherheitsrisiken birgt und zu Profile-Locks führt. Wir brauchen ein **ephemeres Sidecar-Profil mit isoliertem Cookie/LocalState-Transfer** — ohne jemals das Hauptprofil zu berühren.

## Ursprüngliche Issues

- **#17 SOTA#5**: "Kein sicherer Session-Transfer, kein ephemeres Sandbox-Profil → Sicherheits- & Stabilitätsrisiko"
- **#11**: Memory/Session-Leaks durch nicht isolierte Sessions
- **#15**: Sidecar ohne Linux/Docker-Support
- **#16**: Auth ohne Session-Health-Monitoring
- **#19**: Sidecar CDP ohne erzwungene Isolation

## Implementierung

### Phase 1: Ephemeral Profile Generator

Implementiere `EphemeralProfile`, der:

- Ein temporäres Chrome-Profil in `os.tmpdir()` erstellt
- Nur essentielle Cookies + LocalState aus `Default` kopiert (kein volles Sync)
- Profil nach Session-Ende atomar löscht (via lifecycle.js)
- Lock-freien Zugriff ermöglicht (kein `Default`-Profil-Lock mehr)

### Phase 2: Cookie-Only Transfer

Statt komplettem Profil-Copy:

- Extrahiere nur `Cookies` und `Local Storage` für `chat.qwen.ai`
- Nutze Chrome's `chrome.cookies` API via CDP
- Transfer via `page.evaluate()` in das ephemere Profil
- Validiere nach Transfer: Ist Session-Cookie gesetzt?

### Phase 3: Session Health Monitor

Implementiere `SessionHealthMonitor`:

- Regelmäßiger Ping: Ist Qwen noch eingeloggt? (prüfe auf Login-Button vs Chat-Input)
- Heartbeat-Intervall alle 60s bei aktiver Session
- Bei Session-Verlust: Auto-Re-Auth mit Account-Rotation
- Metriken: Session-Lifetime, Auth-Erfolgsrate, Cooldown-Status

### Phase 4: Linux & Docker Support

- Ersetze macOS-spezifische Pfade durch plattformunabhängige (über `runtime-config.js`)
- Füge Dockerfile für containerisierten Betrieb hinzu
- Linux: Nutze `chromium` oder `google-chrome-stable` statt macOS-Pfad
- Docker: Chrome + Relay in einem Container mit env-Konfiguration

## Akzeptanzkriterien

- [ ] Ephemeral Profile Generator mit Temp-Dir + atomarer Cleanup
- [ ] Cookie-Only Transfer via CDP (kein voller Profil-Copy)
- [ ] Session-Health-Monitor mit 60s Heartbeat
- [ ] Auto-Re-Auth bei Session-Verlust
- [ ] Linux-Support (chromium/google-chrome-stable)
- [ ] Dockerfile für containerisierten Betrieb
- [ ] Kein direkter Mount des `Default`-Profils mehr
- [ ] Bestehende Tests (114) bleiben grün

## Abhängigkeiten

- Liefert Session-Health-Daten an #31 (Observability 2.0)
- Nutzt Secret-Client von #34 (Secret Management)
- Nutzt Lifecycle-Cleanup von bestehendem `lifecycle.js`

## Risiken

- Cookie-Only Transfer kann bei Qwen-Auth-Änderungen brechen
- Mitigator: Fallback auf vollständigen Profil-Copy (opt-in via `SIDECAR_SYNC_MODE=full`)
- Linux Chrome kann andere Binary-Pfade haben
- Mitigator: Konfigurierbar via `CHROME_BINARY_PATH` env
- Docker erfordert `--cap-add=SYS_ADMIN` für Chrome-Sandbox
- Mitigator: Nutze `--no-sandbox` im Container (akzeptiertes Risiko)
