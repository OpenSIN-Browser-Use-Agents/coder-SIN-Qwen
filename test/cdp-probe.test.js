import test from 'node:test';
import assert from 'node:assert/strict';
import { probeCdpEndpoint } from '../lib/cdp-probe.js';

test('probeCdpEndpoint returns ok=true for a healthy endpoint', async () => {
  const result = await probeCdpEndpoint('http://127.0.0.1:9444', 2500, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { Browser: 'Chrome/136.0.0.0' };
      }
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.payload?.Browser, 'Chrome/136.0.0.0');
});

test('probeCdpEndpoint fails fast on timeout', async () => {
  const result = await probeCdpEndpoint('http://127.0.0.1:19999', 50, {
    fetchImpl: async (_url, options) => new Promise((resolve, reject) => {
      if (options.signal.aborted) {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        return;
      }

      const timer = setTimeout(() => resolve({ ok: true, status: 200, async json() { return {}; } }), 5_000);
      options.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      }, { once: true });
    })
  });

  assert.equal(result.ok, false);
  assert.match(String(result.error?.message || ''), /timed out after 50ms/);
});
