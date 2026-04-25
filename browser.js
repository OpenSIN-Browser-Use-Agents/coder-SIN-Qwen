import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { safeInjectInput } from './browser-hardening.js';
import { defaultCooldownUntil, hasQwenAccounts, loadQwenAccountState, loadQwenAccounts, markAccountCooldown, markAccountPreferred, resolveQwenAccountStatePath, saveQwenAccountState, selectNextQwenAccounts } from './qwen-account-rotation.js';
import { registerLifecycleResource, unregisterLifecycleResource } from './lifecycle.js';
import { getScopedEnv } from './runtime-config.js';

const QWEN_URL = 'https://chat.qwen.ai';
// Centralized selector map so UI changes stay localized.
export const SELECTORS = {
  newChat: ['.sidebar-entry-fixed-list-content', '.sidebar-entry-fixed-list-text', 'button:has-text("New Chat")', 'button:has-text("Neuer Chat")', 'button:has-text("Neue Unterhaltung")', 'text=Neue Unterhaltung', '[data-testid="new-chat"]'],
  authEntry: ['.auth-button-ui.login', 'div:has-text("Anmelden")', 'button:has-text("Anmelden")', 'button:has-text("Loslegen")', 'button:has-text("Get started")'],
  authOverlay: ['[role="dialog"]', 'text=Angemeldet bleiben', 'text=Stay signed in', 'text=Willkommen', 'text=Welcome', 'button:has-text("Registrieren")', 'button:has-text("Register")'],
  authEmail: ['input[type="email"]', 'input[name="email"]', 'input[autocomplete="email"]', 'input[placeholder*="email" i]', 'input[placeholder*="e-mail" i]', 'input[aria-label*="email" i]', 'input[type="text"]'],
  authPassword: ['input[type="password"]', 'input[name="password"]', 'input[autocomplete="current-password"]', 'input[placeholder*="password" i]', 'input[aria-label*="password" i]'],
  authSubmit: ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Weiter")', 'button:has-text("Continue")', 'button:has-text("Log in")', 'button:has-text("Sign in")', 'button:has-text("Anmelden")'],
  modelMenu: ['header span.ant-dropdown-trigger', 'header .index-module__model-selector-text___XvWe0', 'span.ant-dropdown-trigger', 'button:has-text("Model")', 'button:has-text("Modell")', '[data-testid="model-selector"]'],
  thinkingMenu: ['.qwen-thinking-selector .ant-select-selector', '.qwen-thinking-selector [role="combobox"]', '.qwen-select-thinking-label', '.qwen-select-thinking-label-text'],
  thinkingOption: ['.ant-select-item-option[title="Denken"]', '[role="option"][aria-label="Denken"]', '.ant-select-item-option[title="Thinking"]', '[role="option"][aria-label="Thinking"]'],
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
      '--disable-search-engine-choice-screen',
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
    page = await ensureQwenAuthenticated(page);
    await maybeStartNewChat(page);
    await maybeSelectModel(page);
    await ensureMaxPreviewSelected(page);
    await ensureThinkingModeSelected(page);

    const inputBox = await findPromptInput(page);
    if (!inputBox) {
      throw new Error('Qwen prompt input not found in the Chrome Default profile session.');
    }

    let currentPrompt = buildSessionPrompt(input);
    let responseText = '';

    for (let turn = 1; turn <= maxTurns; turn += 1) {
      const previousAssistantState = await getLastAssistantState(page);
      await ensureMaxPreviewSelected(page);
      await ensureThinkingModeSelected(page);
      
      if (turn === 1 && typeof input === 'object') {
        await maybeUploadContextAttachments(page, input);
      }
      
      await enterPrompt(page, inputBox, currentPrompt);
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
      await ensureThinkingModeSelected(page);

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
    page = await ensureQwenAuthenticated(page);
    const artifactPaths = [];
    artifactPaths.push(await captureScreenshot(page, 'smoke-01-loaded'));

    const newChat = await maybeStartNewChat(page);
    artifactPaths.push(await captureScreenshot(page, 'smoke-02-after-new-chat'));

    const modelSelection = await maybeSelectModel(page);
    artifactPaths.push(await captureScreenshot(page, 'smoke-03-after-model'));

    const thinkingSelection = await maybeSelectThinkingMode(page);
    artifactPaths.push(await captureScreenshot(page, 'smoke-04-after-thinking'));

    const authOverlayDetected = await hasBlockingAuthOverlay(page);
    const inputFound = await hasInteractiveChat(page);
    artifactPaths.push(await captureScreenshot(page, 'smoke-05-input-check'));

    const selectorReport = await collectSelectorReport(page);
    const selectorSummary = summarizeSelectorReport(selectorReport);
    const reportPath = await writeArtifactJson('smoke-selector-report', {
      url: page.url(),
      title: await page.title().catch(() => ''),
      inputFound,
      authOverlayDetected,
      newChat,
      modelSelection,
      thinkingSelection,
      selectorReport,
      selectorSummary,
      artifactPaths
    });

    if (authOverlayDetected) {
      throw new Error(`Blocking Qwen auth overlay detected during smoke check. [report=${reportPath}]`);
    }

    if (!inputFound) {
      throw new Error(`Qwen prompt input is not interactable during smoke check. [report=${reportPath}]`);
    }

    return {
      ok: true,
      url: page.url(),
      title: await page.title().catch(() => ''),
      inputFound,
      authOverlayDetected,
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
  const fileReferences = Array.isArray(context.fileReferences) ? context.fileReferences : [];
  const issueReferences = Array.isArray(context.issueReferences) ? context.issueReferences : [];
  const attachmentCandidates = Array.isArray(context.attachmentCandidates) ? context.attachmentCandidates : [];
  const capabilityManifest = Array.isArray(context.capabilityManifest) ? context.capabilityManifest : [];
  const references = Array.isArray(context.references) ? context.references : [];
  const stateSnapshot = context.stateSnapshot || null;
  const envelope = stateSnapshot?.stateSnapshot || null;
  const decisionHistory = Array.isArray(stateSnapshot?.decisionHistory) ? stateSnapshot.decisionHistory : [];
  const constraints = Array.isArray(context.constraints) ? context.constraints : [];
  const completionCriteria = Array.isArray(context.completionCriteria) ? context.completionCriteria : [];
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
    `- visibility: ${context.repo?.visibility || 'N/A'}`,
    `- repo url: ${context.repo?.urls?.web || 'N/A'}`,
    `- commit url: ${context.repo?.urls?.commit || 'N/A'}`,
    '',
    'Persistent consult state:',
    `- protocol version: ${stateSnapshot?.protocolVersion || 'N/A'}`,
    `- context id: ${stateSnapshot?.metadata?.contextId || 'N/A'}`,
    `- message id: ${stateSnapshot?.messageId || 'N/A'}`,
    `- previous message id: ${stateSnapshot?.metadata?.previousMessageId || 'N/A'}`,
    `- sender: ${stateSnapshot?.metadata?.sender || 'N/A'}`,
    `- receiver: ${stateSnapshot?.metadata?.receiver || 'N/A'}`,
    `- mandate: ${stateSnapshot?.mandate || 'N/A'}`,
    `- previous summary: ${stateSnapshot?.previousSummary || 'N/A'}`,
    '',
    'State snapshot:',
    `- repository url: ${envelope?.repositoryUrl || context.repo?.urls?.web || 'N/A'}`,
    `- commit url: ${envelope?.commitUrl || context.repo?.urls?.commit || 'N/A'}`,
    `- tree url: ${envelope?.treeUrl || context.repo?.urls?.tree || 'N/A'}`,
    `- branch: ${envelope?.branch || context.repo?.branch || 'N/A'}`,
    `- head: ${envelope?.head || context.repo?.head || 'N/A'}`,
    `- dirty: ${String(envelope?.dirty ?? context.repo?.dirty ?? false)}`,
    '',
    'Decision history:',
    ...decisionHistory.map((entry) => `- ${entry.timestamp || 'N/A'} [${entry.status || 'unknown'}]: ${entry.summary || entry.prompt || 'N/A'}`),
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
    'Relevant file URLs:',
    ...fileReferences.map((file) => `- ${file.path}: ${file.url || 'private_repo_attachment'}`),
    '',
    'Issue URLs:',
    ...issueReferences.map((issue) => `- ${issue.url}`),
    '',
    'Attachment files:',
    ...attachmentCandidates.map((file) => `- ${file.path} (${file.reason}, ${file.size} bytes)`),
    '',
    'Capability manifest:',
    ...capabilityManifest.map((capability) => `- ${capability.name}: ${capability.supported ? 'supported' : 'not supported'} (${capability.reason})`),
    '',
    'Reference URLs:',
    ...references.map((reference) => `- ${reference.label}: ${reference.url} (${reference.reason})`),
    '',
    'Constraints:',
    ...constraints.map((constraint) => `- ${constraint}`),
    '',
    'Completion criteria:',
    ...completionCriteria.map((criterion) => `- ${criterion}`),
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
  // Keep the default path stable: launch the profile-backed browser unless attach mode is explicitly requested.
  const attachEnabled = process.env.CHROME_ATTACH_MODE === '1';
  const cdpUrl = attachEnabled
    ? (process.env.CHROME_CDP_URL || (process.env.CHROME_REMOTE_DEBUGGING_PORT ? `http://127.0.0.1:${process.env.CHROME_REMOTE_DEBUGGING_PORT}` : ''))
    : '';
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

async function connectToChrome(launchConfig) {
  // CDP attach mode keeps the user's existing Chrome session alive instead of spawning a second browser.
  try {
    return await chromium.connectOverCDP(launchConfig.cdpUrl);
  } catch (error) {
    throw new Error(`Failed to attach to Chrome via CDP at ${launchConfig.cdpUrl}. Make sure Chrome is already running with remote debugging enabled. Original error: ${error?.message || String(error)}`);
  }
}

async function openChromeSession(launchConfig) {
  if (launchConfig.mode !== 'attach' || !launchConfig.cdpUrl) {
    throw new Error('Browser startup is banned unless the sidecar CDP attach path is ready. Run the sidecar preparation step first.');
  }

  const allowedCdpUrl = `http://127.0.0.1:${process.env.CHROME_REMOTE_DEBUGGING_PORT || '9444'}`;
  if (launchConfig.cdpUrl !== allowedCdpUrl) {
    throw new Error(`Browser attach is banned unless it targets the prepared sidecar CDP endpoint (${allowedCdpUrl}).`);
  }

  const browser = await connectToChrome(launchConfig);
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error('Attached Chrome session does not expose a usable browser context.');
  }

  const page = await getAttachPage(context);
  const resourceId = `browser:${Date.now()}:attach`;
  const closeBrowser = createBrowserSessionCloser(browser);
  registerLifecycleResource(resourceId, async () => {
    await closeBrowser();
  });
  return {
    page,
    close: async () => {
      // In CDP attach mode, Playwright closes only its own connection and leaves the operator's Chrome running.
      unregisterLifecycleResource(resourceId);
      await closeBrowser();
    }
  };
}

export function createBrowserSessionCloser(browser) {
  return async () => {
    await browser.close().catch(() => {});
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
  const pages = context.pages();
  const qwenPage = pages.find((page) => /chat\.qwen\.ai/iu.test(page.url()));

  if (qwenPage) return qwenPage;
  if (pages[0]) return pages[0];
  return context.newPage();
}

async function waitForStableUi(page) {
  // Give the app a short settle window before querying dynamic selectors.
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_000);
}

async function ensureQwenAuthenticated(page) {
  // Prefer already-authenticated sessions. Direct email/password auth is the default when credentials are configured.
  if (await hasInteractiveChat(page)) return page;

  const authVisible = await hasVisibleSelector(page, SELECTORS.authEntry) || /\/auth$/u.test(page.url());
  if (hasQwenAccounts(process.env)) {
    const authenticated = await maybeLoginWithQwenAccounts(page).catch(() => null);
    if (authenticated) return authenticated;
    throw new Error('Qwen direct email/password login failed. Check the configured Infisical-backed account credentials and account order.');
  }

  if (!authVisible) return page;

  throw new Error('Qwen authentication did not complete because no direct email/password account credentials were available.');
}

async function hasInteractiveChat(page) {
  const input = await findPromptInput(page);
  if (!input) return false;
  if (await hasBlockingAuthOverlay(page)) return false;
  return true;
}

async function hasVisibleSelector(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (!(await locator.count().catch(() => 0))) continue;
    if (await locator.isVisible().catch(() => false)) return true;
  }
  return false;
}

export async function hasBlockingAuthOverlay(page) {
  const dialogVisible = await hasVisibleSelector(page, ['[role="dialog"]']);
  if (dialogVisible) return true;

  const staySignedInVisible = await hasVisibleSelector(page, ['text=Angemeldet bleiben', 'text=Stay signed in']);
  if (staySignedInVisible) return true;

  const welcomeVisible = await hasVisibleSelector(page, ['text=Willkommen', 'text=Welcome']);
  const registerVisible = await hasVisibleSelector(page, ['button:has-text("Registrieren")', 'button:has-text("Register")']);
  return welcomeVisible && registerVisible;
}

async function maybeEnterAuthPage(page) {
  for (const selector of SELECTORS.authEntry) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      await locator.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      if (/\/auth(?:\?|$)/iu.test(page.url())) return;
    }
  }
}

