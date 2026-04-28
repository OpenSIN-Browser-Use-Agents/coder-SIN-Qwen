import { TokenBudgetManager } from './token-budget.js';
import { RelevanceScorer } from './relevance-scorer.js';

export class ContextCompressor {
  #budget;
  #scorer;

  constructor(options = {}) {
    this.#budget = new TokenBudgetManager(options);
    this.#scorer = new RelevanceScorer();
  }

  get budget() { return this.#budget; }
  get scorer() { return this.#scorer; }

  compress(query, sections = {}) {
    const result = { query, compressed: '', originalSize: 0, compressedSize: 0, truncated: false };

    for (const [, content] of Object.entries(sections)) {
      if (content) result.originalSize += String(content).length;
    }

    if (!this.#budget.oversize(sections)) {
      result.compressed = Object.values(sections).filter(Boolean).join('\n\n');
      result.compressedSize = result.compressed.length;
      return result;
    }

    result.compressed = this.#budget.renderAll(sections);
    result.compressedSize = result.compressed.length;
    result.truncated = true;
    return result;
  }

  compressWithRanking(query, sections = {}, documents = []) {
    const ranked = this.#scorer.rank(query, documents, 10);
    const rankedSections = {
      instructions: sections.instructions,
      code: ranked.ranked.map((d) => d.content).filter(Boolean).join('\n'),
      repo: sections.repo,
      attachments: sections.attachments,
      metadata: sections.metadata,
    };
    return {
      ...this.compress(query, rankedSections),
      rankedDocs: ranked,
    };
  }
}

export function createContextCompressor(options = {}) {
  return new ContextCompressor(options);
}
