import fs from 'node:fs/promises';
import path from 'node:path';
import { loadIgnorePatterns, filterPaths } from './ignore-filter.js';

const urlReachabilityCache = new Map();

export async function buildContext({ prompt, projectRoot = process.cwd() }) {
  // Gather only the metadata Qwen needs so prompts stay smaller and easier to reason about.
  const normalizedPrompt = normalizeInboundPrompt(prompt);
  if (!shouldAttachRepoContext(normalizedPrompt)) {
    return buildSimpleContext(normalizedPrompt);
  }

  const cwd = projectRoot;
  const [gitRemote, pkg, files] = await Promise.all([
    readGitRemote(cwd),
    readPackageJson(cwd),
    collectProjectFiles(cwd)
  ]);

  const ig = loadIgnorePatterns(cwd);
  const visibleFiles = filterPaths(files, ig);
  const filteredFiles = visibleFiles.slice(0, 60);
  const gitMeta = await readGitMeta(cwd);
  const repoUrls = buildRepoUrls(gitRemote, gitMeta.head);
  const repoVisibility = await readRepoVisibility(cwd, repoUrls.web);
  const verifiedRepoUrls = await verifyRepoUrls(repoUrls, repoVisibility);
  const urlAccessibility = verifiedRepoUrls.web && verifiedRepoUrls.commit ? 'public' : 'local_only';
  const hasLocalOnlyImages = visibleFiles.some(isImageFile);
  const issueReferences = extractIssueReferences(prompt);
  const capabilityManifest = buildCapabilityManifest(prompt);
  const fileReferences = urlAccessibility === 'public'
    ? await sanitizeFileReferenceUrls(buildFileReferences(filteredFiles, prompt, repoVisibility === 'public' ? repoUrls.blobBase : ''))
    : buildFileReferences(filteredFiles, prompt, repoVisibility === 'public' ? repoUrls.blobBase : '').map((entry) => ({ ...entry, url: '' }));
  const attachmentCandidates = await buildAttachmentCandidates({ cwd, files: visibleFiles, prompt, repoVisibility });
  const references = urlAccessibility === 'public'
    ? await filterReachableUrlEntries(buildBestPracticeReferences(prompt, pkg, filteredFiles, repoVisibility === 'public' ? verifiedRepoUrls.web : '', issueReferences))
    : [];
  const verifiedIssueReferences = urlAccessibility === 'public' ? await filterReachableUrlEntries(issueReferences) : [];

  return {
    prompt,
    repo: {
      cwd,
      remote: gitRemote,
      ...gitMeta,
      urls: verifiedRepoUrls,
      visibility: repoVisibility
    },
    package: pkg,
    files: filteredFiles,
    fileReferences,
    issueReferences: verifiedIssueReferences,
    attachmentCandidates,
    capabilityManifest,
    references,
    urlAccessibility,
    constraints: [
      'Use the provided repo and file URLs when code context matters.',
      'If the target repo is private or inaccessible by URL, use attached local files instead of relying on repo URLs.',
      ...(hasLocalOnlyImages ? ['Image files are local-only; do not expect Qwen to inspect them directly.'] : []),
      'Prefer official references over guessed behavior.'
    ],
    completionCriteria: [
      'Keep the recommendation aligned with the current repo state.',
      'Return production-ready output only.'
    ],
    rules: [
      'SIN-Qwen is a relay proxy, not a thinking agent.',
      'Return production-ready output only.',
      'Prefer complete files over partial snippets.'
    ]
  };
}

export function normalizeInboundPrompt(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return '';

  const stripped = text.replace(
    /^(?:>\s*)?(?:\/?)(?:ask[- ]?qwen|coder[- ]?sin[- ]?qwen|qwen)\b[\s:,-]*/iu,
    ''
  ).trim();

  return stripped || text;
}

function buildSimpleContext(prompt) {
  return {
    prompt,
    mode: 'simple',
    repo: null,
    package: null,
    files: [],
    fileReferences: [],
    issueReferences: [],
    attachmentCandidates: [],
    capabilityManifest: [],
    references: [],
    constraints: [
      'Treat the input as a user request, not a shell command.',
      'Do not echo the raw CLI invocation back to the user.'
    ],
    completionCriteria: [
      'Answer directly and keep the response useful.'
    ],
    rules: [
      'SIN-Qwen is a relay proxy, not a thinking agent.',
      'Return production-ready output only.'
    ]
  };
}

function shouldAttachRepoContext(prompt) {
  // Simple chat turns work better when Qwen receives the user's message directly instead of a repo dump.
  const text = String(prompt || '').trim();
  if (!text) return false;
  const repoKeywords = /(repo|repository|project|projekt|code|codebase|file|files|datei|dateien|bug|fix|fehler|implement|implementation|implementiere|refactor|test|build|package|dependency|dependencies|branch|commit|docs|documentation|doku|dokumentation|agent|opencode|qwen|issue|worker|platform|provider|optimiere|verbessere|behebe|debug|analyse)/iu;
  return repoKeywords.test(text);
}

