import { randomUUID } from 'node:crypto';

const TRACE_ENV_KEYS = {
  runId: 'SIN_CODER_QWEN_RUN_ID',
  traceId: 'SIN_CODER_QWEN_TRACE_ID',
  spanId: 'SIN_CODER_QWEN_SPAN_ID',
  parentSpanId: 'SIN_CODER_QWEN_PARENT_SPAN_ID',
  sessionId: 'SIN_CODER_QWEN_SESSION_ID'
};

export function readTraceContext(env = process.env) {
  return {
    runId: String(env[TRACE_ENV_KEYS.runId] || '').trim(),
    traceId: String(env[TRACE_ENV_KEYS.traceId] || '').trim(),
    spanId: String(env[TRACE_ENV_KEYS.spanId] || '').trim(),
    parentSpanId: String(env[TRACE_ENV_KEYS.parentSpanId] || '').trim(),
    sessionId: String(env[TRACE_ENV_KEYS.sessionId] || '').trim()
  };
}

export function installTraceContext(env = process.env, seed = {}) {
  const runId = String(seed.runId || env[TRACE_ENV_KEYS.runId] || randomUUID()).trim();
  const traceId = String(seed.traceId || env[TRACE_ENV_KEYS.traceId] || runId || randomUUID()).trim();
  const spanId = String(seed.spanId || env[TRACE_ENV_KEYS.spanId] || randomUUID()).trim();
  const parentSpanId = String(seed.parentSpanId || env[TRACE_ENV_KEYS.parentSpanId] || '').trim();
  const sessionId = String(seed.sessionId || env[TRACE_ENV_KEYS.sessionId] || runId || randomUUID()).trim();

  env[TRACE_ENV_KEYS.runId] = runId;
  env[TRACE_ENV_KEYS.traceId] = traceId;
  env[TRACE_ENV_KEYS.spanId] = spanId;
  env[TRACE_ENV_KEYS.parentSpanId] = parentSpanId;
  env[TRACE_ENV_KEYS.sessionId] = sessionId;

  return readTraceContext(env);
}

export function tracePayload(extra = {}, env = process.env) {
  const trace = readTraceContext(env);
  return {
    run_id: trace.runId,
    trace_id: trace.traceId,
    span_id: trace.spanId,
    parent_span_id: trace.parentSpanId,
    session_id: trace.sessionId,
    ...extra
  };
}
