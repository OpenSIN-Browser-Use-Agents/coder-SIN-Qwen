import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { buildPromptPayload } from './prompt-builder.js';

const execFile = promisify(execFileCallback);
const DEFAULT_TASK_DIR = 'coder-sin-qwen-tasks';
const DEFAULT_MAX_EXCERPTS = 8;
const DEFAULT_MAX_EXCERPT_BYTES = 16_000;
const GIST_API_URL = 'https://api.github.com/gists';

export function shouldPublishTemporaryPublicTaskFile(context, mode = resolvePublicTaskFileMode(process.env)) {
  if (mode === 'off') return false;
  if (mode === 'always') return true;
  return String(context?.urlAccessibility || '').trim().toLowerCase() === 'local_only';
}

export async function prepareTemporaryPublicTaskFile({
  context,
  prompt,
  projectRoot = process.cwd(),
  taskId = randomUUID(),
  mode = resolvePublicTaskFileMode(process.env),
  maxExcerpts = DEFAULT_MAX_EXCERPTS,
  maxExcerptBytes = DEFAULT_MAX_EXCERPT_BYTES,
  fetchImpl = globalThis.fetch,
  tokenProvider = resolveGithubToken
} = {}) {
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext) return null;

  const taskDir = path.join(projectRoot, DEFAULT_TASK_DIR);
  await fs.mkdir(taskDir, { recursive: true });

  const slug = buildTaskSlug(normalizedContext, taskId);
  const localPath = path.join(taskDir, `${slug}.md`);
  const relayPrompt = buildPromptPayload(stripTransientTaskFields(normalizedContext));
  const markdown = await buildTemporaryPublicTaskMarkdown({
    context: normalizedContext,
    prompt: prompt || normalizedContext.prompt || '',
    taskId: slug,
    relayPrompt,
    maxExcerpts,
    maxExcerptBytes
  });

  await fs.writeFile(localPath, `${markdown}\n`, 'utf8');

  const shouldPublish = shouldPublishTemporaryPublicTaskFile(normalizedContext, mode);
  let publication = null;

  if (shouldPublish) {
    publication = await publishTaskGist({
      localPath,
      taskId: slug,
      fetchImpl,
      tokenProvider
    }).catch(() => null);
  }

  const cleanupState = {
    localPath,
    gistId: publication?.gistId || '',
    token: publication?.token || '',
    cleaned: false
  };

  const cleanup = async () => {
    if (cleanupState.cleaned) return;
    cleanupState.cleaned = true;

    await fs.rm(cleanupState.localPath, { force: true }).catch(() => {});

    if (cleanupState.gistId) {
      await deleteTaskGist({
        gistId: cleanupState.gistId,
        fetchImpl,
        token: cleanupState.token,
        tokenProvider
      }).catch(() => {});
    }
  };

  return {
    taskId: slug,
    localPath,
    url: publication?.rawUrl || '',
    pageUrl: publication?.pageUrl || '',
    gistId: publication?.gistId || '',
    published: Boolean(publication),
    mode: publication ? 'gist' : 'local',
    purpose: 'temporary public task packet for Qwen',
    cleanup
  };
}

export async function buildTemporaryPublicTaskMarkdown({
  context,
  prompt,
  taskId,
  relayPrompt,
  maxExcerpts = DEFAULT_MAX_EXCERPTS,
  maxExcerptBytes = DEFAULT_MAX_EXCERPT_BYTES
} = {}) {
  const normalizedContext = normalizeContext(context);
  const excerpts = await collectRelevantFileExcerpts(normalizedContext, maxExcerpts, maxExcerptBytes);
  const safePrompt = String(prompt || normalizedContext.prompt || '').trim();
  const basePrompt = String(relayPrompt || buildPromptPayload(stripTransientTaskFields(normalizedContext))).trim();

  const lines = [
    '# coder-SIN-Qwen temporary task packet',
    '',
    `- task id: ${taskId || 'N/A'}`,
    `- generated at: ${new Date().toISOString()}`,
    `- repo visibility: ${normalizedContext?.repo?.visibility || 'N/A'}`,
    `- url accessibility: ${normalizedContext?.urlAccessibility || 'N/A'}`,
    `- prompt length: ${safePrompt.length}`,
    '',
    '## Relay prompt',
    '```text',
    basePrompt,
    '```',
    '',
    '## Relevant file excerpts'
  ];

  for (const excerpt of excerpts) {
    lines.push(
      '',
      `### ${excerpt.path}`,
      `- size: ${excerpt.size} bytes`,
      `- truncated: ${excerpt.truncated ? 'yes' : 'no'}`,
      '```text',
      excerpt.content,
      '```'
    );
  }

  if (!excerpts.length) {
    lines.push('', '- No local file excerpts were attached.');
  }

  return lines.join('\n').trim();
}

