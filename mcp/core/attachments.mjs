/**
 * Attachment upload validation.
 *
 * Shared domain core: this module is imported both by the renderer/bridge path
 * (`src/mcp/bridge.ts`) and by the standalone Node MCP server
 * (`mcp/direct-store.mjs`, `mcp/server.mjs`), so it must stay free of DOM and
 * Node APIs. The only platform primitive it relies on is WebCrypto, which both
 * Node 22 and the Electron renderer expose as `globalThis.crypto.subtle`.
 *
 * Transfer decision for binary uploads: a single bounded payload, no chunking.
 * The MCP tool takes either a local `sourcePath` that the stdio server reads
 * itself, or an inline base64 `data` string. Both routes end here as one base64
 * string capped at MAX_ATTACHMENT_BYTES, the same ceiling the desktop app and
 * the Electron attachment IPC already enforce. Chunking would need a resumable
 * session and a second write path beside the normal attachment store; a 25 MB
 * single shot stays inside the bridge request limit and covers the documents,
 * images and PDFs attachments are meant for.
 *
 * @module
 */

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENT_FILE_NAME_LENGTH = 180;

/** @type {Record<string, string>} */
const MIME_TYPES_BY_EXTENSION = {
  '.bmp': 'image/bmp',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.svg': 'image/svg+xml',
  '.tsv': 'text/tab-separated-values',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xml': 'application/xml',
  '.zip': 'application/zip'
};

/**
 * Extensions whose stored bytes are never handed back as active content.
 * Anything not listed keeps `application/octet-stream`, so a viewer treats it
 * as an opaque download rather than something to run.
 */
const EXECUTABLE_EXTENSIONS = new Set([
  '.bat', '.chm', '.cmd', '.com', '.cpl', '.dll', '.exe', '.hta', '.jar', '.js',
  '.jse', '.lnk', '.msi', '.msc', '.ps1', '.reg', '.scr', '.sh', '.vb', '.vbe',
  '.vbs', '.wsf', '.wsh'
]);

const WINDOWS_RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
]);

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const ILLEGAL_FILE_NAME_CHARACTERS = /[<>:"|?*]/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const DATA_URL_PREFIX = /^data:([^;,]*)(;[^,]*)?,/i;

/**
 * @param {string} fileName
 * @returns {string} the lowercase extension including the dot, or ''
 */
export function attachmentExtension(fileName) {
  const name = String(fileName ?? '');
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot).toLowerCase();
}

/**
 * Maps a file name onto the media type DeepScribe stores with the attachment.
 * Unknown and executable extensions stay `application/octet-stream`.
 * @param {string} fileName
 * @returns {string}
 */
export function inferMimeType(fileName) {
  const extension = attachmentExtension(fileName);
  if (EXECUTABLE_EXTENSIONS.has(extension)) return 'application/octet-stream';
  return MIME_TYPES_BY_EXTENSION[extension] || 'application/octet-stream';
}

/**
 * Normalizes a caller-supplied media type. An empty, malformed or active type
 * falls back to what the extension says, so an upload can never announce itself
 * as something a preview would execute.
 * @param {string | undefined | null} rawType
 * @param {string} fileName
 * @returns {string}
 */
export function normalizeMimeType(rawType, fileName) {
  const inferred = inferMimeType(fileName);
  const candidate = String(rawType ?? '').trim().toLowerCase().split(';')[0].trim();
  if (!candidate) return inferred;
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(candidate)) return inferred;
  if (EXECUTABLE_EXTENSIONS.has(attachmentExtension(fileName))) return 'application/octet-stream';
  return candidate;
}

/**
 * Reduces caller input to a single safe file name.
 *
 * Every directory separator is dropped before validation, so `../../secrets` and
 * `C:\Windows\system32\x` both collapse to their last segment and can never
 * steer the write out of the managed attachments folder.
 *
 * @param {unknown} rawName
 * @returns {string}
 * @throws {Error} when nothing usable remains
 */
export function sanitizeAttachmentFileName(rawName) {
  const input = String(rawName ?? '').normalize('NFC').trim();
  if (!input) throw new Error('fileName is required.');
  if (CONTROL_CHARACTERS.test(input)) throw new Error('fileName cannot contain control characters.');

  const segments = input.split(/[\\/]+/);
  const name = segments[segments.length - 1].trim();
  if (!name || name === '.' || name === '..') throw new Error('fileName does not contain a usable file name.');
  if (ILLEGAL_FILE_NAME_CHARACTERS.test(name)) throw new Error('fileName cannot contain any of < > : " | ? *');
  if (/[. ]$/.test(name)) throw new Error('fileName cannot end with a dot or a space.');
  if (name.length > MAX_ATTACHMENT_FILE_NAME_LENGTH) {
    throw new Error(`fileName can contain no more than ${MAX_ATTACHMENT_FILE_NAME_LENGTH} characters.`);
  }

  const stem = (name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name).toLowerCase();
  if (WINDOWS_RESERVED_NAMES.has(stem)) throw new Error(`“${name}” is a reserved file name on Windows.`);

  return name;
}

