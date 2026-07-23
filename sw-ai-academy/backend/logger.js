/**
 * logger.js — structured stdout logging (design §2.6.3)
 *
 * Format: <ISO8601_timestamp> [<LEVEL>] <message>
 * Level controlled by LOG_LEVEL env var (default: INFO).
 */

const LEVELS = { ERROR: 0, WARN: 1, INFO: 2 };
const configuredLevel = LEVELS[(process.env.LOG_LEVEL || 'INFO').toUpperCase()] ?? LEVELS.INFO;

function log(level, message) {
  if (LEVELS[level] > configuredLevel) return;
  process.stdout.write(`${new Date().toISOString()} [${level}] ${message}\n`);
}

module.exports = {
  info:  (msg) => log('INFO',  msg),
  warn:  (msg) => log('WARN',  msg),
  error: (msg) => log('ERROR', msg),
};
