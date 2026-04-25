import fs from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { detectChromeProfileLock, resolveChromeConnectionConfig } from './browser.js';

const DEFAULT_QWEN_URL = 'https://chat.qwen.ai';

export function resolveStartupUrl(env = process.env) {
  return String(env.QWEN_URL || DEFAULT_QWEN_URL).trim() || DEFAULT_QWEN_URL;
}

export function resolveChromeBinaryPath(env = process.env, platform = process.platform) {
  const explicit = String(env.CHROME_BIN || '').trim();
  if (explicit) return explicit;
  if (platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (platform === 'win32') return 'chrome.exe';
  return 'google-chrome';
}

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

export async function prepareChromeConnectionForRun({ repoRoot = process.cwd() } = {}) {
  const launchConfig = resolveChromeConnectionConfig();
  if (launchConfig.mode === 'attach') {
    return { prepared: false, launchConfig, lockState: null, recovery: null };
  }

  const lockState = detectChromeProfileLock(launchConfig);
  if (!lockState.locked) {
    return { prepared: false, launchConfig, lockState, recovery: null };
  }

  const recovery = await ensureReachableCdp({ repoRoot, env: process.env });
  if (recovery.ok && recovery.cdpUrl && !isSidecarFallbackUrl(recovery.cdpUrl)) {
    process.env.CHROME_CDP_URL = recovery.cdpUrl;
    return { prepared: true, launchConfig, lockState, recovery, mode: 'attach' };
  }

  if (recovery.ok && recovery.startedSidecar && recovery.sidecarUserDataDir) {
    terminateChromeForUserDataDir(recovery.sidecarUserDataDir);
    delete process.env.CHROME_CDP_URL;
    process.env.CHROME_PROFILE = recovery.sidecarUserDataDir;
    process.env.CHROME_PROFILE_DIRECTORY = recovery.profileDirectory || 'Default';
    return {
      prepared: true,
      launchConfig,
      lockState,
      recovery,
      mode: 'launch',
      sidecarUserDataDir: recovery.sidecarUserDataDir,
      profileDirectory: recovery.profileDirectory || 'Default'
    };
  }

  throw new Error(`Chrome profile is already in use and no reachable CDP endpoint could be recovered. ${recovery.error || 'Start a sidecar or export CHROME_CDP_URL manually.'}`.trim());
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
    const profileDirectory = await detectBestChromeProfileDirectory(env);
    const recoveryEnv = {
      ...env,
      CHROME_REMOTE_DEBUGGING_PORT: env.CHROME_REMOTE_DEBUGGING_PORT || '9444',
      CHROME_PROFILE_DIRECTORY: profileDirectory,
      CHROME_SIDECAR_SYNC_MODE: env.CHROME_SIDECAR_SYNC_MODE || 'full'
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
  const startupUrl = resolveStartupUrl(env);
  const sidecarRoot = path.dirname(userDataDir);
  const profileDir = path.join(userDataDir, profileDirectory);
  await fs.rm(sidecarRoot, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(profileDir, { recursive: true });

  await cloneChromeProfileState({
    sourceProfile: env.CHROME_PROFILE || defaultChromeUserDataDir(),
    profileDirectory,
    userDataDir,
    profileDir,
    syncMode: env.CHROME_SIDECAR_SYNC_MODE || 'minimal',
    startupUrl
  });

  await runSpawn(resolveChromeBinaryPath(env), [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--profile-directory=${profileDirectory}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--disable-features=SessionRestore,RestoreBackgroundContents',
    startupUrl
  ], repoRoot, env, timeoutMs);

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

async function cloneChromeProfileState({ sourceProfile, profileDirectory, userDataDir, profileDir, syncMode, startupUrl }) {
  const sourcePath = path.resolve(sourceProfile);
  const sourceUserDataDir = looksLikeProfileDir(sourcePath) ? path.dirname(sourcePath) : sourcePath;
  const sourceProfileDir = looksLikeProfileDir(sourcePath) ? sourcePath : path.join(sourcePath, profileDirectory);

  if (syncMode === 'none') {
    await seedChromeStartupPreferences(profileDir, startupUrl);
    return;
  }

  const rootItems = ['Local State', 'First Run', 'Last Version'];
  const minimalItems = [
    'Preferences',
    'Secure Preferences',
    'Cookies',
    'Cookies-journal',
    'IndexedDB',
    'Session Storage',
    'Local Storage',
    'Sessions',
    'Login Data',
    'Login Data For Account',
    'Login Data-journal',
    'Login Data For Account-journal',
    'Service Worker',
    'Storage',
    'Web Data',
    'Web Data-journal'
  ];

  for (const name of rootItems) {
    await copyIfExists(path.join(sourceUserDataDir, name), path.join(userDataDir, name));
  }

  const profileItems = syncMode === 'full'
    ? await listCopyableItems(sourceProfileDir)
    : minimalItems;

  for (const name of profileItems) {
    await copyIfExists(path.join(sourceProfileDir, name), path.join(profileDir, name));
  }

  await seedChromeStartupPreferences(profileDir, startupUrl);
}

export async function seedChromeStartupPreferences(profileDir, startupUrl) {
  const preferencesPath = path.join(profileDir, 'Preferences');
  let prefs = {};

  try {
    const raw = await fs.readFile(preferencesPath, 'utf8');
    prefs = raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  if (!prefs.session || typeof prefs.session !== 'object' || Array.isArray(prefs.session)) {
    prefs.session = {};
  }

  prefs.session.restore_on_startup = 4;
  prefs.session.startup_urls = [startupUrl];
  prefs.homepage = startupUrl;
  prefs.homepage_is_newtabpage = false;

  await fs.mkdir(path.dirname(preferencesPath), { recursive: true });
  await fs.writeFile(preferencesPath, `${JSON.stringify(prefs, null, 2)}\n`);
}

async function listCopyableItems(sourceProfileDir) {
  const entries = await fs.readdir(sourceProfileDir, { withFileTypes: true });
  return entries
    .map((entry) => entry.name)
    .filter((name) => !['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'RunningChromeVersion', 'Crashpad', 'GPUCache', 'GrShaderCache', 'ShaderCache', 'Code Cache', 'DawnCache', 'Visited Links', 'chrome_debug.log'].includes(name));
}

async function copyIfExists(source, destination) {
  try {
    const stat = await fs.stat(source);
    if (stat.isDirectory()) {
      await fs.cp(source, destination, { recursive: true, force: true, errorOnExist: false });
    } else {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(source, destination);
    }
  } catch {
    // Ignore missing files in partial profile copies.
  }
}

async function detectBestChromeProfileDirectory(env) {
  const explicit = String(env.CHROME_PROFILE_DIRECTORY || '').trim();
  if (explicit && explicit.toLowerCase() !== 'auto') return explicit;

  const userDataDir = String(env.CHROME_PROFILE || '').trim() || defaultChromeUserDataDir();
  const root = looksLikeProfileDir(userDataDir) ? path.dirname(userDataDir) : userDataDir;
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return 'Default';
  }

  const scored = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (!/^(Default|Profile\s+\d+|Guest Profile|System Profile)$/u.test(name)) continue;
    const qwenDb = path.join(root, name, 'IndexedDB', 'https_chat.qwen.ai_0.indexeddb.leveldb');
    let size = 0;
    try {
      const files = await fs.readdir(qwenDb, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile()) continue;
        const stat = await fs.stat(path.join(qwenDb, file.name));
        size += stat.size;
      }
    } catch {
      size = 0;
    }
    scored.push({ name, size });
  }

  scored.sort((a, b) => b.size - a.size || (a.name === 'Default' ? -1 : 1));
  return scored[0]?.name || 'Default';
}

function defaultChromeUserDataDir() {
  const platform = os.platform();
  return platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome')
    : platform === 'win32'
      ? path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data')
      : path.join(os.homedir(), '.config', 'google-chrome');
}

function looksLikeProfileDir(value) {
  const name = path.basename(value);
  return /^(Default|Profile\s+\d+|Guest Profile|System Profile)$/u.test(name);
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
