# Secrets Checklist

## SecretClient (Zero-Trust)

All secret access now goes through `SecretClient` (`packages/qwen-core/lib/secret-client.js`), which:

- Reads from `process.env` first, falls back to `.env.local`
- **Never logs secret values** — only availability status
- Provides typed `get()` / `getOptional()` / `has()` access
- Validates against a schema (`packages/qwen-core/secret-schema.js`)
- Runs `audit()` for preflight checks

## Required for live runs

- `CHROME_PROFILE`
- `CHROME_PROFILE_DIRECTORY` (when `CHROME_PROFILE` points at the user-data root)
- `QWEN_ACCOUNT_1_EMAIL`
- `QWEN_ACCOUNT_1_PASSWORD`

## Qwen account rotation

- `QWEN_ACCOUNT_ORDER`
- `QWEN_ACCOUNT_STATE_FILE`
- `QWEN_ACCOUNT_2_EMAIL`
- `QWEN_ACCOUNT_2_PASSWORD`
- `QWEN_ACCOUNT_3_EMAIL`
- `QWEN_ACCOUNT_3_PASSWORD`

## Strongly recommended

- `CHROME_CDP_URL`
- `CHROME_REMOTE_DEBUGGING_PORT`
- `QWEN_URL`
- `QWEN_AUTH_METHOD`
- `SIN_CODER_QWEN_LOG_FILE`
- `SIN_CODER_QWEN_ARTIFACT_DIR`
- `INFISICAL_ENV_NAME`
- `INFISICAL_SECRET_PATH`
- `INFISICAL_PROJECT_ID`
- `GH_TOKEN`

## Validate locally

```bash
node ./packages/qwen-core/secrets-check.js
```

Or via preflight (includes SecretClient audit):

```bash
node ./preflight.js
```

Both commands output a structured audit report showing which secrets are present and which are missing. Secret values are never included in the output.

## Pull from Infisical

```bash
pnpm run secrets:pull
```

Then validate again:

```bash
node ./packages/qwen-core/secrets-check.js
```

## Push current values

If the active Infisical project is already correct:

```bash
export INFISICAL_PROJECT_ID="fa7758b4-f84c-4297-966e-710056d531ef"
export INFISICAL_SECRET_PATH="/opensin/coder-sin-qwen"
pnpm run secrets:push
```

This only pushes values that are actually present in `process.env` or `.env.local`.
The repo uses `INFISICAL_PROJECT_ID` for non-interactive CLI runs when `.infisical.json` is not linked.
