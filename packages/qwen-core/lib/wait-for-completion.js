const DEFAULT_STOP_SELECTOR = 'button:has-text("Stop"), button[aria-label*="Stop"], button:has-text("Generierung stoppen")';
const DEFAULT_THINKING_SELECTOR = '.thinking-block, [data-state="thinking"], .streaming-cursor, .loading-indicator';
const DEFAULT_SEND_SELECTOR = 'button:has-text("Send"), button[type="submit"], button[aria-label*="Send"]';
const DEFAULT_ASSISTANT_SELECTOR = ['.response-message-content', '.custom-qwen-markdown', '.qwen-markdown', '[data-role="assistant"] .markdown-body', '[data-message-author-role="assistant"]', '.assistant-message', '.message-content', '.chat-message--assistant'];
const LANGUAGE_ONLY_LINES = new Set(['bash', 'sh', 'shell', 'zsh', 'javascript', 'js', 'json', 'typescript', 'ts', 'tsx', 'yaml', 'yml', 'python', 'py', 'text']);

export async function waitForQwenCompletion(page, options = {}) {
  if (!page || typeof page.locator !== 'function' || typeof page.evaluate !== 'function') {
    throw new TypeError('page must provide locator() and evaluate()');
  }

  const timeout = normalizePositiveInteger(options.timeout, 180_000);
  const stabilityMs = normalizePositiveInteger(options.stabilityMs, 2_500);
  const pollMs = normalizePositiveInteger(options.pollMs, 400);
  const previousText = String(options.previousText || '').trim();
  const stopSelector = normalizeSelector(options.stopSelector, DEFAULT_STOP_SELECTOR);
  const thinkingSelector = normalizeSelector(options.thinkingSelector, DEFAULT_THINKING_SELECTOR);
  const sendSelector = normalizeSelector(options.sendSelector, DEFAULT_SEND_SELECTOR);
  const assistantSelector = normalizeSelectors(options.assistantSelector, DEFAULT_ASSISTANT_SELECTOR);
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : typeof page.waitForTimeout === 'function'
      ? (ms) => page.waitForTimeout(ms)
      : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const deadline = now() + timeout;

  await Promise.allSettled([
    page.locator(stopSelector).waitFor({ state: 'hidden', timeout }).catch(() => {}),
    page.locator(thinkingSelector).waitFor({ state: 'hidden', timeout }).catch(() => {}),
    page.locator(sendSelector).waitFor({ state: 'visible', timeout }).catch(() => {})
  ]);

  let lastText = previousText;
  let stableSince = 0;
  let sawFreshText = false;

  while (now() < deadline) {
    const currentText = await readLatestAssistantText(page, assistantSelector).catch(() => '');

    if (!currentText) {
      await sleep(pollMs);
      continue;
    }

    if (!sawFreshText && currentText === previousText) {
      await sleep(pollMs);
      continue;
    }

    if (!sawFreshText) {
      sawFreshText = true;
      lastText = currentText;
      stableSince = 0;
      await sleep(pollMs);
      continue;
    }

    if (currentText === lastText) {
      if (!stableSince) stableSince = now();
      if (now() - stableSince >= stabilityMs) {
        return currentText;
      }
    } else {
      lastText = currentText;
      stableSince = 0;
    }

    await sleep(pollMs);
  }

  const error = new Error(`Qwen-Antwort stabilisierte sich nicht innerhalb von ${timeout}ms`);
  error.code = 'ETIMEDOUT';
  error.name = 'TimeoutError';
  throw error;
}

async function readLatestAssistantText(page, selector) {
  const selectors = normalizeSelectors(selector, DEFAULT_ASSISTANT_SELECTOR);

  for (const entry of selectors) {
    const baseLocator = page.locator(entry);
    const locator = typeof baseLocator?.last === 'function' ? baseLocator.last() : baseLocator;
    if (!(await locator.count().catch(() => 0))) continue;
    const text = await locator.innerText().catch(() => '');
    const normalized = normalizeRenderedReplyText(text);
    if (normalized.trim()) return normalized;
  }

  const evaluatedText = await page.evaluate((assistantSelector) => {
    const messages = document.querySelectorAll(assistantSelector);
    if (!messages.length) return '';

    const last = messages[messages.length - 1];
    const thinking = last.querySelector('.thinking-content, .reasoning-block, details summary');
    const stripped = String(last.innerText || '').replace(thinking?.innerText || '', '').trim();
    return stripped || String(last.innerText || '').trim();
  }, selectors.join(', ')).catch(() => '');
  return normalizeRenderedReplyText(evaluatedText);
}

function normalizeSelector(value, fallback) {
  if (Array.isArray(value)) {
    const joined = value.map((entry) => String(entry || '').trim()).filter(Boolean).join(', ');
    return joined || fallback;
  }

  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function normalizeSelectors(value, fallback) {
  if (Array.isArray(value)) {
    const filtered = value.map((entry) => String(entry || '').trim()).filter(Boolean);
    return filtered.length ? filtered : [...fallback];
  }

  const normalized = normalizeSelector(value, '').trim();
  return normalized ? [normalized] : [...fallback];
}

function stripThinkingText(text) {
  return String(text || '').replace(/(?:^|\n)(?:thinking|denken)\b[\s\S]*$/iu, '').trim() || String(text || '').trim();
}

function normalizeRenderedReplyText(text) {
  const stripped = stripThinkingText(text);
  const lines = stripped
    .replace(/\r/gu, '')
    .split('\n')
    .map((line) => line.trimEnd());

  const compact = lines.filter((line) => line.trim().length > 0);
  const numericLines = compact.filter((line) => /^\d+$/u.test(line.trim()));
  const shouldStripLineNumbers = numericLines.length >= 2;

  const normalized = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
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

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}
