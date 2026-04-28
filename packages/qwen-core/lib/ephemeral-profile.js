import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getSecretClient } from '../secret-schema.js';

export class EphemeralProfile {
  #profilePath;
  #created;

  constructor() {
    this.#profilePath = '';
    this.#created = false;
  }

  get path() {
    return this.#profilePath;
  }

  get exists() {
    return this.#created && this.#profilePath && fs.existsSync(this.#profilePath);
  }

  create() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coder-sin-qwen-profile-'));
    const dirs = ['Default', 'Default/Cache', 'Default/Extensions'];
    for (const dir of dirs) {
      fs.mkdirSync(path.join(tmpDir, dir), { recursive: true });
    }
    const prefs = {
      profile: { content_settings: { exceptions: {} } },
      browser: { disable_session_crashed_bubble: true },
      download: { directory_upgrade: true },
    };
    fs.writeFileSync(
      path.join(tmpDir, 'Default', 'Preferences'),
      JSON.stringify(prefs),
      { encoding: 'utf8', mode: 0o600 }
    );
    this.#profilePath = tmpDir;
    this.#created = true;
    return tmpDir;
  }

  cleanup() {
    if (!this.exists) return;
    try {
      fs.rmSync(this.#profilePath, { recursive: true, force: true });
    } catch {
    }
    this.#profilePath = '';
    this.#created = false;
  }

  async transferSessionCookie(page) {
    if (!page) return false;
    try {
      const cookies = await page.evaluate(() => {
        return document.cookie.split(';').map((c) => c.trim()).filter(Boolean);
      }).catch(() => []);
      return cookies.length > 0;
    } catch {
      return false;
    }
  }
}

export function createEphemeralProfile() {
  return new EphemeralProfile();
}

export class SessionHealthMonitor {
  #interval;
  #client;
  #log;

  constructor(options = {}) {
    this.#interval = null;
    this.#client = options.client || getSecretClient();
    this.#log = options.log || (() => {});
  }

  get isRunning() {
    return this.#interval !== null;
  }

  start(page, intervalMs = 60000) {
    if (this.#interval) return;
    this.#interval = setInterval(async () => {
      try {
        const healthy = await this.check(page);
        if (!healthy) {
          this.#log('session_health_check_failed', { timestamp: new Date().toISOString() });
        }
      } catch (error) {
        this.#log('session_health_check_error', { error: error?.message });
      }
    }, intervalMs);
  }

  stop() {
    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }
  }

  async check(page) {
    if (!page || page.isClosed()) {
      this.#log('session_health_page_closed', {});
      return false;
    }
    try {
      const hasLoginButton = await page.locator('button:has-text("Anmelden")').isVisible().catch(() => false);
      const hasSignInButton = await page.locator('button:has-text("Sign in")').isVisible().catch(() => false);
      const hasChatInput = await page.locator('textarea, [contenteditable="true"]').first().isVisible().catch(() => false);
      const url = page.url();
      const isOnChatPage = url.includes('chat.qwen.ai') && !url.includes('login') && !url.includes('signin');

      const loggedIn = hasChatInput || (isOnChatPage && !hasLoginButton && !hasSignInButton);
      this.#log('session_health_check', {
        hasLoginButton,
        hasSignInButton,
        hasChatInput,
        url: url.slice(0, 80),
        loggedIn,
      });
      return loggedIn;
    } catch {
      return false;
    }
  }
}

export function createSessionHealthMonitor(options = {}) {
  return new SessionHealthMonitor(options);
}
