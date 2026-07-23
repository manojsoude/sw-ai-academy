/**
 * Copyright IBM Corp. 2025
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * uploadValidation.js — Client-side file type and size validation (TASK-FE-02)
 *
 * Extracted from ContractUpload.jsx so that validation logic can be unit-tested
 * independently of React state and UI.
 */

export const MAX_FILE_SIZE = 10485760; // 10 MB in bytes (design §2.3.2)

/**
 * Returns true when the file's MIME type or name extension is PDF or DOCX.
 *
 * @param {{ type: string, name: string }} file
 * @returns {boolean}
 */
export const isAcceptedFileType = (file) => {
  const filename = file.name.toLowerCase();
  const mimeType = file.type;

  if (
    mimeType === 'application/pdf' ||
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return true;
  }

  return filename.endsWith('.pdf') || filename.endsWith('.docx');
};

/**
 * Validate a File object for type and size.
 *
 * Returns `null` when valid, or a user-facing error string when not.
 *
 * @param {{ type: string, name: string, size: number }} file
 * @returns {string | null}
 */
export const validateFile = (file) => {
  if (!isAcceptedFileType(file)) {
    return 'Only PDF or DOCX files are accepted.';
  }

  if (file.size > MAX_FILE_SIZE) {
    return 'File must be 10 MB or smaller.';
  }

  return null;
};
