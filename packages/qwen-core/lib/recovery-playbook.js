const PLAYBOOKS = {
  AUTH_MODAL_VISIBLE: {
    name: 'Auth Modal Visible',
    description: 'Qwen auth modal appeared, click sign-in and wait for login form',
    steps: [
      { action: 'click', selector: 'button:has-text("Anmelden")', timeout: 5000 },
      { action: 'click', selector: 'button:has-text("Sign in")', timeout: 3000 },
      { action: 'wait', selector: 'input[type="email"]', timeout: 10000 },
      { action: 'verify', selector: 'input[type="password"]' },
    ],
  },
  MODEL_SELECTOR_CHANGED: {
    name: 'Model Selector Changed',
    description: 'Qwen model dropdown changed, try to re-select Qwen3.6-Max-Preview',
    steps: [
      { action: 'click', selector: 'header span.ant-dropdown-trigger', timeout: 5000 },
      { action: 'wait', selector: '[role="listbox"]', timeout: 5000 },
      { action: 'click', selector: 'text=Qwen3.6-Max-Preview', timeout: 5000 },
      { action: 'click', selector: 'text=Max-Preview', timeout: 3000 },
      { action: 'verify', selector: 'header' },
    ],
  },
  THINKING_TOGGLE_MISSING: {
    name: 'Thinking Toggle Missing',
    description: 'Thinking/Denken toggle not found, try accessibility tree fallback',
    steps: [
      { action: 'click', selector: '.qwen-thinking-selector', timeout: 5000 },
      { action: 'click', selector: '.ant-select-selector', timeout: 3000 },
      { action: 'wait', selector: '[role="listbox"]', timeout: 5000 },
      { action: 'click', selector: '[role="option"]', timeout: 3000 },
      { action: 'verify', selector: '.qwen-select-thinking-label-text' },
    ],
  },
  SEND_BUTTON_STALE: {
    name: 'Send Button Stale/Detached',
    description: 'Send button not clickable, wait for DOM update and retry',
    steps: [
      { action: 'wait', selector: 'div.chat-prompt-send-button button', timeout: 10000 },
      { action: 'click', selector: 'div.chat-prompt-send-button button', timeout: 5000, force: true },
      { action: 'click', selector: 'button[type="submit"]', timeout: 3000 },
      { action: 'verify', selector: 'div.chat-prompt-send-button' },
    ],
  },
  SESSION_EXPIRED: {
    name: 'Session Expired',
    description: 'Qwen session expired, need full re-authentication with account rotation',
    steps: [
      { action: 'navigate', url: 'https://chat.qwen.ai', timeout: 15000 },
      { action: 'wait', timeout: 3000 },
      { action: 'click', selector: 'button:has-text("Anmelden")', timeout: 5000 },
      { action: 'click', selector: 'button:has-text("Sign in")', timeout: 3000 },
      { action: 'wait', selector: 'input[type="email"]', timeout: 10000 },
      { action: 'signal', type: 'needs_reauthentication' },
    ],
  },
  ASSISTANT_RESPONSE_MISSING: {
    name: 'Assistant Response Missing',
    description: 'No assistant response appeared after sending, wait longer or retry',
    steps: [
      { action: 'wait', timeout: 15000 },
      { action: 'wait', selector: '.markdown-prose', timeout: 30000 },
      { action: 'verify', selector: '.chat-container-statement' },
    ],
  },
};

export function getPlaybook(name) {
  const playbook = PLAYBOOKS[name];
  if (!playbook) throw new Error(`Unknown playbook: ${name}`);
  return { ...playbook, steps: playbook.steps.map((s) => ({ ...s })) };
}

export function getAllPlaybookNames() {
  return Object.keys(PLAYBOOKS);
}

export function inferPlaybookFromError(error, domSnapshot) {
  const msg = String(error?.message || error || '').toLowerCase();
  const html = String(domSnapshot || '').toLowerCase();

  if (msg.includes('auth') || msg.includes('login') || html.includes('anmelden') || html.includes('sign in')) {
    return 'AUTH_MODAL_VISIBLE';
  }
  if (msg.includes('model') || msg.includes('selector')) {
    return 'MODEL_SELECTOR_CHANGED';
  }
  if (msg.includes('thinking') || msg.includes('denken')) {
    return 'THINKING_TOGGLE_MISSING';
  }
  if (msg.includes('send') || msg.includes('stale') || msg.includes('detached')) {
    return 'SEND_BUTTON_STALE';
  }
  if (msg.includes('session') || msg.includes('expired') || msg.includes('logged out')) {
    return 'SESSION_EXPIRED';
  }
  if (msg.includes('response') || msg.includes('timeout') || msg.includes('assistant')) {
    return 'ASSISTANT_RESPONSE_MISSING';
  }
  return null;
}
