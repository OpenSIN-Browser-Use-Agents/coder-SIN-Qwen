import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBooleanEnv, parseIntegerEnv, resolveRuntimeConfig, validateRuntimeConfig } from '../packages/qwen-core/runtime-config.js';

test('parses runtime config defaults', () => {
  const config = resolveRuntimeConfig({});
  assert.equal(config.authMethod, 'email_password');
  assert.equal(config.dryRun, false);
  assert.equal(config.sessionTimeoutMs, 180000);
  assert.equal(config.rateLimitCooldownHours, 20);
  assert.equal(config.rateLimitFailureThreshold, 2);
  assert.equal(config.rateLimitCircuitBreakerMinutes, 60);
  assert.equal(config.chromeRemoteDebuggingPort, 9444);
});

test('rejects invalid runtime config values', () => {
  assert.throws(() => validateRuntimeConfig({
    authMethod: 'google',
    sessionTimeoutMs: 500,
    rateLimitCooldownHours: 0,
    rateLimitFailureThreshold: 0,
    rateLimitCircuitBreakerMinutes: 0,
    chromeRemoteDebuggingPort: 99999
  }), /Invalid runtime config/);
});

test('parses booleans and integers safely', () => {
  assert.equal(parseBooleanEnv('1'), true);
  assert.equal(parseBooleanEnv('off'), false);
  assert.equal(parseIntegerEnv('9444', 9335, { min: 1, max: 65535, name: 'port' }), 9444);
});
