// server.js
// Entry point — starts Express + Socket.IO server with database connection handling

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');

const app = require('./src/app');
const prisma = require('./src/config/db');
const { initSocket } = require('./src/socket/orderSocket');
const { startInventoryDailyDeductionJob } = require('./src/jobs/inventory.cron');

const PORT = process.env.PORT || 3000;

// ── Create HTTP + WebSocket Server ───────────────────
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

// Pass io instance to Express (used in controllers)
app.set('io', io);

// Initialize socket event handlers
initSocket(io);
startInventoryDailyDeductionJob();

// ── Start Server ──────────────────────────────────────
httpServer.listen(PORT, async () => {
  const dbInfo = prisma.getSanitizedInfo();

  console.log('\n🍖 ==========================================');
  console.log('   Sisigan Restaurant POS API');
  console.log('   ==========================================');
  console.log(`   HTTP:       http://localhost:${PORT}`);
  console.log(`   Health:     http://localhost:${PORT}/health`);
  console.log(`   DB Diag:    http://localhost:${PORT}/health/db`);
  console.log(`   Env:        ${process.env.NODE_ENV || 'development'}`);
  console.log(`   DB Target:  ${dbInfo.configured ? `${dbInfo.host}:${dbInfo.port}/${dbInfo.database} (user: ${dbInfo.user})` : 'NOT CONFIGURED'}`);
  console.log('   ==========================================\n');

  // Asynchronous database preflight check
  try {
    const diag = await prisma.diagnose();
    if (diag.ok) {
      console.log(`✅ [Database] ${diag.message}`);
    } else {
      console.error(`⚠️ [Database Warning] [${diag.status}] ${diag.message}`);
    }
  } catch (err) {
    console.error(`❌ [Database Error] Unexpected connection failure: ${err.message}`);
  }
});

// ── Graceful Shutdown ─────────────────────────────────
async function shutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

  // Close HTTP and WebSocket server
  httpServer.close(() => {
    console.log('   ✓ HTTP server closed.');
  });

  // Disconnect Prisma client to release database connection pool
  try {
    await prisma.$disconnect();
    console.log('   ✓ Database connections released.');
  } catch (e) {
    console.error('   ⚠️ Error releasing database connections:', e.message);
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
