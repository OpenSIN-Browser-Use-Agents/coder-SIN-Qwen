# Plan: Issue #26 — DOM Selector Resilience & Adaptive Recovery

**Epic:** #17 (SOTA-Upgrade #1)
**Priorität:** P0
**Geschätzter Aufwand:** 3-5 Tage

## Objective

Die aktuellen hartcodierten CSS-Selektoren (`Denken`, `Qwen3.6-Max-Preview`, Login-Buttons) brechen bei jedem Qwen-UI-Update. Wir brauchen ein **mehrstufiges Selector-Resilience-System**, das ohne manuellen Eingriff weiterfunktioniert.

## Ursprüngliche Issues

- **#17 SOTA#1**: "Keine Fallback-Chains, keine Accessibility-Tree-Nutzung, keine automatische Selektor-Regeneration bei Layout-Shifts"
- **#9**: Thinking-Mode-Enforcement ohne Verifikation
- **#3**: Model-Pinning ohne Fallback

## Implementierung

### Phase 1: Selector-Chain-Engine

Baue eine Selector-Chain-Engine mit automatischer Fallback-Resolution:

```
data-testid → aria-label → text-match → role-selector → screenshot-CV-fallback
```

**`packages/qwen-core/lib/selector-chain.js`:**

```javascript
export const SELECTOR_CHAINS = {
  sendButton: [
    { strategy: "testid", value: "chat-send-button" },
    { strategy: "role", value: "button", name: "Send" },
    { strategy: "text", value: "Send" },
    { strategy: "css", value: "div.chat-prompt-send-button button" },
    { strategy: "css", value: "button.send-button" },
  ],
  thinkingToggle: [
    { strategy: "role", value: "switch", name: /denken|thinking/i },
    { strategy: "text", value: /denken|thinking/i },
    { strategy: "css", value: '[data-testid="thinking-toggle"]' },
  ],
  modelSelector: [
    { strategy: "role", value: "combobox", name: /model/i },
    { strategy: "text", value: /qwen3\.6|max|preview/i },
    { strategy: "css", value: ".model-selector" },
  ],
  assistantOutput: [
    { strategy: "css", value: ".chat-container-statement .markdown-prose" },
    { strategy: "css", value: ".markdown-prose" },
    { strategy: "role", value: "article" },
  ],
};
```

### Phase 2: Adaptive Selector Resolution

Implementiere `resolveSelector(chain, page)` das:

1. Jede Strategie der Reihe nach probiert
2. Bei Treffer cached (für Session-Dauer)
3. Bei Fehlschlag: Screenshot + DOM-Snapshot + nächste Strategie
4. Loggt `selector_fallback_used` mit chain-Position und DOM-Hash

### Phase 3: Preflight-Selektor-Validierung

Erweitere `preflight.js` um eine `--check-selectors` Option, die:

- Alle Selector-Chains gegen die aktuelle Qwen-UI testet
- Einen Report ausgibt: welche Selektoren funktionieren, welche nicht
- Bei kritischen Selektoren (sendButton, assistantOutput) warn/fail

### Phase 4: Screenshot-CV-Fallback

Implementiere einen CV-basierten Fallback für den Extremfall:

- Screenshot der Seite machen
- Nach bekanntem UI-Element (Button, Textarea) per einfachem Template-Matching suchen
- Koordinaten für Playwright-Klick zurückgeben

## Abhängigkeiten

- Keine (kann parallel zu anderen SOTA-Upgrades laufen)
- Optional: Phase 4 benötigt `sharp` oder `@imgly/background-removal`

## Akzeptanzkriterien

- [ ] Selector-Chain-Engine mit 5+ Strategien implementiert
- [ ] Fallback-Logging (`selector_fallback_used`, chain-Position, DOM-Hash)
- [ ] Preflight `--check-selectors` validiert alle Chains gegen Live-Qwen-UI
- [ ] Bestehende Tests (114) bleiben grün
- [ ] Neuer Test: `test/selector-chain.test.js` mit 20+ Testcases
- [ ] Neuer Test: `test/selector-chain.e2e.test.js` (Live-UI, manuell ausführbar)

## Risiken

- Qwen-UI-Updates können alle Selector-Chains ungültig machen
- Mitigator: Preflight-Check erkennt tote Chains vor Runtime
- Screenshot-CV-Fallback ist wartungsintensiv → nur als letzte Eskalation

## Dateien

- `packages/qwen-core/lib/selector-chain.js` (NEU)
- `packages/qwen-core/lib/selector-resolver.js` (NEU)
- `preflight.js` (ERWEITERN)
- `test/selector-chain.test.js` (NEU)
- `test/selector-chain.e2e.test.js` (NEU)
