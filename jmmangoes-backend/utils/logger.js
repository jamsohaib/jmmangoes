const fs = require('fs');
const path = require('path');

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = LEVELS[LOG_LEVEL] ?? LEVELS.info;

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const today = () => new Date().toISOString().slice(0, 10);
const appLogPath = () => path.join(logsDir, `app-${today()}.log`);
const errorLogPath = () => path.join(logsDir, `error-${today()}.log`);
const accessLogPath = () => path.join(logsDir, `access-${today()}.log`);

function stringifyMeta(meta) {
  if (!meta) return '';
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch (_) {
    return ' [meta-unserializable]';
  }
}

function write(filePath, line) {
  fs.appendFile(filePath, `${line}\n`, () => {});
}

function baseLog(level, message, meta) {
  if ((LEVELS[level] ?? LEVELS.info) > CURRENT_LEVEL) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}${stringifyMeta(meta)}`;
  write(appLogPath(), line);
  if (level === 'error') write(errorLogPath(), line);
}

module.exports = {
  error: (message, meta) => baseLog('error', message, meta),
  warn: (message, meta) => baseLog('warn', message, meta),
  info: (message, meta) => baseLog('info', message, meta),
  debug: (message, meta) => baseLog('debug', message, meta),
  access: (message, meta) => {
    const line = `${new Date().toISOString()} ${message}${stringifyMeta(meta)}`;
    write(accessLogPath(), line);
  },
};

