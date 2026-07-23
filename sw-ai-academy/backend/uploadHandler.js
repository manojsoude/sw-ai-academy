/**
 * uploadHandler.js — POST /contracts route (TASK-04 through TASK-08)
 *
 * Responsibilities:
 *   TASK-04  Register multipart upload route with 10 MB parser limit
 *   TASK-05  Server-side file type and size validation
 *   TASK-06  Write uploaded file to local File Store (UUID-prefixed filename)
 *   TASK-07  INSERT contract record into SQLite with status 'Pending'
 *   TASK-08  Return HTTP 201 with { id, status: "Pending" }
 */

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');

const logger    = require('./logger');
const db        = require('./db');
const fileStore = require('./fileStore');
const { validateUpload, MAX_FILE_SIZE } = require('./validateUpload');

const router = express.Router();

// ─── Multer configuration (TASK-04) ─────────────────────────────────────────
//
// Memory storage: file bytes land in req.file.buffer so we can write them
// ourselves with the UUID-prefixed stored_filename (TASK-06).
// The parser limit is the first gate for oversized requests (design §2.3.2).

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// ─── POST /contracts ─────────────────────────────────────────────────────────

router.post('/contracts', upload.single('file'), (req, res) => {
  // TASK-04: log the incoming request (design §2.6.1)
  const originalFilename = req.file ? req.file.originalname : '(no file)';
  logger.info(`Upload request received: filename=${originalFilename} size=${req.file ? req.file.size : 0} mime=${req.file ? req.file.mimetype : 'n/a'}`);

  // Guard: multer may have rejected with a size limit error (handled in
  // the error-handler registered in server.js), but also handle the case
  // where no file was attached at all.
  if (!req.file) {
    logger.warn('Upload rejected: no file attached');
    return res.status(400).json({ error: 'No file was attached to the request.' });
  }

  // ── TASK-05: server-side validation ──────────────────────────────────────

  const validationError = validateUpload(req.file);

  if (validationError) {
    logger.warn(`Upload rejected: ${validationError.error} filename=${req.file.originalname} mime=${req.file.mimetype}`);
    return res.status(400).json(validationError);
  }

  // ── TASK-06: write file to File Store ────────────────────────────────────

  const fileExt       = path.extname(req.file.originalname).toLowerCase();
  const storedFilename = `${uuidv4()}${fileExt}`;
  const destPath       = path.join(fileStore, storedFilename);

  try {
    fs.writeFileSync(destPath, req.file.buffer);
    logger.info(`File written to File Store: stored_filename=${storedFilename} size=${req.file.size}`);
  } catch (err) {
    logger.error(`File Store write failure: ${err.message}\n${err.stack}`);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  // ── TASK-07: INSERT contract record into SQLite ───────────────────────────

  const contractId      = uuidv4();
  const uploadTimestamp = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO contracts (id, original_filename, stored_filename, upload_timestamp, status)
      VALUES (?, ?, ?, ?, 'Pending')
    `).run(contractId, req.file.originalname, storedFilename, uploadTimestamp);

    logger.info(`Contract record inserted: id=${contractId} upload_timestamp=${uploadTimestamp}`);
  } catch (err) {
    logger.error(`SQLite INSERT failure: ${err.message}\n${err.stack}`);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  // ── TASK-08: return 201 Created ───────────────────────────────────────────

  logger.info(`Upload response sent: id=${contractId} original_filename=${req.file.originalname} status=201`);

  return res.status(201).json({ id: contractId, status: 'Pending' });
});

module.exports = router;
