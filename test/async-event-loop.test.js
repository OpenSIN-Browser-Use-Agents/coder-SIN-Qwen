import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncEventLoop, createAsyncEventLoop, TaskStatus, ProgressIndicator, createProgressIndicator } from '../packages/qwen-core/lib/async-event-loop.js';

function setupLoop(opts) {
  const loop = new AsyncEventLoop(opts);
  test.after(async () => await loop.shutdown(50).catch(() => {}));
  return loop;
}

test('AsyncEventLoop starts empty', () => {
  const loop = setupLoop();
  assert.equal(loop.queued, 0);
  assert.equal(loop.running, 0);
});

test('AsyncEventLoop.enqueue adds and runs task', async () => {
  const loop = setupLoop({ maxConcurrency: 1 });
  const id = loop.enqueue({ exec: async () => 'done' });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(loop.getStatus(id).status, TaskStatus.COMPLETED);
  assert.equal(loop.getStatus(id).result, 'done');
});

test('AsyncEventLoop respects maxConcurrency', async () => {
  let maxRunning = 0, running = 0;
  const loop = setupLoop({ maxConcurrency: 2 });
  for (let i = 1; i <= 3; i++) {
    loop.enqueue({ id: `t${i}`, exec: async () => { running++; maxRunning = Math.max(maxRunning, running); await new Promise(r => setTimeout(r, 20)); running--; } });
  }
  await new Promise(r => setTimeout(r, 200));
  assert.ok(maxRunning <= 2);
});

test('AsyncEventLoop handles task timeout', async () => {
  const loop = setupLoop({ maxConcurrency: 1 });
  const id = loop.enqueue({ exec: async () => { await new Promise(() => {}); }, timeout: 50 });
  await new Promise(r => setTimeout(r, 150));
  assert.equal(loop.getStatus(id).status, TaskStatus.FAILED);
});

test('AsyncEventLoop.cancel removes queued task', () => {
  const loop = setupLoop({ maxConcurrency: 1 });
  loop.enqueue({ id: 'slow', exec: async () => { await new Promise(() => {}); }, timeout: 50 });
  loop.enqueue({ id: 'cancelme', exec: async () => 'never' });
  assert.equal(loop.cancel('cancelme'), true);
});

test('AsyncEventLoop.cancel returns false for unknown id', () => {
  assert.equal(new AsyncEventLoop().cancel('nonexistent'), false);
});

test('AsyncEventLoop.clear empties all tasks', () => {
  const loop = setupLoop({ maxConcurrency: 1 });
  loop.enqueue({ id: 'a', exec: async () => { await new Promise(() => {}); }, timeout: 50 });
  loop.clear();
  assert.equal(loop.queued, 0);
});

test('AsyncEventLoop fires onError callback', async () => {
  let err = null;
  setupLoop({ onError: (t, e) => { err = e; } }).enqueue({ exec: async () => { throw new Error('boom'); } });
  await new Promise(r => setTimeout(r, 30));
  assert.equal(err.message, 'boom');
});

test('AsyncEventLoop fires onComplete callback', async () => {
  let result = null;
  const loop = setupLoop();
  loop.enqueue({ exec: async () => 'res', onComplete: (r) => { result = r; } });
  await new Promise(r => setTimeout(r, 30));
  assert.equal(result, 'res');
});

test('ProgressIndicator start/stop', () => {
  const pi = new ProgressIndicator();
  pi.start();
  assert.equal(pi.isRunning, true);
  pi.stop();
  assert.equal(pi.isRunning, false);
});

test('ProgressIndicator fail', () => {
  const pi = new ProgressIndicator();
  pi.start();
  pi.fail();
  assert.equal(pi.isRunning, false);
});
