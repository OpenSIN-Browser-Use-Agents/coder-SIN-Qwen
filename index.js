#!/usr/bin/env node
// Main CLI entrypoint for the standalone Qwen relay agent.
import { buildContext } from './context.js';
import { detectChromeProfileLock, resolveChromeConnectionConfig, runQwenSession } from './browser.js';
import { hydrateConsultContext, persistConsultMemory } from './consult-memory.js';
import { ensureReachableCdp, terminateChromeForUserDataDir } from './cdp-recovery.js';
import { parseQwenResponse } from './parser.js';
import { createSnapshot } from './git.js';
import { runSmokeCheck } from './smoke.js';
import { writeLogEntry, resolveLogFile } from './logger.js';
import { restoreLatestSnapshot, restoreSnapshot } from './restore.js';
import { runPreflight } from './preflight.js';
import { validateConsultResponse } from './validator.js';
import { attachLifecycleHooks } from './lifecycle.js';
import { getScopedEnv } from './runtime-config.js';

async function main() {
  attachLifecycleHooks();
  const argv = process.argv.slice(2);
  const jsonFlag = argv.includes('--json');
  const snapshotEnabled = argv.includes('--snapshot');
  const dryRunFlag = argv.includes('--dry-run');
  const smokeFlag = argv.includes('--smoke');
  const smokeLiveFlag = argv.includes('--smoke-live');
  const preflightFlag = argv.includes('--preflight');
  const projectRootArgIndex = argv.indexOf('--project-root');
  const projectRoot = projectRootArgIndex >= 0 ? String(argv[projectRootArgIndex + 1] || '').trim() : '';
  const restoreLastFlag = argv.includes('--restore-last');
  const restoreArgIndex = argv.indexOf('--restore');
  const restoreHash = restoreArgIndex >= 0 && /^[0-9a-f]{7,40}$/iu.test(argv[restoreArgIndex + 1] || '') ? argv[restoreArgIndex + 1] : '';
  const turnArgIndex = argv.indexOf('--turns');
  const maxTurns = turnArgIndex >= 0 ? Number(argv[turnArgIndex + 1] || 1) : 1;
  const input = argv.filter((arg, index) => {
    if (arg === '--turns') return false;
    if (turnArgIndex >= 0 && index === turnArgIndex + 1) return false;
    if (arg === '--project-root') return false;
    if (projectRootArgIndex >= 0 && index === projectRootArgIndex + 1) return false;
    if (arg === '--restore') return false;
    if (restoreArgIndex >= 0 && index === restoreArgIndex + 1) return false;
    return !arg.startsWith('--');
  }).join(' ').trim();
  if (!input && !smokeFlag && !smokeLiveFlag && !preflightFlag && !restoreLastFlag && !restoreHash) {
    console.error('Usage: ask-qwen [--json] [--snapshot] [--dry-run] [--smoke|--smoke-live] [--preflight] [--restore-last|--restore <hash>] [--project-root <path>] [--turns <n>] <prompt>');
    process.exit(1);
  }

  // Snapshot first so operators can roll back risky runs quickly.
  if (snapshotEnabled) {
    const snapshot = createSnapshot(process.cwd());
    if (snapshot) {
      console.error(`Git snapshot: ${snapshot.slice(0, 7)}`);
    }
  }

  if (smokeFlag || smokeLiveFlag) {
    const smoke = await runSmokeCheck({ live: smokeLiveFlag });
    console.log(JSON.stringify(smoke, null, 2));
    process.exit(smoke.ok ? 0 : 1);
  }

  if (preflightFlag) {
    const preflight = await runPreflight();
    console.log(JSON.stringify(preflight, null, 2));
    process.exit(preflight.ok ? 0 : 1);
  }

  if (restoreLastFlag || restoreHash) {
    // Restore mode is intentionally explicit to avoid mistaking prompt text for a hash.
    const restored = restoreHash || restoreLatestSnapshot();
    if (restoreHash) restoreSnapshot(restoreHash);
    console.log(JSON.stringify({ ok: true, restored: restoreHash || restored }, null, 2));
    return;
  }

  const baseContext = await buildContext({ prompt: input, projectRoot });
  const { context, consultMeta } = await hydrateConsultContext(baseContext, input);
  const dryRun = dryRunFlag || getScopedEnv('DRY_RUN', '0') === '1';
  const logFile = resolveLogFile();
  const sessionTimeoutMs = Number(getScopedEnv('SESSION_TIMEOUT_MS', '180000'));

  if (!dryRun) {
    await prepareChromeConnectionForRun();
  }

  // Persist lightweight structured logs so runs can be audited later.
  writeLogEntry({
    event: 'start',
    prompt: input,
    dryRun,
    snapshotEnabled,
    maxTurns,
    outputMode: jsonFlag ? 'json' : 'text',
    contextId: consultMeta?.contextId || '',
    messageId: consultMeta?.messageId || '',
    previousMessageId: consultMeta?.previousMessageId || ''
  }, logFile).catch(() => {});

  if (dryRun) {
    await writeStdout(`${JSON.stringify(context, null, 2)}\n`);
    writeLogEntry({
      event: 'dry-run',
      prompt: input,
      files: context.files?.length || 0,
      contextId: consultMeta?.contextId || '',
      messageId: consultMeta?.messageId || ''
    }, logFile).catch(() => {});
    return;
  }

  const reply = await runControlledConversation(context, input, maxTurns, sessionTimeoutMs);
  const parsed = parseQwenResponse(reply);
  const review = validateConsultResponse({ reply, parsed, context });
  parsed.review = review;
  await persistConsultMemory({ consultMeta, context, prompt: input, reply, parsed, review });

  if (jsonFlag) {
    await writeStdout(`${JSON.stringify(parsed, null, 2)}\n`);
  } else {
    const textOutput = review.retry_action === 'strip_fluff' ? review.cleaned_text : reply.trim();
    await writeStdout(`${textOutput}\n`);
  }

  writeLogEntry({
    event: 'finish',
    prompt: input,
    status: parsed.plan,
    actions: parsed.actions?.length || 0,
    reviewAction: review.retry_action,
    reviewPass: review.pass,
    outputMode: jsonFlag ? 'json' : 'text',
    contextId: consultMeta?.contextId || '',
    messageId: consultMeta?.messageId || '',
    previousMessageId: consultMeta?.previousMessageId || ''
  }, logFile).catch(() => {});
}

