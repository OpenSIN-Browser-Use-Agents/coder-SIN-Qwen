import fs from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function buildCandidateCdpUrls(env = process.env) {
  const urls = [
    env.CHROME_CDP_URL || '',
    env.CHROME_REMOTE_DEBUGGING_PORT ? `http://127.0.0.1:${env.CHROME_REMOTE_DEBUGGING_PORT}` : '',
    env.WEBAUTO_CDP_PORT ? `http://127.0.0.1:${env.WEBAUTO_CDP_PORT}` : '',
    'http://127.0.0.1:9335',
    'http://127.0.0.1:9222',
    'http://127.0.0.1:9444'
  ].filter(Boolean);

  return [...new Set(urls)];
}

export async function findReachableCdpUrl(env = process.env) {
  for (const candidate of buildCandidateCdpUrls(env)) {
    if (await isReachableCdp(candidate)) return candidate;
  }
  return '';
}

export async function isReachableCdp(baseUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`${baseUrl.replace(/\/$/u, '')}/json/version`, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureReachableCdp({ repoRoot, env = process.env, timeoutMs = 20_000 } = {}) {
  const existing = await findReachableCdpUrl(env);
  if (existing) {
    if (isSidecarFallbackUrl(existing)) {
      const sidecarUserDataDir = resolveSidecarUserDataDir(repoRoot, env);
      return {
        ok: true,
        cdpUrl: existing,
        startedSidecar: true,
        sidecarUserDataDir,
        profileDirectory: env.CHROME_PROFILE_DIRECTORY || 'Default'
      };
    }
    return { ok: true, cdpUrl: existing, startedSidecar: false };
  }

  if (!repoRoot) {
    return { ok: false, cdpUrl: '', startedSidecar: false, error: 'repoRoot is required to start sidecar recovery' };
  }

  const started = await startSidecar(repoRoot, env);
  if (!started.ok) return { ok: false, cdpUrl: '', startedSidecar: false, error: started.error };

  const resolved = await waitForReachableCdp(buildCandidateCdpUrls(env), timeoutMs);
  if (resolved) return { ok: true, cdpUrl: resolved, startedSidecar: true, sidecarUserDataDir: started.userDataDir, profileDirectory: started.profileDirectory };

  // Even if CDP attach is not usable, the sidecar clone can still be launched directly as an isolated browser context.
  if (started.userDataDir) {
    return { ok: true, cdpUrl: '', startedSidecar: true, sidecarUserDataDir: started.userDataDir, profileDirectory: started.profileDirectory };
  }

  return { ok: false, cdpUrl: '', startedSidecar: true, error: `No reachable CDP endpoint found after ${timeoutMs}ms` };
}

export async function waitForReachableCdp(candidates, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    for (const candidate of candidates) {
      if (await isReachableCdp(candidate)) return candidate;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return '';
}

async function startSidecar(repoRoot, env) {
  try {
    const recoveryEnv = {
      ...env,
      CHROME_REMOTE_DEBUGGING_PORT: env.CHROME_REMOTE_DEBUGGING_PORT || '9444'
    };
    const launched = await launchSidecarDirectly(repoRoot, recoveryEnv, Number(env.CHROME_SIDECAR_START_TIMEOUT_MS || 25000));
    return { ok: true, ...launched };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function launchSidecarDirectly(repoRoot, env, timeoutMs) {
  const port = env.CHROME_REMOTE_DEBUGGING_PORT || '9444';
  const profileDirectory = env.CHROME_PROFILE_DIRECTORY || 'Default';
  const userDataDir = resolveSidecarUserDataDir(repoRoot, env);
  const sidecarRoot = path.dirname(userDataDir);
  const profileDir = path.join(userDataDir, profileDirectory);
  await fs.rm(sidecarRoot, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(profileDir, { recursive: true });

  if (process.platform === 'darwin') {
    await runSpawn('open', ['-na', 'Google Chrome', '--args',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      `--profile-directory=${profileDirectory}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ], repoRoot, env, timeoutMs);
  } else {
    await runSpawn('google-chrome', [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      `--profile-directory=${profileDirectory}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ], repoRoot, env, timeoutMs);
  }

  return {
    userDataDir,
    profileDirectory,
    port
  };
}

function resolveSidecarUserDataDir(repoRoot, env) {
  const sidecarRoot = env.CHROME_SIDECAR_ROOT || path.join(os.tmpdir(), 'coder-sin-qwen-sidecar');
  return path.join(sidecarRoot, 'user-data');
}

function isSidecarFallbackUrl(url) {
  return /127\.0\.0\.1:9444$/u.test(String(url || ''));
}

function runSpawn(command, args, cwd, env, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'ignore'
    });
    const timeout = setTimeout(() => {
      resolve();
    }, timeoutMs);
    if (typeof timeout.unref === 'function') timeout.unref();
    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0 || process.platform === 'darwin') resolve();
      else reject(new Error(`sidecar launch exited with code ${code}`));
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

export function toFileUrl(filePath) {
  return pathToFileURL(filePath).href;
}

export function terminateChromeForUserDataDir(userDataDir) {
  if (!userDataDir) return;
  try {
    const output = execFileSync('pgrep', ['-fal', 'Google Chrome'], { encoding: 'utf8' }).trim();
    if (!output) return;
    for (const line of output.split('\n')) {
      if (!line.includes(userDataDir)) continue;
      const pid = Number(line.trim().split(/\s+/u)[0]);
      if (Number.isFinite(pid)) {
        try { process.kill(pid, 'SIGTERM'); } catch {}
      }
    }
  } catch {
    // Ignore missing process-list tools.
  }
}
