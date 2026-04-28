const DEFAULT_TIMEOUT_MS = 10_000;

const state = {
  attached: false,
  shuttingDown: false,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  resources: new Map(),
  exitImpl: (code) => process.exit(code)
};

export function attachLifecycleHooks(options = {}) {
  if (state.attached) return;

  state.attached = true;
  state.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  if (options.exitImpl) state.exitImpl = options.exitImpl;

  process.on('SIGINT', () => {
    runLifecycleCleanup('SIGINT').finally(() => state.exitImpl(130));
  });

  process.on('SIGTERM', () => {
    runLifecycleCleanup('SIGTERM').finally(() => state.exitImpl(143));
  });

  process.on('uncaughtException', (error) => {
    console.error('[lifecycle] uncaughtException', error);
    runLifecycleCleanup('uncaughtException').finally(() => state.exitImpl(1));
  });

  process.on('unhandledRejection', (error) => {
    console.error('[lifecycle] unhandledRejection', error);
    runLifecycleCleanup('unhandledRejection').finally(() => state.exitImpl(1));
  });
}

export function registerLifecycleResource(name, cleanup) {
  if (typeof cleanup !== 'function') {
    throw new TypeError(`Lifecycle cleanup for ${name} must be a function.`);
  }

  state.resources.set(name, cleanup);
}

export function unregisterLifecycleResource(name) {
  state.resources.delete(name);
}

export async function runLifecycleCleanup(reason = 'manual', timeoutMs = state.timeoutMs) {
  if (state.shuttingDown) return;
  state.shuttingDown = true;

  const tasks = [...state.resources.entries()].map(async ([name, cleanup]) => {
    try {
      await cleanup();
    } catch (error) {
      console.error(`[lifecycle] cleanup failed for ${name}:`, error?.message || String(error));
    }
  });

  const timeout = new Promise((resolve) => {
    const handle = setTimeout(resolve, timeoutMs);
    if (typeof handle.unref === 'function') handle.unref();
  });

  await Promise.race([Promise.allSettled(tasks), timeout]);
  state.shuttingDown = false;
  if (reason !== 'manual') state.resources.clear();
}

export function resetLifecycleForTests() {
  state.attached = false;
  state.shuttingDown = false;
  state.timeoutMs = DEFAULT_TIMEOUT_MS;
  state.resources.clear();
  state.exitImpl = (code) => process.exit(code);
}

export function getLifecycleResourceCount() {
  return state.resources.size;
}
