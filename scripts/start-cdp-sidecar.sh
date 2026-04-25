#!/usr/bin/env bash
set -euo pipefail

# Launch a separate Chrome sidecar with remote debugging so the user's main Chrome can stay open.
ROOT_DIR="$(pwd)"
PORT="${CHROME_REMOTE_DEBUGGING_PORT:-9444}"
CDP_URL="http://127.0.0.1:${PORT}"
START_URL="${QWEN_URL:-https://chat.qwen.ai}"
SOURCE_PROFILE="${CHROME_PROFILE:-$HOME/Library/Application Support/Google/Chrome/Default}"
PROFILE_DIRECTORY="${CHROME_PROFILE_DIRECTORY:-auto}"
SIDECAR_ROOT="${CHROME_SIDECAR_ROOT:-${TMPDIR:-/tmp}/coder-sin-qwen-sidecar}"
TARGET_USER_DATA_DIR="$SIDECAR_ROOT/user-data"
SYNC_MODE="${CHROME_SIDECAR_SYNC_MODE:-full}"
if [[ -z "${CHROME_BIN:-}" ]]; then
  if [[ "$OSTYPE" == darwin* ]]; then
    CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  else
    CHROME_BIN="google-chrome"
  fi
fi
SIDECAR_LOG="${CHROME_SIDECAR_LOG:-$SIDECAR_ROOT/chrome-sidecar.log}"
START_TIMEOUT_SECONDS="${CHROME_SIDECAR_START_TIMEOUT_SECONDS:-20}"
SELECTED_PROFILE_FILE="$SIDECAR_ROOT/selected-profile.txt"

mkdir -p "$TARGET_USER_DATA_DIR"

if [[ ! -x "$CHROME_BIN" ]] && ! command -v "$CHROME_BIN" >/dev/null 2>&1; then
  echo "Chrome binary not found: $CHROME_BIN"
  exit 1
fi

# Python copy keeps the script portable and avoids rsync edge-cases on some systems.
python3 - <<PY
from pathlib import Path
import shutil

source_profile = Path(r'''$SOURCE_PROFILE''')
profile_directory = r'''$PROFILE_DIRECTORY'''
target_user_data_dir = Path(r'''$TARGET_USER_DATA_DIR''')
sync_mode = r'''$SYNC_MODE'''
selected_profile_file = Path(r'''$SELECTED_PROFILE_FILE''')

chrome_root = source_profile.parent if source_profile.name in {'Default', 'Guest Profile', 'System Profile'} or source_profile.name.startswith('Profile ') else source_profile

def detect_best_profile(root: Path) -> str:
    scored = []
    for child in root.iterdir():
        if not child.is_dir():
            continue
        name = child.name
        if not (name == 'Default' or name.startswith('Profile ') or name in {'Guest Profile', 'System Profile'}):
            continue
        qwen_db = child / 'IndexedDB' / 'https_chat.qwen.ai_0.indexeddb.leveldb'
        size = 0
        if qwen_db.exists():
            for item in qwen_db.iterdir():
                if item.is_file():
                    size += item.stat().st_size
        scored.append((size, name))
    scored.sort(key=lambda item: (-item[0], item[1] != 'Default', item[1]))
    return scored[0][1] if scored else 'Default'

if profile_directory == 'auto':
    profile_directory = detect_best_profile(chrome_root)

selected_profile_file.parent.mkdir(parents=True, exist_ok=True)
selected_profile_file.write_text(profile_directory, encoding='utf-8')

source_dir = chrome_root / profile_directory
source_user_data_dir = chrome_root
target_profile = target_user_data_dir / profile_directory

full_items = None
minimal_items = [
    'Preferences',
    'Secure Preferences',
    'Cookies',
    'Cookies-journal',
    'IndexedDB',
    'Session Storage',
    'Local Storage',
    'Sessions',
    'Login Data',
    'Login Data For Account',
    'Login Data-journal',
    'Login Data For Account-journal',
    'Service Worker',
    'Storage',
    'Web Data',
    'Web Data-journal'
]

if not source_dir.exists():
    raise SystemExit(f'Source profile not found: {source_dir}')

if sync_mode == 'none':
    items = []
elif sync_mode == 'full':
    items = [p.name for p in source_dir.iterdir() if p.name not in {
        'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'Crashpad',
        'Code Cache', 'GPUCache', 'ShaderCache', 'DawnCache', 'Cache'
    }]
else:
    items = minimal_items

target_profile.mkdir(parents=True, exist_ok=True)

for name in ('Local State', 'First Run', 'Last Version'):
    src = source_user_data_dir / name
    dst = target_user_data_dir / name
    if not src.exists():
        continue
    if dst.exists():
        if dst.is_dir():
            shutil.rmtree(dst)
        else:
            dst.unlink()
    if src.is_dir():
        shutil.copytree(src, dst, dirs_exist_ok=True)
    else:
        shutil.copy2(src, dst)

for name in items:
    src = source_dir / name
    dst = target_profile / name
    if not src.exists():
        continue
    if dst.exists():
        if dst.is_dir():
            shutil.rmtree(dst)
        else:
            dst.unlink()
    if src.is_dir():
        shutil.copytree(src, dst, dirs_exist_ok=True)
    else:
        shutil.copy2(src, dst)

print(f'Prepared sidecar profile: {target_profile}')
PY

mkdir -p "$(dirname "$SIDECAR_LOG")"

if [[ -f "$SELECTED_PROFILE_FILE" ]]; then
  PROFILE_DIRECTORY="$(cat "$SELECTED_PROFILE_FILE")"
fi

nohup "$CHROME_BIN" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$TARGET_USER_DATA_DIR" \
  --profile-directory="$PROFILE_DIRECTORY" \
  --no-first-run \
  --no-default-browser-check \
  --disable-session-crashed-bubble \
  --disable-features=SessionRestore,RestoreBackgroundContents \
  "$START_URL" >>"$SIDECAR_LOG" 2>&1 &

echo "CDP sidecar launch requested."
echo "Export this before live runs:"
echo "export CHROME_CDP_URL=$CDP_URL"
echo "Sync mode: $SYNC_MODE"
echo "Log file: $SIDECAR_LOG"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to verify the CDP sidecar startup."
  exit 1
fi

for ((i=0; i<START_TIMEOUT_SECONDS; i++)); do
  if curl --max-time 2 --silent --show-error "$CDP_URL/json/version" >/dev/null 2>&1; then
    echo "CDP sidecar reachable at $CDP_URL"
    exit 0
  fi
  sleep 1
done

echo "CDP sidecar did not become reachable within ${START_TIMEOUT_SECONDS}s. Check: $SIDECAR_LOG"
exit 1
