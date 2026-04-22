import fs from 'node:fs/promises';

export function resolveLogFile() {
  // Logging is opt-in so local runs do not create surprise files.
  return process.env.SIN_OMO_QWEN_LOG_FILE || '';
}

export async function writeLogEntry(entry, logFile = resolveLogFile()) {
  // JSONL keeps logs append-only and easy to parse with shell tools later.
  if (!logFile) return;

  const line = `${JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry
  })}\n`;

  await fs.appendFile(logFile, line, 'utf8');
}
