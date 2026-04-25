import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildCandidateCdpUrls, resolveChromeBinaryPath, resolveStartupUrl, seedChromeStartupPreferences } from '../cdp-recovery.js';

test('builds unique CDP candidate list from env', () => {
  const urls = buildCandidateCdpUrls({
    CHROME_CDP_URL: 'http://127.0.0.1:9335',
    CHROME_REMOTE_DEBUGGING_PORT: '9222',
    WEBAUTO_CDP_PORT: '9335'
  });

  assert.deepEqual(urls, [
    'http://127.0.0.1:9335',
    'http://127.0.0.1:9222',
    'http://127.0.0.1:9444'
  ]);
});

test('defaults sidecar startup URL to Qwen chat', () => {
  assert.equal(resolveStartupUrl({}), 'https://chat.qwen.ai');
  assert.equal(resolveStartupUrl({ QWEN_URL: 'https://example.com/custom' }), 'https://example.com/custom');
});

test('resolves the Chrome binary path from env or platform', () => {
  assert.equal(resolveChromeBinaryPath({ CHROME_BIN: '/custom/chrome' }, 'darwin'), '/custom/chrome');
  assert.equal(resolveChromeBinaryPath({}, 'darwin'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
});

test('seeds Chrome startup preferences for the sidecar clone', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'coder-sin-qwen-prefs-'));
  const profileDir = path.join(dir, 'Profile 47');
  await fs.mkdir(profileDir, { recursive: true });
  await fs.writeFile(path.join(profileDir, 'Preferences'), JSON.stringify({ session: { restore_on_startup: 1 } }), 'utf8');

  await seedChromeStartupPreferences(profileDir, 'https://chat.qwen.ai');

  const prefs = JSON.parse(await fs.readFile(path.join(profileDir, 'Preferences'), 'utf8'));
  assert.equal(prefs.session.restore_on_startup, 4);
  assert.deepEqual(prefs.session.startup_urls, ['https://chat.qwen.ai']);
  assert.equal(prefs.homepage, 'https://chat.qwen.ai');
  assert.equal(prefs.homepage_is_newtabpage, false);
});
