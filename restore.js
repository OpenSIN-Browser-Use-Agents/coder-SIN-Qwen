#!/usr/bin/env node
// Restore helpers are intentionally tiny because they perform destructive git operations.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const ref = resolveRef(process.argv.slice(2));

  if (!ref) {
    console.error('Usage: node ./restore.js --last | <git-commit-hash>');
    process.exit(1);
  }

  try {
    execFileSync('git', ['reset', '--hard', ref], { stdio: 'inherit' });
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

export function restoreSnapshot(ref) {
  // The caller is responsible for choosing a safe commit reference.
  execFileSync('git', ['reset', '--hard', ref], { stdio: 'inherit' });
}

export function restoreLatestSnapshot() {
  // Restore the newest snapshot created by this toolchain.
  const ref = latestSnapshotRef();
  if (!ref) throw new Error('No SIN-Qwen snapshot commit found.');
  restoreSnapshot(ref);
  return ref;
}

function resolveRef(argv) {
  // CLI mode supports either an explicit hash or the last snapshot marker.
  const last = argv.includes('--last');
  const hash = argv.find((arg) => /^[0-9a-f]{7,40}$/iu.test(arg));

  if (hash) return hash;
  if (last) return latestSnapshotRef();
  return '';
}

function latestSnapshotRef() {
  // Snapshot commits share a stable message prefix so they are easy to find later.
  try {
    return execFileSync('git', ['log', '-1', '--format=%H', '--grep=🤖 SIN-Qwen: Pre-apply snapshot'], {
      encoding: 'utf8'
    }).trim();
  } catch {
    return '';
  }
}
