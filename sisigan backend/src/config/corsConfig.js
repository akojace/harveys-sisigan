// src/config/corsConfig.js
// Production CORS configuration for Harvey's Sisigan API.
// Parses comma-separated CORS_ORIGIN, dynamically reflects the single matching origin,
// supports preflight OPTIONS requests, and prevents invalid multi-origin headers.

const DEFAULT_ORIGINS = [
  'https://harveyspecialcrispysisig.store',
  'https://www.harveyspecialcrispysisig.store',
  'http://localhost:5173',
  'http://localhost:3000',
];

/**
 * Parses the CORS_ORIGIN environment variable into a clean array of origin strings.
 * Trims whitespace, removes empty entries, and falls back to default production origins.
 */
function parseAllowedOrigins(rawEnv = process.env.CORS_ORIGIN) {
  if (!rawEnv || typeof rawEnv !== 'string' || rawEnv.trim() === '') {
    return [...DEFAULT_ORIGINS];
  }

  const list = rawEnv
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (list.length === 0) {
    return [...DEFAULT_ORIGINS];
  }

  // Deduplicate origins while preserving order
  return Array.from(new Set(list));
}

/**
 * Builds the Express CORS middleware configuration object.
 * Uses a dynamic origin function to reflect only the single matching origin in
 * Access-Control-Allow-Origin, preventing invalid multi-origin headers.
 */
function getCorsOptions(customOrigins) {
  const allowedOrigins = Array.isArray(customOrigins)
    ? customOrigins
    : parseAllowedOrigins(customOrigins);

  return {
    origin: (origin, callback) => {
      // 1. Allow non-browser requests (e.g., server-to-server, curl, Postman)
      if (!origin) {
        return callback(null, true);
      }

      // 2. Check if the incoming origin is in the allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // 3. Fallback: if wildcard is explicitly configured
      if (allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      // 4. Reject unapproved origins without setting Access-Control-Allow-Origin
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    optionsSuccessStatus: 204,
  };
}

/**
 * Builds Socket.IO compatible CORS options.
 */
function getSocketCorsOptions(customOrigins) {
  const allowedOrigins = Array.isArray(customOrigins)
    ? customOrigins
    : parseAllowedOrigins(customOrigins);

  return {
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  };
}

module.exports = {
  DEFAULT_ORIGINS,
  parseAllowedOrigins,
  getCorsOptions,
  getSocketCorsOptions,
};
