# Plan: Issue #38 — Attachment System Hardening

**Epic:** #22 (War nicht CEO-Level umgesetzt)
**Priorität:** P1
**Geschätzter Aufwand:** 2-3 Tage

## Objective

Issue #22 wurde implementiert (Attachment-Ranking, 10 Dateien, PDF/Text/Log bevorzugt), aber nicht CEO-Level. Es fehlen: **Size-Validation, Type-Safety, Upload-Retry, Error-Reporting**.

## Ursprüngliche Issues

- **#22**: Implementiert mit commit `c91b0fe`, aber ohne:
  - Dateigrößen-Limits
  - Type-Validierung (MIME-Check statt Extension-Check)
  - Upload-Retry bei Netzwerkfehlern
  - Error-Reporting (welche Datei warum nicht attached?)

## Implementierung

### Phase 1: Size Validation

- Max 10MB pro Datei (konfigurierbar via `SIN_CODER_QWEN_MAX_ATTACHMENT_SIZE_MB`)
- Warnung bei Überschreitung (Datei wird übersprungen, nicht abgebrochen)
- Gesamtlimit: 50MB pro Message

### Phase 2: MIME-Type Validation

- Statt Extension-Check: Echter MIME-Type via `file-type` oder `magic-bytes`
- Erlaubte Typen: `application/pdf`, `text/*`, `application/json`, `application/xml`, `application/x-javascript`, `text/javascript`, `text/markdown`, `text/x-log`
- Explizite Blockliste: `image/*`, `video/*`, `audio/*`, `application/octet-stream`

### Phase 3: Upload Retry

- Bei Upload-Fehler: 2 Retries mit Exponential Backoff
- Timeout: 30s pro Upload
- Fehler werden detailliert geloggt: Dateiname, Größe, Fehlertyp

### Phase 4: Error-Reporting

- Am Ende jedes Runs: Attachment-Report (N attached, N skipped, Gründe)
- Strukturiertes Logging pro Attachment: `{ file, size, mime, status, error? }`
- Bei kritischen Fehlern: Warnung im CLI-Output

## Akzeptanzkriterien

- [ ] Size-Validation (10MB/Datei, 50MB/Message)
- [ ] MIME-Type-Validation (file-type oder magic-bytes)
- [ ] Upload-Retry (2 Versuche, Exponential Backoff)
- [ ] Attachment-Report am Run-Ende
- [ ] Bestehende Tests (114) bleiben grün
- [ ] Neuer Test: `test/attachment-hardening.test.js`
