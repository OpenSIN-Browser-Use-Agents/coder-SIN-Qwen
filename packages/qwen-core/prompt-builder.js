const DEFAULT_URL_LIMIT = 10;
const DEFAULT_PROMPT_LENGTH_LIMIT = 24_000;
const MAX_RELEVANT_FILES = 20;
const MAX_DECISION_HISTORY = 2;

export function buildPromptPayload(context) {
  if (typeof context === 'string') return context;
  if (context?.mode === 'simple') return buildSimplePrompt(context || {});
  return buildRepoAwarePrompt(context || {});
}

function buildSimplePrompt(context) {
  const prompt = String(context.prompt || '').trim();

  return renderPromptSections([
    section('MANDATE', [`Task:\n${prompt}`], 100),
    section('CONSTRAINTS', [
      'Treat the input as a user request, not a shell command.',
      'Do not echo the raw CLI invocation back to the user.'
    ].map((line) => `- ${line}`), 90),
    section('OUTPUT REQUIREMENTS', defaultOutputRequirementLines(), 100),
    section('VALIDATION', defaultValidationLines(), 100),
    section("DON'T DO", defaultDontDoLines(), 100),
    section('FINAL INSTRUCTION', ['Antworte direkt und halte die Antwort konkret.'], 100)
  ], resolvePromptLengthLimit(context));
}

