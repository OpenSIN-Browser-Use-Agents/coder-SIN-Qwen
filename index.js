#!/usr/bin/env node
// Main CLI entrypoint for the standalone Qwen relay agent.
import { buildContext } from './context.js';
import { runQwenSession } from './browser.js';
import { hydrateConsultContext, persistConsultMemory } from './consult-memory.js';
import { prepareChromeConnectionForRun } from './cdp-recovery.js';
import { parseQwenResponse } from './parser.js';
import { createSnapshot } from './git.js';
import { runSmokeCheck } from './smoke.js';
import { writeLogEntry, resolveLogFile } from './logger.js';
import { restoreLatestSnapshot, restoreSnapshot } from './restore.js';
import { runPreflight } from './preflight.js';
import { validateConsultResponse } from './validator.js';
import { attachLifecycleHooks, registerLifecycleResource, runLifecycleCleanup } from './lifecycle.js';
import { getScopedEnv, validateRuntimeConfig } from './runtime-config.js';
import { installTraceContext } from './trace.js';
import { prepareTemporaryPublicTaskFile } from './public-task-file.js';

async function main() {
  attachLifecycleHooks();
  const runtimeConfig = validateRuntimeConfig();
  const traceContext = installTraceContext(process.env, { spanId: process.env.SIN_CODER_QWEN_SPAN_ID || '' });
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
  const promptForQwen = typeof baseContext === 'string' ? baseContext : baseContext.prompt;
  const hydrated = await hydrateConsultContext(baseContext, promptForQwen);
  let context = hydrated.context;
  const consultMeta = hydrated.consultMeta;
  const dryRun = dryRunFlag || runtimeConfig.dryRun;
  const logFile = resolveLogFile();
  const sessionTimeoutMs = runtimeConfig.sessionTimeoutMs;

  if (!dryRun && context?.repo) {
    const publicTaskFile = await prepareTemporaryPublicTaskFile({
      context,
      prompt: promptForQwen,
      projectRoot: projectRoot || context?.repo?.cwd || process.cwd(),
      taskId: consultMeta?.contextId || traceContext.runId
    });

    if (publicTaskFile) {
      registerLifecycleResource(`public-task-file:${consultMeta?.contextId || traceContext.runId}`, publicTaskFile.cleanup);
      context = {
        ...context,
        publicTaskFile
      };
    }
  }

  if (!dryRun) {
    await prepareChromeConnectionForRun();
  }

  // Persist lightweight structured logs so runs can be audited later.
  writeLogEntry({
    event: 'start',
    prompt: promptForQwen,
    rawPrompt: input,
    dryRun,
    snapshotEnabled,
    maxTurns,
    outputMode: jsonFlag ? 'json' : 'text',
    traceId: traceContext.traceId,
    runId: traceContext.runId,
    contextId: consultMeta?.contextId || '',
    messageId: consultMeta?.messageId || '',
    previousMessageId: consultMeta?.previousMessageId || ''
  }, logFile).catch(() => {});

  if (dryRun) {
    await writeStdout(`${JSON.stringify(context, null, 2)}\n`);
    writeLogEntry({
      event: 'dry-run',
      prompt: promptForQwen,
      rawPrompt: input,
      files: context.files?.length || 0,
      traceId: traceContext.traceId,
      runId: traceContext.runId,
      contextId: consultMeta?.contextId || '',
      messageId: consultMeta?.messageId || ''
    }, logFile).catch(() => {});
    return;
  }

  const reply = await runControlledConversation(context, promptForQwen, maxTurns, sessionTimeoutMs);
  const parsed = parseQwenResponse(reply);
  const review = validateConsultResponse({ reply, parsed, context });
  parsed.review = review;
  await persistConsultMemory({ consultMeta, context, prompt: promptForQwen, reply, parsed, review });

  if (jsonFlag) {
    await writeStdout(`${JSON.stringify(parsed, null, 2)}\n`);
  } else {
    const textOutput = review.retry_action === 'strip_fluff' ? review.cleaned_text : reply.trim();
    await writeStdout(`${textOutput}\n`);
  }

  writeLogEntry({
    event: 'finish',
    prompt: promptForQwen,
    rawPrompt: input,
    status: parsed.plan,
    actions: parsed.actions?.length || 0,
    reviewAction: review.retry_action,
    reviewPass: review.pass,
    outputMode: jsonFlag ? 'json' : 'text',
    traceId: traceContext.traceId,
    runId: traceContext.runId,
    contextId: consultMeta?.contextId || '',
    messageId: consultMeta?.messageId || '',
    previousMessageId: consultMeta?.previousMessageId || ''
  }, logFile).catch(() => {});
}

main().then(async () => {
  await runLifecycleCleanup('shutdown').catch(() => {});
  // This CLI is single-shot; force a clean exit so lingering Playwright/CDP handles cannot hang the shell.
  process.exit(0);
}).catch(async (error) => {
  await runLifecycleCleanup('error').catch(() => {});
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
