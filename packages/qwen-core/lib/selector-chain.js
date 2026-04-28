export const SelectorStrategy = {
  TESTID: 'testid',
  ROLE: 'role',
  TEXT: 'text',
  CSS: 'css',
  AX: 'ax',
  ACCESSIBILITY_TREE: 'accessibility_tree',
};

export const SELECTOR_CHAINS = {
  sendButton: [
    { strategy: SelectorStrategy.TESTID, value: 'chat-send-button' },
    { strategy: SelectorStrategy.ROLE, value: 'button', name: /send|senden/i },
    { strategy: SelectorStrategy.CSS, value: 'div.chat-prompt-send-button button' },
    { strategy: SelectorStrategy.CSS, value: '.send-button' },
    { strategy: SelectorStrategy.CSS, value: 'button[type="submit"]' },
    { strategy: SelectorStrategy.CSS, value: 'button[aria-label*="send" i]' },
    { strategy: SelectorStrategy.TEXT, value: /send|senden/i },
  ],
  thinkingToggle: [
    { strategy: SelectorStrategy.ROLE, value: 'switch', name: /denken|thinking/i },
    { strategy: SelectorStrategy.ROLE, value: 'combobox', name: /denken|thinking/i },
    { strategy: SelectorStrategy.TEXT, value: /denken|thinking/i },
    { strategy: SelectorStrategy.CSS, value: '.qwen-thinking-selector .ant-select-selector' },
    { strategy: SelectorStrategy.CSS, value: '.qwen-thinking-selector [role="combobox"]' },
    { strategy: SelectorStrategy.CSS, value: '.qwen-select-thinking-label' },
  ],
  thinkingOption: [
    { strategy: SelectorStrategy.ROLE, value: 'option', name: /denken|thinking/i },
    { strategy: SelectorStrategy.TEXT, value: /^denken$/i },
    { strategy: SelectorStrategy.TEXT, value: /^thinking$/i },
    { strategy: SelectorStrategy.CSS, value: '.ant-select-item-option[title="Denken"]' },
    { strategy: SelectorStrategy.CSS, value: '.ant-select-item-option[title="Thinking"]' },
  ],
  modelMenu: [
    { strategy: SelectorStrategy.ROLE, value: 'combobox', name: /model/i },
    { strategy: SelectorStrategy.TEXT, value: /qwen|model|modell/i },
    { strategy: SelectorStrategy.CSS, value: 'header span.ant-dropdown-trigger' },
    { strategy: SelectorStrategy.CSS, value: 'button:has-text("Model")' },
    { strategy: SelectorStrategy.CSS, value: '[data-testid="model-selector"]' },
  ],
  promptInput: [
    { strategy: SelectorStrategy.ROLE, value: 'textbox', name: /message|prompt|eingabe/i },
    { strategy: SelectorStrategy.CSS, value: 'textarea.message-input-textarea' },
    { strategy: SelectorStrategy.CSS, value: 'textarea:not(.ime-text-area):not([readonly])' },
    { strategy: SelectorStrategy.CSS, value: '[contenteditable="true"]' },
    { strategy: SelectorStrategy.CSS, value: 'textarea[aria-label*="message" i]' },
  ],
  assistantOutput: [
    { strategy: SelectorStrategy.ROLE, value: 'article' },
    { strategy: SelectorStrategy.CSS, value: '.chat-container-statement .markdown-prose' },
    { strategy: SelectorStrategy.CSS, value: '.markdown-prose' },
    { strategy: SelectorStrategy.CSS, value: '.response-message-content' },
    { strategy: SelectorStrategy.CSS, value: '[data-message-author-role="assistant"]' },
    { strategy: SelectorStrategy.CSS, value: '.chat-message .content' },
  ],
  newChat: [
    { strategy: SelectorStrategy.TESTID, value: 'new-chat' },
    { strategy: SelectorStrategy.TEXT, value: /new chat|neuer chat|neue unterhaltung/i },
    { strategy: SelectorStrategy.CSS, value: 'div.sidebar-entry-fixed-list-content' },
    { strategy: SelectorStrategy.CSS, value: 'div.sidebar-side-fold-container-open' },
  ],
  authEntry: [
    { strategy: SelectorStrategy.TEXT, value: /anmelden|sign in|log in|get started|loslegen/i },
    { strategy: SelectorStrategy.CSS, value: '.auth-button-ui.login' },
  ],
  authEmail: [
    { strategy: SelectorStrategy.CSS, value: 'input[type="email"]' },
    { strategy: SelectorStrategy.CSS, value: 'input[name="email"]' },
    { strategy: SelectorStrategy.CSS, value: 'input[autocomplete="email"]' },
    { strategy: SelectorStrategy.CSS, value: 'input[placeholder*="email" i]' },
    { strategy: SelectorStrategy.CSS, value: 'input[aria-label*="email" i]' },
  ],
  authPassword: [
    { strategy: SelectorStrategy.CSS, value: 'input[type="password"]' },
    { strategy: SelectorStrategy.CSS, value: 'input[name="password"]' },
    { strategy: SelectorStrategy.CSS, value: 'input[autocomplete="current-password"]' },
  ],
  authSubmit: [
    { strategy: SelectorStrategy.CSS, value: 'button[type="submit"]' },
    { strategy: SelectorStrategy.TEXT, value: /weiter|continue|log in|sign in|anmelden|submit/i },
    { strategy: SelectorStrategy.CSS, value: 'input[type="submit"]' },
  ],
};

export function getChain(name) {
  const chain = SELECTOR_CHAINS[name];
  if (!chain) throw new Error(`Unknown selector chain: ${name}`);
  return chain;
}

export function getAllChainNames() {
  return Object.keys(SELECTOR_CHAINS);
}

export function getChainSelectors(name) {
  const chain = getChain(name);
  const selectors = [];
  for (const step of chain) {
    if (typeof step.value === 'string') selectors.push(step.value);
    else if (step.name && typeof step.name === 'string') selectors.push(step.name);
  }
  return selectors;
}
