#!/usr/bin/env node
// Postinstall patch: suppress Browser.setDownloadBehavior in Playwright's CDP connection
import fs from 'node:fs';
import path from 'node:path';

// Find crBrowser.js in pnpm store or direct node_modules
const paths = [
  'node_modules/playwright-core/lib/server/chromium/crBrowser.js',
  'node_modules/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/lib/server/chromium/crBrowser.js',
];
const crPath = paths.find(p => fs.existsSync(p));

if (!crPath) {
  console.log('[patch] crBrowser.js not found, searching...');
  const { execSync } = await import('child_process');
  const found = execSync('find node_modules -name crBrowser.js -path "*/chromium/*"').toString().trim();
  if (found) {
    console.log('[patch] Found at:', found);
    await import('./patch-playwright.mjs'); // can't easily re-run
  }
  process.exit(0);
}

let src = fs.readFileSync(crPath, 'utf8');
const target = `if (this._browser.options.name !== "clank" && this._options.acceptDownloads !== "internal-browser-default") {`;
const replacement = `if (false) {`;

if (src.includes(target)) {
  src = src.replace(target, replacement);
  fs.writeFileSync(crPath, src, 'utf8');
  console.log('[patch] ✓ Browser.setDownloadBehavior suppressed');
} else {
  console.log('[patch] Pattern not found, already patched or playwright version changed');
}
