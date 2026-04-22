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
    const jsonTexts = isolateJsonCandidates(candidate);
    for (const jsonText of jsonTexts) {
      try {
        return JSON.parse(jsonText);
      } catch {
        continue;
      }
    }
  }

  return null;
}

function isolateJsonCandidates(text) {
  // Some Qwen pages contain the sent prompt JSON plus the final assistant JSON.
  // Prefer later payloads that look like the real assistant result instead of the echoed prompt block.
  const trimmed = String(text || '').trim();
  const matches = [];

  for (let index = 0; index < trimmed.length; index += 1) {
    if (!/[\[{]/u.test(trimmed[index])) continue;
    const candidate = trimmed.slice(index);
    const end = findMatchingJsonEnd(candidate);
    if (end === -1) continue;
    matches.push(candidate.slice(0, end + 1));
  }

  return prioritizeJsonCandidates(matches);
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

function prioritizeJsonCandidates(matches) {
  const unique = [...new Set(matches)];
  return unique.sort((left, right) => scoreJsonCandidate(right) - scoreJsonCandidate(left));
}

function scoreJsonCandidate(candidate) {
  // Real assistant payloads usually contain summary/actions/files/status, while echoed prompt context contains prompt/repo/package.
  let score = 0;
  if (/"status"\s*:/u.test(candidate)) score += 8;
  if (/"summary"\s*:/u.test(candidate)) score += 4;
  if (/"actions"\s*:/u.test(candidate)) score += 4;
  if (/"files"\s*:/u.test(candidate)) score += 2;
  if (/"prompt"\s*:/u.test(candidate)) score -= 6;
  if (/"repo"\s*:/u.test(candidate)) score -= 4;
  if (/"package"\s*:/u.test(candidate)) score -= 4;
  return score;
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
