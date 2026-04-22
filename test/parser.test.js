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

test('prefers final assistant json over echoed prompt json', () => {
  const result = parseQwenResponse('{"prompt":"hello","repo":{"dirty":false}}\n\n{"summary":"health-check","actions":["ok"],"files":[],"warnings":[],"status":"final"}');

  assert.equal(result.plan, 'structured-json');
  assert.equal(result.summary, 'health-check');
  assert.deepEqual(result.actions, ['ok']);
  assert.equal(result.payload.status, 'final');
});
