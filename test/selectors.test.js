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

  assert.ok(SELECTORS.modelMenu.some((selector) => selector.includes('ant-dropdown-trigger')), 'model menu should include the visible Qwen dropdown trigger');
  assert.ok(SELECTORS.newChat.some((selector) => selector.includes('sidebar-entry-fixed-list')), 'new chat should include the visible sidebar trigger');
  assert.ok(SELECTORS.modelMenu.length >= 3, 'model menu should keep multiple fallbacks because Qwen UI drifts often');
  assert.ok(SELECTORS.thinkingMenu.some((selector) => selector.includes('qwen-thinking-selector')), 'thinking menu should include the visible Qwen thinking selector');
  assert.ok(SELECTORS.thinkingOption.some((selector) => selector.includes('Denken')), 'thinking options should include the Denken selector');
  assert.ok(SELECTORS.authEntry.some((selector) => selector.includes('Anmelden') || selector.includes('login')), 'auth entry should include visible login entry points');
  assert.ok(SELECTORS.authOverlay.some((selector) => selector.includes('Angemeldet bleiben') || selector.includes('Welcome') || selector.includes('dialog')), 'auth overlay selectors should include modal-specific blockers');
  assert.ok(!('googleLogin' in SELECTORS), 'google login selectors should stay removed');
});
