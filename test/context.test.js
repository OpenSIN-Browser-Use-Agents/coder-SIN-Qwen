import test from 'node:test';
import assert from 'node:assert/strict';
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
});
