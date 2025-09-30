const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

const errorHandler = (err, req, res, next) => {
  const traceId = uuidv4();
  
  // Log error details
  logger.error('Unhandled error', {
    traceId,
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Determine error status and message
  let status = err.status || err.statusCode || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let messageKey = err.messageKey || 'error.internal_server_error';
  let params = err.params || {};

  // Handle specific error types
  if (err.name === 'ValidationError') {
    status = 400;
    code = 'VALIDATION_ERROR';
    messageKey = 'error.validation_failed';
    params = { details: err.details || err.message };
  } else if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    status = 401;
    code = 'UNAUTHORIZED';
    messageKey = 'error.unauthorized';
  } else if (err.name === 'ForbiddenError') {
    status = 403;
    code = 'FORBIDDEN';
    messageKey = 'error.forbidden';
  }

  // Send error response
  res.status(status).json({
    code,
    messageKey,
    params,
    traceId,
    ...(process.env.NODE_ENV === 'development' && { 
      error: err.message,
      stack: err.stack 
    })
  });
};

module.exports = errorHandler;