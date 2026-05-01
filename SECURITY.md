# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please:

1. **DO NOT** open a public issue
2. Email us at: security@opensin.ai
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work with you to resolve the issue.

## Security Best Practices

- Never commit secrets or API keys to the repository
- Use environment variables or Infisical for all credentials
- The SecretClient (`packages/qwen-core/lib/secret-client.js`) never logs secret values
- Review all PRs for security implications
- Keep dependencies updated via Dependabot

## Supported Versions

| Version | Supported |
| :------ | :-------- |
| 0.x.x   | ✅        |
