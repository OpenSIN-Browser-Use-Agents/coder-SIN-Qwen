import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MAX_PROMPT_LENGTH, guardPromptLength, resolvePromptLengthGuard } from '../lib/prompt-guard.js';

test('resolvePromptLengthGuard returns defaults for invalid env values', () => {
  const guard = resolvePromptLengthGuard({ SIN_CODER_QWEN_MAX_PROMPT_LENGTH: 'oops' });
  assert.equal(guard.maxPromptLength, DEFAULT_MAX_PROMPT_LENGTH);
});

test('guardPromptLength leaves short prompts untouched', () => {
  const result = guardPromptLength('short prompt', { maxPromptLength: 20, suffix: '\nCUT' });
  assert.deepEqual(result, {
    prompt: 'short prompt',
    truncated: false,
    originalLength: 12,
    truncatedLength: 12,
    threshold: 20
  });
});

test('guardPromptLength truncates oversized prompts safely', () => {
  const result = guardPromptLength('alpha beta gamma delta epsilon', { maxPromptLength: 18, suffix: '\nCUT' });
  assert.equal(result.truncated, true);
  assert.equal(result.threshold, 18);
  assert.ok(result.prompt.length <= 18);
  assert.match(result.prompt, /CUT$/);
});
