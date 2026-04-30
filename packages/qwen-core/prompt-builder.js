const DEFAULT_URL_LIMIT = 10;
const MAX_RELEVANT_FILES = 20;
const MAX_DECISION_HISTORY = 2;

export function buildPromptPayload(context) {
  if (typeof context === 'string') return context;
  if (context?.mode === 'simple') return buildSimplePrompt(context || {});
  return buildRepoAwarePrompt(context || {});
}

function buildSimplePrompt(context) {
  const prompt = String(context.prompt || '').trim();
  return `${prompt}

Rules:
- Direct answer. No fluff, no disclaimers.
- For each file: --- FILE: path ---\n\`\`\`\n...complete file...\n\`\`\`\n--- END FILE ---
- coder-SIN-Qwen writes blocks directly to disk.
- Use complete files, not diffs.
- Keep it actionable and production-ready.`;
}

function buildRepoAwarePrompt(context) {
  const prompt = String(context.prompt || '').trim();
  const files = limitList(context.files, MAX_RELEVANT_FILES);
  const fileReferences = limitList(context.fileReferences, 12);
  const issueReferences = limitList(context.issueReferences, 8);
  const attachmentCandidates = limitList(context.attachmentCandidates, 10);
  const references = limitList(context.references, 8);
  const decisionHistory = Array.isArray(context.stateSnapshot?.decisionHistory)
    ? context.stateSnapshot.decisionHistory.slice(-MAX_DECISION_HISTORY)
    : [];
  const repoVisibility = normalizeVisibility(context.repo?.visibility);
  const renderUrls = normalizeUrlAccessibility(context.urlAccessibility || (repoVisibility === 'public' ? 'public' : 'local_only')) === 'public';
  const renderRepoUrl = repoVisibility === 'public';
  const urlBudget = { count: 0, limit: resolvePromptUrlBudget(context), seen: new Set() };

  const url = (line, u) => {
    const nu = String(u || '').trim();
    if (!nu || !renderUrls) return null;
    if (urlBudget.seen.has(nu) || urlBudget.count >= urlBudget.limit) return null;
    urlBudget.seen.add(nu);
    urlBudget.count += 1;
    return line;
  };

  const parts = [];

  // 1. Task (always first)
  parts.push(`Task: ${prompt}`);

  // 2. Context (compact)
  const ctx = [];
  if (context.repo?.remote) ctx.push(`repo: ${context.repo.remote}`);
  if (context.repo?.branch) ctx.push(`branch: ${context.repo.branch}`);
  if (context.repo?.head) ctx.push(`head: ${context.repo.head.slice(0, 12)}`);
  if (renderRepoUrl && context.repo?.urls?.web) ctx.push(context.repo.urls.web);
  if (ctx.length) parts.push(`Context: ${ctx.join(', ')}`);

  // 3. Files
  if (files.length) parts.push(`Files:\n${files.map(f => `  - ${f}`).join('\n')}`);

  // 4. Decision history (compact)
  if (decisionHistory.length) {
    parts.push(`History:\n${decisionHistory.map(e =>
      `  [${e.status || '?'}] ${(e.summary || e.prompt || '').slice(0, 120)}`
    ).join('\n')}`);
  }

  // 5. Rules (short, one line each)
  parts.push(`Rules:
- Direct answer. No fluff, no disclaimers.
- For EACH file: --- FILE: path ---\n\`\`\`\n...complete file...\n\`\`\`\n--- END FILE ---
- coder-SIN-Qwen writes these blocks directly to disk.
- Use complete files, not diffs.
- Be critical and specific if reviewing.`);

  // 6. References
  if (renderUrls && references.length) {
    parts.push(`Refs:\n${references.map(r =>
      url(`  - ${r.label}: ${r.url}`, r.url)
    ).filter(Boolean).join('\n')}`);
  }

  let result = parts.join('\n\n');
  const maxLen = resolvePromptLengthLimit(context);
  if (result.length <= maxLen) return result;

  // Trim from bottom if needed
  const oversize = result.length - maxLen;
  if (oversize > 0) {
    const trimmed = parts.slice(0, -1).join('\n\n');
    if (trimmed.length <= maxLen) return trimmed;
  }

  return result.slice(0, Math.max(maxLen, 200)) + '\n\n[trimmed]';
}

function normalizeVisibility(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'public' || s === 'private' ? s : 'private';
}

function normalizeUrlAccessibility(v) {
  return String(v || '').trim().toLowerCase() === 'public' ? 'public' : 'local_only';
}

function resolvePromptUrlBudget(context) {
  const r = String(context?.urlBudget || '').trim();
  const p = Number(r);
  return Number.isInteger(p) && p > 0 ? Math.min(p, 25) : DEFAULT_URL_LIMIT;
}

function resolvePromptLengthLimit(context) {
  const r = String(context?.maxPromptLength || context?.promptLengthLimit || '').trim();
  const p = Number(r);
  return Number.isInteger(p) && p >= 1000 ? Math.min(p, 100000) : 24000;
}

function limitList(values, limit) {
  return Array.isArray(values) ? values.slice(0, limit) : [];
}
