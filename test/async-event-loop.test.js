import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncEventLoop, createAsyncEventLoop, TaskStatus, ProgressIndicator, createProgressIndicator } from '../packages/qwen-core/lib/async-event-loop.js';

test('AsyncEventLoop starts empty', () => {
  const loop = new AsyncEventLoop();
  assert.equal(loop.queued, 0);
  assert.equal(loop.running, 0);
  assert.equal(loop.pending, 0);
});

test('AsyncEventLoop.enqueue adds and runs task', async () => {
  const loop = new AsyncEventLoop({ maxConcurrency: 1 });
  const id = loop.enqueue({
    id: 'test1',
    exec: async () => 'done',
  });
  assert.ok(id);
  await new Promise((r) => setTimeout(r, 30));
  const status = loop.getStatus(id);
  assert.equal(status.status, TaskStatus.COMPLETED);
  assert.equal(status.result, 'done');
});

test('AsyncEventLoop respects maxConcurrency', async () => {
  const loop = new AsyncEventLoop({ maxConcurrency: 2 });
  let running = 0;
  let maxRunning = 0;
  loop.enqueue({
    id: 't1',
    exec: async () => { running += 1; maxRunning = Math.max(maxRunning, running); await new Promise((r) => setTimeout(r, 30)); running -= 1; },
  });
  loop.enqueue({
    id: 't2',
    exec: async () => { running += 1; maxRunning = Math.max(maxRunning, running); await new Promise((r) => setTimeout(r, 30)); running -= 1; },
  });
  loop.enqueue({
    id: 't3',
    exec: async () => { running += 1; maxRunning = Math.max(maxRunning, running); await new Promise((r) => setTimeout(r, 30)); running -= 1; },
  });
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(maxRunning <= 2, 'max concurrency must not exceed 2');
});

test('AsyncEventLoop.cancel removes queued task', async () => {
  const loop = new AsyncEventLoop({ maxConcurrency: 1 });
  loop.enqueue({ id: 'slow', exec: async () => { await new Promise((r) => setTimeout(r, 1000)); }, timeout: 50 });
  loop.enqueue({ id: 'cancelme', exec: async () => 'never' });
  const result = loop.cancel('cancelme');
  assert.equal(result, true);
  await new Promise((r) => setTimeout(r, 30));
});

test('AsyncEventLoop.cancel returns false for unknown id', () => {
  const loop = new AsyncEventLoop();
  assert.equal(loop.cancel('nonexistent'), false);
});

test('AsyncEventLoop.clear empties all tasks', async () => {
  const loop = new AsyncEventLoop({ maxConcurrency: 1 });
  loop.enqueue({ id: 'a', exec: async () => { await new Promise((r) => setTimeout(r, 50)); } });
  loop.enqueue({ id: 'b', exec: async () => { await new Promise((r) => setTimeout(r, 50)); } });
  loop.clear();
  assert.equal(loop.queued, 0);
  assert.equal(loop.running, 0);
  await new Promise((r) => setTimeout(r, 100));
});

test('AsyncEventLoop handles task timeout', async () => {
  const loop = new AsyncEventLoop({ maxConcurrency: 1 });
  const id = loop.enqueue({
    exec: async () => { await new Promise((r) => setTimeout(r, 500)); },
    timeout: 50,
  });
  await new Promise((r) => setTimeout(r, 200));
  const status = loop.getStatus(id);
  assert.equal(status.status, TaskStatus.FAILED);
});

test('AsyncEventLoop fires onError callback', async () => {
  let errorCaught = null;
  const loop = new AsyncEventLoop({
    maxConcurrency: 1,
    onError: (task, error) => { errorCaught = error; },
  });
  loop.enqueue({ exec: async () => { throw new Error('boom'); } });
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(errorCaught);
  assert.equal(errorCaught.message, 'boom');
});

test('AsyncEventLoop fires onComplete callback', async () => {
  let completed = null;
  const loop = new AsyncEventLoop({ maxConcurrency: 1 });
  loop.enqueue({
    exec: async () => 'result',
    onComplete: (r) => { completed = r; },
  });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(completed, 'result');
});

test('AsyncEventLoop fires onError callback per task', async () => {
  let errorMsg = null;
  const loop = new AsyncEventLoop({ maxConcurrency: 1 });
  loop.enqueue({
    exec: async () => { throw new Error('task error'); },
    onError: (e) => { errorMsg = e.message; },
  });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(errorMsg, 'task error');
});

test('createAsyncEventLoop is factory', () => {
  const loop = createAsyncEventLoop();
  assert.ok(loop instanceof AsyncEventLoop);
});

test('ProgressIndicator starts in stopped state', () => {
  const pi = new ProgressIndicator();
  assert.equal(pi.isRunning, false);
});

test('ProgressIndicator.start begins animation', () => {
  const pi = new ProgressIndicator();
  pi.start('Testing');
  assert.equal(pi.isRunning, true);
  pi.stop();
  assert.equal(pi.isRunning, false);
});

test('ProgressIndicator.stop is idempotent', () => {
  const pi = new ProgressIndicator();
  pi.stop();
  assert.equal(pi.isRunning, false);
});

test('ProgressIndicator.fail stops with error', () => {
  const pi = new ProgressIndicator();
  pi.start('Working');
  pi.fail('Error');
  assert.equal(pi.isRunning, false);
});

test('createProgressIndicator is factory', () => {
  const pi = createProgressIndicator();
  assert.ok(pi instanceof ProgressIndicator);
});
