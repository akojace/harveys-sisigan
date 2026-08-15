// src/middleware/error.middleware.js
// Central error handler - catches all thrown errors from routes

const errorMiddleware = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.url}:`, err.message);

  // Prisma known errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'A record with this value already exists.',
      field: err.meta?.target,
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Record not found.',
    });
  }

  // Validation errors from express-validator
  if (err.type === 'validation') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: err.errors,
    });
  }

  // Default
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error.',
  });
};

module.exports = errorMiddleware;
