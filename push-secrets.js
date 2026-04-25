#!/usr/bin/env node
// Push selected repo settings into Infisical when the operator explicitly allows it.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkSecrets, loadEnvFile, loadSecretsSpec } from './secrets-check.js';

export function collectSecretEntries(env = process.env, localEnv = loadEnvFile(), spec = loadSecretsSpec()) {
  const names = [...new Set([...spec.required, ...spec.recommended])];
  return names
    .map((name) => [name, env[name] || localEnv[name] || ''])
    .filter(([, value]) => value !== '');
}

export function pushSecrets(entries, options = {}) {
  const envName = options.envName || process.env.INFISICAL_ENV_NAME || 'dev';
  const secretPath = options.secretPath || process.env.INFISICAL_SECRET_PATH || '/';
  const projectId = options.projectId || process.env.INFISICAL_PROJECT_ID || '';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coder-sin-qwen-secrets-'));
  const envFile = path.join(tempDir, '.infisical-push.env');

  try {
    const payload = entries
      .map(([name, value]) => `${name}=${JSON.stringify(String(value))}`)
      .join('\n');

    fs.writeFileSync(envFile, `${payload}\n`, { encoding: 'utf8', mode: 0o600 });

    const args = ['secrets', 'set', '--file', envFile, '--env', envName, '--path', secretPath, '--silent'];
    if (projectId) args.push('--projectId', projectId);

    execFileSync('infisical', args, {
      stdio: 'inherit'
    });
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  const spec = loadSecretsSpec();
  const localEnv = loadEnvFile();
  const status = checkSecrets(process.env, spec, localEnv);
  const entries = collectSecretEntries(process.env, localEnv, spec);

  if (!apply) {
    console.log(JSON.stringify({ ok: status.requiredMissing.length === 0, apply: false, entries: entries.map(([name]) => name), ...status }, null, 2));
    process.exit(status.requiredMissing.length === 0 ? 0 : 1);
  }

  if (!process.env.INFISICAL_PROJECT_ID) {
    console.error('INFISICAL_PROJECT_ID is required for non-interactive secrets:push runs when the repo is not linked with infisical init.');
    process.exit(1);
  }

  pushSecrets(entries);
  console.log(JSON.stringify({ ok: true, apply: true, pushed: entries.map(([name]) => name) }, null, 2));
}
