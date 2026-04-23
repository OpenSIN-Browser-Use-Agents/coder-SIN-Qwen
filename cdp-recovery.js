import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function buildCandidateCdpUrls(env = process.env) {
  const urls = [
    env.CHROME_CDP_URL || '',
    env.CHROME_REMOTE_DEBUGGING_PORT ? `http://127.0.0.1:${env.CHROME_REMOTE_DEBUGGING_PORT}` : '',
    env.WEBAUTO_CDP_PORT ? `http://127.0.0.1:${env.WEBAUTO_CDP_PORT}` : '',
    'http://127.0.0.1:9335',
    'http://127.0.0.1:9222'
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
  if (existing) return { ok: true, cdpUrl: existing, startedSidecar: false };

  if (!repoRoot) {
    return { ok: false, cdpUrl: '', startedSidecar: false, error: 'repoRoot is required to start sidecar recovery' };
  }

  const started = await startSidecar(repoRoot, env);
  if (!started.ok) return { ok: false, cdpUrl: '', startedSidecar: false, error: started.error };

  const resolved = await waitForReachableCdp(buildCandidateCdpUrls(env), timeoutMs);
  if (resolved) return { ok: true, cdpUrl: resolved, startedSidecar: true };

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
    await runNodeScript(path.join(repoRoot, 'scripts', 'start-cdp-sidecar.sh'), env, repoRoot);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function runNodeScript(scriptPath, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [scriptPath], {
      cwd,
      env,
      stdio: 'ignore'
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`sidecar launch exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

export function toFileUrl(filePath) {
  return pathToFileURL(filePath).href;
}
