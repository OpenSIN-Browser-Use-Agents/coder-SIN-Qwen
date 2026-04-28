export function computeDomHash(doc) {
  if (!doc || typeof doc !== 'object') return '';
  const parts = [];
  const relevant = doc.querySelectorAll
    ? doc.querySelectorAll('[class*="chat"], [class*="message"], [class*="input"], [class*="send"], [class*="auth"], [class*="login"], [data-testid], [role="dialog"], [role="button"], textarea, button, [contenteditable]')
    : [];
  for (const el of relevant) {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    const classes = (el.className && typeof el.className === 'string') ? el.className.split(/\s+/).filter(Boolean).sort().slice(0, 3).join('.') : '';
    const visible = el.offsetParent !== null;
    const text = (el.textContent || '').trim().slice(0, 30);
    const key = el.dataset?.testid || el.id || '';
    parts.push(`${tag}#${key}.${classes}:${visible ? 'V' : 'H'}:${text}`);
  }
  const hash = parts.join('|');
  if (!hash) return '';
  let h = 0;
  for (let i = 0; i < hash.length; i += 1) {
    h = ((h << 5) - h) + hash.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

export function compareDomHashes(expected, actual) {
  if (!expected && !actual) return { match: true, drift: 'none' };
  if (!expected) return { match: false, drift: 'first_hash' };
  if (!actual) return { match: false, drift: 'missing_hash' };
  if (expected === actual) return { match: true, drift: 'none' };
  return { match: false, drift: 'changed' };
}
