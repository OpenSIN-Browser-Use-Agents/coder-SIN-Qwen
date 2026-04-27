import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultCooldownUntil, isRateLimitCircuitOpen, loadQwenAccounts, markAccountCooldown, markAccountPreferred, markRateLimitFailure, markRateLimitSuccess, normalizeAccountState, resolveQwenAccountIds, resolveQwenRateLimitPolicy, selectNextQwenAccounts } from '../qwen-account-rotation.js';

test('loads Qwen accounts from numbered env vars', () => {
  const accounts = loadQwenAccounts({
    QWEN_ACCOUNT_ORDER: '2,3,1',
    QWEN_ACCOUNT_1_EMAIL: 'one@example.com',
    QWEN_ACCOUNT_1_PASSWORD: 'secret1',
    QWEN_ACCOUNT_2_EMAIL: 'two@example.com',
    QWEN_ACCOUNT_2_PASSWORD: 'secret2',
    QWEN_ACCOUNT_3_EMAIL: 'three@example.com',
    QWEN_ACCOUNT_3_PASSWORD: 'secret3'
  });

  assert.deepEqual(accounts.map((account) => account.id), ['2', '3', '1']);
  assert.equal(accounts[0].email, 'two@example.com');
});

test('resolves explicit account ids', () => {
  assert.deepEqual(resolveQwenAccountIds({ QWEN_ACCOUNT_IDS: '2, 3, 1' }), ['2', '3', '1']);
});

test('prefers the active account and skips cooldowns', () => {
  const accounts = [
    { id: '1', email: 'one@example.com', password: 'secret1' },
    { id: '2', email: 'two@example.com', password: 'secret2' },
    { id: '3', email: 'three@example.com', password: 'secret3' }
  ];
  const state = markAccountPreferred(normalizeAccountState(), '2');
  const ordered = selectNextQwenAccounts(accounts, state, new Date('2026-04-25T00:00:00Z'));

  assert.equal(ordered[0].id, '2');
});

test('marks and preserves cooldowns', () => {
  const until = defaultCooldownUntil(20);
  const state = markAccountCooldown(normalizeAccountState(), '1', until);

  assert.equal(state.cooldowns['1'], until);
  assert.equal(state.preferredAccountId, '');
});

test('opens and clears the rate-limit circuit breaker', () => {
  const policy = resolveQwenRateLimitPolicy({ QWEN_RATE_LIMIT_FAILURE_THRESHOLD: '2', QWEN_RATE_LIMIT_CIRCUIT_BREAKER_MINUTES: '10', QWEN_RATE_LIMIT_COOLDOWN_HOURS: '20' });
  const initial = normalizeAccountState();
  const failedOnce = markRateLimitFailure(initial, '1', policy, new Date('2026-04-25T00:00:00Z'));
  assert.equal(isRateLimitCircuitOpen(failedOnce, new Date('2026-04-25T00:05:00Z')), false);
  const failedTwice = markRateLimitFailure(failedOnce, '2', policy, new Date('2026-04-25T00:10:00Z'));
  assert.equal(isRateLimitCircuitOpen(failedTwice, new Date('2026-04-25T00:11:00Z')), true);

  const recovered = markRateLimitSuccess(failedTwice, '2', new Date('2026-04-25T01:00:00Z'));
  assert.equal(isRateLimitCircuitOpen(recovered, new Date('2026-04-25T01:01:00Z')), false);
});

test('skips account selection while the circuit breaker is open', () => {
  const accounts = [
    { id: '1', email: 'one@example.com', password: 'secret1' },
    { id: '2', email: 'two@example.com', password: 'secret2' }
  ];
  const state = normalizeAccountState({ circuitBreakerUntil: '2026-04-26T00:00:00Z' });

  assert.deepEqual(selectNextQwenAccounts(accounts, state, new Date('2026-04-25T12:00:00Z')), []);
});
