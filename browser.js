import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { assertCompleteReply, normalizeRenderedReplyText, safeInjectInput } from './packages/qwen-core/browser-hardening.js';
import { hasQwenAccounts, isRateLimitCircuitOpen, loadQwenAccountState, loadQwenAccounts, markAccountPreferred, markRateLimitFailure, markRateLimitSuccess, resolveQwenAccountStatePath, resolveQwenRateLimitPolicy, saveQwenAccountState, selectNextQwenAccounts } from './qwen-account-rotation.js';
import { registerLifecycleResource, unregisterLifecycleResource } from './packages/qwen-core/lifecycle.js';
import { writeLogEntry } from './packages/qwen-core/logger.js';
import { probeCdpEndpoint } from './packages/qwen-core/lib/cdp-probe.js';
import { guardPromptLength } from './packages/qwen-core/lib/prompt-guard.js';
import { getScopedEnv } from './packages/qwen-core/runtime-config.js';
import { installTraceContext, readTraceContext } from './packages/qwen-core/trace.js';
import { buildPromptPayload } from './packages/qwen-core/prompt-builder.js';
import { waitForQwenCompletion } from './packages/qwen-core/lib/wait-for-completion.js';
import { resolveChromeProfile } from './packages/qwen-core/lib/chrome-profile-resolver.js';

export { buildPromptPayload };

const require = createRequire(import.meta.url);

let chromiumModulePromise;
let cdpCompatibilityPatched = false;
let qwenCompletionMetadata = {
  status: 'idle',
  softTimeout: false,
  source: '',
  note: ''
};

function updateQwenCompletionMetadata(patch) {
  qwenCompletionMetadata = {
    ...qwenCompletionMetadata,
    ...patch
  };
  return qwenCompletionMetadata;
}

function isTimeoutLikeError(error) {
  const message = String(error?.message || '');
  const name = String(error?.name || '');
  const code = String(error?.code || '');
  return code === 'ETIMEDOUT' || name === 'TimeoutError' || /timed?\s*out|timeout|stabilisierte sich nicht/iu.test(message);
}

export function getQwenCompletionMetadata() {
  return { ...qwenCompletionMetadata };
}

export function resetQwenCompletionMetadata() {
  qwenCompletionMetadata = {
    status: 'idle',
    softTimeout: false,
    source: '',
    note: ''
  };
  return qwenCompletionMetadata;
}

async function getChromium() {
  if (!chromiumModulePromise) {
    chromiumModulePromise = import('playwright').then((module) => module.chromium);
  }
  return chromiumModulePromise;
}

const QWEN_URL = 'https://chat.qwen.ai';
const QWEN_SESSION_STORAGE_KEY = 'coder_sin_qwen_session_id';
const QWEN_SESSION_NAME_PREFIX = 'coder-sin-qwen-session:';
// Centralized selector map so UI changes stay localized.
export const SELECTORS = {
  newChat: ['div.sidebar-entry-fixed-list-content', '.sidebar-entry-fixed-list-text', 'button:has-text("New Chat")', 'button:has-text("Neuer Chat")', 'button:has-text("Neue Unterhaltung")', 'text=Neue Unterhaltung', '[data-testid="new-chat"]', 'div.sidebar-side-fold-container-open'],
  authEntry: ['.auth-button-ui.login', 'div:has-text("Anmelden")', 'button:has-text("Anmelden")', 'button:has-text("Loslegen")', 'button:has-text("Get started")'],
  authOverlay: ['[role="dialog"]', 'text=Angemeldet bleiben', 'text=Stay signed in', 'text=Willkommen', 'text=Welcome', 'button:has-text("Registrieren")', 'button:has-text("Register")'],
  authWelcomeDialog: ['[role="dialog"]'],
  authWelcomeSignIn: ['[role="dialog"] button:has-text("Anmelden")', '[role="dialog"] button:has-text("Sign in")', '[role="dialog"] button:has-text("Log in")'],
  authEmail: ['input[type="email"]', 'input[name="email"]', 'input[autocomplete="email"]', 'input[placeholder*="email" i]', 'input[placeholder*="e-mail" i]', 'input[aria-label*="email" i]', 'input[type="text"]'],
  authPassword: ['input[type="password"]', 'input[name="password"]', 'input[autocomplete="current-password"]', 'input[placeholder*="password" i]', 'input[aria-label*="password" i]'],
  authSubmit: ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Weiter")', 'button:has-text("Continue")', 'button:has-text("Log in")', 'button:has-text("Sign in")', 'button:has-text("Anmelden")'],
  modelMenu: ['header span.ant-dropdown-trigger', 'header .index-module__model-selector-text___XvWe0', 'span.ant-dropdown-trigger', 'button:has-text("Model")', 'button:has-text("Modell")', '[data-testid="model-selector"]'],
  thinkingMenu: ['.qwen-thinking-selector .ant-select-selector', '.qwen-thinking-selector [role="combobox"]', '.qwen-select-thinking-label', '.qwen-select-thinking-label-text'],
  thinkingOption: ['.ant-select-item-option[title="Denken"]', '[role="option"][aria-label="Denken"]', '.ant-select-item-option[title="Thinking"]', '[role="option"][aria-label="Thinking"]'],
  promptInput: ['textarea.message-input-textarea', 'textarea:not(.ime-text-area):not([readonly])', '[contenteditable="true"]', 'input[type="text"]', 'textarea[aria-label*="message" i]', 'input[aria-label*="prompt" i]'],
  sendButton: ['div.chat-prompt-send-button button', '.send-button', 'button[type="submit"]', 'button[aria-label*="send" i]', 'button:has-text("Send")', 'button:has-text("Senden")'],
  assistantOutput: ['.response-message-content', '.custom-qwen-markdown', '.qwen-markdown', '[data-role="assistant"] .markdown-body', '[data-message-author-role="assistant"]', '.message-content', '.chat-message .content', '.chat-container-statement .markdown-prose', '.markdown-prose']
};

