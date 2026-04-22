#!/usr/bin/env node
// Push selected repo settings into Infisical when the operator explicitly allows it.
import { execFileSync } from 'node:child_process';
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

  for (const [name, value] of entries) {
    const args = ['secrets', 'set', `${name}=${value}`, '--env', envName, '--path', secretPath, '--silent'];
    if (projectId) args.push('--projectId', projectId);

    execFileSync('infisical', args, {
      stdio: 'inherit'
    });
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
