import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildTemporaryPublicTaskMarkdown, prepareTemporaryPublicTaskFile, shouldPublishTemporaryPublicTaskFile } from '../public-task-file.js';

test('auto-publishes only when urls are not already public', () => {
  assert.equal(shouldPublishTemporaryPublicTaskFile(null), false);
  assert.equal(shouldPublishTemporaryPublicTaskFile({ mode: 'simple' }), false);
  assert.equal(shouldPublishTemporaryPublicTaskFile({ urlAccessibility: 'local_only' }), true);
  assert.equal(shouldPublishTemporaryPublicTaskFile({ urlAccessibility: 'public' }), false);
  assert.equal(shouldPublishTemporaryPublicTaskFile({ urlAccessibility: 'public' }, 'always'), true);
  assert.equal(shouldPublishTemporaryPublicTaskFile({ urlAccessibility: 'local_only' }, 'off'), false);
});

test('builds a large temporary task packet with redacted excerpts', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coder-sin-qwen-public-task-'));
  const codePath = path.join(tempDir, 'src.js');
  await fs.writeFile(codePath, 'const API_KEY = "secret-value";\nexport const answer = 42;\n', 'utf8');

  try {
    const markdown = await buildTemporaryPublicTaskMarkdown({
      context: {
        prompt: 'Fix the bug',
        repo: { cwd: tempDir, visibility: 'private' },
        urlAccessibility: 'local_only',
        files: ['src.js'],
        attachmentCandidates: [{ path: 'src.js', absolutePath: codePath, size: 59, reason: 'private_repo_context' }],
        fileReferences: [{ path: 'src.js', url: '' }],
        constraints: [],
        completionCriteria: [],
        rules: []
      },
      prompt: 'Fix the bug',
      taskId: 'task-1',
      maxExcerpts: 1,
      maxExcerptBytes: 500
    });

    assert.match(markdown, /coder-SIN-Qwen temporary task packet/);
    assert.match(markdown, /## Relay prompt/);
    assert.match(markdown, /Fix the bug/);
    assert.match(markdown, /## Relevant file excerpts/);
    assert.match(markdown, /API_KEY/);
    assert.doesNotMatch(markdown, /secret-value/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('creates and cleans up a temporary public gist packet', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coder-sin-qwen-public-gist-'));
  const codePath = path.join(tempDir, 'src.js');
  await fs.writeFile(codePath, 'export const value = 1;\n', 'utf8');

  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: String(options.method || 'GET') });
    if (String(url).endsWith('/gists') && String(options.method || 'GET') === 'POST') {
      return {
        ok: true,
        async json() {
          return {
            id: 'gist123',
            html_url: 'https://gist.github.com/gist123',
            files: {
              'task.md': { raw_url: 'https://gist.githubusercontent.com/raw/task.md' }
            }
          };
        }
      };
    }
    if (String(url).endsWith('/gists/gist123') && String(options.method || 'GET') === 'DELETE') {
      return { ok: true };
    }
    return { ok: false, status: 404 };
  };

  try {
    const publication = await prepareTemporaryPublicTaskFile({
      context: {
        prompt: 'Review this repo',
        repo: { cwd: tempDir, visibility: 'private' },
        urlAccessibility: 'local_only',
        files: ['src.js'],
        attachmentCandidates: [{ path: 'src.js', absolutePath: codePath, size: 24, reason: 'private_repo_context' }],
        fileReferences: [{ path: 'src.js', url: '' }],
        constraints: [],
        completionCriteria: [],
        rules: []
      },
      prompt: 'Review this repo',
      projectRoot: tempDir,
      taskId: 'task-2',
      mode: 'always',
      fetchImpl,
      tokenProvider: async () => 'test-token'
    });

    assert.ok(publication);
    assert.equal(publication.published, true);
    assert.equal(publication.url, 'https://gist.githubusercontent.com/raw/task.md');
    assert.ok(await fs.stat(publication.localPath));

    await publication.cleanup();

    await assert.rejects(() => fs.stat(publication.localPath));
    assert.ok(calls.some((call) => call.method === 'POST'));
    assert.ok(calls.some((call) => call.method === 'DELETE'));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
