import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const QWEN_URL = 'https://chat.qwen.ai';
// Centralized selector map so UI changes stay localized.
export const SELECTORS = {
  newChat: ['.sidebar-entry-fixed-list-content', '.sidebar-entry-fixed-list-text', 'button:has-text("New Chat")', 'button:has-text("Neuer Chat")', 'button:has-text("Neue Unterhaltung")', 'text=Neue Unterhaltung', '[data-testid="new-chat"]'],
  modelMenu: ['header span.ant-dropdown-trigger', 'header .index-module__model-selector-text___XvWe0', 'span.ant-dropdown-trigger', 'button:has-text("Model")', 'button:has-text("Modell")', '[data-testid="model-selector"]'],
  promptInput: ['textarea.message-input-textarea', 'textarea:not(.ime-text-area):not([readonly])', '[contenteditable="true"]', 'input[type="text"]', 'textarea[aria-label*="message" i]', 'input[aria-label*="prompt" i]'],
  sendButton: ['.send-button', 'button[type="submit"]', 'button[aria-label*="send" i]', 'button:has-text("Send")', 'button:has-text("Senden")'],
  assistantOutput: ['.response-message-content', '.custom-qwen-markdown', '.qwen-markdown', '[data-role="assistant"] .markdown-body', '[data-message-author-role="assistant"]', '.message-content', '.chat-message .content']
};

