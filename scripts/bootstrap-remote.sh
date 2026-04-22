#!/usr/bin/env bash
set -euo pipefail

# Guarded helper to create a GitHub remote repo for this local standalone agent.
if [[ "${ALLOW_GH_REMOTE_CREATE:-0}" != "1" ]]; then
  echo "Set ALLOW_GH_REMOTE_CREATE=1 to allow remote creation."
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required."
  exit 1
fi

repo_name="${GH_REPO_NAME:-$(basename "$PWD")}" 
visibility="${GH_REPO_VISIBILITY:-private}"
owner="${GH_REPO_OWNER:-$(gh api user -q .login)}"
repo_full_name="$owner/$repo_name"
ssh_url="git@github.com:${repo_full_name}.git"

if ! gh repo view "$repo_full_name" >/dev/null 2>&1; then
  gh api --method POST user/repos \
    -f name="$repo_name" \
    -f private="$([[ "$visibility" == "private" ]] && echo true || echo false)" \
    -f has_issues=false \
    -f has_projects=false \
    -f has_wiki=false >/dev/null
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$ssh_url"
else
  git remote add origin "$ssh_url"
fi

echo "Configured origin: $ssh_url"
