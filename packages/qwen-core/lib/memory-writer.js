import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export async function atomicWriteJson(filePath, data) {
  const targetPath = String(filePath || '').trim();
  if (!targetPath) throw new Error('Atomic memory write failed: missing target path');

  const dir = path.dirname(targetPath);
  const tmpFile = path.join(dir, `.tmp-${path.basename(targetPath)}-${process.pid}`);

  try {
    await fs.mkdir(dir, { recursive: true });
    const payload = `${JSON.stringify(data, null, 2)}${os.EOL}`;
    await fs.writeFile(tmpFile, payload, { encoding: 'utf8', mode: 0o644 });
    await fs.rename(tmpFile, targetPath);
  } catch (error) {
    await fs.unlink(tmpFile).catch(() => {});
    throw new Error(`Atomic memory write failed: ${error?.message || String(error)}`);
  }
}
