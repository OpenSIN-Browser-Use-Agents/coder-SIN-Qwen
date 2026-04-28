let _stepCounter = 0;

export function nextStepId(prefix = 'step') {
  _stepCounter += 1;
  return `${prefix}_${_stepCounter}`;
}

export function resetStepCounter() {
  _stepCounter = 0;
}

export function createLogEntry(options = {}) {
  return {
    step_id: options.stepId || nextStepId(),
    trace_id: options.traceId || null,
    span_id: options.spanId || null,
    parent_span_id: options.parentSpanId || null,
    state: options.state || null,
    event: options.event || null,
    dom_hash: options.domHash || null,
    selector_chain: options.selectorChain || null,
    timing_ms: options.timing || null,
    error: options.error || null,
    recovery_attempts: options.recoveryAttempts ?? null,
    recovery_playbook: options.recoveryPlaybook || null,
    snapshot_path: options.snapshotPath || null,
    timestamp: new Date().toISOString(),
    message: options.message || '',
  };
}

export function formatLogEntry(entry) {
  const parts = [`[${entry.timestamp}]`];
  if (entry.state) parts.push(`[${entry.state}]`);
  if (entry.event) parts.push(`<${entry.event}>`);
  if (entry.step_id) parts.push(`(${entry.step_id})`);
  if (entry.message) parts.push(entry.message);
  if (entry.error) parts.push(`ERROR: ${entry.error}`);
  if (entry.timing_ms) parts.push(`(${entry.timing_ms}ms)`);
  return parts.join(' ');
}

export class StructuredLogger {
  #logFile;
  #entries;

  constructor(options = {}) {
    this.#logFile = options.logFile || null;
    this.#entries = [];
  }

  log(options = {}) {
    const entry = createLogEntry({ ...options, stepId: options.stepId || nextStepId() });
    this.#entries.push(entry);
    return entry;
  }

  get entries() {
    return [...this.#entries];
  }

  get lastEntry() {
    return this.#entries[this.#entries.length - 1] || null;
  }

  clear() {
    this.#entries = [];
    resetStepCounter();
  }

  toJSON() {
    return this.#entries.map((e) => JSON.stringify(e)).join('\n');
  }

  toText() {
    return this.#entries.map((e) => formatLogEntry(e)).join('\n');
  }
}

export function createStructuredLogger(options = {}) {
  return new StructuredLogger(options);
}
