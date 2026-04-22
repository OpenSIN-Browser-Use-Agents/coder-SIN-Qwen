#!/usr/bin/env node
// Secret validation stays local; it only checks that expected names are present.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const requiredFile = path.join(root, 'secrets.required.json');
const envFile = path.join(root, '.env.local');

export function loadSecretsSpec() {
  return JSON.parse(fs.readFileSync(requiredFile, 'utf8'));
}

export function loadEnvFile(filePath = envFile) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.replace(/^export\s+/u, ''))
      .map((line) => {
        const index = line.indexOf('=');
        return index === -1 ? [line, ''] : [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

export function checkSecrets(env = process.env, spec = loadSecretsSpec(), localEnv = loadEnvFile()) {
  const present = (name) => Boolean(env[name] || localEnv[name]);

  return {
    requiredMissing: spec.required.filter((name) => !present(name)),
    recommendedMissing: spec.recommended.filter((name) => !present(name))
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkSecrets();
  const ok = result.requiredMissing.length === 0;
  console.log(JSON.stringify({ ok, ...result }, null, 2));
  process.exit(ok ? 0 : 1);
}
