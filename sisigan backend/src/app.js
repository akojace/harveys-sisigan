// src/app.js
// Express app setup - routes, middleware, CORS

const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes      = require('./modules/auth/auth.routes');
const menuRoutes      = require('./modules/menu/menu.routes');
const orderRoutes     = require('./modules/orders/order.routes');
const userRoutes      = require('./modules/users/user.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const branchRoutes    = require('./modules/branches/branch.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const reportRoutes    = require('./modules/reports/report.routes');
const auditLogRoutes  = require('./modules/auditLogs/auditLog.routes');
const errorMiddleware = require('./middleware/error.middleware');

const app = express();

// ── Core Middleware ───────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Serve Menu Images ─────────────────────────────────
app.use('/images', express.static(path.join(__dirname, '..', 'images')))


// ── Inject Socket.IO into req (set by server.js) ──────
app.use((req, res, next) => {
  req.io = app.get('io');
  next();
});

// ── Health Check ──────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Sisigan Restaurant POS API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/menu',      menuRoutes);
app.use('/api/orders',    orderRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/branches',  branchRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit-logs', auditLogRoutes);

// ── 404 Handler ───────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.url} not found.` });
});

// ── Global Error Handler ──────────────────────────────
app.use(errorMiddleware);

module.exports = app;