export async function runQwenSession(input, options = {}) {
  // The browser relay can stay in one chat when explicit multi-turn behavior is requested.
  const maxTurns = Number(options.maxTurns || 1);
  const originalPrompt = options.originalPrompt || (typeof input === 'string' ? input : input?.prompt || '');
  const connectionConfig = resolveChromeConnectionConfig();
  ensureProfileExists(connectionConfig.profilePath);
  const session = await openChromeSession(connectionConfig, {
    headless: false,
    channel: 'chrome',
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-features=TranslateUI,IsolateOrigins,site-per-process'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  let page = session.page;
  try {
    await page.goto(QWEN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForStableUi(page);
    await maybeStartNewChat(page);
    await maybeSelectModel(page);
    await ensureMaxPreviewSelected(page);

    const inputBox = await findPromptInput(page);
    if (!inputBox) {
      throw new Error('Qwen prompt input not found in the Chrome Default profile session.');
    }

    let currentPrompt = buildSessionPrompt(input);
    let responseText = '';

    for (let turn = 1; turn <= maxTurns; turn += 1) {
      const previousAssistantState = await getLastAssistantState(page);
      await ensureMaxPreviewSelected(page);
      await enterPrompt(inputBox, currentPrompt);
      await submitPrompt(page, inputBox, currentPrompt, previousAssistantState);
      await waitForStreamingDone(page, previousAssistantState);
      await waitForPromptReady(page);

      responseText = await getLastAssistantText(page);
      if (!responseText) {
        throw new Error('No assistant response could be extracted from the Qwen UI.');
      }

      // Qwen can visually drift back to Plus after a send; re-assert Max Preview after each completed turn
      // so the active chat stays pinned to the intended model for both the next turn and the final UI state.
      await ensureMaxPreviewSelected(page);

      if (turn >= maxTurns) break;
      if (!shouldContinueConversation(responseText)) break;

      currentPrompt = buildConversationFollowUpPrompt(originalPrompt, responseText);
    }

    return responseText;
  } catch (error) {
    if (page) {
      const screenshotPath = await captureScreenshot(page, 'run-failed').catch(() => '');
      const selectorReport = await collectSelectorReport(page).catch(() => ({}));
      const reportPath = await writeArtifactJson('run-failed-selectors', {
        error: error?.message || String(error),
        selectorReport,
        selectorSummary: summarizeSelectorReport(selectorReport)
      }).catch(() => '');

      if (screenshotPath || reportPath) {
        error.message = `${error.message} [diagnostics screenshot=${screenshotPath || 'n/a'} report=${reportPath || 'n/a'}]`;
      }
    }
    throw error;
  } finally {
    await session.close();
  }
}

export async function runBrowserE2ECheck() {
  // Lightweight browser proof that the page opens and the input is still discoverable.
  const connectionConfig = resolveChromeConnectionConfig();
  ensureProfileExists(connectionConfig.profilePath);

  const session = await openChromeSession(connectionConfig, {
    headless: false,
    channel: 'chrome',
    args: [
      '--no-first-run',
      '--no-default-browser-check'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  let page = session.page;
  try {
    await page.goto(QWEN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForStableUi(page);
    const artifactPaths = [];
    artifactPaths.push(await captureScreenshot(page, 'smoke-01-loaded'));

    const newChat = await maybeStartNewChat(page);
    artifactPaths.push(await captureScreenshot(page, 'smoke-02-after-new-chat'));

    const modelSelection = await maybeSelectModel(page);
    artifactPaths.push(await captureScreenshot(page, 'smoke-03-after-model'));

    const inputFound = Boolean(await findPromptInput(page));
    artifactPaths.push(await captureScreenshot(page, 'smoke-04-input-check'));

    const selectorReport = await collectSelectorReport(page);
    const selectorSummary = summarizeSelectorReport(selectorReport);
    const reportPath = await writeArtifactJson('smoke-selector-report', {
      url: page.url(),
      title: await page.title().catch(() => ''),
      inputFound,
      newChat,
      modelSelection,
      selectorReport,
      selectorSummary,
      artifactPaths
    });

    return {
      ok: true,
      url: page.url(),
      title: await page.title().catch(() => ''),
      inputFound,
      profilePath: connectionConfig.profilePath,
      userDataDir: connectionConfig.userDataDir,
      profileDirectory: connectionConfig.profileDirectory,
      connectionMode: connectionConfig.mode,
      cdpUrl: connectionConfig.cdpUrl || '',
      artifactPaths,
      reportPath,
      selectorSummary
    };
  } catch (error) {
    if (page) {
      await captureScreenshot(page, 'smoke-failed').catch(() => {});
    }
    throw error;
  } finally {
    await session.close();
  }
}

export async function sendToQwen(input) {
  return runQwenSession(input, { maxTurns: 1 });
}

export function buildPromptPayload(context) {
  // Keep payload generation deterministic, but phrase structured context like a normal operator message.
  if (typeof context === 'string') return context;

  const files = Array.isArray(context.files) ? context.files : [];
  const rules = Array.isArray(context.rules) ? context.rules : [];
  const scripts = context.package?.scripts?.join(', ') || 'N/A';
  const dependencies = context.package?.dependencies?.join(', ') || 'N/A';

  return [
    `Task:\n${context.prompt}`,
    'Repository context:',
    `- cwd: ${context.repo?.cwd || 'N/A'}`,
    `- remote: ${context.repo?.remote || 'N/A'}`,
    `- branch: ${context.repo?.branch || 'N/A'}`,
    `- head: ${context.repo?.head || 'N/A'}`,
    `- dirty: ${Boolean(context.repo?.dirty)}`,
    '',
    'Package context:',
    `- name: ${context.package?.name || 'N/A'}`,
    `- version: ${context.package?.version || 'N/A'}`,
    `- scripts: ${scripts}`,
    `- dependencies: ${dependencies}`,
    '',
    'Relevant files:',
    ...files.map((file) => `- ${file}`),
    '',
    'Rules:',
    ...rules.map((rule) => `- ${rule}`),
    '',
    'Please reply like a normal coding assistant and keep the answer directly useful.'
  ].join('\n');
}

export function buildSessionPrompt(input) {
  const payload = buildPromptPayload(input);
  return typeof input === 'string'
    ? payload
    : payload;
}

export async function withRetry(fn, attempts = 3) {
  // Shared retry helper for flaky browser or selector operations.
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }

  throw lastError;
}

export function summarizeSelectorReport(report) {
  // Summaries make selector drift easier to read than raw count tables alone.
  return Object.fromEntries(Object.entries(report).map(([bucket, entries]) => [bucket, {
    matched: entries.some((entry) => entry.matched),
    totalMatches: entries.reduce((sum, entry) => sum + entry.count, 0)
  }]));
}

export function resolveChromeProfilePath() {
  return resolveChromeLaunchConfig().profilePath;
}

export function resolveChromeConnectionConfig() {
  // Attach mode lets operators keep Chrome open while the tool borrows the existing profile session.
  const cdpUrl = process.env.CHROME_CDP_URL || (process.env.CHROME_REMOTE_DEBUGGING_PORT ? `http://127.0.0.1:${process.env.CHROME_REMOTE_DEBUGGING_PORT}` : '');
  return {
    ...resolveChromeLaunchConfig(),
    mode: cdpUrl ? 'attach' : 'launch',
    cdpUrl
  };
}

export function resolveChromeLaunchConfig() {
  // Accept either a full profile path (.../Default) or a user-data root plus profile directory.
  const explicit = process.env.CHROME_PROFILE || process.env.CHROME_PROFILE_DIR || '';
  const profileDirectory = process.env.CHROME_PROFILE_DIRECTORY || 'Default';

  if (explicit) {
    const explicitName = path.basename(explicit);
    if (/^(Default|Profile\s+\d+|Guest Profile|System Profile)$/u.test(explicitName)) {
      return {
        userDataDir: path.dirname(explicit),
        profileDirectory: explicitName,
        profilePath: explicit
      };
    }

    return {
      userDataDir: explicit,
      profileDirectory,
      profilePath: path.join(explicit, profileDirectory)
    };
  }

  const userDataDir = defaultChromeUserDataDir();
  return {
    userDataDir,
    profileDirectory,
    profilePath: path.join(userDataDir, profileDirectory)
  };
}

function defaultChromeUserDataDir() {
  const platform = os.platform();
  return platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome')
    : platform === 'win32'
      ? path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data')
      : path.join(os.homedir(), '.config', 'google-chrome');
}

function ensureProfileExists(profilePath) {
  // Fail early with a human-readable error instead of letting Playwright throw later.
  if (!fs.existsSync(profilePath)) {
    throw new Error(`Chrome profile not found: ${profilePath}. Set CHROME_PROFILE to your local Default profile.`);
  }
}

async function launchChromeContext(launchConfig, options) {
  // Persistent profile launches are the most failure-prone part of the stack, so wrap errors clearly.
  try {
    return await chromium.launchPersistentContext(launchConfig.userDataDir, {
      ...options,
      args: [...(options.args || []), `--profile-directory=${launchConfig.profileDirectory}`]
    });
  } catch (error) {
    const lockState = detectChromeProfileLock(launchConfig);
    const lockHint = lockState.locked
      ? ` Profile lock detected (${lockState.reason}).`
      : '';
    throw new Error(`Failed to launch Chrome with profile ${launchConfig.profilePath}. Close other Chrome windows using that profile and retry.${lockHint} Original error: ${error?.message || String(error)}`);
  }
}

async function connectToChrome(launchConfig) {
  // CDP attach mode keeps the user's existing Chrome session alive instead of spawning a second browser.
  try {
    return await chromium.connectOverCDP(launchConfig.cdpUrl);
  } catch (error) {
    throw new Error(`Failed to attach to Chrome via CDP at ${launchConfig.cdpUrl}. Make sure Chrome is already running with remote debugging enabled. Original error: ${error?.message || String(error)}`);
  }
}

async function openChromeSession(launchConfig, options) {
  // Session abstraction hides the difference between launching Chrome and attaching to it.
  if (launchConfig.mode === 'attach') {
    const browser = await connectToChrome(launchConfig);
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error('Attached Chrome session does not expose a usable browser context.');
    }

    const page = await getAttachPage(context);
    return {
      page,
      close: async () => {
        // In CDP attach mode, Playwright closes only its own connection and leaves the operator's Chrome running.
        await browser.close().catch(() => {});
      }
    };
  }

  const context = await launchChromeContext(launchConfig, options);
  const page = context.pages()[0] ?? await context.newPage();
  return {
    page,
    close: async () => {
      await context.close();
    }
  };
}

export function detectChromeProfileLock(launchConfig = resolveChromeLaunchConfig()) {
  const singletonLock = path.join(launchConfig.userDataDir, 'SingletonLock');
  if (fs.existsSync(singletonLock)) {
    return { locked: true, reason: `lock file ${singletonLock}` };
  }

  try {
    const output = execFileSync('pgrep', ['-fal', 'Google Chrome'], { encoding: 'utf8' }).trim();
    if (output) {
      return { locked: true, reason: 'running Google Chrome processes detected' };
    }
  } catch {
    // No running Chrome process found or pgrep unavailable.
  }

  return { locked: false, reason: '' };
}

async function getAttachPage(context) {
  // Reuse an existing blank tab first so attach-mode checks do not leave a useless about:blank tab behind.
  const pages = context.pages();
  const reusable = pages.find((page) => {
    const url = page.url();
    return url === 'about:blank' || url === 'chrome://newtab/' || url === 'chrome://new-tab-page/';
  });

  if (reusable) return reusable;
  if (pages[0]) return pages[0];
  return context.newPage();
}

async function waitForStableUi(page) {
  // Give the app a short settle window before querying dynamic selectors.
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_000);
}

async function maybeStartNewChat(page) {
  const result = { found: false, clicked: false, selector: '' };
  for (const selector of SELECTORS.newChat) {
    const button = page.locator(selector).first();
    if (await button.count().catch(() => 0)) {
      result.found = true;
      result.selector = selector;
      // Try to start clean; if the UI changed, continue with the current chat instead of failing.
      await button.click({ force: true }).then(() => { result.clicked = true; }).catch(() => {});
      await page.waitForTimeout(1_000);
      return result;
    }
  }

  return result;
}

async function maybeSelectModel(page) {
  const result = { menuFound: false, modelFound: false, modelClicked: false, selector: '' };
  for (const selector of SELECTORS.modelMenu) {
    const button = page.locator(selector).first();
    if (await button.count().catch(() => 0)) {
      result.menuFound = true;
      result.selector = selector;
      await button.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1_000);
      // Pick the Max Preview entry explicitly so the relay uses the stronger model by default.
      const target = page.locator('div.index-module__model-item___MkLlj').filter({ hasText: 'Qwen3.6-Max-Preview' }).first();
      if (await target.count().catch(() => 0)) {
        result.modelFound = true;
        await target.click({ force: true }).then(() => { result.modelClicked = true; }).catch(() => {});
        await page.waitForTimeout(1_000);
        await page.waitForFunction(() => {
          const header = document.querySelector('.index-module__model-selector-text___XvWe0');
          return Boolean(header && header.textContent && header.textContent.includes('Qwen3.6-Max-Preview'));
        }, { timeout: 10_000 }).catch(() => {});
      }

      if (!result.modelClicked) {
        // Retry once with the visible text node in case the class-based item selector drifted.
        const textTarget = page.getByText('Qwen3.6-Max-Preview', { exact: true }).last();
        if (await textTarget.count().catch(() => 0)) {
          await textTarget.click({ force: true }).then(() => { result.modelClicked = true; }).catch(() => {});
        }
      }
      return result;
    }
  }

  return result;
}

async function ensureMaxPreviewSelected(page) {
  // Some Qwen pages silently fall back to Plus after navigation; enforce the desired model before each send.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const currentModel = await readCurrentModel(page);
    if (currentModel.includes('Qwen3.6-Max-Preview')) return;
    await maybeSelectModel(page);
    await page.waitForTimeout(1_000);
  }

  const currentModel = await readCurrentModel(page);
  if (!currentModel.includes('Qwen3.6-Max-Preview')) {
    throw new Error(`Qwen model selection failed. Expected Qwen3.6-Max-Preview but found ${currentModel || 'unknown model'}.`);
  }
}

async function readCurrentModel(page) {
  return page.locator('.index-module__model-selector-text___XvWe0').innerText().catch(() => '');
}

async function findPromptInput(page) {
  for (const selector of SELECTORS.promptInput) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      const editable = await locator.evaluate((node) => {
        const tag = node.tagName.toLowerCase();
        const className = String(node.className || '');
        return tag !== 'textarea' || (!className.includes('ime-text-area') && !node.readOnly && !node.hasAttribute('readonly'));
      }).catch(() => false);
      if (editable) return locator;
    }
  }

  return null;
}