/**
 * The exact decoded size of a base64 string, without materializing the bytes.
 * @param {string} base64
 * @returns {number}
 */
export function base64ByteLength(base64) {
  const length = base64.length;
  if (length === 0) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (length / 4) * 3 - padding;
}

/**
 * Validates an inline payload and reports the size it will occupy on disk.
 * Accepts a bare base64 string or a `data:` URL; whitespace from wrapped
 * transport is removed first.
 *
 * @param {unknown} rawData
 * @param {{ maxBytes?: number }} [options]
 * @returns {{ base64: string; byteLength: number; dataUrlMimeType: string | null }}
 * @throws {Error} on malformed or oversized input
 */
export function normalizeBase64Payload(rawData, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_ATTACHMENT_BYTES;
  const input = String(rawData ?? '');
  if (!input.trim()) throw new Error('data is required and must contain the file as base64.');

  let dataUrlMimeType = null;
  let body = input;
  const dataUrl = DATA_URL_PREFIX.exec(input);
  if (dataUrl) {
    if (!/;base64/i.test(dataUrl[2] || '')) throw new Error('A data: URL must be base64 encoded.');
    dataUrlMimeType = dataUrl[1].trim().toLowerCase() || null;
    body = input.slice(dataUrl[0].length);
  }

  const base64 = body.replace(/\s+/g, '');
  if (!base64) throw new Error('data is required and must contain the file as base64.');
  if (base64.length % 4 !== 0 || !BASE64_PATTERN.test(base64)) throw new Error('data is not valid base64.');

  const byteLength = base64ByteLength(base64);
  if (byteLength === 0) throw new Error('data decodes to an empty file.');
  if (byteLength > maxBytes) {
    throw new Error(`The file is ${formatBytes(byteLength)}, larger than the ${formatBytes(maxBytes)} limit for an attachment.`);
  }

  return { base64, byteLength, dataUrlMimeType };
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

/**
 * Content hash of a base64 payload, used both for the idempotency check and as
 * verifiable metadata an agent can compare after reading the attachment back.
 * @param {string} base64
 * @returns {Promise<string>} lowercase hex SHA-256
 */
export async function sha256FromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * @typedef {object} AttachmentUpload
 * @property {string} fileName
 * @property {string} fileType
 * @property {string} base64
 * @property {number} fileSize
 * @property {string} sha256
 * @property {string} agentId
 * @property {string} requestId
 */

/**
 * Turns raw MCP parameters into a validated upload, or throws with a message an
 * agent can act on. Nothing is written before this returns.
 *
 * @param {Record<string, unknown>} params
 * @returns {Promise<AttachmentUpload>}
 */
export async function prepareAttachmentUpload(params) {
  const agentId = String(params.agentId ?? '').trim();
  if (!agentId) throw new Error('agentId is required.');
  const requestId = String(params.requestId ?? '').trim();
  if (!requestId) throw new Error('requestId is required so a repeated upload cannot create a duplicate attachment.');

  const { base64, byteLength, dataUrlMimeType } = normalizeBase64Payload(params.data);
  const fileName = sanitizeAttachmentFileName(params.fileName);
  const requestedType = typeof params.mimeType === 'string' ? params.mimeType : dataUrlMimeType;
  const fileType = normalizeMimeType(requestedType, fileName);

  return {
    fileName,
    fileType,
    base64,
    fileSize: byteLength,
    sha256: await sha256FromBase64(base64),
    agentId,
    requestId
  };
}

/**
 * Decides what a repeat of the same `requestId` means.
 *
 * Same bytes and same name: the earlier attachment is returned untouched, so a
 * retry after an uncertain response is safe. Anything else is a real conflict
 * and must not silently overwrite what is already stored.
 *
 * @param {{ fileName: string; fileSize: number; sha256?: string }} existing
 * @param {AttachmentUpload} upload
 * @returns {string | null} a refusal message, or null when this is a clean replay
 */
export function attachmentReplayRefusal(existing, upload) {
  if (existing.fileName !== upload.fileName) {
    return `requestId “${upload.requestId}” already stored “${existing.fileName}”. Use a new requestId for a different file.`;
  }
  if (existing.fileSize !== upload.fileSize || (existing.sha256 && existing.sha256 !== upload.sha256)) {
    return `requestId “${upload.requestId}” already stored different content for “${existing.fileName}”. Use a new requestId for a different file.`;
  }
  return null;
}
