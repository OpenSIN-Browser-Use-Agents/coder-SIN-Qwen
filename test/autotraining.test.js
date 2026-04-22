import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildAutotrainingSnapshot, buildAutotrainingSuggestions, persistAutotrainingArtifacts, resolveAutotrainingFile } from '../modul-qwen-autotraining.js';

test('builds deterministic autotraining snapshot shape', () => {
  const snapshot = buildAutotrainingSnapshot({
    context: {
      repo: { urls: { web: 'https://github.com/example/repo' }, head: 'abc123', branch: 'main' },
      references: [],
      fileReferences: [],
      constraints: ['Use URLs'],
      completionCriteria: ['Return production-ready output only.']
    },
    consultMeta: { contextId: 'ctx-1', messageId: 'msg-1' },
    prompt: 'Review the repo',
    reply: 'Run verify first.',
    parsed: { summary: 'Run verify first.' },
    review: { pass: true, score: 0.9, retry_action: 'accept', violations: [] },
    now: '2026-04-22T16:00:00Z',
    id: 'snap_test'
  });

  assert.equal(snapshot.id, 'snap_test');
  assert.equal(snapshot.ctx.context_id, 'ctx-1');
  assert.equal(snapshot.metrics.score, 0.9);
  assert.equal(snapshot.review.retry_action, 'accept');
});

test('builds suggestion payload from review result', () => {
  const suggestions = buildAutotrainingSuggestions({
    snapshot: {
      id: 'snap_test',
      output: { content: 'Run verify first.', tokens: 4 },
      metrics: { score: 0.75 }
    },
    parsed: { summary: 'Run verify first.' },
    review: { retry_action: 'strip_fluff', cleaned_text: 'Run verify first.', score: 0.9 },
    now: '2026-04-22T16:00:05Z',
    idFactory: () => 'sug_test'
  });

  assert.equal(suggestions[0].id, 'sug_test');
  assert.equal(suggestions[0].snap_id, 'snap_test');
  assert.equal(suggestions[0].reason, 'fluff_reduction');
});

test('persists snapshot and suggestion artifacts', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omo-autotraining-'));
  process.env.SIN_OMO_QWEN_AUTOTRAINING_FILE = path.join(tempDir, 'autotraining.jsonl');

  await persistAutotrainingArtifacts({
    snapshot: { id: 'snap_test' },
    suggestions: [{ id: 'sug_test' }]
  });

  const filePath = resolveAutotrainingFile();
  const content = await fs.readFile(filePath, 'utf8');
  assert.match(content, /"type":"snapshot"/);
  assert.match(content, /"type":"suggestion"/);

  delete process.env.SIN_OMO_QWEN_AUTOTRAINING_FILE;
  await fs.rm(tempDir, { recursive: true, force: true });
});
