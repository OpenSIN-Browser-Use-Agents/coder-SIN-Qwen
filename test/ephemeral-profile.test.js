import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EphemeralProfile, createEphemeralProfile, SessionHealthMonitor, createSessionHealthMonitor } from '../packages/qwen-core/lib/ephemeral-profile.js';

test('EphemeralProfile.create returns a valid path', () => {
  const ep = new EphemeralProfile();
  const p = ep.create();
  assert.ok(p);
  assert.ok(p.includes('coder-sin-qwen-profile-'));
  assert.ok(fs.existsSync(p));
  assert.ok(fs.existsSync(`${p}/Default/Preferences`));
  ep.cleanup();
});

test('EphemeralProfile.exists returns true after create, false after cleanup', () => {
  const ep = new EphemeralProfile();
  assert.equal(ep.exists, false);
  ep.create();
  assert.equal(ep.exists, true);
  ep.cleanup();
  assert.equal(ep.exists, false);
});

test('EphemeralProfile.cleanup is idempotent', () => {
  const ep = new EphemeralProfile();
  ep.cleanup();
  ep.cleanup();
  assert.equal(ep.exists, false);
});

test('EphemeralProfile.path returns empty before create', () => {
  const ep = new EphemeralProfile();
  assert.equal(ep.path, '');
});

test('EphemeralProfile.transferSessionCookie returns false without page', async () => {
  const ep = new EphemeralProfile();
  ep.create();
  const result = await ep.transferSessionCookie(null);
  assert.equal(result, false);
  ep.cleanup();
});

test('createEphemeralProfile is a convenience factory', () => {
  const ep = createEphemeralProfile();
  assert.ok(ep instanceof EphemeralProfile);
  if (ep.exists) ep.cleanup();
});

test('SessionHealthMonitor starts in stopped state', () => {
  const shm = new SessionHealthMonitor();
  assert.equal(shm.isRunning, false);
});

test('SessionHealthMonitor.stop is idempotent', () => {
  const shm = new SessionHealthMonitor();
  shm.stop();
  assert.equal(shm.isRunning, false);
});

test('SessionHealthMonitor.check returns false for null page', async () => {
  const shm = new SessionHealthMonitor({ log: () => {} });
  const result = await shm.check(null);
  assert.equal(result, false);
});

test('SessionHealthMonitor.check returns false for closed page', async () => {
  const shm = new SessionHealthMonitor({ log: () => {} });
  const mockPage = { isClosed: () => true };
  const result = await shm.check(mockPage);
  assert.equal(result, false);
});

test('SessionHealthMonitor.check returns true for healthy chat page', async () => {
  const shm = new SessionHealthMonitor({ log: () => {} });
  const mockPage = {
    isClosed: () => false,
    url: () => 'https://chat.qwen.ai',
    locator: () => ({
      isVisible: async () => false,
      first: () => ({ isVisible: async () => true }),
    }),
  };
  const result = await shm.check(mockPage);
  assert.equal(result, true);
});

test('SessionHealthMonitor.check returns false when login button visible', async () => {
  const shm = new SessionHealthMonitor({ log: () => {} });
  let callCount = 0;
  const mockPage = {
    isClosed: () => false,
    url: () => 'https://chat.qwen.ai',
    locator: () => ({
      isVisible: async () => {
        callCount += 1;
        return callCount <= 2; // first 2 calls = login buttons visible
      },
      first: () => ({ isVisible: async () => false }),
    }),
  };
  const result = await shm.check(mockPage);
  assert.equal(result, false);
});

test('createSessionHealthMonitor is a convenience factory', () => {
  const shm = createSessionHealthMonitor();
  assert.ok(shm instanceof SessionHealthMonitor);
});
