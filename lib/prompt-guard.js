import { getScopedEnv } from '../packages/qwen-core/runtime-config.js';

export const DEFAULT_MAX_PROMPT_LENGTH = 12_000;
const TRUNCATION_SUFFIX = '\n\n[Context truncated to fit browser input limits. Core task preserved.]';

export function resolvePromptLengthGuard(env = process.env) {
  const raw = String(env?.SIN_CODER_QWEN_MAX_PROMPT_LENGTH ?? getScopedEnv('MAX_PROMPT_LENGTH', DEFAULT_MAX_PROMPT_LENGTH)).trim();
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1000) {
    return { maxPromptLength: DEFAULT_MAX_PROMPT_LENGTH, suffix: TRUNCATION_SUFFIX };
  }

  return { maxPromptLength: parsed, suffix: TRUNCATION_SUFFIX };
}

export function guardPromptLength(rawPrompt, options = {}) {
  if (typeof rawPrompt !== 'string') {
    throw new TypeError('Prompt must be a string');
  }

  const { maxPromptLength, suffix } = typeof options.maxPromptLength === 'number'
    ? { maxPromptLength: options.maxPromptLength, suffix: options.suffix || TRUNCATION_SUFFIX }
    : resolvePromptLengthGuard(options.env);

  if (rawPrompt.length <= maxPromptLength) {
    return {
      prompt: rawPrompt,
      truncated: false,
      originalLength: rawPrompt.length,
      truncatedLength: rawPrompt.length,
      threshold: maxPromptLength
    };
  }

  const budget = Math.max(0, maxPromptLength - suffix.length);
  const sliced = rawPrompt.slice(0, budget);
  const compact = sliced.replace(/\s+\S*$/u, '').trimEnd();
  const prompt = `${compact || sliced}${suffix}`;

  return {
    prompt,
    truncated: true,
    originalLength: rawPrompt.length,
    truncatedLength: prompt.length,
    threshold: maxPromptLength
  };
}
