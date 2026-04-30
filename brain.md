# brain.md — coder-SIN-Qwen Configuration Brain

> **DO NOT DELETE:** This file persists Chrome profile config and runtime knowledge.
> **NEVER kill the user's Chrome. EVER.**

## Chrome Profile

**KRITISCH: NIEMALS Chrome beenden, zwangsweise neustarten oder Profile wechseln.**
Der Relay attached an den BEREITS laufenden Chrome via CDP.

**Aktuell korrektes Profil auf diesem Rechner: `Profile 147`**

```bash
# So startet man Chrome mit dem richtigen Profil + CDP (NUR WENN CHROME NOCH NICHT LÄUFT):
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9444 \
  --user-data-dir="/Users/jeremy/Library/Application Support/Google/Chrome" \
  --profile-directory="Profile 147" \
  --no-first-run --no-default-browser-check \
  "https://chat.qwen.ai"
```

**FALLS Chrome schon läuft (ohne CDP):** NIE killen. User muss Chrome selbst neustarten.

**WICHTIG: `--profile-directory="Profile 147"` — NICHT Profile 166!**
Profile 147 = zukunftsorientierte-energie.de (EINGELOGGT bei Qwen ✅)
Profile 166 = ebenfalls zukunftsorientierte-energie.de (FALSCHES Profil ❌)

**IM ATTACH MODE** wird KEIN Profil vom Relay bestimmt. Er attached einfach an den laufenden Chrome.

## BANNED COMMANDS
- ❌ `pkill -f Chrome` — NIEMALS Chrome killen!
- ❌ `killall "Google Chrome"` — NIEMALS!
- ❌ Chrome zwangsweise neustarten
- ❌ `--profile-directory="Profile 166"` verwenden (nur 147 ist korrekt)
- ❌ Jegliche Chrome-Prozess-Manipulation

## Quick Start (mit bereits laufendem Chrome + CDP)

```bash
export CHROME_ATTACH_MODE=1
export CHROME_CDP_URL="http://127.0.0.1:9444"
node ./index.js "Review this codebase"
```

Kein Profil angeben. Kein Chrome starten. Einfach attach-en.

## CDP Sidecar (NUR wenn Chrome noch NICHT läuft)

```bash
export CHROME_REMOTE_DEBUGGING_PORT="9444"
# Chrome NICHT selbst starten! User startet ihn mit:
# --profile-directory="Profile 147" --remote-debugging-port=9444
export CHROME_CDP_URL="http://127.0.0.1:9444"
export CHROME_ATTACH_MODE=1
node ./index.js "Review this codebase"
```
