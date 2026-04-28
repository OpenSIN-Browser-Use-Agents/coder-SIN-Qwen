import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StructuredLogger, createStructuredLogger, createLogEntry, formatLogEntry, nextStepId, resetStepCounter } from '../packages/qwen-core/lib/structured-log.js';
import { DomSnapshotManager, createDomSnapshotManager } from '../packages/qwen-core/lib/dom-snapshot.js';

test('nextStepId produces incrementing IDs', () => {
  resetStepCounter();
  const a = nextStepId('step');
  const b = nextStepId('step');
  assert.notEqual(a, b);
  assert.ok(a.endsWith('_1'));
  assert.ok(b.endsWith('_2'));
});

test('resetStepCounter resets to 1', () => {
  resetStepCounter();
  assert.equal(nextStepId('x'), 'x_1');
});

test('createLogEntry has all expected fields', () => {
  const entry = createLogEntry({
    stepId: 'test_1',
    traceId: 'tr_abc',
    state: 'SENDING',
    event: 'SEND_CLICKED',
    message: 'Sending message',
  });
  assert.equal(entry.step_id, 'test_1');
  assert.equal(entry.trace_id, 'tr_abc');
  assert.equal(entry.state, 'SENDING');
  assert.equal(entry.event, 'SEND_CLICKED');
  assert.equal(entry.message, 'Sending message');
  assert.ok(entry.timestamp);
});

test('createLogEntry includes optional fields', () => {
  const entry = createLogEntry({
    domHash: 'abc123',
    selectorChain: 'testid',
    error: 'timeout',
    recoveryAttempts: 2,
    snapshotPath: '/tmp/snap.html',
  });
  assert.equal(entry.dom_hash, 'abc123');
  assert.equal(entry.error, 'timeout');
  assert.equal(entry.recovery_attempts, 2);
});

test('formatLogEntry produces readable string', () => {
  const text = formatLogEntry({ timestamp: '2026-01-01', state: 'IDLE', event: 'INIT', step_id: 's1', message: 'start' });
  assert.ok(text.includes('IDLE'));
  assert.ok(text.includes('INIT'));
  assert.ok(text.includes('start'));
});

test('StructuredLogger starts empty', () => {
  const log = new StructuredLogger();
  assert.equal(log.entries.length, 0);
  assert.equal(log.lastEntry, null);
});

test('StructuredLogger.log stores entries', () => {
  const log = new StructuredLogger();
  log.log({ message: 'test' });
  assert.equal(log.entries.length, 1);
  assert.equal(log.lastEntry.message, 'test');
});

test('StructuredLogger.clear removes entries', () => {
  const log = new StructuredLogger();
  log.log({ message: 'test' });
  log.clear();
  assert.equal(log.entries.length, 0);
});

test('StructuredLogger.toJSON returns newline-separated JSON', () => {
  const log = new StructuredLogger();
  log.log({ message: 'first' });
  log.log({ message: 'second' });
  const json = log.toJSON();
  assert.ok(json.includes('\n'));
  assert.ok(json.includes('first'));
  assert.ok(json.includes('second'));
});

test('StructuredLogger.toText returns readable format', () => {
  const log = new StructuredLogger();
  log.log({ message: 'hello' });
  const text = log.toText();
  assert.ok(typeof text === 'string');
  assert.ok(text.length > 0);
});

test('createStructuredLogger is factory', () => {
  const log = createStructuredLogger();
  assert.ok(log instanceof StructuredLogger);
});

test('DomSnapshotManager starts empty', () => {
  const mgr = new DomSnapshotManager();
  assert.equal(mgr.count, 0);
});

test('DomSnapshotManager.capture returns null without page', async () => {
  const mgr = new DomSnapshotManager();
  const result = await mgr.capture('test', null);
  assert.equal(result, null);
});

test('DomSnapshotManager.cleanup is safe on empty manager', async () => {
  const mgr = new DomSnapshotManager();
  await mgr.cleanup();
  assert.equal(mgr.count, 0);
});

test('DomSnapshotManager.capture writes snapshot file', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-test-'));
  const mgr = new DomSnapshotManager({ dir: tmpDir, maxSnapshots: 5 });
  const mockPage = {
    evaluate: async () => '<div class="chat">Hello</div>',
  };
  const result = await mgr.capture('send_step', mockPage);
  assert.ok(result, 'should return entry');
  assert.ok(fs.existsSync(result.file), 'file should exist');
  assert.equal(result.step, 'send_step');
  await mgr.cleanup();
});

test('DomSnapshotManager respects maxSnapshots', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-limit-'));
  const mgr = new DomSnapshotManager({ dir: tmpDir, maxSnapshots: 2 });
  const mockPage = {
    evaluate: async () => '<div>content</div>',
  };
  await mgr.capture('step1', mockPage);
  await mgr.capture('step2', mockPage);
  await mgr.capture('step3', mockPage);
  assert.ok(mgr.count <= 2);
  await mgr.cleanup();
});

test('createDomSnapshotManager is factory', () => {
  const mgr = createDomSnapshotManager();
  assert.ok(mgr instanceof DomSnapshotManager);
});
