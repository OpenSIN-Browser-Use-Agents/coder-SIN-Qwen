#!/usr/bin/env node
// Syntax-only build gate for the standalone JS files in this repo.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const files = [
  'index.js',
  'browser.js',
  'context.js',
  'parser.js',
  'preflight.js',
  'push-secrets.js',
  'secrets-check.js',
  'git.js',
  'logger.js',
  'ignore-filter.js',
  'smoke.js',
  'restore.js',
  'verify.js',
  'test/browser.test.js',
  'test/parser.test.js',
  'test/ignore-filter.test.js',
  'test/selectors.test.js',
  'test/secrets-check.test.js',
  'test/push-secrets.test.js'
].filter((file) => fs.existsSync(file));

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
}

console.log('Build check passed.');
