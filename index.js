#!/usr/bin/env node
// Main CLI entrypoint for the standalone Qwen relay agent.
import { buildContext } from './context.js';
import { getQwenCompletionMetadata, runQwenSession } from './browser.js';
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
import { appendTurn, buildBranchContextPrompt, buildConversationTreePayload, loadTree, printTree, resolveBranchTarget, resolveConversationTreeFile } from './conversation-tree-store.js';
import { buildTreeLines, checkoutNode } from './lib/conversation-tree-cli.js';
import { prepareCommit } from './lib/git-prepare.js';

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
  const prepareCommitFlag = argv.includes('--prepare-commit');
  const treeFlag = argv.includes('--tree');
  const branchArgIndex = argv.indexOf('--branch');
  const branchId = branchArgIndex >= 0 ? String(argv[branchArgIndex + 1] || '').trim() : '';
  const checkoutArgIndex = argv.indexOf('--checkout');
  const checkoutId = checkoutArgIndex >= 0 ? String(argv[checkoutArgIndex + 1] || '').trim() : '';
  const conversationFileArgIndex = argv.indexOf('--conversation-file');
  const conversationFile = resolveConversationTreeFile(conversationFileArgIndex >= 0 ? argv[conversationFileArgIndex + 1] : '');
  const input = argv.filter((arg, index) => {
    if (arg === '--turns') return false;
    if (turnArgIndex >= 0 && index === turnArgIndex + 1) return false;
    if (arg === '--project-root') return false;
    if (projectRootArgIndex >= 0 && index === projectRootArgIndex + 1) return false;
    if (arg === '--restore') return false;
    if (restoreArgIndex >= 0 && index === restoreArgIndex + 1) return false;
    if (arg === '--branch') return false;
    if (branchArgIndex >= 0 && index === branchArgIndex + 1) return false;
    if (arg === '--checkout') return false;
    if (checkoutArgIndex >= 0 && index === checkoutArgIndex + 1) return false;
    if (arg === '--conversation-file') return false;
    if (conversationFileArgIndex >= 0 && index === conversationFileArgIndex + 1) return false;
    return !arg.startsWith('--');
  }).join(' ').trim();
  if (!input && !smokeFlag && !smokeLiveFlag && !preflightFlag && !restoreLastFlag && !restoreHash && !treeFlag && !prepareCommitFlag && !checkoutId) {
    console.error('Usage: ask-qwen [--json] [--snapshot] [--dry-run] [--smoke|--smoke-live] [--preflight] [--restore-last|--restore <hash>] [--project-root <path>] [--turns <n>] [--prepare-commit] [--tree] [--branch <nodeId>] [--checkout <nodeId|latest|root|none>] [--conversation-file <path>] <prompt>');
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

  if (prepareCommitFlag) {
    const prepared = await prepareCommit(process.cwd(), dryRunFlag);
    if (jsonFlag) {
      console.log(JSON.stringify(prepared, null, 2));
    } else {
      console.log(`Staged ${prepared.stagedCount} file(s)${prepared.dryRun ? ' (dry-run)' : ''}`);
      if (prepared.diffStat) console.log(prepared.diffStat);
    }
    return;
  }

  if (checkoutId) {
    const updated = await checkoutNode(checkoutId, conversationFile);
    if (jsonFlag) {
      console.log(JSON.stringify({
        ok: true,
        conversationTree: {
          file: conversationFile,
          checkoutTarget: checkoutId,
          activeId: updated.activeId,
          ...updated.payload
        }
      }, null, 2));
    } else {
      console.log(`Switched active conversation to: ${updated.activeId || 'none'}`);
      console.log(buildTreeLines(updated.tree, { activeNodeId: updated.activeId || '', color: process.stdout.isTTY }));
    }
    return;
  }

  if (treeFlag) {
    const tree = await loadTree(conversationFile);
    if (jsonFlag) {
      const activeNodeId = branchId || tree?.activeId || tree?.latestNodeId || tree?.rootId || '';
      console.log(JSON.stringify({ ok: true, conversationTree: tree ? buildConversationTreePayload(tree, activeNodeId) : null }, null, 2));
    } else {
      console.log(buildTreeLines(tree, { activeNodeId: branchId || '', color: process.stdout.isTTY }));
    }
    return;
  }

  const tree = await loadTree(conversationFile);
  const resolvedBranchId = branchId || tree?.activeId || '';
  const branchContext = resolvedBranchId ? await resolveBranchTarget(resolvedBranchId, conversationFile) : null;

  const baseContext = await buildContext({ prompt: input, projectRoot });
  const promptForQwen = buildBranchContextPrompt(
    typeof baseContext === 'string' ? baseContext : baseContext.prompt,
    branchContext
  );
  const hydrated = await hydrateConsultContext(baseContext, promptForQwen);
  let context = typeof hydrated.context === 'string'
    ? hydrated.context
    : {
        ...hydrated.context,
        prompt: promptForQwen,
        conversationTree: branchContext
          ? {
              file: conversationFile,
              branchId: resolvedBranchId,
              branchDepth: branchContext.path.length,
              checkedOutNodeId: branchContext.tree.activeId || null,
              latestNodeId: branchContext.tree.latestNodeId || branchContext.tree.rootId,
              path: branchContext.details?.path || [],
              history: branchContext.details?.history || []
            }
          : null
      };
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
      branchId: resolvedBranchId,
      conversationFile,
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
  const completion = getQwenCompletionMetadata();
  const review = validateConsultResponse({ reply, parsed, context, completion });
  parsed.review = review;
  await persistConsultMemory({ consultMeta, context, prompt: promptForQwen, reply, parsed, review });

  if (!review.pass) {
    const failedRules = review.violations
      .filter((entry) => entry.severity === 'fail')
      .map((entry) => entry.rule)
      .join(', ');
    writeLogEntry({
      event: 'finish-invalid',
      prompt: promptForQwen,
      rawPrompt: input,
      status: parsed.plan,
      reviewAction: review.retry_action,
      reviewPass: review.pass,
      failedRules,
      outputMode: jsonFlag ? 'json' : 'text',
      traceId: traceContext.traceId,
      runId: traceContext.runId,
      contextId: consultMeta?.contextId || '',
      messageId: consultMeta?.messageId || '',
      previousMessageId: consultMeta?.previousMessageId || ''
    }, logFile).catch(() => {});
    throw new Error(`Qwen reply failed validation: ${failedRules || 'unknown failure'}`);
  }

  const conversationTurn = await appendTurn(resolvedBranchId || null, input, reply, {
    traceId: traceContext.traceId,
    sessionId: traceContext.sessionId,
    contextId: consultMeta?.contextId || '',
    messageId: consultMeta?.messageId || '',
    previousMessageId: consultMeta?.previousMessageId || '',
    reviewAction: review.retry_action,
    reviewPass: review.pass
  }, conversationFile, { setActiveNode: Boolean(tree) });
  parsed.conversationTree = {
    file: conversationFile,
    branchId: resolvedBranchId || null,
    nodeId: conversationTurn.nodeId || '',
    ...buildConversationTreePayload(conversationTurn.tree, conversationTurn.nodeId)
  };

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
      previousMessageId: consultMeta?.previousMessageId || '',
      branchId: resolvedBranchId,
      conversationFile,
      conversationNodeId: parsed.conversationTree?.nodeId || ''
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
    runQwenSession(initialContext, { maxTurns, originalPrompt, sessionTimeoutMs }),
    sessionTimeoutMs,
    `Qwen session timed out after ${sessionTimeoutMs}ms`
  );
}