export async function runQwenSession(input, options = {}) {
  // The browser relay can stay in one chat when explicit multi-turn behavior is requested.
  const maxTurns = Number(options.maxTurns || 1);
  const originalPrompt = options.originalPrompt || (typeof input === 'string' ? input : input?.prompt || '');
  const completionTimeoutMs = resolveCompletionTimeoutMs(options.sessionTimeoutMs);
  const trace = installTraceContext(process.env);
  const sessionId = resolveQwenSessionId(options, trace);
  const connectionConfig = resolveChromeConnectionConfig();
  resetQwenCompletionMetadata();
  const profileCheck = await resolveChromeProfileCheck(connectionConfig);
  if (profileCheck.requireProfileCheck) {
    ensureProfileExists(connectionConfig.profilePath);
  }
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
    if (!session.existingSession || !/chat\.qwen\.ai/iu.test(page.url())) {
      await page.goto(QWEN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await waitForStableUi(page);
    }
    await bindQwenSession(page, sessionId);
    await assertQwenSessionBinding(page, sessionId);
    page = await ensureQwenAuthenticated(page, sessionId);
    await maybeStartNewChat(page, { forceFresh: true });
    await bindQwenSession(page, sessionId);
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
      await assertQwenSessionBinding(page, sessionId);
      const previousAssistantState = await getLastAssistantState(page);
      await ensureMaxPreviewSelected(page);
      await ensureThinkingModeSelected(page);
      
      if (turn === 1 && typeof input === 'object') {
        await maybeUploadContextAttachments(page, input);
      }
      
      await bindQwenSession(page, sessionId);
      await enterPrompt(page, inputBox, currentPrompt);
      await submitPrompt(page, inputBox, currentPrompt, previousAssistantState);
      responseText = await waitForStreamingDone(page, previousAssistantState, currentPrompt, { completionTimeoutMs });
      await waitForPromptReady(page);

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
        trace: readTraceContext(),
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
  const trace = installTraceContext(process.env);
  const sessionId = resolveQwenSessionId({}, trace);
  const connectionConfig = resolveChromeConnectionConfig();
  const profileCheck = await resolveChromeProfileCheck(connectionConfig);
  if (profileCheck.requireProfileCheck) {
    ensureProfileExists(connectionConfig.profilePath);
  }

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
    if (!session.existingSession || !/chat\.qwen\.ai/iu.test(page.url())) {
      await page.goto(QWEN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await waitForStableUi(page);
    }
    await bindQwenSession(page, sessionId);
    await assertQwenSessionBinding(page, sessionId);
    page = await ensureQwenAuthenticated(page, sessionId);
    const artifactPaths = [];
    artifactPaths.push(await captureScreenshot(page, 'smoke-01-loaded'));

    const newChat = await maybeStartNewChat(page, { forceFresh: true });
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
      trace: readTraceContext(),
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

export function buildSessionPrompt(input) {
  const payload = buildPromptPayload(input);
  return typeof input === 'string'
    ? sanitizePromptForBrowser(payload)
    : payload;
}

export function resolveQwenSessionId(options = {}, trace = readTraceContext()) {
  return String(options.sessionId || options.qwenSessionId || trace.sessionId || trace.runId || '').trim();
}

export function getQwenSessionMarker(sessionId) {
  return `${QWEN_SESSION_NAME_PREFIX}${String(sessionId || '').trim()}`;
}

export function isQwenSessionBinding(binding, sessionId) {
  const marker = getQwenSessionMarker(sessionId);
  return Boolean(sessionId) && (binding?.windowName === marker || binding?.sessionStorageId === String(sessionId).trim());
}

async function bindQwenSession(page, sessionId) {
  const resolvedSessionId = String(sessionId || '').trim();
  if (!resolvedSessionId) return;

  const marker = getQwenSessionMarker(resolvedSessionId);
  await page.evaluate(({ key, markerValue, sessionValue }) => {
    try {
      window.name = markerValue;
    } catch {
      // Ignore windows that refuse reassignment.
    }

    try {
      sessionStorage.setItem(key, sessionValue);
    } catch {
      // Ignore origin transitions and storage restrictions; window.name still keeps the tab bound.
    }
  }, {
    key: QWEN_SESSION_STORAGE_KEY,
    markerValue: marker,
    sessionValue: resolvedSessionId
  }).catch(() => {});
}

async function readQwenSessionBinding(page) {
  return await page.evaluate(({ key }) => {
    let sessionStorageId = '';
    try {
      sessionStorageId = String(sessionStorage.getItem(key) || '').trim();
    } catch {
      sessionStorageId = '';
    }

    return {
      windowName: String(window.name || '').trim(),
      sessionStorageId
    };
  }, { key: QWEN_SESSION_STORAGE_KEY }).catch(() => ({ windowName: '', sessionStorageId: '' }));
}

async function assertQwenSessionBinding(page, sessionId) {
  const binding = await readQwenSessionBinding(page);
  if (!isQwenSessionBinding(binding, sessionId)) {
    throw new Error(`Qwen session binding mismatch. Expected session ${sessionId || 'unknown'} but found ${binding.windowName || binding.sessionStorageId || 'unbound tab'}.`);
  }
}

export function sanitizePromptForBrowser(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return '';

  const cleaned = text.replace(/^\/?ask-qwen\s*/iu, '').trim();
  if (/^(?:node\s|npm\s|npx\s|bash\s|sh\s|\$|>\s)/iu.test(cleaned)) {
    throw new Error('CLI artifact detected in prompt. Relay forwards natural-language tasks only.');
  }

  return cleaned || text;
}

export function resolvePromptUrlBudget(env = process.env) {
  const raw = String(env.SIN_CODER_QWEN_MAX_URLS || '').trim();
  if (!raw) return 10;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return 10;
  return Math.min(parsed, 25);
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
  const envName = process.env.QWEN_CHROME_PROFILE_NAME || process.env.CHROME_PROFILE_NAME || '';
  const resolved = resolveChromeProfile({ profileName: envName });

  return {
    userDataDir: resolved.userDataDir,
    profileDirectory: resolved.profileDirectory,
    profilePath: resolved.profilePath,
    profileName: resolved.profileName || null,
    profileResolved: resolved.resolved,
  };
}

export function shouldRequireChromeProfilePath(connectionConfig = resolveChromeConnectionConfig()) {
  return connectionConfig.mode !== 'attach';
}

export async function resolveChromeProfileCheck(connectionConfig = resolveChromeConnectionConfig(), options = {}) {
  if (shouldRequireChromeProfilePath(connectionConfig)) {
    return { requireProfileCheck: true, probeLatencyMs: 0 };
  }

  if (!connectionConfig.cdpUrl) {
    throw new Error('Attach mode requested without a CDP URL. Refusing to skip the cloned sidecar profile check.');
  }

  const probeTimeoutMs = Number(options.probeTimeoutMs || 2500);
  const probeFn = options.probeFn || probeChromeCdpEndpoint;
  const logFn = options.logFn || writeLogEntry;
  const probe = await probeFn(connectionConfig.cdpUrl, probeTimeoutMs);

  if (!probe.ok) {
    throw new Error(`Refusing to skip the cloned sidecar profile check because the prepared CDP endpoint is not reachable at ${connectionConfig.cdpUrl}.`);
  }

  const probeLatencyMs = Number(probe.latencyMs || 0);
  await Promise.resolve(logFn({
    event: 'attach_mode_skip_sidecar_profile_check',
    cdpUrl: connectionConfig.cdpUrl,
    probeLatencyMs
  }, options.logFile)).catch(() => {});

  return { requireProfileCheck: false, probeLatencyMs };
}

export async function probeChromeCdpEndpoint(cdpUrl, timeoutMs = 2500) {
  return probeCdpEndpoint(cdpUrl, timeoutMs);
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
    ensureChromiumCdpCompatibility();
    const chromium = await getChromium();
    const channel = chromium?._channel;
    const originalConnectOverCDP = channel?.connectOverCDP?.bind(channel);
    if (typeof originalConnectOverCDP !== 'function') {
      throw new Error('Playwright Chromium channel does not expose connectOverCDP.');
    }

    channel.connectOverCDP = (params) => originalConnectOverCDP(buildSafeCdpConnectParams(params));
    try {
      return await chromium.connectOverCDP(launchConfig.cdpUrl, { isLocal: true });
    } finally {
      channel.connectOverCDP = originalConnectOverCDP;
    }
  } catch (error) {
    throw new Error(`Failed to attach to Chrome via CDP at ${launchConfig.cdpUrl}. Make sure Chrome is already running with remote debugging enabled. Original error: ${error?.message || String(error)}`);
  }
}

export function buildSafeCdpConnectParams(params = {}) {
  return {
    ...params,
    isLocal: params?.isLocal ?? true,
    acceptDownloads: 'internal-browser-default'
  };
}

export function ensureChromiumCdpCompatibility() {
  // Playwright can otherwise try Browser.setDownloadBehavior on CDP connections,
  // which some Chrome/Chromium sessions reject with a context-management error.
  if (!process.env.PW_CHROMIUM_DISABLE_DOWNLOAD_BEHAVIOR) {
    process.env.PW_CHROMIUM_DISABLE_DOWNLOAD_BEHAVIOR = '1';
  }
  patchPlaywrightCdpDownloadBehaviorHandling();
  return process.env.PW_CHROMIUM_DISABLE_DOWNLOAD_BEHAVIOR;
}

export function buildSafePersistentContextOptions(options = {}) {
  return {
    ...options,
    acceptDownloads: options.acceptDownloads || 'internal-browser-default'
  };
}

function patchPlaywrightCdpDownloadBehaviorHandling() {
  if (cdpCompatibilityPatched) return;
  const playwrightCoreRoot = path.dirname(require.resolve('playwright-core/package.json'));
  const crConnectionModule = require(path.join(playwrightCoreRoot, 'lib/server/chromium/crConnection.js'));
  const originalSend = crConnectionModule.CRSession?.prototype?.send;
  if (typeof originalSend !== 'function') {
    throw new Error('Playwright CRSession.send is unavailable for CDP compatibility patching.');
  }

  crConnectionModule.CRSession.prototype.send = async function patchedSend(method, params) {
    try {
      return await originalSend.call(this, method, params);
    } catch (error) {
      if (method === 'Browser.setDownloadBehavior' && isUnsupportedDownloadBehaviorError(error)) {
        return {};
      }
      throw error;
    }
  };
  cdpCompatibilityPatched = true;
}

function isUnsupportedDownloadBehaviorError(error) {
  return /Browser\.setDownloadBehavior/iu.test(String(error?.message || error)) && /Browser context management is not supported/iu.test(String(error?.message || error));
}

async function openChromeSession(launchConfig, options = {}) {
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

  const sessionId = resolveQwenSessionId(options, installTraceContext(process.env));
  const { page, existingSession } = await getAttachPage(context, sessionId);
  const resourceId = `browser:${Date.now()}:attach`;
  const closeBrowser = createBrowserSessionCloser(browser);
  registerLifecycleResource(resourceId, async () => {
    await closeBrowser();
  });
  return {
    page,
    existingSession,
    sessionId,
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

async function getAttachPage(context, sessionId) {
  const pages = context.pages();
  const matches = [];

  for (const page of pages) {
    const binding = await readQwenSessionBinding(page).catch(() => null);
    if (isQwenSessionBinding(binding, sessionId)) {
      matches.push(page);
    }
  }

  if (matches.length > 1) {
    throw new Error(`Multiple Chrome tabs are already bound to the same Qwen session id (${sessionId}). Close the duplicates before retrying.`);
  }

  if (matches[0]) {
    await bindQwenSession(matches[0], sessionId);
    return { page: matches[0], existingSession: true };
  }

  const page = await context.newPage();
  await bindQwenSession(page, sessionId);
  return { page, existingSession: false };
}

async function waitForStableUi(page) {
  // Give the app a short settle window before querying dynamic selectors.
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_000);
}

async function ensureQwenAuthenticated(page, sessionId) {
  // Prefer already-authenticated sessions. Direct email/password auth is the default when credentials are configured.
  await assertQwenSessionBinding(page, sessionId);
  if (await hasInteractiveChat(page)) return page;

  const authVisible = await hasVisibleSelector(page, SELECTORS.authEntry) || /\/auth$/u.test(page.url());
  if (hasQwenAccounts(process.env)) {
    const authenticated = await maybeLoginWithQwenAccounts(page, sessionId).catch(() => null);
    if (authenticated) {
      await assertQwenSessionBinding(authenticated, sessionId);
      return authenticated;
    }
    throw new Error('Qwen direct email/password login failed. Check the configured Infisical-backed account credentials and account order.');
  }

  if (!authVisible) return page;

  throw new Error('Qwen authentication did not complete because no direct email/password account credentials were available.');
}

async function hasInteractiveChat(page) {
  // Only consider chat interactive if we're on the MAIN chat page,
  // not on any auth or landing page.
  const url = page.url();
  if (/\/auth(?:\?|$)/iu.test(url)) return false;
  
  const input = await findPromptInput(page);
  if (!input) return false;
  if (await hasBlockingAuthOverlay(page)) return false;
  
  // On the Qwen landing page, a textarea exists but we're not logged in.
  // Check: if the URL is the root chat page AND an 'Anmelden' button is visible,
  // we're looking at the welcome page, not a real chat session.
  if (/chat\.qwen\.ai\/?(\?.*)?$/iu.test(url)) {
    const loginVisible = await hasVisibleSelector(page, SELECTORS.authEntry);
    if (loginVisible) return false;
  }
  
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
  if (await dismissAuthWelcomeModal(page)) return;

  for (const selector of SELECTORS.authEntry) {
    const locator = page.locator(selector).first();
    if (!(await locator.count().catch(() => 0))) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;
    if (await locator.isEnabled().catch(() => true)) {
      await locator.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      if (/\/auth(?:\?|$)/iu.test(page.url())) return;
      // Qwen login might be a MODAL (not a page navigation). Check for email input.
      const emailVisible = await hasVisibleSelector(page, SELECTORS.authEmail);
      if (emailVisible) return;
    }
  }
}

async function dismissAuthWelcomeModal(page) {
  const dialog = page.locator(SELECTORS.authWelcomeDialog[0]).first();
  const dialogVisible = await dialog.isVisible({ timeout: 4_000 }).catch(() => false);
  if (!dialogVisible) return false;

  for (const selector of SELECTORS.authWelcomeSignIn) {
    const button = page.locator(selector).first();
    const ready = (await button.count().catch(() => 0))
      && (await button.isVisible({ timeout: 1_500 }).catch(() => false))
      && (await button.isEnabled().catch(() => true));
    if (!ready) continue;
    await button.click({ force: true }).catch(() => {});
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(1_000);
    return true;
  }

  return false;
}

async function maybeLoginWithQwenAccounts(page, sessionId) {
  const accounts = loadQwenAccounts(process.env);
  if (!accounts.length) return null;

  const policy = resolveQwenRateLimitPolicy(process.env);
  const statePath = resolveQwenAccountStatePath(process.env);
  let nextState = await loadQwenAccountState(statePath);
  const orderedAccounts = selectNextQwenAccounts(accounts, nextState);
  if (!orderedAccounts.length) {
    if (isRateLimitCircuitOpen(nextState)) {
      throw new Error(`Qwen rate-limit circuit breaker is open until ${nextState.circuitBreakerUntil || 'the configured cooldown window expires'}.`);
    }
    return null;
  }

  const signinPage = await openDirectQwenSigninPage(page, sessionId);
  await bindQwenSession(signinPage, sessionId);

  for (const account of orderedAccounts) {
    const outcome = await tryEmailPasswordQwenLogin(signinPage, account);
    if (outcome.ok) {
      nextState = markAccountPreferred(markRateLimitSuccess(nextState, account.id), account.id);
      await saveQwenAccountState(nextState, statePath);
      return outcome.page || signinPage;
    }

    if (outcome.rateLimited) {
      nextState = markRateLimitFailure(nextState, account.id, policy);
      await saveQwenAccountState(nextState, statePath);
      continue;
    }
  }

  if (isRateLimitCircuitOpen(nextState)) {
    throw new Error(`Qwen rate-limit circuit breaker is open until ${nextState.circuitBreakerUntil || 'the configured cooldown window expires'}.`);
  }

  return null;
}

async function openDirectQwenSigninPage(page, sessionId) {
  const signinUrl = `${QWEN_URL}/auth?action=signin`;
  await bindQwenSession(page, sessionId);
  if (!/\/auth\?action=signin/iu.test(page.url())) {
    await page.goto(QWEN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    await waitForStableUi(page);
    await dismissAuthWelcomeModal(page).catch(() => false);
    await maybeEnterAuthPage(page);
  }

  if (!/\/auth\?action=signin/iu.test(page.url())) {
    await page.goto(signinUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(async () => {
      await page.goto(QWEN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    });
    await waitForStableUi(page);
    await dismissAuthWelcomeModal(page).catch(() => false);
    await maybeEnterAuthPage(page);
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await bindQwenSession(page, sessionId);
  return page;
}

async function tryEmailPasswordQwenLogin(page, account) {
  await dismissAuthWelcomeModal(page).catch(() => false);

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

export function looksLikeQwenRateLimit(text) {
  return /(?:daily\s+usage\s+limit|usage\s+limit|nutzungslimit|tägliche(?:s|m)?\s+nutzungslimit|rate\s*limit|too\s+many\s+requests|come\s+back\s+in\s+\d+\s+hours|bitte\s+warten\s+sie\s+\d+\s+stunden|warten\s+sie\s+\d+\s+stunden|\d+\s+stunden\s+bevor|20\s+hours|20\s+h)/iu.test(String(text || ''));
}

async function waitForAuthenticatedChat(page) {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    if (/chat\.qwen\.ai/iu.test(page.url()) && await hasInteractiveChat(page)) return page;
    await page.waitForTimeout(1000);
  }
  await writeLogEntry({
    event: 'qwen_auth_fallback_timeout',
    timeoutMs: 90_000,
    url: page.url()
  }).catch(() => {});
  throw new Error('Qwen authentication did not complete; no interactive chat became available.');
}

async function maybeStartNewChat(page, { forceFresh = false } = {}) {
  const result = { found: false, clicked: false, selector: '', skipped: !forceFresh };
  if (!forceFresh) return result;

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
    await writeLogEntry({
      event: 'qwen_model_pinning_failed',
      expectedModel: 'Qwen3.6-Max-Preview',
      currentModel,
      attempts: 2
    }).catch(() => {});
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
    await writeLogEntry({
      event: 'qwen_thinking_mode_pinning_failed',
      expectedMode: 'Denken/Thinking',
      currentMode,
      attempts: 3
    }).catch(() => {});
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

  const fileInput = await findFileUploadInput(page);
  if (!fileInput) {
    await writeLogEntry({
      event: 'qwen_attachment_upload_skipped',
      reason: 'file input not found',
      count: attachments.length
    }).catch(() => {});
    return { uploaded: false, count: 0 };
  }

  await fileInput.setInputFiles(attachments.map((file) => file.absolutePath)).catch(() => {});
  await page.waitForTimeout(1000);
  return { uploaded: true, count: attachments.length };
}

async function findFileUploadInput(page) {
  const selectors = [
    '#filesUpload',
    'input[type="file"]',
    'input[aria-label*="upload" i]',
    'input[aria-label*="file" i]',
    'input[title*="upload" i]'
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) return locator;
  }

  return null;
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

async function verifyReactInputRegistration(input, expectedText) {
  try {
    const registered = await input.evaluate((node, expected) => {
      const currentValue = String(node.value || node.innerText || node.textContent || '').trim();
      if (currentValue === expected) return true;
      const fiberKey = Object.keys(node).find((key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance'));
      if (!fiberKey) return currentValue === expected;
      let fiber = node[fiberKey];
      for (let i = 0; i < 8 && fiber; i++) {
        const state = fiber.memoizedState;
        if (state?.memoizedState === expected || state?.queue?.lastRenderedState === expected) return true;
        fiber = fiber.return;
      }
      return currentValue === expected;
    }, expectedText.trim());
    return Boolean(registered);
  } catch {
    return false;
  }
}

async function enterPrompt(page, input, prompt) {
  const browserSafePrompt = sanitizePromptForBrowser(prompt);
  const guardedPrompt = guardPromptLength(browserSafePrompt, { env: process.env });
  if (guardedPrompt.truncated) {
    await writeLogEntry({
      event: 'prompt_truncated',
      originalLength: guardedPrompt.originalLength,
      truncatedLength: guardedPrompt.truncatedLength,
      threshold: guardedPrompt.threshold
    }).catch(() => {});
  }

  const safePrompt = guardedPrompt.prompt;
  if (await safeInjectInput(page, input, safePrompt, { env: process.env })) {
    const reactRegistered = await verifyReactInputRegistration(input, safePrompt);
    if (reactRegistered) return;
  }

  const isTextField = await input.evaluate((node) => {
    const tag = node.tagName.toLowerCase();
    const className = String(node.className || '');
    return (tag === 'textarea' || tag === 'input') && !className.includes('ime-text-area') && !node.readOnly && !node.hasAttribute('readonly');
  });

  if (isTextField) {
    await input.fill(safePrompt);
    return;
  }

  await input.click();
  await input.type(safePrompt, { delay: 4 });
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

  const rateLimitBody = await readPageBodyText(page);
  if (looksLikeQwenRateLimit(rateLimitBody)) {
    throw new Error(`Qwen rate-limit page detected immediately after send: ${summarizeRateLimitMessage(rateLimitBody)}`);
  }

  await page.waitForFunction((selectors) => selectors.some((selector) => Boolean(document.querySelector(selector))), SELECTORS.sendButton, { timeout: 5_000 }).catch(() => {});
  const sendButtonContainer = page.locator('div.chat-prompt-send-button');
  const sendButtons = sendButtonContainer.locator('button');
  if (await sendButtons.count().catch(() => 0)) {
    await sendButtons.first().click({ force: true }).catch(() => {});
    if (await waitForSubmissionKickoff(page, input, prompt, previousAssistantState)) return;
  }

  if (isTextField) {
    await input.focus().catch(() => {});
    await input.fill(prompt).catch(() => {});
    await page.waitForTimeout(200);
    await input.press('Enter').catch(() => {});
    await waitForSubmissionKickoff(page, input, prompt, previousAssistantState);
  }
}

async function waitForStreamingDone(page, previousAssistantState = { count: 0, text: '' }, expectedPrompt = '', options = {}) {
  await page.waitForTimeout(800).catch(() => {});
  const startedAt = Date.now();
  const completionTimeoutMs = resolveCompletionTimeoutMs(options.completionTimeoutMs);

  try {
    const completionText = await waitForQwenCompletion(page, {
      timeout: completionTimeoutMs,
      stabilityMs: 2_500,
      previousText: previousAssistantState.text,
      assistantSelector: SELECTORS.assistantOutput
    });

    const result = {
      text: String(completionText || '').trim(),
      timedOut: false,
      source: 'completion_wait',
      durationMs: Date.now() - startedAt
    };
    const rateLimitBody = await readPageBodyText(page).catch(() => result.text);
    if (looksLikeQwenRateLimit(rateLimitBody) || looksLikeQwenRateLimit(result.text)) {
      throw new Error(`Qwen rate-limit page detected after send: ${summarizeRateLimitMessage(rateLimitBody || result.text)}`);
    }
    assertCompleteReply(result);
    updateQwenCompletionMetadata({ status: 'stable', softTimeout: false, source: 'completion_wait', note: '' });
    return result.text;
  } catch (error) {
    const timedOut = isTimeoutLikeError(error);
    const diagnosticText = await resolveCurrentAssistantText(page, expectedPrompt).catch(() => '');
    if (looksLikeQwenRateLimit(diagnosticText)) {
      throw new Error(`Qwen rate-limit page detected after send: ${summarizeRateLimitMessage(diagnosticText)}`);
    }

    if (timedOut) {
      const confirmedText = await confirmCompletedReply(page, expectedPrompt, previousAssistantState.text).catch(() => '');
      if (confirmedText) {
        updateQwenCompletionMetadata({ status: 'stable', softTimeout: false, source: 'ui_completion_confirmation', note: '' });
        await writeLogEntry({
          event: 'qwen_completion_confirmed_after_timeout',
          stage: 'ui_completion_confirmation',
          completionStatus: 'stable',
          extractedLength: confirmedText.length
        }).catch(() => {});
        return confirmedText;
      }
    }

    updateQwenCompletionMetadata({
      status: timedOut ? 'soft_timeout' : 'failed',
      softTimeout: timedOut,
      source: timedOut ? 'completion_wait' : 'completion_validation',
      note: String(error?.message || 'Qwen completion validation failed')
    });
    await writeLogEntry({
      event: timedOut ? 'qwen_completion_soft_timeout' : 'qwen_completion_validation_failed',
      stage: timedOut ? 'completion_wait' : 'completion_validation',
      completionStatus: timedOut ? 'soft_timeout' : 'fail',
      note: String(error?.message || 'Qwen completion validation failed'),
      extractedLength: diagnosticText.length
    }).catch(() => {});
    const excerpt = diagnosticText
      ? ` [excerpt=${summarizeValidationExcerpt(diagnosticText)}]`
      : '';
    throw new Error(`${timedOut ? 'Qwen completion wait timed out' : 'Qwen completion validation failed'}: ${String(error?.message || error)}${excerpt}`);
  }
}

export function resolveCompletionTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 30_000) return 120_000;
  const buffered = parsed - 10_000;
  return Math.max(120_000, buffered);
}

export function isUsefulAssistantCompletionText(previousText = '', text = '') {
  return Boolean(text && String(text).trim()) && String(text).trim() !== String(previousText || '').trim();
}

async function waitForGenerationComplete(page, previousAssistantState = { count: 0, text: '' }, expectedPrompt = '', timeoutMs = 120_000) {
  const startedAt = Date.now();
  let lastState = null;
  let stableBodyRounds = 0;
  let lastBodyText = '';
  let lastOcrAttemptAt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    lastState = await page.evaluate((previous) => {
      const isVisible = (node) => {
        if (!node) return false;
        const style = window.getComputedStyle(node);
        if (!style) return false;
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && node.getClientRects().length > 0;
      };

      const input = document.querySelector('textarea.message-input-textarea, textarea:not(.ime-text-area):not([readonly]), [contenteditable="true"], input[type="text"]');
      const promptReady = Boolean(input) && !input.hasAttribute('disabled') && input.getAttribute('aria-disabled') !== 'true' && !input.hasAttribute('readonly') && input.readOnly !== true;
      const visibleButtons = Array.from(document.querySelectorAll('button')).filter((button) => isVisible(button));
      const hasStopButton = visibleButtons.some((button) => /^(stop|stopp)$/iu.test((button.textContent || '').trim()) || /stop-generation/iu.test(button.getAttribute('data-testid') || '') || /stop/iu.test(button.getAttribute('aria-label') || '') || /stop/iu.test(button.getAttribute('title') || ''));
      const busyNode = Array.from(document.querySelectorAll('[aria-busy="true"], .loading, .streaming, .typing-indicator, [data-testid="stop-generation"]')).some((node) => isVisible(node));
      const hasCopyButton = visibleButtons.some((button) => /^(copy|kopieren)$/iu.test((button.textContent || '').trim()) || /copy/iu.test(button.getAttribute('data-testid') || '') || /copy/iu.test(button.getAttribute('aria-label') || '') || /copy/iu.test(button.getAttribute('title') || '')) || Array.from(document.querySelectorAll('[data-testid="copy"], button[title*="Copy" i], button[aria-label*="Copy" i]')).some((node) => isVisible(node));
      const bodyText = String(document.body?.innerText || '');
      const assistantNodes = Array.from(document.querySelectorAll(SELECTORS.assistantOutput.join(',')));
      const lastText = String(assistantNodes.at(-1)?.innerText || '').trim();
      const assistantChanged = assistantNodes.length > previous.count || (lastText.length > 0 && lastText !== previous.text);
      const responseActionsVisible = visibleButtons.some((button) => /^(thumbs\s*up|thumbs\s*down|share|retry|copy|kopieren)$/iu.test((button.textContent || '').trim()) || /thumbs|share|retry|copy|kopieren|mehr|options|optionen/iu.test(button.getAttribute('aria-label') || '') || /thumbs|share|retry|copy|kopieren|mehr|options|optionen/iu.test(button.getAttribute('title') || ''));
      return { hasStopButton, busyNode, hasCopyButton, bodyText, assistantChanged, responseActionsVisible, promptReady };
    }, previousAssistantState).catch(() => ({ hasStopButton: false, busyNode: false, hasCopyButton: false, bodyText: '', assistantChanged: false, responseActionsVisible: false, promptReady: false }));

    if (looksLikeQwenRateLimit(lastState.bodyText)) {
      throw new Error(`Qwen rate-limit page detected while waiting for generation to complete: ${summarizeRateLimitMessage(lastState.bodyText)}`);
    }

    const currentBodyText = String(lastState.bodyText || '').replace(/\r/gu, '').trim();
    if (currentBodyText && currentBodyText === lastBodyText) {
      stableBodyRounds += 1;
    } else {
      stableBodyRounds = 0;
      lastBodyText = currentBodyText;
    }

    if (!lastState.hasStopButton && !lastState.busyNode) {
      const extractedText = extractAssistantTextFromBodyText(lastState.bodyText, expectedPrompt);
      const usefulText = Boolean(extractedText && extractedText.trim()) && extractedText.trim() !== String(previousAssistantState.text || '').trim();

      if (lastState.promptReady && usefulText) {
        updateQwenCompletionMetadata({ status: 'stable', softTimeout: false, source: 'prompt_ready', note: '' });
        return extractedText;
      }
      if (lastState.hasCopyButton || lastState.responseActionsVisible || lastState.assistantChanged) {
        updateQwenCompletionMetadata({ status: 'stable', softTimeout: false, source: 'response_actions', note: '' });
        return extractedText;
      }
      if (stableBodyRounds >= 3) return extractedText;
    }

    if (Date.now() - startedAt >= 15_000 && Date.now() - lastOcrAttemptAt >= 15_000) {
      lastOcrAttemptAt = Date.now();
      const ocrText = await readPageTextViaOcr(page).catch(() => '');
      if (ocrText) {
        const extractedText = extractAssistantTextFromBodyText(ocrText, expectedPrompt);
        if (extractedText) {
          updateQwenCompletionMetadata({ status: 'stable', softTimeout: false, source: 'ocr', note: 'ocr_fallback' });
          return extractedText;
        }
      }
    }

    await page.waitForTimeout(1_000);
  }

  updateQwenCompletionMetadata({
    status: 'soft_timeout',
    softTimeout: true,
    source: 'generation_wait',
    note: `Timed out waiting for Qwen generation to complete after ${timeoutMs}ms.`
  });
  await writeLogEntry({
    event: 'qwen_completion_soft_timeout',
    stage: 'generation_wait',
    completionStatus: 'soft_timeout',
    timeoutMs
  }).catch(() => {});
  console.warn('[browser] Completion wait timed out; extracting current DOM state');
  return resolveCurrentAssistantText(page, expectedPrompt);
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

async function getLastAssistantText(page, expectedPrompt = '') {
  for (const selector of SELECTORS.assistantOutput) {
    const locator = page.locator(selector).last();
    if (await locator.count().catch(() => 0)) {
      const text = await locator.innerText().catch(() => '');
      const normalized = normalizeRenderedReplyText(text);
      if (normalized.trim()) return normalized.trim();
    }
  }

  const bodyText = await readPageBodyText(page).catch(() => '');
  return extractAssistantTextFromBodyText(bodyText, expectedPrompt);
}

async function resolveCurrentAssistantText(page, expectedPrompt = '') {
  const text = await getLastAssistantText(page, expectedPrompt).catch(() => '');
  if (text.trim()) return text.trim();
  const bodyText = await readPageBodyText(page).catch(() => '');
  return extractAssistantTextFromBodyText(bodyText, expectedPrompt);
}

async function confirmCompletedReply(page, expectedPrompt = '', previousText = '') {
  const uiState = await page.evaluate(() => {
    const isVisible = (node) => {
      if (!node) return false;
      const style = window.getComputedStyle(node);
      if (!style) return false;
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && node.getClientRects().length > 0;
    };

    const input = document.querySelector('textarea.message-input-textarea, textarea:not(.ime-text-area):not([readonly]), [contenteditable="true"], input[type="text"]');
    const promptReady = Boolean(input) && !input.hasAttribute('disabled') && input.getAttribute('aria-disabled') !== 'true' && !input.hasAttribute('readonly') && input.readOnly !== true;
    const visibleButtons = Array.from(document.querySelectorAll('button')).filter((button) => isVisible(button));
    const hasStopButton = visibleButtons.some((button) => /^(stop|stopp)$/iu.test((button.textContent || '').trim()) || /stop-generation/iu.test(button.getAttribute('data-testid') || '') || /stop/iu.test(button.getAttribute('aria-label') || '') || /stop/iu.test(button.getAttribute('title') || ''));
    const busyNode = Array.from(document.querySelectorAll('[aria-busy="true"], .loading, .streaming, .typing-indicator, [data-testid="stop-generation"]')).some((node) => isVisible(node));
    const hasCopyButton = visibleButtons.some((button) => /^(copy|kopieren)$/iu.test((button.textContent || '').trim()) || /copy/iu.test(button.getAttribute('data-testid') || '') || /copy/iu.test(button.getAttribute('aria-label') || '') || /copy/iu.test(button.getAttribute('title') || ''));
    const responseActionsVisible = visibleButtons.some((button) => /^(thumbs\s*up|thumbs\s*down|share|retry|copy|kopieren)$/iu.test((button.textContent || '').trim()) || /thumbs|share|retry|copy|kopieren|mehr|options|optionen/iu.test(button.getAttribute('aria-label') || '') || /thumbs|share|retry|copy|kopieren|mehr|options|optionen/iu.test(button.getAttribute('title') || ''));
    const bodyText = String(document.body?.innerText || '');
    const thinkingFinished = /habe\s+fertig\s+gedacht|finished\s+thinking/iu.test(bodyText);
    return { promptReady, hasStopButton, busyNode, hasCopyButton, responseActionsVisible, thinkingFinished, bodyText };
  }).catch(() => ({ promptReady: false, hasStopButton: false, busyNode: false, hasCopyButton: false, responseActionsVisible: false, thinkingFinished: false, bodyText: '' }));

  if (looksLikeQwenRateLimit(uiState.bodyText)) {
    throw new Error(`Qwen rate-limit page detected after send: ${summarizeRateLimitMessage(uiState.bodyText)}`);
  }

  const text = await resolveCurrentAssistantText(page, expectedPrompt).catch(() => '');
  const usefulText = isUsefulAssistantCompletionText(previousText, text);
  const completionProven = uiState.promptReady
    && !uiState.hasStopButton
    && !uiState.busyNode
    && (uiState.hasCopyButton || uiState.responseActionsVisible || uiState.thinkingFinished || usefulText);
  if (!completionProven) return '';

  const result = { text, timedOut: false, source: 'ui_completion_confirmation', durationMs: 0 };
  assertCompleteReply(result);
  return result.text;
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

async function waitForAssistantTextToStabilize(page, previousText = '', options = {}) {
  const timeoutMs = Number(options.timeoutMs || 60_000);
  const pollMs = Number(options.pollMs || 1_000);
  const stableRoundsNeeded = Number(options.stableRoundsNeeded || 3);
  const expectedPrompt = String(options.expectedPrompt || '').trim();
  const startedAt = Date.now();
  let stableRounds = 0;
  let lastSeen = previousText;

  while (Date.now() - startedAt < timeoutMs) {
    const current = await getLastAssistantText(page, expectedPrompt).catch(() => '');
    if (!current || current === previousText) {
      stableRounds = 0;
      lastSeen = current || lastSeen;
      await page.waitForTimeout(pollMs);
      continue;
    }

    if (current === lastSeen) {
      stableRounds += 1;
      if (stableRounds >= stableRoundsNeeded) return current;
    } else {
      stableRounds = 1;
      lastSeen = current;
    }

    await page.waitForTimeout(pollMs);
  }

  updateQwenCompletionMetadata({
    status: 'soft_timeout',
    softTimeout: true,
    source: 'assistant_stabilization',
    note: `Timed out waiting for Qwen assistant text to stabilize after ${timeoutMs}ms.`
  });
  await writeLogEntry({
    event: 'qwen_completion_soft_timeout',
    stage: 'assistant_stabilization',
    completionStatus: 'soft_timeout',
    timeoutMs
  }).catch(() => {});
  console.warn('[browser] Assistant text stabilization timed out; extracting current DOM state');
  return resolveCurrentAssistantText(page, expectedPrompt);
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

async function readPageBodyText(page) {
  return await page.locator('body').innerText().catch(() => '');
}

async function readPageTextViaOcr(page) {
  const screenshotPath = await captureScreenshot(page, 'wait-for-generation-complete-ocr');
  const output = execFileSync('tesseract', [screenshotPath, 'stdout', '--psm', '11'], { encoding: 'utf8' });
  return String(output || '').trim();
}

function normalizeBodyText(text) {
  return String(text || '').replace(/\r/gu, '').trim();
}

function extractAssistantTextFromBodyText(bodyText, prompt = '') {
  const normalizedBody = normalizeBodyText(bodyText);
  if (!normalizedBody) return '';

  const normalizedPrompt = normalizeBodyText(prompt);
  if (!normalizedPrompt) return normalizedBody;

  const promptIndex = normalizedBody.lastIndexOf(normalizedPrompt);
  if (promptIndex < 0) return normalizedBody;

  const afterPrompt = normalizedBody.slice(promptIndex + normalizedPrompt.length).trim();
  if (!afterPrompt) return normalizedBody;

  return normalizeRenderedReplyText(stripAssistantUiNoise(afterPrompt));
}

function stripAssistantUiNoise(text) {
  const lines = String(text || '')
    .split(/\r?\n/u)
    .map((line) => line.trimEnd());

  while (lines.length) {
    const last = lines.at(-1)?.trim() || '';
    if (!last) {
      lines.pop();
      continue;
    }

    if (/^(copy|kopieren|thumbs up|thumbs down|share|retry|more options|mehr optionen|optionen)$/iu.test(last)) {
      lines.pop();
      continue;
    }

    break;
  }

  return lines.join('\n').trim();
}

function summarizeRateLimitMessage(text) {
  return String(text || '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 240);
}

function summarizeValidationExcerpt(text) {
  return JSON.stringify(stripAssistantUiNoise(String(text || '').replace(/\s+/gu, ' ').trim()).slice(0, 200));
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
