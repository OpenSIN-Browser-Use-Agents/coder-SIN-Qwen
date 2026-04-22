import fs from 'node:fs/promises';
import path from 'node:path';
import { loadIgnorePatterns, filterPaths } from './ignore-filter.js';

export async function buildContext({ prompt }) {
  // Gather only the metadata Qwen needs so prompts stay smaller and easier to reason about.
  if (!shouldAttachRepoContext(prompt)) {
    return prompt;
  }

  const cwd = process.cwd();
  const [gitRemote, pkg, files] = await Promise.all([
    readGitRemote(cwd),
    readPackageJson(cwd),
    collectProjectFiles(cwd)
  ]);

  const ig = loadIgnorePatterns(cwd);
  const filteredFiles = filterPaths(files, ig).slice(0, 60);
  const gitMeta = await readGitMeta(cwd);
  const repoUrls = buildRepoUrls(gitRemote, gitMeta.head);
  const fileReferences = buildFileReferences(filteredFiles, prompt, repoUrls.blobBase);
  const references = buildBestPracticeReferences(prompt, pkg, filteredFiles, repoUrls.web);

  return {
    prompt,
    repo: {
      cwd,
      remote: gitRemote,
      ...gitMeta,
      urls: repoUrls
    },
    package: pkg,
    files: filteredFiles,
    fileReferences,
    references,
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
  const repoKeywords = /(repo|repository|project|code|file|files|bug|fix|implement|implementation|refactor|test|build|package|dependency|dependencies|branch|commit|docs|documentation|agent|opencode|qwen)/iu;
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

async function collectProjectFiles(root) {
  // Recursively collect relevant project files, then filter them later with .qwenignore rules.
  const results = [];
  const stack = ['.'];

  while (stack.length > 0) {
    const current = stack.pop();
    const absolute = path.join(root, current);
    const entries = await fs.readdir(absolute, { withFileTypes: true });

    for (const entry of entries) {
      // Skip the Git metadata directory to avoid noisy and expensive traversal.
      if (entry.name === '.git') continue;
      const relative = current === '.' ? entry.name : path.posix.join(current, entry.name);
      const fullPath = path.join(root, relative);

      if (entry.isDirectory()) {
        stack.push(relative);
        continue;
      }

      if (/\.(?:js|mjs|cjs|ts|tsx|json|md|sh|yml|yaml)$/u.test(entry.name)) {
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
  if (/browser|context|parser|verify|smoke|test/u.test(lower)) score += 2;
  return score;
}

function buildBestPracticeReferences(prompt, pkg, files, repoWebUrl) {
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

  if (joined.includes('github') || joined.includes('workflow') || joined.includes('release') || joined.includes('ci')) {
    references.push({
      label: 'GitHub Actions docs',
      url: 'https://docs.github.com/actions',
      reason: 'Official CI/CD and workflow guidance.'
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

  return references;
}
