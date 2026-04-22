#!/usr/bin/env bash
set -euo pipefail

# Guarded GitHub merge helper; only runs when explicitly enabled.
if [[ "${ALLOW_GH_MERGE:-0}" != "1" ]]; then
  echo "Set ALLOW_GH_MERGE=1 to enable merge helper."
  exit 1
fi

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "GH_TOKEN is required."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree must be clean before merge."
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required."
  exit 1
fi

gh auth status >/dev/null 2>&1

branch="$(git branch --show-current)"
if [[ "$branch" == "main" ]]; then
  echo "Already on main."
  exit 0
fi

git fetch origin main >/dev/null 2>&1 || true
gh pr create --base main --head "$branch" --title "Merge $branch into main" --body "Automated merge request from omo-SIN-Qwen." || true
gh pr merge --merge --auto --delete-branch
