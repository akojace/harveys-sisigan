// tests/database-config.test.js
// Verification suite for production database configuration, discrete variables,
// connection diagnostics, error classification, and secret sanitization.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  getDatabaseConfig,
  getSanitizedDbInfo,
  diagnoseDatabaseConnection,
} = require('../src/config/dbConfig');
const prisma = require('../src/config/db');

describe("Harvey's Sisigan — Database Configuration & Diagnostics Suite", () => {
  it('Sanitizes database URLs and never exposes raw passwords', () => {
    const rawUrl = 'mysql://admin_sisig:SuperSecretP@ssw0rd!123@153.92.15.53:3306/sisigan_pos?connection_limit=10';
    const sanitized = getSanitizedDbInfo(rawUrl);

    assert.equal(sanitized.configured, true);
    assert.equal(sanitized.host, '153.92.15.53');
    assert.equal(sanitized.port, 3306);
    assert.equal(sanitized.database, 'sisigan_pos');
    assert.equal(sanitized.user, 'admin_sisig');
    assert.equal(sanitized.hasPassword, true);
    assert.equal(sanitized.connectionLimit, '10');

    // Verify password is NOT in the returned object anywhere
    const serialized = JSON.stringify(sanitized);
    assert.equal(serialized.includes('SuperSecretP@ssw0rd'), false, 'Password must never be exposed');
  });

  it('Handles missing database URL gracefully without throwing', () => {
    const sanitized = getSanitizedDbInfo(null);
    assert.equal(sanitized.configured, false);
    assert.equal(sanitized.host, null);
    assert.equal(sanitized.database, null);
  });

  it('Assembles DATABASE_URL from discrete DB_* variables when DATABASE_URL is unset', () => {
    const origEnv = { ...process.env };
    delete process.env.DATABASE_URL;

    process.env.DB_HOST = '153.92.15.53';
    process.env.DB_PORT = '3306';
    process.env.DB_USER = 'sisig_user';
    process.env.DB_PASSWORD = 'Secret#Password';
    process.env.DB_NAME = 'sisig_production';

    const assembledUrl = getDatabaseConfig();

    assert.ok(assembledUrl, 'Assembled URL must be generated');
    assert.ok(assembledUrl.startsWith('mysql://sisig_user:Secret%23Password@153.92.15.53:3306/sisig_production'));
    assert.ok(assembledUrl.includes('connection_limit=10'));
    assert.ok(assembledUrl.includes('connect_timeout=15'));

    // Restore original env
    process.env.DATABASE_URL = origEnv.DATABASE_URL;
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_NAME;
  });

  it('Reports CONNECTED status on active database', async () => {
    const diag = await prisma.diagnose();
    assert.equal(diag.ok, true, 'Active database connection must be reported as ok');
    assert.equal(diag.status, 'CONNECTED');
    assert.ok(diag.info);
    assert.equal(diag.info.configured, true);
    assert.equal(diag.schemaReady, true, 'Core schema tables must be verified');
  });

  it('Classifies missing config properly', async () => {
    const origUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = '';

    const mockPrisma = {
      $queryRawUnsafe: async () => {},
    };

    const diag = await diagnoseDatabaseConnection(mockPrisma);
    assert.equal(diag.ok, false);
    assert.equal(diag.status, 'CONFIG_MISSING');

    process.env.DATABASE_URL = origUrl;
  });

  it('Classifies network unreachable / firewall error properly', async () => {
    const mockPrisma = {
      $queryRawUnsafe: async () => {
        const err = new Error("Can't reach database server at 153.92.15.53:3306");
        err.code = 'P1001';
        throw err;
      },
    };

    const diag = await diagnoseDatabaseConnection(mockPrisma);
    assert.equal(diag.ok, false);
    assert.equal(diag.status, 'NETWORK_UNREACHABLE');
    assert.match(diag.message, /Cannot reach database server/);
  });

  it('Classifies authentication failure properly', async () => {
    const mockPrisma = {
      $queryRawUnsafe: async () => {
        const err = new Error("Access denied for user 'sisig_user'@'%'");
        err.code = 'P1000';
        throw err;
      },
    };

    const diag = await diagnoseDatabaseConnection(mockPrisma);
    assert.equal(diag.ok, false);
    assert.equal(diag.status, 'AUTH_FAILED');
    assert.match(diag.message, /Authentication failed/);
  });

  it('Classifies database not found error properly', async () => {
    const mockPrisma = {
      $queryRawUnsafe: async () => {
        const err = new Error("Database 'nonexistent_db' doesn't exist");
        err.code = 'P1003';
        throw err;
      },
    };

    const diag = await diagnoseDatabaseConnection(mockPrisma);
    assert.equal(diag.ok, false);
    assert.equal(diag.status, 'DATABASE_NOT_FOUND');
    assert.match(diag.message, /does not exist/);
  });
});

