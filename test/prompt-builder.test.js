import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptPayload } from '../packages/qwen-core/prompt-builder.js';

test('builds strict code-oriented simple prompts', () => {
  const prompt = buildPromptPayload({ prompt: 'Say hello', mode: 'simple' });

  assert.match(prompt, /MANDATE:/);
  assert.match(prompt, /OUTPUT REQUIREMENTS:/);
  assert.match(prompt, /VALIDATION:/);
  assert.match(prompt, /DON'T DO:/);
  assert.match(prompt, /Do not echo the raw CLI invocation back to the user\./);
});

test('keeps repo-aware prompts bounded and concrete', () => {
  const prompt = buildPromptPayload({
    prompt: 'Review the repo and fix the bug.',
    repo: {
      cwd: '/tmp/project',
      remote: 'origin',
      branch: 'main',
      head: 'abc123',
      dirty: false,
      visibility: 'public',
      urls: {
        web: 'https://github.com/example/repo',
        commit: 'https://github.com/example/repo/commit/abc123'
      }
    },
    package: { name: 'demo', version: '1.0.0', scripts: ['test'], dependencies: ['playwright'] },
    files: ['index.js', 'browser.js'],
    publicTaskFile: {
      url: 'https://gist.githubusercontent.com/raw/task.md',
      url: 'https://gist.githubusercontent.com/raw/task.md',
      pageUrl: 'https://gist.github.com/task',
      localPath: '/tmp/task.md',
      purpose: 'temporary public task packet for Qwen'
    },
    fileReferences: [
      { path: 'index.js', url: 'https://github.com/example/repo/blob/abc123/index.js' },
      { path: 'browser.js', url: 'https://github.com/example/repo/blob/abc123/browser.js' },
      { path: 'extra.js', url: 'https://github.com/example/repo/blob/abc123/extra.js' }
    ],
    issueReferences: [{ url: 'https://github.com/example/repo/issues/12' }],
    attachmentCandidates: [{ path: 'browser.js', reason: 'public_repo_code_attachment', size: 123 }],
    capabilityManifest: [{ name: 'code_file_attachments', supported: true, reason: 'Relevant source files can be uploaded locally so Qwen can inspect exact implementation details.' }],
    references: [{ label: 'Node docs', url: 'https://nodejs.org/docs/latest/api/', reason: 'official' }],
    stateSnapshot: {
      protocolVersion: 'A2A-v2.1-lite',
      messageId: 'msg-1',
      metadata: { contextId: 'ctx-1', previousMessageId: 'msg-0', sender: 'coder-SIN-Qwen', receiver: 'Qwen' },
      previousSummary: 'Previous summary',
      decisionHistory: [
        { timestamp: '2026-04-20T00:00:00Z', status: 'draft', summary: 'too old' },
        { timestamp: '2026-04-21T00:00:00Z', status: 'final', summary: 'keep this' },
        { timestamp: '2026-04-22T00:00:00Z', status: 'final', summary: 'keep this too' }
      ],
      stateSnapshot: {
        repositoryUrl: 'https://github.com/example/repo',
        commitUrl: 'https://github.com/example/repo/commit/abc123',
        treeUrl: 'https://github.com/example/repo/tree/abc123',
        branch: 'main',
        head: 'abc123',
        dirty: false
      }
    },
    constraints: ['Use the provided URLs.'],
    completionCriteria: ['Return production-ready output only.'],
    rules: ['Return production-ready output only.'],
    urlBudget: 2
  });

  assert.match(prompt, /MANDATE:/);
  assert.match(prompt, /REPOSITORY CONTEXT:/);
  assert.match(prompt, /PUBLIC TASK FILE:/);
  assert.match(prompt, /gist\.githubusercontent\.com\/raw\/task\.md/);
  assert.match(prompt, /commit url: https:\/\/github.com\/example\/repo\/commit\/abc123/);
  assert.match(prompt, /RELEVANT FILES:/);
  assert.match(prompt, /ATTACHMENT GUIDANCE:/);
  assert.match(prompt, /DECISION HISTORY:/);
  assert.match(prompt, /keep this/);
  assert.match(prompt, /keep this too/);
  assert.doesNotMatch(prompt, /too old/);
  assert.match(prompt, /OUTPUT REQUIREMENTS:/);
  assert.match(prompt, /VALIDATION:/);
  assert.match(prompt, /DON'T DO:/);

  const urls = [...new Set(prompt.match(/https?:\/\/[^\s)]+/gu) || [])];
  assert.ok(urls.length <= 2);
});

test('omits commit URLs for private repos and falls back to local metadata', () => {
  const prompt = buildPromptPayload({
    prompt: 'Review the private repo.',
    repo: {
      cwd: '/tmp/project',
      remote: 'origin',
      branch: 'main',
      head: 'abc123',
      dirty: false,
      visibility: 'private',
      urls: {
        web: 'https://github.com/example/private',
        commit: 'https://github.com/example/private/commit/abc123'
      }
    },
    files: ['index.js'],
    fileReferences: [{ path: 'index.js', url: '' }],
    issueReferences: [],
    attachmentCandidates: [],
    capabilityManifest: [],
    references: [],
    constraints: [],
    completionCriteria: [],
    rules: []
  });

  assert.match(prompt, /repo url: private_repo_unavailable/);
  assert.match(prompt, /commit ref: abc123 \(local only\)/);
  assert.doesNotMatch(prompt, /commit url:/);
});

test('respects prompt length limits by dropping low-priority context first', () => {
  const prompt = buildPromptPayload({
    prompt: 'Review the repo and fix the bug.',
    repo: {
      cwd: '/tmp/project',
      remote: 'origin',
      branch: 'main',
      head: 'abc123',
      dirty: false,
      visibility: 'public',
      urls: {
        web: 'https://github.com/example/repo',
        commit: 'https://github.com/example/repo/commit/abc123'
      }
    },
    package: { name: 'demo', version: '1.0.0', scripts: ['test'], dependencies: ['playwright'] },
    files: Array.from({ length: 30 }, (_, index) => `src/file-${index}.js`),
    fileReferences: Array.from({ length: 20 }, (_, index) => ({ path: `src/file-${index}.js`, url: `https://example.com/blob/${index}` })),
    issueReferences: Array.from({ length: 10 }, (_, index) => ({ url: `https://github.com/example/repo/issues/${index}` })),
    attachmentCandidates: Array.from({ length: 10 }, (_, index) => ({ path: `attach-${index}.md`, reason: 'public_repo_code_attachment', size: 100 + index })),
    capabilityManifest: Array.from({ length: 10 }, (_, index) => ({ name: `cap-${index}`, supported: true, reason: 'capability' })),
    references: Array.from({ length: 20 }, (_, index) => ({ label: `Ref ${index}`, url: `https://example.com/reference/${index}`, reason: 'official' })),
    constraints: Array.from({ length: 10 }, (_, index) => `Constraint ${index}`),
    completionCriteria: Array.from({ length: 10 }, (_, index) => `Criterion ${index}`),
    rules: Array.from({ length: 10 }, (_, index) => `Rule ${index}`),
    maxPromptLength: 2500
  });

  assert.ok(prompt.length <= 2500);
  assert.match(prompt, /ATTACHMENT FILES:/);
  assert.match(prompt, /OUTPUT REQUIREMENTS:/);
  assert.match(prompt, /VALIDATION:/);
});
