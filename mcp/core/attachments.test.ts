import { describe, expect, it } from 'vitest';

import {
  attachmentReplayRefusal,
  base64ByteLength,
  inferMimeType,
  MAX_ATTACHMENT_BYTES,
  normalizeBase64Payload,
  normalizeMimeType,
  prepareAttachmentUpload,
  sanitizeAttachmentFileName,
  sha256FromBase64
} from './attachments.mjs';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * The file name is the only part of an upload that decides where bytes land, so
 * it is where a traversal attempt would have to succeed. Everything before the
 * last separator is dropped before the name is ever judged.
 */
describe('file name sanitising', () => {
  it('keeps ordinary names, including spaces and Unicode', () => {
    expect(sanitizeAttachmentFileName('approved landing page.png')).toBe('approved landing page.png');
    expect(sanitizeAttachmentFileName('ontwerp — vóórstel (v2).pdf')).toBe('ontwerp — vóórstel (v2).pdf');
    expect(sanitizeAttachmentFileName('  notes.md  ')).toBe('notes.md');
  });

  it('collapses any path to its last segment', () => {
    expect(sanitizeAttachmentFileName('../../../etc/passwd')).toBe('passwd');
    expect(sanitizeAttachmentFileName('C:\\Windows\\System32\\drivers\\etc\\hosts')).toBe('hosts');
    expect(sanitizeAttachmentFileName('nested/folder/report.pdf')).toBe('report.pdf');
  });

  it('refuses names that cannot become a real file', () => {
    expect(() => sanitizeAttachmentFileName('')).toThrow();
    expect(() => sanitizeAttachmentFileName('   ')).toThrow();
    expect(() => sanitizeAttachmentFileName('..')).toThrow();
    expect(() => sanitizeAttachmentFileName('folder/')).toThrow();
    expect(() => sanitizeAttachmentFileName('rapport\u0000.pdf')).toThrow();
    expect(() => sanitizeAttachmentFileName('what?.png')).toThrow();
    expect(() => sanitizeAttachmentFileName('trailing.')).toThrow();
    expect(() => sanitizeAttachmentFileName('NUL.txt')).toThrow(/reserved/);
    expect(() => sanitizeAttachmentFileName(`${'a'.repeat(200)}.png`)).toThrow(/180/);
  });
});

describe('media types', () => {
  it('derives the stored type from the extension', () => {
    expect(inferMimeType('render.PNG')).toBe('image/png');
    expect(inferMimeType('brief.pdf')).toBe('application/pdf');
    expect(inferMimeType('notes.md')).toBe('text/markdown');
    expect(inferMimeType('archive.unknown')).toBe('application/octet-stream');
  });

  it('never lets an upload announce itself as runnable content', () => {
    expect(inferMimeType('setup.exe')).toBe('application/octet-stream');
    expect(normalizeMimeType('text/javascript', 'payload.js')).toBe('application/octet-stream');
    expect(normalizeMimeType('application/x-msdownload', 'setup.bat')).toBe('application/octet-stream');
  });

  it('falls back to the extension when the caller sends nonsense', () => {
    expect(normalizeMimeType('', 'render.png')).toBe('image/png');
    expect(normalizeMimeType('not a mime type', 'render.png')).toBe('image/png');
    expect(normalizeMimeType('image/webp; charset=binary', 'render.png')).toBe('image/webp');
  });
});

describe('payload validation', () => {
  it('reports the exact decoded size', () => {
    expect(base64ByteLength('QQ==')).toBe(1);
    expect(base64ByteLength('QUI=')).toBe(2);
    expect(base64ByteLength('QUJD')).toBe(3);
    expect(normalizeBase64Payload(PNG_BASE64).byteLength).toBe(70);
  });

  it('accepts a data URL and reports its media type', () => {
    const payload = normalizeBase64Payload(`data:image/png;base64,${PNG_BASE64}`);
    expect(payload.base64).toBe(PNG_BASE64);
    expect(payload.dataUrlMimeType).toBe('image/png');
  });

  it('tolerates line wrapping introduced in transport', () => {
    expect(normalizeBase64Payload('QUJD\nRUZH\n').base64).toBe('QUJDRUZH');
  });

  it('refuses malformed, empty and oversized payloads', () => {
    expect(() => normalizeBase64Payload('')).toThrow();
    expect(() => normalizeBase64Payload('not base64!!')).toThrow(/valid base64/);
    expect(() => normalizeBase64Payload('QUJ')).toThrow(/valid base64/);
    expect(() => normalizeBase64Payload('data:image/png,abcd')).toThrow(/base64 encoded/);
    expect(() => normalizeBase64Payload('QUJD', { maxBytes: 2 })).toThrow(/larger than/);
  });

  it('caps an attachment at the same size the desktop app allows', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe('upload preparation', () => {
  it('produces verifiable metadata without writing anything', async () => {
    const upload = await prepareAttachmentUpload({
      blockId: 'block-1',
      data: PNG_BASE64,
      fileName: 'design/approved landing page.png',
      agentId: 'claude-code',
      requestId: 'upload-1'
    });
    expect(upload.fileName).toBe('approved landing page.png');
    expect(upload.fileType).toBe('image/png');
    expect(upload.fileSize).toBe(70);
    expect(upload.sha256).toBe(await sha256FromBase64(PNG_BASE64));
    expect(upload.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('insists on the identity and the retry key', async () => {
    const base = { data: PNG_BASE64, fileName: 'a.png', agentId: 'claude-code', requestId: 'upload-1' };
    await expect(prepareAttachmentUpload({ ...base, agentId: '' })).rejects.toThrow(/agentId/);
    await expect(prepareAttachmentUpload({ ...base, requestId: '' })).rejects.toThrow(/requestId/);
  });
});

/**
 * A retry after an uncertain response must be free, and must never be a way to
 * quietly replace what an earlier call already stored.
 */
describe('repeated requestId', () => {
  const upload = {
    fileName: 'render.png',
    fileType: 'image/png',
    base64: PNG_BASE64,
    fileSize: 70,
    sha256: 'a'.repeat(64),
    agentId: 'claude-code',
    requestId: 'upload-1'
  };

  it('treats identical content as a replay', () => {
    expect(attachmentReplayRefusal({ fileName: 'render.png', fileSize: 70, sha256: 'a'.repeat(64) }, upload)).toBeNull();
  });

  it('refuses a different file under the same requestId', () => {
    expect(attachmentReplayRefusal({ fileName: 'other.png', fileSize: 70, sha256: 'a'.repeat(64) }, upload)).toMatch(/new requestId/);
    expect(attachmentReplayRefusal({ fileName: 'render.png', fileSize: 71, sha256: 'a'.repeat(64) }, upload)).toMatch(/new requestId/);
    expect(attachmentReplayRefusal({ fileName: 'render.png', fileSize: 70, sha256: 'b'.repeat(64) }, upload)).toMatch(/new requestId/);
  });
});
