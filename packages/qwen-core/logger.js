import fs from 'node:fs/promises';
import { getScopedEnv } from './runtime-config.js';
import { tracePayload } from './trace.js';

export function resolveLogFile() {
  // Logging is opt-in so local runs do not create surprise files.
  return getScopedEnv('LOG_FILE', '');
}

export async function writeLogEntry(entry, logFile = resolveLogFile()) {
  // JSONL keeps logs append-only and easy to parse with shell tools later.
  if (!logFile) return;

  const line = `${JSON.stringify({
    timestamp: new Date().toISOString(),
    ...tracePayload(),
    ...entry
  })}\n`;

  await fs.appendFile(logFile, line, 'utf8');
}
