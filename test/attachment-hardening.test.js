import test from 'node:test';
import assert from 'node:assert/strict';
import { AttachmentValidator, createAttachmentValidator, AttachmentUploader, createAttachmentUploader } from '../packages/qwen-core/lib/attachment-hardening.js';

test('AttachmentValidator rejects file without path', () => {
  const v = new AttachmentValidator();
  const result = v.validate({});
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('AttachmentValidator rejects oversized file', () => {
  const v = new AttachmentValidator({ maxSizePerFile: 100 });
  const result = v.validate({ path: '/big.pdf', size: 200 });
  assert.equal(result.valid, false);
  assert.ok(result.errors[0].includes('exceeds max size'));
});

test('AttachmentValidator accepts valid file', () => {
  const v = new AttachmentValidator();
  const result = v.validate({ path: '/small.txt', size: 500, mime: 'text/plain' });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('AttachmentValidator rejects blocked MIME types', () => {
  const v = new AttachmentValidator();
  const result = v.validate({ path: '/bad.exe', size: 100, mime: 'application/x-executable' });
  assert.equal(result.valid, false);
  assert.ok(result.errors[0].includes('blocked MIME type'));
});

test('AttachmentValidator handles missing mime gracefully', () => {
  const v = new AttachmentValidator();
  const result = v.validate({ path: '/no-mime.log', size: 100 });
  assert.equal(result.valid, true);
});

test('AttachmentValidator.validateBatch returns valid files', () => {
  const v = new AttachmentValidator({ maxSizePerFile: 1000 });
  const result = v.validateBatch([
    { path: '/a.txt', size: 100, mime: 'text/plain' },
    { path: '/b.txt', size: 200, mime: 'text/plain' },
  ]);
  assert.equal(result.valid, true);
  assert.equal(result.validFiles.length, 2);
});

test('AttachmentValidator.validateBatch filters invalid files', () => {
  const v = new AttachmentValidator({ maxSizePerFile: 100 });
  const result = v.validateBatch([
    { path: '/small.txt', size: 50, mime: 'text/plain' },
    { path: '/huge.txt', size: 200, mime: 'text/plain' },
  ]);
  assert.equal(result.valid, false);
  assert.equal(result.validFiles.length, 1);
});

test('AttachmentValidator.validateBatch checks total size', () => {
  const v = new AttachmentValidator({ maxTotalSize: 200, maxSizePerFile: 200 });
  const result = v.validateBatch([
    { path: '/a.txt', size: 150, mime: 'text/plain' },
    { path: '/b.txt', size: 100, mime: 'text/plain' },
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.files.some((f) => !f.valid));
});

test('createAttachmentValidator is factory', () => {
  const v = createAttachmentValidator();
  assert.ok(v instanceof AttachmentValidator);
});

test('AttachmentUploader.upload returns error without page', async () => {
  const u = new AttachmentUploader({ maxRetries: 1 });
  const result = await u.upload(null, '/test.txt');
  assert.equal(result.ok, false);
});

test('AttachmentUploader.uploadBatch returns results array', async () => {
  const u = new AttachmentUploader();
  const results = await u.uploadBatch(null, [{ path: '/a.txt' }, { path: '/b.txt' }]);
  assert.ok(Array.isArray(results));
  assert.equal(results.length, 2);
});

test('createAttachmentUploader is factory', () => {
  const u = createAttachmentUploader();
  assert.ok(u instanceof AttachmentUploader);
});
