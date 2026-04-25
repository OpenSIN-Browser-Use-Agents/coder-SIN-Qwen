import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCandidateCdpUrls, resolveStartupUrl } from '../cdp-recovery.js';

test('builds unique CDP candidate list from env', () => {
  const urls = buildCandidateCdpUrls({
    CHROME_CDP_URL: 'http://127.0.0.1:9335',
    CHROME_REMOTE_DEBUGGING_PORT: '9222',
    WEBAUTO_CDP_PORT: '9335'
  });

  assert.deepEqual(urls, [
    'http://127.0.0.1:9335',
    'http://127.0.0.1:9222',
    'http://127.0.0.1:9444'
  ]);
});

test('defaults sidecar startup URL to Qwen chat', () => {
  assert.equal(resolveStartupUrl({}), 'https://chat.qwen.ai');
  assert.equal(resolveStartupUrl({ QWEN_URL: 'https://example.com/custom' }), 'https://example.com/custom');
});
