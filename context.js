import fs from 'node:fs/promises';
import path from 'node:path';
import { loadIgnorePatterns, filterPaths } from './ignore-filter.js';

export async function buildContext({ prompt }) {
  // Gather only the metadata Qwen needs so prompts stay smaller and easier to reason about.
  const cwd = process.cwd();
  const [gitRemote, pkg, files] = await Promise.all([
    readGitRemote(cwd),
    readPackageJson(cwd),
    collectProjectFiles(cwd)
  ]);

  const ig = loadIgnorePatterns(cwd);
  const filteredFiles = filterPaths(files, ig).slice(0, 200);
  const gitMeta = await readGitMeta(cwd);

  return {
    prompt,
    repo: {
      cwd,
      remote: gitRemote,
      ...gitMeta
    },
    package: pkg,
    files: filteredFiles,
    rules: [
      'SIN-Qwen is a relay proxy, not a thinking agent.',
      'Return production-ready output only.',
      'Prefer complete files over partial snippets.',
      'End with JSON status metadata.'
    ]
  };
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
