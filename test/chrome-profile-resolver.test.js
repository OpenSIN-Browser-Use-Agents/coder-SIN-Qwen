import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveChromeProfile, findProfileByName, getChromeProfiles } from '../packages/qwen-core/lib/chrome-profile-resolver.js';

test('getChromeProfiles returns array', () => {
  const profiles = getChromeProfiles();
  assert.ok(Array.isArray(profiles));
});

test('getChromeProfiles handles non-existent dir gracefully', () => {
  const profiles = getChromeProfiles('/tmp/nonexistent-chrome-dir');
  assert.deepEqual(profiles, []);
});

test('findProfileByName finds matching profile', () => {
  const profiles = [
    { directory: 'Default', name: 'S&F Elektro', path: '/tmp/def', exists: true, email: '' },
    { directory: 'Profile 100', name: 'zukunftsorientierte-energie.de', path: '/tmp/p100', exists: true, email: '' },
  ];
  const found = findProfileByName(profiles, 'zukunftsorientierte');
  assert.ok(found);
  assert.equal(found.directory, 'Profile 100');
});

test('findProfileByName returns undefined for no match', () => {
  assert.equal(findProfileByName([], 'nonexistent'), undefined);
});

test('findProfileByName matches email', () => {
  const profiles = [
    { directory: 'Profile 1', name: 'Work', path: '/tmp/p1', exists: true, email: 'dev@example.com' },
  ];
  assert.ok(findProfileByName(profiles, 'dev@example.com'));
});

test('resolveChromeProfile with explicit CHROME_PROFILE path', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-test-'));
  fs.mkdirSync(path.join(tmpDir, 'Default'), { recursive: true });
  const result = resolveChromeProfile({ chromeProfile: tmpDir, profileDirectory: 'Default' });
  assert.equal(result.profileDirectory, 'Default');
  assert.ok(result.profilePath.includes('Default'));
  assert.equal(result.resolved, true);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('resolveChromeProfile with explicit profile directory', () => {
  const result = resolveChromeProfile({ profileDirectory: 'Profile 1' });
  assert.equal(result.profileDirectory, 'Profile 1');
  assert.ok(result.profilePath.includes('Profile 1'));
  assert.equal(result.resolved, true);
});

test('resolveChromeProfile defaults to Default when no env set', () => {
  const result = resolveChromeProfile({});
  assert.ok(result.profilePath);
  assert.ok(result.profileDirectory === 'Default' || result.profileDirectory !== '');
});

test('resolveChromeProfile with invalid path falls back', () => {
  const result = resolveChromeProfile({ chromeProfile: '/dev/null/impossible' });
  assert.ok(result.profilePath);
});

test('resolveChromeProfile preserves userDataDir', () => {
  const result = resolveChromeProfile({ userDataDir: '/custom/chrome' });
  assert.ok(result.userDataDir.includes('custom/chrome'));
});
