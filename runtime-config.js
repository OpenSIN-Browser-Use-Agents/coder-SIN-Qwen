export const APP_NAME = 'coder-SIN-Qwen';
export const PACKAGE_NAME = 'coder-sin-qwen';

export function getScopedEnv(suffix, fallback = '') {
  return process.env[`SIN_CODER_QWEN_${suffix}`] ?? fallback;
}
