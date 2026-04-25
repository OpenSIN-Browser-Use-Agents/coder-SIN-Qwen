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
