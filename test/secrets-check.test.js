import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSecrets } from '../secrets-check.js';

test('secret checker reports missing required secrets', () => {
  // Required secrets should fail loudly even if recommended ones are absent too.
  const result = checkSecrets({}, { required: ['CHROME_PROFILE'], recommended: ['GH_TOKEN'] }, {});

  assert.deepEqual(result.requiredMissing, ['CHROME_PROFILE']);
  assert.deepEqual(result.recommendedMissing, ['GH_TOKEN']);
});

test('secret checker accepts env and local env values', () => {
  // Either process.env or .env.local should satisfy the checklist.
  const result = checkSecrets(
    { CHROME_PROFILE: '/tmp/profile' },
    { required: ['CHROME_PROFILE'], recommended: ['GH_TOKEN'] },
    { GH_TOKEN: 'token' }
  );

  assert.deepEqual(result.requiredMissing, []);
  assert.deepEqual(result.recommendedMissing, []);
});