async function enterPrompt(input, prompt) {
  // Support both normal text fields and rich editable areas.
  const isTextField = await input.evaluate((node) => {
    const tag = node.tagName.toLowerCase();
    const className = String(node.className || '');
    return (tag === 'textarea' || tag === 'input') && !className.includes('ime-text-area') && !node.readOnly && !node.hasAttribute('readonly');
  });

  if (isTextField) {
    await input.fill(prompt);
    return;
  }

  await input.click();
  await input.type(prompt, { delay: 4 });
}

async function submitPrompt(page, input, prompt, previousAssistantState = { count: 0, text: '' }) {
  // Press Enter first because the current Qwen UI sends naturally from the focused text box.
  await page.waitForTimeout(150);
  await input.focus().catch(() => {});

  const isTextField = await input.evaluate((node) => {
    const tag = node.tagName.toLowerCase();
    return tag === 'textarea' || tag === 'input';
  }).catch(() => false);

  if (isTextField) {
    await input.press('Enter').catch(() => {});
  } else {
    await page.keyboard.press('Enter').catch(() => {});
  }

  if (await waitForSubmissionKickoff(page, input, prompt, previousAssistantState)) return;

  // Fallback to the explicit send button if Enter did not submit.
  await page.waitForFunction((selectors) => selectors.some((selector) => Boolean(document.querySelector(selector))), SELECTORS.sendButton, { timeout: 5_000 }).catch(() => {});
  const sendButtons = page.locator('button.send-button');
  if (await sendButtons.count().catch(() => 0)) {
    await sendButtons.first().click({ force: true }).catch(() => {});
    await waitForSubmissionKickoff(page, input, prompt, previousAssistantState);
  }
}

