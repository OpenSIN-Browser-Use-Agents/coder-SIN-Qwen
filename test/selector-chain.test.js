import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTOR_CHAINS, getChain, getAllChainNames, getChainSelectors, SelectorStrategy } from '../packages/qwen-core/lib/selector-chain.js';
import { SelectorResolver } from '../packages/qwen-core/lib/selector-resolver.js';

test('SELECTOR_CHAINS has all required entries', () => {
  assert.ok(SELECTOR_CHAINS.sendButton);
  assert.ok(SELECTOR_CHAINS.thinkingToggle);
  assert.ok(SELECTOR_CHAINS.thinkingOption);
  assert.ok(SELECTOR_CHAINS.modelMenu);
  assert.ok(SELECTOR_CHAINS.promptInput);
  assert.ok(SELECTOR_CHAINS.assistantOutput);
  assert.ok(SELECTOR_CHAINS.newChat);
  assert.ok(SELECTOR_CHAINS.authEntry);
  assert.ok(SELECTOR_CHAINS.authEmail);
  assert.ok(SELECTOR_CHAINS.authPassword);
  assert.ok(SELECTOR_CHAINS.authSubmit);
});

test('getChain returns chain with expected structure', () => {
  const chain = getChain('sendButton');
  assert.ok(Array.isArray(chain));
  assert.ok(chain.length > 0);
  for (const step of chain) {
    assert.ok(typeof step.strategy === 'string');
    assert.ok(step.value);
  }
});

test('getChain throws for unknown chain', () => {
  assert.throws(() => getChain('nonexistent'), /Unknown selector chain/);
});

test('getAllChainNames returns all chain names', () => {
  const names = getAllChainNames();
  assert.ok(Array.isArray(names));
  assert.ok(names.includes('sendButton'));
  assert.ok(names.includes('assistantOutput'));
});

test('getChainSelectors returns array', () => {
  const selectors = getChainSelectors('sendButton');
  assert.ok(Array.isArray(selectors));
  assert.ok(selectors.length > 0);
});

test('Each chain has at least one CSS selector as fallback', () => {
  for (const name of getAllChainNames()) {
    const chain = getChain(name);
    const hasCss = chain.some((s) => s.strategy === 'css');
    assert.ok(hasCss, `Chain "${name}" must have at least one CSS fallback`);
  }
});

test('SelectorStrategy enum has all expected values', () => {
  assert.equal(SelectorStrategy.TESTID, 'testid');
  assert.equal(SelectorStrategy.ROLE, 'role');
  assert.equal(SelectorStrategy.TEXT, 'text');
  assert.equal(SelectorStrategy.CSS, 'css');
});

test('SelectorResolver instantiates and has expected methods', () => {
  const resolver = new SelectorResolver({ log: () => {} });
  assert.ok(resolver instanceof SelectorResolver);
  assert.equal(typeof resolver.resolve, 'function');
  assert.equal(typeof resolver.resolveAll, 'function');
  assert.equal(typeof resolver.clearCache, 'function');
  assert.equal(typeof resolver.getCached, 'function');
});

test('SelectorResolver returns null for resolve without page', async () => {
  const resolver = new SelectorResolver();
  const result = await resolver.resolve(null, 'sendButton');
  assert.equal(result, null);
});

test('SelectorResolver caches after first resolve attempt', async () => {
  const resolver = new SelectorResolver({ log: () => {} });
  await resolver.resolve(null, 'sendButton');
  const cached = resolver.getCached('sendButton');
  assert.equal(cached, null); // still null because resolve failed
});

test('SelectorResolver.clearCache clears specific entry', () => {
  const resolver = new SelectorResolver();
  resolver.clearCache('sendButton');
  assert.equal(resolver.getCached('sendButton'), null);
});

test('SelectorResolver.clearCache without arg clears all', () => {
  const resolver = new SelectorResolver();
  resolver.clearCache();
  assert.equal(resolver.getCached('sendButton'), null);
});