async function maybeLoginWithQwenAccounts(page) {
  const accounts = loadQwenAccounts(process.env);
  if (!accounts.length) return null;

  const statePath = resolveQwenAccountStatePath(process.env);
  let nextState = await loadQwenAccountState(statePath);
  const orderedAccounts = selectNextQwenAccounts(accounts, nextState);
  if (!orderedAccounts.length) return null;

  const signinPage = await openDirectQwenSigninPage(page);

  for (const account of orderedAccounts) {
    const outcome = await tryEmailPasswordQwenLogin(signinPage, account);
    if (outcome.ok) {
      nextState = markAccountPreferred(nextState, account.id);
      await saveQwenAccountState(nextState, statePath);
      return outcome.page || signinPage;
    }

    if (outcome.rateLimited) {
      nextState = markAccountCooldown(nextState, account.id, defaultCooldownUntil());
      await saveQwenAccountState(nextState, statePath);
      continue;
    }
  }

  return null;
}

async function openDirectQwenSigninPage(page) {
  const signinUrl = `${QWEN_URL}/auth?action=signin`;
  if (!/\/auth\?action=signin/iu.test(page.url())) {
    await page.goto(QWEN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    await waitForStableUi(page);
    await maybeEnterAuthPage(page);
  }

  if (!/\/auth\?action=signin/iu.test(page.url())) {
    await page.goto(signinUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(async () => {
      await page.goto(QWEN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    });
    await waitForStableUi(page);
    await maybeEnterAuthPage(page);
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  return page;
}

async function tryEmailPasswordQwenLogin(page, account) {
  const emailInput = await findVisibleSelector(page, SELECTORS.authEmail, 20_000);
  if (!emailInput) {
    if (await hasInteractiveChat(page)) return { ok: true, page };
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (looksLikeQwenRateLimit(bodyText)) return { ok: false, rateLimited: true, reason: 'rate limit page' };
    return { ok: false, reason: 'email input not found' };
  }

  await safeInjectInput(page, emailInput, account.email, { env: process.env });
  await submitAuthStep(page, emailInput);

  const passwordInput = await findVisibleSelector(page, SELECTORS.authPassword, 20_000);
  if (!passwordInput) {
    if (await hasInteractiveChat(page)) return { ok: true, page };
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (looksLikeQwenRateLimit(bodyText)) return { ok: false, rateLimited: true, reason: 'rate limit page' };
    return { ok: false, reason: 'password input not found' };
  }

  await safeInjectInput(page, passwordInput, account.password, { env: process.env });
  await submitAuthStep(page, passwordInput);

  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (looksLikeQwenRateLimit(bodyText)) {
    return { ok: false, rateLimited: true, reason: 'rate limit page' };
  }

  const authenticatedPage = await waitForAuthenticatedChat(page).catch(() => null);
  if (authenticatedPage) return { ok: true, page: authenticatedPage };
  if (await hasInteractiveChat(page)) return { ok: true, page };
  return { ok: false, reason: 'chat input not found after login' };
}

async function submitAuthStep(page, input) {
  await page.waitForTimeout(200);
  await input.focus().catch(() => {});
  const submitButton = await findVisibleSelector(page, SELECTORS.authSubmit, 2_500);
  if (submitButton) {
    await submitButton.click({ force: true }).catch(() => {});
  } else {
    await page.keyboard.press('Enter').catch(() => {});
  }
  await page.waitForTimeout(1_000);
}

async function findVisibleSelector(page, selectors, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      const count = await locator.count().catch(() => 0);
      if (!count) continue;
      const visible = await locator.isVisible().catch(() => false);
      if (visible) return locator;
    }
    await page.waitForTimeout(200);
  }
  return null;
}

function looksLikeQwenRateLimit(text) {
  return /(?:daily\s+usage\s+limit|usage\s+limit|rate\s*limit|too\s+many\s+requests|come\s+back\s+in\s+\d+\s+hours|20\s+hours|20\s+h)/iu.test(String(text || ''));
}

async function waitForAuthenticatedChat(page) {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    for (const candidate of page.context().pages()) {
      if (!/chat\.qwen\.ai/iu.test(candidate.url())) continue;
      await candidate.waitForTimeout(300);
      if (await hasInteractiveChat(candidate)) return candidate;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error('Qwen authentication did not complete; no interactive chat became available.');
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

async function maybeSelectThinkingMode(page) {
  const result = { menuFound: false, optionFound: false, optionClicked: false, selector: '', currentMode: '' };
  const currentMode = await readCurrentThinkingMode(page);
  if (isThinkingMode(currentMode)) {
    result.currentMode = currentMode;
    return result;
  }

  for (const selector of SELECTORS.thinkingMenu) {
    const trigger = page.locator(selector).first();
    if (await trigger.count().catch(() => 0)) {
      result.menuFound = true;
      result.selector = selector;
      await trigger.click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
      for (const optionSelector of SELECTORS.thinkingOption) {
        const option = page.locator(optionSelector).first();
        if (await option.count().catch(() => 0)) {
          result.optionFound = true;
          result.currentMode = await readCurrentThinkingMode(page);
          await option.click({ force: true }).then(() => { result.optionClicked = true; }).catch(() => {});
          const afterMode = await waitForThinkingModeSettled(page);
          if (isThinkingMode(afterMode)) {
            result.currentMode = afterMode;
            return result;
          }
        }
      }
      return result;
    }
  }
  return result;
}

async function ensureThinkingModeSelected(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentMode = await readCurrentThinkingMode(page);
    if (isThinkingMode(currentMode)) return;
    await maybeSelectThinkingMode(page);
    const afterMode = await waitForThinkingModeSettled(page);
    if (isThinkingMode(afterMode)) return;
  }

  const currentMode = await readCurrentThinkingMode(page);
  if (!isThinkingMode(currentMode)) {
    throw new Error(`Qwen thinking mode selection failed. Expected Denken/Thinking but found ${currentMode || 'unknown mode'}.`);
  }
}

async function readCurrentThinkingMode(page) {
  for (const selector of SELECTORS.thinkingMenu) {
    const text = await page.locator(selector).first().innerText().catch(() => '');
    const normalized = String(text || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function isThinkingMode(mode) {
  return /^(denken|thinking)$/iu.test(String(mode || '').trim());
}

async function waitForThinkingModeSettled(page) {
  await page.waitForFunction(() => {
    const label = document.querySelector('.qwen-select-thinking-label-text');
    const text = String(label?.textContent || '').trim();
    return /^(Denken|Thinking)$/iu.test(text);
  }, { timeout: 4000, polling: 150 }).catch(() => {});
  await page.waitForTimeout(300);
  return readCurrentThinkingMode(page);
}

async function maybeUploadContextAttachments(page, context) {
  const attachments = Array.isArray(context?.attachmentCandidates) ? context.attachmentCandidates.slice(0, 10) : [];
  if (!attachments.length) return { uploaded: false, count: 0 };

  const fileInput = page.locator('#filesUpload').first();
  if (!(await fileInput.count().catch(() => 0))) return { uploaded: false, count: 0 };

  await fileInput.setInputFiles(attachments.map((file) => file.absolutePath)).catch(() => {});
  await page.waitForTimeout(1000);
  return { uploaded: true, count: attachments.length };
}

async function findPromptInput(page) {
  for (const selector of SELECTORS.promptInput) {
    const locator = page.locator(selector).first();
    if (!(await locator.count().catch(() => 0))) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;
    const enabled = await locator.isEnabled().catch(() => true);
    if (!enabled) continue;
    const editable = await locator.isEditable().catch(async () => locator.evaluate((node) => {
      const tag = node.tagName.toLowerCase();
      const className = String(node.className || '');
      return tag !== 'textarea' || (!className.includes('ime-text-area') && !node.readOnly && !node.hasAttribute('readonly'));
    }).catch(() => false));
    if (editable) return locator;
  }

  return null;
}

async function enterPrompt(page, input, prompt) {
  if (await safeInjectInput(page, input, prompt, { env: process.env })) return;

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

  await page.waitForFunction((selectors) => selectors.some((selector) => Boolean(document.querySelector(selector))), SELECTORS.sendButton, { timeout: 5_000 }).catch(() => {});
  const sendButtons = page.locator('button.send-button');
  if (await sendButtons.count().catch(() => 0)) {
    await sendButtons.first().click({ force: true }).catch(() => {});
    await waitForSubmissionKickoff(page, input, prompt, previousAssistantState);
  }
}

async function waitForStreamingDone(page, previousAssistantState = { count: 0, text: '' }) {
  const kickedOff = await page.waitForFunction(({ selectors, previous }) => {
    return selectors.some((selector) => {
      const elements = Array.from(document.querySelectorAll(selector));
      if (!elements.length) return false;
      const lastText = String(elements.at(-1)?.innerText || '').trim();
      return elements.length > previous.count || (lastText.length > 0 && lastText !== previous.text);
    }) || Boolean(document.querySelector('[aria-busy="true"], .loading, .streaming, .typing-indicator, [data-testid="stop-generation"]'));
  }, {
    selectors: SELECTORS.assistantOutput,
    previous: previousAssistantState
  }, { timeout: 120_000, polling: 1_000 }).then(() => true).catch(() => false);

  if (!kickedOff) {
    throw new Error('Timed out waiting for Qwen to start responding.');
  }

  await page.waitForTimeout(2_000);
  await page.waitForFunction(() => {
    const hasStopButton = Array.from(document.querySelectorAll('button')).some((button) => /^(stop|stopp)$/iu.test((button.textContent || '').trim()) || /stop-generation/iu.test(button.getAttribute('data-testid') || ''));
    const busyNode = document.querySelector('[aria-busy="true"], .loading, .streaming, .typing-indicator, [data-testid="stop-generation"]');
    return !hasStopButton && !busyNode;
  }, { timeout: 300_000, polling: 1_000 });

  await waitForAssistantTextToStabilize(page, previousAssistantState.text);
  await page.waitForTimeout(1_500);
}

async function waitForPromptReady(page) {
  await page.waitForFunction(() => {
    const input = document.querySelector('textarea.message-input-textarea, textarea:not(.ime-text-area):not([readonly]), [contenteditable="true"], input[type="text"]');
    if (!input) return false;
    const disabled = input.hasAttribute('disabled') || input.getAttribute('aria-disabled') === 'true';
    const readOnly = input.hasAttribute('readonly') || input.readOnly === true;
    return !disabled && !readOnly;
  }, { timeout: 30_000, polling: 500 }).catch(() => {});
}

async function getLastAssistantText(page) {
  for (const selector of SELECTORS.assistantOutput) {
    const locator = page.locator(selector).last();
    if (await locator.count().catch(() => 0)) {
      const text = await locator.innerText().catch(() => '');
      if (text.trim()) return text.trim();
    }
  }
  return '';
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
  const dir = getScopedEnv('ARTIFACT_DIR', 'artifacts');
  const filePath = path.join(dir, `${name}-${Date.now()}.png`);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: filePath, fullPage: true }).catch(() => {});
  return filePath;
}

async function writeArtifactJson(name, payload) {
  // Store machine-readable diagnostics next to screenshots for post-mortem analysis.
  const dir = getScopedEnv('ARTIFACT_DIR', 'artifacts');
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
