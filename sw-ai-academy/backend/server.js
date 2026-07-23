/**
 * server.js — API Server entry point (TASK-01)
 *
 * Starts an Express HTTP server on PORT env var (default 3000).
 * On startup:
 *   - resolves and creates the File Store folder (TASK-02, via fileStore.js)
 *   - opens / creates the SQLite database and contracts table (TASK-03, via db.js)
 *   - registers the POST /contracts upload route (TASK-04, via uploadHandler.js)
 *
 * Unrecognised routes return 404 (TASK-01 completion criterion).
 * Multer size-limit errors are caught and returned as 413 responses (design §2.3.2).
 */

'use strict';

const express = require('express');
const multer  = require('multer');

const logger        = require('./logger');
const uploadHandler = require('./uploadHandler');

// Importing db.js and fileStore.js runs their startup side-effects:
//   fileStore.js  → resolves FILE_STORE_PATH and creates the directory
//   db.js         → opens the SQLite file and runs CREATE TABLE IF NOT EXISTS
require('./fileStore');
require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Route registrations ────────────────────────────────────────────────────

app.use(express.json());
app.use('/', uploadHandler);

// ── 404 handler — unrecognised routes ─────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// ── Error handler — catches multer size-limit errors and other unhandled errors

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    logger.warn(`Upload rejected: file exceeds 10 MB limit (multer)`);
    return res.status(413).json({ error: 'File must be 10 MB or smaller.' });
  }

  logger.error(`Unhandled server error: path=${req.path} message=${err.message}\n${err.stack}`);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`);
});

module.exports = app; // exported for testing
