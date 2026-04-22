# Merge Runbook

## Goal

Merge a validated branch to `main` using the guarded GitHub helper.

## Requirements

- clean working tree
- `ALLOW_GH_MERGE=1`
- `GH_TOKEN`
- `gh auth status` succeeds
- remote `origin` exists (or bootstrap it first)

## Steps

1. `npm run verify`
2. `npm run secrets:check`
3. `git status --short`
4. `export ALLOW_GH_REMOTE_CREATE=1` and `npm run remote:init` if no remote exists
5. `export ALLOW_GH_MERGE=1`
6. `export GH_TOKEN=...`
7. `npm run merge:main`

## Notes

- The helper creates a PR if needed, then asks GitHub to merge it.
- It refuses to run with a dirty working tree.
