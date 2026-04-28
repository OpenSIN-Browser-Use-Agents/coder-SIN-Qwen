import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { atomicWriteJson } from '../packages/qwen-core/lib/memory-writer.js';

test('atomicWriteJson persists valid JSON and removes temp file', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omo-memory-writer-'));
  const target = path.join(tempDir, 'memory.json');
  const payload = { contextId: 'ctx-1', state: 'ok' };

  try {
    await atomicWriteJson(target, payload);
    const raw = await fs.readFile(target, 'utf8');
    assert.deepEqual(JSON.parse(raw), payload);
    await assert.rejects(fs.access(path.join(tempDir, `.tmp-memory.json-${process.pid}`)));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
