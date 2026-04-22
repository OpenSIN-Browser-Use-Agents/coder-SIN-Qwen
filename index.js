#!/usr/bin/env node
// Main CLI entrypoint for the standalone Qwen relay agent.
import { buildContext } from './context.js';
import { runQwenSession } from './browser.js';
import { parseQwenResponse } from './parser.js';
import { createSnapshot } from './git.js';
import { runSmokeCheck } from './smoke.js';
import { writeLogEntry, resolveLogFile } from './logger.js';
import { restoreLatestSnapshot, restoreSnapshot } from './restore.js';
import { runPreflight } from './preflight.js';

async function main() {
  const argv = process.argv.slice(2);
  const snapshotEnabled = argv.includes('--snapshot');
  const dryRunFlag = argv.includes('--dry-run');
  const smokeFlag = argv.includes('--smoke');
  const smokeLiveFlag = argv.includes('--smoke-live');
  const preflightFlag = argv.includes('--preflight');
  const restoreLastFlag = argv.includes('--restore-last');
  const restoreArgIndex = argv.indexOf('--restore');
  const restoreHash = restoreArgIndex >= 0 && /^[0-9a-f]{7,40}$/iu.test(argv[restoreArgIndex + 1] || '') ? argv[restoreArgIndex + 1] : '';
  const turnArgIndex = argv.indexOf('--turns');
  const maxTurns = turnArgIndex >= 0 ? Number(argv[turnArgIndex + 1] || 5) : 5;
  const input = argv.filter((arg, index) => {
    if (arg === '--turns') return false;
    if (turnArgIndex >= 0 && index === turnArgIndex + 1) return false;
    if (arg === '--restore') return false;
    if (restoreArgIndex >= 0 && index === restoreArgIndex + 1) return false;
    return !arg.startsWith('--');
  }).join(' ').trim();
  if (!input && !smokeFlag && !smokeLiveFlag && !preflightFlag && !restoreLastFlag && !restoreHash) {
    console.error('Usage: ask-qwen [--snapshot] [--dry-run] [--smoke|--smoke-live] [--preflight] [--restore-last|--restore <hash>] [--turns <n>] <prompt>');
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

  const context = await buildContext({ prompt: input });
  const dryRun = dryRunFlag || process.env.SIN_OMO_QWEN_DRY_RUN === '1';
  const logFile = resolveLogFile();

  // Persist lightweight structured logs so runs can be audited later.
  await writeLogEntry({ event: 'start', prompt: input, dryRun, snapshotEnabled, maxTurns }, logFile);

  if (dryRun) {
    console.log(JSON.stringify(context, null, 2));
    await writeLogEntry({ event: 'dry-run', prompt: input, files: context.files.length }, logFile);
    return;
  }

  const reply = await runQwenSession(context, maxTurns);
  const parsed = parseQwenResponse(reply);

  process.stdout.write(JSON.stringify(parsed, null, 2) + '\n');
  await writeLogEntry({ event: 'finish', prompt: input, status: parsed.plan, actions: parsed.actions?.length || 0 }, logFile);
}

main().catch((error) => {
  // Keep failure output compact and shell-friendly for OpenCode wrappers.
  console.error(error?.stack || String(error));
  process.exit(1);
});
