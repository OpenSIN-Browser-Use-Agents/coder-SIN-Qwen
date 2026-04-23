import fs from 'node:fs/promises';
import path from 'node:path';
import { loadIgnorePatterns, filterPaths } from './ignore-filter.js';

export async function buildContext({ prompt, projectRoot = process.cwd() }) {
  // Gather only the metadata Qwen needs so prompts stay smaller and easier to reason about.
  if (!shouldAttachRepoContext(prompt)) {
    return prompt;
  }

  const cwd = projectRoot;
  const [gitRemote, pkg, files] = await Promise.all([
    readGitRemote(cwd),
    readPackageJson(cwd),
    collectProjectFiles(cwd)
  ]);

  const ig = loadIgnorePatterns(cwd);
  const filteredFiles = filterPaths(files, ig).slice(0, 60);
  const gitMeta = await readGitMeta(cwd);
  const repoUrls = buildRepoUrls(gitRemote, gitMeta.head);
  const repoVisibility = await readRepoVisibility(cwd, repoUrls.web);
  const issueReferences = extractIssueReferences(prompt);
  const capabilityManifest = buildCapabilityManifest(prompt);
  const fileReferences = buildFileReferences(filteredFiles, prompt, repoVisibility === 'public' ? repoUrls.blobBase : '');
  const attachmentCandidates = await buildAttachmentCandidates({ cwd, files: filteredFiles, prompt, repoVisibility });
  const references = buildBestPracticeReferences(prompt, pkg, filteredFiles, repoVisibility === 'public' ? repoUrls.web : '', issueReferences);

  return {
    prompt,
    repo: {
      cwd,
      remote: gitRemote,
      ...gitMeta,
      urls: repoUrls,
      visibility: repoVisibility
    },
    package: pkg,
    files: filteredFiles,
    fileReferences,
    issueReferences,
    attachmentCandidates,
    capabilityManifest,
    references,
    constraints: [
      'Use the provided repo and file URLs when code context matters.',
      'If the target repo is private or inaccessible by URL, use attached local files instead of relying on repo URLs.',
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

function shouldAttachRepoContext(prompt) {
  // Simple chat turns work better when Qwen receives the user's message directly instead of a repo dump.
  const text = String(prompt || '').trim();
  if (!text) return false;
  const repoKeywords = /(repo|repository|project|code|file|files|bug|fix|implement|implementation|refactor|test|build|package|dependency|dependencies|branch|commit|docs|documentation|agent|opencode|qwen|issue|worker|platform|provider)/iu;
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

      if (/\.(?:py|js|mjs|cjs|ts|tsx|json|md|sh|yml|yaml|txt|log|png|jpg|jpeg|webp)$/u.test(entry.name)) {
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
  const ranked = rankRelevantFiles(files, prompt).slice(0, limit);
  return ranked.map((file) => ({
    path: file,
    url: blobBase ? `${blobBase}/${file}` : ''
  }));
}

async function buildAttachmentCandidates({ cwd, files, prompt, repoVisibility, limit = 10 }) {
  const forceEvidenceAttachments = /(screenshot|screenshots|image|images|bild|bilder|log|logs|trace|traces|upload|uploads|datei|dateien|attach|attachment|anhang|anhänge)/iu.test(String(prompt || ''));
  if (repoVisibility === 'public' && !forceEvidenceAttachments) return [];

  const ranked = rankRelevantFiles(files, prompt)
    .filter((file) => forceEvidenceAttachments || !/\.(?:png|jpg|jpeg|webp|txt|log)$/u.test(file))
    .slice(0, limit);
  const attachments = [];

  for (const relativePath of ranked) {
    const absolutePath = path.join(cwd, relativePath);
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) continue;
      attachments.push({
        path: relativePath,
        absolutePath,
        size: stat.size,
        reason: repoVisibility === 'public' ? 'explicit_evidence_attachment' : 'private_repo_context'
      });
    } catch {
      // Ignore unreadable files.
    }
  }

  return attachments;
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

function extractIssueReferences(prompt) {
  const urls = String(prompt || '').match(/https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/\d+/gu) || [];
  return [...new Set(urls)].map((url) => ({ url }));
}

function buildCapabilityManifest(prompt) {
  const joined = String(prompt || '').toLowerCase();
  const items = [
    { name: 'repo_urls', supported: true, reason: 'Public repos can be referenced by repository and file URLs.' },
    { name: 'private_file_attachments', supported: true, reason: 'Private repos can be represented by direct local file attachments.' },
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