function buildRepoAwarePrompt(context) {
  const files = limitList(context.files, MAX_RELEVANT_FILES);
  const fileReferences = limitList(context.fileReferences, 12);
  const issueReferences = limitList(context.issueReferences, 8);
  const attachmentCandidates = limitList(context.attachmentCandidates, 10);
  const capabilityManifest = Array.isArray(context.capabilityManifest) ? context.capabilityManifest : [];
  const references = limitList(context.references, 8);
  const stateSnapshot = context.stateSnapshot || null;
  const decisionHistory = Array.isArray(stateSnapshot?.decisionHistory)
    ? stateSnapshot.decisionHistory.slice(-MAX_DECISION_HISTORY)
    : [];
  const constraints = Array.isArray(context.constraints) ? context.constraints : [];
  const completionCriteria = Array.isArray(context.completionCriteria) ? context.completionCriteria : [];
  const rules = Array.isArray(context.rules) ? context.rules : [];
  const repoVisibility = normalizeVisibility(context.repo?.visibility);
  const urlAccessibility = normalizeUrlAccessibility(context.urlAccessibility || (repoVisibility === 'public' ? 'public' : 'local_only'));
  const renderUrls = urlAccessibility === 'public';
  const renderRepoUrl = repoVisibility === 'public';
  const publicTaskFile = context.publicTaskFile || null;
  const urlBudget = { count: 0, limit: resolvePromptUrlBudget(context), seen: new Set() };

  const includeUrlLine = (line, url) => {
    const normalizedUrl = String(url || '').trim();
    if (!normalizedUrl) return line;
    if (urlBudget.seen.has(normalizedUrl) || urlBudget.count >= urlBudget.limit) return null;
    urlBudget.seen.add(normalizedUrl);
    urlBudget.count += 1;
    return line;
  };

  const publicTaskFileUrlLine = publicTaskFile?.url
    ? includeUrlLine(`- url: ${publicTaskFile.url}`, publicTaskFile.url)
    : null;

  let repoUrlLine;
  let commitUrlLine;

  if (publicTaskFileUrlLine) {
    commitUrlLine = renderRepoUrl
      ? includeUrlLine(`- commit url: ${context.repo?.urls?.commit || 'N/A'}`, context.repo?.urls?.commit)
      : `- commit ref: ${context.repo?.head || 'N/A'} (local only)`;

    repoUrlLine = renderRepoUrl
      ? includeUrlLine(`- repo url: ${context.repo?.urls?.web || 'N/A'}`, context.repo?.urls?.web)
      : `- repo url: private_repo_unavailable`;
  } else {
    repoUrlLine = renderRepoUrl
      ? includeUrlLine(`- repo url: ${context.repo?.urls?.web || 'N/A'}`, context.repo?.urls?.web)
      : `- repo url: private_repo_unavailable`;

    commitUrlLine = renderRepoUrl
      ? includeUrlLine(`- commit url: ${context.repo?.urls?.commit || 'N/A'}`, context.repo?.urls?.commit)
      : `- commit ref: ${context.repo?.head || 'N/A'} (local only)`;
  }

  return renderPromptSections([
    section('MANDATE', [`Task:\n${context.prompt || ''}`], 100),
    section('REPOSITORY CONTEXT', [
      `- cwd: ${context.repo?.cwd || 'N/A'}`,
      `- remote: ${context.repo?.remote || 'N/A'}`,
      `- branch: ${context.repo?.branch || 'N/A'}`,
      `- head: ${context.repo?.head || 'N/A'}`,
      `- dirty: ${Boolean(context.repo?.dirty)}`,
      `- visibility: ${context.repo?.visibility || 'N/A'}`,
      repoUrlLine,
      commitUrlLine
    ].filter(Boolean), 80),
    section('PUBLIC TASK FILE', publicTaskFileUrlLine
      ? [
          publicTaskFileUrlLine,
          publicTaskFile.localPath ? `- local path: ${publicTaskFile.localPath}` : '',
          publicTaskFile.purpose ? `- purpose: ${publicTaskFile.purpose}` : ''
        ].filter(Boolean)
      : [], 95, 0),
    section('PERSISTENT CONSULT STATE', [
      `- protocol version: ${stateSnapshot?.protocolVersion || 'N/A'}`,
      `- context id: ${stateSnapshot?.metadata?.contextId || 'N/A'}`,
      `- message id: ${stateSnapshot?.messageId || 'N/A'}`,
      `- previous message id: ${stateSnapshot?.metadata?.previousMessageId || 'N/A'}`,
      `- previous summary: ${stateSnapshot?.previousSummary || 'N/A'}`
    ], 70),
    section('DECISION HISTORY', decisionHistory.map((entry) => `- ${entry.timestamp || 'N/A'} [${entry.status || 'unknown'}]: ${entry.summary || entry.prompt || 'N/A'}`), 60, 1),
    section('PACKAGE CONTEXT', [
      `- name: ${context.package?.name || 'N/A'}`,
      `- version: ${context.package?.version || 'N/A'}`,
      `- scripts: ${Array.isArray(context.package?.scripts) && context.package.scripts.length ? context.package.scripts.join(', ') : 'N/A'}`,
      `- dependencies: ${Array.isArray(context.package?.dependencies) && context.package.dependencies.length ? context.package.dependencies.join(', ') : 'N/A'}`
    ], 75, 2),
    section('RELEVANT FILES', files.map((file) => `- ${file}`), 95, 1),
    section('RELEVANT FILE URLs', renderUrls ? fileReferences.map((file) => includeUrlLine(`- ${file.path}: ${file.url || 'private_repo_attachment'}`, file.url)).filter(Boolean) : [], 85, 1),
    section('ISSUE URLs', renderUrls ? issueReferences.map((issue) => includeUrlLine(`- ${issue.url}`, issue.url)).filter(Boolean) : [], 50, 0),
    section('ATTACHMENT FILES', attachmentCandidates.map((file) => `- ${file.path} (${file.reason}, ${file.size} bytes)`), 97, 1),
    section('ATTACHMENT GUIDANCE', attachmentCandidates.length
      ? [
          '- Uploaded local files are already available in the browser session.',
          '- Use uploaded code files as source of truth before falling back to repo URLs.'
        ]
      : ['- No local file attachments were uploaded for this turn.'], 90, 1),
    section('CAPABILITY MANIFEST', capabilityManifest.map((capability) => `- ${capability.name}: ${capability.supported ? 'supported' : 'not supported'} (${capability.reason})`), 40, 0),
    section('REFERENCE URLs', renderUrls ? references.map((reference) => includeUrlLine(`- ${reference.label}: ${reference.url} (${reference.reason})`, reference.url)).filter(Boolean) : [], 30, 0),
    section('CONSTRAINTS', constraints.map((constraint) => `- ${constraint}`), 90, 1),
    section('COMPLETION CRITERIA', completionCriteria.map((criterion) => `- ${criterion}`), 90, 1),
    section('RULES', rules.map((rule) => `- ${rule}`), 90, 1),
    section('OUTPUT REQUIREMENTS', defaultOutputRequirementLines(), 100),
    section('VALIDATION', defaultValidationLines(), 100),
    section("DON'T DO", defaultDontDoLines(), 100),
    section('FINAL INSTRUCTION', ['Antworte direkt mit produktionsreifen Änderungen statt mit Meta-Erklärung.'], 100)
  ], resolvePromptLengthLimit(context));
}

