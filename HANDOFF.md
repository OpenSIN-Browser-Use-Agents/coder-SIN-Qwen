# Hand-off for Future OpenCode Agents

## Repo purpose

`omo-SIN-Qwen` is a standalone OpenCode agent repo that relays tasks to Qwen through the local Chrome `Default` profile.

## Current guarantees

- UI-only browser flow
- no API fallback
- strict Chrome profile use via `CHROME_PROFILE`
- optional `--snapshot` Git safety
- optional `--dry-run`
- `.qwenignore` token filtering

## Main entrypoints

- `node ./index.js <prompt>`
- `npm run verify`
- `npm run ask`
- `/ask-qwen` through `.opencode/commands/ask-qwen.sh`

## Important files

- `index.js`
- `browser.js`
- `context.js`
- `ignore-filter.js`
- `git.js`
- `verify.js`

## Before changing behavior

1. Run `node ./verify.js`
2. Keep `browser.js` UI-only
3. Keep the repo self-contained
4. Update `README.md`, `INDEX.md`, and `INSTALL.md` if workflow changes

## Notes

- Default profile path is resolved automatically per OS.
- The browser selectors are intentionally conservative and may need updates when Qwen UI changes.
- Attach mode now prefers reusing an existing blank tab and leaves the attached tab open.
- Non-interactive Infisical sync now expects `INFISICAL_PROJECT_ID` when the repo is not linked with `infisical init`.
- Prompt delivery is now human-style text instead of a forced JSON-status instruction.
- The parser still prefers the final assistant JSON payload over echoed prompt JSON from the page body.
