/**
 * Copyright IBM Corp. 2025
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * uploadValidation.test.js — Client-side upload validation unit tests (TASK-FE-02)
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
 * Run: npm test (from sw-ai-academy/frontend)
 *      or: npx vitest run src/__tests__/uploadValidation.test.js
 */

import { describe, test, expect } from 'vitest';
import {
  isAcceptedFileType,
  validateFile,
  MAX_FILE_SIZE,
} from '../utils/uploadValidation';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PDF_MIME  = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ONE_MB    = 1 * 1024 * 1024;
const TEN_MB    = MAX_FILE_SIZE; // 10 485 760

/**
 * Build a plain object that satisfies the { name, type, size } interface used
 * by isAcceptedFileType and validateFile.  We do not need an actual File
 * instance because the functions only read .name, .type, and .size.
 *
 * @param {{ type?: string, name?: string, size?: number }} opts
 */
function makeFile({ type = PDF_MIME, name = 'contract.pdf', size = ONE_MB } = {}) {
  return { type, name, size };
}

// ─── isAcceptedFileType ───────────────────────────────────────────────────────

describe('isAcceptedFileType', () => {
  test('returns true for application/pdf MIME type', () => {
    expect(isAcceptedFileType(makeFile({ type: PDF_MIME, name: 'doc.pdf' }))).toBe(true);
  });

  test('returns true for DOCX MIME type', () => {
    expect(isAcceptedFileType(makeFile({ type: DOCX_MIME, name: 'doc.docx' }))).toBe(true);
  });

  test('returns true for .pdf extension when MIME is absent (empty string)', () => {
    // Browser may supply '' or 'application/octet-stream' for unrecognised files
    expect(isAcceptedFileType(makeFile({ type: '', name: 'doc.pdf' }))).toBe(true);
  });

  test('returns true for .docx extension when MIME is absent', () => {
    expect(isAcceptedFileType(makeFile({ type: '', name: 'doc.docx' }))).toBe(true);
  });

  test('returns true for .pdf extension when MIME is application/octet-stream', () => {
    expect(isAcceptedFileType(makeFile({ type: 'application/octet-stream', name: 'doc.pdf' }))).toBe(true);
  });

  test('returns true for .docx extension when MIME is application/octet-stream', () => {
    expect(isAcceptedFileType(makeFile({ type: 'application/octet-stream', name: 'doc.docx' }))).toBe(true);
  });

  test('returns false for text/plain MIME', () => {
    expect(isAcceptedFileType(makeFile({ type: 'text/plain', name: 'notes.txt' }))).toBe(false);
  });

  test('returns false for image/png MIME', () => {
    expect(isAcceptedFileType(makeFile({ type: 'image/png', name: 'scan.png' }))).toBe(false);
  });

  test('returns false for .xls extension with octet-stream MIME', () => {
    expect(isAcceptedFileType(makeFile({ type: 'application/octet-stream', name: 'data.xls' }))).toBe(false);
  });
});

// ─── validateFile ─────────────────────────────────────────────────────────────

describe('validateFile', () => {

  // ── Positive / boundary — no error ──────────────────────────────────────

  test('UTS-01 — accepts a valid PDF file (application/pdf, .pdf, 1 MB)', () => {
    const file = makeFile({ type: PDF_MIME, name: 'contract.pdf', size: ONE_MB });
    expect(validateFile(file)).toBeNull();
  });

  test('UTS-02 — accepts a valid DOCX file (DOCX MIME, .docx, 1 MB)', () => {
    const file = makeFile({ type: DOCX_MIME, name: 'contract.docx', size: ONE_MB });
    expect(validateFile(file)).toBeNull();
  });

  test('UTS-05 — accepts a PDF exactly at the 10 MB limit (10 485 760 bytes)', () => {
    // size === MAX_FILE_SIZE must pass (≤ not <)
    const file = makeFile({ type: PDF_MIME, name: 'big.pdf', size: TEN_MB });
    expect(validateFile(file)).toBeNull();
  });

  test('UTS-08 — accepts a file with octet-stream MIME and .pdf extension (fallback)', () => {
    const file = makeFile({ type: 'application/octet-stream', name: 'doc.pdf', size: 512 * 1024 });
    expect(validateFile(file)).toBeNull();
  });

  test('UTS-09 — accepts a file with octet-stream MIME and .docx extension (fallback)', () => {
    const file = makeFile({ type: 'application/octet-stream', name: 'doc.docx', size: 512 * 1024 });
    expect(validateFile(file)).toBeNull();
  });

  test('UTS-11 — accepts a zero-byte PDF (0 bytes is within the size limit)', () => {
    // The spec defines no minimum file size; 0 bytes must pass
    const file = makeFile({ type: PDF_MIME, name: 'empty.pdf', size: 0 });
    expect(validateFile(file)).toBeNull();
  });

  // ── Negative — type rejection ────────────────────────────────────────────

  test('UTS-03 — rejects a plain text file with the correct error message', () => {
    const file = makeFile({ type: 'text/plain', name: 'notes.txt', size: 1024 });
    expect(validateFile(file)).toBe('Only PDF or DOCX files are accepted.');
  });

  test('UTS-04 — rejects a PNG image file with the correct error message', () => {
    const file = makeFile({ type: 'image/png', name: 'scan.png', size: 512 * 1024 });
    expect(validateFile(file)).toBe('Only PDF or DOCX files are accepted.');
  });

  test('UTS-10 — rejects a file with octet-stream MIME and unsupported .xls extension', () => {
    const file = makeFile({ type: 'application/octet-stream', name: 'data.xls', size: 512 * 1024 });
    expect(validateFile(file)).toBe('Only PDF or DOCX files are accepted.');
  });

  // ── Negative — size rejection ────────────────────────────────────────────

  test('UTS-06 — rejects a PDF one byte over the 10 MB limit (10 485 761 bytes)', () => {
    const file = makeFile({ type: PDF_MIME, name: 'oversized.pdf', size: TEN_MB + 1 });
    expect(validateFile(file)).toBe('File must be 10 MB or smaller.');
  });

  test('UTS-07 — rejects an oversized DOCX file (15 MB)', () => {
    const file = makeFile({ type: DOCX_MIME, name: 'contract.docx', size: 15 * 1024 * 1024 });
    expect(validateFile(file)).toBe('File must be 10 MB or smaller.');
  });

  // ── Type check runs before size check ────────────────────────────────────

  test('type error takes precedence over size error when both apply', () => {
    // A .txt file that is also oversized should report the type error first
    const file = makeFile({ type: 'text/plain', name: 'notes.txt', size: TEN_MB + 1 });
    expect(validateFile(file)).toBe('Only PDF or DOCX files are accepted.');
  });

  // ── Return-value contract ────────────────────────────────────────────────

  test('returns null (not undefined or empty string) on success', () => {
    const file = makeFile({ type: PDF_MIME, name: 'ok.pdf', size: ONE_MB });
    expect(validateFile(file)).toBeNull();
  });

  test('returns a non-empty string on failure', () => {
    const file = makeFile({ type: 'text/plain', name: 'notes.txt', size: 1024 });
    const result = validateFile(file);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
