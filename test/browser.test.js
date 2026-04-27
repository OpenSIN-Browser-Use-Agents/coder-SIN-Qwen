import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationFollowUpPrompt, buildPromptPayload, buildSafeCdpConnectParams, buildSafePersistentContextOptions, createBrowserSessionCloser, ensureChromiumCdpCompatibility, getQwenSessionMarker, hasBlockingAuthOverlay, isQwenSessionBinding, isUsefulAssistantCompletionText, looksLikeQwenRateLimit, resolveChromeConnectionConfig, resolveChromeLaunchConfig, resolveChromeProfileCheck, resolveCompletionTimeoutMs, resolvePromptUrlBudget, resolveQwenSessionId, sanitizePromptForBrowser, shouldContinueConversation, shouldRequireChromeProfilePath, summarizeSelectorReport, withRetry } from '../browser.js';

function createLocatorStub(visibleMap, selector) {
  return {
    first() {
      return this;
    },
    async count() {
      return visibleMap.has(selector) ? 1 : 0;
    },
    async isVisible() {
      return Boolean(visibleMap.get(selector));
    }
  };
}

function createPageStub(visibleEntries = []) {
  const visibleMap = new Map(visibleEntries);
  return {
    locator(selector) {
      return createLocatorStub(visibleMap, selector);
    }
  };
}

