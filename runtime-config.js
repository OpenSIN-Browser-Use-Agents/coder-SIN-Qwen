export const APP_NAME = 'coder-SIN-Qwen';
export const PACKAGE_NAME = 'coder-sin-qwen';

export function getScopedEnv(suffix, fallback = '') {
  return process.env[`SIN_CODER_QWEN_${suffix}`] ?? fallback;
}

const BOOLEAN_TRUE = new Set(['1', 'true', 'yes', 'on']);
const BOOLEAN_FALSE = new Set(['0', 'false', 'no', 'off']);

export function parseBooleanEnv(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === '') return Boolean(fallback);
  const normalized = String(value).trim().toLowerCase();
  if (BOOLEAN_TRUE.has(normalized)) return true;
  if (BOOLEAN_FALSE.has(normalized)) return false;
  throw new Error(`Invalid boolean env value: ${value}`);
}

export function parseIntegerEnv(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, name = 'value' } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (!/^-?\d+$/u.test(raw)) throw new Error(`Invalid ${name}: ${value}`);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return parsed;
}

export function resolveRuntimeConfig(env = process.env) {
  return {
    appName: APP_NAME,
    packageName: PACKAGE_NAME,
    authMethod: String(env.QWEN_AUTH_METHOD || 'email_password').trim() || 'email_password',
    dryRun: parseBooleanEnv(env.SIN_CODER_QWEN_DRY_RUN ?? env.DRY_RUN, false),
    sessionTimeoutMs: parseIntegerEnv(env.SIN_CODER_QWEN_SESSION_TIMEOUT_MS ?? env.SESSION_TIMEOUT_MS, 180000, { min: 1000, max: 7_200_000, name: 'session timeout' }),
    rateLimitCooldownHours: parseIntegerEnv(env.QWEN_RATE_LIMIT_COOLDOWN_HOURS, 20, { min: 1, max: 168, name: 'rate-limit cooldown hours' }),
    rateLimitFailureThreshold: parseIntegerEnv(env.QWEN_RATE_LIMIT_FAILURE_THRESHOLD, 2, { min: 1, max: 10, name: 'rate-limit failure threshold' }),
    rateLimitCircuitBreakerMinutes: parseIntegerEnv(env.QWEN_RATE_LIMIT_CIRCUIT_BREAKER_MINUTES, 60, { min: 1, max: 1440, name: 'rate-limit circuit breaker minutes' }),
    chromeRemoteDebuggingPort: parseIntegerEnv(env.CHROME_REMOTE_DEBUGGING_PORT ?? env.SIN_CODER_QWEN_CHROME_REMOTE_DEBUGGING_PORT, 9444, { min: 1, max: 65535, name: 'Chrome remote debugging port' }),
    chromeAttachMode: parseBooleanEnv(env.CHROME_ATTACH_MODE, false),
    logFile: String(env.SIN_CODER_QWEN_LOG_FILE || '').trim(),
    artifactDir: String(env.SIN_CODER_QWEN_ARTIFACT_DIR || 'artifacts').trim() || 'artifacts',
    memoryFile: String(env.SIN_CODER_QWEN_MEMORY_FILE || '.coder-sin-qwen-memory.json').trim() || '.coder-sin-qwen-memory.json',
    autotrainingFile: String(env.SIN_CODER_QWEN_AUTOTRAINING_FILE || '.coder-sin-qwen-autotraining.jsonl').trim() || '.coder-sin-qwen-autotraining.jsonl'
  };
}

export function validateRuntimeConfig(config = resolveRuntimeConfig()) {
  const errors = [];

  if (config.authMethod !== 'email_password') {
    errors.push(`QWEN_AUTH_METHOD must be email_password (got ${config.authMethod || 'empty'})`);
  }
  if (!Number.isInteger(config.sessionTimeoutMs) || config.sessionTimeoutMs < 1000) {
    errors.push(`session timeout must be a positive integer (got ${config.sessionTimeoutMs})`);
  }
  if (!Number.isInteger(config.rateLimitCooldownHours) || config.rateLimitCooldownHours < 1) {
    errors.push(`rate-limit cooldown hours must be a positive integer (got ${config.rateLimitCooldownHours})`);
  }
  if (!Number.isInteger(config.rateLimitFailureThreshold) || config.rateLimitFailureThreshold < 1) {
    errors.push(`rate-limit failure threshold must be a positive integer (got ${config.rateLimitFailureThreshold})`);
  }
  if (!Number.isInteger(config.rateLimitCircuitBreakerMinutes) || config.rateLimitCircuitBreakerMinutes < 1) {
    errors.push(`rate-limit circuit breaker minutes must be a positive integer (got ${config.rateLimitCircuitBreakerMinutes})`);
  }
  if (!Number.isInteger(config.chromeRemoteDebuggingPort) || config.chromeRemoteDebuggingPort < 1 || config.chromeRemoteDebuggingPort > 65535) {
    errors.push(`Chrome remote debugging port must be within 1..65535 (got ${config.chromeRemoteDebuggingPort})`);
  }

  if (errors.length) {
    throw new Error(`Invalid runtime config: ${errors.join('; ')}`);
  }

  return config;
}