main().then(() => {
  // This CLI is single-shot; force a clean exit so lingering Playwright/CDP handles cannot hang the shell.
  process.exit(0);
}).catch((error) => {
  // Keep failure output compact and shell-friendly for OpenCode wrappers.
  console.error(error?.stack || String(error));
  process.exit(1);
});

function withTimeout(promise, ms, message) {
  // Fail fast instead of letting browser automation hang forever when the UI stops responding.
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })
  ]);
}

function writeStdout(text) {
  return new Promise((resolve, reject) => {
    process.stdout.write(text, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function runControlledConversation(initialContext, originalPrompt, maxTurns, sessionTimeoutMs) {
  // Keep same-chat follow-ups inside one browser session when explicit extra turns are requested.
  return withTimeout(
    runQwenSession(initialContext, { maxTurns, originalPrompt }),
    sessionTimeoutMs,
    `Qwen session timed out after ${sessionTimeoutMs}ms`
  );
}

async function prepareChromeConnectionForRun() {
  // If the default Chrome profile is already in use, prefer recovering a reachable CDP endpoint
  // instead of blindly falling back to a persistent launch that will fail under a profile lock.
  const launchConfig = resolveChromeConnectionConfig();
  if (launchConfig.mode === 'attach') return;

  const lockState = detectChromeProfileLock(launchConfig);
  if (!lockState.locked) return;

  const recovery = await ensureReachableCdp({ repoRoot: process.cwd(), env: process.env });
  if (recovery.ok && recovery.cdpUrl && !recovery.startedSidecar && !isSidecarFallbackUrl(recovery.cdpUrl)) {
    process.env.CHROME_CDP_URL = recovery.cdpUrl;
    return;
  }

  if (recovery.ok && recovery.startedSidecar && recovery.sidecarUserDataDir) {
    // Some sidecar Chrome instances expose CDP endpoints that Playwright cannot manage safely.
    // In that case, launch directly against the isolated sidecar clone instead of retrying the locked Default profile.
    terminateChromeForUserDataDir(recovery.sidecarUserDataDir);
    delete process.env.CHROME_CDP_URL;
    process.env.CHROME_PROFILE = recovery.sidecarUserDataDir;
    process.env.CHROME_PROFILE_DIRECTORY = recovery.profileDirectory || 'Default';
    return;
  }

  throw new Error(`Chrome profile is already in use and no reachable CDP endpoint could be recovered. ${recovery.error || 'Start a sidecar or export CHROME_CDP_URL manually.'}`.trim());
}

function isSidecarFallbackUrl(url) {
  return /127\.0\.0\.1:9444$/u.test(String(url || ''));
}
