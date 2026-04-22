#!/usr/bin/env node
// Verification installs dependencies, runs tests, then performs syntax/build checks.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const pm = detectPackageManager(cwd);
const buildScript = detectBuildScript(cwd);

const preflight = run(process.execPath, ['./preflight.js'], cwd);
if (preflight.status !== 0) process.exit(preflight.status ?? 1);

if (!buildScript) {
  console.log('No build script found; skipping verification.');
  process.exit(0);
}

const install = run(pm, detectInstallArgs(pm, cwd), cwd);
if (install.status !== 0) process.exit(install.status ?? 1);

// Run tests first so build failures are not masked by broken code.
const tests = run(process.execPath, ['--test', 'test/*.test.js'], cwd);
if (tests.status !== 0) process.exit(tests.status ?? 1);

if (!buildScript) {
  console.log('No build script found; skipping build step.');
  process.exit(tests.status ?? 0);
}

const build = run(process.execPath, ['./scripts/build.mjs'], cwd);
process.exit(build.status ?? 1);

function detectPackageManager(root) {
  // Package manager detection keeps the helper portable across simple repos.
  if (fs.existsSync(path.join(root, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function detectBuildScript(root) {
  // Build/typecheck/lint are all valid verification endpoints.
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const scripts = pkg.scripts || {};
  return scripts.build ? 'build' : scripts.typecheck ? 'typecheck' : scripts.lint ? 'lint' : null;
}

function detectInstallArgs(pm, root) {
  // Prefer reproducible lockfile installs whenever the package manager supports them.
  if (pm === 'npm') {
    return fs.existsSync(path.join(root, 'package-lock.json')) ? ['ci'] : ['install'];
  }
  if (pm === 'pnpm') return ['install', '--frozen-lockfile'];
  if (pm === 'yarn') return ['install', '--immutable'];
  return ['install'];
}

function run(command, args, root) {
  // Use inherited stdio so CI and humans see the real command output.
  return spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: process.env
  });
}
