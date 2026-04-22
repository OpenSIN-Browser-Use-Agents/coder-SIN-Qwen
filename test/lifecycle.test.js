import test from 'node:test';
import assert from 'node:assert/strict';
import { attachLifecycleHooks, getLifecycleResourceCount, registerLifecycleResource, resetLifecycleForTests, runLifecycleCleanup, unregisterLifecycleResource } from '../lifecycle.js';

test('registers and unregisters lifecycle resources', () => {
  resetLifecycleForTests();
  registerLifecycleResource('resource-1', async () => {});
  assert.equal(getLifecycleResourceCount(), 1);
  unregisterLifecycleResource('resource-1');
  assert.equal(getLifecycleResourceCount(), 0);
});

test('runs cleanup handlers on lifecycle cleanup', async () => {
  resetLifecycleForTests();
  let cleaned = false;
  registerLifecycleResource('resource-2', async () => {
    cleaned = true;
  });

  await runLifecycleCleanup('manual', 1000);

  assert.equal(cleaned, true);
});

test('attachLifecycleHooks is idempotent', () => {
  resetLifecycleForTests();
  attachLifecycleHooks({ exitImpl: () => {} });
  attachLifecycleHooks({ exitImpl: () => {} });
  assert.equal(getLifecycleResourceCount(), 0);
});
