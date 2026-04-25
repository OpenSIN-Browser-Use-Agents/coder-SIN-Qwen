#!/usr/bin/env node
// Preflight checks catch missing tools before a long browser run starts.
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { detectChromeProfileLock, resolveChromeConnectionConfig } from './browser.js';
import { buildCandidateCdpUrls } from './cdp-recovery.js';
import { getScopedEnv } from './runtime-config.js';

const execFileAsync = promisify(execFile);

export async function runPreflight() {
  const launchConfig = resolveChromeConnectionConfig();
  const nodeMajor = Number(process.versions.node.split('.')[0] || 0);
  const requireProfile = getScopedEnv('REQUIRE_PROFILE', '0') === '1' || (!process.env.CI && getScopedEnv('DRY_RUN', '0') !== '1');
  const lockState = detectChromeProfileLock(launchConfig);
  const allowedSidecarUrl = `http://127.0.0.1:${process.env.CHROME_REMOTE_DEBUGGING_PORT || '9444'}`;
  const configuredAttachUrl = String(process.env.CHROME_CDP_URL || '').trim();
  const connectionPolicyOk = !configuredAttachUrl || configuredAttachUrl === allowedSidecarUrl;
  const checks = {
    node: { ok: nodeMajor >= 20, version: process.versions.node },
    git: await commandStatus('git', ['--version']),
    gh: await optionalCommandStatus('gh', ['--version']),
    infisical: await optionalCommandStatus('infisical', ['--version']),
    chromeProfile: {
      ok: fs.existsSync(launchConfig.profilePath) || !requireProfile,
      required: requireProfile,
      path: launchConfig.profilePath,
      userDataDir: launchConfig.userDataDir,
      profileDirectory: launchConfig.profileDirectory
    },
    chromeConnection: {
      mode: launchConfig.mode,
      cdpUrl: launchConfig.cdpUrl || '',
      candidates: buildCandidateCdpUrls(process.env),
      allowedSidecarUrl,
      policyOk: connectionPolicyOk,
      policyMessage: connectionPolicyOk ? '' : `CHROME_CDP_URL must match the prepared sidecar endpoint (${allowedSidecarUrl}).`
    },
    chromeLock: lockState
  };

  return {
    ok: checks.node.ok && checks.git.ok && checks.chromeProfile.ok && checks.chromeConnection.policyOk,
    ...checks
  };
}

async function commandStatus(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { encoding: 'utf8' });
    return { ok: true, output: (stdout || stderr || '').trim() };
  } catch (error) {
    return { ok: false, output: error?.message || String(error) };
  }
}

async function optionalCommandStatus(command, args) {
  const result = await commandStatus(command, args);
  return {
    ...result,
    optional: true
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPreflight().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }).catch((error) => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}
