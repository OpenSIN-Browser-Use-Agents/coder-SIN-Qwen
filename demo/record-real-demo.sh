#!/usr/bin/env bash
set -euo pipefail
# Real Screen Recording: Shows Chrome + Terminal with coder-SIN-Qwen
# Requires: ffmpeg, Chrome, 16:9 screen

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT="$DEMO_DIR/demo_real_flow.mp4"
DURATION=35
W=1280
H=720

echo "🎬 Recording ${DURATION}s real screen demo (${W}x${H} 16:9)..."
echo ""

# Start ffmpeg recording in background
ffmpeg -y -f avfoundation -i "3:none" -t $DURATION \
  -vf "scale=$W:$H:force_original_aspect_ratio=decrease,pad=$W:$H:(ow-iw)/2:(oh-ih)/2:black" \
  -c:v libx264 -preset ultrafast -crf 26 -pix_fmt yuv420p \
  "$OUTPUT" 2>/dev/null &
FFPID=$!

sleep 1

# Open Chrome with Qwen chat URL
echo "→ Opening Chrome with chat.qwen.ai"
open -a "Google Chrome" "https://chat.qwen.ai" 2>/dev/null || \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "https://chat.qwen.ai" &
CHROME_PID=$!
sleep 3

# Show terminal with project
clear 2>/dev/null || printf '\033[2J\033[H'
echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   coder-SIN-Qwen — Qwen 3.6 Max FREE        ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""
echo "  $ cd coder-SIN-Qwen"
echo "  $ ls packages/qwen-core/lib/ | wc -l"
ls packages/qwen-core/lib/*.js 2>/dev/null | wc -l | xargs echo "     modules:"
sleep 2
echo ""
echo "  $ node ./index.js --dry-run 'What makes this special?' | head -12"
node ./index.js --dry-run "What makes this special?" 2>&1 | head -12
sleep 2
echo ""
echo "  $ node --test test/secret-client.test.js 2>&1 | tail -2"
node --test test/secret-client.test.js 2>&1 | tail -2
sleep 2
echo ""
echo "  ┌────────────────────────────────────────────────┐"
echo "  │  git clone .../coder-SIN-Qwen                  │"
echo "  │  cd coder-SIN-Qwen && pnpm install             │"
echo "  │  node ./index.js \"Review my code\"              │"
echo "  │  github.com/OpenSIN-Browser-Use-Agents         │"
echo "  └────────────────────────────────────────────────┘"
sleep 4
echo ""
echo "  Recording finished. Video: demo/demo_real_flow.mp4"

# Wait for ffmpeg to finish
wait $FFPID 2>/dev/null
echo ""
echo "✅ Screen recording saved: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
