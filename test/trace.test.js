import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installTraceContext, readTraceContext } from '../packages/qwen-core/trace.js';
import { writeLogEntry } from '../packages/qwen-core/logger.js';

const TRACE_ENV_KEYS = [
  'SIN_CODER_QWEN_RUN_ID',
  'SIN_CODER_QWEN_TRACE_ID',
  'SIN_CODER_QWEN_SPAN_ID',
  'SIN_CODER_QWEN_PARENT_SPAN_ID',
  'SIN_CODER_QWEN_SESSION_ID'
];

function snapshotTraceEnv() {
  return Object.fromEntries(TRACE_ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreTraceEnv(snapshot) {
  for (const key of TRACE_ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('installs and reads a shared trace context', () => {
  const snapshot = snapshotTraceEnv();

  try {
    const trace = installTraceContext(process.env, { runId: 'run-1', traceId: 'trace-1', spanId: 'span-1' });
    assert.equal(trace.runId, 'run-1');
    assert.equal(trace.sessionId, 'run-1');
    assert.equal(readTraceContext().traceId, 'trace-1');
    assert.equal(readTraceContext().sessionId, 'run-1');
  } finally {
    restoreTraceEnv(snapshot);
  }
});

test('writes structured logs with trace correlation fields', async () => {
  const snapshot = snapshotTraceEnv();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-trace-'));
  const logFile = path.join(tempDir, 'run.jsonl');

  try {
    installTraceContext(process.env, { runId: 'run-2', traceId: 'trace-2', spanId: 'span-2' });

    await writeLogEntry({ event: 'start', message: 'hello' }, logFile);

    const line = (await fs.readFile(logFile, 'utf8')).trim();
    const entry = JSON.parse(line);
    assert.equal(entry.run_id, 'run-2');
    assert.equal(entry.trace_id, 'trace-2');
    assert.equal(entry.span_id, 'span-2');
    assert.equal(entry.session_id, 'run-2');
    assert.equal(entry.event, 'start');
  } finally {
    restoreTraceEnv(snapshot);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
