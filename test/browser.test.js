import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptPayload, resolveChromeConnectionConfig, resolveChromeLaunchConfig, summarizeSelectorReport, withRetry } from '../browser.js';

test('builds prompt payload strings', () => {
  // Objects should become a normal readable operator message instead of a raw JSON blob.
  assert.equal(buildPromptPayload('hello'), 'hello');
  assert.match(buildPromptPayload({
    prompt: 'Check the repo',
    repo: { cwd: '/tmp/project', remote: 'origin', branch: 'main', head: 'abc123', dirty: false },
    package: { name: 'demo', version: '1.0.0', scripts: ['test'], dependencies: ['playwright'] },
    files: ['index.js'],
    rules: ['Return production-ready output only.']
  }), /Task:\nCheck the repo/);
});

test('retries flaky actions', async () => {
  // Retry logic is critical because browser automation fails transiently in real life.
  let count = 0;
  const result = await withRetry(async () => {
    count += 1;
    if (count < 2) throw new Error('retry');
    return 'ok';
  }, 2);

  assert.equal(result, 'ok');
  assert.equal(count, 2);
});

test('summarizes selector buckets', () => {
  const summary = summarizeSelectorReport({
    promptInput: [{ selector: 'textarea', count: 1, matched: true }],
    sendButton: [{ selector: 'button', count: 0, matched: false }]
  });

  assert.deepEqual(summary, {
    promptInput: { matched: true, totalMatches: 1 },
    sendButton: { matched: false, totalMatches: 0 }
  });
});

test('resolves explicit Default profile into user data + profile directory', () => {
  // Existing Chrome profiles are passed in as .../Default, but Playwright needs the parent user-data dir.
  const previous = process.env.CHROME_PROFILE;
  process.env.CHROME_PROFILE = '/tmp/Chrome/Default';

  try {
    const config = resolveChromeLaunchConfig();
    assert.equal(config.userDataDir, '/tmp/Chrome');
    assert.equal(config.profileDirectory, 'Default');
    assert.equal(config.profilePath, '/tmp/Chrome/Default');
  } finally {
    if (previous === undefined) delete process.env.CHROME_PROFILE;
    else process.env.CHROME_PROFILE = previous;
  }
});

test('enables attach mode when CDP url is configured', () => {
  // Attach mode is the non-destructive path when the operator keeps Chrome open.
  const previousProfile = process.env.CHROME_PROFILE;
  const previousCdp = process.env.CHROME_CDP_URL;
  process.env.CHROME_PROFILE = '/tmp/Chrome/Default';
  process.env.CHROME_CDP_URL = 'http://127.0.0.1:9222';

  try {
    const config = resolveChromeConnectionConfig();
    assert.equal(config.mode, 'attach');
    assert.equal(config.cdpUrl, 'http://127.0.0.1:9222');
  } finally {
    if (previousProfile === undefined) delete process.env.CHROME_PROFILE;
    else process.env.CHROME_PROFILE = previousProfile;
    if (previousCdp === undefined) delete process.env.CHROME_CDP_URL;
    else process.env.CHROME_CDP_URL = previousCdp;
  }
});
