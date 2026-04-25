import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildAttachmentCandidates, buildContext, filterReachableUrlEntries, sanitizeFileReferenceUrls, verifyUrlReachable } from '../context.js';

test('keeps simple chat prompts structured without repo dump', async () => {
  const context = await buildContext({ prompt: 'Say hello in one short sentence.' });
  assert.equal(typeof context, 'object');
  assert.equal(context.mode, 'simple');
  assert.equal(context.prompt, 'Say hello in one short sentence.');
  assert.equal(context.repo, null);
});

test('strips ask-qwen wrapper prefixes before context building', async () => {
  const context = await buildContext({ prompt: '/ask-qwen hello there' });
  assert.equal(typeof context, 'object');
  assert.equal(context.mode, 'simple');
  assert.equal(context.prompt, 'hello there');
});

test('attaches repo context for coding prompts', async () => {
  const context = await buildContext({ prompt: 'Review the repo and fix the failing build.' });
  assert.equal(typeof context, 'object');
  assert.equal(context.prompt, 'Review the repo and fix the failing build.');
  assert.ok(Array.isArray(context.files));
  assert.ok(context.files.length > 0);
  assert.ok(['public', 'local_only'].includes(context.urlAccessibility));
  if (context.urlAccessibility === 'public') {
    assert.ok(context.repo.urls.web.includes('github.com'));
  }
  assert.ok(Array.isArray(context.fileReferences));
  assert.ok(context.fileReferences.length > 0);
  assert.ok(Array.isArray(context.references));
  if (context.urlAccessibility !== 'public') {
    assert.equal(context.references.length, 0);
    assert.equal(context.issueReferences.length, 0);
    assert.ok(context.fileReferences.every((file) => !file.url));
  }
});

test('attaches repo context for German project prompts', async () => {
  const context = await buildContext({ prompt: 'optimiere das projekt' });
  assert.equal(typeof context, 'object');
  assert.equal(context.prompt, 'optimiere das projekt');
  assert.ok(context.repo);
  assert.ok(Array.isArray(context.files));
  assert.ok(context.files.length > 0);
});

test('uses explicit projectRoot and private repo attachments', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coder-sin-qwen-context-'));
  await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'worker-demo', version: '1.0.0', dependencies: { playwright: '^1.0.0' } }), 'utf8');
  await fs.writeFile(path.join(tempDir, 'worker.py'), 'print("hello")\n', 'utf8');
  await fs.writeFile(path.join(tempDir, 'README.md'), '# Worker\n', 'utf8');

  const context = await buildContext({ prompt: 'Review the worker repo and issue https://github.com/example/private/issues/12', projectRoot: tempDir });
  assert.equal(context.repo.cwd, tempDir);
  assert.equal(context.repo.visibility, 'private');
  assert.equal(context.urlAccessibility, 'local_only');
  assert.ok(Array.isArray(context.issueReferences));
  assert.equal(context.issueReferences.length, 0);
  assert.ok(Array.isArray(context.attachmentCandidates));
  assert.ok(context.attachmentCandidates.length > 0);
  assert.ok(Array.isArray(context.fileReferences));
  assert.ok(context.fileReferences.length > 0);
  assert.ok(context.fileReferences.every((file) => !file.url));
  assert.ok(context.capabilityManifest.some((item) => item.name === 'private_file_attachments'));

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('keeps image evidence local-only while attaching non-ignored evidence', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coder-sin-qwen-public-evidence-'));
  await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'worker-demo', version: '1.0.0' }), 'utf8');
  await fs.writeFile(path.join(tempDir, 'worker.py'), 'print("hello")\n', 'utf8');
  await fs.writeFile(path.join(tempDir, 'evidence.txt'), 'boom\n', 'utf8');
  await fs.writeFile(path.join(tempDir, 'worker_screenshot.png'), 'png', 'utf8');

  const context = await buildContext({ prompt: 'Send qwen all logs and screenshots for this issue', projectRoot: tempDir });
  assert.ok(Array.isArray(context.attachmentCandidates));
  assert.ok(context.attachmentCandidates.some((file) => file.path === 'evidence.txt'));
  assert.ok(!context.attachmentCandidates.some((file) => file.path === 'worker_screenshot.png'));
  assert.ok(!context.fileReferences.some((file) => file.path === 'worker_screenshot.png' && file.url));

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('attaches relevant code files for public repo code prompts', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coder-sin-qwen-public-code-'));
  await fs.writeFile(path.join(tempDir, 'index.js'), 'export const value = 1;\n', 'utf8');
  await fs.writeFile(path.join(tempDir, 'browser.js'), 'export const browser = true;\n', 'utf8');
  await fs.writeFile(path.join(tempDir, 'README.md'), '# Repo\n', 'utf8');
  await fs.writeFile(path.join(tempDir, 'worker_screenshot.png'), 'png', 'utf8');

  const attachments = await buildAttachmentCandidates({
    cwd: tempDir,
    files: ['index.js', 'browser.js', 'README.md', 'worker_screenshot.png'],
    prompt: 'Review the repo and fix the bug in the code files.',
    repoVisibility: 'public'
  });

  assert.ok(attachments.length > 0);
  assert.ok(attachments.some((file) => file.path.endsWith('.js')));
  assert.ok(!attachments.some((file) => file.path.endsWith('.png')));

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('verifies urls before including them in the prompt context', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: String(options.method || 'GET') });
    if (String(url).includes('/ok')) {
      return { ok: true, status: 200 };
    }
    if (String(url).includes('/head-only')) {
      return { ok: false, status: 405 };
    }
    if (String(url).includes('/auth')) {
      return { ok: true, status: 200, url: 'https://example.com/auth/login' };
    }
    return { ok: false, status: 404 };
  };

  try {
    assert.equal(await verifyUrlReachable('https://example.com/ok'), true);
    assert.equal(await verifyUrlReachable('https://example.com/missing'), false);
    assert.equal(await verifyUrlReachable('https://example.com/auth'), false);

    const sanitizedFiles = await sanitizeFileReferenceUrls([
      { path: 'a.js', url: 'https://example.com/ok' },
      { path: 'b.js', url: 'https://example.com/missing' }
    ]);
    assert.equal(sanitizedFiles[0].url, 'https://example.com/ok');
    assert.equal(sanitizedFiles[1].url, '');

    const filtered = await filterReachableUrlEntries([
      { url: 'https://example.com/ok' },
      { url: 'https://example.com/missing' }
    ]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].url, 'https://example.com/ok');

    assert.ok(calls.some((call) => call.method === 'HEAD'));
  } finally {
    global.fetch = originalFetch;
  }
});
