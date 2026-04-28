import test from 'node:test';
import assert from 'node:assert/strict';
import { SecretClient, createSecretClient } from '../packages/qwen-core/lib/secret-client.js';

test('SecretClient returns values from env source', () => {
  const client = new SecretClient({}, { env: { MY_SECRET: 'hello' } });
  assert.equal(client.get('MY_SECRET'), 'hello');
  assert.equal(client.has('MY_SECRET'), true);
});

test('SecretClient falls back to localEnv file', () => {
  const client = new SecretClient({}, { env: {}, localEnv: { MY_SECRET: 'fallback' } });
  assert.equal(client.get('MY_SECRET'), 'fallback');
  assert.equal(client.has('MY_SECRET'), true);
});

test('SecretClient.get throws for missing required secret', () => {
  const schema = { MY_SECRET: { required: true, purpose: 'test' } };
  const client = new SecretClient(schema, { env: {} });
  assert.throws(() => client.get('MY_SECRET'), /Missing required secret/);
  assert.equal(client.has('MY_SECRET'), false);
});

test('SecretClient.getOptional returns fallback for missing secret', () => {
  const client = new SecretClient({}, { env: {} });
  assert.equal(client.getOptional('MISSING', 'default'), 'default');
  assert.equal(client.getOptional('MISSING'), null);
});

test('SecretClient.missing returns names of missing required secrets', () => {
  const schema = {
    A: { required: true, purpose: 'a' },
    B: { required: true, purpose: 'b' },
    C: { required: false, purpose: 'c' },
  };
  const client = new SecretClient(schema, { env: { A: 'ok' } });
  assert.deepEqual(client.missing(), ['B']);
});

test('SecretClient.audit returns comprehensive report', () => {
  const schema = {
    REQ_OK: { required: true, purpose: 'present required' },
    REQ_MISS: { required: true, purpose: 'missing required' },
    OPT_OK: { required: false, purpose: 'present optional' },
    OPT_MISS: { required: false, purpose: 'missing optional' },
  };
  const client = new SecretClient(schema, { env: { REQ_OK: 'yes', OPT_OK: 'yes' } });
  const report = client.audit();
  assert.equal(report.ok, false);
  assert.equal(report.total, 4);
  assert.equal(report.present, 2);
  assert.equal(report.missing, 1);
  const names = report.entries.map((e) => e.name);
  assert.ok(names.includes('REQ_OK'));
  assert.ok(names.includes('REQ_MISS'));
});

test('SecretClient.auditLog returns readable summary', () => {
  const schema = { OK: { required: true, purpose: 'test' } };
  const client = new SecretClient(schema, { env: { OK: 'yes' } });
  const log = client.auditLog();
  assert.ok(log.includes('1/1'));
  assert.ok(log.includes('✓'));
  assert.ok(log.includes('OK'));
});

test('createSecretClient is a convenience factory', () => {
  const client = createSecretClient({}, { env: { X: 'y' } });
  assert.ok(client instanceof SecretClient);
  assert.equal(client.get('X'), 'y');
});

test('SecretClient never logs secret values', () => {
  const schema = { PASSWORD: { required: true, purpose: 'test' } };
  const client = new SecretClient(schema, { env: { PASSWORD: 'super-secret-123' } });
  const log = client.auditLog();
  assert.ok(!log.includes('super-secret-123'));
  const report = client.audit();
  const entry = report.entries.find((e) => e.name === 'PASSWORD');
  assert.equal(entry.present, true);
  assert.equal(entry.source, 'env');
  // Source field must not contain the value
  assert.ok(!entry.source.includes('super-secret'));
});

test('SecretClient prioritizes env over localEnv', () => {
  const client = new SecretClient({}, {
    env: { KEY: 'from-env' },
    localEnv: { KEY: 'from-local' },
  });
  assert.equal(client.get('KEY'), 'from-env');
});

test('SecretClient handles empty env and localEnv gracefully', () => {
  const client = new SecretClient({}, { env: {}, localEnv: {} });
  assert.equal(client.has('ANYTHING'), false);
  assert.equal(client.getOptional('ANYTHING', null), null);
  assert.deepEqual(client.missing(), []);
});

test('SecretClient.missing is empty when schema is empty', () => {
  const client = new SecretClient({}, { env: {} });
  assert.deepEqual(client.missing(), []);
  assert.equal(client.audit().ok, true);
});