export async function collectRelevantFileExcerpts(context, maxExcerpts = DEFAULT_MAX_EXCERPTS, maxExcerptBytes = DEFAULT_MAX_EXCERPT_BYTES) {
  const normalizedContext = normalizeContext(context);
  const candidatePaths = collectCandidatePaths(normalizedContext);
  const excerpts = [];
  const seen = new Set();

  for (const candidate of candidatePaths) {
    if (excerpts.length >= maxExcerpts) break;
    const absolutePath = candidate.absolutePath;
    if (!absolutePath || seen.has(absolutePath)) continue;
    seen.add(absolutePath);

    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) continue;

      const raw = await fs.readFile(absolutePath, 'utf8');
      const safe = redactPublicText(raw).slice(0, maxExcerptBytes);
      excerpts.push({
        path: candidate.relativePath,
        size: stat.size,
        truncated: raw.length > maxExcerptBytes,
        content: safe
      });
    } catch {
      // Ignore unreadable or binary files.
    }
  }

  return excerpts;
}

export async function publishTaskGist({
  localPath,
  taskId = randomUUID(),
  fetchImpl = globalThis.fetch,
  tokenProvider = resolveGithubToken
} = {}) {
  const token = await tokenProvider();
  if (!token) return null;

  const content = await fs.readFile(localPath, 'utf8');
  const fileName = path.basename(localPath);
  const response = await fetchImpl(GIST_API_URL, {
    method: 'POST',
    headers: gistHeaders(token),
    body: JSON.stringify({
      description: `coder-SIN-Qwen task ${taskId}`,
      public: true,
      files: {
        [fileName]: { content }
      }
    })
  });

  if (!response?.ok) {
    throw new Error(`Gist publication failed with status ${response?.status || 'N/A'}`);
  }

  const data = await response.json();
  const fileInfo = Object.values(data.files || {})[0] || {};

  return {
    gistId: data.id || '',
    pageUrl: data.html_url || '',
    rawUrl: fileInfo.raw_url || data.html_url || '',
    token
  };
}

export async function deleteTaskGist({
  gistId,
  fetchImpl = globalThis.fetch,
  token = '',
  tokenProvider = resolveGithubToken
} = {}) {
  if (!gistId) return;
  const resolvedToken = token || await tokenProvider();
  if (!resolvedToken) return;

  await fetchImpl(`${GIST_API_URL}/${gistId}`, {
    method: 'DELETE',
    headers: gistHeaders(resolvedToken)
  }).catch(() => {});
}

export async function resolveGithubToken() {
  const direct = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_API_TOKEN || '').trim();
  if (direct) return direct;

  try {
    const { stdout } = await execFile('gh', ['auth', 'token'], { encoding: 'utf8', timeout: 5000 });
    return String(stdout || '').trim();
  } catch {
    return '';
  }
}

function normalizeContext(context) {
  return context && typeof context === 'object' ? context : null;
}

function stripTransientTaskFields(context) {
  if (!context || typeof context !== 'object') return context;
  const clone = { ...context };
  delete clone.publicTaskFile;
  return clone;
}

function buildTaskSlug(context, taskId) {
  const branch = slugify(String(context?.repo?.branch || 'task'));
  const head = slugify(String(context?.repo?.head || 'local').slice(0, 8));
  const id = slugify(String(taskId || randomUUID()).slice(0, 12));
  return `${branch}-${head}-${id}`.replace(/-+/gu, '-').replace(/^-|-$/gu, '').slice(0, 80) || `task-${id}`;
}

function collectCandidatePaths(context) {
  const cwd = String(context?.repo?.cwd || process.cwd());
  const candidates = [];

  for (const file of Array.isArray(context?.attachmentCandidates) ? context.attachmentCandidates : []) {
    if (file?.absolutePath) {
      candidates.push({
        absolutePath: file.absolutePath,
        relativePath: file.path || path.relative(cwd, file.absolutePath)
      });
    }
  }

  for (const file of Array.isArray(context?.fileReferences) ? context.fileReferences : []) {
    if (file?.path) {
      const absolutePath = path.isAbsolute(file.path) ? file.path : path.join(cwd, file.path);
      candidates.push({ absolutePath, relativePath: file.path });
    }
  }

  for (const file of Array.isArray(context?.files) ? context.files : []) {
    if (typeof file === 'string' && file.trim()) {
      const absolutePath = path.join(cwd, file);
      candidates.push({ absolutePath, relativePath: file });
    }
  }

  return dedupeCandidates(candidates);
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const output = [];

  for (const candidate of candidates) {
    const key = path.resolve(candidate.absolutePath || candidate.relativePath || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }

  return output;
}

function redactPublicText(text) {
  return String(text || '')
    .replace(/(authorization:\s*bearer\s+)[^\s]+/giu, '$1[REDACTED]')
    .split('\n')
    .map((line) => {
      const lower = line.toLowerCase();
      if (/(?:api[_-]?key|secret|token|password|passwd|private_key|client_secret)/iu.test(lower)) {
        return line.replace(/([:=]\s*).*/u, '$1[REDACTED]');
      }
      return line
        .replace(/ghp_[A-Za-z0-9]+/gu, '[REDACTED]')
        .replace(/xox[baprs]-[A-Za-z0-9-]+/gu, '[REDACTED]');
    })
    .join('\n');
}

function gistHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'coder-SIN-Qwen'
  };
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '');
}

function resolvePublicTaskFileMode(env = process.env) {
  const raw = String(env.SIN_CODER_QWEN_PUBLIC_TASK_FILE || 'auto').trim().toLowerCase();
  if (raw === 'off' || raw === 'never' || raw === '0' || raw === 'false') return 'off';
  if (raw === 'always' || raw === 'gist' || raw === '1' || raw === 'true') return 'always';
  return 'auto';
}