async function waitForStreamingDone(page, previousAssistantState = { count: 0, text: '' }) {
  // Wait for a NEW assistant message before checking whether streaming has finished.
  await page.waitForFunction(({ selectors, previous }) => {
    return selectors.some((selector) => {
      const elements = Array.from(document.querySelectorAll(selector));
      if (!elements.length) return false;
      const lastText = String(elements.at(-1)?.innerText || '').trim();
      return elements.length > previous.count || (lastText.length > 0 && lastText !== previous.text);
    });
  }, {
    selectors: SELECTORS.assistantOutput,
    previous: previousAssistantState
  }, { timeout: 120_000, polling: 1_000 }).catch(() => {});

  await page.waitForTimeout(2_000);
  await page.waitForFunction(() => {
    const hasStopButton = Array.from(document.querySelectorAll('button'))
      .some((button) => /^(stop|stopp)$/iu.test((button.textContent || '').trim()) || /stop-generation/iu.test(button.getAttribute('data-testid') || ''));
    const busyNode = document.querySelector('[aria-busy="true"], .loading, .streaming, .typing-indicator, [data-testid="stop-generation"]');

    return !hasStopButton && !busyNode;
  }, { timeout: 300_000, polling: 1_000 }).catch(() => {});

  // Qwen sometimes keeps appending text for a moment after the visible loading affordance disappears.
  // Wait until the newest assistant message stops changing before we read it or start any follow-up work.
  await waitForAssistantTextToStabilize(page, previousAssistantState.text);
  await page.waitForTimeout(1_500);
}

