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

## 🔐 Login-Durchbruch 2026-04-28 ✅

Profile 147 → zukunftsorientierte-energie.de. LOGIN FUNKTIONIERT!

**Gefixte Bugs:**
- `hasInteractiveChat`: URL-basiert statt nur Selector — erkennt Welcome-Seite
- `maybeEnterAuthPage`: auch bei Login-Modal (kein Seitenwechsel)
- `chrome-profile-resolver`: filtert nach existierenden Profilen

**Korrekte Nutzung:**
```bash
export CHROME_ATTACH_MODE=1
export CHROME_CDP_URL="http://127.0.0.1:9445"
export QWEN_ACCOUNT_1_EMAIL="devjerro@gmail.com"
export QWEN_ACCOUNT_1_PASSWORD="ZOE.jerry2024"
node ./index.js "Dein Prompt"
```

Siehe `SESSION_LOGIN_2026-04-28.md` für den vollständigen Debug-Trace.

## 📁 File-Write-Block Format (#39)

**Qwen wird instruiert, jede Datei als kompletten Write-Block auszugeben:**

```
--- FILE: path/to/file.ext ---
```language
... vollständiger datei-inhalt ...
```
--- END FILE ---
```

**Parser:**
- `validator.js` → `extractFileBlocks(text)` → gibt Array von `{path, content}` zurück
- `buildWriteCommands(blocks)` → generiert `cat > file << 'EOF' ... EOF` Befehle

**Ziel:** coder-SIN-Qwen kann die Blöcke direkt parsen und in Dateien schreiben — kein Copy-Paste mehr nötig.

```bash
export CHROME_REMOTE_DEBUGGING_PORT="9444"
# Chrome NICHT selbst starten! User startet ihn mit:
# --profile-directory="Profile 147" --remote-debugging-port=9444
export CHROME_CDP_URL="http://127.0.0.1:9444"
export CHROME_ATTACH_MODE=1
node ./index.js "Review this codebase"
```
