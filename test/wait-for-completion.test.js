import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForQwenCompletion } from '../lib/wait-for-completion.js';

function createPage(textProvider) {
  return {
    locator(selector) {
      return {
        async waitFor() {},
        last() {
          return this;
        },
        async count() {
          return 1;
        },
        async innerText() {
          return textProvider(null, selector);
        }
      };
    },
    async evaluate(fn, selector) {
      return textProvider(fn, selector);
    },
    async waitForTimeout() {}
  };
}

test('waits until the assistant text is stable', async () => {
  const texts = ['stabile antwort', 'stabile antwort', 'stabile antwort'];
  let index = 0;
  let now = 0;
  const page = createPage(async () => texts[Math.min(index++, texts.length - 1)]);

  const result = await waitForQwenCompletion(page, {
    timeout: 1000,
    stabilityMs: 200,
    pollMs: 100,
    now: () => now,
    sleep: async (ms) => { now += ms; }
  });

  assert.equal(result, 'stabile antwort');
  assert.ok(index >= 2);
});

test('tracks streaming output until the final response settles', async () => {
  const texts = ['teil 1', 'teil 1 teil 2', 'teil 1 teil 2 fertig', 'teil 1 teil 2 fertig', 'teil 1 teil 2 fertig'];
  let index = 0;
  let now = 0;
  const page = createPage(async () => texts[Math.min(index++, texts.length - 1)]);

  const result = await waitForQwenCompletion(page, {
    timeout: 1500,
    stabilityMs: 200,
    pollMs: 100,
    now: () => now,
    sleep: async (ms) => { now += ms; }
  });

  assert.equal(result, 'teil 1 teil 2 fertig');
});

test('throws when the assistant text never stabilizes', async () => {
  let index = 0;
  let now = 0;
  const page = createPage(async () => `stream-${index++}`);

  await assert.rejects(
    () => waitForQwenCompletion(page, {
      timeout: 300,
      stabilityMs: 200,
      pollMs: 100,
      now: () => now,
      sleep: async (ms) => { now += ms; }
    }),
    /stabilisierte sich nicht/
  );
});
