import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTORS } from '../browser.js';

test('Qwen selector map stays populated', () => {
  // A missing selector bucket is an early warning that browser automation might be drifting.
  for (const [key, selectors] of Object.entries(SELECTORS)) {
    assert.ok(Array.isArray(selectors), `${key} should be an array`);
    assert.ok(selectors.length > 0, `${key} should not be empty`);
    for (const selector of selectors) {
      assert.equal(typeof selector, 'string');
      assert.ok(selector.trim().length > 0);
    }
  }
});
