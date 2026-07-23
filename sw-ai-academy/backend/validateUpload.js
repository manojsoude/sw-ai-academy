/**
 * validateUpload.js — Server-side file type and size validation (TASK-05)
 *
 * Extracted from uploadHandler.js so that validation logic can be unit-tested
 * independently of Express / multer / file I/O.
 */

'use strict';

const path = require('path');

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 485 760 bytes (design §2.3.2)

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the effective MIME type for a file.
 *
 * Uses the parser-supplied MIME type when it is a recognised type; falls back
 * to the file extension when the MIME type is absent or application/octet-stream
 * (design §2.3.1, TASK-05 fallback rule).
 *
 * @param {{ mimetype: string, originalname: string }} file
 * @returns {string} Resolved MIME type, or the original mimetype if unrecognised.
 */
function resolvedMimeType(file) {
  if (file.mimetype && ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return file.mimetype;
  }
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.docx')
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return file.mimetype || 'unknown';
}

/**
 * Validate a file object for type and size.
 *
 * Returns `null` on success, or an object with a user-facing `error` string on
 * failure.  Does not write to disk or touch the queue.
 *
 * @param {{ mimetype: string, originalname: string, size: number }} file
 * @returns {{ error: string } | null}
 */
function validateUpload(file) {
  const mime = resolvedMimeType(file);
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_MIME_TYPES.has(mime) && !ALLOWED_EXTENSIONS.has(ext)) {
    return { error: 'Only PDF or DOCX files are accepted.' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { error: 'File must be 10 MB or smaller.' };
  }

  return null;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  validateUpload,
  resolvedMimeType,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
};
