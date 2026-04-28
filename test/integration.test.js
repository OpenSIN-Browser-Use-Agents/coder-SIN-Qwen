import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInboundPrompt } from '../packages/qwen-core/context.js';
import { buildPromptPayload } from '../packages/qwen-core/prompt-builder.js';
import { guardPromptLength } from '../packages/qwen-core/lib/prompt-guard.js';
import { stripFluff } from '../packages/qwen-core/validator.js';
import { resolveRuntimeConfig } from '../packages/qwen-core/runtime-config.js';
import { SecretClient } from '../packages/qwen-core/lib/secret-client.js';

test('Integration: buildPromptPayload returns a non-empty string', () => {
  const result = buildPromptPayload({ prompt: 'Review the code', turnNumber: 1, urlAccessibility: 'private' });
  assert.equal(typeof result, 'string', 'must be a string');
  assert.ok(result.length > 0, 'must not be empty');
  assert.ok(result.includes('Review the code'), 'must contain the prompt');
});

test('Integration: guardPromptLength + buildPromptPayload roundtrip', () => {
  const payload = buildPromptPayload({ prompt: 'x'.repeat(100), turnNumber: 1, urlAccessibility: 'private' });
  const guarded = guardPromptLength(payload, { maxLength: 12000 });
  assert.equal(typeof guarded.prompt, 'string');
  assert.ok(guarded.prompt.length <= 12000);
  assert.equal(guarded.truncated, false);
});

test('Integration: normalizeInboundPrompt strips wrapper prefixes', () => {
  const result = normalizeInboundPrompt('/ask-qwen Review this code');
  assert.ok(!result.startsWith('/ask-qwen'), 'must strip /ask-qwen prefix');
  assert.ok(result.includes('Review'), 'must preserve actual content');
});

test('Integration: normalizeInboundPrompt handles simple prompts', () => {
  const result = normalizeInboundPrompt('Just a simple question');
  assert.equal(result, 'Just a simple question');
});

test('Integration: validator stripFluff + guardPromptLength composition', () => {
  const verbose = 'Here is my analysis:\n\nBased on the code, I think the answer is 42.\n\nIn summary, this is the conclusion.';
  const stripped = stripFluff(verbose);
  const guarded = guardPromptLength(stripped, { maxLength: 500 });
  assert.ok(guarded.prompt.length <= 500);
  assert.ok(guarded.prompt.length <= verbose.length);
});

test('Integration: SecretClient + runtime-config compose correctly', () => {
  const client = new SecretClient(
    { CHROME_REMOTE_DEBUGGING_PORT: { required: false } },
    { env: { CHROME_REMOTE_DEBUGGING_PORT: '9444' } }
  );
  const config = resolveRuntimeConfig({ CHROME_REMOTE_DEBUGGING_PORT: client.get('CHROME_REMOTE_DEBUGGING_PORT') });
  assert.equal(config.chromeRemoteDebuggingPort, 9444);
});

test('Integration: guardPromptLength + validator for roundtrip safety', () => {
  const longText = 'a'.repeat(5000) + ' b '.repeat(1000);
  const guarded = guardPromptLength(longText, { maxLength: 3000 });
  const stripped = stripFluff(guarded.prompt);
  assert.ok(stripped.length <= guarded.prompt.length);
});
