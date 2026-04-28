# Plan: Issue #34 — Enterprise Secret Management

**Epic:** #25 (Enterprise-Gap #2)
**Priorität:** P0
**Geschätzter Aufwand:** 3-5 Tage

## Objective
Aktuell werden Secrets via Umgebungsvariablen und `.env`-Dateien verwaltet — ein Sicherheitsrisiko. Wir brauchen einen **Zero-Trust Secret Client** basierend auf Infisical, der Secrets zur Laufzeit sicher abruft und niemals logged.

## Ursprüngliche Issues
- **#25**: Issue-Body fordert Secret-Client-Paket, nie implementiert
- **#16**: Auth-Credentials ohne sicheren Speicher
- **#24**: Kritisiert "riskanter Umgang mit Secrets"

## Implementierung

### Phase 1: Infisical SDK Client
```javascript
// packages/qwen-core/lib/secret-client.js
class SecretClient {
  constructor() {
    // Init via Machine Identity (CI) oder OAuth (lokal)
  }
  async getSecret(key) { /* never console.log the value */ }
  async getSecrets(prefix) { /* batch fetch */ }
}
```

### Phase 2: Env-Fallback-Integration
- Produktion: Secrets via Infisical Machine Identity
- Lokal: Fallback auf env (mit Warnung)
- CI: Secrets via GitHub Secrets injecten
- Nie: Secrets in `.env` committen

### Phase 3: Type-Safe Secret Schema
Definiere ein Schema aller benötigten Secrets:
```javascript
export const SECRET_SCHEMA = {
  QWEN_ACCOUNT_1_EMAIL: { required: true, source: 'infisical' },
  QWEN_ACCOUNT_1_PASSWORD: { required: true, source: 'infisical' },
  INFISICAL_CLIENT_ID: { required: process.env.CI === 'true', source: 'env' },
};
```

### Phase 4: Audit & Validation
- Validiere alle benötigten Secrets vor dem Start (in preflight)
- Logge nur ob ein Secret vorhanden ist (nie den Wert)
- Warne bei Secrets in Umgebungsvariablen (sollten nur Fallback sein)

## Akzeptanzkriterien
- [ ] SecretClient mit Infisical SDK implementiert
- [ ] Env-Fallback (mit Warnung) für lokale Entwicklung
- [ ] Type-Safe Secret Schema mit Validierung
- [ ] Preflight prüft Secret-Verfügbarkeit
- [ ] Kein Secret-Wert wird jemals geloggt
- [ ] Bestehende Tests (114) bleiben grün
