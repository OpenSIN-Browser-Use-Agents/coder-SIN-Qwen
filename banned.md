# banned.md — Verbotene Aktionen

## ABSOLUT VERBOTEN — NIEMALS AUSFÜHREN

| Befehl                                                                       | Grund                                        |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| `NIEMALS – BANNED (semgrep Regel) killen — Benutzer hat eingeloggte Sessions |
| `killall "Google Chrome"`                                                    | NIEMALS — siehe oben                         |
| `playstealth launch (isolierte PID) \| xargs kill`                           | NIEMALS                                      |
| `--profile-directory="Profile 166"`                                          | FALSCHES Profil! Nur Profile 147 ist korrekt |
| `process.exit()` im Relay ohne Cleanup                                       | Hinterlässt Zombie-Prozesse                  |
| Chrome automatisch neustarten                                                | Immer manuell vom User                       |

## Regel

**NIEMALS den Browser des Users beenden, killen, oder zwangsneustarten.**
Der Benutzer startet Chrome selbst mit dem richtigen Profil und CDP-Port.
Der Relay attached nur via CDP — mehr nicht.

## Korrektes Vorgehen

```bash
# Prüfen ob CDP läuft:
curl -s http://127.0.0.1:9444/json/version

# Wenn ja, einfach attach-en:
export CHROME_ATTACH_MODE=1
export CHROME_CDP_URL="http://127.0.0.1:9444"
node ./index.js "Review this codebase"
```

## Profile

- **Profile 147** = zukunftsorientierte-energie.de ✅ (RICHTIG, eingeloggt)
- **Profile 166** = zukunftsorientierte-energie.de ❌ (FALSCH)
- **Default** = S&F Elektro ❌ (FALSCH)
