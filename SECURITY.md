# Security

## Secret handling

- Do not commit secrets, tokens, cookies, or profile data.
- Do not auto-upload secrets to any third-party service without explicit approval.
- Use environment variables for local development.
- If your org uses a secret manager, integrate it deliberately and document the fields one by one.
- `GH_TOKEN` and any Infisical credentials should be stored in an approved secret manager, not in shell history.

## Browser profile safety

- `CHROME_PROFILE` points at a local Chrome `Default` profile.
- Keep that directory private and off shared machines.

## Reporting

If the Qwen UI changes or login breaks, treat it as a security-sensitive automation failure and re-verify manually.