test('builds prompt payload strings', () => {
  // Objects should become a normal readable operator message instead of a raw JSON blob.
  assert.equal(buildPromptPayload('hello'), 'hello');
  const simplePayload = buildPromptPayload({ prompt: 'Say hello', mode: 'simple' });
  assert.match(simplePayload, /Task:\nSay hello/);
  assert.match(simplePayload, /OUTPUT REQUIREMENTS:/);
  assert.ok(!simplePayload.includes('cwd:'));
  const payload = buildPromptPayload({
    prompt: 'Check the repo',
    repo: {
      cwd: '/tmp/project',
      remote: 'origin',
      branch: 'main',
      head: 'abc123',
      dirty: false,
      visibility: 'public',
      urls: {
        web: 'https://github.com/example/repo',
        commit: 'https://github.com/example/repo/commit/abc123'
      }
    },
    package: { name: 'demo', version: '1.0.0', scripts: ['test'], dependencies: ['playwright'] },
    files: ['index.js'],
    fileReferences: [{ path: 'index.js', url: 'https://github.com/example/repo/blob/abc123/index.js' }],
    issueReferences: [{ url: 'https://github.com/example/repo/issues/12' }],
    attachmentCandidates: [{ path: 'private.py', absolutePath: '/tmp/private.py', size: 42, reason: 'private_repo_context' }],
    capabilityManifest: [
      { name: 'private_file_attachments', supported: true, reason: 'Private repos can attach files.' },
      { name: 'code_file_attachments', supported: true, reason: 'Relevant source files can be uploaded locally so Qwen can inspect exact implementation details.' }
    ],
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
  assert.match(payload, /MANDATE:/);
  assert.match(payload, /repo url: https:\/\/github.com\/example\/repo/);
  assert.match(payload, /commit url: https:\/\/github.com\/example\/repo\/commit\/abc123/);
  assert.match(payload, /PERSISTENT CONSULT STATE:/);
  assert.match(payload, /protocol version: A2A-v2.1-lite/);
  assert.match(payload, /context id: ctx-1/);
  assert.match(payload, /DECISION HISTORY:/);
  assert.match(payload, /Previous decision\./);
  assert.match(payload, /RELEVANT FILE URLs:/);
  assert.match(payload, /ISSUE URLs:/);
  assert.match(payload, /github\.com\/example\/repo\/issues\/12/);
  assert.match(payload, /ATTACHMENT FILES:/);
  assert.match(payload, /ATTACHMENT GUIDANCE:/);
  assert.match(payload, /code_file_attachments/);
  assert.match(payload, /private_repo_context/);
  assert.match(payload, /CAPABILITY MANIFEST:/);
  assert.match(payload, /OUTPUT REQUIREMENTS:/);
  assert.match(payload, /VALIDATION:/);
  assert.match(payload, /DON'T DO:/);
  assert.match(payload, /Playwright docs: https:\/\/playwright.dev\/docs\/intro/);
  assert.match(payload, /COMPLETION CRITERIA:/);
});

test('binds each run to a dedicated Qwen session id', () => {
  assert.equal(resolveQwenSessionId({ sessionId: 'agent-run-1' }), 'agent-run-1');
  const marker = getQwenSessionMarker('agent-run-1');
  assert.equal(marker, 'coder-sin-qwen-session:agent-run-1');
  assert.equal(isQwenSessionBinding({ windowName: marker, sessionStorageId: '' }, 'agent-run-1'), true);
  assert.equal(isQwenSessionBinding({ windowName: '', sessionStorageId: 'other' }, 'agent-run-1'), false);
});

test('caps repo-aware prompt URLs at ten unique entries', () => {
  const payload = buildPromptPayload({
    prompt: 'Audit the repo with every possible reference',
    repo: {
      cwd: '/tmp/project',
      remote: 'origin',
      branch: 'main',
      head: 'abc123',
      dirty: false,
      urls: {
        web: 'https://example.com/repo',
        commit: 'https://example.com/commit',
        tree: 'https://example.com/tree'
      }
    },
    package: { name: 'demo', version: '1.0.0', scripts: ['test'], dependencies: ['playwright'], devDependencies: [] },
    files: ['index.js'],
    fileReferences: [
      { path: 'index.js', url: 'https://example.com/blob/index.js' },
      { path: 'worker.js', url: 'https://example.com/blob/worker.js' },
      { path: 'server.js', url: 'https://example.com/blob/server.js' },
      { path: 'client.js', url: 'https://example.com/blob/client.js' }
    ],
    issueReferences: [
      { url: 'https://github.com/example/repo/issues/1' },
      { url: 'https://github.com/example/repo/issues/2' }
    ],
    attachmentCandidates: [],
    capabilityManifest: [],
    references: [
      { label: 'Node.js docs', url: 'https://nodejs.org/docs/latest/api/', reason: 'official' },
      { label: 'Playwright docs', url: 'https://playwright.dev/docs/intro', reason: 'official' },
      { label: 'GitHub docs', url: 'https://docs.github.com/actions', reason: 'official' },
      { label: 'Infisical docs', url: 'https://infisical.com/docs/cli/commands/secrets', reason: 'official' }
    ],
    constraints: [],
    completionCriteria: [],
    rules: []
  });

  const urls = [...new Set(payload.match(/https?:\/\/[^\s)]+/gu) || [])];
  assert.ok(urls.length <= 10);
});

test('allows temporarily raising the URL budget via env', () => {
  const previous = process.env.SIN_CODER_QWEN_MAX_URLS;
  process.env.SIN_CODER_QWEN_MAX_URLS = '12';

  try {
    assert.equal(resolvePromptUrlBudget(), 12);
  } finally {
    if (previous === undefined) delete process.env.SIN_CODER_QWEN_MAX_URLS;
    else process.env.SIN_CODER_QWEN_MAX_URLS = previous;
  }
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

test('enables Chromium CDP compatibility for attach mode', () => {
  const previous = process.env.PW_CHROMIUM_DISABLE_DOWNLOAD_BEHAVIOR;
  delete process.env.PW_CHROMIUM_DISABLE_DOWNLOAD_BEHAVIOR;

  try {
    assert.equal(ensureChromiumCdpCompatibility(), '1');
    assert.equal(process.env.PW_CHROMIUM_DISABLE_DOWNLOAD_BEHAVIOR, '1');
  } finally {
    if (previous === undefined) delete process.env.PW_CHROMIUM_DISABLE_DOWNLOAD_BEHAVIOR;
    else process.env.PW_CHROMIUM_DISABLE_DOWNLOAD_BEHAVIOR = previous;
  }
});

test('builds safe CDP connect params for user-owned browsers', () => {
  assert.deepEqual(buildSafeCdpConnectParams({ timeout: 5000 }), {
    timeout: 5000,
    isLocal: true,
    acceptDownloads: 'internal-browser-default'
  });
});

test('forces internal browser download handling defaults for CDP attach', () => {
  assert.deepEqual(buildSafePersistentContextOptions({ noDefaultViewport: true }), {
    noDefaultViewport: true,
    acceptDownloads: 'internal-browser-default'
  });
});

test('derives completion timeout from overall session timeout', () => {
  assert.equal(resolveCompletionTimeoutMs(undefined), 120000);
  assert.equal(resolveCompletionTimeoutMs(180000), 170000);
  assert.equal(resolveCompletionTimeoutMs(600000), 590000);
});

test('detects when an extracted assistant reply is usefully new', () => {
  assert.equal(isUsefulAssistantCompletionText('', 'branch json smoke ok.'), true);
  assert.equal(isUsefulAssistantCompletionText('same', 'same'), false);
  assert.equal(isUsefulAssistantCompletionText('same', '   '), false);
});

test('sanitizes ask-qwen wrapper and rejects CLI artifacts', () => {
  assert.equal(sanitizePromptForBrowser('/ask-qwen build the thing'), 'build the thing');
  assert.throws(() => sanitizePromptForBrowser('node ./index.js /ask-qwen build the thing'), /CLI artifact detected/);
});

test('detects English and German Qwen rate-limit pages', () => {
  assert.equal(looksLikeQwenRateLimit('You have reached the daily usage limit. Please wait 8 hours.'), true);
  assert.equal(looksLikeQwenRateLimit('Sie haben das tägliche Nutzungslimit erreicht. Bitte warten Sie 8 Stunden.'), true);
  assert.equal(looksLikeQwenRateLimit('Normal chat content'), false);
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
  const previousPort = process.env.CHROME_REMOTE_DEBUGGING_PORT;
  const previousAttach = process.env.CHROME_ATTACH_MODE;
  process.env.CHROME_PROFILE = '/tmp/Chrome/Default';
  process.env.CHROME_REMOTE_DEBUGGING_PORT = '9444';
  process.env.CHROME_CDP_URL = 'http://127.0.0.1:9444';
  process.env.CHROME_ATTACH_MODE = '1';

  try {
    const config = resolveChromeConnectionConfig();
    assert.equal(config.mode, 'attach');
    assert.equal(config.cdpUrl, 'http://127.0.0.1:9444');
  } finally {
    if (previousProfile === undefined) delete process.env.CHROME_PROFILE;
    else process.env.CHROME_PROFILE = previousProfile;
    if (previousCdp === undefined) delete process.env.CHROME_CDP_URL;
    else process.env.CHROME_CDP_URL = previousCdp;
    if (previousPort === undefined) delete process.env.CHROME_REMOTE_DEBUGGING_PORT;
    else process.env.CHROME_REMOTE_DEBUGGING_PORT = previousPort;
    if (previousAttach === undefined) delete process.env.CHROME_ATTACH_MODE;
    else process.env.CHROME_ATTACH_MODE = previousAttach;
  }
});

test('skips profile existence checks in attach mode', () => {
  assert.equal(shouldRequireChromeProfilePath({ mode: 'attach' }), false);
  assert.equal(shouldRequireChromeProfilePath({ mode: 'launch' }), true);
});

test('skips cloned profile checks only after a verified CDP probe', async () => {
  let loggedEntry = null;
  const result = await resolveChromeProfileCheck({ mode: 'attach', cdpUrl: 'http://127.0.0.1:9444' }, {
    probeFn: async (url, timeoutMs) => {
      assert.equal(url, 'http://127.0.0.1:9444');
      assert.equal(timeoutMs, 2500);
      return { ok: true, latencyMs: 17 };
    },
    logFn: async (entry) => {
      loggedEntry = entry;
    }
  });

  assert.deepEqual(result, { requireProfileCheck: false, probeLatencyMs: 17 });
  assert.deepEqual(loggedEntry, {
    event: 'attach_mode_skip_sidecar_profile_check',
    cdpUrl: 'http://127.0.0.1:9444',
    probeLatencyMs: 17
  });
});

test('fails fast when an attach-mode CDP probe is stale', async () => {
  await assert.rejects(
    () => resolveChromeProfileCheck({ mode: 'attach', cdpUrl: 'http://127.0.0.1:9444' }, {
      probeFn: async () => ({ ok: false, latencyMs: 2501 })
    }),
    /not reachable/
  );
});

test('still requires the profile check in launch mode', async () => {
  let probed = false;
  const result = await resolveChromeProfileCheck({ mode: 'launch', cdpUrl: '' }, {
    probeFn: async () => {
      probed = true;
      return { ok: true, latencyMs: 1 };
    }
  });

  assert.deepEqual(result, { requireProfileCheck: true, probeLatencyMs: 0 });
  assert.equal(probed, false);
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

test('closes attached browser connections without closing Chrome', async () => {
  let closed = 0;
  const attached = {
    async close() {
      closed += 1;
    }
  };

  await createBrowserSessionCloser(attached)();
  assert.equal(closed, 1);
});

test('detects blocking auth overlays before treating chat as ready', async () => {
  const page = createPageStub([
    ['text=Willkommen', true],
    ['button:has-text("Registrieren")', true]
  ]);

  assert.equal(await hasBlockingAuthOverlay(page), true);
});

test('does not flag normal chat pages as blocking auth overlays', async () => {
  const page = createPageStub();
  assert.equal(await hasBlockingAuthOverlay(page), false);
});
