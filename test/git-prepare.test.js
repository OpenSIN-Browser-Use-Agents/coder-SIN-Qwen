import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prepareCommit } from '../lib/git-prepare.js';

const exec = promisify(execFile);

test('prepareCommit stages files and returns status without committing', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omo-git-prepare-'));
  const commitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com'
  };

  try {
    await exec('git', ['init'], { cwd: tmpDir });

    const trackedFile = path.join(tmpDir, 'track.txt');
    await fs.writeFile(trackedFile, 'initial', 'utf8');
    await exec('git', ['add', '.'], { cwd: tmpDir });
    await exec('git', ['commit', '-m', 'init'], { cwd: tmpDir, env: commitEnv });

    await fs.writeFile(trackedFile, 'modified', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'new.txt'), 'new', 'utf8');

    const result = await prepareCommit(tmpDir, false);
    assert.equal(result.stagedCount, 2);
    assert.ok(result.changes.some((entry) => entry.file === 'track.txt'));
    assert.ok(result.changes.some((entry) => entry.file === 'new.txt'));
    assert.match(result.diffStat, /track\.txt/);

    const { stdout: log } = await exec('git', ['log', '--oneline'], { cwd: tmpDir });
    assert.equal(log.trim().split('\n').length, 1);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
