#!/usr/bin/env bash
set -euo pipefail

# Guarded GitHub merge helper; only runs when explicitly enabled.
if [[ "${ALLOW_GH_MERGE:-0}" != "1" ]]; then
  echo "Set ALLOW_GH_MERGE=1 to enable merge helper."
  exit 1
fi

if git status --porcelain | grep -q .; then
  echo "Working tree must be clean before merge."
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required."
  exit 1
fi

if git symbolic-ref --quiet --short HEAD | grep -qx 'main'; then
  echo "Already on main."
  exit 0
fi

# Fall back to the active gh login when GH_TOKEN is not exported explicitly.
export GH_TOKEN="${GH_TOKEN:-$(gh auth token)}"

branch="$(git branch --show-current)"

git fetch origin main >/dev/null 2>&1 || true
gh pr create --base main --head "$branch" --title "Merge $branch into main" --body "Automated merge request from omo-SIN-Qwen." || true
gh pr merge --merge --auto --delete-branch
