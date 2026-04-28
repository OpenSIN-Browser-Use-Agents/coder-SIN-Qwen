import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserState, BrowserEvent, isValidTransition, nextState, BrowserStateMachine, createBrowserStateMachine } from '../packages/qwen-core/lib/browser-state-machine.js';

test('BrowserState enum has all expected values', () => {
  assert.equal(BrowserState.IDLE, 'IDLE');
  assert.equal(BrowserState.PAGE_LOADING, 'PAGE_LOADING');
  assert.equal(BrowserState.INPUT_READY, 'INPUT_READY');
  assert.equal(BrowserState.SENDING, 'SENDING');
  assert.equal(BrowserState.THINKING, 'THINKING');
  assert.equal(BrowserState.STREAMING, 'STREAMING');
  assert.equal(BrowserState.RESPONSE_READY, 'RESPONSE_READY');
  assert.equal(BrowserState.ERROR, 'ERROR');
  assert.equal(BrowserState.RECOVERING, 'RECOVERING');
});

test('BrowserEvent enum has all expected values', () => {
  assert.equal(BrowserEvent.INIT, 'INIT');
  assert.equal(BrowserEvent.PAGE_LOADED, 'PAGE_LOADED');
  assert.equal(BrowserEvent.INPUT_VISIBLE, 'INPUT_VISIBLE');
  assert.equal(BrowserEvent.SEND_CLICKED, 'SEND_CLICKED');
  assert.equal(BrowserEvent.THINKING_STARTED, 'THINKING_STARTED');
  assert.equal(BrowserEvent.STREAM_DONE, 'STREAM_DONE');
  assert.equal(BrowserEvent.RESPONSE_COMPLETE, 'RESPONSE_COMPLETE');
  assert.equal(BrowserEvent.NETWORK_ERROR, 'NETWORK_ERROR');
  assert.equal(BrowserEvent.TIMEOUT, 'TIMEOUT');
});

test('isValidTransition returns true for valid transitions', () => {
  assert.equal(isValidTransition(BrowserState.IDLE, BrowserEvent.INIT), true);
  assert.equal(isValidTransition(BrowserState.PAGE_LOADING, BrowserEvent.PAGE_LOADED), true);
  assert.equal(isValidTransition(BrowserState.INPUT_READY, BrowserEvent.SEND_CLICKED), true);
  assert.equal(isValidTransition(BrowserState.THINKING, BrowserEvent.THINKING_DONE), true);
  assert.equal(isValidTransition(BrowserState.STREAMING, BrowserEvent.STREAM_DONE), true);
  assert.equal(isValidTransition(BrowserState.ERROR, BrowserEvent.RECOVERY_SUCCESS), true);
});

test('isValidTransition returns false for invalid transitions', () => {
  assert.equal(isValidTransition(BrowserState.IDLE, BrowserEvent.SEND_CLICKED), false);
  assert.equal(isValidTransition(BrowserState.IDLE, BrowserEvent.STREAM_DONE), false);
  assert.equal(isValidTransition(BrowserState.SENDING, BrowserEvent.PAGE_LOADED), false);
  assert.equal(isValidTransition(BrowserState.RESPONSE_READY, BrowserEvent.THINKING_STARTED), false);
});

test('nextState returns correct target state', () => {
  assert.equal(nextState(BrowserState.IDLE, BrowserEvent.INIT), BrowserState.PAGE_LOADING);
  assert.equal(nextState(BrowserState.PAGE_LOADING, BrowserEvent.PAGE_LOADED), BrowserState.INPUT_READY);
  assert.equal(nextState(BrowserState.SENDING, BrowserEvent.THINKING_STARTED), BrowserState.THINKING);
  assert.equal(nextState(BrowserState.STREAMING, BrowserEvent.STREAM_DONE), BrowserState.RESPONSE_READY);
});

test('nextState throws for invalid transition', () => {
  assert.throws(() => nextState(BrowserState.IDLE, BrowserEvent.SEND_CLICKED), /Invalid transition/);
});

test('BrowserStateMachine starts in IDLE', () => {
  const sm = new BrowserStateMachine();
  assert.equal(sm.state, BrowserState.IDLE);
});

test('BrowserStateMachine transitions correctly', () => {
  const sm = new BrowserStateMachine();
  sm.emit(BrowserEvent.INIT);
  assert.equal(sm.state, BrowserState.PAGE_LOADING);
  sm.emit(BrowserEvent.PAGE_LOADED);
  assert.equal(sm.state, BrowserState.INPUT_READY);
  sm.emit(BrowserEvent.SEND_CLICKED);
  assert.equal(sm.state, BrowserState.SENDING);
});

test('BrowserStateMachine ignores invalid events', () => {
  const sm = new BrowserStateMachine();
  sm.emit(BrowserEvent.SEND_CLICKED); // invalid from IDLE
  assert.equal(sm.state, BrowserState.IDLE);
});

test('BrowserStateMachine full happy path', () => {
  const sm = new BrowserStateMachine({ log: () => {} });
  sm.emit(BrowserEvent.INIT);
  sm.emit(BrowserEvent.PAGE_LOADED);
  sm.emit(BrowserEvent.SEND_CLICKED);
  sm.emit(BrowserEvent.THINKING_STARTED);
  sm.emit(BrowserEvent.THINKING_DONE);
  sm.emit(BrowserEvent.STREAM_DONE);
  assert.equal(sm.state, BrowserState.RESPONSE_READY);
});

