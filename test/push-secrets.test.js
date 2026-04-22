import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSecretEntries } from '../push-secrets.js';

test('collects only available secret entries', () => {
  // Only names with concrete values should be pushed to Infisical.
  const entries = collectSecretEntries(
    { CHROME_PROFILE: '/tmp/profile' },
    { GH_TOKEN: 'token' },
    { required: ['CHROME_PROFILE'], recommended: ['GH_TOKEN', 'QWEN_URL'] }
  );

  assert.deepEqual(entries, [
    ['CHROME_PROFILE', '/tmp/profile'],
    ['GH_TOKEN', 'token']
  ]);
});
