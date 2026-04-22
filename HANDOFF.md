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
- `/ask-qwen` through `.opencode/opencode.json`

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
- Raw Qwen text is now the default CLI output; use `--json` only when machine-readable parsing is needed.
- The live browser flow now auto-selects `Qwen3.6-Max-Preview` before the first prompt.
- After each completed turn the relay re-asserts `Qwen3.6-Max-Preview` to keep the active chat visually pinned to the intended model.
- Extra Qwen turns are opt-in only via `--turns 2+` and now stay in the same chat.
- The parser still prefers the final assistant JSON payload over echoed prompt JSON from the page body.
- Resolved milestones: `#1 Stabilize ask-qwen wrapper execution`, `#2 Support real multi-turn Qwen conversations`, `#3 Keep Max Preview pinned after each turn`.
- The repo-local OpenCode config now defines `/ask-qwen`, `/ask-qwen-json`, and the `omo-SIN-Qwen` agent directly in `.opencode/opencode.json` so the shell wrapper is no longer required.
