'use strict';

/**
 * validateUpload.test.js — Server-side upload validation unit tests (TASK-05)
 *
 * Scenarios covered:
 *   UTS-01  Valid PDF file is accepted
 *   UTS-02  Valid DOCX file is accepted
 *   UTS-03  Plain text file is rejected
 *   UTS-04  PNG image file is rejected
 *   UTS-05  File exactly at the 10 MB size limit is accepted
 *   UTS-06  File one byte over the 10 MB limit is rejected
 *   UTS-07  Oversized DOCX file is rejected
 *   UTS-08  MIME absent; .pdf extension fallback accepted
 *   UTS-09  MIME absent; .docx extension fallback accepted
 *   UTS-10  MIME absent; unsupported extension rejected
 *   UTS-11  Zero-byte PDF is accepted
 *
 * Run: node --test backend/validateUpload.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateUpload,
  resolvedMimeType,
  MAX_FILE_SIZE,
} = require('./validateUpload');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal file-like object matching what multer puts on req.file.
 *
 * @param {{ mimetype?: string, originalname?: string, size?: number }} opts
 */
function makeFile({ mimetype = 'application/pdf', originalname = 'contract.pdf', size = 1024 * 1024 } = {}) {
  return { mimetype, originalname, size };
}

const PDF_MIME  = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ONE_MB    = 1 * 1024 * 1024;
const TEN_MB    = MAX_FILE_SIZE;          // 10 485 760

// ─── resolvedMimeType ─────────────────────────────────────────────────────────

describe('resolvedMimeType', () => {
  it('returns application/pdf for a PDF MIME type', () => {
    const file = makeFile({ mimetype: PDF_MIME, originalname: 'doc.pdf' });
    assert.equal(resolvedMimeType(file), PDF_MIME);
  });

  it('returns the DOCX MIME type when supplied', () => {
    const file = makeFile({ mimetype: DOCX_MIME, originalname: 'doc.docx' });
    assert.equal(resolvedMimeType(file), DOCX_MIME);
  });

  it('falls back to application/pdf from .pdf extension when MIME is octet-stream', () => {
    const file = makeFile({ mimetype: 'application/octet-stream', originalname: 'doc.pdf' });
    assert.equal(resolvedMimeType(file), PDF_MIME);
  });

  it('falls back to DOCX MIME from .docx extension when MIME is octet-stream', () => {
    const file = makeFile({ mimetype: 'application/octet-stream', originalname: 'doc.docx' });
    assert.equal(resolvedMimeType(file), DOCX_MIME);
  });

  it('returns the original MIME type when extension is unsupported', () => {
    const file = makeFile({ mimetype: 'application/octet-stream', originalname: 'doc.xls' });
    assert.equal(resolvedMimeType(file), 'application/octet-stream');
  });
});

// ─── validateUpload ───────────────────────────────────────────────────────────

describe('validateUpload', () => {

  // ── Positive / boundary — pass-through ──────────────────────────────────

  it('UTS-01 — accepts a valid PDF file (1 MB)', () => {
    // application/pdf + .pdf extension + 1 MB — must pass
    const file = makeFile({ mimetype: PDF_MIME, originalname: 'contract.pdf', size: ONE_MB });
    assert.equal(validateUpload(file), null);
  });

  it('UTS-02 — accepts a valid DOCX file (1 MB)', () => {
    // DOCX MIME + .docx extension + 1 MB — must pass
    const file = makeFile({ mimetype: DOCX_MIME, originalname: 'contract.docx', size: ONE_MB });
    assert.equal(validateUpload(file), null);
  });

  it('UTS-05 — accepts a PDF exactly at the 10 MB limit (10 485 760 bytes)', () => {
    // Boundary: size === MAX_FILE_SIZE is within the allowed range (≤ not <)
    const file = makeFile({ mimetype: PDF_MIME, originalname: 'big.pdf', size: TEN_MB });
    assert.equal(validateUpload(file), null);
  });

  it('UTS-08 — accepts a file with octet-stream MIME and .pdf extension (fallback)', () => {
    // MIME is generic; fallback to extension .pdf — must pass
    const file = makeFile({ mimetype: 'application/octet-stream', originalname: 'doc.pdf', size: 512 * 1024 });
    assert.equal(validateUpload(file), null);
  });

  it('UTS-09 — accepts a file with octet-stream MIME and .docx extension (fallback)', () => {
    // MIME is generic; fallback to extension .docx — must pass
    const file = makeFile({ mimetype: 'application/octet-stream', originalname: 'doc.docx', size: 512 * 1024 });
    assert.equal(validateUpload(file), null);
  });

  it('UTS-11 — accepts a zero-byte PDF (0 bytes is within the size limit)', () => {
    // 0 bytes ≤ 10 MB; the spec defines no minimum file size
    const file = makeFile({ mimetype: PDF_MIME, originalname: 'empty.pdf', size: 0 });
    assert.equal(validateUpload(file), null);
  });

  // ── Negative — type rejection ────────────────────────────────────────────

  it('UTS-03 — rejects a plain text file (text/plain)', () => {
    const file = makeFile({ mimetype: 'text/plain', originalname: 'notes.txt', size: 1024 });
    const result = validateUpload(file);
    assert.notEqual(result, null);
    assert.equal(result.error, 'Only PDF or DOCX files are accepted.');
  });

  it('UTS-04 — rejects a PNG image file (image/png)', () => {
    const file = makeFile({ mimetype: 'image/png', originalname: 'scan.png', size: 512 * 1024 });
    const result = validateUpload(file);
    assert.notEqual(result, null);
    assert.equal(result.error, 'Only PDF or DOCX files are accepted.');
  });

  it('UTS-10 — rejects a file with octet-stream MIME and unsupported extension (.xls)', () => {
    // MIME is generic AND extension is not .pdf/.docx — must fail
    const file = makeFile({ mimetype: 'application/octet-stream', originalname: 'data.xls', size: 512 * 1024 });
    const result = validateUpload(file);
    assert.notEqual(result, null);
    assert.equal(result.error, 'Only PDF or DOCX files are accepted.');
  });

  // ── Negative — size rejection ────────────────────────────────────────────

  it('UTS-06 — rejects a PDF that is one byte over 10 MB (10 485 761 bytes)', () => {
    // Boundary: TEN_MB + 1 must fail
    const file = makeFile({ mimetype: PDF_MIME, originalname: 'oversized.pdf', size: TEN_MB + 1 });
    const result = validateUpload(file);
    assert.notEqual(result, null);
    assert.equal(result.error, 'File must be 10 MB or smaller.');
  });

  it('UTS-07 — rejects an oversized DOCX file (15 MB)', () => {
    const file = makeFile({ mimetype: DOCX_MIME, originalname: 'contract.docx', size: 15 * 1024 * 1024 });
    const result = validateUpload(file);
    assert.notEqual(result, null);
    assert.equal(result.error, 'File must be 10 MB or smaller.');
  });

  // ── Error-object shape ───────────────────────────────────────────────────

  it('returns an object with an "error" string on failure — not a thrown exception', () => {
    // Validates the contract: failures are returned values, never thrown
    const file = makeFile({ mimetype: 'text/plain', originalname: 'notes.txt', size: 1024 });
    const result = validateUpload(file);
    assert.equal(typeof result, 'object');
    assert.ok('error' in result);
    assert.equal(typeof result.error, 'string');
  });

  it('returns null on success — not an object or falsy string', () => {
    const file = makeFile({ mimetype: PDF_MIME, originalname: 'ok.pdf', size: ONE_MB });
    assert.strictEqual(validateUpload(file), null);
  });
});
