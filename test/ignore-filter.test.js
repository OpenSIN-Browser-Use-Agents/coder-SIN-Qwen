import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { filterPaths, loadIgnorePatterns } from '../packages/qwen-core/ignore-filter.js';

test('filters ignored files', async () => {
  // The context filter must drop obvious junk and secret-like paths.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sin-qwen-'));
  await fs.writeFile(path.join(dir, '.qwenignore'), 'dist\n.env\n');

  const ig = loadIgnorePatterns(dir);
  const files = ['src/index.js', 'dist/app.js', '.env', 'README.md'];
  const filtered = filterPaths(files, ig);

  assert.deepEqual(filtered, ['src/index.js', 'README.md']);
});
