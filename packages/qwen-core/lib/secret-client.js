import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, '.env.local');

function loadEnvFile(filePath = ENV_FILE) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/u)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.replace(/^export\s+/u, ''))
      .map((l) => {
        const idx = l.indexOf('=');
        return idx === -1 ? [l, ''] : [l.slice(0, idx), l.slice(idx + 1)];
      })
  );
}

export class SecretClient {
  #env;
  #localEnv;
  #schema;

  constructor(schema, options = {}) {
    this.#schema = schema || {};
    this.#env = options.env || process.env;
    this.#localEnv = options.localEnv || loadEnvFile(options.envFile);
  }

  _raw(name) {
    return this.#env[name] || this.#localEnv[name] || null;
  }

  has(name) {
    return this._raw(name) !== null && this._raw(name) !== '';
  }

  get(name) {
    const value = this._raw(name);
    if (value === null || value === '') {
      const meta = this.#schema[name];
      throw new Error(
        `Missing required secret: ${name}${meta ? ` (${meta.purpose})` : ''}`
      );
    }
    return value;
  }

  getOptional(name, fallback = null) {
    const value = this._raw(name);
    return value !== null && value !== '' ? value : fallback;
  }

  missing() {
    return Object.entries(this.#schema)
      .filter(([, meta]) => meta.required)
      .map(([name]) => name)
      .filter((name) => !this.has(name));
  }

  audit() {
    const entries = Object.entries(this.#schema).map(([name, meta]) => ({
      name,
      required: Boolean(meta.required),
      source: this.has(name) ? (this.#env[name] ? 'env' : this.#localEnv[name] ? 'env.local' : 'missing') : 'missing',
      present: this.has(name),
      purpose: meta.purpose || '',
    }));
    return {
      ok: entries.every((e) => e.required ? e.present : true),
      total: entries.length,
      present: entries.filter((e) => e.present).length,
      missing: entries.filter((e) => e.required && !e.present).length,
      entries,
    };
  }

  auditLog() {
    const report = this.audit();
    const lines = [
      `SecretClient Audit: ${report.present}/${report.total} present, ${report.missing} required missing`,
    ];
    for (const entry of report.entries) {
      const status = entry.present ? '✓' : (entry.required ? '✗' : '○');
      lines.push(`  ${status} ${entry.name}${entry.purpose ? ` — ${entry.purpose}` : ''}`);
    }
    return lines.join('\n');
  }
}

export function createSecretClient(schema, options = {}) {
  return new SecretClient(schema, options);
}
