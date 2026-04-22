import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const QWEN_URL = 'https://chat.qwen.ai';
// Centralized selector map so UI changes stay localized.
export const SELECTORS = {
  newChat: ['button:has-text("New Chat")', 'button:has-text("Neuer Chat")', '[data-testid="new-chat"]'],
  modelMenu: ['button:has-text("Model")', 'button:has-text("Modell")', '[data-testid="model-selector"]'],
  promptInput: ['textarea', '[contenteditable="true"]', 'input[type="text"]', 'textarea[aria-label*="message" i]', 'input[aria-label*="prompt" i]'],
  sendButton: ['button[type="submit"]', 'button[aria-label*="send" i]', 'button:has-text("Send")', 'button:has-text("Senden")'],
  assistantOutput: ['[data-role="assistant"] .markdown-body', '[data-message-author-role="assistant"]', '.message-content', '.chat-message .content']
};

export async function runQwenSession(input, maxTurns = 5) {
  // The live run always uses the real local Chrome Default profile.
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

    // The first prompt contains full repo context; follow-ups focus on forcing completion.
    let currentPrompt = buildSessionPrompt(input);
    let finalResponse = '';

    for (let turn = 1; turn <= maxTurns; turn += 1) {
      const inputBox = await findPromptInput(page);
      if (!inputBox) {
        throw new Error('Qwen prompt input not found in the Chrome Default profile session.');
      }

      await enterPrompt(inputBox, currentPrompt);
      await submitPrompt(page);
      await waitForStreamingDone(page);

      const responseText = await getLastAssistantText(page);
      if (!responseText) {
        throw new Error('No assistant response could be extracted from the Qwen UI.');
      }

      finalResponse = responseText;
      const status = extractStatus(responseText);
      if (status === 'final') break;

      currentPrompt = status === 'draft'
        ? 'Refine the previous answer to production-ready quality. Return complete files only and end with {"status":"final"}.'
        : 'Continue, complete the implementation, and end with {"status":"final"}.';
    }

    return finalResponse;
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
  return runQwenSession(input, 1);
}

export function buildPromptPayload(context) {
  // Keep payload generation deterministic so logs and snapshots are easier to compare.
  return typeof context === 'string' ? context : JSON.stringify(context, null, 2);
}

export function buildSessionPrompt(input) {
  const payload = buildPromptPayload(input);
  return typeof input === 'string'
    ? payload
    : `${payload}\n\nRules: return complete production-ready code only, and end with {"status":"draft"|"final"}.`;
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
        // In attach mode the tab belongs to the operator's existing Chrome session.
        // Leave it open so smoke checks do not briefly flash a useful tab and then close it.
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
      await button.click().then(() => { result.clicked = true; }).catch(() => {});
      await page.waitForTimeout(500);
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
      await button.click().catch(() => {});
      await page.waitForTimeout(500);
      // Keep the model selection conservative to avoid breaking on small UI label changes.
      const target = page.locator('text=Qwen 3.6 Max Preview, text=Qwen3.6-Max-Preview').first();
      if (await target.count().catch(() => 0)) {
        result.modelFound = true;
        await target.click().then(() => { result.modelClicked = true; }).catch(() => {});
      }
      return result;
    }
  }

  return result;
}

async function findPromptInput(page) {
  for (const selector of SELECTORS.promptInput) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) return locator;
  }

  return null;
}

async function enterPrompt(input, prompt) {
  // Support both normal text fields and rich editable areas.
  const isTextField = await input.evaluate((node) => {
    const tag = node.tagName.toLowerCase();
    return tag === 'textarea' || tag === 'input';
  });

  if (isTextField) {
    await input.fill(prompt);
    return;
  }

  await input.click();
  await input.type(prompt, { delay: 4 });
}

async function submitPrompt(page) {
  // Prefer explicit send buttons, then fall back to Enter for UIs without buttons.
  const sendButtons = page.locator(SELECTORS.sendButton.join(', '));
  if (await sendButtons.count().catch(() => 0)) {
    await sendButtons.first().click();
    return;
  }

  await page.keyboard.press('Enter');
}

async function waitForStreamingDone(page) {
  // Wait for the obvious streaming indicators to disappear before reading the reply.
  await page.waitForTimeout(2_000);
  await page.waitForFunction(() => {
    const hasStopButton = Array.from(document.querySelectorAll('button'))
      .some((button) => /^(stop|stopp)$/iu.test((button.textContent || '').trim()) || /stop-generation/iu.test(button.getAttribute('data-testid') || ''));
    const busyNode = document.querySelector('[aria-busy="true"], .loading, .streaming, .typing-indicator, [data-testid="stop-generation"]');

    return !hasStopButton && !busyNode;
  }, { timeout: 300_000, polling: 1_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
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
