# Contributing to coder-SIN-Qwen

Thank you for your interest! Here's how to contribute.

## Getting Started

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Commit (`git commit -m 'feat: add amazing feature'`)
6. Push (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Development Setup

```bash
git clone https://github.com/OpenSIN-Browser-Use-Agents/coder-SIN-Qwen.git
cd coder-SIN-Qwen
pnpm install
node ./verify.js
```

## Code Style

- ES2022+ JavaScript (`.js` files)
- TypeScript welcome for new modules (`.ts` files)
- Run `pnpm test` before submitting
- Ensure TypeScript compiles: `pnpm run typecheck`
- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`

## Pull Request Checklist

- [ ] Tests pass (`pnpm test`)
- [ ] TypeScript check passes (`pnpm run typecheck`)
- [ ] New tests added for new functionality
- [ ] Documentation updated (README, INDEX, CHANGELOG)
- [ ] Plans updated in `plans/` if applicable
- [ ] Commits follow Conventional Commits format

## Reporting Bugs

Please use [GitHub Issues](https://github.com/OpenSIN-Browser-Use-Agents/coder-SIN-Qwen/issues) with:
- Clear description
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Node version, OS, Chrome version)
