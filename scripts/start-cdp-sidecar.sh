#!/usr/bin/env bash
set -euo pipefail

# Launch a separate Chrome sidecar with remote debugging so the user's main Chrome can stay open.
ROOT_DIR="$(pwd)"
PORT="${CHROME_REMOTE_DEBUGGING_PORT:-9335}"
SOURCE_PROFILE="${CHROME_PROFILE:-$HOME/Library/Application Support/Google/Chrome/Default}"
PROFILE_DIRECTORY="${CHROME_PROFILE_DIRECTORY:-Default}"
SIDECAR_ROOT="${CHROME_SIDECAR_ROOT:-$ROOT_DIR/.chrome-cdp-sidecar}"
TARGET_USER_DATA_DIR="$SIDECAR_ROOT/user-data"
TARGET_PROFILE_DIR="$TARGET_USER_DATA_DIR/$PROFILE_DIRECTORY"
SYNC_MODE="${CHROME_SIDECAR_SYNC_MODE:-minimal}"

mkdir -p "$TARGET_PROFILE_DIR"

# Python copy keeps the script portable and avoids rsync edge-cases on some systems.
python3 - <<PY
from pathlib import Path
import shutil

source_profile = Path(r'''$SOURCE_PROFILE''')
profile_directory = r'''$PROFILE_DIRECTORY'''
target_profile = Path(r'''$TARGET_PROFILE_DIR''')
sync_mode = r'''$SYNC_MODE'''

source_dir = source_profile if source_profile.name in {'Default', profile_directory} else source_profile / profile_directory

full_items = None
minimal_items = [
    'Preferences',
    'Secure Preferences',
    'Cookies',
    'Cookies-journal',
    'Network',
    'Local Storage',
    'IndexedDB',
    'Session Storage',
    'Sessions',
    'Web Data',
    'Web Data-journal',
    'Login Data',
    'Login Data For Account',
    'Login Data-journal',
    'Service Worker',
    'Storage'
]

if not source_dir.exists():
    raise SystemExit(f'Source profile not found: {source_dir}')

if sync_mode == 'full':
    items = [p.name for p in source_dir.iterdir() if p.name not in {
        'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'Crashpad',
        'Code Cache', 'GPUCache', 'ShaderCache', 'DawnCache', 'Cache'
    }]
else:
    items = minimal_items

target_profile.mkdir(parents=True, exist_ok=True)

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

if [[ "$OSTYPE" == darwin* ]]; then
  nohup open -na "Google Chrome" --args \
    --remote-debugging-port="$PORT" \
    --user-data-dir="$TARGET_USER_DATA_DIR" \
    --profile-directory="$PROFILE_DIRECTORY" \
    --no-first-run \
    --no-default-browser-check \
    about:blank >/dev/null 2>&1 &
else
  nohup google-chrome \
    --remote-debugging-port="$PORT" \
    --user-data-dir="$TARGET_USER_DATA_DIR" \
    --profile-directory="$PROFILE_DIRECTORY" \
    --no-first-run \
    --no-default-browser-check \
    about:blank >/dev/null 2>&1 &
fi

echo "CDP sidecar launch requested."
echo "Export this before live runs:"
echo "export CHROME_CDP_URL=http://127.0.0.1:$PORT"
echo "Sync mode: $SYNC_MODE"
