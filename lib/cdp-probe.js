export async function probeCdpEndpoint(cdpUrl, timeoutMs = 2500, options = {}) {
  const startedAt = Date.now();
  const normalizedUrl = String(cdpUrl || '').trim().replace(/\/+$/u, '');
  if (!normalizedUrl) {
    return { ok: false, latencyMs: 0, url: '', error: new Error('Missing CDP URL') };
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return { ok: false, latencyMs: 0, url: normalizedUrl, error: new Error('Fetch API is unavailable') };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timeout.unref === 'function') timeout.unref();

  try {
    const response = await fetchImpl(`${normalizedUrl}/json/version`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    return {
      ok: response.ok,
      latencyMs: Date.now() - startedAt,
      url: normalizedUrl,
      status: response.status,
      payload,
      error: response.ok ? null : new Error(`CDP probe returned HTTP ${response.status}`)
    };
  } catch (error) {
    const normalizedError = error?.name === 'AbortError'
      ? new Error(`CDP probe timed out after ${timeoutMs}ms: ${normalizedUrl}`)
      : error;
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      url: normalizedUrl,
      error: normalizedError
    };
  } finally {
    clearTimeout(timeout);
  }
}