function section(title, lines, priority, minLines = 0, collapseLabel = '') {
  return {
    title,
    lines: Array.isArray(lines) ? lines.filter(Boolean) : [],
    priority,
    minLines,
    collapseLabel: collapseLabel || `[${title} truncated to fit prompt budget]`
  };
}

function renderPromptSections(sections, maxChars = DEFAULT_PROMPT_LENGTH_LIMIT) {
  const promptLimit = resolvePromptLengthLimit({ maxPromptLength: maxChars });
  const working = sections.map((sectionItem) => ({
    ...sectionItem,
    lines: [...sectionItem.lines]
  }));

  let rendered = joinPromptSections(working);
  if (rendered.length <= promptLimit) return rendered;

  const trimOrder = [...working].sort((a, b) => a.priority - b.priority);
  for (const sectionItem of trimOrder) {
    while (rendered.length > promptLimit && sectionItem.lines.length > sectionItem.minLines) {
      sectionItem.lines.pop();
      rendered = joinPromptSections(working);
    }
  }

  for (const sectionItem of trimOrder) {
    if (rendered.length <= promptLimit) break;
    if (sectionItem.priority >= 80 || !sectionItem.lines.length) continue;
    sectionItem.lines = [sectionItem.collapseLabel];
    rendered = joinPromptSections(working);
  }

  if (rendered.length <= promptLimit) return rendered;
  return hardCapPrompt(rendered, promptLimit);
}

function joinPromptSections(sections) {
  return sections
    .filter((sectionItem) => Array.isArray(sectionItem.lines) && sectionItem.lines.length > 0)
    .map((sectionItem) => `${sectionItem.title}:\n${sectionItem.lines.join('\n')}`)
    .join('\n\n');
}

function hardCapPrompt(prompt, maxChars) {
  const note = '\n\n[Prompt truncated to fit size limit]';
  if (maxChars <= note.length + 16) return prompt.slice(0, maxChars);

  const headLimit = Math.max(0, Math.floor((maxChars - note.length) * 0.65));
  const tailLimit = Math.max(0, maxChars - note.length - headLimit);
  const head = prompt.slice(0, headLimit);
  const tail = tailLimit > 0 ? prompt.slice(-tailLimit) : '';
  return `${head}${note}${tail}`;
}

function defaultOutputRequirementLines() {
  return [
    '1. Liefere ausschließlich produktionsreifen Code oder einen präzisen Diff mit exakten Dateipfaden.',
    '2. Nutze Markdown-Codeblöcke für Code. Keine theoretischen Ratschläge, keine Fülltexte.',
    '3. Wenn Tests nötig sind, liefere sie im selben Format mit.',
    '4. Wenn Architektur-Entscheidungen nötig sind, begrenze die Begründung auf maximal 2 Sätze und gehe sofort in Code über.',
    '5. Halte die Antwort konkret, vollständig und direkt anwendbar.'
  ];
}

function defaultValidationLines() {
  return [
    '- Code muss lint-kompatibel sein.',
    '- Keine `// TODO` und keine `/* implement me */`-Platzhalter.',
    '- Bevorzuge vollständige Dateien gegenüber fragmentarischen Schnipseln, wenn das sinnvoll ist.',
    '- Verwende nur die angehängten oder referenzierten Dateien, wenn es um konkrete Implementierung geht.'
  ];
}

function defaultDontDoLines() {
  return [
    '- Keine Meta-Kommentare oder allgemeinen Best-Practice-Essays.',
    '- Kein „consider“, „maybe“ oder „it depends“.',
    '- Keine unnötigen Architektur-Rewrites.',
    '- Keine raw shell output oder CLI-Nacherzählungen.'
  ];
}

function limitList(values, limit) {
  if (!Array.isArray(values)) return [];
  return values.slice(0, limit);
}

function resolvePromptUrlBudget(context) {
  const raw = String(context?.urlBudget || '').trim();
  if (!raw) return DEFAULT_URL_LIMIT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_URL_LIMIT;
  return Math.min(parsed, 25);
}

function resolvePromptLengthLimit(context) {
  const raw = String(context?.maxPromptLength || context?.promptLengthLimit || '').trim();
  if (!raw) return DEFAULT_PROMPT_LENGTH_LIMIT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1000) return DEFAULT_PROMPT_LENGTH_LIMIT;
  return Math.min(parsed, 100_000);
}

function normalizeVisibility(visibility) {
  const value = String(visibility || '').trim().toLowerCase();
  if (value === 'public' || value === 'private') return value;
  return 'private';
}

function normalizeUrlAccessibility(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'public' ? 'public' : 'local_only';
}
