export const TaskStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
};

export class AsyncEventLoop {
  #queue;
  #running;
  #completed;
  #maxConcurrency;
  #queueTimeout;
  #onError;

  constructor(options = {}) {
    this.#queue = [];
    this.#running = new Set();
    this.#completed = [];
    this.#maxConcurrency = options.maxConcurrency || 1;
    this.#queueTimeout = options.queueTimeout || 60000;
    this.#onError = options.onError || ((task, error) => {});
  }

  get queued() { return this.#queue.length; }
  get running() { return this.#running.size; }
  get completed() { return this.#completed.length; }
  get pending() { return this.#queue.length + this.#running.size; }

  enqueue(task) {
    const id = task.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entry = {
      id,
      status: TaskStatus.PENDING,
      enqueuedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      ...task,
    };
    this.#queue.push(entry);
    this.#drain();
    return id;
  }

  cancel(id) {
    const queueIdx = this.#queue.findIndex((t) => t.id === id);
    if (queueIdx !== -1) {
      this.#queue[queueIdx].status = TaskStatus.CANCELLED;
      this.#queue.splice(queueIdx, 1);
      return true;
    }
    if (this.#running.has(id)) {
      const task = [...this.#running].find((t) => t.id === id);
      if (task) task.status = TaskStatus.CANCELLED;
      this.#running.delete(id);
      this.#drain();
      return true;
    }
    return false;
  }

  clear() {
    for (const task of this.#queue) task.status = TaskStatus.CANCELLED;
    this.#queue = [];
    for (const task of this.#running) task.status = TaskStatus.CANCELLED;
    this.#running.clear();
  }

  async shutdown(timeoutMs = 2000) {
    this.clear();
    const wait = new Promise((resolve) => {
      const check = () => {
        if (this.#running.size === 0) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
    return Promise.race([wait, new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  getStatus(id) {
    const queueTask = this.#queue.find((t) => t.id === id);
    if (queueTask) return queueTask;
    for (const task of this.#running) {
      if (task.id === id) return task;
    }
    return this.#completed.find((t) => t.id === id) || null;
  }

  getAll() {
    return [...this.#queue, ...this.#running, ...this.#completed];
  }

  async #execute(task) {
    const timeoutMs = task.timeout || this.#queueTimeout;
    try {
      const result = await Promise.race([
        task.exec(task),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Task ${task.id} timed out after ${timeoutMs}ms`)), timeoutMs)),
      ]);
      task.status = TaskStatus.COMPLETED;
      task.result = result;
      task.completedAt = Date.now();
      this.#completed.push(task);
      if (this.#completed.length > 100) this.#completed.shift();
      if (task.onComplete) task.onComplete(result);
      return result;
    } catch (error) {
      task.status = TaskStatus.FAILED;
      task.error = error;
      task.completedAt = Date.now();
      this.#completed.push(task);
      if (this.#completed.length > 100) this.#completed.shift();
      this.#onError(task, error);
      if (task.onError) task.onError(error);
      return null;
    }
  }

  async #drain() {
    while (this.#running.size < this.#maxConcurrency && this.#queue.length > 0) {
      const task = this.#queue.shift();
      if (!task || task.status === TaskStatus.CANCELLED) continue;
      this.#running.add(task);
      task.status = TaskStatus.RUNNING;
      task.startedAt = Date.now();
      this.#execute(task).finally(() => {
        this.#running.delete(task);
        this.#drain();
      });
    }
  }
}

export function createAsyncEventLoop(options = {}) {
  return new AsyncEventLoop(options);
}

const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class ProgressIndicator {
  #interval;
  #frame;
  #message;

  constructor() {
    this.#interval = null;
    this.#frame = 0;
    this.#message = '';
  }

  get isRunning() { return this.#interval !== null; }

  start(message = 'Working') {
    if (this.#interval) return;
    this.#message = message;
    this.#frame = 0;
    process.stdout.write('\n');
    this.#interval = setInterval(() => {
      const spinner = SPINNERS[this.#frame % SPINNERS.length];
      process.stdout.write(`\r${spinner} ${this.#message} `);
      this.#frame += 1;
    }, 100);
  }

  update(message) {
    this.#message = message;
  }

  stop(finalMessage = 'Done') {
    if (!this.#interval) return;
    clearInterval(this.#interval);
    this.#interval = null;
    process.stdout.write(`\r✓ ${finalMessage}\n`);
  }

  fail(errorMessage = 'Failed') {
    if (!this.#interval) return;
    clearInterval(this.#interval);
    this.#interval = null;
    process.stdout.write(`\r✗ ${errorMessage}\n`);
  }
}

export function createProgressIndicator() {
  return new ProgressIndicator();
}
