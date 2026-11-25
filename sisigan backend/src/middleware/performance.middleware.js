// src/middleware/performance.middleware.js
// Safe, production-ready request-level performance and query timing instrumentation.
// Measures total request latency and aggregates database execution time via AsyncLocalStorage.
// Strictly omits passwords, credentials, tokens, and customer-sensitive payloads.

const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const performanceContext = new AsyncLocalStorage();

/**
 * Express middleware that initializes request correlation and timing context.
 */
function performanceMiddleware(req, res, next) {
  // Use existing header if forwarded by reverse proxy (e.g., Render/Cloudflare) or generate
  const correlationId =
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    `req_${crypto.randomBytes(6).toString('hex')}`;

  res.setHeader('x-correlation-id', correlationId);

  const context = {
    correlationId,
    dbQueries: 0,
    dbTimeMs: 0,
    startTimeNs: process.hrtime.bigint(),
  };

  performanceContext.run(context, () => {
    res.on('finish', () => {
      const endTimeNs = process.hrtime.bigint();
      const totalDurationMs =
        Math.round(Number(endTimeNs - context.startTimeNs) / 1e4) / 100;
      const dbDurationMs = Math.round(context.dbTimeMs * 100) / 100;

      const path = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
      const isSlow = totalDurationMs >= 500;

      // Structured log payload safe for CloudWatch/Render log streams
      const logPayload = {
        tag: isSlow ? 'API_SLOW_OPERATION' : 'API_PERFORMANCE',
        correlationId,
        method: req.method,
        path,
        statusCode: res.statusCode,
        totalDurationMs,
        dbDurationMs,
        dbQueries: context.dbQueries,
        backendDurationMs: Math.max(0, Math.round((totalDurationMs - dbDurationMs) * 100) / 100),
      };

      if (isSlow) {
        console.warn(
          `⚠️ [SLOW OPERATION] ${logPayload.method} ${logPayload.path} -> HTTP ${logPayload.statusCode} | Total: ${logPayload.totalDurationMs}ms | DB: ${logPayload.dbDurationMs}ms (${logPayload.dbQueries} queries) [${correlationId}]`
        );
      } else if (process.env.NODE_ENV !== 'test') {
        console.log(
          `⏱️ [PERF] ${logPayload.method} ${logPayload.path} -> HTTP ${logPayload.statusCode} | Total: ${logPayload.totalDurationMs}ms | DB: ${logPayload.dbDurationMs}ms (${logPayload.dbQueries} queries) [${correlationId}]`
        );
      }
    });

    next();
  });
}

/**
 * Prisma query middleware that records database execution duration in the active request context.
 */
function attachPrismaPerformanceMiddleware(prisma) {
  prisma.$use(async (params, next) => {
    const ctx = performanceContext.getStore();
    if (!ctx) {
      return next(params);
    }

    const startNs = process.hrtime.bigint();
    try {
      return await next(params);
    } finally {
      const endNs = process.hrtime.bigint();
      const queryMs = Number(endNs - startNs) / 1e6;
      ctx.dbTimeMs += queryMs;
      ctx.dbQueries += 1;
    }
  });
}

module.exports = {
  performanceMiddleware,
  attachPrismaPerformanceMiddleware,
  performanceContext,
};
