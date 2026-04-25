import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STATE_PATH = path.join(process.cwd(), 'artifacts', 'qwen-account-state.json');
const DEFAULT_COOLDOWN_HOURS = 20;

function splitList(value) {
  return String(value || '')
    .split(/[\s,]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function inferAccountIds(env) {
  const ids = [];
  for (let index = 1; index <= 9; index += 1) {
    const id = String(index);
    if (env[`QWEN_ACCOUNT_${id}_EMAIL`] || env[`QWEN_ACCOUNT_${id}_PASSWORD`]) {
      ids.push(id);
    }
  }
  return ids;
}

export function resolveQwenAccountIds(env = process.env) {
  const explicitOrder = splitList(env.QWEN_ACCOUNT_ORDER || env.QWEN_AUTH_ACCOUNT_ORDER);
  const explicitIds = splitList(env.QWEN_ACCOUNT_IDS || env.QWEN_AUTH_ACCOUNT_IDS);
  const inferredIds = inferAccountIds(env);
  const ids = explicitOrder.length ? explicitOrder : (explicitIds.length ? explicitIds : inferredIds);
  return [...new Set(ids)];
}

export function loadQwenAccounts(env = process.env) {
  return resolveQwenAccountIds(env)
    .map((id) => ({
      id,
      email: String(env[`QWEN_ACCOUNT_${id}_EMAIL`] || '').trim(),
      password: String(env[`QWEN_ACCOUNT_${id}_PASSWORD`] || '').trim(),
      label: String(env[`QWEN_ACCOUNT_${id}_LABEL`] || `account-${id}`).trim()
    }))
    .filter((account) => account.email && account.password);
}

export function hasQwenAccounts(env = process.env) {
  return loadQwenAccounts(env).length > 0;
}

export function resolveQwenAccountStatePath(env = process.env) {
  return String(env.QWEN_ACCOUNT_STATE_FILE || DEFAULT_STATE_PATH).trim() || DEFAULT_STATE_PATH;
}

export async function loadQwenAccountState(statePath = resolveQwenAccountStatePath()) {
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeAccountState(parsed);
  } catch {
    return normalizeAccountState({});
  }
}

export async function saveQwenAccountState(state, statePath = resolveQwenAccountStatePath()) {
  const normalized = normalizeAccountState(state);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  const tempPath = `${statePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tempPath, statePath);
  return normalized;
}

export function normalizeAccountState(input = {}) {
  const cooldowns = input.cooldowns && typeof input.cooldowns === 'object' && !Array.isArray(input.cooldowns)
    ? Object.fromEntries(Object.entries(input.cooldowns).map(([key, value]) => [String(key), String(value)]))
    : {};

  return {
    preferredAccountId: String(input.preferredAccountId || '').trim(),
    lastUsedAccountId: String(input.lastUsedAccountId || '').trim(),
    cooldowns,
    updatedAt: String(input.updatedAt || '')
  };
}

export function selectNextQwenAccounts(accounts, state = normalizeAccountState(), now = new Date()) {
  const active = Array.isArray(accounts) ? accounts.filter((account) => account?.email && account?.password) : [];
  const timestamps = new Map(Object.entries(state.cooldowns || {}));
  const currentMs = now.getTime();
  const order = new Map(active.map((account, index) => [String(account.id), index]));

  return active.slice().sort((a, b) => {
    const aId = String(a.id);
    const bId = String(b.id);
    const aCooldown = timestamps.get(aId) ? Date.parse(timestamps.get(aId)) : 0;
    const bCooldown = timestamps.get(bId) ? Date.parse(timestamps.get(bId)) : 0;
    const aCooling = Number.isFinite(aCooldown) && aCooldown > currentMs;
    const bCooling = Number.isFinite(bCooldown) && bCooldown > currentMs;

    if (aId === state.preferredAccountId && bId !== state.preferredAccountId) return -1;
    if (bId === state.preferredAccountId && aId !== state.preferredAccountId) return 1;
    if (aCooling !== bCooling) return aCooling ? 1 : -1;
    return (order.get(aId) ?? 0) - (order.get(bId) ?? 0);
  });
}

export function markAccountPreferred(state = normalizeAccountState(), accountId) {
  return normalizeAccountState({
    ...state,
    preferredAccountId: String(accountId || '').trim(),
    lastUsedAccountId: String(accountId || '').trim(),
    updatedAt: new Date().toISOString()
  });
}

export function markAccountCooldown(state = normalizeAccountState(), accountId, cooldownUntil) {
  const next = normalizeAccountState(state);
  const id = String(accountId || '').trim();
  if (!id) return next;
  next.cooldowns[id] = new Date(cooldownUntil || Date.now()).toISOString();
  next.updatedAt = new Date().toISOString();
  if (next.preferredAccountId === id) next.preferredAccountId = '';
  return next;
}

export function defaultCooldownUntil(hours = DEFAULT_COOLDOWN_HOURS) {
  const value = Number(hours);
  const safeHours = Number.isFinite(value) && value > 0 ? value : DEFAULT_COOLDOWN_HOURS;
  return new Date(Date.now() + safeHours * 60 * 60 * 1000).toISOString();
}
