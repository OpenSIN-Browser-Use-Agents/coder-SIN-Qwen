# Secrets Checklist

## Required for live runs

- `CHROME_PROFILE`
- `CHROME_PROFILE_DIRECTORY` (when `CHROME_PROFILE` points at the user-data root)

## Strongly recommended

- `CHROME_CDP_URL`
- `CHROME_REMOTE_DEBUGGING_PORT`
- `QWEN_URL`
- `SIN_OMO_QWEN_LOG_FILE`
- `SIN_OMO_QWEN_ARTIFACT_DIR`
- `INFISICAL_ENV_NAME`
- `INFISICAL_SECRET_PATH`
- `INFISICAL_PROJECT_ID`
- `GH_TOKEN`

## Validate locally

```bash
node ./secrets-check.js
```

## Pull from Infisical

```bash
npm run secrets:pull
```

Then validate again:

```bash
node ./secrets-check.js
```

## Push current values

If the active Infisical project is already correct:

```bash
export INFISICAL_PROJECT_ID="your-project-id"
npm run secrets:push
```

This only pushes values that are actually present in `process.env` or `.env.local`.
The repo uses `INFISICAL_PROJECT_ID` for non-interactive CLI runs when `.infisical.json` is not linked.
