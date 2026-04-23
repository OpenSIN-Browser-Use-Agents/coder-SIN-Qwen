import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildContext } from '../context.js';

test('keeps simple chat prompts as plain text', async () => {
  const context = await buildContext({ prompt: 'Say hello in one short sentence.' });
  assert.equal(context, 'Say hello in one short sentence.');
});

test('attaches repo context for coding prompts', async () => {
  const context = await buildContext({ prompt: 'Review the repo and fix the failing build.' });
  assert.equal(typeof context, 'object');
  assert.equal(context.prompt, 'Review the repo and fix the failing build.');
  assert.ok(Array.isArray(context.files));
  assert.ok(context.files.length > 0);
  assert.ok(['public', 'private'].includes(context.repo.visibility));
  if (context.repo.visibility === 'public') {
    assert.ok(context.repo.urls.web.includes('github.com'));
  }
  assert.ok(Array.isArray(context.fileReferences));
  assert.ok(context.fileReferences.length > 0);
  if (context.repo.visibility === 'public') {
    assert.ok(context.fileReferences.some((file) => file.url.includes('/blob/')));
  } else {
    assert.ok(Array.isArray(context.attachmentCandidates));
  }
  assert.ok(Array.isArray(context.references));
  assert.ok(context.references.some((reference) => reference.url.includes('playwright.dev')));
});

test('uses explicit projectRoot and private repo attachments', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coder-sin-qwen-context-'));
  await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'worker-demo', version: '1.0.0', dependencies: { playwright: '^1.0.0' } }), 'utf8');
  await fs.writeFile(path.join(tempDir, 'worker.py'), 'print("hello")\n', 'utf8');
  await fs.writeFile(path.join(tempDir, 'README.md'), '# Worker\n', 'utf8');

  const context = await buildContext({ prompt: 'Review the worker repo and issue https://github.com/example/private/issues/12', projectRoot: tempDir });
  assert.equal(context.repo.cwd, tempDir);
  assert.equal(context.repo.visibility, 'private');
  assert.ok(Array.isArray(context.issueReferences));
  assert.equal(context.issueReferences[0].url, 'https://github.com/example/private/issues/12');
  assert.ok(Array.isArray(context.attachmentCandidates));
  assert.ok(context.attachmentCandidates.length > 0);
  assert.ok(context.capabilityManifest.some((item) => item.name === 'private_file_attachments'));

  await fs.rm(tempDir, { recursive: true, force: true });
});
