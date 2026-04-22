import fs from 'node:fs';
import path from 'node:path';
import ignore from 'ignore';

// Defaults block obvious noise and secrets even when the repo forgets to define them.
const DEFAULT_PATTERNS = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.vercel',
  '.netlify',
  '*.log',
  '*.lock',
  '*.lockb',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12'
];

export function loadIgnorePatterns(cwd = process.cwd()) {
  // Prefer .qwenignore, then fall back to .gitignore for a familiar developer workflow.
  const qwenPath = path.join(cwd, '.qwenignore');
  const gitPath = path.join(cwd, '.gitignore');

  let raw = [];
  if (fs.existsSync(qwenPath)) {
    raw = fs.readFileSync(qwenPath, 'utf8').split(/\r?\n/u);
  } else if (fs.existsSync(gitPath)) {
    raw = fs.readFileSync(gitPath, 'utf8').split(/\r?\n/u);
  }

  const patterns = [...new Set([...raw, ...DEFAULT_PATTERNS])]
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .filter((pattern) => !pattern.startsWith('#'));

  return ignore().add(patterns);
}

export function filterPaths(fileList, ig) {
  // The ignore package expects POSIX-style paths, so normalize first.
  return ig.filter(fileList.map(normalizePath));
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}