async function waitForPromptReady(page) {
  // Before sending a follow-up, wait until the composer is editable again.
  await page.waitForFunction(() => {
    const input = document.querySelector('textarea.message-input-textarea, textarea:not(.ime-text-area):not([readonly]), [contenteditable="true"], input[type="text"]');
    if (!input) return false;
    const disabled = input.hasAttribute('disabled') || input.getAttribute('aria-disabled') === 'true';
    const readOnly = input.hasAttribute('readonly') || input.readOnly === true;
    return !disabled && !readOnly;
  }, { timeout: 30_000, polling: 500 }).catch(() => {});
}

async function getLastAssistantText(page) {
  // Read the newest assistant-like container and fall back to the page body when needed.
  for (const selector of SELECTORS.assistantOutput) {
    const locator = page.locator(selector).last();
    if (await locator.count().catch(() => 0)) {
      const text = await locator.innerText().catch(() => '');
      if (text.trim()) return text.trim();
    }
  }

  return page.locator('body').innerText().catch(() => '');
}

async function getLastAssistantState(page) {
  for (const selector of SELECTORS.assistantOutput) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    if (!count) continue;

    const text = await locator.last().innerText().catch(() => '');
    return { count, text: text.trim() };
  }

  return { count: 0, text: '' };
}

async function waitForAssistantTextToStabilize(page, previousText = '') {
  let stableRounds = 0;
  let lastSeen = previousText;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = await getLastAssistantText(page).catch(() => '');
    if (!current || current === previousText) {
      stableRounds = 0;
      lastSeen = current || lastSeen;
      await page.waitForTimeout(750);
      continue;
    }

    if (current === lastSeen) {
      stableRounds += 1;
      if (stableRounds >= 2) return;
    } else {
      stableRounds = 0;
      lastSeen = current;
    }

    await page.waitForTimeout(750);
  }
}

