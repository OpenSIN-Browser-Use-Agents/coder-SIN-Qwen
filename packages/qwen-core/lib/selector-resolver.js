import { getChain, getAllChainNames } from './selector-chain.js';

export class SelectorResolver {
  #cache;
  #log;

  constructor(options = {}) {
    this.#cache = new Map();
    this.#log = options.log || (() => {});
  }

  clearCache(chainName) {
    if (chainName) this.#cache.delete(chainName);
    else this.#cache.clear();
  }

  getCached(chainName) {
    return this.#cache.get(chainName) || null;
  }

  async resolve(page, chainName) {
    const cached = this.#cache.get(chainName);
    if (cached) return cached;

    const chain = getChain(chainName);
    let lastError = null;

    for (let index = 0; index < chain.length; index += 1) {
      const step = chain[index];
      try {
        const locator = this.#buildLocator(page, step);
        const visible = await locator.isVisible().catch(() => false);
        if (visible) {
          const domHash = await page.evaluate(() => {
            const el = document.activeElement;
            return el ? el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.slice(0, 40) : '') : '';
          }).catch(() => '');
          const result = { locator, step, chainIndex: index };
          this.#cache.set(chainName, result);
          this.#log('selector_resolved', {
            chain: chainName,
            strategy: step.strategy,
            index,
            domHash,
          });
          return result;
        }
      } catch (error) {
        lastError = error;
      }
    }

    this.#log('selector_unresolved', { chain: chainName, lastError: lastError?.message });
    return null;
  }

  async resolveAll(page) {
    const results = {};
    for (const name of getAllChainNames()) {
      results[name] = await this.resolve(page, name);
    }
    return results;
  }

  #buildLocator(page, step) {
    switch (step.strategy) {
      case 'testid':
        return page.getByTestId(step.value);
      case 'role':
        return step.name ? page.getByRole(step.value, { name: step.name }) : page.getByRole(step.value);
      case 'text':
        return step.name
          ? page.getByText(step.value, { exact: step.exact })
          : page.getByText(step.value);
      case 'css':
        return page.locator(step.value);
      case 'ax':
      case 'accessibility_tree':
        return page.accessibility.snapshot().then(() => page.locator(step.value));
      default:
        return page.locator(step.value);
    }
  }
}

export function createSelectorResolver(options = {}) {
  return new SelectorResolver(options);
}
