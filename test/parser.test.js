import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQwenResponse } from '../parser.js';

test('parses structured JSON payloads', () => {
  // Structured payloads are the ideal response shape from the model.
  const result = parseQwenResponse('```json\n{"summary":"Ship it","actions":["A","B"],"files":["index.js"]}\n```');

  assert.equal(result.ok, true);
  assert.equal(result.plan, 'structured-json');
  assert.equal(result.summary, 'Ship it');
  assert.deepEqual(result.actions, ['A', 'B']);
  assert.deepEqual(result.files, ['index.js']);
});

test('extracts freeform actions and files', () => {
  // Freeform fallbacks keep the tool useful even when the model ignores the JSON contract.
  const result = parseQwenResponse('- Update `index.js`\n- Add tests\n\nSee README.md');

  assert.equal(result.plan, 'freeform');
  assert.ok(result.actions.length >= 2);
  assert.ok(result.files.includes('README.md'));
});
