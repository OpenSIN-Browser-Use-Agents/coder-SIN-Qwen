import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCompleteReply, detectIncompleteReplyIssues, normalizeRenderedReplyText, resolveHardeningFlags, safeInjectInput } from '../packages/qwen-core/browser-hardening.js';

test('resolves hardening flags with safe input enabled by default', () => {
  const flags = resolveHardeningFlags({});
  assert.equal(flags.safeInput, true);
  assert.equal(flags.safeInputDelayMs, 28);
  assert.equal(flags.maxSequentialMs, 30_000);
});

test('resolves hardening flags from environment', () => {
  const flags = resolveHardeningFlags({
    SIN_CODER_QWEN_SAFE_INPUT: '0',
    SIN_CODER_QWEN_SAFE_INPUT_DELAY_MS: '12'
  });

  assert.equal(flags.safeInput, false);
  assert.equal(flags.safeInputDelayMs, 12);
  assert.equal(flags.maxSequentialMs, 30_000);
});

test('uses pressSequentially when available', async () => {
  const calls = [];
  const input = {
    async click() {
      calls.push('click');
    },
    async pressSequentially(text, options) {
      calls.push(['pressSequentially', text, options]);
    }
  };

  const used = await safeInjectInput({}, input, 'hello', { env: { SIN_CODER_QWEN_SAFE_INPUT: '1' }, delay: 33 });

  assert.equal(used, true);
  assert.deepEqual(calls, ['click', ['pressSequentially', 'hello', { delay: 33 }]]);
});

test('falls back to type when pressSequentially is unavailable', async () => {
  const calls = [];
  const input = {
    async click() {
      calls.push('click');
    },
    async type(text, options) {
      calls.push(['type', text, options]);
    }
  };

  const used = await safeInjectInput({}, input, 'hello', { env: { SIN_CODER_QWEN_SAFE_INPUT: '1' }, delay: 17 });

  assert.equal(used, true);
  assert.deepEqual(calls, ['click', ['type', 'hello', { delay: 5 }]]);
});

test('switches to type for long prompts to avoid timeout', async () => {
  const calls = [];
  const input = {
    async click() {
      calls.push('click');
    },
    async pressSequentially(text, options) {
      calls.push(['pressSequentially', text.length, options]);
    },
    async type(text, options) {
      calls.push(['type', text.length, options]);
    }
  };

  const longPrompt = 'x'.repeat(2000);
  const page = {
    keyboard: {
      async insertText(text) {
        calls.push(['insertText', text.length]);
      }
    }
  };
  const used = await safeInjectInput(page, input, longPrompt, { env: { SIN_CODER_QWEN_SAFE_INPUT: '1', SIN_CODER_QWEN_SAFE_INPUT_DELAY_MS: '28', SIN_CODER_QWEN_SAFE_INPUT_MAX_SEQUENTIAL_MS: '1000' }, delay: 28 });

  assert.equal(used, true);
  assert.deepEqual(calls, ['click', ['insertText', 2000]]);
});

test('respects the opt-out flag', async () => {
  const calls = [];
  const input = {
    async click() {
      calls.push('click');
    },
    async pressSequentially(text, options) {
      calls.push(['pressSequentially', text, options]);
    }
  };

  const used = await safeInjectInput({}, input, 'hello', { env: { SIN_CODER_QWEN_SAFE_INPUT: '0' } });

  assert.equal(used, false);
  assert.deepEqual(calls, []);
});

test('rejects timeout and malformed completion payloads', () => {
  assert.throws(() => assertCompleteReply({ text: 'partial result', timedOut: true }), /COMPLETION_TIMEOUT/);
  assert.throws(() => assertCompleteReply(null), /INVALID_REPLY/);
  assert.throws(() => assertCompleteReply({ text: '   ', timedOut: false }), /EMPTY_REPLY/);
});

test('rejects truncated or structurally broken replies', () => {
  assert.throws(() => assertCompleteReply({ text: 'here is the implementation...', timedOut: false }), /TRUNCATED_REPLY/);
  assert.throws(() => assertCompleteReply({ text: '```js\nconst x = 1;\n', timedOut: false }), /TRUNCATED_REPLY/);
  assert.throws(() => assertCompleteReply({ text: 'function init() { return true;', timedOut: false }), /TRUNCATED_REPLY/);
});

test('normalizes code block extraction artifacts into complete replies', () => {
  assert.equal(
    assertCompleteReply({ text: 'bash\n1\n2\nnpm test -- test/wait-for-completion.test.js\nnpm run verify', timedOut: false }),
    true
  );
  assert.deepEqual(detectIncompleteReplyIssues({ text: 'bash\n1\n2\nnpm run verify', timedOut: false }), []);
});

test('accepts complete plain text and code blocks', () => {
  assert.equal(assertCompleteReply({ text: 'Done. Here is the result.', timedOut: false }), true);
  assert.equal(assertCompleteReply({ text: '```js\nconst x = 1;\n```', timedOut: false }), true);
  assert.equal(assertCompleteReply({ text: 'npm test -- test/wait-for-completion.test.js\nnpm run verify', timedOut: false }), true);
});

test('normalizes rendered code blocks with language labels and line numbers', () => {
  assert.equal(
    normalizeRenderedReplyText('bash\n1\nnpm test\n2\nnpm run verify'),
    'npm test\nnpm run verify'
  );
});
