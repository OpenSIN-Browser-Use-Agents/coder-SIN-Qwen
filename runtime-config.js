import fs from 'node:fs';
import path from 'node:path';

export const APP_NAME = 'coder-SIN-Qwen';
export const PACKAGE_NAME = 'coder-sin-qwen';
export const LEGACY_APP_NAME = 'omo-SIN-Qwen';
export const LEGACY_PACKAGE_NAME = 'omo-sin-qwen';

export function getScopedEnv(suffix, fallback = '') {
  return process.env[`SIN_CODER_QWEN_${suffix}`] ?? process.env[`SIN_OMO_QWEN_${suffix}`] ?? fallback;
}

export function resolveScopedFile({ suffix, preferredDefault, legacyDefault = '' }) {
  const explicit = getScopedEnv(suffix, '');
  if (explicit) return explicit;

  const preferredPath = path.join(process.cwd(), preferredDefault);
  const legacyPath = legacyDefault ? path.join(process.cwd(), legacyDefault) : '';
  if (fs.existsSync(preferredPath)) return preferredPath;
  if (legacyPath && fs.existsSync(legacyPath)) return legacyPath;
  return preferredPath;
}
