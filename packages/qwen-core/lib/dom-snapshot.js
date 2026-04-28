import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_SNAPSHOTS = 50;
const SNAPSHOT_DIR = 'artifacts/snapshots';

export class DomSnapshotManager {
  #dir;
  #maxSnapshots;
  #snapshots;

  constructor(options = {}) {
    this.#dir = options.dir || SNAPSHOT_DIR;
    this.#maxSnapshots = options.maxSnapshots || MAX_SNAPSHOTS;
    this.#snapshots = [];
  }

  get dir() { return this.#dir; }

  get count() { return this.#snapshots.length; }

  get snapshots() { return [...this.#snapshots]; }

  async capture(stepName, page) {
    if (!page) return null;
    try {
      const html = await page.evaluate(() => {
        const relevant = document.querySelector('[class*="chat"], [class*="message"], [class*="input"], [role="main"], main, body');
        return (relevant || document.body).innerHTML.slice(0, 5000);
      }).catch(() => '');

      if (!html) return null;

      const sanitized = html.replace(/value="[^"]*"/gi, 'value="[REDACTED]"');
      const filename = `${stepName.replace(/[^a-z0-9]/gi, '_')}.snapshot.html`;
      const filepath = path.join(this.#dir, filename);

      await fs.mkdir(this.#dir, { recursive: true });
      await fs.writeFile(filepath, sanitized, 'utf8');

      const entry = { step: stepName, file: filepath, size: sanitized.length, timestamp: new Date().toISOString() };
      this.#snapshots.push(entry);

      if (this.#snapshots.length > this.#maxSnapshots) {
        const oldest = this.#snapshots.shift();
        await fs.unlink(oldest.file).catch(() => {});
      }

      return entry;
    } catch {
      return null;
    }
  }

  async getHtml(stepName) {
    const snapshot = this.#snapshots.find((s) => s.step === stepName);
    if (!snapshot) return null;
    try {
      return await fs.readFile(snapshot.file, 'utf8');
    } catch {
      return null;
    }
  }

  async cleanup() {
    for (const snapshot of this.#snapshots) {
      await fs.unlink(snapshot.file).catch(() => {});
    }
    this.#snapshots = [];
    await fs.rmdir(this.#dir).catch(() => {});
  }
}

export function createDomSnapshotManager(options = {}) {
  return new DomSnapshotManager(options);
}
