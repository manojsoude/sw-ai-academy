/**
 * db.js — SQLite database initialisation (TASK-03)
 *
 * Opens (or creates) the database at DB_PATH env var (default ./data/contracts.db).
 * Creates the `contracts` table idempotently with the five columns defined in
 * design §2.1.1 and plan §5.
 *
 * Uses the built-in `node:sqlite` module (available in Node >= 22.5) — no
 * native compilation required.
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH      = process.env.DB_PATH || './data/contracts.db';
const resolvedPath = path.resolve(DB_PATH);

// Ensure the parent directory exists before opening the database
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const db = new DatabaseSync(resolvedPath);

// Create the contracts table if it does not already exist (TASK-03, design §2.1.1)
db.exec(`
  CREATE TABLE IF NOT EXISTS contracts (
    id                 TEXT NOT NULL PRIMARY KEY,
    original_filename  TEXT NOT NULL,
    stored_filename    TEXT NOT NULL,
    upload_timestamp   TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'Pending'
  );
`);

module.exports = db;
