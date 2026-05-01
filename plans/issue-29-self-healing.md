# Plan: Issue #29 — Self-Healing Infrastructure

**Epic:** #17 (SOTA-Upgrade #4)
**Priorität:** P0
**Geschätzter Aufwand:** 4-6 Tage

## Objective

Aktuell bricht das Relay bei UI-Änderungen, Timeouts oder unerwarteten Zuständen einfach ab. Wir brauchen einen **Self-Healing Layer**, der automatisch erkennt, wenn etwas schief läuft, und versucht, sich zu erholen — bevor der Run failt.

## Ursprüngliche Issues

- **#17 SOTA#4**: "Keine Screenshot-Diffs, kein DOM-Hash-Vergleich, keine adaptive Selektor-Resolution bei Qwen-UI-Updates"
- **#1**: Wrapper-Stabilität ohne Self-Healing
- **#16**: Session-Recovery ohne automatisierte Health-Checks
- **#18-#20**: Alle Browser-Flow-Probleme ohne Self-Healing

## Implementierung

### Phase 1: DOM-Hash-Comparator

Implementiere `DomHashComparator`, der:

- Bei jedem erfolgreichen Schritt einen DOM-Hash (strukturierter Hash des relevanten DOM-Subtrees) speichert
- Bei Fehlern den aktuellen DOM-Hash mit dem erwarteten Hash vergleicht
- Abweichung erkennt und als `dom_drift` loggt
- Bei Drift automatisch Selector-Neuauflösung triggert

### Phase 2: Screenshot-Diff-Tool

Implementiere `ScreenshotDiff`, der:

- Vor/nach jedem kritischen Schritt Screenshots macht
- Pixel-Differenzen berechnet (via `pixelmatch` oder einfachem MSE)
- Bei >10% Abweichung warnt und Recovery einleitet
- Diffs in `artifacts/diffs/` speichert

### Phase 3: Recovery Playbook Engine

Implementiere `RecoveryPlaybook`, das:

- Für bekannte Fehlerbilder Recovery-Rezepte bereithält:
  - `AUTH_MODAL_VISIBLE` → "Klicke Sign-In-Button, warte auf Login-Formular"
  - `MODEL_SELECTOR_CHANGED` → "Öffne Model-Dropdown, wähle Qwen3.6-Max-Preview per Text-Match"
  - `THINKING_TOGGLE_MISSING` → "Suche per Accessibility-Tree, fallback auf CSS-Klasse"
  - `SEND_BUTTON_STALE` → "Warte auf DOM-Update, wiederhole Click mit Force-Option"
  - `SESSION_EXPIRED` → "Leite komplette Neu-Auth ein mit Account-Rotation"
- Playbooks sind als einfache JSON-Step-Sequenzen definiert
- Jeder Recovery-Schritt wird geloggt und gezählt

### Phase 4: `--self-heal` Flag

Füge ein `--self-heal` CLI-Flag hinzu, das:

- Den Self-Healing Layer aktiviert (default: an)
- Mit `--self-heal=off` deaktiviert werden kann (für Debugging)
- Recovery-Versuche zählt und bei >3/pro Run abbricht

## Akzeptanzkriterien

- [ ] DOM-Hash-Comparator mit strukturiertem Hashing implementiert
- [ ] Screenshot-Diff-Tool mit pixelmatch (oder Equivalent)
- [ ] Recovery-Playbook-Engine mit 5+ Playbooks
- [ ] `--self-heal` Flag mit default=on
- [ ] Recovery-Versuche werden geloggt (mit DOM-Hash, Screenshot, Schritt-ID)
- [ ] Bei >3 Fehlschlägen pro Run: Fail-Closed mit diagnose
- [ ] Bestehende Tests (114) bleiben grün

## Abhängigkeiten

- Benötigt `pixelmatch` oder `sharp` für Screenshot-Diffs
- DOM-Hash-Format muss mit #31 (Observability 2.0) abgestimmt sein
- Recovery-Playbooks können auf #26 (Selector Resilience) aufbauen

## Risiken

- Self-Healing kann Fehler maskieren → immer Fail-Closed nach N Versuchen
- Screenshot-Diffs erhöhen Laufzeit um 200-500ms pro Schritt
- Playbooks müssen bei Qwen-UI-Updates aktualisiert werden
- Mitigator: Preflight `--check-selectors` erkennt veraltete Playbooks