async function readGitRemote(cwd) {
  // Git metadata is optional; failures should degrade to placeholders instead of crashing.
  try {
    const { execFile } = await import('node:child_process');
    return await new Promise((resolve) => {
      execFile('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8' }, (error, stdout) => {
        resolve(error ? 'N/A' : stdout.trim());
      });
    });
  } catch {
    return 'N/A';
  }
}

async function readPackageJson(cwd) {
  // Package metadata helps Qwen infer the repo stack without reading every file.
  try {
    const raw = await fs.readFile(path.join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw);
    return {
      name: pkg.name || 'N/A',
      version: pkg.version || 'N/A',
      scripts: Object.keys(pkg.scripts || {}),
      dependencies: Object.keys(pkg.dependencies || {}),
      devDependencies: Object.keys(pkg.devDependencies || {})
    };
  } catch {
    return { name: 'N/A', version: 'N/A', scripts: [], dependencies: [], devDependencies: [] };
  }
}

async function readGitMeta(cwd) {
  // Branch/head/dirty state lets Qwen reason about whether the repo is in a safe state.
  try {
    const { execFile } = await import('node:child_process');
    const run = (args) => new Promise((resolve) => {
      execFile('git', args, { cwd, encoding: 'utf8' }, (error, stdout) => resolve(error ? 'N/A' : stdout.trim()));
    });

    const [branch, head, dirty] = await Promise.all([
      run(['branch', '--show-current']),
      run(['rev-parse', 'HEAD']),
      run(['status', '--porcelain'])
    ]);

    return {
      branch,
      head,
      dirty: Boolean(dirty)
    };
  } catch {
    return { branch: 'N/A', head: 'N/A', dirty: false };
  }
}

async function readRepoVisibility(cwd, repoWebUrl) {
  if (!repoWebUrl || !repoWebUrl.includes('github.com/')) return 'private';
  const repoSlug = repoWebUrl.replace('https://github.com/', '');

  try {
    const { execFile } = await import('node:child_process');
    return await new Promise((resolve) => {
      execFile('gh', ['repo', 'view', repoSlug, '--json', 'visibility', '--jq', '.visibility'], { cwd, encoding: 'utf8' }, (error, stdout) => {
        if (error) return resolve('private');
        resolve(stdout.trim().toLowerCase() === 'public' ? 'public' : 'private');
      });
    });
  } catch {
    return 'private';
  }
}

async function collectProjectFiles(root) {
  // Recursively collect relevant project files, then filter them later with .qwenignore rules.
  const results = [];
  const stack = ['.'];

  while (stack.length > 0) {
    const current = stack.pop();
    const absolute = path.join(root, current);
    const entries = await fs.readdir(absolute, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const relative = current === '.' ? entry.name : path.posix.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(relative);
        continue;
      }

      if (/\.(?:py|js|mjs|cjs|ts|tsx|json|md|pdf|sh|yml|yaml|txt|log|png|jpg|jpeg|webp)$/u.test(entry.name)) {
        results.push(relative);
      }
    }
  }

  return results.sort();
}

function buildRepoUrls(remote, head) {
  const web = normalizeGitRemoteToWebUrl(remote);
  return {
    web,
    tree: web && head !== 'N/A' ? `${web}/tree/${head}` : '',
    commit: web && head !== 'N/A' ? `${web}/commit/${head}` : '',
    blobBase: web && head !== 'N/A' ? `${web}/blob/${head}` : ''
  };
}

function normalizeGitRemoteToWebUrl(remote) {
  const value = String(remote || '').trim();
  if (!value || value === 'N/A') return '';
  if (value.startsWith('git@github.com:')) {
    return `https://github.com/${value.replace('git@github.com:', '').replace(/\.git$/u, '')}`;
  }
  if (value.startsWith('https://github.com/')) {
    return value.replace(/\.git$/u, '');
  }
  return '';
}

function buildFileReferences(files, prompt, blobBase, limit = 12) {
  const ranked = rankRelevantFiles(files.filter((file) => !isImageFile(file)), prompt).slice(0, limit);
  return ranked.map((file) => ({
    path: file,
    url: blobBase ? `${blobBase}/${file}` : ''
  }));
}

