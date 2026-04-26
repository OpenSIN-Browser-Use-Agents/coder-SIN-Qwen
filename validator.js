import { detectIncompleteReplyIssues } from './browser-hardening.js';

const FLUFF_PATTERNS = [
  /\b(?:as an ai|language model|i'?m sorry|apologies|unfortunately|please note|keep in mind|let me know|feel free|hope this helps|in conclusion|to summarize)\b/giu,
  /^(?:here is|here's|below is|sure|certainly|of course|no problem|got it)\b/gimu,
  /\b(?:just|simply|basically|essentially|actually)\b/giu
];

const REPO_ACCESS_DENIAL_PATTERNS = [
  /\b(?:i (?:cannot|can't) access (?:the )?repo(?:sitory)?|i do not have access to (?:the )?repo(?:sitory)?|without access to the repo(?:sitory)?)/iu,
  /\b(?:i (?:cannot|can't) inspect files|i do not have access to files)/iu
];

export function validateConsultResponse({ reply, parsed, context, completion = null }) {
  const text = String(reply || '').trim();
  const violations = [];
  const cleanedText = stripFluff(text);
  const fluff = detectFluff(text);
  const repoAware = typeof context === 'object' && context !== null;
  const replyIssues = detectIncompleteReplyIssues({ text, timedOut: Boolean(completion?.softTimeout) });

  if (!text) {
    violations.push(makeViolation('completion', 'empty_reply', null, 'fail'));
  }

  if (Boolean(completion?.softTimeout)) {
    violations.push(makeViolation('completion', 'completion_timeout', completion?.note || null, 'fail'));
  }

  const structuralIssues = replyIssues.filter((issue) => issue !== 'EMPTY_REPLY' && issue !== 'COMPLETION_TIMEOUT');
  if (structuralIssues.length > 0) {
    violations.push(makeViolation('completion', 'incomplete_reply', structuralIssues.join(','), 'fail'));
  }

  if (repoAware && REPO_ACCESS_DENIAL_PATTERNS.some((pattern) => pattern.test(text))) {
    violations.push(makeViolation('constraint', 'repo_access_denial', extractExcerpt(text, REPO_ACCESS_DENIAL_PATTERNS), 'fail'));
  }

  if (fluff.matches.length > 0) {
    violations.push(makeViolation('fluff', 'fluff_detected', fluff.matches[0], 'warn'));
  }

  const explicitCriteria = Array.isArray(context?.completionCriteria) ? context.completionCriteria : [];
  if (explicitCriteria.some((criterion) => /production-ready/iu.test(criterion)) && fluff.ratio > 0.35) {
    violations.push(makeViolation('completion', 'non_production_filler', fluff.matches[0] || null, 'fail'));
  }

  const pass = !violations.some((entry) => entry.severity === 'fail');
  const score = Math.max(0, Math.min(1, 1 - (violations.filter((v) => v.severity === 'fail').length * 0.4) - (violations.filter((v) => v.severity === 'warn').length * 0.1) - Math.min(fluff.ratio, 0.2)));
  const retryAction = !pass ? 'regenerate' : fluff.ratio > 0.08 && cleanedText ? 'strip_fluff' : 'accept';

  return {
    pass,
    score: Number(score.toFixed(2)),
    violations,
    fluff_ratio: Number(fluff.ratio.toFixed(2)),
    retry_action: retryAction,
    cleaned_text: cleanedText || text,
    metadata: {
      checked_at: new Date().toISOString(),
      reply_length: text.length,
      plan: parsed?.plan || '',
      completion_status: completion?.status || '',
      completion_source: completion?.source || ''
    }
  };
}

export function stripFluff(text) {
  let cleaned = String(text || '');
  for (const pattern of FLUFF_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  return cleaned.replace(/\s+/gu, ' ').trim();
}

function detectFluff(text) {
  const matches = [];
  for (const pattern of FLUFF_PATTERNS) {
    const found = text.match(pattern);
    if (found) matches.push(...found);
  }
  const totalWords = text.trim().split(/\s+/u).filter(Boolean).length || 1;
  const fluffWords = matches.reduce((sum, match) => sum + match.trim().split(/\s+/u).length, 0);
  return {
    matches,
    ratio: Math.min(fluffWords / totalWords, 1)
  };
}

function makeViolation(type, rule, excerpt, severity) {
  return { type, rule, excerpt, severity };
}

function extractExcerpt(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0];
  }
  return null;
}