async function waitForSubmissionKickoff(page, input, prompt, previousAssistantState) {
  // Detect whether the prompt actually started sending before trying the fallback submit path.
  const expectedPrompt = String(prompt || '').trim();

  try {
    await page.waitForFunction(({ selectors, previous, expected }) => {
      const hasBusyNode = Boolean(document.querySelector('[aria-busy="true"], .loading, .streaming, .typing-indicator, [data-testid="stop-generation"]'));
      const hasStopButton = Array.from(document.querySelectorAll('button')).some((button) => /^(stop|stopp)$/iu.test((button.textContent || '').trim()) || /stop-generation/iu.test(button.getAttribute('data-testid') || ''));
      const input = document.querySelector('textarea.message-input-textarea, textarea:not(.ime-text-area):not([readonly]), [contenteditable="true"], input[type="text"]');
      const inputValue = input ? String(input.value || input.innerText || input.textContent || '').trim() : '';
      const assistantAdvanced = selectors.some((selector) => {
        const elements = Array.from(document.querySelectorAll(selector));
        if (!elements.length) return false;
        const lastText = String(elements.at(-1)?.innerText || '').trim();
        return elements.length > previous.count || (lastText.length > 0 && lastText !== previous.text);
      });
      return hasBusyNode || hasStopButton || assistantAdvanced || (inputValue !== '' && inputValue !== expected);
    }, {
      selectors: SELECTORS.assistantOutput,
      previous: previousAssistantState,
      expected: expectedPrompt
    }, { timeout: 2_500, polling: 150 });
    return true;
  } catch {
    const currentValue = await readInputValue(input);
    return currentValue.trim() !== expectedPrompt;
  }
}

async function readInputValue(input) {
  try {
    return await input.inputValue();
  } catch {
    try {
      return await input.evaluate((node) => node.value || node.innerText || node.textContent || '');
    } catch {
      return '';
    }
  }
}

async function collectSelectorReport(page) {
  // Count matches for every selector bucket so drift can be diagnosed without guessing.
  const report = {};

  for (const [bucket, selectors] of Object.entries(SELECTORS)) {
    report[bucket] = [];
    for (const selector of selectors) {
      const count = await page.locator(selector).count().catch(() => 0);
      report[bucket].push({ selector, count, matched: count > 0 });
    }
  }

  return report;
}

function extractStatus(text) {
  // The agent loop only needs a simple draft/final signal from the response body.
  const match = String(text).match(/\{[\s\S]*?"status"\s*:\s*"(draft|final)"[\s\S]*?\}/iu);
  return match?.[1]?.toLowerCase() || '';
}

async function captureScreenshot(page, name) {
  // Store screenshots in a configurable artifacts directory so CI or humans can inspect them later.
  const dir = process.env.SIN_OMO_QWEN_ARTIFACT_DIR || 'artifacts';
  const filePath = path.join(dir, `${name}-${Date.now()}.png`);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: filePath, fullPage: true }).catch(() => {});
  return filePath;
}

async function writeArtifactJson(name, payload) {
  // Store machine-readable diagnostics next to screenshots for post-mortem analysis.
  const dir = process.env.SIN_OMO_QWEN_ARTIFACT_DIR || 'artifacts';
  const filePath = path.join(dir, `${name}-${Date.now()}.json`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}

export function shouldContinueConversation(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return false;

  if (/^[\s>*-]*$/u.test(normalized)) return false;
  if (/\b(if you want|i can also|next step|consider|could|should|also|further|let me know|suggest|recommend|however|otherwise)\b/iu.test(normalized)) return true;
  if (/\?/u.test(normalized)) return true;
  if (/^\s*[-*•]\s+/m.test(normalized)) return true;
  return false;
}

export function buildConversationFollowUpPrompt(originalRequest, previousResponse) {
  const trimmed = String(previousResponse || '').trim().slice(0, 2000);
  return [
    `Original request:\n${originalRequest}`,
    '',
    'Refine your previous answer using one same-chat follow-up turn.',
    'Keep only the necessary, best-practice-aligned next step or recommendation.',
    'Remove optional extras, duplicate explanation, and low-value suggestions.',
    '',
    'Previous answer:',
    trimmed
  ].join('\n');
}