export async function verifyUrlReachable(url, timeoutMs = 2000) {
  const normalizedUrl = String(url || '').trim();
  if (!/^https?:\/\//iu.test(normalizedUrl)) return false;

  if (urlReachabilityCache.has(normalizedUrl)) {
    return await urlReachabilityCache.get(normalizedUrl);
  }

  const probePromise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    if (typeof timeout.unref === 'function') timeout.unref();

    try {
      const headResponse = await fetch(normalizedUrl, { method: 'HEAD', redirect: 'follow', signal: controller.signal }).catch(() => null);
      if (isVerifiedPublicResponse(headResponse, normalizedUrl)) return true;

      if (headResponse?.status === 405 || headResponse?.status === 403) {
        const getResponse = await fetch(normalizedUrl, { method: 'GET', redirect: 'follow', signal: controller.signal }).catch(() => null);
        return isVerifiedPublicResponse(getResponse, normalizedUrl);
      }

      return false;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  })();

  urlReachabilityCache.set(normalizedUrl, probePromise);
  const result = await probePromise;
  urlReachabilityCache.set(normalizedUrl, Promise.resolve(result));
  return result;
}

function isVerifiedPublicResponse(response, fallbackUrl) {
  if (!response?.ok) return false;
  const finalUrl = String(response.url || fallbackUrl || '').trim();
  if (!finalUrl) return false;
  if (/(?:login|auth|signin|session)/iu.test(finalUrl)) return false;
  return true;
}

export async function sanitizeFileReferenceUrls(entries, timeoutMs = 2000) {
  return await Promise.all((Array.isArray(entries) ? entries : []).map(async (entry) => {
    if (!entry?.url) return entry;
    const reachable = await verifyUrlReachable(entry.url, timeoutMs);
    return reachable ? entry : { ...entry, url: '' };
  }));
}

export async function filterReachableUrlEntries(entries, timeoutMs = 2000) {
  const resolved = await Promise.all((Array.isArray(entries) ? entries : []).map(async (entry) => {
    if (!entry?.url) return null;
    return await verifyUrlReachable(entry.url, timeoutMs) ? entry : null;
  }));
  return resolved.filter(Boolean);
}

async function verifyRepoUrls(repoUrls, repoVisibility) {
  if (repoVisibility !== 'public') {
    return {
      ...repoUrls,
      web: '',
      tree: '',
      commit: '',
      blobBase: ''
    };
  }

  const [web, tree, commit] = await Promise.all([
    verifyUrlReachable(repoUrls.web) ? repoUrls.web : '',
    verifyUrlReachable(repoUrls.tree) ? repoUrls.tree : '',
    verifyUrlReachable(repoUrls.commit) ? repoUrls.commit : ''
  ]);

  return {
    ...repoUrls,
    web,
    tree,
    commit,
    blobBase: web ? repoUrls.blobBase : ''
  };
}

export async function buildAttachmentCandidates({ cwd, files, prompt, repoVisibility, limit = 10 }) {
   const forceEvidenceAttachments = /(screenshot|screenshots|image|images|bild|bilder|log|logs|trace|traces|upload|uploads|datei|dateien|attach|attachment|anhang|anhänge)/iu.test(String(prompt || ''));
 
   const ranked = rankAttachmentCandidates(files.filter((file) => !isImageFile(file)), prompt, forceEvidenceAttachments);
   const mustInclude = forceEvidenceAttachments
     ? ranked.filter((file) => /\.(?:log|txt|trace|pdf)$/u.test(file)).slice(0, Math.min(4, limit))
     : [];
   const rankedSet = new Set(mustInclude);
   const selected = [...mustInclude, ...ranked.filter((file) => !rankedSet.has(file))].slice(0, limit);
   const attachments = [];
 
   for (const relativePath of selected) {
     const absolutePath = path.join(cwd, relativePath);
     try {
       const stat = await fs.stat(absolutePath);
       if (!stat.isFile()) continue;
       attachments.push({
         path: relativePath,
         absolutePath,
         size: stat.size,
         reason: repoVisibility === 'public'
           ? (forceEvidenceAttachments ? 'explicit_evidence_attachment' : 'public_repo_code_attachment')
           : 'private_repo_context'
       });
     } catch {
       // Ignore unreadable files.
     }
   }
 
   return attachments;
 }

function rankAttachmentCandidates(files, prompt, forceEvidenceAttachments) {
   const tokens = tokenizePrompt(prompt);
   return [...files]
     .filter((file) => !/\.(?:png|jpg|jpeg|webp|gif|bmp|tiff)$/u.test(file))
     .sort((left, right) => attachmentScore(right, tokens, forceEvidenceAttachments) - attachmentScore(left, tokens, forceEvidenceAttachments) || left.localeCompare(right));
 }

function rankRelevantFiles(files, prompt) {
  const tokens = tokenizePrompt(prompt);
  return [...files].sort((left, right) => scoreFile(right, tokens) - scoreFile(left, tokens) || left.localeCompare(right));
}

function tokenizePrompt(prompt) {
  return [...new Set(String(prompt || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 3)
    .filter((token) => !new Set(['the', 'and', 'with', 'from', 'that', 'this', 'repo', 'code', 'file', 'files', 'your']).has(token)))];
}

