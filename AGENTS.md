# AGENTS.md — omo-SIN-Qwen

## Purpose

`omo-SIN-Qwen` is a standalone OpenCode agent repo that relays work to Qwen through the local Chrome `Default` profile.

## Rules

- Keep the browser flow UI-only.
- Do not add API fallbacks.
- Prefer `CHROME_PROFILE` for the local Chrome profile path.
- Prefer `CHROME_PROFILE_DIRECTORY=Default` when `CHROME_PROFILE` points at the user-data root.
- Preserve `--snapshot` and `--dry-run` behavior.
- Preserve `--smoke` and JSONL logging behavior.
- Preserve `--preflight` behavior and the Node 20 floor.
- Preserve `secrets:check` and `live:prepare` behavior.
- Preserve `secrets:pull` and `restore:last` behavior.
- Keep `.qwenignore` filtering active.
- Never commit secrets or browser cookies.
- Update `README.md`, `INDEX.md`, `INSTALL.md`, and `HANDOFF.md` when behavior changes.

## Validation

Run this before shipping changes:

```bash
node ./verify.js
```

## Entry points

- `node ./index.js <prompt>`
- `npm run verify`
- `npm run ask`
- `/ask-qwen` through `.opencode/commands/ask-qwen.sh`
