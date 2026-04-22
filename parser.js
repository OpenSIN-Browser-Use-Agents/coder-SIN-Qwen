export function parseQwenResponse(text) {
  // First try structured JSON, then fall back to a best-effort text parser.
  const raw = String(text || '').trim();
  const extracted = extractStructuredPayload(raw);

  if (extracted) {
    return normalizeStructuredPayload(extracted, raw);
  }

  const actions = extractActions(raw);
  const files = extractFiles(raw);
  const summary = extractSummary(raw);

  return {
    raw,
    ok: raw.length > 0,
    plan: 'freeform',
    format: 'text',
    summary,
    actions,
    files,
    warnings: actions.length === 0 && files.length === 0 ? ['No structured actions detected.'] : []
  };
}

function extractStructuredPayload(raw) {
  // Support both fenced JSON and raw JSON responses.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1]?.trim();
  const candidates = [fenced, raw].filter(Boolean);

  for (const candidate of candidates) {
    const jsonText = isolateJson(candidate);
    if (!jsonText) continue;

    try {
      return JSON.parse(jsonText);
    } catch {
      continue;
    }
  }

  return null;
}

function isolateJson(text) {
  // Trim surrounding prose away so JSON.parse gets the cleanest possible payload.
  const trimmed = String(text || '').trim();
  const start = trimmed.search(/[\[{]/u);
  if (start === -1) return null;

  const candidate = trimmed.slice(start);
  const end = findMatchingJsonEnd(candidate);
  return end === -1 ? candidate : candidate.slice(0, end + 1);
}

function findMatchingJsonEnd(text) {
  // Minimal bracket matcher so partially wrapped JSON can still be recovered safely.
  const stack = [];
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      stack.pop();
      if (stack.length === 0) return index;
    }
  }

  return -1;
}

function normalizeStructuredPayload(payload, raw) {
  // Normalize different payload shapes into one stable object for callers.
  const actions = Array.isArray(payload.actions)
    ? payload.actions.map(normalizeAction).filter(Boolean)
    : extractActions(raw);

  const files = Array.isArray(payload.files)
    ? payload.files.map(String).filter(Boolean)
    : extractFiles(raw);

  const summary = payload.summary || payload.title || extractSummary(raw);

  return {
    raw,
    ok: true,
    plan: 'structured-json',
    format: Array.isArray(payload) ? 'json-array' : 'json-object',
    summary,
    actions,
    files,
    warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
    payload
  };
}

function extractActions(raw) {
  // Freeform lists are treated as actions when no JSON contract is present.
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]\s+/u, ''))
    .map((line) => line.replace(/^\d+[.)]\s+/u, ''))
    .filter((line) => /[A-Za-z0-9]/u.test(line))
    .filter((line) => !/^```/u.test(line));
}

function extractFiles(raw) {
  // Heuristic file extraction keeps downstream tooling useful even for plain-text replies.
  const matches = new Set();
  for (const match of raw.matchAll(/(?:^|[\s`"'])((?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:js|mjs|cjs|ts|tsx|json|md|sh|yml|yaml))(?:$|[\s`"',:;!?)]|$)/giu)) {
    matches.add(match[1]);
  }
  return [...matches];
}

function extractSummary(raw) {
  // Keep summaries short because they are shown in logs and CLI output.
  const firstLine = raw.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) || '';
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine;
}

function normalizeAction(action) {
  // Convert any action-like value into a compact string.
  if (!action) return null;
  if (typeof action === 'string') return action.trim();
  if (typeof action === 'object') return JSON.stringify(action);
  return String(action).trim();
}
