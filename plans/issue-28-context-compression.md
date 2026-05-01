# Plan: Issue #28 — Prompt Context Compression & Relevance Pipeline

**Epic:** #17 (SOTA-Upgrade #3)
**Priorität:** P1
**Geschätzter Aufwand:** 5-8 Tage

## Objective

Aktuell wird der gesamte Repo-Context ungefiltert an Qwen gesendet, was Token verschwendet und das UI-Input-Limit reisst. Wir brauchen eine **dynamische Context-Compression-Pipeline** mit Relevanz-Scoring, Tree-Sitter-Parsing und Token-Budget-Management.

## Ursprüngliche Issues

- **#17 SOTA#3**: "Keine dynamische Prompt-Compression, kein Tree-Sitter-Parsing, kein Relevanz-Scoring"
- **#10**: External project context ohne Caching oder Kompression
- **#4**: Context snapshots ohne Relevanzfilter

## Implementierung

### Phase 1: Token Budget Manager

Implementiere `TokenBudgetManager`, der:

- Das UI-Input-Limit von Qwen kennt (aktuell ~12.000 Zeichen via `SIN_CODER_QWEN_MAX_PROMPT_LENGTH`)
- Ein Token-Budget pro Context-Kategorie allokiert (Code: 40%, Repo-Info: 20%, Anweisungen: 20%, Metadaten: 10%, Reserve: 10%)
- Bei Überschreitung priorisiert trimmed

### Phase 2: Tree-Sitter Code Structure Parser

Nutze Tree-Sitter (via `web-tree-sitter`) um Code-Struktur zu extrahieren statt rohem Text:

- Exportierte Funktionen + Signaturen
- Klassen/Interfaces
- Wichtige Kommentare (TODOs, FIXMEs)
- Datei-Abhängigkeiten (imports)

### Phase 3: Relevanz-Scorer

Implementiere `RelevanceScorer`, der:

- Jede Context-Quelle nach Relevanz zum aktuellen Prompt bewertet
- Heuristiken: Keyword-Match, Datei-Änderungsdatum, Commit-Historie
- Nur Top-N relevante Quellen ins Prompt-Budget aufnimmt

### Phase 4: Pipeline-Integration

Baue die Pipeline: `RawContext → RelevanceScorer → TokenBudgetManager → TreeSitterParser → CompressedPrompt`

## Akzeptanzkriterien

- [ ] TokenBudgetManager mit Kategorie-Budgetierung implementiert
- [ ] Tree-Sitter-Parser für JavaScript/TypeScript (mehr Sprachen erweiterbar)
- [ ] RelevanceScorer mit 3+ Heuristiken
- [ ] Pipeline-End-to-End getestet
- [ ] Prompt-Größe ist stabil unter `MAX_PROMPT_LENGTH` (außer bei Extremfällen)
- [ ] Bestehende Tests (114) bleiben grün

## Abhängigkeiten

- Benötigt `web-tree-sitter` als neue Dependency
- Profitiert von #26 (Selector Resilience) für stabilen UI-Input
- Kann parallel zu #29 (Self-Healing) entwickelt werden

## Risiken

- Tree-Sitter WASM kann Bundle-Größe erhöhen (≈2-5MB)
- Mitigator: Lazy-Loading, nur bei Bedarf initialisieren
- Relevanz-Scoring kann relevante Dateien aussortieren
- Mitigator: Immer mindestens `index.js`, `package.json` und aktuelle Änderungen inkludieren