test('BrowserStateMachine error recovery path', () => {
  const sm = new BrowserStateMachine({ log: () => {} });
  sm.emit(BrowserEvent.INIT);
  sm.emit(BrowserEvent.NETWORK_ERROR);
  assert.equal(sm.state, BrowserState.ERROR);
  sm.emit(BrowserEvent.RECOVERY_SUCCESS);
  assert.equal(sm.state, BrowserState.RECOVERING);
  sm.emit(BrowserEvent.RECOVERY_SUCCESS);
  assert.equal(sm.state, BrowserState.IDLE);
});

test('BrowserStateMachine stores history', () => {
  const sm = new BrowserStateMachine({ log: () => {} });
  sm.emit(BrowserEvent.INIT);
  sm.emit(BrowserEvent.PAGE_LOADED);
  assert.equal(sm.history.length, 2);
  assert.equal(sm.history[0].from, BrowserState.IDLE);
  assert.equal(sm.history[0].to, BrowserState.PAGE_LOADING);
  assert.equal(sm.history[0].event, BrowserEvent.INIT);
});

test('BrowserStateMachine history has timestamps', () => {
  const sm = new BrowserStateMachine({ log: () => {} });
  sm.emit(BrowserEvent.INIT);
  assert.ok(typeof sm.history[0].timestamp === 'number');
});

test('BrowserStateMachine history caps at 100 entries', () => {
  const sm = new BrowserStateMachine({ log: () => {} });
  for (let i = 0; i < 150; i += 1) {
    sm.emit(BrowserEvent.INIT);
    sm.emit(BrowserEvent.PAGE_LOADED);
    sm.emit(BrowserEvent.RESET);
  }
  assert.ok(sm.history.length <= 100);
});

test('BrowserStateMachine.reset clears state and history', () => {
  const sm = new BrowserStateMachine({ log: () => {} });
  sm.emit(BrowserEvent.INIT);
  sm.emit(BrowserEvent.PAGE_LOADED);
  sm.reset();
  assert.equal(sm.state, BrowserState.IDLE);
  assert.equal(sm.history.length, 0);
});

test('BrowserStateMachine allowsEvents returns valid events', () => {
  const sm = new BrowserStateMachine();
  const events = sm.allowedEvents;
  assert.ok(Array.isArray(events));
  assert.equal(events.includes('INIT'), true);
});

test('BrowserStateMachine.on registers and unsubscribes', () => {
  const sm = new BrowserStateMachine({ log: () => {} });
  let called = false;
  const unsub = sm.on(BrowserEvent.PAGE_LOADED, () => { called = true; });
  sm.emit(BrowserEvent.INIT);
  sm.emit(BrowserEvent.PAGE_LOADED);
  assert.equal(called, true);
  unsub();
  called = false;
  sm.emit(BrowserEvent.RESET);
  sm.emit(BrowserEvent.INIT);
  sm.emit(BrowserEvent.PAGE_LOADED);
  assert.equal(called, false);
});

test('BrowserStateMachine.waitFor resolves when target state reached', async () => {
  const sm = new BrowserStateMachine({ log: () => {} });
  const waitPromise = sm.waitFor([BrowserState.INPUT_READY], 5000);
  sm.emit(BrowserEvent.INIT);
  sm.emit(BrowserEvent.PAGE_LOADED);
  const result = await waitPromise;
  assert.equal(result, BrowserState.INPUT_READY);
});

test('BrowserStateMachine.waitFor rejects on timeout', async () => {
  const sm = new BrowserStateMachine({ log: () => {} });
  await assert.rejects(
    sm.waitFor([BrowserState.RESPONSE_READY], 100),
    /State machine timeout/
  );
});

test('createBrowserStateMachine is a convenience factory', () => {
  const sm = createBrowserStateMachine({ log: () => {} });
  assert.ok(sm instanceof BrowserStateMachine);
});

test('BrowserStateMachine getStateTimeout returns configured timeout', () => {
  const sm = new BrowserStateMachine({
    thinkingTimeout: 99999,
    log: () => {},
  });
  sm.emit(BrowserEvent.INIT);
  sm.emit(BrowserEvent.PAGE_LOADED);
  sm.emit(BrowserEvent.SEND_CLICKED);
  sm.emit(BrowserEvent.THINKING_STARTED);
  assert.equal(sm.getStateTimeout(), 99999);
});

test('BrowserStateMachine cycles RESPONSE_READY → SENDING for multi-turn', () => {
  const sm = new BrowserStateMachine({ log: () => {} });
  sm.emit(BrowserEvent.INIT);
  sm.emit(BrowserEvent.PAGE_LOADED);
  sm.emit(BrowserEvent.SEND_CLICKED);
  sm.emit(BrowserEvent.THINKING_STARTED);
  sm.emit(BrowserEvent.THINKING_DONE);
  sm.emit(BrowserEvent.STREAM_DONE);
  assert.equal(sm.state, BrowserState.RESPONSE_READY);
  sm.emit(BrowserEvent.SEND_CLICKED);
  assert.equal(sm.state, BrowserState.SENDING);
});
