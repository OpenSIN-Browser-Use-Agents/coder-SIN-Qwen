export const BrowserState = {
  IDLE: 'IDLE',
  PAGE_LOADING: 'PAGE_LOADING',
  INPUT_READY: 'INPUT_READY',
  SENDING: 'SENDING',
  THINKING: 'THINKING',
  STREAMING: 'STREAMING',
  RESPONSE_READY: 'RESPONSE_READY',
  ERROR: 'ERROR',
  RECOVERING: 'RECOVERING',
};

export const BrowserEvent = {
  INIT: 'INIT',
  PAGE_LOADED: 'PAGE_LOADED',
  INPUT_VISIBLE: 'INPUT_VISIBLE',
  SEND_CLICKED: 'SEND_CLICKED',
  THINKING_STARTED: 'THINKING_STARTED',
  THINKING_DONE: 'THINKING_DONE',
  STREAM_CHUNK: 'STREAM_CHUNK',
  STREAM_DONE: 'STREAM_DONE',
  RESPONSE_COMPLETE: 'RESPONSE_COMPLETE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  RECOVERY_SUCCESS: 'RECOVERY_SUCCESS',
  RECOVERY_FAILED: 'RECOVERY_FAILED',
  RESET: 'RESET',
};

const TRANSITIONS = {
  IDLE: { INIT: 'PAGE_LOADING' },
  PAGE_LOADING: { PAGE_LOADED: 'INPUT_READY', NETWORK_ERROR: 'ERROR', TIMEOUT: 'ERROR' },
  INPUT_READY: { SEND_CLICKED: 'SENDING', NETWORK_ERROR: 'ERROR' },
  SENDING: { THINKING_STARTED: 'THINKING', NETWORK_ERROR: 'ERROR', TIMEOUT: 'ERROR' },
  THINKING: { THINKING_DONE: 'STREAMING', NETWORK_ERROR: 'ERROR', TIMEOUT: 'ERROR' },
  STREAMING: { STREAM_DONE: 'RESPONSE_READY', NETWORK_ERROR: 'ERROR', TIMEOUT: 'ERROR' },
  RESPONSE_READY: { RESET: 'IDLE', SEND_CLICKED: 'SENDING' },
  ERROR: { RECOVERY_SUCCESS: 'RECOVERING', RESET: 'IDLE' },
  RECOVERING: { RECOVERY_SUCCESS: 'IDLE', RECOVERY_FAILED: 'ERROR', TIMEOUT: 'ERROR' },
};

export function isValidTransition(from, event) {
  const allowed = TRANSITIONS[from];
  return allowed && allowed[event] !== undefined;
}

export function nextState(from, event) {
  const allowed = TRANSITIONS[from];
  if (!allowed || allowed[event] === undefined) {
    throw new Error(`Invalid transition: ${from} -> ${event}`);
  }
  return allowed[event];
}

export class BrowserStateMachine {
  #state;
  #history;
  #listeners;
  #timeouts;
  #log;

  constructor(options = {}) {
    this.#state = BrowserState.IDLE;
    this.#history = [];
    this.#listeners = new Map();
    this.#timeouts = {
      [BrowserState.PAGE_LOADING]: options.pageLoadingTimeout || 30000,
      [BrowserState.SENDING]: options.sendingTimeout || 10000,
      [BrowserState.THINKING]: options.thinkingTimeout || 60000,
      [BrowserState.STREAMING]: options.streamingTimeout || 120000,
      [BrowserState.RECOVERING]: options.recoveringTimeout || 30000,
    };
    this.#log = options.log || (() => {});
  }

  get state() {
    return this.#state;
  }

  get history() {
    return [...this.#history];
  }

  get allowedEvents() {
    const t = TRANSITIONS[this.#state];
    return t ? Object.keys(t) : [];
  }

  on(event, handler) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, []);
    this.#listeners.get(event).push(handler);
    return () => {
      const handlers = this.#listeners.get(event);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
      }
    };
  }

  emit(event, payload = {}) {
    if (!isValidTransition(this.#state, event)) {
      this.#log('state_machine_invalid_event', { from: this.#state, event });
      return this.#state;
    }
    const from = this.#state;
    this.#state = nextState(from, event);
    const entry = { from, to: this.#state, event, timestamp: Date.now(), payload };
    this.#history.push(entry);
    if (this.#history.length > 100) this.#history.shift();

    this.#log('state_machine_transition', { from, to: this.#state, event });

    const handlers = this.#listeners.get(event) || [];
    for (const handler of handlers) {
      try { handler(entry); } catch (e) { this.#log('state_machine_handler_error', { error: e?.message }); }
    }

    return this.#state;
  }

  getStateTimeout() {
    return this.#timeouts[this.#state] || 30000;
  }

  reset() {
    this.#state = BrowserState.IDLE;
    this.#history = [];
  }

  waitFor(targetStates, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (targetStates.includes(this.#state)) return resolve(this.#state);
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`State machine timeout waiting for ${targetStates.join(', ')} (current: ${this.#state})`));
      }, timeoutMs || this.getStateTimeout());
      const cleanup = this.on(BrowserEvent.RESET, () => {
        clearTimeout(timeout);
        cleanup();
        reject(new Error('State machine reset while waiting'));
      });
      const handler = (entry) => {
        if (targetStates.includes(entry.to)) {
          clearTimeout(timeout);
          cleanup();
          resolve(entry.to);
        }
      };
      const unsub = this.on(BrowserEvent.PAGE_LOADED, handler);
      this.on(BrowserEvent.RESPONSE_COMPLETE, handler);
      this.on(BrowserEvent.INPUT_VISIBLE, handler);
      this.on(BrowserEvent.STREAM_DONE, handler);
      this.on(BrowserEvent.RECOVERY_SUCCESS, handler);
    });
  }
}

export function createBrowserStateMachine(options = {}) {
  return new BrowserStateMachine(options);
}
