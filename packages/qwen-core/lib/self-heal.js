import { computeDomHash, compareDomHashes } from './dom-hash.js';
import { getPlaybook, inferPlaybookFromError } from './recovery-playbook.js';

export class SelfHealOrchestrator {
  #expectedHashes;
  #recoveryCount;
  #maxRecoveries;
  #log;

  constructor(options = {}) {
    this.#expectedHashes = new Map();
    this.#recoveryCount = 0;
    this.#maxRecoveries = options.maxRecoveries || 3;
    this.#log = options.log || (() => {});
  }

  get recoveryCount() {
    return this.#recoveryCount;
  }

  get maxRecoveries() {
    return this.#maxRecoveries;
  }

  get isExhausted() {
    return this.#recoveryCount >= this.#maxRecoveries;
  }

  recordHash(stepName, page) {
    const hash = computeDomHash(page.document || page);
    this.#expectedHashes.set(stepName, hash);
    return hash;
  }

  checkDrift(stepName, page) {
    const expected = this.#expectedHashes.get(stepName);
    const actual = computeDomHash(page.document || page);
    return compareDomHashes(expected, actual);
  }

  async attemptRecovery(error, page) {
    if (this.isExhausted) {
      this.#log('self_heal_exhausted', { recoveryCount: this.#recoveryCount });
      return { recovered: false, playbook: null, reason: 'max_recoveries_exceeded' };
    }

    const domSnapshot = await page.evaluate(() => document.body.innerHTML).catch(() => '');
    const playbookName = inferPlaybookFromError(error, domSnapshot);
    if (!playbookName) {
      this.#log('self_heal_no_playbook', { error: error?.message });
      return { recovered: false, playbook: null, reason: 'no_matching_playbook' };
    }

    this.#recoveryCount += 1;
    this.#log('self_heal_attempt', {
      playbook: playbookName,
      attempt: this.#recoveryCount,
      maxRecoveries: this.#maxRecoveries,
    });

    try {
      const playbook = getPlaybook(playbookName);
      for (const step of playbook.steps) {
        await this.#executeStep(step, page);
      }
      this.#log('self_heal_success', { playbook: playbookName });
      return { recovered: true, playbook: playbookName };
    } catch (stepError) {
      this.#log('self_heal_failed', { playbook: playbookName, error: stepError?.message });
      return { recovered: false, playbook: playbookName, reason: stepError?.message };
    }
  }

  async #executeStep(step, page) {
    switch (step.action) {
      case 'click':
        await page.locator(step.selector).click({ timeout: step.timeout || 5000, force: step.force });
        break;
      case 'wait':
        if (step.selector) {
          await page.locator(step.selector).waitFor({ state: 'visible', timeout: step.timeout || 10000 });
        } else {
          await new Promise((r) => setTimeout(r, step.timeout || 3000));
        }
        break;
      case 'navigate':
        await page.goto(step.url, { timeout: step.timeout || 15000, waitUntil: 'domcontentloaded' });
        break;
      case 'verify':
        await page.locator(step.selector).waitFor({ state: 'visible', timeout: step.timeout || 5000 });
        break;
      case 'signal':
        break;
      default:
        break;
    }
  }

  reset() {
    this.#expectedHashes.clear();
    this.#recoveryCount = 0;
  }
}

export function createSelfHealOrchestrator(options = {}) {
  return new SelfHealOrchestrator(options);
}
