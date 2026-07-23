/**
 * fileStore.js — File Store path resolution (TASK-02)
 *
 * Reads FILE_STORE_PATH env var; defaults to ./data/uploads.
 * Creates the directory (including intermediate dirs) on startup.
 * Exports the resolved absolute path for use by the upload handler.
 */

const fs   = require('fs');
const path = require('path');

const FILE_STORE_PATH = process.env.FILE_STORE_PATH || './data/uploads';
const resolvedPath    = path.resolve(FILE_STORE_PATH);

fs.mkdirSync(resolvedPath, { recursive: true });

module.exports = resolvedPath;
