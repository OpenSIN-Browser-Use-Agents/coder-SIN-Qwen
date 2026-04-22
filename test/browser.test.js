import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationFollowUpPrompt, buildPromptPayload, resolveChromeConnectionConfig, resolveChromeLaunchConfig, shouldContinueConversation, summarizeSelectorReport, withRetry } from '../browser.js';

test('builds prompt payload strings', () => {
  // Objects should become a normal readable operator message instead of a raw JSON blob.
  assert.equal(buildPromptPayload('hello'), 'hello');
  const payload = buildPromptPayload({
    prompt: 'Check the repo',
    repo: {
      cwd: '/tmp/project',
      remote: 'origin',
      branch: 'main',
      head: 'abc123',
      dirty: false,
      urls: {
        web: 'https://github.com/example/repo',
        commit: 'https://github.com/example/repo/commit/abc123'
      }
    },
    package: { name: 'demo', version: '1.0.0', scripts: ['test'], dependencies: ['playwright'] },
    files: ['index.js'],
    fileReferences: [{ path: 'index.js', url: 'https://github.com/example/repo/blob/abc123/index.js' }],
    references: [{ label: 'Playwright docs', url: 'https://playwright.dev/docs/intro', reason: 'Browser automation docs' }],
    stateSnapshot: {
      protocolVersion: 'A2A-v2.1-lite',
      messageId: 'msg-1',
      metadata: {
        contextId: 'ctx-1',
        previousMessageId: 'msg-0',
        sender: 'coder-SIN-Qwen',
        receiver: 'Qwen'
      },
      mandate: 'Check the repo',
      previousSummary: 'Previous summary here.',
      stateSnapshot: {
        repositoryUrl: 'https://github.com/example/repo',
        commitUrl: 'https://github.com/example/repo/commit/abc123',
        treeUrl: 'https://github.com/example/repo/tree/abc123',
        branch: 'main',
        head: 'abc123',
        dirty: false
      },
      decisionHistory: [{ timestamp: '2026-04-22T00:00:00Z', status: 'final', summary: 'Previous decision.' }]
    },
    constraints: ['Use the provided URLs.'],
    completionCriteria: ['Return production-ready output only.'],
    rules: ['Return production-ready output only.']
  });
  assert.match(payload, /Task:\nCheck the repo/);
  assert.match(payload, /repo url: https:\/\/github.com\/example\/repo/);
  assert.match(payload, /Persistent consult state:/);
  assert.match(payload, /protocol version: A2A-v2.1-lite/);
  assert.match(payload, /context id: ctx-1/);
  assert.match(payload, /Decision history:/);
  assert.match(payload, /Previous decision\./);
  assert.match(payload, /Relevant file URLs:/);
  assert.match(payload, /Playwright docs: https:\/\/playwright.dev\/docs\/intro/);
  assert.match(payload, /Completion criteria:/);
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

test('detects when a refined follow-up is worth asking', () => {
  assert.equal(shouldContinueConversation('If you want, I can also suggest the next best step.'), true);
  assert.equal(shouldContinueConversation('Hello!'), false);
  assert.equal(shouldContinueConversation('Here are three concrete next steps:\n- Run verify\n- Commit changes\n- Re-test'), true);
});

test('builds a fresh follow-up prompt from the original request and reply', () => {
  const prompt = buildConversationFollowUpPrompt('Review the repo', 'You should run verify and then clean the working tree.');
  assert.match(prompt, /Original request:\nReview the repo/);
  assert.match(prompt, /Refine your previous answer using one same-chat follow-up turn\./);
  assert.match(prompt, /Previous answer:/);
  assert.match(prompt, /run verify/);
});
