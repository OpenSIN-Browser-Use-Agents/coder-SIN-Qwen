const DEFAULT_MAX_PROMPT_LENGTH = 12_000;

export const CATEGORY_BUDGET = {
  instructions: { ratio: 0.25, label: 'Instructions & Constraints' },
  code: { ratio: 0.35, label: 'Code Context' },
  repo: { ratio: 0.15, label: 'Repo Info' },
  attachments: { ratio: 0.10, label: 'Attachments' },
  metadata: { ratio: 0.10, label: 'Metatada & State' },
  reserve: { ratio: 0.05, label: 'Reserve' },
};

export class TokenBudgetManager {
  #maxLength;
  #budgets;

  constructor(options = {}) {
    this.#maxLength = options.maxLength || DEFAULT_MAX_PROMPT_LENGTH;
    this.#budgets = {};
    for (const [key, cat] of Object.entries(CATEGORY_BUDGET)) {
      this.#budgets[key] = Math.floor(this.#maxLength * cat.ratio);
    }
  }

  get maxLength() { return this.#maxLength; }

  getBudget(category) {
    return this.#budgets[category] || 0;
  }

  getAllBudgets() {
    return { ...this.#budgets };
  }

  render(category, content) {
    const budget = this.#budgets[category];
    if (!budget) return '';
    if (!content) return '';
    const text = typeof content === 'string' ? content : String(content);
    if (text.length <= budget) return text;
    return text.slice(0, Math.max(0, budget - 3)) + '...';
  }

  renderAll(sections) {
    const parts = [];
    let remaining = this.#maxLength;
    const entries = Object.entries(sections).filter(([, v]) => v);
    for (let i = 0; i < entries.length; i += 1) {
      const [category, content] = entries[i];
      const cat = CATEGORY_BUDGET[category];
      const label = cat ? cat.label : category;
      const separator = i > 0 ? '\n\n' : '';
      const prefix = `${separator}[${label}]\n`;
      const budget = Math.min(this.getBudget(category), remaining - prefix.length);
      if (budget <= 0) break;
      const rendered = this.render(category, content);
      const trimmed = rendered.length > budget ? rendered.slice(0, Math.max(0, budget - 3)) + '...' : rendered;
      parts.push(`${prefix}${trimmed}`);
      remaining -= prefix.length + trimmed.length;
    }
    return parts.join('');
  }

  oversize(sections) {
    const total = Object.values(sections).reduce((sum, v) => sum + (v ? String(v).length : 0), 0);
    return total > this.#maxLength;
  }
}

export function createTokenBudgetManager(options = {}) {
  return new TokenBudgetManager(options);
}
