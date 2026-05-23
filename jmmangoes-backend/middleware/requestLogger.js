const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    logger.access(`${req.method} ${req.originalUrl} ${res.statusCode}`, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
      durationMs: Date.now() - start,
    });
  });
  next();
}

module.exports = requestLogger;

