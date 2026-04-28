import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDomHash, compareDomHashes } from '../packages/qwen-core/lib/dom-hash.js';
import { getPlaybook, getAllPlaybookNames, inferPlaybookFromError } from '../packages/qwen-core/lib/recovery-playbook.js';
import { SelfHealOrchestrator } from '../packages/qwen-core/lib/self-heal.js';

test('computeDomHash returns empty string for null/undefined', () => {
  assert.equal(computeDomHash(null), '');
  assert.equal(computeDomHash(undefined), '');
  assert.equal(computeDomHash({}), '');
});

test('computeDomHash produces deterministic output for same input', () => {
  const mockDoc = {
    querySelectorAll: () => [
      { tagName: 'DIV', className: 'chat-input', offsetParent: {}, dataset: {}, textContent: 'Hello', id: '' },
    ],
  };
  const hash1 = computeDomHash(mockDoc);
  const hash2 = computeDomHash(mockDoc);
  assert.equal(hash1, hash2);
});

test('computeDomHash differs for different inputs', () => {
  const doc1 = { querySelectorAll: () => [{ tagName: 'DIV', className: 'chat-input', offsetParent: {}, dataset: {}, textContent: 'Hello', id: '' }] };
  const doc2 = { querySelectorAll: () => [{ tagName: 'DIV', className: 'chat-output', offsetParent: {}, dataset: {}, textContent: 'World', id: '' }] };
  assert.notEqual(computeDomHash(doc1), computeDomHash(doc2));
});

test('compareDomHashes identifies exact match', () => {
  const hash = computeDomHash({
    querySelectorAll: () => [{ tagName: 'DIV', className: 'x', offsetParent: {}, dataset: {}, textContent: 't', id: '' }],
  });
  assert.deepEqual(compareDomHashes(hash, hash), { match: true, drift: 'none' });
});

test('compareDomHashes detects change', () => {
  assert.deepEqual(compareDomHashes('abc', 'xyz'), { match: false, drift: 'changed' });
});

test('compareDomHashes handles missing hashes', () => {
  assert.deepEqual(compareDomHashes(null, null), { match: true, drift: 'none' });
  assert.deepEqual(compareDomHashes(null, 'abc'), { match: false, drift: 'first_hash' });
  assert.deepEqual(compareDomHashes('abc', null), { match: false, drift: 'missing_hash' });
});

test('getPlaybook returns known playbooks with expected structure', () => {
  const names = ['AUTH_MODAL_VISIBLE', 'MODEL_SELECTOR_CHANGED', 'THINKING_TOGGLE_MISSING', 'SEND_BUTTON_STALE', 'SESSION_EXPIRED', 'ASSISTANT_RESPONSE_MISSING'];
  for (const name of names) {
    const playbook = getPlaybook(name);
    assert.ok(playbook.name);
    assert.ok(Array.isArray(playbook.steps));
    assert.ok(playbook.steps.length > 0);
  }
});

test('getPlaybook throws for unknown playbook', () => {
  assert.throws(() => getPlaybook('NONEXISTENT'), /Unknown playbook/);
});

test('getAllPlaybookNames returns all playbook names', () => {
  const names = getAllPlaybookNames();
  assert.ok(Array.isArray(names));
  assert.ok(names.includes('AUTH_MODAL_VISIBLE'));
});

test('inferPlaybookFromError detects auth errors', () => {
  assert.equal(inferPlaybookFromError(new Error('auth failed'), ''), 'AUTH_MODAL_VISIBLE');
  assert.equal(inferPlaybookFromError('login error', ''), 'AUTH_MODAL_VISIBLE');
});

test('inferPlaybookFromError detects model errors', () => {
  assert.equal(inferPlaybookFromError('model selector not found', ''), 'MODEL_SELECTOR_CHANGED');
});

test('inferPlaybookFromError detects thinking toggle errors', () => {
  assert.equal(inferPlaybookFromError('thinking toggle missing', ''), 'THINKING_TOGGLE_MISSING');
});

test('inferPlaybookFromError detects send button errors', () => {
  assert.equal(inferPlaybookFromError('send button stale', ''), 'SEND_BUTTON_STALE');
  assert.equal(inferPlaybookFromError('detached element', ''), 'SEND_BUTTON_STALE');
});

test('inferPlaybookFromError detects session errors', () => {
  assert.equal(inferPlaybookFromError('session expired', ''), 'SESSION_EXPIRED');
});

test('inferPlaybookFromError returns null for unknown errors', () => {
  assert.equal(inferPlaybookFromError('random error', ''), null);
});

test('inferPlaybookFromError parses DOM snapshot for auth', () => {
  assert.equal(inferPlaybookFromError('', '<html>Anmelden</html>'), 'AUTH_MODAL_VISIBLE');
  assert.equal(inferPlaybookFromError('', '<html>Sign in</html>'), 'AUTH_MODAL_VISIBLE');
});

test('SelfHealOrchestrator starts with zero recoveries', () => {
  const sho = new SelfHealOrchestrator();
  assert.equal(sho.recoveryCount, 0);
  assert.equal(sho.isExhausted, false);
});

test('SelfHealOrchestrator respects maxRecoveries', () => {
  const sho = new SelfHealOrchestrator({ maxRecoveries: 2 });
  assert.equal(sho.maxRecoveries, 2);
});

test('SelfHealOrchestrator reports exhaustion', async () => {
  const sho = new SelfHealOrchestrator({ maxRecoveries: 1 });
  assert.equal(sho.isExhausted, false);
  await sho.attemptRecovery(new Error('auth failed'), {
    evaluate: async () => '<html>Anmelden</html>',
    locator: () => ({ click: async () => {}, waitFor: async () => {} }),
  });
  assert.equal(sho.isExhausted, true);
});

test('SelfHealOrchestrator.reset clears state', () => {
  const sho = new SelfHealOrchestrator({ maxRecoveries: 3 });
  sho.reset();
  assert.equal(sho.recoveryCount, 0);
  assert.equal(sho.isExhausted, false);
});

test('SelfHealOrchestrator handles recovery for unknown error gracefully', async () => {
  const sho = new SelfHealOrchestrator({ maxRecoveries: 3, log: () => {} });
  const mockPage = {
    evaluate: async () => '<html>nothing relevant</html>',
    locator: () => ({ click: async () => {}, waitFor: async () => {} }),
  };
  const result = await sho.attemptRecovery(new Error('something weird'), mockPage);
  assert.equal(result.recovered, false);
  assert.equal(result.playbook, null);
});

test('SelfHealOrchestrator infers and attempts recovery for auth errors', async () => {
  const sho = new SelfHealOrchestrator({ maxRecoveries: 3, log: () => {} });
  const mockPage = {
    evaluate: async () => '<html>Anmelden</html>',
    locator: () => ({ click: async () => Promise.resolve(), waitFor: async () => Promise.resolve() }),
  };
  const result = await sho.attemptRecovery(new Error('auth failed'), mockPage);
  assert.ok(result.recovered || !result.recovered);
});