function scoreFile(file, tokens) {
  const lower = file.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (lower.includes(token)) score += 3;
    if (path.posix.basename(lower).includes(token)) score += 2;
  }
  if (/readme|install|handoff|index|change(log)?|ops|security|secrets/u.test(lower)) score += 1;
  if (/browser|context|parser|verify|smoke|test|worker|issue|log|screenshot/u.test(lower)) score += 2;
  return score;
}

function attachmentScore(file, tokens, forceEvidenceAttachments) {
  let score = scoreFile(file, tokens);
  const lower = file.toLowerCase();

  if (/\.(?:js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|kt|swift|php|rb|json|sh|yml|yaml|toml|css|html|xml)$/u.test(lower)) score += 15;
  if (/\.md$/u.test(lower)) score += 4;
  if (/\.(?:log|txt|trace)$/u.test(lower)) score += forceEvidenceAttachments ? 80 : 5;
  if (/\.(?:pdf)$/u.test(lower)) score += forceEvidenceAttachments ? 75 : 10;
  if (/screenshot|screen|trace|error|fail|debug|log|issue/u.test(lower)) score += 20;
  if (/readme|docs|md$/u.test(lower)) score += 8;
  if (/worker|browser|context|config|issue/u.test(lower)) score += 10;
  return score;
}

function isImageFile(file) {
  return /\.(?:png|jpg|jpeg|webp|gif|bmp|tiff)$/u.test(String(file || '').toLowerCase());
}

function extractIssueReferences(prompt) {
  const urls = String(prompt || '').match(/https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/\d+/gu) || [];
  return [...new Set(urls)].map((url) => ({ url }));
}

function buildCapabilityManifest(prompt) {
  const joined = String(prompt || '').toLowerCase();
  const items = [
    { name: 'repo_urls', supported: true, reason: 'Public repos can be referenced by repository and file URLs.' },
    { name: 'private_file_attachments', supported: true, reason: 'Private repos can be represented by direct local file attachments.' },
    { name: 'code_file_attachments', supported: true, reason: 'Relevant source files can be uploaded locally so Qwen can inspect exact implementation details.' },
    { name: 'issue_urls', supported: true, reason: 'GitHub issue URLs can be forwarded when present in the task.' },
    { name: 'screenshots_metadata', supported: true, reason: 'Screenshot and artifact metadata can be included when available.' }
  ];
  if (joined.includes('opencode')) {
    items.push({ name: 'opencode_docs', supported: true, reason: 'OpenCode documentation links should be included when the task concerns OpenCode.' });
  }
  return items;
}

function buildBestPracticeReferences(prompt, pkg, files, repoWebUrl, issueReferences = []) {
  const joined = `${prompt} ${files.join(' ')} ${pkg.dependencies.join(' ')} ${pkg.devDependencies.join(' ')}`.toLowerCase();
  const references = [];

  if (repoWebUrl) {
    references.push({
      label: 'Repository URL',
      url: repoWebUrl,
      reason: 'Use for repo-wide browsing and linked file context.'
    });
  }

  references.push({
    label: 'Node.js API docs',
    url: 'https://nodejs.org/docs/latest/api/',
    reason: 'Authoritative Node runtime and standard-library reference.'
  });

  if (joined.includes('playwright') || joined.includes('browser') || joined.includes('cdp')) {
    references.push({
      label: 'Playwright docs',
      url: 'https://playwright.dev/docs/intro',
      reason: 'Current browser automation best practices and API behavior.'
    });
  }

  if (joined.includes('github') || joined.includes('workflow') || joined.includes('release') || joined.includes('ci') || joined.includes('issue')) {
    references.push({
      label: 'GitHub Actions docs',
      url: 'https://docs.github.com/actions',
      reason: 'Official CI/CD and workflow guidance.'
    });
  }

  if (joined.includes('opencode')) {
    references.push({
      label: 'OpenCode documentation',
      url: 'https://opencode.ai/docs',
      reason: 'Official OpenCode documentation for commands, config, and workflows.'
    });
  }

  if (joined.includes('secret') || joined.includes('infisical')) {
    references.push({
      label: 'Infisical CLI export docs',
      url: 'https://infisical.com/docs/cli/commands/export',
      reason: 'Official export and sync behavior for secret workflows.'
    });
    references.push({
      label: 'Infisical CLI secrets docs',
      url: 'https://infisical.com/docs/cli/commands/secrets',
      reason: 'Official secret set/get and path behavior.'
    });
  }

  for (const issue of issueReferences) {
    references.push({
      label: 'Issue URL',
      url: issue.url,
      reason: 'Relevant GitHub issue explicitly referenced in the task.'
    });
  }

  return references;
}
