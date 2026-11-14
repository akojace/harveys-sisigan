// tests/cors.test.js
// Production CORS verification suite for Harvey's Sisigan Backend API.
// Verifies:
// 1. Parsing comma-separated CORS_ORIGIN lists with whitespace trimming.
// 2. Preflight OPTIONS requests for both allowed domains (apex and www).
// 3. Ensuring Access-Control-Allow-Origin contains EXACTLY ONE origin (no comma concatenation).
// 4. Rejection of unapproved / malicious origins (no Allow-Origin header returned).
// 5. Verification of credentials, allowed methods, and allowed headers.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const cors = require('cors');

const {
  DEFAULT_ORIGINS,
  parseAllowedOrigins,
  getCorsOptions,
  getSocketCorsOptions,
} = require('../src/config/corsConfig');

describe("Harvey's Sisigan — Production CORS Suite", () => {
  it('parses comma-separated CORS_ORIGIN string into trimmed, deduplicated array', () => {
    const raw = '  https://harveyspecialcrispysisig.store , https://www.harveyspecialcrispysisig.store, https://harveyspecialcrispysisig.store  ';
    const parsed = parseAllowedOrigins(raw);

    assert.equal(parsed.length, 2);
    assert.deepEqual(parsed, [
      'https://harveyspecialcrispysisig.store',
      'https://www.harveyspecialcrispysisig.store',
    ]);
  });

  it('falls back to default production and local origins when CORS_ORIGIN is empty or unset', () => {
    assert.deepEqual(parseAllowedOrigins(null), DEFAULT_ORIGINS);
    assert.deepEqual(parseAllowedOrigins(''), DEFAULT_ORIGINS);
    assert.deepEqual(parseAllowedOrigins('   '), DEFAULT_ORIGINS);
    assert.ok(DEFAULT_ORIGINS.includes('https://harveyspecialcrispysisig.store'));
    assert.ok(DEFAULT_ORIGINS.includes('https://www.harveyspecialcrispysisig.store'));
  });

  it('returns valid Socket.IO CORS configuration', () => {
    const socketCors = getSocketCorsOptions('https://harveyspecialcrispysisig.store,https://www.harveyspecialcrispysisig.store');
    assert.deepEqual(socketCors.origin, [
      'https://harveyspecialcrispysisig.store',
      'https://www.harveyspecialcrispysisig.store',
    ]);
    assert.equal(socketCors.credentials, true);
    assert.ok(socketCors.methods.includes('POST'));
  });

  it('verifies OPTIONS preflight for www domain returns EXACTLY ONE origin and 204 status', async () => {
    const app = express();
    const origins = ['https://harveyspecialcrispysisig.store', 'https://www.harveyspecialcrispysisig.store'];
    app.use(cors(getCorsOptions(origins)));
    app.post('/api/auth/login', (req, res) => res.json({ success: true }));

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/auth/login`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://www.harveyspecialcrispysisig.store',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization',
        },
      });

      assert.equal(res.status, 204, 'Preflight status must be 204 No Content');
      const allowOrigin = res.headers.get('access-control-allow-origin');
      assert.equal(allowOrigin, 'https://www.harveyspecialcrispysisig.store', 'Must return single exact matching origin');
      assert.equal(allowOrigin.includes(','), false, 'Must never contain comma-separated multiple origins');
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
      assert.ok(res.headers.get('access-control-allow-methods').includes('POST'));
      assert.ok(res.headers.get('access-control-allow-headers').includes('Authorization'));
    } finally {
      server.close();
    }
  });

  it('verifies OPTIONS preflight for apex domain returns EXACTLY ONE origin and 204 status', async () => {
    const app = express();
    const origins = ['https://harveyspecialcrispysisig.store', 'https://www.harveyspecialcrispysisig.store'];
    app.use(cors(getCorsOptions(origins)));
    app.post('/api/auth/login', (req, res) => res.json({ success: true }));

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/auth/login`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://harveyspecialcrispysisig.store',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      });

      assert.equal(res.status, 204);
      const allowOrigin = res.headers.get('access-control-allow-origin');
      assert.equal(allowOrigin, 'https://harveyspecialcrispysisig.store', 'Must return apex domain origin');
      assert.equal(allowOrigin.includes(','), false);
    } finally {
      server.close();
    }
  });

  it('rejects unapproved origin on preflight OPTIONS by omitting Access-Control-Allow-Origin', async () => {
    const app = express();
    const origins = ['https://harveyspecialcrispysisig.store', 'https://www.harveyspecialcrispysisig.store'];
    app.use(cors(getCorsOptions(origins)));
    app.post('/api/auth/login', (req, res) => res.json({ success: true }));

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/auth/login`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://unauthorized-domain.com',
          'Access-Control-Request-Method': 'POST',
        },
      });

      const allowOrigin = res.headers.get('access-control-allow-origin');
      assert.equal(allowOrigin, null, 'Unapproved origin must not receive Access-Control-Allow-Origin header');
    } finally {
      server.close();
    }
  });

  it('verifies actual POST request from allowed origin returns exact matching Allow-Origin header', async () => {
    const app = express();
    const origins = ['https://harveyspecialcrispysisig.store', 'https://www.harveyspecialcrispysisig.store'];
    app.use(cors(getCorsOptions(origins)));
    app.use(express.json());
    app.post('/api/auth/login', (req, res) => res.json({ token: 'jwt.sample.token' }));

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/auth/login`, {
        method: 'POST',
        headers: {
          Origin: 'https://www.harveyspecialcrispysisig.store',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'test@sisigan.ph', password: 'password123' }),
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://www.harveyspecialcrispysisig.store');
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
      const body = await res.json();
      assert.equal(body.token, 'jwt.sample.token');
    } finally {
      server.close();
    }
  });

  it('allows non-browser requests without Origin header (e.g. curl / health checks)', async () => {
    const app = express();
    app.use(cors(getCorsOptions()));
    app.get('/health', (req, res) => res.json({ status: 'OK' }));

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'OK');
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    } finally {
      server.close();
    }
  });
});

