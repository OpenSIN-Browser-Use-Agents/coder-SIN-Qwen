#!/usr/bin/env node
// Git helpers used for safe snapshot/rollback flows.
import { execFileSync } from 'node:child_process';

export function isGitRepo(cwd = process.cwd()) {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

export function createSnapshot(cwd = process.cwd(), message = '🤖 SIN-Qwen: Pre-apply snapshot') {
  // Snapshot commits are intentionally local guardrails before risky automation runs.
  if (!isGitRepo(cwd)) return null;

  try {
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd,
      encoding: 'utf8'
    }).trim();

    if (!status) {
      return execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd,
        encoding: 'utf8'
      }).trim();
    }

    execFileSync('git', ['add', '-A'], { cwd, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', message, '--allow-empty'], {
      cwd,
      stdio: 'ignore'
    });

    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8'
    }).trim();
  } catch {
    return null;
  }
}
