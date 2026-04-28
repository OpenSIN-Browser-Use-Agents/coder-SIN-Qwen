import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { hydrateConsultContext, persistConsultMemory } from '../packages/qwen-core/consult-memory.js';

const TRACE_ENV_KEYS = [
  'SIN_CODER_QWEN_RUN_ID',
  'SIN_CODER_QWEN_TRACE_ID',
  'SIN_CODER_QWEN_SPAN_ID',
  'SIN_CODER_QWEN_PARENT_SPAN_ID',
  'SIN_CODER_QWEN_SESSION_ID',
  'SIN_CODER_QWEN_MEMORY_FILE'
];

function snapshotEnv() {
  return Object.fromEntries(TRACE_ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const key of TRACE_ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('hydrates repo context with state snapshot and ids', async () => {
  const snapshot = snapshotEnv();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omo-memory-'));
  process.env.SIN_CODER_QWEN_MEMORY_FILE = path.join(tempDir, 'memory.json');

  try {
    const result = await hydrateConsultContext({
      prompt: 'Review the repo',
      repo: {
        cwd: '/tmp/project',
        branch: 'main',
        head: 'abc123',
        dirty: false,
        urls: {
          web: 'https://github.com/example/repo',
          commit: 'https://github.com/example/repo/commit/abc123',
          tree: 'https://github.com/example/repo/tree/abc123'
        }
      },
      fileReferences: [{ path: 'index.js', url: 'https://github.com/example/repo/blob/abc123/index.js' }],
      references: [{ label: 'Playwright docs', url: 'https://playwright.dev/docs/intro', reason: 'Docs' }],
      constraints: ['Use URLs'],
      completionCriteria: ['Return production-ready output only.']
    }, 'Review the repo');

    assert.equal(typeof result.consultMeta.contextId, 'string');
    assert.equal(typeof result.consultMeta.messageId, 'string');
    assert.equal(result.consultMeta.sessionId, result.consultMeta.contextId);
    assert.equal(result.context.stateSnapshot.metadata.contextId, result.consultMeta.contextId);
    assert.equal(result.context.stateSnapshot.metadata.sessionId, result.consultMeta.sessionId);
    assert.equal(result.context.stateSnapshot.stateSnapshot.repositoryUrl, 'https://github.com/example/repo');
    assert.equal(result.context.stateSnapshot.stateSnapshot.affectedFiles[0].path, 'index.js');
  } finally {
    restoreEnv(snapshot);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('persists and reuses consult memory context id', async () => {
  const snapshot = snapshotEnv();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omo-memory-'));
  const memoryFile = path.join(tempDir, 'memory.json');
  process.env.SIN_CODER_QWEN_MEMORY_FILE = memoryFile;

  const baseContext = {
    prompt: 'Review the repo',
    repo: {
      cwd: '/tmp/project',
      branch: 'main',
      head: 'abc123',
      dirty: false,
      urls: {
        web: 'https://github.com/example/repo',
        commit: 'https://github.com/example/repo/commit/abc123',
        tree: 'https://github.com/example/repo/tree/abc123'
      }
    },
    fileReferences: [{ path: 'index.js', url: 'https://github.com/example/repo/blob/abc123/index.js' }],
    references: [{ label: 'Node docs', url: 'https://nodejs.org/docs/latest/api/', reason: 'Docs' }],
    constraints: ['Use URLs'],
    completionCriteria: ['Return production-ready output only.']
  };

  try {
    const first = await hydrateConsultContext(baseContext, 'Review the repo');
    await persistConsultMemory({
      consultMeta: first.consultMeta,
      context: first.context,
      prompt: 'Review the repo',
      reply: 'Run verify first.',
      parsed: { summary: 'Run verify first.', payload: { status: 'final' } }
    });

    const second = await hydrateConsultContext(baseContext, 'Review the repo again');
    assert.equal(second.consultMeta.contextId, first.consultMeta.contextId);
    assert.equal(second.context.previousSummary, 'Run verify first.');
    assert.equal(second.context.stateSnapshot.decisionHistory.length, 1);
    assert.equal(second.context.stateSnapshot.decisionHistory[0].summary, 'Run verify first.');
  } finally {
    restoreEnv(snapshot);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
