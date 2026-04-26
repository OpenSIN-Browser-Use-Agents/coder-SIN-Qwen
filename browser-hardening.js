function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const EXPLICIT_TRUNCATION_PATTERNS = [
  /(?:\.\.\.|…)\s*$/u,
  /\[(?:output truncated|cut off|interrupted)\]\s*$/iu,
  /<truncated>\s*$/iu
];

const LANGUAGE_ONLY_LINES = new Set(['bash', 'sh', 'shell', 'zsh', 'javascript', 'js', 'json', 'typescript', 'ts', 'tsx', 'yaml', 'yml', 'python', 'py', 'text']);

export function resolveHardeningFlags(env = process.env) {
  return {
    safeInput: parseBoolean(env.SIN_CODER_QWEN_SAFE_INPUT, true),
    safeInputDelayMs: parseNumber(env.SIN_CODER_QWEN_SAFE_INPUT_DELAY_MS, 28),
    maxSequentialMs: parseNumber(env.SIN_CODER_QWEN_SAFE_INPUT_MAX_SEQUENTIAL_MS, 12_000)
  };
}

export async function safeInjectInput(page, input, prompt, options = {}) {
  const text = String(prompt || '');
  if (!text) return false;

  const env = options.env || process.env;
  const flags = resolveHardeningFlags(env);
  if (!flags.safeInput) return false;

  const delay = Number.isFinite(Number(options.delay)) ? Number(options.delay) : flags.safeInputDelayMs;
  const estimatedSequentialMs = text.length * delay;
  const useSequential = typeof input?.pressSequentially === 'function' && estimatedSequentialMs <= flags.maxSequentialMs;

  if (useSequential) {
    if (typeof input.click === 'function') {
      await input.click({ force: true }).catch(() => {});
    }
    await input.pressSequentially(text, { delay });
    return true;
  }

  if (estimatedSequentialMs > flags.maxSequentialMs && typeof page?.keyboard?.insertText === 'function') {
    if (typeof input.click === 'function') {
      await input.click({ force: true }).catch(() => {});
    }
    if (typeof input.focus === 'function') {
      await input.focus().catch(() => {});
    }
    await page.keyboard.insertText(text);
    return true;
  }

  if (typeof input?.type === 'function') {
    if (typeof input.click === 'function') {
      await input.click({ force: true }).catch(() => {});
    }
    await input.type(text, { delay: Math.min(delay, 5) });
    return true;
  }

  return false;
}

export function detectIncompleteReplyIssues(result) {
  if (!result || typeof result.text !== 'string') {
    return ['INVALID_REPLY'];
  }

  const issues = [];
  if (result.timedOut) {
    issues.push('COMPLETION_TIMEOUT');
  }

  const text = normalizeRenderedReplyText(result.text).trim();
  if (!text) {
    issues.push('EMPTY_REPLY');
    return issues;
  }

  if (EXPLICIT_TRUNCATION_PATTERNS.some((pattern) => pattern.test(text))) {
    issues.push('TRUNCATED_REPLY');
  }

  if ((text.match(/```/gu) || []).length % 2 !== 0) {
    issues.push('TRUNCATED_REPLY');
  }

  if (!hasBalancedPairs(text, '{', '}') || !hasBalancedPairs(text, '(', ')') || !hasBalancedPairs(text, '[', ']')) {
    issues.push('TRUNCATED_REPLY');
  }

  if (looksLikeMalformedCodeBlockExtraction(text)) {
    issues.push('MALFORMED_REPLY');
  }

  return [...new Set(issues)];
}

export function normalizeRenderedReplyText(text) {
  const lines = String(text || '')
    .replace(/\r/gu, '')
    .split('\n');

  const trimmed = lines.map((line) => line.trimEnd());
  const compact = trimmed.filter((line) => line.trim().length > 0);
  const numericLines = compact.filter((line) => /^\d+$/u.test(line.trim()));
  const shouldStripLineNumbers = numericLines.length >= 2;

  const normalized = [];
  for (let index = 0; index < trimmed.length; index += 1) {
    const line = trimmed[index];
    const bare = line.trim();
    if (!bare) {
      normalized.push('');
      continue;
    }
    if (shouldStripLineNumbers && index === 0 && LANGUAGE_ONLY_LINES.has(bare.toLowerCase())) {
      continue;
    }
    if (shouldStripLineNumbers && /^\d+$/u.test(bare)) {
      continue;
    }
    normalized.push(line);
  }

  return normalized.join('\n').replace(/\n{3,}/gu, '\n\n').trim();
}

export function assertCompleteReply(result) {
  const issues = detectIncompleteReplyIssues(result);
  if (issues.length === 0) return true;

  const primary = issues[0];
  if (primary === 'INVALID_REPLY') {
    throw new Error('INVALID_REPLY: No text payload extracted');
  }
  if (primary === 'COMPLETION_TIMEOUT') {
    throw new Error('COMPLETION_TIMEOUT: Stable reply wait exceeded limit');
  }
  if (primary === 'EMPTY_REPLY') {
    throw new Error('EMPTY_REPLY: Extracted text is blank');
  }
  if (primary === 'MALFORMED_REPLY') {
    throw new Error('MALFORMED_REPLY: Output looks like a broken code-block extraction');
  }

  throw new Error('TRUNCATED_REPLY: Output appears incomplete or structurally broken');
}

function hasBalancedPairs(text, open, close) {
  let balance = 0;
  for (const char of String(text || '')) {
    if (char === open) balance += 1;
    if (char === close) balance -= 1;
    if (balance < 0) return false;
  }
  return balance === 0;
}

function looksLikeMalformedCodeBlockExtraction(text) {
  const lines = String(text || '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (lines.length < 3 || text.includes('```')) return false;

  const first = lines[0].toLowerCase();
  const numericPrefixLines = lines.slice(1, 5).filter((line) => /^\d+$/u.test(line));
  if (LANGUAGE_ONLY_LINES.has(first) && numericPrefixLines.length >= 1) {
    return true;
  }

  return lines.slice(0, 5).filter((line) => /^\d+$/u.test(line)).length >= 2;
}
