// src/config/dbConfig.js
// Production-ready database configuration loader and connection diagnostics.
// Supports DATABASE_URL or discrete DB_* environment variables.
// Ensures credentials are never leaked in logs, sanitizes URLs, and adds sensible pool limits.

const dns = require('dns');

/**
 * Parses and sanitizes database connection information.
 * Supports:
 *   1. DATABASE_URL (standard Prisma format: mysql://user:pass@host:port/dbname?params)
 *   2. Discrete environment variables:
 *      DB_HOST, DB_PORT, DB_USER / DB_USERNAME, DB_PASSWORD, DB_NAME / DB_DATABASE, DB_SSL
 */
function getDatabaseConfig() {
  let url = process.env.DATABASE_URL;

  // If DATABASE_URL is not set, try assembling from discrete DB_* variables
  if (!url) {
    const host = process.env.DB_HOST;
    const user = process.env.DB_USER || process.env.DB_USERNAME;
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || process.env.DB_DATABASE;
    const port = process.env.DB_PORT || 3306;
    const ssl = process.env.DB_SSL === 'true' || process.env.DB_SSL === '1';

    if (host && user && database) {
      const encodedUser = encodeURIComponent(user);
      const encodedPass = password ? encodeURIComponent(password) : '';
      const auth = encodedPass ? `${encodedUser}:${encodedPass}` : encodedUser;
      const sslParam = ssl ? '&sslaccept=strict' : '';

      url = `mysql://${auth}@${host}:${port}/${database}?connection_limit=10&connect_timeout=15&pool_timeout=20${sslParam}`;
      // Set DATABASE_URL in process.env so Prisma can pick it up
      process.env.DATABASE_URL = url;
    }
  }

  return url;
}

/**
 * Returns a sanitized view of database configuration safe for logging and health checks.
 * Completely strips the password and sensitive query parameters.
 */
function getSanitizedDbInfo(rawUrl = process.env.DATABASE_URL) {
  if (!rawUrl) {
    return {
      configured: false,
      host: null,
      port: null,
      database: null,
      user: null,
      hasPassword: false,
      connectionLimit: null,
    };
  }

  try {
    const parsed = new URL(rawUrl);
    const searchParams = parsed.searchParams;

    return {
      configured: true,
      protocol: parsed.protocol.replace(':', ''),
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 3306,
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : null,
      user: parsed.username || null,
      hasPassword: Boolean(parsed.password),
      connectionLimit: searchParams.get('connection_limit') || 'default',
      connectTimeout: searchParams.get('connect_timeout') || 'default',
      poolTimeout: searchParams.get('pool_timeout') || 'default',
    };
  } catch {
    // If URL parsing fails, extract host safely using regex
    const hostMatch = rawUrl.match(/@([^:/]+)(?::(\d+))?\/([^?]+)/);
    return {
      configured: true,
      host: hostMatch ? hostMatch[1] : 'unknown',
      port: hostMatch && hostMatch[2] ? Number(hostMatch[2]) : 3306,
      database: hostMatch ? hostMatch[3] : 'unknown',
      user: 'configured',
      hasPassword: true,
    };
  }
}

/**
 * Diagnostic helper that tests the database connection and classifies the error.
 * Returns { ok: boolean, status: string, message: string, details: object }
 */
async function diagnoseDatabaseConnection(prismaInstance) {
  const info = getSanitizedDbInfo();

  if (!info.configured) {
    return {
      ok: false,
      status: 'CONFIG_MISSING',
      message: 'DATABASE_URL or discrete DB credentials are not configured.',
      info,
    };
  }

  try {
    // 1. Basic query check
    await prismaInstance.$queryRawUnsafe('SELECT 1');

    // 2. Schema check: verify core tables exist
    const tables = await prismaInstance.$queryRawUnsafe(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = DATABASE() 
         AND table_name IN ('users', 'branches', 'orders', 'menu_items')`
    );

    const foundTables = (Array.isArray(tables) ? tables : []).map(
      (t) => t.TABLE_NAME || t.table_name
    );

    const isSchemaReady = foundTables.length >= 2;

    return {
      ok: true,
      status: 'CONNECTED',
      message: isSchemaReady
        ? 'Database connected and schema verified.'
        : 'Database connected, but core schema tables were not found. Migrations may be needed.',
      schemaReady: isSchemaReady,
      verifiedTables: foundTables,
      info,
    };
  } catch (error) {
    const errorStr = (error.message || '') + (error.code || '');
    let classification = 'UNKNOWN_DATABASE_ERROR';
    let userMessage = 'Database connection failed.';

    if (errorStr.includes('P1001') || errorStr.includes("Can't reach database server") || errorStr.includes('ETIMEDOUT') || errorStr.includes('ECONNREFUSED')) {
      classification = 'NETWORK_UNREACHABLE';
      userMessage = `Cannot reach database server at ${info.host}:${info.port}. Check firewall, Remote MySQL allowlist, or server status.`;
    } else if (errorStr.includes('P1000') || errorStr.includes('Access denied for user') || errorStr.includes('ER_ACCESS_DENIED_ERROR')) {
      classification = 'AUTH_FAILED';
      userMessage = `Authentication failed for database user "${info.user}" at ${info.host}. Verify username and password.`;
    } else if (errorStr.includes('P1003') || errorStr.includes("database doesn't exist") || errorStr.includes('ER_BAD_DB_ERROR')) {
      classification = 'DATABASE_NOT_FOUND';
      userMessage = `Database "${info.database}" does not exist on server ${info.host}. Create the database in Hostinger hPanel.`;
    } else if (errorStr.includes('getaddrinfo') || errorStr.includes('ENOTFOUND')) {
      classification = 'DNS_FAILED';
      userMessage = `Database hostname "${info.host}" cannot be resolved by DNS.`;
    } else if (errorStr.includes('ER_CON_COUNT_ERROR') || errorStr.includes('Too many connections')) {
      classification = 'POOL_EXHAUSTED';
      userMessage = 'Database server has reached its maximum connection limit.';
    }

    return {
      ok: false,
      status: classification,
      message: userMessage,
      prismaCode: error.code || null,
      info,
    };
  }
}

module.exports = {
  getDatabaseConfig,
  getSanitizedDbInfo,
  diagnoseDatabaseConnection,
};

