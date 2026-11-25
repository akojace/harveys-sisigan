// src/config/db.js
// Singleton Prisma client with production-ready connection management,
// environment variable resolution, and connection diagnostics.

const { PrismaClient } = require('@prisma/client');
const {
  getDatabaseConfig,
  getSanitizedDbInfo,
  diagnoseDatabaseConnection,
} = require('./dbConfig');
const {
  attachPrismaPerformanceMiddleware,
} = require('../middleware/performance.middleware');

// Ensure DATABASE_URL is initialized (either from DATABASE_URL or DB_* environment variables)
const resolvedDbUrl = getDatabaseConfig();

// Prevent multiple PrismaClient instances during hot reloading in development
const globalForPrisma = global;

const prisma =
  globalForPrisma.__prisma ||
  new PrismaClient({
    datasources: resolvedDbUrl
      ? {
          db: {
            url: resolvedDbUrl,
          },
        }
      : undefined,
    log:
      process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
  });

attachPrismaPerformanceMiddleware(prisma);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

// Attach diagnostics helper for convenient health checks
prisma.getSanitizedInfo = () => getSanitizedDbInfo(process.env.DATABASE_URL);
prisma.diagnose = () => diagnoseDatabaseConnection(prisma);

module.exports = prisma;
