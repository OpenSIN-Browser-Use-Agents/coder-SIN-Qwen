#!/usr/bin/env node
// Smoke checks verify that the local profile and browser dependencies are usable.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { detectChromeProfileLock, resolveChromeConnectionConfig, runBrowserE2ECheck } from './browser.js';
import { writeLogEntry } from './logger.js';

export async function runSmokeCheck({ live = process.env.SIN_OMO_QWEN_SMOKE_LIVE === '1' } = {}) {
  // Start with cheap checks, then optionally escalate to a live browser proof.
  const launchConfig = resolveChromeConnectionConfig();
  const profilePath = launchConfig.profilePath;
  const lockState = detectChromeProfileLock(launchConfig);
  const result = {
    ok: false,
    profilePath,
    userDataDir: launchConfig.userDataDir,
    profileDirectory: launchConfig.profileDirectory,
    connectionMode: launchConfig.mode,
    cdpUrl: launchConfig.cdpUrl || '',
    lockState,
    playwright: false,
    notes: []
  };

  if (!fs.existsSync(profilePath)) {
    result.notes.push(`Chrome profile missing: ${profilePath}`);
    await writeLogEntry({ event: 'smoke', ...result });
    return result;
  }

  try {
    // Dynamic import keeps the smoke check usable even when Playwright is absent.
    await import('playwright');
    result.playwright = true;
    result.ok = true;
    result.notes.push('Chrome profile found and Playwright available.');
  } catch {
    result.notes.push('Playwright is not installed.');
    await writeLogEntry({ event: 'smoke', ...result });
    return result;
  }

  if (live) {
    try {
      const liveResult = await runBrowserE2ECheck();
      result.notes.push(`Live browser check: ${liveResult.title || liveResult.url}`);
      result.live = liveResult;
      result.ok = liveResult.ok;
    } catch (error) {
      result.ok = false;
      result.notes.push(`Live browser check failed: ${error?.message || String(error)}`);
    }
  }

  await writeLogEntry({ event: 'smoke', ...result });
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Keep the file usable both as a CLI entrypoint and as an imported helper.
  const live = process.argv.includes('--live');
  runSmokeCheck({ live }).then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }).catch((error) => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}
