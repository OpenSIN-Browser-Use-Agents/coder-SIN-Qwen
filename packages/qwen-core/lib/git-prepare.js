import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function getRepoRoot(cwd) {
  const { stdout } = await exec('git', ['rev-parse', '--show-toplevel'], { cwd });
  return stdout.trim();
}

export async function prepareCommit(cwd, dryRun = false) {
  const root = await getRepoRoot(cwd);
  const git = (...args) => exec('git', args, { cwd: root });

  if (!dryRun) {
    await git('add', '--all');
  }

  const { stdout: statusRaw } = await git('status', '--porcelain=v1');
  const { stdout: diffStat } = await git('diff', '--cached', '--stat');

  const changes = statusRaw
    .split('\n')
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2).trim(),
      file: line.slice(3).trim()
    }));

  return {
    root,
    stagedCount: changes.length,
    changes,
    diffStat: diffStat.trim(),
    dryRun
  };
}
