import fs from 'node:fs';

const paths = [
  'node_modules/playwright-core/lib/server/chromium/crBrowser.js',
  ...fs.readdirSync('node_modules/.pnpm')
    .filter(d => d.startsWith('playwright-core@'))
    .map(d => `node_modules/.pnpm/${d}/node_modules/playwright-core/lib/server/chromium/crBrowser.js`)
];

for (const p of paths) {
  if (!fs.existsSync(p)) continue;
  let src = fs.readFileSync(p, 'utf8');
  const original = 'if (this._browser.options.name !== "clank" && this._options.acceptDownloads !== "internal-browser-default") {';
  const replacement = 'if (false) {';
  if (src.includes(original)) {
    src = src.replace(original, replacement);
    fs.writeFileSync(p, src, 'utf8');
    console.log(`✓ Patched: ${p}`);
  } else if (src.includes(replacement)) {
    console.log(`- Already patched: ${p}`);
  } else {
    console.log(`? Pattern not found in: ${p}`);
  }
}
