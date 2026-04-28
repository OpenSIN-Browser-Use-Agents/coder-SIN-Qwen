const MAX_SIZE_PER_FILE = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain', 'text/html', 'text/javascript', 'text/markdown', 'text/x-log', 'text/css', 'text/csv',
  'application/json', 'application/xml', 'application/x-javascript', 'application/typescript',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
];
const BLOCKED_MIME_TYPES = ['application/octet-stream', 'application/x-executable', 'application/x-sh'];

export class AttachmentValidator {
  constructor(options = {}) {
    this.maxSizePerFile = options.maxSizePerFile || MAX_SIZE_PER_FILE;
    this.maxTotalSize = options.maxTotalSize || MAX_TOTAL_SIZE;
  }

  validate(file) {
    const errors = [];
    if (!file || !file.path) return { valid: false, errors: ['File must have a path'] };
    if (file.size > this.maxSizePerFile) {
      errors.push(`File ${file.path} exceeds max size of ${this.maxSizePerFile / 1024 / 1024}MB (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
    }
    if (file.mime && BLOCKED_MIME_TYPES.includes(file.mime)) {
      errors.push(`File ${file.path} has blocked MIME type: ${file.mime}`);
    }
    if (file.mime && !ALLOWED_MIME_TYPES.includes(file.mime) && !file.mime.startsWith('text/')) {
      errors.push(`File ${file.path} has unrecognized MIME type: ${file.mime}`);
    }
    return { valid: errors.length === 0, errors };
  }

  validateBatch(files) {
    const results = files.map((f) => ({ file: f, ...this.validate(f) }));
    const validFiles = results.filter((r) => r.valid).map((r) => r.file);
    const totalSize = validFiles.reduce((s, f) => s + (f.size || 0), 0);
    if (totalSize > this.maxTotalSize) {
      results.push({ file: null, valid: false, errors: [`Total attachment size ${(totalSize / 1024 / 1024).toFixed(1)}MB exceeds max ${this.maxTotalSize / 1024 / 1024}MB`] });
      return { valid: false, files: results, validFiles: [], totalSize };
    }
    return { valid: validFiles.length === files.length, files: results, validFiles, totalSize };
  }
}

export function createAttachmentValidator(options = {}) {
  return new AttachmentValidator(options);
}

export class AttachmentUploader {
  #maxRetries;
  #retryDelay;

  constructor(options = {}) {
    this.#maxRetries = options.maxRetries || 2;
    this.#retryDelay = options.retryDelay || 1000;
  }

  async upload(page, filePath, options = {}) {
    let lastError = null;
    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      try {
        const input = page.locator('input[type="file"]');
        await input.setInputFiles(filePath);
        return { ok: true, attempt: attempt + 1 };
      } catch (error) {
        lastError = error;
        if (attempt < this.#maxRetries) {
          await new Promise((r) => setTimeout(r, this.#retryDelay * (attempt + 1)));
        }
      }
    }
    return { ok: false, attempt: this.#maxRetries + 1, error: lastError?.message || 'Upload failed' };
  }

  async uploadBatch(page, files) {
    const results = [];
    for (const file of files) {
      const result = await this.upload(page, file.path);
      results.push({ file: file.path, ...result });
    }
    return results;
  }
}

export function createAttachmentUploader(options = {}) {
  return new AttachmentUploader(options);
}
