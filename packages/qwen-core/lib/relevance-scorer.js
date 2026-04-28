const STOP_WORDS = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'was', 'be', 'been', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their']);

function tokenize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
}

function termFrequency(tokens) {
  const freq = {};
  for (const t of tokens) {
    if (!STOP_WORDS.has(t)) freq[t] = (freq[t] || 0) + 1;
  }
  return freq;
}

function cosineSimilarity(queryFreq, docFreq) {
  let dot = 0, qMag = 0, dMag = 0;
  const allTerms = new Set([...Object.keys(queryFreq), ...Object.keys(docFreq)]);
  for (const term of allTerms) {
    const q = queryFreq[term] || 0;
    const d = docFreq[term] || 0;
    dot += q * d;
    qMag += q * q;
    dMag += d * d;
  }
  if (qMag === 0 || dMag === 0) return 0;
  return dot / (Math.sqrt(qMag) * Math.sqrt(dMag));
}

const ALWAYS_INCLUDE = ['index.js', 'package.json', 'README.md', 'CHANGELOG.md', 'AGENTS.md'];

export class RelevanceScorer {
  scoreDocument(query, doc) {
    const queryTokens = tokenize(query);
    const docTokens = tokenize(doc.name || doc.path || '');
    const docContent = tokenize(doc.content || '');
    const nameFreq = termFrequency(docTokens);
    const contentFreq = termFrequency(docContent);
    const queryFreq = termFrequency(queryTokens);

    const nameScore = cosineSimilarity(queryFreq, nameFreq) * 3;
    const contentScore = cosineSimilarity(queryFreq, contentFreq) * 1;
    const alwaysInclude = ALWAYS_INCLUDE.some((pattern) => (doc.path || doc.name || '').includes(pattern));
    const baseScore = Math.max(nameScore, contentScore);

    return {
      score: alwaysInclude ? Math.max(0.8, baseScore) : baseScore,
      nameScore,
      contentScore,
      alwaysInclude,
    };
  }

  rank(query, documents, topN = 10) {
    const scored = documents.map((doc) => ({
      ...doc,
      relevance: this.scoreDocument(query, doc),
    }));
    scored.sort((a, b) => b.relevance.score - a.relevance.score);
    const ranked = scored.slice(0, topN);
    return {
      ranked,
      total: documents.length,
      kept: ranked.length,
      dropped: documents.length - ranked.length,
    };
  }

  filterIrrelevant(query, documents, threshold = 0.05) {
    return documents.filter((doc) => {
      const score = this.scoreDocument(query, doc);
      return score.score >= threshold || score.alwaysInclude;
    });
  }
}

export function createRelevanceScorer() {
  return new RelevanceScorer();
}
